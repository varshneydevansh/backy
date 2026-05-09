import { FormEvent, type ReactNode, useEffect, useMemo, useState } from 'react';
import { createFileRoute } from '@tanstack/react-router';
import {
  AlertTriangle,
  Archive,
  Boxes,
  CheckCircle2,
  Code2,
  Copy,
  Edit3,
  ExternalLink,
  Image as ImageIcon,
  Package,
  Plus,
  RefreshCw,
  Search,
  ShoppingBag,
  Sparkles,
  Trash2,
} from 'lucide-react';
import {
  createCollection,
  createCollectionRecord,
  deleteCollectionRecord,
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
import { MediaLibraryModal } from '@/components/editor/MediaLibraryModal';
import { cn, formatDate } from '@/lib/utils';

export const Route = createFileRoute('/products')({
  component: ProductsRoute,
});

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

interface ProductFormState {
  title: string;
  slug: string;
  sku: string;
  price: string;
  compareAtPrice: string;
  currency: string;
  inventory: string;
  productType: 'physical' | 'digital' | 'service';
  downloadUrl: string;
  shippingRequired: boolean;
  weight: string;
  imageUrl: string;
  description: string;
  seoTitle: string;
  status: ContentStatus;
  featured: boolean;
  taxable: boolean;
}

const PRODUCT_COLLECTION_SLUG = 'products';

const PRODUCT_FIELDS: CollectionField[] = [
  { key: 'title', label: 'Title', type: 'text', required: true, unique: false, sortOrder: 10 },
  { key: 'sku', label: 'SKU', type: 'text', required: true, unique: true, sortOrder: 20 },
  { key: 'price', label: 'Price', type: 'number', required: true, unique: false, sortOrder: 30 },
  { key: 'compareAtPrice', label: 'Compare at price', type: 'number', required: false, unique: false, sortOrder: 40 },
  { key: 'currency', label: 'Currency', type: 'text', required: true, unique: false, sortOrder: 50, defaultValue: 'USD' },
  { key: 'inventory', label: 'Inventory', type: 'number', required: false, unique: false, sortOrder: 60, defaultValue: 0 },
  { key: 'productType', label: 'Product Type', type: 'select', required: true, unique: false, sortOrder: 70, options: ['physical', 'digital', 'service'], defaultValue: 'physical' },
  { key: 'downloadUrl', label: 'Digital Delivery URL', type: 'url', required: false, unique: false, sortOrder: 80 },
  { key: 'shippingRequired', label: 'Requires Shipping', type: 'boolean', required: false, unique: false, sortOrder: 90, defaultValue: true },
  { key: 'weight', label: 'Weight', type: 'number', required: false, unique: false, sortOrder: 100 },
  { key: 'imageUrl', label: 'Image URL', type: 'url', required: false, unique: false, sortOrder: 110 },
  { key: 'description', label: 'Description', type: 'richText', required: false, unique: false, sortOrder: 120 },
  { key: 'seoTitle', label: 'SEO Title', type: 'text', required: false, unique: false, sortOrder: 130 },
  { key: 'featured', label: 'Featured', type: 'boolean', required: false, unique: false, sortOrder: 140, defaultValue: false },
  { key: 'taxable', label: 'Taxable', type: 'boolean', required: false, unique: false, sortOrder: 150, defaultValue: true },
];

const EMPTY_PRODUCT_FORM: ProductFormState = {
  title: '',
  slug: '',
  sku: '',
  price: '',
  compareAtPrice: '',
  currency: 'USD',
  inventory: '0',
  productType: 'physical',
  downloadUrl: '',
  shippingRequired: true,
  weight: '',
  imageUrl: '',
  description: '',
  seoTitle: '',
  status: 'draft',
  featured: false,
  taxable: true,
};

function ProductsRoute() {
  const { sites } = useStore();
  const [selectedSiteId, setSelectedSiteId] = useState(() => sites[0]?.publicSiteId || sites[0]?.id || 'site-demo');
  const [productCollection, setProductCollection] = useState<Collection | null>(null);
  const [products, setProducts] = useState<CollectionRecord[]>([]);
  const [selectedProductId, setSelectedProductId] = useState<string | null>(null);
  const [formState, setFormState] = useState<ProductFormState>(EMPTY_PRODUCT_FORM);
  const [statusFilter, setStatusFilter] = useState<ProductStatusFilter>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isMediaLibraryOpen, setIsMediaLibraryOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [pendingDeleteProduct, setPendingDeleteProduct] = useState<CollectionRecord | null>(null);

  const activeSite = useMemo(
    () => sites.find((site) => (site.publicSiteId || site.id) === selectedSiteId) || sites[0],
    [selectedSiteId, sites],
  );
  const activeSiteId = activeSite?.publicSiteId || activeSite?.id || selectedSiteId || 'site-demo';
  const publicBaseUrl = useMemo(() => getPublicBaseUrl(), []);
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
  const selectedProduct = useMemo(
    () => products.find((product) => product.id === selectedProductId) || null,
    [products, selectedProductId],
  );
  const filteredProducts = useMemo(() => {
    const normalizedSearch = searchQuery.trim().toLowerCase();
    return products.filter((product) => {
      const matchesStatus = statusFilter === 'all' || product.status === statusFilter;
      const values = product.values;
      const matchesSearch = !normalizedSearch || [
        product.slug,
        values.title,
        values.sku,
        values.description,
      ].some((value) => String(value || '').toLowerCase().includes(normalizedSearch));

      return matchesStatus && matchesSearch;
    });
  }, [products, searchQuery, statusFilter]);
  const metrics = useMemo(() => ({
    total: products.length,
    published: products.filter((product) => product.status === 'published').length,
    draft: products.filter((product) => product.status === 'draft').length,
    inventory: products.reduce((sum, product) => sum + toNumber(product.values.inventory), 0),
    lowStock: products.filter((product) => {
      const inventory = toNumber(product.values.inventory);
      return inventory > 0 && inventory <= 5;
    }).length,
    digital: products.filter((product) => product.values.productType === 'digital').length,
  }), [products]);
  const catalogReadiness = useMemo(() => {
    const hasSchema = Boolean(productCollection);
    const hasProducts = products.length > 0;
    const hasPublished = metrics.published > 0;
    const hasInventory = metrics.inventory > 0 || metrics.digital > 0;
    const hasImages = products.some((product) => Boolean(product.values.imageUrl));
    const hasPricing = products.some((product) => toNumber(product.values.price) > 0);
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
        label: 'Stock or delivery',
        detail: hasInventory ? `${metrics.inventory} units or ${metrics.digital} digital product${metrics.digital === 1 ? '' : 's'}.` : 'Add inventory or digital delivery metadata.',
        ready: hasInventory,
      },
      {
        label: 'Product media',
        detail: hasImages ? 'Product imagery is attached.' : 'Attach media so storefront cards are not text-only.',
        ready: hasImages || products.length === 0,
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
        { label: 'Operate', detail: 'Track inventory, low stock, digital products, drafts, and archived products from one catalog view.' },
      ],
    };
  }, [
    metrics.digital,
    metrics.inventory,
    metrics.published,
    missingProductFields.length,
    productApiReady,
    productCollection,
    products,
  ]);

  const loadProducts = async () => {
    setIsLoading(true);
    setError(null);

    try {
      const collections = await listCollections(activeSiteId);
      const collection = collections.find((item) => item.slug === PRODUCT_COLLECTION_SLUG) || null;
      setProductCollection(collection);

      if (!collection) {
        setProducts([]);
        setSelectedProductId(null);
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
    if (sites.length > 0 && !sites.some((site) => (site.publicSiteId || site.id) === selectedSiteId)) {
      setSelectedSiteId(sites[0].publicSiteId || sites[0].id);
    }
  }, [selectedSiteId, sites]);

  useEffect(() => {
    void loadProducts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeSiteId]);

  useEffect(() => {
    if (!selectedProduct) return;
    setFormState(productToForm(selectedProduct));
  }, [selectedProduct]);

  const resetForm = () => {
    setSelectedProductId(null);
    setFormState(EMPTY_PRODUCT_FORM);
  };

  const createProductsCollection = async () => {
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

  const saveProduct = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!productCollection) return;

    setIsSaving(true);
    setError(null);
    setNotice(null);

    const slug = slugify(formState.slug || formState.title || formState.sku);
    const input = {
      slug,
      status: formState.status,
      values: {
        title: formState.title.trim(),
        sku: formState.sku.trim(),
        price: Number(formState.price || 0),
        compareAtPrice: formState.compareAtPrice ? Number(formState.compareAtPrice) : null,
        currency: normalizeCurrency(formState.currency),
        inventory: Number(formState.inventory || 0),
        productType: formState.productType,
        downloadUrl: formState.downloadUrl.trim(),
        shippingRequired: formState.shippingRequired,
        weight: formState.weight ? Number(formState.weight) : null,
        imageUrl: formState.imageUrl.trim(),
        description: formState.description.trim(),
        seoTitle: formState.seoTitle.trim(),
        featured: formState.featured,
        taxable: formState.taxable,
      },
    };

    try {
      const saved = selectedProduct
        ? await updateCollectionRecord(activeSiteId, productCollection.id, selectedProduct.id, input)
        : await createCollectionRecord(activeSiteId, productCollection.id, input);

      setProducts((current) => [saved, ...current.filter((product) => product.id !== saved.id)]);
      setSelectedProductId(saved.id);
      setNotice(selectedProduct ? 'Product updated.' : 'Product created.');
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Unable to save product');
    } finally {
      setIsSaving(false);
    }
  };

  const changeProductStatus = async (product: CollectionRecord, status: ContentStatus) => {
    if (!productCollection) return;
    setIsSaving(true);
    setError(null);

    try {
      const updated = await updateCollectionRecord(activeSiteId, productCollection.id, product.id, {
        status,
        values: product.values,
      });
      setProducts((current) => current.map((item) => (item.id === updated.id ? updated : item)));
      if (selectedProductId === updated.id) {
        setFormState(productToForm(updated));
      }
    } catch (statusError) {
      setError(statusError instanceof Error ? statusError.message : 'Unable to update product');
    } finally {
      setIsSaving(false);
    }
  };

  const removeProduct = async (product: CollectionRecord) => {
    if (!productCollection) return;
    setIsSaving(true);
    setError(null);

    try {
      await deleteCollectionRecord(activeSiteId, productCollection.id, product.id);
      setProducts((current) => current.filter((item) => item.id !== product.id));
      if (selectedProductId === product.id) {
        resetForm();
      }
      setPendingDeleteProduct(null);
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : 'Unable to delete product');
    } finally {
      setIsSaving(false);
    }
  };

  const copyStorefrontApiUrl = async () => {
    try {
      await navigator.clipboard.writeText(storefrontApiUrl);
      setNotice('Storefront products API URL copied.');
    } catch {
      setNotice(storefrontApiUrl);
    }
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
            onChange={(event) => setSelectedSiteId(event.target.value)}
            className="min-h-11 min-w-56 rounded-lg border bg-background px-3 py-2 text-sm"
          >
            {sites.length === 0 ? (
              <option value="site-demo">Demo site</option>
            ) : sites.map((site) => (
              <option key={site.id} value={site.publicSiteId || site.id}>
                {site.name}
              </option>
            ))}
          </select>
          <Button onClick={() => void loadProducts()} disabled={isLoading} iconStart={<RefreshCw className={cn('size-4', isLoading && 'animate-spin')} />}>
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
            {!productCollection ? (
              <Button onClick={() => void createProductsCollection()} disabled={isSaving} iconStart={<Sparkles className="size-4" />}>
                {isSaving ? 'Setting up...' : 'Set up products'}
              </Button>
            ) : (
              <Button onClick={resetForm} iconStart={<Plus className="size-4" />}>
                New product
              </Button>
            )}
            <Button onClick={() => void loadProducts()} disabled={isLoading} iconStart={<RefreshCw className={cn('size-4', isLoading && 'animate-spin')} />}>
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
                    disabled={isSaving}
                    iconStart={<Sparkles className="size-4" />}
                  >
                    Sync Schema
                  </Button>
                )}
                <Button onClick={() => void copyStorefrontApiUrl()} iconStart={<Copy className="size-4" />}>
                  Copy URL
                </Button>
                <a
                  href={storefrontApiUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-border bg-background px-4 py-2 text-sm font-medium transition-colors hover:bg-accent"
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
              </div>
              {missingProductFields.length > 0 && (
                <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
                  Missing commerce fields: {missingProductFields.join(', ')}. Sync the schema before relying on product APIs.
                </div>
              )}
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
          onChange={(event) => setSelectedSiteId(event.target.value)}
          className="min-h-10 min-w-56 rounded-lg border bg-background px-3 py-2 text-sm"
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

      <div id="products-metrics" className="mb-6 grid gap-3 scroll-mt-24 md:grid-cols-3 xl:grid-cols-6">
        <Metric label="Products" value={metrics.total} icon={<Package className="size-4" />} />
        <Metric label="Published" value={metrics.published} icon={<CheckCircle2 className="size-4" />} />
        <Metric label="Draft" value={metrics.draft} icon={<Edit3 className="size-4" />} />
        <Metric label="Inventory" value={metrics.inventory} icon={<Boxes className="size-4" />} />
        <Metric label="Low stock" value={metrics.lowStock} icon={<Archive className="size-4" />} />
        <Metric label="Digital" value={metrics.digital} icon={<Sparkles className="size-4" />} />
      </div>

      {!productCollection ? (
        <EmptyState
          icon={ShoppingBag}
          title="Products are not set up"
          description="Create a products collection with pricing, SKU, inventory, image, and publishing fields."
          action={
            <Button className="mt-2" onClick={() => void createProductsCollection()} disabled={isSaving} iconStart={<Sparkles className="size-4" />}>
              {isSaving ? 'Setting up...' : 'Set Up Products'}
            </Button>
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
                action={<Button onClick={resetForm} iconStart={<Plus className="size-4" />}>New Product</Button>}
              />
              <PanelContent>
                <div className="mb-4 flex flex-wrap items-center gap-3">
                  <div className="relative min-w-64 flex-1">
                    <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                    <input
                      value={searchQuery}
                      onChange={(event) => setSearchQuery(event.target.value)}
                      placeholder="Search products..."
                      className="w-full rounded-lg border bg-background py-2.5 pl-9 pr-3 text-sm"
                    />
                  </div>
                  <div className="inline-flex flex-wrap items-center gap-1 rounded-lg border border-border bg-muted p-1">
                    {(['all', 'published', 'draft', 'archived'] as const).map((status) => (
                      <button
                        key={status}
                        type="button"
                        onClick={() => setStatusFilter(status)}
                        className={cn(
                          'rounded-md px-3 py-1.5 text-sm font-medium capitalize text-muted-foreground hover:bg-background hover:text-foreground',
                          statusFilter === status && 'bg-background text-foreground shadow-sm',
                        )}
                      >
                        {status}
                      </button>
                    ))}
                  </div>
                </div>

                {filteredProducts.length === 0 ? (
                  <div className="rounded-lg border border-dashed border-border px-4 py-10 text-center text-sm text-muted-foreground">
                    No products match this view.
                  </div>
                ) : (
                  <div className="grid gap-3 lg:grid-cols-2">
                    {filteredProducts.map((product) => (
                      <ProductCard
                        key={product.id}
                        product={product}
                        selected={product.id === selectedProductId}
                        onEdit={() => setSelectedProductId(product.id)}
                        onPublish={() => void changeProductStatus(product, 'published')}
                        onArchive={() => void changeProductStatus(product, 'archived')}
                        onDelete={() => setPendingDeleteProduct(product)}
                        disabled={isSaving}
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
              <form onSubmit={saveProduct} className="space-y-4">
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
                <Field label="Digital delivery URL">
                  <input
                    value={formState.downloadUrl}
                    onChange={(event) => setFormState((current) => ({ ...current, downloadUrl: event.target.value }))}
                    className="w-full rounded-lg border bg-background px-3 py-2.5 text-sm"
                    placeholder="https://downloads.example.com/product.zip"
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
                      <Button onClick={() => setIsMediaLibraryOpen(true)} iconStart={<ImageIcon className="size-4" />}>
                        Media
                      </Button>
                    </div>
                  </div>
                </Field>
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
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Status">
                    <select
                      aria-label="Status"
                      value={formState.status}
                      onChange={(event) => setFormState((current) => ({ ...current, status: event.target.value as ContentStatus }))}
                      className="w-full rounded-lg border bg-background px-3 py-2.5 text-sm"
                    >
                      <option value="draft">Draft</option>
                      <option value="published">Published</option>
                      <option value="archived">Archived</option>
                    </select>
                  </Field>
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
                  <Button variant="outline" onClick={resetForm}>Clear</Button>
                  <Button type="submit" variant="primary" disabled={isSaving || !formState.title.trim() || !formState.sku.trim()} iconStart={<Package className="size-4" />}>
                    {isSaving ? 'Saving...' : selectedProduct ? 'Save Product' : 'Create Product'}
                  </Button>
                </div>
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
                className="rounded-lg border border-border px-4 py-2 text-sm font-medium transition-colors hover:bg-accent"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void removeProduct(pendingDeleteProduct)}
                disabled={isSaving}
                className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-red-700 disabled:opacity-60"
              >
                Delete product
              </button>
            </div>
          </div>
        </div>
      )}

      <MediaLibraryModal
        isOpen={isMediaLibraryOpen}
        onClose={() => setIsMediaLibraryOpen(false)}
        onSelect={(asset) => {
          setFormState((current) => ({ ...current, imageUrl: asset.url }));
          setNotice(`Attached ${asset.name} to the product image field.`);
        }}
        allowedTypes="image"
        initialUploadFilter="image"
        mediaContext={{
          siteId: activeSiteId,
          scope: 'global',
          targetLabel: `${activeSite?.name || activeSiteId} product catalog`,
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
  const imageUrl = String(product.values.imageUrl || '');
  const productType = String(product.values.productType || 'physical');
  const shippingRequired = product.values.shippingRequired !== false;
  const isLowStock = inventory > 0 && inventory <= 5;

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
          </div>
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
        <Button size="sm" onClick={onEdit} iconStart={<Edit3 className="size-4" />}>Edit</Button>
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

const productToForm = (product: CollectionRecord): ProductFormState => ({
  title: String(product.values.title || ''),
  slug: product.slug,
  sku: String(product.values.sku || ''),
  price: String(product.values.price ?? ''),
  compareAtPrice: product.values.compareAtPrice === null || product.values.compareAtPrice === undefined ? '' : String(product.values.compareAtPrice),
  currency: String(product.values.currency || 'USD'),
  inventory: String(product.values.inventory ?? '0'),
  productType: asProductType(product.values.productType),
  downloadUrl: String(product.values.downloadUrl || ''),
  shippingRequired: product.values.shippingRequired !== false,
  weight: product.values.weight === null || product.values.weight === undefined ? '' : String(product.values.weight),
  imageUrl: String(product.values.imageUrl || ''),
  description: String(product.values.description || ''),
  seoTitle: String(product.values.seoTitle || ''),
  status: product.status,
  featured: Boolean(product.values.featured),
  taxable: product.values.taxable !== false,
});

const asProductType = (value: unknown): ProductFormState['productType'] => (
  value === 'digital' || value === 'service' || value === 'physical' ? value : 'physical'
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
