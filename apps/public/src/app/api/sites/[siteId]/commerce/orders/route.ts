/**
 * Public commerce order intake endpoint.
 *
 * GET /api/sites/[siteId]/commerce/orders
 * POST /api/sites/[siteId]/commerce/orders
 */

import { NextRequest } from 'next/server';
import type { BackyJsonValue } from '@backy-cms/core';
import {
  PRODUCT_COLLECTION_SLUG,
  isCommerceSourceRecord,
  productRecordToCommerceProduct,
  type CommerceProduct,
  type CommerceSourceRecord,
} from '@/lib/commerceCatalog';
import {
  createAdminCollectionRecord,
  getCollectionByIdOrSlug,
  getCollectionRecordByIdOrSlug,
  getSiteByIdOrSlug,
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
  paymentProvider?: string;
  paymentReference?: string;
  checkoutSessionId?: string;
}

const ORDERS_COLLECTION_SLUG = 'orders';
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
    paymentProvider: textValue(body.paymentProvider),
    paymentReference: textValue(body.paymentReference),
    checkoutSessionId: textValue(body.checkoutSessionId || body.checkoutSession),
  };
};

const buildOrderNumber = () => `ORD-${Date.now().toString(36).toUpperCase()}${Math.random().toString(36).slice(2, 5).toUpperCase()}`;

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
  relatedEndpoints: {
    catalog: `/api/sites/${siteId}/commerce/catalog`,
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
  };
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

export async function GET(request: NextRequest, { params }: RouteParams) {
  const requestId = request.headers.get('x-request-id') || makeRequestId();
  const { siteId } = await params;

  return publicContractJson({
    success: true,
    requestId,
    data: orderContract(siteId),
  }, {
    requestId,
    request,
    cache: 'discovery',
    siteId,
  });
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

      const [productsCollection, ordersCollection] = await Promise.all([
        repositories.collections.getBySlug(site.id, PRODUCT_COLLECTION_SLUG),
        repositories.collections.getBySlug(site.id, ORDERS_COLLECTION_SLUG),
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

      const lineItems = [];
      const inventoryReservations = new Map<string, { record: CommerceSourceRecord; values: Record<string, unknown> }>();
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
        if (!product.inventory.inStock) {
          return errorResponse(409, 'PRODUCT_OUT_OF_STOCK', `${product.title} is out of stock`, requestId, { productId: product.id, slug: product.slug });
        }

        const variant = selectProductVariant(product, item);
        if ((item.variantId || item.variantSku) && !variant) {
          return errorResponse(404, 'VARIANT_NOT_FOUND', 'Product variant not found', requestId, { item, productId: product.id, slug: product.slug });
        }
        if (variant && !variant.inStock) {
          return errorResponse(409, 'VARIANT_OUT_OF_STOCK', `${variant.title} is out of stock`, requestId, { productId: product.id, slug: product.slug, variantId: variant.id });
        }

        const reservation = reserveInventoryForCheckoutItem(workingRecord, product, item, quantity);
        if (reservation.error) {
          return errorResponse(409, reservation.error.code, reservation.error.message, requestId, reservation.error.details);
        }
        if (reservation.values) {
          inventoryReservations.set(record.id, { record: workingRecord, values: reservation.values });
        }

        lineItems.push(lineItemFromProduct(product, quantity, item));
      }

      const currency = lineItems[0]?.currency || 'USD';
      const subtotal = moneyValue(lineItems.reduce((sum, item) => sum + item.lineTotal, 0));
      const orderNumber = buildOrderNumber();
      let slug = orderNumber.toLowerCase();
      let suffix = 2;
      while (await repositories.collections.getRecordBySlug(site.id, ordersCollection.id, slug)) {
        slug = `${orderNumber.toLowerCase()}-${suffix}`;
        suffix += 1;
      }

      const values = {
        ordernumber: orderNumber,
        customername: input.customer?.name || '',
        email: input.customer?.email || '',
        phone: input.customer?.phone || '',
        total: subtotal,
        subtotal,
        taxamount: 0,
        shippingamount: 0,
        discountamount: 0,
        currency,
        items: JSON.stringify(lineItems, null, 2),
        ordersource: 'web',
        checkoutsessionid: input.checkoutSessionId || requestId,
        customerid: '',
        orderstatus: 'open',
        paymentstatus: 'pending',
        paymentprovider: input.paymentProvider || 'manual',
        paymentreference: input.paymentReference || '',
        fulfillmentstatus: 'unfulfilled',
        shippingaddress: input.shippingAddress || '',
        billingaddress: input.billingAddress || '',
        notes: input.notes || '',
      };

      for (const reservation of inventoryReservations.values()) {
        await repositories.collections.updateRecord(site.id, productsCollection.id, reservation.record.id, {
          status: reservation.record.status,
          values: toJsonRecord(reservation.values),
        });
      }

      const order = (await repositories.collections.createRecord({
        siteId: site.id,
        collectionId: ordersCollection.id,
        slug,
        status: 'published',
        values: toJsonRecord(values),
      })).item;

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
            total: subtotal,
            currency,
            itemCount: lineItems.reduce((sum, item) => sum + item.quantity, 0),
            createdAt: order.createdAt,
          },
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

    const lineItems = [];
    const inventoryReservations = new Map<string, { record: CommerceSourceRecord; values: Record<string, unknown> }>();
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
      if (!product.inventory.inStock) {
        return errorResponse(409, 'PRODUCT_OUT_OF_STOCK', `${product.title} is out of stock`, requestId, { productId: product.id, slug: product.slug });
      }

      const variant = selectProductVariant(product, item);
      if ((item.variantId || item.variantSku) && !variant) {
        return errorResponse(404, 'VARIANT_NOT_FOUND', 'Product variant not found', requestId, { item, productId: product.id, slug: product.slug });
      }
      if (variant && !variant.inStock) {
        return errorResponse(409, 'VARIANT_OUT_OF_STOCK', `${variant.title} is out of stock`, requestId, { productId: product.id, slug: product.slug, variantId: variant.id });
      }

      const reservation = reserveInventoryForCheckoutItem(workingRecord, product, item, quantity);
      if (reservation.error) {
        return errorResponse(409, reservation.error.code, reservation.error.message, requestId, reservation.error.details);
      }
      if (reservation.values) {
        inventoryReservations.set(record.id, { record: workingRecord, values: reservation.values });
      }

      lineItems.push(lineItemFromProduct(product, quantity, item));
    }

    const currency = lineItems[0]?.currency || 'USD';
    const subtotal = moneyValue(lineItems.reduce((sum, item) => sum + item.lineTotal, 0));
    const orderNumber = buildOrderNumber();

    for (const reservation of inventoryReservations.values()) {
      updateAdminCollectionRecord(site.id, productsCollection.id, reservation.record.id, {
        status: reservation.record.status,
        values: reservation.values,
      });
    }

    const order = createAdminCollectionRecord(site.id, ordersCollection.id, {
      slug: orderNumber.toLowerCase(),
      status: 'published',
      values: {
        ordernumber: orderNumber,
        customername: input.customer?.name || '',
        email: input.customer?.email || '',
        phone: input.customer?.phone || '',
        total: subtotal,
        subtotal,
        taxamount: 0,
        shippingamount: 0,
        discountamount: 0,
        currency,
        items: JSON.stringify(lineItems, null, 2),
        ordersource: 'web',
        checkoutsessionid: input.checkoutSessionId || requestId,
        customerid: '',
        orderstatus: 'open',
        paymentstatus: 'pending',
        paymentprovider: input.paymentProvider || 'manual',
        paymentreference: input.paymentReference || '',
        fulfillmentstatus: 'unfulfilled',
        shippingaddress: input.shippingAddress || '',
        billingaddress: input.billingAddress || '',
        notes: input.notes || '',
      },
    });

    if (!order) {
      return errorResponse(404, 'ORDER_QUEUE_NOT_FOUND', 'Private order queue not found', requestId);
    }

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
          total: subtotal,
          currency,
          itemCount: lineItems.reduce((sum, item) => sum + item.quantity, 0),
          createdAt: order.createdAt,
        },
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
