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
  links: {
    storefrontPath: string;
  };
  updatedAt: string;
  publishedAt: string | null;
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

const normalizeTags = (value: unknown): string[] => {
  if (Array.isArray(value)) {
    return value.map((item) => normalizeText(item)).filter(Boolean);
  }

  return normalizeText(value)
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
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

export const isCommerceSourceRecord = (record: unknown): record is CommerceSourceRecord => {
  if (!record || typeof record !== 'object') return false;
  const candidate = record as Partial<CommerceSourceRecord>;
  const scheduledAt = typeof candidate.scheduledAt === 'string' ? Date.parse(candidate.scheduledAt) : null;

  return (
    typeof candidate.id === 'string' &&
    typeof candidate.slug === 'string' &&
    candidate.status === 'published' &&
    (!scheduledAt || scheduledAt <= Date.now()) &&
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
  const imageProducts = products.filter((product) => product.imageUrl).length;
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
      detail: hasProducts ? `${imageProducts}/${products.length} products have images.` : 'Attach product images for storefront cards.',
    },
  ];

  return {
    score: Math.round((checks.filter((check) => check.ready).length / checks.length) * 100),
    checks,
  };
};
