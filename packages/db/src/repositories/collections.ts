import {
    assertCollectionDesignOnlyUpdate,
    snapshotCollectionTemplateDesign,
    serializeBackyCollectionVersion,
    type BackyCollectionDesignRevision,
    snapshotProductTemplateDesign,
    type BackyProductDesignRevision,
    assertBackyCollectionImportExpectation,
    collectionRecordUniqueIssues,
    assertBackyCollectionRecordInventoryUnique,
    BackyCollectionRecordValidationError,
    assertBackyCollectionRecordUpdateExpectation,
    serializeBackyCollectionRecordVersion,
    BackyCollectionImportConflictError,
    type BackyCollection,
    type BackyCollectionSearchMetadata,
    type BackyCollectionRecordSearchMetadata,
    type BackyCollectionRecordSearchInput,
    type BackyCollectionRecordAdmissionContext,
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
    type BackyJsonObject,
    type BackyJsonValue,
    type BackyListResult,
    type BackyRepositoryMutationResult,
    type PublishStatus,
    COLLECTION_SEARCH_VALUE_LIMIT,
} from '@backy-cms/core';
import { createHash } from 'node:crypto';
import { and, asc, desc, eq, sql, type SQL, type SQLWrapper } from 'drizzle-orm';
import {
    collectionDesignRevisions,
    productDesignRevisions,
    contentCollectionRecords,
    contentCollections,
    sites,
} from '../schema';
import type { DatabaseInstance } from '../adapters';
import { createSettingsRepository } from './settings';
import { createMediaRepository } from './media';
import { createSiteRepository } from './site-page-post';
import { createDatabaseRepositories } from './factory';
import { withSiteMediaMutationTransaction } from './media-mutation-admission';

type QueryDatabase = {
    transaction: <T>(run: (writer: QueryDatabase) => Promise<T>) => Promise<T>;
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
    for: (mode: 'update' | 'key share') => QueryBuilder;
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

const isUuidIdentifier = (value: string): boolean => (
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)
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

const normalizedSearch = (value?: string): string => (
    typeof value === 'string' ? value.trim().toLowerCase() : ''
);

const normalizedFieldText = (value: BackyJsonValue | undefined): string => {
    if (value === null || value === undefined) {
        return '';
    }
    if (Array.isArray(value)) {
        return value.map((item) => normalizedFieldText(item)).filter(Boolean).join(' ');
    }
    if (typeof value === 'object') {
        return JSON.stringify(value);
    }
    return String(value);
};

const fieldMatches = (record: BackyCollectionRecord, fieldKey: string, fieldValue: BackyJsonValue | undefined): boolean => {
    const actual = record.values[fieldKey];
    const expected = normalizedFieldText(fieldValue).toLowerCase();

    if (!expected) {
        return actual === fieldValue;
    }
    if (Array.isArray(actual)) {
        return actual.some((item) => normalizedFieldText(item).toLowerCase() === expected);
    }
    return normalizedFieldText(actual).toLowerCase() === expected;
};

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

const normalizeMetadata = (value: unknown): BackyJsonObject => (
    isRecord(value) ? value as BackyJsonObject : {}
);

const sortValue = (record: BackyCollectionRecord, key: string): string | number | boolean => {
    const value = key in record ? record[key as keyof BackyCollectionRecord] : record.values[key];
    if (typeof value === 'number' || typeof value === 'boolean') {
        return value;
    }
    return typeof value === 'string' ? value : JSON.stringify(value ?? '');
};

const recordSortColumn = (key: string, direction: 'asc' | 'desc' | undefined): unknown => {
    const column = key === 'slug'
        ? contentCollectionRecords.slug
        : key === 'status'
            ? contentCollectionRecords.status
            : key === 'createdAt'
                ? contentCollectionRecords.createdAt
                : key === 'publishedAt'
                    ? contentCollectionRecords.publishedAt
                    : key === 'scheduledAt'
                        ? contentCollectionRecords.scheduledAt
                        : key === 'updatedAt'
                            ? contentCollectionRecords.updatedAt
                            : sql`${contentCollectionRecords.values}->>${key}`;

    return direction === 'asc' ? asc(column) : desc(column);
};

const recordSqlConditions = (input: BackyCollectionRecordListInput): SQL[] => {
    const conditions: SQL[] = [
        eq(contentCollectionRecords.siteId, input.siteId),
        eq(contentCollectionRecords.collectionId, input.collectionId),
    ];
    const status = input.status && input.status !== 'all'
        ? input.status
        : input.includeUnpublished
            ? null
            : 'published';
    const search = normalizedSearch(input.search);

    if (status) {
        conditions.push(eq(contentCollectionRecords.status, status));
    }
    if (input.fieldKey && input.fieldValue !== undefined && input.fieldValue !== null) {
        conditions.push(sql`(
            ${contentCollectionRecords.values} @> ${JSON.stringify({ [input.fieldKey]: input.fieldValue })}::jsonb
            OR ${contentCollectionRecords.values}->>${input.fieldKey} = ${String(input.fieldValue)}
            OR (${contentCollectionRecords.values}->${input.fieldKey}) ? ${String(input.fieldValue)}
        )`);
    }
    if (search) {
        conditions.push(sql`lower(coalesce(${contentCollectionRecords.slug}, '') || ' ' || coalesce(${contentCollectionRecords.values}::text, '')) LIKE ${`%${search}%`}`);
    }

    return conditions;
};

const normalizeCount = (value: unknown): number => {
    if (typeof value === 'number' && Number.isFinite(value)) {
        return Math.max(0, Math.floor(value));
    }
    if (typeof value === 'bigint') {
        return Number(value);
    }
    if (typeof value === 'string') {
        const parsed = Number(value);
        return Number.isFinite(parsed) ? Math.max(0, Math.floor(parsed)) : 0;
    }
    return 0;
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
    routePattern: row.routePattern || null,
    listRoutePattern: row.listRoutePattern || null,
    description: row.description,
    status: row.status,
    fields: normalizeFields(row.fields),
    permissions: normalizePermissions(row.permissions),
    metadata: normalizeMetadata(row.metadata),
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

type RecordWriteScope = { siteId: string; collectionId: string; collection: BackyCollection };
export function createCollectionRepository(db: DatabaseInstance, options: { adapterType?: string; recordWriteScope?: RecordWriteScope; skipRecordUnique?: boolean; definitionImportScope?: boolean; definitionWriteScope?: RecordWriteScope } = {}): BackyCollectionRepository {
    const database = asDb(db);
    const adapter = options.adapterType || 'postgres';
    const jsonText = (column: SQLWrapper, key: string) => adapter === 'sqlite' ? sql`cast(${column} -> ${`$.${key}`} as text)`
        : adapter === 'mysql' ? sql`cast(json_extract(${column}, ${`$.${key}`}) as char)` : sql`(${column} -> ${key})::text`;
    // Return selected JSON members only; never transfer a record's full values.
    const searchValue = (column: SQLWrapper, key: string, alias: string, policy = false) => {
        const value = jsonText(column, key);
        const length = adapter === 'sqlite' ? sql`length(cast(${value} as blob))` : sql`octet_length(${value})`;
        return sql`case when ${value} is null then null ${policy ? sql`when ${value} = ${'null'} then ${'false'}` : sql``} when ${length} <= ${COLLECTION_SEARCH_VALUE_LIMIT} then ${value} else ${policy ? 'false' : null} end`
            .mapWith((value: unknown) => value === null ? undefined : JSON.parse(String(value))).as(alias);
    };
    // Match the repository's legacy default when the permission key is absent;
    // explicit false/null and malformed non-boolean values remain excluded.
    const publicCollection = and(eq(contentCollections.status, 'published'), sql`coalesce(${jsonText(contentCollections.permissions, 'publicRead')}, ${'true'}) = ${'true'}`);
    const searchPage = async <T>(table: typeof contentCollections | typeof contentCollectionRecords, columns: Record<string, unknown>, where: SQL | undefined, input: { limit?: number; offset?: number }) => {
        const limit = normalizeLimit(input.limit), offset = normalizeOffset(input.offset);
        const [count] = await database.select({ total: sql<number>`count(*)` }).from(table).where(where) as { total: unknown }[];
        const total = Number(count?.total);
        if (!Number.isSafeInteger(total) || total < 0) throw Error('Invalid collection search metadata count.');
        const items = await database.select(columns).from(table).where(where).orderBy(desc(table.updatedAt), asc(table.id)).limit(limit).offset(offset) as T[];
        return { items, pagination: { total, limit, offset, hasMore: offset + items.length < total } };
    };

    const readUniqueInventory = async (siteId: string, collectionId: string) => (await database.select().from(contentCollectionRecords).where(and(eq(contentCollectionRecords.siteId, siteId), eq(contentCollectionRecords.collectionId, collectionId))).orderBy(asc(contentCollectionRecords.id)) as CollectionRecordRow[]).map(toCollectionRecord);
    const validateUnique = async (collection: BackyCollection, values: Record<string, unknown>, excludeRecordId?: string) => {
        if (options.skipRecordUnique || !collection.fields.some(field => field.unique)) return;
        const issues = collectionRecordUniqueIssues(collection, values, await readUniqueInventory(collection.siteId, collection.id), excludeRecordId);
        if (issues.length) throw new BackyCollectionRecordValidationError(issues);
    };
    return {
        async withDefinitionWriteLock(siteId,collectionId,operation) {
            if(options.adapterType && options.adapterType!=='postgres')throw Object.assign(Error('Guarded collection authoring requires PostgreSQL.'),{code:'COLLECTION_DEFINITION_WRITE_UNAVAILABLE'});
            const held=options.definitionWriteScope || options.recordWriteScope;
            if(held?.siteId===siteId && held.collectionId===collectionId)return operation(this,held.collection,createDatabaseRepositories({adapter:{type:'postgres',db,isConnected:async()=>true,close:async()=>{}}}));
            return database.transaction(async writer=>{
                const site=await firstOrNull(writer.select().from(sites).where(eq(sites.id,siteId)).limit(1).for('update'));
                const row=site?await firstOrNull<CollectionRow>(writer.select().from(contentCollections).where(and(eq(contentCollections.siteId,siteId),eq(contentCollections.id,collectionId))).limit(1).for('update')):null;
                if(!row)throw Object.assign(Error('Collection not found.'),{code:'COLLECTION_NOT_FOUND'});
                const collection=toCollection(row);
                return createCollectionRepository(writer as unknown as DatabaseInstance,{...options,definitionWriteScope:{siteId,collectionId,collection},recordWriteScope:{siteId,collectionId,collection}}).withDefinitionWriteLock!(siteId,collectionId,operation);
            });
        },
        async listCollectionDesignRevisions(siteId,collectionId,options={}) {
            const rows=await database.select().from(collectionDesignRevisions).where(and(eq(collectionDesignRevisions.siteId,siteId),eq(collectionDesignRevisions.collectionId,collectionId))).orderBy(desc(collectionDesignRevisions.createdAt),desc(collectionDesignRevisions.id)).limit(Math.min(100,Math.max(1,options.limit||100))+1).offset(Math.max(0,options.offset||0)) as Array<typeof collectionDesignRevisions.$inferSelect>;
            return rows.map(row=>({...row,snapshot:row.snapshot as BackyCollectionDesignRevision['snapshot'],operation:row.operation as BackyCollectionDesignRevision['operation'],createdAt:toIso(row.createdAt)}));
        },
        async getCollectionDesignRevision(siteId,collectionId,revisionId) {
            const row=await firstOrNull<typeof collectionDesignRevisions.$inferSelect>(database.select().from(collectionDesignRevisions).where(and(eq(collectionDesignRevisions.siteId,siteId),eq(collectionDesignRevisions.collectionId,collectionId),eq(collectionDesignRevisions.id,revisionId))).limit(1));
            return row?{...row,snapshot:row.snapshot as BackyCollectionDesignRevision['snapshot'],operation:row.operation as BackyCollectionDesignRevision['operation'],createdAt:toIso(row.createdAt)}:null;
        },
        async withRecordWriteLock<T>(siteId: string, collectionId: string, operation: (repository: BackyCollectionRepository, collection: BackyCollection, context: BackyCollectionRecordAdmissionContext) => Promise<T>): Promise<T> {
            if (options.recordWriteScope?.siteId === siteId && options.recordWriteScope.collectionId === collectionId) return operation(this, options.recordWriteScope.collection, { media: createMediaRepository(db), settings: createSettingsRepository(db), sites: createSiteRepository(db) });
            return database.transaction(async writer => {
                // Same order as imports: site before collection before record. FK admission must not invert it.
                const site = await firstOrNull(writer.select().from(sites).where(eq(sites.id, siteId)).limit(1).for('key share'));
                const row = site ? await firstOrNull<CollectionRow>(writer.select().from(contentCollections).where(and(eq(contentCollections.siteId, siteId), eq(contentCollections.id, collectionId))).limit(1).for('update')) : null;
                if (!row) throw new Error('The collection is no longer available. Reload the selected site.');
                const collection = toCollection(row);
                return createCollectionRepository(writer as unknown as DatabaseInstance, { ...options, recordWriteScope: { siteId, collectionId, collection } }).withRecordWriteLock(siteId, collectionId, operation);
            });
        },
        async applyImport(siteId, operations, decorateWriter, reconcileRetainedRecords) {
            // Admit before schema/record locks. The complete import keeps its
            // existing transaction isolation and final uniqueness validation.
            return withSiteMediaMutationTransaction(db, options.adapterType || 'postgres', siteId, async transaction => {
                const writer = transaction as unknown as QueryDatabase;
                const site = await firstOrNull(writer.select().from(sites).where(eq(sites.id, siteId)).limit(1).for('update'));
                if (!site) throw new BackyCollectionImportConflictError();
                // Lock every existing schema and record participating in uniqueness checks.
                for (const operation of [...operations].sort((a, b) => a.input.slug.localeCompare(b.input.slug))) {
                    const row = await firstOrNull<CollectionRow>(writer.select().from(contentCollections).where(and(eq(contentCollections.siteId, siteId), eq(contentCollections.slug, operation.input.slug))).limit(1).for('update'));
                    const records = row ? await writer.select().from(contentCollectionRecords).where(and(eq(contentCollectionRecords.siteId, siteId), eq(contentCollectionRecords.collectionId, row.id))).orderBy(asc(contentCollectionRecords.id)).for('update') as CollectionRecordRow[] : [];
                    assertBackyCollectionImportExpectation(siteId, operation, row ? toCollection(row) : null, records.map(toCollectionRecord));
                }
                const scopedRepository = createCollectionRepository(transaction, { ...options,skipRecordUnique: true,definitionImportScope:true });
                const scopedRepositories = createDatabaseRepositories({ adapter: { type: 'postgres', db: transaction, isConnected: async () => true, close: async () => {} } });
                // Preserve import-specific flags; a fresh factory collection
                // writer would incorrectly check uniqueness between each row.
                const repository = decorateWriter ? decorateWriter(scopedRepository, scopedRepositories) : scopedRepository;
                const collections: BackyCollection[] = [], records: BackyCollectionRecord[] = [];
                let createdCollections = 0, updatedCollections = 0, createdRecords = 0, updatedRecords = 0;
                for (const operation of operations) {
                    const collection = operation.expectedCollection
                        ? (await repository.update(siteId, operation.expectedCollection.id, operation.input)).item
                        : (await repository.create({ ...operation.input, siteId })).item;
                    collections.push(collection);
                    if (operation.expectedCollection) updatedCollections++; else createdCollections++;
                    for (const record of operation.records) {
                        const saved = record.expectedRecord
                            ? (await repository.updateRecord(siteId, collection.id, record.expectedRecord.id, record.input)).item
                            : (await repository.createRecord({ ...record.input, siteId, collectionId: collection.id })).item;
                        records.push(saved);
                        if (record.expectedRecord) updatedRecords++; else createdRecords++;
                    }
                }
                const importedRecordIds = new Set(records.map(record => record.id));
                for (const collection of collections) {
                    if (!reconcileRetainedRecords && !collection.fields.some(field => field.unique)) continue;
                    const rows = await writer.select().from(contentCollectionRecords).where(and(eq(contentCollectionRecords.siteId, siteId), eq(contentCollectionRecords.collectionId, collection.id))).orderBy(asc(contentCollectionRecords.id)) as CollectionRecordRow[];
                    const finalRecords = rows.map(toCollectionRecord);
                    assertBackyCollectionRecordInventoryUnique(collection, finalRecords);
                    // Schema upserts can reinterpret untouched records. The
                    // same-transaction hook reconciles their references only;
                    // they remain absent from mutation counts and responses.
                    const retained = finalRecords.filter(record => !importedRecordIds.has(record.id));
                    if (reconcileRetainedRecords && retained.length) await reconcileRetainedRecords(scopedRepositories, collection, retained);
                }
                return { collections, records, createdCollections, updatedCollections, createdRecords, updatedRecords };
            });
        },
        async listSearchMetadata(input): Promise<BackyListResult<BackyCollectionSearchMetadata>> {
            const result = await searchPage<Omit<BackyCollectionSearchMetadata, 'updatedAt'> & { updatedAt: Date | string; searchPolicy?: BackyJsonValue }>(contentCollections, {
                id: contentCollections.id, siteId: contentCollections.siteId, name: contentCollections.name,
                slug: contentCollections.slug, description: contentCollections.description, status: contentCollections.status,
                updatedAt: contentCollections.updatedAt, routePattern: contentCollections.routePattern, listRoutePattern: contentCollections.listRoutePattern,
                searchPolicy: searchValue(contentCollections.metadata, 'publicSearch', 'search_policy', true),
            }, and(eq(contentCollections.siteId, input.siteId), publicCollection), input);
            return { ...result, items: result.items.map(({ searchPolicy, ...row }) => ({ ...row, updatedAt: toIso(row.updatedAt),
                permissions: { publicRead: true }, metadata: searchPolicy === undefined || searchPolicy === null ? {} : { publicSearch: searchPolicy } })) };
        },

        async listRecordSearchMetadata(input: BackyCollectionRecordSearchInput): Promise<BackyListResult<BackyCollectionRecordSearchMetadata>> {
            if (!['published', 'scheduled'].includes(input.status) || !Array.isArray(input.valueKeys) || input.valueKeys.length > 16
                || new Set(input.valueKeys).size !== input.valueKeys.length
                || !input.valueKeys.every(key => /^[A-Za-z][A-Za-z0-9_]{0,63}$/.test(key) && !['constructor', 'prototype', '__proto__'].includes(key))) throw Error('Invalid collection search projection.');
            const fields = Object.fromEntries(input.valueKeys.map((key, index) => [`value${index}`, searchValue(contentCollectionRecords.values, key, `search_value_${index}`)]));
            const result = await searchPage<Record<string, unknown> & Omit<BackyCollectionRecordSearchMetadata, 'updatedAt' | 'scheduledAt' | 'values'> & { updatedAt: Date | string; scheduledAt?: Date | string | null }>(contentCollectionRecords, {
                id: contentCollectionRecords.id, siteId: contentCollectionRecords.siteId, collectionId: contentCollectionRecords.collectionId,
                slug: contentCollectionRecords.slug, status: contentCollectionRecords.status, updatedAt: contentCollectionRecords.updatedAt, scheduledAt: contentCollectionRecords.scheduledAt, ...fields,
            }, and(eq(contentCollectionRecords.siteId, input.siteId), eq(contentCollectionRecords.collectionId, input.collectionId), eq(contentCollectionRecords.status, input.status),
                sql`exists (select 1 from ${contentCollections} where ${contentCollections.id} = ${contentCollectionRecords.collectionId} and ${contentCollections.siteId} = ${input.siteId} and ${publicCollection})`), input);
            return { ...result, items: result.items.map(row => ({ id: row.id, siteId: row.siteId, collectionId: row.collectionId, slug: row.slug, status: row.status,
                updatedAt: toIso(row.updatedAt), scheduledAt: toNullableIso(row.scheduledAt),
                values: Object.fromEntries(input.valueKeys.flatMap((key, index) => row[`value${index}`] === undefined || row[`value${index}`] === null ? [] : [[key, row[`value${index}`] as BackyJsonValue]])),
            })) };
        },

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
            if (!isUuidIdentifier(siteId) || !isUuidIdentifier(collectionId)) return null;
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
                routePattern: input.routePattern || null,
                listRoutePattern: input.listRoutePattern || null,
                description: input.description || null,
                status: input.status || 'draft',
                fields: input.fields,
                permissions: normalizePermissions(input.permissions),
                metadata: input.metadata || {},
                updatedAt: new Date(),
            }).returning() as CollectionRow[];
            return { item: toCollection(row) };
        },

        async update(siteId: string, collectionId: string, input: BackyCollectionUpdateInput): Promise<BackyRepositoryMutationResult<BackyCollection>> {
            if(options.adapterType && options.adapterType!=='postgres' && (input.expectedVersion!==undefined||input.expectedCollection||input.beforeUpdateCollectionDesignRevision))throw Object.assign(Error('Guarded collection authoring requires PostgreSQL.'),{code:'COLLECTION_DEFINITION_WRITE_UNAVAILABLE'});
            const held=options.definitionWriteScope || options.recordWriteScope;
            if((!options.adapterType||options.adapterType==='postgres')&&!options.definitionImportScope&&(held?.siteId!==siteId||held.collectionId!==collectionId))return this.withDefinitionWriteLock!(siteId,collectionId,writer=>writer.update(siteId,collectionId,input));
            const before=held?.siteId===siteId&&held.collectionId===collectionId?held.collection:null;
            if((input.expectedVersion!==undefined||input.expectedCollection||input.beforeUpdateCollectionDesignRevision)&&!before)throw Object.assign(Error('The collection write scope is unavailable.'),{code:'COLLECTION_DEFINITION_WRITE_UNAVAILABLE'});
            if(before){
                const version=(collection:BackyCollection)=>'collection-v1:'+createHash('sha256').update(serializeBackyCollectionVersion(collection)).digest('hex');
                if((input.expectedVersion!==undefined&&input.expectedVersion!==version(before))||(input.expectedCollection&&version(input.expectedCollection)!==version(before)))throw Object.assign(Error('The collection changed.'),{code:'COLLECTION_DEFINITION_CONFLICT'});
                if(input.beforeUpdateCollectionDesignRevision){assertCollectionDesignOnlyUpdate(before,input);const details=input.beforeUpdateCollectionDesignRevision;await database.insert(collectionDesignRevisions).values({siteId,collectionId,snapshot:snapshotCollectionTemplateDesign(before),...details,templateId:details.templateId||null,targetRevisionId:details.targetRevisionId||null,actorId:details.actorId||null}).returning();}
            }
            const updates: Record<string, unknown> = {
                updatedAt: new Date(),
            };
            if (input.name !== undefined) updates.name = input.name;
            if (input.slug !== undefined) updates.slug = input.slug;
            if (input.routePattern !== undefined) updates.routePattern = input.routePattern || null;
            if (input.listRoutePattern !== undefined) updates.listRoutePattern = input.listRoutePattern || null;
            if (input.description !== undefined) updates.description = input.description;
            if (input.status !== undefined) updates.status = input.status;
            if (input.fields !== undefined) updates.fields = input.fields;
            if (input.permissions !== undefined) updates.permissions = normalizePermissions(input.permissions);
            if (input.metadata !== undefined) updates.metadata = input.metadata || {};

            const [row] = await database.update(contentCollections).set(updates).where(and(eq(contentCollections.siteId, siteId), eq(contentCollections.id, collectionId))).returning() as CollectionRow[];
            return { item: toCollection(row) };
        },

        async delete(siteId: string, collectionId: string): Promise<boolean> {
            await database.delete(contentCollections).where(and(eq(contentCollections.siteId, siteId), eq(contentCollections.id, collectionId)));
            return true;
        },

        async listRecords(input: BackyCollectionRecordListInput): Promise<BackyListResult<BackyCollectionRecord>> {
            const conditions = recordSqlConditions(input);
            const normalizedLimit = normalizeLimit(input.limit);
            const normalizedOffset = normalizeOffset(input.offset);
            const countRows = await database.select({ total: sql<number>`count(*)` })
                .from(contentCollectionRecords)
                .where(and(...conditions)) as Array<{ total: unknown }>;
            const total = normalizeCount(countRows[0]?.total);
            const rows = await database.select()
                .from(contentCollectionRecords)
                .where(and(...conditions))
                .orderBy(input.sortBy
                    ? recordSortColumn(input.sortBy, input.sortDirection)
                    : desc(contentCollectionRecords.updatedAt), asc(contentCollectionRecords.id))
                .limit(normalizedLimit)
                .offset(normalizedOffset) as CollectionRecordRow[];
            const filtered = rows
                .map(toCollectionRecord)
                .filter((record) => input.includeUnpublished || input.status === 'all' || record.status === 'published')
                .filter((record) => input.status && input.status !== 'all' ? record.status === input.status : true)
                .filter((record) => input.fieldKey ? fieldMatches(record, input.fieldKey, input.fieldValue) : true)
                .filter((record) => input.search ? searchText(`${record.slug} ${JSON.stringify(record.values)}`, input.search) : true);
            const sorted = input.sortBy
                ? [...filtered].sort((left, right) => {
                    const direction = input.sortDirection === 'asc' ? 1 : -1;
                    const leftValue = sortValue(left, input.sortBy || '');
                    const rightValue = sortValue(right, input.sortBy || '');
                    return String(leftValue).localeCompare(String(rightValue), undefined, { numeric: true }) * direction;
                })
                : filtered;
            return {
                items: sorted,
                pagination: {
                    total,
                    limit: normalizedLimit,
                    offset: normalizedOffset,
                    hasMore: normalizedOffset + normalizedLimit < total,
                },
            };
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
            if (options.recordWriteScope?.siteId !== input.siteId || options.recordWriteScope.collectionId !== input.collectionId) return this.withRecordWriteLock(input.siteId, input.collectionId, repository => repository.createRecord(input));
            await validateUnique(options.recordWriteScope.collection, input.values);
            const status = input.status || 'draft';
            const [row] = await database.insert(contentCollectionRecords).values({
                siteId: input.siteId,
                collectionId: input.collectionId,
                slug: input.slug || slugFromValues(input.values),
                status,
                values: input.values,
                publishedAt: publishedAtForStatus(status),
                scheduledAt: input.scheduledAt ? new Date(input.scheduledAt) : null,
                updatedAt: new Date(),
            }).returning() as CollectionRecordRow[];
            return { item: toCollectionRecord(row) };
        },

        async updateRecord(siteId: string, collectionId: string, recordId: string, input: BackyCollectionRecordUpdateInput): Promise<BackyRepositoryMutationResult<BackyCollectionRecord>> {
            if (options.recordWriteScope?.siteId !== siteId || options.recordWriteScope.collectionId !== collectionId) return this.withRecordWriteLock(siteId, collectionId, repository => repository.updateRecord(siteId, collectionId, recordId, input));
            const [existingRow] = await database.select().from(contentCollectionRecords).where(and(eq(contentCollectionRecords.siteId, siteId), eq(contentCollectionRecords.collectionId, collectionId), eq(contentCollectionRecords.id, recordId))).for('update') as CollectionRecordRow[];
            const existing = existingRow ? toCollectionRecord(existingRow) : null;
            assertBackyCollectionRecordUpdateExpectation(siteId, collectionId, recordId, input, existing, existing ? `record-v1:${createHash('sha256').update(serializeBackyCollectionRecordVersion(existing)).digest('hex')}` : undefined);
            await validateUnique(options.recordWriteScope.collection, input.values === undefined ? existing?.values || {} : input.values, recordId);
            if (input.beforeUpdateProductDesignRevision) {
                if (!existing || !input.expectedRecord || options.recordWriteScope.collection.slug !== "products" || input.status !== undefined || input.slug !== undefined || input.scheduledAt !== undefined) throw Error("PRODUCT_DESIGN_REVISION_INVALID");
                const details = input.beforeUpdateProductDesignRevision;
                await database.insert(productDesignRevisions).values({ siteId, collectionId, recordId, snapshot: snapshotProductTemplateDesign(existing.values), ...details, actorId: details.actorId || null, templateId: details.templateId || null, targetRevisionId: details.targetRevisionId || null }).returning();
            }
            const updates: Record<string, unknown> = {
                updatedAt: new Date(Math.max(Date.now(), Date.parse(existing?.updatedAt || '') + 1 || Date.now())),
            };
            if (input.slug !== undefined) updates.slug = input.slug;
            if (input.values !== undefined) updates.values = input.values;
            if (input.status !== undefined) {
                updates.status = input.status;
                updates.publishedAt = publishedAtForStatus(input.status, existing?.publishedAt || null);
            }
            if (input.scheduledAt !== undefined) updates.scheduledAt = input.scheduledAt ? new Date(input.scheduledAt) : null;

            const [row] = await database.update(contentCollectionRecords).set(updates).where(and(
                eq(contentCollectionRecords.siteId, siteId),
                eq(contentCollectionRecords.collectionId, collectionId),
                eq(contentCollectionRecords.id, recordId),
            )).returning() as CollectionRecordRow[];
            return { item: toCollectionRecord(row) };
        },

        async listProductDesignRevisions(siteId: string, collectionId: string, recordId: string, options: { offset?: number; limit?: number } = {}): Promise<BackyProductDesignRevision[]> {
            const rows = await database.select().from(productDesignRevisions).where(and(eq(productDesignRevisions.siteId, siteId), eq(productDesignRevisions.collectionId, collectionId), eq(productDesignRevisions.recordId, recordId))).orderBy(desc(productDesignRevisions.createdAt), desc(productDesignRevisions.id)).limit(Math.min(100, Math.max(1, options.limit || 100)) + 1).offset(Math.max(0, options.offset || 0)) as typeof productDesignRevisions.$inferSelect[];
            return rows.map(row => ({ ...row, snapshot: row.snapshot as BackyProductDesignRevision['snapshot'], operation: row.operation as BackyProductDesignRevision['operation'], createdAt: toIso(row.createdAt) }));
        },
        async getProductDesignRevision(siteId: string, collectionId: string, recordId: string, revisionId: string): Promise<BackyProductDesignRevision | null> {
            const [row] = await database.select().from(productDesignRevisions).where(and(eq(productDesignRevisions.siteId, siteId), eq(productDesignRevisions.collectionId, collectionId), eq(productDesignRevisions.recordId, recordId), eq(productDesignRevisions.id, revisionId))) as typeof productDesignRevisions.$inferSelect[];
            return row ? { ...row, snapshot: row.snapshot as BackyProductDesignRevision['snapshot'], operation: row.operation as BackyProductDesignRevision['operation'], createdAt: toIso(row.createdAt) } : null;
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
