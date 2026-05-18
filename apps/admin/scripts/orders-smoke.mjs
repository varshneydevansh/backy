#!/usr/bin/env node

import { spawn } from 'node:child_process';
import { createHmac } from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
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
const ORDER_REQUIRED_FIELD_COUNT = 57;
const STRIPE_TAX_MOCK_PORT = Number(process.env.BACKY_STRIPE_TAX_MOCK_PORT || 45679);
const STRIPE_TAX_MOCK_BASE_URL = `http://127.0.0.1:${STRIPE_TAX_MOCK_PORT}`;
const TAXJAR_MOCK_PORT = Number(process.env.BACKY_TAXJAR_MOCK_PORT || 45689);
const TAXJAR_MOCK_BASE_URL = `http://127.0.0.1:${TAXJAR_MOCK_PORT}/v2`;
const AVALARA_MOCK_PORT = Number(process.env.BACKY_AVALARA_MOCK_PORT || 45690);
const AVALARA_MOCK_BASE_URL = `http://127.0.0.1:${AVALARA_MOCK_PORT}`;
const STRIPE_REFUND_MOCK_PORT = Number(process.env.BACKY_STRIPE_REFUND_MOCK_PORT || 45680);
const STRIPE_REFUND_MOCK_BASE_URL = `http://127.0.0.1:${STRIPE_REFUND_MOCK_PORT}`;
const PAYPAL_REFUND_MOCK_PORT = Number(process.env.BACKY_PAYPAL_REFUND_MOCK_PORT || 45685);
const PAYPAL_REFUND_MOCK_BASE_URL = `http://127.0.0.1:${PAYPAL_REFUND_MOCK_PORT}`;
const PADDLE_REFUND_MOCK_PORT = Number(process.env.BACKY_PADDLE_REFUND_MOCK_PORT || 45692);
const PADDLE_REFUND_MOCK_BASE_URL = `http://127.0.0.1:${PADDLE_REFUND_MOCK_PORT}`;
const SQUARE_REFUND_MOCK_PORT = Number(process.env.BACKY_SQUARE_REFUND_MOCK_PORT || 45686);
const SQUARE_REFUND_MOCK_BASE_URL = `http://127.0.0.1:${SQUARE_REFUND_MOCK_PORT}`;
const ADYEN_REFUND_MOCK_PORT = Number(process.env.BACKY_ADYEN_REFUND_MOCK_PORT || 45687);
const ADYEN_REFUND_MOCK_BASE_URL = `http://127.0.0.1:${ADYEN_REFUND_MOCK_PORT}`;
const MOLLIE_REFUND_MOCK_PORT = Number(process.env.BACKY_MOLLIE_REFUND_MOCK_PORT || 45688);
const MOLLIE_REFUND_MOCK_BASE_URL = `http://127.0.0.1:${MOLLIE_REFUND_MOCK_PORT}`;
const RAZORPAY_REFUND_MOCK_PORT = Number(process.env.BACKY_RAZORPAY_REFUND_MOCK_PORT || 45691);
const RAZORPAY_REFUND_MOCK_BASE_URL = `http://127.0.0.1:${RAZORPAY_REFUND_MOCK_PORT}`;
const EASYPOST_MOCK_PORT = Number(process.env.BACKY_EASYPOST_MOCK_PORT || 45681);
const EASYPOST_MOCK_BASE_URL = `http://127.0.0.1:${EASYPOST_MOCK_PORT}/v2`;
const SHIPPO_MOCK_PORT = Number(process.env.BACKY_SHIPPO_MOCK_PORT || 45682);
const SHIPPO_MOCK_BASE_URL = `http://127.0.0.1:${SHIPPO_MOCK_PORT}`;
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
  assert(source.includes("import { EmptyState } from '@/components/ui/EmptyState';"), 'Orders route must use the shared EmptyState component');
  assert(source.includes('title="No order source data yet"'), 'Orders source analytics empty state must keep the shared title visible');
  assert(source.includes('Checkout, admin-created, and provider-imported order sources will appear here after analytics records revenue by source.'), 'Orders source analytics empty state must explain when data appears');
  assert(source.includes("emptyTitle: 'No payment provider data yet'"), 'Orders payment-provider analytics empty state must keep the shared title visible');
  assert(source.includes("emptyTitle: 'No provider refund data yet'"), 'Orders refund-provider analytics empty state must keep the shared title visible');
  assert(source.includes("emptyTitle: 'No fulfillment dispatch data yet'"), 'Orders fulfillment-provider analytics empty state must keep the shared title visible');
  assert(source.includes("emptyTitle: 'No shipping-label data yet'"), 'Orders shipping-label analytics empty state must keep the shared title visible');
  assert(source.includes('title={group.emptyTitle}') && source.includes('description={group.emptyDescription}'), 'Orders provider analytics empty states must render through the shared EmptyState component');
  assert(source.includes('title="No order notification events"'), 'Orders notification delivery empty state must keep the shared title visible');
  assert(source.includes("title={orders.length === 0 ? 'No orders yet' : 'No orders match this view'}"), 'Orders list empty state must keep the shared dynamic title visible');
  assert(source.includes('title="No customer profiles linked yet"'), 'Orders customer profile manager must keep the shared empty-state title visible');
  assert(source.includes('Customer profiles are created by checkout intake or contact promotion, then linked by customer ID or email.'), 'Orders customer profile empty state must explain checkout/contact promotion linking');
  assert(source.includes('title="No line items yet"'), 'Orders line-item empty state must keep the shared title visible');
  assert(source.includes('failedResults'), 'Orders bulk workflow must collect failed per-order updates');
  assert(source.includes('updatedOrders.length === 0'), 'Orders bulk workflow must distinguish total failure from partial success');
  assert(source.includes('could not be updated'), 'Orders bulk workflow must report partial failures to admins');
  assert(!source.includes('const updatedOrders = await Promise.all(selectedOrders.map((order) => ('), 'Orders bulk workflow must not collapse all selected updates into one generic Promise.all failure');
  assert(source.includes('providerAnalytics: orderAnalytics?.providerOperations || null'), 'Orders handoff manifest must expose provider analytics for custom admin frontends');
  assert(source.includes('apiContracts: ORDER_API_CONTRACTS.map'), 'Orders handoff manifest must expose API response contracts for custom admin frontends');
  assert(source.includes('data-testid="orders-provider-certification"'), 'Orders page must render the live provider certification handoff');
  assert(
    source.includes('data-testid="orders-provider-certification-download-button"') &&
      source.includes('data-testid="orders-provider-certification-copy-button"') &&
      source.includes('providerCertificationHandoffText') &&
      source.includes('orderEvidence') &&
      source.includes('endpointEvidence') &&
      source.includes('providerReadinessEvidence') &&
      source.includes('-backy-orders-provider-certification.json') &&
      source.includes('Orders provider certification handoff downloaded.'),
    'Orders page must expose a focused provider certification JSON export',
  );
  assert(
    source.includes('providerCertification') &&
      source.includes("schemaVersion: 'backy.commerce-provider-certification-handoff.v1'") &&
      source.includes("requiredFor: 'live-commerce-provider-launch'") &&
      source.includes('ci:commerce-provider-smoke') &&
      source.includes('ci:commerce-provider-certification') &&
      source.includes('requiredInputs'),
    'Orders handoff manifest must expose mock and live provider certification gates',
  );
  for (const providerLabel of [
    'Schema',
    'Stripe webhooks',
    'TaxJar',
    'Avalara',
    'EasyPost labels',
    'Shippo tracking',
    'PayPal refunds',
    'Paddle refunds',
    'Square refunds',
    'Adyen refunds',
    'Mollie refunds',
    'Razorpay refunds',
    'BACKY_STRIPE_SECRET_KEY or STRIPE_SECRET_KEY',
    'BACKY_COMMERCE_WEBHOOK_SECRET or COMMERCE_WEBHOOK_SECRET',
    'BACKY_COMMERCE_TAX_PROVIDER_URL or COMMERCE_TAX_PROVIDER_URL',
    'BACKY_COMMERCE_SHIPPING_PROVIDER_URL or COMMERCE_SHIPPING_PROVIDER_URL',
    'BACKY_EASYPOST_API_KEY or EASYPOST_API_KEY',
    'BACKY_SHIPPO_API_KEY or SHIPPO_API_KEY',
    'Required inputs',
  ]) {
    assert(source.includes(providerLabel), `Orders certification handoff must name ${providerLabel}`);
  }
  for (const schemaVersion of [
    'backy.order-analytics.v1',
    'backy.order-quote.v1',
    'backy.shipping-label.v1',
    'backy.fulfillment-dispatch.v1',
    'backy.tracking.v1',
    'backy.provider-refund.v1',
    'backy.commerce-webhook.v1',
    'backy.commerce-reconciliation.v1',
    'backy.commerce-reconciliation-batch.v1',
    'backy.commerce-reconciliation-readiness.v1',
  ]) {
    assert(source.includes(schemaVersion), `Orders API contract handoff must include ${schemaVersion}`);
  }
  const apiSource = fs.readFileSync(new URL('../src/lib/adminContentApi.ts', import.meta.url), 'utf8');
  assert(
    apiSource.includes("provider: 'http' | 'stripe' | 'taxjar' | 'avalara' | 'easypost' | 'shippo'"),
    'Admin order quote type must expose every first-class quote provider adjustment',
  );
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

const createQuoteProviderServer = async () => {
  const requests = [];
  const server = http.createServer((request, response) => {
    const chunks = [];
    request.on('data', (chunk) => chunks.push(chunk));
    request.on('end', () => {
      const bodyText = Buffer.concat(chunks).toString('utf8');
      const body = bodyText ? JSON.parse(bodyText) : {};
      requests.push({
        url: request.url,
        headers: request.headers,
        body,
      });
      const kind = body.kind || new URL(request.url || '/', 'http://orders-smoke.local').pathname.replace(/^\/+/, '');
      const payload = kind === 'tax'
        ? { taxAmount: 12.34, lines: [{ provider: 'orders-smoke-tax', amount: 12.34, jurisdiction: 'CA' }], reference: 'tax-smoke-quote' }
        : kind === 'shipping'
          ? { shippingAmount: 7.89, lines: [{ provider: 'orders-smoke-shipping', amount: 7.89, service: 'ground' }], reference: 'ship-smoke-quote' }
          : { discountAmount: 6.54, lines: [{ provider: 'orders-smoke-discount', amount: 6.54, code: 'SMOKE' }], reference: 'discount-smoke-quote' };
      response.writeHead(200, { 'content-type': 'application/json' });
      response.end(JSON.stringify(payload));
    });
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  const baseUrl = `http://127.0.0.1:${address.port}`;
  return {
    baseUrl,
    requests,
    close: () => new Promise((resolve) => server.close(resolve)),
  };
};

const createFulfillmentProviderServer = async () => {
  const requests = [];
  const server = http.createServer((request, response) => {
    const chunks = [];
    request.on('data', (chunk) => chunks.push(chunk));
    request.on('end', () => {
      const bodyText = Buffer.concat(chunks).toString('utf8');
      const body = bodyText ? JSON.parse(bodyText) : {};
      requests.push({
        url: request.url,
        headers: request.headers,
        body,
      });
      response.writeHead(200, { 'content-type': 'application/json' });
      response.end(JSON.stringify({
        id: `ful_http_smoke_${requests.length}`,
        status: 'requested',
        provider: 'orders-smoke-warehouse',
        reference: `warehouse-${requests.length}`,
        trackingNumber: `WHSMOKE${requests.length}`,
        trackingUrl: `https://warehouse.example.test/track/WHSMOKE${requests.length}`,
      }));
    });
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  const baseUrl = `http://127.0.0.1:${address.port}`;
  return {
    baseUrl,
    requests,
    close: () => new Promise((resolve) => server.close(resolve)),
  };
};

const stripeTaxExecutionEnabled = () => {
  const secret = process.env.BACKY_STRIPE_SECRET_KEY || process.env.STRIPE_SECRET_KEY || '';
  const apiBaseUrl = process.env.BACKY_STRIPE_TAX_API_BASE_URL || process.env.BACKY_STRIPE_API_BASE_URL || process.env.STRIPE_API_BASE_URL || '';
  return Boolean(secret && apiBaseUrl === STRIPE_TAX_MOCK_BASE_URL);
};

const stripeDiscountExecutionEnabled = () => {
  const secret = process.env.BACKY_STRIPE_SECRET_KEY || process.env.STRIPE_SECRET_KEY || '';
  const apiBaseUrl = process.env.BACKY_STRIPE_DISCOUNT_API_BASE_URL || process.env.BACKY_STRIPE_API_BASE_URL || process.env.STRIPE_API_BASE_URL || '';
  return Boolean(secret && apiBaseUrl === STRIPE_TAX_MOCK_BASE_URL);
};

const taxJarExecutionEnabled = () => {
  const secret = process.env.BACKY_TAXJAR_API_KEY || process.env.TAXJAR_API_KEY || '';
  const apiBaseUrl = process.env.BACKY_TAXJAR_API_BASE_URL || process.env.TAXJAR_API_BASE_URL || '';
  return Boolean(secret && apiBaseUrl === TAXJAR_MOCK_BASE_URL);
};

const createTaxJarMockServer = async () => {
  const requests = [];
  const server = http.createServer((request, response) => {
    const chunks = [];
    request.on('data', (chunk) => chunks.push(chunk));
    request.on('end', () => {
      const bodyText = Buffer.concat(chunks).toString('utf8');
      const body = bodyText ? JSON.parse(bodyText) : {};
      requests.push({
        method: request.method,
        url: request.url,
        headers: request.headers,
        body,
      });
      if (request.method === 'POST' && request.url === '/v2/taxes') {
        response.writeHead(200, { 'content-type': 'application/json' });
        response.end(JSON.stringify({
          tax: {
            order_total_amount: body.amount,
            shipping: body.shipping,
            taxable_amount: 80,
            amount_to_collect: 10.12,
            rate: 0.1265,
            has_nexus: true,
            tax_source: 'destination',
            breakdown: {
              line_items: [{
                id: body.line_items?.[0]?.id || 'orders-smoke-line',
                taxable_amount: 80,
                tax_collectable: 10.12,
                combined_tax_rate: 0.1265,
              }],
            },
          },
        }));
        return;
      }
      response.writeHead(404, { 'content-type': 'application/json' });
      response.end(JSON.stringify({ error: `Unhandled TaxJar mock path ${request.method} ${request.url}` }));
    });
  });
  await new Promise((resolve) => server.listen(TAXJAR_MOCK_PORT, '127.0.0.1', resolve));
  return {
    requests,
    close: () => new Promise((resolve) => server.close(resolve)),
  };
};

const avalaraExecutionEnabled = () => {
  const accountId = process.env.BACKY_AVALARA_ACCOUNT_ID || process.env.AVALARA_ACCOUNT_ID || '';
  const licenseKey = process.env.BACKY_AVALARA_LICENSE_KEY || process.env.AVALARA_LICENSE_KEY || '';
  const companyCode = process.env.BACKY_AVALARA_COMPANY_CODE || process.env.AVALARA_COMPANY_CODE || '';
  const apiBaseUrl = process.env.BACKY_AVALARA_API_BASE_URL || process.env.AVALARA_API_BASE_URL || '';
  return Boolean(accountId && licenseKey && companyCode && apiBaseUrl === AVALARA_MOCK_BASE_URL);
};

const createAvalaraMockServer = async () => {
  const requests = [];
  const server = http.createServer((request, response) => {
    const chunks = [];
    request.on('data', (chunk) => chunks.push(chunk));
    request.on('end', () => {
      const bodyText = Buffer.concat(chunks).toString('utf8');
      const body = bodyText ? JSON.parse(bodyText) : {};
      requests.push({
        method: request.method,
        url: request.url,
        headers: request.headers,
        body,
      });
      if (request.method === 'POST' && request.url === '/api/v2/transactions/create') {
        response.writeHead(200, { 'content-type': 'application/json' });
        response.end(JSON.stringify({
          id: 123,
          code: body.code || 'backy-smoke',
          totalAmount: body.lines?.reduce((sum, line) => sum + Number(line.amount || 0), 0) || 80,
          totalTax: 10.45,
          totalTaxCalculated: 10.45,
          lines: [{
            lineNumber: body.lines?.[0]?.number || 'line-1',
            itemCode: body.lines?.[0]?.itemCode || 'orders-smoke-line',
            taxableAmount: 80,
            taxCalculated: 10.45,
            rate: 0.130625,
          }],
        }));
        return;
      }
      response.writeHead(404, { 'content-type': 'application/json' });
      response.end(JSON.stringify({ error: { message: `Unhandled Avalara mock path ${request.method} ${request.url}` } }));
    });
  });
  await new Promise((resolve) => server.listen(AVALARA_MOCK_PORT, '127.0.0.1', resolve));
  return {
    requests,
    close: () => new Promise((resolve) => server.close(resolve)),
  };
};

const createStripeTaxMockServer = async () => {
  const requests = [];
  const server = http.createServer((request, response) => {
    const chunks = [];
    request.on('data', (chunk) => chunks.push(chunk));
    request.on('end', () => {
      const bodyText = Buffer.concat(chunks).toString('utf8');
      const url = new URL(request.url || '/', STRIPE_TAX_MOCK_BASE_URL);
      if (request.method === 'GET' && url.pathname === '/v1/promotion_codes') {
        requests.push({
          method: request.method,
          url: url.pathname,
          search: Object.fromEntries(url.searchParams.entries()),
          headers: request.headers,
        });
        response.writeHead(200, { 'content-type': 'application/json' });
        response.end(JSON.stringify({
          object: 'list',
          data: [{
            id: `promo_smoke_${requests.length}`,
            object: 'promotion_code',
            active: true,
            code: url.searchParams.get('code') || 'STRIPESMOKE',
            coupon: {
              id: `coupon_smoke_${requests.length}`,
              object: 'coupon',
              valid: true,
              percent_off: 10,
            },
            restrictions: {},
          }],
        }));
        return;
      }
      const form = Object.fromEntries(new URLSearchParams(bodyText).entries());
      requests.push({
        method: request.method,
        url: url.pathname,
        headers: request.headers,
        form,
      });
      response.writeHead(200, { 'content-type': 'application/json' });
      response.end(JSON.stringify({
        id: `taxcalc_smoke_${requests.length}`,
        object: 'tax.calculation',
        currency: form.currency || 'usd',
        amount_total: 9111,
        tax_amount_exclusive: 1111,
        line_items: {
          data: [{
            id: `tax_li_smoke_${requests.length}`,
            reference: form['line_items[0][reference]'] || 'orders-smoke-line',
            amount: form['line_items[0][amount]'] || 8000,
            amount_tax: 1111,
          }],
        },
      }));
    });
  });
  await new Promise((resolve) => server.listen(STRIPE_TAX_MOCK_PORT, '127.0.0.1', resolve));
  return {
    requests,
    close: () => new Promise((resolve) => server.close(resolve)),
  };
};

const stripeRefundExecutionEnabled = () => {
  const secret = process.env.BACKY_STRIPE_SECRET_KEY || process.env.STRIPE_SECRET_KEY || '';
  const apiBaseUrl = process.env.BACKY_STRIPE_REFUND_API_BASE_URL || process.env.BACKY_STRIPE_API_BASE_URL || process.env.STRIPE_API_BASE_URL || '';
  return Boolean(secret && apiBaseUrl === STRIPE_REFUND_MOCK_BASE_URL);
};

const createStripeRefundMockServer = async () => {
  const requests = [];
  const server = http.createServer((request, response) => {
    const chunks = [];
    request.on('data', (chunk) => chunks.push(chunk));
    request.on('end', () => {
      const bodyText = Buffer.concat(chunks).toString('utf8');
      const form = Object.fromEntries(new URLSearchParams(bodyText).entries());
      requests.push({
        method: request.method,
        url: request.url,
        headers: request.headers,
        form,
      });
      response.writeHead(200, { 'content-type': 'application/json' });
      if (request.method === 'GET') {
        response.end(JSON.stringify({
          id: String(request.url || '').split('/').pop() || `re_smoke_${requests.length}`,
          object: 'refund',
          status: 'succeeded',
          amount: 1234,
          currency: 'usd',
          payment_intent: `pi_refund_refresh_${Date.now()}`,
          charge: '',
          reason: 'requested_by_customer',
          created: 1710000000 + requests.length,
        }));
        return;
      }
      response.end(JSON.stringify({
        id: `re_smoke_${requests.length}`,
        object: 'refund',
        status: 'succeeded',
        amount: Number(form.amount || 0),
        currency: 'usd',
        payment_intent: form.payment_intent || '',
        charge: form.charge || '',
        reason: form.reason || '',
        created: 1710000000 + requests.length,
      }));
    });
  });
  await new Promise((resolve) => server.listen(STRIPE_REFUND_MOCK_PORT, '127.0.0.1', resolve));
  return {
    requests,
    close: () => new Promise((resolve) => server.close(resolve)),
  };
};

const paypalRefundExecutionEnabled = () => {
  const token = process.env.BACKY_PAYPAL_ACCESS_TOKEN || process.env.PAYPAL_ACCESS_TOKEN || '';
  const apiBaseUrl = process.env.BACKY_PAYPAL_API_BASE_URL || process.env.PAYPAL_API_BASE_URL || '';
  return Boolean(token && apiBaseUrl === PAYPAL_REFUND_MOCK_BASE_URL);
};

const createPayPalRefundMockServer = async () => {
  const requests = [];
  const server = http.createServer((request, response) => {
    const chunks = [];
    request.on('data', (chunk) => chunks.push(chunk));
    request.on('end', () => {
      const bodyText = Buffer.concat(chunks).toString('utf8');
      const body = bodyText ? JSON.parse(bodyText) : {};
      requests.push({
        method: request.method,
        url: request.url,
        headers: request.headers,
        body,
      });
      response.writeHead(200, { 'content-type': 'application/json' });
      if (request.method === 'GET') {
        const refundId = String(request.url || '').split('/').pop() || `paypal_refund_smoke_${requests.length}`;
        response.end(JSON.stringify({
          id: refundId,
          status: 'COMPLETED',
          amount: { value: '12.34', currency_code: 'USD' },
          invoice_id: '',
          custom_id: '',
          update_time: '2026-05-16T00:00:05Z',
          links: [{
            href: `https://api.paypal.test/v2/payments/refunds/${refundId}`,
            rel: 'self',
            method: 'GET',
          }],
        }));
        return;
      }
      response.end(JSON.stringify({
        id: `paypal_refund_smoke_${requests.length}`,
        status: 'COMPLETED',
        amount: body.amount || {},
        invoice_id: body.invoice_id || '',
        custom_id: body.custom_id || '',
        update_time: '2026-05-16T00:00:00Z',
        links: [{
          href: `https://api.paypal.test/v2/payments/refunds/paypal_refund_smoke_${requests.length}`,
          rel: 'self',
          method: 'GET',
        }],
      }));
    });
  });
  await new Promise((resolve) => server.listen(PAYPAL_REFUND_MOCK_PORT, '127.0.0.1', resolve));
  return {
    requests,
    close: () => new Promise((resolve) => server.close(resolve)),
  };
};

const paddleRefundExecutionEnabled = () => {
  const key = process.env.BACKY_PADDLE_API_KEY || process.env.PADDLE_API_KEY || '';
  const apiBaseUrl = process.env.BACKY_PADDLE_API_BASE_URL || process.env.PADDLE_API_BASE_URL || '';
  return Boolean(key && apiBaseUrl === PADDLE_REFUND_MOCK_BASE_URL);
};

const createPaddleRefundMockServer = async () => {
  const requests = [];
  const server = http.createServer((request, response) => {
    const chunks = [];
    request.on('data', (chunk) => chunks.push(chunk));
    request.on('end', () => {
      const bodyText = Buffer.concat(chunks).toString('utf8');
      const body = bodyText ? JSON.parse(bodyText) : {};
      requests.push({
        method: request.method,
        url: request.url,
        headers: request.headers,
        body,
      });
      response.writeHead(request.method === 'GET' ? 200 : 201, { 'content-type': 'application/json' });
      if (request.method === 'GET') {
        const adjustmentUrl = new URL(request.url || '/adjustments', PADDLE_REFUND_MOCK_BASE_URL);
        const adjustmentId = adjustmentUrl.searchParams.get('id') || `adj_paddle_smoke_${requests.length}`;
        response.end(JSON.stringify({
          data: [{
            id: adjustmentId,
            action: 'refund',
            type: 'full',
            status: 'approved',
            transaction_id: `txn_paddle_refresh_${Date.now()}`,
            reason: 'refresh',
            created_at: '2026-05-16T00:00:00Z',
            updated_at: '2026-05-16T00:00:05Z',
          }],
        }));
        return;
      }
      response.end(JSON.stringify({
        data: {
          id: `adj_paddle_smoke_${requests.length}`,
          action: body.action || '',
          type: body.type || '',
          status: 'approved',
          transaction_id: body.transaction_id || '',
          reason: body.reason || '',
          created_at: '2026-05-16T00:00:00Z',
          updated_at: '2026-05-16T00:00:01Z',
        },
      }));
    });
  });
  await new Promise((resolve) => server.listen(PADDLE_REFUND_MOCK_PORT, '127.0.0.1', resolve));
  return {
    requests,
    close: () => new Promise((resolve) => server.close(resolve)),
  };
};

const squareRefundExecutionEnabled = () => {
  const token = process.env.BACKY_SQUARE_ACCESS_TOKEN || process.env.SQUARE_ACCESS_TOKEN || '';
  const apiBaseUrl = process.env.BACKY_SQUARE_API_BASE_URL || process.env.SQUARE_API_BASE_URL || '';
  return Boolean(token && apiBaseUrl === SQUARE_REFUND_MOCK_BASE_URL);
};

const createSquareRefundMockServer = async () => {
  const requests = [];
  const server = http.createServer((request, response) => {
    const chunks = [];
    request.on('data', (chunk) => chunks.push(chunk));
    request.on('end', () => {
      const bodyText = Buffer.concat(chunks).toString('utf8');
      const body = bodyText ? JSON.parse(bodyText) : {};
      requests.push({
        method: request.method,
        url: request.url,
        headers: request.headers,
        body,
      });
      response.writeHead(200, { 'content-type': 'application/json' });
      if (request.method === 'GET') {
        const refundId = String(request.url || '').split('/').pop() || `sq_refund_smoke_${requests.length}`;
        response.end(JSON.stringify({
          refund: {
            id: refundId,
            status: 'COMPLETED',
            amount_money: { amount: 1234, currency: 'USD' },
            payment_id: `sq_payment_refresh_${Date.now()}`,
            order_id: `sq_order_smoke_${requests.length}`,
            reason: 'refresh',
            created_at: '2026-05-16T00:00:00Z',
            updated_at: '2026-05-16T00:00:05Z',
          },
        }));
        return;
      }
      response.end(JSON.stringify({
        refund: {
          id: `sq_refund_smoke_${requests.length}`,
          status: 'COMPLETED',
          amount_money: body.amount_money || {},
          payment_id: body.payment_id || '',
          order_id: `sq_order_smoke_${requests.length}`,
          reason: body.reason || '',
          created_at: '2026-05-16T00:00:00Z',
          updated_at: '2026-05-16T00:00:01Z',
        },
      }));
    });
  });
  await new Promise((resolve) => server.listen(SQUARE_REFUND_MOCK_PORT, '127.0.0.1', resolve));
  return {
    requests,
    close: () => new Promise((resolve) => server.close(resolve)),
  };
};

const adyenRefundExecutionEnabled = () => {
  const key = process.env.BACKY_ADYEN_API_KEY || process.env.ADYEN_API_KEY || '';
  const merchantAccount = process.env.BACKY_ADYEN_MERCHANT_ACCOUNT || process.env.ADYEN_MERCHANT_ACCOUNT || '';
  const apiBaseUrl = process.env.BACKY_ADYEN_API_BASE_URL || process.env.ADYEN_API_BASE_URL || '';
  return Boolean(key && merchantAccount && apiBaseUrl === ADYEN_REFUND_MOCK_BASE_URL);
};

const createAdyenRefundMockServer = async () => {
  const requests = [];
  const server = http.createServer((request, response) => {
    const chunks = [];
    request.on('data', (chunk) => chunks.push(chunk));
    request.on('end', () => {
      const bodyText = Buffer.concat(chunks).toString('utf8');
      const body = bodyText ? JSON.parse(bodyText) : {};
      requests.push({
        method: request.method,
        url: request.url,
        headers: request.headers,
        body,
      });
      response.writeHead(200, { 'content-type': 'application/json' });
      response.end(JSON.stringify({
        merchantAccount: body.merchantAccount || '',
        paymentPspReference: String(request.url || '').split('/')[2] || '',
        pspReference: `adyen_refund_smoke_${requests.length}`,
        reference: body.reference || '',
        status: 'received',
      }));
    });
  });
  await new Promise((resolve) => server.listen(ADYEN_REFUND_MOCK_PORT, '127.0.0.1', resolve));
  return {
    requests,
    close: () => new Promise((resolve) => server.close(resolve)),
  };
};

const mollieRefundExecutionEnabled = () => {
  const key = process.env.BACKY_MOLLIE_API_KEY || process.env.MOLLIE_API_KEY || '';
  const apiBaseUrl = process.env.BACKY_MOLLIE_API_BASE_URL || process.env.MOLLIE_API_BASE_URL || '';
  return Boolean(key && apiBaseUrl === MOLLIE_REFUND_MOCK_BASE_URL);
};

const createMollieRefundMockServer = async () => {
  const requests = [];
  const server = http.createServer((request, response) => {
    const chunks = [];
    request.on('data', (chunk) => chunks.push(chunk));
    request.on('end', () => {
      const bodyText = Buffer.concat(chunks).toString('utf8');
      const body = bodyText ? JSON.parse(bodyText) : {};
      requests.push({
        method: request.method,
        url: request.url,
        headers: request.headers,
        body,
      });
      response.writeHead(request.method === 'GET' ? 200 : 201, { 'content-type': 'application/json' });
      if (request.method === 'GET') {
        response.end(JSON.stringify({
          id: String(request.url || '').split('/').pop() || `re_mollie_smoke_${requests.length}`,
          status: 'refunded',
          amount: { value: '12.34', currency: 'USD' },
          paymentId: String(request.url || '').split('/')[3] || '',
          description: 'refresh',
          createdAt: '2026-05-16T00:00:05+00:00',
        }));
        return;
      }
      response.end(JSON.stringify({
        id: `re_mollie_smoke_${requests.length}`,
        status: 'refunded',
        amount: body.amount || {},
        paymentId: String(request.url || '').split('/')[3] || '',
        description: body.description || '',
        createdAt: '2026-05-16T00:00:00+00:00',
      }));
    });
  });
  await new Promise((resolve) => server.listen(MOLLIE_REFUND_MOCK_PORT, '127.0.0.1', resolve));
  return {
    requests,
    close: () => new Promise((resolve) => server.close(resolve)),
  };
};

const razorpayRefundExecutionEnabled = () => {
  const keyId = process.env.BACKY_RAZORPAY_KEY_ID || process.env.RAZORPAY_KEY_ID || '';
  const keySecret = process.env.BACKY_RAZORPAY_KEY_SECRET || process.env.RAZORPAY_KEY_SECRET || '';
  const apiBaseUrl = process.env.BACKY_RAZORPAY_API_BASE_URL || process.env.RAZORPAY_API_BASE_URL || '';
  return Boolean(keyId && keySecret && apiBaseUrl === RAZORPAY_REFUND_MOCK_BASE_URL);
};

const createRazorpayRefundMockServer = async () => {
  const requests = [];
  const server = http.createServer((request, response) => {
    const chunks = [];
    request.on('data', (chunk) => chunks.push(chunk));
    request.on('end', () => {
      const bodyText = Buffer.concat(chunks).toString('utf8');
      const body = bodyText ? JSON.parse(bodyText) : {};
      requests.push({
        method: request.method,
        url: request.url,
        headers: request.headers,
        body,
      });
      response.writeHead(200, { 'content-type': 'application/json' });
      if (request.method === 'GET') {
        response.end(JSON.stringify({
          id: String(request.url || '').split('/').pop() || `rfnd_razorpay_smoke_${requests.length}`,
          entity: 'refund',
          payment_id: `pay_refresh_${Date.now()}`,
          amount: 1234,
          currency: 'INR',
          status: 'processed',
          speed_processed: 'normal',
          speed_requested: 'normal',
          receipt: 'refresh',
          notes: {},
          created_at: 1710000000 + requests.length,
        }));
        return;
      }
      response.end(JSON.stringify({
        id: `rfnd_razorpay_smoke_${requests.length}`,
        entity: 'refund',
        payment_id: String(request.url || '').split('/')[3] || '',
        amount: body.amount || 0,
        currency: 'INR',
        status: 'created',
        speed_processed: 'normal',
        speed_requested: body.speed || 'normal',
        receipt: body.receipt || '',
        notes: body.notes || {},
        created_at: 1710000000 + requests.length,
      }));
    });
  });
  await new Promise((resolve) => server.listen(RAZORPAY_REFUND_MOCK_PORT, '127.0.0.1', resolve));
  return {
    requests,
    close: () => new Promise((resolve) => server.close(resolve)),
  };
};

const easyPostExecutionEnabled = () => {
  const secret = process.env.BACKY_EASYPOST_API_KEY || process.env.EASYPOST_API_KEY || '';
  const apiBaseUrl = process.env.BACKY_EASYPOST_API_BASE_URL || process.env.EASYPOST_API_BASE_URL || '';
  return Boolean(secret && apiBaseUrl === EASYPOST_MOCK_BASE_URL);
};

const createEasyPostMockServer = async () => {
  const requests = [];
  const server = http.createServer((request, response) => {
    const chunks = [];
    request.on('data', (chunk) => chunks.push(chunk));
    request.on('end', () => {
      const bodyText = Buffer.concat(chunks).toString('utf8');
      const body = bodyText ? JSON.parse(bodyText) : {};
      requests.push({
        method: request.method,
        url: request.url,
        headers: request.headers,
        body,
      });
      response.writeHead(200, { 'content-type': 'application/json' });
      if (request.method === 'POST' && request.url === '/v2/shipments') {
        response.end(JSON.stringify({
          id: 'shp_smoke_1',
          object: 'Shipment',
          mode: 'test',
          status: 'unknown',
          tracking_code: '',
          rates: [{
            id: 'rate_smoke_ground',
            carrier: 'UPS',
            service: 'Ground',
            rate: '7.25',
          }],
        }));
        return;
      }
      if (request.method === 'POST' && request.url === '/v2/shipments/shp_smoke_1/buy') {
        response.end(JSON.stringify({
          id: 'shp_smoke_1',
          object: 'Shipment',
          mode: 'test',
          status: 'purchased',
          tracking_code: 'EZTRACK1',
          selected_rate: {
            id: 'rate_smoke_ground',
            carrier: 'UPS',
            service: 'Ground',
            rate: '7.25',
          },
          postage_label: {
            id: 'pl_smoke_1',
            label_url: 'https://labels.easypost.test/shp_smoke_1.pdf',
            label_file_type: 'application/pdf',
            label_date: '2026-05-16T00:00:00Z',
          },
        }));
        return;
      }
      if (request.method === 'POST' && request.url === '/v2/shipments/shp_smoke_1/refund') {
        response.end(JSON.stringify({
          id: 'shp_smoke_1',
          object: 'Shipment',
          mode: 'test',
          status: 'purchased',
          refund_status: 'submitted',
          tracking_code: 'EZTRACK1',
          selected_rate: {
            id: 'rate_smoke_ground',
            carrier: 'UPS',
            service: 'Ground',
            rate: '7.25',
          },
          postage_label: {
            id: 'pl_smoke_1',
            label_url: 'https://labels.easypost.test/shp_smoke_1.pdf',
            label_file_type: 'application/pdf',
            label_date: '2026-05-16T00:00:00Z',
          },
        }));
        return;
      }
      if (request.method === 'POST' && request.url === '/v2/trackers') {
        response.end(JSON.stringify({
          id: 'trk_smoke_1',
          object: 'Tracker',
          mode: 'test',
          status: 'delivered',
          carrier: 'UPS',
          tracking_code: body?.tracker?.tracking_code || 'EZTRACK1',
          public_url: 'https://track.easypost.test/EZTRACK1',
          signed_by: 'Backy Smoke',
          est_delivery_date: '2026-05-16',
          created_at: '2026-05-16T00:00:00Z',
          updated_at: '2026-05-16T00:05:00Z',
        }));
        return;
      }
      response.writeHead(404, { 'content-type': 'application/json' });
      response.end(JSON.stringify({ error: { code: 'not_found', message: `Unhandled EasyPost mock path ${request.method} ${request.url}` } }));
    });
  });
  await new Promise((resolve) => server.listen(EASYPOST_MOCK_PORT, '127.0.0.1', resolve));
  return {
    requests,
    close: () => new Promise((resolve) => server.close(resolve)),
  };
};

const shippoExecutionEnabled = () => {
  const secret = process.env.BACKY_SHIPPO_API_KEY || process.env.SHIPPO_API_KEY || '';
  const apiBaseUrl = process.env.BACKY_SHIPPO_API_BASE_URL || process.env.SHIPPO_API_BASE_URL || '';
  return Boolean(secret && apiBaseUrl === SHIPPO_MOCK_BASE_URL);
};

const createShippoMockServer = async () => {
  const requests = [];
  const server = http.createServer((request, response) => {
    const chunks = [];
    request.on('data', (chunk) => chunks.push(chunk));
    request.on('end', () => {
      const bodyText = Buffer.concat(chunks).toString('utf8');
      const body = bodyText ? JSON.parse(bodyText) : {};
      requests.push({
        method: request.method,
        url: request.url,
        headers: request.headers,
        body,
      });
      response.writeHead(200, { 'content-type': 'application/json' });
      if (request.method === 'POST' && request.url === '/shipments/') {
        response.end(JSON.stringify({
          object_id: 'shippo_shipment_smoke_1',
          object_state: 'VALID',
          status: 'SUCCESS',
          test: true,
          rates: [{
            object_id: 'shippo_rate_smoke_priority',
            provider: 'USPS',
            amount: '8.55',
            currency: 'USD',
            servicelevel: {
              token: 'usps_priority',
              name: 'Priority Mail',
            },
          }],
        }));
        return;
      }
      if (request.method === 'POST' && request.url === '/transactions/') {
        response.end(JSON.stringify({
          object_id: 'shippo_tx_smoke_1',
          object_state: 'VALID',
          status: 'SUCCESS',
          test: true,
          label_url: 'https://labels.shippo.test/shippo_tx_smoke_1.pdf',
          tracking_number: 'SHIPPO1',
          tracking_status: 'UNKNOWN',
          tracking_url_provider: 'https://track.shippo.test/SHIPPO1',
        }));
        return;
      }
      if (request.method === 'POST' && request.url === '/refunds/') {
        response.end(JSON.stringify({
          object_id: 'shippo_refund_smoke_1',
          status: 'QUEUED',
          transaction: body.transaction,
        }));
        return;
      }
      if (request.method === 'GET' && request.url?.startsWith('/tracks/USPS/')) {
        const trackingNumber = decodeURIComponent(String(request.url).split('/').pop() || 'SHIPPO1');
        response.end(JSON.stringify({
          carrier: 'USPS',
          tracking_number: trackingNumber,
          eta: '2026-05-16T12:00:00Z',
          servicelevel: {
            token: 'usps_priority',
            name: 'Priority Mail',
          },
          tracking_status: {
            status: 'DELIVERED',
            status_details: 'Delivered to destination address',
            status_date: '2026-05-16T10:00:00Z',
          },
          tracking_history: [{
            status: 'TRANSIT',
            status_details: 'In transit',
            status_date: '2026-05-15T10:00:00Z',
          }],
        }));
        return;
      }
      response.writeHead(404, { 'content-type': 'application/json' });
      response.end(JSON.stringify({ message: `Unhandled Shippo mock path ${request.method} ${request.url}` }));
    });
  });
  await new Promise((resolve) => server.listen(SHIPPO_MOCK_PORT, '127.0.0.1', resolve));
  return {
    requests,
    close: () => new Promise((resolve) => server.close(resolve)),
  };
};

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
      providerWebhookEvents: 'checkout.session.completed,charge.refunded,refund.failed,refund.requires_action,REFUND,REFUND_FAILED,REFUNDED_REVERSED,payment_intent.payment_failed',
      webhookEventsEnabled: true,
      taxEnabled: true,
      shippingEnabled: true,
      discountsEnabled: false,
      taxRatePercent: 10,
      digitalTaxRatePercent: 4,
      shippingBaseAmount: 8,
      shippingWeightRate: 1.25,
      reconciliationMode: 'webhook',
    },
  };
  return patchSettingsFromSnapshot(next);
};

const enableCommerceQuoteProviders = async (settings, providerBaseUrl, options = {}) => {
  const next = JSON.parse(JSON.stringify(settings));
  const taxProvider = options.stripeTax
    ? 'stripe'
    : options.taxJarTax
      ? 'taxjar'
      : options.avalaraTax
        ? 'avalara'
        : 'http';
  const needsStructuredOrigin = options.easyPostShipping || options.shippoShipping || options.taxJarTax || options.avalaraTax;
  next.integrations = {
    ...(next.integrations || {}),
    commerce: {
      ...(next.integrations?.commerce || {}),
      taxEnabled: true,
      shippingEnabled: true,
      discountsEnabled: true,
      taxProvider,
      taxProviderUrl: taxProvider === 'http' ? `${providerBaseUrl}/tax` : '',
      shippingProvider: options.easyPostShipping ? 'easypost' : options.shippoShipping ? 'shippo' : 'http',
      shippingProviderUrl: options.easyPostShipping || options.shippoShipping ? '' : `${providerBaseUrl}/shipping`,
      discountProvider: options.stripeDiscount ? 'stripe' : 'http',
      discountProviderUrl: options.stripeDiscount ? '' : `${providerBaseUrl}/discount`,
      ...(needsStructuredOrigin
        ? {
          shippingOriginAddress: JSON.stringify({
            name: 'Backy Warehouse',
            street1: '100 Fulfillment Way',
            city: 'Austin',
            state: 'TX',
            zip: '78701',
            country: 'US',
            phone: '5555550100',
          }),
          shippingDefaultParcel: JSON.stringify({
            length: 8,
            width: 6,
            height: 2,
            weight: 16,
          }),
        }
        : {}),
    },
  };
  return patchSettingsFromSnapshot(next);
};

const enableCommerceFulfillmentProvider = async (settings, providerBaseUrl) => {
  const next = JSON.parse(JSON.stringify(settings));
  next.integrations = {
    ...(next.integrations || {}),
    commerce: {
      ...(next.integrations?.commerce || {}),
      fulfillmentProvider: 'http',
      fulfillmentProviderUrl: `${providerBaseUrl}/dispatch`,
    },
  };
  return patchSettingsFromSnapshot(next);
};

const enableCommerceEasyPostLabelSettings = async (settings) => {
  const next = JSON.parse(JSON.stringify(settings));
  next.integrations = {
    ...(next.integrations || {}),
    commerce: {
      ...(next.integrations?.commerce || {}),
      shippingLabelProvider: 'easypost',
      shippingOriginAddress: JSON.stringify({
        name: 'Backy Warehouse',
        street1: '100 Fulfillment Way',
        city: 'Austin',
        state: 'TX',
        zip: '78701',
        country: 'US',
        phone: '5555550100',
      }),
      shippingDefaultParcel: JSON.stringify({
        length: 8,
        width: 6,
        height: 2,
        weight: 12,
      }),
      shippingDefaultCarrier: 'UPS',
      shippingDefaultServiceLevel: 'Ground',
      shippingDefaultRateId: 'rate_smoke_ground',
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
  const login = (twoFactorCode) => fetch(`${API_BASE_URL}/api/admin/auth/login`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      email: 'admin@backy.io',
      password: process.env.BACKY_ADMIN_DEMO_PASSWORD || 'admin123',
      ...(twoFactorCode ? { twoFactorCode } : {}),
    }),
  });

  let response = await login();
  let payload = await response.json().catch(() => ({}));
  const smokeMfaCode = process.env.BACKY_ORDERS_SMOKE_MFA_CODE
    || process.env.BACKY_ADMIN_MFA_CODE
    || process.env.BACKY_ADMIN_2FA_CODE;
  if (!response.ok && payload.error?.code === 'MFA_REQUIRED' && smokeMfaCode) {
    response = await login(smokeMfaCode);
    payload = await response.json().catch(() => ({}));
  }

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

const setBrowserSession = async (client, sessionToken) => {
  await client.send('Network.enable');
  await client.send('Network.setCookie', {
    url: API_BASE_URL,
    name: 'backy_admin_session',
    value: sessionToken,
    path: '/',
    httpOnly: true,
    sameSite: 'Lax',
  });
};

const navigateToOrders = async (client, options = {}) => {
  const url = new URL(`${ADMIN_BASE_URL}/orders`);
  url.searchParams.set('siteId', SITE_ID);
  if (options.orderId) {
    url.searchParams.set('orderId', options.orderId);
  }
  const expectedUrl = url.toString();
  await client.send('Page.navigate', { url: url.toString() });

  for (let attempt = 0; attempt < 120; attempt += 1) {
    const state = await evaluate(client, `(() => ({
      url: window.location.href,
      locationReady: window.location.href === ${JSON.stringify(expectedUrl)},
      ready: Boolean(document.querySelector('[data-testid="orders-command-center"]')) &&
        document.body?.innerText?.includes('Order command center'),
      command: Boolean(document.querySelector('[data-testid="orders-command-center"]')),
      text: document.body?.innerText?.slice(0, 600) || '',
    }))()`);

    if (state.locationReady && state.ready) {
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
  let result = null;
  for (let attempt = 0; attempt < 80; attempt += 1) {
    result = await evaluate(client, `(() => {
      const text = ${JSON.stringify(text)};
      const exact = ${JSON.stringify(Boolean(options.exact))};
      const rootSelector = ${JSON.stringify(options.rootSelector || '')};
      const root = rootSelector ? document.querySelector(rootSelector) : document;
      const candidates = Array.from((root || document).querySelectorAll('button, a'));
      const matches = candidates.filter((candidate) => {
        const label = (candidate.textContent || '').replace(/\\s+/g, ' ').trim();
        return exact ? label === text : label.includes(text);
      });
      const target = matches.find((candidate) => (
        candidate instanceof HTMLElement &&
        candidate.getAttribute('aria-disabled') !== 'true' &&
        !candidate.disabled
      ));
      if (!(target instanceof HTMLElement) || target.getAttribute('aria-disabled') === 'true' || target.disabled) {
        return {
          ok: false,
          text,
          matches: matches.length,
          disabledMatches: matches.map((candidate) => candidate instanceof HTMLButtonElement ? candidate.disabled : candidate.getAttribute('aria-disabled') === 'true'),
        };
      }
      target.click();
      return { ok: true, text: target.textContent || '', tag: target.tagName };
    })()`);
    if (result.ok) break;
    await sleep(250);
  }
  assert(result?.ok, `Unable to click control with text ${text}: ${JSON.stringify(result)}`);
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
    const matches = labels.filter((candidate) => {
      const text = labelTextFor(candidate);
      return exact ? text === labelText : text.includes(labelText);
    });
    const label = ${JSON.stringify(Boolean(options.last))} ? matches.at(-1) : matches[0];
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
    const previousValue = control.value;
    setter?.call(control, String(value));
    control._valueTracker?.setValue(previousValue);
    control.dispatchEvent(new InputEvent('input', { bubbles: true, data: String(value), inputType: 'insertText' }));
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

const typeLabeledControl = async (client, labelText, value, options = {}) => {
  const focusResult = await evaluate(client, `(() => {
    const labelText = ${JSON.stringify(labelText)};
    const exact = ${JSON.stringify(Boolean(options.exact))};
    const rootSelector = ${JSON.stringify(options.rootSelector || '#orders-editor')};
    const root = document.querySelector(rootSelector) || document;
    const labels = Array.from(root.querySelectorAll('label'));
    const normalized = (text) => (text || '').replace(/\\s+/g, ' ').trim();
    const labelTextFor = (candidate) => normalized(candidate.querySelector('span')?.textContent || candidate.textContent);
    const matches = labels.filter((candidate) => {
      const text = labelTextFor(candidate);
      return exact ? text === labelText : text.includes(labelText);
    });
    const label = ${JSON.stringify(Boolean(options.last))} ? matches.at(-1) : matches[0];
    const control = label?.querySelector('input, textarea');
    if (!(control instanceof HTMLInputElement || control instanceof HTMLTextAreaElement)) {
      return {
        ok: false,
        reason: 'control-not-found',
        labelText,
        labels: labels.map((candidate) => labelTextFor(candidate)).slice(0, 80),
      };
    }
    if (control.disabled) {
      return { ok: false, reason: 'control-disabled', labelText };
    }
    control.focus();
    control.select();
    return { ok: true, labelText, previous: control.value, tag: control.tagName };
  })()`);
  assert(focusResult.ok, `Unable to focus ${labelText}: ${JSON.stringify(focusResult)}`);

  if (String(value).length > 0) {
    await client.send('Input.insertText', { text: String(value) });
  } else {
    await client.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Backspace', code: 'Backspace', windowsVirtualKeyCode: 8 });
    await client.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Backspace', code: 'Backspace', windowsVirtualKeyCode: 8 });
  }

  const result = await evaluate(client, `(() => {
    const active = document.activeElement;
    active?.dispatchEvent(new Event('change', { bubbles: true }));
    return {
      ok: active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement,
      value: active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement ? active.value : null,
      tag: active?.tagName || null,
    };
  })()`);
  assert(result.ok && result.value === String(value), `Unable to type ${labelText}: ${JSON.stringify(result)}`);
  await sleep(125);
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
      providerAnalyticsPanel: Boolean(document.querySelector('[data-testid="orders-provider-analytics"]')),
      providerAnalyticsLabels: {
        heading: document.body?.innerText?.includes('Provider execution analytics') || false,
        payment: document.body?.innerText?.includes('Payment providers') || false,
        refund: document.body?.innerText?.includes('Refund providers') || false,
        fulfillment: document.body?.innerText?.includes('Fulfillment providers') || false,
        shipping: document.body?.innerText?.includes('Shipping labels') || false,
      },
      providerAnalytics: Boolean(document.querySelector('[data-testid="orders-provider-analytics"]')),
      analyticsError: Array.from(document.querySelectorAll('[data-testid="orders-analytics-panel"] .text-amber-900'))
        .map((node) => (node.textContent || '').replace(/\\s+/g, ' ').trim())
        .filter(Boolean)
        .join(' '),
      refreshedAnalytics: (() => {
        if (document.querySelector('[data-testid="orders-provider-analytics"]')) {
          return false;
        }
        const refresh = Array.from(document.querySelectorAll('[data-testid="orders-analytics-panel"] button'))
          .find((button) => (button.textContent || '').replace(/\\s+/g, ' ').trim() === 'Refresh analytics');
        if (!(refresh instanceof HTMLButtonElement) || refresh.disabled) {
          return false;
        }
        refresh.click();
        return true;
      })(),
      apiContracts: Boolean(document.querySelector('[data-testid="orders-api-contracts"]')) &&
        document.body?.innerText?.includes('Order API response contracts') &&
        document.body?.innerText?.includes('backy.order-quote.v1') &&
        document.body?.innerText?.includes('backy.shipping-label.v1') &&
        document.body?.innerText?.includes('backy.provider-refund.v1') &&
        document.body?.innerText?.includes('backy.commerce-webhook.v1') &&
        document.body?.innerText?.includes('backy.commerce-reconciliation-readiness.v1'),
      notificationDelivery: Boolean(document.querySelector('[data-testid="orders-notification-delivery"]')),
      queue: Boolean(document.querySelector('#orders-queue')),
      editor: Boolean(document.querySelector('#orders-editor')),
      shippingLabelControls: Boolean(document.querySelector('[data-testid="orders-shipping-label-controls"]')),
      providerRefundControls: Boolean(document.querySelector('[data-testid="orders-provider-refund-controls"]')),
      providerReadiness: Boolean(document.querySelector('[data-testid="orders-provider-readiness"]')) &&
        document.body?.innerText?.includes('Provider execution readiness') &&
        document.body?.innerText?.includes('Stripe checkout/refund') &&
        document.body?.innerText?.includes('Payment refund providers') &&
        document.body?.innerText?.includes('Tax quote') &&
        document.body?.innerText?.includes('TaxJar') &&
        document.body?.innerText?.includes('Avalara') &&
        document.body?.innerText?.includes('Shipping quote') &&
        document.body?.innerText?.includes('EasyPost rates') &&
        document.body?.innerText?.includes('Shippo rates') &&
        document.body?.innerText?.includes('Discount quote') &&
        document.body?.innerText?.includes('Stripe promotion codes') &&
        document.body?.innerText?.includes('Carrier labels/tracking') &&
        document.body?.innerText?.includes('Fulfillment dispatch') &&
        document.body?.innerText?.includes('Webhook settlement'),
      providerCertificationExport: Boolean(document.querySelector('[data-testid="orders-provider-certification"]')) &&
        Boolean(document.querySelector('[data-testid="orders-provider-certification-download-button"]')) &&
        Boolean(document.querySelector('[data-testid="orders-provider-certification-copy-button"]')) &&
        document.body?.innerText?.includes('Live provider certification') &&
        document.body?.innerText?.includes('Download provider JSON'),
      cronReadiness: Boolean(document.querySelector('[data-testid="orders-cron-readiness"]')),
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
    if (layout.command && layout.api && layout.metrics && layout.analytics && layout.providerAnalytics && layout.apiContracts && layout.notificationDelivery && layout.queue && layout.editor && layout.shippingLabelControls && layout.providerRefundControls && layout.providerReadiness && layout.providerCertificationExport && layout.cronReadiness && layout.riskControls && layout.hasCustomerProfileManager && layout.checkout && layout.privateContract && layout.analyticsEndpoint && layout.deliveryEndpoint && layout.hasImportControls && layout.hasBulkControls && layout.adminApiOpensWithButton) {
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
    'trackingstatus',
    'trackinglastcheckedat',
    'fulfilledat',
    'shippinglabelstatus',
    'shippinglabelprovider',
    'shippinglabelid',
    'shippinglabelurl',
    'shippingservicelevel',
    'shippinglabelcost',
    'shippinglabelcreatedat',
    'fulfillmentdispatchstatus',
    'fulfillmentprovider',
    'fulfillmentid',
    'fulfillmentrequestedat',
    'fulfillmentcompletedat',
    'fulfillmentpayload',
    'riskscore',
    'risklevel',
    'riskreasons',
    'riskreviewstatus',
    'shippingaddress',
    'billingaddress',
    'refundamount',
    'refundreason',
    'providerrefundstatus',
    'providerrefundprovider',
    'providerrefundid',
    'providerrefundreference',
    'providerrefundamount',
    'providerrefundreason',
    'providerrefundrequestedat',
    'providerrefundcompletedat',
    'providerrefundpayload',
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
    'processing',
    '2026-05-10T10:04:00.000Z',
    '',
    'draft',
    'UPS',
    `lbl_import_${suffix}`,
    `${API_BASE_URL}/api/admin/sites/${SITE_ID}/commerce/orders/imported-order-${suffix}/shipping-label`,
    'ground',
    '6',
    '2026-05-10T10:05:00.000Z',
    'requested',
    'warehouse',
    `ful_import_${suffix}`,
    '2026-05-10T10:07:00.000Z',
    '',
    JSON.stringify({ schemaVersion: 'backy.fulfillment-dispatch.v1', fulfillmentId: `ful_import_${suffix}` }),
    '12',
    'low',
    'CSV import baseline risk.',
    'cleared',
    'Imported shipping address',
    'Imported billing address',
    '0',
    '',
    'requested',
    'manual',
    `rf_import_${suffix}`,
    `pi_import_${suffix}`,
    '0',
    'Imported provider refund request.',
    '2026-05-10T10:06:00.000Z',
    '',
    JSON.stringify({ schemaVersion: 'backy.provider-refund.v1', idempotencyKey: `orders-import-${suffix}` }),
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
  assert(record.values?.trackingstatus === 'processing' && Boolean(record.values?.trackinglastcheckedat), `Imported tracking refresh fields were unexpected: ${JSON.stringify(record.values)}`);
  assert(record.values?.shippinglabelstatus === 'draft' && record.values?.shippinglabelprovider === 'UPS' && record.values?.shippinglabelid === `lbl_import_${suffix}` && record.values?.shippinglabelcost === 6, `Imported shipping label fields were unexpected: ${JSON.stringify(record.values)}`);
  assert(record.values?.fulfillmentdispatchstatus === 'requested' && record.values?.fulfillmentprovider === 'warehouse' && record.values?.fulfillmentid === `ful_import_${suffix}` && String(record.values?.fulfillmentpayload || '').includes('backy.fulfillment-dispatch.v1'), `Imported fulfillment dispatch fields were unexpected: ${JSON.stringify(record.values)}`);
  assert(record.values?.providerrefundstatus === 'requested' && record.values?.providerrefundprovider === 'manual' && record.values?.providerrefundid === `rf_import_${suffix}` && record.values?.providerrefundamount === 0 && String(record.values?.providerrefundpayload || '').includes('backy.provider-refund.v1'), `Imported provider refund fields were unexpected: ${JSON.stringify(record.values)}`);
  assert(record.values?.riskscore === 12 && record.values?.risklevel === 'low' && record.values?.riskreviewstatus === 'cleared', `Imported risk fields were unexpected: ${JSON.stringify(record.values)}`);
  assert(JSON.parse(record.values?.items || '[]')?.[0]?.quantity === 3, `Imported items JSON was unexpected: ${JSON.stringify(record.values?.items)}`);

  return record;
};

const assertCommerceCronReadiness = async () => {
  const payload = await requestApi('/api/admin/commerce/reconcile/readiness');
  const readiness = payload.data?.cronReadiness;
  assert(readiness?.schemaVersion === 'backy.commerce-cron-readiness.v1', `Scheduled reconciliation readiness returned wrong schema: ${JSON.stringify(payload).slice(0, 500)}`);
  assert(readiness.entrypoint === '/api/admin/commerce/reconcile?limit=100', `Scheduled reconciliation readiness returned wrong entrypoint: ${JSON.stringify(readiness)}`);
  assert(readiness.schedule === '0 3 * * *', `Scheduled reconciliation readiness returned wrong schedule: ${JSON.stringify(readiness)}`);
  assert(typeof readiness.vercelCronConfigured === 'boolean', `Scheduled reconciliation readiness did not expose vercel cron status: ${JSON.stringify(readiness)}`);
  assert(typeof readiness.cronSecretConfigured === 'boolean', `Scheduled reconciliation readiness did not expose CRON_SECRET status: ${JSON.stringify(readiness)}`);
  assert(typeof readiness.environmentAdminKeyConfigured === 'boolean', `Scheduled reconciliation readiness did not expose admin key status: ${JSON.stringify(readiness)}`);
  assert(typeof readiness.cronSecretMatchesAdminKey === 'boolean', `Scheduled reconciliation readiness did not expose secret match status: ${JSON.stringify(readiness)}`);
  assert(Array.isArray(readiness.missing), `Scheduled reconciliation readiness did not expose missing requirements: ${JSON.stringify(readiness)}`);
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
  await setLabeledControl(client, 'Raw item payload', JSON.stringify([{
    productId: `prod_orders_${suffix}`,
    title: `Orders Smoke Product ${suffix}`,
    quantity: 2,
    price: 40,
    lineTotal: 80,
    sku: `ORDER-SMOKE-${suffix.toUpperCase()}`,
    taxable: true,
    shippingRequired: true,
    discountCode: 'STRIPESMOKE',
  }]), { exact: true });

  await setLabeledControl(client, 'Shipping address', JSON.stringify({
    name: 'Orders Smoke Customer',
    street1: '200 Customer Lane',
    city: 'San Francisco',
    state: 'CA',
    zip: '94105',
    country: 'US',
    phone: '5555550101',
  }), { exact: true });
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

const assertOrderCardButtonEnabled = async (client, orderNumber, buttonText) => {
  let result = null;
  for (let attempt = 0; attempt < 80; attempt += 1) {
    result = await evaluate(client, `(() => {
      const orderNumber = ${JSON.stringify(orderNumber)};
      const buttonText = ${JSON.stringify(buttonText)};
      const cards = Array.from(document.querySelectorAll('article'));
      const card = cards.find((candidate) => (candidate.textContent || '').includes(orderNumber));
      const button = Array.from((card || document).querySelectorAll('button')).find((candidate) => (
        (candidate.textContent || '').replace(/\\s+/g, ' ').trim() === buttonText
      ));
      return {
        url: window.location.href,
        hasCard: Boolean(card),
        hasButton: button instanceof HTMLButtonElement,
        disabled: button instanceof HTMLButtonElement ? button.disabled : null,
        cardText: (card?.textContent || '').replace(/\\s+/g, ' ').trim().slice(0, 900),
        bodyText: document.body?.innerText?.replace(/\\s+/g, ' ').trim().slice(0, 1200) || '',
      };
    })()`);
    if (result.hasCard && result.hasButton && result.disabled === false) return result;
    await sleep(250);
  }
  assert(
    result?.hasCard && result?.hasButton && result.disabled === false,
    `${buttonText} was not enabled for ${orderNumber}: ${JSON.stringify(result)}`,
  );
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

const waitForOrderEditorSelection = async (client, orderNumber) => {
  let previousSignature = '';
  let stableCount = 0;
  let state = null;

  for (let attempt = 0; attempt < 80; attempt += 1) {
    state = await evaluate(client, `(() => {
      const editor = document.querySelector('#orders-editor');
      const labels = Array.from(editor?.querySelectorAll('label') || []);
      const normalized = (text) => (text || '').replace(/\\s+/g, ' ').trim();
      const controlFor = (labelText, last = false) => {
        const matches = labels.filter((candidate) => normalized(candidate.querySelector('span')?.textContent || candidate.textContent) === labelText);
        const label = last ? matches.at(-1) : matches[0];
        const control = label?.querySelector('input, select, textarea');
        return control instanceof HTMLInputElement || control instanceof HTMLSelectElement || control instanceof HTMLTextAreaElement
          ? control.value
          : null;
      };
      return {
        orderNumber: controlFor('Order number'),
        refundAmount: controlFor('Refund amount'),
        refundReason: controlFor('Refund reason'),
        notes: controlFor('Notes', true),
        payment: controlFor('Payment'),
      };
    })()`);
    const signature = JSON.stringify(state);
    stableCount = signature === previousSignature ? stableCount + 1 : 0;
    previousSignature = signature;
    if (state.orderNumber === orderNumber && stableCount >= 4) {
      return state;
    }
    await sleep(150);
  }

  throw new Error(`Order editor did not settle on ${orderNumber}: ${JSON.stringify(state)}`);
};

const editOrderAfterWorkflow = async (client, orderNumber) => {
  await clickOrderCardButton(client, orderNumber, 'Edit');
  await waitForOrderEditorSelection(client, orderNumber);
  await setLabeledControl(client, 'Payment', 'refunded', { exact: true });
  await typeLabeledControl(client, 'Refund amount', '5', { exact: true });
  await typeLabeledControl(client, 'Refund reason', 'Smoke refund adjustment', { exact: true });
  await typeLabeledControl(client, 'Notes', 'Order smoke edited private note after fulfillment.', { exact: true, last: true });
  const editorState = await evaluate(client, `(() => {
    const editor = document.querySelector('#orders-editor');
    const labels = Array.from(editor?.querySelectorAll('label') || []);
    const normalized = (text) => (text || '').replace(/\\s+/g, ' ').trim();
    const controlFor = (labelText, last = false) => {
      const matches = labels.filter((candidate) => normalized(candidate.querySelector('span')?.textContent || candidate.textContent) === labelText);
      const label = last ? matches.at(-1) : matches[0];
      const control = label?.querySelector('input, select, textarea');
      return control instanceof HTMLInputElement || control instanceof HTMLSelectElement || control instanceof HTMLTextAreaElement
        ? control.value
        : null;
    };
    return {
      refundAmount: controlFor('Refund amount'),
      refundReason: controlFor('Refund reason'),
      notes: controlFor('Notes', true),
      payment: controlFor('Payment'),
    };
  })()`);
  assert(
    editorState.refundAmount === '5' &&
      editorState.refundReason === 'Smoke refund adjustment' &&
      editorState.notes === 'Order smoke edited private note after fulfillment.' &&
      editorState.payment === 'refunded',
    `Order editor controls did not receive smoke edit values: ${JSON.stringify(editorState)}`,
  );
  const saveResult = await evaluate(client, `(() => {
    const editor = document.querySelector('#orders-editor');
    const form = editor?.querySelector('form');
    const buttons = Array.from(editor?.querySelectorAll('button') || []);
    const button = buttons.find((candidate) => (candidate.textContent || '').trim() === 'Save Order');
    if (!(form instanceof HTMLFormElement)) {
      return { ok: false, reason: 'form-missing' };
    }
    if (!(button instanceof HTMLButtonElement)) {
      return {
        ok: false,
        reason: 'button-missing',
        buttons: buttons.map((candidate) => (candidate.textContent || '').trim()).slice(0, 40),
      };
    }
    if (button.disabled) {
      return { ok: false, reason: 'button-disabled' };
    }
    form.requestSubmit(button);
    return { ok: true };
  })()`);
  assert(saveResult.ok, `Unable to submit order editor: ${JSON.stringify(saveResult)}`);

  for (let attempt = 0; attempt < 80; attempt += 1) {
    const state = await evaluate(client, `(() => ({
      updated: document.body?.innerText?.includes('Order updated.') || false,
      refundVisible: document.body?.innerText?.includes('Refund $5.00') || false,
      body: document.body?.innerText?.slice(0, 1000) || '',
    }))()`);
    if (state.refundVisible) {
      return state;
    }
    if (attempt === 79) {
      throw new Error(`Order edit did not save: ${JSON.stringify(state)}`);
    }
    await sleep(250);
  }

  return null;
};

const prepareStripeProviderRefundThroughUi = async (client, orderNumber, suffix) => {
  await clickOrderCardButton(client, orderNumber, 'Edit');
  await setLabeledControl(client, 'Provider', 'stripe', { exact: true });
  await setLabeledControl(client, 'Payment ref', `pi_refund_${suffix}`, { exact: true });
  await clickByText(client, 'Save Order', { exact: true });

  for (let attempt = 0; attempt < 80; attempt += 1) {
    const state = await evaluate(client, `(() => ({
      updated: document.body?.innerText?.includes('Order updated.') || false,
      providerVisible: document.body?.innerText?.includes('stripe') && document.body?.innerText?.includes(${JSON.stringify(`pi_refund_${suffix}`)}),
      body: document.body?.innerText?.slice(0, 1000) || '',
    }))()`);
    if (state.updated || state.providerVisible) {
      return state;
    }
    if (attempt === 79) {
      throw new Error(`Stripe provider refund preparation did not save: ${JSON.stringify(state)}`);
    }
    await sleep(250);
  }

  return null;
};

const preparePayPalProviderRefundThroughUi = async (client, orderNumber, suffix) => {
  await clickOrderCardButton(client, orderNumber, 'Edit');
  await setLabeledControl(client, 'Provider', 'paypal', { exact: true });
  await setLabeledControl(client, 'Payment ref', `cap_refund_${suffix}`, { exact: true });
  await clickByText(client, 'Save Order', { exact: true });

  for (let attempt = 0; attempt < 80; attempt += 1) {
    const state = await evaluate(client, `(() => ({
      updated: document.body?.innerText?.includes('Order updated.') || false,
      providerVisible: document.body?.innerText?.includes('paypal') && document.body?.innerText?.includes(${JSON.stringify(`cap_refund_${suffix}`)}),
      body: document.body?.innerText?.slice(0, 1000) || '',
    }))()`);
    if (state.updated || state.providerVisible) {
      return state;
    }
    if (attempt === 79) {
      throw new Error(`PayPal provider refund preparation did not save: ${JSON.stringify(state)}`);
    }
    await sleep(250);
  }

  return null;
};

const preparePaddleProviderRefundThroughUi = async (client, orderNumber, suffix) => {
  await clickOrderCardButton(client, orderNumber, 'Edit');
  await setLabeledControl(client, 'Provider', 'paddle', { exact: true });
  await setLabeledControl(client, 'Payment ref', `txn_paddle_${suffix}`, { exact: true });
  await clickByText(client, 'Save Order', { exact: true });

  for (let attempt = 0; attempt < 80; attempt += 1) {
    const state = await evaluate(client, `(() => ({
      updated: document.body?.innerText?.includes('Order updated.') || false,
      providerVisible: document.body?.innerText?.includes('paddle') && document.body?.innerText?.includes(${JSON.stringify(`txn_paddle_${suffix}`)}),
      body: document.body?.innerText?.slice(0, 1000) || '',
    }))()`);
    if (state.updated || state.providerVisible) {
      return state;
    }
    if (attempt === 79) {
      throw new Error(`Paddle provider refund preparation did not save: ${JSON.stringify(state)}`);
    }
    await sleep(250);
  }

  return null;
};

const prepareSquareProviderRefundThroughUi = async (client, orderNumber, suffix) => {
  await clickOrderCardButton(client, orderNumber, 'Edit');
  await setLabeledControl(client, 'Provider', 'square', { exact: true });
  await setLabeledControl(client, 'Payment ref', `sq_payment_${suffix}`, { exact: true });
  await clickByText(client, 'Save Order', { exact: true });

  for (let attempt = 0; attempt < 80; attempt += 1) {
    const state = await evaluate(client, `(() => ({
      updated: document.body?.innerText?.includes('Order updated.') || false,
      providerVisible: document.body?.innerText?.includes('square') && document.body?.innerText?.includes(${JSON.stringify(`sq_payment_${suffix}`)}),
      body: document.body?.innerText?.slice(0, 1000) || '',
    }))()`);
    if (state.updated || state.providerVisible) {
      return state;
    }
    if (attempt === 79) {
      throw new Error(`Square provider refund preparation did not save: ${JSON.stringify(state)}`);
    }
    await sleep(250);
  }

  return null;
};

const prepareAdyenProviderRefundThroughUi = async (client, orderNumber, suffix) => {
  await clickOrderCardButton(client, orderNumber, 'Edit');
  await setLabeledControl(client, 'Provider', 'adyen', { exact: true });
  await setLabeledControl(client, 'Payment ref', `adyen_payment_${suffix}`, { exact: true });
  await clickByText(client, 'Save Order', { exact: true });

  for (let attempt = 0; attempt < 80; attempt += 1) {
    const state = await evaluate(client, `(() => ({
      updated: document.body?.innerText?.includes('Order updated.') || false,
      providerVisible: document.body?.innerText?.includes('adyen') && document.body?.innerText?.includes(${JSON.stringify(`adyen_payment_${suffix}`)}),
      body: document.body?.innerText?.slice(0, 1000) || '',
    }))()`);
    if (state.updated || state.providerVisible) {
      return state;
    }
    if (attempt === 79) {
      throw new Error(`Adyen provider refund preparation did not save: ${JSON.stringify(state)}`);
    }
    await sleep(250);
  }

  return null;
};

const prepareMollieProviderRefundThroughUi = async (client, orderNumber, suffix) => {
  await clickOrderCardButton(client, orderNumber, 'Edit');
  await setLabeledControl(client, 'Provider', 'mollie', { exact: true });
  await setLabeledControl(client, 'Payment ref', `tr_mollie_${suffix}`, { exact: true });
  await clickByText(client, 'Save Order', { exact: true });

  for (let attempt = 0; attempt < 80; attempt += 1) {
    const state = await evaluate(client, `(() => ({
      updated: document.body?.innerText?.includes('Order updated.') || false,
      providerVisible: document.body?.innerText?.includes('mollie') && document.body?.innerText?.includes(${JSON.stringify(`tr_mollie_${suffix}`)}),
      body: document.body?.innerText?.slice(0, 1000) || '',
    }))()`);
    if (state.updated || state.providerVisible) {
      return state;
    }
    if (attempt === 79) {
      throw new Error(`Mollie provider refund preparation did not save: ${JSON.stringify(state)}`);
    }
    await sleep(250);
  }

  return null;
};

const prepareRazorpayProviderRefundThroughUi = async (client, orderNumber, suffix) => {
  await clickOrderCardButton(client, orderNumber, 'Edit');
  await setLabeledControl(client, 'Provider', 'razorpay', { exact: true });
  await setLabeledControl(client, 'Payment ref', `pay_refund_${suffix}`, { exact: true });
  await clickByText(client, 'Save Order', { exact: true });

  for (let attempt = 0; attempt < 80; attempt += 1) {
    const state = await evaluate(client, `(() => ({
      updated: document.body?.innerText?.includes('Order updated.') || false,
      providerVisible: document.body?.innerText?.includes('razorpay') && document.body?.innerText?.includes(${JSON.stringify(`pay_refund_${suffix}`)}),
      body: document.body?.innerText?.slice(0, 1000) || '',
    }))()`);
    if (state.updated || state.providerVisible) {
      return state;
    }
    if (attempt === 79) {
      throw new Error(`Razorpay provider refund preparation did not save: ${JSON.stringify(state)}`);
    }
    await sleep(250);
  }

  return null;
};

const verifyEasyPostProviderExecution = async (collectionId, slug, suffix, easyPostMockServer) => {
  const expectedSecret = process.env.BACKY_EASYPOST_API_KEY || process.env.EASYPOST_API_KEY;
  const beforeLabelRecord = await getCollectionRecordBySlug(collectionId, slug);
  const labelResponse = await requestApi(`/api/admin/sites/${SITE_ID}/commerce/orders/${beforeLabelRecord.id}/shipping-label`, {
    method: 'POST',
    body: JSON.stringify({
      provider: 'easypost',
      executionProvider: 'easypost',
      carrier: 'UPS',
      serviceLevel: 'Ground',
      rateId: 'rate_smoke_ground',
      fromAddress: {
        name: 'Backy Warehouse',
        street1: '100 Fulfillment Way',
        city: 'Austin',
        state: 'TX',
        zip: '78701',
        country: 'US',
        phone: '5555550100',
      },
      toAddress: {
        name: 'Orders Smoke Customer',
        street1: '200 Customer Lane',
        city: 'San Francisco',
        state: 'CA',
        zip: '94105',
        country: 'US',
        phone: '5555550101',
      },
      parcel: {
        length: 8,
        width: 6,
        height: 2,
        weight: 12,
      },
    }),
  });
  assert(labelResponse.data?.label?.status === 'purchased', `EasyPost label purchase did not return a purchased label: ${JSON.stringify(labelResponse)}`);
  assert(labelResponse.data?.label?.id === 'shp_smoke_1', `EasyPost label purchase did not persist shipment id: ${JSON.stringify(labelResponse.data?.label)}`);
  assert(labelResponse.data?.label?.url === 'https://labels.easypost.test/shp_smoke_1.pdf', `EasyPost label purchase did not persist label URL: ${JSON.stringify(labelResponse.data?.label)}`);
  assert(labelResponse.data?.label?.providerPayload?.executionMode === 'easypost-api', `EasyPost label purchase did not expose execution metadata: ${JSON.stringify(labelResponse.data?.label)}`);

  const shipmentCreateRequest = easyPostMockServer.requests.find((request) => request.url === '/v2/shipments');
  const shipmentBuyRequest = easyPostMockServer.requests.find((request) => request.url === '/v2/shipments/shp_smoke_1/buy');
  const expectedAuth = `Basic ${Buffer.from(`${expectedSecret}:`).toString('base64')}`;
  assert(shipmentCreateRequest?.headers.authorization === expectedAuth, `EasyPost shipment create did not receive bearer-equivalent basic auth: ${JSON.stringify(shipmentCreateRequest?.headers)}`);
  assert(shipmentCreateRequest?.body?.shipment?.reference, `EasyPost shipment create did not include order reference: ${JSON.stringify(shipmentCreateRequest?.body)}`);
  assert(shipmentBuyRequest?.body?.rate?.id === 'rate_smoke_ground', `EasyPost shipment buy did not select the expected rate: ${JSON.stringify(shipmentBuyRequest?.body)}`);

  const purchasedRecord = await waitForOrderValue(
    collectionId,
    slug,
    (values) => (
      values.shippinglabelstatus === 'purchased' &&
      values.shippinglabelid === 'shp_smoke_1' &&
      values.shippinglabelurl === 'https://labels.easypost.test/shp_smoke_1.pdf' &&
      values.shippingservicelevel === 'Ground' &&
      Number(values.shippinglabelcost) === 7.25
    ),
    'EasyPost label purchase did not persist purchased label fields',
  );
  const labelGetPayload = await requestApi(`/api/admin/sites/${SITE_ID}/commerce/orders/${purchasedRecord.id}/shipping-label`);
  assert(labelGetPayload.data?.label?.status === 'purchased' && labelGetPayload.data?.label?.id === 'shp_smoke_1', `Shipping label GET did not return the EasyPost purchased label: ${JSON.stringify(labelGetPayload)}`);

  const voidResponse = await requestApi(`/api/admin/sites/${SITE_ID}/commerce/orders/${purchasedRecord.id}/shipping-label`, {
    method: 'DELETE',
    body: JSON.stringify({ executionProvider: 'easypost' }),
  });
  assert(voidResponse.data?.label?.status === 'voided', `EasyPost label void did not return a voided label: ${JSON.stringify(voidResponse)}`);
  assert(voidResponse.data?.label?.providerPayload?.executionMode === 'easypost-api', `EasyPost label void did not expose execution metadata: ${JSON.stringify(voidResponse.data?.label)}`);
  assert(easyPostMockServer.requests.some((request) => request.url === '/v2/shipments/shp_smoke_1/refund'), `EasyPost mock did not receive shipment refund request: ${JSON.stringify(easyPostMockServer.requests)}`);

  const voidedRecord = await waitForOrderValue(
    collectionId,
    slug,
    (values) => values.shippinglabelstatus === 'voided' && values.shippinglabelid === 'shp_smoke_1',
    'EasyPost label void did not persist voided label fields',
  );

  const trackingResponse = await requestApi(`/api/admin/sites/${SITE_ID}/commerce/orders/${voidedRecord.id}/tracking`, {
    method: 'POST',
    body: JSON.stringify({
      provider: 'UPS',
      executionProvider: 'easypost',
      trackingNumber: `EZTRACK-${suffix}`,
    }),
  });
  assert(trackingResponse.data?.tracking?.status === 'delivered', `EasyPost tracking did not return delivered status: ${JSON.stringify(trackingResponse)}`);
  assert(trackingResponse.data?.tracking?.providerPayload?.executionMode === 'easypost-api', `EasyPost tracking did not expose execution metadata: ${JSON.stringify(trackingResponse.data?.tracking)}`);
  const trackerRequest = easyPostMockServer.requests.find((request) => (
    request.url === '/v2/trackers' && request.body?.tracker?.tracking_code === `EZTRACK-${suffix}`
  ));
  assert(trackerRequest?.body?.tracker?.tracking_code === `EZTRACK-${suffix}`, `EasyPost tracker request did not include tracking code: ${JSON.stringify(trackerRequest?.body)}`);
  assert(trackerRequest?.headers.authorization === expectedAuth, `EasyPost tracker request did not receive expected auth: ${JSON.stringify(trackerRequest?.headers)}`);

  await waitForOrderValue(
    collectionId,
    slug,
    (values) => (
      values.orderstatus === 'fulfilled' &&
      values.fulfillmentstatus === 'fulfilled' &&
      values.trackingnumber === `EZTRACK-${suffix}` &&
      values.trackingstatus === 'delivered' &&
      values.trackingurl === 'https://track.easypost.test/EZTRACK1' &&
      Boolean(values.trackinglastcheckedat)
    ),
    'EasyPost tracking did not persist delivered tracking fields',
  );
};

const verifyShippoProviderExecution = async (collectionId, slug, shippoMockServer) => {
  const expectedSecret = process.env.BACKY_SHIPPO_API_KEY || process.env.SHIPPO_API_KEY;
  const beforeLabelRecord = await getCollectionRecordBySlug(collectionId, slug);
  const labelResponse = await requestApi(`/api/admin/sites/${SITE_ID}/commerce/orders/${beforeLabelRecord.id}/shipping-label`, {
    method: 'POST',
    body: JSON.stringify({
      provider: 'shippo',
      executionProvider: 'shippo',
      carrier: 'USPS',
      serviceLevel: 'usps_priority',
      rateId: 'shippo_rate_smoke_priority',
      fromAddress: {
        name: 'Backy Warehouse',
        street1: '100 Fulfillment Way',
        city: 'Austin',
        state: 'TX',
        zip: '78701',
        country: 'US',
        phone: '5555550100',
      },
      toAddress: {
        name: 'Orders Smoke Customer',
        street1: '200 Customer Lane',
        city: 'San Francisco',
        state: 'CA',
        zip: '94105',
        country: 'US',
        phone: '5555550101',
      },
      parcel: {
        length: 8,
        width: 6,
        height: 2,
        distance_unit: 'in',
        weight: 12,
        mass_unit: 'oz',
      },
    }),
  });
  assert(labelResponse.data?.label?.status === 'purchased', `Shippo label purchase did not return a purchased label: ${JSON.stringify(labelResponse)}`);
  assert(labelResponse.data?.label?.id === 'shippo_tx_smoke_1', `Shippo label purchase did not persist transaction id: ${JSON.stringify(labelResponse.data?.label)}`);
  assert(labelResponse.data?.label?.url === 'https://labels.shippo.test/shippo_tx_smoke_1.pdf', `Shippo label purchase did not persist label URL: ${JSON.stringify(labelResponse.data?.label)}`);
  assert(labelResponse.data?.label?.providerPayload?.executionMode === 'shippo-api', `Shippo label purchase did not expose execution metadata: ${JSON.stringify(labelResponse.data?.label)}`);

  const shipmentRequest = shippoMockServer.requests.find((request) => request.url === '/shipments/');
  const transactionRequest = shippoMockServer.requests.find((request) => request.url === '/transactions/');
  assert(shipmentRequest?.headers.authorization === `ShippoToken ${expectedSecret}`, `Shippo shipment create did not receive token auth: ${JSON.stringify(shipmentRequest?.headers)}`);
  assert(shipmentRequest?.body?.address_from?.name === 'Backy Warehouse', `Shippo shipment create did not include from address: ${JSON.stringify(shipmentRequest?.body)}`);
  assert(transactionRequest?.body?.rate === 'shippo_rate_smoke_priority', `Shippo transaction did not select the expected rate: ${JSON.stringify(transactionRequest?.body)}`);

  const purchasedRecord = await waitForOrderValue(
    collectionId,
    slug,
    (values) => (
      values.shippinglabelstatus === 'purchased' &&
      values.shippinglabelid === 'shippo_tx_smoke_1' &&
      values.shippinglabelurl === 'https://labels.shippo.test/shippo_tx_smoke_1.pdf' &&
      values.shippingservicelevel === 'usps_priority' &&
      Number(values.shippinglabelcost) === 8.55
    ),
    'Shippo label purchase did not persist purchased label fields',
  );

  const voidResponse = await requestApi(`/api/admin/sites/${SITE_ID}/commerce/orders/${purchasedRecord.id}/shipping-label`, {
    method: 'DELETE',
    body: JSON.stringify({ executionProvider: 'shippo' }),
  });
  assert(voidResponse.data?.label?.status === 'voided', `Shippo label void did not return a voided label: ${JSON.stringify(voidResponse)}`);
  assert(voidResponse.data?.label?.providerPayload?.executionMode === 'shippo-api', `Shippo label void did not expose execution metadata: ${JSON.stringify(voidResponse.data?.label)}`);
  assert(shippoMockServer.requests.some((request) => request.url === '/refunds/' && request.body?.transaction === 'shippo_tx_smoke_1'), `Shippo mock did not receive refund request: ${JSON.stringify(shippoMockServer.requests)}`);

  await waitForOrderValue(
    collectionId,
    slug,
    (values) => values.shippinglabelstatus === 'voided' && values.shippinglabelid === 'shippo_tx_smoke_1',
    'Shippo label void did not persist voided label fields',
  );

  const trackingResponse = await requestApi(`/api/admin/sites/${SITE_ID}/commerce/orders/${purchasedRecord.id}/tracking`, {
    method: 'POST',
    body: JSON.stringify({
      provider: 'shippo',
      executionProvider: 'shippo',
      carrier: 'USPS',
      trackingNumber: 'SHIPPO1',
      trackingUrl: 'https://track.shippo.test/SHIPPO1',
    }),
  });
  assert(trackingResponse.data?.tracking?.status === 'delivered', `Shippo tracking did not return delivered status: ${JSON.stringify(trackingResponse)}`);
  assert(trackingResponse.data?.tracking?.providerPayload?.executionMode === 'shippo-api', `Shippo tracking did not expose execution metadata: ${JSON.stringify(trackingResponse.data?.tracking)}`);
  const trackingRequest = shippoMockServer.requests.find((request) => request.url === '/tracks/USPS/SHIPPO1');
  assert(trackingRequest?.headers.authorization === `ShippoToken ${expectedSecret}`, `Shippo tracking did not receive token auth: ${JSON.stringify(trackingRequest?.headers)}`);
  await waitForOrderValue(
    collectionId,
    slug,
    (values) => (
      values.trackingnumber === 'SHIPPO1' &&
      values.trackingstatus === 'delivered' &&
      values.trackingurl === 'https://track.shippo.test/SHIPPO1' &&
      Boolean(values.trackinglastcheckedat)
    ),
    'Shippo tracking did not persist delivered tracking fields',
  );
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
  let quoteProviderServer;
  let stripeTaxMockServer;
  let taxJarMockServer;
  let avalaraMockServer;
  let stripeRefundMockServer;
  let paypalRefundMockServer;
  let paddleRefundMockServer;
  let squareRefundMockServer;
  let adyenRefundMockServer;
  let mollieRefundMockServer;
  let razorpayRefundMockServer;
  let easyPostMockServer;
  let shippoMockServer;
  let fulfillmentProviderServer;
  let expectedProviderTotal = 93.69;
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
    await setBrowserSession(client, apiAdminSessionToken);

    const readyState = await ensureOrdersReady(client);
    const ordersCollection = await findCollection(ORDERS_COLLECTION_SLUG);
    collectionId = ordersCollection?.id;
    assert(collectionId, 'Orders collection was not available after setup');

    const importedOrder = await assertOrderCsvImport({ collectionId, suffix });
    importedOrderRecordId = importedOrder.id;
    await deleteCollectionRecord(collectionId, importedOrderRecordId);
    importedOrderRecordId = null;

    await assertOrdersLayout(client);
    await assertCommerceCronReadiness();
    const { orderNumber, slug } = await fillOrderEditor(client, suffix, customerFixture.record);
    const createdOrder = await waitForOrderValue(
      collectionId,
      slug,
      (values) => (
        values.ordernumber === orderNumber &&
        values.paymentstatus === 'pending' &&
        values.fulfillmentstatus === 'unfulfilled' &&
        values.customerid === customerFixture.record.id &&
        values.shippinglabelstatus === 'none' &&
        values.providerrefundstatus === 'none' &&
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
    assert(initialAnalytics.providerOperations?.paymentProviders?.some((provider) => provider.provider === 'manual' && provider.statuses.pending >= 1), `Order analytics did not report payment provider mix: ${JSON.stringify(initialAnalytics.providerOperations).slice(0, 500)}`);
    assert(initialAnalytics.providerOperations?.refundProviders?.some((provider) => provider.provider === 'manual' && provider.statuses.none >= 1), `Order analytics did not report provider refund pipeline: ${JSON.stringify(initialAnalytics.providerOperations).slice(0, 500)}`);
    assert(initialAnalytics.providerOperations?.fulfillmentProviders?.some((provider) => provider.statuses.none >= 1), `Order analytics did not report fulfillment dispatch provider pipeline: ${JSON.stringify(initialAnalytics.providerOperations).slice(0, 500)}`);
    assert(initialAnalytics.providerOperations?.shippingLabelProviders?.some((provider) => provider.statuses.none >= 1), `Order analytics did not report shipping-label provider pipeline: ${JSON.stringify(initialAnalytics.providerOperations).slice(0, 500)}`);

    await assertOrderCustomerProfileManagement(client, customerFixture.collection, customerFixture.record);

    await exerciseFilters(client, orderNumber);

    await clickOrderCardButton(client, orderNumber, 'Refresh Quote');
    const quotedOrder = await waitForOrderValue(
      collectionId,
      slug,
      (values) => (
        values.subtotal === 80 &&
        values.discountamount === 0 &&
        values.taxamount === 8 &&
        values.shippingamount === 8 &&
        values.total === 96 &&
        /Order quote refreshed/.test(String(values.notes || ''))
      ),
      'Refresh Quote did not persist pricing-rule totals',
    );
    const quotePayload = await requestApi(`/api/admin/sites/${SITE_ID}/commerce/orders/${quotedOrder.id}/quote`);
    assert(quotePayload.data?.quote?.schemaVersion === 'backy.order-quote.v1', `Quote endpoint returned wrong schema: ${JSON.stringify(quotePayload).slice(0, 500)}`);
    assert(quotePayload.data?.quote?.total === 96, `Quote endpoint returned unexpected total: ${JSON.stringify(quotePayload).slice(0, 500)}`);

    quoteProviderServer = await createQuoteProviderServer();
    const currentSettings = await getSettings();
    await enableCommerceQuoteProviders(currentSettings, quoteProviderServer.baseUrl);
    await clickOrderCardButton(client, orderNumber, 'Refresh Quote');
    const providerQuotedOrder = await waitForOrderValue(
      collectionId,
      slug,
      (values) => (
        values.subtotal === 80 &&
        values.discountamount === 6.54 &&
        values.taxamount === 12.34 &&
        values.shippingamount === 7.89 &&
        values.total === 93.69 &&
        /Provider adjustments: tax:succeeded, shipping:succeeded, discount:succeeded/.test(String(values.notes || ''))
      ),
      'Refresh Quote did not persist provider-calculated totals',
    );
    const providerQuotePayload = await requestApi(`/api/admin/sites/${SITE_ID}/commerce/orders/${providerQuotedOrder.id}/quote`);
    const providerQuote = providerQuotePayload.data?.quote;
    assert(providerQuote?.providerAdjustments?.length === 3, `Quote endpoint did not expose provider adjustments: ${JSON.stringify(providerQuotePayload).slice(0, 500)}`);
    assert(providerQuote.providerAdjustments.every((item) => item.status === 'succeeded'), `Quote provider adjustments were not all successful: ${JSON.stringify(providerQuote.providerAdjustments).slice(0, 1200)}`);
    assert(quoteProviderServer.requests.length >= 6, `Quote provider server did not receive tax/shipping/discount calls from POST and GET: ${quoteProviderServer.requests.length}`);

    if (taxJarExecutionEnabled()) {
      taxJarMockServer = await createTaxJarMockServer();
      const taxJarQuoteSettings = await getSettings();
      await enableCommerceQuoteProviders(taxJarQuoteSettings, quoteProviderServer.baseUrl, { taxJarTax: true });
      await clickOrderCardButton(client, orderNumber, 'Refresh Quote');
      expectedProviderTotal = 91.47;
      const taxJarQuoteOrder = await waitForOrderValue(
        collectionId,
        slug,
        (values) => (
          values.subtotal === 80 &&
          values.discountamount === 6.54 &&
          values.taxamount === 10.12 &&
          values.shippingamount === 7.89 &&
          values.total === expectedProviderTotal &&
          /Provider adjustments: tax:succeeded, shipping:succeeded, discount:succeeded/.test(String(values.notes || ''))
        ),
        'Refresh Quote did not persist TaxJar provider totals',
      );
      const taxJarQuotePayload = await requestApi(`/api/admin/sites/${SITE_ID}/commerce/orders/${taxJarQuoteOrder.id}/quote`);
      const taxJarQuote = taxJarQuotePayload.data?.quote;
      const taxJarAdjustment = taxJarQuote?.providerAdjustments?.find((item) => item.kind === 'tax');
      assert(taxJarAdjustment?.provider === 'taxjar' && taxJarAdjustment.status === 'succeeded' && taxJarAdjustment.amount === 10.12, `Quote endpoint did not expose the TaxJar adjustment: ${JSON.stringify(taxJarQuote).slice(0, 500)}`);
      const taxJarRequests = taxJarMockServer.requests.filter((request) => request.url === '/v2/taxes');
      assert(taxJarRequests.length >= 2, `TaxJar mock did not receive POST and GET tax calls: ${JSON.stringify(taxJarMockServer.requests)}`);
      assert(taxJarRequests[0]?.headers.authorization === `Bearer ${process.env.BACKY_TAXJAR_API_KEY || process.env.TAXJAR_API_KEY}`, `TaxJar mock did not receive bearer auth: ${JSON.stringify(taxJarRequests[0]?.headers)}`);
      assert(taxJarRequests[0]?.headers['x-api-version'] === '2022-01-24', `TaxJar mock did not receive API version header: ${JSON.stringify(taxJarRequests[0]?.headers)}`);
      assert(taxJarRequests[0]?.body?.from_zip === '78701', `TaxJar request did not include Settings origin ZIP: ${JSON.stringify(taxJarRequests[0]?.body)}`);
      assert(taxJarRequests[0]?.body?.to_zip === '94105', `TaxJar request did not include order destination ZIP: ${JSON.stringify(taxJarRequests[0]?.body)}`);
      assert(Number(taxJarRequests[0]?.body?.shipping) === 8, `TaxJar request did not include the local shipping amount used for parallel provider quotes: ${JSON.stringify(taxJarRequests[0]?.body)}`);
      assert(taxJarRequests[0]?.body?.line_items?.[0]?.id, `TaxJar request did not include taxable line items: ${JSON.stringify(taxJarRequests[0]?.body)}`);
    }

    if (avalaraExecutionEnabled()) {
      avalaraMockServer = await createAvalaraMockServer();
      const avalaraQuoteSettings = await getSettings();
      await enableCommerceQuoteProviders(avalaraQuoteSettings, quoteProviderServer.baseUrl, { avalaraTax: true });
      await clickOrderCardButton(client, orderNumber, 'Refresh Quote');
      expectedProviderTotal = 91.8;
      const avalaraQuoteOrder = await waitForOrderValue(
        collectionId,
        slug,
        (values) => (
          values.subtotal === 80 &&
          values.discountamount === 6.54 &&
          values.taxamount === 10.45 &&
          values.shippingamount === 7.89 &&
          values.total === expectedProviderTotal &&
          /Provider adjustments: tax:succeeded, shipping:succeeded, discount:succeeded/.test(String(values.notes || ''))
        ),
        'Refresh Quote did not persist Avalara provider totals',
      );
      const avalaraQuotePayload = await requestApi(`/api/admin/sites/${SITE_ID}/commerce/orders/${avalaraQuoteOrder.id}/quote`);
      const avalaraQuote = avalaraQuotePayload.data?.quote;
      const avalaraAdjustment = avalaraQuote?.providerAdjustments?.find((item) => item.kind === 'tax');
      assert(avalaraAdjustment?.provider === 'avalara' && avalaraAdjustment.status === 'succeeded' && avalaraAdjustment.amount === 10.45, `Quote endpoint did not expose the Avalara adjustment: ${JSON.stringify(avalaraQuote).slice(0, 500)}`);
      const avalaraRequests = avalaraMockServer.requests.filter((request) => request.url === '/api/v2/transactions/create');
      assert(avalaraRequests.length >= 2, `Avalara mock did not receive POST and GET transaction calls: ${JSON.stringify(avalaraMockServer.requests)}`);
      const expectedAvalaraAuth = `Basic ${Buffer.from(`${process.env.BACKY_AVALARA_ACCOUNT_ID || process.env.AVALARA_ACCOUNT_ID}:${process.env.BACKY_AVALARA_LICENSE_KEY || process.env.AVALARA_LICENSE_KEY}`).toString('base64')}`;
      assert(avalaraRequests[0]?.headers.authorization === expectedAvalaraAuth, `Avalara mock did not receive basic auth: ${JSON.stringify(avalaraRequests[0]?.headers)}`);
      assert(avalaraRequests[0]?.body?.companyCode === (process.env.BACKY_AVALARA_COMPANY_CODE || process.env.AVALARA_COMPANY_CODE), `Avalara request did not include company code: ${JSON.stringify(avalaraRequests[0]?.body)}`);
      assert(avalaraRequests[0]?.body?.commit === false, `Avalara request should create an uncommitted SalesOrder: ${JSON.stringify(avalaraRequests[0]?.body)}`);
      assert(avalaraRequests[0]?.body?.addresses?.shipFrom?.postalCode === '78701', `Avalara request did not include Settings ship-from ZIP: ${JSON.stringify(avalaraRequests[0]?.body)}`);
      assert(avalaraRequests[0]?.body?.addresses?.shipTo?.postalCode === '94105', `Avalara request did not include order ship-to ZIP: ${JSON.stringify(avalaraRequests[0]?.body)}`);
      assert(avalaraRequests[0]?.body?.lines?.some((line) => line.itemCode === 'shipping'), `Avalara request did not include shipping as a taxable line: ${JSON.stringify(avalaraRequests[0]?.body)}`);
    }

    if (easyPostExecutionEnabled()) {
      if (!easyPostMockServer) {
        easyPostMockServer = await createEasyPostMockServer();
      }
      const easyPostQuoteSettings = await getSettings();
      await enableCommerceQuoteProviders(easyPostQuoteSettings, quoteProviderServer.baseUrl, { easyPostShipping: true });
      await clickOrderCardButton(client, orderNumber, 'Refresh Quote');
      expectedProviderTotal = 93.05;
      const easyPostQuoteOrder = await waitForOrderValue(
        collectionId,
        slug,
        (values) => (
          values.subtotal === 80 &&
          values.discountamount === 6.54 &&
          values.taxamount === 12.34 &&
          values.shippingamount === 7.25 &&
          values.total === expectedProviderTotal &&
          /Provider adjustments: tax:succeeded, shipping:succeeded, discount:succeeded/.test(String(values.notes || ''))
        ),
        'Refresh Quote did not persist EasyPost shipping-rate totals',
      );
      const easyPostQuotePayload = await requestApi(`/api/admin/sites/${SITE_ID}/commerce/orders/${easyPostQuoteOrder.id}/quote`);
      const easyPostQuote = easyPostQuotePayload.data?.quote;
      const easyPostShippingAdjustment = easyPostQuote?.providerAdjustments?.find((item) => item.kind === 'shipping');
      assert(easyPostShippingAdjustment?.provider === 'easypost' && easyPostShippingAdjustment.status === 'succeeded' && easyPostShippingAdjustment.amount === 7.25, `Quote endpoint did not expose the EasyPost shipping adjustment: ${JSON.stringify(easyPostQuote).slice(0, 500)}`);
      const easyPostQuoteRequests = easyPostMockServer.requests.filter((request) => request.url === '/v2/shipments');
      assert(easyPostQuoteRequests.length >= 2, `EasyPost quote mock did not receive POST and GET shipment rate calls: ${JSON.stringify(easyPostMockServer.requests)}`);
      const expectedEasyPostAuth = `Basic ${Buffer.from(`${process.env.BACKY_EASYPOST_API_KEY || process.env.EASYPOST_API_KEY}:`).toString('base64')}`;
      assert(easyPostQuoteRequests[0]?.headers.authorization === expectedEasyPostAuth, `EasyPost quote mock did not receive basic auth: ${JSON.stringify(easyPostQuoteRequests[0]?.headers)}`);
      assert(easyPostQuoteRequests[0]?.body?.shipment?.from_address?.zip === '78701', `EasyPost quote request did not include Settings origin address: ${JSON.stringify(easyPostQuoteRequests[0]?.body)}`);
      assert(easyPostQuoteRequests[0]?.body?.shipment?.to_address?.zip === '94105', `EasyPost quote request did not include order destination address: ${JSON.stringify(easyPostQuoteRequests[0]?.body)}`);
      assert(Number(easyPostQuoteRequests[0]?.body?.shipment?.parcel?.weight) === 16, `EasyPost quote request did not include Settings default parcel: ${JSON.stringify(easyPostQuoteRequests[0]?.body)}`);
    }

    if (shippoExecutionEnabled()) {
      if (!shippoMockServer) {
        shippoMockServer = await createShippoMockServer();
      }
      const shippoQuoteSettings = await getSettings();
      await enableCommerceQuoteProviders(shippoQuoteSettings, quoteProviderServer.baseUrl, { shippoShipping: true });
      await clickOrderCardButton(client, orderNumber, 'Refresh Quote');
      expectedProviderTotal = 94.35;
      const shippoQuoteOrder = await waitForOrderValue(
        collectionId,
        slug,
        (values) => (
          values.subtotal === 80 &&
          values.discountamount === 6.54 &&
          values.taxamount === 12.34 &&
          values.shippingamount === 8.55 &&
          values.total === expectedProviderTotal &&
          /Provider adjustments: tax:succeeded, shipping:succeeded, discount:succeeded/.test(String(values.notes || ''))
        ),
        'Refresh Quote did not persist Shippo shipping-rate totals',
      );
      const shippoQuotePayload = await requestApi(`/api/admin/sites/${SITE_ID}/commerce/orders/${shippoQuoteOrder.id}/quote`);
      const shippoQuote = shippoQuotePayload.data?.quote;
      const shippoShippingAdjustment = shippoQuote?.providerAdjustments?.find((item) => item.kind === 'shipping');
      assert(shippoShippingAdjustment?.provider === 'shippo' && shippoShippingAdjustment.status === 'succeeded' && shippoShippingAdjustment.amount === 8.55, `Quote endpoint did not expose the Shippo shipping adjustment: ${JSON.stringify(shippoQuote).slice(0, 500)}`);
      const shippoQuoteRequests = shippoMockServer.requests.filter((request) => request.url === '/shipments/');
      assert(shippoQuoteRequests.length >= 2, `Shippo quote mock did not receive POST and GET shipment rate calls: ${JSON.stringify(shippoMockServer.requests)}`);
      assert(shippoQuoteRequests[0]?.headers.authorization === `ShippoToken ${process.env.BACKY_SHIPPO_API_KEY || process.env.SHIPPO_API_KEY}`, `Shippo quote mock did not receive token auth: ${JSON.stringify(shippoQuoteRequests[0]?.headers)}`);
      assert(shippoQuoteRequests[0]?.body?.address_from?.zip === '78701', `Shippo quote request did not include Settings origin address: ${JSON.stringify(shippoQuoteRequests[0]?.body)}`);
      assert(shippoQuoteRequests[0]?.body?.address_to?.zip === '94105', `Shippo quote request did not include order destination address: ${JSON.stringify(shippoQuoteRequests[0]?.body)}`);
      assert(Number(shippoQuoteRequests[0]?.body?.parcels?.[0]?.weight) === 16, `Shippo quote request did not include Settings default parcel: ${JSON.stringify(shippoQuoteRequests[0]?.body)}`);
    }

    if (stripeTaxExecutionEnabled()) {
      stripeTaxMockServer = await createStripeTaxMockServer();
      const httpProviderSettings = await getSettings();
      await enableCommerceQuoteProviders(httpProviderSettings, quoteProviderServer.baseUrl, { stripeTax: true });
      await clickOrderCardButton(client, orderNumber, 'Refresh Quote');
      expectedProviderTotal = 92.46;
      const stripeTaxQuotedOrder = await waitForOrderValue(
        collectionId,
        slug,
        (values) => (
          values.subtotal === 80 &&
          values.discountamount === 6.54 &&
          values.taxamount === 11.11 &&
          values.shippingamount === 7.89 &&
          values.total === expectedProviderTotal &&
          /Provider adjustments: tax:succeeded, shipping:succeeded, discount:succeeded/.test(String(values.notes || ''))
        ),
        'Refresh Quote did not persist Stripe Tax provider totals',
      );
      const stripeTaxQuotePayload = await requestApi(`/api/admin/sites/${SITE_ID}/commerce/orders/${stripeTaxQuotedOrder.id}/quote`);
      const stripeTaxQuote = stripeTaxQuotePayload.data?.quote;
      const stripeTaxAdjustment = stripeTaxQuote?.providerAdjustments?.find((item) => item.kind === 'tax');
      assert(stripeTaxAdjustment?.provider === 'stripe' && stripeTaxAdjustment.status === 'succeeded' && stripeTaxAdjustment.amount === 11.11, `Quote endpoint did not expose the Stripe Tax adjustment: ${JSON.stringify(stripeTaxQuote).slice(0, 500)}`);
      assert(stripeTaxMockServer.requests.length >= 2, `Stripe Tax mock did not receive POST and GET calculation calls: ${stripeTaxMockServer.requests.length}`);
      const expectedSecret = process.env.BACKY_STRIPE_SECRET_KEY || process.env.STRIPE_SECRET_KEY;
      assert(stripeTaxMockServer.requests[0]?.url === '/v1/tax/calculations', `Stripe Tax mock received unexpected URL: ${JSON.stringify(stripeTaxMockServer.requests)}`);
      assert(stripeTaxMockServer.requests[0]?.headers.authorization === `Bearer ${expectedSecret}`, `Stripe Tax mock did not receive bearer auth: ${JSON.stringify(stripeTaxMockServer.requests[0]?.headers)}`);
      assert(stripeTaxMockServer.requests[0]?.form.currency === 'usd', `Stripe Tax calculation did not send quote currency: ${JSON.stringify(stripeTaxMockServer.requests[0]?.form)}`);
      assert(stripeTaxMockServer.requests[0]?.form['customer_details[address][country]'] === 'US', `Stripe Tax calculation did not send customer country: ${JSON.stringify(stripeTaxMockServer.requests[0]?.form)}`);
    }

    if (stripeDiscountExecutionEnabled()) {
      if (!stripeTaxMockServer) {
        stripeTaxMockServer = await createStripeTaxMockServer();
      }
      const discountProviderSettings = await getSettings();
      const useStripeTax = stripeTaxExecutionEnabled();
      await enableCommerceQuoteProviders(discountProviderSettings, quoteProviderServer.baseUrl, { stripeTax: useStripeTax, stripeDiscount: true });
      await clickOrderCardButton(client, orderNumber, 'Refresh Quote');
      const expectedTaxAmount = useStripeTax ? 11.11 : 12.34;
      expectedProviderTotal = Number((80 - 8 + expectedTaxAmount + 7.89).toFixed(2));
      const stripeDiscountQuotedOrder = await waitForOrderValue(
        collectionId,
        slug,
        (values) => (
          values.subtotal === 80 &&
          values.discountamount === 8 &&
          values.taxamount === expectedTaxAmount &&
          values.shippingamount === 7.89 &&
          values.total === expectedProviderTotal &&
          /Provider adjustments: tax:succeeded, shipping:succeeded, discount:succeeded/.test(String(values.notes || ''))
        ),
        'Refresh Quote did not persist Stripe promotion-code discount totals',
      );
      const stripeDiscountQuotePayload = await requestApi(`/api/admin/sites/${SITE_ID}/commerce/orders/${stripeDiscountQuotedOrder.id}/quote`);
      const stripeDiscountQuote = stripeDiscountQuotePayload.data?.quote;
      const stripeDiscountAdjustment = stripeDiscountQuote?.providerAdjustments?.find((item) => item.kind === 'discount');
      assert(stripeDiscountAdjustment?.provider === 'stripe' && stripeDiscountAdjustment.status === 'succeeded' && stripeDiscountAdjustment.amount === 8, `Quote endpoint did not expose the Stripe discount adjustment: ${JSON.stringify(stripeDiscountQuote).slice(0, 500)}`);
      const promotionRequests = stripeTaxMockServer.requests.filter((request) => request.url === '/v1/promotion_codes');
      assert(promotionRequests.length >= 2, `Stripe discount mock did not receive POST and GET promotion-code lookups: ${JSON.stringify(stripeTaxMockServer.requests)}`);
      const expectedSecret = process.env.BACKY_STRIPE_SECRET_KEY || process.env.STRIPE_SECRET_KEY;
      assert(promotionRequests[0]?.headers.authorization === `Bearer ${expectedSecret}`, `Stripe discount mock did not receive bearer auth: ${JSON.stringify(promotionRequests[0]?.headers)}`);
      assert(promotionRequests[0]?.search.code === 'STRIPESMOKE', `Stripe discount lookup did not send the order discount code: ${JSON.stringify(promotionRequests[0])}`);
      assert(promotionRequests[0]?.search.active === 'true', `Stripe discount lookup did not restrict promotion codes to active values: ${JSON.stringify(promotionRequests[0])}`);
    }

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

    fulfillmentProviderServer = await createFulfillmentProviderServer();
    const preFulfillmentSettings = await getSettings();
    await enableCommerceFulfillmentProvider(preFulfillmentSettings, fulfillmentProviderServer.baseUrl);
    await clickOrderCardButton(client, orderNumber, 'Dispatch Fulfillment');
    const fulfillmentRecord = await waitForOrderValue(
      collectionId,
      slug,
      (values) => (
        values.orderstatus === 'paid' &&
        values.paymentstatus === 'paid' &&
        values.fulfillmentstatus === 'processing' &&
        values.fulfillmentdispatchstatus === 'requested' &&
        values.fulfillmentprovider === 'orders-smoke-warehouse' &&
        String(values.fulfillmentid || '').startsWith('ful_http_smoke_') &&
        Boolean(values.fulfillmentrequestedat) &&
        String(values.fulfillmentpayload || '').includes('backy.fulfillment-dispatch.v1') &&
        String(values.fulfillmentpayload || '').includes('http-provider') &&
        values.trackingnumber === 'WHSMOKE1' &&
        String(values.trackingurl || '').includes('/track/WHSMOKE1') &&
        /Fulfillment dispatch executed/.test(String(values.notes || ''))
      ),
      'Dispatch Fulfillment did not persist HTTP provider execution fields',
    );
    const fulfillmentPayload = await requestApi(`/api/admin/sites/${SITE_ID}/commerce/orders/${fulfillmentRecord.id}/fulfillment`);
    assert(fulfillmentPayload.data?.fulfillment?.id === fulfillmentRecord.values.fulfillmentid, `Fulfillment endpoint did not return the prepared handoff: ${JSON.stringify(fulfillmentPayload)}`);
    assert(fulfillmentPayload.data?.fulfillment?.providerPayload?.execution?.executionMode === 'http-provider', `Fulfillment endpoint did not expose HTTP provider execution metadata: ${JSON.stringify(fulfillmentPayload).slice(0, 500)}`);
    assert(fulfillmentProviderServer.requests.length >= 1, `Fulfillment provider server did not receive a dispatch call: ${fulfillmentProviderServer.requests.length}`);
    assert(fulfillmentProviderServer.requests[0]?.url === '/dispatch', `Fulfillment provider server received unexpected path: ${JSON.stringify(fulfillmentProviderServer.requests)}`);
    assert(fulfillmentProviderServer.requests[0]?.body?.fulfillment?.schemaVersion === 'backy.fulfillment-dispatch.v1', `Fulfillment provider request did not include dispatch payload: ${JSON.stringify(fulfillmentProviderServer.requests[0]?.body).slice(0, 500)}`);

    if (easyPostExecutionEnabled()) {
      if (!easyPostMockServer) {
        easyPostMockServer = await createEasyPostMockServer();
      }
      const preEasyPostSettings = await getSettings();
      await enableCommerceEasyPostLabelSettings(preEasyPostSettings);
    }
    await clickOrderCardButton(client, orderNumber, 'Prepare Label');
    await waitForOrderValue(
      collectionId,
      slug,
      (values) => (
        values.fulfillmentstatus === 'processing' &&
        values.shippinglabelstatus === (easyPostExecutionEnabled() ? 'purchased' : 'draft') &&
        values.shippinglabelprovider === 'UPS' &&
        Boolean(values.shippinglabelid) &&
        (easyPostExecutionEnabled()
          ? values.shippinglabelid === 'shp_smoke_1' && values.shippinglabelurl === 'https://labels.easypost.test/shp_smoke_1.pdf'
          : String(values.shippinglabelurl || '').includes('/shipping-label')) &&
        values.shippingservicelevel === (easyPostExecutionEnabled() ? 'Ground' : 'standard') &&
        Boolean(values.shippinglabelcreatedat) &&
        (easyPostExecutionEnabled()
          ? /Shipping label purchased/.test(String(values.notes || ''))
          : /Shipping label handoff prepared/.test(String(values.notes || '')))
      ),
      'Prepare Label did not persist shipment label handoff fields',
    );

    const preparedLabelRecord = await getCollectionRecordBySlug(collectionId, slug);
    const labelPayload = await requestApi(`/api/admin/sites/${SITE_ID}/commerce/orders/${preparedLabelRecord.id}/shipping-label`);
    assert(labelPayload.data?.label?.id === preparedLabelRecord.values.shippinglabelid, `Shipping label endpoint did not return the prepared label: ${JSON.stringify(labelPayload)}`);
    if (easyPostExecutionEnabled()) {
      assert(easyPostMockServer.requests.some((request) => request.url === '/v2/shipments'), `Rendered Prepare Label did not call EasyPost shipment create: ${JSON.stringify(easyPostMockServer.requests)}`);
      assert(easyPostMockServer.requests.some((request) => request.url === '/v2/shipments/shp_smoke_1/buy'), `Rendered Prepare Label did not call EasyPost shipment buy: ${JSON.stringify(easyPostMockServer.requests)}`);
    }

    await clickOrderCardButton(client, orderNumber, 'Void Label');
    await waitForOrderValue(
      collectionId,
      slug,
      (values) => (
        values.fulfillmentstatus === 'unfulfilled' &&
        values.shippinglabelstatus === 'voided' &&
        values.shippinglabelid === preparedLabelRecord.values.shippinglabelid &&
        /Shipping label voided/.test(String(values.notes || ''))
      ),
      'Void Label did not persist shipment label void fields',
    );

    const voidedLabelRecord = await getCollectionRecordBySlug(collectionId, slug);
    const voidedLabelPayload = await requestApi(`/api/admin/sites/${SITE_ID}/commerce/orders/${voidedLabelRecord.id}/shipping-label`);
    assert(voidedLabelPayload.data?.label?.status === 'voided', `Shipping label endpoint did not return the voided label: ${JSON.stringify(voidedLabelPayload)}`);
    if (easyPostExecutionEnabled()) {
      assert(easyPostMockServer.requests.some((request) => request.url === '/v2/shipments/shp_smoke_1/refund'), `Rendered Void Label did not call EasyPost shipment refund: ${JSON.stringify(easyPostMockServer.requests)}`);
    }

    await clickOrderCardButton(client, orderNumber, 'Prepare Label');
    await waitForOrderValue(
      collectionId,
      slug,
      (values) => (
        values.fulfillmentstatus === 'processing' &&
        values.shippinglabelstatus === (easyPostExecutionEnabled() ? 'purchased' : 'draft') &&
        values.shippinglabelprovider === 'UPS' &&
        Boolean(values.shippinglabelid) &&
        (!easyPostExecutionEnabled() ? values.shippinglabelid !== preparedLabelRecord.values.shippinglabelid : values.shippinglabelid === 'shp_smoke_1') &&
        (easyPostExecutionEnabled() ? values.shippinglabelurl === 'https://labels.easypost.test/shp_smoke_1.pdf' : String(values.shippinglabelurl || '').includes('/shipping-label')) &&
        values.shippingservicelevel === (easyPostExecutionEnabled() ? 'Ground' : 'standard') &&
        Boolean(values.shippinglabelcreatedat)
      ),
      'Prepare Label did not create a replacement shipment label after void',
    );

    await clickOrderCardButton(client, orderNumber, 'Refresh Tracking');
    await waitForOrderValue(
      collectionId,
      slug,
      (values) => (
        values.orderstatus === (easyPostExecutionEnabled() ? 'fulfilled' : 'paid') &&
        values.fulfillmentstatus === (easyPostExecutionEnabled() ? 'fulfilled' : 'processing') &&
        values.trackingnumber === 'WHSMOKE1' &&
        values.trackingstatus === (easyPostExecutionEnabled() ? 'delivered' : 'processing') &&
        Boolean(values.trackinglastcheckedat) &&
        (!easyPostExecutionEnabled() || values.trackingurl === 'https://track.easypost.test/EZTRACK1') &&
        /Tracking refreshed/.test(String(values.notes || ''))
      ),
      'Refresh Tracking did not persist tracking status fields',
    );

    const trackingRecord = await getCollectionRecordBySlug(collectionId, slug);
    const trackingPayload = await requestApi(`/api/admin/sites/${SITE_ID}/commerce/orders/${trackingRecord.id}/tracking`);
    assert(trackingPayload.data?.tracking?.status === (easyPostExecutionEnabled() ? 'delivered' : 'processing'), `Tracking endpoint did not return refreshed status: ${JSON.stringify(trackingPayload)}`);

    if (!easyPostExecutionEnabled()) {
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
    }

    if (easyPostExecutionEnabled()) {
      await verifyEasyPostProviderExecution(collectionId, slug, suffix, easyPostMockServer);
    }
    if (shippoExecutionEnabled()) {
      if (!shippoMockServer) {
        shippoMockServer = await createShippoMockServer();
      }
      await verifyShippoProviderExecution(collectionId, slug, shippoMockServer);
    }

    await clickOrderCardButton(client, orderNumber, 'Record Refund/Return');
    await waitForOrderValue(
      collectionId,
      slug,
      (values) => (
        values.orderstatus === 'refunded' &&
        values.paymentstatus === 'refunded' &&
        values.fulfillmentstatus === 'cancelled' &&
        Number(values.refundamount) === expectedProviderTotal &&
        values.refundreason === 'Customer return/refund manually recorded from Backy order workflow.' &&
        /Manual refund\/return state recorded in Backy/.test(String(values.notes || '')) &&
        /Provider refund, if required, must be completed in the payment provider/.test(String(values.notes || ''))
      ),
      'Refund/Return did not persist refund workflow fields',
    );

    const providerRefundExecutionProvider = paypalRefundExecutionEnabled()
      ? 'paypal'
      : paddleRefundExecutionEnabled()
        ? 'paddle'
        : squareRefundExecutionEnabled()
          ? 'square'
          : adyenRefundExecutionEnabled()
            ? 'adyen'
            : mollieRefundExecutionEnabled()
              ? 'mollie'
              : razorpayRefundExecutionEnabled()
                ? 'razorpay'
                : stripeRefundExecutionEnabled()
                  ? 'stripe'
                  : 'manual';

    if (providerRefundExecutionProvider === 'paypal') {
      paypalRefundMockServer = await createPayPalRefundMockServer();
      await preparePayPalProviderRefundThroughUi(client, orderNumber, suffix);
    } else if (providerRefundExecutionProvider === 'paddle') {
      paddleRefundMockServer = await createPaddleRefundMockServer();
      await preparePaddleProviderRefundThroughUi(client, orderNumber, suffix);
    } else if (providerRefundExecutionProvider === 'square') {
      squareRefundMockServer = await createSquareRefundMockServer();
      await prepareSquareProviderRefundThroughUi(client, orderNumber, suffix);
    } else if (providerRefundExecutionProvider === 'adyen') {
      adyenRefundMockServer = await createAdyenRefundMockServer();
      await prepareAdyenProviderRefundThroughUi(client, orderNumber, suffix);
    } else if (providerRefundExecutionProvider === 'mollie') {
      mollieRefundMockServer = await createMollieRefundMockServer();
      await prepareMollieProviderRefundThroughUi(client, orderNumber, suffix);
    } else if (providerRefundExecutionProvider === 'razorpay') {
      razorpayRefundMockServer = await createRazorpayRefundMockServer();
      await prepareRazorpayProviderRefundThroughUi(client, orderNumber, suffix);
    } else if (providerRefundExecutionProvider === 'stripe') {
      stripeRefundMockServer = await createStripeRefundMockServer();
      await prepareStripeProviderRefundThroughUi(client, orderNumber, suffix);
    }
    await clickOrderCardButton(client, orderNumber, 'Provider Refund');
    const providerRefundRecord = await waitForOrderValue(
      collectionId,
      slug,
      (values) => (
        values.orderstatus === 'refunded' &&
        values.paymentstatus === 'refunded' &&
        values.fulfillmentstatus === 'cancelled' &&
        values.providerrefundstatus === (
          providerRefundExecutionProvider === 'manual'
            ? 'requires_action'
            : providerRefundExecutionProvider === 'razorpay'
              ? 'requested'
              : 'succeeded'
        ) &&
        values.providerrefundprovider === providerRefundExecutionProvider &&
        Boolean(values.providerrefundid) &&
        String(values.providerrefundreference || '').includes(String(values.providerrefundid || '')) &&
        Number(values.providerrefundamount) === expectedProviderTotal &&
        values.providerrefundreason === 'Customer return/refund manually recorded from Backy order workflow.' &&
        Boolean(values.providerrefundrequestedat) &&
        (providerRefundExecutionProvider === 'manual' || providerRefundExecutionProvider === 'razorpay' || Boolean(values.providerrefundcompletedat)) &&
        String(values.providerrefundpayload || '').includes('backy.provider-refund.v1') &&
        (providerRefundExecutionProvider !== 'manual'
          ? new RegExp(`Provider refund executed ${providerRefundExecutionProvider === 'razorpay' ? 'requested' : 'succeeded'}`).test(String(values.notes || '')) && String(values.providerrefundpayload || '').includes(`${providerRefundExecutionProvider}-api`)
          : /Provider refund handoff/.test(String(values.notes || '')))
      ),
      'Provider Refund did not persist provider refund fields',
    );

    const providerRefundPayload = await requestApi(`/api/admin/sites/${SITE_ID}/commerce/orders/${providerRefundRecord.id}/provider-refund`);
    assert(providerRefundPayload.data?.refund?.id === providerRefundRecord.values.providerrefundid, `Provider refund endpoint did not return the prepared refund: ${JSON.stringify(providerRefundPayload)}`);
    if (providerRefundExecutionProvider === 'manual') {
      await assertOrderCardButtonEnabled(client, orderNumber, 'Retry Provider Refund');
    }
    if (providerRefundExecutionProvider === 'paypal') {
      const persistedProviderPayload = JSON.parse(String(providerRefundRecord.values.providerrefundpayload || '{}'));
      assert(paypalRefundMockServer.requests.length >= 1, `PayPal refund mock did not receive a refund request: ${paypalRefundMockServer.requests.length}`);
      const paypalRefundRequest = paypalRefundMockServer.requests[0];
      const expectedToken = process.env.BACKY_PAYPAL_ACCESS_TOKEN || process.env.PAYPAL_ACCESS_TOKEN;
      assert(paypalRefundRequest.url === `/v2/payments/captures/cap_refund_${suffix}/refund`, `PayPal refund mock received unexpected URL: ${JSON.stringify(paypalRefundMockServer.requests)}`);
      assert(paypalRefundRequest.headers.authorization === `Bearer ${expectedToken}`, `PayPal refund mock did not receive bearer auth: ${JSON.stringify(paypalRefundRequest.headers)}`);
      assert(/^rf_/.test(String(paypalRefundRequest.headers['paypal-request-id'] || '')), `PayPal refund request did not include idempotency header: ${JSON.stringify(paypalRefundRequest.headers)}`);
      assert(paypalRefundRequest.body.amount?.value === expectedProviderTotal.toFixed(2), `PayPal refund body amount did not match order total: ${JSON.stringify(paypalRefundRequest.body)}`);
      assert(paypalRefundRequest.body.amount?.currency_code === 'USD', `PayPal refund body currency did not match order currency: ${JSON.stringify(paypalRefundRequest.body)}`);
      assert(/^rf_/.test(String(paypalRefundRequest.body.custom_id || '')), `PayPal refund body did not include the internal refund id: ${JSON.stringify(paypalRefundRequest.body)}`);
      assert(String(providerRefundRecord.values.providerrefundid || '').startsWith('paypal_refund_smoke_'), `Provider refund did not persist the PayPal refund id: ${JSON.stringify(providerRefundRecord.values)}`);
      assert(persistedProviderPayload.action === 'payments.captures.refund', `Provider refund payload did not persist the PayPal refund action: ${JSON.stringify(persistedProviderPayload)}`);
      assert(persistedProviderPayload.execution?.ok === true, `Provider refund payload did not persist a successful PayPal execution: ${JSON.stringify(persistedProviderPayload)}`);
      assert(persistedProviderPayload.execution?.payload?.id === providerRefundRecord.values.providerrefundid, `Provider refund payload did not persist the returned PayPal refund id: ${JSON.stringify(persistedProviderPayload)}`);
      assert(persistedProviderPayload.executionMode === 'paypal-api', `Provider refund payload did not persist PayPal execution mode: ${JSON.stringify(persistedProviderPayload)}`);
    } else if (providerRefundExecutionProvider === 'paddle') {
      const persistedProviderPayload = JSON.parse(String(providerRefundRecord.values.providerrefundpayload || '{}'));
      assert(paddleRefundMockServer.requests.length >= 1, `Paddle refund mock did not receive a refund request: ${paddleRefundMockServer.requests.length}`);
      const paddleRefundRequest = paddleRefundMockServer.requests[0];
      const expectedKey = process.env.BACKY_PADDLE_API_KEY || process.env.PADDLE_API_KEY;
      assert(paddleRefundRequest.url === '/adjustments', `Paddle refund mock received unexpected URL: ${JSON.stringify(paddleRefundMockServer.requests)}`);
      assert(paddleRefundRequest.headers.authorization === `Bearer ${expectedKey}`, `Paddle refund mock did not receive bearer auth: ${JSON.stringify(paddleRefundRequest.headers)}`);
      assert(paddleRefundRequest.body.action === 'refund', `Paddle refund body did not request a refund adjustment: ${JSON.stringify(paddleRefundRequest.body)}`);
      assert(paddleRefundRequest.body.type === 'full', `Paddle refund body did not request a full refund: ${JSON.stringify(paddleRefundRequest.body)}`);
      assert(paddleRefundRequest.body.transaction_id === `txn_paddle_${suffix}`, `Paddle refund body did not include transaction id: ${JSON.stringify(paddleRefundRequest.body)}`);
      assert(/^rf_/.test(String(paddleRefundRequest.body.custom_data?.backyRefundId || '')), `Paddle refund body did not include internal refund metadata: ${JSON.stringify(paddleRefundRequest.body)}`);
      assert(String(providerRefundRecord.values.providerrefundid || '').startsWith('adj_paddle_smoke_'), `Provider refund did not persist the Paddle adjustment id: ${JSON.stringify(providerRefundRecord.values)}`);
      assert(persistedProviderPayload.action === 'adjustments.create', `Provider refund payload did not persist the Paddle action: ${JSON.stringify(persistedProviderPayload)}`);
      assert(persistedProviderPayload.execution?.ok === true, `Provider refund payload did not persist a successful Paddle execution: ${JSON.stringify(persistedProviderPayload)}`);
      assert(persistedProviderPayload.execution?.payload?.id === providerRefundRecord.values.providerrefundid, `Provider refund payload did not persist the returned Paddle adjustment id: ${JSON.stringify(persistedProviderPayload)}`);
      assert(persistedProviderPayload.executionMode === 'paddle-api', `Provider refund payload did not persist Paddle execution mode: ${JSON.stringify(persistedProviderPayload)}`);
    } else if (providerRefundExecutionProvider === 'square') {
      const persistedProviderPayload = JSON.parse(String(providerRefundRecord.values.providerrefundpayload || '{}'));
      assert(squareRefundMockServer.requests.length >= 1, `Square refund mock did not receive a refund request: ${squareRefundMockServer.requests.length}`);
      const squareRefundRequest = squareRefundMockServer.requests[0];
      const expectedToken = process.env.BACKY_SQUARE_ACCESS_TOKEN || process.env.SQUARE_ACCESS_TOKEN;
      const expectedVersion = process.env.BACKY_SQUARE_VERSION || process.env.SQUARE_VERSION || '2026-01-22';
      assert(squareRefundRequest.url === '/v2/refunds', `Square refund mock received unexpected URL: ${JSON.stringify(squareRefundMockServer.requests)}`);
      assert(squareRefundRequest.headers.authorization === `Bearer ${expectedToken}`, `Square refund mock did not receive bearer auth: ${JSON.stringify(squareRefundRequest.headers)}`);
      assert(squareRefundRequest.headers['square-version'] === expectedVersion, `Square refund mock did not receive the expected version header: ${JSON.stringify(squareRefundRequest.headers)}`);
      assert(/^rf_/.test(String(squareRefundRequest.body.idempotency_key || '')), `Square refund body did not include idempotency key: ${JSON.stringify(squareRefundRequest.body)}`);
      assert(squareRefundRequest.body.payment_id === `sq_payment_${suffix}`, `Square refund body did not include payment id: ${JSON.stringify(squareRefundRequest.body)}`);
      assert(Number(squareRefundRequest.body.amount_money?.amount) === Math.round(expectedProviderTotal * 100), `Square refund body amount did not match order total: ${JSON.stringify(squareRefundRequest.body)}`);
      assert(squareRefundRequest.body.amount_money?.currency === 'USD', `Square refund body currency did not match order currency: ${JSON.stringify(squareRefundRequest.body)}`);
      assert(String(providerRefundRecord.values.providerrefundid || '').startsWith('sq_refund_smoke_'), `Provider refund did not persist the Square refund id: ${JSON.stringify(providerRefundRecord.values)}`);
      assert(persistedProviderPayload.action === 'refunds.create', `Provider refund payload did not persist the Square refund action: ${JSON.stringify(persistedProviderPayload)}`);
      assert(persistedProviderPayload.execution?.ok === true, `Provider refund payload did not persist a successful Square execution: ${JSON.stringify(persistedProviderPayload)}`);
      assert(persistedProviderPayload.execution?.payload?.id === providerRefundRecord.values.providerrefundid, `Provider refund payload did not persist the returned Square refund id: ${JSON.stringify(persistedProviderPayload)}`);
      assert(persistedProviderPayload.executionMode === 'square-api', `Provider refund payload did not persist Square execution mode: ${JSON.stringify(persistedProviderPayload)}`);
    } else if (providerRefundExecutionProvider === 'adyen') {
      const persistedProviderPayload = JSON.parse(String(providerRefundRecord.values.providerrefundpayload || '{}'));
      assert(adyenRefundMockServer.requests.length >= 1, `Adyen refund mock did not receive a refund request: ${adyenRefundMockServer.requests.length}`);
      const adyenRefundRequest = adyenRefundMockServer.requests[0];
      const expectedKey = process.env.BACKY_ADYEN_API_KEY || process.env.ADYEN_API_KEY;
      const expectedMerchantAccount = process.env.BACKY_ADYEN_MERCHANT_ACCOUNT || process.env.ADYEN_MERCHANT_ACCOUNT;
      assert(adyenRefundRequest.url === `/payments/adyen_payment_${suffix}/refunds`, `Adyen refund mock received unexpected URL: ${JSON.stringify(adyenRefundMockServer.requests)}`);
      assert(adyenRefundRequest.headers['x-api-key'] === expectedKey, `Adyen refund mock did not receive API key auth: ${JSON.stringify(adyenRefundRequest.headers)}`);
      assert(adyenRefundRequest.body.merchantAccount === expectedMerchantAccount, `Adyen refund body did not include merchant account: ${JSON.stringify(adyenRefundRequest.body)}`);
      assert(/^rf_/.test(String(adyenRefundRequest.body.reference || '')), `Adyen refund body did not include internal reference: ${JSON.stringify(adyenRefundRequest.body)}`);
      assert(Number(adyenRefundRequest.body.amount?.value) === Math.round(expectedProviderTotal * 100), `Adyen refund body amount did not match order total: ${JSON.stringify(adyenRefundRequest.body)}`);
      assert(adyenRefundRequest.body.amount?.currency === 'USD', `Adyen refund body currency did not match order currency: ${JSON.stringify(adyenRefundRequest.body)}`);
      assert(String(providerRefundRecord.values.providerrefundid || '').startsWith('adyen_refund_smoke_'), `Provider refund did not persist the Adyen refund id: ${JSON.stringify(providerRefundRecord.values)}`);
      assert(persistedProviderPayload.action === 'payments.refunds.create', `Provider refund payload did not persist the Adyen refund action: ${JSON.stringify(persistedProviderPayload)}`);
      assert(persistedProviderPayload.execution?.ok === true, `Provider refund payload did not persist a successful Adyen execution: ${JSON.stringify(persistedProviderPayload)}`);
      assert(persistedProviderPayload.execution?.payload?.pspReference === providerRefundRecord.values.providerrefundid, `Provider refund payload did not persist the returned Adyen refund id: ${JSON.stringify(persistedProviderPayload)}`);
      assert(persistedProviderPayload.executionMode === 'adyen-api', `Provider refund payload did not persist Adyen execution mode: ${JSON.stringify(persistedProviderPayload)}`);
    } else if (providerRefundExecutionProvider === 'mollie') {
      const persistedProviderPayload = JSON.parse(String(providerRefundRecord.values.providerrefundpayload || '{}'));
      assert(mollieRefundMockServer.requests.length >= 1, `Mollie refund mock did not receive a refund request: ${mollieRefundMockServer.requests.length}`);
      const mollieRefundRequest = mollieRefundMockServer.requests[0];
      const expectedKey = process.env.BACKY_MOLLIE_API_KEY || process.env.MOLLIE_API_KEY;
      assert(mollieRefundRequest.url === `/payments/tr_mollie_${suffix}/refunds`, `Mollie refund mock received unexpected URL: ${JSON.stringify(mollieRefundMockServer.requests)}`);
      assert(mollieRefundRequest.headers.authorization === `Bearer ${expectedKey}`, `Mollie refund mock did not receive bearer auth: ${JSON.stringify(mollieRefundRequest.headers)}`);
      assert(mollieRefundRequest.body.amount?.value === expectedProviderTotal.toFixed(2), `Mollie refund body amount did not match order total: ${JSON.stringify(mollieRefundRequest.body)}`);
      assert(mollieRefundRequest.body.amount?.currency === 'USD', `Mollie refund body currency did not match order currency: ${JSON.stringify(mollieRefundRequest.body)}`);
      assert(/^rf_/.test(String(mollieRefundRequest.body.metadata?.backyRefundId || '')), `Mollie refund body did not include internal refund metadata: ${JSON.stringify(mollieRefundRequest.body)}`);
      assert(String(providerRefundRecord.values.providerrefundid || '').startsWith('re_mollie_smoke_'), `Provider refund did not persist the Mollie refund id: ${JSON.stringify(providerRefundRecord.values)}`);
      assert(persistedProviderPayload.action === 'payments.refunds.create', `Provider refund payload did not persist the Mollie refund action: ${JSON.stringify(persistedProviderPayload)}`);
      assert(persistedProviderPayload.execution?.ok === true, `Provider refund payload did not persist a successful Mollie execution: ${JSON.stringify(persistedProviderPayload)}`);
      assert(persistedProviderPayload.execution?.payload?.id === providerRefundRecord.values.providerrefundid, `Provider refund payload did not persist the returned Mollie refund id: ${JSON.stringify(persistedProviderPayload)}`);
      assert(persistedProviderPayload.execution?.payload?.amount?.value === expectedProviderTotal.toFixed(2), `Provider refund payload did not preserve the returned Mollie amount value: ${JSON.stringify(persistedProviderPayload)}`);
      assert(persistedProviderPayload.execution?.payload?.amount?.currency === 'USD', `Provider refund payload did not preserve the returned Mollie amount currency: ${JSON.stringify(persistedProviderPayload)}`);
      assert(persistedProviderPayload.executionMode === 'mollie-api', `Provider refund payload did not persist Mollie execution mode: ${JSON.stringify(persistedProviderPayload)}`);
    } else if (providerRefundExecutionProvider === 'razorpay') {
      const persistedProviderPayload = JSON.parse(String(providerRefundRecord.values.providerrefundpayload || '{}'));
      assert(razorpayRefundMockServer.requests.length >= 1, `Razorpay refund mock did not receive a refund request: ${razorpayRefundMockServer.requests.length}`);
      const razorpayRefundRequest = razorpayRefundMockServer.requests[0];
      const expectedKeyId = process.env.BACKY_RAZORPAY_KEY_ID || process.env.RAZORPAY_KEY_ID;
      const expectedKeySecret = process.env.BACKY_RAZORPAY_KEY_SECRET || process.env.RAZORPAY_KEY_SECRET;
      const expectedAuth = `Basic ${Buffer.from(`${expectedKeyId}:${expectedKeySecret}`).toString('base64')}`;
      assert(razorpayRefundRequest.url === `/v1/payments/pay_refund_${suffix}/refund`, `Razorpay refund mock received unexpected URL: ${JSON.stringify(razorpayRefundMockServer.requests)}`);
      assert(razorpayRefundRequest.headers.authorization === expectedAuth, `Razorpay refund mock did not receive basic auth: ${JSON.stringify(razorpayRefundRequest.headers)}`);
      assert(Number(razorpayRefundRequest.body.amount) === Math.round(expectedProviderTotal * 100), `Razorpay refund body amount did not match order total: ${JSON.stringify(razorpayRefundRequest.body)}`);
      assert(/^rf_/.test(String(razorpayRefundRequest.body.receipt || '')), `Razorpay refund body did not include receipt idempotency: ${JSON.stringify(razorpayRefundRequest.body)}`);
      assert(/^rf_/.test(String(razorpayRefundRequest.body.notes?.backyRefundId || '')), `Razorpay refund body did not include internal refund metadata: ${JSON.stringify(razorpayRefundRequest.body)}`);
      assert(String(providerRefundRecord.values.providerrefundid || '').startsWith('rfnd_razorpay_smoke_'), `Provider refund did not persist the Razorpay refund id: ${JSON.stringify(providerRefundRecord.values)}`);
      assert(persistedProviderPayload.action === 'payments.refund', `Provider refund payload did not persist the Razorpay refund action: ${JSON.stringify(persistedProviderPayload)}`);
      assert(persistedProviderPayload.execution?.ok === true, `Provider refund payload did not persist a successful Razorpay execution: ${JSON.stringify(persistedProviderPayload)}`);
      assert(persistedProviderPayload.execution?.payload?.id === providerRefundRecord.values.providerrefundid, `Provider refund payload did not persist the returned Razorpay refund id: ${JSON.stringify(persistedProviderPayload)}`);
      assert(persistedProviderPayload.executionMode === 'razorpay-api', `Provider refund payload did not persist Razorpay execution mode: ${JSON.stringify(persistedProviderPayload)}`);
    } else if (providerRefundExecutionProvider === 'stripe') {
      const persistedProviderPayload = JSON.parse(String(providerRefundRecord.values.providerrefundpayload || '{}'));
      assert(stripeRefundMockServer.requests.length >= 1, `Stripe refund mock did not receive a refund request: ${stripeRefundMockServer.requests.length}`);
      const stripeRefundRequest = stripeRefundMockServer.requests[0];
      const expectedSecret = process.env.BACKY_STRIPE_SECRET_KEY || process.env.STRIPE_SECRET_KEY;
      assert(stripeRefundRequest.url === '/v1/refunds', `Stripe refund mock received unexpected URL: ${JSON.stringify(stripeRefundMockServer.requests)}`);
      assert(stripeRefundRequest.headers.authorization === `Bearer ${expectedSecret}`, `Stripe refund mock did not receive bearer auth: ${JSON.stringify(stripeRefundRequest.headers)}`);
      assert(stripeRefundRequest.form.payment_intent === `pi_refund_${suffix}`, `Stripe refund form did not include the payment intent: ${JSON.stringify(stripeRefundRequest.form)}`);
      assert(Number(stripeRefundRequest.form.amount) === Math.round(expectedProviderTotal * 100), `Stripe refund form amount did not match order total: ${JSON.stringify(stripeRefundRequest.form)}`);
      assert(/^rf_/.test(String(stripeRefundRequest.form['metadata[backy_refund_id]'] || '')), `Stripe refund form did not include the internal refund metadata: ${JSON.stringify(stripeRefundRequest.form)}`);
      assert(String(providerRefundRecord.values.providerrefundid || '').startsWith('re_smoke_'), `Provider refund did not persist the Stripe refund id: ${JSON.stringify(providerRefundRecord.values)}`);
      assert(persistedProviderPayload.execution?.ok === true, `Provider refund payload did not persist a successful Stripe execution: ${JSON.stringify(persistedProviderPayload)}`);
      assert(persistedProviderPayload.execution?.payload?.id === providerRefundRecord.values.providerrefundid, `Provider refund payload did not persist the returned Stripe refund id: ${JSON.stringify(persistedProviderPayload)}`);
      assert(persistedProviderPayload.executionMode === 'stripe-api', `Provider refund payload did not persist Stripe execution mode: ${JSON.stringify(persistedProviderPayload)}`);
    }

    if (['paypal', 'paddle', 'square', 'mollie', 'razorpay', 'stripe'].includes(providerRefundExecutionProvider)) {
      let pendingRefundId = String(providerRefundRecord.values.providerrefundid || '');
      if (providerRefundExecutionProvider !== 'razorpay') {
        pendingRefundId = `${providerRefundExecutionProvider}_refresh_${suffix}`;
        const latestOrder = await getCollectionRecordBySlug(collectionId, slug);
        await updateCollectionRecord(collectionId, latestOrder.id, {
          status: 'published',
          values: {
            ...latestOrder.values,
            providerrefundstatus: 'requested',
            providerrefundprovider: providerRefundExecutionProvider,
            providerrefundid: pendingRefundId,
            providerrefundreference: `${providerRefundExecutionProvider}:${pendingRefundId}`,
            providerrefundcompletedat: '',
            providerrefundpayload: JSON.stringify({
              schemaVersion: 'backy.provider-refund.v1',
              action: 'provider.refund.refresh.smoke',
              provider: providerRefundExecutionProvider,
              executionMode: `${providerRefundExecutionProvider}-api`,
              idempotencyKey: pendingRefundId,
            }),
            notes: 'Order smoke reset to pending provider refund before refresh.',
          },
        });
        await waitForOrderValue(
          collectionId,
          slug,
          (values) => values.providerrefundstatus === 'requested' && values.providerrefundid === pendingRefundId,
          'Provider refund pending refresh setup did not persist',
        );
        await navigateToOrders(client, { orderId: latestOrder.id });
        await clickByText(client, 'Refresh', { exact: true });
        await waitUntilIdle(client, '/orders provider refund refresh setup');
      }
      await assertOrderCardButtonEnabled(client, orderNumber, 'Refresh Provider Refund');
      await clickOrderCardButton(client, orderNumber, 'Refresh Provider Refund');
      const refreshedProviderRefundRecord = await waitForOrderValue(
        collectionId,
        slug,
        (values) => (
          values.providerrefundstatus === 'succeeded' &&
          values.providerrefundid === pendingRefundId &&
          Boolean(values.providerrefundcompletedat) &&
          String(values.providerrefundpayload || '').includes('"refresh"') &&
          /Provider refund refresh reconciled succeeded/.test(String(values.notes || ''))
        ),
        'Provider Refund refresh did not reconcile the pending provider refund',
      );
      const refreshedProviderPayload = JSON.parse(String(refreshedProviderRefundRecord.values.providerrefundpayload || '{}'));
      assert(refreshedProviderPayload.refresh?.ok === true, `Provider refund refresh payload did not persist a successful refresh: ${JSON.stringify(refreshedProviderPayload)}`);
      assert(refreshedProviderPayload.refresh?.executionMode === `${providerRefundExecutionProvider}-api`, `Provider refund refresh payload did not persist the execution mode: ${JSON.stringify(refreshedProviderPayload)}`);
      if (providerRefundExecutionProvider === 'mollie') {
        assert(refreshedProviderPayload.refresh?.payload?.amount?.value === '12.34', `Mollie refund refresh payload did not preserve amount.value: ${JSON.stringify(refreshedProviderPayload)}`);
        assert(refreshedProviderPayload.refresh?.payload?.amount?.currency === 'USD', `Mollie refund refresh payload did not preserve amount.currency: ${JSON.stringify(refreshedProviderPayload)}`);
      }
      const providerRefundMockServer = providerRefundExecutionProvider === 'paypal'
        ? paypalRefundMockServer
        : providerRefundExecutionProvider === 'paddle'
          ? paddleRefundMockServer
          : providerRefundExecutionProvider === 'square'
            ? squareRefundMockServer
            : providerRefundExecutionProvider === 'mollie'
              ? mollieRefundMockServer
              : providerRefundExecutionProvider === 'razorpay'
                ? razorpayRefundMockServer
                : stripeRefundMockServer;
      const refreshRequest = providerRefundMockServer.requests.find((request) => request.method === 'GET' && String(request.url || '').includes(pendingRefundId));
      assert(refreshRequest, `Provider refund refresh did not query the ${providerRefundExecutionProvider} mock: ${JSON.stringify(providerRefundMockServer.requests)}`);
    } else if (providerRefundExecutionProvider === 'manual') {
      await clickOrderCardButton(client, orderNumber, 'Refresh Provider Refund');
      const refreshedManualProviderRefundRecord = await waitForOrderValue(
        collectionId,
        slug,
        (values) => (
          values.providerrefundstatus === 'requires_action' &&
          String(values.providerrefundpayload || '').includes('"refresh"') &&
          String(values.providerrefundpayload || '').includes('"executionMode": "handoff"') &&
          /Provider refund refresh handoff requires_action/.test(String(values.notes || ''))
        ),
        'Manual provider refund refresh did not persist a handoff refresh payload',
      );
      const refreshedManualProviderPayload = JSON.parse(String(refreshedManualProviderRefundRecord.values.providerrefundpayload || '{}'));
      assert(refreshedManualProviderPayload.refresh?.ok === false, `Manual provider refund refresh should persist a handoff result: ${JSON.stringify(refreshedManualProviderPayload)}`);
    }

    const refundFailureSeed = await getCollectionRecordBySlug(collectionId, slug);
    await postCommerceWebhook(
      {
        id: `evt_orders_refund_failed_${suffix}`,
        type: 'refund.failed',
        data: {
          object: {
            id: refundFailureSeed.values.providerrefundid,
            paymentReference: refundFailureSeed.values.paymentreference,
            provider: refundFailureSeed.values.providerrefundprovider || providerRefundExecutionProvider,
            amount_refunded: Math.round(expectedProviderTotal * 100),
            failure_reason: 'Provider refund failed in smoke.',
            metadata: {
              orderNumber,
              orderSlug: slug,
            },
          },
        },
      },
    );
    await waitForOrderValue(
      collectionId,
      slug,
      (values) => (
        values.providerrefundstatus === 'failed' &&
        values.providerrefundid === refundFailureSeed.values.providerrefundid &&
        values.providerrefundreason === 'Provider refund failed in smoke.' &&
        values.paymentstatus === 'paid' &&
        String(values.providerrefundpayload || '').includes('"webhook"') &&
        String(values.providerrefundpayload || '').includes('"type": "refund.failed"') &&
        /Commerce webhook refund.failed/.test(String(values.notes || ''))
      ),
      'Provider refund failure webhook did not persist failed refund status',
    );

    const refundReversalSeed = await getCollectionRecordBySlug(collectionId, slug);
    await updateCollectionRecord(collectionId, refundReversalSeed.id, {
      status: 'published',
      values: {
        ...refundReversalSeed.values,
        paymentstatus: 'paid',
        providerrefundstatus: 'requested',
        providerrefundprovider: 'adyen',
        providerrefundid: `adyen_refund_pending_${suffix}`,
        providerrefundreference: `adyen:adyen_refund_pending_${suffix}`,
        providerrefundcompletedat: '',
        providerrefundpayload: JSON.stringify({
          schemaVersion: 'backy.provider-refund.v1',
          provider: 'adyen',
          executionMode: 'adyen-api',
        }),
        notes: 'Order smoke reset to pending Adyen refund before reversed webhook.',
      },
    });
    await waitForOrderValue(
      collectionId,
      slug,
      (values) => values.providerrefundstatus === 'requested' && values.providerrefundprovider === 'adyen',
      'Adyen refund reversal setup did not persist',
    );
    await postCommerceWebhook(
      {
        notificationItems: [{
          NotificationRequestItem: {
            eventCode: 'REFUNDED_REVERSED',
            pspReference: `adyen_refund_reversed_${suffix}`,
            originalReference: refundReversalSeed.values.paymentreference,
            merchantReference: orderNumber,
            success: 'true',
            reason: 'Adyen refund reversed in smoke.',
          },
        }],
      },
    );
    await waitForOrderValue(
      collectionId,
      slug,
      (values) => (
        values.providerrefundstatus === 'requires_action' &&
        values.providerrefundprovider === 'adyen' &&
        values.providerrefundid === `adyen_refund_reversed_${suffix}` &&
        values.providerrefundreason === 'Adyen refund reversed in smoke.' &&
        String(values.providerrefundpayload || '').includes('"webhook"') &&
        String(values.providerrefundpayload || '').includes('"type": "REFUNDED_REVERSED"') &&
        String(values.providerrefundpayload || '').includes('"pspReference": "adyen_refund_reversed_') &&
        /Commerce webhook REFUNDED_REVERSED/.test(String(values.notes || ''))
      ),
      'Adyen refund reversed webhook did not persist requires-action refund status',
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
        Number(values.refundamount) === expectedProviderTotal &&
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
        paymentreference: '',
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
    assert(reconciledAnalytics.revenue?.paidTotal >= expectedProviderTotal, `Order analytics paid revenue was too low after reconciliation: ${JSON.stringify(reconciledAnalytics).slice(0, 500)}`);
    assert(reconciledAnalytics.operations?.fulfillmentBacklogCount >= 1, `Order analytics did not report fulfillment backlog after reconciliation: ${JSON.stringify(reconciledAnalytics).slice(0, 500)}`);
    assert(reconciledAnalytics.providerOperations?.attention?.providerRefundRequiresActionCount >= 0, `Order analytics did not expose provider attention counters: ${JSON.stringify(reconciledAnalytics.providerOperations).slice(0, 500)}`);
    assert(reconciledAnalytics.providerOperations?.paymentProviders?.some((provider) => provider.statuses.paid >= 1), `Order analytics did not update payment provider status mix after reconciliation: ${JSON.stringify(reconciledAnalytics.providerOperations).slice(0, 500)}`);

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
    if (quoteProviderServer) {
      await quoteProviderServer.close().catch(() => {});
    }
    if (stripeTaxMockServer) {
      await stripeTaxMockServer.close().catch(() => {});
    }
    if (taxJarMockServer) {
      await taxJarMockServer.close().catch(() => {});
    }
    if (avalaraMockServer) {
      await avalaraMockServer.close().catch(() => {});
    }
    if (stripeRefundMockServer) {
      await stripeRefundMockServer.close().catch(() => {});
    }
    if (paypalRefundMockServer) {
      await paypalRefundMockServer.close().catch(() => {});
    }
    if (paddleRefundMockServer) {
      await paddleRefundMockServer.close().catch(() => {});
    }
    if (squareRefundMockServer) {
      await squareRefundMockServer.close().catch(() => {});
    }
    if (adyenRefundMockServer) {
      await adyenRefundMockServer.close().catch(() => {});
    }
    if (mollieRefundMockServer) {
      await mollieRefundMockServer.close().catch(() => {});
    }
    if (razorpayRefundMockServer) {
      await razorpayRefundMockServer.close().catch(() => {});
    }
    if (easyPostMockServer) {
      await easyPostMockServer.close().catch(() => {});
    }
    if (shippoMockServer) {
      await shippoMockServer.close().catch(() => {});
    }
    if (fulfillmentProviderServer) {
      await fulfillmentProviderServer.close().catch(() => {});
    }
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
