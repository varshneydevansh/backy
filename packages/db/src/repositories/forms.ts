import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import * as schema from '../schema';
import { sites } from '../schema';
import { createDatabaseRepositories } from './factory';
import { withVisitorPrivacyFollowup } from './visitor-privacy-admission';
import { withActiveVisitorAdmission } from './visitor-accounts';
import { createHash } from 'node:crypto';
import { serializeBackyFormVersion, snapshotFormTemplateDesign, assertFormDesignOnlyUpdate, type BackyFormUpdateInput, type BackyFormDesignRevision } from '@backy-cms/core';
import {
    type BackyContactListInput,
    type BackyFormListInput,
    type BackyFormRepository,
    type BackyFormSubmissionListInput,
    type BackyListResult,
    type BackyRepositoryMutationResult,
    type Contact,
    type FormDefinition,
    type FormSubmission,
} from '@backy-cms/core';
import { and, desc, eq, sql } from 'drizzle-orm';
import {
    formContacts,
    formDefinitions,
    formDesignRevisions,
    formSubmissions,
} from '../schema';
import type { DatabaseInstance } from '../adapters';

type QueryDatabase = {
    select: (...args: unknown[]) => {
        from: (table: unknown) => QueryBuilder;
    };
    insert: (table: unknown) => {
        values: (value: Record<string, unknown>) => ReturningQuery;
    };
    update: (table: unknown) => {
        set: (value: Record<string, unknown>) => {
            where: (condition: unknown) => ReturningQuery;
        };
    };
    delete: (table: unknown) => {
        where: (condition: unknown) => ReturningQuery;
    };
};

type QueryBuilder = {
    where: (condition: unknown) => QueryBuilder;
    orderBy: (...columns: unknown[]) => QueryBuilder;
    limit: (limit: number) => QueryBuilder;
    offset: (offset: number) => QueryBuilder;
    then: Promise<unknown[]>['then'];
};

type ReturningQuery = {
    returning: () => Promise<unknown[]>;
};

type FormRow = typeof formDefinitions.$inferSelect;
type SubmissionRow = typeof formSubmissions.$inferSelect;
type ContactRow = typeof formContacts.$inferSelect;

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 100;

const asDb = (db: DatabaseInstance): QueryDatabase => db as unknown as QueryDatabase;

const isRecord = (value: unknown): value is Record<string, unknown> => (
    typeof value === 'object' && value !== null && !Array.isArray(value)
);

const toIso = (value: Date | string | null | undefined): string => {
    if (value instanceof Date) {
        return value.toISOString();
    }
    return value || new Date().toISOString();
};

const toNullableIso = (value: Date | string | null | undefined): string | null => (
    value ? toIso(value) : null
);

const normalizeLimit = (limit?: number): number => (
    Math.max(1, Math.min(MAX_LIMIT, Math.floor(limit || DEFAULT_LIMIT)))
);

const normalizeOffset = (offset?: number): number => (
    Math.max(0, Math.floor(offset || 0))
);

const paginate = <TItem>(items: TItem[], limit?: number, offset?: number): BackyListResult<TItem> => {
    const normalizedLimit = normalizeLimit(limit);
    const normalizedOffset = normalizeOffset(offset);
    const pagedItems = items.slice(normalizedOffset, normalizedOffset + normalizedLimit);

    return {
        items: pagedItems,
        pagination: {
            total: items.length,
            limit: normalizedLimit,
            offset: normalizedOffset,
            hasMore: normalizedOffset + normalizedLimit < items.length,
        },
    };
};

const firstOrNull = async <TRow>(query: PromiseLike<unknown[]>): Promise<TRow | null> => {
    const rows = await query;
    return (rows[0] || null) as TRow | null;
};

const searchText = (value: string | null | undefined, search: string): boolean => (
    (value || '').toLowerCase().includes(search.toLowerCase())
);

const normalizedAudience = (value: unknown): FormDefinition['audience'] => (
    value === 'authenticated' || value === 'adminOnly' ? value : 'public'
);

const normalizedModerationMode = (value: unknown): FormDefinition['moderationMode'] => (
    value === 'auto-approve' ? 'auto-approve' : 'manual'
);

const normalizedSubmissionStatus = (value: unknown): FormSubmission['status'] => (
    value === 'approved' || value === 'rejected' || value === 'spam' ? value : 'pending'
);

const normalizedContactStatus = (value: unknown): Contact['status'] => (
    value === 'contacted' || value === 'qualified' || value === 'archived' ? value : 'new'
);

const normalizedNewsletterSubscriptionStatus = (value: unknown): Contact['newsletterSubscriptionStatus'] => (
    value === 'subscribed' || value === 'unsubscribed' || value === 'pending' || value === 'bounced' || value === 'complained'
        ? value
        : null
);

const toForm = (row: FormRow): FormDefinition => {
    const settings = isRecord(row.settings) ? row.settings : {};

    return {
        id: row.id,
        siteId: row.siteId,
        pageId: row.pageId,
        postId: row.postId,
        name: row.name,
        title: row.title,
        description: row.description,
        audience: normalizedAudience(row.audience),
        isActive: row.isActive,
        fields: Array.isArray(row.fields) ? row.fields as FormDefinition['fields'] : [],
        notificationEmail: row.notificationEmail,
        notificationWebhook: row.notificationWebhook,
        successRedirectUrl: row.successRedirectUrl,
        successMessage: row.successMessage,
        enableHoneypot: row.enableHoneypot,
        enableCaptcha: row.enableCaptcha,
        spamSettings: isRecord(settings.spam) ? settings.spam as FormDefinition['spamSettings'] : undefined,
        consentSettings: isRecord(settings.consent) ? settings.consent as FormDefinition['consentSettings'] : undefined,
        moderationMode: normalizedModerationMode(row.moderationMode),
        contactShare: isRecord(row.contactShare) ? row.contactShare as FormDefinition['contactShare'] : undefined,
        collectionTarget: isRecord(row.collectionTarget) ? row.collectionTarget as FormDefinition['collectionTarget'] : undefined,
        settings,
        createdBy: row.createdBy,
        updatedBy: row.updatedBy,
        createdAt: toIso(row.createdAt),
        updatedAt: toIso(row.updatedAt),
    };
};

const mergeFormSettings = (
    settings: unknown,
    spamSettings?: FormDefinition['spamSettings'],
    consentSettings?: FormDefinition['consentSettings'],
): Record<string, unknown> => {
    const base = isRecord(settings) ? settings : {};
    return {
        ...base,
        ...(spamSettings !== undefined
            ? { spam: { ...(isRecord(base.spam) ? base.spam : {}), ...spamSettings } }
            : {}),
        ...(consentSettings !== undefined
            ? { consent: { ...(isRecord(base.consent) ? base.consent : {}), ...consentSettings } }
            : {}),
    };
};

const toSubmission = (row: SubmissionRow): FormSubmission => ({
    visitorMemberId: row.visitorMemberId,
    id: row.id,
    siteId: row.siteId,
    formId: row.formId,
    pageId: row.pageId,
    postId: row.postId,
    values: isRecord(row.values) ? row.values : {},
    ipHash: row.ipHash,
    userAgent: row.userAgent,
    requestId: row.requestId,
    status: normalizedSubmissionStatus(row.status),
    reviewedBy: row.reviewedBy,
    reviewedAt: toNullableIso(row.reviewedAt),
    adminNotes: row.adminNotes,
    updatedAt: toIso(row.updatedAt),
    collectionRecord: isRecord(row.collectionRecord) ? row.collectionRecord as unknown as FormSubmission['collectionRecord'] : null,
    collectionRecordErrors: Array.isArray(row.collectionRecordErrors) ? row.collectionRecordErrors as FormSubmission['collectionRecordErrors'] : [],
    submittedAt: toIso(row.submittedAt),
});

const toContact = (row: ContactRow): Contact => ({
    id: row.id,
    siteId: row.siteId,
    formId: row.formId,
    pageId: row.pageId,
    postId: row.postId,
    name: row.name,
    email: row.email,
    phone: row.phone,
    notes: row.notes,
    sourceValues: isRecord(row.sourceValues) ? row.sourceValues : {},
    newsletterSubscriptionStatus: normalizedNewsletterSubscriptionStatus(row.newsletterSubscriptionStatus),
    newsletterSubscribedAt: toNullableIso(row.newsletterSubscribedAt),
    newsletterUnsubscribedAt: toNullableIso(row.newsletterUnsubscribedAt),
    newsletterTopics: row.newsletterTopics,
    newsletterSource: row.newsletterSource,
    newsletterConsent: row.newsletterConsent,
    newsletterConsentText: row.newsletterConsentText,
    status: normalizedContactStatus(row.status),
    sourceSubmissionId: row.sourceSubmissionId || undefined,
    requestId: row.requestId,
    sourceIpHash: row.sourceIpHash,
    createdAt: toIso(row.createdAt),
    updatedAt: toIso(row.updatedAt),
});

export function createFormRepository(db: DatabaseInstance, adapterType = 'postgres', definitionScope?: { siteId: string; formId: string; form: FormDefinition }): BackyFormRepository {
    const database = asDb(db);

    return {
        withSubmissionFollowup: (siteId, formId, submissionId, operation) => withVisitorPrivacyFollowup(db, siteId, { formId, submissionId }, operation),
        withContactFollowup: (siteId, contactId, operation) => withVisitorPrivacyFollowup(db, siteId, { contactId }, operation),
        async withDefinitionWriteLock(siteId, formId, operation) {
            if (definitionScope?.siteId === siteId && definitionScope.formId === formId) return operation(this, definitionScope.form, createDatabaseRepositories({ adapter: { type: 'postgres', db, isConnected: async () => true, close: async () => {} } }));
            if (adapterType !== 'postgres') throw Object.assign(Error('Guarded form authoring requires PostgreSQL.'), { code: 'FORM_DEFINITION_WRITE_UNAVAILABLE' });
            return (db as NodePgDatabase<typeof schema>).transaction(async tx => {
                const [site] = await tx.select({ id: sites.id }).from(sites).where(eq(sites.id, siteId)).for('update');
                const [row] = site ? await tx.select().from(formDefinitions).where(and(eq(formDefinitions.siteId, siteId), eq(formDefinitions.id, formId))).for('update') : [];
                if (!row) throw Object.assign(Error('Form not found.'), { code: 'FORM_NOT_FOUND' });
                return createFormRepository(tx as unknown as DatabaseInstance, adapterType, { siteId, formId, form: toForm(row) }).withDefinitionWriteLock!(siteId, formId, operation);
            });
        },
        async withTemplatePackImportLock(siteId, operation) {
            if (adapterType !== 'postgres') throw Object.assign(new Error('Atomic form template import is unavailable.'), { code: 'FORM_TEMPLATE_IMPORT_UNAVAILABLE' });
            return (db as NodePgDatabase<typeof schema>).transaction(async tx => {
                const [site] = await tx.select({ id: sites.id }).from(sites).where(eq(sites.id, siteId)).for('update');
                if (!site) throw Object.assign(new Error('Site not found.'), { code: 'SITE_NOT_FOUND' });
                return operation(createDatabaseRepositories({ adapter: { type: 'postgres', db: tx as unknown as DatabaseInstance, isConnected: async () => true, close: async () => {} } }));
            }, { isolationLevel: 'serializable' });
        },
        async list(input: BackyFormListInput): Promise<BackyListResult<FormDefinition>> {
            const rows = await database.select().from(formDefinitions).where(eq(formDefinitions.siteId, input.siteId)).orderBy(desc(formDefinitions.updatedAt)) as FormRow[];
            const filtered = rows
                .map(toForm)
                .filter((form) => input.pageId ? form.pageId === input.pageId : true)
                .filter((form) => input.postId ? form.postId === input.postId : true)
                .filter((form) => input.isActive === undefined ? true : form.isActive === input.isActive)
                .filter((form) => input.search ? searchText(`${form.name} ${form.title || ''} ${form.description || ''}`, input.search) : true);
            return paginate(filtered, input.limit, input.offset);
        },

        async getById(siteId: string, formId: string): Promise<FormDefinition | null> {
            const row = await firstOrNull<FormRow>(
                database.select().from(formDefinitions).where(and(eq(formDefinitions.siteId, siteId), eq(formDefinitions.id, formId))).limit(1),
            );
            return row ? toForm(row) : null;
        },

        async create(input: Omit<FormDefinition, 'id' | 'createdAt' | 'updatedAt'>): Promise<BackyRepositoryMutationResult<FormDefinition>> {
            const [row] = await database.insert(formDefinitions).values({
                siteId: input.siteId,
                pageId: input.pageId || null,
                postId: input.postId || null,
                name: input.name,
                title: input.title || null,
                description: input.description || null,
                audience: input.audience || 'public',
                isActive: input.isActive,
                fields: input.fields || [],
                notificationEmail: input.notificationEmail || null,
                notificationWebhook: input.notificationWebhook || null,
                successRedirectUrl: input.successRedirectUrl || null,
                successMessage: input.successMessage || null,
                enableHoneypot: input.enableHoneypot !== false,
                enableCaptcha: input.enableCaptcha === true,
                moderationMode: input.moderationMode || 'manual',
                contactShare: input.contactShare || {},
                collectionTarget: input.collectionTarget || {},
                settings: mergeFormSettings(input.settings, input.spamSettings, input.consentSettings),
                createdBy: input.createdBy || null,
                updatedBy: input.updatedBy || null,
                updatedAt: new Date(),
            }).returning() as FormRow[];
            return { item: toForm(row) };
        },

        async update(siteId: string, formId: string, input: BackyFormUpdateInput): Promise<BackyRepositoryMutationResult<FormDefinition>> {
            if (adapterType === 'postgres' && (definitionScope?.siteId !== siteId || definitionScope.formId !== formId)) return this.withDefinitionWriteLock!(siteId, formId, repository => repository.update(siteId, formId, input));
            if (adapterType !== 'postgres' && (input.expectedVersion !== undefined || input.expectedForm || input.beforeUpdateFormDesignRevision)) throw Object.assign(Error('Guarded form authoring requires PostgreSQL.'), { code: 'FORM_DEFINITION_WRITE_UNAVAILABLE' });
            const before = definitionScope?.form;
            if (before) {
                const version = (form: FormDefinition) => `form-v1:${createHash('sha256').update(serializeBackyFormVersion(form)).digest('hex')}`;
                if ((input.expectedVersion !== undefined && input.expectedVersion !== version(before)) || (input.expectedForm && version(input.expectedForm) !== version(before))) throw Object.assign(Error('The form changed.'), { code: 'FORM_DEFINITION_CONFLICT' });
                if (input.beforeUpdateFormDesignRevision) {
                    assertFormDesignOnlyUpdate(before, input);
                    const details = input.beforeUpdateFormDesignRevision;
                    await database.insert(formDesignRevisions).values({ siteId, formId, snapshot: snapshotFormTemplateDesign(before), ...details, templateId: details.templateId || null, targetRevisionId: details.targetRevisionId || null, actorId: details.actorId || null }).returning();
                }
            }
            const updates: Record<string, unknown> = { updatedAt: new Date() };
            if (input.pageId !== undefined) updates.pageId = input.pageId;
            if (input.postId !== undefined) updates.postId = input.postId;
            if (input.name !== undefined) updates.name = input.name;
            if (input.title !== undefined) updates.title = input.title;
            if (input.description !== undefined) updates.description = input.description;
            if (input.audience !== undefined) updates.audience = input.audience;
            if (input.isActive !== undefined) updates.isActive = input.isActive;
            if (input.fields !== undefined) updates.fields = input.fields;
            if (input.notificationEmail !== undefined) updates.notificationEmail = input.notificationEmail;
            if (input.notificationWebhook !== undefined) updates.notificationWebhook = input.notificationWebhook;
            if (input.successRedirectUrl !== undefined) updates.successRedirectUrl = input.successRedirectUrl;
            if (input.successMessage !== undefined) updates.successMessage = input.successMessage;
            if (input.enableHoneypot !== undefined) updates.enableHoneypot = input.enableHoneypot;
            if (input.enableCaptcha !== undefined) updates.enableCaptcha = input.enableCaptcha;
            if (input.moderationMode !== undefined) updates.moderationMode = input.moderationMode;
            if (input.contactShare !== undefined) updates.contactShare = input.contactShare || {};
            if (input.collectionTarget !== undefined) updates.collectionTarget = input.collectionTarget || {};
            if (
                input.settings !== undefined ||
                input.spamSettings !== undefined ||
                input.consentSettings !== undefined
            ) {
                const existing = input.settings !== undefined
                    ? null
                    : await firstOrNull<FormRow>(
                        database.select().from(formDefinitions).where(and(eq(formDefinitions.siteId, siteId), eq(formDefinitions.id, formId))).limit(1),
                    );
                updates.settings = mergeFormSettings(
                    input.settings !== undefined ? input.settings : existing?.settings,
                    input.spamSettings,
                    input.consentSettings,
                );
            }
            if (input.updatedBy !== undefined) updates.updatedBy = input.updatedBy;

            const [row] = await database.update(formDefinitions).set(updates).where(and(eq(formDefinitions.siteId, siteId), eq(formDefinitions.id, formId))).returning() as FormRow[];
            return { item: toForm(row) };
        },

        async listFormDesignRevisions(siteId, formId, options = {}) {
            const rows = await database.select().from(formDesignRevisions).where(and(eq(formDesignRevisions.siteId, siteId), eq(formDesignRevisions.formId, formId))).orderBy(desc(formDesignRevisions.createdAt), desc(formDesignRevisions.id)).limit(Math.min(100, Math.max(1, options.limit || 100)) + 1).offset(Math.max(0, options.offset || 0));
            return (rows as typeof formDesignRevisions.$inferSelect[]).map(row => ({ ...row, snapshot: row.snapshot as BackyFormDesignRevision['snapshot'], operation: row.operation as BackyFormDesignRevision['operation'], createdAt: row.createdAt.toISOString() }));
        },
        async getFormDesignRevision(siteId, formId, revisionId) {
            const [row] = await database.select().from(formDesignRevisions).where(and(eq(formDesignRevisions.siteId, siteId), eq(formDesignRevisions.formId, formId), eq(formDesignRevisions.id, revisionId))).limit(1) as typeof formDesignRevisions.$inferSelect[];
            return row ? { ...row, snapshot: row.snapshot as BackyFormDesignRevision['snapshot'], operation: row.operation as BackyFormDesignRevision['operation'], createdAt: row.createdAt.toISOString() } : null;
        },

        async delete(siteId: string, formId: string): Promise<boolean> {
            await database.delete(formDefinitions).where(and(eq(formDefinitions.siteId, siteId), eq(formDefinitions.id, formId)));
            return true;
        },

        async listSubmissions(input: BackyFormSubmissionListInput): Promise<BackyListResult<FormSubmission>> {
            const rows = await database.select().from(formSubmissions).where(eq(formSubmissions.siteId, input.siteId)).orderBy(desc(formSubmissions.submittedAt)) as SubmissionRow[];
            const filtered = rows
                .map(toSubmission)
                .filter((submission) => input.formId ? submission.formId === input.formId : true)
                .filter((submission) => input.status && input.status !== 'all' ? submission.status === input.status : true)
                .filter((submission) => input.requestId ? submission.requestId === input.requestId : true)
                .filter((submission) => input.search ? searchText(JSON.stringify(submission.values), input.search) : true);
            return paginate(filtered, input.limit, input.offset);
        },

        async getSubmissionById(siteId: string, formId: string, submissionId: string): Promise<FormSubmission | null> {
            const row = await firstOrNull<SubmissionRow>(
                database.select().from(formSubmissions).where(and(
                    eq(formSubmissions.siteId, siteId),
                    eq(formSubmissions.formId, formId),
                    eq(formSubmissions.id, submissionId),
                )).limit(1),
            );
            return row ? toSubmission(row) : null;
        },

        async createSubmission(input: Omit<FormSubmission, 'id' | 'submittedAt'>): Promise<BackyRepositoryMutationResult<FormSubmission>> {
            return withActiveVisitorAdmission(db, input.siteId, input.visitorMemberId, async persistedDatabase => {
            const [row] = await asDb(persistedDatabase).insert(formSubmissions).values({
                visitorMemberId: input.visitorMemberId || null,
                siteId: input.siteId,
                formId: input.formId,
                pageId: input.pageId || null,
                postId: input.postId || null,
                values: input.values,
                ipHash: input.ipHash || null,
                userAgent: input.userAgent || null,
                requestId: input.requestId || null,
                status: input.status || 'pending',
                reviewedBy: input.reviewedBy || null,
                reviewedAt: input.reviewedAt ? new Date(input.reviewedAt) : null,
                adminNotes: input.adminNotes || null,
                collectionRecord: input.collectionRecord || null,
                collectionRecordErrors: input.collectionRecordErrors || [],
                updatedAt: new Date(),
            }).returning() as SubmissionRow[];
            return { item: toSubmission(row) };
            });
        },

        async updateSubmission(siteId: string, submissionId: string, input: Partial<FormSubmission>): Promise<BackyRepositoryMutationResult<FormSubmission>> {
            const updates: Record<string, unknown> = { updatedAt: new Date() };
            if (input.status !== undefined) updates.status = input.status;
            if (input.reviewedBy !== undefined) updates.reviewedBy = input.reviewedBy;
            if (input.reviewedAt !== undefined) updates.reviewedAt = input.reviewedAt ? new Date(input.reviewedAt) : null;
            if (input.adminNotes !== undefined) updates.adminNotes = input.adminNotes;
            if (input.collectionRecord !== undefined) updates.collectionRecord = input.collectionRecord;
            if (input.collectionRecordErrors !== undefined) updates.collectionRecordErrors = input.collectionRecordErrors;
            if (input.values !== undefined) updates.values = input.values;
            if (input.ipHash !== undefined) updates.ipHash = input.ipHash;
            if (input.userAgent !== undefined) updates.userAgent = input.userAgent;

            const [row] = await database.update(formSubmissions).set(updates).where(and(eq(formSubmissions.siteId, siteId), eq(formSubmissions.id, submissionId))).returning() as SubmissionRow[];
            return { item: toSubmission(row) };
        },

        async listContacts(input: BackyContactListInput): Promise<BackyListResult<Contact>> {
            const rows = await database.select().from(formContacts).where(eq(formContacts.siteId, input.siteId)).orderBy(desc(formContacts.updatedAt)) as ContactRow[];
            const filtered = rows
                .map(toContact)
                .filter((contact) => input.formId ? contact.formId === input.formId : true)
                .filter((contact) => input.status && input.status !== 'all' ? contact.status === input.status : true)
                .filter((contact) => input.newsletterOnly ? Boolean(contact.newsletterSubscriptionStatus) : true)
                .filter((contact) => input.newsletterSubscriptionStatus && input.newsletterSubscriptionStatus !== 'all' ? contact.newsletterSubscriptionStatus === input.newsletterSubscriptionStatus : true)
                .filter((contact) => input.requestId ? contact.requestId === input.requestId : true)
                .filter((contact) => input.search ? searchText(`${contact.name || ''} ${contact.email || ''} ${contact.phone || ''} ${contact.notes || ''} ${contact.newsletterTopics || ''} ${contact.newsletterSource || ''}`, input.search) : true);
            return paginate(filtered, input.limit, input.offset);
        },

        async getContactById(siteId: string, formId: string, contactId: string): Promise<Contact | null> {
            const row = await firstOrNull<ContactRow>(
                database.select().from(formContacts).where(and(
                    eq(formContacts.siteId, siteId),
                    eq(formContacts.formId, formId),
                    eq(formContacts.id, contactId),
                )).limit(1),
            );
            return row ? toContact(row) : null;
        },

        async shareContactFromSubmission(siteId, formId, submissionId, input, dedupeByEmail) {
            return withVisitorPrivacyFollowup(db, siteId, { formId, submissionId }, async () => {
              return (db as unknown as NodePgDatabase<typeof schema>).transaction(async tx => {
                const [submission] = await tx.select().from(formSubmissions).where(and(eq(formSubmissions.siteId,siteId),eq(formSubmissions.formId,formId),eq(formSubmissions.id,submissionId))).for('update');
                if (!submission || submission.privacyErasedAt) throw Object.assign(new Error('Visitor source is fenced'),{code:'VISITOR_PRIVACY_FENCED'});
                const [existing] = dedupeByEmail && input.email ? await tx.select().from(formContacts).where(and(eq(formContacts.siteId,siteId),eq(formContacts.formId,formId),sql`lower(trim(${formContacts.email})) = ${input.email.trim().toLowerCase()}`)).limit(1).for('update') : [];
                if (existing) await withVisitorPrivacyFollowup(db,siteId,{contactId:existing.id},async()=>undefined);
                const values = {name:input.name ?? existing?.name ?? null,email:input.email ?? existing?.email ?? null,phone:input.phone ?? existing?.phone ?? null,notes:[existing?.notes,input.notes].filter(Boolean).join(existing?.notes?'\n':''),sourceValues:input.sourceValues||{},status:'new',updatedAt:new Date()};
                const [row] = existing ? await tx.update(formContacts).set(values).where(eq(formContacts.id,existing.id)).returning() : await tx.insert(formContacts).values({...values,siteId,formId,pageId:submission.pageId,postId:submission.postId,sourceSubmissionId:submissionId,requestId:submission.requestId,sourceIpHash:submission.ipHash,provenanceAmbiguous:false}).returning();
                await tx.execute(sql`INSERT INTO form_contact_contributors(site_id,contact_id,submission_id,member_id) VALUES(${siteId}::uuid,${row.id}::uuid,${submissionId}::uuid,${submission.visitorMemberId}::uuid) ON CONFLICT DO NOTHING`);
                return {item:toContact(row)};
              });
            });
        },
        async createContact(input: Omit<Contact, 'id' | 'createdAt' | 'updatedAt'>): Promise<BackyRepositoryMutationResult<Contact>> {
            const action = async (writeDb: DatabaseInstance = db) => {
            const [row] = await asDb(writeDb).insert(formContacts).values({
                siteId: input.siteId,
                formId: input.formId,
                pageId: input.pageId || null,
                postId: input.postId || null,
                name: input.name || null,
                email: input.email || null,
                phone: input.phone || null,
                notes: input.notes || null,
                sourceValues: input.sourceValues || {},
                newsletterSubscriptionStatus: input.newsletterSubscriptionStatus || null,
                newsletterSubscribedAt: input.newsletterSubscribedAt ? new Date(input.newsletterSubscribedAt) : null,
                newsletterUnsubscribedAt: input.newsletterUnsubscribedAt ? new Date(input.newsletterUnsubscribedAt) : null,
                newsletterTopics: input.newsletterTopics || null,
                newsletterSource: input.newsletterSource || null,
                newsletterConsent: input.newsletterConsent ?? null,
                newsletterConsentText: input.newsletterConsentText || null,
                status: input.status || 'new',
                sourceSubmissionId: input.sourceSubmissionId || null,
                requestId: input.requestId || null,
                sourceIpHash: input.sourceIpHash || null,
                updatedAt: new Date(),
            }).returning() as ContactRow[];
            if (input.sourceSubmissionId) await (writeDb as unknown as NodePgDatabase).execute(sql`INSERT INTO form_contact_contributors(site_id,contact_id,submission_id,member_id) SELECT ${input.siteId}::uuid,${row.id}::uuid,id,visitor_member_id FROM form_submissions WHERE site_id=${input.siteId}::uuid AND form_id=${input.formId}::uuid AND id=${input.sourceSubmissionId}::uuid ON CONFLICT DO NOTHING`);
            return { item: toContact(row) };
            };
            return input.sourceSubmissionId ? withVisitorPrivacyFollowup(db, input.siteId, { formId: input.formId, submissionId: input.sourceSubmissionId }, () => (db as unknown as NodePgDatabase).transaction(tx => action(tx as unknown as DatabaseInstance))) : action();
        },

        async updateContact(siteId: string, contactId: string, input: Partial<Contact>): Promise<BackyRepositoryMutationResult<Contact>> {
            return withVisitorPrivacyFollowup(db, siteId, { contactId }, async () => (db as unknown as NodePgDatabase<typeof schema>).transaction(async tx => {
            const [before] = await tx.select().from(formContacts).where(and(eq(formContacts.siteId,siteId),eq(formContacts.id,contactId))).for('update');if(!before)throw Object.assign(new Error('Contact unavailable'),{code:'VISITOR_PRIVACY_FENCED'});
            const updates: Record<string, unknown> = { updatedAt: new Date(), provenanceAmbiguous: true };
            if (input.status !== undefined) updates.status = input.status;
            if (input.name !== undefined) updates.name = input.name;
            if (input.email !== undefined) updates.email = input.email;
            if (input.phone !== undefined) updates.phone = input.phone;
            if (input.notes !== undefined) updates.notes = input.notes;
            if (input.pageId !== undefined) updates.pageId = input.pageId;
            if (input.postId !== undefined) updates.postId = input.postId;
            if (input.sourceValues !== undefined) updates.sourceValues = input.sourceValues;
            if (input.newsletterSubscriptionStatus !== undefined) updates.newsletterSubscriptionStatus = input.newsletterSubscriptionStatus;
            if (input.newsletterSubscribedAt !== undefined) updates.newsletterSubscribedAt = input.newsletterSubscribedAt ? new Date(input.newsletterSubscribedAt) : null;
            if (input.newsletterUnsubscribedAt !== undefined) updates.newsletterUnsubscribedAt = input.newsletterUnsubscribedAt ? new Date(input.newsletterUnsubscribedAt) : null;
            if (input.newsletterTopics !== undefined) updates.newsletterTopics = input.newsletterTopics;
            if (input.newsletterSource !== undefined) updates.newsletterSource = input.newsletterSource;
            if (input.newsletterConsent !== undefined) updates.newsletterConsent = input.newsletterConsent;
            if (input.newsletterConsentText !== undefined) updates.newsletterConsentText = input.newsletterConsentText;
            if (input.sourceSubmissionId !== undefined) updates.sourceSubmissionId = input.sourceSubmissionId;
            if (input.requestId !== undefined) updates.requestId = input.requestId;
            if (input.sourceIpHash !== undefined) updates.sourceIpHash = input.sourceIpHash;

            if (input.sourceSubmissionId) await withVisitorPrivacyFollowup(db,siteId,{formId:before.formId,submissionId:input.sourceSubmissionId},async()=>undefined);
            const [row] = await tx.update(formContacts).set(updates).where(and(eq(formContacts.siteId, siteId), eq(formContacts.id, contactId))).returning() as ContactRow[];
            if (input.sourceSubmissionId) await tx.execute(sql`INSERT INTO form_contact_contributors(site_id,contact_id,submission_id,member_id) SELECT ${siteId}::uuid,${row.id}::uuid,id,visitor_member_id FROM form_submissions WHERE site_id=${siteId}::uuid AND form_id=${row.formId}::uuid AND id=${input.sourceSubmissionId}::uuid ON CONFLICT DO NOTHING`);
            return { item: toContact(row) };
            }));
        },

        async deleteContact(siteId: string, contactId: string): Promise<boolean> {
            const rows = await database.delete(formContacts).where(and(eq(formContacts.siteId, siteId), eq(formContacts.id, contactId))).returning();
            return rows.length > 0;
        },
    };
}
