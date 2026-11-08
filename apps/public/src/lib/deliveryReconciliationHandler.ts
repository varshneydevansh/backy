import { randomUUID } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { commentDeliveryErrorDetails, formDeliveryErrorDetails, isDeliveryReconciliationInput } from '@backy-cms/core';
import { isOwnerAdminSession, requireAdminAccess } from '@/lib/adminAccess';
import { recordAdminAudit } from '@/lib/adminAudit';
import { getCommentById, getFormById, getSiteByIdOrSlug, getSubmissionById } from '@/lib/backyStore';
import { commentDeliveryJournal, deliveryAttemptEvent } from '@/lib/commentDeliveryHistory';
import { formDeliveryAttemptEvent, formDeliveryJournal } from '@/lib/formDeliveryHistory';
import { getRequiredDatabaseRepositories, shouldUseDemoStoreFallback } from '@/lib/repositoryRuntime';

type Scope = { siteId: string; attemptId: string } & (
  { kind: 'comment'; commentId: string } | { kind: 'form'; formId: string; submissionId: string }
);
const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { 'Cache-Control': 'private, no-store' } });
const errorResponse = (requestId: string, status: number, code: string, message: string) => json({ success: false, requestId, error: { code, message }, errorMessage: message }, status);

/** Owner investigation only: this handler never calls a provider or changes the delivery outcome. */
export async function reconcileDeliveryAttempt(request: NextRequest, scope: Scope) {
  const suppliedRequestId = request.headers.get('x-request-id');
  const requestId = suppliedRequestId && suppliedRequestId.length <= 200 ? suppliedRequestId : `req_${randomUUID()}`;
  const access = await requireAdminAccess(request, requestId, { permission: scope.kind === 'comment' ? 'comments.manage' : 'forms.manage' });
  if (access instanceof NextResponse) return access;
  if (!isOwnerAdminSession(access)) return errorResponse(requestId, 403, 'OWNER_SESSION_REQUIRED', 'Delivery investigation requires an active owner admin session.');
  const body: unknown = await request.json().catch(() => null);
  const keys = ['expectedUpdatedAt', 'expectedState', 'expectedReviewVersion', 'evidence', 'disposition'];
  if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).some(key => !keys.includes(key))) {
    return errorResponse(requestId, 400, 'DELIVERY_RECONCILIATION_INVALID', 'Provide only the expected attempt snapshot and supported investigation disposition.');
  }
  const input = { ...body, actorId: access.session!.user.id, requestId };
  if (!isDeliveryReconciliationInput(input)) return errorResponse(requestId, 400, 'DELIVERY_RECONCILIATION_INVALID', 'Use a current pending or uncertain attempt snapshot and a supported investigation disposition.');
  try {
    const repositories = shouldUseDemoStoreFallback() ? null : await getRequiredDatabaseRepositories();
    const site = repositories ? await repositories.sites.getById(scope.siteId) || await repositories.sites.getBySlug(scope.siteId) : getSiteByIdOrSlug(scope.siteId);
    if (!site) return errorResponse(requestId, 404, 'SITE_NOT_FOUND', 'Site not found.');
    let attempt;
    if (scope.kind === 'comment') {
      const comment = repositories ? await repositories.comments.getById(site.id, scope.commentId) : getCommentById(scope.commentId);
      if (!comment || comment.siteId !== site.id) return errorResponse(requestId, 404, 'COMMENT_NOT_FOUND', 'Comment not found.');
      attempt = deliveryAttemptEvent(await commentDeliveryJournal(repositories).recordReconciliation({ siteId: site.id, commentId: scope.commentId, attemptId: scope.attemptId, ...input }));
    } else {
      const form = repositories ? await repositories.forms.getById(site.id, scope.formId) : getFormById(site.id, scope.formId);
      if (!form) return errorResponse(requestId, 404, 'FORM_NOT_FOUND', 'Form not found.');
      const submission = repositories ? await repositories.forms.getSubmissionById(site.id, form.id, scope.submissionId) : getSubmissionById(scope.submissionId);
      if (!submission || submission.siteId !== site.id || submission.formId !== form.id) return errorResponse(requestId, 404, 'SUBMISSION_NOT_FOUND', 'Submission not found.');
      attempt = formDeliveryAttemptEvent(await formDeliveryJournal(repositories).recordReconciliation({ siteId: site.id, formId: form.id, submissionId: submission.id, attemptId: scope.attemptId, ...input }));
    }
    const reconciliation = attempt.reconciliations[attempt.reconciliations.length - 1];
    const completionWarnings: { code: string; message: string }[] = [];
    try {
      await recordAdminAudit({ repositories, siteId: site.id, actorId: access.session!.user.id,
        entity: scope.kind === 'comment' ? 'comment' : 'formSubmission', entityId: scope.kind === 'comment' ? scope.commentId : scope.submissionId,
        action: 'update', requestId, metadata: { operation: 'delivery-reconciliation', attemptId: scope.attemptId, reconciliationId: reconciliation.id, reviewVersion: reconciliation.version, disposition: reconciliation.disposition } });
    } catch {
      completionWarnings.push({ code: 'DELIVERY_RECONCILIATION_AUDIT_PENDING', message: 'The investigation was saved, but its audit follow-up is incomplete. Reload history; do not repeat the review automatically.' });
    }
    return json({ success: true, requestId, data: { attempt, reconciliation, completionWarnings }, attempt, reconciliation, completionWarnings });
  } catch (error) {
    const details = scope.kind === 'comment' ? commentDeliveryErrorDetails(error) : formDeliveryErrorDetails(error);
    return details ? errorResponse(requestId, details.status, details.code, details.message) : errorResponse(requestId, 503, 'DELIVERY_JOURNAL_UNAVAILABLE', 'Durable delivery investigation is unavailable. Reload history before reviewing again.');
  }
}
