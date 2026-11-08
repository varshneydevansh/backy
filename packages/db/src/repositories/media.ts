import { mediaMatchesLinkedFilters } from '@backy-cms/core';
import { withSiteMediaMutationTransaction } from './media-mutation-admission';
import {
    type BackyListResult,
    type BackyMediaCreateInput,
    type BackyMediaFolderCreateInput,
    type BackyMediaFolderUpdateInput,
    type BackyMediaListInput,
    type BackyMediaRepository,
    type BackyMediaSiteVersionListInput,
    type BackyMediaUpdateInput,
    type BackyMediaVersionCreateInput,
    type BackyMediaVersionDeleteInput,
    type BackyMediaVersionListInput,
    type BackyRepositoryMutationResult,
    type MediaFolder,
    type MediaItem,
    type MediaMetadata,
    type MediaScope,
    type MediaVersion,
    type MediaVisibility,
} from '@backy-cms/core';
import { and, asc, desc, eq, inArray, isNull, or, sql } from 'drizzle-orm';
import {
    media,
    mediaFolders,
    mediaVersions,
} from '../schema';
import type { DatabaseInstance } from '../adapters';
import { createMediaStorageJobRepository } from './media-storage-jobs';

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

type MediaRow = typeof media.$inferSelect;
type MediaFolderRow = typeof mediaFolders.$inferSelect;
type MediaVersionRow = typeof mediaVersions.$inferSelect;

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 10000;

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

const toStringArray = (value: unknown): string[] => (
    Array.isArray(value)
        ? Array.from(new Map(value
            .flatMap((item) => (typeof item === 'string' ? item.split(/[,\n]/g) : []))
            .map((item) => item.trim().replace(/\s+/g, ' '))
            .filter(Boolean)
            .map((item) => [item.toLowerCase(), item])).values())
        : []
);

const normalizeUuid = (value: string | null | undefined): string | null => {
    const trimmed = typeof value === 'string' ? value.trim() : '';
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(trimmed)
        ? trimmed
        : null;
};

const normalizeMetadata = (value: unknown): MediaMetadata => (
    isRecord(value) ? value as MediaMetadata : {}
);

const metadataVisibility = (metadata: MediaMetadata): MediaVisibility => (
    metadata.visibility === 'private' ? 'private' : 'public'
);

const metadataScope = (metadata: MediaMetadata): MediaScope => (
    metadata.scope === 'page' || metadata.scope === 'post' ? metadata.scope : 'global'
);

const searchText = (value: string | null | undefined, search: string): boolean => (
    (value || '').toLowerCase().includes(search.toLowerCase())
);

const metadataText = (metadata: MediaMetadata, key: string): string => (
    typeof metadata[key] === 'string' ? metadata[key] : ''
);

const mediaSearchText = (item: MediaItem): string => [
    item.filename,
    item.originalName,
    item.mimeType,
    item.type,
    item.visibility,
    item.altText || '',
    item.caption || '',
    ...item.tags,
    metadataText(item.metadata, 'fontFamily'),
    metadataText(item.metadata, 'fontWeight'),
    metadataText(item.metadata, 'fontStyle'),
    metadataText(item.metadata, 'storageProvider'),
    metadataText(item.metadata, 'extension'),
].join(' ');

const toMediaItem = (row: MediaRow): MediaItem => {
    const metadata = normalizeMetadata(row.metadata);

    return {
        id: row.id,
        siteId: row.siteId,
        filename: row.filename,
        originalName: row.originalName,
        mimeType: row.mimeType,
        sizeBytes: row.sizeBytes,
        type: row.type,
        url: row.url,
        thumbnailUrl: row.thumbnailUrl,
        folderId: row.folderId,
        pageIds: toStringArray(metadata.pageIds),
        postIds: toStringArray(metadata.postIds),
        tags: toStringArray(row.tags),
        metadata,
        altText: row.altText,
        caption: row.caption,
        uploadedBy: row.uploadedBy,
        scope: metadataScope(metadata),
        scopeTargetId: typeof metadata.scopeTargetId === 'string' ? metadata.scopeTargetId : null,
        visibility: metadataVisibility(metadata),
        createdAt: toIso(row.createdAt),
        updatedAt: toIso(row.updatedAt),
    };
};

const toMediaFolder = (row: MediaFolderRow): MediaFolder => ({
    id: row.id,
    siteId: row.siteId,
    parentId: row.parentId,
    name: row.name,
    sortOrder: row.sortOrder,
    createdAt: toIso(row.createdAt),
});

const toMediaVersion = (row: MediaVersionRow): MediaVersion => ({
    id: row.id,
    siteId: row.siteId,
    mediaId: row.mediaId,
    filename: row.filename,
    originalName: row.originalName,
    mimeType: row.mimeType,
    sizeBytes: row.sizeBytes,
    type: row.type,
    url: row.url,
    thumbnailUrl: row.thumbnailUrl,
    storagePath: row.storagePath,
    storageProvider: row.storageProvider,
    replacedAt: toIso(row.replacedAt),
    replacedBy: row.replacedBy,
    reason: row.reason,
    metadata: normalizeMetadata(row.metadata),
    createdAt: toIso(row.createdAt),
});

const metadataWithPolicy = (
    metadata: MediaMetadata | undefined,
    input: {
        visibility?: MediaVisibility;
        scope?: MediaScope;
        scopeTargetId?: string | null;
    },
): MediaMetadata => ({
    ...(metadata || {}),
    visibility: input.visibility || metadata?.visibility || 'public',
    scope: input.scope || metadata?.scope || 'global',
    scopeTargetId: input.scopeTargetId ?? metadata?.scopeTargetId ?? null,
});

export function createMediaRepository(db: DatabaseInstance, provider: string = 'postgres'): BackyMediaRepository {
    const database = asDb(db);

    return {
        storageJobs: createMediaStorageJobRepository(db, provider),
        async getPublicRenderAssets(input): Promise<MediaItem[]> {
            const ids = [...new Set(input.mediaIds)];
            if (!input.siteId || ids.length > 512 || ids.some(id => typeof id !== 'string' || !id || id.length > 200)
                || !Number.isSafeInteger(input.maxFonts) || input.maxFonts < 1 || input.maxFonts > 256) {
                throw new Error('Invalid public render asset budget.');
            }
            const visible = provider === 'postgres'
                ? sql`coalesce(${media.metadata}->>'visibility', 'public') <> 'private'`
                : provider === 'mysql'
                    ? sql`coalesce(json_unquote(json_extract(${media.metadata}, '$.visibility')), 'public') <> 'private'`
                    : sql`coalesce(json_extract(${media.metadata}, '$.visibility'), 'public') <> 'private'`;
            const dependency = ids.length ? or(eq(media.type, 'font'), inArray(media.id, ids)) : eq(media.type, 'font');
            const rows = await database.select().from(media)
                .where(and(eq(media.siteId, input.siteId), visible, dependency))
                .orderBy(desc(media.id)).limit(ids.length + input.maxFonts + 1) as MediaRow[];
            const items = rows.map(toMediaItem);
            if (items.some(item => item.siteId !== input.siteId || item.visibility !== 'public'
                || (item.type !== 'font' && !ids.includes(item.id)))
                || items.filter(item => item.type === 'font').length > input.maxFonts) {
                throw new Error('Complete public render assets are unavailable.');
            }
            return items;
        },
        async withStorageMutationLock<T>(siteId: string, operation: () => Promise<T>): Promise<T> {
            return withSiteMediaMutationTransaction(db, provider, siteId, async () => operation());
        },
        async list(input: BackyMediaListInput): Promise<BackyListResult<MediaItem>> {
            const limit = normalizeLimit(input.limit), offset = normalizeOffset(input.offset);
            const conditions = [eq(media.siteId, input.siteId)];
            if (input.type && input.type !== 'all') conditions.push(provider === 'mysql'
                ? sql`binary ${media.type} = binary ${input.type}` : eq(media.type, input.type));
            if (input.folderId !== undefined) conditions.push(input.folderId === null
                ? isNull(media.folderId)
                : provider === 'postgres' ? sql`cast(${media.folderId} as text) = ${input.folderId}`
                    : provider === 'mysql' ? sql`binary cast(${media.folderId} as char) = binary ${input.folderId}`
                        : sql`cast(${media.folderId} as text) = ${input.folderId} collate binary`);
            if (input.visibility && input.visibility !== 'all') {
                // Only the exact JSON string "private" is private in toMediaItem.
                // MySQL's default case-insensitive collation must not broaden it.
                const privateValue = provider === 'postgres'
                    ? sql`${media.metadata}->>'visibility' = 'private'`
                    : provider === 'mysql'
                        ? sql`binary json_unquote(json_extract(${media.metadata}, '$.visibility')) = binary 'private'`
                        : sql`json_extract(${media.metadata}, '$.visibility') = 'private' collate binary`;
                conditions.push(sql`case when ${privateValue} then 'private' else 'public' end = ${input.visibility}`);
            }
            const where = and(...conditions);
            const [countRow] = await database.select({ total: sql<number>`count(*)` })
                .from(media).where(where) as { total: number | string }[];
            const count = Number(countRow?.total);
            if (!countRow || !['number', 'string'].includes(typeof countRow.total)
                || String(countRow.total).trim() === '' || !Number.isSafeInteger(count) || count < 0) {
                throw new Error('Media count is unavailable.');
            }
            const read = (pageLimit: number, pageOffset: number) => database.select().from(media)
                .where(where).orderBy(desc(media.updatedAt), asc(media.id))
                .limit(pageLimit).offset(pageOffset) as PromiseLike<MediaRow[]>;
            if (!input.search && !input.linkedPageId && !input.linkedPostId) {
                const rows = await read(limit, offset);
                if (rows.length !== Math.min(limit, Math.max(0, count - offset))) {
                    throw new Error('A consistent media inventory is unavailable.');
                }
                return { items: rows.map(toMediaItem),
                    pagination: { total: count, limit, offset, hasMore: offset + limit < count } };
            }
            // JS normalization of legacy tags/association lists and Unicode search
            // is not equivalent to SQL LIKE/JSON containment on all adapters.
            // Preserve it exactly, scanning bounded SQL windows after cheap filters.
            const items: MediaItem[] = [], seen = new Set<string>();
            let total = 0;
            const windowSize = 500;
            for (let scanOffset = 0; scanOffset < count; scanOffset += windowSize) {
                const rows = await read(windowSize, scanOffset);
                if (rows.length !== Math.min(windowSize, count - scanOffset)) {
                    throw new Error('A consistent media inventory is unavailable.');
                }
                for (const row of rows) {
                    if (row.siteId !== input.siteId || seen.has(row.id)) {
                        throw new Error('A consistent media inventory is unavailable.');
                    }
                    seen.add(row.id);
                    const item = toMediaItem(row);
                    if (input.search && !searchText(mediaSearchText(item), input.search)) continue;
                    if (!mediaMatchesLinkedFilters(item, input)) continue;
                    if (total >= offset && items.length < limit) items.push(item);
                    total++;
                }
            }
            return { items, pagination: { total, limit, offset, hasMore: offset + limit < total } };
        },

        async getById(siteId: string, mediaId: string): Promise<MediaItem | null> {
            const row = await firstOrNull<MediaRow>(
                database.select().from(media).where(and(eq(media.siteId, siteId), eq(media.id, mediaId))).limit(1),
            );
            return row ? toMediaItem(row) : null;
        },

        async create(input: BackyMediaCreateInput): Promise<BackyRepositoryMutationResult<MediaItem>> {
            const metadata = metadataWithPolicy(input.metadata, {
                visibility: input.visibility,
                scope: input.metadata?.scope as MediaScope | undefined,
                scopeTargetId: typeof input.metadata?.scopeTargetId === 'string' ? input.metadata.scopeTargetId : null,
            });
            const [row] = await database.insert(media).values({
                siteId: input.siteId,
                filename: input.filename,
                originalName: input.originalName,
                mimeType: input.mimeType,
                sizeBytes: input.size,
                type: input.type,
                url: input.url,
                thumbnailUrl: typeof input.metadata?.thumbnailUrl === 'string' ? input.metadata.thumbnailUrl : null,
                folderId: input.folderId || null,
                tags: toStringArray(input.metadata?.tags),
                metadata,
                altText: input.altText || null,
                caption: input.caption || null,
                uploadedBy: normalizeUuid(input.uploadedBy),
                updatedAt: new Date(),
            }).returning() as MediaRow[];
            return { item: toMediaItem(row) };
        },

        async update(siteId: string, mediaId: string, input: BackyMediaUpdateInput): Promise<BackyRepositoryMutationResult<MediaItem>> {
            const existing = await this.getById(siteId, mediaId);
            const existingMetadata = existing?.metadata || {};
            const updates: Record<string, unknown> = {
                updatedAt: new Date(),
            };
            if (input.filename !== undefined) updates.filename = input.filename;
            if (input.originalName !== undefined) updates.originalName = input.originalName;
            if (input.mimeType !== undefined) updates.mimeType = input.mimeType;
            if (input.size !== undefined) updates.sizeBytes = input.size;
            if (input.type !== undefined) updates.type = input.type;
            if (input.url !== undefined) updates.url = input.url;
            if (input.thumbnailUrl !== undefined) updates.thumbnailUrl = input.thumbnailUrl;
            if (input.folderId !== undefined) updates.folderId = input.folderId;
            if (input.altText !== undefined) updates.altText = input.altText;
            if (input.caption !== undefined) updates.caption = input.caption;
            if (input.tags !== undefined) updates.tags = input.tags;
            if (input.metadata !== undefined || input.visibility !== undefined) {
                if (provider === 'postgres') {
                    // Merge supplied fields at the row write, so an ordinary metadata update
                    // cannot replay prefetched storage paths/variants after a concurrent write.
                    const patch = { ...(input.metadata || {}), ...(input.visibility !== undefined ? { visibility: input.visibility } : {}) };
                    updates.metadata = sql`coalesce(${media.metadata}, '{}'::jsonb) || ${JSON.stringify(patch)}::jsonb`;
                } else {
                    updates.metadata = metadataWithPolicy({ ...existingMetadata, ...(input.metadata || {}) }, {
                        visibility: input.visibility,
                        scope: (input.metadata?.scope || existingMetadata.scope) as MediaScope | undefined,
                        scopeTargetId: typeof input.metadata?.scopeTargetId === 'string' ? input.metadata.scopeTargetId : typeof existingMetadata.scopeTargetId === 'string' ? existingMetadata.scopeTargetId : null,
                    });
                }
            }

            const [row] = await database.update(media).set(updates).where(and(eq(media.siteId, siteId), eq(media.id, mediaId))).returning() as MediaRow[];
            return { item: toMediaItem(row) };
        },

        async delete(siteId: string, mediaId: string): Promise<boolean> {
            await database.delete(mediaVersions).where(and(eq(mediaVersions.siteId, siteId), eq(mediaVersions.mediaId, mediaId)));
            await database.delete(media).where(and(eq(media.siteId, siteId), eq(media.id, mediaId)));
            return true;
        },

        async listVersions(input: BackyMediaVersionListInput): Promise<BackyListResult<MediaVersion>> {
            const rows = await database
                .select()
                .from(mediaVersions)
                .where(and(eq(mediaVersions.siteId, input.siteId), eq(mediaVersions.mediaId, input.mediaId)))
                .orderBy(desc(mediaVersions.replacedAt)) as MediaVersionRow[];
            return paginate(rows.map(toMediaVersion), input.limit, input.offset);
        },

        async listSiteVersions(input: BackyMediaSiteVersionListInput): Promise<BackyListResult<MediaVersion>> {
            const limit = normalizeLimit(input.limit), offset = normalizeOffset(input.offset);
            const where = eq(mediaVersions.siteId, input.siteId);
            const [totals] = await database.select({ total: sql<number>`count(*)` })
                .from(mediaVersions).where(where) as { total: number | string }[];
            const total = Number(totals?.total);
            if (!totals || !['number', 'string'].includes(typeof totals.total)
                || String(totals.total).trim() === '' || !Number.isSafeInteger(total) || total < 0) {
                throw new Error('Retained media version count is unavailable.');
            }
            const rows = await database.select().from(mediaVersions).where(where)
                .orderBy(desc(mediaVersions.replacedAt), desc(mediaVersions.id))
                .limit(limit).offset(offset) as MediaVersionRow[];
            return {
                items: rows.map(toMediaVersion),
                pagination: { total, limit, offset, hasMore: offset + limit < total },
            };
        },

        async createVersion(input: BackyMediaVersionCreateInput): Promise<BackyRepositoryMutationResult<MediaVersion>> {
            const [row] = await database.insert(mediaVersions).values({
                siteId: input.siteId,
                mediaId: input.mediaId,
                filename: input.filename,
                originalName: input.originalName,
                mimeType: input.mimeType,
                sizeBytes: input.sizeBytes,
                type: input.type,
                url: input.url,
                thumbnailUrl: input.thumbnailUrl || null,
                storagePath: input.storagePath || null,
                storageProvider: input.storageProvider || null,
                replacedAt: input.replacedAt ? new Date(input.replacedAt) : new Date(),
                replacedBy: input.replacedBy || null,
                reason: input.reason || null,
                metadata: input.metadata || {},
            }).returning() as MediaVersionRow[];
            return { item: toMediaVersion(row) };
        },

        async deleteVersion(input: BackyMediaVersionDeleteInput): Promise<boolean> {
            await database.delete(mediaVersions).where(and(
                eq(mediaVersions.siteId, input.siteId),
                eq(mediaVersions.mediaId, input.mediaId),
                eq(mediaVersions.id, input.versionId),
            ));
            return true;
        },

        async listFolders(siteId: string): Promise<MediaFolder[]> {
            const rows = await database.select().from(mediaFolders).where(eq(mediaFolders.siteId, siteId)).orderBy(mediaFolders.sortOrder, mediaFolders.name) as MediaFolderRow[];
            return rows.map(toMediaFolder);
        },

        async getFolderById(siteId: string, folderId: string): Promise<MediaFolder | null> {
            const row = await firstOrNull<MediaFolderRow>(
                database.select().from(mediaFolders).where(and(eq(mediaFolders.siteId, siteId), eq(mediaFolders.id, folderId))).limit(1),
            );
            return row ? toMediaFolder(row) : null;
        },

        async createFolder(input: BackyMediaFolderCreateInput): Promise<BackyRepositoryMutationResult<MediaFolder>> {
            const [row] = await database.insert(mediaFolders).values({
                siteId: input.siteId,
                parentId: input.parentId || null,
                name: input.name,
                sortOrder: Number.isFinite(input.sortOrder) ? input.sortOrder : 0,
            }).returning() as MediaFolderRow[];
            return { item: toMediaFolder(row) };
        },

        async updateFolder(siteId: string, folderId: string, input: BackyMediaFolderUpdateInput): Promise<BackyRepositoryMutationResult<MediaFolder>> {
            const updates: Record<string, unknown> = {};
            if (input.name !== undefined) updates.name = input.name;
            if (input.parentId !== undefined) updates.parentId = input.parentId;
            if (input.sortOrder !== undefined && Number.isFinite(input.sortOrder)) updates.sortOrder = input.sortOrder;

            const [row] = await database.update(mediaFolders).set(updates).where(and(eq(mediaFolders.siteId, siteId), eq(mediaFolders.id, folderId))).returning() as MediaFolderRow[];
            return { item: toMediaFolder(row) };
        },

        async deleteFolder(siteId: string, folderId: string): Promise<boolean> {
            await database.update(mediaFolders).set({ parentId: null }).where(and(eq(mediaFolders.siteId, siteId), eq(mediaFolders.parentId, folderId))).returning();
            await database.update(media).set({ folderId: null, updatedAt: new Date() }).where(and(eq(media.siteId, siteId), eq(media.folderId, folderId))).returning();
            await database.delete(mediaFolders).where(and(eq(mediaFolders.siteId, siteId), eq(mediaFolders.id, folderId)));
            return true;
        },
    };
}
