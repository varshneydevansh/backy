/**
 * ============================================================================
 * SCYTHIAN CMS - CORE TYPES
 * ============================================================================
 *
 * This module contains all the core type definitions used throughout the CMS.
 * These types represent the data models for users, sites, pages, media, etc.
 *
 * @module CoreTypes
 * @author Scythian CMS Team (Built by Kimi 2.5)
 * @license MIT
 */

// ============================================
// USER & AUTHENTICATION TYPES
// ============================================

/**
 * User roles define what actions a user can perform in the system.
 *
 * - **admin**: Full access to everything including user management
 * - **editor**: Can create/edit content but cannot manage users or settings
 * - **viewer**: Read-only access for reviewing content
 */
export type UserRole = 'admin' | 'editor' | 'viewer';

/**
 * Extended user profile that supplements Supabase Auth's auth.users table.
 *
 * We extend the built-in auth system to add CMS-specific fields like
 * avatar, role, and team associations.
 */
export interface Profile {
  /** Unique identifier (matches auth.users.id) */
  id: string;

  /** User's email address */
  email: string;

  /** Display name for the user */
  fullName: string | null;

  /** URL to user's avatar image */
  avatarUrl: string | null;

  /** User's role in the system */
  role: UserRole;

  /** Whether the account is active */
  isActive: boolean;

  /** When the profile was created */
  createdAt: string;

  /** When the profile was last updated */
  updatedAt: string;
}

/**
 * Team/Organization for multi-tenancy support.
 *
 * Each team can have multiple sites and multiple members.
 * This allows agencies or companies to manage multiple projects.
 */
export interface Team {
  /** Unique identifier */
  id: string;

  /** Team name */
  name: string;

  /** URL-friendly identifier */
  slug: string;

  /** Team owner (usually who created it) */
  ownerId: string;

  /** Team-specific settings */
  settings: TeamSettings;

  /** When the team was created */
  createdAt: string;
}

/**
 * Settings specific to a team
 */
export interface TeamSettings {
  /** Default theme for new sites */
  defaultTheme?: Partial<ThemeConfig>;

  /** Allowed domains for custom domain mapping */
  allowedDomains?: string[];

  /** Billing/plan information */
  plan?: 'free' | 'pro' | 'enterprise';
}

/**
 * Maps users to teams with their specific role in that team.
 *
 * A user can be in multiple teams with different roles in each.
 */
export interface TeamMember {
  id: string;
  teamId: string;
  userId: string;
  role: UserRole;
  joinedAt: string;
}

// ============================================
// SITE & DOMAIN TYPES
// ============================================

/**
 * Status of a custom domain's configuration
 */
export type DomainStatus = 'pending' | 'active' | 'error' | 'expired';

/**
 * SSL certificate status for custom domains
 */
export type SSLStatus = 'pending' | 'active' | 'error' | 'expired';

/**
 * A Site is the main container for all content.
 *
 * Each site gets:
 * - A subdomain (site-name.scythian-cms.com)
 * - Optional custom domain (example.com)
 * - Its own pages, blog, media, and settings
 */
export interface Site {
  /** Unique identifier */
  id: string;

  /** Team that owns this site */
  teamId: string;

  /** Site name (displayed in admin) */
  name: string;

  /** Subdomain slug (site-name.scythian-cms.com) */
  slug: string;

  /** Site description */
  description: string | null;

  // --- Domain Settings ---

  /** Custom domain (if configured) */
  customDomain: string | null;

  /** Current status of domain configuration */
  domainStatus: DomainStatus;

  /** Whether SSL is enabled for custom domain */
  sslEnabled: boolean;

  // --- Theme & Styling ---

  /** Site-wide theme configuration */
  theme: ThemeConfig;

  // --- Global Settings ---

  /** SEO, analytics, and other global settings */
  settings: SiteSettings;

  // --- Publishing ---

  /** Whether the site is published */
  isPublished: boolean;

  /** When the site was last published */
  publishedAt: string | null;

  /** When the site was created */
  createdAt: string;

  /** When the site was last updated */
  updatedAt: string;
}

/**
 * Theme configuration for a site.
 *
 * This controls the visual appearance including colors, fonts,
 * spacing, and custom CSS.
 */
export interface ThemeConfig {
  /** Color palette */
  colors: {
    /** Primary brand color */
    primary?: string;
    /** Secondary accent color */
    secondary?: string;
    /** Background colors */
    background?: string;
    surface?: string;
    /** Text colors */
    text?: string;
    textMuted?: string;
    /** Status colors */
    success?: string;
    warning?: string;
    error?: string;
    /** Custom colors can be added */
    [key: string]: string | undefined;
  };

  /** Typography settings */
  fonts: {
    /** Primary font family */
    heading?: string;
    /** Body text font family */
    body?: string;
    /** Monospace font for code */
    mono?: string;
    /** Custom font imports */
    custom?: Array<{
      name: string;
      url: string;
    }>;
  };

  /** Spacing scale */
  spacing: {
    /** Base unit (default: 4px) */
    unit?: number;
    /** Scale multiplier */
    scale?: number;
  };

  /** Custom CSS that applies to entire site */
  customCSS: string;
}

/**
 * Global settings for a site
 */
export interface SiteSettings {
  /** SEO defaults */
  seo: {
    /** Default page title suffix */
    titleTemplate?: string;
    /** Default meta description */
    defaultDescription?: string;
    /** Default Open Graph image */
    defaultOgImage?: string;
    /** Favicon URL */
    favicon?: string;
  };

  /** Analytics configuration */
  analytics: {
    /** Google Analytics ID */
    googleAnalyticsId?: string;
    /** Plausible Analytics domain */
    plausibleDomain?: string;
    /** Custom tracking script */
    customScript?: string;
  };

  /** Social media links */
  social: {
    twitter?: string;
    facebook?: string;
    instagram?: string;
    linkedin?: string;
    github?: string;
    [key: string]: string | undefined;
  };
}

// ============================================
// PAGE TYPES
// ============================================

/**
 * Publishing status for pages and posts
 */
export type PublishStatus = 'draft' | 'published' | 'scheduled' | 'archived';

/**
 * A Page represents a single page on a website.
 *
 * Pages use the visual editor (Webstudio format) for content
 * and can be organized hierarchically with parent/child relationships.
 */
export interface Page {
  /** Unique identifier */
  id: string;

  /** Site this page belongs to */
  siteId: string;

  // --- Page Info ---

  /** Page title (shown in browser tab) */
  title: string;

  /** URL slug (e.g., "about" becomes /about) */
  slug: string;

  /** Meta description for SEO */
  description: string | null;

  // --- Content ---

  /**
   * Page content in Webstudio format.
   *
   * This is a JSON structure containing:
   * - root: The root node ID
   * - nodes: Map of all canvas nodes
   * - styles: Applied styles
   */
  content: PageContent;

  // --- SEO Settings ---

  /** Page-specific SEO metadata */
  meta: PageMeta;

  // --- Publishing ---

  /** Current publish status */
  status: PublishStatus;

  /** When the page was published */
  publishedAt: string | null;

  /** When the page is scheduled to publish */
  scheduledAt: string | null;

  // --- Hierarchy ---

  /** Whether this is the homepage */
  isHomepage: boolean;

  /** Parent page (for nested pages) */
  parentId: string | null;

  /** Sort order among siblings */
  sortOrder: number;

  // --- Tracking ---

  /** Who created this page */
  createdBy: string | null;

  /** Who last updated this page */
  updatedBy: string | null;

  /** When the page was created */
  createdAt: string;

  /** When the page was last updated */
  updatedAt: string;
}

/**
 * Page content structure (Webstudio format)
 */
export interface PageContent {
  /** Root node ID */
  root: string;

  /** All nodes in the page */
  nodes: Record<string, CanvasNode>;

  /** Global styles for this page */
  styles: Record<string, unknown>;
}

/**
 * A node in the visual editor canvas.
 *
 * Each node represents an element (div, text, image, etc.)
 * with its properties, styles, and children.
 */
export interface CanvasNode {
  /** Unique node ID */
  id: string;

  /** Component type (e.g., 'Box', 'Text', 'Image') */
  type: string;

  /** Component properties */
  props: Record<string, unknown>;

  /** Applied styles */
  style: React.CSSProperties;

  /** Child node IDs */
  children: string[];

  /** Parent node ID (null for root) */
  parent: string | null;

  /** Position configuration for absolute/fixed positioning */
  position?: {
    type: 'static' | 'relative' | 'absolute' | 'fixed' | 'sticky';
    top?: number;
    left?: number;
    right?: number;
    bottom?: number;
    zIndex?: number;
  };
}

/**
 * Page-specific SEO metadata
 */
export interface PageMeta {
  /** Override page title */
  title?: string;

  /** Override meta description */
  description?: string;

  /** Keywords for SEO */
  keywords?: string[];

  /** Open Graph image URL */
  ogImage?: string;

  /** Canonical URL override */
  canonical?: string;

  /** Whether to exclude from search engines */
  noIndex?: boolean;

  /** Whether to exclude links from search engines */
  noFollow?: boolean;
}

/**
 * Page version for content history
 */
export interface PageVersion {
  id: string;
  pageId: string;
  content: PageContent;
  createdBy: string | null;
  createdAt: string;
  note: string | null;
}

// ============================================
// BLOG TYPES
// ============================================

/**
 * Content format for blog posts
 */
export type ContentFormat = 'editor' | 'markdown' | 'html';

/**
 * A BlogPost represents a single blog article.
 *
 * Posts can use different content formats (visual editor, markdown, or HTML)
 * and support categories, tags, and scheduling.
 */
export interface BlogPost {
  /** Unique identifier */
  id: string;

  /** Site this post belongs to */
  siteId: string;

  // --- Post Info ---

  /** Post title */
  title: string;

  /** URL slug */
  slug: string;

  /** Short excerpt/summary */
  excerpt: string | null;

  // --- Content ---

  /** Post content */
  content: unknown; // Editor JSON, Markdown string, or HTML

  /** Format of the content */
  contentFormat: ContentFormat;

  // --- Featured Image ---

  /** Featured image for the post */
  featuredImageId: string | null;

  // --- Categories & Tags ---

  /** Category IDs */
  categoryIds: string[];

  /** Tag IDs */
  tagIds: string[];

  // --- Author ---

  /** Post author */
  authorId: string | null;

  // --- Publishing ---

  /** Publish status */
  status: PublishStatus;

  /** When published */
  publishedAt: string | null;

  /** When scheduled to publish */
  scheduledAt: string | null;

  // --- SEO ---

  /** Post-specific SEO */
  meta: PageMeta;

  // --- Stats ---

  /** View count */
  viewCount: number;

  // --- Tracking ---

  createdAt: string;
  updatedAt: string;
}

/**
 * Blog category for organizing posts
 */
export interface BlogCategory {
  id: string;
  siteId: string;
  name: string;
  slug: string;
  description: string | null;
  sortOrder: number;
  createdAt: string;
}

/**
 * Blog tag for organizing posts
 */
export interface BlogTag {
  id: string;
  siteId: string;
  name: string;
  slug: string;
  createdAt: string;
}

// ============================================
// MEDIA TYPES
// ============================================

/**
 * Media file types we support
 */
export type MediaType = 'image' | 'video' | 'audio' | 'document' | 'other';

/**
 * A MediaItem represents a file in the media library.
 *
 * Media can be organized by tags and folders, and we track
 * which pages use each media file for easy management.
 */
export interface MediaItem {
  /** Unique identifier */
  id: string;

  /** Site this media belongs to */
  siteId: string;

  // --- File Info ---

  /** Stored filename */
  filename: string;

  /** Original filename from upload */
  originalName: string;

  /** MIME type */
  mimeType: string;

  /** File size in bytes */
  sizeBytes: number;

  /** Media type category */
  type: MediaType;

  // --- URLs ---

  /** Public URL to access the file */
  url: string;

  /** Thumbnail URL (for images/videos) */
  thumbnailUrl: string | null;

  // --- Organization ---

  /** Folder ID (null for root) */
  folderId: string | null;

  /** Page IDs that use this media */
  pageIds: string[];

  /** Post IDs that use this media */
  postIds: string[];

  /** User-defined tags */
  tags: string[];

  // --- Metadata ---

  /** File-specific metadata (dimensions, duration, etc.) */
  metadata: MediaMetadata;

  /** Alt text for accessibility */
  altText: string | null;

  /** Caption/description */
  caption: string | null;

  // --- Tracking ---

  /** Who uploaded the file */
  uploadedBy: string | null;

  /** Upload scope: global(site-wide), page-bound, or post-bound */
  scope?: MediaScope;

  /** Optional owning target for scoped media (`scope === 'page' | 'post'`) */
  scopeTargetId?: string | null;

  /** Visibility used by renderer and API policy */
  visibility?: MediaVisibility;

  createdAt: string;
  updatedAt: string;
}

/**
 * Media scope for usage isolation.
 */
export type MediaScope = 'global' | 'page' | 'post';

/**
 * Media visibility for internal/public access policy.
 */
export type MediaVisibility = 'public' | 'private';

/**
 * Optional media binding record for explicit reuse context.
 */
export interface MediaBinding {
  /** Unique identifier */
  id: string;

  /** Media file */
  mediaId: string;

  /** Binding context */
  scope: MediaScope;

  /** Target ID for page/post scopes */
  targetId: string | null;

  /** How the media is used in context */
  usageType: MediaUsageType;

  /** Optional order for gallery-type usages */
  sortOrder?: number | null;

  /** Binding owner */
  attachedBy: string | null;

  createdAt: string;
  updatedAt: string;
}

/** Supported usage categories for media in canvas and rich components */
export type MediaUsageType =
  | 'content'
  | 'background'
  | 'thumbnail'
  | 'cover'
  | 'avatar'
  | 'document'
  | 'icon'
  | 'other';

/**
 * Media metadata varies by file type
 */
export interface MediaMetadata {
  /** For images: width in pixels */
  width?: number;

  /** For images: height in pixels */
  height?: number;

  /** For videos/audio: duration in seconds */
  duration?: number;

  /** File extension */
  extension?: string;

  /** Additional metadata */
  [key: string]: unknown;
}

/**
 * Folder for organizing media
 */
export interface MediaFolder {
  id: string;
  siteId: string;
  parentId: string | null;
  name: string;
  sortOrder: number;
  createdAt: string;
}

/**
 * Form field types for frontend embeddable forms.
 */
export type FormFieldType =
  | 'text'
  | 'email'
  | 'number'
  | 'textarea'
  | 'select'
  | 'checkbox'
  | 'radio'
  | 'date'
  | 'tel'
  | 'url'
  | 'file';

/**
 * Validation rule for a specific form field.
 */
export interface FormValidationRule {
  /** Rule kind */
  type: 'required' | 'minLength' | 'maxLength' | 'pattern' | 'min' | 'max';

  /** Value used by the rule (string/number) */
  value?: string | number;

  /** Human-readable error message */
  message: string;
}

/**
 * Form block field definition stored in page/blog editor state.
 */
export interface FormFieldDefinition {
  /** Stable field key */
  key: string;

  /** Human label */
  label: string;

  /** Input type */
  type: FormFieldType;

  /** Input placeholder */
  placeholder?: string;

  /** Help text for editors */
  helpText?: string;

  /** Default form value */
  defaultValue?: string;

  /** Pre-defined options for select/radio/checkbox */
  options?: string[];

  /** Validation rules */
  validation?: FormValidationRule[];

  /** Whether value is required */
  required?: boolean;
}

/** Form access model used by page renderer and admin config. */
export type FormAudience = 'public' | 'authenticated' | 'adminOnly';

/** Form definition tied to a site/page/post/editor block */
export interface FormDefinition {
  /** Unique identifier */
  id: string;

  /** Owning site */
  siteId: string;

  /** Optional binding to page */
  pageId?: string | null;

  /** Optional binding to post */
  postId?: string | null;

  /** Form metadata */
  name: string;
  title?: string | null;
  description?: string | null;

  /** Who can submit */
  audience: FormAudience;

  /** Whether this form is currently collecting submissions */
  isActive: boolean;

  /** Form fields */
  fields: FormFieldDefinition[];

  /** Notification target for new submissions */
  notificationEmail?: string | null;

  /** Redirect URL after successful submit */
  successRedirectUrl?: string | null;

  /** Success message */
  successMessage?: string | null;

  /** Spam guard toggles */
  enableHoneypot?: boolean;
  enableCaptcha?: boolean;

  /** Who can access this form config */
  createdBy?: string | null;
  updatedBy?: string | null;
  createdAt: string;
  updatedAt: string;
}

/** Submission payload received from frontend */
export interface FormSubmission {
  /** Submission identifier */
  id: string;

  /** Target form and owner */
  formId: string;
  siteId: string;
  pageId?: string | null;
  postId?: string | null;

  /** Submitted values keyed by form field key */
  values: Record<string, unknown>;

  /** Device/client metadata */
  ipHash?: string | null;
  userAgent?: string | null;
  requestId?: string | null;

  /** Tracking and moderation */
  status: 'pending' | 'approved' | 'rejected' | 'spam';
  reviewedBy?: string | null;
  reviewedAt?: string | null;

  submittedAt: string;
}

/** Comment status */
export type CommentStatus = 'pending' | 'approved' | 'rejected' | 'spam';

/** Comment target entity types */
export type CommentTargetType = 'page' | 'post';

/** Standardized public comment payload */
export interface Comment {
  /** Unique identifier */
  id: string;

  /** Owner site */
  siteId: string;

  /** Comment target */
  targetType: CommentTargetType;
  targetId: string;

  /** Author identity */
  authorName?: string | null;
  authorEmail?: string | null;
  authorWebsite?: string | null;
  userId?: string | null;

  /** Text + moderation state */
  content: string;
  status: CommentStatus;

  /** Threading support */
  parentId?: string | null;

  /** Moderation context */
  reviewedBy?: string | null;
  reviewedAt?: string | null;
  rejectionReason?: string | null;

  /** Timestamps */
  createdAt: string;
  updatedAt: string;
}

/** Commenting policy for page/blog render payload */
export interface CommentPolicy {
  enabled: boolean;
  allowGuests: boolean;
  requireName?: boolean;
  requireEmail?: boolean;
  allowReplies?: boolean;
  moderationRequired?: boolean;
  maxDepth?: number;
}

/**
 * Public rendering payload for one page/post view.
 */
export interface PublicContentPayload<TContent> {
  siteId: string;
  slug: string;
  path: string;
  content: TContent;
  themeTokens: {
    colors?: Record<string, string>;
    fonts?: {
      heading?: string;
      body?: string;
      mono?: string;
      [key: string]: string | undefined;
    };
    spacing?: {
      unit?: number;
      scale?: number;
    };
    customCSS?: string;
    [key: string]: unknown;
  };
  meta: {
    title: string;
    description?: string | null;
    keywords?: string[];
    ogImage?: string | null;
    canonical?: string | null;
    noIndex?: boolean;
    noFollow?: boolean;
  };
  assets: {
    media: MediaItem[];
    forms?: FormDefinition[];
  };
  comments?: {
    enabled: boolean;
    count: number;
    policy: CommentPolicy;
  };
  version?: string;
  publishedAt?: string | null;
}

/** Canonical interaction payload envelope for public/frontend-facing APIs */
export interface FrontendApiEnvelope<T> extends ApiResponse<T> {
  requestId: string;
}

/**
 * Junction table for media-page relationships
 */
export interface MediaPage {
  id: string;
  mediaId: string;
  pageId: string;
  /** How the media is used (content, background, thumbnail, etc.) */
  usageType: string;
  createdAt: string;
}

// ============================================
// DOMAIN & LINK TYPES
// ============================================

/**
 * Custom domain mapping for external sites
 */
export interface DomainMapping {
  id: string;
  siteId: string;

  /** Domain without subdomain (example.com) */
  domain: string;

  /** Subdomain (www, blog, etc.) */
  subdomain: string | null;

  /** Full domain (www.example.com) */
  fullDomain: string;

  // --- Verification ---

  /** DNS TXT record for verification */
  verificationRecord: string;

  /** Whether domain is verified */
  isVerified: boolean;

  /** When verified */
  verifiedAt: string | null;

  // --- SSL ---

  /** SSL certificate status */
  sslStatus: SSLStatus;

  /** SSL certificate (encrypted) */
  sslCertificate: string | null;

  /** When SSL expires */
  sslExpiresAt: string | null;

  // --- Settings ---

  /** Force HTTPS redirect */
  forceHttps: boolean;

  /** Redirect rules */
  redirectRules: RedirectRule[];

  createdAt: string;
  updatedAt: string;
}

/**
 * Redirect rule for custom domains
 */
export interface RedirectRule {
  /** Source path pattern */
  from: string;

  /** Target path or URL */
  to: string;

  /** Whether this is a permanent (301) redirect */
  permanent: boolean;
}

/**
 * Type of link target
 */
export type LinkTargetType = 'page' | 'post' | 'url' | 'file';

/**
 * Custom link/redirect within a site
 */
export interface CustomLink {
  id: string;
  siteId: string;

  /** Source path (/old-page) */
  sourcePath: string;

  /** Type of target */
  targetType: LinkTargetType;

  /** Target page ID (if type is 'page') */
  targetPageId: string | null;

  /** Target post ID (if type is 'post') */
  targetPostId: string | null;

  /** External URL (if type is 'url') */
  targetUrl: string | null;

  /** Whether this is a permanent redirect */
  isPermanent: boolean;

  /** Open in new tab */
  openInNewTab: boolean;

  createdAt: string;
}

// ============================================
// ACTIVITY & ANALYTICS TYPES
// ============================================

/**
 * Types of activities that can be logged
 */
export type ActivityAction =
  | 'created'
  | 'updated'
  | 'deleted'
  | 'published'
  | 'unpublished'
  | 'login'
  | 'logout'
  | 'invite_sent';

/**
 * Types of entities that can have activities
 */
export type EntityType = 'site' | 'page' | 'post' | 'media' | 'user' | 'setting';

/**
 * Activity log entry
 */
export interface ActivityLog {
  id: string;
  siteId: string | null;
  userId: string | null;
  action: ActivityAction;
  entityType: EntityType;
  entityId: string | null;
  details: Record<string, unknown>;
  ipAddress: string | null;
  userAgent: string | null;
  createdAt: string;
}

/**
 * Page view for analytics
 */
export interface PageView {
  id: string;
  siteId: string;
  pageId: string | null;
  sessionId: string | null;
  referrer: string | null;
  path: string;
  country: string | null;
  deviceType: string | null;
  browser: string | null;
  createdAt: string;
}

// ============================================
// API RESPONSE TYPES
// ============================================

/**
 * Standard API response wrapper
 */
export interface ApiResponse<T> {
  /** Whether the request was successful */
  success: boolean;

  /** Response data */
  data?: T;

  /** Error information (if success is false) */
  error?: {
    code: string;
    message: string;
    details?: unknown;
  };

  /** Pagination info (for list endpoints) */
  pagination?: {
    page: number;
    perPage: number;
    total: number;
    totalPages: number;
  };
}

/**
 * Pagination parameters for list requests
 */
export interface PaginationParams {
  page?: number;
  perPage?: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

/**
 * Filter parameters for list requests
 */
export interface FilterParams {
  search?: string;
  status?: string;
  tags?: string[];
  dateFrom?: string;
  dateTo?: string;
  [key: string]: unknown;
}
