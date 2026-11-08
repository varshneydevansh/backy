import { pgTable, uuid, text, timestamp, integer, index, uniqueIndex } from 'drizzle-orm/pg-core';
export const newsletterCampaigns = pgTable('newsletter_campaigns', {
  id: uuid('id').defaultRandom().primaryKey(), siteId: uuid('site_id').notNull(),
  subject: text('subject').notNull(), text: text('text').notNull(), formId: uuid('form_id'),
  state: text('state').notNull().default('draft'), version: integer('version').notNull().default(1),
  requestKey: text('request_key').notNull(), requestHash: text('request_hash').notNull(), actorId: text('actor_id'),
  recipientCount: integer('recipient_count').notNull().default(0), scheduledAt: timestamp('scheduled_at', {withTimezone:true}),
  createdAt: timestamp('created_at', {withTimezone:true}).defaultNow().notNull(), updatedAt: timestamp('updated_at', {withTimezone:true}).defaultNow().notNull(),
}, t => [uniqueIndex('newsletter_campaign_request_idx').on(t.siteId,t.requestKey), index('newsletter_campaign_site_idx').on(t.siteId,t.createdAt)]);
export const newsletterDeliveries = pgTable('newsletter_deliveries', {
  id: uuid('id').defaultRandom().primaryKey(), siteId: uuid('site_id').notNull(), campaignId: uuid('campaign_id').notNull(), contactId: uuid('contact_id'),
  email: text('email').notNull(), state: text('state').notNull().default('pending'), providerMessageId: text('provider_message_id'), errorCode: text('error_code'),
  createdAt: timestamp('created_at', {withTimezone:true}).defaultNow().notNull(), updatedAt: timestamp('updated_at', {withTimezone:true}).defaultNow().notNull(),
}, t => [uniqueIndex('newsletter_delivery_recipient_idx').on(t.campaignId,t.email), index('newsletter_delivery_queue_idx').on(t.siteId,t.campaignId,t.state)]);
export const newsletterSuppressions = pgTable('newsletter_suppressions', {
  id: uuid('id').defaultRandom().primaryKey(), siteId: uuid('site_id').notNull(), email: text('email').notNull(), reason: text('reason').notNull(),
  createdAt: timestamp('created_at', {withTimezone:true}).defaultNow().notNull(),
}, t => [uniqueIndex('newsletter_suppression_email_idx').on(t.siteId,t.email)]);
export const newsletterFeedbackEvents = pgTable('newsletter_feedback_events', {
  id: text('id').primaryKey(), siteId: uuid('site_id').notNull(), deliveryId: uuid('delivery_id').notNull(), kind: text('kind').notNull(), evidence: text('evidence'), actorId: text('actor_id'),
  createdAt: timestamp('created_at', {withTimezone:true}).defaultNow().notNull(),
});
export const newsletterDispatchGate = pgTable('newsletter_dispatch_gate', {
  id: text('id').primaryKey(), day: text('day').notNull(), count: integer('count').notNull(), nextAt: timestamp('next_at', {withTimezone:true}).notNull(),
});
