import {
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
import { reusableSections } from '../schema';
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
    sourceElementId: row.sourceElementId,
    createdBy: row.createdBy,
    updatedBy: row.updatedBy,
    createdAt: toIso(row.createdAt),
    updatedAt: toIso(row.updatedAt),
});

export function createReusableSectionRepository(db: DatabaseInstance): BackyReusableSectionRepository {
    const database = asDb(db);

    return {
        async list(input: BackyReusableSectionListInput): Promise<BackyListResult<BackyReusableSection>> {
            const rows = await database.select().from(reusableSections).where(eq(reusableSections.siteId, input.siteId)).orderBy(desc(reusableSections.updatedAt)) as ReusableSectionRow[];
            const category = input.category?.trim().toLowerCase();
            const tag = input.tag?.trim().toLowerCase();
            const filtered = rows
                .map(toReusableSection)
                .filter((section) => input.status && input.status !== 'all' ? section.status === input.status : section.status === 'active')
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
            const [row] = await database.insert(reusableSections).values({
                siteId: input.siteId,
                name: input.name,
                slug: input.slug,
                description: input.description || null,
                category: input.category || 'general',
                status: input.status || 'active',
                tags: input.tags || [],
                content: input.content,
                sourceElementId: input.sourceElementId || null,
                createdBy: input.createdBy || null,
                updatedBy: input.updatedBy || input.createdBy || null,
                updatedAt: new Date(),
            }).returning() as ReusableSectionRow[];
            return { item: toReusableSection(row) };
        },

        async update(siteId: string, sectionId: string, input: BackyReusableSectionUpdateInput): Promise<BackyRepositoryMutationResult<BackyReusableSection>> {
            const updates: Record<string, unknown> = { updatedAt: new Date() };
            if (input.name !== undefined) updates.name = input.name;
            if (input.slug !== undefined) updates.slug = input.slug;
            if (input.description !== undefined) updates.description = input.description;
            if (input.category !== undefined) updates.category = input.category;
            if (input.status !== undefined) updates.status = input.status;
            if (input.tags !== undefined) updates.tags = input.tags;
            if (input.content !== undefined) updates.content = input.content;
            if (input.sourceElementId !== undefined) updates.sourceElementId = input.sourceElementId;
            if (input.updatedBy !== undefined) updates.updatedBy = input.updatedBy;

            const [row] = await database.update(reusableSections).set(updates).where(and(eq(reusableSections.siteId, siteId), eq(reusableSections.id, sectionId))).returning() as ReusableSectionRow[];
            return { item: toReusableSection(row) };
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
