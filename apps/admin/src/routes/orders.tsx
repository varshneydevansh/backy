import { FormEvent, type ReactNode, useEffect, useMemo, useState } from 'react';
import { createFileRoute } from '@tanstack/react-router';
import {
  Archive,
  CheckCircle2,
  ClipboardCheck,
  Code2,
  Copy,
  CreditCard,
  Clock3,
  ExternalLink,
  PackageCheck,
  Plus,
  Receipt,
  RefreshCw,
  RotateCcw,
  Search,
  ShieldCheck,
  Sparkles,
  Trash2,
  Truck,
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
import { fromDateTimeLocalValue, toDateTimeLocalValue } from '@/lib/dateTime';

export const Route = createFileRoute('/orders')({
  component: OrdersRoute,
});

type OrderFilter = 'all' | 'open' | 'paid' | 'fulfilled' | 'cancelled';
type OrderWorkflowStatus = 'open' | 'paid' | 'fulfilled' | 'cancelled' | 'refunded';
type PaymentStatus = 'pending' | 'paid' | 'failed' | 'refunded';
type FulfillmentStatus = 'unfulfilled' | 'processing' | 'fulfilled' | 'cancelled';

interface OrderFormState {
  orderNumber: string;
  customerName: string;
  email: string;
  phone: string;
  total: string;
  currency: string;
  items: string;
  orderStatus: OrderWorkflowStatus;
  paymentStatus: PaymentStatus;
  paymentProvider: string;
  paymentReference: string;
  paidAt: string;
  fulfillmentStatus: FulfillmentStatus;
  fulfillmentCarrier: string;
  trackingNumber: string;
  trackingUrl: string;
  fulfilledAt: string;
  shippingAddress: string;
  billingAddress: string;
  refundAmount: string;
  refundReason: string;
  notes: string;
  recordStatus: ContentStatus;
}

const ORDERS_COLLECTION_SLUG = 'orders';

const ORDER_FIELDS: CollectionField[] = [
  { key: 'ordernumber', label: 'Order Number', type: 'text', required: true, unique: true, sortOrder: 10 },
  { key: 'customername', label: 'Customer Name', type: 'text', required: true, unique: false, sortOrder: 20 },
  { key: 'email', label: 'Email', type: 'email', required: true, unique: false, sortOrder: 30 },
  { key: 'phone', label: 'Phone', type: 'text', required: false, unique: false, sortOrder: 40 },
  { key: 'total', label: 'Total', type: 'number', required: true, unique: false, sortOrder: 50 },
  { key: 'currency', label: 'Currency', type: 'text', required: true, unique: false, sortOrder: 60, defaultValue: 'USD' },
  { key: 'items', label: 'Items', type: 'richText', required: true, unique: false, sortOrder: 70 },
  { key: 'orderstatus', label: 'Order Status', type: 'select', required: true, unique: false, sortOrder: 80, options: ['open', 'paid', 'fulfilled', 'cancelled', 'refunded'], defaultValue: 'open' },
  { key: 'paymentstatus', label: 'Payment Status', type: 'select', required: true, unique: false, sortOrder: 90, options: ['pending', 'paid', 'failed', 'refunded'], defaultValue: 'pending' },
  { key: 'paymentprovider', label: 'Payment Provider', type: 'text', required: false, unique: false, sortOrder: 100 },
  { key: 'paymentreference', label: 'Payment Reference', type: 'text', required: false, unique: false, sortOrder: 110 },
  { key: 'paidat', label: 'Paid At', type: 'date', required: false, unique: false, sortOrder: 120 },
  { key: 'fulfillmentstatus', label: 'Fulfillment Status', type: 'select', required: true, unique: false, sortOrder: 130, options: ['unfulfilled', 'processing', 'fulfilled', 'cancelled'], defaultValue: 'unfulfilled' },
  { key: 'fulfillmentcarrier', label: 'Fulfillment Carrier', type: 'text', required: false, unique: false, sortOrder: 140 },
  { key: 'trackingnumber', label: 'Tracking Number', type: 'text', required: false, unique: false, sortOrder: 150 },
  { key: 'trackingurl', label: 'Tracking URL', type: 'url', required: false, unique: false, sortOrder: 160 },
  { key: 'fulfilledat', label: 'Fulfilled At', type: 'date', required: false, unique: false, sortOrder: 170 },
  { key: 'shippingaddress', label: 'Shipping Address', type: 'richText', required: false, unique: false, sortOrder: 180 },
  { key: 'billingaddress', label: 'Billing Address', type: 'richText', required: false, unique: false, sortOrder: 190 },
  { key: 'refundamount', label: 'Refund Amount', type: 'number', required: false, unique: false, sortOrder: 200 },
  { key: 'refundreason', label: 'Refund Reason', type: 'richText', required: false, unique: false, sortOrder: 210 },
  { key: 'notes', label: 'Internal Notes', type: 'richText', required: false, unique: false, sortOrder: 220 },
];

const EMPTY_ORDER_FORM: OrderFormState = {
  orderNumber: '',
  customerName: '',
  email: '',
  phone: '',
  total: '',
  currency: 'USD',
  items: '',
  orderStatus: 'open',
  paymentStatus: 'pending',
  paymentProvider: '',
  paymentReference: '',
  paidAt: '',
  fulfillmentStatus: 'unfulfilled',
  fulfillmentCarrier: '',
  trackingNumber: '',
  trackingUrl: '',
  fulfilledAt: '',
  shippingAddress: '',
  billingAddress: '',
  refundAmount: '',
  refundReason: '',
  notes: '',
  recordStatus: 'published',
};

function OrdersRoute() {
  const { sites } = useStore();
  const [selectedSiteId, setSelectedSiteId] = useState(() => sites[0]?.publicSiteId || sites[0]?.id || 'site-demo');
  const [ordersCollection, setOrdersCollection] = useState<Collection | null>(null);
  const [orders, setOrders] = useState<CollectionRecord[]>([]);
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);
  const [formState, setFormState] = useState<OrderFormState>(EMPTY_ORDER_FORM);
  const [filter, setFilter] = useState<OrderFilter>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [pendingDeleteOrder, setPendingDeleteOrder] = useState<CollectionRecord | null>(null);

  const activeSite = useMemo(
    () => sites.find((site) => (site.publicSiteId || site.id) === selectedSiteId) || sites[0],
    [selectedSiteId, sites],
  );
  const activeSiteId = activeSite?.publicSiteId || activeSite?.id || selectedSiteId || 'site-demo';
  const publicBaseUrl = useMemo(() => getPublicBaseUrl(), []);
  const adminOrdersApiUrl = ordersCollection
    ? `${publicBaseUrl}/api/admin/sites/${encodeURIComponent(activeSiteId)}/collections/${encodeURIComponent(ordersCollection.id)}/records`
    : '';
  const publicOrdersApiUrl = `${publicBaseUrl}/api/sites/${encodeURIComponent(activeSiteId)}/collections/${ORDERS_COLLECTION_SLUG}/records`;
  const selectedOrder = useMemo(
    () => orders.find((order) => order.id === selectedOrderId) || null,
    [orders, selectedOrderId],
  );
  const filteredOrders = useMemo(() => {
    const normalizedSearch = searchQuery.trim().toLowerCase();

    return orders.filter((order) => {
      const values = order.values;
      const orderStatus = String(readOrderValue(values, 'orderstatus', 'open'));
      const paymentStatus = String(readOrderValue(values, 'paymentstatus', 'pending'));
      const fulfillmentStatus = String(readOrderValue(values, 'fulfillmentstatus', 'unfulfilled'));
      const matchesFilter = filter === 'all'
        || (filter === 'paid' ? paymentStatus === 'paid' : filter === 'fulfilled' ? fulfillmentStatus === 'fulfilled' : orderStatus === filter);
      const matchesSearch = !normalizedSearch || [
        order.slug,
        readOrderValue(values, 'ordernumber', ''),
        readOrderValue(values, 'customername', ''),
        values.email,
        readOrderValue(values, 'phone', ''),
        readOrderValue(values, 'paymentreference', ''),
        readOrderValue(values, 'trackingnumber', ''),
        values.items,
      ].some((value) => String(value || '').toLowerCase().includes(normalizedSearch));

      return matchesFilter && matchesSearch;
    });
  }, [filter, orders, searchQuery]);
  const metrics = useMemo(() => ({
    orders: orders.length,
    revenue: orders
      .filter((order) => String(readOrderValue(order.values, 'paymentstatus', '')) === 'paid')
      .reduce((sum, order) => sum + toNumber(order.values.total), 0),
    paid: orders.filter((order) => String(readOrderValue(order.values, 'paymentstatus', '')) === 'paid').length,
    refunded: orders.filter((order) => String(readOrderValue(order.values, 'paymentstatus', '')) === 'refunded').length,
    needsFulfillment: orders.filter((order) => (
      String(readOrderValue(order.values, 'paymentstatus', '')) === 'paid'
      && String(readOrderValue(order.values, 'fulfillmentstatus', '')) !== 'fulfilled'
    )).length,
    processing: orders.filter((order) => String(readOrderValue(order.values, 'fulfillmentstatus', '')) === 'processing').length,
  }), [orders]);

  const loadOrders = async () => {
    setIsLoading(true);
    setError(null);

    try {
      const collections = await listCollections(activeSiteId);
      const collection = collections.find((item) => item.slug === ORDERS_COLLECTION_SLUG) || null;
      setOrdersCollection(collection);

      if (!collection) {
        setOrders([]);
        setSelectedOrderId(null);
        return;
      }

      const result = await listCollectionRecords(activeSiteId, collection.id, {
        limit: 100,
        sortBy: 'updatedAt',
        sortDirection: 'desc',
      });
      setOrders(result.records);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Unable to load orders');
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
    void loadOrders();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeSiteId]);

  useEffect(() => {
    if (!selectedOrder) return;
    setFormState(orderToForm(selectedOrder));
  }, [selectedOrder]);

  const resetForm = () => {
    setSelectedOrderId(null);
    setFormState({
      ...EMPTY_ORDER_FORM,
      orderNumber: `ORD-${Date.now().toString().slice(-6)}`,
    });
  };

  const createOrdersCollection = async () => {
    setIsSaving(true);
    setError(null);
    setNotice(null);

    try {
      const collection = await createCollection(activeSiteId, {
        name: 'Orders',
        slug: ORDERS_COLLECTION_SLUG,
        description: 'Commerce orders for storefronts, custom checkout flows, and fulfillment dashboards.',
        status: 'published',
        listRoutePattern: '/orders',
        routePattern: '/orders/:recordSlug',
        fields: ORDER_FIELDS,
        permissions: {
          publicRead: false,
          publicCreate: false,
          publicUpdate: false,
          publicDelete: false,
        },
      });
      setOrdersCollection(collection);
      setOrders([]);
      resetForm();
      setNotice('Orders collection created. You can record the first order now.');
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : 'Unable to set up orders');
    } finally {
      setIsSaving(false);
    }
  };

  const saveOrder = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!ordersCollection) return;

    setIsSaving(true);
    setError(null);
    setNotice(null);

    const orderNumber = formState.orderNumber.trim() || `ORD-${Date.now().toString().slice(-6)}`;
    const input = {
      slug: slugify(orderNumber),
      status: formState.recordStatus,
      values: {
        ordernumber: orderNumber,
        customername: formState.customerName.trim(),
        email: formState.email.trim(),
        phone: formState.phone.trim(),
        total: Number(formState.total || 0),
        currency: normalizeCurrency(formState.currency),
        items: formState.items.trim(),
        orderstatus: formState.orderStatus,
        paymentstatus: formState.paymentStatus,
        paymentprovider: formState.paymentProvider.trim(),
        paymentreference: formState.paymentReference.trim(),
        paidat: formState.paidAt || null,
        fulfillmentstatus: formState.fulfillmentStatus,
        fulfillmentcarrier: formState.fulfillmentCarrier.trim(),
        trackingnumber: formState.trackingNumber.trim(),
        trackingurl: formState.trackingUrl.trim(),
        fulfilledat: formState.fulfilledAt || null,
        shippingaddress: formState.shippingAddress.trim(),
        billingaddress: formState.billingAddress.trim(),
        refundamount: formState.refundAmount ? Number(formState.refundAmount) : null,
        refundreason: formState.refundReason.trim(),
        notes: formState.notes.trim(),
      },
    };

    try {
      const saved = selectedOrder
        ? await updateCollectionRecord(activeSiteId, ordersCollection.id, selectedOrder.id, input)
        : await createCollectionRecord(activeSiteId, ordersCollection.id, input);

      setOrders((current) => [saved, ...current.filter((order) => order.id !== saved.id)]);
      setSelectedOrderId(saved.id);
      setNotice(selectedOrder ? 'Order updated.' : 'Order recorded.');
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Unable to save order');
    } finally {
      setIsSaving(false);
    }
  };

  const updateOrderWorkflow = async (order: CollectionRecord, updates: Partial<OrderFormState>) => {
    if (!ordersCollection) return;
    setIsSaving(true);
    setError(null);

    try {
      const updated = await updateCollectionRecord(activeSiteId, ordersCollection.id, order.id, {
        status: order.status,
        values: {
          ...order.values,
          ...toOrderValueUpdates(updates),
        },
      });
      setOrders((current) => current.map((item) => (item.id === updated.id ? updated : item)));
      if (selectedOrderId === updated.id) {
        setFormState(orderToForm(updated));
      }
    } catch (workflowError) {
      setError(workflowError instanceof Error ? workflowError.message : 'Unable to update order');
    } finally {
      setIsSaving(false);
    }
  };

  const removeOrder = async (order: CollectionRecord) => {
    if (!ordersCollection) return;
    setIsSaving(true);
    setError(null);

    try {
      await deleteCollectionRecord(activeSiteId, ordersCollection.id, order.id);
      setOrders((current) => current.filter((item) => item.id !== order.id));
      if (selectedOrderId === order.id) {
        resetForm();
      }
      setPendingDeleteOrder(null);
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : 'Unable to delete order');
    } finally {
      setIsSaving(false);
    }
  };

  const copyOrdersApiUrl = async (value: string, label: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setNotice(`${label} copied.`);
    } catch {
      setNotice(value);
    }
  };

  return (
    <PageShell
      title="Orders"
      description="Track sales, payment state, fulfillment, and internal order notes from one commerce workspace."
      action={
        <div className="flex flex-wrap items-center gap-2">
          <select
            id="orders-active-site"
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
          <Button onClick={() => void loadOrders()} disabled={isLoading} iconStart={<RefreshCw className={cn('size-4', isLoading && 'animate-spin')} />}>
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

      {ordersCollection && (
        <Panel className="mb-6">
          <PanelHeader
            title="Order API and security"
            description="Internal fulfillment data stays private while custom frontends can talk to the controlled admin endpoint."
            icon={<ShieldCheck className="size-4" />}
            action={
              <div className="flex flex-wrap items-center gap-2">
                <Button onClick={() => void copyOrdersApiUrl(adminOrdersApiUrl, 'Internal orders API URL')} iconStart={<Copy className="size-4" />}>
                  Copy admin API
                </Button>
                <a
                  href={adminOrdersApiUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-border bg-background px-4 py-2 text-sm font-medium transition-colors hover:bg-accent"
                >
                  <ExternalLink className="size-4" />
                  Open admin API
                </a>
              </div>
            }
          />
          <PanelContent>
            <div className="grid gap-4 lg:grid-cols-2">
              <div className="rounded-lg border border-border bg-muted/40 p-3">
                <div className="mb-2 flex items-center gap-2 text-sm font-medium">
                  <Code2 className="size-4" />
                  Internal orders endpoint
                </div>
                <code className="block overflow-x-auto rounded-md bg-background px-3 py-2 font-mono text-xs text-muted-foreground">
                  {adminOrdersApiUrl}
                </code>
              </div>
              <div className="rounded-lg border border-border bg-muted/40 p-3">
                <div className="mb-2 flex items-center gap-2 text-sm font-medium">
                  <ShieldCheck className="size-4" />
                  Public order access
                </div>
                <code className="block overflow-x-auto rounded-md bg-background px-3 py-2 font-mono text-xs text-muted-foreground">
                  {publicOrdersApiUrl}
                </code>
                <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  <span className="rounded-md border border-border bg-background px-2 py-1">
                    publicRead {ordersCollection.permissions.publicRead ? 'enabled' : 'disabled'}
                  </span>
                  <span className="rounded-md border border-border bg-background px-2 py-1">
                    publicCreate {ordersCollection.permissions.publicCreate ? 'enabled' : 'disabled'}
                  </span>
                  <span>Use a server checkout or admin key before writing orders.</span>
                </div>
              </div>
            </div>
          </PanelContent>
        </Panel>
      )}

      <div className="mb-6 grid gap-3 md:grid-cols-3 xl:grid-cols-6">
        <Metric label="Orders" value={metrics.orders} icon={<Receipt className="size-4" />} />
        <Metric label="Paid Revenue" value={formatMoney(metrics.revenue, 'USD')} icon={<CreditCard className="size-4" />} />
        <Metric label="Paid" value={metrics.paid} icon={<CheckCircle2 className="size-4" />} />
        <Metric label="To Fulfill" value={metrics.needsFulfillment} icon={<PackageCheck className="size-4" />} />
        <Metric label="Processing" value={metrics.processing} icon={<Truck className="size-4" />} />
        <Metric label="Refunded" value={metrics.refunded} icon={<RotateCcw className="size-4" />} />
      </div>

      {!ordersCollection ? (
        <EmptyState
          icon={Receipt}
          title="Orders are not set up"
          description="Create an internal orders collection for payment state, fulfillment, customer, and line item data."
          action={
            <Button className="mt-2" onClick={() => void createOrdersCollection()} disabled={isSaving} iconStart={<Sparkles className="size-4" />}>
              {isSaving ? 'Setting up...' : 'Set Up Orders'}
            </Button>
          }
        />
      ) : (
        <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_420px]">
          <Panel>
            <PanelHeader
              title="Order Queue"
              description={`${filteredOrders.length}/${orders.length} visible orders`}
              icon={<ClipboardCheck className="size-4" />}
              action={<Button onClick={resetForm} iconStart={<Plus className="size-4" />}>New Order</Button>}
            />
            <PanelContent>
              <div className="mb-4 flex flex-wrap items-center gap-3">
                <div className="relative min-w-64 flex-1">
                  <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                  <input
                    aria-label="Search orders"
                    value={searchQuery}
                    onChange={(event) => setSearchQuery(event.target.value)}
                    placeholder="Search orders..."
                    className="w-full rounded-lg border bg-background py-2.5 pl-9 pr-3 text-sm"
                  />
                </div>
                <div className="inline-flex flex-wrap items-center gap-1 rounded-lg border border-border bg-muted p-1">
                  {(['all', 'open', 'paid', 'fulfilled', 'cancelled'] as const).map((status) => (
                    <button
                      key={status}
                      type="button"
                      onClick={() => setFilter(status)}
                      className={cn(
                        'rounded-md px-3 py-1.5 text-sm font-medium capitalize text-muted-foreground hover:bg-background hover:text-foreground',
                        filter === status && 'bg-background text-foreground shadow-sm',
                      )}
                    >
                      {status}
                    </button>
                  ))}
                </div>
              </div>

              {filteredOrders.length === 0 ? (
                <div className="rounded-lg border border-dashed border-border px-4 py-10 text-center text-sm text-muted-foreground">
                  No orders match this view.
                </div>
              ) : (
                <div className="grid gap-3">
                  {filteredOrders.map((order) => (
                    <OrderCard
                      key={order.id}
                      order={order}
                      selected={order.id === selectedOrderId}
                      disabled={isSaving}
                      onEdit={() => setSelectedOrderId(order.id)}
                      onPaid={() => void updateOrderWorkflow(order, { orderStatus: 'paid', paymentStatus: 'paid', paidAt: new Date().toISOString() })}
                      onFulfilled={() => void updateOrderWorkflow(order, { orderStatus: 'fulfilled', fulfillmentStatus: 'fulfilled', fulfilledAt: new Date().toISOString() })}
                      onCancelled={() => void updateOrderWorkflow(order, { orderStatus: 'cancelled', fulfillmentStatus: 'cancelled' })}
                      onDelete={() => setPendingDeleteOrder(order)}
                    />
                  ))}
                </div>
              )}
            </PanelContent>
          </Panel>

          <Panel className="xl:sticky xl:top-4 xl:self-start">
            <PanelHeader
              title={selectedOrder ? 'Edit order' : 'New order'}
              description="Customer, item, payment, and fulfillment state."
              icon={<Receipt className="size-4" />}
            />
            <PanelContent>
              <form onSubmit={saveOrder} className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Order number">
                    <input
                      value={formState.orderNumber}
                      onChange={(event) => setFormState((current) => ({ ...current, orderNumber: event.target.value }))}
                      required
                      className="w-full rounded-lg border bg-background px-3 py-2.5 text-sm"
                      placeholder="ORD-1001"
                    />
                  </Field>
                  <Field label="Record status">
                    <select
                      aria-label="Record status"
                      value={formState.recordStatus}
                      onChange={(event) => setFormState((current) => ({ ...current, recordStatus: event.target.value as ContentStatus }))}
                      className="w-full rounded-lg border bg-background px-3 py-2.5 text-sm"
                    >
                      <option value="published">Published</option>
                      <option value="draft">Draft</option>
                      <option value="archived">Archived</option>
                    </select>
                  </Field>
                </div>
                <Field label="Customer">
                  <input
                    value={formState.customerName}
                    onChange={(event) => setFormState((current) => ({ ...current, customerName: event.target.value }))}
                    required
                    className="w-full rounded-lg border bg-background px-3 py-2.5 text-sm"
                    placeholder="Jane Customer"
                  />
                </Field>
                <Field label="Email">
                  <input
                    type="email"
                    value={formState.email}
                    onChange={(event) => setFormState((current) => ({ ...current, email: event.target.value }))}
                    required
                    className="w-full rounded-lg border bg-background px-3 py-2.5 text-sm"
                    placeholder="jane@example.com"
                  />
                </Field>
                <Field label="Phone">
                  <input
                    value={formState.phone}
                    onChange={(event) => setFormState((current) => ({ ...current, phone: event.target.value }))}
                    className="w-full rounded-lg border bg-background px-3 py-2.5 text-sm"
                    placeholder="+1 312 555 0194"
                  />
                </Field>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Total">
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={formState.total}
                      onChange={(event) => setFormState((current) => ({ ...current, total: event.target.value }))}
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
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <Field label="Provider">
                    <input
                      value={formState.paymentProvider}
                      onChange={(event) => setFormState((current) => ({ ...current, paymentProvider: event.target.value }))}
                      className="w-full rounded-lg border bg-background px-3 py-2.5 text-sm"
                      placeholder="stripe"
                    />
                  </Field>
                  <Field label="Payment ref">
                    <input
                      value={formState.paymentReference}
                      onChange={(event) => setFormState((current) => ({ ...current, paymentReference: event.target.value }))}
                      className="w-full rounded-lg border bg-background px-3 py-2.5 text-sm"
                      placeholder="pi_..."
                    />
                  </Field>
                  <Field label="Paid at">
                    <input
                      type="datetime-local"
                      value={toDateTimeLocalValue(formState.paidAt)}
                      onChange={(event) => setFormState((current) => ({ ...current, paidAt: fromDateTimeLocalValue(event.target.value) || '' }))}
                      className="w-full rounded-lg border bg-background px-3 py-2.5 text-sm"
                    />
                  </Field>
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <Field label="Order">
                    <select
                      aria-label="Order status"
                      value={formState.orderStatus}
                      onChange={(event) => setFormState((current) => ({ ...current, orderStatus: event.target.value as OrderWorkflowStatus }))}
                      className="w-full rounded-lg border bg-background px-3 py-2.5 text-sm"
                    >
                      <option value="open">Open</option>
                      <option value="paid">Paid</option>
                      <option value="fulfilled">Fulfilled</option>
                      <option value="cancelled">Cancelled</option>
                      <option value="refunded">Refunded</option>
                    </select>
                  </Field>
                  <Field label="Payment">
                    <select
                      aria-label="Payment status"
                      value={formState.paymentStatus}
                      onChange={(event) => setFormState((current) => ({ ...current, paymentStatus: event.target.value as PaymentStatus }))}
                      className="w-full rounded-lg border bg-background px-3 py-2.5 text-sm"
                    >
                      <option value="pending">Pending</option>
                      <option value="paid">Paid</option>
                      <option value="failed">Failed</option>
                      <option value="refunded">Refunded</option>
                    </select>
                  </Field>
                  <Field label="Fulfillment">
                    <select
                      aria-label="Fulfillment status"
                      value={formState.fulfillmentStatus}
                      onChange={(event) => setFormState((current) => ({ ...current, fulfillmentStatus: event.target.value as FulfillmentStatus }))}
                      className="w-full rounded-lg border bg-background px-3 py-2.5 text-sm"
                    >
                      <option value="unfulfilled">Unfulfilled</option>
                      <option value="processing">Processing</option>
                      <option value="fulfilled">Fulfilled</option>
                      <option value="cancelled">Cancelled</option>
                    </select>
                  </Field>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Carrier">
                    <input
                      value={formState.fulfillmentCarrier}
                      onChange={(event) => setFormState((current) => ({ ...current, fulfillmentCarrier: event.target.value }))}
                      className="w-full rounded-lg border bg-background px-3 py-2.5 text-sm"
                      placeholder="UPS, FedEx, digital"
                    />
                  </Field>
                  <Field label="Tracking number">
                    <input
                      value={formState.trackingNumber}
                      onChange={(event) => setFormState((current) => ({ ...current, trackingNumber: event.target.value }))}
                      className="w-full rounded-lg border bg-background px-3 py-2.5 text-sm"
                      placeholder="1Z..."
                    />
                  </Field>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Tracking URL">
                    <input
                      value={formState.trackingUrl}
                      onChange={(event) => setFormState((current) => ({ ...current, trackingUrl: event.target.value }))}
                      className="w-full rounded-lg border bg-background px-3 py-2.5 text-sm"
                      placeholder="https://carrier.example/track"
                    />
                  </Field>
                  <Field label="Fulfilled at">
                    <input
                      type="datetime-local"
                      value={toDateTimeLocalValue(formState.fulfilledAt)}
                      onChange={(event) => setFormState((current) => ({ ...current, fulfilledAt: fromDateTimeLocalValue(event.target.value) || '' }))}
                      className="w-full rounded-lg border bg-background px-3 py-2.5 text-sm"
                    />
                  </Field>
                </div>
                <Field label="Items">
                  <textarea
                    value={formState.items}
                    onChange={(event) => setFormState((current) => ({ ...current, items: event.target.value }))}
                    rows={3}
                    required
                    className="w-full resize-none rounded-lg border bg-background px-3 py-2.5 text-sm"
                    placeholder="Starter Site Template x1"
                  />
                </Field>
                <Field label="Shipping address">
                  <textarea
                    value={formState.shippingAddress}
                    onChange={(event) => setFormState((current) => ({ ...current, shippingAddress: event.target.value }))}
                    rows={3}
                    className="w-full resize-none rounded-lg border bg-background px-3 py-2.5 text-sm"
                    placeholder="Delivery or billing address"
                  />
                </Field>
                <Field label="Billing address">
                  <textarea
                    value={formState.billingAddress}
                    onChange={(event) => setFormState((current) => ({ ...current, billingAddress: event.target.value }))}
                    rows={3}
                    className="w-full resize-none rounded-lg border bg-background px-3 py-2.5 text-sm"
                    placeholder="Billing address or tax location"
                  />
                </Field>
                <Field label="Notes">
                  <textarea
                    value={formState.notes}
                    onChange={(event) => setFormState((current) => ({ ...current, notes: event.target.value }))}
                    rows={3}
                    className="w-full resize-none rounded-lg border bg-background px-3 py-2.5 text-sm"
                    placeholder="Private fulfillment notes..."
                  />
                </Field>
                <div className="grid grid-cols-[160px_minmax(0,1fr)] gap-3">
                  <Field label="Refund amount">
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={formState.refundAmount}
                      onChange={(event) => setFormState((current) => ({ ...current, refundAmount: event.target.value }))}
                      className="w-full rounded-lg border bg-background px-3 py-2.5 text-sm"
                      placeholder="0.00"
                    />
                  </Field>
                  <Field label="Refund reason">
                    <input
                      value={formState.refundReason}
                      onChange={(event) => setFormState((current) => ({ ...current, refundReason: event.target.value }))}
                      className="w-full rounded-lg border bg-background px-3 py-2.5 text-sm"
                      placeholder="Optional private refund note"
                    />
                  </Field>
                </div>
                <div className="flex justify-end gap-2 pt-2">
                  <Button variant="outline" onClick={resetForm}>Clear</Button>
                  <Button type="submit" variant="primary" disabled={isSaving || !formState.orderNumber.trim() || !formState.customerName.trim() || !formState.email.trim()} iconStart={<Receipt className="size-4" />}>
                    {isSaving ? 'Saving...' : selectedOrder ? 'Save Order' : 'Create Order'}
                  </Button>
                </div>
              </form>
            </PanelContent>
          </Panel>
        </div>
      )}

      {pendingDeleteOrder && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 px-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-lg border border-border bg-card p-5 shadow-xl">
            <div className="flex items-start gap-3">
              <span className="rounded-lg bg-red-50 p-2 text-red-600">
                <Trash2 className="h-5 w-5" />
              </span>
              <div>
                <h2 className="text-lg font-semibold text-foreground">
                  Delete {String(readOrderValue(pendingDeleteOrder.values, 'ordernumber', pendingDeleteOrder.slug))}?
                </h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  This permanently removes the order record from Backy. Keep it archived if you need the sale history for reporting.
                </p>
              </div>
            </div>
            <div className="mt-4 rounded-lg bg-muted px-3 py-2 text-xs text-muted-foreground">
              Customer: <span className="font-medium text-foreground">{String(readOrderValue(pendingDeleteOrder.values, 'customername', 'Unknown customer'))}</span>
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setPendingDeleteOrder(null)}
                className="rounded-lg border border-border px-4 py-2 text-sm font-medium transition-colors hover:bg-accent"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void removeOrder(pendingDeleteOrder)}
                disabled={isSaving}
                className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-red-700 disabled:opacity-60"
              >
                Delete order
              </button>
            </div>
          </div>
        </div>
      )}
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

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block space-y-2">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}

function OrderCard({
  order,
  selected,
  disabled,
  onEdit,
  onPaid,
  onFulfilled,
  onCancelled,
  onDelete,
}: {
  order: CollectionRecord;
  selected: boolean;
  disabled: boolean;
  onEdit: () => void;
  onPaid: () => void;
  onFulfilled: () => void;
  onCancelled: () => void;
  onDelete: () => void;
}) {
  const values = order.values;
  const total = toNumber(values.total);
  const currency = normalizeCurrency(String(values.currency || 'USD'));
  const paymentStatus = String(readOrderValue(values, 'paymentstatus', 'pending'));
  const fulfillmentStatus = String(readOrderValue(values, 'fulfillmentstatus', 'unfulfilled'));
  const orderStatus = String(readOrderValue(values, 'orderstatus', 'open'));
  const trackingNumber = String(readOrderValue(values, 'trackingnumber', ''));
  const trackingUrl = String(readOrderValue(values, 'trackingurl', ''));
  const paymentReference = String(readOrderValue(values, 'paymentreference', ''));
  const paidAt = String(readOrderValue(values, 'paidat', ''));
  const fulfilledAt = String(readOrderValue(values, 'fulfilledat', ''));
  const refundAmount = toNumber(readOrderValue(values, 'refundamount', 0));

  return (
    <article className={cn('rounded-lg border bg-background p-4 transition-colors', selected ? 'border-primary ring-2 ring-primary/10' : 'border-border')}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-semibold">{String(readOrderValue(values, 'ordernumber', order.slug))}</h3>
            <StatusBadge status={order.status} />
          </div>
          <div className="mt-1 text-sm text-muted-foreground">
            {String(readOrderValue(values, 'customername', 'Unknown customer'))} · {String(values.email || 'No email')}
          </div>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {paymentReference ? (
              <span className="rounded-md border border-border bg-muted px-2 py-1 text-[11px] font-medium text-muted-foreground">
                Ref {paymentReference}
              </span>
            ) : null}
            {trackingNumber ? (
              <span className="rounded-md border border-border bg-muted px-2 py-1 text-[11px] font-medium text-muted-foreground">
                Track {trackingNumber}
              </span>
            ) : null}
            {refundAmount > 0 ? (
              <span className="rounded-md border border-amber-200 bg-amber-50 px-2 py-1 text-[11px] font-medium text-amber-800">
                Refund {formatMoney(refundAmount, currency)}
              </span>
            ) : null}
          </div>
        </div>
        <div className="text-right">
          <div className="font-mono text-lg font-semibold">{formatMoney(total, currency)}</div>
          <div className="text-xs text-muted-foreground">{order.updatedAt ? formatDate(order.updatedAt) : 'Now'}</div>
        </div>
      </div>
      <div className="mt-4 grid gap-2 text-sm sm:grid-cols-3">
        <StatePill label="Order" value={orderStatus} />
        <StatePill label="Payment" value={paymentStatus} />
        <StatePill label="Fulfillment" value={fulfillmentStatus} />
      </div>
      {values.items ? (
        <p className="mt-3 line-clamp-2 text-sm text-muted-foreground">
          {String(values.items)}
        </p>
      ) : null}
      {(paidAt || fulfilledAt || trackingUrl) && (
        <div className="mt-3 grid gap-2 text-xs text-muted-foreground sm:grid-cols-3">
          {paidAt ? (
            <div className="rounded border border-border bg-muted/40 px-2 py-1.5">
              <Clock3 className="mr-1 inline size-3.5" />
              Paid {formatWorkflowDate(paidAt)}
            </div>
          ) : null}
          {fulfilledAt ? (
            <div className="rounded border border-border bg-muted/40 px-2 py-1.5">
              <PackageCheck className="mr-1 inline size-3.5" />
              Fulfilled {formatWorkflowDate(fulfilledAt)}
            </div>
          ) : null}
          {trackingUrl ? (
            <a
              href={trackingUrl}
              target="_blank"
              rel="noreferrer"
              className="rounded border border-border bg-muted/40 px-2 py-1.5 hover:bg-muted hover:text-foreground"
            >
              <ExternalLink className="mr-1 inline size-3.5" />
              Tracking link
            </a>
          ) : null}
        </div>
      )}
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <Button size="sm" onClick={onEdit} iconStart={<Receipt className="size-4" />}>Edit</Button>
        <Button size="sm" variant="outline" onClick={onPaid} disabled={disabled || paymentStatus === 'paid'} iconStart={<CreditCard className="size-4" />}>Mark Paid</Button>
        <Button size="sm" variant="outline" onClick={onFulfilled} disabled={disabled || fulfillmentStatus === 'fulfilled'} iconStart={<PackageCheck className="size-4" />}>Fulfill</Button>
        <Button size="sm" variant="outline" onClick={onCancelled} disabled={disabled || orderStatus === 'cancelled'} iconStart={<Archive className="size-4" />}>Cancel</Button>
        <Button size="sm" variant="danger" onClick={onDelete} disabled={disabled} iconStart={<Trash2 className="size-4" />}>Delete</Button>
      </div>
    </article>
  );
}

function StatePill({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded bg-muted px-3 py-2">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="font-medium capitalize">{value.replace('-', ' ')}</div>
    </div>
  );
}

const getEnvValue = (key: string): string => {
  const env = (import.meta as unknown as { env?: Record<string, string | undefined> }).env ?? {};
  return env[key]?.trim() ?? '';
};

const getPublicBaseUrl = (): string => {
  const envBase = (
    getEnvValue('VITE_BACKY_PUBLIC_API_BASE_URL') ||
    getEnvValue('VITE_PUBLIC_API_URL') ||
    getEnvValue('VITE_API_BASE_URL') ||
    ''
  ).trim();

  if (!envBase && typeof window !== 'undefined' && window.location.port === '5173') {
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

const asOrderStatus = (value: unknown): OrderWorkflowStatus => (
  ['open', 'paid', 'fulfilled', 'cancelled', 'refunded'].includes(String(value))
    ? String(value) as OrderWorkflowStatus
    : 'open'
);

const asPaymentStatus = (value: unknown): PaymentStatus => (
  ['pending', 'paid', 'failed', 'refunded'].includes(String(value))
    ? String(value) as PaymentStatus
    : 'pending'
);

const asFulfillmentStatus = (value: unknown): FulfillmentStatus => (
  ['unfulfilled', 'processing', 'fulfilled', 'cancelled'].includes(String(value))
    ? String(value) as FulfillmentStatus
    : 'unfulfilled'
);

const readOrderValue = (
  values: Record<string, unknown>,
  normalizedKey: string,
  fallback: unknown,
): unknown => (
  values[normalizedKey] ?? values[camelizeOrderKey(normalizedKey)] ?? fallback
);

const camelizeOrderKey = (key: string): string => {
  if (key === 'ordernumber') return 'orderNumber';
  if (key === 'customername') return 'customerName';
  if (key === 'orderstatus') return 'orderStatus';
  if (key === 'paymentstatus') return 'paymentStatus';
  if (key === 'paymentprovider') return 'paymentProvider';
  if (key === 'paymentreference') return 'paymentReference';
  if (key === 'paidat') return 'paidAt';
  if (key === 'fulfillmentstatus') return 'fulfillmentStatus';
  if (key === 'fulfillmentcarrier') return 'fulfillmentCarrier';
  if (key === 'trackingnumber') return 'trackingNumber';
  if (key === 'trackingurl') return 'trackingUrl';
  if (key === 'fulfilledat') return 'fulfilledAt';
  if (key === 'shippingaddress') return 'shippingAddress';
  if (key === 'billingaddress') return 'billingAddress';
  if (key === 'refundamount') return 'refundAmount';
  if (key === 'refundreason') return 'refundReason';
  return key;
};

const toOrderValueUpdates = (updates: Partial<OrderFormState>): Record<string, unknown> => ({
  ...(updates.orderStatus ? { orderstatus: updates.orderStatus } : {}),
  ...(updates.paymentStatus ? { paymentstatus: updates.paymentStatus } : {}),
  ...(updates.paymentProvider !== undefined ? { paymentprovider: updates.paymentProvider } : {}),
  ...(updates.paymentReference !== undefined ? { paymentreference: updates.paymentReference } : {}),
  ...(updates.paidAt !== undefined ? { paidat: updates.paidAt || null } : {}),
  ...(updates.fulfillmentStatus ? { fulfillmentstatus: updates.fulfillmentStatus } : {}),
  ...(updates.fulfillmentCarrier !== undefined ? { fulfillmentcarrier: updates.fulfillmentCarrier } : {}),
  ...(updates.trackingNumber !== undefined ? { trackingnumber: updates.trackingNumber } : {}),
  ...(updates.trackingUrl !== undefined ? { trackingurl: updates.trackingUrl } : {}),
  ...(updates.fulfilledAt !== undefined ? { fulfilledat: updates.fulfilledAt || null } : {}),
  ...(updates.refundAmount !== undefined ? { refundamount: updates.refundAmount ? Number(updates.refundAmount) : null } : {}),
  ...(updates.refundReason !== undefined ? { refundreason: updates.refundReason } : {}),
});

const orderToForm = (order: CollectionRecord): OrderFormState => ({
  orderNumber: String(readOrderValue(order.values, 'ordernumber', '')),
  customerName: String(readOrderValue(order.values, 'customername', '')),
  email: String(order.values.email || ''),
  phone: String(readOrderValue(order.values, 'phone', '')),
  total: String(order.values.total ?? ''),
  currency: String(order.values.currency || 'USD'),
  items: String(order.values.items || ''),
  orderStatus: asOrderStatus(readOrderValue(order.values, 'orderstatus', undefined)),
  paymentStatus: asPaymentStatus(readOrderValue(order.values, 'paymentstatus', undefined)),
  paymentProvider: String(readOrderValue(order.values, 'paymentprovider', '')),
  paymentReference: String(readOrderValue(order.values, 'paymentreference', '')),
  paidAt: String(readOrderValue(order.values, 'paidat', '') || ''),
  fulfillmentStatus: asFulfillmentStatus(readOrderValue(order.values, 'fulfillmentstatus', undefined)),
  fulfillmentCarrier: String(readOrderValue(order.values, 'fulfillmentcarrier', '')),
  trackingNumber: String(readOrderValue(order.values, 'trackingnumber', '')),
  trackingUrl: String(readOrderValue(order.values, 'trackingurl', '')),
  fulfilledAt: String(readOrderValue(order.values, 'fulfilledat', '') || ''),
  shippingAddress: String(readOrderValue(order.values, 'shippingaddress', '')),
  billingAddress: String(readOrderValue(order.values, 'billingaddress', '')),
  refundAmount: readOrderValue(order.values, 'refundamount', null) === null || readOrderValue(order.values, 'refundamount', undefined) === undefined
    ? ''
    : String(readOrderValue(order.values, 'refundamount', '')),
  refundReason: String(readOrderValue(order.values, 'refundreason', '')),
  notes: String(order.values.notes || ''),
  recordStatus: order.status,
});

const formatWorkflowDate = (value: string): string => {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString();
};
