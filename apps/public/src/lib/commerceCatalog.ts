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
    hasDigitalDelivery: boolean;
  };
  checkout: {
    mode: 'external-url' | 'not-configured';
    url: string | null;
    enabled: boolean;
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
  paymentProvider: 'none' | 'stripe' | 'manual';
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
}

export const PRODUCT_COLLECTION_SLUG = 'products';

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
  return provider === 'stripe' || provider === 'manual' ? provider : 'none';
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

const normalizeEventAllowlist = (value: unknown): string[] => {
  const raw = Array.isArray(value) ? value : normalizeText(value).split(',');
  return raw
    .map((item) => normalizeText(item))
    .filter(Boolean)
    .filter((event, index, events) => events.indexOf(event) === index)
    .slice(0, 24);
};

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
  const productType = normalizeProductType(values.productType);
  const quantity = Math.max(0, normalizeNumber(values.inventory));
  const lowStockThreshold = Math.max(0, normalizeNumber(values.lowStockThreshold, 5));
  const inventoryPolicy = normalizeInventoryPolicy(values.inventoryPolicy);
  const checkoutUrl = normalizeText(values.checkoutUrl);
  const hasDigitalDelivery = productType === 'digital' && normalizeText(values.downloadUrl).length > 0;

  return {
    id: record.id,
    slug: record.slug,
    status: record.status,
    title: normalizeText(values.title) || record.slug,
    sku: normalizeText(values.sku),
    description: normalizeText(values.description),
    seoTitle: normalizeText(values.seoTitle),
    price: Math.max(0, normalizeNumber(values.price)),
    compareAtPrice: maybeNumber(values.compareAtPrice),
    currency: normalizeCurrency(values.currency),
    imageUrl: normalizeText(values.imageUrl),
    galleryImages: normalizeUrlList(values.galleryImages),
    variants: normalizeVariants(values.variants),
    category: normalizeText(values.category),
    tags: normalizeTags(values.tags),
    vendor: normalizeText(values.vendor),
    featured: Boolean(values.featured),
    productType,
    inventory: {
      quantity,
      lowStockThreshold,
      policy: inventoryPolicy,
      inStock: productType !== 'physical' || quantity > 0 || inventoryPolicy !== 'deny',
      lowStock: productType === 'physical' && quantity > 0 && quantity <= lowStockThreshold,
    },
    delivery: {
      shippingRequired: values.shippingRequired !== false && productType === 'physical',
      taxable: values.taxable !== false,
      weight: maybeNumber(values.weight),
      hasDigitalDelivery,
    },
    checkout: {
      mode: checkoutUrl ? 'external-url' : 'not-configured',
      url: checkoutUrl || null,
      enabled: checkoutUrl.length > 0,
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
