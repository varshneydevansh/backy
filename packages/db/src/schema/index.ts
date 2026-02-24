/**
 * ==========================================================================
 * @backy/db - Database Schema
 * ==========================================================================
 *
 * Drizzle ORM schema that works across PostgreSQL, MySQL, and SQLite.
 * Uses cross-compatible types to ensure portability.
 *
 * @module @backy/db/schema
 * @author Backy Team
 * @license MIT
 */

import {
    pgTable,
    uuid,
    text,
    boolean,
    timestamp,
    integer,
    jsonb,
} from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';

// ==========================================================================
// ENUMS (Stored as text for cross-DB compatibility)
// ==========================================================================

/** User roles for access control */
export type UserRole = 'admin' | 'editor' | 'viewer';

/** Page/Post publish status */
export type PublishStatus = 'draft' | 'published' | 'scheduled' | 'archived';

/** Domain verification status */
export type DomainStatus = 'pending' | 'active' | 'error' | 'expired';

/** Media file type */
export type MediaType = 'image' | 'video' | 'audio' | 'document' | 'other';

// ==========================================================================
// PROFILES - User profiles extending auth
// ==========================================================================

/**
 * User profiles - stores CMS-specific user data
 *
 * The `id` references the auth provider's user ID.
 */
export const profiles = pgTable('profiles', {
    /** User ID from auth provider */
    id: uuid('id').primaryKey(),

    /** User email */
    email: text('email').notNull(),

    /** Display name */
    fullName: text('full_name'),

    /** Avatar image URL */
    avatarUrl: text('avatar_url'),

    /** User role: admin, editor, or viewer */
    role: text('role').$type<UserRole>().default('editor').notNull(),

    /** Whether account is active */
    isActive: boolean('is_active').default(true).notNull(),

    /** Creation timestamp */
    createdAt: timestamp('created_at').defaultNow().notNull(),

    /** Last update timestamp */
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// ==========================================================================
// TEAMS - Multi-tenancy support
// ==========================================================================

/**
 * Teams/Organizations for multi-tenancy
 *
 * A team can have multiple sites and multiple members.
 */
export const teams = pgTable('teams', {
    id: uuid('id').defaultRandom().primaryKey(),
    name: text('name').notNull(),
    slug: text('slug').unique().notNull(),
    ownerId: uuid('owner_id').references(() => profiles.id),
    settings: jsonb('settings').default({}).notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
});

/**
 * Team members junction table
 */
export const teamMembers = pgTable('team_members', {
    id: uuid('id').defaultRandom().primaryKey(),
    teamId: uuid('team_id')
        .references(() => teams.id, { onDelete: 'cascade' })
        .notNull(),
    userId: uuid('user_id')
        .references(() => profiles.id, { onDelete: 'cascade' })
        .notNull(),
    role: text('role').$type<UserRole>().default('editor').notNull(),
    joinedAt: timestamp('joined_at').defaultNow().notNull(),
});

// ==========================================================================
// SITES - Main content container
// ==========================================================================

/**
 * Sites - each site is a complete website
 *
 * Contains pages, blog posts, media, and theme settings.
 */
export const sites = pgTable('sites', {
    id: uuid('id').defaultRandom().primaryKey(),

    /** Owning team */
    teamId: uuid('team_id')
        .references(() => teams.id, { onDelete: 'cascade' })
        .notNull(),

    /** Site name (displayed in admin) */
    name: text('name').notNull(),

    /** URL slug for subdomain */
    slug: text('slug').notNull(),

    /** Site description */
    description: text('description'),

    // --- Domain settings ---
    customDomain: text('custom_domain').unique(),
    domainStatus: text('domain_status').$type<DomainStatus>().default('pending'),
    sslEnabled: boolean('ssl_enabled').default(false),

    // --- Theme settings (JSON) ---
    theme: jsonb('theme').default({
        colors: {},
        fonts: {},
        spacing: {},
        customCSS: '',
    }),

    // --- Site settings (JSON) ---
    settings: jsonb('settings').default({
        seo: {},
        analytics: {},
        social: {},
    }),

    // --- Publishing ---
    isPublished: boolean('is_published').default(false).notNull(),
    publishedAt: timestamp('published_at'),

    // --- Timestamps ---
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// ==========================================================================
// PAGES - Visual page content
// ==========================================================================

/**
 * Pages - individual pages built with visual editor
 */
export const pages = pgTable('pages', {
    id: uuid('id').defaultRandom().primaryKey(),
    siteId: uuid('site_id')
        .references(() => sites.id, { onDelete: 'cascade' })
        .notNull(),

    // --- Page info ---
    title: text('title').notNull(),
    slug: text('slug').notNull(),
    description: text('description'),

    // --- Content (editor JSON format) ---
    content: jsonb('content').default({
        elements: [],
        canvasSize: { width: 1200, height: 800 },
    }),

    // --- SEO metadata ---
    meta: jsonb('meta').default({}),

    // --- Publishing ---
    status: text('status').$type<PublishStatus>().default('draft').notNull(),
    publishedAt: timestamp('published_at'),
    scheduledAt: timestamp('scheduled_at'),

    // --- Hierarchy ---
    isHomepage: boolean('is_homepage').default(false).notNull(),
    parentId: uuid('parent_id'),
    sortOrder: integer('sort_order').default(0).notNull(),

    // --- Tracking ---
    createdBy: uuid('created_by').references(() => profiles.id),
    updatedBy: uuid('updated_by').references(() => profiles.id),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// ==========================================================================
// BLOG - Posts, categories, tags
// ==========================================================================

/**
 * Blog posts
 */
export const blogPosts = pgTable('blog_posts', {
    id: uuid('id').defaultRandom().primaryKey(),
    siteId: uuid('site_id')
        .references(() => sites.id, { onDelete: 'cascade' })
        .notNull(),

    title: text('title').notNull(),
    slug: text('slug').notNull(),
    excerpt: text('excerpt'),
    content: jsonb('content'),
    contentFormat: text('content_format').default('editor'),

    featuredImageId: uuid('featured_image_id'),
    authorId: uuid('author_id').references(() => profiles.id),

    status: text('status').$type<PublishStatus>().default('draft').notNull(),
    publishedAt: timestamp('published_at'),
    scheduledAt: timestamp('scheduled_at'),

    meta: jsonb('meta').default({}),
    viewCount: integer('view_count').default(0).notNull(),

    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

/**
 * Blog categories
 */
export const blogCategories = pgTable('blog_categories', {
    id: uuid('id').defaultRandom().primaryKey(),
    siteId: uuid('site_id')
        .references(() => sites.id, { onDelete: 'cascade' })
        .notNull(),
    name: text('name').notNull(),
    slug: text('slug').notNull(),
    description: text('description'),
    sortOrder: integer('sort_order').default(0).notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
});

/**
 * Blog tags
 */
export const blogTags = pgTable('blog_tags', {
    id: uuid('id').defaultRandom().primaryKey(),
    siteId: uuid('site_id')
        .references(() => sites.id, { onDelete: 'cascade' })
        .notNull(),
    name: text('name').notNull(),
    slug: text('slug').notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
});

// ==========================================================================
// MEDIA - File storage references
// ==========================================================================

/**
 * Media files
 */
export const media = pgTable('media', {
    id: uuid('id').defaultRandom().primaryKey(),
    siteId: uuid('site_id')
        .references(() => sites.id, { onDelete: 'cascade' })
        .notNull(),

    filename: text('filename').notNull(),
    originalName: text('original_name').notNull(),
    mimeType: text('mime_type').notNull(),
    sizeBytes: integer('size_bytes').notNull(),
    type: text('type').$type<MediaType>().default('other').notNull(),

    url: text('url').notNull(),
    thumbnailUrl: text('thumbnail_url'),

    folderId: uuid('folder_id'),
    tags: jsonb('tags').default([]),
    metadata: jsonb('metadata').default({}),
    altText: text('alt_text'),
    caption: text('caption'),

    uploadedBy: uuid('uploaded_by').references(() => profiles.id),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

/**
 * Media folders
 */
export const mediaFolders = pgTable('media_folders', {
    id: uuid('id').defaultRandom().primaryKey(),
    siteId: uuid('site_id')
        .references(() => sites.id, { onDelete: 'cascade' })
        .notNull(),
    parentId: uuid('parent_id'),
    name: text('name').notNull(),
    sortOrder: integer('sort_order').default(0).notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
});

// ==========================================================================
// DOMAINS - Custom domain mapping
// ==========================================================================

/**
 * Domain mappings for custom domains
 */
export const domainMappings = pgTable('domain_mappings', {
    id: uuid('id').defaultRandom().primaryKey(),
    siteId: uuid('site_id')
        .references(() => sites.id, { onDelete: 'cascade' })
        .notNull(),

    domain: text('domain').notNull(),
    subdomain: text('subdomain'),
    fullDomain: text('full_domain').unique().notNull(),

    verificationRecord: text('verification_record').notNull(),
    isVerified: boolean('is_verified').default(false).notNull(),
    verifiedAt: timestamp('verified_at'),

    sslStatus: text('ssl_status').$type<DomainStatus>().default('pending'),
    sslExpiresAt: timestamp('ssl_expires_at'),
    forceHttps: boolean('force_https').default(true).notNull(),

    redirectRules: jsonb('redirect_rules').default([]),

    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// ==========================================================================
// ACTIVITY & ANALYTICS
// ==========================================================================

/**
 * Activity logs for audit trail
 */
export const activityLogs = pgTable('activity_logs', {
    id: uuid('id').defaultRandom().primaryKey(),
    siteId: uuid('site_id').references(() => sites.id, { onDelete: 'cascade' }),
    userId: uuid('user_id').references(() => profiles.id),
    action: text('action').notNull(),
    entityType: text('entity_type').notNull(),
    entityId: uuid('entity_id'),
    details: jsonb('details').default({}),
    ipAddress: text('ip_address'),
    userAgent: text('user_agent'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
});

/**
 * Page views for analytics
 */
export const pageViews = pgTable('page_views', {
    id: uuid('id').defaultRandom().primaryKey(),
    siteId: uuid('site_id')
        .references(() => sites.id, { onDelete: 'cascade' })
        .notNull(),
    pageId: uuid('page_id').references(() => pages.id, { onDelete: 'set null' }),
    sessionId: text('session_id'),
    referrer: text('referrer'),
    path: text('path').notNull(),
    country: text('country'),
    deviceType: text('device_type'),
    browser: text('browser'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
});

// ==========================================================================
// RELATIONS
// ==========================================================================

export const profilesRelations = relations(profiles, ({ many }) => ({
    teamMemberships: many(teamMembers),
    ownedTeams: many(teams),
}));

export const teamsRelations = relations(teams, ({ one, many }) => ({
    owner: one(profiles, {
        fields: [teams.ownerId],
        references: [profiles.id],
    }),
    members: many(teamMembers),
    sites: many(sites),
}));

export const teamMembersRelations = relations(teamMembers, ({ one }) => ({
    team: one(teams, {
        fields: [teamMembers.teamId],
        references: [teams.id],
    }),
    user: one(profiles, {
        fields: [teamMembers.userId],
        references: [profiles.id],
    }),
}));

export const sitesRelations = relations(sites, ({ one, many }) => ({
    team: one(teams, {
        fields: [sites.teamId],
        references: [teams.id],
    }),
    pages: many(pages),
    blogPosts: many(blogPosts),
    media: many(media),
}));

export const pagesRelations = relations(pages, ({ one }) => ({
    site: one(sites, {
        fields: [pages.siteId],
        references: [sites.id],
    }),
    parent: one(pages, {
        fields: [pages.parentId],
        references: [pages.id],
    }),
}));

export const blogPostsRelations = relations(blogPosts, ({ one }) => ({
    site: one(sites, {
        fields: [blogPosts.siteId],
        references: [sites.id],
    }),
    author: one(profiles, {
        fields: [blogPosts.authorId],
        references: [profiles.id],
    }),
}));

export const mediaRelations = relations(media, ({ one }) => ({
    site: one(sites, {
        fields: [media.siteId],
        references: [sites.id],
    }),
}));
