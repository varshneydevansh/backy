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
const settingsUiRoute = read('../apps/admin/src/routes/settings.tsx');
const providerRefundRoute = read('../apps/public/src/app/api/admin/sites/[siteId]/commerce/orders/[orderId]/provider-refund/route.ts');
const commerceContract = read('../apps/public/src/lib/commerceCatalog.ts');
const openApiRoute = read('../apps/public/src/app/api/sites/[siteId]/openapi/route.ts');
const frontendManifestSchema = read('../specs/ai-frontend-contract/frontend-manifest.schema.json');
const generatedSdkTypes = read('../packages/sdk-js/src/generated-contract-types.ts');
const sdkSource = read('../packages/sdk-js/src/index.ts');
const sdkRuntimeSmoke = read('../packages/sdk-js/scripts/smoke.mjs');
const generatedSdkSmoke = read('../packages/sdk-js/scripts/generated-contract-types.ts');
const productsRoute = read('../apps/admin/src/routes/products.tsx');
const ordersRoute = read('../apps/admin/src/routes/orders.tsx');
const commerceSmoke = read('../apps/admin/scripts/commerce-smoke.mjs');
const ordersSmoke = read('../apps/admin/scripts/orders-smoke.mjs');
const audit = read('../specs/page-completion-audit/backy-page-surface-audit.md');
const apiContracts = read('../specs/backy-api-contracts.md');
const setup = read('../SETUP.md');

includesAll(
  commerceContract,
  [
    'providerCertification',
    "paymentProvider: 'none' | 'stripe' | 'paypal' | 'paddle' | 'square' | 'adyen' | 'mollie' | 'razorpay' | 'manual'",
    "'stripe', 'paypal', 'paddle', 'square', 'adyen', 'mollie', 'razorpay', 'manual'",
    "schemaVersion: 'backy.commerce-provider-certification-handoff.v1'",
    "status: 'external-live-provider-gate'",
    "localMockGate: 'ci:commerce-provider-smoke'",
    "liveCertificationGate: 'ci:commerce-provider-certification'",
    "requiredFor: 'live-commerce-provider-launch'",
    'requiredInputs',
    'BACKY_STRIPE_SECRET_KEY or STRIPE_SECRET_KEY',
    'BACKY_TAXJAR_API_KEY or TAXJAR_API_KEY',
    'BACKY_EASYPOST_API_KEY or EASYPOST_API_KEY',
    'BACKY_COMMERCE_PRODUCT_SYNC_URL or COMMERCE_PRODUCT_SYNC_URL',
    'BACKY_COMMERCE_SUBSCRIPTION_ACTION_URL or COMMERCE_SUBSCRIPTION_ACTION_URL',
    'BACKY_COMMERCE_WEBHOOK_SECRET or COMMERCE_WEBHOOK_SECRET',
    'commerceProviderCertificationRuntime',
    'paymentConfigured',
    'taxConfigured',
    'shippingConfigured',
    'catalogSyncConfigured',
    'subscriptionConfigured',
    'webhookSecretConfigured',
    'Provider secret values are never returned',
    'TaxJar',
    'Avalara',
    'EasyPost',
    'Shippo',
    'Stripe promotion codes',
    'Magento',
    'Provider credentials stay in server environment/configuration',
  ],
  'Commerce storefront provider certification handoff',
);

includesAll(
  openApiRoute,
  [
    'CommerceProviderCertification',
    'CommerceStorefrontContract',
    '"paypal"',
    '"paddle"',
    '"razorpay"',
    'backy.commerce-provider-certification-handoff.v1',
    'providerCertification',
    'ci:commerce-provider-certification',
    'ci:commerce-provider-smoke',
    'requiredInputs',
    'runtime',
    'paymentConfigured',
    'webhookSecretConfigured',
    '$ref: "#/components/schemas/CommerceStorefrontContract"',
  ],
  'Commerce OpenAPI provider certification contract',
);

includesAll(
  generatedSdkTypes,
  [
    'GeneratedBackyOpenApiCommerceProviderCertification',
    'GeneratedBackyOpenApiCommerceStorefrontContract',
    'paymentProvider: "none" | "stripe" | "paypal" | "paddle" | "square" | "adyen" | "mollie" | "razorpay" | "manual"',
    'providerCertification: GeneratedBackyOpenApiCommerceProviderCertification',
    '"backy.commerce-provider-certification-handoff.v1"',
    '"ci:commerce-provider-certification"',
    'paymentConfigured: boolean',
    'webhookSecretConfigured: boolean',
    'requiredInputs: Array<string>',
  ],
  'Generated SDK commerce provider certification types',
);

includesAll(
  sdkSource,
  [
    'GeneratedBackyOpenApiCommerceProviderCertification',
    'GeneratedBackyOpenApiCommerceStorefrontContract',
    'paymentProvider: "none" | "stripe" | "paypal" | "paddle" | "square" | "adyen" | "mollie" | "razorpay" | "manual"',
    'providerCertification?:',
    '"backy.commerce-provider-certification-handoff.v1"',
    '"ci:commerce-provider-certification"',
    'paymentConfigured: boolean',
    'webhookSecretConfigured: boolean',
    'requiredInputs: string[]',
  ],
  'Convenience SDK commerce provider certification type exports',
);

includesAll(
  sdkRuntimeSmoke,
  [
    'assertCommerceProviderCertification',
    "assertCommerceProviderCertification(manifest.data.modules?.commerce, 'manifest() commerce module')",
    "assertCommerceProviderCertification(commerceOrderContract.data.commerce, 'commerceOrderContract()')",
    "assertCommerceProviderCertification(cachedCommerceOrderContract.body.data.commerce, 'commerceOrderContractCached()')",
    "assertCommerceProviderCertification(commerceCatalog.data.commerce, 'commerceCatalog()')",
    "assertCommerceProviderCertification(cachedCommerceCatalog.body.data.commerce, 'commerceCatalogCached()')",
    'backy.commerce-provider-certification-handoff.v1',
    'external-live-provider-gate',
    'ci:commerce-provider-smoke',
    'ci:commerce-provider-certification',
    'live-commerce-provider-launch',
    'Provider credentials stay in server environment/configuration',
    'payment provider runtime readiness',
    'Provider secret values are never returned',
    'missing certification required input',
    'BACKY_STRIPE_SECRET_KEY or STRIPE_SECRET_KEY',
    'BACKY_TAXJAR_API_KEY or TAXJAR_API_KEY',
    'BACKY_EASYPOST_API_KEY or EASYPOST_API_KEY',
    'BACKY_COMMERCE_PRODUCT_SYNC_URL or COMMERCE_PRODUCT_SYNC_URL',
    'BACKY_COMMERCE_SUBSCRIPTION_ACTION_URL or COMMERCE_SUBSCRIPTION_ACTION_URL',
    'BACKY_COMMERCE_WEBHOOK_SECRET or COMMERCE_WEBHOOK_SECRET',
    'Stripe webhooks',
    'TaxJar',
    'Avalara',
    'EasyPost',
    'Shippo',
    'Stripe promotion codes',
    'Magento',
    'Razorpay',
    'Local provider mocks',
  ],
  'SDK runtime smoke commerce provider certification response guard',
);

includesAll(
  generatedSdkSmoke,
  [
    'commerceProviderCertification',
    'commerceStorefrontContract',
    'paddleCommerceStorefrontContract',
    'invalidCommerceStorefrontPaymentProvider',
    'providerCertification',
    'invalidCommerceCatalogCertification',
    'invalidCommerceOrderContractCertification',
    'requiredInputs',
  ],
  'Generated SDK commerce provider certification smoke cases',
);

includesAll(
  frontendManifestSchema,
  [
    '"paymentProvider": { "enum": ["none", "stripe", "paypal", "paddle", "square", "adyen", "mollie", "razorpay", "manual"] }',
  ],
  'Frontend manifest commerce payment provider handoff enum',
);

includesAll(
  certificationCi,
  [
    'BACKY_COMMERCE_PROVIDER_CERTIFICATION_REQUIRED',
    'BACKY_COMMERCE_CERTIFICATION_BASE_URL',
    'must be an http:// or https:// URL when Commerce provider certification targets an external deployment',
    'requires at least one BACKY_COMMERCE_CERTIFY_* provider group flag',
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
    'BACKY_COMMERCE_CERTIFY_WEBHOOK_PROVIDER must be auto, stripe, paypal, paddle, square, adyen, mollie, razorpay, or generic.',
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
    'commerceHttpCertificationUrls',
    'BACKY_COMMERCE_TAX_PROVIDER_URL',
    'BACKY_COMMERCE_SHIPPING_PROVIDER_URL',
    'BACKY_COMMERCE_PRODUCT_SYNC_URL',
    'BACKY_COMMERCE_SUBSCRIPTION_ACTION_URL',
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
    'BACKY_RELEASE_CERTIFICATION_DOCTOR_REQUIRED: \'1\'',
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
    'BACKY_ADMIN_API_KEY: ${{ secrets.BACKY_ADMIN_API_KEY }}',
    'BACKY_COMMERCE_CERTIFICATION_ADMIN_KEY: ${{ secrets.BACKY_COMMERCE_CERTIFICATION_ADMIN_KEY }}',
    'BACKY_COMMERCE_TAX_PROVIDER_URL',
    'COMMERCE_TAX_PROVIDER_URL',
    'BACKY_COMMERCE_SHIPPING_PROVIDER_URL',
    'COMMERCE_SHIPPING_PROVIDER_URL',
    'BACKY_COMMERCE_PRODUCT_SYNC_URL',
    'COMMERCE_PRODUCT_SYNC_URL',
    'BACKY_COMMERCE_SUBSCRIPTION_ACTION_URL',
    'COMMERCE_SUBSCRIPTION_ACTION_URL',
    'BACKY_COMMERCE_WEBHOOK_SECRET',
    'COMMERCE_WEBHOOK_SECRET',
    'BACKY_STRIPE_SECRET_KEY',
    'STRIPE_SECRET_KEY',
    'BACKY_TAXJAR_API_KEY',
    'TAXJAR_API_KEY',
    'BACKY_AVALARA_ACCOUNT_ID',
    'AVALARA_ACCOUNT_ID',
    'BACKY_EASYPOST_API_KEY',
    'EASYPOST_API_KEY',
    'BACKY_SHIPPO_API_KEY',
    'SHIPPO_API_KEY',
    'PAYPAL_ACCESS_TOKEN',
    'PADDLE_API_KEY',
    'SQUARE_ACCESS_TOKEN',
    'ADYEN_API_KEY',
    'MOLLIE_API_KEY',
    'BACKY_SHOPIFY_ADMIN_ACCESS_TOKEN',
    'SHOPIFY_ADMIN_ACCESS_TOKEN',
    'BACKY_BIGCOMMERCE_ACCESS_TOKEN',
    'BIGCOMMERCE_ACCESS_TOKEN',
    'BACKY_WOOCOMMERCE_CONSUMER_KEY',
    'WOOCOMMERCE_CONSUMER_KEY',
    'BACKY_ETSY_ACCESS_TOKEN',
    'ETSY_ACCESS_TOKEN',
    'BACKY_MAGENTO_ACCESS_TOKEN',
    'MAGENTO_ACCESS_TOKEN',
    'BACKY_RAZORPAY_KEY_ID',
    'RAZORPAY_KEY_ID',
    'razorpay',
    'magento',
    'Run Commerce provider certification preflight',
    'Run non-secret certification doctor',
    'npm run doctor:release-certification',
    'Write non-secret Commerce certification summary',
    'GITHUB_STEP_SUMMARY',
    '| Partial row | Gate | Requested | Aggregate preflight | Admin source guard | Non-secret target evidence |',
    '| /products and /orders | npm run ci:commerce-provider-certification | true | npm run test:partial-gate-preflights | npm run test:admin-contract-source |',
    'commerce_external=false',
    'commerce_admin_key_configured=false',
    'external target configured:',
    'admin key configured:',
    'payment_provider',
    'webhook_provider',
    'Run Commerce provider certification',
    'npm run ci:commerce-provider-certification',
  ],
  'Commerce provider certification workflow',
);

includesAll(
  certificationCi,
  [
    'process.env.COMMERCE_WEBHOOK_SECRET',
    'env:COMMERCE_WEBHOOK_SECRET',
    'env:BACKY_COMMERCE_WEBHOOK_SECRET',
  ],
  'Commerce provider certification webhook secret alias selection',
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
assertChoiceOptions(workflow, 'webhook_provider', ['auto', 'stripe', 'paypal', 'paddle', 'square', 'adyen', 'mollie', 'razorpay', 'generic']);

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
    'BACKY_PADDLE_API_KEY',
    'paddleRefundMockBaseUrl',
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
  apiContracts,
  [
    'npm run ci:commerce-provider-smoke',
    'provider catalog sync for Stripe, PayPal, Paddle, Square, Shopify, BigCommerce, WooCommerce, Etsy, Magento, and HTTP',
    'public checkout and admin-order TaxJar/Avalara tax quotes',
    'EasyPost/Shippo shipping rates and label/tracking flows',
    'Stripe Tax and Stripe promotion-code discount quotes',
    'Stripe/PayPal/Paddle/Square/Adyen/Mollie/Razorpay refunds',
    '.github/workflows/commerce-provider-smoke.yml',
  ],
  'API contracts commerce mock provider coverage summary',
);

includesAll(
  apiContracts,
  [
    'data.modules.commerce.providerCertification',
    'data.commerce.providerCertification',
    'backy.commerce-provider-certification-handoff.v1',
    'CommerceProviderCertification',
    'CommerceStorefrontContract',
    'GeneratedBackyOpenApiCommerceProviderCertification',
    'GeneratedBackyOpenApiCommerceStorefrontContract',
    '/products` and `/orders` admin handoff manifests',
    'requiredFor: live-commerce-provider-launch',
    'custom admin clients can render the remaining live-provider blocker',
    'requiredInputs',
    'BACKY_STRIPE_SECRET_KEY`/`STRIPE_SECRET_KEY',
    'BACKY_COMMERCE_WEBHOOK_SECRET`/`COMMERCE_WEBHOOK_SECRET',
  ],
  'API contracts commerce storefront provider certification handoff',
);

includesAll(
  apiContracts,
  [
    'provider: "etsy"',
    'provider: "magento"',
    'Magento/Adobe Commerce REST API products',
    'backy.product-subscription-execution-readiness.v1` provider readiness for Stripe, PayPal, Paddle, Square, Adyen, Mollie, Razorpay, generic HTTP, and manual handoff actions',
    'executes Razorpay subscription pause/resume/cancel with Basic auth',
    'BACKY_RAZORPAY_KEY_ID',
    'BACKY_RAZORPAY_KEY_SECRET',
  ],
  'API contracts product provider sync and subscription provider matrix',
);

includesAll(
  setup,
  [
    'Commerce provider mock smoke',
    'provider catalog sync for Stripe, PayPal, Paddle, Square, Shopify, BigCommerce, WooCommerce, Etsy, Magento, and HTTP',
    'public checkout and admin-order TaxJar/Avalara tax quotes',
    'EasyPost/Shippo shipping rates, labels, and tracking',
    'Stripe Tax and Stripe promotion-code discount quotes',
    'Stripe/PayPal/Paddle/Square/Adyen/Mollie/Razorpay refunds',
    'npm run ci:commerce-provider-smoke',
  ],
  'SETUP commerce mock provider coverage runbook',
);

includesAll(
  settingsRoute,
  [
    'const getCommerceRuntimeSummary',
    'runtimeCommerce: getCommerceRuntimeSummary',
    "'stripe', 'paypal', 'paddle', 'square', 'adyen', 'mollie', 'razorpay', 'manual'",
    "'none', 'stripe', 'paypal', 'paddle', 'square', 'adyen', 'mollie', 'razorpay', 'manual'",
    'BACKY_STRIPE_SECRET_KEY',
    'BACKY_TAXJAR_API_KEY',
    'BACKY_AVALARA_ACCOUNT_ID',
    'BACKY_EASYPOST_API_KEY',
    'BACKY_SHIPPO_API_KEY',
    'BACKY_PADDLE_API_KEY',
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
  settingsUiRoute,
  [
    '<option value="stripe">Stripe</option>',
    '<option value="paypal">PayPal</option>',
    '<option value="paddle">Paddle</option>',
    '<option value="square">Square</option>',
    '<option value="adyen">Adyen</option>',
    '<option value="mollie">Mollie</option>',
    '<option value="razorpay">Razorpay</option>',
    '<option value="manual">Manual / invoice</option>',
  ],
  'Settings UI commerce payment provider handoff options',
);

includesAll(
  providerRefundRoute,
  [
    'canExecutePayPalRefund',
    'canExecutePaddleRefund',
    'canExecuteSquareRefund',
    'canExecuteAdyenRefund',
    'canExecuteMollieRefund',
    'canExecuteRazorpayRefund',
    'executePayPalRefund',
    'executePaddleRefund',
    'executeSquareRefund',
    'executeAdyenRefund',
    'executeMollieRefund',
    'executeRazorpayRefund',
    'refreshPayPalRefund',
    'refreshPaddleRefund',
    'refreshSquareRefund',
    'refreshMollieRefund',
    'refreshRazorpayRefund',
    'safeMollieRefundPayload',
    'value: textValue(toRecord(value.amount).value)',
    'currency: textValue(toRecord(value.amount).currency)',
    'Array.isArray(payloadRecord.data)',
    'payments.captures.refund',
    'adjustments.create',
    'adjustments.get',
    'payments.refunds.create',
    'payments.refund',
    'refunds.get',
    'payments.refunds.webhook_reconcile',
    'paypal-api',
    'paddle-api',
    'square-api',
    'adyen-api',
    'mollie-api',
    'razorpay-api',
    'BACKY_PAYPAL_ACCESS_TOKEN',
    'BACKY_PADDLE_API_KEY',
    'BACKY_SQUARE_ACCESS_TOKEN',
    'BACKY_ADYEN_API_KEY',
    'BACKY_MOLLIE_API_KEY',
    'BACKY_RAZORPAY_KEY_ID',
    'BACKY_RAZORPAY_KEY_SECRET',
    'PAYPAL_ACCESS_TOKEN',
    'PADDLE_API_KEY',
    'SQUARE_ACCESS_TOKEN',
    'ADYEN_API_KEY',
    'MOLLIE_API_KEY',
    'RAZORPAY_KEY_ID',
    'RAZORPAY_KEY_SECRET',
  ],
  'Provider refund route execution contract',
);

includesAll(
  productsRoute,
  [
    "schemaVersion: 'backy.commerce-provider-certification-handoff.v1'",
    "requiredFor: 'live-commerce-provider-launch'",
    'providerCertificationSummary.schemaVersion',
    'providerRuntimeEvidence',
    'products-provider-runtime-evidence',
    'Provider secret values are never returned',
    'runtimeCommerce',
    'Schema',
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
    "schemaVersion: 'backy.commerce-provider-certification-handoff.v1'",
    "requiredFor: 'live-commerce-provider-launch'",
    'providerCertificationSummary.schemaVersion',
    'providerRuntimeEvidence',
    'orders-provider-runtime-evidence',
    'Provider secret values are never returned',
    'Schema',
    'orders-provider-readiness',
    'providerReadinessChecks',
    'Stripe checkout/refund',
    'PayPal refunds',
    'Paddle refunds',
    'Square refunds',
    'Adyen refunds',
    'Mollie refunds',
    'Razorpay refunds',
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
    'assertCommerceProviderCertificationResponse',
    'Public order contract',
    'Public catalog contract',
    'Public manifest commerce module',
    'backy.commerce-provider-certification-handoff.v1',
    'external-live-provider-gate',
    "requiredFor: 'live-commerce-provider-launch'",
    'Schema',
    'ci:commerce-provider-smoke',
    'ci:commerce-provider-certification',
    'live-commerce-provider-launch',
    'Provider credentials stay in server environment/configuration',
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
    'Paddle refund',
    "requiredFor: 'live-commerce-provider-launch'",
    'Schema',
    'createPaddleRefundMockServer',
    'Razorpay refund',
    'providerReadiness',
  ],
  'Orders provider mock smoke coverage',
);

includesAll(
  audit,
  [
    'Commerce storefront provider certification handoff',
    'Paddle order refund provider update',
    'data.modules.commerce.providerCertification',
    'data.commerce.providerCertification',
    'CommerceProviderCertification',
    'GeneratedBackyOpenApiCommerceProviderCertification',
    'Commerce provider certification workflow',
    'test:commerce-provider-certification-preflight-contract',
    'ci:commerce-provider-certification',
    'Required-mode failures are now scoped to the requested certification groups',
    'includes a real commerce diagnostic group with provider checks',
    'target.mode',
    'externalBaseUrlConfigured',
    'external-target workflow runs now use explicit `BACKY_ADMIN_API_KEY` or `BACKY_COMMERCE_CERTIFICATION_ADMIN_KEY` secrets',
    'Commerce provider required-input handoff',
    'requiredInputs',
    'BACKY_STRIPE_SECRET_KEY`/`STRIPE_SECRET_KEY',
    'BACKY_COMMERCE_WEBHOOK_SECRET`/`COMMERCE_WEBHOOK_SECRET',
    'Commerce certification summary update',
    'GITHUB_STEP_SUMMARY',
    'real-provider certification remains Partial',
    'Commerce provider certification gate wording update',
    'npm run ci:commerce-provider-certification',
    'test:commerce-provider-certification-preflight-contract',
    'explicitly selected payment, tax, shipping, catalog, subscription, and webhook provider families',
    'repeatable mock coverage remains `npm run ci:commerce-provider-smoke`',
    'real provider-family execution and selected credential/input readiness',
  ],
  'Commerce provider certification audit evidence',
);

console.log(JSON.stringify({
  ok: true,
  contract: 'backy.commerce-provider-certification-preflight.v1',
}));
