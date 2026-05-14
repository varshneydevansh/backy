import {
    type BackyAuditLogEntry,
    type BackyAuditLogListInput,
    type BackyJsonObject,
    type BackyListResult,
    type BackyRepositoryEntity,
    type BackyAuditLogRepository,
} from '@backy-cms/core';
import { and, desc, eq, sql, type SQLWrapper } from 'drizzle-orm';
import { activityLogs } from '../schema';
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

type AuditLogRow = typeof activityLogs.$inferSelect;

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

const normalizeEntity = (value: unknown): BackyRepositoryEntity => {
    if (
        value === 'site' ||
        value === 'page' ||
        value === 'post' ||
        value === 'blogCategory' ||
        value === 'blogTag' ||
        value === 'collection' ||
        value === 'collectionRecord' ||
        value === 'media' ||
        value === 'mediaFolder' ||
        value === 'form' ||
        value === 'formSubmission' ||
        value === 'reusableSection' ||
        value === 'contact' ||
        value === 'comment' ||
        value === 'user' ||
        value === 'settings' ||
        value === 'auditLog' ||
        value === 'cacheInvalidation'
    ) {
        return value;
    }

    return 'auditLog';
};

const toMetadata = (details: unknown): BackyJsonObject => (
    isRecord(details) ? details as BackyJsonObject : {}
);

const toAuditLogEntry = (row: AuditLogRow): BackyAuditLogEntry => {
    const metadata = toMetadata(row.details);

    return {
        id: row.id,
        siteId: row.siteId,
        teamId: typeof metadata.teamId === 'string' ? metadata.teamId : null,
        actorId: row.userId,
        entity: normalizeEntity(row.entityType),
        entityId: row.entityId || '',
        action: row.action,
        before: isRecord(metadata.before) ? metadata.before as BackyJsonObject : undefined,
        after: isRecord(metadata.after) ? metadata.after as BackyJsonObject : undefined,
        metadata,
        requestId: typeof metadata.requestId === 'string' ? metadata.requestId : undefined,
        createdAt: toIso(row.createdAt),
    };
};

export function createAuditLogRepository(db: DatabaseInstance): BackyAuditLogRepository {
    const database = asDb(db);

    return {
        async list(input: BackyAuditLogListInput): Promise<BackyListResult<BackyAuditLogEntry>> {
            const conditions: SQLWrapper[] = [];
            if (input.siteId) conditions.push(eq(activityLogs.siteId, input.siteId));
            if (input.teamId) conditions.push(sql`${activityLogs.details}->>'teamId' = ${input.teamId}`);
            if (input.actorId) conditions.push(eq(activityLogs.userId, input.actorId));
            if (input.entity) conditions.push(eq(activityLogs.entityType, input.entity));
            if (input.entityId) conditions.push(eq(activityLogs.entityId, input.entityId));
            if (input.action) conditions.push(eq(activityLogs.action, input.action));
            if (input.requestId) conditions.push(sql`${activityLogs.details}->>'requestId' = ${input.requestId}`);
            const baseQuery = conditions.length > 0
                ? database.select().from(activityLogs).where(and(...conditions))
                : database.select().from(activityLogs);
            const rows = await baseQuery.orderBy(desc(activityLogs.createdAt)) as AuditLogRow[];
            return paginate(rows.map(toAuditLogEntry), input.limit, input.offset);
        },

        async record(input: Omit<BackyAuditLogEntry, 'id' | 'createdAt'>): Promise<BackyAuditLogEntry> {
            const metadata: BackyJsonObject = {
                ...(input.metadata || {}),
                ...(input.teamId ? { teamId: input.teamId } : {}),
                ...(input.requestId ? { requestId: input.requestId } : {}),
                ...(input.before ? { before: input.before } : {}),
                ...(input.after ? { after: input.after } : {}),
            };
            const [row] = await database.insert(activityLogs).values({
                siteId: input.siteId || null,
                userId: input.actorId || null,
                action: input.action,
                entityType: input.entity,
                entityId: input.entityId,
                details: metadata,
                ipAddress: typeof metadata.ipAddress === 'string' ? metadata.ipAddress : null,
                userAgent: typeof metadata.userAgent === 'string' ? metadata.userAgent : null,
            }).returning() as AuditLogRow[];
            return toAuditLogEntry(row);
        },
    };
}
