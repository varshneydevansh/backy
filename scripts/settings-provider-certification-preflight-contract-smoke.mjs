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

const excludesAll = (source, snippets, label) => {
  const present = snippets.filter((snippet) => source.includes(snippet));
  assert(present.length === 0, `${label} still contains stale snippets: ${present.join(', ')}`);
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

const ci = read('./settings-provider-certification-ci.mjs');
const workflow = read('../.github/workflows/settings-provider-certification.yml');
const rootPackage = read('../package.json');
const publicPackage = read('../apps/public/package.json');
const settingsRoute = read('../apps/public/src/app/api/admin/settings/route.ts');
const settingsUi = read('../apps/admin/src/routes/settings.tsx');
const settingsSmoke = read('../apps/admin/scripts/settings-smoke.mjs');
const settingsContract = read('../apps/public/scripts/settings-admin-contract-smoke.mjs');
const apiContracts = read('../specs/backy-api-contracts.md');
const audit = read('../specs/page-completion-audit/backy-page-surface-audit.md');

includesAll(
  ci,
  [
    'BACKY_SETTINGS_PROVIDER_CERTIFICATION_REQUIRED',
    'BACKY_SETTINGS_CERTIFICATION_BASE_URL',
    'providedAdminKey',
    'must be an http:// or https:// URL when Settings provider certification targets an external deployment',
    'with BACKY_SETTINGS_CERTIFICATION_BASE_URL requires BACKY_ADMIN_API_KEY or BACKY_SETTINGS_CERTIFICATION_ADMIN_KEY',
    'BACKY_SETTINGS_CERTIFY_STORAGE',
    'BACKY_SETTINGS_CERTIFY_STORAGE_PROVIDER',
    'BACKY_STORAGE_PROVIDER or BACKY_MEDIA_STORAGE_PROVIDER',
    'BACKY_SETTINGS_CERTIFY_ROTATION',
    'BACKY_SETTINGS_CERTIFY_VERCEL_SECRETS',
    'BACKY_SETTINGS_CERTIFY_VERCEL_PROJECT_ID',
    'BACKY_SETTINGS_CERTIFY_VERCEL_TEAM_ID',
    'BACKY_SETTINGS_CERTIFY_NOTIFICATION',
    'BACKY_SETTINGS_CERTIFY_NOTIFICATION_PROVIDER',
    'requires at least one Settings certification group',
    'validate-infrastructure',
    'media-storage-provisioning-probe',
    'media-storage-credential-rotation-probe',
    'media-storage-secret-manager',
    'test-notification-webhook',
    'requiredDiagnosticAreas',
    'requestedDiagnosticAreas',
    'requestedStorageProvider',
    'selectedStorageCertificationProvider',
    'shouldRequireDiagnosticCheck',
    'inferStorageCertificationProvider',
    'assertStorageProviderMatches',
    'requestedVercelProjectId',
    'requestedVercelTeamId',
    'assertVercelTargetMatches',
    'inferNotificationCertificationProvider',
    'assertNotificationRuntimeReady',
    'runtime.emailProvider === provider',
    'runtime.productionReady === true',
    'assertDiagnosticAreasPresent',
    'Settings provider certification diagnostics are missing areas',
    'assertRequiredDiagnosticsReady',
    'requestedAreas.has(group.area)',
    'const delivery = notification.delivery',
    'Notification webhook certification response is missing delivery',
    'backy.settings-provider-certification.v1',
    'target:',
    "mode: externalBaseUrl ? 'external' : 'local'",
    'externalBaseUrlConfigured: Boolean(externalBaseUrl)',
  ],
  'Settings provider certification CI harness',
);

includesAll(
  workflow,
  [
    'name: Settings Provider Certification',
    'workflow_dispatch:',
    'certify_storage:',
    'storage_provider:',
    'certify_rotation:',
    'certify_vercel_secrets:',
    'vercel_project_id:',
    'vercel_team_id:',
    'certify_notification:',
    'notification_provider:',
    'certify_commerce:',
    'payment_provider:',
    'tax_provider:',
    'shipping_provider:',
    'catalog_provider:',
    'subscription_provider:',
    'webhook_provider:',
    'BACKY_SETTINGS_PROVIDER_CERTIFICATION_REQUIRED: \'1\'',
    'BACKY_RELEASE_CERTIFICATION_DOCTOR_REQUIRED: \'1\'',
    "BACKY_SETTINGS_CERTIFY_STORAGE: ${{ inputs.certify_storage && '1' || '0' }}",
    'BACKY_SETTINGS_CERTIFY_STORAGE_PROVIDER',
    "BACKY_SETTINGS_CERTIFY_ROTATION: ${{ inputs.certify_rotation && '1' || '0' }}",
    "BACKY_SETTINGS_CERTIFY_VERCEL_SECRETS: ${{ inputs.certify_vercel_secrets && '1' || '0' }}",
    'BACKY_SETTINGS_CERTIFY_VERCEL_PROJECT_ID',
    'BACKY_SETTINGS_CERTIFY_VERCEL_TEAM_ID',
    "BACKY_SETTINGS_CERTIFY_NOTIFICATION: ${{ inputs.certify_notification && '1' || '0' }}",
    'BACKY_SETTINGS_CERTIFY_NOTIFICATION_PROVIDER',
    'BACKY_SETTINGS_CERTIFICATION_BASE_URL',
    'BACKY_ADMIN_API_KEY: ${{ secrets.BACKY_ADMIN_API_KEY }}',
    'BACKY_SETTINGS_CERTIFICATION_ADMIN_KEY: ${{ secrets.BACKY_SETTINGS_CERTIFICATION_ADMIN_KEY }}',
    'BACKY_COMMERCE_CERTIFICATION_ADMIN_KEY: ${{ secrets.BACKY_COMMERCE_CERTIFICATION_ADMIN_KEY }}',
    'BACKY_DATABASE_URL',
    'DATABASE_URL',
    'BACKY_MEDIA_STORAGE_PROVIDER',
    'SUPABASE_URL',
    'SUPABASE_ANON_KEY',
    'SUPABASE_SERVICE_ROLE_KEY',
    'AWS_ACCESS_KEY_ID',
    'AWS_SECRET_ACCESS_KEY',
    'AWS_REGION',
    'BACKY_STORAGE_ENDPOINT',
    'BACKY_MEDIA_PUBLIC_URL',
    'AWS_NEXT_ACCESS_KEY_ID',
    'AWS_NEXT_SECRET_ACCESS_KEY',
    'BACKY_NEXT_STORAGE_BUCKET',
    'AWS_NEXT_REGION',
    'BACKY_NEXT_STORAGE_ENDPOINT',
    'BACKY_NEXT_MEDIA_PUBLIC_URL',
    'BACKY_VERCEL_TOKEN',
    'BACKY_VERCEL_PROJECT_ID',
    'BACKY_VERCEL_TEAM_ID',
    'VERCEL_API_BASE_URL',
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
    'BACKY_MAGENTO_ACCESS_TOKEN',
    'MAGENTO_ACCESS_TOKEN',
    'BACKY_RAZORPAY_KEY_ID',
    'RAZORPAY_KEY_ID',
    'BACKY_PAYPAL_ACCESS_TOKEN',
    'PAYPAL_ACCESS_TOKEN',
    'BACKY_PADDLE_API_KEY',
    'PADDLE_API_KEY',
    'BACKY_SQUARE_ACCESS_TOKEN',
    'SQUARE_ACCESS_TOKEN',
    'BACKY_ADYEN_API_KEY',
    'ADYEN_API_KEY',
    'BACKY_ADYEN_MERCHANT_ACCOUNT',
    'ADYEN_MERCHANT_ACCOUNT',
    'BACKY_MOLLIE_API_KEY',
    'MOLLIE_API_KEY',
    'BACKY_COMMERCE_WEBHOOK_SECRET',
    'COMMERCE_WEBHOOK_SECRET',
    'BACKY_COMMERCE_TAX_PROVIDER_URL',
    'COMMERCE_TAX_PROVIDER_URL',
    'BACKY_COMMERCE_SHIPPING_PROVIDER_URL',
    'COMMERCE_SHIPPING_PROVIDER_URL',
    'BACKY_COMMERCE_PRODUCT_SYNC_URL',
    'COMMERCE_PRODUCT_SYNC_URL',
    'BACKY_COMMERCE_SUBSCRIPTION_ACTION_URL',
    'COMMERCE_SUBSCRIPTION_ACTION_URL',
    'BACKY_STRIPE_API_BASE_URL',
    'BACKY_SHOPIFY_ADMIN_API_BASE_URL',
    'BACKY_BIGCOMMERCE_API_BASE_URL',
    'BACKY_WOOCOMMERCE_API_BASE_URL',
    'BACKY_ETSY_API_BASE_URL',
    'razorpay',
    'magento',
    'BACKY_COMMERCE_CERTIFY_SUBSCRIPTION_PROVIDER',
    'BACKY_COMMERCE_CERTIFY_WEBHOOK_PROVIDER',
    'BACKY_COMMERCE_CERTIFICATION_BASE_URL',
    'Run Settings provider certification preflight',
    'Run non-secret certification doctor',
    'npm run doctor:release-certification',
    'Write non-secret Settings certification summary',
    'GITHUB_STEP_SUMMARY',
    '| Partial row | Gate | Requested | Non-secret target evidence |',
    '| /settings and Settings admin APIs | npm run ci:settings-provider-certification | true |',
    '| /products and /orders | npm run ci:commerce-provider-certification |',
    'settings_external=false',
    'commerce_external=false',
    'settings_admin_key_configured=false',
    'commerce_admin_key_configured=false',
    'external target configured:',
    'admin key configured:',
    'storage_provider',
    'webhook_provider',
    'Run Settings provider certification',
    'npm run ci:settings-provider-certification',
    'Run Commerce provider certification from Settings provider gate',
    'npm run ci:commerce-provider-certification',
  ],
  'Settings provider certification workflow',
);

assert(
  /subscription_provider:[\s\S]*?options:[\s\S]*?- razorpay[\s\S]*?webhook_provider:/m.test(workflow),
  'Settings provider certification workflow must expose razorpay as a nested subscription_provider option.',
);

assertChoiceOptions(workflow, 'storage_provider', ['auto', 'local', 's3', 'supabase']);
assertChoiceOptions(workflow, 'notification_provider', ['auto', 'webhook', 'http-endpoint', 'resend', 'smtp', 'local-outbox']);
assertChoiceOptions(workflow, 'payment_provider', ['auto', 'stripe', 'paypal', 'paddle', 'square', 'adyen', 'mollie', 'razorpay']);
assertChoiceOptions(workflow, 'tax_provider', ['auto', 'stripe', 'taxjar', 'avalara', 'http']);
assertChoiceOptions(workflow, 'shipping_provider', ['auto', 'easypost', 'shippo', 'http']);
assertChoiceOptions(workflow, 'catalog_provider', ['auto', 'shopify', 'bigcommerce', 'woocommerce', 'etsy', 'magento', 'http']);
assertChoiceOptions(workflow, 'subscription_provider', ['auto', 'stripe', 'paypal', 'paddle', 'square', 'adyen', 'mollie', 'razorpay', 'http']);
assertChoiceOptions(workflow, 'webhook_provider', ['auto', 'stripe', 'paypal', 'paddle', 'square', 'adyen', 'mollie', 'razorpay', 'generic']);

assert(
  workflow.indexOf('- name: Run Settings provider certification preflight') < workflow.indexOf('- name: Run Settings provider certification\n') &&
    workflow.indexOf('- name: Run Settings provider certification preflight') < workflow.indexOf('- name: Run non-secret certification doctor') &&
    workflow.indexOf('- name: Run non-secret certification doctor') < workflow.indexOf('- name: Write non-secret Settings certification summary') &&
    workflow.indexOf('- name: Run Settings provider certification preflight') < workflow.indexOf('- name: Write non-secret Settings certification summary') &&
    workflow.indexOf('- name: Write non-secret Settings certification summary') < workflow.indexOf('- name: Run Settings provider certification\n') &&
    workflow.indexOf('- name: Run Settings provider certification\n') < workflow.indexOf('- name: Run Commerce provider certification from Settings provider gate'),
  'Settings provider certification workflow must run preflight before Settings certification and commerce certification last.',
);

includesAll(
  rootPackage,
  [
    '"test:settings-provider-certification-preflight-contract"',
    '"ci:settings-provider-certification"',
    '"ci:commerce-provider-certification"',
  ],
  'Root package Settings provider certification scripts',
);

includesAll(
  publicPackage,
  ['"test:settings-admin-contract"'],
  'Public package Settings contract script',
);

includesAll(
  settingsRoute,
  [
    "body.action === 'validate-infrastructure'",
    "body.action === 'media-storage-provisioning-probe'",
    "body.action === 'media-storage-credential-rotation-probe'",
    "body.action === 'media-storage-secret-manager'",
    "body.action === 'test-notification-webhook'",
    'runStorageContainerAutomation',
    'runStorageOperationChecks',
    'runMediaStorageCredentialRotationProbe',
    'runMediaStorageSecretManager',
    'vercelEnvRequest',
    'settings.media_storage.provisioning_probe',
    'settings.media_storage.credential_rotation_probe',
    'settings.media_storage.secret_manager',
    'settings.notification_webhook.test',
    'BACKY_SUPABASE_SERVICE_ROLE_KEY or SUPABASE_SERVICE_ROLE_KEY',
    'BACKY_S3_SECRET_ACCESS_KEY or AWS_SECRET_ACCESS_KEY',
    'VERCEL_PROJECT_ID or BACKY_VERCEL_PROJECT_ID',
    'BACKY_EMAIL_DELIVERY_ENDPOINT or BACKY_TRANSACTIONAL_EMAIL_WEBHOOK_URL',
    'BACKY_RESEND_API_KEY or RESEND_API_KEY',
    'BACKY_COMMERCE_WEBHOOK_SECRET or COMMERCE_WEBHOOK_SECRET',
    'BACKY_AVALARA_ACCOUNT_ID/AVALARA_ACCOUNT_ID plus license and company code',
  ],
  'Settings provider operation API routes',
);

includesAll(
  settingsUi,
  [
    'runSettingsStorageProvisioningProbe',
    'runSettingsStorageCredentialRotationProbe',
    'runSettingsStorageSecretManager',
    'Run storage probe',
    'Run rotation probe',
    'Plan env sync',
    'Promote env',
    'Revoke next env',
    'Schema',
    'Status',
    'Local preflight',
    'Secret boundary',
    'backy.settings-provider-certification-handoff.v1',
    'external-live-provider-gate',
    'Provider credentials stay in deployment or CI environment variables',
    'BACKY_DATABASE_URL or DATABASE_URL',
    'BACKY_SUPABASE_SERVICE_ROLE_KEY or SUPABASE_SERVICE_ROLE_KEY',
    'BACKY_S3_SECRET_ACCESS_KEY or AWS_SECRET_ACCESS_KEY',
    'VERCEL_PROJECT_ID or BACKY_VERCEL_PROJECT_ID',
    'BACKY_EMAIL_DELIVERY_ENDPOINT or BACKY_TRANSACTIONAL_EMAIL_WEBHOOK_URL',
    'BACKY_RESEND_API_KEY or RESEND_API_KEY',
    'BACKY_COMMERCE_WEBHOOK_SECRET or COMMERCE_WEBHOOK_SECRET',
    'BACKY_AVALARA_ACCOUNT_ID/AVALARA_ACCOUNT_ID plus license and company code',
    'BACKY_DATABASE_URL/DATABASE_URL',
    'BACKY_STORAGE_PROVIDER/BACKY_MEDIA_STORAGE_PROVIDER plus Supabase/S3 runtime aliases',
    'SUPABASE_SERVICE_ROLE_KEY',
    'AWS_ACCESS_KEY_ID',
    'notification aliases including RESEND_API_KEY, SMTP_HOST, SMTP_USER, SMTP_PASSWORD, and BACKY_TRANSACTIONAL_EMAIL_WEBHOOK_URL',
    'RESEND_API_KEY',
    'BACKY_EMAIL_DELIVERY_ENDPOINT',
    'BACKY_TRANSACTIONAL_EMAIL_WEBHOOK_URL',
    'BACKY_SMTP_USER',
    'SMTP_USER',
    'BACKY_SMTP_PASSWORD',
    'SMTP_PASSWORD',
    'VERCEL_TOKEN/BACKY_VERCEL_TOKEN',
    'BACKY_VERCEL_TOKEN',
    'BACKY_VERCEL_PROJECT_ID',
    'STRIPE_SECRET_KEY',
    'TAXJAR_API_KEY',
    'PAYPAL_ACCESS_TOKEN',
    'SHOPIFY_ADMIN_ACCESS_TOKEN',
    'COMMERCE_WEBHOOK_SECRET',
    'COMMERCE_TAX_PROVIDER_URL',
    'COMMERCE_SHIPPING_PROVIDER_URL',
    'COMMERCE_PRODUCT_SYNC_URL',
    'COMMERCE_SUBSCRIPTION_ACTION_URL',
  ],
  'Settings provider operation UI controls',
);

includesAll(
  settingsSmoke,
  [
    'hasStorageProbe',
    'hasRotationProbe',
    'hasSecretManagerPlan',
    'hasSecretManagerPromote',
    'hasSecretManagerRevoke',
    'hasNotificationHttpEndpointEnv',
    'hasNotificationSmtpAuthEnv',
    'hasVercelAliasEnv',
    'hasReleaseCertificationStorageAliases',
    'hasReleaseCertificationNotificationAliases',
    'hasReleaseCertificationCommerceAliases',
    'hasReleaseCertificationCommerceHttpAliases',
    'hasProviderCertificationHandoffSummary',
    'backy.settings-provider-certification-handoff.v1',
    'Provider credentials stay in deployment or CI environment variables',
    'runtimeEvidence',
  ],
  'Settings UI smoke provider operation coverage',
);

includesAll(
  settingsContract,
  [
    'backy.settings-provider-certification-handoff.v1',
    'Admin settings executable provider operation contract',
    'settings.media_storage.provisioning_probe',
    'settings.media_storage.credential_rotation_probe',
    'settings.media_storage.secret_manager',
    'settings.notification_webhook.test',
    'executable provider-operation actions for storage provisioning',
    'providerCertificationRequiredInputs',
    'providerCertification.runtimeEvidence',
    'missingInputAliases',
    'liveProviderGateRequired',
    'Provider secret values are never returned',
    'missing provider certification required input',
    'BACKY_DATABASE_URL or DATABASE_URL',
    'BACKY_STORAGE_PROVIDER or BACKY_MEDIA_STORAGE_PROVIDER',
    'BACKY_STRIPE_SECRET_KEY or STRIPE_SECRET_KEY',
  ],
  'Settings admin contract provider operation coverage',
);

includesAll(
  apiContracts,
  [
    'data.settings.providerCertification',
    'runtimeEvidence',
    'missingInputAliases',
    'backy.settings-provider-certification-handoff.v1',
    'external-live-provider-gate',
    'BACKY_DATABASE_URL`/`DATABASE_URL',
    'BACKY_SUPABASE_SERVICE_ROLE_KEY`/`SUPABASE_SERVICE_ROLE_KEY',
    'BACKY_S3_SECRET_ACCESS_KEY`/`AWS_SECRET_ACCESS_KEY',
    'VERCEL_PROJECT_ID`/`BACKY_VERCEL_PROJECT_ID',
    'BACKY_EMAIL_DELIVERY_ENDPOINT`/`BACKY_TRANSACTIONAL_EMAIL_WEBHOOK_URL',
    'BACKY_RESEND_API_KEY`/`RESEND_API_KEY',
    'BACKY_COMMERCE_WEBHOOK_SECRET`/`COMMERCE_WEBHOOK_SECRET',
  ],
  'Settings admin API provider certification docs',
);

includesAll(
  audit,
  [
    'Settings provider certification workflow',
    'settings-provider-certification-preflight-contract',
    'ci:settings-provider-certification',
    'ci:commerce-provider-certification',
    'include the full provider-readiness area set',
    'Required-check blocking is scoped to the requested provider families',
    'local Settings certification path now also proves `test-notification-webhook` delivery end-to-end',
    'BACKY_SETTINGS_CERTIFY_STORAGE_PROVIDER',
    'Settings database alias UI contract update',
    'Supabase or S3 storage certification cannot accidentally pass against local storage',
    'Vercel target selector update',
    'BACKY_SETTINGS_CERTIFY_VERCEL_PROJECT_ID',
    'Settings Vercel alias certification update',
    'Settings Vercel alias UI contract update',
    'Settings release runbook alias UI contract update',
    'Settings release runbook notification alias update',
    'target.mode',
    'externalBaseUrlConfigured',
    'Settings certification summary update',
    'external-target runs now require an explicit `BACKY_ADMIN_API_KEY` or `BACKY_SETTINGS_CERTIFICATION_ADMIN_KEY`',
    'workflows now forward secret-backed Settings/Commerce certification admin-key aliases instead of generated local keys',
    'Settings nested Commerce certification parity update',
    'full nested Commerce provider env surface',
    'Settings storage alias certification update',
    'runtime-compatible storage aliases',
    'Settings admin API provider-alias handoff guard',
    'Settings UI provider-alias handoff guard',
    'providerCertification.groups[].requiredInputs',
    'schema/status/local-preflight/secret-boundary summary',
    'custom admin clients do not drift behind the credential surface',
    'This closes the previously listed auth/RBAC and site-scoping blocker for the Settings row',
    'Actual Supabase/Vercel/payment-provider connection execution, live billing/provider certification, and external provider-managed webhook certification.',
    'GITHUB_STEP_SUMMARY',
    'Real-provider certification for Supabase, Vercel, storage, notification, and commerce providers.',
  ],
  'Settings provider certification audit evidence',
);

excludesAll(
  workflow,
  [
    'BACKY_ADMIN_API_KEY: settings-provider-cert-${{ github.run_id }}-${{ github.run_attempt }}',
  ],
  'Settings provider certification workflow',
);

excludesAll(
  audit,
  [
    'Broader auth/RBAC rollout outside Settings, workspace/site scoping',
    'deeper workspace/site UI rollout',
  ],
  'Settings provider certification audit evidence',
);

console.log(JSON.stringify({
  ok: true,
  contract: 'backy.settings-provider-certification-preflight.v1',
}));
