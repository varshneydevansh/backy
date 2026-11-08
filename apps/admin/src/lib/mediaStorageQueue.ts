const pending = new Map<string, Promise<void>>();

/** Keep local bulk selections usable with the server's single-site storage guard.
 * Failures settle the queue; different sites retain independent progress. */
export function queueMediaStorageMutation<T>(siteId: string, operation: () => Promise<T>): Promise<T> {
  const previous = pending.get(siteId) || Promise.resolve();
  const result = previous.then(operation);
  const settled = result.then(() => undefined, () => undefined);
  pending.set(siteId, settled);
  void settled.then(() => { if (pending.get(siteId) === settled) pending.delete(siteId); });
  return result;
}
