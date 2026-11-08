import { createHash } from 'node:crypto';
import { and, count, desc, eq, inArray, lte, sql } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import type { DatabaseInstance } from '../adapters';
import * as schema from '../schema';
import { NewsletterCampaignError, validateNewsletterCampaignDraft, type NewsletterCampaign, type NewsletterCampaignRepository, type NewsletterDelivery } from '@backy-cms/core';

const { newsletterCampaigns: campaigns, newsletterDeliveries: deliveries, newsletterSuppressions: suppressions, newsletterFeedbackEvents: events, newsletterDispatchGate: gate, sites, formContacts: contacts, formDefinitions: forms } = schema;
const uuid = (id: string) => /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(id);
const fail = (code: string, status: number, message: string): never => { throw new NewsletterCampaignError(code, status, message); };
const normalizeEmail = (email: string | null) => (email || '').trim().toLowerCase();
const validEmail = (email: string) => {
  const [local,domain,extra]=email.split('@');
  return email.length<=254 && Boolean(local&&domain&&extra===undefined&&local.length<=64&&!local.startsWith('.')&&!local.endsWith('.')&&!local.includes('..')&&/^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+$/i.test(local)&&domain.split('.').length>1&&domain.split('.').every(label=>label.length<=63&&/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/i.test(label)));
};
const eligible = (row: typeof contacts.$inferSelect) => row.status !== 'archived' && row.newsletterSubscriptionStatus === 'subscribed' && row.newsletterConsent === true && Boolean(row.newsletterSubscribedAt && row.newsletterConsentText?.trim()) && validEmail(normalizeEmail(row.email));
const blocked = (row: typeof contacts.$inferSelect) => ['unsubscribed', 'bounced', 'complained'].includes(row.newsletterSubscriptionStatus || '') || row.newsletterConsent === false;
const toCampaign = (row: typeof campaigns.$inferSelect): NewsletterCampaign => { const {requestKey,requestHash,...value}=row; return { ...value, state: row.state as NewsletterCampaign['state'], createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString(), scheduledAt: row.scheduledAt?.toISOString() || null }; };
const toDelivery = (row: typeof deliveries.$inferSelect): NewsletterDelivery => ({ ...row, state: row.state as NewsletterDelivery['state'], createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString() });
const nextVersion = (row: typeof campaigns.$inferSelect) => ({ version: row.version + 1, updatedAt: new Date() });

export function createNewsletterCampaignRepository(db: DatabaseInstance, adapterType: string): NewsletterCampaignRepository {
  const database = db as NodePgDatabase<typeof schema>;
  const ensure = () => { if (adapterType !== 'postgres') fail('NEWSLETTER_JOURNAL_UNAVAILABLE', 503, 'Campaigns require the persisted PostgreSQL runtime.'); };
  const transaction = async <T>(siteId: string, operation: (tx: any) => Promise<T>): Promise<T> => {
    ensure(); if (!uuid(siteId)) fail('SITE_NOT_FOUND', 404, 'Site not found.');
    return database.transaction(async tx => {
      const [site] = await tx.select({ id: sites.id }).from(sites).where(eq(sites.id, siteId)).for('update');
      if (!site) fail('SITE_NOT_FOUND', 404, 'Site not found.');
      return operation(tx);
    });
  };
  const lockedCampaign = async (tx: any, siteId: string, id: string, version?: number): Promise<typeof campaigns.$inferSelect> => {
    if (!uuid(id)) fail('NEWSLETTER_CAMPAIGN_NOT_FOUND', 404, 'Campaign not found.');
    const [row] = await tx.select().from(campaigns).where(and(eq(campaigns.siteId, siteId), eq(campaigns.id, id))).for('update');
    if (!row) fail('NEWSLETTER_CAMPAIGN_NOT_FOUND', 404, 'Campaign not found.');
    if (version !== undefined && row.version !== version) fail('NEWSLETTER_VERSION_CONFLICT', 409, 'Campaign changed. Reload before applying the action.');
    return row;
  };
  const finish = async (tx: any, row: typeof campaigns.$inferSelect) => {
    const [outstanding] = await tx.select({ id: deliveries.id }).from(deliveries).where(and(eq(deliveries.siteId, row.siteId), eq(deliveries.campaignId, row.id), inArray(deliveries.state, ['pending', 'processing']))).limit(1);
    if (!outstanding && ['queued','scheduled','processing'].includes(row.state)) await tx.update(campaigns).set({ state: 'completed', ...nextVersion(row) }).where(eq(campaigns.id, row.id));
  };
  const suppress = async (tx: any, siteId: string, delivery: typeof deliveries.$inferSelect, reason: 'unsubscribed' | 'bounced' | 'complained') => {
    const [suppressed] = await tx.insert(suppressions).values({siteId, email: delivery.email, reason}).onConflictDoUpdate({target:[suppressions.siteId,suppressions.email],set:{reason:sql`CASE WHEN ${suppressions.reason} = 'complained' OR ${reason} = 'complained' THEN 'complained' WHEN ${suppressions.reason} = 'bounced' OR ${reason} = 'bounced' THEN 'bounced' ELSE 'unsubscribed' END`}}).returning();
    // Suppression is keyed by site + normalized address, surviving contact deletion/recreation.
    await tx.update(contacts).set({newsletterSubscriptionStatus:suppressed.reason,newsletterUnsubscribedAt:new Date(),updatedAt:new Date()}).where(and(eq(contacts.siteId,siteId),sql`lower(trim(${contacts.email})) = ${delivery.email}`));
    await tx.update(deliveries).set({state:'suppressed',errorCode:reason,updatedAt:new Date()}).where(and(eq(deliveries.siteId,siteId),eq(deliveries.email,delivery.email),eq(deliveries.state,'pending')));
  };
  const recordEvent = async (tx: any, siteId: string, deliveryId: string, kind: string, eventId: string, evidence: string | null = null, actorId: string | null = null) => {
    if (!eventId || eventId.length > 200) fail('NEWSLETTER_EVENT_INVALID',400,'A bounded feedback event ID is required.');
    const id = createHash('sha256').update(siteId + ':' + eventId).digest('hex');
    const [existing] = await tx.select().from(events).where(eq(events.id,id));
    if (existing) {
      if (existing.deliveryId !== deliveryId || existing.kind !== kind) fail('NEWSLETTER_EVENT_CONFLICT',409,'The feedback event ID was already used for another outcome.');
      return false;
    }
    await tx.insert(events).values({id,siteId,deliveryId,kind,evidence:evidence?.slice(0,500)||null,actorId}); return true;
  };
  return {
    async due(limit) { ensure(); return database.select({siteId:campaigns.siteId,id:campaigns.id}).from(campaigns).where(and(inArray(campaigns.state,['queued','scheduled','processing']),sql`(${campaigns.scheduledAt} IS NULL OR ${campaigns.scheduledAt} <= now())`)).orderBy(campaigns.updatedAt,campaigns.id).limit(Math.max(1,Math.min(10,limit))); },
    create: (siteId, input, key, actorId) => transaction(siteId, async tx => {
      const draft = validateNewsletterCampaignDraft(input);
      if (!/^[a-zA-Z0-9._:-]{8,120}$/.test(key)) fail('NEWSLETTER_REQUEST_KEY_INVALID',400,'Use an idempotency key of 8–120 letters, digits, dots, dashes or colons.');
      const hash = createHash('sha256').update(JSON.stringify(draft)).digest('hex');
      const [existing] = await tx.select().from(campaigns).where(and(eq(campaigns.siteId,siteId),eq(campaigns.requestKey,key)));
      if (existing) { if (existing.requestHash !== hash) fail('NEWSLETTER_REQUEST_CONFLICT',409,'The idempotency key already belongs to a different draft.'); return toCampaign(existing); }
      if (draft.formId) { const [form] = await tx.select({id:forms.id}).from(forms).where(and(eq(forms.siteId,siteId),eq(forms.id,draft.formId))); if (!form) fail('NEWSLETTER_FORM_NOT_FOUND',404,'Form not found in this site.'); }
      const [row] = await tx.insert(campaigns).values({...draft,siteId,requestKey:key,requestHash:hash,actorId}).returning(); return toCampaign(row);
    }),
    update: (siteId,id,input,version) => transaction(siteId,async tx => {
      const row = await lockedCampaign(tx,siteId,id,version), draft = validateNewsletterCampaignDraft(input);
      if (row.state !== 'draft') fail('NEWSLETTER_DRAFT_LOCKED',409,'Only a draft campaign can be edited.');
      if (draft.formId) { const [form] = await tx.select({id:forms.id}).from(forms).where(and(eq(forms.siteId,siteId),eq(forms.id,draft.formId))); if (!form) fail('NEWSLETTER_FORM_NOT_FOUND',404,'Form not found in this site.'); }
      const [saved] = await tx.update(campaigns).set({...draft,...nextVersion(row)}).where(eq(campaigns.id,id)).returning(); return toCampaign(saved);
    }),
    async list(siteId,limit,offset) {
      ensure(); if(!uuid(siteId)) return {items:[],total:0};
      return database.transaction(async tx => { const [total] = await tx.select({n:count()}).from(campaigns).where(eq(campaigns.siteId,siteId)); const rows = await tx.select().from(campaigns).where(eq(campaigns.siteId,siteId)).orderBy(desc(campaigns.createdAt),desc(campaigns.id)).limit(Math.max(1,Math.min(100,limit))).offset(Math.max(0,offset)); return {items:rows.map(toCampaign),total:Number(total.n)}; }, {isolationLevel:'repeatable read',accessMode:'read only'});
    },
    async detail(siteId,id) {
      ensure(); if(!uuid(siteId)||!uuid(id)) return null;
      return database.transaction(async tx => { const [row] = await tx.select().from(campaigns).where(and(eq(campaigns.siteId,siteId),eq(campaigns.id,id))); if(!row)return null; const result = await tx.select().from(deliveries).where(and(eq(deliveries.siteId,siteId),eq(deliveries.campaignId,id))).orderBy(deliveries.createdAt,deliveries.id).limit(100); const counts: any = {}; for(const d of result)counts[d.state]=(counts[d.state]||0)+1; return {campaign:toCampaign(row),deliveries:result.map(toDelivery),counts}; }, {isolationLevel:'repeatable read',accessMode:'read only'});
    },
    queue: (siteId,id,version,scheduledAt,limit) => transaction(siteId,async tx => {
      const row = await lockedCampaign(tx,siteId,id,version);
      if(row.state!=='draft')fail('NEWSLETTER_ALREADY_QUEUED',409,'Only a draft can be queued once.');
      if(!Number.isInteger(limit)||limit<1||limit>100)fail('NEWSLETTER_LIMIT_INVALID',400,'Recipient limit must be 1–100.');
      const scheduled = scheduledAt ? new Date(scheduledAt) : null;
      if(scheduled && (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/.test(scheduledAt!)||!Number.isFinite(scheduled.getTime())||scheduled.getTime()<=Date.now()||scheduled.getTime()>Date.now()+30*86400000))fail('NEWSLETTER_SCHEDULE_INVALID',400,'Schedule within the next 30 days.');
      // Query only explicit subscription + consent candidates. Refuse oversized audiences instead of truncating.
      const candidates: typeof contacts.$inferSelect[] = await tx.select().from(contacts).where(and(eq(contacts.siteId,siteId),eq(contacts.newsletterSubscriptionStatus,'subscribed'),eq(contacts.newsletterConsent,true),row.formId?eq(contacts.formId,row.formId):undefined)).orderBy(contacts.createdAt,contacts.id).limit(1001).for('update');
      if(candidates.length>1000)fail('NEWSLETTER_AUDIENCE_TOO_LARGE',409,'Select a smaller signup form audience before queueing.');
      const valid = candidates.filter(eligible), emails = [...new Set(valid.map(c=>normalizeEmail(c.email)))];
      const held: typeof suppressions.$inferSelect[] = emails.length ? await tx.select().from(suppressions).where(and(eq(suppressions.siteId,siteId),inArray(suppressions.email,emails))) : [];
      const siblings: typeof contacts.$inferSelect[] = emails.length ? await tx.select().from(contacts).where(and(eq(contacts.siteId,siteId),inArray(sql`lower(trim(${contacts.email}))`,emails))).for('update') : [];
      const excluded = new Set([...held.map(h=>h.email),...siblings.filter(blocked).map(c=>normalizeEmail(c.email))]);
      const unique = valid.filter((c,i)=>!excluded.has(normalizeEmail(c.email)) && valid.findIndex(o=>normalizeEmail(o.email)===normalizeEmail(c.email))===i);
      if(!unique.length)fail('NEWSLETTER_NO_RECIPIENTS',409,'No subscribers have current explicit consent and are free of suppressions.');
      if(unique.length>limit)fail('NEWSLETTER_AUDIENCE_TOO_LARGE',409,`Audience has ${unique.length} eligible recipients; configured campaign limit is ${limit}. Select a smaller signup form.`);
      await tx.insert(deliveries).values(unique.map(c=>({siteId,campaignId:id,contactId:c.id,email:normalizeEmail(c.email)})));
      const [saved] = await tx.update(campaigns).set({state:scheduled?'scheduled':'queued',scheduledAt:scheduled,recipientCount:unique.length,...nextVersion(row)}).where(eq(campaigns.id,id)).returning();return toCampaign(saved);
    }),
    cancel: (siteId,id,version) => transaction(siteId,async tx => {
      const row=await lockedCampaign(tx,siteId,id,version);
      if(['completed','cancelled'].includes(row.state))fail('NEWSLETTER_CANCEL_CONFLICT',409,'Campaign is already completed or cancelled.');
      await tx.update(deliveries).set({state:'cancelled',updatedAt:new Date()}).where(and(eq(deliveries.siteId,siteId),eq(deliveries.campaignId,id),eq(deliveries.state,'pending')));
      const [saved]=await tx.update(campaigns).set({state:'cancelled',...nextVersion(row)}).where(eq(campaigns.id,id)).returning();return toCampaign(saved);
    }),
    claim: (siteId,id,dailyLimit) => transaction(siteId,async tx => {
      if(!Number.isInteger(dailyLimit)||dailyLimit<1||dailyLimit>40)fail('NEWSLETTER_BUDGET_INVALID',503,'Campaign daily budget must be 1–40 across the deployment.');
      const row=await lockedCampaign(tx,siteId,id),now=new Date();
      // A crashed attempt is held as uncertain permanently; SMTP has no exactly-once primitive.
      await tx.update(deliveries).set({state:'uncertain',errorCode:'NEWSLETTER_WORKER_INTERRUPTED',updatedAt:now}).where(and(eq(deliveries.siteId,siteId),eq(deliveries.campaignId,id),eq(deliveries.state,'processing'),lte(deliveries.updatedAt,new Date(now.getTime()-10*60000))));
      if(!['queued','scheduled','processing'].includes(row.state))return null;
      if(row.scheduledAt&&row.scheduledAt>now)return null;
      const pending: typeof deliveries.$inferSelect[] = await tx.select().from(deliveries).where(and(eq(deliveries.siteId,siteId),eq(deliveries.campaignId,id),eq(deliveries.state,'pending'))).orderBy(deliveries.createdAt,deliveries.id).limit(100).for('update');
      for(const d of pending) {
        const siblings: typeof contacts.$inferSelect[] = await tx.select().from(contacts).where(and(eq(contacts.siteId,siteId),sql`lower(trim(${contacts.email})) = ${d.email}`)).for('update');
        const current = siblings.find(c=>c.id===d.contactId), [held]=await tx.select().from(suppressions).where(and(eq(suppressions.siteId,siteId),eq(suppressions.email,d.email)));
        if(!current||!eligible(current)||siblings.some(blocked)||held) { await tx.update(deliveries).set({state:'suppressed',errorCode:'NEWSLETTER_CURRENT_CONSENT_HELD',updatedAt:now}).where(eq(deliveries.id,d.id));continue; }
        const day = now.toISOString().slice(0,10);
        await tx.insert(gate).values({id:'smtp-newsletter',day,count:0,nextAt:now}).onConflictDoNothing();
        const [budget] = await tx.select().from(gate).where(eq(gate.id,'smtp-newsletter')).for('update');
        if(budget.nextAt>now || (budget.day===day && budget.count>=dailyLimit))return null;
        await tx.update(gate).set({day,count:budget.day===day?budget.count+1:1,nextAt:new Date(now.getTime()+5000)}).where(eq(gate.id,'smtp-newsletter'));
        const [claimed]=await tx.update(deliveries).set({state:'processing',updatedAt:now}).where(eq(deliveries.id,d.id)).returning();
        const [saved]=await tx.update(campaigns).set({state:'processing',...nextVersion(row)}).where(eq(campaigns.id,id)).returning();
        return {campaign:toCampaign(saved),delivery:toDelivery(claimed)};
      }
      await finish(tx,row);return null;
    }),
    settle: (siteId,id,state,providerMessageId,errorCode) => transaction(siteId,async tx => {
      if(!uuid(id)||!['accepted','failed','uncertain'].includes(state))fail('NEWSLETTER_DELIVERY_INVALID',400,'Invalid delivery outcome.');
      const [d] = await tx.select().from(deliveries).where(and(eq(deliveries.siteId,siteId),eq(deliveries.id,id))).for('update');
      if(!d||d.state!=='processing')fail('NEWSLETTER_OUTCOME_CONFLICT',409,'This delivery outcome cannot be overwritten or resent.');
      await tx.update(deliveries).set({state,providerMessageId:providerMessageId||null,errorCode:state==='accepted'?null:errorCode==='VISITOR_PRIVACY_FENCED'?'VISITOR_PRIVACY_FENCED':'NEWSLETTER_TRANSPORT_UNCERTAIN',updatedAt:new Date()}).where(eq(deliveries.id,id));
      await finish(tx,await lockedCampaign(tx,siteId,d.campaignId));
    }),
    suppressByDelivery: (siteId,id,reason,eventId) => transaction(siteId,async tx => {
      if(!uuid(id)||!['unsubscribed','bounced','complained'].includes(reason))fail('NEWSLETTER_DELIVERY_NOT_FOUND',404,'Delivery not found.');
      const [d] = await tx.select().from(deliveries).where(and(eq(deliveries.siteId,siteId),eq(deliveries.id,id))).for('update');
      if(!d)fail('NEWSLETTER_DELIVERY_NOT_FOUND',404,'Delivery not found.');
      if(!await recordEvent(tx,siteId,id,reason,eventId))return;
      await suppress(tx,siteId,d,reason); await finish(tx,await lockedCampaign(tx,siteId,d.campaignId));
    }),
    feedback: (siteId,id,state,eventId,evidence,actorId) => transaction(siteId,async tx => {
      if(!uuid(id)||!['delivered','bounced','complained'].includes(state))fail('NEWSLETTER_FEEDBACK_INVALID',400,'Invalid newsletter feedback.');
      const [d] = await tx.select().from(deliveries).where(and(eq(deliveries.siteId,siteId),eq(deliveries.id,id))).for('update');
      if(!d)fail('NEWSLETTER_DELIVERY_NOT_FOUND',404,'Delivery not found.');
      if(!['processing','accepted','uncertain','delivered','bounced','complained'].includes(d.state))fail('NEWSLETTER_FEEDBACK_CONFLICT',409,'Feedback requires an attempted delivery.');
      if(!await recordEvent(tx,siteId,id,state,eventId,evidence,actorId))return;
      const rank:Record<string,number>={processing:0,uncertain:0,accepted:1,delivered:2,bounced:3,complained:4};
      if(rank[state]>rank[d.state])await tx.update(deliveries).set({state,updatedAt:new Date()}).where(eq(deliveries.id,id));
      if(state==='bounced'||state==='complained')await suppress(tx,siteId,d,state);
      await finish(tx,await lockedCampaign(tx,siteId,d.campaignId));
    }),
  };
}
