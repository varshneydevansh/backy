import {
    type BackyBlogAuthor,
    type BackyBlogCategory,
    type BackyBlogCategoryCreateInput,
    type BackyBlogCategoryUpdateInput,
    type BackyBlogTag,
    type BackyBlogTagCreateInput,
    type BackyBlogTagUpdateInput,
    type BackyBlogTaxonomyRepository,
    type BackyRepositoryMutationResult,
} from '@backy-cms/core';
import { and, eq } from 'drizzle-orm';
import { blogCategories, blogPosts, blogTags, profiles } from '../schema';
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
    then: Promise<unknown[]>['then'];
};

type ReturningQuery = {
    returning: () => Promise<unknown[]>;
};

type CategoryRow = typeof blogCategories.$inferSelect;
type TagRow = typeof blogTags.$inferSelect;
type PostRow = typeof blogPosts.$inferSelect;
type ProfileRow = typeof profiles.$inferSelect;

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

const normalizeIdentifier = (value: string) => value.trim().toLowerCase();

const toStringArray = (value: unknown): string[] => (
    Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0) : []
);

const getPostMeta = (post: PostRow): Record<string, unknown> => (
    isRecord(post.meta) ? post.meta : {}
);

const postCategoryIds = (post: PostRow) => toStringArray(getPostMeta(post).categoryIds);

const postTagIds = (post: PostRow) => toStringArray(getPostMeta(post).tagIds);

const activeSitePosts = async (database: QueryDatabase, siteId: string): Promise<PostRow[]> => {
    const rows = await database.select().from(blogPosts).where(eq(blogPosts.siteId, siteId)) as PostRow[];
    return rows.filter((post) => post.siteId === siteId && post.status !== 'archived');
};

const postCountForCategory = (posts: PostRow[], categoryId: string) => (
    posts.filter((post) => postCategoryIds(post).includes(categoryId)).length
);

const postCountForTag = (posts: PostRow[], tagId: string) => (
    posts.filter((post) => postTagIds(post).includes(tagId)).length
);

const authorSlug = (name: string, fallback: string) => {
    const slug = (name || fallback)
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');
    return slug || fallback;
};

const toCategory = (row: CategoryRow, posts: PostRow[]): BackyBlogCategory => ({
    id: row.id,
    siteId: row.siteId,
    name: row.name,
    slug: row.slug,
    description: row.description,
    color: row.color || null,
    sortOrder: row.sortOrder,
    createdAt: toIso(row.createdAt),
    updatedAt: toIso(row.updatedAt || row.createdAt),
    postCount: postCountForCategory(posts, row.id),
});

const toTag = (row: TagRow, posts: PostRow[]): BackyBlogTag => ({
    id: row.id,
    siteId: row.siteId,
    name: row.name,
    slug: row.slug,
    description: row.description || null,
    createdAt: toIso(row.createdAt),
    updatedAt: toIso(row.updatedAt || row.createdAt),
    postCount: postCountForTag(posts, row.id),
});

export function createBlogTaxonomyRepository(db: DatabaseInstance): BackyBlogTaxonomyRepository {
    const database = asDb(db);

    return {
        async listCategories(siteId: string): Promise<BackyBlogCategory[]> {
            const [rows, posts] = await Promise.all([
                database.select().from(blogCategories).where(eq(blogCategories.siteId, siteId)) as PromiseLike<CategoryRow[]>,
                activeSitePosts(database, siteId),
            ]);
            return rows
                .filter((category) => category.siteId === siteId)
                .map((category) => toCategory(category, posts))
                .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name));
        },

        async getCategoryByIdOrSlug(siteId: string, identifier: string): Promise<BackyBlogCategory | null> {
            const normalized = normalizeIdentifier(identifier);
            return (await this.listCategories(siteId)).find((category) => (
                normalizeIdentifier(category.id) === normalized || normalizeIdentifier(category.slug) === normalized
            )) || null;
        },

        async createCategory(input: BackyBlogCategoryCreateInput): Promise<BackyRepositoryMutationResult<BackyBlogCategory>> {
            const [row] = await database.insert(blogCategories).values({
                siteId: input.siteId,
                name: input.name,
                slug: input.slug,
                description: input.description || null,
                color: input.color || null,
                sortOrder: input.sortOrder || 0,
                updatedAt: new Date(),
            }).returning() as CategoryRow[];
            return { item: toCategory(row, await activeSitePosts(database, input.siteId)) };
        },

        async updateCategory(siteId: string, categoryId: string, input: BackyBlogCategoryUpdateInput): Promise<BackyRepositoryMutationResult<BackyBlogCategory>> {
            const updates: Record<string, unknown> = {};
            if (input.name !== undefined) updates.name = input.name;
            if (input.slug !== undefined) updates.slug = input.slug;
            if (input.description !== undefined) updates.description = input.description;
            if (input.color !== undefined) updates.color = input.color;
            if (input.sortOrder !== undefined) updates.sortOrder = input.sortOrder;
            updates.updatedAt = new Date();
            const [row] = await database.update(blogCategories).set(updates).where(and(eq(blogCategories.siteId, siteId), eq(blogCategories.id, categoryId))).returning() as CategoryRow[];
            return { item: toCategory(row, await activeSitePosts(database, siteId)) };
        },

        async deleteCategory(siteId: string, categoryId: string): Promise<boolean> {
            const category = await this.getCategoryByIdOrSlug(siteId, categoryId);
            if (!category) {
                return false;
            }
            await database.delete(blogCategories).where(and(eq(blogCategories.siteId, siteId), eq(blogCategories.id, category.id)));
            return true;
        },

        async listTags(siteId: string): Promise<BackyBlogTag[]> {
            const [rows, posts] = await Promise.all([
                database.select().from(blogTags).where(eq(blogTags.siteId, siteId)) as PromiseLike<TagRow[]>,
                activeSitePosts(database, siteId),
            ]);
            return rows
                .filter((tag) => tag.siteId === siteId)
                .map((tag) => toTag(tag, posts))
                .sort((a, b) => a.name.localeCompare(b.name));
        },

        async getTagByIdOrSlug(siteId: string, identifier: string): Promise<BackyBlogTag | null> {
            const normalized = normalizeIdentifier(identifier);
            return (await this.listTags(siteId)).find((tag) => (
                normalizeIdentifier(tag.id) === normalized || normalizeIdentifier(tag.slug) === normalized
            )) || null;
        },

        async createTag(input: BackyBlogTagCreateInput): Promise<BackyRepositoryMutationResult<BackyBlogTag>> {
            const [row] = await database.insert(blogTags).values({
                siteId: input.siteId,
                name: input.name,
                slug: input.slug,
                description: input.description || null,
                updatedAt: new Date(),
            }).returning() as TagRow[];
            return { item: toTag(row, await activeSitePosts(database, input.siteId)) };
        },

        async updateTag(siteId: string, tagId: string, input: BackyBlogTagUpdateInput): Promise<BackyRepositoryMutationResult<BackyBlogTag>> {
            const updates: Record<string, unknown> = {};
            if (input.name !== undefined) updates.name = input.name;
            if (input.slug !== undefined) updates.slug = input.slug;
            if (input.description !== undefined) updates.description = input.description;
            updates.updatedAt = new Date();
            const [row] = await database.update(blogTags).set(updates).where(and(eq(blogTags.siteId, siteId), eq(blogTags.id, tagId))).returning() as TagRow[];
            return { item: toTag(row, await activeSitePosts(database, siteId)) };
        },

        async deleteTag(siteId: string, tagId: string): Promise<boolean> {
            const tag = await this.getTagByIdOrSlug(siteId, tagId);
            if (!tag) {
                return false;
            }
            await database.delete(blogTags).where(and(eq(blogTags.siteId, siteId), eq(blogTags.id, tag.id)));
            return true;
        },

        async listAuthors(siteId: string): Promise<BackyBlogAuthor[]> {
            const posts = await activeSitePosts(database, siteId);
            const assignedAuthorIds = new Set(posts.map((post) => post.authorId).filter((id): id is string => typeof id === 'string' && id.length > 0));
            const profileRows = await database.select().from(profiles) as ProfileRow[];
            const users = profileRows.filter((profile) => (
                profile.role === 'admin' || profile.role === 'editor' || assignedAuthorIds.has(profile.id)
            ));
            const userAuthors: BackyBlogAuthor[] = users.map((user) => {
                const name = user.fullName || user.email || user.id;
                return {
                id: user.id,
                siteId,
                name,
                slug: authorSlug(name, user.id),
                role: user.role,
                status: user.status || (user.isActive ? 'active' : 'inactive'),
                avatarUrl: user.avatarUrl,
                postCount: posts.filter((post) => post.authorId === user.id).length,
                };
            });
            const knownUserIds = new Set(userAuthors.map((author) => author.id));
            const externalAuthors = [...assignedAuthorIds]
                .filter((authorId) => !knownUserIds.has(authorId))
                .map<BackyBlogAuthor>((authorId) => ({
                    id: authorId,
                    siteId,
                    name: authorId,
                    slug: authorSlug(authorId, authorId),
                    role: 'contributor',
                    status: 'external',
                    avatarUrl: null,
                    postCount: posts.filter((post) => post.authorId === authorId).length,
                }));

            return [...userAuthors, ...externalAuthors].sort((a, b) => a.name.localeCompare(b.name));
        },
    };
}
