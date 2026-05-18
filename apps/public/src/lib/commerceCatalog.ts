type CommerceRecordStatus = 'draft' | 'published' | 'scheduled' | 'archived';

export interface CommerceSourceCollection {
  permissions: {
    publicRead: boolean;
  };
}

export interface CommerceSourceRecord {
  id: string;
  slug: string;
  status: CommerceRecordStatus;
  values: Record<string, unknown>;
  updatedAt: string;
  publishedAt?: string | null;
  scheduledAt?: string | null;
}

export interface CommerceProduct {
  id: string;
  slug: string;
  status: CommerceRecordStatus;
  title: string;
  sku: string;
  description: string;
  seoTitle: string;
  price: number;
  compareAtPrice: number | null;
  currency: string;
  imageUrl: string;
  galleryImages: string[];
  variants: CommerceProductVariant[];
  category: string;
  tags: string[];
  vendor: string;
  featured: boolean;
  productType: 'physical' | 'digital' | 'service';
  inventory: {
    quantity: number;
    lowStockThreshold: number;
    policy: 'deny' | 'continue' | 'preorder';
    inStock: boolean;
    lowStock: boolean;
  };
  delivery: {
    shippingRequired: boolean;
    taxable: boolean;
    weight: number | null;
    shippingProfile: string;
    taxClass: string;
    returnPolicy: string;
    hasDigitalDelivery: boolean;
  };
  checkout: {
    mode: 'external-url' | 'not-configured';
    url: string | null;
    enabled: boolean;
    discountCode: string;
  };
  subscription: {
    enabled: boolean;
    interval: 'weekly' | 'monthly' | 'quarterly' | 'yearly';
    trialDays: number;
  };
  design?: {
    templateId?: string;
    templateName?: string;
    source?: Record<string, unknown>;
    bindingHints?: Array<Record<string, unknown>>;
    routePattern?: string;
    tokens?: Record<string, unknown>;
    chrome?: Record<string, unknown>;
    customCss?: string;
    frontendDesignTemplateId?: string;
    frontendDesignTemplateName?: string;
    frontendDesignSource?: Record<string, unknown>;
    frontendDesignBindingHints?: Array<Record<string, unknown>>;
    frontendDesignRoutePattern?: string;
    frontendDesignTokens?: Record<string, unknown>;
    frontendDesignChrome?: Record<string, unknown>;
    frontendDesignCustomCss?: string;
  };
  links: {
    storefrontPath: string;
  };
  updatedAt: string;
  publishedAt: string | null;
}

export interface CommerceProductVariant {
  id: string;
  title: string;
  sku: string;
  option: string;
  price: number | null;
  inventory: number | null;
  inStock: boolean;
}

export interface CommerceCatalogFilters {
  search?: string;
  category?: string;
  tag?: string;
  vendor?: string;
  productType?: string;
  featured?: boolean;
}

export interface CommerceCatalogFacets {
  categories: Array<{ value: string; count: number }>;
  tags: Array<{ value: string; count: number }>;
  vendors: Array<{ value: string; count: number }>;
  productTypes: Array<{ value: string; count: number }>;
}

export interface CommerceStorefrontContract {
  schemaVersion: 'backy.commerce-settings.v1';
  mode: 'catalog-only' | 'manual-orders' | 'checkout-provider';
  currency: string;
  paymentProvider: 'none' | 'stripe' | 'paypal' | 'paddle' | 'square' | 'adyen' | 'mollie' | 'razorpay' | 'manual';
  providerAccountId: string | null;
  provider: {
    mode: 'test' | 'live';
    accountId: string | null;
    webhookConfigured: boolean;
    webhookEndpointUrl: string | null;
  };
  capabilities: {
    catalog: boolean;
    orderIntake: boolean;
    providerCheckout: boolean;
  };
  checkout: {
    catalogUrl: string;
    orderIntakeUrl: string;
    successPath: string;
    cancelPath: string;
    guestCheckout: boolean;
  };
  pricing: {
    taxes: boolean;
    shipping: boolean;
    discounts: boolean;
    rules: {
      taxRatePercent: number;
      digitalTaxRatePercent: number;
      shippingBaseAmount: number;
      shippingWeightRate: number;
      discountPercent: number;
    };
  };
  inventory: {
    reservations: boolean;
    reservationMinutes: number;
  };
  webhooks: {
    eventsEnabled: boolean;
    endpointConfigured: boolean;
    eventAllowlist: string[];
  };
  reconciliation: {
    mode: 'manual' | 'webhook' | 'scheduled';
    windowHours: number;
    requiresManualReview: boolean;
  };
  providerCertification: {
    schemaVersion: 'backy.commerce-provider-certification-handoff.v1';
    status: 'external-live-provider-gate';
    localMockGate: 'ci:commerce-provider-smoke';
    liveCertificationGate: 'ci:commerce-provider-certification';
    requiredFor: 'live-commerce-provider-launch';
    secretHandling: string;
    groups: Array<{
      family: string;
      providers: string[];
      gate: 'ci:commerce-provider-certification' | 'ci:commerce-provider-smoke';
      requiredInputs: string[];
      evidence: string;
    }>;
  };
}

export const PRODUCT_COLLECTION_SLUG = 'products';

const COMMERCE_PRODUCT_VALUE_KEYS = {
  title: 'title',
  sku: 'sku',
  variants: 'variants',
  price: 'price',
  compareAtPrice: 'compareatprice',
  currency: 'currency',
  inventory: 'inventory',
  lowStockThreshold: 'lowstockthreshold',
  inventoryPolicy: 'inventorypolicy',
  productType: 'producttype',
  downloadUrl: 'downloadurl',
  checkoutUrl: 'checkouturl',
  subscriptionEnabled: 'subscriptionenabled',
  subscriptionInterval: 'subscriptioninterval',
  subscriptionTrialDays: 'subscriptiontrialdays',
  shippingRequired: 'shippingrequired',
  shippingProfile: 'shippingprofile',
  weight: 'weight',
  taxClass: 'taxclass',
  discountCode: 'discountcode',
  returnPolicy: 'returnpolicy',
  imageUrl: 'imageurl',
  galleryImages: 'galleryimages',
  category: 'category',
  tags: 'tags',
  vendor: 'vendor',
  description: 'description',
  seoTitle: 'seotitle',
  featured: 'featured',
  taxable: 'taxable',
} as const;

type CommerceProductValueKey = keyof typeof COMMERCE_PRODUCT_VALUE_KEYS;

const readProductValue = (
  values: Record<string, unknown>,
  key: CommerceProductValueKey,
  fallback?: unknown,
): unknown => {
  const normalizedKey = COMMERCE_PRODUCT_VALUE_KEYS[key];
  if (Object.prototype.hasOwnProperty.call(values, normalizedKey)) return values[normalizedKey];
  if (Object.prototype.hasOwnProperty.call(values, key)) return values[key];
  return fallback;
};

const normalizeText = (value: unknown): string => (
  typeof value === 'string' ? value.trim() : ''
);

const normalizeIdentifier = (value: unknown): string => (
  normalizeText(value).toLowerCase()
);

const normalizeNumber = (value: unknown, fallback = 0): number => {
  const number = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(number) ? number : fallback;
};

const normalizeCurrency = (value: unknown): string => {
  const currency = normalizeText(value).toUpperCase();
  return /^[A-Z]{3}$/.test(currency) ? currency : 'USD';
};

const toRecord = (value: unknown): Record<string, unknown> => (
  value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
);

const normalizeBoolean = (value: unknown, fallback = false): boolean => (
  typeof value === 'boolean' ? value : fallback
);

const normalizeCommerceMode = (value: unknown): CommerceStorefrontContract['mode'] => {
  const mode = normalizeIdentifier(value);
  return mode === 'manual-orders' || mode === 'checkout-provider' ? mode : 'catalog-only';
};

const normalizePaymentProvider = (value: unknown): CommerceStorefrontContract['paymentProvider'] => {
  const provider = normalizeIdentifier(value);
  return ['stripe', 'paypal', 'paddle', 'square', 'adyen', 'mollie', 'razorpay', 'manual'].includes(provider)
    ? provider as CommerceStorefrontContract['paymentProvider']
    : 'none';
};

const normalizeProviderMode = (value: unknown): CommerceStorefrontContract['provider']['mode'] => (
  normalizeIdentifier(value) === 'live' ? 'live' : 'test'
);

const normalizeReconciliationMode = (value: unknown): CommerceStorefrontContract['reconciliation']['mode'] => {
  const mode = normalizeIdentifier(value);
  return mode === 'webhook' || mode === 'scheduled' ? mode : 'manual';
};

const normalizeRelativePath = (value: unknown, fallback: string): string => {
  const path = normalizeText(value);
  return path.startsWith('/') ? path : fallback;
};

const normalizePercent = (value: unknown, fallback: number): number => (
  Math.max(0, Math.min(100, normalizeNumber(value, fallback)))
);

const normalizeNonNegative = (value: unknown, fallback: number): number => (
  Math.max(0, normalizeNumber(value, fallback))
);

const normalizeEventAllowlist = (value: unknown): string[] => {
  const raw = Array.isArray(value) ? value : normalizeText(value).split(',');
  return raw
    .map((item) => normalizeText(item))
    .filter(Boolean)
    .filter((event, index, events) => events.indexOf(event) === index)
    .slice(0, 24);
};

const commerceProviderCertification = (): CommerceStorefrontContract['providerCertification'] => ({
  schemaVersion: 'backy.commerce-provider-certification-handoff.v1',
  status: 'external-live-provider-gate',
  localMockGate: 'ci:commerce-provider-smoke',
  liveCertificationGate: 'ci:commerce-provider-certification',
  requiredFor: 'live-commerce-provider-launch',
  secretHandling: 'Provider credentials stay in server environment/configuration; storefront contracts expose only non-secret readiness gates and provider-family requirements.',
  groups: [
    {
      family: 'Checkout and payment settlement',
      providers: ['Stripe checkout', 'Stripe webhooks', 'PayPal', 'Square', 'Adyen', 'Mollie', 'Razorpay'],
      gate: 'ci:commerce-provider-certification',
      requiredInputs: [
        'BACKY_STRIPE_SECRET_KEY or STRIPE_SECRET_KEY',
        'BACKY_PAYPAL_ACCESS_TOKEN or PAYPAL_ACCESS_TOKEN',
        'BACKY_SQUARE_ACCESS_TOKEN or SQUARE_ACCESS_TOKEN',
        'BACKY_ADYEN_API_KEY or ADYEN_API_KEY',
        'BACKY_MOLLIE_API_KEY or MOLLIE_API_KEY',
        'BACKY_RAZORPAY_KEY_ID/BACKY_RAZORPAY_KEY_SECRET or RAZORPAY_KEY_ID/RAZORPAY_KEY_SECRET',
        'BACKY_COMMERCE_WEBHOOK_SECRET or COMMERCE_WEBHOOK_SECRET',
      ],
      evidence: 'Live payment credentials, signed webhook secrets, and provider settlement events.',
    },
    {
      family: 'Tax quote providers',
      providers: ['Stripe Tax', 'TaxJar', 'Avalara', 'HTTP'],
      gate: 'ci:commerce-provider-certification',
      requiredInputs: [
        'BACKY_STRIPE_SECRET_KEY or STRIPE_SECRET_KEY',
        'BACKY_TAXJAR_API_KEY or TAXJAR_API_KEY',
        'BACKY_AVALARA_ACCOUNT_ID/AVALARA_ACCOUNT_ID plus license and company code',
        'BACKY_COMMERCE_TAX_PROVIDER_URL or COMMERCE_TAX_PROVIDER_URL',
      ],
      evidence: 'Live tax account credentials or a selected HTTP tax quote endpoint.',
    },
    {
      family: 'Shipping rate, label, and tracking providers',
      providers: ['EasyPost', 'Shippo', 'HTTP'],
      gate: 'ci:commerce-provider-certification',
      requiredInputs: [
        'BACKY_EASYPOST_API_KEY or EASYPOST_API_KEY',
        'BACKY_SHIPPO_API_KEY or SHIPPO_API_KEY',
        'BACKY_COMMERCE_SHIPPING_PROVIDER_URL or COMMERCE_SHIPPING_PROVIDER_URL',
      ],
      evidence: 'Live carrier rate, label, void/refund, and tracking credentials.',
    },
    {
      family: 'Discount quote providers',
      providers: ['Stripe promotion codes', 'HTTP'],
      gate: 'ci:commerce-provider-certification',
      requiredInputs: [
        'BACKY_STRIPE_SECRET_KEY or STRIPE_SECRET_KEY',
        'configured Settings commerce discount provider endpoint',
      ],
      evidence: 'Live promotion-code lookup credentials or selected HTTP discount endpoint.',
    },
    {
      family: 'Catalog sync providers',
      providers: ['Stripe', 'PayPal', 'Paddle', 'Square', 'Shopify', 'BigCommerce', 'WooCommerce', 'Etsy', 'Magento', 'HTTP'],
      gate: 'ci:commerce-provider-certification',
      requiredInputs: [
        'BACKY_STRIPE_SECRET_KEY or STRIPE_SECRET_KEY',
        'BACKY_PAYPAL_ACCESS_TOKEN or PAYPAL_ACCESS_TOKEN',
        'BACKY_PADDLE_API_KEY or PADDLE_API_KEY',
        'BACKY_SHOPIFY_ADMIN_ACCESS_TOKEN or SHOPIFY_ADMIN_ACCESS_TOKEN',
        'BACKY_BIGCOMMERCE_ACCESS_TOKEN or BIGCOMMERCE_ACCESS_TOKEN',
        'BACKY_WOOCOMMERCE_CONSUMER_KEY/SECRET or WOOCOMMERCE_CONSUMER_KEY/SECRET',
        'BACKY_ETSY_ACCESS_TOKEN or ETSY_ACCESS_TOKEN',
        'BACKY_MAGENTO_ACCESS_TOKEN or MAGENTO_ACCESS_TOKEN',
        'BACKY_COMMERCE_PRODUCT_SYNC_URL or COMMERCE_PRODUCT_SYNC_URL',
      ],
      evidence: 'Live catalog credentials or a selected HTTP product sync endpoint.',
    },
    {
      family: 'Subscription lifecycle providers',
      providers: ['Stripe', 'PayPal', 'Paddle', 'Square', 'Adyen', 'Mollie', 'HTTP', 'Manual handoff'],
      gate: 'ci:commerce-provider-certification',
      requiredInputs: [
        'BACKY_STRIPE_SECRET_KEY or STRIPE_SECRET_KEY',
        'BACKY_PAYPAL_ACCESS_TOKEN or PAYPAL_ACCESS_TOKEN',
        'BACKY_PADDLE_API_KEY or PADDLE_API_KEY',
        'BACKY_SQUARE_ACCESS_TOKEN or SQUARE_ACCESS_TOKEN',
        'BACKY_ADYEN_API_KEY or ADYEN_API_KEY',
        'BACKY_MOLLIE_API_KEY or MOLLIE_API_KEY',
        'BACKY_COMMERCE_SUBSCRIPTION_ACTION_URL or COMMERCE_SUBSCRIPTION_ACTION_URL',
      ],
      evidence: 'Live subscription pause, resume, cancel, webhook, renewal, dunning, and cancellation evidence.',
    },
    {
      family: 'Mock provider regression',
      providers: ['Local provider mocks'],
      gate: 'ci:commerce-provider-smoke',
      requiredInputs: ['No live provider credentials required'],
      evidence: 'Repeatable checkout, quote, catalog, label, tracking, fulfillment, refund, webhook, and reconciliation coverage without live credentials.',
    },
  ],
});

export const buildCommerceStorefrontContract = ({
  siteId,
  settings,
  hasCatalog,
  hasOrderIntake,
}: {
  siteId: string;
  settings?: unknown;
  hasCatalog: boolean;
  hasOrderIntake: boolean;
}): CommerceStorefrontContract => {
  const commerce = toRecord(settings);
  const mode = normalizeCommerceMode(commerce.mode);
  const paymentProvider = normalizePaymentProvider(commerce.paymentProvider);
  const providerCheckout = mode === 'checkout-provider' && paymentProvider !== 'none';
  const reservationMinutes = Math.max(1, Math.min(1440, Math.round(normalizeNumber(commerce.reservationMinutes, 15))));
  const providerWebhookUrl = normalizeText(commerce.providerWebhookUrl);
  const providerWebhookSecretId = normalizeText(commerce.providerWebhookSecretId);
  const eventsEnabled = normalizeBoolean(commerce.webhookEventsEnabled);
  const reconciliationMode = normalizeReconciliationMode(commerce.reconciliationMode);

  return {
    schemaVersion: 'backy.commerce-settings.v1',
    mode,
    currency: normalizeCurrency(commerce.currency),
    paymentProvider,
    providerAccountId: normalizeText(commerce.providerAccountId) || null,
    provider: {
      mode: normalizeProviderMode(commerce.providerMode),
      accountId: normalizeText(commerce.providerAccountId) || null,
      webhookConfigured: Boolean(providerWebhookUrl && providerWebhookSecretId),
      webhookEndpointUrl: providerWebhookUrl || null,
    },
    capabilities: {
      catalog: hasCatalog,
      orderIntake: hasOrderIntake,
      providerCheckout,
    },
    checkout: {
      catalogUrl: `/api/sites/${siteId}/commerce/catalog`,
      orderIntakeUrl: `/api/sites/${siteId}/commerce/orders`,
      successPath: normalizeRelativePath(commerce.checkoutSuccessPath, '/checkout/success'),
      cancelPath: normalizeRelativePath(commerce.checkoutCancelPath, '/checkout/cancel'),
      guestCheckout: normalizeBoolean(commerce.guestCheckout, true),
    },
    pricing: {
      taxes: normalizeBoolean(commerce.taxEnabled),
      shipping: normalizeBoolean(commerce.shippingEnabled),
      discounts: normalizeBoolean(commerce.discountsEnabled),
      rules: {
        taxRatePercent: normalizePercent(commerce.taxRatePercent, 8.25),
        digitalTaxRatePercent: normalizePercent(commerce.digitalTaxRatePercent, 6),
        shippingBaseAmount: normalizeNonNegative(commerce.shippingBaseAmount, 8),
        shippingWeightRate: normalizeNonNegative(commerce.shippingWeightRate, 1.25),
        discountPercent: normalizePercent(commerce.discountPercent, 10),
      },
    },
    inventory: {
      reservations: normalizeBoolean(commerce.inventoryReservations, true),
      reservationMinutes,
    },
    webhooks: {
      eventsEnabled,
      endpointConfigured: Boolean(providerWebhookUrl),
      eventAllowlist: normalizeEventAllowlist(commerce.providerWebhookEvents),
    },
    reconciliation: {
      mode: reconciliationMode,
      windowHours: Math.max(1, Math.min(720, Math.round(normalizeNumber(commerce.reconciliationWindowHours, 24)))),
      requiresManualReview: reconciliationMode === 'manual' || !eventsEnabled,
    },
    providerCertification: commerceProviderCertification(),
  };
};

const normalizeTags = (value: unknown): string[] => {
  if (Array.isArray(value)) {
    return value.map((item) => normalizeText(item)).filter(Boolean);
  }

  return normalizeText(value)
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
};

const normalizeUrlList = (value: unknown, limit = 12): string[] => {
  if (Array.isArray(value)) {
    return value
      .map((item) => normalizeText(item))
      .filter(Boolean)
      .filter((url, index, urls) => urls.indexOf(url) === index)
      .slice(0, limit);
  }

  return normalizeText(value)
    .split(/\r?\n|,/g)
    .map((item) => item.trim())
    .filter(Boolean)
    .filter((url, index, urls) => urls.indexOf(url) === index)
    .slice(0, limit);
};

const parseJsonArray = (value: string): unknown[] => {
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

const normalizeVariants = (value: unknown, limit = 50): CommerceProductVariant[] => {
  const source = typeof value === 'string'
    ? parseJsonArray(value)
    : Array.isArray(value)
      ? value
      : [];

  return source
    .map((item, index) => {
      if (!item || typeof item !== 'object' || Array.isArray(item)) {
        return null;
      }

      const record = item as Record<string, unknown>;
      const title = normalizeText(record.title || record.name || record.option);
      const option = normalizeText(record.option);
      const sku = normalizeText(record.sku);
      const price = maybeNumber(record.price);
      const inventory = maybeNumber(record.inventory);

      if (!title && !option && !sku) {
        return null;
      }

      return {
        id: normalizeText(record.id) || `variant-${index + 1}`,
        title: title || option || sku,
        sku,
        option,
        price,
        inventory,
        inStock: inventory === null || inventory > 0,
      };
    })
    .filter((variant): variant is CommerceProductVariant => Boolean(variant))
    .slice(0, limit);
};

const normalizeProductType = (value: unknown): CommerceProduct['productType'] => {
  const productType = normalizeIdentifier(value);
  return productType === 'digital' || productType === 'service' ? productType : 'physical';
};

const normalizeInventoryPolicy = (value: unknown): CommerceProduct['inventory']['policy'] => {
  const policy = normalizeIdentifier(value);
  return policy === 'continue' || policy === 'preorder' ? policy : 'deny';
};

const normalizeSubscriptionInterval = (value: unknown): CommerceProduct['subscription']['interval'] => {
  const interval = normalizeIdentifier(value);
  return interval === 'weekly' || interval === 'quarterly' || interval === 'yearly' ? interval : 'monthly';
};

const maybeNumber = (value: unknown): number | null => {
  if (value === null || value === undefined || value === '') return null;
  const number = normalizeNumber(value, Number.NaN);
  return Number.isFinite(number) ? number : null;
};

const isRecord = (value: unknown): value is Record<string, unknown> => (
  Boolean(value) && typeof value === 'object' && !Array.isArray(value)
);

const normalizeRecordArray = (value: unknown): Array<Record<string, unknown>> | undefined => {
  if (!Array.isArray(value)) return undefined;
  const records = value.filter(isRecord);
  return records.length > 0 ? records : undefined;
};

const normalizeDesignRecord = (value: unknown): Record<string, unknown> | undefined => (
  isRecord(value) ? value : undefined
);

const buildProductDesignContract = (values: Record<string, unknown>): CommerceProduct['design'] => {
  const templateId = normalizeText(values.frontendDesignTemplateId);
  const templateName = normalizeText(values.frontendDesignTemplateName);
  const source = normalizeDesignRecord(values.frontendDesignSource);
  const bindingHints = normalizeRecordArray(values.frontendDesignBindingHints);
  const routePattern = normalizeText(values.frontendDesignRoutePattern);
  const tokens = normalizeDesignRecord(values.frontendDesignTokens);
  const chrome = normalizeDesignRecord(values.frontendDesignChrome);
  const customCss = normalizeText(values.frontendDesignCustomCss);

  if (!templateId && !templateName && !source && !bindingHints && !routePattern && !tokens && !chrome && !customCss) {
    return undefined;
  }

  return {
    ...(templateId ? { templateId } : {}),
    ...(templateName ? { templateName } : {}),
    ...(source ? { source } : {}),
    ...(bindingHints ? { bindingHints } : {}),
    ...(routePattern ? { routePattern } : {}),
    ...(tokens ? { tokens } : {}),
    ...(chrome ? { chrome } : {}),
    ...(customCss ? { customCss } : {}),
    ...(templateId ? { frontendDesignTemplateId: templateId } : {}),
    ...(templateName ? { frontendDesignTemplateName: templateName } : {}),
    ...(source ? { frontendDesignSource: source } : {}),
    ...(bindingHints ? { frontendDesignBindingHints: bindingHints } : {}),
    ...(routePattern ? { frontendDesignRoutePattern: routePattern } : {}),
    ...(tokens ? { frontendDesignTokens: tokens } : {}),
    ...(chrome ? { frontendDesignChrome: chrome } : {}),
    ...(customCss ? { frontendDesignCustomCss: customCss } : {}),
  };
};

export const isCommerceSourceRecord = (record: unknown): record is CommerceSourceRecord => {
  if (!record || typeof record !== 'object') return false;
  const candidate = record as Partial<CommerceSourceRecord>;
  const scheduledAt = typeof candidate.scheduledAt === 'string' ? Date.parse(candidate.scheduledAt) : null;
  const isPubliclyReadable = candidate.status === 'published' || (
    candidate.status === 'scheduled' &&
    scheduledAt !== null &&
    Number.isFinite(scheduledAt) &&
    scheduledAt <= Date.now()
  );

  return (
    typeof candidate.id === 'string' &&
    typeof candidate.slug === 'string' &&
    isPubliclyReadable &&
    candidate.values !== null &&
    typeof candidate.values === 'object' &&
    !Array.isArray(candidate.values)
  );
};

export const productRecordToCommerceProduct = (record: CommerceSourceRecord): CommerceProduct => {
  const values = record.values;
  const productType = normalizeProductType(readProductValue(values, 'productType'));
  const quantity = Math.max(0, normalizeNumber(readProductValue(values, 'inventory')));
  const lowStockThreshold = Math.max(0, normalizeNumber(readProductValue(values, 'lowStockThreshold'), 5));
  const inventoryPolicy = normalizeInventoryPolicy(readProductValue(values, 'inventoryPolicy'));
  const checkoutUrl = normalizeText(readProductValue(values, 'checkoutUrl'));
  const hasDigitalDelivery = productType === 'digital' && normalizeText(readProductValue(values, 'downloadUrl')).length > 0;
  const shippingRequiredValue = readProductValue(values, 'shippingRequired');
  const taxableValue = readProductValue(values, 'taxable');

  return {
    id: record.id,
    slug: record.slug,
    status: record.status,
    title: normalizeText(readProductValue(values, 'title')) || record.slug,
    sku: normalizeText(readProductValue(values, 'sku')),
    description: normalizeText(readProductValue(values, 'description')),
    seoTitle: normalizeText(readProductValue(values, 'seoTitle')),
    price: Math.max(0, normalizeNumber(readProductValue(values, 'price'))),
    compareAtPrice: maybeNumber(readProductValue(values, 'compareAtPrice')),
    currency: normalizeCurrency(readProductValue(values, 'currency')),
    imageUrl: normalizeText(readProductValue(values, 'imageUrl')),
    galleryImages: normalizeUrlList(readProductValue(values, 'galleryImages')),
    variants: normalizeVariants(readProductValue(values, 'variants')),
    category: normalizeText(readProductValue(values, 'category')),
    tags: normalizeTags(readProductValue(values, 'tags')),
    vendor: normalizeText(readProductValue(values, 'vendor')),
    featured: Boolean(readProductValue(values, 'featured')),
    productType,
    inventory: {
      quantity,
      lowStockThreshold,
      policy: inventoryPolicy,
      inStock: productType !== 'physical' || quantity > 0 || inventoryPolicy !== 'deny',
      lowStock: productType === 'physical' && quantity > 0 && quantity <= lowStockThreshold,
    },
    delivery: {
      shippingRequired: shippingRequiredValue !== false && productType === 'physical',
      taxable: taxableValue !== false,
      weight: maybeNumber(readProductValue(values, 'weight')),
      shippingProfile: normalizeText(readProductValue(values, 'shippingProfile')),
      taxClass: normalizeText(readProductValue(values, 'taxClass')),
      returnPolicy: normalizeText(readProductValue(values, 'returnPolicy')),
      hasDigitalDelivery,
    },
    checkout: {
      mode: checkoutUrl ? 'external-url' : 'not-configured',
      url: checkoutUrl || null,
      enabled: checkoutUrl.length > 0,
      discountCode: normalizeText(readProductValue(values, 'discountCode')),
    },
    subscription: {
      enabled: normalizeBoolean(readProductValue(values, 'subscriptionEnabled')),
      interval: normalizeSubscriptionInterval(readProductValue(values, 'subscriptionInterval')),
      trialDays: Math.max(0, Math.round(normalizeNumber(readProductValue(values, 'subscriptionTrialDays')))),
    },
    design: buildProductDesignContract(values),
    links: {
      storefrontPath: `/products/${record.slug}`,
    },
    updatedAt: record.updatedAt,
    publishedAt: record.publishedAt || null,
  };
};

const matchesFilter = (candidate: string, filter: string | undefined) => (
  !filter || normalizeIdentifier(candidate) === normalizeIdentifier(filter)
);

export const filterCommerceProducts = (
  products: CommerceProduct[],
  filters: CommerceCatalogFilters,
): CommerceProduct[] => products.filter((product) => {
  const search = normalizeIdentifier(filters.search);
  const matchesSearch = !search || [
    product.title,
    product.slug,
    product.sku,
    product.description,
    product.category,
    product.vendor,
    product.variants.map((variant) => `${variant.title} ${variant.sku} ${variant.option}`).join(' '),
    product.tags.join(' '),
  ].some((value) => normalizeIdentifier(value).includes(search));

  return (
    matchesSearch &&
    matchesFilter(product.category, filters.category) &&
    matchesFilter(product.vendor, filters.vendor) &&
    matchesFilter(product.productType, filters.productType) &&
    (filters.tag ? product.tags.some((tag) => matchesFilter(tag, filters.tag)) : true) &&
    (filters.featured === undefined ? true : product.featured === filters.featured)
  );
});

const buildFacet = (values: string[]) => {
  const counts = new Map<string, number>();
  values.map((value) => value.trim()).filter(Boolean).forEach((value) => {
    counts.set(value, (counts.get(value) || 0) + 1);
  });

  return Array.from(counts.entries())
    .map(([value, count]) => ({ value, count }))
    .sort((left, right) => left.value.localeCompare(right.value));
};

export const buildCommerceFacets = (products: CommerceProduct[]): CommerceCatalogFacets => ({
  categories: buildFacet(products.map((product) => product.category)),
  tags: buildFacet(products.flatMap((product) => product.tags)),
  vendors: buildFacet(products.map((product) => product.vendor)),
  productTypes: buildFacet(products.map((product) => product.productType)),
});

export const buildCommerceReadiness = (
  collection: CommerceSourceCollection | null,
  products: CommerceProduct[],
) => {
  const hasProducts = products.length > 0;
  const publishedProducts = products.length;
  const pricedProducts = products.filter((product) => product.price > 0).length;
  const checkoutProducts = products.filter((product) => product.checkout.enabled).length;
  const imageProducts = products.filter((product) => product.imageUrl || product.galleryImages.length > 0).length;
  const checks = [
    {
      label: 'Products collection',
      ready: Boolean(collection?.permissions.publicRead),
      detail: collection?.permissions.publicRead ? 'Public products collection is readable.' : 'Publish products and enable public read.',
    },
    {
      label: 'Published products',
      ready: hasProducts,
      detail: hasProducts ? `${publishedProducts} product${publishedProducts === 1 ? '' : 's'} available.` : 'No published products available.',
    },
    {
      label: 'Pricing',
      ready: pricedProducts === products.length && hasProducts,
      detail: hasProducts ? `${pricedProducts}/${products.length} products have prices.` : 'Add product prices before selling.',
    },
    {
      label: 'Checkout',
      ready: checkoutProducts === products.length && hasProducts,
      detail: hasProducts ? `${checkoutProducts}/${products.length} products have checkout URLs.` : 'Add checkout URLs or a payment provider.',
    },
    {
      label: 'Media',
      ready: imageProducts === products.length && hasProducts,
      detail: hasProducts ? `${imageProducts}/${products.length} products have images or galleries.` : 'Attach product images for storefront cards.',
    },
  ];

  return {
    score: Math.round((checks.filter((check) => check.ready).length / checks.length) * 100),
    publishedProducts,
    pricedProducts,
    checkoutProducts,
    imageProducts,
    checks,
  };
};
