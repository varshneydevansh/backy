import { FormEvent, type ReactNode, useEffect, useMemo, useState } from 'react';
import { createFileRoute } from '@tanstack/react-router';
import {
  Archive,
  Boxes,
  CheckCircle2,
  Edit3,
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
import { cn, formatDate } from '@/lib/utils';

export const Route = createFileRoute('/products')({
  component: ProductsRoute,
});

type ProductStatusFilter = ContentStatus | 'all';

interface ProductFormState {
  title: string;
  slug: string;
  sku: string;
  price: string;
  currency: string;
  inventory: string;
  imageUrl: string;
  description: string;
  status: ContentStatus;
  featured: boolean;
  taxable: boolean;
}

const PRODUCT_COLLECTION_SLUG = 'products';

const PRODUCT_FIELDS: CollectionField[] = [
  { key: 'title', label: 'Title', type: 'text', required: true, unique: false, sortOrder: 10 },
  { key: 'sku', label: 'SKU', type: 'text', required: true, unique: true, sortOrder: 20 },
  { key: 'price', label: 'Price', type: 'number', required: true, unique: false, sortOrder: 30 },
  { key: 'currency', label: 'Currency', type: 'text', required: true, unique: false, sortOrder: 40, defaultValue: 'USD' },
  { key: 'inventory', label: 'Inventory', type: 'number', required: false, unique: false, sortOrder: 50, defaultValue: 0 },
  { key: 'imageUrl', label: 'Image URL', type: 'url', required: false, unique: false, sortOrder: 60 },
  { key: 'description', label: 'Description', type: 'richText', required: false, unique: false, sortOrder: 70 },
  { key: 'featured', label: 'Featured', type: 'boolean', required: false, unique: false, sortOrder: 80, defaultValue: false },
  { key: 'taxable', label: 'Taxable', type: 'boolean', required: false, unique: false, sortOrder: 90, defaultValue: true },
];

const EMPTY_PRODUCT_FORM: ProductFormState = {
  title: '',
  slug: '',
  sku: '',
  price: '',
  currency: 'USD',
  inventory: '0',
  imageUrl: '',
  description: '',
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
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const activeSite = useMemo(
    () => sites.find((site) => (site.publicSiteId || site.id) === selectedSiteId) || sites[0],
    [selectedSiteId, sites],
  );
  const activeSiteId = activeSite?.publicSiteId || activeSite?.id || selectedSiteId || 'site-demo';
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
  }), [products]);

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
        currency: normalizeCurrency(formState.currency),
        inventory: Number(formState.inventory || 0),
        imageUrl: formState.imageUrl.trim(),
        description: formState.description.trim(),
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
    if (!productCollection || !confirm(`Delete "${String(product.values.title || product.slug)}"?`)) return;
    setIsSaving(true);
    setError(null);

    try {
      await deleteCollectionRecord(activeSiteId, productCollection.id, product.id);
      setProducts((current) => current.filter((item) => item.id !== product.id));
      if (selectedProductId === product.id) {
        resetForm();
      }
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : 'Unable to delete product');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <PageShell
      title="Products"
      description="Manage sellable catalog data for storefront pages and custom frontend APIs."
      action={
        <div className="flex flex-wrap items-center gap-2">
          <select
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

      <div className="mb-6 grid gap-3 md:grid-cols-4">
        <Metric label="Products" value={metrics.total} icon={<Package className="size-4" />} />
        <Metric label="Published" value={metrics.published} icon={<CheckCircle2 className="size-4" />} />
        <Metric label="Draft" value={metrics.draft} icon={<Edit3 className="size-4" />} />
        <Metric label="Inventory" value={metrics.inventory} icon={<Boxes className="size-4" />} />
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
            <Panel>
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
                        onDelete={() => void removeProduct(product)}
                        disabled={isSaving}
                      />
                    ))}
                  </div>
                )}
              </PanelContent>
            </Panel>
          </div>

          <Panel className="xl:sticky xl:top-4 xl:self-start">
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
                  <Field label="Currency">
                    <input
                      value={formState.currency}
                      onChange={(event) => setFormState((current) => ({ ...current, currency: event.target.value.toUpperCase().slice(0, 3) }))}
                      required
                      className="w-full rounded-lg border bg-background px-3 py-2.5 text-sm"
                    />
                  </Field>
                  <Field label="Stock">
                    <input
                      type="number"
                      min="0"
                      value={formState.inventory}
                      onChange={(event) => setFormState((current) => ({ ...current, inventory: event.target.value }))}
                      className="w-full rounded-lg border bg-background px-3 py-2.5 text-sm"
                    />
                  </Field>
                </div>
                <Field label="Image URL">
                  <input
                    value={formState.imageUrl}
                    onChange={(event) => setFormState((current) => ({ ...current, imageUrl: event.target.value }))}
                    className="w-full rounded-lg border bg-background px-3 py-2.5 text-sm"
                    placeholder="https://..."
                  />
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
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Status">
                    <select
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

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block space-y-2">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      {children}
    </label>
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
  const currency = normalizeCurrency(String(product.values.currency || 'USD'));
  const inventory = toNumber(product.values.inventory);
  const imageUrl = String(product.values.imageUrl || '');

  return (
    <article className={cn('rounded-lg border bg-background p-4 transition-colors', selected ? 'border-primary ring-2 ring-primary/10' : 'border-border')}>
      <div className="flex items-start gap-3">
        <div className="flex size-14 shrink-0 items-center justify-center overflow-hidden rounded-md border border-border bg-muted">
          {imageUrl ? (
            <img src={imageUrl} alt="" className="size-full object-cover" loading="lazy" />
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
  currency: String(product.values.currency || 'USD'),
  inventory: String(product.values.inventory ?? '0'),
  imageUrl: String(product.values.imageUrl || ''),
  description: String(product.values.description || ''),
  status: product.status,
  featured: Boolean(product.values.featured),
  taxable: product.values.taxable !== false,
});
