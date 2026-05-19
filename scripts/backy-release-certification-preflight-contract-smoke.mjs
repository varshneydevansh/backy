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
const doctor = read('./backy-release-certification-doctor.mjs');
const doctorContract = read('./backy-release-certification-doctor-contract-smoke.mjs');
const rootPackage = read('../package.json');
const rootPackageJson = JSON.parse(rootPackage);
const setup = read('../SETUP.md');
const audit = read('../specs/page-completion-audit/backy-page-surface-audit.md');
const wixCanvaRoadmap = read('../specs/backy-wix-canva-cms-v1-roadmap.md');
const platformGapAnalysis = read('../specs/backy-platform-gap-analysis-and-ai-frontend-contract.md');
const completionSpec = read('../specs/backy-cms-completion-spec.md');
const fullParityRoadmap = read('../specs/backy-full-parity-roadmap-spec.md');
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
    'BACKY_COMMERCE_TAX_PROVIDER_URL',
    'COMMERCE_TAX_PROVIDER_URL',
    'BACKY_COMMERCE_SHIPPING_PROVIDER_URL',
    'COMMERCE_SHIPPING_PROVIDER_URL',
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
    'Partial row | Gate',
    '/forms | npm run ci:forms-postgres',
    'Frontend manifest/OpenAPI/SDK APIs | npm run ci:sdk-postgres-smoke',
    '/settings and Settings admin APIs | npm run ci:settings-provider-certification',
    '/products and /orders | npm run ci:commerce-provider-certification',
    'settings_external=false',
    'commerce_external=false',
    'settings_admin_key_configured=false',
    'commerce_admin_key_configured=false',
    'expected host configured:',
    'external target configured:',
    'admin key configured:',
    'storage_provider',
    'webhook_provider',
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
    workflow.indexOf('- name: Run Settings provider certification') < workflow.indexOf('- name: Run Commerce provider certification'),
  'Backy release certification workflow must run preflights, require the database URL before database gates, then run provider gates in order.',
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
    'requiredInputFamily',
    'urlValid',
    '/forms',
    'npm run ci:forms-postgres',
    'Frontend manifest/OpenAPI/SDK APIs',
    'npm run ci:sdk-postgres-smoke',
    '/settings and Settings admin APIs',
    'npm run ci:settings-provider-certification',
    '/products and /orders',
    'npm run ci:commerce-provider-certification',
    'BACKY_RELEASE_CERTIFICATION_DOCTOR_REQUIRED',
    'BACKY_DATABASE_URL',
    'database URL format',
    'BACKY_DATABASE_CERTIFICATION_EXPECTED_HOST',
    'BACKY_SETTINGS_PROVIDER_CERTIFICATION_REQUIRED',
    'BACKY_SETTINGS_CERTIFICATION_BASE_URL',
    'Settings external base URL',
    'Settings external admin key',
    'BACKY_SETTINGS_CERTIFICATION_ADMIN_KEY',
    'BACKY_SETTINGS_CERTIFY_STORAGE_PROVIDER',
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
    'BACKY_COMMERCE_CERTIFY_CATALOG_PROVIDER',
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
  doctorContract,
  [
    'backy.release-certification-doctor-contract.v1',
    'Partial-to-gate map',
    'BACKY_RELEASE_CERTIFICATION_DOCTOR_REQUIRED',
    'BACKY_RELEASE_CERTIFY_DATABASE',
    'database URL',
    'database URL format',
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
    'HTTP tax provider URL',
    'HTTP shipping provider URL',
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
    '"test:forms-postgres-preflight-contract"',
    '"test:sdk-postgres-preflight-contract"',
    '"test:sdk-postgres-disposable-guard"',
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

const partialGatePreflights = rootPackageJson.scripts?.['test:partial-gate-preflights'] || '';
includesAll(
  partialGatePreflights,
  [
    'npm run test:forms-postgres-preflight-contract',
    'npm run test:sdk-postgres-preflight-contract',
    'npm run test:sdk-postgres-disposable-guard',
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
    'without connecting to live databases or providers',
    'npm run doctor:release-certification',
    'Current Partial-to-gate map',
    '| Partial row | Gate | Standalone workflow or release input |',
    '| `/forms` | `npm run ci:forms-postgres` |',
    '| Frontend manifest/OpenAPI/SDK APIs | `npm run ci:sdk-postgres-smoke` |',
    '| `/settings` and Settings admin APIs | `npm run ci:settings-provider-certification` |',
    '| `/products` and `/orders` | `npm run ci:commerce-provider-certification` |',
    'certify_database=true',
    'BACKY_DATABASE_URL',
    'DATABASE_URL',
    'disposable migrated Supabase/Postgres database',
    '`BACKY_DATABASE_DISPOSABLE_CONFIRMED=true` to the Forms and SDK database smokes',
    'database_expected_host',
    'database_expected_name',
    'certify_database=false',
    'demo data mode',
    'BACKY_SETTINGS_CERTIFICATION_BASE_URL',
    'BACKY_COMMERCE_CERTIFICATION_BASE_URL',
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
    'RESEND_API_KEY',
    'SMTP_HOST',
    'BACKY_TRANSACTIONAL_EMAIL_WEBHOOK_URL',
    'payment_provider',
    'tax_provider',
    'shipping_provider',
    'catalog_provider',
    'subscription_provider',
    'HTTP endpoint aliases such as `COMMERCE_TAX_PROVIDER_URL`, `COMMERCE_SHIPPING_PROVIDER_URL`, `COMMERCE_PRODUCT_SYNC_URL`, and `COMMERCE_SUBSCRIPTION_ACTION_URL`',
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
    '39 Ready / 6 Partial / 0 Prototype / 0 Missing',
    'Run the configured Supabase/Postgres service-data gates',
    'Certify live Settings and Commerce providers',
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
  ],
  'Backy Wix/Canva roadmap current-state documentation',
);

includesAll(
  platformGapAnalysis,
  [
    'current page-surface audit has moved most primary admin/editor/API surfaces out of prototype status',
    'Admin authentication is backend-backed through `apps/public` auth routes',
    'The page editor save path now writes through the authenticated admin page API',
    'Settings now include backend-backed delivery mode',
    'Run the SDK Postgres smoke against a migrated database',
    'current 39 Ready / 6 Partial / 0 Prototype / 0 Missing audit state',
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
  ],
  'Backy platform gap analysis current-state documentation',
);

includesAll(
  completionSpec,
  [
    'Current audit baseline: **39 Ready / 6 Partial / 0 Prototype / 0 Missing**',
    'API-backed login UI with seeded local-demo accounts',
    'Site/page resolution covers seeded and DB-backed site settings',
    'Run `BACKY_DATABASE_DISPOSABLE_CONFIRMED=true npm run ci:sdk-postgres-smoke` against a migrated disposable Supabase/Postgres database',
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
    '39 Ready / 6 Partial / 0 Prototype / 0 Missing',
    'configured Forms and SDK Supabase/Postgres service-data gates',
    'backend auth/session/RBAC baseline is now implemented',
    'Forms/comments module — **Ready baseline with database-service certification gate**',
    'Core composition / CMS blocks — **Ready baseline with reusable-section regression guards**',
    'Public API hardening — **Ready baseline with SDK/Postgres certification gate**',
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
    '39 Ready / 6 Partial / 0 Prototype / 0 Missing',
    'ready baseline with database/provider certification gates',
    'grouping/ungrouping with Cmd/Ctrl+G',
    'ready baseline with database-service certification gate',
    'run configured Forms and SDK Supabase/Postgres service-data gates',
    'Local editor parity is guarded for rich-text table/list depth',
    'imported list-indent edits',
  ],
  'Backy phase completion current-state documentation',
);

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
    'external-target runs now require an explicit `BACKY_ADMIN_API_KEY` or `BACKY_SETTINGS_CERTIFICATION_ADMIN_KEY`',
    'workflows now forward secret-backed Settings/Commerce certification admin-key aliases instead of generated local keys',
    'Release certification readiness doctor',
    'backy.release-certification-doctor.v1',
    'partialGateMap',
    'current Partial row to local gate, local preflight/guard command, workflow, and input-family map',
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
    '39 Ready / 6 Partial / 0 Prototype / 0 Missing',
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
