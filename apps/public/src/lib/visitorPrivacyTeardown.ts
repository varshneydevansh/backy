import { NextResponse } from 'next/server';
import type { BackyRepositories } from '@backy-cms/core';

/** Run before deactivation, attachment cleanup, storage work or logical teardown. */
export async function withVisitorPrivacyDeletion<T>(repositories: BackyRepositories, siteId: string, formId: string | null, operation: () => Promise<T>): Promise<T> {
  const repository = repositories.visitorAccounts?.privacyErasure;
  if (!repository?.withDeletionPreflight) throw Object.assign(new Error('Persisted visitor privacy teardown admission is unavailable'), { code: 'VISITOR_PRIVACY_TEARDOWN_UNAVAILABLE', status: 503 });
  let admitted = false;
  try { return await repository.withDeletionPreflight(siteId, formId, async () => { admitted = true; return operation(); }); }
  catch (error) {
    if (admitted || ['VISITOR_PRIVACY_EVIDENCE_REMAINS', 'VISITOR_PRIVACY_BUSY'].includes((error as { code?: string })?.code || '')) throw error;
    throw Object.assign(new Error('Persisted visitor privacy teardown inventory is unavailable'), { code: 'VISITOR_PRIVACY_TEARDOWN_UNAVAILABLE', status: 503 });
  }
}

export function visitorPrivacyDeletionErrorResponse(error: unknown, requestId: string, kind: 'site' | 'form'): NextResponse | null {
  const code = (error as { code?: string })?.code;
  if (!['VISITOR_PRIVACY_EVIDENCE_REMAINS', 'VISITOR_PRIVACY_TEARDOWN_UNAVAILABLE', 'VISITOR_PRIVACY_BUSY'].includes(code || '')) return null;
  const retained = code === 'VISITOR_PRIVACY_EVIDENCE_REMAINS';
  const message = retained
    ? `This ${kind === 'site' ? 'website retains visitor contributor provenance, privacy fences or erasure receipts' : 'form retains contact contributor provenance'}. Deletion is blocked before storage cleanup to preserve privacy and delayed-delivery protection. Keep this ${kind === 'site' ? 'website' : 'form'} archived or inactive until an explicit evidence retention and teardown policy is implemented; erasing a member does not remove this evidence.`
    : `Visitor privacy evidence could not be verified. The ${kind === 'site' ? 'website' : 'form'} was not deleted and storage cleanup did not run. Restore persisted repository access and migration032, then retry.`;
  return NextResponse.json({ success: false, requestId, error: { code, message } }, { status: retained ? 409 : 503 });
}
