import {
    DEFAULT_SITE_SETTINGS,
    DEFAULT_THEME,
    canvasElementsToBackyContentDocument,
    isBackyContentDocument,
    type BackyContentDocument,
    type BackyListResult,
    type BackyPage,
    type BackyPageCreateInput,
    type BackyPageListInput,
    type BackyPageRepository,
    type BackyPageUpdateInput,
    type BackyPost,
    type BackyPostCreateInput,
    type BackyPostListInput,
    type BackyPostRepository,
    type BackyPostUpdateInput,
    type BackyRepositoryMutationResult,
    type BackySiteCreateInput,
    type BackySiteListInput,
    type BackySiteRepository,
    type BackySiteUpdateInput,
    type BackySlugAvailabilityResult,
    type PageMeta,
    type PublishStatus,
    type Site,
    type SiteSettings,
    type ThemeConfig,
} from '@backy-cms/core';
import { and, desc, eq, ne } from 'drizzle-orm';
import {
    blogPosts,
    comments,
    pages,
    sites,
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

type SiteRow = typeof sites.$inferSelect;
type PageRow = typeof pages.$inferSelect;
type BlogPostRow = typeof blogPosts.$inferSelect;

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

const toNullableIso = (value: Date | string | null | undefined): string | null => {
    if (!value) {
        return null;
    }
    return toIso(value);
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

const publishedAtForStatus = (status: PublishStatus, existing?: string | null): Date | null => {
    if (status !== 'published') {
        return existing ? new Date(existing) : null;
    }
    return existing ? new Date(existing) : new Date();
};

const normalizeTheme = (value: unknown): ThemeConfig => ({
    ...DEFAULT_THEME,
    ...(isRecord(value) ? value : {}),
    colors: {
        ...DEFAULT_THEME.colors,
        ...(isRecord(value) && isRecord(value.colors) ? value.colors : {}),
    },
    fonts: {
        ...DEFAULT_THEME.fonts,
        ...(isRecord(value) && isRecord(value.fonts) ? value.fonts : {}),
    },
    spacing: {
        ...DEFAULT_THEME.spacing,
        ...(isRecord(value) && isRecord(value.spacing) ? value.spacing : {}),
    },
    customCSS: isRecord(value) && typeof value.customCSS === 'string' ? value.customCSS : DEFAULT_THEME.customCSS,
});

const normalizeSiteRedirectRules = (value: unknown): SiteSettings['redirectRules'] => (
    Array.isArray(value)
        ? value.filter(isRecord).map((rule) => ({
            id: typeof rule.id === 'string' && rule.id.length > 0 ? rule.id : undefined,
            from: typeof rule.from === 'string' ? rule.from : '/',
            to: typeof rule.to === 'string' ? rule.to : undefined,
            statusCode: rule.statusCode === 301
                || rule.statusCode === 302
                || rule.statusCode === 307
                || rule.statusCode === 308
                || rule.statusCode === 410
                ? rule.statusCode
                : undefined,
            enabled: typeof rule.enabled === 'boolean' ? rule.enabled : undefined,
        }))
        : []
);

const normalizeNavigationItems = (value: unknown): SiteSettings['navigation']['primary'] => (
    Array.isArray(value)
        ? value.filter(isRecord).map((item) => {
            const type: SiteSettings['navigation']['primary'][number]['type'] = item.type === 'page' || item.type === 'route' || item.type === 'url' ? item.type : 'route';
            const target: SiteSettings['navigation']['primary'][number]['target'] = item.target === '_blank' ? '_blank' : '_self';
            return {
                id: typeof item.id === 'string' && item.id.length > 0 ? item.id : undefined,
                type,
                label: typeof item.label === 'string' ? item.label : '',
                pageId: typeof item.pageId === 'string' ? item.pageId : undefined,
                path: typeof item.path === 'string' ? item.path : undefined,
                href: typeof item.href === 'string' ? item.href : undefined,
                target,
                visible: typeof item.visible === 'boolean' ? item.visible : undefined,
                children: normalizeNavigationItems(item.children),
            };
        }).filter((item) => item.label.length > 0 || item.type === 'page')
        : []
);

const normalizeNavigation = (value: unknown): SiteSettings['navigation'] => (
    isRecord(value)
        ? {
            primary: normalizeNavigationItems(value.primary),
            footer: normalizeNavigationItems(value.footer),
        }
        : { primary: [], footer: [] }
);

const normalizeFrontendDesign = (value: unknown): SiteSettings['frontendDesign'] => {
    if (isRecord(value)) {
        return value as unknown as SiteSettings['frontendDesign'];
    }

    return {
        ...DEFAULT_SITE_SETTINGS.frontendDesign,
        source: { ...DEFAULT_SITE_SETTINGS.frontendDesign.source },
        tokens: { ...DEFAULT_SITE_SETTINGS.frontendDesign.tokens },
        chrome: { ...DEFAULT_SITE_SETTINGS.frontendDesign.chrome },
        templates: [],
        editableMap: [],
    };
};

const normalizeSocialSettings = (value: unknown): SiteSettings['social'] => {
    const source = isRecord(value) ? value : {};
    const social: SiteSettings['social'] = {};
    for (const [key, socialValue] of Object.entries(source)) {
        if (typeof socialValue === 'string') {
            social[key] = socialValue;
        }
    }
    return social;
};

const normalizeSettings = (value: unknown): SiteSettings => {
    const defaultSettings = DEFAULT_SITE_SETTINGS as unknown as SiteSettings;

    return {
        ...defaultSettings,
        ...(isRecord(value) ? value : {}),
        seo: {
            ...defaultSettings.seo,
            ...(isRecord(value) && isRecord(value.seo) ? value.seo : {}),
        },
        analytics: {
            ...defaultSettings.analytics,
            ...(isRecord(value) && isRecord(value.analytics) ? value.analytics : {}),
        },
        social: {
            ...defaultSettings.social,
            ...(isRecord(value) ? normalizeSocialSettings(value.social) : {}),
        },
        redirectRules: normalizeSiteRedirectRules(isRecord(value) ? value.redirectRules : undefined),
        navigation: normalizeNavigation(isRecord(value) ? value.navigation : undefined),
        frontendDesign: normalizeFrontendDesign(isRecord(value) ? value.frontendDesign : undefined),
        contacts: isRecord(value) && isRecord(value.contacts)
            ? {
                ...value.contacts,
                savedLists: Array.isArray(value.contacts.savedLists)
                    ? value.contacts.savedLists as NonNullable<SiteSettings['contacts']>['savedLists']
                    : [],
            }
            : { savedLists: [] },
    };
};

const normalizeMeta = (value: unknown): PageMeta => (
    isRecord(value) ? value as PageMeta : {}
);

const toStringArray = (value: unknown): string[] => (
    Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0) : []
);

const taxonomyMeta = (meta: unknown, categoryIds?: string[], tagIds?: string[]): PageMeta => {
    const next = { ...normalizeMeta(meta) } as PageMeta & Record<string, unknown>;
    if (categoryIds !== undefined) {
        next.categoryIds = categoryIds;
    }
    if (tagIds !== undefined) {
        next.tagIds = tagIds;
    }
    return next;
};

const taxonomyArrayFromMeta = (meta: unknown, key: 'categoryIds' | 'tagIds'): string[] => (
    toStringArray((normalizeMeta(meta) as PageMeta & Record<string, unknown>)[key])
);

const postArchiveMatches = (post: BackyPost, year?: number, month?: number): boolean => {
    if (!year && !month) return true;

    const source = post.publishedAt || post.scheduledAt || post.updatedAt || post.createdAt;
    const date = source ? new Date(source) : null;
    if (!date || Number.isNaN(date.getTime())) return false;

    if (year && date.getUTCFullYear() !== year) return false;
    if (month && date.getUTCMonth() + 1 !== month) return false;
    return true;
};

const normalizeContentDocument = (
    rawContent: unknown,
    input: {
        id: string;
        kind: 'page' | 'post';
        title: string;
        slug: string;
        status: PublishStatus;
        version: string;
    },
): BackyContentDocument => {
    if (isBackyContentDocument(rawContent)) {
        return rawContent;
    }

    if (isRecord(rawContent) && isBackyContentDocument(rawContent.contentDocument)) {
        return rawContent.contentDocument;
    }

    return canvasElementsToBackyContentDocument({
        id: input.id,
        kind: input.kind,
        title: input.title,
        slug: input.slug,
        status: input.status,
        version: input.version,
        elements: isRecord(rawContent) ? rawContent : [],
        canvasSize: isRecord(rawContent) ? rawContent.canvasSize : undefined,
        customCSS: isRecord(rawContent) && typeof rawContent.customCSS === 'string' ? rawContent.customCSS : undefined,
    });
};

const toSite = (row: SiteRow): Site => ({
    id: row.id,
    teamId: row.teamId,
    name: row.name,
    slug: row.slug,
    description: row.description,
    customDomain: row.customDomain,
    domainStatus: row.domainStatus || 'pending',
    sslEnabled: Boolean(row.sslEnabled),
    theme: normalizeTheme(row.theme),
    settings: normalizeSettings(row.settings),
    isPublished: row.isPublished,
    publishedAt: toNullableIso(row.publishedAt),
    createdAt: toIso(row.createdAt),
    updatedAt: toIso(row.updatedAt),
});

const toPage = (row: PageRow): BackyPage => ({
    id: row.id,
    siteId: row.siteId,
    title: row.title,
    slug: row.slug,
    description: row.description,
    content: normalizeContentDocument(row.content, {
        id: row.id,
        kind: 'page',
        title: row.title,
        slug: row.slug,
        status: row.status,
        version: toIso(row.updatedAt),
    }),
    meta: normalizeMeta(row.meta),
    status: row.status,
    publishedAt: toNullableIso(row.publishedAt),
    scheduledAt: toNullableIso(row.scheduledAt),
    isHomepage: row.isHomepage,
    parentId: row.parentId,
    sortOrder: row.sortOrder,
    createdBy: row.createdBy,
    updatedBy: row.updatedBy,
    createdAt: toIso(row.createdAt),
    updatedAt: toIso(row.updatedAt),
});

const toPost = (row: BlogPostRow): BackyPost => ({
    id: row.id,
    siteId: row.siteId,
    title: row.title,
    slug: row.slug,
    excerpt: row.excerpt,
    content: normalizeContentDocument(row.content, {
        id: row.id,
        kind: 'post',
        title: row.title,
        slug: row.slug,
        status: row.status,
        version: toIso(row.updatedAt),
    }),
    contentFormat: 'editor',
    featuredImageId: row.featuredImageId,
    categoryIds: taxonomyArrayFromMeta(row.meta, 'categoryIds'),
    tagIds: taxonomyArrayFromMeta(row.meta, 'tagIds'),
    authorId: row.authorId,
    status: row.status,
    publishedAt: toNullableIso(row.publishedAt),
    scheduledAt: toNullableIso(row.scheduledAt),
    meta: normalizeMeta(row.meta),
    viewCount: row.viewCount,
    createdAt: toIso(row.createdAt),
    updatedAt: toIso(row.updatedAt),
});

const firstOrNull = async <TRow>(query: PromiseLike<unknown[]>): Promise<TRow | null> => {
    const rows = await query;
    return (rows[0] || null) as TRow | null;
};

const searchText = (value: string | null | undefined, search: string): boolean => (
    (value || '').toLowerCase().includes(search.toLowerCase())
);

const normalizeSiteStatus = (site: Site): PublishStatus => {
    const rawStatus = (site.settings as SiteSettings & { siteStatus?: unknown }).siteStatus;
    if (rawStatus === 'published' || rawStatus === 'draft' || rawStatus === 'archived') {
        return rawStatus;
    }
    return site.isPublished ? 'published' : 'draft';
};

const siteMatchesStatus = (site: Site, status?: PublishStatus | 'all'): boolean => {
    if (!status || status === 'all') return true;
    return normalizeSiteStatus(site) === status;
};

const contentPayload = (content: BackyContentDocument): Record<string, unknown> => ({
    contentDocument: content,
    elements: content.elements,
});

export function createSiteRepository(db: DatabaseInstance): BackySiteRepository {
    const database = asDb(db);

    return {
        async list(input: BackySiteListInput): Promise<BackyListResult<Site>> {
            const rows = await database.select().from(sites).orderBy(desc(sites.createdAt)) as SiteRow[];
            const filtered = rows
                .map(toSite)
                .filter((site) => (input.teamId ? site.teamId === input.teamId : true))
                .filter((site) => siteMatchesStatus(site, input.status))
                .filter((site) => input.search ? searchText(`${site.name} ${site.slug} ${site.description || ''}`, input.search) : true);
            return paginate(filtered, input.limit, input.offset);
        },

        async getById(siteId: string): Promise<Site | null> {
            const row = await firstOrNull<SiteRow>(
                database.select().from(sites).where(eq(sites.id, siteId)).limit(1),
            );
            return row ? toSite(row) : null;
        },

        async getBySlug(slug: string): Promise<Site | null> {
            const row = await firstOrNull<SiteRow>(
                database.select().from(sites).where(eq(sites.slug, slug)).limit(1),
            );
            return row ? toSite(row) : null;
        },

        async checkSlug(input: { slug: string; teamId?: string; excludeSiteId?: string }): Promise<BackySlugAvailabilityResult> {
            const conditions = [eq(sites.slug, input.slug)];
            if (input.teamId) conditions.push(eq(sites.teamId, input.teamId));
            if (input.excludeSiteId) conditions.push(ne(sites.id, input.excludeSiteId));
            const row = await firstOrNull<SiteRow>(
                database.select().from(sites).where(and(...conditions)).limit(1),
            );
            return {
                available: !row,
                normalizedSlug: input.slug,
                conflictingId: row?.id,
            };
        },

        async create(input: BackySiteCreateInput): Promise<BackyRepositoryMutationResult<Site>> {
            const status = input.status || 'draft';
            const [row] = await database.insert(sites).values({
                teamId: input.teamId,
                name: input.name,
                slug: input.slug,
                description: input.description || null,
                customDomain: input.customDomain || null,
                theme: normalizeTheme(input.theme),
                settings: normalizeSettings(input.settings),
                isPublished: status === 'published',
                publishedAt: publishedAtForStatus(status),
                updatedAt: new Date(),
            }).returning() as SiteRow[];
            return { item: toSite(row) };
        },

        async update(siteId: string, input: BackySiteUpdateInput): Promise<BackyRepositoryMutationResult<Site>> {
            const updates: Record<string, unknown> = {
                updatedAt: new Date(),
            };
            if (input.name !== undefined) updates.name = input.name;
            if (input.slug !== undefined) updates.slug = input.slug;
            if (input.description !== undefined) updates.description = input.description;
            if (input.customDomain !== undefined) updates.customDomain = input.customDomain;
            if (input.theme !== undefined) updates.theme = normalizeTheme(input.theme);
            if (input.settings !== undefined) updates.settings = normalizeSettings(input.settings);
            if (input.isPublished !== undefined) updates.isPublished = input.isPublished;
            if (input.status !== undefined) updates.isPublished = input.status === 'published';
            if (input.publishedAt !== undefined) updates.publishedAt = input.publishedAt ? new Date(input.publishedAt) : null;

            const [row] = await database.update(sites).set(updates).where(eq(sites.id, siteId)).returning() as SiteRow[];
            return { item: toSite(row) };
        },

        async delete(siteId: string): Promise<boolean> {
            await database.delete(sites).where(eq(sites.id, siteId));
            return true;
        },
    };
}

export function createPageRepository(db: DatabaseInstance): BackyPageRepository {
    const database = asDb(db);

    return {
        async list(input: BackyPageListInput): Promise<BackyListResult<BackyPage>> {
            const rows = await database.select().from(pages).where(eq(pages.siteId, input.siteId)).orderBy(desc(pages.updatedAt)) as PageRow[];
            const filtered = rows
                .map(toPage)
                .filter((page) => input.includeUnpublished || input.status === 'all' || page.status === 'published')
                .filter((page) => input.status && input.status !== 'all' ? page.status === input.status : true)
                .filter((page) => input.parentId === undefined ? true : page.parentId === input.parentId)
                .filter((page) => input.search ? searchText(`${page.title} ${page.slug} ${page.description || ''}`, input.search) : true);
            return paginate(filtered, input.limit, input.offset);
        },

        async getById(siteId: string, pageId: string): Promise<BackyPage | null> {
            const row = await firstOrNull<PageRow>(
                database.select().from(pages).where(and(eq(pages.siteId, siteId), eq(pages.id, pageId))).limit(1),
            );
            return row ? toPage(row) : null;
        },

        async getBySlug(siteId: string, slug: string): Promise<BackyPage | null> {
            const row = await firstOrNull<PageRow>(
                database.select().from(pages).where(and(eq(pages.siteId, siteId), eq(pages.slug, slug))).limit(1),
            );
            return row ? toPage(row) : null;
        },

        async checkSlug(input: { siteId: string; slug: string; excludePageId?: string }): Promise<BackySlugAvailabilityResult> {
            const conditions = [eq(pages.siteId, input.siteId), eq(pages.slug, input.slug)];
            if (input.excludePageId) conditions.push(ne(pages.id, input.excludePageId));
            const row = await firstOrNull<PageRow>(
                database.select().from(pages).where(and(...conditions)).limit(1),
            );
            return {
                available: !row,
                normalizedSlug: input.slug,
                conflictingId: row?.id,
            };
        },

        async create(input: BackyPageCreateInput): Promise<BackyRepositoryMutationResult<BackyPage>> {
            const status = input.status || 'draft';
            const [row] = await database.insert(pages).values({
                siteId: input.siteId,
                title: input.title,
                slug: input.slug,
                description: input.description || null,
                content: contentPayload(input.content),
                meta: input.meta || {},
                status,
                scheduledAt: input.scheduledAt ? new Date(input.scheduledAt) : null,
                publishedAt: publishedAtForStatus(status),
                isHomepage: input.isHomepage || false,
                parentId: input.parentId || null,
                sortOrder: input.sortOrder || 0,
                updatedAt: new Date(),
            }).returning() as PageRow[];
            return { item: toPage(row) };
        },

        async update(siteId: string, pageId: string, input: BackyPageUpdateInput): Promise<BackyRepositoryMutationResult<BackyPage>> {
            const updates: Record<string, unknown> = {
                updatedAt: new Date(),
            };
            if (input.title !== undefined) updates.title = input.title;
            if (input.slug !== undefined) updates.slug = input.slug;
            if (input.description !== undefined) updates.description = input.description;
            if (input.content !== undefined) updates.content = contentPayload(input.content);
            if (input.meta !== undefined) updates.meta = input.meta;
            if (input.status !== undefined) {
                updates.status = input.status;
                updates.publishedAt = publishedAtForStatus(input.status);
            }
            if (input.scheduledAt !== undefined) updates.scheduledAt = input.scheduledAt ? new Date(input.scheduledAt) : null;
            if (input.isHomepage !== undefined) updates.isHomepage = input.isHomepage;
            if (input.parentId !== undefined) updates.parentId = input.parentId;
            if (input.sortOrder !== undefined) updates.sortOrder = input.sortOrder;

            const [row] = await database.update(pages).set(updates).where(and(eq(pages.siteId, siteId), eq(pages.id, pageId))).returning() as PageRow[];
            return { item: toPage(row) };
        },

        async publish(siteId: string, pageId: string): Promise<BackyRepositoryMutationResult<BackyPage>> {
            return this.update(siteId, pageId, { status: 'published' });
        },

        async archive(siteId: string, pageId: string): Promise<BackyRepositoryMutationResult<BackyPage>> {
            return this.update(siteId, pageId, { status: 'archived' });
        },

        async delete(siteId: string, pageId: string): Promise<boolean> {
            await database.delete(comments).where(and(
                eq(comments.siteId, siteId),
                eq(comments.targetType, 'page'),
                eq(comments.targetId, pageId),
            ));
            await database.delete(pages).where(and(eq(pages.siteId, siteId), eq(pages.id, pageId)));
            return true;
        },
    };
}

export function createPostRepository(db: DatabaseInstance): BackyPostRepository {
    const database = asDb(db);

    return {
        async list(input: BackyPostListInput): Promise<BackyListResult<BackyPost>> {
            const rows = await database.select().from(blogPosts).where(eq(blogPosts.siteId, input.siteId)).orderBy(desc(blogPosts.updatedAt)) as BlogPostRow[];
            const filtered = rows
                .map(toPost)
                .filter((post) => input.includeUnpublished || input.status === 'all' || post.status === 'published')
                .filter((post) => input.status && input.status !== 'all' ? post.status === input.status : true)
                .filter((post) => input.authorId ? post.authorId === input.authorId : true)
                .filter((post) => input.categoryId ? post.categoryIds.includes(input.categoryId) : true)
                .filter((post) => input.tagId ? post.tagIds.includes(input.tagId) : true)
                .filter((post) => input.search ? searchText(`${post.title} ${post.slug} ${post.excerpt || ''}`, input.search) : true)
                .filter((post) => postArchiveMatches(post, input.year, input.month));
            return paginate(filtered, input.limit, input.offset);
        },

        async getById(siteId: string, postId: string): Promise<BackyPost | null> {
            const row = await firstOrNull<BlogPostRow>(
                database.select().from(blogPosts).where(and(eq(blogPosts.siteId, siteId), eq(blogPosts.id, postId))).limit(1),
            );
            return row ? toPost(row) : null;
        },

        async getBySlug(siteId: string, slug: string): Promise<BackyPost | null> {
            const row = await firstOrNull<BlogPostRow>(
                database.select().from(blogPosts).where(and(eq(blogPosts.siteId, siteId), eq(blogPosts.slug, slug))).limit(1),
            );
            return row ? toPost(row) : null;
        },

        async checkSlug(input: { siteId: string; slug: string; excludePostId?: string }): Promise<BackySlugAvailabilityResult> {
            const conditions = [eq(blogPosts.siteId, input.siteId), eq(blogPosts.slug, input.slug)];
            if (input.excludePostId) conditions.push(ne(blogPosts.id, input.excludePostId));
            const row = await firstOrNull<BlogPostRow>(
                database.select().from(blogPosts).where(and(...conditions)).limit(1),
            );
            return {
                available: !row,
                normalizedSlug: input.slug,
                conflictingId: row?.id,
            };
        },

        async create(input: BackyPostCreateInput): Promise<BackyRepositoryMutationResult<BackyPost>> {
            const status = input.status || 'draft';
            const [row] = await database.insert(blogPosts).values({
                siteId: input.siteId,
                title: input.title,
                slug: input.slug,
                excerpt: input.excerpt || null,
                content: contentPayload(input.content),
                contentFormat: 'editor',
                featuredImageId: input.featuredImageId || null,
                authorId: input.authorId || null,
                status,
                scheduledAt: input.scheduledAt ? new Date(input.scheduledAt) : null,
                publishedAt: publishedAtForStatus(status),
                meta: taxonomyMeta(input.meta || {}, input.categoryIds || [], input.tagIds || []),
                updatedAt: new Date(),
            }).returning() as BlogPostRow[];
            return { item: toPost(row) };
        },

        async update(siteId: string, postId: string, input: BackyPostUpdateInput): Promise<BackyRepositoryMutationResult<BackyPost>> {
            const updates: Record<string, unknown> = {
                updatedAt: new Date(),
            };
            if (input.title !== undefined) updates.title = input.title;
            if (input.slug !== undefined) updates.slug = input.slug;
            if (input.excerpt !== undefined) updates.excerpt = input.excerpt;
            if (input.content !== undefined) updates.content = contentPayload(input.content);
            if (input.featuredImageId !== undefined) updates.featuredImageId = input.featuredImageId;
            if (input.authorId !== undefined) updates.authorId = input.authorId;
            if (input.meta !== undefined || input.categoryIds !== undefined || input.tagIds !== undefined) {
                const current = await this.getById(siteId, postId);
                updates.meta = taxonomyMeta(
                    input.meta !== undefined ? input.meta : current?.meta || {},
                    input.categoryIds,
                    input.tagIds,
                );
            }
            if (input.status !== undefined) {
                updates.status = input.status;
                updates.publishedAt = publishedAtForStatus(input.status);
            }
            if (input.scheduledAt !== undefined) updates.scheduledAt = input.scheduledAt ? new Date(input.scheduledAt) : null;

            const [row] = await database.update(blogPosts).set(updates).where(and(eq(blogPosts.siteId, siteId), eq(blogPosts.id, postId))).returning() as BlogPostRow[];
            return { item: toPost(row) };
        },

        async publish(siteId: string, postId: string): Promise<BackyRepositoryMutationResult<BackyPost>> {
            return this.update(siteId, postId, { status: 'published' });
        },

        async archive(siteId: string, postId: string): Promise<BackyRepositoryMutationResult<BackyPost>> {
            return this.update(siteId, postId, { status: 'archived' });
        },

        async delete(siteId: string, postId: string): Promise<boolean> {
            await database.delete(comments).where(and(
                eq(comments.siteId, siteId),
                eq(comments.targetType, 'post'),
                eq(comments.targetId, postId),
            ));
            await database.delete(blogPosts).where(and(eq(blogPosts.siteId, siteId), eq(blogPosts.id, postId)));
            return true;
        },
    };
}
