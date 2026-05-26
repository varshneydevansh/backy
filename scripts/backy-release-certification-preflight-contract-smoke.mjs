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

const workflow = read('../.github/workflows/backy-release-certification.yml');
const formsPostgresWorkflow = read('../.github/workflows/forms-postgres-contract.yml');
const sdkPostgresWorkflow = read('../.github/workflows/sdk-postgres-smoke.yml');
const settingsProviderWorkflow = read('../.github/workflows/settings-provider-certification.yml');
const commerceProviderWorkflow = read('../.github/workflows/commerce-provider-certification.yml');
const doctor = read('./backy-release-certification-doctor.mjs');
const doctorContract = read('./backy-release-certification-doctor-contract-smoke.mjs');
const rootPackage = read('../package.json');
const rootPackageJson = JSON.parse(rootPackage);
const publicPackage = read('../apps/public/package.json');
const setup = read('../SETUP.md');
const audit = read('../specs/page-completion-audit/backy-page-surface-audit.md');
const wixCanvaRoadmap = read('../specs/backy-wix-canva-cms-v1-roadmap.md');
const platformGapAnalysis = read('../specs/backy-platform-gap-analysis-and-ai-frontend-contract.md');
const aiFrontendContractReadme = read('../specs/ai-frontend-contract/README.md');
const completionSpec = read('../specs/backy-cms-completion-spec.md');
const fullParityRoadmap = read('../specs/backy-full-parity-roadmap-spec.md');
const phaseRoadmapV1 = read('../specs/phase-docs/backy-headless-cms-platform-phase-roadmap-v1.md');
const phaseRoadmapV2 = read('../specs/phase-docs/backy-headless-cms-platform-phase-roadmap-v2.md');
const phaseCompletionSpec = read('../specs/phase-docs/backy-phase-a-j-completion-spec.md');

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
	    'settings_certification_site_id:',
	    'certify_commerce_providers:',
    'commerce_certification_site_id:',
    'certify_storage:',
    'storage_provider:',
    'certify_rotation:',
    'certify_vercel_secrets:',
    'vercel_project_id:',
    'vercel_team_id:',
    'certify_notification:',
    'notification_provider:',
    'certify_public_api_cors:',
    'public_api_origin:',
    'payment_provider:',
    'tax_provider:',
    'shipping_provider:',
    'discount_provider:',
    'catalog_provider:',
    'subscription_provider:',
    'webhook_provider:',
    'BACKY_DATABASE_URL',
    'DATABASE_URL',
    'BACKY_DATABASE_URL or DATABASE_URL',
    'Run Forms and SDK Supabase/Postgres certification with BACKY_DATABASE_URL or DATABASE_URL.',
    'confirms BACKY_DATABASE_URL or DATABASE_URL is disposable and migrated.',
    'BACKY_DATABASE_CERTIFICATION_EXPECTED_HOST',
    'BACKY_DATABASE_CERTIFICATION_EXPECTED_DATABASE',
    "BACKY_DATA_MODE: ${{ inputs.certify_database && 'database' || 'demo' }}",
    "BACKY_RELEASE_CERTIFY_DATABASE: ${{ inputs.certify_database && '1' || '0' }}",
    'BACKY_RELEASE_CERTIFICATION_DOCTOR_REQUIRED',
    'BACKY_ADMIN_API_KEY: ${{ secrets.BACKY_ADMIN_API_KEY }}',
    'BACKY_SETTINGS_CERTIFICATION_ADMIN_KEY: ${{ secrets.BACKY_SETTINGS_CERTIFICATION_ADMIN_KEY }}',
    'BACKY_COMMERCE_CERTIFICATION_ADMIN_KEY: ${{ secrets.BACKY_COMMERCE_CERTIFICATION_ADMIN_KEY }}',
    'BACKY_SETTINGS_PROVIDER_CERTIFICATION_REQUIRED',
    'BACKY_SETTINGS_CERTIFY_STORAGE_PROVIDER',
    'BACKY_MEDIA_STORAGE_PROVIDER',
    'SUPABASE_URL',
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
    'BACKY_SETTINGS_CERTIFY_VERCEL_PROJECT_ID',
    'BACKY_SETTINGS_CERTIFY_VERCEL_TEAM_ID',
    'BACKY_VERCEL_TOKEN',
    'BACKY_VERCEL_PROJECT_ID',
    'BACKY_VERCEL_TEAM_ID',
    'VERCEL_API_BASE_URL',
    'BACKY_SETTINGS_CERTIFY_NOTIFICATION_PROVIDER',
	    'BACKY_SETTINGS_CERTIFY_PUBLIC_API_CORS',
	    'BACKY_SETTINGS_CERTIFY_PUBLIC_API_ORIGIN',
	    'BACKY_SETTINGS_CERTIFY_SITE_ID',
	    'BACKY_CORS_ALLOWED_ORIGINS',
    'BACKY_SETTINGS_CERTIFICATION_OUTPUT',
    'RESEND_API_KEY: ${{ secrets.RESEND_API_KEY }}',
    'SMTP_HOST: ${{ vars.SMTP_HOST }}',
    'SMTP_USER: ${{ secrets.SMTP_USER }}',
    'SMTP_PASSWORD: ${{ secrets.SMTP_PASSWORD }}',
    'BACKY_TRANSACTIONAL_EMAIL_WEBHOOK_URL: ${{ secrets.BACKY_TRANSACTIONAL_EMAIL_WEBHOOK_URL }}',
    'BACKY_COMMERCE_PROVIDER_CERTIFICATION_REQUIRED',
    'BACKY_COMMERCE_CERTIFY_SITE_ID',
    'BACKY_COMMERCE_CERTIFY_PAYMENT_PROVIDER',
    'BACKY_COMMERCE_CERTIFY_TAX_PROVIDER',
    'BACKY_COMMERCE_CERTIFY_SHIPPING_PROVIDER',
    'BACKY_COMMERCE_CERTIFY_DISCOUNT_PROVIDER',
    'BACKY_COMMERCE_CERTIFY_CATALOG_PROVIDER',
    'BACKY_COMMERCE_CERTIFICATION_OUTPUT',
    'BACKY_COMMERCE_TAX_PROVIDER_URL',
    'COMMERCE_TAX_PROVIDER_URL',
    'BACKY_COMMERCE_SHIPPING_PROVIDER_URL',
    'COMMERCE_SHIPPING_PROVIDER_URL',
    'BACKY_COMMERCE_DISCOUNT_PROVIDER_URL',
    'COMMERCE_DISCOUNT_PROVIDER_URL',
    'BACKY_COMMERCE_PRODUCT_SYNC_URL',
    'COMMERCE_PRODUCT_SYNC_URL',
    'BACKY_COMMERCE_SUBSCRIPTION_ACTION_URL',
    'COMMERCE_SUBSCRIPTION_ACTION_URL',
    'razorpay',
    'magento',
    'BACKY_COMMERCE_CERTIFY_SUBSCRIPTION_PROVIDER',
    'BACKY_COMMERCE_CERTIFY_WEBHOOK_PROVIDER',
    'Run local release preflight contracts',
    'npm run test:partial-gate-preflights',
    'Run non-secret release certification doctor',
    'npm run doctor:release-certification',
    'Write non-secret release certification summary',
    'GITHUB_STEP_SUMMARY',
    'Partial row | Gate | Aggregate preflight | Admin source guard',
    '/settings | npm run ci:settings-provider-certification | npm run test:partial-gate-preflights | npm run test:admin-contract-source',
    'Settings admin APIs | npm run ci:settings-provider-certification | npm run test:partial-gate-preflights | npm run test:admin-contract-source',
    '/products | npm run ci:commerce-provider-certification | npm run test:partial-gate-preflights | npm run test:admin-contract-source',
    '/orders | npm run ci:commerce-provider-certification | npm run test:partial-gate-preflights | npm run test:admin-contract-source',
    'Certified regression gate | Gate | Aggregate preflight',
    '/forms | npm run ci:forms-postgres | npm run test:partial-gate-preflights',
    'Frontend manifest/OpenAPI/SDK APIs | npm run ci:sdk-postgres-smoke | npm run test:partial-gate-preflights',
    'settings_external=false',
    'commerce_external=false',
    'settings_admin_key_configured=false',
    'commerce_admin_key_configured=false',
    'expected host configured:',
    'external target configured:',
    'admin key configured:',
    'storage_provider',
	    'certify_public_api_cors',
	    'public_api_origin',
	    'settings_certification_site_id',
	    'webhook_provider',
    'Require disposable Postgres or Supabase database URL',
    'inputs.disposable_database_confirmed',
    'Set disposable_database_confirmed=true before running release database certification',
    'npm run ci:forms-postgres',
    'npm run ci:sdk-postgres-smoke',
    'npm run ci:settings-provider-certification',
    'Upload Settings provider certification evidence',
    'Verify Settings provider certification artifact',
    'BACKY_SETTINGS_CERTIFICATION_ARTIFACT_PATH: artifacts/backy-settings-provider-certification.json',
    "BACKY_SETTINGS_CERTIFICATION_ARTIFACT_REQUIRED: '1'",
    'actions/upload-artifact@v4',
    'backy-settings-provider-certification-evidence',
    'artifacts/backy-settings-provider-certification.json',
    'if-no-files-found: error',
    'npm run ci:commerce-provider-certification',
    'Verify Commerce provider certification artifact',
    'BACKY_COMMERCE_CERTIFICATION_ARTIFACT_PATH: artifacts/backy-commerce-provider-certification.json',
    "BACKY_COMMERCE_CERTIFICATION_ARTIFACT_REQUIRED: '1'",
    'Upload Commerce provider certification evidence',
    'backy-commerce-provider-certification-evidence',
    'artifacts/backy-commerce-provider-certification.json',
  ],
  'Backy release certification workflow',
);

includesAll(
  formsPostgresWorkflow,
  [
    'Certified regression gate | Gate | Requested | Aggregate preflight | Admin source guard | Non-secret target evidence',
    '/forms | npm run ci:forms-postgres | true | npm run test:partial-gate-preflights | npm run test:admin-contract-source |',
  ],
  'Forms Postgres workflow summary',
);

includesAll(
  sdkPostgresWorkflow,
  [
    'Certified regression gate | Gate | Requested | Aggregate preflight | Admin source guard | Non-secret target evidence',
    'Frontend manifest/OpenAPI/SDK APIs | npm run ci:sdk-postgres-smoke | true | npm run test:partial-gate-preflights | npm run test:admin-contract-source |',
  ],
  'SDK Postgres workflow summary',
);

includesAll(
  settingsProviderWorkflow,
  [
    'Partial row | Gate | Requested | Aggregate preflight | Admin source guard | Non-secret target evidence',
    '/settings | npm run ci:settings-provider-certification | true | npm run test:partial-gate-preflights | npm run test:admin-contract-source |',
    'Settings admin APIs | npm run ci:settings-provider-certification | true | npm run test:partial-gate-preflights | npm run test:admin-contract-source |',
    '/products | npm run ci:commerce-provider-certification | ${{ inputs.certify_commerce }} | npm run test:partial-gate-preflights | npm run test:admin-contract-source |',
	    '/orders | npm run ci:commerce-provider-certification | ${{ inputs.certify_commerce }} | npm run test:partial-gate-preflights | npm run test:admin-contract-source |',
	    'certify_public_api_cors',
	    'public_api_origin',
	    'settings_certification_site_id',
	  ],
  'Settings provider workflow summary',
);

includesAll(
  commerceProviderWorkflow,
  [
    'Partial row | Gate | Requested | Aggregate preflight | Admin source guard | Non-secret target evidence',
    '/products | npm run ci:commerce-provider-certification | true | npm run test:partial-gate-preflights | npm run test:admin-contract-source |',
    '/orders | npm run ci:commerce-provider-certification | true | npm run test:partial-gate-preflights | npm run test:admin-contract-source |',
  ],
  'Commerce provider workflow summary',
);

for (const [summaryWorkflow, label] of [
  [formsPostgresWorkflow, 'Forms Postgres workflow summary'],
  [sdkPostgresWorkflow, 'SDK Postgres workflow summary'],
  [settingsProviderWorkflow, 'Settings provider workflow summary'],
  [commerceProviderWorkflow, 'Commerce provider workflow summary'],
]) {
  excludesAll(
    summaryWorkflow,
    ['Partial row | Gate | Requested | Non-secret target evidence'],
    label,
  );
}

assert(
  /subscription_provider:[\s\S]*?options:[\s\S]*?- razorpay[\s\S]*?webhook_provider:/m.test(workflow),
  'Backy release certification workflow must expose razorpay as a subscription_provider option.',
);

assertChoiceOptions(workflow, 'storage_provider', ['auto', 'local', 's3', 'supabase']);
assertChoiceOptions(workflow, 'notification_provider', ['auto', 'webhook', 'http-endpoint', 'resend', 'smtp', 'local-outbox']);
assertChoiceOptions(workflow, 'payment_provider', ['auto', 'stripe', 'paypal', 'paddle', 'square', 'adyen', 'mollie', 'razorpay']);
assertChoiceOptions(workflow, 'tax_provider', ['auto', 'stripe', 'taxjar', 'avalara', 'http']);
assertChoiceOptions(workflow, 'shipping_provider', ['auto', 'easypost', 'shippo', 'http']);
assertChoiceOptions(workflow, 'discount_provider', ['auto', 'stripe', 'http']);
assertChoiceOptions(workflow, 'catalog_provider', ['auto', 'shopify', 'bigcommerce', 'woocommerce', 'etsy', 'magento', 'http']);
assertChoiceOptions(workflow, 'subscription_provider', ['auto', 'stripe', 'paypal', 'paddle', 'square', 'adyen', 'mollie', 'razorpay', 'http']);
assertChoiceOptions(workflow, 'webhook_provider', ['auto', 'stripe', 'paypal', 'paddle', 'square', 'adyen', 'mollie', 'razorpay', 'generic']);

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
    workflow.indexOf('- name: Run Settings provider certification') < workflow.indexOf('- name: Verify Settings provider certification artifact') &&
    workflow.indexOf('- name: Verify Settings provider certification artifact') < workflow.indexOf('- name: Upload Settings provider certification evidence') &&
    workflow.indexOf('- name: Upload Settings provider certification evidence') < workflow.indexOf('- name: Run Commerce provider certification') &&
    workflow.indexOf('- name: Run Commerce provider certification') < workflow.indexOf('- name: Verify Commerce provider certification artifact') &&
    workflow.indexOf('- name: Verify Commerce provider certification artifact') < workflow.indexOf('- name: Upload Commerce provider certification evidence'),
  'Backy release certification workflow must run preflights, require the database URL before database gates, run provider gates, and upload Settings/Commerce evidence.',
);

excludesAll(
  workflow,
  [
    'BACKY_ADMIN_API_KEY: release-cert-${{ github.run_id }}-${{ github.run_attempt }}',
  ],
  'Backy release certification workflow',
);

includesAll(
  doctor,
  [
    'backy.release-certification-doctor.v1',
	    'partialGateMap',
	    'certifiedGates',
	    'certificationArtifacts',
	    'verifyCertificationArtifact',
	    'BACKY_PROVIDER_CERTIFICATION_ARTIFACT_MAX_AGE_HOURS',
	    'BACKY_PROVIDER_CERTIFICATION_ARTIFACT_FUTURE_SKEW_MINUTES',
	    'certifiedAtReady',
	    'artifactFreshReady',
	    'artifactAgeHours',
	    'settingsRequestedGroupEvidenceReady',
	    'commerceRequestedGroupEvidenceReady',
	    'certifiedCommerceGroups',
	    'verifySettingsApiHandoffs',
	    'verifyCommerceApiHandoffs',
	    'collectForbiddenArtifactFields',
		    'settingsApiHandoffReady',
		    'settingsApiHandoffSchemaReady',
		    'settingsApiHandoffSiteTargetReady',
		    'settingsApiHandoffTargetSiteId',
		    'siteSettingsApiHandoffReady',
		    'settingsScenarioEvidenceReady',
		    'settingsEvidencePacketReady',
		    'siteSettingsApiHandoffSurface',
		    'settingsApiHandoffSettingsSiteSelectorEnv',
		    'settingsApiHandoffCommerceSiteSelectorEnv',
		    'BACKY_SETTINGS_CERTIFY_SITE_ID',
		    'BACKY_COMMERCE_CERTIFY_SITE_ID',
		    'RAW_SECRET_VALUE_PATTERN',
		    'URL_WITH_CREDENTIALS_PATTERN',
		    'FORBIDDEN_ARTIFACT_FIELD_NAMES',
	    'noRawSecretValuesReady',
	    'noForbiddenArtifactFieldsReady',
	    'forbiddenArtifactFields',
	    'apiHandoffReady',
	    'publicCommerceApiHandoffReady',
	    'productApiHandoffSchemaReady',
	    'productApiHandoffReady',
	    'productApiHandoffSiteTargetReady',
	    'productApiHandoffTargetSiteId',
	    'orderApiHandoffSchemaReady',
	    'orderApiHandoffReady',
	    'orderApiHandoffSiteTargetReady',
	    'orderApiHandoffTargetSiteId',
	    'commerceApiHandoffSiteSelectorEnv',
	    'BACKY_COMMERCE_CERTIFY_SITE_ID',
	    'BACKY_PROVIDER_CERTIFICATION_ARTIFACTS_REQUIRED',
	    'BACKY_SETTINGS_CERTIFICATION_ARTIFACT_PATH',
	    'BACKY_COMMERCE_CERTIFICATION_ARTIFACT_PATH',
	    'backy.settings-provider-certification-artifact.v1',
	    'backy.commerce-provider-certification-artifact.v1',
	    'sourceOnlyGuard',
    'certified-regression',
    'requiredInputFamily',
    'urlValid',
    'disposableConfirmed',
    'readyForCertification',
    'missingConfirmation',
    '/forms',
    'npm run ci:forms-postgres',
    'Frontend manifest/OpenAPI/SDK APIs',
    'npm run ci:sdk-postgres-smoke',
    '/settings',
    'npm run ci:settings-provider-certification',
    'Settings admin APIs',
    'npm run test:settings-source-only',
    '/products',
    '/orders',
    'npm run ci:commerce-provider-certification',
    'npm run test:commerce-source-only',
    'npm run test:orders-source-only',
	    'BACKY_RELEASE_CERTIFICATION_DOCTOR_REQUIRED',
	    'artifactPathEnv',
	    'artifactRequiredEnv',
	    'artifactSchemaVersion',
	    'BACKY_DATABASE_URL',
    'database URL format',
    'BACKY_DATABASE_DISPOSABLE_CONFIRMED',
    'database disposable confirmation',
    'BACKY_DATABASE_CERTIFICATION_EXPECTED_HOST',
    'BACKY_SETTINGS_PROVIDER_CERTIFICATION_REQUIRED',
    'BACKY_SETTINGS_CERTIFICATION_BASE_URL',
    'Settings external base URL',
    'Settings external admin key',
    'BACKY_SETTINGS_CERTIFICATION_ADMIN_KEY',
    'BACKY_SETTINGS_CERTIFY_STORAGE_PROVIDER',
    'BACKY_SETTINGS_CERTIFY_PUBLIC_API_CORS',
    'BACKY_SETTINGS_CERTIFY_PUBLIC_API_ORIGIN',
    'BACKY_CORS_ALLOWED_ORIGINS',
    'Public API CORS origin',
    'BACKY_MEDIA_STORAGE_PROVIDER',
    'AWS_ACCESS_KEY_ID',
    'SUPABASE_SERVICE_ROLE_KEY',
    'BACKY_COMMERCE_PROVIDER_CERTIFICATION_REQUIRED',
    'BACKY_COMMERCE_CERTIFICATION_BASE_URL',
    'Commerce external base URL',
    'Commerce external admin key',
    'BACKY_COMMERCE_CERTIFICATION_ADMIN_KEY',
    'BACKY_COMMERCE_CERTIFY_PAYMENT_PROVIDER',
    'BACKY_COMMERCE_CERTIFY_TAX_PROVIDER',
    'BACKY_COMMERCE_CERTIFY_SHIPPING_PROVIDER',
    'BACKY_COMMERCE_CERTIFY_DISCOUNT_PROVIDER',
    'BACKY_COMMERCE_CERTIFY_CATALOG_PROVIDER',
    'HTTP discount provider URL',
    'HTTP tax provider URL',
    'HTTP shipping provider URL',
    'HTTP catalog provider URL',
    'HTTP subscription provider URL',
    'BACKY_RAZORPAY_KEY_ID',
    'RAZORPAY_KEY_ID',
    'BACKY_MAGENTO_ACCESS_TOKEN',
    'MAGENTO_ACCESS_TOKEN',
    'COMMERCE_WEBHOOK_SECRET',
    'STRIPE_SECRET_KEY',
    'TAXJAR_API_KEY',
    'AVALARA_ACCOUNT_ID',
    'EASYPOST_API_KEY',
    'SHIPPO_API_KEY',
    'PAYPAL_ACCESS_TOKEN',
    'PADDLE_API_KEY',
    'SQUARE_ACCESS_TOKEN',
    'ADYEN_API_KEY',
    'MOLLIE_API_KEY',
    'SHOPIFY_ADMIN_ACCESS_TOKEN',
    'BIGCOMMERCE_ACCESS_TOKEN',
    'WOOCOMMERCE_CONSUMER_KEY',
    'ETSY_ACCESS_TOKEN',
    'BACKY_COMMERCE_CERTIFY_SUBSCRIPTION_PROVIDER',
    'BACKY_COMMERCE_CERTIFY_WEBHOOK_PROVIDER',
    'settings provider group selection',
    'commerce provider group selection',
    'Settings external admin key',
    'Commerce external admin key',
    'Settings external base URL',
    'Commerce external base URL',
	    'missing',
	    'failures',
  ],
  'Backy release certification doctor',
);

includesAll(
  doctor,
  [
    'process.exitCode = 1',
  ],
  'Backy release certification doctor failure-status handling',
);

excludesAll(
  doctor,
  [
    'process.exit(1)',
  ],
  'Backy release certification doctor failure-status handling',
);

includesAll(
  doctorContract,
  [
    'backy.release-certification-doctor-contract.v1',
    'Partial-to-gate map',
	    'BACKY_RELEASE_CERTIFICATION_DOCTOR_REQUIRED',
	    'BACKY_PROVIDER_CERTIFICATION_ARTIFACTS_REQUIRED',
	    'BACKY_SETTINGS_CERTIFICATION_ARTIFACT_PATH',
	    'BACKY_COMMERCE_CERTIFICATION_ARTIFACT_PATH',
	    'Settings certification artifact',
	    'Commerce certification artifact',
	    'expired settings certification artifact doctor',
	    'expired commerce certification artifact doctor',
	    'missing-result settings certification artifact doctor',
	    'missing-result commerce certification artifact doctor',
	    'artifactFreshReady',
	    'noSecretBoundaryReady',
		    'noRawSecretValuesReady',
		    'settingsApiHandoffReady',
		    'siteSettingsApiHandoffReady',
		    'stale settings certification artifact doctor',
	    'leaked settings certification artifact doctor',
	    'backy.settings-provider-certification-evidence.v1',
	    'apiHandoffReady',
	    'publicCommerceApiHandoffReady',
	    'stale commerce certification artifact doctor',
	    'backy.product-provider-certification-evidence.v1',
	    'backy.order-provider-certification-evidence.v1',
	    'BACKY_RELEASE_CERTIFY_DATABASE',
    'database URL',
    'database URL format',
    'BACKY_DATABASE_DISPOSABLE_CONFIRMED',
    'database disposable confirmation',
    'disposableConfirmed',
    'readyForCertification',
    'missingConfirmation',
    'BACKY_SETTINGS_CERTIFY_STORAGE_PROVIDER',
    'settings provider group selection',
    'Settings external admin key',
    'Settings external base URL',
    'BACKY_SETTINGS_CERTIFICATION_ADMIN_KEY',
    'S3 storage credentials',
    'Supabase storage credentials',
    'runtime storage aliases',
    'BACKY_SETTINGS_CERTIFY_NOTIFICATION_PROVIDER',
    'Resend notification credentials',
    'RESEND_API_KEY',
    'SMTP notification credentials',
    'SMTP_HOST',
    'HTTP notification endpoint',
    'BACKY_TRANSACTIONAL_EMAIL_WEBHOOK_URL',
    'BACKY_SETTINGS_CERTIFY_PUBLIC_API_CORS',
    'BACKY_CORS_ALLOWED_ORIGINS',
    'Public API CORS origin',
    'BACKY_SETTINGS_CERTIFY_VERCEL_SECRETS',
    'Vercel token',
    'Vercel project',
    'BACKY_VERCEL_* aliases',
    'BACKY_COMMERCE_PROVIDER_CERTIFICATION_REQUIRED',
    'commerce provider group selection',
    'Commerce external admin key',
    'Commerce external base URL',
    'BACKY_COMMERCE_CERTIFICATION_ADMIN_KEY',
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
    'BACKY_COMMERCE_CERTIFY_DISCOUNT_PROVIDER',
    'auto discount credentials',
    'Stripe promotion-code discount credentials',
    'HTTP tax provider URL',
    'HTTP shipping provider URL',
    'HTTP discount provider URL',
    'HTTP catalog provider URL',
    'HTTP subscription provider URL',
    'BACKY_COMMERCE_CERTIFY_CATALOG_PROVIDER',
    'Shopify catalog credentials',
    'BigCommerce catalog credentials',
    'WooCommerce catalog credentials',
    'Etsy catalog credentials',
    'Magento catalog credentials',
    'BACKY_COMMERCE_CERTIFY_WEBHOOK_PROVIDER',
    'Commerce webhook secret',
    'assertProviderAliasReady',
    'selected PayPal payment',
    'selected Adyen subscription',
    'selected Avalara tax',
    'selected EasyPost shipping',
    'selected HTTP discount',
    'selected BigCommerce catalog',
    'selected Magento catalog',
    'selected commerce webhook',
  ],
  'Backy release certification doctor behavior contract',
);

includesAll(
  rootPackage,
  [
    '"test:release-certification-preflight-contract"',
    '"test:release-certification-doctor-contract"',
    '"doctor:release-certification"',
    '"test:admin-contract-source"',
    '"test:forms-postgres-preflight-contract"',
    '"test:sdk-postgres-preflight-contract"',
    '"test:sdk-postgres-disposable-guard"',
    '"test:settings-source-only"',
    '"test:commerce-source-only"',
    '"test:orders-source-only"',
    '"test:vercel-release-config"',
    '"test:provider-source-only"',
    '"test:settings-provider-certification-preflight-contract"',
    '"test:commerce-provider-certification-preflight-contract"',
    '"test:partial-gate-preflights"',
    '"ci:forms-postgres"',
    '"ci:sdk-postgres-smoke"',
    '"ci:settings-provider-certification"',
    '"ci:commerce-provider-certification"',
  ],
  'Root package release certification script wiring',
);

includesAll(
  publicPackage,
  [
    '"test:admin-contract-source"',
    'BACKY_ADMIN_CONTRACT_SOURCE_GUARD=1 node scripts/admin-contract-smoke.mjs',
  ],
  'Public package admin contract source script wiring',
);

const partialGatePreflights = rootPackageJson.scripts?.['test:partial-gate-preflights'] || '';
includesAll(
  partialGatePreflights,
  [
    'npm run test:forms-postgres-preflight-contract',
    'npm run test:sdk-postgres-preflight-contract',
    'npm run test:sdk-postgres-disposable-guard',
    'npm run test:admin-contract-source',
    'npm run test:vercel-release-config',
    'npm run test:provider-source-only',
    'npm run test:settings-provider-certification-preflight-contract',
    'npm run test:commerce-provider-certification-preflight-contract',
    'npm run test:release-certification-doctor-contract',
    'npm run test:release-certification-preflight-contract',
  ],
  'Root aggregate Partial gate preflight script',
);
excludesAll(
  partialGatePreflights,
  [
    'npm run ci:forms-postgres',
    'npm run ci:sdk-postgres-smoke',
    'npm run ci:settings-provider-certification',
    'npm run ci:commerce-provider-certification',
  ],
  'Root aggregate Partial gate preflight script',
);

includesAll(
  setup,
  [
    '## Backy release certification',
    'Backy Release Certification',
    '.github/workflows/backy-release-certification.yml',
    'npm run test:partial-gate-preflights',
    'admin contract source guard',
    'Settings/Products/Orders source-only page/API guards',
    'npm run test:settings-source-only',
    'npm run test:commerce-source-only',
    'npm run test:orders-source-only',
    'npm run test:provider-source-only',
    'without connecting to live databases or providers or requiring an MFA-backed admin login',
    'without connecting to live databases or providers',
    'npm run doctor:release-certification',
    'Current Partial-to-gate map',
    '| Partial row | Gate | Aggregate preflight | Admin source guard | Standalone workflow or release input |',
    '| `/settings` | `npm run ci:settings-provider-certification` | `npm run test:partial-gate-preflights` | `npm run test:admin-contract-source` |',
    '| Settings admin APIs | `npm run ci:settings-provider-certification` | `npm run test:partial-gate-preflights` | `npm run test:admin-contract-source` |',
    '| `/products` | `npm run ci:commerce-provider-certification` | `npm run test:partial-gate-preflights` | `npm run test:admin-contract-source` |',
    '| `/orders` | `npm run ci:commerce-provider-certification` | `npm run test:partial-gate-preflights` | `npm run test:admin-contract-source` |',
    'Certified database gates stay in the release regression path',
    '| `/forms` | `npm run ci:forms-postgres` | Forms Postgres Contract workflow against a disposable migrated Supabase/Postgres database |',
    '| Frontend manifest/OpenAPI/SDK APIs | `npm run ci:sdk-postgres-smoke` | SDK Postgres Smoke workflow against the same disposable migrated Supabase/Postgres target |',
    '`partialGateMap` for the four current Partial rows plus `certifiedGates`',
    'certify_database=true',
    'BACKY_DATABASE_URL',
    'DATABASE_URL',
    'disposable migrated Supabase/Postgres database',
    'database URL format and disposable confirmation state',
    '`BACKY_DATABASE_DISPOSABLE_CONFIRMED=true` to the Forms and SDK database smokes',
    'database_expected_host',
    'database_expected_name',
    'certify_database=false',
    'demo data mode',
	    'BACKY_SETTINGS_CERTIFICATION_BASE_URL',
		    'BACKY_SETTINGS_CERTIFICATION_OUTPUT',
		    'BACKY_PROVIDER_CERTIFICATION_ARTIFACTS_REQUIRED',
		    'surfaceRunbooks[].artifactVerifier',
		    'BACKY_SETTINGS_CERTIFICATION_ARTIFACT_PATH',
		    'BACKY_PROVIDER_CERTIFICATION_ARTIFACT_MAX_AGE_HOURS',
		    'BACKY_PROVIDER_CERTIFICATION_ARTIFACT_FUTURE_SKEW_MINUTES',
		    'certifiedAtReady',
		    'artifactFreshReady',
	    'BACKY_COMMERCE_CERTIFICATION_ARTIFACT_PATH',
	    'publicCommerceApiHandoffReady',
	    'apiHandoffs.publicApis',
	    'backy.settings-provider-certification-artifact.v1',
    'backy-settings-provider-certification-evidence',
    'artifacts/backy-settings-provider-certification.json',
    'BACKY_COMMERCE_CERTIFICATION_BASE_URL',
    'BACKY_COMMERCE_CERTIFICATION_OUTPUT',
    'backy.commerce-provider-certification-artifact.v1',
    'backy-commerce-provider-certification-evidence',
    'artifacts/backy-commerce-provider-certification.json',
    'target.mode',
    'externalBaseUrlConfigured',
    'External Settings targets require an explicit `BACKY_ADMIN_API_KEY` or `BACKY_SETTINGS_CERTIFICATION_ADMIN_KEY`',
    'external Commerce targets require `BACKY_ADMIN_API_KEY` or `BACKY_COMMERCE_CERTIFICATION_ADMIN_KEY`',
    'backy.settings-provider-certification-handoff.v1',
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
    'certify_public_api_cors',
    'public_api_origin',
    'commerce_certification_site_id',
    'BACKY_CORS_ALLOWED_ORIGINS',
    'RESEND_API_KEY',
    'SMTP_HOST',
    'BACKY_TRANSACTIONAL_EMAIL_WEBHOOK_URL',
    'payment_provider',
    'tax_provider',
    'shipping_provider',
    'discount_provider',
    'catalog_provider',
    'subscription_provider',
    'HTTP endpoint aliases such as `COMMERCE_TAX_PROVIDER_URL`, `COMMERCE_SHIPPING_PROVIDER_URL`, `COMMERCE_DISCOUNT_PROVIDER_URL`, `COMMERCE_PRODUCT_SYNC_URL`, and `COMMERCE_SUBSCRIPTION_ACTION_URL`',
    'BACKY_SUPABASE_SERVICE_ROLE_KEY',
    'SUPABASE_SERVICE_ROLE_KEY',
    'BACKY_S3_SECRET_ACCESS_KEY',
    'AWS_SECRET_ACCESS_KEY',
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
  setup,
  [
    'Admin auth is backend-backed through `apps/public` auth routes',
    'httpOnly `backy_admin_session` cookie',
    'Supabase Auth is supported',
    'local seeded accounts remain a development/demo fallback',
    'blocked in production unless the local-auth allow flag is set intentionally',
    'server-side RBAC and site/team scoping',
    'npm run test:admin-rbac-coverage --workspace @backy/public',
    'npm run test:admin-site-scope --workspace @backy/public',
    'npm run test:admin-auth --workspace @backy/public',
  ],
  'Backy security status setup documentation',
);

excludesAll(
  setup,
  [
    'mockStore` + mocked login helper',
    'admin login is not yet production-grade',
    'Public endpoints are also mostly scaffolded on top of mock data today',
  ],
  'Backy security status setup documentation',
);

includesAll(
  wixCanvaRoadmap,
  [
    '41 Ready / 4 Partial / 0 Prototype / 0 Missing',
    'Keep the now-certified Forms and SDK Supabase/Postgres service-data gates in release regression paths',
    'Certify live Settings and Commerce providers',
    'Current launch maturity risks',
    'External certification, not local button wiring, is the active blocker',
    'Forms and comments are Ready with database-service certification passed',
    'Public API parity is locally and database-mode guarded',
    'BACKY_DATABASE_DISPOSABLE_CONFIRMED=true npm run ci:sdk-postgres-smoke',
    'grouping/ungrouping',
    'release, database, Settings provider, Commerce provider, and mock-provider certification workflows',
    'live provider certification is still required',
    'mock-provider coverage',
  ],
  'Backy Wix/Canva roadmap current-state documentation',
);

excludesAll(
  wixCanvaRoadmap,
  [
    'Current state is a strong prototype',
    'Persistence is still mostly mock-backed in both admin and public flows',
    'mock store usage remains in main flows',
    'admin pages are mostly UI shells without authoritative backend linkage',
    'admin auth is currently mock-based in routes and is not production-secure yet',
    'Buttons with no action',
    'Save button in editor toolbar',
    'Form subsystem incompleteness',
    'Comment subsystem incompleteness',
    'routes exist but do not persist to DB',
    'delivery/analytics remain incomplete',
  ],
  'Backy Wix/Canva roadmap current-state documentation',
);

includesAll(
  platformGapAnalysis,
  [
    'current page-surface audit has moved most primary admin/editor/API surfaces out of prototype status',
    'Remaining production risks',
    'Admin authentication is backend-backed through `apps/public` auth routes',
    'The page editor save path now writes through the authenticated admin page API',
    'Public/admin contract tests now guard the current response envelopes',
    'Admin/public route boundaries are locally enforced',
    'Settings now include backend-backed delivery mode',
    'Backy now has the main collection, dataset, dynamic route, template, SEO, and live-management loop locally implemented',
    'Current remaining risks by area',
    'Public renderer covers the current element, reusable-section, media, form/comment, commerce, interactive component, and responsive contracts',
    'This area now includes README guidance, JSON schemas, and examples',
    'Keep the configured Forms and SDK Supabase/Postgres gates in release regression paths',
    'current 41 Ready / 4 Partial / 0 Prototype / 0 Missing audit state',
  ],
  'Backy platform gap analysis current-state documentation',
);

excludesAll(
  platformGapAnalysis,
  [
    'The current repo is a strong prototype',
    'Admin persistence still comes from `apps/admin/src/stores/mockStore.ts`',
    'Admin authentication still comes from `apps/admin/src/stores/authStore.ts`, with hardcoded mock users',
    'Replace hardcoded mock users with real sessions',
    'The page editor route saves page content by calling `updatePage` in the mock store',
    'Settings include a delivery-mode/API display surface, but API keys are local mock settings',
    'Auth/storage packages are placeholders or partial abstractions',
    'Mock auth; limited roles',
    'What is incomplete or unsafe for production',
    'Public API responses are not consistently wrapped in the documented',
    'Admin/public route boundaries are not hardened into separate read/write surfaces',
    'Backy currently has pieces of this model but not the complete loop',
    'Current incomplete surfaces by area',
    'Public renderer exists; needs to consume the canonical content contract rather than local types',
    'This pass adds the starter `README.md`',
  ],
  'Backy platform gap analysis current-state documentation',
);

includesAll(
  aiFrontendContractReadme,
  [
    'content-payload.schema.json',
    'Database-backed repository mode and local contract smokes are implemented for the current public surface',
    'BACKY_DATABASE_DISPOSABLE_CONFIRMED=true npm run ci:sdk-postgres-smoke',
    'moving the SDK/database-mode contract to Ready',
  ],
  'Backy AI frontend contract README current-state documentation',
);

excludesAll(
  aiFrontendContractReadme,
  [
    'This is not yet the final durable database-backed service',
    'while Backy replaces seeded/mock persistence',
  ],
  'Backy AI frontend contract README current-state documentation',
);

includesAll(
  completionSpec,
  [
    'Current audit baseline: **41 Ready / 4 Partial / 0 Prototype / 0 Missing**',
    'API-backed login UI with seeded local-demo accounts',
    'Site/page resolution covers seeded and DB-backed site settings',
    'Configured Forms and SDK Supabase/Postgres service-data smokes passed against a migrated disposable Postgres target on 2026-05-21',
    'Current local editor parity is guarded by focused smoke paths',
    'Current media coverage includes centralized upload/listing',
  ],
  'Backy completion spec current-state documentation',
);

excludesAll(
  completionSpec,
  [
    'No session-backed authentication middleware for protected routes',
    'dynamic route exists but uses TODO stubs',
    'returns placeholder data',
    'placeholder response',
    'API routes currently return demo/static payloads',
    'Admin routes not consistently gated by authentication/authorization',
    'Missing persistent storage integration in editor actions',
    'No real media upload/storage abstraction',
    'No finalized auth stack choice',
    'Multi-select (shift-click + drag select).',
  ],
  'Backy completion spec current-state documentation',
);

includesAll(
  fullParityRoadmap,
  [
    '41 Ready / 4 Partial / 0 Prototype / 0 Missing',
    'Forms and SDK Supabase/Postgres service-data gates were certified against a migrated disposable Postgres target on 2026-05-21',
    'backend auth/session/RBAC baseline is now implemented',
    'Forms/comments module — **Ready**',
    'Core composition / CMS blocks — **Ready baseline with reusable-section regression guards**',
    'Public API hardening — **Ready**',
    'BACKY_DATABASE_DISPOSABLE_CONFIRMED=true npm run ci:forms-postgres',
    'BACKY_DATABASE_DISPOSABLE_CONFIRMED=true npm run ci:sdk-postgres-smoke',
    'copy/cut/paste/duplicate/delete/grouping',
    'imported list-indent normalization',
    'long-session stress',
    'Mutation-critical paths in admin/public use backend-backed sources of truth',
  ],
  'Backy full parity roadmap current-state documentation',
);

excludesAll(
  fullParityRoadmap,
  [
    'DB persistence is still partially mocked/in-memory in many admin and public read paths',
    'Auth/session and RBAC enforcement still not consistently applied across admin routes',
    'Undo/redo stack is not consistently wired for all operations',
    'Copy/duplicate/delete actions are not yet completed as a cohesive, history-aware action set',
    'Save/publish/reload flow still needs deterministic persistence/rollback semantics',
    'No mutation-critical paths in admin/public depend on mock data as source-of-truth',
    'Forms/comments module — **Partially complete**',
    'Core composition / CMS blocks — **Partial foundation**',
    'Public API hardening — **Partial**',
    'Moderation queue workflow still needs production-grade batch ergonomics',
    'Reusable CMS sections/templates (header/footer/nav/article templates/blog content blocks) are incomplete',
    'Fully normalized public envelopes (`error/data/pagination`) across all endpoints',
  ],
  'Backy full parity roadmap current-state documentation',
);

includesAll(
  phaseCompletionSpec,
  [
    '41 Ready / 4 Partial / 0 Prototype / 0 Missing',
    'ready baseline with database/provider certification gates',
    'grouping/ungrouping with Cmd/Ctrl+G',
    'the configured Forms Supabase/Postgres service-data smoke passed on 2026-05-21',
    'Phase D — Core CMS composition primitives',
    'ready baseline with reusable-section regression guards',
    'Phase E — Public API-first hardening',
    'the public manifest/OpenAPI/SDK database-mode gate moved to Ready after passing on 2026-05-21',
    'Phase F — Versioning and publish workflow',
    'ready baseline with provider/database certification gates',
    'Phase G — Media and SEO foundation',
    'ready baseline with provider/deployment certification gates',
    'Phase H — Analytics, audit, and governance',
    'ready baseline with external telemetry/provider hardening',
    'Phase I — External frontend enablement',
    'AI frontend contract schemas/examples',
    'Phase J — Extensibility and operations',
    'ready baseline with live-provider operations gates',
    'keep the Forms/SDK Supabase/Postgres certification smokes in release regression paths',
    'Local editor parity is guarded for rich-text table/list depth',
    'imported list-indent edits',
  ],
  'Backy phase completion current-state documentation',
);

for (const [label, source] of [
  ['Backy phase roadmap v1 historical banner', phaseRoadmapV1],
  ['Backy phase roadmap v2 historical banner', phaseRoadmapV2],
]) {
  includesAll(
    source,
    [
      'Historical snapshot:',
      'superseded by `backy-phase-a-j-completion-spec.md`',
      'page-completion-audit/backy-page-surface-audit.md',
      '41 Ready / 4 Partial / 0 Prototype / 0 Missing',
      'remaining Partial work is live Settings/Commerce provider certification after Forms/SDK Supabase/Postgres certification passed on 2026-05-21',
    ],
    label,
  );
}

excludesAll(
  phaseCompletionSpec,
  [
    'done: core type contracts, comment anti-abuse policy, auth bridge, `canEdit`-gated moderation actions, owner role in session selector',
    'in-progress: DB-backed writes, server-side RBAC/session middleware',
    'done: selection, undo/redo surface, copy/duplicate/delete plumbing, save/reload hooks',
    'multi-select command stack and grouped-action semantics are deferred',
    'in-progress: queue ergonomics at very large scope',
    'Final in this phase: finalize remaining Phase C anti-abuse and bulk queue operator ergonomics',
    'Continue Phase A blocker completion for secure multi-user admin operation',
    'apps/admin/src/stores/authStore.ts` and `apps/admin/src/routes/__root.tsx` for session/role hardening',
    'section/container/nav/header/footer/blog/content templates, preset libraries, reusable theme-aware block systems',
    'consistent envelope standards across all public endpoints, canonical resolver behavior, stricter pagination/query error contracts',
    'revision history, rollback, conflict detection, scheduled publish, archive lifecycle',
    'upload pipeline, MIME validation, transformations, SEO metadata + canonical/head output reliability',
    'immutable audit model, retention policies, compliance exports, operational dashboards',
    'full contract docs, frontend bootstrap examples, typed SDK surface, webhook/extensibility docs',
    'plugin hooks, processor hooks, deployment/runbook automation',
  ],
  'Backy phase completion current-state documentation',
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
    'aggregate preflight/admin source guard coverage',
    'external-target runs now require an explicit `BACKY_ADMIN_API_KEY` or `BACKY_SETTINGS_CERTIFICATION_ADMIN_KEY`',
    'workflows now forward secret-backed Settings/Commerce certification admin-key aliases instead of generated local keys',
    'Release certification readiness doctor',
    'backy.release-certification-doctor.v1',
    'partialGateMap',
    'certifiedGates',
	    'current four Partial rows (`/settings`, Settings admin APIs, `/products`, and `/orders`)',
	    'source-only guard, aggregate preflight, admin source guard, workflow, input-family map, and artifact verification env/schema',
	    'already-certified `/forms` and Frontend manifest/OpenAPI/SDK database gates',
	    'BACKY_PROVIDER_CERTIFICATION_ARTIFACTS_REQUIRED=1',
	    'BACKY_SETTINGS_CERTIFICATION_ARTIFACT_PATH',
	    'BACKY_COMMERCE_CERTIFICATION_ARTIFACT_PATH',
		    'valid/missing/invalid artifact verification',
		    'stale Settings artifact verification',
		    'raw secret-like value failures',
		    'stale Commerce artifact verification',
		    'external admin failures',
    'ci:forms-postgres',
    'ci:sdk-postgres-smoke',
    'ci:settings-provider-certification',
    'ci:commerce-provider-certification',
    'Settings storage alias certification update',
    'runtime-compatible storage aliases',
    'Settings Vercel alias certification update',
    'Settings release schema handoff guard',
    'backy.settings-provider-certification-handoff.v1',
    'Aggregate provider source-only guard update',
    'npm run test:provider-source-only',
    'npm run test:settings-source-only',
    'npm run test:commerce-source-only',
    'npm run test:orders-source-only',
    '41 Ready / 4 Partial / 0 Prototype / 0 Missing',
  ],
  'Backy release certification audit evidence',
);

excludesAll(
  audit,
  [
    'current Partial row to local gate/workflow/input-family map',
  ],
  'Backy release certification audit evidence',
);

console.log(JSON.stringify({
  ok: true,
  contract: 'backy.release-certification-preflight.v1',
}));
