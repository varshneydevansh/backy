#!/usr/bin/env node

import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = new URL('..', import.meta.url);
const publicRoot = new URL('apps/public/', root);
const rootPath = fileURLToPath(root);
const publicRootPath = fileURLToPath(publicRoot);
const NEXT_BIN = path.join(rootPath, 'node_modules/next/dist/bin/next');
const npmBin = process.platform === 'win32' ? 'npm.cmd' : 'npm';

const requireCertification = process.env.BACKY_COMMERCE_PROVIDER_CERTIFICATION_REQUIRED === '1';
const externalBaseUrl = (process.env.BACKY_COMMERCE_CERTIFICATION_BASE_URL || '').replace(/\/$/, '');
const generatedAdminKey = `commerce-provider-cert-${Date.now()}`;
const providedAdminKey = process.env.BACKY_ADMIN_API_KEY || process.env.BACKY_COMMERCE_CERTIFICATION_ADMIN_KEY || '';
const adminKey = providedAdminKey || generatedAdminKey;

const certifyPayment = process.env.BACKY_COMMERCE_CERTIFY_PAYMENT === '1';
const certifyTax = process.env.BACKY_COMMERCE_CERTIFY_TAX === '1';
const certifyShipping = process.env.BACKY_COMMERCE_CERTIFY_SHIPPING === '1';
const certifyDiscount = process.env.BACKY_COMMERCE_CERTIFY_DISCOUNT === '1';
const certifyCatalog = process.env.BACKY_COMMERCE_CERTIFY_CATALOG === '1';
const certifySubscriptions = process.env.BACKY_COMMERCE_CERTIFY_SUBSCRIPTIONS === '1';
const certifyWebhooks = process.env.BACKY_COMMERCE_CERTIFY_WEBHOOKS === '1';
const requestedPaymentProvider = (process.env.BACKY_COMMERCE_CERTIFY_PAYMENT_PROVIDER || 'auto').trim().toLowerCase();
const requestedTaxProvider = (process.env.BACKY_COMMERCE_CERTIFY_TAX_PROVIDER || 'auto').trim().toLowerCase();
const requestedShippingProvider = (process.env.BACKY_COMMERCE_CERTIFY_SHIPPING_PROVIDER || 'auto').trim().toLowerCase();
const requestedDiscountProvider = (process.env.BACKY_COMMERCE_CERTIFY_DISCOUNT_PROVIDER || 'auto').trim().toLowerCase();
const requestedCatalogProvider = (process.env.BACKY_COMMERCE_CERTIFY_CATALOG_PROVIDER || 'auto').trim().toLowerCase();
const requestedSubscriptionProvider = (process.env.BACKY_COMMERCE_CERTIFY_SUBSCRIPTION_PROVIDER || 'auto').trim().toLowerCase();
const requestedWebhookProvider = (process.env.BACKY_COMMERCE_CERTIFY_WEBHOOK_PROVIDER || 'auto').trim().toLowerCase();
const certificationOutputPath = (process.env.BACKY_COMMERCE_CERTIFICATION_OUTPUT || '').trim();
const certifiedAt = new Date().toISOString();

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

const isHttpUrl = (url) => /^https?:\/\//i.test(url);
const RAW_SECRET_VALUE_PATTERN = /(BACKY_SECRET_TEST_VALUE_|sk_live|sk_test|whsec_|AKIA|-----BEGIN|xox[baprs]-)/i;
const URL_WITH_CREDENTIALS_PATTERN = /\b(?:https?|postgres(?:ql)?):\/\/[^/\s:@]+:[^@\s/]+@/i;
const FORBIDDEN_CERTIFICATION_ARTIFACT_FIELD_NAMES = new Set([
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

if (requireCertification && externalBaseUrl && !isHttpUrl(externalBaseUrl)) {
  throw new Error('BACKY_COMMERCE_CERTIFICATION_BASE_URL must be an http:// or https:// URL when Commerce provider certification targets an external deployment.');
}

if (requireCertification && externalBaseUrl && !providedAdminKey) {
  throw new Error('BACKY_COMMERCE_PROVIDER_CERTIFICATION_REQUIRED=1 with BACKY_COMMERCE_CERTIFICATION_BASE_URL requires BACKY_ADMIN_API_KEY or BACKY_COMMERCE_CERTIFICATION_ADMIN_KEY.');
}

if (requireCertification && ![
  certifyPayment,
  certifyTax,
  certifyShipping,
  certifyDiscount,
  certifyCatalog,
  certifySubscriptions,
  certifyWebhooks,
].some(Boolean)) {
  throw new Error('BACKY_COMMERCE_PROVIDER_CERTIFICATION_REQUIRED=1 requires at least one BACKY_COMMERCE_CERTIFY_* provider group flag.');
}

if (!['auto', 'stripe', 'paypal', 'paddle', 'square', 'adyen', 'mollie', 'razorpay'].includes(requestedPaymentProvider)) {
  throw new Error('BACKY_COMMERCE_CERTIFY_PAYMENT_PROVIDER must be auto, stripe, paypal, paddle, square, adyen, mollie, or razorpay.');
}

if (!['auto', 'stripe', 'taxjar', 'avalara', 'http'].includes(requestedTaxProvider)) {
  throw new Error('BACKY_COMMERCE_CERTIFY_TAX_PROVIDER must be auto, stripe, taxjar, avalara, or http.');
}

if (!['auto', 'easypost', 'shippo', 'http'].includes(requestedShippingProvider)) {
  throw new Error('BACKY_COMMERCE_CERTIFY_SHIPPING_PROVIDER must be auto, easypost, shippo, or http.');
}

if (!['auto', 'stripe', 'http'].includes(requestedDiscountProvider)) {
  throw new Error('BACKY_COMMERCE_CERTIFY_DISCOUNT_PROVIDER must be auto, stripe, or http.');
}

if (!['auto', 'shopify', 'bigcommerce', 'woocommerce', 'etsy', 'magento', 'http'].includes(requestedCatalogProvider)) {
  throw new Error('BACKY_COMMERCE_CERTIFY_CATALOG_PROVIDER must be auto, shopify, bigcommerce, woocommerce, etsy, magento, or http.');
}

if (!['auto', 'stripe', 'paypal', 'paddle', 'square', 'adyen', 'mollie', 'razorpay', 'http'].includes(requestedSubscriptionProvider)) {
  throw new Error('BACKY_COMMERCE_CERTIFY_SUBSCRIPTION_PROVIDER must be auto, stripe, paypal, paddle, square, adyen, mollie, razorpay, or http.');
}

if (!['auto', 'stripe', 'paypal', 'paddle', 'square', 'adyen', 'mollie', 'razorpay', 'generic'].includes(requestedWebhookProvider)) {
  throw new Error('BACKY_COMMERCE_CERTIFY_WEBHOOK_PROVIDER must be auto, stripe, paypal, paddle, square, adyen, mollie, razorpay, or generic.');
}

const listen = (server, port = 0) => new Promise((resolve) => {
  server.listen(port, '127.0.0.1', () => resolve(server.address()));
});

const closeServer = (server) => new Promise((resolve) => {
  server.close(() => resolve());
});

const freePort = async () => {
  const server = net.createServer();
  const address = await listen(server);
  await closeServer(server);
  return address.port;
};

const waitForExit = (childProcess, timeoutMs = 1500) => new Promise((resolve) => {
  if (!childProcess || childProcess.exitCode !== null || childProcess.signalCode !== null) {
    resolve(true);
    return;
  }
  const timeout = setTimeout(() => {
    childProcess.off('exit', onExit);
    resolve(false);
  }, timeoutMs);
  const onExit = () => {
    clearTimeout(timeout);
    resolve(true);
  };
  childProcess.once('exit', onExit);
});

const stopProcess = async (childProcess) => {
  if (!childProcess || childProcess.exitCode !== null || childProcess.signalCode !== null) return;
  childProcess.kill('SIGTERM');
  if (!(await waitForExit(childProcess))) {
    childProcess.kill('SIGKILL');
    await waitForExit(childProcess, 500);
  }
};

const startPublicServer = async () => {
  if (externalBaseUrl) return { baseUrl: externalBaseUrl };

  const port = await freePort();
  const childProcess = spawn(process.execPath, [NEXT_BIN, 'dev', '-p', String(port)], {
    cwd: publicRootPath,
    env: {
      ...process.env,
      BACKY_ADMIN_API_KEY: adminKey,
      NEXT_TELEMETRY_DISABLED: '1',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  let output = '';
  const append = (chunk) => {
    output = `${output}${chunk.toString()}`.slice(-8000);
  };
  childProcess.stdout.on('data', append);
  childProcess.stderr.on('data', append);

  const baseUrl = `http://127.0.0.1:${port}`;
  for (let attempt = 0; attempt < 160; attempt += 1) {
    if (childProcess.exitCode !== null || childProcess.signalCode !== null) {
      throw new Error(`Public Next server exited early:\n${output}`);
    }
    try {
      const response = await fetch(`${baseUrl}/api/sites`);
      if (response.status < 500) return { baseUrl, childProcess };
    } catch {
      // Keep waiting for Next dev.
    }
    await sleep(250);
  }
  throw new Error(`Public Next server did not become ready:\n${output}`);
};

const runPreflight = async () => {
  const preflight = spawn(npmBin, ['run', 'test:commerce-provider-certification-preflight-contract'], {
    cwd: rootPath,
    stdio: 'inherit',
  });
  const preflightExit = await new Promise((resolve) => preflight.on('exit', resolve));
  assert(preflightExit === 0, `Commerce provider certification preflight exited with ${preflightExit}`);
};

const requestJson = async (baseUrl, pathName, init = {}) => {
  const response = await fetch(`${baseUrl}${pathName}`, {
    ...init,
    headers: {
      'content-type': 'application/json',
      'x-backy-admin-key': adminKey,
      ...(init.headers || {}),
    },
  });
  const payload = await response.json().catch(() => ({}));
  assert(response.ok && payload.success !== false, `${pathName} failed with ${response.status}: ${JSON.stringify(payload).slice(0, 800)}`);
  return payload;
};

const optionalRequestJson = async (baseUrl, pathName, init = {}) => {
  const response = await fetch(`${baseUrl}${pathName}`, {
    ...init,
    headers: {
      'content-type': 'application/json',
      'x-backy-admin-key': adminKey,
      ...(init.headers || {}),
    },
  });
  const payload = await response.json().catch(() => ({}));
  return { response, payload };
};

const asRecord = (value) => (
  value && typeof value === 'object' && !Array.isArray(value) ? value : {}
);

const stringValue = (value) => (typeof value === 'string' ? value.trim() : '');
const previewJson = (value) => JSON.stringify(value ?? null).slice(0, 900);

const hasHttpUrl = (value) => /^https?:\/\//i.test(stringValue(value));
const envValue = (names) => names.map((name) => stringValue(process.env[name])).find(Boolean) || '';

const normalizeArtifactFieldName = (name) => name.replace(/[^a-z0-9]/gi, '').toLowerCase();

const collectForbiddenArtifactFields = (input, pathSegments = []) => {
  if (Array.isArray(input)) {
    return input.flatMap((item, index) => collectForbiddenArtifactFields(item, [...pathSegments, String(index)]));
  }

  if (!input || typeof input !== 'object') {
    if (typeof input === 'string' && URL_WITH_CREDENTIALS_PATTERN.test(input)) {
      return [pathSegments.join('.') || '$'];
    }
    return [];
  }

  return Object.entries(input).flatMap(([key, nestedValue]) => {
    const nextPath = [...pathSegments, key];
    const normalizedKey = normalizeArtifactFieldName(key);
    const fieldLeak = FORBIDDEN_CERTIFICATION_ARTIFACT_FIELD_NAMES.has(normalizedKey)
      ? [nextPath.join('.')]
      : [];
    return [
      ...fieldLeak,
      ...collectForbiddenArtifactFields(nestedValue, nextPath),
    ];
  });
};

const assertNoForbiddenArtifactFields = (payload, label) => {
  const forbiddenFields = collectForbiddenArtifactFields(payload);
  assert(
    forbiddenFields.length === 0,
    `${label} contains forbidden sensitive artifact fields: ${forbiddenFields.join(', ')}`,
  );
};

const commerceHttpCertificationUrls = {
  taxProviderUrl: envValue(['BACKY_COMMERCE_TAX_PROVIDER_URL', 'COMMERCE_TAX_PROVIDER_URL']),
  shippingProviderUrl: envValue(['BACKY_COMMERCE_SHIPPING_PROVIDER_URL', 'COMMERCE_SHIPPING_PROVIDER_URL']),
  discountProviderUrl: envValue(['BACKY_COMMERCE_DISCOUNT_PROVIDER_URL', 'COMMERCE_DISCOUNT_PROVIDER_URL']),
  catalogSyncProviderUrl: envValue(['BACKY_COMMERCE_PRODUCT_SYNC_URL', 'COMMERCE_PRODUCT_SYNC_URL']),
  subscriptionActionProviderUrl: envValue(['BACKY_COMMERCE_SUBSCRIPTION_ACTION_URL', 'COMMERCE_SUBSCRIPTION_ACTION_URL']),
};

const configuredCommerceSettings = (settings) => {
  const integrations = asRecord(asRecord(settings).integrations);
  return asRecord(integrations.commerce);
};

const postSettingsAction = async (baseUrl, body) => {
  const payload = await requestJson(baseUrl, '/api/admin/settings', {
    method: 'POST',
    body: JSON.stringify(body),
  });
  return payload.data;
};

const patchSettings = async (baseUrl, body) => {
  const payload = await requestJson(baseUrl, '/api/admin/settings', {
    method: 'PATCH',
    body: JSON.stringify(body),
  });
  return payload.data?.settings;
};

const providerLabels = {
  payment: 'payment provider credentials',
  tax: 'tax quote provider credentials',
  shipping: 'shipping quote/label provider credentials',
  discount: 'discount quote provider credentials',
  catalog: 'catalog sync provider credentials',
  subscriptions: 'subscription lifecycle provider credentials',
  webhooks: 'commerce webhook secret',
};

const paymentReady = (runtime) => Boolean(
  runtime.stripeSecretConfigured ||
  runtime.paypalAccessTokenConfigured ||
  runtime.paddleApiKeyConfigured ||
  runtime.squareAccessTokenConfigured ||
  (runtime.adyenApiKeyConfigured && runtime.adyenMerchantAccountConfigured) ||
  runtime.mollieApiKeyConfigured ||
  (runtime.razorpayKeyIdConfigured && runtime.razorpayKeySecretConfigured),
);

const paymentProviderReady = (runtime, provider) => {
  if (provider === 'stripe') return Boolean(runtime.stripeSecretConfigured);
  if (provider === 'paypal') return Boolean(runtime.paypalAccessTokenConfigured);
  if (provider === 'paddle') return Boolean(runtime.paddleApiKeyConfigured);
  if (provider === 'square') return Boolean(runtime.squareAccessTokenConfigured);
  if (provider === 'adyen') return Boolean(runtime.adyenApiKeyConfigured && runtime.adyenMerchantAccountConfigured);
  if (provider === 'mollie') return Boolean(runtime.mollieApiKeyConfigured);
  if (provider === 'razorpay') return Boolean(runtime.razorpayKeyIdConfigured && runtime.razorpayKeySecretConfigured);
  return false;
};

const catalogProviderReady = (runtime, settings, provider) => {
  const commerce = configuredCommerceSettings(settings);
  if (provider === 'shopify') return Boolean(runtime.shopifyAdminAccessTokenConfigured && runtime.shopifyStoreConfigured);
  if (provider === 'bigcommerce') return Boolean(runtime.bigCommerceAccessTokenConfigured && runtime.bigCommerceStoreConfigured);
  if (provider === 'woocommerce') return Boolean(runtime.wooCommerceConsumerKeyConfigured && runtime.wooCommerceConsumerSecretConfigured && runtime.wooCommerceStoreConfigured);
  if (provider === 'etsy') return Boolean(runtime.etsyAccessTokenConfigured && runtime.etsyApiKeyConfigured && runtime.etsyShopConfigured);
  if (provider === 'magento') return Boolean(runtime.magentoAccessTokenConfigured && runtime.magentoStoreConfigured);
  if (provider === 'http') return hasHttpUrl(commerce.catalogSyncProviderUrl);
  return false;
};

const subscriptionProviderReady = (runtime, settings, provider) => {
  const commerce = configuredCommerceSettings(settings);
  if (provider === 'http') return hasHttpUrl(commerce.subscriptionActionProviderUrl);
  return paymentProviderReady(runtime, provider);
};

const inferPaymentCertificationProvider = () => {
  if (requestedPaymentProvider !== 'auto') return requestedPaymentProvider;
  if (process.env.BACKY_STRIPE_SECRET_KEY || process.env.STRIPE_SECRET_KEY) return 'stripe';
  if (process.env.BACKY_PAYPAL_ACCESS_TOKEN || process.env.PAYPAL_ACCESS_TOKEN) return 'paypal';
  if (process.env.BACKY_PADDLE_API_KEY || process.env.PADDLE_API_KEY) return 'paddle';
  if (process.env.BACKY_SQUARE_ACCESS_TOKEN || process.env.SQUARE_ACCESS_TOKEN) return 'square';
  if (
    (process.env.BACKY_ADYEN_API_KEY || process.env.ADYEN_API_KEY) &&
    (process.env.BACKY_ADYEN_MERCHANT_ACCOUNT || process.env.ADYEN_MERCHANT_ACCOUNT)
  ) {
    return 'adyen';
  }
  if (process.env.BACKY_MOLLIE_API_KEY || process.env.MOLLIE_API_KEY) return 'mollie';
  if (
    (process.env.BACKY_RAZORPAY_KEY_ID || process.env.RAZORPAY_KEY_ID) &&
    (process.env.BACKY_RAZORPAY_KEY_SECRET || process.env.RAZORPAY_KEY_SECRET)
  ) {
    return 'razorpay';
  }
  return '';
};

const inferTaxCertificationProvider = () => {
  if (requestedTaxProvider !== 'auto') return requestedTaxProvider;
  if (process.env.BACKY_STRIPE_SECRET_KEY || process.env.STRIPE_SECRET_KEY) return 'stripe';
  if (process.env.BACKY_TAXJAR_API_KEY || process.env.TAXJAR_API_KEY) return 'taxjar';
  if (
    (process.env.BACKY_AVALARA_ACCOUNT_ID || process.env.AVALARA_ACCOUNT_ID) &&
    (process.env.BACKY_AVALARA_LICENSE_KEY || process.env.AVALARA_LICENSE_KEY) &&
    (process.env.BACKY_AVALARA_COMPANY_CODE || process.env.AVALARA_COMPANY_CODE)
  ) {
    return 'avalara';
  }
  return '';
};

const inferShippingCertificationProvider = () => {
  if (requestedShippingProvider !== 'auto') return requestedShippingProvider;
  if (process.env.BACKY_EASYPOST_API_KEY || process.env.EASYPOST_API_KEY) return 'easypost';
  if (process.env.BACKY_SHIPPO_API_KEY || process.env.SHIPPO_API_KEY) return 'shippo';
  return '';
};

const inferDiscountCertificationProvider = () => {
  if (requestedDiscountProvider !== 'auto') return requestedDiscountProvider;
  if (process.env.BACKY_STRIPE_SECRET_KEY || process.env.STRIPE_SECRET_KEY) return 'stripe';
  if (commerceHttpCertificationUrls.discountProviderUrl) return 'http';
  return '';
};

const inferCatalogCertificationProvider = () => {
  if (requestedCatalogProvider !== 'auto') return requestedCatalogProvider;
  if (
    (process.env.BACKY_SHOPIFY_ADMIN_ACCESS_TOKEN || process.env.SHOPIFY_ADMIN_ACCESS_TOKEN) &&
    (process.env.BACKY_SHOPIFY_STORE_DOMAIN || process.env.SHOPIFY_STORE_DOMAIN || process.env.BACKY_SHOPIFY_ADMIN_API_BASE_URL || process.env.SHOPIFY_ADMIN_API_BASE_URL)
  ) {
    return 'shopify';
  }
  if (
    (process.env.BACKY_BIGCOMMERCE_ACCESS_TOKEN || process.env.BIGCOMMERCE_ACCESS_TOKEN) &&
    (process.env.BACKY_BIGCOMMERCE_STORE_HASH || process.env.BIGCOMMERCE_STORE_HASH || process.env.BACKY_BIGCOMMERCE_API_BASE_URL || process.env.BIGCOMMERCE_API_BASE_URL)
  ) {
    return 'bigcommerce';
  }
  if (
    (process.env.BACKY_WOOCOMMERCE_CONSUMER_KEY || process.env.WOOCOMMERCE_CONSUMER_KEY) &&
    (process.env.BACKY_WOOCOMMERCE_CONSUMER_SECRET || process.env.WOOCOMMERCE_CONSUMER_SECRET) &&
    (process.env.BACKY_WOOCOMMERCE_STORE_URL || process.env.WOOCOMMERCE_STORE_URL || process.env.BACKY_WOOCOMMERCE_API_BASE_URL || process.env.WOOCOMMERCE_API_BASE_URL)
  ) {
    return 'woocommerce';
  }
  if (
    (process.env.BACKY_ETSY_ACCESS_TOKEN || process.env.ETSY_ACCESS_TOKEN) &&
    (process.env.BACKY_ETSY_API_KEY || process.env.ETSY_API_KEY) &&
    (process.env.BACKY_ETSY_SHOP_ID || process.env.ETSY_SHOP_ID)
  ) {
    return 'etsy';
  }
  if (
    (process.env.BACKY_MAGENTO_ACCESS_TOKEN || process.env.MAGENTO_ACCESS_TOKEN) &&
    (process.env.BACKY_MAGENTO_STORE_URL || process.env.MAGENTO_STORE_URL || process.env.BACKY_MAGENTO_API_BASE_URL || process.env.MAGENTO_API_BASE_URL)
  ) {
    return 'magento';
  }
  return '';
};

const inferSubscriptionCertificationProvider = () => {
  if (requestedSubscriptionProvider !== 'auto') return requestedSubscriptionProvider;
  return inferPaymentCertificationProvider();
};

const inferWebhookCertificationProvider = () => {
  if (requestedWebhookProvider !== 'auto') return requestedWebhookProvider;
  return inferPaymentCertificationProvider() || 'generic';
};

const requiredPaymentProvider = () => (
  requireCertification && certifyPayment ? inferPaymentCertificationProvider() : ''
);

const requiredLocalTaxProvider = () => (
  !externalBaseUrl && requireCertification && certifyTax ? inferTaxCertificationProvider() : ''
);

const requiredLocalShippingProvider = () => (
  !externalBaseUrl && requireCertification && certifyShipping ? inferShippingCertificationProvider() : ''
);

const requiredLocalDiscountProvider = () => (
  !externalBaseUrl && requireCertification && certifyDiscount ? inferDiscountCertificationProvider() : ''
);

const requiredCatalogProvider = () => (
  requireCertification && certifyCatalog ? inferCatalogCertificationProvider() : ''
);

const requiredSubscriptionProvider = () => (
  requireCertification && certifySubscriptions ? inferSubscriptionCertificationProvider() : ''
);

const requiredWebhookProvider = () => (
  requireCertification && certifyWebhooks ? inferWebhookCertificationProvider() : ''
);

const prepareLocalCertificationSettings = async (baseUrl, settings) => {
  if (externalBaseUrl || !requireCertification) {
    return settings;
  }

  const commerce = configuredCommerceSettings(settings);
  const commercePatch = {};

  if (certifyPayment && stringValue(commerce.paymentProvider) === 'none' && paymentReady({ stripeSecretConfigured: Boolean(process.env.BACKY_STRIPE_SECRET_KEY || process.env.STRIPE_SECRET_KEY) })) {
    commercePatch.paymentProvider = 'stripe';
  }

  if (certifyTax) {
    const provider = inferTaxCertificationProvider();
    if (provider && provider !== stringValue(commerce.taxProvider)) {
      commercePatch.taxProvider = provider;
    }
    if (provider === 'http' && commerceHttpCertificationUrls.taxProviderUrl && commerceHttpCertificationUrls.taxProviderUrl !== stringValue(commerce.taxProviderUrl)) {
      commercePatch.taxProviderUrl = commerceHttpCertificationUrls.taxProviderUrl;
    }
  }

  if (certifyShipping) {
    const provider = inferShippingCertificationProvider();
    if (provider && provider !== stringValue(commerce.shippingProvider)) {
      commercePatch.shippingProvider = provider;
    }
    if (provider === 'http' && commerceHttpCertificationUrls.shippingProviderUrl && commerceHttpCertificationUrls.shippingProviderUrl !== stringValue(commerce.shippingProviderUrl)) {
      commercePatch.shippingProviderUrl = commerceHttpCertificationUrls.shippingProviderUrl;
    }
  }

  if (certifyDiscount) {
    const provider = inferDiscountCertificationProvider();
    if (provider && provider !== stringValue(commerce.discountProvider)) {
      commercePatch.discountProvider = provider;
    }
    if (provider === 'http' && commerceHttpCertificationUrls.discountProviderUrl && commerceHttpCertificationUrls.discountProviderUrl !== stringValue(commerce.discountProviderUrl)) {
      commercePatch.discountProviderUrl = commerceHttpCertificationUrls.discountProviderUrl;
    }
  }

  if (certifyCatalog) {
    const provider = inferCatalogCertificationProvider();
    if (provider === 'http' && commerceHttpCertificationUrls.catalogSyncProviderUrl && commerceHttpCertificationUrls.catalogSyncProviderUrl !== stringValue(commerce.catalogSyncProviderUrl)) {
      commercePatch.catalogSyncProviderUrl = commerceHttpCertificationUrls.catalogSyncProviderUrl;
    }
  }

  if (certifySubscriptions) {
    const provider = inferSubscriptionCertificationProvider();
    if (provider === 'http' && commerceHttpCertificationUrls.subscriptionActionProviderUrl && commerceHttpCertificationUrls.subscriptionActionProviderUrl !== stringValue(commerce.subscriptionActionProviderUrl)) {
      commercePatch.subscriptionActionProviderUrl = commerceHttpCertificationUrls.subscriptionActionProviderUrl;
    }
  }

  if (certifyWebhooks) {
    const provider = inferWebhookCertificationProvider();
    const paymentProvider = provider !== 'generic' ? provider : inferPaymentCertificationProvider();
    if (paymentProvider && paymentProvider !== stringValue(commerce.paymentProvider)) {
      commercePatch.paymentProvider = paymentProvider;
    }
    if (!stringValue(commerce.providerWebhookUrl)) {
      commercePatch.providerWebhookUrl = `${baseUrl}/api/sites/site-demo/commerce/webhook`;
    }
    if (!stringValue(commerce.providerWebhookSecretId)) {
      commercePatch.providerWebhookSecretId = process.env.BACKY_COMMERCE_WEBHOOK_SECRET
        ? 'env:BACKY_COMMERCE_WEBHOOK_SECRET'
        : process.env.COMMERCE_WEBHOOK_SECRET
          ? 'env:COMMERCE_WEBHOOK_SECRET'
          : 'env:BACKY_COMMERCE_WEBHOOK_SECRET';
    }
    if (commerce.webhookEventsEnabled !== true) {
      commercePatch.webhookEventsEnabled = true;
    }
  }

  if (Object.keys(commercePatch).length === 0) {
    return settings;
  }

  await patchSettings(baseUrl, {
    deliveryMode: settings.deliveryMode || 'custom-frontend',
    integrations: {
      ...asRecord(settings.integrations),
      commerce: {
        ...commerce,
        ...commercePatch,
      },
    },
  });

  const refreshedPayload = await requestJson(baseUrl, '/api/admin/settings');
  return refreshedPayload.data?.settings || settings;
};

const taxReady = (runtime, settings) => {
  const commerce = configuredCommerceSettings(settings);
  const requiredProvider = requiredLocalTaxProvider();
  if (!externalBaseUrl && requireCertification && certifyTax && !requiredProvider) return false;
  if (requiredProvider && runtime.taxProvider !== requiredProvider) return false;
  if (runtime.taxProvider === 'stripe') return Boolean(runtime.stripeSecretConfigured);
  if (runtime.taxProvider === 'taxjar') return Boolean(runtime.taxJarApiKeyConfigured);
  if (runtime.taxProvider === 'avalara') {
    return Boolean(runtime.avalaraAccountConfigured && runtime.avalaraLicenseKeyConfigured && runtime.avalaraCompanyCodeConfigured);
  }
  if (runtime.taxProvider === 'http') return hasHttpUrl(commerce.taxProviderUrl);
  return false;
};

const shippingReady = (runtime, settings) => {
  const commerce = configuredCommerceSettings(settings);
  const requiredProvider = requiredLocalShippingProvider();
  if (!externalBaseUrl && requireCertification && certifyShipping && !requiredProvider) return false;
  if (requiredProvider && runtime.shippingProvider !== requiredProvider && runtime.shippingLabelProvider !== requiredProvider) return false;
  if (runtime.shippingProvider === 'shippo' || runtime.shippingLabelProvider === 'shippo') return Boolean(runtime.shippoApiKeyConfigured);
  if (runtime.shippingProvider === 'easypost' || runtime.shippingLabelProvider === 'easypost') return Boolean(runtime.easyPostApiKeyConfigured);
  if (runtime.shippingProvider === 'http') return hasHttpUrl(commerce.shippingProviderUrl);
  return false;
};

const discountReady = (runtime, settings) => {
  const commerce = configuredCommerceSettings(settings);
  const requiredProvider = requiredLocalDiscountProvider();
  if (!externalBaseUrl && requireCertification && certifyDiscount && !requiredProvider) return false;
  if (requiredProvider && runtime.discountProvider !== requiredProvider) return false;
  if (runtime.discountProvider === 'stripe') return Boolean(runtime.stripeSecretConfigured);
  if (runtime.discountProvider === 'http') return hasHttpUrl(commerce.discountProviderUrl);
  return false;
};

const catalogReady = (runtime) => Boolean(
  (runtime.shopifyAdminAccessTokenConfigured && runtime.shopifyStoreConfigured) ||
  (runtime.bigCommerceAccessTokenConfigured && runtime.bigCommerceStoreConfigured) ||
  (runtime.wooCommerceConsumerKeyConfigured && runtime.wooCommerceConsumerSecretConfigured && runtime.wooCommerceStoreConfigured) ||
  (runtime.etsyAccessTokenConfigured && runtime.etsyApiKeyConfigured && runtime.etsyShopConfigured) ||
  (runtime.magentoAccessTokenConfigured && runtime.magentoStoreConfigured),
);

const requestedPaymentReady = (runtime) => {
  const requiredProvider = requiredPaymentProvider();
  if (requireCertification && certifyPayment && !requiredProvider) return false;
  return requiredProvider ? paymentProviderReady(runtime, requiredProvider) : paymentReady(runtime);
};

const requestedCatalogReady = (runtime, settings) => {
  const requiredProvider = requiredCatalogProvider();
  if (requireCertification && certifyCatalog && !requiredProvider) return false;
  return requiredProvider ? catalogProviderReady(runtime, settings, requiredProvider) : catalogReady(runtime);
};

const requestedSubscriptionReady = (runtime, settings) => {
  const requiredProvider = requiredSubscriptionProvider();
  if (requireCertification && certifySubscriptions && !requiredProvider) return false;
  return requiredProvider ? subscriptionProviderReady(runtime, settings, requiredProvider) : paymentReady(runtime);
};

const requestedWebhookReady = (runtime, settings) => {
  const requiredProvider = requiredWebhookProvider();
  const commerce = configuredCommerceSettings(settings);
  if (requireCertification && certifyWebhooks && !requiredProvider) return false;
  if (!runtime.webhookSecretConfigured || runtime.webhookSecretSource !== 'env') return false;
  if (!hasHttpUrl(commerce.providerWebhookUrl)) return false;
  if (!requiredProvider || requiredProvider === 'generic') return true;
  if (runtime.paymentProvider && runtime.paymentProvider !== requiredProvider) return false;
  return paymentProviderReady(runtime, requiredProvider);
};

const assertNoRawSecrets = (runtime) => {
  const serialized = JSON.stringify(runtime);
  assert(!RAW_SECRET_VALUE_PATTERN.test(serialized), 'Runtime commerce summary appears to expose a raw secret-like value.');
};

const assertNoRawSecretsInPayload = (payload, label) => {
  const serialized = JSON.stringify(payload);
  assert(
    !RAW_SECRET_VALUE_PATTERN.test(serialized),
    `${label} appears to expose a raw secret-like value.`,
  );
};

const assertCommerceProviderCertification = (commerce, label, expectedSiteId) => {
  const providerCertification = asRecord(asRecord(commerce).providerCertification);
  const runtime = asRecord(providerCertification.runtime);
  const operatorCommandTemplate = asRecord(providerCertification.operatorCommandTemplate);
  const operatorEnvTemplate = asRecord(providerCertification.operatorEnvTemplate);
  const targetInputs = Array.isArray(operatorCommandTemplate.targetInputs)
    ? operatorCommandTemplate.targetInputs
    : [];

  assert(
    providerCertification.schemaVersion === 'backy.commerce-provider-certification-handoff.v1',
    `${label} is missing commerce provider certification handoff: ${previewJson(commerce)}`,
  );
  assert(
    providerCertification.status === 'external-live-provider-gate',
    `${label} provider certification status drifted: ${previewJson(providerCertification)}`,
  );
  assert(
    providerCertification.localMockGate === 'ci:commerce-provider-smoke' &&
      providerCertification.liveCertificationGate === 'ci:commerce-provider-certification' &&
      providerCertification.requiredFor === 'live-commerce-provider-launch',
    `${label} provider certification gate metadata drifted: ${previewJson(providerCertification)}`,
  );
  assert(
    stringValue(providerCertification.secretHandling).includes('Provider credentials stay in server environment/configuration'),
    `${label} provider certification is missing the public no-secret boundary: ${previewJson(providerCertification)}`,
  );
  assert(
    operatorCommandTemplate.envTemplateSchemaVersion === 'backy.commerce-provider-certification-env-template.v1' &&
      Array.isArray(operatorCommandTemplate.requiredInputs) &&
      targetInputs.includes('BACKY_COMMERCE_CERTIFY_SITE_ID') &&
      targetInputs.includes('BACKY_COMMERCE_CERTIFICATION_OUTPUT=artifacts/backy-commerce-provider-certification.json') &&
      targetInputs.includes('BACKY_COMMERCE_CERTIFICATION_ARTIFACT_PATH or BACKY_COMMERCE_CERTIFICATION_ARTIFACT') &&
      targetInputs.includes('BACKY_COMMERCE_CERTIFICATION_ARTIFACT_REQUIRED=1 or BACKY_PROVIDER_CERTIFICATION_ARTIFACTS_REQUIRED=1') &&
      stringValue(operatorCommandTemplate.command).includes('BACKY_COMMERCE_CERTIFY_SITE_ID') &&
      stringValue(operatorCommandTemplate.command).includes('BACKY_COMMERCE_CERTIFICATION_OUTPUT') &&
      stringValue(operatorCommandTemplate.command).includes('BACKY_COMMERCE_CERTIFICATION_ARTIFACT_PATH="$BACKY_COMMERCE_CERTIFICATION_OUTPUT"') &&
      stringValue(operatorCommandTemplate.command).includes('BACKY_COMMERCE_CERTIFICATION_ARTIFACT_REQUIRED=1 npm run doctor:release-certification') &&
      stringValue(operatorCommandTemplate.envTemplate).includes('BACKY_COMMERCE_CERTIFY_SITE_ID=') &&
      stringValue(operatorCommandTemplate.envTemplate).includes('BACKY_COMMERCE_CERTIFICATION_OUTPUT=artifacts/backy-commerce-provider-certification.json') &&
      (!expectedSiteId || stringValue(operatorCommandTemplate.envTemplate).includes(expectedSiteId)),
    `${label} provider certification is missing operator command template inputs: ${previewJson(operatorCommandTemplate)}`,
  );
  assert(
    operatorEnvTemplate.schemaVersion === 'backy.commerce-provider-certification-env-template.v1' &&
      operatorEnvTemplate.fileName === '.env.backy-commerce-provider-certification' &&
      stringValue(operatorEnvTemplate.body).includes('BACKY_COMMERCE_CERTIFY_SITE_ID=') &&
      stringValue(operatorEnvTemplate.body).includes('BACKY_COMMERCE_CERTIFICATION_OUTPUT=artifacts/backy-commerce-provider-certification.json') &&
      (!expectedSiteId || stringValue(operatorEnvTemplate.body).includes(expectedSiteId)),
    `${label} provider certification is missing operator env template: ${previewJson(operatorEnvTemplate)}`,
  );
  assert(
    typeof runtime.paymentConfigured === 'boolean' &&
      typeof runtime.taxConfigured === 'boolean' &&
      typeof runtime.shippingConfigured === 'boolean' &&
      typeof runtime.catalogSyncConfigured === 'boolean' &&
      Array.isArray(runtime.configuredFamilies) &&
      Array.isArray(runtime.missingFamilies) &&
      stringValue(runtime.secretHandling).includes('Provider secret values are never returned'),
    `${label} provider certification is missing non-secret runtime readiness: ${previewJson(runtime)}`,
  );
  assertNoRawSecretsInPayload(providerCertification, `${label} provider certification handoff`);

  return providerCertification;
};

const firstCatalogProduct = async (baseUrl, siteId) => {
  const { response, payload } = await optionalRequestJson(baseUrl, `/api/sites/${encodeURIComponent(siteId)}/commerce/catalog?limit=1`);
  if (!response.ok || payload.success === false) {
    return { product: null, payload, status: response.status };
  }
  const products = Array.isArray(payload.data?.products)
    ? payload.data.products
    : Array.isArray(payload.products)
      ? payload.products
      : [];
  return {
    product: products[0] || null,
    payload,
    status: response.status,
  };
};

const assertProductProviderApiHandoff = async (baseUrl, siteId, required) => {
  const catalog = await firstCatalogProduct(baseUrl, siteId);
  const productId = stringValue(catalog.product?.id || catalog.product?.slug);
  if (!productId) {
    assert(
      !required,
      `Commerce product provider API handoff requires at least one public catalog product: ${JSON.stringify(catalog.payload).slice(0, 800)}`,
    );
    return {
      status: 'skipped',
      reason: 'no public catalog product available',
      catalogStatus: catalog.status,
    };
  }

  const payload = await requestJson(
    baseUrl,
    `/api/admin/sites/${encodeURIComponent(siteId)}/commerce/products/${encodeURIComponent(productId)}/provider-sync`,
  );
  const data = payload.data || payload;
  const providerCertification = data.providerCertification || payload.providerCertification;
  const storefrontHandoff = data.storefrontHandoff || payload.storefrontHandoff;
  const operatorEvidencePacket = asRecord(providerCertification?.operatorEvidencePacket);
  const operatorEvidenceTarget = asRecord(operatorEvidencePacket.target);
  const commandPreview = asRecord(operatorEvidencePacket.commandPreview);
  const commandPreviewTargetInputs = Array.isArray(commandPreview.targetInputs)
    ? commandPreview.targetInputs
    : [];

  assert(
    providerCertification?.schemaVersion === 'backy.commerce-provider-certification-handoff.v1',
    `Product provider-sync API is missing provider certification handoff: ${JSON.stringify(payload).slice(0, 900)}`,
  );
  assert(
    providerCertification.source === 'admin-product-provider-sync-api',
    `Product provider-sync API source drifted: ${JSON.stringify(providerCertification).slice(0, 900)}`,
  );
  assert(
    operatorEvidencePacket.schemaVersion === 'backy.commerce-provider-certification-evidence-packet.v1',
    `Product provider-sync API is missing operator evidence packet: ${JSON.stringify(providerCertification).slice(0, 900)}`,
  );
  assert(
    operatorEvidenceTarget.siteId === siteId &&
      operatorEvidenceTarget.siteSelectorEnv === 'BACKY_COMMERCE_CERTIFY_SITE_ID' &&
      commandPreviewTargetInputs.includes('BACKY_COMMERCE_CERTIFY_SITE_ID'),
    `Product provider-sync API operator evidence packet is not tied to ${siteId}: ${JSON.stringify(operatorEvidencePacket).slice(0, 900)}`,
  );
  assert(
    storefrontHandoff?.schemaVersion === 'backy.product-storefront-handoff.v1' &&
      storefrontHandoff.source === 'admin-product-provider-sync-api',
    `Product provider-sync API is missing storefront handoff: ${JSON.stringify(payload).slice(0, 900)}`,
  );
  assert(
    storefrontHandoff.designReadiness?.schemaVersion === 'backy.product-design-readiness.v1',
    `Product provider-sync API is missing custom frontend design readiness: ${JSON.stringify(storefrontHandoff).slice(0, 900)}`,
  );
  assertNoRawSecretsInPayload({ providerCertification, storefrontHandoff }, 'Product provider-sync API handoff');

  return {
    status: 'certified',
    productId,
    providerSchema: providerCertification.schemaVersion,
    productEvidenceSchema: providerCertification.certificationEvidence?.schemaVersion || null,
    packetSchema: operatorEvidencePacket.schemaVersion,
    targetSiteId: stringValue(operatorEvidenceTarget.siteId),
    siteSelectorEnv: stringValue(operatorEvidenceTarget.siteSelectorEnv),
    commandPreviewTargetInputsIncludeSiteSelector: commandPreviewTargetInputs.includes('BACKY_COMMERCE_CERTIFY_SITE_ID'),
    storefrontSchema: storefrontHandoff.schemaVersion,
    designReadinessStatus: storefrontHandoff.designReadiness.status,
  };
};

const assertOrderProviderApiHandoff = async (baseUrl, siteId) => {
  const payload = await requestJson(baseUrl, `/api/admin/sites/${encodeURIComponent(siteId)}/commerce/orders/analytics`);
  const data = payload.data || payload;
  const analytics = data.analytics;
  const providerCertification = data.providerCertification;
  const operatorEvidencePacket = asRecord(providerCertification?.operatorEvidencePacket);
  const operatorEvidenceTarget = asRecord(operatorEvidencePacket.target);
  const commandPreview = asRecord(operatorEvidencePacket.commandPreview);
  const commandPreviewTargetInputs = Array.isArray(commandPreview.targetInputs)
    ? commandPreview.targetInputs
    : [];

  assert(
    analytics?.schemaVersion === 'backy.order-analytics.v1',
    `Order analytics API is missing analytics schema: ${JSON.stringify(payload).slice(0, 900)}`,
  );
  assert(
    providerCertification?.schemaVersion === 'backy.commerce-provider-certification-handoff.v1',
    `Order analytics API is missing provider certification handoff: ${JSON.stringify(payload).slice(0, 900)}`,
  );
  assert(
    providerCertification.source === 'admin-order-analytics-api',
    `Order analytics API source drifted: ${JSON.stringify(providerCertification).slice(0, 900)}`,
  );
  assert(
    providerCertification.certificationEvidence?.schemaVersion === 'backy.order-provider-certification-evidence.v1',
    `Order analytics API is missing order provider scenario evidence: ${JSON.stringify(providerCertification).slice(0, 900)}`,
  );
  assert(
    operatorEvidencePacket.schemaVersion === 'backy.order-provider-certification-evidence-packet.v1',
    `Order analytics API is missing order operator evidence packet: ${JSON.stringify(providerCertification).slice(0, 900)}`,
  );
  assert(
    operatorEvidenceTarget.siteId === siteId &&
      operatorEvidenceTarget.siteSelectorEnv === 'BACKY_COMMERCE_CERTIFY_SITE_ID' &&
      commandPreviewTargetInputs.includes('BACKY_COMMERCE_CERTIFY_SITE_ID'),
    `Order analytics API operator evidence packet is not tied to ${siteId}: ${JSON.stringify(operatorEvidencePacket).slice(0, 900)}`,
  );
  assertNoRawSecretsInPayload({ analytics, providerCertification }, 'Order analytics provider certification handoff');

  return {
    status: 'certified',
    analyticsSchema: analytics.schemaVersion,
    providerSchema: providerCertification.schemaVersion,
    orderEvidenceSchema: providerCertification.certificationEvidence.schemaVersion,
    packetSchema: operatorEvidencePacket.schemaVersion,
    targetSiteId: stringValue(operatorEvidenceTarget.siteId),
    siteSelectorEnv: stringValue(operatorEvidenceTarget.siteSelectorEnv),
    commandPreviewTargetInputsIncludeSiteSelector: commandPreviewTargetInputs.includes('BACKY_COMMERCE_CERTIFY_SITE_ID'),
    orderCount: Number(analytics.orderCount || analytics.counts?.orders || analytics.orders?.count || 0),
  };
};

const assertPublicCommerceApiHandoffs = async (baseUrl, siteId) => {
  const encodedSiteId = encodeURIComponent(siteId);
  const manifestPayload = await requestJson(baseUrl, `/api/sites/${encodedSiteId}/manifest`);
  const manifestCommerce = manifestPayload.data?.modules?.commerce;
  const manifestCommerceRuntime = asRecord(manifestPayload.data?.modules?.commerceRuntime);
  const manifestCertification = assertCommerceProviderCertification(manifestCommerce, 'Public manifest commerce module', siteId);

  assert(
    asRecord(manifestCommerceRuntime.schemas).providerCertification === 'backy.commerce-provider-certification-handoff.v1',
    `Public manifest commerce runtime is missing provider certification schema: ${previewJson(manifestCommerceRuntime)}`,
  );
  assert(
    typeof asRecord(manifestCommerceRuntime.endpoints).catalog === 'string' &&
      typeof asRecord(manifestCommerceRuntime.endpoints).orderContract === 'string',
    `Public manifest commerce runtime is missing catalog/order contract endpoints: ${previewJson(manifestCommerceRuntime)}`,
  );

  const catalogPayload = await requestJson(baseUrl, `/api/sites/${encodedSiteId}/commerce/catalog?limit=1`);
  const catalogData = catalogPayload.data || {};
  assert(
    catalogData.schemaVersion === 'backy.commerce-catalog.v1',
    `Public commerce catalog API schema drifted: ${previewJson(catalogPayload)}`,
  );
  const catalogCertification = assertCommerceProviderCertification(catalogData.commerce, 'Public commerce catalog', siteId);

  const ordersPayload = await requestJson(baseUrl, `/api/sites/${encodedSiteId}/commerce/orders`);
  const ordersData = ordersPayload.data || {};
  assert(
    ordersData.schemaVersion === 'backy.commerce-orders.v1',
    `Public commerce order contract API schema drifted: ${previewJson(ordersPayload)}`,
  );
  const orderCertification = assertCommerceProviderCertification(ordersData.commerce, 'Public commerce order contract', siteId);

  assertNoRawSecretsInPayload({
    manifestCommerce,
    manifestCommerceRuntime,
    catalogCommerce: catalogData.commerce,
    ordersCommerce: ordersData.commerce,
  }, 'Public commerce API handoffs');

  return {
    status: 'certified',
    manifestProviderSchema: manifestCertification.schemaVersion,
    runtimeProviderSchema: manifestCommerceRuntime.schemas.providerCertification,
    catalogSchema: catalogData.schemaVersion,
    catalogProviderSchema: catalogCertification.schemaVersion,
    catalogProductCount: Array.isArray(catalogData.products) ? catalogData.products.length : 0,
    orderContractSchema: ordersData.schemaVersion,
    orderProviderSchema: orderCertification.schemaVersion,
  };
};

const assertCommerceApiHandoffs = async (baseUrl) => {
  const siteId = process.env.BACKY_COMMERCE_CERTIFY_SITE_ID || 'site-demo';
  const productRequired = requireCertification && (certifyCatalog || certifyPayment || certifySubscriptions);
  const orderRequired = requireCertification && (certifyPayment || certifyTax || certifyShipping || certifyDiscount || certifySubscriptions || certifyWebhooks);
  const publicApis = await assertPublicCommerceApiHandoffs(baseUrl, siteId);
  const product = (productRequired || !externalBaseUrl)
    ? await assertProductProviderApiHandoff(baseUrl, siteId, productRequired)
    : { status: 'skipped', reason: 'product API handoff not requested for this external provider family set' };
  const orders = orderRequired || !externalBaseUrl
    ? await assertOrderProviderApiHandoff(baseUrl, siteId)
    : { status: 'skipped', reason: 'order API handoff not requested for this external provider family set' };

  return {
    siteId,
    publicApis,
    product,
    orders,
  };
};

const writeCertificationOutput = async (payload) => {
  if (!certificationOutputPath) return;
  const outputPath = path.isAbsolute(certificationOutputPath)
    ? certificationOutputPath
    : path.join(rootPath, certificationOutputPath);
  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
};

const buildReadiness = (runtime, settings) => ({
  payment: requestedPaymentReady(runtime),
  tax: taxReady(runtime, settings),
  shipping: shippingReady(runtime, settings),
  discount: discountReady(runtime, settings),
  catalog: requestedCatalogReady(runtime, settings),
  subscriptions: requestedSubscriptionReady(runtime, settings),
  webhooks: requestedWebhookReady(runtime, settings),
});

const main = async () => {
  await runPreflight();

  const server = await startPublicServer();
  try {
    const settingsPayload = await requestJson(server.baseUrl, '/api/admin/settings');
    const settings = await prepareLocalCertificationSettings(server.baseUrl, settingsPayload.data?.settings || {});
    const preparedRuntime = settings?.runtimeCommerce;
    assert(preparedRuntime && typeof preparedRuntime === 'object', `Settings response is missing runtimeCommerce: ${JSON.stringify(settings).slice(0, 800)}`);
    assertNoRawSecrets(preparedRuntime);

    const diagnostics = await postSettingsAction(server.baseUrl, {
      action: 'validate-infrastructure',
      deliveryMode: settings.deliveryMode || 'custom-frontend',
      integrations: settings.integrations || {},
      recordHistory: true,
    });
    assert(Array.isArray(diagnostics.diagnostics), `Infrastructure diagnostics payload is missing diagnostics: ${JSON.stringify(diagnostics).slice(0, 800)}`);
    const commerceDiagnostics = diagnostics.diagnostics.find((group) => group.area === 'commerce');
    assert(
      commerceDiagnostics && Array.isArray(commerceDiagnostics.checks) && commerceDiagnostics.checks.length > 0,
      `Infrastructure diagnostics are missing commerce provider checks: ${JSON.stringify(diagnostics.diagnostics).slice(0, 1200)}`,
    );

    const readiness = buildReadiness(preparedRuntime, settings);
    const requested = {
      payment: certifyPayment,
      tax: certifyTax,
      shipping: certifyShipping,
      discount: certifyDiscount,
      catalog: certifyCatalog,
      subscriptions: certifySubscriptions,
      webhooks: certifyWebhooks,
    };
    const failures = Object.entries(requested)
      .filter(([, enabled]) => enabled)
      .filter(([key]) => !readiness[key])
      .map(([key]) => providerLabels[key] || key);

    if (requireCertification) {
      assert(failures.length === 0, `Commerce provider certification failed readiness checks: ${failures.join(', ')}`);
    }

    const apiHandoffs = await assertCommerceApiHandoffs(server.baseUrl);

    const certificationPayload = {
      ok: true,
      contract: 'backy.commerce-provider-certification.v1',
      certifiedAt,
      artifact: {
        schemaVersion: 'backy.commerce-provider-certification-artifact.v1',
        outputPathConfigured: Boolean(certificationOutputPath),
        fileName: path.basename(certificationOutputPath || 'backy-commerce-provider-certification.json'),
        secretHandling: 'Certification artifacts contain provider names, readiness booleans, target mode, non-secret runtime selections, and diagnostic counts only; admin keys, external target URLs, provider credentials, payment references, webhook bodies, and customer/order payloads stay in CI secrets or runtime logs.',
      },
      required: requireCertification,
      target: {
        mode: externalBaseUrl ? 'external' : 'local',
        externalBaseUrlConfigured: Boolean(externalBaseUrl),
        siteId,
        siteSelectorEnv: 'BACKY_COMMERCE_CERTIFY_SITE_ID',
      },
      requested,
      readiness,
      requestedProviders: {
        payment: requestedPaymentProvider,
        tax: requestedTaxProvider,
        shipping: requestedShippingProvider,
        discount: requestedDiscountProvider,
        catalog: requestedCatalogProvider,
        subscriptions: requestedSubscriptionProvider,
        webhooks: requestedWebhookProvider,
      },
      certified: Object.entries(requested)
        .filter(([key, enabled]) => enabled && readiness[key])
        .map(([key]) => key),
      runtime: {
        paymentProvider: preparedRuntime.paymentProvider,
        taxProvider: preparedRuntime.taxProvider,
        shippingProvider: preparedRuntime.shippingProvider,
        shippingLabelProvider: preparedRuntime.shippingLabelProvider,
        discountProvider: preparedRuntime.discountProvider,
        webhookSecretSource: preparedRuntime.webhookSecretSource,
        missing: preparedRuntime.missing || [],
      },
      diagnostics: {
        groups: diagnostics.diagnostics.length,
        commerceGroup: commerceDiagnostics.checks.length,
      },
      apiHandoffs,
    };
    assertNoRawSecretsInPayload(certificationPayload, 'Commerce provider certification artifact');
    assertNoForbiddenArtifactFields(certificationPayload, 'Commerce provider certification artifact');
    await writeCertificationOutput(certificationPayload);
    console.log(JSON.stringify(certificationPayload));
  } finally {
    await stopProcess(server.childProcess);
  }
};

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
