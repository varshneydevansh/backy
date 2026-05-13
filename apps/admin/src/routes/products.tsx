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
  Plus,
  RefreshCw,
  Search,
  ShoppingBag,
  Sparkles,
  Trash2,
  Upload,
} from 'lucide-react';
import {
  createCollection,
  createCollectionRecord,
  deleteCollectionRecord,
  getSiteFrontendDesign,
  importCollectionRecordsCsv,
  listCollectionRecords,
  listCollections,
  updateCollection,
  updateCollectionRecord,
  type Collection,
  type CollectionField,
  type CollectionRecord,
} from '@/lib/adminContentApi';
import { useStore, type ContentStatus } from '@/stores/mockStore';
import { PageShell } from '@/components/layout/PageShell';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { Panel, PanelContent, PanelHeader } from '@/components/ui/Panel';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { parseTagInput, serializeTagValues, TagInput } from '@/components/ui/TagInput';
import { MediaLibraryModal } from '@/components/editor/MediaLibraryModal';
import { getPublicMediaFileUrl } from '@/lib/mediaApi';
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
    title: 'Catalog health',
    detail: 'Inventory, published/draft counts, low stock, and digital products.',
    href: '#products-metrics',
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

type ProductStatusFilter = ContentStatus | 'all';
type ProductTypeFilter = ProductFormState['productType'] | 'all';
type ProductStockFilter = 'all' | 'in-stock' | 'low-stock' | 'out-of-stock' | 'featured' | 'checkout-missing';
type SiteFrontendDesignContract = NonNullable<SiteSettings['frontendDesign']>;
type SiteFrontendDesignTemplate = SiteFrontendDesignContract['templates'][number];

interface ProductsSearch {
  siteId?: string;
  status?: ProductStatusFilter;
  type?: ProductTypeFilter;
  stock?: ProductStockFilter;
  category?: string;
  q?: string;
  productId?: string;
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
const PRODUCT_STATUS_FILTERS: ProductStatusFilter[] = ['all', 'published', 'draft', 'scheduled', 'archived'];
const PRODUCT_TYPE_FILTERS: ProductTypeFilter[] = ['all', 'physical', 'digital', 'service'];
const PRODUCT_STOCK_FILTERS: ProductStockFilter[] = ['all', 'in-stock', 'low-stock', 'out-of-stock', 'featured', 'checkout-missing'];

const isProductStatusFilter = (value: unknown): value is ProductStatusFilter => (
  typeof value === 'string' && PRODUCT_STATUS_FILTERS.includes(value as ProductStatusFilter)
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

interface FrontendProductTemplateBlueprint {
  title: string;
  slug: string;
  sku: string;
  values: Record<string, unknown>;
}

const PRODUCT_FIELDS: CollectionField[] = [
  { key: 'title', label: 'Title', type: 'text', required: true, unique: false, sortOrder: 10 },
  { key: 'sku', label: 'SKU', type: 'text', required: true, unique: true, sortOrder: 20 },
  { key: 'price', label: 'Price', type: 'number', required: true, unique: false, sortOrder: 30 },
  { key: 'compareAtPrice', label: 'Compare at price', type: 'number', required: false, unique: false, sortOrder: 40 },
  { key: 'currency', label: 'Currency', type: 'text', required: true, unique: false, sortOrder: 50, defaultValue: 'USD' },
  { key: 'variants', label: 'Variants', type: 'json', required: false, unique: false, sortOrder: 60, defaultValue: [] },
  { key: 'inventory', label: 'Inventory', type: 'number', required: false, unique: false, sortOrder: 70, defaultValue: 0 },
  { key: 'lowStockThreshold', label: 'Low Stock Threshold', type: 'number', required: false, unique: false, sortOrder: 80, defaultValue: 5 },
  { key: 'inventoryPolicy', label: 'Inventory Policy', type: 'select', required: false, unique: false, sortOrder: 90, options: ['deny', 'continue', 'preorder'], defaultValue: 'deny' },
  { key: 'productType', label: 'Product Type', type: 'select', required: true, unique: false, sortOrder: 100, options: ['physical', 'digital', 'service'], defaultValue: 'physical' },
  { key: 'downloadUrl', label: 'Digital Delivery URL', type: 'url', required: false, unique: false, sortOrder: 110 },
  { key: 'checkoutUrl', label: 'Checkout URL', type: 'url', required: false, unique: false, sortOrder: 120 },
  { key: 'shippingRequired', label: 'Requires Shipping', type: 'boolean', required: false, unique: false, sortOrder: 130, defaultValue: true },
  { key: 'shippingProfile', label: 'Shipping Profile', type: 'text', required: false, unique: false, sortOrder: 140 },
  { key: 'weight', label: 'Weight', type: 'number', required: false, unique: false, sortOrder: 150 },
  { key: 'taxClass', label: 'Tax Class', type: 'text', required: false, unique: false, sortOrder: 160 },
  { key: 'discountCode', label: 'Discount Code', type: 'text', required: false, unique: false, sortOrder: 170 },
  { key: 'returnPolicy', label: 'Return Policy', type: 'richText', required: false, unique: false, sortOrder: 180 },
  { key: 'imageUrl', label: 'Image URL', type: 'url', required: false, unique: false, sortOrder: 190 },
  { key: 'galleryImages', label: 'Gallery Images', type: 'json', required: false, unique: false, sortOrder: 200, defaultValue: [] },
  { key: 'category', label: 'Category', type: 'text', required: false, unique: false, sortOrder: 210 },
  { key: 'tags', label: 'Tags', type: 'tags', required: false, unique: false, sortOrder: 220 },
  { key: 'vendor', label: 'Vendor', type: 'text', required: false, unique: false, sortOrder: 230 },
  { key: 'description', label: 'Description', type: 'richText', required: false, unique: false, sortOrder: 240 },
  { key: 'seoTitle', label: 'SEO Title', type: 'text', required: false, unique: false, sortOrder: 250 },
  { key: 'featured', label: 'Featured', type: 'boolean', required: false, unique: false, sortOrder: 260, defaultValue: false },
  { key: 'taxable', label: 'Taxable', type: 'boolean', required: false, unique: false, sortOrder: 270, defaultValue: true },
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
  'scheduled_at',
  'frontend_systems',
  'created_at',
  'updated_at',
] as const;

const PRODUCT_IMPORT_COLUMNS = [
  'slug',
  'status',
  'scheduledAt',
  'title',
  'sku',
  'price',
  'compareAtPrice',
  'currency',
  'variants',
  'inventory',
  'lowStockThreshold',
  'inventoryPolicy',
  'productType',
  'downloadUrl',
  'checkoutUrl',
  'shippingRequired',
  'shippingProfile',
  'weight',
  'taxClass',
  'discountCode',
  'returnPolicy',
  'imageUrl',
  'galleryImages',
  'category',
  'tags',
  'vendor',
  'description',
  'seoTitle',
  'featured',
  'taxable',
] as const;

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
  const [selectedSiteId, setSelectedSiteId] = useState(() => routeSearch.siteId || getSiteSelectionFromSearch(sites));
  const [productCollection, setProductCollection] = useState<Collection | null>(null);
  const [ordersCollection, setOrdersCollection] = useState<Collection | null>(null);
  const [products, setProducts] = useState<CollectionRecord[]>([]);
  const [selectedProductId, setSelectedProductId] = useState<string | null>(routeSearch.productId || null);
  const [formState, setFormState] = useState<ProductFormState>(EMPTY_PRODUCT_FORM);
  const [statusFilter, setStatusFilter] = useState<ProductStatusFilter>(routeSearch.status || 'all');
  const [productTypeFilter, setProductTypeFilter] = useState<ProductTypeFilter>(routeSearch.type || 'all');
  const [stockFilter, setStockFilter] = useState<ProductStockFilter>(routeSearch.stock || 'all');
  const [categoryFilter, setCategoryFilter] = useState(routeSearch.category || 'all');
  const [searchQuery, setSearchQuery] = useState(routeSearch.q || '');
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isImportingProducts, setIsImportingProducts] = useState(false);
  const [isCreatingTemplateId, setIsCreatingTemplateId] = useState<string | null>(null);
  const isProductsBusy = isLoading || isSaving || isImportingProducts || Boolean(isCreatingTemplateId);
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
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [frontendDesign, setFrontendDesign] = useState<SiteFrontendDesignContract | null>(null);
  const [frontendDesignLoading, setFrontendDesignLoading] = useState(false);
  const [frontendDesignError, setFrontendDesignError] = useState<string | null>(null);
  const [pendingDeleteProduct, setPendingDeleteProduct] = useState<CollectionRecord | null>(null);

  const activeSite = useMemo(
    () => sites.find((site) => siteMatchesIdentifier(site, selectedSiteId)) || sites[0],
    [selectedSiteId, sites],
  );
  const activeSiteId = activeSite?.publicSiteId || activeSite?.id || selectedSiteId || 'site-demo';
  const activeSiteSearch = useMemo(() => ({ siteId: activeSiteId }), [activeSiteId]);
  const publicBaseUrl = useMemo(() => getPublicBaseUrl(), []);
  const commerceCatalogUrl = `${publicBaseUrl}/api/sites/${encodeURIComponent(activeSiteId)}/commerce/catalog?limit=24&sortBy=title`;
  const commerceProductDetailUrl = `${publicBaseUrl}/api/sites/${encodeURIComponent(activeSiteId)}/commerce/catalog?slug={productSlug}`;
  const commerceOrderContractUrl = `${publicBaseUrl}/api/sites/${encodeURIComponent(activeSiteId)}/commerce/orders`;
  const commerceOrderCreateUrl = `${publicBaseUrl}/api/sites/${encodeURIComponent(activeSiteId)}/commerce/orders`;
  const storefrontApiUrl = `${publicBaseUrl}/api/sites/${encodeURIComponent(activeSiteId)}/collections/${PRODUCT_COLLECTION_SLUG}/records?limit=24&sortBy=title`;
  const storefrontProductDetailUrl = `${publicBaseUrl}/api/sites/${encodeURIComponent(activeSiteId)}/collections/${PRODUCT_COLLECTION_SLUG}/records?slug={productSlug}`;
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
    !ordersCollection.permissions.publicRead &&
    !ordersCollection.permissions.publicCreate,
  );
  const selectedProduct = useMemo(
    () => products.find((product) => product.id === selectedProductId) || null,
    [products, selectedProductId],
  );
  const frontendProductTemplates = useMemo(
    () => (frontendDesign?.templates || []).filter((template) => template.type === 'product'),
    [frontendDesign?.templates],
  );
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
    [...new Set(products.map((product) => String(product.values.category || '').trim()).filter(Boolean))]
      .sort((a, b) => a.localeCompare(b))
  ), [products]);
  const hasActiveCatalogFilters = Boolean(
    searchQuery.trim() ||
    statusFilter !== 'all' ||
    productTypeFilter !== 'all' ||
    stockFilter !== 'all' ||
    categoryFilter !== 'all',
  );
  const filteredProducts = useMemo(() => {
    const normalizedSearch = searchQuery.trim().toLowerCase();
    return products.filter((product) => {
      const matchesStatus = statusFilter === 'all' || product.status === statusFilter;
      if (!matchesStatus) return false;

      const values = product.values;
      const productType = asProductType(values.productType);
      const inventory = toNumber(values.inventory);
      const lowStockThreshold = Math.max(0, toNumber(values.lowStockThreshold || 5));
      const isLowStock = inventory > 0 && inventory <= lowStockThreshold;
      const category = String(values.category || '').trim();
      const checkoutUrl = String(values.checkoutUrl || '').trim();

      if (productTypeFilter !== 'all' && productType !== productTypeFilter) {
        return false;
      }

      if (categoryFilter !== 'all' && category !== categoryFilter) {
        return false;
      }

      if (stockFilter === 'in-stock' && inventory <= 0) {
        return false;
      }
      if (stockFilter === 'low-stock' && !isLowStock) {
        return false;
      }
      if (stockFilter === 'out-of-stock' && inventory > 0) {
        return false;
      }
      if (stockFilter === 'featured' && !values.featured) {
        return false;
      }
      if (stockFilter === 'checkout-missing' && checkoutUrl) {
        return false;
      }

      const matchesSearch = !normalizedSearch || [
        product.slug,
        values.title,
        values.sku,
        values.category,
        values.vendor,
        formatTags(values.tags).join(' '),
        values.description,
      ].some((value) => String(value || '').toLowerCase().includes(normalizedSearch));

      return matchesSearch;
    });
  }, [categoryFilter, productTypeFilter, products, searchQuery, statusFilter, stockFilter]);
  const metrics = useMemo(() => ({
    total: products.length,
    published: products.filter((product) => product.status === 'published').length,
    draft: products.filter((product) => product.status === 'draft').length,
    scheduled: products.filter((product) => product.status === 'scheduled').length,
    inventory: products.reduce((sum, product) => sum + toNumber(product.values.inventory), 0),
    lowStock: products.filter((product) => {
      const inventory = toNumber(product.values.inventory);
      const threshold = Math.max(0, toNumber(product.values.lowStockThreshold || 5));
      return inventory > 0 && inventory <= threshold;
    }).length,
    digital: products.filter((product) => product.values.productType === 'digital').length,
    categories: new Set(products.map((product) => String(product.values.category || '').trim()).filter(Boolean)).size,
  }), [products]);
  const catalogReadiness = useMemo(() => {
    const hasSchema = Boolean(productCollection);
    const hasProducts = products.length > 0;
    const hasPublished = metrics.published > 0;
    const hasVariants = products.some((product) => formatProductVariants(product.values.variants).length > 0);
    const hasInventory = metrics.inventory > 0 || metrics.digital > 0 || hasVariants;
    const hasImages = products.some((product) => Boolean(product.values.imageUrl) || formatGalleryImages(product.values.galleryImages).length > 0);
    const hasPricing = products.some((product) => toNumber(product.values.price) > 0);
    const hasMerchandising = products.some((product) => Boolean(product.values.category) || formatTags(product.values.tags).length > 0 || Boolean(product.values.vendor));
    const hasCheckoutUrls = products.some((product) => Boolean(String(product.values.checkoutUrl || '').trim()));
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
      list: storefrontApiUrl,
      bySlug: storefrontProductDetailUrl,
    },
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
    storefrontContract: {
      collectionSlug: PRODUCT_COLLECTION_SLUG,
      routePatterns: {
        list: productCollection?.listRoutePattern || '/products',
        detail: productCollection?.routePattern || '/products/:recordSlug',
      },
      cardFields: ['title', 'slug', 'price', 'compareAtPrice', 'currency', 'imageUrl', 'galleryImages', 'variants', 'category', 'vendor', 'featured'],
      detailFields: PRODUCT_FIELDS.map((field) => field.key),
      filterFacets: ['status', 'category', 'tags', 'vendor', 'productType', 'featured', 'inventoryPolicy'],
      checkout: {
        mode: orderIntakeReady ? 'Backy order intake or per-product checkoutUrl' : 'per-product checkoutUrl',
        configuredProducts: products.filter((product) => Boolean(String(product.values.checkoutUrl || '').trim())).length,
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
      canvasBlocks: ['product-card', 'product-grid', 'product-detail', 'variant-selector', 'cart-button', 'checkout-button', 'related-products'],
      requiredFields: ['title', 'slug', 'sku', 'price', 'currency', 'inventory', 'productType', 'checkoutUrl'],
      optionalFields: ['compareAtPrice', 'variants', 'galleryImages', 'downloadUrl', 'shippingProfile', 'taxClass', 'discountCode', 'returnPolicy', 'category', 'tags', 'vendor', 'seoTitle', 'featured', 'taxable'],
    },
    frontendSystems: PRODUCT_FRONTEND_SYSTEMS,
    readiness: {
      ready: productApiReady,
      score: catalogReadiness.score,
      checks: catalogReadiness.checks,
    },
    metrics,
    filters: {
      search: searchQuery,
      status: statusFilter,
      productType: productTypeFilter,
      category: categoryFilter,
      stock: stockFilter,
      visible: filteredProducts.length,
      total: products.length,
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
      title: String(product.values.title || product.slug),
      sku: String(product.values.sku || ''),
      variants: formatProductVariants(product.values.variants),
      price: toNumber(product.values.price),
      compareAtPrice: product.values.compareAtPrice === null || product.values.compareAtPrice === undefined
        ? null
        : toNumber(product.values.compareAtPrice),
      currency: normalizeCurrency(String(product.values.currency || 'USD')),
      inventory: toNumber(product.values.inventory),
      productType: asProductType(product.values.productType),
      imageUrl: String(product.values.imageUrl || ''),
      galleryImages: formatGalleryImages(product.values.galleryImages),
      category: String(product.values.category || ''),
      tags: formatTags(product.values.tags),
      vendor: String(product.values.vendor || ''),
      description: String(product.values.description || ''),
      seoTitle: String(product.values.seoTitle || ''),
      featured: Boolean(product.values.featured),
      taxable: product.values.taxable !== false,
      shippingRequired: product.values.shippingRequired !== false,
      lowStockThreshold: toNumber(product.values.lowStockThreshold || 5),
      inventoryPolicy: asInventoryPolicy(product.values.inventoryPolicy),
      weight: product.values.weight === null || product.values.weight === undefined ? null : toNumber(product.values.weight),
      downloadUrl: String(product.values.downloadUrl || ''),
      checkoutUrl: String(product.values.checkoutUrl || ''),
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
    commerceProductDetailUrl,
    commerceOrderContractUrl,
    commerceOrderCreateUrl,
    filteredProducts.length,
    frontendDesign,
    frontendProductTemplates,
    metrics,
    missingProductFields,
    orderIntakeReady,
    ordersCollection,
    productApiReady,
    productTypeFilter,
    productCollection,
    products,
    searchQuery,
    storefrontApiUrl,
    storefrontProductDetailUrl,
    statusFilter,
    stockFilter,
  ]);
  const productHandoffText = useMemo(() => JSON.stringify(productHandoff, null, 2), [productHandoff]);
  const productsRouteSearch = useMemo<ProductsSearch>(() => ({
    siteId: activeSiteId,
    ...(statusFilter !== 'all' ? { status: statusFilter } : {}),
    ...(productTypeFilter !== 'all' ? { type: productTypeFilter } : {}),
    ...(stockFilter !== 'all' ? { stock: stockFilter } : {}),
    ...(categoryFilter !== 'all' ? { category: categoryFilter } : {}),
    ...(searchQuery.trim() ? { q: searchQuery.trim() } : {}),
    ...(selectedProductId ? { productId: selectedProductId } : {}),
  }), [activeSiteId, categoryFilter, productTypeFilter, searchQuery, selectedProductId, statusFilter, stockFilter]);

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
    };

    navigate({ to: '/products', search: normalized, replace: true });
  };

  const loadProducts = async () => {
    if (isProductsBusy) return;

    setIsLoading(true);
    setError(null);

    try {
      const collections = await listCollections(activeSiteId);
      const collection = collections.find((item) => item.slug === PRODUCT_COLLECTION_SLUG) || null;
      setOrdersCollection(collections.find((item) => item.slug === ORDERS_COLLECTION_SLUG) || null);
      setProductCollection(collection);

      if (!collection) {
        setProducts([]);
        clearProductEditorState();
        return;
      }

      const result = await listCollectionRecords(activeSiteId, collection.id, {
        limit: 100,
        sortBy: 'updatedAt',
        sortDirection: 'desc',
      });
      setProducts(result.records);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Unable to load products');
    } finally {
      setIsLoading(false);
    }
  };

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
  }, [activeSiteId]);

  useEffect(() => {
    let cancelled = false;

    const loadFrontendDesign = async () => {
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
  }, [activeSiteId]);

  useEffect(() => {
    if (!selectedProduct) return;
    setFormState(productToForm(selectedProduct));
  }, [selectedProduct]);

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
  };

  const resetForm = () => {
    if (isProductsBusy) return;

    clearProductEditorState();
    updateProductsRouteSearch({ productId: undefined });
  };

  const selectProductForEditing = (productId: string) => {
    if (isProductsBusy) return;

    setSelectedProductId(productId);
    updateProductsRouteSearch({ productId });
  };

  const openMediaPicker = (target: 'image' | 'gallery' | 'download') => {
    if (isProductsBusy) return;

    setMediaPickerTarget(target);
    setIsMediaLibraryOpen(true);
  };

  const setGalleryImages = (urls: string[]) => {
    setFormState((current) => ({ ...current, galleryImages: serializeGalleryImages(urls) }));
  };

  const addGalleryImageUrl = (url: string) => {
    if (isProductsBusy) return;

    const normalizedUrl = url.trim();
    if (!normalizedUrl) return;

    setGalleryImages([...galleryImageUrls, normalizedUrl]);
    setGalleryImageDraft('');
  };

  const removeGalleryImageUrl = (url: string) => {
    if (isProductsBusy) return;

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

    const title = variantDraft.title.trim();
    const sku = variantDraft.sku.trim();
    const option = variantDraft.option.trim();

    if ((!title && !option) || productVariants.length >= 50) return;

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

    setProductVariants(productVariants.filter((variant) => variant.id !== variantId));
  };

  const createProductsCollection = async () => {
    if (isProductsBusy) return;

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

    const creatingId = `frontend:${template.id}`;
    setIsCreatingTemplateId(creatingId);
    setError(null);
    setNotice(null);

    try {
      const values = {
        ...blueprint.values,
        ...buildFrontendProductTemplateValues(template, frontendDesign),
      };
      const saved = await createCollectionRecord(activeSiteId, productCollection.id, {
        slug: `${blueprint.slug}-${Date.now().toString(36)}`,
        status: 'draft',
        values,
      });

      setProducts((current) => [saved, ...current.filter((product) => product.id !== saved.id)]);
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

    if (!formState.title.trim() || !formState.sku.trim()) {
      setError('Add a product title and SKU before saving.');
      setNotice(null);
      return;
    }

    const scheduledAt = formState.status === 'scheduled'
      ? toIsoDateTime(formState.scheduledAt)
      : null;
    if (formState.status === 'scheduled' && !scheduledAt) {
      setError('Choose a publish date before scheduling this product.');
      setNotice(null);
      return;
    }

    setIsSaving(true);
    setError(null);
    setNotice(null);

    const slug = slugify(formState.slug || formState.title || formState.sku);
    const input = {
      slug,
      status: formState.status,
      scheduledAt,
      values: {
        title: formState.title.trim(),
        sku: formState.sku.trim(),
        variants: productVariants,
        price: Number(formState.price || 0),
        compareAtPrice: formState.compareAtPrice ? Number(formState.compareAtPrice) : null,
        currency: normalizeCurrency(formState.currency),
        inventory: Number(formState.inventory || 0),
        lowStockThreshold: Number(formState.lowStockThreshold || 5),
        inventoryPolicy: formState.inventoryPolicy,
        productType: formState.productType,
        downloadUrl: formState.downloadUrl.trim(),
        checkoutUrl: formState.checkoutUrl.trim(),
        shippingRequired: formState.shippingRequired,
        shippingProfile: formState.shippingProfile.trim(),
        weight: formState.weight ? Number(formState.weight) : null,
        taxClass: formState.taxClass.trim(),
        discountCode: formState.discountCode.trim(),
        returnPolicy: formState.returnPolicy.trim(),
        imageUrl: formState.imageUrl.trim(),
        galleryImages: galleryImageUrls,
        category: formState.category.trim(),
        tags: parseTags(formState.tags),
        vendor: formState.vendor.trim(),
        description: formState.description.trim(),
        seoTitle: formState.seoTitle.trim(),
        featured: formState.featured,
        taxable: formState.taxable,
        ...getPersistedFrontendProductValues(selectedProduct),
      },
    };

    try {
      const saved = selectedProduct
        ? await updateCollectionRecord(activeSiteId, productCollection.id, selectedProduct.id, input)
        : await createCollectionRecord(activeSiteId, productCollection.id, input);

      setProducts((current) => [saved, ...current.filter((product) => product.id !== saved.id)]);
      setSelectedProductId(saved.id);
      updateProductsRouteSearch({ productId: saved.id });
      setNotice(selectedProduct ? 'Product updated.' : 'Product created.');
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Unable to save product');
    } finally {
      setIsSaving(false);
    }
  };

  const changeProductStatus = async (product: CollectionRecord, status: ContentStatus) => {
    if (!productCollection) return;
    if (isProductsBusy) return;

    setIsSaving(true);
    setError(null);
    setNotice(null);

    try {
      const updated = await updateCollectionRecord(activeSiteId, productCollection.id, product.id, {
        status,
        scheduledAt: status === 'scheduled' ? product.scheduledAt || new Date().toISOString() : null,
        values: product.values,
      });
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

    setIsSaving(true);
    setError(null);
    setNotice(null);

    try {
      await deleteCollectionRecord(activeSiteId, productCollection.id, product.id);
      setProducts((current) => current.filter((item) => item.id !== product.id));
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

  const copyStorefrontApiUrl = async () => {
    if (isProductsBusy) return;

    try {
      await navigator.clipboard.writeText(storefrontApiUrl);
      setNotice('Storefront products API URL copied.');
    } catch {
      setNotice(storefrontApiUrl);
    }
  };
  const copyProductHandoff = async () => {
    if (isProductsBusy) return;

    try {
      await navigator.clipboard.writeText(productHandoffText);
      setNotice('Product handoff manifest copied.');
    } catch {
      setNotice(productHandoffText);
    }
  };

  const copyText = async (value: string, label: string) => {
    if (isProductsBusy) return;

    try {
      await navigator.clipboard.writeText(value);
      setNotice(`${label} copied.`);
    } catch {
      setNotice(value);
    }
  };

  const downloadProductHandoff = () => {
    if (isProductsBusy) return;

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
  const exportProductsCsv = () => {
    if (filteredProducts.length === 0 || isProductsBusy) return;

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

    const file = event.target.files?.[0];
    if (!file) return;

    setIsImportingProducts(true);
    setError(null);
    setNotice(null);

    try {
      const csv = await file.text();
      const result = await importCollectionRecordsCsv(activeSiteId, productCollection.id, csv, { upsert: true });
      const refreshed = await listCollectionRecords(activeSiteId, productCollection.id, {
        limit: 100,
        sortBy: 'updatedAt',
        sortDirection: 'desc',
      });
      setProducts(refreshed.records);
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

    navigate({ to: '/pages/new', search: { siteId: activeSiteId, template: 'storefront' } });
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
          <Button onClick={() => void loadProducts()} disabled={isProductsBusy} iconStart={<RefreshCw className={cn('size-4', isLoading && 'animate-spin')} />}>
            Refresh
          </Button>
        </div>
      }
      className="w-full"
    >
      {error && (
        <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          {error}
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
            <Button variant="outline" onClick={() => void copyProductHandoff()} disabled={isProductsBusy} iconStart={<Copy className="size-4" />}>
              Copy manifest
            </Button>
            <Button variant="outline" onClick={downloadProductHandoff} disabled={isProductsBusy} iconStart={<Download className="size-4" />}>
              Download JSON
            </Button>
            <Button variant="outline" onClick={exportProductsCsv} disabled={filteredProducts.length === 0 || isProductsBusy} iconStart={<Download className="size-4" />}>
              Export CSV
            </Button>
            <Button variant="outline" onClick={downloadProductImportTemplate} disabled={!productCollection || isProductsBusy} iconStart={<FileText className="size-4" />}>
              CSV template
            </Button>
            <Button variant="outline" onClick={() => productImportInputRef.current?.click()} disabled={!productCollection || isProductsBusy} iconStart={<Upload className="size-4" />}>
              {isImportingProducts ? 'Importing...' : 'Import CSV'}
            </Button>
            <Button variant="outline" onClick={openStorefrontPage} disabled={isProductsBusy} iconStart={<Sparkles className="size-4" />}>
              Storefront page
            </Button>
            {!productCollection ? (
              <Button onClick={() => void createProductsCollection()} disabled={isProductsBusy} iconStart={<Sparkles className="size-4" />}>
                {isSaving ? 'Setting up...' : 'Set up products'}
              </Button>
            ) : (
              <Button onClick={resetForm} disabled={isProductsBusy} iconStart={<Plus className="size-4" />}>
                New product
              </Button>
            )}
            <Button onClick={() => void loadProducts()} disabled={isProductsBusy} iconStart={<RefreshCw className={cn('size-4', isLoading && 'animate-spin')} />}>
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
                    <div key={template.id} className="rounded-lg border border-teal-200 bg-background p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <h4 className="text-sm font-semibold text-foreground">{template.name}</h4>
                          <p className="mt-1 text-xs leading-5 text-muted-foreground">{template.description || String(blueprint.values.description || 'Product seeded from the frontend design contract.')}</p>
                        </div>
                        <span className="rounded-full bg-teal-50 px-2 py-1 text-[11px] font-medium text-teal-700">
                          {String(blueprint.values.productType || 'physical')}
                        </span>
                      </div>
                      <div className="mt-3 flex flex-wrap gap-1.5">
                        <span className="rounded bg-muted px-2 py-1 text-[11px] text-muted-foreground">{formatMoney(toNumber(blueprint.values.price), String(blueprint.values.currency || 'USD'))}</span>
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
                          disabled={!productCollection || isProductsBusy}
                          iconStart={<Package className="size-4" />}
                          data-testid={`products-frontend-template-${template.id}`}
                        >
                          {isCreatingTemplateId === `frontend:${template.id}` ? 'Creating...' : 'Create product'}
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => void copyText(manifestText, `${template.name} frontend product template`)}
                          disabled={isProductsBusy}
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
                    disabled={isProductsBusy}
                    iconStart={<Sparkles className="size-4" />}
                  >
                    Sync Schema
                  </Button>
                )}
                <Button onClick={() => void copyProductHandoff()} disabled={isProductsBusy} iconStart={<Copy className="size-4" />}>
                  Copy manifest
                </Button>
                <Button onClick={exportProductsCsv} disabled={filteredProducts.length === 0 || isProductsBusy} iconStart={<Download className="size-4" />}>
                  Export CSV
                </Button>
                <Button variant="outline" onClick={downloadProductImportTemplate} disabled={isProductsBusy} iconStart={<FileText className="size-4" />}>
                  CSV template
                </Button>
                <Button variant="outline" onClick={() => productImportInputRef.current?.click()} disabled={isProductsBusy} iconStart={<Upload className="size-4" />}>
                  {isImportingProducts ? 'Importing...' : 'Import CSV'}
                </Button>
                <Button onClick={() => void copyStorefrontApiUrl()} disabled={isProductsBusy} iconStart={<Copy className="size-4" />}>
                  Copy URL
                </Button>
                <Button variant="outline" onClick={openStorefrontPage} disabled={isProductsBusy} iconStart={<Sparkles className="size-4" />}>
                  Storefront page
                </Button>
                <a
                  href={storefrontApiUrl}
                  target="_blank"
                  rel="noreferrer"
                  aria-disabled={isProductsBusy}
                  className={cn(
                    'inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-border bg-background px-4 py-2 text-sm font-medium transition-colors hover:bg-accent',
                    isProductsBusy && 'pointer-events-none opacity-60',
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
                          {ordersCollection && !ordersCollection.permissions.publicRead && !ordersCollection.permissions.publicCreate ? 'Private' : 'Review'}
                        </span>
                      </div>
                    </div>
                  </div>
                  <div className="rounded-lg border border-border bg-card p-3">
                    <div className="text-xs font-semibold text-foreground">Next commerce milestone</div>
                    <p className="mt-1 text-xs leading-5 text-muted-foreground">
                      Backy can capture private orders, calculate quote totals, create checkout-session handoffs, and link customers. Provider settlement, automated refunds, and webhook processing remain deeper commerce backend work.
                    </p>
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
              <Button onClick={() => void createProductsCollection()} disabled={isProductsBusy} iconStart={<Sparkles className="size-4" />}>
                {isSaving ? 'Setting up...' : 'Set Up Products'}
              </Button>
              <Button variant="outline" onClick={openStorefrontPage} disabled={isProductsBusy} iconStart={<Sparkles className="size-4" />}>
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
                description={`${filteredProducts.length}/${products.length} visible products`}
                icon={<ShoppingBag className="size-4" />}
                action={<Button onClick={resetForm} disabled={isProductsBusy} iconStart={<Plus className="size-4" />}>New Product</Button>}
              />
              <PanelContent>
                <div className="mb-4 flex flex-wrap items-center gap-3">
                  <div className="relative min-w-64 flex-1">
                    <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                    <input
                      aria-label="Search products"
                      value={searchQuery}
                      disabled={isProductsBusy}
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
                        disabled={isProductsBusy}
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
                    disabled={isProductsBusy}
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
                    disabled={isProductsBusy}
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
                    disabled={isProductsBusy}
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
                    <Button variant="outline" onClick={clearCatalogFilters} disabled={isProductsBusy}>
                      Clear filters
                    </Button>
                  )}
                </div>

                {filteredProducts.length === 0 ? (
                  <div className="rounded-lg border border-dashed border-border px-4 py-10 text-center">
                    <div className="text-sm font-medium text-foreground">
                      {products.length === 0 ? 'No products yet' : 'No products match this view'}
                    </div>
                    <div className="mt-1 text-sm text-muted-foreground">
                      {products.length === 0
                        ? 'Create the first sellable product, then publish it for storefront APIs.'
                        : 'Change the search, status, type, category, or stock filters to broaden the catalog.'}
                    </div>
                    {products.length > 0 && hasActiveCatalogFilters && (
                      <Button variant="outline" onClick={clearCatalogFilters} disabled={isProductsBusy} className="mt-4">
                        Clear filters
                      </Button>
                    )}
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
                        onDelete={() => setPendingDeleteProduct(product)}
                        disabled={isProductsBusy}
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
                <fieldset disabled={isProductsBusy} className={cn('space-y-4', isProductsBusy && 'opacity-70')}>
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
                      {productVariants.length}/50
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
                          <Button size="sm" variant="ghost" onClick={() => removeProductVariant(variant.id)}>
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
                      disabled={(!variantDraft.title.trim() && !variantDraft.option.trim()) || productVariants.length >= 50}
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
                      <Button onClick={() => openMediaPicker('download')} iconStart={<FileText className="size-4" />}>
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
                      <Button onClick={() => openMediaPicker('image')} iconStart={<ImageIcon className="size-4" />}>
                        Media
                      </Button>
                    </div>
                  </div>
                </Field>
                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-3 text-xs font-medium text-muted-foreground">
                    <span>Gallery images</span>
                    <span className="font-mono">{galleryImageUrls.length}/12</span>
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
                        disabled={!galleryImageDraft.trim() || galleryImageUrls.length >= 12}
                      >
                        Add URL
                      </Button>
                      <Button
                        onClick={() => openMediaPicker('gallery')}
                        disabled={galleryImageUrls.length >= 12}
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
                        onChange={(event) => setFormState((current) => ({ ...current, scheduledAt: event.target.value }))}
                        required
                        className="w-full rounded-lg border bg-background px-3 py-2.5 text-sm"
                      />
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
                  <Button variant="outline" onClick={resetForm} disabled={isProductsBusy}>Clear</Button>
                  <Button type="submit" variant="primary" disabled={isProductsBusy || !formState.title.trim() || !formState.sku.trim() || (formState.status === 'scheduled' && !formState.scheduledAt)} iconStart={<Package className="size-4" />}>
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
                disabled={isProductsBusy}
                className="rounded-lg border border-border px-4 py-2 text-sm font-medium transition-colors hover:bg-accent disabled:cursor-not-allowed disabled:opacity-60"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void removeProduct(pendingDeleteProduct)}
                disabled={isProductsBusy}
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
          if (!isProductsBusy) {
            setIsMediaLibraryOpen(false);
          }
        }}
        onSelect={(asset) => {
          if (isProductsBusy) return;

          const deliveryUrl = asset.url || getPublicMediaFileUrl(asset.id, activeSiteId);
          if (mediaPickerTarget === 'download') {
            setFormState((current) => ({ ...current, downloadUrl: deliveryUrl }));
            setNotice(`Attached ${asset.name} to the digital delivery field.`);
            return;
          }

          if (mediaPickerTarget === 'gallery') {
            addGalleryImageUrl(deliveryUrl);
            setNotice(`Added ${asset.name} to the product gallery.`);
            return;
          }

          setFormState((current) => ({ ...current, imageUrl: deliveryUrl }));
          setNotice(`Attached ${asset.name} to the product image field.`);
        }}
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

function Metric({ label, value, icon }: { label: string; value: number; icon: ReactNode }) {
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

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block space-y-2">
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
}: {
  product: CollectionRecord;
  selected: boolean;
  disabled: boolean;
  onEdit: () => void;
  onPublish: () => void;
  onArchive: () => void;
  onDelete: () => void;
}) {
  const title = String(product.values.title || product.slug);
  const price = toNumber(product.values.price);
  const compareAtPrice = toNumber(product.values.compareAtPrice);
  const currency = normalizeCurrency(String(product.values.currency || 'USD'));
  const inventory = toNumber(product.values.inventory);
  const lowStockThreshold = Math.max(0, toNumber(product.values.lowStockThreshold || 5));
  const imageUrl = String(product.values.imageUrl || '');
  const galleryImages = formatGalleryImages(product.values.galleryImages);
  const variants = formatProductVariants(product.values.variants);
  const productType = String(product.values.productType || 'physical');
  const inventoryPolicy = asInventoryPolicy(product.values.inventoryPolicy);
  const category = String(product.values.category || '');
  const vendor = String(product.values.vendor || '');
  const tags = formatTags(product.values.tags).slice(0, 3);
  const shippingRequired = product.values.shippingRequired !== false;
  const isLowStock = inventory > 0 && inventory <= lowStockThreshold;

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
              <div className="mt-1 truncate font-mono text-xs text-muted-foreground">{String(product.values.sku || product.slug)}</div>
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
            {product.values.featured ? (
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
          {product.values.description ? (
            <p className="mt-2 line-clamp-2 text-sm text-muted-foreground">
              {String(product.values.description)}
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
          <div className="font-semibold">{inventory}</div>
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
        <Button size="sm" variant="danger" onClick={onDelete} disabled={disabled} iconStart={<Trash2 className="size-4" />}>Delete</Button>
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

const safeParseJsonArray = (value: string): unknown[] => {
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

const slugify = (value: string): string => (
  value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
);

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

const productToForm = (product: CollectionRecord): ProductFormState => ({
  title: String(product.values.title || ''),
  slug: product.slug,
  sku: String(product.values.sku || ''),
  variants: serializeProductVariants(formatProductVariants(product.values.variants)),
  price: String(product.values.price ?? ''),
  compareAtPrice: product.values.compareAtPrice === null || product.values.compareAtPrice === undefined ? '' : String(product.values.compareAtPrice),
  currency: String(product.values.currency || 'USD'),
  inventory: String(product.values.inventory ?? '0'),
  lowStockThreshold: String(product.values.lowStockThreshold ?? '5'),
  inventoryPolicy: asInventoryPolicy(product.values.inventoryPolicy),
  productType: asProductType(product.values.productType),
  downloadUrl: String(product.values.downloadUrl || ''),
  checkoutUrl: String(product.values.checkoutUrl || ''),
  shippingRequired: product.values.shippingRequired !== false,
  shippingProfile: String(product.values.shippingProfile || ''),
  weight: product.values.weight === null || product.values.weight === undefined ? '' : String(product.values.weight),
  taxClass: String(product.values.taxClass || ''),
  discountCode: String(product.values.discountCode || ''),
  returnPolicy: String(product.values.returnPolicy || ''),
  imageUrl: String(product.values.imageUrl || ''),
  galleryImages: serializeGalleryImages(formatGalleryImages(product.values.galleryImages)),
  category: String(product.values.category || ''),
  tags: formatTags(product.values.tags).join(', '),
  vendor: String(product.values.vendor || ''),
  description: String(product.values.description || ''),
  seoTitle: String(product.values.seoTitle || ''),
  status: product.status,
  scheduledAt: toDateTimeLocalValue(product.scheduledAt),
  featured: Boolean(product.values.featured),
  taxable: product.values.taxable !== false,
});

const isPlainRecord = (value: unknown): value is Record<string, unknown> => (
  Boolean(value) && typeof value === 'object' && !Array.isArray(value)
);

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
      title,
      sku,
      variants,
      price: optionalNumberFromRecord(content, 'price') ?? 0,
      compareAtPrice: optionalNumberFromRecord(content, 'compareAtPrice') ?? null,
      currency: normalizeCurrency(optionalStringFromRecord(content, 'currency') || 'USD'),
      inventory: optionalNumberFromRecord(content, 'inventory') ?? (productType === 'physical' ? 0 : 1),
      lowStockThreshold: optionalNumberFromRecord(content, 'lowStockThreshold') ?? 5,
      inventoryPolicy: asInventoryPolicy(optionalStringFromRecord(content, 'inventoryPolicy')),
      productType,
      downloadUrl: optionalStringFromRecord(content, 'downloadUrl') || '',
      checkoutUrl: optionalStringFromRecord(content, 'checkoutUrl') || '',
      shippingRequired: optionalBooleanFromRecord(content, 'shippingRequired') ?? productType === 'physical',
      shippingProfile: optionalStringFromRecord(content, 'shippingProfile') || '',
      weight: optionalNumberFromRecord(content, 'weight') ?? null,
      taxClass: optionalStringFromRecord(content, 'taxClass') || '',
      discountCode: optionalStringFromRecord(content, 'discountCode') || '',
      returnPolicy: optionalStringFromRecord(content, 'returnPolicy') || '',
      imageUrl: optionalStringFromRecord(content, 'imageUrl') || galleryImages[0] || '',
      galleryImages,
      category: optionalStringFromRecord(content, 'category') || '',
      tags,
      vendor: optionalStringFromRecord(content, 'vendor') || '',
      description: template.description || optionalStringFromRecord(content, 'description') || 'Product seeded from the connected frontend design contract.',
      seoTitle: optionalStringFromRecord(content, 'seoTitle') || title,
      featured: optionalBooleanFromRecord(content, 'featured') ?? false,
      taxable: optionalBooleanFromRecord(content, 'taxable') ?? true,
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

const getPersistedFrontendProductValues = (product: CollectionRecord | null): Record<string, unknown> => {
  if (!product) return {};

  return Object.fromEntries(
    FRONTEND_PRODUCT_VALUE_KEYS
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
    .slice(0, 12)
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
    .slice(0, 50);
};

const parseProductVariants = (value: string): ProductVariant[] => formatProductVariants(value);

const serializeProductVariants = (variants: ProductVariant[]): string => (
  JSON.stringify(formatProductVariants(variants))
);

const getMissingProductFieldKeys = (collection: Collection): string[] => {
  const existingKeys = new Set(collection.fields.map((field) => field.key));
  return PRODUCT_FIELDS
    .filter((field) => !existingKeys.has(field.key))
    .map((field) => field.key);
};

const mergeProductFields = (currentFields: CollectionField[]): CollectionField[] => {
  const fieldsByKey = new Map(currentFields.map((field) => [field.key, field]));
  const merged = PRODUCT_FIELDS.map((requiredField) => ({
    ...requiredField,
    ...fieldsByKey.get(requiredField.key),
    sortOrder: requiredField.sortOrder,
  }));
  const requiredKeys = new Set(PRODUCT_FIELDS.map((field) => field.key));
  const customFields = currentFields.filter((field) => !requiredKeys.has(field.key));
  return [...merged, ...customFields].sort((a, b) => a.sortOrder - b.sortOrder);
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

  return {
  product_id: product.id,
  active_site_id: context.activeSiteId,
  slug: product.slug,
  status: product.status,
  title: String(product.values.title || product.slug),
  sku: String(product.values.sku || ''),
  variants: formatProductVariants(product.values.variants).map((variant) => `${variant.title}${variant.sku ? ` (${variant.sku})` : ''}`).join('; '),
  variant_count: formatProductVariants(product.values.variants).length,
  price: toNumber(product.values.price),
  compare_at_price: product.values.compareAtPrice === null || product.values.compareAtPrice === undefined
    ? null
    : toNumber(product.values.compareAtPrice),
  currency: normalizeCurrency(String(product.values.currency || 'USD')),
  inventory: toNumber(product.values.inventory),
  low_stock_threshold: toNumber(product.values.lowStockThreshold || 5),
  inventory_policy: asInventoryPolicy(product.values.inventoryPolicy),
  product_type: asProductType(product.values.productType),
  category: String(product.values.category || ''),
  tags: formatTags(product.values.tags).join('; '),
  vendor: String(product.values.vendor || ''),
  image_url: String(product.values.imageUrl || ''),
  gallery_images: formatGalleryImages(product.values.galleryImages).join('; '),
  gallery_image_count: formatGalleryImages(product.values.galleryImages).length,
  download_url: String(product.values.downloadUrl || ''),
  checkout_url: String(product.values.checkoutUrl || ''),
  shipping_required: product.values.shippingRequired !== false,
  shipping_profile: String(product.values.shippingProfile || ''),
  tax_class: String(product.values.taxClass || ''),
  discount_code: String(product.values.discountCode || ''),
  return_policy: String(product.values.returnPolicy || ''),
  taxable: product.values.taxable !== false,
  weight: product.values.weight === null || product.values.weight === undefined ? null : toNumber(product.values.weight),
  featured: Boolean(product.values.featured),
  seo_title: String(product.values.seoTitle || ''),
  storefront_path: storefrontPath,
  list_api_url: context.storefrontApiUrl,
  detail_api_url: detailApiUrl,
  public_render_url: `${context.publicBaseUrl}/api/sites/${encodeURIComponent(context.activeSiteId)}/render?path=${encodeURIComponent(storefrontPath)}`,
  public_resolve_url: `${context.publicBaseUrl}/api/sites/${encodeURIComponent(context.activeSiteId)}/resolve?path=${encodeURIComponent(storefrontPath)}`,
  checkout_mode: String(product.values.checkoutUrl || '').trim() ? 'external checkout URL' : 'not configured',
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
