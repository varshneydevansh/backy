/**
 * Admin commerce order shipping-label handoff endpoint.
 *
 * GET  /api/admin/sites/[siteId]/commerce/orders/[orderId]/shipping-label
 * POST /api/admin/sites/[siteId]/commerce/orders/[orderId]/shipping-label
 */

import { NextRequest, NextResponse } from 'next/server';
import type { BackyCollection, BackyJsonObject, BackyJsonValue } from '@backy-cms/core';
import {
  getCollectionByIdOrSlug,
  getCollectionRecordByIdOrSlug,
  getAdminSettings,
  getSiteByIdOrSlug,
  updateAdminCollectionRecord,
  validateCollectionRecordValues,
} from '@/lib/backyStore';
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
  return Number.isFinite(parsed) ? Math.max(0, Math.round(parsed * 100) / 100) : fallback;
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

const shippingLabelAuditMetadata = (
  collection: CollectionAuditSource,
  record: CollectionRecordAuditSource,
  label: ShippingLabelPayload,
): BackyJsonObject => ({
  ...collectionRecordAuditMetadata(collection, record),
  labelId: label.id,
  labelStatus: label.status,
  provider: label.provider,
  serviceLevel: label.serviceLevel,
  cost: label.cost,
});

const shippingLabelVoidAuditMetadata = (
  collection: CollectionAuditSource,
  record: CollectionRecordAuditSource,
  label: ShippingLabelPayload,
): BackyJsonObject => ({
  ...shippingLabelAuditMetadata(collection, record, label),
  action: 'void',
});

interface ShippingLabelPayload {
  id: string;
  status: 'draft' | 'purchased' | 'voided';
  provider: string;
  serviceLevel: string;
  url: string;
  cost: number;
  createdAt: string;
  providerPayload?: Record<string, unknown>;
}

interface EasyPostRatePayload {
  id: string;
  carrier: string;
  service: string;
  rate: number;
}

interface EasyPostLabelResult {
  ok: boolean;
  label?: {
    id: string;
    status: ShippingLabelPayload['status'];
    provider: string;
    serviceLevel: string;
    url: string;
    cost: number;
  };
  payload: Record<string, unknown>;
}

interface ShippoRatePayload {
  id: string;
  provider: string;
  serviceLevel: string;
  amount: number;
}

interface ShippoLabelResult {
  ok: boolean;
  label?: {
    id: string;
    status: ShippingLabelPayload['status'];
    provider: string;
    serviceLevel: string;
    url: string;
    cost: number;
  };
  payload: Record<string, unknown>;
}

type ShippingLabelVoidUpdateResult =
  | { label: ShippingLabelPayload; values: Record<string, unknown> }
  | { error: { status: number; code: string; message: string; details?: unknown } };

const easyPostApiKey = () => (
  process.env.BACKY_EASYPOST_API_KEY?.trim()
  || process.env.EASYPOST_API_KEY?.trim()
  || ''
);

const easyPostApiBaseUrl = () => (
  process.env.BACKY_EASYPOST_API_BASE_URL?.trim()
  || process.env.EASYPOST_API_BASE_URL?.trim()
  || 'https://api.easypost.com/v2'
).replace(/\/$/, '');

const shippoApiKey = () => (
  process.env.BACKY_SHIPPO_API_KEY?.trim()
  || process.env.SHIPPO_API_KEY?.trim()
  || ''
);

const shippoApiBaseUrl = () => (
  process.env.BACKY_SHIPPO_API_BASE_URL?.trim()
  || process.env.SHIPPO_API_BASE_URL?.trim()
  || 'https://api.goshippo.com'
).replace(/\/$/, '');

const normalizeProviderKey = (value: string): string => value.toLowerCase().replace(/[\s_-]+/g, '');

const safeProviderField = (value: unknown): string | number | boolean | null => {
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'boolean') return value;
  return null;
};

const safeProviderRecord = (value: unknown): Record<string, string | number | boolean | null> => {
  const record = toRecord(value);
  return Object.fromEntries(
    Object.entries(record)
      .map(([key, entry]) => [key, safeProviderField(entry)] as const)
      .filter(([, entry]) => entry !== null && entry !== ''),
  );
};

const hasProviderRecordFields = (value: unknown): boolean => Object.keys(safeProviderRecord(value)).length > 0;

const parseJsonRecord = (value: unknown): Record<string, unknown> => {
  if (value && typeof value === 'object' && !Array.isArray(value)) return value as Record<string, unknown>;
  const text = textValue(value);
  if (!text) return {};
  try {
    const parsed = JSON.parse(text);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : {};
  } catch {
    return {};
  }
};

const commerceSettings = (settings: unknown): Record<string, unknown> => {
  const source = toRecord(settings);
  const integrations = toRecord(source.integrations);
  return toRecord(integrations.commerce || source.commerce);
};

const nestedProviderRecord = (source: Record<string, unknown>, key: string): Record<string, unknown> => (
  parseJsonRecord(source[key])
);

const resolveEasyPostShipmentInput = (
  body: Record<string, unknown>,
  values: Record<string, unknown>,
  settings: unknown,
  fallback: {
    provider: string;
    serviceLevel: string;
  },
) => {
  const commerce = commerceSettings(settings);
  const shippingAddress = parseJsonRecord(values.shippingaddress);
  const provider = textValue(body.executionProvider)
    || textValue(body.labelProvider)
    || textValue(commerce.shippingLabelProvider)
    || textValue(body.provider)
    || fallback.provider;
  const carrier = textValue(body.carrier)
    || textValue(shippingAddress.carrier)
    || textValue(commerce.shippingDefaultCarrier)
    || fallback.provider;
  const serviceLevel = textValue(body.serviceLevel)
    || textValue(shippingAddress.serviceLevel)
    || textValue(commerce.shippingDefaultServiceLevel)
    || fallback.serviceLevel;
  const rateId = textValue(body.rateId)
    || textValue(body.easypostRateId)
    || textValue(body.shippoRateId)
    || textValue(shippingAddress.rateId)
    || textValue(commerce.shippingDefaultRateId);
  const directToAddress = hasProviderRecordFields(shippingAddress) && !shippingAddress.toAddress && !shippingAddress.fromAddress && !shippingAddress.parcel
    ? shippingAddress
    : {};

  return {
    executionProvider: provider,
    carrier,
    serviceLevel,
    rateId,
    fromAddress: hasProviderRecordFields(body.fromAddress)
      ? toRecord(body.fromAddress)
      : hasProviderRecordFields(nestedProviderRecord(shippingAddress, 'fromAddress'))
        ? nestedProviderRecord(shippingAddress, 'fromAddress')
        : parseJsonRecord(commerce.shippingOriginAddress),
    toAddress: hasProviderRecordFields(body.toAddress)
      ? toRecord(body.toAddress)
      : hasProviderRecordFields(nestedProviderRecord(shippingAddress, 'toAddress'))
        ? nestedProviderRecord(shippingAddress, 'toAddress')
        : directToAddress,
    parcel: hasProviderRecordFields(body.parcel)
      ? toRecord(body.parcel)
      : hasProviderRecordFields(nestedProviderRecord(shippingAddress, 'parcel'))
        ? nestedProviderRecord(shippingAddress, 'parcel')
        : parseJsonRecord(commerce.shippingDefaultParcel),
  };
};

const canExecuteEasyPostLabel = (input: ReturnType<typeof resolveEasyPostShipmentInput>): boolean => {
  if (normalizeProviderKey(input.executionProvider) !== 'easypost') return false;
  if (!easyPostApiKey()) return false;
  return hasProviderRecordFields(input.fromAddress)
    && hasProviderRecordFields(input.toAddress)
    && hasProviderRecordFields(input.parcel);
};

const canExecuteShippoLabel = (input: ReturnType<typeof resolveEasyPostShipmentInput>): boolean => {
  if (normalizeProviderKey(input.executionProvider) !== 'shippo') return false;
  if (!shippoApiKey()) return false;
  return hasProviderRecordFields(input.fromAddress)
    && hasProviderRecordFields(input.toAddress)
    && hasProviderRecordFields(input.parcel);
};

const safeEasyPostRatePayload = (value: unknown): EasyPostRatePayload | null => {
  const rate = toRecord(value);
  const id = textValue(rate.id);
  if (!id) return null;
  return {
    id,
    carrier: textValue(rate.carrier),
    service: textValue(rate.service),
    rate: numberValue(rate.rate),
  };
};

const safeEasyPostShipmentPayload = (value: Record<string, unknown>) => {
  const postageLabel = toRecord(value.postage_label);
  const selectedRate = safeEasyPostRatePayload(value.selected_rate);
  const rates = Array.isArray(value.rates)
    ? value.rates.map(safeEasyPostRatePayload).filter((rate): rate is EasyPostRatePayload => Boolean(rate))
    : [];

  return {
    id: textValue(value.id),
    object: textValue(value.object),
    mode: textValue(value.mode),
    status: textValue(value.status),
    trackingCode: textValue(value.tracking_code),
    refundStatus: textValue(value.refund_status),
    selectedRate,
    ratesCount: rates.length,
    postageLabel: {
      id: textValue(postageLabel.id),
      labelUrl: textValue(postageLabel.label_url),
      labelFileType: textValue(postageLabel.label_file_type),
      labelDate: textValue(postageLabel.label_date),
    },
  };
};

const safeEasyPostErrorPayload = (value: Record<string, unknown>) => {
  const error = toRecord(value.error);
  return {
    code: textValue(error.code),
    message: textValue(error.message) || textValue(value.message) || 'EasyPost label purchase failed.',
    errors: Array.isArray(error.errors) ? error.errors.slice(0, 5) : [],
  };
};

const pickEasyPostRate = (
  shipment: Record<string, unknown>,
  input: {
    rateId: string;
    carrier: string;
    serviceLevel: string;
  },
): EasyPostRatePayload | null => {
  const rates = Array.isArray(shipment.rates)
    ? shipment.rates.map(safeEasyPostRatePayload).filter((rate): rate is EasyPostRatePayload => Boolean(rate))
    : [];
  if (rates.length === 0) return null;

  const normalizedRateId = input.rateId.toLowerCase();
  const normalizedCarrier = input.carrier.toLowerCase();
  const normalizedServiceLevel = input.serviceLevel.toLowerCase();
  return rates.find((rate) => normalizedRateId && rate.id.toLowerCase() === normalizedRateId)
    || rates.find((rate) => (
      (!normalizedCarrier || rate.carrier.toLowerCase() === normalizedCarrier) &&
      (!normalizedServiceLevel || rate.service.toLowerCase() === normalizedServiceLevel)
    ))
    || [...rates].sort((a, b) => a.rate - b.rate)[0]
    || null;
};

const easyPostHeaders = () => ({
  authorization: `Basic ${Buffer.from(`${easyPostApiKey()}:`).toString('base64')}`,
  'content-type': 'application/json',
});

const easyPostRequest = async (path: string, body: Record<string, unknown>) => {
  const response = await fetch(`${easyPostApiBaseUrl()}${path}`, {
    method: 'POST',
    headers: easyPostHeaders(),
    body: JSON.stringify(body),
    cache: 'no-store',
  });
  const payload = await response.json().catch(() => ({}));
  return {
    ok: response.ok,
    payload: toRecord(payload),
  };
};

const shippoHeaders = () => ({
  authorization: `ShippoToken ${shippoApiKey()}`,
  'content-type': 'application/json',
});

const shippoRequest = async (path: string, body: Record<string, unknown>) => {
  const response = await fetch(`${shippoApiBaseUrl()}${path}`, {
    method: 'POST',
    headers: shippoHeaders(),
    body: JSON.stringify(body),
    cache: 'no-store',
  });
  const payload = await response.json().catch(() => ({}));
  return {
    ok: response.ok,
    payload: toRecord(payload),
  };
};

const safeShippoErrorPayload = (value: Record<string, unknown>) => ({
  code: textValue(value.code || value.error_code),
  message: textValue(value.message || value.detail || value.error) || 'Shippo label purchase failed.',
  messages: Array.isArray(value.messages) ? value.messages.slice(0, 5) : [],
});

const safeShippoRatePayload = (value: unknown): ShippoRatePayload | null => {
  const rate = toRecord(value);
  const serviceLevel = toRecord(rate.servicelevel);
  const id = textValue(rate.object_id || rate.id);
  if (!id) return null;
  return {
    id,
    provider: textValue(rate.provider || rate.carrier || serviceLevel.provider),
    serviceLevel: textValue(serviceLevel.token || serviceLevel.name || rate.servicelevel_token || rate.service || rate.serviceLevel),
    amount: numberValue(rate.amount || rate.amount_local),
  };
};

const safeShippoShipmentPayload = (value: Record<string, unknown>) => {
  const rates = Array.isArray(value.rates)
    ? value.rates.map(safeShippoRatePayload).filter((rate): rate is ShippoRatePayload => Boolean(rate))
    : [];

  return {
    id: textValue(value.object_id || value.id),
    objectState: textValue(value.object_state),
    status: textValue(value.status),
    test: typeof value.test === 'boolean' ? value.test : null,
    ratesCount: rates.length,
  };
};

const safeShippoTransactionPayload = (value: Record<string, unknown>) => ({
  id: textValue(value.object_id || value.id),
  objectState: textValue(value.object_state),
  status: textValue(value.status),
  test: typeof value.test === 'boolean' ? value.test : null,
  labelUrl: textValue(value.label_url),
  trackingNumber: textValue(value.tracking_number),
  trackingStatus: textValue(value.tracking_status),
  trackingUrlProvider: textValue(value.tracking_url_provider),
});

const pickShippoRate = (
  shipment: Record<string, unknown>,
  input: {
    rateId: string;
    carrier: string;
    serviceLevel: string;
  },
): ShippoRatePayload | null => {
  const rates = Array.isArray(shipment.rates)
    ? shipment.rates.map(safeShippoRatePayload).filter((rate): rate is ShippoRatePayload => Boolean(rate))
    : [];
  if (rates.length === 0) return null;

  const normalizedRateId = input.rateId.toLowerCase();
  const normalizedCarrier = input.carrier.toLowerCase();
  const normalizedServiceLevel = input.serviceLevel.toLowerCase();
  return rates.find((rate) => normalizedRateId && rate.id.toLowerCase() === normalizedRateId)
    || rates.find((rate) => (
      (!normalizedCarrier || rate.provider.toLowerCase() === normalizedCarrier) &&
      (!normalizedServiceLevel || rate.serviceLevel.toLowerCase() === normalizedServiceLevel)
    ))
    || [...rates].sort((a, b) => a.amount - b.amount)[0]
    || null;
};

const executeEasyPostVoid = async (shipmentId: string): Promise<EasyPostLabelResult> => {
  const refundResult = await easyPostRequest(`/shipments/${encodeURIComponent(shipmentId)}/refund`, {});
  if (!refundResult.ok) {
    return {
      ok: false,
      payload: {
        schemaVersion: 'backy.shipping-label.v1',
        provider: 'easypost',
        action: 'shipments.refund',
        executionMode: 'easypost-api',
        error: safeEasyPostErrorPayload(refundResult.payload),
      },
    };
  }

  return {
    ok: true,
    payload: {
      schemaVersion: 'backy.shipping-label.v1',
      provider: 'easypost',
      action: 'shipments.refund',
      executionMode: 'easypost-api',
      shipment: safeEasyPostShipmentPayload(refundResult.payload),
    },
  };
};

const executeShippoVoid = async (transactionId: string): Promise<ShippoLabelResult> => {
  const refundResult = await shippoRequest('/refunds/', {
    transaction: transactionId,
  });
  if (!refundResult.ok) {
    return {
      ok: false,
      payload: {
        schemaVersion: 'backy.shipping-label.v1',
        provider: 'shippo',
        action: 'refunds.create',
        executionMode: 'shippo-api',
        error: safeShippoErrorPayload(refundResult.payload),
      },
    };
  }

  return {
    ok: true,
    payload: {
      schemaVersion: 'backy.shipping-label.v1',
      provider: 'shippo',
      action: 'refunds.create',
      executionMode: 'shippo-api',
      refund: {
        id: textValue(refundResult.payload.object_id || refundResult.payload.id),
        status: textValue(refundResult.payload.status),
        transaction: textValue(refundResult.payload.transaction),
      },
    },
  };
};

const executeEasyPostLabel = async (input: {
  orderId: string;
  orderNumber: string;
  labelId: string;
  carrier: string;
  serviceLevel: string;
  rateId: string;
  fromAddress: Record<string, unknown>;
  toAddress: Record<string, unknown>;
  parcel: Record<string, unknown>;
}): Promise<EasyPostLabelResult> => {
  const shipmentResult = await easyPostRequest('/shipments', {
    shipment: {
      from_address: safeProviderRecord(input.fromAddress),
      to_address: safeProviderRecord(input.toAddress),
      parcel: safeProviderRecord(input.parcel),
      reference: input.orderNumber || input.orderId,
      options: {
        label_format: 'PDF',
      },
    },
  });

  if (!shipmentResult.ok) {
    return {
      ok: false,
      payload: {
        schemaVersion: 'backy.shipping-label.v1',
        provider: 'easypost',
        action: 'shipments.create',
        executionMode: 'easypost-api',
        error: safeEasyPostErrorPayload(shipmentResult.payload),
      },
    };
  }

  const shipmentId = textValue(shipmentResult.payload.id);
  const selectedRate = pickEasyPostRate(shipmentResult.payload, input);
  if (!shipmentId || !selectedRate) {
    return {
      ok: false,
      payload: {
        schemaVersion: 'backy.shipping-label.v1',
        provider: 'easypost',
        action: 'shipments.buy',
        executionMode: 'easypost-api',
        shipment: safeEasyPostShipmentPayload(shipmentResult.payload),
        error: {
          message: selectedRate ? 'EasyPost shipment id was missing.' : 'EasyPost did not return a purchasable rate.',
        },
      },
    };
  }

  const buyResult = await easyPostRequest(`/shipments/${encodeURIComponent(shipmentId)}/buy`, {
    rate: { id: selectedRate.id },
  });

  if (!buyResult.ok) {
    return {
      ok: false,
      payload: {
        schemaVersion: 'backy.shipping-label.v1',
        provider: 'easypost',
        action: 'shipments.buy',
        executionMode: 'easypost-api',
        shipment: safeEasyPostShipmentPayload(shipmentResult.payload),
        selectedRate,
        error: safeEasyPostErrorPayload(buyResult.payload),
      },
    };
  }

  const boughtShipment = safeEasyPostShipmentPayload(buyResult.payload);
  const boughtRate = boughtShipment.selectedRate || selectedRate;
  const postageLabel = toRecord(buyResult.payload.postage_label);
  const postageLabelId = textValue(postageLabel.id);
  const labelUrl = textValue(postageLabel.label_url);

  return {
    ok: true,
    label: {
      id: shipmentId || postageLabelId || input.labelId,
      status: 'purchased',
      provider: boughtRate.carrier || input.carrier || 'easypost',
      serviceLevel: boughtRate.service || input.serviceLevel || 'standard',
      url: labelUrl,
      cost: boughtRate.rate,
    },
    payload: {
      schemaVersion: 'backy.shipping-label.v1',
      provider: 'easypost',
      action: 'shipments.buy',
      executionMode: 'easypost-api',
      shipment: boughtShipment,
      selectedRate: boughtRate,
    },
  };
};

const executeShippoLabel = async (input: {
  orderId: string;
  orderNumber: string;
  labelId: string;
  carrier: string;
  serviceLevel: string;
  rateId: string;
  fromAddress: Record<string, unknown>;
  toAddress: Record<string, unknown>;
  parcel: Record<string, unknown>;
}): Promise<ShippoLabelResult> => {
  const shipmentResult = await shippoRequest('/shipments/', {
    address_from: safeProviderRecord(input.fromAddress),
    address_to: safeProviderRecord(input.toAddress),
    parcels: [safeProviderRecord(input.parcel)],
    metadata: input.orderNumber || input.orderId,
    async: false,
  });

  if (!shipmentResult.ok) {
    return {
      ok: false,
      payload: {
        schemaVersion: 'backy.shipping-label.v1',
        provider: 'shippo',
        action: 'shipments.create',
        executionMode: 'shippo-api',
        error: safeShippoErrorPayload(shipmentResult.payload),
      },
    };
  }

  const selectedRate = pickShippoRate(shipmentResult.payload, input);
  if (!selectedRate) {
    return {
      ok: false,
      payload: {
        schemaVersion: 'backy.shipping-label.v1',
        provider: 'shippo',
        action: 'transactions.create',
        executionMode: 'shippo-api',
        shipment: safeShippoShipmentPayload(shipmentResult.payload),
        error: {
          message: 'Shippo did not return a purchasable rate.',
        },
      },
    };
  }

  const transactionResult = await shippoRequest('/transactions/', {
    rate: selectedRate.id,
    label_file_type: 'PDF_4x6',
    async: false,
    metadata: input.orderNumber || input.orderId,
  });

  if (!transactionResult.ok) {
    return {
      ok: false,
      payload: {
        schemaVersion: 'backy.shipping-label.v1',
        provider: 'shippo',
        action: 'transactions.create',
        executionMode: 'shippo-api',
        shipment: safeShippoShipmentPayload(shipmentResult.payload),
        selectedRate,
        error: safeShippoErrorPayload(transactionResult.payload),
      },
    };
  }

  const transaction = safeShippoTransactionPayload(transactionResult.payload);
  const status = transaction.status.toUpperCase();
  if (status && status !== 'SUCCESS') {
    return {
      ok: false,
      payload: {
        schemaVersion: 'backy.shipping-label.v1',
        provider: 'shippo',
        action: 'transactions.create',
        executionMode: 'shippo-api',
        shipment: safeShippoShipmentPayload(shipmentResult.payload),
        selectedRate,
        transaction,
        error: {
          message: `Shippo transaction status was ${status}.`,
        },
      },
    };
  }

  return {
    ok: true,
    label: {
      id: transaction.id || input.labelId,
      status: 'purchased',
      provider: selectedRate.provider || input.carrier || 'shippo',
      serviceLevel: selectedRate.serviceLevel || input.serviceLevel || 'standard',
      url: transaction.labelUrl,
      cost: selectedRate.amount,
    },
    payload: {
      schemaVersion: 'backy.shipping-label.v1',
      provider: 'shippo',
      action: 'transactions.create',
      executionMode: 'shippo-api',
      shipment: safeShippoShipmentPayload(shipmentResult.payload),
      selectedRate,
      transaction,
    },
  };
};

const buildShippingLabelVoidUpdate = async ({
  siteId,
  origin,
  record,
  body,
}: {
  siteId: string;
  origin: string;
  record: CollectionRecordAuditSource;
  body: Record<string, unknown>;
}): Promise<ShippingLabelVoidUpdateResult> => {
  const now = new Date().toISOString();
  const values = toRecord(record.values);
  const existing = existingLabelPayload(origin, siteId, record);
  if (!existing) {
    return {
      error: {
        status: 404,
        code: 'SHIPPING_LABEL_NOT_FOUND',
        message: 'No shipping label is attached to this order.',
      },
    };
  }
  if (existing.status === 'voided') {
    return {
      label: existing,
      values,
    };
  }

  const executionProvider = textValue(body.executionProvider) || textValue(body.labelProvider) || textValue(body.provider);
  const shouldExecuteEasyPostVoid = Boolean(easyPostApiKey())
    && existing.status === 'purchased'
    && existing.id.startsWith('shp_')
    && (!executionProvider || normalizeProviderKey(executionProvider) === 'easypost');
  const shouldExecuteShippoVoid = Boolean(shippoApiKey())
    && existing.status === 'purchased'
    && normalizeProviderKey(executionProvider) === 'shippo';
  let providerPayload: Record<string, unknown> = {
    schemaVersion: 'backy.shipping-label.v1',
    action: shouldExecuteEasyPostVoid ? 'shipments.refund' : shouldExecuteShippoVoid ? 'refunds.create' : 'provider.shipping_label.void',
    provider: shouldExecuteEasyPostVoid ? 'easypost' : shouldExecuteShippoVoid ? 'shippo' : existing.provider,
    executionMode: shouldExecuteEasyPostVoid ? 'easypost-api' : shouldExecuteShippoVoid ? 'shippo-api' : 'handoff',
    orderId: record.id,
    orderNumber: textValue(values.ordernumber),
    labelId: existing.id,
  };

  if (shouldExecuteEasyPostVoid) {
    const result = await executeEasyPostVoid(existing.id);
    providerPayload = result.payload;
    if (!result.ok) {
      return {
        error: {
          status: 502,
          code: 'SHIPPING_LABEL_VOID_FAILED',
          message: 'EasyPost did not accept the shipping label void request.',
          details: result.payload,
        },
      };
    }
  }
  if (shouldExecuteShippoVoid) {
    const result = await executeShippoVoid(existing.id);
    providerPayload = result.payload;
    if (!result.ok) {
      return {
        error: {
          status: 502,
          code: 'SHIPPING_LABEL_VOID_FAILED',
          message: 'Shippo did not accept the shipping label refund request.',
          details: result.payload,
        },
      };
    }
  }

  const nextFulfillmentStatus = textValue(values.fulfillmentstatus) === 'processing'
    ? 'unfulfilled'
    : textValue(values.fulfillmentstatus) || 'unfulfilled';
  const label: ShippingLabelPayload = {
    ...existing,
    status: 'voided',
    providerPayload,
  };

  return {
    label,
    values: {
      ...values,
      fulfillmentstatus: nextFulfillmentStatus,
      shippinglabelstatus: 'voided',
      notes: appendNote(values.notes, `Shipping label voided ${now} for ${existing.provider} ${existing.serviceLevel}.`),
    },
  };
};

const buildLabelUrl = (origin: string, siteId: string, orderId: string): string => (
  `${origin.replace(/\/$/, '')}/api/admin/sites/${encodeURIComponent(siteId)}/commerce/orders/${encodeURIComponent(orderId)}/shipping-label`
);

const existingLabelPayload = (
  origin: string,
  siteId: string,
  record: CollectionRecordAuditSource,
): ShippingLabelPayload | null => {
  const values = toRecord(record.values);
  const id = textValue(values.shippinglabelid);
  const status = textValue(values.shippinglabelstatus);
  if (!id || !status || status === 'none') return null;

  return {
    id,
    status: status === 'purchased' || status === 'voided' ? status : 'draft',
    provider: textValue(values.shippinglabelprovider) || 'manual',
    serviceLevel: textValue(values.shippingservicelevel) || 'standard',
    url: textValue(values.shippinglabelurl) || buildLabelUrl(origin, siteId, record.id),
    cost: numberValue(values.shippinglabelcost),
    createdAt: textValue(values.shippinglabelcreatedat) || record.updatedAt || new Date().toISOString(),
  };
};

const appendNote = (current: unknown, note: string): string => {
  const currentNotes = textValue(current);
  return currentNotes ? `${currentNotes}\n${note}` : note;
};

const buildShippingLabelUpdate = async ({
  siteId,
  origin,
  record,
  body,
  settings,
}: {
  siteId: string;
  origin: string;
  record: CollectionRecordAuditSource;
  body: Record<string, unknown>;
  settings: unknown;
}) => {
  const now = new Date().toISOString();
  const values = toRecord(record.values);
  const existing = existingLabelPayload(origin, siteId, record);
  const reusableExisting = existing?.status === 'voided' ? null : existing;
  const requestedProvider = textValue(body.provider) || textValue(values.fulfillmentcarrier) || 'manual';
  const requestedProviderIsEasyPost = normalizeProviderKey(requestedProvider) === 'easypost';
  const requestedProviderIsShippo = normalizeProviderKey(requestedProvider) === 'shippo';
  const provider = requestedProviderIsEasyPost
    ? textValue(body.carrier) || textValue(values.fulfillmentcarrier) || 'easypost'
    : requestedProviderIsShippo
      ? textValue(body.carrier) || textValue(values.fulfillmentcarrier) || 'shippo'
    : requestedProvider;
  const serviceLevel = textValue(body.serviceLevel) || textValue(values.shippingservicelevel) || 'standard';
  const easyPostInput = resolveEasyPostShipmentInput(body, values, settings, { provider, serviceLevel });
  const executeEasyPost = canExecuteEasyPostLabel(easyPostInput);
  const shippoInput = resolveEasyPostShipmentInput(body, values, settings, { provider: 'shippo', serviceLevel });
  const executeShippo = canExecuteShippoLabel(shippoInput);
  const labelId = reusableExisting?.id || `lbl_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  const labelUrl = buildLabelUrl(origin, siteId, record.id);
  const cost = numberValue(body.cost, numberValue(values.shippinglabelcost, numberValue(values.shippingamount)));
  const currentFulfillmentStatus = textValue(values.fulfillmentstatus) || 'unfulfilled';
  const nextFulfillmentStatus = currentFulfillmentStatus === 'fulfilled' || currentFulfillmentStatus === 'cancelled'
    ? currentFulfillmentStatus
    : 'processing';
  const createdAt = reusableExisting?.createdAt || now;
  const providerPayload: Record<string, unknown> = {
    schemaVersion: 'backy.shipping-label.v1',
    provider: executeEasyPost || requestedProviderIsEasyPost ? 'easypost' : executeShippo || requestedProviderIsShippo ? 'shippo' : provider,
    action: executeEasyPost || requestedProviderIsEasyPost ? 'shipments.buy' : executeShippo || requestedProviderIsShippo ? 'transactions.create' : 'provider.shipping_label.create',
    executionMode: executeEasyPost ? 'easypost-api' : executeShippo ? 'shippo-api' : 'handoff',
    orderId: record.id,
    orderNumber: textValue(values.ordernumber),
    requestedCarrier: provider,
    requestedServiceLevel: serviceLevel,
    idempotencyKey: labelId,
  };
  let statusNote = 'handoff prepared';
  let label: ShippingLabelPayload = {
    id: labelId,
    status: 'draft',
    provider,
    serviceLevel,
    url: labelUrl,
    cost,
    createdAt,
    providerPayload,
  };

  if (executeEasyPost) {
    const result = await executeEasyPostLabel({
      orderId: record.id,
      orderNumber: textValue(values.ordernumber),
      labelId,
      carrier: easyPostInput.carrier,
      serviceLevel: easyPostInput.serviceLevel,
      rateId: easyPostInput.rateId,
      fromAddress: easyPostInput.fromAddress,
      toAddress: easyPostInput.toAddress,
      parcel: easyPostInput.parcel,
    });
    label = {
      ...label,
      ...(result.ok && result.label ? result.label : {}),
      url: result.ok && result.label?.url ? result.label.url : label.url,
      providerPayload: result.payload,
    };
    statusNote = result.ok ? 'purchased' : 'purchase failed; handoff retained';
  }
  if (executeShippo) {
    const result = await executeShippoLabel({
      orderId: record.id,
      orderNumber: textValue(values.ordernumber),
      labelId,
      carrier: shippoInput.carrier,
      serviceLevel: shippoInput.serviceLevel,
      rateId: shippoInput.rateId,
      fromAddress: shippoInput.fromAddress,
      toAddress: shippoInput.toAddress,
      parcel: shippoInput.parcel,
    });
    label = {
      ...label,
      ...(result.ok && result.label ? result.label : {}),
      url: result.ok && result.label?.url ? result.label.url : label.url,
      providerPayload: result.payload,
    };
    statusNote = result.ok ? 'purchased' : 'purchase failed; handoff retained';
  }

  return {
    label,
    values: {
      ...values,
      fulfillmentstatus: nextFulfillmentStatus,
      fulfillmentcarrier: textValue(values.fulfillmentcarrier) || provider,
      shippinglabelstatus: label.status,
      shippinglabelprovider: label.provider,
      shippinglabelid: label.id,
      shippinglabelurl: label.url,
      shippingservicelevel: label.serviceLevel,
      shippinglabelcost: label.cost,
      shippinglabelcreatedat: label.createdAt,
      notes: appendNote(values.notes, `Shipping label ${statusNote} ${now} with ${label.provider} ${label.serviceLevel}.`),
    },
  };
};

export async function GET(request: NextRequest, { params }: RouteParams) {
  const requestId = request.headers.get('x-request-id') || makeRequestId();
  const access = await requireAdminAccess(request, requestId, { permission: 'commerce.view' });
  if (access instanceof NextResponse) {
    return access;
  }

  try {
    const { siteId, orderId } = await params;
    const origin = new URL(request.url).origin;
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

      return NextResponse.json({ success: true, requestId, data: { record, label: existingLabelPayload(origin, site.id, record) } });
    }

    const site = getSiteByIdOrSlug(siteId);
    if (!site) return errorResponse(404, 'SITE_NOT_FOUND', 'Site not found', requestId);

    const collection = getCollectionByIdOrSlug(site.id, ORDERS_COLLECTION_SLUG, { includeUnpublished: true });
    if (!collection) return errorResponse(404, 'ORDER_QUEUE_NOT_FOUND', 'Private order queue not found', requestId);
    const commerceAccess = await requireCommerceCollectionAccess(request, requestId, collection.slug, 'view');
    if (commerceAccess) return commerceAccess;

    const record = getCollectionRecordByIdOrSlug(site.id, collection.id, orderId, { includeUnpublished: true });
    if (!record) return errorResponse(404, 'ORDER_NOT_FOUND', 'Order not found', requestId);

    return NextResponse.json({ success: true, requestId, data: { record, label: existingLabelPayload(origin, site.id, record) } });
  } catch (error) {
    console.error('Admin order shipping label read API error:', error);
    return errorResponse(500, 'INTERNAL_SERVER_ERROR', 'Internal server error', requestId);
  }
}

export async function POST(request: NextRequest, { params }: RouteParams) {
  const requestId = request.headers.get('x-request-id') || makeRequestId();
  const access = await requireAdminAccess(request, requestId, { permission: 'commerce.edit' });
  if (access instanceof NextResponse) {
    return access;
  }

  try {
    const { siteId, orderId } = await params;
    const origin = new URL(request.url).origin;
    const body = await parseJsonBody(request);

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

      const settings = await repositories.settings.get();
      const { label, values: rawValues } = await buildShippingLabelUpdate({ siteId: site.id, origin, record, body, settings });
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
        return errorResponse(400, 'VALIDATION_ERROR', 'Shipping label values are invalid', requestId, validationErrors);
      }

      const updated = (await repositories.collections.updateRecord(site.id, collection.id, record.id, {
        values: toJsonRecord(values),
      })).item;
      const cacheInvalidation = await recordSiteCacheInvalidation(repositories, {
        siteId: site.id,
        scope: 'content',
        entity: 'collectionRecord',
        entityId: updated.id,
        reason: 'order-shipping-label-prepared',
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
        metadata: shippingLabelAuditMetadata(collection, updated, label),
        requestId,
      });

      return NextResponse.json({ success: true, requestId, data: { record: updated, order: updated, label, cacheInvalidation } });
    }

    const site = getSiteByIdOrSlug(siteId);
    if (!site) return errorResponse(404, 'SITE_NOT_FOUND', 'Site not found', requestId);

    const collection = getCollectionByIdOrSlug(site.id, ORDERS_COLLECTION_SLUG, { includeUnpublished: true });
    if (!collection) return errorResponse(404, 'ORDER_QUEUE_NOT_FOUND', 'Private order queue not found', requestId);
    const commerceAccess = await requireCommerceCollectionAccess(request, requestId, collection.slug, 'edit');
    if (commerceAccess) return commerceAccess;

    const record = getCollectionRecordByIdOrSlug(site.id, collection.id, orderId, { includeUnpublished: true });
    if (!record) return errorResponse(404, 'ORDER_NOT_FOUND', 'Order not found', requestId);

    const settings = getAdminSettings();
    const { label, values: rawValues } = await buildShippingLabelUpdate({ siteId: site.id, origin, record, body, settings });
    const values = normalizeCollectionRecordMediaValues(collection as unknown as BackyCollection, rawValues);
    const validationErrors = validateCollectionRecordValues(collection, values, {
      existingValues: record.values,
      excludeRecordId: record.id,
    });
    if (validationErrors.length > 0) {
      return errorResponse(400, 'VALIDATION_ERROR', 'Shipping label values are invalid', requestId, validationErrors);
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
      metadata: shippingLabelAuditMetadata(collection, updated, label),
      requestId,
    });

    return NextResponse.json({ success: true, requestId, data: { record: updated, order: updated, label } });
  } catch (error) {
    console.error('Admin order shipping label create API error:', error);
    return errorResponse(500, 'INTERNAL_SERVER_ERROR', 'Internal server error', requestId);
  }
}

export async function DELETE(request: NextRequest, { params }: RouteParams) {
  const requestId = request.headers.get('x-request-id') || makeRequestId();
  const access = await requireAdminAccess(request, requestId, { permission: 'commerce.edit' });
  if (access instanceof NextResponse) {
    return access;
  }

  try {
    const { siteId, orderId } = await params;
    const origin = new URL(request.url).origin;
    const body = await parseJsonBody(request);

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

      const result = await buildShippingLabelVoidUpdate({ siteId: site.id, origin, record, body });
      if ('error' in result) {
        return errorResponse(result.error.status, result.error.code, result.error.message, requestId, result.error.details);
      }

      const values = normalizeCollectionRecordMediaValues(collection, result.values);
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
        return errorResponse(400, 'VALIDATION_ERROR', 'Shipping label values are invalid', requestId, validationErrors);
      }

      const updated = (await repositories.collections.updateRecord(site.id, collection.id, record.id, {
        values: toJsonRecord(values),
      })).item;
      const cacheInvalidation = await recordSiteCacheInvalidation(repositories, {
        siteId: site.id,
        scope: 'content',
        entity: 'collectionRecord',
        entityId: updated.id,
        reason: 'order-shipping-label-voided',
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
        metadata: shippingLabelVoidAuditMetadata(collection, updated, result.label),
        requestId,
      });

      return NextResponse.json({ success: true, requestId, data: { record: updated, order: updated, label: result.label, cacheInvalidation } });
    }

    const site = getSiteByIdOrSlug(siteId);
    if (!site) return errorResponse(404, 'SITE_NOT_FOUND', 'Site not found', requestId);

    const collection = getCollectionByIdOrSlug(site.id, ORDERS_COLLECTION_SLUG, { includeUnpublished: true });
    if (!collection) return errorResponse(404, 'ORDER_QUEUE_NOT_FOUND', 'Private order queue not found', requestId);
    const commerceAccess = await requireCommerceCollectionAccess(request, requestId, collection.slug, 'edit');
    if (commerceAccess) return commerceAccess;

    const record = getCollectionRecordByIdOrSlug(site.id, collection.id, orderId, { includeUnpublished: true });
    if (!record) return errorResponse(404, 'ORDER_NOT_FOUND', 'Order not found', requestId);

    const result = await buildShippingLabelVoidUpdate({ siteId: site.id, origin, record, body });
    if ('error' in result) {
      return errorResponse(result.error.status, result.error.code, result.error.message, requestId, result.error.details);
    }

    const values = normalizeCollectionRecordMediaValues(collection as unknown as BackyCollection, result.values);
    const validationErrors = validateCollectionRecordValues(collection, values, {
      existingValues: record.values,
      excludeRecordId: record.id,
    });
    if (validationErrors.length > 0) {
      return errorResponse(400, 'VALIDATION_ERROR', 'Shipping label values are invalid', requestId, validationErrors);
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
      metadata: shippingLabelVoidAuditMetadata(collection, updated, result.label),
      requestId,
    });

    return NextResponse.json({ success: true, requestId, data: { record: updated, order: updated, label: result.label } });
  } catch (error) {
    console.error('Admin order shipping label void API error:', error);
    return errorResponse(500, 'INTERNAL_SERVER_ERROR', 'Internal server error', requestId);
  }
}
