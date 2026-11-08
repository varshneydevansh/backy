import type { BulkCollectionRecordResult } from './adminContentApi';

/** Older servers return counts only; current servers identify confirmed writes. */
export function collectionBulkOutcome(result: BulkCollectionRecordResult, requestedIds: string[]) {
  const appliedIds = result.appliedRecordIds ?? (result.action === 'delete' ? requestedIds : result.records.map(record => record.id));
  const failed = result.failedTargets || [];
  const notAttempted = result.notAttemptedRecordIds || [];
  const remainingIds = Array.from(new Set([...failed.map(target => target.recordId), ...notAttempted]));
  const warnings = result.completionWarnings || [];
  const summary = result.action === 'delete' ? `${result.deleted} records deleted` : `${result.updated} records updated`;
  const parts = [summary];
  if (result.skipped) parts.push(`${result.skipped} skipped`);
  if (failed.length) parts.push(`${failed.length} failed`);
  if (notAttempted.length) parts.push(`${notAttempted.length} not attempted`);
  let notice = `${parts.join(', ')}.`;
  if (remainingIds.length) notice += ' Failed and unattempted records remain selected. Review them before retrying.';
  if (warnings.some(code => code !== 'COLLECTION_BULK_APPLY_INCOMPLETE')) notice += ' Saved changes need a follow-up for audit, cache or webhook delivery; do not repeat successful writes.';
  return { appliedIds, remainingIds, notice };
}
