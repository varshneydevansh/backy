/** Explicit local retention policy. Shared provider identity and external copies are outside this action. */
export interface BackyVisitorErasureChoices { comments: 'redact' | 'retain'; submissions: 'redact' | 'retain'; exclusiveContacts: 'delete' | 'retain'; }
export const BACKY_VISITOR_ERASURE_RETAINED = ['provider-subject-tombstone','other-websites','private-attachment-bytes-and-references','ambiguous-or-retained-contacts','collection-copies','historical-audit-and-delivery-evidence','newsletter-consent-and-delivery-snapshots','downstream-provider-copies'] as const;
export interface BackyVisitorErasureCounts { comments: number; submissions: number; exclusiveContacts: number; ambiguousContacts: number; retainedAttachments: number; commentDeliveryAttempts: number; formDeliveryAttempts: number; newsletterSnapshots: number; }
export interface BackyVisitorErasurePreview {
 schema: 'backy.visitor-erasure-preview.v1'; previewId: string; siteId: string; memberId: string; expiresAt: string;
 choices: BackyVisitorErasureChoices; counts: BackyVisitorErasureCounts;
 retainedCategories: Array<typeof BACKY_VISITOR_ERASURE_RETAINED[number]>;
 boundaries: { profileIdentifiers: 'redact'; admission: 'remove-and-fence'; providerChanged: false; emailMatchedOwnership: false; downstreamErasure: 'unverified'; ambiguousContacts: 'retain-and-fence'; };
}
export interface BackyVisitorErasureReceipt {
 schema: 'backy.visitor-erasure-receipt.v1'; receiptId: string; siteId: string; memberId: string; completedAt: string;
 choices: BackyVisitorErasureChoices; counts: BackyVisitorErasureCounts;
 retainedCategories: BackyVisitorErasurePreview['retainedCategories']; boundaries: BackyVisitorErasurePreview['boundaries']; localErasurePerformed: true;
}
export interface BackyVisitorErasureRepository {
 /** Holds the privacy admission lock through teardown; retained evidence denies before the operation. */
 withDeletionPreflight<T>(siteId: string, formId: string | null, operation: () => Promise<T>): Promise<T>;
 preview(siteId: string, memberId: string, actorId: string, choices: BackyVisitorErasureChoices): Promise<BackyVisitorErasurePreview | null>;
 confirm(siteId: string, memberId: string, actorId: string, previewId: string, requestId: string): Promise<BackyVisitorErasureReceipt | null>;
}
