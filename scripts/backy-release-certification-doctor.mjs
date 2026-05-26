#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';

const env = process.env;

const value = (name) => (env[name] || '').trim();
const has = (name) => Boolean(value(name));
const hasAny = (names) => names.some(has);
const hasCompleteAlternative = (fields) => fields.every((names) => hasAny(names));
const selected = (name, fallback = 'auto') => value(name).toLowerCase() || fallback;
const requested = (name, fallback = false) => (env[name] === undefined ? fallback : env[name] === '1' || env[name] === 'true');
const isHttpUrl = (name) => /^https?:\/\//i.test(value(name));
const isRecord = (value) => value && typeof value === 'object' && !Array.isArray(value);
const parsePositiveNumber = (name, fallback) => {
  const parsed = Number(value(name));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};
const providerArtifactMaxAgeHours = parsePositiveNumber('BACKY_PROVIDER_CERTIFICATION_ARTIFACT_MAX_AGE_HOURS', 168);
const providerArtifactFutureSkewMinutes = parsePositiveNumber('BACKY_PROVIDER_CERTIFICATION_ARTIFACT_FUTURE_SKEW_MINUTES', 15);
const RAW_SECRET_VALUE_PATTERN = /(BACKY_SECRET_TEST_VALUE_[A-Za-z0-9]+|sk_live_[A-Za-z0-9]+|sk_test_[A-Za-z0-9]+|whsec_[A-Za-z0-9]+|AKIA[0-9A-Z]{16}|-----BEGIN [A-Z ]*PRIVATE KEY-----|xox[baprs]-[A-Za-z0-9-]+)/i;
const URL_WITH_CREDENTIALS_PATTERN = /\b(?:https?|postgres(?:ql)?):\/\/[^/\s:@]+:[^@\s/]+@/i;
const FORBIDDEN_ARTIFACT_FIELD_NAMES = new Set([
  'adminkey',
  'adminapikey',
  'authorization',
  'cookie',
  'setcookie',
  'databaseurl',
  'databaseuri',
  'externalbaseurl',
  'externalurl',
  'targeturl',
  'webhookbody',
  'webhookpayload',
  'rawwebhookbody',
  'rawwebhookpayload',
  'providercredential',
  'providercredentials',
  'credential',
  'credentials',
  'paymentreference',
  'paymentreferences',
  'providerpaymentreference',
  'customerpayload',
  'rawcustomerpayload',
  'orderpayload',
  'raworderpayload',
  'raworder',
  'raworders',
  'privatekey',
  'servicerolekey',
]);
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

const configuredPath = (names) => {
  for (const name of names) {
    if (has(name)) return { env: name, value: value(name) };
  }
  return null;
};

const normalizeArtifactFieldName = (name) => name.replace(/[^a-z0-9]/gi, '').toLowerCase();

const collectForbiddenArtifactFields = (input, pathSegments = []) => {
  if (Array.isArray(input)) {
    return input.flatMap((item, index) => collectForbiddenArtifactFields(item, [...pathSegments, String(index)]));
  }

  if (!isRecord(input)) {
    if (typeof input === 'string' && URL_WITH_CREDENTIALS_PATTERN.test(input)) {
      return [pathSegments.join('.') || '$'];
    }
    return [];
  }

  return Object.entries(input).flatMap(([key, nestedValue]) => {
    const nextPath = [...pathSegments, key];
    const normalizedKey = normalizeArtifactFieldName(key);
    const fieldLeak = FORBIDDEN_ARTIFACT_FIELD_NAMES.has(normalizedKey)
      ? [nextPath.join('.')]
      : [];
    return [
      ...fieldLeak,
      ...collectForbiddenArtifactFields(nestedValue, nextPath),
    ];
  });
};

const verifyCertificationArtifact = ({
  label,
  pathEnvNames,
  requiredEnv,
  expectedContract,
  expectedSchemaVersion,
  extraChecks,
}) => {
  const configured = configuredPath(pathEnvNames);
  const required = requested(requiredEnv, false) || requested('BACKY_PROVIDER_CERTIFICATION_ARTIFACTS_REQUIRED', false);
  const base = {
    label,
    required,
    configured: Boolean(configured),
    pathEnvNames,
    configuredEnv: configured?.env || null,
    fileName: configured ? path.basename(configured.value) : null,
    exists: false,
    parsed: false,
    okReady: false,
    contractReady: false,
    schemaReady: false,
    certifiedAtReady: false,
    artifactFreshReady: false,
    noSecretBoundaryReady: false,
    noRawSecretValuesReady: false,
    ready: false,
    failure: null,
  };

  if (!configured) {
    return {
      ...base,
      failure: required ? `${label} artifact path not configured` : null,
    };
  }

  const artifactPath = path.isAbsolute(configured.value)
    ? configured.value
    : path.resolve(process.cwd(), configured.value);

  if (!fs.existsSync(artifactPath)) {
    return {
      ...base,
      failure: `${label} artifact file not found`,
    };
  }

  let payload;
  try {
    payload = JSON.parse(fs.readFileSync(artifactPath, 'utf8'));
  } catch {
    return {
      ...base,
      exists: true,
      failure: `${label} artifact is not valid JSON`,
    };
  }

  const artifact = isRecord(payload.artifact) ? payload.artifact : {};
  const okReady = payload.ok === true;
  const contractReady = payload.contract === expectedContract;
  const schemaReady = artifact.schemaVersion === expectedSchemaVersion;
  const certifiedAt = typeof payload.certifiedAt === 'string' ? payload.certifiedAt : '';
  const certifiedAtMs = Date.parse(certifiedAt);
  const certifiedAtReady = certifiedAt.length > 0 && Number.isFinite(certifiedAtMs);
  const artifactAgeHours = certifiedAtReady
    ? (Date.now() - certifiedAtMs) / (60 * 60 * 1000)
    : null;
  const artifactFreshReady = certifiedAtReady &&
    artifactAgeHours <= providerArtifactMaxAgeHours &&
    artifactAgeHours >= -(providerArtifactFutureSkewMinutes / 60);
  const secretHandling = typeof artifact.secretHandling === 'string' ? artifact.secretHandling : '';
  const noSecretBoundaryReady = secretHandling.includes('provider credentials') &&
    secretHandling.includes('stay in CI secrets or runtime logs');
  const noRawSecretValuesReady = !RAW_SECRET_VALUE_PATTERN.test(JSON.stringify(payload));
  const forbiddenArtifactFields = collectForbiddenArtifactFields(payload);
  const noForbiddenArtifactFieldsReady = forbiddenArtifactFields.length === 0;
  const extraCheckResult = typeof extraChecks === 'function'
    ? extraChecks(payload)
    : { ready: true, fields: {} };
  const extraReady = extraCheckResult.ready !== false;
  const ready = okReady &&
    contractReady &&
    schemaReady &&
    certifiedAtReady &&
    artifactFreshReady &&
    noSecretBoundaryReady &&
    noRawSecretValuesReady &&
    noForbiddenArtifactFieldsReady &&
    extraReady;

  return {
    ...base,
    exists: true,
    parsed: true,
    okReady,
    contractReady,
    schemaReady,
    certifiedAtReady,
    artifactFreshReady,
    certifiedAt,
    artifactAgeHours: artifactAgeHours === null ? null : Number(artifactAgeHours.toFixed(3)),
    artifactMaxAgeHours: providerArtifactMaxAgeHours,
    artifactFutureSkewMinutes: providerArtifactFutureSkewMinutes,
    noSecretBoundaryReady,
    noRawSecretValuesReady,
    noForbiddenArtifactFieldsReady,
    forbiddenArtifactFields,
    extraReady,
    ...(extraCheckResult.fields || {}),
    ready,
    failure: ready ? null : `${label} artifact schema validation failed`,
  };
};

const verifyCommerceApiHandoffs = (payload) => {
  const requested = isRecord(payload.requested) ? payload.requested : {};
  const readiness = isRecord(payload.readiness) ? payload.readiness : {};
  const certified = Array.isArray(payload.certified) ? payload.certified.filter((item) => typeof item === 'string') : [];
  const runtime = isRecord(payload.runtime) ? payload.runtime : {};
  const diagnostics = isRecord(payload.diagnostics) ? payload.diagnostics : {};
  const requestedCommerceGroups = ['payment', 'tax', 'shipping', 'discount', 'catalog', 'subscriptions', 'webhooks']
    .filter((key) => requested[key] === true);
  const commerceRequestedGroupEvidenceReady = requestedCommerceGroups.length > 0 &&
    requestedCommerceGroups.every((key) => readiness[key] === true && certified.includes(key));
  const commerceRuntimeEvidenceReady = Array.isArray(runtime.missing) &&
    Number.isFinite(Number(diagnostics.commerceGroup)) &&
    Number(diagnostics.commerceGroup) > 0;
  const handoffs = isRecord(payload.apiHandoffs) ? payload.apiHandoffs : {};
  const publicApis = isRecord(handoffs.publicApis) ? handoffs.publicApis : {};
  const product = isRecord(handoffs.product) ? handoffs.product : {};
  const orders = isRecord(handoffs.orders) ? handoffs.orders : {};
  const apiHandoffSiteId = typeof handoffs.siteId === 'string' && handoffs.siteId.trim()
    ? handoffs.siteId.trim()
    : null;
  const publicCommerceApiHandoffReady = publicApis.status === 'certified' &&
    publicApis.manifestProviderSchema === 'backy.commerce-provider-certification-handoff.v1' &&
    publicApis.runtimeProviderSchema === 'backy.commerce-provider-certification-handoff.v1' &&
    publicApis.catalogSchema === 'backy.commerce-catalog.v1' &&
    publicApis.catalogProviderSchema === 'backy.commerce-provider-certification-handoff.v1' &&
    publicApis.orderContractSchema === 'backy.commerce-orders.v1' &&
    publicApis.orderProviderSchema === 'backy.commerce-provider-certification-handoff.v1';
  const productApiHandoffSchemaReady = product.status === 'certified' &&
    product.providerSchema === 'backy.commerce-provider-certification-handoff.v1' &&
    product.productEvidenceSchema === 'backy.product-provider-certification-evidence.v1' &&
    product.packetSchema === 'backy.commerce-provider-certification-evidence-packet.v1' &&
    product.storefrontSchema === 'backy.product-storefront-handoff.v1' &&
    typeof product.designReadinessStatus === 'string' &&
    product.designReadinessStatus.length > 0;
  const orderApiHandoffSchemaReady = orders.status === 'certified' &&
    orders.analyticsSchema === 'backy.order-analytics.v1' &&
    orders.providerSchema === 'backy.commerce-provider-certification-handoff.v1' &&
    orders.orderEvidenceSchema === 'backy.order-provider-certification-evidence.v1' &&
    orders.packetSchema === 'backy.order-provider-certification-evidence-packet.v1';
  const productApiHandoffSiteTargetReady = productApiHandoffSchemaReady &&
    apiHandoffSiteId !== null &&
    product.targetSiteId === apiHandoffSiteId &&
    product.siteSelectorEnv === 'BACKY_COMMERCE_CERTIFY_SITE_ID' &&
    product.commandPreviewTargetInputsIncludeSiteSelector === true;
  const orderApiHandoffSiteTargetReady = orderApiHandoffSchemaReady &&
    apiHandoffSiteId !== null &&
    orders.targetSiteId === apiHandoffSiteId &&
    orders.siteSelectorEnv === 'BACKY_COMMERCE_CERTIFY_SITE_ID' &&
    orders.commandPreviewTargetInputsIncludeSiteSelector === true;
  const productApiHandoffReady = productApiHandoffSchemaReady && productApiHandoffSiteTargetReady;
  const orderApiHandoffReady = orderApiHandoffSchemaReady && orderApiHandoffSiteTargetReady;
  const apiHandoffReady = publicCommerceApiHandoffReady && productApiHandoffReady && orderApiHandoffReady;

  return {
    ready: apiHandoffReady && commerceRequestedGroupEvidenceReady && commerceRuntimeEvidenceReady,
    fields: {
      commerceRequestedGroupEvidenceReady,
      commerceRuntimeEvidenceReady,
      requestedCommerceGroups,
      certifiedCommerceGroups: certified,
      apiHandoffReady,
      apiHandoffSiteId,
      publicCommerceApiHandoffReady,
      productApiHandoffSchemaReady,
      productApiHandoffReady,
      productApiHandoffSiteTargetReady,
      productApiHandoffTargetSiteId: typeof product.targetSiteId === 'string' ? product.targetSiteId : null,
      orderApiHandoffSchemaReady,
      orderApiHandoffReady,
      orderApiHandoffSiteTargetReady,
      orderApiHandoffTargetSiteId: typeof orders.targetSiteId === 'string' ? orders.targetSiteId : null,
      commerceApiHandoffSiteSelectorEnv: 'BACKY_COMMERCE_CERTIFY_SITE_ID',
      expectedApiHandoffs: [
        'GET /api/sites/:siteId/manifest',
        'GET /api/sites/:siteId/commerce/catalog',
        'GET /api/sites/:siteId/commerce/orders',
        'GET /api/admin/sites/:siteId/commerce/products/:productId/provider-sync',
        'GET /api/admin/sites/:siteId/commerce/orders/analytics',
      ],
    },
  };
};

const verifySettingsApiHandoffs = (payload) => {
  const requested = isRecord(payload.requested) ? payload.requested : {};
  const results = isRecord(payload.results) ? payload.results : {};
  const certified = Array.isArray(payload.certified) ? payload.certified.filter((item) => typeof item === 'string') : [];
  const requestedSettingsResultKeys = Object.entries({
    storage: 'storage',
    rotation: 'rotation',
    vercelSecrets: 'vercelSecretManager',
    notification: 'notification',
    publicApiCors: 'publicApiCors',
  })
    .filter(([key]) => requested[key] === true)
    .map(([, resultKey]) => resultKey);
  const settingsInfrastructureEvidenceReady = certified.includes('infrastructure') &&
    isRecord(results.infrastructure) &&
    results.infrastructure.requiredReady === true;
  const settingsRequestedGroupEvidenceReady = requestedSettingsResultKeys.length > 0 &&
    requestedSettingsResultKeys.every((key) => certified.includes(key) && isRecord(results[key]));
  const handoffs = isRecord(payload.apiHandoffs) ? payload.apiHandoffs : {};
  const settingsAdminApi = isRecord(handoffs.settingsAdminApi) ? handoffs.settingsAdminApi : {};
  const siteScopedSettingsApi = isRecord(handoffs.siteScopedSettingsApi) ? handoffs.siteScopedSettingsApi : {};
  const siteSettingsApiHandoffSiteId = typeof siteScopedSettingsApi.resolvedSiteId === 'string' && siteScopedSettingsApi.resolvedSiteId.trim()
    ? siteScopedSettingsApi.resolvedSiteId.trim()
    : null;
  const settingsApiHandoffTargetSiteId = typeof settingsAdminApi.targetSiteId === 'string' && settingsAdminApi.targetSiteId.trim()
    ? settingsAdminApi.targetSiteId.trim()
    : null;
  const settingsScenarioEvidenceReady =
    settingsAdminApi.scenarioEvidenceSchema === 'backy.settings-provider-certification-evidence.v1';
  const settingsEvidencePacketReady =
    settingsAdminApi.evidencePacketSchema === 'backy.settings-provider-certification-evidence-packet.v1';
  const settingsCompletionStatusReady =
    settingsAdminApi.completionStatusSchema === 'backy.completion-status.v1';
  const settingsApiHandoffSchemaReady = settingsAdminApi.status === 'certified' &&
    settingsAdminApi.providerSchema === 'backy.settings-provider-certification-handoff.v1' &&
    settingsScenarioEvidenceReady &&
    settingsEvidencePacketReady &&
    settingsCompletionStatusReady;
  const siteSettingsApiHandoffReady = siteScopedSettingsApi.status === 'certified' &&
    siteScopedSettingsApi.settingsSchema === 'backy.site-settings-scope.v1' &&
    siteScopedSettingsApi.source === 'admin-site-settings-api' &&
    siteScopedSettingsApi.mediaStorageSchema === 'backy.media-storage-handoff.v1' &&
    siteScopedSettingsApi.frontendDatabaseSchema === 'backy.frontend-database-certification.v1' &&
    siteScopedSettingsApi.frontendDatabaseEvidenceSchema === 'backy.frontend-database-certification-evidence.v1' &&
    siteSettingsApiHandoffSiteId !== null;
  const settingsApiHandoffSiteTargetReady = settingsApiHandoffSchemaReady &&
    siteSettingsApiHandoffReady &&
    settingsApiHandoffTargetSiteId === siteSettingsApiHandoffSiteId &&
    settingsAdminApi.settingsSiteSelectorEnv === 'BACKY_SETTINGS_CERTIFY_SITE_ID' &&
    settingsAdminApi.commerceSiteSelectorEnv === 'BACKY_COMMERCE_CERTIFY_SITE_ID' &&
    settingsAdminApi.commandPreviewTargetInputsIncludeSettingsSiteSelector === true &&
    settingsAdminApi.commandPreviewTargetInputsIncludeCommerceSiteSelector === true;
  const settingsApiHandoffReady = settingsApiHandoffSchemaReady && settingsApiHandoffSiteTargetReady;

  return {
    ready: settingsApiHandoffReady &&
      siteSettingsApiHandoffReady &&
      settingsInfrastructureEvidenceReady &&
      settingsRequestedGroupEvidenceReady,
    fields: {
      settingsInfrastructureEvidenceReady,
      settingsRequestedGroupEvidenceReady,
      requestedSettingsResultKeys,
      certifiedSettingsGroups: certified,
      settingsApiHandoffSchemaReady,
      settingsApiHandoffReady,
      settingsApiHandoffSiteTargetReady,
      settingsApiHandoffTargetSiteId,
      siteSettingsApiHandoffReady,
      settingsScenarioEvidenceReady,
      settingsEvidencePacketReady,
      settingsCompletionStatusReady,
      settingsApiHandoffSurface: 'GET /api/admin/settings',
      siteSettingsApiHandoffSurface: 'GET /api/admin/sites/:siteId/settings',
      siteSettingsApiHandoffSiteId,
      settingsApiHandoffSettingsSiteSelectorEnv: 'BACKY_SETTINGS_CERTIFY_SITE_ID',
      settingsApiHandoffCommerceSiteSelectorEnv: 'BACKY_COMMERCE_CERTIFY_SITE_ID',
    },
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
const publicApiOrigin = selected('BACKY_SETTINGS_CERTIFY_PUBLIC_API_ORIGIN', selected('BACKY_CORS_ALLOWED_ORIGINS'));
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
    publicApiCors: requested('BACKY_SETTINGS_CERTIFY_PUBLIC_API_CORS', false),
  },
  selectors: {
    storageProvider,
    notificationProvider,
    publicApiOriginConfigured: Boolean(publicApiOrigin),
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
    checkAny('Public API CORS origin', ['BACKY_CORS_ALLOWED_ORIGINS', 'BACKY_SETTINGS_CERTIFY_PUBLIC_API_ORIGIN'], requested('BACKY_SETTINGS_CERTIFY_PUBLIC_API_CORS', false)),
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

const certificationArtifacts = {
  settings: verifyCertificationArtifact({
    label: 'Settings certification artifact',
    pathEnvNames: ['BACKY_SETTINGS_CERTIFICATION_ARTIFACT_PATH', 'BACKY_SETTINGS_CERTIFICATION_ARTIFACT'],
    requiredEnv: 'BACKY_SETTINGS_CERTIFICATION_ARTIFACT_REQUIRED',
    expectedContract: 'backy.settings-provider-certification.v1',
    expectedSchemaVersion: 'backy.settings-provider-certification-artifact.v1',
    extraChecks: verifySettingsApiHandoffs,
  }),
  commerce: verifyCertificationArtifact({
    label: 'Commerce certification artifact',
    pathEnvNames: ['BACKY_COMMERCE_CERTIFICATION_ARTIFACT_PATH', 'BACKY_COMMERCE_CERTIFICATION_ARTIFACT'],
    requiredEnv: 'BACKY_COMMERCE_CERTIFICATION_ARTIFACT_REQUIRED',
    expectedContract: 'backy.commerce-provider-certification.v1',
    expectedSchemaVersion: 'backy.commerce-provider-certification-artifact.v1',
    extraChecks: verifyCommerceApiHandoffs,
  }),
};

const collectArtifactFailures = () => Object.values(certificationArtifacts)
  .filter((artifact) => (artifact.required || artifact.configured) && !artifact.ready)
  .map((artifact) => artifact.label);

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
    settings.requested.publicApiCors,
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
  ...collectArtifactFailures(),
];

const aggregatePreflight = 'npm run test:partial-gate-preflights';
const adminSourceGuard = 'npm run test:admin-contract-source';

const partialGateMap = [
  {
    row: '/settings',
    gate: 'npm run ci:settings-provider-certification',
    preflight: 'npm run test:settings-provider-certification-preflight-contract',
    sourceOnlyGuard: 'npm run test:settings-source-only',
    aggregatePreflight,
    adminSourceGuard,
    doctorRequiredEnv: 'BACKY_RELEASE_CERTIFICATION_DOCTOR_REQUIRED=1',
    artifactPathEnv: 'BACKY_SETTINGS_CERTIFICATION_ARTIFACT_PATH or BACKY_SETTINGS_CERTIFICATION_ARTIFACT',
    artifactRequiredEnv: 'BACKY_SETTINGS_CERTIFICATION_ARTIFACT_REQUIRED=1 or BACKY_PROVIDER_CERTIFICATION_ARTIFACTS_REQUIRED=1',
    artifactSchemaVersion: 'backy.settings-provider-certification-artifact.v1',
    workflow: '.github/workflows/settings-provider-certification.yml',
    requiredInputFamily: 'selected storage, Vercel, notification, custom frontend CORS, and provider-family inputs',
  },
  {
    row: 'Settings admin APIs',
    gate: 'npm run ci:settings-provider-certification',
    preflight: 'npm run test:settings-provider-certification-preflight-contract',
    sourceOnlyGuard: 'npm run test:settings-source-only',
    aggregatePreflight,
    adminSourceGuard,
    doctorRequiredEnv: 'BACKY_RELEASE_CERTIFICATION_DOCTOR_REQUIRED=1',
    artifactPathEnv: 'BACKY_SETTINGS_CERTIFICATION_ARTIFACT_PATH or BACKY_SETTINGS_CERTIFICATION_ARTIFACT',
    artifactRequiredEnv: 'BACKY_SETTINGS_CERTIFICATION_ARTIFACT_REQUIRED=1 or BACKY_PROVIDER_CERTIFICATION_ARTIFACTS_REQUIRED=1',
    artifactSchemaVersion: 'backy.settings-provider-certification-artifact.v1',
    workflow: '.github/workflows/settings-provider-certification.yml',
    requiredInputFamily: 'selected storage, Vercel, notification, custom frontend CORS, and provider-family inputs',
  },
  {
    row: '/products',
    gate: 'npm run ci:commerce-provider-certification',
    preflight: 'npm run test:commerce-provider-certification-preflight-contract',
    sourceOnlyGuard: 'npm run test:commerce-source-only',
    mockGate: 'npm run ci:commerce-provider-smoke',
    aggregatePreflight,
    adminSourceGuard,
    doctorRequiredEnv: 'BACKY_RELEASE_CERTIFICATION_DOCTOR_REQUIRED=1',
    artifactPathEnv: 'BACKY_COMMERCE_CERTIFICATION_ARTIFACT_PATH or BACKY_COMMERCE_CERTIFICATION_ARTIFACT',
    artifactRequiredEnv: 'BACKY_COMMERCE_CERTIFICATION_ARTIFACT_REQUIRED=1 or BACKY_PROVIDER_CERTIFICATION_ARTIFACTS_REQUIRED=1',
    artifactSchemaVersion: 'backy.commerce-provider-certification-artifact.v1',
    workflow: '.github/workflows/commerce-provider-certification.yml',
    requiredInputFamily: 'selected payment, tax, shipping, discount, catalog, subscription, and webhook provider inputs',
  },
  {
    row: '/orders',
    gate: 'npm run ci:commerce-provider-certification',
    preflight: 'npm run test:commerce-provider-certification-preflight-contract',
    sourceOnlyGuard: 'npm run test:orders-source-only',
    mockGate: 'npm run ci:commerce-provider-smoke',
    aggregatePreflight,
    adminSourceGuard,
    doctorRequiredEnv: 'BACKY_RELEASE_CERTIFICATION_DOCTOR_REQUIRED=1',
    artifactPathEnv: 'BACKY_COMMERCE_CERTIFICATION_ARTIFACT_PATH or BACKY_COMMERCE_CERTIFICATION_ARTIFACT',
    artifactRequiredEnv: 'BACKY_COMMERCE_CERTIFICATION_ARTIFACT_REQUIRED=1 or BACKY_PROVIDER_CERTIFICATION_ARTIFACTS_REQUIRED=1',
    artifactSchemaVersion: 'backy.commerce-provider-certification-artifact.v1',
    workflow: '.github/workflows/commerce-provider-certification.yml',
    requiredInputFamily: 'selected payment, tax, shipping, discount, catalog, subscription, and webhook provider inputs',
  },
];

const certifiedGates = [
  {
    row: '/forms',
    gate: 'npm run ci:forms-postgres',
    preflight: 'npm run test:forms-postgres-preflight-contract',
    disposableGuard: 'npm run test:forms-postgres-disposable-guard',
    aggregatePreflight,
    workflow: '.github/workflows/forms-postgres-contract.yml',
    certifiedOn: '2026-05-21',
    status: 'certified-regression',
    requiredInputFamily: 'BACKY_DATABASE_URL or DATABASE_URL pointing at a disposable migrated Supabase/Postgres database',
  },
  {
    row: 'Frontend manifest/OpenAPI/SDK APIs',
    gate: 'npm run ci:sdk-postgres-smoke',
    preflight: 'npm run test:sdk-postgres-preflight-contract',
    disposableGuard: 'npm run test:sdk-postgres-disposable-guard',
    aggregatePreflight,
    workflow: '.github/workflows/sdk-postgres-smoke.yml',
    certifiedOn: '2026-05-21',
    status: 'certified-regression',
    requiredInputFamily: 'BACKY_DATABASE_URL or DATABASE_URL pointing at a disposable migrated Supabase/Postgres database',
  },
];

console.log(JSON.stringify({
  ok: failures.length === 0,
  contract: 'backy.release-certification-doctor.v1',
  partialGateMap,
  certifiedGates,
  database,
  settings,
  commerce,
  certificationArtifacts,
  failures,
}, null, 2));

if (env.BACKY_RELEASE_CERTIFICATION_DOCTOR_REQUIRED === '1' && failures.length > 0) {
  process.exitCode = 1;
}
