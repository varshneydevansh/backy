import {
    type BackyCollection,
    type BackyCollectionCreateInput,
    type BackyCollectionField,
    type BackyCollectionPermissions,
    type BackyCollectionRecord,
    type BackyCollectionRecordCreateInput,
    type BackyCollectionRecordListInput,
    type BackyCollectionRecordUpdateInput,
    type BackyCollectionRepository,
    type BackyCollectionListInput,
    type BackyCollectionUpdateInput,
    type BackyJsonValue,
    type BackyListResult,
    type BackyRepositoryMutationResult,
    type PublishStatus,
} from '@backy-cms/core';
import { and, desc, eq } from 'drizzle-orm';
import {
    contentCollectionRecords,
    contentCollections,
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

type CollectionRow = typeof contentCollections.$inferSelect;
type CollectionRecordRow = typeof contentCollectionRecords.$inferSelect;

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 100;

const DEFAULT_PERMISSIONS: BackyCollectionPermissions = {
    publicRead: true,
    publicCreate: false,
    publicUpdate: false,
    publicDelete: false,
};

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

const publishedAtForStatus = (status: PublishStatus, existing?: string | null): Date | null => {
    if (status !== 'published') {
        return existing ? new Date(existing) : null;
    }
    return existing ? new Date(existing) : new Date();
};

const normalizePermissions = (value: unknown): BackyCollectionPermissions => ({
    ...DEFAULT_PERMISSIONS,
    ...(isRecord(value) ? value : {}),
});

const normalizeFields = (value: unknown): BackyCollectionField[] => (
    Array.isArray(value)
        ? value.filter((field): field is BackyCollectionField => (
            isRecord(field) &&
            typeof field.id === 'string' &&
            typeof field.key === 'string' &&
            typeof field.label === 'string' &&
            typeof field.type === 'string'
        ))
        : []
);

const normalizeValues = (value: unknown): Record<string, BackyJsonValue> => (
    isRecord(value) ? value as Record<string, BackyJsonValue> : {}
);

const sortValue = (record: BackyCollectionRecord, key: string): string | number | boolean => {
    const value = key in record ? record[key as keyof BackyCollectionRecord] : record.values[key];
    if (typeof value === 'number' || typeof value === 'boolean') {
        return value;
    }
    return typeof value === 'string' ? value : JSON.stringify(value ?? '');
};

const slugFromValues = (values: Record<string, BackyJsonValue>): string => {
    const preferred = values.slug || values.title || values.name;
    if (typeof preferred === 'string' && preferred.trim().length > 0) {
        return preferred
            .trim()
            .toLowerCase()
            .replace(/[^\w\s-]/g, '')
            .replace(/[\s_-]+/g, '-')
            .replace(/^-+|-+$/g, '');
    }
    return `record-${Date.now().toString(36)}`;
};

const toCollection = (row: CollectionRow): BackyCollection => ({
    id: row.id,
    siteId: row.siteId,
    name: row.name,
    slug: row.slug,
    description: row.description,
    status: row.status,
    fields: normalizeFields(row.fields),
    permissions: normalizePermissions(row.permissions),
    createdAt: toIso(row.createdAt),
    updatedAt: toIso(row.updatedAt),
});

const toCollectionRecord = (row: CollectionRecordRow): BackyCollectionRecord => ({
    id: row.id,
    siteId: row.siteId,
    collectionId: row.collectionId,
    slug: row.slug,
    status: row.status,
    values: normalizeValues(row.values),
    createdAt: toIso(row.createdAt),
    updatedAt: toIso(row.updatedAt),
    publishedAt: toNullableIso(row.publishedAt),
    scheduledAt: toNullableIso(row.scheduledAt),
});

export function createCollectionRepository(db: DatabaseInstance): BackyCollectionRepository {
    const database = asDb(db);

    return {
        async list(input: BackyCollectionListInput): Promise<BackyListResult<BackyCollection>> {
            const rows = await database.select().from(contentCollections).where(eq(contentCollections.siteId, input.siteId)).orderBy(desc(contentCollections.updatedAt)) as CollectionRow[];
            const filtered = rows
                .map(toCollection)
                .filter((collection) => input.includeUnpublished || input.status === 'all' || collection.status === 'published')
                .filter((collection) => input.status && input.status !== 'all' ? collection.status === input.status : true)
                .filter((collection) => input.search ? searchText(`${collection.name} ${collection.slug} ${collection.description || ''}`, input.search) : true);
            return paginate(filtered, input.limit, input.offset);
        },

        async getById(siteId: string, collectionId: string): Promise<BackyCollection | null> {
            const row = await firstOrNull<CollectionRow>(
                database.select().from(contentCollections).where(and(eq(contentCollections.siteId, siteId), eq(contentCollections.id, collectionId))).limit(1),
            );
            return row ? toCollection(row) : null;
        },

        async getBySlug(siteId: string, slug: string): Promise<BackyCollection | null> {
            const row = await firstOrNull<CollectionRow>(
                database.select().from(contentCollections).where(and(eq(contentCollections.siteId, siteId), eq(contentCollections.slug, slug))).limit(1),
            );
            return row ? toCollection(row) : null;
        },

        async create(input: BackyCollectionCreateInput): Promise<BackyRepositoryMutationResult<BackyCollection>> {
            const [row] = await database.insert(contentCollections).values({
                siteId: input.siteId,
                name: input.name,
                slug: input.slug,
                description: input.description || null,
                status: input.status || 'draft',
                fields: input.fields,
                permissions: normalizePermissions(input.permissions),
                updatedAt: new Date(),
            }).returning() as CollectionRow[];
            return { item: toCollection(row) };
        },

        async update(siteId: string, collectionId: string, input: BackyCollectionUpdateInput): Promise<BackyRepositoryMutationResult<BackyCollection>> {
            const updates: Record<string, unknown> = {
                updatedAt: new Date(),
            };
            if (input.name !== undefined) updates.name = input.name;
            if (input.slug !== undefined) updates.slug = input.slug;
            if (input.description !== undefined) updates.description = input.description;
            if (input.status !== undefined) updates.status = input.status;
            if (input.fields !== undefined) updates.fields = input.fields;
            if (input.permissions !== undefined) updates.permissions = normalizePermissions(input.permissions);

            const [row] = await database.update(contentCollections).set(updates).where(and(eq(contentCollections.siteId, siteId), eq(contentCollections.id, collectionId))).returning() as CollectionRow[];
            return { item: toCollection(row) };
        },

        async delete(siteId: string, collectionId: string): Promise<boolean> {
            await database.delete(contentCollections).where(and(eq(contentCollections.siteId, siteId), eq(contentCollections.id, collectionId)));
            return true;
        },

        async listRecords(input: BackyCollectionRecordListInput): Promise<BackyListResult<BackyCollectionRecord>> {
            const rows = await database.select().from(contentCollectionRecords).where(and(
                eq(contentCollectionRecords.siteId, input.siteId),
                eq(contentCollectionRecords.collectionId, input.collectionId),
            )).orderBy(desc(contentCollectionRecords.updatedAt)) as CollectionRecordRow[];
            const filtered = rows
                .map(toCollectionRecord)
                .filter((record) => input.includeUnpublished || input.status === 'all' || record.status === 'published')
                .filter((record) => input.status && input.status !== 'all' ? record.status === input.status : true)
                .filter((record) => input.fieldKey ? record.values[input.fieldKey] === input.fieldValue : true)
                .filter((record) => input.search ? searchText(`${record.slug} ${JSON.stringify(record.values)}`, input.search) : true);
            const sorted = input.sortBy
                ? [...filtered].sort((left, right) => {
                    const direction = input.sortDirection === 'asc' ? 1 : -1;
                    const leftValue = sortValue(left, input.sortBy || '');
                    const rightValue = sortValue(right, input.sortBy || '');
                    return String(leftValue).localeCompare(String(rightValue), undefined, { numeric: true }) * direction;
                })
                : filtered;
            return paginate(sorted, input.limit, input.offset);
        },

        async getRecordById(siteId: string, collectionId: string, recordId: string): Promise<BackyCollectionRecord | null> {
            const row = await firstOrNull<CollectionRecordRow>(
                database.select().from(contentCollectionRecords).where(and(
                    eq(contentCollectionRecords.siteId, siteId),
                    eq(contentCollectionRecords.collectionId, collectionId),
                    eq(contentCollectionRecords.id, recordId),
                )).limit(1),
            );
            return row ? toCollectionRecord(row) : null;
        },

        async getRecordBySlug(siteId: string, collectionId: string, slug: string): Promise<BackyCollectionRecord | null> {
            const row = await firstOrNull<CollectionRecordRow>(
                database.select().from(contentCollectionRecords).where(and(
                    eq(contentCollectionRecords.siteId, siteId),
                    eq(contentCollectionRecords.collectionId, collectionId),
                    eq(contentCollectionRecords.slug, slug),
                )).limit(1),
            );
            return row ? toCollectionRecord(row) : null;
        },

        async createRecord(input: BackyCollectionRecordCreateInput): Promise<BackyRepositoryMutationResult<BackyCollectionRecord>> {
            const status = input.status || 'draft';
            const [row] = await database.insert(contentCollectionRecords).values({
                siteId: input.siteId,
                collectionId: input.collectionId,
                slug: input.slug || slugFromValues(input.values),
                status,
                values: input.values,
                publishedAt: publishedAtForStatus(status),
                updatedAt: new Date(),
            }).returning() as CollectionRecordRow[];
            return { item: toCollectionRecord(row) };
        },

        async updateRecord(siteId: string, collectionId: string, recordId: string, input: BackyCollectionRecordUpdateInput): Promise<BackyRepositoryMutationResult<BackyCollectionRecord>> {
            const existing = await this.getRecordById(siteId, collectionId, recordId);
            const updates: Record<string, unknown> = {
                updatedAt: new Date(),
            };
            if (input.slug !== undefined) updates.slug = input.slug;
            if (input.values !== undefined) updates.values = input.values;
            if (input.status !== undefined) {
                updates.status = input.status;
                updates.publishedAt = publishedAtForStatus(input.status, existing?.publishedAt || null);
            }

            const [row] = await database.update(contentCollectionRecords).set(updates).where(and(
                eq(contentCollectionRecords.siteId, siteId),
                eq(contentCollectionRecords.collectionId, collectionId),
                eq(contentCollectionRecords.id, recordId),
            )).returning() as CollectionRecordRow[];
            return { item: toCollectionRecord(row) };
        },

        async deleteRecord(siteId: string, collectionId: string, recordId: string): Promise<boolean> {
            await database.delete(contentCollectionRecords).where(and(
                eq(contentCollectionRecords.siteId, siteId),
                eq(contentCollectionRecords.collectionId, collectionId),
                eq(contentCollectionRecords.id, recordId),
            ));
            return true;
        },
    };
}
