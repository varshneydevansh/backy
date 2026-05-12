import {
    type BackyCommentCreateInput,
    type BackyCommentBlockIdentityInput,
    type BackyCommentBlocklistDeleteResult,
    type BackyCommentBlocklistListInput,
    type BackyCommentListInput,
    type BackyCommentRepository,
    type BackyCommentUpdateInput,
    type BackyListResult,
    type BackyRepositoryMutationResult,
    type Comment,
    type CommentBlocklistEntry,
    type CommentReportReason,
    type CommentStatus,
    type CommentTargetType,
} from '@backy-cms/core';
import { and, desc, eq } from 'drizzle-orm';
import { commentBlocklist, comments } from '../schema';
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

type CommentRow = typeof comments.$inferSelect;
type CommentBlocklistRow = typeof commentBlocklist.$inferSelect;

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 100;

const asDb = (db: DatabaseInstance): QueryDatabase => db as unknown as QueryDatabase;

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

const normalizeTargetType = (value: unknown): CommentTargetType => (
    value === 'post' ? 'post' : 'page'
);

const normalizeStatus = (value: unknown): CommentStatus => {
    if (
        value === 'pending' ||
        value === 'approved' ||
        value === 'rejected' ||
        value === 'spam' ||
        value === 'blocked'
    ) {
        return value;
    }

    return 'pending';
};

const normalizeReportReasons = (value: unknown): CommentReportReason[] => (
    Array.isArray(value)
        ? value.filter((reason): reason is CommentReportReason => (
            reason === 'spam' ||
            reason === 'harassment' ||
            reason === 'abuse' ||
            reason === 'hate-speech' ||
            reason === 'off-topic' ||
            reason === 'copyright' ||
            reason === 'privacy' ||
            reason === 'other'
        ))
        : []
);

const searchText = (comment: Comment, search: string): boolean => {
    const needle = search.toLowerCase();
    return [
        comment.content,
        comment.authorName,
        comment.authorEmail,
        comment.authorWebsite,
    ]
        .filter(Boolean)
        .map((value) => (value || '').toLowerCase())
        .join(' ')
        .includes(needle);
};

const toComment = (row: CommentRow): Comment => ({
    id: row.id,
    siteId: row.siteId,
    targetType: normalizeTargetType(row.targetType),
    targetId: row.targetId,
    commentThreadId: row.commentThreadId || undefined,
    authorName: row.authorName,
    authorEmail: row.authorEmail,
    authorWebsite: row.authorWebsite,
    userId: row.userId,
    content: row.content,
    status: normalizeStatus(row.status),
    parentId: row.parentId,
    reviewedBy: row.reviewedBy,
    reviewedAt: toNullableIso(row.reviewedAt),
    rejectionReason: row.rejectionReason,
    blockReason: row.blockReason,
    blockedBy: row.blockedBy,
    blockedAt: toNullableIso(row.blockedAt),
    reportCount: row.reportCount || 0,
    reportReasons: normalizeReportReasons(row.reportReasons),
    requestId: row.requestId,
    ipHash: row.ipHash,
    createdAt: toIso(row.createdAt),
    updatedAt: toIso(row.updatedAt),
});

const normalizeIdentifier = (value: string): string => value.trim().toLowerCase();

const commentBlocklistId = (
    siteId: string,
    type: CommentBlocklistEntry['type'],
    value: string,
): string => `${siteId}:${type}:${normalizeIdentifier(value)}`;

const normalizeBlocklistType = (value: unknown): CommentBlocklistEntry['type'] => (
    value === 'ip' ? 'ip' : 'email'
);

const toCommentBlocklistEntry = (row: CommentBlocklistRow): CommentBlocklistEntry => ({
    id: row.id,
    siteId: row.siteId,
    type: normalizeBlocklistType(row.type),
    value: row.value,
    reason: row.reason,
    actor: row.actor,
    requestId: row.requestId,
    createdAt: toIso(row.createdAt),
});

const searchBlocklistEntry = (entry: CommentBlocklistEntry, search: string): boolean => {
    const needle = search.toLowerCase();
    return [
        entry.value,
        entry.reason,
        entry.actor,
        entry.requestId,
    ]
        .filter(Boolean)
        .map((value) => (value || '').toLowerCase())
        .join(' ')
        .includes(needle);
};

const sortBlocklist = (items: CommentBlocklistEntry[]): CommentBlocklistEntry[] => (
    [...items].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
);

const sortComments = (items: Comment[], sort: BackyCommentListInput['sort'] = 'newest'): Comment[] => (
    [...items].sort((a, b) => {
        const left = new Date(a.createdAt).getTime();
        const right = new Date(b.createdAt).getTime();
        return sort === 'oldest' ? left - right : right - left;
    })
);

export function createCommentRepository(db: DatabaseInstance): BackyCommentRepository {
    const database = asDb(db);

    return {
        async list(input: BackyCommentListInput): Promise<BackyListResult<Comment>> {
            const rows = await database.select().from(comments).where(eq(comments.siteId, input.siteId)).orderBy(desc(comments.createdAt)) as CommentRow[];
            const normalizedParentId = typeof input.parentId === 'string' && input.parentId.length > 0 ? input.parentId : null;
            const filtered = rows
                .map(toComment)
                .filter((comment) => input.targetType ? comment.targetType === input.targetType : true)
                .filter((comment) => input.targetId ? comment.targetId === input.targetId : true)
                .filter((comment) => input.status && input.status !== 'all' ? comment.status === input.status : true)
                .filter((comment) => input.requestId ? comment.requestId === input.requestId : true)
                .filter((comment) => input.commentThreadId ? comment.commentThreadId === input.commentThreadId : true)
                .filter((comment) => input.q ? searchText(comment, input.q) : true)
                .filter((comment) => input.parentOnly ? (normalizedParentId ? comment.parentId === normalizedParentId : comment.parentId == null) : true);
            return paginate(sortComments(filtered, input.sort), input.limit, input.offset);
        },

        async getById(siteId: string, commentId: string): Promise<Comment | null> {
            const row = await firstOrNull<CommentRow>(
                database.select().from(comments).where(and(eq(comments.siteId, siteId), eq(comments.id, commentId))).limit(1),
            );
            return row ? toComment(row) : null;
        },

        async create(input: BackyCommentCreateInput): Promise<BackyRepositoryMutationResult<Comment>> {
            const now = new Date();
            const [row] = await database.insert(comments).values({
                siteId: input.siteId,
                targetType: input.targetType,
                targetId: input.targetId,
                commentThreadId: input.commentThreadId || null,
                authorName: input.authorName || null,
                authorEmail: input.authorEmail || null,
                authorWebsite: input.authorWebsite || null,
                userId: input.userId || null,
                content: input.content,
                status: input.status || 'pending',
                parentId: input.parentId ?? null,
                reviewedBy: null,
                reviewedAt: null,
                rejectionReason: null,
                blockReason: null,
                blockedBy: null,
                blockedAt: null,
                reportCount: 0,
                reportReasons: [],
                requestId: input.requestId || null,
                ipHash: input.ipHash || null,
                createdAt: now,
                updatedAt: now,
            }).returning() as CommentRow[];
            return { item: toComment(row) };
        },

        async update(siteId: string, commentId: string, input: BackyCommentUpdateInput): Promise<BackyRepositoryMutationResult<Comment>> {
            const updates: Record<string, unknown> = { updatedAt: new Date() };
            if (input.content !== undefined) updates.content = input.content;
            if (input.status !== undefined) updates.status = input.status;
            if (input.parentId !== undefined) updates.parentId = input.parentId;
            if (input.commentThreadId !== undefined) updates.commentThreadId = input.commentThreadId;
            if (input.reviewedBy !== undefined) updates.reviewedBy = input.reviewedBy;
            if (input.reviewedAt !== undefined) updates.reviewedAt = input.reviewedAt ? new Date(input.reviewedAt) : null;
            if (input.rejectionReason !== undefined) updates.rejectionReason = input.rejectionReason;
            if (input.blockReason !== undefined) updates.blockReason = input.blockReason;
            if (input.blockedBy !== undefined) updates.blockedBy = input.blockedBy;
            if (input.blockedAt !== undefined) updates.blockedAt = input.blockedAt ? new Date(input.blockedAt) : null;
            if (input.reportCount !== undefined) updates.reportCount = Math.max(0, Math.floor(input.reportCount));
            if (input.reportReasons !== undefined) updates.reportReasons = input.reportReasons || [];
            if (input.requestId !== undefined) updates.requestId = input.requestId;

            const [row] = await database.update(comments).set(updates).where(and(eq(comments.siteId, siteId), eq(comments.id, commentId))).returning() as CommentRow[];
            return { item: toComment(row) };
        },

        async delete(siteId: string, commentId: string): Promise<boolean> {
            const existing = await this.getById(siteId, commentId);
            if (!existing) {
                return false;
            }

            await database.delete(comments).where(and(eq(comments.siteId, siteId), eq(comments.id, commentId)));
            return true;
        },

        async deleteForTarget(siteId: string, targetType: Comment['targetType'], targetId: string): Promise<number> {
            const existing = await this.list({ siteId, targetType, targetId, status: 'all', limit: MAX_LIMIT });
            await database.delete(comments).where(and(
                eq(comments.siteId, siteId),
                eq(comments.targetType, targetType),
                eq(comments.targetId, targetId),
            ));
            return existing.pagination.total;
        },

        async listBlocklist(input: BackyCommentBlocklistListInput): Promise<BackyListResult<CommentBlocklistEntry>> {
            const rows = await database.select().from(commentBlocklist).where(eq(commentBlocklist.siteId, input.siteId)).orderBy(desc(commentBlocklist.createdAt)) as CommentBlocklistRow[];
            const type = input.type === 'email' || input.type === 'ip' ? input.type : 'all';
            const filtered = rows
                .map(toCommentBlocklistEntry)
                .filter((entry) => type === 'all' ? true : entry.type === type)
                .filter((entry) => input.q ? searchBlocklistEntry(entry, input.q) : true);
            return paginate(sortBlocklist(filtered), input.limit, input.offset);
        },

        async blockIdentity(input: BackyCommentBlockIdentityInput): Promise<CommentBlocklistEntry[]> {
            const now = new Date();
            const values = [
                input.email ? { type: 'email' as const, value: normalizeIdentifier(input.email) } : null,
                input.ipHash ? { type: 'ip' as const, value: normalizeIdentifier(input.ipHash) } : null,
            ].filter((entry): entry is { type: CommentBlocklistEntry['type']; value: string } => Boolean(entry));
            const blocked: CommentBlocklistEntry[] = [];

            for (const entry of values) {
                const id = commentBlocklistId(input.siteId, entry.type, entry.value);
                const existing = await firstOrNull<CommentBlocklistRow>(
                    database.select().from(commentBlocklist).where(and(eq(commentBlocklist.siteId, input.siteId), eq(commentBlocklist.id, id))).limit(1),
                );
                const payload = {
                    siteId: input.siteId,
                    type: entry.type,
                    value: entry.value,
                    reason: input.reason,
                    actor: input.actor || null,
                    requestId: input.requestId || null,
                    createdAt: now,
                };

                if (existing) {
                    const [row] = await database.update(commentBlocklist).set(payload).where(and(eq(commentBlocklist.siteId, input.siteId), eq(commentBlocklist.id, id))).returning() as CommentBlocklistRow[];
                    blocked.push(toCommentBlocklistEntry(row));
                } else {
                    const [row] = await database.insert(commentBlocklist).values({
                        id,
                        ...payload,
                    }).returning() as CommentBlocklistRow[];
                    blocked.push(toCommentBlocklistEntry(row));
                }
            }

            return blocked;
        },

        async deleteBlocklistEntries(siteId: string, ids: string[]): Promise<BackyCommentBlocklistDeleteResult> {
            const normalizedIds = Array.from(new Set(ids.map((id) => id.trim()).filter(Boolean)));
            const deleted: CommentBlocklistEntry[] = [];
            const missingIds = new Set(normalizedIds);

            for (const id of normalizedIds) {
                const row = await firstOrNull<CommentBlocklistRow>(
                    database.select().from(commentBlocklist).where(and(eq(commentBlocklist.siteId, siteId), eq(commentBlocklist.id, id))).limit(1),
                );
                if (!row) {
                    continue;
                }

                await database.delete(commentBlocklist).where(and(eq(commentBlocklist.siteId, siteId), eq(commentBlocklist.id, id)));
                deleted.push(toCommentBlocklistEntry(row));
                missingIds.delete(id);
            }

            return {
                deleted,
                missingIds: Array.from(missingIds),
            };
        },
    };
}
