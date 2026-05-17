#!/usr/bin/env node

const env = process.env;

const value = (name) => (env[name] || '').trim();
const has = (name) => Boolean(value(name));
const hasAny = (names) => names.some(has);
const selected = (name, fallback = 'auto') => value(name).toLowerCase() || fallback;
const requested = (name, fallback = false) => (env[name] === undefined ? fallback : env[name] === '1' || env[name] === 'true');

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

const storageProvider = selected('BACKY_SETTINGS_CERTIFY_STORAGE_PROVIDER', selected('BACKY_STORAGE_PROVIDER', 'auto'));
const notificationProvider = selected('BACKY_SETTINGS_CERTIFY_NOTIFICATION_PROVIDER');
const paymentProvider = selected('BACKY_COMMERCE_CERTIFY_PAYMENT_PROVIDER');
const taxProvider = selected('BACKY_COMMERCE_CERTIFY_TAX_PROVIDER');
const shippingProvider = selected('BACKY_COMMERCE_CERTIFY_SHIPPING_PROVIDER');
const catalogProvider = selected('BACKY_COMMERCE_CERTIFY_CATALOG_PROVIDER');
const subscriptionProvider = selected('BACKY_COMMERCE_CERTIFY_SUBSCRIPTION_PROVIDER');
const webhookProvider = selected('BACKY_COMMERCE_CERTIFY_WEBHOOK_PROVIDER');
const requestPayment = requested('BACKY_COMMERCE_CERTIFY_PAYMENT', false);
const requestTax = requested('BACKY_COMMERCE_CERTIFY_TAX', false);
const requestShipping = requested('BACKY_COMMERCE_CERTIFY_SHIPPING', false);
const requestCatalog = requested('BACKY_COMMERCE_CERTIFY_CATALOG', false);
const requestSubscriptions = requested('BACKY_COMMERCE_CERTIFY_SUBSCRIPTIONS', false);
const requestWebhooks = requested('BACKY_COMMERCE_CERTIFY_WEBHOOKS', false);

const database = {
  requested: requested('BACKY_RELEASE_CERTIFY_DATABASE', requested('BACKY_SDK_REQUIRE_DATABASE', false)),
  ready: hasAny(['BACKY_DATABASE_URL', 'DATABASE_URL']),
  missingAnyOf: hasAny(['BACKY_DATABASE_URL', 'DATABASE_URL']) ? [] : ['BACKY_DATABASE_URL', 'DATABASE_URL'],
  targetGuard: {
    expectedHostConfigured: has('BACKY_DATABASE_CERTIFICATION_EXPECTED_HOST'),
    expectedDatabaseConfigured: has('BACKY_DATABASE_CERTIFICATION_EXPECTED_DATABASE'),
  },
};

const storageChecks = [
  checkAny('storage provider selector', ['BACKY_STORAGE_PROVIDER'], storageProvider === 'auto'),
  check('S3 storage credentials', ['BACKY_S3_ACCESS_KEY_ID', 'BACKY_S3_SECRET_ACCESS_KEY', 'BACKY_S3_BUCKET', 'BACKY_S3_REGION'], storageProvider === 's3'),
  check('Supabase storage credentials', ['BACKY_SUPABASE_URL', 'BACKY_SUPABASE_SERVICE_ROLE_KEY', 'BACKY_SUPABASE_STORAGE_BUCKET'], storageProvider === 'supabase'),
];

const notificationChecks = [
  check('Resend notification credentials', ['BACKY_RESEND_API_KEY'], notificationProvider === 'resend'),
  check('SMTP notification credentials', ['BACKY_SMTP_HOST', 'BACKY_SMTP_USER', 'BACKY_SMTP_PASSWORD'], notificationProvider === 'smtp'),
  check('HTTP notification endpoint', ['BACKY_EMAIL_DELIVERY_ENDPOINT'], notificationProvider === 'http-endpoint'),
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
  checkAny('auto payment credentials', ['BACKY_STRIPE_SECRET_KEY', 'STRIPE_SECRET_KEY', 'BACKY_PAYPAL_ACCESS_TOKEN', 'PAYPAL_ACCESS_TOKEN', 'BACKY_PADDLE_API_KEY', 'PADDLE_API_KEY', 'BACKY_SQUARE_ACCESS_TOKEN', 'SQUARE_ACCESS_TOKEN', 'BACKY_ADYEN_API_KEY', 'ADYEN_API_KEY', 'BACKY_MOLLIE_API_KEY', 'MOLLIE_API_KEY', 'BACKY_RAZORPAY_KEY_ID', 'RAZORPAY_KEY_ID'], requestPayment && paymentProvider === 'auto'),
  checkAny('auto subscription credentials', ['BACKY_STRIPE_SECRET_KEY', 'STRIPE_SECRET_KEY', 'BACKY_PAYPAL_ACCESS_TOKEN', 'PAYPAL_ACCESS_TOKEN', 'BACKY_PADDLE_API_KEY', 'PADDLE_API_KEY', 'BACKY_SQUARE_ACCESS_TOKEN', 'SQUARE_ACCESS_TOKEN', 'BACKY_ADYEN_API_KEY', 'ADYEN_API_KEY', 'BACKY_MOLLIE_API_KEY', 'MOLLIE_API_KEY', 'BACKY_RAZORPAY_KEY_ID', 'RAZORPAY_KEY_ID'], requestSubscriptions && subscriptionProvider === 'auto'),
  checkAny('Stripe payment/refund credentials', ['BACKY_STRIPE_SECRET_KEY', 'STRIPE_SECRET_KEY'], (requestPayment && paymentProvider === 'stripe') || (requestSubscriptions && subscriptionProvider === 'stripe')),
  checkAny('PayPal payment/subscription credentials', ['BACKY_PAYPAL_ACCESS_TOKEN', 'PAYPAL_ACCESS_TOKEN'], (requestPayment && paymentProvider === 'paypal') || (requestSubscriptions && subscriptionProvider === 'paypal')),
  checkAny('Paddle payment/subscription credentials', ['BACKY_PADDLE_API_KEY', 'PADDLE_API_KEY'], (requestPayment && paymentProvider === 'paddle') || (requestSubscriptions && subscriptionProvider === 'paddle')),
  checkAny('Square payment/subscription credentials', ['BACKY_SQUARE_ACCESS_TOKEN', 'SQUARE_ACCESS_TOKEN'], (requestPayment && paymentProvider === 'square') || (requestSubscriptions && subscriptionProvider === 'square')),
  check('Adyen credentials', ['BACKY_ADYEN_API_KEY', 'BACKY_ADYEN_MERCHANT_ACCOUNT'], (requestPayment && paymentProvider === 'adyen') || (requestSubscriptions && subscriptionProvider === 'adyen')),
  checkAny('Mollie payment/subscription credentials', ['BACKY_MOLLIE_API_KEY', 'MOLLIE_API_KEY'], (requestPayment && paymentProvider === 'mollie') || (requestSubscriptions && subscriptionProvider === 'mollie')),
  check('Razorpay payment/subscription credentials', ['BACKY_RAZORPAY_KEY_ID', 'BACKY_RAZORPAY_KEY_SECRET'], (requestPayment && paymentProvider === 'razorpay') || (requestSubscriptions && subscriptionProvider === 'razorpay')),
  checkAny('auto tax credentials', ['BACKY_STRIPE_SECRET_KEY', 'STRIPE_SECRET_KEY', 'BACKY_TAXJAR_API_KEY', 'TAXJAR_API_KEY', 'BACKY_AVALARA_ACCOUNT_ID', 'AVALARA_ACCOUNT_ID'], requestTax && taxProvider === 'auto'),
  checkAny('TaxJar credentials', ['BACKY_TAXJAR_API_KEY', 'TAXJAR_API_KEY'], requestTax && taxProvider === 'taxjar'),
  check('Avalara credentials', ['BACKY_AVALARA_ACCOUNT_ID', 'BACKY_AVALARA_LICENSE_KEY', 'BACKY_AVALARA_COMPANY_CODE'], requestTax && taxProvider === 'avalara'),
  checkAny('auto shipping credentials', ['BACKY_EASYPOST_API_KEY', 'EASYPOST_API_KEY', 'BACKY_SHIPPO_API_KEY', 'SHIPPO_API_KEY'], requestShipping && shippingProvider === 'auto'),
  checkAny('EasyPost credentials', ['BACKY_EASYPOST_API_KEY', 'EASYPOST_API_KEY'], requestShipping && shippingProvider === 'easypost'),
  checkAny('Shippo credentials', ['BACKY_SHIPPO_API_KEY', 'SHIPPO_API_KEY'], requestShipping && shippingProvider === 'shippo'),
  checkAny('auto catalog credentials', ['BACKY_SHOPIFY_ADMIN_ACCESS_TOKEN', 'BACKY_BIGCOMMERCE_ACCESS_TOKEN', 'BACKY_WOOCOMMERCE_CONSUMER_KEY', 'BACKY_ETSY_ACCESS_TOKEN', 'BACKY_MAGENTO_ACCESS_TOKEN'], requestCatalog && catalogProvider === 'auto'),
  check('Shopify catalog credentials', ['BACKY_SHOPIFY_ADMIN_ACCESS_TOKEN', 'BACKY_SHOPIFY_STORE_DOMAIN'], requestCatalog && catalogProvider === 'shopify'),
  check('BigCommerce catalog credentials', ['BACKY_BIGCOMMERCE_ACCESS_TOKEN', 'BACKY_BIGCOMMERCE_STORE_HASH'], requestCatalog && catalogProvider === 'bigcommerce'),
  check('WooCommerce catalog credentials', ['BACKY_WOOCOMMERCE_CONSUMER_KEY', 'BACKY_WOOCOMMERCE_CONSUMER_SECRET', 'BACKY_WOOCOMMERCE_STORE_URL'], requestCatalog && catalogProvider === 'woocommerce'),
  check('Etsy catalog credentials', ['BACKY_ETSY_ACCESS_TOKEN', 'BACKY_ETSY_API_KEY', 'BACKY_ETSY_SHOP_ID'], requestCatalog && catalogProvider === 'etsy'),
  check('Magento catalog credentials', ['BACKY_MAGENTO_ACCESS_TOKEN', 'BACKY_MAGENTO_STORE_URL'], requestCatalog && catalogProvider === 'magento'),
  checkAny('Commerce webhook secret', ['BACKY_COMMERCE_WEBHOOK_SECRET', 'COMMERCE_WEBHOOK_SECRET'], requestWebhooks && webhookProvider !== 'auto'),
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
    catalog: requestCatalog,
    subscriptions: requestSubscriptions,
    webhooks: requestWebhooks,
  },
  selectors: {
    paymentProvider,
    taxProvider,
    shippingProvider,
    catalogProvider,
    subscriptionProvider,
    webhookProvider,
  },
  checks: commerceChecks,
};

const collectFailures = (group) => group.checks
  .filter((item) => item.enabled && !item.ready)
  .map((item) => item.label);

const failures = [
  ...(database.requested && !database.ready ? ['database URL'] : []),
  ...(commerce.required && ![
    commerce.requested.payment,
    commerce.requested.tax,
    commerce.requested.shipping,
    commerce.requested.catalog,
    commerce.requested.subscriptions,
    commerce.requested.webhooks,
  ].some(Boolean) ? ['commerce provider group selection'] : []),
  ...collectFailures(settings),
  ...collectFailures(commerce),
];

console.log(JSON.stringify({
  ok: failures.length === 0,
  contract: 'backy.release-certification-doctor.v1',
  database,
  settings,
  commerce,
  failures,
}, null, 2));

if (env.BACKY_RELEASE_CERTIFICATION_DOCTOR_REQUIRED === '1' && failures.length > 0) {
  process.exit(1);
}
