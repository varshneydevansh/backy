import type { BackyProductDesignRevision, BackyProductDesignRevisionInput } from './product-design';
import type { BackyFormDesignRevision, BackyFormUpdateInput } from './form-design';
import type { BackyCollectionDesignRevision, BackyCollectionDesignRevisionInput } from './collection-design';
import { serializeTemplateRevisionValue } from './template-history';
import type { BackyMediaStorageJobRepository } from './media-storage-jobs';
import type { BackyVisitorAccountRepository } from './visitor-accounts';
import type { BackyTemplateRevision } from './template-history';
import type { BackyContentDocument, BackyJsonObject, BackyJsonValue } from './content-contract';
import type {
  BlogPost,
  BlogCategory,
  BlogTag,
  Comment,
  CommentBlocklistEntry,
  CommentStatus,
  Contact,
  FormDefinition,
  FormSubmission,
  MediaFolder,
  MediaItem,
  MediaVersion,
  Page,
  PageMeta,
  PublishStatus,
  Site,
  SiteSettings,
  Team,
  TeamMember,
  TeamSettings,
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

/** Read-only identity/metadata projection; full editable content is fetched separately. */
export type BackyPageSummary = Omit<BackyPage, 'content'>;

/** Public path admission; neither canvas, title, SEO nor editor metadata is read. */
export type BackyPageRouteMetadata = Pick<BackyPage, 'id' | 'siteId' | 'slug' | 'status' | 'scheduledAt' | 'isHomepage' | 'parentId'>;
export type BackySiteRouteMetadata = Pick<Site, 'id' | 'slug' | 'isPublished'> & {
  settings: Pick<SiteSettings, 'localization' | 'redirectRules'>;
};

/** Owner canvas lookup; bodies and editor/SEO metadata are never read for discovery. */
export type BackyPageCanvasSource = Pick<BackyPage, 'id' | 'siteId' | 'title' | 'slug' | 'status'>;

/** Page destination discovery; no canvas, owner metadata or SEO payloads. */
export type BackyPageLinkMetadata = Pick<BackyPage, 'id' | 'siteId' | 'title' | 'slug' | 'status' | 'isHomepage' | 'parentId' | 'updatedAt'>;

export interface BackyPost extends Omit<BlogPost, 'content' | 'contentFormat'> {
  content: BackyContentDocument;
  contentFormat: 'editor';
}

/** Visitor archive projection. Never includes a canvas, author or owner metadata. */
export type BackyPostArchiveMetadata = Pick<BackyPost, 'id' | 'siteId' | 'title' | 'slug' | 'excerpt' | 'status' | 'publishedAt' | 'scheduledAt' | 'categoryIds' | 'tagIds'> & {
  meta: { originalPublishedAt?: string | null };
};
export type BackyPostArchiveListInput = BackyPaginationInput & {
  siteId: string; asOf: string; search?: string; categoryId?: string; tagId?: string;
};
export type BackyBlogArchiveTerm = { id: string; siteId: string; name: string; slug: string };

/** Search reads neither editable content nor the rest of the owner metadata. */
export type BackySearchSeoMeta = Pick<PageMeta, 'canonical' | 'title' | 'description' | 'noIndex' | 'noFollow' | 'keywords'>;
export type BackySearchMetadataListInput = BackyPaginationInput & { siteId: string; status: 'published' | 'scheduled' };
export type BackyPageSearchMetadata = Pick<BackyPage, 'id' | 'siteId' | 'title' | 'slug' | 'description' | 'status' | 'scheduledAt' | 'updatedAt' | 'isHomepage' | 'parentId'> & { meta: BackySearchSeoMeta };
export type BackyPostSearchMetadata = Pick<BackyPost, 'id' | 'siteId' | 'title' | 'slug' | 'excerpt' | 'status' | 'scheduledAt' | 'updatedAt'> & { meta: BackySearchSeoMeta };

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
  | 'blogCategory'
  | 'blogTag'
  | 'collection'
  | 'collectionRecord'
  | 'media'
  | 'mediaFolder'
  | 'form'
  | 'formSubmission'
  | 'reusableSection'
  | 'interactiveComponent'
  | 'contact'
  | 'comment'
  | 'team'
  | 'teamMember'
  | 'user'
  | 'settings'
  | 'auditLog'
  | 'cacheInvalidation';

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
  /** Merged atomically with current settings. Change frontendDesign through templateRevisions.commitDesign. */
  settings?: Omit<Partial<SiteSettings>, 'frontendDesign'>;
  status?: PublishStatus;
  isPublished?: boolean;
  publishedAt?: string | null;
}

export interface BackySiteListInput extends BackyPaginationInput {
  teamId?: string;
  status?: PublishStatus | 'all';
  search?: string;
}

export interface BackyTeamListInput extends BackyPaginationInput {
  ownerId?: string;
  search?: string;
}

export interface BackyTeamCreateInput {
  name: string;
  slug: string;
  ownerId?: string | null;
  settings?: Partial<TeamSettings>;
}

export interface BackyTeamUpdateInput {
  name?: string;
  slug?: string;
  ownerId?: string | null;
  settings?: Partial<TeamSettings>;
}

export interface BackyTeamMemberListInput {
  teamId: string;
}

export interface BackyTeamMemberAddInput {
  teamId: string;
  userId: string;
  role: BackyUserRole;
}

export interface BackyTeamMemberUpdateInput {
  role: BackyUserRole;
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

/** Optional optimistic guard. Migrations supply both the timestamp and content snapshot. */
export interface BackyContentUpdateExpectation {
  expectedContent?: BackyContentDocument;
  expectedUpdatedAt?: string;
  /** Internal baseline history write; requires both expectations and shares their transaction. */
  beforeUpdateRevision?: Omit<BackyContentRevisionCreateInput, 'siteId' | 'targetType' | 'targetId'>;
}

export class BackyContentConflictError extends Error {
  readonly code = 'CONTENT_REVISION_CONFLICT';
  constructor() {
    super('This document changed after the migration inventory was read. Reload the migration preview before retrying.');
    this.name = 'BackyContentConflictError';
  }
}

/** Compare JSON semantics, not object key order or timestamps alone. Call inside the write lock. */
export function assertBackyContentUpdateExpectation(
  input: { expectedContent?: unknown; expectedUpdatedAt?: unknown },
  current: { content: unknown; updatedAt: string } | null,
): void {
  if (input.expectedContent === undefined && input.expectedUpdatedAt === undefined) return;
  if (!current || typeof input.expectedUpdatedAt !== 'string'
    || !Number.isFinite(Date.parse(input.expectedUpdatedAt))
    || Date.parse(current.updatedAt) !== Date.parse(input.expectedUpdatedAt)
    || (input.expectedContent !== undefined && serializeTemplateRevisionValue(current.content) !== serializeTemplateRevisionValue(input.expectedContent))) {
    throw new BackyContentConflictError();
  }
}

export interface BackyPageUpdateInput extends BackyContentUpdateExpectation {
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

export interface BackyPostUpdateInput extends Partial<Omit<BackyPostCreateInput, 'siteId'>>, BackyContentUpdateExpectation {
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
  year?: number;
  month?: number;
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
  helpText?: string | null;
  sortOrder?: number;
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
  /** Derived definition authoring token; not persisted or fingerprinted recursively. */
  version?: string;
  id: string;
  siteId: string;
  name: string;
  slug: string;
  routePattern?: string | null;
  listRoutePattern?: string | null;
  description?: string | null;
  status: PublishStatus;
  fields: BackyCollectionField[];
  permissions: BackyCollectionPermissions;
  metadata?: BackyJsonObject;
  createdAt: string;
  updatedAt: string;
}

export interface BackyCollectionRecord {
  /** Optional authenticated authoring response token; not persisted content. */
  version?: string;
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

/** Narrow search reads omit canvas definitions, field options and record provenance. */
export type BackyCollectionSearchMetadata = Pick<BackyCollection,
  'id' | 'siteId' | 'name' | 'slug' | 'description' | 'status' | 'updatedAt' | 'routePattern' | 'listRoutePattern'>
  & { permissions: Pick<BackyCollectionPermissions, 'publicRead'>; metadata?: { publicSearch?: BackyJsonValue } };
export type BackyCollectionRecordSearchMetadata = Pick<BackyCollectionRecord,
  'id' | 'siteId' | 'collectionId' | 'slug' | 'status' | 'scheduledAt' | 'updatedAt' | 'values'>;
export type BackyCollectionRecordSearchInput = BackySearchMetadataListInput & { collectionId: string; valueKeys: string[] };

export interface BackyCollectionCreateInput {
  siteId: string;
  name: string;
  slug: string;
  routePattern?: string | null;
  listRoutePattern?: string | null;
  description?: string | null;
  status?: PublishStatus;
  fields: BackyCollectionField[];
  permissions?: Partial<BackyCollectionPermissions>;
  metadata?: BackyJsonObject;
}

export interface BackyCollectionUpdateInput extends Partial<Omit<BackyCollectionCreateInput, 'siteId'>> {
  expectedVersion?: string;
  expectedCollection?: BackyCollection;
  beforeUpdateCollectionDesignRevision?: BackyCollectionDesignRevisionInput;
}

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

export interface BackyCollectionRecordUpdateInput extends Partial<Omit<BackyCollectionRecordCreateInput, 'siteId' | 'collectionId'>> {
  expectedUpdatedAt?: string;
  expectedVersion?: string;
  /** Internal canonical snapshot; compare under the record write lock. */
  expectedRecord?: BackyCollectionRecord;
  /** Internal only; repository captures the locked design preimage atomically. */
  beforeUpdateProductDesignRevision?: BackyProductDesignRevisionInput;
}

export class BackyCollectionRecordConflictError extends Error {
  readonly code = 'COLLECTION_RECORD_CONFLICT';
  constructor() { super('This collection record changed while you were editing. Reload the latest record before saving again.'); this.name = 'BackyCollectionRecordConflictError'; }
}

/** Canonical semantic record bytes used by server SHA-256 version tokens. */
export function serializeBackyCollectionRecordVersion(record: BackyCollectionRecord): string {
  const { version: _version, ...snapshot } = record;
  return serializeTemplateRevisionValue(snapshot);
}

export function assertBackyCollectionRecordUpdateExpectation(
  siteId: string, collectionId: string, recordId: string,
  input: { expectedUpdatedAt?: unknown; expectedVersion?: unknown; expectedRecord?: unknown },
  current: BackyCollectionRecord | null,
  currentVersion?: string,
): void {
  if (input.expectedUpdatedAt === undefined && input.expectedRecord === undefined && input.expectedVersion === undefined) return;
  if (!current || current.siteId !== siteId || current.collectionId !== collectionId || current.id !== recordId
    || (input.expectedUpdatedAt !== undefined && (typeof input.expectedUpdatedAt !== 'string'
      || !Number.isFinite(Date.parse(input.expectedUpdatedAt)) || Date.parse(current.updatedAt) !== Date.parse(input.expectedUpdatedAt)))
    || (input.expectedVersion !== undefined && (typeof input.expectedVersion !== 'string' || input.expectedVersion !== currentVersion))
    || (input.expectedRecord !== undefined && serializeBackyCollectionRecordVersion(current) !== serializeBackyCollectionRecordVersion(input.expectedRecord as BackyCollectionRecord))) {
    throw new BackyCollectionRecordConflictError();
  }
}

export interface BackyCollectionRecordValidationIssue { field: string; code: string; message: string; label?: string }
export class BackyCollectionRecordValidationError extends Error {
  readonly code = 'COLLECTION_RECORD_VALIDATION';
  constructor(readonly details: BackyCollectionRecordValidationIssue[]) { super('Collection record values are invalid.'); this.name = 'BackyCollectionRecordValidationError'; }
}
export function normalizeBackyCollectionUniqueValue(value: unknown): string {
  if (value === null || value === undefined || (Array.isArray(value) && value.length === 0)) return '';
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return String(value).trim().toLowerCase();
  return serializeTemplateRevisionValue(value);
}
export function collectionRecordUniqueIssues(collection: Pick<BackyCollection, 'fields'>, values: Record<string, unknown>, records: Array<Pick<BackyCollectionRecord, 'id' | 'values'>>, excludeRecordId?: string): BackyCollectionRecordValidationIssue[] {
  return collection.fields.filter(field => field.unique).flatMap(field => {
    const value = normalizeBackyCollectionUniqueValue(values[field.key]);
    return value && records.some(record => record.id !== excludeRecordId && normalizeBackyCollectionUniqueValue(record.values[field.key]) === value)
      ? [{ field: field.key, code: 'unique', label: field.label, message: `${field.label} must be unique.` }] : [];
  });
}
/** Check the final batch inventory in linear time, so legitimate unique-value swaps can commit. */
export function assertBackyCollectionRecordInventoryUnique(collection: Pick<BackyCollection, 'fields'>, records: Array<Pick<BackyCollectionRecord, 'id' | 'values'>>): void {
  const issues: BackyCollectionRecordValidationIssue[] = [];
  for (const field of collection.fields.filter(field => field.unique)) {
    const seen = new Set<string>();
    for (const record of records) {
      const value = normalizeBackyCollectionUniqueValue(record.values[field.key]);
      if (!value) continue;
      if (seen.has(value)) { issues.push({ field: field.key, code: 'unique', label: field.label, message: `${field.label} must be unique.` }); break; }
      seen.add(value);
    }
  }
  if (issues.length) throw new BackyCollectionRecordValidationError(issues);
}

/** Internally prepared full import; expectations are canonical site-scoped snapshots. */
export interface BackyCollectionImportOperation {
  input: Omit<BackyCollectionCreateInput, 'siteId'>;
  expectedCollection: BackyCollection | null;
  expectedRecords: BackyCollectionRecord[];
  records: Array<{ input: Omit<BackyCollectionRecordCreateInput, 'siteId' | 'collectionId'>; expectedRecord: BackyCollectionRecord | null }>;
}
export interface BackyCollectionImportResult {
  collections: BackyCollection[];
  records: BackyCollectionRecord[];
  createdCollections: number;
  updatedCollections: number;
  createdRecords: number;
  updatedRecords: number;
}
export class BackyCollectionImportConflictError extends Error {
  readonly code = 'COLLECTION_IMPORT_CONFLICT';
  constructor() { super('Collection content changed while the import was prepared. Reload the collections and retry; no import changes were committed.'); }
}
export function assertBackyCollectionImportExpectation(siteId: string, operation: BackyCollectionImportOperation, collection: BackyCollection | null, records: BackyCollectionRecord[]): void {
  const canonicalRecords = (value: BackyCollectionRecord[]) => [...value].sort((a, b) => a.id.localeCompare(b.id));
  if (operation.expectedCollection && operation.expectedCollection.siteId !== siteId
    || collection && collection.siteId !== siteId
    || operation.expectedRecords.some(record => record.siteId !== siteId || record.collectionId !== operation.expectedCollection?.id)
    || records.some(record => record.siteId !== siteId || record.collectionId !== collection?.id)
    || serializeTemplateRevisionValue(operation.expectedCollection) !== serializeTemplateRevisionValue(collection)
    || serializeTemplateRevisionValue(canonicalRecords(operation.expectedRecords)) !== serializeTemplateRevisionValue(canonicalRecords(records))) throw new BackyCollectionImportConflictError();
  for (const record of operation.records) {
    const actual = records.find(item => item.slug === record.input.slug) || null;
    if (serializeTemplateRevisionValue(record.expectedRecord) !== serializeTemplateRevisionValue(actual)) throw new BackyCollectionImportConflictError();
  }
}

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
  originalName?: string;
  mimeType?: string;
  size?: number;
  type?: MediaItem['type'];
  url?: string;
  thumbnailUrl?: string | null;
  folderId?: string | null;
  altText?: string | null;
  caption?: string | null;
  visibility?: MediaItem['visibility'];
  metadata?: MediaItem['metadata'];
  tags?: string[];
}

export interface BackyMediaVersionCreateInput {
  siteId: string;
  mediaId: string;
  filename: string;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  type: MediaItem['type'];
  url: string;
  thumbnailUrl?: string | null;
  storagePath?: string | null;
  storageProvider?: string | null;
  replacedAt: string;
  replacedBy?: string | null;
  reason?: string | null;
  metadata?: MediaItem['metadata'];
}

export interface BackyMediaListInput extends BackyPaginationInput {
  siteId: string;
  type?: MediaItem['type'] | 'all';
  folderId?: string | null;
  visibility?: MediaItem['visibility'] | 'all';
  search?: string;
  linkedPageId?: string;
  linkedPostId?: string;
}

export interface BackyMediaVersionListInput extends BackyPaginationInput {
  siteId: string;
  mediaId: string;
}

export interface BackyMediaSiteVersionListInput extends BackyPaginationInput {
  siteId: string;
}

export interface BackyMediaVersionDeleteInput {
  siteId: string;
  mediaId: string;
  versionId: string;
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
  newsletterSubscriptionStatus?: NonNullable<Contact['newsletterSubscriptionStatus']> | 'all';
  newsletterOnly?: boolean;
  search?: string;
  requestId?: string;
}

export interface BackyCommentCreateInput {
  visitorMemberId?: string | null;
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
  parentId?: string | null;
  commentThreadId?: string | null;
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

export interface BackyCommentReportInput {
  reason: NonNullable<Comment['reportReasons']>[number];
  requestId?: string | null;
}

export interface BackyCommentModerationInput {
  commentIds: string[];
  status?: CommentStatus;
  clearReports?: boolean;
  reviewedBy?: string | null;
  actor?: string | null;
  rejectionReason?: string | null;
  blockReason?: string | null;
  requestId?: string | null;
  defaultReviewer?: string | null;
}
export interface BackyCommentModerationResult { updated: Comment[]; missingIds: string[] }

export interface BackyCommentListInput extends BackyPaginationInput {
  siteId: string;
  /** Internal public-read boundary: approved comments on published targets; private search fields excluded. */
  publicOnly?: boolean;
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

export interface BackyCommentBlocklistListInput extends BackyPaginationInput {
  siteId: string;
  type?: CommentBlocklistEntry['type'] | 'all';
  q?: string;
}

export interface BackyCommentBlockIdentityInput {
  siteId: string;
  reason: string;
  actor?: string | null;
  requestId?: string | null;
  email?: string | null;
  ipHash?: string | null;
}

export interface BackyCommentBlocklistDeleteResult {
  deleted: CommentBlocklistEntry[];
  missingIds: string[];
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
  metadata?: BackyJsonObject;
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
  metadata?: BackyJsonObject;
  sourceElementId?: string | null;
  createdBy?: string | null;
  updatedBy?: string | null;
}

export interface BackyReusableSectionUpdateInput {
  /** Internal complete read snapshot, checked under the write lock. */
  expectedSection?: BackyReusableSection;
  name?: string;
  slug?: string;
  description?: string | null;
  category?: string;
  status?: BackyReusableSectionStatus;
  tags?: string[];
  content?: BackyJsonObject;
  metadata?: BackyJsonObject;
  sourceElementId?: string | null;
  updatedBy?: string | null;
}

export class BackyReusableSectionConflictError extends Error {
  readonly code = 'REUSABLE_SECTION_VERSION_CONFLICT';
  constructor() { super('Reusable section changed after it was read. Reload the section and retry.'); this.name = 'BackyReusableSectionConflictError'; }
}

export function assertBackyReusableSectionExpectation(input: { expectedSection?: unknown }, current: unknown): void {
  if (input.expectedSection !== undefined && (!current || serializeTemplateRevisionValue(input.expectedSection) !== serializeTemplateRevisionValue(current))) throw new BackyReusableSectionConflictError();
}

export type BackyReusableSectionBatchMutation =
  | { type: 'create'; input: BackyReusableSectionCreateInput }
  | { type: 'update'; sectionId: string; input: BackyReusableSectionUpdateInput & { expectedSection: BackyReusableSection } };

export interface BackyReusableSectionListInput extends BackyPaginationInput {
  siteId: string;
  status?: BackyReusableSectionStatus | 'all';
  category?: string;
  tag?: string;
  search?: string;
}

export type BackyInteractiveComponentType = 'interactiveFigure' | 'codeComponent';
export type BackyInteractiveComponentStatus = 'active' | 'disabled' | 'archived';
export type BackyInteractiveComponentReviewStatus = 'draft' | 'in_review' | 'approved' | 'rejected';
export type BackyInteractiveComponentRenderMode = 'trusted-component' | 'sandbox-iframe' | 'static-fallback';
export type BackyInteractiveComponentSource = 'registry' | 'custom';

export interface BackyInteractiveComponentFallback {
  required: boolean;
  supported: string[];
}

export interface BackyInteractiveComponentIntegrity {
  signed: boolean;
  signatureRequiredForCustomCode: boolean;
  algorithm?: string;
  sha256?: string;
  signature?: string;
  signedBy?: string | null;
  signedAt?: string | null;
  storageProvider?: string;
  storagePath?: string;
  bundleUrl?: string;
  sizeBytes?: number;
  contentType?: string;
  filename?: string;
}

export interface BackyInteractiveComponentRuntime {
  sandboxUrl?: string | null;
  bundleUrl?: string | null;
  iframeSandbox?: string;
  allowedPermissions?: string[];
  postMessageProtocol: string;
}

export interface BackyInteractiveComponent {
  id: string;
  siteId: string;
  componentKey: string;
  displayName: string;
  type: BackyInteractiveComponentType;
  status: BackyInteractiveComponentStatus;
  reviewStatus: BackyInteractiveComponentReviewStatus;
  version: string;
  renderMode: BackyInteractiveComponentRenderMode;
  source: BackyInteractiveComponentSource;
  description: string;
  allowedDataScopes: string[];
  requiredFields: string[];
  controls: BackyJsonObject[];
  fallback: BackyInteractiveComponentFallback;
  security: BackyJsonObject;
  integrity: BackyInteractiveComponentIntegrity;
  runtime?: BackyInteractiveComponentRuntime;
  ownerId?: string | null;
  dependencyMetadata: BackyJsonObject;
  changelog?: string | null;
  rollbackFromVersion?: string | null;
  createdBy?: string | null;
  updatedBy?: string | null;
  reviewedBy?: string | null;
  reviewedAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface BackyInteractiveComponentCreateInput {
  siteId: string;
  componentKey: string;
  displayName: string;
  type: BackyInteractiveComponentType;
  status?: BackyInteractiveComponentStatus;
  reviewStatus?: BackyInteractiveComponentReviewStatus;
  version: string;
  renderMode: BackyInteractiveComponentRenderMode;
  source?: BackyInteractiveComponentSource;
  description?: string;
  allowedDataScopes?: string[];
  requiredFields?: string[];
  controls?: BackyJsonObject[];
  fallback?: BackyInteractiveComponentFallback;
  security?: BackyJsonObject;
  integrity?: BackyInteractiveComponentIntegrity;
  runtime?: BackyInteractiveComponentRuntime;
  ownerId?: string | null;
  dependencyMetadata?: BackyJsonObject;
  changelog?: string | null;
  rollbackFromVersion?: string | null;
  createdBy?: string | null;
  updatedBy?: string | null;
  reviewedBy?: string | null;
  reviewedAt?: string | null;
}

export interface BackyInteractiveComponentUpdateInput {
  displayName?: string;
  type?: BackyInteractiveComponentType;
  status?: BackyInteractiveComponentStatus;
  reviewStatus?: BackyInteractiveComponentReviewStatus;
  renderMode?: BackyInteractiveComponentRenderMode;
  source?: BackyInteractiveComponentSource;
  description?: string;
  allowedDataScopes?: string[];
  requiredFields?: string[];
  controls?: BackyJsonObject[];
  fallback?: BackyInteractiveComponentFallback;
  security?: BackyJsonObject;
  integrity?: BackyInteractiveComponentIntegrity;
  runtime?: BackyInteractiveComponentRuntime;
  ownerId?: string | null;
  dependencyMetadata?: BackyJsonObject;
  changelog?: string | null;
  rollbackFromVersion?: string | null;
  updatedBy?: string | null;
  reviewedBy?: string | null;
  reviewedAt?: string | null;
}

export interface BackyInteractiveComponentListInput extends BackyPaginationInput {
  siteId: string;
  status?: BackyInteractiveComponentStatus | 'all';
  reviewStatus?: BackyInteractiveComponentReviewStatus | 'all';
  type?: BackyInteractiveComponentType | 'all';
  publicOnly?: boolean;
  search?: string;
}

export interface BackyInteractiveComponentRollbackResult {
  restored: BackyInteractiveComponent;
  disabledVersions: BackyInteractiveComponent[];
  restoredFromVersion: string | null;
}

export type BackyContentTargetType = 'page' | 'post';
export type BackyContentRevisionOperation =
  | 'update'
  | 'publish'
  | 'archive'
  | 'rollback'
  | 'migration'
  | (string & {});

export interface BackyContentRevision {
  id: string;
  siteId: string;
  targetType: BackyContentTargetType;
  targetId: string;
  snapshot: BackyJsonObject;
  note?: string | null;
  parentRevisionId?: string | null;
  operation?: BackyContentRevisionOperation | null;
  restoreTargetRevisionId?: string | null;
  metadata?: BackyJsonObject;
  createdBy?: string | null;
  createdAt: string;
}

export interface BackyContentRevisionCreateInput {
  siteId: string;
  targetType: BackyContentTargetType;
  targetId: string;
  snapshot: BackyJsonObject;
  note?: string | null;
  parentRevisionId?: string | null;
  operation?: BackyContentRevisionOperation | null;
  restoreTargetRevisionId?: string | null;
  metadata?: BackyJsonObject | null;
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
export type BackyUserSortBy = 'fullName' | 'email' | 'role' | 'status' | 'createdAt' | 'updatedAt';
export type BackySortDirection = 'asc' | 'desc';

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

export interface BackyUserPasswordCredential {
  userId: string;
  email: string;
  passwordHash: string;
  salt: string;
  updatedAt: string;
}

export interface BackyUserPasswordCredentialInput {
  passwordHash: string;
  salt: string;
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
  sortBy?: BackyUserSortBy;
  sortDirection?: BackySortDirection;
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
  /** Scoped interaction identities, applied before count and pagination. */
  formId?: string;
  commentId?: string;
  contactId?: string;
}

export type BackyCacheInvalidationScope =
  | 'all'
  | 'discovery'
  | 'render'
  | 'seo'
  | 'navigation'
  | 'media'
  | 'content'
  | 'settings'
  | (string & {});

export interface BackyCacheInvalidationEvent {
  id: string;
  siteId?: string | null;
  scope: BackyCacheInvalidationScope;
  entity: BackyRepositoryEntity;
  entityId?: string | null;
  reason: string;
  revision: string;
  metadata?: BackyJsonObject;
  createdAt: string;
}

export interface BackyCacheInvalidationListInput extends BackyPaginationInput {
  siteId?: string;
  scope?: BackyCacheInvalidationScope;
  entity?: BackyRepositoryEntity;
  entityId?: string;
}

export interface BackyCacheInvalidationRecordInput {
  siteId?: string | null;
  scope?: BackyCacheInvalidationScope;
  entity: BackyRepositoryEntity;
  entityId?: string | null;
  reason: string;
  revision?: string;
  metadata?: BackyJsonObject;
}

export interface BackySiteRepository {
  /** Only routing settings recognized by the public resolver; bounded, with no full-read fallback. */
  getRouteMetadataByIdOrSlug?(identifier: string, context?: BackyRepositoryContext): Promise<BackySiteRouteMetadata | null>;
  /** Exact identity/team admission; excludes theme, content and settings. */
  getAccessScopeByIdOrSlug?(identifier: string, context?: BackyRepositoryContext): Promise<Pick<Site, 'id' | 'slug' | 'teamId'> | null>;
  /** Search identity and SEO-only settings; excludes theme, design registry and other settings. */
  getSearchMetadataByIdOrSlug?(identifier: string, context?: BackyRepositoryContext): Promise<BackySiteSearchMetadata | null>;
  /** Fresh identity/publication admission without site settings, templates or theme. */
  getPublicationByIdOrSlug?(identifier: string, context?: BackyRepositoryContext): Promise<Pick<Site, 'id' | 'slug' | 'isPublished'> | null>;
  list(input: BackySiteListInput, context?: BackyRepositoryContext): Promise<BackyListResult<Site>>;
  getById(siteId: string, context?: BackyRepositoryContext): Promise<Site | null>;
  getBySlug(slug: string, context?: BackyRepositoryContext): Promise<Site | null>;
  checkSlug(input: { slug: string; teamId?: string; excludeSiteId?: string }, context?: BackyRepositoryContext): Promise<BackySlugAvailabilityResult>;
  create(input: BackySiteCreateInput, context?: BackyRepositoryContext): Promise<BackyRepositoryMutationResult<Site>>;
  update(siteId: string, input: BackySiteUpdateInput, context?: BackyRepositoryContext): Promise<BackyRepositoryMutationResult<Site>>;
  delete(siteId: string, context?: BackyRepositoryContext): Promise<boolean>;
}

export type BackySiteSearchMetadata = Pick<Site, 'id' | 'slug' | 'name' | 'isPublished' | 'updatedAt'> & {
  settings: { seo: Pick<SiteSettings['seo'], 'titleTemplate' | 'defaultDescription' | 'robots' | 'routeOverrides'> };
};

export interface BackyPageRepository {
  listCanvasSourceMetadata?(input: BackyPaginationInput & { siteId: string; search?: string }, context?: BackyRepositoryContext): Promise<BackyListResult<BackyPageCanvasSource>>;
  getRouteMetadataById?(siteId: string, pageId: string, context?: BackyRepositoryContext): Promise<BackyPageRouteMetadata | null>;
  getRouteMetadataBySlug?(siteId: string, slug: string, context?: BackyRepositoryContext): Promise<BackyPageRouteMetadata | null>;
  listRouteMetadata?(input: BackyPageListInput, context?: BackyRepositoryContext): Promise<BackyListResult<BackyPageRouteMetadata>>;
  listLinkMetadata?(input: BackyPaginationInput & { siteId: string }, context?: BackyRepositoryContext): Promise<BackyListResult<BackyPageLinkMetadata>>;
  listSearchMetadata?(input: BackySearchMetadataListInput, context?: BackyRepositoryContext): Promise<BackyListResult<BackyPageSearchMetadata>>;
  listSummaries?(input: BackyPageListInput, context?: BackyRepositoryContext): Promise<BackyListResult<BackyPageSummary>>;
  getSummaryById?(siteId: string, pageId: string, context?: BackyRepositoryContext): Promise<BackyPageSummary | null>;
  getSummaryBySlug?(siteId: string, slug: string, context?: BackyRepositoryContext): Promise<BackyPageSummary | null>;
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
  listPublicArchiveMetadata?(input: BackyPostArchiveListInput, context?: BackyRepositoryContext): Promise<BackyListResult<BackyPostArchiveMetadata>>;
  listSearchMetadata?(input: BackySearchMetadataListInput, context?: BackyRepositoryContext): Promise<BackyListResult<BackyPostSearchMetadata>>;
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
  listArchiveTerms?(siteId: string, context?: BackyRepositoryContext): Promise<{ categories: BackyBlogArchiveTerm[]; tags: BackyBlogArchiveTerm[] }>;
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

export interface BackyCollectionRecordAdmissionContext {
  media: Pick<BackyMediaRepository, 'getById'>;
  settings: Pick<BackySettingsRepository, 'get'>;
  sites: Pick<BackySiteRepository, 'getById'>;
}
export interface BackyCollectionRepository {
  listSearchMetadata?(input: BackyPaginationInput & { siteId: string }, context?: BackyRepositoryContext): Promise<BackyListResult<BackyCollectionSearchMetadata>>;
  listRecordSearchMetadata?(input: BackyCollectionRecordSearchInput, context?: BackyRepositoryContext): Promise<BackyListResult<BackyCollectionRecordSearchMetadata>>;
  withDefinitionWriteLock?<T>(siteId: string, collectionId: string, operation: (repository: BackyCollectionRepository, collection: BackyCollection, repositories: BackyRepositories) => Promise<T>): Promise<T>;
  listCollectionDesignRevisions?(siteId: string, collectionId: string, options?: BackyPaginationInput): Promise<BackyCollectionDesignRevision[]>;
  getCollectionDesignRevision?(siteId: string, collectionId: string, revisionId: string): Promise<BackyCollectionDesignRevision | null>;
  withRecordWriteLock<T>(siteId: string, collectionId: string, operation: (repository: BackyCollectionRepository, collection: BackyCollection, context: BackyCollectionRecordAdmissionContext) => Promise<T>): Promise<T>;
  applyImport(siteId: string, operations: BackyCollectionImportOperation[], decorateWriter?: (repository: BackyCollectionRepository, repositories: BackyRepositories) => BackyCollectionRepository, reconcileRetainedRecords?: (repositories: BackyRepositories, collection: BackyCollection, records: BackyCollectionRecord[]) => Promise<void>): Promise<BackyCollectionImportResult>;
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
  listProductDesignRevisions?(siteId: string, collectionId: string, recordId: string, options?: BackyPaginationInput): Promise<BackyProductDesignRevision[]>;
  getProductDesignRevision?(siteId: string, collectionId: string, recordId: string, revisionId: string): Promise<BackyProductDesignRevision | null>;
  deleteRecord(siteId: string, collectionId: string, recordId: string, context?: BackyRepositoryContext): Promise<boolean>;
}

export interface BackyMediaRepository {
  /** Bounded public render dependencies plus the complete bounded public font subset; never a site inventory. */
  getPublicRenderAssets?(input: { siteId: string; mediaIds: string[]; maxFonts: number }): Promise<MediaItem[]>;
  /** Private durable write/cleanup journal, required by storage mutation handlers. */
  storageJobs?: BackyMediaStorageJobRepository;
  /** Serialize site storage writes across PostgreSQL workers; busy admission fails without waiting. */
  withStorageMutationLock?<T>(siteId: string, operation: () => Promise<T>): Promise<T>;
  list(input: BackyMediaListInput, context?: BackyRepositoryContext): Promise<BackyListResult<MediaItem>>;
  getById(siteId: string, mediaId: string, context?: BackyRepositoryContext): Promise<MediaItem | null>;
  create(input: BackyMediaCreateInput, context?: BackyRepositoryContext): Promise<BackyRepositoryMutationResult<MediaItem>>;
  update(siteId: string, mediaId: string, input: BackyMediaUpdateInput, context?: BackyRepositoryContext): Promise<BackyRepositoryMutationResult<MediaItem>>;
  delete(siteId: string, mediaId: string, context?: BackyRepositoryContext): Promise<boolean>;
  listVersions(input: BackyMediaVersionListInput, context?: BackyRepositoryContext): Promise<BackyListResult<MediaVersion>>;
  /** Optional complete-site retained-version pagination for quota/reference inventory. */
  listSiteVersions?(input: BackyMediaSiteVersionListInput, context?: BackyRepositoryContext): Promise<BackyListResult<MediaVersion>>;
  createVersion(input: BackyMediaVersionCreateInput, context?: BackyRepositoryContext): Promise<BackyRepositoryMutationResult<MediaVersion>>;
  deleteVersion(input: BackyMediaVersionDeleteInput, context?: BackyRepositoryContext): Promise<boolean>;
  listFolders(siteId: string, context?: BackyRepositoryContext): Promise<MediaFolder[]>;
  getFolderById(siteId: string, folderId: string, context?: BackyRepositoryContext): Promise<MediaFolder | null>;
  createFolder(input: BackyMediaFolderCreateInput, context?: BackyRepositoryContext): Promise<BackyRepositoryMutationResult<MediaFolder>>;
  updateFolder(siteId: string, folderId: string, input: BackyMediaFolderUpdateInput, context?: BackyRepositoryContext): Promise<BackyRepositoryMutationResult<MediaFolder>>;
  deleteFolder(siteId: string, folderId: string, context?: BackyRepositoryContext): Promise<boolean>;
}

export interface BackyFormRepository {
  /** Durable source privacy fence spans all follow-ups, including provider execution. Missing adapters fail closed. */
  withSubmissionFollowup?<T>(siteId: string, formId: string, submissionId: string, operation: () => Promise<T>): Promise<T>;
  withContactFollowup?<T>(siteId: string, contactId: string, operation: () => Promise<T>): Promise<T>;
  /** Server-derived contributor identity; new rows are exclusive only until a manual/unknown modification. */
  shareContactFromSubmission?(siteId: string, formId: string, submissionId: string, input: Omit<Contact, 'id' | 'createdAt' | 'updatedAt' | 'sourceSubmissionId'>, dedupeByEmail: boolean): Promise<BackyRepositoryMutationResult<Contact>>;
  withDefinitionWriteLock?<T>(siteId: string, formId: string, operation: (repository: BackyFormRepository, form: FormDefinition, repositories: BackyRepositories) => Promise<T>): Promise<T>;
  listFormDesignRevisions?(siteId: string, formId: string, options?: BackyPaginationInput): Promise<BackyFormDesignRevision[]>;
  getFormDesignRevision?(siteId: string, formId: string, revisionId: string): Promise<BackyFormDesignRevision | null>;
  /** Reviewed template-pack import: one same-site serializable transaction; unsupported adapters must refuse. */
  withTemplatePackImportLock?<T>(siteId: string, operation: (repositories: BackyRepositories) => Promise<T>): Promise<T>;
  list(input: BackyFormListInput, context?: BackyRepositoryContext): Promise<BackyListResult<FormDefinition>>;
  getById(siteId: string, formId: string, context?: BackyRepositoryContext): Promise<FormDefinition | null>;
  create(input: Omit<FormDefinition, 'id' | 'createdAt' | 'updatedAt'>, context?: BackyRepositoryContext): Promise<BackyRepositoryMutationResult<FormDefinition>>;
  update(siteId: string, formId: string, input: BackyFormUpdateInput, context?: BackyRepositoryContext): Promise<BackyRepositoryMutationResult<FormDefinition>>;
  delete(siteId: string, formId: string, context?: BackyRepositoryContext): Promise<boolean>;
  listSubmissions(input: BackyFormSubmissionListInput, context?: BackyRepositoryContext): Promise<BackyListResult<FormSubmission>>;
  getSubmissionById(siteId: string, formId: string, submissionId: string, context?: BackyRepositoryContext): Promise<FormSubmission | null>;
  createSubmission(input: Omit<FormSubmission, 'id' | 'submittedAt'>, context?: BackyRepositoryContext): Promise<BackyRepositoryMutationResult<FormSubmission>>;
  updateSubmission(siteId: string, submissionId: string, input: Partial<FormSubmission>, context?: BackyRepositoryContext): Promise<BackyRepositoryMutationResult<FormSubmission>>;
  listContacts(input: BackyContactListInput, context?: BackyRepositoryContext): Promise<BackyListResult<Contact>>;
  getContactById(siteId: string, formId: string, contactId: string, context?: BackyRepositoryContext): Promise<Contact | null>;
  createContact(input: Omit<Contact, 'id' | 'createdAt' | 'updatedAt'>, context?: BackyRepositoryContext): Promise<BackyRepositoryMutationResult<Contact>>;
  updateContact(siteId: string, contactId: string, input: Partial<Contact>, context?: BackyRepositoryContext): Promise<BackyRepositoryMutationResult<Contact>>;
  deleteContact(siteId: string, contactId: string, context?: BackyRepositoryContext): Promise<boolean>;
}

export interface BackyCommentRepository {
  withPrivacyFollowup?<T>(siteId: string, commentId: string, operation: () => Promise<T>): Promise<T>;
  /** One admitted transaction for selected moderation and any identity blocks. Missing scoped IDs remain explicit outcomes. */
  moderateBatch(siteId: string, input: BackyCommentModerationInput, context?: BackyRepositoryContext): Promise<BackyCommentModerationResult>;
  /** Reread public visibility and report state under shared comment mutation admission. No stale caller snapshot is written. */
  report(siteId: string, commentId: string, input: BackyCommentReportInput, context?: BackyRepositoryContext): Promise<BackyRepositoryMutationResult<Comment>>;
  /** Complete nested subtree deletion under the same admission as reply creation/movement. */
  deleteSubtree(siteId: string, commentId: string, context?: BackyRepositoryContext): Promise<Comment[]>;
  list(input: BackyCommentListInput, context?: BackyRepositoryContext): Promise<BackyListResult<Comment>>;
  getById(siteId: string, commentId: string, context?: BackyRepositoryContext): Promise<Comment | null>;
  create(input: BackyCommentCreateInput, context?: BackyRepositoryContext): Promise<BackyRepositoryMutationResult<Comment>>;
  update(siteId: string, commentId: string, input: BackyCommentUpdateInput, context?: BackyRepositoryContext): Promise<BackyRepositoryMutationResult<Comment>>;
  delete(siteId: string, commentId: string, context?: BackyRepositoryContext): Promise<boolean>;
  deleteForTarget(siteId: string, targetType: Comment['targetType'], targetId: string, context?: BackyRepositoryContext): Promise<number>;
  listBlocklist(input: BackyCommentBlocklistListInput, context?: BackyRepositoryContext): Promise<BackyListResult<CommentBlocklistEntry>>;
  blockIdentity(input: BackyCommentBlockIdentityInput, context?: BackyRepositoryContext): Promise<CommentBlocklistEntry[]>;
  deleteBlocklistEntries(siteId: string, ids: string[], context?: BackyRepositoryContext): Promise<BackyCommentBlocklistDeleteResult>;
}

export interface BackyReusableSectionRepository {
  /** One serializable source/inventory/snapshot-guarded propagation transaction. */
  applyPropagation(siteId: string, input: BackyReusableSectionPropagationInput, context?: BackyRepositoryContext, decorateWriter?: (repositories: BackyRepositories) => BackyRepositories): Promise<void>;
  /** Atomic scoped import: all writes commit or all roll back. */
  applyBatch(siteId: string, operations: BackyReusableSectionBatchMutation[], context?: BackyRepositoryContext): Promise<BackyReusableSection[]>;
  list(input: BackyReusableSectionListInput, context?: BackyRepositoryContext): Promise<BackyListResult<BackyReusableSection>>;
  getById(siteId: string, sectionId: string, context?: BackyRepositoryContext): Promise<BackyReusableSection | null>;
  getBySlug(siteId: string, slug: string, context?: BackyRepositoryContext): Promise<BackyReusableSection | null>;
  create(input: BackyReusableSectionCreateInput, context?: BackyRepositoryContext): Promise<BackyRepositoryMutationResult<BackyReusableSection>>;
  update(siteId: string, sectionId: string, input: BackyReusableSectionUpdateInput, context?: BackyRepositoryContext): Promise<BackyRepositoryMutationResult<BackyReusableSection>>;
  delete(siteId: string, sectionId: string, context?: BackyRepositoryContext): Promise<boolean>;
}

export type BackyReusableSectionPropagationTarget = {
  type: 'page' | 'post' | 'product'; id: string; collectionId?: string;
  updatedAt: string; content?: unknown; values?: unknown;
};
export type BackyReusableSectionPropagationInput = {
  source: BackyReusableSection;
  scope: { targetType: 'page' | 'post' | 'product' | 'all'; targetId?: string; includeProducts: boolean; productCollectionId?: string };
  inventory: BackyReusableSectionPropagationTarget[];
  mutations: Array<{ expected: BackyReusableSectionPropagationTarget; content?: BackyContentDocument; values?: BackyJsonObject }>;
};
export class BackyReusableSectionPropagationConflictError extends Error {
  readonly code = 'REUSABLE_SECTION_PROPAGATION_CONFLICT';
  constructor() { super('The saved source or target inventory changed. Reload the preview before refreshing instances.'); this.name = 'BackyReusableSectionPropagationConflictError'; }
}
export function assertBackyReusableSectionPropagationInventory(expected: BackyReusableSectionPropagationTarget[], current: BackyReusableSectionPropagationTarget[]): void {
  const canonical = (targets: BackyReusableSectionPropagationTarget[]) => targets.map(target => ({
    type: target.type, id: target.id, collectionId: target.collectionId,
    updatedAt: target.updatedAt, ...(target.type === 'product' ? { values: target.values } : { content: target.content }),
  })).sort((a, b) => `${a.type}:${a.id}`.localeCompare(`${b.type}:${b.id}`));
  if (serializeTemplateRevisionValue(canonical(expected)) !== serializeTemplateRevisionValue(canonical(current))) throw new BackyReusableSectionPropagationConflictError();
}

export interface BackyInteractiveComponentRepository {
  list(input: BackyInteractiveComponentListInput, context?: BackyRepositoryContext): Promise<BackyListResult<BackyInteractiveComponent>>;
  getById(siteId: string, componentId: string, context?: BackyRepositoryContext): Promise<BackyInteractiveComponent | null>;
  getByKeyVersion(siteId: string, componentKey: string, version: string, context?: BackyRepositoryContext): Promise<BackyInteractiveComponent | null>;
  create(input: BackyInteractiveComponentCreateInput, context?: BackyRepositoryContext): Promise<BackyRepositoryMutationResult<BackyInteractiveComponent>>;
  update(siteId: string, componentKey: string, version: string, input: BackyInteractiveComponentUpdateInput, context?: BackyRepositoryContext): Promise<BackyRepositoryMutationResult<BackyInteractiveComponent>>;
  rollbackVersion(siteId: string, componentKey: string, version: string, input?: { rollbackBy?: string | null; updatedBy?: string | null; changelog?: string | null }, context?: BackyRepositoryContext): Promise<BackyInteractiveComponentRollbackResult | null>;
  delete(siteId: string, componentKey: string, version: string, context?: BackyRepositoryContext): Promise<boolean>;
}

export interface BackyContentWorkflowRepository {
  listRevisions(input: BackyContentRevisionListInput, context?: BackyRepositoryContext): Promise<BackyListResult<BackyContentRevision>>;
  getRevisionById(siteId: string, targetType: BackyContentTargetType, targetId: string, revisionId: string, context?: BackyRepositoryContext): Promise<BackyContentRevision | null>;
  createRevision(input: BackyContentRevisionCreateInput, context?: BackyRepositoryContext): Promise<BackyContentRevision>;
  createPreviewToken(input: BackyPreviewTokenCreateInput, context?: BackyRepositoryContext): Promise<BackyPreviewToken>;
  validatePreviewToken(siteId: string, targetType: BackyContentTargetType, targetId: string, token: string, context?: BackyRepositoryContext): Promise<boolean>;
  deletePreviewTokensForTarget(siteId: string, targetType: BackyContentTargetType, targetId: string, context?: BackyRepositoryContext): Promise<number>;
}

export interface BackyTeamRepository {
  list(input: BackyTeamListInput, context?: BackyRepositoryContext): Promise<BackyListResult<Team>>;
  getById(teamId: string, context?: BackyRepositoryContext): Promise<Team | null>;
  getBySlug(slug: string, context?: BackyRepositoryContext): Promise<Team | null>;
  create(input: BackyTeamCreateInput, context?: BackyRepositoryContext): Promise<BackyRepositoryMutationResult<Team>>;
  update(teamId: string, input: BackyTeamUpdateInput, context?: BackyRepositoryContext): Promise<BackyRepositoryMutationResult<Team>>;
  delete(teamId: string, context?: BackyRepositoryContext): Promise<boolean>;
  listMembers(input: BackyTeamMemberListInput, context?: BackyRepositoryContext): Promise<BackyListResult<TeamMember>>;
  addMember(input: BackyTeamMemberAddInput, context?: BackyRepositoryContext): Promise<BackyRepositoryMutationResult<TeamMember>>;
  updateMember(teamId: string, memberId: string, input: BackyTeamMemberUpdateInput, context?: BackyRepositoryContext): Promise<BackyRepositoryMutationResult<TeamMember>>;
  removeMember(teamId: string, memberId: string, context?: BackyRepositoryContext): Promise<boolean>;
}

export interface BackyUserRepository {
  list(input: BackyUserListInput, context?: BackyRepositoryContext): Promise<BackyListResult<BackyUser>>;
  getById(userId: string, context?: BackyRepositoryContext): Promise<BackyUser | null>;
  getByEmail(email: string, context?: BackyRepositoryContext): Promise<BackyUser | null>;
  getPasswordCredentialByEmail(email: string, context?: BackyRepositoryContext): Promise<BackyUserPasswordCredential | null>;
  setPasswordCredential(userId: string, input: BackyUserPasswordCredentialInput, context?: BackyRepositoryContext): Promise<BackyUserPasswordCredential>;
  create(input: BackyUserCreateInput, context?: BackyRepositoryContext): Promise<BackyRepositoryMutationResult<BackyUser>>;
  update(userId: string, input: BackyUserUpdateInput, context?: BackyRepositoryContext): Promise<BackyRepositoryMutationResult<BackyUser>>;
  delete(userId: string, context?: BackyRepositoryContext): Promise<boolean>;
}

export interface BackySettingsOperatorGrantCommitInput {
  userId: string;
  /** Exact per-user records read alongside the HTTP expectedRevision check. */
  expectedRecords: BackyJsonObject[];
  record: BackyJsonObject;
}

export interface BackySettingsRepository {
  commitOperatorSiteGrant(input: BackySettingsOperatorGrantCommitInput, context?: BackyRepositoryContext): Promise<BackyRepositoryMutationResult<BackySettings>>;
  get(context?: BackyRepositoryContext): Promise<BackySettings>;
  update(input: BackySettingsUpdateInput, context?: BackyRepositoryContext): Promise<BackyRepositoryMutationResult<BackySettings>>;
}

export interface BackyAuditLogRepository {
  getById?(siteId: string, id: string): Promise<BackyAuditLogEntry | null>;
  list(input: BackyAuditLogListInput, context?: BackyRepositoryContext): Promise<BackyListResult<BackyAuditLogEntry>>;
  record(input: Omit<BackyAuditLogEntry, 'id' | 'createdAt'>, context?: BackyRepositoryContext): Promise<BackyAuditLogEntry>;
}

export interface BackyCacheInvalidationRepository {
  list(input: BackyCacheInvalidationListInput, context?: BackyRepositoryContext): Promise<BackyListResult<BackyCacheInvalidationEvent>>;
  record(input: BackyCacheInvalidationRecordInput, context?: BackyRepositoryContext): Promise<BackyCacheInvalidationEvent>;
  latestRevision(input: { siteId?: string; scope?: BackyCacheInvalidationScope }, context?: BackyRepositoryContext): Promise<string | null>;
}

export interface BackyTemplateRevisionCommitInput {
  siteId: string;
  expectedDesignFingerprint: string;
  frontendDesign: NonNullable<SiteSettings['frontendDesign']>;
  source: string;
  actorId?: string | null;
  requestId?: string | null;
  restoredFromRevisionId?: string | null;
}
/** Revision snapshots are separate from ordinary audit retention and have no update/delete API. */
export interface BackyTemplateRevisionRepository {
  /** Serializable site lock; all callback reads/writes, draft creation and design history share one commit. */
  withCompositionImportLock?<T>(siteId: string, operation: (repositories: BackyRepositories) => Promise<T>): Promise<T>;
  list(input: BackyPaginationInput & { siteId: string; templateId?: string }): Promise<BackyListResult<BackyTemplateRevision>>;
  get(siteId: string, templateId: string, revisionId: string): Promise<BackyTemplateRevision | null>;
  /** Atomically retains changed snapshots and writes frontendDesign after a locked conflict check. */
  commitDesign(input: BackyTemplateRevisionCommitInput): Promise<Site>;
}

export interface BackyRepositories {
  mailboxManagement?: import('./site-mailbox-management').BackyMailboxManagementRepository;
  commerceEntitlements?: import('./commerce-entitlements').BackyCommerceEntitlementRepository;
  mediaUploadSessions?: import('./media-upload-session').BackyMediaUploadSessionRepository;
  mailboxSends?: import('./site-mailbox').BackyMailboxSendRepository;
  newsletterCampaigns?: import('./newsletter-campaign').NewsletterCampaignRepository;
  /** Same-connection atomic content/revision/media claims under site media admission.
   * Unsupported adapters must refuse before invoking the callback. */
  withMediaReferenceMutation?<T>(siteId: string, operation: (repositories: BackyRepositories) => Promise<T>): Promise<T>;
  formDeliveries?: import('./form-delivery').BackyFormDeliveryRepository;
  commentDeliveries?: import('./comment-delivery').BackyCommentDeliveryRepository;
  siteBackups?: import('./site-backup').BackySiteBackupRepository;
  siteDuplication?: import('./site-duplication').BackySiteDuplicationRepository;
  /** Present only in the persisted database runtime; visitor auth fails closed elsewhere. */
  visitorAccounts?: BackyVisitorAccountRepository;
  teams: BackyTeamRepository;
  sites: BackySiteRepository;
  pages: BackyPageRepository;
  posts: BackyPostRepository;
  blogTaxonomy: BackyBlogTaxonomyRepository;
  collections: BackyCollectionRepository;
  media: BackyMediaRepository;
  forms: BackyFormRepository;
  comments: BackyCommentRepository;
  reusableSections: BackyReusableSectionRepository;
  interactiveComponents: BackyInteractiveComponentRepository;
  contentWorkflows: BackyContentWorkflowRepository;
  templateRevisions: BackyTemplateRevisionRepository;
  users: BackyUserRepository;
  settings: BackySettingsRepository;
  auditLogs: BackyAuditLogRepository;
  cacheInvalidations: BackyCacheInvalidationRepository;
}
