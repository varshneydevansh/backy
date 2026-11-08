import type { BackyVisitorPrivacyImpact } from '@backy-cms/core';
import { getAdminApiBase } from './adminContentApi';

const object = (value: unknown): value is Record<string, any> => !!value && typeof value === 'object' && !Array.isArray(value);
const count = (value: unknown): value is number => Number.isSafeInteger(value) && Number(value) >= 0;
const retained = ['membership-identity', 'comments-and-moderation', 'submission-values-files-and-admin-metadata', 'source-submission-contact-copies', 'delivery-evidence'];
export class VisitorPrivacyReviewDenied extends Error {
  constructor() { super('Privacy review access denied. Restore your owner session and permissions, then review again.'); }
}
/** Only allowlisted counts and fixed boundary statements reach the view. */
export function parseVisitorPrivacyImpact(value: unknown, siteId: string, memberId: string): BackyVisitorPrivacyImpact {
  if (!object(value) || value.schema !== 'backy.visitor-privacy-impact.v1' || value.siteId !== siteId || value.memberId !== memberId
    || !['active', 'suspended', 'removed'].includes(value.memberStatus) || typeof value.observedAt !== 'string'
    || !/^\d{4}-\d{2}-\d{2}T/.test(value.observedAt) || !Number.isFinite(Date.parse(value.observedAt)) || value.reviewMode !== 'read-only-point-in-time'
    || !object(value.counts) || !['comments', 'formSubmissions', 'linkedContacts'].every(key => count(value.counts[key]))
    || !Array.isArray(value.retainedCategories) || value.retainedCategories.length !== retained.length || !retained.every(key => value.retainedCategories.includes(key))
    || !object(value.boundaries) || value.boundaries.contactOwnership !== 'ambiguous-source-submission-link' || value.boundaries.downstreamProvenance !== 'unknown'
    || !['emailMatchedOwnership', 'contentInspected', 'erasurePerformed', 'providerChanged'].every(key => value.boundaries[key] === false)) {
    throw Error('Privacy review returned an incompatible scope or report. Review again to request a fresh snapshot.');
  }
  const delivery = (key: string) => {
    const row = value.counts[key];
    if (!object(row) || !count(row.total) || !count(row.pending) || !count(row.unknownOutcome) || row.pending + row.unknownOutcome > row.total) {
      throw Error('Privacy review returned incompatible delivery counts. Review again to request a fresh snapshot.');
    }
    return { total: row.total, pending: row.pending, unknownOutcome: row.unknownOutcome };
  };
  return { schema: value.schema, siteId, memberId, memberStatus: value.memberStatus, observedAt: value.observedAt, reviewMode: value.reviewMode,
    counts: { comments: value.counts.comments, formSubmissions: value.counts.formSubmissions, linkedContacts: value.counts.linkedContacts,
      commentDeliveryAttempts: delivery('commentDeliveryAttempts'), formDeliveryAttempts: delivery('formDeliveryAttempts') },
    retainedCategories: retained as BackyVisitorPrivacyImpact['retainedCategories'], boundaries: { contactOwnership: 'ambiguous-source-submission-link', downstreamProvenance: 'unknown',
      emailMatchedOwnership: false, contentInspected: false, erasurePerformed: false, providerChanged: false } };
}
export async function loadVisitorPrivacyImpact(siteId: string, memberId: string, signal: AbortSignal): Promise<BackyVisitorPrivacyImpact> {
  signal.throwIfAborted();
  // Owner cookie only: adminFetch may inject a bearer or service key, which this endpoint rejects.
  const response = await globalThis.fetch(`${getAdminApiBase()}/sites/${encodeURIComponent(siteId)}/visitors/members/${encodeURIComponent(memberId)}/privacy-impact`, {
    method: 'GET', headers: new Headers(), credentials: 'include', cache: 'no-store', redirect: 'error', signal,
  });
  signal.throwIfAborted();
  if (response.status === 401 || response.status === 403) throw new VisitorPrivacyReviewDenied();
  if (!response.ok) throw Error('Privacy review could not load. Review again to request a fresh snapshot.');
  const payload: unknown = await response.json();
  signal.throwIfAborted();
  if (!object(payload) || payload.success !== true) throw Error('Privacy review could not load. Review again to request a fresh snapshot.');
  return parseVisitorPrivacyImpact(payload.data, siteId, memberId);
}
