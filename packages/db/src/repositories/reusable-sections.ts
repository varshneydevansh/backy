import {
    assertBackyReusableSectionExpectation,
    BackyReusableSectionConflictError,
    BackyReusableSectionPropagationConflictError,
    assertBackyReusableSectionPropagationInventory,
    type BackyReusableSectionPropagationTarget,
    type BackyJsonObject,
    type BackyListResult,
    type BackyRepositoryMutationResult,
    type BackyReusableSection,
    type BackyReusableSectionCreateInput,
    type BackyReusableSectionListInput,
    type BackyReusableSectionRepository,
    type BackyReusableSectionStatus,
    type BackyReusableSectionUpdateInput,
} from '@backy-cms/core';
import { and, desc, eq } from 'drizzle-orm';
import { reusableSections, sites, pages, blogPosts, contentCollections, contentCollectionRecords } from '../schema';
import type { DatabaseInstance, DatabaseAdapter } from '../adapters';
import { createDatabaseRepositories } from './factory';
import { withSiteMediaMutationTransaction } from './media-mutation-admission';

type QueryDatabase = {
    transaction: <T>(run: (transaction: QueryDatabase) => Promise<T>, options?: { isolationLevel: 'serializable' }) => Promise<T>;
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
    for: (mode: 'update') => QueryBuilder;
    where: (condition: unknown) => QueryBuilder;
    orderBy: (...columns: unknown[]) => QueryBuilder;
    limit: (limit: number) => QueryBuilder;
    offset: (offset: number) => QueryBuilder;
    then: Promise<unknown[]>['then'];
};

type ReturningQuery = {
    returning: () => Promise<unknown[]>;
};

type ReusableSectionRow = typeof reusableSections.$inferSelect;

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

const normalizeStatus = (value: unknown): BackyReusableSectionStatus => (
    value === 'archived' ? 'archived' : 'active'
);

const normalizeTags = (value: unknown): string[] => (
    Array.isArray(value)
        ? Array.from(new Set(value.map((item) => typeof item === 'string' ? item.trim() : '').filter(Boolean)))
        : []
);

const normalizeContent = (value: unknown): BackyJsonObject => (
    isRecord(value) ? value as BackyJsonObject : {}
);

const normalizeMetadata = (value: unknown): BackyJsonObject => (
    isRecord(value) ? value as BackyJsonObject : {}
);

const searchText = (section: BackyReusableSection, search: string): boolean => (
    [
        section.name,
        section.slug,
        section.description || '',
        section.category,
        ...section.tags,
    ].join(' ').toLowerCase().includes(search.toLowerCase())
);

const toReusableSection = (row: ReusableSectionRow): BackyReusableSection => ({
    id: row.id,
    siteId: row.siteId,
    name: row.name,
    slug: row.slug,
    description: row.description,
    category: row.category,
    status: normalizeStatus(row.status),
    tags: normalizeTags(row.tags),
    content: normalizeContent(row.content),
    metadata: normalizeMetadata(row.metadata),
    sourceElementId: row.sourceElementId,
    createdBy: row.createdBy,
    updatedBy: row.updatedBy,
    createdAt: toIso(row.createdAt),
    updatedAt: toIso(row.updatedAt),
});

export function createReusableSectionRepository(db: DatabaseInstance, adapterType: DatabaseAdapter['type'] = 'postgres'): BackyReusableSectionRepository {
    const database = asDb(db);

    const createWith = async (writer: QueryDatabase, input: BackyReusableSectionCreateInput): Promise<BackyRepositoryMutationResult<BackyReusableSection>> => {
            const [row] = await writer.insert(reusableSections).values({
                siteId: input.siteId,
                name: input.name,
                slug: input.slug,
                description: input.description || null,
                category: input.category || 'general',
                status: input.status || 'active',
                tags: input.tags || [],
                content: input.content,
                metadata: input.metadata || {},
                sourceElementId: input.sourceElementId || null,
                createdBy: input.createdBy || null,
                updatedBy: input.updatedBy || input.createdBy || null,
                updatedAt: new Date(),
            }).returning() as ReusableSectionRow[];
            return { item: toReusableSection(row) };
    };
    const updateWith = async (writer: QueryDatabase, siteId: string, sectionId: string, input: BackyReusableSectionUpdateInput): Promise<BackyRepositoryMutationResult<BackyReusableSection>> => {
        if (input.expectedSection !== undefined) {
            const row = await firstOrNull<ReusableSectionRow>(writer.select().from(reusableSections).where(and(eq(reusableSections.siteId, siteId), eq(reusableSections.id, sectionId))).limit(1).for('update'));
            assertBackyReusableSectionExpectation(input, row ? toReusableSection(row) : null);
        }
            const updates: Record<string, unknown> = { updatedAt: new Date() };
            if (input.name !== undefined) updates.name = input.name;
            if (input.slug !== undefined) updates.slug = input.slug;
            if (input.description !== undefined) updates.description = input.description;
            if (input.category !== undefined) updates.category = input.category;
            if (input.status !== undefined) updates.status = input.status;
            if (input.tags !== undefined) updates.tags = input.tags;
            if (input.content !== undefined) updates.content = input.content;
            if (input.metadata !== undefined) updates.metadata = input.metadata || {};
            if (input.sourceElementId !== undefined) updates.sourceElementId = input.sourceElementId;
            if (input.updatedBy !== undefined) updates.updatedBy = input.updatedBy;

            const [row] = await writer.update(reusableSections).set(updates).where(and(eq(reusableSections.siteId, siteId), eq(reusableSections.id, sectionId))).returning() as ReusableSectionRow[];
            return { item: toReusableSection(row) };
    };
    return {
        async applyPropagation(siteId, input, _context, decorateWriter) {
            if (adapterType !== 'postgres') throw Object.assign(new Error('Serializable section propagation requires the PostgreSQL adapter.'), { code: 'REUSABLE_SECTION_PROPAGATION_UNAVAILABLE' });
            if (input.source.siteId !== siteId) throw new BackyReusableSectionPropagationConflictError();
            try {
                await withSiteMediaMutationTransaction(db, adapterType, siteId, async transaction => {
                    const writer = asDb(transaction);
                    const site = await firstOrNull(writer.select().from(sites).where(eq(sites.id, siteId)).limit(1).for('update'));
                    if (!site) throw new BackyReusableSectionPropagationConflictError();
                    const source = await firstOrNull<ReusableSectionRow>(writer.select().from(reusableSections).where(and(eq(reusableSections.siteId, siteId), eq(reusableSections.id, input.source.id))).limit(1).for('update'));
                    try { assertBackyReusableSectionExpectation({ expectedSection: input.source }, source ? toReusableSection(source) : null); }
                    catch { throw new BackyReusableSectionPropagationConflictError(); }
                    const scoped = createDatabaseRepositories({ adapter: {
                        type: adapterType, db: transaction, isConnected: async () => true, close: async () => {},
                    } });
                    // The public writer supplies its existing admitted media validator/indexer.
                    // All its writes share this top-level SERIALIZABLE transaction.
                    const prepared = decorateWriter ? decorateWriter(scoped) : scoped;
                    const pageRepo = prepared.pages, postRepo = prepared.posts, collectionRepo = prepared.collections;
                    const current: BackyReusableSectionPropagationTarget[] = [];
                    const included = (type: string) => input.scope.targetType === 'all' || input.scope.targetType === type;
                    if (input.scope.includeProducts && included('product')) {
                        // Match ordinary collection writes: schema admission precedes record locks.
                        await writer.select().from(contentCollections).where(and(eq(contentCollections.siteId, siteId), eq(contentCollections.slug, 'products'))).orderBy(contentCollections.id).for('update');
                        const collection = await collectionRepo.getBySlug(siteId, 'products');
                        if ((collection?.id || undefined) !== input.scope.productCollectionId) throw new BackyReusableSectionPropagationConflictError();
                    }
                    // Serializable predicate reads cover additions/removals, including documents with no instances.
                    // Row locks protect each observed baseline; writes and revision snapshots share this transaction.
                    for (const type of ['page', 'post'] as const) {
                        if (!included(type)) continue;
                        const table = type === 'page' ? pages : blogPosts;
                        const rows = await writer.select().from(table).where(and(eq(table.siteId, siteId), ...(input.scope.targetId ? [eq(table.id, input.scope.targetId)] : []))).orderBy(table.id).limit(100001).for('update') as Array<{ id: string }>;
                        if (rows.length > 100000) throw new BackyReusableSectionPropagationConflictError();
                        for (const row of rows) {
                            const item = await (type === 'page' ? pageRepo : postRepo).getById(siteId, row.id);
                            if (!item) throw new BackyReusableSectionPropagationConflictError();
                            current.push({ type, id: item.id, updatedAt: item.updatedAt, content: item.content });
                        }
                    }
                    if (input.scope.includeProducts && included('product') && input.scope.productCollectionId) {
                        const rows = await writer.select().from(contentCollectionRecords).where(and(eq(contentCollectionRecords.siteId, siteId), eq(contentCollectionRecords.collectionId, input.scope.productCollectionId), ...(input.scope.targetId ? [eq(contentCollectionRecords.id, input.scope.targetId)] : []))).orderBy(contentCollectionRecords.id).limit(100001).for('update') as Array<{ id: string }>;
                        if (rows.length > 100000) throw new BackyReusableSectionPropagationConflictError();
                        for (const row of rows) {
                            const item = await collectionRepo.getRecordById(siteId, input.scope.productCollectionId, row.id);
                            if (!item) throw new BackyReusableSectionPropagationConflictError();
                            current.push({ type: 'product', id: item.id, collectionId: item.collectionId, updatedAt: item.updatedAt, values: item.values });
                        }
                    }
                    assertBackyReusableSectionPropagationInventory(input.inventory, current);
                    const touched = new Set<string>();
                    for (const mutation of input.mutations) {
                        const key = `${mutation.expected.type}:${mutation.expected.id}`;
                        const baseline = current.find(target => `${target.type}:${target.id}` === key);
                        if (!baseline || touched.has(key)) throw new BackyReusableSectionPropagationConflictError();
                        touched.add(key); assertBackyReusableSectionPropagationInventory([mutation.expected], [baseline]);
                        if (baseline.type === 'product') {
                            if (!baseline.collectionId || !mutation.values) throw new BackyReusableSectionPropagationConflictError();
                            await collectionRepo.updateRecord(siteId, baseline.collectionId, baseline.id, { values: mutation.values });
                        } else {
                            if (!mutation.content) throw new BackyReusableSectionPropagationConflictError();
                            const repo = baseline.type === 'page' ? pageRepo : postRepo;
                            const item = await repo.getById(siteId, baseline.id);
                            if (!item) throw new BackyReusableSectionPropagationConflictError();
                            await repo.update(siteId, baseline.id, { content: mutation.content, expectedContent: item.content, expectedUpdatedAt: item.updatedAt,
                                beforeUpdateRevision: { snapshot: item as unknown as BackyJsonObject, operation: 'update', note: `Before reusable section ${input.source.name} refresh` },
                            });
                        }
                    }
                }, { isolationLevel: 'serializable' });
            } catch (error) {
                const code = error && typeof error === 'object' ? (error as { code?: string; cause?: { code?: string } }).code || (error as { cause?: { code?: string } }).cause?.code : undefined;
                if (code === '40001' || code === 'CONTENT_REVISION_CONFLICT') throw new BackyReusableSectionPropagationConflictError();
                throw error;
            }
        },
        async applyBatch(siteId, operations) {
            if (operations.some(operation => operation.type === 'create' ? operation.input.siteId !== siteId : operation.input.expectedSection.siteId !== siteId)) throw new BackyReusableSectionConflictError();
            return database.transaction(async writer => {
                // Stable lock order avoids competing import deadlocks. Validate all before writes.
                for (const operation of operations.filter(operation => operation.type === 'update').sort((a, b) => a.sectionId.localeCompare(b.sectionId))) {
                    const row = await firstOrNull<ReusableSectionRow>(writer.select().from(reusableSections).where(and(eq(reusableSections.siteId, siteId), eq(reusableSections.id, operation.sectionId))).limit(1).for('update'));
                    assertBackyReusableSectionExpectation(operation.input, row ? toReusableSection(row) : null);
                }
                const items: BackyReusableSection[] = [];
                for (const operation of operations) {
                    items.push((operation.type === 'create' ? await createWith(writer, operation.input) : await updateWith(writer, siteId, operation.sectionId, operation.input)).item);
                }
                return items;
            });
        },
        async list(input: BackyReusableSectionListInput): Promise<BackyListResult<BackyReusableSection>> {
            const rows = await database.select().from(reusableSections).where(eq(reusableSections.siteId, input.siteId)).orderBy(desc(reusableSections.updatedAt)) as ReusableSectionRow[];
            const category = input.category?.trim().toLowerCase();
            const tag = input.tag?.trim().toLowerCase();
            const filtered = rows
                .map(toReusableSection)
                .filter((section) => input.status === 'all' || section.status === (input.status || 'active'))
                .filter((section) => category ? section.category.toLowerCase() === category : true)
                .filter((section) => tag ? section.tags.some((item) => item.toLowerCase() === tag) : true)
                .filter((section) => input.search ? searchText(section, input.search) : true);
            return paginate(filtered, input.limit, input.offset);
        },

        async getById(siteId: string, sectionId: string): Promise<BackyReusableSection | null> {
            const row = await firstOrNull<ReusableSectionRow>(
                database.select().from(reusableSections).where(and(eq(reusableSections.siteId, siteId), eq(reusableSections.id, sectionId))).limit(1),
            );
            return row ? toReusableSection(row) : null;
        },

        async getBySlug(siteId: string, slug: string): Promise<BackyReusableSection | null> {
            const row = await firstOrNull<ReusableSectionRow>(
                database.select().from(reusableSections).where(and(eq(reusableSections.siteId, siteId), eq(reusableSections.slug, slug))).limit(1),
            );
            return row ? toReusableSection(row) : null;
        },

        async create(input: BackyReusableSectionCreateInput): Promise<BackyRepositoryMutationResult<BackyReusableSection>> {
            return createWith(database, input);
        },

        async update(siteId: string, sectionId: string, input: BackyReusableSectionUpdateInput): Promise<BackyRepositoryMutationResult<BackyReusableSection>> {
            return input.expectedSection !== undefined
                ? database.transaction(writer => updateWith(writer, siteId, sectionId, input))
                : updateWith(database, siteId, sectionId, input);
        },

        async delete(siteId: string, sectionId: string): Promise<boolean> {
            const existing = await this.getById(siteId, sectionId);
            if (!existing) {
                return false;
            }

            await database.delete(reusableSections).where(and(eq(reusableSections.siteId, siteId), eq(reusableSections.id, sectionId)));
            return true;
        },
    };
}
