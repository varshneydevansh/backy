#!/usr/bin/env node

const env = process.env;

const value = (name) => (env[name] || '').trim();
const has = (name) => Boolean(value(name));
const hasAny = (names) => names.some(has);
const hasCompleteAlternative = (fields) => fields.every((names) => hasAny(names));
const selected = (name, fallback = 'auto') => value(name).toLowerCase() || fallback;
const requested = (name, fallback = false) => (env[name] === undefined ? fallback : env[name] === '1' || env[name] === 'true');
const isHttpUrl = (name) => /^https?:\/\//i.test(value(name));
const isPostgresUrl = (url) => {
  try {
    return ['postgres:', 'postgresql:'].includes(new URL(url).protocol);
  } catch {
    return false;
  }
};

const check = (label, names, enabled = true) => {
  const missing = enabled ? names.filter((name) => !has(name)) : [];
  return {
    label,
    enabled,
    ready: !enabled || missing.length === 0,
    missing,
  };
};

const checkAny = (label, names, enabled = true) => {
  const ready = !enabled || hasAny(names);
  return {
    label,
    enabled,
    ready,
    missingAnyOf: ready ? [] : names,
  };
};

const checkCompleteAny = (label, alternatives, enabled = true) => {
  const ready = !enabled || alternatives.some(hasCompleteAlternative);
  return {
    label,
    enabled,
    ready,
    missingAnyOf: ready
      ? []
      : alternatives.map((fields) => fields.map((names) => names.join(' | ')).join(' + ')),
  };
};

const providerCredentials = {
  stripe: [[['BACKY_STRIPE_SECRET_KEY', 'STRIPE_SECRET_KEY']]],
  paypal: [[['BACKY_PAYPAL_ACCESS_TOKEN', 'PAYPAL_ACCESS_TOKEN']]],
  paddle: [[['BACKY_PADDLE_API_KEY', 'PADDLE_API_KEY']]],
  square: [[['BACKY_SQUARE_ACCESS_TOKEN', 'SQUARE_ACCESS_TOKEN']]],
  adyen: [[['BACKY_ADYEN_API_KEY', 'ADYEN_API_KEY'], ['BACKY_ADYEN_MERCHANT_ACCOUNT', 'ADYEN_MERCHANT_ACCOUNT']]],
  mollie: [[['BACKY_MOLLIE_API_KEY', 'MOLLIE_API_KEY']]],
  razorpay: [[['BACKY_RAZORPAY_KEY_ID', 'RAZORPAY_KEY_ID'], ['BACKY_RAZORPAY_KEY_SECRET', 'RAZORPAY_KEY_SECRET']]],
  taxjar: [[['BACKY_TAXJAR_API_KEY', 'TAXJAR_API_KEY']]],
  avalara: [[
    ['BACKY_AVALARA_ACCOUNT_ID', 'AVALARA_ACCOUNT_ID'],
    ['BACKY_AVALARA_LICENSE_KEY', 'AVALARA_LICENSE_KEY'],
    ['BACKY_AVALARA_COMPANY_CODE', 'AVALARA_COMPANY_CODE'],
  ]],
  easypost: [[['BACKY_EASYPOST_API_KEY', 'EASYPOST_API_KEY']]],
  shippo: [[['BACKY_SHIPPO_API_KEY', 'SHIPPO_API_KEY']]],
  shopify: [[
    ['BACKY_SHOPIFY_ADMIN_ACCESS_TOKEN', 'SHOPIFY_ADMIN_ACCESS_TOKEN'],
    ['BACKY_SHOPIFY_STORE_DOMAIN', 'SHOPIFY_STORE_DOMAIN', 'BACKY_SHOPIFY_ADMIN_API_BASE_URL', 'SHOPIFY_ADMIN_API_BASE_URL'],
  ]],
  bigcommerce: [[
    ['BACKY_BIGCOMMERCE_ACCESS_TOKEN', 'BIGCOMMERCE_ACCESS_TOKEN'],
    ['BACKY_BIGCOMMERCE_STORE_HASH', 'BIGCOMMERCE_STORE_HASH', 'BACKY_BIGCOMMERCE_API_BASE_URL', 'BIGCOMMERCE_API_BASE_URL'],
  ]],
  woocommerce: [[
    ['BACKY_WOOCOMMERCE_CONSUMER_KEY', 'WOOCOMMERCE_CONSUMER_KEY'],
    ['BACKY_WOOCOMMERCE_CONSUMER_SECRET', 'WOOCOMMERCE_CONSUMER_SECRET'],
    ['BACKY_WOOCOMMERCE_STORE_URL', 'WOOCOMMERCE_STORE_URL', 'BACKY_WOOCOMMERCE_API_BASE_URL', 'WOOCOMMERCE_API_BASE_URL'],
  ]],
  etsy: [[
    ['BACKY_ETSY_ACCESS_TOKEN', 'ETSY_ACCESS_TOKEN'],
    ['BACKY_ETSY_API_KEY', 'ETSY_API_KEY'],
    ['BACKY_ETSY_SHOP_ID', 'ETSY_SHOP_ID'],
  ]],
  magento: [[
    ['BACKY_MAGENTO_ACCESS_TOKEN', 'MAGENTO_ACCESS_TOKEN'],
    ['BACKY_MAGENTO_STORE_URL', 'MAGENTO_STORE_URL', 'BACKY_MAGENTO_API_BASE_URL', 'MAGENTO_API_BASE_URL'],
  ]],
};

const storageProvider = selected(
  'BACKY_SETTINGS_CERTIFY_STORAGE_PROVIDER',
  selected('BACKY_STORAGE_PROVIDER', selected('BACKY_MEDIA_STORAGE_PROVIDER', 'auto')),
);
const notificationProvider = selected('BACKY_SETTINGS_CERTIFY_NOTIFICATION_PROVIDER');
const paymentProvider = selected('BACKY_COMMERCE_CERTIFY_PAYMENT_PROVIDER');
const taxProvider = selected('BACKY_COMMERCE_CERTIFY_TAX_PROVIDER');
const shippingProvider = selected('BACKY_COMMERCE_CERTIFY_SHIPPING_PROVIDER');
const discountProvider = selected('BACKY_COMMERCE_CERTIFY_DISCOUNT_PROVIDER');
const catalogProvider = selected('BACKY_COMMERCE_CERTIFY_CATALOG_PROVIDER');
const subscriptionProvider = selected('BACKY_COMMERCE_CERTIFY_SUBSCRIPTION_PROVIDER');
const webhookProvider = selected('BACKY_COMMERCE_CERTIFY_WEBHOOK_PROVIDER');
const requestPayment = requested('BACKY_COMMERCE_CERTIFY_PAYMENT', false);
const requestTax = requested('BACKY_COMMERCE_CERTIFY_TAX', false);
const requestShipping = requested('BACKY_COMMERCE_CERTIFY_SHIPPING', false);
const requestDiscount = requested('BACKY_COMMERCE_CERTIFY_DISCOUNT', false);
const requestCatalog = requested('BACKY_COMMERCE_CERTIFY_CATALOG', false);
const requestSubscriptions = requested('BACKY_COMMERCE_CERTIFY_SUBSCRIPTIONS', false);
const requestWebhooks = requested('BACKY_COMMERCE_CERTIFY_WEBHOOKS', false);
const databaseUrlConfigured = hasAny(['BACKY_DATABASE_URL', 'DATABASE_URL']);
const databaseUrl = value('BACKY_DATABASE_URL') || value('DATABASE_URL');
const databaseUrlValid = databaseUrlConfigured && isPostgresUrl(databaseUrl);
const databaseDisposableConfirmed = ['1', 'true', 'yes'].includes(value('BACKY_DATABASE_DISPOSABLE_CONFIRMED').toLowerCase());

const database = {
  requested: requested('BACKY_RELEASE_CERTIFY_DATABASE', requested('BACKY_SDK_REQUIRE_DATABASE', false)),
  ready: databaseUrlConfigured,
  urlValid: databaseUrlValid,
  disposableConfirmed: databaseDisposableConfirmed,
  readyForCertification: databaseUrlValid && databaseDisposableConfirmed,
  missingAnyOf: databaseUrlConfigured ? [] : ['BACKY_DATABASE_URL', 'DATABASE_URL'],
  missingConfirmation: databaseDisposableConfirmed ? [] : ['BACKY_DATABASE_DISPOSABLE_CONFIRMED=true'],
  targetGuard: {
    expectedHostConfigured: has('BACKY_DATABASE_CERTIFICATION_EXPECTED_HOST'),
    expectedDatabaseConfigured: has('BACKY_DATABASE_CERTIFICATION_EXPECTED_DATABASE'),
  },
};

const storageChecks = [
  checkAny('storage provider selector', ['BACKY_STORAGE_PROVIDER', 'BACKY_MEDIA_STORAGE_PROVIDER'], storageProvider === 'auto'),
  checkCompleteAny('S3 storage credentials', [[
    ['BACKY_S3_ACCESS_KEY_ID', 'AWS_ACCESS_KEY_ID'],
    ['BACKY_S3_SECRET_ACCESS_KEY', 'AWS_SECRET_ACCESS_KEY'],
    ['BACKY_S3_BUCKET', 'BACKY_STORAGE_BUCKET'],
    ['BACKY_S3_REGION', 'AWS_REGION'],
  ]], storageProvider === 's3'),
  checkCompleteAny('Supabase storage credentials', [[
    ['BACKY_SUPABASE_URL', 'SUPABASE_URL'],
    ['BACKY_SUPABASE_SERVICE_ROLE_KEY', 'BACKY_SUPABASE_ANON_KEY', 'SUPABASE_SERVICE_ROLE_KEY', 'SUPABASE_ANON_KEY'],
    ['BACKY_SUPABASE_STORAGE_BUCKET', 'BACKY_STORAGE_BUCKET'],
  ]], storageProvider === 'supabase'),
];

const notificationChecks = [
  checkAny('Resend notification credentials', ['BACKY_RESEND_API_KEY', 'RESEND_API_KEY'], notificationProvider === 'resend'),
  checkAny('SMTP notification credentials', ['BACKY_SMTP_HOST', 'SMTP_HOST'], notificationProvider === 'smtp'),
  checkAny('HTTP notification endpoint', ['BACKY_EMAIL_DELIVERY_ENDPOINT', 'BACKY_TRANSACTIONAL_EMAIL_WEBHOOK_URL'], notificationProvider === 'http-endpoint'),
];

const settings = {
  required: requested('BACKY_SETTINGS_PROVIDER_CERTIFICATION_REQUIRED', false),
  target: {
    mode: has('BACKY_SETTINGS_CERTIFICATION_BASE_URL') ? 'external' : 'local',
    externalBaseUrlConfigured: has('BACKY_SETTINGS_CERTIFICATION_BASE_URL'),
  },
  requested: {
    storage: requested('BACKY_SETTINGS_CERTIFY_STORAGE', false),
    rotation: requested('BACKY_SETTINGS_CERTIFY_ROTATION', false),
    vercelSecrets: requested('BACKY_SETTINGS_CERTIFY_VERCEL_SECRETS', false),
    notification: requested('BACKY_SETTINGS_CERTIFY_NOTIFICATION', false),
  },
  selectors: {
    storageProvider,
    notificationProvider,
    vercelProjectExpected: has('BACKY_SETTINGS_CERTIFY_VERCEL_PROJECT_ID'),
    vercelTeamExpected: has('BACKY_SETTINGS_CERTIFY_VERCEL_TEAM_ID'),
  },
  checks: [
    checkAny('Settings external admin key', ['BACKY_ADMIN_API_KEY', 'BACKY_SETTINGS_CERTIFICATION_ADMIN_KEY'], requested('BACKY_SETTINGS_PROVIDER_CERTIFICATION_REQUIRED', false) && has('BACKY_SETTINGS_CERTIFICATION_BASE_URL')),
    ...storageChecks.map((item) => {
      const enabled = item.enabled && requested('BACKY_SETTINGS_CERTIFY_STORAGE', false);
      return { ...item, enabled, ready: enabled ? item.ready : true };
    }),
    checkAny('replacement storage env', Object.keys(env).filter((name) => name.includes('_NEXT_')), requested('BACKY_SETTINGS_CERTIFY_ROTATION', false)),
    checkAny('Vercel token', ['VERCEL_TOKEN', 'BACKY_VERCEL_TOKEN'], requested('BACKY_SETTINGS_CERTIFY_VERCEL_SECRETS', false)),
    checkAny('Vercel project', ['VERCEL_PROJECT_ID', 'BACKY_VERCEL_PROJECT_ID'], requested('BACKY_SETTINGS_CERTIFY_VERCEL_SECRETS', false)),
    ...notificationChecks.map((item) => {
      const enabled = item.enabled && requested('BACKY_SETTINGS_CERTIFY_NOTIFICATION', false);
      return { ...item, enabled, ready: enabled ? item.ready : true };
    }),
  ],
};

const commerceChecks = [
  checkCompleteAny('auto payment credentials', [
    ...providerCredentials.stripe,
    ...providerCredentials.paypal,
    ...providerCredentials.paddle,
    ...providerCredentials.square,
    ...providerCredentials.adyen,
    ...providerCredentials.mollie,
    ...providerCredentials.razorpay,
  ], requestPayment && paymentProvider === 'auto'),
  checkCompleteAny('auto subscription credentials', [
    ...providerCredentials.stripe,
    ...providerCredentials.paypal,
    ...providerCredentials.paddle,
    ...providerCredentials.square,
    ...providerCredentials.adyen,
    ...providerCredentials.mollie,
    ...providerCredentials.razorpay,
  ], requestSubscriptions && subscriptionProvider === 'auto'),
  checkCompleteAny('Stripe payment/refund credentials', providerCredentials.stripe, (requestPayment && paymentProvider === 'stripe') || (requestSubscriptions && subscriptionProvider === 'stripe')),
  checkCompleteAny('PayPal payment/subscription credentials', providerCredentials.paypal, (requestPayment && paymentProvider === 'paypal') || (requestSubscriptions && subscriptionProvider === 'paypal')),
  checkCompleteAny('Paddle payment/subscription credentials', providerCredentials.paddle, (requestPayment && paymentProvider === 'paddle') || (requestSubscriptions && subscriptionProvider === 'paddle')),
  checkCompleteAny('Square payment/subscription credentials', providerCredentials.square, (requestPayment && paymentProvider === 'square') || (requestSubscriptions && subscriptionProvider === 'square')),
  checkCompleteAny('Adyen credentials', providerCredentials.adyen, (requestPayment && paymentProvider === 'adyen') || (requestSubscriptions && subscriptionProvider === 'adyen')),
  checkCompleteAny('Mollie payment/subscription credentials', providerCredentials.mollie, (requestPayment && paymentProvider === 'mollie') || (requestSubscriptions && subscriptionProvider === 'mollie')),
  checkCompleteAny('Razorpay payment/subscription credentials', providerCredentials.razorpay, (requestPayment && paymentProvider === 'razorpay') || (requestSubscriptions && subscriptionProvider === 'razorpay')),
  checkCompleteAny('auto tax credentials', [
    ...providerCredentials.stripe,
    ...providerCredentials.taxjar,
    ...providerCredentials.avalara,
  ], requestTax && taxProvider === 'auto'),
  checkCompleteAny('TaxJar credentials', providerCredentials.taxjar, requestTax && taxProvider === 'taxjar'),
  checkCompleteAny('Avalara credentials', providerCredentials.avalara, requestTax && taxProvider === 'avalara'),
  checkCompleteAny('auto shipping credentials', [
    ...providerCredentials.easypost,
    ...providerCredentials.shippo,
  ], requestShipping && shippingProvider === 'auto'),
  checkCompleteAny('EasyPost credentials', providerCredentials.easypost, requestShipping && shippingProvider === 'easypost'),
  checkCompleteAny('Shippo credentials', providerCredentials.shippo, requestShipping && shippingProvider === 'shippo'),
  checkAny('HTTP tax provider URL', ['BACKY_COMMERCE_TAX_PROVIDER_URL', 'COMMERCE_TAX_PROVIDER_URL'], requestTax && taxProvider === 'http' && !has('BACKY_COMMERCE_CERTIFICATION_BASE_URL')),
  checkAny('HTTP shipping provider URL', ['BACKY_COMMERCE_SHIPPING_PROVIDER_URL', 'COMMERCE_SHIPPING_PROVIDER_URL'], requestShipping && shippingProvider === 'http' && !has('BACKY_COMMERCE_CERTIFICATION_BASE_URL')),
  checkCompleteAny('auto discount credentials', [
    ...providerCredentials.stripe,
    [[
      'BACKY_COMMERCE_DISCOUNT_PROVIDER_URL',
      'COMMERCE_DISCOUNT_PROVIDER_URL',
    ]],
  ], requestDiscount && discountProvider === 'auto'),
  checkCompleteAny('Stripe promotion-code discount credentials', providerCredentials.stripe, requestDiscount && discountProvider === 'stripe'),
  checkAny('HTTP discount provider URL', ['BACKY_COMMERCE_DISCOUNT_PROVIDER_URL', 'COMMERCE_DISCOUNT_PROVIDER_URL'], requestDiscount && discountProvider === 'http' && !has('BACKY_COMMERCE_CERTIFICATION_BASE_URL')),
  checkCompleteAny('auto catalog credentials', [
    ...providerCredentials.shopify,
    ...providerCredentials.bigcommerce,
    ...providerCredentials.woocommerce,
    ...providerCredentials.etsy,
    ...providerCredentials.magento,
  ], requestCatalog && catalogProvider === 'auto'),
  checkCompleteAny('Shopify catalog credentials', providerCredentials.shopify, requestCatalog && catalogProvider === 'shopify'),
  checkCompleteAny('BigCommerce catalog credentials', providerCredentials.bigcommerce, requestCatalog && catalogProvider === 'bigcommerce'),
  checkCompleteAny('WooCommerce catalog credentials', providerCredentials.woocommerce, requestCatalog && catalogProvider === 'woocommerce'),
  checkCompleteAny('Etsy catalog credentials', providerCredentials.etsy, requestCatalog && catalogProvider === 'etsy'),
  checkCompleteAny('Magento catalog credentials', providerCredentials.magento, requestCatalog && catalogProvider === 'magento'),
  checkAny('HTTP catalog provider URL', ['BACKY_COMMERCE_PRODUCT_SYNC_URL', 'COMMERCE_PRODUCT_SYNC_URL'], requestCatalog && catalogProvider === 'http' && !has('BACKY_COMMERCE_CERTIFICATION_BASE_URL')),
  checkAny('HTTP subscription provider URL', ['BACKY_COMMERCE_SUBSCRIPTION_ACTION_URL', 'COMMERCE_SUBSCRIPTION_ACTION_URL'], requestSubscriptions && subscriptionProvider === 'http' && !has('BACKY_COMMERCE_CERTIFICATION_BASE_URL')),
  checkAny('Commerce webhook secret', ['BACKY_COMMERCE_WEBHOOK_SECRET', 'COMMERCE_WEBHOOK_SECRET'], requestWebhooks),
  checkCompleteAny('Stripe webhook credentials', providerCredentials.stripe, requestWebhooks && webhookProvider === 'stripe'),
  checkCompleteAny('PayPal webhook credentials', providerCredentials.paypal, requestWebhooks && webhookProvider === 'paypal'),
  checkCompleteAny('Paddle webhook credentials', providerCredentials.paddle, requestWebhooks && webhookProvider === 'paddle'),
  checkCompleteAny('Square webhook credentials', providerCredentials.square, requestWebhooks && webhookProvider === 'square'),
  checkCompleteAny('Adyen webhook credentials', providerCredentials.adyen, requestWebhooks && webhookProvider === 'adyen'),
  checkCompleteAny('Mollie webhook credentials', providerCredentials.mollie, requestWebhooks && webhookProvider === 'mollie'),
  checkCompleteAny('Razorpay webhook credentials', providerCredentials.razorpay, requestWebhooks && webhookProvider === 'razorpay'),
];

const commerce = {
  required: requested('BACKY_COMMERCE_PROVIDER_CERTIFICATION_REQUIRED', false),
  target: {
    mode: has('BACKY_COMMERCE_CERTIFICATION_BASE_URL') ? 'external' : 'local',
    externalBaseUrlConfigured: has('BACKY_COMMERCE_CERTIFICATION_BASE_URL'),
  },
  requested: {
    payment: requestPayment,
    tax: requestTax,
    shipping: requestShipping,
    discount: requestDiscount,
    catalog: requestCatalog,
    subscriptions: requestSubscriptions,
    webhooks: requestWebhooks,
  },
  selectors: {
    paymentProvider,
    taxProvider,
    shippingProvider,
    discountProvider,
    catalogProvider,
    subscriptionProvider,
    webhookProvider,
  },
  checks: [
    checkAny('Commerce external admin key', ['BACKY_ADMIN_API_KEY', 'BACKY_COMMERCE_CERTIFICATION_ADMIN_KEY'], requested('BACKY_COMMERCE_PROVIDER_CERTIFICATION_REQUIRED', false) && has('BACKY_COMMERCE_CERTIFICATION_BASE_URL')),
    ...commerceChecks,
  ],
};

const collectFailures = (group) => group.checks
  .filter((item) => item.enabled && !item.ready)
  .map((item) => item.label);

const failures = [
  ...(database.requested && !database.ready ? ['database URL'] : []),
  ...(database.requested && database.ready && !database.urlValid ? ['database URL format'] : []),
  ...(database.requested && !database.disposableConfirmed ? ['database disposable confirmation'] : []),
  ...(settings.required && settings.target.externalBaseUrlConfigured && !isHttpUrl('BACKY_SETTINGS_CERTIFICATION_BASE_URL') ? ['Settings external base URL'] : []),
  ...(settings.required && ![
    settings.requested.storage,
    settings.requested.rotation,
    settings.requested.vercelSecrets,
    settings.requested.notification,
  ].some(Boolean) ? ['settings provider group selection'] : []),
  ...(commerce.required && commerce.target.externalBaseUrlConfigured && !isHttpUrl('BACKY_COMMERCE_CERTIFICATION_BASE_URL') ? ['Commerce external base URL'] : []),
  ...(commerce.required && ![
    commerce.requested.payment,
    commerce.requested.tax,
    commerce.requested.shipping,
    commerce.requested.discount,
    commerce.requested.catalog,
    commerce.requested.subscriptions,
    commerce.requested.webhooks,
  ].some(Boolean) ? ['commerce provider group selection'] : []),
  ...collectFailures(settings),
  ...collectFailures(commerce),
];

const aggregatePreflight = 'npm run test:partial-gate-preflights';
const adminSourceGuard = 'npm run test:admin-contract-source';

const partialGateMap = [
  {
    row: '/forms',
    gate: 'npm run ci:forms-postgres',
    preflight: 'npm run test:forms-postgres-preflight-contract',
    disposableGuard: 'npm run test:forms-postgres-disposable-guard',
    aggregatePreflight,
    adminSourceGuard,
    workflow: '.github/workflows/forms-postgres-contract.yml',
    requiredInputFamily: 'BACKY_DATABASE_URL or DATABASE_URL pointing at a disposable migrated Supabase/Postgres database',
  },
  {
    row: 'Frontend manifest/OpenAPI/SDK APIs',
    gate: 'npm run ci:sdk-postgres-smoke',
    preflight: 'npm run test:sdk-postgres-preflight-contract',
    disposableGuard: 'npm run test:sdk-postgres-disposable-guard',
    aggregatePreflight,
    adminSourceGuard,
    workflow: '.github/workflows/sdk-postgres-smoke.yml',
    requiredInputFamily: 'BACKY_DATABASE_URL or DATABASE_URL pointing at a disposable migrated Supabase/Postgres database',
  },
  {
    row: '/settings and Settings admin APIs',
    gate: 'npm run ci:settings-provider-certification',
    preflight: 'npm run test:settings-provider-certification-preflight-contract',
    aggregatePreflight,
    adminSourceGuard,
    doctorRequiredEnv: 'BACKY_RELEASE_CERTIFICATION_DOCTOR_REQUIRED=1',
    workflow: '.github/workflows/settings-provider-certification.yml',
    requiredInputFamily: 'selected storage, Vercel, notification, and provider-family inputs',
  },
  {
    row: '/products and /orders',
    gate: 'npm run ci:commerce-provider-certification',
    preflight: 'npm run test:commerce-provider-certification-preflight-contract',
    mockGate: 'npm run ci:commerce-provider-smoke',
    aggregatePreflight,
    adminSourceGuard,
    doctorRequiredEnv: 'BACKY_RELEASE_CERTIFICATION_DOCTOR_REQUIRED=1',
    workflow: '.github/workflows/commerce-provider-certification.yml',
    requiredInputFamily: 'selected payment, tax, shipping, discount, catalog, subscription, and webhook provider inputs',
  },
];

console.log(JSON.stringify({
  ok: failures.length === 0,
  contract: 'backy.release-certification-doctor.v1',
  partialGateMap,
  database,
  settings,
  commerce,
  failures,
}, null, 2));

if (env.BACKY_RELEASE_CERTIFICATION_DOCTOR_REQUIRED === '1' && failures.length > 0) {
  process.exit(1);
}
