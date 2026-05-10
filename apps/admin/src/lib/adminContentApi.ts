import { useStore, type BlogPost, type Page, type Site, type User } from '@/stores/mockStore';
import type { CanvasElement, CanvasSize } from '@/types/editor';
import type {
  Comment,
  CommentStatus,
  CommentTargetType,
  Contact,
  SiteNavigationConfig,
  SiteNavigationLayoutConfig,
  SiteRedirectRule,
  SiteSettings,
} from '@backy-cms/core';

type AdminSiteStatus = 'draft' | 'published' | 'scheduled' | 'archived';

interface ApiSite {
  id: string;
  name: string;
  slug: string;
  description?: string | null;
  customDomain?: string | null;
  status?: AdminSiteStatus;
  isPublished?: boolean;
  updatedAt?: string;
  createdAt?: string;
}

interface ApiListSitesResponse {
  success: boolean;
  data?: {
    sites: ApiSite[];
  };
  error?: {
    message?: string;
  };
}

interface ApiSiteResponse {
  success: boolean;
  data?: {
    site: ApiSite;
  };
  error?: {
    message?: string;
  };
}

export interface AdminNavigationResolvedItem {
  id: string;
  type: 'page' | 'route' | 'url';
  label: string;
  title?: string;
  pageId?: string;
  slug?: string;
  path?: string;
  href?: string;
  target?: '_self' | '_blank';
  status?: string;
  isHomepage?: boolean;
  children: AdminNavigationResolvedItem[];
}

export interface AdminSiteNavigation {
  settings: SiteNavigationConfig;
  resolved: {
    primary: AdminNavigationResolvedItem[];
    footer: AdminNavigationResolvedItem[];
    layout: SiteNavigationLayoutConfig;
  };
}

interface ApiSiteNavigationResponse {
  success: boolean;
  data?: {
    site: Pick<ApiSite, 'id' | 'slug' | 'name'>;
    navigation: AdminSiteNavigation;
  };
  error?: {
    message?: string;
  };
}

export interface AdminSiteRedirects {
  rules: SiteRedirectRule[];
  conflicts?: AdminSiteRedirectConflict[];
  persisted?: boolean;
}

export interface AdminSiteRedirectConflict {
  index: number;
  ruleId?: string;
  from: string;
  to?: string;
  kind: 'source-route-conflict' | 'target-route-missing';
  severity: 'warning';
  message: string;
  route?: {
    type: 'page' | 'post' | 'dynamicList' | 'dynamicItem';
    id: string;
    path: string;
    title: string;
  };
}

interface ApiSiteRedirectsResponse {
  success: boolean;
  data?: {
    site: Pick<ApiSite, 'id' | 'slug' | 'name'>;
    redirects: AdminSiteRedirects;
  };
  error?: {
    message?: string;
  };
}

export type AdminSiteSeoSettings = SiteSettings['seo'];

export interface AdminSiteSeoPreviewRoute {
  type: 'dynamicList' | 'dynamicItem';
  title: string;
  description: string;
  canonical: string;
  sourceTitle: string;
  sourceDescription: string;
  variables: Record<string, string>;
}

export interface AdminSiteSeoPreview {
  supportedVariables: string[];
  routes: AdminSiteSeoPreviewRoute[];
}

export interface AdminSiteSeoCacheInvalidation {
  scope: string;
  reason: string;
  revision: string;
  createdAt: string;
}

interface ApiSiteSeoResponse {
  success: boolean;
  data?: {
    site: Pick<ApiSite, 'id' | 'slug' | 'name'>;
    seo: AdminSiteSeoSettings;
    preview?: AdminSiteSeoPreview;
    cacheInvalidation?: AdminSiteSeoCacheInvalidation;
  };
  error?: {
    message?: string;
  };
}

export interface ReadinessCheck {
  id: string;
  category: 'site' | 'page' | 'seo' | 'navigation' | 'content' | 'media' | 'layout';
  label: string;
  status: 'pass' | 'fail' | 'notice';
  severity: 'error' | 'warning' | 'info';
  message: string;
  target?: {
    type: 'site' | 'page' | 'post' | 'collection' | 'media' | 'section';
    id: string;
    label?: string;
  };
  details?: Record<string, unknown>;
}

export interface SiteReadiness {
  site: {
    id: string;
    slug: string;
    name: string;
    status: AdminSiteStatus;
    isPublished: boolean;
  };
  score: number;
  statusLabel: 'ready' | 'needs-attention' | 'blocked';
  summary: {
    errors: number;
    warnings: number;
    notices: number;
    totalChecks: number;
    passedChecks: number;
    pages: number;
    publishedPages: number;
    posts: number;
    collections: number;
    media: number;
    reusableSections: number;
  };
  checks: ReadinessCheck[];
  pages: Array<{
    id: string;
    title: string;
    slug: string;
    path: string;
    status: AdminSiteStatus;
    isHomepage: boolean;
    canvasSize: CanvasSize;
    elementCount: number;
    score: number;
    statusLabel: 'ready' | 'needs-attention' | 'blocked';
    checks: ReadinessCheck[];
  }>;
  posts: Array<{
    id: string;
    title: string;
    slug: string;
    path: string;
    status: AdminSiteStatus;
    canvasSize: CanvasSize | null;
    elementCount: number;
    hasLegacyContent: boolean;
    score: number;
    statusLabel: 'ready' | 'needs-attention' | 'blocked';
    checks: ReadinessCheck[];
  }>;
}

export type PageReadiness = SiteReadiness['pages'][number];
export type BlogPostReadiness = SiteReadiness['posts'][number];

interface ApiSiteReadinessResponse {
  success: boolean;
  data?: {
    readiness: SiteReadiness;
  };
  error?: {
    message?: string;
  };
}

interface ApiPageReadinessResponse {
  success: boolean;
  data?: {
    readiness: PageReadiness;
  };
  error?: {
    message?: string;
  };
}

interface ApiBlogPostReadinessResponse {
  success: boolean;
  data?: {
    readiness: BlogPostReadiness;
  };
  error?: {
    message?: string;
  };
}

interface ApiPage {
  id: string;
  siteId: string;
  title: string;
  slug: string;
  description?: string | null;
  isHomepage?: boolean;
  status?: AdminSiteStatus;
  scheduledAt?: string | null;
  content?: unknown;
  meta?: Record<string, unknown>;
  updatedAt?: string;
  createdAt?: string;
}

interface ApiListPagesResponse {
  success: boolean;
  data?: {
    pages: ApiPage[];
  };
  error?: {
    message?: string;
  };
}

interface ApiPageResponse {
  success: boolean;
  data?: {
    page: ApiPage;
  };
  error?: {
    message?: string;
  };
}

interface ApiRevision {
  id: string;
  siteId: string;
  targetType: 'page' | 'post';
  targetId: string;
  snapshot: ApiPage | ApiBlogPost;
  note: string | null;
  createdBy: string | null;
  createdAt: string;
}

interface ApiRevisionListResponse {
  success: boolean;
  data?: {
    revisions: ApiRevision[];
  };
  error?: {
    message?: string;
  };
}

interface ApiPreviewResponse {
  success: boolean;
  data?: {
    previewToken: string;
    expiresAt: string;
    targetType: 'page' | 'post';
    targetId: string;
    hostedUrl?: string;
    renderUrl?: string;
    pageApiUrl?: string;
    postApiUrl?: string;
  };
  error?: {
    message?: string;
  };
}

interface ApiDeleteResponse {
  success: boolean;
  data?: {
    deleted: boolean;
    siteId: string;
    userId?: string;
  };
  error?: {
    message?: string;
  };
}

interface ApiUser {
  id: string;
  fullName: string;
  email: string;
  role: User['role'];
  status: User['status'];
  createdAt?: string;
  updatedAt?: string;
  lastActiveAt?: string | null;
  invitedAt?: string | null;
}

interface ApiListUsersResponse {
  success: boolean;
  data?: {
    users: ApiUser[];
  };
  error?: {
    message?: string;
  };
}

interface ApiUserResponse {
  success: boolean;
  data?: {
    user: ApiUser;
  };
  error?: {
    message?: string;
  };
}

interface ApiBlogPost {
  id: string;
  siteId: string;
  title: string;
  slug: string;
  excerpt?: string | null;
  content?: unknown;
  status?: AdminSiteStatus;
  featuredImageId?: string | null;
  authorId?: string | null;
  meta?: Record<string, unknown>;
  categoryIds?: string[];
  tagIds?: string[];
  publishedAt?: string | null;
  scheduledAt?: string | null;
  updatedAt?: string;
  createdAt?: string;
}

interface ApiBlogCategory {
  id: string;
  siteId: string;
  name: string;
  slug: string;
  description?: string | null;
  color?: string | null;
  postCount?: number;
  updatedAt?: string;
  createdAt?: string;
}

interface ApiBlogTag {
  id: string;
  siteId: string;
  name: string;
  slug: string;
  description?: string | null;
  postCount?: number;
  updatedAt?: string;
  createdAt?: string;
}

interface ApiBlogAuthor {
  id: string;
  siteId: string;
  name: string;
  slug: string;
  role: User['role'] | 'contributor';
  status: User['status'] | 'external';
  postCount: number;
}

interface ApiListBlogResponse {
  success: boolean;
  data?: {
    posts: ApiBlogPost[];
  };
  error?: {
    message?: string;
  };
}

interface ApiListBlogCategoriesResponse {
  success: boolean;
  data?: {
    categories: ApiBlogCategory[];
  };
  error?: {
    message?: string;
  };
}

interface ApiBlogCategoryResponse {
  success: boolean;
  data?: {
    category: ApiBlogCategory;
  };
  error?: {
    message?: string;
  };
}

interface ApiListBlogTagsResponse {
  success: boolean;
  data?: {
    tags: ApiBlogTag[];
  };
  error?: {
    message?: string;
  };
}

interface ApiListBlogAuthorsResponse {
  success: boolean;
  data?: {
    authors: ApiBlogAuthor[];
  };
  error?: {
    message?: string;
  };
}

interface ApiBlogTagResponse {
  success: boolean;
  data?: {
    tag: ApiBlogTag;
  };
  error?: {
    message?: string;
  };
}

interface ApiBlogPostResponse {
  success: boolean;
  data?: {
    post: ApiBlogPost;
  };
  error?: {
    message?: string;
  };
}

interface ApiListFormsResponse {
  success: boolean;
  data?: {
    forms: FormDefinition[];
    total?: number;
    pagination?: FormSubmissionList['pagination'];
  };
  forms?: FormDefinition[];
  error?: {
    message?: string;
  };
}

interface ApiFormDetailResponse {
  success: boolean;
  data?: {
    form: FormDefinition;
    submissions?: FormSubmissionList;
  };
  form?: FormDefinition;
  submissions?: FormSubmissionList;
  error?: {
    message?: string;
  };
}

interface ApiFormSubmissionResponse {
  success: boolean;
  data?: {
    submission: FormSubmission;
  };
  submission?: FormSubmission;
  error?: {
    message?: string;
  };
}

interface ApiListContactsResponse {
  success: boolean;
  data?: {
    formId: string;
    contacts: Contact[];
    count: number;
    pagination?: ApiPagination;
  };
  contacts?: Contact[];
  count?: number;
  pagination?: ApiPagination;
  error?: {
    message?: string;
  };
}

interface ApiContactResponse {
  success: boolean;
  data?: {
    contact: Contact;
  };
  contact?: Contact;
  error?: {
    message?: string;
  };
}

interface ApiPagination {
  total: number;
  limit: number;
  offset: number;
  hasMore: boolean;
}

interface ApiListCommentsResponse {
  success: boolean;
  data?: {
    siteId: string;
    comments: Comment[];
    count: number;
    pagination?: ApiPagination;
  };
  comments?: Comment[];
  count?: number;
  pagination?: ApiPagination;
  error?: {
    message?: string;
  };
}

interface ApiUpdateCommentsResponse {
  success: boolean;
  data?: {
    siteId: string;
    updated: Comment[];
    updatedCount: number;
    missingIds: string[];
  };
  updated?: Comment[];
  updatedCount?: number;
  missingIds?: string[];
  error?: {
    message?: string;
  };
}

interface ApiSettings {
  deliveryMode: SiteSettingsInput['deliveryMode'];
  apiKeys: {
    publicApiKey: string;
    adminApiKey: string;
  };
  auth?: SiteSettingsInput['auth'];
  runtimeStorage?: SiteSettingsInput['runtimeStorage'];
  integrations?: SiteSettingsInput['integrations'];
  runtimeDatabase?: SiteSettingsInput['runtimeDatabase'];
  runtimeSupabase?: SiteSettingsInput['runtimeSupabase'];
  runtimeVercel?: SiteSettingsInput['runtimeVercel'];
  updatedAt?: string;
}

interface ApiSettingsResponse {
  success: boolean;
  data?: {
    settings: ApiSettings;
  };
  error?: {
    message?: string;
  };
}

export interface AdminAuditLog {
  id: string;
  siteId?: string | null;
  teamId?: string | null;
  actorId?: string | null;
  entity: string;
  entityId: string;
  action: string;
  before?: Record<string, unknown>;
  after?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
  requestId?: string;
  createdAt: string;
}

export interface AdminAuditLogListFilters {
  siteId?: string;
  teamId?: string;
  actorId?: string;
  entity?: string;
  entityId?: string;
  action?: string;
  requestId?: string;
  limit?: number;
  offset?: number;
}

export interface AdminAuditLogListResult {
  logs: AdminAuditLog[];
  pagination: ApiPagination;
}

interface ApiAdminAuditLogsResponse {
  success: boolean;
  data?: AdminAuditLogListResult;
  error?: {
    message?: string;
  };
}

type ApiCollectionFieldType =
  | 'text'
  | 'richText'
  | 'number'
  | 'boolean'
  | 'date'
  | 'datetime'
  | 'image'
  | 'video'
  | 'file'
  | 'reference'
  | 'multiReference'
  | 'select'
  | 'tags'
  | 'url'
  | 'email'
  | 'phone'
  | 'slug'
  | 'json';

interface ApiCollectionField {
  id?: string;
  key: string;
  label: string;
  type: ApiCollectionFieldType;
  required?: boolean;
  unique?: boolean;
  sortOrder?: number;
  helpText?: string | null;
  options?: string[];
  referenceCollectionId?: string | null;
  defaultValue?: unknown;
}

interface ApiCollection {
  id: string;
  siteId: string;
  name: string;
  slug: string;
  description?: string | null;
  status: 'draft' | 'published' | 'archived';
  fields: ApiCollectionField[];
  permissions: {
    publicRead: boolean;
    publicCreate: boolean;
    publicUpdate: boolean;
    publicDelete: boolean;
  };
  createdAt?: string;
  updatedAt?: string;
}

interface ApiCollectionRecord {
  id: string;
  siteId: string;
  collectionId: string;
  slug: string;
  status: AdminSiteStatus;
  values: Record<string, unknown>;
  createdAt?: string;
  updatedAt?: string;
  publishedAt?: string | null;
  scheduledAt?: string | null;
}

interface ApiPagination {
  total: number;
  limit: number;
  offset: number;
  hasMore: boolean;
}

interface ApiListCollectionsResponse {
  success: boolean;
  data?: {
    collections: ApiCollection[];
  };
  error?: {
    message?: string;
  };
}

interface ApiCollectionResponse {
  success: boolean;
  data?: {
    collection: ApiCollection;
  };
  error?: {
    message?: string;
    details?: unknown;
  };
}

interface ApiListCollectionRecordsResponse {
  success: boolean;
  data?: {
    collection: ApiCollection;
    records: ApiCollectionRecord[];
    pagination: ApiPagination;
  };
  error?: {
    message?: string;
  };
}

interface ApiCollectionRecordResponse {
  success: boolean;
  data?: {
    record: ApiCollectionRecord;
  };
  error?: {
    message?: string;
    details?: unknown;
  };
}

interface ApiBulkCollectionRecordsResponse {
  success: boolean;
  data?: {
    action: 'delete' | 'updateStatus';
    deleted: number;
    updated: number;
    skipped: number;
    records: ApiCollectionRecord[];
  };
  error?: {
    message?: string;
    details?: unknown;
  };
}

interface ApiImportCollectionRecordsResponse {
  success: boolean;
  data?: {
    collection: ApiCollection;
    records: ApiCollectionRecord[];
    import: CollectionRecordImportResult;
  };
  error?: {
    message?: string;
    details?: unknown;
  };
}

interface ApiReusableSectionContent {
  elements: CanvasElement[];
  canvasSize?: CanvasSize;
  customCSS?: string;
  customJS?: string;
}

interface ApiReusableSection {
  id: string;
  siteId: string;
  name: string;
  slug: string;
  description?: string | null;
  category: string;
  status: 'active' | 'archived';
  tags: string[];
  content: ApiReusableSectionContent;
  sourceElementId?: string | null;
  createdBy?: string | null;
  updatedBy?: string | null;
  createdAt?: string;
  updatedAt?: string;
}

interface ApiListReusableSectionsResponse {
  success: boolean;
  data?: {
    sections: ApiReusableSection[];
  };
  error?: {
    message?: string;
  };
}

interface ApiReusableSectionResponse {
  success: boolean;
  data?: {
    section: ApiReusableSection;
  };
  error?: {
    message?: string;
  };
}

export interface SiteCreateInput {
  name: string;
  slug: string;
  description?: string;
  customDomain?: string | null;
  status?: Site['status'];
}

export interface UserInput {
  fullName: string;
  email: string;
  role: User['role'];
  status?: User['status'];
}

export interface UserUpdateInput {
  fullName?: string;
  email?: string;
  role?: User['role'];
  status?: User['status'];
}

export interface SiteSettingsInput {
  deliveryMode: 'managed-hosting' | 'custom-frontend';
  apiKeys: {
    publicApiKey: string;
    adminApiKey: string;
  };
  auth?: {
    requireTwoFactor?: boolean;
    inviteOnly?: boolean;
    minPasswordLength?: number;
    sessionTimeoutMinutes?: number;
    allowedEmailDomains?: string;
  };
  integrations?: {
    general?: {
      siteName?: string;
      siteDescription?: string;
      timezone?: string;
    };
    appearance?: {
      primaryColor?: string;
      secondaryColor?: string;
      backgroundColor?: string;
      surfaceColor?: string;
      textColor?: string;
      mutedTextColor?: string;
      fontFamily?: string;
      headingFontFamily?: string;
      bodyFontFamily?: string;
      monoFontFamily?: string;
      baseFontSize?: number;
      radius?: number;
      spacingUnit?: number;
      motionPreset?: string;
    };
    seo?: {
      titleTemplate?: string;
      metaDescription?: string;
      keywords?: string;
      ogImageUrl?: string;
      analyticsId?: string;
    };
    supabase?: {
      projectUrl?: string;
      projectRef?: string;
      databaseEnabled?: boolean;
      storageEnabled?: boolean;
      authEnabled?: boolean;
    };
    storage?: {
      provider?: string;
      bucket?: string;
      publicBaseUrl?: string;
      pathPrefix?: string;
      privateFilesEnabled?: boolean;
      imageTransformsEnabled?: boolean;
    };
    vercel?: {
      projectId?: string;
      teamSlug?: string;
      productionDomain?: string;
      autoDeploy?: boolean;
      previewDeployments?: boolean;
    };
    notifications?: {
      email?: {
        newUser?: boolean;
        pagePublished?: boolean;
        formSubmission?: boolean;
        systemUpdates?: boolean;
      };
      inApp?: {
        comments?: boolean;
        mentions?: boolean;
        activity?: boolean;
      };
      digestFrequency?: 'instant' | 'daily' | 'weekly' | 'off';
      webhookUrl?: string;
    };
  };
  runtimeStorage?: {
    provider: 'local' | 's3' | 'supabase';
    configured: boolean;
    publicUrl?: string;
    basePath?: string;
    bucket?: string;
    region?: string;
    endpoint?: string;
    forcePathStyle?: boolean;
    missing: string[];
    error?: string;
  };
  runtimeDatabase?: {
    mode: string;
    provider: string;
    configured: boolean;
    host?: string;
    database?: string;
    path?: string;
    logging?: boolean;
    missing: string[];
    note?: string;
    error?: string;
  };
  runtimeSupabase?: {
    configured: boolean;
    projectUrl?: string;
    projectRef?: string;
    anonKeyConfigured?: boolean;
    serviceRoleConfigured?: boolean;
    databaseUrlConfigured?: boolean;
    storageBucket?: string;
    missing: string[];
  };
  runtimeVercel?: {
    configured: boolean;
    onVercel?: boolean;
    projectId?: string;
    teamId?: string;
    url?: string;
    environment?: string;
    tokenConfigured?: boolean;
    missing: string[];
  };
}

export interface PageCreateInput {
  title: string;
  slug: string;
  status?: Page['status'];
  scheduledAt?: string | null;
  description?: string;
  template?: string;
  isHomepage?: boolean;
  meta?: Record<string, unknown>;
  content?: unknown;
}

export interface PageUpdateInput {
  title?: string;
  slug?: string;
  status?: Page['status'];
  scheduledAt?: string | null;
  description?: string;
  meta?: Record<string, unknown>;
  content?: unknown;
  revisionNote?: string;
  updatedBy?: string;
}

export interface BlogPostInput {
  title: string;
  slug: string;
  excerpt?: string;
  status?: BlogPost['status'];
  scheduledAt?: string | null;
  content?: unknown;
  meta?: Record<string, unknown>;
  authorId?: string | null;
  categoryIds?: string[];
  tagIds?: string[];
}

export interface BlogPostUpdateInput {
  title?: string;
  slug?: string;
  excerpt?: string;
  status?: BlogPost['status'];
  scheduledAt?: string | null;
  content?: unknown;
  meta?: Record<string, unknown>;
  authorId?: string | null;
  categoryIds?: string[];
  tagIds?: string[];
  revisionNote?: string;
  updatedBy?: string;
}

export interface BlogCategoryInput {
  name: string;
  slug: string;
  description?: string | null;
  color?: string | null;
}

export interface BlogCategoryUpdateInput {
  name?: string;
  slug?: string;
  description?: string | null;
  color?: string | null;
}

export interface BlogTagInput {
  name: string;
  slug: string;
  description?: string | null;
}

export interface BlogTagUpdateInput {
  name?: string;
  slug?: string;
  description?: string | null;
}

export type FormSubmissionStatus = 'pending' | 'approved' | 'rejected' | 'spam';

export interface FormFieldDefinition {
  key: string;
  label: string;
  type: string;
  placeholder?: string;
  helpText?: string;
  defaultValue?: string;
  options?: string[];
  required?: boolean;
  validation?: Array<{
    type: string;
    value?: string | number;
    message: string;
  }>;
}

export interface FormDefinition {
  id: string;
  siteId: string;
  pageId?: string | null;
  postId?: string | null;
  name: string;
  title?: string | null;
  description?: string | null;
  audience: 'public' | 'authenticated' | 'adminOnly';
  isActive: boolean;
  fields: FormFieldDefinition[];
  notificationEmail?: string | null;
  successRedirectUrl?: string | null;
  successMessage?: string | null;
  enableHoneypot?: boolean;
  enableCaptcha?: boolean;
  notificationWebhook?: string | null;
  moderationMode?: 'manual' | 'auto-approve';
  contactShare?: {
    enabled: boolean;
    nameField?: string;
    emailField?: string;
    phoneField?: string;
    notesField?: string;
    dedupeByEmail?: boolean;
  };
  collectionTarget?: {
    enabled: boolean;
    collectionId: string;
    fieldMap?: Record<string, string>;
    slugField?: string;
  };
  createdBy?: string | null;
  updatedBy?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface FormSubmission {
  id: string;
  formId: string;
  siteId: string;
  pageId?: string | null;
  postId?: string | null;
  values: Record<string, unknown>;
  ipHash?: string | null;
  userAgent?: string | null;
  requestId?: string | null;
  status: FormSubmissionStatus;
  reviewedBy?: string | null;
  reviewedAt?: string | null;
  adminNotes?: string | null;
  updatedAt?: string;
  collectionRecord?: {
    siteId: string;
    collectionId: string;
    collectionSlug: string;
    recordId: string;
    recordSlug: string;
    status: string;
    createdAt: string;
  } | null;
  collectionRecordErrors?: Array<{ field: string; message: string }>;
  submittedAt: string;
}

export interface FormSubmissionList {
  data: FormSubmission[];
  pagination?: {
    total: number;
    limit: number;
    offset: number;
    hasMore: boolean;
  };
}

export type ContactStatus = Contact['status'];
export type AdminContact = Contact;

export interface ContactListFilters {
  status?: ContactStatus | 'all';
  requestId?: string;
  limit?: number;
  offset?: number;
}

export interface ContactListResult {
  contacts: AdminContact[];
  count: number;
  pagination: ApiPagination;
}

export type CommentModerationStatus = CommentStatus;
export type CommentModerationTarget = CommentTargetType | 'all';
export type CommentModerationSort = 'newest' | 'oldest';

export type AdminComment = Comment;

export interface CommentListFilters {
  status?: CommentStatus | 'all';
  targetType?: CommentModerationTarget;
  targetId?: string;
  requestId?: string;
  q?: string;
  parentOnly?: boolean;
  parentId?: string | null;
  sort?: CommentModerationSort;
  limit?: number;
  offset?: number;
}

export interface CommentListResult {
  comments: AdminComment[];
  count: number;
  pagination: ApiPagination;
}

export interface UpdateCommentsInput {
  commentIds: string[];
  status: CommentStatus;
  reviewedBy?: string | null;
  actor?: string | null;
  rejectionReason?: string | null;
  blockReason?: string | null;
}

export interface UpdateCommentsResult {
  updated: AdminComment[];
  updatedCount: number;
  missingIds: string[];
}

export interface BlogCategory {
  id: string;
  siteId: string;
  name: string;
  slug: string;
  description: string | null;
  color: string | null;
  postCount: number;
  updatedAt?: string;
  createdAt?: string;
}

export interface BlogTag {
  id: string;
  siteId: string;
  name: string;
  slug: string;
  description: string | null;
  postCount: number;
  updatedAt?: string;
  createdAt?: string;
}

export interface BlogAuthor {
  id: string;
  siteId: string;
  name: string;
  slug: string;
  role: User['role'] | 'contributor';
  status: User['status'] | 'external';
  postCount: number;
}

export interface ContentRevision {
  id: string;
  targetType: 'page' | 'post';
  note: string | null;
  createdBy: string | null;
  createdAt: string;
  snapshotTitle: string;
  snapshotStatus: Page['status'] | BlogPost['status'];
}

export interface PreviewLink {
  previewToken: string;
  expiresAt: string;
  url: string;
}

export type CollectionFieldType = ApiCollectionFieldType;

export interface CollectionField {
  id?: string;
  key: string;
  label: string;
  type: CollectionFieldType;
  required: boolean;
  unique: boolean;
  sortOrder: number;
  helpText?: string | null;
  options?: string[];
  referenceCollectionId?: string | null;
  defaultValue?: unknown;
}

export interface CollectionPermissions {
  publicRead: boolean;
  publicCreate: boolean;
  publicUpdate: boolean;
  publicDelete: boolean;
}

export interface Collection {
  id: string;
  siteId: string;
  name: string;
  slug: string;
  routePattern?: string | null;
  listRoutePattern?: string | null;
  description: string | null;
  status: 'draft' | 'published' | 'archived';
  fields: CollectionField[];
  permissions: CollectionPermissions;
  createdAt?: string;
  updatedAt?: string;
}

export interface CollectionRecord {
  id: string;
  siteId: string;
  collectionId: string;
  slug: string;
  status: Page['status'];
  values: Record<string, unknown>;
  createdAt?: string;
  updatedAt?: string;
  publishedAt?: string | null;
  scheduledAt?: string | null;
}

export interface CollectionInput {
  name: string;
  slug: string;
  routePattern?: string | null;
  listRoutePattern?: string | null;
  description?: string | null;
  status?: Collection['status'];
  fields?: CollectionField[];
  permissions?: CollectionPermissions;
}

export interface CollectionRecordInput {
  slug: string;
  status?: Page['status'];
  scheduledAt?: string | null;
  values: Record<string, unknown>;
}

export interface CollectionRecordListFilters {
  status?: Page['status'] | '';
  search?: string;
  fieldKey?: string;
  fieldValue?: string;
  sortBy?: string;
  sortDirection?: 'asc' | 'desc';
  limit?: number;
  offset?: number;
}

export interface CollectionRecordPagination {
  total: number;
  limit: number;
  offset: number;
  hasMore: boolean;
}

export interface CollectionRecordListResult {
  records: CollectionRecord[];
  pagination: CollectionRecordPagination;
}

export interface BulkCollectionRecordResult {
  action: 'delete' | 'updateStatus';
  deleted: number;
  updated: number;
  skipped: number;
  records: CollectionRecord[];
}

export interface CollectionRecordImportError {
  row: number;
  slug?: string;
  message: string;
  details?: unknown;
}

export interface CollectionRecordImportResult {
  created: number;
  updated: number;
  skipped: number;
  errors: CollectionRecordImportError[];
}

export interface ReusableSectionContent {
  elements: CanvasElement[];
  canvasSize?: CanvasSize;
  customCSS?: string;
  customJS?: string;
}

export interface ReusableSection {
  id: string;
  siteId: string;
  name: string;
  slug: string;
  description: string | null;
  category: string;
  status: 'active' | 'archived';
  tags: string[];
  content: ReusableSectionContent;
  sourceElementId: string | null;
  createdBy: string | null;
  updatedBy: string | null;
  createdAt?: string;
  updatedAt?: string;
}

export interface ReusableSectionInput {
  name: string;
  slug?: string;
  description?: string | null;
  category?: string;
  status?: 'active' | 'archived';
  tags?: string[];
  content: ReusableSectionContent;
  sourceElementId?: string | null;
  createdBy?: string | null;
  updatedBy?: string | null;
}

export interface ReusableSectionListFilters {
  status?: 'active' | 'archived' | 'all';
  category?: string;
  tag?: string;
  search?: string;
}

const getEnvValue = (key: string): string => {
  const env = (import.meta as unknown as { env?: Record<string, string | undefined> }).env ?? {};
  return env[key]?.trim() ?? '';
};

const isLocalAdminDevHost = (): boolean => {
  if (typeof window === 'undefined') {
    return false;
  }

  return ['localhost', '127.0.0.1', '::1'].includes(window.location.hostname)
    && window.location.port !== '3001';
};

export const getAdminApiBase = (): string => {
  const envBase = (
    getEnvValue('VITE_BACKY_ADMIN_API_BASE_URL') ||
    getEnvValue('VITE_ADMIN_API_URL') ||
    getEnvValue('VITE_BACKY_PUBLIC_API_BASE_URL') ||
    getEnvValue('VITE_PUBLIC_API_URL') ||
    getEnvValue('VITE_API_BASE_URL') ||
    ''
  ).trim();

  if (!envBase && isLocalAdminDevHost()) {
    return 'http://localhost:3001/api/admin';
  }

  const base = envBase || (typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3001');
  return `${base.replace(/\/api\/admin$/, '').replace(/\/api$/, '').replace(/\/$/, '')}/api/admin`;
};

const getPublicApiBase = (): string => (
  getAdminApiBase().replace(/\/api\/admin$/, '/api')
);

const getAdminApiKey = (): string => (
  getEnvValue('VITE_BACKY_ADMIN_API_KEY') ||
  getEnvValue('VITE_ADMIN_API_KEY') ||
  useStore.getState().settings.apiKeys.adminApiKey ||
  ''
);

const adminFetch: typeof globalThis.fetch = (input, init = {}) => {
  const apiKey = getAdminApiKey();
  const headers = new Headers(init.headers);

  if (apiKey && !headers.has('x-backy-admin-key') && !headers.has('authorization')) {
    headers.set('x-backy-admin-key', apiKey);
  }

  return globalThis.fetch(input, {
    ...init,
    headers,
  });
};

const toAdminSiteStatus = (status?: AdminSiteStatus, isPublished?: boolean): Site['status'] => {
  if (status === 'archived') return 'archived';
  if (status === 'published' || isPublished) return 'published';
  return 'draft';
};

const toContentStatus = (status?: AdminSiteStatus, isPublished?: boolean): Page['status'] => {
  if (status === 'archived') return 'archived';
  if (status === 'scheduled') return 'scheduled';
  if (status === 'published' || isPublished) return 'published';
  return 'draft';
};

const toStoreSite = (site: ApiSite): Site => ({
  id: site.id,
  name: site.name,
  slug: site.slug,
  description: site.description || '',
  customDomain: site.customDomain || null,
  status: toAdminSiteStatus(site.status, site.isPublished),
  publicSiteId: site.id,
  pageCount: 0,
  lastUpdated: site.updatedAt || site.createdAt || new Date().toISOString(),
});

const toStorePage = (page: ApiPage): Page => ({
  id: page.id,
  siteId: page.siteId,
  title: page.title,
  slug: page.slug,
  isHomepage: page.isHomepage === true,
  status: toContentStatus(page.status, page.status === 'published'),
  scheduledAt: page.scheduledAt || null,
  content: page.content ? JSON.stringify(page.content) : undefined,
  meta: page.meta || {
    title: page.title,
    description: page.description || '',
  },
  lastUpdated: page.updatedAt || page.createdAt || new Date().toISOString(),
});

const stringifyContent = (content: unknown): string => {
  if (typeof content === 'string') {
    return content;
  }

  if (content && typeof content === 'object') {
    return JSON.stringify(content);
  }

  return '';
};

const toStorePost = (post: ApiBlogPost): BlogPost => ({
  id: post.id,
  siteId: post.siteId,
  title: post.title,
  slug: post.slug,
  excerpt: post.excerpt || '',
  content: stringifyContent(post.content),
  status: toContentStatus(post.status, post.status === 'published'),
  scheduledAt: post.scheduledAt || null,
  featuredImageId: post.featuredImageId || null,
  author: post.authorId || 'admin',
  meta: post.meta || {},
  categoryIds: post.categoryIds || [],
  tagIds: post.tagIds || [],
  publishedAt: post.publishedAt || post.updatedAt || post.createdAt || new Date().toISOString(),
});

const toBlogCategory = (category: ApiBlogCategory): BlogCategory => ({
  id: category.id,
  siteId: category.siteId,
  name: category.name,
  slug: category.slug,
  description: category.description || null,
  color: category.color || null,
  postCount: category.postCount || 0,
  updatedAt: category.updatedAt,
  createdAt: category.createdAt,
});

const toBlogTag = (tag: ApiBlogTag): BlogTag => ({
  id: tag.id,
  siteId: tag.siteId,
  name: tag.name,
  slug: tag.slug,
  description: tag.description || null,
  postCount: tag.postCount || 0,
  updatedAt: tag.updatedAt,
  createdAt: tag.createdAt,
});

const toBlogAuthor = (author: ApiBlogAuthor): BlogAuthor => ({
  id: author.id,
  siteId: author.siteId,
  name: author.name,
  slug: author.slug,
  role: author.role,
  status: author.status,
  postCount: author.postCount || 0,
});

const toLastActiveLabel = (user: ApiUser): string => {
  if (user.lastActiveAt) {
    return new Date(user.lastActiveAt).toLocaleString();
  }

  if (user.invitedAt || user.status === 'invited') {
    return 'Invited';
  }

  return 'Never';
};

const toStoreUser = (user: ApiUser): User => ({
  id: user.id,
  fullName: user.fullName,
  email: user.email,
  role: user.role,
  status: user.status,
  lastActive: toLastActiveLabel(user),
});

const toContentRevision = (revision: ApiRevision): ContentRevision => {
  const snapshot = revision.snapshot;
  return {
    id: revision.id,
    targetType: revision.targetType,
    note: revision.note,
    createdBy: revision.createdBy,
    createdAt: revision.createdAt,
    snapshotTitle: snapshot.title,
    snapshotStatus: toContentStatus(snapshot.status, snapshot.status === 'published'),
  };
};

const toCollectionField = (field: ApiCollectionField, index: number): CollectionField => ({
  id: field.id,
  key: field.key,
  label: field.label || field.key,
  type: field.type || 'text',
  required: field.required === true,
  unique: field.unique === true,
  sortOrder: typeof field.sortOrder === 'number' ? field.sortOrder : (index + 1) * 10,
  helpText: field.helpText || null,
  options: field.options,
  referenceCollectionId: field.referenceCollectionId || null,
  defaultValue: field.defaultValue,
});

const toCollection = (collection: ApiCollection): Collection => ({
  id: collection.id,
  siteId: collection.siteId,
  name: collection.name,
  slug: collection.slug,
  description: collection.description || null,
  status: collection.status || 'draft',
  fields: (collection.fields || []).map(toCollectionField),
  permissions: {
    publicRead: collection.permissions?.publicRead === true,
    publicCreate: collection.permissions?.publicCreate === true,
    publicUpdate: collection.permissions?.publicUpdate === true,
    publicDelete: collection.permissions?.publicDelete === true,
  },
  createdAt: collection.createdAt,
  updatedAt: collection.updatedAt,
});

const toCollectionRecord = (record: ApiCollectionRecord): CollectionRecord => ({
  id: record.id,
  siteId: record.siteId,
  collectionId: record.collectionId,
  slug: record.slug,
  status: toContentStatus(record.status, record.status === 'published'),
  values: record.values || {},
  createdAt: record.createdAt,
  updatedAt: record.updatedAt,
  publishedAt: record.publishedAt || null,
  scheduledAt: record.scheduledAt || null,
});

const toReusableSection = (section: ApiReusableSection): ReusableSection => ({
  id: section.id,
  siteId: section.siteId,
  name: section.name,
  slug: section.slug,
  description: section.description || null,
  category: section.category || 'general',
  status: section.status || 'active',
  tags: section.tags || [],
  content: {
    elements: Array.isArray(section.content?.elements) ? section.content.elements : [],
    canvasSize: section.content?.canvasSize,
    customCSS: section.content?.customCSS,
    customJS: section.content?.customJS,
  },
  sourceElementId: section.sourceElementId || null,
  createdBy: section.createdBy || null,
  updatedBy: section.updatedBy || null,
  createdAt: section.createdAt,
  updatedAt: section.updatedAt,
});

export class AdminContentApiError extends Error {
  details?: unknown;

  constructor(message: string, details?: unknown) {
    super(message);
    this.name = 'AdminContentApiError';
    this.details = details;
  }
}

const readJson = async <T>(response: Response): Promise<T> => {
  try {
    return await response.json() as T;
  } catch {
    return {} as T;
  }
};

export async function listSites(): Promise<Site[]> {
  const response = await adminFetch(`${getAdminApiBase()}/sites?includeUnpublished=true`);
  const payload = await readJson<ApiListSitesResponse>(response);

  if (!response.ok || !payload.success || !payload.data) {
    throw new Error(payload.error?.message || 'Unable to load sites');
  }

  return payload.data.sites.map(toStoreSite);
}

export async function createSite(input: SiteCreateInput): Promise<Site> {
  const response = await adminFetch(`${getAdminApiBase()}/sites`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      ...input,
      isPublished: input.status === 'published',
    }),
  });
  const payload = await readJson<ApiSiteResponse>(response);

  if (!response.ok || !payload.success || !payload.data) {
    throw new Error(payload.error?.message || 'Unable to create site');
  }

  return toStoreSite(payload.data.site);
}

export async function deleteSite(siteId: string): Promise<void> {
  const response = await adminFetch(`${getAdminApiBase()}/sites/${siteId}`, {
    method: 'DELETE',
  });
  const payload = await readJson<ApiDeleteResponse>(response);

  if (!response.ok || !payload.success || !payload.data?.deleted) {
    throw new Error(payload.error?.message || 'Unable to delete site');
  }
}

export async function updateSite(siteId: string, input: Partial<SiteCreateInput>): Promise<Site> {
  const response = await adminFetch(`${getAdminApiBase()}/sites/${siteId}`, {
    method: 'PATCH',
    headers: {
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      ...input,
      isPublished: input.status === 'published',
    }),
  });
  const payload = await readJson<ApiSiteResponse>(response);

  if (!response.ok || !payload.success || !payload.data) {
    throw new Error(payload.error?.message || 'Unable to save site');
  }

  return toStoreSite(payload.data.site);
}

export async function getSiteReadiness(siteId: string): Promise<SiteReadiness> {
  const response = await adminFetch(`${getAdminApiBase()}/sites/${siteId}/readiness`);
  const payload = await readJson<ApiSiteReadinessResponse>(response);

  if (!response.ok || !payload.success || !payload.data) {
    throw new Error(payload.error?.message || 'Unable to load site readiness');
  }

  return payload.data.readiness;
}

export async function getSiteNavigation(siteId: string): Promise<AdminSiteNavigation> {
  const response = await adminFetch(`${getAdminApiBase()}/sites/${siteId}/navigation`);
  const payload = await readJson<ApiSiteNavigationResponse>(response);

  if (!response.ok || !payload.success || !payload.data) {
    throw new Error(payload.error?.message || 'Unable to load site navigation');
  }

  return payload.data.navigation;
}

export async function updateSiteNavigation(
  siteId: string,
  navigation: SiteNavigationConfig,
): Promise<AdminSiteNavigation> {
  const response = await adminFetch(`${getAdminApiBase()}/sites/${siteId}/navigation`, {
    method: 'PATCH',
    headers: {
      'content-type': 'application/json',
    },
    body: JSON.stringify({ navigation }),
  });
  const payload = await readJson<ApiSiteNavigationResponse>(response);

  if (!response.ok || !payload.success || !payload.data) {
    throw new Error(payload.error?.message || 'Unable to save site navigation');
  }

  return payload.data.navigation;
}

export async function getSiteRedirects(siteId: string): Promise<AdminSiteRedirects> {
  const response = await adminFetch(`${getAdminApiBase()}/sites/${siteId}/redirects`);
  const payload = await readJson<ApiSiteRedirectsResponse>(response);

  if (!response.ok || !payload.success || !payload.data) {
    throw new Error(payload.error?.message || 'Unable to load site redirects');
  }

  return payload.data.redirects;
}

export async function updateSiteRedirects(
  siteId: string,
  redirectRules: SiteRedirectRule[],
): Promise<AdminSiteRedirects> {
  const response = await adminFetch(`${getAdminApiBase()}/sites/${siteId}/redirects`, {
    method: 'PATCH',
    headers: {
      'content-type': 'application/json',
    },
    body: JSON.stringify({ redirectRules }),
  });
  const payload = await readJson<ApiSiteRedirectsResponse>(response);

  if (!response.ok || !payload.success || !payload.data) {
    throw new Error(payload.error?.message || 'Unable to save site redirects');
  }

  return payload.data.redirects;
}

export async function previewSiteRedirects(
  siteId: string,
  redirectRules: SiteRedirectRule[],
): Promise<AdminSiteRedirects> {
  const response = await adminFetch(`${getAdminApiBase()}/sites/${siteId}/redirects`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
    },
    body: JSON.stringify({ redirectRules }),
  });
  const payload = await readJson<ApiSiteRedirectsResponse>(response);

  if (!response.ok || !payload.success || !payload.data) {
    throw new Error(payload.error?.message || 'Unable to preview site redirects');
  }

  return payload.data.redirects;
}

export async function getSiteSeoSettings(siteId: string): Promise<{
  seo: AdminSiteSeoSettings;
  preview: AdminSiteSeoPreview;
  cacheInvalidation?: AdminSiteSeoCacheInvalidation;
}> {
  const response = await adminFetch(`${getAdminApiBase()}/sites/${siteId}/seo`);
  const payload = await readJson<ApiSiteSeoResponse>(response);

  if (!response.ok || !payload.success || !payload.data) {
    throw new Error(payload.error?.message || 'Unable to load site SEO settings');
  }

  return {
    seo: payload.data.seo,
    preview: payload.data.preview || { supportedVariables: [], routes: [] },
    cacheInvalidation: payload.data.cacheInvalidation,
  };
}

export async function updateSiteSeoSettings(
  siteId: string,
  seo: AdminSiteSeoSettings,
): Promise<{
  seo: AdminSiteSeoSettings;
  preview: AdminSiteSeoPreview;
  cacheInvalidation?: AdminSiteSeoCacheInvalidation;
}> {
  const response = await adminFetch(`${getAdminApiBase()}/sites/${siteId}/seo`, {
    method: 'PATCH',
    headers: {
      'content-type': 'application/json',
    },
    body: JSON.stringify({ seo }),
  });
  const payload = await readJson<ApiSiteSeoResponse>(response);

  if (!response.ok || !payload.success || !payload.data) {
    throw new Error(payload.error?.message || 'Unable to save site SEO settings');
  }

  return {
    seo: payload.data.seo,
    preview: payload.data.preview || { supportedVariables: [], routes: [] },
    cacheInvalidation: payload.data.cacheInvalidation,
  };
}

export async function getPageReadiness(siteId: string, pageId: string): Promise<PageReadiness> {
  const response = await adminFetch(`${getAdminApiBase()}/sites/${siteId}/pages/${pageId}/readiness`);
  const payload = await readJson<ApiPageReadinessResponse>(response);

  if (!response.ok || !payload.success || !payload.data) {
    throw new Error(payload.error?.message || 'Unable to load page readiness');
  }

  return payload.data.readiness;
}

export async function getBlogPostReadiness(siteId: string, postId: string): Promise<BlogPostReadiness> {
  const response = await adminFetch(`${getAdminApiBase()}/sites/${siteId}/blog/${postId}/readiness`);
  const payload = await readJson<ApiBlogPostReadinessResponse>(response);

  if (!response.ok || !payload.success || !payload.data) {
    throw new Error(payload.error?.message || 'Unable to load post readiness');
  }

  return payload.data.readiness;
}

export async function listUsers(): Promise<User[]> {
  const response = await adminFetch(`${getAdminApiBase()}/users`);
  const payload = await readJson<ApiListUsersResponse>(response);

  if (!response.ok || !payload.success || !payload.data) {
    throw new Error(payload.error?.message || 'Unable to load users');
  }

  return payload.data.users.map(toStoreUser);
}

export async function getUser(userId: string): Promise<User> {
  const response = await adminFetch(`${getAdminApiBase()}/users/${userId}`);
  const payload = await readJson<ApiUserResponse>(response);

  if (!response.ok || !payload.success || !payload.data) {
    throw new Error(payload.error?.message || 'Unable to load user');
  }

  return toStoreUser(payload.data.user);
}

export async function createUser(input: UserInput): Promise<User> {
  const response = await adminFetch(`${getAdminApiBase()}/users`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
    },
    body: JSON.stringify(input),
  });
  const payload = await readJson<ApiUserResponse>(response);

  if (!response.ok || !payload.success || !payload.data) {
    throw new Error(payload.error?.message || 'Unable to create user');
  }

  return toStoreUser(payload.data.user);
}

export async function updateUser(userId: string, input: UserUpdateInput): Promise<User> {
  const response = await adminFetch(`${getAdminApiBase()}/users/${userId}`, {
    method: 'PATCH',
    headers: {
      'content-type': 'application/json',
    },
    body: JSON.stringify(input),
  });
  const payload = await readJson<ApiUserResponse>(response);

  if (!response.ok || !payload.success || !payload.data) {
    throw new Error(payload.error?.message || 'Unable to save user');
  }

  return toStoreUser(payload.data.user);
}

export async function deleteUser(userId: string): Promise<void> {
  const response = await adminFetch(`${getAdminApiBase()}/users/${userId}`, {
    method: 'DELETE',
  });
  const payload = await readJson<ApiDeleteResponse>(response);

  if (!response.ok || !payload.success || !payload.data?.deleted) {
    throw new Error(payload.error?.message || 'Unable to delete user');
  }
}

export async function getSettings(): Promise<SiteSettingsInput> {
  const response = await adminFetch(`${getAdminApiBase()}/settings`);
  const payload = await readJson<ApiSettingsResponse>(response);

  if (!response.ok || !payload.success || !payload.data) {
    throw new Error(payload.error?.message || 'Unable to load settings');
  }

  return {
    deliveryMode: payload.data.settings.deliveryMode,
    apiKeys: payload.data.settings.apiKeys,
    auth: payload.data.settings.auth,
    runtimeStorage: payload.data.settings.runtimeStorage,
    integrations: payload.data.settings.integrations,
    runtimeDatabase: payload.data.settings.runtimeDatabase,
    runtimeSupabase: payload.data.settings.runtimeSupabase,
    runtimeVercel: payload.data.settings.runtimeVercel,
  };
}

export async function updateSettings(input: Partial<SiteSettingsInput>): Promise<SiteSettingsInput> {
  const response = await adminFetch(`${getAdminApiBase()}/settings`, {
    method: 'PATCH',
    headers: {
      'content-type': 'application/json',
    },
    body: JSON.stringify(input),
  });
  const payload = await readJson<ApiSettingsResponse>(response);

  if (!response.ok || !payload.success || !payload.data) {
    throw new Error(payload.error?.message || 'Unable to save settings');
  }

  return {
    deliveryMode: payload.data.settings.deliveryMode,
    apiKeys: payload.data.settings.apiKeys,
    auth: payload.data.settings.auth,
    runtimeStorage: payload.data.settings.runtimeStorage,
    integrations: payload.data.settings.integrations,
    runtimeDatabase: payload.data.settings.runtimeDatabase,
    runtimeSupabase: payload.data.settings.runtimeSupabase,
    runtimeVercel: payload.data.settings.runtimeVercel,
  };
}

export async function regenerateSettingsApiKeys(scope: 'all' | 'public' | 'admin' = 'all'): Promise<SiteSettingsInput> {
  const response = await adminFetch(`${getAdminApiBase()}/settings`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
    },
    body: JSON.stringify({ action: 'regenerate-api-keys', scope }),
  });
  const payload = await readJson<ApiSettingsResponse>(response);

  if (!response.ok || !payload.success || !payload.data) {
    throw new Error(payload.error?.message || 'Unable to regenerate API keys');
  }

  return {
    deliveryMode: payload.data.settings.deliveryMode,
    apiKeys: payload.data.settings.apiKeys,
    auth: payload.data.settings.auth,
    runtimeStorage: payload.data.settings.runtimeStorage,
    integrations: payload.data.settings.integrations,
    runtimeDatabase: payload.data.settings.runtimeDatabase,
    runtimeSupabase: payload.data.settings.runtimeSupabase,
    runtimeVercel: payload.data.settings.runtimeVercel,
  };
}

export async function listAdminAuditLogs(filters: AdminAuditLogListFilters = {}): Promise<AdminAuditLogListResult> {
  const params = new URLSearchParams();

  Object.entries(filters).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') {
      params.set(key, String(value));
    }
  });

  const query = params.toString();
  const response = await adminFetch(`${getAdminApiBase()}/audit-logs${query ? `?${query}` : ''}`);
  const payload = await readJson<ApiAdminAuditLogsResponse>(response);

  if (!response.ok || !payload.success || !payload.data) {
    throw new Error(payload.error?.message || 'Unable to load audit logs');
  }

  return payload.data;
}

export async function listPages(siteId: string): Promise<Page[]> {
  const response = await adminFetch(`${getAdminApiBase()}/sites/${siteId}/pages?includeUnpublished=true`);
  const payload = await readJson<ApiListPagesResponse>(response);

  if (!response.ok || !payload.success || !payload.data) {
    throw new Error(payload.error?.message || 'Unable to load pages');
  }

  return payload.data.pages.map(toStorePage);
}

export async function createPage(siteId: string, input: PageCreateInput): Promise<Page> {
  const response = await adminFetch(`${getAdminApiBase()}/sites/${siteId}/pages`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
    },
    body: JSON.stringify(input),
  });
  const payload = await readJson<ApiPageResponse>(response);

  if (!response.ok || !payload.success || !payload.data) {
    throw new Error(payload.error?.message || 'Unable to create page');
  }

  return toStorePage(payload.data.page);
}

export async function getPage(siteId: string, pageId: string): Promise<Page> {
  const response = await adminFetch(`${getAdminApiBase()}/sites/${siteId}/pages/${pageId}`);
  const payload = await readJson<ApiPageResponse>(response);

  if (!response.ok || !payload.success || !payload.data) {
    throw new Error(payload.error?.message || 'Unable to load page');
  }

  return toStorePage(payload.data.page);
}

export async function updatePage(siteId: string, pageId: string, input: PageUpdateInput): Promise<Page> {
  const response = await adminFetch(`${getAdminApiBase()}/sites/${siteId}/pages/${pageId}`, {
    method: 'PATCH',
    headers: {
      'content-type': 'application/json',
    },
    body: JSON.stringify(input),
  });
  const payload = await readJson<ApiPageResponse>(response);

  if (!response.ok || !payload.success || !payload.data) {
    throw new Error(payload.error?.message || 'Unable to save page');
  }

  return toStorePage(payload.data.page);
}

export async function listPageRevisions(siteId: string, pageId: string): Promise<ContentRevision[]> {
  const response = await adminFetch(`${getAdminApiBase()}/sites/${siteId}/pages/${pageId}/revisions?limit=8`);
  const payload = await readJson<ApiRevisionListResponse>(response);

  if (!response.ok || !payload.success || !payload.data) {
    throw new Error(payload.error?.message || 'Unable to load page revisions');
  }

  return payload.data.revisions.map(toContentRevision);
}

export async function publishPage(siteId: string, pageId: string): Promise<Page> {
  const response = await adminFetch(`${getAdminApiBase()}/sites/${siteId}/pages/${pageId}/publish`, {
    method: 'POST',
  });
  const payload = await readJson<ApiPageResponse>(response);

  if (!response.ok || !payload.success || !payload.data) {
    throw new Error(payload.error?.message || 'Unable to publish page');
  }

  return toStorePage(payload.data.page);
}

export async function archivePage(siteId: string, pageId: string): Promise<Page> {
  const response = await adminFetch(`${getAdminApiBase()}/sites/${siteId}/pages/${pageId}/archive`, {
    method: 'POST',
  });
  const payload = await readJson<ApiPageResponse>(response);

  if (!response.ok || !payload.success || !payload.data) {
    throw new Error(payload.error?.message || 'Unable to archive page');
  }

  return toStorePage(payload.data.page);
}

export async function rollbackPage(siteId: string, pageId: string, revisionId: string): Promise<Page> {
  const response = await adminFetch(`${getAdminApiBase()}/sites/${siteId}/pages/${pageId}/rollback`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
    },
    body: JSON.stringify({ revisionId }),
  });
  const payload = await readJson<ApiPageResponse>(response);

  if (!response.ok || !payload.success || !payload.data) {
    throw new Error(payload.error?.message || 'Unable to restore page revision');
  }

  return toStorePage(payload.data.page);
}

export async function createPagePreview(siteId: string, pageId: string): Promise<PreviewLink> {
  const response = await adminFetch(`${getAdminApiBase()}/sites/${siteId}/pages/${pageId}/preview`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
    },
    body: JSON.stringify({ ttlSeconds: 3600 }),
  });
  const payload = await readJson<ApiPreviewResponse>(response);

  if (!response.ok || !payload.success || !payload.data || (!payload.data.hostedUrl && !payload.data.renderUrl)) {
    throw new Error(payload.error?.message || 'Unable to create page preview');
  }

  return {
    previewToken: payload.data.previewToken,
    expiresAt: payload.data.expiresAt,
    url: payload.data.hostedUrl || payload.data.renderUrl || '',
  };
}

export async function deletePage(siteId: string, pageId: string): Promise<void> {
  const response = await adminFetch(`${getAdminApiBase()}/sites/${siteId}/pages/${pageId}`, {
    method: 'DELETE',
  });
  const payload = await readJson<ApiDeleteResponse>(response);

  if (!response.ok || !payload.success || !payload.data?.deleted) {
    throw new Error(payload.error?.message || 'Unable to delete page');
  }
}

export async function listBlogPosts(
  siteId: string,
  filters: { status?: BlogPost['status']; categoryId?: string; tagId?: string; authorId?: string } = {},
): Promise<BlogPost[]> {
  const query = new URLSearchParams({ limit: '100' });
  if (filters.status) query.set('status', filters.status);
  if (filters.categoryId) query.set('categoryId', filters.categoryId);
  if (filters.tagId) query.set('tagId', filters.tagId);
  if (filters.authorId) query.set('authorId', filters.authorId);

  const response = await adminFetch(`${getAdminApiBase()}/sites/${siteId}/blog?${query.toString()}`);
  const payload = await readJson<ApiListBlogResponse>(response);

  if (!response.ok || !payload.success || !payload.data) {
    throw new Error(payload.error?.message || 'Unable to load blog posts');
  }

  return payload.data.posts.map(toStorePost);
}

export async function listBlogCategories(siteId: string): Promise<BlogCategory[]> {
  const response = await adminFetch(`${getAdminApiBase()}/sites/${siteId}/blog/categories`);
  const payload = await readJson<ApiListBlogCategoriesResponse>(response);

  if (!response.ok || !payload.success || !payload.data) {
    throw new Error(payload.error?.message || 'Unable to load blog categories');
  }

  return payload.data.categories.map(toBlogCategory);
}

export async function createBlogCategory(siteId: string, input: BlogCategoryInput): Promise<BlogCategory> {
  const response = await adminFetch(`${getAdminApiBase()}/sites/${siteId}/blog/categories`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
    },
    body: JSON.stringify(input),
  });
  const payload = await readJson<ApiBlogCategoryResponse>(response);

  if (!response.ok || !payload.success || !payload.data) {
    throw new Error(payload.error?.message || 'Unable to create blog category');
  }

  return toBlogCategory(payload.data.category);
}

export async function updateBlogCategory(
  siteId: string,
  categoryId: string,
  input: BlogCategoryUpdateInput,
): Promise<BlogCategory> {
  const response = await adminFetch(`${getAdminApiBase()}/sites/${siteId}/blog/categories/${categoryId}`, {
    method: 'PATCH',
    headers: {
      'content-type': 'application/json',
    },
    body: JSON.stringify(input),
  });
  const payload = await readJson<ApiBlogCategoryResponse>(response);

  if (!response.ok || !payload.success || !payload.data) {
    throw new Error(payload.error?.message || 'Unable to save blog category');
  }

  return toBlogCategory(payload.data.category);
}

export async function deleteBlogCategory(siteId: string, categoryId: string): Promise<void> {
  const response = await adminFetch(`${getAdminApiBase()}/sites/${siteId}/blog/categories/${categoryId}`, {
    method: 'DELETE',
  });
  const payload = await readJson<ApiDeleteResponse>(response);

  if (!response.ok || !payload.success || !payload.data?.deleted) {
    throw new Error(payload.error?.message || 'Unable to delete blog category');
  }
}

export async function listBlogTags(siteId: string): Promise<BlogTag[]> {
  const response = await adminFetch(`${getAdminApiBase()}/sites/${siteId}/blog/tags`);
  const payload = await readJson<ApiListBlogTagsResponse>(response);

  if (!response.ok || !payload.success || !payload.data) {
    throw new Error(payload.error?.message || 'Unable to load blog tags');
  }

  return payload.data.tags.map(toBlogTag);
}

export async function listBlogAuthors(siteId: string): Promise<BlogAuthor[]> {
  const response = await adminFetch(`${getAdminApiBase()}/sites/${siteId}/blog/authors`);
  const payload = await readJson<ApiListBlogAuthorsResponse>(response);

  if (!response.ok || !payload.success || !payload.data) {
    throw new Error(payload.error?.message || 'Unable to load blog authors');
  }

  return payload.data.authors.map(toBlogAuthor);
}

export async function createBlogTag(siteId: string, input: BlogTagInput): Promise<BlogTag> {
  const response = await adminFetch(`${getAdminApiBase()}/sites/${siteId}/blog/tags`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
    },
    body: JSON.stringify(input),
  });
  const payload = await readJson<ApiBlogTagResponse>(response);

  if (!response.ok || !payload.success || !payload.data) {
    throw new Error(payload.error?.message || 'Unable to create blog tag');
  }

  return toBlogTag(payload.data.tag);
}

export async function updateBlogTag(siteId: string, tagId: string, input: BlogTagUpdateInput): Promise<BlogTag> {
  const response = await adminFetch(`${getAdminApiBase()}/sites/${siteId}/blog/tags/${tagId}`, {
    method: 'PATCH',
    headers: {
      'content-type': 'application/json',
    },
    body: JSON.stringify(input),
  });
  const payload = await readJson<ApiBlogTagResponse>(response);

  if (!response.ok || !payload.success || !payload.data) {
    throw new Error(payload.error?.message || 'Unable to save blog tag');
  }

  return toBlogTag(payload.data.tag);
}

export async function deleteBlogTag(siteId: string, tagId: string): Promise<void> {
  const response = await adminFetch(`${getAdminApiBase()}/sites/${siteId}/blog/tags/${tagId}`, {
    method: 'DELETE',
  });
  const payload = await readJson<ApiDeleteResponse>(response);

  if (!response.ok || !payload.success || !payload.data?.deleted) {
    throw new Error(payload.error?.message || 'Unable to delete blog tag');
  }
}

export async function createBlogPost(siteId: string, input: BlogPostInput): Promise<BlogPost> {
  const response = await adminFetch(`${getAdminApiBase()}/sites/${siteId}/blog`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
    },
    body: JSON.stringify(input),
  });
  const payload = await readJson<ApiBlogPostResponse>(response);

  if (!response.ok || !payload.success || !payload.data) {
    throw new Error(payload.error?.message || 'Unable to create blog post');
  }

  return toStorePost(payload.data.post);
}

export async function getBlogPost(siteId: string, postId: string): Promise<BlogPost> {
  const response = await adminFetch(`${getAdminApiBase()}/sites/${siteId}/blog/${postId}`);
  const payload = await readJson<ApiBlogPostResponse>(response);

  if (!response.ok || !payload.success || !payload.data) {
    throw new Error(payload.error?.message || 'Unable to load blog post');
  }

  return toStorePost(payload.data.post);
}

export async function updateBlogPost(
  siteId: string,
  postId: string,
  input: BlogPostUpdateInput,
): Promise<BlogPost> {
  const response = await adminFetch(`${getAdminApiBase()}/sites/${siteId}/blog/${postId}`, {
    method: 'PATCH',
    headers: {
      'content-type': 'application/json',
    },
    body: JSON.stringify(input),
  });
  const payload = await readJson<ApiBlogPostResponse>(response);

  if (!response.ok || !payload.success || !payload.data) {
    throw new Error(payload.error?.message || 'Unable to save blog post');
  }

  return toStorePost(payload.data.post);
}

export async function listBlogPostRevisions(siteId: string, postId: string): Promise<ContentRevision[]> {
  const response = await adminFetch(`${getAdminApiBase()}/sites/${siteId}/blog/${postId}/revisions?limit=8`);
  const payload = await readJson<ApiRevisionListResponse>(response);

  if (!response.ok || !payload.success || !payload.data) {
    throw new Error(payload.error?.message || 'Unable to load post revisions');
  }

  return payload.data.revisions.map(toContentRevision);
}

export async function publishBlogPost(siteId: string, postId: string): Promise<BlogPost> {
  const response = await adminFetch(`${getAdminApiBase()}/sites/${siteId}/blog/${postId}/publish`, {
    method: 'POST',
  });
  const payload = await readJson<ApiBlogPostResponse>(response);

  if (!response.ok || !payload.success || !payload.data) {
    throw new Error(payload.error?.message || 'Unable to publish blog post');
  }

  return toStorePost(payload.data.post);
}

export async function archiveBlogPost(siteId: string, postId: string): Promise<BlogPost> {
  const response = await adminFetch(`${getAdminApiBase()}/sites/${siteId}/blog/${postId}/archive`, {
    method: 'POST',
  });
  const payload = await readJson<ApiBlogPostResponse>(response);

  if (!response.ok || !payload.success || !payload.data) {
    throw new Error(payload.error?.message || 'Unable to archive blog post');
  }

  return toStorePost(payload.data.post);
}

export async function rollbackBlogPost(siteId: string, postId: string, revisionId: string): Promise<BlogPost> {
  const response = await adminFetch(`${getAdminApiBase()}/sites/${siteId}/blog/${postId}/rollback`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
    },
    body: JSON.stringify({ revisionId }),
  });
  const payload = await readJson<ApiBlogPostResponse>(response);

  if (!response.ok || !payload.success || !payload.data) {
    throw new Error(payload.error?.message || 'Unable to restore post revision');
  }

  return toStorePost(payload.data.post);
}

export async function createBlogPostPreview(siteId: string, postId: string): Promise<PreviewLink> {
  const response = await adminFetch(`${getAdminApiBase()}/sites/${siteId}/blog/${postId}/preview`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
    },
    body: JSON.stringify({ ttlSeconds: 3600 }),
  });
  const payload = await readJson<ApiPreviewResponse>(response);

  if (!response.ok || !payload.success || !payload.data || (!payload.data.hostedUrl && !payload.data.postApiUrl)) {
    throw new Error(payload.error?.message || 'Unable to create post preview');
  }

  return {
    previewToken: payload.data.previewToken,
    expiresAt: payload.data.expiresAt,
    url: payload.data.hostedUrl || payload.data.postApiUrl || '',
  };
}

export async function deleteBlogPost(siteId: string, postId: string): Promise<void> {
  const response = await adminFetch(`${getAdminApiBase()}/sites/${siteId}/blog/${postId}`, {
    method: 'DELETE',
  });
  const payload = await readJson<ApiDeleteResponse>(response);

  if (!response.ok || !payload.success || !payload.data?.deleted) {
    throw new Error(payload.error?.message || 'Unable to delete blog post');
  }
}

export async function listForms(
  siteId: string,
  filters: { pageId?: string; postId?: string } = {},
): Promise<FormDefinition[]> {
  const query = new URLSearchParams();
  if (filters.pageId) query.set('pageId', filters.pageId);
  if (filters.postId) query.set('postId', filters.postId);

  const response = await adminFetch(`${getAdminApiBase()}/sites/${siteId}/forms${query.toString() ? `?${query}` : ''}`);
  const payload = await readJson<ApiListFormsResponse>(response);
  const forms = payload.data?.forms || payload.forms;

  if (!response.ok || !payload.success || !forms) {
    throw new Error(payload.error?.message || 'Unable to load forms');
  }

  return forms;
}

export async function getFormWithSubmissions(
  siteId: string,
  formId: string,
  filters: { status?: FormSubmissionStatus | 'all'; requestId?: string; limit?: number; offset?: number } = {},
): Promise<{ form: FormDefinition; submissions: FormSubmissionList }> {
  const query = new URLSearchParams();
  if (filters.status && filters.status !== 'all') query.set('status', filters.status);
  if (filters.requestId) query.set('requestId', filters.requestId);
  if (filters.limit) query.set('limit', String(filters.limit));
  if (filters.offset) query.set('offset', String(filters.offset));

  const response = await adminFetch(`${getAdminApiBase()}/sites/${siteId}/forms/${formId}/submissions${query.toString() ? `?${query}` : ''}`);
  const payload = await readJson<ApiFormDetailResponse>(response);
  const form = payload.data?.form || payload.form;
  const submissions = payload.data?.submissions || payload.submissions;

  if (!response.ok || !payload.success || !form) {
    throw new Error(payload.error?.message || 'Unable to load form');
  }

  return {
    form,
    submissions: submissions || { data: [], pagination: { total: 0, limit: filters.limit || 20, offset: filters.offset || 0, hasMore: false } },
  };
}

export async function updateFormSubmission(
  siteId: string,
  formId: string,
  submissionId: string,
  input: { status: FormSubmissionStatus; reviewedBy?: string | null; adminNotes?: string | null },
): Promise<FormSubmission> {
  const response = await adminFetch(`${getAdminApiBase()}/sites/${siteId}/forms/${formId}/submissions/${submissionId}`, {
    method: 'PATCH',
    headers: {
      'content-type': 'application/json',
    },
    body: JSON.stringify(input),
  });
  const payload = await readJson<ApiFormSubmissionResponse>(response);
  const submission = payload.data?.submission || payload.submission;

  if (!response.ok || !payload.success || !submission) {
    throw new Error(payload.error?.message || 'Unable to update submission');
  }

  return submission;
}

export async function listFormContacts(
  siteId: string,
  formId: string,
  filters: ContactListFilters = {},
): Promise<ContactListResult> {
  const query = new URLSearchParams();
  query.set('limit', String(filters.limit || 100));
  query.set('offset', String(filters.offset || 0));
  if (filters.status && filters.status !== 'all') query.set('status', filters.status);
  if (filters.requestId) query.set('requestId', filters.requestId);

  const response = await adminFetch(`${getAdminApiBase()}/sites/${siteId}/forms/${formId}/contacts?${query.toString()}`);
  const payload = await readJson<ApiListContactsResponse>(response);
  const contacts = payload.data?.contacts || payload.contacts;
  const count = payload.data?.count ?? payload.count ?? contacts?.length ?? 0;
  const pagination = payload.data?.pagination || payload.pagination || {
    total: count,
    limit: filters.limit || contacts?.length || 100,
    offset: filters.offset || 0,
    hasMore: false,
  };

  if (!response.ok || !payload.success || !contacts) {
    throw new Error(payload.error?.message || 'Unable to load contacts');
  }

  return {
    contacts,
    count,
    pagination,
  };
}

export async function updateContact(
  siteId: string,
  formId: string,
  contactId: string,
  input: { status?: ContactStatus; notes?: string | null },
): Promise<AdminContact> {
  const response = await adminFetch(`${getAdminApiBase()}/sites/${siteId}/forms/${formId}/contacts/${contactId}`, {
    method: 'PATCH',
    headers: {
      'content-type': 'application/json',
    },
    body: JSON.stringify(input),
  });
  const payload = await readJson<ApiContactResponse>(response);
  const contact = payload.data?.contact || payload.contact;

  if (!response.ok || !payload.success || !contact) {
    throw new Error(payload.error?.message || 'Unable to update contact');
  }

  return contact;
}

export async function listComments(
  siteId: string,
  filters: CommentListFilters = {},
): Promise<CommentListResult> {
  const query = new URLSearchParams();
  query.set('limit', String(filters.limit || 100));
  query.set('offset', String(filters.offset || 0));
  if (filters.status && filters.status !== 'all') query.set('status', filters.status);
  if (filters.targetType && filters.targetType !== 'all') query.set('targetType', filters.targetType);
  if (filters.targetId) query.set('targetId', filters.targetId);
  if (filters.requestId) query.set('requestId', filters.requestId);
  if (filters.q) query.set('q', filters.q);
  if (filters.parentOnly !== undefined) query.set('parentOnly', String(filters.parentOnly));
  if (filters.parentId !== undefined && filters.parentId !== null) query.set('parentId', filters.parentId);
  if (filters.sort) query.set('sort', filters.sort);

  const response = await adminFetch(`${getPublicApiBase()}/sites/${siteId}/comments?${query.toString()}`);
  const payload = await readJson<ApiListCommentsResponse>(response);
  const comments = payload.data?.comments || payload.comments;
  const count = payload.data?.count ?? payload.count ?? comments?.length ?? 0;
  const pagination = payload.data?.pagination || payload.pagination || {
    total: count,
    limit: filters.limit || comments?.length || 100,
    offset: filters.offset || 0,
    hasMore: false,
  };

  if (!response.ok || !payload.success || !comments) {
    throw new Error(payload.error?.message || 'Unable to load comments');
  }

  return {
    comments,
    count,
    pagination,
  };
}

export async function updateComments(
  siteId: string,
  input: UpdateCommentsInput,
): Promise<UpdateCommentsResult> {
  const response = await adminFetch(`${getPublicApiBase()}/sites/${siteId}/comments`, {
    method: 'PATCH',
    headers: {
      'content-type': 'application/json',
    },
    body: JSON.stringify(input),
  });
  const payload = await readJson<ApiUpdateCommentsResponse>(response);
  const updated = payload.data?.updated || payload.updated;

  if (!response.ok || !payload.success || !updated) {
    throw new Error(payload.error?.message || 'Unable to update comments');
  }

  return {
    updated,
    updatedCount: payload.data?.updatedCount ?? payload.updatedCount ?? updated.length,
    missingIds: payload.data?.missingIds || payload.missingIds || [],
  };
}

export async function listCollections(siteId: string): Promise<Collection[]> {
  const response = await adminFetch(`${getAdminApiBase()}/sites/${siteId}/collections`);
  const payload = await readJson<ApiListCollectionsResponse>(response);

  if (!response.ok || !payload.success || !payload.data) {
    throw new Error(payload.error?.message || 'Unable to load collections');
  }

  return payload.data.collections.map(toCollection);
}

export async function createCollection(siteId: string, input: CollectionInput): Promise<Collection> {
  const response = await adminFetch(`${getAdminApiBase()}/sites/${siteId}/collections`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
    },
    body: JSON.stringify(input),
  });
  const payload = await readJson<ApiCollectionResponse>(response);

  if (!response.ok || !payload.success || !payload.data) {
    throw new AdminContentApiError(payload.error?.message || 'Unable to create collection', payload.error?.details);
  }

  return toCollection(payload.data.collection);
}

export async function updateCollection(
  siteId: string,
  collectionId: string,
  input: Partial<CollectionInput>,
): Promise<Collection> {
  const response = await adminFetch(`${getAdminApiBase()}/sites/${siteId}/collections/${collectionId}`, {
    method: 'PATCH',
    headers: {
      'content-type': 'application/json',
    },
    body: JSON.stringify(input),
  });
  const payload = await readJson<ApiCollectionResponse>(response);

  if (!response.ok || !payload.success || !payload.data) {
    throw new AdminContentApiError(payload.error?.message || 'Unable to save collection', payload.error?.details);
  }

  return toCollection(payload.data.collection);
}

export async function deleteCollection(siteId: string, collectionId: string): Promise<void> {
  const response = await adminFetch(`${getAdminApiBase()}/sites/${siteId}/collections/${collectionId}`, {
    method: 'DELETE',
  });
  const payload = await readJson<ApiDeleteResponse>(response);

  if (!response.ok || !payload.success || !payload.data?.deleted) {
    throw new Error(payload.error?.message || 'Unable to delete collection');
  }
}

export async function listCollectionRecords(
  siteId: string,
  collectionId: string,
  filters: CollectionRecordListFilters = {},
): Promise<CollectionRecordListResult> {
  const query = new URLSearchParams();
  query.set('limit', String(filters.limit || 100));
  query.set('offset', String(filters.offset || 0));
  if (filters.status) query.set('status', filters.status);
  if (filters.search) query.set('q', filters.search);
  if (filters.fieldKey) query.set('fieldKey', filters.fieldKey);
  if (filters.fieldValue) query.set('fieldValue', filters.fieldValue);
  if (filters.sortBy) query.set('sortBy', filters.sortBy);
  if (filters.sortDirection) query.set('sortDirection', filters.sortDirection);

  const response = await adminFetch(`${getAdminApiBase()}/sites/${siteId}/collections/${collectionId}/records?${query.toString()}`);
  const payload = await readJson<ApiListCollectionRecordsResponse>(response);

  if (!response.ok || !payload.success || !payload.data) {
    throw new Error(payload.error?.message || 'Unable to load collection records');
  }

  return {
    records: payload.data.records.map(toCollectionRecord),
    pagination: payload.data.pagination || {
      total: payload.data.records.length,
      limit: filters.limit || payload.data.records.length || 1,
      offset: filters.offset || 0,
      hasMore: false,
    },
  };
}

export async function exportCollectionRecordsCsv(
  siteId: string,
  collectionId: string,
  filters: CollectionRecordListFilters = {},
): Promise<Blob> {
  const query = new URLSearchParams();
  query.set('format', 'csv');
  query.set('limit', String(filters.limit || 1000));
  query.set('offset', String(filters.offset || 0));
  if (filters.status) query.set('status', filters.status);
  if (filters.search) query.set('q', filters.search);
  if (filters.fieldKey) query.set('fieldKey', filters.fieldKey);
  if (filters.fieldValue) query.set('fieldValue', filters.fieldValue);
  if (filters.sortBy) query.set('sortBy', filters.sortBy);
  if (filters.sortDirection) query.set('sortDirection', filters.sortDirection);

  const response = await adminFetch(`${getAdminApiBase()}/sites/${siteId}/collections/${collectionId}/records?${query.toString()}`);

  if (!response.ok) {
    const message = await response.text();
    throw new Error(message || 'Unable to export collection records');
  }

  return response.blob();
}

export async function importCollectionRecordsCsv(
  siteId: string,
  collectionId: string,
  csv: string,
  options: { upsert?: boolean } = {},
): Promise<CollectionRecordImportResult> {
  const query = new URLSearchParams();
  if (options.upsert) query.set('upsert', 'true');

  const response = await adminFetch(`${getAdminApiBase()}/sites/${siteId}/collections/${collectionId}/records/import?${query.toString()}`, {
    method: 'POST',
    headers: {
      'content-type': 'text/csv; charset=utf-8',
    },
    body: csv,
  });
  const payload = await readJson<ApiImportCollectionRecordsResponse>(response);

  if (!response.ok || !payload.success || !payload.data) {
    throw new AdminContentApiError(payload.error?.message || 'Unable to import collection records', payload.error?.details);
  }

  return payload.data.import;
}

export async function createCollectionRecord(
  siteId: string,
  collectionId: string,
  input: CollectionRecordInput,
): Promise<CollectionRecord> {
  const response = await adminFetch(`${getAdminApiBase()}/sites/${siteId}/collections/${collectionId}/records`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
    },
    body: JSON.stringify(input),
  });
  const payload = await readJson<ApiCollectionRecordResponse>(response);

  if (!response.ok || !payload.success || !payload.data) {
    throw new AdminContentApiError(payload.error?.message || 'Unable to create collection record', payload.error?.details);
  }

  return toCollectionRecord(payload.data.record);
}

export async function updateCollectionRecord(
  siteId: string,
  collectionId: string,
  recordId: string,
  input: Partial<CollectionRecordInput>,
): Promise<CollectionRecord> {
  const response = await adminFetch(`${getAdminApiBase()}/sites/${siteId}/collections/${collectionId}/records/${recordId}`, {
    method: 'PATCH',
    headers: {
      'content-type': 'application/json',
    },
    body: JSON.stringify(input),
  });
  const payload = await readJson<ApiCollectionRecordResponse>(response);

  if (!response.ok || !payload.success || !payload.data) {
    throw new AdminContentApiError(payload.error?.message || 'Unable to save collection record', payload.error?.details);
  }

  return toCollectionRecord(payload.data.record);
}

export async function bulkUpdateCollectionRecords(
  siteId: string,
  collectionId: string,
  input: {
    action: 'delete' | 'updateStatus';
    recordIds: string[];
    status?: CollectionRecord['status'];
  },
): Promise<BulkCollectionRecordResult> {
  const response = await adminFetch(`${getAdminApiBase()}/sites/${siteId}/collections/${collectionId}/records/bulk`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
    },
    body: JSON.stringify(input),
  });
  const payload = await readJson<ApiBulkCollectionRecordsResponse>(response);

  if (!response.ok || !payload.success || !payload.data) {
    throw new AdminContentApiError(payload.error?.message || 'Unable to update collection records', payload.error?.details);
  }

  return {
    action: payload.data.action,
    deleted: payload.data.deleted,
    updated: payload.data.updated,
    skipped: payload.data.skipped,
    records: payload.data.records.map(toCollectionRecord),
  };
}

export async function deleteCollectionRecord(
  siteId: string,
  collectionId: string,
  recordId: string,
): Promise<void> {
  const response = await adminFetch(`${getAdminApiBase()}/sites/${siteId}/collections/${collectionId}/records/${recordId}`, {
    method: 'DELETE',
  });
  const payload = await readJson<ApiDeleteResponse>(response);

  if (!response.ok || !payload.success || !payload.data?.deleted) {
    throw new Error(payload.error?.message || 'Unable to delete collection record');
  }
}

export async function listReusableSections(
  siteId: string,
  filters: ReusableSectionListFilters = {},
): Promise<ReusableSection[]> {
  const query = new URLSearchParams();
  query.set('status', filters.status || 'active');
  if (filters.category) query.set('category', filters.category);
  if (filters.tag) query.set('tag', filters.tag);
  if (filters.search) query.set('search', filters.search);

  const response = await adminFetch(`${getAdminApiBase()}/sites/${siteId}/reusable-sections?${query.toString()}`);
  const payload = await readJson<ApiListReusableSectionsResponse>(response);

  if (!response.ok || !payload.success || !payload.data) {
    throw new Error(payload.error?.message || 'Unable to load reusable sections');
  }

  return payload.data.sections.map(toReusableSection);
}

export async function createReusableSection(
  siteId: string,
  input: ReusableSectionInput,
): Promise<ReusableSection> {
  const response = await adminFetch(`${getAdminApiBase()}/sites/${siteId}/reusable-sections`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
    },
    body: JSON.stringify(input),
  });
  const payload = await readJson<ApiReusableSectionResponse>(response);

  if (!response.ok || !payload.success || !payload.data) {
    throw new Error(payload.error?.message || 'Unable to save reusable section');
  }

  return toReusableSection(payload.data.section);
}

export async function updateReusableSection(
  siteId: string,
  sectionId: string,
  input: Partial<ReusableSectionInput>,
): Promise<ReusableSection> {
  const response = await adminFetch(`${getAdminApiBase()}/sites/${siteId}/reusable-sections/${sectionId}`, {
    method: 'PATCH',
    headers: {
      'content-type': 'application/json',
    },
    body: JSON.stringify(input),
  });
  const payload = await readJson<ApiReusableSectionResponse>(response);

  if (!response.ok || !payload.success || !payload.data) {
    throw new Error(payload.error?.message || 'Unable to update reusable section');
  }

  return toReusableSection(payload.data.section);
}

export async function deleteReusableSection(siteId: string, sectionId: string): Promise<void> {
  const response = await adminFetch(`${getAdminApiBase()}/sites/${siteId}/reusable-sections/${sectionId}`, {
    method: 'DELETE',
  });
  const payload = await readJson<ApiDeleteResponse>(response);

  if (!response.ok || !payload.success || !payload.data?.deleted) {
    throw new Error(payload.error?.message || 'Unable to delete reusable section');
  }
}
