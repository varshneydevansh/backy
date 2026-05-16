import { NextRequest } from 'next/server';
import { createHmac, timingSafeEqual } from 'node:crypto';
import type { BackyJsonObject, BackyJsonValue } from '@backy-cms/core';
import { PRODUCT_COLLECTION_SLUG, buildCommerceStorefrontContract } from '@/lib/commerceCatalog';
import {
  findProcessedCommerceWebhookAuditEvent,
  isProcessedCommerceWebhookAuditEvent,
} from '@/lib/commerceWebhookIdempotency';
import { recordAdminAudit } from '@/lib/adminAudit';
import { resolveRepositorySite } from '@/lib/commentRepositorySupport';
import {
  getAdminSettings,
  getCollectionByIdOrSlug,
  getSiteByIdOrSlug,
  listAuditEvents,
  listCollectionRecords,
  trackWebhookEvent,
  updateAdminCollectionRecord,
} from '@/lib/backyStore';
import { publicContractJson } from '@/lib/publicContractResponse';
import { getRequiredDatabaseRepositories, shouldUseDemoStoreFallback } from '@/lib/repositoryRuntime';
import { resolveCommerceWebhookSecret } from '@/lib/commerceWebhookSecrets';
import {
  applyDemoOrderInventoryRestore,
  applyRepositoryOrderInventoryRestore,
} from '@/lib/orderInventoryRestore';

interface RouteParams {
  params: Promise<{
    siteId: string;
  }>;
}

const ORDERS_COLLECTION_SLUG = 'orders';
const EVENT_SCHEMA_VERSION = 'backy.commerce-webhook.v1';

const makeRequestId = () => `req_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;

const errorResponse = (status: number, code: string, message: string, requestId: string, details?: unknown) => (
  publicContractJson(
    { success: false, requestId, error: { code, message, details } },
    { status, requestId, cache: 'error' },
  )
);

const hasPublicOrderCollectionAccess = (permissions: {
  publicRead?: boolean;
  publicCreate?: boolean;
  publicUpdate?: boolean;
  publicDelete?: boolean;
} = {}) => (
  permissions.publicRead === true ||
  permissions.publicCreate === true ||
  permissions.publicUpdate === true ||
  permissions.publicDelete === true
);

const hasPrivateOrderIntake = (collection: {
  status?: string;
  permissions?: {
    publicRead?: boolean;
    publicCreate?: boolean;
    publicUpdate?: boolean;
    publicDelete?: boolean;
  };
} | null | undefined) => Boolean(
  collection &&
  collection.status === 'published' &&
  !hasPublicOrderCollectionAccess(collection.permissions),
);

const isRecord = (value: unknown): value is Record<string, unknown> => (
  Boolean(value && typeof value === 'object' && !Array.isArray(value))
);

const textValue = (value: unknown): string => (
  typeof value === 'string' ? value.trim() : ''
);

const moneyValue = (value: number): number => (
  Math.round((Number.isFinite(value) ? value : 0) * 100) / 100
);

const normalizeCurrency = (value: unknown): string => {
  const currency = textValue(value).toUpperCase();
  return /^[A-Z]{3}$/.test(currency) ? currency : 'USD';
};

const toJsonRecord = (value: Record<string, unknown>): Record<string, BackyJsonValue> => (
  value as Record<string, BackyJsonValue>
);

const parseJsonBody = (rawBody: string): Record<string, unknown> => {
  try {
    const body = JSON.parse(rawBody);
    return isRecord(body) ? body : {};
  } catch {
    return {};
  }
};

const signatureHeaderValue = (request: NextRequest): string => (
  textValue(request.headers.get('x-backy-webhook-signature') || request.headers.get('x-commerce-webhook-signature'))
);

const signatureDigest = (rawBody: string, secret: string): string => (
  createHmac('sha256', secret).update(rawBody, 'utf8').digest('hex')
);

const signatureCandidate = (header: string): string => {
  const signatures = header.split(',').map((part) => part.trim()).filter(Boolean);
  const prefixed = signatures.find((part) => part.toLowerCase().startsWith('sha256='));
  return (prefixed ? prefixed.slice('sha256='.length) : signatures[0] || '').trim().toLowerCase();
};

const verifyWebhookSignature = (rawBody: string, secret: string, header: string): boolean => {
  if (!secret) return true;
  const actual = signatureCandidate(header);
  if (!/^[a-f0-9]{64}$/.test(actual)) return false;
  const expected = signatureDigest(rawBody, secret);
  return timingSafeEqual(Buffer.from(actual, 'hex'), Buffer.from(expected, 'hex'));
};

const adyenNotificationItem = (payload: Record<string, unknown>): Record<string, unknown> => {
  if (isRecord(payload.NotificationRequestItem)) return payload.NotificationRequestItem;
  if (Array.isArray(payload.notificationItems)) {
    const first = payload.notificationItems.map((item) => (
      isRecord(item) && isRecord(item.NotificationRequestItem)
        ? item.NotificationRequestItem
        : item
    )).find(isRecord);
    return first || {};
  }
  return {};
};

const eventObject = (payload: Record<string, unknown>): Record<string, unknown> => {
  const data = isRecord(payload.data) ? payload.data : {};
  const adyenItem = adyenNotificationItem(payload);
  if (Object.keys(adyenItem).length > 0) return adyenItem;
  return isRecord(data.object) ? data.object : payload;
};

const eventType = (payload: Record<string, unknown>): string => (
  textValue(payload.type || payload.eventType || payload.eventCode || payload.kind || adyenNotificationItem(payload).eventCode)
);

const eventId = (payload: Record<string, unknown>): string => (
  textValue(payload.id || payload.eventId || payload.pspReference || adyenNotificationItem(payload).pspReference) || `commerce_evt_${Date.now().toString(36)}`
);

const metadataRecord = (object: Record<string, unknown>): Record<string, unknown> => (
  isRecord(object.metadata) ? object.metadata : {}
);

const eventSessionId = (payload: Record<string, unknown>, object: Record<string, unknown>): string => (
  textValue(object.id || object.checkoutSessionId || object.checkout_session || payload.checkoutSessionId)
);

const eventPaymentReference = (payload: Record<string, unknown>, object: Record<string, unknown>): string => (
  textValue(object.payment_intent || object.paymentIntent || object.paymentReference || object.originalReference || object.charge || payload.paymentReference)
);

const eventSubscriptionReference = (payload: Record<string, unknown>, object: Record<string, unknown>, type = ''): string => {
  const explicitReference = textValue(object.subscription || object.subscriptionId || object.subscription_id || payload.subscription || payload.subscriptionId);
  if (explicitReference) return explicitReference;
  const lowerType = type.toLowerCase();
  const objectKind = textValue(object.object).toLowerCase();
  if (lowerType.startsWith('customer.subscription.') || objectKind === 'subscription') {
    return textValue(object.id);
  }
  return '';
};

const eventInvoiceReference = (payload: Record<string, unknown>, object: Record<string, unknown>): string => (
  textValue(object.invoice || object.invoiceId || object.invoice_id || payload.invoice || payload.invoiceId)
);

const eventProviderReference = (payload: Record<string, unknown>, object: Record<string, unknown>, type = ''): string => {
  const subscriptionReference = eventSubscriptionReference(payload, object, type);
  const paymentReference = eventPaymentReference(payload, object);
  const invoiceReference = eventInvoiceReference(payload, object);
  const lowerType = type.toLowerCase();
  const mode = textValue(object.mode).toLowerCase();

  if (subscriptionReference && (lowerType.startsWith('invoice.') || lowerType.startsWith('customer.subscription.') || mode === 'subscription')) {
    return subscriptionReference;
  }
  return paymentReference || subscriptionReference || invoiceReference;
};

const eventOrderNumber = (object: Record<string, unknown>): string => {
  const metadata = metadataRecord(object);
  return textValue(metadata.orderNumber || metadata.order_number || object.orderNumber || object.merchantReference);
};

const eventOrderSlug = (object: Record<string, unknown>): string => {
  const metadata = metadataRecord(object);
  return textValue(metadata.orderSlug || metadata.order_slug || object.orderSlug);
};

const amountFromProvider = (value: unknown): number | null => {
  const amount = Number(value);
  return Number.isFinite(amount) && amount >= 0 ? moneyValue(amount / 100) : null;
};

const subscriptionLifecycleStatus = (object: Record<string, unknown>): string => (
  textValue(object.status || object.subscriptionStatus || object.subscription_status).toLowerCase()
);

const providerRefundId = (object: Record<string, unknown>, currentValues: Record<string, unknown>): string => (
  textValue(object.refund || object.refundId || object.refund_id || object.pspReference || object.id) || textValue(currentValues.providerrefundid)
);

const providerRefundReason = (object: Record<string, unknown>, fallback: string): string => (
  textValue(object.failure_reason || object.failureReason || object.reason || object.statusReason || object.status_reason) || fallback
);

const settlementForEvent = (type: string, object: Record<string, unknown>, currentValues: Record<string, unknown>) => {
  const lowerType = type.toLowerCase();
  const now = new Date().toISOString();
  const providerReference = eventProviderReference({}, object, type);
  const refundAmount = amountFromProvider(object.amount_refunded || object.amountRefunded) ?? Number(currentValues.total || 0);
  const subscriptionStatus = subscriptionLifecycleStatus(object);

  if (
    lowerType === 'checkout.session.completed' ||
    lowerType === 'payment_intent.succeeded' ||
    lowerType === 'payment.succeeded' ||
    lowerType === 'invoice.payment_succeeded' ||
    lowerType === 'invoice.paid'
  ) {
    return {
      status: 'paid' as const,
      values: {
        orderstatus: 'paid',
        paymentstatus: 'paid',
        paidat: now,
        ...(providerReference ? { paymentreference: providerReference } : {}),
      },
    };
  }

  if (
    lowerType === 'charge.refunded' ||
    lowerType === 'refund.created' ||
    lowerType === 'payment.refunded' ||
    (
      lowerType === 'refund' &&
      textValue(object.success).toLowerCase() !== 'false'
    )
  ) {
    const refundProvider = textValue(object.provider) || textValue(currentValues.paymentprovider) || 'provider';
    const refundId = providerRefundId(object, currentValues);
    const refundReason = providerRefundReason(object, 'Provider refund webhook processed.');
    return {
      status: 'refunded' as const,
      values: {
        orderstatus: 'refunded',
        paymentstatus: 'refunded',
        refundamount: moneyValue(refundAmount),
        refundreason: refundReason,
        providerrefundstatus: 'succeeded',
        providerrefundprovider: refundProvider,
        providerrefundid: refundId,
        providerrefundreference: providerReference || textValue(currentValues.providerrefundreference),
        providerrefundamount: moneyValue(refundAmount),
        providerrefundreason: refundReason,
        providerrefundrequestedat: textValue(currentValues.providerrefundrequestedat) || now,
        providerrefundcompletedat: now,
        ...(providerReference ? { paymentreference: providerReference } : {}),
      },
    };
  }

  if (
    lowerType === 'refund.failed' ||
    lowerType === 'refund.canceled' ||
    lowerType === 'refund.cancelled' ||
    lowerType === 'refund_failed' ||
    lowerType === 'payment.refund.failed' ||
    lowerType === 'charge.refund.failed' ||
    (
      lowerType === 'refund' &&
      textValue(object.success).toLowerCase() === 'false'
    )
  ) {
    const currentOrderStatus = textValue(currentValues.orderstatus);
    const currentPaymentStatus = textValue(currentValues.paymentstatus);
    const refundProvider = textValue(object.provider) || textValue(currentValues.providerrefundprovider) || textValue(currentValues.paymentprovider) || 'provider';
    const refundId = providerRefundId(object, currentValues);
    const refundReason = providerRefundReason(object, 'Provider refund failed in the payment provider.');
    return {
      status: 'refund_failed' as const,
      values: {
        ...(currentOrderStatus === 'refunded' ? { orderstatus: 'paid' } : {}),
        ...(currentPaymentStatus === 'refunded' ? { paymentstatus: 'paid' } : {}),
        providerrefundstatus: 'failed',
        providerrefundprovider: refundProvider,
        providerrefundid: refundId,
        providerrefundreference: providerReference || textValue(currentValues.providerrefundreference),
        providerrefundamount: moneyValue(refundAmount),
        providerrefundreason: refundReason,
        providerrefundrequestedat: textValue(currentValues.providerrefundrequestedat) || now,
        providerrefundcompletedat: now,
        ...(providerReference ? { paymentreference: providerReference } : {}),
      },
    };
  }

  if (
    lowerType === 'refund.requires_action' ||
    lowerType === 'payment.refund.requires_action' ||
    lowerType === 'charge.refund.requires_action' ||
    lowerType === 'refund.reversed' ||
    lowerType === 'refunded_reversed'
  ) {
    const refundProvider = textValue(object.provider) || textValue(currentValues.providerrefundprovider) || textValue(currentValues.paymentprovider) || 'provider';
    const refundId = providerRefundId(object, currentValues);
    const refundReason = providerRefundReason(object, 'Provider refund requires manual review in the payment provider.');
    return {
      status: 'refund_requires_action' as const,
      values: {
        providerrefundstatus: 'requires_action',
        providerrefundprovider: refundProvider,
        providerrefundid: refundId,
        providerrefundreference: providerReference || textValue(currentValues.providerrefundreference),
        providerrefundamount: moneyValue(refundAmount),
        providerrefundreason: refundReason,
        providerrefundrequestedat: textValue(currentValues.providerrefundrequestedat) || now,
        providerrefundcompletedat: '',
        ...(providerReference ? { paymentreference: providerReference } : {}),
      },
    };
  }

  if (
    lowerType === 'payment_intent.payment_failed' ||
    lowerType === 'checkout.session.expired' ||
    lowerType === 'payment.failed' ||
    lowerType === 'invoice.payment_failed' ||
    (
      lowerType === 'customer.subscription.updated' &&
      ['past_due', 'unpaid', 'incomplete_expired'].includes(subscriptionStatus)
    )
  ) {
    return {
      status: 'failed' as const,
      values: {
        paymentstatus: 'failed',
        ...(providerReference ? { paymentreference: providerReference } : {}),
      },
    };
  }

  if (
    lowerType === 'customer.subscription.paused' ||
    (
      lowerType === 'customer.subscription.updated' &&
      subscriptionStatus === 'paused'
    )
  ) {
    return {
      status: 'paused' as const,
      values: {
        ...(providerReference ? { paymentreference: providerReference } : {}),
      },
    };
  }

  if (
    lowerType === 'customer.subscription.resumed' ||
    (
      lowerType === 'customer.subscription.updated' &&
      ['active', 'trialing'].includes(subscriptionStatus)
    )
  ) {
    return {
      status: 'resumed' as const,
      values: {
        orderstatus: 'paid',
        paymentstatus: 'paid',
        paidat: textValue(currentValues.paidat) || now,
        ...(providerReference ? { paymentreference: providerReference } : {}),
      },
    };
  }

  if (lowerType === 'customer.subscription.trial_will_end') {
    return {
      status: 'trial_will_end' as const,
      values: {
        ...(providerReference ? { paymentreference: providerReference } : {}),
      },
    };
  }

  if (
    lowerType === 'customer.subscription.deleted' ||
    (
      lowerType === 'customer.subscription.updated' &&
      ['canceled', 'cancelled'].includes(subscriptionStatus)
    )
  ) {
    const fulfillmentStatus = textValue(currentValues.fulfillmentstatus);
    return {
      status: 'cancelled' as const,
      values: {
        orderstatus: 'cancelled',
        ...(fulfillmentStatus === 'fulfilled' ? {} : { fulfillmentstatus: 'cancelled' }),
        ...(providerReference ? { paymentreference: providerReference } : {}),
      },
    };
  }

  return null;
};

const appendSettlementNote = (notes: unknown, type: string, eventIdValue: string, status: string): string => {
  const existing = textValue(notes);
  const entry = `[${new Date().toISOString()}] Commerce webhook ${type} (${eventIdValue}) marked order ${status}.`;
  return existing ? `${existing}\n${entry}` : entry;
};

const hasProcessedEvent = (notes: unknown, eventIdValue: string): boolean => (
  Boolean(eventIdValue) && textValue(notes).includes(`(${eventIdValue})`)
);

const hasProcessedDemoWebhookEvent = (siteId: string, orderId: string, providerEventId: string): boolean => {
  let offset = 0;
  do {
    const result = listAuditEvents(siteId, {
      kind: 'commerce-webhook',
      limit: 100,
      offset,
    });
    if (result.events.some((event) => (
      isProcessedCommerceWebhookAuditEvent(event, {
        providerEventId,
        orderId,
      })
    ))) {
      return true;
    }
    if (!result.pagination.hasMore) return false;
    offset += result.pagination.limit;
  } while (true);
};

const eventAllowed = (allowlist: string[], type: string): boolean => (
  allowlist.length === 0 || allowlist.includes(type)
);

const findRepositoryOrder = async (
  repositories: Awaited<ReturnType<typeof getRequiredDatabaseRepositories>>,
  siteId: string,
  collectionId: string,
  identifiers: { sessionId: string; orderNumber: string; orderSlug: string; paymentReference: string },
) => {
  const candidates = [
    identifiers.sessionId ? { fieldKey: 'checkoutsessionid', fieldValue: identifiers.sessionId } : null,
    identifiers.orderNumber ? { fieldKey: 'ordernumber', fieldValue: identifiers.orderNumber } : null,
    identifiers.paymentReference ? { fieldKey: 'paymentreference', fieldValue: identifiers.paymentReference } : null,
  ].filter(Boolean) as Array<{ fieldKey: string; fieldValue: string }>;

  for (const candidate of candidates) {
    const result = await repositories.collections.listRecords({
      siteId,
      collectionId,
      includeUnpublished: true,
      fieldKey: candidate.fieldKey,
      fieldValue: candidate.fieldValue,
      limit: 10,
      offset: 0,
    });
    const match = result.items.find((record) => String(record.values[candidate.fieldKey] || '') === candidate.fieldValue);
    if (match) return match;
  }

  return identifiers.orderSlug
    ? repositories.collections.getRecordBySlug(siteId, collectionId, identifiers.orderSlug)
    : null;
};

const findDemoOrder = (
  siteId: string,
  collectionId: string,
  identifiers: { sessionId: string; orderNumber: string; orderSlug: string; paymentReference: string },
) => {
  const result = listCollectionRecords(siteId, collectionId, {
    includeUnpublished: true,
    limit: 1000,
    offset: 0,
  });
  return result.records.find((record) => (
    (identifiers.sessionId && String(record.values.checkoutsessionid || '') === identifiers.sessionId) ||
    (identifiers.orderNumber && String(record.values.ordernumber || '') === identifiers.orderNumber) ||
    (identifiers.paymentReference && String(record.values.paymentreference || '') === identifiers.paymentReference) ||
    (identifiers.orderSlug && record.slug === identifiers.orderSlug)
  )) || null;
};

const commerceAuditMetadata = (value: Record<string, unknown>): BackyJsonObject => value as BackyJsonObject;

export async function POST(request: NextRequest, { params }: RouteParams) {
  const requestId = request.headers.get('x-request-id') || makeRequestId();

  try {
    const { siteId } = await params;
    const rawBody = await request.text();
    const payload = parseJsonBody(rawBody);
    const type = eventType(payload);
    const object = eventObject(payload);
    const providerEventId = eventId(payload);
    const sessionId = eventSessionId(payload, object);
    const paymentReference = eventProviderReference(payload, object, type);
    const subscriptionReference = eventSubscriptionReference(payload, object, type);
    const invoiceReference = eventInvoiceReference(payload, object);
    const orderNumber = eventOrderNumber(object);
    const orderSlug = eventOrderSlug(object);

    if (!type) {
      return errorResponse(400, 'COMMERCE_WEBHOOK_EVENT_REQUIRED', 'Commerce webhook event type is required.', requestId);
    }

    if (!shouldUseDemoStoreFallback()) {
      const repositories = await getRequiredDatabaseRepositories();
      const site = await resolveRepositorySite(repositories, siteId);
      if (!site) return errorResponse(404, 'SITE_NOT_FOUND', 'Site not found', requestId);

      const [productsCollection, ordersCollection, settings] = await Promise.all([
        repositories.collections.getBySlug(site.id, PRODUCT_COLLECTION_SLUG),
        repositories.collections.getBySlug(site.id, ORDERS_COLLECTION_SLUG),
        repositories.settings.get(),
      ]);
      const commerce = buildCommerceStorefrontContract({
        siteId: site.id,
        settings: settings.integrations?.commerce,
        hasCatalog: Boolean(productsCollection?.status === 'published' && productsCollection.permissions.publicRead),
        hasOrderIntake: hasPrivateOrderIntake(ordersCollection),
      });

      if (!commerce.webhooks.eventsEnabled) {
        return errorResponse(409, 'COMMERCE_WEBHOOKS_DISABLED', 'Commerce webhook events are disabled in Settings.', requestId);
      }
      const webhookSecret = resolveCommerceWebhookSecret(settings);
      if (webhookSecret.source === 'unresolved') {
        return errorResponse(409, 'COMMERCE_WEBHOOK_SECRET_UNRESOLVED', 'Commerce webhook signing secret reference is not configured in the runtime environment.', requestId, {
          reference: webhookSecret.reference,
          envKeys: webhookSecret.envKeys,
        });
      }
      if (webhookSecret.secret && !verifyWebhookSignature(rawBody, webhookSecret.secret, signatureHeaderValue(request))) {
        return errorResponse(401, 'COMMERCE_WEBHOOK_SIGNATURE_INVALID', 'Commerce webhook signature is missing or invalid.', requestId);
      }
      if (!eventAllowed(commerce.webhooks.eventAllowlist, type)) {
        return errorResponse(409, 'COMMERCE_WEBHOOK_EVENT_NOT_ALLOWED', 'Commerce webhook event is not in the configured allowlist.', requestId, {
          type,
          allowlist: commerce.webhooks.eventAllowlist,
        });
      }
      if (!ordersCollection) return errorResponse(404, 'ORDER_QUEUE_NOT_FOUND', 'Private order queue not found.', requestId);

      const order = await findRepositoryOrder(repositories, site.id, ordersCollection.id, { sessionId, orderNumber, orderSlug, paymentReference });
      if (!order) {
        return errorResponse(404, 'COMMERCE_WEBHOOK_ORDER_NOT_FOUND', 'No private order matched the provider webhook event.', requestId, { sessionId, orderNumber, orderSlug, paymentReference });
      }
      const processedAuditEvent = await findProcessedCommerceWebhookAuditEvent(repositories, {
        siteId: site.id,
        orderId: order.id,
        providerEventId,
      });
      if (processedAuditEvent || hasProcessedEvent(order.values.notes, providerEventId)) {
        return publicContractJson({
          success: true,
          requestId,
          data: {
            schemaVersion: EVENT_SCHEMA_VERSION,
            event: { id: providerEventId, type, status: 'duplicate' },
            order: {
              id: order.id,
              slug: order.slug,
              orderNumber: order.values.ordernumber,
              orderStatus: order.values.orderstatus,
              paymentStatus: order.values.paymentstatus,
              paymentReference: order.values.paymentreference,
            },
          },
        }, { status: 200, requestId, request, cache: 'private', siteId: site.id });
      }
      const settlement = settlementForEvent(type, object, order.values);
      if (!settlement) {
        return errorResponse(422, 'COMMERCE_WEBHOOK_EVENT_UNSUPPORTED', 'Commerce webhook event is allowed but does not map to an order settlement action yet.', requestId, { type });
      }

      const nextValues = {
        ...order.values,
        ...settlement.values,
        notes: appendSettlementNote(order.values.notes, type, providerEventId, settlement.status),
      };
      let updated = (await repositories.collections.updateRecord(site.id, ordersCollection.id, order.id, {
        status: order.status,
        values: toJsonRecord(nextValues),
      })).item;
      updated = await applyRepositoryOrderInventoryRestore({
        repositories,
        siteId: site.id,
        collection: ordersCollection,
        before: order,
        after: updated,
      });

      await recordAdminAudit({
        repositories,
        siteId: site.id,
        actorId: 'commerce-webhook',
        entity: 'collectionRecord',
        entityId: order.id,
        action: 'commerce-webhook',
        before: order.values,
        after: updated.values,
        metadata: commerceAuditMetadata({
          type,
          providerEventId,
          status: 'succeeded',
          paymentStatus: settlement.status,
          orderId: order.id,
          orderNumber: String(updated.values.ordernumber || ''),
          checkoutSessionId: String(updated.values.checkoutsessionid || ''),
          paymentReference: String(updated.values.paymentreference || ''),
          subscriptionReference,
          invoiceReference,
        }),
        requestId,
      });

      return publicContractJson({
        success: true,
        requestId,
        data: {
          schemaVersion: EVENT_SCHEMA_VERSION,
          event: { id: providerEventId, type, status: settlement.status },
          order: {
            id: updated.id,
            slug: updated.slug,
            orderNumber: updated.values.ordernumber,
            orderStatus: updated.values.orderstatus,
            paymentStatus: updated.values.paymentstatus,
            paymentReference: updated.values.paymentreference,
          },
        },
      }, { status: 200, requestId, request, cache: 'private', siteId: site.id });
    }

    const site = getSiteByIdOrSlug(siteId);
    if (!site) return errorResponse(404, 'SITE_NOT_FOUND', 'Site not found', requestId);
    const settings = getAdminSettings();
    const productsCollection = getCollectionByIdOrSlug(site.id, PRODUCT_COLLECTION_SLUG);
    const ordersCollection = getCollectionByIdOrSlug(site.id, ORDERS_COLLECTION_SLUG, { includeUnpublished: true });
    const commerce = buildCommerceStorefrontContract({
      siteId: site.id,
      settings: settings.integrations?.commerce,
      hasCatalog: Boolean(productsCollection?.status === 'published' && productsCollection.permissions.publicRead),
      hasOrderIntake: hasPrivateOrderIntake(ordersCollection),
    });

    if (!commerce.webhooks.eventsEnabled) {
      return errorResponse(409, 'COMMERCE_WEBHOOKS_DISABLED', 'Commerce webhook events are disabled in Settings.', requestId);
    }
    const webhookSecret = resolveCommerceWebhookSecret(settings);
    if (webhookSecret.source === 'unresolved') {
      trackWebhookEvent({
        kind: 'commerce-webhook',
        siteId: site.id,
        target: `commerce:${type || 'unknown'}`,
        status: 'failed',
        requestId,
        reason: 'signature-secret-unresolved',
        actor: 'commerce-webhook',
        metadata: { type, providerEventId, reference: webhookSecret.reference, envKeys: webhookSecret.envKeys },
        error: 'Commerce webhook signing secret reference is not configured in the runtime environment.',
      });
      return errorResponse(409, 'COMMERCE_WEBHOOK_SECRET_UNRESOLVED', 'Commerce webhook signing secret reference is not configured in the runtime environment.', requestId, {
        reference: webhookSecret.reference,
        envKeys: webhookSecret.envKeys,
      });
    }
    if (webhookSecret.secret && !verifyWebhookSignature(rawBody, webhookSecret.secret, signatureHeaderValue(request))) {
      trackWebhookEvent({
        kind: 'commerce-webhook',
        siteId: site.id,
        target: `commerce:${type || 'unknown'}`,
        status: 'failed',
        requestId,
        reason: 'signature-invalid',
        actor: 'commerce-webhook',
        metadata: { type, providerEventId },
        error: 'Commerce webhook signature is missing or invalid.',
      });
      return errorResponse(401, 'COMMERCE_WEBHOOK_SIGNATURE_INVALID', 'Commerce webhook signature is missing or invalid.', requestId);
    }
    if (!eventAllowed(commerce.webhooks.eventAllowlist, type)) {
      return errorResponse(409, 'COMMERCE_WEBHOOK_EVENT_NOT_ALLOWED', 'Commerce webhook event is not in the configured allowlist.', requestId, {
        type,
        allowlist: commerce.webhooks.eventAllowlist,
      });
    }
    if (!ordersCollection) return errorResponse(404, 'ORDER_QUEUE_NOT_FOUND', 'Private order queue not found.', requestId);

    const order = findDemoOrder(site.id, ordersCollection.id, { sessionId, orderNumber, orderSlug, paymentReference });
    if (!order) {
      trackWebhookEvent({
        kind: 'commerce-webhook',
        siteId: site.id,
        target: `commerce:${type}`,
        status: 'failed',
        requestId,
        reason: 'order-not-found',
        actor: 'commerce-webhook',
        metadata: { type, providerEventId, sessionId, orderNumber, orderSlug, paymentReference },
        error: 'No private order matched the provider webhook event.',
      });
      return errorResponse(404, 'COMMERCE_WEBHOOK_ORDER_NOT_FOUND', 'No private order matched the provider webhook event.', requestId, { sessionId, orderNumber, orderSlug, paymentReference });
    }
    if (hasProcessedDemoWebhookEvent(site.id, order.id, providerEventId) || hasProcessedEvent(order.values.notes, providerEventId)) {
      trackWebhookEvent({
        kind: 'commerce-webhook',
        siteId: site.id,
        target: `commerce:${type}`,
        status: 'succeeded',
        requestId,
        actor: 'commerce-webhook',
        metadata: {
          type,
          providerEventId,
          orderId: order.id,
          duplicate: true,
        },
      });
      return publicContractJson({
        success: true,
        requestId,
        data: {
          schemaVersion: EVENT_SCHEMA_VERSION,
          event: { id: providerEventId, type, status: 'duplicate' },
          order: {
            id: order.id,
            slug: order.slug,
            orderNumber: order.values.ordernumber,
            orderStatus: order.values.orderstatus,
            paymentStatus: order.values.paymentstatus,
            paymentReference: order.values.paymentreference,
          },
        },
      }, { status: 200, requestId, request, cache: 'private', siteId: site.id });
    }
    const settlement = settlementForEvent(type, object, order.values);
    if (!settlement) {
      return errorResponse(422, 'COMMERCE_WEBHOOK_EVENT_UNSUPPORTED', 'Commerce webhook event is allowed but does not map to an order settlement action yet.', requestId, { type });
    }

    const nextValues = {
      ...order.values,
      ...settlement.values,
      notes: appendSettlementNote(order.values.notes, type, providerEventId, settlement.status),
    };
    const updatedRecord = updateAdminCollectionRecord(site.id, ordersCollection.id, order.id, {
      status: order.status,
      values: nextValues,
    });
    if (!updatedRecord) {
      return errorResponse(404, 'COMMERCE_WEBHOOK_ORDER_NOT_FOUND', 'Unable to update matched private order.', requestId);
    }
    const updated = applyDemoOrderInventoryRestore({
      siteId: site.id,
      collection: ordersCollection,
      before: order,
      after: updatedRecord,
    });

    trackWebhookEvent({
      kind: 'commerce-webhook',
      siteId: site.id,
      target: `commerce:${type}`,
      status: 'succeeded',
      requestId,
      actor: 'commerce-webhook',
      metadata: {
        type,
        providerEventId,
        orderId: updated.id,
        orderNumber: updated.values.ordernumber,
        checkoutSessionId: updated.values.checkoutsessionid,
        paymentReference: updated.values.paymentreference,
        subscriptionReference,
        invoiceReference,
        paymentStatus: updated.values.paymentstatus,
      },
    });

    return publicContractJson({
      success: true,
      requestId,
      data: {
        schemaVersion: EVENT_SCHEMA_VERSION,
        event: { id: providerEventId, type, status: settlement.status },
        order: {
          id: updated.id,
          slug: updated.slug,
          orderNumber: updated.values.ordernumber,
          orderStatus: updated.values.orderstatus,
          paymentStatus: updated.values.paymentstatus,
          paymentReference: updated.values.paymentreference,
        },
      },
    }, { status: 200, requestId, request, cache: 'private', siteId: site.id });
  } catch (error) {
    console.error('Commerce webhook API error:', error);
    return errorResponse(500, 'INTERNAL_SERVER_ERROR', 'Internal server error', requestId);
  }
}
