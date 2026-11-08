/** Verify the transcript collected from actual CUA interactions and served handlers. */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const proof = JSON.parse(readFileSync(process.argv[2] || '/tmp/backy-delivery-review-browser-proof.json', 'utf8'));
let checks = 0; const verify = (condition, message) => { assert.ok(condition, message); checks++; };
const handlers = proof.events.filter(event => event.kind === 'actual-handler');
const posts = handlers.filter(event => event.method === 'POST' && event.path.endsWith('/reconciliation'));
verify(posts.length === 4, 'One successful comment review, one actual stale conflict, one held departed review and one form review');
verify(posts.filter(event => event.status === 200).length === 3, 'Three confirmed review writes');
verify(posts.filter(event => event.status === 409 && event.body.error.code === 'DELIVERY_RECONCILIATION_CONFLICT').length === 1, 'Competing real journal review produced stale409');
verify(proof.events.some(event => event.kind === 'held-review'), 'Actual HTTP write was held across SPA workspace change');
verify(proof.events.some(event => event.kind === 'nonowner-handler-proof' && event.status === 403 && event.body.error.code === 'OWNER_SESSION_REQUIRED'), 'Shared nonowner authentication refused the review');
verify(proof.events.every(event => event.kind !== 'provider-request'), 'No provider request reached owned provider');
verify(proof.events.every(event => !/(delivery|email|webhook)-retry/.test(event.path || '')), 'No retry request was made');
const comment = proof.commentAttempts.find(row => row.id === proof.ids.pending), form = proof.formAttempts.find(row => row.id === proof.ids.uncertain);
verify(comment && comment.state === 'pending' && comment.reconciliationVersion === 3 && comment.reconciliations.length === 3, 'Comment remains pending with append-only reviews including the competing writer');
verify(form && form.state === 'uncertain' && form.reconciliationVersion === 1 && form.reconciliations.length === 1, 'Form remains uncertain after review');
verify(form.providerEvidence.provider === 'local-outbox' && form.providerEvidence.providerMessageId === 'owned-outbox-evidence' && form.providerEvidence.outboxOnly, 'Original allowlisted outbox evidence retained without claiming arrival');
for (const row of [comment, form]) {
  const original = handlers.find(event => event.method === 'GET' && event.path.endsWith('/delivery-attempts') && event.body.data.events.some(attempt => attempt.id === row.id)).body.data.events.find(attempt => attempt.id === row.id);
  verify(original.updatedAt === row.updatedAt && original.status === row.state, 'Exact original provider version/state unchanged');
  verify(JSON.stringify(original.providerEvidence) === JSON.stringify(row.providerEvidence), 'Exact original provider acknowledgement unchanged');
  verify(row.reconciliations.every((review, index) => review.version === index + 1 && review.actorId === 'review-owner' && review.disposition === 'retain-without-resend' && review.observedUpdatedAt === row.updatedAt && review.observedState === row.state), 'Owner identity/version/retained-no-resend evidence preserved');
  verify(handlers.some(event => event.method === 'GET' && event.path.endsWith('/delivery-attempts') && event.body.data.events.some(attempt => attempt.id === row.id && attempt.reconciliationVersion > 0 && attempt.status === row.state)), 'HTTP history reload returns reviewed original attempt');
}
verify(handlers.some(event => event.method === 'GET' && event.path === '/api/sites/review-other/comments/delivery-attempts' && event.body.data.events.length === 0), 'New workspace delivery history contains no old-site attempts');
console.log(`Delivery review served evidence: ${checks} checks PASS; actual UI/HTTP/shared auth/durable demo journal, no provider request or deployed/SQL certification.`);
