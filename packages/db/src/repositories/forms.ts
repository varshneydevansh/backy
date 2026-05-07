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
import { and, desc, eq } from 'drizzle-orm';
import {
    formContacts,
    formDefinitions,
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
        where: (condition: unknown) => Promise<unknown>;
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

const toForm = (row: FormRow): FormDefinition => ({
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
    moderationMode: normalizedModerationMode(row.moderationMode),
    contactShare: isRecord(row.contactShare) ? row.contactShare as FormDefinition['contactShare'] : undefined,
    collectionTarget: isRecord(row.collectionTarget) ? row.collectionTarget as FormDefinition['collectionTarget'] : undefined,
    createdBy: row.createdBy,
    updatedBy: row.updatedBy,
    createdAt: toIso(row.createdAt),
    updatedAt: toIso(row.updatedAt),
});

const toSubmission = (row: SubmissionRow): FormSubmission => ({
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
    status: normalizedContactStatus(row.status),
    sourceSubmissionId: row.sourceSubmissionId || undefined,
    requestId: row.requestId,
    sourceIpHash: row.sourceIpHash,
    createdAt: toIso(row.createdAt),
    updatedAt: toIso(row.updatedAt),
});

export function createFormRepository(db: DatabaseInstance): BackyFormRepository {
    const database = asDb(db);

    return {
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
                createdBy: input.createdBy || null,
                updatedBy: input.updatedBy || null,
                updatedAt: new Date(),
            }).returning() as FormRow[];
            return { item: toForm(row) };
        },

        async update(siteId: string, formId: string, input: Partial<FormDefinition>): Promise<BackyRepositoryMutationResult<FormDefinition>> {
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
            if (input.updatedBy !== undefined) updates.updatedBy = input.updatedBy;

            const [row] = await database.update(formDefinitions).set(updates).where(and(eq(formDefinitions.siteId, siteId), eq(formDefinitions.id, formId))).returning() as FormRow[];
            return { item: toForm(row) };
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
            const [row] = await database.insert(formSubmissions).values({
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

            const [row] = await database.update(formSubmissions).set(updates).where(and(eq(formSubmissions.siteId, siteId), eq(formSubmissions.id, submissionId))).returning() as SubmissionRow[];
            return { item: toSubmission(row) };
        },

        async listContacts(input: BackyContactListInput): Promise<BackyListResult<Contact>> {
            const rows = await database.select().from(formContacts).where(eq(formContacts.siteId, input.siteId)).orderBy(desc(formContacts.updatedAt)) as ContactRow[];
            const filtered = rows
                .map(toContact)
                .filter((contact) => input.formId ? contact.formId === input.formId : true)
                .filter((contact) => input.status && input.status !== 'all' ? contact.status === input.status : true)
                .filter((contact) => input.requestId ? contact.requestId === input.requestId : true)
                .filter((contact) => input.search ? searchText(`${contact.name || ''} ${contact.email || ''} ${contact.phone || ''} ${contact.notes || ''}`, input.search) : true);
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

        async createContact(input: Omit<Contact, 'id' | 'createdAt' | 'updatedAt'>): Promise<BackyRepositoryMutationResult<Contact>> {
            const [row] = await database.insert(formContacts).values({
                siteId: input.siteId,
                formId: input.formId,
                pageId: input.pageId || null,
                postId: input.postId || null,
                name: input.name || null,
                email: input.email || null,
                phone: input.phone || null,
                notes: input.notes || null,
                sourceValues: input.sourceValues || {},
                status: input.status || 'new',
                sourceSubmissionId: input.sourceSubmissionId || null,
                requestId: input.requestId || null,
                sourceIpHash: input.sourceIpHash || null,
                updatedAt: new Date(),
            }).returning() as ContactRow[];
            return { item: toContact(row) };
        },

        async updateContact(siteId: string, contactId: string, input: Partial<Contact>): Promise<BackyRepositoryMutationResult<Contact>> {
            const updates: Record<string, unknown> = { updatedAt: new Date() };
            if (input.status !== undefined) updates.status = input.status;
            if (input.name !== undefined) updates.name = input.name;
            if (input.email !== undefined) updates.email = input.email;
            if (input.phone !== undefined) updates.phone = input.phone;
            if (input.notes !== undefined) updates.notes = input.notes;
            if (input.sourceValues !== undefined) updates.sourceValues = input.sourceValues;

            const [row] = await database.update(formContacts).set(updates).where(and(eq(formContacts.siteId, siteId), eq(formContacts.id, contactId))).returning() as ContactRow[];
            return { item: toContact(row) };
        },
    };
}
