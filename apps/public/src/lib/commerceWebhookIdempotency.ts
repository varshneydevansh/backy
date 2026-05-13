import type { BackyAuditLogEntry, BackyRepositories } from '@backy-cms/core';

export const COMMERCE_WEBHOOK_AUDIT_ACTION = 'commerce-webhook';
const COMMERCE_WEBHOOK_AUDIT_PAGE_SIZE = 100;
const PROCESSED_WEBHOOK_STATUSES = new Set(['succeeded', 'duplicate']);

type AuditLogRepositories = Pick<BackyRepositories, 'auditLogs'>;

export interface CommerceWebhookAuditCandidate {
  action?: string;
  kind?: string;
  entity?: string;
  entityId?: string;
  status?: string;
  metadata?: Record<string, unknown> | null;
}

const textValue = (value: unknown): string => (
  typeof value === 'string' ? value.trim() : ''
);

export const isProcessedCommerceWebhookAuditEvent = (
  event: CommerceWebhookAuditCandidate,
  input: { providerEventId: string; orderId?: string },
): boolean => {
  const providerEventId = textValue(input.providerEventId);
  if (!providerEventId) return false;

  if (event.action && event.action !== COMMERCE_WEBHOOK_AUDIT_ACTION) return false;
  if (event.kind && event.kind !== COMMERCE_WEBHOOK_AUDIT_ACTION) return false;

  const metadata = event.metadata || {};
  if (textValue(metadata.providerEventId) !== providerEventId) return false;

  const orderId = textValue(input.orderId);
  if (orderId && textValue(event.entityId || metadata.orderId) !== orderId) return false;

  const status = textValue(event.status || metadata.status);
  return status ? PROCESSED_WEBHOOK_STATUSES.has(status) : true;
};

export async function findProcessedCommerceWebhookAuditEvent(
  repositories: AuditLogRepositories,
  input: { siteId: string; orderId: string; providerEventId: string },
): Promise<BackyAuditLogEntry | null> {
  const providerEventId = textValue(input.providerEventId);
  if (!providerEventId) return null;

  let offset = 0;
  do {
    const result = await repositories.auditLogs.list({
      siteId: input.siteId,
      entity: 'collectionRecord',
      entityId: input.orderId,
      action: COMMERCE_WEBHOOK_AUDIT_ACTION,
      limit: COMMERCE_WEBHOOK_AUDIT_PAGE_SIZE,
      offset,
    });
    const match = result.items.find((event) => (
      isProcessedCommerceWebhookAuditEvent(event, {
        providerEventId,
        orderId: input.orderId,
      })
    ));
    if (match) return match;
    if (!result.pagination.hasMore) break;
    offset += result.pagination.limit;
  } while (true);

  return null;
}
