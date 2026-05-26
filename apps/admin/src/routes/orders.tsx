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
  MoreHorizontal,
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
import { getLocalBackendOrigin } from '@/lib/localBackendOrigin';
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

const ORDER_EDITOR_SECTIONS = [
  { id: 'orders-editor-identity', label: 'Basics' },
  { id: 'orders-editor-customer', label: 'Customer' },
  { id: 'orders-editor-status-handoff', label: 'Status handoff' },
  { id: 'orders-editor-workflow', label: 'Workflow' },
  { id: 'orders-editor-labels', label: 'Labels' },
  { id: 'orders-editor-risk', label: 'Risk' },
  { id: 'orders-editor-items', label: 'Items' },
  { id: 'orders-editor-refunds', label: 'Refunds' },
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
type OrderOperationActionKey = 'refresh-quote' | 'prepare-label' | 'refresh-tracking' | 'dispatch-fulfillment' | 'provider-refund' | 'refresh-provider-refund';
type OrderOperationExecutionMode = 'provider-ready' | 'manual-handoff' | 'blocked';
type OrderStatusHandoffStatus = 'ready' | 'attention' | 'blocked';
type OrderDigitalDeliveryStatus = 'not-applicable' | 'pending-payment' | 'ready' | 'fulfilled' | 'attention';
type PaymentStatusFilter = PaymentStatus | 'all';
type FulfillmentStatusFilter = FulfillmentStatus | 'all';
type OrderSourceFilter = OrderSource | 'all';
type CommerceProviderSettings = NonNullable<NonNullable<SiteSettingsInput['integrations']>['commerce']>;
type RuntimeCommerceSettings = NonNullable<SiteSettingsInput['runtimeCommerce']>;
interface ProviderReadinessCheck {
  key: string;
  title: string;
  mode: string;
  ready: boolean;
  detail: string;
}
interface OrderOperationAction {
  key: OrderOperationActionKey;
  label: string;
  enabled: boolean;
  executionMode: OrderOperationExecutionMode;
  reason: string;
}
interface OrderOperationActionPlan {
  schemaVersion: 'backy.order-operation-action-plan.v1';
  attention: boolean;
  recommendedAction: OrderOperationActionKey | 'none';
  recommendation: string;
  handoffRequired: boolean;
  executableNow: boolean;
  availableActions: OrderOperationAction[];
}
interface OrderOperationImpact {
  schemaVersion: 'backy.order-operation-impact.v1';
  generatedAt: string;
  selectedSiteId: string;
  order: {
    id: string | null;
    slug: string | null;
    orderNumber: string;
    recordStatus: ContentStatus | null;
    orderStatus: OrderWorkflowStatus | null;
    paymentStatus: PaymentStatus | null;
    fulfillmentStatus: FulfillmentStatus | null;
    total: number;
    currency: string;
  };
  providerReadiness: {
    readyCount: number;
    total: number;
    checks: Array<Pick<ProviderReadinessCheck, 'key' | 'title' | 'mode' | 'ready'>>;
  };
  operations: {
    recommendedAction: OrderOperationActionKey | 'none';
    recommendation: string;
    executableNow: boolean;
    handoffRequired: boolean;
    attention: boolean;
    actionCounts: Record<OrderOperationExecutionMode, number>;
    availableActions: OrderOperationAction[];
  };
  customerSafeProjection: {
    statusHandoffStatus: OrderStatusHandoffStatus;
    statusHandoffReady: boolean;
    maskedContactAvailable: boolean;
    frontendBindingsReady: boolean;
    publicCollectionReadBlocked: boolean;
    safeBindingPaths: string[];
    maskedBindingPaths: string[];
  };
  references: {
    paymentReferencePresent: boolean;
    trackingReferencePresent: boolean;
    shippingLabelReferencePresent: boolean;
    fulfillmentReferencePresent: boolean;
    providerRefundReferencePresent: boolean;
  };
  privacy: {
    adminOperatorOnly: true;
    customerSafeFieldsOnly: true;
    includesRawCustomerContact: false;
    includesPaymentReferences: false;
    includesProviderExecutionIds: false;
    includesAddresses: false;
    includesInternalNotes: false;
    includesProviderPayloads: false;
    note: string;
  };
}
interface OrderStatusHandoffCheck {
  key: string;
  label: string;
  status: OrderStatusHandoffStatus;
  detail: string;
}
interface OrderDigitalDeliveryHandoff {
  schemaVersion: 'backy.order-digital-delivery-handoff.v1';
  itemCount: number;
  configuredItemCount: number;
  pendingItemCount: number;
  status: OrderDigitalDeliveryStatus;
  customerAction: string;
  customerSafeFieldsOnly: true;
  includesDownloadUrls: false;
  includesDownloadMediaIds: false;
}
interface OrderStatusHandoff {
  schemaVersion: 'backy.order-status-handoff.v1';
  generatedAt: string;
  source: 'admin-orders-ui' | 'admin-order-status-handoff-api' | string;
  status: OrderStatusHandoffStatus;
  score: number;
  selectedSiteId: string;
  order: {
    id: string;
    slug: string;
    orderNumber: string;
    recordStatus: ContentStatus;
    total: number;
    currency: string;
    itemCount: number;
    orderStatus: OrderWorkflowStatus;
    paymentStatus: PaymentStatus;
    fulfillmentStatus: FulfillmentStatus;
    createdAt: string;
    updatedAt: string;
  } | null;
  customer: {
    displayName: string;
    maskedEmail: string;
    maskedPhone: string;
    customerProfileLinked: boolean;
    customerProfileSlug: string;
    customerProfileStatus: string;
  } | null;
  tracking: {
    carrier: string;
    trackingNumber: string;
    trackingUrl: string;
    trackingStatus: string;
    trackingLastCheckedAt: string;
    fulfilledAt: string;
    shippingLabelStatus: ShippingLabelStatus;
    shippingLabelProvider: string;
    shippingLabelReferencePresent: boolean;
  } | null;
  refund: {
    refundAmount: number | null;
    refundReasonPresent: boolean;
    providerRefundStatus: ProviderRefundStatus;
    providerRefundProvider: string;
    providerRefundReferencePresent: boolean;
    providerRefundRequestedAt: string;
    providerRefundCompletedAt: string;
  } | null;
  digitalDelivery: OrderDigitalDeliveryHandoff | null;
  endpoints: {
    checkoutIntake: string;
    publicStatusHandoff: string;
    adminStatusHandoff: string;
    adminOrderDetail: string;
    adminTracking: string;
    adminProviderRefund: string;
  };
  frontendBindings: {
    schemaVersion: 'backy.order-status-frontend-bindings.v1';
    targetViews: string[];
    dataset: Record<string, unknown>;
    safeBindingPaths: string[];
    maskedBindingPaths: string[];
    editableRegions: Array<Record<string, unknown>>;
    actionBindings: Array<Record<string, unknown>>;
  };
  privacy: {
    publicCollectionReadBlocked: boolean;
    customerSafeFieldsOnly: boolean;
    includesRawCustomerContact: boolean;
    includesProviderExecutionIds: boolean;
    includesPaymentReferences: boolean;
    includesAddresses: boolean;
    includesInternalNotes: boolean;
    includesDigitalDeliveryUrls: boolean;
    includesDownloadMediaIds: boolean;
    excludedFields: string[];
  };
  actionPlan: OrderOperationActionPlan | null;
  operationImpact: OrderOperationImpact;
  checks: OrderStatusHandoffCheck[];
  nextSteps: string[];
}
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
  productType: string;
  digitalDeliveryConfigured: boolean;
  downloadMediaPresent: boolean;
  downloadUrlPresent: boolean;
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

const isLikelyOrderEmail = (value: string): boolean => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());

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
  { key: 'statusaccesstokenhash', label: 'Status Access Token Hash', type: 'text', required: false, unique: false, sortOrder: 78 },
  { key: 'statusaccesstokenissuedat', label: 'Status Access Token Issued At', type: 'date', required: false, unique: false, sortOrder: 79 },
  { key: 'statusaccesstokenexpiresat', label: 'Status Access Token Expires At', type: 'date', required: false, unique: false, sortOrder: 79.5 },
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
    key: 'status-handoff',
    title: 'Customer status handoff',
    methods: ['GET'],
    endpointKey: 'adminStatusHandoff',
    schemaVersion: 'backy.order-status-handoff.v1',
    cacheScope: 'private',
    detail: 'Returns a masked customer-safe order status projection without raw contact, payment, address, notes, or provider execution IDs.',
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
      'BACKY_COMMERCE_DISCOUNT_PROVIDER_URL or COMMERCE_DISCOUNT_PROVIDER_URL',
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
    family: 'Subscription lifecycle providers',
    providers: ['Stripe', 'PayPal', 'Paddle', 'Square', 'Adyen', 'Mollie', 'Razorpay', 'HTTP', 'Manual handoff'],
    gate: 'ci:commerce-provider-certification',
    requiredInputs: [
      'BACKY_STRIPE_SECRET_KEY or STRIPE_SECRET_KEY',
      'BACKY_PAYPAL_ACCESS_TOKEN or PAYPAL_ACCESS_TOKEN',
      'BACKY_PADDLE_API_KEY or PADDLE_API_KEY',
      'BACKY_SQUARE_ACCESS_TOKEN or SQUARE_ACCESS_TOKEN',
      'BACKY_ADYEN_API_KEY or ADYEN_API_KEY',
      'BACKY_MOLLIE_API_KEY or MOLLIE_API_KEY',
      'BACKY_RAZORPAY_KEY_ID/BACKY_RAZORPAY_KEY_SECRET or RAZORPAY_KEY_ID/RAZORPAY_KEY_SECRET',
      'BACKY_COMMERCE_SUBSCRIPTION_ACTION_URL or COMMERCE_SUBSCRIPTION_ACTION_URL',
    ],
    evidence: 'Live subscription order pause, resume, cancel, webhook, renewal, dunning, and cancellation evidence.',
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
const ORDER_PROVIDER_CERTIFICATION_OUTPUT_ENV = 'BACKY_COMMERCE_CERTIFICATION_OUTPUT';
const ORDER_PROVIDER_CERTIFICATION_OUTPUT_ARTIFACT = 'artifacts/backy-commerce-provider-certification.json';
const ORDER_PROVIDER_CERTIFICATION_ARTIFACT_PATH_ENV = 'BACKY_COMMERCE_CERTIFICATION_ARTIFACT_PATH';
const ORDER_PROVIDER_CERTIFICATION_ARTIFACT_REQUIRED_ENV = 'BACKY_COMMERCE_CERTIFICATION_ARTIFACT_REQUIRED';
const ORDER_PROVIDER_CERTIFICATION_ARTIFACT_DOCTOR_COMMAND =
  `${ORDER_PROVIDER_CERTIFICATION_ARTIFACT_PATH_ENV}="$${ORDER_PROVIDER_CERTIFICATION_OUTPUT_ENV}" ${ORDER_PROVIDER_CERTIFICATION_ARTIFACT_REQUIRED_ENV}=1 npm run doctor:release-certification`;
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
const ORDER_PROVIDER_CERTIFICATION_SCENARIOS = [
  {
    key: 'checkout-settlement',
    label: 'Checkout settlement',
    expectedEvidence: ['paid checkout order', 'payment provider reference', 'signed provider webhook'],
    nextAction: 'Run a live checkout and verify the private order reaches paid state with provider reference evidence.',
  },
  {
    key: 'quote-recalculation',
    label: 'Quote recalculation',
    expectedEvidence: ['tax quote', 'shipping quote', 'discount adjustment'],
    nextAction: 'Refresh a live order quote through selected tax, shipping, and discount providers.',
  },
  {
    key: 'carrier-label-tracking',
    label: 'Carrier labels and tracking',
    expectedEvidence: ['purchased label', 'void/refund result', 'tracking status'],
    nextAction: 'Purchase or import a live carrier label, void/refund when needed, and refresh tracking.',
  },
  {
    key: 'fulfillment-dispatch',
    label: 'Fulfillment dispatch',
    expectedEvidence: ['warehouse dispatch request', 'provider dispatch id', 'processing/fulfilled state'],
    nextAction: 'Dispatch a paid order through the configured warehouse or 3PL adapter.',
  },
  {
    key: 'provider-refund',
    label: 'Provider refund',
    expectedEvidence: ['provider refund id', 'refund status refresh', 'refund webhook outcome'],
    nextAction: 'Execute and refresh a live provider refund for a settled payment.',
  },
  {
    key: 'webhook-reconciliation',
    label: 'Webhook and reconciliation',
    expectedEvidence: ['commerce-webhook event', 'reconciliation run', 'idempotent repair result'],
    nextAction: 'Replay signed provider webhooks and run reconciliation against the live target.',
  },
  {
    key: 'subscription-lifecycle',
    label: 'Subscription lifecycle',
    expectedEvidence: ['renewal', 'dunning', 'pause/resume/cancel action'],
    nextAction: 'Run subscription lifecycle scenarios through the product subscription certification gate.',
  },
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
type OrderProviderCertificationEvidencePacketStatus =
  | 'no-family-selected'
  | 'needs-credentials'
  | 'needs-scenario-evidence'
  | 'evidence-complete';

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
  siteId: string;
  externalBaseUrl: string;
  includeReleaseDoctor: boolean;
};

interface OrderProviderCertificationEvidencePacket {
  schemaVersion: 'backy.order-provider-certification-evidence-packet.v1';
  generatedAt: string;
  selectedSiteId: string;
  status: OrderProviderCertificationEvidencePacketStatus;
  operatorNextAction: {
    status: OrderProviderCertificationEvidencePacketStatus;
    label: string;
    detail: string;
    command: string;
    missingFamilies: string[];
    missingScenarios: string[];
    artifactEnv: typeof ORDER_PROVIDER_CERTIFICATION_OUTPUT_ENV;
    artifactPath: typeof ORDER_PROVIDER_CERTIFICATION_OUTPUT_ARTIFACT;
  };
  selectedFamilies: string[];
  selectedProviderAliases: Record<string, string>;
  runtimeReadiness: {
    loaded: boolean;
    configuredFamilies: string[];
    missingSelectedFamilies: string[];
  };
  operatorArtifacts: Array<{
    key: string;
    family: string;
    providerAlias: string;
    status: 'ready-to-run' | 'needs-credentials';
    requiredInputs: string[];
    expectedArtifacts: string[];
    captureSource: string;
    redaction: string;
  }>;
  scenarioAttachments: Array<{
    key: string;
    label: string;
    status: 'covered' | 'missing';
    evidenceCount: number;
    expectedEvidence: string[];
    nextAction: string;
  }>;
  commandPreview: {
    command: string;
    requiredInputs: string[];
    targetInputs: string[];
  };
  target: {
    siteId: string;
    siteSelectorEnv: 'BACKY_COMMERCE_CERTIFY_SITE_ID';
    orderAnalyticsApi: string;
    publicOrderContractApi: string;
    productProviderSyncApi: string;
  };
  redactionPolicy: {
    includesProviderSecrets: false;
    includesCustomerPayloads: false;
    includesRawOrderPayloads: false;
    includesPaymentReferences: false;
    includesAddresses: false;
    includesWebhookBodies: false;
    allowedEvidence: string[];
  };
  secretHandling: string;
}

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
  siteId: 'site-demo',
  externalBaseUrl: '',
  includeReleaseDoctor: true,
} satisfies OrderProviderCertificationCommandOptions;

const quoteOrderShellValue = (value: string): string => `'${value.replace(/'/g, "'\\''")}'`;
const quoteOrderEnvTemplateValue = (value: string): string => (
  /^[A-Za-z0-9_./:@-]+$/.test(value) ? value : quoteOrderShellValue(value)
);
const orderBoolEnv = (value: boolean): '1' | '0' => (value ? '1' : '0');
const uniqueOrderCertificationInputs = (values: string[]): string[] => Array.from(new Set(values.filter(Boolean)));
const orderProviderCertificationOptionLabel = <Value extends string>(
  options: ReadonlyArray<{ readonly value: Value; readonly label: string }>,
  value: Value,
): string => options.find((option) => option.value === value)?.label || value;
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

const buildOrderProviderCertificationEnvEntries = (
  options: OrderProviderCertificationCommandOptions,
): Array<[string, string]> => {
  const selectedSelector = hasOrderProviderCertificationSelector(options);
  const externalBaseUrl = options.externalBaseUrl.trim().replace(/\/+$/, '');
  const siteId = options.siteId.trim() || 'site-demo';
  const envEntries: Array<[string, string]> = [
    ['BACKY_COMMERCE_PROVIDER_CERTIFICATION_REQUIRED', orderBoolEnv(selectedSelector)],
    ['BACKY_COMMERCE_CERTIFY_SITE_ID', siteId],
    [ORDER_PROVIDER_CERTIFICATION_OUTPUT_ENV, ORDER_PROVIDER_CERTIFICATION_OUTPUT_ARTIFACT],
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

  return envEntries;
};

const buildOrderProviderCertificationCommand = (options: OrderProviderCertificationCommandOptions): string => {
  const selectedSelector = hasOrderProviderCertificationSelector(options);
  const envEntries = buildOrderProviderCertificationEnvEntries(options);
  const commands = selectedSelector
    ? [
        'npm run ci:commerce-provider-certification',
        ...(options.includeReleaseDoctor ? [ORDER_PROVIDER_CERTIFICATION_ARTIFACT_DOCTOR_COMMAND] : []),
      ]
    : ['# Select at least one commerce provider selector before running certification.'];

  return [
    ...envEntries.map(([key, value]) => `export ${key}=${quoteOrderShellValue(value)}`),
    ...(options.includeFulfillmentEvidence ? [
      '# Configure Settings Commerce fulfillmentProvider=http and fulfillmentProviderUrl before attaching warehouse/3PL dispatch evidence.',
    ] : []),
    '',
    ...(options.includeReleaseDoctor ? ['npm run doctor:release-certification'] : []),
    ...commands,
  ].join('\n');
};

const buildOrderProviderCertificationEnvTemplate = (options: OrderProviderCertificationCommandOptions): string => {
  const envEntries = buildOrderProviderCertificationEnvEntries(options);

  return [
    '# Backy order provider certification environment',
    '# Keep real provider credential values in CI secrets or local shell variables.',
    ...envEntries.map(([key, value]) => `${key}=${quoteOrderEnvTemplateValue(value)}`),
  ].join('\n');
};

const buildOrderProviderCertificationRequiredInputs = (options: OrderProviderCertificationCommandOptions): string[] => {
  const externalBaseUrl = options.externalBaseUrl.trim();
  return uniqueOrderCertificationInputs([
    hasOrderProviderCertificationSelector(options) ? 'BACKY_COMMERCE_PROVIDER_CERTIFICATION_REQUIRED=1' : '',
    hasOrderProviderCertificationSelector(options) ? 'BACKY_COMMERCE_CERTIFY_SITE_ID' : '',
    hasOrderProviderCertificationSelector(options) ? `${ORDER_PROVIDER_CERTIFICATION_OUTPUT_ENV}=${ORDER_PROVIDER_CERTIFICATION_OUTPUT_ARTIFACT}` : '',
    hasOrderProviderCertificationSelector(options) ? `${ORDER_PROVIDER_CERTIFICATION_ARTIFACT_PATH_ENV} or BACKY_COMMERCE_CERTIFICATION_ARTIFACT` : '',
    hasOrderProviderCertificationSelector(options) ? `${ORDER_PROVIDER_CERTIFICATION_ARTIFACT_REQUIRED_ENV}=1 or BACKY_PROVIDER_CERTIFICATION_ARTIFACTS_REQUIRED=1` : '',
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
  envTemplate: buildOrderProviderCertificationEnvTemplate(DEFAULT_ORDER_PROVIDER_CERTIFICATION_COMMAND_OPTIONS),
  envTemplateSchemaVersion: 'backy.commerce-provider-certification-env-template.v1',
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
    'BACKY_COMMERCE_CERTIFY_SITE_ID',
    `${ORDER_PROVIDER_CERTIFICATION_OUTPUT_ENV}=${ORDER_PROVIDER_CERTIFICATION_OUTPUT_ARTIFACT}`,
    `${ORDER_PROVIDER_CERTIFICATION_ARTIFACT_PATH_ENV} or BACKY_COMMERCE_CERTIFICATION_ARTIFACT`,
    `${ORDER_PROVIDER_CERTIFICATION_ARTIFACT_REQUIRED_ENV}=1 or BACKY_PROVIDER_CERTIFICATION_ARTIFACTS_REQUIRED=1`,
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
  const [lineItemSubmitted, setLineItemSubmitted] = useState(false);
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
  const isOrdersMutationBusy = isSaving || isSavingCustomerProfile || isImportingOrders || isReconcilingOrders;
  const isOrdersBusy = isLoading || isOrdersMutationBusy;
  const orderImportInputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [orderFormSubmitted, setOrderFormSubmitted] = useState(false);
  const [pendingDeleteOrder, setPendingDeleteOrder] = useState<CollectionRecord | null>(null);
  const [permissionMatrix, setPermissionMatrix] = useState<AdminUserPermissionMatrix | null>(null);
  const [isPermissionsLoading, setIsPermissionsLoading] = useState(Boolean(currentAdmin?.id));
  const [permissionError, setPermissionError] = useState<string | null>(null);
  const canUseOrderRoleDefaults = isPermissionsLoading && !permissionMatrix && Boolean(currentAdmin);
  const isPermissionMatrixPending = isPermissionsLoading && !permissionMatrix && !canUseOrderRoleDefaults;
  const isOrderPermissionAllowed = (key: OrderPermissionKey) => (
    isAdminPermissionAllowed(permissionMatrix, currentAdmin, key, ORDER_PERMISSION_ROLE_DEFAULTS)
    || (canUseOrderRoleDefaults && Boolean(currentAdmin && ORDER_PERMISSION_ROLE_DEFAULTS[key].includes(currentAdmin.role)))
  );
  const canViewCommerce = isOrderPermissionAllowed('commerce.view');
  const canEditCommerce = isOrderPermissionAllowed('commerce.edit');
  const canConfigureCommerce = isOrderPermissionAllowed('commerce.configure');
  const canDeleteCommerce = isOrderPermissionAllowed('commerce.delete');
  const canViewCollections = isOrderPermissionAllowed('collections.view');
  const canEditCollections = isOrderPermissionAllowed('collections.edit');
  const canExportCollections = isOrderPermissionAllowed('collections.export');
  const canDeleteCollections = isOrderPermissionAllowed('collections.delete');
  const canEditPages = isOrderPermissionAllowed('pages.edit');
  const canViewOrders = canViewCommerce && canViewCollections;
  const canEditOrders = canEditCommerce && canEditCollections;
  const canConfigureOrders = canConfigureCommerce && canEditCollections;
  const canExportOrders = canViewCommerce && canExportCollections;
  const canDeleteOrders = canDeleteCommerce && canDeleteCollections;
  const providerCertificationHasSelectedSelector = hasOrderProviderCertificationSelector(providerCertificationCommandOptions);
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
  const isOrdersAccessBusy = isOrdersBusy;
  const orderTotalValue = Number(formState.total || 0);
  const orderNumberMissing = !formState.orderNumber.trim();
  const orderCustomerMissing = !formState.customerName.trim();
  const orderEmailMissing = !formState.email.trim();
  const orderEmailFormatInvalid = Boolean(formState.email.trim()) && !isLikelyOrderEmail(formState.email);
  const orderTotalInvalid = !Number.isFinite(orderTotalValue) || orderTotalValue <= 0;
  const orderItemsMissing = !formState.items.trim();
  const orderNumberInlineError = orderFormSubmitted && orderNumberMissing
    ? 'Add an order number so admin APIs, customer status handoff, and provider references can address this order.'
    : null;
  const orderCustomerInlineError = orderFormSubmitted && orderCustomerMissing
    ? 'Add a customer name so support, fulfillment, and private order views can identify the buyer.'
    : null;
  const orderEmailInlineError = orderFormSubmitted
    ? orderEmailMissing
      ? 'Add a customer email for receipts, status handoff, and support follow-up.'
      : orderEmailFormatInvalid
        ? 'Enter a valid customer email address.'
        : null
    : null;
  const orderTotalInlineError = orderFormSubmitted && orderTotalInvalid
    ? 'Add a positive order total before saving.'
    : null;
  const orderItemsInlineError = orderFormSubmitted && orderItemsMissing
    ? 'Add at least one line item or a raw item payload before saving.'
    : null;
  const orderRequiredFieldsInvalid = Boolean(
    orderNumberMissing ||
    orderCustomerMissing ||
    orderEmailMissing ||
    orderEmailFormatInvalid ||
    orderTotalInvalid ||
    orderItemsMissing,
  );

  const activeSite = useMemo(
    () => sites.find((site) => siteMatchesIdentifier(site, selectedSiteId)) || sites[0],
    [selectedSiteId, sites],
  );
  const activeSiteId = activeSite?.publicSiteId || activeSite?.id || selectedSiteId || 'site-demo';
  const providerCertificationTargetOptions = useMemo<OrderProviderCertificationCommandOptions>(
    () => ({ ...providerCertificationCommandOptions, siteId: activeSiteId }),
    [activeSiteId, providerCertificationCommandOptions],
  );
  const providerCertificationCommand = useMemo(
    () => buildOrderProviderCertificationCommand(providerCertificationTargetOptions),
    [providerCertificationTargetOptions],
  );
  const providerCertificationEnvTemplate = useMemo(
    () => buildOrderProviderCertificationEnvTemplate(providerCertificationTargetOptions),
    [providerCertificationTargetOptions],
  );
  const providerCertificationRequiredInputs = useMemo(
    () => buildOrderProviderCertificationRequiredInputs(providerCertificationTargetOptions),
    [providerCertificationTargetOptions],
  );
  const activeSiteSearch = useMemo(() => ({ siteId: activeSiteId }), [activeSiteId]);
  const publicBaseUrl = useMemo(() => getPublicBaseUrl(), []);
  const adminOrdersApiUrl = ordersCollection
    ? `${publicBaseUrl}/api/admin/sites/${encodeURIComponent(activeSiteId)}/collections/${encodeURIComponent(ordersCollection.id)}/records`
    : '';
  const adminOrderOperationsApiUrl = `${publicBaseUrl}/api/admin/sites/${encodeURIComponent(activeSiteId)}/commerce/orders`;
  const adminOrderDetailApiUrl = ordersCollection
    ? `${publicBaseUrl}/api/admin/sites/${encodeURIComponent(activeSiteId)}/collections/${encodeURIComponent(ordersCollection.id)}/records/{orderId}`
    : '';
  const adminOrderStatusHandoffApiUrl = `${publicBaseUrl}/api/admin/sites/${encodeURIComponent(activeSiteId)}/commerce/orders/{orderId}/status-handoff`;
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
  const itemDraftTitleMissing = !itemDraft.title.trim();
  const itemDraftQuantity = Number(itemDraft.quantity.trim() || 1);
  const itemDraftPrice = Number(itemDraft.price.trim() || 0);
  const itemDraftQuantityInvalid = !Number.isFinite(itemDraftQuantity) || itemDraftQuantity < 1 || !Number.isInteger(itemDraftQuantity);
  const itemDraftPriceInvalid = !Number.isFinite(itemDraftPrice) || itemDraftPrice < 0;
  const lineItemTitleInlineError = lineItemSubmitted && itemDraftTitleMissing
    ? 'Add a line item title before adding it to the order.'
    : null;
  const lineItemQuantityInlineError = lineItemSubmitted && itemDraftQuantityInvalid
    ? 'Use a whole-number quantity of at least 1.'
    : null;
  const lineItemPriceInlineError = lineItemSubmitted && itemDraftPriceInvalid
    ? 'Use a line item price of 0 or more.'
    : null;
  const lineItemDraftInvalid = Boolean(itemDraftTitleMissing || itemDraftQuantityInvalid || itemDraftPriceInvalid);
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
  const ordersBulkActionStatusId = 'orders-bulk-action-status';
  const selectedOrderActionLabel = `${selectedLoadedOrders.length} selected order${selectedLoadedOrders.length === 1 ? '' : 's'}`;
  const visibleOrderActionLabel = `${filteredOrders.length} visible order${filteredOrders.length === 1 ? '' : 's'}`;
  const ordersBulkBusyDisabledReason = isOrdersAccessBusy ? 'Order queue is busy.' : '';
  const ordersBulkEditDisabledReason = !canEditOrders
    ? editPermissionTitle || 'Your account cannot edit orders.'
    : '';
  const ordersBulkSelectionDisabledReason = filteredOrders.length === 0
    ? 'No visible orders to select.'
    : ordersBulkBusyDisabledReason || ordersBulkEditDisabledReason;
  const ordersBulkNoSelectionDisabledReason = selectedLoadedOrders.length === 0
    ? 'Select one or more loaded orders first.'
    : '';
  const ordersBulkWorkflowDisabledReason = ordersBulkNoSelectionDisabledReason ||
    ordersBulkBusyDisabledReason ||
    ordersBulkEditDisabledReason;
  const ordersBulkClearDisabledReason = ordersBulkNoSelectionDisabledReason ||
    ordersBulkBusyDisabledReason ||
    ordersBulkEditDisabledReason;
  const ordersBulkActionStatus = [
    ordersBulkSelectionDisabledReason ? `Select visible unavailable: ${ordersBulkSelectionDisabledReason}` : `Select visible available for ${visibleOrderActionLabel}.`,
    ordersBulkWorkflowDisabledReason ? `Mark paid selected unavailable: ${ordersBulkWorkflowDisabledReason}` : `Mark paid selected available for ${selectedOrderActionLabel}.`,
    ordersBulkWorkflowDisabledReason ? `Processing selected unavailable: ${ordersBulkWorkflowDisabledReason}` : `Processing selected available for ${selectedOrderActionLabel}.`,
    ordersBulkWorkflowDisabledReason ? `Fulfill selected unavailable: ${ordersBulkWorkflowDisabledReason}` : `Fulfill selected available for ${selectedOrderActionLabel}.`,
    ordersBulkWorkflowDisabledReason ? `Record cancel selected unavailable: ${ordersBulkWorkflowDisabledReason}` : `Record cancel selected available for ${selectedOrderActionLabel}.`,
    ordersBulkClearDisabledReason ? `Clear selection unavailable: ${ordersBulkClearDisabledReason}` : `Clear selection available for ${selectedOrderActionLabel}.`,
  ].join(' ');
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
  const providerReadinessChecks = useMemo<ProviderReadinessCheck[]>(() => {
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
  const providerReadinessByKey = useMemo(() => new Map(providerReadinessChecks.map((check) => [check.key, check])), [providerReadinessChecks]);
  const orderOperationPlans = useMemo(() => new Map(
    orders.map((order) => [order.id, buildOrderOperationActionPlan(order, providerReadinessByKey)]),
  ), [orders, providerReadinessByKey]);
  const orderOperationPlanSummary = useMemo(() => {
    const plans = Array.from(orderOperationPlans.values());
    return {
      schemaVersion: 'backy.order-operation-action-plan-summary.v1',
      total: plans.length,
      attentionRequired: plans.filter((plan) => plan.attention).length,
      executableNow: plans.filter((plan) => plan.executableNow).length,
      handoffRequired: plans.filter((plan) => plan.handoffRequired).length,
      blockedActions: plans.reduce((sum, plan) => sum + plan.availableActions.filter((action) => !action.enabled).length, 0),
    };
  }, [orderOperationPlans]);
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
  const orderProviderCertificationEvidence = useMemo(() => {
    const countOrdersMatching = (predicate: (order: CollectionRecord) => boolean) => orders.filter(predicate).length;
    const hasOrderValue = (order: CollectionRecord, key: string) => Boolean(String(readOrderValue(order.values, key, '') || '').trim());
    const normalizedOrderValue = (order: CollectionRecord, key: string, fallback = '') => String(readOrderValue(order.values, key, fallback) || fallback).trim().toLowerCase();
    const providerStatusCount = (items?: Array<{ statuses: Record<string, number> }>) => (
      items || []
    ).reduce((sum, item) => sum + Object.values(item.statuses || {}).reduce((innerSum, value) => innerSum + value, 0), 0);
    const analyticsOperations = orderAnalytics?.operations;
    const checkoutSettlementCount = Math.max(
      analyticsOperations?.checkoutOrderCount ?? 0,
      orderAnalytics?.payment?.paid?.count ?? 0,
      countOrdersMatching((order) => (
        normalizedOrderValue(order, 'paymentstatus') === 'paid' &&
        (normalizedOrderValue(order, 'ordersource') === 'web' || hasOrderValue(order, 'checkoutsessionid'))
      )),
    );
    const quoteRecalculationCount = countOrdersMatching((order) => (
      toNumber(readOrderValue(order.values, 'taxamount', 0)) > 0 ||
      toNumber(readOrderValue(order.values, 'shippingamount', 0)) > 0 ||
      toNumber(readOrderValue(order.values, 'discountamount', 0)) > 0
    ));
    const carrierEvidenceCount = countOrdersMatching((order) => {
      const labelStatus = normalizedOrderValue(order, 'shippinglabelstatus', 'none');
      return labelStatus !== 'none' || hasOrderValue(order, 'trackingnumber') || hasOrderValue(order, 'trackingstatus');
    }) + (analyticsOperations?.shippingLabelIssueCount ?? 0);
    const fulfillmentEvidenceCount = countOrdersMatching((order) => {
      const fulfillmentStatus = normalizedOrderValue(order, 'fulfillmentstatus', 'unfulfilled');
      const dispatchStatus = normalizedOrderValue(order, 'fulfillmentdispatchstatus', 'none');
      return ['processing', 'fulfilled'].includes(fulfillmentStatus) || dispatchStatus !== 'none';
    }) + (analyticsOperations?.fulfillmentDispatchPendingCount ?? 0) + (analyticsOperations?.fulfillmentDispatchFailureCount ?? 0);
    const providerRefundEvidenceCount = countOrdersMatching((order) => (
      normalizedOrderValue(order, 'providerrefundstatus', 'none') !== 'none' ||
      normalizedOrderValue(order, 'paymentstatus') === 'refunded' ||
      toNumber(readOrderValue(order.values, 'refundamount', 0)) > 0
    )) + providerStatusCount(orderAnalytics?.providerOperations?.refundProviders);
    const webhookReconciliationEvidenceCount = countOrdersMatching((order) => (
      String(readOrderValue(order.values, 'providerrefundpayload', '') || '').toLowerCase().includes('webhook') ||
      String(readOrderValue(order.values, 'notes', '') || '').toLowerCase().includes('webhook')
    )) + (reconciliationResult?.eventCount ?? 0);
    const subscriptionEvidenceCount = (
      (analyticsOperations?.subscriptionRenewalCount ?? 0) +
      (analyticsOperations?.subscriptionDunningCount ?? 0) +
      (analyticsOperations?.subscriptionPausedCount ?? 0) +
      (analyticsOperations?.subscriptionResumedCount ?? 0) +
      (analyticsOperations?.subscriptionTrialEndingCount ?? 0) +
      (analyticsOperations?.subscriptionCancelledCount ?? 0)
    );
    const evidenceCounts: Record<string, number> = {
      'checkout-settlement': checkoutSettlementCount,
      'quote-recalculation': quoteRecalculationCount,
      'carrier-label-tracking': carrierEvidenceCount,
      'fulfillment-dispatch': fulfillmentEvidenceCount,
      'provider-refund': providerRefundEvidenceCount,
      'webhook-reconciliation': webhookReconciliationEvidenceCount,
      'subscription-lifecycle': subscriptionEvidenceCount,
    };
    const scenarios = ORDER_PROVIDER_CERTIFICATION_SCENARIOS.map((scenario) => {
      const evidenceCount = evidenceCounts[scenario.key] || 0;
      return {
        ...scenario,
        evidenceCount,
        status: evidenceCount > 0 ? 'covered' as const : 'missing' as const,
      };
    });
    const covered = scenarios.filter((scenario) => scenario.status === 'covered').length;

    return {
      schemaVersion: 'backy.order-provider-certification-evidence.v1',
      status: covered === scenarios.length ? 'ready' as const : 'attention' as const,
      requiredGate: ORDER_PROVIDER_CERTIFICATION_OPERATOR_GATE,
      coverage: {
        covered,
        total: scenarios.length,
        missing: scenarios.filter((scenario) => scenario.status === 'missing').map((scenario) => scenario.key),
      },
      scenarios,
      secretHandling: 'Order certification evidence reports scenario names, counts, gates, and non-secret provider families only; provider secrets, customer payloads, and raw order values stay private.',
    };
  }, [orderAnalytics, orders, reconciliationResult?.eventCount]);
  const providerCertificationEvidencePacket = useMemo<OrderProviderCertificationEvidencePacket>(() => {
    const selectedReadiness = (key: string) => providerReadinessByKey.get(key);
    const familyArtifacts = [
      {
        key: 'payment-refunds',
        family: 'Payment settlement and refunds',
        selected: providerCertificationCommandOptions.certifyPayment,
        readiness: selectedReadiness('payment-refund-providers') || selectedReadiness('stripe-checkout-refund'),
        providerAlias: orderProviderCertificationOptionLabel(
          ORDER_PROVIDER_CERTIFICATION_PAYMENT_PROVIDER_OPTIONS,
          providerCertificationCommandOptions.paymentProvider,
        ),
        requiredInputs: ORDER_PROVIDER_CERTIFICATION_PAYMENT_INPUTS[providerCertificationCommandOptions.paymentProvider],
        expectedArtifacts: [
          'paid checkout order id',
          'payment provider alias',
          'refund provider id or handoff id',
          'provider refund refresh or webhook outcome',
        ],
        captureSource: 'public checkout intake, private order record, provider-refund endpoint, and signed refund webhook readback',
      },
      {
        key: 'tax-quotes',
        family: 'Tax quotes',
        selected: providerCertificationCommandOptions.certifyTax,
        readiness: selectedReadiness('tax-quote'),
        providerAlias: orderProviderCertificationOptionLabel(
          ORDER_PROVIDER_CERTIFICATION_TAX_PROVIDER_OPTIONS,
          providerCertificationCommandOptions.taxProvider,
        ),
        requiredInputs: ORDER_PROVIDER_CERTIFICATION_TAX_INPUTS[providerCertificationCommandOptions.taxProvider],
        expectedArtifacts: [
          'tax provider alias',
          'quote request target',
          'returned tax amount',
          'persisted order tax total',
        ],
        captureSource: 'order quote POST/GET response and private order totals',
      },
      {
        key: 'shipping-labels',
        family: 'Shipping quotes, labels, and tracking',
        selected: providerCertificationCommandOptions.certifyShipping,
        readiness: selectedReadiness('carrier-labels') || selectedReadiness('shipping-quote'),
        providerAlias: orderProviderCertificationOptionLabel(
          ORDER_PROVIDER_CERTIFICATION_SHIPPING_PROVIDER_OPTIONS,
          providerCertificationCommandOptions.shippingProvider,
        ),
        requiredInputs: ORDER_PROVIDER_CERTIFICATION_SHIPPING_INPUTS[providerCertificationCommandOptions.shippingProvider],
        expectedArtifacts: [
          'shipping provider alias',
          'label id or handoff id',
          'void/refund result',
          'tracking status readback',
        ],
        captureSource: 'shipping-label endpoint, tracking endpoint, and order shipping-label fields',
      },
      {
        key: 'discount-quotes',
        family: 'Discount quotes',
        selected: providerCertificationCommandOptions.certifyDiscount,
        readiness: selectedReadiness('discount-quote'),
        providerAlias: orderProviderCertificationOptionLabel(
          ORDER_PROVIDER_CERTIFICATION_DISCOUNT_PROVIDER_OPTIONS,
          providerCertificationCommandOptions.discountProvider,
        ),
        requiredInputs: ORDER_PROVIDER_CERTIFICATION_DISCOUNT_INPUTS[providerCertificationCommandOptions.discountProvider],
        expectedArtifacts: [
          'promotion or coupon code',
          'discount provider alias',
          'returned discount amount',
          'persisted order discount total',
        ],
        captureSource: 'order quote response and private order discount fields',
      },
      {
        key: 'fulfillment-dispatch',
        family: 'Fulfillment dispatch',
        selected: providerCertificationCommandOptions.includeFulfillmentEvidence,
        readiness: selectedReadiness('fulfillment-dispatch'),
        providerAlias: 'Settings fulfillment provider',
        requiredInputs: ['Settings commerce fulfillmentProvider=http plus fulfillmentProviderUrl'],
        expectedArtifacts: [
          'warehouse or 3PL endpoint alias',
          'dispatch request id',
          'processing or fulfilled order state',
          'fulfillment GET endpoint readback',
        ],
        captureSource: 'fulfillment endpoint response and private order fulfillment fields',
      },
      {
        key: 'subscription-lifecycle',
        family: 'Subscription lifecycle',
        selected: providerCertificationCommandOptions.certifySubscriptions,
        readiness: selectedReadiness('payment-refund-providers'),
        providerAlias: orderProviderCertificationOptionLabel(
          ORDER_PROVIDER_CERTIFICATION_SUBSCRIPTION_PROVIDER_OPTIONS,
          providerCertificationCommandOptions.subscriptionProvider,
        ),
        requiredInputs: ORDER_PROVIDER_CERTIFICATION_SUBSCRIPTION_INPUTS[providerCertificationCommandOptions.subscriptionProvider],
        expectedArtifacts: [
          'subscription renewal event',
          'dunning event',
          'pause/resume/cancel action result',
          'product lifecycle coverage summary',
        ],
        captureSource: 'product subscription lifecycle endpoint, order analytics, and signed subscription webhook readback',
      },
      {
        key: 'webhook-reconciliation',
        family: 'Webhooks and reconciliation',
        selected: providerCertificationCommandOptions.certifyWebhooks,
        readiness: selectedReadiness('webhook-settlement') || selectedReadiness('scheduled-reconciliation'),
        providerAlias: orderProviderCertificationOptionLabel(
          ORDER_PROVIDER_CERTIFICATION_WEBHOOK_PROVIDER_OPTIONS,
          providerCertificationCommandOptions.webhookProvider,
        ),
        requiredInputs: ORDER_PROVIDER_CERTIFICATION_WEBHOOK_INPUTS[providerCertificationCommandOptions.webhookProvider],
        expectedArtifacts: [
          'signed webhook event name',
          'idempotent order update result',
          'reconciliation run id or event count',
          'platform reconciliation endpoint readback',
        ],
        captureSource: 'commerce webhook response, commerce-order events, and reconciliation endpoints',
      },
    ];
    const selectedArtifacts = familyArtifacts.filter((artifact) => artifact.selected);
    const missingSelectedFamilies = selectedArtifacts
      .filter((artifact) => !artifact.readiness?.ready)
      .map((artifact) => artifact.key);
    const status: OrderProviderCertificationEvidencePacketStatus = selectedArtifacts.length === 0
      ? 'no-family-selected'
      : missingSelectedFamilies.length > 0
        ? 'needs-credentials'
        : orderProviderCertificationEvidence.status === 'ready'
          ? 'evidence-complete'
          : 'needs-scenario-evidence';
    const missingScenarios = orderProviderCertificationEvidence.coverage.missing;
    const operatorNextAction = status === 'no-family-selected'
      ? {
          label: 'Select live order provider families',
          detail: 'Choose payment/refunds, tax, shipping, discount, fulfillment, subscription, or webhook families before copying the guarded certification command.',
          command: '# Select at least one commerce provider selector before running certification.',
        }
      : status === 'needs-credentials'
        ? {
            label: 'Configure order provider credentials',
            detail: missingSelectedFamilies.length > 0
              ? `Populate runtime aliases for selected order families: ${missingSelectedFamilies.join(', ')}.`
              : 'Load runtime Settings/CI environment aliases so Backy can prove order-operation provider readiness.',
            command: 'npm run doctor:release-certification && npm run ci:commerce-provider-certification',
          }
        : status === 'needs-scenario-evidence'
          ? {
              label: 'Attach live order evidence',
              detail: missingScenarios.length > 0
                ? `Capture redacted evidence for: ${missingScenarios.join(', ')}.`
                : 'Run the selected live order-provider scenarios and attach the redacted packet.',
              command: 'npm run ci:commerce-provider-certification',
            }
          : {
              label: 'Attach certification artifact',
              detail: `Store the redacted artifact at ${ORDER_PROVIDER_CERTIFICATION_OUTPUT_ARTIFACT} and expose it through ${ORDER_PROVIDER_CERTIFICATION_OUTPUT_ENV}.`,
              command: ORDER_PROVIDER_CERTIFICATION_ARTIFACT_DOCTOR_COMMAND,
            };

    return {
      schemaVersion: 'backy.order-provider-certification-evidence-packet.v1',
      generatedAt: new Date().toISOString(),
      selectedSiteId: activeSiteId,
      status,
      operatorNextAction: {
        status,
        ...operatorNextAction,
        missingFamilies: missingSelectedFamilies,
        missingScenarios,
        artifactEnv: ORDER_PROVIDER_CERTIFICATION_OUTPUT_ENV,
        artifactPath: ORDER_PROVIDER_CERTIFICATION_OUTPUT_ARTIFACT,
      },
      selectedFamilies: selectedArtifacts.map((artifact) => artifact.key),
      selectedProviderAliases: Object.fromEntries(selectedArtifacts.map((artifact) => [
        artifact.key,
        artifact.providerAlias,
      ])),
      runtimeReadiness: {
        loaded: Boolean(runtimeCommerce || commerceSettings || providerReadinessChecks.length > 0),
        configuredFamilies: providerRuntimeEvidence.configuredFamilies,
        missingSelectedFamilies,
      },
      operatorArtifacts: selectedArtifacts.map((artifact) => ({
        key: artifact.key,
        family: artifact.family,
        providerAlias: artifact.providerAlias,
        status: artifact.readiness?.ready ? 'ready-to-run' : 'needs-credentials',
        requiredInputs: artifact.requiredInputs,
        expectedArtifacts: artifact.expectedArtifacts,
        captureSource: artifact.captureSource,
        redaction: 'Attach ids, timestamps, event names, totals, and status codes only; remove provider secrets, customer payloads, raw order payloads, addresses, payment references, and webhook bodies.',
      })),
      scenarioAttachments: orderProviderCertificationEvidence.scenarios.map((scenario) => ({
        key: scenario.key,
        label: scenario.label,
        status: scenario.status,
        evidenceCount: scenario.evidenceCount,
        expectedEvidence: [...scenario.expectedEvidence],
        nextAction: scenario.nextAction,
      })),
      commandPreview: {
        command: providerCertificationCommand,
        requiredInputs: providerCertificationRequiredInputs,
        targetInputs: ORDER_PROVIDER_CERTIFICATION_OPERATOR_COMMAND_TEMPLATE.targetInputs,
      },
      target: {
        siteId: activeSiteId,
        siteSelectorEnv: 'BACKY_COMMERCE_CERTIFY_SITE_ID',
        orderAnalyticsApi: `/api/admin/sites/${activeSiteId}/commerce/orders/analytics`,
        publicOrderContractApi: `/api/sites/${activeSiteId}/commerce/orders`,
        productProviderSyncApi: `/api/admin/sites/${activeSiteId}/commerce/products/{productId}/provider-sync`,
      },
      redactionPolicy: {
        includesProviderSecrets: false,
        includesCustomerPayloads: false,
        includesRawOrderPayloads: false,
        includesPaymentReferences: false,
        includesAddresses: false,
        includesWebhookBodies: false,
        allowedEvidence: [
          'provider ids and aliases',
          'timestamped CI/preflight logs',
          'quote totals and adjustment names',
          'label, tracking, fulfillment, and refund statuses',
          'webhook event names and accepted status codes',
          'reconciliation event counts and run modes',
          'scenario counts and coverage state',
        ],
      },
      secretHandling: 'Redacted operator attachment manifest only; provider credentials, raw customer data, raw order payloads, payment references, addresses, and webhook bodies stay out of copied JSON.',
    };
  }, [
    activeSiteId,
    commerceSettings,
    orderProviderCertificationEvidence.scenarios,
    orderProviderCertificationEvidence.status,
    orderProviderCertificationEvidence.coverage.missing,
    providerCertificationCommand,
    providerCertificationCommandOptions.certifyDiscount,
    providerCertificationCommandOptions.certifyPayment,
    providerCertificationCommandOptions.certifyShipping,
    providerCertificationCommandOptions.certifySubscriptions,
    providerCertificationCommandOptions.certifyTax,
    providerCertificationCommandOptions.certifyWebhooks,
    providerCertificationCommandOptions.discountProvider,
    providerCertificationCommandOptions.includeFulfillmentEvidence,
    providerCertificationCommandOptions.paymentProvider,
    providerCertificationCommandOptions.shippingProvider,
    providerCertificationCommandOptions.subscriptionProvider,
    providerCertificationCommandOptions.taxProvider,
    providerCertificationCommandOptions.webhookProvider,
    providerCertificationRequiredInputs,
    providerReadinessByKey,
    providerReadinessChecks.length,
    providerRuntimeEvidence.configuredFamilies,
    runtimeCommerce,
  ]);
  const providerCertificationSelectedFamilySummary = providerCertificationEvidencePacket.selectedFamilies.length > 0
    ? providerCertificationEvidencePacket.selectedFamilies.join(', ')
    : 'Select payment/refunds, tax, shipping, discount, fulfillment, subscription, or webhook families.';
  const providerCertificationRuntimeGapDetail = providerCertificationEvidencePacket.runtimeReadiness.missingSelectedFamilies.length > 0
    ? `Selected gaps: ${providerCertificationEvidencePacket.runtimeReadiness.missingSelectedFamilies.join(', ')}`
    : providerRuntimeEvidence.missingFamilies.length > 0
      ? `Unconfigured families: ${providerRuntimeEvidence.missingFamilies.slice(0, 5).join(', ')}`
      : 'No runtime credential gaps detected for order-operation families.';
  const providerCertificationReadinessItems = [
    {
      label: 'Selected families',
      value: String(providerCertificationEvidencePacket.selectedFamilies.length),
      detail: providerCertificationSelectedFamilySummary,
    },
    {
      label: 'Runtime credentials',
      value: `${providerRuntimeEvidence.readyCount}/${providerRuntimeEvidence.total} ready`,
      detail: providerCertificationRuntimeGapDetail,
    },
    {
      label: 'Scenario coverage',
      value: `${orderProviderCertificationEvidence.coverage.covered}/${orderProviderCertificationEvidence.coverage.total}`,
      detail: orderProviderCertificationEvidence.coverage.missing.length > 0
        ? `Missing: ${orderProviderCertificationEvidence.coverage.missing.join(', ')}`
        : 'All order provider scenarios have evidence hooks.',
    },
    {
      label: 'Artifact output',
      value: ORDER_PROVIDER_CERTIFICATION_OUTPUT_ENV,
      detail: ORDER_PROVIDER_CERTIFICATION_OUTPUT_ARTIFACT,
    },
    {
      label: 'Gate command',
      value: 'ci:commerce-provider-certification',
      detail: 'Run npm run ci:commerce-provider-certification after live env aliases are populated.',
    },
    {
      label: 'Required site selector',
      value: 'BACKY_COMMERCE_CERTIFY_SITE_ID',
      detail: activeSiteId,
    },
  ];
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
      envTemplate: providerCertificationEnvTemplate,
      requiredInputs: providerCertificationRequiredInputs,
    },
    operatorEnvTemplate: {
      schemaVersion: 'backy.commerce-provider-certification-env-template.v1',
      format: 'shell-env',
      fileName: '.env.backy-commerce-provider-certification',
      body: providerCertificationEnvTemplate,
      secretHandling: 'Generated template values are non-secret selectors and placeholders; replace placeholders with CI secrets or local shell values before execution.',
    },
    preflightGates: [...ORDER_PROVIDER_CERTIFICATION_PREFLIGHT_GATES],
    providerSelectors: [...ORDER_PROVIDER_CERTIFICATION_SELECTORS],
    evidenceExpectations: [...ORDER_PROVIDER_CERTIFICATION_EVIDENCE_EXPECTATIONS],
    operatorEvidencePacket: providerCertificationEvidencePacket,
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
      statusHandoff: adminOrderStatusHandoffApiUrl,
      quote: `${adminOrderOperationsApiUrl}/{orderId}/quote`,
      shippingLabel: `${adminOrderOperationsApiUrl}/{orderId}/shipping-label`,
      fulfillment: `${adminOrderOperationsApiUrl}/{orderId}/fulfillment`,
      tracking: `${adminOrderOperationsApiUrl}/{orderId}/tracking`,
      providerRefund: `${adminOrderOperationsApiUrl}/{orderId}/provider-refund`,
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
    operationActionPlan: orderOperationPlanSummary,
    certificationEvidence: orderProviderCertificationEvidence,
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
    adminOrderOperationsApiUrl,
    adminOrderStatusHandoffApiUrl,
    adminOrdersApiUrl,
    filteredOrders.length,
    loadedOrderCount,
    metrics,
    missingOrderFields,
    orderAnalytics?.providerOperations,
    orderReadiness.score,
    providerCertificationEvidencePacket,
    orderProviderCertificationEvidence,
    orderOperationPlanSummary,
    ordersApiReady,
    providerCertificationCommand,
    providerCertificationEnvTemplate,
    providerCertificationRequiredInputs,
    providerReadinessChecks,
    providerReadinessReadyCount,
    providerRuntimeEvidence,
    publicBaseUrl,
    publicOrderIntakeUrl,
    runtimeCommerce,
    totalOrderCount,
  ]);
  const selectedOrderStatusHandoff = useMemo<OrderStatusHandoff>(() => buildOrderStatusHandoff({
    activeSiteId,
    adminOrderDetailApiUrl,
    adminOrderOperationsApiUrl,
    adminOrderStatusHandoffApiUrl,
    publicOrderIntakeUrl,
    order: selectedOrder,
    customerProfile: linkedCustomerProfile,
    orderOperationPlan: selectedOrder ? orderOperationPlans.get(selectedOrder.id) || null : null,
    providerReadinessChecks,
    ordersApiReady,
  }), [
    activeSiteId,
    adminOrderDetailApiUrl,
    adminOrderOperationsApiUrl,
    adminOrderStatusHandoffApiUrl,
    linkedCustomerProfile,
    orderOperationPlans,
    ordersApiReady,
    providerReadinessChecks,
    publicOrderIntakeUrl,
    selectedOrder,
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
      adminQuote: `${adminOrderOperationsApiUrl}/{orderId}/quote`,
      adminShippingLabel: `${adminOrderOperationsApiUrl}/{orderId}/shipping-label`,
      adminFulfillment: `${adminOrderOperationsApiUrl}/{orderId}/fulfillment`,
      adminTracking: `${adminOrderOperationsApiUrl}/{orderId}/tracking`,
      adminProviderRefund: `${adminOrderOperationsApiUrl}/{orderId}/provider-refund`,
      adminStatusHandoff: adminOrderStatusHandoffApiUrl,
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
          statusHandoff: adminOrderStatusHandoffApiUrl,
          quote: `${adminOrderOperationsApiUrl}/{orderId}/quote`,
          shippingLabel: `${adminOrderOperationsApiUrl}/{orderId}/shipping-label`,
          fulfillment: `${adminOrderOperationsApiUrl}/{orderId}/fulfillment`,
          tracking: `${adminOrderOperationsApiUrl}/{orderId}/tracking`,
          providerRefund: `${adminOrderOperationsApiUrl}/{orderId}/provider-refund`,
          commerceWebhook: `${publicBaseUrl}/api/sites/${encodeURIComponent(activeSiteId)}/commerce/webhook`,
          siteReconciliation: `${publicBaseUrl}/api/admin/sites/${encodeURIComponent(activeSiteId)}/commerce/reconcile`,
          platformReconciliation: `${publicBaseUrl}/api/admin/commerce/reconcile`,
          reconciliationReadiness: `${publicBaseUrl}/api/admin/commerce/reconcile/readiness`,
        }[contract.key === 'analytics'
          ? 'analytics'
          : contract.key === 'status-handoff'
            ? 'statusHandoff'
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
    operationActionPlan: orderOperationPlanSummary,
    providerReadiness: {
      loaded: Boolean(commerceSettings || runtimeCommerce),
      readyCount: providerReadinessReadyCount,
      total: providerReadinessChecks.length,
      runtimeCommerce,
      checks: providerReadinessChecks,
    },
    providerCertification: providerCertificationSummary,
    selectedOrderStatusHandoff,
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
      actionPlan: orderOperationPlans.get(order.id) || null,
    })),
  }), [
    activeSite?.name,
    activeSite?.slug,
    activeSite?.status,
    activeSiteId,
    adminOrderOperationsApiUrl,
    adminOrderDetailApiUrl,
    adminOrderStatusHandoffApiUrl,
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
    orderOperationPlanSummary,
    orderOperationPlans,
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
    selectedOrderStatusHandoff,
    sourceFilter,
    totalOrderCount,
  ]);
  const orderHandoffText = useMemo(() => JSON.stringify(orderHandoff, null, 2), [orderHandoff]);
  const selectedOrderStatusHandoffText = useMemo(() => JSON.stringify(selectedOrderStatusHandoff, null, 2), [selectedOrderStatusHandoff]);
  const selectedOrderOperationImpactText = useMemo(() => JSON.stringify(selectedOrderStatusHandoff.operationImpact, null, 2), [selectedOrderStatusHandoff]);
  const providerCertificationHandoffText = useMemo(() => JSON.stringify(providerCertificationSummary, null, 2), [providerCertificationSummary]);
  const providerCertificationEvidencePacketText = useMemo(
    () => JSON.stringify(providerCertificationEvidencePacket, null, 2),
    [providerCertificationEvidencePacket],
  );
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
    setOrderFormSubmitted(false);
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
    setOrderFormSubmitted(false);
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
    setLineItemSubmitted(true);
    if (isOrdersBusy) return;
    if (!canEditOrders) return;

    const title = itemDraft.title.trim();
    if (lineItemDraftInvalid) {
      setError('Fix line item fields before adding.');
      return;
    }

    if (orderLineItems.length >= 100) {
      setError('Orders can include up to 100 line items.');
      return;
    }

    const quantity = itemDraftQuantity;
    const price = itemDraftPrice;
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
      productType: '',
      digitalDeliveryConfigured: false,
      downloadMediaPresent: false,
      downloadUrlPresent: false,
    };

    setLineItems([...orderLineItems, lineItem]);
    setItemDraft({
      title: '',
      sku: '',
      variant: '',
      quantity: '1',
      price: '',
    });
    setLineItemSubmitted(false);
    setError(null);
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
      const synced = await syncOrdersCollectionForOperations(ordersCollection);
      setOrdersCollection(synced);
      setNotice('Order schema synced. Payment, fulfillment, tracking, refund, and address fields are now available.');
    } catch (syncError) {
      setError(syncError instanceof Error ? syncError.message : 'Unable to sync order schema');
    } finally {
      setIsSaving(false);
    }
  };

  const syncOrdersCollectionForOperations = async (collection: Collection): Promise<Collection> => {
    const needsSync = (
      collection.status !== 'published' ||
      !isOrderCollectionPrivate(collection) ||
      getMissingOrderFieldKeys(collection).length > 0
    );

    if (!needsSync) return collection;

    return updateCollection(activeSiteId, collection.id, {
      name: collection.name || 'Orders',
      slug: ORDERS_COLLECTION_SLUG,
      description: collection.description || 'Commerce orders for storefronts, custom checkout flows, and fulfillment dashboards.',
      status: 'published',
      listRoutePattern: collection.listRoutePattern || '/orders',
      routePattern: collection.routePattern || '/orders/:recordSlug',
      fields: mergeOrderFields(collection.fields),
      permissions: {
        ...collection.permissions,
        publicRead: false,
        publicCreate: false,
        publicUpdate: false,
        publicDelete: false,
      },
    });
  };

  const saveOrder = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!ordersCollection) return;
    if (isOrdersBusy) return;
    if (!canEditOrders) {
      setError(editPermissionTitle || 'Your account cannot save orders.');
      return;
    }

    setOrderFormSubmitted(true);

    if (orderRequiredFieldsInvalid) {
      setError('Fix required order fields before saving.');
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
      setOrderFormSubmitted(false);
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
    if (isOrdersMutationBusy) return;
    if (!canConfigureOrders) {
      setError(configurePermissionTitle || 'Your account cannot reconcile commerce orders.');
      return;
    }

    setIsReconcilingOrders(true);
    setError(null);
    setNotice(null);

    try {
      const operationCollection = await syncOrdersCollectionForOperations(ordersCollection);
      if (operationCollection !== ordersCollection) {
        setOrdersCollection(operationCollection);
      }
      const result = await reconcileCommerceOrders(activeSiteId, 100);
      setReconciliationResult(result);
      const refreshed = await listCollectionRecords(activeSiteId, operationCollection.id, {
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

  const copySelectedOrderStatusHandoff = async () => {
    if (isOrdersBusy) return;
    if (!canExportOrders) {
      setError(exportPermissionTitle || 'Your account cannot export order data.');
      return;
    }

    try {
      await navigator.clipboard.writeText(selectedOrderStatusHandoffText);
      setNotice('Order status handoff copied.');
    } catch {
      setNotice(selectedOrderStatusHandoffText);
    }
  };

  const copySelectedOrderOperationImpact = async () => {
    if (isOrdersBusy) return;
    if (!canExportOrders) {
      setError(exportPermissionTitle || 'Your account cannot export order data.');
      return;
    }

    try {
      await navigator.clipboard.writeText(selectedOrderOperationImpactText);
      setNotice('Order operation impact copied.');
    } catch {
      setNotice(selectedOrderOperationImpactText);
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

  const copyProviderCertificationEnvTemplate = async () => {
    if (isOrdersBusy) return;
    if (!canExportOrders) {
      setError(exportPermissionTitle || 'Your account cannot export order data.');
      return;
    }

    try {
      await navigator.clipboard.writeText(providerCertificationEnvTemplate);
      setNotice('Orders provider certification env template copied.');
    } catch {
      setNotice(providerCertificationEnvTemplate);
    }
  };

  const copyProviderCertificationEvidencePacket = async () => {
    if (isOrdersBusy) return;
    if (!canExportOrders) {
      setError(exportPermissionTitle || 'Your account cannot export order data.');
      return;
    }
    if (providerCertificationEvidencePacket.selectedFamilies.length === 0) {
      setError('Select at least one order provider family before copying the evidence packet.');
      return;
    }

    try {
      await navigator.clipboard.writeText(providerCertificationEvidencePacketText);
      setNotice('Orders provider certification evidence packet copied.');
    } catch {
      setNotice(providerCertificationEvidencePacketText);
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
            {(canUseOrderRoleDefaults || isPermissionMatrixPending) && (
              <p className="mt-1 text-xs text-muted-foreground" data-testid="orders-permission-sync-state">
                {canUseOrderRoleDefaults
                  ? 'Using role defaults while detailed order permissions sync.'
                  : 'Loading detailed order permissions before enabling role-specific controls.'}
              </p>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
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
            <details className="group relative" data-testid="orders-command-secondary-actions">
              <summary
                className="inline-flex min-h-11 cursor-pointer list-none items-center justify-center gap-2 rounded-lg border border-border bg-background px-3 py-2 text-sm font-medium transition-colors hover:bg-accent focus-ring [&::-webkit-details-marker]:hidden"
                aria-label="More order actions"
              >
                <MoreHorizontal className="size-4" />
                More actions
                <span className="sr-only">Copy manifest, Download JSON, Export CSV, CSV template, Import CSV, Products, and Storefront page</span>
              </summary>
              <div className="mt-2 grid gap-2 rounded-lg border border-border bg-background p-2 shadow-lg sm:absolute sm:right-0 sm:z-20 sm:min-w-56">
                <button
                  type="button"
                  onClick={() => void copyOrderHandoff()}
                  disabled={isOrdersAccessBusy || !canExportOrders}
                  title={!canExportOrders ? exportPermissionTitle : undefined}
                  className="inline-flex min-h-10 items-center justify-start gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors hover:bg-accent disabled:cursor-not-allowed disabled:opacity-60"
                  data-testid="orders-command-copy-manifest"
                >
                  <Copy className="size-4" />
                  Copy manifest
                </button>
                <button
                  type="button"
                  onClick={downloadOrderHandoff}
                  disabled={isOrdersAccessBusy || !canExportOrders}
                  title={!canExportOrders ? exportPermissionTitle : undefined}
                  className="inline-flex min-h-10 items-center justify-start gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors hover:bg-accent disabled:cursor-not-allowed disabled:opacity-60"
                  data-testid="orders-command-download-json"
                >
                  <Download className="size-4" />
                  Download JSON
                </button>
                <button
                  type="button"
                  onClick={exportOrdersCsv}
                  disabled={isOrdersAccessBusy || !canExportOrders || filteredOrders.length === 0}
                  title={!canExportOrders ? exportPermissionTitle : undefined}
                  className="inline-flex min-h-10 items-center justify-start gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors hover:bg-accent disabled:cursor-not-allowed disabled:opacity-60"
                  data-testid="orders-command-export-csv"
                >
                  <Download className="size-4" />
                  Export CSV
                </button>
                <button
                  type="button"
                  onClick={downloadOrderImportTemplate}
                  disabled={!ordersCollection || isOrdersAccessBusy || !canEditOrders}
                  title={!canEditOrders ? editPermissionTitle : undefined}
                  className="inline-flex min-h-10 items-center justify-start gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors hover:bg-accent disabled:cursor-not-allowed disabled:opacity-60"
                  data-testid="orders-command-csv-template"
                >
                  <FileText className="size-4" />
                  CSV template
                </button>
                <button
                  type="button"
                  onClick={() => orderImportInputRef.current?.click()}
                  disabled={!ordersCollection || isOrdersAccessBusy || !canEditOrders}
                  title={!canEditOrders ? editPermissionTitle : undefined}
                  className="inline-flex min-h-10 items-center justify-start gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors hover:bg-accent disabled:cursor-not-allowed disabled:opacity-60"
                  data-testid="orders-command-import-csv"
                >
                  <Upload className="size-4" />
                  {isImportingOrders ? 'Importing...' : 'Import CSV'}
                </button>
                <button
                  type="button"
                  onClick={openProductsWorkspace}
                  disabled={isOrdersBusy}
                  className="inline-flex min-h-10 items-center justify-start gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors hover:bg-accent disabled:cursor-not-allowed disabled:opacity-60"
                  data-testid="orders-command-products"
                >
                  <ShoppingCart className="size-4" />
                  Products
                </button>
                <button
                  type="button"
                  onClick={openStorefrontPage}
                  disabled={isOrdersAccessBusy || !canEditPages}
                  title={!canEditPages ? pagesEditPermissionTitle : undefined}
                  className="inline-flex min-h-10 items-center justify-start gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors hover:bg-accent disabled:cursor-not-allowed disabled:opacity-60"
                  data-testid="orders-command-storefront-page"
                >
                  <Sparkles className="size-4" />
                  Storefront page
                </button>
              </div>
            </details>
          </div>
        </div>

        <details
          className="group mt-5 overflow-hidden rounded-lg border border-border bg-background"
          data-default-collapsed="true"
          data-testid="orders-readiness-details"
        >
          <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-sm font-semibold text-foreground transition hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring [&::-webkit-details-marker]:hidden">
            <span>Order readiness, workflow, and navigation</span>
            <span className="rounded-md bg-muted px-2 py-1 text-xs font-medium text-muted-foreground group-open:hidden">Show details</span>
            <span className="hidden rounded-md bg-muted px-2 py-1 text-xs font-medium text-muted-foreground group-open:inline-flex">Hide details</span>
          </summary>
          <div className="border-t border-border p-4">
            <div className="grid gap-3 xl:grid-cols-[minmax(0,1.15fr)_minmax(340px,0.85fr)]">
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

            <details
              className="group mt-4 overflow-hidden rounded-lg border border-border bg-background"
              data-default-collapsed="true"
              data-testid="orders-control-map"
            >
              <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 transition hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring [&::-webkit-details-marker]:hidden">
                <span>
                  <span className="block text-sm font-semibold text-foreground">Order control map</span>
                  <span className="mt-1 block text-sm text-muted-foreground">Jump to site scope, checkout intake, private API, order health, queue, and editor controls.</span>
                </span>
                <span className="shrink-0 rounded-md bg-muted px-2 py-1 text-xs font-medium text-muted-foreground group-open:hidden">Show map</span>
                <span className="hidden shrink-0 rounded-md bg-muted px-2 py-1 text-xs font-medium text-muted-foreground group-open:inline-flex">Hide map</span>
              </summary>
              <div className="grid gap-2 border-t border-border p-4 md:grid-cols-2 xl:grid-cols-6">
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
            </details>
          </div>
        </details>
      </section>

      {ordersCollection && (
        <details
          id="orders-api"
          className="group mb-6 overflow-hidden rounded-lg border border-border bg-card shadow-sm scroll-mt-24"
          data-default-collapsed="true"
          data-testid="orders-api-provider-details"
        >
          <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-5 py-4 transition hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring [&::-webkit-details-marker]:hidden">
            <span className="flex min-w-0 items-start gap-3">
              <span className="mt-0.5 flex size-9 flex-shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <ShieldCheck className="size-4" />
              </span>
              <span className="min-w-0">
                <span className="block font-semibold text-foreground">Order APIs, provider readiness, and certification</span>
                <span className="mt-1 block text-sm text-muted-foreground">
                  Checkout intake, admin contracts, provider readiness, reconciliation, cron, and live certification handoff.
                </span>
              </span>
            </span>
            <span className="shrink-0 rounded-md bg-muted px-2 py-1 text-xs font-medium text-muted-foreground group-open:hidden">Show details</span>
            <span className="hidden shrink-0 rounded-md bg-muted px-2 py-1 text-xs font-medium text-muted-foreground group-open:inline-flex">Hide details</span>
          </summary>
          <div className="border-t border-border bg-background/40 p-4">
        <Panel className="border-0 bg-transparent shadow-none">
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
                <Button variant="outline" onClick={downloadOrderImportTemplate} disabled={isOrdersAccessBusy || !canEditOrders} title={!canEditOrders ? editPermissionTitle : undefined} iconStart={<FileText className="size-4" />}>
                  CSV template
                </Button>
                <Button variant="outline" onClick={() => orderImportInputRef.current?.click()} disabled={isOrdersAccessBusy || !canEditOrders} title={!canEditOrders ? editPermissionTitle : undefined} iconStart={<Upload className="size-4" />}>
                  {isImportingOrders ? 'Importing...' : 'Import CSV'}
                </Button>
                <Button onClick={() => void copyOrdersApiUrl(publicOrderIntakeUrl, 'Checkout intake URL')} disabled={isOrdersAccessBusy || !canExportOrders} title={!canExportOrders ? exportPermissionTitle : undefined} iconStart={<Copy className="size-4" />}>
                  Copy checkout
                </Button>
                <Button
                  variant="outline"
                  onClick={() => void reconcileOrders()}
                  disabled={isOrdersMutationBusy || !canConfigureOrders}
                  title={!canConfigureOrders ? configurePermissionTitle : !ordersApiReady ? 'Sync the private order schema, then reconcile provider state.' : undefined}
                  iconStart={<RefreshCw className="size-4" />}
                  data-testid="orders-reconcile-provider"
                >
                  {isReconcilingOrders ? 'Reconciling...' : ordersApiReady ? 'Reconcile provider' : 'Sync & reconcile'}
                </Button>
                <details className="group relative" data-testid="orders-api-secondary-actions">
                  <summary
                    className="inline-flex min-h-11 cursor-pointer list-none items-center justify-center gap-2 rounded-lg border border-border bg-background px-3 py-2 text-sm font-medium transition-colors hover:bg-accent focus-ring [&::-webkit-details-marker]:hidden"
                    aria-label="More order API actions"
                  >
                    <MoreHorizontal className="size-4" />
                    More API actions
                    <span className="sr-only">Export CSV, Copy admin API, Products, Storefront page, and Open admin API</span>
                  </summary>
                  <div className="mt-2 grid gap-2 rounded-lg border border-border bg-background p-2 shadow-lg sm:absolute sm:right-0 sm:z-20 sm:min-w-56">
                    <button
                      type="button"
                      onClick={exportOrdersCsv}
                      disabled={isOrdersAccessBusy || !canExportOrders || filteredOrders.length === 0}
                      title={!canExportOrders ? exportPermissionTitle : undefined}
                      className="inline-flex min-h-10 items-center justify-start gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors hover:bg-accent disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      <Download className="size-4" />
                      Export CSV
                    </button>
                    <button
                      type="button"
                      onClick={() => void copyOrdersApiUrl(adminOrdersApiUrl, 'Internal orders API URL')}
                      disabled={isOrdersAccessBusy || !canExportOrders}
                      title={!canExportOrders ? exportPermissionTitle : undefined}
                      className="inline-flex min-h-10 items-center justify-start gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors hover:bg-accent disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      <Copy className="size-4" />
                      Copy admin API
                    </button>
                    <button
                      type="button"
                      onClick={openProductsWorkspace}
                      disabled={isOrdersBusy}
                      className="inline-flex min-h-10 items-center justify-start gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors hover:bg-accent disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      <ShoppingCart className="size-4" />
                      Products
                    </button>
                    <button
                      type="button"
                      onClick={openStorefrontPage}
                      disabled={isOrdersAccessBusy || !canEditPages}
                      title={!canEditPages ? pagesEditPermissionTitle : undefined}
                      className="inline-flex min-h-10 items-center justify-start gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors hover:bg-accent disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      <Sparkles className="size-4" />
                      Storefront page
                    </button>
                    <button
                      type="button"
                      onClick={() => void openAdminOrdersApi()}
                      disabled={isOrdersAccessBusy || !canExportOrders}
                      title={!canExportOrders ? exportPermissionTitle : 'Fetch with your admin session and open the JSON response.'}
                      className="inline-flex min-h-10 items-center justify-start gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors hover:bg-accent disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      <ExternalLink className="size-4" />
                      Open admin API
                    </button>
                  </div>
                </details>
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
                    disabled={isProviderReadinessLoading || !canViewCommerce}
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
                <div className="mt-3 rounded-lg border border-border bg-card p-3" data-testid="orders-action-plan">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <div className="font-medium">Order action plan</div>
                      <p className="mt-1 text-xs leading-5 text-muted-foreground">
                        Summarizes executable provider operations, manual handoffs, and blocked actions for the loaded order queue.
                      </p>
                    </div>
                    <span className="rounded-md border border-border bg-background px-2 py-1 font-mono text-[11px] text-muted-foreground">
                      {orderOperationPlanSummary.schemaVersion}
                    </span>
                  </div>
                  <div className="mt-3 grid gap-2 md:grid-cols-5">
                    {[
                      ['Orders', orderOperationPlanSummary.total],
                      ['Attention', orderOperationPlanSummary.attentionRequired],
                      ['Executable', orderOperationPlanSummary.executableNow],
                      ['Handoff', orderOperationPlanSummary.handoffRequired],
                      ['Blocked actions', orderOperationPlanSummary.blockedActions],
                    ].map(([label, value]) => (
                      <div key={label} className="rounded-md border border-border bg-background px-3 py-2 text-xs">
                        <div className="text-muted-foreground">{label}</div>
                        <div className="mt-1 font-semibold text-foreground">{value}</div>
                      </div>
                    ))}
                  </div>
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
                  <div className="mt-3 rounded-md border border-border bg-background p-3 text-xs" data-testid="orders-provider-certification-readiness-summary">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <div className="font-medium text-foreground">Order certification readiness summary</div>
                        <p className="mt-1 max-w-3xl leading-5 text-muted-foreground">
                          One-screen operator summary for the remaining Orders live-provider gate before opening the runbook, env template, and evidence packet.
                        </p>
                      </div>
                      <span className={cn(
                        'rounded-full px-2.5 py-1 text-[11px] font-semibold',
                        providerCertificationEvidencePacket.status === 'evidence-complete'
                          ? 'bg-emerald-50 text-emerald-700'
                          : providerCertificationEvidencePacket.status === 'needs-credentials'
                            ? 'bg-red-50 text-red-700'
                            : 'bg-amber-50 text-amber-700',
                      )}>
                        {providerCertificationEvidencePacket.status}
                      </span>
                    </div>
                    <div className="mt-3 grid gap-2 md:grid-cols-2 xl:grid-cols-3">
                      {providerCertificationReadinessItems.map((item) => (
                        <div key={item.label} className="rounded-md border border-border bg-muted/20 px-3 py-2">
                          <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{item.label}</div>
                          <div className="mt-1 break-words font-mono text-[11px] leading-4 text-foreground">{item.value}</div>
                          <div className="mt-1 break-words text-[11px] leading-4 text-muted-foreground">{item.detail}</div>
                        </div>
                      ))}
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2 text-[11px] text-muted-foreground">
                      <span className="rounded-md border border-border bg-muted/20 px-2 py-1">Secret boundary: no commerce provider credentials, customer payloads, raw order payloads, payment references, addresses, or webhook bodies are copied.</span>
                      <span className="rounded-md border border-border bg-muted/20 px-2 py-1">Artifact env: <span className="font-mono">{ORDER_PROVIDER_CERTIFICATION_OUTPUT_ENV}</span></span>
                    </div>
                    <div
                      className="mt-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-950"
                      data-testid="orders-provider-certification-next-action"
                      data-status={providerCertificationEvidencePacket.operatorNextAction.status}
                    >
                      <div className="font-semibold">Next operator action</div>
                      <div className="mt-1 font-medium">{providerCertificationEvidencePacket.operatorNextAction.label}</div>
                      <p className="mt-1 leading-5">{providerCertificationEvidencePacket.operatorNextAction.detail}</p>
                      <div className="mt-2 break-words rounded border border-amber-200 bg-background/80 px-2 py-1.5 font-mono text-[11px]">
                        {providerCertificationEvidencePacket.operatorNextAction.command}
                      </div>
                    </div>
                  </div>
                  <details className="mt-3 rounded-md border border-border bg-muted/10 p-3 text-xs" data-testid="orders-provider-certification-details" data-default-collapsed="true">
                    <summary className="flex cursor-pointer list-none flex-wrap items-start justify-between gap-3 rounded-md focus-ring">
                      <div>
                        <div className="font-medium text-foreground">Provider runbook, evidence, and command builder</div>
                        <p className="mt-1 max-w-3xl leading-5 text-muted-foreground">
                          Expand when running live provider certification. Daily order work keeps the readiness summary, handoff copy, CI command, and download actions visible.
                        </p>
                      </div>
                      <span className="rounded bg-background px-2 py-1 font-mono text-[10px] text-muted-foreground">
                        {providerRuntimeEvidence.readyCount}/{providerRuntimeEvidence.total} runtime ready
                      </span>
                    </summary>
                  <div className="mt-3 rounded-md border border-border bg-background px-3 py-2" data-testid="orders-provider-certification-runbook">
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
	                      <div className="flex flex-wrap items-center gap-2">
	                        <Button
	                          size="sm"
	                          variant="outline"
	                          onClick={() => void copyProviderCertificationEnvTemplate()}
	                          disabled={isOrdersAccessBusy || !canExportOrders || !providerCertificationHasSelectedSelector}
	                          title={!canExportOrders ? exportPermissionTitle : !providerCertificationHasSelectedSelector ? 'Select at least one commerce provider selector' : undefined}
	                          iconStart={<Copy className="size-4" />}
	                          data-testid="orders-provider-certification-env-copy-button"
	                        >
	                          Copy env template
	                        </Button>
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
	                    <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-[220px_minmax(0,1fr)_260px]">
	                      <div className="rounded-md border border-border bg-background px-3 py-2 text-xs" data-testid="orders-provider-certification-site-target">
	                        <span className="font-semibold text-foreground">Certification site id</span>
	                        <div className="mt-1 break-all font-mono text-[11px] text-muted-foreground">{activeSiteId}</div>
	                        <div className="mt-1 text-[11px] leading-4 text-muted-foreground">Emits BACKY_COMMERCE_CERTIFY_SITE_ID.</div>
	                      </div>
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
	                    <div className="mt-3 rounded-md border border-border bg-background p-3" data-testid="orders-provider-certification-env-template">
	                      <div className="flex flex-wrap items-start justify-between gap-2">
	                        <div>
	                          <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Env template</div>
	                          <p className="mt-1 text-[11px] leading-4 text-muted-foreground">
	                            Copy this into CI secrets or a local shell env file, then replace placeholders with live provider credentials before running the guarded command.
	                          </p>
	                        </div>
	                        <span className="rounded-md border border-border bg-muted/30 px-2 py-1 font-mono text-[10px] text-muted-foreground">
	                          backy.commerce-provider-certification-env-template.v1
	                        </span>
	                      </div>
	                      <pre
	                        className="mt-2 max-h-64 overflow-auto rounded-md border border-border bg-muted/30 p-3 font-mono text-[11px] leading-5 text-foreground"
	                        data-testid="orders-provider-certification-env-template-body"
	                      >
	                        {providerCertificationEnvTemplate}
	                      </pre>
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
                  <div className="mt-3 rounded-md border border-border bg-background px-3 py-2 text-xs" data-testid="orders-provider-certification-evidence">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <div className="font-medium text-foreground">Order certification evidence</div>
                        <p className="mt-1 max-w-3xl leading-5 text-muted-foreground">
                          Tracks the non-secret scenario coverage operators must attach before treating live order execution as certified.
                        </p>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="rounded-md border border-border bg-muted/30 px-2 py-1 font-mono text-[11px] text-muted-foreground">
                          {orderProviderCertificationEvidence.schemaVersion}
                        </span>
                        <span className={cn(
                          'rounded-full px-2 py-0.5 text-[11px] font-semibold',
                          orderProviderCertificationEvidence.status === 'ready' ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700',
                        )}>
                          {orderProviderCertificationEvidence.coverage.covered}/{orderProviderCertificationEvidence.coverage.total} scenarios
                        </span>
                      </div>
                    </div>
                    <div className="mt-2 rounded border border-border bg-muted/30 px-2 py-1.5 font-mono text-[11px] text-foreground">
                      {orderProviderCertificationEvidence.requiredGate}
                    </div>
                    <div className="mt-3 grid gap-2 md:grid-cols-2 xl:grid-cols-4">
                      {orderProviderCertificationEvidence.scenarios.map((scenario) => (
                        <div key={scenario.key} className="rounded-md border border-border bg-card px-3 py-2">
                          <div className="flex items-start justify-between gap-2">
                            <div className="font-medium text-foreground">{scenario.label}</div>
                            <span className={cn(
                              'rounded-full px-2 py-0.5 text-[10px] font-semibold',
                              scenario.status === 'covered' ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700',
                            )}>
                              {scenario.status}
                            </span>
                          </div>
                          <div className="mt-1 text-[11px] text-muted-foreground">
                            {scenario.evidenceCount} evidence item{scenario.evidenceCount === 1 ? '' : 's'}
                          </div>
                          {scenario.status === 'missing' ? (
                            <div className="mt-1 text-[11px] text-foreground">{scenario.nextAction}</div>
                          ) : null}
                          <div className="mt-1 break-words text-[11px] text-muted-foreground">
                            Expected: {scenario.expectedEvidence.join(' | ')}
                          </div>
                        </div>
                      ))}
                    </div>
                    <div className="mt-2 text-[11px] leading-4 text-muted-foreground">
                      {orderProviderCertificationEvidence.secretHandling}
                    </div>
                  </div>
                  <div className="mt-3 rounded-md border border-border bg-background px-3 py-2 text-xs" data-testid="orders-provider-certification-evidence-packet">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <div className="font-medium text-foreground">Certification evidence packet</div>
                        <p className="mt-1 max-w-3xl leading-5 text-muted-foreground">
                          Redacted operator attachment manifest for selected provider families, required inputs, capture sources, scenario attachments, and live-run redaction rules.
                        </p>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="rounded-md border border-border bg-muted/30 px-2 py-1 font-mono text-[11px] text-muted-foreground">
                          {providerCertificationEvidencePacket.schemaVersion}
                        </span>
                        <span className={cn(
                          'rounded-full px-2 py-0.5 text-[11px] font-semibold',
                          providerCertificationEvidencePacket.status === 'evidence-complete'
                            ? 'bg-emerald-50 text-emerald-700'
                            : providerCertificationEvidencePacket.status === 'needs-credentials'
                              ? 'bg-red-50 text-red-700'
                              : 'bg-amber-50 text-amber-700',
                        )}>
                          {providerCertificationEvidencePacket.status}
                        </span>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => void copyProviderCertificationEvidencePacket()}
                          disabled={isOrdersAccessBusy || !canExportOrders || providerCertificationEvidencePacket.selectedFamilies.length === 0}
                          title={!canExportOrders ? exportPermissionTitle : providerCertificationEvidencePacket.selectedFamilies.length === 0 ? 'Select at least one order provider family' : undefined}
                          iconStart={<Copy className="size-4" />}
                          data-testid="orders-provider-certification-evidence-packet-copy-button"
                        >
                          Copy evidence packet
                        </Button>
                      </div>
                    </div>
                    <div className="mt-3 grid gap-2 md:grid-cols-3">
                      <div className="rounded-md border border-border bg-muted/20 px-3 py-2">
                        <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Selected families</div>
                        <div className="mt-1 text-sm font-semibold text-foreground">{providerCertificationEvidencePacket.selectedFamilies.length}</div>
                        <div className="mt-1 flex flex-wrap gap-1">
                          {providerCertificationEvidencePacket.selectedFamilies.length > 0 ? providerCertificationEvidencePacket.selectedFamilies.map((family) => (
                            <span key={family} className="rounded bg-background px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
                              {family}
                            </span>
                          )) : (
                            <span className="text-[11px] text-muted-foreground">No families selected</span>
                          )}
                        </div>
                      </div>
                      <div className="rounded-md border border-border bg-muted/20 px-3 py-2">
                        <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Credential gaps</div>
                        <div className="mt-1 text-sm font-semibold text-foreground">{providerCertificationEvidencePacket.runtimeReadiness.missingSelectedFamilies.length}</div>
                        <div className="mt-1 text-[11px] leading-4 text-muted-foreground">
                          {providerCertificationEvidencePacket.runtimeReadiness.missingSelectedFamilies.length > 0
                            ? providerCertificationEvidencePacket.runtimeReadiness.missingSelectedFamilies.join(', ')
                            : 'Selected families have runtime readiness evidence.'}
                        </div>
                      </div>
                      <div className="rounded-md border border-border bg-muted/20 px-3 py-2">
                        <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Scenario attachments</div>
                        <div className="mt-1 text-sm font-semibold text-foreground">
                          {providerCertificationEvidencePacket.scenarioAttachments.filter((scenario) => scenario.status === 'covered').length}/{providerCertificationEvidencePacket.scenarioAttachments.length}
                        </div>
                        <div className="mt-1 text-[11px] leading-4 text-muted-foreground">
                          {providerCertificationEvidencePacket.redactionPolicy.allowedEvidence.slice(0, 3).join(' | ')}
                        </div>
                      </div>
                    </div>
                    <div className="mt-3 grid gap-2 lg:grid-cols-2">
                      {providerCertificationEvidencePacket.operatorArtifacts.map((artifact) => (
                        <div key={artifact.key} className="rounded-md border border-border bg-card px-3 py-2">
                          <div className="flex flex-wrap items-start justify-between gap-2">
                            <div>
                              <div className="font-medium text-foreground">{artifact.family}</div>
                              <div className="mt-0.5 text-[11px] text-muted-foreground">{artifact.providerAlias} · {artifact.captureSource}</div>
                            </div>
                            <span className={cn(
                              'rounded-full px-2 py-0.5 text-[10px] font-semibold',
                              artifact.status === 'ready-to-run' ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700',
                            )}>
                              {artifact.status}
                            </span>
                          </div>
                          <div className="mt-2 flex flex-wrap gap-1">
                            {artifact.expectedArtifacts.map((expectedArtifact) => (
                              <span key={`${artifact.key}-${expectedArtifact}`} className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
                                {expectedArtifact}
                              </span>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                    <div className="mt-3 rounded-md border border-border bg-muted/20 px-3 py-2">
                      <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Scenario attachments</div>
                      <div className="mt-2 grid gap-1 md:grid-cols-2 xl:grid-cols-4">
                        {providerCertificationEvidencePacket.scenarioAttachments.map((scenario) => (
                          <div key={scenario.key} className="rounded bg-background px-2 py-1.5">
                            <div className="flex items-center justify-between gap-2">
                              <span className="font-medium text-foreground">{scenario.label}</span>
                              <span className={cn(
                                'rounded-full px-1.5 py-0.5 text-[10px] font-semibold',
                                scenario.status === 'covered' ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700',
                              )}>
                                {scenario.evidenceCount}
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                    <div className="mt-2 text-[11px] leading-4 text-muted-foreground">
                      {providerCertificationEvidencePacket.secretHandling}
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
                  </details>
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
          </div>
        </details>
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
        <details
          id="orders-analytics"
          className="group mb-6 overflow-hidden rounded-lg border border-border bg-card shadow-sm scroll-mt-24"
          data-default-collapsed="true"
          data-testid="orders-analytics-details"
        >
          <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-5 py-4 transition hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring [&::-webkit-details-marker]:hidden">
            <span className="flex min-w-0 items-start gap-3">
              <span className="mt-0.5 flex size-9 flex-shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <BarChart3 className="size-4" />
              </span>
              <span className="min-w-0">
                <span className="block font-semibold text-foreground">Order analytics and delivery events</span>
                <span className="mt-1 block text-sm text-muted-foreground">
                  Backend totals, provider execution analytics, and checkout notification delivery diagnostics.
                </span>
              </span>
            </span>
            <span className="shrink-0 rounded-md bg-muted px-2 py-1 text-xs font-medium text-muted-foreground group-open:hidden">Show analytics</span>
            <span className="hidden shrink-0 rounded-md bg-muted px-2 py-1 text-xs font-medium text-muted-foreground group-open:inline-flex">Hide analytics</span>
          </summary>
          <div className="border-t border-border bg-background/40 p-4">
        <Panel className="border-0 bg-transparent shadow-none" data-testid="orders-analytics-panel">
          <PanelHeader
            title="Order Analytics"
            description="Backend totals across the private order queue, independent of the currently loaded page."
            icon={<BarChart3 className="size-4" />}
            action={
              <Button
                variant="outline"
                onClick={() => void loadOrderAnalytics()}
                disabled={isOrderAnalyticsLoading || !canViewCommerce}
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
                      disabled={!canViewCommerce}
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
          </div>
        </details>
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
                  <span id={ordersBulkActionStatusId} className="sr-only" data-testid="orders-bulk-action-status" aria-live="polite">
                    {ordersBulkActionStatus}
                  </span>
                  <div
                    className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-muted/40 px-3 py-2"
                    role="group"
                    aria-label="Selected order bulk actions"
                    aria-describedby={ordersBulkActionStatusId}
                    data-testid="orders-bulk-toolbar"
                    data-action-status={ordersBulkActionStatus}
                  >
                    <label className="flex items-center gap-2 text-sm font-medium text-foreground">
                      <input
                        type="checkbox"
                        aria-label="Select all visible orders"
                        checked={allVisibleOrdersSelected}
                        onChange={(event) => toggleVisibleOrderSelection(event.target.checked)}
                        disabled={Boolean(ordersBulkSelectionDisabledReason)}
                        title={ordersBulkSelectionDisabledReason || undefined}
                        aria-describedby={ordersBulkActionStatusId}
                        data-action-state={ordersBulkSelectionDisabledReason ? 'blocked' : 'ready'}
                        data-action-status={ordersBulkActionStatus}
                        data-disabled-reason={ordersBulkSelectionDisabledReason || undefined}
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
                          disabled={Boolean(ordersBulkClearDisabledReason)}
                          title={ordersBulkClearDisabledReason || undefined}
                          aria-describedby={ordersBulkActionStatusId}
                          data-action-state={ordersBulkClearDisabledReason ? 'blocked' : 'ready'}
                          data-action-status={ordersBulkActionStatus}
                          data-disabled-reason={ordersBulkClearDisabledReason || undefined}
                          data-testid="orders-bulk-clear-selection"
                        >
                          Clear selection
                        </Button>
                      )}
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => void bulkUpdateOrderWorkflow('paid')}
                        disabled={Boolean(ordersBulkWorkflowDisabledReason)}
                        title={ordersBulkWorkflowDisabledReason || undefined}
                        aria-describedby={ordersBulkActionStatusId}
                        data-action-state={ordersBulkWorkflowDisabledReason ? 'blocked' : 'ready'}
                        data-action-status={ordersBulkActionStatus}
                        data-disabled-reason={ordersBulkWorkflowDisabledReason || undefined}
                        iconStart={<CreditCard className="size-4" />}
                        data-testid="orders-bulk-mark-paid"
                      >
                        Mark Paid
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => void bulkUpdateOrderWorkflow('processing')}
                        disabled={Boolean(ordersBulkWorkflowDisabledReason)}
                        title={ordersBulkWorkflowDisabledReason || undefined}
                        aria-describedby={ordersBulkActionStatusId}
                        data-action-state={ordersBulkWorkflowDisabledReason ? 'blocked' : 'ready'}
                        data-action-status={ordersBulkActionStatus}
                        data-disabled-reason={ordersBulkWorkflowDisabledReason || undefined}
                        iconStart={<Truck className="size-4" />}
                        data-testid="orders-bulk-processing"
                      >
                        Processing
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => void bulkUpdateOrderWorkflow('fulfilled')}
                        disabled={Boolean(ordersBulkWorkflowDisabledReason)}
                        title={ordersBulkWorkflowDisabledReason || undefined}
                        aria-describedby={ordersBulkActionStatusId}
                        data-action-state={ordersBulkWorkflowDisabledReason ? 'blocked' : 'ready'}
                        data-action-status={ordersBulkActionStatus}
                        data-disabled-reason={ordersBulkWorkflowDisabledReason || undefined}
                        iconStart={<PackageCheck className="size-4" />}
                        data-testid="orders-bulk-fulfill"
                      >
                        Fulfill
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => void bulkUpdateOrderWorkflow('cancelled')}
                        disabled={Boolean(ordersBulkWorkflowDisabledReason)}
                        title={ordersBulkWorkflowDisabledReason || undefined}
                        aria-describedby={ordersBulkActionStatusId}
                        data-action-state={ordersBulkWorkflowDisabledReason ? 'blocked' : 'ready'}
                        data-action-status={ordersBulkActionStatus}
                        data-disabled-reason={ordersBulkWorkflowDisabledReason || undefined}
                        iconStart={<Archive className="size-4" />}
                        data-testid="orders-bulk-cancel"
                      >
                        Record cancel
                      </Button>
                    </div>
                  </div>
                  {filteredOrders.map((order) => (
                    <OrderCard
                      key={order.id}
                      order={order}
                      actionPlan={orderOperationPlans.get(order.id)}
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

          <Panel
            id="orders-editor"
            data-testid="orders-editor-panel"
            className="scroll-mt-24 xl:sticky xl:top-4 xl:max-h-[calc(100vh-2rem)] xl:self-start xl:overflow-y-auto"
          >
            <PanelHeader
              title={selectedOrder ? 'Edit order' : 'New order'}
              description="Customer, item, payment, and fulfillment state."
              icon={<Receipt className="size-4" />}
            />
            <PanelContent>
              <form onSubmit={saveOrder} noValidate data-testid="orders-editor-form">
                <div
                  className="sticky top-0 z-10 -mx-5 mb-4 border-y border-border bg-card/95 px-5 py-3 shadow-sm backdrop-blur"
                  data-testid="orders-editor-sticky-actions"
                >
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="truncate text-sm font-semibold text-foreground">
                        {selectedOrder ? 'Editing order' : 'Record order'}
                      </div>
                      <div className="mt-0.5 text-xs text-muted-foreground">
                        {orderFormSubmitted && orderRequiredFieldsInvalid
                          ? 'Fix the highlighted order fields before saving.'
                          : 'Save and workflow controls stay available while you review the order.'}
                      </div>
                    </div>
                    <div className="flex shrink-0 flex-wrap gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={resetForm}
                        disabled={isOrdersAccessBusy || !canEditOrders}
                        data-testid="orders-editor-sticky-clear"
                      >
                        Clear
                      </Button>
                      <Button
                        size="sm"
                        type="submit"
                        variant="primary"
                        disabled={isOrdersAccessBusy || !canEditOrders}
                        title={!canEditOrders ? editPermissionTitle : undefined}
                        iconStart={<Receipt className="size-4" />}
                        data-testid="orders-editor-sticky-save"
                      >
                        {isSaving ? 'Saving...' : selectedOrder ? 'Save Order' : 'Create Order'}
                      </Button>
                    </div>
                  </div>
                  <nav
                    aria-label="Order editor sections"
                    className="mt-3 flex gap-1 overflow-x-auto pb-1"
                    data-testid="orders-editor-section-nav"
                  >
                    {ORDER_EDITOR_SECTIONS.map((section) => (
                      <a
                        key={section.id}
                        href={`#${section.id}`}
                        className="shrink-0 rounded-md border border-border bg-background px-2.5 py-1.5 text-xs font-medium text-muted-foreground transition hover:border-primary/40 hover:text-foreground focus-ring"
                      >
                        {section.label}
                      </a>
                    ))}
                  </nav>
                </div>
                <fieldset disabled={isOrdersAccessBusy || !canEditOrders} title={!canEditOrders ? editPermissionTitle : undefined} className={cn('space-y-4', (isOrdersAccessBusy || !canEditOrders) && 'opacity-70')}>
                <div id="orders-editor-identity" className="scroll-mt-28" data-testid="orders-editor-identity-section" />
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Order number">
                    <input
                      value={formState.orderNumber}
                      onChange={(event) => setFormState((current) => ({ ...current, orderNumber: event.target.value }))}
                      required
                      aria-invalid={Boolean(orderNumberInlineError)}
                      aria-describedby={orderNumberInlineError ? 'orders-order-number-error' : undefined}
                      data-testid="orders-order-number-input"
                      className="w-full rounded-lg border bg-background px-3 py-2.5 text-sm"
                      placeholder="ORD-1001"
                    />
                    {orderNumberInlineError ? (
                      <span id="orders-order-number-error" className="block text-xs text-destructive" data-testid="orders-order-number-error">
                        {orderNumberInlineError}
                      </span>
                    ) : null}
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
                    aria-invalid={Boolean(orderCustomerInlineError)}
                    aria-describedby={orderCustomerInlineError ? 'orders-customer-error' : undefined}
                    data-testid="orders-customer-input"
                    className="w-full rounded-lg border bg-background px-3 py-2.5 text-sm"
                    placeholder="Jane Customer"
                  />
                  {orderCustomerInlineError ? (
                    <span id="orders-customer-error" className="block text-xs text-destructive" data-testid="orders-customer-error">
                      {orderCustomerInlineError}
                    </span>
                  ) : null}
                </Field>
                <Field label="Email">
                  <input
                    type="email"
                    value={formState.email}
                    onChange={(event) => setFormState((current) => ({ ...current, email: event.target.value }))}
                    required
                    aria-invalid={Boolean(orderEmailInlineError)}
                    aria-describedby={orderEmailInlineError ? 'orders-email-error' : undefined}
                    data-testid="orders-email-input"
                    className="w-full rounded-lg border bg-background px-3 py-2.5 text-sm"
                    placeholder="jane@example.com"
                  />
                  {orderEmailInlineError ? (
                    <span id="orders-email-error" className="block text-xs text-destructive" data-testid="orders-email-error">
                      {orderEmailInlineError}
                    </span>
                  ) : null}
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
                      aria-invalid={Boolean(orderTotalInlineError)}
                      aria-describedby={orderTotalInlineError ? 'orders-total-error' : undefined}
                      data-testid="orders-total-input"
                      className="w-full rounded-lg border bg-background px-3 py-2.5 text-sm"
                    />
                    {orderTotalInlineError ? (
                      <span id="orders-total-error" className="block text-xs text-destructive" data-testid="orders-total-error">
                        {orderTotalInlineError}
                      </span>
                    ) : null}
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
                <div id="orders-editor-customer" className="scroll-mt-28" data-testid="orders-editor-customer-section" />
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
                <div id="orders-editor-status-handoff" className="scroll-mt-28" data-testid="orders-editor-status-handoff-section" />
                <div className="space-y-3 rounded-lg border border-border bg-muted/20 p-3" data-testid="orders-status-handoff">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <div className="text-sm font-semibold text-foreground">Order status handoff</div>
                        <span className={cn(
                          'rounded-full px-2 py-0.5 text-[11px] font-semibold capitalize',
                          selectedOrderStatusHandoff.status === 'ready'
                            ? 'bg-emerald-50 text-emerald-700'
                            : selectedOrderStatusHandoff.status === 'attention'
                              ? 'bg-amber-50 text-amber-700'
                              : 'bg-destructive/10 text-destructive',
                        )}
                        >
                          {selectedOrderStatusHandoff.status}
                        </span>
                      </div>
                      <div className="mt-1 text-xs leading-5 text-muted-foreground">
                        Copy a customer-safe order status and tracking payload for storefront order-confirmation pages, customer portals, and support widgets.
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded-md border border-border bg-background px-2 py-1 font-mono text-[11px] text-muted-foreground">
                        {selectedOrderStatusHandoff.schemaVersion}
                      </span>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => void copySelectedOrderStatusHandoff()}
                        disabled={isOrdersAccessBusy || !canExportOrders}
                        title={!canExportOrders ? exportPermissionTitle : undefined}
                        iconStart={<Copy className="size-4" />}
                        data-testid="orders-status-handoff-copy-button"
                      >
                        Copy status JSON
                      </Button>
                    </div>
                  </div>

                  <div className="grid gap-2 md:grid-cols-4">
                    <div className="rounded-md border border-border bg-background px-3 py-2 text-xs">
                      <div className="text-muted-foreground">Selected order</div>
                      <div className="mt-1 truncate font-semibold text-foreground">
                        {selectedOrderStatusHandoff.order?.orderNumber || 'No order selected'}
                      </div>
                    </div>
                    <div className="rounded-md border border-border bg-background px-3 py-2 text-xs">
                      <div className="text-muted-foreground">Payment status</div>
                      <div className="mt-1 font-semibold capitalize text-foreground">
                        {selectedOrderStatusHandoff.order?.paymentStatus || 'pending'}
                      </div>
                    </div>
                    <div className="rounded-md border border-border bg-background px-3 py-2 text-xs">
                      <div className="text-muted-foreground">Fulfillment and tracking</div>
                      <div className="mt-1 truncate font-semibold text-foreground">
                        {selectedOrderStatusHandoff.tracking?.trackingNumber || selectedOrderStatusHandoff.order?.fulfillmentStatus || 'unavailable'}
                      </div>
                    </div>
                    <div className="rounded-md border border-border bg-background px-3 py-2 text-xs">
                      <div className="text-muted-foreground">Customer-safe score</div>
                      <div className="mt-1 font-semibold text-foreground">{selectedOrderStatusHandoff.score}%</div>
                    </div>
                  </div>

                  <div
                    className={cn(
                      'rounded-lg border px-3 py-2 text-xs',
                      selectedOrderStatusHandoff.actionPlan?.attention
                        ? 'border-amber-200 bg-amber-50 text-amber-900'
                        : 'border-emerald-200 bg-emerald-50 text-emerald-800',
                    )}
                    data-testid="orders-status-handoff-action-plan"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="font-semibold">
                        {selectedOrderStatusHandoff.actionPlan
                          ? `Recommended operation: ${
                              selectedOrderStatusHandoff.actionPlan.recommendedAction === 'none'
                                ? 'No operation'
                                : selectedOrderStatusHandoff.actionPlan.availableActions.find((action) => action.key === selectedOrderStatusHandoff.actionPlan?.recommendedAction)?.label || selectedOrderStatusHandoff.actionPlan.recommendedAction
                            }`
                          : 'Recommended operation: Select or save an order'}
                      </span>
                      <span className="font-mono text-[11px]">
                        {selectedOrderStatusHandoff.actionPlan?.schemaVersion || 'backy.order-operation-action-plan.v1'}
                      </span>
                    </div>
                    <div className="mt-1 leading-5">
                      {selectedOrderStatusHandoff.actionPlan?.recommendation || 'Select an order before exporting customer status handoff data.'}
                    </div>
                  </div>

                  <div
                    className="space-y-3 rounded-lg border border-border bg-background px-3 py-2.5 text-xs"
                    data-testid="orders-operation-impact"
                    data-schema-version={selectedOrderStatusHandoff.operationImpact.schemaVersion}
                    data-recommended-action={selectedOrderStatusHandoff.operationImpact.operations.recommendedAction}
                  >
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-semibold text-foreground">Operation impact</span>
                          <span className="rounded-md border border-border bg-muted/40 px-2 py-0.5 font-mono text-[11px] text-muted-foreground">
                            {selectedOrderStatusHandoff.operationImpact.schemaVersion}
                          </span>
                        </div>
                        <div className="mt-1 leading-5 text-muted-foreground">
                          {selectedOrderStatusHandoff.operationImpact.operations.recommendation}
                        </div>
                      </div>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => void copySelectedOrderOperationImpact()}
                        disabled={isOrdersAccessBusy || !canExportOrders}
                        title={!canExportOrders ? exportPermissionTitle : undefined}
                        iconStart={<Copy className="size-4" />}
                        data-testid="orders-operation-impact-copy-button"
                      >
                        Copy impact JSON
                      </Button>
                    </div>

                    <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
                      <div className="rounded-md border border-border bg-muted/20 px-3 py-2">
                        <div className="text-muted-foreground">Recommended action</div>
                        <div className="mt-1 truncate font-semibold text-foreground">
                          {selectedOrderStatusHandoff.operationImpact.operations.recommendedAction === 'none'
                            ? 'No operation'
                            : selectedOrderStatusHandoff.operationImpact.operations.availableActions.find((action) => action.key === selectedOrderStatusHandoff.operationImpact.operations.recommendedAction)?.label || selectedOrderStatusHandoff.operationImpact.operations.recommendedAction}
                        </div>
                      </div>
                      <div className="rounded-md border border-border bg-muted/20 px-3 py-2">
                        <div className="text-muted-foreground">Executable now</div>
                        <div className="mt-1 font-semibold text-foreground">
                          {selectedOrderStatusHandoff.operationImpact.operations.actionCounts['provider-ready']} provider-ready
                        </div>
                      </div>
                      <div className="rounded-md border border-border bg-muted/20 px-3 py-2">
                        <div className="text-muted-foreground">Manual handoff</div>
                        <div className="mt-1 font-semibold text-foreground">
                          {selectedOrderStatusHandoff.operationImpact.operations.actionCounts['manual-handoff']} fallback
                        </div>
                      </div>
                      <div className="rounded-md border border-border bg-muted/20 px-3 py-2">
                        <div className="text-muted-foreground">Frontend projection</div>
                        <div className="mt-1 font-semibold text-foreground">
                          {selectedOrderStatusHandoff.operationImpact.customerSafeProjection.statusHandoffReady ? 'Ready' : 'Blocked'}
                        </div>
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-2" data-testid="orders-operation-impact-actions">
                      {selectedOrderStatusHandoff.operationImpact.operations.availableActions.length ? (
                        selectedOrderStatusHandoff.operationImpact.operations.availableActions.map((action) => (
                          <span
                            key={action.key}
                            className={cn(
                              'rounded-full border px-2 py-1 font-medium',
                              action.executionMode === 'provider-ready'
                                ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                                : action.executionMode === 'manual-handoff'
                                  ? 'border-amber-200 bg-amber-50 text-amber-800'
                                  : 'border-border bg-muted/30 text-muted-foreground',
                            )}
                            title={action.reason}
                          >
                            {action.label}: {action.executionMode}
                          </span>
                        ))
                      ) : (
                        <span className="rounded-full border border-border bg-muted/30 px-2 py-1 font-medium text-muted-foreground">
                          Select an order to inspect operation impact
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="grid gap-2 md:grid-cols-2">
                    {selectedOrderStatusHandoff.checks.map((check) => (
                      <OrderStatusHandoffCheckCard key={check.key} check={check} />
                    ))}
                  </div>

                  <div className="rounded-md border border-border bg-background px-3 py-2 text-xs text-muted-foreground">
                    <div className="font-semibold text-foreground">Next steps</div>
                    <div className="mt-1 leading-5">{selectedOrderStatusHandoff.nextSteps.join(' ')}</div>
                  </div>
                </div>
                <div id="orders-editor-workflow" className="scroll-mt-28" data-testid="orders-editor-workflow-section" />
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
                <div id="orders-editor-labels" className="scroll-mt-28" data-testid="orders-editor-labels-section" />
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
                <div id="orders-editor-risk" className="scroll-mt-28" data-testid="orders-editor-risk-section" />
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
                <div id="orders-editor-items" className="scroll-mt-28" data-testid="orders-editor-items-section" />
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
	                      aria-invalid={Boolean(lineItemTitleInlineError)}
	                      aria-describedby={lineItemTitleInlineError ? 'orders-line-item-title-error' : undefined}
	                      data-testid="orders-line-item-title-input"
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
	                      aria-invalid={Boolean(lineItemQuantityInlineError)}
	                      aria-describedby={lineItemQuantityInlineError ? 'orders-line-item-quantity-error' : undefined}
	                      data-testid="orders-line-item-quantity-input"
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
	                      aria-invalid={Boolean(lineItemPriceInlineError)}
	                      aria-describedby={lineItemPriceInlineError ? 'orders-line-item-price-error' : undefined}
	                      data-testid="orders-line-item-price-input"
	                      className="rounded-lg border bg-background px-3 py-2.5 text-sm"
	                      placeholder="Price"
	                    />
                    <Button
	                      variant="outline"
	                      onClick={addLineItem}
	                      disabled={isOrdersAccessBusy || !canEditOrders || orderLineItems.length >= 100}
	                      data-testid="orders-line-item-add"
	                    >
	                      Add
	                    </Button>
	                  </div>
	                  {(lineItemTitleInlineError || lineItemQuantityInlineError || lineItemPriceInlineError) ? (
	                    <div className="grid gap-1 text-xs text-destructive md:grid-cols-[minmax(0,1fr)_minmax(0,0.8fr)_80px_100px_auto]">
	                      <span id="orders-line-item-title-error" data-testid="orders-line-item-title-error">
	                        {lineItemTitleInlineError}
	                      </span>
	                      <span aria-hidden="true" />
	                      <span id="orders-line-item-quantity-error" data-testid="orders-line-item-quantity-error">
	                        {lineItemQuantityInlineError}
	                      </span>
	                      <span id="orders-line-item-price-error" data-testid="orders-line-item-price-error">
	                        {lineItemPriceInlineError}
	                      </span>
	                      <span aria-hidden="true" />
	                    </div>
	                  ) : null}
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
                      aria-invalid={Boolean(orderItemsInlineError)}
                      aria-describedby={orderItemsInlineError ? 'orders-items-error' : undefined}
                      data-testid="orders-items-input"
                      className="w-full resize-none rounded-lg border bg-background px-3 py-2.5 font-mono text-xs"
                      placeholder="Structured line items JSON or a legacy item summary"
                    />
                    {orderItemsInlineError ? (
                      <span id="orders-items-error" className="block text-xs text-destructive" data-testid="orders-items-error">
                        {orderItemsInlineError}
                      </span>
                    ) : null}
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
                <div id="orders-editor-refunds" className="scroll-mt-28" data-testid="orders-editor-refunds-section" />
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
                  <Button type="submit" variant="primary" disabled={isOrdersAccessBusy || !canEditOrders} title={!canEditOrders ? editPermissionTitle : undefined} iconStart={<Receipt className="size-4" />}>
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
  actionPlan,
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
  actionPlan?: OrderOperationActionPlan;
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
  const orderNumber = String(readOrderValue(values, 'ordernumber', order.slug));
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
  const actionByKey = (key: OrderOperationActionKey) => actionPlan?.availableActions.find((action) => action.key === key);
  const refreshQuotePlan = actionByKey('refresh-quote');
  const prepareLabelPlan = actionByKey('prepare-label');
  const refreshTrackingPlan = actionByKey('refresh-tracking');
  const dispatchFulfillmentPlan = actionByKey('dispatch-fulfillment');
  const providerRefundPlan = actionByKey('provider-refund');
  const refreshProviderRefundPlan = actionByKey('refresh-provider-refund');
  const planTitle = (plan?: OrderOperationAction) => plan?.reason;
  const orderActionStatusId = `orders-actions-status-${order.id}`;
  const orderBusyReason = disabled
    ? 'Order actions are temporarily unavailable while Backy updates order data'
    : null;
  const planDisabledReason = (plan?: OrderOperationAction) => (
    plan && !plan.enabled ? plan.reason || `${plan.label} is not currently available` : null
  );
  const refreshQuoteDisabledReason = orderBusyReason ||
    (orderStatus === 'cancelled' ? 'Cancelled orders cannot be requoted' : null) ||
    (paymentStatus === 'refunded' ? 'Refunded orders cannot be requoted' : null) ||
    planDisabledReason(refreshQuotePlan);
  const markPaidDisabledReason = orderBusyReason ||
    (paymentStatus === 'paid' ? 'This order is already paid' : null);
  const prepareLabelDisabledReason = orderBusyReason ||
    (Boolean(shippingLabelId) && shippingLabelStatus !== 'voided' ? 'A shipping label is already prepared for this order' : null) ||
    (fulfillmentStatus === 'fulfilled' ? 'Fulfilled orders cannot prepare a new label' : null) ||
    (fulfillmentStatus === 'cancelled' ? 'Cancelled fulfillment cannot prepare a new label' : null) ||
    planDisabledReason(prepareLabelPlan);
  const voidLabelDisabledReason = orderBusyReason ||
    (shippingLabelStatus === 'voided' ? 'This shipping label is already voided' : null) ||
    (fulfillmentStatus === 'fulfilled' ? 'Fulfilled orders cannot void the shipping label' : null);
  const refreshTrackingDisabledReason = orderBusyReason ||
    (fulfillmentStatus === 'cancelled' ? 'Cancelled fulfillment cannot refresh tracking' : null) ||
    planDisabledReason(refreshTrackingPlan);
  const dispatchFulfillmentDisabledReason = orderBusyReason ||
    (Boolean(fulfillmentId) ? 'Fulfillment has already been dispatched' : null) ||
    (paymentStatus !== 'paid' ? 'Mark the order paid before dispatching fulfillment' : null) ||
    (fulfillmentStatus === 'fulfilled' ? 'This order is already fulfilled' : null) ||
    (fulfillmentStatus === 'cancelled' ? 'Cancelled fulfillment cannot be dispatched' : null) ||
    planDisabledReason(dispatchFulfillmentPlan);
  const fulfillDisabledReason = orderBusyReason ||
    (fulfillmentStatus === 'fulfilled' ? 'This order is already fulfilled' : null);
  const refundDisabledReason = orderBusyReason ||
    (paymentStatus === 'refunded' ? 'This order is already refunded' : null);
  const providerRefundLabel = providerRefundRetryable ? 'Retry Provider Refund' : 'Provider Refund';
  const providerRefundDisabledReason = orderBusyReason ||
    (Boolean(providerRefundId) && !providerRefundRetryable ? 'A provider refund is already recorded for this order' : null) ||
    (paymentStatus === 'pending' ? 'Mark the order paid before creating a provider refund' : null) ||
    (paymentStatus === 'failed' ? 'Failed payments cannot create a provider refund' : null) ||
    planDisabledReason(providerRefundPlan);
  const refreshProviderRefundDisabledReason = orderBusyReason ||
    planDisabledReason(refreshProviderRefundPlan);
  const cancelDisabledReason = orderBusyReason ||
    (orderStatus === 'cancelled' ? 'This order is already cancelled' : null);
  const deleteOrderDisabledReason = orderBusyReason ||
    (!canDelete ? deleteDisabledReason || 'Your account cannot delete orders' : null);
  const actionStatus = (label: string, reason: string | null) => (
    `${label} ${reason ? `unavailable: ${reason}` : 'available'}.`
  );
  const orderActionStatus = [
    actionStatus('Edit', orderBusyReason),
    actionStatus('Refresh Quote', refreshQuoteDisabledReason),
    actionStatus('Mark Paid', markPaidDisabledReason),
    actionStatus('Prepare Label', prepareLabelDisabledReason),
    shippingLabelId ? actionStatus('Void Label', voidLabelDisabledReason) : null,
    shippingLabelUrl ? actionStatus('Open Label', null) : null,
    trackingNumber ? actionStatus('Refresh Tracking', refreshTrackingDisabledReason) : null,
    actionStatus('Dispatch Fulfillment', dispatchFulfillmentDisabledReason),
    actionStatus('Fulfill', fulfillDisabledReason),
    actionStatus('Record Refund/Return', refundDisabledReason),
    actionStatus(providerRefundLabel, providerRefundDisabledReason),
    providerRefundRefreshable ? actionStatus('Refresh Provider Refund', refreshProviderRefundDisabledReason) : null,
    actionStatus('Record Cancel', cancelDisabledReason),
    actionStatus('Delete', deleteOrderDisabledReason),
  ].filter(Boolean).join(' ');

  return (
    <article
      className={cn('rounded-lg border bg-background p-4 transition-colors', selected ? 'border-primary ring-2 ring-primary/10' : 'border-border')}
      data-testid="orders-order-card"
      data-order-id={order.id}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 flex-1 gap-3">
          <input
            type="checkbox"
            aria-label={`Select order ${orderNumber}`}
            checked={selectedForBulk}
            onChange={(event) => onSelectionChange(event.target.checked)}
            disabled={disabled}
            className="mt-1 size-4 shrink-0 rounded border-border"
          />
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="font-semibold">{orderNumber}</h3>
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
      {actionPlan ? (
        <div className={cn(
          'mt-3 rounded-lg border px-3 py-2 text-xs',
          actionPlan.attention ? 'border-amber-200 bg-amber-50 text-amber-900' : 'border-emerald-200 bg-emerald-50 text-emerald-800',
        )}
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="font-semibold">
              Recommended: {actionPlan.recommendedAction === 'none' ? 'No operation' : actionPlan.availableActions.find((action) => action.key === actionPlan.recommendedAction)?.label || actionPlan.recommendedAction}
            </span>
            <span className="font-mono text-[11px]">{actionPlan.schemaVersion}</span>
          </div>
          <div className="mt-1 leading-5">{actionPlan.recommendation}</div>
          <div className="mt-1 break-words opacity-90">
            {actionPlan.availableActions.map((action) => `${action.label}: ${action.executionMode}`).join(' · ')}
          </div>
          {actionPlan.handoffRequired ? (
            <div className="mt-1 font-medium">One or more enabled actions will persist a manual handoff.</div>
          ) : null}
        </div>
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
      <div
        className="mt-4 flex flex-wrap items-center gap-2"
        role="group"
        aria-label={`Actions for order ${orderNumber}`}
        aria-describedby={orderActionStatusId}
        data-testid="orders-action-group"
        data-order-id={order.id}
        data-action-status={orderActionStatus}
      >
        <span id={orderActionStatusId} className="sr-only" data-testid="orders-action-status">
          {orderActionStatus}
        </span>
        <Button
          size="sm"
          onClick={onEdit}
          disabled={Boolean(orderBusyReason)}
          title={orderBusyReason || undefined}
          aria-label={`Edit order ${orderNumber}`}
          aria-describedby={orderActionStatusId}
          data-testid="orders-edit-order"
          data-action-state={orderBusyReason ? 'blocked' : 'ready'}
          data-disabled-reason={orderBusyReason || undefined}
          iconStart={<Receipt className="size-4" />}
        >
          Edit
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={onRefreshQuote}
          disabled={Boolean(refreshQuoteDisabledReason)}
          title={refreshQuoteDisabledReason || planTitle(refreshQuotePlan)}
          aria-label={`Refresh quote for order ${orderNumber}`}
          aria-describedby={orderActionStatusId}
          data-testid="orders-refresh-quote"
          data-action-state={refreshQuoteDisabledReason ? 'blocked' : 'ready'}
          data-disabled-reason={refreshQuoteDisabledReason || undefined}
          iconStart={<RefreshCw className="size-4" />}
        >
          Refresh Quote
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={onPaid}
          disabled={Boolean(markPaidDisabledReason)}
          title={markPaidDisabledReason || undefined}
          aria-label={`Mark order ${orderNumber} paid`}
          aria-describedby={orderActionStatusId}
          data-testid="orders-mark-paid"
          data-action-state={markPaidDisabledReason ? 'blocked' : 'ready'}
          data-disabled-reason={markPaidDisabledReason || undefined}
          iconStart={<CreditCard className="size-4" />}
        >
          Mark Paid
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={onShippingLabel}
          disabled={Boolean(prepareLabelDisabledReason)}
          title={prepareLabelDisabledReason || planTitle(prepareLabelPlan)}
          aria-label={`Prepare shipping label for order ${orderNumber}`}
          aria-describedby={orderActionStatusId}
          data-testid="orders-prepare-label"
          data-action-state={prepareLabelDisabledReason ? 'blocked' : 'ready'}
          data-disabled-reason={prepareLabelDisabledReason || undefined}
          iconStart={<Truck className="size-4" />}
        >
          Prepare Label
        </Button>
        {shippingLabelId ? (
          <Button
            size="sm"
            variant="outline"
            onClick={onVoidShippingLabel}
            disabled={Boolean(voidLabelDisabledReason)}
            title={voidLabelDisabledReason || undefined}
            aria-label={`Void shipping label for order ${orderNumber}`}
            aria-describedby={orderActionStatusId}
            data-testid="orders-void-label"
            data-action-state={voidLabelDisabledReason ? 'blocked' : 'ready'}
            data-disabled-reason={voidLabelDisabledReason || undefined}
            iconStart={<Archive className="size-4" />}
          >
            Void Label
          </Button>
        ) : null}
        {shippingLabelUrl ? (
          <a
            href={shippingLabelUrl}
            target="_blank"
            rel="noreferrer"
            aria-label={`Open shipping label for order ${orderNumber}`}
            aria-describedby={orderActionStatusId}
            data-testid="orders-open-label"
            data-action-state="ready"
            className="inline-flex min-h-9 items-center justify-center gap-2 rounded-lg border border-transparent bg-transparent px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-accent"
          >
            <ExternalLink className="size-4" />
            Open Label
          </a>
        ) : null}
        {trackingNumber ? (
          <Button
            size="sm"
            variant="outline"
            onClick={onRefreshTracking}
            disabled={Boolean(refreshTrackingDisabledReason)}
            title={refreshTrackingDisabledReason || planTitle(refreshTrackingPlan)}
            aria-label={`Refresh tracking for order ${orderNumber}`}
            aria-describedby={orderActionStatusId}
            data-testid="orders-refresh-tracking"
            data-action-state={refreshTrackingDisabledReason ? 'blocked' : 'ready'}
            data-disabled-reason={refreshTrackingDisabledReason || undefined}
            iconStart={<RefreshCw className="size-4" />}
          >
            Refresh Tracking
          </Button>
        ) : null}
        <Button
          size="sm"
          variant="outline"
          onClick={onDispatchFulfillment}
          disabled={Boolean(dispatchFulfillmentDisabledReason)}
          title={dispatchFulfillmentDisabledReason || planTitle(dispatchFulfillmentPlan)}
          aria-label={`Dispatch fulfillment for order ${orderNumber}`}
          aria-describedby={orderActionStatusId}
          data-testid="orders-dispatch-fulfillment"
          data-action-state={dispatchFulfillmentDisabledReason ? 'blocked' : 'ready'}
          data-disabled-reason={dispatchFulfillmentDisabledReason || undefined}
          iconStart={<PackageCheck className="size-4" />}
        >
          Dispatch Fulfillment
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={onFulfilled}
          disabled={Boolean(fulfillDisabledReason)}
          title={fulfillDisabledReason || undefined}
          aria-label={`Mark order ${orderNumber} fulfilled`}
          aria-describedby={orderActionStatusId}
          data-testid="orders-fulfill-order"
          data-action-state={fulfillDisabledReason ? 'blocked' : 'ready'}
          data-disabled-reason={fulfillDisabledReason || undefined}
          iconStart={<PackageCheck className="size-4" />}
        >
          Fulfill
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={onRefunded}
          disabled={Boolean(refundDisabledReason)}
          title={refundDisabledReason || undefined}
          aria-label={`Record refund or return for order ${orderNumber}`}
          aria-describedby={orderActionStatusId}
          data-testid="orders-record-refund"
          data-action-state={refundDisabledReason ? 'blocked' : 'ready'}
          data-disabled-reason={refundDisabledReason || undefined}
          iconStart={<RotateCcw className="size-4" />}
        >
          Record Refund/Return
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={onProviderRefund}
          disabled={Boolean(providerRefundDisabledReason)}
          title={providerRefundDisabledReason || planTitle(providerRefundPlan)}
          aria-label={`${providerRefundLabel} for order ${orderNumber}`}
          aria-describedby={orderActionStatusId}
          data-testid="orders-provider-refund"
          data-action-state={providerRefundDisabledReason ? 'blocked' : 'ready'}
          data-disabled-reason={providerRefundDisabledReason || undefined}
          iconStart={<CreditCard className="size-4" />}
        >
          {providerRefundLabel}
        </Button>
        {providerRefundRefreshable ? (
          <Button
            size="sm"
            variant="outline"
            onClick={onRefreshProviderRefund}
            disabled={Boolean(refreshProviderRefundDisabledReason)}
            title={refreshProviderRefundDisabledReason || planTitle(refreshProviderRefundPlan)}
            aria-label={`Refresh provider refund for order ${orderNumber}`}
            aria-describedby={orderActionStatusId}
            data-testid="orders-refresh-provider-refund"
            data-action-state={refreshProviderRefundDisabledReason ? 'blocked' : 'ready'}
            data-disabled-reason={refreshProviderRefundDisabledReason || undefined}
            iconStart={<RefreshCw className="size-4" />}
          >
            Refresh Provider Refund
          </Button>
        ) : null}
        <Button
          size="sm"
          variant="outline"
          onClick={onCancelled}
          disabled={Boolean(cancelDisabledReason)}
          title={cancelDisabledReason || undefined}
          aria-label={`Record cancellation for order ${orderNumber}`}
          aria-describedby={orderActionStatusId}
          data-testid="orders-record-cancel"
          data-action-state={cancelDisabledReason ? 'blocked' : 'ready'}
          data-disabled-reason={cancelDisabledReason || undefined}
          iconStart={<Archive className="size-4" />}
        >
          Record Cancel
        </Button>
        <Button
          size="sm"
          variant="danger"
          onClick={onDelete}
          disabled={Boolean(deleteOrderDisabledReason)}
          title={deleteOrderDisabledReason || undefined}
          aria-label={`Delete order ${orderNumber}`}
          aria-describedby={orderActionStatusId}
          data-testid="orders-delete-order"
          data-action-state={deleteOrderDisabledReason ? 'blocked' : 'ready'}
          data-disabled-reason={deleteOrderDisabledReason || undefined}
          iconStart={<Trash2 className="size-4" />}
        >
          Delete
        </Button>
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

function OrderStatusHandoffCheckCard({ check }: { check: OrderStatusHandoffCheck }) {
  return (
    <div className={cn(
      'rounded-md border px-3 py-2 text-xs',
      check.status === 'ready'
        ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
        : check.status === 'attention'
          ? 'border-amber-200 bg-amber-50 text-amber-900'
          : 'border-destructive/30 bg-destructive/10 text-destructive',
    )}
    >
      <div className="flex items-start justify-between gap-2">
        <span className="font-semibold">{check.label}</span>
        <span className="shrink-0 rounded bg-background/80 px-1.5 py-0.5 font-mono text-[10px] capitalize">
          {check.status}
        </span>
      </div>
      <div className="mt-1 leading-5 opacity-90">{check.detail}</div>
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
    return getLocalBackendOrigin();
  }

  return (envBase || (typeof window !== 'undefined' ? window.location.origin : getLocalBackendOrigin()))
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

const maskCustomerEmail = (email: string): string => {
  const trimmed = email.trim();
  const [local, domain] = trimmed.split('@');
  if (!local || !domain) return '';
  const visible = local.length <= 2 ? local.slice(0, 1) : local.slice(0, 2);
  return `${visible}${'*'.repeat(Math.max(3, local.length - visible.length))}@${domain}`;
};

const maskCustomerPhone = (phone: string): string => {
  const digits = phone.replace(/\D/g, '');
  if (!digits) return '';
  return `${digits.length > 4 ? '***-' : ''}${digits.slice(-4)}`;
};

const orderStatusEndpoint = (template: string, orderId: string): string => (
  template.includes('{orderId}')
    ? template.replace('{orderId}', encodeURIComponent(orderId))
    : template
);

const summarizeOrderStatus = (checks: OrderStatusHandoffCheck[]): OrderStatusHandoffStatus => {
  if (checks.some((check) => check.status === 'blocked')) return 'blocked';
  if (checks.some((check) => check.status === 'attention')) return 'attention';
  return 'ready';
};

const buildOrderStatusFrontendBindings = (
  endpoints: OrderStatusHandoff['endpoints'],
  order: CollectionRecord | null,
): OrderStatusHandoff['frontendBindings'] => ({
  schemaVersion: 'backy.order-status-frontend-bindings.v1',
  targetViews: ['order-confirmation', 'order-tracking', 'refund-status', 'support-widget'],
  dataset: {
    key: 'orderStatusHandoff',
    source: 'admin-order-status-handoff-api',
    endpoint: endpoints.adminStatusHandoff,
    selectedOrderId: order?.id || null,
    selectedOrderSlug: order?.slug || null,
    auth: 'admin-session-or-service-key',
    refreshMethod: 'GET',
  },
  safeBindingPaths: [
    'order.orderNumber',
    'order.total',
    'order.currency',
    'order.itemCount',
    'order.orderStatus',
    'order.paymentStatus',
    'order.fulfillmentStatus',
    'customer.displayName',
    'customer.maskedEmail',
    'customer.maskedPhone',
    'customer.customerProfileLinked',
    'tracking.carrier',
    'tracking.trackingNumber',
    'tracking.trackingUrl',
    'tracking.trackingStatus',
    'tracking.fulfilledAt',
    'refund.refundAmount',
    'refund.providerRefundStatus',
    'digitalDelivery.itemCount',
    'digitalDelivery.configuredItemCount',
    'digitalDelivery.pendingItemCount',
    'digitalDelivery.status',
    'digitalDelivery.customerAction',
    'actionPlan.recommendation',
    'checks[].status',
    'nextSteps[]',
  ],
  maskedBindingPaths: ['customer.maskedEmail', 'customer.maskedPhone'],
  editableRegions: [
    {
      key: 'confirmation-summary',
      label: 'Confirmation summary',
      targetViews: ['order-confirmation'],
      recommendedBindings: ['order.orderNumber', 'order.total', 'order.currency', 'order.paymentStatus'],
    },
    {
      key: 'tracking-timeline',
      label: 'Tracking timeline',
      targetViews: ['order-tracking'],
      recommendedBindings: ['order.fulfillmentStatus', 'tracking.carrier', 'tracking.trackingNumber', 'tracking.trackingUrl', 'tracking.trackingStatus'],
    },
    {
      key: 'refund-support',
      label: 'Refund and support status',
      targetViews: ['refund-status', 'support-widget'],
      recommendedBindings: ['refund.refundAmount', 'refund.providerRefundStatus', 'actionPlan.recommendation', 'nextSteps[]'],
    },
    {
      key: 'digital-delivery-status',
      label: 'Digital delivery status',
      targetViews: ['order-confirmation', 'order-tracking', 'support-widget'],
      recommendedBindings: ['digitalDelivery.itemCount', 'digitalDelivery.configuredItemCount', 'digitalDelivery.status', 'digitalDelivery.customerAction'],
    },
  ],
  actionBindings: [
    {
      key: 'refresh-status',
      label: 'Refresh status',
      method: 'GET',
      endpoint: endpoints.adminStatusHandoff,
      requiresPermission: 'commerce.view',
    },
    {
      key: 'refresh-tracking',
      label: 'Refresh tracking',
      method: 'POST',
      endpoint: endpoints.adminTracking,
      requiresPermission: 'commerce.edit',
    },
    {
      key: 'request-provider-refund',
      label: 'Request provider refund',
      method: 'POST',
      endpoint: endpoints.adminProviderRefund,
      requiresPermission: 'commerce.edit',
    },
    {
      key: 'open-admin-order-detail',
      label: 'Open private order detail',
      method: 'GET',
      endpoint: endpoints.adminOrderDetail,
      requiresPermission: 'commerce.view',
    },
  ],
});

const buildOrderOperationImpact = ({
  activeSiteId,
  generatedAt,
  order,
  actionPlan,
  providerReadinessChecks,
  statusHandoffStatus,
  frontendBindings,
  ordersApiReady,
}: {
  activeSiteId: string;
  generatedAt: string;
  order: CollectionRecord | null;
  actionPlan: OrderOperationActionPlan | null;
  providerReadinessChecks: ProviderReadinessCheck[];
  statusHandoffStatus: OrderStatusHandoffStatus;
  frontendBindings: OrderStatusHandoff['frontendBindings'];
  ordersApiReady: boolean;
}): OrderOperationImpact => {
  const values = order?.values || {};
  const currency = order ? normalizeCurrency(String(values.currency || 'USD')) : 'USD';
  const availableActions = actionPlan?.availableActions || [];
  const actionCounts: Record<OrderOperationExecutionMode, number> = {
    'provider-ready': 0,
    'manual-handoff': 0,
    blocked: 0,
  };

  availableActions.forEach((action) => {
    actionCounts[action.executionMode] += 1;
  });

  return {
    schemaVersion: 'backy.order-operation-impact.v1',
    generatedAt,
    selectedSiteId: activeSiteId,
    order: {
      id: order?.id || null,
      slug: order?.slug || null,
      orderNumber: order ? String(readOrderValue(values, 'ordernumber', order.slug)) : 'No order selected',
      recordStatus: order?.status || null,
      orderStatus: order ? asOrderStatus(readOrderValue(values, 'orderstatus', undefined)) : null,
      paymentStatus: order ? asPaymentStatus(readOrderValue(values, 'paymentstatus', undefined)) : null,
      fulfillmentStatus: order ? asFulfillmentStatus(readOrderValue(values, 'fulfillmentstatus', undefined)) : null,
      total: order ? toNumber(values.total) : 0,
      currency,
    },
    providerReadiness: {
      readyCount: providerReadinessChecks.filter((check) => check.ready).length,
      total: providerReadinessChecks.length,
      checks: providerReadinessChecks.map((check) => ({
        key: check.key,
        title: check.title,
        mode: check.mode,
        ready: check.ready,
      })),
    },
    operations: {
      recommendedAction: actionPlan?.recommendedAction || 'none',
      recommendation: actionPlan?.recommendation || 'Select or save an order before running provider operations.',
      executableNow: Boolean(actionPlan?.executableNow),
      handoffRequired: Boolean(actionPlan?.handoffRequired),
      attention: Boolean(actionPlan?.attention),
      actionCounts,
      availableActions,
    },
    customerSafeProjection: {
      statusHandoffStatus,
      statusHandoffReady: statusHandoffStatus !== 'blocked',
      maskedContactAvailable: Boolean(
        String(values.email || '').trim() ||
        String(readOrderValue(values, 'phone', '') || '').trim()
      ),
      frontendBindingsReady: frontendBindings.safeBindingPaths.length > 0 &&
        frontendBindings.editableRegions.length > 0 &&
        frontendBindings.actionBindings.length > 0,
      publicCollectionReadBlocked: ordersApiReady,
      safeBindingPaths: frontendBindings.safeBindingPaths,
      maskedBindingPaths: frontendBindings.maskedBindingPaths,
    },
    references: {
      paymentReferencePresent: Boolean(readOrderValue(values, 'paymentreference', '')),
      trackingReferencePresent: Boolean(readOrderValue(values, 'trackingnumber', '') || readOrderValue(values, 'trackingurl', '')),
      shippingLabelReferencePresent: Boolean(readOrderValue(values, 'shippinglabelid', '') || readOrderValue(values, 'shippinglabelurl', '')),
      fulfillmentReferencePresent: Boolean(readOrderValue(values, 'fulfillmentid', '')),
      providerRefundReferencePresent: Boolean(readOrderValue(values, 'providerrefundid', '') || readOrderValue(values, 'providerrefundreference', '')),
    },
    privacy: {
      adminOperatorOnly: true,
      customerSafeFieldsOnly: true,
      includesRawCustomerContact: false,
      includesPaymentReferences: false,
      includesProviderExecutionIds: false,
      includesAddresses: false,
      includesInternalNotes: false,
      includesProviderPayloads: false,
      note: 'Operation impact exports action readiness, safe binding paths, and boolean reference presence only; raw contacts, payment references, provider ids, provider payloads, addresses, and private notes remain inside admin APIs.',
    },
  };
};

const buildOrderStatusHandoff = ({
  activeSiteId,
  adminOrderDetailApiUrl,
  adminOrderOperationsApiUrl,
  adminOrderStatusHandoffApiUrl,
  publicOrderIntakeUrl,
  order,
  customerProfile,
  orderOperationPlan,
  providerReadinessChecks,
  ordersApiReady,
}: {
  activeSiteId: string;
  adminOrderDetailApiUrl: string;
  adminOrderOperationsApiUrl: string;
  adminOrderStatusHandoffApiUrl: string;
  publicOrderIntakeUrl: string;
  order: CollectionRecord | null;
  customerProfile: CollectionRecord | null;
  orderOperationPlan: OrderOperationActionPlan | null;
  providerReadinessChecks: ProviderReadinessCheck[];
  ordersApiReady: boolean;
}): OrderStatusHandoff => {
  const generatedAt = new Date().toISOString();
  const adminDetailUrl = order ? orderStatusEndpoint(adminOrderDetailApiUrl, order.id) : adminOrderDetailApiUrl;
  const adminOperationUrl = order ? `${adminOrderOperationsApiUrl}/${encodeURIComponent(order.id)}` : `${adminOrderOperationsApiUrl}/{orderId}`;
  const adminStatusHandoffUrl = order ? orderStatusEndpoint(adminOrderStatusHandoffApiUrl, order.id) : adminOrderStatusHandoffApiUrl;
  const endpoints = {
    checkoutIntake: publicOrderIntakeUrl,
    publicStatusHandoff: order
      ? `${publicOrderIntakeUrl}?orderId=${encodeURIComponent(order.id)}&statusToken={statusToken}`
      : `${publicOrderIntakeUrl}?orderId={orderId}&statusToken={statusToken}`,
    adminStatusHandoff: adminStatusHandoffUrl,
    adminOrderDetail: adminDetailUrl,
    adminTracking: `${adminOperationUrl}/tracking`,
    adminProviderRefund: `${adminOperationUrl}/provider-refund`,
  };
  const frontendBindings = buildOrderStatusFrontendBindings(endpoints, order);

  if (!order) {
    const checks: OrderStatusHandoffCheck[] = [
      {
        key: 'selected-order',
        label: 'Selected order',
        status: 'blocked',
        detail: 'Select or save an order before exporting customer status handoff data.',
      },
      {
        key: 'private-order-queue',
        label: 'Private order queue',
        status: ordersApiReady ? 'ready' : 'blocked',
        detail: ordersApiReady
          ? 'Raw order records are private and can be projected into a customer-safe status payload.'
          : 'Sync the private orders collection before exposing customer order status.',
      },
    ];
    const status = summarizeOrderStatus(checks);
    const operationImpact = buildOrderOperationImpact({
      activeSiteId,
      generatedAt,
      order: null,
      actionPlan: null,
      providerReadinessChecks,
      statusHandoffStatus: status,
      frontendBindings,
      ordersApiReady,
    });

    return {
      schemaVersion: 'backy.order-status-handoff.v1',
      generatedAt,
      source: 'admin-orders-ui',
      status,
      score: 0,
      selectedSiteId: activeSiteId,
      order: null,
      customer: null,
      tracking: null,
      refund: null,
      digitalDelivery: null,
      endpoints,
      frontendBindings,
      privacy: {
        publicCollectionReadBlocked: ordersApiReady,
        customerSafeFieldsOnly: true,
        includesRawCustomerContact: false,
        includesProviderExecutionIds: false,
        includesPaymentReferences: false,
        includesAddresses: false,
        includesInternalNotes: false,
        includesDigitalDeliveryUrls: false,
        includesDownloadMediaIds: false,
        excludedFields: [
          'email',
          'phone',
          'customerid',
          'checkoutsessionid',
          'statusaccesstokenhash',
          'statusaccesstokenissuedat',
          'statusaccesstokenexpiresat',
          'shippingaddress',
          'billingaddress',
          'notes',
          'paymentreference',
          'shippinglabelid',
          'shippinglabelurl',
          'fulfillmentid',
          'fulfillmentpayload',
          'providerrefundid',
          'providerrefundreference',
          'providerrefundpayload',
          'downloadurl',
          'downloadmediaid',
          'downloadmediaorganization',
          'digitaldeliverypayload',
        ],
      },
      actionPlan: null,
      operationImpact,
      checks,
      nextSteps: ['Select an order from the queue or save the current draft before copying customer status JSON.'],
    };
  }

  const values = order.values;
  const currency = normalizeCurrency(String(values.currency || 'USD'));
  const orderNumber = String(readOrderValue(values, 'ordernumber', order.slug));
  const customerName = String(readOrderValue(values, 'customername', '') || '').trim();
  const email = String(values.email || '').trim();
  const phone = String(readOrderValue(values, 'phone', '') || '').trim();
  const orderStatus = asOrderStatus(readOrderValue(values, 'orderstatus', undefined));
  const paymentStatus = asPaymentStatus(readOrderValue(values, 'paymentstatus', undefined));
  const fulfillmentStatus = asFulfillmentStatus(readOrderValue(values, 'fulfillmentstatus', undefined));
  const trackingNumber = String(readOrderValue(values, 'trackingnumber', '') || '').trim();
  const trackingUrl = String(readOrderValue(values, 'trackingurl', '') || '').trim();
  const trackingStatus = String(readOrderValue(values, 'trackingstatus', '') || '').trim();
  const fulfillmentCarrier = String(readOrderValue(values, 'fulfillmentcarrier', '') || '').trim();
  const fulfilledAt = String(readOrderValue(values, 'fulfilledat', '') || '');
  const shippingLabelStatus = asShippingLabelStatus(readOrderValue(values, 'shippinglabelstatus', undefined));
  const shippingLabelProvider = String(readOrderValue(values, 'shippinglabelprovider', '') || '').trim();
  const shippingLabelId = String(readOrderValue(values, 'shippinglabelid', '') || '').trim();
  const providerRefundStatus = asProviderRefundStatus(readOrderValue(values, 'providerrefundstatus', undefined));
  const providerRefundId = String(readOrderValue(values, 'providerrefundid', '') || '').trim();
  const refundAmountValue = readOrderValue(values, 'refundamount', null);
  const refundAmount = refundAmountValue === null || refundAmountValue === undefined ? null : toNumber(refundAmountValue);
  const hasTracking = Boolean(trackingNumber || trackingUrl);
  const isClosed = orderStatus === 'cancelled' || paymentStatus === 'refunded' || orderStatus === 'refunded';
  const lineItems = parseOrderLineItems(values.items, currency);
  const digitalDelivery = buildOrderDigitalDeliveryHandoff(lineItems, paymentStatus, fulfillmentStatus);

  const checks: OrderStatusHandoffCheck[] = [
    {
      key: 'selected-order',
      label: 'Selected order',
      status: 'ready',
      detail: `${orderNumber} is selected with ${lineItems.length} line item${lineItems.length === 1 ? '' : 's'} and ${formatMoney(toNumber(values.total), currency)} total.`,
    },
    {
      key: 'customer-contact',
      label: 'Customer contact',
      status: email && customerName ? 'ready' : 'blocked',
      detail: email && customerName
        ? `${maskCustomerEmail(email)} can receive customer-safe status updates${customerProfile ? ' with a linked profile.' : '.'}`
        : 'Customer name and email are required before customer status can be projected.',
    },
    {
      key: 'payment-status',
      label: 'Payment status',
      status: paymentStatus === 'failed' ? 'blocked' : paymentStatus === 'pending' ? 'attention' : 'ready',
      detail: paymentStatus === 'paid'
        ? 'Payment is paid and the customer status view can proceed to fulfillment state.'
        : paymentStatus === 'refunded'
          ? 'Payment is refunded and the customer status view can show the order as closed.'
          : paymentStatus === 'failed'
            ? 'Payment failed; customer status should direct the buyer to support or retry flow.'
            : 'Payment is still pending; keep the customer status view in a checkout-confirmation state.',
    },
    {
      key: 'fulfillment-tracking',
      label: 'Fulfillment and tracking',
      status: isClosed || fulfillmentStatus === 'fulfilled' || hasTracking
        ? 'ready'
        : paymentStatus === 'paid' || fulfillmentStatus === 'processing'
          ? 'attention'
          : 'ready',
      detail: isClosed
        ? 'Order is closed; customer status can show cancellation or refund state.'
        : fulfillmentStatus === 'fulfilled'
          ? hasTracking
            ? 'Fulfillment is complete and tracking details are available.'
            : 'Fulfillment is complete; tracking is optional for digital or pickup orders.'
          : hasTracking
            ? 'Tracking details are present while fulfillment continues.'
            : paymentStatus === 'paid'
              ? 'Paid order still needs fulfillment or tracking metadata.'
              : 'Tracking will become available after payment and fulfillment progress.',
    },
    {
      key: 'refund-status',
      label: 'Refund and return',
      status: providerRefundStatus === 'failed' || providerRefundStatus === 'requires_action'
        ? 'blocked'
        : providerRefundStatus === 'requested'
          ? 'attention'
          : 'ready',
      detail: providerRefundStatus === 'succeeded' || paymentStatus === 'refunded' || (refundAmount || 0) > 0
        ? 'Refund or return metadata is present for customer support.'
        : providerRefundStatus === 'requested'
          ? 'Provider refund is requested and should be refreshed before promising a final customer state.'
          : providerRefundStatus === 'failed' || providerRefundStatus === 'requires_action'
            ? 'Provider refund needs operator action before customer-facing status is final.'
            : 'No refund or return is active for this order.',
    },
    {
      key: 'digital-delivery',
      label: 'Digital delivery',
      status: digitalDelivery.status === 'attention' ? 'attention' : 'ready',
      detail: digitalDelivery.customerAction,
    },
    {
      key: 'private-order-queue',
      label: 'Customer portal safety',
      status: ordersApiReady ? 'ready' : 'blocked',
      detail: ordersApiReady
        ? 'Raw order collection access is blocked; this handoff only exposes a bounded customer-safe projection.'
        : 'Orders collection privacy or schema readiness needs repair before customer status projection.',
    },
    {
      key: 'operation-plan',
      label: 'Operation action plan',
      status: !orderOperationPlan ? 'attention' : orderOperationPlan.attention ? 'attention' : 'ready',
      detail: orderOperationPlan?.recommendation || 'Operation action plan is unavailable until the order is loaded into the queue.',
    },
  ];
  const status = summarizeOrderStatus(checks);
  const readyCount = checks.filter((check) => check.status === 'ready').length;
  const nextSteps = checks
    .filter((check) => check.status !== 'ready')
    .map((check) => check.detail)
    .slice(0, 4);
  const operationImpact = buildOrderOperationImpact({
    activeSiteId,
    generatedAt,
    order,
    actionPlan: orderOperationPlan,
    providerReadinessChecks,
    statusHandoffStatus: status,
    frontendBindings,
    ordersApiReady,
  });

  return {
    schemaVersion: 'backy.order-status-handoff.v1',
    generatedAt,
    source: 'admin-orders-ui',
    status,
    score: Math.round((readyCount / checks.length) * 100),
    selectedSiteId: activeSiteId,
    order: {
      id: order.id,
      slug: order.slug,
      orderNumber,
      recordStatus: order.status,
      total: toNumber(values.total),
      currency,
      itemCount: lineItems.length,
      orderStatus,
      paymentStatus,
      fulfillmentStatus,
      createdAt: order.createdAt || '',
      updatedAt: order.updatedAt || '',
    },
    customer: {
      displayName: customerName,
      maskedEmail: maskCustomerEmail(email),
      maskedPhone: maskCustomerPhone(phone),
      customerProfileLinked: Boolean(customerProfile || readOrderValue(values, 'customerid', '')),
      customerProfileSlug: customerProfile?.slug || '',
      customerProfileStatus: String(customerProfile?.values?.status || ''),
    },
    tracking: {
      carrier: fulfillmentCarrier,
      trackingNumber,
      trackingUrl,
      trackingStatus,
      trackingLastCheckedAt: String(readOrderValue(values, 'trackinglastcheckedat', '') || ''),
      fulfilledAt,
      shippingLabelStatus,
      shippingLabelProvider,
      shippingLabelReferencePresent: Boolean(shippingLabelId || readOrderValue(values, 'shippinglabelurl', '')),
    },
    refund: {
      refundAmount,
      refundReasonPresent: Boolean(readOrderValue(values, 'refundreason', '')),
      providerRefundStatus,
      providerRefundProvider: String(readOrderValue(values, 'providerrefundprovider', '') || ''),
      providerRefundReferencePresent: Boolean(providerRefundId || readOrderValue(values, 'providerrefundreference', '')),
      providerRefundRequestedAt: String(readOrderValue(values, 'providerrefundrequestedat', '') || ''),
      providerRefundCompletedAt: String(readOrderValue(values, 'providerrefundcompletedat', '') || ''),
    },
    digitalDelivery,
    endpoints,
    frontendBindings,
    privacy: {
      publicCollectionReadBlocked: ordersApiReady,
      customerSafeFieldsOnly: true,
      includesRawCustomerContact: false,
      includesProviderExecutionIds: false,
      includesPaymentReferences: false,
      includesAddresses: false,
      includesInternalNotes: false,
      includesDigitalDeliveryUrls: false,
      includesDownloadMediaIds: false,
      excludedFields: [
        'email',
        'phone',
        'customerid',
        'checkoutsessionid',
        'statusaccesstokenhash',
        'statusaccesstokenissuedat',
        'statusaccesstokenexpiresat',
        'shippingaddress',
        'billingaddress',
        'notes',
        'paymentreference',
        'shippinglabelid',
        'shippinglabelurl',
        'fulfillmentid',
        'fulfillmentpayload',
        'providerrefundid',
        'providerrefundreference',
        'providerrefundpayload',
        'downloadurl',
        'downloadmediaid',
        'downloadmediaorganization',
        'digitaldeliverypayload',
      ],
    },
    actionPlan: orderOperationPlan,
    operationImpact,
    checks,
    nextSteps: nextSteps.length
      ? nextSteps
      : ['Customer status handoff is ready for order confirmation, tracking, refund, and support views.'],
  };
};

const buildOrderOperationActionPlan = (
  order: CollectionRecord,
  providerReadinessByKey: Map<string, ProviderReadinessCheck>,
): OrderOperationActionPlan => {
  const values = order.values;
  const orderStatus = asOrderStatus(readOrderValue(values, 'orderstatus', undefined));
  const paymentStatus = asPaymentStatus(readOrderValue(values, 'paymentstatus', undefined));
  const fulfillmentStatus = asFulfillmentStatus(readOrderValue(values, 'fulfillmentstatus', undefined));
  const shippingLabelStatus = asShippingLabelStatus(readOrderValue(values, 'shippinglabelstatus', undefined));
  const providerRefundStatus = asProviderRefundStatus(readOrderValue(values, 'providerrefundstatus', undefined));
  const paymentReference = String(readOrderValue(values, 'paymentreference', '') || '').trim();
  const trackingNumber = String(readOrderValue(values, 'trackingnumber', '') || '').trim();
  const shippingLabelId = String(readOrderValue(values, 'shippinglabelid', '') || '').trim();
  const fulfillmentId = String(readOrderValue(values, 'fulfillmentid', '') || '').trim();
  const providerRefundId = String(readOrderValue(values, 'providerrefundid', '') || '').trim();
  const checkoutSessionId = String(readOrderValue(values, 'checkoutsessionid', '') || '').trim();
  const providerRefundRetryable = providerRefundStatus === 'failed' || providerRefundStatus === 'requires_action';
  const providerRefundRefreshable = Boolean(providerRefundId) && providerRefundStatus !== 'succeeded';
  const providerReady = (key: string) => providerReadinessByKey.get(key)?.ready === true;
  const quoteProvidersReady = ['tax-quote', 'shipping-quote', 'discount-quote'].every(providerReady);

  const action = (
    key: OrderOperationActionKey,
    label: string,
    enabled: boolean,
    ready: boolean,
    blockedReason: string,
    handoffReason: string,
    readyReason: string,
  ): OrderOperationAction => ({
    key,
    label,
    enabled,
    executionMode: !enabled ? 'blocked' : ready ? 'provider-ready' : 'manual-handoff',
    reason: !enabled ? blockedReason : ready ? readyReason : handoffReason,
  });

  const availableActions: OrderOperationAction[] = [
    action(
      'refresh-quote',
      'Refresh quote',
      orderStatus !== 'cancelled' && paymentStatus !== 'refunded',
      quoteProvidersReady,
      orderStatus === 'cancelled' ? 'Cancelled orders cannot be repriced.' : 'Refunded orders should not be repriced.',
      'One or more tax, shipping, or discount providers are not executable; quote refresh will use configured manual/fallback rules.',
      'Tax, shipping, and discount quote providers are ready for recalculation.',
    ),
    action(
      'prepare-label',
      'Prepare label',
      !(shippingLabelId && shippingLabelStatus !== 'voided') && fulfillmentStatus !== 'fulfilled' && fulfillmentStatus !== 'cancelled',
      providerReady('carrier-labels'),
      shippingLabelId && shippingLabelStatus !== 'voided'
        ? 'This order already has an active shipping label.'
        : fulfillmentStatus === 'fulfilled'
          ? 'Fulfilled orders do not need a new label.'
          : 'Cancelled fulfillment cannot receive a new label.',
      'Carrier label credentials are not executable; Backy will persist a manual label handoff.',
      'Carrier label execution is ready for this order.',
    ),
    action(
      'refresh-tracking',
      'Refresh tracking',
      Boolean(trackingNumber || shippingLabelId) && fulfillmentStatus !== 'cancelled',
      providerReady('carrier-labels'),
      trackingNumber || shippingLabelId ? 'Cancelled fulfillment cannot refresh tracking.' : 'Add a tracking number or provider label before refreshing tracking.',
      'Carrier tracking credentials are not executable; Backy will keep manual tracking metadata.',
      'Carrier tracking execution is ready for this order.',
    ),
    action(
      'dispatch-fulfillment',
      'Dispatch fulfillment',
      paymentStatus === 'paid' && !fulfillmentId && fulfillmentStatus !== 'fulfilled' && fulfillmentStatus !== 'cancelled',
      providerReady('fulfillment-dispatch'),
      paymentStatus !== 'paid'
        ? 'Payment must be paid before dispatching fulfillment.'
        : fulfillmentId
          ? 'Fulfillment has already been dispatched.'
          : fulfillmentStatus === 'fulfilled'
            ? 'Order is already fulfilled.'
            : 'Cancelled fulfillment cannot be dispatched.',
      'Warehouse or 3PL execution is not configured; Backy will persist a manual dispatch handoff.',
      'Warehouse or 3PL dispatch execution is ready.',
    ),
    action(
      'provider-refund',
      providerRefundRetryable ? 'Retry provider refund' : 'Provider refund',
      paymentStatus !== 'pending' && paymentStatus !== 'failed' && (!providerRefundId || providerRefundRetryable),
      providerReady('payment-refund-providers'),
      paymentStatus === 'pending' || paymentStatus === 'failed'
        ? 'Captured payment is required before requesting a provider refund.'
        : 'This provider refund is already recorded and not retryable.',
      'No matching refund provider is executable; Backy will persist a manual refund handoff.',
      paymentReference ? 'Matching refund provider execution is ready.' : 'Refund provider is ready; confirm the payment reference before execution.',
    ),
    action(
      'refresh-provider-refund',
      'Refresh provider refund',
      providerRefundRefreshable,
      providerReady('payment-refund-providers'),
      providerRefundId ? 'Succeeded provider refunds do not need refresh.' : 'Request a provider refund before refreshing provider status.',
      'Refund refresh credentials are not executable; Backy will keep the current provider refund handoff state.',
      'Provider refund status refresh is ready.',
    ),
  ];

  const recommendedAction: OrderOperationActionKey | 'none' = (() => {
    if (providerRefundRetryable) return providerRefundRefreshable ? 'refresh-provider-refund' : 'provider-refund';
    if (providerRefundStatus === 'requested') return providerRefundRefreshable ? 'refresh-provider-refund' : 'provider-refund';
    if (paymentStatus === 'paid' && fulfillmentStatus === 'unfulfilled' && !shippingLabelId) return 'prepare-label';
    if (paymentStatus === 'paid' && fulfillmentStatus !== 'fulfilled' && !fulfillmentId) return 'dispatch-fulfillment';
    if ((trackingNumber || shippingLabelId) && fulfillmentStatus !== 'cancelled' && fulfillmentStatus !== 'fulfilled') return 'refresh-tracking';
    if (checkoutSessionId && paymentStatus === 'pending') return 'refresh-quote';
    return 'none';
  })();

  const recommendation = (() => {
    if (recommendedAction !== 'none') {
      const selected = availableActions.find((item) => item.key === recommendedAction);
      return selected?.reason || 'Run the recommended order operation.';
    }
    if (orderStatus === 'cancelled') return 'Order is cancelled; no provider operation is currently recommended.';
    if (paymentStatus === 'refunded') return 'Payment is refunded; keep fulfillment and support notes current.';
    return 'No provider operation is currently required for this order.';
  })();

  const handoffRequired = availableActions.some((item) => item.enabled && item.executionMode === 'manual-handoff');
  const executableNow = availableActions.some((item) => item.enabled && item.executionMode === 'provider-ready');
  const attention = handoffRequired || providerRefundRetryable || providerRefundStatus === 'requested' || (
    paymentStatus === 'paid' && fulfillmentStatus !== 'fulfilled' && fulfillmentStatus !== 'cancelled'
  );

  return {
    schemaVersion: 'backy.order-operation-action-plan.v1',
    attention,
    recommendedAction,
    recommendation,
    handoffRequired,
    executableNow,
    availableActions,
  };
};

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

const normalizeOrderFieldMetadata = (field: CollectionField): CollectionField => {
  const normalized = { ...field };
  if (!['select', 'tags'].includes(normalized.type)) {
    delete normalized.options;
  }
  return normalized;
};

const mergeOrderFields = (currentFields: CollectionField[]): CollectionField[] => {
  const fieldsByKey = new Map(currentFields.map((field) => [field.key, field]));
  const merged = ORDER_FIELDS.map((requiredField) => {
    const currentField = fieldsByKey.get(requiredField.key);
    const mergedField = normalizeOrderFieldMetadata({
      ...requiredField,
      ...currentField,
      type: requiredField.type,
      required: requiredField.required,
      unique: requiredField.unique,
      sortOrder: requiredField.sortOrder,
    });
    if (requiredField.options) {
      mergedField.options = requiredField.options;
    }
    return mergedField;
  });
  const requiredKeys = new Set(ORDER_FIELDS.map((field) => field.key));
  const customFields = currentFields
    .filter((field) => !requiredKeys.has(field.key))
    .map(normalizeOrderFieldMetadata);
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

const lineItemBoolean = (value: unknown): boolean => (
  value === true ||
  value === 1 ||
  (typeof value === 'string' && ['true', '1', 'yes', 'download', 'digital'].includes(value.trim().toLowerCase()))
);

const lineItemProductType = (record: Record<string, unknown>): string => (
  lineItemText(record.productType || record.product_type || record.type || record.kind).toLowerCase()
);

const lineItemDeliveryMetadata = (record: Record<string, unknown>): Pick<OrderLineItem, 'productType' | 'digitalDeliveryConfigured' | 'downloadMediaPresent' | 'downloadUrlPresent'> => {
  const productType = lineItemProductType(record);
  const downloadMediaPresent = Boolean(lineItemText(record.downloadMediaId || record.download_media_id || record.mediaId || record.media_id));
  const downloadUrlPresent = Boolean(lineItemText(record.downloadUrl || record.download_url || record.deliveryUrl || record.delivery_url));
  const digitalFlag = lineItemBoolean(record.digitalDelivery) || lineItemBoolean(record.hasDigitalDelivery) || lineItemBoolean(record.downloadable);

  return {
    productType,
    digitalDeliveryConfigured: digitalFlag || downloadMediaPresent || downloadUrlPresent,
    downloadMediaPresent,
    downloadUrlPresent,
  };
};

const buildOrderDigitalDeliveryHandoff = (
  items: OrderLineItem[],
  paymentStatus: PaymentStatus,
  fulfillmentStatus: FulfillmentStatus,
): OrderDigitalDeliveryHandoff => {
  const digitalItems = items.filter((item) => item.productType === 'digital' || item.productType === 'download' || item.digitalDeliveryConfigured);
  const configuredItemCount = digitalItems.filter((item) => item.digitalDeliveryConfigured).length;
  const pendingItemCount = Math.max(0, digitalItems.length - configuredItemCount);
  const isPaid = paymentStatus === 'paid' || paymentStatus === 'refunded';
  const status: OrderDigitalDeliveryStatus = digitalItems.length === 0
    ? 'not-applicable'
    : pendingItemCount > 0
      ? 'attention'
      : fulfillmentStatus === 'fulfilled'
        ? 'fulfilled'
        : isPaid
          ? 'ready'
          : 'pending-payment';
  const customerAction = digitalItems.length === 0
    ? 'No digital delivery items were detected for this order.'
    : pendingItemCount > 0
      ? `${pendingItemCount} digital item${pendingItemCount === 1 ? '' : 's'} still need delivery metadata before customer portal handoff.`
      : status === 'pending-payment'
        ? 'Digital delivery is configured and will become customer-visible after payment is confirmed.'
        : status === 'fulfilled'
          ? 'Digital delivery items are configured and fulfillment is complete.'
          : 'Digital delivery items are configured for the customer-safe order status view.';

  return {
    schemaVersion: 'backy.order-digital-delivery-handoff.v1',
    itemCount: digitalItems.length,
    configuredItemCount,
    pendingItemCount,
    status,
    customerAction,
    customerSafeFieldsOnly: true,
    includesDownloadUrls: false,
    includesDownloadMediaIds: false,
  };
};

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
  const deliveryMetadata = lineItemDeliveryMetadata(record);

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
    ...deliveryMetadata,
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
      productType: item.productType || undefined,
      digitalDelivery: item.digitalDeliveryConfigured || undefined,
      downloadMediaAttached: item.downloadMediaPresent || undefined,
      downloadUrlAttached: item.downloadUrlPresent || undefined,
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
