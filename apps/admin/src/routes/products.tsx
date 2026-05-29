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
  MoreHorizontal,
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
  getSettings,
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
  bulkUpdateCollectionRecords,
  type Collection,
  type CollectionField,
  type CollectionRecord,
  type CollectionRecordPagination,
  type CommerceCronReadiness,
  type CommerceReconciliationResult,
  type CommerceProductProviderSyncResult,
  type ProductSubscriptionLifecycle,
  type ProductSubscriptionLifecycleAction,
  type SiteSettingsInput,
  type AdminUserPermissionMatrix,
  type OrderAnalytics,
  type OrderDeliveryEvent,
} from '@/lib/adminContentApi';
import { useStore, type ContentStatus, type MediaAsset } from '@/stores/mockStore';
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
import { getLocalBackendOrigin } from '@/lib/localBackendOrigin';
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

const PRODUCT_EDITOR_SECTIONS = [
  { id: 'products-editor-identity', label: 'Basics' },
  { id: 'products-editor-variants', label: 'Variants' },
  { id: 'products-editor-fulfillment', label: 'Fulfillment' },
  { id: 'products-editor-subscriptions', label: 'Subscriptions' },
  { id: 'products-editor-provider-sync', label: 'Provider sync' },
  { id: 'products-editor-media', label: 'Media' },
  { id: 'products-editor-publishing', label: 'Publishing' },
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
    detail: 'Product-scoped subscription order summary, lifecycle states, action-plan recommendations, provider readiness, certification scenario evidence, and bounded action history.',
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
      'BACKY_COMMERCE_DISCOUNT_PROVIDER_URL or COMMERCE_DISCOUNT_PROVIDER_URL',
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
    evidence: 'Live product subscription pause, resume, cancel, webhook, renewal, dunning, and cancellation evidence.',
  },
  {
    family: 'Mock provider regression',
    providers: ['Local provider mocks'],
    gate: 'ci:commerce-provider-smoke',
    requiredInputs: ['No live provider credentials required'],
    evidence: 'Repeatable local provider matrix without live credentials.',
  },
] as const;

const PRODUCT_PROVIDER_CERTIFICATION_OPERATOR_GATE = 'BACKY_COMMERCE_PROVIDER_CERTIFICATION_REQUIRED=1 npm run ci:commerce-provider-certification';
const PRODUCT_PROVIDER_CERTIFICATION_OUTPUT_ENV = 'BACKY_COMMERCE_CERTIFICATION_OUTPUT';
const PRODUCT_PROVIDER_CERTIFICATION_OUTPUT_ARTIFACT = 'artifacts/backy-commerce-provider-certification.json';
const PRODUCT_PROVIDER_CERTIFICATION_ARTIFACT_PATH_ENV = 'BACKY_COMMERCE_CERTIFICATION_ARTIFACT_PATH';
const PRODUCT_PROVIDER_CERTIFICATION_ARTIFACT_REQUIRED_ENV = 'BACKY_COMMERCE_CERTIFICATION_ARTIFACT_REQUIRED';
const PRODUCT_PROVIDER_CERTIFICATION_ARTIFACT_DOCTOR_COMMAND =
  `${PRODUCT_PROVIDER_CERTIFICATION_ARTIFACT_PATH_ENV}="$${PRODUCT_PROVIDER_CERTIFICATION_OUTPUT_ENV}" ${PRODUCT_PROVIDER_CERTIFICATION_ARTIFACT_REQUIRED_ENV}=1 npm run doctor:release-certification`;
const PRODUCT_PROVIDER_CERTIFICATION_PREFLIGHT_GATES = [
  'npm run test:commerce-provider-certification-preflight-contract',
  'BACKY_RELEASE_CERTIFICATION_DOCTOR_REQUIRED=1 npm run doctor:release-certification',
] as const;
const PRODUCT_PROVIDER_CERTIFICATION_SELECTORS = [
  'BACKY_COMMERCE_CERTIFY_PAYMENT=1 with BACKY_COMMERCE_CERTIFY_PAYMENT_PROVIDER',
  'BACKY_COMMERCE_CERTIFY_TAX=1 with BACKY_COMMERCE_CERTIFY_TAX_PROVIDER',
  'BACKY_COMMERCE_CERTIFY_SHIPPING=1 with BACKY_COMMERCE_CERTIFY_SHIPPING_PROVIDER',
  'BACKY_COMMERCE_CERTIFY_DISCOUNT=1 with BACKY_COMMERCE_CERTIFY_DISCOUNT_PROVIDER',
  'BACKY_COMMERCE_CERTIFY_CATALOG=1 with BACKY_COMMERCE_CERTIFY_CATALOG_PROVIDER',
  'BACKY_COMMERCE_CERTIFY_SUBSCRIPTIONS=1 with BACKY_COMMERCE_CERTIFY_SUBSCRIPTION_PROVIDER',
  'BACKY_COMMERCE_CERTIFY_WEBHOOKS=1 with BACKY_COMMERCE_CERTIFY_WEBHOOK_PROVIDER',
] as const;
const PRODUCT_PROVIDER_CERTIFICATION_EVIDENCE_EXPECTATIONS = [
  'commerce provider preflight output',
  'release certification doctor output',
  'safe local/external target summary',
  'selected provider-family flags',
  'runtime commerce diagnostic output',
  'credentialed provider readiness check output',
  'non-secret workflow summary without provider secrets',
] as const;
const PRODUCT_PROVIDER_CERTIFICATION_SCENARIOS = [
  {
    key: 'catalog-publication',
    label: 'Catalog publication',
    expectedEvidence: ['published product', 'public catalog response', 'storefront API handoff'],
    nextAction: 'Publish a product and verify the public catalog/detail APIs expose the storefront-safe product contract.',
  },
  {
    key: 'checkout-settlement',
    label: 'Checkout settlement',
    expectedEvidence: ['checkout-ready product', 'payment provider reference', 'private order record'],
    nextAction: 'Run a live checkout and verify Backy records the private paid order with provider reference evidence.',
  },
  {
    key: 'quote-adjustments',
    label: 'Quote adjustments',
    expectedEvidence: ['tax quote', 'shipping rate', 'discount adjustment'],
    nextAction: 'Refresh a checkout/order quote through the selected tax, shipping, and discount providers.',
  },
  {
    key: 'provider-catalog-sync',
    label: 'Provider catalog sync',
    expectedEvidence: ['provider product id', 'provider price id', 'sync status'],
    nextAction: 'Run provider catalog sync for a selected product and attach the non-secret sync result.',
  },
  {
    key: 'webhook-settlement',
    label: 'Webhook settlement',
    expectedEvidence: ['signed commerce webhook', 'idempotent order update', 'commerce-webhook event'],
    nextAction: 'Replay signed settlement webhooks against the configured provider and verify idempotent updates.',
  },
  {
    key: 'subscription-lifecycle',
    label: 'Subscription lifecycle',
    expectedEvidence: ['settled subscription checkout', 'renewal/dunning', 'pause/resume/cancel action'],
    nextAction: 'Run the product subscription lifecycle certification scenarios for the selected provider family.',
  },
  {
    key: 'inventory-automation',
    label: 'Inventory automation',
    expectedEvidence: ['inventory reservation', 'low-stock event', 'commerce-product event'],
    nextAction: 'Trigger checkout inventory reservation and low-stock automation for a physical product.',
  },
  {
    key: 'customer-signal',
    label: 'Customer and performance signal',
    expectedEvidence: ['private customer profile', 'paid order line', 'product performance row'],
    nextAction: 'Run checkout/customer profile intake and verify the catalog page shows product performance signal.',
  },
] as const;

const PRODUCT_PROVIDER_CERTIFICATION_PAYMENT_PROVIDER_OPTIONS = [
  { value: 'auto', label: 'Auto', description: 'Use the first configured live payment provider credential.' },
  { value: 'stripe', label: 'Stripe', description: 'Require Stripe checkout, refund, and webhook credentials.' },
  { value: 'paypal', label: 'PayPal', description: 'Require PayPal checkout credentials.' },
  { value: 'paddle', label: 'Paddle', description: 'Require Paddle checkout credentials.' },
  { value: 'square', label: 'Square', description: 'Require Square checkout credentials.' },
  { value: 'adyen', label: 'Adyen', description: 'Require Adyen API and merchant-account credentials.' },
  { value: 'mollie', label: 'Mollie', description: 'Require Mollie checkout credentials.' },
  { value: 'razorpay', label: 'Razorpay', description: 'Require Razorpay key id and secret credentials.' },
] as const;
const PRODUCT_PROVIDER_CERTIFICATION_TAX_PROVIDER_OPTIONS = [
  { value: 'auto', label: 'Auto', description: 'Use the first configured live tax credential.' },
  { value: 'stripe', label: 'Stripe Tax', description: 'Require Stripe Tax credentials.' },
  { value: 'taxjar', label: 'TaxJar', description: 'Require TaxJar credentials.' },
  { value: 'avalara', label: 'Avalara', description: 'Require Avalara account, license, and company code.' },
  { value: 'http', label: 'HTTP', description: 'Require a Settings tax quote provider URL.' },
] as const;
const PRODUCT_PROVIDER_CERTIFICATION_SHIPPING_PROVIDER_OPTIONS = [
  { value: 'auto', label: 'Auto', description: 'Use the first configured live shipping credential.' },
  { value: 'easypost', label: 'EasyPost', description: 'Require EasyPost carrier credentials.' },
  { value: 'shippo', label: 'Shippo', description: 'Require Shippo carrier credentials.' },
  { value: 'http', label: 'HTTP', description: 'Require a Settings shipping provider URL.' },
] as const;
const PRODUCT_PROVIDER_CERTIFICATION_DISCOUNT_PROVIDER_OPTIONS = [
  { value: 'auto', label: 'Auto', description: 'Use the first configured live discount credential or endpoint.' },
  { value: 'stripe', label: 'Stripe promotion codes', description: 'Require Stripe promotion-code lookup credentials.' },
  { value: 'http', label: 'HTTP', description: 'Require a Settings discount provider URL.' },
] as const;
const PRODUCT_PROVIDER_CERTIFICATION_CATALOG_PROVIDER_OPTIONS = [
  { value: 'auto', label: 'Auto', description: 'Use the first configured live catalog-sync credential.' },
  { value: 'shopify', label: 'Shopify', description: 'Require Shopify Admin credentials and store domain.' },
  { value: 'bigcommerce', label: 'BigCommerce', description: 'Require BigCommerce token and store hash.' },
  { value: 'woocommerce', label: 'WooCommerce', description: 'Require WooCommerce consumer credentials and store URL.' },
  { value: 'etsy', label: 'Etsy', description: 'Require Etsy access token, API key, and shop id.' },
  { value: 'magento', label: 'Magento', description: 'Require Magento access token and store URL.' },
  { value: 'http', label: 'HTTP', description: 'Require a Settings catalog-sync provider URL.' },
] as const;
const PRODUCT_PROVIDER_CERTIFICATION_SUBSCRIPTION_PROVIDER_OPTIONS = [
  ...PRODUCT_PROVIDER_CERTIFICATION_PAYMENT_PROVIDER_OPTIONS,
  { value: 'http', label: 'HTTP', description: 'Require a Settings subscription action provider URL.' },
] as const;
const PRODUCT_PROVIDER_CERTIFICATION_WEBHOOK_PROVIDER_OPTIONS = [
  ...PRODUCT_PROVIDER_CERTIFICATION_PAYMENT_PROVIDER_OPTIONS,
  { value: 'generic', label: 'Generic', description: 'Require a signed Backy commerce webhook secret only.' },
] as const;
const PRODUCT_SUBSCRIPTION_CERTIFICATION_SCENARIOS = [
  {
    key: 'settled-checkout',
    label: 'Settled checkout',
    expectedEvidence: ['checkout.session.completed', 'paid subscription order'],
    nextAction: 'Complete a live checkout and confirm the private order reaches active or renewal state.',
  },
  {
    key: 'renewal',
    label: 'Renewal',
    expectedEvidence: ['invoice.payment_succeeded', 'provider renewal webhook'],
    nextAction: 'Let a live provider renewal settle and verify the renewal state appears here.',
  },
  {
    key: 'dunning',
    label: 'Dunning',
    expectedEvidence: ['invoice.payment_failed', 'provider recovery state'],
    nextAction: 'Trigger or import a provider payment-failure event.',
  },
  {
    key: 'pause',
    label: 'Pause',
    expectedEvidence: ['customer.subscription.paused', 'pause action history'],
    nextAction: 'Run a pause action or receive a provider pause webhook.',
  },
  {
    key: 'resume',
    label: 'Resume',
    expectedEvidence: ['customer.subscription.resumed', 'resume action history'],
    nextAction: 'Run a resume action after pause or dunning.',
  },
  {
    key: 'trial-ending',
    label: 'Trial ending',
    expectedEvidence: ['customer.subscription.trial_will_end', 'trial-ending provider webhook'],
    nextAction: 'Trigger a provider trial-ending event.',
  },
  {
    key: 'cancellation',
    label: 'Cancellation',
    expectedEvidence: ['customer.subscription.deleted', 'cancel action history'],
    nextAction: 'Run or receive a live cancellation.',
  },
] as const;

type ProductProviderCertificationPaymentProvider = (typeof PRODUCT_PROVIDER_CERTIFICATION_PAYMENT_PROVIDER_OPTIONS)[number]['value'];
type ProductProviderCertificationTaxProvider = (typeof PRODUCT_PROVIDER_CERTIFICATION_TAX_PROVIDER_OPTIONS)[number]['value'];
type ProductProviderCertificationShippingProvider = (typeof PRODUCT_PROVIDER_CERTIFICATION_SHIPPING_PROVIDER_OPTIONS)[number]['value'];
type ProductProviderCertificationDiscountProvider = (typeof PRODUCT_PROVIDER_CERTIFICATION_DISCOUNT_PROVIDER_OPTIONS)[number]['value'];
type ProductProviderCertificationCatalogProvider = (typeof PRODUCT_PROVIDER_CERTIFICATION_CATALOG_PROVIDER_OPTIONS)[number]['value'];
type ProductProviderCertificationSubscriptionProvider = (typeof PRODUCT_PROVIDER_CERTIFICATION_SUBSCRIPTION_PROVIDER_OPTIONS)[number]['value'];
type ProductProviderCertificationWebhookProvider = (typeof PRODUCT_PROVIDER_CERTIFICATION_WEBHOOK_PROVIDER_OPTIONS)[number]['value'];
type ProductProviderCertificationEvidencePacketStatus =
  | 'no-family-selected'
  | 'needs-credentials'
  | 'needs-scenario-evidence'
  | 'evidence-complete';

type ProductProviderCertificationCommandOptions = {
  certifyPayment: boolean;
  paymentProvider: ProductProviderCertificationPaymentProvider;
  certifyTax: boolean;
  taxProvider: ProductProviderCertificationTaxProvider;
  certifyShipping: boolean;
  shippingProvider: ProductProviderCertificationShippingProvider;
  certifyDiscount: boolean;
  discountProvider: ProductProviderCertificationDiscountProvider;
  certifyCatalog: boolean;
  catalogProvider: ProductProviderCertificationCatalogProvider;
  certifySubscriptions: boolean;
  subscriptionProvider: ProductProviderCertificationSubscriptionProvider;
  certifyWebhooks: boolean;
  webhookProvider: ProductProviderCertificationWebhookProvider;
  siteId: string;
  externalBaseUrl: string;
  includeReleaseDoctor: boolean;
};

interface ProductProviderCertificationEvidencePacket {
  schemaVersion: 'backy.commerce-provider-certification-evidence-packet.v1';
  generatedAt: string;
  selectedSiteId: string;
  status: ProductProviderCertificationEvidencePacketStatus;
  operatorNextAction: {
    status: ProductProviderCertificationEvidencePacketStatus;
    label: string;
    detail: string;
    command: string;
    missingFamilies: string[];
    missingScenarios: string[];
    artifactEnv: typeof PRODUCT_PROVIDER_CERTIFICATION_OUTPUT_ENV;
    artifactPath: typeof PRODUCT_PROVIDER_CERTIFICATION_OUTPUT_ARTIFACT;
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
    productProviderSyncApi: string;
    orderAnalyticsApi: string;
    publicCatalogApi: string;
  };
  redactionPolicy: {
    includesProviderSecrets: false;
    includesCustomerPayloads: false;
    includesPrivateOrderPayloads: false;
    includesWebhookBodies: false;
    allowedEvidence: string[];
  };
  secretHandling: string;
}

const DEFAULT_PRODUCT_PROVIDER_CERTIFICATION_COMMAND_OPTIONS = {
  certifyPayment: true,
  paymentProvider: 'auto',
  certifyTax: true,
  taxProvider: 'auto',
  certifyShipping: true,
  shippingProvider: 'auto',
  certifyDiscount: true,
  discountProvider: 'auto',
  certifyCatalog: true,
  catalogProvider: 'auto',
  certifySubscriptions: true,
  subscriptionProvider: 'auto',
  certifyWebhooks: true,
  webhookProvider: 'auto',
  siteId: 'site-demo',
  externalBaseUrl: '',
  includeReleaseDoctor: true,
} satisfies ProductProviderCertificationCommandOptions;

const quoteProductShellValue = (value: string): string => `'${value.replace(/'/g, "'\\''")}'`;
const quoteProductEnvTemplateValue = (value: string): string => (
  /^[A-Za-z0-9_./:@-]+$/.test(value) ? value : quoteProductShellValue(value)
);
const productBoolEnv = (value: boolean): '1' | '0' => (value ? '1' : '0');
const uniqueProductCertificationInputs = (values: string[]): string[] => Array.from(new Set(values.filter(Boolean)));
const productProviderCertificationOptionLabel = <Value extends string>(
  options: ReadonlyArray<{ readonly value: Value; readonly label: string }>,
  value: Value,
): string => options.find((option) => option.value === value)?.label || value;
const hasProductProviderCertificationFamily = (options: ProductProviderCertificationCommandOptions): boolean => (
  options.certifyPayment ||
  options.certifyTax ||
  options.certifyShipping ||
  options.certifyDiscount ||
  options.certifyCatalog ||
  options.certifySubscriptions ||
  options.certifyWebhooks
);

const PRODUCT_PROVIDER_CERTIFICATION_PAYMENT_INPUTS: Record<ProductProviderCertificationPaymentProvider, string[]> = {
  auto: [
    'at least one live payment provider credential',
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

const PRODUCT_PROVIDER_CERTIFICATION_TAX_INPUTS: Record<ProductProviderCertificationTaxProvider, string[]> = {
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

const PRODUCT_PROVIDER_CERTIFICATION_SHIPPING_INPUTS: Record<ProductProviderCertificationShippingProvider, string[]> = {
  auto: [
    'BACKY_EASYPOST_API_KEY or EASYPOST_API_KEY',
    'BACKY_SHIPPO_API_KEY or SHIPPO_API_KEY',
    'BACKY_COMMERCE_SHIPPING_PROVIDER_URL or COMMERCE_SHIPPING_PROVIDER_URL',
  ],
  easypost: ['BACKY_EASYPOST_API_KEY or EASYPOST_API_KEY'],
  shippo: ['BACKY_SHIPPO_API_KEY or SHIPPO_API_KEY'],
  http: ['BACKY_COMMERCE_SHIPPING_PROVIDER_URL or COMMERCE_SHIPPING_PROVIDER_URL'],
};

const PRODUCT_PROVIDER_CERTIFICATION_DISCOUNT_INPUTS: Record<ProductProviderCertificationDiscountProvider, string[]> = {
  auto: [
    'BACKY_STRIPE_SECRET_KEY or STRIPE_SECRET_KEY',
    'BACKY_COMMERCE_DISCOUNT_PROVIDER_URL or COMMERCE_DISCOUNT_PROVIDER_URL',
  ],
  stripe: ['BACKY_STRIPE_SECRET_KEY or STRIPE_SECRET_KEY'],
  http: ['BACKY_COMMERCE_DISCOUNT_PROVIDER_URL or COMMERCE_DISCOUNT_PROVIDER_URL'],
};

const PRODUCT_PROVIDER_CERTIFICATION_CATALOG_INPUTS: Record<ProductProviderCertificationCatalogProvider, string[]> = {
  auto: [
    'at least one live catalog sync provider credential',
    'BACKY_SHOPIFY_ADMIN_ACCESS_TOKEN plus BACKY_SHOPIFY_STORE_DOMAIN',
    'BACKY_BIGCOMMERCE_ACCESS_TOKEN plus BACKY_BIGCOMMERCE_STORE_HASH',
    'BACKY_WOOCOMMERCE_CONSUMER_KEY/SECRET plus BACKY_WOOCOMMERCE_STORE_URL',
    'BACKY_ETSY_ACCESS_TOKEN/BACKY_ETSY_API_KEY plus BACKY_ETSY_SHOP_ID',
    'BACKY_MAGENTO_ACCESS_TOKEN plus BACKY_MAGENTO_STORE_URL',
    'BACKY_COMMERCE_PRODUCT_SYNC_URL or COMMERCE_PRODUCT_SYNC_URL',
  ],
  shopify: ['BACKY_SHOPIFY_ADMIN_ACCESS_TOKEN plus BACKY_SHOPIFY_STORE_DOMAIN'],
  bigcommerce: ['BACKY_BIGCOMMERCE_ACCESS_TOKEN plus BACKY_BIGCOMMERCE_STORE_HASH'],
  woocommerce: ['BACKY_WOOCOMMERCE_CONSUMER_KEY/SECRET plus BACKY_WOOCOMMERCE_STORE_URL'],
  etsy: ['BACKY_ETSY_ACCESS_TOKEN/BACKY_ETSY_API_KEY plus BACKY_ETSY_SHOP_ID'],
  magento: ['BACKY_MAGENTO_ACCESS_TOKEN plus BACKY_MAGENTO_STORE_URL'],
  http: ['BACKY_COMMERCE_PRODUCT_SYNC_URL or COMMERCE_PRODUCT_SYNC_URL'],
};

const PRODUCT_PROVIDER_CERTIFICATION_SUBSCRIPTION_INPUTS: Record<ProductProviderCertificationSubscriptionProvider, string[]> = {
  ...PRODUCT_PROVIDER_CERTIFICATION_PAYMENT_INPUTS,
  http: ['BACKY_COMMERCE_SUBSCRIPTION_ACTION_URL or COMMERCE_SUBSCRIPTION_ACTION_URL'],
};

const PRODUCT_PROVIDER_CERTIFICATION_WEBHOOK_INPUTS: Record<ProductProviderCertificationWebhookProvider, string[]> = {
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

const buildProductProviderCertificationEnvEntries = (
  options: ProductProviderCertificationCommandOptions,
): Array<[string, string]> => {
  const selectedFamily = hasProductProviderCertificationFamily(options);
  const externalBaseUrl = options.externalBaseUrl.trim().replace(/\/+$/, '');
  const siteId = options.siteId.trim() || 'site-demo';
  const envEntries: Array<[string, string]> = [
    ['BACKY_COMMERCE_PROVIDER_CERTIFICATION_REQUIRED', productBoolEnv(selectedFamily)],
    ['BACKY_COMMERCE_CERTIFY_SITE_ID', siteId],
    [PRODUCT_PROVIDER_CERTIFICATION_OUTPUT_ENV, PRODUCT_PROVIDER_CERTIFICATION_OUTPUT_ARTIFACT],
    ['BACKY_COMMERCE_CERTIFY_PAYMENT', productBoolEnv(options.certifyPayment)],
    ['BACKY_COMMERCE_CERTIFY_PAYMENT_PROVIDER', options.paymentProvider],
    ['BACKY_COMMERCE_CERTIFY_TAX', productBoolEnv(options.certifyTax)],
    ['BACKY_COMMERCE_CERTIFY_TAX_PROVIDER', options.taxProvider],
    ['BACKY_COMMERCE_CERTIFY_SHIPPING', productBoolEnv(options.certifyShipping)],
    ['BACKY_COMMERCE_CERTIFY_SHIPPING_PROVIDER', options.shippingProvider],
    ['BACKY_COMMERCE_CERTIFY_DISCOUNT', productBoolEnv(options.certifyDiscount)],
    ['BACKY_COMMERCE_CERTIFY_DISCOUNT_PROVIDER', options.discountProvider],
    ['BACKY_COMMERCE_CERTIFY_CATALOG', productBoolEnv(options.certifyCatalog)],
    ['BACKY_COMMERCE_CERTIFY_CATALOG_PROVIDER', options.catalogProvider],
    ['BACKY_COMMERCE_CERTIFY_SUBSCRIPTIONS', productBoolEnv(options.certifySubscriptions)],
    ['BACKY_COMMERCE_CERTIFY_SUBSCRIPTION_PROVIDER', options.subscriptionProvider],
    ['BACKY_COMMERCE_CERTIFY_WEBHOOKS', productBoolEnv(options.certifyWebhooks)],
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
  if (options.certifyCatalog && options.catalogProvider === 'http') {
    envEntries.push(['BACKY_COMMERCE_PRODUCT_SYNC_URL', '<https-product-sync-url>']);
  }
  if (options.certifySubscriptions && options.subscriptionProvider === 'http') {
    envEntries.push(['BACKY_COMMERCE_SUBSCRIPTION_ACTION_URL', '<https-subscription-action-url>']);
  }

  return envEntries;
};

const buildProductProviderCertificationCommand = (options: ProductProviderCertificationCommandOptions): string => {
  const selectedFamily = hasProductProviderCertificationFamily(options);
  const envEntries = buildProductProviderCertificationEnvEntries(options);
  const commands = selectedFamily
    ? [
        'npm run ci:commerce-provider-certification',
        ...(options.includeReleaseDoctor ? [PRODUCT_PROVIDER_CERTIFICATION_ARTIFACT_DOCTOR_COMMAND] : []),
      ]
    : ['# Select at least one commerce provider family before running certification.'];

  return [
    ...envEntries.map(([key, value]) => `export ${key}=${quoteProductShellValue(value)}`),
    '',
    ...(options.includeReleaseDoctor ? ['npm run doctor:release-certification'] : []),
    ...commands,
  ].join('\n');
};

const buildProductProviderCertificationEnvTemplate = (options: ProductProviderCertificationCommandOptions): string => {
  const envEntries = buildProductProviderCertificationEnvEntries(options);

  return [
    '# Backy commerce provider certification environment',
    '# Keep real provider credential values in CI secrets or local shell variables.',
    ...envEntries.map(([key, value]) => `${key}=${quoteProductEnvTemplateValue(value)}`),
  ].join('\n');
};

const buildProductProviderCertificationRequiredInputs = (options: ProductProviderCertificationCommandOptions): string[] => {
  const externalBaseUrl = options.externalBaseUrl.trim();
  return uniqueProductCertificationInputs([
    hasProductProviderCertificationFamily(options) ? 'BACKY_COMMERCE_PROVIDER_CERTIFICATION_REQUIRED=1' : '',
    hasProductProviderCertificationFamily(options) ? 'BACKY_COMMERCE_CERTIFY_SITE_ID' : '',
    hasProductProviderCertificationFamily(options) ? `${PRODUCT_PROVIDER_CERTIFICATION_OUTPUT_ENV}=${PRODUCT_PROVIDER_CERTIFICATION_OUTPUT_ARTIFACT}` : '',
    hasProductProviderCertificationFamily(options) ? `${PRODUCT_PROVIDER_CERTIFICATION_ARTIFACT_PATH_ENV} or BACKY_COMMERCE_CERTIFICATION_ARTIFACT` : '',
    hasProductProviderCertificationFamily(options) ? `${PRODUCT_PROVIDER_CERTIFICATION_ARTIFACT_REQUIRED_ENV}=1 or BACKY_PROVIDER_CERTIFICATION_ARTIFACTS_REQUIRED=1` : '',
    options.certifyPayment ? 'BACKY_COMMERCE_CERTIFY_PAYMENT=1' : '',
    options.certifyPayment ? 'BACKY_COMMERCE_CERTIFY_PAYMENT_PROVIDER' : '',
    ...(options.certifyPayment ? PRODUCT_PROVIDER_CERTIFICATION_PAYMENT_INPUTS[options.paymentProvider] : []),
    options.certifyTax ? 'BACKY_COMMERCE_CERTIFY_TAX=1' : '',
    options.certifyTax ? 'BACKY_COMMERCE_CERTIFY_TAX_PROVIDER' : '',
    ...(options.certifyTax ? PRODUCT_PROVIDER_CERTIFICATION_TAX_INPUTS[options.taxProvider] : []),
    options.certifyShipping ? 'BACKY_COMMERCE_CERTIFY_SHIPPING=1' : '',
    options.certifyShipping ? 'BACKY_COMMERCE_CERTIFY_SHIPPING_PROVIDER' : '',
    ...(options.certifyShipping ? PRODUCT_PROVIDER_CERTIFICATION_SHIPPING_INPUTS[options.shippingProvider] : []),
    options.certifyDiscount ? 'BACKY_COMMERCE_CERTIFY_DISCOUNT=1' : '',
    options.certifyDiscount ? 'BACKY_COMMERCE_CERTIFY_DISCOUNT_PROVIDER' : '',
    ...(options.certifyDiscount ? PRODUCT_PROVIDER_CERTIFICATION_DISCOUNT_INPUTS[options.discountProvider] : []),
    options.certifyCatalog ? 'BACKY_COMMERCE_CERTIFY_CATALOG=1' : '',
    options.certifyCatalog ? 'BACKY_COMMERCE_CERTIFY_CATALOG_PROVIDER' : '',
    ...(options.certifyCatalog ? PRODUCT_PROVIDER_CERTIFICATION_CATALOG_INPUTS[options.catalogProvider] : []),
    options.certifySubscriptions ? 'BACKY_COMMERCE_CERTIFY_SUBSCRIPTIONS=1' : '',
    options.certifySubscriptions ? 'BACKY_COMMERCE_CERTIFY_SUBSCRIPTION_PROVIDER' : '',
    ...(options.certifySubscriptions ? PRODUCT_PROVIDER_CERTIFICATION_SUBSCRIPTION_INPUTS[options.subscriptionProvider] : []),
    options.certifyWebhooks ? 'BACKY_COMMERCE_CERTIFY_WEBHOOKS=1' : '',
    options.certifyWebhooks ? 'BACKY_COMMERCE_CERTIFY_WEBHOOK_PROVIDER' : '',
    ...(options.certifyWebhooks ? PRODUCT_PROVIDER_CERTIFICATION_WEBHOOK_INPUTS[options.webhookProvider] : []),
    externalBaseUrl ? 'BACKY_COMMERCE_CERTIFICATION_BASE_URL' : '',
    externalBaseUrl ? 'BACKY_ADMIN_API_KEY or BACKY_COMMERCE_CERTIFICATION_ADMIN_KEY' : '',
    options.includeReleaseDoctor ? 'BACKY_RELEASE_CERTIFICATION_DOCTOR_REQUIRED=1' : '',
  ]);
};

const PRODUCT_PROVIDER_CERTIFICATION_OPERATOR_COMMAND_TEMPLATE = {
  command: buildProductProviderCertificationCommand(DEFAULT_PRODUCT_PROVIDER_CERTIFICATION_COMMAND_OPTIONS),
  envTemplate: buildProductProviderCertificationEnvTemplate(DEFAULT_PRODUCT_PROVIDER_CERTIFICATION_COMMAND_OPTIONS),
  envTemplateSchemaVersion: 'backy.commerce-provider-certification-env-template.v1',
  providerChoices: {
    payment: PRODUCT_PROVIDER_CERTIFICATION_PAYMENT_PROVIDER_OPTIONS.map((option) => option.value),
    tax: PRODUCT_PROVIDER_CERTIFICATION_TAX_PROVIDER_OPTIONS.map((option) => option.value),
    shipping: PRODUCT_PROVIDER_CERTIFICATION_SHIPPING_PROVIDER_OPTIONS.map((option) => option.value),
    discount: PRODUCT_PROVIDER_CERTIFICATION_DISCOUNT_PROVIDER_OPTIONS.map((option) => option.value),
    catalog: PRODUCT_PROVIDER_CERTIFICATION_CATALOG_PROVIDER_OPTIONS.map((option) => option.value),
    subscription: PRODUCT_PROVIDER_CERTIFICATION_SUBSCRIPTION_PROVIDER_OPTIONS.map((option) => option.value),
    webhook: PRODUCT_PROVIDER_CERTIFICATION_WEBHOOK_PROVIDER_OPTIONS.map((option) => option.value),
  },
  requiredInputs: buildProductProviderCertificationRequiredInputs(DEFAULT_PRODUCT_PROVIDER_CERTIFICATION_COMMAND_OPTIONS),
  targetInputs: [
    'BACKY_COMMERCE_CERTIFICATION_BASE_URL',
    'BACKY_COMMERCE_CERTIFY_SITE_ID',
    `${PRODUCT_PROVIDER_CERTIFICATION_OUTPUT_ENV}=${PRODUCT_PROVIDER_CERTIFICATION_OUTPUT_ARTIFACT}`,
    `${PRODUCT_PROVIDER_CERTIFICATION_ARTIFACT_PATH_ENV} or BACKY_COMMERCE_CERTIFICATION_ARTIFACT`,
    `${PRODUCT_PROVIDER_CERTIFICATION_ARTIFACT_REQUIRED_ENV}=1 or BACKY_PROVIDER_CERTIFICATION_ARTIFACTS_REQUIRED=1`,
    'BACKY_ADMIN_API_KEY or BACKY_COMMERCE_CERTIFICATION_ADMIN_KEY',
  ],
  secretHandling: 'Provider credential values stay in CI secrets or local shell environment variables; this template only emits non-secret aliases and placeholders.',
};

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

type CommerceProviderSettings = NonNullable<NonNullable<SiteSettingsInput['integrations']>['commerce']>;
type RuntimeCommerceSettings = NonNullable<SiteSettingsInput['runtimeCommerce']>;

interface ProductsSearch {
  siteId?: string;
  status?: ProductStatusFilter;
  type?: ProductTypeFilter;
  stock?: ProductStockFilter;
  category?: string;
  q?: string;
  productId?: string;
  frontendTemplate?: string;
  quickCreate?: ProductQuickCreateIntent;
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
  downloadMediaId: string;
  downloadMediaName: string;
  downloadMediaType: string;
  downloadMediaFolderId: string;
  downloadMediaFolderPath: string;
  downloadMediaVisibility: string;
  downloadMediaScope: string;
  downloadMediaScopeTargetId: string;
  downloadMediaOrganization: Record<string, unknown> | null;
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

type ProductQuickCreateIntent = 'product';

const isProductQuickCreateIntent = (value: unknown): value is ProductQuickCreateIntent => (
  value === 'product'
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
    quickCreate: isProductQuickCreateIntent(search.quickCreate) ? search.quickCreate : undefined,
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

type ProductLaunchReadinessStatus = 'ready' | 'attention' | 'blocked';

interface ProductLaunchReadinessCheck {
  key: string;
  label: string;
  status: ProductLaunchReadinessStatus;
  detail: string;
  action: string;
  evidence: string[];
}

interface ProductLaunchReadiness {
  schemaVersion: 'backy.product-launch-readiness.v1';
  generatedAt: string;
  product: {
    id: string | null;
    slug: string | null;
    title: string;
    sku: string;
    status: string;
    productType: ProductFormState['productType'] | null;
  };
  summary: {
    status: ProductLaunchReadinessStatus;
    score: number;
    readyCount: number;
    totalChecks: number;
    blockerCount: number;
    attentionCount: number;
  };
  storefront: {
    catalogApi: string;
    productApi: string;
    orderIntakeApi: string;
    orderIntakeReady: boolean;
    productApiReady: boolean;
  };
  checks: ProductLaunchReadinessCheck[];
  actionPlan: {
    nextSteps: Array<{
      key: string;
      label: string;
      priority: 'blocker' | 'attention';
      action: string;
    }>;
    handoffSurfaces: string[];
  };
}

interface ProductDesignReadiness {
  schemaVersion: 'backy.product-design-readiness.v1';
  status: ProductLaunchReadinessStatus;
  templateId: string | null;
  hasDesign: boolean;
  hasContentDocument: boolean;
  hasEditableMap: boolean;
  hasDataBindings: boolean;
  counts: {
    elements: number;
    animations: number;
    assets: number;
    bindingHints: number;
  };
  missing: string[];
  detail: string;
  nextAction: string;
  evidence: string[];
  secretHandling: string;
}

interface ProductSellabilityImpact {
  schemaVersion: 'backy.product-sellability-impact.v1';
  generatedAt: string;
  selectedSiteId: string;
  product: {
    id: string | null;
    slug: string | null;
    title: string;
    sku: string;
    status: string;
    scheduledAt: string | null;
    path: string | null;
    productType: ProductFormState['productType'] | null;
  };
  readiness: {
    schemaVersion: ProductLaunchReadiness['schemaVersion'];
    status: ProductLaunchReadinessStatus;
    score: number;
    blockerCount: number;
    attentionCount: number;
    blockingChecks: ProductLaunchReadinessCheck[];
    attentionChecks: ProductLaunchReadinessCheck[];
  };
  storefront: {
    catalogApi: string;
    productApi: string;
    orderIntakeApi: string;
    productApiReady: boolean;
    orderIntakeReady: boolean;
  };
  pricing: {
    price: number;
    currency: string;
    ready: boolean;
  } | null;
  inventory: {
    inventory: number;
    lowStockThreshold: number;
    inventoryPolicy: ProductFormState['inventoryPolicy'];
    inStock: boolean;
    lowStock: boolean;
    outOfStock: boolean;
  } | null;
  delivery: {
    productType: ProductFormState['productType'] | null;
    shippingRequired: boolean;
    shippingProfile: string;
    weight: number | null;
    downloadMediaConfigured: boolean;
    downloadUrlConfigured: boolean;
  } | null;
  checkout: {
    orderIntakeReady: boolean;
    directCheckoutUrlConfigured: boolean;
    mode: 'backy-order-intake' | 'direct-checkout-url' | 'missing';
  };
  designReadiness: ProductDesignReadiness;
  providerSync: {
    provider: string;
    status: string;
    executionMode: string;
    syncedAt: string | null;
    hasProviderProductReference: boolean;
    hasProviderPriceReference: boolean;
  };
  actions: {
    publish: { allowed: boolean; disabledReason: string | null };
    archive: { allowed: boolean; disabledReason: string | null };
    providerSync: { allowed: boolean; disabledReason: string | null };
    storefrontHandoff: { allowed: boolean; disabledReason: string | null };
  };
  privacy: {
    includesProviderSecrets: boolean;
    includesPrivateOrders: boolean;
    includesCustomerPayloads: boolean;
    includesDigitalDeliveryUrl: boolean;
    note: string;
  };
}

interface ProductStorefrontHandoff {
  schemaVersion: 'backy.product-storefront-handoff.v1';
  generatedAt: string;
  selectedSiteId: string;
  product: {
    id: string;
    slug: string;
    status: ContentStatus;
    title: string;
    sku: string;
    productType: ProductFormState['productType'];
  } | null;
  endpoints: {
    catalog: string;
    product: string;
    orderIntake: string;
    events: string;
    providerSync: string;
  };
  pricing: {
    price: number;
    compareAtPrice: number | null;
    currency: string;
  } | null;
  inventory: {
    inventory: number;
    lowStockThreshold: number;
    inventoryPolicy: ProductFormState['inventoryPolicy'];
    inStock: boolean;
    lowStock: boolean;
    outOfStock: boolean;
  } | null;
  media: {
    imageUrl: string;
    galleryImages: string[];
  } | null;
  merchandising: {
    category: string;
    tags: string[];
    vendor: string;
    featured: boolean;
    seoTitle: string;
    descriptionChars: number;
  } | null;
  design: Record<string, unknown> | null;
  designReadiness: ProductDesignReadiness;
  delivery: {
    shippingRequired: boolean;
    shippingProfile: string;
    weight: number | null;
    downloadUrlConfigured: boolean;
    returnPolicyConfigured: boolean;
  } | null;
  subscription: {
    enabled: boolean;
    interval: ProductFormState['subscriptionInterval'];
    trialDays: number;
  } | null;
  checkout: {
    orderIntakeReady: boolean;
    directCheckoutUrlConfigured: boolean;
    mode: 'backy-order-intake' | 'direct-checkout-url' | 'missing';
  };
  providerSync: {
    provider: string;
    status: string;
    executionMode: string;
    syncedAt: string | null;
    hasProviderProductReference: boolean;
    hasProviderPriceReference: boolean;
  };
  sellabilityImpact: ProductSellabilityImpact;
  launchReadiness: {
    schemaVersion: ProductLaunchReadiness['schemaVersion'];
    status: ProductLaunchReadinessStatus;
    score: number;
    blockerCount: number;
    attentionCount: number;
    nextSteps: ProductLaunchReadiness['actionPlan']['nextSteps'];
  };
  privacy: {
    customerSafeFieldsOnly: boolean;
    includesProviderSecrets: boolean;
    includesProviderResponses: boolean;
    includesPrivateOrders: boolean;
    includesCustomerPayloads: boolean;
    includesDigitalDeliveryUrl: boolean;
    includesRawCheckoutSessions: boolean;
    excludedFields: string[];
  };
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
  downloadMediaId: 'downloadmediaid',
  downloadMediaName: 'downloadmedianame',
  downloadMediaType: 'downloadmediatype',
  downloadMediaFolderId: 'downloadmediafolderid',
  downloadMediaFolderPath: 'downloadmediafolderpath',
  downloadMediaVisibility: 'downloadmediavisibility',
  downloadMediaScope: 'downloadmediascope',
  downloadMediaScopeTargetId: 'downloadmediascopetargetid',
  downloadMediaOrganization: 'downloadmediaorganization',
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
  { key: productFieldKey('downloadMediaId'), label: 'Digital Delivery Media ID', type: 'text', required: false, unique: false, sortOrder: 111 },
  { key: productFieldKey('downloadMediaName'), label: 'Digital Delivery Media Name', type: 'text', required: false, unique: false, sortOrder: 112 },
  { key: productFieldKey('downloadMediaType'), label: 'Digital Delivery Media Type', type: 'text', required: false, unique: false, sortOrder: 113 },
  { key: productFieldKey('downloadMediaFolderId'), label: 'Digital Delivery Folder ID', type: 'text', required: false, unique: false, sortOrder: 114 },
  { key: productFieldKey('downloadMediaFolderPath'), label: 'Digital Delivery Folder Path', type: 'text', required: false, unique: false, sortOrder: 115 },
  { key: productFieldKey('downloadMediaVisibility'), label: 'Digital Delivery Visibility', type: 'text', required: false, unique: false, sortOrder: 116 },
  { key: productFieldKey('downloadMediaScope'), label: 'Digital Delivery Scope', type: 'text', required: false, unique: false, sortOrder: 117 },
  { key: productFieldKey('downloadMediaScopeTargetId'), label: 'Digital Delivery Scope Target', type: 'text', required: false, unique: false, sortOrder: 118 },
  { key: productFieldKey('downloadMediaOrganization'), label: 'Digital Delivery Organization', type: 'json', required: false, unique: false, sortOrder: 119 },
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
  'download_media_id',
  'download_media_name',
  'download_media_type',
  'download_media_folder_path',
  'download_media_visibility',
  'download_media_scope',
  'download_media_scope_target_id',
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
  productFieldKey('downloadMediaId'),
  productFieldKey('downloadMediaName'),
  productFieldKey('downloadMediaType'),
  productFieldKey('downloadMediaFolderId'),
  productFieldKey('downloadMediaFolderPath'),
  productFieldKey('downloadMediaVisibility'),
  productFieldKey('downloadMediaScope'),
  productFieldKey('downloadMediaScopeTargetId'),
  productFieldKey('downloadMediaOrganization'),
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
    detail: 'Image, gallery, and digital-delivery media are sourced from Backy media with stable media IDs for reference tracking.',
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
    detail: 'Use central media URLs and stable media IDs for primary images, galleries, and digital delivery/download references.',
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
  downloadMediaId: '',
  downloadMediaName: '',
  downloadMediaType: '',
  downloadMediaFolderId: '',
  downloadMediaFolderPath: '',
  downloadMediaVisibility: '',
  downloadMediaScope: '',
  downloadMediaScopeTargetId: '',
  downloadMediaOrganization: null,
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

type ProductDownloadMediaMetadataState = Pick<
  ProductFormState,
  | 'downloadMediaId'
  | 'downloadMediaName'
  | 'downloadMediaType'
  | 'downloadMediaFolderId'
  | 'downloadMediaFolderPath'
  | 'downloadMediaVisibility'
  | 'downloadMediaScope'
  | 'downloadMediaScopeTargetId'
  | 'downloadMediaOrganization'
>;

const productMediaAttachmentUrl = (mediaId: string, siteId: string): string => {
  const fileUrl = getPublicMediaFileUrl(mediaId, siteId);
  return `${fileUrl}${fileUrl.includes('?') ? '&' : '?'}disposition=attachment`;
};

const clearProductDownloadMediaState = (): ProductDownloadMediaMetadataState => ({
  downloadMediaId: '',
  downloadMediaName: '',
  downloadMediaType: '',
  downloadMediaFolderId: '',
  downloadMediaFolderPath: '',
  downloadMediaVisibility: '',
  downloadMediaScope: '',
  downloadMediaScopeTargetId: '',
  downloadMediaOrganization: null,
});

const productDownloadMediaState = (
  asset: MediaAsset,
  activeSiteId: string,
): ProductDownloadMediaMetadataState & Pick<ProductFormState, 'downloadUrl'> => ({
  downloadUrl: productMediaAttachmentUrl(asset.id, activeSiteId),
  downloadMediaId: asset.id,
  downloadMediaName: asset.name,
  downloadMediaType: asset.type,
  downloadMediaFolderId: asset.folderId || '',
  downloadMediaFolderPath: asset.organization?.folderPath || '',
  downloadMediaVisibility: asset.visibility || 'public',
  downloadMediaScope: asset.scope || 'global',
  downloadMediaScopeTargetId: asset.scopeTargetId || '',
  downloadMediaOrganization: asset.organization ? { ...asset.organization } : null,
});

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
  const hydratedCustomerProfileIdRef = useRef<string | null>(null);
  const [productPagination, setProductPagination] = useState<CollectionRecordPagination | null>(null);
  const [selectedProductId, setSelectedProductId] = useState<string | null>(routeSearch.productId || null);
  const [selectedProductIds, setSelectedProductIds] = useState<string[]>([]);
  const [formState, setFormState] = useState<ProductFormState>(EMPTY_PRODUCT_FORM);
  const [statusFilter, setStatusFilter] = useState<ProductStatusFilter>(routeSearch.status || 'all');
  const [productTypeFilter, setProductTypeFilter] = useState<ProductTypeFilter>(routeSearch.type || 'all');
  const [stockFilter, setStockFilter] = useState<ProductStockFilter>(routeSearch.stock || 'all');
  const [categoryFilter, setCategoryFilter] = useState(routeSearch.category || 'all');
  const [searchQuery, setSearchQuery] = useState(routeSearch.q || '');
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isBulkUpdatingProducts, setIsBulkUpdatingProducts] = useState(false);
  const [isSavingCustomerProfile, setIsSavingCustomerProfile] = useState(false);
  const [isImportingProducts, setIsImportingProducts] = useState(false);
  const [isCreatingTemplateId, setIsCreatingTemplateId] = useState<string | null>(null);
  const [isSyncingProviderProduct, setIsSyncingProviderProduct] = useState(false);
  const isProductsBusy = isLoading || isSaving || isBulkUpdatingProducts || isSavingCustomerProfile || isImportingProducts || isSyncingProviderProduct || Boolean(isCreatingTemplateId);
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
  const [productFormSubmitted, setProductFormSubmitted] = useState(false);
  const [variantDraftSubmitted, setVariantDraftSubmitted] = useState(false);
  const [variantMatrixSubmitted, setVariantMatrixSubmitted] = useState(false);
  const [galleryImageSubmitted, setGalleryImageSubmitted] = useState(false);
  const [frontendDesign, setFrontendDesign] = useState<SiteFrontendDesignContract | null>(null);
  const [frontendDesignLoading, setFrontendDesignLoading] = useState(false);
  const [frontendDesignError, setFrontendDesignError] = useState<string | null>(null);
  const [commerceSettings, setCommerceSettings] = useState<CommerceProviderSettings | null>(null);
  const [runtimeCommerce, setRuntimeCommerce] = useState<RuntimeCommerceSettings | null>(null);
  const [providerCertificationCommandOptions, setProviderCertificationCommandOptions] = useState<ProductProviderCertificationCommandOptions>(
    DEFAULT_PRODUCT_PROVIDER_CERTIFICATION_COMMAND_OPTIONS,
  );
  const [pendingDeleteProduct, setPendingDeleteProduct] = useState<CollectionRecord | null>(null);
  const [pendingBulkDeleteProducts, setPendingBulkDeleteProducts] = useState(false);
  const [permissionMatrix, setPermissionMatrix] = useState<AdminUserPermissionMatrix | null>(null);
  const [isPermissionsLoading, setIsPermissionsLoading] = useState(Boolean(currentAdmin?.id));
  const [permissionError, setPermissionError] = useState<string | null>(null);
  const canUseProductRoleDefaults = isPermissionsLoading && !permissionMatrix && Boolean(currentAdmin);
  const isPermissionMatrixPending = isPermissionsLoading && !permissionMatrix && !canUseProductRoleDefaults;
  const isProductPermissionAllowed = (key: ProductPermissionKey) => (
    isAdminPermissionAllowed(permissionMatrix, currentAdmin, key, PRODUCT_PERMISSION_ROLE_DEFAULTS)
    || (canUseProductRoleDefaults && Boolean(currentAdmin && PRODUCT_PERMISSION_ROLE_DEFAULTS[key].includes(currentAdmin.role)))
  );
  const canViewCommerce = isProductPermissionAllowed('commerce.view');
  const canEditCommerce = isProductPermissionAllowed('commerce.edit');
  const canConfigureCommerce = isProductPermissionAllowed('commerce.configure');
  const canDeleteCommerce = isProductPermissionAllowed('commerce.delete');
  const canViewCollections = isProductPermissionAllowed('collections.view');
  const canEditCollections = isProductPermissionAllowed('collections.edit');
  const canExportCollections = isProductPermissionAllowed('collections.export');
  const canDeleteCollections = isProductPermissionAllowed('collections.delete');
  const canViewMedia = isProductPermissionAllowed('media.view');
  const canCreateMedia = isProductPermissionAllowed('media.create');
  const canEditPages = isProductPermissionAllowed('pages.edit');
  const canViewProducts = canViewCommerce && canViewCollections;
  const canEditProducts = canEditCommerce && canEditCollections;
  const canConfigureProducts = canConfigureCommerce && canEditCollections;
  const canExportProducts = canViewCommerce && canExportCollections;
  const canDeleteProducts = canDeleteCommerce && canDeleteCollections;
  const providerCertificationHasSelectedFamily = hasProductProviderCertificationFamily(providerCertificationCommandOptions);
  const updateProviderCertificationCommandOptions = (next: Partial<ProductProviderCertificationCommandOptions>) => {
    setProviderCertificationCommandOptions((current) => ({
      ...current,
      ...next,
    }));
  };
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
  const isProductsAccessBusy = isProductsBusy;
  const isProductPageTemplateActionDisabled = !canEditPages;
  const productDeleteConfirmTitleId = 'products-delete-confirm-title';
  const productDeleteConfirmDescriptionId = 'products-delete-confirm-description';
  const productDeleteConfirmImpactId = 'products-delete-confirm-impact';
  const productDeleteConfirmActionStatusId = 'products-delete-confirm-action-status';
  const productBulkDeleteConfirmTitleId = 'products-bulk-delete-confirm-title';
  const productBulkDeleteConfirmDescriptionId = 'products-bulk-delete-confirm-description';
  const productBulkDeleteConfirmImpactId = 'products-bulk-delete-confirm-impact';
  const productBulkDeleteConfirmActionStatusId = 'products-bulk-delete-confirm-action-status';
  const productDeleteConfirmDisabledReason = isProductsAccessBusy
    ? 'Product catalog is busy.'
    : !canDeleteProducts
      ? deletePermissionTitle || 'Your account cannot delete products.'
      : '';
  const productDeleteConfirmActionState = isProductsAccessBusy ? 'busy' : productDeleteConfirmDisabledReason ? 'blocked' : 'ready';
  const productDeleteConfirmActionStatus = productDeleteConfirmDisabledReason
    ? `Delete product unavailable: ${productDeleteConfirmDisabledReason}`
    : 'Delete product confirmation ready. Cancel or press Escape to keep the product.';

  const activeSite = useMemo(
    () => sites.find((site) => siteMatchesIdentifier(site, selectedSiteId)) || sites[0],
    [selectedSiteId, sites],
  );
  const activeSiteId = activeSite?.publicSiteId || activeSite?.id || selectedSiteId || 'site-demo';
  const providerCertificationTargetOptions = useMemo<ProductProviderCertificationCommandOptions>(
    () => ({ ...providerCertificationCommandOptions, siteId: activeSiteId }),
    [activeSiteId, providerCertificationCommandOptions],
  );
  const providerCertificationCommand = useMemo(
    () => buildProductProviderCertificationCommand(providerCertificationTargetOptions),
    [providerCertificationTargetOptions],
  );
  const providerCertificationEnvTemplate = useMemo(
    () => buildProductProviderCertificationEnvTemplate(providerCertificationTargetOptions),
    [providerCertificationTargetOptions],
  );
  const providerCertificationRequiredInputs = useMemo(
    () => buildProductProviderCertificationRequiredInputs(providerCertificationTargetOptions),
    [providerCertificationTargetOptions],
  );
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
  const productNotificationEventsUrl = `${publicBaseUrl}/api/sites/${encodeURIComponent(activeSiteId)}/events?kind=commerce-product`;
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
        templateSource: 'backy-canvas',
        focus: 'canvas',
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
  const selectedProductLaunchReadiness = useMemo(
    () => buildProductLaunchReadiness({
      product: selectedProduct,
      providerSync: selectedProductProviderSync,
      productApiReady,
      orderIntakeReady,
      catalogApi: commerceCatalogUrl,
      productApi: selectedProduct
        ? commerceProductDetailUrl.replace('{productSlug}', encodeURIComponent(selectedProduct.slug))
        : commerceProductDetailUrl,
      orderIntakeApi: commerceOrderContractUrl,
    }),
    [
      commerceCatalogUrl,
      commerceOrderContractUrl,
      commerceProductDetailUrl,
      orderIntakeReady,
      productApiReady,
      selectedProduct,
      selectedProductProviderSync,
    ],
  );
  const selectedProductStorefrontHandoff = useMemo(
    () => buildProductStorefrontHandoff({
      activeSiteId,
      product: selectedProduct,
      providerSync: selectedProductProviderSync,
      launchReadiness: selectedProductLaunchReadiness,
      catalogApi: commerceCatalogUrl,
      productApi: selectedProduct
        ? commerceProductDetailUrl.replace('{productSlug}', encodeURIComponent(selectedProduct.slug))
        : commerceProductDetailUrl,
      orderIntakeApi: commerceOrderContractUrl,
      productEventsApi: productNotificationEventsUrl,
      providerSyncApi: selectedProduct
        ? `${publicBaseUrl}/api/admin/sites/${encodeURIComponent(activeSiteId)}/commerce/products/${encodeURIComponent(selectedProduct.id)}/provider-sync`
        : `${publicBaseUrl}/api/admin/sites/${encodeURIComponent(activeSiteId)}/commerce/products/{productId}/provider-sync`,
      orderIntakeReady,
    }),
    [
      activeSiteId,
      commerceCatalogUrl,
      commerceOrderContractUrl,
      commerceProductDetailUrl,
      orderIntakeReady,
      productNotificationEventsUrl,
      publicBaseUrl,
      selectedProduct,
      selectedProductLaunchReadiness,
      selectedProductProviderSync,
    ],
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
  const activeFrontendProductTemplate = frontendProductTemplates.find((template) => template.id === activeFrontendTemplateId) || null;
  const productsFrontendTemplateActionStatusId = 'products-frontend-template-action-status';
  const productsFrontendTemplateActionState = isCreatingTemplateId
    ? 'busy'
    : frontendDesignLoading
      ? 'busy'
      : frontendDesignError
      ? 'blocked'
      : frontendProductTemplates.length > 0
        ? 'ready'
        : 'blocked';
  const getProductFrontendTemplateCreateDisabledReason = (template: SiteFrontendDesignTemplate): string => {
    if (isCreatingTemplateId === `frontend:${template.id}`) {
      return `${template.name} product is being created.`;
    }
    if (!productCollection) {
      return 'Set up products before creating catalog records from frontend templates.';
    }
    if (isProductsAccessBusy) {
      return 'Products workflow is busy.';
    }
    if (!canEditProducts) {
      return editPermissionTitle || 'Your account cannot create products.';
    }
    return '';
  };
  const getProductFrontendTemplateCopyDisabledReason = (): string => {
    if (isProductsAccessBusy) {
      return 'Products workflow is busy.';
    }
    if (!canExportProducts) {
      return exportPermissionTitle || 'Your account cannot export product templates.';
    }
    return '';
  };
  const getProductFrontendTemplateCardActionState = (template: SiteFrontendDesignTemplate) => {
    const disabledReason = getProductFrontendTemplateCreateDisabledReason(template);
    if (disabledReason) {
      return isCreatingTemplateId === `frontend:${template.id}` ? 'busy' : 'blocked';
    }
    return activeFrontendTemplateId === template.id ? 'selected' : 'ready';
  };
  const getProductFrontendTemplateCreateActionStatus = (
    template: SiteFrontendDesignTemplate,
    designReadiness: ProductDesignReadiness,
  ) => {
    const disabledReason = getProductFrontendTemplateCreateDisabledReason(template);
    if (disabledReason) {
      return `${template.name} product template unavailable: ${disabledReason}`;
    }
    return `Create draft product from ${template.name} with ${template.bindingHints?.length || 0} binding${(template.bindingHints?.length || 0) === 1 ? '' : 's'} and ${formatProductLaunchReadinessStatus(designReadiness.status)} design readiness.`;
  };
  const getProductFrontendTemplateCopyActionStatus = (template: SiteFrontendDesignTemplate) => {
    const disabledReason = getProductFrontendTemplateCopyDisabledReason();
    if (disabledReason) {
      return `${template.name} product template schema unavailable: ${disabledReason}`;
    }
    return `Copy ${template.name} frontend product template schema.`;
  };
  const productsFrontendTemplateActionStatus = frontendDesignLoading
    ? 'Loading captured frontend product templates.'
    : frontendDesignError
      ? `Frontend product templates unavailable: ${frontendDesignError}`
      : frontendProductTemplates.length > 0
        ? `${frontendProductTemplates.length} frontend product template${frontendProductTemplates.length === 1 ? '' : 's'} available${activeFrontendProductTemplate ? `; ${activeFrontendProductTemplate.name} selected.` : '.'}`
        : 'No frontend product templates captured for this site.';

  useEffect(() => {
    if (!activeFrontendTemplateId || frontendDesignLoading) {
      return undefined;
    }

    const revealActiveTemplate = () => {
      const card = Array.from(document.querySelectorAll<HTMLElement>('[data-testid^="products-frontend-template-card-"]'))
        .find((element) => element.dataset.targetTemplateId === activeFrontendTemplateId);
      const createButton = card?.querySelector<HTMLButtonElement>('[data-action="products.create.frontendTemplate"]');
      card?.scrollIntoView({ block: 'center', behavior: 'smooth' });
      createButton?.focus({ preventScroll: true });
    };

    const frame = window.requestAnimationFrame(revealActiveTemplate);
    const timer = window.setTimeout(revealActiveTemplate, 250);
    return () => {
      window.cancelAnimationFrame(frame);
      window.clearTimeout(timer);
    };
  }, [activeFrontendTemplateId, frontendDesignLoading, frontendProductTemplateBlueprints.length]);

  const galleryImageUrls = useMemo(
    () => parseGalleryImages(formState.galleryImages),
    [formState.galleryImages],
  );
  const productVariants = useMemo(
    () => parseProductVariants(formState.variants),
    [formState.variants],
  );
  const variantDraftPriceValue = Number(variantDraft.price);
  const variantDraftInventoryValue = Number(variantDraft.inventory);
  const variantDraftIdentityMissing = !variantDraft.title.trim() && !variantDraft.option.trim();
  const variantDraftPriceInvalid = Boolean(variantDraft.price.trim()) && (
    !Number.isFinite(variantDraftPriceValue) || variantDraftPriceValue < 0
  );
  const variantDraftInventoryInvalid = Boolean(variantDraft.inventory.trim()) && (
    !Number.isFinite(variantDraftInventoryValue) ||
    variantDraftInventoryValue < 0 ||
    !Number.isInteger(variantDraftInventoryValue)
  );
  const variantDraftIdentityInlineError = variantDraftSubmitted && variantDraftIdentityMissing
    ? 'Add a variant name or option before adding it to the product.'
    : null;
  const variantDraftPriceInlineError = variantDraftSubmitted && variantDraftPriceInvalid
    ? 'Use a variant price of 0 or more.'
    : null;
  const variantDraftInventoryInlineError = variantDraftSubmitted && variantDraftInventoryInvalid
    ? 'Use a whole-number stock value of 0 or more.'
    : null;
  const variantDraftInvalid = Boolean(variantDraftIdentityMissing || variantDraftPriceInvalid || variantDraftInventoryInvalid);
  const optionMatrixPriceValue = Number(optionMatrixDraft.price);
  const optionMatrixInventoryValue = Number(optionMatrixDraft.inventory);
  const optionMatrixOptionsMissing = parseProductOptionGroups(optionMatrixDraft.options).length === 0;
  const optionMatrixPriceInvalid = Boolean(optionMatrixDraft.price.trim()) && (
    !Number.isFinite(optionMatrixPriceValue) || optionMatrixPriceValue < 0
  );
  const optionMatrixInventoryInvalid = Boolean(optionMatrixDraft.inventory.trim()) && (
    !Number.isFinite(optionMatrixInventoryValue) ||
    optionMatrixInventoryValue < 0 ||
    !Number.isInteger(optionMatrixInventoryValue)
  );
  const optionMatrixInlineError = variantMatrixSubmitted && optionMatrixOptionsMissing
    ? 'Add option groups like "Size: S, M" before generating variants.'
    : null;
  const optionMatrixPriceInlineError = variantMatrixSubmitted && optionMatrixPriceInvalid
    ? 'Use a matrix price of 0 or more.'
    : null;
  const optionMatrixInventoryInlineError = variantMatrixSubmitted && optionMatrixInventoryInvalid
    ? 'Use a whole-number matrix stock value of 0 or more.'
    : null;
  const optionMatrixInvalid = Boolean(optionMatrixOptionsMissing || optionMatrixPriceInvalid || optionMatrixInventoryInvalid);
  const galleryImageDraftValue = galleryImageDraft.trim();
  const galleryImageInlineError = galleryImageSubmitted
    ? !galleryImageDraftValue
      ? 'Add a gallery image URL before adding it to the product.'
      : galleryImageUrls.includes(galleryImageDraftValue)
        ? 'That image is already in this product gallery.'
        : null
    : null;
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
  const selectedProductIdSet = useMemo(() => new Set(selectedProductIds), [selectedProductIds]);
  const selectedLoadedProducts = useMemo(
    () => products.filter((product) => selectedProductIdSet.has(product.id)),
    [products, selectedProductIdSet],
  );
  const selectedVisibleProducts = useMemo(
    () => filteredProducts.filter((product) => selectedProductIdSet.has(product.id)),
    [filteredProducts, selectedProductIdSet],
  );
  const filteredProductIds = useMemo(
    () => filteredProducts.map((product) => product.id),
    [filteredProducts],
  );
  const hiddenSelectedProductCount = Math.max(0, selectedLoadedProducts.length - selectedVisibleProducts.length);
  const areAllVisibleProductsSelected = filteredProducts.length > 0 && selectedVisibleProducts.length === filteredProducts.length;
  const productsBulkActionStatusId = 'products-bulk-action-status';
  const selectedProductActionLabel = `${selectedLoadedProducts.length} selected product${selectedLoadedProducts.length === 1 ? '' : 's'}`;
  const visibleProductActionLabel = `${filteredProducts.length} visible product${filteredProducts.length === 1 ? '' : 's'}`;
  const productsBulkBusyDisabledReason = isProductsAccessBusy ? 'Product catalog is busy.' : '';
  const productsBulkViewDisabledReason = !canViewProducts
    ? viewPermissionTitle || 'Your account cannot view products.'
    : '';
  const productsBulkEditDisabledReason = !canEditProducts
    ? editPermissionTitle || 'Your account cannot edit products.'
    : '';
  const productsBulkExportPermissionDisabledReason = !canExportProducts
    ? exportPermissionTitle || 'Your account cannot export products.'
    : '';
  const productsBulkDeletePermissionDisabledReason = !canDeleteProducts
    ? deletePermissionTitle || 'Your account cannot delete products.'
    : '';
  const productsBulkSelectionDisabledReason = filteredProducts.length === 0
    ? 'No visible products to select.'
    : productsBulkBusyDisabledReason || productsBulkViewDisabledReason;
  const productsBulkNoSelectionDisabledReason = selectedLoadedProducts.length === 0
    ? 'Select one or more loaded products first.'
    : '';
  const productsBulkStatusDisabledReason = productsBulkNoSelectionDisabledReason ||
    productsBulkBusyDisabledReason ||
    productsBulkEditDisabledReason;
  const productsBulkExportDisabledReason = productsBulkNoSelectionDisabledReason ||
    productsBulkBusyDisabledReason ||
    productsBulkExportPermissionDisabledReason;
  const productsBulkClearDisabledReason = productsBulkNoSelectionDisabledReason || productsBulkBusyDisabledReason;
  const productsBulkDeleteDisabledReason = productsBulkNoSelectionDisabledReason ||
    productsBulkBusyDisabledReason ||
    productsBulkDeletePermissionDisabledReason;
  const productBulkDeleteConfirmActionState = isProductsAccessBusy ? 'busy' : productsBulkDeleteDisabledReason ? 'blocked' : 'ready';
  const productBulkDeleteConfirmActionStatus = productsBulkDeleteDisabledReason
    ? `Bulk delete unavailable: ${productsBulkDeleteDisabledReason}`
    : `Bulk delete confirmation ready for ${selectedLoadedProducts.length} selected product${selectedLoadedProducts.length === 1 ? '' : 's'}. Cancel or press Escape to keep them.`;
  const productsBulkActionStatus = [
    productsBulkSelectionDisabledReason ? `Select visible unavailable: ${productsBulkSelectionDisabledReason}` : `Select visible available for ${visibleProductActionLabel}.`,
    productsBulkStatusDisabledReason ? `Publish selected unavailable: ${productsBulkStatusDisabledReason}` : `Publish selected available for ${selectedProductActionLabel}.`,
    productsBulkStatusDisabledReason ? `Draft selected unavailable: ${productsBulkStatusDisabledReason}` : `Draft selected available for ${selectedProductActionLabel}.`,
    productsBulkStatusDisabledReason ? `Archive selected unavailable: ${productsBulkStatusDisabledReason}` : `Archive selected available for ${selectedProductActionLabel}.`,
    productsBulkExportDisabledReason ? `Export selected unavailable: ${productsBulkExportDisabledReason}` : `Export selected available for ${selectedProductActionLabel}.`,
    productsBulkClearDisabledReason ? `Clear selection unavailable: ${productsBulkClearDisabledReason}` : `Clear selection available for ${selectedProductActionLabel}.`,
    productsBulkDeleteDisabledReason ? `Delete selected unavailable: ${productsBulkDeleteDisabledReason}` : `Delete selected available for ${selectedProductActionLabel}.`,
  ].join(' ');
  const productsCommandSecondaryActionStatusId = 'products-command-secondary-action-status';
  const productsCommandBusyDisabledReason = isProductsAccessBusy ? 'Product catalog is busy.' : '';
  const productsCommandExportDisabledReason = productsCommandBusyDisabledReason || productsBulkExportPermissionDisabledReason;
  const productsCommandCsvExportDisabledReason = filteredProducts.length === 0
    ? 'No visible products to export.'
    : productsCommandExportDisabledReason;
  const productsCommandTemplateDisabledReason = !productCollection
    ? 'Set up products before downloading a CSV template.'
    : productsCommandBusyDisabledReason || productsBulkEditDisabledReason;
  const productsCommandImportDisabledReason = !productCollection
    ? 'Set up products before importing products.'
    : productsCommandBusyDisabledReason || productsBulkEditDisabledReason;
  const productsCommandStorefrontPageDisabledReason = productsCommandBusyDisabledReason || (!canEditPages
    ? pagesEditPermissionTitle || 'Your account cannot edit pages.'
    : '');
  const productsCommandCopyManifestActionStatus = productsCommandExportDisabledReason
    ? `Copy manifest unavailable: ${productsCommandExportDisabledReason}`
    : `Copy manifest available for ${activeSiteId}.`;
  const productsCommandDownloadJsonActionStatus = productsCommandExportDisabledReason
    ? `Download JSON unavailable: ${productsCommandExportDisabledReason}`
    : `Download JSON available for ${activeSiteId}.`;
  const productsCommandExportCsvActionStatus = productsCommandCsvExportDisabledReason
    ? `Export CSV unavailable: ${productsCommandCsvExportDisabledReason}`
    : `Export CSV available for ${visibleProductActionLabel}.`;
  const productsCommandCsvTemplateActionStatus = productsCommandTemplateDisabledReason
    ? `CSV template unavailable: ${productsCommandTemplateDisabledReason}`
    : 'CSV template available.';
  const productsCommandImportCsvActionStatus = productsCommandImportDisabledReason
    ? `Import CSV unavailable: ${productsCommandImportDisabledReason}`
    : 'Import CSV available.';
  const productsCommandStorefrontPageActionStatus = productsCommandStorefrontPageDisabledReason
    ? `Storefront page unavailable: ${productsCommandStorefrontPageDisabledReason}`
    : 'Storefront page available.';
  const productsCommandSecondaryActionStatus = [
    productsCommandCopyManifestActionStatus,
    productsCommandDownloadJsonActionStatus,
    productsCommandExportCsvActionStatus,
    productsCommandCsvTemplateActionStatus,
    productsCommandImportCsvActionStatus,
    productsCommandStorefrontPageActionStatus,
  ].join(' ');
  const productsCommandSecondaryActionState = productsCommandExportDisabledReason &&
    productsCommandCsvExportDisabledReason &&
    productsCommandTemplateDisabledReason &&
    productsCommandImportDisabledReason &&
    productsCommandStorefrontPageDisabledReason
    ? 'blocked'
    : 'ready';
  const productsStorefrontApiActionStatusId = 'products-storefront-api-action-status';
  const productsStorefrontApiSecondaryActionStatusId = 'products-storefront-api-secondary-action-status';
  const productsStorefrontApiBusyDisabledReason = isProductsAccessBusy ? 'Product catalog is busy.' : '';
  const productsStorefrontApiSyncDisabledReason = productApiReady
    ? 'Product API schema is already synced.'
    : productsStorefrontApiBusyDisabledReason || (!canConfigureProducts
      ? configurePermissionTitle || 'Your account cannot configure products.'
      : '');
  const productsStorefrontApiImportDisabledReason = productsStorefrontApiBusyDisabledReason || (!canEditProducts
    ? editPermissionTitle || 'Your account cannot edit products.'
    : '');
  const productsStorefrontApiViewDisabledReason = productsStorefrontApiBusyDisabledReason || (!canViewProducts
    ? viewPermissionTitle || 'Your account cannot view products.'
    : '');
  const productsStorefrontApiStorefrontDisabledReason = productsStorefrontApiBusyDisabledReason || (!canEditPages
    ? pagesEditPermissionTitle || 'Your account cannot edit pages.'
    : '');
  const productsStorefrontApiExportDisabledReason = filteredProducts.length === 0
    ? 'No visible products to export.'
    : productsStorefrontApiBusyDisabledReason || productsBulkExportPermissionDisabledReason;
  const productsStorefrontApiTemplateDisabledReason = productsStorefrontApiBusyDisabledReason || (!canEditProducts
    ? editPermissionTitle || 'Your account cannot edit products.'
    : '');
  const productsStorefrontApiHandoffDisabledReason = productsStorefrontApiBusyDisabledReason || productsBulkExportPermissionDisabledReason;
  const productsStorefrontApiCopyUrlActionStatus = productsStorefrontApiViewDisabledReason ? `Copy URL unavailable: ${productsStorefrontApiViewDisabledReason}` : 'Copy URL available.';
  const productsStorefrontApiCopyManifestActionStatus = productsStorefrontApiHandoffDisabledReason ? `Copy manifest unavailable: ${productsStorefrontApiHandoffDisabledReason}` : 'Copy manifest available.';
  const productsStorefrontApiExportCsvActionStatus = productsStorefrontApiExportDisabledReason ? `Export CSV unavailable: ${productsStorefrontApiExportDisabledReason}` : `Export CSV available for ${visibleProductActionLabel}.`;
  const productsStorefrontApiCsvTemplateActionStatus = productsStorefrontApiTemplateDisabledReason ? `CSV template unavailable: ${productsStorefrontApiTemplateDisabledReason}` : 'CSV template available.';
  const productsStorefrontApiSecondaryActionStatus = [
    productsStorefrontApiCopyUrlActionStatus,
    productsStorefrontApiCopyManifestActionStatus,
    productsStorefrontApiExportCsvActionStatus,
    productsStorefrontApiCsvTemplateActionStatus,
  ].join(' ');
  const productsStorefrontApiSecondaryActionState = productsStorefrontApiViewDisabledReason &&
    productsStorefrontApiHandoffDisabledReason &&
    productsStorefrontApiExportDisabledReason &&
    productsStorefrontApiTemplateDisabledReason
    ? 'blocked'
    : 'ready';
  const productsStorefrontApiActionStatus = [
    productApiReady ? 'Sync schema already complete.' : productsStorefrontApiSyncDisabledReason ? `Sync schema unavailable: ${productsStorefrontApiSyncDisabledReason}` : 'Sync schema available.',
    productsStorefrontApiImportDisabledReason ? `Import CSV unavailable: ${productsStorefrontApiImportDisabledReason}` : 'Import CSV available.',
    productsStorefrontApiStorefrontDisabledReason ? `Storefront page unavailable: ${productsStorefrontApiStorefrontDisabledReason}` : 'Storefront page available.',
    productsStorefrontApiViewDisabledReason ? `Open API unavailable: ${productsStorefrontApiViewDisabledReason}` : `Open API available at ${storefrontApiUrl}.`,
    productsStorefrontApiCopyUrlActionStatus,
    productsStorefrontApiCopyManifestActionStatus,
    productsStorefrontApiExportCsvActionStatus,
    productsStorefrontApiCsvTemplateActionStatus,
  ].join(' ');
  const productsProviderCertificationActionStatusId = 'products-provider-certification-action-status';
  const productsProviderCertificationBusyDisabledReason = isProductsAccessBusy ? 'Product catalog is busy.' : '';
  const productsProviderCertificationExportDisabledReason = productsProviderCertificationBusyDisabledReason || productsBulkExportPermissionDisabledReason;
  const productsProviderCertificationFamilyDisabledReason = providerCertificationHasSelectedFamily ? '' : 'Select at least one provider family.';
  const productsProviderCertificationCommandDisabledReason = productsProviderCertificationExportDisabledReason || productsProviderCertificationFamilyDisabledReason;
  const productsProviderCertificationActionStatus = [
    productsProviderCertificationExportDisabledReason ? `Copy provider handoff unavailable: ${productsProviderCertificationExportDisabledReason}` : 'Copy provider handoff available.',
    productsProviderCertificationCommandDisabledReason ? `Copy CI command unavailable: ${productsProviderCertificationCommandDisabledReason}` : 'Copy CI command available.',
    productsProviderCertificationExportDisabledReason ? `Download provider JSON unavailable: ${productsProviderCertificationExportDisabledReason}` : 'Download provider JSON available.',
    productsProviderCertificationCommandDisabledReason ? `Copy env template unavailable: ${productsProviderCertificationCommandDisabledReason}` : 'Copy env template available.',
    productsProviderCertificationCommandDisabledReason ? `Copy guarded command unavailable: ${productsProviderCertificationCommandDisabledReason}` : 'Copy guarded command available.',
    productsProviderCertificationCommandDisabledReason ? `Copy evidence packet unavailable: ${productsProviderCertificationCommandDisabledReason}` : 'Copy evidence packet available.',
  ].join(' ');
  const productsProviderCertificationControlProps = (
    label: string,
    disabledReason: string,
    active: boolean,
  ) => ({
    'aria-describedby': productsProviderCertificationActionStatusId,
    'data-action-state': disabledReason ? 'blocked' : 'ready',
    'data-action-status': disabledReason
      ? `${label} unavailable: ${disabledReason}`
      : `${label} ${active ? 'ready for this certification run.' : 'not selected for this certification run.'}`,
    'data-disabled-reason': disabledReason || undefined,
  });
  const productsProviderCertificationPaymentProviderDisabledReason = productsProviderCertificationBusyDisabledReason
    || (!providerCertificationCommandOptions.certifyPayment ? 'Enable Payment checkout certification before choosing a payment provider.' : '');
  const productsProviderCertificationTaxProviderDisabledReason = productsProviderCertificationBusyDisabledReason
    || (!providerCertificationCommandOptions.certifyTax ? 'Enable Tax quotes certification before choosing a tax provider.' : '');
  const productsProviderCertificationShippingProviderDisabledReason = productsProviderCertificationBusyDisabledReason
    || (!providerCertificationCommandOptions.certifyShipping ? 'Enable Shipping rates certification before choosing a shipping provider.' : '');
  const productsProviderCertificationDiscountProviderDisabledReason = productsProviderCertificationBusyDisabledReason
    || (!providerCertificationCommandOptions.certifyDiscount ? 'Enable Discount quotes certification before choosing a discount provider.' : '');
  const productsProviderCertificationCatalogProviderDisabledReason = productsProviderCertificationBusyDisabledReason
    || (!providerCertificationCommandOptions.certifyCatalog ? 'Enable Catalog sync certification before choosing a catalog provider.' : '');
  const productsProviderCertificationSubscriptionProviderDisabledReason = productsProviderCertificationBusyDisabledReason
    || (!providerCertificationCommandOptions.certifySubscriptions ? 'Enable Subscriptions certification before choosing a subscription provider.' : '');
  const productsProviderCertificationWebhookProviderDisabledReason = productsProviderCertificationBusyDisabledReason
    || (!providerCertificationCommandOptions.certifyWebhooks ? 'Enable Webhooks certification before choosing a webhook provider.' : '');
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
  const productTitleInlineError = productFormSubmitted && !formState.title.trim()
    ? 'Add a product title so storefront cards, product pages, and APIs have a display name.'
    : null;
  const productSkuInlineError = productFormSubmitted && !formState.sku.trim()
    ? 'Add a unique SKU so orders, inventory, and provider catalog sync can reference this product.'
    : null;
  const scheduledProductInlineError = productFormSubmitted && scheduledProductDateError
    ? scheduledProductDateError
    : null;
  const productIdentityMissing = !formState.title.trim() || !formState.sku.trim();
  const minimumScheduledAt = toDateTimeLocalValue(new Date(Date.now() + 60_000).toISOString());
  const providerRuntimeEvidence = useMemo(() => {
    const paymentConfigured = Boolean(
      runtimeCommerce?.stripeSecretConfigured ||
      runtimeCommerce?.paypalAccessTokenConfigured ||
      runtimeCommerce?.paddleApiKeyConfigured ||
      runtimeCommerce?.squareAccessTokenConfigured ||
      runtimeCommerce?.adyenApiKeyConfigured ||
      runtimeCommerce?.mollieApiKeyConfigured ||
      (runtimeCommerce?.razorpayKeyIdConfigured && runtimeCommerce?.razorpayKeySecretConfigured),
    );
    const taxConfigured = Boolean(
      runtimeCommerce?.stripeSecretConfigured ||
      runtimeCommerce?.taxJarApiKeyConfigured ||
      (
        runtimeCommerce?.avalaraAccountConfigured &&
        runtimeCommerce?.avalaraLicenseKeyConfigured &&
        runtimeCommerce?.avalaraCompanyCodeConfigured
      ) ||
      commerceSettings?.taxProviderUrl,
    );
    const shippingConfigured = Boolean(
      runtimeCommerce?.easyPostApiKeyConfigured ||
      runtimeCommerce?.shippoApiKeyConfigured ||
      commerceSettings?.shippingProviderUrl,
    );
    const discountConfigured = Boolean(runtimeCommerce?.stripeSecretConfigured || commerceSettings?.discountProviderUrl);
    const catalogSyncConfigured = Boolean(
      runtimeCommerce?.stripeSecretConfigured ||
      runtimeCommerce?.paypalAccessTokenConfigured ||
      runtimeCommerce?.paddleApiKeyConfigured ||
      runtimeCommerce?.squareAccessTokenConfigured ||
      runtimeCommerce?.shopifyAdminAccessTokenConfigured ||
      runtimeCommerce?.bigCommerceAccessTokenConfigured ||
      (runtimeCommerce?.wooCommerceConsumerKeyConfigured && runtimeCommerce?.wooCommerceConsumerSecretConfigured) ||
      runtimeCommerce?.etsyAccessTokenConfigured ||
      runtimeCommerce?.magentoAccessTokenConfigured ||
      commerceSettings?.catalogSyncProviderUrl,
    );
    const subscriptionConfigured = Boolean(paymentConfigured || commerceSettings?.subscriptionActionProviderUrl);
    const webhookSecretConfigured = Boolean(runtimeCommerce?.webhookSecretConfigured);
    const familyReadiness = [
      ['payment', paymentConfigured],
      ['tax', taxConfigured],
      ['shipping', shippingConfigured],
      ['discount', discountConfigured],
      ['catalog-sync', catalogSyncConfigured],
      ['subscription', subscriptionConfigured],
      ['webhooks', webhookSecretConfigured],
    ] as const;

    return {
      loaded: Boolean(commerceSettings || runtimeCommerce),
      paymentConfigured,
      taxConfigured,
      shippingConfigured,
      discountConfigured,
      catalogSyncConfigured,
      subscriptionConfigured,
      webhookSecretConfigured,
      configuredFamilies: familyReadiness.filter(([, ready]) => ready).map(([family]) => family),
      missingFamilies: familyReadiness.filter(([, ready]) => !ready).map(([family]) => family),
      runtimeCommerce: runtimeCommerce || null,
      settingsProviders: commerceSettings ? {
        paymentProvider: commerceSettings.paymentProvider || 'none',
        providerMode: commerceSettings.providerMode || 'test',
        taxProvider: commerceSettings.taxProvider || 'manual',
        shippingProvider: commerceSettings.shippingProvider || 'manual',
        discountProvider: commerceSettings.discountProvider || 'manual',
        catalogSyncProvider: commerceSettings.catalogSyncProvider || 'manual',
        subscriptionActionProvider: commerceSettings.subscriptionActionProvider || 'manual',
        reconciliationMode: commerceSettings.reconciliationMode || 'manual',
      } : null,
      secretHandling: 'Provider secret values are never returned; this product handoff exposes provider-family readiness booleans only.',
    };
  }, [commerceSettings, runtimeCommerce]);
  const productProviderCertificationEvidence = useMemo(() => {
    const countEvidence = (...values: boolean[]) => values.filter(Boolean).length;
    const providerSyncs = products
      .map((product) => productProviderSync(product))
      .filter((sync): sync is CommerceProductProviderSyncResult => Boolean(sync));
    const syncedProviderSyncCount = providerSyncs.filter((sync) => (
      sync.status === 'synced' ||
      Boolean(sync.product?.id || sync.price?.id || sync.providerResponse?.id || sync.providerResponse?.reference)
    )).length;
    const subscriptionScenarioCount = selectedProductLifecycle?.certification?.coverage.covered ?? 0;
    const subscriptionLifecycleCount = (
      (selectedProductLifecycle?.summary.active ?? 0) +
      (selectedProductLifecycle?.summary.renewals ?? 0) +
      (selectedProductLifecycle?.summary.dunning ?? 0) +
      (selectedProductLifecycle?.summary.paused ?? 0) +
      (selectedProductLifecycle?.summary.trialEnding ?? 0) +
      (selectedProductLifecycle?.summary.cancelled ?? 0)
    );
    const productAutomationEventCount = productNotificationEvents.length;
    const hasWebhookLikeProductEvent = productNotificationEvents.some((event) => (
      String(event.metadata?.event || event.target || '').toLowerCase().includes('webhook') ||
      String(event.metadata?.channel || '').toLowerCase().includes('webhook')
    ));
    const evidenceCounts: Record<string, number> = {
      'catalog-publication': countEvidence(
        productApiReady,
        metrics.published > 0,
        loadedProductCount > 0,
        Boolean(commerceCatalogUrl),
      ),
      'checkout-settlement': countEvidence(
        orderIntakeReady,
        commerceAnalytics.paidOrderCount > 0,
        (orderAnalytics?.operations.checkoutOrderCount ?? 0) > 0,
        Boolean(commerceOrderCreateUrl),
      ),
      'quote-adjustments': countEvidence(
        providerRuntimeEvidence.taxConfigured,
        providerRuntimeEvidence.shippingConfigured,
        providerRuntimeEvidence.discountConfigured,
        (orderAnalytics?.revenue.taxTotal ?? 0) > 0,
        (orderAnalytics?.revenue.shippingTotal ?? 0) > 0,
        (orderAnalytics?.revenue.discountTotal ?? 0) > 0,
      ),
      'provider-catalog-sync': countEvidence(
        providerRuntimeEvidence.catalogSyncConfigured,
        providerSyncs.length > 0,
        syncedProviderSyncCount > 0,
      ),
      'webhook-settlement': countEvidence(
        providerRuntimeEvidence.webhookSecretConfigured,
        hasWebhookLikeProductEvent,
        productAutomationEventCount > 0,
      ),
      'subscription-lifecycle': countEvidence(
        providerRuntimeEvidence.subscriptionConfigured,
        subscriptionScenarioCount > 0,
        subscriptionLifecycleCount > 0,
      ),
      'inventory-automation': countEvidence(
        metrics.inventory > 0,
        metrics.lowStock > 0,
        productAutomationEventCount > 0,
      ),
      'customer-signal': countEvidence(
        customerProfiles.length > 0,
        commerceAnalytics.customerCount > 0,
        commerceAnalytics.topProducts.length > 0,
        (orderAnalytics?.orderCount ?? 0) > 0,
      ),
    };
    const scenarios = PRODUCT_PROVIDER_CERTIFICATION_SCENARIOS.map((scenario) => {
      const evidenceCount = evidenceCounts[scenario.key] || 0;
      return {
        ...scenario,
        evidenceCount,
        status: evidenceCount > 0 ? 'covered' as const : 'missing' as const,
      };
    });
    const covered = scenarios.filter((scenario) => scenario.status === 'covered').length;

    return {
      schemaVersion: 'backy.product-provider-certification-evidence.v1',
      status: covered === scenarios.length ? 'ready' as const : 'attention' as const,
      requiredGate: PRODUCT_PROVIDER_CERTIFICATION_OPERATOR_GATE,
      coverage: {
        covered,
        total: scenarios.length,
        missing: scenarios.filter((scenario) => scenario.status === 'missing').map((scenario) => scenario.key),
      },
      scenarios,
      secretHandling: 'Product provider certification evidence reports scenario names, counts, gates, and non-secret provider families only; product payloads, customer payloads, private orders, and provider secrets stay private.',
    };
  }, [
    commerceAnalytics.customerCount,
    commerceAnalytics.paidOrderCount,
    commerceAnalytics.topProducts.length,
    commerceCatalogUrl,
    commerceOrderCreateUrl,
    customerProfiles.length,
    loadedProductCount,
    metrics.inventory,
    metrics.lowStock,
    metrics.published,
    orderAnalytics?.operations.checkoutOrderCount,
    orderAnalytics?.orderCount,
    orderAnalytics?.revenue.discountTotal,
    orderAnalytics?.revenue.shippingTotal,
    orderAnalytics?.revenue.taxTotal,
    orderIntakeReady,
    productApiReady,
    productNotificationEvents,
    products,
    providerRuntimeEvidence.catalogSyncConfigured,
    providerRuntimeEvidence.discountConfigured,
    providerRuntimeEvidence.shippingConfigured,
    providerRuntimeEvidence.subscriptionConfigured,
    providerRuntimeEvidence.taxConfigured,
    providerRuntimeEvidence.webhookSecretConfigured,
    selectedProductLifecycle,
  ]);
  const providerCertificationEvidencePacket = useMemo<ProductProviderCertificationEvidencePacket>(() => {
    const familyArtifacts = [
      {
        key: 'payment-checkout',
        family: 'Payment checkout',
        selected: providerCertificationCommandOptions.certifyPayment,
        runtimeConfigured: providerRuntimeEvidence.paymentConfigured,
        providerAlias: productProviderCertificationOptionLabel(
          PRODUCT_PROVIDER_CERTIFICATION_PAYMENT_PROVIDER_OPTIONS,
          providerCertificationCommandOptions.paymentProvider,
        ),
        requiredInputs: PRODUCT_PROVIDER_CERTIFICATION_PAYMENT_INPUTS[providerCertificationCommandOptions.paymentProvider],
        expectedArtifacts: [
          'checkout session id/reference',
          'paid private order id',
          'payment provider reference',
          'non-secret webhook settlement event name',
        ],
        captureSource: 'public order intake response, private order record, and signed webhook readback',
      },
      {
        key: 'tax-quotes',
        family: 'Tax quotes',
        selected: providerCertificationCommandOptions.certifyTax,
        runtimeConfigured: providerRuntimeEvidence.taxConfigured,
        providerAlias: productProviderCertificationOptionLabel(
          PRODUCT_PROVIDER_CERTIFICATION_TAX_PROVIDER_OPTIONS,
          providerCertificationCommandOptions.taxProvider,
        ),
        requiredInputs: PRODUCT_PROVIDER_CERTIFICATION_TAX_INPUTS[providerCertificationCommandOptions.taxProvider],
        expectedArtifacts: [
          'tax provider alias',
          'quote request target',
          'returned tax amount',
          'persisted order tax total',
        ],
        captureSource: 'checkout quote response and private order totals',
      },
      {
        key: 'shipping-rates',
        family: 'Shipping rates',
        selected: providerCertificationCommandOptions.certifyShipping,
        runtimeConfigured: providerRuntimeEvidence.shippingConfigured,
        providerAlias: productProviderCertificationOptionLabel(
          PRODUCT_PROVIDER_CERTIFICATION_SHIPPING_PROVIDER_OPTIONS,
          providerCertificationCommandOptions.shippingProvider,
        ),
        requiredInputs: PRODUCT_PROVIDER_CERTIFICATION_SHIPPING_INPUTS[providerCertificationCommandOptions.shippingProvider],
        expectedArtifacts: [
          'carrier/provider alias',
          'rate id/reference',
          'returned shipping amount',
          'label/tracking reference when enabled',
        ],
        captureSource: 'checkout quote response, shipping adjustment metadata, and carrier label response',
      },
      {
        key: 'discount-quotes',
        family: 'Discount quotes',
        selected: providerCertificationCommandOptions.certifyDiscount,
        runtimeConfigured: providerRuntimeEvidence.discountConfigured,
        providerAlias: productProviderCertificationOptionLabel(
          PRODUCT_PROVIDER_CERTIFICATION_DISCOUNT_PROVIDER_OPTIONS,
          providerCertificationCommandOptions.discountProvider,
        ),
        requiredInputs: PRODUCT_PROVIDER_CERTIFICATION_DISCOUNT_INPUTS[providerCertificationCommandOptions.discountProvider],
        expectedArtifacts: [
          'promotion or coupon code',
          'discount provider alias',
          'returned discount amount',
          'persisted order discount total',
        ],
        captureSource: 'checkout quote response and private order discount fields',
      },
      {
        key: 'catalog-sync',
        family: 'Catalog sync',
        selected: providerCertificationCommandOptions.certifyCatalog,
        runtimeConfigured: providerRuntimeEvidence.catalogSyncConfigured,
        providerAlias: productProviderCertificationOptionLabel(
          PRODUCT_PROVIDER_CERTIFICATION_CATALOG_PROVIDER_OPTIONS,
          providerCertificationCommandOptions.catalogProvider,
        ),
        requiredInputs: PRODUCT_PROVIDER_CERTIFICATION_CATALOG_INPUTS[providerCertificationCommandOptions.catalogProvider],
        expectedArtifacts: [
          'provider product id/reference',
          'provider price/variant id/reference',
          'sync status',
          'synced timestamp',
        ],
        captureSource: 'admin provider-sync response and stored providersync metadata',
      },
      {
        key: 'subscription-lifecycle',
        family: 'Subscription lifecycle',
        selected: providerCertificationCommandOptions.certifySubscriptions,
        runtimeConfigured: providerRuntimeEvidence.subscriptionConfigured,
        providerAlias: productProviderCertificationOptionLabel(
          PRODUCT_PROVIDER_CERTIFICATION_SUBSCRIPTION_PROVIDER_OPTIONS,
          providerCertificationCommandOptions.subscriptionProvider,
        ),
        requiredInputs: PRODUCT_PROVIDER_CERTIFICATION_SUBSCRIPTION_INPUTS[providerCertificationCommandOptions.subscriptionProvider],
        expectedArtifacts: [
          'subscription checkout reference',
          'renewal or dunning event',
          'pause/resume/cancel action result',
          'lifecycle endpoint coverage summary',
        ],
        captureSource: 'product subscription lifecycle endpoint and subscription action response',
      },
      {
        key: 'webhook-settlement',
        family: 'Webhooks',
        selected: providerCertificationCommandOptions.certifyWebhooks,
        runtimeConfigured: providerRuntimeEvidence.webhookSecretConfigured,
        providerAlias: productProviderCertificationOptionLabel(
          PRODUCT_PROVIDER_CERTIFICATION_WEBHOOK_PROVIDER_OPTIONS,
          providerCertificationCommandOptions.webhookProvider,
        ),
        requiredInputs: PRODUCT_PROVIDER_CERTIFICATION_WEBHOOK_INPUTS[providerCertificationCommandOptions.webhookProvider],
        expectedArtifacts: [
          'signed webhook provider alias',
          'accepted webhook event name',
          'idempotent order update result',
          'commerce-webhook event readback',
        ],
        captureSource: 'commerce webhook POST response and /events?kind=commerce-webhook readback',
      },
    ];
    const selectedArtifacts = familyArtifacts.filter((artifact) => artifact.selected);
    const missingSelectedFamilies = selectedArtifacts
      .filter((artifact) => !artifact.runtimeConfigured)
      .map((artifact) => artifact.key);
    const status: ProductProviderCertificationEvidencePacketStatus = selectedArtifacts.length === 0
      ? 'no-family-selected'
      : (!providerRuntimeEvidence.loaded || missingSelectedFamilies.length > 0)
        ? 'needs-credentials'
        : productProviderCertificationEvidence.status === 'ready'
          ? 'evidence-complete'
          : 'needs-scenario-evidence';
    const missingScenarios = productProviderCertificationEvidence.coverage.missing;
    const operatorNextAction = status === 'no-family-selected'
      ? {
          label: 'Select live provider families',
          detail: 'Choose checkout, tax, shipping, discount, catalog sync, subscription, or webhook families before copying the guarded certification command.',
          command: '# Select at least one commerce provider selector before running certification.',
        }
      : status === 'needs-credentials'
        ? {
            label: 'Configure live provider credentials',
            detail: missingSelectedFamilies.length > 0
              ? `Populate runtime aliases for selected families: ${missingSelectedFamilies.join(', ')}.`
              : 'Load runtime Settings/CI environment aliases so Backy can prove provider readiness.',
            command: 'npm run doctor:release-certification && npm run ci:commerce-provider-certification',
          }
        : status === 'needs-scenario-evidence'
          ? {
              label: 'Attach live scenario evidence',
              detail: missingScenarios.length > 0
                ? `Capture redacted evidence for: ${missingScenarios.join(', ')}.`
                : 'Run the selected live provider scenarios and attach the redacted packet.',
              command: 'npm run ci:commerce-provider-certification',
            }
          : {
              label: 'Attach certification artifact',
              detail: `Store the redacted artifact at ${PRODUCT_PROVIDER_CERTIFICATION_OUTPUT_ARTIFACT} and expose it through ${PRODUCT_PROVIDER_CERTIFICATION_OUTPUT_ENV}.`,
              command: PRODUCT_PROVIDER_CERTIFICATION_ARTIFACT_DOCTOR_COMMAND,
            };

    return {
      schemaVersion: 'backy.commerce-provider-certification-evidence-packet.v1',
      generatedAt: new Date().toISOString(),
      selectedSiteId: activeSiteId,
      status,
      operatorNextAction: {
        status,
        ...operatorNextAction,
        missingFamilies: missingSelectedFamilies,
        missingScenarios,
        artifactEnv: PRODUCT_PROVIDER_CERTIFICATION_OUTPUT_ENV,
        artifactPath: PRODUCT_PROVIDER_CERTIFICATION_OUTPUT_ARTIFACT,
      },
      selectedFamilies: selectedArtifacts.map((artifact) => artifact.key),
      selectedProviderAliases: Object.fromEntries(selectedArtifacts.map((artifact) => [
        artifact.key,
        artifact.providerAlias,
      ])),
      runtimeReadiness: {
        loaded: providerRuntimeEvidence.loaded,
        configuredFamilies: providerRuntimeEvidence.configuredFamilies,
        missingSelectedFamilies,
      },
      operatorArtifacts: selectedArtifacts.map((artifact) => ({
        key: artifact.key,
        family: artifact.family,
        providerAlias: artifact.providerAlias,
        status: providerRuntimeEvidence.loaded && artifact.runtimeConfigured ? 'ready-to-run' : 'needs-credentials',
        requiredInputs: artifact.requiredInputs,
        expectedArtifacts: artifact.expectedArtifacts,
        captureSource: artifact.captureSource,
        redaction: 'Attach ids, timestamps, event names, totals, and status codes only; remove provider secrets, raw customer payloads, private order payloads, and full webhook bodies.',
      })),
      scenarioAttachments: productProviderCertificationEvidence.scenarios.map((scenario) => ({
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
        targetInputs: PRODUCT_PROVIDER_CERTIFICATION_OPERATOR_COMMAND_TEMPLATE.targetInputs,
      },
      target: {
        siteId: activeSiteId,
        siteSelectorEnv: 'BACKY_COMMERCE_CERTIFY_SITE_ID',
        productProviderSyncApi: `/api/admin/sites/${activeSiteId}/commerce/products/{productId}/provider-sync`,
        orderAnalyticsApi: `/api/admin/sites/${activeSiteId}/commerce/orders/analytics`,
        publicCatalogApi: `/api/sites/${activeSiteId}/commerce/catalog`,
      },
      redactionPolicy: {
        includesProviderSecrets: false,
        includesCustomerPayloads: false,
        includesPrivateOrderPayloads: false,
        includesWebhookBodies: false,
        allowedEvidence: [
          'provider ids and references',
          'timestamped CI/preflight logs',
          'quote totals and adjustment names',
          'webhook event names and accepted status codes',
          'scenario counts and coverage state',
          'non-secret provider family names',
        ],
      },
      secretHandling: 'Redacted operator attachment manifest only; provider credentials, raw customer data, raw private orders, and webhook bodies stay out of copied JSON.',
    };
  }, [
    activeSiteId,
    productProviderCertificationEvidence.scenarios,
    productProviderCertificationEvidence.status,
    productProviderCertificationEvidence.coverage.missing,
    providerCertificationCommand,
    providerCertificationCommandOptions.catalogProvider,
    providerCertificationCommandOptions.certifyCatalog,
    providerCertificationCommandOptions.certifyDiscount,
    providerCertificationCommandOptions.certifyPayment,
    providerCertificationCommandOptions.certifyShipping,
    providerCertificationCommandOptions.certifySubscriptions,
    providerCertificationCommandOptions.certifyTax,
    providerCertificationCommandOptions.certifyWebhooks,
    providerCertificationCommandOptions.discountProvider,
    providerCertificationCommandOptions.paymentProvider,
    providerCertificationCommandOptions.shippingProvider,
    providerCertificationCommandOptions.subscriptionProvider,
    providerCertificationCommandOptions.taxProvider,
    providerCertificationCommandOptions.webhookProvider,
    providerCertificationRequiredInputs,
    providerRuntimeEvidence.catalogSyncConfigured,
    providerRuntimeEvidence.configuredFamilies,
    providerRuntimeEvidence.discountConfigured,
    providerRuntimeEvidence.loaded,
    providerRuntimeEvidence.paymentConfigured,
    providerRuntimeEvidence.shippingConfigured,
    providerRuntimeEvidence.subscriptionConfigured,
    providerRuntimeEvidence.taxConfigured,
    providerRuntimeEvidence.webhookSecretConfigured,
  ]);
  const providerCertificationSelectedFamilySummary = providerCertificationEvidencePacket.selectedFamilies.length > 0
    ? providerCertificationEvidencePacket.selectedFamilies.join(', ')
    : 'Select checkout, tax, shipping, discount, catalog sync, subscription, or webhook families.';
  const providerCertificationRuntimeGapDetail = providerCertificationEvidencePacket.runtimeReadiness.missingSelectedFamilies.length > 0
    ? `Selected gaps: ${providerCertificationEvidencePacket.runtimeReadiness.missingSelectedFamilies.join(', ')}`
    : providerRuntimeEvidence.missingFamilies.length > 0
      ? `Unconfigured families: ${providerRuntimeEvidence.missingFamilies.slice(0, 5).join(', ')}`
      : 'No runtime credential gaps detected for commerce families.';
  const providerCertificationReadinessItems = [
    {
      label: 'Selected families',
      value: String(providerCertificationEvidencePacket.selectedFamilies.length),
      detail: providerCertificationSelectedFamilySummary,
    },
    {
      label: 'Runtime credentials',
      value: providerRuntimeEvidence.loaded
        ? `${providerRuntimeEvidence.configuredFamilies.length}/${providerRuntimeEvidence.configuredFamilies.length + providerRuntimeEvidence.missingFamilies.length} ready`
        : 'not loaded',
      detail: providerCertificationRuntimeGapDetail,
    },
    {
      label: 'Scenario coverage',
      value: `${productProviderCertificationEvidence.coverage.covered}/${productProviderCertificationEvidence.coverage.total}`,
      detail: productProviderCertificationEvidence.coverage.missing.length > 0
        ? `Missing: ${productProviderCertificationEvidence.coverage.missing.join(', ')}`
        : 'All product provider scenarios have evidence hooks.',
    },
    {
      label: 'Artifact output',
      value: PRODUCT_PROVIDER_CERTIFICATION_OUTPUT_ENV,
      detail: PRODUCT_PROVIDER_CERTIFICATION_OUTPUT_ARTIFACT,
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
    operatorGate: PRODUCT_PROVIDER_CERTIFICATION_OPERATOR_GATE,
    operatorCommandTemplate: {
      ...PRODUCT_PROVIDER_CERTIFICATION_OPERATOR_COMMAND_TEMPLATE,
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
    preflightGates: [...PRODUCT_PROVIDER_CERTIFICATION_PREFLIGHT_GATES],
    providerSelectors: [...PRODUCT_PROVIDER_CERTIFICATION_SELECTORS],
    evidenceExpectations: [...PRODUCT_PROVIDER_CERTIFICATION_EVIDENCE_EXPECTATIONS],
    operatorEvidencePacket: providerCertificationEvidencePacket,
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
    certificationEvidence: productProviderCertificationEvidence,
    providerRuntimeEvidence,
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
    productProviderCertificationEvidence,
    providerCertificationEvidencePacket,
    providerCertificationCommand,
    providerCertificationEnvTemplate,
    providerCertificationRequiredInputs,
    providerRuntimeEvidence,
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
      productNotificationEvents: productNotificationEventsUrl,
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
          productNotificationEvents: productNotificationEventsUrl,
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
      selectedProductLaunchReadiness,
      selectedProductStorefrontHandoff,
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
      starterRoute: `/pages/new?siteId=${encodeURIComponent(activeSiteId)}&template=storefront&templateSource=backy-canvas&focus=canvas`,
      productListTemplateRoute: productPageTemplateBriefs.find((brief) => brief.mode === 'list')?.createRoute || null,
      productDetailTemplateRoute: productPageTemplateBriefs.find((brief) => brief.mode === 'item')?.createRoute || null,
      productPageTemplates: productPageTemplateBriefs.map((brief) => brief.manifest),
      canvasBlocks: ['product-card', 'product-grid', 'product-detail', 'variant-selector', 'cart-button', 'checkout-button', 'related-products'],
      requiredFields: [productFieldKey('title'), 'slug', productFieldKey('sku'), productFieldKey('price'), productFieldKey('currency'), productFieldKey('inventory'), productFieldKey('productType'), productFieldKey('checkoutUrl')],
      optionalFields: [productFieldKey('compareAtPrice'), productFieldKey('variants'), productFieldKey('galleryImages'), productFieldKey('downloadUrl'), productFieldKey('downloadMediaId'), productFieldKey('downloadMediaName'), productFieldKey('downloadMediaType'), productFieldKey('downloadMediaFolderPath'), productFieldKey('downloadMediaVisibility'), productFieldKey('downloadMediaScope'), productFieldKey('subscriptionEnabled'), productFieldKey('subscriptionInterval'), productFieldKey('subscriptionTrialDays'), productFieldKey('shippingProfile'), productFieldKey('taxClass'), productFieldKey('discountCode'), productFieldKey('returnPolicy'), productFieldKey('category'), productFieldKey('tags'), productFieldKey('vendor'), productFieldKey('seoTitle'), productFieldKey('featured'), productFieldKey('taxable')],
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
      downloadMediaId: String(readProductValue(product.values, 'downloadMediaId', '') || ''),
      downloadMediaName: String(readProductValue(product.values, 'downloadMediaName', '') || ''),
      downloadMediaType: String(readProductValue(product.values, 'downloadMediaType', '') || ''),
      downloadMediaFolderPath: String(readProductValue(product.values, 'downloadMediaFolderPath', '') || ''),
      downloadMediaVisibility: String(readProductValue(product.values, 'downloadMediaVisibility', '') || ''),
      downloadMediaScope: String(readProductValue(product.values, 'downloadMediaScope', '') || ''),
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
    productNotificationEventsUrl,
    products,
    selectedProductStorefrontHandoff,
    selectedProductLaunchReadiness,
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
  const providerCertificationEvidencePacketText = useMemo(
    () => JSON.stringify(providerCertificationEvidencePacket, null, 2),
    [providerCertificationEvidencePacket],
  );
  const selectedProductLaunchReadinessText = useMemo(
    () => JSON.stringify(selectedProductLaunchReadiness, null, 2),
    [selectedProductLaunchReadiness],
  );
  const selectedProductStorefrontHandoffText = useMemo(
    () => JSON.stringify(selectedProductStorefrontHandoff, null, 2),
    [selectedProductStorefrontHandoff],
  );
  const selectedProductSellabilityImpactText = useMemo(
    () => JSON.stringify(selectedProductStorefrontHandoff.sellabilityImpact, null, 2),
    [selectedProductStorefrontHandoff],
  );
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
      setCommerceSettings(null);
      setRuntimeCommerce(null);
      clearProductEditorState();
      setSelectedProductIds([]);
      setPendingBulkDeleteProducts(false);
      setError(viewPermissionTitle || 'Your account cannot view commerce products.');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const [collections, settings] = await Promise.all([
        listCollections(activeSiteId),
        canViewCommerce ? getSettings().catch(() => null) : Promise.resolve(null),
      ]);
      setCommerceSettings(settings?.integrations?.commerce || null);
      setRuntimeCommerce(settings?.runtimeCommerce || null);
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
        setSelectedProductIds([]);
        setPendingBulkDeleteProducts(false);
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
      setSelectedProductIds([]);
      setPendingDeleteProduct(null);
      setPendingBulkDeleteProducts(false);
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
    if (!pendingDeleteProduct && !pendingBulkDeleteProducts) return;

    const handleProductDeleteDialogKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || isProductsAccessBusy) return;
      setPendingDeleteProduct(null);
      setPendingBulkDeleteProducts(false);
    };

    window.addEventListener('keydown', handleProductDeleteDialogKeyDown);

    return () => {
      window.removeEventListener('keydown', handleProductDeleteDialogKeyDown);
    };
  }, [isProductsAccessBusy, pendingBulkDeleteProducts, pendingDeleteProduct]);

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
    setProductFormSubmitted(false);
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
    const selectedProfileId = selectedCustomerProfile?.id || null;
    if (hydratedCustomerProfileIdRef.current === selectedProfileId) return;
    hydratedCustomerProfileIdRef.current = selectedProfileId;
    setCustomerProfileDraft(customerProfileToDraft(selectedCustomerProfile));
  }, [selectedCustomerProfile]);

  useEffect(() => {
    if (selectedProductIds.length === 0) return;

    const loadedIds = new Set(products.map((product) => product.id));
    setSelectedProductIds((current) => {
      const next = current.filter((productId) => loadedIds.has(productId));
      return next.length === current.length ? current : next;
    });
  }, [products, selectedProductIds]);

  const clearProductEditorState = () => {
    setSelectedProductId(null);
    setFormState(EMPTY_PRODUCT_FORM);
    setProductFormSubmitted(false);
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

  useEffect(() => {
    if (routeSearch.quickCreate !== 'product') return;
    if (isPermissionMatrixPending || isProductsBusy) return;

    if (!canEditProducts) {
      setError(editPermissionTitle || 'Your account cannot edit products.');
      updateProductsRouteSearch({ productId: undefined });
      return;
    }

    setSearchQuery('');
    setStatusFilter('all');
    setProductTypeFilter('all');
    setStockFilter('all');
    setCategoryFilter('all');
    setSelectedProductIds([]);
    setPendingBulkDeleteProducts(false);
    clearProductEditorState();
    setError(null);
    setNotice('New product draft ready. Add catalog details and save when ready.');
    updateProductsRouteSearch({
      status: undefined,
      type: undefined,
      stock: undefined,
      category: undefined,
      q: undefined,
      productId: undefined,
      frontendTemplate: undefined,
    });

    window.requestAnimationFrame(() => {
      document.querySelector<HTMLInputElement>('[data-testid="products-title-input"]')?.focus();
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canEditProducts, editPermissionTitle, isPermissionMatrixPending, isProductsBusy, routeSearch.quickCreate]);

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
    setGalleryImageSubmitted(false);
    setError(null);
    return true;
  };

  const addGalleryImageDraft = () => {
    setGalleryImageSubmitted(true);
    if (isProductsBusy) return;
    if (!canEditProducts) return;

    if (!galleryImageDraftValue || galleryImageUrls.includes(galleryImageDraftValue)) {
      setError('Fix gallery image URL before adding.');
      setNotice(null);
      return;
    }

    if (addGalleryImageUrl(galleryImageDraftValue)) {
      setGalleryImageSubmitted(false);
      setError(null);
      setNotice('Gallery image added.');
    }
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
    setVariantDraftSubmitted(true);
    if (isProductsBusy) return;
    if (!canEditProducts) return;

    const title = variantDraft.title.trim();
    const sku = variantDraft.sku.trim();
    const option = variantDraft.option.trim();

    if (variantDraftInvalid) {
      setError('Fix product variant fields before adding.');
      setNotice(null);
      return;
    }

    if (productVariants.length >= PRODUCT_VARIANT_LIMIT) {
      setNotice(`Products support up to ${PRODUCT_VARIANT_LIMIT} variants. Remove a variant before adding another.`);
      return;
    }

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
    setVariantDraftSubmitted(false);
    setError(null);
  };

  const removeProductVariant = (variantId: string) => {
    if (isProductsBusy) return;
    if (!canEditProducts) return;

    setProductVariants(productVariants.filter((variant) => variant.id !== variantId));
  };

  const generateVariantMatrix = () => {
    setVariantMatrixSubmitted(true);
    if (isProductsBusy) return;
    if (!canEditProducts) return;

    if (optionMatrixInvalid) {
      setError('Fix option matrix fields before generating variants.');
      setNotice(null);
      return;
    }

    if (productVariants.length >= PRODUCT_VARIANT_LIMIT) {
      setNotice(`Products support up to ${PRODUCT_VARIANT_LIMIT} variants. Remove variants before generating more.`);
      return;
    }

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
    setVariantMatrixSubmitted(false);
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
      setSelectedProductIds([]);
      setPendingBulkDeleteProducts(false);
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

    setProductFormSubmitted(true);

    if (productIdentityMissing) {
      setError('Fix product identity fields before saving.');
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
        [productFieldKey('downloadMediaId')]: formState.downloadMediaId.trim(),
        [productFieldKey('downloadMediaName')]: formState.downloadMediaName.trim(),
        [productFieldKey('downloadMediaType')]: formState.downloadMediaType.trim(),
        [productFieldKey('downloadMediaFolderId')]: formState.downloadMediaFolderId.trim(),
        [productFieldKey('downloadMediaFolderPath')]: formState.downloadMediaFolderPath.trim(),
        [productFieldKey('downloadMediaVisibility')]: formState.downloadMediaVisibility.trim(),
        [productFieldKey('downloadMediaScope')]: formState.downloadMediaScope.trim(),
        [productFieldKey('downloadMediaScopeTargetId')]: formState.downloadMediaScopeTargetId.trim(),
        [productFieldKey('downloadMediaOrganization')]: formState.downloadMediaOrganization,
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
      setProductFormSubmitted(false);
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
      setSelectedProductIds((current) => current.filter((productId) => productId !== product.id));
      setPendingDeleteProduct(null);
      setNotice('Product deleted.');
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : 'Unable to delete product');
    } finally {
      setIsSaving(false);
    }
  };

  const bulkUpdateProductStatus = async (status: ContentStatus) => {
    if (!productCollection || selectedLoadedProducts.length === 0) return;
    if (isProductsBusy) return;
    if (!canEditProducts) {
      setError(editPermissionTitle || 'Your account cannot update product status.');
      return;
    }

    setIsBulkUpdatingProducts(true);
    setError(null);
    setNotice(null);

    try {
      const result = await bulkUpdateCollectionRecords(activeSiteId, productCollection.id, {
        action: 'updateStatus',
        recordIds: selectedLoadedProducts.map((product) => product.id),
        status,
      });
      const updatedProducts = result.records.map(normalizeProductRecord);
      setProducts((current) => current.map((product) => (
        updatedProducts.find((updatedProduct) => updatedProduct.id === product.id) || product
      )));
      const updatedSelectedProduct = selectedProductId
        ? updatedProducts.find((product) => product.id === selectedProductId)
        : null;
      if (updatedSelectedProduct) {
        setFormState(productToForm(updatedSelectedProduct));
      }
      setSelectedProductIds([]);
      setPendingBulkDeleteProducts(false);
      setNotice(`${result.updated} selected product${result.updated === 1 ? '' : 's'} moved to ${status}${result.skipped ? `, ${result.skipped} skipped` : ''}.`);
    } catch (bulkError) {
      setError(bulkError instanceof Error ? bulkError.message : 'Unable to update selected products');
    } finally {
      setIsBulkUpdatingProducts(false);
    }
  };

  const bulkDeleteProducts = async () => {
    if (!productCollection || selectedLoadedProducts.length === 0) return;
    if (isProductsBusy) return;
    if (!canDeleteProducts) {
      setError(deletePermissionTitle || 'Your account cannot delete products.');
      return;
    }

    const deletedIds = selectedLoadedProducts.map((product) => product.id);
    setIsBulkUpdatingProducts(true);
    setError(null);
    setNotice(null);

    try {
      const result = await bulkUpdateCollectionRecords(activeSiteId, productCollection.id, {
        action: 'delete',
        recordIds: deletedIds,
      });
      setProducts((current) => current.filter((product) => !deletedIds.includes(product.id)));
      setProductPagination((current) => current
        ? { ...current, total: Math.max(0, current.total - result.deleted) }
        : current);
      if (selectedProductId && deletedIds.includes(selectedProductId)) {
        clearProductEditorState();
        updateProductsRouteSearch({ productId: undefined });
      }
      setSelectedProductIds([]);
      setPendingBulkDeleteProducts(false);
      setNotice(`${result.deleted} selected product${result.deleted === 1 ? '' : 's'} deleted${result.skipped ? `, ${result.skipped} skipped` : ''}.`);
    } catch (bulkError) {
      setError(bulkError instanceof Error ? bulkError.message : 'Unable to delete selected products');
    } finally {
      setIsBulkUpdatingProducts(false);
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
      hydratedCustomerProfileIdRef.current = updated.id;
      setCustomerProfileDraft(customerProfileToDraft(updated));
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

  const exportProductRowsCsv = (productsToExport: CollectionRecord[], scopeLabel: 'visible' | 'selected') => {
    if (productsToExport.length === 0 || isProductsBusy) return;
    if (!canExportProducts) {
      setError(exportPermissionTitle || 'Your account cannot export products.');
      return;
    }

    const rows = productsToExport.map((product) => {
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
    setNotice(`${productsToExport.length} ${scopeLabel} product${productsToExport.length === 1 ? '' : 's'} exported.`);
  };
  const exportProductsCsv = () => exportProductRowsCsv(filteredProducts, 'visible');
  const exportSelectedProductsCsv = () => exportProductRowsCsv(selectedLoadedProducts, 'selected');
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
      setSelectedProductIds([]);
      setPendingBulkDeleteProducts(false);
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
  const toggleProductSelection = (productId: string) => {
    if (isProductsBusy) return;
    if (!canViewProducts) {
      setError(viewPermissionTitle || 'Your account cannot view products.');
      return;
    }

    setPendingBulkDeleteProducts(false);
    setSelectedProductIds((current) => (
      current.includes(productId)
        ? current.filter((item) => item !== productId)
        : [...current, productId]
    ));
  };
  const setVisibleProductSelection = (selected: boolean) => {
    if (isProductsBusy || filteredProducts.length === 0) return;
    if (!canViewProducts) {
      setError(viewPermissionTitle || 'Your account cannot view products.');
      return;
    }

    setPendingBulkDeleteProducts(false);
    setSelectedProductIds((current) => {
      const visibleIds = new Set(filteredProductIds);
      if (!selected) {
        return current.filter((productId) => !visibleIds.has(productId));
      }

      return [...current, ...filteredProductIds.filter((productId) => !current.includes(productId))];
    });
  };
  const clearProductSelection = () => {
    if (isProductsBusy) return;

    setSelectedProductIds([]);
    setPendingBulkDeleteProducts(false);
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

    navigate({ to: '/pages/new', search: { siteId: activeSiteId, template: 'storefront', templateSource: 'backy-canvas', focus: 'canvas' } });
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
    setSelectedProductIds([]);
    setPendingBulkDeleteProducts(false);
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
      <span id={productsCommandSecondaryActionStatusId} className="sr-only" data-testid="products-command-secondary-action-status" aria-live="polite">
        {productsCommandSecondaryActionStatus}
      </span>

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
            {(canUseProductRoleDefaults || isPermissionMatrixPending) && (
              <p className="mt-1 text-xs text-muted-foreground" data-testid="products-permission-sync-state">
                {canUseProductRoleDefaults
                  ? 'Using role defaults while detailed commerce permissions sync.'
                  : 'Loading detailed commerce permissions before enabling role-specific controls.'}
              </p>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
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
            <details
              className="group relative"
              aria-describedby={productsCommandSecondaryActionStatusId}
              data-action-state={productsCommandSecondaryActionState}
              data-action-status={productsCommandSecondaryActionStatus}
              data-testid="products-command-secondary-actions"
            >
              <summary
                className="inline-flex min-h-11 cursor-pointer list-none items-center justify-center gap-2 rounded-lg border border-border bg-background px-3 py-2 text-sm font-medium transition-colors hover:bg-accent focus-ring [&::-webkit-details-marker]:hidden"
                aria-label="More catalog actions"
              >
                <MoreHorizontal className="size-4" />
                More actions
                <span className="sr-only">Copy manifest, Download JSON, Export CSV, CSV template, Import CSV, and Storefront page</span>
              </summary>
              <div className="mt-2 grid gap-2 rounded-lg border border-border bg-background p-2 shadow-lg sm:absolute sm:right-0 sm:z-20 sm:min-w-56" data-testid="products-command-secondary-action-menu">
                <button
                  type="button"
                  onClick={() => void copyProductHandoff()}
                  disabled={Boolean(productsCommandExportDisabledReason)}
                  title={productsCommandExportDisabledReason || 'Copy product handoff manifest'}
                  aria-label="Copy product handoff manifest"
                  aria-describedby={productsCommandSecondaryActionStatusId}
                  data-action-state={productsCommandExportDisabledReason ? 'blocked' : 'ready'}
                  data-action-status={productsCommandCopyManifestActionStatus}
                  data-disabled-reason={productsCommandExportDisabledReason || undefined}
                  className="inline-flex min-h-10 items-center justify-start gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors hover:bg-accent disabled:cursor-not-allowed disabled:opacity-60"
                  data-testid="products-command-copy-manifest"
                >
                  <Copy className="size-4" />
                  Copy manifest
                </button>
                <button
                  type="button"
                  onClick={downloadProductHandoff}
                  disabled={Boolean(productsCommandExportDisabledReason)}
                  title={productsCommandExportDisabledReason || 'Download product handoff JSON'}
                  aria-label="Download product handoff JSON"
                  aria-describedby={productsCommandSecondaryActionStatusId}
                  data-action-state={productsCommandExportDisabledReason ? 'blocked' : 'ready'}
                  data-action-status={productsCommandDownloadJsonActionStatus}
                  data-disabled-reason={productsCommandExportDisabledReason || undefined}
                  className="inline-flex min-h-10 items-center justify-start gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors hover:bg-accent disabled:cursor-not-allowed disabled:opacity-60"
                  data-testid="products-command-download-json"
                >
                  <Download className="size-4" />
                  Download JSON
                </button>
                <button
                  type="button"
                  onClick={exportProductsCsv}
                  disabled={Boolean(productsCommandCsvExportDisabledReason)}
                  title={productsCommandCsvExportDisabledReason || 'Export filtered products CSV'}
                  aria-label="Export filtered products CSV"
                  aria-describedby={productsCommandSecondaryActionStatusId}
                  data-action-state={productsCommandCsvExportDisabledReason ? 'blocked' : 'ready'}
                  data-action-status={productsCommandExportCsvActionStatus}
                  data-disabled-reason={productsCommandCsvExportDisabledReason || undefined}
                  className="inline-flex min-h-10 items-center justify-start gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors hover:bg-accent disabled:cursor-not-allowed disabled:opacity-60"
                  data-testid="products-command-export-csv"
                >
                  <Download className="size-4" />
                  Export CSV
                </button>
                <button
                  type="button"
                  onClick={downloadProductImportTemplate}
                  disabled={Boolean(productsCommandTemplateDisabledReason)}
                  title={productsCommandTemplateDisabledReason || 'Download product CSV template'}
                  aria-label="Download product CSV template"
                  aria-describedby={productsCommandSecondaryActionStatusId}
                  data-action-state={productsCommandTemplateDisabledReason ? 'blocked' : 'ready'}
                  data-action-status={productsCommandCsvTemplateActionStatus}
                  data-disabled-reason={productsCommandTemplateDisabledReason || undefined}
                  className="inline-flex min-h-10 items-center justify-start gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors hover:bg-accent disabled:cursor-not-allowed disabled:opacity-60"
                  data-testid="products-command-csv-template"
                >
                  <FileText className="size-4" />
                  CSV template
                </button>
                <button
                  type="button"
                  onClick={() => productImportInputRef.current?.click()}
                  disabled={Boolean(productsCommandImportDisabledReason)}
                  title={productsCommandImportDisabledReason || 'Import products CSV'}
                  aria-label="Import products CSV"
                  aria-describedby={productsCommandSecondaryActionStatusId}
                  data-action-state={productsCommandImportDisabledReason ? 'blocked' : 'ready'}
                  data-action-status={productsCommandImportCsvActionStatus}
                  data-disabled-reason={productsCommandImportDisabledReason || undefined}
                  className="inline-flex min-h-10 items-center justify-start gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors hover:bg-accent disabled:cursor-not-allowed disabled:opacity-60"
                  data-testid="products-command-import-csv"
                >
                  <Upload className="size-4" />
                  {isImportingProducts ? 'Importing...' : 'Import CSV'}
                </button>
                <button
                  type="button"
                  onClick={openStorefrontPage}
                  disabled={Boolean(productsCommandStorefrontPageDisabledReason)}
                  title={productsCommandStorefrontPageDisabledReason || 'Create storefront page'}
                  aria-label="Create storefront page"
                  aria-describedby={productsCommandSecondaryActionStatusId}
                  data-action-state={productsCommandStorefrontPageDisabledReason ? 'blocked' : 'ready'}
                  data-action-status={productsCommandStorefrontPageActionStatus}
                  data-disabled-reason={productsCommandStorefrontPageDisabledReason || undefined}
                  className="inline-flex min-h-10 items-center justify-start gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors hover:bg-accent disabled:cursor-not-allowed disabled:opacity-60"
                  data-testid="products-command-storefront-page"
                >
                  <Sparkles className="size-4" />
                  Storefront page
                </button>
              </div>
            </details>
          </div>
        </div>

        <details className="group mt-5 overflow-hidden rounded-lg border border-border bg-background" data-testid="products-readiness-details">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-sm font-semibold text-foreground transition hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring [&::-webkit-details-marker]:hidden">
            <span>Catalog readiness, workflow, and navigation</span>
            <span className="rounded-md bg-muted px-2 py-1 text-xs font-medium text-muted-foreground group-open:hidden">Show details</span>
            <span className="hidden rounded-md bg-muted px-2 py-1 text-xs font-medium text-muted-foreground group-open:inline-flex">Hide details</span>
          </summary>
          <div className="border-t border-border p-4">
            <div className="grid gap-3 xl:grid-cols-[minmax(0,1.15fr)_minmax(340px,0.85fr)]">
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

            <details
              className="group mt-4 overflow-hidden rounded-lg border border-border bg-background"
              data-default-collapsed="true"
              data-testid="products-control-map"
            >
              <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 transition hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring [&::-webkit-details-marker]:hidden">
                <span>
                  <span className="block text-sm font-semibold text-foreground">Product control map</span>
                  <span className="mt-1 block text-sm text-muted-foreground">Jump to site scope, storefront API, catalog health, product grid, and editor controls.</span>
                </span>
                <span className="shrink-0 rounded-md bg-muted px-2 py-1 text-xs font-medium text-muted-foreground group-open:hidden">Show map</span>
                <span className="hidden shrink-0 rounded-md bg-muted px-2 py-1 text-xs font-medium text-muted-foreground group-open:inline-flex">Hide map</span>
              </summary>
              <div className="grid gap-2 border-t border-border p-4 md:grid-cols-2 xl:grid-cols-5">
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
            </details>
          </div>
        </details>

        {(frontendProductTemplates.length > 0 || frontendDesignLoading || frontendDesignError) && (
          <details
            open={activeFrontendTemplateId ? true : undefined}
            className="group mt-4 overflow-hidden rounded-lg border border-teal-200 bg-teal-50/50"
            aria-describedby={productsFrontendTemplateActionStatusId}
            data-action-state={productsFrontendTemplateActionState}
            data-action-status={productsFrontendTemplateActionStatus}
            data-default-collapsed={activeFrontendTemplateId ? 'false' : 'true'}
            data-route-revealed-template={activeFrontendTemplateId || undefined}
            data-template-count={frontendProductTemplates.length}
            data-active-template-id={activeFrontendTemplateId || undefined}
            data-testid="products-frontend-template-options"
          >
            <summary
              className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 transition hover:bg-teal-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring [&::-webkit-details-marker]:hidden"
              aria-describedby={productsFrontendTemplateActionStatusId}
              data-action-state={productsFrontendTemplateActionState}
              data-action-status={productsFrontendTemplateActionStatus}
            >
              <span>
                <span className="block text-sm font-semibold text-foreground">Frontend design products</span>
                <span className="mt-1 block max-w-3xl text-sm text-muted-foreground">
                  Seed products from the connected frontend contract while preserving source, chrome, tokens, route pattern, and product binding hints for custom storefronts.
                </span>
              </span>
              <span className="flex shrink-0 flex-wrap items-center justify-end gap-2">
                <span className="rounded-full bg-background px-2.5 py-1 text-xs font-medium text-teal-700">
                  {frontendDesign?.source.label || frontendDesign?.source.type || 'Frontend contract'}
                </span>
                <span className="rounded-md bg-background px-2 py-1 text-xs font-medium text-teal-700 group-open:hidden">Show templates</span>
                <span className="hidden rounded-md bg-background px-2 py-1 text-xs font-medium text-teal-700 group-open:inline-flex">Hide templates</span>
              </span>
            </summary>
            <span id={productsFrontendTemplateActionStatusId} className="sr-only" data-testid="products-frontend-template-action-status" aria-live="polite">
              {productsFrontendTemplateActionStatus}
            </span>
            <div className="border-t border-teal-200 p-4">
              {frontendDesignLoading ? (
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <RefreshCw className="size-3.5 animate-spin" />
                  Loading captured product templates...
                </div>
              ) : null}
              {frontendDesignError ? (
                <div className="flex items-center gap-2 text-xs text-destructive">
                  <AlertTriangle className="size-3.5" />
                  {frontendDesignError}
                </div>
              ) : null}
              {frontendProductTemplateBlueprints.length > 0 ? (
                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                {frontendProductTemplateBlueprints.map(({ template, blueprint }) => {
                  const designValues = buildFrontendProductTemplateValues(template, frontendDesign);
                  const values = {
                    ...blueprint.values,
                    ...designValues,
                  };
                  const designReadiness = buildProductDesignReadiness(designValues);
                  const cardActionState = getProductFrontendTemplateCardActionState(template);
                  const createDisabledReason = getProductFrontendTemplateCreateDisabledReason(template);
                  const copyDisabledReason = getProductFrontendTemplateCopyDisabledReason();
                  const createActionStatus = getProductFrontendTemplateCreateActionStatus(template, designReadiness);
                  const copyActionStatus = getProductFrontendTemplateCopyActionStatus(template);
                  const manifestText = JSON.stringify({
                    schemaVersion: 'backy.frontend-product-template.v1',
                    template,
                    designReadiness,
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
                      data-action-state={cardActionState}
                      data-action-status={createActionStatus}
                      data-disabled-reason={createDisabledReason || undefined}
                      data-target-template-id={template.id}
                      data-target-template-name={template.name}
                      data-target-site-id={activeSiteId}
                      data-testid={`products-frontend-template-card-${template.id}`}
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
                      <div className="mt-3 rounded-md border border-border bg-muted/30 px-3 py-2 text-xs" data-testid="products-frontend-template-design-readiness">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <span className="font-medium text-foreground">Editable design state</span>
                          <span className={cn('rounded-full px-2 py-0.5 text-[11px] font-semibold', productLaunchReadinessBadgeClass(designReadiness.status))}>
                            {formatProductLaunchReadinessStatus(designReadiness.status)}
                          </span>
                        </div>
                        <div className="mt-2 grid grid-cols-2 gap-2">
                          <span className="rounded bg-background px-2 py-1 text-muted-foreground">{designReadiness.counts.elements} elements</span>
                          <span className="rounded bg-background px-2 py-1 text-muted-foreground">{designReadiness.counts.animations} animations</span>
                          <span className="rounded bg-background px-2 py-1 text-muted-foreground">{designReadiness.counts.assets} assets</span>
                          <span className="rounded bg-background px-2 py-1 text-muted-foreground">{designReadiness.counts.bindingHints} bindings</span>
                        </div>
                        {designReadiness.missing.length > 0 ? (
                          <div className="mt-2 text-[11px] text-amber-700">
                            Missing {designReadiness.missing.join(', ')}
                          </div>
                        ) : (
                          <div className="mt-2 text-[11px] text-muted-foreground">
                            Template carries content, animation, and editable binding state into the created product record.
                          </div>
                        )}
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
                          disabled={Boolean(createDisabledReason)}
                          title={createDisabledReason || undefined}
                          aria-describedby={productsFrontendTemplateActionStatusId}
                          iconStart={<Package className="size-4" />}
                          data-testid={`products-frontend-template-${template.id}`}
                          data-action="products.create.frontendTemplate"
                          data-action-route={`/products?siteId=${encodeURIComponent(activeSiteId)}&frontendTemplate=${encodeURIComponent(template.id)}`}
                          data-action-state={createDisabledReason ? isCreatingTemplateId === `frontend:${template.id}` ? 'busy' : 'blocked' : 'ready'}
                          data-action-status={createActionStatus}
                          data-disabled-reason={createDisabledReason || undefined}
                          data-target-template-id={template.id}
                          data-target-template-name={template.name}
                          data-target-site-id={activeSiteId}
                        >
                          {isCreatingTemplateId === `frontend:${template.id}` ? 'Creating...' : 'Create product'}
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => void copyText(manifestText, `${template.name} frontend product template`)}
                          disabled={Boolean(copyDisabledReason)}
                          title={copyDisabledReason || undefined}
                          aria-describedby={productsFrontendTemplateActionStatusId}
                          iconStart={<Copy className="size-4" />}
                          data-testid={`products-frontend-template-copy-${template.id}`}
                          data-action="products.copy.frontendTemplateSchema"
                          data-action-route={`/products?siteId=${encodeURIComponent(activeSiteId)}&frontendTemplate=${encodeURIComponent(template.id)}`}
                          data-action-state={copyDisabledReason ? 'blocked' : 'ready'}
                          data-action-status={copyActionStatus}
                          data-disabled-reason={copyDisabledReason || undefined}
                          data-target-template-id={template.id}
                          data-target-template-name={template.name}
                          data-target-site-id={activeSiteId}
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
                <p className="text-xs text-muted-foreground">The current frontend contract has no product templates yet.</p>
              ) : null}
            </div>
          </details>
        )}
      </section>

      {productCollection && (
        <details
          id="products-api"
          className="group mb-6 scroll-mt-24 overflow-hidden rounded-lg border border-border bg-card"
          data-testid="products-storefront-api-details"
          data-disclosure="products-storefront-api-handoff"
        >
          <summary className="flex cursor-pointer list-none flex-col gap-3 px-4 py-3 transition hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:flex-row sm:items-center sm:justify-between [&::-webkit-details-marker]:hidden">
            <span className="min-w-0">
              <span className="flex items-center gap-2 text-sm font-semibold text-foreground">
                <Code2 className="size-4 text-primary" />
                Storefront API and provider handoff
              </span>
              <span className="mt-1 block max-w-3xl text-sm text-muted-foreground">
                Expand for product API endpoints, response contracts, storefront page templates, checkout/order intake, and live provider certification runbooks.
              </span>
            </span>
            <span className="flex shrink-0 flex-wrap items-center gap-2 text-xs text-muted-foreground">
              <span className={cn(
                'rounded-md px-2 py-1 font-medium',
                productApiReady ? 'bg-success/10 text-success' : 'bg-warning/10 text-warning',
              )}
              >
                {productApiReady ? 'API ready' : 'Schema needs sync'}
              </span>
              <span className="rounded-md bg-muted px-2 py-1">{products.filter((product) => product.status === 'published').length} published</span>
              <span className="rounded-md bg-muted px-2 py-1">{orderIntakeReady ? 'Order intake ready' : 'Orders need setup'}</span>
              <span className="rounded-md bg-muted px-2 py-1 group-open:hidden">Show handoff</span>
              <span className="hidden rounded-md bg-muted px-2 py-1 group-open:inline-flex">Hide handoff</span>
            </span>
          </summary>
          <div className="border-t border-border p-4">
            <div className="space-y-3">
              <div
                className="flex flex-wrap items-center gap-2"
                role="group"
                aria-label="Storefront API actions"
                aria-describedby={productsStorefrontApiActionStatusId}
                data-testid="products-storefront-api-actions"
                data-action-status={productsStorefrontApiActionStatus}
              >
                <span id={productsStorefrontApiActionStatusId} className="sr-only" data-testid="products-storefront-api-action-status" aria-live="polite">
                  {productsStorefrontApiActionStatus}
                </span>
                <div className="flex flex-wrap items-center gap-2" data-testid="products-storefront-api-primary-actions">
                  {!productApiReady && (
                    <Button
                      onClick={() => void syncProductsCollection()}
                      disabled={Boolean(productsStorefrontApiSyncDisabledReason)}
                      title={productsStorefrontApiSyncDisabledReason || undefined}
                      aria-describedby={productsStorefrontApiActionStatusId}
                      data-testid="products-storefront-api-sync-schema"
                      data-action-state={productsStorefrontApiSyncDisabledReason ? 'blocked' : 'ready'}
                      data-action-status={productsStorefrontApiActionStatus}
                      data-disabled-reason={productsStorefrontApiSyncDisabledReason || undefined}
                      iconStart={<Sparkles className="size-4" />}
                    >
                      Sync Schema
                    </Button>
                  )}
                  <Button
                    variant="outline"
                    onClick={() => productImportInputRef.current?.click()}
                    disabled={Boolean(productsStorefrontApiImportDisabledReason)}
                    title={productsStorefrontApiImportDisabledReason || undefined}
                    aria-describedby={productsStorefrontApiActionStatusId}
                    data-testid="products-storefront-api-import-csv"
                    data-action-state={productsStorefrontApiImportDisabledReason ? 'blocked' : 'ready'}
                    data-action-status={productsStorefrontApiActionStatus}
                    data-disabled-reason={productsStorefrontApiImportDisabledReason || undefined}
                    iconStart={<Upload className="size-4" />}
                  >
                    {isImportingProducts ? 'Importing...' : 'Import CSV'}
                  </Button>
                  <Button
                    variant="outline"
                    onClick={openStorefrontPage}
                    disabled={Boolean(productsStorefrontApiStorefrontDisabledReason)}
                    title={productsStorefrontApiStorefrontDisabledReason || undefined}
                    aria-describedby={productsStorefrontApiActionStatusId}
                    data-testid="products-storefront-api-storefront-page"
                    data-action-state={productsStorefrontApiStorefrontDisabledReason ? 'blocked' : 'ready'}
                    data-action-status={productsStorefrontApiActionStatus}
                    data-disabled-reason={productsStorefrontApiStorefrontDisabledReason || undefined}
                    iconStart={<Sparkles className="size-4" />}
                  >
                    Storefront page
                  </Button>
                  <a
                    href={storefrontApiUrl}
                    target="_blank"
                    rel="noreferrer"
                    aria-disabled={Boolean(productsStorefrontApiViewDisabledReason)}
                    aria-describedby={productsStorefrontApiActionStatusId}
                    tabIndex={productsStorefrontApiViewDisabledReason ? -1 : undefined}
                    data-testid="products-storefront-api-open-api"
                    data-action-state={productsStorefrontApiViewDisabledReason ? 'blocked' : 'ready'}
                    data-action-status={productsStorefrontApiActionStatus}
                    data-disabled-reason={productsStorefrontApiViewDisabledReason || undefined}
                    onClick={(event) => {
                      if (productsStorefrontApiViewDisabledReason) event.preventDefault();
                    }}
                    className={cn(
                      'inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-border bg-background px-4 py-2 text-sm font-medium transition-colors hover:bg-accent',
                      productsStorefrontApiViewDisabledReason && 'pointer-events-none opacity-60',
                    )}
                  >
                    <ExternalLink className="size-4" />
                    Open API
                  </a>
                </div>
                <details
                  className="group relative"
                  aria-describedby={productsStorefrontApiSecondaryActionStatusId}
                  data-action-state={productsStorefrontApiSecondaryActionState}
                  data-action-status={productsStorefrontApiSecondaryActionStatus}
                  data-target-site-id={activeSiteId}
                  data-testid="products-storefront-api-secondary-actions"
                  data-default-collapsed="true"
                >
                  <span id={productsStorefrontApiSecondaryActionStatusId} className="sr-only" data-testid="products-storefront-api-secondary-action-status" aria-live="polite">
                    {productsStorefrontApiSecondaryActionStatus}
                  </span>
                  <summary
                    className="inline-flex min-h-11 cursor-pointer list-none items-center justify-center gap-2 rounded-lg border border-border bg-background px-3 py-2 text-sm font-medium transition-colors hover:bg-accent focus-ring [&::-webkit-details-marker]:hidden"
                    data-testid="products-storefront-api-more-actions"
                    aria-label="More storefront API actions"
                    aria-describedby={productsStorefrontApiSecondaryActionStatusId}
                  >
                    <MoreHorizontal className="size-4" />
                    More actions
                  </summary>
                  <div className="mt-2 grid gap-2 rounded-lg border border-border bg-background p-2 shadow-lg sm:absolute sm:right-0 sm:z-20 sm:min-w-56" data-testid="products-storefront-api-secondary-action-menu">
                    <Button
                      variant="ghost"
                      className="justify-start"
                      onClick={() => void copyStorefrontApiUrl()}
                      disabled={Boolean(productsStorefrontApiViewDisabledReason)}
                      title={productsStorefrontApiViewDisabledReason || undefined}
                      aria-describedby={productsStorefrontApiSecondaryActionStatusId}
                      data-testid="products-storefront-api-copy-url"
                      data-action-state={productsStorefrontApiViewDisabledReason ? 'blocked' : 'ready'}
                      data-action-status={productsStorefrontApiCopyUrlActionStatus}
                      data-disabled-reason={productsStorefrontApiViewDisabledReason || undefined}
                      data-target-site-id={activeSiteId}
                      iconStart={<Copy className="size-4" />}
                    >
                      Copy URL
                    </Button>
                    <Button
                      variant="ghost"
                      className="justify-start"
                      onClick={() => void copyProductHandoff()}
                      disabled={Boolean(productsStorefrontApiHandoffDisabledReason)}
                      title={productsStorefrontApiHandoffDisabledReason || undefined}
                      aria-describedby={productsStorefrontApiSecondaryActionStatusId}
                      data-testid="products-storefront-api-copy-manifest"
                      data-action-state={productsStorefrontApiHandoffDisabledReason ? 'blocked' : 'ready'}
                      data-action-status={productsStorefrontApiCopyManifestActionStatus}
                      data-disabled-reason={productsStorefrontApiHandoffDisabledReason || undefined}
                      data-target-site-id={activeSiteId}
                      iconStart={<Copy className="size-4" />}
                    >
                      Copy manifest
                    </Button>
                    <Button
                      variant="ghost"
                      className="justify-start"
                      onClick={exportProductsCsv}
                      disabled={Boolean(productsStorefrontApiExportDisabledReason)}
                      title={productsStorefrontApiExportDisabledReason || undefined}
                      aria-describedby={productsStorefrontApiSecondaryActionStatusId}
                      data-testid="products-storefront-api-export-csv"
                      data-action-state={productsStorefrontApiExportDisabledReason ? 'blocked' : 'ready'}
                      data-action-status={productsStorefrontApiExportCsvActionStatus}
                      data-disabled-reason={productsStorefrontApiExportDisabledReason || undefined}
                      data-target-site-id={activeSiteId}
                      iconStart={<Download className="size-4" />}
                    >
                      Export CSV
                    </Button>
                    <Button
                      variant="ghost"
                      className="justify-start"
                      onClick={downloadProductImportTemplate}
                      disabled={Boolean(productsStorefrontApiTemplateDisabledReason)}
                      title={productsStorefrontApiTemplateDisabledReason || undefined}
                      aria-describedby={productsStorefrontApiSecondaryActionStatusId}
                      data-testid="products-storefront-api-csv-template"
                      data-action-state={productsStorefrontApiTemplateDisabledReason ? 'blocked' : 'ready'}
                      data-action-status={productsStorefrontApiCsvTemplateActionStatus}
                      data-disabled-reason={productsStorefrontApiTemplateDisabledReason || undefined}
                      data-target-site-id={activeSiteId}
                      iconStart={<FileText className="size-4" />}
                    >
                      CSV template
                    </Button>
                  </div>
                </details>
              </div>
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
                <div
                  data-testid="products-provider-certification"
                  className="mt-3 rounded-lg border border-border bg-card p-3"
                  role="group"
                  aria-label="Products provider certification actions"
                  aria-describedby={productsProviderCertificationActionStatusId}
                  data-action-status={productsProviderCertificationActionStatus}
                >
                  <span id={productsProviderCertificationActionStatusId} className="sr-only" data-testid="products-provider-certification-action-status" aria-live="polite">
                    {productsProviderCertificationActionStatus}
                  </span>
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
                        disabled={Boolean(productsProviderCertificationExportDisabledReason)}
                        title={productsProviderCertificationExportDisabledReason || undefined}
                        aria-describedby={productsProviderCertificationActionStatusId}
                        data-action-state={productsProviderCertificationExportDisabledReason ? 'blocked' : 'ready'}
                        data-action-status={productsProviderCertificationActionStatus}
                        data-disabled-reason={productsProviderCertificationExportDisabledReason || undefined}
                        iconStart={<Copy className="size-4" />}
                        data-testid="products-provider-certification-copy-button"
                      >
                        Copy provider handoff
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => void copyText(providerCertificationCommand, 'Products provider certification CI command')}
                        disabled={Boolean(productsProviderCertificationCommandDisabledReason)}
                        title={productsProviderCertificationCommandDisabledReason || undefined}
                        aria-describedby={productsProviderCertificationActionStatusId}
                        data-action-state={productsProviderCertificationCommandDisabledReason ? 'blocked' : 'ready'}
                        data-action-status={productsProviderCertificationActionStatus}
                        data-disabled-reason={productsProviderCertificationCommandDisabledReason || undefined}
                        iconStart={<Copy className="size-4" />}
                        data-testid="products-provider-certification-command-copy-button"
                      >
                        Copy CI command
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={downloadProviderCertificationHandoff}
                        disabled={Boolean(productsProviderCertificationExportDisabledReason)}
                        title={productsProviderCertificationExportDisabledReason || undefined}
                        aria-describedby={productsProviderCertificationActionStatusId}
                        data-action-state={productsProviderCertificationExportDisabledReason ? 'blocked' : 'ready'}
                        data-action-status={productsProviderCertificationActionStatus}
                        data-disabled-reason={productsProviderCertificationExportDisabledReason || undefined}
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
                  <div className="mt-3 rounded-md border border-border bg-background p-3 text-xs" data-testid="products-provider-certification-readiness-summary">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <div className="font-medium text-foreground">Product certification readiness summary</div>
                        <p className="mt-1 max-w-3xl leading-5 text-muted-foreground">
                          One-screen operator summary for the remaining Products live-provider gate before opening the runbook, env template, and evidence packet.
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
                      <span className="rounded-md border border-border bg-muted/20 px-2 py-1">Secret boundary: no commerce provider credentials, customer payloads, private order payloads, or webhook bodies are copied.</span>
                      <span className="rounded-md border border-border bg-muted/20 px-2 py-1">Artifact env: <span className="font-mono">{PRODUCT_PROVIDER_CERTIFICATION_OUTPUT_ENV}</span></span>
                    </div>
                    <div
                      className="mt-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-950"
                      data-testid="products-provider-certification-next-action"
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
                  <details
                    className="group mt-3 overflow-hidden rounded-md border border-border bg-background text-xs"
                    data-default-collapsed="true"
                    data-testid="products-provider-certification-operator-details"
                  >
                    <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-3 py-2 transition hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring [&::-webkit-details-marker]:hidden">
                      <span>
                        <span className="block font-medium text-foreground">Runbook, command builder, and evidence packet</span>
                        <span className="mt-1 block leading-5 text-muted-foreground">Open only when certifying live commerce providers or attaching release evidence.</span>
                      </span>
                      <span className="shrink-0 rounded-md bg-muted px-2 py-1 text-[11px] font-medium text-muted-foreground group-open:hidden">Show details</span>
                      <span className="hidden shrink-0 rounded-md bg-muted px-2 py-1 text-[11px] font-medium text-muted-foreground group-open:inline-flex">Hide details</span>
                    </summary>
                    <div className="border-t border-border p-3">
                      <div className="rounded-md border border-border bg-background px-3 py-2" data-testid="products-provider-certification-runbook">
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
                      <div className="mt-3 rounded-md border border-border bg-muted/10 p-3" data-testid="products-provider-certification-command-builder">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <div className="font-medium text-foreground">Provider certification command builder</div>
                        <p className="mt-1 max-w-3xl leading-5 text-muted-foreground">
                          Select the live commerce families for this run. The command keeps credentials in CI or shell environment variables and only writes non-secret selector aliases.
                        </p>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => void copyText(providerCertificationEnvTemplate, 'Products provider certification env template')}
                          disabled={Boolean(productsProviderCertificationCommandDisabledReason)}
                          title={productsProviderCertificationCommandDisabledReason || undefined}
                          aria-describedby={productsProviderCertificationActionStatusId}
                          data-action-state={productsProviderCertificationCommandDisabledReason ? 'blocked' : 'ready'}
                          data-action-status={productsProviderCertificationActionStatus}
                          data-disabled-reason={productsProviderCertificationCommandDisabledReason || undefined}
                          iconStart={<Copy className="size-4" />}
                          data-testid="products-provider-certification-env-copy-button"
                        >
                          Copy env template
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => void copyText(providerCertificationCommand, 'Products provider certification guarded command')}
                          disabled={Boolean(productsProviderCertificationCommandDisabledReason)}
                          title={productsProviderCertificationCommandDisabledReason || undefined}
                          aria-describedby={productsProviderCertificationActionStatusId}
                          data-action-state={productsProviderCertificationCommandDisabledReason ? 'blocked' : 'ready'}
                          data-action-status={productsProviderCertificationActionStatus}
                          data-disabled-reason={productsProviderCertificationCommandDisabledReason || undefined}
                          iconStart={<Copy className="size-4" />}
                          data-testid="products-provider-certification-command-builder-copy-button"
                        >
                          Copy guarded command
                        </Button>
                      </div>
                    </div>
                    <div className="mt-3 grid gap-2 md:grid-cols-2 xl:grid-cols-4">
                      {([
                        {
                          key: 'certifyPayment',
                          label: 'Payment checkout',
                          env: 'BACKY_COMMERCE_CERTIFY_PAYMENT',
                          testId: 'products-provider-certification-payment-toggle',
                        },
                        {
                          key: 'certifyTax',
                          label: 'Tax quotes',
                          env: 'BACKY_COMMERCE_CERTIFY_TAX',
                          testId: 'products-provider-certification-tax-toggle',
                        },
                        {
                          key: 'certifyShipping',
                          label: 'Shipping rates',
                          env: 'BACKY_COMMERCE_CERTIFY_SHIPPING',
                          testId: 'products-provider-certification-shipping-toggle',
                        },
                        {
                          key: 'certifyDiscount',
                          label: 'Discount quotes',
                          env: 'BACKY_COMMERCE_CERTIFY_DISCOUNT',
                          testId: 'products-provider-certification-discount-toggle',
                        },
                        {
                          key: 'certifyCatalog',
                          label: 'Catalog sync',
                          env: 'BACKY_COMMERCE_CERTIFY_CATALOG',
                          testId: 'products-provider-certification-catalog-toggle',
                        },
                        {
                          key: 'certifySubscriptions',
                          label: 'Subscriptions',
                          env: 'BACKY_COMMERCE_CERTIFY_SUBSCRIPTIONS',
                          testId: 'products-provider-certification-subscriptions-toggle',
                        },
                        {
                          key: 'certifyWebhooks',
                          label: 'Webhooks',
                          env: 'BACKY_COMMERCE_CERTIFY_WEBHOOKS',
                          testId: 'products-provider-certification-webhooks-toggle',
                        },
                      ] satisfies Array<{
                        key: 'certifyPayment' | 'certifyTax' | 'certifyShipping' | 'certifyDiscount' | 'certifyCatalog' | 'certifySubscriptions' | 'certifyWebhooks';
                        label: string;
                        env: string;
                        testId: string;
                      }>).map((item) => {
                        const itemDisabledReason = productsProviderCertificationBusyDisabledReason;
                        const itemControlProps = productsProviderCertificationControlProps(item.label, itemDisabledReason, providerCertificationCommandOptions[item.key]);

                        return (
                          <label
                            key={item.key}
                            className="flex min-h-[88px] items-start gap-2 rounded-md border border-border bg-background px-3 py-2"
                            data-provider-certification-family={item.key}
                            {...itemControlProps}
                          >
                            <input
                              type="checkbox"
                              checked={providerCertificationCommandOptions[item.key]}
                              onChange={(event) => updateProviderCertificationCommandOptions({
                                [item.key]: event.target.checked,
                              } as Partial<ProductProviderCertificationCommandOptions>)}
                              disabled={Boolean(itemDisabledReason)}
                              className="mt-1 size-4 rounded border-border"
                              data-testid={item.testId}
                              data-provider-certification-family={item.key}
                              {...itemControlProps}
                            />
                            <span>
                              <span className="block font-semibold text-foreground">{item.label}</span>
                              <span className="mt-1 block break-words font-mono text-[10px] leading-4 text-muted-foreground">{item.env}</span>
                            </span>
                          </label>
                        );
                      })}
                    </div>
                    <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                      <label className="text-xs">
                        <span className="font-semibold text-foreground">Payment provider</span>
                        <select
                          value={providerCertificationCommandOptions.paymentProvider}
                          onChange={(event) => updateProviderCertificationCommandOptions({
                            paymentProvider: event.target.value as ProductProviderCertificationPaymentProvider,
                          })}
                          disabled={Boolean(productsProviderCertificationPaymentProviderDisabledReason)}
                          className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground"
                          data-testid="products-provider-certification-payment-provider-select"
                          data-provider-certification-family="certifyPayment"
                          {...productsProviderCertificationControlProps('Payment provider selector', productsProviderCertificationPaymentProviderDisabledReason, providerCertificationCommandOptions.certifyPayment)}
                        >
                          {PRODUCT_PROVIDER_CERTIFICATION_PAYMENT_PROVIDER_OPTIONS.map((option) => (
                            <option key={option.value} value={option.value}>{option.label}</option>
                          ))}
                        </select>
                        <span className="mt-1 block text-[11px] leading-4 text-muted-foreground">
                          {PRODUCT_PROVIDER_CERTIFICATION_PAYMENT_PROVIDER_OPTIONS.find((option) => option.value === providerCertificationCommandOptions.paymentProvider)?.description}
                        </span>
                      </label>
                      <label className="text-xs">
                        <span className="font-semibold text-foreground">Tax provider</span>
                        <select
                          value={providerCertificationCommandOptions.taxProvider}
                          onChange={(event) => updateProviderCertificationCommandOptions({
                            taxProvider: event.target.value as ProductProviderCertificationTaxProvider,
                          })}
                          disabled={Boolean(productsProviderCertificationTaxProviderDisabledReason)}
                          className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground"
                          data-testid="products-provider-certification-tax-provider-select"
                          data-provider-certification-family="certifyTax"
                          {...productsProviderCertificationControlProps('Tax provider selector', productsProviderCertificationTaxProviderDisabledReason, providerCertificationCommandOptions.certifyTax)}
                        >
                          {PRODUCT_PROVIDER_CERTIFICATION_TAX_PROVIDER_OPTIONS.map((option) => (
                            <option key={option.value} value={option.value}>{option.label}</option>
                          ))}
                        </select>
                        <span className="mt-1 block text-[11px] leading-4 text-muted-foreground">
                          {PRODUCT_PROVIDER_CERTIFICATION_TAX_PROVIDER_OPTIONS.find((option) => option.value === providerCertificationCommandOptions.taxProvider)?.description}
                        </span>
                      </label>
                      <label className="text-xs">
                        <span className="font-semibold text-foreground">Shipping provider</span>
                        <select
                          value={providerCertificationCommandOptions.shippingProvider}
                          onChange={(event) => updateProviderCertificationCommandOptions({
                            shippingProvider: event.target.value as ProductProviderCertificationShippingProvider,
                          })}
                          disabled={Boolean(productsProviderCertificationShippingProviderDisabledReason)}
                          className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground"
                          data-testid="products-provider-certification-shipping-provider-select"
                          data-provider-certification-family="certifyShipping"
                          {...productsProviderCertificationControlProps('Shipping provider selector', productsProviderCertificationShippingProviderDisabledReason, providerCertificationCommandOptions.certifyShipping)}
                        >
                          {PRODUCT_PROVIDER_CERTIFICATION_SHIPPING_PROVIDER_OPTIONS.map((option) => (
                            <option key={option.value} value={option.value}>{option.label}</option>
                          ))}
                        </select>
                        <span className="mt-1 block text-[11px] leading-4 text-muted-foreground">
                          {PRODUCT_PROVIDER_CERTIFICATION_SHIPPING_PROVIDER_OPTIONS.find((option) => option.value === providerCertificationCommandOptions.shippingProvider)?.description}
                        </span>
                      </label>
                      <label className="text-xs">
                        <span className="font-semibold text-foreground">Discount provider</span>
                        <select
                          value={providerCertificationCommandOptions.discountProvider}
                          onChange={(event) => updateProviderCertificationCommandOptions({
                            discountProvider: event.target.value as ProductProviderCertificationDiscountProvider,
                          })}
                          disabled={Boolean(productsProviderCertificationDiscountProviderDisabledReason)}
                          className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground"
                          data-testid="products-provider-certification-discount-provider-select"
                          data-provider-certification-family="certifyDiscount"
                          {...productsProviderCertificationControlProps('Discount provider selector', productsProviderCertificationDiscountProviderDisabledReason, providerCertificationCommandOptions.certifyDiscount)}
                        >
                          {PRODUCT_PROVIDER_CERTIFICATION_DISCOUNT_PROVIDER_OPTIONS.map((option) => (
                            <option key={option.value} value={option.value}>{option.label}</option>
                          ))}
                        </select>
                        <span className="mt-1 block text-[11px] leading-4 text-muted-foreground">
                          {PRODUCT_PROVIDER_CERTIFICATION_DISCOUNT_PROVIDER_OPTIONS.find((option) => option.value === providerCertificationCommandOptions.discountProvider)?.description}
                        </span>
                      </label>
                      <label className="text-xs">
                        <span className="font-semibold text-foreground">Catalog provider</span>
                        <select
                          value={providerCertificationCommandOptions.catalogProvider}
                          onChange={(event) => updateProviderCertificationCommandOptions({
                            catalogProvider: event.target.value as ProductProviderCertificationCatalogProvider,
                          })}
                          disabled={Boolean(productsProviderCertificationCatalogProviderDisabledReason)}
                          className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground"
                          data-testid="products-provider-certification-catalog-provider-select"
                          data-provider-certification-family="certifyCatalog"
                          {...productsProviderCertificationControlProps('Catalog provider selector', productsProviderCertificationCatalogProviderDisabledReason, providerCertificationCommandOptions.certifyCatalog)}
                        >
                          {PRODUCT_PROVIDER_CERTIFICATION_CATALOG_PROVIDER_OPTIONS.map((option) => (
                            <option key={option.value} value={option.value}>{option.label}</option>
                          ))}
                        </select>
                        <span className="mt-1 block text-[11px] leading-4 text-muted-foreground">
                          {PRODUCT_PROVIDER_CERTIFICATION_CATALOG_PROVIDER_OPTIONS.find((option) => option.value === providerCertificationCommandOptions.catalogProvider)?.description}
                        </span>
                      </label>
                      <label className="text-xs">
                        <span className="font-semibold text-foreground">Subscription provider</span>
                        <select
                          value={providerCertificationCommandOptions.subscriptionProvider}
                          onChange={(event) => updateProviderCertificationCommandOptions({
                            subscriptionProvider: event.target.value as ProductProviderCertificationSubscriptionProvider,
                          })}
                          disabled={Boolean(productsProviderCertificationSubscriptionProviderDisabledReason)}
                          className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground"
                          data-testid="products-provider-certification-subscription-provider-select"
                          data-provider-certification-family="certifySubscriptions"
                          {...productsProviderCertificationControlProps('Subscription provider selector', productsProviderCertificationSubscriptionProviderDisabledReason, providerCertificationCommandOptions.certifySubscriptions)}
                        >
                          {PRODUCT_PROVIDER_CERTIFICATION_SUBSCRIPTION_PROVIDER_OPTIONS.map((option) => (
                            <option key={option.value} value={option.value}>{option.label}</option>
                          ))}
                        </select>
                        <span className="mt-1 block text-[11px] leading-4 text-muted-foreground">
                          {PRODUCT_PROVIDER_CERTIFICATION_SUBSCRIPTION_PROVIDER_OPTIONS.find((option) => option.value === providerCertificationCommandOptions.subscriptionProvider)?.description}
                        </span>
                      </label>
                      <label className="text-xs">
                        <span className="font-semibold text-foreground">Webhook provider</span>
                        <select
                          value={providerCertificationCommandOptions.webhookProvider}
                          onChange={(event) => updateProviderCertificationCommandOptions({
                            webhookProvider: event.target.value as ProductProviderCertificationWebhookProvider,
                          })}
                          disabled={Boolean(productsProviderCertificationWebhookProviderDisabledReason)}
                          className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground"
                          data-testid="products-provider-certification-webhook-provider-select"
                          data-provider-certification-family="certifyWebhooks"
                          {...productsProviderCertificationControlProps('Webhook provider selector', productsProviderCertificationWebhookProviderDisabledReason, providerCertificationCommandOptions.certifyWebhooks)}
                        >
                          {PRODUCT_PROVIDER_CERTIFICATION_WEBHOOK_PROVIDER_OPTIONS.map((option) => (
                            <option key={option.value} value={option.value}>{option.label}</option>
                          ))}
                        </select>
                        <span className="mt-1 block text-[11px] leading-4 text-muted-foreground">
                          {PRODUCT_PROVIDER_CERTIFICATION_WEBHOOK_PROVIDER_OPTIONS.find((option) => option.value === providerCertificationCommandOptions.webhookProvider)?.description}
                        </span>
                      </label>
                    </div>
                    <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-[220px_minmax(0,1fr)_260px]">
                      <div className="rounded-md border border-border bg-background px-3 py-2 text-xs" data-testid="products-provider-certification-site-target">
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
                          disabled={isProductsAccessBusy}
                          placeholder="https://backy.example.com"
                          className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground"
                          data-testid="products-provider-certification-external-target-input"
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
                          disabled={isProductsAccessBusy}
                          className="mt-1 size-4 rounded border-border"
                          data-testid="products-provider-certification-doctor-toggle"
                        />
                        <span>
                          <span className="block font-semibold text-foreground">Release doctor</span>
                          <span className="mt-1 block break-words font-mono text-[10px] leading-4 text-muted-foreground">
                            BACKY_RELEASE_CERTIFICATION_DOCTOR_REQUIRED=1
                          </span>
                        </span>
                      </label>
                    </div>
                    <div className="mt-3 rounded-md border border-border bg-background p-3" data-testid="products-provider-certification-env-template">
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
                        data-testid="products-provider-certification-env-template-body"
                      >
                        {providerCertificationEnvTemplate}
                      </pre>
                    </div>
                    <div className="mt-3 grid gap-3 lg:grid-cols-[minmax(0,1.25fr)_minmax(0,0.75fr)]">
                      <div>
                        <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Generated command</div>
                        <pre
                          className="mt-1 max-h-72 overflow-auto rounded-md border border-border bg-background p-3 font-mono text-[11px] leading-5 text-foreground"
                          data-testid="products-provider-certification-command"
                        >
                          {providerCertificationCommand}
                        </pre>
                      </div>
                      <div>
                        <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Selected required inputs</div>
                        <div className="mt-1 flex max-h-72 flex-wrap gap-1 overflow-auto rounded-md border border-border bg-background p-3" data-testid="products-provider-certification-required-inputs">
                          {providerCertificationRequiredInputs.map((input) => (
                            <span key={input} className="rounded bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
                              {input}
                            </span>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                      <div className="mt-3 rounded-md border border-border bg-background px-3 py-2" data-testid="products-provider-runtime-evidence">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <div className="font-medium text-foreground">Runtime provider evidence</div>
                        <div className="mt-1 text-muted-foreground">
                          {providerRuntimeEvidence.loaded
                            ? `${providerRuntimeEvidence.configuredFamilies.length} configured / ${providerRuntimeEvidence.missingFamilies.length} missing families`
                            : 'Settings runtime commerce evidence has not loaded yet.'}
                        </div>
                      </div>
                      <span className={cn(
                        'rounded-md px-2 py-1 text-[11px] font-semibold',
                        providerRuntimeEvidence.missingFamilies.length === 0 ? 'bg-success/10 text-success' : 'bg-warning/10 text-warning',
                      )}
                      >
                        {providerRuntimeEvidence.missingFamilies.length === 0 ? 'Ready to certify' : 'Needs credentials'}
                      </span>
                    </div>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {providerRuntimeEvidence.configuredFamilies.map((family) => (
                        <span key={`configured-${family}`} className="rounded-full bg-success/10 px-2 py-0.5 text-[11px] text-success">
                          {family}
                        </span>
                      ))}
                      {providerRuntimeEvidence.missingFamilies.map((family) => (
                        <span key={`missing-${family}`} className="rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">
                          {family}
                        </span>
                      ))}
                    </div>
                    <div className="mt-2 text-[11px] leading-4 text-muted-foreground">
                      {providerRuntimeEvidence.secretHandling}
                    </div>
                  </div>
                      <div className="mt-3 rounded-md border border-border bg-background px-3 py-2" data-testid="products-provider-certification-evidence">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <div className="font-medium text-foreground">Product provider certification evidence</div>
                        <p className="mt-1 max-w-3xl leading-5 text-muted-foreground">
                          Tracks the non-secret product launch and provider scenarios operators must attach before treating live product commerce as certified.
                        </p>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="rounded-md border border-border bg-muted/30 px-2 py-1 font-mono text-[11px] text-muted-foreground">
                          {productProviderCertificationEvidence.schemaVersion}
                        </span>
                        <span className={cn(
                          'rounded-full px-2 py-0.5 text-[11px] font-semibold',
                          productProviderCertificationEvidence.status === 'ready' ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700',
                        )}>
                          {productProviderCertificationEvidence.coverage.covered}/{productProviderCertificationEvidence.coverage.total} scenarios
                        </span>
                      </div>
                    </div>
                    <div className="mt-2 rounded border border-border bg-muted/30 px-2 py-1.5 font-mono text-[11px] text-foreground">
                      {productProviderCertificationEvidence.requiredGate}
                    </div>
                    <div className="mt-3 grid gap-2 md:grid-cols-2 xl:grid-cols-4">
                      {productProviderCertificationEvidence.scenarios.map((scenario) => (
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
                      {productProviderCertificationEvidence.secretHandling}
                    </div>
                  </div>
                      <div className="mt-3 rounded-md border border-border bg-background px-3 py-2" data-testid="products-provider-certification-evidence-packet">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <div className="font-medium text-foreground">Certification evidence packet</div>
                        <p className="mt-1 max-w-3xl leading-5 text-muted-foreground">
                          Redacted operator attachment manifest for the selected provider families, required inputs, scenario attachments, and capture sources.
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
                          onClick={() => void copyText(providerCertificationEvidencePacketText, 'Products provider certification evidence packet')}
                          disabled={Boolean(productsProviderCertificationCommandDisabledReason)}
                          title={productsProviderCertificationCommandDisabledReason || undefined}
                          aria-describedby={productsProviderCertificationActionStatusId}
                          data-action-state={productsProviderCertificationCommandDisabledReason ? 'blocked' : 'ready'}
                          data-action-status={productsProviderCertificationActionStatus}
                          data-disabled-reason={productsProviderCertificationCommandDisabledReason || undefined}
                          iconStart={<Copy className="size-4" />}
                          data-testid="products-provider-certification-evidence-packet-copy-button"
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
                            : 'Selected families have runtime credential evidence.'}
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
                          <div key={group.family} className="rounded-md border border-border bg-background px-3 py-2">
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
                  </details>
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
          </div>
        </details>
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
                <span id={productsBulkActionStatusId} className="sr-only" data-testid="products-bulk-action-status" aria-live="polite">
                  {productsBulkActionStatus}
                </span>
                {selectedLoadedProducts.length > 0 && (
                  <div
                    className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-primary/20 bg-primary/5 px-3 py-2 text-sm"
                    role="group"
                    aria-label="Selected product bulk actions"
                    aria-describedby={productsBulkActionStatusId}
                    data-testid="products-bulk-toolbar"
                    data-action-status={productsBulkActionStatus}
                  >
                    <div>
                      <div className="font-medium text-foreground" data-testid="products-bulk-selection-summary">
                        {selectedLoadedProducts.length} selected product{selectedLoadedProducts.length === 1 ? '' : 's'}
                      </div>
                      {hiddenSelectedProductCount > 0 ? (
                        <div className="mt-1 text-xs text-muted-foreground">
                          Bulk actions will include {hiddenSelectedProductCount} selected product{hiddenSelectedProductCount === 1 ? '' : 's'} outside the current filtered view.
                        </div>
                      ) : (
                        <div className="mt-1 text-xs text-muted-foreground">
                          Bulk actions apply to the selected loaded catalog rows.
                        </div>
                      )}
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <Button
                        size="sm"
                        onClick={() => void bulkUpdateProductStatus('published')}
                        disabled={Boolean(productsBulkStatusDisabledReason)}
                        title={productsBulkStatusDisabledReason || undefined}
                        aria-describedby={productsBulkActionStatusId}
                        data-action-state={productsBulkStatusDisabledReason ? 'blocked' : 'ready'}
                        data-action-status={productsBulkActionStatus}
                        data-disabled-reason={productsBulkStatusDisabledReason || undefined}
                        iconStart={<CheckCircle2 className="size-4" />}
                        data-testid="products-bulk-publish"
                      >
                        Publish
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => void bulkUpdateProductStatus('draft')}
                        disabled={Boolean(productsBulkStatusDisabledReason)}
                        title={productsBulkStatusDisabledReason || undefined}
                        aria-describedby={productsBulkActionStatusId}
                        data-action-state={productsBulkStatusDisabledReason ? 'blocked' : 'ready'}
                        data-action-status={productsBulkActionStatus}
                        data-disabled-reason={productsBulkStatusDisabledReason || undefined}
                        iconStart={<Edit3 className="size-4" />}
                        data-testid="products-bulk-draft"
                      >
                        Draft
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => void bulkUpdateProductStatus('archived')}
                        disabled={Boolean(productsBulkStatusDisabledReason)}
                        title={productsBulkStatusDisabledReason || undefined}
                        aria-describedby={productsBulkActionStatusId}
                        data-action-state={productsBulkStatusDisabledReason ? 'blocked' : 'ready'}
                        data-action-status={productsBulkActionStatus}
                        data-disabled-reason={productsBulkStatusDisabledReason || undefined}
                        iconStart={<Archive className="size-4" />}
                        data-testid="products-bulk-archive"
                      >
                        Archive
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={exportSelectedProductsCsv}
                        disabled={Boolean(productsBulkExportDisabledReason)}
                        title={productsBulkExportDisabledReason || undefined}
                        aria-describedby={productsBulkActionStatusId}
                        data-action-state={productsBulkExportDisabledReason ? 'blocked' : 'ready'}
                        data-action-status={productsBulkActionStatus}
                        data-disabled-reason={productsBulkExportDisabledReason || undefined}
                        iconStart={<Download className="size-4" />}
                        data-testid="products-bulk-export"
                      >
                        Export
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={clearProductSelection}
                        disabled={Boolean(productsBulkClearDisabledReason)}
                        title={productsBulkClearDisabledReason || undefined}
                        aria-describedby={productsBulkActionStatusId}
                        data-action-state={productsBulkClearDisabledReason ? 'blocked' : 'ready'}
                        data-action-status={productsBulkActionStatus}
                        data-disabled-reason={productsBulkClearDisabledReason || undefined}
                        data-testid="products-bulk-clear-selection"
                      >
                        Clear
                      </Button>
                      <Button
                        size="sm"
                        variant="danger"
                        onClick={() => setPendingBulkDeleteProducts(true)}
                        disabled={Boolean(productsBulkDeleteDisabledReason)}
                        title={productsBulkDeleteDisabledReason || undefined}
                        aria-describedby={productsBulkActionStatusId}
                        data-action-state={productsBulkDeleteDisabledReason ? 'blocked' : 'ready'}
                        data-action-status={productsBulkActionStatus}
                        data-disabled-reason={productsBulkDeleteDisabledReason || undefined}
                        iconStart={<Trash2 className="size-4" />}
                        data-testid="products-bulk-delete"
                      >
                        Delete
                      </Button>
                    </div>
                  </div>
                )}
                <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
                  <div className="flex flex-wrap items-center gap-3">
                    {filteredProducts.length > 0 ? (
                      <label className="inline-flex items-center gap-2 font-medium text-foreground">
                        <input
                          type="checkbox"
                          aria-label="Select all visible products"
                          aria-checked={selectedVisibleProducts.length > 0 && !areAllVisibleProductsSelected ? 'mixed' : areAllVisibleProductsSelected}
                          checked={areAllVisibleProductsSelected}
                          disabled={Boolean(productsBulkSelectionDisabledReason)}
                          title={productsBulkSelectionDisabledReason || undefined}
                          aria-describedby={productsBulkActionStatusId}
                          data-action-state={productsBulkSelectionDisabledReason ? 'blocked' : 'ready'}
                          data-action-status={productsBulkActionStatus}
                          data-disabled-reason={productsBulkSelectionDisabledReason || undefined}
                          onChange={(event) => setVisibleProductSelection(event.target.checked)}
                          className="size-4 rounded border-border text-primary disabled:cursor-not-allowed disabled:opacity-60"
                        />
                        Select visible
                      </label>
                    ) : null}
                    <span>
                      Loaded {loadedProductCount} of {totalProductCount} product records. Filters and CSV export apply to loaded rows.
                    </span>
                  </div>
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
                        selectedForBulk={selectedProductIdSet.has(product.id)}
                        onEdit={() => selectProductForEditing(product.id)}
                        onToggleBulkSelection={() => toggleProductSelection(product.id)}
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
                        bulkSelectionDisabled={isProductsAccessBusy || !canViewProducts}
                        canDelete={canDeleteProducts}
                        deleteDisabledReason={deletePermissionTitle}
                      />
                    ))}
                  </div>
                )}
              </PanelContent>
            </Panel>
          </div>

          <Panel
            id="products-editor"
            data-testid="products-editor-panel"
            className="scroll-mt-24 xl:sticky xl:top-4 xl:max-h-[calc(100vh-2rem)] xl:self-start xl:overflow-y-auto"
          >
            <PanelHeader
              title={selectedProduct ? 'Edit product' : 'New product'}
              description="Pricing, inventory, public status, and storefront metadata."
              icon={<Package className="size-4" />}
            />
            <PanelContent>
              <form onSubmit={saveProduct} noValidate data-testid="products-editor-form">
                <div
                  className="sticky top-0 z-10 -mx-5 mb-4 border-y border-border bg-card/95 px-5 py-3 shadow-sm backdrop-blur"
                  data-testid="products-editor-sticky-actions"
                >
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="truncate text-sm font-semibold text-foreground">
                        {selectedProduct ? 'Editing product' : 'Create product'}
                      </div>
                      <div className="mt-0.5 text-xs text-muted-foreground">
                        {productFormSubmitted && (productIdentityMissing || scheduledProductDateError)
                          ? 'Fix the highlighted fields before saving.'
                          : 'Core actions stay available while you move through the editor.'}
                      </div>
                    </div>
                    <div className="flex shrink-0 flex-wrap gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={resetForm}
                        disabled={isProductsAccessBusy || !canEditProducts}
                        data-testid="products-editor-sticky-clear"
                      >
                        Clear
                      </Button>
                      <Button
                        size="sm"
                        type="submit"
                        variant="primary"
                        disabled={isProductsAccessBusy || !canEditProducts}
                        title={!canEditProducts ? editPermissionTitle : undefined}
                        iconStart={<Package className="size-4" />}
                        data-testid="products-editor-sticky-save"
                      >
                        {isSaving ? 'Saving...' : selectedProduct ? 'Save Product' : 'Create Product'}
                      </Button>
                    </div>
                  </div>
                  <nav
                    aria-label="Product editor sections"
                    className="mt-3 flex gap-1 overflow-x-auto pb-1"
                    data-testid="products-editor-section-nav"
                  >
                    {PRODUCT_EDITOR_SECTIONS.map((section) => (
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
                <fieldset disabled={isProductsAccessBusy || !canEditProducts} title={!canEditProducts ? editPermissionTitle : undefined} className={cn('space-y-4', (isProductsAccessBusy || !canEditProducts) && 'opacity-70')}>
                <div id="products-editor-identity" className="scroll-mt-28" data-testid="products-editor-identity-section" />
                <Field label="Title">
                  <input
                    value={formState.title}
                    onChange={(event) => setFormState((current) => ({
                      ...current,
                      title: event.target.value,
                      slug: current.slug || slugify(event.target.value),
                    }))}
                    required
                    aria-invalid={Boolean(productTitleInlineError)}
                    aria-describedby={productTitleInlineError ? 'products-title-error' : undefined}
                    data-testid="products-title-input"
                    className="w-full rounded-lg border bg-background px-3 py-2.5 text-sm"
                    placeholder="Backy Pro Template"
                  />
                  {productTitleInlineError ? (
                    <span id="products-title-error" className="block text-xs text-destructive" data-testid="products-title-error">
                      {productTitleInlineError}
                    </span>
                  ) : null}
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
                      aria-invalid={Boolean(productSkuInlineError)}
                      aria-describedby={productSkuInlineError ? 'products-sku-error' : undefined}
                      data-testid="products-sku-input"
                      className="w-full rounded-lg border bg-background px-3 py-2.5 text-sm"
                      placeholder="BKY-001"
                    />
                    {productSkuInlineError ? (
                      <span id="products-sku-error" className="block text-xs text-destructive" data-testid="products-sku-error">
                        {productSkuInlineError}
                      </span>
                    ) : null}
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
                <div id="products-editor-variants" className="scroll-mt-28" data-testid="products-editor-variants-section" />
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
                      aria-invalid={Boolean(variantDraftIdentityInlineError)}
                      aria-describedby={variantDraftIdentityInlineError ? 'products-variant-identity-error' : undefined}
                      data-testid="products-variant-title-input"
                      className="rounded-lg border bg-background px-3 py-2.5 text-sm"
                      placeholder="Variant name"
                    />
                    <input
                      aria-label="Variant option"
                      value={variantDraft.option}
                      onChange={(event) => setVariantDraft((current) => ({ ...current, option: event.target.value }))}
                      aria-invalid={Boolean(variantDraftIdentityInlineError)}
                      aria-describedby={variantDraftIdentityInlineError ? 'products-variant-identity-error' : undefined}
                      data-testid="products-variant-option-input"
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
                      aria-invalid={Boolean(variantDraftPriceInlineError)}
                      aria-describedby={variantDraftPriceInlineError ? 'products-variant-price-error' : undefined}
                      data-testid="products-variant-price-input"
                      className="rounded-lg border bg-background px-3 py-2.5 text-sm"
                      placeholder="Price"
                    />
                    <input
                      aria-label="Variant stock"
                      type="number"
                      min="0"
                      value={variantDraft.inventory}
                      onChange={(event) => setVariantDraft((current) => ({ ...current, inventory: event.target.value }))}
                      aria-invalid={Boolean(variantDraftInventoryInlineError)}
                      aria-describedby={variantDraftInventoryInlineError ? 'products-variant-inventory-error' : undefined}
                      data-testid="products-variant-inventory-input"
                      className="rounded-lg border bg-background px-3 py-2.5 text-sm"
                      placeholder="Stock"
                    />
                    <Button
                      variant="outline"
                      onClick={addProductVariant}
                      disabled={productVariants.length >= PRODUCT_VARIANT_LIMIT || isProductsAccessBusy || !canEditProducts}
                      data-testid="products-variant-add"
                    >
                      Add
                    </Button>
                  </div>
                  {(variantDraftIdentityInlineError || variantDraftPriceInlineError || variantDraftInventoryInlineError) ? (
                    <div className="grid gap-1 text-xs text-destructive md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_110px_110px_auto]">
                      <span id="products-variant-identity-error" data-testid="products-variant-identity-error">
                        {variantDraftIdentityInlineError}
                      </span>
                      <span aria-hidden="true" />
                      <span id="products-variant-price-error" data-testid="products-variant-price-error">
                        {variantDraftPriceInlineError}
                      </span>
                      <span id="products-variant-inventory-error" data-testid="products-variant-inventory-error">
                        {variantDraftInventoryInlineError}
                      </span>
                      <span aria-hidden="true" />
                    </div>
                  ) : null}
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
                      aria-invalid={Boolean(optionMatrixInlineError)}
                      aria-describedby={optionMatrixInlineError ? 'products-variant-matrix-options-error' : undefined}
                      className="mt-3 min-h-20 w-full rounded-lg border bg-background px-3 py-2.5 font-mono text-sm"
                      placeholder={'Size: S, M, L\nColor: Black, White'}
                      disabled={isProductsAccessBusy || !canEditProducts}
                    />
                    {optionMatrixInlineError ? (
                      <p
                        id="products-variant-matrix-options-error"
                        className="mt-1 text-xs text-destructive"
                        data-testid="products-variant-matrix-options-error"
                      >
                        {optionMatrixInlineError}
                      </p>
                    ) : null}
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
                        aria-invalid={Boolean(optionMatrixPriceInlineError)}
                        aria-describedby={optionMatrixPriceInlineError ? 'products-variant-matrix-price-error' : undefined}
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
                        aria-invalid={Boolean(optionMatrixInventoryInlineError)}
                        aria-describedby={optionMatrixInventoryInlineError ? 'products-variant-matrix-inventory-error' : undefined}
                        className="rounded-lg border bg-background px-3 py-2.5 text-sm"
                        placeholder="Stock"
                        disabled={isProductsAccessBusy || !canEditProducts}
                      />
                      <Button
                        variant="outline"
                        onClick={generateVariantMatrix}
                        disabled={productVariants.length >= PRODUCT_VARIANT_LIMIT || isProductsAccessBusy || !canEditProducts}
                        data-testid="products-variant-matrix-generate"
                      >
                        Generate
                      </Button>
                    </div>
                    {(optionMatrixPriceInlineError || optionMatrixInventoryInlineError) ? (
                      <div className="mt-1 grid gap-1 text-xs text-destructive md:grid-cols-[minmax(0,1fr)_120px_120px_auto]">
                        <span aria-hidden="true" />
                        <span id="products-variant-matrix-price-error" data-testid="products-variant-matrix-price-error">
                          {optionMatrixPriceInlineError}
                        </span>
                        <span id="products-variant-matrix-inventory-error" data-testid="products-variant-matrix-inventory-error">
                          {optionMatrixInventoryInlineError}
                        </span>
                        <span aria-hidden="true" />
                      </div>
                    ) : null}
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
                <div id="products-editor-fulfillment" className="scroll-mt-28" data-testid="products-editor-fulfillment-section" />
                <div className="grid gap-3 md:grid-cols-2">
                  <Field label="Digital delivery URL">
                    <div className="flex gap-2">
                      <input
                        aria-label="Digital delivery URL"
                        value={formState.downloadUrl}
                        onChange={(event) => setFormState((current) => ({
                          ...current,
                          ...clearProductDownloadMediaState(),
                          downloadUrl: event.target.value,
                        }))}
                        className="min-w-0 flex-1 rounded-lg border bg-background px-3 py-2.5 text-sm"
                        placeholder="https://downloads.example.com/product.zip"
                      />
                      <Button onClick={() => openMediaPicker('download')} disabled={!canViewMedia} title={!canViewMedia ? mediaViewPermissionTitle : undefined} iconStart={<FileText className="size-4" />}>
                        File
                      </Button>
                    </div>
                    {formState.downloadMediaId ? (
                      <div className="mt-2 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border bg-muted/40 px-3 py-2" data-testid="products-download-media-binding">
                        <div className="min-w-0 text-xs">
                          <div className="truncate font-medium text-foreground">{formState.downloadMediaName || formState.downloadMediaId}</div>
                          <div className="mt-0.5 truncate text-muted-foreground">
                            {[
                              formState.downloadMediaId,
                              formState.downloadMediaType || 'file',
                              formState.downloadMediaFolderPath,
                              formState.downloadMediaVisibility,
                              formState.downloadMediaScope,
                            ].filter(Boolean).join(' · ')}
                          </div>
                        </div>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => setFormState((current) => ({
                            ...current,
                            ...clearProductDownloadMediaState(),
                          }))}
                          disabled={isProductsAccessBusy || !canEditProducts}
                          data-testid="products-download-media-clear"
                        >
                          Clear binding
                        </Button>
                      </div>
                    ) : null}
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
                <div id="products-editor-subscriptions" className="scroll-mt-28" data-testid="products-editor-subscriptions-section" />
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
                  <div className="grid gap-3 md:grid-cols-5">
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
                      <div className="text-[11px] uppercase text-muted-foreground">Action needed</div>
                      <div className="mt-1 text-sm font-medium text-foreground">{selectedProductLifecycle?.actionPlan?.attentionRequired ?? 0}</div>
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
                  <div className="mt-3 rounded-md border border-border bg-background p-3" data-testid="products-subscription-action-plan">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <div className="text-xs font-semibold text-foreground">Lifecycle action plan</div>
                        <div className="mt-0.5 text-[11px] text-muted-foreground">
                          Recommended operator work, executable actions, and handoff load for the selected product.
                        </div>
                      </div>
                      <div className="text-[11px] text-muted-foreground">
                        {selectedProductLifecycle?.actionPlan?.schemaVersion || 'backy.product-subscription-action-plan-summary.v1'}
                      </div>
                    </div>
                    <div className="mt-3 grid gap-2 md:grid-cols-4">
                      {[
                        ['Attention', selectedProductLifecycle?.actionPlan?.attentionRequired ?? 0],
                        ['Executable now', selectedProductLifecycle?.actionPlan?.executableNow ?? 0],
                        ['Manual handoff', selectedProductLifecycle?.actionPlan?.handoffRequired ?? 0],
                        ['Retry/follow-up', selectedProductLifecycle?.actionPlan?.retryRecommended ?? 0],
                      ].map(([label, value]) => (
                        <div key={label} className="rounded-md border border-border bg-card px-3 py-2 text-xs">
                          <div className="text-muted-foreground">{label}</div>
                          <div className="mt-1 font-semibold text-foreground">{value}</div>
                        </div>
                      ))}
                    </div>
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
                  <div className="mt-3 rounded-md border border-border bg-background p-3" data-testid="products-subscription-certification">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <div className="text-xs font-semibold text-foreground">Lifecycle certification evidence</div>
                        <div className="mt-0.5 text-[11px] text-muted-foreground">
                          {selectedProductLifecycle?.certification
                            ? `${selectedProductLifecycle.certification.coverage.covered}/${selectedProductLifecycle.certification.coverage.total} launch scenarios evidenced`
                            : 'Refresh lifecycle to compare live provider evidence against required subscription launch scenarios.'}
                        </div>
                      </div>
                      <div className="text-[11px] text-muted-foreground">
                        {selectedProductLifecycle?.certification?.schemaVersion || 'backy.product-subscription-certification.v1'}
                      </div>
                    </div>
                    {selectedProductLifecycle?.certification ? (
                      <>
                        <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
                          <span>Gate</span>
                          <span className="rounded-md border border-border bg-card px-2 py-1 font-mono text-foreground">
                            {selectedProductLifecycle.certification.requiredGate}
                          </span>
                        </div>
                        <div className="mt-3 grid gap-2 md:grid-cols-2 xl:grid-cols-4">
                          {selectedProductLifecycle.certification.scenarios.map((scenario) => (
                            <div key={scenario.key} className="rounded-md border border-border bg-card px-3 py-2 text-xs">
                              <div className="flex items-start justify-between gap-2">
                                <div className="font-medium text-foreground">{scenario.label}</div>
                                <span className={cn(
                                  'rounded-full px-2 py-0.5 text-[10px] font-semibold',
                                  scenario.status === 'covered' ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700',
                                )}>
                                  {scenario.status}
                                </span>
                              </div>
                              <div className="mt-1 text-muted-foreground">
                                {scenario.evidenceCount} evidence item{scenario.evidenceCount === 1 ? '' : 's'}
                              </div>
                              {scenario.status === 'missing' ? (
                                <div className="mt-1 text-[11px] text-foreground">{scenario.nextAction}</div>
                              ) : null}
                              <div className="mt-1 break-words text-[11px] text-muted-foreground">
                                Expected: {scenario.expectedEvidence.slice(0, 2).join(' · ')}
                              </div>
                            </div>
                          ))}
                        </div>
                        <div className="mt-2 text-[11px] text-muted-foreground">
                          {selectedProductLifecycle.certification.secretHandling}
                        </div>
                      </>
                    ) : (
                      <div className="mt-3 grid gap-2 md:grid-cols-2 xl:grid-cols-4">
                        {PRODUCT_SUBSCRIPTION_CERTIFICATION_SCENARIOS.map((scenario) => (
                          <div key={scenario.key} className="rounded-md border border-border bg-card px-3 py-2 text-xs">
                            <div className="flex items-start justify-between gap-2">
                              <div className="font-medium text-foreground">{scenario.label}</div>
                              <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-700">pending</span>
                            </div>
                            <div className="mt-1 text-[11px] text-foreground">{scenario.nextAction}</div>
                            <div className="mt-1 break-words text-[11px] text-muted-foreground">
                              Expected: {scenario.expectedEvidence.join(' · ')}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="mt-3 rounded-md border border-border bg-background p-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="text-xs font-semibold text-foreground">Recent subscription orders</div>
                      <div className="text-[11px] text-muted-foreground">{selectedProductLifecycle?.schemaVersion || 'backy.product-subscription-lifecycle.v1'}</div>
                    </div>
                    <div className="mt-2 space-y-2">
                      {selectedProductLifecycle?.subscriptions.length ? selectedProductLifecycle.subscriptions.slice(0, 6).map((subscription) => {
                        const pausePlan = subscription.actionPlan?.availableActions.find((action) => action.action === 'pause');
                        const resumePlan = subscription.actionPlan?.availableActions.find((action) => action.action === 'resume');
                        const cancelPlan = subscription.actionPlan?.availableActions.find((action) => action.action === 'cancel');
                        const actionDisabled = (plan: typeof pausePlan) => !plan?.enabled || productLifecycleActionBusy !== null || !canEditProducts;
                        const actionTitle = (plan: typeof pausePlan) => (
                          !canEditProducts ? editPermissionTitle : plan?.reason
                        );

                        return (
                          <div key={subscription.id} className="flex flex-wrap items-start justify-between gap-3 rounded-md border border-border bg-card px-3 py-2 text-xs">
                            <div className="max-w-xl">
                              <div className="font-medium text-foreground">{subscription.orderNumber}</div>
                              <div className="mt-0.5 text-muted-foreground">
                                {subscription.customerEmail || subscription.customerName || 'Unknown customer'}
                                {subscription.subscriptionReference ? ` · ${subscription.subscriptionReference}` : ''}
                              </div>
                              {subscription.actionPlan ? (
                                <div className="mt-2 rounded-md border border-border bg-background px-2 py-1.5 text-[11px] text-muted-foreground">
                                  <div className="font-semibold text-foreground">
                                    Recommended: {subscription.actionPlan.recommendedAction === 'none' ? 'No action' : subscription.actionPlan.recommendedAction}
                                    {subscription.actionPlan.attention ? ' · attention needed' : ''}
                                  </div>
                                  <div className="mt-0.5">{subscription.actionPlan.recommendation}</div>
                                  <div className="mt-1 break-words">
                                    Pause {pausePlan?.executionMode || 'handoff'} · Resume {resumePlan?.executionMode || 'handoff'} · Cancel {cancelPlan?.executionMode || 'handoff'}
                                  </div>
                                  {subscription.actionPlan.handoffRequired ? (
                                    <div className="mt-0.5 text-amber-700">One or more enabled actions will create a manual handoff.</div>
                                  ) : null}
                                </div>
                              ) : null}
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
                                  disabled={actionDisabled(pausePlan)}
                                  title={actionTitle(pausePlan)}
                                  iconStart={<Pause className="size-3.5" />}
                                >
                                  Pause
                                </Button>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => void runSelectedProductSubscriptionAction(subscription.id, 'resume', subscription.subscriptionReference)}
                                  disabled={actionDisabled(resumePlan)}
                                  title={actionTitle(resumePlan)}
                                  iconStart={<Play className="size-3.5" />}
                                >
                                  Resume
                                </Button>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => void runSelectedProductSubscriptionAction(subscription.id, 'cancel', subscription.subscriptionReference)}
                                  disabled={actionDisabled(cancelPlan)}
                                  title={actionTitle(cancelPlan)}
                                  iconStart={<Archive className="size-3.5" />}
                                >
                                  Cancel
                                </Button>
                              </div>
                            </div>
                          </div>
                        );
                      }) : (
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
                <div
                  className="rounded-lg border border-border bg-muted/40 p-4"
                  data-testid="products-launch-readiness"
                  data-launch-schema={selectedProductLaunchReadiness.schemaVersion}
                >
                  <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="text-sm font-semibold text-foreground">Product launch readiness</h3>
                        <span className={cn('rounded-full px-2.5 py-1 text-[11px] font-semibold', productLaunchReadinessBadgeClass(selectedProductLaunchReadiness.summary.status))}>
                          {formatProductLaunchReadinessStatus(selectedProductLaunchReadiness.summary.status)}
                        </span>
                      </div>
                      <div className="mt-1 text-xs text-muted-foreground">
                        Selected-product sellability checklist for custom storefront, hosted page, and provider handoff.
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded-full bg-background px-2.5 py-1 font-mono text-[11px] font-semibold text-muted-foreground">
                        backy.product-storefront-handoff.v1
                      </span>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => void copyText(selectedProductStorefrontHandoffText, 'Product storefront handoff')}
                        disabled={isProductsAccessBusy || !canExportProducts}
                        title={!canExportProducts ? exportPermissionTitle : undefined}
                        iconStart={<Copy className="size-4" />}
                        data-testid="products-storefront-handoff-copy-button"
                      >
                        Copy storefront JSON
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => void copyText(selectedProductLaunchReadinessText, 'Product launch readiness')}
                        disabled={isProductsAccessBusy || !canExportProducts}
                        title={!canExportProducts ? exportPermissionTitle : undefined}
                        iconStart={<Copy className="size-4" />}
                        data-testid="products-launch-readiness-copy-button"
                      >
                        Copy launch JSON
                      </Button>
                    </div>
                  </div>
                  <div className="grid gap-3 md:grid-cols-4">
                    <div className="rounded-md border border-border bg-background px-3 py-2 text-xs">
                      <div className="text-muted-foreground">Score</div>
                      <div className="mt-1 text-sm font-semibold text-foreground">{selectedProductLaunchReadiness.summary.score}%</div>
                    </div>
                    <div className="rounded-md border border-border bg-background px-3 py-2 text-xs">
                      <div className="text-muted-foreground">Ready checks</div>
                      <div className="mt-1 text-sm font-semibold text-foreground">
                        {selectedProductLaunchReadiness.summary.readyCount}/{selectedProductLaunchReadiness.summary.totalChecks}
                      </div>
                    </div>
                    <div className="rounded-md border border-border bg-background px-3 py-2 text-xs">
                      <div className="text-muted-foreground">Blockers</div>
                      <div className="mt-1 text-sm font-semibold text-foreground">{selectedProductLaunchReadiness.summary.blockerCount}</div>
                    </div>
                    <div className="rounded-md border border-border bg-background px-3 py-2 text-xs">
                      <div className="text-muted-foreground">Product</div>
                      <div className="mt-1 truncate text-sm font-semibold text-foreground">{selectedProductLaunchReadiness.product.title || 'No product selected'}</div>
                    </div>
                  </div>
                  <div
                    className="mt-3 rounded-md border border-border bg-background px-3 py-2 text-xs"
                    data-testid="products-sellability-impact"
                    data-schema-version={selectedProductStorefrontHandoff.sellabilityImpact.schemaVersion}
                    data-product-status={selectedProductStorefrontHandoff.sellabilityImpact.product.status}
                    data-blocker-count={selectedProductStorefrontHandoff.sellabilityImpact.readiness.blockerCount}
                  >
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div>
                        <div className="font-semibold text-foreground">Sellability impact</div>
                        <div className="mt-0.5 text-muted-foreground">
                          {selectedProductStorefrontHandoff.sellabilityImpact.product.path || 'No saved product'} · {selectedProductStorefrontHandoff.sellabilityImpact.checkout.mode} · {selectedProductStorefrontHandoff.sellabilityImpact.readiness.blockerCount} blocker{selectedProductStorefrontHandoff.sellabilityImpact.readiness.blockerCount === 1 ? '' : 's'}.
                        </div>
                      </div>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => void copyText(selectedProductSellabilityImpactText, 'Product sellability impact')}
                        disabled={isProductsAccessBusy || !canExportProducts}
                        title={!canExportProducts ? exportPermissionTitle : undefined}
                        iconStart={<Copy className="size-4" />}
                        data-testid="products-sellability-impact-copy-button"
                      >
                        Copy impact
                      </Button>
                    </div>
                    <div className="mt-2 grid gap-2 md:grid-cols-3">
                      <div>
                        <span className="font-medium text-foreground">Publish</span>
                        <div className={selectedProductStorefrontHandoff.sellabilityImpact.actions.publish.allowed ? 'text-emerald-700' : 'text-amber-700'}>
                          {selectedProductStorefrontHandoff.sellabilityImpact.actions.publish.allowed ? 'Allowed' : selectedProductStorefrontHandoff.sellabilityImpact.actions.publish.disabledReason}
                        </div>
                      </div>
                      <div>
                        <span className="font-medium text-foreground">Custom frontend design</span>
                        <div>{formatProductLaunchReadinessStatus(selectedProductStorefrontHandoff.sellabilityImpact.designReadiness.status)} · {selectedProductStorefrontHandoff.sellabilityImpact.designReadiness.counts.elements} elements</div>
                      </div>
                      <div>
                        <span className="font-medium text-foreground">Provider sync</span>
                        <div>{selectedProductStorefrontHandoff.sellabilityImpact.providerSync.status} · {selectedProductStorefrontHandoff.sellabilityImpact.providerSync.executionMode}</div>
                      </div>
                    </div>
                    {selectedProductStorefrontHandoff.sellabilityImpact.readiness.blockingChecks.length > 0 ? (
                      <div className="mt-2 flex flex-wrap gap-1" data-testid="products-sellability-impact-blockers">
                        {selectedProductStorefrontHandoff.sellabilityImpact.readiness.blockingChecks.slice(0, 4).map((check) => (
                          <span key={check.key} className="rounded bg-red-50 px-1.5 py-0.5 text-red-700">
                            {check.label}
                          </span>
                        ))}
                        {selectedProductStorefrontHandoff.sellabilityImpact.readiness.blockingChecks.length > 4 ? (
                          <span className="rounded bg-muted px-1.5 py-0.5 text-muted-foreground">
                            +{selectedProductStorefrontHandoff.sellabilityImpact.readiness.blockingChecks.length - 4} more
                          </span>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                  <div className="mt-3 grid gap-2 lg:grid-cols-2">
                    {selectedProductLaunchReadiness.checks.map((check) => (
                      <div
                        key={check.key}
                        className="rounded-md border border-border bg-background px-3 py-2 text-xs"
                        data-testid={`products-launch-readiness-check-${check.key}`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="font-semibold text-foreground">{check.label}</div>
                          <div className="flex items-center gap-1.5">
                            {check.status === 'ready' ? (
                              <CheckCircle2 className="size-3.5 text-emerald-600" aria-hidden="true" />
                            ) : (
                              <AlertTriangle className={cn('size-3.5', check.status === 'blocked' ? 'text-red-600' : 'text-amber-600')} aria-hidden="true" />
                            )}
                            <span className={cn('rounded-full px-2 py-0.5 text-[10px] font-semibold', productLaunchReadinessBadgeClass(check.status))}>
                              {formatProductLaunchReadinessStatus(check.status)}
                            </span>
                          </div>
                        </div>
                        <div className="mt-1 text-muted-foreground">{check.detail}</div>
                        {check.status !== 'ready' ? (
                          <div className="mt-1 text-[11px] text-foreground">Action: {check.action}</div>
                        ) : null}
                        {check.evidence.length > 0 ? (
                          <div className="mt-1 break-words text-[11px] text-muted-foreground">
                            Evidence: {check.evidence.join(' · ')}
                          </div>
                        ) : null}
                      </div>
                    ))}
                  </div>
                  <div className="mt-3 rounded-md border border-border bg-background px-3 py-2 text-xs" data-testid="products-launch-readiness-action-plan">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <div className="font-semibold text-foreground">Launch action plan</div>
                        <div className="mt-0.5 text-muted-foreground">
                          {selectedProductLaunchReadiness.actionPlan.nextSteps.length > 0
                            ? `${selectedProductLaunchReadiness.actionPlan.nextSteps.length} action${selectedProductLaunchReadiness.actionPlan.nextSteps.length === 1 ? '' : 's'} before launch handoff.`
                            : 'No launch blockers or attention items for this selected product.'}
                        </div>
                      </div>
                      <div className="font-mono text-[11px] text-muted-foreground">{selectedProductLaunchReadiness.schemaVersion}</div>
                    </div>
                    {selectedProductLaunchReadiness.actionPlan.nextSteps.length > 0 ? (
                      <div className="mt-2 grid gap-2 md:grid-cols-2">
                        {selectedProductLaunchReadiness.actionPlan.nextSteps.map((step) => (
                          <div key={step.key} className="rounded-md border border-border bg-card px-3 py-2">
                            <div className="flex items-center justify-between gap-2">
                              <span className="font-medium text-foreground">{step.label}</span>
                              <span className={cn('rounded-full px-2 py-0.5 text-[10px] font-semibold', step.priority === 'blocker' ? 'bg-red-50 text-red-700' : 'bg-amber-50 text-amber-700')}>
                                {step.priority}
                              </span>
                            </div>
                            <div className="mt-1 text-muted-foreground">{step.action}</div>
                          </div>
                        ))}
                      </div>
                    ) : null}
                  </div>
                </div>
                <div id="products-editor-provider-sync" className="scroll-mt-28" data-testid="products-editor-provider-sync-section" />
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
                <div id="products-editor-media" className="scroll-mt-28" data-testid="products-editor-media-section" />
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
                          addGalleryImageDraft();
                        }
                      }}
                      aria-invalid={Boolean(galleryImageInlineError)}
                      aria-describedby={galleryImageInlineError ? 'products-gallery-image-url-error' : undefined}
                      data-testid="products-gallery-image-url-input"
                      className="min-w-0 flex-1 rounded-lg border bg-background px-3 py-2.5 text-sm"
                      placeholder="https://..."
                    />
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        onClick={addGalleryImageDraft}
                        disabled={galleryImageUrls.length >= PRODUCT_GALLERY_IMAGE_LIMIT || isProductsAccessBusy || !canEditProducts}
                        data-testid="products-gallery-image-url-add"
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
                  {galleryImageInlineError ? (
                    <p
                      id="products-gallery-image-url-error"
                      className="text-xs text-destructive"
                      data-testid="products-gallery-image-url-error"
                    >
                      {galleryImageInlineError}
                    </p>
                  ) : null}
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
                <div id="products-editor-publishing" className="scroll-mt-28" data-testid="products-editor-publishing-section" />
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
                        aria-invalid={Boolean(scheduledProductInlineError)}
                        aria-describedby={scheduledProductInlineError ? 'products-scheduled-at-error' : undefined}
                        data-testid="products-scheduled-at-input"
                        required
                        className="w-full rounded-lg border bg-background px-3 py-2.5 text-sm"
                      />
                      {scheduledProductInlineError ? (
                        <p
                          id="products-scheduled-at-error"
                          className="mt-1 text-xs text-destructive"
                          data-testid="products-scheduled-at-error"
                        >
                          {scheduledProductInlineError}
                        </p>
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
                  <Button type="submit" variant="primary" disabled={isProductsAccessBusy || !canEditProducts} title={!canEditProducts ? editPermissionTitle : undefined} iconStart={<Package className="size-4" />}>
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
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby={productDeleteConfirmTitleId}
          aria-describedby={`${productDeleteConfirmDescriptionId} ${productDeleteConfirmImpactId} ${productDeleteConfirmActionStatusId}`}
          data-testid="products-delete-confirm-dialog"
          data-action-state={productDeleteConfirmActionState}
          data-action-status={productDeleteConfirmActionStatus}
          data-target-product-id={pendingDeleteProduct.id}
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 px-4 backdrop-blur-sm"
        >
          <div className="w-full max-w-md rounded-lg border border-border bg-card p-5 shadow-xl">
            <span id={productDeleteConfirmActionStatusId} className="sr-only" data-testid="products-delete-confirm-action-status" aria-live="polite">
              {productDeleteConfirmActionStatus}
            </span>
            <div className="flex items-start gap-3">
              <span className="rounded-lg bg-red-50 p-2 text-red-600">
                <Trash2 className="h-5 w-5" />
              </span>
              <div>
                <h2 id={productDeleteConfirmTitleId} className="text-lg font-semibold text-foreground">Delete {String(pendingDeleteProduct.values.title || pendingDeleteProduct.slug)}?</h2>
                <p id={productDeleteConfirmDescriptionId} className="mt-1 text-sm text-muted-foreground">
                  This removes the product record from Backy and from storefront API responses. Archive it instead if you only want it hidden.
                </p>
              </div>
            </div>
            <div id={productDeleteConfirmImpactId} className="mt-4 rounded-lg bg-muted px-3 py-2 text-xs text-muted-foreground">
              SKU: <span className="font-medium text-foreground">{String(pendingDeleteProduct.values.sku || pendingDeleteProduct.slug)}</span>
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setPendingDeleteProduct(null)}
                disabled={isProductsAccessBusy}
                aria-describedby={productDeleteConfirmActionStatusId}
                data-testid="products-delete-confirm-cancel"
                data-action-state={isProductsAccessBusy ? 'busy' : 'ready'}
                data-action-status={isProductsAccessBusy ? 'Product delete is running.' : 'Cancel product delete and keep the product.'}
                data-disabled-reason={isProductsAccessBusy ? 'Product catalog is busy.' : undefined}
                className="rounded-lg border border-border px-4 py-2 text-sm font-medium transition-colors hover:bg-accent disabled:cursor-not-allowed disabled:opacity-60"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void removeProduct(pendingDeleteProduct)}
                disabled={isProductsAccessBusy || !canDeleteProducts}
                title={!canDeleteProducts ? deletePermissionTitle : undefined}
                aria-describedby={productDeleteConfirmActionStatusId}
                data-testid="products-delete-confirm-button"
                data-action-state={productDeleteConfirmActionState}
                data-action-status={productDeleteConfirmActionStatus}
                data-disabled-reason={productDeleteConfirmDisabledReason || undefined}
                data-target-product-id={pendingDeleteProduct.id}
                className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isSaving ? 'Deleting...' : 'Delete product'}
              </button>
            </div>
          </div>
        </div>
      )}

      {pendingBulkDeleteProducts && selectedLoadedProducts.length > 0 && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby={productBulkDeleteConfirmTitleId}
          aria-describedby={`${productBulkDeleteConfirmDescriptionId} ${productBulkDeleteConfirmImpactId} ${productBulkDeleteConfirmActionStatusId}`}
          data-testid="products-bulk-delete-modal"
          data-confirm-dialog-id="products-bulk-delete-confirm-dialog"
          data-action-state={productBulkDeleteConfirmActionState}
          data-action-status={productBulkDeleteConfirmActionStatus}
          data-selected-product-count={selectedLoadedProducts.length}
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 px-4 backdrop-blur-sm"
        >
          <div className="w-full max-w-md rounded-lg border border-border bg-card p-5 shadow-xl">
            <span id={productBulkDeleteConfirmActionStatusId} className="sr-only" data-testid="products-bulk-delete-confirm-action-status" aria-live="polite">
              {productBulkDeleteConfirmActionStatus}
            </span>
            <div className="flex items-start gap-3">
              <span className="rounded-lg bg-red-50 p-2 text-red-600">
                <Trash2 className="h-5 w-5" />
              </span>
              <div>
                <h2 id={productBulkDeleteConfirmTitleId} className="text-lg font-semibold text-foreground">
                  Delete {selectedLoadedProducts.length} selected product{selectedLoadedProducts.length === 1 ? '' : 's'}?
                </h2>
                <p id={productBulkDeleteConfirmDescriptionId} className="mt-1 text-sm text-muted-foreground">
                  This removes selected product records from Backy and storefront API responses. Archive them instead if you only want them hidden.
                </p>
              </div>
            </div>
            <div id={productBulkDeleteConfirmImpactId} className="mt-4 rounded-lg bg-muted px-3 py-2 text-xs text-muted-foreground">
              Includes {selectedVisibleProducts.length} visible selected product{selectedVisibleProducts.length === 1 ? '' : 's'}
              {hiddenSelectedProductCount > 0 ? ` and ${hiddenSelectedProductCount} selected outside this filtered view` : ''}.
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setPendingBulkDeleteProducts(false)}
                disabled={isProductsAccessBusy}
                aria-describedby={productBulkDeleteConfirmActionStatusId}
                data-testid="products-bulk-delete-confirm-cancel"
                data-action-state={isProductsAccessBusy ? 'busy' : 'ready'}
                data-action-status={isProductsAccessBusy ? 'Bulk product delete is running.' : 'Cancel bulk product delete and keep selected products.'}
                data-disabled-reason={isProductsAccessBusy ? 'Product catalog is busy.' : undefined}
                className="rounded-lg border border-border px-4 py-2 text-sm font-medium transition-colors hover:bg-accent disabled:cursor-not-allowed disabled:opacity-60"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void bulkDeleteProducts()}
                disabled={isProductsAccessBusy || !canDeleteProducts}
                title={!canDeleteProducts ? deletePermissionTitle : undefined}
                aria-describedby={productBulkDeleteConfirmActionStatusId}
                data-testid="products-bulk-delete-confirm-button"
                data-action-state={productBulkDeleteConfirmActionState}
                data-action-status={productBulkDeleteConfirmActionStatus}
                data-disabled-reason={productsBulkDeleteDisabledReason || undefined}
                data-selected-product-count={selectedLoadedProducts.length}
                className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isBulkUpdatingProducts ? 'Deleting...' : 'Delete products'}
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

          if (mediaPickerTarget === 'download') {
            setFormState((current) => ({ ...current, ...productDownloadMediaState(asset, activeSiteId) }));
            setNotice(`Attached ${asset.name} (${asset.id}) to the digital delivery field.`);
            return;
          }

          const deliveryUrl = asset.url || getPublicMediaFileUrl(asset.id, activeSiteId);
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
  selectedForBulk,
  disabled,
  bulkSelectionDisabled,
  onEdit,
  onToggleBulkSelection,
  onPublish,
  onArchive,
  onDelete,
  canDelete,
  deleteDisabledReason,
}: {
  product: CollectionRecord;
  selected: boolean;
  selectedForBulk: boolean;
  disabled: boolean;
  bulkSelectionDisabled: boolean;
  canDelete: boolean;
  deleteDisabledReason?: string;
  onEdit: () => void;
  onToggleBulkSelection: () => void;
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
  const productActionStatusId = `products-actions-status-${product.id}`;
  const productBusyReason = disabled
    ? 'Product actions are temporarily unavailable while Backy updates catalog data'
    : null;
  const editDisabledReason = productBusyReason;
  const publishDisabledReason = productBusyReason || (product.status === 'published'
    ? 'This product is already published'
    : null);
  const archiveDisabledReason = productBusyReason || (product.status === 'archived'
    ? 'This product is already archived'
    : null);
  const deleteProductDisabledReason = productBusyReason || (!canDelete
    ? deleteDisabledReason || 'Your account cannot delete products'
    : null);
  const productActionStatus = [
    `Edit ${editDisabledReason ? `unavailable: ${editDisabledReason}` : 'available'}.`,
    `Publish ${publishDisabledReason ? `unavailable: ${publishDisabledReason}` : 'available'}.`,
    `Archive ${archiveDisabledReason ? `unavailable: ${archiveDisabledReason}` : 'available'}.`,
    `Delete ${deleteProductDisabledReason ? `unavailable: ${deleteProductDisabledReason}` : 'available'}.`,
  ].join(' ');

  return (
    <article className={cn(
      'rounded-lg border bg-background p-4 transition-colors',
      selected ? 'border-primary ring-2 ring-primary/10' : selectedForBulk ? 'border-primary/50 ring-2 ring-primary/5' : 'border-border',
    )}
      data-testid="products-product-card"
      data-product-id={product.id}
    >
      <div className="flex items-start gap-3">
        <label className="mt-0.5 inline-flex items-center">
          <input
            type="checkbox"
            aria-label={`Select ${title}`}
            checked={selectedForBulk}
            disabled={bulkSelectionDisabled}
            onChange={onToggleBulkSelection}
            className="size-4 rounded border-border text-primary disabled:cursor-not-allowed disabled:opacity-60"
          />
        </label>
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
      <div
        className="mt-4 flex flex-wrap items-center gap-2"
        role="group"
        aria-label={`Actions for ${title}`}
        aria-describedby={productActionStatusId}
        data-testid="products-action-group"
        data-product-id={product.id}
        data-action-status={productActionStatus}
      >
        <span id={productActionStatusId} className="sr-only" data-testid="products-action-status">
          {productActionStatus}
        </span>
        <Button
          size="sm"
          onClick={onEdit}
          disabled={Boolean(editDisabledReason)}
          title={editDisabledReason || undefined}
          aria-label={`Edit ${title}`}
          aria-describedby={productActionStatusId}
          data-testid="products-edit-product"
          data-action-state={editDisabledReason ? 'blocked' : 'ready'}
          data-disabled-reason={editDisabledReason || undefined}
          iconStart={<Edit3 className="size-4" />}
        >
          Edit
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={onPublish}
          disabled={Boolean(publishDisabledReason)}
          title={publishDisabledReason || undefined}
          aria-label={`Publish ${title}`}
          aria-describedby={productActionStatusId}
          data-testid="products-publish-product"
          data-action-state={publishDisabledReason ? 'blocked' : 'ready'}
          data-disabled-reason={publishDisabledReason || undefined}
          iconStart={<CheckCircle2 className="size-4" />}
        >
          Publish
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={onArchive}
          disabled={Boolean(archiveDisabledReason)}
          title={archiveDisabledReason || undefined}
          aria-label={`Archive ${title}`}
          aria-describedby={productActionStatusId}
          data-testid="products-archive-product"
          data-action-state={archiveDisabledReason ? 'blocked' : 'ready'}
          data-disabled-reason={archiveDisabledReason || undefined}
          iconStart={<Archive className="size-4" />}
        >
          Archive
        </Button>
        <Button
          size="sm"
          variant="danger"
          onClick={onDelete}
          disabled={Boolean(deleteProductDisabledReason)}
          title={deleteProductDisabledReason || undefined}
          aria-label={`Delete ${title}`}
          aria-describedby={productActionStatusId}
          data-testid="products-delete-product"
          data-action-state={deleteProductDisabledReason ? 'blocked' : 'ready'}
          data-disabled-reason={deleteProductDisabledReason || undefined}
          iconStart={<Trash2 className="size-4" />}
        >
          Delete
        </Button>
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
  downloadMediaId: String(readProductValue(product.values, 'downloadMediaId', '') || ''),
  downloadMediaName: String(readProductValue(product.values, 'downloadMediaName', '') || ''),
  downloadMediaType: String(readProductValue(product.values, 'downloadMediaType', '') || ''),
  downloadMediaFolderId: String(readProductValue(product.values, 'downloadMediaFolderId', '') || ''),
  downloadMediaFolderPath: String(readProductValue(product.values, 'downloadMediaFolderPath', '') || ''),
  downloadMediaVisibility: String(readProductValue(product.values, 'downloadMediaVisibility', '') || ''),
  downloadMediaScope: String(readProductValue(product.values, 'downloadMediaScope', '') || ''),
  downloadMediaScopeTargetId: String(readProductValue(product.values, 'downloadMediaScopeTargetId', '') || ''),
  downloadMediaOrganization: isPlainRecord(readProductValue(product.values, 'downloadMediaOrganization'))
    ? readProductValue(product.values, 'downloadMediaOrganization') as Record<string, unknown>
    : null,
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

const cloneJsonRecord = (value: unknown): Record<string, unknown> | undefined => (
  isPlainRecord(value) ? JSON.parse(JSON.stringify(value)) as Record<string, unknown> : undefined
);

const cloneJsonArray = <T = unknown>(value: unknown): T[] | undefined => (
  Array.isArray(value) ? JSON.parse(JSON.stringify(value)) as T[] : undefined
);

const cloneJsonArrayOrRecord = (value: unknown): unknown[] | Record<string, unknown> | undefined => (
  Array.isArray(value) ? cloneJsonArray(value) : cloneJsonRecord(value)
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

const optionalRecordFromRecord = (record: Record<string, unknown> | undefined, key: string): Record<string, unknown> | undefined => (
  cloneJsonRecord(record?.[key])
);

const optionalArrayFromRecord = <T = unknown>(record: Record<string, unknown> | undefined, key: string): T[] | undefined => (
  cloneJsonArray<T>(record?.[key])
);

const optionalArrayOrRecordFromRecord = (
  record: Record<string, unknown> | undefined,
  key: string,
): unknown[] | Record<string, unknown> | undefined => (
  cloneJsonArrayOrRecord(record?.[key])
);

const designStateItemCount = (value: unknown): number => {
  if (Array.isArray(value)) return value.length;
  if (isPlainRecord(value)) return Object.keys(value).length;
  return 0;
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
      [productFieldKey('downloadMediaId')]: optionalStringFromRecord(content, 'downloadMediaId') || '',
      [productFieldKey('downloadMediaName')]: optionalStringFromRecord(content, 'downloadMediaName') || '',
      [productFieldKey('downloadMediaType')]: optionalStringFromRecord(content, 'downloadMediaType') || '',
      [productFieldKey('downloadMediaFolderId')]: optionalStringFromRecord(content, 'downloadMediaFolderId') || '',
      [productFieldKey('downloadMediaFolderPath')]: optionalStringFromRecord(content, 'downloadMediaFolderPath') || '',
      [productFieldKey('downloadMediaVisibility')]: optionalStringFromRecord(content, 'downloadMediaVisibility') || '',
      [productFieldKey('downloadMediaScope')]: optionalStringFromRecord(content, 'downloadMediaScope') || '',
      [productFieldKey('downloadMediaScopeTargetId')]: optionalStringFromRecord(content, 'downloadMediaScopeTargetId') || '',
      [productFieldKey('downloadMediaOrganization')]: optionalRecordFromRecord(content, 'downloadMediaOrganization') || null,
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
): Record<string, unknown> => {
  const content = frontendTemplateContent(template);
  const metadata = optionalRecordFromRecord(content, 'metadata') || {};
  const contentDocument = optionalRecordFromRecord(content, 'contentDocument') || optionalRecordFromRecord(metadata, 'contentDocument');
  const elements = optionalArrayFromRecord(content, 'elements') || optionalArrayFromRecord(metadata, 'elements');
  const canvasSize = optionalRecordFromRecord(content, 'canvasSize') || optionalRecordFromRecord(metadata, 'canvasSize') || cloneJsonRecord(template.canvasSize);
  const themeTokenRefs = optionalRecordFromRecord(content, 'themeTokenRefs') || optionalRecordFromRecord(metadata, 'themeTokenRefs');
  const assets = optionalArrayOrRecordFromRecord(content, 'assets') || optionalArrayOrRecordFromRecord(metadata, 'assets');
  const animations = optionalArrayOrRecordFromRecord(content, 'animations') || optionalArrayOrRecordFromRecord(metadata, 'animations');
  const interactions = optionalArrayOrRecordFromRecord(content, 'interactions') || optionalArrayOrRecordFromRecord(metadata, 'interactions');
  const dataBindings = optionalRecordFromRecord(content, 'dataBindings') || optionalRecordFromRecord(metadata, 'dataBindings');
  const editableMap = optionalRecordFromRecord(content, 'editableMap') || optionalRecordFromRecord(metadata, 'editableMap') || cloneJsonRecord(frontendDesign?.editableMap);
  const seo = optionalRecordFromRecord(content, 'seo') || optionalRecordFromRecord(metadata, 'seo');
  const customCss = optionalStringFromRecord(content, 'customCSS')
    || optionalStringFromRecord(content, 'customCss')
    || optionalStringFromRecord(metadata, 'customCSS')
    || optionalStringFromRecord(metadata, 'customCss')
    || frontendDesign?.tokens?.customCss;
  const customJs = optionalStringFromRecord(content, 'customJS')
    || optionalStringFromRecord(content, 'customJs')
    || optionalStringFromRecord(metadata, 'customJS')
    || optionalStringFromRecord(metadata, 'customJs');

  return {
    frontendDesignTemplateId: template.id,
    frontendDesignTemplateName: template.name,
    frontendDesignSource: frontendDesign?.source,
    frontendDesignBindingHints: template.bindingHints || [],
    ...(template.routePattern ? { frontendDesignRoutePattern: template.routePattern } : {}),
    ...(frontendDesign?.tokens ? { frontendDesignTokens: frontendDesign.tokens } : {}),
    ...(frontendDesign?.chrome ? { frontendDesignChrome: frontendDesign.chrome } : {}),
    ...(customCss ? { frontendDesignCustomCss: customCss } : {}),
    ...(customJs ? { frontendDesignCustomJs: customJs } : {}),
    ...(contentDocument ? { frontendDesignContentDocument: contentDocument } : {}),
    ...(elements ? { frontendDesignElements: elements } : {}),
    ...(canvasSize ? { frontendDesignCanvasSize: canvasSize } : {}),
    ...(themeTokenRefs ? { frontendDesignThemeTokenRefs: themeTokenRefs } : {}),
    ...(assets ? { frontendDesignAssets: assets } : {}),
    ...(animations ? { frontendDesignAnimations: animations } : {}),
    ...(interactions ? { frontendDesignInteractions: interactions } : {}),
    ...(dataBindings ? { frontendDesignDataBindings: dataBindings } : {}),
    ...(editableMap ? { frontendDesignEditableMap: editableMap } : {}),
    ...(seo ? { frontendDesignSeo: seo } : {}),
    ...(Object.keys(metadata).length > 0 ? { frontendDesignMetadata: metadata } : {}),
  };
};

const FRONTEND_PRODUCT_VALUE_KEYS = [
  'frontendDesignTemplateId',
  'frontendDesignTemplateName',
  'frontendDesignSource',
  'frontendDesignBindingHints',
  'frontendDesignRoutePattern',
  'frontendDesignTokens',
  'frontendDesignChrome',
  'frontendDesignCustomCss',
  'frontendDesignCustomJs',
  'frontendDesignContentDocument',
  'frontendDesignElements',
  'frontendDesignCanvasSize',
  'frontendDesignThemeTokenRefs',
  'frontendDesignAssets',
  'frontendDesignAnimations',
  'frontendDesignInteractions',
  'frontendDesignDataBindings',
  'frontendDesignEditableMap',
  'frontendDesignSeo',
  'frontendDesignMetadata',
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

const getProductFrontendTemplateId = (product: CollectionRecord): string | undefined => {
  const designEnvelope = optionalRecordFromRecord(product.values, 'design');
  return optionalStringFromRecord(designEnvelope, 'templateId')
    || optionalStringFromRecord(designEnvelope, 'frontendDesignTemplateId')
    || optionalStringFromRecord(product.values, 'frontendDesignTemplateId');
};

const buildProductStorefrontDesign = (values: Record<string, unknown>): Record<string, unknown> | null => {
  const designEnvelope = optionalRecordFromRecord(values, 'design');
  const designValue = (key: string, frontendKey: string): Record<string, unknown> => ({
    [frontendKey]: designEnvelope?.[key] ?? designEnvelope?.[frontendKey] ?? values[frontendKey],
  });
  const templateId = optionalStringFromRecord(designValue('templateId', 'frontendDesignTemplateId'), 'frontendDesignTemplateId');
  const templateName = optionalStringFromRecord(designValue('templateName', 'frontendDesignTemplateName'), 'frontendDesignTemplateName');
  const source = optionalRecordFromRecord(designValue('source', 'frontendDesignSource'), 'frontendDesignSource');
  const bindingHints = optionalArrayFromRecord(designValue('bindingHints', 'frontendDesignBindingHints'), 'frontendDesignBindingHints');
  const routePattern = optionalStringFromRecord(designValue('routePattern', 'frontendDesignRoutePattern'), 'frontendDesignRoutePattern');
  const tokens = optionalRecordFromRecord(designValue('tokens', 'frontendDesignTokens'), 'frontendDesignTokens');
  const chrome = optionalRecordFromRecord(designValue('chrome', 'frontendDesignChrome'), 'frontendDesignChrome');
  const customCss = optionalStringFromRecord(designValue('customCss', 'frontendDesignCustomCss'), 'frontendDesignCustomCss');
  const customJs = optionalStringFromRecord(designValue('customJs', 'frontendDesignCustomJs'), 'frontendDesignCustomJs');
  const contentDocument = optionalRecordFromRecord(designValue('contentDocument', 'frontendDesignContentDocument'), 'frontendDesignContentDocument');
  const elements = optionalArrayFromRecord(designValue('elements', 'frontendDesignElements'), 'frontendDesignElements');
  const canvasSize = optionalRecordFromRecord(designValue('canvasSize', 'frontendDesignCanvasSize'), 'frontendDesignCanvasSize');
  const themeTokenRefs = optionalRecordFromRecord(designValue('themeTokenRefs', 'frontendDesignThemeTokenRefs'), 'frontendDesignThemeTokenRefs');
  const assets = optionalArrayOrRecordFromRecord(designValue('assets', 'frontendDesignAssets'), 'frontendDesignAssets');
  const animations = optionalArrayOrRecordFromRecord(designValue('animations', 'frontendDesignAnimations'), 'frontendDesignAnimations');
  const interactions = optionalArrayOrRecordFromRecord(designValue('interactions', 'frontendDesignInteractions'), 'frontendDesignInteractions');
  const dataBindings = optionalRecordFromRecord(designValue('dataBindings', 'frontendDesignDataBindings'), 'frontendDesignDataBindings');
  const editableMap = optionalRecordFromRecord(designValue('editableMap', 'frontendDesignEditableMap'), 'frontendDesignEditableMap');
  const seo = optionalRecordFromRecord(designValue('seo', 'frontendDesignSeo'), 'frontendDesignSeo');
  const metadata = optionalRecordFromRecord(designValue('metadata', 'frontendDesignMetadata'), 'frontendDesignMetadata');

  const design = {
    ...(designEnvelope ? { ...designEnvelope } : {}),
    ...(templateId ? { templateId, frontendDesignTemplateId: templateId } : {}),
    ...(templateName ? { templateName, frontendDesignTemplateName: templateName } : {}),
    ...(source ? { source, frontendDesignSource: source } : {}),
    ...(bindingHints ? { bindingHints, frontendDesignBindingHints: bindingHints } : {}),
    ...(routePattern ? { routePattern, frontendDesignRoutePattern: routePattern } : {}),
    ...(tokens ? { tokens, frontendDesignTokens: tokens } : {}),
    ...(chrome ? { chrome, frontendDesignChrome: chrome } : {}),
    ...(customCss ? { customCss, frontendDesignCustomCss: customCss } : {}),
    ...(customJs ? { customJs, frontendDesignCustomJs: customJs } : {}),
    ...(contentDocument ? { contentDocument, frontendDesignContentDocument: contentDocument } : {}),
    ...(elements ? { elements, frontendDesignElements: elements } : {}),
    ...(canvasSize ? { canvasSize, frontendDesignCanvasSize: canvasSize } : {}),
    ...(themeTokenRefs ? { themeTokenRefs, frontendDesignThemeTokenRefs: themeTokenRefs } : {}),
    ...(assets ? { assets, frontendDesignAssets: assets } : {}),
    ...(animations ? { animations, frontendDesignAnimations: animations } : {}),
    ...(interactions ? { interactions, frontendDesignInteractions: interactions } : {}),
    ...(dataBindings ? { dataBindings, frontendDesignDataBindings: dataBindings } : {}),
    ...(editableMap ? { editableMap, frontendDesignEditableMap: editableMap } : {}),
    ...(seo ? { seo, frontendDesignSeo: seo } : {}),
    ...(metadata ? { metadata, frontendDesignMetadata: metadata } : {}),
  };

  return Object.keys(design).length > 0 ? design : null;
};

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

const makeProductLaunchReadiness = ({
  generatedAt,
  product,
  checks,
  catalogApi,
  productApi,
  orderIntakeApi,
  orderIntakeReady,
  productApiReady,
}: {
  generatedAt: string;
  product: ProductLaunchReadiness['product'];
  checks: ProductLaunchReadinessCheck[];
  catalogApi: string;
  productApi: string;
  orderIntakeApi: string;
  orderIntakeReady: boolean;
  productApiReady: boolean;
}): ProductLaunchReadiness => {
  const readyCount = checks.filter((check) => check.status === 'ready').length;
  const blockerCount = checks.filter((check) => check.status === 'blocked').length;
  const attentionCount = checks.filter((check) => check.status === 'attention').length;
  const summaryStatus: ProductLaunchReadinessStatus = blockerCount > 0
    ? 'blocked'
    : attentionCount > 0
      ? 'attention'
      : 'ready';

  return {
    schemaVersion: 'backy.product-launch-readiness.v1',
    generatedAt,
    product,
    summary: {
      status: summaryStatus,
      score: checks.length > 0 ? Math.round((readyCount / checks.length) * 100) : 0,
      readyCount,
      totalChecks: checks.length,
      blockerCount,
      attentionCount,
    },
    storefront: {
      catalogApi,
      productApi,
      orderIntakeApi,
      orderIntakeReady,
      productApiReady,
    },
    checks,
    actionPlan: {
      nextSteps: checks
        .filter((check) => check.status !== 'ready')
        .map((check) => ({
          key: check.key,
          label: check.label,
          priority: check.status === 'blocked' ? 'blocker' : 'attention',
          action: check.action,
        })),
      handoffSurfaces: [
        'products-launch-readiness',
        'productHandoff.providerExecution.selectedProductLaunchReadiness',
        'backy.product-launch-readiness.v1',
      ],
    },
  };
};

const buildProductDesignReadiness = (
  design: Record<string, unknown> | null,
): ProductDesignReadiness => {
  const designTemplateId = optionalStringFromRecord(design || undefined, 'templateId')
    || optionalStringFromRecord(design || undefined, 'frontendDesignTemplateId');
  const designElements = optionalArrayFromRecord(design || undefined, 'elements')
    || optionalArrayFromRecord(design || undefined, 'frontendDesignElements')
    || [];
  const designAnimations = optionalArrayOrRecordFromRecord(design || undefined, 'animations')
    || optionalArrayOrRecordFromRecord(design || undefined, 'frontendDesignAnimations');
  const designAssets = optionalArrayOrRecordFromRecord(design || undefined, 'assets')
    || optionalArrayOrRecordFromRecord(design || undefined, 'frontendDesignAssets');
  const designEditableMap = optionalRecordFromRecord(design || undefined, 'editableMap')
    || optionalRecordFromRecord(design || undefined, 'frontendDesignEditableMap');
  const designDataBindings = optionalRecordFromRecord(design || undefined, 'dataBindings')
    || optionalRecordFromRecord(design || undefined, 'frontendDesignDataBindings');
  const designContentDocument = optionalRecordFromRecord(design || undefined, 'contentDocument')
    || optionalRecordFromRecord(design || undefined, 'frontendDesignContentDocument');
  const designBindingHints = optionalArrayFromRecord(design || undefined, 'bindingHints')
    || optionalArrayFromRecord(design || undefined, 'frontendDesignBindingHints')
    || [];
  const hasDesign = Boolean(design);
  const hasContentDocument = Boolean(designContentDocument);
  const hasEditableMap = Boolean(designEditableMap);
  const hasDataBindings = Boolean(designDataBindings);
  const hasContentTree = hasContentDocument || designElements.length > 0;
  const hasEditableBindings = hasEditableMap || hasDataBindings || designBindingHints.length > 0;
  const animationCount = designStateItemCount(designAnimations);
  const assetCount = designStateItemCount(designAssets);
  const missing = [
    designTemplateId ? '' : 'templateId',
    hasContentTree ? '' : 'contentDocumentOrElements',
    hasEditableBindings ? '' : 'editableMapOrDataBindings',
  ].filter(Boolean);
  const status: ProductLaunchReadinessStatus = designTemplateId && hasContentTree && hasEditableBindings
    ? 'ready'
    : 'attention';

  return {
    schemaVersion: 'backy.product-design-readiness.v1',
    status,
    templateId: designTemplateId || null,
    hasDesign,
    hasContentDocument,
    hasEditableMap,
    hasDataBindings,
    counts: {
      elements: designElements.length,
      animations: animationCount,
      assets: assetCount,
      bindingHints: designBindingHints.length,
    },
    missing,
    detail: status === 'ready'
      ? `Template ${designTemplateId} exposes ${designElements.length} element${designElements.length === 1 ? '' : 's'}, ${animationCount} animation${animationCount === 1 ? '' : 's'}, and editable product bindings.`
      : hasDesign
        ? 'Product has partial frontend design metadata but is missing a template, content tree, editable map, data binding, or binding hints.'
        : 'No product frontend design envelope is attached; custom frontends can render catalog data but cannot reopen an editable product design from this record.',
    nextAction: 'Attach a product frontend template or save contentDocument/elements plus editableMap/dataBindings so external builders can edit the product page design.',
    evidence: [
      `template=${designTemplateId || 'missing'}`,
      `elements=${designElements.length}`,
      `animations=${animationCount}`,
      `assets=${assetCount}`,
      `contentDocument=${hasContentDocument ? 'present' : 'missing'}`,
      `editableMap=${hasEditableMap ? 'present' : 'missing'}`,
      `dataBindings=${hasDataBindings ? 'present' : 'missing'}`,
      `bindingHints=${designBindingHints.length}`,
    ],
    secretHandling: 'Design readiness reports counts, booleans, and editable design-state presence only; provider secrets, private orders, raw customer payloads, and digital delivery URLs are excluded.',
  };
};

const buildProductLaunchReadiness = ({
  product,
  providerSync,
  productApiReady,
  orderIntakeReady,
  catalogApi,
  productApi,
  orderIntakeApi,
}: {
  product: CollectionRecord | null;
  providerSync: CommerceProductProviderSyncResult | null;
  productApiReady: boolean;
  orderIntakeReady: boolean;
  catalogApi: string;
  productApi: string;
  orderIntakeApi: string;
}): ProductLaunchReadiness => {
  const generatedAt = new Date().toISOString();

  if (!product) {
    return makeProductLaunchReadiness({
      generatedAt,
      product: {
        id: null,
        slug: null,
        title: '',
        sku: '',
        status: 'not-selected',
        productType: null,
      },
      catalogApi,
      productApi,
      orderIntakeApi,
      productApiReady,
      orderIntakeReady,
      checks: [
        {
          key: 'selected-product',
          label: 'Selected product',
          status: 'blocked',
          detail: 'No product is selected for launch review.',
          action: 'Select an existing product or save the current product before copying a launch handoff.',
          evidence: ['selectedProduct=null'],
        },
      ],
    });
  }

  const values = product.values || {};
  const title = String(readProductValue(values, 'title', product.slug) || product.slug).trim();
  const sku = String(readProductValue(values, 'sku', '') || '').trim();
  const price = toNumber(readProductValue(values, 'price'));
  const currency = normalizeCurrency(String(readProductValue(values, 'currency', 'USD') || 'USD'));
  const productType = asProductType(readProductValue(values, 'productType'));
  const stockState = getProductStockState(values);
  const storefrontDesign = buildProductStorefrontDesign(values);
  const designReadiness = buildProductDesignReadiness(storefrontDesign);
  const imageUrl = String(readProductValue(values, 'imageUrl', '') || '').trim();
  const galleryImages = formatGalleryImages(readProductValue(values, 'galleryImages'));
  const variants = formatProductVariants(readProductValue(values, 'variants'));
  const checkoutUrl = String(readProductValue(values, 'checkoutUrl', '') || '').trim();
  const downloadUrl = String(readProductValue(values, 'downloadUrl', '') || '').trim();
  const downloadMediaId = String(readProductValue(values, 'downloadMediaId', '') || '').trim();
  const downloadConfigured = Boolean(downloadUrl || downloadMediaId);
  const shippingRequired = readProductValue(values, 'shippingRequired') !== false;
  const shippingProfile = String(readProductValue(values, 'shippingProfile', '') || '').trim();
  const weight = maybeFiniteNumber(readProductValue(values, 'weight'));
  const description = String(readProductValue(values, 'description', '') || '').trim();
  const seoTitle = String(readProductValue(values, 'seoTitle', '') || '').trim();
  const category = String(readProductValue(values, 'category', '') || '').trim();
  const vendor = String(readProductValue(values, 'vendor', '') || '').trim();
  const tags = formatTags(readProductValue(values, 'tags'));
  const scheduledAtMs = product.scheduledAt ? Date.parse(product.scheduledAt) : NaN;
  const scheduledForFuture = Number.isFinite(scheduledAtMs) && scheduledAtMs > Date.now();
  const hasCoreIdentity = Boolean(title && product.slug && sku);
  const hasMedia = Boolean(imageUrl || galleryImages.length > 0);
  const checkoutReady = Boolean(orderIntakeReady || checkoutUrl);

  const publishStatus = product.status === 'published'
    ? 'ready'
    : product.status === 'scheduled' && scheduledForFuture
      ? 'attention'
      : 'blocked';

  const deliveryStatus: ProductLaunchReadinessStatus = productType === 'digital'
    ? (downloadConfigured ? 'ready' : 'blocked')
    : productType === 'physical'
      ? (!shippingRequired || (shippingProfile && weight && weight > 0)
          ? 'ready'
          : shippingProfile
            ? 'attention'
            : 'blocked')
      : shippingRequired
        ? 'attention'
        : 'ready';

  const providerStatus: ProductLaunchReadinessStatus = providerSync?.status === 'synced'
    ? 'ready'
    : providerSync?.status === 'failed'
      ? 'blocked'
      : 'attention';

  const checks: ProductLaunchReadinessCheck[] = [
    {
      key: 'storefront-api',
      label: 'Storefront API',
      status: productApiReady ? 'ready' : 'blocked',
      detail: productApiReady
        ? 'Products collection is public, schema-complete, and ready for catalog reads.'
        : 'Products collection is not ready for public catalog/detail API handoff.',
      action: 'Publish the products collection, enable public reads, and sync missing product fields.',
      evidence: [productApiReady ? 'productApiReady=true' : 'productApiReady=false', catalogApi],
    },
    {
      key: 'identity',
      label: 'Product identity',
      status: hasCoreIdentity ? 'ready' : 'blocked',
      detail: hasCoreIdentity
        ? `${title} has slug and SKU metadata.`
        : 'Title, slug, and SKU are required before a storefront can address this product safely.',
      action: 'Fill title, slug, and SKU, then save the product.',
      evidence: [`slug=${product.slug || 'missing'}`, `sku=${sku || 'missing'}`],
    },
    {
      key: 'publish-state',
      label: 'Publish state',
      status: publishStatus,
      detail: product.status === 'published'
        ? 'Product is published for public catalog reads.'
        : product.status === 'scheduled' && scheduledForFuture
          ? `Product is scheduled for ${formatDate(product.scheduledAt || generatedAt)}.`
          : `Product status is ${product.status}; it is not publicly launchable yet.`,
      action: 'Publish the product or choose a valid future scheduled launch date.',
      evidence: [`status=${product.status}`, product.scheduledAt ? `scheduledAt=${product.scheduledAt}` : 'scheduledAt=none'],
    },
    {
      key: 'pricing',
      label: 'Pricing',
      status: price > 0 && Boolean(currency) ? 'ready' : 'blocked',
      detail: price > 0
        ? `Storefront price is ${formatMoney(price, currency)}.`
        : 'A positive product price is required for sellable storefront cards and checkout quotes.',
      action: 'Set a positive price and three-letter currency.',
      evidence: [`price=${price}`, `currency=${currency}`],
    },
    {
      key: 'stock',
      label: 'Stock and variants',
      status: stockState.outOfStock ? 'blocked' : stockState.lowStock ? 'attention' : 'ready',
      detail: stockState.outOfStock
        ? 'Physical product is out of stock and inventory policy blocks purchase.'
        : stockState.lowStock
          ? `Physical stock is low at ${stockState.inventory} unit${stockState.inventory === 1 ? '' : 's'}.`
          : variants.length > 0
            ? `${variants.length} variant${variants.length === 1 ? '' : 's'} available for selectors.`
            : productType === 'physical'
              ? `${stockState.inventory} physical unit${stockState.inventory === 1 ? '' : 's'} available.`
              : `${productType} product does not require physical stock.`,
      action: 'Add inventory, change inventory policy to preorder/continue, or add variant stock before launch.',
      evidence: [`productType=${productType}`, `inventory=${stockState.inventory}`, `inventoryPolicy=${stockState.inventoryPolicy}`, `variants=${variants.length}`],
    },
    {
      key: 'media',
      label: 'Product media',
      status: hasMedia ? 'ready' : 'attention',
      detail: hasMedia
        ? `Primary media is present with ${galleryImages.length} gallery image${galleryImages.length === 1 ? '' : 's'}.`
        : 'No product media is attached; storefront cards and detail pages will be text-only.',
      action: 'Attach a central media-library image or gallery asset.',
      evidence: [`image=${imageUrl ? 'present' : 'missing'}`, `galleryImages=${galleryImages.length}`],
    },
    {
      key: 'frontend-design',
      label: 'Custom frontend design',
      status: designReadiness.status,
      detail: designReadiness.detail,
      action: designReadiness.nextAction,
      evidence: designReadiness.evidence,
    },
    {
      key: 'checkout',
      label: 'Checkout handoff',
      status: checkoutReady ? 'ready' : 'blocked',
      detail: orderIntakeReady
        ? 'Backy order intake is ready for custom storefront checkout.'
        : checkoutUrl
          ? 'Product has a direct checkout URL for external checkout.'
          : 'No Backy order intake or direct checkout URL is available.',
      action: 'Publish the private orders collection for Backy order intake or add a product checkout URL.',
      evidence: [orderIntakeReady ? 'orderIntakeReady=true' : 'orderIntakeReady=false', checkoutUrl ? 'checkoutUrl=present' : 'checkoutUrl=missing', orderIntakeApi],
    },
    {
      key: 'delivery',
      label: 'Delivery and fulfillment',
      status: deliveryStatus,
      detail: productType === 'digital'
        ? (downloadConfigured ? 'Digital delivery media or URL is attached.' : 'Digital product is missing a delivery/download media binding or URL.')
        : productType === 'physical'
          ? (!shippingRequired
              ? 'Physical product is marked as not requiring shipping.'
              : shippingProfile && weight && weight > 0
                ? `Shipping profile ${shippingProfile} is ready with weight ${weight}.`
                : shippingProfile
                  ? `Shipping profile ${shippingProfile} is set, but weight is missing for provider quotes.`
                  : 'Physical product requires shipping but has no shipping profile.')
          : shippingRequired
            ? 'Service product is still marked as shippable.'
            : 'Service product delivery does not require physical shipping.',
      action: 'Add digital delivery media or URL, shipping profile and weight, or turn off shipping for services.',
      evidence: [`productType=${productType}`, `shippingRequired=${shippingRequired}`, `shippingProfile=${shippingProfile || 'missing'}`, `downloadUrl=${downloadUrl ? 'present' : 'missing'}`, `downloadMediaId=${downloadMediaId ? 'present' : 'missing'}`],
    },
    {
      key: 'seo-merchandising',
      label: 'SEO and merchandising',
      status: description.length >= 20 && Boolean(seoTitle || title) && Boolean(category || tags.length > 0 || vendor) ? 'ready' : 'attention',
      detail: description.length >= 20 && Boolean(category || tags.length > 0 || vendor)
        ? 'Description, search title, and merchandising metadata are present.'
        : 'Description, SEO title, category, tags, or vendor metadata need more detail for storefront discovery.',
      action: 'Add a product description, SEO title, category/tags, and vendor metadata.',
      evidence: [`descriptionChars=${description.length}`, `seoTitle=${seoTitle || title || 'missing'}`, `category=${category || 'missing'}`, `tags=${tags.length}`, `vendor=${vendor || 'missing'}`],
    },
    {
      key: 'provider-sync',
      label: 'Provider catalog sync',
      status: providerStatus,
      detail: providerSync?.status === 'synced'
        ? `Catalog metadata synced through ${providerSync.provider} using ${providerSync.executionMode}.`
        : providerSync?.status === 'failed'
          ? `Last provider catalog sync failed: ${providerSync.error?.message || providerSync.reason || 'unknown error'}.`
          : 'No successful provider catalog sync is recorded for this product.',
      action: 'Run provider catalog sync or keep the launch on Backy order intake/direct checkout until provider sync succeeds.',
      evidence: [`provider=${providerSync?.provider || 'not-run'}`, `status=${providerSync?.status || 'not-run'}`, `executionMode=${providerSync?.executionMode || 'none'}`],
    },
  ];

  return makeProductLaunchReadiness({
    generatedAt,
    product: {
      id: product.id,
      slug: product.slug,
      title,
      sku,
      status: product.status,
      productType,
    },
    checks,
    catalogApi,
    productApi,
    orderIntakeApi,
    productApiReady,
    orderIntakeReady,
  });
};

const buildProductSellabilityImpact = ({
  activeSiteId,
  product,
  providerSync,
  launchReadiness,
  catalogApi,
  productApi,
  orderIntakeApi,
  orderIntakeReady,
  productApiReady,
}: {
  activeSiteId: string;
  product: CollectionRecord | null;
  providerSync: CommerceProductProviderSyncResult | null;
  launchReadiness: ProductLaunchReadiness;
  catalogApi: string;
  productApi: string;
  orderIntakeApi: string;
  orderIntakeReady: boolean;
  productApiReady: boolean;
}): ProductSellabilityImpact => {
  const generatedAt = new Date().toISOString();
  const blockingChecks = launchReadiness.checks.filter((check) => check.status === 'blocked');
  const attentionChecks = launchReadiness.checks.filter((check) => check.status === 'attention');
  const baseProviderSync = {
    provider: providerSync?.provider || 'not-run',
    status: providerSync?.status || 'not-run',
    executionMode: providerSync?.executionMode || 'none',
    syncedAt: providerSync?.syncedAt || null,
    hasProviderProductReference: Boolean(providerSync?.product?.id),
    hasProviderPriceReference: Boolean(providerSync?.price?.id),
  };

  if (!product) {
    return {
      schemaVersion: 'backy.product-sellability-impact.v1',
      generatedAt,
      selectedSiteId: activeSiteId,
      product: {
        id: null,
        slug: null,
        title: '',
        sku: '',
        status: 'not-selected',
        scheduledAt: null,
        path: null,
        productType: null,
      },
      readiness: {
        schemaVersion: launchReadiness.schemaVersion,
        status: launchReadiness.summary.status,
        score: launchReadiness.summary.score,
        blockerCount: launchReadiness.summary.blockerCount,
        attentionCount: launchReadiness.summary.attentionCount,
        blockingChecks,
        attentionChecks,
      },
      storefront: {
        catalogApi,
        productApi,
        orderIntakeApi,
        productApiReady,
        orderIntakeReady,
      },
      pricing: null,
      inventory: null,
      delivery: null,
      checkout: {
        orderIntakeReady,
        directCheckoutUrlConfigured: false,
        mode: orderIntakeReady ? 'backy-order-intake' : 'missing',
      },
      designReadiness: buildProductDesignReadiness(null),
      providerSync: baseProviderSync,
      actions: {
        publish: {
          allowed: false,
          disabledReason: 'Select an existing product or save the current product before publishing.',
        },
        archive: {
          allowed: false,
          disabledReason: 'Select an existing product or save the current product before archiving.',
        },
        providerSync: {
          allowed: false,
          disabledReason: 'Select an existing product or save the current product before syncing provider catalog metadata.',
        },
        storefrontHandoff: {
          allowed: false,
          disabledReason: 'Select an existing product or save the current product before copying storefront handoff data.',
        },
      },
      privacy: {
        includesProviderSecrets: false,
        includesPrivateOrders: false,
        includesCustomerPayloads: false,
        includesDigitalDeliveryUrl: false,
        note: 'This sellability impact exposes product launch metadata, readiness, and action safety only.',
      },
    };
  }

  const values = product.values || {};
  const title = String(readProductValue(values, 'title', product.slug) || product.slug).trim();
  const sku = String(readProductValue(values, 'sku', '') || '').trim();
  const productType = asProductType(readProductValue(values, 'productType'));
  const price = toNumber(readProductValue(values, 'price'));
  const currency = normalizeCurrency(String(readProductValue(values, 'currency', 'USD') || 'USD'));
  const checkoutUrl = String(readProductValue(values, 'checkoutUrl', '') || '').trim();
  const stockState = getProductStockState(values);
  const downloadUrlConfigured = Boolean(String(readProductValue(values, 'downloadUrl', '') || '').trim());
  const downloadMediaConfigured = Boolean(String(readProductValue(values, 'downloadMediaId', '') || '').trim());
  const designReadiness = buildProductDesignReadiness(buildProductStorefrontDesign(values));
  const hasLaunchBlockers = launchReadiness.summary.blockerCount > 0;
  const publishDisabledReason = product.status === 'published'
    ? 'Product is already published.'
    : hasLaunchBlockers
      ? blockingChecks[0]?.action || 'Resolve launch readiness blockers before publishing.'
      : !productApiReady
        ? 'Products collection is not ready for public catalog/detail API handoff.'
        : null;
  const providerSyncDisabledReason = !sku || price <= 0
    ? 'Product SKU and a positive price are required before provider catalog sync.'
    : null;

  return {
    schemaVersion: 'backy.product-sellability-impact.v1',
    generatedAt,
    selectedSiteId: activeSiteId,
    product: {
      id: product.id,
      slug: product.slug,
      title,
      sku,
      status: product.status,
      scheduledAt: product.scheduledAt || null,
      path: `/products/${product.slug}`,
      productType,
    },
    readiness: {
      schemaVersion: launchReadiness.schemaVersion,
      status: launchReadiness.summary.status,
      score: launchReadiness.summary.score,
      blockerCount: launchReadiness.summary.blockerCount,
      attentionCount: launchReadiness.summary.attentionCount,
      blockingChecks,
      attentionChecks,
    },
    storefront: {
      catalogApi,
      productApi,
      orderIntakeApi,
      productApiReady,
      orderIntakeReady,
    },
    pricing: {
      price,
      currency,
      ready: price > 0 && Boolean(currency),
    },
    inventory: {
      inventory: stockState.inventory,
      lowStockThreshold: stockState.lowStockThreshold,
      inventoryPolicy: stockState.inventoryPolicy,
      inStock: stockState.inStock,
      lowStock: stockState.lowStock,
      outOfStock: stockState.outOfStock,
    },
    delivery: {
      productType,
      shippingRequired: readProductValue(values, 'shippingRequired') !== false,
      shippingProfile: String(readProductValue(values, 'shippingProfile', '') || '').trim(),
      weight: maybeFiniteNumber(readProductValue(values, 'weight')),
      downloadMediaConfigured,
      downloadUrlConfigured,
    },
    checkout: {
      orderIntakeReady,
      directCheckoutUrlConfigured: Boolean(checkoutUrl),
      mode: orderIntakeReady
        ? 'backy-order-intake'
        : checkoutUrl
          ? 'direct-checkout-url'
          : 'missing',
    },
    designReadiness,
    providerSync: baseProviderSync,
    actions: {
      publish: {
        allowed: product.status !== 'published' && !publishDisabledReason,
        disabledReason: publishDisabledReason,
      },
      archive: {
        allowed: product.status !== 'archived',
        disabledReason: product.status === 'archived' ? 'Product is already archived.' : null,
      },
      providerSync: {
        allowed: !providerSyncDisabledReason,
        disabledReason: providerSyncDisabledReason,
      },
      storefrontHandoff: {
        allowed: true,
        disabledReason: null,
      },
    },
    privacy: {
      includesProviderSecrets: false,
      includesPrivateOrders: false,
      includesCustomerPayloads: false,
      includesDigitalDeliveryUrl: false,
      note: 'This sellability impact exposes product launch metadata, readiness, and action safety only.',
    },
  };
};

const buildProductStorefrontHandoff = ({
  activeSiteId,
  product,
  providerSync,
  launchReadiness,
  catalogApi,
  productApi,
  orderIntakeApi,
  productEventsApi,
  providerSyncApi,
  orderIntakeReady,
}: {
  activeSiteId: string;
  product: CollectionRecord | null;
  providerSync: CommerceProductProviderSyncResult | null;
  launchReadiness: ProductLaunchReadiness;
  catalogApi: string;
  productApi: string;
  orderIntakeApi: string;
  productEventsApi: string;
  providerSyncApi: string;
  orderIntakeReady: boolean;
}): ProductStorefrontHandoff => {
  const base = {
    schemaVersion: 'backy.product-storefront-handoff.v1' as const,
    generatedAt: new Date().toISOString(),
    selectedSiteId: activeSiteId,
    endpoints: {
      catalog: catalogApi,
      product: productApi,
      orderIntake: orderIntakeApi,
      events: productEventsApi,
      providerSync: providerSyncApi,
    },
    checkout: {
      orderIntakeReady,
      directCheckoutUrlConfigured: false,
      mode: orderIntakeReady ? 'backy-order-intake' as const : 'missing' as const,
    },
    providerSync: {
      provider: providerSync?.provider || 'not-run',
      status: providerSync?.status || 'not-run',
      executionMode: providerSync?.executionMode || 'none',
      syncedAt: providerSync?.syncedAt || null,
      hasProviderProductReference: Boolean(providerSync?.product?.id),
      hasProviderPriceReference: Boolean(providerSync?.price?.id),
    },
    sellabilityImpact: buildProductSellabilityImpact({
      activeSiteId,
      product,
      providerSync,
      launchReadiness,
      catalogApi,
      productApi,
      orderIntakeApi,
      orderIntakeReady,
      productApiReady: launchReadiness.storefront.productApiReady,
    }),
    launchReadiness: {
      schemaVersion: launchReadiness.schemaVersion,
      status: launchReadiness.summary.status,
      score: launchReadiness.summary.score,
      blockerCount: launchReadiness.summary.blockerCount,
      attentionCount: launchReadiness.summary.attentionCount,
      nextSteps: launchReadiness.actionPlan.nextSteps,
    },
    privacy: {
      customerSafeFieldsOnly: true,
      includesProviderSecrets: false,
      includesProviderResponses: false,
      includesPrivateOrders: false,
      includesCustomerPayloads: false,
      includesDigitalDeliveryUrl: false,
      includesRawCheckoutSessions: false,
      excludedFields: [
        'provider credentials',
        'providerResponse',
        'provider product and price ids',
        'private orders',
        'customer payloads',
        'digital delivery URL',
        'raw checkout sessions',
      ],
    },
  };

  if (!product) {
    return {
      ...base,
      product: null,
      pricing: null,
      inventory: null,
      media: null,
      merchandising: null,
      design: null,
      designReadiness: buildProductDesignReadiness(null),
      delivery: null,
      subscription: null,
    };
  }

  const values = product.values || {};
  const title = String(readProductValue(values, 'title', product.slug) || product.slug).trim();
  const sku = String(readProductValue(values, 'sku', '') || '').trim();
  const productType = asProductType(readProductValue(values, 'productType'));
  const price = toNumber(readProductValue(values, 'price'));
  const compareAtPriceValue = readProductValue(values, 'compareAtPrice');
  const checkoutUrl = String(readProductValue(values, 'checkoutUrl', '') || '').trim();
  const downloadConfigured = Boolean(
    String(readProductValue(values, 'downloadUrl', '') || '').trim()
    || String(readProductValue(values, 'downloadMediaId', '') || '').trim(),
  );
  const stockState = getProductStockState(values);
  const description = String(readProductValue(values, 'description', '') || '').trim();
  const design = buildProductStorefrontDesign(values);

  return {
    ...base,
    product: {
      id: product.id,
      slug: product.slug,
      status: product.status,
      title,
      sku,
      productType,
    },
    pricing: {
      price,
      compareAtPrice: compareAtPriceValue === null || compareAtPriceValue === undefined || compareAtPriceValue === ''
        ? null
        : toNumber(compareAtPriceValue),
      currency: normalizeCurrency(String(readProductValue(values, 'currency', 'USD') || 'USD')),
    },
    inventory: {
      inventory: stockState.inventory,
      lowStockThreshold: stockState.lowStockThreshold,
      inventoryPolicy: stockState.inventoryPolicy,
      inStock: stockState.inStock,
      lowStock: stockState.lowStock,
      outOfStock: stockState.outOfStock,
    },
    media: {
      imageUrl: String(readProductValue(values, 'imageUrl', '') || '').trim(),
      galleryImages: formatGalleryImages(readProductValue(values, 'galleryImages')),
    },
    merchandising: {
      category: String(readProductValue(values, 'category', '') || '').trim(),
      tags: formatTags(readProductValue(values, 'tags')),
      vendor: String(readProductValue(values, 'vendor', '') || '').trim(),
      featured: Boolean(readProductValue(values, 'featured')),
      seoTitle: String(readProductValue(values, 'seoTitle', '') || title).trim(),
      descriptionChars: description.length,
    },
    design,
    designReadiness: buildProductDesignReadiness(design),
    delivery: {
      shippingRequired: readProductValue(values, 'shippingRequired') !== false,
      shippingProfile: String(readProductValue(values, 'shippingProfile', '') || '').trim(),
      weight: maybeFiniteNumber(readProductValue(values, 'weight')),
      downloadUrlConfigured: downloadConfigured,
      returnPolicyConfigured: Boolean(String(readProductValue(values, 'returnPolicy', '') || '').trim()),
    },
    subscription: {
      enabled: Boolean(readProductValue(values, 'subscriptionEnabled')),
      interval: asSubscriptionInterval(readProductValue(values, 'subscriptionInterval')),
      trialDays: Math.max(0, toNumber(readProductValue(values, 'subscriptionTrialDays'))),
    },
    checkout: {
      orderIntakeReady,
      directCheckoutUrlConfigured: Boolean(checkoutUrl),
      mode: orderIntakeReady
        ? 'backy-order-intake'
        : checkoutUrl
          ? 'direct-checkout-url'
          : 'missing',
    },
  };
};

const formatProductLaunchReadinessStatus = (status: ProductLaunchReadinessStatus): string => {
  if (status === 'ready') return 'Ready';
  if (status === 'blocked') return 'Blocked';
  return 'Needs attention';
};

const productLaunchReadinessBadgeClass = (status: ProductLaunchReadinessStatus): string => {
  if (status === 'ready') return 'bg-emerald-50 text-emerald-700';
  if (status === 'blocked') return 'bg-red-50 text-red-700';
  return 'bg-amber-50 text-amber-700';
};

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
  download_media_id: String(readProductValue(product.values, 'downloadMediaId', '') || ''),
  download_media_name: String(readProductValue(product.values, 'downloadMediaName', '') || ''),
  download_media_type: String(readProductValue(product.values, 'downloadMediaType', '') || ''),
  download_media_folder_path: String(readProductValue(product.values, 'downloadMediaFolderPath', '') || ''),
  download_media_visibility: String(readProductValue(product.values, 'downloadMediaVisibility', '') || ''),
  download_media_scope: String(readProductValue(product.values, 'downloadMediaScope', '') || ''),
  download_media_scope_target_id: String(readProductValue(product.values, 'downloadMediaScopeTargetId', '') || ''),
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
