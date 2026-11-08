import type { BackyClient, BackyDeliveryReconciliationInput, GeneratedBackyOpenApiOperationId } from '../src/index';
declare const client: BackyClient;
const input: BackyDeliveryReconciliationInput = { expectedUpdatedAt: '2026-10-08T00:00:00.000Z', expectedState: 'pending', expectedReviewVersion: 0, evidence: 'outcome-unavailable', disposition: 'retain-without-resend' };
client.reconcileCommentDelivery('comment', 'attempt', input).then(response => {
  const version: number = response.data.attempt.reconciliationVersion;
  const timestamp: string = response.data.attempt.updatedAt;
  const state: 'pending' | 'succeeded' | 'failed' | 'uncertain' = response.data.attempt.status;
  const disposition: 'retain-without-resend' = response.data.reconciliation.disposition;
  const warning: 'DELIVERY_RECONCILIATION_AUDIT_PENDING' = response.data.completionWarnings[0].code;
  void [version, timestamp, state, disposition, warning];
});
client.reconcileFormDelivery('form', 'submission', 'attempt', input).then(response => {
  const actor: string = response.data.reconciliation.actorId;
  const observed: 'pending' | 'uncertain' = response.data.reconciliation.observedState;
  const evidence: 'provider-console-reviewed' | 'recipient-report-reviewed' | 'outcome-unavailable' = response.data.reconciliation.evidence;
  const reviewVersion: number = response.data.attempt.reconciliations[0].version;
  void [actor, observed, evidence, reviewVersion];
});
// @ts-expect-error The request cannot authorize success or resend.
const invalidDisposition: BackyDeliveryReconciliationInput = { ...input, disposition: 'resend' };
// @ts-expect-error Only pending and uncertain snapshots may be reviewed.
const invalidState: BackyDeliveryReconciliationInput = { ...input, expectedState: 'succeeded' };
// @ts-expect-error Arbitrary evidence strings are not accepted.
const invalidEvidence: BackyDeliveryReconciliationInput = { ...input, evidence: 'delivered' };
// @ts-expect-error Actor is assigned by server.
const invalidActor: BackyDeliveryReconciliationInput = { ...input, actorId: 'forged' };
const operations: GeneratedBackyOpenApiOperationId[] = ['reconcileBackyCommentDelivery', 'reconcileBackyFormDelivery'];
void [invalidDisposition, invalidState, invalidEvidence, invalidActor, operations];
