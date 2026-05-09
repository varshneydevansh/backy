import { FormEvent, type ReactNode, useEffect, useMemo, useState } from 'react';
import { createFileRoute, useNavigate } from '@tanstack/react-router';
import {
  AlertTriangle,
  Archive,
  CheckCircle2,
  ClipboardCheck,
  Code2,
  Copy,
  CreditCard,
  Download,
  Clock3,
  ExternalLink,
  PackageCheck,
  Plus,
  Receipt,
  RefreshCw,
  RotateCcw,
  Search,
  ShieldCheck,
  ShoppingCart,
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
import { getSiteSelectionFromSearch, siteMatchesIdentifier } from '@/lib/siteSelection';
import { cn, formatDate } from '@/lib/utils';
import { fromDateTimeLocalValue, toDateTimeLocalValue } from '@/lib/dateTime';

const ORDER_CONTROL_AREAS = [
  {
    title: 'Site scope',
    detail: 'Choose the website whose private order queue is being managed.',
    href: '#orders-site',
  },
  {
    title: 'Order APIs',
    detail: 'Public checkout intake plus private admin list, payment, fulfillment, and refund endpoints.',
    href: '#orders-api',
  },
  {
    title: 'Order health',
    detail: 'Revenue, paid orders, fulfillment queue, processing, and refunds.',
    href: '#orders-metrics',
  },
  {
    title: 'Order queue',
    detail: 'Search, filter, mark paid, fulfill, cancel, edit, and delete records.',
    href: '#orders-queue',
  },
  {
    title: 'Order editor',
    detail: 'Customer, items, payment, fulfillment, tracking, refunds, and notes.',
    href: '#orders-editor',
  },
] as const;

type OrderFilter = 'all' | 'open' | 'paid' | 'fulfilled' | 'cancelled';
type OrderWorkflowStatus = 'open' | 'paid' | 'fulfilled' | 'cancelled' | 'refunded';
type PaymentStatus = 'pending' | 'paid' | 'failed' | 'refunded';
type FulfillmentStatus = 'unfulfilled' | 'processing' | 'fulfilled' | 'cancelled';
type OrderSource = 'web' | 'manual' | 'api' | 'import' | 'pos';
type PaymentStatusFilter = PaymentStatus | 'all';
type FulfillmentStatusFilter = FulfillmentStatus | 'all';
type OrderSourceFilter = OrderSource | 'all';

interface OrdersSearch {
  siteId?: string;
  workflow?: OrderFilter;
  payment?: PaymentStatusFilter;
  fulfillment?: FulfillmentStatusFilter;
  source?: OrderSourceFilter;
  q?: string;
  orderId?: string;
}

interface OrderLineItemDraft {
  title: string;
  sku: string;
  variant: string;
  quantity: string;
  price: string;
}

interface OrderLineItem {
  id: string;
  productId: string;
  slug: string;
  title: string;
  sku: string;
  variantTitle: string;
  variantOption: string;
  variantSku: string;
  quantity: number;
  price: number;
  currency: string;
  lineTotal: number;
}

interface OrderFormState {
  orderNumber: string;
  customerName: string;
  email: string;
  phone: string;
  total: string;
  subtotal: string;
  taxAmount: string;
  shippingAmount: string;
  discountAmount: string;
  currency: string;
  items: string;
  orderSource: OrderSource;
  checkoutSessionId: string;
  customerId: string;
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
const ORDER_FILTERS: OrderFilter[] = ['all', 'open', 'paid', 'fulfilled', 'cancelled'];
const PAYMENT_STATUS_FILTERS: PaymentStatusFilter[] = ['all', 'pending', 'paid', 'failed', 'refunded'];
const FULFILLMENT_STATUS_FILTERS: FulfillmentStatusFilter[] = ['all', 'unfulfilled', 'processing', 'fulfilled', 'cancelled'];
const ORDER_SOURCE_FILTERS: OrderSourceFilter[] = ['all', 'web', 'manual', 'api', 'import', 'pos'];

const isOrderFilter = (value: unknown): value is OrderFilter => (
  typeof value === 'string' && ORDER_FILTERS.includes(value as OrderFilter)
);

const isPaymentStatusFilter = (value: unknown): value is PaymentStatusFilter => (
  typeof value === 'string' && PAYMENT_STATUS_FILTERS.includes(value as PaymentStatusFilter)
);

const isFulfillmentStatusFilter = (value: unknown): value is FulfillmentStatusFilter => (
  typeof value === 'string' && FULFILLMENT_STATUS_FILTERS.includes(value as FulfillmentStatusFilter)
);

const isOrderSourceFilter = (value: unknown): value is OrderSourceFilter => (
  typeof value === 'string' && ORDER_SOURCE_FILTERS.includes(value as OrderSourceFilter)
);

const normalizedSearchString = (value: unknown): string | undefined => {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
};

export const Route = createFileRoute('/orders')({
  validateSearch: (search: Record<string, unknown>): OrdersSearch => ({
    siteId: normalizedSearchString(search.siteId),
    workflow: isOrderFilter(search.workflow) ? search.workflow : undefined,
    payment: isPaymentStatusFilter(search.payment) ? search.payment : undefined,
    fulfillment: isFulfillmentStatusFilter(search.fulfillment) ? search.fulfillment : undefined,
    source: isOrderSourceFilter(search.source) ? search.source : undefined,
    q: normalizedSearchString(search.q),
    orderId: normalizedSearchString(search.orderId),
  }),
  component: OrdersRoute,
});

const ORDER_FIELDS: CollectionField[] = [
  { key: 'ordernumber', label: 'Order Number', type: 'text', required: true, unique: true, sortOrder: 10 },
  { key: 'customername', label: 'Customer Name', type: 'text', required: true, unique: false, sortOrder: 20 },
  { key: 'email', label: 'Email', type: 'email', required: true, unique: false, sortOrder: 30 },
  { key: 'phone', label: 'Phone', type: 'text', required: false, unique: false, sortOrder: 40 },
  { key: 'total', label: 'Total', type: 'number', required: true, unique: false, sortOrder: 50 },
  { key: 'subtotal', label: 'Subtotal', type: 'number', required: false, unique: false, sortOrder: 55 },
  { key: 'taxamount', label: 'Tax Amount', type: 'number', required: false, unique: false, sortOrder: 56 },
  { key: 'shippingamount', label: 'Shipping Amount', type: 'number', required: false, unique: false, sortOrder: 57 },
  { key: 'discountamount', label: 'Discount Amount', type: 'number', required: false, unique: false, sortOrder: 58 },
  { key: 'currency', label: 'Currency', type: 'text', required: true, unique: false, sortOrder: 60, defaultValue: 'USD' },
  { key: 'items', label: 'Items', type: 'richText', required: true, unique: false, sortOrder: 70 },
  { key: 'ordersource', label: 'Order Source', type: 'select', required: false, unique: false, sortOrder: 75, options: ['web', 'manual', 'api', 'import', 'pos'], defaultValue: 'web' },
  { key: 'checkoutsessionid', label: 'Checkout Session ID', type: 'text', required: false, unique: false, sortOrder: 76 },
  { key: 'customerid', label: 'Customer ID', type: 'text', required: false, unique: false, sortOrder: 77 },
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

const ORDER_EXPORT_COLUMNS = [
  'order_id',
  'active_site_id',
  'slug',
  'record_status',
  'order_number',
  'customer_name',
  'email',
  'phone',
  'total',
  'subtotal',
  'tax_amount',
  'shipping_amount',
  'discount_amount',
  'currency',
  'items',
  'line_item_count',
  'order_source',
  'checkout_session_id',
  'customer_id',
  'order_status',
  'payment_status',
  'payment_provider',
  'payment_reference',
  'paid_at',
  'fulfillment_status',
  'fulfillment_carrier',
  'tracking_number',
  'tracking_url',
  'fulfilled_at',
  'shipping_address',
  'billing_address',
  'refund_amount',
  'refund_reason',
  'notes',
  'admin_order_url',
  'public_blocked_url',
  'admin_only',
  'backend_systems',
  'created_at',
  'updated_at',
] as const;

const ORDER_BACKEND_SYSTEMS = [
  {
    key: 'capture',
    title: 'Order capture',
    detail: 'Checkout, manual, API, import, and POS records normalize into a private Backy order collection.',
  },
  {
    key: 'payment',
    title: 'Payment reconciliation',
    detail: 'Payment status, provider, reference, checkout session, paid time, refunds, and accounting export fields.',
  },
  {
    key: 'fulfillment',
    title: 'Fulfillment operations',
    detail: 'Processing state, carrier, tracking number, tracking URL, fulfilled time, and cancellation flow.',
  },
  {
    key: 'customer',
    title: 'Customer support',
    detail: 'Customer name, email, phone, customer ID, billing/shipping addresses, and private order notes.',
  },
  {
    key: 'security',
    title: 'Private queue security',
    detail: 'Raw orders stay admin-only; checkout intake writes private records without exposing customer data.',
  },
  {
    key: 'reporting',
    title: 'Operations reporting',
    detail: 'Revenue, paid orders, refunds, fulfillment queue, processing count, and CSV exports.',
  },
] as const;

const EMPTY_ORDER_FORM: OrderFormState = {
  orderNumber: '',
  customerName: '',
  email: '',
  phone: '',
  total: '',
  subtotal: '',
  taxAmount: '',
  shippingAmount: '',
  discountAmount: '',
  currency: 'USD',
  items: '',
  orderSource: 'web',
  checkoutSessionId: '',
  customerId: '',
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
  const navigate = useNavigate();
  const routeSearch = Route.useSearch();
  const [selectedSiteId, setSelectedSiteId] = useState(() => routeSearch.siteId || getSiteSelectionFromSearch(sites));
  const [ordersCollection, setOrdersCollection] = useState<Collection | null>(null);
  const [orders, setOrders] = useState<CollectionRecord[]>([]);
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(routeSearch.orderId || null);
  const [formState, setFormState] = useState<OrderFormState>(EMPTY_ORDER_FORM);
  const [itemDraft, setItemDraft] = useState<OrderLineItemDraft>({
    title: '',
    sku: '',
    variant: '',
    quantity: '1',
    price: '',
  });
  const [filter, setFilter] = useState<OrderFilter>(routeSearch.workflow || 'all');
  const [paymentFilter, setPaymentFilter] = useState<PaymentStatusFilter>(routeSearch.payment || 'all');
  const [fulfillmentFilter, setFulfillmentFilter] = useState<FulfillmentStatusFilter>(routeSearch.fulfillment || 'all');
  const [sourceFilter, setSourceFilter] = useState<OrderSourceFilter>(routeSearch.source || 'all');
  const [searchQuery, setSearchQuery] = useState(routeSearch.q || '');
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const isOrdersBusy = isLoading || isSaving;
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [pendingDeleteOrder, setPendingDeleteOrder] = useState<CollectionRecord | null>(null);

  const activeSite = useMemo(
    () => sites.find((site) => siteMatchesIdentifier(site, selectedSiteId)) || sites[0],
    [selectedSiteId, sites],
  );
  const activeSiteId = activeSite?.publicSiteId || activeSite?.id || selectedSiteId || 'site-demo';
  const activeSiteSearch = useMemo(() => ({ siteId: activeSiteId }), [activeSiteId]);
  const publicBaseUrl = useMemo(() => getPublicBaseUrl(), []);
  const adminOrdersApiUrl = ordersCollection
    ? `${publicBaseUrl}/api/admin/sites/${encodeURIComponent(activeSiteId)}/collections/${encodeURIComponent(ordersCollection.id)}/records`
    : '';
  const adminOrderDetailApiUrl = ordersCollection
    ? `${publicBaseUrl}/api/admin/sites/${encodeURIComponent(activeSiteId)}/collections/${encodeURIComponent(ordersCollection.id)}/records/{orderId}`
    : '';
  const publicOrdersApiUrl = `${publicBaseUrl}/api/sites/${encodeURIComponent(activeSiteId)}/collections/${ORDERS_COLLECTION_SLUG}/records`;
  const publicOrderIntakeUrl = `${publicBaseUrl}/api/sites/${encodeURIComponent(activeSiteId)}/commerce/orders`;
  const missingOrderFields = useMemo(() => (
    ordersCollection ? getMissingOrderFieldKeys(ordersCollection) : []
  ), [ordersCollection]);
  const ordersApiReady = Boolean(
    ordersCollection?.status === 'published' &&
    !ordersCollection.permissions.publicRead &&
    !ordersCollection.permissions.publicCreate &&
    missingOrderFields.length === 0,
  );
  const selectedOrder = useMemo(
    () => orders.find((order) => order.id === selectedOrderId) || null,
    [orders, selectedOrderId],
  );
  const orderLineItems = useMemo(() => parseOrderLineItems(formState.items, formState.currency), [formState.currency, formState.items]);
  const orderLineItemSubtotal = useMemo(
    () => moneyValue(orderLineItems.reduce((sum, item) => sum + item.lineTotal, 0)),
    [orderLineItems],
  );
  const orderLineItemQuantity = useMemo(
    () => orderLineItems.reduce((sum, item) => sum + item.quantity, 0),
    [orderLineItems],
  );
  const hasActiveOrderFilters = Boolean(
    searchQuery.trim() ||
    filter !== 'all' ||
    paymentFilter !== 'all' ||
    fulfillmentFilter !== 'all' ||
    sourceFilter !== 'all',
  );
  const filteredOrders = useMemo(() => {
    const normalizedSearch = searchQuery.trim().toLowerCase();

    return orders.filter((order) => {
      const values = order.values;
      const orderStatus = String(readOrderValue(values, 'orderstatus', 'open'));
      const paymentStatus = String(readOrderValue(values, 'paymentstatus', 'pending'));
      const fulfillmentStatus = String(readOrderValue(values, 'fulfillmentstatus', 'unfulfilled'));
      const orderSource = String(readOrderValue(values, 'ordersource', 'web'));
      const matchesFilter = filter === 'all'
        || (filter === 'paid' ? paymentStatus === 'paid' : filter === 'fulfilled' ? fulfillmentStatus === 'fulfilled' : orderStatus === filter);
      if (!matchesFilter) return false;
      if (paymentFilter !== 'all' && paymentStatus !== paymentFilter) return false;
      if (fulfillmentFilter !== 'all' && fulfillmentStatus !== fulfillmentFilter) return false;
      if (sourceFilter !== 'all' && orderSource !== sourceFilter) return false;

      const matchesSearch = !normalizedSearch || [
        order.slug,
        readOrderValue(values, 'ordernumber', ''),
        readOrderValue(values, 'customername', ''),
        values.email,
        readOrderValue(values, 'phone', ''),
        readOrderValue(values, 'ordersource', ''),
        readOrderValue(values, 'checkoutsessionid', ''),
        readOrderValue(values, 'customerid', ''),
        readOrderValue(values, 'paymentreference', ''),
        readOrderValue(values, 'trackingnumber', ''),
        values.items,
        formatOrderItemSummary(values.items, String(values.currency || 'USD')),
      ].some((value) => String(value || '').toLowerCase().includes(normalizedSearch));

      return matchesSearch;
    });
  }, [filter, fulfillmentFilter, orders, paymentFilter, searchQuery, sourceFilter]);
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
  const orderReadiness = useMemo(() => {
    const hasSchema = Boolean(ordersCollection);
    const hasOrders = orders.length > 0;
    const hasPaid = metrics.paid > 0;
    const hasFulfillmentWorkflow = metrics.needsFulfillment > 0 || metrics.processing > 0 || orders.some((order) => (
      String(readOrderValue(order.values, 'fulfillmentstatus', '')) === 'fulfilled'
    ));
    const hasCustomerData = orders.some((order) => Boolean(readOrderValue(order.values, 'customername', '') && order.values.email));
    const hasPaymentData = orders.some((order) => Boolean(readOrderValue(order.values, 'paymentreference', '') || readOrderValue(order.values, 'paymentprovider', '')));
    const hasStructuredItems = orders.some((order) => parseOrderLineItems(order.values.items, String(order.values.currency || 'USD')).length > 0);
    const checks = [
      {
        label: 'Orders schema',
        detail: hasSchema ? 'Orders collection exists.' : 'Set up the private orders collection.',
        ready: hasSchema,
      },
      {
        label: 'Private fields',
        detail: missingOrderFields.length === 0
          ? 'Payment, fulfillment, tracking, refund, address, and notes fields are present.'
          : `${missingOrderFields.length} field${missingOrderFields.length === 1 ? '' : 's'} need sync.`,
        ready: hasSchema && missingOrderFields.length === 0,
      },
      {
        label: 'API security',
        detail: ordersApiReady ? 'Order records are private and admin controlled.' : 'Sync schema and keep public order access disabled.',
        ready: ordersApiReady,
      },
      {
        label: 'Order queue',
        detail: hasOrders ? `${orders.length} order${orders.length === 1 ? '' : 's'} recorded.` : 'Record or import the first order.',
        ready: hasOrders,
      },
      {
        label: 'Payment state',
        detail: hasPaid ? `${metrics.paid} paid order${metrics.paid === 1 ? '' : 's'} tracked.` : 'Mark payments as paid after checkout confirms them.',
        ready: hasPaid,
      },
      {
        label: 'Fulfillment',
        detail: hasFulfillmentWorkflow ? `${metrics.needsFulfillment} need fulfillment, ${metrics.processing} processing.` : 'Add processing or fulfilled states as orders move.',
        ready: hasFulfillmentWorkflow || !hasOrders,
      },
      {
        label: 'Customer data',
        detail: hasCustomerData ? 'Customer names and emails are present.' : 'Capture customer contact data for order support.',
        ready: hasCustomerData || !hasOrders,
      },
      {
        label: 'Line items',
        detail: hasStructuredItems ? 'Product and variant line items can be reviewed without reading raw JSON.' : 'Capture structured product line items from checkout or manual entry.',
        ready: hasStructuredItems || !hasOrders,
      },
      {
        label: 'Payment references',
        detail: hasPaymentData ? 'Payment provider references are connected.' : 'Attach payment provider/reference data for reconciliation.',
        ready: hasPaymentData || !hasOrders,
      },
    ];
    const readyCount = checks.filter((check) => check.ready).length;

    return {
      score: Math.round((readyCount / checks.length) * 100),
      checks,
      workflow: [
        { label: 'Capture', detail: 'Create the private order record from checkout, manual entry, or a server-side integration.' },
        { label: 'Verify', detail: 'Track customer, line items, payment status, provider reference, and paid timestamp.' },
        { label: 'Fulfill', detail: 'Move orders through processing, carrier, tracking, fulfilled date, or digital delivery notes.' },
        { label: 'Resolve', detail: 'Handle cancellations, refunds, internal notes, and private reporting without exposing order data publicly.' },
      ],
    };
  }, [
    metrics.needsFulfillment,
    metrics.paid,
    metrics.processing,
    missingOrderFields.length,
    orders,
    ordersApiReady,
    ordersCollection,
  ]);
  const orderHandoff = useMemo(() => ({
    site: {
      id: activeSiteId,
      name: activeSite?.name || activeSiteId,
      slug: activeSite?.slug,
      status: activeSite?.status,
    },
    generatedAt: new Date().toISOString(),
    collection: ordersCollection
      ? {
          id: ordersCollection.id,
          name: ordersCollection.name,
          slug: ordersCollection.slug,
          status: ordersCollection.status,
          permissions: ordersCollection.permissions,
          listRoutePattern: ordersCollection.listRoutePattern,
          routePattern: ordersCollection.routePattern,
          missingFields: missingOrderFields,
          fields: mergeOrderFields(ordersCollection.fields).map((field) => ({
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
      adminListCreate: adminOrdersApiUrl,
      adminDetailUpdate: adminOrderDetailApiUrl,
      checkoutIntake: publicOrderIntakeUrl,
      publicBlocked: publicOrdersApiUrl,
    },
    storefrontHandoff: {
      productsRoute: '/products',
      storefrontPageRoute: '/pages/new',
      storefrontPageTemplate: 'storefront',
      note: 'Orders should be wired after products and a storefront page are ready to send checkout carts into the public commerce order intake endpoint.',
      inventoryReservation: ordersApiReady
        ? 'Physical product and variant inventory is reserved when checkout intake creates an order.'
        : 'Inventory reservation is available after the private orders collection is synced and the product catalog is public.',
    },
    security: {
      publicRead: Boolean(ordersCollection?.permissions.publicRead),
      publicCreate: Boolean(ordersCollection?.permissions.publicCreate),
      publicUpdate: Boolean(ordersCollection?.permissions.publicUpdate),
      publicDelete: Boolean(ordersCollection?.permissions.publicDelete),
      adminOnly: ordersApiReady,
      publicCheckoutIntake: ordersApiReady ? 'enabled through /commerce/orders without public collection permissions' : 'requires private orders collection',
    },
    backendSystems: ORDER_BACKEND_SYSTEMS,
    readiness: {
      ready: ordersApiReady,
      score: orderReadiness.score,
      checks: orderReadiness.checks,
    },
    metrics,
    filters: {
      search: searchQuery,
      workflow: filter,
      payment: paymentFilter,
      fulfillment: fulfillmentFilter,
      source: sourceFilter,
      visible: filteredOrders.length,
      total: orders.length,
    },
    export: {
      csvIncludesCustomerIdentity: true,
      csvIncludesPaymentReferences: true,
      csvIncludesFulfillmentData: true,
      csvIncludesPrivateNotes: true,
      csvColumns: ORDER_EXPORT_COLUMNS,
      filteredRows: filteredOrders.length,
    },
    workflowStates: {
      order: ['open', 'paid', 'fulfilled', 'cancelled', 'refunded'],
      payment: ['pending', 'paid', 'failed', 'refunded'],
      fulfillment: ['unfulfilled', 'processing', 'fulfilled', 'cancelled'],
    },
    orders: orders.map((order) => ({
      id: order.id,
      slug: order.slug,
      status: order.status,
      updatedAt: order.updatedAt,
      orderNumber: String(readOrderValue(order.values, 'ordernumber', order.slug)),
      customerName: String(readOrderValue(order.values, 'customername', '')),
      email: String(order.values.email || ''),
      phone: String(readOrderValue(order.values, 'phone', '')),
      total: toNumber(order.values.total),
      subtotal: readOrderValue(order.values, 'subtotal', null) === null || readOrderValue(order.values, 'subtotal', undefined) === undefined
        ? null
        : toNumber(readOrderValue(order.values, 'subtotal', 0)),
      taxAmount: readOrderValue(order.values, 'taxamount', null) === null || readOrderValue(order.values, 'taxamount', undefined) === undefined
        ? null
        : toNumber(readOrderValue(order.values, 'taxamount', 0)),
      shippingAmount: readOrderValue(order.values, 'shippingamount', null) === null || readOrderValue(order.values, 'shippingamount', undefined) === undefined
        ? null
        : toNumber(readOrderValue(order.values, 'shippingamount', 0)),
      discountAmount: readOrderValue(order.values, 'discountamount', null) === null || readOrderValue(order.values, 'discountamount', undefined) === undefined
        ? null
        : toNumber(readOrderValue(order.values, 'discountamount', 0)),
      currency: normalizeCurrency(String(order.values.currency || 'USD')),
      itemCount: parseOrderLineItems(order.values.items, String(order.values.currency || 'USD')).length,
      items: formatOrderItemsForExport(order.values.items, String(order.values.currency || 'USD')),
      orderSource: asOrderSource(readOrderValue(order.values, 'ordersource', undefined)),
      checkoutSessionId: String(readOrderValue(order.values, 'checkoutsessionid', '')),
      customerId: String(readOrderValue(order.values, 'customerid', '')),
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
      refundAmount: readOrderValue(order.values, 'refundamount', null) === null || readOrderValue(order.values, 'refundamount', undefined) === undefined
        ? null
        : toNumber(readOrderValue(order.values, 'refundamount', 0)),
      hasShippingAddress: Boolean(readOrderValue(order.values, 'shippingaddress', '')),
      hasBillingAddress: Boolean(readOrderValue(order.values, 'billingaddress', '')),
      hasPrivateNotes: Boolean(order.values.notes),
    })),
  }), [
    activeSite?.name,
    activeSite?.slug,
    activeSite?.status,
    activeSiteId,
    adminOrderDetailApiUrl,
    adminOrdersApiUrl,
    filter,
    filteredOrders.length,
    fulfillmentFilter,
    metrics,
    missingOrderFields,
    orderReadiness.checks,
    orderReadiness.score,
    orders,
    ordersApiReady,
    ordersCollection,
    paymentFilter,
    publicOrderIntakeUrl,
    publicOrdersApiUrl,
    searchQuery,
    sourceFilter,
  ]);
  const orderHandoffText = useMemo(() => JSON.stringify(orderHandoff, null, 2), [orderHandoff]);
  const ordersRouteSearch = useMemo<OrdersSearch>(() => ({
    siteId: activeSiteId,
    ...(filter !== 'all' ? { workflow: filter } : {}),
    ...(paymentFilter !== 'all' ? { payment: paymentFilter } : {}),
    ...(fulfillmentFilter !== 'all' ? { fulfillment: fulfillmentFilter } : {}),
    ...(sourceFilter !== 'all' ? { source: sourceFilter } : {}),
    ...(searchQuery.trim() ? { q: searchQuery.trim() } : {}),
    ...(selectedOrderId ? { orderId: selectedOrderId } : {}),
  }), [activeSiteId, filter, fulfillmentFilter, paymentFilter, searchQuery, selectedOrderId, sourceFilter]);

  const updateOrdersRouteSearch = (next: OrdersSearch) => {
    const merged: OrdersSearch = {
      ...ordersRouteSearch,
      ...next,
    };
    const normalized: OrdersSearch = {
      siteId: merged.siteId || activeSiteId,
      ...(merged.workflow && merged.workflow !== 'all' ? { workflow: merged.workflow } : {}),
      ...(merged.payment && merged.payment !== 'all' ? { payment: merged.payment } : {}),
      ...(merged.fulfillment && merged.fulfillment !== 'all' ? { fulfillment: merged.fulfillment } : {}),
      ...(merged.source && merged.source !== 'all' ? { source: merged.source } : {}),
      ...(merged.q?.trim() ? { q: merged.q.trim() } : {}),
      ...(merged.orderId ? { orderId: merged.orderId } : {}),
    };

    navigate({ to: '/orders', search: normalized, replace: true });
  };

  const loadOrders = async () => {
    if (isOrdersBusy) return;

    setIsLoading(true);
    setError(null);

    try {
      const collections = await listCollections(activeSiteId);
      const collection = collections.find((item) => item.slug === ORDERS_COLLECTION_SLUG) || null;
      setOrdersCollection(collection);

      if (!collection) {
        setOrders([]);
        clearOrderEditorState();
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
      clearOrderEditorState();
    }

    setSelectedOrderId(routeSearch.orderId || null);
    setSearchQuery(routeSearch.q || '');
    setFilter(routeSearch.workflow || 'all');
    setPaymentFilter(routeSearch.payment || 'all');
    setFulfillmentFilter(routeSearch.fulfillment || 'all');
    setSourceFilter(routeSearch.source || 'all');
  }, [
    routeSearch.fulfillment,
    routeSearch.orderId,
    routeSearch.payment,
    routeSearch.q,
    routeSearch.siteId,
    routeSearch.source,
    routeSearch.workflow,
    selectedSiteId,
    sites,
  ]);

  useEffect(() => {
    void loadOrders();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeSiteId]);

  useEffect(() => {
    if (!selectedOrder) return;
    setFormState(orderToForm(selectedOrder));
  }, [selectedOrder]);

  const clearOrderEditorState = (nextFormState: OrderFormState = EMPTY_ORDER_FORM) => {
    setSelectedOrderId(null);
    setFormState(nextFormState);
    setItemDraft({
      title: '',
      sku: '',
      variant: '',
      quantity: '1',
      price: '',
    });
  };

  const resetForm = () => {
    if (isOrdersBusy) return;

    clearOrderEditorState({
      ...EMPTY_ORDER_FORM,
      orderNumber: `ORD-${Date.now().toString().slice(-6)}`,
    });
    updateOrdersRouteSearch({ orderId: undefined });
  };

  const selectOrderForEditing = (orderId: string) => {
    if (isOrdersBusy) return;

    setSelectedOrderId(orderId);
    updateOrdersRouteSearch({ orderId });
  };

  const setLineItems = (items: OrderLineItem[]) => {
    setFormState((current) => ({ ...current, items: serializeOrderLineItems(items, current.currency) }));
  };

  const addLineItem = () => {
    if (isOrdersBusy) return;

    const title = itemDraft.title.trim();
    if (!title || orderLineItems.length >= 100) return;

    const quantity = Math.max(1, Math.floor(Number(itemDraft.quantity || 1)));
    const price = Math.max(0, Number(itemDraft.price || 0));
    const lineItem: OrderLineItem = {
      id: `item-${Date.now()}`,
      productId: '',
      slug: slugify(title),
      title,
      sku: itemDraft.sku.trim(),
      variantTitle: itemDraft.variant.trim(),
      variantOption: itemDraft.variant.trim(),
      variantSku: '',
      quantity,
      price,
      currency: normalizeCurrency(formState.currency),
      lineTotal: moneyValue(quantity * price),
    };

    setLineItems([...orderLineItems, lineItem]);
    setItemDraft({
      title: '',
      sku: '',
      variant: '',
      quantity: '1',
      price: '',
    });
  };

  const removeLineItem = (itemId: string) => {
    if (isOrdersBusy) return;

    setLineItems(orderLineItems.filter((item) => item.id !== itemId));
  };

  const applyLineItemTotals = () => {
    if (isOrdersBusy) return;

    const shippingAmount = Number(formState.shippingAmount || 0);
    const taxAmount = Number(formState.taxAmount || 0);
    const discountAmount = Number(formState.discountAmount || 0);
    const total = Math.max(0, moneyValue(orderLineItemSubtotal + taxAmount + shippingAmount - discountAmount));

    setFormState((current) => ({
      ...current,
      subtotal: orderLineItemSubtotal ? String(orderLineItemSubtotal) : current.subtotal,
      total: String(total),
    }));
  };

  const createOrdersCollection = async () => {
    if (isOrdersBusy) return;

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
      clearOrderEditorState({
        ...EMPTY_ORDER_FORM,
        orderNumber: `ORD-${Date.now().toString().slice(-6)}`,
      });
      setNotice('Orders collection created. You can record the first order now.');
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : 'Unable to set up orders');
    } finally {
      setIsSaving(false);
    }
  };

  const syncOrdersCollection = async () => {
    if (!ordersCollection) return;
    if (isOrdersBusy) return;

    setIsSaving(true);
    setError(null);
    setNotice(null);

    try {
      const synced = await updateCollection(activeSiteId, ordersCollection.id, {
        name: ordersCollection.name || 'Orders',
        slug: ORDERS_COLLECTION_SLUG,
        description: ordersCollection.description || 'Commerce orders for storefronts, custom checkout flows, and fulfillment dashboards.',
        status: 'published',
        listRoutePattern: ordersCollection.listRoutePattern || '/orders',
        routePattern: ordersCollection.routePattern || '/orders/:recordSlug',
        fields: mergeOrderFields(ordersCollection.fields),
        permissions: {
          ...ordersCollection.permissions,
          publicRead: false,
          publicCreate: false,
          publicUpdate: false,
          publicDelete: false,
        },
      });
      setOrdersCollection(synced);
      setNotice('Order schema synced. Payment, fulfillment, tracking, refund, and address fields are now available.');
    } catch (syncError) {
      setError(syncError instanceof Error ? syncError.message : 'Unable to sync order schema');
    } finally {
      setIsSaving(false);
    }
  };

  const saveOrder = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!ordersCollection) return;
    if (isOrdersBusy) return;

    if (!formState.orderNumber.trim() || !formState.customerName.trim() || !formState.email.trim()) {
      setError('Add an order number, customer name, and email before saving.');
      setNotice(null);
      return;
    }

    if (Number(formState.total || 0) <= 0) {
      setError('Add a positive order total before saving.');
      setNotice(null);
      return;
    }

    if (!formState.items.trim()) {
      setError('Add at least one line item or raw item payload before saving.');
      setNotice(null);
      return;
    }

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
        subtotal: formState.subtotal ? Number(formState.subtotal) : null,
        taxamount: formState.taxAmount ? Number(formState.taxAmount) : null,
        shippingamount: formState.shippingAmount ? Number(formState.shippingAmount) : null,
        discountamount: formState.discountAmount ? Number(formState.discountAmount) : null,
        currency: normalizeCurrency(formState.currency),
        items: formState.items.trim(),
        ordersource: formState.orderSource,
        checkoutsessionid: formState.checkoutSessionId.trim(),
        customerid: formState.customerId.trim(),
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
      updateOrdersRouteSearch({ orderId: saved.id });
      setNotice(selectedOrder ? 'Order updated.' : 'Order recorded.');
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Unable to save order');
    } finally {
      setIsSaving(false);
    }
  };

  const updateOrderWorkflow = async (order: CollectionRecord, updates: Partial<OrderFormState>) => {
    if (!ordersCollection) return;
    if (isOrdersBusy) return;

    setIsSaving(true);
    setError(null);
    setNotice(null);

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
      setNotice('Order workflow updated.');
    } catch (workflowError) {
      setError(workflowError instanceof Error ? workflowError.message : 'Unable to update order');
    } finally {
      setIsSaving(false);
    }
  };

  const removeOrder = async (order: CollectionRecord) => {
    if (!ordersCollection) return;
    if (isOrdersBusy) return;

    setIsSaving(true);
    setError(null);
    setNotice(null);

    try {
      await deleteCollectionRecord(activeSiteId, ordersCollection.id, order.id);
      setOrders((current) => current.filter((item) => item.id !== order.id));
      if (selectedOrderId === order.id) {
        clearOrderEditorState({
          ...EMPTY_ORDER_FORM,
          orderNumber: `ORD-${Date.now().toString().slice(-6)}`,
        });
        updateOrdersRouteSearch({ orderId: undefined });
      }
      setPendingDeleteOrder(null);
      setNotice('Order deleted.');
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : 'Unable to delete order');
    } finally {
      setIsSaving(false);
    }
  };

  const copyOrdersApiUrl = async (value: string, label: string) => {
    if (isOrdersBusy) return;

    try {
      await navigator.clipboard.writeText(value);
      setNotice(`${label} copied.`);
    } catch {
      setNotice(value);
    }
  };
  const copyOrderHandoff = async () => {
    if (isOrdersBusy) return;

    try {
      await navigator.clipboard.writeText(orderHandoffText);
      setNotice('Order handoff manifest copied.');
    } catch {
      setNotice(orderHandoffText);
    }
  };
  const downloadOrderHandoff = () => {
    if (isOrdersBusy) return;

    const blob = new Blob([orderHandoffText], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `${activeSite?.slug || activeSiteId}-backy-orders-handoff.json`;
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
    setNotice('Order handoff manifest downloaded.');
  };
  const exportOrdersCsv = () => {
    if (isOrdersBusy) return;
    if (filteredOrders.length === 0) return;

    const rows = filteredOrders.map((order) => {
      const exportRecord = orderToExportRecord(order, {
        activeSiteId,
        adminOrdersApiUrl,
        publicOrdersApiUrl,
        adminOnly: ordersApiReady,
      });
      return ORDER_EXPORT_COLUMNS.map((column) => exportRecord[column]);
    });
    const csv = [ORDER_EXPORT_COLUMNS, ...rows]
      .map((row) => row.map(csvEscape).join(','))
      .join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `${activeSite?.slug || activeSiteId}-orders.csv`;
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
    setNotice(`${filteredOrders.length} visible order${filteredOrders.length === 1 ? '' : 's'} exported.`);
  };
  const clearOrderFilters = () => {
    if (isOrdersBusy) return;

    setSearchQuery('');
    setFilter('all');
    setPaymentFilter('all');
    setFulfillmentFilter('all');
    setSourceFilter('all');
    clearOrderEditorState();
    updateOrdersRouteSearch({
      workflow: undefined,
      payment: undefined,
      fulfillment: undefined,
      source: undefined,
      q: undefined,
      orderId: undefined,
    });
  };
  const openProductsWorkspace = () => {
    if (isOrdersBusy) return;

    navigate({ to: '/products', search: activeSiteSearch });
  };
  const openStorefrontPage = () => {
    if (isOrdersBusy) return;

    navigate({ to: '/pages/new', search: { siteId: activeSiteId, template: 'storefront' } });
  };
  const selectOrdersSite = (nextSiteId: string) => {
    if (isOrdersBusy) return;

    setSelectedSiteId(nextSiteId);
    clearOrderEditorState();
    setSearchQuery('');
    setFilter('all');
    setPaymentFilter('all');
    setFulfillmentFilter('all');
    setSourceFilter('all');
    navigate({ to: '/orders', search: { siteId: nextSiteId }, replace: true });
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
            disabled={isOrdersBusy}
            onChange={(event) => selectOrdersSite(event.target.value)}
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
          <Button onClick={() => void loadOrders()} disabled={isOrdersBusy} iconStart={<RefreshCw className={cn('size-4', isLoading && 'animate-spin')} />}>
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

      <section className="mb-6 rounded-lg border border-border bg-card p-5 shadow-sm" data-testid="orders-command-center">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-base font-semibold text-foreground">Order command center</h2>
              <span className={cn(
                'rounded-full px-2.5 py-1 text-xs font-semibold',
                orderReadiness.score >= 80 ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700',
              )}
              >
                {orderReadiness.score}% ready
              </span>
            </div>
            <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
              Control private commerce operations: public checkout intake, payment state, fulfillment, tracking, refunds, customer support notes, and admin API handoff.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => void copyOrderHandoff()} disabled={isOrdersBusy} iconStart={<Copy className="size-4" />}>
              Copy manifest
            </Button>
            <Button variant="outline" onClick={downloadOrderHandoff} disabled={isOrdersBusy} iconStart={<Download className="size-4" />}>
              Download JSON
            </Button>
            <Button variant="outline" onClick={exportOrdersCsv} disabled={isOrdersBusy || filteredOrders.length === 0} iconStart={<Download className="size-4" />}>
              Export CSV
            </Button>
            <Button variant="outline" onClick={openProductsWorkspace} disabled={isOrdersBusy} iconStart={<ShoppingCart className="size-4" />}>
              Products
            </Button>
            <Button variant="outline" onClick={openStorefrontPage} disabled={isOrdersBusy} iconStart={<Sparkles className="size-4" />}>
              Storefront page
            </Button>
            {!ordersCollection ? (
              <Button onClick={() => void createOrdersCollection()} disabled={isOrdersBusy} iconStart={<Sparkles className="size-4" />}>
                {isSaving ? 'Setting up...' : 'Set up orders'}
              </Button>
            ) : (
              <Button onClick={resetForm} disabled={isOrdersBusy} iconStart={<Plus className="size-4" />}>
                New order
              </Button>
            )}
            <Button onClick={() => void loadOrders()} disabled={isOrdersBusy} iconStart={<RefreshCw className={cn('size-4', isLoading && 'animate-spin')} />}>
              Refresh
            </Button>
          </div>
        </div>

        <div className="mt-5 grid gap-3 xl:grid-cols-[minmax(0,1.15fr)_minmax(340px,0.85fr)]">
          <div className="rounded-lg border border-border bg-background p-4">
            <h3 className="text-sm font-semibold">Order readiness</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              Checks whether orders are private, complete enough for payment reconciliation, and ready for fulfillment work.
            </p>
            <div className="mt-3 h-2 overflow-hidden rounded-full bg-muted">
              <div
                className={cn('h-full rounded-full', orderReadiness.score >= 80 ? 'bg-emerald-500' : 'bg-amber-500')}
                style={{ width: `${orderReadiness.score}%` }}
              />
            </div>
            <div className="mt-4 grid gap-2 md:grid-cols-2 xl:grid-cols-4">
              {orderReadiness.checks.map((check) => (
                <OrderReadinessCheck key={check.label} {...check} />
              ))}
            </div>
          </div>

          <div className="rounded-lg border border-border bg-background p-4">
            <div className="flex items-center gap-2">
              <Receipt className="size-4 text-primary" />
              <h3 className="text-sm font-semibold">Order workflow</h3>
            </div>
            <div className="mt-3 grid gap-2">
              {orderReadiness.workflow.map((step, index) => (
                <OrderWorkflowStep key={step.label} index={index + 1} {...step} />
              ))}
            </div>
          </div>
        </div>

        <div className="mt-4 rounded-lg border border-border bg-background p-4">
          <h3 className="text-sm font-semibold">Order control map</h3>
          <p className="mt-1 text-sm text-muted-foreground">Jump to site scope, checkout intake, private API, order health, queue, and editor controls.</p>
          <div className="mt-4 grid gap-2 md:grid-cols-2 xl:grid-cols-5">
            {ORDER_CONTROL_AREAS.map((area) => (
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

      {ordersCollection && (
        <Panel id="orders-api" className="mb-6 scroll-mt-24">
          <PanelHeader
            title="Order API and security"
            description="Custom frontends post checkout carts to a public intake endpoint while raw order records stay private."
            icon={<ShieldCheck className="size-4" />}
            action={
              <div className="flex flex-wrap items-center gap-2">
                {!ordersApiReady && (
                  <Button
                    onClick={() => void syncOrdersCollection()}
                    disabled={isOrdersBusy}
                    iconStart={<Sparkles className="size-4" />}
                  >
                    Sync Schema
                  </Button>
                )}
                <Button onClick={() => void copyOrderHandoff()} disabled={isOrdersBusy} iconStart={<Copy className="size-4" />}>
                  Copy manifest
                </Button>
                <Button onClick={exportOrdersCsv} disabled={isOrdersBusy || filteredOrders.length === 0} iconStart={<Download className="size-4" />}>
                  Export CSV
                </Button>
                <Button onClick={() => void copyOrdersApiUrl(adminOrdersApiUrl, 'Internal orders API URL')} disabled={isOrdersBusy} iconStart={<Copy className="size-4" />}>
                  Copy admin API
                </Button>
                <Button onClick={() => void copyOrdersApiUrl(publicOrderIntakeUrl, 'Checkout intake URL')} disabled={isOrdersBusy} iconStart={<Copy className="size-4" />}>
                  Copy checkout
                </Button>
                <Button variant="outline" onClick={openProductsWorkspace} disabled={isOrdersBusy} iconStart={<ShoppingCart className="size-4" />}>
                  Products
                </Button>
                <Button variant="outline" onClick={openStorefrontPage} disabled={isOrdersBusy} iconStart={<Sparkles className="size-4" />}>
                  Storefront page
                </Button>
                <a
                  href={adminOrdersApiUrl}
                  target="_blank"
                  rel="noreferrer"
                  aria-disabled={isOrdersBusy}
                  onClick={(event) => {
                    if (isOrdersBusy) event.preventDefault();
                  }}
                  className={cn(
                    'inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-border bg-background px-4 py-2 text-sm font-medium transition-colors hover:bg-accent',
                    isOrdersBusy && 'pointer-events-none opacity-60',
                  )}
                >
                  <ExternalLink className="size-4" />
                  Open admin API
                </a>
              </div>
            }
          />
          <PanelContent>
            <div className="space-y-3">
              <div className="grid gap-4 lg:grid-cols-2">
                <div className="space-y-2">
                  <OrderApiSnippet icon={<ShoppingCart className="size-4" />} label="Checkout intake" value={publicOrderIntakeUrl} />
                  <OrderApiSnippet icon={<Code2 className="size-4" />} label="List and create orders" value={adminOrdersApiUrl} />
                  <OrderApiSnippet icon={<Receipt className="size-4" />} label="Read or update order" value={adminOrderDetailApiUrl} />
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
                    <span>Use /commerce/orders for public checkout intake; keep this raw collection endpoint private.</span>
                  </div>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                <span
                  className={cn(
                    'inline-flex rounded-md px-2 py-1 font-medium',
                    ordersApiReady ? 'bg-success/10 text-success' : 'bg-warning/10 text-warning',
                  )}
                >
                  {ordersApiReady ? 'Workflow ready' : 'Schema needs sync'}
                </span>
                <StatusBadge status={ordersCollection.status} />
                <span>{orders.length} internal records</span>
              </div>
              {missingOrderFields.length > 0 && (
                <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
                  Missing order fields: {missingOrderFields.join(', ')}. Sync the schema before relying on fulfillment workflows.
                </div>
              )}
              <div className="rounded-lg border border-border bg-background p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h3 className="text-sm font-semibold">Private order backend contract</h3>
                    <p className="mt-1 text-sm text-muted-foreground">
                      Backy owns these admin-only commerce systems so custom storefronts can create orders server-side without exposing customer, payment, or fulfillment data publicly.
                    </p>
                  </div>
                  <span className="rounded-full bg-muted px-2.5 py-1 text-xs font-medium text-muted-foreground">
                    {ORDER_BACKEND_SYSTEMS.length} systems
                  </span>
                </div>
                <div className="mt-4 grid gap-2 md:grid-cols-2 xl:grid-cols-3">
                  {ORDER_BACKEND_SYSTEMS.map((system) => (
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
            </div>
          </PanelContent>
        </Panel>
      )}

      <div id="orders-site" className="mb-4 flex flex-wrap items-center gap-3 rounded-lg border border-border bg-card px-4 py-3 scroll-mt-24">
        <label className="text-sm font-medium text-muted-foreground" htmlFor="orders-active-site-inline">
          Active site
        </label>
        <select
          id="orders-active-site-inline"
          aria-label="Active order site"
          value={activeSiteId}
          disabled={isOrdersBusy}
          onChange={(event) => selectOrdersSite(event.target.value)}
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
          {activeSite?.name || activeSiteId} private order queue
        </span>
      </div>

      <div id="orders-metrics" className="mb-6 grid gap-3 scroll-mt-24 md:grid-cols-3 xl:grid-cols-6">
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
            <div className="mt-2 flex flex-wrap justify-center gap-2">
              <Button onClick={() => void createOrdersCollection()} disabled={isOrdersBusy} iconStart={<Sparkles className="size-4" />}>
                {isSaving ? 'Setting up...' : 'Set Up Orders'}
              </Button>
              <Button variant="outline" onClick={openProductsWorkspace} disabled={isOrdersBusy} iconStart={<ShoppingCart className="size-4" />}>
                Set up products
              </Button>
              <Button variant="outline" onClick={openStorefrontPage} disabled={isOrdersBusy} iconStart={<Sparkles className="size-4" />}>
                Start storefront page
              </Button>
            </div>
          }
        />
      ) : (
        <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_420px]">
          <Panel id="orders-queue" className="scroll-mt-24">
            <PanelHeader
              title="Order Queue"
              description={`${filteredOrders.length}/${orders.length} visible orders`}
              icon={<ClipboardCheck className="size-4" />}
              action={<Button onClick={resetForm} disabled={isOrdersBusy} iconStart={<Plus className="size-4" />}>New Order</Button>}
            />
            <PanelContent>
              <div className="mb-4 flex flex-wrap items-center gap-3">
                <div className="relative min-w-64 flex-1">
                  <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                  <input
                    aria-label="Search orders"
                    value={searchQuery}
                    disabled={isOrdersBusy}
                    onChange={(event) => {
                      if (isOrdersBusy) return;
                      const q = event.target.value;
                      setSearchQuery(q);
                      clearOrderEditorState();
                      updateOrdersRouteSearch({ q: q || undefined, orderId: undefined });
                    }}
                    placeholder="Search orders..."
                    className="w-full rounded-lg border bg-background py-2.5 pl-9 pr-3 text-sm disabled:cursor-not-allowed disabled:opacity-60"
                  />
                </div>
                <div className="inline-flex flex-wrap items-center gap-1 rounded-lg border border-border bg-muted p-1">
                  {(['all', 'open', 'paid', 'fulfilled', 'cancelled'] as const).map((status) => (
                    <button
                      key={status}
                      type="button"
                      disabled={isOrdersBusy}
                      onClick={() => {
                        if (isOrdersBusy) return;
                        setFilter(status);
                        clearOrderEditorState();
                        updateOrdersRouteSearch({ workflow: status, orderId: undefined });
                      }}
                      className={cn(
                        'rounded-md px-3 py-1.5 text-sm font-medium capitalize text-muted-foreground hover:bg-background hover:text-foreground disabled:cursor-not-allowed disabled:opacity-60',
                        filter === status && 'bg-background text-foreground shadow-sm',
                      )}
                    >
                      {status}
                    </button>
                  ))}
                </div>
                <select
                  aria-label="Payment status filter"
                  value={paymentFilter}
                  disabled={isOrdersBusy}
                  onChange={(event) => {
                    if (isOrdersBusy) return;
                    const payment = event.target.value as PaymentStatusFilter;
                    setPaymentFilter(payment);
                    clearOrderEditorState();
                    updateOrdersRouteSearch({ payment, orderId: undefined });
                  }}
                  className="min-h-10 rounded-lg border border-border bg-background px-3 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <option value="all">All payments</option>
                  <option value="pending">Pending payment</option>
                  <option value="paid">Paid</option>
                  <option value="failed">Failed</option>
                  <option value="refunded">Refunded</option>
                </select>
                <select
                  aria-label="Fulfillment status filter"
                  value={fulfillmentFilter}
                  disabled={isOrdersBusy}
                  onChange={(event) => {
                    if (isOrdersBusy) return;
                    const fulfillment = event.target.value as FulfillmentStatusFilter;
                    setFulfillmentFilter(fulfillment);
                    clearOrderEditorState();
                    updateOrdersRouteSearch({ fulfillment, orderId: undefined });
                  }}
                  className="min-h-10 rounded-lg border border-border bg-background px-3 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <option value="all">All fulfillment</option>
                  <option value="unfulfilled">Unfulfilled</option>
                  <option value="processing">Processing</option>
                  <option value="fulfilled">Fulfilled</option>
                  <option value="cancelled">Cancelled</option>
                </select>
                <select
                  aria-label="Order source filter"
                  value={sourceFilter}
                  disabled={isOrdersBusy}
                  onChange={(event) => {
                    if (isOrdersBusy) return;
                    const source = event.target.value as OrderSourceFilter;
                    setSourceFilter(source);
                    clearOrderEditorState();
                    updateOrdersRouteSearch({ source, orderId: undefined });
                  }}
                  className="min-h-10 rounded-lg border border-border bg-background px-3 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <option value="all">All sources</option>
                  <option value="web">Web</option>
                  <option value="manual">Manual</option>
                  <option value="api">API</option>
                  <option value="import">Import</option>
                  <option value="pos">POS</option>
                </select>
                {hasActiveOrderFilters && (
                  <Button variant="outline" onClick={clearOrderFilters} disabled={isOrdersBusy}>
                    Clear filters
                  </Button>
                )}
              </div>

              {filteredOrders.length === 0 ? (
                <div className="rounded-lg border border-dashed border-border px-4 py-10 text-center">
                  <div className="text-sm font-medium text-foreground">
                    {orders.length === 0 ? 'No orders yet' : 'No orders match this view'}
                  </div>
                  <div className="mt-1 text-sm text-muted-foreground">
                    {orders.length === 0
                      ? 'Create or import the first order to begin payment and fulfillment tracking.'
                      : 'Change the search, workflow, payment, fulfillment, or source filters to broaden the queue.'}
                  </div>
                  {orders.length > 0 && hasActiveOrderFilters && (
                    <Button variant="outline" onClick={clearOrderFilters} disabled={isOrdersBusy} className="mt-4">
                      Clear filters
                    </Button>
                  )}
                </div>
              ) : (
                <div className="grid gap-3">
                  {filteredOrders.map((order) => (
                    <OrderCard
                      key={order.id}
                      order={order}
                      selected={order.id === selectedOrderId}
                      disabled={isOrdersBusy}
                      onEdit={() => selectOrderForEditing(order.id)}
                      onPaid={() => void updateOrderWorkflow(order, { orderStatus: 'paid', paymentStatus: 'paid', paidAt: new Date().toISOString() })}
                      onFulfilled={() => void updateOrderWorkflow(order, { orderStatus: 'fulfilled', fulfillmentStatus: 'fulfilled', fulfilledAt: new Date().toISOString() })}
                      onCancelled={() => void updateOrderWorkflow(order, { orderStatus: 'cancelled', fulfillmentStatus: 'cancelled' })}
                      onDelete={() => {
                        if (isOrdersBusy) return;
                        setPendingDeleteOrder(order);
                      }}
                    />
                  ))}
                </div>
              )}
            </PanelContent>
          </Panel>

          <Panel id="orders-editor" className="scroll-mt-24 xl:sticky xl:top-4 xl:self-start">
            <PanelHeader
              title={selectedOrder ? 'Edit order' : 'New order'}
              description="Customer, item, payment, and fulfillment state."
              icon={<Receipt className="size-4" />}
            />
            <PanelContent>
              <form onSubmit={saveOrder}>
                <fieldset disabled={isOrdersBusy} className={cn('space-y-4', isOrdersBusy && 'opacity-70')}>
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
                <div className="grid grid-cols-4 gap-3">
                  <Field label="Subtotal">
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={formState.subtotal}
                      onChange={(event) => setFormState((current) => ({ ...current, subtotal: event.target.value }))}
                      className="w-full rounded-lg border bg-background px-3 py-2.5 text-sm"
                    />
                  </Field>
                  <Field label="Tax">
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={formState.taxAmount}
                      onChange={(event) => setFormState((current) => ({ ...current, taxAmount: event.target.value }))}
                      className="w-full rounded-lg border bg-background px-3 py-2.5 text-sm"
                    />
                  </Field>
                  <Field label="Shipping">
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={formState.shippingAmount}
                      onChange={(event) => setFormState((current) => ({ ...current, shippingAmount: event.target.value }))}
                      className="w-full rounded-lg border bg-background px-3 py-2.5 text-sm"
                    />
                  </Field>
                  <Field label="Discount">
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={formState.discountAmount}
                      onChange={(event) => setFormState((current) => ({ ...current, discountAmount: event.target.value }))}
                      className="w-full rounded-lg border bg-background px-3 py-2.5 text-sm"
                    />
                  </Field>
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <Field label="Source">
                    <select
                      value={formState.orderSource}
                      onChange={(event) => setFormState((current) => ({ ...current, orderSource: asOrderSource(event.target.value) }))}
                      className="w-full rounded-lg border bg-background px-3 py-2.5 text-sm"
                    >
                      <option value="web">Web</option>
                      <option value="manual">Manual</option>
                      <option value="api">API</option>
                      <option value="import">Import</option>
                      <option value="pos">POS</option>
                    </select>
                  </Field>
                  <Field label="Checkout session">
                    <input
                      value={formState.checkoutSessionId}
                      onChange={(event) => setFormState((current) => ({ ...current, checkoutSessionId: event.target.value }))}
                      className="w-full rounded-lg border bg-background px-3 py-2.5 text-sm"
                      placeholder="cs_..."
                    />
                  </Field>
                  <Field label="Customer ID">
                    <input
                      value={formState.customerId}
                      onChange={(event) => setFormState((current) => ({ ...current, customerId: event.target.value }))}
                      className="w-full rounded-lg border bg-background px-3 py-2.5 text-sm"
                      placeholder="cus_..."
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
                <div className="space-y-3 rounded-lg border border-border bg-muted/20 p-3">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <div className="text-sm font-semibold text-foreground">Line items</div>
                      <div className="mt-1 text-xs text-muted-foreground">
                        Review checkout product, variant, quantity, and price data without editing raw JSON.
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded bg-background px-2 py-1 font-mono text-xs text-muted-foreground">
                        {orderLineItemQuantity} units · {formatMoney(orderLineItemSubtotal, formState.currency)}
                      </span>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={applyLineItemTotals}
                        disabled={isOrdersBusy || orderLineItems.length === 0}
                      >
                        Use totals
                      </Button>
                    </div>
                  </div>

                  {orderLineItems.length > 0 ? (
                    <div className="space-y-2">
                      {orderLineItems.map((item) => (
                        <div
                          key={item.id}
                          className="grid gap-2 rounded-lg border border-border bg-background p-2 text-sm md:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)_70px_90px_auto] md:items-center"
                        >
                          <div className="min-w-0">
                            <div className="truncate font-medium text-foreground">{item.title}</div>
                            <div className="truncate font-mono text-xs text-muted-foreground">{item.sku || item.slug || 'No SKU'}</div>
                          </div>
                          <div className="truncate text-xs text-muted-foreground">
                            {item.variantTitle || item.variantOption || item.variantSku || 'Default option'}
                          </div>
                          <div className="font-mono text-xs text-muted-foreground">x{item.quantity}</div>
                          <div className="font-mono text-xs text-muted-foreground">{formatMoney(item.lineTotal, item.currency)}</div>
                          <Button size="sm" variant="ghost" onClick={() => removeLineItem(item.id)} disabled={isOrdersBusy}>
                            Remove
                          </Button>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="rounded-lg border border-dashed border-border bg-background px-3 py-4 text-center text-sm text-muted-foreground">
                      Add line items for manual orders, or they will appear here when checkout posts structured cart data.
                    </div>
                  )}

                  <div className="grid gap-2 md:grid-cols-[minmax(0,1fr)_minmax(0,0.8fr)_80px_100px_auto]">
                    <input
                      aria-label="Line item title"
                      value={itemDraft.title}
                      onChange={(event) => setItemDraft((current) => ({ ...current, title: event.target.value }))}
                      className="rounded-lg border bg-background px-3 py-2.5 text-sm"
                      placeholder="Product title"
                    />
                    <input
                      aria-label="Line item variant"
                      value={itemDraft.variant}
                      onChange={(event) => setItemDraft((current) => ({ ...current, variant: event.target.value }))}
                      className="rounded-lg border bg-background px-3 py-2.5 text-sm"
                      placeholder="Variant"
                    />
                    <input
                      aria-label="Line item quantity"
                      type="number"
                      min="1"
                      value={itemDraft.quantity}
                      onChange={(event) => setItemDraft((current) => ({ ...current, quantity: event.target.value }))}
                      className="rounded-lg border bg-background px-3 py-2.5 text-sm"
                      placeholder="Qty"
                    />
                    <input
                      aria-label="Line item price"
                      type="number"
                      min="0"
                      step="0.01"
                      value={itemDraft.price}
                      onChange={(event) => setItemDraft((current) => ({ ...current, price: event.target.value }))}
                      className="rounded-lg border bg-background px-3 py-2.5 text-sm"
                      placeholder="Price"
                    />
                    <Button
                      variant="outline"
                      onClick={addLineItem}
                      disabled={isOrdersBusy || !itemDraft.title.trim() || orderLineItems.length >= 100}
                    >
                      Add
                    </Button>
                  </div>
                  <input
                    aria-label="Line item SKU"
                    value={itemDraft.sku}
                    onChange={(event) => setItemDraft((current) => ({ ...current, sku: event.target.value }))}
                    className="w-full rounded-lg border bg-background px-3 py-2.5 text-sm"
                    placeholder="Optional SKU"
                  />

                  <Field label="Raw item payload">
                    <textarea
                      value={formState.items}
                      onChange={(event) => setFormState((current) => ({ ...current, items: event.target.value }))}
                      rows={4}
                      required
                      className="w-full resize-none rounded-lg border bg-background px-3 py-2.5 font-mono text-xs"
                      placeholder="Structured line items JSON or a legacy item summary"
                    />
                  </Field>
                </div>
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
                  <Button variant="outline" onClick={resetForm} disabled={isOrdersBusy}>Clear</Button>
                  <Button type="submit" variant="primary" disabled={isOrdersBusy || !formState.orderNumber.trim() || !formState.customerName.trim() || !formState.email.trim()} iconStart={<Receipt className="size-4" />}>
                    {isSaving ? 'Saving...' : selectedOrder ? 'Save Order' : 'Create Order'}
                  </Button>
                </div>
                </fieldset>
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
                disabled={isOrdersBusy}
                className="rounded-lg border border-border px-4 py-2 text-sm font-medium transition-colors hover:bg-accent disabled:cursor-not-allowed disabled:opacity-60"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void removeOrder(pendingDeleteOrder)}
                disabled={isOrdersBusy}
                className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isSaving ? 'Deleting...' : 'Delete order'}
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

function OrderReadinessCheck({ label, detail, ready }: { label: string; detail: string; ready: boolean }) {
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

function OrderWorkflowStep({ index, label, detail }: { index: number; label: string; detail: string }) {
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

function OrderApiSnippet({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border bg-muted/40 p-3">
      <div className="mb-2 flex items-center gap-2 text-sm font-medium">
        {icon}
        {label}
      </div>
      <code className="block overflow-x-auto rounded-md bg-background px-3 py-2 font-mono text-xs text-muted-foreground">
        {value}
      </code>
    </div>
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
  const orderSource = String(readOrderValue(values, 'ordersource', 'web'));
  const checkoutSessionId = String(readOrderValue(values, 'checkoutsessionid', ''));
  const customerId = String(readOrderValue(values, 'customerid', ''));
  const paidAt = String(readOrderValue(values, 'paidat', ''));
  const fulfilledAt = String(readOrderValue(values, 'fulfilledat', ''));
  const refundAmount = toNumber(readOrderValue(values, 'refundamount', 0));
  const lineItems = parseOrderLineItems(values.items, currency);
  const lineItemSummary = formatOrderItemSummary(values.items, currency);
  const lineItemQuantity = lineItems.reduce((sum, item) => sum + item.quantity, 0);

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
            <span className="rounded-md border border-border bg-muted px-2 py-1 text-[11px] font-medium capitalize text-muted-foreground">
              {orderSource}
            </span>
            {checkoutSessionId ? (
              <span className="rounded-md border border-border bg-muted px-2 py-1 text-[11px] font-medium text-muted-foreground">
                Checkout {checkoutSessionId}
              </span>
            ) : null}
            {customerId ? (
              <span className="rounded-md border border-border bg-muted px-2 py-1 text-[11px] font-medium text-muted-foreground">
                Customer {customerId}
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
            {lineItems.length > 0 ? (
              <span className="rounded-md border border-border bg-muted px-2 py-1 text-[11px] font-medium text-muted-foreground">
                {lineItems.length} item{lineItems.length === 1 ? '' : 's'} · {lineItemQuantity} unit{lineItemQuantity === 1 ? '' : 's'}
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
      {lineItemSummary ? (
        <p className="mt-3 line-clamp-2 text-sm text-muted-foreground">
          {lineItemSummary}
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
        <Button size="sm" onClick={onEdit} disabled={disabled} iconStart={<Receipt className="size-4" />}>Edit</Button>
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

const moneyValue = (value: number): number => (
  Math.round((Number.isFinite(value) ? value : 0) * 100) / 100
);

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

const asOrderSource = (value: unknown): OrderSource => (
  ['web', 'manual', 'api', 'import', 'pos'].includes(String(value))
    ? String(value) as OrderSource
    : 'web'
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
  if (key === 'taxamount') return 'taxAmount';
  if (key === 'shippingamount') return 'shippingAmount';
  if (key === 'discountamount') return 'discountAmount';
  if (key === 'ordersource') return 'orderSource';
  if (key === 'checkoutsessionid') return 'checkoutSessionId';
  if (key === 'customerid') return 'customerId';
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
  subtotal: readOrderValue(order.values, 'subtotal', null) === null || readOrderValue(order.values, 'subtotal', undefined) === undefined
    ? ''
    : String(readOrderValue(order.values, 'subtotal', '')),
  taxAmount: readOrderValue(order.values, 'taxamount', null) === null || readOrderValue(order.values, 'taxamount', undefined) === undefined
    ? ''
    : String(readOrderValue(order.values, 'taxamount', '')),
  shippingAmount: readOrderValue(order.values, 'shippingamount', null) === null || readOrderValue(order.values, 'shippingamount', undefined) === undefined
    ? ''
    : String(readOrderValue(order.values, 'shippingamount', '')),
  discountAmount: readOrderValue(order.values, 'discountamount', null) === null || readOrderValue(order.values, 'discountamount', undefined) === undefined
    ? ''
    : String(readOrderValue(order.values, 'discountamount', '')),
  currency: String(order.values.currency || 'USD'),
  items: String(order.values.items || ''),
  orderSource: asOrderSource(readOrderValue(order.values, 'ordersource', undefined)),
  checkoutSessionId: String(readOrderValue(order.values, 'checkoutsessionid', '')),
  customerId: String(readOrderValue(order.values, 'customerid', '')),
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

const getMissingOrderFieldKeys = (collection: Collection): string[] => {
  const existingKeys = new Set(collection.fields.map((field) => field.key));
  return ORDER_FIELDS
    .filter((field) => !existingKeys.has(field.key))
    .map((field) => field.key);
};

const mergeOrderFields = (currentFields: CollectionField[]): CollectionField[] => {
  const fieldsByKey = new Map(currentFields.map((field) => [field.key, field]));
  const merged = ORDER_FIELDS.map((requiredField) => ({
    ...requiredField,
    ...fieldsByKey.get(requiredField.key),
    sortOrder: requiredField.sortOrder,
  }));
  const requiredKeys = new Set(ORDER_FIELDS.map((field) => field.key));
  const customFields = currentFields.filter((field) => !requiredKeys.has(field.key));
  return [...merged, ...customFields].sort((a, b) => a.sortOrder - b.sortOrder);
};

const parseJsonArray = (value: unknown): unknown[] => {
  if (Array.isArray(value)) return value;
  if (typeof value !== 'string') return [];

  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

const lineItemText = (value: unknown): string => (
  typeof value === 'string' ? value.trim() : ''
);

const normalizeOrderLineItem = (value: unknown, index: number, fallbackCurrency: string): OrderLineItem | null => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;

  const record = value as Record<string, unknown>;
  const variant = record.variant && typeof record.variant === 'object' && !Array.isArray(record.variant)
    ? record.variant as Record<string, unknown>
    : {};
  const title = lineItemText(record.title || record.name);
  if (!title) return null;

  const quantity = Math.max(1, Math.floor(toNumber(record.quantity || 1)));
  const price = moneyValue(toNumber(record.price ?? record.unitPrice ?? record.amount));
  const lineTotal = moneyValue(toNumber(record.lineTotal ?? record.total ?? price * quantity));
  const currency = normalizeCurrency(lineItemText(record.currency) || fallbackCurrency);
  const variantTitle = lineItemText(variant.title || record.variantTitle || record.variantName);
  const variantOption = lineItemText(variant.option || record.variantOption || record.option);
  const variantSku = lineItemText(variant.sku || record.variantSku);

  return {
    id: lineItemText(record.id) || lineItemText(record.lineItemId) || `${lineItemText(record.productId) || lineItemText(record.slug) || 'item'}-${index}`,
    productId: lineItemText(record.productId),
    slug: lineItemText(record.slug),
    title,
    sku: lineItemText(record.sku),
    variantTitle,
    variantOption,
    variantSku,
    quantity,
    price,
    currency,
    lineTotal,
  };
};

const parseOrderLineItems = (value: unknown, fallbackCurrency = 'USD'): OrderLineItem[] => (
  parseJsonArray(value)
    .map((item, index) => normalizeOrderLineItem(item, index, fallbackCurrency))
    .filter((item): item is OrderLineItem => Boolean(item))
);

const serializeOrderLineItems = (items: OrderLineItem[], fallbackCurrency: string): string => (
  JSON.stringify(
    items.map((item) => ({
      id: item.id,
      productId: item.productId,
      slug: item.slug,
      title: item.title,
      sku: item.sku,
      variant: item.variantTitle || item.variantOption || item.variantSku
        ? {
            title: item.variantTitle,
            option: item.variantOption,
            sku: item.variantSku,
          }
        : null,
      quantity: item.quantity,
      price: item.price,
      currency: normalizeCurrency(item.currency || fallbackCurrency),
      lineTotal: moneyValue(item.lineTotal || item.price * item.quantity),
    })),
    null,
    2,
  )
);

const formatOrderItemSummary = (value: unknown, fallbackCurrency = 'USD'): string => {
  const items = parseOrderLineItems(value, fallbackCurrency);
  if (items.length === 0) return typeof value === 'string' ? value.trim() : '';

  return items
    .map((item) => {
      const variant = item.variantTitle || item.variantOption || item.variantSku;
      return `${item.title}${variant ? ` (${variant})` : ''} x${item.quantity} ${formatMoney(item.lineTotal, item.currency)}`;
    })
    .join('; ');
};

const formatOrderItemsForExport = (value: unknown, fallbackCurrency = 'USD'): string => (
  formatOrderItemSummary(value, fallbackCurrency)
);

type OrderExportColumn = typeof ORDER_EXPORT_COLUMNS[number];

const optionalNumber = (value: unknown): number | null => (
  value === null || value === undefined || value === '' ? null : toNumber(value)
);

interface OrderExportContext {
  activeSiteId: string;
  adminOrdersApiUrl: string;
  publicOrdersApiUrl: string;
  adminOnly: boolean;
}

const orderToExportRecord = (
  order: CollectionRecord,
  context: OrderExportContext,
): Record<OrderExportColumn, string | number | boolean | null> => ({
  order_id: order.id,
  active_site_id: context.activeSiteId,
  slug: order.slug,
  record_status: order.status,
  order_number: String(readOrderValue(order.values, 'ordernumber', order.slug)),
  customer_name: String(readOrderValue(order.values, 'customername', '')),
  email: String(order.values.email || ''),
  phone: String(readOrderValue(order.values, 'phone', '')),
  total: toNumber(order.values.total),
  subtotal: optionalNumber(readOrderValue(order.values, 'subtotal', null)),
  tax_amount: optionalNumber(readOrderValue(order.values, 'taxamount', null)),
  shipping_amount: optionalNumber(readOrderValue(order.values, 'shippingamount', null)),
  discount_amount: optionalNumber(readOrderValue(order.values, 'discountamount', null)),
  currency: normalizeCurrency(String(order.values.currency || 'USD')),
  items: formatOrderItemsForExport(order.values.items, String(order.values.currency || 'USD')),
  line_item_count: parseOrderLineItems(order.values.items, String(order.values.currency || 'USD')).length,
  order_source: asOrderSource(readOrderValue(order.values, 'ordersource', undefined)),
  checkout_session_id: String(readOrderValue(order.values, 'checkoutsessionid', '')),
  customer_id: String(readOrderValue(order.values, 'customerid', '')),
  order_status: asOrderStatus(readOrderValue(order.values, 'orderstatus', undefined)),
  payment_status: asPaymentStatus(readOrderValue(order.values, 'paymentstatus', undefined)),
  payment_provider: String(readOrderValue(order.values, 'paymentprovider', '')),
  payment_reference: String(readOrderValue(order.values, 'paymentreference', '')),
  paid_at: String(readOrderValue(order.values, 'paidat', '') || ''),
  fulfillment_status: asFulfillmentStatus(readOrderValue(order.values, 'fulfillmentstatus', undefined)),
  fulfillment_carrier: String(readOrderValue(order.values, 'fulfillmentcarrier', '')),
  tracking_number: String(readOrderValue(order.values, 'trackingnumber', '')),
  tracking_url: String(readOrderValue(order.values, 'trackingurl', '')),
  fulfilled_at: String(readOrderValue(order.values, 'fulfilledat', '') || ''),
  shipping_address: String(readOrderValue(order.values, 'shippingaddress', '')),
  billing_address: String(readOrderValue(order.values, 'billingaddress', '')),
  refund_amount: optionalNumber(readOrderValue(order.values, 'refundamount', null)),
  refund_reason: String(readOrderValue(order.values, 'refundreason', '')),
  notes: String(order.values.notes || ''),
  admin_order_url: `${context.adminOrdersApiUrl}/${encodeURIComponent(order.id)}`,
  public_blocked_url: context.publicOrdersApiUrl,
  admin_only: context.adminOnly,
  backend_systems: ORDER_BACKEND_SYSTEMS.map((system) => `${system.key}:${system.title}`).join('; '),
  created_at: order.createdAt || '',
  updated_at: order.updatedAt || '',
});

const csvEscape = (value: unknown): string => {
  const raw = String(value ?? '').replace(/\r?\n/g, '\\n');
  return `"${raw.replace(/"/g, '""')}"`;
};
