import {
    assertBackyContentUpdateExpectation,
    BackyContentConflictError,
    DEFAULT_SITE_SETTINGS,
    DEFAULT_THEME,
    canvasContentPayloadToBackyContentDocument,
    isBackyContentDocument,
    type BackyContentDocument,
    type BackyListResult,
    type BackyPage,
    type BackyPageSummary,
    type BackyPageCanvasSource,
    type BackyPageRouteMetadata,
    type BackySiteRouteMetadata,
    type BackyPageSearchMetadata,
    type BackyPageLinkMetadata,
    type BackyPostSearchMetadata,
    type BackySearchMetadataListInput,
    type BackySearchSeoMeta,
    type BackyPageCreateInput,
    type BackyPageListInput,
    type BackyPageRepository,
    type BackyPageUpdateInput,
    type BackyPost,
    type BackyPostArchiveMetadata,
    type BackyPostCreateInput,
    type BackyPostListInput,
    type BackyPostRepository,
    type BackyPostUpdateInput,
    type BackyRepositoryMutationResult,
    type BackySiteCreateInput,
    type BackySiteSearchMetadata,
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
import { SiteCreationAdmissionError } from '@backy-cms/core';
import { withSiteCreationAdmission } from './site-creation-admission';
import { and, desc, eq, ne, sql, type SQLWrapper } from 'drizzle-orm';
import {
    blogPosts,
    comments,
    pages,
    sites,
} from '../schema';
import type { DatabaseInstance } from '../adapters';
import { createContentWorkflowRepository } from './content-workflows';

type QueryDatabase = {
    transaction: <T>(run: (transaction: QueryDatabase) => Promise<T>) => Promise<T>;
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
        where: (condition: unknown) => Promise<unknown> & ReturningQuery;
    };
};

type QueryBuilder = {
    for: (mode: 'update') => QueryBuilder;
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

const isUuidIdentifier = (value: string): boolean => (
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
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

const normalizeDomainHost = (value: unknown): string => (
    typeof value === 'string'
        ? value.trim().toLowerCase().replace(/^https?:\/\//, '').split('/')[0]?.replace(/\/+$/, '') || ''
        : ''
);

const normalizeDomainAliases = (value: unknown): NonNullable<SiteSettings['domainAliases']> => {
    if (!Array.isArray(value)) return [];
    type DomainAliasSettings = NonNullable<SiteSettings['domainAliases']>[number];
    const seen = new Set<string>();

    return value.filter(isRecord).flatMap((alias): DomainAliasSettings[] => {
        const host = normalizeDomainHost(alias.host);
        if (!host || seen.has(host)) return [];
        seen.add(host);
        const status = alias.status === 'not_started'
            || alias.status === 'pending'
            || alias.status === 'verified'
            || alias.status === 'failed'
            ? alias.status
            : 'pending';
        return [{
            id: typeof alias.id === 'string' && alias.id.length > 0
                ? alias.id
                : `domain-alias-${host.replace(/[^a-z0-9]+/g, '-')}`,
            host,
            kind: alias.kind === 'subdomain'
                || alias.kind === 'root'
                || alias.kind === 'locale'
                || alias.kind === 'redirect'
                ? alias.kind
                : 'alias',
            status,
            requestedAt: typeof alias.requestedAt === 'string' ? alias.requestedAt : null,
            verifiedAt: status === 'verified' && typeof alias.verifiedAt === 'string' ? alias.verifiedAt : null,
            lastError: typeof alias.lastError === 'string' ? alias.lastError : null,
        }];
    });
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
        domainAliases: normalizeDomainAliases(isRecord(value) ? value.domainAliases : undefined),
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

// Arrays replace; nested settings sections merge so partial writes retain current metadata.
const mergeSettingsRecords = (current: Record<string, unknown>, patch: Record<string, unknown>): Record<string, unknown> => Object.fromEntries(
    Array.from(new Set([...Object.keys(current), ...Object.keys(patch)])).map((key) => {
        const value = patch[key];
        return [key, value === undefined ? current[key] : isRecord(value) && isRecord(current[key]) ? mergeSettingsRecords(current[key], value) : value];
    }),
);

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

    return canvasContentPayloadToBackyContentDocument({
        id: input.id,
        kind: input.kind,
        title: input.title,
        slug: input.slug,
        status: input.status,
        version: input.version,
        rawContent,
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

// Do not select or normalize editable canvas JSON for identity/navigation reads.
const pageSummaryColumns = {
    id: pages.id,
    siteId: pages.siteId,
    title: pages.title,
    slug: pages.slug,
    description: pages.description,
    meta: pages.meta,
    status: pages.status,
    publishedAt: pages.publishedAt,
    scheduledAt: pages.scheduledAt,
    isHomepage: pages.isHomepage,
    parentId: pages.parentId,
    sortOrder: pages.sortOrder,
    createdBy: pages.createdBy,
    updatedBy: pages.updatedBy,
    createdAt: pages.createdAt,
    updatedAt: pages.updatedAt,
};
type PageSummaryRow = Omit<PageRow, 'content'>;

const toPageSummary = (row: PageSummaryRow): BackyPageSummary => ({
    id: row.id,
    siteId: row.siteId,
    title: row.title,
    slug: row.slug,
    description: row.description,
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

const searchMetaKeys = ['canonical', 'title', 'description', 'noIndex', 'noFollow', 'keywords'] as const;
const searchMetaValue = (column: SQLWrapper, key: typeof searchMetaKeys[number], adapter: string) => {
    // Constants only; JSON is returned as text on every driver and decoded once.
    const expression = adapter === 'sqlite' ? sql`cast(${column} -> ${`$.${key}`} as text)`
        : adapter === 'mysql' ? sql`cast(json_extract(${column}, ${`$.${key}`}) as char)`
            : sql`(${column} -> ${key})::text`;
    return expression.mapWith((value: unknown) => value === null ? undefined : JSON.parse(String(value))).as(`search_${key}`);
};
const searchColumns = (table: typeof pages | typeof blogPosts, adapter: string) => ({
    id: table.id, siteId: table.siteId, title: table.title, slug: table.slug,
    status: table.status, scheduledAt: table.scheduledAt, updatedAt: table.updatedAt,
    seoCanonical: searchMetaValue(table.meta, 'canonical', adapter),
    seoTitle: searchMetaValue(table.meta, 'title', adapter),
    seoDescription: searchMetaValue(table.meta, 'description', adapter),
    seoNoIndex: searchMetaValue(table.meta, 'noIndex', adapter),
    seoNoFollow: searchMetaValue(table.meta, 'noFollow', adapter),
    seoKeywords: searchMetaValue(table.meta, 'keywords', adapter),
});
type SearchRow = {
    id: string; siteId: string; title: string; slug: string; status: PublishStatus;
    scheduledAt: Date | string | null; updatedAt: Date | string;
    seoCanonical?: unknown; seoTitle?: unknown; seoDescription?: unknown;
    seoNoIndex?: unknown; seoNoFollow?: unknown; seoKeywords?: unknown;
};
const searchIdentity = (row: SearchRow) => ({
    id: row.id, siteId: row.siteId, title: row.title, slug: row.slug, status: row.status,
    scheduledAt: toNullableIso(row.scheduledAt), updatedAt: toIso(row.updatedAt),
    meta: Object.fromEntries(searchMetaKeys.flatMap(key => {
        const value = row[`seo${key[0].toUpperCase()}${key.slice(1)}` as keyof SearchRow];
        return value === undefined || value === null ? [] : [[key, value]];
    })) as BackySearchSeoMeta,
});
async function listMetadataRows<T>(database: QueryDatabase, table: typeof pages | typeof blogPosts,
    columns: Record<string, unknown>, input: BackySearchMetadataListInput): Promise<BackyListResult<T>> {
    if (!['published', 'scheduled'].includes(input.status)) throw new Error('Search requires an explicit public candidate status.');
    const limit = normalizeLimit(input.limit), offset = normalizeOffset(input.offset);
    const where = and(eq(table.siteId, input.siteId), eq(table.status, input.status));
    const [count] = await database.select({ total: sql<number>`count(*)` }).from(table).where(where) as { total: number | string }[];
    const total = Number(count?.total);
    if (!Number.isSafeInteger(total) || total < 0) throw new Error('Invalid search metadata count.');
    const items = await database.select(columns).from(table).where(where)
        .orderBy(desc(table.updatedAt), desc(table.id)).limit(limit).offset(offset) as T[];
    return { items, pagination: { total, limit, offset, hasMore: offset + items.length < total } };
}

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

// Project recognized routing leaves in SQL. Nested owner extensions never cross the connection.
const routeLeaf = (value: SQLWrapper, type: 'string' | 'boolean' | 'number') => sql`case when jsonb_typeof(${value}) = ${type} then ${value} else 'null'::jsonb end`;
const routingArray = (value: SQLWrapper) => sql`case when jsonb_typeof(${value}) = 'array' then ${value} else '[]'::jsonb end`;
const routeSettingsProjection = () => {
    const redirects = routingArray(sql`${sites.settings}->'redirectRules'`);
    const locales = routingArray(sql`${sites.settings}->'localization'->'locales'`);
    const redirectFields = ['id', 'from', 'to'].flatMap(key => [sql`${key}::text`, routeLeaf(sql`entry.value->${key}::text`, 'string')]);
    redirectFields.push(sql`'statusCode'`, routeLeaf(sql`entry.value->'statusCode'`, 'number'), sql`'enabled'`, routeLeaf(sql`entry.value->'enabled'`, 'boolean'));
    const localeFields = ['code', 'label', 'direction', 'pathPrefix', 'domain'].flatMap(key => [sql`${key}::text`, routeLeaf(sql`entry.value->${key}::text`, 'string')]);
    localeFields.push(sql`'default'`, routeLeaf(sql`entry.value->'default'`, 'boolean'));
    return sql<string | null>`(select case when octet_length(projected::text) <= 262144 then projected::text else null end from (
        select case when jsonb_array_length(${redirects}) > 10000 or jsonb_array_length(${locales}) > 1000
            or exists (select 1 from jsonb_array_elements(${locales}) locale_entry where jsonb_typeof(locale_entry->'default') not in ('boolean', 'null')) then null else jsonb_build_object(
            'redirectRules', coalesce((select jsonb_agg(jsonb_build_object(${sql.join(redirectFields, sql`, `)}) order by entry.ordinal)
                from jsonb_array_elements(${redirects}) with ordinality entry(value, ordinal) where jsonb_typeof(entry.value) = 'object'), '[]'::jsonb),
            'localization', jsonb_build_object(
                'defaultLocale', ${routeLeaf(sql`${sites.settings}->'localization'->'defaultLocale'`, 'string')},
                'localeStrategy', ${routeLeaf(sql`${sites.settings}->'localization'->'localeStrategy'`, 'string')},
                'locales', coalesce((select jsonb_agg(case when jsonb_typeof(entry.value) = 'object' then jsonb_build_object(${sql.join(localeFields, sql`, `)}) else null end order by entry.ordinal)
                    from jsonb_array_elements(${locales}) with ordinality entry(value, ordinal)), '[]'::jsonb)
            )
        ) end as projected
    ) routing_projection)`;
};
const pageRouteColumns = {
    id: pages.id, siteId: pages.siteId,
    slug: sql<string>`case when length(${pages.slug}) <= 1024 then ${pages.slug} else null end`,
    parentId: pages.parentId, isHomepage: pages.isHomepage, status: pages.status, scheduledAt: pages.scheduledAt,
};
type PageRouteRow = Omit<BackyPageRouteMetadata, 'scheduledAt'> & { scheduledAt: Date | string | null };
const toPageRouteMetadata = (row: PageRouteRow): BackyPageRouteMetadata => {
    if (typeof row.slug !== 'string') throw Error('Page routing identity exceeds its read budget');
    return { ...row, scheduledAt: toNullableIso(row.scheduledAt) };
};

export function createSiteRepository(db: DatabaseInstance, adapterType: string = 'postgres'): BackySiteRepository {
    const database = asDb(db);

    return {
        async getRouteMetadataByIdOrSlug(identifier: string): Promise<BackySiteRouteMetadata | null> {
            if (adapterType !== 'postgres') throw Error('Narrow routing projection requires PostgreSQL');
            const columns = { id: sites.id, slug: sites.slug, isPublished: sites.isPublished, routingSettings: routeSettingsProjection() };
            type Row = Pick<Site, 'id' | 'slug' | 'isPublished'> & { routingSettings: string | null };
            const read = (where: ReturnType<typeof eq>) => firstOrNull<Row>(database.select(columns).from(sites).where(where).limit(1));
            let row = isUuidIdentifier(identifier) ? await read(eq(sites.id, identifier)) : null;
            if (!row) row = await read(eq(sites.slug, identifier));
            if (!row) return null;
            if (row.routingSettings === null) throw Error('Routing settings exceed their read budget');
            const settings = JSON.parse(row.routingSettings);
            // Match the full repository's redirect normalization, including stripped legacy keys.
            return { id: row.id, slug: row.slug, isPublished: row.isPublished, settings: {
                localization: settings.localization, redirectRules: normalizeSiteRedirectRules(settings.redirectRules),
            } };
        },
        async getAccessScopeByIdOrSlug(identifier: string): Promise<Pick<Site, 'id' | 'slug' | 'teamId'> | null> {
            const columns = { id: sites.id, slug: sites.slug, teamId: sites.teamId };
            if (isUuidIdentifier(identifier)) {
                const byId = await firstOrNull<Pick<Site, 'id' | 'slug' | 'teamId'>>(database.select(columns).from(sites).where(eq(sites.id, identifier)).limit(1));
                if (byId) return byId;
            }
            return firstOrNull<Pick<Site, 'id' | 'slug' | 'teamId'>>(database.select(columns).from(sites).where(eq(sites.slug, identifier)).limit(1));
        },
        async getSearchMetadataByIdOrSlug(identifier: string): Promise<BackySiteSearchMetadata | null> {
            // Correlated ordered projection keeps first-match override semantics;
            // unused templates, JSON-LD, OG images and owner labels stay in SQL.
            // Other adapters must provide equivalent ordered JSON projection.
            if (adapterType !== 'postgres') throw Error('Ordered site search metadata projection is unavailable for this adapter.');
            const settings = sql<string>`case when ${sites.isPublished} = false then '{"seo":{}}'::text else jsonb_build_object(
                'seo', jsonb_build_object(
                    'titleTemplate', coalesce(${sites.settings}->'seo'->'titleTemplate', ${JSON.stringify(DEFAULT_SITE_SETTINGS.seo.titleTemplate)}::jsonb),
                    'defaultDescription', coalesce(${sites.settings}->'seo'->'defaultDescription', ${JSON.stringify(DEFAULT_SITE_SETTINGS.seo.defaultDescription)}::jsonb),
                    'robots', jsonb_build_object(
                        'index', coalesce(${sites.settings}->'seo'->'robots'->'index', 'true'::jsonb),
                        'follow', coalesce(${sites.settings}->'seo'->'robots'->'follow', 'true'::jsonb)
                    ),
                    'routeOverrides', coalesce((select jsonb_agg(jsonb_build_object(
                        'id', search_override.value->'id', 'match', search_override.value->'match',
                        'enabled', search_override.value->'enabled', 'title', search_override.value->'title',
                        'description', search_override.value->'description', 'canonical', search_override.value->'canonical',
                        'keywords', search_override.value->'keywords',
                        'robots', jsonb_build_object('index', search_override.value->'robots'->'index', 'follow', search_override.value->'robots'->'follow')
                    ) order by search_override.ordinal)
                    from jsonb_array_elements(case
                        when ${sites.settings}->'seo'->'routeOverrides' is null
                          or ${sites.settings}->'seo'->'routeOverrides' in ('null'::jsonb, 'false'::jsonb, '0'::jsonb, '""'::jsonb) then '[]'::jsonb
                        else ${sites.settings}->'seo'->'routeOverrides' end
                    ) with ordinality as search_override(value, ordinal)), '[]'::jsonb)
                )
            )::text end`.as('search_settings');
            const columns = { id: sites.id, slug: sites.slug, name: sites.name, isPublished: sites.isPublished, updatedAt: sites.updatedAt, searchSettings: settings };
            type Row = Omit<BackySiteSearchMetadata, 'updatedAt' | 'settings'> & { updatedAt: Date | string; searchSettings: string };
            const read = async (where: ReturnType<typeof eq>) => firstOrNull<Row>(database.select(columns).from(sites).where(where).limit(1));
            let row = isUuidIdentifier(identifier) ? await read(eq(sites.id, identifier)) : null;
            if (!row) row = await read(eq(sites.slug, identifier));
            return row ? { id: row.id, slug: row.slug, name: row.name, isPublished: row.isPublished, updatedAt: toIso(row.updatedAt), settings: JSON.parse(row.searchSettings) } : null;
        },

        async getPublicationByIdOrSlug(identifier: string): Promise<Pick<Site, 'id' | 'slug' | 'isPublished'> | null> {
            const columns = { id: sites.id, slug: sites.slug, isPublished: sites.isPublished };
            // Retain ID precedence even when another site's slug is UUID-shaped.
            if (isUuidIdentifier(identifier)) {
                const byId = await firstOrNull<Pick<Site, 'id' | 'slug' | 'isPublished'>>(
                    database.select(columns).from(sites).where(eq(sites.id, identifier)).limit(1),
                );
                if (byId) return byId;
            }
            return firstOrNull<Pick<Site, 'id' | 'slug' | 'isPublished'>>(
                database.select(columns).from(sites).where(eq(sites.slug, identifier)).limit(1),
            );
        },

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
            if (!isUuidIdentifier(siteId)) return null;

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
            return withSiteCreationAdmission(db, adapterType, async transaction => {
            const [conflict] = await transaction.select({id:sites.id}).from(sites).where(eq(sites.slug,input.slug));
            if (conflict) throw new SiteCreationAdmissionError('SITE_SLUG_CONFLICT',409,'This site slug is already in use. Choose another slug.');
            const [row] = await transaction.insert(sites).values({
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
            });
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
            if (input.isPublished !== undefined) updates.isPublished = input.isPublished;
            if (input.status !== undefined) updates.isPublished = input.status === 'published';
            if (input.publishedAt !== undefined) updates.publishedAt = input.publishedAt ? new Date(input.publishedAt) : null;

            const save = async (transaction: QueryDatabase) => {
                const [row] = await transaction.update(sites).set(updates).where(eq(sites.id, siteId)).returning() as SiteRow[];
                if (!row) throw Object.assign(new Error('Site not found'), { code: 'SITE_NOT_FOUND' });
                return { item: toSite(row) };
            };
            if (input.settings === undefined) return save(database);
            if (Object.prototype.hasOwnProperty.call(input.settings, 'frontendDesign')) throw Object.assign(new Error('Change frontendDesign through the atomic template history writer.'), { code: 'FRONTEND_DESIGN_HISTORY_REQUIRED', status: 400 });
            return database.transaction(async (transaction) => {
                const current = await firstOrNull<SiteRow>(transaction.select().from(sites).where(eq(sites.id, siteId)).for('update'));
                if (!current) throw Object.assign(new Error('Site not found'), { code: 'SITE_NOT_FOUND' });
                updates.settings = normalizeSettings(mergeSettingsRecords(normalizeSettings(current.settings) as unknown as Record<string, unknown>, input.settings as Record<string, unknown>));
                return save(transaction);
            });
        },

        async delete(siteId: string): Promise<boolean> {
            const deleted = await database.delete(sites).where(eq(sites.id, siteId)).returning();
            return deleted.length > 0;
        },
    };
}

export function createPageRepository(db: DatabaseInstance, adapterType = 'postgres'): BackyPageRepository {
    const database = asDb(db);

    return {
        async listCanvasSourceMetadata(input) {
            if (adapterType !== 'postgres') throw Error('Narrow canvas discovery requires PostgreSQL');
            const { limit = 50, offset = 0, search = '' } = input;
            if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100 || !Number.isSafeInteger(offset) || offset < 0 || offset > 1000000 || typeof search !== 'string' || search.length > 200) throw Error('Invalid canvas discovery query');
            const where = and(eq(pages.siteId, input.siteId), ne(pages.status, 'archived'), search ? sql`position(lower(${search}) in lower(${pages.title} || ' ' || ${pages.slug})) > 0` : undefined);
            const count = await firstOrNull<{ total: number }>(database.select({ total: sql<number>`count(*)::int` }).from(pages).where(where));
            const total = Number(count?.total);
            if (!Number.isSafeInteger(total) || total < 0) throw Error('Invalid canvas discovery count');
            const items = await database.select({
                id: pages.id, siteId: pages.siteId,
                title: sql<string>`case when length(${pages.title}) <= 2000 then ${pages.title} else null end`,
                slug: sql<string>`case when length(${pages.slug}) <= 1024 then ${pages.slug} else null end`,
                status: pages.status,
            }).from(pages).where(where).orderBy(desc(pages.updatedAt), desc(pages.id)).limit(limit).offset(offset) as BackyPageCanvasSource[];
            return { items, pagination: { total, limit, offset, hasMore: offset + limit < total } };
        },
        async getRouteMetadataById(siteId, pageId) {
            if (!isUuidIdentifier(siteId) || !isUuidIdentifier(pageId)) return null;
            const row = await firstOrNull<PageRouteRow>(database.select(pageRouteColumns).from(pages).where(and(eq(pages.siteId, siteId), eq(pages.id, pageId))).limit(1));
            return row ? toPageRouteMetadata(row) : null;
        },
        async getRouteMetadataBySlug(siteId, slug) {
            const row = await firstOrNull<PageRouteRow>(database.select(pageRouteColumns).from(pages).where(and(eq(pages.siteId, siteId), eq(pages.slug, slug))).limit(1));
            return row ? toPageRouteMetadata(row) : null;
        },
        async listRouteMetadata(input) {
            // Home selection requires every status; silently filtering drafts changes Home precedence.
            if (input.status !== 'all' || !input.includeUnpublished || input.search || input.parentId !== undefined) throw Error('Unsupported routing inventory query');
            const { limit = 50, offset = 0 } = input;
            if (!Number.isSafeInteger(limit) || limit < 1 || limit > 1000 || !Number.isSafeInteger(offset) || offset < 0) throw Error('Invalid routing pagination');
            const count = await firstOrNull<{ total: number }>(database.select({ total: sql<number>`count(*)::int` }).from(pages).where(eq(pages.siteId, input.siteId)));
            const total = Number(count?.total || 0);
            if (total > 10000) throw Error('Page hierarchy inventory exceeds its read budget');
            const rows = await database.select(pageRouteColumns).from(pages).where(eq(pages.siteId, input.siteId)).orderBy(desc(pages.updatedAt), desc(pages.id)).limit(limit).offset(offset) as PageRouteRow[];
            return { items: rows.map(toPageRouteMetadata), pagination: { total, limit, offset, hasMore: offset + limit < total } };
        },
        async listLinkMetadata(input): Promise<BackyListResult<BackyPageLinkMetadata>> {
            const result = await listMetadataRows<BackyPageLinkMetadata>(database, pages, {
                id: pages.id, siteId: pages.siteId,
                title: sql<string>`substr(${pages.title}, 1, 256)`,
                slug: sql<string>`case when length(${pages.slug}) <= 1024 then ${pages.slug} else '' end`,
                status: pages.status, isHomepage: pages.isHomepage, parentId: pages.parentId, updatedAt: pages.updatedAt,
            }, { ...input, status: 'published' });
            return { ...result, items: result.items.map(row => ({ ...row, updatedAt: toIso(row.updatedAt) })) };
        },
        async listSearchMetadata(input: BackySearchMetadataListInput): Promise<BackyListResult<BackyPageSearchMetadata>> {
            const result = await listMetadataRows<SearchRow & Pick<PageRow, 'description' | 'isHomepage' | 'parentId'>>(database, pages,
                { ...searchColumns(pages, adapterType), description: pages.description, isHomepage: pages.isHomepage, parentId: pages.parentId }, input);
            return { ...result, items: result.items.map(row => ({ ...searchIdentity(row), description: row.description, isHomepage: row.isHomepage, parentId: row.parentId })) };
        },
        async listSummaries(input: BackyPageListInput): Promise<BackyListResult<BackyPageSummary>> {
            const rows = await database.select(pageSummaryColumns).from(pages).where(eq(pages.siteId, input.siteId)).orderBy(desc(pages.updatedAt)) as PageSummaryRow[];
            const filtered = rows
                .map(toPageSummary)
                .filter((page) => input.includeUnpublished || input.status === 'all' || page.status === 'published')
                .filter((page) => input.status && input.status !== 'all' ? page.status === input.status : true)
                .filter((page) => input.parentId === undefined ? true : page.parentId === input.parentId)
                .filter((page) => input.search ? searchText(`${page.title} ${page.slug} ${page.description || ''}`, input.search) : true);
            return paginate(filtered, input.limit, input.offset);
        },

        async getSummaryById(siteId: string, pageId: string): Promise<BackyPageSummary | null> {
            if (!isUuidIdentifier(siteId) || !isUuidIdentifier(pageId)) return null;
            const row = await firstOrNull<PageSummaryRow>(
                database.select(pageSummaryColumns).from(pages).where(and(eq(pages.siteId, siteId), eq(pages.id, pageId))).limit(1),
            );
            return row ? toPageSummary(row) : null;
        },

        async getSummaryBySlug(siteId: string, slug: string): Promise<BackyPageSummary | null> {
            const row = await firstOrNull<PageSummaryRow>(
                database.select(pageSummaryColumns).from(pages).where(and(eq(pages.siteId, siteId), eq(pages.slug, slug))).limit(1),
            );
            return row ? toPageSummary(row) : null;
        },

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
            if (!isUuidIdentifier(siteId) || !isUuidIdentifier(pageId)) return null;

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
            const guarded = input.expectedContent !== undefined || input.expectedUpdatedAt !== undefined;
            if (input.beforeUpdateRevision && (input.expectedContent === undefined || !input.expectedUpdatedAt)) throw new BackyContentConflictError();
            const run = async (writer: QueryDatabase): Promise<BackyRepositoryMutationResult<BackyPage>> => {
                let lockedCurrent: BackyPage | null = null;
                if (guarded) {
                    const current = await firstOrNull<PageRow>(
                        writer.select().from(pages).where(and(eq(pages.siteId, siteId), eq(pages.id, pageId))).limit(1).for('update'),
                    );
                    lockedCurrent = current ? toPage(current) : null;
                    assertBackyContentUpdateExpectation(input, lockedCurrent);
                }
                if (input.beforeUpdateRevision) {
                    await createContentWorkflowRepository(writer as unknown as DatabaseInstance).createRevision({
                        ...input.beforeUpdateRevision,
                        siteId,
                        targetType: 'page',
                        targetId: pageId,
                    });
                }
                const updates: Record<string, unknown> = {
                    // Guarded revisions advance even for metadata-only writes in the same millisecond.
                    updatedAt: new Date(Math.max(Date.now(), lockedCurrent ? Date.parse(lockedCurrent.updatedAt) + 1 : 0)),
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

                const [row] = await writer.update(pages).set(updates).where(and(eq(pages.siteId, siteId), eq(pages.id, pageId))).returning() as PageRow[];
                return { item: toPage(row) };
            };
            return guarded ? database.transaction(run) : run(database);
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

export function createPostRepository(db: DatabaseInstance, adapterType = 'postgres'): BackyPostRepository {
    const database = asDb(db);

    return {
        async listPublicArchiveMetadata(input): Promise<BackyListResult<BackyPostArchiveMetadata>> {
            if (adapterType !== 'postgres') throw new Error('Public archive SQL projection unavailable for this adapter.');
            if (!Number.isFinite(Date.parse(input.asOf))) throw new Error('A valid archive admission time is required.');
            const limit = normalizeLimit(input.limit), offset = normalizeOffset(input.offset);
            // JSON arrays are projected/examined inside SQL, never by fetching
            // the enclosing owner metadata. Malformed/oversized arrays fail the
            // public DTO check rather than becoming a different set of tags.
            const array = (key: 'categoryIds' | 'tagIds') => sql<string[]>`case
                when jsonb_typeof(${blogPosts.meta}->${key}) = 'array' then
                    case when jsonb_array_length(${blogPosts.meta}->${key}) <= 1000 then ${blogPosts.meta}->${key} else null end
                when ${blogPosts.meta}->${key} is null or ${blogPosts.meta}->${key} = 'null'::jsonb then '[]'::jsonb else null end`;
            const categoryIds = array('categoryIds'), tagIds = array('tagIds');
            const where = and(eq(blogPosts.siteId, input.siteId), sql`(${blogPosts.status} = 'published'
                or (${blogPosts.status} = 'scheduled' and ${blogPosts.scheduledAt} <= ${input.asOf}::timestamptz))`,
                input.categoryId ? sql`${categoryIds} @> ${JSON.stringify([input.categoryId])}::jsonb` : undefined,
                input.tagId ? sql`${tagIds} @> ${JSON.stringify([input.tagId])}::jsonb` : undefined,
                input.search ? sql`position(lower(${input.search}) in lower(${blogPosts.title} || ' ' || ${blogPosts.slug} || ' ' || coalesce(${blogPosts.excerpt}, ''))) > 0` : undefined);
            const [count] = await database.select({ total: sql<number>`count(*)` }).from(blogPosts).where(where) as { total: number | string }[];
            const total = Number(count?.total);
            if (!Number.isSafeInteger(total) || total < 0) throw new Error('Invalid archive count.');
            type Row = Omit<BackyPostArchiveMetadata, 'publishedAt' | 'scheduledAt' | 'meta'> & {
                publishedAt: Date | null; scheduledAt: Date | null; originalPublishedAt: string | null;
            };
            const rows = await database.select({
                id: blogPosts.id, siteId: blogPosts.siteId, status: blogPosts.status,
                title: sql<string>`case when length(${blogPosts.title}) <= 2000 then ${blogPosts.title} else null end`,
                slug: sql<string>`case when length(${blogPosts.slug}) <= 200 then ${blogPosts.slug} else null end`,
                excerpt: sql<string | null>`case when length(${blogPosts.excerpt}) <= 20000 then ${blogPosts.excerpt} else null end`,
                publishedAt: blogPosts.publishedAt, scheduledAt: blogPosts.scheduledAt, categoryIds, tagIds,
                originalPublishedAt: sql<string | null>`case when jsonb_typeof(${blogPosts.meta}->'originalPublishedAt') = 'string'
                    and length(${blogPosts.meta}->>'originalPublishedAt') <= 64 then ${blogPosts.meta}->>'originalPublishedAt' else null end`,
            }).from(blogPosts).where(where).orderBy(desc(blogPosts.updatedAt), desc(blogPosts.id)).limit(limit).offset(offset) as Row[];
            return { items: rows.map(({ originalPublishedAt, ...row }) => ({ ...row,
                publishedAt: toNullableIso(row.publishedAt), scheduledAt: toNullableIso(row.scheduledAt),
                meta: originalPublishedAt === null ? {} : { originalPublishedAt },
            })), pagination: { total, limit, offset, hasMore: offset + limit < total } };
        },
        async listSearchMetadata(input: BackySearchMetadataListInput): Promise<BackyListResult<BackyPostSearchMetadata>> {
            const result = await listMetadataRows<SearchRow & Pick<BlogPostRow, 'excerpt'>>(database, blogPosts,
                { ...searchColumns(blogPosts, adapterType), excerpt: blogPosts.excerpt }, input);
            return { ...result, items: result.items.map(row => ({ ...searchIdentity(row), excerpt: row.excerpt })) };
        },
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
            if (!isUuidIdentifier(siteId) || !isUuidIdentifier(postId)) return null;

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
            const guarded = input.expectedContent !== undefined || input.expectedUpdatedAt !== undefined;
            if (input.beforeUpdateRevision && (input.expectedContent === undefined || !input.expectedUpdatedAt)) throw new BackyContentConflictError();
            const run = async (writer: QueryDatabase): Promise<BackyRepositoryMutationResult<BackyPost>> => {
                let lockedCurrent: BackyPost | null = null;
                if (guarded) {
                    const current = await firstOrNull<BlogPostRow>(
                        writer.select().from(blogPosts).where(and(eq(blogPosts.siteId, siteId), eq(blogPosts.id, postId))).limit(1).for('update'),
                    );
                    lockedCurrent = current ? toPost(current) : null;
                    assertBackyContentUpdateExpectation(input, lockedCurrent);
                }
                if (input.beforeUpdateRevision) {
                    await createContentWorkflowRepository(writer as unknown as DatabaseInstance).createRevision({
                        ...input.beforeUpdateRevision,
                        siteId,
                        targetType: 'post',
                        targetId: postId,
                    });
                }
                const updates: Record<string, unknown> = {
                    // Guarded revisions advance even for metadata-only writes in the same millisecond.
                    updatedAt: new Date(Math.max(Date.now(), lockedCurrent ? Date.parse(lockedCurrent.updatedAt) + 1 : 0)),
                };
                if (input.title !== undefined) updates.title = input.title;
                if (input.slug !== undefined) updates.slug = input.slug;
                if (input.excerpt !== undefined) updates.excerpt = input.excerpt;
                if (input.content !== undefined) updates.content = contentPayload(input.content);
                if (input.featuredImageId !== undefined) updates.featuredImageId = input.featuredImageId;
                if (input.authorId !== undefined) updates.authorId = input.authorId;
                if (input.meta !== undefined || input.categoryIds !== undefined || input.tagIds !== undefined) {
                    const current = guarded ? lockedCurrent : await this.getById(siteId, postId);
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

                const [row] = await writer.update(blogPosts).set(updates).where(and(eq(blogPosts.siteId, siteId), eq(blogPosts.id, postId))).returning() as BlogPostRow[];
                return { item: toPost(row) };
            };
            return guarded ? database.transaction(run) : run(database);
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
