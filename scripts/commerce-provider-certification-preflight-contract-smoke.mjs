#!/usr/bin/env node

import fs from 'node:fs';

const read = (path) => fs.readFileSync(new URL(path, import.meta.url), 'utf8');

const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

const includesAll = (source, snippets, label) => {
  const missing = snippets.filter((snippet) => !source.includes(snippet));
  assert(missing.length === 0, `${label} missing snippets: ${missing.join(', ')}`);
};

const extractChoiceOptions = (source, inputName) => {
  const match = source.match(new RegExp(`\\n\\s{6}${inputName}:\\n[\\s\\S]*?\\n\\s{8}options:\\n((?:\\s{10}- .+\\n)+)`));
  assert(match, `Workflow input ${inputName} is missing a choice options block.`);
  return match[1]
    .trim()
    .split('\n')
    .map((line) => line.replace(/^\s*-\s*/, '').trim());
};

const assertChoiceOptions = (source, inputName, expected) => {
  const actual = extractChoiceOptions(source, inputName);
  assert(
    JSON.stringify(actual) === JSON.stringify(expected),
    `Workflow input ${inputName} options drifted. Expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}.`,
  );
};

const certificationCi = read('./commerce-provider-certification-ci.mjs');
const mockCi = read('./commerce-provider-smoke-ci.mjs');
const workflow = read('../.github/workflows/commerce-provider-certification.yml');
const mockWorkflow = read('../.github/workflows/commerce-provider-smoke.yml');
const rootPackage = read('../package.json');
const settingsRoute = read('../apps/public/src/app/api/admin/settings/route.ts');
const productsRoute = read('../apps/admin/src/routes/products.tsx');
const ordersRoute = read('../apps/admin/src/routes/orders.tsx');
const commerceSmoke = read('../apps/admin/scripts/commerce-smoke.mjs');
const ordersSmoke = read('../apps/admin/scripts/orders-smoke.mjs');
const audit = read('../specs/page-completion-audit/backy-page-surface-audit.md');

includesAll(
  certificationCi,
  [
    'BACKY_COMMERCE_PROVIDER_CERTIFICATION_REQUIRED',
    'BACKY_COMMERCE_CERTIFICATION_BASE_URL',
    'BACKY_COMMERCE_CERTIFY_PAYMENT',
    'BACKY_COMMERCE_CERTIFY_TAX',
    'BACKY_COMMERCE_CERTIFY_SHIPPING',
    'BACKY_COMMERCE_CERTIFY_CATALOG',
    'BACKY_COMMERCE_CERTIFY_SUBSCRIPTIONS',
    'BACKY_COMMERCE_CERTIFY_WEBHOOKS',
    'BACKY_COMMERCE_CERTIFY_PAYMENT_PROVIDER',
    'BACKY_COMMERCE_CERTIFY_TAX_PROVIDER',
    'BACKY_COMMERCE_CERTIFY_SHIPPING_PROVIDER',
    'BACKY_COMMERCE_CERTIFY_CATALOG_PROVIDER',
    'BACKY_COMMERCE_CERTIFY_SUBSCRIPTION_PROVIDER',
    'BACKY_COMMERCE_CERTIFY_WEBHOOK_PROVIDER',
    'runtimeCommerce',
    'validate-infrastructure',
    'prepareLocalCertificationSettings',
    'configuredCommerceSettings',
    'paymentProviderReady',
    'razorpayKeyIdConfigured',
    'razorpayKeySecretConfigured',
    'catalogProviderReady',
    'magentoAccessTokenConfigured',
    'magentoStoreConfigured',
    'subscriptionProviderReady',
    'inferPaymentCertificationProvider',
    'inferCatalogCertificationProvider',
    'inferSubscriptionCertificationProvider',
    'inferWebhookCertificationProvider',
    'requestedProviders',
    'requestedWebhookReady',
    "runtime.webhookSecretSource !== 'env'",
    'providerWebhookUrl',
    'requiredLocalTaxProvider',
    'requiredLocalShippingProvider',
    "method: 'PATCH'",
    "runtime.taxProvider === 'http'",
    "runtime.shippingProvider === 'http'",
    "group.area === 'commerce'",
    'Infrastructure diagnostics are missing commerce provider checks',
    'paymentReady',
    'taxReady',
    'shippingReady',
    'catalogReady',
    'assertNoRawSecrets',
    'Commerce provider certification failed readiness checks',
    '.filter(([, enabled]) => enabled)',
    'backy.commerce-provider-certification.v1',
    'target:',
    "mode: externalBaseUrl ? 'external' : 'local'",
    'externalBaseUrlConfigured: Boolean(externalBaseUrl)',
  ],
  'Commerce provider certification CI harness',
);

includesAll(
  workflow,
  [
    'name: Commerce Provider Certification',
    'workflow_dispatch:',
    'BACKY_COMMERCE_PROVIDER_CERTIFICATION_REQUIRED: \'1\'',
    'BACKY_COMMERCE_CERTIFY_PAYMENT',
    'payment_provider:',
    'BACKY_COMMERCE_CERTIFY_PAYMENT_PROVIDER',
    'BACKY_COMMERCE_CERTIFY_TAX',
    'tax_provider:',
    'BACKY_COMMERCE_CERTIFY_TAX_PROVIDER',
    'BACKY_COMMERCE_CERTIFY_SHIPPING',
    'shipping_provider:',
    'BACKY_COMMERCE_CERTIFY_SHIPPING_PROVIDER',
    'BACKY_COMMERCE_CERTIFY_CATALOG',
    'catalog_provider:',
    'BACKY_COMMERCE_CERTIFY_CATALOG_PROVIDER',
    'BACKY_COMMERCE_CERTIFY_SUBSCRIPTIONS',
    'subscription_provider:',
    'BACKY_COMMERCE_CERTIFY_SUBSCRIPTION_PROVIDER',
    'BACKY_COMMERCE_CERTIFY_WEBHOOKS',
    'webhook_provider:',
    'BACKY_COMMERCE_CERTIFY_WEBHOOK_PROVIDER',
    'BACKY_ADMIN_API_KEY',
    'BACKY_STRIPE_SECRET_KEY',
    'BACKY_TAXJAR_API_KEY',
    'BACKY_AVALARA_ACCOUNT_ID',
    'BACKY_EASYPOST_API_KEY',
    'BACKY_SHIPPO_API_KEY',
    'BACKY_SHOPIFY_ADMIN_ACCESS_TOKEN',
    'BACKY_BIGCOMMERCE_ACCESS_TOKEN',
    'BACKY_WOOCOMMERCE_CONSUMER_KEY',
    'BACKY_ETSY_ACCESS_TOKEN',
    'BACKY_MAGENTO_ACCESS_TOKEN',
    'BACKY_RAZORPAY_KEY_ID',
    'razorpay',
    'magento',
    'Run Commerce provider certification preflight',
    'Run non-secret certification doctor',
    'npm run doctor:release-certification',
    'Write non-secret Commerce certification summary',
    'GITHUB_STEP_SUMMARY',
    'commerce_external=false',
    'external target configured:',
    'payment_provider',
    'webhook_provider',
    'Run Commerce provider certification',
    'npm run ci:commerce-provider-certification',
  ],
  'Commerce provider certification workflow',
);

assert(
  /subscription_provider:[\s\S]*?options:[\s\S]*?- razorpay[\s\S]*?certify_webhooks:/m.test(workflow),
  'Commerce provider certification workflow must expose razorpay as a subscription_provider option.',
);

assertChoiceOptions(workflow, 'payment_provider', ['auto', 'stripe', 'paypal', 'paddle', 'square', 'adyen', 'mollie', 'razorpay']);
assertChoiceOptions(workflow, 'tax_provider', ['auto', 'stripe', 'taxjar', 'avalara', 'http']);
assertChoiceOptions(workflow, 'shipping_provider', ['auto', 'easypost', 'shippo', 'http']);
assertChoiceOptions(workflow, 'catalog_provider', ['auto', 'shopify', 'bigcommerce', 'woocommerce', 'etsy', 'magento', 'http']);
assertChoiceOptions(workflow, 'subscription_provider', ['auto', 'stripe', 'paypal', 'paddle', 'square', 'adyen', 'mollie', 'razorpay', 'http']);
assertChoiceOptions(workflow, 'webhook_provider', ['auto', 'stripe', 'paypal', 'paddle', 'square', 'adyen', 'mollie', 'generic']);

assert(
  workflow.indexOf('- name: Run Commerce provider certification preflight') < workflow.indexOf('- name: Write non-secret Commerce certification summary') &&
    workflow.indexOf('- name: Run Commerce provider certification preflight') < workflow.indexOf('- name: Run non-secret certification doctor') &&
    workflow.indexOf('- name: Run non-secret certification doctor') < workflow.indexOf('- name: Write non-secret Commerce certification summary') &&
    workflow.indexOf('- name: Write non-secret Commerce certification summary') < workflow.indexOf('- name: Run Commerce provider certification\n'),
  'Commerce provider certification workflow must run preflight, then write the non-secret summary, then run certification.',
);

includesAll(
  rootPackage,
  [
    '"test:commerce-provider-certification-preflight-contract"',
    '"ci:commerce-provider-certification"',
    '"ci:commerce-provider-smoke"',
  ],
  'Root package commerce provider certification scripts',
);

includesAll(
  mockCi,
  [
    'commerceMockEnv',
    'ordersMockEnv',
    'Commerce provider mock smoke',
    'Orders provider mock smoke',
    'BACKY_SHOPIFY_ADMIN_ACCESS_TOKEN',
    'BACKY_BIGCOMMERCE_ACCESS_TOKEN',
    'BACKY_WOOCOMMERCE_CONSUMER_KEY',
    'BACKY_ETSY_ACCESS_TOKEN',
    'BACKY_MAGENTO_ACCESS_TOKEN',
    'BACKY_RAZORPAY_KEY_ID',
    'BACKY_TAXJAR_API_KEY',
    'BACKY_AVALARA_ACCOUNT_ID',
    'BACKY_EASYPOST_API_KEY',
    'BACKY_SHIPPO_API_KEY',
    'Razorpay subscription',
  ],
  'Existing commerce mock provider CI coverage',
);

includesAll(
  mockWorkflow,
  [
    'name: Commerce Provider Smoke',
    'npm run ci:commerce-provider-smoke',
  ],
  'Existing commerce mock provider workflow',
);

includesAll(
  settingsRoute,
  [
    'const getCommerceRuntimeSummary',
    'runtimeCommerce: getCommerceRuntimeSummary',
    'BACKY_STRIPE_SECRET_KEY',
    'BACKY_TAXJAR_API_KEY',
    'BACKY_AVALARA_ACCOUNT_ID',
    'BACKY_EASYPOST_API_KEY',
    'BACKY_SHIPPO_API_KEY',
    'BACKY_SHOPIFY_ADMIN_ACCESS_TOKEN',
    'BACKY_BIGCOMMERCE_ACCESS_TOKEN',
    'BACKY_WOOCOMMERCE_CONSUMER_KEY',
    'BACKY_ETSY_ACCESS_TOKEN',
    'BACKY_MAGENTO_ACCESS_TOKEN',
    'Catalog provider credentials',
    'Shipping provider execution',
    'Refund provider execution',
    'Subscription lifecycle execution',
  ],
  'Settings runtime commerce diagnostics contract',
);

includesAll(
  productsRoute,
  [
    'provider-sync result for Stripe, PayPal, Paddle, Square, Shopify, BigCommerce, WooCommerce, Etsy, Magento',
    'Live marketplace certification remains backend rollout work',
    "['shopify', 'Shopify']",
    "['bigcommerce', 'BigCommerce']",
    "['woocommerce', 'WooCommerce']",
    "['etsy', 'Etsy']",
    "['magento', 'Magento']",
  ],
  'Products provider surface',
);

includesAll(
  ordersRoute,
  [
    'orders-provider-readiness',
    'providerReadinessChecks',
    'Stripe checkout/refund',
    'TaxJar',
    'Avalara',
    'EasyPost rates',
    'Shippo rates',
    'orders-provider-analytics',
  ],
  'Orders provider readiness surface',
);

includesAll(
  commerceSmoke,
  [
    'Shopify product provider sync',
    'BigCommerce product provider sync',
    'WooCommerce product provider sync',
    'Etsy product provider sync',
    'Magento product provider sync',
    'taxProvider: "taxjar"',
    'taxProvider: "avalara"',
    'shippingProvider: "easypost"',
    'Shippo',
    'Razorpay subscription',
  ],
  'Commerce provider mock smoke coverage',
);

includesAll(
  ordersSmoke,
  [
    'TaxJar mock',
    'Avalara mock',
    'EasyPost mock',
    'Shippo mock',
    'provider refund',
    'Razorpay refund',
    'providerReadiness',
  ],
  'Orders provider mock smoke coverage',
);

includesAll(
  audit,
  [
    'Commerce provider certification workflow',
    'test:commerce-provider-certification-preflight-contract',
    'ci:commerce-provider-certification',
    'Required-mode failures are now scoped to the requested certification groups',
    'includes a real commerce diagnostic group with provider checks',
    'target.mode',
    'externalBaseUrlConfigured',
    'Commerce certification summary update',
    'GITHUB_STEP_SUMMARY',
    'real-provider certification remains Partial',
  ],
  'Commerce provider certification audit evidence',
);

console.log(JSON.stringify({
  ok: true,
  contract: 'backy.commerce-provider-certification-preflight.v1',
}));
