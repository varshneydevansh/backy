import {
    type BackyListResult,
    type BackyMediaCreateInput,
    type BackyMediaFolderCreateInput,
    type BackyMediaFolderUpdateInput,
    type BackyMediaListInput,
    type BackyMediaRepository,
    type BackyMediaUpdateInput,
    type BackyMediaVersionCreateInput,
    type BackyMediaVersionListInput,
    type BackyRepositoryMutationResult,
    type MediaFolder,
    type MediaItem,
    type MediaMetadata,
    type MediaScope,
    type MediaVersion,
    type MediaVisibility,
} from '@backy-cms/core';
import { and, desc, eq } from 'drizzle-orm';
import {
    media,
    mediaFolders,
    mediaVersions,
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

export function createMediaRepository(db: DatabaseInstance): BackyMediaRepository {
    const database = asDb(db);

    return {
        async list(input: BackyMediaListInput): Promise<BackyListResult<MediaItem>> {
            const rows = await database.select().from(media).where(eq(media.siteId, input.siteId)).orderBy(desc(media.updatedAt)) as MediaRow[];
            const filtered = rows
                .map(toMediaItem)
                .filter((item) => input.type && input.type !== 'all' ? item.type === input.type : true)
                .filter((item) => input.folderId !== undefined ? item.folderId === input.folderId : true)
                .filter((item) => input.visibility && input.visibility !== 'all' ? item.visibility === input.visibility : true)
                .filter((item) => input.search ? searchText(mediaSearchText(item), input.search) : true);
            return paginate(filtered, input.limit, input.offset);
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
                updates.metadata = metadataWithPolicy({
                    ...existingMetadata,
                    ...(input.metadata || {}),
                }, {
                    visibility: input.visibility,
                    scope: (input.metadata?.scope || existingMetadata.scope) as MediaScope | undefined,
                    scopeTargetId: typeof input.metadata?.scopeTargetId === 'string'
                        ? input.metadata.scopeTargetId
                        : typeof existingMetadata.scopeTargetId === 'string'
                            ? existingMetadata.scopeTargetId
                            : null,
                });
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

        async listFolders(siteId: string): Promise<MediaFolder[]> {
            const rows = await database.select().from(mediaFolders).where(eq(mediaFolders.siteId, siteId)).orderBy(mediaFolders.sortOrder) as MediaFolderRow[];
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
