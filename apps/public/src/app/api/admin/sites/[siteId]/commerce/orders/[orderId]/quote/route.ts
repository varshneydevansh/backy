/**
 * Admin commerce order quote refresh endpoint.
 *
 * GET  /api/admin/sites/[siteId]/commerce/orders/[orderId]/quote
 * POST /api/admin/sites/[siteId]/commerce/orders/[orderId]/quote
 */

import { NextRequest, NextResponse } from 'next/server';
import type { BackyCollection, BackyJsonObject, BackyJsonValue } from '@backy-cms/core';
import {
  getAdminSettings,
  getCollectionByIdOrSlug,
  getCollectionRecordByIdOrSlug,
  getSiteByIdOrSlug,
  updateAdminCollectionRecord,
  validateCollectionRecordValues,
} from '@/lib/backyStore';
import { buildCommerceStorefrontContract, type CommerceStorefrontContract } from '@/lib/commerceCatalog';
import { requireAdminAccess } from '@/lib/adminAccess';
import { requireCommerceCollectionAccess } from '@/lib/adminCommerceCollectionAccess';
import { recordAdminAudit } from '@/lib/adminAudit';
import { recordSiteCacheInvalidation } from '@/lib/cacheInvalidation';
import { normalizeCollectionRecordMediaValues, validateRepositoryCollectionRecordValues } from '@/lib/collectionRecordValidation';
import { getRequiredDatabaseRepositories, shouldUseDemoStoreFallback } from '@/lib/repositoryRuntime';

export const runtime = 'nodejs';

interface RouteParams {
  params: Promise<{
    siteId: string;
    orderId: string;
  }>;
}

interface CollectionAuditSource {
  id: string;
  name: string;
  slug: string;
}

interface CollectionRecordAuditSource {
  id: string;
  collectionId: string;
  slug: string;
  status: string;
  values?: Record<string, unknown> | null;
  scheduledAt?: string | null;
  publishedAt?: string | null;
  updatedAt?: string | null;
}

interface QuoteLineItem {
  productId: string;
  slug: string;
  title: string;
  quantity: number;
  price: number;
  lineTotal: number;
  currency: string;
  taxable: boolean;
  taxClass: string;
  shippingRequired: boolean;
  shippingProfile: string;
  weight: number;
  discountCode: string;
}

interface OrderQuotePayload {
  schemaVersion: 'backy.order-quote.v1';
  subtotal: number;
  discountAmount: number;
  taxAmount: number;
  shippingAmount: number;
  total: number;
  currency: string;
  discountCode: string;
  discountRate: number;
  taxLines: Array<Record<string, unknown>>;
  shippingLines: Array<Record<string, unknown>>;
  discountLines: Array<Record<string, unknown>>;
  providerAdjustments: QuoteProviderAdjustment[];
  pricing: CommerceStorefrontContract['pricing'];
  calculatedAt: string;
}

interface QuoteProviderAdjustment {
  kind: 'tax' | 'shipping' | 'discount';
  provider: 'http';
  status: 'succeeded' | 'failed' | 'skipped';
  url?: string;
  amount?: number;
  lines?: Array<Record<string, unknown>>;
  error?: string;
  statusCode?: number;
  reference?: string;
}

const ORDERS_COLLECTION_SLUG = 'orders';

const makeRequestId = () => `req_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;

const errorResponse = (status: number, code: string, message: string, requestId: string, details?: unknown) => (
  NextResponse.json({ success: false, requestId, error: { code, message, details } }, { status })
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

const toRecord = (value: unknown): Record<string, unknown> => (
  value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {}
);

const toJsonRecord = (value: Record<string, unknown>): Record<string, BackyJsonValue> => (
  value as Record<string, BackyJsonValue>
);

const textValue = (value: unknown): string => (
  typeof value === 'string' ? value.trim() : ''
);

const numberValue = (value: unknown, fallback = 0): number => {
  const parsed = typeof value === 'number' ? value : Number.parseFloat(String(value ?? ''));
  return Number.isFinite(parsed) ? parsed : fallback;
};

const moneyValue = (value: number): number => (
  Math.round((Number.isFinite(value) ? value : 0) * 100) / 100
);

const boolValue = (value: unknown, fallback = false): boolean => {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (['true', '1', 'yes', 'on'].includes(normalized)) return true;
    if (['false', '0', 'no', 'off'].includes(normalized)) return false;
  }
  return fallback;
};

const parseItems = (value: unknown): Array<Record<string, unknown>> => {
  if (Array.isArray(value)) return value.map(toRecord);
  if (typeof value !== 'string') return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.map(toRecord) : [];
  } catch {
    return [];
  }
};

const normalizeLineItems = (record: CollectionRecordAuditSource): QuoteLineItem[] => {
  const values = toRecord(record.values);
  const currency = textValue(values.currency) || 'USD';
  return parseItems(values.items).map((item, index) => {
    const quantity = Math.max(0, Math.round(numberValue(item.quantity, 1)));
    const price = moneyValue(Math.max(0, numberValue(item.price, numberValue(item.unitPrice))));
    const lineTotal = moneyValue(numberValue(item.lineTotal, price * quantity));
    const productType = textValue(item.productType).toLowerCase();
    const shippingRequired = boolValue(item.shippingRequired, productType !== 'digital' && productType !== 'service');
    const taxable = boolValue(item.taxable, true);
    return {
      productId: textValue(item.productId) || textValue(item.id) || `line-${index + 1}`,
      slug: textValue(item.slug) || textValue(item.sku) || `line-${index + 1}`,
      title: textValue(item.title),
      quantity,
      price,
      lineTotal,
      currency: textValue(item.currency) || currency,
      taxable,
      taxClass: textValue(item.taxClass) || 'standard',
      shippingRequired,
      shippingProfile: textValue(item.shippingProfile) || 'standard',
      weight: Math.max(0, numberValue(item.weight)),
      discountCode: textValue(item.discountCode).toUpperCase(),
    };
  }).filter((item) => item.quantity > 0 && item.lineTotal > 0);
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
  if (rules.discountPercent > 0) return rules.discountPercent / 100;
  const match = code.match(/(\d{1,2})$/);
  if (!match) return code ? 0.1 : 0;
  return Math.max(0, Math.min(90, Number(match[1]))) / 100;
};

const providerUrlForKind = (settings: Record<string, unknown>, kind: QuoteProviderAdjustment['kind']): string => {
  const mode = textValue(settings[`${kind}Provider`]).toLowerCase();
  const url = textValue(settings[`${kind}ProviderUrl`]);
  if (mode !== 'http' || !url) return '';
  try {
    const parsed = new URL(url);
    return ['http:', 'https:'].includes(parsed.protocol) ? parsed.toString() : '';
  } catch {
    return '';
  }
};

const quoteProviderAmount = (payload: Record<string, unknown>, kind: QuoteProviderAdjustment['kind']): number | null => {
  const keyed = payload[`${kind}Amount`];
  const generic = payload.amount;
  const parsed = numberValue(keyed ?? generic, Number.NaN);
  return Number.isFinite(parsed) && parsed >= 0 ? moneyValue(parsed) : null;
};

const quoteProviderLines = (payload: Record<string, unknown>): Array<Record<string, unknown>> => (
  Array.isArray(payload.lines) ? payload.lines.map(toRecord) : []
);

const callQuoteProvider = async ({
  kind,
  url,
  record,
  lineItems,
  quote,
  requestId,
}: {
  kind: QuoteProviderAdjustment['kind'];
  url: string;
  record: CollectionRecordAuditSource;
  lineItems: QuoteLineItem[];
  quote: OrderQuotePayload;
  requestId: string;
}): Promise<QuoteProviderAdjustment> => {
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-backy-request-id': requestId,
        'x-backy-provider-kind': kind,
      },
      body: JSON.stringify({
        schemaVersion: 'backy.quote-provider-request.v1',
        kind,
        order: {
          id: record.id,
          slug: record.slug,
          values: record.values || {},
        },
        lineItems,
        quote,
      }),
      signal: AbortSignal.timeout(5000),
    });
    const payload = await response.json().catch(() => ({}));
    const body = toRecord(payload);
    if (!response.ok) {
      return {
        kind,
        provider: 'http',
        status: 'failed',
        url,
        statusCode: response.status,
        error: textValue(body.error) || textValue(toRecord(body.error).message) || `Provider returned HTTP ${response.status}.`,
      };
    }
    const amount = quoteProviderAmount(body, kind);
    if (amount === null) {
      return {
        kind,
        provider: 'http',
        status: 'failed',
        url,
        statusCode: response.status,
        error: 'Provider response did not include a non-negative amount.',
      };
    }
    return {
      kind,
      provider: 'http',
      status: 'succeeded',
      url,
      statusCode: response.status,
      amount,
      lines: quoteProviderLines(body),
      reference: textValue(body.reference || body.providerReference),
    };
  } catch (error) {
    return {
      kind,
      provider: 'http',
      status: 'failed',
      url,
      error: error instanceof Error ? error.message : 'Provider quote request failed.',
    };
  }
};

const collectionRecordAuditMetadata = (
  collection: CollectionAuditSource,
  record: CollectionRecordAuditSource,
): BackyJsonObject => {
  const valueKeys = Object.keys(toRecord(record.values)).sort();
  return {
    collectionId: collection.id,
    collectionName: collection.name,
    collectionSlug: collection.slug,
    recordId: record.id,
    slug: record.slug,
    status: record.status,
    valueKeys,
    valueCount: valueKeys.length,
    scheduledAt: record.scheduledAt || null,
    publishedAt: record.publishedAt || null,
  };
};

const quoteAuditMetadata = (
  collection: CollectionAuditSource,
  record: CollectionRecordAuditSource,
  quote: OrderQuotePayload,
): BackyJsonObject => ({
  ...collectionRecordAuditMetadata(collection, record),
  subtotal: quote.subtotal,
  discountAmount: quote.discountAmount,
  taxAmount: quote.taxAmount,
  shippingAmount: quote.shippingAmount,
  total: quote.total,
  currency: quote.currency,
  providerAdjustments: quote.providerAdjustments.map((item) => ({
    kind: item.kind,
    provider: item.provider,
    status: item.status,
    amount: item.amount ?? null,
    statusCode: item.statusCode ?? null,
    reference: item.reference || null,
    error: item.error || null,
  })),
});

const appendNote = (current: unknown, note: string): string => {
  const currentNotes = textValue(current);
  return currentNotes ? `${currentNotes}\n${note}` : note;
};

const commerceContractForSite = (siteId: string) => {
  const settings = getAdminSettings();
  const commerce = toRecord(toRecord(settings.integrations).commerce);
  return buildCommerceStorefrontContract({
    siteId,
    settings: commerce,
    hasCatalog: true,
    hasOrderIntake: true,
  });
};

const calculateQuote = async (
  record: CollectionRecordAuditSource,
  body: Record<string, unknown>,
  commerce: CommerceStorefrontContract,
  requestId: string,
): Promise<OrderQuotePayload> => {
  const calculatedAt = new Date().toISOString();
  const values = toRecord(record.values);
  const commerceSettings = toRecord(toRecord(getAdminSettings().integrations).commerce);
  const lineItems = normalizeLineItems(record);
  const fallbackCurrency = textValue(values.currency) || commerce.currency || 'USD';
  const subtotal = moneyValue(lineItems.reduce((sum, item) => sum + item.lineTotal, 0));
  const discountCode = (textValue(body.discountCode) || lineItems.find((item) => item.discountCode)?.discountCode || '').toUpperCase();
  const discountRate = commerce.pricing.discounts && discountCode
    ? discountPercentFromCode(discountCode, commerce.pricing.rules)
    : 0;
  const discountLines = lineItems.map((item) => {
    const eligible = Boolean(discountRate && discountCode && (!item.discountCode || item.discountCode === discountCode));
    const amount = eligible ? moneyValue(item.lineTotal * discountRate) : 0;
    return {
      productId: item.productId,
      slug: item.slug,
      code: eligible ? discountCode : '',
      rate: eligible ? discountRate : 0,
      amount,
    };
  }).filter((line) => numberValue(line.amount) > 0);
  const discountAmount = moneyValue(discountLines.reduce((sum, line) => sum + numberValue(line.amount), 0));
  const lineDiscountByProduct = new Map(discountLines.map((line) => [String(line.productId), numberValue(line.amount)]));

  const taxLines = lineItems.map((item) => {
    if (!commerce.pricing.taxes || !item.taxable) {
      return {
        productId: item.productId,
        slug: item.slug,
        taxClass: item.taxClass,
        rate: 0,
        amount: 0,
      };
    }
    const taxableAmount = Math.max(0, item.lineTotal - (lineDiscountByProduct.get(item.productId) || 0));
    const rate = taxRateForClass(item.taxClass, commerce.pricing.rules);
    return {
      productId: item.productId,
      slug: item.slug,
      taxClass: item.taxClass,
      rate,
      amount: moneyValue(taxableAmount * rate),
    };
  }).filter((line) => numberValue(line.amount) > 0 || commerce.pricing.taxes);
  const taxAmount = moneyValue(taxLines.reduce((sum, line) => sum + numberValue(line.amount), 0));

  const shippingGroups = new Map<string, { profile: string; base: number; weightTotal: number; slugs: string[] }>();
  if (commerce.pricing.shipping) {
    for (const item of lineItems) {
      if (!item.shippingRequired) continue;
      const profile = item.shippingProfile || 'standard';
      const group = shippingGroups.get(profile) || {
        profile,
        base: shippingBaseForProfile(profile, commerce.pricing.rules),
        weightTotal: 0,
        slugs: [],
      };
      group.weightTotal += Math.max(0, item.weight) * item.quantity;
      group.slugs.push(item.slug);
      shippingGroups.set(profile, group);
    }
  }
  const shippingLines = Array.from(shippingGroups.values()).map((group) => ({
    profile: group.profile,
    slugs: group.slugs,
    base: moneyValue(group.base),
    weightAmount: moneyValue(group.weightTotal * commerce.pricing.rules.shippingWeightRate),
    amount: moneyValue(group.base + group.weightTotal * commerce.pricing.rules.shippingWeightRate),
  }));
  const shippingAmount = moneyValue(shippingLines.reduce((sum, line) => sum + numberValue(line.amount), 0));

  const localQuote: OrderQuotePayload = {
    schemaVersion: 'backy.order-quote.v1',
    subtotal,
    discountAmount,
    taxAmount,
    shippingAmount,
    total: moneyValue(Math.max(0, subtotal - discountAmount + taxAmount + shippingAmount)),
    currency: lineItems[0]?.currency || fallbackCurrency,
    discountCode,
    discountRate,
    taxLines,
    shippingLines,
    discountLines,
    providerAdjustments: [],
    pricing: commerce.pricing,
    calculatedAt,
  };

  const providerAdjustments = (await Promise.all(([
    ['tax', commerce.pricing.taxes],
    ['shipping', commerce.pricing.shipping],
    ['discount', commerce.pricing.discounts],
  ] as Array<[QuoteProviderAdjustment['kind'], boolean]>).map(async ([kind, enabled]) => {
    const url = providerUrlForKind(commerceSettings, kind);
    if (!enabled || !url) {
      return null;
    }
    return callQuoteProvider({
      kind,
      url,
      record,
      lineItems,
      quote: localQuote,
      requestId,
    });
  }))).filter(Boolean) as QuoteProviderAdjustment[];

  const providerAmount = (kind: QuoteProviderAdjustment['kind'], fallback: number): number => {
    const adjustment = providerAdjustments.find((item) => item.kind === kind && item.status === 'succeeded' && typeof item.amount === 'number');
    if (!adjustment) return fallback;
    if (kind === 'discount') return moneyValue(Math.min(subtotal, Math.max(0, adjustment.amount || 0)));
    return moneyValue(Math.max(0, adjustment.amount || 0));
  };

  const providerLines = (
    kind: QuoteProviderAdjustment['kind'],
    fallback: Array<Record<string, unknown>>,
  ): Array<Record<string, unknown>> => {
    const adjustment = providerAdjustments.find((item) => item.kind === kind && item.status === 'succeeded' && item.lines && item.lines.length > 0);
    return adjustment?.lines || fallback;
  };

  const finalTaxAmount = providerAmount('tax', taxAmount);
  const finalShippingAmount = providerAmount('shipping', shippingAmount);
  const finalDiscountAmount = providerAmount('discount', discountAmount);

  return {
    ...localQuote,
    discountAmount: finalDiscountAmount,
    taxAmount: finalTaxAmount,
    shippingAmount: finalShippingAmount,
    total: moneyValue(Math.max(0, subtotal - finalDiscountAmount + finalTaxAmount + finalShippingAmount)),
    discountLines: providerLines('discount', discountLines),
    taxLines: providerLines('tax', taxLines),
    shippingLines: providerLines('shipping', shippingLines),
    providerAdjustments,
  };
};

const buildQuoteUpdate = async (
  record: CollectionRecordAuditSource,
  body: Record<string, unknown>,
  commerce: CommerceStorefrontContract,
  requestId: string,
) => {
  const values = toRecord(record.values);
  const quote = await calculateQuote(record, body, commerce, requestId);
  return {
    quote,
    values: {
      ...values,
      subtotal: quote.subtotal,
      discountamount: quote.discountAmount,
      taxamount: quote.taxAmount,
      shippingamount: quote.shippingAmount,
      total: quote.total,
      currency: quote.currency,
      notes: appendNote(values.notes, `Order quote refreshed ${quote.calculatedAt}: subtotal ${quote.subtotal.toFixed(2)}, tax ${quote.taxAmount.toFixed(2)}, shipping ${quote.shippingAmount.toFixed(2)}, discount ${quote.discountAmount.toFixed(2)}, total ${quote.total.toFixed(2)}.${quote.providerAdjustments.length > 0 ? ` Provider adjustments: ${quote.providerAdjustments.map((item) => `${item.kind}:${item.status}`).join(', ')}.` : ''}`),
    },
  };
};

export async function GET(request: NextRequest, { params }: RouteParams) {
  const requestId = request.headers.get('x-request-id') || makeRequestId();
  const access = await requireAdminAccess(request, requestId, { permission: 'commerce.view' });
  if (access instanceof NextResponse) return access;

  try {
    const { siteId, orderId } = await params;
    const commerce = commerceContractForSite(siteId);
    if (!shouldUseDemoStoreFallback()) {
      const repositories = await getRequiredDatabaseRepositories();
      const site = await repositories.sites.getById(siteId) || await repositories.sites.getBySlug(siteId);
      if (!site) return errorResponse(404, 'SITE_NOT_FOUND', 'Site not found', requestId);

      const collection = await repositories.collections.getBySlug(site.id, ORDERS_COLLECTION_SLUG);
      if (!collection) return errorResponse(404, 'ORDER_QUEUE_NOT_FOUND', 'Private order queue not found', requestId);
      const commerceAccess = await requireCommerceCollectionAccess(request, requestId, collection.slug, 'view');
      if (commerceAccess) return commerceAccess;

      const record = await repositories.collections.getRecordById(site.id, collection.id, orderId)
        || await repositories.collections.getRecordBySlug(site.id, collection.id, orderId);
      if (!record) return errorResponse(404, 'ORDER_NOT_FOUND', 'Order not found', requestId);

      return NextResponse.json({ success: true, requestId, data: { record, quote: await calculateQuote(record, {}, commerce, requestId) } });
    }

    const site = getSiteByIdOrSlug(siteId);
    if (!site) return errorResponse(404, 'SITE_NOT_FOUND', 'Site not found', requestId);

    const collection = getCollectionByIdOrSlug(site.id, ORDERS_COLLECTION_SLUG, { includeUnpublished: true });
    if (!collection) return errorResponse(404, 'ORDER_QUEUE_NOT_FOUND', 'Private order queue not found', requestId);
    const commerceAccess = await requireCommerceCollectionAccess(request, requestId, collection.slug, 'view');
    if (commerceAccess) return commerceAccess;

    const record = getCollectionRecordByIdOrSlug(site.id, collection.id, orderId, { includeUnpublished: true });
    if (!record) return errorResponse(404, 'ORDER_NOT_FOUND', 'Order not found', requestId);

    return NextResponse.json({ success: true, requestId, data: { record, quote: await calculateQuote(record, {}, commerce, requestId) } });
  } catch (error) {
    console.error('Admin order quote read API error:', error);
    return errorResponse(500, 'INTERNAL_SERVER_ERROR', 'Internal server error', requestId);
  }
}

export async function POST(request: NextRequest, { params }: RouteParams) {
  const requestId = request.headers.get('x-request-id') || makeRequestId();
  const access = await requireAdminAccess(request, requestId, { permission: 'commerce.edit' });
  if (access instanceof NextResponse) return access;

  try {
    const { siteId, orderId } = await params;
    const body = await parseJsonBody(request);
    const commerce = commerceContractForSite(siteId);

    if (!shouldUseDemoStoreFallback()) {
      const repositories = await getRequiredDatabaseRepositories();
      const site = await repositories.sites.getById(siteId) || await repositories.sites.getBySlug(siteId);
      if (!site) return errorResponse(404, 'SITE_NOT_FOUND', 'Site not found', requestId);

      const collection = await repositories.collections.getBySlug(site.id, ORDERS_COLLECTION_SLUG);
      if (!collection) return errorResponse(404, 'ORDER_QUEUE_NOT_FOUND', 'Private order queue not found', requestId);
      const commerceAccess = await requireCommerceCollectionAccess(request, requestId, collection.slug, 'edit');
      if (commerceAccess) return commerceAccess;

      const record = await repositories.collections.getRecordById(site.id, collection.id, orderId)
        || await repositories.collections.getRecordBySlug(site.id, collection.id, orderId);
      if (!record) return errorResponse(404, 'ORDER_NOT_FOUND', 'Order not found', requestId);

      const { quote, values: rawValues } = await buildQuoteUpdate(record, body, commerce, requestId);
      const values = normalizeCollectionRecordMediaValues(collection, rawValues);
      const validationErrors = await validateRepositoryCollectionRecordValues({
        repository: repositories.collections,
        mediaRepository: repositories.media,
        siteId: site.id,
        collection,
        values,
        existingValues: record.values,
        excludeRecordId: record.id,
      });
      if (validationErrors.length > 0) {
        return errorResponse(400, 'VALIDATION_ERROR', 'Quote values are invalid', requestId, validationErrors);
      }

      const updated = (await repositories.collections.updateRecord(site.id, collection.id, record.id, {
        values: toJsonRecord(values),
      })).item;
      const cacheInvalidation = await recordSiteCacheInvalidation(repositories, {
        siteId: site.id,
        scope: 'content',
        entity: 'collectionRecord',
        entityId: updated.id,
        reason: 'order-quote-refreshed',
        requestId,
      });
      await recordAdminAudit({
        repositories,
        siteId: site.id,
        entity: 'collectionRecord',
        entityId: updated.id,
        action: 'update',
        before: collectionRecordAuditMetadata(collection, record),
        after: collectionRecordAuditMetadata(collection, updated),
        metadata: quoteAuditMetadata(collection, updated, quote),
        requestId,
      });

      return NextResponse.json({ success: true, requestId, data: { record: updated, order: updated, quote, cacheInvalidation } });
    }

    const site = getSiteByIdOrSlug(siteId);
    if (!site) return errorResponse(404, 'SITE_NOT_FOUND', 'Site not found', requestId);

    const collection = getCollectionByIdOrSlug(site.id, ORDERS_COLLECTION_SLUG, { includeUnpublished: true });
    if (!collection) return errorResponse(404, 'ORDER_QUEUE_NOT_FOUND', 'Private order queue not found', requestId);
    const commerceAccess = await requireCommerceCollectionAccess(request, requestId, collection.slug, 'edit');
    if (commerceAccess) return commerceAccess;

    const record = getCollectionRecordByIdOrSlug(site.id, collection.id, orderId, { includeUnpublished: true });
    if (!record) return errorResponse(404, 'ORDER_NOT_FOUND', 'Order not found', requestId);

    const { quote, values: rawValues } = await buildQuoteUpdate(record, body, commerce, requestId);
    const values = normalizeCollectionRecordMediaValues(collection as unknown as BackyCollection, rawValues);
    const validationErrors = validateCollectionRecordValues(collection, values, {
      existingValues: record.values,
      excludeRecordId: record.id,
    });
    if (validationErrors.length > 0) {
      return errorResponse(400, 'VALIDATION_ERROR', 'Quote values are invalid', requestId, validationErrors);
    }

    const updated = updateAdminCollectionRecord(site.id, collection.id, record.id, { values });
    if (!updated) return errorResponse(404, 'ORDER_NOT_FOUND', 'Order not found', requestId);

    await recordAdminAudit({
      siteId: site.id,
      entity: 'collectionRecord',
      entityId: updated.id,
      action: 'update',
      before: collectionRecordAuditMetadata(collection, record),
      after: collectionRecordAuditMetadata(collection, updated),
      metadata: quoteAuditMetadata(collection, updated, quote),
      requestId,
    });

    return NextResponse.json({ success: true, requestId, data: { record: updated, order: updated, quote } });
  } catch (error) {
    console.error('Admin order quote refresh API error:', error);
    return errorResponse(500, 'INTERNAL_SERVER_ERROR', 'Internal server error', requestId);
  }
}
