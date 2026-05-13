import assert from 'node:assert/strict';
import { isProcessedCommerceWebhookAuditEvent } from '../src/lib/commerceWebhookIdempotency';

const providerEventId = 'evt_smoke_paid';
const orderId = 'order_smoke_123';

assert.equal(
  isProcessedCommerceWebhookAuditEvent({
    action: 'commerce-webhook',
    entity: 'collectionRecord',
    entityId: orderId,
    metadata: {
      providerEventId,
      status: 'succeeded',
      orderId,
    },
  }, { providerEventId, orderId }),
  true,
  'successful durable audit entries should mark a webhook event processed',
);

assert.equal(
  isProcessedCommerceWebhookAuditEvent({
    kind: 'commerce-webhook',
    status: 'succeeded',
    metadata: {
      providerEventId,
      orderId,
    },
  }, { providerEventId, orderId }),
  true,
  'successful interaction audit entries should mark a demo webhook event processed',
);

assert.equal(
  isProcessedCommerceWebhookAuditEvent({
    kind: 'commerce-webhook',
    status: 'failed',
    metadata: {
      providerEventId,
      orderId,
    },
  }, { providerEventId, orderId }),
  false,
  'failed webhook audit entries should not mark the event processed',
);

assert.equal(
  isProcessedCommerceWebhookAuditEvent({
    action: 'commerce-webhook',
    entityId: 'order_other',
    metadata: {
      providerEventId,
      status: 'succeeded',
      orderId: 'order_other',
    },
  }, { providerEventId, orderId }),
  false,
  'audit entries for another order should not mark this order processed',
);

assert.equal(
  isProcessedCommerceWebhookAuditEvent({
    action: 'commerce-webhook',
    entityId: orderId,
    metadata: {
      providerEventId: 'evt_other',
      status: 'succeeded',
      orderId,
    },
  }, { providerEventId, orderId }),
  false,
  'audit entries for another provider event should not mark this event processed',
);

console.log(JSON.stringify({
  ok: true,
  cases: 5,
}));
