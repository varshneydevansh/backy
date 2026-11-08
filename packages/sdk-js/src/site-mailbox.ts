/** Owner-cookie private send and direct-related-message contracts. */
export interface BackySiteMailboxOutgoingAttachment { filename: string; content: string; contentType: string }
export interface BackySiteMailboxSendRequest {
  idempotencyKey: string; to: string[]; cc?: string[]; bcc?: string[]; subject: string; text: string;
  attachments?: BackySiteMailboxOutgoingAttachment[]; inReplyTo?: { folder: string; uid: number };
}
export interface BackySiteMailboxSendAttempt { id: string; idempotencyKey: string; state: 'pending' | 'accepted' | 'rejected' | 'uncertain'; statusCode: number | null; createdAt: string; updatedAt: string }
export interface BackySiteMailboxSendEnvelope { success: true; requestId: string; data: { schema: 'backy.mailbox-send.v1'; siteId: string; bindingId: string; attempt: BackySiteMailboxSendAttempt; replayed: boolean; outcomePersisted: boolean; providerAccepted: boolean; deliveryVerified: false; automaticRetry: false } }
export interface BackySiteMailboxSendAttemptsEnvelope { success: true; requestId: string; data: { schema: 'backy.mailbox-send-attempts.v1'; siteId: string; bindingId: string; attempts: BackySiteMailboxSendAttempt[]; pagination: { page: number; perPage: number; total: number; totalPages: number } } }
export interface BackySiteMailboxThreadEnvelope { success: true; requestId: string; data: { schema: 'backy.mailbox-thread.v1'; siteId: string; bindingId: string; folder: string; uid: number; source: import('./generated-contract-types').GeneratedBackyOpenApiAdminSiteMailboxMessage; messages: import('./generated-contract-types').GeneratedBackyOpenApiAdminSiteMailboxMessage[]; searchPagination: { page: number; perPage: number; total: number; totalPages: number }; relationship: 'direct-header-links'; sourceHasThreadHeaders: boolean; folderScope: 'selected-folder'; textMarksSeen: false } }
