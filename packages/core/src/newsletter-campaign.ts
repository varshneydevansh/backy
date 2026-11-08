/** Bounded, durable opt-in newsletter delivery. Acceptance is distinct from arrival. */
export type NewsletterCampaignState = 'draft' | 'scheduled' | 'queued' | 'processing' | 'completed' | 'cancelled';
export type NewsletterDeliveryState = 'pending' | 'processing' | 'accepted' | 'delivered' | 'failed' | 'uncertain' | 'suppressed' | 'cancelled' | 'bounced' | 'complained';
export interface NewsletterCampaignDraft {
  subject: string;
  text: string;
  formId?: string | null;
}
export interface NewsletterCampaign extends NewsletterCampaignDraft {
  id: string; siteId: string; state: NewsletterCampaignState; version: number;
  scheduledAt: string | null; createdAt: string; updatedAt: string;
  recipientCount: number; actorId: string | null;
}
export interface NewsletterDelivery {
  id: string; siteId: string; campaignId: string; contactId: string | null;
  email: string; state: NewsletterDeliveryState; providerMessageId: string | null;
  errorCode: string | null; createdAt: string; updatedAt: string;
}
export interface NewsletterCampaignDetail {
  campaign: NewsletterCampaign; deliveries: NewsletterDelivery[];
  counts: Partial<Record<NewsletterDeliveryState, number>>;
}
export class NewsletterCampaignError extends Error {
  constructor(public code: string, public status: number, message: string) { super(message); this.name = 'NewsletterCampaignError'; }
}
export function validateNewsletterCampaignDraft(input: unknown): NewsletterCampaignDraft {
  const v = input as Record<string, unknown> | null;
  if (!v || typeof v !== 'object' || Array.isArray(v) || typeof v.subject !== 'string' || !v.subject.trim() || v.subject.length > 200 || /[\r\n\x00-\x1f\x7f]/.test(v.subject) || typeof v.text !== 'string' || !v.text.trim() || v.text.length > 30000 || /[\x00]/.test(v.text) || (v.formId !== undefined && v.formId !== null && (typeof v.formId !== 'string' || !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(v.formId)))) {
    throw new NewsletterCampaignError('NEWSLETTER_DRAFT_INVALID', 400, 'Use a subject of 1–200 characters, plain text of 1–30000 characters and an optional form ID.');
  }
  return { subject: v.subject.trim(), text: v.text.trim(), formId: typeof v.formId === 'string' ? v.formId : null };
}
export interface NewsletterCampaignRepository {
  due(limit: number): Promise<Array<{ siteId: string; id: string }>>;
  create(siteId: string, draft: NewsletterCampaignDraft, key: string, actorId: string | null): Promise<NewsletterCampaign>;
  update(siteId: string, id: string, draft: NewsletterCampaignDraft, version: number): Promise<NewsletterCampaign>;
  list(siteId: string, limit: number, offset: number): Promise<{ items: NewsletterCampaign[]; total: number }>;
  detail(siteId: string, id: string): Promise<NewsletterCampaignDetail | null>;
  queue(siteId: string, id: string, version: number, scheduledAt: string | null, limit: number): Promise<NewsletterCampaign>;
  cancel(siteId: string, id: string, version: number): Promise<NewsletterCampaign>;
  /** Atomic claim + current consent/suppression check + deployment-wide daily budget reservation. */
  claim(siteId: string, id: string, dailyLimit: number): Promise<{ campaign: NewsletterCampaign; delivery: NewsletterDelivery } | null>;
  settle(siteId: string, id: string, state: 'accepted' | 'failed' | 'uncertain', providerMessageId?: string | null, errorCode?: 'VISITOR_PRIVACY_FENCED' | 'NEWSLETTER_TRANSPORT_UNCERTAIN' | null): Promise<void>;
  suppressByDelivery(siteId: string, id: string, reason: 'unsubscribed' | 'bounced' | 'complained', eventId: string): Promise<void>;
  feedback(siteId: string, id: string, state: 'delivered' | 'bounced' | 'complained', eventId: string, evidence?: string | null, actorId?: string | null): Promise<void>;
}
