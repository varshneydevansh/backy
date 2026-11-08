import { assertMailboxSendAdmission, BackyMailboxSendError, type BackyMailboxSendAdmission, type BackyMailboxSendAttempt } from './site-mailbox';
export interface BackyMailboxManagementAdmission extends BackyMailboxSendAdmission { operation: 'mailbox' | 'alias'; address: string; targetBindingId: string | null }
export interface BackyMailboxManagementAttempt extends BackyMailboxSendAttempt { operation: 'mailbox' | 'alias'; address: string; targetBindingId: string | null }
export interface BackyMailboxManagementRepository {
 admit(input: BackyMailboxManagementAdmission): Promise<{ attempt: BackyMailboxManagementAttempt; admitted: boolean }>;
 settle(siteId: string, bindingId: string, id: string, input: { state: 'accepted' | 'rejected' | 'uncertain'; statusCode?: number }): Promise<BackyMailboxManagementAttempt>;
 list(input: { siteId: string; bindingId?: string; limit: number; offset: number }): Promise<{ items: BackyMailboxManagementAttempt[]; total: number }>;
}
export function assertMailboxManagementAdmission(input: BackyMailboxManagementAdmission): void {
 assertMailboxSendAdmission(input);
 if (!['mailbox','alias'].includes(input.operation) || typeof input.address !== 'string' || input.address.length > 304 || !/^[a-z0-9._-]+@[a-z0-9.-]+$/.test(input.address) || !(input.operation === 'mailbox' ? input.targetBindingId === null : typeof input.targetBindingId === 'string' && /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/.test(input.targetBindingId)))
  throw new BackyMailboxSendError('MAILBOX_MANAGEMENT_REQUEST_INVALID',400,'A valid management operation and exact target are required.');
}
