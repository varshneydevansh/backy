import { randomUUID } from 'node:crypto';
import {
    type BackyContentRevision,
    type BackyContentRevisionCreateInput,
    type BackyContentRevisionListInput,
    type BackyContentRevisionOperation,
    type BackyContentTargetType,
    type BackyContentWorkflowRepository,
    type BackyJsonObject,
    type BackyListResult,
    type BackyPreviewToken,
    type BackyPreviewTokenCreateInput,
} from '@backy-cms/core';
import { and, desc, eq } from 'drizzle-orm';
import { contentRevisions, previewTokens } from '../schema';
import type { DatabaseInstance } from '../adapters';

type QueryDatabase = {
    select: (...args: unknown[]) => {
        from: (table: unknown) => QueryBuilder;
    };
    insert: (table: unknown) => {
        values: (value: Record<string, unknown>) => ReturningQuery;
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

type RevisionRow = typeof contentRevisions.$inferSelect;
type PreviewTokenRow = typeof previewTokens.$inferSelect;

const DEFAULT_LIMIT = 25;
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

const normalizeTargetType = (value: unknown): BackyContentTargetType => (
    value === 'post' ? 'post' : 'page'
);

const normalizeSnapshot = (value: unknown): BackyJsonObject => (
    isRecord(value) ? value as BackyJsonObject : {}
);

const normalizeMetadata = (value: unknown): BackyJsonObject => (
    isRecord(value) ? value as BackyJsonObject : {}
);

const RESTORE_TARGET_PATTERN = /\b(?:rollback|restore)\s+to\s+([a-zA-Z0-9_-]+)/i;

const restoreTargetFromNote = (note?: string | null): string | null => (
    note?.match(RESTORE_TARGET_PATTERN)?.[1] || null
);

const inferRevisionOperation = (
    operation?: BackyContentRevisionOperation | null,
    note?: string | null,
    restoreTargetRevisionId?: string | null,
): BackyContentRevisionOperation => {
    if (operation && operation.trim()) return operation.trim() as BackyContentRevisionOperation;
    if (restoreTargetRevisionId) return 'rollback';
    const normalized = (note || '').toLowerCase();
    if (normalized.includes('publish')) return 'publish';
    if (normalized.includes('archive')) return 'archive';
    if (normalized.includes('rollback') || normalized.includes('restore')) return 'rollback';
    if (normalized.includes('migration') || normalized.includes('migrate')) return 'migration';
    return 'update';
};

const toRevision = (row: RevisionRow): BackyContentRevision => ({
    id: row.id,
    siteId: row.siteId,
    targetType: normalizeTargetType(row.targetType),
    targetId: row.targetId,
    snapshot: normalizeSnapshot(row.snapshot),
    note: row.note,
    parentRevisionId: row.parentRevisionId || null,
    operation: row.operation as BackyContentRevisionOperation | null,
    restoreTargetRevisionId: row.restoreTargetRevisionId || restoreTargetFromNote(row.note),
    metadata: normalizeMetadata(row.metadata),
    createdBy: row.createdBy,
    createdAt: toIso(row.createdAt),
});

const toPreviewToken = (row: PreviewTokenRow): BackyPreviewToken => ({
    token: row.token,
    siteId: row.siteId,
    targetType: normalizeTargetType(row.targetType),
    targetId: row.targetId,
    createdAt: toIso(row.createdAt),
    expiresAt: toIso(row.expiresAt),
    createdBy: row.createdBy,
});

const boundedTtlSeconds = (value?: number): number => (
    Math.min(Math.max(Math.floor(value || 3600), 60), 60 * 60 * 24)
);

export function createContentWorkflowRepository(db: DatabaseInstance): BackyContentWorkflowRepository {
    const database = asDb(db);

    return {
        async listRevisions(input: BackyContentRevisionListInput): Promise<BackyListResult<BackyContentRevision>> {
            const rows = await database.select().from(contentRevisions).where(eq(contentRevisions.siteId, input.siteId)).orderBy(desc(contentRevisions.createdAt)) as RevisionRow[];
            const filtered = rows
                .map(toRevision)
                .filter((revision) => revision.targetType === input.targetType)
                .filter((revision) => revision.targetId === input.targetId);
            return paginate(filtered, input.limit, input.offset);
        },

        async getRevisionById(siteId: string, targetType: BackyContentTargetType, targetId: string, revisionId: string): Promise<BackyContentRevision | null> {
            const row = await firstOrNull<RevisionRow>(
                database.select().from(contentRevisions).where(and(eq(contentRevisions.siteId, siteId), eq(contentRevisions.id, revisionId))).limit(1),
            );
            const revision = row ? toRevision(row) : null;
            return revision && revision.targetType === targetType && revision.targetId === targetId ? revision : null;
        },

        async createRevision(input: BackyContentRevisionCreateInput): Promise<BackyContentRevision> {
            const [latest] = await database
                .select()
                .from(contentRevisions)
                .where(and(
                    eq(contentRevisions.siteId, input.siteId),
                    eq(contentRevisions.targetType, input.targetType),
                    eq(contentRevisions.targetId, input.targetId),
                ))
                .orderBy(desc(contentRevisions.createdAt))
                .limit(1) as RevisionRow[];
            const note = input.note || null;
            const parentRevisionId = input.parentRevisionId === undefined
                ? latest?.id || null
                : input.parentRevisionId || null;
            const restoreTargetRevisionId = input.restoreTargetRevisionId || restoreTargetFromNote(note);
            const operation = inferRevisionOperation(input.operation, note, restoreTargetRevisionId);
            const metadata = {
                ...normalizeMetadata(input.metadata),
                schemaVersion: 'backy.content-revision-metadata.v1',
                operation,
                parentRevisionId,
                restoreTargetRevisionId,
                targetType: input.targetType,
                targetId: input.targetId,
            } satisfies BackyJsonObject;

            const [row] = await database.insert(contentRevisions).values({
                siteId: input.siteId,
                targetType: input.targetType,
                targetId: input.targetId,
                snapshot: input.snapshot,
                note,
                parentRevisionId,
                operation,
                restoreTargetRevisionId,
                metadata,
                createdBy: input.createdBy || null,
            }).returning() as RevisionRow[];
            return toRevision(row);
        },

        async createPreviewToken(input: BackyPreviewTokenCreateInput): Promise<BackyPreviewToken> {
            const now = Date.now();
            const [row] = await database.insert(previewTokens).values({
                token: `preview_${randomUUID()}`,
                siteId: input.siteId,
                targetType: input.targetType,
                targetId: input.targetId,
                createdAt: new Date(now),
                expiresAt: new Date(now + boundedTtlSeconds(input.ttlSeconds) * 1000),
                createdBy: input.createdBy || null,
            }).returning() as PreviewTokenRow[];
            return toPreviewToken(row);
        },

        async validatePreviewToken(siteId: string, targetType: BackyContentTargetType, targetId: string, token: string): Promise<boolean> {
            if (!token) {
                return false;
            }

            const row = await firstOrNull<PreviewTokenRow>(
                database.select().from(previewTokens).where(and(eq(previewTokens.siteId, siteId), eq(previewTokens.token, token))).limit(1),
            );
            const previewToken = row ? toPreviewToken(row) : null;
            return Boolean(
                previewToken &&
                previewToken.targetType === targetType &&
                previewToken.targetId === targetId &&
                Date.parse(previewToken.expiresAt) > Date.now(),
            );
        },

        async deletePreviewTokensForTarget(siteId: string, targetType: BackyContentTargetType, targetId: string): Promise<number> {
            const rows = await database.select().from(previewTokens).where(eq(previewTokens.siteId, siteId)) as PreviewTokenRow[];
            const matches = rows
                .map(toPreviewToken)
                .filter((token) => token.targetType === targetType && token.targetId === targetId);
            for (const match of matches) {
                await database.delete(previewTokens).where(and(eq(previewTokens.siteId, siteId), eq(previewTokens.token, match.token)));
            }
            return matches.length;
        },
    };
}
