import type { BackySiteVisitor } from './visitor-accounts';

/** Durable journal counts only. Unknown outcome means the stored `uncertain` state. */
export interface BackyVisitorPrivacyDeliveryCounts { total: number; pending: number; unknownOutcome: number; }
/** Existing retention categories; this review does not inspect private field/file presence. */
export const BACKY_VISITOR_PRIVACY_RETAINED_CATEGORIES = [
  'membership-identity', 'comments-and-moderation', 'submission-values-files-and-admin-metadata',
  'source-submission-contact-copies', 'delivery-evidence',
] as const;
export interface BackyVisitorPrivacyImpact {
  schema: 'backy.visitor-privacy-impact.v1';
  siteId: string; memberId: string; memberStatus: BackySiteVisitor['status']; observedAt: string;
  reviewMode: 'read-only-point-in-time';
  counts: {
    comments: number; formSubmissions: number; linkedContacts: number;
    commentDeliveryAttempts: BackyVisitorPrivacyDeliveryCounts;
    formDeliveryAttempts: BackyVisitorPrivacyDeliveryCounts;
  };
  retainedCategories: Array<typeof BACKY_VISITOR_PRIVACY_RETAINED_CATEGORIES[number]>;
  boundaries: {
    contactOwnership: 'ambiguous-source-submission-link'; downstreamProvenance: 'unknown';
    emailMatchedOwnership: false; contentInspected: false; erasurePerformed: false; providerChanged: false;
  };
}
/** Optional adapters fail closed. No emails, names, bodies, arbitrary JSON or provider identity are returned. */
export interface BackyVisitorPrivacyImpactRepository {
  review(siteId: string, memberId: string): Promise<BackyVisitorPrivacyImpact | null>;
}
