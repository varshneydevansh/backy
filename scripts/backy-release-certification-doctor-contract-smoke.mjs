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

const assertProviderAliasReady = async ({ label, env }) => {
  const result = await runDoctor({
    BACKY_RELEASE_CERTIFICATION_DOCTOR_REQUIRED: '1',
    BACKY_COMMERCE_PROVIDER_CERTIFICATION_REQUIRED: '1',
    ...env,
  });
  assert(result.code === 0, `Doctor ${label} mode should accept provider-native aliases, got ${result.code}.`);
  const json = parseJson(result, `${label} alias-ready doctor`);
  assert(json.ok === true, `Doctor ${label} alias-ready mode should report ok=true.`);
  return json;
};

const normal = await runDoctor({});
assert(normal.code === 0, `Doctor default mode should exit 0, got ${normal.code}: ${normal.stderr}`);
const normalJson = parseJson(normal, 'default doctor');
assert(normalJson.contract === 'backy.release-certification-doctor.v1', 'Doctor default mode missing contract.');
assert(normalJson.ok === true, 'Doctor default mode should be ok when no certification groups are requested.');
assert(
  Array.isArray(normalJson.partialGateMap) && normalJson.partialGateMap.length === 4,
  'Doctor default mode should expose the current Partial-to-gate map.',
);
for (const { row, gate, preflight, workflow, requiredInputFamily, disposableGuard, mockGate, doctorRequiredEnv } of [
  {
    row: '/forms',
    gate: 'npm run ci:forms-postgres',
    preflight: 'npm run test:forms-postgres-preflight-contract',
    disposableGuard: 'npm run test:forms-postgres-disposable-guard',
    workflow: '.github/workflows/forms-postgres-contract.yml',
    requiredInputFamily: 'BACKY_DATABASE_URL or DATABASE_URL',
  },
  {
    row: 'Frontend manifest/OpenAPI/SDK APIs',
    gate: 'npm run ci:sdk-postgres-smoke',
    preflight: 'npm run test:sdk-postgres-preflight-contract',
    disposableGuard: 'npm run test:sdk-postgres-disposable-guard',
    workflow: '.github/workflows/sdk-postgres-smoke.yml',
    requiredInputFamily: 'BACKY_DATABASE_URL or DATABASE_URL',
  },
  {
    row: '/settings and Settings admin APIs',
    gate: 'npm run ci:settings-provider-certification',
    preflight: 'npm run test:settings-provider-certification-preflight-contract',
    doctorRequiredEnv: 'BACKY_RELEASE_CERTIFICATION_DOCTOR_REQUIRED=1',
    workflow: '.github/workflows/settings-provider-certification.yml',
    requiredInputFamily: 'storage, Vercel, notification',
  },
  {
    row: '/products and /orders',
    gate: 'npm run ci:commerce-provider-certification',
    preflight: 'npm run test:commerce-provider-certification-preflight-contract',
    mockGate: 'npm run ci:commerce-provider-smoke',
    doctorRequiredEnv: 'BACKY_RELEASE_CERTIFICATION_DOCTOR_REQUIRED=1',
    workflow: '.github/workflows/commerce-provider-certification.yml',
    requiredInputFamily: 'payment, tax, shipping',
  },
]) {
  const entry = normalJson.partialGateMap.find((item) => item.row === row);
  assert(entry, `Doctor Partial-to-gate map missing ${row}.`);
  assert(entry.gate === gate, `Doctor Partial-to-gate map for ${row} should use ${gate}.`);
  assert(entry.preflight === preflight, `Doctor Partial-to-gate map for ${row} should use ${preflight}.`);
  assert(entry.aggregatePreflight === 'npm run test:partial-gate-preflights', `Doctor Partial-to-gate map for ${row} should expose the aggregate Partial preflight.`);
  assert(entry.adminSourceGuard === 'npm run test:admin-contract-source', `Doctor Partial-to-gate map for ${row} should expose the admin source guard.`);
  assert(entry.workflow === workflow, `Doctor Partial-to-gate map for ${row} should use ${workflow}.`);
  if (disposableGuard) {
    assert(entry.disposableGuard === disposableGuard, `Doctor Partial-to-gate map for ${row} should use ${disposableGuard}.`);
  }
  if (mockGate) {
    assert(entry.mockGate === mockGate, `Doctor Partial-to-gate map for ${row} should use ${mockGate}.`);
  }
  if (doctorRequiredEnv) {
    assert(entry.doctorRequiredEnv === doctorRequiredEnv, `Doctor Partial-to-gate map for ${row} should document ${doctorRequiredEnv}.`);
  }
  assert(
    typeof entry.requiredInputFamily === 'string' && entry.requiredInputFamily.includes(requiredInputFamily),
    `Doctor Partial-to-gate map for ${row} should document ${requiredInputFamily} input requirements.`,
  );
}

const missingDatabase = await runDoctor({
  BACKY_RELEASE_CERTIFY_DATABASE: '1',
  BACKY_RELEASE_CERTIFICATION_DOCTOR_REQUIRED: '1',
});
assert(missingDatabase.code === 1, `Doctor required database mode should exit 1 without DB URL, got ${missingDatabase.code}.`);
const missingDatabaseJson = parseJson(missingDatabase, 'missing database doctor');
assert(missingDatabaseJson.ok === false, 'Doctor required database mode should report ok=false.');
assert(missingDatabaseJson.failures.includes('database URL'), 'Doctor required database mode should report database URL failure.');

const invalidDatabaseUrl = await runDoctor({
  BACKY_RELEASE_CERTIFY_DATABASE: '1',
  BACKY_DATABASE_URL: 'not-a-postgres-url',
  BACKY_RELEASE_CERTIFICATION_DOCTOR_REQUIRED: '1',
});
assert(invalidDatabaseUrl.code === 1, `Doctor required database mode should exit 1 with invalid DB URL, got ${invalidDatabaseUrl.code}.`);
const invalidDatabaseUrlJson = parseJson(invalidDatabaseUrl, 'invalid database URL doctor');
assert(invalidDatabaseUrlJson.ok === false, 'Doctor invalid database URL mode should report ok=false.');
assert(
  invalidDatabaseUrlJson.failures.includes('database URL format'),
  'Doctor required database mode should report database URL format failure.',
);
assert(
  invalidDatabaseUrlJson.database.urlValid === false,
  'Doctor required database mode should expose urlValid=false for malformed database URLs.',
);

const missingSettingsGroup = await runDoctor({
  BACKY_SETTINGS_PROVIDER_CERTIFICATION_REQUIRED: '1',
  BACKY_RELEASE_CERTIFICATION_DOCTOR_REQUIRED: '1',
});
assert(missingSettingsGroup.code === 1, `Doctor required Settings mode should exit 1 without provider groups, got ${missingSettingsGroup.code}.`);
const missingSettingsGroupJson = parseJson(missingSettingsGroup, 'missing settings group doctor');
assert(missingSettingsGroupJson.ok === false, 'Doctor required Settings mode should report ok=false.');
assert(
  missingSettingsGroupJson.failures.includes('settings provider group selection'),
  'Doctor required Settings mode should report settings provider group selection failure.',
);

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

const missingSettingsExternalAdminKey = await runDoctor({
  BACKY_SETTINGS_PROVIDER_CERTIFICATION_REQUIRED: '1',
  BACKY_SETTINGS_CERTIFY_NOTIFICATION: '1',
  BACKY_SETTINGS_CERTIFICATION_BASE_URL: 'https://backy-settings.example.test',
  BACKY_RELEASE_CERTIFICATION_DOCTOR_REQUIRED: '1',
});
assert(
  missingSettingsExternalAdminKey.code === 1,
  `Doctor external Settings mode should exit 1 without admin key, got ${missingSettingsExternalAdminKey.code}.`,
);
const missingSettingsExternalAdminKeyJson = parseJson(missingSettingsExternalAdminKey, 'missing Settings external admin key doctor');
assert(missingSettingsExternalAdminKeyJson.ok === false, 'Doctor external Settings mode should report ok=false.');
assert(
  missingSettingsExternalAdminKeyJson.failures.includes('Settings external admin key'),
  'Doctor external Settings mode should report Settings external admin key failure.',
);

const settingsExternalAdminAliasReady = await runDoctor({
  BACKY_SETTINGS_PROVIDER_CERTIFICATION_REQUIRED: '1',
  BACKY_SETTINGS_CERTIFY_NOTIFICATION: '1',
  BACKY_SETTINGS_CERTIFICATION_BASE_URL: 'https://backy-settings.example.test',
  BACKY_SETTINGS_CERTIFICATION_ADMIN_KEY: 'settings-external-admin-key',
  BACKY_RELEASE_CERTIFICATION_DOCTOR_REQUIRED: '1',
});
assert(
  settingsExternalAdminAliasReady.code === 0,
  `Doctor external Settings mode should accept BACKY_SETTINGS_CERTIFICATION_ADMIN_KEY, got ${settingsExternalAdminAliasReady.code}.`,
);

const invalidSettingsExternalBaseUrl = await runDoctor({
  BACKY_SETTINGS_PROVIDER_CERTIFICATION_REQUIRED: '1',
  BACKY_SETTINGS_CERTIFY_NOTIFICATION: '1',
  BACKY_SETTINGS_CERTIFICATION_BASE_URL: 'backy-settings.example.test',
  BACKY_SETTINGS_CERTIFICATION_ADMIN_KEY: 'settings-external-admin-key',
  BACKY_RELEASE_CERTIFICATION_DOCTOR_REQUIRED: '1',
});
assert(
  invalidSettingsExternalBaseUrl.code === 1,
  `Doctor external Settings mode should exit 1 with invalid base URL, got ${invalidSettingsExternalBaseUrl.code}.`,
);
const invalidSettingsExternalBaseUrlJson = parseJson(invalidSettingsExternalBaseUrl, 'invalid Settings external base URL doctor');
assert(invalidSettingsExternalBaseUrlJson.ok === false, 'Doctor invalid external Settings URL mode should report ok=false.');
assert(
  invalidSettingsExternalBaseUrlJson.failures.includes('Settings external base URL'),
  'Doctor invalid external Settings URL mode should report Settings external base URL failure.',
);

const missingCommerceExternalAdminKey = await runDoctor({
  BACKY_COMMERCE_PROVIDER_CERTIFICATION_REQUIRED: '1',
  BACKY_COMMERCE_CERTIFY_TAX: '1',
  BACKY_COMMERCE_CERTIFY_TAX_PROVIDER: 'http',
  BACKY_COMMERCE_CERTIFICATION_BASE_URL: 'https://backy-commerce.example.test',
  BACKY_RELEASE_CERTIFICATION_DOCTOR_REQUIRED: '1',
});
assert(
  missingCommerceExternalAdminKey.code === 1,
  `Doctor external Commerce mode should exit 1 without admin key, got ${missingCommerceExternalAdminKey.code}.`,
);
const missingCommerceExternalAdminKeyJson = parseJson(missingCommerceExternalAdminKey, 'missing Commerce external admin key doctor');
assert(missingCommerceExternalAdminKeyJson.ok === false, 'Doctor external Commerce mode should report ok=false.');
assert(
  missingCommerceExternalAdminKeyJson.failures.includes('Commerce external admin key'),
  'Doctor external Commerce mode should report Commerce external admin key failure.',
);

const commerceExternalAdminAliasReady = await runDoctor({
  BACKY_COMMERCE_PROVIDER_CERTIFICATION_REQUIRED: '1',
  BACKY_COMMERCE_CERTIFY_TAX: '1',
  BACKY_COMMERCE_CERTIFY_TAX_PROVIDER: 'http',
  BACKY_COMMERCE_CERTIFICATION_BASE_URL: 'https://backy-commerce.example.test',
  BACKY_COMMERCE_CERTIFICATION_ADMIN_KEY: 'commerce-external-admin-key',
  BACKY_RELEASE_CERTIFICATION_DOCTOR_REQUIRED: '1',
});
assert(
  commerceExternalAdminAliasReady.code === 0,
  `Doctor external Commerce mode should accept BACKY_COMMERCE_CERTIFICATION_ADMIN_KEY, got ${commerceExternalAdminAliasReady.code}.`,
);

const invalidCommerceExternalBaseUrl = await runDoctor({
  BACKY_COMMERCE_PROVIDER_CERTIFICATION_REQUIRED: '1',
  BACKY_COMMERCE_CERTIFY_TAX: '1',
  BACKY_COMMERCE_CERTIFY_TAX_PROVIDER: 'http',
  BACKY_COMMERCE_CERTIFICATION_BASE_URL: 'backy-commerce.example.test',
  BACKY_COMMERCE_CERTIFICATION_ADMIN_KEY: 'commerce-external-admin-key',
  BACKY_RELEASE_CERTIFICATION_DOCTOR_REQUIRED: '1',
});
assert(
  invalidCommerceExternalBaseUrl.code === 1,
  `Doctor external Commerce mode should exit 1 with invalid base URL, got ${invalidCommerceExternalBaseUrl.code}.`,
);
const invalidCommerceExternalBaseUrlJson = parseJson(invalidCommerceExternalBaseUrl, 'invalid Commerce external base URL doctor');
assert(invalidCommerceExternalBaseUrlJson.ok === false, 'Doctor invalid external Commerce URL mode should report ok=false.');
assert(
  invalidCommerceExternalBaseUrlJson.failures.includes('Commerce external base URL'),
  'Doctor invalid external Commerce URL mode should report Commerce external base URL failure.',
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

const s3StorageAliases = await runDoctor({
  BACKY_SETTINGS_PROVIDER_CERTIFICATION_REQUIRED: '1',
  BACKY_SETTINGS_CERTIFY_STORAGE: '1',
  BACKY_MEDIA_STORAGE_PROVIDER: 's3',
  AWS_ACCESS_KEY_ID: 'aws_alias_access',
  AWS_SECRET_ACCESS_KEY: 'aws_alias_secret',
  BACKY_STORAGE_BUCKET: 'backy-alias-bucket',
  AWS_REGION: 'us-east-1',
  BACKY_RELEASE_CERTIFICATION_DOCTOR_REQUIRED: '1',
});
assert(
  s3StorageAliases.code === 0,
  `Doctor S3 storage mode should accept runtime storage aliases, got ${s3StorageAliases.code}.`,
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

const supabaseStorageAliases = await runDoctor({
  BACKY_SETTINGS_PROVIDER_CERTIFICATION_REQUIRED: '1',
  BACKY_SETTINGS_CERTIFY_STORAGE: '1',
  BACKY_SETTINGS_CERTIFY_STORAGE_PROVIDER: 'supabase',
  SUPABASE_URL: 'https://supabase.example.test',
  SUPABASE_SERVICE_ROLE_KEY: 'supabase_alias_service_role',
  BACKY_STORAGE_BUCKET: 'backy-alias-bucket',
  BACKY_RELEASE_CERTIFICATION_DOCTOR_REQUIRED: '1',
});
assert(
  supabaseStorageAliases.code === 0,
  `Doctor Supabase storage mode should accept runtime storage aliases, got ${supabaseStorageAliases.code}.`,
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

const backyVercelAliases = await runDoctor({
  BACKY_SETTINGS_PROVIDER_CERTIFICATION_REQUIRED: '1',
  BACKY_SETTINGS_CERTIFY_VERCEL_SECRETS: '1',
  BACKY_RELEASE_CERTIFICATION_DOCTOR_REQUIRED: '1',
  BACKY_VERCEL_TOKEN: 'backy_vercel_alias_token',
  BACKY_VERCEL_PROJECT_ID: 'backy-vercel-project',
  BACKY_VERCEL_TEAM_ID: 'backy-vercel-team',
});
assert(
  backyVercelAliases.code === 0,
  `Doctor Vercel secrets mode should accept BACKY_VERCEL_* aliases, got ${backyVercelAliases.code}.`,
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

for (const { label, env, failure } of [
  {
    label: 'HTTP tax',
    env: {
      BACKY_COMMERCE_PROVIDER_CERTIFICATION_REQUIRED: '1',
      BACKY_COMMERCE_CERTIFY_TAX: '1',
      BACKY_COMMERCE_CERTIFY_TAX_PROVIDER: 'http',
    },
    failure: 'HTTP tax provider URL',
  },
  {
    label: 'HTTP shipping',
    env: {
      BACKY_COMMERCE_PROVIDER_CERTIFICATION_REQUIRED: '1',
      BACKY_COMMERCE_CERTIFY_SHIPPING: '1',
      BACKY_COMMERCE_CERTIFY_SHIPPING_PROVIDER: 'http',
    },
    failure: 'HTTP shipping provider URL',
  },
  {
    label: 'HTTP catalog',
    env: {
      BACKY_COMMERCE_PROVIDER_CERTIFICATION_REQUIRED: '1',
      BACKY_COMMERCE_CERTIFY_CATALOG: '1',
      BACKY_COMMERCE_CERTIFY_CATALOG_PROVIDER: 'http',
    },
    failure: 'HTTP catalog provider URL',
  },
  {
    label: 'HTTP subscription',
    env: {
      BACKY_COMMERCE_PROVIDER_CERTIFICATION_REQUIRED: '1',
      BACKY_COMMERCE_CERTIFY_SUBSCRIPTIONS: '1',
      BACKY_COMMERCE_CERTIFY_SUBSCRIPTION_PROVIDER: 'http',
    },
    failure: 'HTTP subscription provider URL',
  },
]) {
  await assertMissingProvider({ label, env, failure });
}

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

for (const { label, env } of [
  {
    label: 'selected Stripe payment',
    env: {
      BACKY_COMMERCE_CERTIFY_PAYMENT: '1',
      BACKY_COMMERCE_CERTIFY_PAYMENT_PROVIDER: 'stripe',
      STRIPE_SECRET_KEY: 'stripe_alias_secret',
    },
  },
  {
    label: 'selected PayPal payment',
    env: {
      BACKY_COMMERCE_CERTIFY_PAYMENT: '1',
      BACKY_COMMERCE_CERTIFY_PAYMENT_PROVIDER: 'paypal',
      PAYPAL_ACCESS_TOKEN: 'paypal_alias_token',
    },
  },
  {
    label: 'selected Paddle subscription',
    env: {
      BACKY_COMMERCE_CERTIFY_SUBSCRIPTIONS: '1',
      BACKY_COMMERCE_CERTIFY_SUBSCRIPTION_PROVIDER: 'paddle',
      PADDLE_API_KEY: 'paddle_alias_key',
    },
  },
  {
    label: 'selected Square payment',
    env: {
      BACKY_COMMERCE_CERTIFY_PAYMENT: '1',
      BACKY_COMMERCE_CERTIFY_PAYMENT_PROVIDER: 'square',
      SQUARE_ACCESS_TOKEN: 'square_alias_token',
    },
  },
  {
    label: 'selected Adyen subscription',
    env: {
      BACKY_COMMERCE_CERTIFY_SUBSCRIPTIONS: '1',
      BACKY_COMMERCE_CERTIFY_SUBSCRIPTION_PROVIDER: 'adyen',
      ADYEN_API_KEY: 'adyen_alias_key',
      ADYEN_MERCHANT_ACCOUNT: 'adyen_alias_merchant',
    },
  },
  {
    label: 'selected Mollie payment',
    env: {
      BACKY_COMMERCE_CERTIFY_PAYMENT: '1',
      BACKY_COMMERCE_CERTIFY_PAYMENT_PROVIDER: 'mollie',
      MOLLIE_API_KEY: 'mollie_alias_key',
    },
  },
  {
    label: 'selected Razorpay subscription',
    env: {
      BACKY_COMMERCE_CERTIFY_SUBSCRIPTIONS: '1',
      BACKY_COMMERCE_CERTIFY_SUBSCRIPTION_PROVIDER: 'razorpay',
      RAZORPAY_KEY_ID: 'razorpay_alias_key',
      RAZORPAY_KEY_SECRET: 'razorpay_alias_secret',
    },
  },
  {
    label: 'selected TaxJar tax',
    env: {
      BACKY_COMMERCE_CERTIFY_TAX: '1',
      BACKY_COMMERCE_CERTIFY_TAX_PROVIDER: 'taxjar',
      TAXJAR_API_KEY: 'taxjar_alias_key',
    },
  },
  {
    label: 'selected Avalara tax',
    env: {
      BACKY_COMMERCE_CERTIFY_TAX: '1',
      BACKY_COMMERCE_CERTIFY_TAX_PROVIDER: 'avalara',
      AVALARA_ACCOUNT_ID: 'avalara_alias_account',
      AVALARA_LICENSE_KEY: 'avalara_alias_license',
      AVALARA_COMPANY_CODE: 'avalara_alias_company',
    },
  },
  {
    label: 'selected EasyPost shipping',
    env: {
      BACKY_COMMERCE_CERTIFY_SHIPPING: '1',
      BACKY_COMMERCE_CERTIFY_SHIPPING_PROVIDER: 'easypost',
      EASYPOST_API_KEY: 'easypost_alias_key',
    },
  },
  {
    label: 'selected Shippo shipping',
    env: {
      BACKY_COMMERCE_CERTIFY_SHIPPING: '1',
      BACKY_COMMERCE_CERTIFY_SHIPPING_PROVIDER: 'shippo',
      SHIPPO_API_KEY: 'shippo_alias_key',
    },
  },
  {
    label: 'selected HTTP tax',
    env: {
      BACKY_COMMERCE_CERTIFY_TAX: '1',
      BACKY_COMMERCE_CERTIFY_TAX_PROVIDER: 'http',
      COMMERCE_TAX_PROVIDER_URL: 'https://commerce-http.example.test/tax',
    },
  },
  {
    label: 'selected HTTP shipping',
    env: {
      BACKY_COMMERCE_CERTIFY_SHIPPING: '1',
      BACKY_COMMERCE_CERTIFY_SHIPPING_PROVIDER: 'http',
      COMMERCE_SHIPPING_PROVIDER_URL: 'https://commerce-http.example.test/shipping',
    },
  },
  {
    label: 'selected Shopify catalog',
    env: {
      BACKY_COMMERCE_CERTIFY_CATALOG: '1',
      BACKY_COMMERCE_CERTIFY_CATALOG_PROVIDER: 'shopify',
      SHOPIFY_ADMIN_ACCESS_TOKEN: 'shopify_alias_token',
      SHOPIFY_STORE_DOMAIN: 'shop.example.test',
    },
  },
  {
    label: 'selected HTTP catalog',
    env: {
      BACKY_COMMERCE_CERTIFY_CATALOG: '1',
      BACKY_COMMERCE_CERTIFY_CATALOG_PROVIDER: 'http',
      COMMERCE_PRODUCT_SYNC_URL: 'https://commerce-http.example.test/catalog',
    },
  },
  {
    label: 'selected HTTP subscription',
    env: {
      BACKY_COMMERCE_CERTIFY_SUBSCRIPTIONS: '1',
      BACKY_COMMERCE_CERTIFY_SUBSCRIPTION_PROVIDER: 'http',
      COMMERCE_SUBSCRIPTION_ACTION_URL: 'https://commerce-http.example.test/subscription',
    },
  },
  {
    label: 'selected BigCommerce catalog',
    env: {
      BACKY_COMMERCE_CERTIFY_CATALOG: '1',
      BACKY_COMMERCE_CERTIFY_CATALOG_PROVIDER: 'bigcommerce',
      BIGCOMMERCE_ACCESS_TOKEN: 'bigcommerce_alias_token',
      BIGCOMMERCE_STORE_HASH: 'store_hash',
    },
  },
  {
    label: 'selected WooCommerce catalog',
    env: {
      BACKY_COMMERCE_CERTIFY_CATALOG: '1',
      BACKY_COMMERCE_CERTIFY_CATALOG_PROVIDER: 'woocommerce',
      WOOCOMMERCE_CONSUMER_KEY: 'woocommerce_alias_key',
      WOOCOMMERCE_CONSUMER_SECRET: 'woocommerce_alias_secret',
      WOOCOMMERCE_STORE_URL: 'https://woo.example.test',
    },
  },
  {
    label: 'selected Etsy catalog',
    env: {
      BACKY_COMMERCE_CERTIFY_CATALOG: '1',
      BACKY_COMMERCE_CERTIFY_CATALOG_PROVIDER: 'etsy',
      ETSY_ACCESS_TOKEN: 'etsy_alias_token',
      ETSY_API_KEY: 'etsy_alias_key',
      ETSY_SHOP_ID: 'etsy_shop',
    },
  },
  {
    label: 'selected Magento catalog',
    env: {
      BACKY_COMMERCE_CERTIFY_CATALOG: '1',
      BACKY_COMMERCE_CERTIFY_CATALOG_PROVIDER: 'magento',
      MAGENTO_ACCESS_TOKEN: 'magento_alias_token',
      MAGENTO_STORE_URL: 'https://magento.example.test',
    },
  },
]) {
  await assertProviderAliasReady({ label, env });
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

await assertProviderAliasReady({
  label: 'selected commerce webhook',
  env: {
    BACKY_COMMERCE_CERTIFY_WEBHOOKS: '1',
    BACKY_COMMERCE_CERTIFY_WEBHOOK_PROVIDER: 'generic',
    COMMERCE_WEBHOOK_SECRET: 'commerce_webhook_alias_secret',
  },
});

await assertMissingProvider({
  label: 'selected Razorpay commerce webhook',
  env: {
    BACKY_COMMERCE_PROVIDER_CERTIFICATION_REQUIRED: '1',
    BACKY_COMMERCE_CERTIFY_WEBHOOKS: '1',
    BACKY_COMMERCE_CERTIFY_WEBHOOK_PROVIDER: 'razorpay',
    COMMERCE_WEBHOOK_SECRET: 'commerce_webhook_alias_secret',
  },
  failure: 'Razorpay webhook credentials',
});

await assertProviderAliasReady({
  label: 'selected Razorpay commerce webhook',
  env: {
    BACKY_COMMERCE_CERTIFY_WEBHOOKS: '1',
    BACKY_COMMERCE_CERTIFY_WEBHOOK_PROVIDER: 'razorpay',
    COMMERCE_WEBHOOK_SECRET: 'commerce_webhook_alias_secret',
    RAZORPAY_KEY_ID: 'razorpay_alias_key',
    RAZORPAY_KEY_SECRET: 'razorpay_alias_secret',
  },
});

console.log(JSON.stringify({
  ok: true,
  contract: 'backy.release-certification-doctor-contract.v1',
}, null, 2));
