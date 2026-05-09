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
} from '@/lib/commerceCatalog';
import {
  createAdminCollectionRecord,
  getCollectionByIdOrSlug,
  getCollectionRecordByIdOrSlug,
  getSiteByIdOrSlug,
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
      items: [{ slug: 'product-slug', quantity: 1 }],
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

const lineItemFromProduct = (product: CommerceProduct, quantity: number) => ({
  productId: product.id,
  slug: product.slug,
  title: product.title,
  sku: product.sku,
  quantity,
  price: product.price,
  currency: product.currency,
  lineTotal: moneyValue(product.price * quantity),
  productType: product.productType,
  checkoutUrl: product.checkout.url,
});

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
      for (const item of input.items || []) {
        const quantity = Math.max(1, Math.floor(Number(item.quantity || 1)));
        const record = textValue(item.productId)
          ? await repositories.collections.getRecordById(site.id, productsCollection.id, textValue(item.productId))
          : await repositories.collections.getRecordBySlug(site.id, productsCollection.id, textValue(item.slug));

        if (!isCommerceSourceRecord(record)) {
          return errorResponse(404, 'PRODUCT_NOT_FOUND', 'Product not found', requestId, { item });
        }

        const product = productRecordToCommerceProduct(record);
        if (!product.inventory.inStock) {
          return errorResponse(409, 'PRODUCT_OUT_OF_STOCK', `${product.title} is out of stock`, requestId, { productId: product.id, slug: product.slug });
        }

        lineItems.push(lineItemFromProduct(product, quantity));
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

      const product = productRecordToCommerceProduct(record);
      if (!product.inventory.inStock) {
        return errorResponse(409, 'PRODUCT_OUT_OF_STOCK', `${product.title} is out of stock`, requestId, { productId: product.id, slug: product.slug });
      }

      lineItems.push(lineItemFromProduct(product, quantity));
    }

    const currency = lineItems[0]?.currency || 'USD';
    const subtotal = moneyValue(lineItems.reduce((sum, item) => sum + item.lineTotal, 0));
    const orderNumber = buildOrderNumber();
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
