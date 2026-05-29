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
    index,
    uniqueIndex,
} from 'drizzle-orm/pg-core';
import { relations, sql } from 'drizzle-orm';

// ==========================================================================
// ENUMS (Stored as text for cross-DB compatibility)
// ==========================================================================

/** User roles for access control */
export type UserRole = 'owner' | 'admin' | 'editor' | 'viewer';

/** Page/Post publish status */
export type PublishStatus = 'draft' | 'published' | 'scheduled' | 'archived';

/** Domain verification status */
export type DomainStatus = 'pending' | 'active' | 'error' | 'expired';

/** Media file type */
export type MediaType = 'image' | 'video' | 'audio' | 'document' | 'font' | 'other';

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

    /** Account lifecycle status: active, inactive, invited, or suspended */
    status: text('status').default('active').notNull(),

    /** Creation timestamp */
    createdAt: timestamp('created_at').defaultNow().notNull(),

    /** Last update timestamp */
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => ({
    emailIdx: uniqueIndex('profiles_email_idx').on(table.email),
    roleStatusUpdatedIdx: index('profiles_role_status_updated_idx').on(table.role, table.status, table.updatedAt),
    statusUpdatedIdx: index('profiles_status_updated_idx').on(table.status, table.updatedAt),
}));

/**
 * Local admin password credentials.
 *
 * Stored separately from profiles so user metadata can be read without exposing
 * password hashes through ordinary profile queries.
 */
export const adminUserCredentials = pgTable('admin_user_credentials', {
    userId: uuid('user_id')
        .references(() => profiles.id, { onDelete: 'cascade' })
        .primaryKey(),
    passwordHash: text('password_hash').notNull(),
    salt: text('salt').notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => ({
    userUpdatedAtIdx: index('admin_user_credentials_updated_at_idx').on(table.updatedAt),
}));

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
}, (table) => ({
    ownerCreatedIdx: index('teams_owner_created_idx').on(table.ownerId, table.createdAt),
    createdIdx: index('teams_created_idx').on(table.createdAt),
}));

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
}, (table) => ({
    teamUserIdx: uniqueIndex('team_members_team_user_idx').on(table.teamId, table.userId),
    teamRoleJoinedIdx: index('team_members_team_role_joined_idx').on(table.teamId, table.role, table.joinedAt),
    userJoinedIdx: index('team_members_user_joined_idx').on(table.userId, table.joinedAt),
}));

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
}, (table) => ({
    siteSlugIdx: uniqueIndex('pages_site_slug_idx').on(table.siteId, table.slug),
    siteStatusUpdatedIdx: index('pages_site_status_updated_idx').on(table.siteId, table.status, table.updatedAt),
    siteHomepageIdx: index('pages_site_homepage_idx').on(table.siteId, table.isHomepage),
}));

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
}, (table) => ({
    siteSlugIdx: uniqueIndex('blog_posts_site_slug_idx').on(table.siteId, table.slug),
    siteStatusUpdatedIdx: index('blog_posts_site_status_updated_idx').on(table.siteId, table.status, table.updatedAt),
    sitePublishedIdx: index('blog_posts_site_published_idx').on(table.siteId, table.publishedAt),
}));

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
    color: text('color'),
    sortOrder: integer('sort_order').default(0).notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => ({
    siteSlugIdx: uniqueIndex('blog_categories_site_slug_idx').on(table.siteId, table.slug),
    siteSortIdx: index('blog_categories_site_sort_idx').on(table.siteId, table.sortOrder),
}));

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
    description: text('description'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => ({
    siteSlugIdx: uniqueIndex('blog_tags_site_slug_idx').on(table.siteId, table.slug),
    siteUpdatedIdx: index('blog_tags_site_updated_idx').on(table.siteId, table.updatedAt),
}));

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
    tags: text('tags').array().default(sql`'{}'::text[]`),
    metadata: jsonb('metadata').default({}),
    altText: text('alt_text'),
    caption: text('caption'),

    uploadedBy: uuid('uploaded_by').references(() => profiles.id),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

/**
 * Media versions retained when an asset file is replaced.
 */
export const mediaVersions = pgTable('media_versions', {
    id: uuid('id').defaultRandom().primaryKey(),
    siteId: uuid('site_id')
        .references(() => sites.id, { onDelete: 'cascade' })
        .notNull(),
    mediaId: uuid('media_id')
        .references(() => media.id, { onDelete: 'cascade' })
        .notNull(),

    filename: text('filename').notNull(),
    originalName: text('original_name').notNull(),
    mimeType: text('mime_type').notNull(),
    sizeBytes: integer('size_bytes').notNull(),
    type: text('type').$type<MediaType>().default('other').notNull(),
    url: text('url').notNull(),
    thumbnailUrl: text('thumbnail_url'),
    storagePath: text('storage_path'),
    storageProvider: text('storage_provider'),
    replacedAt: timestamp('replaced_at').defaultNow().notNull(),
    replacedBy: text('replaced_by'),
    reason: text('reason'),
    metadata: jsonb('metadata').default({}).notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
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
// CMS COLLECTIONS - Structured content models and records
// ==========================================================================

/**
 * Content collections - dynamic CMS data models similar to Wix CMS collections.
 */
export const contentCollections = pgTable('content_collections', {
    id: uuid('id').defaultRandom().primaryKey(),
    siteId: uuid('site_id')
        .references(() => sites.id, { onDelete: 'cascade' })
        .notNull(),

    name: text('name').notNull(),
    slug: text('slug').notNull(),
    routePattern: text('route_pattern'),
    listRoutePattern: text('list_route_pattern'),
    description: text('description'),

    status: text('status').$type<PublishStatus>().default('draft').notNull(),
    fields: jsonb('fields').default([]).notNull(),
    permissions: jsonb('permissions').default({
        publicRead: true,
        publicCreate: false,
        publicUpdate: false,
        publicDelete: false,
    }).notNull(),
    metadata: jsonb('metadata').default({}).notNull(),

    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => ({
    siteSlugIdx: uniqueIndex('content_collections_site_slug_idx').on(table.siteId, table.slug),
    siteStatusUpdatedIdx: index('content_collections_site_status_updated_idx').on(table.siteId, table.status, table.updatedAt),
    siteRouteIdx: index('content_collections_site_route_idx').on(table.siteId, table.routePattern, table.listRoutePattern),
}));

/**
 * Content collection records - structured entries for dynamic pages and public APIs.
 */
export const contentCollectionRecords = pgTable('content_collection_records', {
    id: uuid('id').defaultRandom().primaryKey(),
    siteId: uuid('site_id')
        .references(() => sites.id, { onDelete: 'cascade' })
        .notNull(),
    collectionId: uuid('collection_id')
        .references(() => contentCollections.id, { onDelete: 'cascade' })
        .notNull(),

    slug: text('slug').notNull(),
    status: text('status').$type<PublishStatus>().default('draft').notNull(),
    values: jsonb('values').default({}).notNull(),

    publishedAt: timestamp('published_at'),
    scheduledAt: timestamp('scheduled_at'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => ({
    siteCollectionStatusUpdatedIdx: index('content_collection_records_site_collection_status_updated_idx').on(
        table.siteId,
        table.collectionId,
        table.status,
        table.updatedAt,
    ),
    siteCollectionSlugIdx: uniqueIndex('content_collection_records_site_collection_slug_idx').on(table.siteId, table.collectionId, table.slug),
    valuesGinIdx: index('idx_content_collection_records_values_gin').on(table.values).using(sql`gin`),
    publicUpdatedIdx: index('content_collection_records_public_updated_idx')
        .on(table.siteId, table.collectionId, table.updatedAt)
        .where(sql`${table.status} = 'published'`),
}));

// ==========================================================================
// FORMS - Public interaction definitions, submissions, and contacts
// ==========================================================================

/**
 * Form definitions - public forms that can be embedded on pages/posts or custom frontends.
 */
export const formDefinitions = pgTable('form_definitions', {
    id: uuid('id').defaultRandom().primaryKey(),
    siteId: uuid('site_id')
        .references(() => sites.id, { onDelete: 'cascade' })
        .notNull(),

    pageId: uuid('page_id').references(() => pages.id, { onDelete: 'set null' }),
    postId: uuid('post_id').references(() => blogPosts.id, { onDelete: 'set null' }),
    name: text('name').notNull(),
    title: text('title'),
    description: text('description'),
    audience: text('audience').default('public').notNull(),
    isActive: boolean('is_active').default(true).notNull(),
    fields: jsonb('fields').default([]).notNull(),
    notificationEmail: text('notification_email'),
    notificationWebhook: text('notification_webhook'),
    successRedirectUrl: text('success_redirect_url'),
    successMessage: text('success_message'),
    enableHoneypot: boolean('enable_honeypot').default(true).notNull(),
    enableCaptcha: boolean('enable_captcha').default(false).notNull(),
    moderationMode: text('moderation_mode').default('manual').notNull(),
    contactShare: jsonb('contact_share').default({}),
    collectionTarget: jsonb('collection_target').default({}),
    settings: jsonb('settings').default({}).notNull(),
    createdBy: uuid('created_by').references(() => profiles.id),
    updatedBy: uuid('updated_by').references(() => profiles.id),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => ({
    siteActiveUpdatedIdx: index('form_definitions_site_active_updated_idx').on(table.siteId, table.isActive, table.updatedAt),
    sitePageUpdatedIdx: index('form_definitions_site_page_updated_idx').on(table.siteId, table.pageId, table.updatedAt),
    sitePostUpdatedIdx: index('form_definitions_site_post_updated_idx').on(table.siteId, table.postId, table.updatedAt),
}));

/**
 * Form submissions - captured public interaction payloads.
 */
export const formSubmissions = pgTable('form_submissions', {
    id: uuid('id').defaultRandom().primaryKey(),
    siteId: uuid('site_id')
        .references(() => sites.id, { onDelete: 'cascade' })
        .notNull(),
    formId: uuid('form_id')
        .references(() => formDefinitions.id, { onDelete: 'cascade' })
        .notNull(),
    pageId: uuid('page_id').references(() => pages.id, { onDelete: 'set null' }),
    postId: uuid('post_id').references(() => blogPosts.id, { onDelete: 'set null' }),
    values: jsonb('values').default({}).notNull(),
    ipHash: text('ip_hash'),
    userAgent: text('user_agent'),
    requestId: text('request_id'),
    status: text('status').default('pending').notNull(),
    reviewedBy: text('reviewed_by'),
    reviewedAt: timestamp('reviewed_at'),
    adminNotes: text('admin_notes'),
    collectionRecord: jsonb('collection_record'),
    collectionRecordErrors: jsonb('collection_record_errors').default([]),
    submittedAt: timestamp('submitted_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => ({
    siteFormSubmittedIdx: index('form_submissions_site_form_submitted_idx').on(table.siteId, table.formId, table.submittedAt),
    siteFormStatusSubmittedIdx: index('form_submissions_site_form_status_submitted_idx').on(table.siteId, table.formId, table.status, table.submittedAt),
    siteRequestIdx: index('form_submissions_site_request_idx').on(table.siteId, table.requestId),
    siteStatusUpdatedIdx: index('form_submissions_site_status_updated_idx').on(table.siteId, table.status, table.updatedAt),
}));

/**
 * Form contacts - CRM-style leads derived from accepted submissions.
 */
export const formContacts = pgTable('form_contacts', {
    id: uuid('id').defaultRandom().primaryKey(),
    siteId: uuid('site_id')
        .references(() => sites.id, { onDelete: 'cascade' })
        .notNull(),
    formId: uuid('form_id')
        .references(() => formDefinitions.id, { onDelete: 'cascade' })
        .notNull(),
    pageId: uuid('page_id').references(() => pages.id, { onDelete: 'set null' }),
    postId: uuid('post_id').references(() => blogPosts.id, { onDelete: 'set null' }),
    name: text('name'),
    email: text('email'),
    phone: text('phone'),
    notes: text('notes'),
    sourceValues: jsonb('source_values').default({}),
    newsletterSubscriptionStatus: text('newsletter_subscription_status'),
    newsletterSubscribedAt: timestamp('newsletter_subscribed_at'),
    newsletterUnsubscribedAt: timestamp('newsletter_unsubscribed_at'),
    newsletterTopics: text('newsletter_topics'),
    newsletterSource: text('newsletter_source'),
    newsletterConsent: boolean('newsletter_consent'),
    newsletterConsentText: text('newsletter_consent_text'),
    status: text('status').default('new').notNull(),
    sourceSubmissionId: uuid('source_submission_id').references(() => formSubmissions.id, { onDelete: 'set null' }),
    requestId: text('request_id'),
    sourceIpHash: text('source_ip_hash'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => ({
    siteFormUpdatedIdx: index('form_contacts_site_form_updated_idx').on(table.siteId, table.formId, table.updatedAt),
    siteFormStatusUpdatedIdx: index('form_contacts_site_form_status_updated_idx').on(table.siteId, table.formId, table.status, table.updatedAt),
    siteNewsletterStatusUpdatedIdx: index('form_contacts_site_newsletter_status_updated_idx').on(table.siteId, table.newsletterSubscriptionStatus, table.updatedAt),
    siteRequestIdx: index('form_contacts_site_request_idx').on(table.siteId, table.requestId),
    siteEmailIdx: index('form_contacts_site_email_idx').on(table.siteId, table.email),
}));

// ==========================================================================
// PLATFORM SETTINGS - Runtime/admin configuration
// ==========================================================================

/**
 * Platform settings - singleton-style configuration for delivery mode and integrations.
 */
export const platformSettings = pgTable('platform_settings', {
    id: text('id').primaryKey(),
    deliveryMode: text('delivery_mode').default('managed-hosting').notNull(),
    apiKeys: jsonb('api_keys').default({}).notNull(),
    storage: jsonb('storage').default({}).notNull(),
    auth: jsonb('auth').default({}).notNull(),
    integrations: jsonb('integrations').default({}).notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// ==========================================================================
// REUSABLE SECTIONS - Saved component/section templates
// ==========================================================================

/**
 * Reusable sections - saved page/editor component groups for reuse across pages.
 */
export const reusableSections = pgTable('reusable_sections', {
    id: uuid('id').defaultRandom().primaryKey(),
    siteId: uuid('site_id')
        .references(() => sites.id, { onDelete: 'cascade' })
        .notNull(),
    name: text('name').notNull(),
    slug: text('slug').notNull(),
    description: text('description'),
    category: text('category').default('general').notNull(),
    status: text('status').default('active').notNull(),
    tags: jsonb('tags').default([]).notNull(),
    content: jsonb('content').default({}).notNull(),
    metadata: jsonb('metadata').default({}).notNull(),
    sourceElementId: text('source_element_id'),
    createdBy: text('created_by'),
    updatedBy: text('updated_by'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => ({
    siteSlugIdx: uniqueIndex('reusable_sections_site_slug_idx').on(table.siteId, table.slug),
    siteStatusUpdatedIdx: index('reusable_sections_site_status_updated_idx').on(table.siteId, table.status, table.updatedAt),
    siteCategoryIdx: index('reusable_sections_site_category_idx').on(table.siteId, table.category),
}));

// ==========================================================================
// INTERACTIVE COMPONENT REGISTRY - Versioned page/blog runtime components
// ==========================================================================

/**
 * Interactive components - site-scoped trusted/custom component versions for
 * interactive figures, calculators, simulations, and sandboxed code blocks.
 */
export const interactiveComponents = pgTable('interactive_components', {
    id: uuid('id').defaultRandom().primaryKey(),
    siteId: uuid('site_id')
        .references(() => sites.id, { onDelete: 'cascade' })
        .notNull(),
    componentKey: text('component_key').notNull(),
    displayName: text('display_name').notNull(),
    type: text('type').default('codeComponent').notNull(),
    status: text('status').default('disabled').notNull(),
    reviewStatus: text('review_status').default('draft').notNull(),
    version: text('version').notNull(),
    renderMode: text('render_mode').default('sandbox-iframe').notNull(),
    source: text('source').default('custom').notNull(),
    description: text('description').default('').notNull(),
    allowedDataScopes: jsonb('allowed_data_scopes').default([]).notNull(),
    requiredFields: jsonb('required_fields').default([]).notNull(),
    controls: jsonb('controls').default([]).notNull(),
    fallback: jsonb('fallback').default({ required: true, supported: [] }).notNull(),
    security: jsonb('security').default({}).notNull(),
    integrity: jsonb('integrity').default({ signed: false, signatureRequiredForCustomCode: true }).notNull(),
    runtime: jsonb('runtime').default({}).notNull(),
    ownerId: text('owner_id'),
    dependencyMetadata: jsonb('dependency_metadata').default({}).notNull(),
    changelog: text('changelog'),
    rollbackFromVersion: text('rollback_from_version'),
    createdBy: text('created_by'),
    updatedBy: text('updated_by'),
    reviewedBy: text('reviewed_by'),
    reviewedAt: timestamp('reviewed_at'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => ({
    siteKeyVersionIdx: uniqueIndex('interactive_components_site_key_version_idx').on(table.siteId, table.componentKey, table.version),
    siteStatusIdx: index('interactive_components_site_status_idx').on(table.siteId, table.status),
    siteReviewStatusIdx: index('interactive_components_site_review_status_idx').on(table.siteId, table.reviewStatus),
}));

// ==========================================================================
// CONTENT WORKFLOWS - Revisions and preview tokens
// ==========================================================================

/**
 * Content revisions - immutable page/post snapshots for history and rollback.
 */
export const contentRevisions = pgTable('content_revisions', {
    id: uuid('id').defaultRandom().primaryKey(),
    siteId: uuid('site_id')
        .references(() => sites.id, { onDelete: 'cascade' })
        .notNull(),
    targetType: text('target_type').notNull(),
    targetId: text('target_id').notNull(),
    snapshot: jsonb('snapshot').default({}).notNull(),
    note: text('note'),
    parentRevisionId: text('parent_revision_id'),
    operation: text('operation'),
    restoreTargetRevisionId: text('restore_target_revision_id'),
    metadata: jsonb('metadata').default({}).notNull(),
    createdBy: text('created_by'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
});

/**
 * Preview tokens - short-lived access tokens for draft page/post preview.
 */
export const previewTokens = pgTable('preview_tokens', {
    token: text('token').primaryKey(),
    siteId: uuid('site_id')
        .references(() => sites.id, { onDelete: 'cascade' })
        .notNull(),
    targetType: text('target_type').notNull(),
    targetId: text('target_id').notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    expiresAt: timestamp('expires_at').notNull(),
    createdBy: text('created_by'),
});

// ==========================================================================
// COMMENTS - Public page/post discussions and moderation state
// ==========================================================================

/**
 * Comments - public page/post discussion threads with moderation metadata.
 */
export const comments = pgTable('comments', {
    id: uuid('id').defaultRandom().primaryKey(),
    siteId: uuid('site_id')
        .references(() => sites.id, { onDelete: 'cascade' })
        .notNull(),

    targetType: text('target_type').notNull(),
    targetId: text('target_id').notNull(),
    commentThreadId: text('comment_thread_id'),

    authorName: text('author_name'),
    authorEmail: text('author_email'),
    authorWebsite: text('author_website'),
    userId: text('user_id'),

    content: text('content').notNull(),
    status: text('status').default('pending').notNull(),
    parentId: text('parent_id'),

    reviewedBy: text('reviewed_by'),
    reviewedAt: timestamp('reviewed_at'),
    rejectionReason: text('rejection_reason'),
    blockReason: text('block_reason'),
    blockedBy: text('blocked_by'),
    blockedAt: timestamp('blocked_at'),
    reportCount: integer('report_count').default(0).notNull(),
    reportReasons: jsonb('report_reasons').default([]).notNull(),
    requestId: text('request_id'),
    ipHash: text('ip_hash'),

    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => ({
    siteTargetStatusIdx: index('comments_site_target_status_idx').on(table.siteId, table.targetType, table.targetId, table.status, table.createdAt),
    siteThreadIdx: index('comments_site_thread_idx').on(table.siteId, table.commentThreadId),
    siteStatusUpdatedIdx: index('comments_site_status_updated_idx').on(table.siteId, table.status, table.updatedAt),
    siteReportedIdx: index('comments_site_reported_idx').on(table.siteId, table.reportCount),
}));

/**
 * Comment blocklist entries - durable moderation blocks by email/IP hash.
 */
export const commentBlocklist = pgTable('comment_blocklist', {
    id: text('id').primaryKey(),
    siteId: uuid('site_id')
        .references(() => sites.id, { onDelete: 'cascade' })
        .notNull(),
    type: text('type').notNull(),
    value: text('value').notNull(),
    reason: text('reason').notNull(),
    actor: text('actor'),
    requestId: text('request_id'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
}, (table) => ({
    siteTypeValueIdx: uniqueIndex('comment_blocklist_site_type_value_idx').on(table.siteId, table.type, table.value),
    siteCreatedIdx: index('comment_blocklist_site_created_idx').on(table.siteId, table.createdAt),
}));

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
    userId: uuid('user_id').references(() => profiles.id, { onDelete: 'set null' }),
    action: text('action').notNull(),
    entityType: text('entity_type').notNull(),
    entityId: text('entity_id'),
    details: jsonb('details').default({}),
    ipAddress: text('ip_address'),
    userAgent: text('user_agent'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
});

/**
 * Cache invalidation events for public contract revisions and downstream CDN purges.
 */
export const cacheInvalidationEvents = pgTable('cache_invalidation_events', {
    id: uuid('id').defaultRandom().primaryKey(),
    siteId: uuid('site_id').references(() => sites.id, { onDelete: 'cascade' }),
    scope: text('scope').default('all').notNull(),
    entityType: text('entity_type').notNull(),
    entityId: text('entity_id'),
    reason: text('reason').notNull(),
    revision: text('revision').notNull(),
    metadata: jsonb('metadata').default({}).notNull(),
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
    mediaVersions: many(mediaVersions),
    collections: many(contentCollections),
    forms: many(formDefinitions),
    comments: many(comments),
    reusableSections: many(reusableSections),
    interactiveComponents: many(interactiveComponents),
    contentRevisions: many(contentRevisions),
    previewTokens: many(previewTokens),
    cacheInvalidationEvents: many(cacheInvalidationEvents),
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

export const mediaRelations = relations(media, ({ one, many }) => ({
    site: one(sites, {
        fields: [media.siteId],
        references: [sites.id],
    }),
    versions: many(mediaVersions),
}));

export const mediaVersionsRelations = relations(mediaVersions, ({ one }) => ({
    site: one(sites, {
        fields: [mediaVersions.siteId],
        references: [sites.id],
    }),
    media: one(media, {
        fields: [mediaVersions.mediaId],
        references: [media.id],
    }),
}));

export const cacheInvalidationEventsRelations = relations(cacheInvalidationEvents, ({ one }) => ({
    site: one(sites, {
        fields: [cacheInvalidationEvents.siteId],
        references: [sites.id],
    }),
}));

export const contentCollectionsRelations = relations(contentCollections, ({ one, many }) => ({
    site: one(sites, {
        fields: [contentCollections.siteId],
        references: [sites.id],
    }),
    records: many(contentCollectionRecords),
}));

export const contentCollectionRecordsRelations = relations(contentCollectionRecords, ({ one }) => ({
    site: one(sites, {
        fields: [contentCollectionRecords.siteId],
        references: [sites.id],
    }),
    collection: one(contentCollections, {
        fields: [contentCollectionRecords.collectionId],
        references: [contentCollections.id],
    }),
}));

export const formDefinitionsRelations = relations(formDefinitions, ({ one, many }) => ({
    site: one(sites, {
        fields: [formDefinitions.siteId],
        references: [sites.id],
    }),
    submissions: many(formSubmissions),
    contacts: many(formContacts),
}));

export const formSubmissionsRelations = relations(formSubmissions, ({ one }) => ({
    site: one(sites, {
        fields: [formSubmissions.siteId],
        references: [sites.id],
    }),
    form: one(formDefinitions, {
        fields: [formSubmissions.formId],
        references: [formDefinitions.id],
    }),
}));

export const formContactsRelations = relations(formContacts, ({ one }) => ({
    site: one(sites, {
        fields: [formContacts.siteId],
        references: [sites.id],
    }),
    form: one(formDefinitions, {
        fields: [formContacts.formId],
        references: [formDefinitions.id],
    }),
}));

export const commentsRelations = relations(comments, ({ one }) => ({
    site: one(sites, {
        fields: [comments.siteId],
        references: [sites.id],
    }),
}));

export const commentBlocklistRelations = relations(commentBlocklist, ({ one }) => ({
    site: one(sites, {
        fields: [commentBlocklist.siteId],
        references: [sites.id],
    }),
}));

export const reusableSectionsRelations = relations(reusableSections, ({ one }) => ({
    site: one(sites, {
        fields: [reusableSections.siteId],
        references: [sites.id],
    }),
}));

export const interactiveComponentsRelations = relations(interactiveComponents, ({ one }) => ({
    site: one(sites, {
        fields: [interactiveComponents.siteId],
        references: [sites.id],
    }),
}));

export const contentRevisionsRelations = relations(contentRevisions, ({ one }) => ({
    site: one(sites, {
        fields: [contentRevisions.siteId],
        references: [sites.id],
    }),
}));

export const previewTokensRelations = relations(previewTokens, ({ one }) => ({
    site: one(sites, {
        fields: [previewTokens.siteId],
        references: [sites.id],
    }),
}));
