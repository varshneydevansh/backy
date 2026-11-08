/** A confirmed content/policy write must not become a failed save because a
 * later cache, audit or delivery operation fails. Warnings describe attention
 * required; they do not promise that a durable retry job exists. Never project
 * raw provider/cache/audit diagnostics into the response. */
export async function runCommittedMutationFollowUp<T>(
  warnings: string[],
  code: string,
  run: () => Promise<T>,
  incomplete?: (result: T) => boolean,
): Promise<T | undefined> {
  try {
    const result = await run();
    if (incomplete?.(result)) warnings.push(code);
    return result;
  } catch {
    warnings.push(code);
    return undefined;
  }
}
export const hasFailedWebhookDelivery = (results: ReadonlyArray<{ status: string }>) =>
  results.some(result => result.status !== 'succeeded');
