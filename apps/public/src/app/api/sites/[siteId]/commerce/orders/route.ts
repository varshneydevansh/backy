/**
 * Public commerce order intake endpoint.
 *
 * GET /api/sites/[siteId]/commerce/orders
 * POST /api/sites/[siteId]/commerce/orders
 */

import { NextRequest } from 'next/server';
import type { BackyCollectionField, BackyJsonObject, BackyJsonValue } from '@backy-cms/core';
import {
  PRODUCT_COLLECTION_SLUG,
  buildCommerceStorefrontContract,
  isCommerceSourceRecord,
  productRecordToCommerceProduct,
  type CommerceProduct,
  type CommerceSourceRecord,
  type CommerceStorefrontContract,
} from '@/lib/commerceCatalog';
import {
  createAdminCollection,
  createAdminCollectionRecord,
  getAdminSettings,
  getCollectionByIdOrSlug,
  getCollectionRecordByIdOrSlug,
  getSiteByIdOrSlug,
  listCollectionRecords,
  updateAdminCollection,
  updateAdminCollectionRecord,
} from '@/lib/backyStore';
import { publicContractJson } from '@/lib/publicContractResponse';
import { getRequiredDatabaseRepositories, shouldUseDemoStoreFallback } from '@/lib/repositoryRuntime';

interface RouteParams {
  params: Promise<{
    siteId: string;
  }>;
}

interface CheckoutItemInput {
  productId?: string;
  slug?: string;
  variantId?: string;
  variantSku?: string;
  quantity?: number;
}

interface CheckoutCustomerInput {
  name?: string;
  email?: string;
  phone?: string;
}

interface CheckoutOrderInput {
  items?: CheckoutItemInput[];
  customer?: CheckoutCustomerInput;
  shippingAddress?: string;
  billingAddress?: string;
  notes?: string;
  discountCode?: string;
  paymentProvider?: string;
  paymentReference?: string;
  checkoutSessionId?: string;
}

interface CheckoutSessionHandoff {
  id: string;
  provider: 'manual' | 'stripe';
  providerMode: 'test' | 'live';
  accountId: string | null;
  status: 'requires_action' | 'provider_ready';
  handoffMode: 'manual' | 'provider';
  url: string | null;
  successUrl: string;
  cancelUrl: string;
  expiresAt: string;
  reference: string;
  amountTotal: number;
  currency: string;
  metadata: Record<string, string>;
  providerPayload: Record<string, unknown> | null;
}

const ORDERS_COLLECTION_SLUG = 'orders';
const CUSTOMERS_COLLECTION_SLUG = 'customers';
const ORDER_CONTRACT_VERSION = 'backy.commerce-orders.v1';
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const makeRequestId = () => `req_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;

const errorResponse = (status: number, code: string, message: string, requestId: string, details?: unknown) => (
  publicContractJson(
    { success: false, requestId, error: { code, message, details } },
    { status, requestId, cache: 'error' },
  )
);

const parseJsonBody = async (request: NextRequest): Promise<Record<string, unknown>> => {
  try {
    const body = await request.json();
    return body && typeof body === 'object' && !Array.isArray(body)
      ? body as Record<string, unknown>
      : {};
  } catch {
    return {};
  }
};

const toJsonRecord = (value: Record<string, unknown>): Record<string, BackyJsonValue> => (
  value as Record<string, BackyJsonValue>
);

const textValue = (value: unknown): string => (
  typeof value === 'string' ? value.trim() : ''
);

const moneyValue = (value: number): number => (
  Math.round((Number.isFinite(value) ? value : 0) * 100) / 100
);

const normalizeCheckoutInput = (body: Record<string, unknown>): CheckoutOrderInput => {
  const customer = body.customer && typeof body.customer === 'object' && !Array.isArray(body.customer)
    ? body.customer as Record<string, unknown>
    : {};

  return {
    items: Array.isArray(body.items)
      ? body.items.map((item) => (
          item && typeof item === 'object' && !Array.isArray(item)
            ? item as CheckoutItemInput
            : {}
        ))
      : [],
    customer: {
      name: textValue(customer.name),
      email: textValue(customer.email).toLowerCase(),
      phone: textValue(customer.phone),
    },
    shippingAddress: textValue(body.shippingAddress),
    billingAddress: textValue(body.billingAddress),
    notes: textValue(body.notes),
    discountCode: textValue(body.discountCode || body.couponCode || body.promoCode).toUpperCase(),
    paymentProvider: textValue(body.paymentProvider),
    paymentReference: textValue(body.paymentReference),
    checkoutSessionId: textValue(body.checkoutSessionId || body.checkoutSession),
  };
};

const buildOrderNumber = () => `ORD-${Date.now().toString(36).toUpperCase()}${Math.random().toString(36).slice(2, 5).toUpperCase()}`;

const buildAbsoluteUrl = (request: NextRequest, path: string, params: Record<string, string> = {}): string => {
  const url = new URL(path.startsWith('/') ? path : `/${path}`, request.url);
  Object.entries(params).forEach(([key, value]) => {
    if (value) url.searchParams.set(key, value);
  });
  return url.toString();
};

const normalizeSlug = (value: unknown): string => (
  typeof value === 'string'
    ? value.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
    : ''
);

const normalizeEmail = (value: unknown): string => textValue(value).toLowerCase();

const customerSlug = (email: string): string => (
  normalizeSlug(email.replace('@', '-at-')) || `customer-${Date.now().toString(36)}`
);

const customerFields = (): BackyCollectionField[] => [
  { id: 'field-customer-name', key: 'name', label: 'Name', type: 'text', required: true },
  { id: 'field-customer-email', key: 'email', label: 'Email', type: 'email', required: true, unique: true },
  { id: 'field-customer-phone', key: 'phone', label: 'Phone', type: 'text' },
  { id: 'field-customer-status', key: 'status', label: 'Status', type: 'select', options: ['lead', 'customer', 'vip', 'inactive'] },
  { id: 'field-customer-source', key: 'source', label: 'Source', type: 'text' },
  { id: 'field-customer-last-order-id', key: 'lastorderid', label: 'Last Order ID', type: 'text' },
  { id: 'field-customer-last-order-number', key: 'lastordernumber', label: 'Last Order Number', type: 'text' },
  { id: 'field-customer-last-order-at', key: 'lastorderat', label: 'Last Order At', type: 'date' },
  { id: 'field-customer-order-count', key: 'ordercount', label: 'Order Count', type: 'number' },
  { id: 'field-customer-total-spent', key: 'totalspent', label: 'Total Spent', type: 'number' },
  { id: 'field-customer-notes', key: 'notes', label: 'Notes', type: 'richText' },
  { id: 'field-customer-source-values', key: 'sourcevalues', label: 'Source Values', type: 'json' },
];

const customerCollectionInput = () => ({
  name: 'Customers',
  slug: CUSTOMERS_COLLECTION_SLUG,
  description: 'Private customer profiles promoted from Backy contacts and commerce workflows.',
  status: 'draft',
  listRoutePattern: '/customers',
  routePattern: '/customers/:recordSlug',
  fields: customerFields(),
  permissions: {
    publicRead: false,
    publicCreate: false,
    publicUpdate: false,
    publicDelete: false,
  },
  metadata: {
    schemaVersion: 'backy.customers.v1',
    source: 'commerce-order-intake',
  },
});

const ensureCustomerFields = <T extends { key: string }>(collection: { fields: T[] }): Array<T | BackyCollectionField> => {
  const existingKeys = new Set((collection.fields || []).map((field) => field.key));
  const missingFields = customerFields().filter((field) => !existingKeys.has(field.key));
  return missingFields.length > 0 ? [...(collection.fields || []), ...missingFields] : collection.fields || [];
};

const checkoutCustomerValues = ({
  input,
  existingValues,
  orderId,
  orderNumber,
  orderCreatedAt,
  total,
  requestId,
}: {
  input: CheckoutOrderInput;
  existingValues?: Record<string, unknown>;
  orderId: string;
  orderNumber: string;
  orderCreatedAt: string;
  total: number;
  requestId: string;
}): Record<string, BackyJsonValue> => {
  const existingOrderCount = Math.max(0, Number(existingValues?.ordercount || 0));
  const existingTotalSpent = Math.max(0, Number(existingValues?.totalspent || 0));
  const existingSourceValues = existingValues?.sourcevalues && typeof existingValues.sourcevalues === 'object' && !Array.isArray(existingValues.sourcevalues)
    ? existingValues.sourcevalues as Record<string, unknown>
    : {};

  return {
    name: (input.customer?.name || existingValues?.name || input.customer?.email || 'Customer') as BackyJsonValue,
    email: normalizeEmail(input.customer?.email) as BackyJsonValue,
    phone: (input.customer?.phone || existingValues?.phone || '') as BackyJsonValue,
    status: (existingValues?.status || 'customer') as BackyJsonValue,
    source: 'checkout',
    lastorderid: orderId,
    lastordernumber: orderNumber,
    lastorderat: orderCreatedAt,
    ordercount: existingOrderCount + 1,
    totalspent: moneyValue(existingTotalSpent + total),
    notes: (existingValues?.notes || '') as BackyJsonValue,
    sourcevalues: {
      ...existingSourceValues,
      lastCheckoutOrder: {
        orderId,
        orderNumber,
        total,
        requestId,
        updatedAt: orderCreatedAt,
      },
    } as BackyJsonValue,
  };
};

const checkoutCustomerOrderLinkValues = ({
  existingValues,
  orderId,
  orderNumber,
  orderCreatedAt,
  total,
  requestId,
}: {
  existingValues?: Record<string, unknown>;
  orderId: string;
  orderNumber: string;
  orderCreatedAt: string;
  total: number;
  requestId: string;
}): Record<string, BackyJsonValue> => {
  const existingSourceValues = existingValues?.sourcevalues && typeof existingValues.sourcevalues === 'object' && !Array.isArray(existingValues.sourcevalues)
    ? existingValues.sourcevalues as Record<string, unknown>
    : {};
  const existingLastCheckoutOrder = existingSourceValues.lastCheckoutOrder && typeof existingSourceValues.lastCheckoutOrder === 'object' && !Array.isArray(existingSourceValues.lastCheckoutOrder)
    ? existingSourceValues.lastCheckoutOrder as Record<string, unknown>
    : {};

  return {
    lastorderid: orderId,
    lastordernumber: orderNumber,
    lastorderat: orderCreatedAt,
    sourcevalues: {
      ...existingSourceValues,
      lastCheckoutOrder: {
        ...existingLastCheckoutOrder,
        orderId,
        orderNumber,
        total,
        requestId,
        updatedAt: orderCreatedAt,
      },
    } as BackyJsonValue,
  };
};

const orderContract = (siteId: string) => ({
  schemaVersion: ORDER_CONTRACT_VERSION,
  accepts: {
    method: 'POST',
    contentType: 'application/json',
    body: {
      customer: { name: 'Jane Customer', email: 'jane@example.com', phone: '+1 555 0100' },
      items: [{ slug: 'product-slug', variantId: 'optional-variant-id', quantity: 1 }],
      shippingAddress: 'Optional shipping address text',
      billingAddress: 'Optional billing address text',
      discountCode: 'Optional product discount code',
      paymentProvider: 'manual',
      paymentReference: 'optional-provider-reference',
    },
  },
  creates: {
    collectionSlug: ORDERS_COLLECTION_SLUG,
    recordStatus: 'published',
    paymentStatus: 'pending',
    fulfillmentStatus: 'unfulfilled',
    reservesInventory: true,
  },
  inventoryReservation: {
    appliesTo: 'physical products and variants with finite stock',
    policy: 'deny rejects carts that request more than available inventory; continue and preorder keep accepting orders while stock floors at zero',
    variants: 'variantId or variantSku reserves the matched variant inventory when that variant has an inventory value',
    errors: ['PRODUCT_OUT_OF_STOCK', 'VARIANT_OUT_OF_STOCK', 'PRODUCT_INSUFFICIENT_STOCK', 'VARIANT_INSUFFICIENT_STOCK'],
  },
  pricing: {
    taxes: 'When enabled in Commerce settings, taxable lines receive a deterministic tax estimate from the product tax class.',
    shipping: 'When enabled in Commerce settings, physical shippable lines receive a shipping estimate from their shipping profile and weight.',
    discounts: 'When enabled in Commerce settings, product discount codes apply a percentage inferred from the code suffix, for example SMOKE10 = 10%.',
  },
  relatedEndpoints: {
    catalog: `/api/sites/${siteId}/commerce/catalog`,
    checkoutSession: `/api/sites/${siteId}/commerce/orders`,
    providerWebhook: `/api/sites/${siteId}/commerce/webhook`,
    rawOrdersBlocked: `/api/sites/${siteId}/collections/${ORDERS_COLLECTION_SLUG}/records`,
  },
});

const validateCheckoutInput = (input: CheckoutOrderInput): string[] => {
  const errors: string[] = [];

  if (!input.customer?.name) errors.push('customer.name is required');
  if (!input.customer?.email || !EMAIL_PATTERN.test(input.customer.email)) errors.push('customer.email must be a valid email');
  if (!input.items || input.items.length === 0) errors.push('At least one item is required');
  input.items?.forEach((item, index) => {
    if (!textValue(item.productId) && !textValue(item.slug)) {
      errors.push(`items[${index}] requires productId or slug`);
    }
    if (!Number.isFinite(Number(item.quantity)) || Number(item.quantity) <= 0) {
      errors.push(`items[${index}].quantity must be greater than 0`);
    }
  });

  return errors;
};

const selectProductVariant = (product: CommerceProduct, item: CheckoutItemInput) => {
  const variantId = textValue(item.variantId);
  const variantSku = textValue(item.variantSku);
  if (!variantId && !variantSku) return null;

  return product.variants.find((variant) => (
    (variantId && variant.id === variantId) ||
    (variantSku && variant.sku === variantSku)
  )) || null;
};

const lineItemFromProduct = (product: CommerceProduct, quantity: number, item: CheckoutItemInput) => {
  const variant = selectProductVariant(product, item);
  const unitPrice = variant?.price ?? product.price;

  return {
    productId: product.id,
    slug: product.slug,
    title: product.title,
    sku: variant?.sku || product.sku,
    variant: variant ? {
      id: variant.id,
      title: variant.title,
      option: variant.option,
      sku: variant.sku,
    } : null,
    quantity,
    price: unitPrice,
    currency: product.currency,
    lineTotal: moneyValue(unitPrice * quantity),
    productType: product.productType,
    imageUrl: product.imageUrl,
    galleryImages: product.galleryImages,
    checkoutUrl: product.checkout.url,
    taxable: product.delivery.taxable,
    taxClass: product.delivery.taxClass,
    shippingRequired: product.delivery.shippingRequired,
    shippingProfile: product.delivery.shippingProfile,
    weight: product.delivery.weight,
    discountCode: product.checkout.discountCode,
  };
};

type CheckoutLineItem = ReturnType<typeof lineItemFromProduct>;
type InventoryReservation = {
  record: CommerceSourceRecord;
  originalValues: Record<string, unknown>;
  values: Record<string, unknown>;
};

const taxRateForClass = (taxClass: string, rules: CommerceStorefrontContract['pricing']['rules']): number => {
  const normalized = taxClass.trim().toLowerCase();
  const standardRate = rules.taxRatePercent / 100;
  if (!normalized || normalized === 'standard') return standardRate;
  if (normalized.includes('exempt') || normalized.includes('zero')) return 0;
  if (normalized.includes('reduced')) return standardRate / 2;
  if (normalized.includes('digital')) return rules.digitalTaxRatePercent / 100;
  if (normalized.includes('service')) return Math.max(0, standardRate - 0.025);
  return standardRate;
};

const shippingBaseForProfile = (profile: string, rules: CommerceStorefrontContract['pricing']['rules']): number => {
  const normalized = profile.trim().toLowerCase();
  if (!normalized || normalized === 'standard') return rules.shippingBaseAmount;
  if (normalized.includes('digital') || normalized.includes('pickup') || normalized.includes('free')) return 0;
  if (normalized.includes('express')) return moneyValue(rules.shippingBaseAmount * 1.875);
  if (normalized.includes('freight') || normalized.includes('oversize')) return moneyValue(rules.shippingBaseAmount * 4.375);
  if (normalized.includes('box') || normalized.includes('standard')) return rules.shippingBaseAmount;
  return moneyValue(rules.shippingBaseAmount * 1.25);
};

const discountPercentFromCode = (code: string, rules: CommerceStorefrontContract['pricing']['rules']): number => {
  if (rules.discountPercent > 0) {
    return rules.discountPercent / 100;
  }
  const match = code.match(/(\d{1,2})$/);
  if (!match) return code ? 0.1 : 0;
  return Math.max(0, Math.min(90, Number(match[1]))) / 100;
};

const calculateCheckoutQuote = (
  lineItems: CheckoutLineItem[],
  discountCode: string,
  commerce: CommerceStorefrontContract,
) => {
  const subtotal = moneyValue(lineItems.reduce((sum, item) => sum + item.lineTotal, 0));
  const normalizedDiscountCode = discountCode.trim().toUpperCase();
  const pricingRules = commerce.pricing.rules;
  const discountRate = commerce.pricing.discounts ? discountPercentFromCode(normalizedDiscountCode, pricingRules) : 0;
  const discountLines = lineItems.map((item) => {
    const itemDiscountCode = textValue(item.discountCode).toUpperCase();
    const eligible = Boolean(discountRate && normalizedDiscountCode && itemDiscountCode === normalizedDiscountCode);
    const amount = eligible ? moneyValue(item.lineTotal * discountRate) : 0;
    return {
      productId: item.productId,
      slug: item.slug,
      code: eligible ? normalizedDiscountCode : '',
      rate: eligible ? discountRate : 0,
      amount,
    };
  }).filter((line) => line.amount > 0);
  const discountAmount = moneyValue(discountLines.reduce((sum, line) => sum + line.amount, 0));

  const lineDiscountByProduct = new Map(discountLines.map((line) => [line.productId, line.amount]));
  const taxLines = lineItems.map((item) => {
    if (!commerce.pricing.taxes || !item.taxable) {
      return {
        productId: item.productId,
        slug: item.slug,
        taxClass: item.taxClass || 'standard',
        rate: 0,
        amount: 0,
      };
    }
    const taxableAmount = Math.max(0, item.lineTotal - (lineDiscountByProduct.get(item.productId) || 0));
    const rate = taxRateForClass(item.taxClass, pricingRules);
    return {
      productId: item.productId,
      slug: item.slug,
      taxClass: item.taxClass || 'standard',
      rate,
      amount: moneyValue(taxableAmount * rate),
    };
  }).filter((line) => line.amount > 0 || commerce.pricing.taxes);
  const taxAmount = moneyValue(taxLines.reduce((sum, line) => sum + line.amount, 0));

  const shippingGroups = new Map<string, { profile: string; base: number; weightTotal: number; slugs: string[] }>();
  if (commerce.pricing.shipping) {
    for (const item of lineItems) {
      if (!item.shippingRequired) continue;
      const profile = item.shippingProfile || 'standard';
      const group = shippingGroups.get(profile) || {
        profile,
        base: shippingBaseForProfile(profile, pricingRules),
        weightTotal: 0,
        slugs: [],
      };
      group.weightTotal += Math.max(0, Number(item.weight || 0)) * item.quantity;
      group.slugs.push(item.slug);
      shippingGroups.set(profile, group);
    }
  }
  const shippingLines = Array.from(shippingGroups.values()).map((group) => ({
    profile: group.profile,
    slugs: group.slugs,
    base: moneyValue(group.base),
    weightAmount: moneyValue(group.weightTotal * pricingRules.shippingWeightRate),
    amount: moneyValue(group.base + group.weightTotal * pricingRules.shippingWeightRate),
  }));
  const shippingAmount = moneyValue(shippingLines.reduce((sum, line) => sum + line.amount, 0));
  const total = moneyValue(Math.max(0, subtotal - discountAmount + taxAmount + shippingAmount));

  return {
    subtotal,
    discountAmount,
    taxAmount,
    shippingAmount,
    total,
    currency: lineItems[0]?.currency || commerce.currency || 'USD',
    discountCode: normalizedDiscountCode,
    discountRate,
    discountLines,
    taxLines,
    shippingLines,
    pricing: commerce.pricing,
  };
};

const buildCheckoutSessionHandoff = ({
  request,
  siteId,
  commerce,
  input,
  orderNumber,
  orderSlug,
  quote,
  lineItems,
  requestId,
  createdAt,
}: {
  request: NextRequest;
  siteId: string;
  commerce: CommerceStorefrontContract;
  input: CheckoutOrderInput;
  orderNumber: string;
  orderSlug: string;
  quote: ReturnType<typeof calculateCheckoutQuote>;
  lineItems: CheckoutLineItem[];
  requestId: string;
  createdAt: string;
}): CheckoutSessionHandoff => {
  const requestedProvider = textValue(input.paymentProvider).toLowerCase();
  const provider: CheckoutSessionHandoff['provider'] = requestedProvider === 'stripe'
    ? 'stripe'
    : commerce.paymentProvider === 'stripe'
      ? 'stripe'
      : 'manual';
  const id = input.checkoutSessionId || `cs_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
  const metadata = {
    siteId,
    orderNumber,
    orderSlug,
    requestId,
  };
  const successUrl = buildAbsoluteUrl(request, commerce.checkout.successPath, {
    order: orderNumber,
    session: id,
    request: requestId,
  });
  const cancelUrl = buildAbsoluteUrl(request, commerce.checkout.cancelPath, {
    order: orderNumber,
    session: id,
    request: requestId,
  });
  const expiresAt = new Date(Date.parse(createdAt) + commerce.inventory.reservationMinutes * 60_000).toISOString();
  const providerPayload = provider === 'stripe'
    ? {
      action: 'checkout.sessions.create',
      mode: 'payment',
      accountId: commerce.provider.accountId,
      providerMode: commerce.provider.mode,
      successUrl,
      cancelUrl,
      currency: quote.currency.toLowerCase(),
      lineItems: lineItems.map((item) => ({
        quantity: item.quantity,
        priceData: {
          currency: item.currency.toLowerCase(),
          unitAmount: Math.round(item.price * 100),
          productData: {
            name: item.title,
            metadata: {
              productId: item.productId,
              slug: item.slug,
              variantId: item.variant?.id || '',
              variantSku: item.variant?.sku || '',
            },
          },
        },
      })),
      metadata,
    }
    : null;

  return {
    id,
    provider,
    providerMode: commerce.provider.mode,
    accountId: commerce.provider.accountId,
    status: provider === 'stripe' ? 'provider_ready' : 'requires_action',
    handoffMode: provider === 'stripe' ? 'provider' : 'manual',
    url: provider === 'manual' ? successUrl : null,
    successUrl,
    cancelUrl,
    expiresAt,
    reference: input.paymentReference || `${provider}:${id}`,
    amountTotal: quote.total,
    currency: quote.currency,
    metadata,
    providerPayload,
  };
};

const upsertRepositoryCheckoutCustomer = async ({
  siteId,
  repositories,
  input,
  orderNumber,
  orderCreatedAt,
  total,
  requestId,
}: {
  siteId: string;
  repositories: Awaited<ReturnType<typeof getRequiredDatabaseRepositories>>;
  input: CheckoutOrderInput;
  orderNumber: string;
  orderCreatedAt: string;
  total: number;
  requestId: string;
}) => {
  const email = normalizeEmail(input.customer?.email);
  if (!email) return null;

  const collectionInput = customerCollectionInput();
  const existingCollection = await repositories.collections.getBySlug(siteId, CUSTOMERS_COLLECTION_SLUG);
  const collection = existingCollection || (await repositories.collections.create({
    siteId,
    name: collectionInput.name,
    slug: collectionInput.slug,
    description: collectionInput.description,
    status: 'draft',
    routePattern: collectionInput.routePattern,
    listRoutePattern: collectionInput.listRoutePattern,
    fields: collectionInput.fields,
    permissions: collectionInput.permissions,
    metadata: collectionInput.metadata as BackyJsonObject,
  })).item;
  const ensuredFields = ensureCustomerFields(collection);
  const customerCollection = ensuredFields.length === collection.fields.length
    ? collection
    : (await repositories.collections.update(siteId, collection.id, {
      fields: ensuredFields,
      metadata: {
        ...(collection.metadata && typeof collection.metadata === 'object' && !Array.isArray(collection.metadata) ? collection.metadata : {}),
        schemaVersion: 'backy.customers.v1',
        source: 'commerce-order-intake',
      } as BackyJsonObject,
    })).item;
  const existingRecords = await repositories.collections.listRecords({
    siteId,
    collectionId: customerCollection.id,
    includeUnpublished: true,
    fieldKey: 'email',
    fieldValue: email,
    limit: 100,
    offset: 0,
  });
  const existingRecord = existingRecords.items.find((record) => normalizeEmail(record.values.email) === email);
  const values = checkoutCustomerValues({
    input,
    existingValues: existingRecord?.values,
    orderId: orderNumber,
    orderNumber,
    orderCreatedAt,
    total,
    requestId,
  });
  const record = existingRecord
    ? (await repositories.collections.updateRecord(siteId, customerCollection.id, existingRecord.id, {
      status: existingRecord.status,
      values: {
        ...existingRecord.values,
        ...values,
      },
    })).item
    : (await repositories.collections.createRecord({
      siteId,
      collectionId: customerCollection.id,
      slug: customerSlug(email),
      status: 'draft',
      values,
    })).item;

  return {
    collection: customerCollection,
    record,
    existingRecord: Boolean(existingRecord),
  };
};

const updateRepositoryCheckoutCustomerOrderLink = async ({
  siteId,
  repositories,
  customerProfile,
  orderId,
  orderNumber,
  orderCreatedAt,
  total,
  requestId,
}: {
  siteId: string;
  repositories: Awaited<ReturnType<typeof getRequiredDatabaseRepositories>>;
  customerProfile: Awaited<ReturnType<typeof upsertRepositoryCheckoutCustomer>>;
  orderId: string;
  orderNumber: string;
  orderCreatedAt: string;
  total: number;
  requestId: string;
}) => {
  if (!customerProfile) return null;
  const orderLinkValues = checkoutCustomerOrderLinkValues({
    existingValues: customerProfile.record.values,
    orderId,
    orderNumber,
    orderCreatedAt,
    total,
    requestId,
  });
  const record = (await repositories.collections.updateRecord(siteId, customerProfile.collection.id, customerProfile.record.id, {
    status: customerProfile.record.status,
    values: {
      ...customerProfile.record.values,
      ...orderLinkValues,
    },
  })).item;

  return {
    ...customerProfile,
    record,
  };
};

const upsertDemoCheckoutCustomer = ({
  siteId,
  input,
  orderNumber,
  orderCreatedAt,
  total,
  requestId,
}: {
  siteId: string;
  input: CheckoutOrderInput;
  orderNumber: string;
  orderCreatedAt: string;
  total: number;
  requestId: string;
}) => {
  const email = normalizeEmail(input.customer?.email);
  if (!email) return null;

  const collectionInput = customerCollectionInput();
  const existingCollection = getCollectionByIdOrSlug(siteId, CUSTOMERS_COLLECTION_SLUG, { includeUnpublished: true });
  const collection = existingCollection || createAdminCollection(siteId, collectionInput);
  const ensuredFields = ensureCustomerFields(collection);
  const customerCollection = ensuredFields.length === collection.fields.length
    ? collection
    : updateAdminCollection(siteId, collection.id, {
      fields: ensuredFields,
      metadata: {
        ...(collection.metadata && typeof collection.metadata === 'object' && !Array.isArray(collection.metadata) ? collection.metadata : {}),
        schemaVersion: 'backy.customers.v1',
        source: 'commerce-order-intake',
      },
    }) || collection;
  const existingRecord = listCollectionRecords(siteId, customerCollection.id, {
    includeUnpublished: true,
    fieldKey: 'email',
    fieldValue: email,
    limit: 100,
    offset: 0,
  }).records.find((record) => normalizeEmail(record.values.email) === email);
  const values = checkoutCustomerValues({
    input,
    existingValues: existingRecord?.values,
    orderId: orderNumber,
    orderNumber,
    orderCreatedAt,
    total,
    requestId,
  });
  const record = existingRecord
    ? updateAdminCollectionRecord(siteId, customerCollection.id, existingRecord.id, {
      status: existingRecord.status,
      values: {
        ...existingRecord.values,
        ...values,
      },
    })
    : createAdminCollectionRecord(siteId, customerCollection.id, {
      slug: customerSlug(email),
      status: 'draft',
      values,
    });

  return record
    ? {
      collection: customerCollection,
      record,
      existingRecord: Boolean(existingRecord),
    }
    : null;
};

const updateDemoCheckoutCustomerOrderLink = ({
  siteId,
  customerProfile,
  orderId,
  orderNumber,
  orderCreatedAt,
  total,
  requestId,
}: {
  siteId: string;
  customerProfile: ReturnType<typeof upsertDemoCheckoutCustomer>;
  orderId: string;
  orderNumber: string;
  orderCreatedAt: string;
  total: number;
  requestId: string;
}) => {
  if (!customerProfile) return null;
  const orderLinkValues = checkoutCustomerOrderLinkValues({
    existingValues: customerProfile.record.values,
    orderId,
    orderNumber,
    orderCreatedAt,
    total,
    requestId,
  });
  const record = updateAdminCollectionRecord(siteId, customerProfile.collection.id, customerProfile.record.id, {
    status: customerProfile.record.status,
    values: {
      ...customerProfile.record.values,
      ...orderLinkValues,
    },
  });

  return record
    ? {
      ...customerProfile,
      record,
    }
    : customerProfile;
};

const parseVariantSource = (value: unknown): unknown[] => {
  if (Array.isArray(value)) {
    return value;
  }

  if (typeof value === 'string' && value.trim()) {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  return [];
};

const reserveInventoryForCheckoutItem = (
  record: CommerceSourceRecord,
  product: CommerceProduct,
  item: CheckoutItemInput,
  quantity: number,
): { values: Record<string, unknown> | null; error?: { code: string; message: string; details: Record<string, unknown> } } => {
  if (product.productType !== 'physical') {
    return { values: null };
  }

  const variant = selectProductVariant(product, item);
  if (variant) {
    if (variant.inventory === null) {
      return { values: null };
    }

    const variantInventory = variant.inventory;

    if (product.inventory.policy === 'deny' && quantity > variantInventory) {
      return {
        values: null,
        error: {
          code: 'VARIANT_INSUFFICIENT_STOCK',
          message: `${variant.title} has only ${variantInventory} available`,
          details: {
            productId: product.id,
            slug: product.slug,
            variantId: variant.id,
            requested: quantity,
            available: variantInventory,
          },
        },
      };
    }

    const variantSource = parseVariantSource(record.values.variants);
    const nextVariants = variantSource.map((source, index) => {
      if (!source || typeof source !== 'object' || Array.isArray(source)) {
        return source;
      }

      const candidate = source as Record<string, unknown>;
      const candidateId = textValue(candidate.id) || `variant-${index + 1}`;
      const candidateSku = textValue(candidate.sku);
      const isMatch = candidateId === variant.id || (candidateSku && candidateSku === variant.sku);

      return isMatch
        ? {
            ...candidate,
            inventory: Math.max(0, variantInventory - quantity),
          }
        : candidate;
    });

    return {
      values: {
        ...record.values,
        variants: nextVariants,
      },
    };
  }

  if (product.inventory.policy === 'deny' && quantity > product.inventory.quantity) {
    return {
      values: null,
      error: {
        code: 'PRODUCT_INSUFFICIENT_STOCK',
        message: `${product.title} has only ${product.inventory.quantity} available`,
        details: {
          productId: product.id,
          slug: product.slug,
          requested: quantity,
          available: product.inventory.quantity,
        },
      },
    };
  }

  return {
    values: {
      ...record.values,
      inventory: Math.max(0, product.inventory.quantity - quantity),
    },
  };
};

const applyRepositoryInventoryReservations = async ({
  siteId,
  productsCollectionId,
  repositories,
  reservations,
}: {
  siteId: string;
  productsCollectionId: string;
  repositories: Awaited<ReturnType<typeof getRequiredDatabaseRepositories>>;
  reservations: Iterable<InventoryReservation>;
}) => {
  const applied: InventoryReservation[] = [];

  try {
    for (const reservation of reservations) {
      await repositories.collections.updateRecord(siteId, productsCollectionId, reservation.record.id, {
        status: reservation.record.status,
        values: toJsonRecord(reservation.values),
      });
      applied.push(reservation);
    }
  } catch (error) {
    await Promise.allSettled(applied.map((reservation) => (
      repositories.collections.updateRecord(siteId, productsCollectionId, reservation.record.id, {
        status: reservation.record.status,
        values: toJsonRecord(reservation.originalValues),
      })
    )));
    throw error;
  }

  return async () => {
    await Promise.allSettled(applied.map((reservation) => (
      repositories.collections.updateRecord(siteId, productsCollectionId, reservation.record.id, {
        status: reservation.record.status,
        values: toJsonRecord(reservation.originalValues),
      })
    )));
  };
};

const applyDemoInventoryReservations = ({
  siteId,
  productsCollectionId,
  reservations,
}: {
  siteId: string;
  productsCollectionId: string;
  reservations: Iterable<InventoryReservation>;
}) => {
  const applied: InventoryReservation[] = [];

  try {
    for (const reservation of reservations) {
      const updated = updateAdminCollectionRecord(siteId, productsCollectionId, reservation.record.id, {
        status: reservation.record.status,
        values: reservation.values,
      });
      if (!updated) {
        throw new Error(`Unable to reserve inventory for product ${reservation.record.id}`);
      }
      applied.push(reservation);
    }
  } catch (error) {
    applied.forEach((reservation) => {
      updateAdminCollectionRecord(siteId, productsCollectionId, reservation.record.id, {
        status: reservation.record.status,
        values: reservation.originalValues,
      });
    });
    throw error;
  }

  return () => {
    applied.forEach((reservation) => {
      updateAdminCollectionRecord(siteId, productsCollectionId, reservation.record.id, {
        status: reservation.record.status,
        values: reservation.originalValues,
      });
    });
  };
};

export async function GET(request: NextRequest, { params }: RouteParams) {
  const requestId = request.headers.get('x-request-id') || makeRequestId();

  try {
    const { siteId } = await params;

    if (!shouldUseDemoStoreFallback()) {
      const repositories = await getRequiredDatabaseRepositories();
      const site = await repositories.sites.getById(siteId) || await repositories.sites.getBySlug(siteId);

      if (!site || !site.isPublished) {
        return errorResponse(404, 'SITE_NOT_FOUND', 'Site not found', requestId);
      }

      const [productsCollection, ordersCollection, settings] = await Promise.all([
        repositories.collections.getBySlug(site.id, PRODUCT_COLLECTION_SLUG),
        repositories.collections.getBySlug(site.id, ORDERS_COLLECTION_SLUG),
        repositories.settings.get(),
      ]);

      if (!productsCollection || productsCollection.status !== 'published' || !productsCollection.permissions.publicRead) {
        return errorResponse(404, 'PRODUCT_CATALOG_NOT_FOUND', 'Product catalog not found', requestId);
      }

      if (!ordersCollection || ordersCollection.status !== 'published') {
        return errorResponse(404, 'ORDER_QUEUE_NOT_FOUND', 'Private order queue not found', requestId);
      }

      if (ordersCollection.permissions.publicRead || ordersCollection.permissions.publicCreate) {
        return errorResponse(409, 'ORDER_QUEUE_NOT_PRIVATE', 'Orders collection must remain private before public checkout intake is enabled', requestId);
      }

      const commerce = buildCommerceStorefrontContract({
        siteId: site.id,
        settings: settings.integrations?.commerce,
        hasCatalog: true,
        hasOrderIntake: true,
      });

      return publicContractJson({
        success: true,
        requestId,
        data: {
          ...orderContract(site.id),
          commerce,
          readiness: {
            site: true,
            catalog: true,
            privateOrderQueue: true,
            orderIntake: true,
          },
        },
      }, {
        requestId,
        request,
        cache: 'discovery',
        siteId: site.id,
      });
    }

    const site = getSiteByIdOrSlug(siteId);
    if (!site) {
      return errorResponse(404, 'SITE_NOT_FOUND', 'Site not found', requestId);
    }

    const productsCollection = getCollectionByIdOrSlug(site.id, PRODUCT_COLLECTION_SLUG);
    const ordersCollection = getCollectionByIdOrSlug(site.id, ORDERS_COLLECTION_SLUG, { includeUnpublished: true });
    if (!productsCollection || productsCollection.status !== 'published' || !productsCollection.permissions.publicRead) {
      return errorResponse(404, 'PRODUCT_CATALOG_NOT_FOUND', 'Product catalog not found', requestId);
    }
    if (!ordersCollection || ordersCollection.status !== 'published') {
      return errorResponse(404, 'ORDER_QUEUE_NOT_FOUND', 'Private order queue not found', requestId);
    }
    if (ordersCollection.permissions.publicRead || ordersCollection.permissions.publicCreate) {
      return errorResponse(409, 'ORDER_QUEUE_NOT_PRIVATE', 'Orders collection must remain private before public checkout intake is enabled', requestId);
    }
    const commerce = buildCommerceStorefrontContract({
      siteId: site.id,
      settings: getAdminSettings().integrations?.commerce,
      hasCatalog: true,
      hasOrderIntake: true,
    });

    return publicContractJson({
      success: true,
      requestId,
      data: {
        ...orderContract(site.id),
        commerce,
        readiness: {
          site: true,
          catalog: true,
          privateOrderQueue: true,
          orderIntake: true,
        },
      },
    }, {
      requestId,
      request,
      cache: 'discovery',
      siteId: site.id,
    });
  } catch (error) {
    console.error('Public commerce order contract API error:', error);
    return errorResponse(500, 'INTERNAL_SERVER_ERROR', 'Internal server error', requestId);
  }
}

export async function POST(request: NextRequest, { params }: RouteParams) {
  const requestId = request.headers.get('x-request-id') || makeRequestId();

  try {
    const { siteId } = await params;
    const body = await parseJsonBody(request);
    const input = normalizeCheckoutInput(body);
    const validationErrors = validateCheckoutInput(input);

    if (validationErrors.length > 0) {
      return errorResponse(400, 'VALIDATION_ERROR', 'Checkout order is invalid', requestId, validationErrors);
    }

    if (!shouldUseDemoStoreFallback()) {
      const repositories = await getRequiredDatabaseRepositories();
      const site = await repositories.sites.getById(siteId) || await repositories.sites.getBySlug(siteId);

      if (!site || !site.isPublished) {
        return errorResponse(404, 'SITE_NOT_FOUND', 'Site not found', requestId);
      }

      const [productsCollection, ordersCollection, settings] = await Promise.all([
        repositories.collections.getBySlug(site.id, PRODUCT_COLLECTION_SLUG),
        repositories.collections.getBySlug(site.id, ORDERS_COLLECTION_SLUG),
        repositories.settings.get(),
      ]);

      if (!productsCollection || productsCollection.status !== 'published' || !productsCollection.permissions.publicRead) {
        return errorResponse(404, 'PRODUCT_CATALOG_NOT_FOUND', 'Product catalog not found', requestId);
      }

      if (!ordersCollection || ordersCollection.status !== 'published') {
        return errorResponse(404, 'ORDER_QUEUE_NOT_FOUND', 'Private order queue not found', requestId);
      }

      if (ordersCollection.permissions.publicRead || ordersCollection.permissions.publicCreate) {
        return errorResponse(409, 'ORDER_QUEUE_NOT_PRIVATE', 'Orders collection must remain private before public checkout intake is enabled', requestId);
      }
      const commerce = buildCommerceStorefrontContract({
        siteId: site.id,
        settings: settings.integrations?.commerce,
        hasCatalog: true,
        hasOrderIntake: true,
      });

      const lineItems = [];
      const reservationsEnabled = commerce.inventory.reservations;
      const inventoryReservations = new Map<string, InventoryReservation>();
      for (const item of input.items || []) {
        const quantity = Math.max(1, Math.floor(Number(item.quantity || 1)));
        const record = textValue(item.productId)
          ? await repositories.collections.getRecordById(site.id, productsCollection.id, textValue(item.productId))
          : await repositories.collections.getRecordBySlug(site.id, productsCollection.id, textValue(item.slug));

        if (!isCommerceSourceRecord(record)) {
          return errorResponse(404, 'PRODUCT_NOT_FOUND', 'Product not found', requestId, { item });
        }

        const reservedRecord = inventoryReservations.get(record.id);
        const workingRecord: CommerceSourceRecord = reservedRecord
          ? { ...record, values: reservedRecord.values }
          : record;
        const product = productRecordToCommerceProduct(workingRecord);
        if (reservationsEnabled && !product.inventory.inStock) {
          return errorResponse(409, 'PRODUCT_OUT_OF_STOCK', `${product.title} is out of stock`, requestId, { productId: product.id, slug: product.slug });
        }

        const variant = selectProductVariant(product, item);
        if ((item.variantId || item.variantSku) && !variant) {
          return errorResponse(404, 'VARIANT_NOT_FOUND', 'Product variant not found', requestId, { item, productId: product.id, slug: product.slug });
        }
        if (reservationsEnabled && variant && !variant.inStock) {
          return errorResponse(409, 'VARIANT_OUT_OF_STOCK', `${variant.title} is out of stock`, requestId, { productId: product.id, slug: product.slug, variantId: variant.id });
        }

        if (reservationsEnabled) {
          const reservation = reserveInventoryForCheckoutItem(workingRecord, product, item, quantity);
          if (reservation.error) {
            return errorResponse(409, reservation.error.code, reservation.error.message, requestId, reservation.error.details);
          }
          if (reservation.values) {
            inventoryReservations.set(record.id, {
              record: workingRecord,
              originalValues: reservedRecord?.originalValues || record.values,
              values: reservation.values,
            });
          }
        }

        lineItems.push(lineItemFromProduct(product, quantity, item));
      }

      const currency = lineItems[0]?.currency || 'USD';
      const quote = calculateCheckoutQuote(lineItems, input.discountCode || '', commerce);
      if (lineItems.some((item) => item.currency !== currency)) {
        return errorResponse(409, 'MIXED_CURRENCY_CART', 'All checkout items must use the same currency', requestId, {
          currencies: Array.from(new Set(lineItems.map((item) => item.currency))),
        });
      }
      const orderNumber = buildOrderNumber();
      let slug = orderNumber.toLowerCase();
      let suffix = 2;
      while (await repositories.collections.getRecordBySlug(site.id, ordersCollection.id, slug)) {
        slug = `${orderNumber.toLowerCase()}-${suffix}`;
        suffix += 1;
      }
      const orderCreatedAt = new Date().toISOString();
      const checkoutSession = buildCheckoutSessionHandoff({
        request,
        siteId: site.id,
        commerce,
        input,
        orderNumber,
        orderSlug: slug,
        quote,
        lineItems,
        requestId,
        createdAt: orderCreatedAt,
      });
      let customerProfile = await upsertRepositoryCheckoutCustomer({
        siteId: site.id,
        repositories,
        input,
        orderNumber,
        orderCreatedAt,
        total: quote.total,
        requestId,
      });
      const values = {
        ordernumber: orderNumber,
        customername: input.customer?.name || '',
        email: input.customer?.email || '',
        phone: input.customer?.phone || '',
        total: quote.total,
        subtotal: quote.subtotal,
        taxamount: quote.taxAmount,
        shippingamount: quote.shippingAmount,
        discountamount: quote.discountAmount,
        currency,
        items: JSON.stringify(lineItems, null, 2),
        ordersource: 'web',
        checkoutsessionid: checkoutSession.id,
        customerid: customerProfile?.record.id || '',
        orderstatus: 'open',
        paymentstatus: 'pending',
        paymentprovider: checkoutSession.provider,
        paymentreference: checkoutSession.reference,
        fulfillmentstatus: 'unfulfilled',
        shippingaddress: input.shippingAddress || '',
        billingaddress: input.billingAddress || '',
        notes: input.notes || '',
      };
      const rollbackInventoryReservations = await applyRepositoryInventoryReservations({
        siteId: site.id,
        productsCollectionId: productsCollection.id,
        repositories,
        reservations: inventoryReservations.values(),
      });

      let order: Awaited<ReturnType<typeof repositories.collections.createRecord>>['item'];
      try {
        order = (await repositories.collections.createRecord({
          siteId: site.id,
          collectionId: ordersCollection.id,
          slug,
          status: 'published',
          values: toJsonRecord(values),
        })).item;
      } catch (error) {
        await rollbackInventoryReservations();
        throw error;
      }
      customerProfile = await updateRepositoryCheckoutCustomerOrderLink({
        siteId: site.id,
        repositories,
        customerProfile,
        orderId: order.id,
        orderNumber,
        orderCreatedAt,
        total: quote.total,
        requestId,
      });

      return publicContractJson({
        success: true,
        requestId,
        data: {
          schemaVersion: ORDER_CONTRACT_VERSION,
          order: {
            id: order.id,
            slug: order.slug,
            orderNumber,
            status: values.orderstatus,
            paymentStatus: values.paymentstatus,
            fulfillmentStatus: values.fulfillmentstatus,
            total: quote.total,
            subtotal: quote.subtotal,
            taxAmount: quote.taxAmount,
            shippingAmount: quote.shippingAmount,
            discountAmount: quote.discountAmount,
            currency,
            itemCount: lineItems.reduce((sum, item) => sum + item.quantity, 0),
            createdAt: order.createdAt,
          },
          customer: customerProfile ? {
            id: customerProfile.record.id,
            slug: customerProfile.record.slug,
            existing: customerProfile.existingRecord,
          } : null,
          checkoutSession,
          quote,
          lineItems,
        },
      }, {
        status: 201,
        requestId,
        request,
        cache: 'private',
        siteId: site.id,
      });
    }

    const site = getSiteByIdOrSlug(siteId);
    if (!site) {
      return errorResponse(404, 'SITE_NOT_FOUND', 'Site not found', requestId);
    }

    const productsCollection = getCollectionByIdOrSlug(site.id, PRODUCT_COLLECTION_SLUG);
    const ordersCollection = getCollectionByIdOrSlug(site.id, ORDERS_COLLECTION_SLUG, { includeUnpublished: true });
    if (!productsCollection || productsCollection.status !== 'published' || !productsCollection.permissions.publicRead) {
      return errorResponse(404, 'PRODUCT_CATALOG_NOT_FOUND', 'Product catalog not found', requestId);
    }
    if (!ordersCollection || ordersCollection.status !== 'published') {
      return errorResponse(404, 'ORDER_QUEUE_NOT_FOUND', 'Private order queue not found', requestId);
    }
    if (ordersCollection.permissions.publicRead || ordersCollection.permissions.publicCreate) {
      return errorResponse(409, 'ORDER_QUEUE_NOT_PRIVATE', 'Orders collection must remain private before public checkout intake is enabled', requestId);
    }
    const commerce = buildCommerceStorefrontContract({
      siteId: site.id,
      settings: getAdminSettings().integrations?.commerce,
      hasCatalog: true,
      hasOrderIntake: true,
    });

    const lineItems = [];
    const reservationsEnabled = commerce.inventory.reservations;
    const inventoryReservations = new Map<string, InventoryReservation>();
    for (const item of input.items || []) {
      const quantity = Math.max(1, Math.floor(Number(item.quantity || 1)));
      const record = getCollectionRecordByIdOrSlug(
        site.id,
        productsCollection.id,
        textValue(item.productId || item.slug),
      );

      if (!isCommerceSourceRecord(record)) {
        return errorResponse(404, 'PRODUCT_NOT_FOUND', 'Product not found', requestId, { item });
      }

      const reservedRecord = inventoryReservations.get(record.id);
      const workingRecord: CommerceSourceRecord = reservedRecord
        ? { ...record, values: reservedRecord.values }
        : record;
      const product = productRecordToCommerceProduct(workingRecord);
      if (reservationsEnabled && !product.inventory.inStock) {
        return errorResponse(409, 'PRODUCT_OUT_OF_STOCK', `${product.title} is out of stock`, requestId, { productId: product.id, slug: product.slug });
      }

      const variant = selectProductVariant(product, item);
      if ((item.variantId || item.variantSku) && !variant) {
        return errorResponse(404, 'VARIANT_NOT_FOUND', 'Product variant not found', requestId, { item, productId: product.id, slug: product.slug });
      }
      if (reservationsEnabled && variant && !variant.inStock) {
        return errorResponse(409, 'VARIANT_OUT_OF_STOCK', `${variant.title} is out of stock`, requestId, { productId: product.id, slug: product.slug, variantId: variant.id });
      }

      if (reservationsEnabled) {
        const reservation = reserveInventoryForCheckoutItem(workingRecord, product, item, quantity);
        if (reservation.error) {
          return errorResponse(409, reservation.error.code, reservation.error.message, requestId, reservation.error.details);
        }
        if (reservation.values) {
          inventoryReservations.set(record.id, {
            record: workingRecord,
            originalValues: reservedRecord?.originalValues || record.values,
            values: reservation.values,
          });
        }
      }

      lineItems.push(lineItemFromProduct(product, quantity, item));
    }

    const currency = lineItems[0]?.currency || 'USD';
    const quote = calculateCheckoutQuote(lineItems, input.discountCode || '', commerce);
    if (lineItems.some((item) => item.currency !== currency)) {
      return errorResponse(409, 'MIXED_CURRENCY_CART', 'All checkout items must use the same currency', requestId, {
        currencies: Array.from(new Set(lineItems.map((item) => item.currency))),
      });
    }
    const orderNumber = buildOrderNumber();
    let slug = orderNumber.toLowerCase();
    let suffix = 2;
    while (getCollectionRecordByIdOrSlug(site.id, ordersCollection.id, slug, { includeUnpublished: true })) {
      slug = `${orderNumber.toLowerCase()}-${suffix}`;
      suffix += 1;
    }
    const orderCreatedAt = new Date().toISOString();
    const checkoutSession = buildCheckoutSessionHandoff({
      request,
      siteId: site.id,
      commerce,
      input,
      orderNumber,
      orderSlug: slug,
      quote,
      lineItems,
      requestId,
      createdAt: orderCreatedAt,
    });
    let customerProfile = upsertDemoCheckoutCustomer({
      siteId: site.id,
      input,
      orderNumber,
      orderCreatedAt,
      total: quote.total,
      requestId,
    });
    const rollbackInventoryReservations = applyDemoInventoryReservations({
      siteId: site.id,
      productsCollectionId: productsCollection.id,
      reservations: inventoryReservations.values(),
    });

    let order: NonNullable<ReturnType<typeof createAdminCollectionRecord>>;
    try {
      const createdOrder = createAdminCollectionRecord(site.id, ordersCollection.id, {
        slug,
        status: 'published',
        values: {
          ordernumber: orderNumber,
          customername: input.customer?.name || '',
          email: input.customer?.email || '',
          phone: input.customer?.phone || '',
          total: quote.total,
          subtotal: quote.subtotal,
          taxamount: quote.taxAmount,
          shippingamount: quote.shippingAmount,
          discountamount: quote.discountAmount,
          currency,
          items: JSON.stringify(lineItems, null, 2),
          ordersource: 'web',
          checkoutsessionid: checkoutSession.id,
          customerid: customerProfile?.record.id || '',
          orderstatus: 'open',
          paymentstatus: 'pending',
          paymentprovider: checkoutSession.provider,
          paymentreference: checkoutSession.reference,
          fulfillmentstatus: 'unfulfilled',
          shippingaddress: input.shippingAddress || '',
          billingaddress: input.billingAddress || '',
          notes: input.notes || '',
        },
      });

      if (!createdOrder) {
        rollbackInventoryReservations();
        return errorResponse(404, 'ORDER_QUEUE_NOT_FOUND', 'Private order queue not found', requestId);
      }
      order = createdOrder;
    } catch (error) {
      rollbackInventoryReservations();
      throw error;
    }
    customerProfile = updateDemoCheckoutCustomerOrderLink({
      siteId: site.id,
      customerProfile,
      orderId: order.id,
      orderNumber,
      orderCreatedAt,
      total: quote.total,
      requestId,
    });

    return publicContractJson({
      success: true,
      requestId,
      data: {
        schemaVersion: ORDER_CONTRACT_VERSION,
        order: {
          id: order.id,
          slug: order.slug,
          orderNumber,
          status: 'open',
          paymentStatus: 'pending',
          fulfillmentStatus: 'unfulfilled',
          total: quote.total,
          subtotal: quote.subtotal,
          taxAmount: quote.taxAmount,
          shippingAmount: quote.shippingAmount,
          discountAmount: quote.discountAmount,
          currency,
          itemCount: lineItems.reduce((sum, item) => sum + item.quantity, 0),
          createdAt: order.createdAt,
        },
        customer: customerProfile ? {
          id: customerProfile.record.id,
          slug: customerProfile.record.slug,
          existing: customerProfile.existingRecord,
        } : null,
        checkoutSession,
        quote,
        lineItems,
      },
    }, {
      status: 201,
      requestId,
      request,
      cache: 'private',
      siteId: site.id,
    });
  } catch (error) {
    console.error('Public commerce order intake API error:', error);
    return errorResponse(500, 'INTERNAL_SERVER_ERROR', 'Internal server error', requestId);
  }
}
