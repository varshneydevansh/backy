import type { BackyContentDocument, BackyJsonObject, BackyJsonValue } from './content-contract';
import type {
  BlogPost,
  BlogCategory,
  BlogTag,
  Comment,
  CommentStatus,
  Contact,
  FormDefinition,
  FormSubmission,
  MediaFolder,
  MediaItem,
  Page,
  PageMeta,
  PublishStatus,
  Site,
  SiteSettings,
  ThemeConfig,
} from './types';

export type BackyRepositoryMode = 'demo' | 'database';

export interface BackyRepositoryContext {
  requestId?: string;
  actorId?: string | null;
  teamId?: string | null;
  siteId?: string | null;
  mode?: BackyRepositoryMode;
}

export interface BackyPaginationInput {
  limit?: number;
  offset?: number;
}

export interface BackyPaginationResult {
  total: number;
  limit: number;
  offset: number;
  hasMore: boolean;
}

export interface BackyListResult<TItem> {
  items: TItem[];
  pagination: BackyPaginationResult;
}

export interface BackyRepositoryMutationResult<TItem> {
  item: TItem;
  auditEvent?: BackyAuditLogEntry;
}

export interface BackyPage extends Omit<Page, 'content'> {
  content: BackyContentDocument;
}

export interface BackyPost extends Omit<BlogPost, 'content' | 'contentFormat'> {
  content: BackyContentDocument;
  contentFormat: 'editor';
}

export interface BackySlugAvailabilityResult {
  available: boolean;
  normalizedSlug: string;
  conflictingId?: string;
}

export interface BackyRepositoryValidationIssue {
  field?: string;
  path?: string;
  message: string;
}

export interface BackyRepositoryValidationError {
  code: 'validation_failed';
  issues: BackyRepositoryValidationIssue[];
}

export interface BackyRepositoryNotFoundError {
  code: 'not_found';
  entity: BackyRepositoryEntity;
  id: string;
}

export interface BackyRepositoryConflictError {
  code: 'conflict';
  entity: BackyRepositoryEntity;
  field: string;
  value: string;
  conflictingId?: string;
}

export type BackyRepositoryError =
  | BackyRepositoryValidationError
  | BackyRepositoryNotFoundError
  | BackyRepositoryConflictError;

export type BackyRepositoryEntity =
  | 'site'
  | 'page'
  | 'post'
  | 'collection'
  | 'collectionRecord'
  | 'media'
  | 'mediaFolder'
  | 'form'
  | 'formSubmission'
  | 'contact'
  | 'comment'
  | 'user'
  | 'settings'
  | 'auditLog';

export interface BackyRepositoryResult<TItem> {
  data?: TItem;
  error?: BackyRepositoryError;
}

export interface BackySiteCreateInput {
  teamId: string;
  name: string;
  slug: string;
  description?: string | null;
  customDomain?: string | null;
  theme?: Partial<ThemeConfig>;
  settings?: Partial<SiteSettings>;
  status?: PublishStatus;
}

export interface BackySiteUpdateInput {
  name?: string;
  slug?: string;
  description?: string | null;
  customDomain?: string | null;
  theme?: Partial<ThemeConfig>;
  settings?: Partial<SiteSettings>;
  status?: PublishStatus;
  isPublished?: boolean;
  publishedAt?: string | null;
}

export interface BackySiteListInput extends BackyPaginationInput {
  teamId?: string;
  status?: PublishStatus | 'all';
  search?: string;
}

export interface BackyPageCreateInput {
  siteId: string;
  title: string;
  slug: string;
  description?: string | null;
  status?: PublishStatus;
  scheduledAt?: string | null;
  isHomepage?: boolean;
  parentId?: string | null;
  sortOrder?: number;
  content: BackyContentDocument;
  meta?: PageMeta;
}

export interface BackyPageUpdateInput {
  title?: string;
  slug?: string;
  description?: string | null;
  status?: PublishStatus;
  scheduledAt?: string | null;
  isHomepage?: boolean;
  parentId?: string | null;
  sortOrder?: number;
  content?: BackyContentDocument;
  meta?: PageMeta;
  revisionNote?: string;
}

export interface BackyPageListInput extends BackyPaginationInput {
  siteId: string;
  status?: PublishStatus | 'all';
  includeUnpublished?: boolean;
  parentId?: string | null;
  search?: string;
}

export interface BackyPostCreateInput {
  siteId: string;
  title: string;
  slug: string;
  excerpt?: string | null;
  status?: PublishStatus;
  scheduledAt?: string | null;
  featuredImageId?: string | null;
  authorId?: string | null;
  categoryIds?: string[];
  tagIds?: string[];
  content: BackyContentDocument;
  meta?: PageMeta;
}

export interface BackyPostUpdateInput extends Partial<Omit<BackyPostCreateInput, 'siteId'>> {
  revisionNote?: string;
}

export interface BackyPostListInput extends BackyPaginationInput {
  siteId: string;
  status?: PublishStatus | 'all';
  includeUnpublished?: boolean;
  authorId?: string;
  categoryId?: string;
  tagId?: string;
  search?: string;
}

export interface BackyBlogCategory extends BlogCategory {
  color?: string | null;
  updatedAt?: string;
  postCount?: number;
}

export interface BackyBlogTag extends BlogTag {
  description?: string | null;
  updatedAt?: string;
  postCount?: number;
}

export interface BackyBlogAuthor {
  id: string;
  siteId: string;
  name: string;
  slug: string;
  role: string;
  status: string;
  avatarUrl?: string | null;
  postCount?: number;
}

export interface BackyBlogCategoryCreateInput {
  siteId: string;
  name: string;
  slug: string;
  description?: string | null;
  color?: string | null;
  sortOrder?: number;
}

export interface BackyBlogCategoryUpdateInput {
  name?: string;
  slug?: string;
  description?: string | null;
  color?: string | null;
  sortOrder?: number;
}

export interface BackyBlogTagCreateInput {
  siteId: string;
  name: string;
  slug: string;
  description?: string | null;
}

export interface BackyBlogTagUpdateInput {
  name?: string;
  slug?: string;
  description?: string | null;
}

export type BackyCollectionFieldType =
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

export interface BackyCollectionField {
  id: string;
  key: string;
  label: string;
  type: BackyCollectionFieldType;
  required?: boolean;
  unique?: boolean;
  options?: string[];
  referenceCollectionId?: string;
  defaultValue?: BackyJsonValue;
  validation?: BackyJsonObject;
}

export interface BackyCollectionPermissions {
  publicRead: boolean;
  publicCreate: boolean;
  publicUpdate?: boolean;
  publicDelete?: boolean;
}

export interface BackyCollection {
  id: string;
  siteId: string;
  name: string;
  slug: string;
  description?: string | null;
  status: PublishStatus;
  fields: BackyCollectionField[];
  permissions: BackyCollectionPermissions;
  createdAt: string;
  updatedAt: string;
}

export interface BackyCollectionRecord {
  id: string;
  siteId: string;
  collectionId: string;
  slug: string;
  status: PublishStatus;
  values: Record<string, BackyJsonValue>;
  createdAt: string;
  updatedAt: string;
  publishedAt?: string | null;
  scheduledAt?: string | null;
}

export interface BackyCollectionCreateInput {
  siteId: string;
  name: string;
  slug: string;
  description?: string | null;
  status?: PublishStatus;
  fields: BackyCollectionField[];
  permissions?: Partial<BackyCollectionPermissions>;
}

export interface BackyCollectionUpdateInput extends Partial<Omit<BackyCollectionCreateInput, 'siteId'>> {}

export interface BackyCollectionListInput extends BackyPaginationInput {
  siteId: string;
  status?: PublishStatus | 'all';
  includeUnpublished?: boolean;
  search?: string;
}

export interface BackyCollectionRecordCreateInput {
  siteId: string;
  collectionId: string;
  slug?: string;
  status?: PublishStatus;
  scheduledAt?: string | null;
  values: Record<string, BackyJsonValue>;
}

export interface BackyCollectionRecordUpdateInput extends Partial<Omit<BackyCollectionRecordCreateInput, 'siteId' | 'collectionId'>> {}

export interface BackyCollectionRecordListInput extends BackyPaginationInput {
  siteId: string;
  collectionId: string;
  status?: PublishStatus | 'all';
  includeUnpublished?: boolean;
  search?: string;
  fieldKey?: string;
  fieldValue?: BackyJsonValue;
  sortBy?: string;
  sortDirection?: 'asc' | 'desc';
}

export interface BackyMediaCreateInput {
  siteId: string;
  filename: string;
  originalName: string;
  mimeType: string;
  size: number;
  url: string;
  type: MediaItem['type'];
  folderId?: string | null;
  altText?: string | null;
  caption?: string | null;
  visibility?: MediaItem['visibility'];
  metadata?: MediaItem['metadata'];
  uploadedBy?: string | null;
}

export interface BackyMediaUpdateInput {
  filename?: string;
  folderId?: string | null;
  altText?: string | null;
  caption?: string | null;
  visibility?: MediaItem['visibility'];
  metadata?: MediaItem['metadata'];
  tags?: string[];
}

export interface BackyMediaListInput extends BackyPaginationInput {
  siteId: string;
  type?: MediaItem['type'] | 'all';
  folderId?: string | null;
  visibility?: MediaItem['visibility'] | 'all';
  search?: string;
}

export interface BackyMediaFolderCreateInput {
  siteId: string;
  name: string;
  parentId?: string | null;
  sortOrder?: number;
}

export interface BackyMediaFolderUpdateInput {
  name?: string;
  parentId?: string | null;
  sortOrder?: number;
}

export interface BackyFormListInput extends BackyPaginationInput {
  siteId: string;
  pageId?: string;
  postId?: string;
  isActive?: boolean;
  search?: string;
}

export interface BackyFormSubmissionListInput extends BackyPaginationInput {
  siteId: string;
  formId?: string;
  status?: FormSubmission['status'] | 'all';
  search?: string;
  requestId?: string;
}

export interface BackyContactListInput extends BackyPaginationInput {
  siteId: string;
  formId?: string;
  status?: Contact['status'] | 'all';
  search?: string;
  requestId?: string;
}

export interface BackyCommentCreateInput {
  siteId: string;
  targetType: Comment['targetType'];
  targetId: string;
  commentThreadId?: string | null;
  content: string;
  authorName?: string | null;
  authorEmail?: string | null;
  authorWebsite?: string | null;
  userId?: string | null;
  status?: CommentStatus;
  parentId?: string | null;
  requestId?: string | null;
  ipHash?: string | null;
}

export interface BackyCommentUpdateInput {
  content?: string;
  status?: CommentStatus;
  reviewedBy?: string | null;
  reviewedAt?: string | null;
  rejectionReason?: string | null;
  blockReason?: string | null;
  blockedBy?: string | null;
  blockedAt?: string | null;
  reportCount?: number;
  reportReasons?: Comment['reportReasons'];
  requestId?: string | null;
}

export interface BackyCommentListInput extends BackyPaginationInput {
  siteId: string;
  targetType?: Comment['targetType'];
  targetId?: string;
  status?: CommentStatus | 'all';
  requestId?: string;
  q?: string;
  parentOnly?: boolean;
  parentId?: string | null;
  commentThreadId?: string;
  sort?: 'newest' | 'oldest';
  includeReplies?: boolean;
}

export type BackyReusableSectionStatus = 'active' | 'archived';

export interface BackyReusableSection {
  id: string;
  siteId: string;
  name: string;
  slug: string;
  description?: string | null;
  category: string;
  status: BackyReusableSectionStatus;
  tags: string[];
  content: BackyJsonObject;
  sourceElementId?: string | null;
  createdBy?: string | null;
  updatedBy?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface BackyReusableSectionCreateInput {
  siteId: string;
  name: string;
  slug: string;
  description?: string | null;
  category?: string;
  status?: BackyReusableSectionStatus;
  tags?: string[];
  content: BackyJsonObject;
  sourceElementId?: string | null;
  createdBy?: string | null;
  updatedBy?: string | null;
}

export interface BackyReusableSectionUpdateInput {
  name?: string;
  slug?: string;
  description?: string | null;
  category?: string;
  status?: BackyReusableSectionStatus;
  tags?: string[];
  content?: BackyJsonObject;
  sourceElementId?: string | null;
  updatedBy?: string | null;
}

export interface BackyReusableSectionListInput extends BackyPaginationInput {
  siteId: string;
  status?: BackyReusableSectionStatus | 'all';
  category?: string;
  tag?: string;
  search?: string;
}

export type BackyContentTargetType = 'page' | 'post';

export interface BackyContentRevision {
  id: string;
  siteId: string;
  targetType: BackyContentTargetType;
  targetId: string;
  snapshot: BackyJsonObject;
  note?: string | null;
  createdBy?: string | null;
  createdAt: string;
}

export interface BackyContentRevisionCreateInput {
  siteId: string;
  targetType: BackyContentTargetType;
  targetId: string;
  snapshot: BackyJsonObject;
  note?: string | null;
  createdBy?: string | null;
}

export interface BackyContentRevisionListInput extends BackyPaginationInput {
  siteId: string;
  targetType: BackyContentTargetType;
  targetId: string;
}

export interface BackyPreviewToken {
  token: string;
  siteId: string;
  targetType: BackyContentTargetType;
  targetId: string;
  createdAt: string;
  expiresAt: string;
  createdBy?: string | null;
}

export interface BackyPreviewTokenCreateInput {
  siteId: string;
  targetType: BackyContentTargetType;
  targetId: string;
  ttlSeconds?: number;
  createdBy?: string | null;
}

export type BackyUserRole = 'owner' | 'admin' | 'editor' | 'viewer';
export type BackyUserStatus = 'active' | 'inactive' | 'invited' | 'suspended';

export interface BackyUser {
  id: string;
  email: string;
  fullName: string;
  role: BackyUserRole;
  status: BackyUserStatus;
  avatarUrl?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface BackyUserCreateInput {
  email: string;
  fullName: string;
  role: BackyUserRole;
  status?: BackyUserStatus;
}

export interface BackyUserUpdateInput {
  email?: string;
  fullName?: string;
  role?: BackyUserRole;
  status?: BackyUserStatus;
  avatarUrl?: string | null;
}

export interface BackyUserListInput extends BackyPaginationInput {
  teamId?: string;
  role?: BackyUserRole | 'all';
  status?: BackyUserStatus | 'all';
  search?: string;
}

export interface BackySettings {
  deliveryMode: 'demo' | 'database' | 'managed-hosting' | 'custom-frontend';
  apiKeys: {
    publicKey?: string;
    secretKeyId?: string;
  };
  storage?: BackyJsonObject;
  auth?: BackyJsonObject;
  integrations?: BackyJsonObject;
  updatedAt: string;
}

export interface BackySettingsUpdateInput {
  deliveryMode?: BackySettings['deliveryMode'];
  rotatePublicKey?: boolean;
  rotateSecretKey?: boolean;
  apiKeys?: Partial<BackySettings['apiKeys']>;
  storage?: BackyJsonObject;
  auth?: BackyJsonObject;
  integrations?: BackyJsonObject;
}

export interface BackyAuditLogEntry {
  id: string;
  siteId?: string | null;
  teamId?: string | null;
  actorId?: string | null;
  entity: BackyRepositoryEntity;
  entityId: string;
  action: 'create' | 'update' | 'delete' | 'publish' | 'archive' | 'rollback' | 'login' | 'settings.update' | (string & {});
  before?: BackyJsonObject;
  after?: BackyJsonObject;
  metadata?: BackyJsonObject;
  requestId?: string;
  createdAt: string;
}

export interface BackyAuditLogListInput extends BackyPaginationInput {
  siteId?: string;
  teamId?: string;
  actorId?: string;
  entity?: BackyRepositoryEntity;
  entityId?: string;
  action?: string;
  requestId?: string;
}

export interface BackySiteRepository {
  list(input: BackySiteListInput, context?: BackyRepositoryContext): Promise<BackyListResult<Site>>;
  getById(siteId: string, context?: BackyRepositoryContext): Promise<Site | null>;
  getBySlug(slug: string, context?: BackyRepositoryContext): Promise<Site | null>;
  checkSlug(input: { slug: string; teamId?: string; excludeSiteId?: string }, context?: BackyRepositoryContext): Promise<BackySlugAvailabilityResult>;
  create(input: BackySiteCreateInput, context?: BackyRepositoryContext): Promise<BackyRepositoryMutationResult<Site>>;
  update(siteId: string, input: BackySiteUpdateInput, context?: BackyRepositoryContext): Promise<BackyRepositoryMutationResult<Site>>;
  delete(siteId: string, context?: BackyRepositoryContext): Promise<boolean>;
}

export interface BackyPageRepository {
  list(input: BackyPageListInput, context?: BackyRepositoryContext): Promise<BackyListResult<BackyPage>>;
  getById(siteId: string, pageId: string, context?: BackyRepositoryContext): Promise<BackyPage | null>;
  getBySlug(siteId: string, slug: string, context?: BackyRepositoryContext): Promise<BackyPage | null>;
  checkSlug(input: { siteId: string; slug: string; excludePageId?: string }, context?: BackyRepositoryContext): Promise<BackySlugAvailabilityResult>;
  create(input: BackyPageCreateInput, context?: BackyRepositoryContext): Promise<BackyRepositoryMutationResult<BackyPage>>;
  update(siteId: string, pageId: string, input: BackyPageUpdateInput, context?: BackyRepositoryContext): Promise<BackyRepositoryMutationResult<BackyPage>>;
  publish(siteId: string, pageId: string, context?: BackyRepositoryContext): Promise<BackyRepositoryMutationResult<BackyPage>>;
  archive(siteId: string, pageId: string, context?: BackyRepositoryContext): Promise<BackyRepositoryMutationResult<BackyPage>>;
  delete(siteId: string, pageId: string, context?: BackyRepositoryContext): Promise<boolean>;
}

export interface BackyPostRepository {
  list(input: BackyPostListInput, context?: BackyRepositoryContext): Promise<BackyListResult<BackyPost>>;
  getById(siteId: string, postId: string, context?: BackyRepositoryContext): Promise<BackyPost | null>;
  getBySlug(siteId: string, slug: string, context?: BackyRepositoryContext): Promise<BackyPost | null>;
  checkSlug(input: { siteId: string; slug: string; excludePostId?: string }, context?: BackyRepositoryContext): Promise<BackySlugAvailabilityResult>;
  create(input: BackyPostCreateInput, context?: BackyRepositoryContext): Promise<BackyRepositoryMutationResult<BackyPost>>;
  update(siteId: string, postId: string, input: BackyPostUpdateInput, context?: BackyRepositoryContext): Promise<BackyRepositoryMutationResult<BackyPost>>;
  publish(siteId: string, postId: string, context?: BackyRepositoryContext): Promise<BackyRepositoryMutationResult<BackyPost>>;
  archive(siteId: string, postId: string, context?: BackyRepositoryContext): Promise<BackyRepositoryMutationResult<BackyPost>>;
  delete(siteId: string, postId: string, context?: BackyRepositoryContext): Promise<boolean>;
}

export interface BackyBlogTaxonomyRepository {
  listCategories(siteId: string, context?: BackyRepositoryContext): Promise<BackyBlogCategory[]>;
  getCategoryByIdOrSlug(siteId: string, identifier: string, context?: BackyRepositoryContext): Promise<BackyBlogCategory | null>;
  createCategory(input: BackyBlogCategoryCreateInput, context?: BackyRepositoryContext): Promise<BackyRepositoryMutationResult<BackyBlogCategory>>;
  updateCategory(siteId: string, categoryId: string, input: BackyBlogCategoryUpdateInput, context?: BackyRepositoryContext): Promise<BackyRepositoryMutationResult<BackyBlogCategory>>;
  deleteCategory(siteId: string, categoryId: string, context?: BackyRepositoryContext): Promise<boolean>;
  listTags(siteId: string, context?: BackyRepositoryContext): Promise<BackyBlogTag[]>;
  getTagByIdOrSlug(siteId: string, identifier: string, context?: BackyRepositoryContext): Promise<BackyBlogTag | null>;
  createTag(input: BackyBlogTagCreateInput, context?: BackyRepositoryContext): Promise<BackyRepositoryMutationResult<BackyBlogTag>>;
  updateTag(siteId: string, tagId: string, input: BackyBlogTagUpdateInput, context?: BackyRepositoryContext): Promise<BackyRepositoryMutationResult<BackyBlogTag>>;
  deleteTag(siteId: string, tagId: string, context?: BackyRepositoryContext): Promise<boolean>;
  listAuthors(siteId: string, context?: BackyRepositoryContext): Promise<BackyBlogAuthor[]>;
}

export interface BackyCollectionRepository {
  list(input: BackyCollectionListInput, context?: BackyRepositoryContext): Promise<BackyListResult<BackyCollection>>;
  getById(siteId: string, collectionId: string, context?: BackyRepositoryContext): Promise<BackyCollection | null>;
  getBySlug(siteId: string, slug: string, context?: BackyRepositoryContext): Promise<BackyCollection | null>;
  create(input: BackyCollectionCreateInput, context?: BackyRepositoryContext): Promise<BackyRepositoryMutationResult<BackyCollection>>;
  update(siteId: string, collectionId: string, input: BackyCollectionUpdateInput, context?: BackyRepositoryContext): Promise<BackyRepositoryMutationResult<BackyCollection>>;
  delete(siteId: string, collectionId: string, context?: BackyRepositoryContext): Promise<boolean>;
  listRecords(input: BackyCollectionRecordListInput, context?: BackyRepositoryContext): Promise<BackyListResult<BackyCollectionRecord>>;
  getRecordById(siteId: string, collectionId: string, recordId: string, context?: BackyRepositoryContext): Promise<BackyCollectionRecord | null>;
  getRecordBySlug(siteId: string, collectionId: string, slug: string, context?: BackyRepositoryContext): Promise<BackyCollectionRecord | null>;
  createRecord(input: BackyCollectionRecordCreateInput, context?: BackyRepositoryContext): Promise<BackyRepositoryMutationResult<BackyCollectionRecord>>;
  updateRecord(siteId: string, collectionId: string, recordId: string, input: BackyCollectionRecordUpdateInput, context?: BackyRepositoryContext): Promise<BackyRepositoryMutationResult<BackyCollectionRecord>>;
  deleteRecord(siteId: string, collectionId: string, recordId: string, context?: BackyRepositoryContext): Promise<boolean>;
}

export interface BackyMediaRepository {
  list(input: BackyMediaListInput, context?: BackyRepositoryContext): Promise<BackyListResult<MediaItem>>;
  getById(siteId: string, mediaId: string, context?: BackyRepositoryContext): Promise<MediaItem | null>;
  create(input: BackyMediaCreateInput, context?: BackyRepositoryContext): Promise<BackyRepositoryMutationResult<MediaItem>>;
  update(siteId: string, mediaId: string, input: BackyMediaUpdateInput, context?: BackyRepositoryContext): Promise<BackyRepositoryMutationResult<MediaItem>>;
  delete(siteId: string, mediaId: string, context?: BackyRepositoryContext): Promise<boolean>;
  listFolders(siteId: string, context?: BackyRepositoryContext): Promise<MediaFolder[]>;
  getFolderById(siteId: string, folderId: string, context?: BackyRepositoryContext): Promise<MediaFolder | null>;
  createFolder(input: BackyMediaFolderCreateInput, context?: BackyRepositoryContext): Promise<BackyRepositoryMutationResult<MediaFolder>>;
  updateFolder(siteId: string, folderId: string, input: BackyMediaFolderUpdateInput, context?: BackyRepositoryContext): Promise<BackyRepositoryMutationResult<MediaFolder>>;
  deleteFolder(siteId: string, folderId: string, context?: BackyRepositoryContext): Promise<boolean>;
}

export interface BackyFormRepository {
  list(input: BackyFormListInput, context?: BackyRepositoryContext): Promise<BackyListResult<FormDefinition>>;
  getById(siteId: string, formId: string, context?: BackyRepositoryContext): Promise<FormDefinition | null>;
  create(input: Omit<FormDefinition, 'id' | 'createdAt' | 'updatedAt'>, context?: BackyRepositoryContext): Promise<BackyRepositoryMutationResult<FormDefinition>>;
  update(siteId: string, formId: string, input: Partial<FormDefinition>, context?: BackyRepositoryContext): Promise<BackyRepositoryMutationResult<FormDefinition>>;
  delete(siteId: string, formId: string, context?: BackyRepositoryContext): Promise<boolean>;
  listSubmissions(input: BackyFormSubmissionListInput, context?: BackyRepositoryContext): Promise<BackyListResult<FormSubmission>>;
  getSubmissionById(siteId: string, formId: string, submissionId: string, context?: BackyRepositoryContext): Promise<FormSubmission | null>;
  createSubmission(input: Omit<FormSubmission, 'id' | 'submittedAt'>, context?: BackyRepositoryContext): Promise<BackyRepositoryMutationResult<FormSubmission>>;
  updateSubmission(siteId: string, submissionId: string, input: Partial<FormSubmission>, context?: BackyRepositoryContext): Promise<BackyRepositoryMutationResult<FormSubmission>>;
  listContacts(input: BackyContactListInput, context?: BackyRepositoryContext): Promise<BackyListResult<Contact>>;
  getContactById(siteId: string, formId: string, contactId: string, context?: BackyRepositoryContext): Promise<Contact | null>;
  createContact(input: Omit<Contact, 'id' | 'createdAt' | 'updatedAt'>, context?: BackyRepositoryContext): Promise<BackyRepositoryMutationResult<Contact>>;
  updateContact(siteId: string, contactId: string, input: Partial<Contact>, context?: BackyRepositoryContext): Promise<BackyRepositoryMutationResult<Contact>>;
}

export interface BackyCommentRepository {
  list(input: BackyCommentListInput, context?: BackyRepositoryContext): Promise<BackyListResult<Comment>>;
  getById(siteId: string, commentId: string, context?: BackyRepositoryContext): Promise<Comment | null>;
  create(input: BackyCommentCreateInput, context?: BackyRepositoryContext): Promise<BackyRepositoryMutationResult<Comment>>;
  update(siteId: string, commentId: string, input: BackyCommentUpdateInput, context?: BackyRepositoryContext): Promise<BackyRepositoryMutationResult<Comment>>;
  delete(siteId: string, commentId: string, context?: BackyRepositoryContext): Promise<boolean>;
}

export interface BackyReusableSectionRepository {
  list(input: BackyReusableSectionListInput, context?: BackyRepositoryContext): Promise<BackyListResult<BackyReusableSection>>;
  getById(siteId: string, sectionId: string, context?: BackyRepositoryContext): Promise<BackyReusableSection | null>;
  getBySlug(siteId: string, slug: string, context?: BackyRepositoryContext): Promise<BackyReusableSection | null>;
  create(input: BackyReusableSectionCreateInput, context?: BackyRepositoryContext): Promise<BackyRepositoryMutationResult<BackyReusableSection>>;
  update(siteId: string, sectionId: string, input: BackyReusableSectionUpdateInput, context?: BackyRepositoryContext): Promise<BackyRepositoryMutationResult<BackyReusableSection>>;
  delete(siteId: string, sectionId: string, context?: BackyRepositoryContext): Promise<boolean>;
}

export interface BackyContentWorkflowRepository {
  listRevisions(input: BackyContentRevisionListInput, context?: BackyRepositoryContext): Promise<BackyListResult<BackyContentRevision>>;
  getRevisionById(siteId: string, targetType: BackyContentTargetType, targetId: string, revisionId: string, context?: BackyRepositoryContext): Promise<BackyContentRevision | null>;
  createRevision(input: BackyContentRevisionCreateInput, context?: BackyRepositoryContext): Promise<BackyContentRevision>;
  createPreviewToken(input: BackyPreviewTokenCreateInput, context?: BackyRepositoryContext): Promise<BackyPreviewToken>;
  validatePreviewToken(siteId: string, targetType: BackyContentTargetType, targetId: string, token: string, context?: BackyRepositoryContext): Promise<boolean>;
  deletePreviewTokensForTarget(siteId: string, targetType: BackyContentTargetType, targetId: string, context?: BackyRepositoryContext): Promise<number>;
}

export interface BackyUserRepository {
  list(input: BackyUserListInput, context?: BackyRepositoryContext): Promise<BackyListResult<BackyUser>>;
  getById(userId: string, context?: BackyRepositoryContext): Promise<BackyUser | null>;
  getByEmail(email: string, context?: BackyRepositoryContext): Promise<BackyUser | null>;
  create(input: BackyUserCreateInput, context?: BackyRepositoryContext): Promise<BackyRepositoryMutationResult<BackyUser>>;
  update(userId: string, input: BackyUserUpdateInput, context?: BackyRepositoryContext): Promise<BackyRepositoryMutationResult<BackyUser>>;
  delete(userId: string, context?: BackyRepositoryContext): Promise<boolean>;
}

export interface BackySettingsRepository {
  get(context?: BackyRepositoryContext): Promise<BackySettings>;
  update(input: BackySettingsUpdateInput, context?: BackyRepositoryContext): Promise<BackyRepositoryMutationResult<BackySettings>>;
}

export interface BackyAuditLogRepository {
  list(input: BackyAuditLogListInput, context?: BackyRepositoryContext): Promise<BackyListResult<BackyAuditLogEntry>>;
  record(input: Omit<BackyAuditLogEntry, 'id' | 'createdAt'>, context?: BackyRepositoryContext): Promise<BackyAuditLogEntry>;
}

export interface BackyRepositories {
  sites: BackySiteRepository;
  pages: BackyPageRepository;
  posts: BackyPostRepository;
  blogTaxonomy: BackyBlogTaxonomyRepository;
  collections: BackyCollectionRepository;
  media: BackyMediaRepository;
  forms: BackyFormRepository;
  comments: BackyCommentRepository;
  reusableSections: BackyReusableSectionRepository;
  contentWorkflows: BackyContentWorkflowRepository;
  users: BackyUserRepository;
  settings: BackySettingsRepository;
  auditLogs: BackyAuditLogRepository;
}
