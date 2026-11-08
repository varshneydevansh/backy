import type { BackyUser, BackyUserRepository } from '@backy-cms/core';
import { NextResponse } from 'next/server';
const errors = {
  LAST_ADMIN_AUTHORITY: { status: 409, message: 'At least one active owner or admin must remain.' },
  OPERATOR_AUTHORITY_UNAVAILABLE: { status: 503, message: 'Complete operator authority admission could not be verified. No unsupported fallback is available.' },
  OPERATOR_AUTHORITY_BUSY: { status: 503, message: 'Operator authority is being changed. Reload before retrying.' },
  OPERATOR_INVENTORY_INCOMPLETE: { status: 503, message: 'Complete operator inventory could not be verified. Reload before retrying.' },
} as const;
export function operatorLifecycleErrorResponse(error: unknown, requestId: string) {
  const code = error && typeof error === 'object' && 'code' in error ? error.code : undefined;
  if (typeof code !== 'string' || !Object.prototype.hasOwnProperty.call(errors, code)) return null;
  const value = errors[code as keyof typeof errors];
  return NextResponse.json({ success: false, requestId, error: { code, message: value.message } }, { status: value.status, headers: { 'cache-control': 'private, no-store', vary: 'Cookie, Authorization' } });
}
/** Full validated inventory for bulk selection/preflight; never mistake a capped
 * response for all operators. Authority mutation itself is guarded in the repo. */
export async function readCompleteOperatorInventory(repository: BackyUserRepository): Promise<BackyUser[]> {
  const fail = () => Object.assign(new Error(errors.OPERATOR_INVENTORY_INCOMPLETE.message), { code: 'OPERATOR_INVENTORY_INCOMPLETE' });
  const users: BackyUser[] = [], ids = new Set<string>(); let total: number | undefined;
  for (let offset = 0; offset < 50000; offset += 100) {
    const page = await repository.list({ limit: 100, offset }).catch(() => { throw fail(); });
    const pagination = page?.pagination;
    if (!Array.isArray(page?.items) || !pagination || pagination.limit !== 100 || pagination.offset !== offset || !Number.isSafeInteger(pagination.total) || pagination.total < 0 || pagination.total > 50000 || typeof pagination.hasMore !== 'boolean' || page.items.length > 100 || (total !== undefined && total !== pagination.total)) throw fail();
    total = pagination.total;
    for (const user of page.items) { if (!user || typeof user.id !== 'string' || !user.id || ids.has(user.id)) throw fail(); ids.add(user.id); users.push(user); }
    if (users.length > total || pagination.hasMore !== (users.length < total) || pagination.hasMore && page.items.length !== 100) throw fail();
    if (!pagination.hasMore) { if (users.length !== total) throw fail(); return users; }
  }
  throw fail();
}
