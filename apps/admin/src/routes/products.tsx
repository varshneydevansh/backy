import { ChangeEvent, FormEvent, type ReactNode, useEffect, useMemo, useRef, useState } from 'react';
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router';
import {
  AlertTriangle,
  Archive,
  Boxes,
  CheckCircle2,
  Code2,
  Copy,
  Download,
  Edit3,
  ExternalLink,
  FileText,
  Image as ImageIcon,
  Package,
  Pause,
  Play,
  Plus,
  RefreshCw,
  Search,
  ShoppingBag,
  Sparkles,
  Trash2,
  Upload,
  Users,
} from 'lucide-react';
import {
  createCollection,
  createCollectionRecord,
  deleteCollectionRecord,
  getCommerceReconciliationReadiness,
  getOrderAnalytics,
  getProductSubscriptionLifecycle,
  getUserPermissions,
  runProductSubscriptionLifecycleAction,
  getSiteFrontendDesign,
  importCollectionRecordsCsv,
  listProductNotificationEvents,
  listCollectionRecords,
  listCollections,
  reconcileCommerceOrders,
  syncCommerceProductProvider,
  updateCollection,
  updateCollectionRecord,
  type Collection,
  type CollectionField,
  type CollectionRecord,
  type CollectionRecordPagination,
  type CommerceCronReadiness,
  type CommerceReconciliationResult,
  type CommerceProductProviderSyncResult,
  type ProductSubscriptionLifecycle,
  type ProductSubscriptionLifecycleAction,
  type AdminUserPermissionMatrix,
  type OrderAnalytics,
  type OrderDeliveryEvent,
} from '@/lib/adminContentApi';
import { useStore, type ContentStatus } from '@/stores/mockStore';
import { useAuthStore, type User as AuthUser } from '@/stores/authStore';
import { PageShell } from '@/components/layout/PageShell';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { Panel, PanelContent, PanelHeader } from '@/components/ui/Panel';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { parseTagInput, serializeTagValues, TagInput } from '@/components/ui/TagInput';
import { MediaLibraryModal } from '@/components/editor/MediaLibraryModal';
import { getPublicMediaFileUrl } from '@/lib/mediaApi';
import { adminPermissionReason, isAdminPermissionAllowed } from '@/lib/adminPermissionUi';
import { getSiteSelectionFromSearch, siteMatchesIdentifier } from '@/lib/siteSelection';
import { cn, formatDate } from '@/lib/utils';
import type { SiteSettings } from '@backy-cms/core';

const PRODUCT_CONTROL_AREAS = [
  {
    title: 'Site scope',
    detail: 'Choose the website whose storefront catalog is being managed.',
    href: '#products-site',
  },
  {
    title: 'Storefront API',
    detail: 'Public product list and detail endpoints for custom frontends.',
    href: '#products-api',
  },
  {
    title: 'Page templates',
    detail: 'Create product list and detail pages with product dataset bindings.',
    href: '#products-page-templates',
  },
  {
    title: 'Catalog health',
    detail: 'Inventory, published/draft counts, low stock, and digital products.',
    href: '#products-metrics',
  },
  {
    title: 'Commerce signal',
    detail: 'Revenue, order, and customer profile handoff from private commerce records.',
    href: '#products-commerce-analytics',
  },
  {
    title: 'Catalog grid',
    detail: 'Search, filter, publish, archive, edit, and delete products.',
    href: '#products-catalog',
  },
  {
    title: 'Product editor',
    detail: 'Pricing, SKU, media, delivery, tax, stock, SEO, and status controls.',
    href: '#products-editor',
  },
] as const;

const PRODUCT_API_CONTRACTS = [
  {
    key: 'commerce-catalog',
    title: 'Commerce catalog',
    methods: ['GET'],
    endpointKey: 'commerceCatalog',
    schemaVersion: 'backy.commerce-catalog.v1',
    cacheScope: 'public',
    detail: 'Public storefront catalog with product cards, facets, inventory state, delivery metadata, and checkout handoff fields.',
  },
  {
    key: 'order-intake',
    title: 'Order intake',
    methods: ['GET', 'POST'],
    endpointKey: 'commerceOrderContract',
    schemaVersion: 'backy.commerce-order.v1',
    cacheScope: 'private',
    detail: 'Checkout contract and cart submission surface for creating private Backy order records from custom storefronts.',
  },
  {
    key: 'provider-sync',
    title: 'Provider catalog sync',
    methods: ['POST'],
    endpointKey: 'providerSync',
    schemaVersion: 'backy.commerce-product-sync.v1',
    cacheScope: 'private',
    detail: 'Admin product provider-sync result for Stripe, PayPal, Paddle, Square, Shopify, BigCommerce, WooCommerce, Etsy, Magento, HTTP, or handoff metadata.',
  },
  {
    key: 'subscription-lifecycle',
    title: 'Subscription lifecycle',
    methods: ['GET'],
    endpointKey: 'productSubscriptions',
    schemaVersion: 'backy.product-subscription-lifecycle.v1',
    cacheScope: 'private',
    detail: 'Product-scoped subscription order summary, lifecycle states, provider readiness, and bounded action history.',
  },
  {
    key: 'subscription-action',
    title: 'Subscription action',
    methods: ['POST'],
    endpointKey: 'productSubscriptionAction',
    schemaVersion: 'backy.product-subscription-action.v1',
    cacheScope: 'private',
    detail: 'Admin pause, resume, or cancel action envelope for provider-native execution or structured manual handoff.',
  },
  {
    key: 'product-events',
    title: 'Product automation events',
    methods: ['GET'],
    endpointKey: 'productNotificationEvents',
    schemaVersion: 'backy.interaction-event.v1',
    cacheScope: 'private',
    detail: 'Low-stock automation, catalog handoff, and product workflow event stream for admin/custom dashboards.',
  },
] as const;

const PRODUCT_PROVIDER_CERTIFICATION_GROUPS = [
  {
    family: 'Payment and subscription checkout',
    providers: ['Stripe', 'PayPal', 'Paddle', 'Square', 'Adyen', 'Mollie', 'Razorpay'],
    gate: 'ci:commerce-provider-certification',
    requiredInputs: [
      'BACKY_STRIPE_SECRET_KEY or STRIPE_SECRET_KEY',
      'BACKY_PAYPAL_ACCESS_TOKEN or PAYPAL_ACCESS_TOKEN',
      'BACKY_PADDLE_API_KEY or PADDLE_API_KEY',
      'BACKY_SQUARE_ACCESS_TOKEN or SQUARE_ACCESS_TOKEN',
      'BACKY_ADYEN_API_KEY or ADYEN_API_KEY',
      'BACKY_MOLLIE_API_KEY or MOLLIE_API_KEY',
      'BACKY_RAZORPAY_KEY_ID/BACKY_RAZORPAY_KEY_SECRET or RAZORPAY_KEY_ID/RAZORPAY_KEY_SECRET',
      'BACKY_COMMERCE_WEBHOOK_SECRET or COMMERCE_WEBHOOK_SECRET',
    ],
    evidence: 'Live payment, checkout, webhook, and subscription action credentials.',
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
    family: 'Shipping rate and label providers',
    providers: ['EasyPost', 'Shippo', 'HTTP'],
    gate: 'ci:commerce-provider-certification',
    requiredInputs: [
      'BACKY_EASYPOST_API_KEY or EASYPOST_API_KEY',
      'BACKY_SHIPPO_API_KEY or SHIPPO_API_KEY',
      'BACKY_COMMERCE_SHIPPING_PROVIDER_URL or COMMERCE_SHIPPING_PROVIDER_URL',
    ],
    evidence: 'Live carrier rate, label, and tracking credentials.',
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
    family: 'Mock provider regression',
    providers: ['Local provider mocks'],
    gate: 'ci:commerce-provider-smoke',
    requiredInputs: ['No live provider credentials required'],
    evidence: 'Repeatable local provider matrix without live credentials.',
  },
] as const;

const PRODUCT_RECORD_PAGE_SIZE = 100;
const COMMERCE_SIGNAL_RECORD_LIMIT = 100;
const PRODUCT_VARIANT_LIMIT = 50;
const PRODUCT_GALLERY_IMAGE_LIMIT = 12;

type ProductStatusFilter = ContentStatus | 'all';
type ProductTypeFilter = ProductFormState['productType'] | 'all';
type ProductStockFilter = 'all' | 'in-stock' | 'low-stock' | 'out-of-stock' | 'featured' | 'checkout-missing';
type ProductPageTemplateMode = 'list' | 'item';
type SiteFrontendDesignContract = NonNullable<SiteSettings['frontendDesign']>;
type SiteFrontendDesignTemplate = SiteFrontendDesignContract['templates'][number];
type ProductPermissionKey =
  | 'commerce.view'
  | 'commerce.edit'
  | 'commerce.configure'
  | 'commerce.delete'
  | 'collections.view'
  | 'collections.edit'
  | 'collections.export'
  | 'collections.delete'
  | 'media.view'
  | 'media.create'
  | 'pages.edit';

const PRODUCT_PERMISSION_ROLE_DEFAULTS: Record<ProductPermissionKey, Array<AuthUser['role']>> = {
  'commerce.view': ['owner', 'admin', 'editor', 'viewer'],
  'commerce.edit': ['owner', 'admin', 'editor'],
  'commerce.configure': ['owner', 'admin'],
  'commerce.delete': ['owner', 'admin'],
  'collections.view': ['owner', 'admin', 'editor', 'viewer'],
  'collections.edit': ['owner', 'admin', 'editor'],
  'collections.export': ['owner', 'admin'],
  'collections.delete': ['owner', 'admin'],
  'media.view': ['owner', 'admin', 'editor', 'viewer'],
  'media.create': ['owner', 'admin', 'editor'],
  'pages.edit': ['owner', 'admin', 'editor'],
};

interface ProductsSearch {
  siteId?: string;
  status?: ProductStatusFilter;
  type?: ProductTypeFilter;
  stock?: ProductStockFilter;
  category?: string;
  q?: string;
  productId?: string;
  frontendTemplate?: string;
}

interface ProductFormState {
  title: string;
  slug: string;
  sku: string;
  variants: string;
  price: string;
  compareAtPrice: string;
  currency: string;
  inventory: string;
  lowStockThreshold: string;
  inventoryPolicy: 'deny' | 'continue' | 'preorder';
  productType: 'physical' | 'digital' | 'service';
  downloadUrl: string;
  checkoutUrl: string;
  subscriptionEnabled: boolean;
  subscriptionInterval: 'weekly' | 'monthly' | 'quarterly' | 'yearly';
  subscriptionTrialDays: string;
  shippingRequired: boolean;
  shippingProfile: string;
  weight: string;
  taxClass: string;
  discountCode: string;
  returnPolicy: string;
  imageUrl: string;
  galleryImages: string;
  category: string;
  tags: string;
  vendor: string;
  description: string;
  seoTitle: string;
  status: ContentStatus;
  scheduledAt: string;
  featured: boolean;
  taxable: boolean;
}

const PRODUCT_COLLECTION_SLUG = 'products';
const ORDERS_COLLECTION_SLUG = 'orders';
const CUSTOMERS_COLLECTION_SLUG = 'customers';
const PRODUCT_STATUS_FILTERS: ProductStatusFilter[] = ['all', 'published', 'draft', 'scheduled', 'archived'];
const PRODUCT_TYPE_FILTERS: ProductTypeFilter[] = ['all', 'physical', 'digital', 'service'];
const PRODUCT_STOCK_FILTERS: ProductStockFilter[] = ['all', 'in-stock', 'low-stock', 'out-of-stock', 'featured', 'checkout-missing'];

const isProductStatusFilter = (value: unknown): value is ProductStatusFilter => (
  typeof value === 'string' && PRODUCT_STATUS_FILTERS.includes(value as ProductStatusFilter)
);

const isOrderCollectionPrivate = (collection: Collection | null) => Boolean(
  collection &&
  !collection.permissions.publicRead &&
  !collection.permissions.publicCreate &&
  !collection.permissions.publicUpdate &&
  !collection.permissions.publicDelete,
);

const isProductTypeFilter = (value: unknown): value is ProductTypeFilter => (
  typeof value === 'string' && PRODUCT_TYPE_FILTERS.includes(value as ProductTypeFilter)
);

const isProductStockFilter = (value: unknown): value is ProductStockFilter => (
  typeof value === 'string' && PRODUCT_STOCK_FILTERS.includes(value as ProductStockFilter)
);

const normalizedSearchString = (value: unknown): string | undefined => {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
};

export const Route = createFileRoute('/products')({
  validateSearch: (search: Record<string, unknown>): ProductsSearch => ({
    siteId: normalizedSearchString(search.siteId),
    status: isProductStatusFilter(search.status) ? search.status : undefined,
    type: isProductTypeFilter(search.type) ? search.type : undefined,
    stock: isProductStockFilter(search.stock) ? search.stock : undefined,
    category: normalizedSearchString(search.category),
    q: normalizedSearchString(search.q),
    productId: normalizedSearchString(search.productId),
    frontendTemplate: normalizedSearchString(search.frontendTemplate),
  }),
  component: ProductsRoute,
});

interface ProductVariantFormState {
  title: string;
  sku: string;
  option: string;
  price: string;
  inventory: string;
}

interface ProductVariant {
  id: string;
  title: string;
  sku: string;
  option: string;
  price: number | null;
  inventory: number | null;
}

interface ProductOptionMatrixDraft {
  options: string;
  skuPrefix: string;
  price: string;
  inventory: string;
  replaceExisting: boolean;
}

const CUSTOMER_STATUS_OPTIONS = ['lead', 'customer', 'vip', 'inactive'] as const;

type CustomerStatusOption = (typeof CUSTOMER_STATUS_OPTIONS)[number];

interface CustomerProfileDraft {
  name: string;
  email: string;
  phone: string;
  status: CustomerStatusOption;
  notes: string;
}

interface CommerceLineItem {
  id: string;
  productId: string;
  slug: string;
  title: string;
  sku: string;
  quantity: number;
  lineTotal: number;
  currency: string;
}

interface FrontendProductTemplateBlueprint {
  title: string;
  slug: string;
  sku: string;
  values: Record<string, unknown>;
}

const PRODUCT_VALUE_KEYS = {
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
  providerSync: 'providersync',
} satisfies Record<Exclude<keyof ProductFormState, 'slug' | 'status' | 'scheduledAt'>, string> & Record<'providerSync', string>;

type ProductValueKey = keyof typeof PRODUCT_VALUE_KEYS;

const productFieldKey = (key: ProductValueKey) => PRODUCT_VALUE_KEYS[key];

const normalizeProductSchemaKey = (key: string) => key.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');

const readProductValue = (values: Record<string, unknown>, key: ProductValueKey, fallback?: unknown): unknown => {
  const canonical = productFieldKey(key);
  if (values[canonical] !== undefined) return values[canonical];
  if (values[key] !== undefined) return values[key];
  return fallback;
};

const normalizeProductValues = (values: Record<string, unknown>): Record<string, unknown> => {
  const normalized = { ...values };

  for (const [legacyKey, canonicalKey] of Object.entries(PRODUCT_VALUE_KEYS) as Array<[ProductValueKey, string]>) {
    const canonicalValue = values[canonicalKey];
    const legacyValue = values[legacyKey];

    if (canonicalValue === undefined && legacyValue !== undefined) {
      normalized[canonicalKey] = legacyValue;
    }

    if (legacyValue === undefined && canonicalValue !== undefined) {
      normalized[legacyKey] = canonicalValue;
    }
  }

  return normalized;
};

const normalizeProductRecord = (record: CollectionRecord): CollectionRecord => ({
  ...record,
  values: normalizeProductValues(record.values),
});

const customerProfileToDraft = (record: CollectionRecord | null): CustomerProfileDraft => {
  const values = record?.values || {};
  const status = String(values.status || 'customer').trim().toLowerCase();

  return {
    name: String(values.name || values.fullname || values.customername || values.email || ''),
    email: String(values.email || ''),
    phone: String(values.phone || ''),
    status: CUSTOMER_STATUS_OPTIONS.includes(status as CustomerStatusOption) ? status as CustomerStatusOption : 'customer',
    notes: String(values.notes || ''),
  };
};

const PRODUCT_FIELDS: CollectionField[] = [
  { key: productFieldKey('title'), label: 'Title', type: 'text', required: true, unique: false, sortOrder: 10 },
  { key: productFieldKey('sku'), label: 'SKU', type: 'text', required: true, unique: true, sortOrder: 20 },
  { key: productFieldKey('price'), label: 'Price', type: 'number', required: true, unique: false, sortOrder: 30 },
  { key: productFieldKey('compareAtPrice'), label: 'Compare at price', type: 'number', required: false, unique: false, sortOrder: 40 },
  { key: productFieldKey('currency'), label: 'Currency', type: 'text', required: true, unique: false, sortOrder: 50, defaultValue: 'USD' },
  { key: productFieldKey('variants'), label: 'Variants', type: 'json', required: false, unique: false, sortOrder: 60, defaultValue: [] },
  { key: productFieldKey('inventory'), label: 'Inventory', type: 'number', required: false, unique: false, sortOrder: 70, defaultValue: 0 },
  { key: productFieldKey('lowStockThreshold'), label: 'Low Stock Threshold', type: 'number', required: false, unique: false, sortOrder: 80, defaultValue: 5 },
  { key: productFieldKey('inventoryPolicy'), label: 'Inventory Policy', type: 'select', required: false, unique: false, sortOrder: 90, options: ['deny', 'continue', 'preorder'], defaultValue: 'deny' },
  { key: productFieldKey('productType'), label: 'Product Type', type: 'select', required: true, unique: false, sortOrder: 100, options: ['physical', 'digital', 'service'], defaultValue: 'physical' },
  { key: productFieldKey('downloadUrl'), label: 'Digital Delivery URL', type: 'url', required: false, unique: false, sortOrder: 110 },
  { key: productFieldKey('checkoutUrl'), label: 'Checkout URL', type: 'url', required: false, unique: false, sortOrder: 120 },
  { key: productFieldKey('subscriptionEnabled'), label: 'Subscription Enabled', type: 'boolean', required: false, unique: false, sortOrder: 130, defaultValue: false },
  { key: productFieldKey('subscriptionInterval'), label: 'Subscription Interval', type: 'select', required: false, unique: false, sortOrder: 140, options: ['weekly', 'monthly', 'quarterly', 'yearly'], defaultValue: 'monthly' },
  { key: productFieldKey('subscriptionTrialDays'), label: 'Subscription Trial Days', type: 'number', required: false, unique: false, sortOrder: 150, defaultValue: 0 },
  { key: productFieldKey('shippingRequired'), label: 'Requires Shipping', type: 'boolean', required: false, unique: false, sortOrder: 160, defaultValue: true },
  { key: productFieldKey('shippingProfile'), label: 'Shipping Profile', type: 'text', required: false, unique: false, sortOrder: 170 },
  { key: productFieldKey('weight'), label: 'Weight', type: 'number', required: false, unique: false, sortOrder: 180 },
  { key: productFieldKey('taxClass'), label: 'Tax Class', type: 'text', required: false, unique: false, sortOrder: 190 },
  { key: productFieldKey('discountCode'), label: 'Discount Code', type: 'text', required: false, unique: false, sortOrder: 200 },
  { key: productFieldKey('returnPolicy'), label: 'Return Policy', type: 'richText', required: false, unique: false, sortOrder: 210 },
  { key: productFieldKey('imageUrl'), label: 'Image URL', type: 'url', required: false, unique: false, sortOrder: 220 },
  { key: productFieldKey('galleryImages'), label: 'Gallery Images', type: 'json', required: false, unique: false, sortOrder: 230, defaultValue: [] },
  { key: productFieldKey('category'), label: 'Category', type: 'text', required: false, unique: false, sortOrder: 240 },
  { key: productFieldKey('tags'), label: 'Tags', type: 'tags', required: false, unique: false, sortOrder: 250 },
  { key: productFieldKey('vendor'), label: 'Vendor', type: 'text', required: false, unique: false, sortOrder: 260 },
  { key: productFieldKey('description'), label: 'Description', type: 'richText', required: false, unique: false, sortOrder: 270 },
  { key: productFieldKey('seoTitle'), label: 'SEO Title', type: 'text', required: false, unique: false, sortOrder: 280 },
  { key: productFieldKey('featured'), label: 'Featured', type: 'boolean', required: false, unique: false, sortOrder: 290, defaultValue: false },
  { key: productFieldKey('taxable'), label: 'Taxable', type: 'boolean', required: false, unique: false, sortOrder: 300, defaultValue: true },
  { key: productFieldKey('providerSync'), label: 'Provider Sync', type: 'json', required: false, unique: false, sortOrder: 310 },
];

const PRODUCT_EXPORT_COLUMNS = [
  'product_id',
  'active_site_id',
  'slug',
  'status',
  'title',
  'sku',
  'variants',
  'variant_count',
  'price',
  'compare_at_price',
  'currency',
  'inventory',
  'low_stock_threshold',
  'inventory_policy',
  'product_type',
  'category',
  'tags',
  'vendor',
  'image_url',
  'gallery_images',
  'gallery_image_count',
  'download_url',
  'checkout_url',
  'subscription_enabled',
  'subscription_interval',
  'subscription_trial_days',
  'shipping_required',
  'shipping_profile',
  'tax_class',
  'discount_code',
  'return_policy',
  'taxable',
  'weight',
  'featured',
  'seo_title',
  'storefront_path',
  'list_api_url',
  'detail_api_url',
  'public_render_url',
  'public_resolve_url',
  'checkout_mode',
  'provider_sync_status',
  'provider_sync_execution_mode',
  'provider_sync_product_id',
  'provider_sync_price_id',
  'provider_sync_at',
  'scheduled_at',
  'frontend_systems',
  'created_at',
  'updated_at',
] as const;

const PRODUCT_IMPORT_COLUMNS = [
  'slug',
  'status',
  'scheduledAt',
  productFieldKey('title'),
  productFieldKey('sku'),
  productFieldKey('price'),
  productFieldKey('compareAtPrice'),
  productFieldKey('currency'),
  productFieldKey('variants'),
  productFieldKey('inventory'),
  productFieldKey('lowStockThreshold'),
  productFieldKey('inventoryPolicy'),
  productFieldKey('productType'),
  productFieldKey('downloadUrl'),
  productFieldKey('checkoutUrl'),
  productFieldKey('subscriptionEnabled'),
  productFieldKey('subscriptionInterval'),
  productFieldKey('subscriptionTrialDays'),
  productFieldKey('shippingRequired'),
  productFieldKey('shippingProfile'),
  productFieldKey('weight'),
  productFieldKey('taxClass'),
  productFieldKey('discountCode'),
  productFieldKey('returnPolicy'),
  productFieldKey('imageUrl'),
  productFieldKey('galleryImages'),
  productFieldKey('category'),
  productFieldKey('tags'),
  productFieldKey('vendor'),
  productFieldKey('description'),
  productFieldKey('seoTitle'),
  productFieldKey('featured'),
  productFieldKey('taxable'),
] as const;

const PRODUCT_IMPORT_HEADER_ALIASES = new Map<string, string>(
  (Object.entries(PRODUCT_VALUE_KEYS) as Array<[ProductValueKey, string]>).flatMap(([legacyKey, canonicalKey]) => {
    const snakeKey = legacyKey.replace(/([A-Z])/g, '_$1').toLowerCase();
    return [
      [legacyKey, canonicalKey],
      [legacyKey.toLowerCase(), canonicalKey],
      [snakeKey, canonicalKey],
      [canonicalKey, canonicalKey],
    ] as Array<[string, string]>;
  }),
);

const normalizeProductImportHeader = (header: string): string => {
  const trimmed = header.trim().replace(/^"|"$/g, '');
  return PRODUCT_IMPORT_HEADER_ALIASES.get(trimmed)
    || PRODUCT_IMPORT_HEADER_ALIASES.get(trimmed.toLowerCase())
    || trimmed;
};

const normalizeProductImportCsvHeaders = (csv: string): string => {
  const newlineIndex = csv.search(/\r?\n/);
  const headerLine = newlineIndex === -1 ? csv : csv.slice(0, newlineIndex);
  const rest = newlineIndex === -1 ? '' : csv.slice(newlineIndex);
  const normalizedHeader = headerLine
    .split(',')
    .map(normalizeProductImportHeader)
    .join(',');

  return `${normalizedHeader}${rest}`;
};

const PRODUCT_FRONTEND_SYSTEMS = [
  {
    key: 'catalog',
    title: 'Catalog listing',
    detail: 'Product cards, status filtering, sorting, featured products, pagination, and search-ready catalog responses.',
  },
  {
    key: 'detail',
    title: 'Product detail',
    detail: 'Slug routes, pricing, descriptions, images, delivery metadata, SEO titles, and public render/resolve URLs.',
  },
  {
    key: 'inventory',
    title: 'Inventory controls',
    detail: 'Stock counts, low-stock thresholds, deny/continue/preorder policy, and digital/service product handling.',
  },
  {
    key: 'checkout',
    title: 'Checkout handoff',
    detail: 'Per-product checkout URLs, Backy order-intake posts, and provider-ready checkout session handoff metadata.',
  },
  {
    key: 'merchandising',
    title: 'Merchandising facets',
    detail: 'Categories, tags, vendors, featured state, product type, taxable flag, and shipping requirement filters.',
  },
  {
    key: 'media',
    title: 'Product media',
    detail: 'Image URLs sourced from Backy media, with future gallery and downloadable/private file support.',
  },
] as const;

const PRODUCT_PAGE_BINDING_TARGETS = [
  {
    key: 'product-card',
    title: 'Product card blocks',
    detail: 'Bind title, price, image, featured state, category, tags, and product URL into storefront grids.',
  },
  {
    key: 'product-detail',
    title: 'Product detail sections',
    detail: 'Bind description, gallery, pricing, SEO title, inventory policy, and delivery metadata into detail pages.',
  },
  {
    key: 'variant-selector',
    title: 'Variant selectors',
    detail: 'Expose option, SKU, price override, and variant stock for sizes, licenses, tiers, colors, or formats.',
  },
  {
    key: 'subscription-metadata',
    title: 'Subscription metadata',
    detail: 'Expose recurring-plan interval, enabled state, and trial-day metadata for frontends while provider billing execution remains external.',
  },
  {
    key: 'cart-order-intake',
    title: 'Cart and order intake',
    detail: 'Use checkoutUrl or the Backy order POST contract to create private orders and reserve inventory.',
  },
  {
    key: 'merchandising-filters',
    title: 'Merchandising filters',
    detail: 'Drive storefront filters from category, tags, vendor, product type, featured state, and stock policy.',
  },
  {
    key: 'product-media',
    title: 'Product media fields',
    detail: 'Use central media URLs for primary images, galleries, and digital delivery/download references.',
  },
] as const;

const EMPTY_PRODUCT_FORM: ProductFormState = {
  title: '',
  slug: '',
  sku: '',
  variants: '',
  price: '',
  compareAtPrice: '',
  currency: 'USD',
  inventory: '0',
  lowStockThreshold: '5',
  inventoryPolicy: 'deny',
  productType: 'physical',
  downloadUrl: '',
  checkoutUrl: '',
  subscriptionEnabled: false,
  subscriptionInterval: 'monthly',
  subscriptionTrialDays: '0',
  shippingRequired: true,
  shippingProfile: '',
  weight: '',
  taxClass: '',
  discountCode: '',
  returnPolicy: '',
  imageUrl: '',
  galleryImages: '',
  category: '',
  tags: '',
  vendor: '',
  description: '',
  seoTitle: '',
  status: 'draft',
  scheduledAt: '',
  featured: false,
  taxable: true,
};

function ProductsRoute() {
  const navigate = useNavigate();
  const routeSearch = Route.useSearch();
  const { sites } = useStore();
  const currentAdmin = useAuthStore((state) => state.user);
  const [selectedSiteId, setSelectedSiteId] = useState(() => routeSearch.siteId || getSiteSelectionFromSearch(sites));
  const [productCollection, setProductCollection] = useState<Collection | null>(null);
  const [ordersCollection, setOrdersCollection] = useState<Collection | null>(null);
  const [customersCollection, setCustomersCollection] = useState<Collection | null>(null);
  const [products, setProducts] = useState<CollectionRecord[]>([]);
  const [recentOrders, setRecentOrders] = useState<CollectionRecord[]>([]);
  const [customerProfiles, setCustomerProfiles] = useState<CollectionRecord[]>([]);
  const [orderAnalytics, setOrderAnalytics] = useState<OrderAnalytics | null>(null);
  const [isOrderAnalyticsLoading, setIsOrderAnalyticsLoading] = useState(false);
  const [orderAnalyticsError, setOrderAnalyticsError] = useState<string | null>(null);
  const [reconciliationReadiness, setReconciliationReadiness] = useState<CommerceCronReadiness | null>(null);
  const [reconciliationResult, setReconciliationResult] = useState<CommerceReconciliationResult | null>(null);
  const [isReconciliationLoading, setIsReconciliationLoading] = useState(false);
  const [reconciliationError, setReconciliationError] = useState<string | null>(null);
  const [productNotificationEvents, setProductNotificationEvents] = useState<OrderDeliveryEvent[]>([]);
  const [productNotificationError, setProductNotificationError] = useState<string | null>(null);
  const [selectedProductLifecycle, setSelectedProductLifecycle] = useState<ProductSubscriptionLifecycle | null>(null);
  const [isProductLifecycleLoading, setIsProductLifecycleLoading] = useState(false);
  const [productLifecycleError, setProductLifecycleError] = useState<string | null>(null);
  const [productLifecycleActionBusy, setProductLifecycleActionBusy] = useState<string | null>(null);
  const [productLifecycleActionMessage, setProductLifecycleActionMessage] = useState<string | null>(null);
  const [selectedCustomerProfileId, setSelectedCustomerProfileId] = useState<string | null>(null);
  const [customerProfileDraft, setCustomerProfileDraft] = useState<CustomerProfileDraft>(() => customerProfileToDraft(null));
  const [productPagination, setProductPagination] = useState<CollectionRecordPagination | null>(null);
  const [selectedProductId, setSelectedProductId] = useState<string | null>(routeSearch.productId || null);
  const [formState, setFormState] = useState<ProductFormState>(EMPTY_PRODUCT_FORM);
  const [statusFilter, setStatusFilter] = useState<ProductStatusFilter>(routeSearch.status || 'all');
  const [productTypeFilter, setProductTypeFilter] = useState<ProductTypeFilter>(routeSearch.type || 'all');
  const [stockFilter, setStockFilter] = useState<ProductStockFilter>(routeSearch.stock || 'all');
  const [categoryFilter, setCategoryFilter] = useState(routeSearch.category || 'all');
  const [searchQuery, setSearchQuery] = useState(routeSearch.q || '');
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isSavingCustomerProfile, setIsSavingCustomerProfile] = useState(false);
  const [isImportingProducts, setIsImportingProducts] = useState(false);
  const [isCreatingTemplateId, setIsCreatingTemplateId] = useState<string | null>(null);
  const [isSyncingProviderProduct, setIsSyncingProviderProduct] = useState(false);
  const isProductsBusy = isLoading || isSaving || isSavingCustomerProfile || isImportingProducts || isSyncingProviderProduct || Boolean(isCreatingTemplateId);
  const productImportInputRef = useRef<HTMLInputElement>(null);
  const [isMediaLibraryOpen, setIsMediaLibraryOpen] = useState(false);
  const [mediaPickerTarget, setMediaPickerTarget] = useState<'image' | 'gallery' | 'download'>('image');
  const [galleryImageDraft, setGalleryImageDraft] = useState('');
  const [variantDraft, setVariantDraft] = useState<ProductVariantFormState>({
    title: '',
    sku: '',
    option: '',
    price: '',
    inventory: '',
  });
  const [optionMatrixDraft, setOptionMatrixDraft] = useState<ProductOptionMatrixDraft>({
    options: '',
    skuPrefix: '',
    price: '',
    inventory: '',
    replaceExisting: false,
  });
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [frontendDesign, setFrontendDesign] = useState<SiteFrontendDesignContract | null>(null);
  const [frontendDesignLoading, setFrontendDesignLoading] = useState(false);
  const [frontendDesignError, setFrontendDesignError] = useState<string | null>(null);
  const [pendingDeleteProduct, setPendingDeleteProduct] = useState<CollectionRecord | null>(null);
  const [permissionMatrix, setPermissionMatrix] = useState<AdminUserPermissionMatrix | null>(null);
  const [isPermissionsLoading, setIsPermissionsLoading] = useState(Boolean(currentAdmin?.id));
  const [permissionError, setPermissionError] = useState<string | null>(null);
  const isPermissionMatrixPending = isPermissionsLoading && !permissionMatrix;
  const canViewCommerce = !isPermissionMatrixPending && isAdminPermissionAllowed(permissionMatrix, currentAdmin, 'commerce.view', PRODUCT_PERMISSION_ROLE_DEFAULTS);
  const canEditCommerce = !isPermissionMatrixPending && isAdminPermissionAllowed(permissionMatrix, currentAdmin, 'commerce.edit', PRODUCT_PERMISSION_ROLE_DEFAULTS);
  const canConfigureCommerce = !isPermissionMatrixPending && isAdminPermissionAllowed(permissionMatrix, currentAdmin, 'commerce.configure', PRODUCT_PERMISSION_ROLE_DEFAULTS);
  const canDeleteCommerce = !isPermissionMatrixPending && isAdminPermissionAllowed(permissionMatrix, currentAdmin, 'commerce.delete', PRODUCT_PERMISSION_ROLE_DEFAULTS);
  const canViewCollections = !isPermissionMatrixPending && isAdminPermissionAllowed(permissionMatrix, currentAdmin, 'collections.view', PRODUCT_PERMISSION_ROLE_DEFAULTS);
  const canEditCollections = !isPermissionMatrixPending && isAdminPermissionAllowed(permissionMatrix, currentAdmin, 'collections.edit', PRODUCT_PERMISSION_ROLE_DEFAULTS);
  const canExportCollections = !isPermissionMatrixPending && isAdminPermissionAllowed(permissionMatrix, currentAdmin, 'collections.export', PRODUCT_PERMISSION_ROLE_DEFAULTS);
  const canDeleteCollections = !isPermissionMatrixPending && isAdminPermissionAllowed(permissionMatrix, currentAdmin, 'collections.delete', PRODUCT_PERMISSION_ROLE_DEFAULTS);
  const canViewMedia = !isPermissionMatrixPending && isAdminPermissionAllowed(permissionMatrix, currentAdmin, 'media.view', PRODUCT_PERMISSION_ROLE_DEFAULTS);
  const canCreateMedia = !isPermissionMatrixPending && isAdminPermissionAllowed(permissionMatrix, currentAdmin, 'media.create', PRODUCT_PERMISSION_ROLE_DEFAULTS);
  const canEditPages = !isPermissionMatrixPending && isAdminPermissionAllowed(permissionMatrix, currentAdmin, 'pages.edit', PRODUCT_PERMISSION_ROLE_DEFAULTS);
  const canViewProducts = canViewCommerce && canViewCollections;
  const canEditProducts = canEditCommerce && canEditCollections;
  const canConfigureProducts = canConfigureCommerce && canEditCollections;
  const canExportProducts = canViewCommerce && canExportCollections;
  const canDeleteProducts = canDeleteCommerce && canDeleteCollections;
  const viewPermissionTitle = canViewProducts
    ? undefined
    : adminPermissionReason(permissionMatrix, currentAdmin, !canViewCommerce ? 'commerce.view' : 'collections.view', PRODUCT_PERMISSION_ROLE_DEFAULTS);
  const editPermissionTitle = canEditProducts
    ? undefined
    : adminPermissionReason(permissionMatrix, currentAdmin, !canEditCommerce ? 'commerce.edit' : 'collections.edit', PRODUCT_PERMISSION_ROLE_DEFAULTS);
  const configurePermissionTitle = canConfigureProducts
    ? undefined
    : adminPermissionReason(permissionMatrix, currentAdmin, !canConfigureCommerce ? 'commerce.configure' : 'collections.edit', PRODUCT_PERMISSION_ROLE_DEFAULTS);
  const exportPermissionTitle = canExportProducts
    ? undefined
    : adminPermissionReason(permissionMatrix, currentAdmin, !canViewCommerce ? 'commerce.view' : 'collections.export', PRODUCT_PERMISSION_ROLE_DEFAULTS);
  const deletePermissionTitle = canDeleteProducts
    ? undefined
    : adminPermissionReason(permissionMatrix, currentAdmin, !canDeleteCommerce ? 'commerce.delete' : 'collections.delete', PRODUCT_PERMISSION_ROLE_DEFAULTS);
  const mediaViewPermissionTitle = canViewMedia ? undefined : adminPermissionReason(permissionMatrix, currentAdmin, 'media.view', PRODUCT_PERMISSION_ROLE_DEFAULTS);
  const mediaCreatePermissionTitle = canCreateMedia ? undefined : adminPermissionReason(permissionMatrix, currentAdmin, 'media.create', PRODUCT_PERMISSION_ROLE_DEFAULTS);
  const pagesEditPermissionTitle = canEditPages ? undefined : adminPermissionReason(permissionMatrix, currentAdmin, 'pages.edit', PRODUCT_PERMISSION_ROLE_DEFAULTS);
  const isProductsAccessBusy = isProductsBusy || isPermissionMatrixPending;
  const isProductPageTemplateActionDisabled = isPermissionMatrixPending || !canEditPages;

  const activeSite = useMemo(
    () => sites.find((site) => siteMatchesIdentifier(site, selectedSiteId)) || sites[0],
    [selectedSiteId, sites],
  );
  const activeSiteId = activeSite?.publicSiteId || activeSite?.id || selectedSiteId || 'site-demo';
  const activeSiteSearch = useMemo(() => ({ siteId: activeSiteId }), [activeSiteId]);
  const customerCollectionSearch = useMemo(() => ({
    siteId: activeSiteId,
    ...(customersCollection?.id ? { collectionId: customersCollection.id } : {}),
  }), [activeSiteId, customersCollection?.id]);
  const publicBaseUrl = useMemo(() => getPublicBaseUrl(), []);
  const commerceCatalogUrl = `${publicBaseUrl}/api/sites/${encodeURIComponent(activeSiteId)}/commerce/catalog?limit=24&sortBy=title`;
  const commerceProductDetailUrl = `${publicBaseUrl}/api/sites/${encodeURIComponent(activeSiteId)}/commerce/catalog?slug={productSlug}`;
  const commerceOrderContractUrl = `${publicBaseUrl}/api/sites/${encodeURIComponent(activeSiteId)}/commerce/orders`;
  const commerceOrderCreateUrl = `${publicBaseUrl}/api/sites/${encodeURIComponent(activeSiteId)}/commerce/orders`;
  const storefrontApiUrl = `${publicBaseUrl}/api/sites/${encodeURIComponent(activeSiteId)}/collections/${PRODUCT_COLLECTION_SLUG}/records?limit=24&sortBy=title`;
  const storefrontProductDetailUrl = `${publicBaseUrl}/api/sites/${encodeURIComponent(activeSiteId)}/collections/${PRODUCT_COLLECTION_SLUG}/records?slug={productSlug}`;
  const productPageTemplateBriefs = useMemo(() => {
    if (!productCollection) return [];

    const buildBrief = ({
      id,
      mode,
      variant,
      title,
      slug,
      description,
      nav,
      navLabel,
      focus,
      routePattern,
      sections,
    }: {
      id: string;
      mode: ProductPageTemplateMode;
      variant: string;
      title: string;
      slug: string;
      description: string;
      nav: 'primary' | 'none';
      navLabel: string;
      focus: string;
      routePattern: string;
      sections: string[];
    }) => {
      const search = {
        siteId: activeSiteId,
        template: 'storefront',
        collectionId: productCollection.id,
        datasetMode: mode,
        title,
        slug,
        description,
        nav,
        navLabel,
      } as const;
      const createRoute = `/pages/new?${new URLSearchParams(search).toString()}`;

      return {
        id,
        mode,
        variant,
        title,
        slug,
        description,
        nav,
        navLabel,
        focus,
        routePattern,
        sections,
        createRoute,
        search,
        manifest: {
          schemaVersion: 'backy.product-page-template.v1',
          id,
          mode,
          variant,
          createRoute,
          page: {
            suggestedTitle: title,
            suggestedSlug: slug,
            navigationPlacement: nav,
            navigationLabel: navLabel,
            routePattern,
          },
          dataset: {
            collectionId: productCollection.id,
            collectionSlug: PRODUCT_COLLECTION_SLUG,
            datasetMode: mode,
            titleField: productFieldKey('title'),
            descriptionField: productFieldKey('description'),
            imageField: productFieldKey('imageUrl'),
            detailHref: '/products/{recordSlug}',
          },
          storefrontSections: sections,
          dynamicRoutePromotion: {
            routePattern,
            promotionTarget: mode === 'item' ? 'product-detail-route' : 'product-list-route',
            requiredBindings: mode === 'item'
              ? ['recordSlug', productFieldKey('title'), productFieldKey('price'), productFieldKey('imageUrl'), productFieldKey('variants'), productFieldKey('checkoutUrl')]
              : [productFieldKey('title'), productFieldKey('price'), productFieldKey('imageUrl'), productFieldKey('category'), productFieldKey('featured'), productFieldKey('inventory')],
          },
          publicApis: {
            catalog: commerceCatalogUrl,
            productBySlug: commerceProductDetailUrl,
            orderIntake: commerceOrderContractUrl,
          },
        },
      };
    };

    return [
      buildBrief({
        id: 'catalog-grid',
        mode: 'list',
        variant: 'Catalog grid',
        title: 'Product catalog',
        slug: 'products-list',
        description: 'A storefront product list page bound to the Backy products collection with product cards, filters, and checkout-ready links.',
        nav: 'primary',
        navLabel: 'Shop',
        focus: 'Browseable product grid with merchandising filters and checkout-ready card links.',
        routePattern: '/products',
        sections: ['storefront hero', 'featured product', 'product grid', 'category filters', 'checkout CTA'],
      }),
      buildBrief({
        id: 'featured-collection',
        mode: 'list',
        variant: 'Featured collection',
        title: 'Featured products',
        slug: 'featured-products',
        description: 'A campaign-ready collection page for featured products, seasonal categories, and curated storefront launches.',
        nav: 'primary',
        navLabel: 'Featured',
        focus: 'Curated landing-style storefront with featured, category, and promotion-ready sections.',
        routePattern: '/collections/featured',
        sections: ['campaign hero', 'featured repeater', 'category rail', 'promotion banner', 'order-intake CTA'],
      }),
      buildBrief({
        id: 'product-detail',
        mode: 'item',
        variant: 'Product detail',
        title: 'Product detail',
        slug: 'product-detail',
        description: 'A storefront product detail page bound to one Backy product record with title, description, media, variants, and checkout metadata.',
        nav: 'none',
        navLabel: 'Product',
        focus: 'Single-record product route with complete media, variant, delivery, subscription, and checkout bindings.',
        routePattern: '/products/:recordSlug',
        sections: ['media gallery', 'title and price', 'variant selector', 'stock and delivery', 'checkout handoff'],
      }),
      buildBrief({
        id: 'product-launch',
        mode: 'item',
        variant: 'Product launch',
        title: 'Product launch',
        slug: 'product-launch',
        description: 'A launch page for one product with hero storytelling, social metadata, availability, subscription, and checkout actions.',
        nav: 'none',
        navLabel: 'Launch',
        focus: 'Editorial product page with hero, benefit sections, return policy, subscription metadata, and checkout CTA.',
        routePattern: '/launch/:recordSlug',
        sections: ['launch hero', 'benefits', 'gallery', 'subscription offer', 'return policy', 'checkout CTA'],
      }),
    ];
  }, [activeSiteId, commerceCatalogUrl, commerceOrderContractUrl, commerceProductDetailUrl, productCollection]);
  const missingProductFields = useMemo(() => (
    productCollection ? getMissingProductFieldKeys(productCollection) : []
  ), [productCollection]);
  const productApiReady = Boolean(
    productCollection?.status === 'published' &&
    productCollection.permissions.publicRead &&
    missingProductFields.length === 0,
  );
  const orderIntakeReady = Boolean(
    productApiReady &&
    ordersCollection?.status === 'published' &&
    isOrderCollectionPrivate(ordersCollection),
  );
  const selectedProduct = useMemo(
    () => products.find((product) => product.id === selectedProductId) || null,
    [products, selectedProductId],
  );
  const selectedProductProviderSync = useMemo(
    () => productProviderSync(selectedProduct),
    [selectedProduct],
  );
  const selectedCustomerProfile = useMemo(
    () => customerProfiles.find((customer) => customer.id === selectedCustomerProfileId) || null,
    [customerProfiles, selectedCustomerProfileId],
  );
  const frontendProductTemplates = useMemo(
    () => (frontendDesign?.templates || []).filter((template) => template.type === 'product'),
    [frontendDesign?.templates],
  );
  const activeFrontendTemplateId = routeSearch.frontendTemplate || '';
  const frontendProductTemplateBlueprints = useMemo(
    () => frontendProductTemplates.map((template) => ({
      template,
      blueprint: buildFrontendProductTemplateBlueprint(template),
    })),
    [frontendProductTemplates],
  );
  const galleryImageUrls = useMemo(
    () => parseGalleryImages(formState.galleryImages),
    [formState.galleryImages],
  );
  const productVariants = useMemo(
    () => parseProductVariants(formState.variants),
    [formState.variants],
  );
  const productCategories = useMemo(() => (
    [...new Set(products.map((product) => String(readProductValue(product.values, 'category', '') || '').trim()).filter(Boolean))]
      .sort((a, b) => a.localeCompare(b))
  ), [products]);
  const hasActiveCatalogFilters = Boolean(
    searchQuery.trim() ||
    statusFilter !== 'all' ||
    productTypeFilter !== 'all' ||
    stockFilter !== 'all' ||
    categoryFilter !== 'all',
  );
  const loadedProductCount = products.length;
  const totalProductCount = productPagination?.total ?? loadedProductCount;
  const hasMoreProducts = productPagination?.hasMore === true;
  const filteredProducts = useMemo(() => {
    const normalizedSearch = searchQuery.trim().toLowerCase();
    return products.filter((product) => {
      const matchesStatus = statusFilter === 'all' || product.status === statusFilter;
      if (!matchesStatus) return false;

      const values = product.values;
      const stockState = getProductStockState(values);
      const category = String(readProductValue(values, 'category', '') || '').trim();
      const checkoutUrl = String(readProductValue(values, 'checkoutUrl', '') || '').trim();

      if (productTypeFilter !== 'all' && stockState.productType !== productTypeFilter) {
        return false;
      }

      if (categoryFilter !== 'all' && category !== categoryFilter) {
        return false;
      }

      if (stockFilter === 'in-stock' && !stockState.inStock) {
        return false;
      }
      if (stockFilter === 'low-stock' && !stockState.lowStock) {
        return false;
      }
      if (stockFilter === 'out-of-stock' && !stockState.outOfStock) {
        return false;
      }
      if (stockFilter === 'featured' && !readProductValue(values, 'featured')) {
        return false;
      }
      if (stockFilter === 'checkout-missing' && checkoutUrl) {
        return false;
      }

      const matchesSearch = !normalizedSearch || [
        product.slug,
        readProductValue(values, 'title'),
        readProductValue(values, 'sku'),
        readProductValue(values, 'category'),
        readProductValue(values, 'vendor'),
        formatTags(readProductValue(values, 'tags')).join(' '),
        readProductValue(values, 'description'),
      ].some((value) => String(value || '').toLowerCase().includes(normalizedSearch));

      return matchesSearch;
    });
  }, [categoryFilter, productTypeFilter, products, searchQuery, statusFilter, stockFilter]);
  const metrics = useMemo(() => ({
    total: totalProductCount,
    published: products.filter((product) => product.status === 'published').length,
    draft: products.filter((product) => product.status === 'draft').length,
    scheduled: products.filter((product) => product.status === 'scheduled').length,
    inventory: products.reduce((sum, product) => sum + toNumber(readProductValue(product.values, 'inventory')), 0),
    lowStock: products.filter((product) => getProductStockState(product.values).lowStock).length,
    digital: products.filter((product) => readProductValue(product.values, 'productType') === 'digital').length,
    categories: new Set(products.map((product) => String(readProductValue(product.values, 'category', '') || '').trim()).filter(Boolean)).size,
  }), [products, totalProductCount]);
  const commerceAnalytics = useMemo(() => {
    const productLookup = new Map<string, CollectionRecord>();
    products.forEach((product) => {
      [
        product.id,
        product.slug,
        String(readProductValue(product.values, 'sku', '') || ''),
        String(readProductValue(product.values, 'title', '') || ''),
      ]
        .map((value) => value.trim().toLowerCase())
        .filter(Boolean)
        .forEach((key) => productLookup.set(key, product));
    });

    const orderSummaries = recentOrders.map((order) => {
      const values = order.values || {};
      const total = toNumber(values.total);
      const paymentStatus = String(values.paymentstatus || values.paymentStatus || '').trim().toLowerCase();
      const orderStatus = String(values.orderstatus || values.orderStatus || order.status || '').trim().toLowerCase();
      const isPaid = paymentStatus === 'paid' || orderStatus === 'paid' || orderStatus === 'fulfilled';
      const isRefunded = paymentStatus === 'refunded' || orderStatus === 'refunded';

      return {
        id: order.id,
        slug: order.slug,
        orderNumber: String(values.ordernumber || values.orderNumber || order.slug || ''),
        customerName: String(values.customername || values.customerName || values.email || 'Unknown customer'),
        email: String(values.email || ''),
        total,
        currency: normalizeCurrency(String(values.currency || 'USD')),
        paymentStatus: paymentStatus || 'unknown',
        orderStatus: orderStatus || 'unknown',
        isPaid,
        isRefunded,
        lineItems: parseOrderLineItems(values.items, String(values.currency || 'USD')),
        updatedAt: order.updatedAt || order.createdAt || '',
      };
    });
    const paidOrders = orderSummaries.filter((order) => order.isPaid);
    const refundedOrders = orderSummaries.filter((order) => order.isRefunded);
    const revenue = paidOrders.reduce((sum, order) => sum + order.total, 0);
    const averageOrderValue = paidOrders.length > 0 ? revenue / paidOrders.length : 0;
    const productPerformance = new Map<string, {
      productId: string;
      slug: string;
      title: string;
      sku: string;
      units: number;
      revenue: number;
      orderIds: Set<string>;
      currency: string;
      status: string;
      inventory: number;
      lowStock: boolean;
    }>();

    paidOrders.forEach((order) => {
      order.lineItems.forEach((item) => {
        const lookupKey = [item.productId, item.slug, item.sku, item.title]
          .map((value) => value.trim().toLowerCase())
          .find((value) => productLookup.has(value));
        const product = lookupKey ? productLookup.get(lookupKey) || null : null;
        const productValues = product?.values || {};
        const aggregationKey = product?.id || item.productId || item.slug || item.sku || item.title;
        if (!aggregationKey) return;

        const stockState = product ? getProductStockState(productValues) : { lowStock: false };
        const current = productPerformance.get(aggregationKey) || {
          productId: product?.id || item.productId,
          slug: product?.slug || item.slug,
          title: String(readProductValue(productValues, 'title', item.title) || item.title),
          sku: String(readProductValue(productValues, 'sku', item.sku) || item.sku),
          units: 0,
          revenue: 0,
          orderIds: new Set<string>(),
          currency: item.currency || order.currency,
          status: product?.status || 'order-only',
          inventory: product ? toNumber(readProductValue(productValues, 'inventory')) : 0,
          lowStock: Boolean(stockState.lowStock),
        };

        current.units += item.quantity;
        current.revenue += item.lineTotal;
        current.orderIds.add(order.id);
        productPerformance.set(aggregationKey, current);
      });
    });

    const customerSummaries = customerProfiles.map((customer) => {
      const values = customer.values || {};
      return {
        id: customer.id,
        slug: customer.slug,
        name: String(values.name || values.fullname || values.customername || values.email || customer.slug),
        email: String(values.email || ''),
        phone: String(values.phone || ''),
        status: String(values.status || 'customer'),
        notes: String(values.notes || ''),
        orderCount: toNumber(values.ordercount || values.orderCount),
        totalSpent: toNumber(values.totalspent || values.totalSpent),
        lastOrderNumber: String(values.lastordernumber || values.lastOrderNumber || ''),
      };
    });

    return {
      orderCount: orderSummaries.length,
      paidOrderCount: paidOrders.length,
      refundedOrderCount: refundedOrders.length,
      revenue,
      averageOrderValue,
      currency: orderSummaries[0]?.currency || 'USD',
      customerCount: customerSummaries.length,
      repeatCustomerCount: customerSummaries.filter((customer) => customer.orderCount > 1).length,
      topCustomers: [...customerSummaries]
        .sort((first, second) => second.totalSpent - first.totalSpent)
        .slice(0, 3),
      topProducts: [...productPerformance.values()]
        .sort((first, second) => second.revenue - first.revenue || second.units - first.units)
        .slice(0, 5)
        .map(({ orderIds, ...product }) => ({
          ...product,
          revenue: moneyValue(product.revenue),
          orderCount: orderIds.size,
        })),
      recentOrders: orderSummaries.slice(0, 5),
    };
  }, [customerProfiles, products, recentOrders]);
  const backendAnalyticsCurrency = orderAnalytics?.currencies[0]?.currency || commerceAnalytics.currency;
  const catalogReadiness = useMemo(() => {
    const hasSchema = Boolean(productCollection);
    const hasProducts = products.length > 0;
    const hasPublished = metrics.published > 0;
    const hasVariants = products.some((product) => formatProductVariants(readProductValue(product.values, 'variants')).length > 0);
    const hasInventory = metrics.inventory > 0 || metrics.digital > 0 || hasVariants;
    const hasImages = products.some((product) => Boolean(readProductValue(product.values, 'imageUrl')) || formatGalleryImages(readProductValue(product.values, 'galleryImages')).length > 0);
    const hasPricing = products.some((product) => toNumber(readProductValue(product.values, 'price')) > 0);
    const hasMerchandising = products.some((product) => Boolean(readProductValue(product.values, 'category')) || formatTags(readProductValue(product.values, 'tags')).length > 0 || Boolean(readProductValue(product.values, 'vendor')));
    const hasCheckoutUrls = products.some((product) => Boolean(String(readProductValue(product.values, 'checkoutUrl', '') || '').trim()));
    const hasSubscriptionMetadata = products.some((product) => Boolean(readProductValue(product.values, 'subscriptionEnabled')));
    const checks = [
      {
        label: 'Catalog schema',
        detail: hasSchema ? 'Products collection exists.' : 'Set up the products collection.',
        ready: hasSchema,
      },
      {
        label: 'Commerce fields',
        detail: missingProductFields.length === 0
          ? 'Pricing, SKU, inventory, image, delivery, tax, and SEO fields are present.'
          : `${missingProductFields.length} field${missingProductFields.length === 1 ? '' : 's'} need sync.`,
        ready: hasSchema && missingProductFields.length === 0,
      },
      {
        label: 'Storefront API',
        detail: productApiReady ? 'Public read API is ready for storefronts.' : 'Publish and sync the schema before storefront handoff.',
        ready: productApiReady,
      },
      {
        label: 'Order intake',
        detail: orderIntakeReady
          ? 'Checkout posts can create private Backy orders.'
          : ordersCollection
            ? 'Orders collection must be published and private for public checkout intake.'
            : 'Set up the private orders queue before using checkout intake.',
        ready: orderIntakeReady,
      },
      {
        label: 'Product inventory',
        detail: hasProducts ? `${products.length} product${products.length === 1 ? '' : 's'} in the catalog.` : 'Create the first sellable product.',
        ready: hasProducts,
      },
      {
        label: 'Published products',
        detail: hasPublished ? `${metrics.published} product${metrics.published === 1 ? '' : 's'} public.` : 'Publish products before a frontend lists them.',
        ready: hasPublished,
      },
      {
        label: 'Pricing',
        detail: hasPricing ? 'At least one product has storefront pricing.' : 'Add prices before selling products.',
        ready: hasPricing,
      },
      {
        label: 'Checkout handoff',
        detail: hasCheckoutUrls ? 'Products include checkout URLs for external checkout.' : 'Add checkout URLs or wire the order-intake contract.',
        ready: hasCheckoutUrls || orderIntakeReady,
      },
      {
        label: 'Subscriptions',
        detail: hasSubscriptionMetadata ? 'Recurring-plan interval and trial metadata is available to storefronts.' : 'Enable subscription metadata when selling recurring products.',
        ready: hasSubscriptionMetadata || products.length === 0,
      },
      {
        label: 'Variants',
        detail: hasVariants ? 'Product options are available for storefront selectors.' : 'Add variants for sizes, licenses, colors, tiers, or formats.',
        ready: hasVariants || products.length === 0,
      },
      {
        label: 'Stock or delivery',
        detail: hasInventory ? `${metrics.inventory} units or ${metrics.digital} digital product${metrics.digital === 1 ? '' : 's'}.` : 'Add inventory or digital delivery metadata.',
        ready: hasInventory,
      },
      {
        label: 'Product media',
        detail: hasImages ? 'Product imagery or galleries are attached.' : 'Attach media so storefront cards are not text-only.',
        ready: hasImages || products.length === 0,
      },
      {
        label: 'Merchandising',
        detail: hasMerchandising ? 'Category, tags, or vendor metadata is available.' : 'Add category, tags, or vendor data for storefront filtering.',
        ready: hasMerchandising || products.length === 0,
      },
    ];
    const readyCount = checks.filter((check) => check.ready).length;

    return {
      score: Math.round((readyCount / checks.length) * 100),
      checks,
      workflow: [
        { label: 'Setup', detail: 'Create or sync the products schema with pricing, SKU, stock, image, SEO, and delivery fields.' },
        { label: 'Merchandise', detail: 'Add product data, attach media, set featured/taxable/shipping controls, and write descriptions.' },
        { label: 'Publish', detail: 'Publish catalog records and expose public read APIs for custom storefront pages.' },
        { label: 'Sell', detail: 'Keep products public and orders private, then use the commerce order-intake contract for checkout carts.' },
        { label: 'Operate', detail: 'Track inventory, low stock, digital products, drafts, and archived products from one catalog view.' },
      ],
    };
  }, [
    metrics.digital,
    metrics.inventory,
    metrics.published,
    missingProductFields.length,
    orderIntakeReady,
    ordersCollection,
    productApiReady,
    productCollection,
    products,
  ]);
  const scheduledProductDateError = getScheduledProductDateError(formState.status, formState.scheduledAt);
  const minimumScheduledAt = toDateTimeLocalValue(new Date(Date.now() + 60_000).toISOString());
  const providerCertificationSummary = useMemo(() => ({
    generatedAt: new Date().toISOString(),
    schemaVersion: 'backy.commerce-provider-certification-handoff.v1',
    status: 'external-live-provider-gate',
    requiredFor: 'live-commerce-provider-launch',
    selectedSiteId: activeSiteId,
    site: {
      id: activeSiteId,
      name: activeSite?.name || activeSiteId,
      slug: activeSite?.slug,
      status: activeSite?.status,
    },
    localMockGate: 'ci:commerce-provider-smoke',
    liveCertificationGate: 'ci:commerce-provider-certification',
    secretHandling: 'Provider credentials stay in server environment/configuration; product records and handoff manifests only expose non-secret readiness evidence.',
    catalogEvidence: {
      apiReady: productApiReady,
      orderIntakeReady,
      readinessScore: catalogReadiness.score,
      missingProductFields,
      totalProductCount,
      loadedProductCount,
      filteredProductCount: filteredProducts.length,
    },
    endpointEvidence: {
      commerceCatalog: commerceCatalogUrl,
      commerceOrderCreate: commerceOrderCreateUrl,
      providerSync: `${publicBaseUrl}/api/admin/sites/${encodeURIComponent(activeSiteId)}/commerce/products/{productId}/provider-sync`,
      productSubscriptions: `${publicBaseUrl}/api/admin/sites/${encodeURIComponent(activeSiteId)}/commerce/products/{productId}/subscriptions`,
      productSubscriptionAction: `${publicBaseUrl}/api/admin/sites/${encodeURIComponent(activeSiteId)}/commerce/products/{productId}/subscriptions/{orderId}/action`,
    },
    groups: PRODUCT_PROVIDER_CERTIFICATION_GROUPS.map((group) => ({
      family: group.family,
      providers: [...group.providers],
      gate: group.gate,
      requiredInputs: [...group.requiredInputs],
      evidence: group.evidence,
    })),
  }), [
    activeSite?.name,
    activeSite?.slug,
    activeSite?.status,
    activeSiteId,
    catalogReadiness.score,
    commerceCatalogUrl,
    commerceOrderCreateUrl,
    filteredProducts.length,
    loadedProductCount,
    missingProductFields,
    orderIntakeReady,
    productApiReady,
    publicBaseUrl,
    totalProductCount,
  ]);

  const productHandoff = useMemo(() => ({
    site: {
      id: activeSiteId,
      name: activeSite?.name || activeSiteId,
      slug: activeSite?.slug,
      status: activeSite?.status,
    },
    generatedAt: new Date().toISOString(),
    collection: productCollection
      ? {
          id: productCollection.id,
          name: productCollection.name,
          slug: productCollection.slug,
          status: productCollection.status,
          listRoutePattern: productCollection.listRoutePattern,
          routePattern: productCollection.routePattern,
          permissions: productCollection.permissions,
          missingFields: missingProductFields,
          fields: mergeProductFields(productCollection.fields).map((field) => ({
            key: field.key,
            label: field.label,
            type: field.type,
            required: field.required,
            unique: field.unique,
            options: field.options,
            defaultValue: field.defaultValue,
          })),
        }
      : null,
    endpoints: {
      commerceCatalog: commerceCatalogUrl,
      commerceProductBySlug: commerceProductDetailUrl,
      commerceOrderContract: commerceOrderContractUrl,
      commerceOrderCreate: commerceOrderCreateUrl,
      productNotificationEvents: `${publicBaseUrl}/api/sites/${encodeURIComponent(activeSiteId)}/events?kind=commerce-product`,
      list: storefrontApiUrl,
      bySlug: storefrontProductDetailUrl,
    },
    apiContracts: PRODUCT_API_CONTRACTS.map((contract) => ({
      ...contract,
      endpoint: {
        key: contract.endpointKey,
        url: {
          commerceCatalog: commerceCatalogUrl,
          commerceOrderContract: commerceOrderContractUrl,
          providerSync: `${publicBaseUrl}/api/admin/sites/${encodeURIComponent(activeSiteId)}/commerce/products/{productId}/provider-sync`,
          productSubscriptions: `${publicBaseUrl}/api/admin/sites/${encodeURIComponent(activeSiteId)}/commerce/products/{productId}/subscriptions`,
          productSubscriptionAction: `${publicBaseUrl}/api/admin/sites/${encodeURIComponent(activeSiteId)}/commerce/products/{productId}/subscriptions/{orderId}/action`,
          productNotificationEvents: `${publicBaseUrl}/api/sites/${encodeURIComponent(activeSiteId)}/events?kind=commerce-product`,
        }[contract.endpointKey],
      },
      responseHeaders: {
        contract: 'x-backy-contract',
        schema: 'x-backy-schema-version',
        request: 'x-backy-request-id',
        cacheScope: 'x-backy-cache-scope',
      },
    })),
    orderIntake: {
      ready: orderIntakeReady,
      endpoint: commerceOrderContractUrl,
      method: 'POST',
      ordersCollection: ordersCollection
        ? {
            id: ordersCollection.id,
            slug: ordersCollection.slug,
            status: ordersCollection.status,
            permissions: ordersCollection.permissions,
          }
        : null,
      requirement: 'The products collection must be public, while the orders collection must stay published and private.',
    },
    providerExecution: {
      quoteProviders: 'Configured HTTP tax, shipping, and discount quote providers can adjust checkout totals before order persistence.',
      catalogSync: 'Product records can be synchronized to Stripe, PayPal, Paddle, Square, Shopify, BigCommerce, WooCommerce, Etsy, Magento, or a configured HTTP catalog-sync provider from the Products workspace.',
      providerCertification: providerCertificationSummary,
      reconciliation: {
        readiness: reconciliationReadiness,
        lastPreview: reconciliationResult
          ? {
              schemaVersion: reconciliationResult.schemaVersion,
              runMode: reconciliationResult.runMode,
              dryRun: reconciliationResult.dryRun,
              eventCount: reconciliationResult.eventCount,
              eligibleUpdateCount: reconciliationResult.eligibleUpdateCount ?? 0,
              updatedCount: reconciliationResult.updatedCount,
              unmatchedCount: reconciliationResult.unmatchedCount,
              processedAt: reconciliationResult.processedAt,
            }
          : null,
      },
    },
    storefrontContract: {
      collectionSlug: PRODUCT_COLLECTION_SLUG,
      routePatterns: {
        list: productCollection?.listRoutePattern || '/products',
        detail: productCollection?.routePattern || '/products/:recordSlug',
      },
      cardFields: ['title', 'slug', productFieldKey('price'), productFieldKey('compareAtPrice'), productFieldKey('currency'), productFieldKey('imageUrl'), productFieldKey('galleryImages'), productFieldKey('variants'), productFieldKey('category'), productFieldKey('vendor'), productFieldKey('featured')],
      detailFields: PRODUCT_FIELDS.map((field) => field.key),
      filterFacets: ['status', productFieldKey('category'), productFieldKey('tags'), productFieldKey('vendor'), productFieldKey('productType'), productFieldKey('featured'), productFieldKey('inventoryPolicy')],
      checkout: {
        mode: orderIntakeReady ? 'Backy order intake or per-product checkoutUrl' : 'per-product checkoutUrl',
        configuredProducts: products.filter((product) => Boolean(String(readProductValue(product.values, 'checkoutUrl', '') || '').trim())).length,
        orderIntakeReady,
        reservesInventory: orderIntakeReady,
        note: orderIntakeReady
          ? 'Custom frontends can post cart/customer data to Backy order intake, receive a checkout-session handoff, and reserve physical product or variant stock while provider settlement remains a deeper commerce milestone.'
          : 'Backy stores product checkout URLs today. Sync the private orders queue before using order-intake checkout sessions.',
      },
      normalizedApi: {
        schemaVersion: 'backy.commerce-catalog.v1',
        catalog: commerceCatalogUrl,
        productBySlug: commerceProductDetailUrl,
        note: 'Use this endpoint for storefront cards, facets, inventory state, delivery metadata, and checkout URL handoff without re-mapping raw collection fields.',
      },
    },
    frontendDesign: frontendDesign ? {
      status: frontendDesign.status,
      source: frontendDesign.source,
      productTemplates: frontendProductTemplates.map((template) => ({
        id: template.id,
        name: template.name,
        routePattern: template.routePattern,
        bindingHints: template.bindingHints || [],
      })),
    } : null,
    pageBuilderContract: {
      model: 'Products are sellable CMS records that page and blog canvases can bind into storefront grids, detail sections, variant controls, checkout calls to action, and merchandising filters.',
      targets: PRODUCT_PAGE_BINDING_TARGETS,
      starterRoute: `/pages/new?siteId=${encodeURIComponent(activeSiteId)}&template=storefront`,
      productListTemplateRoute: productPageTemplateBriefs.find((brief) => brief.mode === 'list')?.createRoute || null,
      productDetailTemplateRoute: productPageTemplateBriefs.find((brief) => brief.mode === 'item')?.createRoute || null,
      productPageTemplates: productPageTemplateBriefs.map((brief) => brief.manifest),
      canvasBlocks: ['product-card', 'product-grid', 'product-detail', 'variant-selector', 'cart-button', 'checkout-button', 'related-products'],
      requiredFields: [productFieldKey('title'), 'slug', productFieldKey('sku'), productFieldKey('price'), productFieldKey('currency'), productFieldKey('inventory'), productFieldKey('productType'), productFieldKey('checkoutUrl')],
      optionalFields: [productFieldKey('compareAtPrice'), productFieldKey('variants'), productFieldKey('galleryImages'), productFieldKey('downloadUrl'), productFieldKey('subscriptionEnabled'), productFieldKey('subscriptionInterval'), productFieldKey('subscriptionTrialDays'), productFieldKey('shippingProfile'), productFieldKey('taxClass'), productFieldKey('discountCode'), productFieldKey('returnPolicy'), productFieldKey('category'), productFieldKey('tags'), productFieldKey('vendor'), productFieldKey('seoTitle'), productFieldKey('featured'), productFieldKey('taxable')],
    },
    frontendSystems: PRODUCT_FRONTEND_SYSTEMS,
    readiness: {
      ready: productApiReady,
      score: catalogReadiness.score,
      checks: catalogReadiness.checks,
    },
    metrics,
    commerceAnalytics: {
      ordersLoaded: commerceAnalytics.orderCount,
      paidOrders: commerceAnalytics.paidOrderCount,
      refundedOrders: commerceAnalytics.refundedOrderCount,
      revenue: commerceAnalytics.revenue,
      averageOrderValue: commerceAnalytics.averageOrderValue,
      currency: commerceAnalytics.currency,
      customerProfilesLoaded: commerceAnalytics.customerCount,
      repeatCustomers: commerceAnalytics.repeatCustomerCount,
      topProducts: commerceAnalytics.topProducts.map((product) => ({
        productId: product.productId,
        slug: product.slug,
        title: product.title,
        sku: product.sku,
        units: product.units,
        revenue: product.revenue,
        currency: product.currency,
        orderCount: product.orderCount,
        status: product.status,
        inventory: product.inventory,
        lowStock: product.lowStock,
      })),
      customersCollection: customersCollection
        ? {
            id: customersCollection.id,
            slug: customersCollection.slug,
            status: customersCollection.status,
            permissions: customersCollection.permissions,
          }
        : null,
      backendOrderAnalytics: orderAnalytics ? {
        schemaVersion: orderAnalytics.schemaVersion,
        generatedAt: orderAnalytics.generatedAt,
        recordLimit: orderAnalytics.recordLimit,
        orderCount: orderAnalytics.orderCount,
        revenue: orderAnalytics.revenue,
        operations: orderAnalytics.operations,
        sources: orderAnalytics.sources,
        currencies: orderAnalytics.currencies,
        trend: orderAnalytics.trend,
      } : null,
    },
    notifications: {
      lowStockAutomation: 'Checkout inventory reservation emits commerce-product events when a physical product crosses its low-stock threshold.',
      events: productNotificationEvents.map((event) => ({
        id: event.id,
        status: event.status,
        target: event.target,
        channel: String(event.metadata?.channel || ''),
        event: String(event.metadata?.event || ''),
        productId: String(event.metadata?.productId || ''),
        productTitle: String(event.metadata?.productTitle || ''),
        inventory: Number(event.metadata?.inventory || 0),
        lowStockThreshold: Number(event.metadata?.lowStockThreshold || 0),
        createdAt: event.createdAt,
      })),
    },
    filters: {
      search: searchQuery,
      status: statusFilter,
      productType: productTypeFilter,
      category: categoryFilter,
      stock: stockFilter,
      visible: filteredProducts.length,
      loaded: loadedProductCount,
      total: totalProductCount,
      hasMore: hasMoreProducts,
    },
    export: {
      csvIncludesPricing: true,
      csvIncludesInventory: true,
      csvIncludesMerchandising: true,
      csvIncludesCheckoutUrls: true,
      csvColumns: PRODUCT_EXPORT_COLUMNS,
      filteredRows: filteredProducts.length,
    },
    products: products.map((product) => ({
      id: product.id,
      slug: product.slug,
      status: product.status,
      updatedAt: product.updatedAt,
      title: String(readProductValue(product.values, 'title', product.slug) || product.slug),
      sku: String(readProductValue(product.values, 'sku', '') || ''),
      variants: formatProductVariants(readProductValue(product.values, 'variants')),
      price: toNumber(readProductValue(product.values, 'price')),
      compareAtPrice: readProductValue(product.values, 'compareAtPrice') === null || readProductValue(product.values, 'compareAtPrice') === undefined
        ? null
        : toNumber(readProductValue(product.values, 'compareAtPrice')),
      currency: normalizeCurrency(String(readProductValue(product.values, 'currency', 'USD') || 'USD')),
      inventory: toNumber(readProductValue(product.values, 'inventory')),
      productType: asProductType(readProductValue(product.values, 'productType')),
      imageUrl: String(readProductValue(product.values, 'imageUrl', '') || ''),
      galleryImages: formatGalleryImages(readProductValue(product.values, 'galleryImages')),
      category: String(readProductValue(product.values, 'category', '') || ''),
      tags: formatTags(readProductValue(product.values, 'tags')),
      vendor: String(readProductValue(product.values, 'vendor', '') || ''),
      description: String(readProductValue(product.values, 'description', '') || ''),
      seoTitle: String(readProductValue(product.values, 'seoTitle', '') || ''),
      featured: Boolean(readProductValue(product.values, 'featured')),
      taxable: readProductValue(product.values, 'taxable') !== false,
      shippingRequired: readProductValue(product.values, 'shippingRequired') !== false,
      lowStockThreshold: toNumber(readProductValue(product.values, 'lowStockThreshold', 5) || 5),
      inventoryPolicy: asInventoryPolicy(readProductValue(product.values, 'inventoryPolicy')),
      weight: readProductValue(product.values, 'weight') === null || readProductValue(product.values, 'weight') === undefined ? null : toNumber(readProductValue(product.values, 'weight')),
      downloadUrl: String(readProductValue(product.values, 'downloadUrl', '') || ''),
      checkoutUrl: String(readProductValue(product.values, 'checkoutUrl', '') || ''),
      subscription: {
        enabled: Boolean(readProductValue(product.values, 'subscriptionEnabled')),
        interval: asSubscriptionInterval(readProductValue(product.values, 'subscriptionInterval')),
        trialDays: Math.max(0, toNumber(readProductValue(product.values, 'subscriptionTrialDays'))),
      },
      scheduledAt: product.scheduledAt || null,
      storefrontPath: `/products/${product.slug}`,
      frontendDesignTemplateId: getProductFrontendTemplateId(product),
    })),
  }), [
    activeSite?.name,
    activeSite?.slug,
    activeSite?.status,
    activeSiteId,
    catalogReadiness.checks,
    catalogReadiness.score,
    categoryFilter,
    commerceCatalogUrl,
    commerceAnalytics,
    commerceProductDetailUrl,
    commerceOrderContractUrl,
    commerceOrderCreateUrl,
    filteredProducts.length,
    frontendDesign,
    frontendProductTemplates,
    customersCollection,
    hasMoreProducts,
    loadedProductCount,
    metrics,
    missingProductFields,
    orderIntakeReady,
    orderAnalytics,
    ordersCollection,
    productApiReady,
    productPageTemplateBriefs,
    productTypeFilter,
    productCollection,
    productNotificationEvents,
    products,
    providerCertificationSummary,
    publicBaseUrl,
    reconciliationReadiness,
    reconciliationResult,
    searchQuery,
    storefrontApiUrl,
    storefrontProductDetailUrl,
    statusFilter,
    stockFilter,
    totalProductCount,
  ]);
  const productHandoffText = useMemo(() => JSON.stringify(productHandoff, null, 2), [productHandoff]);
  const providerCertificationHandoffText = useMemo(() => JSON.stringify(providerCertificationSummary, null, 2), [providerCertificationSummary]);
  const productsRouteSearch = useMemo<ProductsSearch>(() => ({
    siteId: activeSiteId,
    ...(statusFilter !== 'all' ? { status: statusFilter } : {}),
    ...(productTypeFilter !== 'all' ? { type: productTypeFilter } : {}),
    ...(stockFilter !== 'all' ? { stock: stockFilter } : {}),
    ...(categoryFilter !== 'all' ? { category: categoryFilter } : {}),
    ...(searchQuery.trim() ? { q: searchQuery.trim() } : {}),
    ...(selectedProductId ? { productId: selectedProductId } : {}),
    ...(activeFrontendTemplateId ? { frontendTemplate: activeFrontendTemplateId } : {}),
  }), [activeFrontendTemplateId, activeSiteId, categoryFilter, productTypeFilter, searchQuery, selectedProductId, statusFilter, stockFilter]);

  const updateProductsRouteSearch = (next: ProductsSearch) => {
    const merged: ProductsSearch = {
      ...productsRouteSearch,
      ...next,
    };
    const normalized: ProductsSearch = {
      siteId: merged.siteId || activeSiteId,
      ...(merged.status && merged.status !== 'all' ? { status: merged.status } : {}),
      ...(merged.type && merged.type !== 'all' ? { type: merged.type } : {}),
      ...(merged.stock && merged.stock !== 'all' ? { stock: merged.stock } : {}),
      ...(merged.category && merged.category !== 'all' ? { category: merged.category } : {}),
      ...(merged.q?.trim() ? { q: merged.q.trim() } : {}),
      ...(merged.productId ? { productId: merged.productId } : {}),
      ...(merged.frontendTemplate?.trim() ? { frontendTemplate: merged.frontendTemplate.trim() } : {}),
    };

    navigate({ to: '/products', search: normalized, replace: true });
  };

  const loadProductNotificationEvents = async () => {
    if (!canViewCommerce) {
      setProductNotificationEvents([]);
      setProductNotificationError(null);
      return;
    }

    try {
      const result = await listProductNotificationEvents(activeSiteId, { limit: 50 });
      setProductNotificationEvents(result.events);
      setProductNotificationError(null);
    } catch (loadError) {
      setProductNotificationEvents([]);
      setProductNotificationError(loadError instanceof Error ? loadError.message : 'Unable to load product notification events');
    }
  };

  const loadCommerceOrderAnalytics = async () => {
    if (!canViewCommerce) {
      setOrderAnalytics(null);
      setOrderAnalyticsError(null);
      return null;
    }

    setIsOrderAnalyticsLoading(true);
    try {
      const analytics = await getOrderAnalytics(activeSiteId);
      setOrderAnalytics(analytics);
      setOrderAnalyticsError(null);
      return analytics;
    } catch (loadError) {
      setOrderAnalytics(null);
      setOrderAnalyticsError(loadError instanceof Error ? loadError.message : 'Unable to load backend order analytics');
      return null;
    } finally {
      setIsOrderAnalyticsLoading(false);
    }
  };

  const loadSelectedProductLifecycle = async (productId: string | null = selectedProductId) => {
    if (!productId || !canViewCommerce) {
      setSelectedProductLifecycle(null);
      setProductLifecycleError(null);
      return null;
    }

    setIsProductLifecycleLoading(true);
    try {
      const lifecycle = await getProductSubscriptionLifecycle(activeSiteId, productId);
      setSelectedProductLifecycle(lifecycle);
      setProductLifecycleError(null);
      return lifecycle;
    } catch (loadError) {
      setSelectedProductLifecycle(null);
      setProductLifecycleError(loadError instanceof Error ? loadError.message : 'Unable to load product subscription lifecycle');
      return null;
    } finally {
      setIsProductLifecycleLoading(false);
    }
  };

  const runSelectedProductSubscriptionAction = async (
    orderId: string,
    action: ProductSubscriptionLifecycleAction['action'],
    subscriptionReference: string,
  ) => {
    if (!selectedProduct?.id || !canEditProducts) {
      setProductLifecycleError(!canEditProducts ? (editPermissionTitle || 'Your account cannot edit products.') : 'Save the product before running subscription actions.');
      return;
    }

    const busyKey = `${orderId}:${action}`;
    setProductLifecycleActionBusy(busyKey);
    setProductLifecycleActionMessage(null);
    try {
      const result = await runProductSubscriptionLifecycleAction(activeSiteId, selectedProduct.id, orderId, {
        action,
        subscriptionReference,
        reason: `Backy operator requested subscription ${action} from the Products lifecycle panel.`,
      });
      setProductLifecycleActionMessage(`${result.action} ${result.status} via ${result.executionMode}`);
      setProductLifecycleError(null);
      await loadSelectedProductLifecycle(selectedProduct.id);
      await loadCommerceOrderAnalytics();
    } catch (actionError) {
      setProductLifecycleError(actionError instanceof Error ? actionError.message : 'Unable to run subscription lifecycle action');
    } finally {
      setProductLifecycleActionBusy(null);
    }
  };

  const loadCommerceReconciliationReadiness = async () => {
    if (!canConfigureCommerce) {
      setReconciliationReadiness(null);
      setReconciliationResult(null);
      setReconciliationError(null);
      return null;
    }

    setIsReconciliationLoading(true);
    try {
      const readiness = await getCommerceReconciliationReadiness();
      setReconciliationReadiness(readiness);
      setReconciliationError(null);
      return readiness;
    } catch (loadError) {
      setReconciliationReadiness(null);
      setReconciliationError(loadError instanceof Error ? loadError.message : 'Unable to load provider reconciliation readiness');
      return null;
    } finally {
      setIsReconciliationLoading(false);
    }
  };

  const previewCommerceReconciliation = async () => {
    if (!canConfigureCommerce) {
      setReconciliationError(configurePermissionTitle || 'Your account cannot preview provider reconciliation.');
      return null;
    }

    setIsReconciliationLoading(true);
    try {
      const result = await reconcileCommerceOrders(activeSiteId, 100, { dryRun: true });
      setReconciliationResult(result);
      setReconciliationError(null);
      return result;
    } catch (previewError) {
      setReconciliationResult(null);
      setReconciliationError(previewError instanceof Error ? previewError.message : 'Unable to preview provider reconciliation');
      return null;
    } finally {
      setIsReconciliationLoading(false);
    }
  };

  const loadProducts = async () => {
    if (isProductsBusy) return;
    if (isPermissionMatrixPending) return;
    if (!canViewProducts) {
      setProductCollection(null);
      setOrdersCollection(null);
      setCustomersCollection(null);
      setProducts([]);
      setRecentOrders([]);
      setCustomerProfiles([]);
      setOrderAnalytics(null);
      setOrderAnalyticsError(null);
      setReconciliationReadiness(null);
      setReconciliationResult(null);
      setReconciliationError(null);
      setProductNotificationEvents([]);
      setProductNotificationError(null);
      setSelectedProductLifecycle(null);
      setProductLifecycleError(null);
      setProductLifecycleActionBusy(null);
      setProductLifecycleActionMessage(null);
      setSelectedCustomerProfileId(null);
      setCustomerProfileDraft(customerProfileToDraft(null));
      setProductPagination(null);
      clearProductEditorState();
      setError(viewPermissionTitle || 'Your account cannot view commerce products.');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const collections = await listCollections(activeSiteId);
      const collection = collections.find((item) => item.slug === PRODUCT_COLLECTION_SLUG) || null;
      const orderCollection = collections.find((item) => item.slug === ORDERS_COLLECTION_SLUG) || null;
      const customerCollection = collections.find((item) => item.slug === CUSTOMERS_COLLECTION_SLUG) || null;
      setOrdersCollection(orderCollection);
      setCustomersCollection(customerCollection);
      setProductCollection(collection);

      if (!collection) {
        setProducts([]);
        setRecentOrders([]);
        setCustomerProfiles([]);
        setOrderAnalytics(null);
        setOrderAnalyticsError(null);
        setReconciliationReadiness(null);
        setReconciliationResult(null);
        setReconciliationError(null);
        setProductNotificationEvents([]);
        setProductNotificationError(null);
        setSelectedProductLifecycle(null);
        setProductLifecycleError(null);
        setProductLifecycleActionBusy(null);
        setProductLifecycleActionMessage(null);
        setSelectedCustomerProfileId(null);
        setCustomerProfileDraft(customerProfileToDraft(null));
        setProductPagination(null);
        clearProductEditorState();
        return;
      }

      const result = await listCollectionRecords(activeSiteId, collection.id, {
        limit: PRODUCT_RECORD_PAGE_SIZE,
        offset: 0,
        sortBy: 'updatedAt',
        sortDirection: 'desc',
      });
      setProducts(result.records.map(normalizeProductRecord));
      setProductPagination(result.pagination);

      const [ordersResult, customersResult] = await Promise.all([
        orderCollection
          ? listCollectionRecords(activeSiteId, orderCollection.id, {
              limit: COMMERCE_SIGNAL_RECORD_LIMIT,
              offset: 0,
              sortBy: 'updatedAt',
              sortDirection: 'desc',
            }).catch(() => null)
          : Promise.resolve(null),
        customerCollection
          ? listCollectionRecords(activeSiteId, customerCollection.id, {
              limit: COMMERCE_SIGNAL_RECORD_LIMIT,
              offset: 0,
              sortBy: 'updatedAt',
              sortDirection: 'desc',
            }).catch(() => null)
          : Promise.resolve(null),
      ]);
      setRecentOrders(ordersResult?.records || []);
      const customerRecords = customersResult?.records || [];
      setCustomerProfiles(customerRecords);
      void loadProductNotificationEvents();
      if (orderCollection) {
        void loadCommerceOrderAnalytics();
        void loadCommerceReconciliationReadiness();
      } else {
        setOrderAnalytics(null);
        setOrderAnalyticsError(null);
        setReconciliationReadiness(null);
        setReconciliationResult(null);
        setReconciliationError(null);
      }
      setSelectedCustomerProfileId((current) => (
        current && customerRecords.some((customer) => customer.id === current)
          ? current
          : customerRecords[0]?.id || null
      ));
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Unable to load products');
    } finally {
      setIsLoading(false);
    }
  };

  const loadMoreProducts = async () => {
    if (!productCollection || !productPagination?.hasMore || isProductsBusy || !canViewProducts) return;

    setIsLoading(true);
    setError(null);

    try {
      const nextOffset = productPagination.offset + productPagination.limit;
      const result = await listCollectionRecords(activeSiteId, productCollection.id, {
        limit: PRODUCT_RECORD_PAGE_SIZE,
        offset: nextOffset,
        sortBy: 'updatedAt',
        sortDirection: 'desc',
      });
      setProducts((current) => {
        const existingIds = new Set(current.map((product) => product.id));
        const nextProducts = result.records
          .map(normalizeProductRecord)
          .filter((product) => !existingIds.has(product.id));
        return [...current, ...nextProducts];
      });
      setProductPagination(result.pagination);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Unable to load more products');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    let cancelled = false;
    setPermissionError(null);

    if (!currentAdmin?.id) {
      setPermissionMatrix(null);
      setIsPermissionsLoading(false);
      return () => {
        cancelled = true;
      };
    }

    setIsPermissionsLoading(true);
    getUserPermissions(currentAdmin.id)
      .then((matrix) => {
        if (!cancelled) {
          setPermissionMatrix(matrix);
          setPermissionError(null);
        }
      })
      .catch((loadError) => {
        if (!cancelled) {
          setPermissionMatrix(null);
          setPermissionError(loadError instanceof Error ? loadError.message : 'Unable to load commerce permissions.');
        }
      })
      .finally(() => {
        if (!cancelled) {
          setIsPermissionsLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [currentAdmin?.id]);

  useEffect(() => {
    if (sites.length > 0 && !sites.some((site) => siteMatchesIdentifier(site, selectedSiteId))) {
      setSelectedSiteId(sites[0].publicSiteId || sites[0].id);
    }
  }, [selectedSiteId, sites]);

  useEffect(() => {
    const nextSiteId = routeSearch.siteId
      ? getSiteSelectionFromSearch(sites, routeSearch.siteId)
      : selectedSiteId;
    const siteChanged = nextSiteId !== selectedSiteId;

    if (siteChanged) {
      setSelectedSiteId(nextSiteId);
      clearProductEditorState();
    }

    setSelectedProductId(routeSearch.productId || null);
    setSearchQuery(routeSearch.q || '');
    setStatusFilter(routeSearch.status || 'all');
    setProductTypeFilter(routeSearch.type || 'all');
    setStockFilter(routeSearch.stock || 'all');
    setCategoryFilter(routeSearch.category || 'all');
  }, [
    routeSearch.category,
    routeSearch.productId,
    routeSearch.q,
    routeSearch.siteId,
    routeSearch.status,
    routeSearch.stock,
    routeSearch.type,
    selectedSiteId,
    sites,
  ]);

  useEffect(() => {
    void loadProducts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeSiteId, canViewProducts, isPermissionMatrixPending]);

  useEffect(() => {
    let cancelled = false;

    const loadFrontendDesign = async () => {
      if (isPermissionMatrixPending) return;
      if (!canViewProducts) {
        setFrontendDesign(null);
        setFrontendDesignError(viewPermissionTitle || 'Your account cannot view commerce products.');
        return;
      }

      setFrontendDesignLoading(true);
      setFrontendDesignError(null);

      try {
        const response = await getSiteFrontendDesign(activeSiteId);
        if (!cancelled) {
          setFrontendDesign(response.frontendDesign);
        }
      } catch (loadError) {
        if (!cancelled) {
          setFrontendDesign(null);
          setFrontendDesignError(loadError instanceof Error ? loadError.message : 'Unable to load frontend design contract');
        }
      } finally {
        if (!cancelled) {
          setFrontendDesignLoading(false);
        }
      }
    };

    void loadFrontendDesign();

    return () => {
      cancelled = true;
    };
  }, [activeSiteId, canViewProducts, isPermissionMatrixPending, viewPermissionTitle]);

  useEffect(() => {
    if (!selectedProduct) return;
    setFormState(productToForm(selectedProduct));
  }, [selectedProduct]);

  useEffect(() => {
    if (!selectedProduct?.id || !canViewCommerce) {
      setSelectedProductLifecycle(null);
      setProductLifecycleError(null);
      setProductLifecycleActionBusy(null);
      setProductLifecycleActionMessage(null);
      return;
    }

    void loadSelectedProductLifecycle(selectedProduct.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeSiteId, canViewCommerce, selectedProduct?.id]);

  useEffect(() => {
    setCustomerProfileDraft(customerProfileToDraft(selectedCustomerProfile));
  }, [selectedCustomerProfile]);

  const clearProductEditorState = () => {
    setSelectedProductId(null);
    setFormState(EMPTY_PRODUCT_FORM);
    setGalleryImageDraft('');
    setVariantDraft({
      title: '',
      sku: '',
      option: '',
      price: '',
      inventory: '',
    });
    setOptionMatrixDraft({
      options: '',
      skuPrefix: '',
      price: '',
      inventory: '',
      replaceExisting: false,
    });
    setSelectedProductLifecycle(null);
    setProductLifecycleError(null);
    setProductLifecycleActionBusy(null);
    setProductLifecycleActionMessage(null);
  };

  const resetForm = () => {
    if (isProductsBusy) return;
    if (!canEditProducts) {
      setError(editPermissionTitle || 'Your account cannot edit products.');
      return;
    }

    clearProductEditorState();
    updateProductsRouteSearch({ productId: undefined });
  };

  const selectProductForEditing = (productId: string) => {
    if (isProductsBusy) return;
    if (!canViewProducts) {
      setError(viewPermissionTitle || 'Your account cannot view products.');
      return;
    }

    setSelectedProductId(productId);
    updateProductsRouteSearch({ productId });
  };

  const openMediaPicker = (target: 'image' | 'gallery' | 'download') => {
    if (isProductsBusy) return;
    if (!canEditProducts) {
      setError(editPermissionTitle || 'Your account cannot edit products.');
      return;
    }
    if (!canViewMedia) {
      setError(mediaViewPermissionTitle || 'Your account cannot view media.');
      return;
    }

    setMediaPickerTarget(target);
    setIsMediaLibraryOpen(true);
  };

  const setGalleryImages = (urls: string[]) => {
    setFormState((current) => ({ ...current, galleryImages: serializeGalleryImages(urls) }));
  };

  const addGalleryImageUrl = (url: string) => {
    if (isProductsBusy) return false;
    if (!canEditProducts) return false;

    const normalizedUrl = url.trim();
    if (!normalizedUrl) return false;
    if (galleryImageUrls.length >= PRODUCT_GALLERY_IMAGE_LIMIT) {
      setNotice(`Product galleries support up to ${PRODUCT_GALLERY_IMAGE_LIMIT} images. Remove an image before adding another.`);
      return false;
    }
    if (galleryImageUrls.includes(normalizedUrl)) {
      setNotice('That image is already in this product gallery.');
      return false;
    }

    setGalleryImages([...galleryImageUrls, normalizedUrl]);
    setGalleryImageDraft('');
    return true;
  };

  const removeGalleryImageUrl = (url: string) => {
    if (isProductsBusy) return;
    if (!canEditProducts) return;

    setGalleryImages(galleryImageUrls.filter((item) => item !== url));
  };

  const setProductVariants = (variants: ProductVariant[]) => {
    setFormState((current) => ({ ...current, variants: serializeProductVariants(variants) }));
  };

  const resetVariantDraft = () => {
    setVariantDraft({
      title: '',
      sku: '',
      option: '',
      price: '',
      inventory: '',
    });
  };

  const addProductVariant = () => {
    if (isProductsBusy) return;
    if (!canEditProducts) return;

    const title = variantDraft.title.trim();
    const sku = variantDraft.sku.trim();
    const option = variantDraft.option.trim();

    if ((!title && !option) || productVariants.length >= PRODUCT_VARIANT_LIMIT) return;

    setProductVariants([
      ...productVariants,
      {
        id: `variant-${Date.now()}`,
        title: title || option,
        sku,
        option,
        price: variantDraft.price.trim() ? Number(variantDraft.price) : null,
        inventory: variantDraft.inventory.trim() ? Number(variantDraft.inventory) : null,
      },
    ]);
    resetVariantDraft();
  };

  const removeProductVariant = (variantId: string) => {
    if (isProductsBusy) return;
    if (!canEditProducts) return;

    setProductVariants(productVariants.filter((variant) => variant.id !== variantId));
  };

  const generateVariantMatrix = () => {
    if (isProductsBusy) return;
    if (!canEditProducts) return;

    const generated = buildProductVariantMatrix({
      optionInput: optionMatrixDraft.options,
      skuPrefix: optionMatrixDraft.skuPrefix || formState.sku || formState.slug || formState.title,
      price: optionMatrixDraft.price,
      inventory: optionMatrixDraft.inventory,
    });
    if (generated.length === 0) {
      setError('Add option groups like "Size: S, M" before generating variants.');
      setNotice(null);
      return;
    }

    const existing = optionMatrixDraft.replaceExisting ? [] : productVariants;
    const nextVariants = dedupeProductVariants([...existing, ...generated]).slice(0, PRODUCT_VARIANT_LIMIT);
    if (nextVariants.length < existing.length + generated.length) {
      setNotice('Variant matrix generated; duplicate or over-limit variants were skipped.');
    } else {
      setNotice(`Generated ${generated.length} product variant${generated.length === 1 ? '' : 's'} from option matrix.`);
    }
    setError(null);
    setProductVariants(nextVariants);
  };

  const createProductsCollection = async () => {
    if (isProductsBusy) return;
    if (!canConfigureProducts) {
      setError(configurePermissionTitle || 'Your account cannot configure commerce products.');
      return;
    }

    setIsSaving(true);
    setError(null);
    setNotice(null);

    try {
      const collection = await createCollection(activeSiteId, {
        name: 'Products',
        slug: PRODUCT_COLLECTION_SLUG,
        description: 'Sellable products controlled by Backy and available to custom frontends through collection APIs.',
        status: 'published',
        listRoutePattern: '/products',
        routePattern: '/products/:recordSlug',
        fields: PRODUCT_FIELDS,
        permissions: {
          publicRead: true,
          publicCreate: false,
          publicUpdate: false,
          publicDelete: false,
        },
      });
      setProductCollection(collection);
      setProducts([]);
      setProductPagination({ total: 0, limit: PRODUCT_RECORD_PAGE_SIZE, offset: 0, hasMore: false });
      setNotice('Products collection created. You can add your first product now.');
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : 'Unable to set up products');
    } finally {
      setIsSaving(false);
    }
  };

  const syncProductsCollection = async () => {
    if (!productCollection) return;
    if (isProductsBusy) return;
    if (!canConfigureProducts) {
      setError(configurePermissionTitle || 'Your account cannot configure commerce products.');
      return;
    }

    setIsSaving(true);
    setError(null);
    setNotice(null);

    try {
      const synced = await updateCollection(activeSiteId, productCollection.id, {
        name: productCollection.name || 'Products',
        slug: PRODUCT_COLLECTION_SLUG,
        description: productCollection.description || 'Sellable products controlled by Backy and available to custom frontends through collection APIs.',
        status: 'published',
        listRoutePattern: productCollection.listRoutePattern || '/products',
        routePattern: productCollection.routePattern || '/products/:recordSlug',
        fields: mergeProductFields(productCollection.fields),
        permissions: {
          ...productCollection.permissions,
          publicRead: true,
          publicCreate: false,
          publicUpdate: false,
          publicDelete: false,
        },
      });
      setProductCollection(synced);
      setNotice('Product schema synced. Storefront APIs now expose the complete commerce field set.');
    } catch (syncError) {
      setError(syncError instanceof Error ? syncError.message : 'Unable to sync product schema');
    } finally {
      setIsSaving(false);
    }
  };

  const createProductFromFrontendTemplate = async (
    template: SiteFrontendDesignTemplate,
    blueprint: FrontendProductTemplateBlueprint,
  ) => {
    if (!productCollection || isProductsBusy) return;
    if (!canEditProducts) {
      setError(editPermissionTitle || 'Your account cannot create products.');
      return;
    }

    const creatingId = `frontend:${template.id}`;
    setIsCreatingTemplateId(creatingId);
    setError(null);
    setNotice(null);

    try {
      const values = {
        ...blueprint.values,
        ...buildFrontendProductTemplateValues(template, frontendDesign),
      };
      const saved = normalizeProductRecord(await createCollectionRecord(activeSiteId, productCollection.id, {
        slug: `${blueprint.slug}-${Date.now().toString(36)}`,
        status: 'draft',
        values,
      }));

      setProducts((current) => [saved, ...current.filter((product) => product.id !== saved.id)]);
      setProductPagination((current) => current
        ? { ...current, total: current.total + 1 }
        : current);
      setSelectedProductId(saved.id);
      setFormState(productToForm(saved));
      updateProductsRouteSearch({ productId: saved.id });
      setNotice(`${template.name} product created from the frontend design contract.`);
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : 'Unable to create product from frontend design template');
    } finally {
      setIsCreatingTemplateId(null);
    }
  };

  const saveProduct = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!productCollection) return;
    if (isProductsBusy) return;
    if (!canEditProducts) {
      setError(editPermissionTitle || 'Your account cannot save products.');
      return;
    }

    if (!formState.title.trim() || !formState.sku.trim()) {
      setError('Add a product title and SKU before saving.');
      setNotice(null);
      return;
    }

    if (scheduledProductDateError) {
      setError(scheduledProductDateError);
      setNotice(null);
      return;
    }

    const scheduledAt = formState.status === 'scheduled'
      ? toIsoDateTime(formState.scheduledAt)
      : null;

    setIsSaving(true);
    setError(null);
    setNotice(null);

    const slug = slugify(formState.slug || formState.title || formState.sku);
    const input = {
      slug,
      status: formState.status,
      scheduledAt,
      values: {
        [productFieldKey('title')]: formState.title.trim(),
        [productFieldKey('sku')]: formState.sku.trim(),
        [productFieldKey('variants')]: productVariants,
        [productFieldKey('price')]: Number(formState.price || 0),
        [productFieldKey('compareAtPrice')]: formState.compareAtPrice ? Number(formState.compareAtPrice) : null,
        [productFieldKey('currency')]: normalizeCurrency(formState.currency),
        [productFieldKey('inventory')]: Number(formState.inventory || 0),
        [productFieldKey('lowStockThreshold')]: Number(formState.lowStockThreshold || 5),
        [productFieldKey('inventoryPolicy')]: formState.inventoryPolicy,
        [productFieldKey('productType')]: formState.productType,
        [productFieldKey('downloadUrl')]: formState.downloadUrl.trim(),
        [productFieldKey('checkoutUrl')]: formState.checkoutUrl.trim(),
        [productFieldKey('subscriptionEnabled')]: formState.subscriptionEnabled,
        [productFieldKey('subscriptionInterval')]: formState.subscriptionInterval,
        [productFieldKey('subscriptionTrialDays')]: Math.max(0, Math.round(Number(formState.subscriptionTrialDays || 0))),
        [productFieldKey('shippingRequired')]: formState.shippingRequired,
        [productFieldKey('shippingProfile')]: formState.shippingProfile.trim(),
        [productFieldKey('weight')]: formState.weight ? Number(formState.weight) : null,
        [productFieldKey('taxClass')]: formState.taxClass.trim(),
        [productFieldKey('discountCode')]: formState.discountCode.trim(),
        [productFieldKey('returnPolicy')]: formState.returnPolicy.trim(),
        [productFieldKey('imageUrl')]: formState.imageUrl.trim(),
        [productFieldKey('galleryImages')]: galleryImageUrls,
        [productFieldKey('category')]: formState.category.trim(),
        [productFieldKey('tags')]: parseTags(formState.tags),
        [productFieldKey('vendor')]: formState.vendor.trim(),
        [productFieldKey('description')]: formState.description.trim(),
        [productFieldKey('seoTitle')]: formState.seoTitle.trim(),
        [productFieldKey('featured')]: formState.featured,
        [productFieldKey('taxable')]: formState.taxable,
        ...getPersistedFrontendProductValues(selectedProduct),
        ...getPersistedProductProviderValues(selectedProduct),
      },
    };

    try {
      const saved = normalizeProductRecord(selectedProduct
        ? await updateCollectionRecord(activeSiteId, productCollection.id, selectedProduct.id, input)
        : await createCollectionRecord(activeSiteId, productCollection.id, input));

      setProducts((current) => [saved, ...current.filter((product) => product.id !== saved.id)]);
      if (!selectedProduct) {
        setProductPagination((current) => current
          ? { ...current, total: current.total + 1 }
          : current);
      }
      setSelectedProductId(saved.id);
      updateProductsRouteSearch({ productId: saved.id });
      setNotice(selectedProduct ? 'Product updated.' : 'Product created.');
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Unable to save product');
    } finally {
      setIsSaving(false);
    }
  };

  const providerSyncLabel = (provider: string | undefined): string => {
    if (provider === 'http') return 'HTTP provider';
    if (provider === 'paypal') return 'PayPal';
    if (provider === 'paddle') return 'Paddle';
    if (provider === 'square') return 'Square';
    if (provider === 'shopify') return 'Shopify';
    if (provider === 'bigcommerce') return 'BigCommerce';
    if (provider === 'woocommerce') return 'WooCommerce';
    if (provider === 'etsy') return 'Etsy';
    if (provider === 'magento') return 'Magento';
    if (provider === 'stripe') return 'Stripe';
    return 'Provider';
  };

  const syncSelectedProductProvider = async (provider = 'auto') => {
    if (!selectedProduct) {
      setError('Save the product before syncing a provider catalog.');
      setNotice(null);
      return;
    }
    if (isProductsBusy) return;
    if (!canEditProducts) {
      setError(editPermissionTitle || 'Your account cannot sync product providers.');
      setNotice(null);
      return;
    }

    setIsSyncingProviderProduct(true);
    setError(null);
    setNotice(null);

    try {
      const result = await syncCommerceProductProvider(activeSiteId, selectedProduct.id, { provider });
      const saved = normalizeProductRecord(result.product);
      setProducts((current) => current.map((product) => (product.id === saved.id ? saved : product)));
      setFormState(productToForm(saved));
      setNotice(result.sync.status === 'synced'
        ? `${providerSyncLabel(result.sync.provider)} catalog product and price synced.`
        : result.sync.status === 'failed'
          ? 'Provider sync failed; provider handoff metadata was saved.'
          : 'Provider handoff metadata saved. Configure a catalog-sync endpoint or provider secret to execute the sync.');
    } catch (syncError) {
      setError(syncError instanceof Error ? syncError.message : 'Unable to sync product provider catalog');
    } finally {
      setIsSyncingProviderProduct(false);
    }
  };

  const changeProductStatus = async (product: CollectionRecord, status: ContentStatus) => {
    if (!productCollection) return;
    if (isProductsBusy) return;
    if (!canEditProducts) {
      setError(editPermissionTitle || 'Your account cannot update product status.');
      return;
    }

    setIsSaving(true);
    setError(null);
    setNotice(null);

    try {
      const updated = normalizeProductRecord(await updateCollectionRecord(activeSiteId, productCollection.id, product.id, {
        status,
        scheduledAt: status === 'scheduled' ? product.scheduledAt || new Date().toISOString() : null,
        values: product.values,
      }));
      setProducts((current) => current.map((item) => (item.id === updated.id ? updated : item)));
      if (selectedProductId === updated.id) {
        setFormState(productToForm(updated));
      }
      setNotice(`Product ${status}.`);
    } catch (statusError) {
      setError(statusError instanceof Error ? statusError.message : 'Unable to update product');
    } finally {
      setIsSaving(false);
    }
  };

  const removeProduct = async (product: CollectionRecord) => {
    if (!productCollection) return;
    if (isProductsBusy) return;
    if (!canDeleteProducts) {
      setError(deletePermissionTitle || 'Your account cannot delete products.');
      return;
    }

    setIsSaving(true);
    setError(null);
    setNotice(null);

    try {
      await deleteCollectionRecord(activeSiteId, productCollection.id, product.id);
      setProducts((current) => current.filter((item) => item.id !== product.id));
      setProductPagination((current) => current
        ? { ...current, total: Math.max(0, current.total - 1) }
        : current);
      if (selectedProductId === product.id) {
        clearProductEditorState();
        updateProductsRouteSearch({ productId: undefined });
      }
      setPendingDeleteProduct(null);
      setNotice('Product deleted.');
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : 'Unable to delete product');
    } finally {
      setIsSaving(false);
    }
  };

  const selectCustomerProfile = (customer: CollectionRecord) => {
    if (isProductsBusy) return;
    if (!canViewProducts) {
      setError(viewPermissionTitle || 'Your account cannot view customer profiles.');
      return;
    }

    setSelectedCustomerProfileId(customer.id);
    setCustomerProfileDraft(customerProfileToDraft(customer));
  };

  const saveCustomerProfile = async () => {
    if (!customersCollection || !selectedCustomerProfile) return;
    if (isProductsBusy) return;
    if (!canEditProducts) {
      setError(editPermissionTitle || 'Your account cannot update customer profiles.');
      return;
    }

    const name = customerProfileDraft.name.trim();
    const email = customerProfileDraft.email.trim().toLowerCase();
    if (!name || !email) {
      setError('Customer name and email are required before saving a profile.');
      setNotice(null);
      return;
    }

    setIsSavingCustomerProfile(true);
    setError(null);
    setNotice(null);

    try {
      const updated = await updateCollectionRecord(activeSiteId, customersCollection.id, selectedCustomerProfile.id, {
        slug: selectedCustomerProfile.slug,
        status: selectedCustomerProfile.status,
        scheduledAt: selectedCustomerProfile.scheduledAt || null,
        values: {
          ...selectedCustomerProfile.values,
          name,
          email,
          phone: customerProfileDraft.phone.trim(),
          status: customerProfileDraft.status,
          notes: customerProfileDraft.notes.trim(),
        },
      });

      setCustomerProfiles((current) => current.map((customer) => (
        customer.id === updated.id ? updated : customer
      )));
      setSelectedCustomerProfileId(updated.id);
      setNotice('Customer profile updated.');
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Unable to update customer profile');
    } finally {
      setIsSavingCustomerProfile(false);
    }
  };

  const copyStorefrontApiUrl = async () => {
    if (isProductsBusy) return;
    if (!canViewProducts) {
      setError(viewPermissionTitle || 'Your account cannot view product APIs.');
      return;
    }

    try {
      await navigator.clipboard.writeText(storefrontApiUrl);
      setNotice('Storefront products API URL copied.');
    } catch {
      setNotice(storefrontApiUrl);
    }
  };
  const copyProductHandoff = async () => {
    if (isProductsBusy) return;
    if (!canExportProducts) {
      setError(exportPermissionTitle || 'Your account cannot export product data.');
      return;
    }

    try {
      await navigator.clipboard.writeText(productHandoffText);
      setNotice('Product handoff manifest copied.');
    } catch {
      setNotice(productHandoffText);
    }
  };

  const copyText = async (value: string, label: string) => {
    if (isProductsBusy) return;
    if (!canExportProducts) {
      setError(exportPermissionTitle || 'Your account cannot export product data.');
      return;
    }

    try {
      await navigator.clipboard.writeText(value);
      setNotice(`${label} copied.`);
    } catch {
      setNotice(value);
    }
  };

  const downloadProductHandoff = () => {
    if (isProductsBusy) return;
    if (!canExportProducts) {
      setError(exportPermissionTitle || 'Your account cannot export product data.');
      return;
    }

    const blob = new Blob([productHandoffText], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `${activeSite?.slug || activeSiteId}-backy-products-handoff.json`;
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
    setNotice('Product handoff manifest downloaded.');
  };

  const downloadProviderCertificationHandoff = () => {
    if (isProductsBusy) return;
    if (!canExportProducts) {
      setError(exportPermissionTitle || 'Your account cannot export product data.');
      return;
    }

    const blob = new Blob([providerCertificationHandoffText], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `${activeSite?.slug || activeSiteId}-backy-products-provider-certification.json`;
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
    setNotice('Products provider certification handoff downloaded.');
  };

  const exportProductsCsv = () => {
    if (filteredProducts.length === 0 || isProductsBusy) return;
    if (!canExportProducts) {
      setError(exportPermissionTitle || 'Your account cannot export products.');
      return;
    }

    const rows = filteredProducts.map((product) => {
      const exportRecord = productToExportRecord(product, {
        activeSiteId,
        publicBaseUrl,
        storefrontApiUrl,
      });
      return PRODUCT_EXPORT_COLUMNS.map((column) => exportRecord[column]);
    });
    const csv = [PRODUCT_EXPORT_COLUMNS, ...rows]
      .map((row) => row.map(csvEscape).join(','))
      .join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `${activeSite?.slug || activeSiteId}-products.csv`;
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
    setNotice(`${filteredProducts.length} visible product${filteredProducts.length === 1 ? '' : 's'} exported.`);
  };
  const downloadProductImportTemplate = () => {
    if (isProductsBusy) return;
    if (!canEditProducts) {
      setError(editPermissionTitle || 'Your account cannot import products.');
      return;
    }

    const csv = `${PRODUCT_IMPORT_COLUMNS.join(',')}\n`;
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `${activeSite?.slug || activeSiteId}-products-import-template.csv`;
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
    setNotice('Product import template downloaded.');
  };
  const importProductsCsv = async (event: ChangeEvent<HTMLInputElement>) => {
    if (!productCollection) return;
    if (isProductsBusy) return;
    if (!canEditProducts) {
      setError(editPermissionTitle || 'Your account cannot import products.');
      event.target.value = '';
      return;
    }

    const file = event.target.files?.[0];
    if (!file) return;

    setIsImportingProducts(true);
    setError(null);
    setNotice(null);

    try {
      const csv = await file.text();
      const result = await importCollectionRecordsCsv(activeSiteId, productCollection.id, normalizeProductImportCsvHeaders(csv), { upsert: true });
      const refreshed = await listCollectionRecords(activeSiteId, productCollection.id, {
        limit: PRODUCT_RECORD_PAGE_SIZE,
        offset: 0,
        sortBy: 'updatedAt',
        sortDirection: 'desc',
      });
      setProducts(refreshed.records.map(normalizeProductRecord));
      setProductPagination(refreshed.pagination);
      setNotice(`${result.created} created, ${result.updated} updated, ${result.skipped} skipped from ${file.name}.`);
      if (result.errors.length > 0) {
        const firstError = result.errors[0];
        setError(`Row ${firstError.row} skipped: ${firstError.message}`);
      }
    } catch (importError) {
      setError(importError instanceof Error ? importError.message : 'Unable to import products');
    } finally {
      setIsImportingProducts(false);
      event.target.value = '';
    }
  };
  const clearCatalogFilters = () => {
    if (isProductsBusy) return;

    setSearchQuery('');
    setStatusFilter('all');
    setProductTypeFilter('all');
    setStockFilter('all');
    setCategoryFilter('all');
    clearProductEditorState();
    updateProductsRouteSearch({
      status: undefined,
      type: undefined,
      stock: undefined,
      category: undefined,
      q: undefined,
      productId: undefined,
    });
  };
  const openStorefrontPage = () => {
    if (isProductsBusy) return;
    if (!canEditPages) {
      setError(pagesEditPermissionTitle || 'Your account cannot create storefront pages.');
      return;
    }

    navigate({ to: '/pages/new', search: { siteId: activeSiteId, template: 'storefront' } });
  };
  const openProductPageTemplate = (brief: (typeof productPageTemplateBriefs)[number]) => {
    if (isPermissionMatrixPending || !productCollection) return;
    if (!canEditPages) {
      setError(pagesEditPermissionTitle || 'Your account cannot create storefront pages.');
      return;
    }

    navigate({ to: '/pages/new', search: brief.search });
  };
  const selectProductsSite = (nextSiteId: string) => {
    if (isProductsBusy) return;

    setSelectedSiteId(nextSiteId);
    clearProductEditorState();
    setSearchQuery('');
    setStatusFilter('all');
    setProductTypeFilter('all');
    setStockFilter('all');
    setCategoryFilter('all');
    navigate({ to: '/products', search: { siteId: nextSiteId }, replace: true });
  };

  return (
    <PageShell
      title="Products"
      description="Manage sellable catalog data for storefront pages and custom frontend APIs."
      action={
        <div className="flex flex-wrap items-center gap-2">
          <select
            id="products-active-site"
            aria-label="Active Site"
            value={activeSiteId}
            disabled={isProductsBusy}
            onChange={(event) => {
              selectProductsSite(event.target.value);
            }}
            className="min-h-11 min-w-56 rounded-lg border bg-background px-3 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-60"
          >
            {sites.length === 0 ? (
              <option value="site-demo">Demo site</option>
            ) : sites.map((site) => (
              <option key={site.id} value={site.publicSiteId || site.id}>
                {site.name}
              </option>
            ))}
          </select>
          <Button onClick={() => void loadProducts()} disabled={isProductsAccessBusy || !canViewProducts} title={!canViewProducts ? viewPermissionTitle : undefined} iconStart={<RefreshCw className={cn('size-4', isLoading && 'animate-spin')} />}>
            Refresh
          </Button>
        </div>
      }
      className="w-full"
    >
      {error && (
        <div
          role="alert"
          data-testid="products-error-state"
          className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900"
        >
          <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
            <div className="flex gap-3">
              <AlertTriangle className="mt-0.5 size-4 shrink-0" />
              <div>
                <p className="font-semibold">Products workspace needs attention</p>
                <p className="mt-1 leading-6">{error}</p>
              </div>
            </div>
            <div className="flex shrink-0 flex-wrap items-center gap-2">
              {hasActiveCatalogFilters && (
                <button
                  type="button"
                  onClick={clearCatalogFilters}
                  disabled={isProductsAccessBusy || !canViewProducts}
                  className="inline-flex items-center rounded-lg border border-amber-300 bg-white px-3 py-1.5 text-xs font-semibold text-amber-900 transition-colors hover:bg-amber-100 focus-ring disabled:cursor-not-allowed disabled:opacity-60"
                >
                  Clear filters
                </button>
              )}
              <button
                type="button"
                onClick={() => void loadProducts()}
                disabled={isProductsAccessBusy || !canViewProducts}
                title={!canViewProducts ? viewPermissionTitle : undefined}
                aria-label="Retry loading products"
                className="inline-flex items-center rounded-lg border border-amber-300 bg-white px-3 py-1.5 text-xs font-semibold text-amber-900 transition-colors hover:bg-amber-100 focus-ring disabled:cursor-not-allowed disabled:opacity-60"
              >
                Retry load
              </button>
            </div>
          </div>
        </div>
      )}
      {permissionError && (
        <div
          role="alert"
          data-testid="products-permission-state"
          className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900"
        >
          <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
            <div className="flex gap-3">
              <AlertTriangle className="mt-0.5 size-4 shrink-0" />
              <div>
                <p className="font-semibold">Product permissions could not be verified</p>
                <p className="mt-1 leading-6">{permissionError}</p>
              </div>
            </div>
            <div className="flex shrink-0 flex-wrap items-center gap-2">
              <Link
                to="/users"
                className="inline-flex items-center rounded-lg border border-amber-300 bg-white px-3 py-1.5 text-xs font-semibold text-amber-900 transition-colors hover:bg-amber-100 focus-ring"
              >
                Review users
              </Link>
              <button
                type="button"
                onClick={() => void loadProducts()}
                disabled={isProductsBusy}
                aria-label="Retry loading product permissions"
                className="inline-flex items-center rounded-lg border border-amber-300 bg-white px-3 py-1.5 text-xs font-semibold text-amber-900 transition-colors hover:bg-amber-100 focus-ring disabled:cursor-not-allowed disabled:opacity-60"
              >
                Retry permissions
              </button>
            </div>
          </div>
        </div>
      )}
      {notice && (
        <div className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
          {notice}
        </div>
      )}
      <input
        ref={productImportInputRef}
        type="file"
        accept=".csv,text/csv"
        className="hidden"
        aria-label="Import products CSV"
        onChange={(event) => void importProductsCsv(event)}
      />

      <section className="mb-6 rounded-lg border border-border bg-card p-5 shadow-sm" data-testid="products-command-center">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-base font-semibold text-foreground">Catalog command center</h2>
              <span className={cn(
                'rounded-full px-2.5 py-1 text-xs font-semibold',
                catalogReadiness.score >= 80 ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700',
              )}
              >
                {catalogReadiness.score}% ready
              </span>
            </div>
            <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
              Control sellable product data for every storefront: schema, pricing, inventory, media, delivery, tax, SEO, publishing, and public API handoff.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => void copyProductHandoff()} disabled={isProductsAccessBusy || !canExportProducts} title={!canExportProducts ? exportPermissionTitle : undefined} iconStart={<Copy className="size-4" />}>
              Copy manifest
            </Button>
            <Button variant="outline" onClick={downloadProductHandoff} disabled={isProductsAccessBusy || !canExportProducts} title={!canExportProducts ? exportPermissionTitle : undefined} iconStart={<Download className="size-4" />}>
              Download JSON
            </Button>
            <Button variant="outline" onClick={exportProductsCsv} disabled={filteredProducts.length === 0 || isProductsAccessBusy || !canExportProducts} title={!canExportProducts ? exportPermissionTitle : undefined} iconStart={<Download className="size-4" />}>
              Export CSV
            </Button>
            <Button variant="outline" onClick={downloadProductImportTemplate} disabled={!productCollection || isProductsAccessBusy || !canEditProducts} title={!canEditProducts ? editPermissionTitle : undefined} iconStart={<FileText className="size-4" />}>
              CSV template
            </Button>
            <Button variant="outline" onClick={() => productImportInputRef.current?.click()} disabled={!productCollection || isProductsAccessBusy || !canEditProducts} title={!canEditProducts ? editPermissionTitle : undefined} iconStart={<Upload className="size-4" />}>
              {isImportingProducts ? 'Importing...' : 'Import CSV'}
            </Button>
            <Button variant="outline" onClick={openStorefrontPage} disabled={isProductsAccessBusy || !canEditPages} title={!canEditPages ? pagesEditPermissionTitle : undefined} iconStart={<Sparkles className="size-4" />}>
              Storefront page
            </Button>
            {!productCollection ? (
              <Button onClick={() => void createProductsCollection()} disabled={isProductsAccessBusy || !canConfigureProducts} title={!canConfigureProducts ? configurePermissionTitle : undefined} iconStart={<Sparkles className="size-4" />}>
                {isSaving ? 'Setting up...' : 'Set up products'}
              </Button>
            ) : (
              <Button onClick={resetForm} disabled={isProductsAccessBusy || !canEditProducts} title={!canEditProducts ? editPermissionTitle : undefined} iconStart={<Plus className="size-4" />}>
                New product
              </Button>
            )}
            <Button onClick={() => void loadProducts()} disabled={isProductsAccessBusy || !canViewProducts} title={!canViewProducts ? viewPermissionTitle : undefined} iconStart={<RefreshCw className={cn('size-4', isLoading && 'animate-spin')} />}>
              Refresh
            </Button>
          </div>
        </div>

        <div className="mt-5 grid gap-3 xl:grid-cols-[minmax(0,1.15fr)_minmax(340px,0.85fr)]">
          <div className="rounded-lg border border-border bg-background p-4">
            <h3 className="text-sm font-semibold">Catalog readiness</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              Checks whether product data can be listed, priced, merchandised, published, and consumed by custom storefronts.
            </p>
            <div className="mt-3 h-2 overflow-hidden rounded-full bg-muted">
              <div
                className={cn('h-full rounded-full', catalogReadiness.score >= 80 ? 'bg-emerald-500' : 'bg-amber-500')}
                style={{ width: `${catalogReadiness.score}%` }}
              />
            </div>
            <div className="mt-4 grid gap-2 md:grid-cols-2 xl:grid-cols-4">
              {catalogReadiness.checks.map((check) => (
                <ProductReadinessCheck key={check.label} {...check} />
              ))}
            </div>
          </div>

          <div className="rounded-lg border border-border bg-background p-4">
            <div className="flex items-center gap-2">
              <ShoppingBag className="size-4 text-primary" />
              <h3 className="text-sm font-semibold">Storefront workflow</h3>
            </div>
            <div className="mt-3 grid gap-2">
              {catalogReadiness.workflow.map((step, index) => (
                <ProductWorkflowStep key={step.label} index={index + 1} {...step} />
              ))}
            </div>
          </div>
        </div>

        <div className="mt-4 rounded-lg border border-border bg-background p-4">
          <h3 className="text-sm font-semibold">Product control map</h3>
          <p className="mt-1 text-sm text-muted-foreground">Jump to site scope, storefront API, catalog health, product grid, and editor controls.</p>
          <div className="mt-4 grid gap-2 md:grid-cols-2 xl:grid-cols-5">
            {PRODUCT_CONTROL_AREAS.map((area) => (
              <a
                key={area.title}
                href={area.href}
                className="rounded-lg border border-border bg-card px-3 py-3 text-left transition hover:border-primary/40 hover:bg-primary/5"
              >
                <div className="text-sm font-semibold text-foreground">{area.title}</div>
                <div className="mt-1 text-xs leading-5 text-muted-foreground">{area.detail}</div>
              </a>
            ))}
          </div>
        </div>

        {(frontendProductTemplates.length > 0 || frontendDesignLoading || frontendDesignError) && (
          <div className="mt-4 rounded-lg border border-teal-200 bg-teal-50/50 p-4" data-testid="products-frontend-template-options">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h3 className="text-sm font-semibold text-foreground">Frontend design products</h3>
                <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
                  Seed products from the connected frontend contract while preserving source, chrome, tokens, route pattern, and product binding hints for custom storefronts.
                </p>
              </div>
              <span className="rounded-full bg-background px-2.5 py-1 text-xs font-medium text-teal-700">
                {frontendDesign?.source.label || frontendDesign?.source.type || 'Frontend contract'}
              </span>
            </div>
            {frontendDesignLoading ? (
              <div className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
                <RefreshCw className="size-3.5 animate-spin" />
                Loading captured product templates...
              </div>
            ) : null}
            {frontendDesignError ? (
              <div className="mt-3 flex items-center gap-2 text-xs text-destructive">
                <AlertTriangle className="size-3.5" />
                {frontendDesignError}
              </div>
            ) : null}
            {frontendProductTemplateBlueprints.length > 0 ? (
              <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                {frontendProductTemplateBlueprints.map(({ template, blueprint }) => {
                  const values = {
                    ...blueprint.values,
                    ...buildFrontendProductTemplateValues(template, frontendDesign),
                  };
                  const manifestText = JSON.stringify({
                    schemaVersion: 'backy.frontend-product-template.v1',
                    template,
                    product: {
                      slug: blueprint.slug,
                      status: 'draft',
                      values,
                    },
                  }, null, 2);

                  return (
                    <div
                      key={template.id}
                      className={cn(
                        'rounded-lg border bg-background p-4',
                        activeFrontendTemplateId === template.id
                          ? 'border-teal-600 ring-1 ring-teal-600'
                          : 'border-teal-200',
                      )}
                      data-active={activeFrontendTemplateId === template.id ? 'true' : 'false'}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <h4 className="text-sm font-semibold text-foreground">{template.name}</h4>
                          <p className="mt-1 text-xs leading-5 text-muted-foreground">{template.description || String(readProductValue(blueprint.values, 'description', 'Product seeded from the frontend design contract.') || 'Product seeded from the frontend design contract.')}</p>
                        </div>
                        <span className="rounded-full bg-teal-50 px-2 py-1 text-[11px] font-medium text-teal-700">
                          {String(readProductValue(blueprint.values, 'productType', 'physical') || 'physical')}
                        </span>
                      </div>
                      <div className="mt-3 flex flex-wrap gap-1.5">
                        <span className="rounded bg-muted px-2 py-1 text-[11px] text-muted-foreground">{formatMoney(toNumber(readProductValue(blueprint.values, 'price')), String(readProductValue(blueprint.values, 'currency', 'USD') || 'USD'))}</span>
                        <span className="rounded bg-muted px-2 py-1 text-[11px] text-muted-foreground">{template.bindingHints?.length || 0} bindings</span>
                        {template.routePattern ? (
                          <span className="rounded bg-muted px-2 py-1 text-[11px] text-muted-foreground">{template.routePattern}</span>
                        ) : null}
                      </div>
                      <div className="mt-4 grid gap-2 text-xs">
                        <div className="flex items-center justify-between gap-3 rounded border border-border bg-muted/40 px-2.5 py-2">
                          <span className="font-medium text-foreground">SKU</span>
                          <span className="font-mono text-muted-foreground">{blueprint.sku}</span>
                        </div>
                        <div className="flex items-center justify-between gap-3 rounded border border-border bg-muted/40 px-2.5 py-2">
                          <span className="font-medium text-foreground">Category</span>
                          <span className="text-muted-foreground">{String(blueprint.values.category || 'Uncategorized')}</span>
                        </div>
                      </div>
                      <div className="mt-4 flex flex-wrap gap-2">
                        <Button
                          size="sm"
                          variant="primary"
                          onClick={() => void createProductFromFrontendTemplate(template, blueprint)}
                          disabled={!productCollection || isProductsAccessBusy || !canEditProducts}
                          title={!canEditProducts ? editPermissionTitle : undefined}
                          iconStart={<Package className="size-4" />}
                          data-testid={`products-frontend-template-${template.id}`}
                        >
                          {isCreatingTemplateId === `frontend:${template.id}` ? 'Creating...' : 'Create product'}
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => void copyText(manifestText, `${template.name} frontend product template`)}
                          disabled={isProductsAccessBusy || !canExportProducts}
                          title={!canExportProducts ? exportPermissionTitle : undefined}
                          iconStart={<Copy className="size-4" />}
                        >
                          Copy schema
                        </Button>
                      </div>
                      {!productCollection ? (
                        <p className="mt-3 text-xs text-muted-foreground">Set up products before creating catalog records from frontend templates.</p>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            ) : !frontendDesignLoading && !frontendDesignError ? (
              <p className="mt-3 text-xs text-muted-foreground">The current frontend contract has no product templates yet.</p>
            ) : null}
          </div>
        )}
      </section>

      {productCollection && (
        <Panel id="products-api" className="mb-6 scroll-mt-24">
          <PanelHeader
            title="Storefront API"
            description="Use these endpoints from any frontend to list and render sellable products."
            icon={<Code2 className="size-4" />}
            action={
              <div className="flex flex-wrap items-center gap-2">
                {!productApiReady && (
                  <Button
                    onClick={() => void syncProductsCollection()}
                    disabled={isProductsAccessBusy || !canConfigureProducts}
                    title={!canConfigureProducts ? configurePermissionTitle : undefined}
                    iconStart={<Sparkles className="size-4" />}
                  >
                    Sync Schema
                  </Button>
                )}
                <Button onClick={() => void copyProductHandoff()} disabled={isProductsAccessBusy || !canExportProducts} title={!canExportProducts ? exportPermissionTitle : undefined} iconStart={<Copy className="size-4" />}>
                  Copy manifest
                </Button>
                <Button onClick={exportProductsCsv} disabled={filteredProducts.length === 0 || isProductsAccessBusy || !canExportProducts} title={!canExportProducts ? exportPermissionTitle : undefined} iconStart={<Download className="size-4" />}>
                  Export CSV
                </Button>
                <Button variant="outline" onClick={downloadProductImportTemplate} disabled={isProductsAccessBusy || !canEditProducts} title={!canEditProducts ? editPermissionTitle : undefined} iconStart={<FileText className="size-4" />}>
                  CSV template
                </Button>
                <Button variant="outline" onClick={() => productImportInputRef.current?.click()} disabled={isProductsAccessBusy || !canEditProducts} title={!canEditProducts ? editPermissionTitle : undefined} iconStart={<Upload className="size-4" />}>
                  {isImportingProducts ? 'Importing...' : 'Import CSV'}
                </Button>
                <Button onClick={() => void copyStorefrontApiUrl()} disabled={isProductsAccessBusy || !canViewProducts} title={!canViewProducts ? viewPermissionTitle : undefined} iconStart={<Copy className="size-4" />}>
                  Copy URL
                </Button>
                <Button variant="outline" onClick={openStorefrontPage} disabled={isProductsAccessBusy || !canEditPages} title={!canEditPages ? pagesEditPermissionTitle : undefined} iconStart={<Sparkles className="size-4" />}>
                  Storefront page
                </Button>
                <a
                  href={storefrontApiUrl}
                  target="_blank"
                  rel="noreferrer"
                  aria-disabled={isProductsAccessBusy || !canViewProducts}
                  onClick={(event) => {
                    if (isProductsAccessBusy || !canViewProducts) event.preventDefault();
                  }}
                  className={cn(
                    'inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-border bg-background px-4 py-2 text-sm font-medium transition-colors hover:bg-accent',
                    (isProductsAccessBusy || !canViewProducts) && 'pointer-events-none opacity-60',
                  )}
                >
                  <ExternalLink className="size-4" />
                  Open API
                </a>
              </div>
            }
          />
          <PanelContent>
            <div className="space-y-3">
              <div className="grid gap-2 lg:grid-cols-2">
                <ProductApiSnippet label="List products" value={storefrontApiUrl} />
                <ProductApiSnippet label="Product by slug" value={storefrontProductDetailUrl} />
                <ProductApiSnippet label="Commerce catalog" value={commerceCatalogUrl} />
                <ProductApiSnippet label="Commerce product by slug" value={commerceProductDetailUrl} />
                <ProductApiSnippet label="Order intake contract" value={commerceOrderContractUrl} />
                <ProductApiSnippet label="Create order POST" value={commerceOrderCreateUrl} />
              </div>
              <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                <span
                  className={cn(
                    'inline-flex rounded-md px-2 py-1 font-medium',
                    productApiReady ? 'bg-success/10 text-success' : 'bg-warning/10 text-warning',
                  )}
                >
                  {productApiReady ? 'API ready' : 'Schema needs sync'}
                </span>
                <StatusBadge status={productCollection.status} />
                <span>{productCollection.permissions.publicRead ? 'Public read enabled' : 'Public read disabled'}</span>
                <span>{products.filter((product) => product.status === 'published').length} published records</span>
                <span>{orderIntakeReady ? 'Order intake ready' : 'Order intake needs private orders'}</span>
              </div>
              <div className="rounded-lg border border-border bg-background p-4" data-testid="products-api-contracts">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h3 className="text-sm font-semibold">Product API response contracts</h3>
                    <p className="mt-1 text-sm text-muted-foreground">
                      Storefront and product-operations endpoints expose stable Backy schema ids, request ids, and cache-scope headers for custom frontends and admin clients.
                    </p>
                  </div>
                  <span className="rounded-full bg-muted px-2.5 py-1 text-xs font-medium text-muted-foreground">
                    {PRODUCT_API_CONTRACTS.length} contracts
                  </span>
                </div>
                <div className="mt-4 grid gap-2 md:grid-cols-2 xl:grid-cols-3">
                  {PRODUCT_API_CONTRACTS.map((contract) => (
                    <div key={contract.key} className="rounded-lg border border-border bg-card p-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="text-sm font-semibold text-foreground">{contract.title}</div>
                          <div className="mt-1 text-xs leading-5 text-muted-foreground">{contract.detail}</div>
                          <code className="mt-2 block truncate text-[11px] text-muted-foreground">
                            {contract.schemaVersion}
                          </code>
                        </div>
                        <div className="flex shrink-0 flex-col items-end gap-1">
                          <span className="rounded-full bg-muted px-2 py-1 font-mono text-[10px] text-muted-foreground">
                            {contract.methods.join('/')}
                          </span>
                          <span className="rounded-full bg-muted px-2 py-1 font-mono text-[10px] text-muted-foreground">
                            {contract.cacheScope}
                          </span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              {missingProductFields.length > 0 && (
                <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
                  Missing commerce fields: {missingProductFields.join(', ')}. Sync the schema before relying on product APIs.
                </div>
              )}
              <div className="rounded-lg border border-border bg-background p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h3 className="text-sm font-semibold">Checkout and order intake</h3>
                    <p className="mt-1 text-sm text-muted-foreground">
                      Custom storefronts can either follow product checkout URLs or post carts to Backy, where orders stay private for admin fulfillment.
                    </p>
                  </div>
                  <span className={cn(
                    'rounded-full px-2.5 py-1 text-xs font-semibold',
                    orderIntakeReady ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700',
                  )}
                  >
                    {orderIntakeReady ? 'Ready' : 'Needs orders queue'}
                  </span>
                </div>
                <div className="mt-4 grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(260px,0.7fr)]">
                  <div className="rounded-lg border border-border bg-card p-3">
                    <div className="grid gap-2 text-sm">
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-muted-foreground">Products collection</span>
                        <span className={cn('rounded-md px-2 py-1 text-xs font-medium', productApiReady ? 'bg-success/10 text-success' : 'bg-warning/10 text-warning')}>
                          {productApiReady ? 'Public and synced' : 'Needs sync'}
                        </span>
                      </div>
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-muted-foreground">Orders collection</span>
                        <span className={cn('rounded-md px-2 py-1 text-xs font-medium', ordersCollection ? 'bg-success/10 text-success' : 'bg-warning/10 text-warning')}>
                          {ordersCollection ? ordersCollection.status : 'Missing'}
                        </span>
                      </div>
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-muted-foreground">Order privacy</span>
                        <span className={cn('rounded-md px-2 py-1 text-xs font-medium', orderIntakeReady ? 'bg-success/10 text-success' : 'bg-warning/10 text-warning')}>
                          {isOrderCollectionPrivate(ordersCollection) ? 'Private' : 'Review'}
                        </span>
                      </div>
                    </div>
                  </div>
                  <div data-testid="products-provider-reconciliation" className="rounded-lg border border-border bg-card p-3">
                    <div className="text-xs font-semibold text-foreground">Provider execution and reconciliation</div>
                    <p className="mt-1 text-xs leading-5 text-muted-foreground">
                      Backy can capture private orders, execute HTTP quote providers, create checkout-session handoffs, sync Stripe, PayPal, Paddle, Square, Shopify, BigCommerce, WooCommerce, Etsy, Magento, or configured HTTP catalog metadata, settle provider webhooks, and preview scheduled reconciliation through the scheduled worker. Live marketplace certification remains backend rollout work.
                    </p>
                    <div className="mt-3 space-y-2 rounded-md border border-border bg-background p-3 text-xs">
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-muted-foreground">Scheduled worker</span>
                        <span className={cn(
                          'rounded-md px-2 py-1 font-medium',
                          reconciliationReadiness?.ready ? 'bg-success/10 text-success' : 'bg-warning/10 text-warning',
                        )}
                        >
                          {reconciliationReadiness?.ready ? 'Ready' : 'Needs setup'}
                        </span>
                      </div>
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-muted-foreground">Cron route</span>
                        <span className="max-w-[190px] truncate font-mono text-[11px] text-foreground">
                          {reconciliationReadiness?.entrypoint || '/api/admin/commerce/reconcile?limit=100'}
                        </span>
                      </div>
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-muted-foreground">Last preview</span>
                        <span className="font-mono text-[11px] text-foreground">
                          {reconciliationResult
                            ? `${reconciliationResult.eventCount} events / ${reconciliationResult.eligibleUpdateCount ?? 0} eligible`
                            : 'Not run'}
                        </span>
                      </div>
                      {reconciliationReadiness?.missing?.length ? (
                        <div className="rounded-md border border-amber-200 bg-amber-50 px-2 py-1.5 text-amber-900">
                          Missing: {reconciliationReadiness.missing.slice(0, 3).join(', ')}
                        </div>
                      ) : null}
                      {reconciliationError ? (
                        <div className="rounded-md border border-amber-200 bg-amber-50 px-2 py-1.5 text-amber-900">
                          {reconciliationError}
                        </div>
                      ) : null}
                      <div className="flex flex-wrap gap-2 pt-1">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => void loadCommerceReconciliationReadiness()}
                          disabled={isProductsAccessBusy || isReconciliationLoading || !canConfigureCommerce}
                          title={!canConfigureCommerce ? configurePermissionTitle : undefined}
                          iconStart={<RefreshCw className={cn('size-3.5', isReconciliationLoading && 'animate-spin')} />}
                        >
                          Refresh readiness
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => void previewCommerceReconciliation()}
                          disabled={isProductsAccessBusy || isReconciliationLoading || !ordersCollection || !canConfigureCommerce}
                          title={!canConfigureCommerce ? configurePermissionTitle : !ordersCollection ? 'Create the private orders queue first.' : undefined}
                        >
                          Preview reconciliation
                        </Button>
                      </div>
                    </div>
                    <Link
                      to="/orders"
                      search={activeSiteSearch}
                      aria-disabled={isProductsBusy}
                      className={cn(
                        'mt-3 inline-flex min-h-9 items-center justify-center rounded-lg border border-border bg-background px-3 text-xs font-medium hover:bg-accent',
                        isProductsBusy && 'pointer-events-none opacity-60',
                      )}
                    >
                      Open orders
                    </Link>
                  </div>
                </div>
                <div data-testid="products-provider-certification" className="mt-3 rounded-lg border border-border bg-card p-3">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <div className="text-xs font-semibold text-foreground">Live provider certification</div>
                      <p className="mt-1 max-w-3xl text-xs leading-5 text-muted-foreground">
                        Mock-provider automation is repeatable through {providerCertificationSummary.localMockGate}. Live checkout, quote, catalog, webhook, and subscription certification remains gated on configured provider accounts through {providerCertificationSummary.liveCertificationGate}.
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => void copyText(providerCertificationHandoffText, 'Products provider certification handoff')}
                        disabled={isProductsAccessBusy || !canExportProducts}
                        title={!canExportProducts ? exportPermissionTitle : undefined}
                        iconStart={<Copy className="size-4" />}
                        data-testid="products-provider-certification-copy-button"
                      >
                        Copy provider handoff
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={downloadProviderCertificationHandoff}
                        disabled={isProductsAccessBusy || !canExportProducts}
                        title={!canExportProducts ? exportPermissionTitle : undefined}
                        iconStart={<Download className="size-4" />}
                        data-testid="products-provider-certification-download-button"
                      >
                        Download provider JSON
                      </Button>
                      <span className="rounded-full bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-700">
                        External credentials
                      </span>
                    </div>
                  </div>
                  <div className="mt-3 grid gap-2 md:grid-cols-2 xl:grid-cols-4">
                    <div className="rounded-md border border-border bg-background px-3 py-2 text-xs">
                      <div className="font-medium text-foreground">Schema</div>
                      <div className="mt-1 break-words font-mono text-[11px] text-muted-foreground">{providerCertificationSummary.schemaVersion}</div>
                    </div>
                    <div className="rounded-md border border-border bg-background px-3 py-2 text-xs">
                      <div className="font-medium text-foreground">Mock gate</div>
                      <div className="mt-1 font-mono text-[11px] text-muted-foreground">{providerCertificationSummary.localMockGate}</div>
                    </div>
                    <div className="rounded-md border border-border bg-background px-3 py-2 text-xs">
                      <div className="font-medium text-foreground">Live gate</div>
                      <div className="mt-1 font-mono text-[11px] text-muted-foreground">{providerCertificationSummary.liveCertificationGate}</div>
                    </div>
                    <div className="rounded-md border border-border bg-background px-3 py-2 text-xs">
                      <div className="font-medium text-foreground">Secrets</div>
                      <div className="mt-1 text-muted-foreground">Server env only</div>
                    </div>
                  </div>
                  <div className="mt-3 grid gap-2 md:grid-cols-2 xl:grid-cols-3">
                    {providerCertificationSummary.groups.map((group) => (
                      <div key={group.family} className="rounded-md border border-border bg-background px-3 py-2 text-xs">
                        <div className="font-medium text-foreground">{group.family}</div>
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          {group.providers.map((provider) => (
                            <span key={`${group.family}-${provider}`} className="rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">
                              {provider}
                            </span>
                          ))}
                        </div>
                        <div className="mt-2 rounded-md border border-border bg-muted/30 px-2 py-1.5">
                          <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Required inputs</div>
                          <div className="mt-1 flex flex-wrap gap-1">
                            {group.requiredInputs.map((input) => (
                              <span key={`${group.family}-${input}`} className="rounded bg-background px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
                                {input}
                              </span>
                            ))}
                          </div>
                        </div>
                        <div className="mt-2 text-[11px] leading-4 text-muted-foreground">{group.evidence}</div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
              <div id="products-commerce-analytics" data-testid="products-commerce-analytics" className="scroll-mt-24 rounded-lg border border-border bg-background p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h3 className="text-sm font-semibold">Commerce analytics and customer profiles</h3>
                    <p className="mt-1 text-sm text-muted-foreground">
                      Read private order and customer records so the catalog page can show revenue signal without exposing those records to public storefront APIs.
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Link
                      to="/orders"
                      search={activeSiteSearch}
                      aria-disabled={isProductsBusy}
                      className={cn(
                        'inline-flex min-h-9 items-center justify-center rounded-lg border border-border bg-card px-3 text-xs font-medium hover:bg-accent',
                        isProductsBusy && 'pointer-events-none opacity-60',
                      )}
                    >
                      Orders
                    </Link>
                    <Link
                      to="/collections"
                      search={customerCollectionSearch}
                      aria-disabled={!customersCollection || isProductsBusy}
                      className={cn(
                        'inline-flex min-h-9 items-center justify-center rounded-lg border border-border bg-card px-3 text-xs font-medium hover:bg-accent',
                        (!customersCollection || isProductsBusy) && 'pointer-events-none opacity-60',
                      )}
                    >
                      Customer profiles
                    </Link>
                  </div>
                </div>
                <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                  <Metric label="Paid revenue" value={formatMoney(commerceAnalytics.revenue, commerceAnalytics.currency)} icon={<ShoppingBag className="size-4" />} />
                  <Metric label="Paid orders" value={commerceAnalytics.paidOrderCount} icon={<CheckCircle2 className="size-4" />} />
                  <Metric label="Customers" value={commerceAnalytics.customerCount} icon={<Package className="size-4" />} />
                  <Metric label="Avg order" value={formatMoney(commerceAnalytics.averageOrderValue, commerceAnalytics.currency)} icon={<Boxes className="size-4" />} />
                </div>
                <div className="mt-4 rounded-lg border border-border bg-card p-3" data-testid="products-backend-commerce-analytics">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Backend order analytics</div>
                      <p className="mt-1 max-w-3xl text-xs leading-5 text-muted-foreground">
                        Pulls the private order analytics endpoint so product managers can see payment attention, fulfillment backlog, source mix, tax/shipping/discount totals, and subscription lifecycle signal from the catalog page.
                      </p>
                    </div>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => void loadCommerceOrderAnalytics()}
                      disabled={isProductsAccessBusy || !ordersCollection || !canViewCommerce}
                      title={!canViewCommerce ? viewPermissionTitle : !ordersCollection ? 'Create the private orders queue first.' : undefined}
                      iconStart={<RefreshCw className={cn('size-3.5', isOrderAnalyticsLoading && 'animate-spin')} />}
                    >
                      Refresh analytics
                    </Button>
                  </div>
                  {orderAnalyticsError ? (
                    <div className="mt-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                      {orderAnalyticsError}
                    </div>
                  ) : (
                    <div className="mt-3 grid gap-3 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)_minmax(260px,0.7fr)]">
                      <div className="grid gap-2 sm:grid-cols-2">
                        <Metric label="Backend orders" value={orderAnalytics?.orderCount ?? 0} icon={<ShoppingBag className="size-4" />} />
                        <Metric label="Payment attention" value={orderAnalytics?.operations.paymentAttentionCount ?? 0} icon={<AlertTriangle className="size-4" />} />
                        <Metric label="Fulfillment backlog" value={orderAnalytics?.operations.fulfillmentBacklogCount ?? 0} icon={<Package className="size-4" />} />
                        <Metric label="Paid avg order" value={formatMoney(orderAnalytics?.revenue.paidAverageOrderValue ?? 0, backendAnalyticsCurrency)} icon={<Boxes className="size-4" />} />
                      </div>
                      <div className="grid gap-2 sm:grid-cols-3">
                        <div className="rounded-lg border border-border bg-background p-3">
                          <div className="text-xs font-medium text-muted-foreground">Tax collected</div>
                          <div className="mt-1 font-mono text-lg font-semibold">{formatMoney(orderAnalytics?.revenue.taxTotal ?? 0, backendAnalyticsCurrency)}</div>
                        </div>
                        <div className="rounded-lg border border-border bg-background p-3">
                          <div className="text-xs font-medium text-muted-foreground">Shipping charged</div>
                          <div className="mt-1 font-mono text-lg font-semibold">{formatMoney(orderAnalytics?.revenue.shippingTotal ?? 0, backendAnalyticsCurrency)}</div>
                        </div>
                        <div className="rounded-lg border border-border bg-background p-3">
                          <div className="text-xs font-medium text-muted-foreground">Discount given</div>
                          <div className="mt-1 font-mono text-lg font-semibold">{formatMoney(orderAnalytics?.revenue.discountTotal ?? 0, backendAnalyticsCurrency)}</div>
                        </div>
                        <div className="rounded-lg border border-border bg-background p-3">
                          <div className="text-xs font-medium text-muted-foreground">Manual orders</div>
                          <div className="mt-1 font-mono text-lg font-semibold">{orderAnalytics?.operations.manualOrderCount ?? 0}</div>
                        </div>
                        <div className="rounded-lg border border-border bg-background p-3">
                          <div className="text-xs font-medium text-muted-foreground">Checkout orders</div>
                          <div className="mt-1 font-mono text-lg font-semibold">{orderAnalytics?.operations.checkoutOrderCount ?? 0}</div>
                        </div>
                        <div className="rounded-lg border border-border bg-background p-3">
                          <div className="text-xs font-medium text-muted-foreground">Refunds</div>
                          <div className="mt-1 font-mono text-lg font-semibold">{orderAnalytics?.operations.refundCount ?? 0}</div>
                        </div>
                      </div>
                      <div className="rounded-lg border border-border bg-background p-3">
                        <div className="flex items-center justify-between gap-2">
                          <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Subscription operations</div>
                          <span className="rounded-full bg-muted px-2 py-1 text-[11px] text-muted-foreground">
                            {orderAnalytics?.generatedAt ? formatDate(orderAnalytics.generatedAt) : 'No analytics'}
                          </span>
                        </div>
                        <div className="mt-3 grid gap-2 text-sm">
                          {[
                            ['Active paid', orderAnalytics?.operations.subscriptionActivePaidCount ?? 0],
                            ['Renewals', orderAnalytics?.operations.subscriptionRenewalCount ?? 0],
                            ['Dunning', orderAnalytics?.operations.subscriptionDunningCount ?? 0],
                            ['Paused', orderAnalytics?.operations.subscriptionPausedCount ?? 0],
                            ['Trial ending', orderAnalytics?.operations.subscriptionTrialEndingCount ?? 0],
                            ['Cancelled', orderAnalytics?.operations.subscriptionCancelledCount ?? 0],
                          ].map(([label, value]) => (
                            <div key={label} className="flex items-center justify-between rounded-md border border-border bg-card px-3 py-2">
                              <span className="text-muted-foreground">{label}</span>
                              <span className="font-mono font-semibold">{value}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}
                  <div className="mt-3 flex flex-wrap gap-2 text-xs text-muted-foreground">
                    {(orderAnalytics?.sources || []).slice(0, 4).map((source) => (
                      <span key={source.source} className="rounded-full bg-muted px-2 py-1">
                        {source.source}: {source.count} / {formatMoney(source.total, backendAnalyticsCurrency)}
                      </span>
                    ))}
                    {(orderAnalytics?.sources || []).length === 0 ? (
                      <span className="rounded-full bg-muted px-2 py-1">Source mix appears after orders are loaded.</span>
                    ) : null}
                  </div>
                </div>
                <div className="mt-4 grid gap-3 xl:grid-cols-3">
                  <div className="rounded-lg border border-border bg-card p-3">
                    <div className="flex items-center justify-between gap-3">
                      <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Recent order signal</div>
                      <span className="rounded-full bg-muted px-2 py-1 text-[11px] text-muted-foreground">
                        {commerceAnalytics.orderCount} loaded
                      </span>
                    </div>
                    <div className="mt-3 space-y-2">
                      {commerceAnalytics.recentOrders.length > 0 ? commerceAnalytics.recentOrders.map((order) => (
                        <div key={order.id} className="flex items-center justify-between gap-3 rounded-md border border-border bg-background px-3 py-2 text-sm">
                          <div className="min-w-0">
                            <div className="truncate font-medium text-foreground">{order.orderNumber || order.slug}</div>
                            <div className="truncate text-xs text-muted-foreground">{order.customerName} · {order.paymentStatus}/{order.orderStatus}</div>
                          </div>
                          <div className="shrink-0 text-right">
                            <div className="font-semibold">{formatMoney(order.total, order.currency)}</div>
                            <div className="text-[11px] text-muted-foreground">{order.updatedAt ? formatDate(order.updatedAt) : 'No date'}</div>
                          </div>
                        </div>
                      )) : (
                        <EmptyState
                          icon={FileText}
                          title="No private order records yet"
                          description="Public checkout intake will populate this signal after the first order."
                        />
                      )}
                    </div>
                  </div>
                  <div className="rounded-lg border border-border bg-card p-3" data-testid="products-product-performance">
                    <div className="flex items-center justify-between gap-3">
                      <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Product performance</div>
                      <span className="rounded-full bg-muted px-2 py-1 text-[11px] text-muted-foreground">
                        {commerceAnalytics.topProducts.length} ranked
                      </span>
                    </div>
                    <div className="mt-3 space-y-2">
                      {commerceAnalytics.topProducts.length > 0 ? commerceAnalytics.topProducts.map((product) => (
                        <div key={product.productId || product.slug || product.title} className="rounded-md border border-border bg-background px-3 py-2 text-sm">
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <div className="truncate font-medium text-foreground">{product.title || product.slug || 'Order line item'}</div>
                              <div className="truncate text-xs text-muted-foreground">
                                {product.sku || product.slug || product.productId || 'No product id'} · {product.units} unit{product.units === 1 ? '' : 's'}
                              </div>
                            </div>
                            <div className="shrink-0 text-right">
                              <div className="font-semibold">{formatMoney(product.revenue, product.currency)}</div>
                              <div className="text-[11px] text-muted-foreground">{product.orderCount} order{product.orderCount === 1 ? '' : 's'}</div>
                            </div>
                          </div>
                          <div className="mt-2 flex flex-wrap gap-1.5">
                            <span className="rounded bg-muted px-2 py-0.5 text-[11px] capitalize text-muted-foreground">{product.status}</span>
                            <span className={cn(
                              'rounded px-2 py-0.5 text-[11px]',
                              product.lowStock ? 'bg-amber-50 text-amber-700' : 'bg-muted text-muted-foreground',
                            )}
                            >
                              {product.lowStock ? 'Low stock' : `${product.inventory} in stock`}
                            </span>
                          </div>
                        </div>
                      )) : (
                        <EmptyState
                          icon={Package}
                          title="No product performance yet"
                          description="Performance appears after paid checkout orders include structured line items."
                        />
                      )}
                    </div>
                  </div>
                  <div className="rounded-lg border border-border bg-card p-3" data-testid="products-notification-automation">
                    <div className="flex items-center justify-between gap-3">
                      <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Product automation</div>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => void loadProductNotificationEvents()}
                        disabled={isProductsAccessBusy || !canViewCommerce}
                        title={!canViewCommerce ? viewPermissionTitle : undefined}
                        iconStart={<RefreshCw className="size-3.5" />}
                      >
                        Refresh
                      </Button>
                    </div>
                    <p className="mt-2 text-xs leading-5 text-muted-foreground">
                      Checkout inventory reservations emit low-stock product notifications when a physical item crosses its configured threshold.
                    </p>
                    <code className="mt-2 block text-xs text-muted-foreground">/events?kind=commerce-product</code>
                    {productNotificationError ? (
                      <div className="mt-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                        {productNotificationError}
                      </div>
                    ) : productNotificationEvents.length === 0 ? (
                      <div className="mt-3">
                        <EmptyState
                          icon={FileText}
                          title="No product automation events"
                          description="Low-stock email and workflow webhook handoffs will appear after checkout inventory reservations trigger product alerts."
                        />
                      </div>
                    ) : (
                      <div className="mt-3 space-y-2">
                        {productNotificationEvents.slice(0, 4).map((event) => (
                          <div key={event.id} className="rounded-md border border-border bg-background px-3 py-2 text-sm">
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0">
                                <div className="truncate font-medium text-foreground">
                                  {String(event.metadata?.productTitle || event.metadata?.productSlug || 'Product alert')}
                                </div>
                                <div className="truncate text-xs text-muted-foreground">
                                  {String(event.metadata?.event || 'product.low_stock')} {'->'} {String(event.metadata?.channel || 'event')}
                                </div>
                              </div>
                              <span className={cn(
                                'rounded px-2 py-0.5 text-[11px]',
                                event.status === 'succeeded' ? 'bg-success/10 text-success' : event.status === 'failed' ? 'bg-destructive/10 text-destructive' : 'bg-muted text-muted-foreground',
                              )}
                              >
                                {event.status}
                              </span>
                            </div>
                            <div className="mt-2 flex flex-wrap gap-2 text-xs text-muted-foreground">
                              <span>{Number(event.metadata?.inventory || 0)} in stock</span>
                              <span>threshold {Number(event.metadata?.lowStockThreshold || 0)}</span>
                              {event.createdAt ? <span>{formatDate(event.createdAt)}</span> : null}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="rounded-lg border border-border bg-card p-3">
                    <div className="flex items-center justify-between gap-3">
                      <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Top customer profiles</div>
                      <div className="flex flex-wrap items-center justify-end gap-2">
                        {customerProfiles.length > 0 ? (
                          <select
                            aria-label="Customer profile"
                            value={selectedCustomerProfileId || ''}
                            onChange={(event) => {
                              const profile = customerProfiles.find((item) => item.id === event.target.value);
                              if (profile) selectCustomerProfile(profile);
                            }}
                            disabled={isProductsAccessBusy || !canViewProducts}
                            className="min-h-8 max-w-44 rounded-md border border-border bg-background px-2 py-1 text-xs disabled:cursor-not-allowed disabled:opacity-60"
                          >
                            {customerProfiles.map((customer) => (
                              <option key={customer.id} value={customer.id}>
                                {String(customer.values?.email || customer.values?.name || customer.slug)}
                              </option>
                            ))}
                          </select>
                        ) : null}
                        <span className="rounded-full bg-muted px-2 py-1 text-[11px] text-muted-foreground">
                          {commerceAnalytics.repeatCustomerCount} repeat
                        </span>
                      </div>
                    </div>
                    <div className="mt-3 space-y-2">
                      {commerceAnalytics.topCustomers.length > 0 ? commerceAnalytics.topCustomers.map((customer) => (
                        <div key={customer.id} className="flex items-center justify-between gap-3 rounded-md border border-border bg-background px-3 py-2 text-sm">
                          <div className="min-w-0">
                            <div className="truncate font-medium text-foreground">{customer.name}</div>
                            <div className="truncate text-xs text-muted-foreground">{customer.email || customer.slug}</div>
                            <div className="mt-1 flex flex-wrap gap-1.5">
                              <span className="rounded bg-muted px-2 py-0.5 text-[11px] capitalize text-muted-foreground">
                                {customer.status}
                              </span>
                              {customer.phone ? (
                                <span className="rounded bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">
                                  {customer.phone}
                                </span>
                              ) : null}
                            </div>
                          </div>
                          <div className="shrink-0 text-right">
                            <div className="font-semibold">{formatMoney(customer.totalSpent, commerceAnalytics.currency)}</div>
                            <div className="text-[11px] text-muted-foreground">{customer.orderCount} orders</div>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => {
                                const profile = customerProfiles.find((item) => item.id === customer.id);
                                if (profile) selectCustomerProfile(profile);
                              }}
                              disabled={isProductsAccessBusy || !canViewProducts}
                              className="mt-1 min-h-8 px-2 text-xs"
                              data-testid={`products-customer-manage-${customer.id}`}
                            >
                              Manage
                            </Button>
                          </div>
                        </div>
                      )) : (
                        <EmptyState
                          icon={Users}
                          title="No customer profiles yet"
                          description="Customer profiles are created automatically from checkout intake and stay in the private customers collection."
                        />
                      )}
                    </div>
                    {selectedCustomerProfile && (
                      <div className="mt-4 rounded-lg border border-border bg-background p-3" data-testid="products-customer-profile-manager">
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div>
                            <div className="text-sm font-semibold text-foreground">Manage profile</div>
                            <div className="mt-1 text-xs text-muted-foreground">
                              Update private customer contact status and notes without leaving Products.
                            </div>
                          </div>
                          <span className="rounded-full bg-muted px-2 py-1 font-mono text-[11px] text-muted-foreground">
                            {selectedCustomerProfile.slug}
                          </span>
                        </div>
                        <div className="mt-3 grid gap-3 md:grid-cols-2">
                          <Field label="Customer name">
                            <input
                              value={customerProfileDraft.name}
                              onChange={(event) => setCustomerProfileDraft((current) => ({ ...current, name: event.target.value }))}
                              disabled={isProductsAccessBusy || !canEditProducts}
                              className="w-full rounded-lg border bg-background px-3 py-2.5 text-sm disabled:cursor-not-allowed disabled:opacity-60"
                            />
                          </Field>
                          <Field label="Customer email">
                            <input
                              type="email"
                              value={customerProfileDraft.email}
                              onChange={(event) => setCustomerProfileDraft((current) => ({ ...current, email: event.target.value }))}
                              disabled={isProductsAccessBusy || !canEditProducts}
                              className="w-full rounded-lg border bg-background px-3 py-2.5 text-sm disabled:cursor-not-allowed disabled:opacity-60"
                            />
                          </Field>
                          <Field label="Customer phone">
                            <input
                              value={customerProfileDraft.phone}
                              onChange={(event) => setCustomerProfileDraft((current) => ({ ...current, phone: event.target.value }))}
                              disabled={isProductsAccessBusy || !canEditProducts}
                              className="w-full rounded-lg border bg-background px-3 py-2.5 text-sm disabled:cursor-not-allowed disabled:opacity-60"
                            />
                          </Field>
                          <Field label="Customer status">
                            <select
                              value={customerProfileDraft.status}
                              onChange={(event) => setCustomerProfileDraft((current) => ({ ...current, status: event.target.value as CustomerStatusOption }))}
                              disabled={isProductsAccessBusy || !canEditProducts}
                              className="w-full rounded-lg border bg-background px-3 py-2.5 text-sm capitalize disabled:cursor-not-allowed disabled:opacity-60"
                            >
                              {CUSTOMER_STATUS_OPTIONS.map((status) => (
                                <option key={status} value={status}>{status}</option>
                              ))}
                            </select>
                          </Field>
                        </div>
                        <Field label="Customer notes" className="mt-3">
                          <textarea
                            value={customerProfileDraft.notes}
                            onChange={(event) => setCustomerProfileDraft((current) => ({ ...current, notes: event.target.value }))}
                            rows={3}
                            disabled={isProductsAccessBusy || !canEditProducts}
                            className="w-full rounded-lg border bg-background px-3 py-2.5 text-sm disabled:cursor-not-allowed disabled:opacity-60"
                            placeholder="Internal customer notes"
                          />
                        </Field>
                        <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                          <Link
                            to="/collections"
                            search={customerCollectionSearch}
                            aria-disabled={!customersCollection || isProductsBusy}
                            className={cn(
                              'inline-flex min-h-9 items-center justify-center rounded-lg border border-border bg-card px-3 text-xs font-medium hover:bg-accent',
                              (!customersCollection || isProductsBusy) && 'pointer-events-none opacity-60',
                            )}
                          >
                            Open collection
                          </Link>
                          <Button
                            size="sm"
                            onClick={() => void saveCustomerProfile()}
                            disabled={isProductsAccessBusy || !canEditProducts}
                            title={!canEditProducts ? editPermissionTitle : undefined}
                            iconStart={<Edit3 className="size-4" />}
                            data-testid="products-customer-profile-save"
                          >
                            {isSavingCustomerProfile ? 'Saving...' : 'Save profile'}
                          </Button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
              <div className="rounded-lg border border-border bg-background p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h3 className="text-sm font-semibold">Storefront frontend control contract</h3>
                    <p className="mt-1 text-sm text-muted-foreground">
                      Custom storefronts need these systems to list products, render detail pages, track stock, hand off checkout, and merchandise catalogs from Backy.
                    </p>
                  </div>
                  <span className="rounded-full bg-muted px-2.5 py-1 text-xs font-medium text-muted-foreground">
                    {PRODUCT_FRONTEND_SYSTEMS.length} systems
                  </span>
                </div>
                <div className="mt-4 grid gap-2 md:grid-cols-2 xl:grid-cols-3">
                  {PRODUCT_FRONTEND_SYSTEMS.map((system) => (
                    <div key={system.key} className="rounded-lg border border-border bg-card p-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="text-sm font-semibold text-foreground">{system.title}</div>
                          <div className="mt-1 text-xs leading-5 text-muted-foreground">{system.detail}</div>
                        </div>
                        <span className="shrink-0 rounded-full bg-muted px-2 py-1 font-mono text-[10px] text-muted-foreground">
                          {system.key}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              <div data-testid="products-page-binding-contract" className="rounded-lg border border-border bg-background p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h3 className="text-sm font-semibold">Page and editor binding contract</h3>
                    <p className="mt-1 text-sm text-muted-foreground">
                      Storefront pages should bind product records into grids, detail sections, variant controls, checkout buttons, merchandising filters, and product media.
                    </p>
                  </div>
                  <span className="rounded-full bg-muted px-2.5 py-1 text-xs font-medium text-muted-foreground">
                    {PRODUCT_PAGE_BINDING_TARGETS.length} targets
                  </span>
                </div>
                <div className="mt-4 grid gap-2 md:grid-cols-2 xl:grid-cols-3">
                  {PRODUCT_PAGE_BINDING_TARGETS.map((target) => (
                    <div key={target.key} className="rounded-lg border border-border bg-card p-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="text-sm font-semibold text-foreground">{target.title}</div>
                          <div className="mt-1 text-xs leading-5 text-muted-foreground">{target.detail}</div>
                        </div>
                        <span className="shrink-0 rounded-full bg-muted px-2 py-1 font-mono text-[10px] text-muted-foreground">
                          {target.key}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              <div id="products-page-templates" data-testid="products-page-templates" className="scroll-mt-24 rounded-lg border border-border bg-background p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h3 className="text-sm font-semibold">Product page templates</h3>
                    <p className="mt-1 text-sm text-muted-foreground">
                      Start editable product list and detail pages with the Products collection already attached as a dataset.
                    </p>
                  </div>
                  <span className="rounded-full bg-muted px-2.5 py-1 text-xs font-medium text-muted-foreground">
                    {productPageTemplateBriefs.length} templates
                  </span>
                </div>
                <div className="mt-4 grid gap-3 md:grid-cols-2">
                  {productPageTemplateBriefs.map((brief) => (
                    <div key={brief.id} className="rounded-lg border border-border bg-card p-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="text-sm font-semibold text-foreground">{brief.title}</div>
                          <div className="mt-1 text-xs font-medium text-primary">{brief.variant}</div>
                          <div className="mt-1 text-xs leading-5 text-muted-foreground">{brief.description}</div>
                        </div>
                        <span className="shrink-0 rounded-full bg-primary/10 px-2 py-1 font-mono text-[10px] font-semibold text-primary">
                          {brief.mode}
                        </span>
                      </div>
                      <div className="mt-3 space-y-2 text-xs">
                        <div className="flex items-center justify-between gap-3 rounded border border-border bg-background px-2.5 py-2">
                          <span className="font-medium text-foreground">Dataset</span>
                          <span className="font-mono text-muted-foreground">{productCollection.id}</span>
                        </div>
                        <div className="flex items-center justify-between gap-3 rounded border border-border bg-background px-2.5 py-2">
                          <span className="font-medium text-foreground">Route model</span>
                          <span className="font-mono text-muted-foreground">{brief.routePattern}</span>
                        </div>
                        <div className="flex items-center justify-between gap-3 rounded border border-border bg-background px-2.5 py-2">
                          <span className="font-medium text-foreground">Route draft</span>
                          <span className="font-mono text-muted-foreground">/{brief.slug}</span>
                        </div>
                      </div>
                      <div className="mt-3 text-xs leading-5 text-muted-foreground">{brief.focus}</div>
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {brief.sections.slice(0, 5).map((section) => (
                          <span key={section} className="rounded bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">
                            {section}
                          </span>
                        ))}
                      </div>
                      <div className="mt-4 flex flex-wrap gap-2">
                        <Button
                          size="sm"
                          variant="primary"
                          onClick={() => openProductPageTemplate(brief)}
                          disabled={isProductPageTemplateActionDisabled}
                          title={!canEditPages ? pagesEditPermissionTitle : undefined}
                          iconStart={<Sparkles className="size-4" />}
                          data-testid={brief.id === 'catalog-grid' ? 'products-page-template-list' : brief.id === 'product-detail' ? 'products-page-template-item' : `products-page-template-${brief.id}`}
                        >
                          Create {brief.mode === 'list' ? 'list page' : 'detail page'}
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => void copyText(JSON.stringify(brief.manifest, null, 2), `${brief.title} page template brief`)}
                          disabled={isProductsAccessBusy || !canExportProducts}
                          title={!canExportProducts ? exportPermissionTitle : undefined}
                          iconStart={<Copy className="size-4" />}
                        >
                          Copy brief
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </PanelContent>
        </Panel>
      )}

      <div id="products-site" className="mb-4 flex flex-wrap items-center gap-3 rounded-lg border border-border bg-card px-4 py-3 scroll-mt-24">
        <label className="text-sm font-medium text-muted-foreground" htmlFor="products-active-site-inline">
          Active site
        </label>
        <select
          id="products-active-site-inline"
          aria-label="Active product site"
          value={activeSiteId}
          disabled={isProductsBusy}
          onChange={(event) => {
            selectProductsSite(event.target.value);
          }}
          className="min-h-10 min-w-56 rounded-lg border bg-background px-3 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-60"
        >
          {sites.length === 0 ? (
            <option value="site-demo">Demo site</option>
          ) : sites.map((site) => (
            <option key={site.id} value={site.publicSiteId || site.id}>
              {site.name}
            </option>
          ))}
        </select>
        <span className="text-sm text-muted-foreground">
          {activeSite?.name || activeSiteId} storefront catalog
        </span>
      </div>

      <div id="products-metrics" className="mb-6 grid gap-3 scroll-mt-24 md:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-8">
        <Metric label="Products" value={metrics.total} icon={<Package className="size-4" />} />
        <Metric label="Published" value={metrics.published} icon={<CheckCircle2 className="size-4" />} />
        <Metric label="Draft" value={metrics.draft} icon={<Edit3 className="size-4" />} />
        <Metric label="Scheduled" value={metrics.scheduled} icon={<Sparkles className="size-4" />} />
        <Metric label="Inventory" value={metrics.inventory} icon={<Boxes className="size-4" />} />
        <Metric label="Low stock" value={metrics.lowStock} icon={<Archive className="size-4" />} />
        <Metric label="Categories" value={metrics.categories} icon={<ShoppingBag className="size-4" />} />
        <Metric label="Digital" value={metrics.digital} icon={<Sparkles className="size-4" />} />
      </div>

      {!productCollection ? (
        <EmptyState
          icon={ShoppingBag}
          title="Products are not set up"
          description="Create a products collection with pricing, SKU, inventory, image, and publishing fields."
          action={
            <div className="mt-2 flex flex-wrap justify-center gap-2">
              <Button onClick={() => void createProductsCollection()} disabled={isProductsAccessBusy || !canConfigureProducts} title={!canConfigureProducts ? configurePermissionTitle : undefined} iconStart={<Sparkles className="size-4" />}>
                {isSaving ? 'Setting up...' : 'Set Up Products'}
              </Button>
              <Button variant="outline" onClick={openStorefrontPage} disabled={isProductsAccessBusy || !canEditPages} title={!canEditPages ? pagesEditPermissionTitle : undefined} iconStart={<Sparkles className="size-4" />}>
                Start storefront page
              </Button>
            </div>
          }
        />
      ) : (
        <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_420px]">
          <div className="min-w-0 space-y-6">
            <Panel id="products-catalog" className="scroll-mt-24">
              <PanelHeader
                title="Catalog"
                description={`${filteredProducts.length}/${loadedProductCount} visible loaded products${totalProductCount > loadedProductCount ? `, ${totalProductCount} total` : ''}`}
                icon={<ShoppingBag className="size-4" />}
                action={<Button onClick={resetForm} disabled={isProductsAccessBusy || !canEditProducts} title={!canEditProducts ? editPermissionTitle : undefined} iconStart={<Plus className="size-4" />}>New Product</Button>}
              />
              <PanelContent>
                <div className="mb-4 flex flex-wrap items-center gap-3">
                  <div className="relative min-w-64 flex-1">
                    <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                    <input
                      aria-label="Search products"
                      value={searchQuery}
                      disabled={isProductsAccessBusy || !canViewProducts}
                      onChange={(event) => {
                        if (isProductsBusy) return;
                        const q = event.target.value;
                        setSearchQuery(q);
                        clearProductEditorState();
                        updateProductsRouteSearch({ q: q || undefined, productId: undefined });
                      }}
                      placeholder="Search products..."
                      className="w-full rounded-lg border bg-background py-2.5 pl-9 pr-3 text-sm disabled:cursor-not-allowed disabled:opacity-60"
                    />
                  </div>
                  <div className="inline-flex flex-wrap items-center gap-1 rounded-lg border border-border bg-muted p-1">
                    {PRODUCT_STATUS_FILTERS.map((status) => (
                      <button
                        key={status}
                        type="button"
                        disabled={isProductsAccessBusy || !canViewProducts}
                        onClick={() => {
                          if (isProductsBusy) return;
                          setStatusFilter(status);
                          clearProductEditorState();
                          updateProductsRouteSearch({ status, productId: undefined });
                        }}
                        className={cn(
                          'rounded-md px-3 py-1.5 text-sm font-medium capitalize text-muted-foreground hover:bg-background hover:text-foreground disabled:cursor-not-allowed disabled:opacity-60',
                          statusFilter === status && 'bg-background text-foreground shadow-sm',
                        )}
                      >
                        {status}
                      </button>
                    ))}
                  </div>
                  <select
                    aria-label="Product type filter"
                    value={productTypeFilter}
                    disabled={isProductsAccessBusy || !canViewProducts}
                    onChange={(event) => {
                      if (isProductsBusy) return;
                      const type = event.target.value as ProductTypeFilter;
                      setProductTypeFilter(type);
                      clearProductEditorState();
                      updateProductsRouteSearch({ type, productId: undefined });
                    }}
                    className="min-h-10 rounded-lg border border-border bg-background px-3 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    <option value="all">All types</option>
                    <option value="physical">Physical</option>
                    <option value="digital">Digital</option>
                    <option value="service">Service</option>
                  </select>
                  <select
                    aria-label="Product category filter"
                    value={categoryFilter}
                    disabled={isProductsAccessBusy || !canViewProducts}
                    onChange={(event) => {
                      if (isProductsBusy) return;
                      const category = event.target.value;
                      setCategoryFilter(category);
                      clearProductEditorState();
                      updateProductsRouteSearch({ category, productId: undefined });
                    }}
                    className="min-h-10 rounded-lg border border-border bg-background px-3 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    <option value="all">All categories</option>
                    {productCategories.map((category) => (
                      <option key={category} value={category}>{category}</option>
                    ))}
                  </select>
                  <select
                    aria-label="Product stock filter"
                    value={stockFilter}
                    disabled={isProductsAccessBusy || !canViewProducts}
                    onChange={(event) => {
                      if (isProductsBusy) return;
                      const stock = event.target.value as ProductStockFilter;
                      setStockFilter(stock);
                      clearProductEditorState();
                      updateProductsRouteSearch({ stock, productId: undefined });
                    }}
                    className="min-h-10 rounded-lg border border-border bg-background px-3 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    <option value="all">All stock</option>
                    <option value="in-stock">In stock</option>
                    <option value="low-stock">Low stock</option>
                    <option value="out-of-stock">Out of stock</option>
                    <option value="featured">Featured</option>
                    <option value="checkout-missing">No checkout URL</option>
                  </select>
                  {hasActiveCatalogFilters && (
                    <Button variant="outline" onClick={clearCatalogFilters} disabled={isProductsAccessBusy || !canViewProducts}>
                      Clear filters
                    </Button>
                  )}
                </div>
                <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
                  <span>
                    Loaded {loadedProductCount} of {totalProductCount} product records. Filters and CSV export apply to loaded rows.
                  </span>
                  {hasMoreProducts && (
                    <Button
                      variant="outline"
                      onClick={() => void loadMoreProducts()}
                      disabled={isProductsAccessBusy || !canViewProducts}
                      title={!canViewProducts ? viewPermissionTitle : undefined}
                    >
                      {isLoading ? 'Loading...' : 'Load more'}
                    </Button>
                  )}
                </div>

                {filteredProducts.length === 0 ? (
                  <div>
                    <EmptyState
                      icon={ShoppingBag}
                      title={products.length === 0 ? 'No products yet' : 'No products match this view'}
                      description={products.length === 0
                        ? 'Create the first sellable product, then publish it for storefront APIs.'
                        : 'Change the search, status, type, category, or stock filters to broaden the catalog.'}
                      action={products.length > 0 && hasActiveCatalogFilters ? (
                        <Button variant="outline" onClick={clearCatalogFilters} disabled={isProductsAccessBusy || !canViewProducts}>
                          Clear filters
                        </Button>
                      ) : undefined}
                    />
                  </div>
                ) : (
                  <div className="grid gap-3 lg:grid-cols-2">
                    {filteredProducts.map((product) => (
                      <ProductCard
                        key={product.id}
                        product={product}
                        selected={product.id === selectedProductId}
                        onEdit={() => selectProductForEditing(product.id)}
                        onPublish={() => void changeProductStatus(product, 'published')}
                        onArchive={() => void changeProductStatus(product, 'archived')}
                        onDelete={() => {
                          if (!canDeleteProducts) {
                            setError(deletePermissionTitle || 'Your account cannot delete products.');
                            return;
                          }
                          setPendingDeleteProduct(product);
                        }}
                        disabled={isProductsAccessBusy || !canEditProducts}
                        canDelete={canDeleteProducts}
                        deleteDisabledReason={deletePermissionTitle}
                      />
                    ))}
                  </div>
                )}
              </PanelContent>
            </Panel>
          </div>

          <Panel id="products-editor" className="scroll-mt-24 xl:sticky xl:top-4 xl:self-start">
            <PanelHeader
              title={selectedProduct ? 'Edit product' : 'New product'}
              description="Pricing, inventory, public status, and storefront metadata."
              icon={<Package className="size-4" />}
            />
            <PanelContent>
              <form onSubmit={saveProduct}>
                <fieldset disabled={isProductsAccessBusy || !canEditProducts} title={!canEditProducts ? editPermissionTitle : undefined} className={cn('space-y-4', (isProductsAccessBusy || !canEditProducts) && 'opacity-70')}>
                <Field label="Title">
                  <input
                    value={formState.title}
                    onChange={(event) => setFormState((current) => ({
                      ...current,
                      title: event.target.value,
                      slug: current.slug || slugify(event.target.value),
                    }))}
                    required
                    className="w-full rounded-lg border bg-background px-3 py-2.5 text-sm"
                    placeholder="Backy Pro Template"
                  />
                </Field>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Slug">
                    <input
                      value={formState.slug}
                      onChange={(event) => setFormState((current) => ({ ...current, slug: slugify(event.target.value) }))}
                      className="w-full rounded-lg border bg-background px-3 py-2.5 text-sm"
                      placeholder="backy-pro-template"
                    />
                  </Field>
                  <Field label="SKU">
                    <input
                      value={formState.sku}
                      onChange={(event) => setFormState((current) => ({ ...current, sku: event.target.value }))}
                      required
                      className="w-full rounded-lg border bg-background px-3 py-2.5 text-sm"
                      placeholder="BKY-001"
                    />
                  </Field>
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <Field label="Price">
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={formState.price}
                      onChange={(event) => setFormState((current) => ({ ...current, price: event.target.value }))}
                      required
                      className="w-full rounded-lg border bg-background px-3 py-2.5 text-sm"
                    />
                  </Field>
                  <Field label="Compare at">
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={formState.compareAtPrice}
                      onChange={(event) => setFormState((current) => ({ ...current, compareAtPrice: event.target.value }))}
                      className="w-full rounded-lg border bg-background px-3 py-2.5 text-sm"
                      placeholder="Optional"
                    />
                  </Field>
                  <Field label="Currency">
                    <input
                      value={formState.currency}
                      onChange={(event) => setFormState((current) => ({ ...current, currency: event.target.value.toUpperCase().slice(0, 3) }))}
                      required
                      className="w-full rounded-lg border bg-background px-3 py-2.5 text-sm"
                    />
                  </Field>
                </div>
                <div className="space-y-3 rounded-lg border border-border bg-muted/20 p-3">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <div className="text-sm font-semibold text-foreground">Variants</div>
                      <div className="mt-1 text-xs text-muted-foreground">Options for sizes, licenses, colors, tiers, or file formats.</div>
                    </div>
                    <span className="rounded bg-background px-2 py-1 font-mono text-xs text-muted-foreground">
                      {productVariants.length}/{PRODUCT_VARIANT_LIMIT}
                    </span>
                  </div>

                  {productVariants.length > 0 ? (
                    <div className="space-y-2">
                      {productVariants.map((variant) => (
                        <div key={variant.id} className="grid gap-2 rounded-lg border border-border bg-background p-2 text-sm md:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_90px_90px_auto] md:items-center">
                          <div className="min-w-0">
                            <div className="truncate font-medium text-foreground">{variant.title}</div>
                            <div className="truncate font-mono text-xs text-muted-foreground">{variant.sku || 'No SKU'}</div>
                          </div>
                          <div className="truncate text-xs text-muted-foreground">{variant.option || 'Default option'}</div>
                          <div className="font-mono text-xs text-muted-foreground">
                            {variant.price === null ? 'Base' : formatMoney(variant.price, formState.currency)}
                          </div>
                          <div className="font-mono text-xs text-muted-foreground">
                            {variant.inventory === null ? 'Stock n/a' : `${variant.inventory} stock`}
                          </div>
                          <Button size="sm" variant="ghost" onClick={() => removeProductVariant(variant.id)} disabled={isProductsAccessBusy || !canEditProducts}>
                            Remove
                          </Button>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="rounded-lg border border-dashed border-border bg-background px-3 py-4 text-center text-sm text-muted-foreground">
                      Add product options when one catalog item has multiple sellable choices.
                    </div>
                  )}

                  <div className="grid gap-2 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_110px_110px_auto]">
                    <input
                      aria-label="Variant title"
                      value={variantDraft.title}
                      onChange={(event) => setVariantDraft((current) => ({ ...current, title: event.target.value }))}
                      className="rounded-lg border bg-background px-3 py-2.5 text-sm"
                      placeholder="Variant name"
                    />
                    <input
                      aria-label="Variant option"
                      value={variantDraft.option}
                      onChange={(event) => setVariantDraft((current) => ({ ...current, option: event.target.value }))}
                      className="rounded-lg border bg-background px-3 py-2.5 text-sm"
                      placeholder="Size, tier, color"
                    />
                    <input
                      aria-label="Variant price"
                      type="number"
                      min="0"
                      step="0.01"
                      value={variantDraft.price}
                      onChange={(event) => setVariantDraft((current) => ({ ...current, price: event.target.value }))}
                      className="rounded-lg border bg-background px-3 py-2.5 text-sm"
                      placeholder="Price"
                    />
                    <input
                      aria-label="Variant stock"
                      type="number"
                      min="0"
                      value={variantDraft.inventory}
                      onChange={(event) => setVariantDraft((current) => ({ ...current, inventory: event.target.value }))}
                      className="rounded-lg border bg-background px-3 py-2.5 text-sm"
                      placeholder="Stock"
                    />
                    <Button
                      variant="outline"
                      onClick={addProductVariant}
                      disabled={(!variantDraft.title.trim() && !variantDraft.option.trim()) || productVariants.length >= PRODUCT_VARIANT_LIMIT}
                    >
                      Add
                    </Button>
                  </div>
                  <input
                    aria-label="Variant SKU"
                    value={variantDraft.sku}
                    onChange={(event) => setVariantDraft((current) => ({ ...current, sku: event.target.value }))}
                    className="w-full rounded-lg border bg-background px-3 py-2.5 text-sm"
                    placeholder="Optional variant SKU"
                  />
                  <div className="rounded-lg border border-border bg-background p-3" data-testid="products-variant-matrix">
                    <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
                      <div>
                        <div className="text-sm font-semibold text-foreground">Option matrix</div>
                        <div className="mt-1 text-xs text-muted-foreground">
                          Generate sellable combinations from groups like Size and Color.
                        </div>
                      </div>
                      <label className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
                        <input
                          type="checkbox"
                          checked={optionMatrixDraft.replaceExisting}
                          onChange={(event) => setOptionMatrixDraft((current) => ({ ...current, replaceExisting: event.target.checked }))}
                          disabled={isProductsAccessBusy || !canEditProducts}
                        />
                        Replace current variants
                      </label>
                    </div>
                    <textarea
                      data-testid="products-variant-matrix-options"
                      aria-label="Variant option matrix"
                      value={optionMatrixDraft.options}
                      onChange={(event) => setOptionMatrixDraft((current) => ({ ...current, options: event.target.value }))}
                      className="mt-3 min-h-20 w-full rounded-lg border bg-background px-3 py-2.5 font-mono text-sm"
                      placeholder={'Size: S, M, L\nColor: Black, White'}
                      disabled={isProductsAccessBusy || !canEditProducts}
                    />
                    <div className="mt-3 grid gap-2 md:grid-cols-[minmax(0,1fr)_120px_120px_auto]">
                      <input
                        data-testid="products-variant-matrix-sku-prefix"
                        aria-label="Variant matrix SKU prefix"
                        value={optionMatrixDraft.skuPrefix}
                        onChange={(event) => setOptionMatrixDraft((current) => ({ ...current, skuPrefix: event.target.value }))}
                        className="rounded-lg border bg-background px-3 py-2.5 text-sm"
                        placeholder="SKU prefix"
                        disabled={isProductsAccessBusy || !canEditProducts}
                      />
                      <input
                        data-testid="products-variant-matrix-price"
                        aria-label="Variant matrix price"
                        type="number"
                        min="0"
                        step="0.01"
                        value={optionMatrixDraft.price}
                        onChange={(event) => setOptionMatrixDraft((current) => ({ ...current, price: event.target.value }))}
                        className="rounded-lg border bg-background px-3 py-2.5 text-sm"
                        placeholder="Price"
                        disabled={isProductsAccessBusy || !canEditProducts}
                      />
                      <input
                        data-testid="products-variant-matrix-stock"
                        aria-label="Variant matrix stock"
                        type="number"
                        min="0"
                        value={optionMatrixDraft.inventory}
                        onChange={(event) => setOptionMatrixDraft((current) => ({ ...current, inventory: event.target.value }))}
                        className="rounded-lg border bg-background px-3 py-2.5 text-sm"
                        placeholder="Stock"
                        disabled={isProductsAccessBusy || !canEditProducts}
                      />
                      <Button
                        variant="outline"
                        onClick={generateVariantMatrix}
                        disabled={!optionMatrixDraft.options.trim() || productVariants.length >= PRODUCT_VARIANT_LIMIT || isProductsAccessBusy || !canEditProducts}
                        data-testid="products-variant-matrix-generate"
                      >
                        Generate
                      </Button>
                    </div>
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <Field label="Stock">
                    <input
                      type="number"
                      min="0"
                      value={formState.inventory}
                      onChange={(event) => setFormState((current) => ({ ...current, inventory: event.target.value }))}
                      className="w-full rounded-lg border bg-background px-3 py-2.5 text-sm"
                    />
                  </Field>
                  <Field label="Low stock at">
                    <input
                      type="number"
                      min="0"
                      value={formState.lowStockThreshold}
                      onChange={(event) => setFormState((current) => ({ ...current, lowStockThreshold: event.target.value }))}
                      className="w-full rounded-lg border bg-background px-3 py-2.5 text-sm"
                    />
                  </Field>
                  <Field label="Inventory policy">
                    <select
                      value={formState.inventoryPolicy}
                      onChange={(event) => setFormState((current) => ({ ...current, inventoryPolicy: asInventoryPolicy(event.target.value) }))}
                      className="w-full rounded-lg border bg-background px-3 py-2.5 text-sm"
                    >
                      <option value="deny">Stop at zero</option>
                      <option value="continue">Continue selling</option>
                      <option value="preorder">Preorder</option>
                    </select>
                  </Field>
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <Field label="Type">
                    <select
                      value={formState.productType}
                      onChange={(event) => {
                        const productType = event.target.value as ProductFormState['productType'];
                        setFormState((current) => ({
                          ...current,
                          productType,
                          shippingRequired: productType === 'physical' ? current.shippingRequired : false,
                        }));
                      }}
                      className="w-full rounded-lg border bg-background px-3 py-2.5 text-sm"
                    >
                      <option value="physical">Physical</option>
                      <option value="digital">Digital</option>
                      <option value="service">Service</option>
                    </select>
                  </Field>
                  <Field label="Weight">
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={formState.weight}
                      onChange={(event) => setFormState((current) => ({ ...current, weight: event.target.value }))}
                      disabled={!formState.shippingRequired}
                      className="w-full rounded-lg border bg-background px-3 py-2.5 text-sm disabled:opacity-60"
                      placeholder="lb"
                    />
                  </Field>
                </div>
                <div className="grid gap-3 md:grid-cols-2">
                  <Field label="Digital delivery URL">
                    <div className="flex gap-2">
                      <input
                        aria-label="Digital delivery URL"
                        value={formState.downloadUrl}
                        onChange={(event) => setFormState((current) => ({ ...current, downloadUrl: event.target.value }))}
                        className="min-w-0 flex-1 rounded-lg border bg-background px-3 py-2.5 text-sm"
                        placeholder="https://downloads.example.com/product.zip"
                      />
                      <Button onClick={() => openMediaPicker('download')} disabled={!canViewMedia} title={!canViewMedia ? mediaViewPermissionTitle : undefined} iconStart={<FileText className="size-4" />}>
                        File
                      </Button>
                    </div>
                  </Field>
                  <Field label="Checkout URL">
                    <input
                      value={formState.checkoutUrl}
                      onChange={(event) => setFormState((current) => ({ ...current, checkoutUrl: event.target.value }))}
                      className="w-full rounded-lg border bg-background px-3 py-2.5 text-sm"
                      placeholder="Stripe, Lemon Squeezy, or custom checkout"
                    />
                  </Field>
                </div>
                <div className="rounded-lg border border-border bg-muted/40 p-4" data-testid="products-subscription-metadata">
                  <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <div className="text-sm font-semibold text-foreground">Subscription metadata</div>
                      <div className="mt-1 text-xs text-muted-foreground">Recurring-plan fields for storefronts; billing execution stays with checkout/order integrations.</div>
                    </div>
                    <label className="inline-flex items-center gap-2 text-sm font-medium text-foreground">
                      <input
                        type="checkbox"
                        checked={formState.subscriptionEnabled}
                        onChange={(event) => setFormState((current) => ({ ...current, subscriptionEnabled: event.target.checked }))}
                        disabled={isProductsAccessBusy || !canEditProducts}
                      />
                      Subscription
                    </label>
                  </div>
                  <div className="grid gap-3 md:grid-cols-2">
                    <Field label="Subscription interval">
                      <select
                        value={formState.subscriptionInterval}
                        onChange={(event) => setFormState((current) => ({ ...current, subscriptionInterval: asSubscriptionInterval(event.target.value) }))}
                        disabled={!formState.subscriptionEnabled || isProductsAccessBusy || !canEditProducts}
                        className="w-full rounded-lg border bg-background px-3 py-2.5 text-sm disabled:opacity-60"
                      >
                        <option value="weekly">Weekly</option>
                        <option value="monthly">Monthly</option>
                        <option value="quarterly">Quarterly</option>
                        <option value="yearly">Yearly</option>
                      </select>
                    </Field>
                    <Field label="Trial days">
                      <input
                        type="number"
                        min="0"
                        value={formState.subscriptionTrialDays}
                        onChange={(event) => setFormState((current) => ({ ...current, subscriptionTrialDays: event.target.value }))}
                        disabled={!formState.subscriptionEnabled || isProductsAccessBusy || !canEditProducts}
                        className="w-full rounded-lg border bg-background px-3 py-2.5 text-sm disabled:opacity-60"
                        placeholder="0"
                      />
                    </Field>
                  </div>
                </div>
                <div className="rounded-lg border border-border bg-muted/40 p-4" data-testid="products-subscription-lifecycle">
                  <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <div className="text-sm font-semibold text-foreground">Subscription lifecycle</div>
                      <div className="mt-1 text-xs text-muted-foreground">Product-scoped subscription orders, provider webhook states, and operator handoff routes.</div>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => void loadSelectedProductLifecycle()}
                        disabled={!selectedProduct || isProductLifecycleLoading || !canViewCommerce}
                        title={!selectedProduct ? 'Save the product before loading subscription lifecycle.' : (!canViewCommerce ? viewPermissionTitle : undefined)}
                        iconStart={<RefreshCw className={cn('size-4', isProductLifecycleLoading && 'animate-spin')} />}
                      >
                        Refresh lifecycle
                      </Button>
                      <Link
                        to="/orders"
                        search={{ siteId: activeSiteId }}
                        className="inline-flex min-h-9 items-center justify-center rounded-lg border border-border bg-background px-3 text-xs font-medium hover:bg-accent"
                      >
                        Open orders
                      </Link>
                    </div>
                  </div>
                  {productLifecycleError ? (
                    <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                      {productLifecycleError}
                    </div>
                  ) : null}
                  {productLifecycleActionMessage ? (
                    <div className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-900">
                      Subscription action {productLifecycleActionMessage}.
                    </div>
                  ) : null}
                  <div className="grid gap-3 md:grid-cols-4">
                    <div>
                      <div className="text-[11px] uppercase text-muted-foreground">Subscriptions</div>
                      <div className="mt-1 text-sm font-medium text-foreground">{selectedProductLifecycle?.summary.total ?? 0}</div>
                    </div>
                    <div>
                      <div className="text-[11px] uppercase text-muted-foreground">Active / renewal</div>
                      <div className="mt-1 text-sm font-medium text-foreground">
                        {(selectedProductLifecycle?.summary.active ?? 0) + (selectedProductLifecycle?.summary.renewals ?? 0)}
                      </div>
                    </div>
                    <div>
                      <div className="text-[11px] uppercase text-muted-foreground">Needs attention</div>
                      <div className="mt-1 text-sm font-medium text-foreground">
                        {(selectedProductLifecycle?.summary.dunning ?? 0) + (selectedProductLifecycle?.summary.paused ?? 0) + (selectedProductLifecycle?.summary.trialEnding ?? 0)}
                      </div>
                    </div>
                    <div>
                      <div className="text-[11px] uppercase text-muted-foreground">Product revenue</div>
                      <div className="mt-1 text-sm font-medium text-foreground">
                        {formatMoney(selectedProductLifecycle?.summary.revenue ?? 0, selectedProductLifecycle?.subscriptions[0]?.currency || formState.currency || 'USD')}
                      </div>
                    </div>
                  </div>
                  <div className="mt-3 grid gap-2 md:grid-cols-4">
                    {[
                      ['Dunning', selectedProductLifecycle?.summary.dunning ?? 0],
                      ['Paused', selectedProductLifecycle?.summary.paused ?? 0],
                      ['Trial ending', selectedProductLifecycle?.summary.trialEnding ?? 0],
                      ['Cancelled', selectedProductLifecycle?.summary.cancelled ?? 0],
                    ].map(([label, value]) => (
                      <div key={label} className="rounded-md border border-border bg-background px-3 py-2 text-xs">
                        <div className="text-muted-foreground">{label}</div>
                        <div className="mt-1 font-semibold text-foreground">{value}</div>
                      </div>
                    ))}
                  </div>
                  <div className="mt-3 rounded-md border border-border bg-background p-3" data-testid="products-subscription-execution-readiness">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <div className="text-xs font-semibold text-foreground">Action execution readiness</div>
                        <div className="mt-0.5 text-[11px] text-muted-foreground">
                          {selectedProductLifecycle?.execution
                            ? `${selectedProductLifecycle.execution.summary.executableSubscriptions} direct · ${selectedProductLifecycle.execution.summary.handoffSubscriptions} handoff`
                            : 'Select or save a product, then refresh lifecycle to inspect provider execution.'}
                        </div>
                      </div>
                      <div className="text-[11px] text-muted-foreground">
                        {selectedProductLifecycle?.execution?.schemaVersion || 'backy.product-subscription-execution-readiness.v1'}
                      </div>
                    </div>
                    {selectedProductLifecycle?.execution ? (
                      <div className="mt-3 grid gap-2 md:grid-cols-4">
                        {selectedProductLifecycle.execution.providers.map((provider) => (
                          <div key={`${provider.provider}-${provider.executionMode}`} className="rounded-md border border-border bg-card px-3 py-2 text-xs">
                            <div className="flex items-center justify-between gap-2">
                              <span className="font-medium capitalize text-foreground">{provider.provider}</span>
                              {provider.configured ? (
                                <CheckCircle2 className="size-3.5 text-emerald-600" aria-hidden="true" />
                              ) : (
                                <AlertTriangle className="size-3.5 text-amber-600" aria-hidden="true" />
                              )}
                            </div>
                            <div className="mt-1 text-muted-foreground">{provider.executionMode}</div>
                            <div className="mt-1 text-muted-foreground">{provider.executableSubscriptions} matching subscription{provider.executableSubscriptions === 1 ? '' : 's'}</div>
                            {provider.blocker ? (
                              <div className="mt-1 text-[11px] text-amber-700">{provider.blocker}</div>
                            ) : null}
                          </div>
                        ))}
                      </div>
                    ) : null}
                  </div>
                  <div className="mt-3 rounded-md border border-border bg-background p-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="text-xs font-semibold text-foreground">Recent subscription orders</div>
                      <div className="text-[11px] text-muted-foreground">{selectedProductLifecycle?.schemaVersion || 'backy.product-subscription-lifecycle.v1'}</div>
                    </div>
                    <div className="mt-2 space-y-2">
                      {selectedProductLifecycle?.subscriptions.length ? selectedProductLifecycle.subscriptions.slice(0, 3).map((subscription) => (
                        <div key={subscription.id} className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-border bg-card px-3 py-2 text-xs">
                          <div>
                            <div className="font-medium text-foreground">{subscription.orderNumber}</div>
                            <div className="mt-0.5 text-muted-foreground">
                              {subscription.customerEmail || subscription.customerName || 'Unknown customer'}
                              {subscription.subscriptionReference ? ` · ${subscription.subscriptionReference}` : ''}
                            </div>
                          </div>
                          <div className="text-right">
                            <div className="font-medium text-foreground">{subscription.lifecycleStatus.replace(/_/g, ' ')}</div>
                            <div className="mt-0.5 text-muted-foreground">{formatMoney(subscription.productRevenue, subscription.currency)} · {subscription.productUnits} unit{subscription.productUnits === 1 ? '' : 's'}</div>
                            <div className="mt-0.5 text-muted-foreground">{subscription.paymentProvider || 'manual'} · {subscription.actionExecutionMode}</div>
                            {subscription.lastAction ? (
                              <div className="mt-0.5 text-muted-foreground">
                                Last action {subscription.lastAction.action} {subscription.lastAction.status} via {subscription.lastAction.executionMode}
                              </div>
                            ) : null}
                            <div className="mt-2 flex flex-wrap justify-end gap-1.5">
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => void runSelectedProductSubscriptionAction(subscription.id, 'pause', subscription.subscriptionReference)}
                                disabled={!subscription.subscriptionReference || subscription.lifecycleStatus === 'paused' || subscription.lifecycleStatus === 'cancelled' || productLifecycleActionBusy !== null || !canEditProducts}
                                title={!canEditProducts ? editPermissionTitle : undefined}
                                iconStart={<Pause className="size-3.5" />}
                              >
                                Pause
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => void runSelectedProductSubscriptionAction(subscription.id, 'resume', subscription.subscriptionReference)}
                                disabled={!subscription.subscriptionReference || subscription.lifecycleStatus === 'active' || subscription.lifecycleStatus === 'renewal' || subscription.lifecycleStatus === 'cancelled' || productLifecycleActionBusy !== null || !canEditProducts}
                                title={!canEditProducts ? editPermissionTitle : undefined}
                                iconStart={<Play className="size-3.5" />}
                              >
                                Resume
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => void runSelectedProductSubscriptionAction(subscription.id, 'cancel', subscription.subscriptionReference)}
                                disabled={!subscription.subscriptionReference || subscription.lifecycleStatus === 'cancelled' || productLifecycleActionBusy !== null || !canEditProducts}
                                title={!canEditProducts ? editPermissionTitle : undefined}
                                iconStart={<Archive className="size-3.5" />}
                              >
                                Cancel
                              </Button>
                            </div>
                          </div>
                        </div>
                      )) : (
                        <EmptyState
                          icon={Package}
                          title="No subscription orders yet"
                          description="Subscription lifecycle rows appear after checkout or provider webhooks attach subscription orders to this product."
                        />
                      )}
                    </div>
                  </div>
                  <div className="mt-3 text-xs text-muted-foreground">
                    Actions call /api/admin/sites/:siteId/commerce/products/:productId/subscriptions/:orderId/action; webhooks update lifecycle state through {selectedProductLifecycle?.contract.webhookApi || '/api/sites/:siteId/commerce/webhook'}; reconciliation repairs stale private orders through {selectedProductLifecycle?.contract.reconciliationApi || '/api/admin/sites/:siteId/commerce/reconcile'}.
                  </div>
                </div>
                <div className="rounded-lg border border-border bg-muted/40 p-4" data-testid="products-provider-sync">
                  <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <div className="text-sm font-semibold text-foreground">Provider catalog sync</div>
                      <div className="mt-1 text-xs text-muted-foreground">Stripe, PayPal, Paddle, Square, Shopify, BigCommerce, WooCommerce, Etsy, Magento, or configured HTTP product and price metadata for provider checkout catalogs.</div>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      {[
                        ['auto', 'Auto'],
                        ['stripe', 'Stripe'],
                        ['paypal', 'PayPal'],
                        ['paddle', 'Paddle'],
                        ['square', 'Square'],
                        ['shopify', 'Shopify'],
                        ['bigcommerce', 'BigCommerce'],
                        ['woocommerce', 'WooCommerce'],
                        ['etsy', 'Etsy'],
                        ['magento', 'Magento'],
                        ['http', 'HTTP'],
                      ].map(([provider, label]) => (
                        <Button
                          key={provider}
                          size="sm"
                          variant={provider === 'auto' ? 'outline' : 'ghost'}
                          onClick={() => void syncSelectedProductProvider(provider)}
                          disabled={!selectedProduct || isProductsAccessBusy || !canEditProducts || isSyncingProviderProduct}
                          title={!selectedProduct ? 'Save the product before syncing.' : (!canEditProducts ? editPermissionTitle : `Sync ${label} catalog metadata`)}
                          iconStart={provider === 'auto' ? <RefreshCw className={cn('size-4', isSyncingProviderProduct && 'animate-spin')} /> : undefined}
                        >
                          {isSyncingProviderProduct && provider === 'auto' ? 'Syncing...' : label}
                        </Button>
                      ))}
                    </div>
                  </div>
                  <div className="grid gap-3 md:grid-cols-4">
                    <div>
                      <div className="text-[11px] uppercase text-muted-foreground">Status</div>
                      <div className="mt-1 text-sm font-medium text-foreground">{formatProviderSyncStatus(selectedProductProviderSync)}</div>
                    </div>
                    <div>
                      <div className="text-[11px] uppercase text-muted-foreground">Mode</div>
                      <div className="mt-1 text-sm font-medium text-foreground">{selectedProductProviderSync?.executionMode || 'Not run'}</div>
                    </div>
                    <div>
                      <div className="text-[11px] uppercase text-muted-foreground">Product</div>
                      <div className="mt-1 truncate text-sm font-medium text-foreground">{selectedProductProviderSync?.product?.id || 'Pending'}</div>
                    </div>
                    <div>
                      <div className="text-[11px] uppercase text-muted-foreground">Price</div>
                      <div className="mt-1 truncate text-sm font-medium text-foreground">{selectedProductProviderSync?.price?.id || 'Pending'}</div>
                    </div>
                  </div>
                  {selectedProductProviderSync?.syncedAt ? (
                    <div className="mt-3 text-xs text-muted-foreground">
                      Last run {formatDate(selectedProductProviderSync.syncedAt)}
                      {selectedProductProviderSync.reason ? ` ${selectedProductProviderSync.reason}` : ''}
                    </div>
                  ) : (
                    <div className="mt-3">
                      <EmptyState
                        icon={Package}
                        title="No provider catalog run recorded"
                        description="Save a product and run a provider sync to store checkout catalog metadata, handoff status, and provider product or price IDs."
                      />
                    </div>
                  )}
                </div>
                <div className="grid gap-3 md:grid-cols-3">
                  <Field label="Tax class">
                    <input
                      value={formState.taxClass}
                      onChange={(event) => setFormState((current) => ({ ...current, taxClass: event.target.value }))}
                      className="w-full rounded-lg border bg-background px-3 py-2.5 text-sm"
                      placeholder="standard, digital, exempt"
                    />
                  </Field>
                  <Field label="Shipping profile">
                    <input
                      value={formState.shippingProfile}
                      onChange={(event) => setFormState((current) => ({ ...current, shippingProfile: event.target.value }))}
                      disabled={!formState.shippingRequired}
                      className="w-full rounded-lg border bg-background px-3 py-2.5 text-sm disabled:opacity-60"
                      placeholder="standard-box, freight, digital"
                    />
                  </Field>
                  <Field label="Discount code">
                    <input
                      value={formState.discountCode}
                      onChange={(event) => setFormState((current) => ({ ...current, discountCode: event.target.value }))}
                      className="w-full rounded-lg border bg-background px-3 py-2.5 text-sm"
                      placeholder="WELCOME10"
                    />
                  </Field>
                </div>
                <Field label="Return policy">
                  <textarea
                    value={formState.returnPolicy}
                    onChange={(event) => setFormState((current) => ({ ...current, returnPolicy: event.target.value }))}
                    rows={3}
                    className="w-full resize-none rounded-lg border bg-background px-3 py-2.5 text-sm"
                    placeholder="30-day returns, final sale, license refund terms..."
                  />
                </Field>
                <Field label="Image URL">
                  <div className="space-y-3">
                    {formState.imageUrl ? (
                      <div className="overflow-hidden rounded-lg border border-border bg-muted">
                        <img src={formState.imageUrl} alt="Product preview" className="h-36 w-full object-cover" />
                      </div>
                    ) : null}
                    <div className="flex gap-2">
                      <input
                        aria-label="Image URL"
                        value={formState.imageUrl}
                        onChange={(event) => setFormState((current) => ({ ...current, imageUrl: event.target.value }))}
                        className="min-w-0 flex-1 rounded-lg border bg-background px-3 py-2.5 text-sm"
                        placeholder="https://..."
                      />
                      <Button onClick={() => openMediaPicker('image')} disabled={!canViewMedia} title={!canViewMedia ? mediaViewPermissionTitle : undefined} iconStart={<ImageIcon className="size-4" />}>
                        Media
                      </Button>
                    </div>
                  </div>
                </Field>
                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-3 text-xs font-medium text-muted-foreground">
                    <span>Gallery images</span>
                    <span className="font-mono">{galleryImageUrls.length}/{PRODUCT_GALLERY_IMAGE_LIMIT}</span>
                  </div>
                  {galleryImageUrls.length > 0 ? (
                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                      {galleryImageUrls.map((url) => (
                        <div key={url} className="group relative overflow-hidden rounded-lg border border-border bg-muted">
                          <img src={url} alt="Product gallery preview" className="h-24 w-full object-cover" />
                          <button
                            type="button"
                            onClick={() => removeGalleryImageUrl(url)}
                            className="absolute right-1.5 top-1.5 rounded-md border border-border bg-background/95 px-2 py-1 text-xs font-medium text-muted-foreground opacity-0 shadow-sm transition hover:text-foreground group-hover:opacity-100"
                            aria-label="Remove gallery image"
                          >
                            Remove
                          </button>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="rounded-lg border border-dashed border-border bg-muted/30 px-3 py-4 text-center text-sm text-muted-foreground">
                      Add secondary product images for storefront detail pages.
                    </div>
                  )}
                  <div className="flex flex-col gap-2 sm:flex-row">
                    <input
                      aria-label="Gallery image URL"
                      value={galleryImageDraft}
                      onChange={(event) => setGalleryImageDraft(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter') {
                          event.preventDefault();
                          addGalleryImageUrl(galleryImageDraft);
                        }
                      }}
                      className="min-w-0 flex-1 rounded-lg border bg-background px-3 py-2.5 text-sm"
                      placeholder="https://..."
                    />
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        onClick={() => addGalleryImageUrl(galleryImageDraft)}
                        disabled={!galleryImageDraft.trim() || galleryImageUrls.length >= PRODUCT_GALLERY_IMAGE_LIMIT}
                      >
                        Add URL
                      </Button>
                      <Button
                        onClick={() => openMediaPicker('gallery')}
                        disabled={galleryImageUrls.length >= PRODUCT_GALLERY_IMAGE_LIMIT || !canViewMedia}
                        title={!canViewMedia ? mediaViewPermissionTitle : undefined}
                        iconStart={<ImageIcon className="size-4" />}
                      >
                        Media
                      </Button>
                    </div>
                  </div>
                </div>
                <div className="grid gap-3 md:grid-cols-3">
                  <Field label="Category">
                    <input
                      value={formState.category}
                      onChange={(event) => setFormState((current) => ({ ...current, category: event.target.value }))}
                      className="w-full rounded-lg border bg-background px-3 py-2.5 text-sm"
                      placeholder="Templates"
                    />
                  </Field>
                  <div className="block space-y-2">
                    <div className="flex items-center justify-between gap-3 text-xs font-medium text-muted-foreground">
                      <span>Tags</span>
                      <span className="font-mono">{parseTags(formState.tags).length}/20</span>
                    </div>
                    <TagInput
                      tags={parseTags(formState.tags)}
                      onChange={(tags) => setFormState((current) => ({ ...current, tags: serializeTagValues(tags, 20) }))}
                      placeholder="Add premium, landing-page..."
                      ariaLabel="Product tags"
                      maxTags={20}
                    />
                  </div>
                  <Field label="Vendor">
                    <input
                      value={formState.vendor}
                      onChange={(event) => setFormState((current) => ({ ...current, vendor: event.target.value }))}
                      className="w-full rounded-lg border bg-background px-3 py-2.5 text-sm"
                      placeholder="Backy"
                    />
                  </Field>
                </div>
                <Field label="Description">
                  <textarea
                    value={formState.description}
                    onChange={(event) => setFormState((current) => ({ ...current, description: event.target.value }))}
                    rows={4}
                    className="w-full resize-none rounded-lg border bg-background px-3 py-2.5 text-sm"
                    placeholder="What customers receive, license terms, delivery notes..."
                  />
                </Field>
                <Field label="SEO title">
                  <input
                    value={formState.seoTitle}
                    onChange={(event) => setFormState((current) => ({ ...current, seoTitle: event.target.value }))}
                    className="w-full rounded-lg border bg-background px-3 py-2.5 text-sm"
                    placeholder={formState.title || 'Product title for search previews'}
                  />
                </Field>
                <div className="grid gap-3 md:grid-cols-2">
                  <Field label="Status">
                    <select
                      aria-label="Status"
                      value={formState.status}
                      onChange={(event) => setFormState((current) => ({ ...current, status: event.target.value as ContentStatus }))}
                      className="w-full rounded-lg border bg-background px-3 py-2.5 text-sm"
                    >
                      <option value="draft">Draft</option>
                      <option value="published">Published</option>
                      <option value="scheduled">Scheduled</option>
                      <option value="archived">Archived</option>
                    </select>
                  </Field>
                  {formState.status === 'scheduled' && (
                    <Field label="Publish at">
                      <input
                        type="datetime-local"
                        value={formState.scheduledAt}
                        min={minimumScheduledAt}
                        onChange={(event) => setFormState((current) => ({ ...current, scheduledAt: event.target.value }))}
                        aria-invalid={Boolean(scheduledProductDateError)}
                        required
                        className="w-full rounded-lg border bg-background px-3 py-2.5 text-sm"
                      />
                      {scheduledProductDateError ? (
                        <p className="mt-1 text-xs text-destructive">{scheduledProductDateError}</p>
                      ) : null}
                    </Field>
                  )}
                  <div className="space-y-2 pt-6">
                    <label className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={formState.featured}
                        onChange={(event) => setFormState((current) => ({ ...current, featured: event.target.checked }))}
                        className="size-4 rounded border-border text-primary"
                      />
                      Featured
                    </label>
                    <label className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={formState.taxable}
                        onChange={(event) => setFormState((current) => ({ ...current, taxable: event.target.checked }))}
                        className="size-4 rounded border-border text-primary"
                      />
                      Taxable
                    </label>
                    <label className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={formState.shippingRequired}
                        disabled={formState.productType !== 'physical'}
                        onChange={(event) => setFormState((current) => ({ ...current, shippingRequired: event.target.checked }))}
                        className="size-4 rounded border-border text-primary disabled:opacity-60"
                      />
                      Ships
                    </label>
                  </div>
                </div>
                <div className="flex justify-end gap-2 pt-2">
                  <Button variant="outline" onClick={resetForm} disabled={isProductsAccessBusy || !canEditProducts}>Clear</Button>
                  <Button type="submit" variant="primary" disabled={isProductsAccessBusy || !canEditProducts || !formState.title.trim() || !formState.sku.trim() || Boolean(scheduledProductDateError)} title={!canEditProducts ? editPermissionTitle : undefined} iconStart={<Package className="size-4" />}>
                    {isSaving ? 'Saving...' : selectedProduct ? 'Save Product' : 'Create Product'}
                  </Button>
                </div>
                </fieldset>
              </form>
            </PanelContent>
          </Panel>
        </div>
      )}

      {pendingDeleteProduct && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 px-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-lg border border-border bg-card p-5 shadow-xl">
            <div className="flex items-start gap-3">
              <span className="rounded-lg bg-red-50 p-2 text-red-600">
                <Trash2 className="h-5 w-5" />
              </span>
              <div>
                <h2 className="text-lg font-semibold text-foreground">Delete {String(pendingDeleteProduct.values.title || pendingDeleteProduct.slug)}?</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  This removes the product record from Backy and from storefront API responses. Archive it instead if you only want it hidden.
                </p>
              </div>
            </div>
            <div className="mt-4 rounded-lg bg-muted px-3 py-2 text-xs text-muted-foreground">
              SKU: <span className="font-medium text-foreground">{String(pendingDeleteProduct.values.sku || pendingDeleteProduct.slug)}</span>
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setPendingDeleteProduct(null)}
                disabled={isProductsAccessBusy}
                className="rounded-lg border border-border px-4 py-2 text-sm font-medium transition-colors hover:bg-accent disabled:cursor-not-allowed disabled:opacity-60"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void removeProduct(pendingDeleteProduct)}
                disabled={isProductsAccessBusy || !canDeleteProducts}
                title={!canDeleteProducts ? deletePermissionTitle : undefined}
                className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isSaving ? 'Deleting...' : 'Delete product'}
              </button>
            </div>
          </div>
        </div>
      )}

      <MediaLibraryModal
        isOpen={isMediaLibraryOpen}
        onClose={() => {
          if (!isProductsAccessBusy) {
            setIsMediaLibraryOpen(false);
          }
        }}
        onSelect={(asset) => {
          if (isProductsBusy) return;
          if (!canEditProducts || !canViewMedia) return;

          const deliveryUrl = asset.url || getPublicMediaFileUrl(asset.id, activeSiteId);
          if (mediaPickerTarget === 'download') {
            setFormState((current) => ({ ...current, downloadUrl: deliveryUrl }));
            setNotice(`Attached ${asset.name} to the digital delivery field.`);
            return;
          }

          if (mediaPickerTarget === 'gallery') {
            if (addGalleryImageUrl(deliveryUrl)) {
              setNotice(`Added ${asset.name} to the product gallery.`);
            }
            return;
          }

          setFormState((current) => ({ ...current, imageUrl: deliveryUrl }));
          setNotice(`Attached ${asset.name} to the product image field.`);
        }}
        canView={canViewMedia}
        canCreate={canCreateMedia}
        viewDisabledReason={mediaViewPermissionTitle}
        createDisabledReason={mediaCreatePermissionTitle}
        allowedTypes={mediaPickerTarget === 'download' ? 'any' : 'image'}
        initialUploadFilter={mediaPickerTarget === 'download' ? 'file' : 'image'}
        mediaContext={{
          siteId: activeSiteId,
          scope: 'global',
          targetLabel: mediaPickerTarget === 'download'
            ? `${activeSite?.name || activeSiteId} digital delivery`
            : mediaPickerTarget === 'gallery'
              ? `${activeSite?.name || activeSiteId} product gallery`
            : `${activeSite?.name || activeSiteId} product catalog`,
        }}
        allowScopeSwitcher={false}
      />
    </PageShell>
  );
}

function Metric({ label, value, icon }: { label: string; value: number | string; icon: ReactNode }) {
  return (
    <div className="rounded-lg border border-border bg-card px-4 py-3">
      <div className="flex items-center justify-between gap-3">
        <span className="text-xs font-medium text-muted-foreground">{label}</span>
        <span className="text-muted-foreground">{icon}</span>
      </div>
      <div className="mt-1 font-mono text-2xl font-semibold">{value}</div>
    </div>
  );
}

function ProductReadinessCheck({ label, detail, ready }: { label: string; detail: string; ready: boolean }) {
  return (
    <div className="rounded-lg border border-border bg-card p-3">
      <div className="flex items-start gap-2">
        {ready ? (
          <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald-600" />
        ) : (
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-600" />
        )}
        <div>
          <div className="text-sm font-semibold text-foreground">{label}</div>
          <div className="mt-1 text-xs leading-5 text-muted-foreground">{detail}</div>
        </div>
      </div>
    </div>
  );
}

function ProductWorkflowStep({ index, label, detail }: { index: number; label: string; detail: string }) {
  return (
    <div className="flex gap-3 rounded-lg border border-border bg-card p-3">
      <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
        {index}
      </span>
      <div>
        <div className="text-sm font-semibold text-foreground">{label}</div>
        <div className="mt-1 text-xs leading-5 text-muted-foreground">{detail}</div>
      </div>
    </div>
  );
}

function Field({ label, children, className }: { label: string; children: ReactNode; className?: string }) {
  return (
    <label className={cn('block space-y-2', className)}>
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}

function ProductApiSnippet({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border bg-muted/50 p-3">
      <div className="mb-1 text-xs font-medium text-muted-foreground">{label}</div>
      <code className="block min-w-0 overflow-x-auto whitespace-nowrap font-mono text-xs text-foreground">
        {value}
      </code>
    </div>
  );
}

function ProductCard({
  product,
  selected,
  disabled,
  onEdit,
  onPublish,
  onArchive,
  onDelete,
  canDelete,
  deleteDisabledReason,
}: {
  product: CollectionRecord;
  selected: boolean;
  disabled: boolean;
  canDelete: boolean;
  deleteDisabledReason?: string;
  onEdit: () => void;
  onPublish: () => void;
  onArchive: () => void;
  onDelete: () => void;
}) {
  const title = String(readProductValue(product.values, 'title', product.slug) || product.slug);
  const price = toNumber(readProductValue(product.values, 'price'));
  const compareAtPrice = toNumber(readProductValue(product.values, 'compareAtPrice'));
  const currency = normalizeCurrency(String(readProductValue(product.values, 'currency', 'USD') || 'USD'));
  const inventory = toNumber(readProductValue(product.values, 'inventory'));
  const imageUrl = String(readProductValue(product.values, 'imageUrl', '') || '');
  const galleryImages = formatGalleryImages(readProductValue(product.values, 'galleryImages'));
  const variants = formatProductVariants(readProductValue(product.values, 'variants'));
  const stockState = getProductStockState(product.values);
  const productType = stockState.productType;
  const inventoryPolicy = stockState.inventoryPolicy;
  const category = String(readProductValue(product.values, 'category', '') || '');
  const vendor = String(readProductValue(product.values, 'vendor', '') || '');
  const tags = formatTags(readProductValue(product.values, 'tags')).slice(0, 3);
  const shippingRequired = readProductValue(product.values, 'shippingRequired') !== false;
  const isLowStock = stockState.lowStock;

  return (
    <article className={cn('rounded-lg border bg-background p-4 transition-colors', selected ? 'border-primary ring-2 ring-primary/10' : 'border-border')}>
      <div className="flex items-start gap-3">
        <div className="flex size-14 shrink-0 items-center justify-center overflow-hidden rounded-md border border-border bg-muted">
          {imageUrl ? (
            <img src={imageUrl} alt={title} className="size-full object-cover" loading="lazy" />
          ) : (
            <Package className="size-5 text-muted-foreground" />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h3 className="truncate font-semibold">{title}</h3>
              <div className="mt-1 truncate font-mono text-xs text-muted-foreground">{String(readProductValue(product.values, 'sku', product.slug) || product.slug)}</div>
            </div>
            <StatusBadge status={product.status} />
          </div>
          <div className="mt-2 flex flex-wrap gap-1.5">
            <span className="rounded-md border border-border bg-muted px-2 py-1 text-[11px] font-medium capitalize text-muted-foreground">
              {productType}
            </span>
            {shippingRequired && productType === 'physical' ? (
              <span className="rounded-md border border-border bg-muted px-2 py-1 text-[11px] font-medium text-muted-foreground">
                Ships
              </span>
            ) : null}
            {isLowStock ? (
              <span className="rounded-md border border-amber-200 bg-amber-50 px-2 py-1 text-[11px] font-medium text-amber-800">
                Low stock
              </span>
            ) : null}
            {readProductValue(product.values, 'featured') ? (
              <span className="rounded-md border border-emerald-200 bg-emerald-50 px-2 py-1 text-[11px] font-medium text-emerald-800">
                Featured
              </span>
            ) : null}
            {product.status === 'scheduled' && product.scheduledAt ? (
              <span className="rounded-md border border-sky-200 bg-sky-50 px-2 py-1 text-[11px] font-medium text-sky-800">
                Publishes {formatDate(product.scheduledAt)}
              </span>
            ) : null}
            {galleryImages.length > 0 ? (
              <span className="rounded-md border border-border bg-muted px-2 py-1 text-[11px] font-medium text-muted-foreground">
                {galleryImages.length} gallery
              </span>
            ) : null}
            {variants.length > 0 ? (
              <span className="rounded-md border border-border bg-muted px-2 py-1 text-[11px] font-medium text-muted-foreground">
                {variants.length} variants
              </span>
            ) : null}
            {category ? (
              <span className="rounded-md border border-border bg-muted px-2 py-1 text-[11px] font-medium text-muted-foreground">
                {category}
              </span>
            ) : null}
            {inventoryPolicy !== 'deny' ? (
              <span className="rounded-md border border-blue-200 bg-blue-50 px-2 py-1 text-[11px] font-medium text-blue-800">
                {inventoryPolicy === 'preorder' ? 'Preorder' : 'Continue selling'}
              </span>
            ) : null}
          </div>
          {(vendor || tags.length > 0) ? (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {vendor ? (
                <span className="rounded bg-background px-2 py-0.5 text-[11px] text-muted-foreground">
                  Vendor: {vendor}
                </span>
              ) : null}
              {tags.map((tag) => (
                <span key={tag} className="rounded bg-background px-2 py-0.5 text-[11px] text-muted-foreground">
                  {tag}
                </span>
              ))}
            </div>
          ) : null}
          {readProductValue(product.values, 'description') ? (
            <p className="mt-2 line-clamp-2 text-sm text-muted-foreground">
              {String(readProductValue(product.values, 'description'))}
            </p>
          ) : null}
        </div>
      </div>
      <div className="mt-4 grid grid-cols-3 gap-2 text-sm">
        <div className="rounded bg-muted px-3 py-2">
          <div className="text-xs text-muted-foreground">Price</div>
          <div className="font-semibold">{formatMoney(price, currency)}</div>
          {compareAtPrice > price ? (
            <div className="text-xs text-muted-foreground line-through">{formatMoney(compareAtPrice, currency)}</div>
          ) : null}
        </div>
        <div className="rounded bg-muted px-3 py-2">
          <div className="text-xs text-muted-foreground">Stock</div>
          <div className="font-semibold">{productType === 'physical' ? inventory : 'Available'}</div>
          {productType !== 'physical' ? (
            <div className="text-xs text-muted-foreground">No physical stock limit</div>
          ) : null}
        </div>
        <div className="rounded bg-muted px-3 py-2">
          <div className="text-xs text-muted-foreground">Updated</div>
          <div className="truncate text-xs font-medium">{product.updatedAt ? formatDate(product.updatedAt) : 'Now'}</div>
        </div>
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <Button size="sm" onClick={onEdit} disabled={disabled} iconStart={<Edit3 className="size-4" />}>Edit</Button>
        <Button size="sm" variant="outline" onClick={onPublish} disabled={disabled || product.status === 'published'} iconStart={<CheckCircle2 className="size-4" />}>Publish</Button>
        <Button size="sm" variant="outline" onClick={onArchive} disabled={disabled || product.status === 'archived'} iconStart={<Archive className="size-4" />}>Archive</Button>
        <Button size="sm" variant="danger" onClick={onDelete} disabled={disabled || !canDelete} title={!canDelete ? deleteDisabledReason : undefined} iconStart={<Trash2 className="size-4" />}>Delete</Button>
      </div>
    </article>
  );
}

const getEnvValue = (key: string): string => {
  const env = (import.meta as unknown as { env?: Record<string, string | undefined> }).env ?? {};
  return env[key]?.trim() ?? '';
};

const isLocalAdminDevHost = (): boolean => {
  if (typeof window === 'undefined') {
    return false;
  }

  return ['localhost', '127.0.0.1', '::1'].includes(window.location.hostname)
    && window.location.port !== '3001';
};

const getPublicBaseUrl = (): string => {
  const envBase = (
    getEnvValue('VITE_BACKY_PUBLIC_API_BASE_URL') ||
    getEnvValue('VITE_PUBLIC_API_URL') ||
    getEnvValue('VITE_API_BASE_URL') ||
    ''
  ).trim();

  if (!envBase && isLocalAdminDevHost()) {
    return 'http://localhost:3001';
  }

  return (envBase || (typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3001'))
    .replace(/\/api\/admin$/, '')
    .replace(/\/api$/, '')
    .replace(/\/$/, '');
};

const toNumber = (value: unknown): number => {
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : 0;
};

const maybeFiniteNumber = (value: unknown): number | null => {
  if (value === null || value === undefined || value === '') return null;
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : null;
};

const safeParseJsonArray = (value: unknown): unknown[] => {
  if (Array.isArray(value)) {
    return value;
  }

  if (typeof value !== 'string') {
    return [];
  }

  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

const normalizeCurrency = (value: string): string => {
  const normalized = value.trim().toUpperCase();
  return /^[A-Z]{3}$/.test(normalized) ? normalized : 'USD';
};

const formatMoney = (amount: number, currency: string): string => {
  try {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: normalizeCurrency(currency),
    }).format(amount);
  } catch {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(amount);
  }
};

const moneyValue = (value: number): number => (
  Math.round((Number.isFinite(value) ? value : 0) * 100) / 100
);

const lineItemText = (value: unknown): string => (
  typeof value === 'string' ? value.trim() : ''
);

const normalizeOrderLineItem = (value: unknown, index: number, fallbackCurrency: string): CommerceLineItem | null => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }

  const record = value as Record<string, unknown>;
  const title = lineItemText(record.title || record.name);
  if (!title) {
    return null;
  }

  const quantity = Math.max(1, Math.floor(toNumber(record.quantity || 1)));
  const price = moneyValue(toNumber(record.price ?? record.unitPrice ?? record.amount));
  const lineTotal = moneyValue(toNumber(record.lineTotal ?? record.total ?? price * quantity));
  const productId = lineItemText(record.productId);
  const slug = lineItemText(record.slug);
  const sku = lineItemText(record.sku);

  return {
    id: lineItemText(record.id) || lineItemText(record.lineItemId) || `${productId || slug || sku || 'item'}-${index}`,
    productId,
    slug,
    title,
    sku,
    quantity,
    lineTotal,
    currency: normalizeCurrency(lineItemText(record.currency) || fallbackCurrency),
  };
};

const parseOrderLineItems = (value: unknown, fallbackCurrency = 'USD'): CommerceLineItem[] => (
  safeParseJsonArray(value)
    .map((item, index) => normalizeOrderLineItem(item, index, fallbackCurrency))
    .filter((item): item is CommerceLineItem => Boolean(item))
);

const slugify = (value: string): string => (
  value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
);

const parseProductOptionGroups = (value: string): Array<{ name: string; values: string[] }> => (
  value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line, index) => {
      const [rawName, ...rawValues] = line.split(':');
      const hasNamedGroup = rawValues.length > 0;
      const name = (hasNamedGroup ? rawName : `Option ${index + 1}`).trim();
      const valuesText = (hasNamedGroup ? rawValues.join(':') : rawName).trim();
      const values = Array.from(new Set(valuesText
        .split(/[,|]/)
        .map((item) => item.trim())
        .filter(Boolean)));

      return {
        name: name || `Option ${index + 1}`,
        values,
      };
    })
    .filter((group) => group.values.length > 0)
    .slice(0, 4)
);

const combineProductOptionValues = (groups: Array<{ name: string; values: string[] }>): Array<Array<{ name: string; value: string }>> => (
  groups.reduce<Array<Array<{ name: string; value: string }>>>(
    (combinations, group) => combinations.flatMap((combination) => (
      group.values.map((value) => [...combination, { name: group.name, value }])
    )),
    [[]],
  )
);

const buildProductVariantMatrix = ({
  optionInput,
  skuPrefix,
  price,
  inventory,
}: {
  optionInput: string;
  skuPrefix: string;
  price: string;
  inventory: string;
}): ProductVariant[] => {
  const groups = parseProductOptionGroups(optionInput);
  if (groups.length === 0) {
    return [];
  }

  const normalizedSkuPrefix = (slugify(skuPrefix || 'variant') || 'variant').toUpperCase();
  const priceValue = price.trim() ? Number(price) : null;
  const inventoryValue = inventory.trim() ? Number(inventory) : null;

  return combineProductOptionValues(groups)
    .slice(0, PRODUCT_VARIANT_LIMIT)
    .map((combination, index) => {
      const option = combination.map((item) => `${item.name}: ${item.value}`).join(' / ');
      const optionSlug = combination.map((item) => slugify(item.value)).filter(Boolean).join('-');
      return {
        id: `variant-matrix-${Date.now()}-${index}`,
        title: combination.map((item) => item.value).join(' / '),
        sku: `${normalizedSkuPrefix}-${(optionSlug || `OPTION-${index + 1}`).toUpperCase()}`,
        option,
        price: Number.isFinite(priceValue) ? priceValue : null,
        inventory: Number.isFinite(inventoryValue) ? inventoryValue : null,
      };
    });
};

const dedupeProductVariants = (variants: ProductVariant[]): ProductVariant[] => {
  const seen = new Set<string>();
  const deduped: ProductVariant[] = [];

  for (const variant of formatProductVariants(variants)) {
    const key = [
      variant.sku.trim().toLowerCase(),
      variant.title.trim().toLowerCase(),
      variant.option.trim().toLowerCase(),
    ].join('|');
    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    deduped.push(variant);
  }

  return deduped;
};

const toDateTimeLocalValue = (value?: string | null): string => {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const localDate = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return localDate.toISOString().slice(0, 16);
};

const toIsoDateTime = (value: string): string | null => {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
};

const getScheduledProductDateError = (status: ContentStatus, scheduledAt: string): string | null => {
  if (status !== 'scheduled') return null;

  const isoDate = toIsoDateTime(scheduledAt);
  if (!isoDate) {
    return 'Choose a publish date before scheduling this product.';
  }

  const scheduledAtMs = Date.parse(isoDate);
  if (!Number.isFinite(scheduledAtMs) || scheduledAtMs <= Date.now()) {
    return 'Choose a future publish date before scheduling this product.';
  }

  return null;
};

const productToForm = (product: CollectionRecord): ProductFormState => ({
  title: String(readProductValue(product.values, 'title', '') || ''),
  slug: product.slug,
  sku: String(readProductValue(product.values, 'sku', '') || ''),
  variants: serializeProductVariants(formatProductVariants(readProductValue(product.values, 'variants'))),
  price: String(readProductValue(product.values, 'price') ?? ''),
  compareAtPrice: readProductValue(product.values, 'compareAtPrice') === null || readProductValue(product.values, 'compareAtPrice') === undefined ? '' : String(readProductValue(product.values, 'compareAtPrice')),
  currency: String(readProductValue(product.values, 'currency', 'USD') || 'USD'),
  inventory: String(readProductValue(product.values, 'inventory') ?? '0'),
  lowStockThreshold: String(readProductValue(product.values, 'lowStockThreshold') ?? '5'),
  inventoryPolicy: asInventoryPolicy(readProductValue(product.values, 'inventoryPolicy')),
  productType: asProductType(readProductValue(product.values, 'productType')),
  downloadUrl: String(readProductValue(product.values, 'downloadUrl', '') || ''),
  checkoutUrl: String(readProductValue(product.values, 'checkoutUrl', '') || ''),
  subscriptionEnabled: Boolean(readProductValue(product.values, 'subscriptionEnabled')),
  subscriptionInterval: asSubscriptionInterval(readProductValue(product.values, 'subscriptionInterval')),
  subscriptionTrialDays: String(readProductValue(product.values, 'subscriptionTrialDays') ?? '0'),
  shippingRequired: readProductValue(product.values, 'shippingRequired') !== false,
  shippingProfile: String(readProductValue(product.values, 'shippingProfile', '') || ''),
  weight: readProductValue(product.values, 'weight') === null || readProductValue(product.values, 'weight') === undefined ? '' : String(readProductValue(product.values, 'weight')),
  taxClass: String(readProductValue(product.values, 'taxClass', '') || ''),
  discountCode: String(readProductValue(product.values, 'discountCode', '') || ''),
  returnPolicy: String(readProductValue(product.values, 'returnPolicy', '') || ''),
  imageUrl: String(readProductValue(product.values, 'imageUrl', '') || ''),
  galleryImages: serializeGalleryImages(formatGalleryImages(readProductValue(product.values, 'galleryImages'))),
  category: String(readProductValue(product.values, 'category', '') || ''),
  tags: formatTags(readProductValue(product.values, 'tags')).join(', '),
  vendor: String(readProductValue(product.values, 'vendor', '') || ''),
  description: String(readProductValue(product.values, 'description', '') || ''),
  seoTitle: String(readProductValue(product.values, 'seoTitle', '') || ''),
  status: product.status,
  scheduledAt: toDateTimeLocalValue(product.scheduledAt),
  featured: Boolean(readProductValue(product.values, 'featured')),
  taxable: readProductValue(product.values, 'taxable') !== false,
});

const isPlainRecord = (value: unknown): value is Record<string, unknown> => (
  Boolean(value) && typeof value === 'object' && !Array.isArray(value)
);

const productProviderSync = (product: CollectionRecord | null): CommerceProductProviderSyncResult | null => {
  const value = product ? readProductValue(product.values, 'providerSync') : null;
  return isPlainRecord(value) ? value as unknown as CommerceProductProviderSyncResult : null;
};

const formatProviderSyncStatus = (sync: CommerceProductProviderSyncResult | null): string => {
  if (!sync) return 'Not synced';
  if (sync.status === 'synced') return 'Synced';
  if (sync.status === 'failed') return 'Failed';
  return 'Ready for handoff';
};

const optionalStringFromRecord = (record: Record<string, unknown> | undefined, key: string): string | undefined => {
  const value = record?.[key];
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
};

const optionalNumberFromRecord = (record: Record<string, unknown> | undefined, key: string): number | undefined => {
  const value = record?.[key];
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim()) {
    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric : undefined;
  }
  return undefined;
};

const optionalBooleanFromRecord = (record: Record<string, unknown> | undefined, key: string): boolean | undefined => {
  const value = record?.[key];
  return typeof value === 'boolean' ? value : undefined;
};

const optionalStringListFromRecord = (record: Record<string, unknown> | undefined, key: string): string[] | undefined => {
  const value = record?.[key];
  if (Array.isArray(value)) {
    const entries = value.map((entry) => (typeof entry === 'string' ? entry.trim() : '')).filter(Boolean);
    return entries.length > 0 ? entries : undefined;
  }
  if (typeof value === 'string' && value.trim()) {
    const entries = value.split(/\r?\n|,/g).map((entry) => entry.trim()).filter(Boolean);
    return entries.length > 0 ? entries : undefined;
  }
  return undefined;
};

const frontendTemplateContent = (template: SiteFrontendDesignTemplate): Record<string, unknown> => {
  if (!isPlainRecord(template.content)) return {};
  const product = template.content.product;
  const values = template.content.values;
  return {
    ...template.content,
    ...(isPlainRecord(product) ? product : {}),
    ...(isPlainRecord(values) ? values : {}),
  };
};

const buildFrontendProductTemplateBlueprint = (template: SiteFrontendDesignTemplate): FrontendProductTemplateBlueprint => {
  const content = frontendTemplateContent(template);
  const title = optionalStringFromRecord(content, 'title') || `${template.name} product`;
  const slug = slugify(optionalStringFromRecord(content, 'slug') || template.id || title) || 'frontend-product';
  const sku = optionalStringFromRecord(content, 'sku') || slug.toUpperCase().replace(/[^A-Z0-9]+/g, '-').slice(0, 40) || 'FRONTEND-PRODUCT';
  const productType = asProductType(optionalStringFromRecord(content, 'productType'));
  const galleryImages = optionalStringListFromRecord(content, 'galleryImages') || [];
  const tags = optionalStringListFromRecord(content, 'tags') || [];
  const variants = Array.isArray(content.variants)
    ? formatProductVariants(content.variants)
    : [];

  return {
    title,
    slug,
    sku,
    values: {
      [productFieldKey('title')]: title,
      [productFieldKey('sku')]: sku,
      [productFieldKey('variants')]: variants,
      [productFieldKey('price')]: optionalNumberFromRecord(content, 'price') ?? 0,
      [productFieldKey('compareAtPrice')]: optionalNumberFromRecord(content, 'compareAtPrice') ?? null,
      [productFieldKey('currency')]: normalizeCurrency(optionalStringFromRecord(content, 'currency') || 'USD'),
      [productFieldKey('inventory')]: optionalNumberFromRecord(content, 'inventory') ?? (productType === 'physical' ? 0 : 1),
      [productFieldKey('lowStockThreshold')]: optionalNumberFromRecord(content, 'lowStockThreshold') ?? 5,
      [productFieldKey('inventoryPolicy')]: asInventoryPolicy(optionalStringFromRecord(content, 'inventoryPolicy')),
      [productFieldKey('productType')]: productType,
      [productFieldKey('downloadUrl')]: optionalStringFromRecord(content, 'downloadUrl') || '',
      [productFieldKey('checkoutUrl')]: optionalStringFromRecord(content, 'checkoutUrl') || '',
      [productFieldKey('subscriptionEnabled')]: optionalBooleanFromRecord(content, 'subscriptionEnabled') ?? false,
      [productFieldKey('subscriptionInterval')]: asSubscriptionInterval(optionalStringFromRecord(content, 'subscriptionInterval')),
      [productFieldKey('subscriptionTrialDays')]: optionalNumberFromRecord(content, 'subscriptionTrialDays') ?? 0,
      [productFieldKey('shippingRequired')]: optionalBooleanFromRecord(content, 'shippingRequired') ?? productType === 'physical',
      [productFieldKey('shippingProfile')]: optionalStringFromRecord(content, 'shippingProfile') || '',
      [productFieldKey('weight')]: optionalNumberFromRecord(content, 'weight') ?? null,
      [productFieldKey('taxClass')]: optionalStringFromRecord(content, 'taxClass') || '',
      [productFieldKey('discountCode')]: optionalStringFromRecord(content, 'discountCode') || '',
      [productFieldKey('returnPolicy')]: optionalStringFromRecord(content, 'returnPolicy') || '',
      [productFieldKey('imageUrl')]: optionalStringFromRecord(content, 'imageUrl') || galleryImages[0] || '',
      [productFieldKey('galleryImages')]: galleryImages,
      [productFieldKey('category')]: optionalStringFromRecord(content, 'category') || '',
      [productFieldKey('tags')]: tags,
      [productFieldKey('vendor')]: optionalStringFromRecord(content, 'vendor') || '',
      [productFieldKey('description')]: template.description || optionalStringFromRecord(content, 'description') || 'Product seeded from the connected frontend design contract.',
      [productFieldKey('seoTitle')]: optionalStringFromRecord(content, 'seoTitle') || title,
      [productFieldKey('featured')]: optionalBooleanFromRecord(content, 'featured') ?? false,
      [productFieldKey('taxable')]: optionalBooleanFromRecord(content, 'taxable') ?? true,
    },
  };
};

const buildFrontendProductTemplateValues = (
  template: SiteFrontendDesignTemplate,
  frontendDesign: SiteFrontendDesignContract | null,
): Record<string, unknown> => ({
  frontendDesignTemplateId: template.id,
  frontendDesignTemplateName: template.name,
  frontendDesignSource: frontendDesign?.source,
  frontendDesignBindingHints: template.bindingHints || [],
  ...(template.routePattern ? { frontendDesignRoutePattern: template.routePattern } : {}),
  ...(frontendDesign?.tokens ? { frontendDesignTokens: frontendDesign.tokens } : {}),
  ...(frontendDesign?.chrome ? { frontendDesignChrome: frontendDesign.chrome } : {}),
  ...(frontendDesign?.tokens?.customCss ? { frontendDesignCustomCss: frontendDesign.tokens.customCss } : {}),
});

const FRONTEND_PRODUCT_VALUE_KEYS = [
  'frontendDesignTemplateId',
  'frontendDesignTemplateName',
  'frontendDesignSource',
  'frontendDesignBindingHints',
  'frontendDesignRoutePattern',
  'frontendDesignTokens',
  'frontendDesignChrome',
  'frontendDesignCustomCss',
] as const;

const PRODUCT_PROVIDER_METADATA_KEYS = [
  productFieldKey('providerSync'),
] as const;

const getPersistedFrontendProductValues = (product: CollectionRecord | null): Record<string, unknown> => {
  if (!product) return {};

  return Object.fromEntries(
    FRONTEND_PRODUCT_VALUE_KEYS
      .filter((key) => product.values[key] !== undefined)
      .map((key) => [key, product.values[key]]),
  );
};

const getPersistedProductProviderValues = (product: CollectionRecord | null): Record<string, unknown> => {
  if (!product) return {};

  return Object.fromEntries(
    PRODUCT_PROVIDER_METADATA_KEYS
      .filter((key) => product.values[key] !== undefined)
      .map((key) => [key, product.values[key]]),
  );
};

const getProductFrontendTemplateId = (product: CollectionRecord): string | undefined => (
  typeof product.values.frontendDesignTemplateId === 'string'
    ? product.values.frontendDesignTemplateId
    : undefined
);

const asProductType = (value: unknown): ProductFormState['productType'] => (
  value === 'digital' || value === 'service' || value === 'physical' ? value : 'physical'
);

const asInventoryPolicy = (value: unknown): ProductFormState['inventoryPolicy'] => (
  value === 'continue' || value === 'preorder' || value === 'deny' ? value : 'deny'
);

const asSubscriptionInterval = (value: unknown): ProductFormState['subscriptionInterval'] => (
  value === 'weekly' || value === 'quarterly' || value === 'yearly' ? value : 'monthly'
);

const getProductStockState = (values: CollectionRecord['values']) => {
  const productType = asProductType(readProductValue(values, 'productType'));
  const inventory = toNumber(readProductValue(values, 'inventory'));
  const lowStockThreshold = Math.max(0, toNumber(readProductValue(values, 'lowStockThreshold', 5) || 5));
  const inventoryPolicy = asInventoryPolicy(readProductValue(values, 'inventoryPolicy'));
  const isPhysical = productType === 'physical';
  const inStock = !isPhysical || inventory > 0 || inventoryPolicy !== 'deny';

  return {
    productType,
    inventory,
    lowStockThreshold,
    inventoryPolicy,
    inStock,
    lowStock: isPhysical && inventory > 0 && inventory <= lowStockThreshold,
    outOfStock: !inStock,
  };
};

const parseTags = (value: string): string[] => (
  parseTagInput(value, 20)
);

const formatTags = (value: unknown): string[] => {
  if (Array.isArray(value)) {
    return parseTagInput(value.join(','), 20);
  }
  if (typeof value === 'string') {
    return parseTags(value);
  }
  return [];
};

const parseGalleryImages = (value: string): string[] => (
  value
    .split(/\r?\n|,/g)
    .map((url) => url.trim())
    .filter(Boolean)
    .filter((url, index, urls) => urls.indexOf(url) === index)
    .slice(0, PRODUCT_GALLERY_IMAGE_LIMIT)
);

const serializeGalleryImages = (urls: string[]): string => (
  parseGalleryImages(urls.join('\n')).join('\n')
);

const formatGalleryImages = (value: unknown): string[] => {
  if (Array.isArray(value)) {
    return parseGalleryImages(value.map((url) => String(url)).join('\n'));
  }
  if (typeof value === 'string') {
    return parseGalleryImages(value);
  }
  return [];
};

const normalizeProductVariant = (value: unknown, index: number): ProductVariant | null => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }

  const record = value as Record<string, unknown>;
  const title = String(record.title || record.name || record.option || '').trim();
  const option = String(record.option || '').trim();
  const sku = String(record.sku || '').trim();
  const price = maybeFiniteNumber(record.price);
  const inventory = maybeFiniteNumber(record.inventory);

  if (!title && !option && !sku) {
    return null;
  }

  return {
    id: String(record.id || `variant-${index + 1}`),
    title: title || option || sku,
    sku,
    option,
    price,
    inventory,
  };
};

const formatProductVariants = (value: unknown): ProductVariant[] => {
  const source = typeof value === 'string'
    ? safeParseJsonArray(value)
    : Array.isArray(value)
      ? value
      : [];

  return source
    .map(normalizeProductVariant)
    .filter((variant): variant is ProductVariant => Boolean(variant))
    .slice(0, PRODUCT_VARIANT_LIMIT);
};

const parseProductVariants = (value: string): ProductVariant[] => formatProductVariants(value);

const serializeProductVariants = (variants: ProductVariant[]): string => (
  JSON.stringify(formatProductVariants(variants))
);

const getMissingProductFieldKeys = (collection: Collection): string[] => {
  const existingKeys = new Set(collection.fields.map((field) => normalizeProductSchemaKey(field.key)));
  return PRODUCT_FIELDS
    .filter((field) => !existingKeys.has(normalizeProductSchemaKey(field.key)))
    .map((field) => field.key);
};

const mergeProductFields = (currentFields: CollectionField[]): CollectionField[] => {
  const fieldsByKey = new Map(currentFields.map((field) => [normalizeProductSchemaKey(field.key), field]));
  const merged = PRODUCT_FIELDS.map((requiredField) => sanitizeProductSchemaField({
    ...fieldsByKey.get(normalizeProductSchemaKey(requiredField.key)),
    ...requiredField,
    key: requiredField.key,
    sortOrder: requiredField.sortOrder,
  }));
  const requiredKeys = new Set(PRODUCT_FIELDS.map((field) => normalizeProductSchemaKey(field.key)));
  const customFields = currentFields.filter((field) => !requiredKeys.has(normalizeProductSchemaKey(field.key)));
  return [...merged, ...customFields].sort((a, b) => a.sortOrder - b.sortOrder);
};

const sanitizeProductSchemaField = (field: CollectionField): CollectionField => {
  if (field.type === 'select' || field.type === 'tags') return field;
  const { options: _options, ...fieldWithoutOptions } = field;
  return fieldWithoutOptions;
};

type ProductExportColumn = typeof PRODUCT_EXPORT_COLUMNS[number];

interface ProductExportContext {
  activeSiteId: string;
  publicBaseUrl: string;
  storefrontApiUrl: string;
}

const productToExportRecord = (
  product: CollectionRecord,
  context: ProductExportContext,
): Record<ProductExportColumn, string | number | boolean | null> => {
  const storefrontPath = `/products/${product.slug}`;
  const detailApiUrl = `${context.publicBaseUrl}/api/sites/${encodeURIComponent(context.activeSiteId)}/collections/${PRODUCT_COLLECTION_SLUG}/records?slug=${encodeURIComponent(product.slug)}`;
  const sync = productProviderSync(product);

  return {
  product_id: product.id,
  active_site_id: context.activeSiteId,
  slug: product.slug,
  status: product.status,
  title: String(readProductValue(product.values, 'title', product.slug) || product.slug),
  sku: String(readProductValue(product.values, 'sku', '') || ''),
  variants: formatProductVariants(readProductValue(product.values, 'variants')).map((variant) => `${variant.title}${variant.sku ? ` (${variant.sku})` : ''}`).join('; '),
  variant_count: formatProductVariants(readProductValue(product.values, 'variants')).length,
  price: toNumber(readProductValue(product.values, 'price')),
  compare_at_price: readProductValue(product.values, 'compareAtPrice') === null || readProductValue(product.values, 'compareAtPrice') === undefined
    ? null
    : toNumber(readProductValue(product.values, 'compareAtPrice')),
  currency: normalizeCurrency(String(readProductValue(product.values, 'currency', 'USD') || 'USD')),
  inventory: toNumber(readProductValue(product.values, 'inventory')),
  low_stock_threshold: toNumber(readProductValue(product.values, 'lowStockThreshold', 5) || 5),
  inventory_policy: asInventoryPolicy(readProductValue(product.values, 'inventoryPolicy')),
  product_type: asProductType(readProductValue(product.values, 'productType')),
  category: String(readProductValue(product.values, 'category', '') || ''),
  tags: formatTags(readProductValue(product.values, 'tags')).join('; '),
  vendor: String(readProductValue(product.values, 'vendor', '') || ''),
  image_url: String(readProductValue(product.values, 'imageUrl', '') || ''),
  gallery_images: formatGalleryImages(readProductValue(product.values, 'galleryImages')).join('; '),
  gallery_image_count: formatGalleryImages(readProductValue(product.values, 'galleryImages')).length,
  download_url: String(readProductValue(product.values, 'downloadUrl', '') || ''),
  checkout_url: String(readProductValue(product.values, 'checkoutUrl', '') || ''),
  subscription_enabled: Boolean(readProductValue(product.values, 'subscriptionEnabled')),
  subscription_interval: asSubscriptionInterval(readProductValue(product.values, 'subscriptionInterval')),
  subscription_trial_days: Math.max(0, toNumber(readProductValue(product.values, 'subscriptionTrialDays'))),
  shipping_required: readProductValue(product.values, 'shippingRequired') !== false,
  shipping_profile: String(readProductValue(product.values, 'shippingProfile', '') || ''),
  tax_class: String(readProductValue(product.values, 'taxClass', '') || ''),
  discount_code: String(readProductValue(product.values, 'discountCode', '') || ''),
  return_policy: String(readProductValue(product.values, 'returnPolicy', '') || ''),
  taxable: readProductValue(product.values, 'taxable') !== false,
  weight: readProductValue(product.values, 'weight') === null || readProductValue(product.values, 'weight') === undefined ? null : toNumber(readProductValue(product.values, 'weight')),
  featured: Boolean(readProductValue(product.values, 'featured')),
  seo_title: String(readProductValue(product.values, 'seoTitle', '') || ''),
  storefront_path: storefrontPath,
  list_api_url: context.storefrontApiUrl,
  detail_api_url: detailApiUrl,
  public_render_url: `${context.publicBaseUrl}/api/sites/${encodeURIComponent(context.activeSiteId)}/render?path=${encodeURIComponent(storefrontPath)}`,
  public_resolve_url: `${context.publicBaseUrl}/api/sites/${encodeURIComponent(context.activeSiteId)}/resolve?path=${encodeURIComponent(storefrontPath)}`,
  checkout_mode: String(readProductValue(product.values, 'checkoutUrl', '') || '').trim() ? 'external checkout URL' : 'not configured',
  provider_sync_status: sync?.status || '',
  provider_sync_execution_mode: sync?.executionMode || '',
  provider_sync_product_id: sync?.product?.id || '',
  provider_sync_price_id: sync?.price?.id || '',
  provider_sync_at: sync?.syncedAt || '',
  scheduled_at: product.scheduledAt || '',
  frontend_systems: PRODUCT_FRONTEND_SYSTEMS.map((system) => `${system.key}:${system.title}`).join('; '),
  created_at: product.createdAt || '',
  updated_at: product.updatedAt || '',
  };
};

const csvEscape = (value: unknown): string => {
  const raw = String(value ?? '').replace(/\r?\n/g, '\\n');
  return `"${raw.replace(/"/g, '""')}"`;
};
