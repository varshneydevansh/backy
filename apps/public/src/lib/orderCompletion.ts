export interface OrderCompletionWarning {
  code: 'CACHE_INVALIDATION_PENDING' | 'AUDIT_PENDING' | 'WEBHOOK_DELIVERY_PENDING';
  message: string;
}

/** Use only after the authoritative order mutation has committed. No automatic replay. */
export async function runOrderCompletionTask<T>(
  warnings: OrderCompletionWarning[],
  code: OrderCompletionWarning['code'],
  message: string,
  task: () => Promise<T>,
): Promise<T | undefined> {
  try { return await task(); }
  catch { warnings.push({ code, message }); return undefined; }
}
