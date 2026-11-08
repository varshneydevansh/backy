/** An owner investigation never changes the original provider outcome or authorizes a resend. */
export const DELIVERY_RECONCILIATION_EVIDENCE = ['provider-console-reviewed', 'recipient-report-reviewed', 'outcome-unavailable'] as const;
export type BackyDeliveryReconciliationEvidence = typeof DELIVERY_RECONCILIATION_EVIDENCE[number];
export interface BackyDeliveryReconciliationInput {
  expectedUpdatedAt: string;
  expectedState: 'pending' | 'uncertain';
  expectedReviewVersion: number;
  evidence: BackyDeliveryReconciliationEvidence;
  disposition: 'retain-without-resend';
  actorId: string;
  requestId: string;
}
export interface BackyDeliveryReconciliation {
  id: string; version: number; actorId: string; requestId: string; createdAt: string;
  observedUpdatedAt: string; observedState: 'pending' | 'uncertain';
  evidence: BackyDeliveryReconciliationEvidence; disposition: 'retain-without-resend';
}
export interface BackyDeliveryProviderEvidence {
  provider: 'webhook' | 'local-outbox' | 'http-endpoint' | 'resend' | 'smtp' | 'hostinger';
  observedAt: string;
  statusCode?: number;
  providerMessageId?: string;
  outboxOnly?: boolean;
}
const record = (value: unknown): Record<string, unknown> => value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
const timestamp = (value: unknown): value is string => typeof value === 'string' && value.length <= 40 && Number.isFinite(Date.parse(value)) && /Z$/.test(value);
/** Copy only verified scalar fields, never response metadata, body, headers or configuration. */
export function sanitizeDeliveryProviderEvidence(value: unknown): BackyDeliveryProviderEvidence | null {
  const source = record(value);
  if (!['webhook', 'local-outbox', 'http-endpoint', 'resend', 'smtp', 'hostinger'].includes(String(source.provider)) || !timestamp(source.observedAt)) return null;
  const result: BackyDeliveryProviderEvidence = { provider: source.provider as BackyDeliveryProviderEvidence['provider'], observedAt: source.observedAt };
  if (typeof source.statusCode === 'number' && Number.isInteger(source.statusCode) && source.statusCode >= 100 && source.statusCode <= 599) result.statusCode = source.statusCode;
  if (typeof source.providerMessageId === 'string' && /^[A-Za-z0-9_-]{1,200}$/.test(source.providerMessageId)) result.providerMessageId = source.providerMessageId;
  if (source.provider === 'local-outbox' && source.outboxOnly === true) result.outboxOnly = true;
  return result;
}
/** This validator is shared by both durable adapters; route-only validation is insufficient. */
export function isDeliveryReconciliationInput(value: unknown): value is BackyDeliveryReconciliationInput {
  const source = record(value);
  return Object.keys(source).every(key => ['expectedUpdatedAt', 'expectedState', 'expectedReviewVersion', 'evidence', 'disposition', 'actorId', 'requestId'].includes(key))
    && timestamp(source.expectedUpdatedAt)
    && ['pending', 'uncertain'].includes(String(source.expectedState))
    && Number.isSafeInteger(source.expectedReviewVersion) && Number(source.expectedReviewVersion) >= 0 && Number(source.expectedReviewVersion) < Number.MAX_SAFE_INTEGER
    && DELIVERY_RECONCILIATION_EVIDENCE.includes(source.evidence as BackyDeliveryReconciliationEvidence)
    && source.disposition === 'retain-without-resend'
    && typeof source.actorId === 'string' && source.actorId.length > 0 && source.actorId.length <= 200
    && typeof source.requestId === 'string' && source.requestId.length > 0 && source.requestId.length <= 200;
}
export function isDeliveryReconciliation(value: unknown): value is BackyDeliveryReconciliation {
  const source = record(value);
  return Object.keys(source).every(key => ['id', 'version', 'actorId', 'requestId', 'createdAt', 'observedUpdatedAt', 'observedState', 'evidence', 'disposition'].includes(key))
    && typeof source.id === 'string' && /^delivery-review-[a-f0-9-]{36}$/.test(source.id)
    && Number.isSafeInteger(source.version) && Number(source.version) > 0 && timestamp(source.createdAt)
    && isDeliveryReconciliationInput({ expectedUpdatedAt: source.observedUpdatedAt, expectedState: source.observedState, expectedReviewVersion: Number(source.version) - 1, evidence: source.evidence, disposition: source.disposition, actorId: source.actorId, requestId: source.requestId });
}
