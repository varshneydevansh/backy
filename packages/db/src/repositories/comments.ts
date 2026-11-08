import { withVisitorPrivacyFollowup } from './visitor-privacy-admission';
import { withActiveVisitorAdmission } from './visitor-accounts';
import {
    type BackyCommentCreateInput,
    type BackyCommentBlockIdentityInput,
    type BackyCommentBlocklistDeleteResult,
    type BackyCommentBlocklistListInput,
    type BackyCommentListInput,
    type BackyCommentRepository,
    type BackyCommentReportInput,
    type BackyCommentModerationInput,
    type BackyCommentModerationResult,
    type BackyCommentUpdateInput,
    type BackyListResult,
    type BackyRepositoryMutationResult,
    type Comment,
    type CommentBlocklistEntry,
    type CommentReportReason,
    type CommentStatus,
    type CommentTargetType,
} from '@backy-cms/core';
import { BACKY_COMMENT_INVENTORY_LIMIT, BackyCommentLifecycleError, collectBackyCommentSubtree, assertBackyCommentParent } from '@backy-cms/core';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import * as schema from '../schema';
import { isContentPublished } from '@backy-cms/core';
import { and, desc, eq, or, sql } from 'drizzle-orm';
import { commentBlocklist, comments, pages, blogPosts, sites } from '../schema';
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

const searchText = (comment: Comment, search: string, publicOnly = false): boolean => {
    const needle = search.toLowerCase();
    return [
        comment.content,
        comment.authorName,
        publicOnly ? undefined : comment.authorEmail,
        comment.authorWebsite,
    ]
        .filter(Boolean)
        .map((value) => (value || '').toLowerCase())
        .join(' ')
        .includes(needle);
};

const toComment = (row: CommentRow): Comment => ({
    visitorMemberId: row.visitorMemberId,
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

export function createCommentRepository(db: DatabaseInstance, adapterType = 'postgres'): BackyCommentRepository {
    const database = asDb(db);
    const postgres = db as unknown as NodePgDatabase<typeof schema>;
    // All repository comment mutations acquire the site first. Waiting replies revalidate
    // their parent after a deletion commits, rather than inserting against a stale read.
    const admitted = async <T>(siteId: string, run: (transaction: DatabaseInstance) => Promise<T>): Promise<T> => {
        if (adapterType !== 'postgres') return run(db);
        return postgres.transaction(async tx => {
            const [site] = await tx.select({ id: sites.id }).from(sites).where(eq(sites.id, siteId)).for('update');
            if (!site) throw new BackyCommentLifecycleError('COMMENT_PARENT_CONFLICT', 'The comment site no longer exists.');
            return run(tx as unknown as DatabaseInstance);
        });
    };
    const inventory = async (transaction: DatabaseInstance, siteId: string): Promise<Comment[]> => {
        const rows = await (transaction as unknown as NodePgDatabase<typeof schema>).select().from(comments).where(eq(comments.siteId, siteId)).limit(BACKY_COMMENT_INVENTORY_LIMIT + 1).for('update');
        if (rows.length > BACKY_COMMENT_INVENTORY_LIMIT) throw new BackyCommentLifecycleError('COMMENT_INVENTORY_INCOMPLETE', 'The complete comment inventory exceeds the supported limit.');
        return rows.map(toComment);
    };


    const blockIdentities = async (transaction: DatabaseInstance, input: BackyCommentBlockIdentityInput): Promise<CommentBlocklistEntry[]> => {
        const tx = transaction as unknown as NodePgDatabase<typeof schema>;
        const now = new Date(), blocked: CommentBlocklistEntry[] = [];
        for (const entry of [input.email ? { type: 'email' as const, value: normalizeIdentifier(input.email) } : null, input.ipHash ? { type: 'ip' as const, value: normalizeIdentifier(input.ipHash) } : null]) {
            if (!entry) continue;
            const id = commentBlocklistId(input.siteId, entry.type, entry.value);
            const [row] = await tx.insert(commentBlocklist).values({ id, siteId: input.siteId, type: entry.type, value: entry.value, reason: input.reason, actor: input.actor || null, requestId: input.requestId || null, createdAt: now })
                .onConflictDoUpdate({ target: commentBlocklist.id, set: { reason: input.reason, actor: input.actor || null, requestId: input.requestId || null, createdAt: now }, setWhere: eq(commentBlocklist.siteId, input.siteId) }).returning();
            if (!row) throw new BackyCommentLifecycleError('COMMENT_MODERATION_CONFLICT', 'The selected block identity changed.');
            blocked.push(toCommentBlocklistEntry(row));
        }
        return blocked;
    };

    return {
        withPrivacyFollowup: (siteId, commentId, operation) => withVisitorPrivacyFollowup(db,siteId,{commentId},operation),
        async moderateBatch(siteId: string, input: BackyCommentModerationInput): Promise<BackyCommentModerationResult> {
            if (adapterType !== 'postgres') throw new BackyCommentLifecycleError('COMMENT_MODERATION_UNAVAILABLE', 'Atomic comment moderation is unavailable.');
            const ids = Array.from(new Set(input.commentIds.map(id => id.trim()).filter(Boolean)));
            if (ids.length > BACKY_COMMENT_INVENTORY_LIMIT) throw new BackyCommentLifecycleError('COMMENT_INVENTORY_INCOMPLETE', 'The selected moderation inventory exceeds the supported limit.');
            if (!input.status && !input.clearReports) throw new BackyCommentLifecycleError('COMMENT_MODERATION_CONFLICT', 'A moderation operation is required.');
            return admitted(siteId, async transaction => {
                const tx = transaction as unknown as NodePgDatabase<typeof schema>;
                const rows = ids.length ? await tx.select().from(comments).where(and(eq(comments.siteId, siteId), sql`${comments.id}::text IN (SELECT value FROM jsonb_array_elements_text(${JSON.stringify(ids)}::jsonb))`)).for('update') : [];
                const current = new Map(rows.map(row => [row.id, row])), updated: Comment[] = [], missingIds: string[] = [];
                const reviewer = input.actor || input.reviewedBy || input.defaultReviewer || null;
                for (const id of ids) {
                    const row = current.get(id); if (!row) { missingIds.push(id); continue; }
                    const now = new Date(), requestId = input.requestId || row.requestId || null;
                    const changes: Partial<typeof comments.$inferInsert> = { reviewedBy: reviewer, reviewedAt: now, updatedAt: now, requestId };
                    if (input.clearReports) { changes.reportCount = 0; changes.reportReasons = []; }
                    if (input.status) {
                        changes.status = input.status; changes.rejectionReason = input.rejectionReason ?? null;
                        if (input.status === 'blocked') {
                            changes.blockReason = normalizeReportReasons([input.blockReason])[0] || input.blockReason || 'manual-block';
                            changes.blockedBy = reviewer; changes.blockedAt = now;
                            await blockIdentities(transaction, { siteId, reason: changes.blockReason, actor: reviewer, requestId, email: row.authorEmail, ipHash: row.ipHash });
                        } else if (input.status !== 'rejected' && input.status !== 'spam') {
                            changes.blockReason = null; changes.blockedBy = null; changes.blockedAt = null; changes.rejectionReason = null;
                        }
                    }
                    const [saved] = await tx.update(comments).set(changes).where(and(eq(comments.siteId, siteId), eq(comments.id, id))).returning();
                    updated.push(toComment(saved));
                }
                return { updated, missingIds };
            });
        },
        async report(siteId: string, commentId: string, input: BackyCommentReportInput): Promise<BackyRepositoryMutationResult<Comment>> {
            if (adapterType !== 'postgres') throw new BackyCommentLifecycleError('COMMENT_REPORT_UNAVAILABLE', 'Atomic comment reporting is unavailable.');
            if (!normalizeReportReasons([input.reason]).length) throw new BackyCommentLifecycleError('COMMENT_REPORT_CONFLICT', 'The report reason is invalid.');
            try {
                return await admitted(siteId, async transaction => {
                    const tx = transaction as unknown as NodePgDatabase<typeof schema>;
                    const [site] = await tx.select().from(sites).where(eq(sites.id, siteId));
                    const [current] = await tx.select().from(comments).where(and(eq(comments.siteId, siteId), eq(comments.id, commentId))).for('update');
                    const policy = (site?.settings as { commentPolicy?: { enableReports?: boolean } } | undefined)?.commentPolicy;
                    if (!site?.isPublished || !current || current.status !== 'approved' || policy?.enableReports === false) {
                        throw new BackyCommentLifecycleError('COMMENT_REPORT_CONFLICT', 'The comment is no longer reportable. Reload the thread.');
                    }
                    const [target] = current.targetType === 'page'
                        ? await tx.select().from(pages).where(and(eq(pages.siteId, siteId), eq(pages.id, current.targetId))).for('update')
                        : await tx.select().from(blogPosts).where(and(eq(blogPosts.siteId, siteId), eq(blogPosts.id, current.targetId))).for('update');
                    if (!target || !isContentPublished(target)) throw new BackyCommentLifecycleError('COMMENT_REPORT_CONFLICT', 'The comment is no longer reportable. Reload the thread.');
                    const reportCount = (current.reportCount || 0) + 1;
                    const reportReasons = Array.from(new Set([...normalizeReportReasons(current.reportReasons), input.reason]));
                    const [updated] = await tx.update(comments).set({
                        reportCount, reportReasons, status: reportCount >= 3 ? 'spam' : current.status,
                        updatedAt: new Date(), ...(input.requestId !== undefined ? { requestId: input.requestId } : {}),
                    }).where(and(eq(comments.siteId, siteId), eq(comments.id, commentId))).returning();
                    return { item: toComment(updated) };
                });
            } catch (error) {
                if (error instanceof BackyCommentLifecycleError && error.code === 'COMMENT_PARENT_CONFLICT') throw new BackyCommentLifecycleError('COMMENT_REPORT_CONFLICT', 'The comment is no longer reportable. Reload the thread.');
                throw error;
            }
        },
        async list(input: BackyCommentListInput): Promise<BackyListResult<Comment>> {
            const rows = await database.select().from(comments).where(eq(comments.siteId, input.siteId)).orderBy(desc(comments.createdAt)) as CommentRow[];
            let publicTargets: Set<string> | undefined;
            if (input.publicOnly) {
                const site = await firstOrNull<{ isPublished: boolean }>(database.select({ isPublished: sites.isPublished }).from(sites).where(eq(sites.id, input.siteId)).limit(1));
                if (!site?.isPublished) return paginate([], input.limit, input.offset);
                const [pageRows, postRows] = await Promise.all([
                    database.select({ id: pages.id, status: pages.status, scheduledAt: pages.scheduledAt }).from(pages).where(eq(pages.siteId, input.siteId)),
                    database.select({ id: blogPosts.id, status: blogPosts.status, scheduledAt: blogPosts.scheduledAt }).from(blogPosts).where(eq(blogPosts.siteId, input.siteId)),
                ]) as { id: string; status: string; scheduledAt: Date | null }[][];
                publicTargets = new Set([
                    ...pageRows.filter((row) => isContentPublished(row)).map((row) => `page:${row.id}`),
                    ...postRows.filter((row) => isContentPublished(row)).map((row) => `post:${row.id}`),
                ]);
            }
            const normalizedParentId = typeof input.parentId === 'string' && input.parentId.length > 0 ? input.parentId : null;
            const filtered = rows
                .map(toComment)
                .filter((comment) => !input.publicOnly || (comment.status === 'approved' && publicTargets?.has(`${comment.targetType}:${comment.targetId}`)))
                .filter((comment) => input.targetType ? comment.targetType === input.targetType : true)
                .filter((comment) => input.targetId ? comment.targetId === input.targetId : true)
                .filter((comment) => input.status && input.status !== 'all' ? comment.status === input.status : true)
                .filter((comment) => input.requestId && !input.publicOnly ? comment.requestId === input.requestId : true)
                .filter((comment) => input.commentThreadId ? comment.commentThreadId === input.commentThreadId : true)
                .filter((comment) => input.q ? searchText(comment, input.q, input.publicOnly) : true)
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
            if (adapterType !== 'postgres') throw new BackyCommentLifecycleError('COMMENT_SUBMISSION_UNAVAILABLE', 'Authoritative comment identity admission is unavailable.');
            const now = new Date();
            return admitted(input.siteId, transaction => withActiveVisitorAdmission(transaction, input.siteId, input.visitorMemberId, async persistedDatabase => {
            // Block/unblock and creation share site admission. Read persisted
            // identity here, never from a process-local classifier snapshot.
            const identities = [
                input.authorEmail ? and(eq(commentBlocklist.type, 'email'), eq(commentBlocklist.value, normalizeIdentifier(input.authorEmail))) : undefined,
                input.ipHash ? and(eq(commentBlocklist.type, 'ip'), eq(commentBlocklist.value, normalizeIdentifier(input.ipHash))) : undefined,
            ].filter(Boolean);
            if (identities.length) {
                const [blocked] = await (persistedDatabase as unknown as NodePgDatabase<typeof schema>).select({ id: commentBlocklist.id }).from(commentBlocklist)
                    .where(and(eq(commentBlocklist.siteId, input.siteId), or(...identities))).limit(1).for('update');
                if (blocked) throw new BackyCommentLifecycleError('COMMENT_IDENTITY_BLOCKED', 'This identity cannot submit a comment.');
            }
            const parent = input.parentId ? await createCommentRepository(persistedDatabase, adapterType).getById(input.siteId, input.parentId) : null;
            assertBackyCommentParent({ id: '', siteId: input.siteId, targetType: input.targetType, targetId: input.targetId, commentThreadId: input.commentThreadId || undefined }, parent, input.parentId);
            const [row] = await asDb(persistedDatabase).insert(comments).values({
                visitorMemberId: input.visitorMemberId || null,
                siteId: input.siteId,
                targetType: input.targetType,
                targetId: input.targetId,
                commentThreadId: input.commentThreadId || parent?.commentThreadId || null,
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
            }));
        },

        async update(siteId: string, commentId: string, input: BackyCommentUpdateInput): Promise<BackyRepositoryMutationResult<Comment>> {
            return admitted(siteId, async transaction => {
            const scoped = asDb(transaction), repository = createCommentRepository(transaction, adapterType);
            const current = await repository.getById(siteId, commentId);
            if (!current) throw new BackyCommentLifecycleError('COMMENT_PARENT_CONFLICT', 'The comment no longer exists. Reload the thread before retrying.');
            if (input.parentId) {
                const parent = await repository.getById(siteId, input.parentId);
                assertBackyCommentParent({ ...current, commentThreadId: input.commentThreadId || undefined }, parent, input.parentId);
                const visited = new Set<string>([commentId]); let ancestor = parent;
                while (ancestor) {
                    if (visited.has(ancestor.id) || visited.size > BACKY_COMMENT_INVENTORY_LIMIT) throw new BackyCommentLifecycleError('COMMENT_TREE_INVALID', 'A reply cannot be moved into its own subtree.');
                    visited.add(ancestor.id);
                    ancestor = ancestor.parentId ? await repository.getById(siteId, ancestor.parentId) : null;
                }
            }
            const updates: Record<string, unknown> = { updatedAt: new Date() };
            if (input.content !== undefined) updates.content = input.content;
            if (input.status !== undefined) updates.status = input.status;
            if (input.parentId !== undefined) updates.parentId = input.parentId;
            if (input.commentThreadId !== undefined) updates.commentThreadId = input.commentThreadId;
            else if (input.parentId !== undefined) updates.commentThreadId = input.parentId ? (await repository.getById(siteId, input.parentId))?.commentThreadId || null : null;
            if (input.reviewedBy !== undefined) updates.reviewedBy = input.reviewedBy;
            if (input.reviewedAt !== undefined) updates.reviewedAt = input.reviewedAt ? new Date(input.reviewedAt) : null;
            if (input.rejectionReason !== undefined) updates.rejectionReason = input.rejectionReason;
            if (input.blockReason !== undefined) updates.blockReason = input.blockReason;
            if (input.blockedBy !== undefined) updates.blockedBy = input.blockedBy;
            if (input.blockedAt !== undefined) updates.blockedAt = input.blockedAt ? new Date(input.blockedAt) : null;
            if (input.reportCount !== undefined) updates.reportCount = Math.max(0, Math.floor(input.reportCount));
            if (input.reportReasons !== undefined) updates.reportReasons = input.reportReasons || [];
            if (input.requestId !== undefined) updates.requestId = input.requestId;

            const [row] = await scoped.update(comments).set(updates).where(and(eq(comments.siteId, siteId), eq(comments.id, commentId))).returning() as CommentRow[];
            return { item: toComment(row) };
            });
        },

        async deleteSubtree(siteId: string, commentId: string): Promise<Comment[]> {
            if (adapterType !== 'postgres') throw new BackyCommentLifecycleError('COMMENT_LIFECYCLE_UNAVAILABLE', 'Atomic comment deletion requires the PostgreSQL adapter.');
            return admitted(siteId, async transaction => {
                const selected = collectBackyCommentSubtree(siteId, commentId, await inventory(transaction, siteId));
                if (!selected.length) return [];
                const deleted = await (transaction as unknown as NodePgDatabase<typeof schema>).delete(comments).where(and(eq(comments.siteId, siteId), sql`${comments.id} IN (SELECT value::uuid FROM jsonb_array_elements_text(${JSON.stringify(selected.map(comment => comment.id))}::jsonb))`)).returning();
                if (deleted.length !== selected.length) throw new BackyCommentLifecycleError('COMMENT_INVENTORY_INCOMPLETE', 'The selected comment subtree could not be deleted completely.');
                return selected;
            });
        },
        async delete(siteId: string, commentId: string): Promise<boolean> {
            return (await this.deleteSubtree(siteId, commentId)).length > 0;
        },
        async deleteForTarget(siteId: string, targetType: Comment['targetType'], targetId: string): Promise<number> {
            return admitted(siteId, async transaction => {
                const rows = await (transaction as unknown as NodePgDatabase<typeof schema>).delete(comments).where(and(eq(comments.siteId, siteId), eq(comments.targetType, targetType), eq(comments.targetId, targetId))).returning({ id: comments.id });
                return rows.length;
            });
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
            if (adapterType !== 'postgres') throw new BackyCommentLifecycleError('COMMENT_MODERATION_UNAVAILABLE', 'Atomic identity blocking is unavailable.');
            return admitted(input.siteId, transaction => blockIdentities(transaction, input));
        },

        async deleteBlocklistEntries(siteId: string, ids: string[]): Promise<BackyCommentBlocklistDeleteResult> {
            if (adapterType !== 'postgres') throw new BackyCommentLifecycleError('COMMENT_MODERATION_UNAVAILABLE', 'Atomic blocklist deletion is unavailable.');
            const normalizedIds = Array.from(new Set(ids.map(id => id.trim()).filter(Boolean)));
            if (normalizedIds.length > BACKY_COMMENT_INVENTORY_LIMIT) throw new BackyCommentLifecycleError('COMMENT_INVENTORY_INCOMPLETE', 'The selected blocklist inventory exceeds the supported limit.');
            return admitted(siteId, async transaction => {
                const tx = transaction as unknown as NodePgDatabase<typeof schema>;
                const rows = normalizedIds.length ? await tx.delete(commentBlocklist).where(and(eq(commentBlocklist.siteId, siteId), sql`${commentBlocklist.id} IN (SELECT value FROM jsonb_array_elements_text(${JSON.stringify(normalizedIds)}::jsonb))`)).returning() : [];
                const byId = new Map(rows.map(row => [row.id, row]));
                return { deleted: normalizedIds.filter(id => byId.has(id)).map(id => toCommentBlocklistEntry(byId.get(id)!)), missingIds: normalizedIds.filter(id => !byId.has(id)) };
            });
        },
    };
}
