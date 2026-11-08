import type { GeneratedBackyOpenApiAdminInteractiveComponentMigrationEnvelope, GeneratedBackyOpenApiAdminInteractiveComponentReviewedPreview } from '../../../../packages/sdk-js/src/generated-contract-types';
import { adminFetch, getAdminApiBase, AdminContentApiError, type InteractiveComponentRegistry } from './adminContentApi';
import { loadInteractiveRegistryPages } from './interactiveRegistryLoading';
export type ComponentMigrationData = GeneratedBackyOpenApiAdminInteractiveComponentMigrationEnvelope['data'];
export type ComponentMigrationReview = GeneratedBackyOpenApiAdminInteractiveComponentReviewedPreview;
export type ComponentVersion = { componentKey: string; version: string };
export type ComponentMigrationInput = { source: ComponentVersion; target: ComponentVersion; dryRun: boolean; reviewedPreview?: ComponentMigrationReview };
const object = (value: unknown): value is Record<string, unknown> => Boolean(value && typeof value === 'object' && !Array.isArray(value));
const hash = (value: unknown) => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
const count = (value: unknown) => Number.isSafeInteger(value) && Number(value) >= 0;
const versionMatches = (value: unknown, expected: ComponentVersion) => object(value) && value.componentKey === expected.componentKey && value.version === expected.version;
export const canApplyComponentMigration = (data: ComponentMigrationData | undefined, confirmed: boolean) => Boolean(confirmed && data?.dryRun && data.outcome === 'complete' && data.migratedTargets.length && !data.failedTargets.length && !data.completionWarnings.length && data.reviewedPreview);
export async function loadComponentMigrationRegistry(siteId: string, signal: AbortSignal, request: typeof fetch = adminFetch): Promise<InteractiveComponentRegistry> {
 return await loadInteractiveRegistryPages(`${getAdminApiBase()}/sites/${encodeURIComponent(siteId)}/interactive-components/discovery`, siteId, signal, request, 'include') as unknown as InteractiveComponentRegistry;
}
/** Reviewed applies always send the server's exact manifest. Old API responses fail closed. */
export async function migrateComponentVersion(siteId: string, input: ComponentMigrationInput, signal: AbortSignal, request: typeof fetch = adminFetch): Promise<ComponentMigrationData> {
 signal.throwIfAborted();
 if (!input.dryRun && !input.reviewedPreview) throw new Error('Reload and review a migration preview before applying.');
 const response = await request(`${getAdminApiBase()}/sites/${encodeURIComponent(siteId)}/interactive-components/${encodeURIComponent(input.source.componentKey)}/${encodeURIComponent(input.source.version)}/migrate`, { method: 'POST', credentials: 'include', signal, headers: { 'content-type': 'application/json', accept: 'application/json' }, body: JSON.stringify({ targetComponentKey: input.target.componentKey, targetVersion: input.target.version, dryRun: input.dryRun, ...(input.reviewedPreview ? { reviewedPreview: input.reviewedPreview } : {}) }) });
 let payload: unknown;
 try { payload = await response.json(); } catch { throw new Error('Migration API returned an unreadable response. Reload the preview and check matching backend versions.'); }
 signal.throwIfAborted();
 if (!response.ok || !object(payload) || payload.success !== true || !object(payload.data)) {
  const error = object(payload) && object(payload.error) ? payload.error : {};
  const findings = object(error.details) && Array.isArray(error.details.findings) ? error.details.findings : [];
  const locations = findings.slice(0, 8).filter(object).filter(item => typeof item.targetId === 'string' && typeof item.elementPath === 'string' && typeof item.instancePath === 'string' && typeof item.keyword === 'string')
    .map(item => `${String(item.targetId).slice(0, 160)} · ${String(item.elementPath).slice(0, 500)}${String(item.instancePath).slice(0, 500)} (${String(item.keyword).slice(0, 80)})`);
  const message = typeof error.message === 'string' ? error.message : 'Migration failed. Reload the preview before retrying.';
  throw new AdminContentApiError(message + (locations.length ? '\n' + locations.join('\n') : ''), { status: response.status }, typeof error.code === 'string' ? error.code : undefined);
 }
 const data = payload.data, review = data.reviewedPreview;
 if (data.dryRun !== input.dryRun || !versionMatches(data.source, input.source) || !versionMatches(data.target, input.target) || !['complete', 'partial'].includes(String(data.outcome))
  || !Array.isArray(data.migratedTargets) || !Array.isArray(data.failedTargets) || !Array.isArray(data.completionWarnings) || !data.completionWarnings.every(item => typeof item === 'string')
  || !object(data.retry) || typeof data.retry.required !== 'boolean' || typeof data.retry.reloadPreview !== 'boolean' || !(data.retry.message === null || typeof data.retry.message === 'string')
  || !['database-row-lock', 'demo-single-process'].includes(String(data.concurrencyBoundary)) || !object(data.summary) || !count(data.summary.targets) || !count(data.summary.elements)
  || !object(data.summary.scanned) || !count(data.summary.scanned.pages) || !count(data.summary.scanned.posts)
  || !object(review) || review.siteId !== siteId || !versionMatches(review.source, input.source) || !versionMatches(review.target, input.target) || !hash(review.targetFingerprint) || !Array.isArray(review.targets)) throw new Error('Migration API returned an incompatible result. Reload the preview and check matching backend versions.');
 const ids = new Set<string>();
 for (const row of review.targets) {
  if (!object(row) || !['page', 'post'].includes(String(row.targetType)) || typeof row.targetId !== 'string' || !row.targetId || !hash(row.contentFingerprint) || ids.has(`${row.targetType}:${row.targetId}`)) throw new Error('Migration preview returned inconsistent target snapshots.');
  ids.add(`${row.targetType}:${row.targetId}`);
 }
 if (!input.dryRun && input.reviewedPreview) {
  const expected = new Map(input.reviewedPreview.targets.map(row => [`${row.targetType}:${row.targetId}`, row.contentFingerprint]));
  if (review.targetFingerprint !== input.reviewedPreview.targetFingerprint || expected.size !== ids.size || review.targets.some(row => !object(row) || expected.get(`${row.targetType}:${row.targetId}`) !== row.contentFingerprint)) throw new Error('The applied response differs from the reviewed snapshot. Reload before deciding whether to retry.');
 }
 const applied = new Set<string>(); let elements = 0;
 for (const row of data.migratedTargets) {
  if (!object(row) || !ids.has(`${row.targetType}:${row.targetId}`) || applied.has(`${row.targetType}:${row.targetId}`) || !count(row.migrated) || Number(row.migrated) < 1 || typeof row.title !== 'string' || typeof row.slug !== 'string' || typeof row.status !== 'string' || !Array.isArray(row.elementPaths) || !row.elementPaths.every(path => typeof path === 'string')) throw new Error('Migration result returned inconsistent documents.');
  applied.add(`${row.targetType}:${row.targetId}`); elements += Number(row.migrated);
 }
 const failed = new Set<string>();
 for (const row of data.failedTargets) {
  const id = object(row) ? `${row.targetType}:${row.targetId}` : '';
  if (!object(row) || !ids.has(id) || applied.has(id) || failed.has(id) || !['CONTENT_REVISION_CONFLICT', 'MIGRATION_WRITE_FAILED'].includes(String(row.code)) || typeof row.message !== 'string') throw new Error('Migration result returned inconsistent failed documents.');
  failed.add(id);
 }
 if (data.summary.targets !== applied.size || data.summary.elements !== elements || applied.size + failed.size !== ids.size || data.retry.required !== Boolean(failed.size) || data.retry.reloadPreview !== Boolean(failed.size)
  || data.outcome !== (failed.size || data.completionWarnings.length ? 'partial' : 'complete')) throw new Error('Migration result does not account for every reviewed document. Reload before retrying.');
 return data as unknown as ComponentMigrationData;
}
