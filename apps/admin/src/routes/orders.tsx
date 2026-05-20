import { ChangeEvent, FormEvent, type ReactNode, useEffect, useMemo, useRef, useState } from 'react';
import { Link, createFileRoute, useNavigate } from '@tanstack/react-router';
import {
  AlertTriangle,
  Archive,
  BarChart3,
  CheckCircle2,
  ClipboardCheck,
  Code2,
  Copy,
  CreditCard,
  Download,
  Clock3,
  ExternalLink,
  FileText,
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
  Upload,
  Users,
} from 'lucide-react';
import {
  createCollection,
  createCollectionRecord,
  createOrderProviderRefund,
  createOrderShippingLabel,
  deleteCollectionRecord,
  dispatchOrderFulfillment,
  getSettings,
  getUserPermissions,
  getCommerceReconciliationReadiness,
  getOrderAnalytics,
  adminFetch,
  importCollectionRecordsCsv,
  getCollectionRecord,
  listOrderDeliveryEvents,
  listCollectionRecords,
  listCollections,
  refreshOrderQuote,
  refreshOrderProviderRefund,
  refreshOrderTracking,
  reconcileCommerceOrders,
  updateCollection,
  updateCollectionRecord,
  voidOrderShippingLabel,
  type CommerceReconciliationResult,
  type CommerceCronReadiness,
  type Collection,
  type CollectionField,
  type CollectionRecord,
  type CollectionRecordPagination,
  type SiteSettingsInput,
  type OrderAnalytics,
  type OrderDeliveryEvent,
  type AdminUserPermissionMatrix,
} from '@/lib/adminContentApi';
import { useStore, type ContentStatus } from '@/stores/mockStore';
import { useAuthStore, type User as AuthUser } from '@/stores/authStore';
import { PageShell } from '@/components/layout/PageShell';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { Panel, PanelContent, PanelHeader } from '@/components/ui/Panel';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { adminPermissionReason, isAdminPermissionAllowed } from '@/lib/adminPermissionUi';
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
    title: 'Analytics',
    detail: 'Backend totals by payment state, fulfillment state, order source, and recent trend.',
    href: '#orders-analytics',
  },
  {
    title: 'Order queue',
    detail: 'Search, filter, mark paid, fulfill, record manual cancellations, edit, and delete records.',
    href: '#orders-queue',
  },
  {
    title: 'Order editor',
    detail: 'Customer, items, payment, fulfillment, tracking, refunds, and notes.',
    href: '#orders-editor',
  },
] as const;

const ORDER_RECORD_PAGE_SIZE = 100;

type OrderFilter = 'all' | 'open' | 'paid' | 'fulfilled' | 'cancelled' | 'refunded';
type OrderWorkflowStatus = 'open' | 'paid' | 'fulfilled' | 'cancelled' | 'refunded';
type PaymentStatus = 'pending' | 'paid' | 'failed' | 'refunded';
type FulfillmentStatus = 'unfulfilled' | 'processing' | 'fulfilled' | 'cancelled';
type OrderSource = 'web' | 'manual' | 'api' | 'import' | 'pos';
type OrderRiskLevel = 'low' | 'medium' | 'high';
type OrderRiskReviewStatus = 'cleared' | 'pending_review' | 'approved' | 'held';
type ShippingLabelStatus = 'none' | 'draft' | 'purchased' | 'voided';
type FulfillmentDispatchStatus = 'none' | 'requested' | 'succeeded' | 'failed' | 'requires_action';
type ProviderRefundStatus = 'none' | 'requested' | 'succeeded' | 'failed' | 'requires_action';
type PaymentStatusFilter = PaymentStatus | 'all';
type FulfillmentStatusFilter = FulfillmentStatus | 'all';
type OrderSourceFilter = OrderSource | 'all';
type CommerceProviderSettings = NonNullable<NonNullable<SiteSettingsInput['integrations']>['commerce']>;
type RuntimeCommerceSettings = NonNullable<SiteSettingsInput['runtimeCommerce']>;
type OrderPermissionKey =
  | 'commerce.view'
  | 'commerce.edit'
  | 'commerce.configure'
  | 'commerce.delete'
  | 'collections.view'
  | 'collections.edit'
  | 'collections.export'
  | 'collections.delete'
  | 'pages.edit';

const ORDER_PERMISSION_ROLE_DEFAULTS: Record<OrderPermissionKey, Array<AuthUser['role']>> = {
  'commerce.view': ['owner', 'admin', 'editor', 'viewer'],
  'commerce.edit': ['owner', 'admin', 'editor'],
  'commerce.configure': ['owner', 'admin'],
  'commerce.delete': ['owner', 'admin'],
  'collections.view': ['owner', 'admin', 'editor', 'viewer'],
  'collections.edit': ['owner', 'admin', 'editor'],
  'collections.export': ['owner', 'admin'],
  'collections.delete': ['owner', 'admin'],
  'pages.edit': ['owner', 'admin', 'editor'],
};

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
  trackingStatus: string;
  trackingLastCheckedAt: string;
  fulfilledAt: string;
  shippingLabelStatus: ShippingLabelStatus;
  shippingLabelProvider: string;
  shippingLabelId: string;
  shippingLabelUrl: string;
  shippingServiceLevel: string;
  shippingLabelCost: string;
  shippingLabelCreatedAt: string;
  fulfillmentDispatchStatus: FulfillmentDispatchStatus;
  fulfillmentProvider: string;
  fulfillmentId: string;
  fulfillmentRequestedAt: string;
  fulfillmentCompletedAt: string;
  fulfillmentPayload: string;
  riskScore: string;
  riskLevel: OrderRiskLevel;
  riskReasons: string;
  riskReviewStatus: OrderRiskReviewStatus;
  shippingAddress: string;
  billingAddress: string;
  refundAmount: string;
  refundReason: string;
  providerRefundStatus: ProviderRefundStatus;
  providerRefundProvider: string;
  providerRefundId: string;
  providerRefundReference: string;
  providerRefundAmount: string;
  providerRefundReason: string;
  providerRefundRequestedAt: string;
  providerRefundCompletedAt: string;
  providerRefundPayload: string;
  notes: string;
  recordStatus: ContentStatus;
}

const ORDERS_COLLECTION_SLUG = 'orders';
const CUSTOMERS_COLLECTION_SLUG = 'customers';
const ORDER_FILTERS: OrderFilter[] = ['all', 'open', 'paid', 'fulfilled', 'cancelled', 'refunded'];
const PAYMENT_STATUS_FILTERS: PaymentStatusFilter[] = ['all', 'pending', 'paid', 'failed', 'refunded'];
const FULFILLMENT_STATUS_FILTERS: FulfillmentStatusFilter[] = ['all', 'unfulfilled', 'processing', 'fulfilled', 'cancelled'];
const ORDER_SOURCE_FILTERS: OrderSourceFilter[] = ['all', 'web', 'manual', 'api', 'import', 'pos'];
const CUSTOMER_STATUS_OPTIONS = ['lead', 'customer', 'vip', 'inactive'] as const;

type CustomerStatusOption = (typeof CUSTOMER_STATUS_OPTIONS)[number];

interface CustomerProfileDraft {
  name: string;
  email: string;
  phone: string;
  status: CustomerStatusOption;
  notes: string;
}

const isOrderFilter = (value: unknown): value is OrderFilter => (
  typeof value === 'string' && ORDER_FILTERS.includes(value as OrderFilter)
);

const isOrderCollectionPrivate = (collection: Collection | null) => Boolean(
  collection &&
  !collection.permissions.publicRead &&
  !collection.permissions.publicCreate &&
  !collection.permissions.publicUpdate &&
  !collection.permissions.publicDelete,
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
  { key: 'trackingstatus', label: 'Tracking Status', type: 'text', required: false, unique: false, sortOrder: 165 },
  { key: 'trackinglastcheckedat', label: 'Tracking Last Checked At', type: 'date', required: false, unique: false, sortOrder: 166 },
  { key: 'fulfilledat', label: 'Fulfilled At', type: 'date', required: false, unique: false, sortOrder: 170 },
  { key: 'shippinglabelstatus', label: 'Shipping Label Status', type: 'select', required: false, unique: false, sortOrder: 171, options: ['none', 'draft', 'purchased', 'voided'], defaultValue: 'none' },
  { key: 'shippinglabelprovider', label: 'Shipping Label Provider', type: 'text', required: false, unique: false, sortOrder: 172 },
  { key: 'shippinglabelid', label: 'Shipping Label ID', type: 'text', required: false, unique: false, sortOrder: 173 },
  { key: 'shippinglabelurl', label: 'Shipping Label URL', type: 'url', required: false, unique: false, sortOrder: 174 },
  { key: 'shippingservicelevel', label: 'Shipping Service Level', type: 'text', required: false, unique: false, sortOrder: 175 },
  { key: 'shippinglabelcost', label: 'Shipping Label Cost', type: 'number', required: false, unique: false, sortOrder: 176 },
  { key: 'shippinglabelcreatedat', label: 'Shipping Label Created At', type: 'date', required: false, unique: false, sortOrder: 177 },
  { key: 'fulfillmentdispatchstatus', label: 'Fulfillment Dispatch Status', type: 'select', required: false, unique: false, sortOrder: 178, options: ['none', 'requested', 'succeeded', 'failed', 'requires_action'], defaultValue: 'none' },
  { key: 'fulfillmentprovider', label: 'Fulfillment Provider', type: 'text', required: false, unique: false, sortOrder: 179 },
  { key: 'fulfillmentid', label: 'Fulfillment ID', type: 'text', required: false, unique: false, sortOrder: 180 },
  { key: 'fulfillmentrequestedat', label: 'Fulfillment Requested At', type: 'date', required: false, unique: false, sortOrder: 181 },
  { key: 'fulfillmentcompletedat', label: 'Fulfillment Completed At', type: 'date', required: false, unique: false, sortOrder: 182 },
  { key: 'fulfillmentpayload', label: 'Fulfillment Payload', type: 'richText', required: false, unique: false, sortOrder: 183 },
  { key: 'riskscore', label: 'Risk Score', type: 'number', required: false, unique: false, sortOrder: 180, defaultValue: 0 },
  { key: 'risklevel', label: 'Risk Level', type: 'select', required: false, unique: false, sortOrder: 182, options: ['low', 'medium', 'high'], defaultValue: 'low' },
  { key: 'riskreasons', label: 'Risk Reasons', type: 'richText', required: false, unique: false, sortOrder: 184 },
  { key: 'riskreviewstatus', label: 'Risk Review Status', type: 'select', required: false, unique: false, sortOrder: 186, options: ['cleared', 'pending_review', 'approved', 'held'], defaultValue: 'cleared' },
  { key: 'shippingaddress', label: 'Shipping Address', type: 'richText', required: false, unique: false, sortOrder: 190 },
  { key: 'billingaddress', label: 'Billing Address', type: 'richText', required: false, unique: false, sortOrder: 200 },
  { key: 'refundamount', label: 'Refund Amount', type: 'number', required: false, unique: false, sortOrder: 210 },
  { key: 'refundreason', label: 'Refund Reason', type: 'richText', required: false, unique: false, sortOrder: 220 },
  { key: 'providerrefundstatus', label: 'Provider Refund Status', type: 'select', required: false, unique: false, sortOrder: 221, options: ['none', 'requested', 'succeeded', 'failed', 'requires_action'], defaultValue: 'none' },
  { key: 'providerrefundprovider', label: 'Provider Refund Provider', type: 'text', required: false, unique: false, sortOrder: 222 },
  { key: 'providerrefundid', label: 'Provider Refund ID', type: 'text', required: false, unique: false, sortOrder: 223 },
  { key: 'providerrefundreference', label: 'Provider Refund Reference', type: 'text', required: false, unique: false, sortOrder: 224 },
  { key: 'providerrefundamount', label: 'Provider Refund Amount', type: 'number', required: false, unique: false, sortOrder: 225 },
  { key: 'providerrefundreason', label: 'Provider Refund Reason', type: 'richText', required: false, unique: false, sortOrder: 226 },
  { key: 'providerrefundrequestedat', label: 'Provider Refund Requested At', type: 'date', required: false, unique: false, sortOrder: 227 },
  { key: 'providerrefundcompletedat', label: 'Provider Refund Completed At', type: 'date', required: false, unique: false, sortOrder: 228 },
  { key: 'providerrefundpayload', label: 'Provider Refund Payload', type: 'richText', required: false, unique: false, sortOrder: 229 },
  { key: 'notes', label: 'Internal Notes', type: 'richText', required: false, unique: false, sortOrder: 240 },
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
  'tracking_status',
  'tracking_last_checked_at',
  'fulfilled_at',
  'shipping_label_status',
  'shipping_label_provider',
  'shipping_label_id',
  'shipping_label_url',
  'shipping_service_level',
  'shipping_label_cost',
  'shipping_label_created_at',
  'fulfillment_dispatch_status',
  'fulfillment_provider',
  'fulfillment_id',
  'fulfillment_requested_at',
  'fulfillment_completed_at',
  'fulfillment_payload',
  'risk_score',
  'risk_level',
  'risk_reasons',
  'risk_review_status',
  'shipping_address',
  'billing_address',
  'refund_amount',
  'refund_reason',
  'provider_refund_status',
  'provider_refund_provider',
  'provider_refund_id',
  'provider_refund_reference',
  'provider_refund_amount',
  'provider_refund_reason',
  'provider_refund_requested_at',
  'provider_refund_completed_at',
  'provider_refund_payload',
  'notes',
  'admin_order_url',
  'public_blocked_url',
  'admin_only',
  'backend_systems',
  'created_at',
  'updated_at',
] as const;

const ORDER_IMPORT_COLUMNS = [
  'slug',
  'status',
  'ordernumber',
  'customername',
  'email',
  'phone',
  'total',
  'subtotal',
  'taxamount',
  'shippingamount',
  'discountamount',
  'currency',
  'items',
  'ordersource',
  'checkoutsessionid',
  'customerid',
  'orderstatus',
  'paymentstatus',
  'paymentprovider',
  'paymentreference',
  'paidat',
  'fulfillmentstatus',
  'fulfillmentcarrier',
  'trackingnumber',
  'trackingurl',
  'trackingstatus',
  'trackinglastcheckedat',
  'fulfilledat',
  'shippinglabelstatus',
  'shippinglabelprovider',
  'shippinglabelid',
  'shippinglabelurl',
  'shippingservicelevel',
  'shippinglabelcost',
  'shippinglabelcreatedat',
  'fulfillmentdispatchstatus',
  'fulfillmentprovider',
  'fulfillmentid',
  'fulfillmentrequestedat',
  'fulfillmentcompletedat',
  'fulfillmentpayload',
  'riskscore',
  'risklevel',
  'riskreasons',
  'riskreviewstatus',
  'shippingaddress',
  'billingaddress',
  'refundamount',
  'refundreason',
  'providerrefundstatus',
  'providerrefundprovider',
  'providerrefundid',
  'providerrefundreference',
  'providerrefundamount',
  'providerrefundreason',
  'providerrefundrequestedat',
  'providerrefundcompletedat',
  'providerrefundpayload',
  'notes',
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
    detail: 'Payment status, provider, reference, checkout session, paid time, provider refund handoff, and accounting export fields.',
  },
  {
    key: 'fulfillment',
    title: 'Fulfillment operations',
    detail: 'Processing state, carrier, shipment label handoff, fulfillment dispatch payload, tracking number, tracking URL, fulfilled time, and cancellation flow.',
  },
  {
    key: 'customer',
    title: 'Customer support',
    detail: 'Customer name, email, phone, customer ID, billing/shipping addresses, and private order notes.',
  },
  {
    key: 'risk',
    title: 'Fraud risk review',
    detail: 'Checkout intake scores private orders, stores review reasons, and lets operators clear or hold risky orders.',
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

const ORDER_API_CONTRACTS = [
  {
    key: 'analytics',
    title: 'Order analytics',
    methods: ['GET'],
    endpointKey: 'orderAnalytics',
    schemaVersion: 'backy.order-analytics.v1',
    cacheScope: 'private',
    detail: 'Revenue, payment, fulfillment, provider execution, and operations analytics.',
  },
  {
    key: 'quote',
    title: 'Pricing quote refresh',
    methods: ['GET', 'POST'],
    endpointKey: 'adminQuote',
    schemaVersion: 'backy.order-quote.v1',
    cacheScope: 'private',
    detail: 'Recalculates persisted order subtotal, tax, shipping, discount, total, and provider adjustments.',
  },
  {
    key: 'shipping-label',
    title: 'Shipping label',
    methods: ['GET', 'POST', 'DELETE'],
    endpointKey: 'adminShippingLabel',
    schemaVersion: 'backy.shipping-label.v1',
    cacheScope: 'private',
    detail: 'Reads, prepares, purchases, and voids label metadata and provider payloads.',
  },
  {
    key: 'fulfillment',
    title: 'Fulfillment dispatch',
    methods: ['GET', 'POST'],
    endpointKey: 'adminFulfillment',
    schemaVersion: 'backy.fulfillment-dispatch.v1',
    cacheScope: 'private',
    detail: 'Reads and dispatches warehouse, 3PL, HTTP provider, or manual fulfillment handoffs.',
  },
  {
    key: 'tracking',
    title: 'Shipment tracking',
    methods: ['GET', 'POST'],
    endpointKey: 'adminTracking',
    schemaVersion: 'backy.tracking.v1',
    cacheScope: 'private',
    detail: 'Reads and refreshes carrier tracking state through EasyPost, Shippo, or manual handoff.',
  },
  {
    key: 'provider-refund',
    title: 'Provider refund',
    methods: ['GET', 'POST', 'PATCH'],
    endpointKey: 'adminProviderRefund',
    schemaVersion: 'backy.provider-refund.v1',
    cacheScope: 'private',
    detail: 'Reads, creates, and refreshes provider refund metadata and execution payloads.',
  },
  {
    key: 'commerce-webhook',
    title: 'Commerce webhook settlement',
    methods: ['POST'],
    endpointKey: 'commerceWebhook',
    schemaVersion: 'backy.commerce-webhook.v1',
    cacheScope: 'private',
    detail: 'Settles provider payment, subscription, and refund webhook events into private orders.',
  },
  {
    key: 'site-reconciliation',
    title: 'Site reconciliation',
    methods: ['GET', 'POST'],
    endpointKey: 'siteReconciliation',
    schemaVersion: 'backy.commerce-reconciliation.v1',
    cacheScope: 'private',
    detail: 'Runs dry-run or repair reconciliation for one site from commerce webhook activity.',
  },
  {
    key: 'platform-reconciliation',
    title: 'Platform reconciliation',
    methods: ['GET'],
    endpointKey: 'platformReconciliation',
    schemaVersion: 'backy.commerce-reconciliation-batch.v1',
    cacheScope: 'private',
    detail: 'Runs scheduled platform reconciliation across sites with per-site results.',
  },
  {
    key: 'reconciliation-readiness',
    title: 'Reconciliation readiness',
    methods: ['GET'],
    endpointKey: 'reconciliationReadiness',
    schemaVersion: 'backy.commerce-reconciliation-readiness.v1',
    cacheScope: 'private',
    detail: 'Reports cron, secret, and admin-key readiness for scheduled order repair.',
  },
] as const;

const ORDER_PROVIDER_CERTIFICATION_GROUPS = [
  {
    family: 'Checkout and payment settlement',
    providers: ['Stripe checkout', 'Stripe webhooks', 'PayPal', 'Paddle', 'Square', 'Adyen', 'Mollie', 'Razorpay'],
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
    evidence: 'Live payment credentials, signed webhook secrets, and provider settlement events.',
  },
  {
    family: 'Quote recalculation',
    providers: ['HTTP tax', 'Stripe Tax', 'TaxJar', 'Avalara', 'HTTP shipping', 'EasyPost rates', 'Shippo rates', 'Stripe promotion codes'],
    gate: 'ci:commerce-provider-certification',
    requiredInputs: [
      'BACKY_STRIPE_SECRET_KEY or STRIPE_SECRET_KEY',
      'BACKY_TAXJAR_API_KEY or TAXJAR_API_KEY',
      'BACKY_AVALARA_ACCOUNT_ID/AVALARA_ACCOUNT_ID plus license and company code',
      'BACKY_EASYPOST_API_KEY or EASYPOST_API_KEY',
      'BACKY_SHIPPO_API_KEY or SHIPPO_API_KEY',
      'BACKY_COMMERCE_TAX_PROVIDER_URL or COMMERCE_TAX_PROVIDER_URL',
      'BACKY_COMMERCE_SHIPPING_PROVIDER_URL or COMMERCE_SHIPPING_PROVIDER_URL',
    ],
    evidence: 'Live tax, shipping-rate, and discount provider credentials or selected HTTP endpoints.',
  },
  {
    family: 'Carrier labels and tracking',
    providers: ['EasyPost labels', 'EasyPost tracking', 'Shippo labels', 'Shippo tracking'],
    gate: 'ci:commerce-provider-certification',
    requiredInputs: [
      'BACKY_EASYPOST_API_KEY or EASYPOST_API_KEY',
      'BACKY_SHIPPO_API_KEY or SHIPPO_API_KEY',
    ],
    evidence: 'Live carrier label purchase, void/refund, and tracking credentials.',
  },
  {
    family: 'Fulfillment dispatch',
    providers: ['HTTP warehouse', 'HTTP 3PL', 'Manual handoff'],
    gate: 'ci:commerce-provider-certification',
    requiredInputs: [
      'configured Settings commerce fulfillment provider endpoint',
      'warehouse/3PL provider credential references',
    ],
    evidence: 'Live warehouse/3PL endpoint credentials or an explicit manual operations path.',
  },
  {
    family: 'Provider refunds',
    providers: ['Stripe refunds', 'PayPal refunds', 'Paddle refunds', 'Square refunds', 'Adyen refunds', 'Mollie refunds', 'Razorpay refunds'],
    gate: 'ci:commerce-provider-certification',
    requiredInputs: [
      'BACKY_STRIPE_SECRET_KEY or STRIPE_SECRET_KEY',
      'BACKY_PAYPAL_ACCESS_TOKEN or PAYPAL_ACCESS_TOKEN',
      'BACKY_PADDLE_API_KEY or PADDLE_API_KEY',
      'BACKY_SQUARE_ACCESS_TOKEN or SQUARE_ACCESS_TOKEN',
      'BACKY_ADYEN_API_KEY or ADYEN_API_KEY',
      'BACKY_MOLLIE_API_KEY or MOLLIE_API_KEY',
      'BACKY_RAZORPAY_KEY_ID/BACKY_RAZORPAY_KEY_SECRET or RAZORPAY_KEY_ID/RAZORPAY_KEY_SECRET',
    ],
    evidence: 'Live refund credentials plus provider-specific reference formats and refresh/webhook behavior.',
  },
  {
    family: 'Mock provider regression',
    providers: ['Local provider mocks'],
    gate: 'ci:commerce-provider-smoke',
    requiredInputs: ['No live provider credentials required'],
    evidence: 'Repeatable checkout, quote, label, tracking, fulfillment, refund, webhook, and reconciliation coverage without live credentials.',
  },
] as const;

const ORDER_PROVIDER_CERTIFICATION_OPERATOR_GATE = 'BACKY_COMMERCE_PROVIDER_CERTIFICATION_REQUIRED=1 npm run ci:commerce-provider-certification';
const ORDER_PROVIDER_CERTIFICATION_PREFLIGHT_GATES = [
  'npm run test:commerce-provider-certification-preflight-contract',
  'BACKY_RELEASE_CERTIFICATION_DOCTOR_REQUIRED=1 npm run doctor:release-certification',
] as const;
const ORDER_PROVIDER_CERTIFICATION_SELECTORS = [
  'BACKY_COMMERCE_CERTIFY_PAYMENT=1 with BACKY_COMMERCE_CERTIFY_PAYMENT_PROVIDER',
  'BACKY_COMMERCE_CERTIFY_TAX=1 with BACKY_COMMERCE_CERTIFY_TAX_PROVIDER',
  'BACKY_COMMERCE_CERTIFY_SHIPPING=1 with BACKY_COMMERCE_CERTIFY_SHIPPING_PROVIDER',
  'BACKY_COMMERCE_CERTIFY_DISCOUNT=1 with BACKY_COMMERCE_CERTIFY_DISCOUNT_PROVIDER',
  'BACKY_COMMERCE_CERTIFY_SUBSCRIPTIONS=1 with BACKY_COMMERCE_CERTIFY_SUBSCRIPTION_PROVIDER',
  'BACKY_COMMERCE_CERTIFY_WEBHOOKS=1 with BACKY_COMMERCE_CERTIFY_WEBHOOK_PROVIDER',
] as const;
const ORDER_PROVIDER_CERTIFICATION_EVIDENCE_EXPECTATIONS = [
  'commerce provider preflight output',
  'release certification doctor output',
  'safe local/external target summary',
  'selected provider-family flags',
  'runtime commerce diagnostic output',
  'credentialed order execution check output',
  'non-secret workflow summary without provider secrets',
] as const;

const ORDER_PROVIDER_CERTIFICATION_PAYMENT_PROVIDER_OPTIONS = [
  { value: 'auto', label: 'Auto', description: 'Use the first configured live payment/refund provider credential.' },
  { value: 'stripe', label: 'Stripe', description: 'Require Stripe checkout/refund credentials.' },
  { value: 'paypal', label: 'PayPal', description: 'Require PayPal refund credentials.' },
  { value: 'paddle', label: 'Paddle', description: 'Require Paddle adjustment credentials.' },
  { value: 'square', label: 'Square', description: 'Require Square refund credentials.' },
  { value: 'adyen', label: 'Adyen', description: 'Require Adyen API and merchant-account credentials.' },
  { value: 'mollie', label: 'Mollie', description: 'Require Mollie refund credentials.' },
  { value: 'razorpay', label: 'Razorpay', description: 'Require Razorpay key id and secret credentials.' },
] as const;
const ORDER_PROVIDER_CERTIFICATION_TAX_PROVIDER_OPTIONS = [
  { value: 'auto', label: 'Auto', description: 'Use the first configured live tax quote credential.' },
  { value: 'stripe', label: 'Stripe Tax', description: 'Require Stripe Tax credentials.' },
  { value: 'taxjar', label: 'TaxJar', description: 'Require TaxJar credentials.' },
  { value: 'avalara', label: 'Avalara', description: 'Require Avalara account, license, and company code.' },
  { value: 'http', label: 'HTTP', description: 'Require a Settings tax quote provider URL.' },
] as const;
const ORDER_PROVIDER_CERTIFICATION_SHIPPING_PROVIDER_OPTIONS = [
  { value: 'auto', label: 'Auto', description: 'Use the first configured live shipping credential.' },
  { value: 'easypost', label: 'EasyPost', description: 'Require EasyPost rates, labels, refunds, and tracking credentials.' },
  { value: 'shippo', label: 'Shippo', description: 'Require Shippo rates, labels, refunds, and tracking credentials.' },
  { value: 'http', label: 'HTTP', description: 'Require a Settings shipping quote provider URL.' },
] as const;
const ORDER_PROVIDER_CERTIFICATION_DISCOUNT_PROVIDER_OPTIONS = [
  { value: 'auto', label: 'Auto', description: 'Use the first configured live discount credential or endpoint.' },
  { value: 'stripe', label: 'Stripe promotion codes', description: 'Require Stripe promotion-code lookup credentials.' },
  { value: 'http', label: 'HTTP', description: 'Require a Settings discount quote provider URL.' },
] as const;
const ORDER_PROVIDER_CERTIFICATION_SUBSCRIPTION_PROVIDER_OPTIONS = [
  ...ORDER_PROVIDER_CERTIFICATION_PAYMENT_PROVIDER_OPTIONS,
  { value: 'http', label: 'HTTP', description: 'Require a Settings subscription action provider URL.' },
] as const;
const ORDER_PROVIDER_CERTIFICATION_WEBHOOK_PROVIDER_OPTIONS = [
  ...ORDER_PROVIDER_CERTIFICATION_PAYMENT_PROVIDER_OPTIONS,
  { value: 'generic', label: 'Generic', description: 'Require a signed Backy commerce webhook secret only.' },
] as const;

type OrderProviderCertificationPaymentProvider = (typeof ORDER_PROVIDER_CERTIFICATION_PAYMENT_PROVIDER_OPTIONS)[number]['value'];
type OrderProviderCertificationTaxProvider = (typeof ORDER_PROVIDER_CERTIFICATION_TAX_PROVIDER_OPTIONS)[number]['value'];
type OrderProviderCertificationShippingProvider = (typeof ORDER_PROVIDER_CERTIFICATION_SHIPPING_PROVIDER_OPTIONS)[number]['value'];
type OrderProviderCertificationDiscountProvider = (typeof ORDER_PROVIDER_CERTIFICATION_DISCOUNT_PROVIDER_OPTIONS)[number]['value'];
type OrderProviderCertificationSubscriptionProvider = (typeof ORDER_PROVIDER_CERTIFICATION_SUBSCRIPTION_PROVIDER_OPTIONS)[number]['value'];
type OrderProviderCertificationWebhookProvider = (typeof ORDER_PROVIDER_CERTIFICATION_WEBHOOK_PROVIDER_OPTIONS)[number]['value'];

type OrderProviderCertificationCommandOptions = {
  certifyPayment: boolean;
  paymentProvider: OrderProviderCertificationPaymentProvider;
  certifyTax: boolean;
  taxProvider: OrderProviderCertificationTaxProvider;
  certifyShipping: boolean;
  shippingProvider: OrderProviderCertificationShippingProvider;
  certifyDiscount: boolean;
  discountProvider: OrderProviderCertificationDiscountProvider;
  certifySubscriptions: boolean;
  subscriptionProvider: OrderProviderCertificationSubscriptionProvider;
  certifyWebhooks: boolean;
  webhookProvider: OrderProviderCertificationWebhookProvider;
  includeFulfillmentEvidence: boolean;
  externalBaseUrl: string;
  includeReleaseDoctor: boolean;
};

const DEFAULT_ORDER_PROVIDER_CERTIFICATION_COMMAND_OPTIONS = {
  certifyPayment: true,
  paymentProvider: 'auto',
  certifyTax: true,
  taxProvider: 'auto',
  certifyShipping: true,
  shippingProvider: 'auto',
  certifyDiscount: true,
  discountProvider: 'auto',
  certifySubscriptions: true,
  subscriptionProvider: 'auto',
  certifyWebhooks: true,
  webhookProvider: 'auto',
  includeFulfillmentEvidence: true,
  externalBaseUrl: '',
  includeReleaseDoctor: true,
} satisfies OrderProviderCertificationCommandOptions;

const quoteOrderShellValue = (value: string): string => `'${value.replace(/'/g, "'\\''")}'`;
const orderBoolEnv = (value: boolean): '1' | '0' => (value ? '1' : '0');
const uniqueOrderCertificationInputs = (values: string[]): string[] => Array.from(new Set(values.filter(Boolean)));
const hasOrderProviderCertificationSelector = (options: OrderProviderCertificationCommandOptions): boolean => (
  options.certifyPayment ||
  options.certifyTax ||
  options.certifyShipping ||
  options.certifyDiscount ||
  options.certifySubscriptions ||
  options.certifyWebhooks
);

const ORDER_PROVIDER_CERTIFICATION_PAYMENT_INPUTS: Record<OrderProviderCertificationPaymentProvider, string[]> = {
  auto: [
    'at least one live payment/refund provider credential',
    'BACKY_STRIPE_SECRET_KEY or STRIPE_SECRET_KEY',
    'BACKY_PAYPAL_ACCESS_TOKEN or PAYPAL_ACCESS_TOKEN',
    'BACKY_PADDLE_API_KEY or PADDLE_API_KEY',
    'BACKY_SQUARE_ACCESS_TOKEN or SQUARE_ACCESS_TOKEN',
    'BACKY_ADYEN_API_KEY/BACKY_ADYEN_MERCHANT_ACCOUNT or ADYEN_API_KEY/ADYEN_MERCHANT_ACCOUNT',
    'BACKY_MOLLIE_API_KEY or MOLLIE_API_KEY',
    'BACKY_RAZORPAY_KEY_ID/BACKY_RAZORPAY_KEY_SECRET or RAZORPAY_KEY_ID/RAZORPAY_KEY_SECRET',
  ],
  stripe: ['BACKY_STRIPE_SECRET_KEY or STRIPE_SECRET_KEY'],
  paypal: ['BACKY_PAYPAL_ACCESS_TOKEN or PAYPAL_ACCESS_TOKEN'],
  paddle: ['BACKY_PADDLE_API_KEY or PADDLE_API_KEY'],
  square: ['BACKY_SQUARE_ACCESS_TOKEN or SQUARE_ACCESS_TOKEN'],
  adyen: ['BACKY_ADYEN_API_KEY/BACKY_ADYEN_MERCHANT_ACCOUNT or ADYEN_API_KEY/ADYEN_MERCHANT_ACCOUNT'],
  mollie: ['BACKY_MOLLIE_API_KEY or MOLLIE_API_KEY'],
  razorpay: ['BACKY_RAZORPAY_KEY_ID/BACKY_RAZORPAY_KEY_SECRET or RAZORPAY_KEY_ID/RAZORPAY_KEY_SECRET'],
};
const ORDER_PROVIDER_CERTIFICATION_TAX_INPUTS: Record<OrderProviderCertificationTaxProvider, string[]> = {
  auto: [
    'BACKY_STRIPE_SECRET_KEY or STRIPE_SECRET_KEY',
    'BACKY_TAXJAR_API_KEY or TAXJAR_API_KEY',
    'BACKY_AVALARA_ACCOUNT_ID/AVALARA_ACCOUNT_ID plus license and company code',
    'BACKY_COMMERCE_TAX_PROVIDER_URL or COMMERCE_TAX_PROVIDER_URL',
  ],
  stripe: ['BACKY_STRIPE_SECRET_KEY or STRIPE_SECRET_KEY'],
  taxjar: ['BACKY_TAXJAR_API_KEY or TAXJAR_API_KEY'],
  avalara: ['BACKY_AVALARA_ACCOUNT_ID/AVALARA_ACCOUNT_ID plus license and company code'],
  http: ['BACKY_COMMERCE_TAX_PROVIDER_URL or COMMERCE_TAX_PROVIDER_URL'],
};
const ORDER_PROVIDER_CERTIFICATION_SHIPPING_INPUTS: Record<OrderProviderCertificationShippingProvider, string[]> = {
  auto: [
    'BACKY_EASYPOST_API_KEY or EASYPOST_API_KEY',
    'BACKY_SHIPPO_API_KEY or SHIPPO_API_KEY',
    'BACKY_COMMERCE_SHIPPING_PROVIDER_URL or COMMERCE_SHIPPING_PROVIDER_URL',
  ],
  easypost: ['BACKY_EASYPOST_API_KEY or EASYPOST_API_KEY'],
  shippo: ['BACKY_SHIPPO_API_KEY or SHIPPO_API_KEY'],
  http: ['BACKY_COMMERCE_SHIPPING_PROVIDER_URL or COMMERCE_SHIPPING_PROVIDER_URL'],
};
const ORDER_PROVIDER_CERTIFICATION_DISCOUNT_INPUTS: Record<OrderProviderCertificationDiscountProvider, string[]> = {
  auto: [
    'BACKY_STRIPE_SECRET_KEY or STRIPE_SECRET_KEY',
    'BACKY_COMMERCE_DISCOUNT_PROVIDER_URL or COMMERCE_DISCOUNT_PROVIDER_URL',
  ],
  stripe: ['BACKY_STRIPE_SECRET_KEY or STRIPE_SECRET_KEY'],
  http: ['BACKY_COMMERCE_DISCOUNT_PROVIDER_URL or COMMERCE_DISCOUNT_PROVIDER_URL'],
};
const ORDER_PROVIDER_CERTIFICATION_SUBSCRIPTION_INPUTS: Record<OrderProviderCertificationSubscriptionProvider, string[]> = {
  ...ORDER_PROVIDER_CERTIFICATION_PAYMENT_INPUTS,
  http: ['BACKY_COMMERCE_SUBSCRIPTION_ACTION_URL or COMMERCE_SUBSCRIPTION_ACTION_URL'],
};
const ORDER_PROVIDER_CERTIFICATION_WEBHOOK_INPUTS: Record<OrderProviderCertificationWebhookProvider, string[]> = {
  auto: ['BACKY_COMMERCE_WEBHOOK_SECRET or COMMERCE_WEBHOOK_SECRET', 'payment-provider webhook signing credentials when provider-specific'],
  stripe: ['BACKY_COMMERCE_WEBHOOK_SECRET or COMMERCE_WEBHOOK_SECRET', 'BACKY_STRIPE_SECRET_KEY or STRIPE_SECRET_KEY'],
  paypal: ['BACKY_COMMERCE_WEBHOOK_SECRET or COMMERCE_WEBHOOK_SECRET', 'BACKY_PAYPAL_ACCESS_TOKEN or PAYPAL_ACCESS_TOKEN'],
  paddle: ['BACKY_COMMERCE_WEBHOOK_SECRET or COMMERCE_WEBHOOK_SECRET', 'BACKY_PADDLE_API_KEY or PADDLE_API_KEY'],
  square: ['BACKY_COMMERCE_WEBHOOK_SECRET or COMMERCE_WEBHOOK_SECRET', 'BACKY_SQUARE_ACCESS_TOKEN or SQUARE_ACCESS_TOKEN'],
  adyen: ['BACKY_COMMERCE_WEBHOOK_SECRET or COMMERCE_WEBHOOK_SECRET', 'BACKY_ADYEN_API_KEY/BACKY_ADYEN_MERCHANT_ACCOUNT or ADYEN_API_KEY/ADYEN_MERCHANT_ACCOUNT'],
  mollie: ['BACKY_COMMERCE_WEBHOOK_SECRET or COMMERCE_WEBHOOK_SECRET', 'BACKY_MOLLIE_API_KEY or MOLLIE_API_KEY'],
  razorpay: ['BACKY_COMMERCE_WEBHOOK_SECRET or COMMERCE_WEBHOOK_SECRET', 'BACKY_RAZORPAY_KEY_ID/BACKY_RAZORPAY_KEY_SECRET or RAZORPAY_KEY_ID/RAZORPAY_KEY_SECRET'],
  generic: ['BACKY_COMMERCE_WEBHOOK_SECRET or COMMERCE_WEBHOOK_SECRET'],
};

const buildOrderProviderCertificationCommand = (options: OrderProviderCertificationCommandOptions): string => {
  const selectedSelector = hasOrderProviderCertificationSelector(options);
  const externalBaseUrl = options.externalBaseUrl.trim().replace(/\/+$/, '');
  const envEntries: Array<[string, string]> = [
    ['BACKY_COMMERCE_PROVIDER_CERTIFICATION_REQUIRED', orderBoolEnv(selectedSelector)],
    ['BACKY_COMMERCE_CERTIFY_PAYMENT', orderBoolEnv(options.certifyPayment)],
    ['BACKY_COMMERCE_CERTIFY_PAYMENT_PROVIDER', options.paymentProvider],
    ['BACKY_COMMERCE_CERTIFY_TAX', orderBoolEnv(options.certifyTax)],
    ['BACKY_COMMERCE_CERTIFY_TAX_PROVIDER', options.taxProvider],
    ['BACKY_COMMERCE_CERTIFY_SHIPPING', orderBoolEnv(options.certifyShipping)],
    ['BACKY_COMMERCE_CERTIFY_SHIPPING_PROVIDER', options.shippingProvider],
    ['BACKY_COMMERCE_CERTIFY_DISCOUNT', orderBoolEnv(options.certifyDiscount)],
    ['BACKY_COMMERCE_CERTIFY_DISCOUNT_PROVIDER', options.discountProvider],
    ['BACKY_COMMERCE_CERTIFY_SUBSCRIPTIONS', orderBoolEnv(options.certifySubscriptions)],
    ['BACKY_COMMERCE_CERTIFY_SUBSCRIPTION_PROVIDER', options.subscriptionProvider],
    ['BACKY_COMMERCE_CERTIFY_WEBHOOKS', orderBoolEnv(options.certifyWebhooks)],
    ['BACKY_COMMERCE_CERTIFY_WEBHOOK_PROVIDER', options.webhookProvider],
  ];

  if (options.includeReleaseDoctor) {
    envEntries.unshift(['BACKY_RELEASE_CERTIFICATION_DOCTOR_REQUIRED', '1']);
  }

  if (externalBaseUrl) {
    envEntries.push(
      ['BACKY_COMMERCE_CERTIFICATION_BASE_URL', externalBaseUrl],
      ['BACKY_ADMIN_API_KEY', '<admin-api-key>'],
    );
  }

  if (options.certifyTax && options.taxProvider === 'http') {
    envEntries.push(['BACKY_COMMERCE_TAX_PROVIDER_URL', '<https-tax-provider-url>']);
  }
  if (options.certifyShipping && options.shippingProvider === 'http') {
    envEntries.push(['BACKY_COMMERCE_SHIPPING_PROVIDER_URL', '<https-shipping-provider-url>']);
  }
  if (options.certifyDiscount && options.discountProvider === 'http') {
    envEntries.push(['BACKY_COMMERCE_DISCOUNT_PROVIDER_URL', '<https-discount-provider-url>']);
  }
  if (options.certifySubscriptions && options.subscriptionProvider === 'http') {
    envEntries.push(['BACKY_COMMERCE_SUBSCRIPTION_ACTION_URL', '<https-subscription-action-url>']);
  }

  return [
    ...envEntries.map(([key, value]) => `export ${key}=${quoteOrderShellValue(value)}`),
    ...(options.includeFulfillmentEvidence ? [
      '# Configure Settings Commerce fulfillmentProvider=http and fulfillmentProviderUrl before attaching warehouse/3PL dispatch evidence.',
    ] : []),
    '',
    ...(options.includeReleaseDoctor ? ['npm run doctor:release-certification'] : []),
    selectedSelector ? 'npm run ci:commerce-provider-certification' : '# Select at least one commerce provider selector before running certification.',
  ].join('\n');
};

const buildOrderProviderCertificationRequiredInputs = (options: OrderProviderCertificationCommandOptions): string[] => {
  const externalBaseUrl = options.externalBaseUrl.trim();
  return uniqueOrderCertificationInputs([
    hasOrderProviderCertificationSelector(options) ? 'BACKY_COMMERCE_PROVIDER_CERTIFICATION_REQUIRED=1' : '',
    options.certifyPayment ? 'BACKY_COMMERCE_CERTIFY_PAYMENT=1' : '',
    options.certifyPayment ? 'BACKY_COMMERCE_CERTIFY_PAYMENT_PROVIDER' : '',
    ...(options.certifyPayment ? ORDER_PROVIDER_CERTIFICATION_PAYMENT_INPUTS[options.paymentProvider] : []),
    options.certifyTax ? 'BACKY_COMMERCE_CERTIFY_TAX=1' : '',
    options.certifyTax ? 'BACKY_COMMERCE_CERTIFY_TAX_PROVIDER' : '',
    ...(options.certifyTax ? ORDER_PROVIDER_CERTIFICATION_TAX_INPUTS[options.taxProvider] : []),
    options.certifyShipping ? 'BACKY_COMMERCE_CERTIFY_SHIPPING=1' : '',
    options.certifyShipping ? 'BACKY_COMMERCE_CERTIFY_SHIPPING_PROVIDER' : '',
    ...(options.certifyShipping ? ORDER_PROVIDER_CERTIFICATION_SHIPPING_INPUTS[options.shippingProvider] : []),
    options.certifyDiscount ? 'BACKY_COMMERCE_CERTIFY_DISCOUNT=1' : '',
    options.certifyDiscount ? 'BACKY_COMMERCE_CERTIFY_DISCOUNT_PROVIDER' : '',
    ...(options.certifyDiscount ? ORDER_PROVIDER_CERTIFICATION_DISCOUNT_INPUTS[options.discountProvider] : []),
    options.certifySubscriptions ? 'BACKY_COMMERCE_CERTIFY_SUBSCRIPTIONS=1' : '',
    options.certifySubscriptions ? 'BACKY_COMMERCE_CERTIFY_SUBSCRIPTION_PROVIDER' : '',
    ...(options.certifySubscriptions ? ORDER_PROVIDER_CERTIFICATION_SUBSCRIPTION_INPUTS[options.subscriptionProvider] : []),
    options.certifyWebhooks ? 'BACKY_COMMERCE_CERTIFY_WEBHOOKS=1' : '',
    options.certifyWebhooks ? 'BACKY_COMMERCE_CERTIFY_WEBHOOK_PROVIDER' : '',
    ...(options.certifyWebhooks ? ORDER_PROVIDER_CERTIFICATION_WEBHOOK_INPUTS[options.webhookProvider] : []),
    options.includeFulfillmentEvidence ? 'Settings commerce fulfillmentProvider=http plus fulfillmentProviderUrl' : '',
    externalBaseUrl ? 'BACKY_COMMERCE_CERTIFICATION_BASE_URL' : '',
    externalBaseUrl ? 'BACKY_ADMIN_API_KEY or BACKY_COMMERCE_CERTIFICATION_ADMIN_KEY' : '',
    options.includeReleaseDoctor ? 'BACKY_RELEASE_CERTIFICATION_DOCTOR_REQUIRED=1' : '',
  ]);
};

const ORDER_PROVIDER_CERTIFICATION_OPERATOR_COMMAND_TEMPLATE = {
  command: buildOrderProviderCertificationCommand(DEFAULT_ORDER_PROVIDER_CERTIFICATION_COMMAND_OPTIONS),
  providerChoices: {
    payment: ORDER_PROVIDER_CERTIFICATION_PAYMENT_PROVIDER_OPTIONS.map((option) => option.value),
    tax: ORDER_PROVIDER_CERTIFICATION_TAX_PROVIDER_OPTIONS.map((option) => option.value),
    shipping: ORDER_PROVIDER_CERTIFICATION_SHIPPING_PROVIDER_OPTIONS.map((option) => option.value),
    discount: ORDER_PROVIDER_CERTIFICATION_DISCOUNT_PROVIDER_OPTIONS.map((option) => option.value),
    subscription: ORDER_PROVIDER_CERTIFICATION_SUBSCRIPTION_PROVIDER_OPTIONS.map((option) => option.value),
    webhook: ORDER_PROVIDER_CERTIFICATION_WEBHOOK_PROVIDER_OPTIONS.map((option) => option.value),
  },
  requiredInputs: buildOrderProviderCertificationRequiredInputs(DEFAULT_ORDER_PROVIDER_CERTIFICATION_COMMAND_OPTIONS),
  targetInputs: [
    'BACKY_COMMERCE_CERTIFICATION_BASE_URL',
    'BACKY_ADMIN_API_KEY or BACKY_COMMERCE_CERTIFICATION_ADMIN_KEY',
  ],
  secretHandling: 'Provider credential values stay in CI secrets or local shell environment variables; this template only emits non-secret aliases and placeholders.',
};

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
  trackingStatus: '',
  trackingLastCheckedAt: '',
  fulfilledAt: '',
  shippingLabelStatus: 'none',
  shippingLabelProvider: '',
  shippingLabelId: '',
  shippingLabelUrl: '',
  shippingServiceLevel: '',
  shippingLabelCost: '',
  shippingLabelCreatedAt: '',
  fulfillmentDispatchStatus: 'none',
  fulfillmentProvider: '',
  fulfillmentId: '',
  fulfillmentRequestedAt: '',
  fulfillmentCompletedAt: '',
  fulfillmentPayload: '',
  riskScore: '0',
  riskLevel: 'low',
  riskReasons: '',
  riskReviewStatus: 'cleared',
  shippingAddress: '',
  billingAddress: '',
  refundAmount: '',
  refundReason: '',
  providerRefundStatus: 'none',
  providerRefundProvider: '',
  providerRefundId: '',
  providerRefundReference: '',
  providerRefundAmount: '',
  providerRefundReason: '',
  providerRefundRequestedAt: '',
  providerRefundCompletedAt: '',
  providerRefundPayload: '',
  notes: '',
  recordStatus: 'published',
};

function OrdersRoute() {
  const { sites } = useStore();
  const currentAdmin = useAuthStore((state) => state.user);
  const navigate = useNavigate();
  const routeSearch = Route.useSearch();
  const [selectedSiteId, setSelectedSiteId] = useState(() => routeSearch.siteId || getSiteSelectionFromSearch(sites));
  const [ordersCollection, setOrdersCollection] = useState<Collection | null>(null);
  const [customersCollection, setCustomersCollection] = useState<Collection | null>(null);
  const [orders, setOrders] = useState<CollectionRecord[]>([]);
  const [customerProfiles, setCustomerProfiles] = useState<CollectionRecord[]>([]);
  const [orderPagination, setOrderPagination] = useState<CollectionRecordPagination | null>(null);
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(routeSearch.orderId || null);
  const [selectedOrderIds, setSelectedOrderIds] = useState<string[]>([]);
  const [selectedCustomerProfileId, setSelectedCustomerProfileId] = useState<string | null>(null);
  const [customerProfileDraft, setCustomerProfileDraft] = useState<CustomerProfileDraft>(() => customerProfileToDraft(null));
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
  const [isSavingCustomerProfile, setIsSavingCustomerProfile] = useState(false);
  const [isImportingOrders, setIsImportingOrders] = useState(false);
  const [isReconcilingOrders, setIsReconcilingOrders] = useState(false);
  const [reconciliationResult, setReconciliationResult] = useState<CommerceReconciliationResult | null>(null);
  const [cronReadiness, setCronReadiness] = useState<CommerceCronReadiness | null>(null);
  const [cronReadinessError, setCronReadinessError] = useState<string | null>(null);
  const [commerceSettings, setCommerceSettings] = useState<CommerceProviderSettings | null>(null);
  const [runtimeCommerce, setRuntimeCommerce] = useState<RuntimeCommerceSettings | null>(null);
  const [providerCertificationCommandOptions, setProviderCertificationCommandOptions] = useState<OrderProviderCertificationCommandOptions>(
    DEFAULT_ORDER_PROVIDER_CERTIFICATION_COMMAND_OPTIONS,
  );
  const [isProviderReadinessLoading, setIsProviderReadinessLoading] = useState(false);
  const [providerReadinessError, setProviderReadinessError] = useState<string | null>(null);
  const [orderAnalytics, setOrderAnalytics] = useState<OrderAnalytics | null>(null);
  const [isOrderAnalyticsLoading, setIsOrderAnalyticsLoading] = useState(false);
  const [orderAnalyticsError, setOrderAnalyticsError] = useState<string | null>(null);
  const [orderDeliveryEvents, setOrderDeliveryEvents] = useState<OrderDeliveryEvent[]>([]);
  const [orderDeliveryError, setOrderDeliveryError] = useState<string | null>(null);
  const isOrdersBusy = isLoading || isSaving || isSavingCustomerProfile || isImportingOrders || isReconcilingOrders;
  const orderImportInputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [pendingDeleteOrder, setPendingDeleteOrder] = useState<CollectionRecord | null>(null);
  const [permissionMatrix, setPermissionMatrix] = useState<AdminUserPermissionMatrix | null>(null);
  const [isPermissionsLoading, setIsPermissionsLoading] = useState(Boolean(currentAdmin?.id));
  const [permissionError, setPermissionError] = useState<string | null>(null);
  const isPermissionMatrixPending = isPermissionsLoading && !permissionMatrix;
  const canViewCommerce = !isPermissionMatrixPending && isAdminPermissionAllowed(permissionMatrix, currentAdmin, 'commerce.view', ORDER_PERMISSION_ROLE_DEFAULTS);
  const canEditCommerce = !isPermissionMatrixPending && isAdminPermissionAllowed(permissionMatrix, currentAdmin, 'commerce.edit', ORDER_PERMISSION_ROLE_DEFAULTS);
  const canConfigureCommerce = !isPermissionMatrixPending && isAdminPermissionAllowed(permissionMatrix, currentAdmin, 'commerce.configure', ORDER_PERMISSION_ROLE_DEFAULTS);
  const canDeleteCommerce = !isPermissionMatrixPending && isAdminPermissionAllowed(permissionMatrix, currentAdmin, 'commerce.delete', ORDER_PERMISSION_ROLE_DEFAULTS);
  const canViewCollections = !isPermissionMatrixPending && isAdminPermissionAllowed(permissionMatrix, currentAdmin, 'collections.view', ORDER_PERMISSION_ROLE_DEFAULTS);
  const canEditCollections = !isPermissionMatrixPending && isAdminPermissionAllowed(permissionMatrix, currentAdmin, 'collections.edit', ORDER_PERMISSION_ROLE_DEFAULTS);
  const canExportCollections = !isPermissionMatrixPending && isAdminPermissionAllowed(permissionMatrix, currentAdmin, 'collections.export', ORDER_PERMISSION_ROLE_DEFAULTS);
  const canDeleteCollections = !isPermissionMatrixPending && isAdminPermissionAllowed(permissionMatrix, currentAdmin, 'collections.delete', ORDER_PERMISSION_ROLE_DEFAULTS);
  const canEditPages = !isPermissionMatrixPending && isAdminPermissionAllowed(permissionMatrix, currentAdmin, 'pages.edit', ORDER_PERMISSION_ROLE_DEFAULTS);
  const canViewOrders = canViewCommerce && canViewCollections;
  const canEditOrders = canEditCommerce && canEditCollections;
  const canConfigureOrders = canConfigureCommerce && canEditCollections;
  const canExportOrders = canViewCommerce && canExportCollections;
  const canDeleteOrders = canDeleteCommerce && canDeleteCollections;
  const providerCertificationHasSelectedSelector = hasOrderProviderCertificationSelector(providerCertificationCommandOptions);
  const providerCertificationCommand = useMemo(
    () => buildOrderProviderCertificationCommand(providerCertificationCommandOptions),
    [providerCertificationCommandOptions],
  );
  const providerCertificationRequiredInputs = useMemo(
    () => buildOrderProviderCertificationRequiredInputs(providerCertificationCommandOptions),
    [providerCertificationCommandOptions],
  );
  const updateProviderCertificationCommandOptions = (next: Partial<OrderProviderCertificationCommandOptions>) => {
    setProviderCertificationCommandOptions((current) => ({
      ...current,
      ...next,
    }));
  };
  const viewPermissionTitle = canViewOrders
    ? undefined
    : adminPermissionReason(permissionMatrix, currentAdmin, !canViewCommerce ? 'commerce.view' : 'collections.view', ORDER_PERMISSION_ROLE_DEFAULTS);
  const editPermissionTitle = canEditOrders
    ? undefined
    : adminPermissionReason(permissionMatrix, currentAdmin, !canEditCommerce ? 'commerce.edit' : 'collections.edit', ORDER_PERMISSION_ROLE_DEFAULTS);
  const configurePermissionTitle = canConfigureOrders
    ? undefined
    : adminPermissionReason(permissionMatrix, currentAdmin, !canConfigureCommerce ? 'commerce.configure' : 'collections.edit', ORDER_PERMISSION_ROLE_DEFAULTS);
  const exportPermissionTitle = canExportOrders
    ? undefined
    : adminPermissionReason(permissionMatrix, currentAdmin, !canViewCommerce ? 'commerce.view' : 'collections.export', ORDER_PERMISSION_ROLE_DEFAULTS);
  const deletePermissionTitle = canDeleteOrders
    ? undefined
    : adminPermissionReason(permissionMatrix, currentAdmin, !canDeleteCommerce ? 'commerce.delete' : 'collections.delete', ORDER_PERMISSION_ROLE_DEFAULTS);
  const pagesEditPermissionTitle = canEditPages ? undefined : adminPermissionReason(permissionMatrix, currentAdmin, 'pages.edit', ORDER_PERMISSION_ROLE_DEFAULTS);
  const isOrdersAccessBusy = isOrdersBusy || isPermissionMatrixPending;

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
  const orderAnalyticsApiUrl = `${publicBaseUrl}/api/admin/sites/${encodeURIComponent(activeSiteId)}/commerce/orders/analytics`;
  const missingOrderFields = useMemo(() => (
    ordersCollection ? getMissingOrderFieldKeys(ordersCollection) : []
  ), [ordersCollection]);
  const ordersApiReady = Boolean(
    ordersCollection?.status === 'published' &&
    isOrderCollectionPrivate(ordersCollection) &&
    missingOrderFields.length === 0,
  );
  const selectedOrder = useMemo(
    () => orders.find((order) => order.id === selectedOrderId) || null,
    [orders, selectedOrderId],
  );
  const linkedCustomerProfile = useMemo(() => {
    if (!selectedOrder) return null;
    const customerId = String(readOrderValue(selectedOrder.values, 'customerid', '') || '').trim();
    const email = String(selectedOrder.values.email || '').trim().toLowerCase();

    return customerProfiles.find((customer) => (
      (customerId && customer.id === customerId) ||
      (email && String(customer.values?.email || '').trim().toLowerCase() === email)
    )) || null;
  }, [customerProfiles, selectedOrder]);
  const selectedCustomerProfile = useMemo(
    () => customerProfiles.find((customer) => customer.id === selectedCustomerProfileId) || linkedCustomerProfile,
    [customerProfiles, linkedCustomerProfile, selectedCustomerProfileId],
  );
  const selectedCustomerOrders = useMemo(() => {
    if (!selectedCustomerProfile) return [];
    const profileEmail = String(selectedCustomerProfile.values?.email || '').trim().toLowerCase();

    return orders.filter((order) => {
      const orderCustomerId = String(readOrderValue(order.values, 'customerid', '') || '').trim();
      const orderEmail = String(order.values.email || '').trim().toLowerCase();
      return orderCustomerId === selectedCustomerProfile.id || (profileEmail && orderEmail === profileEmail);
    });
  }, [orders, selectedCustomerProfile]);
  const selectedCustomerTotalSpent = useMemo(
    () => selectedCustomerOrders.reduce((sum, order) => sum + toNumber(order.values.total), 0),
    [selectedCustomerOrders],
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
  const loadedOrderCount = orders.length;
  const totalOrderCount = orderPagination?.total ?? loadedOrderCount;
  const hasMoreOrders = orderPagination?.hasMore === true;
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
  const selectedVisibleOrders = useMemo(
    () => filteredOrders.filter((order) => selectedOrderIds.includes(order.id)),
    [filteredOrders, selectedOrderIds],
  );
  const selectedLoadedOrders = useMemo(
    () => orders.filter((order) => selectedOrderIds.includes(order.id)),
    [orders, selectedOrderIds],
  );
  const hiddenSelectedOrderCount = Math.max(0, selectedLoadedOrders.length - selectedVisibleOrders.length);
  const allVisibleOrdersSelected = filteredOrders.length > 0 && selectedVisibleOrders.length === filteredOrders.length;
  const metrics = useMemo(() => ({
    orders: totalOrderCount,
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
  }), [orders, totalOrderCount]);
  const orderReadiness = useMemo(() => {
    const hasSchema = Boolean(ordersCollection);
    const hasOrders = orders.length > 0;
    const hasPaid = metrics.paid > 0;
    const hasFulfillmentWorkflow = metrics.needsFulfillment > 0 || metrics.processing > 0 || orders.some((order) => (
      String(readOrderValue(order.values, 'fulfillmentstatus', '')) === 'fulfilled'
    ));
    const hasCustomerData = orders.some((order) => Boolean(readOrderValue(order.values, 'customername', '') && order.values.email));
    const hasPaymentData = orders.some((order) => Boolean(readOrderValue(order.values, 'paymentreference', '') || readOrderValue(order.values, 'paymentprovider', '')));
    const hasRiskSignals = orders.some((order) => Boolean(readOrderValue(order.values, 'risklevel', '') || readOrderValue(order.values, 'riskreviewstatus', '') || Number(readOrderValue(order.values, 'riskscore', 0)) > 0));
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
          ? 'Payment, fulfillment, risk, tracking, refund, address, and notes fields are present.'
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
      {
        label: 'Risk controls',
        detail: hasRiskSignals ? 'Fraud/risk scoring fields are active on private orders.' : 'Checkout risk fields will populate on new order intake.',
        ready: hasRiskSignals || !hasOrders,
      },
    ];
    const readyCount = checks.filter((check) => check.ready).length;

    return {
      score: Math.round((readyCount / checks.length) * 100),
      checks,
      workflow: [
        { label: 'Capture', detail: 'Create the private order record from checkout, manual entry, or a server-side integration.' },
        { label: 'Verify', detail: 'Track customer, line items, payment status, provider reference, and paid timestamp.' },
        { label: 'Assess', detail: 'Review checkout risk score, reasons, and fraud-review state before fulfillment.' },
        { label: 'Fulfill', detail: 'Move orders through processing, carrier, tracking, fulfilled date, or digital delivery notes.' },
        { label: 'Resolve', detail: 'Record manual cancellations, refund notes, internal notes, and private reporting without exposing order data publicly.' },
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
  const providerReadinessChecks = useMemo(() => {
    const commerce = commerceSettings;
    const runtime = runtimeCommerce;
    const paymentProvider = commerce?.paymentProvider || runtime?.paymentProvider || 'none';
    const taxProvider = commerce?.taxProvider || runtime?.taxProvider || 'manual';
    const shippingProvider = commerce?.shippingProvider || runtime?.shippingProvider || 'manual';
    const discountProvider = commerce?.discountProvider || runtime?.discountProvider || 'manual';
    const shippingLabelProvider = commerce?.shippingLabelProvider || runtime?.shippingLabelProvider || 'manual';
    const fulfillmentProvider = commerce?.fulfillmentProvider || 'manual';
    const reconciliationMode = commerce?.reconciliationMode || 'manual';
    const webhookRequired = Boolean(commerce?.webhookEventsEnabled && paymentProvider !== 'none');
    const refundProviderModes = [
      runtime?.stripeSecretConfigured ? 'stripe' : '',
      runtime?.paypalAccessTokenConfigured ? 'paypal' : '',
      runtime?.paddleApiKeyConfigured ? 'paddle' : '',
      runtime?.squareAccessTokenConfigured ? 'square' : '',
      runtime?.adyenApiKeyConfigured && runtime?.adyenMerchantAccountConfigured ? 'adyen' : '',
      runtime?.mollieApiKeyConfigured ? 'mollie' : '',
      runtime?.razorpayKeyIdConfigured && runtime?.razorpayKeySecretConfigured ? 'razorpay' : '',
    ].filter(Boolean);
    const taxProviderCatalog = 'Supported provider modes: HTTP, Stripe Tax, TaxJar, Avalara.';
    const shippingProviderCatalog = 'Supported provider modes: HTTP, EasyPost rates, Shippo rates.';
    const discountProviderCatalog = 'Supported provider modes: HTTP, Stripe promotion codes.';
    const stripeApiVersionDetail = runtime?.stripeApiVersion ? ` Stripe API version override ${runtime.stripeApiVersion}.` : '';
    const taxQuoteReady = taxProvider === 'manual'
      || (taxProvider === 'http' && Boolean(commerce?.taxProviderUrl))
      || (taxProvider === 'stripe' && Boolean(runtime?.stripeSecretConfigured))
      || (taxProvider === 'taxjar' && Boolean(runtime?.taxJarApiKeyConfigured))
      || (
        taxProvider === 'avalara' &&
        Boolean(runtime?.avalaraAccountConfigured && runtime?.avalaraLicenseKeyConfigured && runtime?.avalaraCompanyCodeConfigured)
      );
    const taxQuoteDetail = taxProvider === 'http'
      ? commerce?.taxProviderUrl ? `HTTP tax quote endpoint is configured. ${taxProviderCatalog}` : `HTTP tax provider selected without a URL. ${taxProviderCatalog}`
      : taxProvider === 'stripe'
        ? runtime?.stripeSecretConfigured ? `Stripe Tax can use ${runtime.stripeTaxApiBaseUrl || runtime.stripeApiBaseUrl || 'Stripe API'}.${stripeApiVersionDetail} ${taxProviderCatalog}` : `Stripe Tax selected without a Stripe secret. ${taxProviderCatalog}`
        : taxProvider === 'taxjar'
          ? runtime?.taxJarApiKeyConfigured ? `TaxJar key is configured; API base ${runtime.taxJarApiBaseUrl || 'https://api.taxjar.com/v2'}. ${taxProviderCatalog}` : `TaxJar selected without BACKY_TAXJAR_API_KEY or TAXJAR_API_KEY. ${taxProviderCatalog}`
          : taxProvider === 'avalara'
            ? taxQuoteReady ? `Avalara AvaTax credentials are configured; API base ${runtime?.avalaraApiBaseUrl || 'https://sandbox-rest.avatax.com'}. ${taxProviderCatalog}` : `Avalara selected without account id, license key, or company code. ${taxProviderCatalog}`
            : `Manual tax rules are available from Settings. ${taxProviderCatalog}`;
    const shippingQuoteReady = shippingProvider === 'manual'
      || (shippingProvider === 'http' && Boolean(commerce?.shippingProviderUrl))
      || (shippingProvider === 'easypost' && Boolean(runtime?.easyPostApiKeyConfigured))
      || (shippingProvider === 'shippo' && Boolean(runtime?.shippoApiKeyConfigured));
    const shippingQuoteDetail = shippingProvider === 'http'
      ? commerce?.shippingProviderUrl ? `HTTP shipping quote endpoint is configured. ${shippingProviderCatalog}` : `HTTP shipping provider selected without a URL. ${shippingProviderCatalog}`
      : shippingProvider === 'easypost'
        ? runtime?.easyPostApiKeyConfigured ? `EasyPost shipping-rate key is configured; API base ${runtime.easyPostApiBaseUrl || 'https://api.easypost.com/v2'}. ${shippingProviderCatalog}` : `EasyPost shipping rates selected without BACKY_EASYPOST_API_KEY or EASYPOST_API_KEY. ${shippingProviderCatalog}`
        : shippingProvider === 'shippo'
          ? runtime?.shippoApiKeyConfigured ? `Shippo shipping-rate key is configured; API base ${runtime.shippoApiBaseUrl || 'https://api.goshippo.com'}. ${shippingProviderCatalog}` : `Shippo shipping rates selected without BACKY_SHIPPO_API_KEY or SHIPPO_API_KEY. ${shippingProviderCatalog}`
          : `Manual shipping rules are available from Settings. ${shippingProviderCatalog}`;
    const discountQuoteReady = discountProvider === 'manual'
      || (discountProvider === 'http' && Boolean(commerce?.discountProviderUrl))
      || (discountProvider === 'stripe' && Boolean(runtime?.stripeSecretConfigured));
    const discountQuoteDetail = discountProvider === 'http'
      ? commerce?.discountProviderUrl ? `HTTP discount quote endpoint is configured. ${discountProviderCatalog}` : `HTTP discount provider selected without a URL. ${discountProviderCatalog}`
      : discountProvider === 'stripe'
        ? runtime?.stripeSecretConfigured ? `Stripe promotion codes can use ${runtime.stripeDiscountApiBaseUrl || runtime.stripeApiBaseUrl || 'https://api.stripe.com'}.${stripeApiVersionDetail} ${discountProviderCatalog}` : `Stripe promotion-code discounts selected without a Stripe secret. ${discountProviderCatalog}`
        : `Manual discount rules are available from Settings. ${discountProviderCatalog}`;

    return [
      {
        key: 'stripe-checkout-refund',
        title: 'Stripe checkout/refund',
        mode: paymentProvider === 'stripe' ? 'stripe-api' : 'manual/off',
        ready: paymentProvider !== 'stripe' || Boolean(runtime?.stripeSecretConfigured),
        detail: paymentProvider === 'stripe'
          ? runtime?.stripeSecretConfigured
            ? `Stripe secret is configured; API base ${runtime.stripeApiBaseUrl || 'https://api.stripe.com'}.`
            : 'Stripe is selected but BACKY_STRIPE_SECRET_KEY or STRIPE_SECRET_KEY is missing.'
          : 'Manual or disabled payment provider; provider refund actions keep a handoff payload.',
      },
      {
        key: 'payment-refund-providers',
        title: 'Payment refund providers',
        mode: refundProviderModes.length ? refundProviderModes.join(', ') : 'handoff',
        ready: refundProviderModes.length > 0,
        detail: refundProviderModes.length
          ? `Provider Refund can execute through ${refundProviderModes.join(', ')} when the order payment provider/reference matches.`
          : 'No payment refund provider env is configured; Provider Refund will persist a manual handoff payload.',
      },
      {
        key: 'tax-quote',
        title: 'Tax quote',
        mode: taxProvider,
        ready: taxQuoteReady,
        detail: taxQuoteDetail,
      },
      {
        key: 'shipping-quote',
        title: 'Shipping quote',
        mode: shippingProvider,
        ready: shippingQuoteReady,
        detail: shippingQuoteDetail,
      },
      {
        key: 'discount-quote',
        title: 'Discount quote',
        mode: discountProvider,
        ready: discountQuoteReady,
        detail: discountQuoteDetail,
      },
      {
        key: 'carrier-labels',
        title: 'Carrier labels/tracking',
        mode: shippingLabelProvider,
        ready: shippingLabelProvider === 'shippo'
          ? Boolean(runtime?.shippoApiKeyConfigured)
          : shippingLabelProvider !== 'easypost' || Boolean(runtime?.easyPostApiKeyConfigured),
        detail: shippingLabelProvider === 'easypost'
          ? runtime?.easyPostApiKeyConfigured
            ? `EasyPost key is configured; API base ${runtime.easyPostApiBaseUrl || 'https://api.easypost.com/v2'}.`
            : 'EasyPost labels are selected but BACKY_EASYPOST_API_KEY or EASYPOST_API_KEY is missing.'
          : shippingLabelProvider === 'shippo'
            ? runtime?.shippoApiKeyConfigured
              ? `Shippo key is configured; API base ${runtime.shippoApiBaseUrl || 'https://api.goshippo.com'}.`
              : 'Shippo labels are selected but BACKY_SHIPPO_API_KEY or SHIPPO_API_KEY is missing.'
          : 'Manual label handoff remains available.',
      },
      {
        key: 'fulfillment-dispatch',
        title: 'Fulfillment dispatch',
        mode: fulfillmentProvider,
        ready: fulfillmentProvider === 'manual' || Boolean(commerce?.fulfillmentProviderUrl),
        detail: fulfillmentProvider === 'http'
          ? commerce?.fulfillmentProviderUrl ? 'HTTP warehouse/3PL dispatch endpoint is configured.' : 'HTTP fulfillment provider selected without a URL.'
          : 'Manual warehouse/3PL handoff remains available.',
      },
      {
        key: 'webhook-settlement',
        title: 'Webhook settlement',
        mode: webhookRequired ? 'signed-webhook' : 'not-required',
        ready: !webhookRequired || Boolean(runtime?.webhookSecretConfigured),
        detail: webhookRequired
          ? runtime?.webhookSecretConfigured
            ? `Webhook signing secret resolves from ${runtime.webhookSecretSource || 'environment'}.`
            : 'Provider webhooks are enabled but the referenced commerce webhook secret is not resolved.'
          : 'Provider webhook signing is not required for the current payment mode.',
      },
      {
        key: 'scheduled-reconciliation',
        title: 'Scheduled reconciliation',
        mode: reconciliationMode,
        ready: reconciliationMode !== 'scheduled' || Boolean(cronReadiness?.ready),
        detail: reconciliationMode === 'scheduled'
          ? cronReadiness?.ready
            ? 'Cron readiness confirms scheduled reconciliation can call the platform endpoint.'
            : 'Scheduled reconciliation needs Vercel cron, CRON_SECRET, and an admin key match.'
          : 'Manual or webhook reconciliation mode does not require cron readiness.',
      },
    ];
  }, [commerceSettings, cronReadiness?.ready, runtimeCommerce]);
  const providerReadinessReadyCount = providerReadinessChecks.filter((check) => check.ready).length;
  const providerRuntimeEvidence = useMemo(() => {
    const configuredFamilies = providerReadinessChecks
      .filter((check) => check.ready)
      .map((check) => check.title);
    const missingFamilies = providerReadinessChecks
      .filter((check) => !check.ready)
      .map((check) => check.title);

    return {
      readyCount: providerReadinessReadyCount,
      total: providerReadinessChecks.length,
      readinessPercent: providerReadinessChecks.length
        ? Math.round((providerReadinessReadyCount / providerReadinessChecks.length) * 100)
        : 0,
      configuredFamilies,
      missingFamilies,
      missingRuntimeAliases: runtimeCommerce?.missing || [],
      runtimeCommerce: runtimeCommerce || null,
      providerAnalytics: orderAnalytics?.providerOperations || null,
      checks: providerReadinessChecks,
      secretHandling: 'Provider secret values are never returned; order runtime evidence reports booleans, aliases, provider families, and non-secret URLs only.',
    };
  }, [orderAnalytics?.providerOperations, providerReadinessChecks, providerReadinessReadyCount, runtimeCommerce]);
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
    operatorGate: ORDER_PROVIDER_CERTIFICATION_OPERATOR_GATE,
    operatorCommandTemplate: {
      ...ORDER_PROVIDER_CERTIFICATION_OPERATOR_COMMAND_TEMPLATE,
      command: providerCertificationCommand,
      requiredInputs: providerCertificationRequiredInputs,
    },
    preflightGates: [...ORDER_PROVIDER_CERTIFICATION_PREFLIGHT_GATES],
    providerSelectors: [...ORDER_PROVIDER_CERTIFICATION_SELECTORS],
    evidenceExpectations: [...ORDER_PROVIDER_CERTIFICATION_EVIDENCE_EXPECTATIONS],
    secretHandling: 'Provider credentials stay in server environment/configuration; order records and handoff manifests only expose non-secret readiness evidence.',
    orderEvidence: {
      apiReady: ordersApiReady,
      readinessScore: orderReadiness.score,
      missingOrderFields,
      totalOrderCount,
      loadedOrderCount,
      filteredOrderCount: filteredOrders.length,
      metrics,
    },
    endpointEvidence: {
      adminOrders: adminOrdersApiUrl,
      quote: `${adminOrdersApiUrl}/{orderId}/quote`,
      shippingLabel: `${adminOrdersApiUrl}/{orderId}/shipping-label`,
      fulfillment: `${adminOrdersApiUrl}/{orderId}/fulfillment`,
      tracking: `${adminOrdersApiUrl}/{orderId}/tracking`,
      providerRefund: `${adminOrdersApiUrl}/{orderId}/provider-refund`,
      commerceWebhook: `${publicBaseUrl}/api/sites/${encodeURIComponent(activeSiteId)}/commerce/webhook`,
      siteReconciliation: `${publicBaseUrl}/api/admin/sites/${encodeURIComponent(activeSiteId)}/commerce/reconcile`,
      platformReconciliation: `${publicBaseUrl}/api/admin/commerce/reconcile`,
      reconciliationReadiness: `${publicBaseUrl}/api/admin/commerce/reconcile/readiness`,
      checkoutIntake: publicOrderIntakeUrl,
    },
    providerReadinessEvidence: {
      readyCount: providerReadinessReadyCount,
      total: providerReadinessChecks.length,
      runtimeCommerce: runtimeCommerce || null,
      providerAnalytics: orderAnalytics?.providerOperations || null,
      checks: providerReadinessChecks,
    },
    providerRuntimeEvidence,
    groups: ORDER_PROVIDER_CERTIFICATION_GROUPS.map((group) => ({
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
    adminOrdersApiUrl,
    filteredOrders.length,
    loadedOrderCount,
    metrics,
    missingOrderFields,
    orderAnalytics?.providerOperations,
    orderReadiness.score,
    ordersApiReady,
    providerCertificationCommand,
    providerCertificationRequiredInputs,
    providerReadinessChecks,
    providerReadinessReadyCount,
    providerRuntimeEvidence,
    publicBaseUrl,
    publicOrderIntakeUrl,
    runtimeCommerce,
    totalOrderCount,
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
      adminQuote: `${adminOrdersApiUrl}/{orderId}/quote`,
      adminShippingLabel: `${adminOrdersApiUrl}/{orderId}/shipping-label`,
      adminFulfillment: `${adminOrdersApiUrl}/{orderId}/fulfillment`,
      adminTracking: `${adminOrdersApiUrl}/{orderId}/tracking`,
      adminProviderRefund: `${adminOrdersApiUrl}/{orderId}/provider-refund`,
      orderAnalytics: orderAnalyticsApiUrl,
      orderDeliveryEvents: `${publicBaseUrl}/api/sites/${encodeURIComponent(activeSiteId)}/events?kind=commerce-order`,
      commerceWebhook: `${publicBaseUrl}/api/sites/${encodeURIComponent(activeSiteId)}/commerce/webhook`,
      siteReconciliation: `${publicBaseUrl}/api/admin/sites/${encodeURIComponent(activeSiteId)}/commerce/reconcile`,
      platformReconciliation: `${publicBaseUrl}/api/admin/commerce/reconcile`,
      reconciliationReadiness: `${publicBaseUrl}/api/admin/commerce/reconcile/readiness`,
      checkoutIntake: publicOrderIntakeUrl,
      publicBlocked: publicOrdersApiUrl,
    },
    apiContracts: ORDER_API_CONTRACTS.map((contract) => ({
      ...contract,
      endpoint: {
        key: contract.endpointKey,
        url: {
          analytics: orderAnalyticsApiUrl,
          quote: `${adminOrdersApiUrl}/{orderId}/quote`,
          shippingLabel: `${adminOrdersApiUrl}/{orderId}/shipping-label`,
          fulfillment: `${adminOrdersApiUrl}/{orderId}/fulfillment`,
          tracking: `${adminOrdersApiUrl}/{orderId}/tracking`,
          providerRefund: `${adminOrdersApiUrl}/{orderId}/provider-refund`,
          commerceWebhook: `${publicBaseUrl}/api/sites/${encodeURIComponent(activeSiteId)}/commerce/webhook`,
          siteReconciliation: `${publicBaseUrl}/api/admin/sites/${encodeURIComponent(activeSiteId)}/commerce/reconcile`,
          platformReconciliation: `${publicBaseUrl}/api/admin/commerce/reconcile`,
          reconciliationReadiness: `${publicBaseUrl}/api/admin/commerce/reconcile/readiness`,
        }[contract.key === 'analytics'
          ? 'analytics'
          : contract.key === 'quote'
            ? 'quote'
            : contract.key === 'shipping-label'
              ? 'shippingLabel'
              : contract.key === 'fulfillment'
                ? 'fulfillment'
                : contract.key === 'tracking'
                  ? 'tracking'
                  : contract.key === 'provider-refund'
                    ? 'providerRefund'
                    : contract.key === 'commerce-webhook'
                      ? 'commerceWebhook'
                      : contract.key === 'site-reconciliation'
                        ? 'siteReconciliation'
                        : contract.key === 'platform-reconciliation'
                          ? 'platformReconciliation'
                          : 'reconciliationReadiness'],
      },
      responseHeaders: {
        schemaVersion: 'x-backy-schema-version',
        cacheScope: 'x-backy-cache-scope',
        requestId: 'x-backy-request-id',
        siteId: contract.key === 'platform-reconciliation' || contract.key === 'reconciliation-readiness'
          ? null
          : 'x-backy-site-id',
      },
    })),
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
    analytics: orderAnalytics,
    providerAnalytics: orderAnalytics?.providerOperations || null,
    providerReadiness: {
      loaded: Boolean(commerceSettings || runtimeCommerce),
      readyCount: providerReadinessReadyCount,
      total: providerReadinessChecks.length,
      runtimeCommerce,
      checks: providerReadinessChecks,
    },
    providerCertification: providerCertificationSummary,
    deliveryEvents: orderDeliveryEvents.map((event) => ({
      id: event.id,
      status: event.status,
      target: event.target,
      channel: String(event.metadata?.channel || ''),
      orderNumber: String(event.metadata?.orderNumber || ''),
      createdAt: event.createdAt,
    })),
    filters: {
      search: searchQuery,
      workflow: filter,
      payment: paymentFilter,
      fulfillment: fulfillmentFilter,
      source: sourceFilter,
      visible: filteredOrders.length,
      loaded: loadedOrderCount,
      total: totalOrderCount,
      hasMore: hasMoreOrders,
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
      trackingStatus: String(readOrderValue(order.values, 'trackingstatus', '')),
      trackingLastCheckedAt: String(readOrderValue(order.values, 'trackinglastcheckedat', '') || ''),
      fulfilledAt: String(readOrderValue(order.values, 'fulfilledat', '') || ''),
      fulfillmentDispatchStatus: asFulfillmentDispatchStatus(readOrderValue(order.values, 'fulfillmentdispatchstatus', undefined)),
      fulfillmentProvider: String(readOrderValue(order.values, 'fulfillmentprovider', '')),
      fulfillmentId: String(readOrderValue(order.values, 'fulfillmentid', '')),
      fulfillmentRequestedAt: String(readOrderValue(order.values, 'fulfillmentrequestedat', '') || ''),
      fulfillmentCompletedAt: String(readOrderValue(order.values, 'fulfillmentcompletedat', '') || ''),
      risk: {
        score: toNumber(readOrderValue(order.values, 'riskscore', 0)),
        level: asOrderRiskLevel(readOrderValue(order.values, 'risklevel', undefined)),
        reasons: String(readOrderValue(order.values, 'riskreasons', '')),
        reviewStatus: asOrderRiskReviewStatus(readOrderValue(order.values, 'riskreviewstatus', undefined)),
      },
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
    commerceSettings,
    filter,
    filteredOrders.length,
    fulfillmentFilter,
    hasMoreOrders,
    loadedOrderCount,
    metrics,
    missingOrderFields,
    orderReadiness.checks,
    orderReadiness.score,
    orderAnalytics,
    orderAnalyticsApiUrl,
    orderDeliveryEvents,
    orders,
    ordersApiReady,
    ordersCollection,
    paymentFilter,
    providerCertificationSummary,
    providerReadinessChecks,
    providerReadinessReadyCount,
    publicBaseUrl,
    publicOrderIntakeUrl,
    publicOrdersApiUrl,
    runtimeCommerce,
    searchQuery,
    sourceFilter,
    totalOrderCount,
  ]);
  const orderHandoffText = useMemo(() => JSON.stringify(orderHandoff, null, 2), [orderHandoff]);
  const providerCertificationHandoffText = useMemo(() => JSON.stringify(providerCertificationSummary, null, 2), [providerCertificationSummary]);
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

  const loadOrderAnalytics = async () => {
    if (!canViewCommerce) {
      setOrderAnalytics(null);
      setOrderAnalyticsError(null);
      setOrderDeliveryEvents([]);
      setOrderDeliveryError(null);
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
      setOrderAnalyticsError(loadError instanceof Error ? loadError.message : 'Unable to load order analytics');
      return null;
    } finally {
      setIsOrderAnalyticsLoading(false);
    }
  };

  const loadOrderDeliveryEvents = async () => {
    if (!canViewCommerce) {
      setOrderDeliveryEvents([]);
      setOrderDeliveryError(null);
      return;
    }

    try {
      const result = await listOrderDeliveryEvents(activeSiteId, { limit: 50 });
      setOrderDeliveryEvents(result.events);
      setOrderDeliveryError(null);
    } catch (loadError) {
      setOrderDeliveryEvents([]);
      setOrderDeliveryError(loadError instanceof Error ? loadError.message : 'Unable to load order delivery events');
    }
  };

  const loadCronReadiness = async () => {
    if (!canConfigureOrders || isPermissionMatrixPending) {
      setCronReadiness(null);
      setCronReadinessError(null);
      return;
    }

    try {
      const readiness = await getCommerceReconciliationReadiness();
      setCronReadiness(readiness);
      setCronReadinessError(null);
    } catch (loadError) {
      setCronReadiness(null);
      setCronReadinessError(loadError instanceof Error ? loadError.message : 'Unable to load scheduled reconciliation readiness');
    }
  };

  const loadProviderReadiness = async () => {
    if (!canViewCommerce) {
      setCommerceSettings(null);
      setRuntimeCommerce(null);
      setProviderReadinessError(null);
      return null;
    }

    setIsProviderReadinessLoading(true);
    try {
      const settings = await getSettings();
      setCommerceSettings(settings.integrations?.commerce || null);
      setRuntimeCommerce(settings.runtimeCommerce || null);
      setProviderReadinessError(null);
      return settings;
    } catch (loadError) {
      setCommerceSettings(null);
      setRuntimeCommerce(null);
      setProviderReadinessError(loadError instanceof Error ? loadError.message : 'Unable to load commerce provider readiness');
      return null;
    } finally {
      setIsProviderReadinessLoading(false);
    }
  };

  const loadOrders = async () => {
    if (isOrdersBusy) return;
    if (isPermissionMatrixPending) return;
    if (!canViewOrders) {
      setOrdersCollection(null);
      setCustomersCollection(null);
      setOrders([]);
      setCustomerProfiles([]);
      setOrderPagination(null);
      setOrderAnalytics(null);
      setOrderAnalyticsError(null);
      setOrderDeliveryEvents([]);
      setOrderDeliveryError(null);
      setCronReadiness(null);
      setCronReadinessError(null);
      setCommerceSettings(null);
      setRuntimeCommerce(null);
      setProviderReadinessError(null);
      clearOrderEditorState();
      setError(viewPermissionTitle || 'Your account cannot view commerce orders.');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const collections = await listCollections(activeSiteId);
      const collection = collections.find((item) => item.slug === ORDERS_COLLECTION_SLUG) || null;
      const customerCollection = collections.find((item) => item.slug === CUSTOMERS_COLLECTION_SLUG) || null;
      setOrdersCollection(collection);
      setCustomersCollection(customerCollection);

      if (!collection) {
        setOrders([]);
        setCustomerProfiles([]);
        setOrderPagination(null);
        setOrderAnalytics(null);
        setOrderAnalyticsError(null);
        setOrderDeliveryEvents([]);
        setOrderDeliveryError(null);
        setCronReadiness(null);
        setCronReadinessError(null);
        setCommerceSettings(null);
        setRuntimeCommerce(null);
        setProviderReadinessError(null);
        clearOrderEditorState();
        return;
      }

      const [result, customersResult] = await Promise.all([
        listCollectionRecords(activeSiteId, collection.id, {
          limit: ORDER_RECORD_PAGE_SIZE,
          offset: 0,
          sortBy: 'updatedAt',
          sortDirection: 'desc',
        }),
        customerCollection
          ? listCollectionRecords(activeSiteId, customerCollection.id, {
              limit: 100,
              offset: 0,
              sortBy: 'updatedAt',
              sortDirection: 'desc',
            })
          : Promise.resolve(null),
      ]);
      let nextOrders = result.records;
      if (routeSearch.orderId && !nextOrders.some((order) => order.id === routeSearch.orderId)) {
        try {
          const deepLinkedOrder = await getCollectionRecord(activeSiteId, collection.id, routeSearch.orderId);
          nextOrders = [deepLinkedOrder, ...nextOrders];
        } catch {
          // Keep the normal first page if the deep link points at a stale or deleted order.
        }
      }

      setOrders(nextOrders);
      setCustomerProfiles(customersResult?.records || []);
      setOrderPagination(result.pagination);
      void loadOrderAnalytics();
      void loadOrderDeliveryEvents();
      void loadCronReadiness();
      void loadProviderReadiness();
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Unable to load orders');
    } finally {
      setIsLoading(false);
    }
  };

  const loadMoreOrders = async () => {
    if (!ordersCollection || !orderPagination?.hasMore || isOrdersBusy || !canViewOrders) return;

    setIsLoading(true);
    setError(null);

    try {
      const nextOffset = orderPagination.offset + orderPagination.limit;
      const result = await listCollectionRecords(activeSiteId, ordersCollection.id, {
        limit: ORDER_RECORD_PAGE_SIZE,
        offset: nextOffset,
        sortBy: 'updatedAt',
        sortDirection: 'desc',
      });
      setOrders((current) => {
        const existingIds = new Set(current.map((order) => order.id));
        return [
          ...current,
          ...result.records.filter((order) => !existingIds.has(order.id)),
        ];
      });
      setOrderPagination(result.pagination);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Unable to load more orders');
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
  }, [activeSiteId, canViewOrders, isPermissionMatrixPending]);

  useEffect(() => {
    let cancelled = false;
    if (!routeSearch.orderId || !ordersCollection || !canViewOrders || isPermissionMatrixPending) return () => {
      cancelled = true;
    };

    getCollectionRecord(activeSiteId, ordersCollection.id, routeSearch.orderId)
      .then((order) => {
        if (cancelled) return;
        setOrders((current) => {
          const existing = current.filter((item) => item.id !== order.id);
          return [order, ...existing];
        });
      })
      .catch(() => {
        // The deep link may point at a record that was deleted by a smoke cleanup or another admin.
      });

    return () => {
      cancelled = true;
    };
  }, [activeSiteId, canViewOrders, isPermissionMatrixPending, ordersCollection, routeSearch.orderId]);

  useEffect(() => {
    if (!selectedOrder) return;
    setFormState(orderToForm(selectedOrder));
  }, [selectedOrder]);

  useEffect(() => {
    setSelectedCustomerProfileId(linkedCustomerProfile?.id || null);
    setCustomerProfileDraft(customerProfileToDraft(linkedCustomerProfile));
  }, [linkedCustomerProfile]);

  useEffect(() => {
    const orderIds = new Set(orders.map((order) => order.id));
    setSelectedOrderIds((current) => current.filter((orderId) => orderIds.has(orderId)));
  }, [orders]);

  const clearOrderEditorState = (nextFormState: OrderFormState = EMPTY_ORDER_FORM) => {
    setSelectedOrderId(null);
    setSelectedCustomerProfileId(null);
    setCustomerProfileDraft(customerProfileToDraft(null));
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
    if (!canEditOrders) {
      setError(editPermissionTitle || 'Your account cannot edit orders.');
      return;
    }

    clearOrderEditorState({
      ...EMPTY_ORDER_FORM,
      orderNumber: `ORD-${Date.now().toString().slice(-6)}`,
    });
    updateOrdersRouteSearch({ orderId: undefined });
  };

  const selectOrderForEditing = (orderId: string) => {
    if (isOrdersBusy) return;
    if (!canViewOrders) {
      setError(viewPermissionTitle || 'Your account cannot view orders.');
      return;
    }

    setSelectedOrderId(orderId);
    updateOrdersRouteSearch({ orderId });
  };

  const setLineItems = (items: OrderLineItem[]) => {
    setFormState((current) => ({ ...current, items: serializeOrderLineItems(items, current.currency) }));
  };

  const addLineItem = () => {
    if (isOrdersBusy) return;
    if (!canEditOrders) return;

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
    if (!canEditOrders) return;

    setLineItems(orderLineItems.filter((item) => item.id !== itemId));
  };

  const applyLineItemTotals = () => {
    if (isOrdersBusy) return;
    if (!canEditOrders) return;

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
    if (!canConfigureOrders) {
      setError(configurePermissionTitle || 'Your account cannot configure commerce orders.');
      return;
    }

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
      setOrderPagination({
        total: 0,
        limit: ORDER_RECORD_PAGE_SIZE,
        offset: 0,
        hasMore: false,
      });
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
    if (!canConfigureOrders) {
      setError(configurePermissionTitle || 'Your account cannot configure commerce orders.');
      return;
    }

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
    if (!canEditOrders) {
      setError(editPermissionTitle || 'Your account cannot save orders.');
      return;
    }

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
        trackingstatus: formState.trackingStatus.trim(),
        trackinglastcheckedat: formState.trackingLastCheckedAt || null,
        fulfilledat: formState.fulfilledAt || null,
        shippinglabelstatus: formState.shippingLabelStatus,
        shippinglabelprovider: formState.shippingLabelProvider.trim(),
        shippinglabelid: formState.shippingLabelId.trim(),
        shippinglabelurl: formState.shippingLabelUrl.trim(),
        shippingservicelevel: formState.shippingServiceLevel.trim(),
        shippinglabelcost: formState.shippingLabelCost ? Number(formState.shippingLabelCost) : null,
        shippinglabelcreatedat: formState.shippingLabelCreatedAt || null,
        fulfillmentdispatchstatus: formState.fulfillmentDispatchStatus,
        fulfillmentprovider: formState.fulfillmentProvider.trim(),
        fulfillmentid: formState.fulfillmentId.trim(),
        fulfillmentrequestedat: formState.fulfillmentRequestedAt || null,
        fulfillmentcompletedat: formState.fulfillmentCompletedAt || null,
        fulfillmentpayload: formState.fulfillmentPayload.trim(),
        riskscore: formState.riskScore ? Number(formState.riskScore) : 0,
        risklevel: formState.riskLevel,
        riskreasons: formState.riskReasons.trim(),
        riskreviewstatus: formState.riskReviewStatus,
        shippingaddress: formState.shippingAddress.trim(),
        billingaddress: formState.billingAddress.trim(),
        refundamount: formState.refundAmount ? Number(formState.refundAmount) : null,
        refundreason: formState.refundReason.trim(),
        providerrefundstatus: formState.providerRefundStatus,
        providerrefundprovider: formState.providerRefundProvider.trim(),
        providerrefundid: formState.providerRefundId.trim(),
        providerrefundreference: formState.providerRefundReference.trim(),
        providerrefundamount: formState.providerRefundAmount ? Number(formState.providerRefundAmount) : null,
        providerrefundreason: formState.providerRefundReason.trim(),
        providerrefundrequestedat: formState.providerRefundRequestedAt || null,
        providerrefundcompletedat: formState.providerRefundCompletedAt || null,
        providerrefundpayload: formState.providerRefundPayload.trim(),
        notes: formState.notes.trim(),
      },
    };

    try {
      const saved = selectedOrder
        ? await updateCollectionRecord(activeSiteId, ordersCollection.id, selectedOrder.id, input)
        : await createCollectionRecord(activeSiteId, ordersCollection.id, input);

      setOrders((current) => [saved, ...current.filter((order) => order.id !== saved.id)]);
      if (!selectedOrder) {
        setOrderPagination((current) => (current ? {
          ...current,
          total: current.total + 1,
        } : current));
      }
      setSelectedOrderId(saved.id);
      updateOrdersRouteSearch({ orderId: saved.id });
      void loadOrderAnalytics();
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
    if (!canEditOrders) {
      setError(editPermissionTitle || 'Your account cannot update order workflow.');
      return;
    }

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
      void loadOrderAnalytics();
      const workflowNotice = updates.orderStatus === 'refunded'
        ? 'Manual refund/return state recorded in Backy. Complete the provider refund separately if payment was captured outside Backy.'
        : updates.orderStatus === 'cancelled'
          ? 'Manual cancellation state recorded in Backy. Complete provider cancellation/refund steps separately if needed.'
          : 'Order workflow updated.';
      setNotice(workflowNotice);
    } catch (workflowError) {
      setError(workflowError instanceof Error ? workflowError.message : 'Unable to update order');
    } finally {
      setIsSaving(false);
    }
  };

  const prepareOrderShippingLabel = async (order: CollectionRecord) => {
    if (isOrdersBusy) return;
    if (!canEditOrders) {
      setError(editPermissionTitle || 'Your account cannot prepare shipping labels.');
      return;
    }

    setIsSaving(true);
    setError(null);
    setNotice(null);

    try {
      const provider = String(readOrderValue(order.values, 'fulfillmentcarrier', '') || '').trim() || 'manual';
      const { record: updated, label } = await createOrderShippingLabel(activeSiteId, order.id, {
        provider,
        serviceLevel: String(readOrderValue(order.values, 'shippingservicelevel', '') || '').trim() || 'standard',
      });
      setOrders((current) => current.map((item) => (item.id === updated.id ? updated : item)));
      if (selectedOrderId === updated.id) {
        setFormState(orderToForm(updated));
      }
      void loadOrderAnalytics();
      setNotice(`Shipping label draft ${label.id} prepared for ${label.provider}.`);
    } catch (labelError) {
      setError(labelError instanceof Error ? labelError.message : 'Unable to prepare shipping label');
    } finally {
      setIsSaving(false);
    }
  };

  const voidOrderShippingLabelAction = async (order: CollectionRecord) => {
    if (isOrdersBusy) return;
    if (!canEditOrders) {
      setError(editPermissionTitle || 'Your account cannot void shipping labels.');
      return;
    }

    setIsSaving(true);
    setError(null);
    setNotice(null);

    try {
      const { record: updated, label } = await voidOrderShippingLabel(activeSiteId, order.id);
      setOrders((current) => current.map((item) => (item.id === updated.id ? updated : item)));
      if (selectedOrderId === updated.id) {
        setFormState(orderToForm(updated));
      }
      void loadOrderAnalytics();
      setNotice(`Shipping label ${label.id} voided.`);
    } catch (labelError) {
      setError(labelError instanceof Error ? labelError.message : 'Unable to void shipping label');
    } finally {
      setIsSaving(false);
    }
  };

  const refreshOrderTrackingAction = async (order: CollectionRecord) => {
    if (isOrdersBusy) return;
    if (!canEditOrders) {
      setError(editPermissionTitle || 'Your account cannot refresh tracking.');
      return;
    }

    setIsSaving(true);
    setError(null);
    setNotice(null);

    try {
      const fulfillmentCarrier = String(readOrderValue(order.values, 'fulfillmentcarrier', '') || '').trim();
      const shippingLabelProvider = String(readOrderValue(order.values, 'shippinglabelprovider', '') || '').trim();
      const executionProvider = resolveTrackingExecutionProvider({
        settingsProvider: commerceSettings?.shippingLabelProvider,
        shippingLabelProvider,
        fulfillmentCarrier,
      });
      const { record: updated, tracking } = await refreshOrderTracking(activeSiteId, order.id, {
        provider: executionProvider || fulfillmentCarrier,
        carrier: fulfillmentCarrier || shippingLabelProvider,
        trackingNumber: String(readOrderValue(order.values, 'trackingnumber', '') || '').trim(),
        trackingUrl: String(readOrderValue(order.values, 'trackingurl', '') || '').trim(),
        ...(executionProvider ? { executionProvider } : {}),
      });
      setOrders((current) => current.map((item) => (item.id === updated.id ? updated : item)));
      if (selectedOrderId === updated.id) {
        setFormState(orderToForm(updated));
      }
      void loadOrderAnalytics();
      setNotice(`Tracking refreshed for ${tracking.trackingNumber}: ${tracking.status}.`);
    } catch (trackingError) {
      setError(trackingError instanceof Error ? trackingError.message : 'Unable to refresh tracking');
    } finally {
      setIsSaving(false);
    }
  };

  const refreshOrderQuoteAction = async (order: CollectionRecord) => {
    if (isOrdersBusy) return;
    if (!canEditOrders) {
      setError(editPermissionTitle || 'Your account cannot refresh order quotes.');
      return;
    }

    setIsSaving(true);
    setError(null);
    setNotice(null);

    try {
      const { record: updated, quote } = await refreshOrderQuote(activeSiteId, order.id);
      setOrders((current) => current.map((item) => (item.id === updated.id ? updated : item)));
      if (selectedOrderId === updated.id) {
        setFormState(orderToForm(updated));
      }
      void loadOrderAnalytics();
      const providerSummary = quote.providerAdjustments?.length
        ? ` Provider calculators: ${quote.providerAdjustments.map((item) => `${item.kind} ${item.status}`).join(', ')}.`
        : '';
      setNotice(`Quote refreshed: ${formatMoney(quote.total, quote.currency)} total.${providerSummary}`);
    } catch (quoteError) {
      setError(quoteError instanceof Error ? quoteError.message : 'Unable to refresh order quote');
    } finally {
      setIsSaving(false);
    }
  };

  const dispatchOrderFulfillmentAction = async (order: CollectionRecord) => {
    if (isOrdersBusy) return;
    if (!canEditOrders) {
      setError(editPermissionTitle || 'Your account cannot dispatch fulfillment.');
      return;
    }

    setIsSaving(true);
    setError(null);
    setNotice(null);

    try {
      const { record: updated, fulfillment } = await dispatchOrderFulfillment(activeSiteId, order.id, {
        provider: String(readOrderValue(order.values, 'fulfillmentprovider', '') || readOrderValue(order.values, 'fulfillmentcarrier', '') || '').trim() || 'manual',
        requestedBy: currentAdmin?.email || currentAdmin?.id || 'backy-admin',
      });
      setOrders((current) => current.map((item) => (item.id === updated.id ? updated : item)));
      if (selectedOrderId === updated.id) {
        setFormState(orderToForm(updated));
      }
      void loadOrderAnalytics();
      setNotice(`Fulfillment dispatch ${fulfillment.status.replace(/_/g, ' ')} for ${fulfillment.provider}.`);
    } catch (fulfillmentError) {
      setError(fulfillmentError instanceof Error ? fulfillmentError.message : 'Unable to dispatch fulfillment');
    } finally {
      setIsSaving(false);
    }
  };

  const requestOrderProviderRefund = async (order: CollectionRecord) => {
    if (isOrdersBusy) return;
    if (!canEditOrders) {
      setError(editPermissionTitle || 'Your account cannot request provider refunds.');
      return;
    }

    setIsSaving(true);
    setError(null);
    setNotice(null);

    try {
      const amount = toNumber(readOrderValue(order.values, 'refundamount', 0)) || toNumber(readOrderValue(order.values, 'total', 0));
      const reason = String(readOrderValue(order.values, 'refundreason', '') || '').trim() || 'Provider refund requested from Backy order workflow.';
      const { record: updated, refund } = await createOrderProviderRefund(activeSiteId, order.id, {
        amount,
        reason,
        provider: String(readOrderValue(order.values, 'paymentprovider', '') || '').trim() || 'manual',
      });
      setOrders((current) => current.map((item) => (item.id === updated.id ? updated : item)));
      if (selectedOrderId === updated.id) {
        setFormState(orderToForm(updated));
      }
      void loadOrderAnalytics();
      setNotice(`Provider refund ${refund.status} for ${formatMoney(refund.amount, refund.currency)}.`);
    } catch (refundError) {
      setError(refundError instanceof Error ? refundError.message : 'Unable to request provider refund');
    } finally {
      setIsSaving(false);
    }
  };

  const refreshOrderProviderRefundAction = async (order: CollectionRecord) => {
    if (isOrdersBusy) return;
    if (!canEditOrders) {
      setError(editPermissionTitle || 'Your account cannot refresh provider refunds.');
      return;
    }

    setIsSaving(true);
    setError(null);
    setNotice(null);

    try {
      const { record: updated, refund } = await refreshOrderProviderRefund(activeSiteId, order.id);
      setOrders((current) => current.map((item) => (item.id === updated.id ? updated : item)));
      if (selectedOrderId === updated.id) {
        setFormState(orderToForm(updated));
      }
      void loadOrderAnalytics();
      setNotice(`Provider refund refresh ${refund.status} for ${formatMoney(refund.amount, refund.currency)}.`);
    } catch (refundError) {
      setError(refundError instanceof Error ? refundError.message : 'Unable to refresh provider refund');
    } finally {
      setIsSaving(false);
    }
  };

  const selectCustomerProfile = (customer: CollectionRecord) => {
    if (isOrdersBusy) return;
    if (!canViewOrders) {
      setError(viewPermissionTitle || 'Your account cannot view customer profiles.');
      return;
    }

    setSelectedCustomerProfileId(customer.id);
    setCustomerProfileDraft(customerProfileToDraft(customer));
  };

  const saveCustomerProfile = async () => {
    if (!customersCollection || !selectedCustomerProfile) return;
    if (isOrdersBusy) return;
    if (!canEditOrders) {
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
      void loadOrderAnalytics();
      setNotice('Customer profile updated.');
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Unable to update customer profile');
    } finally {
      setIsSavingCustomerProfile(false);
    }
  };

  const toggleOrderSelection = (orderId: string, checked: boolean) => {
    setSelectedOrderIds((current) => {
      if (checked) {
        return current.includes(orderId) ? current : [...current, orderId];
      }

      return current.filter((selectedId) => selectedId !== orderId);
    });
  };

  const toggleVisibleOrderSelection = (checked: boolean) => {
    if (!checked) {
      const visibleOrderIds = new Set(filteredOrders.map((order) => order.id));
      setSelectedOrderIds((current) => current.filter((orderId) => !visibleOrderIds.has(orderId)));
      return;
    }

    setSelectedOrderIds((current) => {
      const selected = new Set(current);
      filteredOrders.forEach((order) => selected.add(order.id));
      return Array.from(selected);
    });
  };

  const clearOrderSelection = () => {
    setSelectedOrderIds([]);
  };

  const bulkUpdateOrderWorkflow = async (
    action: 'paid' | 'processing' | 'fulfilled' | 'cancelled',
  ) => {
    if (!ordersCollection) return;
    if (isOrdersBusy) return;
    if (!canEditOrders) {
      setError(editPermissionTitle || 'Your account cannot update order workflow.');
      return;
    }

    const selectedOrders = selectedLoadedOrders;
    if (selectedOrders.length === 0) {
      setError('Select at least one order before applying a bulk action.');
      setNotice(null);
      return;
    }

    const actionUpdates = (order: CollectionRecord): Partial<OrderFormState> => {
      if (action === 'paid') {
        return buildPaidWorkflowUpdates(order);
      }
      if (action === 'processing') {
        return buildProcessingWorkflowUpdates(order);
      }
      if (action === 'fulfilled') {
        return buildFulfilledWorkflowUpdates(order);
      }

      return buildCancelWorkflowUpdates(order);
    };

    setIsSaving(true);
    setError(null);
    setNotice(null);

    const actionLabel = action === 'paid'
      ? 'marked paid'
      : action === 'processing'
        ? 'moved to processing'
        : action === 'fulfilled'
          ? 'fulfilled'
          : 'marked cancelled in Backy';

    try {
      const updateResults = await Promise.all(selectedOrders.map(async (order) => {
        try {
          const updated = await updateCollectionRecord(activeSiteId, ordersCollection.id, order.id, {
            status: order.status,
            values: {
              ...order.values,
              ...toOrderValueUpdates(actionUpdates(order)),
            },
          });
          return { ok: true as const, order, updated };
        } catch (error) {
          return { ok: false as const, order, error };
        }
      }));

      const updatedOrders = updateResults
        .filter((result): result is Extract<typeof result, { ok: true }> => result.ok)
        .map((result) => result.updated);
      const failedResults = updateResults.filter((result): result is Extract<typeof result, { ok: false }> => !result.ok);

      if (updatedOrders.length === 0) {
        const firstError = failedResults[0]?.error;
        throw firstError instanceof Error ? firstError : new Error('Unable to update selected orders');
      }

      const updatedById = new Map(updatedOrders.map((order) => [order.id, order]));
      setOrders((current) => current.map((order) => updatedById.get(order.id) || order));
      const updatedSelectedOrder = selectedOrderId ? updatedById.get(selectedOrderId) : null;
      if (updatedSelectedOrder) {
        setFormState(orderToForm(updatedSelectedOrder));
      }
      void loadOrderAnalytics();
      setNotice(`${updatedOrders.length} selected order${updatedOrders.length === 1 ? '' : 's'} ${actionLabel}.`);
      if (failedResults.length > 0) {
        const failedOrderNumbers = failedResults
          .map((result) => String(readOrderValue(result.order.values, 'ordernumber', result.order.slug) || result.order.slug || result.order.id))
          .slice(0, 5);
        const remainingFailures = Math.max(0, failedResults.length - failedOrderNumbers.length);
        setError(`${failedResults.length} selected order${failedResults.length === 1 ? '' : 's'} could not be updated: ${failedOrderNumbers.join(', ')}${remainingFailures ? `, +${remainingFailures} more` : ''}.`);
      }
    } catch (bulkError) {
      setError(bulkError instanceof Error ? bulkError.message : 'Unable to update selected orders');
    } finally {
      setIsSaving(false);
    }
  };

  const reconcileOrders = async () => {
    if (!ordersCollection) return;
    if (isOrdersBusy) return;
    if (!canConfigureOrders) {
      setError(configurePermissionTitle || 'Your account cannot reconcile commerce orders.');
      return;
    }

    setIsReconcilingOrders(true);
    setError(null);
    setNotice(null);

    try {
      const result = await reconcileCommerceOrders(activeSiteId, 100);
      setReconciliationResult(result);
      const refreshed = await listCollectionRecords(activeSiteId, ordersCollection.id, {
        limit: ORDER_RECORD_PAGE_SIZE,
        offset: 0,
        sortBy: 'updatedAt',
        sortDirection: 'desc',
      });
      setOrders(refreshed.records);
      setOrderPagination(refreshed.pagination);
      void loadOrderAnalytics();
      const updateLabel = `${result.updatedCount} order${result.updatedCount === 1 ? '' : 's'}`;
      const eventLabel = `${result.eventCount} event${result.eventCount === 1 ? '' : 's'}`;
      setNotice(`Reconciled ${eventLabel}; updated ${updateLabel}.`);
    } catch (reconcileError) {
      setError(reconcileError instanceof Error ? reconcileError.message : 'Unable to reconcile commerce orders');
    } finally {
      setIsReconcilingOrders(false);
    }
  };

  const removeOrder = async (order: CollectionRecord) => {
    if (!ordersCollection) return;
    if (isOrdersBusy) return;
    if (!canDeleteOrders) {
      setError(deletePermissionTitle || 'Your account cannot delete orders.');
      return;
    }

    setIsSaving(true);
    setError(null);
    setNotice(null);

    try {
      await deleteCollectionRecord(activeSiteId, ordersCollection.id, order.id);
      setOrders((current) => current.filter((item) => item.id !== order.id));
      setOrderPagination((current) => (current ? {
        ...current,
        total: Math.max(0, current.total - 1),
      } : current));
      void loadOrderAnalytics();
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
    if (!canExportOrders) {
      setError(exportPermissionTitle || 'Your account cannot export order endpoints.');
      return;
    }

    try {
      await navigator.clipboard.writeText(value);
      setNotice(`${label} copied.`);
    } catch {
      setNotice(value);
    }
  };

  const openAdminOrdersApi = async () => {
    if (isOrdersBusy || !adminOrdersApiUrl) return;
    if (!canExportOrders) {
      setError(exportPermissionTitle || 'Your account cannot open order endpoints.');
      return;
    }

    setError(null);
    setNotice(null);

    try {
      const response = await adminFetch(adminOrdersApiUrl);
      const payload = await response.json().catch(() => null);

      if (!response.ok || payload?.success === false) {
        const message = payload?.error?.message || payload?.message || `Admin API returned ${response.status}.`;
        throw new Error(message);
      }

      const responseText = JSON.stringify(payload, null, 2);
      const responseUrl = URL.createObjectURL(new Blob([responseText], { type: 'application/json' }));
      const opened = window.open(responseUrl, '_blank', 'noopener,noreferrer');
      window.setTimeout(() => URL.revokeObjectURL(responseUrl), 60_000);

      if (opened) {
        setNotice('Authenticated admin API response opened.');
        return;
      }

      await navigator.clipboard.writeText(responseText);
      setNotice('Authenticated admin API response copied.');
    } catch (openError) {
      setError(openError instanceof Error ? openError.message : 'Unable to open admin API response.');
    }
  };

  const copyOrderHandoff = async () => {
    if (isOrdersBusy) return;
    if (!canExportOrders) {
      setError(exportPermissionTitle || 'Your account cannot export order data.');
      return;
    }

    try {
      await navigator.clipboard.writeText(orderHandoffText);
      setNotice('Order handoff manifest copied.');
    } catch {
      setNotice(orderHandoffText);
    }
  };

  const copyProviderCertificationHandoff = async () => {
    if (isOrdersBusy) return;
    if (!canExportOrders) {
      setError(exportPermissionTitle || 'Your account cannot export order data.');
      return;
    }

    try {
      await navigator.clipboard.writeText(providerCertificationHandoffText);
      setNotice('Orders provider certification handoff copied.');
    } catch {
      setNotice(providerCertificationHandoffText);
    }
  };

  const copyProviderCertificationOperatorGate = async () => {
    if (isOrdersBusy) return;
    if (!canExportOrders) {
      setError(exportPermissionTitle || 'Your account cannot export order data.');
      return;
    }

    try {
      await navigator.clipboard.writeText(providerCertificationCommand);
      setNotice('Orders provider certification CI command copied.');
    } catch {
      setNotice(providerCertificationCommand);
    }
  };

  const downloadOrderHandoff = () => {
    if (isOrdersBusy) return;
    if (!canExportOrders) {
      setError(exportPermissionTitle || 'Your account cannot export order data.');
      return;
    }

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

  const downloadProviderCertificationHandoff = () => {
    if (isOrdersBusy) return;
    if (!canExportOrders) {
      setError(exportPermissionTitle || 'Your account cannot export order data.');
      return;
    }

    const blob = new Blob([providerCertificationHandoffText], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `${activeSite?.slug || activeSiteId}-backy-orders-provider-certification.json`;
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
    setNotice('Orders provider certification handoff downloaded.');
  };

  const exportOrdersCsv = () => {
    if (isOrdersBusy) return;
    if (filteredOrders.length === 0) return;
    if (!canExportOrders) {
      setError(exportPermissionTitle || 'Your account cannot export orders.');
      return;
    }

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
  const downloadOrderImportTemplate = () => {
    if (isOrdersBusy) return;
    if (!canEditOrders) {
      setError(editPermissionTitle || 'Your account cannot import orders.');
      return;
    }

    const csv = `${ORDER_IMPORT_COLUMNS.join(',')}\n`;
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `${activeSite?.slug || activeSiteId}-orders-import-template.csv`;
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
    setNotice('Order import template downloaded.');
  };
  const importOrdersCsv = async (event: ChangeEvent<HTMLInputElement>) => {
    if (!ordersCollection) return;
    if (isOrdersBusy) return;
    if (!canEditOrders) {
      setError(editPermissionTitle || 'Your account cannot import orders.');
      event.target.value = '';
      return;
    }

    const file = event.target.files?.[0];
    if (!file) return;

    setIsImportingOrders(true);
    setError(null);
    setNotice(null);

    try {
      const csv = await file.text();
      const result = await importCollectionRecordsCsv(activeSiteId, ordersCollection.id, csv, { upsert: true });
      const refreshed = await listCollectionRecords(activeSiteId, ordersCollection.id, {
        limit: ORDER_RECORD_PAGE_SIZE,
        offset: 0,
        sortBy: 'updatedAt',
        sortDirection: 'desc',
      });
      setOrders(refreshed.records);
      setOrderPagination(refreshed.pagination);
      void loadOrderAnalytics();
      setNotice(`${result.created} created, ${result.updated} updated, ${result.skipped} skipped from ${file.name}.`);
      if (result.errors.length > 0) {
        const firstError = result.errors[0];
        setError(`Row ${firstError.row} skipped: ${firstError.message}`);
      }
    } catch (importError) {
      setError(importError instanceof Error ? importError.message : 'Unable to import orders');
    } finally {
      setIsImportingOrders(false);
      event.target.value = '';
    }
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
    if (!canEditPages) {
      setError(pagesEditPermissionTitle || 'Your account cannot create storefront pages.');
      return;
    }

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
    setOrderAnalytics(null);
    setOrderAnalyticsError(null);
    setOrderDeliveryEvents([]);
    setOrderDeliveryError(null);
    setCommerceSettings(null);
    setRuntimeCommerce(null);
    setProviderReadinessError(null);
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
            disabled={isOrdersAccessBusy}
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
          <Button onClick={() => void loadOrders()} disabled={isOrdersAccessBusy || !canViewOrders} title={!canViewOrders ? viewPermissionTitle : undefined} iconStart={<RefreshCw className={cn('size-4', isLoading && 'animate-spin')} />}>
            Refresh
          </Button>
        </div>
      }
      className="w-full"
    >
      {error && (
        <div
          role="alert"
          data-testid="orders-error-state"
          className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900"
        >
          <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
            <div className="flex gap-3">
              <AlertTriangle className="mt-0.5 size-4 shrink-0" />
              <div>
                <p className="font-semibold">Orders workspace needs attention</p>
                <p className="mt-1 leading-6">{error}</p>
              </div>
            </div>
            <div className="flex shrink-0 flex-wrap items-center gap-2">
              {hasActiveOrderFilters && (
                <button
                  type="button"
                  onClick={clearOrderFilters}
                  disabled={isOrdersAccessBusy || !canViewOrders}
                  className="inline-flex items-center rounded-lg border border-amber-300 bg-white px-3 py-1.5 text-xs font-semibold text-amber-900 transition-colors hover:bg-amber-100 focus-ring disabled:cursor-not-allowed disabled:opacity-60"
                >
                  Clear filters
                </button>
              )}
              <button
                type="button"
                onClick={() => void loadOrders()}
                disabled={isOrdersAccessBusy || !canViewOrders}
                title={!canViewOrders ? viewPermissionTitle : undefined}
                aria-label="Retry loading orders"
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
          data-testid="orders-permission-state"
          className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900"
        >
          <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
            <div className="flex gap-3">
              <AlertTriangle className="mt-0.5 size-4 shrink-0" />
              <div>
                <p className="font-semibold">Order permissions could not be verified</p>
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
                onClick={() => void loadOrders()}
                disabled={isOrdersBusy}
                aria-label="Retry loading order permissions"
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
        ref={orderImportInputRef}
        type="file"
        accept=".csv,text/csv"
        className="hidden"
        aria-label="Import orders CSV"
        onChange={(event) => void importOrdersCsv(event)}
      />

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
            <Button variant="outline" onClick={() => void copyOrderHandoff()} disabled={isOrdersAccessBusy || !canExportOrders} title={!canExportOrders ? exportPermissionTitle : undefined} iconStart={<Copy className="size-4" />}>
              Copy manifest
            </Button>
            <Button variant="outline" onClick={downloadOrderHandoff} disabled={isOrdersAccessBusy || !canExportOrders} title={!canExportOrders ? exportPermissionTitle : undefined} iconStart={<Download className="size-4" />}>
              Download JSON
            </Button>
            <Button variant="outline" onClick={exportOrdersCsv} disabled={isOrdersAccessBusy || !canExportOrders || filteredOrders.length === 0} title={!canExportOrders ? exportPermissionTitle : undefined} iconStart={<Download className="size-4" />}>
              Export CSV
            </Button>
            <Button variant="outline" onClick={downloadOrderImportTemplate} disabled={!ordersCollection || isOrdersAccessBusy || !canEditOrders} title={!canEditOrders ? editPermissionTitle : undefined} iconStart={<FileText className="size-4" />}>
              CSV template
            </Button>
            <Button variant="outline" onClick={() => orderImportInputRef.current?.click()} disabled={!ordersCollection || isOrdersAccessBusy || !canEditOrders} title={!canEditOrders ? editPermissionTitle : undefined} iconStart={<Upload className="size-4" />}>
              {isImportingOrders ? 'Importing...' : 'Import CSV'}
            </Button>
            <Button variant="outline" onClick={openProductsWorkspace} disabled={isOrdersBusy} iconStart={<ShoppingCart className="size-4" />}>
              Products
            </Button>
            <Button variant="outline" onClick={openStorefrontPage} disabled={isOrdersAccessBusy || !canEditPages} title={!canEditPages ? pagesEditPermissionTitle : undefined} iconStart={<Sparkles className="size-4" />}>
              Storefront page
            </Button>
            {!ordersCollection ? (
              <Button onClick={() => void createOrdersCollection()} disabled={isOrdersAccessBusy || !canConfigureOrders} title={!canConfigureOrders ? configurePermissionTitle : undefined} iconStart={<Sparkles className="size-4" />}>
                {isSaving ? 'Setting up...' : 'Set up orders'}
              </Button>
            ) : (
              <Button onClick={resetForm} disabled={isOrdersAccessBusy || !canEditOrders} title={!canEditOrders ? editPermissionTitle : undefined} iconStart={<Plus className="size-4" />}>
                New order
              </Button>
            )}
            <Button onClick={() => void loadOrders()} disabled={isOrdersAccessBusy || !canViewOrders} title={!canViewOrders ? viewPermissionTitle : undefined} iconStart={<RefreshCw className={cn('size-4', isLoading && 'animate-spin')} />}>
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
          <div className="mt-4 grid gap-2 md:grid-cols-2 xl:grid-cols-6">
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
                    disabled={isOrdersAccessBusy || !canConfigureOrders}
                    title={!canConfigureOrders ? configurePermissionTitle : undefined}
                    iconStart={<Sparkles className="size-4" />}
                  >
                    Sync Schema
                  </Button>
                )}
                <Button onClick={() => void copyOrderHandoff()} disabled={isOrdersAccessBusy || !canExportOrders} title={!canExportOrders ? exportPermissionTitle : undefined} iconStart={<Copy className="size-4" />}>
                  Copy manifest
                </Button>
                <Button onClick={exportOrdersCsv} disabled={isOrdersAccessBusy || !canExportOrders || filteredOrders.length === 0} title={!canExportOrders ? exportPermissionTitle : undefined} iconStart={<Download className="size-4" />}>
                  Export CSV
                </Button>
                <Button variant="outline" onClick={downloadOrderImportTemplate} disabled={isOrdersAccessBusy || !canEditOrders} title={!canEditOrders ? editPermissionTitle : undefined} iconStart={<FileText className="size-4" />}>
                  CSV template
                </Button>
                <Button variant="outline" onClick={() => orderImportInputRef.current?.click()} disabled={isOrdersAccessBusy || !canEditOrders} title={!canEditOrders ? editPermissionTitle : undefined} iconStart={<Upload className="size-4" />}>
                  {isImportingOrders ? 'Importing...' : 'Import CSV'}
                </Button>
                <Button onClick={() => void copyOrdersApiUrl(adminOrdersApiUrl, 'Internal orders API URL')} disabled={isOrdersAccessBusy || !canExportOrders} title={!canExportOrders ? exportPermissionTitle : undefined} iconStart={<Copy className="size-4" />}>
                  Copy admin API
                </Button>
                <Button onClick={() => void copyOrdersApiUrl(publicOrderIntakeUrl, 'Checkout intake URL')} disabled={isOrdersAccessBusy || !canExportOrders} title={!canExportOrders ? exportPermissionTitle : undefined} iconStart={<Copy className="size-4" />}>
                  Copy checkout
                </Button>
                <Button
                  variant="outline"
                  onClick={() => void reconcileOrders()}
                  disabled={isOrdersAccessBusy || !ordersApiReady || !canConfigureOrders}
                  title={!canConfigureOrders ? configurePermissionTitle : undefined}
                  iconStart={<RefreshCw className="size-4" />}
                  data-testid="orders-reconcile-provider"
                >
                  {isReconcilingOrders ? 'Reconciling...' : 'Reconcile provider'}
                </Button>
                <Button variant="outline" onClick={openProductsWorkspace} disabled={isOrdersBusy} iconStart={<ShoppingCart className="size-4" />}>
                  Products
                </Button>
                <Button variant="outline" onClick={openStorefrontPage} disabled={isOrdersAccessBusy || !canEditPages} title={!canEditPages ? pagesEditPermissionTitle : undefined} iconStart={<Sparkles className="size-4" />}>
                  Storefront page
                </Button>
                <Button
                  variant="outline"
                  onClick={() => void openAdminOrdersApi()}
                  disabled={isOrdersAccessBusy || !canExportOrders}
                  title={!canExportOrders ? exportPermissionTitle : 'Fetch with your admin session and open the JSON response.'}
                  iconStart={<ExternalLink className="size-4" />}
                >
                  Open admin API
                </Button>
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
                  <OrderApiSnippet icon={<BarChart3 className="size-4" />} label="Order analytics" value={orderAnalyticsApiUrl} />
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
                    <span className="rounded-md border border-border bg-background px-2 py-1">
                      publicUpdate {ordersCollection.permissions.publicUpdate ? 'enabled' : 'disabled'}
                    </span>
                    <span className="rounded-md border border-border bg-background px-2 py-1">
                      publicDelete {ordersCollection.permissions.publicDelete ? 'enabled' : 'disabled'}
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
                <span>{loadedOrderCount} loaded / {totalOrderCount} internal records</span>
              </div>
              {missingOrderFields.length > 0 && (
                <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
                  Missing order fields: {missingOrderFields.join(', ')}. Sync the schema before relying on fulfillment workflows.
                </div>
              )}
              {reconciliationResult && (
                <div className="rounded-lg border border-border bg-background p-3 text-sm" data-testid="orders-reconciliation-result">
                  <div className="flex flex-wrap items-center gap-2 font-medium">
                    <RefreshCw className="size-4" />
                    Provider reconciliation
                  </div>
                  <div className="mt-2 flex flex-wrap gap-2 text-xs text-muted-foreground">
                    <span className="rounded-md border border-border bg-muted px-2 py-1">{reconciliationResult.eventCount} events checked</span>
                    <span className="rounded-md border border-border bg-muted px-2 py-1">{reconciliationResult.updatedCount} orders updated</span>
                    <span className="rounded-md border border-border bg-muted px-2 py-1">{reconciliationResult.unmatchedCount} unmatched</span>
                  </div>
                </div>
              )}
              <div className="rounded-lg border border-border bg-background p-3 text-sm" data-testid="orders-provider-readiness">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="flex flex-wrap items-center gap-2 font-medium">
                      {providerReadinessReadyCount === providerReadinessChecks.length ? (
                        <CheckCircle2 className="size-4 text-success" />
                      ) : (
                        <AlertTriangle className="size-4 text-warning" />
                      )}
                      Provider execution readiness
                    </div>
                    <p className="mt-1 text-xs leading-5 text-muted-foreground">
                      Reads non-secret commerce settings/runtime diagnostics so operators know whether quote, label, fulfillment, refund, webhook, and reconciliation actions will execute or fall back to manual handoff.
                    </p>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => void loadProviderReadiness()}
                    disabled={isProviderReadinessLoading || isPermissionMatrixPending || !canViewCommerce}
                    title={!canViewCommerce ? viewPermissionTitle : undefined}
                    iconStart={<RefreshCw className={cn('size-4', isProviderReadinessLoading && 'animate-spin')} />}
                  >
                    Refresh providers
                  </Button>
                </div>
                <div className="mt-3 grid gap-2 md:grid-cols-2 xl:grid-cols-4">
                  {providerReadinessChecks.map((check) => (
                    <ProviderReadinessPill key={check.key} title={check.title} mode={check.mode} ready={check.ready} detail={check.detail} />
                  ))}
                </div>
                {runtimeCommerce?.missing?.length ? (
                  <div className="mt-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                    Missing runtime commerce env: {runtimeCommerce.missing.join(', ')}.
                  </div>
                ) : null}
                {providerReadinessError ? (
                  <div className="mt-3 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
                    {providerReadinessError}
                  </div>
                ) : null}
                <div className="mt-3 rounded-lg border border-border bg-card p-3" data-testid="orders-provider-certification">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <div className="text-xs font-semibold text-foreground">Live provider certification</div>
                      <p className="mt-1 max-w-3xl text-xs leading-5 text-muted-foreground">
                        Mock-provider operations are covered by {providerCertificationSummary.localMockGate}. Live order execution remains gated on provider accounts, webhook secrets, carrier credentials, and warehouse endpoints through {providerCertificationSummary.liveCertificationGate}.
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => void copyProviderCertificationHandoff()}
                        disabled={isOrdersAccessBusy || !canExportOrders}
                        title={!canExportOrders ? exportPermissionTitle : undefined}
                        iconStart={<Copy className="size-4" />}
                        data-testid="orders-provider-certification-copy-button"
                      >
                        Copy provider handoff
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => void copyProviderCertificationOperatorGate()}
                        disabled={isOrdersAccessBusy || !canExportOrders}
                        title={!canExportOrders ? exportPermissionTitle : undefined}
                        iconStart={<Copy className="size-4" />}
                        data-testid="orders-provider-certification-command-copy-button"
                      >
                        Copy CI command
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={downloadProviderCertificationHandoff}
                        disabled={isOrdersAccessBusy || !canExportOrders}
                        title={!canExportOrders ? exportPermissionTitle : undefined}
                        iconStart={<Download className="size-4" />}
                        data-testid="orders-provider-certification-download-button"
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
                  <div className="mt-3 rounded-md border border-border bg-background px-3 py-2 text-xs" data-testid="orders-provider-certification-runbook">
                    <div className="font-medium text-foreground">Live provider runbook</div>
                    <div className="mt-2 rounded border border-border bg-muted/30 px-2 py-1.5 font-mono text-[11px] text-foreground">
                      {providerCertificationSummary.operatorGate}
                    </div>
                    <div className="mt-3 grid gap-2 md:grid-cols-3">
                      <div>
                        <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Preflight gates</div>
                        <ul className="mt-1 space-y-1 text-[11px] text-muted-foreground">
                          {providerCertificationSummary.preflightGates.map((gate) => (
                            <li key={gate} className="font-mono">{gate}</li>
                          ))}
                        </ul>
                      </div>
                      <div>
                        <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Provider selectors</div>
                        <ul className="mt-1 space-y-1 text-[11px] text-muted-foreground">
                          {providerCertificationSummary.providerSelectors.map((selector) => (
                            <li key={selector} className="font-mono">{selector}</li>
                          ))}
                        </ul>
                      </div>
                      <div>
                        <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Evidence to attach</div>
                        <ul className="mt-1 space-y-1 text-[11px] text-muted-foreground">
                          {providerCertificationSummary.evidenceExpectations.map((expectation) => (
                            <li key={expectation}>{expectation}</li>
                          ))}
                        </ul>
	                      </div>
	                    </div>
	                  </div>
	                  <div className="mt-3 rounded-md border border-border bg-muted/10 p-3 text-xs" data-testid="orders-provider-certification-command-builder">
	                    <div className="flex flex-wrap items-start justify-between gap-3">
	                      <div>
	                        <div className="font-medium text-foreground">Order certification command builder</div>
	                        <p className="mt-1 max-w-3xl leading-5 text-muted-foreground">
	                          Select the live order-operation families for this run. The command keeps provider credentials in CI or shell environment variables and only writes non-secret selector aliases.
	                        </p>
	                      </div>
	                      <Button
	                        size="sm"
	                        variant="outline"
	                        onClick={() => void copyProviderCertificationOperatorGate()}
	                        disabled={isOrdersAccessBusy || !canExportOrders || !providerCertificationHasSelectedSelector}
	                        title={!canExportOrders ? exportPermissionTitle : !providerCertificationHasSelectedSelector ? 'Select at least one commerce provider selector' : undefined}
	                        iconStart={<Copy className="size-4" />}
	                        data-testid="orders-provider-certification-command-builder-copy-button"
	                      >
	                        Copy guarded command
	                      </Button>
	                    </div>
	                    <div className="mt-3 grid gap-2 md:grid-cols-2 xl:grid-cols-4">
	                      {([
	                        {
	                          key: 'certifyPayment',
	                          label: 'Payment/refunds',
	                          env: 'BACKY_COMMERCE_CERTIFY_PAYMENT',
	                          testId: 'orders-provider-certification-payment-toggle',
	                        },
	                        {
	                          key: 'certifyTax',
	                          label: 'Tax quotes',
	                          env: 'BACKY_COMMERCE_CERTIFY_TAX',
	                          testId: 'orders-provider-certification-tax-toggle',
	                        },
	                        {
	                          key: 'certifyShipping',
	                          label: 'Shipping/labels',
	                          env: 'BACKY_COMMERCE_CERTIFY_SHIPPING',
	                          testId: 'orders-provider-certification-shipping-toggle',
	                        },
	                        {
	                          key: 'certifyDiscount',
	                          label: 'Discount quotes',
	                          env: 'BACKY_COMMERCE_CERTIFY_DISCOUNT',
	                          testId: 'orders-provider-certification-discount-toggle',
	                        },
	                        {
	                          key: 'certifySubscriptions',
	                          label: 'Subscriptions',
	                          env: 'BACKY_COMMERCE_CERTIFY_SUBSCRIPTIONS',
	                          testId: 'orders-provider-certification-subscriptions-toggle',
	                        },
	                        {
	                          key: 'certifyWebhooks',
	                          label: 'Webhooks',
	                          env: 'BACKY_COMMERCE_CERTIFY_WEBHOOKS',
	                          testId: 'orders-provider-certification-webhooks-toggle',
	                        },
	                        {
	                          key: 'includeFulfillmentEvidence',
	                          label: 'Fulfillment',
	                          env: 'Settings fulfillmentProviderUrl',
	                          testId: 'orders-provider-certification-fulfillment-toggle',
	                        },
	                      ] satisfies Array<{
	                        key: 'certifyPayment' | 'certifyTax' | 'certifyShipping' | 'certifyDiscount' | 'certifySubscriptions' | 'certifyWebhooks' | 'includeFulfillmentEvidence';
	                        label: string;
	                        env: string;
	                        testId: string;
	                      }>).map((item) => (
	                        <label key={item.key} className="flex min-h-[88px] items-start gap-2 rounded-md border border-border bg-background px-3 py-2">
	                          <input
	                            type="checkbox"
	                            checked={providerCertificationCommandOptions[item.key]}
	                            onChange={(event) => updateProviderCertificationCommandOptions({
	                              [item.key]: event.target.checked,
	                            } as Partial<OrderProviderCertificationCommandOptions>)}
	                            disabled={isOrdersAccessBusy}
	                            className="mt-1 size-4 rounded border-border"
	                            data-testid={item.testId}
	                          />
	                          <span>
	                            <span className="block font-semibold text-foreground">{item.label}</span>
	                            <span className="mt-1 block break-words font-mono text-[10px] leading-4 text-muted-foreground">{item.env}</span>
	                          </span>
	                        </label>
	                      ))}
	                    </div>
	                    <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
	                      <label className="text-xs">
	                        <span className="font-semibold text-foreground">Payment/refund provider</span>
	                        <select
	                          value={providerCertificationCommandOptions.paymentProvider}
	                          onChange={(event) => updateProviderCertificationCommandOptions({
	                            paymentProvider: event.target.value as OrderProviderCertificationPaymentProvider,
	                          })}
	                          disabled={isOrdersAccessBusy || !providerCertificationCommandOptions.certifyPayment}
	                          className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground"
	                          data-testid="orders-provider-certification-payment-provider-select"
	                        >
	                          {ORDER_PROVIDER_CERTIFICATION_PAYMENT_PROVIDER_OPTIONS.map((option) => (
	                            <option key={option.value} value={option.value}>{option.label}</option>
	                          ))}
	                        </select>
	                        <span className="mt-1 block text-[11px] leading-4 text-muted-foreground">
	                          {ORDER_PROVIDER_CERTIFICATION_PAYMENT_PROVIDER_OPTIONS.find((option) => option.value === providerCertificationCommandOptions.paymentProvider)?.description}
	                        </span>
	                      </label>
	                      <label className="text-xs">
	                        <span className="font-semibold text-foreground">Tax provider</span>
	                        <select
	                          value={providerCertificationCommandOptions.taxProvider}
	                          onChange={(event) => updateProviderCertificationCommandOptions({
	                            taxProvider: event.target.value as OrderProviderCertificationTaxProvider,
	                          })}
	                          disabled={isOrdersAccessBusy || !providerCertificationCommandOptions.certifyTax}
	                          className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground"
	                          data-testid="orders-provider-certification-tax-provider-select"
	                        >
	                          {ORDER_PROVIDER_CERTIFICATION_TAX_PROVIDER_OPTIONS.map((option) => (
	                            <option key={option.value} value={option.value}>{option.label}</option>
	                          ))}
	                        </select>
	                        <span className="mt-1 block text-[11px] leading-4 text-muted-foreground">
	                          {ORDER_PROVIDER_CERTIFICATION_TAX_PROVIDER_OPTIONS.find((option) => option.value === providerCertificationCommandOptions.taxProvider)?.description}
	                        </span>
	                      </label>
	                      <label className="text-xs">
	                        <span className="font-semibold text-foreground">Shipping provider</span>
	                        <select
	                          value={providerCertificationCommandOptions.shippingProvider}
	                          onChange={(event) => updateProviderCertificationCommandOptions({
	                            shippingProvider: event.target.value as OrderProviderCertificationShippingProvider,
	                          })}
	                          disabled={isOrdersAccessBusy || !providerCertificationCommandOptions.certifyShipping}
	                          className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground"
	                          data-testid="orders-provider-certification-shipping-provider-select"
	                        >
	                          {ORDER_PROVIDER_CERTIFICATION_SHIPPING_PROVIDER_OPTIONS.map((option) => (
	                            <option key={option.value} value={option.value}>{option.label}</option>
	                          ))}
	                        </select>
	                        <span className="mt-1 block text-[11px] leading-4 text-muted-foreground">
	                          {ORDER_PROVIDER_CERTIFICATION_SHIPPING_PROVIDER_OPTIONS.find((option) => option.value === providerCertificationCommandOptions.shippingProvider)?.description}
	                        </span>
	                      </label>
	                      <label className="text-xs">
	                        <span className="font-semibold text-foreground">Discount provider</span>
	                        <select
	                          value={providerCertificationCommandOptions.discountProvider}
	                          onChange={(event) => updateProviderCertificationCommandOptions({
	                            discountProvider: event.target.value as OrderProviderCertificationDiscountProvider,
	                          })}
	                          disabled={isOrdersAccessBusy || !providerCertificationCommandOptions.certifyDiscount}
	                          className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground"
	                          data-testid="orders-provider-certification-discount-provider-select"
	                        >
	                          {ORDER_PROVIDER_CERTIFICATION_DISCOUNT_PROVIDER_OPTIONS.map((option) => (
	                            <option key={option.value} value={option.value}>{option.label}</option>
	                          ))}
	                        </select>
	                        <span className="mt-1 block text-[11px] leading-4 text-muted-foreground">
	                          {ORDER_PROVIDER_CERTIFICATION_DISCOUNT_PROVIDER_OPTIONS.find((option) => option.value === providerCertificationCommandOptions.discountProvider)?.description}
	                        </span>
	                      </label>
	                      <label className="text-xs">
	                        <span className="font-semibold text-foreground">Subscription provider</span>
	                        <select
	                          value={providerCertificationCommandOptions.subscriptionProvider}
	                          onChange={(event) => updateProviderCertificationCommandOptions({
	                            subscriptionProvider: event.target.value as OrderProviderCertificationSubscriptionProvider,
	                          })}
	                          disabled={isOrdersAccessBusy || !providerCertificationCommandOptions.certifySubscriptions}
	                          className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground"
	                          data-testid="orders-provider-certification-subscription-provider-select"
	                        >
	                          {ORDER_PROVIDER_CERTIFICATION_SUBSCRIPTION_PROVIDER_OPTIONS.map((option) => (
	                            <option key={option.value} value={option.value}>{option.label}</option>
	                          ))}
	                        </select>
	                        <span className="mt-1 block text-[11px] leading-4 text-muted-foreground">
	                          {ORDER_PROVIDER_CERTIFICATION_SUBSCRIPTION_PROVIDER_OPTIONS.find((option) => option.value === providerCertificationCommandOptions.subscriptionProvider)?.description}
	                        </span>
	                      </label>
	                      <label className="text-xs">
	                        <span className="font-semibold text-foreground">Webhook provider</span>
	                        <select
	                          value={providerCertificationCommandOptions.webhookProvider}
	                          onChange={(event) => updateProviderCertificationCommandOptions({
	                            webhookProvider: event.target.value as OrderProviderCertificationWebhookProvider,
	                          })}
	                          disabled={isOrdersAccessBusy || !providerCertificationCommandOptions.certifyWebhooks}
	                          className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground"
	                          data-testid="orders-provider-certification-webhook-provider-select"
	                        >
	                          {ORDER_PROVIDER_CERTIFICATION_WEBHOOK_PROVIDER_OPTIONS.map((option) => (
	                            <option key={option.value} value={option.value}>{option.label}</option>
	                          ))}
	                        </select>
	                        <span className="mt-1 block text-[11px] leading-4 text-muted-foreground">
	                          {ORDER_PROVIDER_CERTIFICATION_WEBHOOK_PROVIDER_OPTIONS.find((option) => option.value === providerCertificationCommandOptions.webhookProvider)?.description}
	                        </span>
	                      </label>
	                    </div>
	                    <div className="mt-3 grid gap-3 md:grid-cols-[minmax(0,1fr)_260px]">
	                      <label className="text-xs">
	                        <span className="font-semibold text-foreground">External target URL</span>
	                        <input
	                          type="url"
	                          value={providerCertificationCommandOptions.externalBaseUrl}
	                          onChange={(event) => updateProviderCertificationCommandOptions({ externalBaseUrl: event.target.value })}
	                          disabled={isOrdersAccessBusy}
	                          placeholder="https://backy.example.com"
	                          className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground"
	                          data-testid="orders-provider-certification-external-target-input"
	                        />
	                        <span className="mt-1 block text-[11px] leading-4 text-muted-foreground">
	                          Optional deployed target. External runs require BACKY_ADMIN_API_KEY or BACKY_COMMERCE_CERTIFICATION_ADMIN_KEY.
	                        </span>
	                      </label>
	                      <label className="flex min-h-[72px] items-start gap-2 rounded-md border border-border bg-background px-3 py-2">
	                        <input
	                          type="checkbox"
	                          checked={providerCertificationCommandOptions.includeReleaseDoctor}
	                          onChange={(event) => updateProviderCertificationCommandOptions({ includeReleaseDoctor: event.target.checked })}
	                          disabled={isOrdersAccessBusy}
	                          className="mt-1 size-4 rounded border-border"
	                          data-testid="orders-provider-certification-doctor-toggle"
	                        />
	                        <span>
	                          <span className="block font-semibold text-foreground">Release doctor</span>
	                          <span className="mt-1 block break-words font-mono text-[10px] leading-4 text-muted-foreground">
	                            BACKY_RELEASE_CERTIFICATION_DOCTOR_REQUIRED=1
	                          </span>
	                        </span>
	                      </label>
	                    </div>
	                    <div className="mt-3 grid gap-3 lg:grid-cols-[minmax(0,1.25fr)_minmax(0,0.75fr)]">
	                      <div>
	                        <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Generated command</div>
	                        <pre className="mt-1 max-h-72 overflow-auto rounded-md border border-border bg-background p-3 font-mono text-[11px] leading-5 text-foreground" data-testid="orders-provider-certification-command">
	                          {providerCertificationCommand}
	                        </pre>
	                      </div>
	                      <div>
	                        <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Selected required inputs</div>
	                        <div className="mt-1 flex max-h-72 flex-wrap gap-1 overflow-auto rounded-md border border-border bg-background p-3" data-testid="orders-provider-certification-required-inputs">
	                          {providerCertificationRequiredInputs.map((input) => (
	                            <span key={input} className="rounded bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
	                              {input}
	                            </span>
	                          ))}
	                        </div>
	                      </div>
	                    </div>
	                  </div>
	                  <div className="mt-3 rounded-md border border-border bg-background px-3 py-2 text-xs" data-testid="orders-provider-runtime-evidence">
	                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="font-medium text-foreground">Runtime evidence</div>
                      <span className={cn(
                        'rounded-full px-2 py-0.5 text-[11px] font-semibold',
                        providerRuntimeEvidence.missingFamilies.length === 0
                          ? 'bg-emerald-50 text-emerald-700'
                          : 'bg-amber-50 text-amber-700',
                      )}>
                        {providerRuntimeEvidence.readyCount}/{providerRuntimeEvidence.total} ready
                      </span>
                    </div>
                    <div className="mt-2 grid gap-2 md:grid-cols-2">
                      <div>
                        <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Configured families</div>
                        <div className="mt-1 flex flex-wrap gap-1">
                          {providerRuntimeEvidence.configuredFamilies.length ? providerRuntimeEvidence.configuredFamilies.map((family) => (
                            <span key={`orders-configured-${family}`} className="rounded bg-emerald-50 px-1.5 py-0.5 text-[10px] text-emerald-700">
                              {family}
                            </span>
                          )) : (
                            <span className="text-[11px] text-muted-foreground">No provider family is fully ready yet.</span>
                          )}
                        </div>
                      </div>
                      <div>
                        <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Missing families</div>
                        <div className="mt-1 flex flex-wrap gap-1">
                          {providerRuntimeEvidence.missingFamilies.length ? providerRuntimeEvidence.missingFamilies.map((family) => (
                            <span key={`orders-missing-${family}`} className="rounded bg-amber-50 px-1.5 py-0.5 text-[10px] text-amber-700">
                              {family}
                            </span>
                          )) : (
                            <span className="text-[11px] text-muted-foreground">All provider families report ready.</span>
                          )}
                        </div>
                      </div>
                    </div>
                    {providerRuntimeEvidence.missingRuntimeAliases.length ? (
                      <div className="mt-2 rounded border border-amber-200 bg-amber-50 px-2 py-1.5 text-[11px] text-amber-900">
                        Missing runtime aliases: {providerRuntimeEvidence.missingRuntimeAliases.join(', ')}
                      </div>
                    ) : null}
                    <div className="mt-2 text-[11px] leading-4 text-muted-foreground">
                      Provider secret values are never returned; runtime evidence reports booleans, aliases, provider families, and non-secret URLs only.
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
              <div className="rounded-lg border border-border bg-background p-3 text-sm" data-testid="orders-cron-readiness">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="flex flex-wrap items-center gap-2 font-medium">
                      {cronReadiness?.ready ? (
                        <CheckCircle2 className="size-4 text-success" />
                      ) : (
                        <AlertTriangle className="size-4 text-warning" />
                      )}
                      Scheduled reconciliation
                    </div>
                    <p className="mt-1 text-xs leading-5 text-muted-foreground">
                      Vercel calls the platform reconcile endpoint with a bearer cron secret; the secret must match a server admin key.
                    </p>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => void loadCronReadiness()}
                    disabled={isOrdersAccessBusy || !canConfigureOrders}
                    title={!canConfigureOrders ? configurePermissionTitle : undefined}
                    iconStart={<RefreshCw className="size-4" />}
                  >
                    Check cron
                  </Button>
                </div>
                <div className="mt-3 grid gap-2 md:grid-cols-2 xl:grid-cols-4">
                  <CronReadinessPill label="Vercel cron" ready={Boolean(cronReadiness?.vercelCronConfigured)} />
                  <CronReadinessPill label="CRON_SECRET" ready={Boolean(cronReadiness?.cronSecretConfigured)} />
                  <CronReadinessPill label="Admin env key" ready={Boolean(cronReadiness?.environmentAdminKeyConfigured)} />
                  <CronReadinessPill label="Secret matches key" ready={Boolean(cronReadiness?.cronSecretMatchesAdminKey)} />
                </div>
                {cronReadiness ? (
                  <div className="mt-3 grid gap-2 text-xs text-muted-foreground lg:grid-cols-2">
                    <code className="overflow-x-auto rounded-md bg-muted px-2 py-1.5 font-mono">{cronReadiness.entrypoint}</code>
                    <span className="rounded-md border border-border bg-muted px-2 py-1.5">Schedule {cronReadiness.schedule}</span>
                  </div>
                ) : null}
                {cronReadiness?.missing.length ? (
                  <div className="mt-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                    Missing: {cronReadiness.missing.join(', ')}.
                  </div>
                ) : null}
                {cronReadinessError ? (
                  <div className="mt-3 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
                    {cronReadinessError}
                  </div>
                ) : null}
              </div>
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
              <div className="rounded-lg border border-border bg-background p-4" data-testid="orders-api-contracts">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h3 className="text-sm font-semibold">Order API response contracts</h3>
                    <p className="mt-1 text-sm text-muted-foreground">
                      Every order operations endpoint returns Backy contract headers with private cache scope and a stable schema id for external admin clients.
                    </p>
                  </div>
                  <span className="rounded-full bg-muted px-2.5 py-1 text-xs font-medium text-muted-foreground">
                    {ORDER_API_CONTRACTS.length} contracts
                  </span>
                </div>
                <div className="mt-4 grid gap-2 md:grid-cols-2 xl:grid-cols-3">
                  {ORDER_API_CONTRACTS.map((contract) => (
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

      {ordersCollection && (
        <Panel id="orders-analytics" className="mb-6 scroll-mt-24" data-testid="orders-analytics-panel">
          <PanelHeader
            title="Order Analytics"
            description="Backend totals across the private order queue, independent of the currently loaded page."
            icon={<BarChart3 className="size-4" />}
            action={
              <Button
                variant="outline"
                onClick={() => void loadOrderAnalytics()}
                disabled={isOrderAnalyticsLoading || isPermissionMatrixPending || !canViewCommerce}
                title={!canViewCommerce ? viewPermissionTitle : undefined}
                iconStart={<RefreshCw className={cn('size-4', isOrderAnalyticsLoading && 'animate-spin')} />}
              >
                Refresh analytics
              </Button>
            }
          />
          <PanelContent>
            {orderAnalyticsError ? (
              <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
                {orderAnalyticsError}
              </div>
            ) : (
              <div className="space-y-4">
                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                  <Metric label="Backend Orders" value={orderAnalytics?.orderCount ?? totalOrderCount} icon={<Receipt className="size-4" />} />
                  <Metric label="Gross Total" value={formatMoney(orderAnalytics?.revenue.grossTotal ?? 0, orderAnalytics?.currencies[0]?.currency || 'USD')} icon={<CreditCard className="size-4" />} />
                  <Metric label="Avg Order" value={formatMoney(orderAnalytics?.revenue.averageOrderValue ?? 0, orderAnalytics?.currencies[0]?.currency || 'USD')} icon={<BarChart3 className="size-4" />} />
                  <Metric label="Needs Attention" value={orderAnalytics?.operations.paymentAttentionCount ?? 0} icon={<AlertTriangle className="size-4" />} />
                </div>
                <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(300px,0.72fr)]">
                  <div className="rounded-lg border border-border bg-background p-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <h3 className="text-sm font-semibold">Payment and fulfillment mix</h3>
                      <span className="text-xs text-muted-foreground">
                        {orderAnalytics?.generatedAt ? `Updated ${formatDate(orderAnalytics.generatedAt)}` : 'Loading analytics...'}
                      </span>
                    </div>
                    <div className="mt-3 grid gap-2 md:grid-cols-2 xl:grid-cols-4">
                      {(['pending', 'paid', 'failed', 'refunded'] as const).map((status) => (
                        <div key={status} className="rounded-lg border border-border bg-card p-3">
                          <div className="text-xs font-medium uppercase text-muted-foreground">{status}</div>
                          <div className="mt-1 font-mono text-xl font-semibold">{orderAnalytics?.payment[status]?.count ?? 0}</div>
                          <div className="mt-1 text-xs text-muted-foreground">
                            {formatMoney(orderAnalytics?.payment[status]?.total ?? 0, orderAnalytics?.currencies[0]?.currency || 'USD')}
                          </div>
                        </div>
                      ))}
                    </div>
                    <div className="mt-3 grid gap-2 md:grid-cols-2 xl:grid-cols-4">
                      {(['unfulfilled', 'processing', 'fulfilled', 'cancelled'] as const).map((status) => (
                        <div key={status} className="rounded-lg border border-border bg-muted/30 p-3">
                          <div className="text-xs font-medium uppercase text-muted-foreground">{status}</div>
                          <div className="mt-1 font-mono text-xl font-semibold">{orderAnalytics?.fulfillment[status]?.count ?? 0}</div>
                          <div className="mt-1 text-xs text-muted-foreground">
                            {formatMoney(orderAnalytics?.fulfillment[status]?.total ?? 0, orderAnalytics?.currencies[0]?.currency || 'USD')}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div className="rounded-lg border border-border bg-background p-4">
                    <h3 className="text-sm font-semibold">Operations signal</h3>
                    <div className="mt-3 grid gap-2 text-sm">
                      <div className="flex items-center justify-between rounded-lg border border-border bg-card px-3 py-2">
                        <span className="text-muted-foreground">Fulfillment backlog</span>
                        <span className="font-mono font-semibold">{orderAnalytics?.operations.fulfillmentBacklogCount ?? 0}</span>
                      </div>
                      <div className="flex items-center justify-between rounded-lg border border-border bg-card px-3 py-2">
                        <span className="text-muted-foreground">Manual orders</span>
                        <span className="font-mono font-semibold">{orderAnalytics?.operations.manualOrderCount ?? 0}</span>
                      </div>
                      <div className="flex items-center justify-between rounded-lg border border-border bg-card px-3 py-2">
                        <span className="text-muted-foreground">Checkout orders</span>
                        <span className="font-mono font-semibold">{orderAnalytics?.operations.checkoutOrderCount ?? 0}</span>
                      </div>
                      <div className="flex items-center justify-between rounded-lg border border-border bg-card px-3 py-2">
                        <span className="text-muted-foreground">Subscription orders</span>
                        <span className="font-mono font-semibold">{orderAnalytics?.operations.subscriptionOrderCount ?? 0}</span>
                      </div>
                      <div className="flex items-center justify-between rounded-lg border border-border bg-card px-3 py-2">
                        <span className="text-muted-foreground">Renewal payments</span>
                        <span className="font-mono font-semibold">{orderAnalytics?.operations.subscriptionRenewalCount ?? 0}</span>
                      </div>
                      <div className="flex items-center justify-between rounded-lg border border-border bg-card px-3 py-2">
                        <span className="text-muted-foreground">Dunning attention</span>
                        <span className="font-mono font-semibold">{orderAnalytics?.operations.subscriptionDunningCount ?? 0}</span>
                      </div>
                      <div className="flex items-center justify-between rounded-lg border border-border bg-card px-3 py-2">
                        <span className="text-muted-foreground">Subscription paused</span>
                        <span className="font-mono font-semibold">{orderAnalytics?.operations.subscriptionPausedCount ?? 0}</span>
                      </div>
                      <div className="flex items-center justify-between rounded-lg border border-border bg-card px-3 py-2">
                        <span className="text-muted-foreground">Subscription resumed</span>
                        <span className="font-mono font-semibold">{orderAnalytics?.operations.subscriptionResumedCount ?? 0}</span>
                      </div>
                      <div className="flex items-center justify-between rounded-lg border border-border bg-card px-3 py-2">
                        <span className="text-muted-foreground">Trial ending soon</span>
                        <span className="font-mono font-semibold">{orderAnalytics?.operations.subscriptionTrialEndingCount ?? 0}</span>
                      </div>
                      <div className="flex items-center justify-between rounded-lg border border-border bg-card px-3 py-2">
                        <span className="text-muted-foreground">Subscription cancelled</span>
                        <span className="font-mono font-semibold">{orderAnalytics?.operations.subscriptionCancelledCount ?? 0}</span>
                      </div>
                      <div className="flex items-center justify-between rounded-lg border border-border bg-card px-3 py-2">
                        <span className="text-muted-foreground">Refund amount</span>
                        <span className="font-mono font-semibold">{formatMoney(orderAnalytics?.revenue.refundAmountTotal ?? 0, orderAnalytics?.currencies[0]?.currency || 'USD')}</span>
                      </div>
                    </div>
                    <div className="mt-4">
                      <h4 className="text-xs font-semibold uppercase text-muted-foreground">Top sources</h4>
                      <div className="mt-2 space-y-2">
                        {(orderAnalytics?.sources || []).slice(0, 4).map((source) => (
                          <div key={source.source} className="flex items-center justify-between gap-3 text-sm">
                            <span className="truncate text-muted-foreground">{source.source}</span>
                            <span className="font-mono">{source.count} / {formatMoney(source.total, orderAnalytics?.currencies[0]?.currency || 'USD')}</span>
                          </div>
                        ))}
                        {(!orderAnalytics || orderAnalytics.sources.length === 0) && (
                          <EmptyState
                            icon={BarChart3}
                            title="No order source data yet"
                            description="Checkout, admin-created, and provider-imported order sources will appear here after analytics records revenue by source."
                          />
                        )}
                      </div>
                    </div>
                  </div>
                </div>
                <div className="rounded-lg border border-border bg-background p-4" data-testid="orders-provider-analytics">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <h3 className="text-sm font-semibold">Provider execution analytics</h3>
                      <p className="mt-1 text-sm text-muted-foreground">
                        Backend provider mix and pending execution states across payment, refunds, fulfillment, and shipping labels.
                      </p>
                    </div>
                    <div className="grid gap-2 text-xs sm:grid-cols-3">
                      <span className="rounded-lg border border-border bg-card px-3 py-2">
                        Refund pending <strong className="ml-1 font-mono">{orderAnalytics?.providerOperations?.attention.providerRefundPendingCount ?? 0}</strong>
                      </span>
                      <span className="rounded-lg border border-border bg-card px-3 py-2">
                        Fulfillment pending <strong className="ml-1 font-mono">{orderAnalytics?.providerOperations?.attention.fulfillmentDispatchPendingCount ?? 0}</strong>
                      </span>
                      <span className="rounded-lg border border-border bg-card px-3 py-2">
                        Label issues <strong className="ml-1 font-mono">{orderAnalytics?.providerOperations?.attention.shippingLabelIssueCount ?? 0}</strong>
                      </span>
                    </div>
                  </div>
                  <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                    {[
                      {
                        title: 'Payment providers',
                        icon: CreditCard,
                        items: orderAnalytics?.providerOperations?.paymentProviders || [],
                        emptyTitle: 'No payment provider data yet',
                        emptyDescription: 'Orders with payment provider metadata will show status and revenue mix here.',
                      },
                      {
                        title: 'Refund providers',
                        icon: RotateCcw,
                        items: orderAnalytics?.providerOperations?.refundProviders || [],
                        emptyTitle: 'No provider refund data yet',
                        emptyDescription: 'Provider refund requests and reconciliation status will appear after refund operations run.',
                      },
                      {
                        title: 'Fulfillment providers',
                        icon: PackageCheck,
                        items: orderAnalytics?.providerOperations?.fulfillmentProviders || [],
                        emptyTitle: 'No fulfillment dispatch data yet',
                        emptyDescription: 'Fulfillment provider dispatch status will appear after orders move into warehouse or partner queues.',
                      },
                      {
                        title: 'Shipping labels',
                        icon: Truck,
                        items: orderAnalytics?.providerOperations?.shippingLabelProviders || [],
                        emptyTitle: 'No shipping-label data yet',
                        emptyDescription: 'Shipping label providers and issue counts will appear after labels are quoted or purchased.',
                      },
                    ].map((group) => (
                      <div key={group.title} className="rounded-lg border border-border bg-card p-3">
                        <h4 className="text-xs font-semibold uppercase text-muted-foreground">{group.title}</h4>
                        <div className="mt-3 space-y-3">
                          {group.items.slice(0, 4).map((provider) => (
                            <div key={provider.provider} className="space-y-1">
                              <div className="flex items-center justify-between gap-3 text-sm">
                                <span className="truncate font-medium">{provider.provider}</span>
                                <span className="font-mono text-xs text-muted-foreground">
                                  {provider.count} / {formatMoney(provider.total, orderAnalytics?.currencies[0]?.currency || 'USD')}
                                </span>
                              </div>
                              <div className="flex flex-wrap gap-1">
                                {Object.entries(provider.statuses).slice(0, 4).map(([status, count]) => (
                                  <span key={status} className="rounded border border-border bg-background px-1.5 py-0.5 text-[11px] text-muted-foreground">
                                    {status}: {count}
                                  </span>
                                ))}
                              </div>
                            </div>
                          ))}
                          {group.items.length === 0 && (
                            <EmptyState
                              icon={group.icon}
                              title={group.emptyTitle}
                              description={group.emptyDescription}
                            />
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="rounded-lg border border-border bg-background p-4" data-testid="orders-notification-delivery">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <h3 className="text-sm font-semibold">Order notification delivery</h3>
                      <p className="mt-1 text-sm text-muted-foreground">
                        Checkout-created order email and workflow webhook handoffs recorded by the backend.
                      </p>
                      <code className="mt-2 block text-xs text-muted-foreground">
                        /events?kind=commerce-order
                      </code>
                    </div>
                    <Button
                      variant="outline"
                      onClick={() => void loadOrderDeliveryEvents()}
                      disabled={isPermissionMatrixPending || !canViewCommerce}
                      title={!canViewCommerce ? viewPermissionTitle : undefined}
                      iconStart={<RefreshCw className="size-4" />}
                    >
                      Refresh delivery
                    </Button>
                  </div>
                  {orderDeliveryError ? (
                    <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
                      {orderDeliveryError}
                    </div>
                  ) : orderDeliveryEvents.length === 0 ? (
                    <div className="mt-3">
                      <EmptyState
                        icon={FileText}
                        title="No order notification events"
                        description="Checkout emails and workflow webhook handoffs will appear after orders trigger delivery events."
                      />
                    </div>
                  ) : (
                    <div className="mt-3 grid gap-2 md:grid-cols-2 xl:grid-cols-3">
                      {orderDeliveryEvents.slice(0, 6).map((event) => (
                        <div key={event.id} className="rounded-lg border border-border bg-card p-3 text-sm">
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <div className="truncate font-semibold text-foreground">
                                {String(event.metadata?.orderNumber || 'Commerce order')}
                              </div>
                              <div className="mt-1 truncate text-xs text-muted-foreground">
                                {String(event.metadata?.channel || 'event')} {'->'} {event.target}
                              </div>
                            </div>
                            <span className={cn(
                              'rounded-md px-2 py-1 text-[11px] font-semibold',
                              event.status === 'succeeded' ? 'bg-success/10 text-success' : event.status === 'failed' ? 'bg-destructive/10 text-destructive' : 'bg-muted text-muted-foreground',
                            )}
                            >
                              {event.status}
                            </span>
                          </div>
                          <div className="mt-2 flex flex-wrap gap-2 text-xs text-muted-foreground">
                            <span>{formatDate(event.createdAt)}</span>
                            {event.statusCode ? <span>{event.statusCode}</span> : null}
                            {event.error ? <span className="text-destructive">{event.error}</span> : null}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
          </PanelContent>
        </Panel>
      )}

      {!ordersCollection ? (
        <EmptyState
          icon={Receipt}
          title="Orders are not set up"
          description="Create an internal orders collection for payment state, fulfillment, customer, and line item data."
          action={
            <div className="mt-2 flex flex-wrap justify-center gap-2">
              <Button onClick={() => void createOrdersCollection()} disabled={isOrdersAccessBusy || !canConfigureOrders} title={!canConfigureOrders ? configurePermissionTitle : undefined} iconStart={<Sparkles className="size-4" />}>
                {isSaving ? 'Setting up...' : 'Set Up Orders'}
              </Button>
              <Button variant="outline" onClick={openProductsWorkspace} disabled={isOrdersBusy} iconStart={<ShoppingCart className="size-4" />}>
                Set up products
              </Button>
              <Button variant="outline" onClick={openStorefrontPage} disabled={isOrdersAccessBusy || !canEditPages} title={!canEditPages ? pagesEditPermissionTitle : undefined} iconStart={<Sparkles className="size-4" />}>
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
              description={`${filteredOrders.length}/${loadedOrderCount} visible loaded orders${totalOrderCount > loadedOrderCount ? `, ${totalOrderCount} total` : ''}`}
              icon={<ClipboardCheck className="size-4" />}
              action={<Button onClick={resetForm} disabled={isOrdersAccessBusy || !canEditOrders} title={!canEditOrders ? editPermissionTitle : undefined} iconStart={<Plus className="size-4" />}>New Order</Button>}
            />
            <PanelContent>
              <div className="mb-4 flex flex-wrap items-center gap-3">
                <div className="relative min-w-64 flex-1">
                  <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                  <input
                    aria-label="Search orders"
                    value={searchQuery}
                    disabled={isOrdersAccessBusy || !canViewOrders}
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
                  {ORDER_FILTERS.map((status) => (
                    <button
                      key={status}
                      type="button"
                      disabled={isOrdersAccessBusy || !canViewOrders}
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
                  disabled={isOrdersAccessBusy || !canViewOrders}
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
                  disabled={isOrdersAccessBusy || !canViewOrders}
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
                  disabled={isOrdersAccessBusy || !canViewOrders}
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
                  <Button variant="outline" onClick={clearOrderFilters} disabled={isOrdersAccessBusy || !canViewOrders}>
                    Clear filters
                  </Button>
                )}
              </div>

              <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
                <span>
                  Loaded {loadedOrderCount} of {totalOrderCount} order records. Filters, bulk actions, and CSV export apply to loaded rows.
                </span>
                {hasMoreOrders && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => void loadMoreOrders()}
                    disabled={isOrdersAccessBusy || !canViewOrders}
                    title={!canViewOrders ? viewPermissionTitle : undefined}
                  >
                    {isLoading ? 'Loading...' : 'Load more'}
                  </Button>
                )}
              </div>

              {filteredOrders.length === 0 ? (
                <div>
                  <EmptyState
                    icon={Receipt}
                    title={orders.length === 0 ? 'No orders yet' : 'No orders match this view'}
                    description={orders.length === 0
                      ? 'Create or import the first order to begin payment and fulfillment tracking.'
                      : 'Change the search, workflow, payment, fulfillment, or source filters to broaden the queue.'}
                    action={orders.length > 0 && hasActiveOrderFilters ? (
                      <Button variant="outline" onClick={clearOrderFilters} disabled={isOrdersAccessBusy || !canViewOrders}>
                        Clear filters
                      </Button>
                    ) : undefined}
                  />
                </div>
              ) : (
                <div className="grid gap-3">
                  <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-muted/40 px-3 py-2">
                    <label className="flex items-center gap-2 text-sm font-medium text-foreground">
                      <input
                        type="checkbox"
                        aria-label="Select all visible orders"
                        checked={allVisibleOrdersSelected}
                        onChange={(event) => toggleVisibleOrderSelection(event.target.checked)}
                        disabled={isOrdersAccessBusy || !canEditOrders || filteredOrders.length === 0}
                        className="size-4 rounded border-border"
                      />
                      <span data-testid="orders-bulk-selection-summary">
                        {selectedLoadedOrders.length} selected
                        {selectedVisibleOrders.length !== selectedLoadedOrders.length ? ` · ${selectedVisibleOrders.length} visible` : ''}
                        {hiddenSelectedOrderCount > 0 ? ` · ${hiddenSelectedOrderCount} outside this view` : ''}
                      </span>
                    </label>
                    <div className="flex flex-wrap items-center gap-2">
                      {selectedLoadedOrders.length > 0 && (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={clearOrderSelection}
                          disabled={isOrdersAccessBusy || !canEditOrders}
                          title={!canEditOrders ? editPermissionTitle : undefined}
                          data-testid="orders-bulk-clear-selection"
                        >
                          Clear selection
                        </Button>
                      )}
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => void bulkUpdateOrderWorkflow('paid')}
                        disabled={isOrdersAccessBusy || !canEditOrders || selectedLoadedOrders.length === 0}
                        title={!canEditOrders ? editPermissionTitle : undefined}
                        iconStart={<CreditCard className="size-4" />}
                      >
                        Mark Paid
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => void bulkUpdateOrderWorkflow('processing')}
                        disabled={isOrdersAccessBusy || !canEditOrders || selectedLoadedOrders.length === 0}
                        title={!canEditOrders ? editPermissionTitle : undefined}
                        iconStart={<Truck className="size-4" />}
                      >
                        Processing
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => void bulkUpdateOrderWorkflow('fulfilled')}
                        disabled={isOrdersAccessBusy || !canEditOrders || selectedLoadedOrders.length === 0}
                        title={!canEditOrders ? editPermissionTitle : undefined}
                        iconStart={<PackageCheck className="size-4" />}
                      >
                        Fulfill
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => void bulkUpdateOrderWorkflow('cancelled')}
                        disabled={isOrdersAccessBusy || !canEditOrders || selectedLoadedOrders.length === 0}
                        title={!canEditOrders ? editPermissionTitle : undefined}
                        iconStart={<Archive className="size-4" />}
                      >
                        Record cancel
                      </Button>
                    </div>
                  </div>
                  {filteredOrders.map((order) => (
                    <OrderCard
                      key={order.id}
                      order={order}
                      selected={order.id === selectedOrderId}
                      selectedForBulk={selectedOrderIds.includes(order.id)}
                      disabled={isOrdersAccessBusy || !canEditOrders}
                      onSelectionChange={(checked) => toggleOrderSelection(order.id, checked)}
                      onEdit={() => selectOrderForEditing(order.id)}
                      onRefreshQuote={() => void refreshOrderQuoteAction(order)}
                      onDispatchFulfillment={() => void dispatchOrderFulfillmentAction(order)}
                      onPaid={() => void updateOrderWorkflow(order, buildPaidWorkflowUpdates(order))}
                      onShippingLabel={() => void prepareOrderShippingLabel(order)}
                      onVoidShippingLabel={() => void voidOrderShippingLabelAction(order)}
                      onRefreshTracking={() => void refreshOrderTrackingAction(order)}
                      onFulfilled={() => void updateOrderWorkflow(order, buildFulfilledWorkflowUpdates(order))}
                      onRefunded={() => void updateOrderWorkflow(order, buildRefundWorkflowUpdates(order))}
                      onProviderRefund={() => void requestOrderProviderRefund(order)}
                      onRefreshProviderRefund={() => void refreshOrderProviderRefundAction(order)}
                      onCancelled={() => void updateOrderWorkflow(order, buildCancelWorkflowUpdates(order))}
                      onDelete={() => {
                        if (isOrdersBusy) return;
                        if (!canDeleteOrders) {
                          setError(deletePermissionTitle || 'Your account cannot delete orders.');
                          return;
                        }
                        setPendingDeleteOrder(order);
                      }}
                      canDelete={canDeleteOrders}
                      deleteDisabledReason={deletePermissionTitle}
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
                <fieldset disabled={isOrdersAccessBusy || !canEditOrders} title={!canEditOrders ? editPermissionTitle : undefined} className={cn('space-y-4', (isOrdersAccessBusy || !canEditOrders) && 'opacity-70')}>
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
                <div className="rounded-lg border border-border bg-muted/20 p-3" data-testid="orders-customer-profile-manager">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <div className="text-sm font-semibold text-foreground">Order customer profile</div>
                      <div className="mt-1 text-xs text-muted-foreground">
                        Manage private customer contact status and support notes linked to this order.
                      </div>
                    </div>
                    {selectedCustomerProfile ? (
                      <span className="rounded-full bg-background px-2 py-1 font-mono text-[11px] text-muted-foreground">
                        {selectedCustomerProfile.slug}
                      </span>
                    ) : (
                      <span className="rounded-full bg-background px-2 py-1 text-[11px] text-muted-foreground">
                        {customersCollection ? 'No linked profile' : 'Customers collection unavailable'}
                      </span>
                    )}
                  </div>

                  {customerProfiles.length > 0 ? (
                    <div className="mt-3 grid gap-3 md:grid-cols-[minmax(0,1fr)_auto_auto] md:items-end">
                      <Field label="Linked profile">
                        <select
                          aria-label="Order customer profile"
                          value={selectedCustomerProfile?.id || ''}
                          onChange={(event) => {
                            const profile = customerProfiles.find((item) => item.id === event.target.value);
                            if (profile) selectCustomerProfile(profile);
                          }}
                          disabled={isOrdersAccessBusy || !canViewOrders}
                          className="w-full rounded-lg border bg-background px-3 py-2.5 text-sm disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          {customerProfiles.map((customer) => (
                            <option key={customer.id} value={customer.id}>
                              {String(customer.values?.email || customer.values?.name || customer.slug)}
                            </option>
                          ))}
                        </select>
                      </Field>
                      <div className="rounded-md border border-border bg-background px-3 py-2 text-xs text-muted-foreground">
                        <div className="font-semibold text-foreground">{selectedCustomerOrders.length}</div>
                        <div>orders</div>
                      </div>
                      <div className="rounded-md border border-border bg-background px-3 py-2 text-xs text-muted-foreground">
                        <div className="font-semibold text-foreground">{formatMoney(selectedCustomerTotalSpent, formState.currency)}</div>
                        <div>spent</div>
                      </div>
                    </div>
                  ) : (
                    <div className="mt-3">
                      <EmptyState
                        icon={Users}
                        title="No customer profiles linked yet"
                        description="Customer profiles are created by checkout intake or contact promotion, then linked by customer ID or email."
                      />
                    </div>
                  )}

                  {selectedCustomerProfile ? (
                    <>
                      <div className="mt-3 grid gap-3 md:grid-cols-2">
                        <Field label="Profile name">
                          <input
                            value={customerProfileDraft.name}
                            onChange={(event) => setCustomerProfileDraft((current) => ({ ...current, name: event.target.value }))}
                            disabled={isOrdersAccessBusy || !canEditOrders}
                            className="w-full rounded-lg border bg-background px-3 py-2.5 text-sm disabled:cursor-not-allowed disabled:opacity-60"
                          />
                        </Field>
                        <Field label="Profile email">
                          <input
                            type="email"
                            value={customerProfileDraft.email}
                            onChange={(event) => setCustomerProfileDraft((current) => ({ ...current, email: event.target.value }))}
                            disabled={isOrdersAccessBusy || !canEditOrders}
                            className="w-full rounded-lg border bg-background px-3 py-2.5 text-sm disabled:cursor-not-allowed disabled:opacity-60"
                          />
                        </Field>
                        <Field label="Profile phone">
                          <input
                            value={customerProfileDraft.phone}
                            onChange={(event) => setCustomerProfileDraft((current) => ({ ...current, phone: event.target.value }))}
                            disabled={isOrdersAccessBusy || !canEditOrders}
                            className="w-full rounded-lg border bg-background px-3 py-2.5 text-sm disabled:cursor-not-allowed disabled:opacity-60"
                          />
                        </Field>
                        <Field label="Profile status">
                          <select
                            value={customerProfileDraft.status}
                            onChange={(event) => setCustomerProfileDraft((current) => ({ ...current, status: event.target.value as CustomerStatusOption }))}
                            disabled={isOrdersAccessBusy || !canEditOrders}
                            className="w-full rounded-lg border bg-background px-3 py-2.5 text-sm capitalize disabled:cursor-not-allowed disabled:opacity-60"
                          >
                            {CUSTOMER_STATUS_OPTIONS.map((status) => (
                              <option key={status} value={status}>{status}</option>
                            ))}
                          </select>
                        </Field>
                      </div>
                      <Field label="Profile notes" className="mt-3">
                        <textarea
                          value={customerProfileDraft.notes}
                          onChange={(event) => setCustomerProfileDraft((current) => ({ ...current, notes: event.target.value }))}
                          rows={3}
                          disabled={isOrdersAccessBusy || !canEditOrders}
                          className="w-full resize-none rounded-lg border bg-background px-3 py-2.5 text-sm disabled:cursor-not-allowed disabled:opacity-60"
                          placeholder="Private support notes"
                        />
                      </Field>
                      <div className="mt-3 flex justify-end">
                        <Button
                          size="sm"
                          onClick={() => void saveCustomerProfile()}
                          disabled={isOrdersAccessBusy || !canEditOrders}
                          title={!canEditOrders ? editPermissionTitle : undefined}
                          iconStart={<ClipboardCheck className="size-4" />}
                          data-testid="orders-customer-profile-save"
                        >
                          {isSavingCustomerProfile ? 'Saving...' : 'Save profile'}
                        </Button>
                      </div>
                    </>
                  ) : null}
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
                  <Field label="Tracking status">
                    <input
                      value={formState.trackingStatus}
                      onChange={(event) => setFormState((current) => ({ ...current, trackingStatus: event.target.value }))}
                      className="w-full rounded-lg border bg-background px-3 py-2.5 text-sm"
                      placeholder="in_transit"
                    />
                  </Field>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Tracking checked">
                    <input
                      type="datetime-local"
                      value={toDateTimeLocalValue(formState.trackingLastCheckedAt)}
                      onChange={(event) => setFormState((current) => ({ ...current, trackingLastCheckedAt: fromDateTimeLocalValue(event.target.value) || '' }))}
                      className="w-full rounded-lg border bg-background px-3 py-2.5 text-sm"
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
                <div className="space-y-3 rounded-lg border border-border bg-muted/20 p-3" data-testid="orders-shipping-label-controls">
                  <div>
                    <div className="text-sm font-semibold text-foreground">Shipment label handoff</div>
                    <div className="mt-1 text-xs text-muted-foreground">
                      Prepare label metadata for external carrier purchase, print, or fulfillment automation.
                    </div>
                  </div>
                  <div className="grid gap-3 md:grid-cols-4">
                    <Field label="Label status">
                      <select
                        aria-label="Shipping label status"
                        value={formState.shippingLabelStatus}
                        onChange={(event) => setFormState((current) => ({ ...current, shippingLabelStatus: event.target.value as ShippingLabelStatus }))}
                        className="w-full rounded-lg border bg-background px-3 py-2.5 text-sm"
                      >
                        <option value="none">None</option>
                        <option value="draft">Draft</option>
                        <option value="purchased">Purchased</option>
                        <option value="voided">Voided</option>
                      </select>
                    </Field>
                    <Field label="Provider">
                      <input
                        value={formState.shippingLabelProvider}
                        onChange={(event) => setFormState((current) => ({ ...current, shippingLabelProvider: event.target.value }))}
                        className="w-full rounded-lg border bg-background px-3 py-2.5 text-sm"
                        placeholder="manual, UPS, FedEx"
                      />
                    </Field>
                    <Field label="Service">
                      <input
                        value={formState.shippingServiceLevel}
                        onChange={(event) => setFormState((current) => ({ ...current, shippingServiceLevel: event.target.value }))}
                        className="w-full rounded-lg border bg-background px-3 py-2.5 text-sm"
                        placeholder="standard"
                      />
                    </Field>
                    <Field label="Label cost">
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={formState.shippingLabelCost}
                        onChange={(event) => setFormState((current) => ({ ...current, shippingLabelCost: event.target.value }))}
                        className="w-full rounded-lg border bg-background px-3 py-2.5 text-sm"
                      />
                    </Field>
                  </div>
                  <div className="grid gap-3 md:grid-cols-[1fr_1fr_180px]">
                    <Field label="Label ID">
                      <input
                        value={formState.shippingLabelId}
                        onChange={(event) => setFormState((current) => ({ ...current, shippingLabelId: event.target.value }))}
                        className="w-full rounded-lg border bg-background px-3 py-2.5 text-sm"
                        placeholder="Generated by Backy"
                      />
                    </Field>
                    <Field label="Label URL">
                      <input
                        value={formState.shippingLabelUrl}
                        onChange={(event) => setFormState((current) => ({ ...current, shippingLabelUrl: event.target.value }))}
                        className="w-full rounded-lg border bg-background px-3 py-2.5 text-sm"
                        placeholder="/api/admin/sites/.../shipping-label"
                      />
                    </Field>
                    <Field label="Created at">
                      <input
                        type="datetime-local"
                        value={toDateTimeLocalValue(formState.shippingLabelCreatedAt)}
                        onChange={(event) => setFormState((current) => ({ ...current, shippingLabelCreatedAt: fromDateTimeLocalValue(event.target.value) || '' }))}
                        className="w-full rounded-lg border bg-background px-3 py-2.5 text-sm"
                      />
                    </Field>
                  </div>
                </div>
                <div className="space-y-3 rounded-lg border border-border bg-muted/20 p-3" data-testid="orders-fulfillment-dispatch-controls">
                  <div>
                    <div className="text-sm font-semibold text-foreground">Fulfillment dispatch</div>
                    <div className="mt-1 text-xs text-muted-foreground">
                      Persist the provider handoff payload used by warehouse, 3PL, or fulfillment automation.
                    </div>
                  </div>
                  <div className="grid gap-3 md:grid-cols-3">
                    <Field label="Dispatch status">
                      <select
                        aria-label="Fulfillment dispatch status"
                        value={formState.fulfillmentDispatchStatus}
                        onChange={(event) => setFormState((current) => ({ ...current, fulfillmentDispatchStatus: event.target.value as FulfillmentDispatchStatus }))}
                        className="w-full rounded-lg border bg-background px-3 py-2.5 text-sm"
                      >
                        <option value="none">None</option>
                        <option value="requested">Requested</option>
                        <option value="succeeded">Succeeded</option>
                        <option value="failed">Failed</option>
                        <option value="requires_action">Requires action</option>
                      </select>
                    </Field>
                    <Field label="Provider">
                      <input
                        value={formState.fulfillmentProvider}
                        onChange={(event) => setFormState((current) => ({ ...current, fulfillmentProvider: event.target.value }))}
                        className="w-full rounded-lg border bg-background px-3 py-2.5 text-sm"
                        placeholder="manual, ShipBob, warehouse"
                      />
                    </Field>
                    <Field label="Fulfillment ID">
                      <input
                        value={formState.fulfillmentId}
                        onChange={(event) => setFormState((current) => ({ ...current, fulfillmentId: event.target.value }))}
                        className="w-full rounded-lg border bg-background px-3 py-2.5 text-sm"
                        placeholder="Generated by Backy"
                      />
                    </Field>
                  </div>
                  <div className="grid gap-3 md:grid-cols-2">
                    <Field label="Requested at">
                      <input
                        type="datetime-local"
                        value={toDateTimeLocalValue(formState.fulfillmentRequestedAt)}
                        onChange={(event) => setFormState((current) => ({ ...current, fulfillmentRequestedAt: fromDateTimeLocalValue(event.target.value) || '' }))}
                        className="w-full rounded-lg border bg-background px-3 py-2.5 text-sm"
                      />
                    </Field>
                    <Field label="Completed at">
                      <input
                        type="datetime-local"
                        value={toDateTimeLocalValue(formState.fulfillmentCompletedAt)}
                        onChange={(event) => setFormState((current) => ({ ...current, fulfillmentCompletedAt: fromDateTimeLocalValue(event.target.value) || '' }))}
                        className="w-full rounded-lg border bg-background px-3 py-2.5 text-sm"
                      />
                    </Field>
                  </div>
                  <Field label="Provider payload">
                    <textarea
                      value={formState.fulfillmentPayload}
                      onChange={(event) => setFormState((current) => ({ ...current, fulfillmentPayload: event.target.value }))}
                      rows={4}
                      className="w-full resize-none rounded-lg border bg-background px-3 py-2.5 font-mono text-xs"
                      placeholder="{ }"
                    />
                  </Field>
                </div>
                <div className="space-y-3 rounded-lg border border-border bg-muted/20 p-3" data-testid="orders-risk-controls">
                  <div>
                    <div className="text-sm font-semibold text-foreground">Fraud risk controls</div>
                    <div className="mt-1 text-xs text-muted-foreground">
                      Checkout intake populates risk score, level, reasons, and review state for private order review.
                    </div>
                  </div>
                  <div className="grid gap-3 md:grid-cols-[120px_1fr_1fr]">
                    <Field label="Risk score">
                      <input
                        type="number"
                        min="0"
                        max="100"
                        value={formState.riskScore}
                        onChange={(event) => setFormState((current) => ({ ...current, riskScore: event.target.value }))}
                        className="w-full rounded-lg border bg-background px-3 py-2.5 text-sm"
                      />
                    </Field>
                    <Field label="Risk level">
                      <select
                        aria-label="Risk level"
                        value={formState.riskLevel}
                        onChange={(event) => setFormState((current) => ({ ...current, riskLevel: event.target.value as OrderRiskLevel }))}
                        className="w-full rounded-lg border bg-background px-3 py-2.5 text-sm"
                      >
                        <option value="low">Low</option>
                        <option value="medium">Medium</option>
                        <option value="high">High</option>
                      </select>
                    </Field>
                    <Field label="Review status">
                      <select
                        aria-label="Risk review status"
                        value={formState.riskReviewStatus}
                        onChange={(event) => setFormState((current) => ({ ...current, riskReviewStatus: event.target.value as OrderRiskReviewStatus }))}
                        className="w-full rounded-lg border bg-background px-3 py-2.5 text-sm"
                      >
                        <option value="cleared">Cleared</option>
                        <option value="pending_review">Pending review</option>
                        <option value="approved">Approved</option>
                        <option value="held">Held</option>
                      </select>
                    </Field>
                  </div>
                  <Field label="Risk reasons">
                    <textarea
                      value={formState.riskReasons}
                      onChange={(event) => setFormState((current) => ({ ...current, riskReasons: event.target.value }))}
                      rows={3}
                      className="w-full resize-none rounded-lg border bg-background px-3 py-2.5 text-sm"
                      placeholder="Risk rules or reviewer notes"
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
                        disabled={isOrdersAccessBusy || !canEditOrders || orderLineItems.length === 0}
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
                          <Button size="sm" variant="ghost" onClick={() => removeLineItem(item.id)} disabled={isOrdersAccessBusy || !canEditOrders}>
                            Remove
                          </Button>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <EmptyState
                      icon={ShoppingCart}
                      title="No line items yet"
                      description="Add line items for manual orders, or they will appear here when checkout posts structured cart data."
                    />
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
                      disabled={isOrdersAccessBusy || !canEditOrders || !itemDraft.title.trim() || orderLineItems.length >= 100}
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
                <div className="space-y-3 rounded-lg border border-border bg-muted/20 p-3" data-testid="orders-provider-refund-controls">
                  <div>
                    <div className="text-sm font-semibold text-foreground">Provider refund automation</div>
                    <div className="mt-1 text-xs text-muted-foreground">
                      Request and track provider refund handoff payloads without exposing payment credentials in the order record.
                    </div>
                  </div>
                  <div className="grid gap-3 md:grid-cols-4">
                    <Field label="Refund status">
                      <select
                        aria-label="Provider refund status"
                        value={formState.providerRefundStatus}
                        onChange={(event) => setFormState((current) => ({ ...current, providerRefundStatus: event.target.value as ProviderRefundStatus }))}
                        className="w-full rounded-lg border bg-background px-3 py-2.5 text-sm"
                      >
                        <option value="none">None</option>
                        <option value="requested">Requested</option>
                        <option value="succeeded">Succeeded</option>
                        <option value="failed">Failed</option>
                        <option value="requires_action">Requires action</option>
                      </select>
                    </Field>
                    <Field label="Refund provider">
                      <input
                        value={formState.providerRefundProvider}
                        onChange={(event) => setFormState((current) => ({ ...current, providerRefundProvider: event.target.value }))}
                        className="w-full rounded-lg border bg-background px-3 py-2.5 text-sm"
                        placeholder="stripe, manual"
                      />
                    </Field>
                    <Field label="Provider refund ID">
                      <input
                        value={formState.providerRefundId}
                        onChange={(event) => setFormState((current) => ({ ...current, providerRefundId: event.target.value }))}
                        className="w-full rounded-lg border bg-background px-3 py-2.5 text-sm"
                        placeholder="Generated by Backy"
                      />
                    </Field>
                    <Field label="Provider amount">
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={formState.providerRefundAmount}
                        onChange={(event) => setFormState((current) => ({ ...current, providerRefundAmount: event.target.value }))}
                        className="w-full rounded-lg border bg-background px-3 py-2.5 text-sm"
                      />
                    </Field>
                  </div>
                  <div className="grid gap-3 md:grid-cols-3">
                    <Field label="Provider reference">
                      <input
                        value={formState.providerRefundReference}
                        onChange={(event) => setFormState((current) => ({ ...current, providerRefundReference: event.target.value }))}
                        className="w-full rounded-lg border bg-background px-3 py-2.5 text-sm"
                      />
                    </Field>
                    <Field label="Requested at">
                      <input
                        type="datetime-local"
                        value={toDateTimeLocalValue(formState.providerRefundRequestedAt)}
                        onChange={(event) => setFormState((current) => ({ ...current, providerRefundRequestedAt: fromDateTimeLocalValue(event.target.value) || '' }))}
                        className="w-full rounded-lg border bg-background px-3 py-2.5 text-sm"
                      />
                    </Field>
                    <Field label="Completed at">
                      <input
                        type="datetime-local"
                        value={toDateTimeLocalValue(formState.providerRefundCompletedAt)}
                        onChange={(event) => setFormState((current) => ({ ...current, providerRefundCompletedAt: fromDateTimeLocalValue(event.target.value) || '' }))}
                        className="w-full rounded-lg border bg-background px-3 py-2.5 text-sm"
                      />
                    </Field>
                  </div>
                  <Field label="Provider refund reason">
                    <textarea
                      value={formState.providerRefundReason}
                      onChange={(event) => setFormState((current) => ({ ...current, providerRefundReason: event.target.value }))}
                      rows={2}
                      className="w-full resize-none rounded-lg border bg-background px-3 py-2.5 text-sm"
                    />
                  </Field>
                  <Field label="Provider payload">
                    <textarea
                      value={formState.providerRefundPayload}
                      onChange={(event) => setFormState((current) => ({ ...current, providerRefundPayload: event.target.value }))}
                      rows={3}
                      className="w-full resize-none rounded-lg border bg-background px-3 py-2.5 font-mono text-xs"
                    />
                  </Field>
                </div>
                <div className="flex justify-end gap-2 pt-2">
                  <Button variant="outline" onClick={resetForm} disabled={isOrdersAccessBusy || !canEditOrders}>Clear</Button>
                  <Button type="submit" variant="primary" disabled={isOrdersAccessBusy || !canEditOrders || !formState.orderNumber.trim() || !formState.customerName.trim() || !formState.email.trim()} title={!canEditOrders ? editPermissionTitle : undefined} iconStart={<Receipt className="size-4" />}>
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
                disabled={isOrdersAccessBusy}
                className="rounded-lg border border-border px-4 py-2 text-sm font-medium transition-colors hover:bg-accent disabled:cursor-not-allowed disabled:opacity-60"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void removeOrder(pendingDeleteOrder)}
                disabled={isOrdersAccessBusy || !canDeleteOrders}
                title={!canDeleteOrders ? deletePermissionTitle : undefined}
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

function Field({ label, children, className }: { label: string; children: ReactNode; className?: string }) {
  return (
    <label className={cn('block space-y-2', className)}>
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
  selectedForBulk,
  disabled,
  onSelectionChange,
  onEdit,
  onRefreshQuote,
  onDispatchFulfillment,
  onPaid,
  onShippingLabel,
  onVoidShippingLabel,
  onRefreshTracking,
  onFulfilled,
  onRefunded,
  onProviderRefund,
  onRefreshProviderRefund,
  onCancelled,
  onDelete,
  canDelete,
  deleteDisabledReason,
}: {
  order: CollectionRecord;
  selected: boolean;
  selectedForBulk: boolean;
  disabled: boolean;
  canDelete: boolean;
  deleteDisabledReason?: string;
  onSelectionChange: (checked: boolean) => void;
  onEdit: () => void;
  onRefreshQuote: () => void;
  onDispatchFulfillment: () => void;
  onPaid: () => void;
  onShippingLabel: () => void;
  onVoidShippingLabel: () => void;
  onRefreshTracking: () => void;
  onFulfilled: () => void;
  onRefunded: () => void;
  onProviderRefund: () => void;
  onRefreshProviderRefund: () => void;
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
  const trackingStatus = String(readOrderValue(values, 'trackingstatus', ''));
  const trackingLastCheckedAt = String(readOrderValue(values, 'trackinglastcheckedat', ''));
  const paymentReference = String(readOrderValue(values, 'paymentreference', ''));
  const orderSource = String(readOrderValue(values, 'ordersource', 'web'));
  const checkoutSessionId = String(readOrderValue(values, 'checkoutsessionid', ''));
  const customerId = String(readOrderValue(values, 'customerid', ''));
  const paidAt = String(readOrderValue(values, 'paidat', ''));
  const fulfilledAt = String(readOrderValue(values, 'fulfilledat', ''));
  const shippingLabelStatus = String(readOrderValue(values, 'shippinglabelstatus', 'none'));
  const shippingLabelProvider = String(readOrderValue(values, 'shippinglabelprovider', ''));
  const shippingLabelId = String(readOrderValue(values, 'shippinglabelid', ''));
  const shippingLabelUrl = String(readOrderValue(values, 'shippinglabelurl', ''));
  const shippingServiceLevel = String(readOrderValue(values, 'shippingservicelevel', ''));
  const shippingLabelCost = toNumber(readOrderValue(values, 'shippinglabelcost', 0));
  const shippingLabelCreatedAt = String(readOrderValue(values, 'shippinglabelcreatedat', ''));
  const fulfillmentDispatchStatus = String(readOrderValue(values, 'fulfillmentdispatchstatus', 'none'));
  const fulfillmentProvider = String(readOrderValue(values, 'fulfillmentprovider', ''));
  const fulfillmentId = String(readOrderValue(values, 'fulfillmentid', ''));
  const fulfillmentRequestedAt = String(readOrderValue(values, 'fulfillmentrequestedat', ''));
  const refundAmount = toNumber(readOrderValue(values, 'refundamount', 0));
  const providerRefundStatus = String(readOrderValue(values, 'providerrefundstatus', 'none'));
  const providerRefundProvider = String(readOrderValue(values, 'providerrefundprovider', ''));
  const providerRefundId = String(readOrderValue(values, 'providerrefundid', ''));
  const providerRefundAmount = toNumber(readOrderValue(values, 'providerrefundamount', 0));
  const providerRefundRequestedAt = String(readOrderValue(values, 'providerrefundrequestedat', ''));
  const providerRefundRetryable = providerRefundStatus === 'failed' || providerRefundStatus === 'requires_action';
  const providerRefundRefreshable = Boolean(providerRefundId) && providerRefundStatus !== 'succeeded';
  const riskScore = toNumber(readOrderValue(values, 'riskscore', 0));
  const riskLevel = String(readOrderValue(values, 'risklevel', riskScore >= 60 ? 'high' : riskScore >= 25 ? 'medium' : 'low'));
  const riskReviewStatus = String(readOrderValue(values, 'riskreviewstatus', riskLevel === 'low' ? 'cleared' : 'pending_review'));
  const riskReasons = String(readOrderValue(values, 'riskreasons', '')).trim();
  const lineItems = parseOrderLineItems(values.items, currency);
  const lineItemSummary = formatOrderItemSummary(values.items, currency);
  const lineItemQuantity = lineItems.reduce((sum, item) => sum + item.quantity, 0);

  return (
    <article className={cn('rounded-lg border bg-background p-4 transition-colors', selected ? 'border-primary ring-2 ring-primary/10' : 'border-border')}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 flex-1 gap-3">
          <input
            type="checkbox"
            aria-label={`Select order ${String(readOrderValue(values, 'ordernumber', order.slug))}`}
            checked={selectedForBulk}
            onChange={(event) => onSelectionChange(event.target.checked)}
            disabled={disabled}
            className="mt-1 size-4 shrink-0 rounded border-border"
          />
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
                  Track {trackingStatus || trackingNumber}
                </span>
              ) : null}
              {shippingLabelId ? (
                <span className="rounded-md border border-blue-200 bg-blue-50 px-2 py-1 text-[11px] font-medium text-blue-700">
                  Label {shippingLabelStatus} · {shippingLabelId}
                </span>
              ) : null}
              {fulfillmentId ? (
                <span className="rounded-md border border-cyan-200 bg-cyan-50 px-2 py-1 text-[11px] font-medium text-cyan-700">
                  Fulfillment {fulfillmentDispatchStatus.replace(/_/g, ' ')}
                </span>
              ) : null}
              {refundAmount > 0 ? (
                <span className="rounded-md border border-amber-200 bg-amber-50 px-2 py-1 text-[11px] font-medium text-amber-800">
                  Refund {formatMoney(refundAmount, currency)}
                </span>
              ) : null}
              {providerRefundId ? (
                <span className="rounded-md border border-indigo-200 bg-indigo-50 px-2 py-1 text-[11px] font-medium text-indigo-700">
                  Provider refund {providerRefundStatus}
                </span>
              ) : null}
              <span className={cn(
                'rounded-md border px-2 py-1 text-[11px] font-medium capitalize',
                riskLevel === 'high'
                  ? 'border-destructive/30 bg-destructive/10 text-destructive'
                  : riskLevel === 'medium'
                    ? 'border-amber-200 bg-amber-50 text-amber-800'
                    : 'border-emerald-200 bg-emerald-50 text-emerald-700',
              )}
              >
                Risk {riskLevel} · {riskScore}
              </span>
              {lineItems.length > 0 ? (
                <span className="rounded-md border border-border bg-muted px-2 py-1 text-[11px] font-medium text-muted-foreground">
                  {lineItems.length} item{lineItems.length === 1 ? '' : 's'} · {lineItemQuantity} unit{lineItemQuantity === 1 ? '' : 's'}
                </span>
              ) : null}
            </div>
          </div>
        </div>
        <div className="text-right">
          <div className="font-mono text-lg font-semibold">{formatMoney(total, currency)}</div>
          <div className="text-xs text-muted-foreground">{order.updatedAt ? formatDate(order.updatedAt) : 'Now'}</div>
        </div>
      </div>
      <div className="mt-4 grid gap-2 text-sm sm:grid-cols-4">
        <StatePill label="Order" value={orderStatus} />
        <StatePill label="Payment" value={paymentStatus} />
        <StatePill label="Fulfillment" value={fulfillmentStatus} />
        <StatePill label="Risk review" value={riskReviewStatus.replace(/_/g, ' ')} />
      </div>
      {shippingLabelId ? (
        <div className={cn(
          'mt-3 rounded-lg border px-3 py-2 text-xs',
          shippingLabelStatus === 'voided'
            ? 'border-slate-200 bg-slate-50 text-slate-700'
            : 'border-blue-100 bg-blue-50/60 text-blue-800',
        )}
        >
          <Truck className="mr-1 inline size-3.5" />
          Label {shippingLabelId} {shippingLabelStatus === 'voided' ? 'voided' : 'prepared'} with {shippingLabelProvider || 'manual'}
          {shippingServiceLevel ? ` ${shippingServiceLevel}` : ''}
          {shippingLabelCost > 0 ? ` for ${formatMoney(shippingLabelCost, currency)}` : ''}
          {shippingLabelCreatedAt ? ` on ${formatWorkflowDate(shippingLabelCreatedAt)}` : ''}.
        </div>
      ) : null}
      {riskReasons ? (
        <div className="mt-3 rounded-lg border border-border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
          {riskReasons}
        </div>
      ) : null}
      {fulfillmentId ? (
        <div className="mt-3 rounded-lg border border-cyan-100 bg-cyan-50/60 px-3 py-2 text-xs text-cyan-800">
          <PackageCheck className="mr-1 inline size-3.5" />
          Fulfillment dispatch {fulfillmentId} is {fulfillmentDispatchStatus.replace(/_/g, ' ')} through {fulfillmentProvider || 'manual'}
          {fulfillmentRequestedAt ? ` since ${formatWorkflowDate(fulfillmentRequestedAt)}` : ''}.
        </div>
      ) : null}
      {providerRefundId ? (
        <div className="mt-3 rounded-lg border border-indigo-100 bg-indigo-50/60 px-3 py-2 text-xs text-indigo-800">
          <RotateCcw className="mr-1 inline size-3.5" />
          Provider refund {providerRefundId} is {providerRefundStatus.replace(/_/g, ' ')} through {providerRefundProvider || 'manual'}
          {providerRefundAmount > 0 ? ` for ${formatMoney(providerRefundAmount, currency)}` : ''}
          {providerRefundRequestedAt ? ` on ${formatWorkflowDate(providerRefundRequestedAt)}` : ''}.
        </div>
      ) : null}
      {lineItemSummary ? (
        <p className="mt-3 line-clamp-2 text-sm text-muted-foreground">
          {lineItemSummary}
        </p>
      ) : null}
      {(paidAt || fulfilledAt || trackingUrl || trackingStatus || trackingLastCheckedAt) && (
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
          {trackingStatus || trackingLastCheckedAt ? (
            <div className="rounded border border-border bg-muted/40 px-2 py-1.5">
              <RefreshCw className="mr-1 inline size-3.5" />
              Tracking {trackingStatus || 'checked'}{trackingLastCheckedAt ? ` ${formatWorkflowDate(trackingLastCheckedAt)}` : ''}
            </div>
          ) : null}
        </div>
      )}
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <Button size="sm" onClick={onEdit} disabled={disabled} iconStart={<Receipt className="size-4" />}>Edit</Button>
        <Button size="sm" variant="outline" onClick={onRefreshQuote} disabled={disabled || orderStatus === 'cancelled' || paymentStatus === 'refunded'} iconStart={<RefreshCw className="size-4" />}>Refresh Quote</Button>
        <Button size="sm" variant="outline" onClick={onPaid} disabled={disabled || paymentStatus === 'paid'} iconStart={<CreditCard className="size-4" />}>Mark Paid</Button>
        <Button size="sm" variant="outline" onClick={onShippingLabel} disabled={disabled || (Boolean(shippingLabelId) && shippingLabelStatus !== 'voided') || fulfillmentStatus === 'fulfilled' || fulfillmentStatus === 'cancelled'} iconStart={<Truck className="size-4" />}>Prepare Label</Button>
        {shippingLabelId ? (
          <Button size="sm" variant="outline" onClick={onVoidShippingLabel} disabled={disabled || shippingLabelStatus === 'voided' || fulfillmentStatus === 'fulfilled'} iconStart={<Archive className="size-4" />}>Void Label</Button>
        ) : null}
        {shippingLabelUrl ? (
          <a
            href={shippingLabelUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex min-h-9 items-center justify-center gap-2 rounded-lg border border-transparent bg-transparent px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-accent"
          >
            <ExternalLink className="size-4" />
            Open Label
          </a>
        ) : null}
        {trackingNumber ? (
          <Button size="sm" variant="outline" onClick={onRefreshTracking} disabled={disabled || fulfillmentStatus === 'cancelled'} iconStart={<RefreshCw className="size-4" />}>Refresh Tracking</Button>
        ) : null}
        <Button size="sm" variant="outline" onClick={onDispatchFulfillment} disabled={disabled || Boolean(fulfillmentId) || paymentStatus !== 'paid' || fulfillmentStatus === 'fulfilled' || fulfillmentStatus === 'cancelled'} iconStart={<PackageCheck className="size-4" />}>Dispatch Fulfillment</Button>
        <Button size="sm" variant="outline" onClick={onFulfilled} disabled={disabled || fulfillmentStatus === 'fulfilled'} iconStart={<PackageCheck className="size-4" />}>Fulfill</Button>
        <Button size="sm" variant="outline" onClick={onRefunded} disabled={disabled || paymentStatus === 'refunded'} iconStart={<RotateCcw className="size-4" />}>Record Refund/Return</Button>
        <Button size="sm" variant="outline" onClick={onProviderRefund} disabled={disabled || (Boolean(providerRefundId) && !providerRefundRetryable) || paymentStatus === 'pending' || paymentStatus === 'failed'} iconStart={<CreditCard className="size-4" />}>{providerRefundRetryable ? 'Retry Provider Refund' : 'Provider Refund'}</Button>
        {providerRefundRefreshable ? (
          <Button size="sm" variant="outline" onClick={onRefreshProviderRefund} disabled={disabled} iconStart={<RefreshCw className="size-4" />}>Refresh Provider Refund</Button>
        ) : null}
        <Button size="sm" variant="outline" onClick={onCancelled} disabled={disabled || orderStatus === 'cancelled'} iconStart={<Archive className="size-4" />}>Record Cancel</Button>
        <Button size="sm" variant="danger" onClick={onDelete} disabled={disabled || !canDelete} title={!canDelete ? deleteDisabledReason : undefined} iconStart={<Trash2 className="size-4" />}>Delete</Button>
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

function CronReadinessPill({ label, ready }: { label: string; ready: boolean }) {
  return (
    <span className={cn(
      'inline-flex items-center justify-between gap-2 rounded-md border px-2.5 py-1.5 text-xs font-medium',
      ready
        ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
        : 'border-amber-200 bg-amber-50 text-amber-800',
    )}
    >
      {label}
      <span>{ready ? 'Ready' : 'Missing'}</span>
    </span>
  );
}

function ProviderReadinessPill({ title, mode, ready, detail }: { title: string; mode: string; ready: boolean; detail: string }) {
  return (
    <div className={cn(
      'rounded-md border px-3 py-2 text-xs',
      ready
        ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
        : 'border-amber-200 bg-amber-50 text-amber-900',
    )}
    >
      <div className="flex items-start justify-between gap-2">
        <span className="font-semibold">{title}</span>
        <span className="shrink-0 rounded bg-background/80 px-1.5 py-0.5 font-mono text-[10px]">{ready ? 'Ready' : 'Needs env'}</span>
      </div>
      <div className="mt-1 font-mono text-[11px]">{mode}</div>
      <div className="mt-1 leading-5 opacity-90">{detail}</div>
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

const asOrderRiskLevel = (value: unknown): OrderRiskLevel => (
  ['low', 'medium', 'high'].includes(String(value))
    ? String(value) as OrderRiskLevel
    : 'low'
);

const asOrderRiskReviewStatus = (value: unknown): OrderRiskReviewStatus => (
  ['cleared', 'pending_review', 'approved', 'held'].includes(String(value))
    ? String(value) as OrderRiskReviewStatus
    : 'cleared'
);

const asShippingLabelStatus = (value: unknown): ShippingLabelStatus => (
  ['none', 'draft', 'purchased', 'voided'].includes(String(value))
    ? String(value) as ShippingLabelStatus
    : 'none'
);

const asFulfillmentDispatchStatus = (value: unknown): FulfillmentDispatchStatus => (
  ['none', 'requested', 'succeeded', 'failed', 'requires_action'].includes(String(value))
    ? String(value) as FulfillmentDispatchStatus
    : 'none'
);

const asProviderRefundStatus = (value: unknown): ProviderRefundStatus => (
  ['none', 'requested', 'succeeded', 'failed', 'requires_action'].includes(String(value))
    ? String(value) as ProviderRefundStatus
    : 'none'
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

const normalizeOrderProviderKey = (value: unknown): string => String(value || '').trim().toLowerCase().replace(/[\s_-]+/g, '');

const resolveTrackingExecutionProvider = ({
  settingsProvider,
  shippingLabelProvider,
  fulfillmentCarrier,
}: {
  settingsProvider?: string;
  shippingLabelProvider?: string;
  fulfillmentCarrier?: string;
}): 'easypost' | 'shippo' | '' => {
  const candidates = [shippingLabelProvider, settingsProvider, fulfillmentCarrier].map(normalizeOrderProviderKey);
  if (candidates.includes('shippo')) return 'shippo';
  if (candidates.includes('easypost')) return 'easypost';
  return '';
};

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
  if (key === 'trackingstatus') return 'trackingStatus';
  if (key === 'trackinglastcheckedat') return 'trackingLastCheckedAt';
  if (key === 'fulfilledat') return 'fulfilledAt';
  if (key === 'shippinglabelstatus') return 'shippingLabelStatus';
  if (key === 'shippinglabelprovider') return 'shippingLabelProvider';
  if (key === 'shippinglabelid') return 'shippingLabelId';
  if (key === 'shippinglabelurl') return 'shippingLabelUrl';
  if (key === 'shippingservicelevel') return 'shippingServiceLevel';
  if (key === 'shippinglabelcost') return 'shippingLabelCost';
  if (key === 'shippinglabelcreatedat') return 'shippingLabelCreatedAt';
  if (key === 'fulfillmentdispatchstatus') return 'fulfillmentDispatchStatus';
  if (key === 'fulfillmentprovider') return 'fulfillmentProvider';
  if (key === 'fulfillmentid') return 'fulfillmentId';
  if (key === 'fulfillmentrequestedat') return 'fulfillmentRequestedAt';
  if (key === 'fulfillmentcompletedat') return 'fulfillmentCompletedAt';
  if (key === 'fulfillmentpayload') return 'fulfillmentPayload';
  if (key === 'shippingaddress') return 'shippingAddress';
  if (key === 'billingaddress') return 'billingAddress';
  if (key === 'refundamount') return 'refundAmount';
  if (key === 'refundreason') return 'refundReason';
  if (key === 'providerrefundstatus') return 'providerRefundStatus';
  if (key === 'providerrefundprovider') return 'providerRefundProvider';
  if (key === 'providerrefundid') return 'providerRefundId';
  if (key === 'providerrefundreference') return 'providerRefundReference';
  if (key === 'providerrefundamount') return 'providerRefundAmount';
  if (key === 'providerrefundreason') return 'providerRefundReason';
  if (key === 'providerrefundrequestedat') return 'providerRefundRequestedAt';
  if (key === 'providerrefundcompletedat') return 'providerRefundCompletedAt';
  if (key === 'providerrefundpayload') return 'providerRefundPayload';
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
  ...(updates.trackingStatus !== undefined ? { trackingstatus: updates.trackingStatus } : {}),
  ...(updates.trackingLastCheckedAt !== undefined ? { trackinglastcheckedat: updates.trackingLastCheckedAt || null } : {}),
  ...(updates.fulfilledAt !== undefined ? { fulfilledat: updates.fulfilledAt || null } : {}),
  ...(updates.shippingLabelStatus !== undefined ? { shippinglabelstatus: updates.shippingLabelStatus } : {}),
  ...(updates.shippingLabelProvider !== undefined ? { shippinglabelprovider: updates.shippingLabelProvider } : {}),
  ...(updates.shippingLabelId !== undefined ? { shippinglabelid: updates.shippingLabelId } : {}),
  ...(updates.shippingLabelUrl !== undefined ? { shippinglabelurl: updates.shippingLabelUrl } : {}),
  ...(updates.shippingServiceLevel !== undefined ? { shippingservicelevel: updates.shippingServiceLevel } : {}),
  ...(updates.shippingLabelCost !== undefined ? { shippinglabelcost: updates.shippingLabelCost ? Number(updates.shippingLabelCost) : null } : {}),
  ...(updates.shippingLabelCreatedAt !== undefined ? { shippinglabelcreatedat: updates.shippingLabelCreatedAt || null } : {}),
  ...(updates.fulfillmentDispatchStatus !== undefined ? { fulfillmentdispatchstatus: updates.fulfillmentDispatchStatus } : {}),
  ...(updates.fulfillmentProvider !== undefined ? { fulfillmentprovider: updates.fulfillmentProvider } : {}),
  ...(updates.fulfillmentId !== undefined ? { fulfillmentid: updates.fulfillmentId } : {}),
  ...(updates.fulfillmentRequestedAt !== undefined ? { fulfillmentrequestedat: updates.fulfillmentRequestedAt || null } : {}),
  ...(updates.fulfillmentCompletedAt !== undefined ? { fulfillmentcompletedat: updates.fulfillmentCompletedAt || null } : {}),
  ...(updates.fulfillmentPayload !== undefined ? { fulfillmentpayload: updates.fulfillmentPayload } : {}),
  ...(updates.refundAmount !== undefined ? { refundamount: updates.refundAmount ? Number(updates.refundAmount) : null } : {}),
  ...(updates.refundReason !== undefined ? { refundreason: updates.refundReason } : {}),
  ...(updates.providerRefundStatus !== undefined ? { providerrefundstatus: updates.providerRefundStatus } : {}),
  ...(updates.providerRefundProvider !== undefined ? { providerrefundprovider: updates.providerRefundProvider } : {}),
  ...(updates.providerRefundId !== undefined ? { providerrefundid: updates.providerRefundId } : {}),
  ...(updates.providerRefundReference !== undefined ? { providerrefundreference: updates.providerRefundReference } : {}),
  ...(updates.providerRefundAmount !== undefined ? { providerrefundamount: updates.providerRefundAmount ? Number(updates.providerRefundAmount) : null } : {}),
  ...(updates.providerRefundReason !== undefined ? { providerrefundreason: updates.providerRefundReason } : {}),
  ...(updates.providerRefundRequestedAt !== undefined ? { providerrefundrequestedat: updates.providerRefundRequestedAt || null } : {}),
  ...(updates.providerRefundCompletedAt !== undefined ? { providerrefundcompletedat: updates.providerRefundCompletedAt || null } : {}),
  ...(updates.providerRefundPayload !== undefined ? { providerrefundpayload: updates.providerRefundPayload } : {}),
  ...(updates.notes !== undefined ? { notes: updates.notes } : {}),
});

const existingPaidAt = (order: CollectionRecord): string => (
  String(readOrderValue(order.values, 'paidat', '') || '')
);

const appendWorkflowNote = (order: CollectionRecord, note: string): string => {
  const currentNotes = String(readOrderValue(order.values, 'notes', '') || '').trim();
  return currentNotes ? `${currentNotes}\n${note}` : note;
};

const buildPaidWorkflowUpdates = (order: CollectionRecord): Partial<OrderFormState> => {
  const currentFulfillmentStatus = asFulfillmentStatus(readOrderValue(order.values, 'fulfillmentstatus', undefined));
  const fulfilledAt = String(readOrderValue(order.values, 'fulfilledat', '') || '');
  const nextFulfillmentStatus = currentFulfillmentStatus === 'cancelled'
    ? 'unfulfilled'
    : currentFulfillmentStatus;

  return {
    orderStatus: nextFulfillmentStatus === 'fulfilled' ? 'fulfilled' : 'paid',
    paymentStatus: 'paid',
    paidAt: existingPaidAt(order) || new Date().toISOString(),
    fulfillmentStatus: nextFulfillmentStatus,
    fulfilledAt: nextFulfillmentStatus === 'fulfilled' ? fulfilledAt : '',
    refundAmount: '',
    refundReason: '',
    notes: appendWorkflowNote(order, `Payment workflow marked paid ${new Date().toISOString()}.`),
  };
};

const buildProcessingWorkflowUpdates = (order: CollectionRecord): Partial<OrderFormState> => ({
  orderStatus: 'paid',
  paymentStatus: 'paid',
  paidAt: existingPaidAt(order) || new Date().toISOString(),
  fulfillmentStatus: 'processing',
  fulfilledAt: '',
  refundAmount: '',
  refundReason: '',
  notes: appendWorkflowNote(order, `Fulfillment workflow moved to processing ${new Date().toISOString()}.`),
});

const buildFulfilledWorkflowUpdates = (order: CollectionRecord): Partial<OrderFormState> => ({
  orderStatus: 'fulfilled',
  paymentStatus: 'paid',
  paidAt: existingPaidAt(order) || new Date().toISOString(),
  fulfillmentStatus: 'fulfilled',
  fulfilledAt: new Date().toISOString(),
  refundAmount: '',
  refundReason: '',
  notes: appendWorkflowNote(order, `Fulfillment workflow completed ${new Date().toISOString()}.`),
});

const buildRefundWorkflowUpdates = (order: CollectionRecord): Partial<OrderFormState> => {
  const total = toNumber(readOrderValue(order.values, 'total', 0));
  const currency = normalizeCurrency(String(readOrderValue(order.values, 'currency', 'USD')));
  const currentRefundAmount = toNumber(readOrderValue(order.values, 'refundamount', 0));
  const refundAmount = currentRefundAmount > 0 ? currentRefundAmount : total;
  const currentReason = String(readOrderValue(order.values, 'refundreason', '') || '').trim();
  const currentNotes = String(readOrderValue(order.values, 'notes', '') || '').trim();
  const workflowNote = `Manual refund/return state recorded in Backy ${new Date().toISOString()} for ${formatMoney(refundAmount, currency)}. Provider refund, if required, must be completed in the payment provider.`;

  return {
    orderStatus: 'refunded',
    paymentStatus: 'refunded',
    fulfillmentStatus: 'cancelled',
    fulfilledAt: '',
    trackingNumber: '',
    trackingUrl: '',
    trackingStatus: '',
    trackingLastCheckedAt: '',
    refundAmount: String(refundAmount),
    refundReason: currentReason || 'Customer return/refund manually recorded from Backy order workflow.',
    notes: currentNotes ? `${currentNotes}\n${workflowNote}` : workflowNote,
  };
};

const buildCancelWorkflowUpdates = (order: CollectionRecord): Partial<OrderFormState> => {
  const total = toNumber(readOrderValue(order.values, 'total', 0));
  const currency = normalizeCurrency(String(readOrderValue(order.values, 'currency', 'USD')));
  const currentPaymentStatus = asPaymentStatus(readOrderValue(order.values, 'paymentstatus', undefined));
  const currentRefundAmount = toNumber(readOrderValue(order.values, 'refundamount', 0));
  const currentReason = String(readOrderValue(order.values, 'refundreason', '') || '').trim();
  const currentNotes = String(readOrderValue(order.values, 'notes', '') || '').trim();
  const shouldRefundPayment = currentPaymentStatus === 'paid' || currentPaymentStatus === 'refunded';
  const nextPaymentStatus: PaymentStatus = shouldRefundPayment ? 'refunded' : 'failed';
  const workflowNote = shouldRefundPayment
    ? `Manual cancellation state recorded in Backy ${new Date().toISOString()} and payment state marked refunded for ${formatMoney(currentRefundAmount > 0 ? currentRefundAmount : total, currency)}. Provider cancellation/refund, if required, must be completed in the payment provider.`
    : `Manual cancellation state recorded in Backy ${new Date().toISOString()} and payment state marked failed before fulfillment. Provider cancellation, if required, must be completed outside Backy.`;

  return {
    orderStatus: 'cancelled',
    paymentStatus: nextPaymentStatus,
    paidAt: shouldRefundPayment ? undefined : '',
    fulfillmentStatus: 'cancelled',
    fulfillmentCarrier: '',
    trackingNumber: '',
    trackingUrl: '',
    trackingStatus: '',
    trackingLastCheckedAt: '',
    fulfilledAt: '',
    refundAmount: shouldRefundPayment ? String(currentRefundAmount > 0 ? currentRefundAmount : total) : '',
    refundReason: shouldRefundPayment ? currentReason || 'Order cancellation manually recorded from Backy order workflow.' : '',
    notes: currentNotes ? `${currentNotes}\n${workflowNote}` : workflowNote,
  };
};

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
  trackingStatus: String(readOrderValue(order.values, 'trackingstatus', '')),
  trackingLastCheckedAt: String(readOrderValue(order.values, 'trackinglastcheckedat', '') || ''),
  fulfilledAt: String(readOrderValue(order.values, 'fulfilledat', '') || ''),
  shippingLabelStatus: asShippingLabelStatus(readOrderValue(order.values, 'shippinglabelstatus', undefined)),
  shippingLabelProvider: String(readOrderValue(order.values, 'shippinglabelprovider', '')),
  shippingLabelId: String(readOrderValue(order.values, 'shippinglabelid', '')),
  shippingLabelUrl: String(readOrderValue(order.values, 'shippinglabelurl', '')),
  shippingServiceLevel: String(readOrderValue(order.values, 'shippingservicelevel', '')),
  shippingLabelCost: readOrderValue(order.values, 'shippinglabelcost', null) === null || readOrderValue(order.values, 'shippinglabelcost', undefined) === undefined
    ? ''
    : String(readOrderValue(order.values, 'shippinglabelcost', '')),
  shippingLabelCreatedAt: String(readOrderValue(order.values, 'shippinglabelcreatedat', '') || ''),
  fulfillmentDispatchStatus: asFulfillmentDispatchStatus(readOrderValue(order.values, 'fulfillmentdispatchstatus', undefined)),
  fulfillmentProvider: String(readOrderValue(order.values, 'fulfillmentprovider', '')),
  fulfillmentId: String(readOrderValue(order.values, 'fulfillmentid', '')),
  fulfillmentRequestedAt: String(readOrderValue(order.values, 'fulfillmentrequestedat', '') || ''),
  fulfillmentCompletedAt: String(readOrderValue(order.values, 'fulfillmentcompletedat', '') || ''),
  fulfillmentPayload: String(readOrderValue(order.values, 'fulfillmentpayload', '')),
  riskScore: String(readOrderValue(order.values, 'riskscore', 0) ?? 0),
  riskLevel: asOrderRiskLevel(readOrderValue(order.values, 'risklevel', undefined)),
  riskReasons: String(readOrderValue(order.values, 'riskreasons', '')),
  riskReviewStatus: asOrderRiskReviewStatus(readOrderValue(order.values, 'riskreviewstatus', undefined)),
  shippingAddress: String(readOrderValue(order.values, 'shippingaddress', '')),
  billingAddress: String(readOrderValue(order.values, 'billingaddress', '')),
  refundAmount: readOrderValue(order.values, 'refundamount', null) === null || readOrderValue(order.values, 'refundamount', undefined) === undefined
    ? ''
    : String(readOrderValue(order.values, 'refundamount', '')),
  refundReason: String(readOrderValue(order.values, 'refundreason', '')),
  providerRefundStatus: asProviderRefundStatus(readOrderValue(order.values, 'providerrefundstatus', undefined)),
  providerRefundProvider: String(readOrderValue(order.values, 'providerrefundprovider', '')),
  providerRefundId: String(readOrderValue(order.values, 'providerrefundid', '')),
  providerRefundReference: String(readOrderValue(order.values, 'providerrefundreference', '')),
  providerRefundAmount: readOrderValue(order.values, 'providerrefundamount', null) === null || readOrderValue(order.values, 'providerrefundamount', undefined) === undefined
    ? ''
    : String(readOrderValue(order.values, 'providerrefundamount', '')),
  providerRefundReason: String(readOrderValue(order.values, 'providerrefundreason', '')),
  providerRefundRequestedAt: String(readOrderValue(order.values, 'providerrefundrequestedat', '') || ''),
  providerRefundCompletedAt: String(readOrderValue(order.values, 'providerrefundcompletedat', '') || ''),
  providerRefundPayload: String(readOrderValue(order.values, 'providerrefundpayload', '')),
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
  tracking_status: String(readOrderValue(order.values, 'trackingstatus', '')),
  tracking_last_checked_at: String(readOrderValue(order.values, 'trackinglastcheckedat', '') || ''),
  fulfilled_at: String(readOrderValue(order.values, 'fulfilledat', '') || ''),
  shipping_label_status: asShippingLabelStatus(readOrderValue(order.values, 'shippinglabelstatus', undefined)),
  shipping_label_provider: String(readOrderValue(order.values, 'shippinglabelprovider', '')),
  shipping_label_id: String(readOrderValue(order.values, 'shippinglabelid', '')),
  shipping_label_url: String(readOrderValue(order.values, 'shippinglabelurl', '')),
  shipping_service_level: String(readOrderValue(order.values, 'shippingservicelevel', '')),
  shipping_label_cost: optionalNumber(readOrderValue(order.values, 'shippinglabelcost', null)),
  shipping_label_created_at: String(readOrderValue(order.values, 'shippinglabelcreatedat', '') || ''),
  fulfillment_dispatch_status: asFulfillmentDispatchStatus(readOrderValue(order.values, 'fulfillmentdispatchstatus', undefined)),
  fulfillment_provider: String(readOrderValue(order.values, 'fulfillmentprovider', '')),
  fulfillment_id: String(readOrderValue(order.values, 'fulfillmentid', '')),
  fulfillment_requested_at: String(readOrderValue(order.values, 'fulfillmentrequestedat', '') || ''),
  fulfillment_completed_at: String(readOrderValue(order.values, 'fulfillmentcompletedat', '') || ''),
  fulfillment_payload: String(readOrderValue(order.values, 'fulfillmentpayload', '')),
  risk_score: optionalNumber(readOrderValue(order.values, 'riskscore', 0)),
  risk_level: asOrderRiskLevel(readOrderValue(order.values, 'risklevel', undefined)),
  risk_reasons: String(readOrderValue(order.values, 'riskreasons', '')),
  risk_review_status: asOrderRiskReviewStatus(readOrderValue(order.values, 'riskreviewstatus', undefined)),
  shipping_address: String(readOrderValue(order.values, 'shippingaddress', '')),
  billing_address: String(readOrderValue(order.values, 'billingaddress', '')),
  refund_amount: optionalNumber(readOrderValue(order.values, 'refundamount', null)),
  refund_reason: String(readOrderValue(order.values, 'refundreason', '')),
  provider_refund_status: asProviderRefundStatus(readOrderValue(order.values, 'providerrefundstatus', undefined)),
  provider_refund_provider: String(readOrderValue(order.values, 'providerrefundprovider', '')),
  provider_refund_id: String(readOrderValue(order.values, 'providerrefundid', '')),
  provider_refund_reference: String(readOrderValue(order.values, 'providerrefundreference', '')),
  provider_refund_amount: optionalNumber(readOrderValue(order.values, 'providerrefundamount', null)),
  provider_refund_reason: String(readOrderValue(order.values, 'providerrefundreason', '')),
  provider_refund_requested_at: String(readOrderValue(order.values, 'providerrefundrequestedat', '') || ''),
  provider_refund_completed_at: String(readOrderValue(order.values, 'providerrefundcompletedat', '') || ''),
  provider_refund_payload: String(readOrderValue(order.values, 'providerrefundpayload', '')),
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
