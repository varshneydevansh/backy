import { randomUUID } from 'node:crypto';
import {
    type BackyCacheInvalidationEvent,
    type BackyCacheInvalidationListInput,
    type BackyCacheInvalidationRecordInput,
    type BackyCacheInvalidationRepository,
    type BackyCacheInvalidationScope,
    type BackyJsonObject,
    type BackyListResult,
    type BackyRepositoryEntity,
} from '@backy-cms/core';
import { desc, eq } from 'drizzle-orm';
import { cacheInvalidationEvents } from '../schema';
import type { DatabaseInstance } from '../adapters';

type QueryDatabase = {
    select: (...args: unknown[]) => {
        from: (table: unknown) => QueryBuilder;
    };
    insert: (table: unknown) => {
        values: (value: Record<string, unknown>) => ReturningQuery;
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

type CacheInvalidationRow = typeof cacheInvalidationEvents.$inferSelect;

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

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

const normalizeEntity = (value: unknown): BackyRepositoryEntity => {
    if (
        value === 'site' ||
        value === 'page' ||
        value === 'post' ||
        value === 'collection' ||
        value === 'collectionRecord' ||
        value === 'media' ||
        value === 'mediaFolder' ||
        value === 'form' ||
        value === 'formSubmission' ||
        value === 'contact' ||
        value === 'comment' ||
        value === 'user' ||
        value === 'settings' ||
        value === 'auditLog' ||
        value === 'cacheInvalidation'
    ) {
        return value;
    }

    return 'cacheInvalidation';
};

const normalizeScope = (value: unknown): BackyCacheInvalidationScope => (
    typeof value === 'string' && value.trim().length > 0 ? value.trim() as BackyCacheInvalidationScope : 'all'
);

const normalizeMetadata = (value: unknown): BackyJsonObject => (
    isRecord(value) ? value as BackyJsonObject : {}
);

const createRevision = (input: BackyCacheInvalidationRecordInput) => (
    input.revision && input.revision.trim().length > 0
        ? input.revision.trim()
        : `rev_${Date.now().toString(36)}_${randomUUID().replace(/-/g, '').slice(0, 12)}`
);

const toCacheInvalidationEvent = (row: CacheInvalidationRow): BackyCacheInvalidationEvent => ({
    id: row.id,
    siteId: row.siteId,
    scope: normalizeScope(row.scope),
    entity: normalizeEntity(row.entityType),
    entityId: row.entityId,
    reason: row.reason,
    revision: row.revision,
    metadata: normalizeMetadata(row.metadata),
    createdAt: toIso(row.createdAt),
});

export function createCacheInvalidationRepository(db: DatabaseInstance): BackyCacheInvalidationRepository {
    const database = asDb(db);

    return {
        async list(input: BackyCacheInvalidationListInput): Promise<BackyListResult<BackyCacheInvalidationEvent>> {
            const baseQuery = input.siteId
                ? database.select().from(cacheInvalidationEvents).where(eq(cacheInvalidationEvents.siteId, input.siteId))
                : database.select().from(cacheInvalidationEvents);
            const rows = await baseQuery.orderBy(desc(cacheInvalidationEvents.createdAt)) as CacheInvalidationRow[];
            const filtered = rows
                .map(toCacheInvalidationEvent)
                .filter((entry) => input.siteId ? entry.siteId === input.siteId : true)
                .filter((entry) => input.scope ? entry.scope === input.scope : true)
                .filter((entry) => input.entity ? entry.entity === input.entity : true)
                .filter((entry) => input.entityId ? entry.entityId === input.entityId : true);
            return paginate(filtered, input.limit, input.offset);
        },

        async record(input: BackyCacheInvalidationRecordInput): Promise<BackyCacheInvalidationEvent> {
            const [row] = await database.insert(cacheInvalidationEvents).values({
                siteId: input.siteId || null,
                scope: normalizeScope(input.scope),
                entityType: input.entity,
                entityId: input.entityId || null,
                reason: input.reason,
                revision: createRevision(input),
                metadata: input.metadata || {},
            }).returning() as CacheInvalidationRow[];
            return toCacheInvalidationEvent(row);
        },

        async latestRevision(input: { siteId?: string; scope?: BackyCacheInvalidationScope }): Promise<string | null> {
            const result = await this.list({
                siteId: input.siteId,
                scope: input.scope,
                limit: 1,
                offset: 0,
            });
            return result.items[0]?.revision || null;
        },
    };
}
