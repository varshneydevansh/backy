import type { BackyJsonObject } from './content-contract';
import type { BackySettingsOperatorGrantCommitInput } from './repositories';
import { serializeTemplateRevisionValue } from './template-history';

const record = (value: unknown): value is BackyJsonObject => Boolean(value && typeof value === 'object' && !Array.isArray(value));
const conflict = (code = 'OPERATOR_SITE_SCOPE_CONFLICT') => Object.assign(new Error(code === 'OPERATOR_SITE_SCOPE_CONFLICT'
  ? 'The operator site policy changed. Reload before saving.' : 'Repair the managed operator policy inventory before saving.'), { code, status: 409 });

/** Call only inside the store's atomic mutation boundary; never write a stale full auth snapshot. */
export function commitBackyOperatorSiteGrantAuth(auth: unknown, input: BackySettingsOperatorGrantCommitInput): BackyJsonObject {
  const current = record(auth) ? auth : {};
  const records = current.userSiteGrants;
  if (records !== undefined && (!Array.isArray(records) || records.length > 5000)) throw conflict('OPERATOR_SITE_SCOPE_STORAGE_INVALID');
  if (!input.userId || input.record.userId !== input.userId || !input.expectedRecords.every(item => item.userId === input.userId)) throw conflict('OPERATOR_SITE_SCOPE_STORAGE_INVALID');
  const inventory = Array.isArray(records) ? records : [];
  const own = inventory.filter(item => record(item) && item.userId === input.userId);
  if (serializeTemplateRevisionValue(own) !== serializeTemplateRevisionValue(input.expectedRecords)) throw conflict();
  if (own.length === 0 && inventory.length >= 5000) throw conflict('OPERATOR_SITE_SCOPE_STORAGE_INVALID');
  return {
    ...current,
    userSiteGrants: [...inventory.filter(item => !(record(item) && item.userId === input.userId)), input.record],
  };
}

/** Generic settings writers cannot replace this dedicated, atomically managed field. */
export function preserveBackyOperatorSiteGrants(currentAuth: unknown, nextAuth: BackyJsonObject): BackyJsonObject {
  const current = record(currentAuth) ? currentAuth : {};
  const next = { ...nextAuth };
  delete next.userSiteGrants;
  if (Object.prototype.hasOwnProperty.call(current, 'userSiteGrants')) next.userSiteGrants = current.userSiteGrants;
  return next;
}
