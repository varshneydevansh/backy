/** Private mailbox send admission retains fingerprints, never recipients, bodies or attachment bytes. */
export type BackyMailboxSendState = 'pending' | 'accepted' | 'rejected' | 'uncertain';
export interface BackyMailboxSendAttempt {
  id: string; siteId: string; bindingId: string; idempotencyKey: string; fingerprint: string;
  state: BackyMailboxSendState; statusCode: number | null; createdAt: string; updatedAt: string;
}
export interface BackyMailboxSendAdmission { siteId: string; bindingId: string; idempotencyKey: string; fingerprint: string }
export interface BackyMailboxSendRepository {
  admit(input: BackyMailboxSendAdmission): Promise<{ attempt: BackyMailboxSendAttempt; admitted: boolean }>;
  settle(siteId: string, bindingId: string, id: string, input: { state: Exclude<BackyMailboxSendState, 'pending'>; statusCode?: number }): Promise<BackyMailboxSendAttempt>;
  list(input: { siteId: string; bindingId?: string; limit: number; offset: number }): Promise<{ items: BackyMailboxSendAttempt[]; total: number }>;
}
export class BackyMailboxSendError extends Error {
  constructor(public readonly code: string, public readonly status: number, message: string) { super(message); }
}
export function assertMailboxSendAdmission(input: BackyMailboxSendAdmission): void {
  if (!input.siteId || !/^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/.test(input.bindingId) || !/^[A-Za-z0-9][A-Za-z0-9_-]{15,127}$/.test(input.idempotencyKey) || !/^[a-f0-9]{64}$/.test(input.fingerprint))
    throw new BackyMailboxSendError('MAILBOX_REQUEST_INVALID', 400, 'A bounded send identity and request fingerprint are required.');
}
