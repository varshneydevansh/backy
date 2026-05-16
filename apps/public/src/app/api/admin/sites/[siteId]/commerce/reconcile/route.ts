import { NextRequest, NextResponse } from 'next/server';
import type { BackyJsonObject, BackyJsonValue } from '@backy-cms/core';
import { requireAdminAccess } from '@/lib/adminAccess';
import { recordAdminAudit } from '@/lib/adminAudit';
import { resolveRepositorySite } from '@/lib/commentRepositorySupport';
import {
  getCollectionByIdOrSlug,
  getSiteByIdOrSlug,
  listAdminAuditLogs,
  listAuditEvents,
  listCollectionRecords,
  updateAdminCollectionRecord,
} from '@/lib/backyStore';
import { publicContractJson } from '@/lib/publicContractResponse';
import { getRequiredDatabaseRepositories, shouldUseDemoStoreFallback } from '@/lib/repositoryRuntime';
import {
  applyDemoOrderInventoryRestore,
  applyRepositoryOrderInventoryRestore,
} from '@/lib/orderInventoryRestore';

interface RouteParams {
  params: Promise<{
    siteId: string;
  }>;
}

type ReconciliationStatus = 'paid' | 'refunded' | 'failed';
type ReconciliationRunMode = 'manual' | 'scheduled';

interface CommerceReconciliationEvent {
  id: string;
  type: string;
  orderId: string;
  orderNumber: string;
  checkoutSessionId: string;
  paymentReference: string;
  paymentStatus: ReconciliationStatus;
  createdAt: string;
}

interface ReconciliationRunOptions {
  dryRun: boolean;
  limit: number;
  processedAt: string;
  runMode: ReconciliationRunMode;
  actorId: string;
}

const ORDERS_COLLECTION_SLUG = 'orders';
const RECONCILIATION_SCHEMA_VERSION = 'backy.commerce-reconciliation.v1';

const makeRequestId = () => `req_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;

const errorResponse = (status: number, code: string, message: string, requestId: string, details?: unknown) => (
  publicContractJson(
    { success: false, requestId, error: { code, message, details } },
    { status, requestId, cache: 'error' },
  )
);

const isRecord = (value: unknown): value is Record<string, unknown> => (
  Boolean(value && typeof value === 'object' && !Array.isArray(value))
);

const textValue = (value: unknown): string => (
  typeof value === 'string' ? value.trim() : ''
);

const toJsonRecord = (value: Record<string, unknown>): Record<string, BackyJsonValue> => (
  value as Record<string, BackyJsonValue>
);

const auditMetadata = (value: Record<string, unknown>): BackyJsonObject => value as BackyJsonObject;

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

const normalizeLimit = (raw: string | null): number => {
  const limit = Number.parseInt(raw || '100', 10);
  return Number.isFinite(limit) ? Math.max(1, Math.min(500, limit)) : 100;
};

const normalizeRunMode = (value: unknown): ReconciliationRunMode => (
  textValue(value) === 'scheduled' ? 'scheduled' : 'manual'
);

const normalizeDryRun = (value: unknown): boolean => (
  value === true || textValue(value).toLowerCase() === 'true'
);

const mapPaymentStatus = (value: unknown): ReconciliationStatus | null => {
  const status = textValue(value).toLowerCase();
  return status === 'paid' || status === 'refunded' || status === 'failed' ? status : null;
};

const orderValuesForStatus = (status: ReconciliationStatus, event: CommerceReconciliationEvent, currentValues: Record<string, unknown>) => {
  const note = `[${new Date().toISOString()}] Commerce reconciliation applied ${event.type} (${event.id}) as ${status}.`;
  const existingNotes = textValue(currentValues.notes);
  return {
    ...(status === 'paid' ? {
      orderstatus: 'paid',
      paymentstatus: 'paid',
      paidat: currentValues.paidat || event.createdAt || new Date().toISOString(),
    } : {}),
    ...(status === 'refunded' ? {
      orderstatus: 'refunded',
      paymentstatus: 'refunded',
      refundreason: currentValues.refundreason || 'Provider refund reconciled from commerce webhook activity.',
    } : {}),
    ...(status === 'failed' ? {
      paymentstatus: 'failed',
    } : {}),
    ...(event.paymentReference ? { paymentreference: event.paymentReference } : {}),
    notes: existingNotes ? `${existingNotes}\n${note}` : note,
  };
};

const mapAdminAuditEvent = (entry: {
  id: string;
  action: string;
  metadata?: Record<string, unknown>;
  createdAt: string;
}): CommerceReconciliationEvent | null => {
  if (entry.action !== 'commerce-webhook' || !isRecord(entry.metadata)) return null;
  const status = mapPaymentStatus(entry.metadata.paymentStatus || entry.metadata.status);
  if (!status) return null;

  return {
    id: textValue(entry.metadata.providerEventId) || entry.id,
    type: textValue(entry.metadata.type),
    orderId: textValue(entry.metadata.orderId),
    orderNumber: textValue(entry.metadata.orderNumber),
    checkoutSessionId: textValue(entry.metadata.checkoutSessionId),
    paymentReference: textValue(entry.metadata.paymentReference),
    paymentStatus: status,
    createdAt: entry.createdAt,
  };
};

const mapInteractionEvent = (entry: {
  id: string;
  metadata?: Record<string, unknown>;
  createdAt: string;
}): CommerceReconciliationEvent | null => {
  if (!isRecord(entry.metadata)) return null;
  const status = mapPaymentStatus(entry.metadata.paymentStatus);
  if (!status) return null;

  return {
    id: textValue(entry.metadata.providerEventId) || entry.id,
    type: textValue(entry.metadata.type),
    orderId: textValue(entry.metadata.orderId),
    orderNumber: textValue(entry.metadata.orderNumber),
    checkoutSessionId: textValue(entry.metadata.checkoutSessionId),
    paymentReference: textValue(entry.metadata.paymentReference),
    paymentStatus: status,
    createdAt: entry.createdAt,
  };
};

const isOrderMatchedByEvent = (
  record: { id: string; slug: string; values: Record<string, unknown> },
  event: CommerceReconciliationEvent,
) => (
  (event.orderId && record.id === event.orderId) ||
  (event.orderNumber && String(record.values.ordernumber || '') === event.orderNumber) ||
  (event.checkoutSessionId && String(record.values.checkoutsessionid || '') === event.checkoutSessionId) ||
  (event.paymentReference && String(record.values.paymentreference || '') === event.paymentReference)
);

const newestEventsFirst = (events: CommerceReconciliationEvent[]): CommerceReconciliationEvent[] => (
  [...events].sort((left, right) => {
    const leftTime = Date.parse(left.createdAt) || 0;
    const rightTime = Date.parse(right.createdAt) || 0;
    return rightTime - leftTime;
  })
);

const reconcileValues = (
  record: { id: string; slug: string; values: Record<string, unknown> },
  event: CommerceReconciliationEvent,
) => {
  const currentPaymentStatus = textValue(record.values.paymentstatus).toLowerCase();
  const currentReference = textValue(record.values.paymentreference);
  if (currentPaymentStatus === event.paymentStatus && (!event.paymentReference || currentReference === event.paymentReference)) {
    return null;
  }

  return {
    ...record.values,
    ...orderValuesForStatus(event.paymentStatus, event, record.values),
  };
};

async function handleCommerceReconciliation(
  request: NextRequest,
  { params }: RouteParams,
  defaultBody?: Record<string, unknown>,
) {
  const requestId = request.headers.get('x-request-id') || makeRequestId();
  const access = await requireAdminAccess(request, requestId, { permission: 'commerce.configure' });
  if (access instanceof NextResponse) {
    return access;
  }

  try {
    const { siteId } = await params;
    const url = new URL(request.url);
    const body = defaultBody || await parseJsonBody(request);
    const runMode = normalizeRunMode(body.runMode ?? url.searchParams.get('runMode'));
    const runOptions: ReconciliationRunOptions = {
      dryRun: normalizeDryRun(body.dryRun ?? url.searchParams.get('dryRun')),
      limit: normalizeLimit(url.searchParams.get('limit')),
      processedAt: new Date().toISOString(),
      runMode,
      actorId: textValue(body.actor) || (
        runMode === 'scheduled'
          ? 'scheduled-commerce-reconciliation'
          : access.session?.user.id || 'admin-api'
      ),
    };

    if (!shouldUseDemoStoreFallback()) {
      const repositories = await getRequiredDatabaseRepositories();
      const site = await resolveRepositorySite(repositories, siteId);
      if (!site) return errorResponse(404, 'SITE_NOT_FOUND', 'Site not found', requestId);
      const ordersCollection = await repositories.collections.getBySlug(site.id, ORDERS_COLLECTION_SLUG);
      if (!ordersCollection) return errorResponse(404, 'ORDER_QUEUE_NOT_FOUND', 'Private order queue not found', requestId);

      const [recordsResult, eventsResult] = await Promise.all([
        repositories.collections.listRecords({
          siteId: site.id,
          collectionId: ordersCollection.id,
          includeUnpublished: true,
          limit: 1000,
          offset: 0,
        }),
        repositories.auditLogs.list({
          siteId: site.id,
          action: 'commerce-webhook',
          limit: runOptions.limit,
          offset: 0,
        }),
      ]);
      const events = eventsResult.items.map(mapAdminAuditEvent).filter(Boolean) as CommerceReconciliationEvent[];
      const updates = [];
      const unmatchedEvents = [];

      const processedOrderIds = new Set<string>();
      for (const event of newestEventsFirst(events)) {
        const record = recordsResult.items.find((candidate) => isOrderMatchedByEvent(candidate, event));
        if (!record) {
          unmatchedEvents.push(event);
          continue;
        }
        if (processedOrderIds.has(record.id)) continue;
        processedOrderIds.add(record.id);
        const nextValues = reconcileValues(record, event);
        if (!nextValues) continue;
        if (runOptions.dryRun) {
          updates.push({
            orderId: record.id,
            orderNumber: record.values.ordernumber,
            paymentStatus: nextValues.paymentstatus,
            eventId: event.id,
          });
          continue;
        }
        let updated = (await repositories.collections.updateRecord(site.id, ordersCollection.id, record.id, {
          status: record.status,
          values: toJsonRecord(nextValues),
        })).item;
        updated = await applyRepositoryOrderInventoryRestore({
          repositories,
          siteId: site.id,
          collection: ordersCollection,
          before: record,
          after: updated,
        });
        updates.push({
          orderId: updated.id,
          orderNumber: updated.values.ordernumber,
          paymentStatus: updated.values.paymentstatus,
          eventId: event.id,
        });
      }

      if (!runOptions.dryRun) {
        await recordAdminAudit({
          repositories,
          siteId: site.id,
          actorId: runOptions.actorId,
          entity: 'collection',
          entityId: ordersCollection.id,
          action: 'commerce-reconcile',
          metadata: auditMetadata({
            schemaVersion: RECONCILIATION_SCHEMA_VERSION,
            runMode: runOptions.runMode,
            dryRun: runOptions.dryRun,
            limit: runOptions.limit,
            processedAt: runOptions.processedAt,
            eventCount: events.length,
            eligibleUpdateCount: updates.length,
            updatedCount: updates.length,
            unmatchedCount: unmatchedEvents.length,
          }),
          requestId,
        });
      }

      return publicContractJson({
        success: true,
        requestId,
        data: {
          schemaVersion: RECONCILIATION_SCHEMA_VERSION,
          runMode: runOptions.runMode,
          dryRun: runOptions.dryRun,
          processedAt: runOptions.processedAt,
          limit: runOptions.limit,
          eventCount: events.length,
          eligibleUpdateCount: updates.length,
          updatedCount: runOptions.dryRun ? 0 : updates.length,
          unmatchedCount: unmatchedEvents.length,
          updates,
          unmatchedEvents,
        },
      }, { status: 200, requestId, request, cache: 'private', siteId: site.id });
    }

    const site = getSiteByIdOrSlug(siteId);
    if (!site) return errorResponse(404, 'SITE_NOT_FOUND', 'Site not found', requestId);
    const ordersCollection = getCollectionByIdOrSlug(site.id, ORDERS_COLLECTION_SLUG, { includeUnpublished: true });
    if (!ordersCollection) return errorResponse(404, 'ORDER_QUEUE_NOT_FOUND', 'Private order queue not found', requestId);

    const records = listCollectionRecords(site.id, ordersCollection.id, {
      includeUnpublished: true,
      limit: 1000,
      offset: 0,
    }).records;
    const webhookEvents = listAuditEvents(site.id, {
      kind: 'commerce-webhook',
      limit: runOptions.limit,
      offset: 0,
    }).events;
    const adminEvents = listAdminAuditLogs({
      siteId: site.id,
      action: 'commerce-webhook',
      limit: runOptions.limit,
      offset: 0,
    }).items;
    const events = [
      ...webhookEvents.map(mapInteractionEvent),
      ...adminEvents.map(mapAdminAuditEvent),
    ].filter(Boolean) as CommerceReconciliationEvent[];
    const uniqueEvents = events.filter((event, index, all) => all.findIndex((candidate) => candidate.id === event.id) === index);
    const updates = [];
    const unmatchedEvents = [];

    const processedOrderIds = new Set<string>();
    for (const event of newestEventsFirst(uniqueEvents)) {
      const record = records.find((candidate) => isOrderMatchedByEvent(candidate, event));
      if (!record) {
        unmatchedEvents.push(event);
        continue;
      }
      if (processedOrderIds.has(record.id)) continue;
      processedOrderIds.add(record.id);
      const nextValues = reconcileValues(record, event);
      if (!nextValues) continue;
      if (runOptions.dryRun) {
        updates.push({
          orderId: record.id,
          orderNumber: record.values.ordernumber,
          paymentStatus: nextValues.paymentstatus,
          eventId: event.id,
        });
        continue;
      }
      const updatedRecord = updateAdminCollectionRecord(site.id, ordersCollection.id, record.id, {
        status: record.status,
        values: nextValues,
      });
      if (!updatedRecord) continue;
      const updated = applyDemoOrderInventoryRestore({
        siteId: site.id,
        collection: ordersCollection,
        before: record,
        after: updatedRecord,
      });
      updates.push({
        orderId: updated.id,
        orderNumber: updated.values.ordernumber,
        paymentStatus: updated.values.paymentstatus,
        eventId: event.id,
      });
    }

    if (!runOptions.dryRun) {
      await recordAdminAudit({
        siteId: site.id,
        actorId: runOptions.actorId,
        entity: 'collection',
        entityId: ordersCollection.id,
        action: 'commerce-reconcile',
        metadata: auditMetadata({
          schemaVersion: RECONCILIATION_SCHEMA_VERSION,
          runMode: runOptions.runMode,
          dryRun: runOptions.dryRun,
          limit: runOptions.limit,
          processedAt: runOptions.processedAt,
          eventCount: uniqueEvents.length,
          eligibleUpdateCount: updates.length,
          updatedCount: updates.length,
          unmatchedCount: unmatchedEvents.length,
        }),
        requestId,
      });
    }

    return publicContractJson({
      success: true,
      requestId,
      data: {
        schemaVersion: RECONCILIATION_SCHEMA_VERSION,
        runMode: runOptions.runMode,
        dryRun: runOptions.dryRun,
        processedAt: runOptions.processedAt,
        limit: runOptions.limit,
        eventCount: uniqueEvents.length,
        eligibleUpdateCount: updates.length,
        updatedCount: runOptions.dryRun ? 0 : updates.length,
        unmatchedCount: unmatchedEvents.length,
        updates,
        unmatchedEvents,
      },
    }, { status: 200, requestId, request, cache: 'private', siteId: site.id });
  } catch (error) {
    console.error('Commerce reconciliation API error:', error);
    return errorResponse(500, 'INTERNAL_SERVER_ERROR', 'Internal server error', requestId);
  }
}

export async function POST(request: NextRequest, context: RouteParams) {
  return handleCommerceReconciliation(request, context);
}

export async function GET(request: NextRequest, context: RouteParams) {
  return handleCommerceReconciliation(request, context, {
    actor: request.headers.get('x-backy-actor') || 'scheduled-commerce-reconciliation',
    dryRun: request.nextUrl.searchParams.get('dryRun') || false,
    runMode: 'scheduled',
  });
}
