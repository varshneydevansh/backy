#!/usr/bin/env node

import { spawn } from 'node:child_process';

const runDoctor = (env) => new Promise((resolve) => {
  const child = spawn(process.execPath, ['scripts/backy-release-certification-doctor.mjs'], {
    cwd: new URL('..', import.meta.url),
    env: {
      PATH: process.env.PATH,
      HOME: process.env.HOME,
      ...env,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  let stdout = '';
  let stderr = '';
  child.stdout.on('data', (chunk) => {
    stdout += chunk.toString();
  });
  child.stderr.on('data', (chunk) => {
    stderr += chunk.toString();
  });
  child.on('exit', (code) => resolve({ code, stdout, stderr }));
});

const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

const parseJson = (result, label) => {
  try {
    return JSON.parse(result.stdout);
  } catch (error) {
    throw new Error(`${label} did not emit JSON: ${error instanceof Error ? error.message : error}\nstdout=${result.stdout}\nstderr=${result.stderr}`);
  }
};

const assertMissingProvider = async ({ label, env, failure }) => {
  const result = await runDoctor({
    BACKY_RELEASE_CERTIFICATION_DOCTOR_REQUIRED: '1',
    ...env,
  });
  assert(result.code === 1, `Doctor ${label} mode should exit 1 without required credentials, got ${result.code}.`);
  const json = parseJson(result, `missing ${label} doctor`);
  assert(json.ok === false, `Doctor ${label} mode should report ok=false.`);
  assert(
    json.failures.includes(failure),
    `Doctor ${label} mode should report ${failure} failure. Actual failures: ${JSON.stringify(json.failures)}`,
  );
  return json;
};

const normal = await runDoctor({});
assert(normal.code === 0, `Doctor default mode should exit 0, got ${normal.code}: ${normal.stderr}`);
const normalJson = parseJson(normal, 'default doctor');
assert(normalJson.contract === 'backy.release-certification-doctor.v1', 'Doctor default mode missing contract.');
assert(normalJson.ok === true, 'Doctor default mode should be ok when no certification groups are requested.');

const missingDatabase = await runDoctor({
  BACKY_RELEASE_CERTIFY_DATABASE: '1',
  BACKY_RELEASE_CERTIFICATION_DOCTOR_REQUIRED: '1',
});
assert(missingDatabase.code === 1, `Doctor required database mode should exit 1 without DB URL, got ${missingDatabase.code}.`);
const missingDatabaseJson = parseJson(missingDatabase, 'missing database doctor');
assert(missingDatabaseJson.ok === false, 'Doctor required database mode should report ok=false.');
assert(missingDatabaseJson.failures.includes('database URL'), 'Doctor required database mode should report database URL failure.');

const missingCommerceGroup = await runDoctor({
  BACKY_COMMERCE_PROVIDER_CERTIFICATION_REQUIRED: '1',
  BACKY_RELEASE_CERTIFICATION_DOCTOR_REQUIRED: '1',
});
assert(missingCommerceGroup.code === 1, `Doctor required Commerce mode should exit 1 without provider groups, got ${missingCommerceGroup.code}.`);
const missingCommerceGroupJson = parseJson(missingCommerceGroup, 'missing commerce group doctor');
assert(missingCommerceGroupJson.ok === false, 'Doctor required Commerce mode should report ok=false.');
assert(
  missingCommerceGroupJson.failures.includes('commerce provider group selection'),
  'Doctor required Commerce mode should report commerce provider group selection failure.',
);

await assertMissingProvider({
  label: 'auto Razorpay payment partial credentials',
  env: {
    BACKY_COMMERCE_PROVIDER_CERTIFICATION_REQUIRED: '1',
    BACKY_COMMERCE_CERTIFY_PAYMENT: '1',
    BACKY_RAZORPAY_KEY_ID: 'rzp_key_only',
  },
  failure: 'auto payment credentials',
});

const completeAutoRazorpayPayment = await runDoctor({
  BACKY_RELEASE_CERTIFICATION_DOCTOR_REQUIRED: '1',
  BACKY_COMMERCE_PROVIDER_CERTIFICATION_REQUIRED: '1',
  BACKY_COMMERCE_CERTIFY_PAYMENT: '1',
  RAZORPAY_KEY_ID: 'rzp_alias_key',
  RAZORPAY_KEY_SECRET: 'rzp_alias_secret',
});
assert(
  completeAutoRazorpayPayment.code === 0,
  `Doctor auto Razorpay payment mode should accept complete alias credentials, got ${completeAutoRazorpayPayment.code}.`,
);

await assertMissingProvider({
  label: 'auto Avalara tax partial credentials',
  env: {
    BACKY_COMMERCE_PROVIDER_CERTIFICATION_REQUIRED: '1',
    BACKY_COMMERCE_CERTIFY_TAX: '1',
    BACKY_AVALARA_ACCOUNT_ID: 'avalara_account_only',
  },
  failure: 'auto tax credentials',
});

const completeAutoAvalaraTax = await runDoctor({
  BACKY_RELEASE_CERTIFICATION_DOCTOR_REQUIRED: '1',
  BACKY_COMMERCE_PROVIDER_CERTIFICATION_REQUIRED: '1',
  BACKY_COMMERCE_CERTIFY_TAX: '1',
  AVALARA_ACCOUNT_ID: 'avalara_alias_account',
  AVALARA_LICENSE_KEY: 'avalara_alias_license',
  AVALARA_COMPANY_CODE: 'avalara_alias_company',
});
assert(
  completeAutoAvalaraTax.code === 0,
  `Doctor auto Avalara tax mode should accept complete alias credentials, got ${completeAutoAvalaraTax.code}.`,
);

await assertMissingProvider({
  label: 'auto Shopify catalog partial credentials',
  env: {
    BACKY_COMMERCE_PROVIDER_CERTIFICATION_REQUIRED: '1',
    BACKY_COMMERCE_CERTIFY_CATALOG: '1',
    BACKY_SHOPIFY_ADMIN_ACCESS_TOKEN: 'shopify_token_only',
  },
  failure: 'auto catalog credentials',
});

const completeAutoShopifyCatalog = await runDoctor({
  BACKY_RELEASE_CERTIFICATION_DOCTOR_REQUIRED: '1',
  BACKY_COMMERCE_PROVIDER_CERTIFICATION_REQUIRED: '1',
  BACKY_COMMERCE_CERTIFY_CATALOG: '1',
  SHOPIFY_ADMIN_ACCESS_TOKEN: 'shopify_alias_token',
  SHOPIFY_ADMIN_API_BASE_URL: 'https://shop.example.test/admin/api/2024-10',
});
assert(
  completeAutoShopifyCatalog.code === 0,
  `Doctor auto Shopify catalog mode should accept complete alias/base URL credentials, got ${completeAutoShopifyCatalog.code}.`,
);

const missingS3Storage = await runDoctor({
  BACKY_SETTINGS_PROVIDER_CERTIFICATION_REQUIRED: '1',
  BACKY_SETTINGS_CERTIFY_STORAGE: '1',
  BACKY_SETTINGS_CERTIFY_STORAGE_PROVIDER: 's3',
  BACKY_RELEASE_CERTIFICATION_DOCTOR_REQUIRED: '1',
});
assert(missingS3Storage.code === 1, `Doctor S3 storage mode should exit 1 without S3 credentials, got ${missingS3Storage.code}.`);
const missingS3StorageJson = parseJson(missingS3Storage, 'missing S3 storage doctor');
assert(missingS3StorageJson.ok === false, 'Doctor S3 storage mode should report ok=false.');
assert(
  missingS3StorageJson.failures.includes('S3 storage credentials'),
  'Doctor S3 storage mode should report S3 credential failure.',
);

const missingSupabaseStorage = await runDoctor({
  BACKY_SETTINGS_PROVIDER_CERTIFICATION_REQUIRED: '1',
  BACKY_SETTINGS_CERTIFY_STORAGE: '1',
  BACKY_SETTINGS_CERTIFY_STORAGE_PROVIDER: 'supabase',
  BACKY_RELEASE_CERTIFICATION_DOCTOR_REQUIRED: '1',
});
assert(
  missingSupabaseStorage.code === 1,
  `Doctor Supabase storage mode should exit 1 without Supabase credentials, got ${missingSupabaseStorage.code}.`,
);
const missingSupabaseStorageJson = parseJson(missingSupabaseStorage, 'missing Supabase storage doctor');
assert(missingSupabaseStorageJson.ok === false, 'Doctor Supabase storage mode should report ok=false.');
assert(
  missingSupabaseStorageJson.failures.includes('Supabase storage credentials'),
  'Doctor Supabase storage mode should report Supabase credential failure.',
);

const missingResendNotification = await runDoctor({
  BACKY_SETTINGS_PROVIDER_CERTIFICATION_REQUIRED: '1',
  BACKY_SETTINGS_CERTIFY_NOTIFICATION: '1',
  BACKY_SETTINGS_CERTIFY_NOTIFICATION_PROVIDER: 'resend',
  BACKY_RELEASE_CERTIFICATION_DOCTOR_REQUIRED: '1',
});
assert(
  missingResendNotification.code === 1,
  `Doctor Resend notification mode should exit 1 without Resend credentials, got ${missingResendNotification.code}.`,
);
const missingResendNotificationJson = parseJson(missingResendNotification, 'missing Resend notification doctor');
assert(missingResendNotificationJson.ok === false, 'Doctor Resend notification mode should report ok=false.');
assert(
  missingResendNotificationJson.failures.includes('Resend notification credentials'),
  'Doctor Resend notification mode should report Resend credential failure.',
);

const missingSmtpNotification = await runDoctor({
  BACKY_SETTINGS_PROVIDER_CERTIFICATION_REQUIRED: '1',
  BACKY_SETTINGS_CERTIFY_NOTIFICATION: '1',
  BACKY_SETTINGS_CERTIFY_NOTIFICATION_PROVIDER: 'smtp',
  BACKY_RELEASE_CERTIFICATION_DOCTOR_REQUIRED: '1',
});
assert(
  missingSmtpNotification.code === 1,
  `Doctor SMTP notification mode should exit 1 without SMTP host, got ${missingSmtpNotification.code}.`,
);
const missingSmtpNotificationJson = parseJson(missingSmtpNotification, 'missing SMTP notification doctor');
assert(
  missingSmtpNotificationJson.failures.includes('SMTP notification credentials'),
  'Doctor SMTP notification mode should report SMTP credential failure.',
);

const missingHttpNotification = await runDoctor({
  BACKY_SETTINGS_PROVIDER_CERTIFICATION_REQUIRED: '1',
  BACKY_SETTINGS_CERTIFY_NOTIFICATION: '1',
  BACKY_SETTINGS_CERTIFY_NOTIFICATION_PROVIDER: 'http-endpoint',
  BACKY_RELEASE_CERTIFICATION_DOCTOR_REQUIRED: '1',
});
assert(
  missingHttpNotification.code === 1,
  `Doctor HTTP notification mode should exit 1 without endpoint, got ${missingHttpNotification.code}.`,
);
const missingHttpNotificationJson = parseJson(missingHttpNotification, 'missing HTTP notification doctor');
assert(
  missingHttpNotificationJson.failures.includes('HTTP notification endpoint'),
  'Doctor HTTP notification mode should report HTTP endpoint failure.',
);

const resendAliasNotification = await runDoctor({
  BACKY_SETTINGS_PROVIDER_CERTIFICATION_REQUIRED: '1',
  BACKY_SETTINGS_CERTIFY_NOTIFICATION: '1',
  BACKY_SETTINGS_CERTIFY_NOTIFICATION_PROVIDER: 'resend',
  BACKY_RELEASE_CERTIFICATION_DOCTOR_REQUIRED: '1',
  RESEND_API_KEY: 'resend_alias_key',
});
assert(
  resendAliasNotification.code === 0,
  `Doctor Resend notification mode should accept RESEND_API_KEY alias, got ${resendAliasNotification.code}.`,
);

const smtpHostOnlyNotification = await runDoctor({
  BACKY_SETTINGS_PROVIDER_CERTIFICATION_REQUIRED: '1',
  BACKY_SETTINGS_CERTIFY_NOTIFICATION: '1',
  BACKY_SETTINGS_CERTIFY_NOTIFICATION_PROVIDER: 'smtp',
  BACKY_RELEASE_CERTIFICATION_DOCTOR_REQUIRED: '1',
  SMTP_HOST: 'smtp.example.test',
});
assert(
  smtpHostOnlyNotification.code === 0,
  `Doctor SMTP notification mode should accept host-only SMTP runtime, got ${smtpHostOnlyNotification.code}.`,
);

const httpAliasNotification = await runDoctor({
  BACKY_SETTINGS_PROVIDER_CERTIFICATION_REQUIRED: '1',
  BACKY_SETTINGS_CERTIFY_NOTIFICATION: '1',
  BACKY_SETTINGS_CERTIFY_NOTIFICATION_PROVIDER: 'http-endpoint',
  BACKY_RELEASE_CERTIFICATION_DOCTOR_REQUIRED: '1',
  BACKY_TRANSACTIONAL_EMAIL_WEBHOOK_URL: 'https://notify.example.test/backy',
});
assert(
  httpAliasNotification.code === 0,
  `Doctor HTTP notification mode should accept transactional webhook URL alias, got ${httpAliasNotification.code}.`,
);

const missingVercelSecrets = await runDoctor({
  BACKY_SETTINGS_PROVIDER_CERTIFICATION_REQUIRED: '1',
  BACKY_SETTINGS_CERTIFY_VERCEL_SECRETS: '1',
  BACKY_RELEASE_CERTIFICATION_DOCTOR_REQUIRED: '1',
});
assert(
  missingVercelSecrets.code === 1,
  `Doctor Vercel secrets mode should exit 1 without Vercel credentials, got ${missingVercelSecrets.code}.`,
);
const missingVercelSecretsJson = parseJson(missingVercelSecrets, 'missing Vercel secrets doctor');
assert(missingVercelSecretsJson.ok === false, 'Doctor Vercel secrets mode should report ok=false.');
assert(
  missingVercelSecretsJson.failures.includes('Vercel token') &&
    missingVercelSecretsJson.failures.includes('Vercel project'),
  'Doctor Vercel secrets mode should report token and project failures.',
);

const stripePayment = await runDoctor({
  BACKY_COMMERCE_PROVIDER_CERTIFICATION_REQUIRED: '1',
  BACKY_COMMERCE_CERTIFY_PAYMENT: '1',
  BACKY_COMMERCE_CERTIFY_PAYMENT_PROVIDER: 'stripe',
  BACKY_RELEASE_CERTIFICATION_DOCTOR_REQUIRED: '1',
});
assert(stripePayment.code === 1, `Doctor Stripe payment mode should exit 1 without Stripe key, got ${stripePayment.code}.`);
const stripePaymentJson = parseJson(stripePayment, 'missing Stripe payment doctor');
assert(
  stripePaymentJson.failures.includes('Stripe payment/refund credentials'),
  'Doctor Stripe payment mode should report Stripe credential failure.',
);

const razorpayPayment = await runDoctor({
  BACKY_COMMERCE_PROVIDER_CERTIFICATION_REQUIRED: '1',
  BACKY_COMMERCE_CERTIFY_PAYMENT: '1',
  BACKY_COMMERCE_CERTIFY_PAYMENT_PROVIDER: 'razorpay',
  BACKY_RELEASE_CERTIFICATION_DOCTOR_REQUIRED: '1',
});
assert(razorpayPayment.code === 1, `Doctor Razorpay payment mode should exit 1 without Razorpay keys, got ${razorpayPayment.code}.`);
const razorpayPaymentJson = parseJson(razorpayPayment, 'missing Razorpay payment doctor');
assert(
  razorpayPaymentJson.failures.includes('Razorpay payment/subscription credentials'),
  'Doctor Razorpay payment mode should report Razorpay credential failure.',
);

const razorpaySubscription = await runDoctor({
  BACKY_COMMERCE_PROVIDER_CERTIFICATION_REQUIRED: '1',
  BACKY_COMMERCE_CERTIFY_SUBSCRIPTIONS: '1',
  BACKY_COMMERCE_CERTIFY_SUBSCRIPTION_PROVIDER: 'razorpay',
  BACKY_RELEASE_CERTIFICATION_DOCTOR_REQUIRED: '1',
});
assert(razorpaySubscription.code === 1, `Doctor Razorpay subscription mode should exit 1 without Razorpay keys, got ${razorpaySubscription.code}.`);
const razorpaySubscriptionJson = parseJson(razorpaySubscription, 'missing Razorpay subscription doctor');
assert(
  razorpaySubscriptionJson.failures.includes('Razorpay payment/subscription credentials'),
  'Doctor Razorpay subscription mode should report Razorpay credential failure.',
);

for (const { provider, failure } of [
  { provider: 'stripe', failure: 'Stripe payment/refund credentials' },
  { provider: 'paypal', failure: 'PayPal payment/subscription credentials' },
  { provider: 'paddle', failure: 'Paddle payment/subscription credentials' },
  { provider: 'square', failure: 'Square payment/subscription credentials' },
  { provider: 'adyen', failure: 'Adyen credentials' },
  { provider: 'mollie', failure: 'Mollie payment/subscription credentials' },
]) {
  await assertMissingProvider({
    label: `${provider} subscription`,
    env: {
      BACKY_COMMERCE_PROVIDER_CERTIFICATION_REQUIRED: '1',
      BACKY_COMMERCE_CERTIFY_SUBSCRIPTIONS: '1',
      BACKY_COMMERCE_CERTIFY_SUBSCRIPTION_PROVIDER: provider,
    },
    failure,
  });
}

const taxJarTax = await runDoctor({
  BACKY_COMMERCE_PROVIDER_CERTIFICATION_REQUIRED: '1',
  BACKY_COMMERCE_CERTIFY_TAX: '1',
  BACKY_COMMERCE_CERTIFY_TAX_PROVIDER: 'taxjar',
  BACKY_RELEASE_CERTIFICATION_DOCTOR_REQUIRED: '1',
});
assert(taxJarTax.code === 1, `Doctor TaxJar tax mode should exit 1 without TaxJar key, got ${taxJarTax.code}.`);
const taxJarTaxJson = parseJson(taxJarTax, 'missing TaxJar tax doctor');
assert(
  taxJarTaxJson.failures.includes('TaxJar credentials'),
  'Doctor TaxJar tax mode should report TaxJar credential failure.',
);

await assertMissingProvider({
  label: 'Avalara tax',
  env: {
    BACKY_COMMERCE_PROVIDER_CERTIFICATION_REQUIRED: '1',
    BACKY_COMMERCE_CERTIFY_TAX: '1',
    BACKY_COMMERCE_CERTIFY_TAX_PROVIDER: 'avalara',
  },
  failure: 'Avalara credentials',
});

const easyPostShipping = await runDoctor({
  BACKY_COMMERCE_PROVIDER_CERTIFICATION_REQUIRED: '1',
  BACKY_COMMERCE_CERTIFY_SHIPPING: '1',
  BACKY_COMMERCE_CERTIFY_SHIPPING_PROVIDER: 'easypost',
  BACKY_RELEASE_CERTIFICATION_DOCTOR_REQUIRED: '1',
});
assert(
  easyPostShipping.code === 1,
  `Doctor EasyPost shipping mode should exit 1 without EasyPost key, got ${easyPostShipping.code}.`,
);
const easyPostShippingJson = parseJson(easyPostShipping, 'missing EasyPost shipping doctor');
assert(
  easyPostShippingJson.failures.includes('EasyPost credentials'),
  'Doctor EasyPost shipping mode should report EasyPost credential failure.',
);

await assertMissingProvider({
  label: 'Shippo shipping',
  env: {
    BACKY_COMMERCE_PROVIDER_CERTIFICATION_REQUIRED: '1',
    BACKY_COMMERCE_CERTIFY_SHIPPING: '1',
    BACKY_COMMERCE_CERTIFY_SHIPPING_PROVIDER: 'shippo',
  },
  failure: 'Shippo credentials',
});

const shopifyCatalog = await runDoctor({
  BACKY_COMMERCE_PROVIDER_CERTIFICATION_REQUIRED: '1',
  BACKY_COMMERCE_CERTIFY_CATALOG: '1',
  BACKY_COMMERCE_CERTIFY_CATALOG_PROVIDER: 'shopify',
  BACKY_RELEASE_CERTIFICATION_DOCTOR_REQUIRED: '1',
});
assert(
  shopifyCatalog.code === 1,
  `Doctor Shopify catalog mode should exit 1 without Shopify credentials, got ${shopifyCatalog.code}.`,
);
const shopifyCatalogJson = parseJson(shopifyCatalog, 'missing Shopify catalog doctor');
assert(
  shopifyCatalogJson.failures.includes('Shopify catalog credentials'),
  'Doctor Shopify catalog mode should report Shopify credential failure.',
);

const magentoCatalog = await runDoctor({
  BACKY_COMMERCE_PROVIDER_CERTIFICATION_REQUIRED: '1',
  BACKY_COMMERCE_CERTIFY_CATALOG: '1',
  BACKY_COMMERCE_CERTIFY_CATALOG_PROVIDER: 'magento',
  BACKY_RELEASE_CERTIFICATION_DOCTOR_REQUIRED: '1',
});
assert(
  magentoCatalog.code === 1,
  `Doctor Magento catalog mode should exit 1 without Magento credentials, got ${magentoCatalog.code}.`,
);
const magentoCatalogJson = parseJson(magentoCatalog, 'missing Magento catalog doctor');
assert(
  magentoCatalogJson.failures.includes('Magento catalog credentials'),
  'Doctor Magento catalog mode should report Magento credential failure.',
);

for (const { provider, failure } of [
  { provider: 'bigcommerce', failure: 'BigCommerce catalog credentials' },
  { provider: 'woocommerce', failure: 'WooCommerce catalog credentials' },
  { provider: 'etsy', failure: 'Etsy catalog credentials' },
]) {
  await assertMissingProvider({
    label: `${provider} catalog`,
    env: {
      BACKY_COMMERCE_PROVIDER_CERTIFICATION_REQUIRED: '1',
      BACKY_COMMERCE_CERTIFY_CATALOG: '1',
      BACKY_COMMERCE_CERTIFY_CATALOG_PROVIDER: provider,
    },
    failure,
  });
}

const commerceWebhook = await runDoctor({
  BACKY_COMMERCE_PROVIDER_CERTIFICATION_REQUIRED: '1',
  BACKY_COMMERCE_CERTIFY_WEBHOOKS: '1',
  BACKY_COMMERCE_CERTIFY_WEBHOOK_PROVIDER: 'stripe',
  BACKY_RELEASE_CERTIFICATION_DOCTOR_REQUIRED: '1',
});
assert(
  commerceWebhook.code === 1,
  `Doctor Commerce webhook mode should exit 1 without webhook secret, got ${commerceWebhook.code}.`,
);
const commerceWebhookJson = parseJson(commerceWebhook, 'missing Commerce webhook doctor');
assert(
  commerceWebhookJson.failures.includes('Commerce webhook secret'),
  'Doctor Commerce webhook mode should report webhook secret failure.',
);

console.log(JSON.stringify({
  ok: true,
  contract: 'backy.release-certification-doctor-contract.v1',
}, null, 2));
