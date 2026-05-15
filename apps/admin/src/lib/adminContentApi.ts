import type { BlogPost, Page, Site, User } from '@/stores/mockStore';
import type { CanvasElement, CanvasSize } from '@/types/editor';
import type {
  Comment,
  CommentStatus,
  CommentTargetType,
  Contact,
  SiteContactSavedList,
  SiteContactSavedListFilters,
  SiteNavigationConfig,
  SiteNavigationLayoutConfig,
  SiteRedirectRule,
  SiteSettings,
  ThemeConfig,
} from '@backy-cms/core';

type AdminSiteStatus = 'draft' | 'published' | 'scheduled' | 'archived';

export interface ApiSite {
  id: string;
  name: string;
  slug: string;
  description?: string | null;
  customDomain?: string | null;
  status?: AdminSiteStatus;
  isPublished?: boolean;
  theme?: ThemeConfig;
  settings?: SiteSettings;
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
    pagesCopied?: number;
  };
  error?: {
    message?: string;
    details?: unknown;
    code?: string;
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

export interface AdminFrontendDesignResponse {
  site: Pick<ApiSite, 'id' | 'slug' | 'name' | 'customDomain'>;
  frontendDesign: NonNullable<SiteSettings['frontendDesign']>;
  endpoints: {
    admin: string;
    publicManifest: string;
  };
  nextSteps: string[];
}

interface ApiSiteFrontendDesignResponse {
  success: boolean;
  data?: AdminFrontendDesignResponse;
  error?: {
    message?: string;
  };
}

export interface CollectionBindingPreset {
  id: string;
  name: string;
  collectionId: string;
  fieldKey: string;
  targetPath: string;
  sourcePath?: string;
  search?: string;
  filterField?: string;
  filterValue?: string;
  sortBy?: string;
  sortDirection?: 'asc' | 'desc';
  limit?: string;
  offset?: string;
  createdAt?: string;
  updatedAt: string;
  createdBy?: string | null;
  updatedBy?: string | null;
}

interface ApiCollectionBindingPresetsResponse {
  success: boolean;
  data?: {
    presets: CollectionBindingPreset[];
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
  parentId?: string | null;
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
    pagination?: ApiPagination;
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
    code?: string;
    message?: string;
    details?: unknown;
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
    pagination?: ApiPagination;
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
    pagination?: ApiPagination;
  };
  error?: {
    message?: string;
  };
}

interface ApiUserResponse {
  success: boolean;
  data?: {
    user: ApiUser;
    invite?: AdminInviteToken | null;
    inviteDelivery?: AdminUserDeliveryResult | null;
  };
  invite?: AdminInviteToken | null;
  error?: {
    message?: string;
  };
}

export type AdminTeamRole = 'owner' | 'admin' | 'editor' | 'viewer';

export interface AdminTeamMember {
  id: string;
  teamId: string;
  userId: string;
  email: string;
  name: string;
  avatarUrl?: string | null;
  role: AdminTeamRole;
  joinedAt: string;
}

export interface AdminTeam {
  id: string;
  name: string;
  slug: string;
  ownerId?: string | null;
  avatarUrl?: string | null;
  createdAt: string;
  members: AdminTeamMember[];
  plan?: 'free' | 'pro' | 'enterprise';
  settings?: Record<string, unknown>;
  workspace?: {
    siteCount: number;
    publishedSiteCount: number;
    draftSiteCount: number;
    archivedSiteCount: number;
    sites: Array<{
      id: string;
      name: string;
      slug: string;
      customDomain?: string | null;
      status: string;
      updatedAt?: string | null;
    }>;
  };
}

interface ApiTeamResponse {
  success: boolean;
  data?: {
    team: AdminTeam;
  };
  error?: {
    code?: string;
    message?: string;
    details?: unknown;
  };
}

interface ApiListTeamsResponse {
  success: boolean;
  data?: {
    teams: AdminTeam[];
  };
  error?: {
    code?: string;
    message?: string;
    details?: unknown;
  };
}

interface ApiTeamMemberResponse {
  success: boolean;
  data?: {
    member: AdminTeamMember;
    invite?: AdminInviteToken | null;
    inviteDelivery?: AdminUserDeliveryResult | null;
  };
  error?: {
    code?: string;
    message?: string;
    details?: unknown;
  };
}

interface ApiTeamMemberDeleteResponse {
  success: boolean;
  data?: {
    removed: boolean;
  };
  error?: {
    code?: string;
    message?: string;
    details?: unknown;
  };
}

interface ApiBulkUsersResponse {
  success: boolean;
  data?: {
    action: 'delete' | 'updateStatus';
    updated: number;
    deleted: number;
    userIds: string[];
    users: ApiUser[];
  };
  error?: {
    message?: string;
  };
}

interface ApiImportUsersResponse {
  success: boolean;
  data?: {
    users: ApiUser[];
    import: UserImportResult;
  };
  error?: {
    message?: string;
    details?: unknown;
  };
}

interface ApiUserImportRollbackResponse {
  success: boolean;
  data?: {
    rollback: UserImportRollbackResult;
  };
  error?: {
    message?: string;
    details?: unknown;
  };
}

export type AdminPermissionCapability =
  | 'view'
  | 'create'
  | 'edit'
  | 'publish'
  | 'delete'
  | 'manage'
  | 'export'
  | 'configure';

export interface AdminPermissionRule {
  key: string;
  label: string;
  capability: AdminPermissionCapability;
  allowed: boolean;
  source: 'role' | 'status' | 'override';
  override: AdminPermissionOverrideValue | null;
  reason: string;
}

export type AdminPermissionOverrideValue = 'allow' | 'deny';

export interface AdminPermissionGroup {
  key: string;
  label: string;
  description: string;
  permissions: AdminPermissionRule[];
}

export interface AdminUserPermissionMatrix {
  userId: string;
  role: User['role'];
  status: User['status'];
  canSignIn: boolean;
  summary: {
    allowed: number;
    total: number;
    blockedByStatus: boolean;
  };
  groups: AdminPermissionGroup[];
}

interface ApiUserPermissionsResponse {
  success: boolean;
  data?: {
    permissions: AdminUserPermissionMatrix;
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
    pagination?: ApiPagination;
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
    code?: string;
    message?: string;
    details?: unknown;
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
  requestId?: string;
  data?: {
    submission: FormSubmission;
    delivery?: FormWebhookRetryDelivery;
  };
  submission?: FormSubmission;
  delivery?: FormWebhookRetryDelivery;
  error?: {
    message?: string;
  };
}

interface ApiFormConsentRetentionResponse {
  success: boolean;
  data?: FormConsentRetentionResult;
  error?: {
    message?: string;
  };
}

interface ApiFormEmbedBlockResponse {
  success: boolean;
  data?: {
    section: ApiReusableSection;
    embed?: {
      definitionUrl: string;
      submitUrl: string;
    };
  };
  error?: {
    message?: string;
  };
}

interface ApiFormsAnalyticsResponse {
  success: boolean;
  data?: {
    analytics: FormsAnalytics;
    generatedAt: string;
  };
  error?: {
    message?: string;
  };
}

interface ApiListFormDeliveryEventsResponse {
  success: boolean;
  data?: {
    events: FormDeliveryEvent[];
    count?: number;
    pagination?: ApiPagination;
  };
  events?: FormDeliveryEvent[];
  count?: number;
  pagination?: ApiPagination;
  error?: {
    message?: string;
  };
}

interface ApiListCommentDeliveryEventsResponse {
  success: boolean;
  data?: {
    events: CommentDeliveryEvent[];
    count?: number;
    pagination?: ApiPagination;
  };
  events?: CommentDeliveryEvent[];
  count?: number;
  pagination?: ApiPagination;
  error?: {
    message?: string;
  };
}

interface ApiCommentDeliveryRetryResponse {
  success: boolean;
  requestId?: string;
  data?: {
    delivery: CommentDeliveryRetryDelivery;
    retryOf: string;
    comment: Comment;
  };
  delivery?: CommentDeliveryRetryDelivery;
  retryOf?: string;
  comment?: Comment;
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

interface ApiContactSegmentsResponse {
  success: boolean;
  data?: {
    analytics: ContactSegmentAnalytics;
  };
  segments?: ContactSegment[];
  summary?: ContactSegmentSummary;
  error?: {
    message?: string;
  };
}

interface ApiContactSavedListsResponse {
  success: boolean;
  data?: {
    lists: ContactSavedList[];
    count?: number;
    list?: SiteContactSavedList;
    created?: boolean;
    updated?: boolean;
    deleted?: boolean;
    listId?: string;
  };
  lists?: ContactSavedList[];
  list?: SiteContactSavedList;
  error?: {
    message?: string;
    details?: unknown;
  };
}

interface ApiContactSyncResponse {
  success: boolean;
  data?: {
    formId: string;
    delivery: ContactSyncDelivery;
  };
  error?: {
    message?: string;
    details?: unknown;
  };
}

interface ApiContactConsentRetentionResponse {
  success: boolean;
  data?: ContactConsentRetentionResult;
  error?: {
    message?: string;
    details?: unknown;
  };
}

interface ApiContactResponse {
  success: boolean;
  data?: {
    contact: Contact;
    created?: boolean;
    updated?: boolean;
  };
  contact?: Contact;
  error?: {
    message?: string;
    details?: unknown;
  };
}

interface ApiContactPromotionResponse {
  success: boolean;
  data?: {
    contact: Contact;
    user: ApiUser;
    existingUser: boolean;
    invite?: {
      id: string;
      token: string;
      inviteUrl: string;
      expiresAt: string;
    } | null;
  };
  contact?: Contact;
  user?: ApiUser;
  invite?: {
    id: string;
    token: string;
    inviteUrl: string;
    expiresAt: string;
  } | null;
  error?: {
    message?: string;
    details?: unknown;
  };
}

interface ApiContactCustomerPromotionResponse {
  success: boolean;
  data?: {
    contact: Contact;
    collection: ApiCollection;
    record: ApiCollectionRecord;
    existingRecord: boolean;
    createdCollection?: boolean;
  };
  contact?: Contact;
  collection?: ApiCollection;
  record?: ApiCollectionRecord;
  error?: {
    message?: string;
    details?: unknown;
  };
}

interface ApiImportContactsResponse {
  success: boolean;
  data?: {
    formId: string;
    contacts: Contact[];
    import: ContactImportResult;
  };
  error?: {
    message?: string;
    details?: unknown;
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

interface ApiCreateCommentResponse {
  success: boolean;
  data?: {
    comment: Comment;
    message?: string;
  };
  comment?: Comment;
  message?: string;
  error?: {
    message?: string;
    details?: unknown;
  };
}

interface ApiCommentAnalyticsResponse {
  success: boolean;
  data?: {
    analytics: CommentAnalytics;
  };
  analytics?: CommentAnalytics;
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

interface ApiUpdateCommentResponse {
  success: boolean;
  data?: {
    comment: Comment;
  };
  comment?: Comment;
  error?: {
    message?: string;
    details?: unknown;
  };
}

interface ApiDeleteCommentResponse {
  success: boolean;
  data?: {
    deleted: Comment[];
    deletedCount: number;
  };
  deleted?: Comment[];
  deletedCount?: number;
  error?: {
    message?: string;
    details?: unknown;
  };
}

interface ApiListCommentBlocklistResponse {
  success: boolean;
  data?: {
    siteId: string;
    blocklist: AdminCommentBlocklistEntry[];
    count: number;
    pagination?: ApiPagination;
  };
  blocklist?: AdminCommentBlocklistEntry[];
  count?: number;
  pagination?: ApiPagination;
  error?: {
    message?: string;
  };
}

interface ApiDeleteCommentBlocklistResponse {
  success: boolean;
  data?: {
    siteId: string;
    deleted: AdminCommentBlocklistEntry[];
    deletedCount: number;
    missingIds: string[];
  };
  deleted?: AdminCommentBlocklistEntry[];
  deletedCount?: number;
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
  runtimeMediaScanner?: SiteSettingsInput['runtimeMediaScanner'];
  runtimeVercel?: SiteSettingsInput['runtimeVercel'];
  updatedAt?: string;
}

export interface ApiKeyRotationHistoryEntry {
  id: string;
  scope: 'all' | 'public' | 'admin';
  rotatedAt: string;
  actorId?: string | null;
  requestId?: string | null;
  publicKeyChanged?: boolean;
  adminKeyChanged?: boolean;
  previousPublicKeyFingerprint?: string | null;
  newPublicKeyFingerprint?: string | null;
  previousAdminKeyFingerprint?: string | null;
  newAdminKeyFingerprint?: string | null;
}

export interface ApiKeyRevocationHistoryEntry {
  id: string;
  scope: 'all' | 'public' | 'admin';
  keyType: 'public' | 'admin';
  revokedAt: string;
  actorId?: string | null;
  requestId?: string | null;
  reason?: 'rotated' | 'replaced' | 'manual';
  revokedKeyFingerprint?: string | null;
  replacementKeyFingerprint?: string | null;
}

export interface ApiKeyServiceKeyEntry {
  id: string;
  label: string;
  keyPrefix?: string | null;
  keyFingerprint?: string | null;
  createdAt: string;
  createdBy?: string | null;
  requestId?: string | null;
  lastUsedAt?: string | null;
  revokedAt?: string | null;
  revokedBy?: string | null;
  revokedRequestId?: string | null;
  status?: 'active' | 'revoked';
}

export interface IssuedAdminApiKey {
  id: string;
  label: string;
  adminApiKey: string;
  keyFingerprint?: string | null;
  keyPrefix?: string | null;
}

interface ApiSettingsResponse {
  success: boolean;
  data?: {
    settings: ApiSettings;
    issuedKey?: IssuedAdminApiKey;
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
  validation?: Record<string, unknown>;
}

interface ApiCollection {
  id: string;
  siteId: string;
  name: string;
  slug: string;
  routePattern?: string | null;
  listRoutePattern?: string | null;
  description?: string | null;
  status: 'draft' | 'published' | 'archived';
  fields: ApiCollectionField[];
  permissions: {
    publicRead: boolean;
    publicCreate: boolean;
    publicUpdate: boolean;
    publicDelete: boolean;
  };
  metadata?: Record<string, unknown>;
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
    pagination?: ApiPagination;
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
    code?: string;
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
    code?: string;
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
    code?: string;
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
    code?: string;
    message?: string;
    details?: unknown;
  };
}

interface ApiExportCollectionsBackupResponse {
  success: boolean;
  data?: CollectionBackupExport;
  error?: {
    code?: string;
    message?: string;
    details?: unknown;
  };
}

interface ApiImportCollectionsBackupResponse {
  success: boolean;
  data?: {
    import: CollectionBackupImportSummary;
    collections: ApiCollection[];
    records: ApiCollectionRecord[];
  };
  error?: {
    code?: string;
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
  metadata?: Record<string, unknown>;
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
    details?: unknown;
    code?: string;
  };
}

interface ApiExportReusableSectionsResponse {
  success: boolean;
  data?: {
    export: ReusableSectionsExportSummary;
    sections: ReusableSectionExportEntry[];
  };
  error?: {
    message?: string;
    details?: unknown;
    code?: string;
  };
}

interface ApiImportReusableSectionsResponse {
  success: boolean;
  data?: {
    import: ReusableSectionsImportSummary;
    sections: ApiReusableSection[];
    cacheInvalidation?: unknown;
  };
  error?: {
    message?: string;
    details?: unknown;
    code?: string;
  };
}

interface ApiReusableSectionVersionsResponse {
  success: boolean;
  data?: {
    sectionId: string;
    currentVersion: number;
    versions: ReusableSectionVersion[];
  };
  error?: {
    message?: string;
    details?: unknown;
    code?: string;
  };
}

interface ApiReusableSectionRestoreResponse {
  success: boolean;
  data?: {
    restored: boolean;
    restoredFromVersion: number;
    version: number;
    section: ApiReusableSection;
    cacheInvalidation?: unknown;
  };
  error?: {
    message?: string;
    details?: unknown;
    code?: string;
  };
}

interface ApiReusableSectionInstancesResponse {
  success: boolean;
  data?: ReusableSectionInstancesReport;
  error?: {
    message?: string;
    details?: unknown;
    code?: string;
  };
}

interface ApiReusableSectionInstancesRefreshResponse {
  success: boolean;
  data?: ReusableSectionInstancesRefreshResult;
  error?: {
    message?: string;
    details?: unknown;
    code?: string;
  };
}

interface ApiReusableSectionMetadataResponse {
  success: boolean;
  data?: {
    sectionId: string;
    metadata: Record<string, unknown>;
    library: ReusableSectionLibraryMetadata;
    version: number;
  };
  error?: {
    message?: string;
    details?: unknown;
    code?: string;
  };
}

interface ApiReusableSectionMetadataUpdateResponse {
  success: boolean;
  data?: {
    section: ApiReusableSection;
    metadata: Record<string, unknown>;
    library: ReusableSectionLibraryMetadata;
    version: number;
    cacheInvalidation?: unknown;
  };
  error?: {
    message?: string;
    details?: unknown;
    code?: string;
  };
}

export interface SiteCreateInput {
  name: string;
  slug: string;
  teamId?: string;
  description?: string;
  customDomain?: string | null;
  status?: Site['status'];
  theme?: Partial<ThemeConfig>;
  settings?: Partial<SiteSettings>;
}

export interface UserInput {
  fullName: string;
  email: string;
  role: User['role'];
  status?: User['status'];
  createInvite?: boolean;
}

export interface AdminInviteToken {
  id: string;
  token: string;
  userId?: string;
  email?: string;
  createdAt?: string;
  expiresAt: string;
  requestedById?: string | null;
  deliveryConfigured?: boolean;
  inviteUrl: string;
  delivery?: AdminUserDeliveryResult | null;
}

export interface AdminUserDeliveryResult {
  attempted: boolean;
  provider: 'local-outbox' | 'http-endpoint' | 'resend' | 'smtp';
  status: 'queued' | 'failed';
  deliveryConfigured: boolean;
  statusCode?: number;
  error?: string;
  metadata?: Record<string, unknown>;
}

export interface UserCreateResult {
  user: User;
  invite?: AdminInviteToken | null;
}

export interface UserUpdateInput {
  fullName?: string;
  email?: string;
  role?: User['role'];
  status?: User['status'];
}

export type UserBulkInput =
  | {
      action: 'updateStatus';
      userIds: string[];
      status: User['status'];
    }
  | {
      action: 'delete';
      userIds: string[];
    };

export interface UserBulkResult {
  action: 'delete' | 'updateStatus';
  updated: number;
  deleted: number;
  userIds: string[];
  users: User[];
}

export interface UserImportError {
  row: number;
  email?: string;
  message: string;
}

export interface UserImportResult {
  mode?: 'create' | 'upsert';
  dryRun?: boolean;
  created: number;
  updated: number;
  skipped: number;
  errors: UserImportError[];
  rollbackAvailable?: boolean;
  rollbackRequestId?: string | null;
}

export interface UserImportRollbackResult {
  importRequestId?: string | null;
  importAction?: string;
  deleted: number;
  restored: number;
  skipped: Array<{
    userId: string;
    email: string;
    reason: string;
  }>;
  deletedUserIds: string[];
  restoredUserIds: string[];
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
    apiKeyServiceKeys?: ApiKeyServiceKeyEntry[];
    apiKeyRotationHistory?: ApiKeyRotationHistoryEntry[];
    apiKeyRevocationHistory?: ApiKeyRevocationHistoryEntry[];
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
    commerce?: {
      mode?: 'catalog-only' | 'manual-orders' | 'checkout-provider';
      currency?: string;
      paymentProvider?: 'none' | 'stripe' | 'manual';
      providerMode?: 'test' | 'live';
      providerAccountId?: string;
      providerWebhookUrl?: string;
      providerWebhookSecretId?: string;
      providerWebhookEvents?: string;
      reconciliationMode?: 'manual' | 'webhook' | 'scheduled';
      reconciliationWindowHours?: number;
      checkoutSuccessPath?: string;
      checkoutCancelPath?: string;
      guestCheckout?: boolean;
      taxEnabled?: boolean;
      shippingEnabled?: boolean;
      discountsEnabled?: boolean;
      taxRatePercent?: number;
      digitalTaxRatePercent?: number;
      shippingBaseAmount?: number;
      shippingWeightRate?: number;
      discountPercent?: number;
      inventoryReservations?: boolean;
      reservationMinutes?: number;
      webhookEventsEnabled?: boolean;
    };
    notifications?: {
      email?: {
        newUser?: boolean;
        pagePublished?: boolean;
        formSubmission?: boolean;
        comments?: boolean;
        systemUpdates?: boolean;
        recipient?: string;
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
  runtimeMediaScanner?: {
    provider: string;
    enabled: boolean;
    configured: boolean;
    endpointConfigured?: boolean;
    host?: string;
    port?: number;
    apiKeyConfigured?: boolean;
    timeoutMs?: number;
    failOpen?: boolean;
    missing: string[];
    error?: string;
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

export interface SettingsInfrastructureDiagnosticCheck {
  label: string;
  ready: boolean;
  required: boolean;
  detail: string;
}

export interface SettingsInfrastructureDiagnostic {
  area: 'database' | 'storage' | 'supabase' | 'vercel';
  label: string;
  status: 'ready' | 'warning' | 'blocked';
  summary: string;
  missing: string[];
  checks: SettingsInfrastructureDiagnosticCheck[];
}

export interface SettingsInfrastructureCheckResult {
  diagnostics: SettingsInfrastructureDiagnostic[];
  generatedAt: string;
  requestId?: string;
}

export interface SettingsStorageProvisioningCheck {
  label: string;
  ready: boolean;
  detail: string;
}

export interface SettingsStorageProvisioningField {
  name: string;
  secret: boolean;
  required: boolean;
  detected: boolean;
}

export interface SettingsStorageProvisioningResult {
  provider: string;
  status: 'ready' | 'blocked';
  summary: string;
  probePath: string;
  automation?: {
    provider: string;
    action: 'create-or-verify-container';
    status: 'ready' | 'blocked';
    created: boolean;
    checked: boolean;
    target: string;
    detail: string;
  };
  checks: SettingsStorageProvisioningCheck[];
  rotation: {
    fields: SettingsStorageProvisioningField[];
    nextSteps: string[];
  };
  generatedAt: string;
}

interface ApiSettingsInfrastructureCheckResponse {
  success: boolean;
  requestId?: string;
  data?: SettingsInfrastructureCheckResult;
  error?: {
    message?: string;
  };
}

interface ApiSettingsStorageProvisioningResponse {
  success: boolean;
  data?: SettingsStorageProvisioningResult;
  error?: {
    message?: string;
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
  parentId?: string | null;
  meta?: Record<string, unknown>;
  content?: unknown;
}

export interface PageUpdateInput {
  title?: string;
  slug?: string;
  status?: Page['status'];
  scheduledAt?: string | null;
  description?: string;
  parentId?: string | null;
  meta?: Record<string, unknown>;
  content?: unknown;
  revisionNote?: string;
  updatedBy?: string;
  expectedUpdatedAt?: string;
}

export interface PageStatusMutationInput {
  expectedUpdatedAt?: string;
}

export interface BlogPostInput {
  title: string;
  slug: string;
  excerpt?: string;
  status?: BlogPost['status'];
  scheduledAt?: string | null;
  featuredImageId?: string | null;
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
  featuredImageId?: string | null;
  content?: unknown;
  meta?: Record<string, unknown>;
  authorId?: string | null;
  categoryIds?: string[];
  tagIds?: string[];
  revisionNote?: string;
  updatedBy?: string;
  expectedUpdatedAt?: string;
}

export interface BlogPostStatusMutationInput {
  expectedUpdatedAt?: string;
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
  spamSettings?: {
    minFillMs?: number;
    rateLimitWindowMs?: number;
    rateLimitMax?: number;
    duplicateWindowMs?: number;
    blockedTerms?: string[];
  };
  consentSettings?: {
    policyLabel?: string;
    retentionDays?: number;
    deleteAfterDays?: number;
    requestEmail?: string | null;
    exportIncludesIp?: boolean;
  };
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
  settings?: Record<string, unknown>;
  createdBy?: string | null;
  updatedBy?: string | null;
  createdAt: string;
  updatedAt: string;
}

export type FormDefinitionInput = Omit<FormDefinition, 'id' | 'siteId' | 'createdAt' | 'updatedAt'> & {
  id?: string;
  siteId?: string;
};

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

export interface FormDeliveryEvent {
  id: string;
  siteId: string;
  kind: string;
  formId?: string | null;
  commentId?: string | null;
  submissionId?: string | null;
  target: string;
  status: 'queued' | 'succeeded' | 'failed' | 'received' | string;
  statusCode?: number;
  requestId?: string | null;
  reason?: string | null;
  actor?: string | null;
  metadata?: Record<string, unknown>;
  error?: string;
  createdAt: string;
}

export interface CommentDeliveryEvent {
  id: string;
  siteId: string;
  kind: 'comment-submitted' | 'comment-status' | 'comment-reported' | string;
  commentId?: string | null;
  target: string;
  status: 'queued' | 'succeeded' | 'failed' | 'received' | string;
  statusCode?: number;
  requestId?: string | null;
  reason?: string | null;
  actor?: string | null;
  metadata?: Record<string, unknown>;
  error?: string;
  createdAt: string;
}

export interface CommentDeliveryEventList {
  events: CommentDeliveryEvent[];
  count: number;
  pagination?: ApiPagination;
}

export interface CommentDeliveryRetryDelivery {
  attempted: boolean;
  channel?: 'webhook' | 'email' | string;
  target?: string;
  status: 'queued' | 'succeeded' | 'failed' | string;
  statusCode?: number;
  provider?: string;
  error?: string;
  metadata?: Record<string, unknown>;
}

export interface FormDeliveryEventList {
  events: FormDeliveryEvent[];
  count: number;
  pagination?: ApiPagination;
}

export interface FormWebhookRetryDelivery {
  attempted: boolean;
  target?: string;
  status: 'queued' | 'succeeded' | 'failed' | string;
  statusCode?: number;
  error?: string;
}

export interface FormConsentRetentionResult {
  formId: string;
  dryRun: boolean;
  policy: {
    deleteAfterDays: number;
    now: string;
  };
  consentFieldKeys: string[];
  scanned: number;
  due: number;
  anonymized: number;
  submissions: FormSubmission[];
}

export interface FormsAnalytics {
  summary: {
    forms: number;
    activeForms: number;
    inactiveForms: number;
    submissions: number;
    pending: number;
    approved: number;
    rejected: number;
    spam: number;
    routedToCollections: number;
    conversionRate: number;
    spamRate: number;
  };
  trend: Array<{
    date: string;
    total: number;
    pending: number;
    approved: number;
    rejected: number;
    spam: number;
  }>;
  forms: Array<{
    formId: string;
    name: string;
    title: string | null;
    isActive: boolean;
    submissions: number;
    pending: number;
    approved: number;
    rejected: number;
    spam: number;
    routedToCollections: number;
    lastSubmittedAt: string | null;
  }>;
  leads?: {
    summary: {
      contacts: number;
      captureRate: number;
      lifecycle: Record<ContactStatus, number>;
      quality: {
        missingEmail: number;
        missingPhone: number;
        needsNotes: number;
        hasSourceValues: number;
        readyToPromote: number;
        duplicateEmail: number;
        duplicateEmailGroups: number;
      };
      savedLists: number;
    };
    segments: ContactSegment[];
    savedLists: ContactSavedList[];
    forms: Array<{
      formId: string;
      name: string;
      title: string | null;
      contactShareEnabled: boolean;
      contacts: number;
      qualified: number;
      readyToPromote: number;
    }>;
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

export interface ContactSegment {
  id: ContactStatus | 'all' | 'missing-email' | 'missing-phone' | 'needs-notes' | 'has-source-values' | 'ready-to-promote' | 'duplicate-email';
  label: string;
  kind: 'system' | 'lifecycle' | 'quality';
  count: number;
  contactIds: string[];
  formIds: string[];
  description: string;
}

export interface ContactSegmentSummary {
  forms: number;
  contacts: number;
  lifecycle: Record<ContactStatus, number>;
  quality: {
    missingEmail: number;
    missingPhone: number;
    needsNotes: number;
    hasSourceValues: number;
    readyToPromote: number;
    duplicateEmail: number;
    duplicateEmailGroups: number;
  };
}

export interface ContactSegmentAnalytics {
  summary: ContactSegmentSummary;
  segments: ContactSegment[];
  forms: Array<{
    id: string;
    name: string;
    title: string | null;
    isActive: boolean;
    contactShare: {
      enabled: boolean;
      dedupeByEmail: boolean;
    };
  }>;
}

export interface ContactSavedList extends SiteContactSavedList {
  matchedCount: number;
  contactIds: string[];
  formIds: string[];
}

export interface ContactInput {
  name?: string | null;
  email?: string | null;
  phone?: string | null;
  notes?: string | null;
  status?: ContactStatus;
  pageId?: string | null;
  postId?: string | null;
  requestId?: string | null;
  sourceValues?: Record<string, unknown>;
  upsertByEmail?: boolean;
}

export interface ContactPromotionResult {
  contact: AdminContact;
  user: User;
  existingUser: boolean;
  invite?: {
    id: string;
    token: string;
    inviteUrl: string;
    expiresAt: string;
  } | null;
}

export interface ContactSyncDelivery {
  target: string;
  status: 'queued' | 'succeeded' | 'failed';
  statusCode?: number | null;
  error?: string | null;
  count: number;
  contactIds: string[];
}

export interface ContactSyncResult {
  formId: string;
  delivery: ContactSyncDelivery;
}

export interface ContactConsentEvidence {
  id: string;
  formId: string;
  pageId?: string | null;
  postId?: string | null;
  status: ContactStatus;
  name?: string | null;
  email?: string | null;
  phone?: string | null;
  requestId?: string | null;
  sourceSubmissionId?: string | null;
  sourceIpHash?: string | null;
  consentValues: Record<string, unknown>;
  dueAt?: string | null;
  due: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ContactConsentRetentionResult {
  formId: string;
  dryRun: boolean;
  policy: {
    deleteAfterDays: number;
    now: string;
  };
  consentFieldKeys: string[];
  scanned: number;
  due: number;
  anonymized: number;
  contacts: ContactConsentEvidence[];
}

export interface ContactCustomerPromotionResult {
  contact: AdminContact;
  collection: Collection;
  record: CollectionRecord;
  existingRecord: boolean;
  createdCollection: boolean;
}

export interface ContactImportResult {
  created: number;
  updated: number;
  skipped: number;
  errors: Array<{
    row: number;
    email?: string;
    message: string;
    details?: unknown;
  }>;
}

export type CommentModerationStatus = CommentStatus;
export type CommentModerationTarget = CommentTargetType | 'all';
export type CommentModerationSort = 'newest' | 'oldest';

export type AdminComment = Comment;

export interface AdminCommentBlocklistEntry {
  id: string;
  siteId: string;
  type: 'email' | 'ip';
  value: string;
  reason: string;
  actor?: string | null;
  requestId?: string | null;
  createdAt: string;
}

export interface CommentListFilters {
  status?: CommentStatus | 'all';
  targetType?: CommentModerationTarget;
  targetId?: string;
  requestId?: string;
  q?: string;
  parentOnly?: boolean;
  parentId?: string | null;
  commentThreadId?: string;
  sort?: CommentModerationSort;
  limit?: number;
  offset?: number;
}

export interface CommentListResult {
  comments: AdminComment[];
  count: number;
  pagination: ApiPagination;
}

export interface CommentBlocklistFilters {
  type?: 'email' | 'ip' | 'all';
  q?: string;
  limit?: number;
  offset?: number;
}

export interface CommentBlocklistResult {
  blocklist: AdminCommentBlocklistEntry[];
  count: number;
  pagination: ApiPagination;
}

export interface CreateCommentInput {
  targetType: CommentTargetType;
  targetId: string;
  content: string;
  authorName?: string;
  authorEmail?: string;
  authorWebsite?: string;
  parentId?: string | null;
  commentThreadId?: string;
  moderationMode?: 'manual' | 'auto-approve';
  requestId?: string;
}

export interface CommentAnalytics {
  siteId: string;
  generatedAt: string;
  windowDays: number;
  totals: {
    comments: number;
    allTimeComments: number;
    pending: number;
    approved: number;
    rejected: number;
    spam: number;
    blocked: number;
    reported: number;
    reviewed: number;
    unreviewed: number;
    replies: number;
  };
  byStatus: Record<CommentModerationStatus, number>;
  reports: {
    comments: number;
    reasons: Array<{ reason: string; count: number }>;
  };
  threads: {
    total: number;
    withReplies: number;
    reported: number;
    pendingReplies: number;
    top: Array<{
      id: string;
      targetType: CommentTargetType;
      targetId: string;
      total: number;
      replies: number;
      pending: number;
      reported: number;
      latestAt: string;
    }>;
  };
  targets: Array<{
    targetType: CommentTargetType;
    targetId: string;
    total: number;
    pending: number;
    reported: number;
    replies: number;
  }>;
  daily: Array<{
    date: string;
    submitted: number;
    reviewed: number;
    reported: number;
  }>;
}

export interface UpdateCommentsInput {
  commentIds: string[];
  status?: CommentStatus;
  action?: 'clearReports';
  clearReports?: boolean;
  reviewedBy?: string | null;
  actor?: string | null;
  rejectionReason?: string | null;
  blockReason?: string | null;
}

export interface UpdateCommentThreadInput {
  parentId: string | null;
  commentThreadId?: string | null;
  actor?: string | null;
  requestId?: string;
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

export interface ContentRevisionSummary {
  count: number;
  latest: ContentRevision | null;
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
  validation?: Record<string, unknown>;
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
  metadata?: Record<string, unknown>;
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
  metadata?: Record<string, unknown>;
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

export interface CollectionBackupRecord {
  sourceRecordId?: string;
  slug: string;
  status: Page['status'];
  values: Record<string, unknown>;
  publishedAt?: string | null;
  scheduledAt?: string | null;
}

export interface CollectionBackupCollection {
  sourceCollectionId?: string;
  name: string;
  slug: string;
  description?: string | null;
  status: Collection['status'];
  routePattern?: string | null;
  listRoutePattern?: string | null;
  fields: CollectionField[];
  permissions?: Partial<CollectionPermissions>;
  metadata?: Record<string, unknown>;
  records: CollectionBackupRecord[];
}

export interface CollectionBackupExport {
  backup: {
    schemaVersion: 'backy.collections.backup.v1';
    exportedAt: string;
    siteId: string;
    siteSlug?: string;
    collectionCount: number;
    recordCount: number;
  };
  collections: CollectionBackupCollection[];
}

export interface CollectionBackupImportSummary {
  createdCollections: number;
  updatedCollections: number;
  createdRecords: number;
  updatedRecords: number;
  totalCollections: number;
  totalRecords: number;
}

export interface CollectionBackupImportResult {
  import: CollectionBackupImportSummary;
  collections: Collection[];
  records: CollectionRecord[];
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
  metadata?: Record<string, unknown>;
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
  metadata?: Record<string, unknown>;
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

export interface ReusableSectionsExportFilters extends ReusableSectionListFilters {
  sectionIds?: string[];
}

export interface ReusableSectionsExportSummary {
  schemaVersion: 'backy.reusable-sections.export.v1' | string;
  exportedAt: string;
  siteId: string;
  siteSlug?: string;
  sectionCount: number;
}

export interface ReusableSectionExportEntry {
  sourceSectionId?: string;
  name: string;
  slug: string;
  description?: string | null;
  category?: string;
  status?: ReusableSection['status'];
  tags?: string[];
  content: ReusableSectionContent;
  metadata?: Record<string, unknown>;
  sourceElementId?: string | null;
}

export interface ReusableSectionsExport {
  export: ReusableSectionsExportSummary;
  sections: ReusableSectionExportEntry[];
}

export interface ReusableSectionsImportSummary {
  created: number;
  updated: number;
  total: number;
}

export interface ReusableSectionsImportInput {
  sections: ReusableSectionExportEntry[];
  upsert?: boolean;
  importedBy?: string;
}

export interface ReusableSectionsImportResult {
  import: ReusableSectionsImportSummary;
  sections: ReusableSection[];
  cacheInvalidation?: unknown;
}

export interface ReusableSectionVersion {
  version: number;
  current?: boolean;
  capturedAt?: string;
  requestId?: string;
  name: string;
  slug: string;
  description?: string | null;
  category: string;
  status: string;
  tags: string[];
  content: unknown;
  sourceElementId?: string | null;
  updatedBy?: string | null;
  updatedAt: string;
}

export interface ReusableSectionVersions {
  sectionId: string;
  currentVersion: number;
  versions: ReusableSectionVersion[];
}

export interface ReusableSectionVersionRestoreInput {
  expectedVersion?: number;
  expectedUpdatedAt?: string;
  restoredBy?: string;
  updatedBy?: string;
}

export interface ReusableSectionVersionRestoreResult {
  restored: boolean;
  restoredFromVersion: number;
  version: number;
  section: ReusableSection;
  cacheInvalidation?: unknown;
}

export interface ReusableSectionInstance {
  elementId: string;
  elementType: string;
  path: string;
  mode: string;
  sourceUpdatedAt?: string;
  stale: boolean;
}

export interface ReusableSectionInstanceTargetReport {
  type: 'page' | 'post';
  id: string;
  title: string;
  slug: string;
  status?: string;
  updatedAt?: string;
  instances: ReusableSectionInstance[];
}

export interface ReusableSectionInstancesReport {
  sectionId: string;
  sourceUpdatedAt?: string;
  targets: ReusableSectionInstanceTargetReport[];
  totals: {
    targets: number;
    instances: number;
    stale: number;
  };
}

export interface ReusableSectionInstancesFilters {
  targetType?: 'page' | 'post' | 'all';
  targetId?: string;
}

export interface ReusableSectionInstancesRefreshInput extends ReusableSectionInstancesFilters {
  dryRun?: boolean;
  updatedBy?: string;
}

export interface ReusableSectionInstancesRefreshResult {
  dryRun: boolean;
  sectionId: string;
  sourceUpdatedAt?: string;
  refreshedTargets: Array<{
    type: 'page' | 'post';
    id: string;
    title: string;
    slug: string;
    refreshed: number;
  }>;
  totals: {
    targets: number;
    instances: number;
  };
  cacheInvalidation?: unknown;
}

export interface ReusableSectionLibraryMetadata {
  displayName?: string;
  summary?: string;
  usageNotes?: string;
  thumbnailMediaId?: string;
  frontendDesignTemplateId?: string;
  previewPath?: string;
  labels?: string[];
  owner?: Record<string, unknown>;
  designSystem?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface ReusableSectionMetadata {
  sectionId: string;
  metadata: Record<string, unknown>;
  library: ReusableSectionLibraryMetadata;
  version: number;
}

export interface ReusableSectionMetadataPatchInput {
  expectedVersion?: number;
  expectedUpdatedAt?: string;
  updatedBy?: string;
  metadata?: Record<string, unknown>;
  displayName?: string | null;
  summary?: string | null;
  usageNotes?: string | null;
  thumbnailMediaId?: string | null;
  frontendDesignTemplateId?: string | null;
  previewPath?: string | null;
  labels?: string[] | string | null;
  owner?: Record<string, unknown> | null;
  designSystem?: Record<string, unknown> | null;
}

export interface ReusableSectionMetadataUpdateResult extends ReusableSectionMetadata {
  section: ReusableSection;
  cacheInvalidation?: unknown;
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

const getAdminApiKey = (): string => {
  if (typeof window !== 'undefined') return '';

  return (
    getEnvValue('VITE_BACKY_ADMIN_API_KEY') ||
    getEnvValue('VITE_ADMIN_API_KEY') ||
    ''
  );
};

const getAdminSessionToken = (): string => {
  if (typeof window === 'undefined') return '';

  try {
    const raw = window.localStorage.getItem('backy-auth-storage');
    const parsed = raw ? JSON.parse(raw) as { state?: { session?: { token?: unknown } } } : null;
    return typeof parsed?.state?.session?.token === 'string' ? parsed.state.session.token : '';
  } catch {
    return '';
  }
};

export const adminFetch: typeof globalThis.fetch = (input, init = {}) => {
  const apiKey = getAdminApiKey();
  const sessionToken = getAdminSessionToken();
  const headers = new Headers(init.headers);

  if (sessionToken && !headers.has('authorization')) {
    headers.set('authorization', `Bearer ${sessionToken}`);
  }

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
  theme: site.theme,
  settings: site.settings,
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
  parentId: page.parentId || null,
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
  updatedAt: post.updatedAt || post.createdAt || new Date().toISOString(),
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
  validation: field.validation,
});

const toCollection = (collection: ApiCollection): Collection => ({
  id: collection.id,
  siteId: collection.siteId,
  name: collection.name,
  slug: collection.slug,
  routePattern: collection.routePattern || null,
  listRoutePattern: collection.listRoutePattern || null,
  description: collection.description || null,
  status: collection.status || 'draft',
  fields: (collection.fields || []).map(toCollectionField),
  permissions: {
    publicRead: collection.permissions?.publicRead === true,
    publicCreate: collection.permissions?.publicCreate === true,
    publicUpdate: collection.permissions?.publicUpdate === true,
    publicDelete: collection.permissions?.publicDelete === true,
  },
  metadata: collection.metadata || {},
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
  metadata: section.metadata || {},
  sourceElementId: section.sourceElementId || null,
  createdBy: section.createdBy || null,
  updatedBy: section.updatedBy || null,
  createdAt: section.createdAt,
  updatedAt: section.updatedAt,
});

export class AdminContentApiError extends Error {
  details?: unknown;
  code?: string;

  constructor(message: string, details?: unknown, code?: string) {
    super(message);
    this.name = 'AdminContentApiError';
    this.details = details;
    this.code = code;
  }
}

const adminContentApiError = (
  payload: { error?: { message?: string; details?: unknown; code?: string } },
  fallback: string,
) => new AdminContentApiError(
  payload.error?.message || fallback,
  payload.error?.details,
  payload.error?.code,
);

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
    throw new AdminContentApiError(
      payload.error?.message || 'Unable to create site',
      payload.error?.details,
      payload.error?.code,
    );
  }

  return toStoreSite(payload.data.site);
}

export async function duplicateSite(siteId: string, input: Partial<SiteCreateInput> = {}): Promise<Site> {
  const response = await adminFetch(`${getAdminApiBase()}/sites/${encodeURIComponent(siteId)}/duplicate`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
    },
    body: JSON.stringify(input),
  });
  const payload = await readJson<ApiSiteResponse>(response);

  if (!response.ok || !payload.success || !payload.data?.site) {
    throw new AdminContentApiError(
      payload.error?.message || 'Unable to duplicate site',
      payload.error?.details,
      payload.error?.code,
    );
  }

  return toStoreSite(payload.data.site);
}

export async function getAdminSite(siteId: string): Promise<ApiSite> {
  const response = await adminFetch(`${getAdminApiBase()}/sites/${encodeURIComponent(siteId)}`);
  const payload = await readJson<ApiSiteResponse>(response);

  if (!response.ok || !payload.success || !payload.data?.site) {
    throw new Error(payload.error?.message || 'Unable to load site');
  }

  return payload.data.site;
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
      ...(input.status === undefined ? {} : { isPublished: input.status === 'published' }),
    }),
  });
  const payload = await readJson<ApiSiteResponse>(response);

  if (!response.ok || !payload.success || !payload.data) {
    throw new Error(payload.error?.message || 'Unable to save site');
  }

  return toStoreSite(payload.data.site);
}

export async function getSiteFrontendDesign(siteId: string): Promise<AdminFrontendDesignResponse> {
  const response = await adminFetch(`${getAdminApiBase()}/sites/${encodeURIComponent(siteId)}/frontend-design`);
  const payload = await readJson<ApiSiteFrontendDesignResponse>(response);

  if (!response.ok || !payload.success || !payload.data) {
    throw new Error(payload.error?.message || 'Unable to load frontend design contract');
  }

  return payload.data;
}

export async function updateSiteFrontendDesign(
  siteId: string,
  frontendDesign: SiteSettings['frontendDesign'],
): Promise<AdminFrontendDesignResponse> {
  const response = await adminFetch(`${getAdminApiBase()}/sites/${encodeURIComponent(siteId)}/frontend-design`, {
    method: 'PATCH',
    headers: {
      'content-type': 'application/json',
    },
    body: JSON.stringify({ frontendDesign }),
  });
  const payload = await readJson<ApiSiteFrontendDesignResponse>(response);

  if (!response.ok || !payload.success || !payload.data) {
    throw new Error(payload.error?.message || 'Unable to save frontend design contract');
  }

  return payload.data;
}

export async function captureSiteFrontendDesignDefaults(siteId: string): Promise<AdminFrontendDesignResponse> {
  const response = await adminFetch(`${getAdminApiBase()}/sites/${encodeURIComponent(siteId)}/frontend-design`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
    },
    body: JSON.stringify({ action: 'capture-site-defaults' }),
  });
  const payload = await readJson<ApiSiteFrontendDesignResponse>(response);

  if (!response.ok || !payload.success || !payload.data) {
    throw new Error(payload.error?.message || 'Unable to capture frontend design defaults');
  }

  return payload.data;
}

export async function listCollectionBindingPresets(siteId: string): Promise<CollectionBindingPreset[]> {
  const response = await adminFetch(`${getAdminApiBase()}/sites/${encodeURIComponent(siteId)}/editor/collection-binding-presets`);
  const payload = await readJson<ApiCollectionBindingPresetsResponse>(response);

  if (!response.ok || !payload.success || !payload.data) {
    throw new Error(payload.error?.message || 'Unable to load collection binding presets');
  }

  return payload.data.presets;
}

export async function saveCollectionBindingPresets(
  siteId: string,
  presets: CollectionBindingPreset[],
): Promise<CollectionBindingPreset[]> {
  const response = await adminFetch(`${getAdminApiBase()}/sites/${encodeURIComponent(siteId)}/editor/collection-binding-presets`, {
    method: 'PATCH',
    headers: {
      'content-type': 'application/json',
    },
    body: JSON.stringify({ presets }),
  });
  const payload = await readJson<ApiCollectionBindingPresetsResponse>(response);

  if (!response.ok || !payload.success || !payload.data) {
    throw new Error(payload.error?.message || 'Unable to save collection binding presets');
  }

  return payload.data.presets;
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

const USER_LIST_PAGE_SIZE = 100;
const USER_LIST_MAX_PAGES = 100;

async function listUsersPage(offset: number): Promise<{
  users: User[];
  pagination?: ApiPagination;
}> {
  const query = new URLSearchParams({
    limit: String(USER_LIST_PAGE_SIZE),
    offset: String(offset),
  });
  const response = await adminFetch(`${getAdminApiBase()}/users?${query.toString()}`);
  const payload = await readJson<ApiListUsersResponse>(response);

  if (!response.ok || !payload.success || !payload.data) {
    throw new Error(payload.error?.message || 'Unable to load users');
  }

  return {
    users: payload.data.users.map(toStoreUser),
    pagination: payload.data.pagination,
  };
}

export async function listUsers(): Promise<User[]> {
  const users: User[] = [];
  let offset = 0;

  for (let pageIndex = 0; pageIndex < USER_LIST_MAX_PAGES; pageIndex += 1) {
    const result = await listUsersPage(offset);
    users.push(...result.users);

    if (!result.pagination?.hasMore) {
      return users;
    }

    const nextOffset = result.pagination.offset + result.pagination.limit;
    if (nextOffset <= offset) {
      break;
    }
    offset = nextOffset;
  }

  throw new Error('Unable to load all users because the user list exceeded the supported page limit.');
}

export async function getUser(userId: string): Promise<User> {
  const response = await adminFetch(`${getAdminApiBase()}/users/${userId}`);
  const payload = await readJson<ApiUserResponse>(response);

  if (!response.ok || !payload.success || !payload.data) {
    throw new Error(payload.error?.message || 'Unable to load user');
  }

  return toStoreUser(payload.data.user);
}

export async function getUserPermissions(userId: string): Promise<AdminUserPermissionMatrix> {
  const response = await adminFetch(`${getAdminApiBase()}/users/${userId}/permissions`);
  const payload = await readJson<ApiUserPermissionsResponse>(response);

  if (!response.ok || !payload.success || !payload.data) {
    throw adminContentApiError(payload, 'Unable to load user permissions');
  }

  return payload.data.permissions;
}

export async function updateUserPermissions(
  userId: string,
  overrides: Record<string, AdminPermissionOverrideValue | null>,
): Promise<AdminUserPermissionMatrix> {
  const response = await adminFetch(`${getAdminApiBase()}/users/${userId}/permissions`, {
    method: 'PATCH',
    headers: {
      'content-type': 'application/json',
    },
    body: JSON.stringify({ overrides }),
  });
  const payload = await readJson<ApiUserPermissionsResponse>(response);

  if (!response.ok || !payload.success || !payload.data) {
    throw new Error(payload.error?.message || 'Unable to update user permissions');
  }

  return payload.data.permissions;
}

export async function createUser(input: UserInput): Promise<UserCreateResult> {
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

  return {
    user: toStoreUser(payload.data.user),
    invite: payload.data.invite ?? payload.invite ?? null,
  };
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

export async function listTeams(): Promise<AdminTeam[]> {
  const response = await adminFetch(`${getAdminApiBase()}/teams`);
  const payload = await readJson<ApiListTeamsResponse>(response);

  if (!response.ok || !payload.success || !payload.data) {
    throw adminContentApiError(payload, 'Unable to load teams');
  }

  return payload.data.teams;
}

export async function createTeam(input: {
  name: string;
  slug?: string;
  settings?: Record<string, unknown>;
}): Promise<AdminTeam> {
  const response = await adminFetch(`${getAdminApiBase()}/teams`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
    },
    body: JSON.stringify(input),
  });
  const payload = await readJson<ApiTeamResponse>(response);

  if (!response.ok || !payload.success || !payload.data) {
    throw adminContentApiError(payload, 'Unable to create team');
  }

  return payload.data.team;
}

export async function updateTeam(
  teamId: string,
  input: {
    name?: string;
    slug?: string;
    settings?: Record<string, unknown>;
  },
): Promise<AdminTeam> {
  const response = await adminFetch(`${getAdminApiBase()}/teams/${encodeURIComponent(teamId)}`, {
    method: 'PATCH',
    headers: {
      'content-type': 'application/json',
    },
    body: JSON.stringify(input),
  });
  const payload = await readJson<ApiTeamResponse>(response);

  if (!response.ok || !payload.success || !payload.data) {
    throw adminContentApiError(payload, 'Unable to save team');
  }

  return payload.data.team;
}

export async function deleteTeam(teamId: string): Promise<void> {
  const response = await adminFetch(`${getAdminApiBase()}/teams/${encodeURIComponent(teamId)}`, {
    method: 'DELETE',
  });
  const payload = await readJson<ApiDeleteResponse>(response);

  if (!response.ok || !payload.success || !payload.data?.deleted) {
    throw adminContentApiError(payload, 'Unable to delete team');
  }
}

export async function inviteTeamMember(
  teamId: string,
  input: {
    email: string;
    role: AdminTeamRole;
    fullName?: string;
  },
): Promise<{ member: AdminTeamMember; invite?: AdminInviteToken | null; inviteDelivery?: AdminUserDeliveryResult | null }> {
  const response = await adminFetch(`${getAdminApiBase()}/teams/${encodeURIComponent(teamId)}/members`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
    },
    body: JSON.stringify(input),
  });
  const payload = await readJson<ApiTeamMemberResponse>(response);

  if (!response.ok || !payload.success || !payload.data) {
    throw adminContentApiError(payload, 'Unable to invite team member');
  }

  return {
    member: payload.data.member,
    invite: payload.data.invite ?? null,
    inviteDelivery: payload.data.inviteDelivery ?? null,
  };
}

export async function updateTeamMemberRole(
  teamId: string,
  memberId: string,
  role: AdminTeamRole,
): Promise<AdminTeamMember> {
  const response = await adminFetch(
    `${getAdminApiBase()}/teams/${encodeURIComponent(teamId)}/members/${encodeURIComponent(memberId)}`,
    {
      method: 'PATCH',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({ role }),
    },
  );
  const payload = await readJson<ApiTeamMemberResponse>(response);

  if (!response.ok || !payload.success || !payload.data) {
    throw adminContentApiError(payload, 'Unable to update team member');
  }

  return payload.data.member;
}

export async function removeTeamMember(teamId: string, memberId: string): Promise<void> {
  const response = await adminFetch(
    `${getAdminApiBase()}/teams/${encodeURIComponent(teamId)}/members/${encodeURIComponent(memberId)}`,
    {
      method: 'DELETE',
    },
  );
  const payload = await readJson<ApiTeamMemberDeleteResponse>(response);

  if (!response.ok || !payload.success || !payload.data?.removed) {
    throw adminContentApiError(payload, 'Unable to remove team member');
  }
}

export async function bulkUpdateUsers(input: UserBulkInput): Promise<UserBulkResult> {
  const response = await adminFetch(`${getAdminApiBase()}/users/bulk`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
    },
    body: JSON.stringify(input),
  });
  const payload = await readJson<ApiBulkUsersResponse>(response);

  if (!response.ok || !payload.success || !payload.data) {
    throw new Error(payload.error?.message || 'Unable to update selected users');
  }

  return {
    ...payload.data,
    users: payload.data.users.map(toStoreUser),
  };
}

export async function importUsersCsv(
  csv: string,
  options: { mode?: 'create' | 'upsert'; dryRun?: boolean } = {},
): Promise<UserImportResult> {
  const query = new URLSearchParams();
  if (options.mode === 'upsert') query.set('mode', 'upsert');
  if (options.dryRun) query.set('dryRun', 'true');

  const response = await adminFetch(`${getAdminApiBase()}/users/import?${query.toString()}`, {
    method: 'POST',
    headers: {
      'content-type': 'text/csv; charset=utf-8',
    },
    body: csv,
  });
  const payload = await readJson<ApiImportUsersResponse>(response);

  if (!response.ok || !payload.success || !payload.data) {
    throw new AdminContentApiError(payload.error?.message || 'Unable to import users', payload.error?.details);
  }

  return payload.data.import;
}

export async function rollbackUsersImport(requestId?: string | null): Promise<UserImportRollbackResult> {
  const response = await adminFetch(`${getAdminApiBase()}/users/import/rollback`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
    },
    body: JSON.stringify(requestId ? { requestId } : {}),
  });
  const payload = await readJson<ApiUserImportRollbackResponse>(response);

  if (!response.ok || !payload.success || !payload.data?.rollback) {
    throw new AdminContentApiError(payload.error?.message || 'Unable to roll back users import', payload.error?.details);
  }

  return payload.data.rollback;
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
    runtimeMediaScanner: payload.data.settings.runtimeMediaScanner,
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
    runtimeMediaScanner: payload.data.settings.runtimeMediaScanner,
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
    runtimeMediaScanner: payload.data.settings.runtimeMediaScanner,
    runtimeVercel: payload.data.settings.runtimeVercel,
  };
}

export async function issueSettingsAdminApiKey(label: string): Promise<{
  settings: SiteSettingsInput;
  issuedKey: IssuedAdminApiKey;
}> {
  const response = await adminFetch(`${getAdminApiBase()}/settings`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
    },
    body: JSON.stringify({ action: 'issue-admin-api-key', label }),
  });
  const payload = await readJson<ApiSettingsResponse>(response);

  if (!response.ok || !payload.success || !payload.data?.issuedKey) {
    throw new Error(payload.error?.message || 'Unable to issue admin API key');
  }

  return {
    settings: {
      deliveryMode: payload.data.settings.deliveryMode,
      apiKeys: payload.data.settings.apiKeys,
      auth: payload.data.settings.auth,
      runtimeStorage: payload.data.settings.runtimeStorage,
      integrations: payload.data.settings.integrations,
      runtimeDatabase: payload.data.settings.runtimeDatabase,
      runtimeSupabase: payload.data.settings.runtimeSupabase,
      runtimeMediaScanner: payload.data.settings.runtimeMediaScanner,
      runtimeVercel: payload.data.settings.runtimeVercel,
    },
    issuedKey: payload.data.issuedKey,
  };
}

export async function revokeSettingsAdminApiKey(keyId: string): Promise<SiteSettingsInput> {
  const response = await adminFetch(`${getAdminApiBase()}/settings`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
    },
    body: JSON.stringify({ action: 'revoke-admin-api-key', keyId }),
  });
  const payload = await readJson<ApiSettingsResponse>(response);

  if (!response.ok || !payload.success || !payload.data) {
    throw new Error(payload.error?.message || 'Unable to revoke admin API key');
  }

  return {
    deliveryMode: payload.data.settings.deliveryMode,
    apiKeys: payload.data.settings.apiKeys,
    auth: payload.data.settings.auth,
    runtimeStorage: payload.data.settings.runtimeStorage,
    integrations: payload.data.settings.integrations,
    runtimeDatabase: payload.data.settings.runtimeDatabase,
    runtimeSupabase: payload.data.settings.runtimeSupabase,
    runtimeMediaScanner: payload.data.settings.runtimeMediaScanner,
    runtimeVercel: payload.data.settings.runtimeVercel,
  };
}

export async function validateSettingsInfrastructure(input: Pick<SiteSettingsInput, 'deliveryMode' | 'integrations'>): Promise<SettingsInfrastructureCheckResult> {
  const response = await adminFetch(`${getAdminApiBase()}/settings`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
    },
    body: JSON.stringify({ action: 'validate-infrastructure', ...input }),
  });
  const payload = await readJson<ApiSettingsInfrastructureCheckResponse>(response);

  if (!response.ok || !payload.success || !payload.data) {
    throw new Error(payload.error?.message || 'Unable to validate infrastructure settings');
  }

  return {
    ...payload.data,
    requestId: payload.requestId,
  };
}

export async function runSettingsStorageProvisioningProbe(): Promise<SettingsStorageProvisioningResult> {
  const response = await adminFetch(`${getAdminApiBase()}/settings`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
    },
    body: JSON.stringify({ action: 'media-storage-provisioning-probe' }),
  });
  const payload = await readJson<ApiSettingsStorageProvisioningResponse>(response);

  if (!response.ok || !payload.success || !payload.data) {
    throw new Error(payload.error?.message || 'Unable to run media storage provisioning probe');
  }

  return payload.data;
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

const PAGE_LIST_PAGE_SIZE = 100;
const PAGE_LIST_MAX_PAGES = 100;

async function listPagesPage(siteId: string, offset: number): Promise<{
  pages: Page[];
  pagination?: ApiPagination;
}> {
  const query = new URLSearchParams({
    includeUnpublished: 'true',
    limit: String(PAGE_LIST_PAGE_SIZE),
    offset: String(offset),
  });
  const response = await adminFetch(`${getAdminApiBase()}/sites/${siteId}/pages?${query.toString()}`);
  const payload = await readJson<ApiListPagesResponse>(response);

  if (!response.ok || !payload.success || !payload.data) {
    throw new Error(payload.error?.message || 'Unable to load pages');
  }

  return {
    pages: payload.data.pages.map(toStorePage),
    pagination: payload.data.pagination,
  };
}

export async function listPages(siteId: string): Promise<Page[]> {
  const pages: Page[] = [];
  let offset = 0;

  for (let pageIndex = 0; pageIndex < PAGE_LIST_MAX_PAGES; pageIndex += 1) {
    const result = await listPagesPage(siteId, offset);
    pages.push(...result.pages);

    if (!result.pagination?.hasMore) {
      return pages;
    }

    const nextOffset = result.pagination.offset + result.pagination.limit;
    if (nextOffset <= offset) {
      break;
    }
    offset = nextOffset;
  }

  throw new Error('Unable to load all pages because the page list exceeded the supported page limit.');
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
    throw new AdminContentApiError(
      payload.error?.message || 'Unable to save page',
      payload.error?.details,
      payload.error?.code,
    );
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

export async function getPageRevisionSummary(siteId: string, pageId: string): Promise<ContentRevisionSummary> {
  const response = await adminFetch(`${getAdminApiBase()}/sites/${siteId}/pages/${pageId}/revisions?limit=1`);
  const payload = await readJson<ApiRevisionListResponse>(response);

  if (!response.ok || !payload.success || !payload.data) {
    throw new Error(payload.error?.message || 'Unable to load page revisions');
  }

  const revisions = payload.data.revisions.map(toContentRevision);
  return {
    count: payload.data.pagination?.total ?? revisions.length,
    latest: revisions[0] || null,
  };
}

export async function publishPage(siteId: string, pageId: string, input: PageStatusMutationInput = {}): Promise<Page> {
  const response = await adminFetch(`${getAdminApiBase()}/sites/${siteId}/pages/${pageId}/publish`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
    },
    body: JSON.stringify(input),
  });
  const payload = await readJson<ApiPageResponse>(response);

  if (!response.ok || !payload.success || !payload.data) {
    throw new AdminContentApiError(
      payload.error?.message || 'Unable to publish page',
      payload.error?.details,
      payload.error?.code,
    );
  }

  return toStorePage(payload.data.page);
}

export async function unpublishPage(siteId: string, pageId: string, input: PageStatusMutationInput = {}): Promise<Page> {
  return updatePage(siteId, pageId, {
    status: 'draft',
    scheduledAt: null,
    revisionNote: 'Before unpublish',
    expectedUpdatedAt: input.expectedUpdatedAt,
  });
}

export async function archivePage(siteId: string, pageId: string, input: PageStatusMutationInput = {}): Promise<Page> {
  const response = await adminFetch(`${getAdminApiBase()}/sites/${siteId}/pages/${pageId}/archive`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
    },
    body: JSON.stringify(input),
  });
  const payload = await readJson<ApiPageResponse>(response);

  if (!response.ok || !payload.success || !payload.data) {
    throw new AdminContentApiError(
      payload.error?.message || 'Unable to archive page',
      payload.error?.details,
      payload.error?.code,
    );
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
  const posts: BlogPost[] = [];
  const limit = 100;
  let offset = 0;

  for (let pageIndex = 0; pageIndex < 1000; pageIndex += 1) {
    const query = new URLSearchParams({ limit: String(limit), offset: String(offset) });
    if (filters.status) query.set('status', filters.status);
    if (filters.categoryId) query.set('categoryId', filters.categoryId);
    if (filters.tagId) query.set('tagId', filters.tagId);
    if (filters.authorId) query.set('authorId', filters.authorId);

    const response = await adminFetch(`${getAdminApiBase()}/sites/${siteId}/blog?${query.toString()}`);
    const payload = await readJson<ApiListBlogResponse>(response);

    if (!response.ok || !payload.success || !payload.data) {
      throw new Error(payload.error?.message || 'Unable to load blog posts');
    }

    posts.push(...payload.data.posts.map(toStorePost));

    const pagination = payload.data.pagination;
    const nextOffset = (pagination?.offset ?? offset) + (pagination?.limit ?? limit);
    if (!pagination?.hasMore || nextOffset <= offset) {
      break;
    }

    offset = nextOffset;
  }

  return posts;
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
    throw new AdminContentApiError(
      payload.error?.message || 'Unable to save blog post',
      payload.error?.details,
      payload.error?.code,
    );
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

export async function publishBlogPost(siteId: string, postId: string, input: BlogPostStatusMutationInput = {}): Promise<BlogPost> {
  const response = await adminFetch(`${getAdminApiBase()}/sites/${siteId}/blog/${postId}/publish`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
    },
    body: JSON.stringify(input),
  });
  const payload = await readJson<ApiBlogPostResponse>(response);

  if (!response.ok || !payload.success || !payload.data) {
    throw new AdminContentApiError(
      payload.error?.message || 'Unable to publish blog post',
      payload.error?.details,
      payload.error?.code,
    );
  }

  return toStorePost(payload.data.post);
}

export async function archiveBlogPost(siteId: string, postId: string, input: BlogPostStatusMutationInput = {}): Promise<BlogPost> {
  const response = await adminFetch(`${getAdminApiBase()}/sites/${siteId}/blog/${postId}/archive`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
    },
    body: JSON.stringify(input),
  });
  const payload = await readJson<ApiBlogPostResponse>(response);

  if (!response.ok || !payload.success || !payload.data) {
    throw new AdminContentApiError(
      payload.error?.message || 'Unable to archive blog post',
      payload.error?.details,
      payload.error?.code,
    );
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

export async function createForm(
  siteId: string,
  input: FormDefinitionInput,
): Promise<FormDefinition> {
  const response = await adminFetch(`${getAdminApiBase()}/sites/${siteId}/forms`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
    },
    body: JSON.stringify(input),
  });
  const payload = await readJson<ApiFormDetailResponse>(response);
  const form = payload.data?.form || payload.form;

  if (!response.ok || !payload.success || !form) {
    throw new Error(payload.error?.message || 'Unable to create form');
  }

  return form;
}

export async function updateForm(
  siteId: string,
  formId: string,
  input: Partial<FormDefinitionInput>,
): Promise<FormDefinition> {
  const response = await adminFetch(`${getAdminApiBase()}/sites/${siteId}/forms/${formId}`, {
    method: 'PATCH',
    headers: {
      'content-type': 'application/json',
    },
    body: JSON.stringify(input),
  });
  const payload = await readJson<ApiFormDetailResponse>(response);
  const form = payload.data?.form || payload.form;

  if (!response.ok || !payload.success || !form) {
    throw new Error(payload.error?.message || 'Unable to update form');
  }

  return form;
}

export async function deleteForm(siteId: string, formId: string): Promise<void> {
  const response = await adminFetch(`${getAdminApiBase()}/sites/${siteId}/forms/${formId}`, {
    method: 'DELETE',
  });
  const payload = await readJson<ApiDeleteResponse>(response);

  if (!response.ok || !payload.success || !payload.data?.deleted) {
    throw new Error(payload.error?.message || 'Unable to delete form');
  }
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

export async function applyFormConsentRetention(
  siteId: string,
  formId: string,
  input: { dryRun?: boolean; now?: string; actor?: string } = {},
): Promise<FormConsentRetentionResult> {
  const response = await adminFetch(`${getAdminApiBase()}/sites/${siteId}/forms/${formId}/consent-retention`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
    },
    body: JSON.stringify(input),
  });
  const payload = await readJson<ApiFormConsentRetentionResponse>(response);
  const result = payload.data;

  if (!response.ok || !payload.success || !result) {
    throw new Error(payload.error?.message || 'Unable to apply consent retention policy');
  }

  return result as FormConsentRetentionResult;
}

export async function createFormEmbedBlock(
  siteId: string,
  formId: string,
  input: { name?: string; slug?: string; actor?: string; publicBaseUrl?: string } = {},
): Promise<ReusableSection> {
  const response = await adminFetch(`${getAdminApiBase()}/sites/${siteId}/forms/${formId}/embed-block`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
    },
    body: JSON.stringify(input),
  });
  const payload = await readJson<ApiFormEmbedBlockResponse>(response);
  const section = payload.data?.section;

  if (!response.ok || !payload.success || !section) {
    throw new Error(payload.error?.message || 'Unable to create form embed block');
  }

  return toReusableSection(section);
}

export async function getFormsAnalytics(
  siteId: string,
  filters: { days?: number } = {},
): Promise<FormsAnalytics> {
  const query = new URLSearchParams();
  if (filters.days) query.set('days', String(filters.days));

  const response = await adminFetch(`${getAdminApiBase()}/sites/${siteId}/forms/analytics${query.toString() ? `?${query}` : ''}`);
  const payload = await readJson<ApiFormsAnalyticsResponse>(response);
  const analytics = payload.data?.analytics;

  if (!response.ok || !payload.success || !analytics) {
    throw new Error(payload.error?.message || 'Unable to load forms analytics');
  }

  return analytics;
}

export async function listFormDeliveryEvents(
  siteId: string,
  formId: string,
  filters: { limit?: number; offset?: number } = {},
): Promise<FormDeliveryEventList> {
  const query = new URLSearchParams();
  query.set('kind', 'form-submission');
  query.set('formId', formId);
  query.set('limit', String(filters.limit || 50));
  query.set('offset', String(filters.offset || 0));

  const response = await adminFetch(`${getPublicApiBase()}/sites/${siteId}/events?${query.toString()}`);
  const payload = await readJson<ApiListFormDeliveryEventsResponse>(response);
  const events = payload.data?.events || payload.events;
  const count = payload.data?.count ?? payload.count ?? events?.length ?? 0;
  const pagination = payload.data?.pagination || payload.pagination;

  if (!response.ok || !payload.success || !events) {
    throw new Error(payload.error?.message || 'Unable to load form delivery events');
  }

  return {
    events,
    count,
    pagination,
  };
}

export async function listCommentDeliveryEvents(
  siteId: string,
  filters: { limit?: number; offset?: number; commentId?: string } = {},
): Promise<CommentDeliveryEventList> {
  const query = new URLSearchParams();
  query.set('kind', 'all');
  query.set('limit', String(filters.limit || 100));
  query.set('offset', String(filters.offset || 0));
  if (filters.commentId) query.set('commentId', filters.commentId);

  const response = await adminFetch(`${getPublicApiBase()}/sites/${siteId}/events?${query.toString()}`);
  const payload = await readJson<ApiListCommentDeliveryEventsResponse>(response);
  const rawEvents = payload.data?.events || payload.events;
  const events = rawEvents?.filter((event) => event.kind.startsWith('comment-'));
  const count = events?.length ?? payload.data?.count ?? payload.count ?? 0;
  const pagination = payload.data?.pagination || payload.pagination;

  if (!response.ok || !payload.success || !events) {
    throw new Error(payload.error?.message || 'Unable to load comment delivery events');
  }

  return {
    events,
    count,
    pagination,
  };
}

export async function retryFormWebhookDelivery(
  siteId: string,
  formId: string,
  submissionId: string,
): Promise<{ requestId: string; delivery: FormWebhookRetryDelivery; submission: FormSubmission }> {
  const requestId = `forms-ui-retry-${Date.now().toString(36)}`;
  const response = await adminFetch(`${getAdminApiBase()}/sites/${siteId}/forms/${formId}/submissions/${submissionId}/webhook-retry`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-request-id': requestId,
    },
    body: JSON.stringify({ requestId }),
  });
  const payload = await readJson<ApiFormSubmissionResponse>(response);
  const delivery = payload.data?.delivery || payload.delivery;
  const submission = payload.data?.submission || payload.submission;

  if (!response.ok || !payload.success || !delivery || !submission) {
    throw new Error(payload.error?.message || 'Unable to retry webhook delivery');
  }

  return {
    requestId: payload.requestId || requestId,
    delivery,
    submission,
  };
}

export async function retryFormEmailDelivery(
  siteId: string,
  formId: string,
  submissionId: string,
): Promise<{ requestId: string; delivery: FormWebhookRetryDelivery; submission: FormSubmission }> {
  const requestId = `forms-ui-email-retry-${Date.now().toString(36)}`;
  const response = await adminFetch(`${getAdminApiBase()}/sites/${siteId}/forms/${formId}/submissions/${submissionId}/email-retry`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-request-id': requestId,
    },
    body: JSON.stringify({ requestId }),
  });
  const payload = await readJson<ApiFormSubmissionResponse>(response);
  const delivery = payload.data?.delivery || payload.delivery;
  const submission = payload.data?.submission || payload.submission;

  if (!response.ok || !payload.success || !delivery || !submission) {
    throw new Error(payload.error?.message || 'Unable to retry email delivery');
  }

  return {
    requestId: payload.requestId || requestId,
    delivery,
    submission,
  };
}

export async function retryCommentDelivery(
  siteId: string,
  commentId: string,
  eventId: string,
): Promise<{ requestId: string; delivery: CommentDeliveryRetryDelivery; retryOf: string; comment: AdminComment }> {
  const requestId = `comments-ui-delivery-retry-${Date.now().toString(36)}`;
  const response = await adminFetch(`${getPublicApiBase()}/sites/${siteId}/comments/${commentId}/delivery-retry`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-request-id': requestId,
    },
    body: JSON.stringify({ eventId, requestId }),
  });
  const payload = await readJson<ApiCommentDeliveryRetryResponse>(response);
  const delivery = payload.data?.delivery || payload.delivery;
  const retryOf = payload.data?.retryOf || payload.retryOf;
  const comment = payload.data?.comment || payload.comment;

  if (!response.ok || !payload.success || !delivery || !retryOf || !comment) {
    throw new Error(payload.error?.message || 'Unable to retry comment delivery');
  }

  return {
    requestId: payload.requestId || requestId,
    delivery,
    retryOf,
    comment,
  };
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

export async function listContactSegments(
  siteId: string,
  filters: { formId?: string } = {},
): Promise<ContactSegmentAnalytics> {
  const query = new URLSearchParams();
  if (filters.formId) query.set('formId', filters.formId);
  const queryString = query.toString();

  const response = await adminFetch(`${getAdminApiBase()}/sites/${siteId}/forms/contact-segments${queryString ? `?${queryString}` : ''}`);
  const payload = await readJson<ApiContactSegmentsResponse>(response);
  const analytics = payload.data?.analytics || (payload.segments && payload.summary
    ? { segments: payload.segments, summary: payload.summary, forms: [] }
    : undefined);

  if (!response.ok || !payload.success || !analytics) {
    throw new Error(payload.error?.message || 'Unable to load contact segments');
  }

  return analytics;
}

export async function listContactSavedLists(siteId: string): Promise<ContactSavedList[]> {
  const response = await adminFetch(`${getAdminApiBase()}/sites/${siteId}/forms/contact-lists`);
  const payload = await readJson<ApiContactSavedListsResponse>(response);
  const lists = payload.data?.lists || payload.lists;

  if (!response.ok || !payload.success || !lists) {
    throw new Error(payload.error?.message || 'Unable to load saved contact lists');
  }

  return lists;
}

export async function saveContactSavedList(
  siteId: string,
  input: {
    id?: string;
    name: string;
    description?: string | null;
    filters: SiteContactSavedListFilters;
  },
): Promise<{ list: SiteContactSavedList; lists: ContactSavedList[] }> {
  const response = await adminFetch(`${getAdminApiBase()}/sites/${siteId}/forms/contact-lists`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
    },
    body: JSON.stringify(input),
  });
  const payload = await readJson<ApiContactSavedListsResponse>(response);
  const list = payload.data?.list || payload.list;
  const lists = payload.data?.lists || payload.lists || [];

  if (!response.ok || !payload.success || !list) {
    throw new AdminContentApiError(payload.error?.message || 'Unable to save contact list', payload.error?.details);
  }

  return { list, lists };
}

export async function deleteContactSavedList(siteId: string, listId: string): Promise<void> {
  const response = await adminFetch(`${getAdminApiBase()}/sites/${siteId}/forms/contact-lists`, {
    method: 'DELETE',
    headers: {
      'content-type': 'application/json',
    },
    body: JSON.stringify({ listId }),
  });
  const payload = await readJson<ApiContactSavedListsResponse>(response);

  if (!response.ok || !payload.success) {
    throw new AdminContentApiError(payload.error?.message || 'Unable to delete contact list', payload.error?.details);
  }
}

export async function updateContact(
  siteId: string,
  formId: string,
  contactId: string,
  input: Partial<ContactInput>,
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

export async function deleteContact(siteId: string, formId: string, contactId: string): Promise<void> {
  const response = await adminFetch(`${getAdminApiBase()}/sites/${siteId}/forms/${formId}/contacts/${contactId}`, {
    method: 'DELETE',
  });
  const payload = await readJson<ApiContactResponse>(response);

  if (!response.ok || !payload.success) {
    throw new Error(payload.error?.message || 'Unable to delete contact');
  }
}

export async function promoteContactToUser(
  siteId: string,
  formId: string,
  contactId: string,
  input: { role?: 'viewer' | 'editor'; status?: 'invited' | 'active'; createInvite?: boolean } = {},
): Promise<ContactPromotionResult> {
  const response = await adminFetch(`${getAdminApiBase()}/sites/${siteId}/forms/${formId}/contacts/${contactId}/promote`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
    },
    body: JSON.stringify(input),
  });
  const payload = await readJson<ApiContactPromotionResponse>(response);
  const contact = payload.data?.contact || payload.contact;
  const user = payload.data?.user || payload.user;

  if (!response.ok || !payload.success || !contact || !user) {
    throw new Error(payload.error?.message || 'Unable to promote contact');
  }

  return {
    contact,
    user: toStoreUser(user),
    existingUser: Boolean(payload.data?.existingUser),
    invite: payload.data?.invite ?? payload.invite ?? null,
  };
}

export async function promoteContactToCustomer(
  siteId: string,
  formId: string,
  contactId: string,
  input: { customerStatus?: 'lead' | 'customer' | 'vip' | 'inactive'; notes?: string } = {},
): Promise<ContactCustomerPromotionResult> {
  const response = await adminFetch(`${getAdminApiBase()}/sites/${siteId}/forms/${formId}/contacts/${contactId}/promote-customer`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
    },
    body: JSON.stringify(input),
  });
  const payload = await readJson<ApiContactCustomerPromotionResponse>(response);
  const contact = payload.data?.contact || payload.contact;
  const collection = payload.data?.collection || payload.collection;
  const record = payload.data?.record || payload.record;

  if (!response.ok || !payload.success || !contact || !collection || !record) {
    throw new Error(payload.error?.message || 'Unable to promote contact to customer');
  }

  return {
    contact,
    collection: toCollection(collection),
    record: toCollectionRecord(record),
    existingRecord: Boolean(payload.data?.existingRecord),
    createdCollection: Boolean(payload.data?.createdCollection),
  };
}

export async function syncFormContacts(
  siteId: string,
  formId: string,
  input: { contactIds: string[]; targetUrl: string; includeSourceValues?: boolean; reason?: string | null },
): Promise<ContactSyncResult> {
  const response = await adminFetch(`${getAdminApiBase()}/sites/${siteId}/forms/${formId}/contacts/sync`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
    },
    body: JSON.stringify(input),
  });
  const payload = await readJson<ApiContactSyncResponse>(response);
  const delivery = payload.data?.delivery;

  if (!response.ok || !payload.success || !payload.data?.formId || !delivery) {
    throw new Error(payload.error?.message || 'Unable to sync contacts');
  }

  return {
    formId: payload.data.formId,
    delivery,
  };
}

export async function applyContactConsentRetention(
  siteId: string,
  formId: string,
  input: { contactIds?: string[]; dryRun?: boolean; retentionDays?: number; actor?: string },
): Promise<ContactConsentRetentionResult> {
  const response = await adminFetch(`${getAdminApiBase()}/sites/${siteId}/forms/${formId}/contacts/consent-retention`, {
    method: 'POST',
    body: JSON.stringify(input),
  });
  const payload = await readJson<ApiContactConsentRetentionResponse>(response);
  const result = payload.data;

  if (!response.ok || !payload.success || !result?.formId) {
    throw new Error(payload.error?.message || 'Unable to apply contact consent retention');
  }

  return result;
}

export async function createFormContact(
  siteId: string,
  formId: string,
  input: ContactInput,
): Promise<AdminContact> {
  const response = await adminFetch(`${getAdminApiBase()}/sites/${siteId}/forms/${formId}/contacts`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
    },
    body: JSON.stringify(input),
  });
  const payload = await readJson<ApiContactResponse>(response);
  const contact = payload.data?.contact || payload.contact;

  if (!response.ok || !payload.success || !contact) {
    throw new AdminContentApiError(payload.error?.message || 'Unable to create contact', payload.error?.details);
  }

  return contact;
}

export async function importFormContactsCsv(
  siteId: string,
  formId: string,
  csv: string,
  options: { upsertByEmail?: boolean } = {},
): Promise<ContactImportResult> {
  const query = new URLSearchParams();
  if (options.upsertByEmail) query.set('upsertByEmail', 'true');

  const response = await adminFetch(`${getAdminApiBase()}/sites/${siteId}/forms/${formId}/contacts/import?${query.toString()}`, {
    method: 'POST',
    headers: {
      'content-type': 'text/csv; charset=utf-8',
    },
    body: csv,
  });
  const payload = await readJson<ApiImportContactsResponse>(response);

  if (!response.ok || !payload.success || !payload.data) {
    throw new AdminContentApiError(payload.error?.message || 'Unable to import contacts', payload.error?.details);
  }

  return payload.data.import;
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
  if (filters.commentThreadId) query.set('commentThreadId', filters.commentThreadId);
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

export async function listAllComments(
  siteId: string,
  filters: CommentListFilters = {},
): Promise<CommentListResult> {
  const limit = Math.max(1, Math.min(1000, filters.limit || 100));
  const firstOffset = Math.max(0, filters.offset || 0);
  const comments: AdminComment[] = [];
  let count = 0;
  let pagination: ApiPagination = {
    total: 0,
    limit,
    offset: firstOffset,
    hasMore: false,
  };
  let offset = firstOffset;

  for (let pageIndex = 0; pageIndex < 1000; pageIndex += 1) {
    const page = await listComments(siteId, {
      ...filters,
      limit,
      offset,
    });

    comments.push(...page.comments);
    count = page.count;
    pagination = page.pagination;

    const nextOffset = page.pagination.offset + page.pagination.limit;
    if (!page.pagination.hasMore || nextOffset <= offset) {
      break;
    }

    offset = nextOffset;
  }

  return {
    comments,
    count: count || comments.length,
    pagination: {
      total: pagination.total || count || comments.length,
      limit: comments.length || limit,
      offset: firstOffset,
      hasMore: pagination.hasMore,
    },
  };
}

export async function getCommentAnalytics(
  siteId: string,
  filters: { days?: number; targetType?: CommentModerationTarget; targetId?: string } = {},
): Promise<CommentAnalytics> {
  const query = new URLSearchParams();
  query.set('days', String(filters.days || 30));
  if (filters.targetType && filters.targetType !== 'all') query.set('targetType', filters.targetType);
  if (filters.targetId) query.set('targetId', filters.targetId);

  const response = await adminFetch(`${getPublicApiBase()}/sites/${siteId}/comments/analytics?${query.toString()}`);
  const payload = await readJson<ApiCommentAnalyticsResponse>(response);
  const analytics = payload.data?.analytics || payload.analytics;

  if (!response.ok || !payload.success || !analytics) {
    throw new Error(payload.error?.message || 'Unable to load comment analytics');
  }

  return analytics;
}

export async function createComment(
  siteId: string,
  input: CreateCommentInput,
): Promise<AdminComment> {
  const targetSegment = input.targetType === 'post' ? 'blog' : 'pages';
  const response = await adminFetch(`${getPublicApiBase()}/sites/${siteId}/${targetSegment}/${input.targetId}/comments`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      content: input.content,
      authorName: input.authorName,
      authorEmail: input.authorEmail,
      authorWebsite: input.authorWebsite,
      parentId: input.parentId,
      commentThreadId: input.commentThreadId,
      moderationMode: input.moderationMode,
      requestId: input.requestId,
      honeypot: '',
      rateLimitBypass: true,
      startedAt: Date.now() - 3000,
    }),
  });
  const payload = await readJson<ApiCreateCommentResponse>(response);
  const comment = payload.data?.comment || payload.comment;

  if (!response.ok || !payload.success || !comment) {
    throw new AdminContentApiError(payload.error?.message || 'Unable to create comment reply', payload.error?.details);
  }

  return comment;
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

export async function updateCommentThread(
  siteId: string,
  commentId: string,
  input: UpdateCommentThreadInput,
): Promise<AdminComment> {
  const response = await adminFetch(`${getPublicApiBase()}/sites/${siteId}/comments/${commentId}`, {
    method: 'PATCH',
    headers: {
      'content-type': 'application/json',
    },
    body: JSON.stringify(input),
  });
  const payload = await readJson<ApiUpdateCommentResponse>(response);
  const comment = payload.data?.comment || payload.comment;

  if (!response.ok || !payload.success || !comment) {
    throw new AdminContentApiError(payload.error?.message || 'Unable to move comment reply', payload.error?.details);
  }

  return comment;
}

export async function deleteComment(
  siteId: string,
  commentId: string,
): Promise<{ deleted: AdminComment[]; deletedCount: number }> {
  const response = await adminFetch(`${getPublicApiBase()}/sites/${siteId}/comments/${commentId}`, {
    method: 'DELETE',
  });
  const payload = await readJson<ApiDeleteCommentResponse>(response);
  const deleted = payload.data?.deleted || payload.deleted;

  if (!response.ok || !payload.success || !deleted) {
    throw new AdminContentApiError(payload.error?.message || 'Unable to delete comment', payload.error?.details);
  }

  return {
    deleted,
    deletedCount: payload.data?.deletedCount ?? payload.deletedCount ?? deleted.length,
  };
}

export async function listCommentBlocklist(
  siteId: string,
  filters: CommentBlocklistFilters = {},
): Promise<CommentBlocklistResult> {
  const query = new URLSearchParams();
  query.set('limit', String(filters.limit || 100));
  query.set('offset', String(filters.offset || 0));
  if (filters.type && filters.type !== 'all') query.set('type', filters.type);
  if (filters.q) query.set('q', filters.q);

  const response = await adminFetch(`${getPublicApiBase()}/sites/${siteId}/comments/blocklist?${query.toString()}`);
  const payload = await readJson<ApiListCommentBlocklistResponse>(response);
  const blocklist = payload.data?.blocklist || payload.blocklist;
  const count = payload.data?.count ?? payload.count ?? blocklist?.length ?? 0;
  const pagination = payload.data?.pagination || payload.pagination || {
    total: count,
    limit: filters.limit || blocklist?.length || 100,
    offset: filters.offset || 0,
    hasMore: false,
  };

  if (!response.ok || !payload.success || !blocklist) {
    throw new Error(payload.error?.message || 'Unable to load comment blocklist');
  }

  return {
    blocklist,
    count,
    pagination,
  };
}

export async function deleteCommentBlocklistEntries(
  siteId: string,
  ids: string[],
): Promise<{ deleted: AdminCommentBlocklistEntry[]; deletedCount: number; missingIds: string[] }> {
  const response = await adminFetch(`${getPublicApiBase()}/sites/${siteId}/comments/blocklist`, {
    method: 'DELETE',
    headers: {
      'content-type': 'application/json',
    },
    body: JSON.stringify({ ids }),
  });
  const payload = await readJson<ApiDeleteCommentBlocklistResponse>(response);
  const deleted = payload.data?.deleted || payload.deleted;

  if (!response.ok || !payload.success || !deleted) {
    throw new Error(payload.error?.message || 'Unable to remove comment blocklist entries');
  }

  return {
    deleted,
    deletedCount: payload.data?.deletedCount ?? payload.deletedCount ?? deleted.length,
    missingIds: payload.data?.missingIds || payload.missingIds || [],
  };
}

const COLLECTION_LIST_PAGE_SIZE = 100;
const COLLECTION_LIST_MAX_PAGES = 100;

async function listCollectionsPage(siteId: string, offset: number): Promise<{
  collections: Collection[];
  pagination?: ApiPagination;
}> {
  const query = new URLSearchParams({
    limit: String(COLLECTION_LIST_PAGE_SIZE),
    offset: String(offset),
  });
  const response = await adminFetch(`${getAdminApiBase()}/sites/${siteId}/collections?${query.toString()}`);
  const payload = await readJson<ApiListCollectionsResponse>(response);

  if (!response.ok || !payload.success || !payload.data) {
    throw new Error(payload.error?.message || 'Unable to load collections');
  }

  return {
    collections: payload.data.collections.map(toCollection),
    pagination: payload.data.pagination,
  };
}

export async function listCollections(siteId: string): Promise<Collection[]> {
  const collections: Collection[] = [];
  let offset = 0;
  let hasMore = false;

  for (let page = 0; page < COLLECTION_LIST_MAX_PAGES; page += 1) {
    const result = await listCollectionsPage(siteId, offset);
    collections.push(...result.collections);
    hasMore = result.pagination?.hasMore === true;

    if (!hasMore) {
      break;
    }

    offset = result.pagination
      ? result.pagination.offset + result.pagination.limit
      : offset + result.collections.length;
  }

  if (hasMore) {
    throw new Error('Unable to load all collections because the collection list exceeded the supported page limit.');
  }

  return collections;
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
    throw adminContentApiError(payload, 'Unable to create collection');
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
    throw adminContentApiError(payload, 'Unable to save collection');
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

export async function listAllCollectionRecords(
  siteId: string,
  collectionId: string,
  filters: CollectionRecordListFilters = {},
): Promise<CollectionRecordListResult> {
  const pageSize = Math.max(1, Math.min(1000, filters.limit || 100));
  const firstOffset = Math.max(0, filters.offset || 0);
  const records: CollectionRecord[] = [];
  let pagination: CollectionRecordPagination = {
    total: 0,
    limit: pageSize,
    offset: firstOffset,
    hasMore: false,
  };
  let offset = firstOffset;

  for (let pageIndex = 0; pageIndex < 1000; pageIndex += 1) {
    const page = await listCollectionRecords(siteId, collectionId, {
      ...filters,
      limit: pageSize,
      offset,
    });

    records.push(...page.records);
    pagination = page.pagination;

    const nextOffset = page.pagination.offset + page.pagination.limit;
    if (!page.pagination.hasMore || nextOffset <= offset) {
      break;
    }

    offset = nextOffset;
  }

  return {
    records,
    pagination: {
      total: pagination.total || records.length,
      limit: records.length || pageSize,
      offset: firstOffset,
      hasMore: pagination.hasMore,
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
    throw adminContentApiError(payload, 'Unable to import collection records');
  }

  return payload.data.import;
}

export async function exportCollectionsBackup(
  siteId: string,
  options: { collectionIds?: string[]; includeRecords?: boolean } = {},
): Promise<CollectionBackupExport> {
  const query = new URLSearchParams();
  if (options.collectionIds?.length) query.set('ids', options.collectionIds.join(','));
  if (options.includeRecords === false) query.set('records', 'false');

  const suffix = query.toString() ? `?${query.toString()}` : '';
  const response = await adminFetch(`${getAdminApiBase()}/sites/${siteId}/collections/export${suffix}`);
  const payload = await readJson<ApiExportCollectionsBackupResponse>(response);

  if (!response.ok || !payload.success || !payload.data) {
    throw adminContentApiError(payload, 'Unable to export collections backup');
  }

  return payload.data;
}

export async function importCollectionsBackup(
  siteId: string,
  backup: CollectionBackupExport | { collections?: unknown[] },
  options: { upsert?: boolean } = {},
): Promise<CollectionBackupImportResult> {
  const query = new URLSearchParams();
  if (options.upsert) query.set('upsert', 'true');

  const suffix = query.toString() ? `?${query.toString()}` : '';
  const response = await adminFetch(`${getAdminApiBase()}/sites/${siteId}/collections/import${suffix}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
    },
    body: JSON.stringify(backup),
  });
  const payload = await readJson<ApiImportCollectionsBackupResponse>(response);

  if (!response.ok || !payload.success || !payload.data) {
    throw adminContentApiError(payload, 'Unable to import collections backup');
  }

  return {
    import: payload.data.import,
    collections: payload.data.collections.map(toCollection),
    records: payload.data.records.map(toCollectionRecord),
  };
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
    throw adminContentApiError(payload, 'Unable to create collection record');
  }

  return toCollectionRecord(payload.data.record);
}

export async function getCollectionRecord(
  siteId: string,
  collectionId: string,
  recordId: string,
): Promise<CollectionRecord> {
  const response = await adminFetch(`${getAdminApiBase()}/sites/${siteId}/collections/${collectionId}/records/${recordId}`);
  const payload = await readJson<ApiCollectionRecordResponse>(response);

  if (!response.ok || !payload.success || !payload.data) {
    throw adminContentApiError(payload, 'Unable to load collection record');
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
    throw adminContentApiError(payload, 'Unable to save collection record');
  }

  return toCollectionRecord(payload.data.record);
}

export interface CommerceReconciliationResult {
  schemaVersion: 'backy.commerce-reconciliation.v1';
  eventCount: number;
  updatedCount: number;
  unmatchedCount: number;
  updates: Array<{
    orderId: string;
    orderNumber?: string;
    paymentStatus?: string;
    eventId: string;
  }>;
  unmatchedEvents: Array<Record<string, unknown>>;
}

export async function reconcileCommerceOrders(siteId: string, limit = 100): Promise<CommerceReconciliationResult> {
  const query = new URLSearchParams();
  query.set('limit', String(limit));
  const response = await adminFetch(`${getAdminApiBase()}/sites/${siteId}/commerce/reconcile?${query.toString()}`, {
    method: 'POST',
  });
  const payload = await response.json();
  if (!response.ok || payload.success === false) {
    throw new Error(payload.error?.message || 'Unable to reconcile commerce orders');
  }

  return payload.data as CommerceReconciliationResult;
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
    throw adminContentApiError(payload, 'Unable to update collection records');
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

export async function exportReusableSections(
  siteId: string,
  filters: ReusableSectionsExportFilters = {},
): Promise<ReusableSectionsExport> {
  const query = new URLSearchParams();
  query.set('status', filters.status || 'all');
  if (filters.category) query.set('category', filters.category);
  if (filters.tag) query.set('tag', filters.tag);
  if (filters.search) query.set('search', filters.search);
  if (filters.sectionIds?.length) query.set('sectionIds', filters.sectionIds.join(','));

  const response = await adminFetch(`${getAdminApiBase()}/sites/${siteId}/reusable-sections/export?${query.toString()}`);
  const payload = await readJson<ApiExportReusableSectionsResponse>(response);

  if (!response.ok || !payload.success || !payload.data) {
    throw new AdminContentApiError(
      payload.error?.message || 'Unable to export reusable sections',
      payload.error?.details,
      payload.error?.code,
    );
  }

  return {
    export: payload.data.export,
    sections: payload.data.sections,
  };
}

export async function importReusableSections(
  siteId: string,
  input: ReusableSectionsImportInput,
): Promise<ReusableSectionsImportResult> {
  const query = new URLSearchParams();
  if (input.upsert) query.set('upsert', 'true');

  const response = await adminFetch(`${getAdminApiBase()}/sites/${siteId}/reusable-sections/import?${query.toString()}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      sections: input.sections,
      importedBy: input.importedBy,
    }),
  });
  const payload = await readJson<ApiImportReusableSectionsResponse>(response);

  if (!response.ok || !payload.success || !payload.data) {
    throw new AdminContentApiError(
      payload.error?.message || 'Unable to import reusable sections',
      payload.error?.details,
      payload.error?.code,
    );
  }

  return {
    import: payload.data.import,
    sections: payload.data.sections.map(toReusableSection),
    cacheInvalidation: payload.data.cacheInvalidation,
  };
}

export async function listReusableSectionVersions(
  siteId: string,
  sectionId: string,
): Promise<ReusableSectionVersions> {
  const response = await adminFetch(`${getAdminApiBase()}/sites/${siteId}/reusable-sections/${sectionId}/versions`);
  const payload = await readJson<ApiReusableSectionVersionsResponse>(response);

  if (!response.ok || !payload.success || !payload.data) {
    throw new AdminContentApiError(
      payload.error?.message || 'Unable to load reusable section versions',
      payload.error?.details,
      payload.error?.code,
    );
  }

  return payload.data;
}

export async function restoreReusableSectionVersion(
  siteId: string,
  sectionId: string,
  version: number,
  input: ReusableSectionVersionRestoreInput = {},
): Promise<ReusableSectionVersionRestoreResult> {
  const response = await adminFetch(`${getAdminApiBase()}/sites/${siteId}/reusable-sections/${sectionId}/versions/${version}/restore`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
    },
    body: JSON.stringify(input),
  });
  const payload = await readJson<ApiReusableSectionRestoreResponse>(response);

  if (!response.ok || !payload.success || !payload.data) {
    throw new AdminContentApiError(
      payload.error?.message || 'Unable to restore reusable section version',
      payload.error?.details,
      payload.error?.code,
    );
  }

  return {
    restored: payload.data.restored,
    restoredFromVersion: payload.data.restoredFromVersion,
    version: payload.data.version,
    section: toReusableSection(payload.data.section),
    cacheInvalidation: payload.data.cacheInvalidation,
  };
}

export async function getReusableSectionInstances(
  siteId: string,
  sectionId: string,
  filters: ReusableSectionInstancesFilters = {},
): Promise<ReusableSectionInstancesReport> {
  const query = new URLSearchParams();
  if (filters.targetType && filters.targetType !== 'all') query.set('targetType', filters.targetType);
  if (filters.targetId) query.set('targetId', filters.targetId);

  const response = await adminFetch(`${getAdminApiBase()}/sites/${siteId}/reusable-sections/${sectionId}/instances?${query.toString()}`);
  const payload = await readJson<ApiReusableSectionInstancesResponse>(response);

  if (!response.ok || !payload.success || !payload.data) {
    throw new AdminContentApiError(
      payload.error?.message || 'Unable to load reusable section instances',
      payload.error?.details,
      payload.error?.code,
    );
  }

  return payload.data;
}

export async function refreshReusableSectionInstances(
  siteId: string,
  sectionId: string,
  input: ReusableSectionInstancesRefreshInput = {},
): Promise<ReusableSectionInstancesRefreshResult> {
  const response = await adminFetch(`${getAdminApiBase()}/sites/${siteId}/reusable-sections/${sectionId}/instances`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
    },
    body: JSON.stringify(input),
  });
  const payload = await readJson<ApiReusableSectionInstancesRefreshResponse>(response);

  if (!response.ok || !payload.success || !payload.data) {
    throw new AdminContentApiError(
      payload.error?.message || 'Unable to refresh reusable section instances',
      payload.error?.details,
      payload.error?.code,
    );
  }

  return payload.data;
}

export async function getReusableSectionMetadata(
  siteId: string,
  sectionId: string,
): Promise<ReusableSectionMetadata> {
  const response = await adminFetch(`${getAdminApiBase()}/sites/${siteId}/reusable-sections/${sectionId}/metadata`);
  const payload = await readJson<ApiReusableSectionMetadataResponse>(response);

  if (!response.ok || !payload.success || !payload.data) {
    throw new AdminContentApiError(
      payload.error?.message || 'Unable to load reusable section metadata',
      payload.error?.details,
      payload.error?.code,
    );
  }

  return payload.data;
}

export async function updateReusableSectionMetadata(
  siteId: string,
  sectionId: string,
  input: ReusableSectionMetadataPatchInput,
): Promise<ReusableSectionMetadataUpdateResult> {
  const response = await adminFetch(`${getAdminApiBase()}/sites/${siteId}/reusable-sections/${sectionId}/metadata`, {
    method: 'PATCH',
    headers: {
      'content-type': 'application/json',
    },
    body: JSON.stringify(input),
  });
  const payload = await readJson<ApiReusableSectionMetadataUpdateResponse>(response);

  if (!response.ok || !payload.success || !payload.data) {
    throw new AdminContentApiError(
      payload.error?.message || 'Unable to update reusable section metadata',
      payload.error?.details,
      payload.error?.code,
    );
  }

  return {
    sectionId: payload.data.section.id,
    section: toReusableSection(payload.data.section),
    metadata: payload.data.metadata,
    library: payload.data.library,
    version: payload.data.version,
    cacheInvalidation: payload.data.cacheInvalidation,
  };
}
