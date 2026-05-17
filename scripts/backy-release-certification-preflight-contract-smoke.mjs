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

const workflow = read('../.github/workflows/backy-release-certification.yml');
const doctor = read('./backy-release-certification-doctor.mjs');
const doctorContract = read('./backy-release-certification-doctor-contract-smoke.mjs');
const rootPackage = read('../package.json');
const setup = read('../SETUP.md');
const audit = read('../specs/page-completion-audit/backy-page-surface-audit.md');

includesAll(
  workflow,
  [
    'name: Backy Release Certification',
    'workflow_dispatch:',
    'certify_database:',
    'disposable_database_confirmed:',
    'database_expected_host:',
    'database_expected_name:',
    'certify_settings_providers:',
    'certify_commerce_providers:',
    'certify_storage:',
    'storage_provider:',
    'certify_rotation:',
    'certify_vercel_secrets:',
    'vercel_project_id:',
    'vercel_team_id:',
    'certify_notification:',
    'notification_provider:',
    'payment_provider:',
    'tax_provider:',
    'shipping_provider:',
    'catalog_provider:',
    'subscription_provider:',
    'webhook_provider:',
    'BACKY_DATABASE_URL',
    'DATABASE_URL',
    'BACKY_DATABASE_URL or DATABASE_URL',
    'BACKY_DATABASE_CERTIFICATION_EXPECTED_HOST',
    'BACKY_DATABASE_CERTIFICATION_EXPECTED_DATABASE',
    "BACKY_DATA_MODE: ${{ inputs.certify_database && 'database' || 'demo' }}",
    'BACKY_SETTINGS_PROVIDER_CERTIFICATION_REQUIRED',
    'BACKY_SETTINGS_CERTIFY_STORAGE_PROVIDER',
    'BACKY_SETTINGS_CERTIFY_VERCEL_PROJECT_ID',
    'BACKY_SETTINGS_CERTIFY_VERCEL_TEAM_ID',
    'BACKY_SETTINGS_CERTIFY_NOTIFICATION_PROVIDER',
    'RESEND_API_KEY: ${{ secrets.RESEND_API_KEY }}',
    'SMTP_HOST: ${{ vars.SMTP_HOST }}',
    'SMTP_USER: ${{ secrets.SMTP_USER }}',
    'SMTP_PASSWORD: ${{ secrets.SMTP_PASSWORD }}',
    'BACKY_TRANSACTIONAL_EMAIL_WEBHOOK_URL: ${{ secrets.BACKY_TRANSACTIONAL_EMAIL_WEBHOOK_URL }}',
    'BACKY_COMMERCE_PROVIDER_CERTIFICATION_REQUIRED',
    'BACKY_COMMERCE_CERTIFY_PAYMENT_PROVIDER',
    'BACKY_COMMERCE_CERTIFY_TAX_PROVIDER',
    'BACKY_COMMERCE_CERTIFY_SHIPPING_PROVIDER',
    'BACKY_COMMERCE_CERTIFY_CATALOG_PROVIDER',
    'razorpay',
    'magento',
    'BACKY_COMMERCE_CERTIFY_SUBSCRIPTION_PROVIDER',
    'BACKY_COMMERCE_CERTIFY_WEBHOOK_PROVIDER',
    'Run local release preflight contracts',
    'Run non-secret release certification doctor',
    'npm run doctor:release-certification',
    'Write non-secret release certification summary',
    'GITHUB_STEP_SUMMARY',
    'settings_external=false',
    'commerce_external=false',
    'expected host configured:',
    'external target configured:',
    'storage_provider',
    'webhook_provider',
    'npm run test:release-certification-preflight-contract',
    'npm run test:forms-postgres-preflight-contract',
    'npm run test:sdk-postgres-preflight-contract',
    'npm run test:settings-provider-certification-preflight-contract',
    'npm run test:commerce-provider-certification-preflight-contract',
    'Require disposable Postgres or Supabase database URL',
    'inputs.disposable_database_confirmed',
    'Set disposable_database_confirmed=true before running release database certification',
    'npm run ci:forms-postgres',
    'npm run ci:sdk-postgres-smoke',
    'npm run ci:settings-provider-certification',
    'npm run ci:commerce-provider-certification',
  ],
  'Backy release certification workflow',
);

assert(
  /subscription_provider:[\s\S]*?options:[\s\S]*?- razorpay[\s\S]*?webhook_provider:/m.test(workflow),
  'Backy release certification workflow must expose razorpay as a subscription_provider option.',
);

assertChoiceOptions(workflow, 'storage_provider', ['auto', 'local', 's3', 'supabase']);
assertChoiceOptions(workflow, 'notification_provider', ['auto', 'webhook', 'http-endpoint', 'resend', 'smtp', 'local-outbox']);
assertChoiceOptions(workflow, 'payment_provider', ['auto', 'stripe', 'paypal', 'paddle', 'square', 'adyen', 'mollie', 'razorpay']);
assertChoiceOptions(workflow, 'tax_provider', ['auto', 'stripe', 'taxjar', 'avalara', 'http']);
assertChoiceOptions(workflow, 'shipping_provider', ['auto', 'easypost', 'shippo', 'http']);
assertChoiceOptions(workflow, 'catalog_provider', ['auto', 'shopify', 'bigcommerce', 'woocommerce', 'etsy', 'magento', 'http']);
assertChoiceOptions(workflow, 'subscription_provider', ['auto', 'stripe', 'paypal', 'paddle', 'square', 'adyen', 'mollie', 'razorpay', 'http']);
assertChoiceOptions(workflow, 'webhook_provider', ['auto', 'stripe', 'paypal', 'paddle', 'square', 'adyen', 'mollie', 'generic']);

assert(
    workflow.indexOf('- name: Run local release preflight contracts') < workflow.indexOf('- name: Run Forms Postgres certification') &&
    workflow.indexOf('- name: Run local release preflight contracts') < workflow.indexOf('- name: Run non-secret release certification doctor') &&
    workflow.indexOf('- name: Run non-secret release certification doctor') < workflow.indexOf('- name: Write non-secret release certification summary') &&
    workflow.indexOf('- name: Run local release preflight contracts') < workflow.indexOf('- name: Write non-secret release certification summary') &&
    workflow.indexOf('- name: Write non-secret release certification summary') < workflow.indexOf('- name: Require disposable Postgres or Supabase database URL') &&
    workflow.indexOf('- name: Require disposable Postgres or Supabase database URL') < workflow.indexOf('- name: Run Forms Postgres certification') &&
    workflow.indexOf('inputs.disposable_database_confirmed') < workflow.indexOf('- name: Run Forms Postgres certification') &&
    workflow.indexOf('- name: Run Forms Postgres certification') < workflow.indexOf('- name: Run SDK Postgres certification') &&
    workflow.indexOf('- name: Run SDK Postgres certification') < workflow.indexOf('- name: Run Settings provider certification') &&
    workflow.indexOf('- name: Run Settings provider certification') < workflow.indexOf('- name: Run Commerce provider certification'),
  'Backy release certification workflow must run preflights, require the database URL before database gates, then run provider gates in order.',
);

includesAll(
  doctor,
  [
    'backy.release-certification-doctor.v1',
    'BACKY_RELEASE_CERTIFICATION_DOCTOR_REQUIRED',
    'BACKY_DATABASE_URL',
    'BACKY_DATABASE_CERTIFICATION_EXPECTED_HOST',
    'BACKY_SETTINGS_PROVIDER_CERTIFICATION_REQUIRED',
    'BACKY_SETTINGS_CERTIFICATION_BASE_URL',
    'BACKY_SETTINGS_CERTIFY_STORAGE_PROVIDER',
    'BACKY_COMMERCE_PROVIDER_CERTIFICATION_REQUIRED',
    'BACKY_COMMERCE_CERTIFICATION_BASE_URL',
    'BACKY_COMMERCE_CERTIFY_PAYMENT_PROVIDER',
    'BACKY_COMMERCE_CERTIFY_TAX_PROVIDER',
    'BACKY_COMMERCE_CERTIFY_SHIPPING_PROVIDER',
    'BACKY_COMMERCE_CERTIFY_CATALOG_PROVIDER',
    'BACKY_RAZORPAY_KEY_ID',
    'BACKY_MAGENTO_ACCESS_TOKEN',
    'BACKY_COMMERCE_CERTIFY_SUBSCRIPTION_PROVIDER',
    'BACKY_COMMERCE_CERTIFY_WEBHOOK_PROVIDER',
    'commerce provider group selection',
    'missing',
    'failures',
  ],
  'Backy release certification doctor',
);

includesAll(
  doctorContract,
  [
    'backy.release-certification-doctor-contract.v1',
    'BACKY_RELEASE_CERTIFICATION_DOCTOR_REQUIRED',
    'BACKY_RELEASE_CERTIFY_DATABASE',
    'database URL',
    'BACKY_SETTINGS_CERTIFY_STORAGE_PROVIDER',
    'S3 storage credentials',
    'Supabase storage credentials',
    'BACKY_SETTINGS_CERTIFY_NOTIFICATION_PROVIDER',
    'Resend notification credentials',
    'RESEND_API_KEY',
    'SMTP notification credentials',
    'SMTP_HOST',
    'HTTP notification endpoint',
    'BACKY_TRANSACTIONAL_EMAIL_WEBHOOK_URL',
    'BACKY_SETTINGS_CERTIFY_VERCEL_SECRETS',
    'Vercel token',
    'Vercel project',
    'BACKY_COMMERCE_PROVIDER_CERTIFICATION_REQUIRED',
    'commerce provider group selection',
    'auto payment credentials',
    'auto tax credentials',
    'auto catalog credentials',
    'BACKY_COMMERCE_CERTIFY_PAYMENT_PROVIDER',
    'Razorpay payment/subscription credentials',
    'Stripe payment/refund credentials',
    'PayPal payment/subscription credentials',
    'Paddle payment/subscription credentials',
    'Square payment/subscription credentials',
    'Adyen credentials',
    'Mollie payment/subscription credentials',
    'BACKY_COMMERCE_CERTIFY_TAX_PROVIDER',
    'TaxJar credentials',
    'Avalara credentials',
    'BACKY_COMMERCE_CERTIFY_SHIPPING_PROVIDER',
    'EasyPost credentials',
    'Shippo credentials',
    'BACKY_COMMERCE_CERTIFY_CATALOG_PROVIDER',
    'Shopify catalog credentials',
    'BigCommerce catalog credentials',
    'WooCommerce catalog credentials',
    'Etsy catalog credentials',
    'Magento catalog credentials',
    'BACKY_COMMERCE_CERTIFY_WEBHOOK_PROVIDER',
    'Commerce webhook secret',
  ],
  'Backy release certification doctor behavior contract',
);

includesAll(
  rootPackage,
  [
    '"test:release-certification-preflight-contract"',
    '"test:release-certification-doctor-contract"',
    '"doctor:release-certification"',
    '"test:forms-postgres-preflight-contract"',
    '"test:sdk-postgres-preflight-contract"',
    '"test:settings-provider-certification-preflight-contract"',
    '"test:commerce-provider-certification-preflight-contract"',
    '"ci:forms-postgres"',
    '"ci:sdk-postgres-smoke"',
    '"ci:settings-provider-certification"',
    '"ci:commerce-provider-certification"',
  ],
  'Root package release certification script wiring',
);

includesAll(
  setup,
  [
    '## Backy release certification',
    'Backy Release Certification',
    '.github/workflows/backy-release-certification.yml',
    'npm run test:release-certification-preflight-contract',
    'npm run test:release-certification-doctor-contract',
    'npm run doctor:release-certification',
    'certify_database=true',
    'BACKY_DATABASE_URL',
    'DATABASE_URL',
    'disposable migrated Supabase/Postgres database',
    'database_expected_host',
    'database_expected_name',
    'certify_database=false',
    'demo data mode',
    'BACKY_SETTINGS_CERTIFICATION_BASE_URL',
    'BACKY_COMMERCE_CERTIFICATION_BASE_URL',
    'target.mode',
    'externalBaseUrlConfigured',
    'npm run ci:forms-postgres',
    'npm run ci:sdk-postgres-smoke',
    'certify_settings_providers',
    'npm run ci:settings-provider-certification',
    'certify_commerce_providers',
    'npm run ci:commerce-provider-certification',
    'certify_storage',
    'certify_rotation',
    'certify_vercel_secrets',
    'certify_notification',
    'notification_provider',
    'RESEND_API_KEY',
    'SMTP_HOST',
    'BACKY_TRANSACTIONAL_EMAIL_WEBHOOK_URL',
    'payment_provider',
    'tax_provider',
    'shipping_provider',
    'catalog_provider',
    'subscription_provider',
    'BACKY_SUPABASE_SERVICE_ROLE_KEY',
    'BACKY_S3_SECRET_ACCESS_KEY',
    'VERCEL_TOKEN',
    'BACKY_RESEND_API_KEY',
    'RESEND_API_KEY',
    'BACKY_SMTP_HOST',
    'SMTP_HOST',
    'BACKY_TRANSACTIONAL_EMAIL_WEBHOOK_URL',
    'Stripe, TaxJar, Avalara, EasyPost, Shippo, PayPal, Paddle, Square, Adyen, Mollie, Razorpay, Shopify, BigCommerce, WooCommerce, Etsy, and Magento',
  ],
  'Backy release certification setup documentation',
);

includesAll(
  audit,
  [
    'Backy release certification workflow',
    'test:release-certification-preflight-contract',
    'keeps `BACKY_DATA_MODE` in `demo` unless `certify_database=true`',
    'database_expected_host',
    'database_expected_name',
    'provider-only demo-mode behavior when database certification is skipped',
    'local/external certification-target evidence',
    'Release certification readiness doctor',
    'backy.release-certification-doctor.v1',
    'ci:forms-postgres',
    'ci:sdk-postgres-smoke',
    'ci:settings-provider-certification',
    'ci:commerce-provider-certification',
    '39 Ready / 6 Partial / 0 Prototype / 0 Missing',
  ],
  'Backy release certification audit evidence',
);

console.log(JSON.stringify({
  ok: true,
  contract: 'backy.release-certification-preflight.v1',
}));
