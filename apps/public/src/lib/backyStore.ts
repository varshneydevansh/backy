import { findPageByHierarchyPath } from './pageHierarchy';
import { mediaMatchesLinkedFilters } from '@backy-cms/core';
import { snapshotCollectionTemplateDesign, assertCollectionDesignOnlyUpdate, type BackyCollectionDesignRevision } from '@backy-cms/core';
import { assertBackyCollectionExpectation } from './collectionDefinitionVersion';
import { snapshotFormTemplateDesign, assertFormDesignOnlyUpdate, type BackyFormUpdateInput, type BackyFormDesignRevision } from '@backy-cms/core';
import { assertFormDefinitionExpectation } from './formDefinitionVersion';
import { snapshotProductTemplateDesign } from "@backy-cms/core";
import { assertNoDemoFormDeliveryEvidence } from './demoFormDeliveryJournal';
import { assertNoDemoCommentDeliveryEvidence } from './demoCommentDeliveryJournal';
import { assertSiteCreationQuota, prepareSiteDuplication, SiteCreationAdmissionError, SITE_DUPLICATION_SCOPE, type SiteDuplicationInput, type SiteDuplicationResult } from '@backy-cms/core';
import { persistDemoSiteDuplication } from './demoSiteDuplicationPersistence';
import { BackyFormDeliveryError, BackyCommentDeliveryError, collectBackyCommentSubtree, assertBackyCommentParent, BackyCommentLifecycleError, BACKY_COMMENT_INVENTORY_LIMIT } from '@backy-cms/core';
import { collectionRecordUniqueIssues, BackyCollectionRecordValidationError, serializeBackyCollectionRecordVersion, assertBackyCollectionRecordUpdateExpectation, assertBackyCollectionImportExpectation, BackyCollectionImportConflictError, type BackyCollectionImportOperation, type BackyCollectionImportResult, assertBackyReusableSectionExpectation, BackyReusableSectionConflictError, commitBackyOperatorSiteGrantAuth, preserveBackyOperatorSiteGrants, assertBackyContentUpdateExpectation, isContentPublished, changedTemplateRevisionSnapshots, serializeTemplateRevisionValue } from '@backy-cms/core';
import type { BackyReusableSectionBatchMutation, BackyReusableSectionPropagationInput, BackyReusableSectionPropagationTarget, BackySettingsOperatorGrantCommitInput, BackyTemplateRevision, BackyTemplateRevisionCommitInput } from '@backy-cms/core';
import { assertBackyReusableSectionPropagationInventory, BackyReusableSectionPropagationConflictError } from '@backy-cms/core';
import {
  DEFAULT_SITE_SETTINGS,
  DEFAULT_THEME,
  canvasContentPayloadToBackyContentDocument,
  isBackyContentDocument,
  normalizeBackyJsonObject,
  synchronizeBackyElementParentScopes,
  type BackyContentDocument,
  type BackyCanvasSize,
} from "@backy-cms/core";
import { createHash, randomUUID } from "node:crypto";
import { assertSiteBackupGraph, SITE_BACKUP_TABLES, SiteBackupError, type SiteBackupGraph, type SiteBackupRow } from '@backy-cms/core';
import { assertNoPendingDemoSiteBackupJobs, commitDemoSiteBackupFiles, recoverDemoSiteBackupCommit } from './demoSiteBackupPersistence';
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync, renameSync, unlinkSync, openSync, closeSync, fsyncSync } from "node:fs";
import { dirname, join } from "node:path";
import type {
  BackyAuditLogEntry,
  BackyAuditLogListInput,
  BackyJsonObject,
  BackyListResult,
  BackyRepositoryEntity,
  Comment,
  CommentTargetType,
  FormFieldDefinition,
  FormDefinition,
  FormSubmission,
  MediaFolder,
  MediaItem,
  Contact,
  CommentReportReason,
  CommentStatus,
  SiteCommentPolicy,
  SiteSettings,
  SiteWebhookEventKind,
} from "@backy-cms/core";
import {
  defaultCollectionListRoutePattern,
  defaultCollectionRoutePattern,
  normalizeCollectionListRoutePattern,
  normalizeCollectionRoutePattern,
} from "./collectionRoutes";
import {
  buildSiteNavigation,
  normalizeNavigationConfig,
  type PublicNavigationItem,
} from "./navigation";
import { normalizeRedirectRules } from "./redirectRules";
import {
  emptyFrontendDesignContract,
  normalizeFrontendDesignContract,
} from "./frontendDesignContract";
import { mediaMatchesScopeFilters } from "./mediaScope";
import { normalizeSiteLocalization } from "./siteLocalization";

interface PageMeta {
  title?: string;
  description?: string | null;
  keywords?: string[];
  ogImage?: string | null;
  canonical?: string | null;
  jsonLd?: Array<Record<string, unknown>>;
  template?: string | null;
  templateSource?: string | null;
  templateSourceLabel?: string | null;
  backyCanvasTemplateId?: string | null;
  noIndex?: boolean;
  noFollow?: boolean;
  parentPageId?: string | null;
  parentPageTitle?: string | null;
  frontendDesignTemplateId?: string | null;
  frontendDesignTemplateName?: string | null;
  frontendDesignSource?: Record<string, unknown> | null;
  frontendDesignRoutePattern?: string | null;
  frontendDesignTokens?: Record<string, unknown> | null;
  frontendDesignChrome?: Record<string, unknown> | null;
  frontendDesignCustomCss?: string | null;
  frontendDesignCustomJs?: string | null;
  frontendDesignContentDocument?: Record<string, unknown> | null;
  frontendDesignElements?: unknown[];
  frontendDesignCanvasSize?: Record<string, unknown> | null;
  frontendDesignThemeTokenRefs?: Record<string, unknown> | null;
  frontendDesignAssets?: unknown[] | Record<string, unknown>;
  frontendDesignAnimations?: unknown[] | Record<string, unknown>;
  frontendDesignInteractions?: unknown[] | Record<string, unknown>;
  frontendDesignDataBindings?: Record<string, unknown> | null;
  frontendDesignEditableMap?: Record<string, unknown> | null;
  frontendDesignSeo?: Record<string, unknown> | null;
  frontendDesignMetadata?: Record<string, unknown> | null;
  frontendDesignBindingHints?: Array<Record<string, unknown>>;
  collectionDataset?: Record<string, unknown> | null;
}

type SiteVercelDeploymentRun = NonNullable<
  NonNullable<SiteSettings["vercelDeployment"]>["history"]
>[number];
type SiteBillingQuotaEvent = NonNullable<
  NonNullable<SiteSettings["billingQuota"]>["history"]
>[number];

interface CanvasElement {
  id: string;
  type: string;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation?: number;
  zIndex?: number;
  visible?: boolean;
  locked?: boolean;
  props: Record<string, unknown>;
  styles?: React.CSSProperties;
  children?: CanvasElement[];
  animation?: {
    type: string;
    duration: number;
    delay?: number;
    easing?: string;
    direction?: "left" | "right" | "up" | "down";
    trigger?: "load" | "scroll" | "hover";
  };
}

interface PageContent {
  elements: CanvasElement[];
  canvasSize: BackyCanvasSize;
  customCSS?: string;
  customJS?: string;
  contentDocument?: BackyContentDocument | Record<string, unknown>;
  themeTokenRefs?: Record<string, string>;
  assets?: unknown[] | Record<string, unknown>;
  animations?: unknown[] | Record<string, unknown>;
  interactions?: unknown[] | Record<string, unknown>;
  dataBindings?: Record<string, unknown>;
  editableMap?: Record<string, unknown>;
  seo?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
}

const contentDocumentFromCanvasPayload = (
  rawContent: unknown,
  input: {
    id: string;
    kind: "page" | "post";
    title: string;
    slug: string;
    status: "draft" | "published" | "scheduled" | "archived";
    fallbackDocument?: BackyContentDocument;
  },
): BackyContentDocument =>
  canvasContentPayloadToBackyContentDocument({
    id: input.id,
    kind: input.kind,
    title: input.title,
    slug: input.slug,
    status: input.status,
    rawContent,
    fallbackDocument: input.fallbackDocument,
  });

const designStateValueFromContent = <T = unknown>(
  contentInput: Record<string, unknown>,
  contentDocument: BackyContentDocument,
  existing: PageContent | undefined,
  key: keyof PageContent,
): T | undefined => {
  const metadata = toRecord(contentDocument.metadata);
  const sourceValue =
    contentInput[key] !== undefined
      ? contentInput[key]
      : (contentDocument as unknown as Record<string, unknown>)[key] ??
        metadata[key as string] ??
        existing?.[key];

  return Array.isArray(sourceValue) || isObjectRecord(sourceValue)
    ? (clone(sourceValue) as T)
    : undefined;
};

const pageContentFromCanvasInput = (
  rawContent: unknown,
  input: {
    id: string;
    kind: "page" | "post";
    title: string;
    slug: string;
    status: "draft" | "published" | "scheduled" | "archived";
    existing?: PageContent;
  },
): PageContent => {
  const contentInput = toRecord(rawContent);
  const canvasSizeInput = toRecord(contentInput.canvasSize);
  const fallbackDocument = input.existing
    ? contentDocumentFromCanvasPayload(input.existing, input)
    : undefined;
  const normalizedDocument = contentDocumentFromCanvasPayload(rawContent, {
    id: input.id,
    kind: input.kind,
    title: input.title,
    slug: input.slug,
    status: input.status,
    fallbackDocument,
  });
  // Validate via the canonical converter before cloning raw legacy fields.
  // Concrete nesting is authoritative on a full canvas, including outdented roots.
  const contentDocument = {
    ...normalizedDocument,
    elements: synchronizeBackyElementParentScopes(normalizedDocument.elements, { completeTree: true }),
  };
  const legacyElements = Array.isArray(contentInput.elements)
    ? clone(contentInput.elements as CanvasElement[])
    : Array.isArray(rawContent)
      ? clone(rawContent as CanvasElement[])
      : input.existing?.elements
        ? clone(input.existing.elements)
        : [];
  const existingCanvasSize = input.existing?.canvasSize || {
    width: 1200,
    height: 900,
  };
  const mergedCanvasSize = { ...existingCanvasSize, ...toRecord(contentDocument.metadata?.canvasSize), ...canvasSizeInput };
  const canvasSize: BackyCanvasSize = {
    ...clone(mergedCanvasSize),
    width: Number(mergedCanvasSize.width) || 1200,
    height: Number(mergedCanvasSize.height) || 900,
  };

  return {
    // The shared converter safely normalizes unknown JSON extensions. Keep
    // them on the legacy wrapper too, so save/reopen does not silently change
    // the shape consumed by registered frontend adapters.
    ...Object.fromEntries(Object.entries(contentDocument).filter(([key]) =>
      !["schemaVersion", "id", "kind", "title", "slug", "locale", "status", "version",
        "elements", "themeTokenRefs", "assets", "interactions", "seo", "dataBindings",
        "editableMap", "metadata", "canvasSize", "customCSS", "customJS", "animations"].includes(key))),
    elements: synchronizeBackyElementParentScopes(legacyElements, { completeTree: true }),
    canvasSize,
    customCSS:
      contentInput.customCSS === undefined
        ? (contentDocument.metadata?.customCSS as string | undefined) ||
          input.existing?.customCSS
        : sanitizeString(contentInput.customCSS),
    customJS:
      contentInput.customJS === undefined
        ? (contentDocument.metadata?.customJS as string | undefined) ||
          input.existing?.customJS
        : sanitizeString(contentInput.customJS),
    contentDocument: { ...contentDocument, metadata: { ...contentDocument.metadata, canvasSize } },
    themeTokenRefs: designStateValueFromContent<Record<string, string>>(
      contentInput,
      contentDocument,
      input.existing,
      "themeTokenRefs",
    ),
    assets: designStateValueFromContent<unknown[] | Record<string, unknown>>(
      contentInput,
      contentDocument,
      input.existing,
      "assets",
    ),
    animations: designStateValueFromContent<unknown[] | Record<string, unknown>>(
      contentInput,
      contentDocument,
      input.existing,
      "animations",
    ),
    interactions: designStateValueFromContent<
      unknown[] | Record<string, unknown>
    >(contentInput, contentDocument, input.existing, "interactions"),
    dataBindings: designStateValueFromContent<Record<string, unknown>>(
      contentInput,
      contentDocument,
      input.existing,
      "dataBindings",
    ),
    editableMap: designStateValueFromContent<Record<string, unknown>>(
      contentInput,
      contentDocument,
      input.existing,
      "editableMap",
    ),
    seo: designStateValueFromContent<Record<string, unknown>>(
      contentInput,
      contentDocument,
      input.existing,
      "seo",
    ),
    metadata: designStateValueFromContent<Record<string, unknown>>(
      contentInput,
      contentDocument,
      input.existing,
      "metadata",
    ),
  };
};

interface StoreSite {
  id: string;
  teamId?: string | null;
  name: string;
  slug: string;
  description: string;
  customDomain: string | null;
  status: "draft" | "published" | "scheduled" | "archived";
  isPublished: boolean;
  settings?: SiteSettings;
  theme: {
    colors: Record<string, string>;
    fonts: {
      heading?: string;
      body?: string;
      mono?: string;
      custom?: Array<{ name: string; url: string }>;
    };
    spacing?: {
      unit?: number;
      scale?: number;
    };
    customCSS: string;
  };
}

interface StorePage {
  id: string;
  siteId: string;
  title: string;
  slug: string;
  description: string | null;
  status: "draft" | "published" | "scheduled" | "archived";
  isHomepage: boolean;
  parentId?: string | null;
  sortOrder?: number;
  content: PageContent;
  meta: PageMeta;
  forms?: string[];
  createdAt: string;
  updatedAt: string;
  publishedAt: string | null;
  scheduledAt: string | null;
}

type SiteNavigationItem = PublicNavigationItem;

interface StoreBlogPost {
  id: string;
  siteId: string;
  title: string;
  slug: string;
  excerpt: string | null;
  content: Record<string, unknown>;
  status: "draft" | "published" | "scheduled" | "archived";
  featuredImageId: string | null;
  authorId: string | null;
  meta: PageMeta;
  categoryIds: string[];
  tagIds: string[];
  createdAt: string;
  updatedAt: string;
  publishedAt: string | null;
  scheduledAt: string | null;
}

interface StoreBlogCategory {
  id: string;
  siteId: string;
  name: string;
  slug: string;
  description: string | null;
  color: string | null;
  createdAt: string;
  updatedAt: string;
  postCount?: number;
}

interface StoreBlogTag {
  id: string;
  siteId: string;
  name: string;
  slug: string;
  description: string | null;
  createdAt: string;
  updatedAt: string;
  postCount?: number;
}

interface ContentRevision {
  id: string;
  siteId: string;
  targetType: "page" | "post";
  targetId: string;
  snapshot: StorePage | StoreBlogPost;
  note: string | null;
  parentRevisionId?: string | null;
  operation?: string | null;
  restoreTargetRevisionId?: string | null;
  metadata?: Record<string, unknown>;
  createdBy: string | null;
  createdAt: string;
}

interface PreviewToken {
  token: string;
  siteId: string;
  targetType: "page" | "post";
  targetId: string;
  createdAt: string;
  expiresAt: string;
  createdBy: string | null;
}

interface StoreUser {
  id: string;
  fullName: string;
  email: string;
  role: "owner" | "admin" | "editor" | "viewer";
  status: "active" | "inactive" | "invited" | "suspended";
  createdAt: string;
  updatedAt: string;
  lastActiveAt: string | null;
  invitedAt: string | null;
}

interface StoreUserPermissionOverride {
  userId: string;
  permissionKey: string;
  value: "allow" | "deny";
  updatedAt: string;
}

export interface StoreTeam {
  id: string;
  name: string;
  slug: string;
  ownerId: string | null;
  settings: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface StoreTeamMember {
  id: string;
  teamId: string;
  userId: string;
  role: StoreUser["role"];
  joinedAt: string;
}

interface StoreBlogAuthor {
  id: string;
  siteId: string;
  name: string;
  slug: string;
  role: StoreUser["role"] | "contributor";
  status: StoreUser["status"] | "external";
  postCount: number;
}

interface StoreSettings {
  deliveryMode: "managed-hosting" | "custom-frontend";
  apiKeys: {
    publicApiKey: string;
    adminApiKey: string;
  };
  auth?: BackyJsonObject;
  integrations?: BackyJsonObject;
  updatedAt: string;
}

interface ApiKeyRotationHistoryEntry {
  id: string;
  scope: "all" | "public" | "admin";
  rotatedAt: string;
  actorId: string | null;
  requestId: string | null;
  publicKeyChanged: boolean;
  adminKeyChanged: boolean;
  previousPublicKeyFingerprint?: string | null;
  newPublicKeyFingerprint?: string | null;
  previousAdminKeyFingerprint?: string | null;
  newAdminKeyFingerprint?: string | null;
}

interface ApiKeyRevocationHistoryEntry {
  id: string;
  scope: "all" | "public" | "admin";
  keyType: "public" | "admin";
  revokedAt: string;
  actorId: string | null;
  requestId: string | null;
  reason: "rotated" | "replaced" | "manual";
  revokedKeyFingerprint: string | null;
  replacementKeyFingerprint: string | null;
}

type CollectionFieldType =
  | "text"
  | "richText"
  | "number"
  | "boolean"
  | "date"
  | "datetime"
  | "image"
  | "video"
  | "file"
  | "reference"
  | "multiReference"
  | "select"
  | "tags"
  | "url"
  | "email"
  | "phone"
  | "slug"
  | "json";

interface StoreCollectionField {
  id: string;
  key: string;
  label: string;
  type: CollectionFieldType;
  required: boolean;
  unique: boolean;
  sortOrder: number;
  helpText: string | null;
  options?: string[];
  referenceCollectionId?: string | null;
  defaultValue?: unknown;
  validation?: BackyJsonObject;
}

interface StoreCollectionPermissions {
  publicRead: boolean;
  publicCreate: boolean;
  publicUpdate: boolean;
  publicDelete: boolean;
}

interface StoreCollection {
  id: string;
  siteId: string;
  name: string;
  slug: string;
  routePattern?: string | null;
  listRoutePattern?: string | null;
  description: string | null;
  status: "draft" | "published" | "archived";
  fields: StoreCollectionField[];
  permissions: StoreCollectionPermissions;
  metadata?: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

interface StoreCollectionRecord {
  id: string;
  siteId: string;
  collectionId: string;
  slug: string;
  status: "draft" | "published" | "scheduled" | "archived";
  values: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
  publishedAt: string | null;
  scheduledAt: string | null;
}

interface StoreReusableSection {
  id: string;
  siteId: string;
  name: string;
  slug: string;
  description: string | null;
  category: string;
  status: "active" | "archived";
  tags: string[];
  content: PageContent;
  metadata?: Record<string, unknown>;
  sourceElementId: string | null;
  createdBy: string | null;
  updatedBy: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface StoreInteractiveComponent {
  id: string;
  siteId: string;
  componentKey: string;
  displayName: string;
  type: "interactiveFigure" | "codeComponent";
  status: "active" | "disabled" | "archived";
  reviewStatus: "draft" | "in_review" | "approved" | "rejected";
  version: string;
  renderMode: "trusted-component" | "sandbox-iframe" | "static-fallback";
  source: "registry" | "custom";
  description: string;
  allowedDataScopes: string[];
  requiredFields: string[];
  controls: Array<Record<string, unknown>>;
  fallback: {
    required: boolean;
    supported: string[];
  };
  security: Record<string, boolean | string>;
  integrity: {
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
  };
  runtime?: {
    sandboxUrl?: string | null;
    bundleUrl?: string | null;
    iframeSandbox?: string;
    allowedPermissions?: string[];
    postMessageProtocol: string;
  };
  ownerId: string | null;
  dependencyMetadata: Record<string, unknown>;
  changelog: string | null;
  rollbackFromVersion: string | null;
  createdBy: string | null;
  updatedBy: string | null;
  reviewedBy: string | null;
  reviewedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

interface Pagination {
  total: number;
  limit: number;
  offset: number;
  hasMore: boolean;
}

interface SubmissionValidationDetail {
  field: string;
  code: string;
  message: string;
  label?: string;
}

interface SpamCheckResult {
  status: FormSubmission["status"];
  flags: string[];
  errors?: string;
}

interface ContactShareOverride {
  enabled?: boolean;
  nameField?: string;
  emailField?: string;
  phoneField?: string;
  notesField?: string;
  dedupeByEmail?: boolean;
}

interface SubmissionRateState {
  total: number;
  lastSubmissionAt: number | null;
}

interface CommentSpamResult {
  ok: boolean;
  status: "pending" | "approved" | "rejected" | "spam" | "blocked";
  flags: string[];
  errors?: string;
}

export interface CommentBlocklistEntry {
  id: string;
  siteId: string;
  type: "email" | "ip";
  value: string;
  reason: string;
  actor?: string;
  requestId?: string;
  createdAt: string;
}

const normalizeCommentPolicy = (
  value: unknown,
  current?: SiteCommentPolicy,
): SiteCommentPolicy => {
  const input = toRecord(value);
  const base = current || createDefaultSiteSettings().commentPolicy || {};
  const blockedTerms = Array.isArray(input.blockedTerms)
    ? input.blockedTerms.map(sanitizeString).filter(Boolean).slice(0, 100)
    : base.blockedTerms || [];
  const moderationMode = sanitizeString(input.moderationMode);
  const sort = sanitizeString(input.sort);

  return {
    enabled:
      input.enabled === undefined
        ? base.enabled !== false
        : parseBooleanInput(input.enabled, true),
    moderationMode:
      moderationMode === "auto-approve"
        ? "auto-approve"
        : moderationMode === "manual"
          ? "manual"
          : base.moderationMode || "manual",
    allowGuests:
      input.allowGuests === undefined
        ? base.allowGuests !== false
        : parseBooleanInput(input.allowGuests, true),
    requireName:
      input.requireName === undefined
        ? base.requireName !== false
        : parseBooleanInput(input.requireName, true),
    requireEmail:
      input.requireEmail === undefined
        ? base.requireEmail === true
        : parseBooleanInput(input.requireEmail, false),
    allowReplies:
      input.allowReplies === undefined
        ? base.allowReplies !== false
        : parseBooleanInput(input.allowReplies, true),
    enableReports:
      input.enableReports === undefined
        ? base.enableReports !== false
        : parseBooleanInput(input.enableReports, true),
    enableCaptcha:
      input.enableCaptcha === undefined
        ? base.enableCaptcha === true
        : parseBooleanInput(input.enableCaptcha, false),
    captchaProvider: ["turnstile", "hcaptcha", "recaptcha", "mock"].includes(
      sanitizeString(input.captchaProvider),
    )
      ? (sanitizeString(
          input.captchaProvider,
        ) as SiteCommentPolicy["captchaProvider"])
      : base.captchaProvider || "mock",
    captchaSiteKey:
      input.captchaSiteKey === undefined
        ? base.captchaSiteKey || ""
        : sanitizeString(input.captchaSiteKey),
    blockedTerms,
    closedMessage:
      input.closedMessage === undefined
        ? base.closedMessage || "Comments are closed for this site."
        : sanitizeString(input.closedMessage) ||
          "Comments are closed for this site.",
    sort:
      sort === "oldest"
        ? "oldest"
        : sort === "newest"
          ? "newest"
          : base.sort || "newest",
  };
};

const AUDIT_EVENT_STATUSES = [
  "queued",
  "succeeded",
  "failed",
  "received",
] as const;
type AuditEventStatus = (typeof AUDIT_EVENT_STATUSES)[number];
const SITE_WEBHOOK_EVENT_KINDS: SiteWebhookEventKind[] = [
  "site-created",
  "site-updated",
  "site-deleted",
  "form-submission",
  "contact-shared",
  "contact-sync",
  "contact-status",
  "commerce-order",
  "commerce-product",
  "commerce-webhook",
  "comment-submitted",
  "comment-status",
  "comment-reported",
  "interactive-runtime",
];
type WebhookEventKind = SiteWebhookEventKind;

interface AuditEvent {
  id: string;
  siteId: string;
  kind: WebhookEventKind;
  formId: string | null;
  commentId: string | null;
  contactId: string | null;
  submissionId: string | null;
  target: string;
  status: AuditEventStatus;
  statusCode?: number;
  requestId?: string;
  reason?: string;
  actor?: string;
  metadata: Record<string, unknown>;
  createdAt: string;
  error?: string;
}

const COMMENT_REPORT_REASONS: CommentReportReason[] = [
  "spam",
  "harassment",
  "abuse",
  "hate-speech",
  "off-topic",
  "copyright",
  "privacy",
  "other",
];

const DEFAULT_COMMENT_FILTER_STATUS: CommentStatus | "all" = "pending";

const nowIso = new Date().toISOString();

const seedTheme = {
  ...DEFAULT_THEME,
  customCSS: "",
  colors: {
    ...DEFAULT_THEME.colors,
    background: "#f5f7fb",
    surface: "#ffffff",
    text: "#1e293b",
    textMuted: "#64748b",
  },
};

const customFrontendTemplateSource = (input: {
  publicHost: string;
  sourceLabel: string;
  now: string;
}) => ({
  type: "custom-frontend",
  label: input.sourceLabel,
  url: `https://${input.publicHost}`,
  branch: "main",
  publicHost: input.publicHost,
  backyPublicApiBaseUrl: "http://127.0.0.1:3001/api",
  capturedAt: input.now,
});

const customFrontendTemplateContent = (
  input: {
    templateId: string;
    templateName: string;
    routePattern: string;
    bindings: Array<Record<string, unknown> & { field: string; role: string; binding: string; targetPath: string }>;
    source: Record<string, unknown>;
    now: string;
  },
) => ({
  canvasSize: { width: 1200, height: 900 },
  dataBindings: {
    source: "backy-render",
    mode: "current-route",
    bindings: input.bindings,
  },
  editableMap: Object.fromEntries(
    input.bindings.map((binding) => [
      `${input.templateId}.${binding.field}`,
      {
        role: binding.role,
        binding: binding.binding,
        field: binding.field,
        targetPath: binding.targetPath,
        fields: Array.isArray(binding.fields) ? binding.fields : [binding.field],
        editable: true,
        valueType: typeof binding.valueType === "string" ? binding.valueType : "string",
        scope: typeof binding.scope === "string" ? binding.scope : "template",
        label: typeof binding.label === "string" ? binding.label : binding.field,
      },
    ]),
  ),
  metadata: {
    templateSource: "custom-frontend",
    frontendDesignTemplateId: input.templateId,
    frontendDesignTemplateName: input.templateName,
    frontendDesignRoutePattern: input.routePattern,
    frontendDesignSource: input.source,
    frontendDesignCapturedAt: input.now,
    createThroughBackyCanvas: true,
  },
});

const buildDemoCustomFrontendDesignContract = (
  input: {
    siteName: string;
    publicHost: string;
    theme: typeof seedTheme;
    now: string;
  },
): NonNullable<SiteSettings["frontendDesign"]> => {
  const source = customFrontendTemplateSource({
    publicHost: input.publicHost,
    sourceLabel: `${input.siteName} demo custom frontend`,
    now: input.now,
  });
  const makeTemplate = (
    template: {
      id: string;
      type: NonNullable<SiteSettings["frontendDesign"]>["templates"][number]["type"];
      name: string;
      routePattern: string;
      description: string;
      bindings: Array<Record<string, unknown> & { field: string; role: string; binding: string; targetPath: string }>;
      content?: Record<string, unknown>;
    },
  ) => ({
    id: template.id,
    type: template.type,
    name: template.name,
    status: "active",
    version: 1,
    createdAt: input.now,
    updatedAt: input.now,
    routePattern: template.routePattern,
    description: template.description,
    canvasSize: { width: 1200, height: 900 },
    content: {
      ...customFrontendTemplateContent({
        templateId: template.id,
        templateName: template.name,
        routePattern: template.routePattern,
        bindings: template.bindings,
        source,
        now: input.now,
      }),
      ...(template.content || {}),
    },
    bindingHints: template.bindings,
  });
  const pageBindings = [
    { role: "page.title", binding: "page.title", field: "title", targetPath: "props.content", fields: ["title"], label: "Page title" },
    { role: "page.description", binding: "page.description", field: "description", targetPath: "props.content", fields: ["description"], label: "Page summary" },
    { role: "page.body", binding: "page.content", field: "content", targetPath: "children", fields: ["content", "elements", "sections"], valueType: "json", label: "Page content sections" },
  ];
  const blogBindings = [
    { role: "post.title", binding: "post.title", field: "title", targetPath: "props.content", fields: ["title"], label: "Post title" },
    { role: "post.excerpt", binding: "post.excerpt", field: "excerpt", targetPath: "props.content", fields: ["excerpt"], label: "Post excerpt" },
    { role: "post.body", binding: "post.content", field: "content", targetPath: "children", fields: ["content", "blocks", "elements"], valueType: "json", label: "Post body" },
    { role: "post.coverImage", binding: "post.coverImage", field: "coverImage", targetPath: "props.mediaId", fields: ["featuredImageId", "coverImage"], valueType: "image", label: "Post cover image" },
  ];
  const sectionBindings = [
    { role: "section.heading", binding: "section.heading", field: "heading", targetPath: "props.content", fields: ["heading", "title"], label: "Section heading" },
    { role: "section.body", binding: "section.content", field: "content", targetPath: "children", fields: ["content", "elements"], valueType: "json", label: "Section body" },
  ];
  const formBindings = [
    { role: "form.title", binding: "form.title", field: "title", targetPath: "props.formTitle", fields: ["title", "name"], label: "Form title" },
    { role: "form.fields", binding: "form.fields", field: "fields", targetPath: "props.fields", fields: ["fields"], valueType: "json", label: "Form fields" },
  ];
  const productBindings = [
    { role: "product.title", binding: "product.title", field: "title", targetPath: "props.content", fields: ["title", "name"], label: "Product title" },
    { role: "product.price", binding: "product.price", field: "price", targetPath: "props.content", fields: ["price", "currency"], label: "Product price" },
    { role: "product.media", binding: "product.media", field: "media", targetPath: "props.mediaIds", fields: ["media", "image", "gallery"], valueType: "image", label: "Product media" },
  ];
  const collectionBindings = [
    { role: "collection.title", binding: "collection.name", field: "name", targetPath: "props.content", fields: ["name", "title"], label: "Collection name" },
    { role: "collection.records", binding: "collection.records", field: "records", targetPath: "children", fields: ["records", "items"], valueType: "json", label: "Collection records" },
  ];

  return normalizeFrontendDesignContract({
    schemaVersion: "backy.frontend-design.v1",
    status: "synced",
    source,
    tokens: {
      colors: input.theme.colors,
      fonts: input.theme.fonts,
      customCss: input.theme.customCSS,
    },
    chrome: {
      navigation: {
        source: "backy-render-navigation",
        publicHost: input.publicHost,
      },
    },
    templates: [
      makeTemplate({
        id: "custom-frontend-page",
        type: "page",
        name: `${input.siteName} page`,
        routePattern: "/:pageSlug",
        description: "Demo custom frontend page shell for new Backy pages.",
        bindings: pageBindings,
      }),
      makeTemplate({
        id: "custom-frontend-blog-post",
        type: "blogPost",
        name: `${input.siteName} blog post`,
        routePattern: "/blog/:postSlug",
        description: "Demo custom frontend article shell for posts, newsletters, and long-form reports.",
        bindings: blogBindings,
      }),
      makeTemplate({
        id: "custom-frontend-section",
        type: "section",
        name: `${input.siteName} reusable section`,
        routePattern: "section:*",
        description: "Demo reusable custom frontend section shell.",
        bindings: sectionBindings,
        content: {
          section: customFrontendTemplateContent({
            templateId: "custom-frontend-section",
            templateName: `${input.siteName} reusable section`,
            routePattern: "section:*",
            bindings: sectionBindings,
            source,
            now: input.now,
          }),
        },
      }),
      makeTemplate({
        id: "custom-frontend-form",
        type: "form",
        name: `${input.siteName} form`,
        routePattern: "/forms/:formSlug",
        description: "Demo custom frontend form shell for public submissions and consent fields.",
        bindings: formBindings,
        content: {
          fields: [
            { name: "email", key: "email", label: "Email", type: "email", required: true },
            { name: "message", key: "message", label: "Message", type: "textarea", required: false },
          ],
        },
      }),
      makeTemplate({
        id: "custom-frontend-product",
        type: "product",
        name: `${input.siteName} product`,
        routePattern: "/products/:productSlug",
        description: "Demo custom frontend product shell for commerce records.",
        bindings: productBindings,
        content: {
          values: {
            design: customFrontendTemplateContent({
              templateId: "custom-frontend-product",
              templateName: `${input.siteName} product`,
              routePattern: "/products/:productSlug",
              bindings: productBindings,
              source,
              now: input.now,
            }),
          },
        },
      }),
      makeTemplate({
        id: "custom-frontend-collection",
        type: "collection",
        name: `${input.siteName} collection`,
        routePattern: "/collections/:collectionSlug",
        description: "Demo custom frontend collection shell for structured records and repeaters.",
        bindings: collectionBindings,
      }),
    ],
    editableMap: [
      { role: "site.header", binding: "site.navigation.primary", fields: ["label", "href", "children"] },
      { role: "site.footer", binding: "site.navigation.footer", fields: ["label", "href", "children"] },
      { role: "site.tokens", binding: "site.theme", fields: ["colors", "fonts", "spacing", "customCss"] },
      { role: "site.domain", binding: "site.delivery", fields: ["customDomain", "domainAliases"] },
    ],
    notes: "Demo custom frontend design contract used by local smokes so pages, posts, forms, products, collections, and reusable sections can inherit a reusable template registry.",
  }, { updatedAt: input.now });
};

const customFrontendLabel = (
  frontendDesign: NonNullable<SiteSettings["frontendDesign"]>,
): string => {
  const label = frontendDesign.source?.label?.replace(/\s+custom\s+frontend$/iu, "").trim();
  return label || "Custom frontend";
};

const customFrontendPublicHost = (
  frontendDesign: NonNullable<SiteSettings["frontendDesign"]>,
): string => {
  if (frontendDesign.source?.url) {
    try {
      return new URL(frontendDesign.source.url).host || "custom-frontend.local";
    } catch {
      return frontendDesign.source.url
        .replace(/^https?:\/\//u, "")
        .replace(/\/.*$/u, "")
        .trim() || "custom-frontend.local";
    }
  }
  return "custom-frontend.local";
};

const completeCustomFrontendTemplateRegistry = (
  frontendDesign: NonNullable<SiteSettings["frontendDesign"]>,
): NonNullable<SiteSettings["frontendDesign"]> => {
  if (
    frontendDesign.status !== "synced" ||
    frontendDesign.source?.type !== "custom-frontend"
  ) {
    return frontendDesign;
  }

  const templateTypes = new Set(frontendDesign.templates.map((template) => template.type));
  const requiredTypes: Array<NonNullable<SiteSettings["frontendDesign"]>["templates"][number]["type"]> = [
    "page",
    "blogPost",
    "section",
    "form",
    "product",
    "collection",
  ];
  if (requiredTypes.every((type) => templateTypes.has(type))) {
    return frontendDesign;
  }

  const now = new Date().toISOString();
  const label = customFrontendLabel(frontendDesign);
  const completed = buildDemoCustomFrontendDesignContract({
    siteName: label,
    publicHost: customFrontendPublicHost(frontendDesign),
    theme: seedTheme,
    now,
  });
  const missingTemplates = completed.templates.filter((template) => !templateTypes.has(template.type));

  return normalizeFrontendDesignContract({
    ...frontendDesign,
    templates: [...frontendDesign.templates, ...missingTemplates],
    editableMap: frontendDesign.editableMap.length > 0
      ? frontendDesign.editableMap
      : completed.editableMap,
    notes: frontendDesign.notes ||
      "Backy completed the custom frontend template registry with safe generated defaults so every content surface can inherit the connected design.",
  }, { updatedAt: now });
};

const completeStoreSiteFrontendDesign = (site: StoreSite): StoreSite => {
  if (!site.settings?.frontendDesign) {
    return site;
  }

  const frontendDesign = completeCustomFrontendTemplateRegistry(
    site.settings.frontendDesign,
  );

  if (frontendDesign === site.settings.frontendDesign) {
    return site;
  }

  return {
    ...site,
    settings: {
      ...site.settings,
      frontendDesign,
    },
  };
};

const createDefaultSiteSettings = (
  frontendDesign?: SiteSettings["frontendDesign"],
): SiteSettings => ({
  seo: { ...DEFAULT_SITE_SETTINGS.seo },
  analytics: {},
  social: {},
  commentPolicy: { ...DEFAULT_SITE_SETTINGS.commentPolicy, blockedTerms: [] },
  redirectRules: [],
  navigation: {
    primary: [],
    footer: [],
  },
  localization: normalizeSiteLocalization({
    localization: {
      defaultLocale: DEFAULT_SITE_SETTINGS.localization.defaultLocale,
      localeStrategy: DEFAULT_SITE_SETTINGS.localization.localeStrategy,
      locales: DEFAULT_SITE_SETTINGS.localization.locales.map((locale) => ({
        ...locale,
      })),
    },
  }),
  domainVerification: { ...DEFAULT_SITE_SETTINGS.domainVerification },
  domainAliases: [],
  webhooks: { ...DEFAULT_SITE_SETTINGS.webhooks, endpoints: [] },
  vercelDeployment: {
    ...DEFAULT_SITE_SETTINGS.vercelDeployment,
    missing: [],
    history: [],
  },
  billingQuota: {
    ...DEFAULT_SITE_SETTINGS.billingQuota,
    limits: { ...DEFAULT_SITE_SETTINGS.billingQuota.limits },
    usage: { ...DEFAULT_SITE_SETTINGS.billingQuota.usage },
    history: [],
  },
  frontendDesign: completeCustomFrontendTemplateRegistry(frontendDesign || emptyFrontendDesignContract()),
  contacts: { savedLists: [] },
  editor: { collectionBindingPresets: [] },
});

const SITE_LIST: StoreSite[] = [
  {
    id: "site-demo",
    teamId: "demo-team",
    name: "Backy Demo Site",
    slug: "demo",
    description: "Official Backy CMS demo site for website and blog examples.",
    customDomain: null,
    status: "published",
    isPublished: true,
    settings: createDefaultSiteSettings(
      buildDemoCustomFrontendDesignContract({
        siteName: "Backy Demo Site",
        publicHost: "demo.backy.app",
        theme: seedTheme,
        now: nowIso,
      }),
    ),
    theme: seedTheme,
  },
  {
    id: "site-cook",
    teamId: "demo-team",
    name: "Cooking Studio",
    slug: "cooks",
    description: "A starter template for recipes and editorial blogs.",
    customDomain: null,
    status: "draft",
    isPublished: false,
    settings: createDefaultSiteSettings(),
    theme: {
      ...seedTheme,
      colors: {
        ...seedTheme.colors,
        primary: "#f59e0b",
        secondary: "#f97316",
      },
      fonts: {
        ...seedTheme.fonts,
        heading: "Georgia, serif",
        body: "Inter, sans-serif",
      },
      customCSS:
        ".site-note{padding:10px;border-radius:8px;background:#fff4dd}",
    },
  },
];

const USER_LIST: StoreUser[] = [
  {
    id: "user-admin",
    fullName: "Admin User",
    email: "admin@backy.io",
    role: "admin",
    status: "active",
    createdAt: nowIso,
    updatedAt: nowIso,
    lastActiveAt: nowIso,
    invitedAt: null,
  },
  {
    id: "user-editor",
    fullName: "Jane Editor",
    email: "jane@backy.io",
    role: "editor",
    status: "active",
    createdAt: nowIso,
    updatedAt: nowIso,
    lastActiveAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
    invitedAt: null,
  },
];

const USER_PERMISSION_OVERRIDES: StoreUserPermissionOverride[] = [];
const TEAM_LIST: StoreTeam[] = [
  {
    id: "demo-team",
    name: "Demo team",
    slug: "demo-team",
    ownerId: "user-admin",
    settings: { plan: "free" },
    createdAt: nowIso,
    updatedAt: nowIso,
  },
];
const TEAM_MEMBERS: StoreTeamMember[] = [
  {
    id: "team-member-demo-admin",
    teamId: "demo-team",
    userId: "user-admin",
    role: "owner",
    joinedAt: nowIso,
  },
  {
    id: "team-member-demo-editor",
    teamId: "demo-team",
    userId: "user-editor",
    role: "editor",
    joinedAt: nowIso,
  },
];

const createRuntimeApiKey = (kind: "public" | "admin") =>
  `${kind === "public" ? "pk" : "sk"}_live_${randomUUID().replace(/-/g, "").slice(0, 24)}`;

const keyFingerprint = (value: string | undefined): string | null =>
  value ? createHash("sha256").update(value).digest("hex").slice(0, 16) : null;

const apiKeyRotationHistory = (value: unknown): ApiKeyRotationHistoryEntry[] =>
  Array.isArray(value)
    ? value
        .filter(
          (entry): entry is Record<string, unknown> =>
            entry && typeof entry === "object" && !Array.isArray(entry),
        )
        .map<ApiKeyRotationHistoryEntry>((entry) => {
          const scope: ApiKeyRotationHistoryEntry["scope"] =
            entry.scope === "public" || entry.scope === "admin"
              ? entry.scope
              : "all";
          return {
            id: sanitizeString(entry.id) || createRuntimeId("key_rotation"),
            scope,
            rotatedAt:
              sanitizeString(entry.rotatedAt) || new Date().toISOString(),
            actorId: sanitizeString(entry.actorId) || null,
            requestId: sanitizeString(entry.requestId) || null,
            publicKeyChanged: entry.publicKeyChanged === true,
            adminKeyChanged: entry.adminKeyChanged === true,
            previousPublicKeyFingerprint:
              sanitizeString(entry.previousPublicKeyFingerprint) || null,
            newPublicKeyFingerprint:
              sanitizeString(entry.newPublicKeyFingerprint) || null,
            previousAdminKeyFingerprint:
              sanitizeString(entry.previousAdminKeyFingerprint) || null,
            newAdminKeyFingerprint:
              sanitizeString(entry.newAdminKeyFingerprint) || null,
          };
        })
        .slice(0, 20)
    : [];

const apiKeyRotationHistoryEntryJson = (
  entry: ApiKeyRotationHistoryEntry,
): BackyJsonObject => ({
  id: entry.id,
  scope: entry.scope,
  rotatedAt: entry.rotatedAt,
  actorId: entry.actorId,
  requestId: entry.requestId,
  publicKeyChanged: entry.publicKeyChanged,
  adminKeyChanged: entry.adminKeyChanged,
  previousPublicKeyFingerprint: entry.previousPublicKeyFingerprint || null,
  newPublicKeyFingerprint: entry.newPublicKeyFingerprint || null,
  previousAdminKeyFingerprint: entry.previousAdminKeyFingerprint || null,
  newAdminKeyFingerprint: entry.newAdminKeyFingerprint || null,
});

const apiKeyRevocationHistory = (
  value: unknown,
): ApiKeyRevocationHistoryEntry[] =>
  Array.isArray(value)
    ? value
        .filter(
          (entry): entry is Record<string, unknown> =>
            entry && typeof entry === "object" && !Array.isArray(entry),
        )
        .map<ApiKeyRevocationHistoryEntry>((entry) => {
          const scope: ApiKeyRevocationHistoryEntry["scope"] =
            entry.scope === "public" || entry.scope === "admin"
              ? entry.scope
              : "all";
          const keyType: ApiKeyRevocationHistoryEntry["keyType"] =
            entry.keyType === "admin" ? "admin" : "public";
          const reason: ApiKeyRevocationHistoryEntry["reason"] =
            entry.reason === "manual" || entry.reason === "replaced"
              ? entry.reason
              : "rotated";
          return {
            id: sanitizeString(entry.id) || createRuntimeId("key_revocation"),
            scope,
            keyType,
            revokedAt:
              sanitizeString(entry.revokedAt) || new Date().toISOString(),
            actorId: sanitizeString(entry.actorId) || null,
            requestId: sanitizeString(entry.requestId) || null,
            reason,
            revokedKeyFingerprint:
              sanitizeString(entry.revokedKeyFingerprint) || null,
            replacementKeyFingerprint:
              sanitizeString(entry.replacementKeyFingerprint) || null,
          };
        })
        .slice(0, 40)
    : [];

const apiKeyRevocationHistoryEntryJson = (
  entry: ApiKeyRevocationHistoryEntry,
): BackyJsonObject => ({
  id: entry.id,
  scope: entry.scope,
  keyType: entry.keyType,
  revokedAt: entry.revokedAt,
  actorId: entry.actorId,
  requestId: entry.requestId,
  reason: entry.reason,
  revokedKeyFingerprint: entry.revokedKeyFingerprint,
  replacementKeyFingerprint: entry.replacementKeyFingerprint,
});

const appendApiKeyRotationHistory = (
  auth: BackyJsonObject | undefined,
  entry: ApiKeyRotationHistoryEntry,
): BackyJsonObject => ({
  ...(auth || {}),
  apiKeyRotationHistory: [
    apiKeyRotationHistoryEntryJson(entry),
    ...apiKeyRotationHistory(auth?.apiKeyRotationHistory).map(
      apiKeyRotationHistoryEntryJson,
    ),
  ].slice(0, 20),
});

const appendApiKeyRevocationHistory = (
  auth: BackyJsonObject | undefined,
  entries: ApiKeyRevocationHistoryEntry[],
): BackyJsonObject => ({
  ...(auth || {}),
  apiKeyRevocationHistory: [
    ...entries.map(apiKeyRevocationHistoryEntryJson),
    ...apiKeyRevocationHistory(auth?.apiKeyRevocationHistory).map(
      apiKeyRevocationHistoryEntryJson,
    ),
  ].slice(0, 40),
});

let SETTINGS: StoreSettings = {
  deliveryMode: "managed-hosting",
  apiKeys: {
    publicApiKey: createRuntimeApiKey("public"),
    adminApiKey: createRuntimeApiKey("admin"),
  },
  auth: {
    requireTwoFactor: false,
    inviteOnly: false,
    minPasswordLength: 12,
    sessionTimeoutMinutes: 120,
    allowedEmailDomains: "",
  },
  integrations: {
    supabase: {
      projectUrl: "",
      projectRef: "",
      databaseEnabled: false,
      storageEnabled: false,
      authEnabled: false,
    },
    vercel: {
      projectId: "",
      teamSlug: "",
      productionDomain: "",
      autoDeploy: false,
      previewDeployments: true,
    },
    commerce: {
      mode: "catalog-only",
      currency: "USD",
      paymentProvider: "none",
      providerMode: "test",
      providerAccountId: "",
      providerWebhookUrl: "",
      providerWebhookSecretId: "",
      providerWebhookEvents:
        "checkout.session.completed,payment_intent.succeeded,invoice.payment_succeeded,customer.subscription.updated,customer.subscription.paused,customer.subscription.resumed,customer.subscription.trial_will_end,customer.subscription.deleted,charge.refunded",
      reconciliationMode: "manual",
      reconciliationWindowHours: 24,
      checkoutSuccessPath: "/checkout/success",
      checkoutCancelPath: "/checkout/cancel",
      guestCheckout: true,
      taxEnabled: false,
      shippingEnabled: false,
      discountsEnabled: false,
      taxRatePercent: 8.25,
      digitalTaxRatePercent: 6,
      shippingBaseAmount: 8,
      shippingWeightRate: 1.25,
      discountPercent: 10,
      taxProvider: "manual",
      taxProviderUrl: "",
      shippingProvider: "manual",
      shippingProviderUrl: "",
      discountProvider: "manual",
      discountProviderUrl: "",
      catalogSyncProvider: "manual",
      catalogSyncProviderUrl: "",
      fulfillmentProvider: "manual",
      fulfillmentProviderUrl: "",
      inventoryReservations: true,
      reservationMinutes: 15,
      webhookEventsEnabled: false,
    },
  },
  updatedAt: nowIso,
};

const PAGE_LIST: StorePage[] = [
  {
    id: "page-home",
    siteId: "site-demo",
    title: "Home",
    slug: "index",
    description: "Demo landing page for Backy CMS.",
    status: "published",
    isHomepage: true,
    publishedAt: nowIso,
    scheduledAt: null,
    forms: ["form-contact"],
    createdAt: nowIso,
    updatedAt: nowIso,
    meta: {
      title: "Welcome | Backy Demo",
      description: "Build websites with Backy CMS.",
      keywords: ["backy", "cms", "demo"],
      ogImage: "https://images.unsplash.com/photo-1498050108023-c5249f4df085",
      canonical: "/index",
      noIndex: false,
      noFollow: false,
    },
    content: {
      elements: [
        {
          id: "home-heading",
          type: "heading",
          x: 140,
          y: 120,
          width: 700,
          height: 80,
          props: {
            content: "Welcome to Backy",
            level: "h1",
            fontSize: "54px",
            fontWeight: "700",
            color: "#0f172a",
          },
        },
        {
          id: "home-copy",
          type: "text",
          x: 140,
          y: 220,
          width: 780,
          height: 130,
          props: {
            content:
              "<p>Backy CMS gives you editor-first control and API-first delivery so you can power any frontend.</p>",
            fontSize: "22px",
            color: "#334155",
            lineHeight: "1.6",
          },
        },
        {
          id: "home-cta",
          type: "button",
          x: 140,
          y: 390,
          width: 180,
          height: 52,
          props: {
            content: "Start Building",
            href: "/admin",
            backgroundColor: "#3b82f6",
            color: "#ffffff",
            borderRadius: "10px",
            padding: "12px 22px",
            fontSize: "16px",
            fontWeight: "600",
          },
        },
      ],
      canvasSize: {
        width: 1200,
        height: 900,
      },
      customCSS:
        ".backy-page-note{display:inline-block;padding:10px 14px;border-radius:12px;background:#e2e8f0;color:#0f172a}",
    },
  },
  {
    id: "page-about",
    siteId: "site-demo",
    title: "About",
    slug: "about",
    description: "About Backy CMS editor and features.",
    status: "published",
    isHomepage: false,
    publishedAt: nowIso,
    scheduledAt: null,
    forms: ["form-contact"],
    createdAt: nowIso,
    updatedAt: nowIso,
    meta: {
      title: "About | Backy Demo",
      description: "Learn how Backy CMS works.",
      canonical: "/about",
      noIndex: false,
      noFollow: false,
    },
    content: {
      elements: [
        {
          id: "about-heading",
          type: "heading",
          x: 120,
          y: 110,
          width: 520,
          height: 60,
          props: {
            content: "About the Project",
            level: "h2",
            fontSize: "42px",
            fontWeight: "700",
            color: "#0f172a",
          },
        },
        {
          id: "about-text",
          type: "paragraph",
          x: 120,
          y: 200,
          width: 740,
          height: 220,
          props: {
            content:
              "<p>Backy aims to provide a complete CMS foundation with drag-and-drop editing and external frontend freedom.</p>" +
              "<p>Use the admin app to author content, media, and forms, then expose read APIs for your own React/Vue frontend.</p>",
            color: "#334155",
            fontSize: "20px",
            lineHeight: "1.7",
          },
        },
      ],
      canvasSize: {
        width: 1200,
        height: 700,
      },
    },
  },
  {
    id: "page-contact",
    siteId: "site-demo",
    title: "Contact",
    slug: "contact",
    description: "Contact form example page",
    status: "published",
    isHomepage: false,
    publishedAt: nowIso,
    scheduledAt: null,
    forms: ["form-contact"],
    createdAt: nowIso,
    updatedAt: nowIso,
    meta: {
      title: "Contact | Backy Demo",
      description: "Send us a message using a connected form block.",
      canonical: "/contact",
      noIndex: false,
      noFollow: false,
    },
    content: {
      elements: [
        {
          id: "contact-heading",
          type: "heading",
          x: 120,
          y: 80,
          width: 520,
          height: 56,
          props: {
            content: "Contact us",
            level: "h2",
            fontSize: "42px",
            fontWeight: "700",
          },
        },
        {
          id: "contact-form",
          type: "form",
          x: 120,
          y: 180,
          width: 620,
          height: 500,
          props: {
            formId: "form-contact",
            formTitle: "Contact Form",
            actionUrl: "/api/sites/site-demo/forms/form-contact/submissions",
            method: "POST",
          },
          children: [
            {
              id: "contact-name",
              type: "input",
              x: 0,
              y: 0,
              width: 540,
              height: 50,
              props: {
                type: "text",
                name: "name",
                placeholder: "Your name",
                required: true,
              },
            },
            {
              id: "contact-email",
              type: "input",
              x: 0,
              y: 70,
              width: 540,
              height: 50,
              props: {
                type: "email",
                name: "email",
                placeholder: "you@example.com",
                required: true,
              },
            },
            {
              id: "contact-message",
              type: "textarea",
              x: 0,
              y: 140,
              width: 540,
              height: 130,
              props: {
                name: "message",
                placeholder: "How can we help?",
                required: true,
              },
            },
            {
              id: "contact-send",
              type: "button",
              x: 0,
              y: 300,
              width: 180,
              height: 52,
              props: {
                type: "submit",
                content: "Send Message",
                backgroundColor: "#0f172a",
                color: "#ffffff",
              },
            },
          ],
        },
      ],
      canvasSize: {
        width: 1200,
        height: 820,
      },
    },
  },
  {
    id: "page-draft",
    siteId: "site-demo",
    title: "Roadmap",
    slug: "draft-page",
    description: "Draft page used for publish workflow checks.",
    status: "draft",
    isHomepage: false,
    publishedAt: null,
    scheduledAt: null,
    createdAt: nowIso,
    updatedAt: nowIso,
    meta: {
      title: "Roadmap (Draft) | Backy",
      description: "This page is a draft.",
      canonical: "/draft-page",
      noIndex: true,
      noFollow: true,
    },
    content: {
      elements: [
        {
          id: "draft-note",
          type: "heading",
          x: 80,
          y: 80,
          width: 620,
          height: 60,
          props: {
            content: "Draft-only page",
            level: "h3",
            color: "#b91c1c",
          },
        },
      ],
      canvasSize: {
        width: 1200,
        height: 420,
      },
    },
  },
];

const BLOG_POSTS: StoreBlogPost[] = [
  {
    id: "post-welcome",
    siteId: "site-demo",
    title: "Welcome to Backy",
    slug: "welcome",
    excerpt: "A quick start into the Backy CMS world.",
    content: {
      html: "<p>Backy CMS helps you ship a full website quickly. This post shows API-first rendering and editor parity.</p>",
    },
    status: "published",
    featuredImageId: "media-demo-hero",
    authorId: "user-editor",
    meta: {
      title: "Welcome to Backy",
      description: "A quick start into the Backy CMS world.",
      keywords: ["backy", "release"],
      canonical: "/blog/welcome",
      ogImage: "https://images.unsplash.com/photo-1559027615-cd4628902d4a",
    },
    categoryIds: ["cat-news"],
    tagIds: ["tag-getting-started"],
    publishedAt: nowIso,
    scheduledAt: null,
    createdAt: nowIso,
    updatedAt: nowIso,
  },
  {
    id: "post-product",
    siteId: "site-demo",
    title: "Building CMS parity page by page",
    slug: "cms-parity",
    excerpt: "Why editor/public parity is the hardest part.",
    content: {
      html: "<p>Editors drift and renderers drift. This post tracks how to avoid split-brain contracts.</p>",
    },
    status: "draft",
    featuredImageId: null,
    authorId: "user-editor",
    meta: {
      title: "Building CMS parity page by page",
      description: "Why editor/public parity is the hardest part.",
      canonical: "/blog/cms-parity",
      noIndex: true,
    },
    categoryIds: ["cat-engineering"],
    tagIds: ["tag-editor"],
    publishedAt: null,
    scheduledAt: null,
    createdAt: nowIso,
    updatedAt: nowIso,
  },
];

const BLOG_CATEGORIES: StoreBlogCategory[] = [
  {
    id: "cat-news",
    siteId: "site-demo",
    name: "News",
    slug: "news",
    description: "Product news and release notes.",
    color: "#2563eb",
    createdAt: nowIso,
    updatedAt: nowIso,
  },
  {
    id: "cat-engineering",
    siteId: "site-demo",
    name: "Engineering",
    slug: "engineering",
    description: "Technical notes about Backy CMS architecture.",
    color: "#059669",
    createdAt: nowIso,
    updatedAt: nowIso,
  },
];

const BLOG_TAGS: StoreBlogTag[] = [
  {
    id: "tag-getting-started",
    siteId: "site-demo",
    name: "Getting Started",
    slug: "getting-started",
    description: "Beginner-friendly onboarding content.",
    createdAt: nowIso,
    updatedAt: nowIso,
  },
  {
    id: "tag-editor",
    siteId: "site-demo",
    name: "Editor",
    slug: "editor",
    description: "Visual editor and rendering parity.",
    createdAt: nowIso,
    updatedAt: nowIso,
  },
];

const COLLECTIONS: StoreCollection[] = [
  {
    id: "collection-team",
    siteId: "site-demo",
    name: "Team Members",
    slug: "team",
    listRoutePattern: "/team",
    routePattern: "/team/:recordSlug",
    description: "Demo collection for dynamic team profile pages.",
    status: "published",
    fields: [
      {
        id: "field-team-name",
        key: "name",
        label: "Name",
        type: "text",
        required: true,
        unique: false,
        sortOrder: 10,
        helpText: null,
      },
      {
        id: "field-team-role",
        key: "role",
        label: "Role",
        type: "text",
        required: true,
        unique: false,
        sortOrder: 20,
        helpText: null,
      },
      {
        id: "field-team-bio",
        key: "bio",
        label: "Bio",
        type: "richText",
        required: false,
        unique: false,
        sortOrder: 30,
        helpText: null,
      },
      {
        id: "field-team-photo",
        key: "photo",
        label: "Photo",
        type: "image",
        required: false,
        unique: false,
        sortOrder: 40,
        helpText: null,
      },
    ],
    permissions: {
      publicRead: true,
      publicCreate: false,
      publicUpdate: false,
      publicDelete: false,
    },
    createdAt: nowIso,
    updatedAt: nowIso,
  },
  {
    id: "collection-products",
    siteId: "site-demo",
    name: "Products",
    slug: "products",
    listRoutePattern: "/products",
    routePattern: "/products/:recordSlug",
    description:
      "Demo commerce catalog for sellable products exposed through Backy collection APIs.",
    status: "published",
    fields: [
      {
        id: "field-product-title",
        key: "title",
        label: "Title",
        type: "text",
        required: true,
        unique: false,
        sortOrder: 10,
        helpText: null,
      },
      {
        id: "field-product-sku",
        key: "sku",
        label: "SKU",
        type: "text",
        required: true,
        unique: true,
        sortOrder: 20,
        helpText: null,
      },
      {
        id: "field-product-price",
        key: "price",
        label: "Price",
        type: "number",
        required: true,
        unique: false,
        sortOrder: 30,
        helpText: null,
      },
      {
        id: "field-product-compare-at-price",
        key: "compareAtPrice",
        label: "Compare at price",
        type: "number",
        required: false,
        unique: false,
        sortOrder: 40,
        helpText: null,
      },
      {
        id: "field-product-currency",
        key: "currency",
        label: "Currency",
        type: "text",
        required: true,
        unique: false,
        sortOrder: 50,
        helpText: null,
        defaultValue: "USD",
      },
      {
        id: "field-product-inventory",
        key: "inventory",
        label: "Inventory",
        type: "number",
        required: false,
        unique: false,
        sortOrder: 60,
        helpText: null,
        defaultValue: 0,
      },
      {
        id: "field-product-type",
        key: "productType",
        label: "Product Type",
        type: "select",
        required: true,
        unique: false,
        sortOrder: 70,
        helpText: null,
        options: ["physical", "digital", "service"],
        defaultValue: "physical",
      },
      {
        id: "field-product-download-url",
        key: "downloadUrl",
        label: "Digital Delivery URL",
        type: "url",
        required: false,
        unique: false,
        sortOrder: 80,
        helpText: null,
      },
      {
        id: "field-product-shipping-required",
        key: "shippingRequired",
        label: "Requires Shipping",
        type: "boolean",
        required: false,
        unique: false,
        sortOrder: 90,
        helpText: null,
        defaultValue: true,
      },
      {
        id: "field-product-weight",
        key: "weight",
        label: "Weight",
        type: "number",
        required: false,
        unique: false,
        sortOrder: 100,
        helpText: null,
      },
      {
        id: "field-product-shipping-profile",
        key: "shippingProfile",
        label: "Shipping Profile",
        type: "text",
        required: false,
        unique: false,
        sortOrder: 105,
        helpText: null,
      },
      {
        id: "field-product-tax-class",
        key: "taxClass",
        label: "Tax Class",
        type: "text",
        required: false,
        unique: false,
        sortOrder: 106,
        helpText: null,
      },
      {
        id: "field-product-discount-code",
        key: "discountCode",
        label: "Discount Code",
        type: "text",
        required: false,
        unique: false,
        sortOrder: 107,
        helpText: null,
      },
      {
        id: "field-product-return-policy",
        key: "returnPolicy",
        label: "Return Policy",
        type: "richText",
        required: false,
        unique: false,
        sortOrder: 108,
        helpText: null,
      },
      {
        id: "field-product-image",
        key: "imageUrl",
        label: "Image URL",
        type: "url",
        required: false,
        unique: false,
        sortOrder: 110,
        helpText: null,
      },
      {
        id: "field-product-description",
        key: "description",
        label: "Description",
        type: "richText",
        required: false,
        unique: false,
        sortOrder: 120,
        helpText: null,
      },
      {
        id: "field-product-seo-title",
        key: "seoTitle",
        label: "SEO Title",
        type: "text",
        required: false,
        unique: false,
        sortOrder: 130,
        helpText: null,
      },
      {
        id: "field-product-featured",
        key: "featured",
        label: "Featured",
        type: "boolean",
        required: false,
        unique: false,
        sortOrder: 140,
        helpText: null,
        defaultValue: false,
      },
      {
        id: "field-product-taxable",
        key: "taxable",
        label: "Taxable",
        type: "boolean",
        required: false,
        unique: false,
        sortOrder: 150,
        helpText: null,
        defaultValue: true,
      },
    ],
    permissions: {
      publicRead: true,
      publicCreate: false,
      publicUpdate: false,
      publicDelete: false,
    },
    createdAt: nowIso,
    updatedAt: nowIso,
  },
  {
    id: "collection-orders",
    siteId: "site-demo",
    name: "Orders",
    slug: "orders",
    listRoutePattern: "/orders",
    routePattern: "/orders/:recordSlug",
    description:
      "Demo commerce order queue for payment and fulfillment operations.",
    status: "published",
    fields: [
      {
        id: "field-order-number",
        key: "ordernumber",
        label: "Order Number",
        type: "text",
        required: true,
        unique: true,
        sortOrder: 10,
        helpText: null,
      },
      {
        id: "field-order-customer",
        key: "customername",
        label: "Customer Name",
        type: "text",
        required: true,
        unique: false,
        sortOrder: 20,
        helpText: null,
      },
      {
        id: "field-order-email",
        key: "email",
        label: "Email",
        type: "email",
        required: true,
        unique: false,
        sortOrder: 30,
        helpText: null,
      },
      {
        id: "field-order-phone",
        key: "phone",
        label: "Phone",
        type: "text",
        required: false,
        unique: false,
        sortOrder: 40,
        helpText: null,
      },
      {
        id: "field-order-total",
        key: "total",
        label: "Total",
        type: "number",
        required: true,
        unique: false,
        sortOrder: 50,
        helpText: null,
      },
      {
        id: "field-order-currency",
        key: "currency",
        label: "Currency",
        type: "text",
        required: true,
        unique: false,
        sortOrder: 60,
        helpText: null,
        defaultValue: "USD",
      },
      {
        id: "field-order-items",
        key: "items",
        label: "Items",
        type: "richText",
        required: true,
        unique: false,
        sortOrder: 70,
        helpText: null,
      },
      {
        id: "field-order-source",
        key: "ordersource",
        label: "Order Source",
        type: "select",
        required: false,
        unique: false,
        sortOrder: 75,
        helpText: null,
        options: ["web", "manual", "api", "import", "pos"],
        defaultValue: "web",
      },
      {
        id: "field-order-checkout-session",
        key: "checkoutsessionid",
        label: "Checkout Session ID",
        type: "text",
        required: false,
        unique: false,
        sortOrder: 76,
        helpText: null,
      },
      {
        id: "field-order-customer-id",
        key: "customerid",
        label: "Customer ID",
        type: "text",
        required: false,
        unique: false,
        sortOrder: 77,
        helpText: null,
      },
      {
        id: "field-order-status-access-token-hash",
        key: "statusaccesstokenhash",
        label: "Status Access Token Hash",
        type: "text",
        required: false,
        unique: false,
        sortOrder: 78,
        helpText: null,
      },
      {
        id: "field-order-status-access-token-issued-at",
        key: "statusaccesstokenissuedat",
        label: "Status Access Token Issued At",
        type: "date",
        required: false,
        unique: false,
        sortOrder: 79,
        helpText: null,
      },
      {
        id: "field-order-status-access-token-expires-at",
        key: "statusaccesstokenexpiresat",
        label: "Status Access Token Expires At",
        type: "date",
        required: false,
        unique: false,
        sortOrder: 79.5,
        helpText: null,
      },
      {
        id: "field-order-status",
        key: "orderstatus",
        label: "Order Status",
        type: "select",
        required: true,
        unique: false,
        sortOrder: 80,
        helpText: null,
        options: ["open", "paid", "fulfilled", "cancelled", "refunded"],
        defaultValue: "open",
      },
      {
        id: "field-order-payment",
        key: "paymentstatus",
        label: "Payment Status",
        type: "select",
        required: true,
        unique: false,
        sortOrder: 90,
        helpText: null,
        options: ["pending", "paid", "failed", "refunded"],
        defaultValue: "pending",
      },
      {
        id: "field-order-payment-provider",
        key: "paymentprovider",
        label: "Payment Provider",
        type: "text",
        required: false,
        unique: false,
        sortOrder: 100,
        helpText: null,
      },
      {
        id: "field-order-payment-reference",
        key: "paymentreference",
        label: "Payment Reference",
        type: "text",
        required: false,
        unique: false,
        sortOrder: 110,
        helpText: null,
      },
      {
        id: "field-order-paid-at",
        key: "paidat",
        label: "Paid At",
        type: "date",
        required: false,
        unique: false,
        sortOrder: 120,
        helpText: null,
      },
      {
        id: "field-order-fulfillment",
        key: "fulfillmentstatus",
        label: "Fulfillment Status",
        type: "select",
        required: true,
        unique: false,
        sortOrder: 130,
        helpText: null,
        options: ["unfulfilled", "processing", "fulfilled", "cancelled"],
        defaultValue: "unfulfilled",
      },
      {
        id: "field-order-fulfillment-carrier",
        key: "fulfillmentcarrier",
        label: "Fulfillment Carrier",
        type: "text",
        required: false,
        unique: false,
        sortOrder: 140,
        helpText: null,
      },
      {
        id: "field-order-tracking-number",
        key: "trackingnumber",
        label: "Tracking Number",
        type: "text",
        required: false,
        unique: false,
        sortOrder: 150,
        helpText: null,
      },
      {
        id: "field-order-tracking-url",
        key: "trackingurl",
        label: "Tracking URL",
        type: "url",
        required: false,
        unique: false,
        sortOrder: 160,
        helpText: null,
      },
      {
        id: "field-order-tracking-status",
        key: "trackingstatus",
        label: "Tracking Status",
        type: "text",
        required: false,
        unique: false,
        sortOrder: 165,
        helpText: null,
      },
      {
        id: "field-order-tracking-last-checked-at",
        key: "trackinglastcheckedat",
        label: "Tracking Last Checked At",
        type: "date",
        required: false,
        unique: false,
        sortOrder: 166,
        helpText: null,
      },
      {
        id: "field-order-fulfilled-at",
        key: "fulfilledat",
        label: "Fulfilled At",
        type: "date",
        required: false,
        unique: false,
        sortOrder: 170,
        helpText: null,
      },
      {
        id: "field-order-shipping-label-status",
        key: "shippinglabelstatus",
        label: "Shipping Label Status",
        type: "select",
        required: false,
        unique: false,
        sortOrder: 171,
        helpText: null,
        options: ["none", "draft", "purchased", "voided"],
        defaultValue: "none",
      },
      {
        id: "field-order-shipping-label-provider",
        key: "shippinglabelprovider",
        label: "Shipping Label Provider",
        type: "text",
        required: false,
        unique: false,
        sortOrder: 172,
        helpText: null,
      },
      {
        id: "field-order-shipping-label-id",
        key: "shippinglabelid",
        label: "Shipping Label ID",
        type: "text",
        required: false,
        unique: false,
        sortOrder: 173,
        helpText: null,
      },
      {
        id: "field-order-shipping-label-url",
        key: "shippinglabelurl",
        label: "Shipping Label URL",
        type: "url",
        required: false,
        unique: false,
        sortOrder: 174,
        helpText: null,
      },
      {
        id: "field-order-shipping-service-level",
        key: "shippingservicelevel",
        label: "Shipping Service Level",
        type: "text",
        required: false,
        unique: false,
        sortOrder: 175,
        helpText: null,
      },
      {
        id: "field-order-shipping-label-cost",
        key: "shippinglabelcost",
        label: "Shipping Label Cost",
        type: "number",
        required: false,
        unique: false,
        sortOrder: 176,
        helpText: null,
      },
      {
        id: "field-order-shipping-label-created-at",
        key: "shippinglabelcreatedat",
        label: "Shipping Label Created At",
        type: "date",
        required: false,
        unique: false,
        sortOrder: 177,
        helpText: null,
      },
      {
        id: "field-order-risk-score",
        key: "riskscore",
        label: "Risk Score",
        type: "number",
        required: false,
        unique: false,
        sortOrder: 180,
        helpText: null,
        defaultValue: 0,
      },
      {
        id: "field-order-risk-level",
        key: "risklevel",
        label: "Risk Level",
        type: "select",
        required: false,
        unique: false,
        sortOrder: 182,
        helpText: null,
        options: ["low", "medium", "high"],
        defaultValue: "low",
      },
      {
        id: "field-order-risk-reasons",
        key: "riskreasons",
        label: "Risk Reasons",
        type: "richText",
        required: false,
        unique: false,
        sortOrder: 184,
        helpText: null,
      },
      {
        id: "field-order-risk-review-status",
        key: "riskreviewstatus",
        label: "Risk Review Status",
        type: "select",
        required: false,
        unique: false,
        sortOrder: 186,
        helpText: null,
        options: ["cleared", "pending_review", "approved", "held"],
        defaultValue: "cleared",
      },
      {
        id: "field-order-shipping",
        key: "shippingaddress",
        label: "Shipping Address",
        type: "richText",
        required: false,
        unique: false,
        sortOrder: 190,
        helpText: null,
      },
      {
        id: "field-order-billing",
        key: "billingaddress",
        label: "Billing Address",
        type: "richText",
        required: false,
        unique: false,
        sortOrder: 200,
        helpText: null,
      },
      {
        id: "field-order-refund-amount",
        key: "refundamount",
        label: "Refund Amount",
        type: "number",
        required: false,
        unique: false,
        sortOrder: 210,
        helpText: null,
      },
      {
        id: "field-order-refund-reason",
        key: "refundreason",
        label: "Refund Reason",
        type: "richText",
        required: false,
        unique: false,
        sortOrder: 220,
        helpText: null,
      },
      {
        id: "field-order-provider-refund-status",
        key: "providerrefundstatus",
        label: "Provider Refund Status",
        type: "select",
        required: false,
        unique: false,
        sortOrder: 221,
        helpText: null,
        options: [
          "none",
          "requested",
          "succeeded",
          "failed",
          "requires_action",
        ],
        defaultValue: "none",
      },
      {
        id: "field-order-provider-refund-provider",
        key: "providerrefundprovider",
        label: "Provider Refund Provider",
        type: "text",
        required: false,
        unique: false,
        sortOrder: 222,
        helpText: null,
      },
      {
        id: "field-order-provider-refund-id",
        key: "providerrefundid",
        label: "Provider Refund ID",
        type: "text",
        required: false,
        unique: false,
        sortOrder: 223,
        helpText: null,
      },
      {
        id: "field-order-provider-refund-reference",
        key: "providerrefundreference",
        label: "Provider Refund Reference",
        type: "text",
        required: false,
        unique: false,
        sortOrder: 224,
        helpText: null,
      },
      {
        id: "field-order-provider-refund-amount",
        key: "providerrefundamount",
        label: "Provider Refund Amount",
        type: "number",
        required: false,
        unique: false,
        sortOrder: 225,
        helpText: null,
      },
      {
        id: "field-order-provider-refund-reason",
        key: "providerrefundreason",
        label: "Provider Refund Reason",
        type: "richText",
        required: false,
        unique: false,
        sortOrder: 226,
        helpText: null,
      },
      {
        id: "field-order-provider-refund-requested-at",
        key: "providerrefundrequestedat",
        label: "Provider Refund Requested At",
        type: "date",
        required: false,
        unique: false,
        sortOrder: 227,
        helpText: null,
      },
      {
        id: "field-order-provider-refund-completed-at",
        key: "providerrefundcompletedat",
        label: "Provider Refund Completed At",
        type: "date",
        required: false,
        unique: false,
        sortOrder: 228,
        helpText: null,
      },
      {
        id: "field-order-provider-refund-payload",
        key: "providerrefundpayload",
        label: "Provider Refund Payload",
        type: "richText",
        required: false,
        unique: false,
        sortOrder: 229,
        helpText: null,
      },
      {
        id: "field-order-notes",
        key: "notes",
        label: "Internal Notes",
        type: "richText",
        required: false,
        unique: false,
        sortOrder: 240,
        helpText: null,
      },
    ],
    permissions: {
      publicRead: false,
      publicCreate: false,
      publicUpdate: false,
      publicDelete: false,
    },
    createdAt: nowIso,
    updatedAt: nowIso,
  },
];

const COLLECTION_RECORDS: StoreCollectionRecord[] = [
  {
    id: "record-team-ada",
    siteId: "site-demo",
    collectionId: "collection-team",
    slug: "ada-lovelace",
    status: "published",
    values: {
      name: "Ada Lovelace",
      role: "Systems Architect",
      bio: "Leads the collection-backed rendering model for Backy demos.",
      photo: "media-demo-hero",
    },
    createdAt: nowIso,
    updatedAt: nowIso,
    publishedAt: nowIso,
    scheduledAt: null,
  },
  {
    id: "record-product-starter-template",
    siteId: "site-demo",
    collectionId: "collection-products",
    slug: "starter-site-template",
    status: "published",
    values: {
      title: "Starter Site Template",
      sku: "BKY-TPL-001",
      price: 49,
      compareAtPrice: 79,
      currency: "USD",
      inventory: 100,
      productType: "digital",
      downloadUrl: "https://downloads.example.com/backy-starter-template.zip",
      shippingRequired: false,
      shippingProfile: "digital-delivery",
      weight: null,
      taxClass: "digital-standard",
      discountCode: "BACKY10",
      returnPolicy:
        "Digital downloads can be refunded within 14 days if unused.",
      imageUrl: "https://images.unsplash.com/photo-1498050108023-c5249f4df085",
      description:
        "A ready-to-customize digital template product for storefront and checkout API design.",
      seoTitle: "Starter Site Template for Backy storefronts",
      featured: true,
      taxable: true,
    },
    createdAt: nowIso,
    updatedAt: nowIso,
    publishedAt: nowIso,
    scheduledAt: null,
  },
  {
    id: "record-order-demo-1001",
    siteId: "site-demo",
    collectionId: "collection-orders",
    slug: "ord-1001",
    status: "published",
    values: {
      ordernumber: "ORD-1001",
      customername: "Jordan Lee",
      email: "jordan@example.com",
      phone: "+1 312 847 1928",
      total: 49,
      currency: "USD",
      items: "Starter Site Template x1",
      ordersource: "web",
      checkoutsessionid: "cs_demo_1001",
      customerid: "",
      statusaccesstokenhash: "",
      statusaccesstokenissuedat: "",
      statusaccesstokenexpiresat: "",
      orderstatus: "paid",
      paymentstatus: "paid",
      paymentprovider: "stripe",
      paymentreference: "pi_demo_1001",
      paidat: nowIso,
      fulfillmentstatus: "unfulfilled",
      fulfillmentcarrier: "digital",
      trackingnumber: "",
      trackingurl: "",
      trackingstatus: "",
      trackinglastcheckedat: null,
      fulfilledat: null,
      shippinglabelstatus: "none",
      shippinglabelprovider: "",
      shippinglabelid: "",
      shippinglabelurl: "",
      shippingservicelevel: "",
      shippinglabelcost: null,
      shippinglabelcreatedat: null,
      riskscore: 0,
      risklevel: "low",
      riskreasons: "",
      riskreviewstatus: "cleared",
      shippingaddress: "Digital delivery",
      billingaddress: "Jordan Lee\n100 Market Street\nChicago, IL 60601",
      refundamount: null,
      refundreason: "",
      providerrefundstatus: "none",
      providerrefundprovider: "",
      providerrefundid: "",
      providerrefundreference: "",
      providerrefundamount: null,
      providerrefundreason: "",
      providerrefundrequestedat: null,
      providerrefundcompletedat: null,
      providerrefundpayload: "",
      notes: "Demo order for Backy commerce workflows.",
    },
    createdAt: nowIso,
    updatedAt: nowIso,
    publishedAt: nowIso,
    scheduledAt: null,
  },
];

const REUSABLE_SECTIONS: StoreReusableSection[] = [
  {
    id: "section-demo-hero",
    siteId: "site-demo",
    name: "Demo Hero Section",
    slug: "demo-hero-section",
    description: "Reusable starter hero section for demo pages.",
    category: "layout",
    status: "active",
    tags: ["hero", "starter"],
    sourceElementId: "home-heading",
    createdBy: "admin",
    updatedBy: "admin",
    createdAt: nowIso,
    updatedAt: nowIso,
    content: {
      canvasSize: {
        width: 1200,
        height: 420,
      },
      elements: [
        {
          id: "section-demo-hero-root",
          type: "section",
          x: 0,
          y: 0,
          width: 1200,
          height: 420,
          zIndex: 1,
          props: {
            backgroundColor: "#0f172a",
            borderRadius: 0,
          },
          children: [
            {
              id: "section-demo-hero-heading",
              type: "heading",
              x: 72,
              y: 76,
              width: 620,
              height: 92,
              zIndex: 1,
              props: {
                content: "Reusable page section",
                level: "h2",
                fontSize: 42,
                fontWeight: "800",
                color: "#ffffff",
              },
            },
            {
              id: "section-demo-hero-copy",
              type: "paragraph",
              x: 74,
              y: 182,
              width: 540,
              height: 72,
              zIndex: 2,
              props: {
                content:
                  "Save sections once and insert them into any Backy-authored page.",
                fontSize: 18,
                lineHeight: 1.55,
                color: "#cbd5e1",
              },
            },
          ],
        },
      ],
    },
  },
];

const CONTENT_REVISIONS: ContentRevision[] = [];
const COLLECTION_DESIGN_REVISIONS: BackyCollectionDesignRevision[] = [];
const FORM_DESIGN_REVISIONS: BackyFormDesignRevision[] = [];
const PRODUCT_DESIGN_REVISIONS: import("@backy-cms/core").BackyProductDesignRevision[] = [];
const TEMPLATE_REVISIONS: BackyTemplateRevision[] = [];
const PREVIEW_TOKENS: PreviewToken[] = [];
const ADMIN_AUDIT_LOGS: BackyAuditLogEntry[] = [];
const INTERACTIVE_COMPONENTS: StoreInteractiveComponent[] = [];

const MEDIA_LIBRARY: MediaItem[] = [
  {
    id: "media-demo-hero",
    siteId: "site-demo",
    filename: "hero-image.jpg",
    originalName: "hero-image.jpg",
    mimeType: "image/jpeg",
    sizeBytes: 245000,
    type: "image",
    url: "https://images.unsplash.com/photo-1559027615-cd4628902d4a",
    thumbnailUrl:
      "https://images.unsplash.com/photo-1559027615-cd4628902d4a?w=280&h=160&fit=crop",
    folderId: "folder-demo-pages",
    pageIds: ["page-home"],
    postIds: ["post-welcome"],
    tags: ["hero", "hero-image"],
    metadata: {
      width: 1600,
      height: 900,
      extension: "jpg",
    },
    altText: "Modern laptop workspace",
    caption: "Hero image for the demo homepage",
    uploadedBy: "admin",
    scope: "global",
    scopeTargetId: null,
    visibility: "public",
    createdAt: nowIso,
    updatedAt: nowIso,
  },
  {
    id: "media-demo-logo",
    siteId: "site-demo",
    filename: "backy-logo.png",
    originalName: "backy-logo.png",
    mimeType: "image/png",
    sizeBytes: 45000,
    type: "image",
    url: "https://upload.wikimedia.org/wikipedia/commons/a/a7/React-icon.svg",
    thumbnailUrl:
      "https://upload.wikimedia.org/wikipedia/commons/a/a7/React-icon.svg",
    folderId: "folder-demo-brand",
    pageIds: [],
    postIds: [],
    tags: ["brand", "icon"],
    metadata: {
      width: 120,
      height: 120,
      extension: "png",
    },
    altText: "Backy icon",
    caption: "Reusable logo",
    uploadedBy: "admin",
    scope: "global",
    scopeTargetId: null,
    visibility: "public",
    createdAt: nowIso,
    updatedAt: nowIso,
  },
  {
    id: "media-contact-bg",
    siteId: "site-demo",
    filename: "contact-bg.jpg",
    originalName: "contact-bg.jpg",
    mimeType: "image/jpeg",
    sizeBytes: 90000,
    type: "image",
    url: "https://images.unsplash.com/photo-1521791136064-7986c2920216",
    thumbnailUrl:
      "https://images.unsplash.com/photo-1521791136064-7986c2920216?w=280&h=160&fit=crop",
    folderId: "folder-demo-pages",
    pageIds: ["page-contact"],
    postIds: [],
    tags: ["contact", "background"],
    metadata: {
      width: 1920,
      height: 1080,
      extension: "jpg",
    },
    altText: "Contact page background",
    caption: "Optional background media",
    uploadedBy: "admin",
    scope: "page",
    scopeTargetId: "page-contact",
    visibility: "public",
    createdAt: nowIso,
    updatedAt: nowIso,
  },
];

const MEDIA_FOLDERS: MediaFolder[] = [
  {
    id: "folder-demo-brand",
    siteId: "site-demo",
    parentId: null,
    name: "Brand assets",
    sortOrder: 10,
    createdAt: nowIso,
  },
  {
    id: "folder-demo-pages",
    siteId: "site-demo",
    parentId: null,
    name: "Page imagery",
    sortOrder: 20,
    createdAt: nowIso,
  },
];

// Mutable filesystem state is provisioned at runtime; compiled constants above supply demo seeds.
const MEDIA_CATALOG_PATH = join(
  process.cwd(),
  "data",
  "backy",
  "media-library.json",
);
const ADMIN_CONTENT_PATH = join(
  process.cwd(),
  "data",
  "backy",
  "admin-content.json",
);
const INTERACTION_STORE_PATH = join(
  process.cwd(),
  "data",
  "backy",
  "interactions.json",
);
let persistedAdminContentLoaded = false;
let persistedAdminContentSignature = "";

interface AdminContentSnapshot {
  sites?: StoreSite[];
  pages?: StorePage[];
  blogPosts?: StoreBlogPost[];
  blogCategories?: StoreBlogCategory[];
  blogTags?: StoreBlogTag[];
  forms?: FormDefinition[];
  collections?: StoreCollection[];
  collectionRecords?: StoreCollectionRecord[];
  reusableSections?: StoreReusableSection[];
  interactiveComponents?: StoreInteractiveComponent[];
  users?: StoreUser[];
  userPermissionOverrides?: StoreUserPermissionOverride[];
  teams?: StoreTeam[];
  teamMembers?: StoreTeamMember[];
  settings?: StoreSettings;
  revisions?: ContentRevision[];
  templateRevisions?: BackyTemplateRevision[];
  formDesignRevisions?: BackyFormDesignRevision[];
  collectionDesignRevisions?: BackyCollectionDesignRevision[];
  productDesignRevisions?: import("@backy-cms/core").BackyProductDesignRevision[];
  previewTokens?: PreviewToken[];
  adminAuditLogs?: BackyAuditLogEntry[];
}

interface MediaCatalogSnapshot {
  media?: MediaItem[];
  folders?: MediaFolder[];
}

interface InteractionStoreSnapshot {
  comments?: Comment[];
  formSubmissions?: FormSubmission[];
  contacts?: Contact[];
  auditEvents?: AuditEvent[];
  commentBlocklist?: CommentBlocklistEntry[];
}

function ensurePersistedMediaLoaded() {
  recoverDemoSiteBackupCommit();
  for (let index = MEDIA_LIBRARY.length - 1; index >= 0; index -= 1) {
    if (MEDIA_LIBRARY[index].id.startsWith("media_")) {
      MEDIA_LIBRARY.splice(index, 1);
    }
  }
  for (let index = MEDIA_FOLDERS.length - 1; index >= 0; index -= 1) {
    if (MEDIA_FOLDERS[index].id.startsWith("folder_")) {
      MEDIA_FOLDERS.splice(index, 1);
    }
  }

  if (!existsSync(MEDIA_CATALOG_PATH)) {
    return;
  }

  try {
    const parsed = JSON.parse(
      readFileSync(MEDIA_CATALOG_PATH, "utf8"),
    ) as unknown;
    const parsedMedia = Array.isArray(parsed)
      ? parsed
      : parsed &&
          typeof parsed === "object" &&
          Array.isArray((parsed as MediaCatalogSnapshot).media)
        ? (parsed as MediaCatalogSnapshot).media || []
        : [];
    const parsedFolders =
      parsed &&
      typeof parsed === "object" &&
      !Array.isArray(parsed) &&
      Array.isArray((parsed as MediaCatalogSnapshot).folders)
        ? (parsed as MediaCatalogSnapshot).folders || []
        : [];

    if (parsedMedia.length === 0 && parsedFolders.length === 0) {
      return;
    }

    for (const item of parsedMedia) {
      if (!item || typeof item !== "object" || !("id" in item)) {
        continue;
      }

      const media = item as MediaItem;
      if (!MEDIA_LIBRARY.some((existing) => existing.id === media.id)) {
        MEDIA_LIBRARY.unshift(media);
      }
    }

    for (const item of parsedFolders) {
      if (!item || typeof item !== "object" || !("id" in item)) {
        continue;
      }

      const folder = item as MediaFolder;
      if (!MEDIA_FOLDERS.some((existing) => existing.id === folder.id)) {
        MEDIA_FOLDERS.unshift(folder);
      }
    }
  } catch (error) {
    console.error("Unable to load persisted media catalog:", error);
  }
}

function persistRuntimeMediaCatalog() {
  try {
    mkdirSync(dirname(MEDIA_CATALOG_PATH), { recursive: true });
    const runtimeItems = MEDIA_LIBRARY.filter((item) =>
      item.id.startsWith("media_"),
    );
    const runtimeFolders = MEDIA_FOLDERS.filter((item) =>
      item.id.startsWith("folder_"),
    );
    writeFileSync(
      MEDIA_CATALOG_PATH,
      JSON.stringify({ media: runtimeItems, folders: runtimeFolders }, null, 2),
    );
  } catch (error) {
    console.error("Unable to persist media catalog:", error);
  }
}

function ensurePersistedAdminContentLoaded(strict = false) {
  recoverDemoSiteBackupCommit();
  if (persistedAdminContentLoaded) {
    refreshPersistedAdminContent(strict);
    return;
  }

  persistedAdminContentLoaded = true;
  refreshPersistedAdminContent(strict);
}

function getAdminContentFileSignature(): string {
  try {
    const stats = statSync(ADMIN_CONTENT_PATH);
    return `${stats.mtimeMs}:${stats.size}`;
  } catch {
    return "";
  }
}

function refreshPersistedAdminContent(strict = false) {
  if (!existsSync(ADMIN_CONTENT_PATH)) {
    persistedAdminContentSignature = "";
    return;
  }

  try {
    const nextSignature = getAdminContentFileSignature();
    if (nextSignature && nextSignature === persistedAdminContentSignature) {
      return;
    }

    const parsed = JSON.parse(
      readFileSync(ADMIN_CONTENT_PATH, "utf8"),
    ) as AdminContentSnapshot;
    persistedAdminContentSignature = nextSignature;

    if (Array.isArray(parsed.sites)) {
      SITE_LIST.splice(
        0,
        SITE_LIST.length,
        ...parsed.sites.map((site) => completeStoreSiteFrontendDesign(site)),
      );
    }

    if (Array.isArray(parsed.pages)) {
      PAGE_LIST.splice(0, PAGE_LIST.length, ...parsed.pages);
    }

    if (Array.isArray(parsed.blogPosts)) {
      BLOG_POSTS.splice(0, BLOG_POSTS.length, ...parsed.blogPosts);
    }

    if (Array.isArray(parsed.blogCategories)) {
      BLOG_CATEGORIES.splice(
        0,
        BLOG_CATEGORIES.length,
        ...parsed.blogCategories,
      );
    }

    if (Array.isArray(parsed.blogTags)) {
      BLOG_TAGS.splice(0, BLOG_TAGS.length, ...parsed.blogTags);
    }

    if (Array.isArray(parsed.forms)) {
      FORM_LIBRARY.splice(0, FORM_LIBRARY.length, ...parsed.forms);
    }

    if (Array.isArray(parsed.collections)) {
      COLLECTIONS.splice(0, COLLECTIONS.length, ...parsed.collections);
    }

    if (Array.isArray(parsed.collectionRecords)) {
      COLLECTION_RECORDS.splice(
        0,
        COLLECTION_RECORDS.length,
        ...parsed.collectionRecords,
      );
    }

    if (Array.isArray(parsed.reusableSections)) {
      REUSABLE_SECTIONS.splice(
        0,
        REUSABLE_SECTIONS.length,
        ...parsed.reusableSections,
      );
    }

    if (Array.isArray(parsed.interactiveComponents)) {
      INTERACTIVE_COMPONENTS.splice(
        0,
        INTERACTIVE_COMPONENTS.length,
        ...parsed.interactiveComponents,
      );
    }

    if (Array.isArray(parsed.users)) {
      USER_LIST.splice(0, USER_LIST.length, ...parsed.users);
    }

    if (Array.isArray(parsed.userPermissionOverrides)) {
      USER_PERMISSION_OVERRIDES.splice(
        0,
        USER_PERMISSION_OVERRIDES.length,
        ...parsed.userPermissionOverrides,
      );
    }

    if (Array.isArray(parsed.teams)) {
      TEAM_LIST.splice(0, TEAM_LIST.length, ...parsed.teams);
    }

    if (Array.isArray(parsed.teamMembers)) {
      TEAM_MEMBERS.splice(0, TEAM_MEMBERS.length, ...parsed.teamMembers);
    }

    if (parsed.settings && typeof parsed.settings === "object") {
      SETTINGS = {
        ...SETTINGS,
        ...parsed.settings,
        apiKeys: {
          ...SETTINGS.apiKeys,
          ...(parsed.settings.apiKeys || {}),
        },
        integrations: {
          ...(SETTINGS.integrations || {}),
          ...(parsed.settings.integrations || {}),
        },
      };
    }

    if (Array.isArray(parsed.collectionDesignRevisions)) COLLECTION_DESIGN_REVISIONS.splice(0,COLLECTION_DESIGN_REVISIONS.length,...parsed.collectionDesignRevisions);
    if (Array.isArray(parsed.formDesignRevisions)) FORM_DESIGN_REVISIONS.splice(0, FORM_DESIGN_REVISIONS.length, ...parsed.formDesignRevisions);
    if (Array.isArray(parsed.productDesignRevisions)) PRODUCT_DESIGN_REVISIONS.splice(0, PRODUCT_DESIGN_REVISIONS.length, ...parsed.productDesignRevisions);
    if (Array.isArray(parsed.templateRevisions)) TEMPLATE_REVISIONS.splice(0, TEMPLATE_REVISIONS.length, ...parsed.templateRevisions);

    if (Array.isArray(parsed.revisions)) {
      CONTENT_REVISIONS.splice(
        0,
        CONTENT_REVISIONS.length,
        ...parsed.revisions,
      );
    }

    if (Array.isArray(parsed.previewTokens)) {
      PREVIEW_TOKENS.splice(0, PREVIEW_TOKENS.length, ...parsed.previewTokens);
    }

    if (Array.isArray(parsed.adminAuditLogs)) {
      ADMIN_AUDIT_LOGS.splice(
        0,
        ADMIN_AUDIT_LOGS.length,
        ...parsed.adminAuditLogs,
      );
    }
  } catch (error) {
    if (strict) throw error;
    console.error("Unable to load persisted admin content:", error);
  }
}

function persistAdminContent(strict = false) {
  const target = strict ? `${ADMIN_CONTENT_PATH}.${randomUUID()}.tmp` : ADMIN_CONTENT_PATH;
  try {
    mkdirSync(dirname(ADMIN_CONTENT_PATH), { recursive: true });
    writeFileSync(
      target,
      JSON.stringify(
        {
          sites: SITE_LIST,
          pages: PAGE_LIST,
          blogPosts: BLOG_POSTS,
          blogCategories: BLOG_CATEGORIES,
          blogTags: BLOG_TAGS,
          forms: FORM_LIBRARY,
          collections: COLLECTIONS,
          collectionRecords: COLLECTION_RECORDS,
          reusableSections: REUSABLE_SECTIONS,
          interactiveComponents: INTERACTIVE_COMPONENTS,
          users: USER_LIST,
          userPermissionOverrides: USER_PERMISSION_OVERRIDES,
          teams: TEAM_LIST,
          teamMembers: TEAM_MEMBERS,
          settings: SETTINGS,
          revisions: CONTENT_REVISIONS,
          templateRevisions: TEMPLATE_REVISIONS,
          productDesignRevisions: PRODUCT_DESIGN_REVISIONS,
          formDesignRevisions: FORM_DESIGN_REVISIONS,
          collectionDesignRevisions: COLLECTION_DESIGN_REVISIONS,
          previewTokens: PREVIEW_TOKENS,
          adminAuditLogs: ADMIN_AUDIT_LOGS,
        } satisfies AdminContentSnapshot,
        null,
        2,
      ),
    );
    if (strict) renameSync(target, ADMIN_CONTENT_PATH);
    persistedAdminContentSignature = getAdminContentFileSignature();
  } catch (error) {
    if (strict) { try { unlinkSync(target); } catch {} throw error; }
    console.error("Unable to persist admin content:", error);
  }
}

/** Dedicated append-only template history has no ordinary audit retention cap. */
export function listTemplateRevisions(siteId: string, templateId?: string, options: { limit?: number; offset?: number } = {}): BackyListResult<BackyTemplateRevision> {
  ensurePersistedAdminContentLoaded();
  const revisions = TEMPLATE_REVISIONS.filter(revision => revision.siteId === siteId && (!templateId || revision.templateId === templateId));
  const limit = Math.max(1, Math.min(100, Math.floor(options.limit || 25))), offset = Math.max(0, Math.floor(options.offset || 0));
  return { items: clone(revisions.slice(offset, offset + limit)), pagination: getPagination(revisions.length, limit, offset) };
}
export function getTemplateRevision(siteId: string, templateId: string, revisionId: string): BackyTemplateRevision | null {
  ensurePersistedAdminContentLoaded();
  const revision = TEMPLATE_REVISIONS.find(revision => revision.siteId === siteId && revision.templateId === templateId && revision.id === revisionId);
  return revision ? clone(revision) : null;
}
export function commitDemoFrontendDesign(input: BackyTemplateRevisionCommitInput): StoreSite {
  ensurePersistedAdminContentLoaded(true);
  const index = SITE_LIST.findIndex(site => site.id === input.siteId);
  if (index < 0) throw Object.assign(new Error('Site not found'), { code: 'SITE_NOT_FOUND' });
  const current = SITE_LIST[index];
  const fingerprint = (value: unknown) => createHash('sha256').update(serializeTemplateRevisionValue(value)).digest('hex');
  if (fingerprint(current.settings?.frontendDesign ?? null) !== input.expectedDesignFingerprint) throw Object.assign(new Error('The site design changed. Reload template history before restoring or saving.'), { code: 'TEMPLATE_HISTORY_CONFLICT' });
  const changes = changedTemplateRevisionSnapshots(current.settings?.frontendDesign?.templates || [], input.frontendDesign.templates);
  const appended: BackyTemplateRevision[] = changes.filter(change => change.operation !== 'baseline' || !TEMPLATE_REVISIONS.some(revision => revision.siteId === input.siteId && revision.templateId === change.snapshot.id && revision.fingerprint === fingerprint(change.snapshot))).map(change => ({
    schemaVersion: 'backy.template-revision.v1', id: `template_revision_${randomUUID()}`, siteId: input.siteId, templateId: change.snapshot.id,
    fingerprint: fingerprint(change.snapshot), snapshot: clone(change.snapshot), source: input.source,
    operation: change.operation === 'save' && input.restoredFromRevisionId ? 'restore' : change.operation,
    restoredFromRevisionId: change.operation === 'save' ? input.restoredFromRevisionId : null,
    actorId: input.actorId, requestId: input.requestId, createdAt: new Date().toISOString(),
  }));
  const next = { ...current, settings: { ...(clone(DEFAULT_SITE_SETTINGS) as unknown as SiteSettings), ...current.settings, frontendDesign: clone(input.frontendDesign) }, updatedAt: new Date().toISOString() } as StoreSite;
  SITE_LIST[index] = next; TEMPLATE_REVISIONS.unshift(...appended.reverse());
  try { persistAdminContent(true); }
  catch (cause) { SITE_LIST[index] = current; TEMPLATE_REVISIONS.splice(0, appended.length); throw cause; }
  return clone(next);
}


/** One-process demo admission and one strict persisted commit. Provider/catalog side effects are not part of this store. */
export function commitDemoFrontendComposition(siteId: string, prepare: () => {
  design?: BackyTemplateRevisionCommitInput;
  drafts: Array<{ type: 'page' | 'blogPost'; input: Record<string, unknown> }>;
}) {
  ensurePersistedAdminContentLoaded(true);
  const index = SITE_LIST.findIndex(site => site.id === siteId);
  if (index < 0) throw Object.assign(new Error('Site not found'), { code: 'SITE_NOT_FOUND' });
  const current = SITE_LIST[index];
  // The callback compares a fresh full inventory before any mutation, then prepares all targets synchronously.
  const plan = prepare();
  const drafts = plan.drafts.map(draft => ({ type: draft.type, item: draft.type === 'page'
    ? prepareCompositionPage(siteId, draft.input) : prepareCompositionBlogPost(siteId, draft.input) }));
  const appended: BackyTemplateRevision[] = [];
  let next = current;
  if (plan.design) {
    const input = plan.design;
    const fingerprint = (value: unknown) => createHash('sha256').update(serializeTemplateRevisionValue(value)).digest('hex');
    if (input.siteId !== siteId || fingerprint(current.settings?.frontendDesign ?? null) !== input.expectedDesignFingerprint)
      throw Object.assign(new Error('Site design changed. Review again.'), { code: 'TEMPLATE_HISTORY_CONFLICT' });
    for (const change of changedTemplateRevisionSnapshots(current.settings?.frontendDesign?.templates || [], input.frontendDesign.templates)) {
      if (change.operation === 'baseline' && TEMPLATE_REVISIONS.some(r => r.siteId === siteId && r.templateId === change.snapshot.id && r.fingerprint === fingerprint(change.snapshot))) continue;
      appended.push({ schemaVersion: 'backy.template-revision.v1', id: `template_revision_${randomUUID()}`, siteId, templateId: change.snapshot.id,
        fingerprint: fingerprint(change.snapshot), snapshot: clone(change.snapshot), source: input.source, operation: change.operation,
        restoredFromRevisionId: null, actorId: input.actorId, requestId: input.requestId, createdAt: new Date().toISOString() });
    }
    next = { ...current, settings: { ...(clone(DEFAULT_SITE_SETTINGS) as unknown as SiteSettings), ...current.settings, frontendDesign: clone(input.frontendDesign) }, updatedAt: new Date().toISOString() } as StoreSite;
  }
  const priorPages = PAGE_LIST.slice(), priorPosts = BLOG_POSTS.slice(), priorRevisions = TEMPLATE_REVISIONS.slice();
  SITE_LIST[index] = next;
  for (const draft of drafts) if (draft.type === 'page') PAGE_LIST.unshift(draft.item as StorePage); else BLOG_POSTS.unshift(draft.item as StoreBlogPost);
  TEMPLATE_REVISIONS.unshift(...appended.reverse());
  try { persistAdminContent(true); }
  catch (cause) { SITE_LIST[index] = current; PAGE_LIST.splice(0, PAGE_LIST.length, ...priorPages); BLOG_POSTS.splice(0, BLOG_POSTS.length, ...priorPosts); TEMPLATE_REVISIONS.splice(0, TEMPLATE_REVISIONS.length, ...priorRevisions); throw cause; }
  return drafts;
}

const DEFAULT_ADMIN_AUDIT_LIMIT = 50;
const MAX_ADMIN_AUDIT_LIMIT = 100;
const MAX_STORED_ADMIN_AUDIT_LOGS = 1000;

const normalizeAdminAuditLimit = (limit?: number): number =>
  Math.max(
    1,
    Math.min(
      MAX_ADMIN_AUDIT_LIMIT,
      Math.floor(limit || DEFAULT_ADMIN_AUDIT_LIMIT),
    ),
  );

const normalizeAdminAuditOffset = (offset?: number): number =>
  Math.max(0, Math.floor(offset || 0));

const asJsonObject = (value: unknown): BackyJsonObject | undefined =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as BackyJsonObject)
    : undefined;

const normalizeAdminAuditEntity = (
  value: BackyRepositoryEntity | undefined,
): BackyRepositoryEntity => value || "auditLog";

export function recordAdminAuditLog(
  input: Omit<BackyAuditLogEntry, "id" | "createdAt">,
): BackyAuditLogEntry {
  ensurePersistedAdminContentLoaded();

  const entry: BackyAuditLogEntry = {
    id: `audit_${Date.now().toString(36)}_${randomUUID().slice(0, 8)}`,
    siteId: input.siteId || null,
    teamId: input.teamId || null,
    actorId: input.actorId || "admin",
    entity: normalizeAdminAuditEntity(input.entity),
    entityId: input.entityId,
    action: input.action,
    before: asJsonObject(input.before),
    after: asJsonObject(input.after),
    metadata: asJsonObject(input.metadata) || {},
    requestId: input.requestId,
    createdAt: new Date().toISOString(),
  };

  ADMIN_AUDIT_LOGS.unshift(entry);
  if (ADMIN_AUDIT_LOGS.length > MAX_STORED_ADMIN_AUDIT_LOGS) {
    ADMIN_AUDIT_LOGS.splice(MAX_STORED_ADMIN_AUDIT_LOGS);
  }
  persistAdminContent();
  return clone(entry);
}

export function listAdminAuditLogs(
  input: BackyAuditLogListInput = {},
): BackyListResult<BackyAuditLogEntry> {
  ensurePersistedAdminContentLoaded();

  const limit = normalizeAdminAuditLimit(input.limit);
  const offset = normalizeAdminAuditOffset(input.offset);
  const filtered = ADMIN_AUDIT_LOGS.filter((entry) =>
    input.siteId ? entry.siteId === input.siteId : true,
  )
    .filter((entry) => (input.teamId ? entry.teamId === input.teamId : true))
    .filter((entry) => (input.actorId ? entry.actorId === input.actorId : true))
    .filter((entry) => (input.entity ? entry.entity === input.entity : true))
    .filter((entry) =>
      input.entityId ? entry.entityId === input.entityId : true,
    )
    .filter((entry) => (input.action ? entry.action === input.action : true))
    .filter((entry) =>
      input.requestId ? entry.requestId === input.requestId : true,
    );
  const items = filtered.slice(offset, offset + limit);

  return {
    items: clone(items),
    pagination: getPagination(filtered.length, limit, offset),
  };
}

const FORM_LIBRARY: FormDefinition[] = [
  {
    id: "form-contact",
    siteId: "site-demo",
    pageId: "page-contact",
    postId: null,
    name: "contact-form",
    title: "Contact form",
    description: "Simple contact capture for the demo contact page.",
    audience: "public",
    isActive: true,
    fields: [
      {
        key: "name",
        label: "Name",
        type: "text",
        required: true,
        placeholder: "Your full name",
        validation: [
          {
            type: "required",
            message: "Name is required.",
          },
        ],
      },
      {
        key: "email",
        label: "Email",
        type: "email",
        required: true,
        placeholder: "you@example.com",
        validation: [
          {
            type: "required",
            message: "Email is required.",
          },
          {
            type: "pattern",
            value: "[^\\s@]+@[^\\s@]+\\\\.[^\\s@]+",
            message: "Enter a valid email.",
          },
        ],
      },
      {
        key: "message",
        label: "Message",
        type: "textarea",
        required: true,
        placeholder: "Your message",
        validation: [
          {
            type: "required",
            message: "Message is required.",
          },
          {
            type: "minLength",
            value: 10,
            message: "Message should be at least 10 characters.",
          },
        ],
      },
    ],
    notificationEmail: null,
    successMessage: "Thanks for reaching out. We will get back to you quickly.",
    successRedirectUrl: null,
    enableHoneypot: true,
    enableCaptcha: false,
    moderationMode: "manual",
    contactShare: {
      enabled: true,
      nameField: "name",
      emailField: "email",
      notesField: "message",
      dedupeByEmail: true,
    },
    createdBy: "admin",
    updatedBy: "admin",
    createdAt: nowIso,
    updatedAt: nowIso,
  },
  {
    id: "form-newsletter",
    siteId: "site-demo",
    pageId: null,
    postId: null,
    name: "newsletter-signup",
    title: "Newsletter signup",
    description: "Public newsletter subscriber capture with topic preference and consent evidence.",
    audience: "public",
    isActive: true,
    fields: [
      {
        key: "email",
        label: "Email",
        type: "email",
        required: true,
        placeholder: "you@example.com",
      },
      {
        key: "name",
        label: "Name",
        type: "text",
        required: false,
        placeholder: "Optional",
      },
      {
        key: "topics",
        label: "Topics",
        type: "select",
        required: false,
        options: ["Investigations", "Local reports", "Policy updates", "Corrections"],
        defaultValue: "Investigations",
      },
      {
        key: "consent",
        label: "I agree to receive email updates and can unsubscribe anytime.",
        type: "checkbox",
        required: true,
      },
      {
        key: "signup_source",
        label: "Signup source",
        type: "text",
        required: false,
        placeholder: "Website newsletter page",
      },
    ],
    notificationEmail: null,
    successMessage: "Subscription confirmed. Watch your inbox for the next report.",
    successRedirectUrl: null,
    enableHoneypot: true,
    enableCaptcha: false,
    moderationMode: "auto-approve",
    contactShare: {
      enabled: true,
      nameField: "name",
      emailField: "email",
      notesField: "topics",
      dedupeByEmail: true,
    },
    consentSettings: {
      policyLabel: "Newsletter consent",
      retentionDays: 365,
      deleteAfterDays: 1095,
      exportIncludesIp: false,
    },
    settings: {
      backyIntent: "newsletter",
      schemaVersion: "backy.newsletter-form.v1",
      source: "demo-newsletter",
      subscriptionManagement: {
        statusField: "status",
        emailField: "email",
        topicField: "topics",
        consentField: "consent",
        sourceField: "signup_source",
      },
    },
    createdBy: "admin",
    updatedBy: "admin",
    createdAt: nowIso,
    updatedAt: nowIso,
  },
];

const COMMENT_LIST: Comment[] = [
  {
    id: "comment-page-about-1",
    siteId: "site-demo",
    targetType: "page",
    targetId: "page-about",
    authorName: "Open Source Reader",
    authorEmail: null,
    authorWebsite: null,
    userId: null,
    content: "Nice foundation for an open-source CMS.",
    status: "approved",
    parentId: null,
    reviewedBy: null,
    reviewedAt: nowIso,
    rejectionReason: null,
    reportCount: 0,
    reportReasons: [],
    blockReason: null,
    blockedBy: null,
    blockedAt: null,
    requestId: null,
    ipHash: null,
    createdAt: nowIso,
    updatedAt: nowIso,
  },
  {
    id: "comment-post-welcome-1",
    siteId: "site-demo",
    targetType: "post",
    targetId: "post-welcome",
    authorName: "Tester User",
    authorEmail: null,
    authorWebsite: null,
    userId: null,
    content: "This is exactly the parity flow we needed.",
    status: "approved",
    parentId: null,
    reviewedBy: null,
    reviewedAt: nowIso,
    rejectionReason: null,
    reportCount: 0,
    reportReasons: [],
    blockReason: null,
    blockedBy: null,
    blockedAt: null,
    requestId: null,
    ipHash: null,
    createdAt: nowIso,
    updatedAt: nowIso,
  },
];

const FORM_SUBMISSIONS: FormSubmission[] = [];
const CONTACT_LIST: Contact[] = [
  {
    id: "contact-demo-jordan",
    siteId: "site-demo",
    formId: "form-contact",
    pageId: "page-contact",
    postId: null,
    name: "Jordan Lee",
    email: "jordan@example.com",
    phone: "+1 555 0100",
    notes: "Interested in the starter site template and API handoff.",
    sourceValues: {
      name: "Jordan Lee",
      email: "jordan@example.com",
      message: "I want to connect a custom frontend to Backy.",
    },
    status: "new",
    sourceSubmissionId: "submission-contact-demo",
    requestId: "req-demo-contact",
    sourceIpHash: null,
    createdAt: nowIso,
    updatedAt: nowIso,
  },
];
const COMMENT_REPORT_BLOCKLIST = new Map<string, CommentBlocklistEntry>();
const SUBMISSION_RATE_WINDOWS = new Map<string, SubmissionRateState>();
const SUBMISSION_SIGNATURE_WINDOW_MS = 10 * 60 * 1000;
const SUBMISSION_RATE_WINDOW_MS = 60 * 1000;
const SUBMISSION_RATE_LIMIT = 8;
const FORM_SUBMISSION_SIGNATURES = new Map<string, number[]>();
const FORM_SUBMISSION_MIN_FILL_MS = 900;
const FORM_SPAM_MIN_FILL_MS_MAX = 120_000;
const FORM_SPAM_RATE_WINDOW_MS_MAX = 24 * 60 * 60 * 1000;
const FORM_SPAM_DUPLICATE_WINDOW_MS_MAX = 24 * 60 * 60 * 1000;
const COMMENT_RATE_WINDOWS = new Map<string, SubmissionRateState>();
const COMMENT_SIGNATURE_WINDOW_MS = 5 * 60 * 1000;
const COMMENT_RATE_WINDOW_MS = 45 * 1000;
const COMMENT_RATE_LIMIT = 12;
const COMMENT_SIGNATURES = new Map<string, number[]>();
const COMMENT_MIN_FILL_MS = 900;

interface BackyRuntimeStoreState {
  comments: Comment[];
  formSubmissions: FormSubmission[];
  contacts: Contact[];
  auditEvents: AuditEvent[];
}

const runtimeStoreState = ((
  globalThis as typeof globalThis & {
    __BACKY_RUNTIME_STORE__?: BackyRuntimeStoreState;
  }
).__BACKY_RUNTIME_STORE__ ??= {
  comments: [...COMMENT_LIST],
  formSubmissions: [...FORM_SUBMISSIONS],
  contacts: [...CONTACT_LIST],
  auditEvents: [],
});

let commentStore: Comment[] = runtimeStoreState.comments;
let formSubmissions: FormSubmission[] = runtimeStoreState.formSubmissions;
let contactStore: Contact[] = runtimeStoreState.contacts;
const auditEvents: AuditEvent[] = runtimeStoreState.auditEvents;

function setCommentStore(next: Comment[]) {
  commentStore = next;
  runtimeStoreState.comments = next;
}

function setFormSubmissions(next: FormSubmission[]) {
  formSubmissions = next;
  runtimeStoreState.formSubmissions = next;
}

function setContactStore(next: Contact[]) {
  contactStore = next;
  runtimeStoreState.contacts = next;
}

function setCommentBlocklist(entries: CommentBlocklistEntry[]) {
  COMMENT_REPORT_BLOCKLIST.clear();
  for (const entry of entries) {
    if (entry?.id && entry.siteId && entry.type && entry.value) {
      COMMENT_REPORT_BLOCKLIST.set(entry.id, entry);
    }
  }
}

function refreshPersistedInteractionStore() {
  recoverDemoSiteBackupCommit();
  if (!existsSync(INTERACTION_STORE_PATH)) {
    return;
  }

  try {
    const parsed = JSON.parse(
      readFileSync(INTERACTION_STORE_PATH, "utf8"),
    ) as InteractionStoreSnapshot;

    if (Array.isArray(parsed.comments)) {
      setCommentStore(parsed.comments);
    }

    if (Array.isArray(parsed.formSubmissions)) {
      setFormSubmissions(parsed.formSubmissions);
    }

    if (Array.isArray(parsed.contacts)) {
      setContactStore(parsed.contacts);
    }

    if (Array.isArray(parsed.auditEvents)) {
      auditEvents.splice(0, auditEvents.length, ...parsed.auditEvents);
    }

    if (Array.isArray(parsed.commentBlocklist)) {
      setCommentBlocklist(parsed.commentBlocklist);
    }
  } catch (error) {
    console.error("Unable to load persisted interaction store:", error);
  }
}

/** Site/settings/page duplication is one synchronous preparation and persisted replacement. */
export function duplicateAdminSiteAtomically(input: SiteDuplicationInput): SiteDuplicationResult {
  recoverDemoSiteBackupCommit();ensurePersistedAdminContentLoaded(true);
  const source=SITE_LIST.find(site=>site.id===input.sourceSiteId||site.slug===input.sourceSiteId);
  if(!source)throw new SiteCreationAdmissionError('SITE_NOT_FOUND',404,'Site not found.');
  assertSiteCreationQuota(SETTINGS,SITE_LIST.length);
  const prepared=prepareSiteDuplication(source,PAGE_LIST.filter(page=>page.siteId===source.id),input,new Set(SITE_LIST.map(site=>site.slug)),randomUUID,new Date().toISOString());
  const prior=existsSync(ADMIN_CONTENT_PATH)?JSON.parse(readFileSync(ADMIN_CONTENT_PATH,'utf8')):{};
  persistDemoSiteDuplication({...prior,sites:[...SITE_LIST,prepared.site],pages:[...PAGE_LIST,...prepared.pages]});
  persistedAdminContentSignature='';refreshPersistedAdminContent(true);
  const site=SITE_LIST.find(site=>site.id===prepared.site.id);if(!site)throw new SiteCreationAdmissionError('SITE_CREATION_PERSISTENCE_UNCONFIRMED',503,'Site creation could not confirm its outcome. Reload sites before applying again.');
  return {site:clone(site) as unknown as SiteDuplicationResult['site'],pagesCopied:prepared.pages.length,copiedResourceScope:SITE_DUPLICATION_SCOPE,concurrencyBoundary:'demo-single-process',completionWarnings:[]};
}

/** Complete private demo snapshot; recovery is deliberately single-process. */
export function captureDemoSiteBackup(siteId:string): SiteBackupGraph {
  recoverDemoSiteBackupCommit();
  // Recovery reads mutable runtime snapshots, never deployment inputs.
  // Unlike legacy best-effort loaders, a recovery export refuses corrupt disk.
  for(const path of [ADMIN_CONTENT_PATH,MEDIA_CATALOG_PATH,INTERACTION_STORE_PATH]) if(existsSync(/* turbopackIgnore: true */ path)) JSON.parse(readFileSync(/* turbopackIgnore: true */ path,'utf8'));
  ensurePersistedAdminContentLoaded(true);ensurePersistedMediaLoaded();refreshPersistedInteractionStore();
  const site=SITE_LIST.find(site=>site.id===siteId);if(!site)throw new SiteBackupError('SITE_NOT_FOUND',404,'Site not found.');
  const arrays:Record<typeof SITE_BACKUP_TABLES[number],unknown[]>={pages:PAGE_LIST,blogPosts:BLOG_POSTS,blogCategories:BLOG_CATEGORIES,blogTags:BLOG_TAGS,mediaFolders:MEDIA_FOLDERS,media:MEDIA_LIBRARY,mediaVersions:[],contentCollections:COLLECTIONS,contentCollectionRecords:COLLECTION_RECORDS,siteVisitors:[],formDefinitions:FORM_LIBRARY,formSubmissions,formContacts:contactStore,reusableSections:REUSABLE_SECTIONS,interactiveComponents:INTERACTIVE_COMPONENTS,contentRevisions:CONTENT_REVISIONS,templateRevisions:TEMPLATE_REVISIONS,productDesignRevisions:PRODUCT_DESIGN_REVISIONS,formDesignRevisions:FORM_DESIGN_REVISIONS,collectionDesignRevisions:COLLECTION_DESIGN_REVISIONS,comments:commentStore,commentBlocklist:Array.from(COMMENT_REPORT_BLOCKLIST.values())};
  const graph={site:clone(site) as unknown as SiteBackupRow,tables:Object.fromEntries(SITE_BACKUP_TABLES.map(name=>[name,clone(arrays[name].filter(row=>(row as SiteBackupRow).siteId===siteId))])) as SiteBackupGraph['tables']};
  assertSiteBackupGraph(graph,siteId);return graph;
}
export function commitDemoSiteBackup(graph:SiteBackupGraph,sourceSiteId:string):void {
  assertSiteBackupGraph(graph,String(graph.site.id));captureDemoSiteBackup(sourceSiteId);
  try{assertSiteCreationQuota(SETTINGS,SITE_LIST.length);}catch(error){if((error as any)?.code==='BILLING_SITE_LIMIT')throw new SiteBackupError('BILLING_SITE_LIMIT',402,(error as Error).message);throw error;}
  if(graph.tables.siteVisitors.length||graph.tables.mediaVersions.length)throw new SiteBackupError('SITE_BACKUP_RUNTIME_MISMATCH',503,'Database visitor and version rows require the database restore runtime. Demo exports retain versions inside media metadata.');
  if(SITE_LIST.some(site=>site.id===graph.site.id||site.slug===graph.site.slug))throw new SiteBackupError('SITE_BACKUP_SLUG_CONFLICT',409,'The draft site slug is already in use.');
  const source=SITE_LIST.find(site=>site.id===sourceSiteId);if(!source||source.teamId!==graph.site.teamId)throw new SiteBackupError('SITE_BACKUP_SCOPE_CHANGED',409,'The source ownership changed.');
  const read=(path:string)=>existsSync(path)?JSON.parse(readFileSync(path,'utf8')):{};
  const admin={...read(ADMIN_CONTENT_PATH),sites:[...SITE_LIST,{...graph.site,status:'draft'}],pages:[...PAGE_LIST,...graph.tables.pages],blogPosts:[...BLOG_POSTS,...graph.tables.blogPosts],blogCategories:[...BLOG_CATEGORIES,...graph.tables.blogCategories],blogTags:[...BLOG_TAGS,...graph.tables.blogTags],forms:[...FORM_LIBRARY,...graph.tables.formDefinitions],collections:[...COLLECTIONS,...graph.tables.contentCollections],collectionRecords:[...COLLECTION_RECORDS,...graph.tables.contentCollectionRecords],reusableSections:[...REUSABLE_SECTIONS,...graph.tables.reusableSections],interactiveComponents:[...INTERACTIVE_COMPONENTS,...graph.tables.interactiveComponents],revisions:[...CONTENT_REVISIONS,...graph.tables.contentRevisions],templateRevisions:[...TEMPLATE_REVISIONS,...graph.tables.templateRevisions],productDesignRevisions:[...PRODUCT_DESIGN_REVISIONS,...graph.tables.productDesignRevisions],formDesignRevisions:[...FORM_DESIGN_REVISIONS,...graph.tables.formDesignRevisions],collectionDesignRevisions:[...COLLECTION_DESIGN_REVISIONS,...graph.tables.collectionDesignRevisions]};
  const media={...read(MEDIA_CATALOG_PATH),media:[...MEDIA_LIBRARY.filter(row=>row.id.startsWith('media_')),...graph.tables.media],folders:[...MEDIA_FOLDERS.filter(row=>row.id.startsWith('folder_')),...graph.tables.mediaFolders]};
  const interactions={...read(INTERACTION_STORE_PATH),comments:[...commentStore,...graph.tables.comments],formSubmissions:[...formSubmissions,...graph.tables.formSubmissions],contacts:[...contactStore,...graph.tables.formContacts],auditEvents,commentBlocklist:[...Array.from(COMMENT_REPORT_BLOCKLIST.values()),...graph.tables.commentBlocklist]};
  commitDemoSiteBackupFiles([JSON.stringify(admin),JSON.stringify(media),JSON.stringify(interactions)]);
  persistedAdminContentSignature='';refreshPersistedAdminContent(true);ensurePersistedMediaLoaded();refreshPersistedInteractionStore();
}

function mergeById<T extends { id: string }>(
  persisted: T[] | undefined,
  current: T[],
): T[] {
  const merged = new Map<string, T>();
  for (const item of current) {
    if (item?.id) {
      merged.set(item.id, item);
    }
  }
  for (const item of persisted || []) {
    if (item?.id && !merged.has(item.id)) {
      merged.set(item.id, item);
    }
  }
  return Array.from(merged.values());
}

function persistInteractionStore(options: { mergePersisted?: boolean } = {}) {
  try {
    mkdirSync(dirname(INTERACTION_STORE_PATH), { recursive: true });
    const mergePersisted = options.mergePersisted !== false;
    const persisted = existsSync(INTERACTION_STORE_PATH)
      ? (JSON.parse(
          readFileSync(INTERACTION_STORE_PATH, "utf8"),
        ) as InteractionStoreSnapshot)
      : {};
    const nextSnapshot: InteractionStoreSnapshot = {
      comments: mergePersisted
        ? mergeById(persisted.comments, commentStore)
        : commentStore,
      formSubmissions: mergePersisted
        ? mergeById(persisted.formSubmissions, formSubmissions)
        : formSubmissions,
      contacts: mergePersisted
        ? mergeById(persisted.contacts, contactStore)
        : contactStore,
      auditEvents: mergePersisted
        ? mergeById(persisted.auditEvents, auditEvents)
        : auditEvents,
      commentBlocklist: mergePersisted
        ? mergeById(
            persisted.commentBlocklist,
            Array.from(COMMENT_REPORT_BLOCKLIST.values()),
          )
        : Array.from(COMMENT_REPORT_BLOCKLIST.values()),
    };

    setCommentStore(nextSnapshot.comments || []);
    setFormSubmissions(nextSnapshot.formSubmissions || []);
    setContactStore(nextSnapshot.contacts || []);
    auditEvents.splice(
      0,
      auditEvents.length,
      ...(nextSnapshot.auditEvents || []),
    );
    setCommentBlocklist(nextSnapshot.commentBlocklist || []);

    writeFileSync(
      INTERACTION_STORE_PATH,
      JSON.stringify(nextSnapshot, null, 2),
    );
  } catch (error) {
    console.error("Unable to persist interaction store:", error);
  }
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function isPublished(
  status?:
    | StorePage["status"]
    | StoreBlogPost["status"]
    | StoreCollectionRecord["status"],
  scheduledAt?: string | null,
): boolean {
  return isContentPublished({ status, scheduledAt });
}

function defaultNoIndexForStatus(
  status: StorePage["status"] | StoreBlogPost["status"],
): boolean {
  return status !== "published" && status !== "scheduled";
}

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function getPagination(
  total: number,
  limit: number,
  offset: number,
): Pagination {
  return {
    total,
    limit,
    offset,
    hasMore: offset + limit < total,
  };
}

function normalizeIdentifier(value: string) {
  return value.trim().toLowerCase();
}

function normalizeReportReason(
  raw: string | null | undefined,
): CommentReportReason | null {
  const normalized = (raw || "").trim().toLowerCase();
  if (!normalized) {
    return null;
  }

  if (COMMENT_REPORT_REASONS.includes(normalized as CommentReportReason)) {
    return normalized as CommentReportReason;
  }

  if (
    normalized === "off topic" ||
    normalized === "off-topic" ||
    normalized === "offtopic"
  ) {
    return "off-topic";
  }

  if (normalized === "hate" || normalized === "hatespeech") {
    return "hate-speech";
  }

  if (normalized === "abusive" || normalized === "threat") {
    return "abuse";
  }

  if (normalized === "other") {
    return "other";
  }

  return "other";
}

function getCommentBlockKey(
  siteId: string,
  kind: "email" | "ip",
  value: string,
) {
  return `${siteId}:${kind}:${normalizeIdentifier(value)}`;
}

function isCommentBlockedByIdentity(
  siteId: string,
  params: { email?: string | null; ipHash?: string | null },
) {
  const blockedEmailKey = params.email
    ? COMMENT_REPORT_BLOCKLIST.get(
        getCommentBlockKey(siteId, "email", params.email),
      )
    : null;

  if (blockedEmailKey) {
    return blockedEmailKey;
  }

  if (params.ipHash) {
    const blockedIp = COMMENT_REPORT_BLOCKLIST.get(
      getCommentBlockKey(siteId, "ip", params.ipHash),
    );
    if (blockedIp) {
      return blockedIp;
    }
  }

  return null;
}

function getRequestKey(siteId: string, formId: string, ipHash?: string | null) {
  return `${siteId}:${formId}:${ipHash || "anonymous"}`;
}

function getCommentRequestKey(
  siteId: string,
  targetType: CommentTargetType,
  targetId: string,
  ipHash?: string | null,
) {
  return `${siteId}:${targetType}:${targetId}:${ipHash || "anonymous"}`;
}

function normalizeFormElementType(value: string): string {
  const normalized =
    typeof value === "string"
      ? value
          .trim()
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "")
      : "";

  if (!normalized) {
    return "";
  }

  if (
    normalized === "dropdown" ||
    normalized === "dropdownselector" ||
    normalized === "dropdownselect" ||
    normalized.includes("dropdow")
  ) {
    return "select";
  }

  if (
    normalized === "multiline" ||
    normalized === "multilinetext" ||
    normalized === "multilinetextinput" ||
    normalized === "textarea" ||
    normalized === "textareafield"
  ) {
    return "textarea";
  }

  if (
    normalized === "textinput" ||
    normalized === "textinputfield" ||
    normalized === "textfield" ||
    normalized === "textareafield" ||
    normalized === "inputfield" ||
    normalized.includes("textinput") ||
    normalized.includes("textfield")
  ) {
    return "input";
  }

  if (
    normalized === "radioinput" ||
    normalized === "radio" ||
    normalized === "radioinputfield" ||
    normalized === "radiofield" ||
    normalized.includes("radioinput") ||
    normalized.includes("radiobutton")
  ) {
    return "radio";
  }

  if (
    normalized === "checkboxinput" ||
    normalized === "checkbox" ||
    normalized === "checkboxinputfield" ||
    normalized === "checkboxfield" ||
    normalized === "checkboxes" ||
    normalized.includes("checkboxinput") ||
    normalized.includes("checkboxbutton")
  ) {
    return "checkbox";
  }

  return normalized.includes("select") ? "select" : normalized;
}

function getFormFieldType(node: CanvasElement): FormFieldDefinition["type"] {
  const normalizedType = normalizeFormElementType(node.type);

  if (normalizedType === "textarea") {
    return "textarea";
  }

  if (normalizedType === "select") {
    return "select";
  }

  if (normalizedType === "checkbox") {
    return "checkbox";
  }

  if (normalizedType === "radio") {
    return "radio";
  }

  const raw = sanitizeString(
    node.props.inputType || node.props.type || normalizedType,
  ).toLowerCase();
  if (raw === "email") return "email";
  if (raw === "number") return "number";
  if (raw === "date") return "date";
  if (raw === "tel") return "tel";
  if (raw === "url") return "url";
  if (raw === "file") return "file";
  if (
    raw === "password" ||
    raw === "text" ||
    raw === "search" ||
    raw === "hidden"
  ) {
    return "text";
  }

  return "text";
}

function ensureUniqueFieldKey(base: string, usedKeys: Set<string>): string {
  const raw = sanitizeString(base) || `field_${usedKeys.size + 1}`;
  const normalized = raw
    .replace(/\s+/g, "_")
    .replace(/[^a-z0-9_\-]/gi, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "");

  const safeBase =
    normalized.length > 0 ? normalized : `field_${usedKeys.size + 1}`;
  let key = safeBase;
  let suffix = 1;

  while (usedKeys.has(key)) {
    suffix += 1;
    key = `${safeBase}_${suffix}`;
  }

  usedKeys.add(key);
  return key;
}

function parseNumberValue(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  const normalized = sanitizeString(value);
  if (!normalized) {
    return undefined;
  }

  const parsed = Number.parseFloat(normalized);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function parseFieldOptions(rawOptions: unknown): string[] {
  if (!rawOptions) {
    return [];
  }

  if (Array.isArray(rawOptions)) {
    return rawOptions
      .map((option) => {
        if (typeof option === "string") {
          return option.trim();
        }

        if (option && typeof option === "object" && "value" in option) {
          return sanitizeString((option as { value?: unknown }).value).trim();
        }

        if (option && typeof option === "object" && "label" in option) {
          return sanitizeString((option as { label?: unknown }).label).trim();
        }

        return "";
      })
      .filter((option) => option.length > 0);
  }

  if (typeof rawOptions === "string") {
    return rawOptions
      .split(/[\n,]/)
      .map((option) => option.trim())
      .filter((option) => option.length > 0);
  }

  return [];
}

function parseOptionValue(value: unknown): string {
  return sanitizeString(value).toLowerCase();
}

function normalizeFieldOptions(rawOptions: unknown): string[] {
  return parseFieldOptions(rawOptions).map(parseOptionValue).filter(Boolean);
}

function canvasFormFieldSupportsOptions(
  type: FormFieldDefinition["type"],
): boolean {
  return type === "select" || type === "checkbox" || type === "radio";
}

function normalizeCanvasFormFieldOptions(
  type: FormFieldDefinition["type"],
  rawOptions: unknown,
): string[] | undefined {
  if (!canvasFormFieldSupportsOptions(type)) {
    return undefined;
  }

  const options = parseFieldOptions(rawOptions)
    .map((option) => option.trim())
    .filter(Boolean);

  return options.length > 0 ? options : undefined;
}

function findMatchingCanvasFormFieldOption(
  value: string,
  options: string[] | undefined,
): string | undefined {
  const normalizedValue = value.trim().toLowerCase();
  return (options || []).find(
    (option) => option.toLowerCase() === normalizedValue,
  );
}

function normalizeCanvasFormFieldDefaultValue(
  defaultValue: unknown,
  type: FormFieldDefinition["type"],
  options: string[] | undefined,
): string | undefined {
  const value = sanitizeString(defaultValue);
  if (!value) {
    return undefined;
  }

  if (type === "select" || type === "radio") {
    return findMatchingCanvasFormFieldOption(value, options);
  }

  if (type === "checkbox") {
    if (options?.length) {
      const selections = value
        .split(",")
        .map((selection) => selection.trim())
        .filter(Boolean);
      const matchedSelections = selections
        .map((selection) => findMatchingCanvasFormFieldOption(selection, options))
        .filter((selection): selection is string => Boolean(selection));

      return matchedSelections.length === selections.length &&
        matchedSelections.length > 0
        ? matchedSelections.join(", ")
        : undefined;
    }

    return ["true", "on", "1", "yes", "false", "off", "0", "no"].includes(
      value.toLowerCase(),
    )
      ? value
      : undefined;
  }

  if (type === "number") {
    return Number.isFinite(Number(value)) ? value : undefined;
  }

  if (type === "email") {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) ? value : undefined;
  }

  if (type === "date") {
    return isValidDateSubmissionValue(value) ? value : undefined;
  }

  if (type === "tel") {
    return isValidTelSubmissionValue(value) ? value : undefined;
  }

  if (type === "url") {
    try {
      const parsedUrl = new URL(value);
      return parsedUrl.protocol === "http:" || parsedUrl.protocol === "https:"
        ? value
        : undefined;
    } catch {
      return undefined;
    }
  }

  if (type === "file") {
    return undefined;
  }

  return value;
}

function canvasValidationTypesForFieldType(
  type: FormFieldDefinition["type"],
): Array<NonNullable<FormFieldDefinition["validation"]>[number]["type"]> {
  if (type === "number") {
    return ["min", "max"];
  }

  if (
    type === "text" ||
    type === "textarea" ||
    type === "email" ||
    type === "tel" ||
    type === "url"
  ) {
    return ["minLength", "maxLength", "pattern"];
  }

  return [];
}

function defaultCanvasValidationMessage(
  fieldLabel: string,
  ruleType: NonNullable<FormFieldDefinition["validation"]>[number]["type"],
): string {
  const label = fieldLabel.trim() || "This field";
  if (ruleType === "minLength") return `${label} is too short.`;
  if (ruleType === "maxLength") return `${label} is too long.`;
  if (ruleType === "pattern") return `${label} format is invalid.`;
  if (ruleType === "min") return `${label} is too small.`;
  if (ruleType === "max") return `${label} is too large.`;
  return `${label} is required.`;
}

function normalizeCanvasFormFieldValidation(
  value: unknown,
  fieldType: FormFieldDefinition["type"],
  fieldLabel: string,
): FormFieldDefinition["validation"] {
  if (!Array.isArray(value)) {
    return undefined;
  }

  const allowedValidationTypes = new Set(
    canvasValidationTypesForFieldType(fieldType),
  );
  const rules = value
    .filter(
      (rule): rule is Record<string, unknown> =>
        Boolean(rule) && typeof rule === "object" && !Array.isArray(rule),
    )
    .map(
      (rule): NonNullable<FormFieldDefinition["validation"]>[number] | null => {
        const type = sanitizeString(rule.type) as NonNullable<
          FormFieldDefinition["validation"]
        >[number]["type"];
        if (!allowedValidationTypes.has(type)) {
          return null;
        }

        const isNumericRule =
          type === "min" ||
          type === "max" ||
          type === "minLength" ||
          type === "maxLength";
        const value = isNumericRule
          ? parseNumberValue(rule.value)
          : sanitizeString(rule.value);

        if (value === undefined || sanitizeString(value).length === 0) {
          return null;
        }

        return {
          type,
          value,
          message:
            sanitizeString(rule.message) ||
            defaultCanvasValidationMessage(fieldLabel, type),
        };
      },
    )
    .filter(
      (rule): rule is NonNullable<FormFieldDefinition["validation"]>[number] =>
        Boolean(rule),
    );

  return rules.length > 0 ? rules : undefined;
}

function canvasFormSchemaValidationRequiresField(value: unknown): boolean {
  if (!Array.isArray(value)) {
    return false;
  }

  return value.some(
    (rule) =>
      Boolean(rule) &&
      typeof rule === "object" &&
      !Array.isArray(rule) &&
      sanitizeString((rule as Record<string, unknown>).type) === "required",
  );
}

function parseSubmissionValues(value: unknown): string[] {
  if (value === null || value === undefined) {
    return [];
  }

  if (Array.isArray(value)) {
    return value
      .flatMap((entry) => parseSubmissionValues(entry))
      .filter(Boolean);
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    return [`${value}`];
  }

  if (typeof value === "boolean") {
    return [value ? "on" : "off"];
  }

  return sanitizeString(value)
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function buildDynamicValidationRules(
  fieldType: FormFieldDefinition["type"],
  props: Record<string, unknown>,
): FormFieldDefinition["validation"] {
  const rules: NonNullable<FormFieldDefinition["validation"]> = [];
  const minLength = parseNumberValue(props.minLength);
  const maxLength = parseNumberValue(props.maxLength);
  const minValue = parseNumberValue(props.min);
  const maxValue = parseNumberValue(props.max);
  const pattern = sanitizeString(props.pattern);

  if (typeof minLength === "number" && fieldType !== "checkbox") {
    rules.push({
      type: "minLength",
      value: minLength,
      message: `${fieldType} should be at least ${minLength} characters`,
    });
  }

  if (typeof maxLength === "number" && fieldType !== "checkbox") {
    rules.push({
      type: "maxLength",
      value: maxLength,
      message: `${fieldType} should be no more than ${maxLength} characters`,
    });
  }

  if (typeof minValue === "number") {
    rules.push({
      type: "min",
      value: minValue,
      message: `${fieldType} should be at least ${minValue}`,
    });
  }

  if (typeof maxValue === "number") {
    rules.push({
      type: "max",
      value: maxValue,
      message: `${fieldType} should be no more than ${maxValue}`,
    });
  }

  if (pattern.length > 0) {
    rules.push({
      type: "pattern",
      value: pattern,
      message: `${fieldType} format is invalid`,
    });
  }

  return rules.length > 0 ? rules : undefined;
}

function normalizeCanvasFormField(
  field: FormFieldDefinition,
): FormFieldDefinition {
  const type = normalizeFormSchemaFieldType(field.type);
  const options = normalizeCanvasFormFieldOptions(type, field.options);
  const defaultValue = normalizeCanvasFormFieldDefaultValue(
    field.defaultValue,
    type,
    options,
  );
  const validation = normalizeCanvasFormFieldValidation(
    field.validation,
    type,
    field.label,
  );

  return {
    ...field,
    type,
    defaultValue,
    options,
    validation,
  };
}

function buildDynamicFieldFromElement(
  node: CanvasElement,
  usedKeys: Set<string>,
  index: number,
): FormFieldDefinition | null {
  const fieldType = getFormFieldType(node);
  const labelCandidate = sanitizeString(node.props.label);
  const nameCandidate = sanitizeString(node.props.name);
  const keyCandidate = sanitizeString(node.props.key);
  const fallback = sanitizeString(node.props.fieldKey);
  const requestedKey =
    [
      nameCandidate,
      keyCandidate,
      fallback,
      `${normalizeFormElementType(node.type)}_${index}`,
    ].find((value) => value.length > 0) || `field_${index}`;

  const key = ensureUniqueFieldKey(requestedKey, usedKeys);

  return normalizeCanvasFormField({
    key,
    label: labelCandidate.length > 0 ? labelCandidate : key,
    type: fieldType,
    required:
      node.props.required === true ||
      sanitizeString(node.props.required).toLowerCase() === "true" ||
      sanitizeString(node.props.required).toLowerCase() === "required",
    placeholder: sanitizeString(node.props.placeholder),
    helpText: sanitizeString(node.props.helpText),
    defaultValue:
      node.props.defaultValue !== undefined
        ? sanitizeString(node.props.defaultValue)
        : sanitizeString(node.props.value),
    options: normalizeCanvasFormFieldOptions(fieldType, node.props.options),
    validation: buildDynamicValidationRules(fieldType, node.props),
  });
}

function normalizeFormSchemaFieldType(
  value: unknown,
): FormFieldDefinition["type"] {
  const raw = sanitizeString(value).toLowerCase();
  if (raw === "email") return "email";
  if (raw === "number") return "number";
  if (raw === "textarea") return "textarea";
  if (raw === "select") return "select";
  if (raw === "checkbox") return "checkbox";
  if (raw === "radio") return "radio";
  if (raw === "date") return "date";
  if (raw === "tel") return "tel";
  if (raw === "url") return "url";
  if (raw === "file") return "file";
  return "text";
}

function normalizeFormSchemaValidation(
  value: unknown,
  fieldType: FormFieldDefinition["type"],
  fieldLabel: string,
): FormFieldDefinition["validation"] {
  return normalizeCanvasFormFieldValidation(value, fieldType, fieldLabel);
}

function normalizeFormSchemaField(
  input: unknown,
  usedKeys: Set<string>,
  index: number,
): FormFieldDefinition | null {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return null;
  }

  const record = input as Record<string, unknown>;
  const requestedKey =
    sanitizeString(record.key) ||
    sanitizeString(record.name) ||
    sanitizeString(record.id) ||
    `field_${index}`;
  const key = ensureUniqueFieldKey(requestedKey, usedKeys);
  const type = normalizeFormSchemaFieldType(record.type || record.inputType);
  const label = sanitizeString(record.label) || key;
  const validation = normalizeFormSchemaValidation(
    record.validation,
    type,
    label,
  );

  return normalizeCanvasFormField({
    key,
    label,
    type,
    placeholder: sanitizeString(record.placeholder),
    helpText: sanitizeString(record.helpText),
    defaultValue:
      record.defaultValue !== undefined
        ? sanitizeString(record.defaultValue)
        : sanitizeString(record.value),
    options: normalizeCanvasFormFieldOptions(type, record.options),
    required:
      record.required === true ||
      sanitizeString(record.required).toLowerCase() === "true" ||
      canvasFormSchemaValidationRequiresField(record.validation) ||
      false,
    validation,
  });
}

function collectFormFieldsFromSchema(
  value: unknown,
  usedKeys: Set<string>,
): FormFieldDefinition[] {
  const entries = Array.isArray(value)
    ? value
    : value && typeof value === "object"
      ? Object.entries(value as Record<string, unknown>).map(([key, field]) =>
          field && typeof field === "object" && !Array.isArray(field)
            ? { key, ...(field as Record<string, unknown>) }
            : { key, label: key, type: field },
        )
      : [];

  return entries
    .map((entry, index) => normalizeFormSchemaField(entry, usedKeys, index + 1))
    .filter((field): field is FormFieldDefinition => Boolean(field));
}

function collectFormFieldsFromChildren(
  nodes: CanvasElement[],
  usedKeys: Set<string>,
): FormFieldDefinition[] {
  const fields: FormFieldDefinition[] = [];

  const visit = (items: CanvasElement[]) => {
    items.forEach((node, index) => {
      const normalizedType = normalizeFormElementType(node.type);
      if (
        ["input", "textarea", "select", "checkbox", "radio"].includes(
          normalizedType,
        )
      ) {
        const field = buildDynamicFieldFromElement(
          node,
          usedKeys,
          fields.length + index + 1,
        );
        if (field) {
          fields.push(field);
        }
      }

      if (node.children && node.children.length > 0) {
        visit(node.children);
      }
    });
  };

  visit(nodes);
  return fields;
}

function formFieldKeySet(fields: FormFieldDefinition[]): Set<string> {
  return new Set(fields.map((field) => sanitizeString(field.key)).filter(Boolean));
}

function normalizeCanvasFormFieldReference(
  value: string | undefined,
  fields: FormFieldDefinition[],
): string | undefined {
  const key = sanitizeString(value);
  return key && formFieldKeySet(fields).has(key) ? key : undefined;
}

function normalizeCanvasContactShare(
  contactShare: FormDefinition["contactShare"],
  fields: FormFieldDefinition[],
): FormDefinition["contactShare"] {
  if (!contactShare?.enabled) {
    return undefined;
  }

  const nameField = normalizeCanvasFormFieldReference(contactShare.nameField, fields);
  const emailField = normalizeCanvasFormFieldReference(contactShare.emailField, fields);
  const phoneField = normalizeCanvasFormFieldReference(contactShare.phoneField, fields);
  const notesField = normalizeCanvasFormFieldReference(contactShare.notesField, fields);

  return {
    enabled: true,
    ...(nameField ? { nameField } : {}),
    ...(emailField ? { emailField } : {}),
    ...(phoneField ? { phoneField } : {}),
    ...(notesField ? { notesField } : {}),
    dedupeByEmail: Boolean(emailField) && contactShare.dedupeByEmail !== false,
  };
}

function normalizeCanvasCollectionFieldMap(
  fieldMap: Record<string, string> | undefined,
  fields: FormFieldDefinition[],
): Record<string, string> | undefined {
  const allowedFieldKeys = formFieldKeySet(fields);
  const normalized = Object.fromEntries(Object.entries(fieldMap || {}).flatMap(([sourceField, targetField]) => {
    const sourceKey = sanitizeString(sourceField);
    const targetKey = sanitizeString(targetField);
    if (!sourceKey || !targetKey || !allowedFieldKeys.has(sourceKey)) {
      return [];
    }
    return [[sourceKey, targetKey]];
  }));

  return Object.keys(normalized).length > 0 ? normalized : undefined;
}

function normalizeCanvasCollectionTarget(
  collectionTarget: FormDefinition["collectionTarget"],
  fields: FormFieldDefinition[],
): FormDefinition["collectionTarget"] {
  if (!collectionTarget?.enabled) {
    return undefined;
  }

  const collectionId = sanitizeString(collectionTarget.collectionId);
  if (!collectionId) {
    return undefined;
  }

  const slugField = normalizeCanvasFormFieldReference(collectionTarget.slugField, fields);
  const fieldMap = normalizeCanvasCollectionFieldMap(collectionTarget.fieldMap, fields);

  return {
    enabled: true,
    collectionId,
    ...(slugField ? { slugField } : {}),
    ...(fieldMap ? { fieldMap } : {}),
  };
}

function normalizeCanvasFormSettings(value: unknown): Record<string, unknown> | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }

  const cloned = clone(value as Record<string, unknown>);
  return Object.keys(cloned).length > 0 ? cloned : undefined;
}

function normalizeCanvasFormConsentSettings(value: unknown): FormDefinition["consentSettings"] {
  const record = normalizeCanvasFormSettings(value);
  if (!record) {
    return undefined;
  }

  const settings: NonNullable<FormDefinition["consentSettings"]> = {};
  const policyLabel = sanitizeString(record.policyLabel);
  const retentionDays = parseNumberValue(record.retentionDays);
  const deleteAfterDays = parseNumberValue(record.deleteAfterDays);
  const requestEmail = sanitizeString(record.requestEmail);

  if (policyLabel) settings.policyLabel = policyLabel;
  if (retentionDays && retentionDays > 0) settings.retentionDays = Math.floor(retentionDays);
  if (deleteAfterDays && deleteAfterDays > 0) settings.deleteAfterDays = Math.floor(deleteAfterDays);
  if (requestEmail) settings.requestEmail = requestEmail;
  if (Object.prototype.hasOwnProperty.call(record, "exportIncludesIp")) {
    settings.exportIncludesIp = parseBooleanInput(record.exportIncludesIp, false);
  }

  return Object.keys(settings).length > 0 ? settings : undefined;
}

function buildFormDefinitionFromCanvas(
  formElement: CanvasElement,
  context: {
    siteId: string;
    pageId?: string;
    postId?: string;
  },
): FormDefinition | null {
  const props = formElement.props as Record<string, unknown>;
  const usedFieldKeys = new Set<string>();
  const fields = [
    ...collectFormFieldsFromSchema(
      props.fields || props.formFields || props.schema,
      usedFieldKeys,
    ),
    ...collectFormFieldsFromChildren(formElement.children || [], usedFieldKeys),
  ];
  const resolvedFormId =
    sanitizeString(props.formId).length > 0
      ? sanitizeString(props.formId)
      : formElement.id;
  if (!resolvedFormId.length) {
    return null;
  }

  const moderationMode =
    sanitizeString(props.moderationMode) === "auto-approve"
      ? "auto-approve"
      : "manual";
  const formAudience = sanitizeString(props.formAudience);
  const audience: FormDefinition["audience"] =
    formAudience === "authenticated" || formAudience === "adminOnly"
      ? formAudience
      : "public";

  const enabledContactShare =
    props.contactShareEnabled === true ||
    sanitizeString(props.contactShareEnabled).toLowerCase() === "true";
  const rawContactShare: FormDefinition["contactShare"] = enabledContactShare
    ? {
        enabled: true,
        nameField: sanitizeString(props.contactShareNameField),
        emailField: sanitizeString(props.contactShareEmailField),
        phoneField: sanitizeString(props.contactSharePhoneField),
        notesField: sanitizeString(props.contactShareNotesField),
        dedupeByEmail:
          props.contactShareDedupeByEmail !== false &&
          sanitizeString(props.contactShareDedupeByEmail).toLowerCase() !==
            "false",
      }
    : undefined;
  const rawCollectionTarget: FormDefinition["collectionTarget"] =
    props.collectionWriteEnabled === true ||
    sanitizeString(props.collectionWriteEnabled).toLowerCase() === "true"
      ? {
          enabled: true,
          collectionId: sanitizeString(
            props.collectionWriteCollectionId || props.collectionId,
          ),
          slugField: sanitizeString(props.collectionWriteSlugField),
          fieldMap: parseFieldMap(props.collectionWriteFieldMap),
        }
      : undefined;

  return {
    id: resolvedFormId,
    siteId: context.siteId,
    pageId: context.pageId || null,
    postId: context.postId || null,
    name:
      sanitizeString(props.formName).length > 0
        ? sanitizeString(props.formName)
        : resolvedFormId,
    title: sanitizeString(props.formTitle) || `Form ${resolvedFormId}`,
    description: sanitizeString(props.formDescription),
    audience,
    isActive:
      props.formActive !== false &&
      sanitizeString(props.formActive).toLowerCase() !== "false",
    fields,
    notificationEmail: sanitizeString(props.notificationEmail),
    successRedirectUrl: sanitizeString(
      props.successRedirectUrl || props.redirectUrl,
    ),
    successMessage: sanitizeString(props.successMessage),
    enableHoneypot:
      props.enableHoneypot === true
        ? true
        : props.enableHoneypot === false
          ? false
          : sanitizeString(props.enableHoneypot).toLowerCase() === "true"
            ? true
            : undefined,
    enableCaptcha:
      props.enableCaptcha === true
        ? true
        : props.enableCaptcha === false
          ? false
          : sanitizeString(props.enableCaptcha).toLowerCase() === "true"
            ? true
            : undefined,
    notificationWebhook: sanitizeString(props.notificationWebhook),
    moderationMode,
    contactShare: normalizeCanvasContactShare(rawContactShare, fields),
    collectionTarget: normalizeCanvasCollectionTarget(rawCollectionTarget, fields),
    consentSettings: normalizeCanvasFormConsentSettings(props.consentSettings),
    settings: normalizeCanvasFormSettings(props.settings),
    createdBy: "admin",
    updatedBy: "admin",
    createdAt: nowIso,
    updatedAt: nowIso,
  };
}

function listCanvasFormsFromContent(
  nodes: CanvasElement[],
  siteId: string,
  context: { pageId?: string; postId?: string },
): FormDefinition[] {
  const forms: FormDefinition[] = [];

  const walk = (items: CanvasElement[]) => {
    items.forEach((item) => {
      if (normalizeFormElementType(item.type) === "form") {
        const form = buildFormDefinitionFromCanvas(item, {
          siteId,
          pageId: context.pageId,
          postId: context.postId,
        });

        if (form) {
          forms.push(form);
        }
      }

      if (item.children && item.children.length > 0) {
        walk(item.children);
      }
    });
  };

  walk(nodes);
  return forms;
}

function getDynamicFormsBySite(siteId: string): FormDefinition[] {
  const pages = PAGE_LIST.filter((page) => page.siteId === siteId);
  const blogPosts = BLOG_POSTS.filter((post) => post.siteId === siteId);

  const pageForms = pages.flatMap((page) => {
    const elements = page.content?.elements || [];
    return listCanvasFormsFromContent(elements, siteId, { pageId: page.id });
  });

  const postForms = blogPosts.flatMap((post) => {
    const content = post.content as Record<string, unknown>;
    const candidate =
      content &&
      typeof content === "object" &&
      Array.isArray((content as { elements?: unknown }).elements)
        ? (content as { elements: CanvasElement[] }).elements
        : [];

    return listCanvasFormsFromContent(candidate, siteId, { postId: post.id });
  });

  return [...pageForms, ...postForms];
}

function mergeFormDefinitions(
  staticForms: FormDefinition[],
  dynamicForms: FormDefinition[],
): FormDefinition[] {
  const merged = new Map<string, FormDefinition>();

  staticForms.forEach((form) => {
    merged.set(normalizeIdentifier(form.id), form);
  });

  dynamicForms.forEach((form) => {
    merged.set(normalizeIdentifier(form.id), form);
  });

  return Array.from(merged.values());
}

function matchesFormContextFilter(
  form: FormDefinition,
  filters: { pageId?: string; postId?: string },
): boolean {
  const pageIdMatch =
    !filters.pageId ||
    !form.pageId ||
    normalizeIdentifier(form.pageId) === normalizeIdentifier(filters.pageId);
  const postIdMatch =
    !filters.postId ||
    !form.postId ||
    normalizeIdentifier(form.postId) === normalizeIdentifier(filters.postId);

  return pageIdMatch && postIdMatch;
}

function sanitizeString(value: unknown): string {
  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }

  if (typeof value === "string") {
    return value.trim();
  }

  if (typeof value === "boolean") {
    return value ? "on" : "";
  }

  if (Array.isArray(value)) {
    return value
      .map((item) => sanitizeString(item))
      .filter(Boolean)
      .join(",");
  }

  return "";
}

function normalizeSlugInput(value: unknown, fallback = "untitled"): string {
  const raw = sanitizeString(value) || fallback;
  const normalized = raw
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return normalized || fallback;
}

function createRuntimeId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function toRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

/** Preserve extensible JSON metadata without admitting prototype mutation keys. */
function safeIncomingContentMeta(value: Record<string, unknown>): BackyJsonObject {
  const safeValue = (input: unknown): unknown => {
    if (Array.isArray(input)) return input.map(safeValue);
    if (!input || typeof input !== "object") return input;
    return Object.fromEntries(Object.entries(Object.getOwnPropertyDescriptors(input))
      .filter(([key, descriptor]) => !["__proto__", "prototype", "constructor"].includes(key) && "value" in descriptor)
      .map(([key, descriptor]) => [key, safeValue(descriptor.value)]));
  };
  return normalizeBackyJsonObject(safeValue(value));
}

function normalizeFrontendDesignMetaFields(
  metaInput: Record<string, unknown>,
  current?: PageMeta,
): Pick<
  PageMeta,
  | "frontendDesignTemplateId"
  | "templateSource"
  | "templateSourceLabel"
  | "backyCanvasTemplateId"
  | "frontendDesignTemplateName"
  | "frontendDesignSource"
  | "frontendDesignRoutePattern"
  | "frontendDesignTokens"
  | "frontendDesignChrome"
  | "frontendDesignCustomCss"
  | "frontendDesignCustomJs"
  | "frontendDesignContentDocument"
  | "frontendDesignElements"
  | "frontendDesignCanvasSize"
  | "frontendDesignThemeTokenRefs"
  | "frontendDesignAssets"
  | "frontendDesignAnimations"
  | "frontendDesignInteractions"
  | "frontendDesignDataBindings"
  | "frontendDesignEditableMap"
  | "frontendDesignSeo"
  | "frontendDesignMetadata"
  | "frontendDesignBindingHints"
> {
  const valueFor = (key: keyof PageMeta): unknown => {
    const incoming = metaInput[key];
    if (incoming === undefined && current) return current[key];
    return incoming;
  };
  const stringField = (key: keyof PageMeta): string | null => {
    const value = valueFor(key);
    return sanitizeString(value) || null;
  };
  const recordField = (key: keyof PageMeta): Record<string, unknown> | null => {
    const value = valueFor(key);
    return isObjectRecord(value) ? clone(value) : null;
  };
  const arrayField = (key: keyof PageMeta): unknown[] | undefined => {
    const value = valueFor(key);
    return Array.isArray(value) ? clone(value) : undefined;
  };
  const arrayOrRecordField = (key: keyof PageMeta): unknown[] | Record<string, unknown> | undefined => {
    const value = valueFor(key);
    if (Array.isArray(value) || isObjectRecord(value)) return clone(value);
    return undefined;
  };
  const recordArrayField = (
    key: keyof PageMeta,
  ): Array<Record<string, unknown>> | undefined => {
    const value = valueFor(key);
    return Array.isArray(value) ? value.filter(isObjectRecord).map(clone) : undefined;
  };

  return {
    templateSource: stringField("templateSource"),
    templateSourceLabel: stringField("templateSourceLabel"),
    backyCanvasTemplateId: stringField("backyCanvasTemplateId"),
    frontendDesignTemplateId: stringField("frontendDesignTemplateId"),
    frontendDesignTemplateName: stringField("frontendDesignTemplateName"),
    frontendDesignSource: recordField("frontendDesignSource"),
    frontendDesignRoutePattern: stringField("frontendDesignRoutePattern"),
    frontendDesignTokens: recordField("frontendDesignTokens"),
    frontendDesignChrome: recordField("frontendDesignChrome"),
    frontendDesignCustomCss: stringField("frontendDesignCustomCss"),
    frontendDesignCustomJs: stringField("frontendDesignCustomJs"),
    frontendDesignContentDocument: recordField("frontendDesignContentDocument"),
    frontendDesignElements: arrayField("frontendDesignElements"),
    frontendDesignCanvasSize: recordField("frontendDesignCanvasSize"),
    frontendDesignThemeTokenRefs: recordField("frontendDesignThemeTokenRefs"),
    frontendDesignAssets: arrayOrRecordField("frontendDesignAssets"),
    frontendDesignAnimations: arrayOrRecordField("frontendDesignAnimations"),
    frontendDesignInteractions: arrayOrRecordField("frontendDesignInteractions"),
    frontendDesignDataBindings: recordField("frontendDesignDataBindings"),
    frontendDesignEditableMap: recordField("frontendDesignEditableMap"),
    frontendDesignSeo: recordField("frontendDesignSeo"),
    frontendDesignMetadata: recordField("frontendDesignMetadata"),
    frontendDesignBindingHints: recordArrayField("frontendDesignBindingHints"),
  };
}

function toJsonObjectArray(
  value: unknown,
): Array<Record<string, unknown>> | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }

  return value
    .filter(
      (entry): entry is Record<string, unknown> =>
        typeof entry === "object" && entry !== null && !Array.isArray(entry),
    )
    .map(clone);
}

function toStringRecord(value: unknown): Record<string, string> {
  return Object.entries(toRecord(value)).reduce<Record<string, string>>(
    (acc, [key, entry]) => {
      const parsed = sanitizeString(entry);
      if (parsed) {
        acc[key] = parsed;
      }
      return acc;
    },
    {},
  );
}

function parseBooleanInput(value: unknown, fallback = false): boolean {
  if (typeof value === "boolean") return value;
  const normalized = sanitizeString(value).toLowerCase();
  if (normalized === "true" || normalized === "1" || normalized === "yes")
    return true;
  if (normalized === "false" || normalized === "0" || normalized === "no")
    return false;
  return fallback;
}

function parseStatusInput<T extends string>(
  value: unknown,
  allowed: readonly T[],
  fallback: T,
): T {
  const normalized = sanitizeString(value).toLowerCase();
  return allowed.includes(normalized as T) ? (normalized as T) : fallback;
}

const CONTENT_REVISION_RESTORE_TARGET_PATTERN = /\b(?:rollback|restore)\s+to\s+([a-zA-Z0-9_-]+)/i;

function getLatestContentRevisionId(
  siteId: string,
  targetType: ContentRevision["targetType"],
  targetId: string,
): string | null {
  return CONTENT_REVISIONS.find(
    (revision) =>
      revision.siteId === siteId &&
      revision.targetType === targetType &&
      revision.targetId === targetId,
  )?.id || null;
}

function restoreTargetRevisionIdFromNote(note?: string | null): string | null {
  return note?.match(CONTENT_REVISION_RESTORE_TARGET_PATTERN)?.[1] || null;
}

function inferContentRevisionOperation(
  operation: string | null | undefined,
  note: string | null | undefined,
  restoreTargetRevisionId: string | null,
): string {
  if (operation?.trim()) return operation.trim();
  if (restoreTargetRevisionId) return "rollback";
  const normalized = (note || "").toLowerCase();
  if (normalized.includes("publish")) return "publish";
  if (normalized.includes("archive")) return "archive";
  if (normalized.includes("rollback") || normalized.includes("restore")) return "rollback";
  if (normalized.includes("migration") || normalized.includes("migrate")) return "migration";
  return "update";
}

function createContentRevision(
  targetType: ContentRevision["targetType"],
  snapshot: StorePage | StoreBlogPost,
  note?: string | null,
  createdBy?: string | null,
  options: {
    parentRevisionId?: string | null;
    operation?: string | null;
    restoreTargetRevisionId?: string | null;
    metadata?: Record<string, unknown> | null;
  } = {},
): ContentRevision {
  const normalizedNote = note || null;
  const parentRevisionId = options.parentRevisionId === undefined
    ? getLatestContentRevisionId(snapshot.siteId, targetType, snapshot.id)
    : options.parentRevisionId || null;
  const restoreTargetRevisionId =
    options.restoreTargetRevisionId || restoreTargetRevisionIdFromNote(normalizedNote);
  const operation = inferContentRevisionOperation(options.operation, normalizedNote, restoreTargetRevisionId);
  const revision: ContentRevision = {
    id: createRuntimeId("rev"),
    siteId: snapshot.siteId,
    targetType,
    targetId: snapshot.id,
    snapshot: clone(snapshot),
    note: normalizedNote,
    parentRevisionId,
    operation,
    restoreTargetRevisionId,
    metadata: {
      ...(options.metadata || {}),
      schemaVersion: "backy.content-revision-metadata.v1",
      operation,
      parentRevisionId,
      restoreTargetRevisionId,
      targetType,
      targetId: snapshot.id,
    },
    createdBy: createdBy || "admin",
    createdAt: new Date().toISOString(),
  };

  CONTENT_REVISIONS.unshift(revision);
  return revision;
}

function prunePreviewTokens() {
  const now = Date.now();
  for (let index = PREVIEW_TOKENS.length - 1; index >= 0; index -= 1) {
    if (Date.parse(PREVIEW_TOKENS[index].expiresAt) <= now) {
      PREVIEW_TOKENS.splice(index, 1);
    }
  }
}

function removePreviewTokensForTarget(
  siteId: string,
  targetType: PreviewToken["targetType"],
  targetId: string,
) {
  for (let index = PREVIEW_TOKENS.length - 1; index >= 0; index -= 1) {
    const token = PREVIEW_TOKENS[index];
    if (
      token.siteId === siteId &&
      token.targetType === targetType &&
      token.targetId === targetId
    ) {
      PREVIEW_TOKENS.splice(index, 1);
    }
  }
}

function refreshPersistedPreviewTokens() {
  if (!existsSync(ADMIN_CONTENT_PATH)) {
    return;
  }

  try {
    const parsed = JSON.parse(
      readFileSync(ADMIN_CONTENT_PATH, "utf8"),
    ) as AdminContentSnapshot;
    if (Array.isArray(parsed.previewTokens)) {
      PREVIEW_TOKENS.splice(0, PREVIEW_TOKENS.length, ...parsed.previewTokens);
    }
  } catch (error) {
    console.error("Unable to refresh preview tokens:", error);
  }
}

export function createPreviewToken(
  siteId: string,
  targetType: PreviewToken["targetType"],
  targetId: string,
  ttlSeconds = 3600,
  createdBy = "admin",
): PreviewToken {
  ensurePersistedAdminContentLoaded();
  prunePreviewTokens();

  const now = Date.now();
  const boundedTtlSeconds = Math.min(
    Math.max(Math.floor(ttlSeconds) || 3600, 60),
    60 * 60 * 24,
  );
  const previewToken: PreviewToken = {
    token: `preview_${randomUUID()}`,
    siteId,
    targetType,
    targetId,
    createdAt: new Date(now).toISOString(),
    expiresAt: new Date(now + boundedTtlSeconds * 1000).toISOString(),
    createdBy: createdBy || "admin",
  };

  PREVIEW_TOKENS.unshift(previewToken);
  persistAdminContent();
  return clone(previewToken);
}

export function validatePreviewToken(
  siteId: string,
  targetType: PreviewToken["targetType"],
  targetId: string,
  token: string | null | undefined,
): boolean {
  ensurePersistedAdminContentLoaded();
  refreshPersistedPreviewTokens();

  if (!token) {
    return false;
  }

  prunePreviewTokens();

  return PREVIEW_TOKENS.some(
    (entry) =>
      entry.siteId === siteId &&
      entry.targetType === targetType &&
      entry.targetId === targetId &&
      entry.token === token,
  );
}

const MEDIA_REFERENCE_ID_KEYS = new Set([
  "assetId",
  "mediaIds",
  "mediaId",
  "fileIds",
  "fileId",
  "fileMediaIds",
  "fileMediaId",
  "downloadMediaIds",
  "downloadMediaId",
  "imageIds",
  "imageId",
  "videoIds",
  "videoId",
  "audioIds",
  "audioId",
  "fontIds",
  "fontId",
  "documentIds",
  "documentId",
  "iconIds",
  "iconId",
  "fontMediaIds",
  "fontMediaId",
  "fallbackImageMediaIds",
  "fallbackImageMediaId",
  "backgroundMediaIds",
  "backgroundMediaId",
  "posterMediaIds",
  "posterMediaId",
]);

const MEDIA_REFERENCE_ASSET_COLLECTION_KEYS = new Set([
  "media",
  "fonts",
  "images",
  "videos",
  "audio",
  "documents",
  "icons",
  "files",
]);

type MediaReferenceBindingScope = "page" | "post" | "collectionRecord";

interface MediaReferenceBindingRecord {
  id: string;
  mediaId: string;
  scope: MediaReferenceBindingScope;
  targetId: string;
  usageType: string;
  attachedBy: string | null;
  createdAt?: string;
  updatedAt?: string;
  collectionId?: string;
}

function collectMediaReferenceIds(value: unknown): Set<string> {
  const references = new Set<string>();

  const addReference = (entry: unknown) => {
    const id = sanitizeString(entry);
    if (id) {
      references.add(id);
    }
  };

  const visit = (entry: unknown, key?: string, parentKey?: string) => {
    if (!entry) {
      return;
    }

    if (key && MEDIA_REFERENCE_ID_KEYS.has(key)) {
      if (Array.isArray(entry)) {
        entry.forEach(addReference);
      } else {
        addReference(entry);
      }
      return;
    }

    if (Array.isArray(entry)) {
      if (key === "assetIds") {
        entry.forEach(addReference);
        return;
      }

      entry.forEach((item) => visit(item, undefined, key));
      return;
    }

    if (typeof entry !== "object") {
      return;
    }

    const record = entry as Record<string, unknown>;
    if (parentKey && MEDIA_REFERENCE_ASSET_COLLECTION_KEYS.has(parentKey)) {
      addReference(record.id);
    }

    Object.entries(record).forEach(([entryKey, entryValue]) => {
      visit(entryValue, entryKey, key);
    });
  };

  visit(value);
  return references;
}

function syncMediaReferencesForTarget(
  siteId: string,
  targetType: "page" | "post",
  targetId: string,
  content: unknown,
  additionalMediaIds: string[] = [],
) {
  ensurePersistedMediaLoaded();

  const referenceIds = collectMediaReferenceIds(content);
  additionalMediaIds
    .map(sanitizeString)
    .filter(Boolean)
    .forEach((id) => referenceIds.add(id));
  let changed = false;

  MEDIA_LIBRARY.forEach((item, index) => {
    if (item.siteId !== siteId) {
      return;
    }

    const key = targetType === "page" ? "pageIds" : "postIds";
    const currentRefs = item[key] || [];
    const shouldReference = referenceIds.has(item.id);
    const hasReference = currentRefs.includes(targetId);

    if (shouldReference === hasReference) {
      return;
    }

    MEDIA_LIBRARY[index] = {
      ...item,
      [key]: shouldReference
        ? [...currentRefs, targetId]
        : currentRefs.filter((id) => id !== targetId),
      updatedAt: new Date().toISOString(),
    };
    changed = true;
  });

  if (changed) {
    persistRuntimeMediaCatalog();
  }
}

function mediaReferencePayloadForContent(
  content: unknown,
  meta: unknown,
): Record<string, unknown> {
  return { content, meta };
}

function mediaReferenceBindingRecords(value: unknown): MediaReferenceBindingRecord[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .filter((entry): entry is Record<string, unknown> =>
      Boolean(entry) && typeof entry === "object" && !Array.isArray(entry),
    )
	    .map((entry): MediaReferenceBindingRecord | null => {
	      const scope: MediaReferenceBindingScope | null =
	        entry.scope === "page" ||
	        entry.scope === "post" ||
	        entry.scope === "collectionRecord"
	          ? entry.scope
	          : null;
      const targetId = sanitizeString(entry.targetId);
      if (!scope || !targetId) {
        return null;
      }

	      const binding: MediaReferenceBindingRecord = {
	        id: sanitizeString(entry.id) || createRuntimeId("binding"),
	        mediaId: sanitizeString(entry.mediaId),
	        scope,
        targetId,
        usageType: sanitizeString(entry.usageType) || "content",
        attachedBy: sanitizeString(entry.attachedBy) || null,
        createdAt: sanitizeString(entry.createdAt) || undefined,
        updatedAt: sanitizeString(entry.updatedAt) || undefined,
	        ...(sanitizeString(entry.collectionId)
	          ? { collectionId: sanitizeString(entry.collectionId) }
	          : {}),
	      };
	      return binding;
	    })
    .filter((entry): entry is MediaReferenceBindingRecord => Boolean(entry));
}

function isCollectionRecordMediaBinding(
  binding: MediaReferenceBindingRecord,
  collectionId: string,
  recordId: string,
): boolean {
  return (
    binding.scope === "collectionRecord" &&
    binding.targetId === recordId &&
    (!binding.collectionId || binding.collectionId === collectionId)
  );
}

function syncMediaReferencesForCollectionRecord(
  siteId: string,
  collectionId: string,
  recordId: string,
  values: unknown,
) {
  ensurePersistedMediaLoaded();

  const referenceIds = collectMediaReferenceIds(values);
  let changed = false;

  MEDIA_LIBRARY.forEach((item, index) => {
    if (item.siteId !== siteId) {
      return;
    }

    const currentBindings = mediaReferenceBindingRecords(item.metadata?.bindings);
    const existingBinding = currentBindings.find((binding) =>
      isCollectionRecordMediaBinding(binding, collectionId, recordId),
    );
    const shouldReference = referenceIds.has(item.id);

    if (shouldReference && existingBinding) {
      return;
    }

    const nextBindings = shouldReference
      ? [
          ...currentBindings,
          {
            id: `binding_${item.id}_${collectionId}_${recordId}`,
            mediaId: item.id,
            scope: "collectionRecord" as const,
            targetId: recordId,
            collectionId,
            usageType: "collection-record",
            attachedBy: "backy-store",
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },
        ]
      : currentBindings.filter(
          (binding) =>
            !isCollectionRecordMediaBinding(binding, collectionId, recordId),
        );

    MEDIA_LIBRARY[index] = {
      ...item,
      metadata: {
        ...(item.metadata || {}),
        bindings: nextBindings,
      },
      updatedAt: new Date().toISOString(),
    };
    changed = true;
  });

  if (changed) {
    persistRuntimeMediaCatalog();
  }
}

function removeMediaReferencesForCollectionRecord(
  siteId: string,
  collectionId: string,
  recordId: string,
) {
  ensurePersistedMediaLoaded();

  let changed = false;

  MEDIA_LIBRARY.forEach((item, index) => {
    if (item.siteId !== siteId) {
      return;
    }

    const currentBindings = mediaReferenceBindingRecords(item.metadata?.bindings);
    const nextBindings = currentBindings.filter(
      (binding) => !isCollectionRecordMediaBinding(binding, collectionId, recordId),
    );

    if (nextBindings.length === currentBindings.length) {
      return;
    }

    MEDIA_LIBRARY[index] = {
      ...item,
      metadata: {
        ...(item.metadata || {}),
        bindings: nextBindings,
      },
      updatedAt: new Date().toISOString(),
    };
    changed = true;
  });

  if (changed) {
    persistRuntimeMediaCatalog();
  }
}

function removeMediaReferencesForTarget(
  siteId: string,
  targetType: "page" | "post",
  targetId: string,
) {
  ensurePersistedMediaLoaded();

  let changed = false;
  const key = targetType === "page" ? "pageIds" : "postIds";

  MEDIA_LIBRARY.forEach((item, index) => {
    if (item.siteId !== siteId || !item[key]?.includes(targetId)) {
      return;
    }

    MEDIA_LIBRARY[index] = {
      ...item,
      [key]: item[key].filter((id) => id !== targetId),
      updatedAt: new Date().toISOString(),
    };
    changed = true;
  });

  if (changed) {
    persistRuntimeMediaCatalog();
  }
}

function getValueAsString(
  values: Record<string, unknown>,
  key: string,
): string {
  return sanitizeString(values[key] || "");
}

function submissionValidationDetail(
  field: FormFieldDefinition,
  code: string,
  message: string,
): SubmissionValidationDetail {
  return {
    field: field.key,
    code,
    message,
    ...(field.label && field.label !== field.key ? { label: field.label } : {}),
  };
}

function isEmptySubmissionValue(
  field: FormFieldDefinition,
  value: unknown,
): boolean {
  if (field.type === "file") {
    if (Array.isArray(value)) return value.length === 0;
    if (value && typeof value === "object") {
      const record = value as Record<string, unknown>;
      return !(
        sanitizeString(record.id) ||
        sanitizeString(record.mediaId) ||
        sanitizeString(record.assetId) ||
        sanitizeString(record.url) ||
        sanitizeString(record.signedUrl)
      );
    }
  }

  if (field.type === "checkbox") {
    if (typeof value === "boolean") return value !== true;
    if (Array.isArray(value)) return value.length === 0;
    const normalized = sanitizeString(value).toLowerCase();
    return (
      !normalized ||
      normalized === "false" ||
      normalized === "off" ||
      normalized === "0" ||
      normalized === "no"
    );
  }

  if (Array.isArray(value)) {
    return parseSubmissionValues(value).length === 0;
  }

  return sanitizeString(value).length === 0;
}

function isValidDateSubmissionValue(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }

  const [year, month, day] = value.split("-").map((part) => Number(part));
  if (!year || !month || !day) {
    return false;
  }

  const parsed = new Date(Date.UTC(year, month - 1, day));
  return (
    parsed.getUTCFullYear() === year &&
    parsed.getUTCMonth() === month - 1 &&
    parsed.getUTCDate() === day
  );
}

function isValidTelSubmissionValue(value: string): boolean {
  const digits = value.replace(/\D/g, "");
  return (
    digits.length >= 7 && digits.length <= 20 && /^[+()\d\s.-]+$/.test(value)
  );
}

function isValidFileSubmissionReference(value: unknown): boolean {
  if (Array.isArray(value)) {
    return value.length > 0 && value.every(isValidFileSubmissionReference);
  }

  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    const reference =
      sanitizeString(record.id) ||
      sanitizeString(record.mediaId) ||
      sanitizeString(record.assetId) ||
      sanitizeString(record.url) ||
      sanitizeString(record.signedUrl);
    return Boolean(reference) && reference.length <= 2048;
  }

  const reference = sanitizeString(value);
  return Boolean(reference) && reference.length <= 2048;
}

function validateIntrinsicSubmissionField(
  field: FormFieldDefinition,
  fieldLabel: string,
  value: unknown,
): SubmissionValidationDetail | null {
  const sanitized = sanitizeString(value);

  if (field.type === "email" && sanitized.length > 0) {
    const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailPattern.test(sanitized)) {
      return submissionValidationDetail(
        field,
        "invalid_email",
        `${fieldLabel} must be a valid email`,
      );
    }
  }

  if (field.type === "url" && sanitized.length > 0) {
    try {
      const parsedUrl = new URL(sanitized);
      if (parsedUrl.protocol !== "http:" && parsedUrl.protocol !== "https:") {
        return submissionValidationDetail(
          field,
          "invalid_url",
          `${fieldLabel} must be a valid URL`,
        );
      }
    } catch {
      return submissionValidationDetail(
        field,
        "invalid_url",
        `${fieldLabel} must be a valid URL`,
      );
    }
  }

  if (
    field.type === "number" &&
    sanitized.length > 0 &&
    !Number.isFinite(Number(sanitized))
  ) {
    return submissionValidationDetail(
      field,
      "invalid_number",
      `${fieldLabel} must be a valid number`,
    );
  }

  if (
    field.type === "date" &&
    sanitized.length > 0 &&
    !isValidDateSubmissionValue(sanitized)
  ) {
    return submissionValidationDetail(
      field,
      "invalid_date",
      `${fieldLabel} must be a valid date`,
    );
  }

  if (
    field.type === "tel" &&
    sanitized.length > 0 &&
    !isValidTelSubmissionValue(sanitized)
  ) {
    return submissionValidationDetail(
      field,
      "invalid_tel",
      `${fieldLabel} must be a valid phone number`,
    );
  }

  if (
    field.type === "file" &&
    !isEmptySubmissionValue(field, value) &&
    !isValidFileSubmissionReference(value)
  ) {
    return submissionValidationDetail(
      field,
      "invalid_file",
      `${fieldLabel} must be a valid file reference`,
    );
  }

  return null;
}

export function normalizeFormSubmissionValues(
  form: Pick<FormDefinition, "fields">,
  values: Record<string, unknown>,
): Record<string, unknown> {
  if (!form.fields || form.fields.length === 0) {
    return {};
  }

  return form.fields.reduce<Record<string, unknown>>((acc, field) => {
    if (Object.prototype.hasOwnProperty.call(values, field.key)) {
      acc[field.key] = values[field.key];
    }
    return acc;
  }, {});
}

function evaluateValidationRule(
  field: FormFieldDefinition,
  fieldLabel: string,
  rule: { type: string; value?: string | number; message?: string },
  value: unknown,
): SubmissionValidationDetail | null {
  const trimmed = sanitizeString(value);

  if (rule.type === "required") {
    if (isEmptySubmissionValue(field, value)) {
      return submissionValidationDetail(
        field,
        "required",
        rule.message || `${fieldLabel} is required`,
      );
    }
    return null;
  }

  if (!trimmed) {
    return null;
  }

  if (rule.type === "minLength") {
    const minLength = Number(rule.value);
    if (Number.isFinite(minLength) && trimmed.length < minLength) {
      return submissionValidationDetail(
        field,
        "min_length",
        rule.message ||
          `${fieldLabel} must be at least ${minLength} characters`,
      );
    }
    return null;
  }

  if (rule.type === "maxLength") {
    const maxLength = Number(rule.value);
    if (Number.isFinite(maxLength) && trimmed.length > maxLength) {
      return submissionValidationDetail(
        field,
        "max_length",
        rule.message ||
          `${fieldLabel} must be no more than ${maxLength} characters`,
      );
    }
    return null;
  }

  if (rule.type === "pattern") {
    if (!rule.value) {
      return null;
    }

    try {
      const regex = new RegExp(String(rule.value));
      if (!regex.test(trimmed)) {
        return submissionValidationDetail(
          field,
          "pattern",
          rule.message || `${fieldLabel} format is invalid`,
        );
      }
    } catch {
      return submissionValidationDetail(
        field,
        "invalid_pattern",
        `${fieldLabel} validation pattern is invalid`,
      );
    }
    return null;
  }

  if (rule.type === "min" || rule.type === "max") {
    const numeric = Number(trimmed);
    const compare = Number(rule.value);

    if (!Number.isFinite(numeric) || !Number.isFinite(compare)) {
      return null;
    }

    if (rule.type === "min" && numeric < compare) {
      return submissionValidationDetail(
        field,
        "min",
        rule.message || `${fieldLabel} must be at least ${compare}`,
      );
    }

    if (rule.type === "max" && numeric > compare) {
      return submissionValidationDetail(
        field,
        "max",
        rule.message || `${fieldLabel} must be no more than ${compare}`,
      );
    }
    return null;
  }

  return null;
}

function validateSubmissionValues(
  form: FormDefinition,
  values: Record<string, unknown>,
): SubmissionValidationDetail[] {
  const details: SubmissionValidationDetail[] = [];

  if (!form.fields || form.fields.length === 0) {
    return details;
  }

  form.fields.forEach((field) => {
    const fieldLabel = field.label || field.key;
    const fieldValue = values[field.key];
    const normalizedAllowedOptions = normalizeFieldOptions(field.options);
    const submittedValues =
      parseSubmissionValues(fieldValue).map(sanitizeString);
    const normalizedSubmittedValues = submittedValues.map((value) =>
      value.toLowerCase(),
    );

    if (field.required && isEmptySubmissionValue(field, fieldValue)) {
      details.push(
        submissionValidationDetail(
          field,
          "required",
          `${fieldLabel} is required`,
        ),
      );
      return;
    }

    if (
      (field.type === "select" || field.type === "radio") &&
      normalizedSubmittedValues.length > 0
    ) {
      const selectedValue = normalizedSubmittedValues[0] || "";
      const matched = normalizedAllowedOptions.includes(selectedValue);
      if (!matched) {
        details.push(
          submissionValidationDetail(
            field,
            "invalid_option",
            `${fieldLabel} value is not a valid option`,
          ),
        );
      }
    }

    if (
      field.type === "checkbox" &&
      normalizedSubmittedValues.length > 0 &&
      normalizedAllowedOptions.length > 0
    ) {
      const invalid = normalizedSubmittedValues.filter(
        (value) => !normalizedAllowedOptions.includes(value),
      );
      if (invalid.length > 0) {
        details.push(
          submissionValidationDetail(
            field,
            "invalid_options",
            `${fieldLabel} has invalid option selections`,
          ),
        );
      }
    }

    if (
      field.type === "select" &&
      field.required &&
      normalizedAllowedOptions.length === 0
    ) {
      details.push(
        submissionValidationDetail(
          field,
          "missing_options",
          `${fieldLabel} has no available options`,
        ),
      );
      return;
    }

    if (
      field.type === "radio" &&
      submittedValues.length > 0 &&
      normalizedAllowedOptions.length === 0
    ) {
      details.push(
        submissionValidationDetail(
          field,
          "missing_options",
          `${fieldLabel} has no available options`,
        ),
      );
      return;
    }

    const intrinsicViolation = validateIntrinsicSubmissionField(
      field,
      fieldLabel,
      fieldValue,
    );
    if (intrinsicViolation) {
      details.push(intrinsicViolation);
    }

    if (!field.validation || field.validation.length === 0) {
      return;
    }

    for (const validation of field.validation) {
      const violation = evaluateValidationRule(
        field,
        fieldLabel,
        validation,
        fieldValue,
      );

      if (violation) {
        details.push(violation);
      }
    }
  });

  return details;
}

function makeSubmissionSignature(values: Record<string, unknown>) {
  return Object.keys(values)
    .sort()
    .map((key) => `${key}=${sanitizeString(values[key])}`)
    .join("&");
}

function readPositiveNumber(
  value: unknown,
  fallback: number,
  min: number,
  max: number,
): number {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, Math.round(parsed)));
}

function readFormSpamSettings(form: FormDefinition) {
  const settingsRecord = isObjectRecord(form.settings) ? form.settings : {};
  const settingsSpam = isObjectRecord(settingsRecord.spam)
    ? settingsRecord.spam
    : {};
  const directSpam = isObjectRecord(
    (form as { spamSettings?: unknown }).spamSettings,
  )
    ? (form as { spamSettings: Record<string, unknown> }).spamSettings
    : {};
  const merged = { ...settingsSpam, ...directSpam };
  const blockedTerms = Array.isArray(merged.blockedTerms)
    ? merged.blockedTerms.map(sanitizeString).filter(Boolean).slice(0, 100)
    : [];

  return {
    minFillMs: readPositiveNumber(
      merged.minFillMs,
      FORM_SUBMISSION_MIN_FILL_MS,
      0,
      FORM_SPAM_MIN_FILL_MS_MAX,
    ),
    rateLimitWindowMs: readPositiveNumber(
      merged.rateLimitWindowMs,
      SUBMISSION_RATE_WINDOW_MS,
      1_000,
      FORM_SPAM_RATE_WINDOW_MS_MAX,
    ),
    rateLimitMax: readPositiveNumber(
      merged.rateLimitMax,
      SUBMISSION_RATE_LIMIT,
      1,
      1_000,
    ),
    duplicateWindowMs: readPositiveNumber(
      merged.duplicateWindowMs,
      SUBMISSION_SIGNATURE_WINDOW_MS,
      1_000,
      FORM_SPAM_DUPLICATE_WINDOW_MS_MAX,
    ),
    blockedTerms,
  };
}

function submittedValuesContainBlockedTerm(
  values: Record<string, unknown>,
  blockedTerms: string[],
): string | null {
  if (blockedTerms.length === 0) return null;
  const haystack = Object.values(values)
    .flatMap((value) => (Array.isArray(value) ? value : [value]))
    .map((value) => sanitizeString(value).toLowerCase())
    .filter(Boolean)
    .join("\n");

  return (
    blockedTerms.find((term) => haystack.includes(term.toLowerCase())) || null
  );
}

function checkSubmissionSpamSignals(
  form: FormDefinition,
  body: {
    honeypot?: string;
    ipHash?: string | null;
    requestId?: string | null;
    startedAt?: string | number | null;
  },
  values: Record<string, unknown>,
): SpamCheckResult {
  const flags: string[] = [];
  const now = Date.now();
  const spamSettings = readFormSpamSettings(form);

  if (form.enableHoneypot && sanitizeString(body.honeypot).length > 0) {
    return {
      status: "spam",
      flags: ["honeypot"],
      errors: "Spam signal detected: honeypot",
    };
  }

  const startedAt =
    typeof body.startedAt === "number"
      ? body.startedAt
      : body.startedAt
        ? Date.parse(String(body.startedAt))
        : NaN;

  if (Number.isFinite(startedAt) && now - startedAt < spamSettings.minFillMs) {
    flags.push("timing");
    return {
      status: "spam",
      flags,
      errors: "Submission rejected: too quick to be a human response.",
    };
  }

  const blockedTerm = submittedValuesContainBlockedTerm(
    values,
    spamSettings.blockedTerms,
  );
  if (blockedTerm) {
    flags.push("blocked-term");
    return {
      status: "spam",
      flags,
      errors: `Submission contains a blocked term: ${blockedTerm}`,
    };
  }

  const key = getRequestKey(form.siteId, form.id, body.ipHash);
  const rateState = SUBMISSION_RATE_WINDOWS.get(key) || {
    total: 0,
    lastSubmissionAt: null,
  };

  const windowStarted =
    rateState.lastSubmissionAt !== null
      ? now - rateState.lastSubmissionAt <= spamSettings.rateLimitWindowMs
      : false;
  if (!windowStarted) {
    rateState.total = 0;
    rateState.lastSubmissionAt = now;
  }

  rateState.total += 1;
  SUBMISSION_RATE_WINDOWS.set(key, rateState);

  if (rateState.total > spamSettings.rateLimitMax) {
    flags.push("rate-limit");
    return {
      status: "spam",
      flags,
      errors: `Too many submissions. Please wait ${Math.max(1, Math.round(spamSettings.rateLimitWindowMs / 1000))} seconds.`,
    };
  }

  const signature = makeSubmissionSignature(values) || `empty-${now}`;
  const signatureKey = `${key}:signature:${signature}`;
  const signatures = FORM_SUBMISSION_SIGNATURES.get(signatureKey) || [];
  const activeSignatures = signatures.filter(
    (value) => now - value <= spamSettings.duplicateWindowMs,
  );
  if (activeSignatures.length > 0) {
    activeSignatures.push(now);
    FORM_SUBMISSION_SIGNATURES.set(signatureKey, activeSignatures);
    flags.push("duplicate");
    return {
      status: "spam",
      flags,
      errors: "Duplicate submission blocked.",
    };
  }

  activeSignatures.push(now);
  FORM_SUBMISSION_SIGNATURES.set(signatureKey, activeSignatures);

  return {
    status: form.moderationMode === "auto-approve" ? "approved" : "pending",
    flags,
  };
}

function checkCommentSpamSignals(params: {
  siteId: string;
  targetType: CommentTargetType;
  targetId: string;
  content: string;
  authorEmail?: string | null;
  honeypot?: string;
  ipHash?: string | null;
  startedAt?: string | number | null;
  rateLimitBypass?: boolean;
  blockedTerms?: string[];
  /** Database intake checks its persisted identities inside SQL admission. */
  checkBlockedIdentity?: boolean;
}): CommentSpamResult {
  const flags: string[] = [];
  const now = Date.now();
  const normalizedContent = sanitizeString(params.content);

  if (!normalizedContent.length) {
    return {
      ok: false,
      status: "rejected",
      flags: ["validation"],
      errors: "Comment content is required.",
    };
  }

  const blockedActor = params.checkBlockedIdentity === false ? undefined : isCommentBlockedByIdentity(params.siteId, {
    email: params.authorEmail,
    ipHash: params.ipHash,
  });

  if (blockedActor) {
    return {
      ok: false,
      status: "blocked",
      flags: ["blocked-actor"],
      errors: `User blocked: ${blockedActor.reason}`,
    };
  }

  if (normalizedContent.length > 5000) {
    return {
      ok: false,
      status: "rejected",
      flags: ["validation"],
      errors: "Comment content is too long.",
    };
  }

  const normalizedContentForTerms = normalizedContent.toLowerCase();
  const blockedTerm = (params.blockedTerms || [])
    .map((term) => sanitizeString(term).toLowerCase())
    .filter(Boolean)
    .find((term) => normalizedContentForTerms.includes(term));
  if (blockedTerm) {
    return {
      ok: false,
      status: "spam",
      flags: ["blocked-term"],
      errors: `Comment contains a blocked term: ${blockedTerm}`,
    };
  }

  if (params.rateLimitBypass) {
    return {
      ok: true,
      status: "approved",
      flags: [],
    };
  }

  if (params.honeypot && sanitizeString(params.honeypot).length > 0) {
    flags.push("honeypot");
    return {
      ok: false,
      status: "spam",
      flags,
      errors: "Spam signal detected: honeypot.",
    };
  }

  const startedAt =
    typeof params.startedAt === "number"
      ? params.startedAt
      : params.startedAt
        ? Date.parse(String(params.startedAt))
        : NaN;

  if (Number.isFinite(startedAt) && now - startedAt < COMMENT_MIN_FILL_MS) {
    flags.push("timing");
    return {
      ok: false,
      status: "spam",
      flags,
      errors: "Submission rejected: too quick to be a human response.",
    };
  }

  const key = getCommentRequestKey(
    params.siteId,
    params.targetType,
    params.targetId,
    params.ipHash,
  );
  const rateState = COMMENT_RATE_WINDOWS.get(key) || {
    total: 0,
    lastSubmissionAt: null,
  };

  const isWithinWindow =
    rateState.lastSubmissionAt !== null
      ? now - rateState.lastSubmissionAt <= COMMENT_RATE_WINDOW_MS
      : false;

  if (!isWithinWindow) {
    rateState.total = 0;
    rateState.lastSubmissionAt = now;
  }

  rateState.total += 1;
  COMMENT_RATE_WINDOWS.set(key, rateState);

  if (rateState.total > COMMENT_RATE_LIMIT) {
    flags.push("rate-limit");
    return {
      ok: false,
      status: "spam",
      flags,
      errors: `Too many comments. Please wait ${Math.max(10, Math.round(COMMENT_RATE_WINDOW_MS / 1000))} seconds.`,
    };
  }

  const signature = makeSubmissionSignature({
    commentContent: normalizedContent,
    content: normalizedContent,
  });
  const signatureKey = `${key}:signature:${signature}`;
  const signatures = COMMENT_SIGNATURES.get(signatureKey) || [];
  const activeSignatures = signatures.filter(
    (value) => now - value <= COMMENT_SIGNATURE_WINDOW_MS,
  );

  if (activeSignatures.length > 0) {
    activeSignatures.push(now);
    COMMENT_SIGNATURES.set(signatureKey, activeSignatures);
    flags.push("duplicate");
    return {
      ok: false,
      status: "spam",
      flags,
      errors: "Duplicate comment blocked.",
    };
  }

  activeSignatures.push(now);
  COMMENT_SIGNATURES.set(signatureKey, activeSignatures);

  return {
    ok: true,
    status: "pending",
    flags,
  };
}

function parseShareValue(
  values: Record<string, unknown>,
  key?: string | null,
): string | null {
  if (!key) {
    return null;
  }

  const parsed = sanitizeString(values[key]);
  return parsed.length > 0 ? parsed : null;
}

function parseFieldMap(value: unknown): Record<string, string> | undefined {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    const map = Object.entries(value as Record<string, unknown>).reduce<
      Record<string, string>
    >((acc, [key, target]) => {
      const sourceKey = sanitizeString(key);
      const targetKey = sanitizeString(target);
      if (sourceKey && targetKey) {
        acc[sourceKey] = targetKey;
      }
      return acc;
    }, {});

    return Object.keys(map).length > 0 ? map : undefined;
  }

  if (typeof value === "string") {
    const map = value
      .split(/\r?\n|,/)
      .map((entry) => entry.trim())
      .filter(Boolean)
      .reduce<Record<string, string>>((acc, entry) => {
        const [source, target] = entry.split(":").map((item) => item?.trim());
        if (source && target) {
          acc[source] = target;
        }
        return acc;
      }, {});

    return Object.keys(map).length > 0 ? map : undefined;
  }

  return undefined;
}

export function getSites(
  params: { includeUnpublished?: boolean } = {},
): StoreSite[] {
  ensurePersistedAdminContentLoaded();

  const { includeUnpublished = false } = params;
  const raw = includeUnpublished
    ? SITE_LIST
    : SITE_LIST.filter((site) => site.isPublished);
  return clone(raw.map((site) => completeStoreSiteFrontendDesign(site)));
}

export function getSiteByIdOrSlug(identifier: string): StoreSite | undefined {
  ensurePersistedAdminContentLoaded();

  const normalized = normalizeIdentifier(identifier);
  const found = SITE_LIST.find(
    (site) =>
      normalizeIdentifier(site.slug) === normalized ||
      normalizeIdentifier(site.id) === normalized ||
      (site.customDomain
        ? normalizeIdentifier(site.customDomain) === normalized
        : false),
  );

  return found ? clone(completeStoreSiteFrontendDesign(found)) : undefined;
}

const normalizeSiteWebhookEventKinds = (
  value: unknown,
  fallback: SiteWebhookEventKind[] = [],
): SiteWebhookEventKind[] => {
  if (!Array.isArray(value)) {
    return [...fallback];
  }

  const allowed = new Set(SITE_WEBHOOK_EVENT_KINDS);
  return Array.from(
    new Set(
      value.filter(
        (item): item is SiteWebhookEventKind =>
          typeof item === "string" && allowed.has(item as SiteWebhookEventKind),
      ),
    ),
  );
};

const normalizeSiteWebhooksInput = (
  input: unknown,
  current?: SiteSettings["webhooks"],
): NonNullable<SiteSettings["webhooks"]> => {
  const webhookInput = toRecord(input);
  const base: NonNullable<SiteSettings["webhooks"]> = {
    ...DEFAULT_SITE_SETTINGS.webhooks,
    ...(current || {}),
    endpoints: [...(current?.endpoints || [])],
  };
  const endpointInputs =
    webhookInput.endpoints === undefined
      ? base.endpoints
      : Array.isArray(webhookInput.endpoints)
        ? webhookInput.endpoints
        : [];

  return {
    enabled:
      webhookInput.enabled === undefined
        ? base.enabled === true
        : parseBooleanInput(webhookInput.enabled, false),
    endpoints: endpointInputs
      .filter((endpoint): endpoint is Record<string, unknown> =>
        isObjectRecord(endpoint),
      )
      .map((endpoint) => {
        const headers = toStringRecord(endpoint.headers);
        return {
          id: sanitizeString(endpoint.id) || createRuntimeId("webhook"),
          name: sanitizeString(endpoint.name) || "Site webhook",
          url: sanitizeString(endpoint.url),
          enabled:
            endpoint.enabled === undefined
              ? true
              : parseBooleanInput(endpoint.enabled, true),
          eventKinds: normalizeSiteWebhookEventKinds(endpoint.eventKinds, []),
          secretId: sanitizeString(endpoint.secretId),
          headers: Object.keys(headers).length > 0 ? headers : undefined,
        };
      })
      .filter((endpoint) => endpoint.url)
      .slice(0, 20),
  };
};

const normalizeSiteDomainAliasesInput = (
  input: unknown,
  current?: SiteSettings["domainAliases"],
): NonNullable<SiteSettings["domainAliases"]> => {
  type DomainAliasSettings = NonNullable<SiteSettings["domainAliases"]>[number];
  const currentByHost = new Map(
    (Array.isArray(current) ? current : [])
      .map((alias) => [sanitizeString(alias.host).toLowerCase(), alias] as const)
      .filter(([host]) => Boolean(host)),
  );
  const seen = new Set<string>();

  return (Array.isArray(input) ? input : [])
    .flatMap((entry): DomainAliasSettings[] => {
      const aliasInput = toRecord(entry);
      const host = sanitizeString(aliasInput.host)
        .toLowerCase()
        .replace(/^https?:\/\//, "")
        .split("/")[0]
        ?.replace(/\/+$/, "");
      if (!host || seen.has(host)) return [];
      seen.add(host);
      const existing = currentByHost.get(host);
      const status = ["not_started", "pending", "verified", "failed"].includes(
        String(aliasInput.status),
      )
        ? (aliasInput.status as NonNullable<
            SiteSettings["domainAliases"]
          >[number]["status"])
        : existing?.status || "pending";

      return [{
        id: sanitizeString(aliasInput.id) || existing?.id || createRuntimeId("domain-alias"),
        host,
        kind:
          aliasInput.kind === "subdomain" ||
          aliasInput.kind === "root" ||
          aliasInput.kind === "locale" ||
          aliasInput.kind === "redirect"
            ? aliasInput.kind
            : existing?.kind || "alias",
        status,
        requestedAt:
          sanitizeString(aliasInput.requestedAt) || existing?.requestedAt || null,
        verifiedAt:
          status === "verified"
            ? sanitizeString(aliasInput.verifiedAt) || existing?.verifiedAt || null
            : null,
        lastError:
          aliasInput.lastError === null
            ? null
            : sanitizeString(aliasInput.lastError) || existing?.lastError || null,
      }];
    })
    .slice(0, 100);
};

function normalizeSiteSettingsInput(
  input: unknown,
  current?: SiteSettings,
): SiteSettings {
  const settingsInput = toRecord(input);
  const base = current || createDefaultSiteSettings();
  const domainVerificationInput = toRecord(settingsInput.domainVerification);
  const defaultDomainVerification: NonNullable<
    SiteSettings["domainVerification"]
  > = {
    ...DEFAULT_SITE_SETTINGS.domainVerification,
  };
  const baseDomainVerification: NonNullable<
    SiteSettings["domainVerification"]
  > = {
    ...defaultDomainVerification,
    ...(base.domainVerification || {}),
  };
  const domainVerificationStatus = [
    "not_started",
    "pending",
    "verified",
    "failed",
  ].includes(String(domainVerificationInput.status))
    ? (domainVerificationInput.status as NonNullable<
        SiteSettings["domainVerification"]
      >["status"])
    : baseDomainVerification.status;
  const vercelDeploymentInput = toRecord(settingsInput.vercelDeployment);
  const defaultVercelDeployment: NonNullable<SiteSettings["vercelDeployment"]> =
    {
      ...DEFAULT_SITE_SETTINGS.vercelDeployment,
      missing: [],
      history: [],
    };
  const baseVercelDeployment: NonNullable<SiteSettings["vercelDeployment"]> = {
    ...defaultVercelDeployment,
    ...(base.vercelDeployment || {}),
    missing: [...(base.vercelDeployment?.missing || [])],
    history: [...(base.vercelDeployment?.history || [])],
  };
  const vercelDeploymentStatus = [
    "not_started",
    "preview_queued",
    "preview_ready",
    "production_ready",
    "rolled_back",
    "blocked",
  ].includes(String(vercelDeploymentInput.status))
    ? (vercelDeploymentInput.status as NonNullable<
        SiteSettings["vercelDeployment"]
      >["status"])
    : baseVercelDeployment.status;
  const vercelDeploymentAction = [
    "prepare-preview",
    "record-preview",
    "promote-production",
    "rollback-production",
  ].includes(String(vercelDeploymentInput.lastAction))
    ? (vercelDeploymentInput.lastAction as NonNullable<
        SiteSettings["vercelDeployment"]
      >["lastAction"])
    : baseVercelDeployment.lastAction || null;
  const vercelDeploymentEnvironment =
    vercelDeploymentInput.environment === "production"
      ? "production"
      : "preview";
  const billingQuotaInput = toRecord(settingsInput.billingQuota);
  const billingLimitsInput = toRecord(billingQuotaInput.limits);
  const billingUsageInput = toRecord(billingQuotaInput.usage);
  const defaultBillingQuota: NonNullable<SiteSettings["billingQuota"]> = {
    ...DEFAULT_SITE_SETTINGS.billingQuota,
    limits: { ...DEFAULT_SITE_SETTINGS.billingQuota.limits },
    usage: { ...DEFAULT_SITE_SETTINGS.billingQuota.usage },
    history: [],
  };
  const baseBillingQuota: NonNullable<SiteSettings["billingQuota"]> = {
    ...defaultBillingQuota,
    ...(base.billingQuota || {}),
    limits: {
      ...defaultBillingQuota.limits,
      ...(base.billingQuota?.limits || {}),
    },
    usage: {
      ...defaultBillingQuota.usage,
      ...(base.billingQuota?.usage || {}),
    },
    history: [...(base.billingQuota?.history || [])],
  };
  const billingPlan = ["free", "pro", "business", "enterprise"].includes(
    String(billingQuotaInput.plan),
  )
    ? (billingQuotaInput.plan as NonNullable<
        SiteSettings["billingQuota"]
      >["plan"])
    : baseBillingQuota.plan;
  const billingStatus = [
    "active",
    "trialing",
    "past_due",
    "paused",
    "comped",
  ].includes(String(billingQuotaInput.status))
    ? (billingQuotaInput.status as NonNullable<
        SiteSettings["billingQuota"]
      >["status"])
    : baseBillingQuota.status;
  const billingAction = [
    "set-free",
    "set-pro",
    "set-business",
    "set-enterprise",
    "refresh-usage",
  ].includes(String(billingQuotaInput.lastAction))
    ? (billingQuotaInput.lastAction as NonNullable<
        SiteSettings["billingQuota"]
      >["lastAction"])
    : baseBillingQuota.lastAction || null;
  const numberValue = (value: unknown, fallback: number): number =>
    typeof value === "number" && Number.isFinite(value)
      ? Math.max(0, value)
      : fallback;

  return {
    ...base,
    ...settingsInput,
    seo: {
      ...base.seo,
      ...toRecord(settingsInput.seo),
    },
    analytics: {
      ...base.analytics,
      ...toRecord(settingsInput.analytics),
    },
    social: {
      ...base.social,
      ...toStringRecord(settingsInput.social),
    },
    commentPolicy:
      settingsInput.commentPolicy === undefined
        ? normalizeCommentPolicy(base.commentPolicy)
        : normalizeCommentPolicy(
            settingsInput.commentPolicy,
            base.commentPolicy,
          ),
    redirectRules:
      settingsInput.redirectRules === undefined
        ? [...base.redirectRules]
        : normalizeRedirectRules(settingsInput.redirectRules),
    navigation:
      settingsInput.navigation === undefined
        ? base.navigation
        : normalizeNavigationConfig(settingsInput.navigation, base.navigation),
    localization: normalizeSiteLocalization({
      localization:
        settingsInput.localization === undefined
          ? base.localization
          : (toRecord(
              settingsInput.localization,
            ) as SiteSettings["localization"]),
    }),
    domainVerification:
      settingsInput.domainVerification === undefined
        ? { ...baseDomainVerification }
        : {
            ...baseDomainVerification,
            ...domainVerificationInput,
            status: domainVerificationStatus,
            method: "dns-txt",
            domain:
              domainVerificationInput.domain === null
                ? null
                : sanitizeString(domainVerificationInput.domain) ||
                  baseDomainVerification.domain ||
                  null,
            token:
              sanitizeString(domainVerificationInput.token) ||
              baseDomainVerification.token ||
              "",
            txtHost:
              sanitizeString(domainVerificationInput.txtHost) ||
              baseDomainVerification.txtHost ||
              "",
            txtValue:
              sanitizeString(domainVerificationInput.txtValue) ||
              baseDomainVerification.txtValue ||
              "",
            cnameTarget:
              sanitizeString(domainVerificationInput.cnameTarget) ||
              baseDomainVerification.cnameTarget ||
              "",
            requestedAt:
              sanitizeString(domainVerificationInput.requestedAt) || null,
            checkedAt:
              sanitizeString(domainVerificationInput.checkedAt) || null,
            verifiedAt:
              sanitizeString(domainVerificationInput.verifiedAt) || null,
            lastError:
              domainVerificationInput.lastError === null
                ? null
                : sanitizeString(domainVerificationInput.lastError) || null,
          },
    domainAliases:
      settingsInput.domainAliases === undefined
        ? normalizeSiteDomainAliasesInput(base.domainAliases, base.domainAliases)
        : normalizeSiteDomainAliasesInput(
            settingsInput.domainAliases,
            base.domainAliases,
          ),
    webhooks:
      settingsInput.webhooks === undefined
        ? normalizeSiteWebhooksInput(base.webhooks, base.webhooks)
        : normalizeSiteWebhooksInput(settingsInput.webhooks, base.webhooks),
    vercelDeployment:
      settingsInput.vercelDeployment === undefined
        ? {
            ...baseVercelDeployment,
            missing: [...(baseVercelDeployment.missing || [])],
            history: [...(baseVercelDeployment.history || [])],
          }
        : {
            ...baseVercelDeployment,
            ...vercelDeploymentInput,
            status: vercelDeploymentStatus,
            projectId: sanitizeString(vercelDeploymentInput.projectId) || "",
            teamSlug: sanitizeString(vercelDeploymentInput.teamSlug) || "",
            productionDomain:
              sanitizeString(vercelDeploymentInput.productionDomain) || "",
            previewUrl: sanitizeString(vercelDeploymentInput.previewUrl) || "",
            productionUrl:
              sanitizeString(vercelDeploymentInput.productionUrl) || "",
            deploymentId:
              sanitizeString(vercelDeploymentInput.deploymentId) || "",
            environment: vercelDeploymentEnvironment,
            lastAction: vercelDeploymentAction,
            requestedAt:
              sanitizeString(vercelDeploymentInput.requestedAt) || null,
            completedAt:
              sanitizeString(vercelDeploymentInput.completedAt) || null,
            promotedAt:
              sanitizeString(vercelDeploymentInput.promotedAt) || null,
            rolledBackAt:
              sanitizeString(vercelDeploymentInput.rolledBackAt) || null,
            command: sanitizeString(vercelDeploymentInput.command) || "",
            missing: Array.isArray(vercelDeploymentInput.missing)
              ? vercelDeploymentInput.missing.filter(
                  (item): item is string => typeof item === "string",
                )
              : [],
            history: Array.isArray(vercelDeploymentInput.history)
              ? vercelDeploymentInput.history
                  .filter(
                    (item): item is SiteVercelDeploymentRun =>
                      isObjectRecord(item) &&
                      typeof item.id === "string" &&
                      typeof item.action === "string",
                  )
                  .slice(0, 10)
              : [],
          },
    billingQuota:
      settingsInput.billingQuota === undefined
        ? {
            ...baseBillingQuota,
            limits: { ...baseBillingQuota.limits },
            usage: { ...baseBillingQuota.usage },
            history: [...(baseBillingQuota.history || [])],
          }
        : {
            ...baseBillingQuota,
            ...billingQuotaInput,
            plan: billingPlan,
            status: billingStatus,
            billingOwnerId:
              billingQuotaInput.billingOwnerId === null
                ? null
                : sanitizeString(billingQuotaInput.billingOwnerId) ||
                  baseBillingQuota.billingOwnerId ||
                  null,
            billingEmail: sanitizeString(billingQuotaInput.billingEmail) || "",
            renewalAt: sanitizeString(billingQuotaInput.renewalAt) || null,
            limits: {
              pages: numberValue(
                billingLimitsInput.pages,
                baseBillingQuota.limits.pages,
              ),
              mediaGb: numberValue(
                billingLimitsInput.mediaGb,
                baseBillingQuota.limits.mediaGb,
              ),
              bandwidthGb: numberValue(
                billingLimitsInput.bandwidthGb,
                baseBillingQuota.limits.bandwidthGb,
              ),
              forms: numberValue(
                billingLimitsInput.forms,
                baseBillingQuota.limits.forms,
              ),
              products: numberValue(
                billingLimitsInput.products,
                baseBillingQuota.limits.products,
              ),
              collections: numberValue(
                billingLimitsInput.collections,
                baseBillingQuota.limits.collections,
              ),
              teamMembers: numberValue(
                billingLimitsInput.teamMembers,
                baseBillingQuota.limits.teamMembers,
              ),
              customDomains: numberValue(
                billingLimitsInput.customDomains,
                baseBillingQuota.limits.customDomains,
              ),
            },
            usage: {
              pages: numberValue(
                billingUsageInput.pages,
                baseBillingQuota.usage.pages,
              ),
              mediaGb: numberValue(
                billingUsageInput.mediaGb,
                baseBillingQuota.usage.mediaGb,
              ),
              bandwidthGb: numberValue(
                billingUsageInput.bandwidthGb,
                baseBillingQuota.usage.bandwidthGb,
              ),
              forms: numberValue(
                billingUsageInput.forms,
                baseBillingQuota.usage.forms,
              ),
              products: numberValue(
                billingUsageInput.products,
                baseBillingQuota.usage.products,
              ),
              collections: numberValue(
                billingUsageInput.collections,
                baseBillingQuota.usage.collections,
              ),
              teamMembers: numberValue(
                billingUsageInput.teamMembers,
                baseBillingQuota.usage.teamMembers,
              ),
              customDomains: numberValue(
                billingUsageInput.customDomains,
                baseBillingQuota.usage.customDomains,
              ),
              updatedAt: sanitizeString(billingUsageInput.updatedAt) || "",
            },
            lastAction: billingAction,
            notes: sanitizeString(billingQuotaInput.notes),
            history: Array.isArray(billingQuotaInput.history)
              ? billingQuotaInput.history
                  .filter(
                    (item): item is SiteBillingQuotaEvent =>
                      isObjectRecord(item) &&
                      typeof item.id === "string" &&
                      typeof item.action === "string",
                  )
                  .slice(0, 10)
              : [],
          },
    frontendDesign: completeCustomFrontendTemplateRegistry(
      settingsInput.frontendDesign === undefined
        ? base.frontendDesign || emptyFrontendDesignContract()
        : normalizeFrontendDesignContract(settingsInput.frontendDesign, {
            fallback: base.frontendDesign,
            updatedAt: new Date().toISOString(),
            mergeFallback: true,
          }),
    ),
    contacts:
      settingsInput.contacts === undefined
        ? {
            ...(base.contacts || {}),
            savedLists: [...(base.contacts?.savedLists || [])],
          }
        : {
            ...(base.contacts || {}),
            ...toRecord(settingsInput.contacts),
            savedLists: Array.isArray(
              toRecord(settingsInput.contacts).savedLists,
            )
              ? (toRecord(settingsInput.contacts).savedLists as NonNullable<
                  SiteSettings["contacts"]
                >["savedLists"])
              : base.contacts?.savedLists || [],
          },
    editor:
      settingsInput.editor === undefined
        ? {
            ...(base.editor || {}),
            collectionBindingPresets: [
              ...(base.editor?.collectionBindingPresets || []),
            ],
          }
        : {
            ...(base.editor || {}),
            ...toRecord(settingsInput.editor),
            collectionBindingPresets: Array.isArray(
              toRecord(settingsInput.editor).collectionBindingPresets,
            )
              ? (toRecord(settingsInput.editor)
                  .collectionBindingPresets as NonNullable<
                  SiteSettings["editor"]
                >["collectionBindingPresets"])
              : base.editor?.collectionBindingPresets || [],
          },
  };
}

export function createAdminSite(input: Record<string, unknown>): StoreSite {
  recoverDemoSiteBackupCommit();ensurePersistedAdminContentLoaded(true);

  const now = new Date().toISOString();
  const name = sanitizeString(input.name) || "Untitled site";
  const slug = normalizeSlugInput(input.slug || name, "site");
  assertSiteCreationQuota(SETTINGS,SITE_LIST.length);
  if(SITE_LIST.some(site=>site.slug===slug))throw new SiteCreationAdmissionError('SITE_SLUG_CONFLICT',409,'This site slug is already in use. Choose another slug.');
  const status = parseStatusInput(
    input.status,
    ["draft", "published", "scheduled", "archived"] as const,
    "draft",
  );

  const site: StoreSite = {
    id: sanitizeString(input.id) || createRuntimeId("site"),
    teamId: sanitizeString(input.teamId) || null,
    name,
    slug,
    description: sanitizeString(input.description),
    customDomain: sanitizeString(input.customDomain) || null,
    status,
    isPublished:
      status === "published" || parseBooleanInput(input.isPublished, false),
    settings: normalizeSiteSettingsInput(input.settings),
    theme: {
      ...seedTheme,
      ...toRecord(input.theme),
      colors: {
        ...seedTheme.colors,
        ...toStringRecord(toRecord(input.theme).colors),
      },
      fonts: {
        ...seedTheme.fonts,
        ...toStringRecord(toRecord(input.theme).fonts),
      },
      customCSS:
        sanitizeString(toRecord(input.theme).customCSS) || seedTheme.customCSS,
    },
  };

  const prior=existsSync(ADMIN_CONTENT_PATH)?JSON.parse(readFileSync(ADMIN_CONTENT_PATH,'utf8')):{};
  persistDemoSiteDuplication({...prior,sites:[site,...SITE_LIST]});
  persistedAdminContentSignature='';refreshPersistedAdminContent(true);
  const committed=SITE_LIST.find(row=>row.id===site.id);
  if(!committed)throw new SiteCreationAdmissionError('SITE_CREATION_PERSISTENCE_UNCONFIRMED',503,'Site creation could not confirm its outcome. Reload sites before applying again.');
  return clone(committed);
}

export function updateAdminSite(
  siteId: string,
  input: Record<string, unknown>,
): StoreSite | undefined {
  ensurePersistedAdminContentLoaded();

  const index = SITE_LIST.findIndex((site) => site.id === siteId);
  if (index === -1) {
    return undefined;
  }

  const current = SITE_LIST[index];
  const nextStatus =
    input.status === undefined
      ? current.status
      : parseStatusInput(
          input.status,
          ["draft", "published", "scheduled", "archived"] as const,
          current.status,
        );
  const themeInput = toRecord(input.theme);
  const settingsInput =
    input.settings === undefined && input.redirectRules !== undefined
      ? { redirectRules: input.redirectRules }
      : input.settings;
  if (settingsInput && typeof settingsInput === 'object' && Object.prototype.hasOwnProperty.call(settingsInput, 'frontendDesign')) throw Object.assign(new Error('Change frontendDesign through the atomic template history writer.'), { code: 'FRONTEND_DESIGN_HISTORY_REQUIRED', status: 400 });

  const updated: StoreSite = {
    ...current,
    name:
      input.name === undefined
        ? current.name
        : sanitizeString(input.name) || current.name,
    slug:
      input.slug === undefined
        ? current.slug
        : normalizeSlugInput(input.slug, current.slug),
    description:
      input.description === undefined
        ? current.description
        : sanitizeString(input.description),
    customDomain:
      input.customDomain === undefined
        ? current.customDomain
        : sanitizeString(input.customDomain) || null,
    teamId:
      input.teamId === undefined
        ? current.teamId || null
        : sanitizeString(input.teamId) || null,
    status: nextStatus,
    isPublished:
      input.isPublished === undefined
        ? nextStatus === "published"
        : parseBooleanInput(input.isPublished, nextStatus === "published"),
    settings:
      settingsInput === undefined
        ? current.settings
        : normalizeSiteSettingsInput(settingsInput, current.settings),
    theme:
      input.theme === undefined
        ? current.theme
        : {
            ...current.theme,
            ...themeInput,
            colors: {
              ...current.theme.colors,
              ...toStringRecord(themeInput.colors),
            },
            fonts: {
              ...current.theme.fonts,
              ...toStringRecord(themeInput.fonts),
            },
            customCSS:
              themeInput.customCSS === undefined
                ? current.theme.customCSS
                : sanitizeString(themeInput.customCSS),
          },
  };

  SITE_LIST[index] = updated;
  persistAdminContent();
  return clone(updated);
}

export function deleteAdminSite(siteId: string): boolean {
  ensurePersistedAdminContentLoaded();
  assertNoDemoCommentDeliveryEvidence(siteId);
  assertNoDemoFormDeliveryEvidence(siteId);
  assertNoPendingDemoSiteBackupJobs(siteId);

  const index = SITE_LIST.findIndex((site) => site.id === siteId);
  if (index === -1) {
    return false;
  }

  SITE_LIST.splice(index, 1);

  for (let pageIndex = PAGE_LIST.length - 1; pageIndex >= 0; pageIndex -= 1) {
    if (PAGE_LIST[pageIndex].siteId === siteId) {
      PAGE_LIST.splice(pageIndex, 1);
    }
  }

  for (let postIndex = BLOG_POSTS.length - 1; postIndex >= 0; postIndex -= 1) {
    if (BLOG_POSTS[postIndex].siteId === siteId) {
      BLOG_POSTS.splice(postIndex, 1);
    }
  }

  for (
    let categoryIndex = BLOG_CATEGORIES.length - 1;
    categoryIndex >= 0;
    categoryIndex -= 1
  ) {
    if (BLOG_CATEGORIES[categoryIndex].siteId === siteId) {
      BLOG_CATEGORIES.splice(categoryIndex, 1);
    }
  }

  for (let tagIndex = BLOG_TAGS.length - 1; tagIndex >= 0; tagIndex -= 1) {
    if (BLOG_TAGS[tagIndex].siteId === siteId) {
      BLOG_TAGS.splice(tagIndex, 1);
    }
  }

  for (
    let collectionIndex = COLLECTIONS.length - 1;
    collectionIndex >= 0;
    collectionIndex -= 1
  ) {
    if (COLLECTIONS[collectionIndex].siteId === siteId) {
      COLLECTIONS.splice(collectionIndex, 1);
    }
  }

  for (
    let recordIndex = COLLECTION_RECORDS.length - 1;
    recordIndex >= 0;
    recordIndex -= 1
  ) {
    if (COLLECTION_RECORDS[recordIndex].siteId === siteId) {
      COLLECTION_RECORDS.splice(recordIndex, 1);
    }
  }

  for (
    let sectionIndex = REUSABLE_SECTIONS.length - 1;
    sectionIndex >= 0;
    sectionIndex -= 1
  ) {
    if (REUSABLE_SECTIONS[sectionIndex].siteId === siteId) {
      REUSABLE_SECTIONS.splice(sectionIndex, 1);
    }
  }

  for (
    let componentIndex = INTERACTIVE_COMPONENTS.length - 1;
    componentIndex >= 0;
    componentIndex -= 1
  ) {
    if (INTERACTIVE_COMPONENTS[componentIndex].siteId === siteId) {
      INTERACTIVE_COMPONENTS.splice(componentIndex, 1);
    }
  }

  for (
    let revisionIndex = CONTENT_REVISIONS.length - 1;
    revisionIndex >= 0;
    revisionIndex -= 1
  ) {
    if (CONTENT_REVISIONS[revisionIndex].siteId === siteId) {
      CONTENT_REVISIONS.splice(revisionIndex, 1);
    }
  }

  for (
    let tokenIndex = PREVIEW_TOKENS.length - 1;
    tokenIndex >= 0;
    tokenIndex -= 1
  ) {
    if (PREVIEW_TOKENS[tokenIndex].siteId === siteId) {
      PREVIEW_TOKENS.splice(tokenIndex, 1);
    }
  }

  for (let index = PRODUCT_DESIGN_REVISIONS.length - 1; index >= 0; index--) if (PRODUCT_DESIGN_REVISIONS[index].siteId === siteId) PRODUCT_DESIGN_REVISIONS.splice(index, 1);
  for (let i = COLLECTION_DESIGN_REVISIONS.length - 1; i >= 0; i--) if (COLLECTION_DESIGN_REVISIONS[i].siteId === siteId) COLLECTION_DESIGN_REVISIONS.splice(i, 1);
  for (let i = FORM_DESIGN_REVISIONS.length - 1; i >= 0; i--) if (FORM_DESIGN_REVISIONS[i].siteId === siteId) FORM_DESIGN_REVISIONS.splice(i, 1);
  for (let index = TEMPLATE_REVISIONS.length - 1; index >= 0; index--) if (TEMPLATE_REVISIONS[index].siteId === siteId) TEMPLATE_REVISIONS.splice(index, 1);

  persistAdminContent();
  return true;
}

const normalizeUserRole = (
  value: unknown,
  fallback: StoreUser["role"] = "viewer",
): StoreUser["role"] => {
  if (
    value === "owner" ||
    value === "admin" ||
    value === "editor" ||
    value === "viewer"
  ) {
    return value;
  }

  return fallback;
};

const normalizeUserStatus = (
  value: unknown,
  fallback: StoreUser["status"] = "invited",
): StoreUser["status"] => {
  if (
    value === "active" ||
    value === "inactive" ||
    value === "invited" ||
    value === "suspended"
  ) {
    return value;
  }

  return fallback;
};

const normalizeEmail = (value: unknown): string =>
  typeof value === "string" ? value.trim().toLowerCase() : "";

type AdminUserSortBy =
  | "fullName"
  | "email"
  | "role"
  | "status"
  | "createdAt"
  | "updatedAt";
type AdminUserSortDirection = "asc" | "desc";

const ADMIN_USER_SORT_FIELDS: AdminUserSortBy[] = [
  "fullName",
  "email",
  "role",
  "status",
  "createdAt",
  "updatedAt",
];

const normalizeAdminUserSortBy = (value: unknown): AdminUserSortBy =>
  typeof value === "string" &&
  (ADMIN_USER_SORT_FIELDS as string[]).includes(value)
    ? (value as AdminUserSortBy)
    : "updatedAt";

const normalizeAdminUserSortDirection = (
  value: unknown,
): AdminUserSortDirection =>
  value === "asc" || value === "desc" ? value : "desc";

const compareAdminUsers = (
  first: StoreUser,
  second: StoreUser,
  sortBy: AdminUserSortBy,
  sortDirection: AdminUserSortDirection,
): number => {
  const firstValue = first[sortBy] || "";
  const secondValue = second[sortBy] || "";
  const compared = String(firstValue).localeCompare(
    String(secondValue),
    undefined,
    {
      numeric: true,
      sensitivity: "base",
    },
  );

  if (compared !== 0) {
    return sortDirection === "asc" ? compared : -compared;
  }

  return first.id.localeCompare(second.id);
};

export function listAdminUsers(
  options: {
    search?: string;
    role?: string;
    status?: string;
    sortBy?: string;
    sortDirection?: string;
  } = {},
): StoreUser[] {
  ensurePersistedAdminContentLoaded();

  const search = sanitizeString(options.search).toLowerCase();
  const role =
    options.role === "owner" ||
    options.role === "admin" ||
    options.role === "editor" ||
    options.role === "viewer"
      ? options.role
      : "";
  const status =
    options.status === "active" ||
    options.status === "inactive" ||
    options.status === "invited" ||
    options.status === "suspended"
      ? options.status
      : "";
  const sortBy =
    options.sortBy || options.sortDirection
      ? normalizeAdminUserSortBy(options.sortBy)
      : null;
  const sortDirection = normalizeAdminUserSortDirection(options.sortDirection);

  const users = USER_LIST.filter((user) => {
    const matchesSearch =
      !search ||
      user.fullName.toLowerCase().includes(search) ||
      user.email.toLowerCase().includes(search);
    const matchesRole = !role || user.role === role;
    const matchesStatus = !status || user.status === status;

    return matchesSearch && matchesRole && matchesStatus;
  });

  if (sortBy) {
    users.sort((first, second) =>
      compareAdminUsers(first, second, sortBy, sortDirection),
    );
  }

  return clone(users);
}

export function getAdminUserById(userId: string): StoreUser | undefined {
  ensurePersistedAdminContentLoaded();

  const user = USER_LIST.find((item) => item.id === userId);
  return user ? clone(user) : undefined;
}

export function getAdminUserByEmail(email: string): StoreUser | undefined {
  ensurePersistedAdminContentLoaded();

  const normalizedEmail = normalizeEmail(email);
  const user = USER_LIST.find(
    (item) => item.email.toLowerCase() === normalizedEmail,
  );
  return user ? clone(user) : undefined;
}

export function listAdminUserPermissionOverrides(
  userId: string,
): StoreUserPermissionOverride[] {
  ensurePersistedAdminContentLoaded();
  return clone(
    USER_PERMISSION_OVERRIDES.filter((override) => override.userId === userId),
  );
}

export function updateAdminUserPermissionOverrides(
  userId: string,
  input: Record<string, unknown>,
): StoreUserPermissionOverride[] {
  ensurePersistedAdminContentLoaded();

  const now = new Date().toISOString();
  Object.entries(input).forEach(([permissionKey, rawValue]) => {
    const key = sanitizeString(permissionKey);
    const value =
      rawValue === "allow" || rawValue === true
        ? "allow"
        : rawValue === "deny" || rawValue === false
          ? "deny"
          : null;
    const index = USER_PERMISSION_OVERRIDES.findIndex(
      (override) =>
        override.userId === userId && override.permissionKey === key,
    );

    if (!key) return;

    if (!value) {
      if (index !== -1) {
        USER_PERMISSION_OVERRIDES.splice(index, 1);
      }
      return;
    }

    const override: StoreUserPermissionOverride = {
      userId,
      permissionKey: key,
      value,
      updatedAt: now,
    };

    if (index === -1) {
      USER_PERMISSION_OVERRIDES.push(override);
    } else {
      USER_PERMISSION_OVERRIDES[index] = override;
    }
  });

  persistAdminContent();
  return listAdminUserPermissionOverrides(userId);
}

export function createAdminUser(input: Record<string, unknown>): StoreUser {
  ensurePersistedAdminContentLoaded();

  const now = new Date().toISOString();
  const fullName =
    sanitizeString(input.fullName) ||
    sanitizeString(input.name) ||
    "Invited user";
  const email = normalizeEmail(input.email);
  const status = normalizeUserStatus(input.status, "invited");

  const user: StoreUser = {
    id: sanitizeString(input.id) || createRuntimeId("user"),
    fullName,
    email,
    role: normalizeUserRole(input.role, "viewer"),
    status,
    createdAt: now,
    updatedAt: now,
    lastActiveAt: status === "active" ? now : null,
    invitedAt: now,
  };

  USER_LIST.unshift(user);
  persistAdminContent();
  return clone(user);
}

const assertDemoOperatorAuthorityRemains = (current: StoreUser, next: Pick<StoreUser, 'role' | 'status'> | null) => {
  const active = (value: Pick<StoreUser, 'role' | 'status'>) => (value.role === 'owner' || value.role === 'admin') && value.status === 'active';
  if (active(current) && (!next || !active(next)) && !USER_LIST.some(user => user.id !== current.id && active(user))) {
    throw Object.assign(new Error('At least one active owner or admin must remain.'), { code: 'LAST_ADMIN_AUTHORITY', status: 409 });
  }
};

export function updateAdminUser(
  userId: string,
  input: Record<string, unknown>,
): StoreUser | undefined {
  ensurePersistedAdminContentLoaded();

  const index = USER_LIST.findIndex((user) => user.id === userId);
  if (index === -1) {
    return undefined;
  }

  const current = USER_LIST[index];
  const now = new Date().toISOString();
  const nextStatus =
    input.status === undefined
      ? current.status
      : normalizeUserStatus(input.status, current.status);

  const updated: StoreUser = {
    ...current,
    fullName:
      input.fullName === undefined
        ? current.fullName
        : sanitizeString(input.fullName) || current.fullName,
    email:
      input.email === undefined
        ? current.email
        : normalizeEmail(input.email) || current.email,
    role:
      input.role === undefined
        ? current.role
        : normalizeUserRole(input.role, current.role),
    status: nextStatus,
    updatedAt: now,
    lastActiveAt:
      nextStatus === "active" && !current.lastActiveAt
        ? now
        : current.lastActiveAt,
  };

  assertDemoOperatorAuthorityRemains(current, updated);
  USER_LIST[index] = updated;
  persistAdminContent();
  return clone(updated);
}

export function deleteAdminUser(userId: string): boolean {
  ensurePersistedAdminContentLoaded();

  const index = USER_LIST.findIndex((user) => user.id === userId);
  if (index === -1) {
    return false;
  }

  assertDemoOperatorAuthorityRemains(USER_LIST[index], null);
  USER_LIST.splice(index, 1);
  for (
    let overrideIndex = USER_PERMISSION_OVERRIDES.length - 1;
    overrideIndex >= 0;
    overrideIndex -= 1
  ) {
    if (USER_PERMISSION_OVERRIDES[overrideIndex]?.userId === userId) {
      USER_PERMISSION_OVERRIDES.splice(overrideIndex, 1);
    }
  }
  persistAdminContent();
  return true;
}

const normalizeTeamSlug = (value: unknown, fallback: string): string => {
  const normalized = normalizeSlugInput(value, fallback);
  return normalized || fallback;
};

const normalizeTeamRole = (
  value: unknown,
  fallback: StoreTeamMember["role"] = "viewer",
): StoreTeamMember["role"] =>
  value === "owner" ||
  value === "admin" ||
  value === "editor" ||
  value === "viewer"
    ? value
    : fallback;

const normalizeTeamSettings = (
  value: unknown,
  fallback: Record<string, unknown> = {},
): Record<string, unknown> =>
  value && typeof value === "object" && !Array.isArray(value)
    ? { ...(value as Record<string, unknown>) }
    : { ...fallback };

export function listAdminTeams(): StoreTeam[] {
  ensurePersistedAdminContentLoaded();
  return clone(TEAM_LIST);
}

export function getAdminTeamById(teamId: string): StoreTeam | undefined {
  ensurePersistedAdminContentLoaded();
  const team = TEAM_LIST.find((item) => item.id === teamId);
  return team ? clone(team) : undefined;
}

export function getAdminTeamBySlug(slug: string): StoreTeam | undefined {
  ensurePersistedAdminContentLoaded();
  const normalizedSlug = normalizeTeamSlug(slug, "");
  const team = TEAM_LIST.find((item) => item.slug === normalizedSlug);
  return team ? clone(team) : undefined;
}

export function createAdminTeam(input: Record<string, unknown>): StoreTeam {
  ensurePersistedAdminContentLoaded();

  const now = new Date().toISOString();
  const name = sanitizeString(input.name) || "Untitled team";
  const slug = normalizeTeamSlug(
    input.slug,
    normalizeTeamSlug(name, `team-${Date.now().toString(36)}`),
  );
  const ownerId =
    typeof input.ownerId === "string" && input.ownerId.trim()
      ? input.ownerId.trim()
      : null;
  const team: StoreTeam = {
    id: sanitizeString(input.id) || createRuntimeId("team"),
    name,
    slug,
    ownerId,
    settings: normalizeTeamSettings(input.settings, { plan: "free" }),
    createdAt: now,
    updatedAt: now,
  };

  TEAM_LIST.unshift(team);
  if (ownerId) {
    TEAM_MEMBERS.push({
      id: createRuntimeId("team_member"),
      teamId: team.id,
      userId: ownerId,
      role: "owner",
      joinedAt: now,
    });
  }
  persistAdminContent();
  return clone(team);
}

export function updateAdminTeam(
  teamId: string,
  input: Record<string, unknown>,
): StoreTeam | undefined {
  ensurePersistedAdminContentLoaded();

  const index = TEAM_LIST.findIndex((team) => team.id === teamId);
  if (index === -1) {
    return undefined;
  }

  const current = TEAM_LIST[index];
  const updated: StoreTeam = {
    ...current,
    name:
      input.name === undefined
        ? current.name
        : sanitizeString(input.name) || current.name,
    slug:
      input.slug === undefined
        ? current.slug
        : normalizeTeamSlug(input.slug, current.slug),
    ownerId:
      input.ownerId === undefined
        ? current.ownerId
        : input.ownerId === null
          ? null
          : sanitizeString(input.ownerId) || current.ownerId,
    settings:
      input.settings === undefined
        ? current.settings
        : normalizeTeamSettings(input.settings, current.settings),
    updatedAt: new Date().toISOString(),
  };

  TEAM_LIST[index] = updated;
  persistAdminContent();
  return clone(updated);
}

export function deleteAdminTeam(teamId: string): boolean {
  ensurePersistedAdminContentLoaded();

  const index = TEAM_LIST.findIndex((team) => team.id === teamId);
  if (index === -1) {
    return false;
  }

  TEAM_LIST.splice(index, 1);
  for (
    let memberIndex = TEAM_MEMBERS.length - 1;
    memberIndex >= 0;
    memberIndex -= 1
  ) {
    if (TEAM_MEMBERS[memberIndex].teamId === teamId) {
      TEAM_MEMBERS.splice(memberIndex, 1);
    }
  }
  persistAdminContent();
  return true;
}

export function listAdminTeamMembers(teamId: string): StoreTeamMember[] {
  ensurePersistedAdminContentLoaded();
  return clone(TEAM_MEMBERS.filter((member) => member.teamId === teamId));
}

export function addAdminTeamMember(
  input: Record<string, unknown>,
  options: { persist?: boolean } = {},
): StoreTeamMember {
  ensurePersistedAdminContentLoaded();

  const now = new Date().toISOString();
  const teamId = sanitizeString(input.teamId);
  const userId = sanitizeString(input.userId);
  const existingIndex = TEAM_MEMBERS.findIndex(
    (member) => member.teamId === teamId && member.userId === userId,
  );
  if (existingIndex !== -1) {
    TEAM_MEMBERS[existingIndex] = {
      ...TEAM_MEMBERS[existingIndex],
      role: normalizeTeamRole(
        input.role,
        TEAM_MEMBERS[existingIndex]?.role || "viewer",
      ),
    };
    if (options.persist !== false) persistAdminContent();
    return clone(TEAM_MEMBERS[existingIndex]);
  }

  const member: StoreTeamMember = {
    id: sanitizeString(input.id) || createRuntimeId("team_member"),
    teamId,
    userId,
    role: normalizeTeamRole(input.role, "viewer"),
    joinedAt: now,
  };

  TEAM_MEMBERS.push(member);
  if (options.persist !== false) persistAdminContent();
  return clone(member);
}

export function updateAdminTeamMemberRole(
  teamId: string,
  memberId: string,
  role: StoreTeamMember["role"],
): StoreTeamMember | undefined {
  ensurePersistedAdminContentLoaded();

  const index = TEAM_MEMBERS.findIndex(
    (member) => member.teamId === teamId && member.id === memberId,
  );
  if (index === -1) {
    return undefined;
  }

  TEAM_MEMBERS[index] = {
    ...TEAM_MEMBERS[index],
    role: normalizeTeamRole(role, TEAM_MEMBERS[index].role),
  };
  persistAdminContent();
  return clone(TEAM_MEMBERS[index]);
}

export function removeAdminTeamMember(
  teamId: string,
  memberId: string,
): boolean {
  ensurePersistedAdminContentLoaded();

  const index = TEAM_MEMBERS.findIndex(
    (member) => member.teamId === teamId && member.id === memberId,
  );
  if (index === -1) {
    return false;
  }

  TEAM_MEMBERS.splice(index, 1);
  persistAdminContent();
  return true;
}

const normalizeDeliveryMode = (
  value: unknown,
  fallback: StoreSettings["deliveryMode"] = "managed-hosting",
): StoreSettings["deliveryMode"] =>
  value === "managed-hosting" || value === "custom-frontend" ? value : fallback;

export function getAdminSettings(): StoreSettings {
  ensurePersistedAdminContentLoaded();
  return clone(SETTINGS);
}

/** Synchronous compare + mutation is atomic within this demo-store process. */
export function commitAdminOperatorSiteGrant(input: BackySettingsOperatorGrantCommitInput): StoreSettings {
  ensurePersistedAdminContentLoaded();
  const previous = SETTINGS;
  const auth = commitBackyOperatorSiteGrantAuth(SETTINGS.auth, input);
  SETTINGS = { ...SETTINGS, auth, updatedAt: new Date().toISOString() };
  try { persistAdminContent(true); } catch (error) { SETTINGS = previous; throw error; }
  return clone(SETTINGS);
}

export function updateAdminSettings(
  input: Record<string, unknown>,
): StoreSettings {
  ensurePersistedAdminContentLoaded();

  const apiKeysInput = toRecord(input.apiKeys);
  const authInput = asJsonObject(input.auth) || {};
  const integrationsInput = asJsonObject(input.integrations) || {};
  SETTINGS = {
    ...SETTINGS,
    deliveryMode:
      input.deliveryMode === undefined
        ? SETTINGS.deliveryMode
        : normalizeDeliveryMode(input.deliveryMode, SETTINGS.deliveryMode),
    apiKeys: {
      publicApiKey:
        apiKeysInput.publicApiKey === undefined
          ? SETTINGS.apiKeys.publicApiKey
          : sanitizeString(apiKeysInput.publicApiKey) ||
            SETTINGS.apiKeys.publicApiKey,
      adminApiKey:
        apiKeysInput.adminApiKey === undefined
          ? SETTINGS.apiKeys.adminApiKey
          : sanitizeString(apiKeysInput.adminApiKey) ||
            SETTINGS.apiKeys.adminApiKey,
    },
    auth:
      input.auth === undefined
        ? SETTINGS.auth
        : {
            ...(SETTINGS.auth || {}),
            ...preserveBackyOperatorSiteGrants(SETTINGS.auth, authInput),
          },
    integrations:
      input.integrations === undefined
        ? SETTINGS.integrations
        : {
            ...(SETTINGS.integrations || {}),
            ...integrationsInput,
          },
    updatedAt: new Date().toISOString(),
  };

  persistAdminContent();
  return clone(SETTINGS);
}

export function regenerateAdminApiKeys(
  kind: "all" | "public" | "admin" = "all",
  metadata: { actorId?: string | null; requestId?: string | null } = {},
): StoreSettings {
  ensurePersistedAdminContentLoaded();

  const previousApiKeys = { ...SETTINGS.apiKeys };
  const nextPublicApiKey =
    kind === "all" || kind === "public"
      ? createRuntimeApiKey("public")
      : SETTINGS.apiKeys.publicApiKey;
  const nextAdminApiKey =
    kind === "all" || kind === "admin"
      ? createRuntimeApiKey("admin")
      : SETTINGS.apiKeys.adminApiKey;
  const now = new Date().toISOString();

  const revocationEntries: ApiKeyRevocationHistoryEntry[] = [];
  if (previousApiKeys.publicApiKey !== nextPublicApiKey) {
    revocationEntries.push({
      id: createRuntimeId("key_revocation"),
      scope: kind,
      keyType: "public",
      revokedAt: now,
      actorId: metadata.actorId || null,
      requestId: metadata.requestId || null,
      reason: "rotated",
      revokedKeyFingerprint: keyFingerprint(previousApiKeys.publicApiKey),
      replacementKeyFingerprint: keyFingerprint(nextPublicApiKey),
    });
  }
  if (previousApiKeys.adminApiKey !== nextAdminApiKey) {
    revocationEntries.push({
      id: createRuntimeId("key_revocation"),
      scope: kind,
      keyType: "admin",
      revokedAt: now,
      actorId: metadata.actorId || null,
      requestId: metadata.requestId || null,
      reason: "rotated",
      revokedKeyFingerprint: keyFingerprint(previousApiKeys.adminApiKey),
      replacementKeyFingerprint: keyFingerprint(nextAdminApiKey),
    });
  }
  const authWithRotation = appendApiKeyRotationHistory(SETTINGS.auth, {
    id: createRuntimeId("key_rotation"),
    scope: kind,
    rotatedAt: now,
    actorId: metadata.actorId || null,
    requestId: metadata.requestId || null,
    publicKeyChanged: previousApiKeys.publicApiKey !== nextPublicApiKey,
    adminKeyChanged: previousApiKeys.adminApiKey !== nextAdminApiKey,
    previousPublicKeyFingerprint: keyFingerprint(previousApiKeys.publicApiKey),
    newPublicKeyFingerprint: keyFingerprint(nextPublicApiKey),
    previousAdminKeyFingerprint: keyFingerprint(previousApiKeys.adminApiKey),
    newAdminKeyFingerprint: keyFingerprint(nextAdminApiKey),
  });

  SETTINGS = {
    ...SETTINGS,
    apiKeys: {
      publicApiKey: nextPublicApiKey,
      adminApiKey: nextAdminApiKey,
    },
    auth: appendApiKeyRevocationHistory(authWithRotation, revocationEntries),
    updatedAt: now,
  };

  persistAdminContent();
  return clone(SETTINGS);
}

const COLLECTION_FIELD_TYPES: CollectionFieldType[] = [
  "text",
  "richText",
  "number",
  "boolean",
  "date",
  "datetime",
  "image",
  "video",
  "file",
  "reference",
  "multiReference",
  "select",
  "tags",
  "url",
  "email",
  "phone",
  "slug",
  "json",
];

const normalizeCollectionFieldType = (value: unknown): CollectionFieldType => {
  const normalized = sanitizeString(value);
  return COLLECTION_FIELD_TYPES.includes(normalized as CollectionFieldType)
    ? (normalized as CollectionFieldType)
    : "text";
};

const normalizeCollectionFieldKey = (
  value: unknown,
  fallback: string,
): string => normalizeSlugInput(value, fallback).replace(/-/g, "_");

const normalizeCollectionField = (
  raw: unknown,
  index: number,
  existing?: StoreCollectionField,
): StoreCollectionField => {
  const input = toRecord(raw);
  const label =
    sanitizeString(input.label) ||
    sanitizeString(input.name) ||
    existing?.label ||
    `Field ${index + 1}`;
  const key = normalizeCollectionFieldKey(
    input.key || input.slug || label,
    existing?.key || `field_${index + 1}`,
  );
  const options = Array.isArray(input.options)
    ? input.options.map(sanitizeString).filter(Boolean)
    : existing?.options;

  return {
    ...normalizeBackyJsonObject(input),
    id: sanitizeString(input.id) || existing?.id || createRuntimeId("field"),
    key,
    label,
    type:
      input.type === undefined
        ? existing?.type || "text"
        : normalizeCollectionFieldType(input.type),
    required:
      input.required === undefined
        ? (existing?.required ?? false)
        : parseBooleanInput(input.required, false),
    unique:
      input.unique === undefined
        ? (existing?.unique ?? false)
        : parseBooleanInput(input.unique, false),
    sortOrder:
      Number(input.sortOrder) || existing?.sortOrder || (index + 1) * 10,
    helpText:
      input.helpText === undefined
        ? existing?.helpText || null
        : sanitizeString(input.helpText) || null,
    ...(options?.length ? { options } : {}),
    referenceCollectionId:
      input.referenceCollectionId === undefined
        ? existing?.referenceCollectionId || null
        : sanitizeString(input.referenceCollectionId) || null,
    ...(input.defaultValue !== undefined
      ? { defaultValue: input.defaultValue }
      : existing && "defaultValue" in existing
        ? { defaultValue: existing.defaultValue }
        : {}),
    ...(asJsonObject(input.validation)
      ? { validation: asJsonObject(input.validation) }
      : existing?.validation
        ? { validation: existing.validation }
        : {}),
  };
};

const normalizeCollectionFields = (
  rawFields: unknown,
  existingFields: StoreCollectionField[] = [],
): StoreCollectionField[] => {
  const source =
    Array.isArray(rawFields) && rawFields.length > 0
      ? rawFields
      : existingFields.length > 0
        ? existingFields
        : [
            {
              key: "title",
              label: "Title",
              type: "text",
              required: true,
              unique: false,
            },
            {
              key: "slug",
              label: "Slug",
              type: "slug",
              required: true,
              unique: true,
            },
          ];
  const usedKeys = new Set<string>();

  return source
    .map((field, index) => {
      const normalized = normalizeCollectionField(
        field,
        index,
        existingFields[index],
      );
      let key = normalized.key;
      let suffix = 2;
      while (usedKeys.has(key)) {
        key = `${normalized.key}_${suffix}`;
        suffix += 1;
      }
      usedKeys.add(key);
      return {
        ...normalized,
        key,
      };
    })
    .sort(
      (a, b) => a.sortOrder - b.sortOrder || a.label.localeCompare(b.label),
    );
};

const normalizeCollectionPermissions = (
  value: unknown,
  existing?: StoreCollectionPermissions,
): StoreCollectionPermissions => {
  const input = toRecord(value);
  const base = existing || {
    publicRead: true,
    publicCreate: false,
    publicUpdate: false,
    publicDelete: false,
  };

  return {
    publicRead:
      input.publicRead === undefined
        ? base.publicRead
        : parseBooleanInput(input.publicRead, base.publicRead),
    publicCreate:
      input.publicCreate === undefined
        ? base.publicCreate
        : parseBooleanInput(input.publicCreate, base.publicCreate),
    publicUpdate:
      input.publicUpdate === undefined
        ? base.publicUpdate
        : parseBooleanInput(input.publicUpdate, base.publicUpdate),
    publicDelete:
      input.publicDelete === undefined
        ? base.publicDelete
        : parseBooleanInput(input.publicDelete, base.publicDelete),
  };
};

const collectionFieldValidationRecord = (
  field: StoreCollectionField,
): BackyJsonObject =>
  field.validation &&
  typeof field.validation === "object" &&
  !Array.isArray(field.validation)
    ? field.validation
    : {};

const isCollectionMultiFileField = (field: StoreCollectionField): boolean => {
  if (field.type !== "file") return false;
  const validation = collectionFieldValidationRecord(field);
  return (
    validation.multiple === true || Number.isFinite(Number(validation.maxItems))
  );
};

const collectionFileMaxItems = (field: StoreCollectionField): number | null => {
  const maxItems = Number(collectionFieldValidationRecord(field).maxItems);
  return Number.isFinite(maxItems) && maxItems > 0
    ? Math.floor(maxItems)
    : null;
};

const normalizeCollectionListValue = (value: unknown): string[] => {
  if (Array.isArray(value)) {
    return value.map(sanitizeString).filter(Boolean);
  }
  const text = sanitizeString(value);
  return text
    ? text
        .split(/[\n,]/)
        .map((item) => item.trim())
        .filter(Boolean)
    : [];
};

const normalizeCollectionRecordValue = (
  type: CollectionFieldType,
  value: unknown,
): unknown => {
  if (value === null || value === undefined) {
    return null;
  }

  if (type === "number") {
    if (typeof value === "string" && !value.trim()) return null;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  if (type === "boolean") {
    return parseBooleanInput(value, false);
  }

  if (type === "multiReference") {
    return Array.isArray(value)
      ? value.map(sanitizeString).filter(Boolean)
      : sanitizeString(value)
        ? [sanitizeString(value)]
        : [];
  }

  if (type === "tags") {
    return Array.isArray(value)
      ? value.map(sanitizeString).filter(Boolean)
      : sanitizeString(value)
        ? sanitizeString(value)
            .split(",")
            .map((item) => item.trim())
            .filter(Boolean)
        : [];
  }

  if (type === "json") {
    return value;
  }

  return sanitizeString(value);
};

const normalizeCollectionRecordFieldValue = (
  field: StoreCollectionField,
  value: unknown,
): unknown => {
  if (isCollectionMultiFileField(field)) {
    return normalizeCollectionListValue(value);
  }
  return normalizeCollectionRecordValue(field.type, value);
};

export const normalizeCollectionRecordValues = (
  collection: StoreCollection,
  values: Record<string, unknown>,
  existingValues: Record<string, unknown> = {},
): Record<string, unknown> => {
  values = normalizeBackyJsonObject(values);
  existingValues = normalizeBackyJsonObject(existingValues);
  const normalized: Record<string, unknown> = {};

  for (const field of collection.fields) {
    if (values[field.key] !== undefined) {
      normalized[field.key] = normalizeCollectionRecordFieldValue(
        field,
        values[field.key],
      );
      continue;
    }

    if (existingValues[field.key] !== undefined) {
      normalized[field.key] = normalizeCollectionRecordFieldValue(field, existingValues[field.key]);
      continue;
    }

    if ("defaultValue" in field) {
      normalized[field.key] = normalizeCollectionRecordFieldValue(
        field,
        field.defaultValue,
      );
    }
  }

  for (const [key, value] of Object.entries(existingValues)) {
    if (!(key in normalized) && values[key] === undefined) {
      normalized[key] = value;
    }
  }

  for (const [key, value] of Object.entries(values)) {
    if (!(key in normalized)) {
      normalized[key] = value;
    }
  }

  return normalized;
};

export function listCollections(
  siteId: string,
  options: { includeUnpublished?: boolean } = {},
): StoreCollection[] {
  ensurePersistedAdminContentLoaded();

  const collections = COLLECTIONS.filter(
    (collection) =>
      collection.siteId === siteId &&
      (options.includeUnpublished ||
        (collection.status === "published" &&
          collection.permissions.publicRead)),
  );

  return clone(collections);
}

export function getCollectionByIdOrSlug(
  siteId: string,
  identifier: string,
  options: { includeUnpublished?: boolean } = {},
): StoreCollection | undefined {
  ensurePersistedAdminContentLoaded();

  const normalized = normalizeIdentifier(identifier);
  const collection = COLLECTIONS.find(
    (item) =>
      item.siteId === siteId &&
      (normalizeIdentifier(item.id) === normalized ||
        normalizeIdentifier(item.slug) === normalized),
  );

  if (!collection) {
    return undefined;
  }

  if (
    !options.includeUnpublished &&
    (collection.status !== "published" || !collection.permissions.publicRead)
  ) {
    return undefined;
  }

  return clone(collection);
}

const prepareAdminCollection = (
  siteId: string,
  input: Record<string, unknown>,
): StoreCollection => {

  const now = new Date().toISOString();
  const name = sanitizeString(input.name) || "Untitled collection";
  const slug = normalizeSlugInput(input.slug || name, "collection");
  const collection: StoreCollection = {
    id: sanitizeString(input.id) || createRuntimeId("collection"),
    siteId,
    name,
    slug,
    listRoutePattern: normalizeCollectionListRoutePattern(
      sanitizeString(input.listRoutePattern),
      slug,
    ),
    routePattern: normalizeCollectionRoutePattern(
      sanitizeString(input.routePattern),
      slug,
    ),
    description: sanitizeString(input.description) || null,
    status: parseStatusInput(
      input.status,
      ["draft", "published", "archived"] as const,
      "draft",
    ),
    fields: normalizeCollectionFields(input.fields),
    permissions: normalizeCollectionPermissions(input.permissions),
    metadata: asJsonObject(input.metadata) || {},
    createdAt: now,
    updatedAt: now,
  };

  return collection;
};

export function createAdminCollection(siteId: string, input: Record<string, unknown>): StoreCollection {
  ensurePersistedAdminContentLoaded();
  const collection = prepareAdminCollection(siteId, input);
  COLLECTIONS.unshift(collection); persistAdminContent(); return clone(collection);
}

export function updateAdminCollection(
  siteId: string,
  collectionId: string,
  input: Record<string, unknown>,
): StoreCollection | undefined {
  ensurePersistedAdminContentLoaded();

  const index = COLLECTIONS.findIndex(
    (collection) =>
      collection.siteId === siteId && collection.id === collectionId,
  );
  if (index === -1) {
    return undefined;
  }

  const current = COLLECTIONS[index];
  assertBackyCollectionExpectation(current as never,input as never);
  const details = input.beforeUpdateCollectionDesignRevision as any;
  if(details)assertCollectionDesignOnlyUpdate(current as never,input as never);
  const nextSlug =
    input.slug === undefined
      ? current.slug
      : normalizeSlugInput(input.slug, current.slug);
  const currentDefaultRoutePattern = defaultCollectionRoutePattern({
    slug: current.slug,
  });
  const currentRoutePattern = normalizeCollectionRoutePattern(
    current.routePattern,
    current.slug,
  );
  const currentDefaultListRoutePattern = defaultCollectionListRoutePattern({
    slug: current.slug,
  });
  const currentListRoutePattern = normalizeCollectionListRoutePattern(
    current.listRoutePattern,
    current.slug,
  );
  const shouldRefreshDefaultRoutePattern =
    input.routePattern === undefined &&
    nextSlug !== current.slug &&
    currentRoutePattern === currentDefaultRoutePattern;
  const shouldRefreshDefaultListRoutePattern =
    input.listRoutePattern === undefined &&
    nextSlug !== current.slug &&
    currentListRoutePattern === currentDefaultListRoutePattern;
  const updated: StoreCollection = {
    ...current,
    name:
      input.name === undefined
        ? current.name
        : sanitizeString(input.name) || current.name,
    slug: nextSlug,
    listRoutePattern:
      input.listRoutePattern === undefined
        ? shouldRefreshDefaultListRoutePattern
          ? defaultCollectionListRoutePattern({ slug: nextSlug })
          : current.listRoutePattern
        : normalizeCollectionListRoutePattern(
            sanitizeString(input.listRoutePattern),
            nextSlug,
          ),
    routePattern:
      input.routePattern === undefined
        ? shouldRefreshDefaultRoutePattern
          ? defaultCollectionRoutePattern({ slug: nextSlug })
          : current.routePattern
        : normalizeCollectionRoutePattern(
            sanitizeString(input.routePattern),
            nextSlug,
          ),
    description:
      input.description === undefined
        ? current.description
        : sanitizeString(input.description) || null,
    status:
      input.status === undefined
        ? current.status
        : parseStatusInput(
            input.status,
            ["draft", "published", "archived"] as const,
            current.status,
          ),
    fields:
      input.fields === undefined
        ? current.fields
        : details ? clone(input.fields as StoreCollectionField[]) : normalizeCollectionFields(input.fields, current.fields),
    permissions:
      input.permissions === undefined
        ? current.permissions
        : normalizeCollectionPermissions(
            input.permissions,
            current.permissions,
          ),
    metadata:
      input.metadata === undefined
        ? current.metadata
        : asJsonObject(input.metadata) || {},
    updatedAt: new Date(Math.max(Date.now(),Date.parse(current.updatedAt)+1)).toISOString(),
  };

  const revision: BackyCollectionDesignRevision|null = details ? {id:randomUUID(),siteId,collectionId:current.id,snapshot:snapshotCollectionTemplateDesign(current as never),...details,templateId:details.templateId||null,targetRevisionId:details.targetRevisionId||null,actorId:details.actorId||null,createdAt:new Date().toISOString()} : null;
  if(revision)COLLECTION_DESIGN_REVISIONS.push(revision);
  COLLECTIONS[index] = updated;
  try {persistAdminContent(true);}catch(error){COLLECTIONS[index]=current;if(revision)COLLECTION_DESIGN_REVISIONS.splice(COLLECTION_DESIGN_REVISIONS.indexOf(revision),1);throw error;}
  return clone(updated);
}

/** One synchronous demo-store commit; no intermediate snapshots or provider operations. */
export function applyAdminCollectionImport(siteId: string, operations: BackyCollectionImportOperation[]): BackyCollectionImportResult {
  ensurePersistedAdminContentLoaded(true);
  if (!SITE_LIST.some(site => site.id === siteId)) throw new BackyCollectionImportConflictError();
  const beforeCollections = [...COLLECTIONS], beforeRecords = [...COLLECTION_RECORDS], beforeMedia = clone(MEDIA_LIBRARY);
  const pendingCollections = [...COLLECTIONS], pendingRecords = [...COLLECTION_RECORDS];
  const collections: StoreCollection[] = [], records: StoreCollectionRecord[] = [];
  let createdCollections = 0, updatedCollections = 0, createdRecords = 0, updatedRecords = 0;
  for (const operation of operations) {
    const current = pendingCollections.find(item => item.siteId === siteId && item.slug === operation.input.slug) || null;
    const existingRecords = current ? pendingRecords.filter(item => item.siteId === siteId && item.collectionId === current.id) : [];
    assertBackyCollectionImportExpectation(siteId, operation, current as never, existingRecords as never);
    const collection = { ...current, ...prepareAdminCollection(siteId, { ...current, ...operation.input }), ...(current ? { id: current.id, createdAt: current.createdAt } : {}) };
    if (current) { pendingCollections[pendingCollections.indexOf(current)] = collection; updatedCollections++; }
    else { pendingCollections.unshift(collection); createdCollections++; }
    collections.push(collection);
    for (const record of operation.records) {
      const now = new Date().toISOString();
      const saved: StoreCollectionRecord = { ...record.expectedRecord, id: record.expectedRecord?.id || createRuntimeId('record'), siteId, collectionId: collection.id,
        slug: record.input.slug || 'record', status: record.input.status || 'draft', values: clone(record.input.values),
        createdAt: record.expectedRecord?.createdAt || now, updatedAt: now,
        publishedAt: record.input.status === 'published' ? record.expectedRecord?.publishedAt || now : record.expectedRecord?.publishedAt || null,
        scheduledAt: record.input.scheduledAt || null };
      if (record.expectedRecord) { const index = pendingRecords.findIndex(item => item.id === record.expectedRecord!.id && item.siteId === siteId && item.collectionId === collection.id); if (index < 0) throw new BackyCollectionImportConflictError(); pendingRecords[index] = saved; updatedRecords++; }
      else { pendingRecords.unshift(saved); createdRecords++; }
      records.push(saved);
    }
  }
  COLLECTIONS.splice(0, COLLECTIONS.length, ...pendingCollections); COLLECTION_RECORDS.splice(0, COLLECTION_RECORDS.length, ...pendingRecords);
  try {
    persistAdminContent(true);
  } catch (error) {
    COLLECTIONS.splice(0, COLLECTIONS.length, ...beforeCollections); COLLECTION_RECORDS.splice(0, COLLECTION_RECORDS.length, ...beforeRecords); MEDIA_LIBRARY.splice(0, MEDIA_LIBRARY.length, ...beforeMedia); throw error;
  }
  // The media index is derived from durable records and stored separately in demo mode.
  for (const record of records) syncMediaReferencesForCollectionRecord(siteId, record.collectionId, record.id, record.values);
  return clone({ collections, records, createdCollections, updatedCollections, createdRecords, updatedRecords }) as unknown as BackyCollectionImportResult;
}

export function deleteAdminCollection(
  siteId: string,
  collectionId: string,
): boolean {
  ensurePersistedAdminContentLoaded();

  const index = COLLECTIONS.findIndex(
    (collection) =>
      collection.siteId === siteId && collection.id === collectionId,
  );
  if (index === -1) {
    return false;
  }

  for(let i=COLLECTION_DESIGN_REVISIONS.length-1;i>=0;i--)if(COLLECTION_DESIGN_REVISIONS[i].siteId===siteId&&COLLECTION_DESIGN_REVISIONS[i].collectionId===collectionId)COLLECTION_DESIGN_REVISIONS.splice(i,1);
  COLLECTIONS.splice(index, 1);
  for (
    let recordIndex = COLLECTION_RECORDS.length - 1;
    recordIndex >= 0;
    recordIndex -= 1
  ) {
    if (
      COLLECTION_RECORDS[recordIndex].siteId === siteId &&
      COLLECTION_RECORDS[recordIndex].collectionId === collectionId
    ) {
      COLLECTION_RECORDS.splice(recordIndex, 1);
    }
  }

  for (let i = PRODUCT_DESIGN_REVISIONS.length - 1; i >= 0; i--) if (PRODUCT_DESIGN_REVISIONS[i].siteId === siteId && PRODUCT_DESIGN_REVISIONS[i].collectionId === collectionId) PRODUCT_DESIGN_REVISIONS.splice(i, 1);
  persistAdminContent();
  return true;
}

const normalizeReusableSectionContent = (
  value: unknown,
  existing?: PageContent,
): PageContent => {
  const input = toRecord(value);
  const canvasSizeInput = toRecord(input.canvasSize);
  const existingCanvasSize = existing?.canvasSize || {
    width: 1200,
    height: 600,
  };
  const contentDocument = isBackyContentDocument(input.contentDocument)
    ? clone(input.contentDocument)
    : isObjectRecord(input.contentDocument)
      ? clone(input.contentDocument)
    : existing?.contentDocument;
  const mergedCanvasSize = { ...existingCanvasSize, ...toRecord(toRecord(toRecord(contentDocument).metadata).canvasSize), ...canvasSizeInput };
  const canvasSize: BackyCanvasSize = {
    ...clone(mergedCanvasSize),
    width: Number(mergedCanvasSize.width) || 1200,
    height: Number(mergedCanvasSize.height) || 600,
  };
  const designStateValue = <T = unknown>(key: string): T | undefined => {
    if (input[key] === undefined) return existing?.[key as keyof PageContent] as T | undefined;
    const next = input[key];
    return Array.isArray(next) || isObjectRecord(next) ? clone(next) as T : undefined;
  };

  return {
    ...clone(existing || {}),
    ...clone(input),
    elements: Array.isArray(input.elements)
      ? clone(input.elements as CanvasElement[])
      : existing?.elements
        ? clone(existing.elements)
        : [],
    canvasSize,
    customCSS:
      input.customCSS === undefined
        ? existing?.customCSS
        : sanitizeString(input.customCSS),
    customJS:
      input.customJS === undefined
        ? existing?.customJS
        : sanitizeString(input.customJS),
    ...(contentDocument ? { contentDocument: { ...contentDocument, metadata: { ...toRecord(toRecord(contentDocument).metadata), canvasSize } } } : {}),
    themeTokenRefs: designStateValue<Record<string, string>>("themeTokenRefs"),
    assets: designStateValue<unknown[] | Record<string, unknown>>("assets"),
    animations: designStateValue<unknown[] | Record<string, unknown>>("animations"),
    interactions: designStateValue<unknown[] | Record<string, unknown>>("interactions"),
    dataBindings: designStateValue<Record<string, unknown>>("dataBindings"),
    editableMap: designStateValue<Record<string, unknown>>("editableMap"),
    seo: designStateValue<Record<string, unknown>>("seo"),
    metadata: designStateValue<Record<string, unknown>>("metadata"),
  };
};

const normalizeReusableSectionTags = (
  value: unknown,
  existing: string[] = [],
): string[] => {
  const source = value === undefined ? existing : value;
  const tags = Array.isArray(source)
    ? source.map(sanitizeString)
    : sanitizeString(source).split(",");

  return Array.from(new Set(tags.map((tag) => tag.trim()).filter(Boolean)));
};

export function listReusableSections(
  siteId: string,
  params: {
    status?: StoreReusableSection["status"] | "all";
    category?: string;
    tag?: string;
    search?: string;
  } = {},
): StoreReusableSection[] {
  ensurePersistedAdminContentLoaded();

  const status = params.status || "active";
  const category = sanitizeString(params.category).toLowerCase();
  const tag = sanitizeString(params.tag).toLowerCase();
  const search = sanitizeString(params.search).toLowerCase();

  const sections = REUSABLE_SECTIONS.filter((section) => {
    if (section.siteId !== siteId) return false;
    if (status !== "all" && section.status !== status) return false;
    if (category && section.category.toLowerCase() !== category) return false;
    if (tag && !section.tags.some((item) => item.toLowerCase() === tag))
      return false;
    if (search) {
      const haystack = [
        section.name,
        section.slug,
        section.description || "",
        section.category,
        ...section.tags,
      ]
        .join(" ")
        .toLowerCase();
      if (!haystack.includes(search)) return false;
    }
    return true;
  }).sort(
    (a, b) =>
      b.updatedAt.localeCompare(a.updatedAt) || a.name.localeCompare(b.name),
  );

  return clone(sections);
}

export function getReusableSectionByIdOrSlug(
  siteId: string,
  identifier: string,
): StoreReusableSection | undefined {
  ensurePersistedAdminContentLoaded();

  const normalized = normalizeIdentifier(identifier);
  const section = REUSABLE_SECTIONS.find(
    (item) =>
      item.siteId === siteId &&
      (normalizeIdentifier(item.id) === normalized ||
        normalizeIdentifier(item.slug) === normalized),
  );

  return section ? clone(section) : undefined;
}

function prepareReusableSection(
  siteId: string,
  input: Record<string, unknown>,
): StoreReusableSection {
  const now = new Date().toISOString();
  const name = sanitizeString(input.name) || "Untitled reusable section";
  const section: StoreReusableSection = {
    id: sanitizeString(input.id) || createRuntimeId("section"),
    siteId,
    name,
    slug: normalizeSlugInput(input.slug || name, "section"),
    description: sanitizeString(input.description) || null,
    category: sanitizeString(input.category) || "general",
    status: parseStatusInput(
      input.status,
      ["active", "archived"] as const,
      "active",
    ),
    tags: normalizeReusableSectionTags(input.tags),
    content: normalizeReusableSectionContent(input.content),
    metadata: asJsonObject(input.metadata) || {},
    sourceElementId: sanitizeString(input.sourceElementId) || null,
    createdBy: sanitizeString(input.createdBy) || "admin",
    updatedBy:
      sanitizeString(input.updatedBy) ||
      sanitizeString(input.createdBy) ||
      "admin",
    createdAt: now,
    updatedAt: now,
  };

  return section;
}

export function createReusableSection(siteId: string, input: Record<string, unknown>): StoreReusableSection {
  ensurePersistedAdminContentLoaded();
  const section = prepareReusableSection(siteId, input);
  REUSABLE_SECTIONS.unshift(section);
  persistAdminContent();
  return clone(section);
}

function prepareReusableSectionUpdate(current: StoreReusableSection, input: Record<string, unknown>): StoreReusableSection {
  assertBackyReusableSectionExpectation(input, current);
  const updated: StoreReusableSection = {
    ...current,
    name:
      input.name === undefined
        ? current.name
        : sanitizeString(input.name) || current.name,
    slug:
      input.slug === undefined
        ? current.slug
        : normalizeSlugInput(input.slug, current.slug),
    description:
      input.description === undefined
        ? current.description
        : sanitizeString(input.description) || null,
    category:
      input.category === undefined
        ? current.category
        : sanitizeString(input.category) || current.category,
    status:
      input.status === undefined
        ? current.status
        : parseStatusInput(
            input.status,
            ["active", "archived"] as const,
            current.status,
          ),
    tags:
      input.tags === undefined
        ? current.tags
        : normalizeReusableSectionTags(input.tags, current.tags),
    content:
      input.content === undefined
        ? current.content
        : normalizeReusableSectionContent(input.content, current.content),
    metadata:
      input.metadata === undefined
        ? current.metadata
        : asJsonObject(input.metadata) || {},
    sourceElementId:
      input.sourceElementId === undefined
        ? current.sourceElementId
        : sanitizeString(input.sourceElementId) || null,
    updatedBy:
      input.updatedBy === undefined
        ? current.updatedBy
        : sanitizeString(input.updatedBy) || current.updatedBy,
    updatedAt: new Date().toISOString(),
  };

  return updated;
}

export function updateReusableSection(
  siteId: string,
  sectionId: string,
  input: Record<string, unknown>,
): StoreReusableSection | undefined {
  ensurePersistedAdminContentLoaded();

  const index = REUSABLE_SECTIONS.findIndex(
    (section) => section.siteId === siteId && section.id === sectionId,
  );
  if (index === -1) {
    return undefined;
  }

  const current = REUSABLE_SECTIONS[index];
  const updated = prepareReusableSectionUpdate(current, input);
  REUSABLE_SECTIONS[index] = updated;
  try { persistAdminContent(input.expectedSection !== undefined); }
  catch (error) { REUSABLE_SECTIONS[index] = current; throw error; }
  return clone(updated);
}

/** Demo-only single-process atomic import; one strict snapshot rename, rollback on failure. */
export function applyReusableSectionBatch(siteId: string, operations: BackyReusableSectionBatchMutation[]): StoreReusableSection[] {
  ensurePersistedAdminContentLoaded();
  const before = [...REUSABLE_SECTIONS], pending = [...before], items: StoreReusableSection[] = [];
  for (const operation of operations) {
    if (operation.type === 'create') {
      if (operation.input.siteId !== siteId || pending.some(item => item.siteId === siteId && item.slug === operation.input.slug)) throw new BackyReusableSectionConflictError();
      const item = prepareReusableSection(siteId, operation.input as unknown as Record<string, unknown>);
      pending.unshift(item); items.push(item);
    } else {
      const index = pending.findIndex(item => item.siteId === siteId && item.id === operation.sectionId);
      if (index === -1) throw new BackyReusableSectionConflictError();
      const item = prepareReusableSectionUpdate(pending[index], operation.input as unknown as Record<string, unknown>);
      if (pending.some(other => other.siteId === siteId && other.id !== item.id && other.slug === item.slug)) throw new BackyReusableSectionConflictError();
      pending[index] = item; items.push(item);
    }
  }
  REUSABLE_SECTIONS.splice(0, REUSABLE_SECTIONS.length, ...pending);
  try { persistAdminContent(true); }
  catch (error) { REUSABLE_SECTIONS.splice(0, REUSABLE_SECTIONS.length, ...before); throw error; }
  return clone(items);
}

/** Synchronous single-process demo propagation; one strict durable commit including revisions. */
export function applyReusableSectionPropagation(siteId: string, input: BackyReusableSectionPropagationInput, actor: string): string[] {
  ensurePersistedAdminContentLoaded(true);
  const source = REUSABLE_SECTIONS.find(section => section.siteId === siteId && section.id === input.source.id);
  try { assertBackyReusableSectionExpectation({ expectedSection: input.source }, source); }
  catch { throw new BackyReusableSectionPropagationConflictError(); }
  if (input.source.siteId !== siteId) throw new BackyReusableSectionPropagationConflictError();
  const included = (type: string) => input.scope.targetType === 'all' || input.scope.targetType === type;
  const selected = (item: { id: string; siteId: string }) => item.siteId === siteId && (!input.scope.targetId || item.id === input.scope.targetId);
  if (included('product') && input.scope.includeProducts) {
    const productCollection = COLLECTIONS.find(item => item.siteId === siteId && item.slug === 'products');
    if (productCollection?.id !== input.scope.productCollectionId) throw new BackyReusableSectionPropagationConflictError();
  }
  const inventory: BackyReusableSectionPropagationTarget[] = [
    ...(included('page') ? PAGE_LIST.filter(selected).map(item => ({ type: 'page' as const, id: item.id, updatedAt: item.updatedAt, content: item.content })) : []),
    ...(included('post') ? BLOG_POSTS.filter(selected).map(item => ({ type: 'post' as const, id: item.id, updatedAt: item.updatedAt, content: item.content })) : []),
    ...(included('product') && input.scope.includeProducts ? COLLECTION_RECORDS.filter(item => selected(item) && item.collectionId === input.scope.productCollectionId).map(item => ({ type: 'product' as const, id: item.id, collectionId: item.collectionId, updatedAt: item.updatedAt, values: item.values })) : []),
  ];
  assertBackyReusableSectionPropagationInventory(input.inventory, inventory);
  const beforePages = [...PAGE_LIST], beforePosts = [...BLOG_POSTS], beforeRecords = [...COLLECTION_RECORDS], beforeRevisions = [...CONTENT_REVISIONS];
  const touched = new Set<string>();
  const prepared = input.mutations.map(mutation => {
    const key = `${mutation.expected.type}:${mutation.expected.id}`;
    const baseline = inventory.find(item => `${item.type}:${item.id}` === key);
    if (!baseline || touched.has(key)) throw new BackyReusableSectionPropagationConflictError();
    touched.add(key); assertBackyReusableSectionPropagationInventory([mutation.expected], [baseline]);
    if (baseline.type === 'product') {
      const current = COLLECTION_RECORDS.find(item => item.siteId === siteId && item.id === baseline.id && item.collectionId === baseline.collectionId);
      const collection = COLLECTIONS.find(item => item.siteId === siteId && item.id === baseline.collectionId);
      if (!current || !collection || !mutation.values) throw new BackyReusableSectionPropagationConflictError();
      return { type: baseline.type, current, next: { ...current, values: normalizeCollectionRecordValues(collection, mutation.values, current.values), updatedAt: new Date(Math.max(Date.now(), Date.parse(current.updatedAt) + 1)).toISOString() } };
    }
    const current = (baseline.type === 'page' ? PAGE_LIST : BLOG_POSTS).find(item => selected(item) && item.id === baseline.id);
    if (!current || !mutation.content) throw new BackyReusableSectionPropagationConflictError();
    return { type: baseline.type, current, next: { ...current, content: pageContentFromCanvasInput(mutation.content, { id: current.id, kind: baseline.type, title: current.title, slug: current.slug, status: current.status, existing: current.content as PageContent }), updatedAt: new Date(Math.max(Date.now(), Date.parse(current.updatedAt) + 1)).toISOString() } };
  });
  try {
    for (const plan of prepared) {
      if (plan.type === 'product') COLLECTION_RECORDS[COLLECTION_RECORDS.findIndex(item => item === plan.current)] = plan.next as StoreCollectionRecord;
      else {
        createContentRevision(plan.type, plan.current as StorePage | StoreBlogPost, `Before reusable section ${input.source.name} refresh`, actor, { operation: 'update' });
        if (plan.type === 'page') PAGE_LIST[PAGE_LIST.findIndex(item => item === plan.current)] = plan.next as StorePage;
        else BLOG_POSTS[BLOG_POSTS.findIndex(item => item === plan.current)] = plan.next as unknown as StoreBlogPost;
      }
    }
    persistAdminContent(true);
  } catch (error) {
    PAGE_LIST.splice(0, PAGE_LIST.length, ...beforePages); BLOG_POSTS.splice(0, BLOG_POSTS.length, ...beforePosts); COLLECTION_RECORDS.splice(0, COLLECTION_RECORDS.length, ...beforeRecords); CONTENT_REVISIONS.splice(0, CONTENT_REVISIONS.length, ...beforeRevisions); throw error;
  }
  const warnings: string[] = [];
  for (const plan of prepared) {
    try {
      if (plan.type === 'product') { const item = plan.next as StoreCollectionRecord; syncMediaReferencesForCollectionRecord(siteId, item.collectionId, item.id, item.values); }
      else { const item = plan.next as StorePage | StoreBlogPost; syncMediaReferencesForTarget(siteId, plan.type, item.id, mediaReferencePayloadForContent(item.content, item.meta), 'featuredImageId' in item && item.featuredImageId ? [item.featuredImageId] : []); }
    } catch { warnings.push('Content committed; derived media reference indexing needs retry.'); }
  }
  return [...new Set(warnings)];
}

export function deleteReusableSection(
  siteId: string,
  sectionId: string,
): boolean {
  ensurePersistedAdminContentLoaded();

  const index = REUSABLE_SECTIONS.findIndex(
    (section) => section.siteId === siteId && section.id === sectionId,
  );
  if (index === -1) {
    return false;
  }

  REUSABLE_SECTIONS.splice(index, 1);
  persistAdminContent();
  return true;
}

const INTERACTIVE_COMPONENT_DATA_SCOPES = [
  "collections",
  "media",
  "forms",
  "commerce",
  "page",
  "blog",
] as const;

const normalizeInteractiveComponentKey = (
  value: unknown,
  fallback = "backy.custom.component",
): string => {
  const normalized = sanitizeString(value)
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, ".")
    .replace(/^[._-]+|[._-]+$/g, "");
  return normalized || fallback;
};

const normalizeInteractiveVersion = (
  value: unknown,
  fallback = "1.0.0",
): string => {
  const normalized = sanitizeString(value)
    .replace(/[^a-zA-Z0-9._+-]+/g, "")
    .slice(0, 40);
  return normalized || fallback;
};

const normalizeInteractiveType = (
  value: unknown,
  fallback: StoreInteractiveComponent["type"] = "codeComponent",
): StoreInteractiveComponent["type"] => {
  const normalized = sanitizeString(value);
  return normalized === "interactiveFigure" || normalized === "codeComponent"
    ? normalized
    : fallback;
};

const normalizeInteractiveStringList = (
  value: unknown,
  existing: string[] = [],
  allowed?: readonly string[],
): string[] => {
  const source = value === undefined ? existing : value;
  const raw = Array.isArray(source)
    ? source.map(sanitizeString)
    : sanitizeString(source).split(",");
  const allowedSet = allowed ? new Set(allowed) : null;
  return Array.from(
    new Set(
      raw
        .map((item) => item.trim())
        .filter((item) => item && (!allowedSet || allowedSet.has(item))),
    ),
  );
};

const normalizeInteractiveControls = (
  value: unknown,
  existing: Array<Record<string, unknown>> = [],
): Array<Record<string, unknown>> =>
  value === undefined
    ? clone(existing)
    : (toJsonObjectArray(value) || []).slice(0, 50);

const normalizeInteractiveFallback = (
  value: unknown,
  existing?: StoreInteractiveComponent["fallback"],
): StoreInteractiveComponent["fallback"] => {
  const input = toRecord(value);
  return {
    required:
      input.required === undefined
        ? existing?.required !== false
        : parseBooleanInput(input.required, true),
    supported: normalizeInteractiveStringList(
      input.supported,
      existing?.supported || [
        "title",
        "text",
        "html",
        "imageUrl",
        "alt",
        "ariaLabel",
      ],
    ),
  };
};

const normalizeInteractiveRuntime = (
  value: unknown,
  existing?: StoreInteractiveComponent["runtime"],
): StoreInteractiveComponent["runtime"] => {
  const input = toRecord(value);
  return {
    sandboxUrl:
      input.sandboxUrl === undefined
        ? existing?.sandboxUrl || null
        : sanitizeString(input.sandboxUrl) || null,
    bundleUrl:
      input.bundleUrl === undefined
        ? existing?.bundleUrl || null
        : sanitizeString(input.bundleUrl) || null,
    iframeSandbox:
      input.iframeSandbox === undefined
        ? existing?.iframeSandbox
        : sanitizeString(input.iframeSandbox) || undefined,
    allowedPermissions: normalizeInteractiveStringList(
      input.allowedPermissions,
      existing?.allowedPermissions || [],
    ),
    postMessageProtocol:
      sanitizeString(input.postMessageProtocol) ||
      existing?.postMessageProtocol ||
      "backy.interactive-component.v1",
  };
};

const normalizeInteractiveSecurity = (
  value: unknown,
  existing?: StoreInteractiveComponent["security"],
): StoreInteractiveComponent["security"] => ({
  ...(existing || {}),
  ...toRecord(value),
  adminApiAccess: false,
  parentDomAccess: false,
  parentCookieAccess: false,
  secretsInPayload: false,
  communication: "postMessage-only",
});

const normalizeInteractiveIntegrity = (
  value: unknown,
  existing?: StoreInteractiveComponent["integrity"],
): StoreInteractiveComponent["integrity"] => {
  const input = toRecord(value);
  return {
    signed:
      input.signed === undefined
        ? existing?.signed === true
        : parseBooleanInput(input.signed, false),
    signatureRequiredForCustomCode:
      input.signatureRequiredForCustomCode === undefined
        ? existing?.signatureRequiredForCustomCode === true
        : parseBooleanInput(input.signatureRequiredForCustomCode, true),
    algorithm: sanitizeString(input.algorithm) || existing?.algorithm,
    sha256: sanitizeString(input.sha256) || existing?.sha256,
    signature: sanitizeString(input.signature) || existing?.signature,
    signedBy:
      input.signedBy === undefined
        ? existing?.signedBy
        : sanitizeString(input.signedBy) || null,
    signedAt:
      input.signedAt === undefined
        ? existing?.signedAt
        : sanitizeString(input.signedAt) || null,
    storageProvider:
      sanitizeString(input.storageProvider) || existing?.storageProvider,
    storagePath: sanitizeString(input.storagePath) || existing?.storagePath,
    bundleUrl: sanitizeString(input.bundleUrl) || existing?.bundleUrl,
    sizeBytes:
      input.sizeBytes === undefined
        ? existing?.sizeBytes
        : Math.max(0, Number(input.sizeBytes) || 0),
    contentType: sanitizeString(input.contentType) || existing?.contentType,
    filename: sanitizeString(input.filename) || existing?.filename,
  };
};

export function listInteractiveComponents(
  siteId: string,
  params: {
    status?: StoreInteractiveComponent["status"] | "all";
    reviewStatus?: StoreInteractiveComponent["reviewStatus"] | "all";
    type?: StoreInteractiveComponent["type"] | "all";
    publicOnly?: boolean;
    search?: string;
  } = {},
): StoreInteractiveComponent[] {
  ensurePersistedAdminContentLoaded();

  const status = params.status || "all";
  const reviewStatus = params.reviewStatus || "all";
  const type = params.type || "all";
  const search = sanitizeString(params.search).toLowerCase();

  const components = INTERACTIVE_COMPONENTS.filter((component) => {
    if (component.siteId !== siteId) return false;
    if (params.publicOnly && component.reviewStatus !== "approved")
      return false;
    if (params.publicOnly && component.status !== "active") return false;
    if (status !== "all" && component.status !== status) return false;
    if (reviewStatus !== "all" && component.reviewStatus !== reviewStatus)
      return false;
    if (type !== "all" && component.type !== type) return false;
    if (search) {
      const haystack = [
        component.componentKey,
        component.displayName,
        component.description,
        component.version,
        ...component.allowedDataScopes,
      ]
        .join(" ")
        .toLowerCase();
      if (!haystack.includes(search)) return false;
    }
    return true;
  }).sort(
    (a, b) =>
      b.updatedAt.localeCompare(a.updatedAt) ||
      a.componentKey.localeCompare(b.componentKey),
  );

  return clone(components);
}

export function getInteractiveComponent(
  siteId: string,
  componentKey: string,
  version?: string,
): StoreInteractiveComponent | undefined {
  ensurePersistedAdminContentLoaded();

  const normalizedKey = normalizeInteractiveComponentKey(componentKey);
  const normalizedVersion = version ? normalizeInteractiveVersion(version) : "";
  const component = INTERACTIVE_COMPONENTS.find(
    (item) =>
      item.siteId === siteId &&
      item.componentKey === normalizedKey &&
      (!normalizedVersion || item.version === normalizedVersion),
  );

  return component ? clone(component) : undefined;
}

export function createInteractiveComponent(
  siteId: string,
  input: Record<string, unknown>,
): StoreInteractiveComponent {
  ensurePersistedAdminContentLoaded();

  const now = new Date().toISOString();
  const componentKey = normalizeInteractiveComponentKey(input.componentKey);
  const version = normalizeInteractiveVersion(input.version);
  const type = normalizeInteractiveType(input.type);
  const renderMode = parseStatusInput(
    input.renderMode,
    ["trusted-component", "sandbox-iframe", "static-fallback"] as const,
    type === "codeComponent" ? "sandbox-iframe" : "trusted-component",
  );
  const reviewStatus = parseStatusInput(
    input.reviewStatus,
    ["draft", "in_review", "approved", "rejected"] as const,
    "draft",
  );
  const status = parseStatusInput(
    input.status,
    ["active", "disabled", "archived"] as const,
    reviewStatus === "approved" ? "active" : "disabled",
  );

  const component: StoreInteractiveComponent = {
    id: sanitizeString(input.id) || createRuntimeId("interactive_component"),
    siteId,
    componentKey,
    displayName:
      sanitizeString(input.displayName) ||
      sanitizeString(input.name) ||
      componentKey,
    type,
    status,
    reviewStatus,
    version,
    renderMode,
    source: input.source === "registry" ? "registry" : "custom",
    description: sanitizeString(input.description),
    allowedDataScopes: normalizeInteractiveStringList(
      input.allowedDataScopes,
      [...INTERACTIVE_COMPONENT_DATA_SCOPES],
      INTERACTIVE_COMPONENT_DATA_SCOPES,
    ),
    requiredFields: normalizeInteractiveStringList(input.requiredFields, [
      "componentKey",
      "version",
      "fallback",
    ]),
    controls: normalizeInteractiveControls(input.controls),
    fallback: normalizeInteractiveFallback(input.fallback),
    security: normalizeInteractiveSecurity(input.security),
    integrity: normalizeInteractiveIntegrity(input.integrity),
    runtime: normalizeInteractiveRuntime(input.runtime),
    ownerId: sanitizeString(input.ownerId) || null,
    dependencyMetadata: asJsonObject(input.dependencyMetadata) || {},
    changelog: sanitizeString(input.changelog) || null,
    rollbackFromVersion: sanitizeString(input.rollbackFromVersion) || null,
    createdBy: sanitizeString(input.createdBy) || "admin",
    updatedBy:
      sanitizeString(input.updatedBy) ||
      sanitizeString(input.createdBy) ||
      "admin",
    reviewedBy:
      reviewStatus === "approved" || reviewStatus === "rejected"
        ? sanitizeString(input.reviewedBy) ||
          sanitizeString(input.updatedBy) ||
          "admin"
        : null,
    reviewedAt:
      reviewStatus === "approved" || reviewStatus === "rejected"
        ? sanitizeString(input.reviewedAt) || now
        : null,
    createdAt: now,
    updatedAt: now,
  };

  INTERACTIVE_COMPONENTS.unshift(component);
  persistAdminContent();
  return clone(component);
}

export function updateInteractiveComponent(
  siteId: string,
  componentKey: string,
  version: string,
  input: Record<string, unknown>,
): StoreInteractiveComponent | undefined {
  ensurePersistedAdminContentLoaded();

  const normalizedKey = normalizeInteractiveComponentKey(componentKey);
  const normalizedVersion = normalizeInteractiveVersion(version);
  const index = INTERACTIVE_COMPONENTS.findIndex(
    (component) =>
      component.siteId === siteId &&
      component.componentKey === normalizedKey &&
      component.version === normalizedVersion,
  );
  if (index === -1) {
    return undefined;
  }

  const current = INTERACTIVE_COMPONENTS[index];
  const nextReviewStatus =
    input.reviewStatus === undefined
      ? current.reviewStatus
      : parseStatusInput(
          input.reviewStatus,
          ["draft", "in_review", "approved", "rejected"] as const,
          current.reviewStatus,
        );
  const nextStatus =
    input.status === undefined
      ? current.status
      : parseStatusInput(
          input.status,
          ["active", "disabled", "archived"] as const,
          current.status,
        );
  const updatedAt = new Date().toISOString();
  const reviewed =
    nextReviewStatus === "approved" || nextReviewStatus === "rejected";

  const updated: StoreInteractiveComponent = {
    ...current,
    displayName:
      input.displayName === undefined
        ? current.displayName
        : sanitizeString(input.displayName) || current.displayName,
    type:
      input.type === undefined
        ? current.type
        : normalizeInteractiveType(input.type, current.type),
    status: nextStatus,
    reviewStatus: nextReviewStatus,
    renderMode:
      input.renderMode === undefined
        ? current.renderMode
        : parseStatusInput(
            input.renderMode,
            ["trusted-component", "sandbox-iframe", "static-fallback"] as const,
            current.renderMode,
          ),
    source:
      input.source === undefined
        ? current.source
        : input.source === "registry"
          ? "registry"
          : "custom",
    description:
      input.description === undefined
        ? current.description
        : sanitizeString(input.description),
    allowedDataScopes:
      input.allowedDataScopes === undefined
        ? current.allowedDataScopes
        : normalizeInteractiveStringList(
            input.allowedDataScopes,
            current.allowedDataScopes,
            INTERACTIVE_COMPONENT_DATA_SCOPES,
          ),
    requiredFields:
      input.requiredFields === undefined
        ? current.requiredFields
        : normalizeInteractiveStringList(
            input.requiredFields,
            current.requiredFields,
          ),
    controls: normalizeInteractiveControls(input.controls, current.controls),
    fallback:
      input.fallback === undefined
        ? current.fallback
        : normalizeInteractiveFallback(input.fallback, current.fallback),
    security:
      input.security === undefined
        ? current.security
        : normalizeInteractiveSecurity(input.security, current.security),
    integrity:
      input.integrity === undefined
        ? current.integrity
        : normalizeInteractiveIntegrity(input.integrity, current.integrity),
    runtime:
      input.runtime === undefined
        ? current.runtime
        : normalizeInteractiveRuntime(input.runtime, current.runtime),
    ownerId:
      input.ownerId === undefined
        ? current.ownerId
        : sanitizeString(input.ownerId) || null,
    dependencyMetadata:
      input.dependencyMetadata === undefined
        ? current.dependencyMetadata
        : asJsonObject(input.dependencyMetadata) || {},
    changelog:
      input.changelog === undefined
        ? current.changelog
        : sanitizeString(input.changelog) || null,
    rollbackFromVersion:
      input.rollbackFromVersion === undefined
        ? current.rollbackFromVersion
        : sanitizeString(input.rollbackFromVersion) || null,
    updatedBy:
      input.updatedBy === undefined
        ? current.updatedBy
        : sanitizeString(input.updatedBy) || current.updatedBy,
    reviewedBy: reviewed
      ? sanitizeString(input.reviewedBy) ||
        sanitizeString(input.updatedBy) ||
        current.reviewedBy ||
        "admin"
      : null,
    reviewedAt: reviewed
      ? sanitizeString(input.reviewedAt) || current.reviewedAt || updatedAt
      : null,
    updatedAt,
  };

  INTERACTIVE_COMPONENTS[index] = updated;
  persistAdminContent();
  return clone(updated);
}

export function deleteInteractiveComponent(
  siteId: string,
  componentKey: string,
  version: string,
): boolean {
  ensurePersistedAdminContentLoaded();

  const normalizedKey = normalizeInteractiveComponentKey(componentKey);
  const normalizedVersion = normalizeInteractiveVersion(version);
  const index = INTERACTIVE_COMPONENTS.findIndex(
    (component) =>
      component.siteId === siteId &&
      component.componentKey === normalizedKey &&
      component.version === normalizedVersion,
  );
  if (index === -1) {
    return false;
  }

  INTERACTIVE_COMPONENTS.splice(index, 1);
  persistAdminContent();
  return true;
}

export function rollbackInteractiveComponentVersion(
  siteId: string,
  componentKey: string,
  version: string,
  input: Record<string, unknown> = {},
):
  | {
      restored: StoreInteractiveComponent;
      disabledVersions: StoreInteractiveComponent[];
      restoredFromVersion: string | null;
    }
  | undefined {
  ensurePersistedAdminContentLoaded();

  const normalizedKey = normalizeInteractiveComponentKey(componentKey);
  const normalizedVersion = normalizeInteractiveVersion(version);
  const targetIndex = INTERACTIVE_COMPONENTS.findIndex(
    (component) =>
      component.siteId === siteId &&
      component.componentKey === normalizedKey &&
      component.version === normalizedVersion,
  );
  if (targetIndex === -1) {
    return undefined;
  }

  const now = new Date().toISOString();
  const actor =
    sanitizeString(input.rollbackBy) ||
    sanitizeString(input.updatedBy) ||
    "admin";
  const activeBeforeRollback = INTERACTIVE_COMPONENTS.find(
    (component) =>
      component.siteId === siteId &&
      component.componentKey === normalizedKey &&
      component.version !== normalizedVersion &&
      component.status === "active",
  );
  const disabledVersions: StoreInteractiveComponent[] = [];

  for (let index = 0; index < INTERACTIVE_COMPONENTS.length; index += 1) {
    const component = INTERACTIVE_COMPONENTS[index];
    if (
      component.siteId === siteId &&
      component.componentKey === normalizedKey &&
      component.version !== normalizedVersion &&
      component.status === "active"
    ) {
      const disabled: StoreInteractiveComponent = {
        ...component,
        status: "disabled",
        updatedBy: actor,
        updatedAt: now,
      };
      INTERACTIVE_COMPONENTS[index] = disabled;
      disabledVersions.push(disabled);
    }
  }

  const target = INTERACTIVE_COMPONENTS[targetIndex];
  const restored: StoreInteractiveComponent = {
    ...target,
    status: "active",
    reviewStatus: "approved",
    rollbackFromVersion:
      sanitizeString(input.rollbackFromVersion) ||
      activeBeforeRollback?.version ||
      target.rollbackFromVersion ||
      null,
    changelog: sanitizeString(input.changelog) || target.changelog,
    updatedBy: actor,
    reviewedBy: actor,
    reviewedAt: now,
    updatedAt: now,
  };
  INTERACTIVE_COMPONENTS[targetIndex] = restored;
  persistAdminContent();

  return {
    restored: clone(restored),
    disabledVersions: clone(disabledVersions),
    restoredFromVersion: restored.rollbackFromVersion,
  };
}

/** Reject malformed declared values before conversion can erase their original shape. */
export function validateCollectionRecordValueTypes(
  collection: StoreCollection,
  values: Record<string, unknown>,
  existingValues: Record<string, unknown> = {},
): SubmissionValidationDetail[] {
  const errors: SubmissionValidationDetail[] = [];
  for (const field of collection.fields) {
    const value = values[field.key] !== undefined ? values[field.key]
      : existingValues[field.key] !== undefined ? existingValues[field.key] : field.defaultValue;
    if (value === null || value === undefined || (typeof value === 'string' && !value.trim())) continue;
    let valid = true;
    if (field.type === 'number') {
      valid = (typeof value === 'number' || typeof value === 'string') && Number.isFinite(Number(value));
    } else if (field.type === 'boolean') {
      valid = typeof value === 'boolean' || value === 0 || value === 1
        || (typeof value === 'string' && /^(true|false|1|0|yes|no)$/i.test(value.trim()));
    } else if (field.type === 'tags' || field.type === 'multiReference' || isCollectionMultiFileField(field)) {
      valid = typeof value === 'string' || (Array.isArray(value) && value.every(item => typeof item === 'string'));
    } else if (field.type !== 'json') {
      valid = typeof value === 'string' || (typeof value === 'number' && Number.isFinite(value));
    }
    if (!valid) errors.push({ field: field.key, code: 'invalid_type', label: field.label, message: `${field.label} must contain a valid ${field.type} value.` });
  }
  return errors;
}

export function validateCollectionRecordValues(
  collection: StoreCollection,
  values: Record<string, unknown>,
  options: {
    existingValues?: Record<string, unknown>;
    excludeRecordId?: string;
    skipUnique?: boolean;
  } = {},
): SubmissionValidationDetail[] {
  ensurePersistedAdminContentLoaded();

  const normalizedValues = normalizeCollectionRecordValues(
    collection,
    values,
    options.existingValues,
  );
  const errors = validateCollectionRecordValueTypes(collection, values, options.existingValues);
  if (!options.skipUnique) errors.push(...collectionRecordUniqueIssues(collection as unknown as import("@backy-cms/core").BackyCollection, normalizedValues, COLLECTION_RECORDS.filter(record => record.siteId === collection.siteId && record.collectionId === collection.id) as unknown as import("@backy-cms/core").BackyCollectionRecord[], options.excludeRecordId));

  for (const field of collection.fields) {
    const value = normalizedValues[field.key];
    const empty =
      value === null ||
      value === undefined ||
      (typeof value === "string" && value.trim().length === 0) ||
      (Array.isArray(value) && value.length === 0);

    if (field.required && empty) {
      errors.push({
        field: field.key,
        code: "required",
        message: `${field.label} is required.`,
        label: field.label,
      });
      continue;
    }


    if (isCollectionMultiFileField(field) && Array.isArray(value)) {
      const maxItems = collectionFileMaxItems(field);
      if (maxItems && value.length > maxItems) {
        errors.push({
          field: field.key,
          code: "max_items",
          message: `${field.label} allows at most ${maxItems} file${maxItems === 1 ? "" : "s"}.`,
          label: field.label,
        });
      }
    }

    if (
      field.options?.length &&
      (field.type === "select" || field.type === "tags") &&
      !empty
    ) {
      const allowedOptions = new Set(
        field.options.map((option) => normalizeIdentifier(option)),
      );
      const submittedValues = Array.isArray(value) ? value : [value];
      const invalidValues = submittedValues
        .map(sanitizeString)
        .filter(Boolean)
        .filter((item) => !allowedOptions.has(normalizeIdentifier(item)));

      if (invalidValues.length > 0) {
        errors.push({
          field: field.key,
          code: "invalid_option",
          message: `${field.label} has invalid option value${invalidValues.length === 1 ? "" : "s"}: ${invalidValues.join(", ")}`,
          label: field.label,
        });
      }
    }
  }

  return errors;
}

export function listCollectionRecords(
  siteId: string,
  collectionId: string,
  params: {
    includeUnpublished?: boolean;
    status?: StoreCollectionRecord["status"];
    slug?: string;
    search?: string;
    fieldKey?: string;
    fieldValue?: unknown;
    sortBy?: string;
    sortDirection?: "asc" | "desc";
    limit?: number;
    offset?: number;
  } = {},
): { records: StoreCollectionRecord[]; pagination: Pagination } {
  ensurePersistedAdminContentLoaded();

  const {
    includeUnpublished = false,
    status,
    slug,
    search,
    fieldKey,
    fieldValue,
    sortBy,
    sortDirection = "asc",
    limit = 50,
    offset = 0,
  } = params;
  let records = COLLECTION_RECORDS.filter(
    (record) =>
      record.siteId === siteId &&
      record.collectionId === collectionId &&
      (includeUnpublished || isPublished(record.status, record.scheduledAt)),
  );

  if (status) {
    records = records.filter((record) => record.status === status);
  }

  if (slug) {
    records = records.filter(
      (record) =>
        normalizeIdentifier(record.slug) === normalizeIdentifier(slug),
    );
  }

  if (
    fieldKey &&
    fieldValue !== undefined &&
    fieldValue !== null &&
    sanitizeString(fieldValue).length > 0
  ) {
    const normalizedFieldValue = normalizeIdentifier(
      sanitizeString(fieldValue),
    );
    records = records.filter((record) =>
      normalizeIdentifier(sanitizeString(record.values[fieldKey])).includes(
        normalizedFieldValue,
      ),
    );
  }

  if (search && search.trim().length > 0) {
    const normalizedSearch = normalizeIdentifier(search);
    records = records.filter(
      (record) =>
        normalizeIdentifier(record.slug).includes(normalizedSearch) ||
        Object.values(record.values).some((value) =>
          normalizeIdentifier(sanitizeString(value)).includes(normalizedSearch),
        ),
    );
  }

  if (sortBy) {
    const direction = sortDirection === "desc" ? -1 : 1;
    records = [...records].sort((left, right) => {
      const leftValue =
        sortBy === "slug" ||
        sortBy === "status" ||
        sortBy === "createdAt" ||
        sortBy === "updatedAt"
          ? left[sortBy]
          : left.values[sortBy];
      const rightValue =
        sortBy === "slug" ||
        sortBy === "status" ||
        sortBy === "createdAt" ||
        sortBy === "updatedAt"
          ? right[sortBy]
          : right.values[sortBy];
      const leftNumber = typeof leftValue === "number" ? leftValue : Number.NaN;
      const rightNumber =
        typeof rightValue === "number" ? rightValue : Number.NaN;

      if (Number.isFinite(leftNumber) && Number.isFinite(rightNumber)) {
        return (leftNumber - rightNumber) * direction;
      }

      return (
        sanitizeString(leftValue).localeCompare(sanitizeString(rightValue)) *
        direction
      );
    });
  }

  const paginated = records.slice(offset, offset + limit);
  return {
    records: clone(paginated),
    pagination: getPagination(records.length, limit, offset),
  };
}

export function getCollectionRecordByIdOrSlug(
  siteId: string,
  collectionId: string,
  identifier: string,
  options: { includeUnpublished?: boolean } = {},
): StoreCollectionRecord | undefined {
  ensurePersistedAdminContentLoaded();

  const normalized = normalizeIdentifier(identifier);
  const record = COLLECTION_RECORDS.find(
    (item) =>
      item.siteId === siteId &&
      item.collectionId === collectionId &&
      (normalizeIdentifier(item.id) === normalized ||
        normalizeIdentifier(item.slug) === normalized),
  );

  if (!record) {
    return undefined;
  }

  if (
    !options.includeUnpublished &&
    !isPublished(record.status, record.scheduledAt)
  ) {
    return undefined;
  }

  return clone(record);
}

export function createAdminCollectionRecord(
  siteId: string,
  collectionId: string,
  input: Record<string, unknown>,
): StoreCollectionRecord | undefined {
  ensurePersistedAdminContentLoaded();

  const collection = getCollectionByIdOrSlug(siteId, collectionId, {
    includeUnpublished: true,
  });
  if (!collection) {
    return undefined;
  }

  const now = new Date().toISOString();
  const rawValues = toRecord(input.values);
  const normalizedValues = normalizeCollectionRecordValues(
    collection,
    rawValues,
  );
  const slug = normalizeSlugInput(
    input.slug ||
      normalizedValues.slug ||
      normalizedValues.title ||
      normalizedValues.name ||
      "record",
    "record",
  );
  const status = parseStatusInput(
    input.status,
    ["draft", "published", "scheduled", "archived"] as const,
    "draft",
  );
  const record: StoreCollectionRecord = {
    id: sanitizeString(input.id) || createRuntimeId("record"),
    siteId,
    collectionId: collection.id,
    slug,
    status,
    values: normalizedValues,
    createdAt: now,
    updatedAt: now,
    publishedAt: status === "published" ? now : null,
    scheduledAt: sanitizeString(input.scheduledAt) || null,
  };

  const issues = collectionRecordUniqueIssues(collection as unknown as import("@backy-cms/core").BackyCollection, normalizedValues, COLLECTION_RECORDS.filter(item => item.siteId === siteId && item.collectionId === collection.id) as unknown as import("@backy-cms/core").BackyCollectionRecord[]);
  if (issues.length) throw new BackyCollectionRecordValidationError(issues);
  COLLECTION_RECORDS.unshift(record);
  try { persistAdminContent(true); }
  catch (error) { COLLECTION_RECORDS.splice(COLLECTION_RECORDS.indexOf(record), 1); throw error; }
  syncMediaReferencesForCollectionRecord(
    siteId,
    collection.id,
    record.id,
    record.values,
  );
  return clone(record);
}

export function updateAdminCollectionRecord(
  siteId: string,
  collectionId: string,
  recordId: string,
  input: Record<string, unknown>,
): StoreCollectionRecord | undefined {
  ensurePersistedAdminContentLoaded();

  const collection = getCollectionByIdOrSlug(siteId, collectionId, {
    includeUnpublished: true,
  });
  const index = COLLECTION_RECORDS.findIndex(
    (record) =>
      record.siteId === siteId &&
      record.collectionId === collection?.id &&
      record.id === recordId,
  );

  if (!collection || index === -1) {
    return undefined;
  }

  const current = COLLECTION_RECORDS[index];
  assertBackyCollectionRecordUpdateExpectation(siteId, collection.id, recordId, input, current as unknown as import("@backy-cms/core").BackyCollectionRecord, `record-v1:${createHash("sha256").update(serializeBackyCollectionRecordVersion(current as unknown as import("@backy-cms/core").BackyCollectionRecord)).digest("hex")}`);
  const rawValues =
    input.values === undefined ? current.values : toRecord(input.values);
  const status =
    input.status === undefined
      ? current.status
      : parseStatusInput(
          input.status,
          ["draft", "published", "scheduled", "archived"] as const,
          current.status,
        );
  const updated: StoreCollectionRecord = {
    ...current,
    slug:
      input.slug === undefined
        ? current.slug
        : normalizeSlugInput(input.slug, current.slug),
    status,
    values: normalizeCollectionRecordValues(
      collection,
      rawValues,
      input.values === undefined || input.beforeUpdateProductDesignRevision ? {} : current.values,
    ),
    updatedAt: new Date(Math.max(Date.now(), Date.parse(current.updatedAt) + 1)).toISOString(),
    publishedAt:
      status === "published" && !current.publishedAt
        ? new Date().toISOString()
        : current.publishedAt,
    scheduledAt:
      input.scheduledAt === undefined
        ? current.scheduledAt
        : sanitizeString(input.scheduledAt) || null,
  };

  const issues = collectionRecordUniqueIssues(collection as unknown as import("@backy-cms/core").BackyCollection, updated.values, COLLECTION_RECORDS.filter(item => item.siteId === siteId && item.collectionId === collection.id) as unknown as import("@backy-cms/core").BackyCollectionRecord[], recordId);
  if (issues.length) throw new BackyCollectionRecordValidationError(issues);
  const details = input.beforeUpdateProductDesignRevision as import('@backy-cms/core').BackyProductDesignRevisionInput | undefined;
  const revision = details ? (() => {
    if (collection.slug !== 'products' || !input.expectedRecord || input.status !== undefined || input.slug !== undefined || input.scheduledAt !== undefined) throw Error('PRODUCT_DESIGN_REVISION_INVALID');
    return { id: randomUUID(), siteId, collectionId: collection.id, recordId, snapshot: snapshotProductTemplateDesign(current.values), ...details, templateId: details.templateId || null, targetRevisionId: details.targetRevisionId || null, actorId: details.actorId || null, createdAt: new Date().toISOString() };
  })() : null;
  if (revision) PRODUCT_DESIGN_REVISIONS.push(revision);
  COLLECTION_RECORDS[index] = updated;
  try { persistAdminContent(true); }
  catch (error) { COLLECTION_RECORDS[index] = current; if (revision) PRODUCT_DESIGN_REVISIONS.splice(PRODUCT_DESIGN_REVISIONS.indexOf(revision), 1); throw error; }
  syncMediaReferencesForCollectionRecord(
    siteId,
    collection.id,
    updated.id,
    updated.values,
  );
  return clone(updated);
}

export function deleteAdminCollectionRecord(
  siteId: string,
  collectionId: string,
  recordId: string,
): boolean {
  ensurePersistedAdminContentLoaded();

  const collection = getCollectionByIdOrSlug(siteId, collectionId, {
    includeUnpublished: true,
  });
  if (!collection) {
    return false;
  }

  const index = COLLECTION_RECORDS.findIndex(
    (record) =>
      record.siteId === siteId &&
      record.collectionId === collection.id &&
      record.id === recordId,
  );

  if (index === -1) {
    return false;
  }

  COLLECTION_RECORDS.splice(index, 1);
  for (let i = PRODUCT_DESIGN_REVISIONS.length - 1; i >= 0; i--) if (PRODUCT_DESIGN_REVISIONS[i].siteId === siteId && PRODUCT_DESIGN_REVISIONS[i].collectionId === collection.id && PRODUCT_DESIGN_REVISIONS[i].recordId === recordId) PRODUCT_DESIGN_REVISIONS.splice(i,1);
  persistAdminContent();
  removeMediaReferencesForCollectionRecord(siteId, collection.id, recordId);
  return true;
}

export function getPageSummary(
  siteId: string,
  options: { includeUnpublished?: boolean } = {},
): Omit<StorePage, "content">[] {
  ensurePersistedAdminContentLoaded();

  const { includeUnpublished = false } = options;
  const pages = PAGE_LIST.filter(
    (page) =>
      page.siteId === siteId &&
      (includeUnpublished || isPublished(page.status, page.scheduledAt)),
  );

  return clone(pages.map(({ content, ...page }) => page));
}

export function getSiteNavigation(
  siteId: string,
  options: { includeUnpublished?: boolean } = {},
): { primary: SiteNavigationItem[]; footer: SiteNavigationItem[] } {
  const site = getSiteByIdOrSlug(siteId);
  const pages = getPageSummary(siteId, options);
  return buildSiteNavigation(site?.settings, pages);
}

export function getPageBySlug(
  siteId: string,
  slug: string,
  options: { includeUnpublished?: boolean } = {},
): StorePage | undefined {
  ensurePersistedAdminContentLoaded();

  const normalizedSlug = normalizeIdentifier(slug || "index");
  const { includeUnpublished = false } = options;

  const target = PAGE_LIST.find(
    (page) =>
      page.siteId === siteId &&
      normalizeIdentifier(page.slug) === normalizedSlug,
  );

  if (!target) {
    return undefined;
  }

  if (!includeUnpublished && !isPublished(target.status, target.scheduledAt)) {
    return undefined;
  }

  return clone(target);
}

export function getPageByPath(
  siteId: string,
  path: string,
  options: { includeUnpublished?: boolean } = {},
): StorePage | undefined {
  ensurePersistedAdminContentLoaded();

  const { includeUnpublished = false } = options;
  const normalizedPath = normalizeIdentifier(
    (path || "index").replace(/^\/+|\/+$/g, ""),
  );
  const isHomepagePath =
    normalizedPath === "" ||
    normalizedPath === "index" ||
    normalizedPath === "home";
  const sitePages = PAGE_LIST.filter((page) => page.siteId === siteId);
  if (isHomepagePath) {
    const homepages = sitePages.filter((page) => page.isHomepage);
    if (homepages.length > 1) return undefined;
    const homepage = homepages[0];
    if (
      homepage &&
      (includeUnpublished || isPublished(homepage.status, homepage.scheduledAt))
    ) {
      return clone(homepage);
    }
  }

  const target = isHomepagePath
    ? findPageByHierarchyPath(sitePages.filter((page) => page.slug === "index"), siteId, "/", sitePages, true)
      || findPageByHierarchyPath(sitePages, siteId, "/home", sitePages, true)
    : findPageByHierarchyPath(sitePages, siteId, normalizedPath, sitePages, true);
  return target && (includeUnpublished || isPublished(target.status, target.scheduledAt))
    ? clone(target)
    : undefined;
}

export function getAdminPageById(
  siteId: string,
  pageId: string,
): StorePage | undefined {
  ensurePersistedAdminContentLoaded();

  const page = PAGE_LIST.find(
    (item) => item.siteId === siteId && item.id === pageId,
  );
  return page ? clone(page) : undefined;
}

export function listAdminPages(
  siteId: string,
  options: { includeUnpublished?: boolean } = {},
): StorePage[] {
  ensurePersistedAdminContentLoaded();

  const { includeUnpublished = true } = options;
  return clone(
    PAGE_LIST.filter(
      (page) =>
        page.siteId === siteId &&
        (includeUnpublished || isPublished(page.status, page.scheduledAt)),
    ),
  );
}

function prepareCompositionPage(
  siteId: string,
  input: Record<string, unknown>,
): StorePage {

  const now = new Date().toISOString();
  const title = sanitizeString(input.title) || "Untitled page";
  const slug = normalizeSlugInput(input.slug || title, "page");
  const status = parseStatusInput(
    input.status,
    ["draft", "published", "scheduled", "archived"] as const,
    "draft",
  );
  const metaInput = toRecord(input.meta);
  const pageId = sanitizeString(input.id) || createRuntimeId("page");
  const content = pageContentFromCanvasInput(input.content, {
    id: pageId,
    kind: "page",
    title,
    slug,
    status,
  });

  const page: StorePage = {
    id: pageId,
    siteId,
    title,
    slug,
    description:
      sanitizeString(input.description) ||
      sanitizeString(metaInput.description) ||
      null,
    status,
    isHomepage: parseBooleanInput(input.isHomepage, false),
    parentId: sanitizeString(input.parentId) || null,
    sortOrder: Number(input.sortOrder) || 0,
    content,
    meta: {
      ...safeIncomingContentMeta(metaInput),
      title: sanitizeString(metaInput.title) || title,
      description:
        sanitizeString(metaInput.description) ||
        sanitizeString(input.description),
      keywords: Array.isArray(metaInput.keywords)
        ? metaInput.keywords.map(sanitizeString).filter(Boolean)
        : undefined,
      ogImage: sanitizeString(metaInput.ogImage) || null,
      canonical: sanitizeString(metaInput.canonical) || `/${slug}`,
      jsonLd: toJsonObjectArray(metaInput.jsonLd),
      template: sanitizeString(metaInput.template) || null,
      noIndex: parseBooleanInput(
        metaInput.noIndex,
        defaultNoIndexForStatus(status),
      ),
      noFollow: parseBooleanInput(metaInput.noFollow, false),
      parentPageId: sanitizeString(metaInput.parentPageId) || null,
      parentPageTitle: sanitizeString(metaInput.parentPageTitle) || null,
      ...normalizeFrontendDesignMetaFields(metaInput),
      collectionDataset: isObjectRecord(metaInput.collectionDataset)
        ? clone(metaInput.collectionDataset)
        : null,
    },
    forms: Array.isArray(input.forms)
      ? input.forms.map(sanitizeString).filter(Boolean)
      : [],
    createdAt: now,
    updatedAt: now,
    publishedAt: status === "published" ? now : null,
    scheduledAt: sanitizeString(input.scheduledAt) || null,
  };

  return page;
}

export function createAdminPage(
  siteId: string,
  input: Record<string, unknown>,
): StorePage {
  ensurePersistedAdminContentLoaded();

  const page = prepareCompositionPage(siteId, input);
  PAGE_LIST.unshift(page);
  persistAdminContent();
  syncMediaReferencesForTarget(
    siteId,
    "page",
    page.id,
    mediaReferencePayloadForContent(page.content, page.meta),
  );
  return clone(page);
}

export function updateAdminPage(
  siteId: string,
  pageId: string,
  input: Record<string, unknown>,
): StorePage | undefined {
  ensurePersistedAdminContentLoaded(input.expectedContent !== undefined || input.expectedUpdatedAt !== undefined);

  const index = PAGE_LIST.findIndex(
    (page) => page.siteId === siteId && page.id === pageId,
  );
  if (index === -1) {
    assertBackyContentUpdateExpectation(input, null);
    return undefined;
  }

  const current = PAGE_LIST[index];
  // Synchronous compare + mutation is atomic within this demo-store process.
  assertBackyContentUpdateExpectation(input, current);
  const guarded = input.expectedContent !== undefined || input.expectedUpdatedAt !== undefined;
  const now = new Date(Math.max(Date.now(), guarded ? Date.parse(current.updatedAt) + 1 : 0)).toISOString();
  const status =
    input.status === undefined
      ? current.status
      : parseStatusInput(
          input.status,
          ["draft", "published", "scheduled", "archived"] as const,
          current.status,
        );
  const metaInput = toRecord(input.meta);
  const nextTitle =
    input.title === undefined
      ? current.title
      : sanitizeString(input.title) || current.title;
  const nextSlug =
    input.slug === undefined
      ? current.slug
      : normalizeSlugInput(input.slug, current.slug);
  const nextContent =
    input.content === undefined
      ? current.content
      : pageContentFromCanvasInput(input.content, {
          id: current.id,
          kind: "page",
          title: nextTitle,
          slug: nextSlug,
          status,
          existing: current.content,
        });
  const beforeRevision = createContentRevision(
    "page",
    current,
    sanitizeString(input.revisionNote) || "Before page update",
    sanitizeString(input.updatedBy),
    { operation: "update" },
  );

  const updated: StorePage = {
    ...current,
    title: nextTitle,
    slug: nextSlug,
    description:
      input.description === undefined
        ? current.description
        : sanitizeString(input.description) || null,
    status,
    isHomepage:
      input.isHomepage === undefined
        ? current.isHomepage
        : parseBooleanInput(input.isHomepage, current.isHomepage),
    parentId:
      input.parentId === undefined
        ? current.parentId
        : sanitizeString(input.parentId) || null,
    sortOrder:
      input.sortOrder === undefined
        ? current.sortOrder
        : Number(input.sortOrder) || current.sortOrder || 0,
    content: nextContent,
    meta:
      input.meta === undefined
        ? {
            ...current.meta,
            noIndex:
              current.status !== status && !defaultNoIndexForStatus(status)
                ? false
                : current.meta.noIndex,
          }
        : {
            ...current.meta,
            ...safeIncomingContentMeta(metaInput),
            title:
              metaInput.title === undefined
                ? current.meta.title
                : sanitizeString(metaInput.title),
            description:
              metaInput.description === undefined
                ? current.meta.description
                : sanitizeString(metaInput.description),
            keywords: Array.isArray(metaInput.keywords)
              ? metaInput.keywords.map(sanitizeString).filter(Boolean)
              : current.meta.keywords,
            ogImage:
              metaInput.ogImage === undefined
                ? current.meta.ogImage
                : sanitizeString(metaInput.ogImage) || null,
            canonical:
              metaInput.canonical === undefined
                ? current.meta.canonical
                : sanitizeString(metaInput.canonical),
            jsonLd:
              metaInput.jsonLd === undefined
                ? current.meta.jsonLd
                : toJsonObjectArray(metaInput.jsonLd),
            template:
              metaInput.template === undefined
                ? current.meta.template
                : sanitizeString(metaInput.template) || null,
            noIndex:
              metaInput.noIndex === undefined
                ? current.meta.noIndex
                : parseBooleanInput(metaInput.noIndex, false),
            noFollow:
              metaInput.noFollow === undefined
                ? current.meta.noFollow
                : parseBooleanInput(metaInput.noFollow, false),
            parentPageId:
              metaInput.parentPageId === undefined
                ? current.meta.parentPageId
                : sanitizeString(metaInput.parentPageId) || null,
            parentPageTitle:
              metaInput.parentPageTitle === undefined
                ? current.meta.parentPageTitle
                : sanitizeString(metaInput.parentPageTitle) || null,
            ...normalizeFrontendDesignMetaFields(metaInput, current.meta),
            collectionDataset:
              metaInput.collectionDataset === undefined
                ? current.meta.collectionDataset
                : isObjectRecord(metaInput.collectionDataset)
                  ? clone(metaInput.collectionDataset)
                  : null,
          },
    forms: Array.isArray(input.forms)
      ? input.forms.map(sanitizeString).filter(Boolean)
      : current.forms,
    updatedAt: now,
    publishedAt:
      status === "published" && !current.publishedAt
        ? now
        : current.publishedAt,
    scheduledAt:
      input.scheduledAt === undefined
        ? current.scheduledAt
        : sanitizeString(input.scheduledAt) || null,
  };

  PAGE_LIST[index] = updated;
  try { persistAdminContent(input.expectedContent !== undefined || input.expectedUpdatedAt !== undefined); }
  catch (error) { PAGE_LIST[index] = current; const revisionIndex = CONTENT_REVISIONS.findIndex(item => item.id === beforeRevision.id); if (revisionIndex !== -1) CONTENT_REVISIONS.splice(revisionIndex, 1); throw error; }
  syncMediaReferencesForTarget(
    siteId,
    "page",
    pageId,
    mediaReferencePayloadForContent(updated.content, updated.meta),
  );
  return clone(updated);
}

export function deleteAdminPage(siteId: string, pageId: string): boolean {
  ensurePersistedAdminContentLoaded();

  const index = PAGE_LIST.findIndex(
    (page) => page.siteId === siteId && page.id === pageId,
  );
  if (index === -1) {
    return false;
  }

  PAGE_LIST.splice(index, 1);
  removeMediaReferencesForTarget(siteId, "page", pageId);
  removePreviewTokensForTarget(siteId, "page", pageId);
  refreshPersistedInteractionStore();
  setCommentStore(
    commentStore.filter(
      (comment) =>
        !(
          comment.siteId === siteId &&
          comment.targetType === "page" &&
          comment.targetId === pageId
        ),
    ),
  );

  for (
    let revisionIndex = CONTENT_REVISIONS.length - 1;
    revisionIndex >= 0;
    revisionIndex -= 1
  ) {
    const revision = CONTENT_REVISIONS[revisionIndex];
    if (
      revision.siteId === siteId &&
      revision.targetType === "page" &&
      revision.targetId === pageId
    ) {
      CONTENT_REVISIONS.splice(revisionIndex, 1);
    }
  }

  persistAdminContent();
  persistInteractionStore({ mergePersisted: false });
  return true;
}

export function getBlogPosts(
  siteId: string,
  params: {
    slug?: string;
    status?: StoreBlogPost["status"];
    categoryId?: string;
    categorySlug?: string;
    tagId?: string;
    tagSlug?: string;
    authorId?: string;
    authorSlug?: string;
    search?: string;
    year?: number;
    month?: number;
    limit?: number;
    offset?: number;
    includeUnpublished?: boolean;
  } = {},
): { posts: StoreBlogPost[]; pagination?: Pagination } {
  const {
    slug,
    status,
    categoryId,
    categorySlug,
    tagId,
    tagSlug,
    authorId,
    authorSlug,
    search,
    year,
    month,
    limit = 20,
    offset = 0,
    includeUnpublished = false,
  } = params;

  ensurePersistedAdminContentLoaded();

  let posts = BLOG_POSTS.filter((post) => post.siteId === siteId);

  if (!includeUnpublished) {
    posts = posts.filter((post) => isPublished(post.status, post.scheduledAt));
  }

  if (status) {
    posts = posts.filter((post) => post.status === status);
  }

  const normalizedCategoryId = sanitizeString(categoryId);
  const categoryBySlug = categorySlug
    ? getBlogCategoryByIdOrSlug(siteId, categorySlug)
    : undefined;
  const effectiveCategoryId = normalizedCategoryId || categoryBySlug?.id || "";
  if (effectiveCategoryId) {
    posts = posts.filter((post) =>
      post.categoryIds.includes(effectiveCategoryId),
    );
  }

  const normalizedTagId = sanitizeString(tagId);
  const tagBySlug = tagSlug ? getBlogTagByIdOrSlug(siteId, tagSlug) : undefined;
  const effectiveTagId = normalizedTagId || tagBySlug?.id || "";
  if (effectiveTagId) {
    posts = posts.filter((post) => post.tagIds.includes(effectiveTagId));
  }

  const normalizedAuthorId = sanitizeString(authorId);
  const authorBySlug = authorSlug
    ? getBlogAuthorByIdOrSlug(siteId, authorSlug)
    : undefined;
  const effectiveAuthorId = normalizedAuthorId || authorBySlug?.id || "";
  if (effectiveAuthorId) {
    posts = posts.filter((post) => post.authorId === effectiveAuthorId);
  }

  const normalizedSearch = normalizeIdentifier(search || "");
  if (normalizedSearch) {
    posts = posts.filter((post) =>
      [
        post.title,
        post.slug,
        post.excerpt,
        typeof post.content === "string" ? post.content : "",
      ].some((value) =>
        normalizeIdentifier(value || "").includes(normalizedSearch),
      ),
    );
  }

  if (year || month) {
    posts = posts.filter((post) => {
      const source =
        post.publishedAt ||
        post.scheduledAt ||
        post.updatedAt ||
        post.createdAt;
      const date = source ? new Date(source) : null;
      if (!date || Number.isNaN(date.getTime())) return false;
      if (year && date.getUTCFullYear() !== year) return false;
      if (month && date.getUTCMonth() + 1 !== month) return false;
      return true;
    });
  }

  if (slug) {
    const target = posts.find(
      (post) => normalizeIdentifier(post.slug) === normalizeIdentifier(slug),
    );
    const list = target ? [target] : [];
    return {
      posts: clone(list),
      pagination: {
        total: list.length,
        limit,
        offset,
        hasMore: false,
      },
    };
  }

  const paginated = posts.slice(offset, offset + limit);
  return {
    posts: clone(paginated),
    pagination: getPagination(posts.length, limit, offset),
  };
}

const getAuthorSlug = (name: string, fallback: string): string =>
  normalizeSlugInput(name || fallback, fallback || "author");

const getAuthorPostCount = (siteId: string, authorId: string): number =>
  BLOG_POSTS.filter(
    (post) =>
      post.siteId === siteId &&
      post.authorId === authorId &&
      post.status !== "archived",
  ).length;

const toBlogAuthor = (siteId: string, user: StoreUser): StoreBlogAuthor => ({
  id: user.id,
  siteId,
  name: user.fullName,
  slug: getAuthorSlug(user.fullName, user.id),
  role: user.role,
  status: user.status,
  postCount: getAuthorPostCount(siteId, user.id),
});

const toExternalBlogAuthor = (
  siteId: string,
  authorId: string,
): StoreBlogAuthor => ({
  id: authorId,
  siteId,
  name: authorId,
  slug: getAuthorSlug(authorId, authorId),
  role: "contributor",
  status: "external",
  postCount: getAuthorPostCount(siteId, authorId),
});

export function listBlogAuthors(siteId: string): StoreBlogAuthor[] {
  ensurePersistedAdminContentLoaded();

  const assignedAuthorIds = new Set(
    BLOG_POSTS.filter((post) => post.siteId === siteId && post.authorId).map(
      (post) => post.authorId as string,
    ),
  );
  const userAuthors = USER_LIST.filter(
    (user) =>
      user.role === "owner" ||
      user.role === "admin" ||
      user.role === "editor" ||
      assignedAuthorIds.has(user.id),
  ).map((user) => toBlogAuthor(siteId, user));
  const knownUserIds = new Set(userAuthors.map((author) => author.id));
  const externalAuthors = [...assignedAuthorIds]
    .filter((authorId) => !knownUserIds.has(authorId))
    .map((authorId) => toExternalBlogAuthor(siteId, authorId));

  return clone(
    [...userAuthors, ...externalAuthors].sort((a, b) =>
      a.name.localeCompare(b.name),
    ),
  );
}

export function getBlogAuthorByIdOrSlug(
  siteId: string,
  identifier: string,
): StoreBlogAuthor | undefined {
  ensurePersistedAdminContentLoaded();

  const normalized = normalizeIdentifier(identifier);
  const author = listBlogAuthors(siteId).find(
    (item) =>
      normalizeIdentifier(item.id) === normalized ||
      normalizeIdentifier(item.slug) === normalized,
  );

  return author ? clone(author) : undefined;
}

const withCategoryPostCount = (
  category: StoreBlogCategory,
): StoreBlogCategory => ({
  ...category,
  postCount: BLOG_POSTS.filter(
    (post) =>
      post.siteId === category.siteId &&
      post.categoryIds.includes(category.id) &&
      post.status !== "archived",
  ).length,
});

const withTagPostCount = (tag: StoreBlogTag): StoreBlogTag => ({
  ...tag,
  postCount: BLOG_POSTS.filter(
    (post) =>
      post.siteId === tag.siteId &&
      post.tagIds.includes(tag.id) &&
      post.status !== "archived",
  ).length,
});

export function listBlogCategories(siteId: string): StoreBlogCategory[] {
  ensurePersistedAdminContentLoaded();
  return clone(
    BLOG_CATEGORIES.filter((category) => category.siteId === siteId).map(
      withCategoryPostCount,
    ),
  );
}

export function listBlogTags(siteId: string): StoreBlogTag[] {
  ensurePersistedAdminContentLoaded();
  return clone(
    BLOG_TAGS.filter((tag) => tag.siteId === siteId).map(withTagPostCount),
  );
}

export function getBlogCategoryByIdOrSlug(
  siteId: string,
  identifier: string,
): StoreBlogCategory | undefined {
  ensurePersistedAdminContentLoaded();

  const normalized = normalizeIdentifier(identifier);
  const category = BLOG_CATEGORIES.find(
    (item) =>
      item.siteId === siteId &&
      (normalizeIdentifier(item.id) === normalized ||
        normalizeIdentifier(item.slug) === normalized),
  );

  return category ? clone(withCategoryPostCount(category)) : undefined;
}

export function getBlogTagByIdOrSlug(
  siteId: string,
  identifier: string,
): StoreBlogTag | undefined {
  ensurePersistedAdminContentLoaded();

  const normalized = normalizeIdentifier(identifier);
  const tag = BLOG_TAGS.find(
    (item) =>
      item.siteId === siteId &&
      (normalizeIdentifier(item.id) === normalized ||
        normalizeIdentifier(item.slug) === normalized),
  );

  return tag ? clone(withTagPostCount(tag)) : undefined;
}

export function createAdminBlogCategory(
  siteId: string,
  input: Record<string, unknown>,
): StoreBlogCategory {
  ensurePersistedAdminContentLoaded();

  const now = new Date().toISOString();
  const name = sanitizeString(input.name) || "Untitled category";
  const slug = normalizeSlugInput(input.slug || name, "category");
  const category: StoreBlogCategory = {
    id: sanitizeString(input.id) || createRuntimeId("cat"),
    siteId,
    name,
    slug,
    description: sanitizeString(input.description) || null,
    color: sanitizeString(input.color) || null,
    createdAt: now,
    updatedAt: now,
  };

  BLOG_CATEGORIES.unshift(category);
  persistAdminContent();
  return clone(withCategoryPostCount(category));
}

export function updateAdminBlogCategory(
  siteId: string,
  categoryId: string,
  input: Record<string, unknown>,
): StoreBlogCategory | undefined {
  ensurePersistedAdminContentLoaded();

  const index = BLOG_CATEGORIES.findIndex(
    (category) => category.siteId === siteId && category.id === categoryId,
  );
  if (index === -1) {
    return undefined;
  }

  const current = BLOG_CATEGORIES[index];
  const updated: StoreBlogCategory = {
    ...current,
    name:
      input.name === undefined
        ? current.name
        : sanitizeString(input.name) || current.name,
    slug:
      input.slug === undefined
        ? current.slug
        : normalizeSlugInput(input.slug, current.slug),
    description:
      input.description === undefined
        ? current.description
        : sanitizeString(input.description) || null,
    color:
      input.color === undefined
        ? current.color
        : sanitizeString(input.color) || null,
    updatedAt: new Date().toISOString(),
  };

  BLOG_CATEGORIES[index] = updated;
  persistAdminContent();
  return clone(withCategoryPostCount(updated));
}

export function deleteAdminBlogCategory(
  siteId: string,
  categoryId: string,
): boolean {
  ensurePersistedAdminContentLoaded();

  const index = BLOG_CATEGORIES.findIndex(
    (category) => category.siteId === siteId && category.id === categoryId,
  );
  if (index === -1) {
    return false;
  }

  BLOG_CATEGORIES.splice(index, 1);
  BLOG_POSTS.forEach((post) => {
    if (post.siteId === siteId && post.categoryIds.includes(categoryId)) {
      post.categoryIds = post.categoryIds.filter((id) => id !== categoryId);
      post.updatedAt = new Date().toISOString();
    }
  });
  persistAdminContent();
  return true;
}

export function createAdminBlogTag(
  siteId: string,
  input: Record<string, unknown>,
): StoreBlogTag {
  ensurePersistedAdminContentLoaded();

  const now = new Date().toISOString();
  const name = sanitizeString(input.name) || "Untitled tag";
  const slug = normalizeSlugInput(input.slug || name, "tag");
  const tag: StoreBlogTag = {
    id: sanitizeString(input.id) || createRuntimeId("tag"),
    siteId,
    name,
    slug,
    description: sanitizeString(input.description) || null,
    createdAt: now,
    updatedAt: now,
  };

  BLOG_TAGS.unshift(tag);
  persistAdminContent();
  return clone(withTagPostCount(tag));
}

export function updateAdminBlogTag(
  siteId: string,
  tagId: string,
  input: Record<string, unknown>,
): StoreBlogTag | undefined {
  ensurePersistedAdminContentLoaded();

  const index = BLOG_TAGS.findIndex(
    (tag) => tag.siteId === siteId && tag.id === tagId,
  );
  if (index === -1) {
    return undefined;
  }

  const current = BLOG_TAGS[index];
  const updated: StoreBlogTag = {
    ...current,
    name:
      input.name === undefined
        ? current.name
        : sanitizeString(input.name) || current.name,
    slug:
      input.slug === undefined
        ? current.slug
        : normalizeSlugInput(input.slug, current.slug),
    description:
      input.description === undefined
        ? current.description
        : sanitizeString(input.description) || null,
    updatedAt: new Date().toISOString(),
  };

  BLOG_TAGS[index] = updated;
  persistAdminContent();
  return clone(withTagPostCount(updated));
}

export function deleteAdminBlogTag(siteId: string, tagId: string): boolean {
  ensurePersistedAdminContentLoaded();

  const index = BLOG_TAGS.findIndex(
    (tag) => tag.siteId === siteId && tag.id === tagId,
  );
  if (index === -1) {
    return false;
  }

  BLOG_TAGS.splice(index, 1);
  BLOG_POSTS.forEach((post) => {
    if (post.siteId === siteId && post.tagIds.includes(tagId)) {
      post.tagIds = post.tagIds.filter((id) => id !== tagId);
      post.updatedAt = new Date().toISOString();
    }
  });
  persistAdminContent();
  return true;
}

export function getAdminBlogPostById(
  siteId: string,
  postId: string,
): StoreBlogPost | undefined {
  ensurePersistedAdminContentLoaded();

  const post = BLOG_POSTS.find(
    (item) => item.siteId === siteId && item.id === postId,
  );
  return post ? clone(post) : undefined;
}

function prepareCompositionBlogPost(
  siteId: string,
  input: Record<string, unknown>,
): StoreBlogPost {

  const now = new Date().toISOString();
  const title = sanitizeString(input.title) || "Untitled post";
  const slug = normalizeSlugInput(input.slug || title, "post");
  const status = parseStatusInput(
    input.status,
    ["draft", "published", "scheduled", "archived"] as const,
    "draft",
  );
  const metaInput = toRecord(input.meta);
  const postId = sanitizeString(input.id) || createRuntimeId("post");
  const content = pageContentFromCanvasInput(input.content, {
    id: postId,
    kind: "post",
    title,
    slug,
    status,
  }) as unknown as Record<string, unknown>;

  const post: StoreBlogPost = {
    id: postId,
    siteId,
    title,
    slug,
    excerpt: sanitizeString(input.excerpt) || null,
    content,
    status,
    featuredImageId: sanitizeString(input.featuredImageId) || null,
    authorId: sanitizeString(input.authorId) || "admin",
    meta: {
      ...safeIncomingContentMeta(metaInput),
      title: sanitizeString(metaInput.title) || title,
      description:
        sanitizeString(metaInput.description) || sanitizeString(input.excerpt),
      keywords: Array.isArray(metaInput.keywords)
        ? metaInput.keywords.map(sanitizeString).filter(Boolean)
        : undefined,
      ogImage: sanitizeString(metaInput.ogImage) || null,
      canonical: sanitizeString(metaInput.canonical) || `/blog/${slug}`,
      jsonLd: toJsonObjectArray(metaInput.jsonLd),
      noIndex: parseBooleanInput(
        metaInput.noIndex,
        defaultNoIndexForStatus(status),
      ),
      noFollow: parseBooleanInput(metaInput.noFollow, false),
      ...normalizeFrontendDesignMetaFields(metaInput),
    },
    categoryIds: Array.isArray(input.categoryIds)
      ? input.categoryIds.map(sanitizeString).filter(Boolean)
      : [],
    tagIds: Array.isArray(input.tagIds)
      ? input.tagIds.map(sanitizeString).filter(Boolean)
      : [],
    createdAt: now,
    updatedAt: now,
    publishedAt: status === "published" ? now : null,
    scheduledAt: sanitizeString(input.scheduledAt) || null,
  };

  return post;
}

export function createAdminBlogPost(
  siteId: string,
  input: Record<string, unknown>,
): StoreBlogPost {
  ensurePersistedAdminContentLoaded();

  const post = prepareCompositionBlogPost(siteId, input);
  BLOG_POSTS.unshift(post);
  persistAdminContent();
  syncMediaReferencesForTarget(
    siteId,
    "post",
    post.id,
    mediaReferencePayloadForContent(post.content, post.meta),
    post.featuredImageId ? [post.featuredImageId] : [],
  );
  return clone(post);
}

export function updateAdminBlogPost(
  siteId: string,
  postId: string,
  input: Record<string, unknown>,
): StoreBlogPost | undefined {
  ensurePersistedAdminContentLoaded(input.expectedContent !== undefined || input.expectedUpdatedAt !== undefined);

  const index = BLOG_POSTS.findIndex(
    (post) => post.siteId === siteId && post.id === postId,
  );
  if (index === -1) {
    assertBackyContentUpdateExpectation(input, null);
    return undefined;
  }

  const current = BLOG_POSTS[index];
  // Synchronous compare + mutation is atomic within this demo-store process.
  assertBackyContentUpdateExpectation(input, current);
  const guarded = input.expectedContent !== undefined || input.expectedUpdatedAt !== undefined;
  const now = new Date(Math.max(Date.now(), guarded ? Date.parse(current.updatedAt) + 1 : 0)).toISOString();
  const status =
    input.status === undefined
      ? current.status
      : parseStatusInput(
          input.status,
          ["draft", "published", "scheduled", "archived"] as const,
          current.status,
  );
  const metaInput = toRecord(input.meta);
  const nextTitle =
    input.title === undefined
      ? current.title
      : sanitizeString(input.title) || current.title;
  const nextSlug =
    input.slug === undefined
      ? current.slug
      : normalizeSlugInput(input.slug, current.slug);
  const nextContent =
    input.content === undefined
      ? current.content
      : (pageContentFromCanvasInput(input.content, {
          id: current.id,
          kind: "post",
          title: nextTitle,
          slug: nextSlug,
          status,
          existing: current.content as unknown as PageContent,
        }) as unknown as Record<string, unknown>);
  const beforeRevision = createContentRevision(
    "post",
    current,
    sanitizeString(input.revisionNote) || "Before post update",
    sanitizeString(input.updatedBy),
    { operation: "update" },
  );

  const updated: StoreBlogPost = {
    ...current,
    title: nextTitle,
    slug: nextSlug,
    excerpt:
      input.excerpt === undefined
        ? current.excerpt
        : sanitizeString(input.excerpt) || null,
    content: nextContent,
    status,
    featuredImageId:
      input.featuredImageId === undefined
        ? current.featuredImageId
        : sanitizeString(input.featuredImageId) || null,
    authorId:
      input.authorId === undefined
        ? current.authorId
        : sanitizeString(input.authorId) || null,
    meta:
      input.meta === undefined
        ? {
            ...current.meta,
            noIndex:
              current.status !== status && !defaultNoIndexForStatus(status)
                ? false
                : current.meta.noIndex,
          }
        : {
            ...current.meta,
            ...safeIncomingContentMeta(metaInput),
            title:
              metaInput.title === undefined
                ? current.meta.title
                : sanitizeString(metaInput.title),
            description:
              metaInput.description === undefined
                ? current.meta.description
                : sanitizeString(metaInput.description),
            keywords: Array.isArray(metaInput.keywords)
              ? metaInput.keywords.map(sanitizeString).filter(Boolean)
              : current.meta.keywords,
            ogImage:
              metaInput.ogImage === undefined
                ? current.meta.ogImage
                : sanitizeString(metaInput.ogImage) || null,
            canonical:
              metaInput.canonical === undefined
                ? current.meta.canonical
                : sanitizeString(metaInput.canonical),
            jsonLd:
              metaInput.jsonLd === undefined
                ? current.meta.jsonLd
                : toJsonObjectArray(metaInput.jsonLd),
            noIndex:
              metaInput.noIndex === undefined
                ? current.meta.noIndex
                : parseBooleanInput(metaInput.noIndex, false),
            noFollow:
              metaInput.noFollow === undefined
                ? current.meta.noFollow
                : parseBooleanInput(metaInput.noFollow, false),
            ...normalizeFrontendDesignMetaFields(metaInput, current.meta),
          },
    categoryIds: Array.isArray(input.categoryIds)
      ? input.categoryIds.map(sanitizeString).filter(Boolean)
      : current.categoryIds,
    tagIds: Array.isArray(input.tagIds)
      ? input.tagIds.map(sanitizeString).filter(Boolean)
      : current.tagIds,
    updatedAt: now,
    publishedAt:
      status === "published" && !current.publishedAt
        ? now
        : current.publishedAt,
    scheduledAt:
      input.scheduledAt === undefined
        ? current.scheduledAt
        : sanitizeString(input.scheduledAt) || null,
  };

  BLOG_POSTS[index] = updated;
  try { persistAdminContent(input.expectedContent !== undefined || input.expectedUpdatedAt !== undefined); }
  catch (error) { BLOG_POSTS[index] = current; const revisionIndex = CONTENT_REVISIONS.findIndex(item => item.id === beforeRevision.id); if (revisionIndex !== -1) CONTENT_REVISIONS.splice(revisionIndex, 1); throw error; }
  syncMediaReferencesForTarget(
    siteId,
    "post",
    postId,
    mediaReferencePayloadForContent(updated.content, updated.meta),
    updated.featuredImageId ? [updated.featuredImageId] : [],
  );
  return clone(updated);
}

export function deleteAdminBlogPost(siteId: string, postId: string): boolean {
  ensurePersistedAdminContentLoaded();

  const index = BLOG_POSTS.findIndex(
    (post) => post.siteId === siteId && post.id === postId,
  );
  if (index === -1) {
    return false;
  }

  BLOG_POSTS.splice(index, 1);
  removeMediaReferencesForTarget(siteId, "post", postId);
  removePreviewTokensForTarget(siteId, "post", postId);

  for (
    let revisionIndex = CONTENT_REVISIONS.length - 1;
    revisionIndex >= 0;
    revisionIndex -= 1
  ) {
    const revision = CONTENT_REVISIONS[revisionIndex];
    if (
      revision.siteId === siteId &&
      revision.targetType === "post" &&
      revision.targetId === postId
    ) {
      CONTENT_REVISIONS.splice(revisionIndex, 1);
    }
  }

  persistAdminContent();
  return true;
}

export function listContentRevisions(
  siteId: string,
  targetType: ContentRevision["targetType"],
  targetId: string,
  params: { limit?: number; offset?: number } = {},
): { revisions: ContentRevision[]; pagination: Pagination } {
  ensurePersistedAdminContentLoaded();

  const { limit = 25, offset = 0 } = params;
  const revisions = CONTENT_REVISIONS.filter(
    (revision) =>
      revision.siteId === siteId &&
      revision.targetType === targetType &&
      revision.targetId === targetId,
  );

  return {
    revisions: clone(revisions.slice(offset, offset + limit)),
    pagination: getPagination(revisions.length, limit, offset),
  };
}

export function publishAdminPage(
  siteId: string,
  pageId: string,
  actor = "admin",
): StorePage | undefined {
  ensurePersistedAdminContentLoaded();

  const index = PAGE_LIST.findIndex(
    (page) => page.siteId === siteId && page.id === pageId,
  );
  if (index === -1) {
    return undefined;
  }

  const current = PAGE_LIST[index];
  createContentRevision("page", current, "Before publish", actor, { operation: "publish" });

  const now = new Date().toISOString();
  const updated: StorePage = {
    ...current,
    status: "published",
    publishedAt: now,
    scheduledAt: null,
    updatedAt: now,
    meta: {
      ...current.meta,
      noIndex: false,
    },
  };

  PAGE_LIST[index] = updated;
  persistAdminContent();
  syncMediaReferencesForTarget(
    siteId,
    "page",
    pageId,
    mediaReferencePayloadForContent(updated.content, updated.meta),
  );
  return clone(updated);
}

export function archiveAdminPage(
  siteId: string,
  pageId: string,
  actor = "admin",
): StorePage | undefined {
  ensurePersistedAdminContentLoaded();

  const index = PAGE_LIST.findIndex(
    (page) => page.siteId === siteId && page.id === pageId,
  );
  if (index === -1) {
    return undefined;
  }

  const current = PAGE_LIST[index];
  createContentRevision("page", current, "Before archive", actor, { operation: "archive" });

  const updated: StorePage = {
    ...current,
    status: "archived",
    scheduledAt: null,
    updatedAt: new Date().toISOString(),
    meta: {
      ...current.meta,
      noIndex: true,
    },
  };

  PAGE_LIST[index] = updated;
  persistAdminContent();
  syncMediaReferencesForTarget(
    siteId,
    "page",
    pageId,
    mediaReferencePayloadForContent(updated.content, updated.meta),
  );
  return clone(updated);
}

export function rollbackAdminPage(
  siteId: string,
  pageId: string,
  revisionId: string,
  actor = "admin",
): StorePage | undefined {
  ensurePersistedAdminContentLoaded();

  const index = PAGE_LIST.findIndex(
    (page) => page.siteId === siteId && page.id === pageId,
  );
  const revision = CONTENT_REVISIONS.find(
    (item) =>
      item.id === revisionId &&
      item.siteId === siteId &&
      item.targetType === "page" &&
      item.targetId === pageId,
  );

  if (index === -1 || !revision) {
    return undefined;
  }

  const current = PAGE_LIST[index];
  createContentRevision(
    "page",
    current,
    `Before rollback to ${revisionId}`,
    actor,
    { operation: "rollback", restoreTargetRevisionId: revisionId },
  );

  const snapshot = revision.snapshot as StorePage;
  const updated: StorePage = {
    ...snapshot,
    updatedAt: new Date().toISOString(),
  };

  PAGE_LIST[index] = updated;
  persistAdminContent();
  syncMediaReferencesForTarget(
    siteId,
    "page",
    pageId,
    mediaReferencePayloadForContent(updated.content, updated.meta),
  );
  return clone(updated);
}

export function publishAdminBlogPost(
  siteId: string,
  postId: string,
  actor = "admin",
): StoreBlogPost | undefined {
  ensurePersistedAdminContentLoaded();

  const index = BLOG_POSTS.findIndex(
    (post) => post.siteId === siteId && post.id === postId,
  );
  if (index === -1) {
    return undefined;
  }

  const current = BLOG_POSTS[index];
  createContentRevision("post", current, "Before publish", actor, { operation: "publish" });

  const now = new Date().toISOString();
  const updated: StoreBlogPost = {
    ...current,
    status: "published",
    publishedAt: now,
    scheduledAt: null,
    updatedAt: now,
    meta: {
      ...current.meta,
      noIndex: false,
    },
  };

  BLOG_POSTS[index] = updated;
  persistAdminContent();
  syncMediaReferencesForTarget(
    siteId,
    "post",
    postId,
    mediaReferencePayloadForContent(updated.content, updated.meta),
    updated.featuredImageId ? [updated.featuredImageId] : [],
  );
  return clone(updated);
}

export function archiveAdminBlogPost(
  siteId: string,
  postId: string,
  actor = "admin",
): StoreBlogPost | undefined {
  ensurePersistedAdminContentLoaded();

  const index = BLOG_POSTS.findIndex(
    (post) => post.siteId === siteId && post.id === postId,
  );
  if (index === -1) {
    return undefined;
  }

  const current = BLOG_POSTS[index];
  createContentRevision("post", current, "Before archive", actor, { operation: "archive" });

  const updated: StoreBlogPost = {
    ...current,
    status: "archived",
    scheduledAt: null,
    updatedAt: new Date().toISOString(),
    meta: {
      ...current.meta,
      noIndex: true,
    },
  };

  BLOG_POSTS[index] = updated;
  persistAdminContent();
  syncMediaReferencesForTarget(
    siteId,
    "post",
    postId,
    mediaReferencePayloadForContent(updated.content, updated.meta),
    updated.featuredImageId ? [updated.featuredImageId] : [],
  );
  return clone(updated);
}

export function rollbackAdminBlogPost(
  siteId: string,
  postId: string,
  revisionId: string,
  actor = "admin",
): StoreBlogPost | undefined {
  ensurePersistedAdminContentLoaded();

  const index = BLOG_POSTS.findIndex(
    (post) => post.siteId === siteId && post.id === postId,
  );
  const revision = CONTENT_REVISIONS.find(
    (item) =>
      item.id === revisionId &&
      item.siteId === siteId &&
      item.targetType === "post" &&
      item.targetId === postId,
  );

  if (index === -1 || !revision) {
    return undefined;
  }

  const current = BLOG_POSTS[index];
  createContentRevision(
    "post",
    current,
    `Before rollback to ${revisionId}`,
    actor,
    { operation: "rollback", restoreTargetRevisionId: revisionId },
  );

  const snapshot = revision.snapshot as StoreBlogPost;
  const updated: StoreBlogPost = {
    ...snapshot,
    updatedAt: new Date().toISOString(),
  };

  BLOG_POSTS[index] = updated;
  persistAdminContent();
  syncMediaReferencesForTarget(
    siteId,
    "post",
    postId,
    mediaReferencePayloadForContent(updated.content, updated.meta),
    updated.featuredImageId ? [updated.featuredImageId] : [],
  );
  return clone(updated);
}

export function getMediaList(
  siteId: string,
  params: {
    type?: string;
    scope?: string;
    visibility?: string;
    search?: string;
    tag?: string;
    folderId?: string | null;
    pageId?: string;
    postId?: string;
    linkedPageId?: string;
    linkedPostId?: string;
    blogId?: string;
    global?: boolean;
    limit?: number;
    offset?: number;
  } = {},
): { media: MediaItem[]; pagination: Pagination } {
  ensurePersistedMediaLoaded();

  const {
    type,
    scope,
    visibility,
    search,
    tag,
    folderId,
    pageId,
    postId,
    blogId,
    global: globalOnly,
    limit = 50,
    offset = 0,
  } = params;
  const normalizedType =
    typeof type === "string" ? type.trim().toLowerCase() : undefined;
  const normalizedSearch =
    typeof search === "string" ? normalizeIdentifier(search) : "";
  const normalizedTag = typeof tag === "string" ? normalizeIdentifier(tag) : "";

  let media = MEDIA_LIBRARY.filter((item) => item.siteId === siteId);

  if (normalizedType) {
    media = media.filter((item) => item.type === normalizedType);
  }

  if (visibility) {
    media = media.filter((item) => item.visibility === visibility);
  }

  if (normalizedSearch) {
    media = media.filter(
      (item) =>
        normalizeIdentifier(item.originalName).includes(normalizedSearch) ||
        normalizeIdentifier(item.filename).includes(normalizedSearch) ||
        normalizeIdentifier(item.altText || "").includes(normalizedSearch) ||
        normalizeIdentifier(item.caption || "").includes(normalizedSearch) ||
        Object.values(item.metadata || {}).some((value) =>
          normalizeIdentifier(sanitizeString(value)).includes(normalizedSearch),
        ) ||
        item.tags.some((itemTag) =>
          normalizeIdentifier(itemTag).includes(normalizedSearch),
        ),
    );
  }

  if (normalizedTag) {
    media = media.filter((item) =>
      item.tags.some(
        (itemTag) => normalizeIdentifier(itemTag) === normalizedTag,
      ),
    );
  }

  if (folderId !== undefined) {
    media = media.filter((item) => item.folderId === (folderId || null));
  }

  media = media.filter((item) =>
    mediaMatchesScopeFilters(item, {
      scope,
      pageId,
      postId: postId || blogId,
      globalOnly,
    }),
  );

  media = media.filter(item => mediaMatchesLinkedFilters(item, params));
  const paginated = media.slice(offset, offset + limit);

  return {
    media: clone(paginated),
    pagination: getPagination(media.length, limit, offset),
  };
}

export function createMediaItem(
  siteId: string,
  input: {
    filename: string;
    originalName: string;
    mimeType: string;
    sizeBytes: number;
    type: MediaItem["type"];
    url: string;
    thumbnailUrl?: string | null;
    folderId?: string | null;
    pageIds?: string[];
    postIds?: string[];
    tags?: string[];
    metadata?: Record<string, unknown>;
    altText?: string | null;
    caption?: string | null;
    uploadedBy?: string | null;
    scope?: MediaItem["scope"];
    scopeTargetId?: string | null;
    visibility?: MediaItem["visibility"];
  },
): MediaItem {
  ensurePersistedMediaLoaded();

  const now = new Date().toISOString();
  const item: MediaItem = {
    id: `media_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
    siteId,
    filename: input.filename,
    originalName: input.originalName,
    mimeType: input.mimeType,
    sizeBytes: input.sizeBytes,
    type: input.type,
    url: input.url,
    thumbnailUrl:
      input.thumbnailUrl ?? (input.type === "image" ? input.url : null),
    folderId: input.folderId ?? null,
    pageIds: input.pageIds ?? [],
    postIds: input.postIds ?? [],
    tags: input.tags ?? [],
    metadata: input.metadata ?? {},
    altText: input.altText ?? null,
    caption: input.caption ?? null,
    uploadedBy: input.uploadedBy ?? "admin",
    scope: input.scope ?? "global",
    scopeTargetId: input.scopeTargetId ?? null,
    visibility: input.visibility ?? "public",
    createdAt: now,
    updatedAt: now,
  };

  MEDIA_LIBRARY.unshift(item);
  persistRuntimeMediaCatalog();
  return clone(item);
}

export function listMediaFolders(siteId: string): MediaFolder[] {
  ensurePersistedMediaLoaded();

  return clone(
    MEDIA_FOLDERS.filter((folder) => folder.siteId === siteId).sort(
      (a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name),
    ),
  );
}

export function createMediaFolder(
  siteId: string,
  input: Record<string, unknown>,
): MediaFolder {
  ensurePersistedMediaLoaded();

  const name = sanitizeString(input.name) || "Untitled folder";
  const parentId = sanitizeString(input.parentId) || null;
  const now = new Date().toISOString();
  const folder: MediaFolder = {
    id: sanitizeString(input.id) || createRuntimeId("folder"),
    siteId,
    parentId,
    name,
    sortOrder: Number.isFinite(Number(input.sortOrder))
      ? Number(input.sortOrder)
      : MEDIA_FOLDERS.filter((item) => item.siteId === siteId).length + 1,
    createdAt: now,
  };

  MEDIA_FOLDERS.unshift(folder);
  persistRuntimeMediaCatalog();
  return clone(folder);
}

export function updateMediaFolder(
  siteId: string,
  folderId: string,
  input: Record<string, unknown>,
): MediaFolder | undefined {
  ensurePersistedMediaLoaded();

  const index = MEDIA_FOLDERS.findIndex(
    (folder) => folder.siteId === siteId && folder.id === folderId,
  );
  if (index === -1) {
    return undefined;
  }

  const current = MEDIA_FOLDERS[index];
  const updated: MediaFolder = {
    ...current,
    name:
      input.name === undefined
        ? current.name
        : sanitizeString(input.name) || current.name,
    parentId:
      input.parentId === undefined
        ? current.parentId
        : sanitizeString(input.parentId) || null,
    sortOrder:
      input.sortOrder === undefined
        ? current.sortOrder
        : Number.isFinite(Number(input.sortOrder))
          ? Number(input.sortOrder)
          : current.sortOrder,
  };

  MEDIA_FOLDERS[index] = updated;
  persistRuntimeMediaCatalog();
  return clone(updated);
}

export function deleteMediaFolder(siteId: string, folderId: string): boolean {
  ensurePersistedMediaLoaded();

  const index = MEDIA_FOLDERS.findIndex(
    (folder) => folder.siteId === siteId && folder.id === folderId,
  );
  if (index === -1) {
    return false;
  }

  MEDIA_FOLDERS.splice(index, 1);

  for (
    let folderIndex = 0;
    folderIndex < MEDIA_FOLDERS.length;
    folderIndex += 1
  ) {
    if (
      MEDIA_FOLDERS[folderIndex].siteId === siteId &&
      MEDIA_FOLDERS[folderIndex].parentId === folderId
    ) {
      MEDIA_FOLDERS[folderIndex] = {
        ...MEDIA_FOLDERS[folderIndex],
        parentId: null,
      };
    }
  }

  for (let mediaIndex = 0; mediaIndex < MEDIA_LIBRARY.length; mediaIndex += 1) {
    if (
      MEDIA_LIBRARY[mediaIndex].siteId === siteId &&
      MEDIA_LIBRARY[mediaIndex].folderId === folderId
    ) {
      MEDIA_LIBRARY[mediaIndex] = {
        ...MEDIA_LIBRARY[mediaIndex],
        folderId: null,
        updatedAt: new Date().toISOString(),
      };
    }
  }

  persistRuntimeMediaCatalog();
  return true;
}

export function updateMediaItem(
  siteId: string,
  mediaId: string,
  input: Record<string, unknown>,
): MediaItem | undefined {
  ensurePersistedMediaLoaded();

  const index = MEDIA_LIBRARY.findIndex(
    (item) => item.siteId === siteId && item.id === mediaId,
  );
  if (index === -1) {
    return undefined;
  }

  const current = MEDIA_LIBRARY[index];
  const scope = sanitizeString(input.scope);
  const visibility = sanitizeString(input.visibility);
  const rawTags = input.tags;
  const pageIds = Array.isArray(input.pageIds)
    ? input.pageIds.map(sanitizeString).filter(Boolean)
    : current.pageIds;
  const postIds = Array.isArray(input.postIds)
    ? input.postIds.map(sanitizeString).filter(Boolean)
    : current.postIds;
  const nextScope =
    scope === "page" || scope === "post" || scope === "global"
      ? scope
      : current.scope || "global";
  const scopeTargetId =
    input.scopeTargetId === undefined
      ? current.scopeTargetId || null
      : sanitizeString(input.scopeTargetId) || null;

  const updated: MediaItem = {
    ...current,
    filename:
      input.filename === undefined
        ? current.filename
        : sanitizeString(input.filename) || current.filename,
    originalName:
      input.originalName === undefined
        ? current.originalName
        : sanitizeString(input.originalName) || current.originalName,
    mimeType:
      input.mimeType === undefined
        ? current.mimeType
        : sanitizeString(input.mimeType) || current.mimeType,
    sizeBytes:
      input.sizeBytes === undefined && input.size === undefined
        ? current.sizeBytes
        : Math.max(
            0,
            Number(input.sizeBytes ?? input.size) || current.sizeBytes,
          ),
    type:
      input.type === "image" ||
      input.type === "video" ||
      input.type === "audio" ||
      input.type === "document" ||
      input.type === "font" ||
      input.type === "other"
        ? input.type
        : current.type,
    url:
      input.url === undefined
        ? current.url
        : sanitizeString(input.url) || current.url,
    thumbnailUrl:
      input.thumbnailUrl === undefined
        ? current.thumbnailUrl
        : sanitizeString(input.thumbnailUrl) || null,
    folderId:
      input.folderId === undefined
        ? current.folderId
        : sanitizeString(input.folderId) || null,
    pageIds:
      nextScope === "page" && scopeTargetId && !pageIds.includes(scopeTargetId)
        ? [...pageIds, scopeTargetId]
        : pageIds,
    postIds:
      nextScope === "post" && scopeTargetId && !postIds.includes(scopeTargetId)
        ? [...postIds, scopeTargetId]
        : postIds,
    tags: Array.isArray(rawTags)
      ? rawTags.map(sanitizeString).filter(Boolean)
      : typeof rawTags === "string"
        ? rawTags
            .split(",")
            .map((tag) => tag.trim())
            .filter(Boolean)
        : current.tags,
    metadata:
      input.metadata &&
      typeof input.metadata === "object" &&
      !Array.isArray(input.metadata)
        ? {
            ...current.metadata,
            ...(input.metadata as Record<string, unknown>),
          }
        : current.metadata,
    altText:
      input.altText === undefined
        ? current.altText
        : sanitizeString(input.altText) || null,
    caption:
      input.caption === undefined
        ? current.caption
        : sanitizeString(input.caption) || null,
    uploadedBy:
      input.uploadedBy === undefined
        ? current.uploadedBy
        : sanitizeString(input.uploadedBy) || null,
    scope: nextScope,
    scopeTargetId,
    visibility:
      visibility === "private" || visibility === "public"
        ? visibility
        : current.visibility || "public",
    updatedAt: new Date().toISOString(),
  };

  MEDIA_LIBRARY[index] = updated;
  persistRuntimeMediaCatalog();
  return clone(updated);
}

export function deleteMediaItem(
  siteId: string,
  mediaId: string,
): MediaItem | undefined {
  ensurePersistedMediaLoaded();

  const index = MEDIA_LIBRARY.findIndex(
    (item) => item.siteId === siteId && item.id === mediaId,
  );
  if (index === -1) {
    return undefined;
  }

  const [removed] = MEDIA_LIBRARY.splice(index, 1);
  persistRuntimeMediaCatalog();
  return clone(removed);
}

export function listFormsBySite(
  siteId: string,
  filters: { pageId?: string; postId?: string } = {},
): FormDefinition[] {
  const staticForms = FORM_LIBRARY.filter(
    (form) => form.siteId === siteId && matchesFormContextFilter(form, filters),
  );
  const dynamicForms = getDynamicFormsBySite(siteId).filter((form) =>
    matchesFormContextFilter(form, filters),
  );

  return clone(mergeFormDefinitions(staticForms, dynamicForms));
}

export function getFormById(
  siteId: string,
  formId: string,
): FormDefinition | undefined {
  const form = listFormsBySite(siteId).find(
    (item) => normalizeIdentifier(item.id) === normalizeIdentifier(formId),
  );

  return form ? clone(form) : undefined;
}

/** One strict disk commit; only process-local synchronous admission is guaranteed. */
export function commitDemoFormTemplatePack(
  siteId: string,
  prepare: () => Array<Omit<FormDefinition, "id" | "createdAt" | "updatedAt">>,
  finalize: (form: FormDefinition) => FormDefinition = form => form,
): FormDefinition[] {
  ensurePersistedAdminContentLoaded(true);
  if (getSiteByIdOrSlug(siteId)?.id !== siteId) throw Object.assign(new Error("Site not found."), { status: 404, code: "SITE_NOT_FOUND" });
  const snapshot = existsSync(ADMIN_CONTENT_PATH) ? JSON.parse(readFileSync(ADMIN_CONTENT_PATH, "utf8")) : {};
  if (!snapshot || typeof snapshot !== "object" || Array.isArray(snapshot)) throw new Error("Invalid store snapshot.");
  const inputs = prepare();
  const now = new Date().toISOString();
  const created = inputs.map(input => finalize({ ...clone(input), id: `form-${randomUUID()}`, siteId, pageId: null, postId: null, isActive: false, createdAt: now, updatedAt: now }));
  const nextForms = [...FORM_LIBRARY, ...created];
  const next = { ...snapshot, sites: snapshot.sites || clone(SITE_LIST), forms: clone(nextForms) };
  const temporary = `${ADMIN_CONTENT_PATH}.${randomUUID()}.form-import.tmp`;
  let fd: number | undefined;
  try {
    mkdirSync(dirname(ADMIN_CONTENT_PATH), { recursive: true });
    fd = openSync(temporary, "wx", 0o600);
    const serialized = JSON.stringify(next);
    writeFileSync(fd, serialized, "utf8");
    fsyncSync(fd); closeSync(fd); fd = undefined;
    if (readFileSync(temporary, "utf8") !== serialized) throw new Error("Store verification failed.");
    renameSync(temporary, ADMIN_CONTENT_PATH);
  } catch (error) {
    if (fd !== undefined) closeSync(fd);
    try { unlinkSync(temporary); } catch {}
    throw error;
  }
  FORM_LIBRARY.splice(0, FORM_LIBRARY.length, ...nextForms);
  persistedAdminContentSignature = getAdminContentFileSignature();
  return clone(created);
}

export function createAdminForm(
  input: Omit<FormDefinition, "id" | "createdAt" | "updatedAt"> & {
    id?: string;
  },
): FormDefinition {
  ensurePersistedAdminContentLoaded();
  const site = getSiteByIdOrSlug(input.siteId);
  if (!site) {
    throw new Error("Site not found");
  }

  const baseName = normalizeSlugInput(
    input.name || input.title || "form",
    "form",
  );
  let formId =
    input.id && String(input.id).trim()
      ? normalizeSlugInput(input.id, baseName)
      : `form-${baseName}`;
  let suffix = 2;
  while (
    FORM_LIBRARY.some(
      (form) =>
        form.siteId === site.id &&
        normalizeIdentifier(form.id) === normalizeIdentifier(formId),
    )
  ) {
    formId = `form-${baseName}-${suffix}`;
    suffix += 1;
  }

  const now = new Date().toISOString();
  const form: FormDefinition = {
    id: formId,
    siteId: site.id,
    pageId: input.pageId || null,
    postId: input.postId || null,
    name: input.name?.trim() || baseName,
    title: input.title?.trim() || input.name?.trim() || "Untitled form",
    description: input.description?.trim() || null,
    audience: input.audience || "public",
    isActive: input.isActive !== false,
    fields: Array.isArray(input.fields) ? input.fields : [],
    notificationEmail: input.notificationEmail || null,
    notificationWebhook: input.notificationWebhook || null,
    successRedirectUrl: input.successRedirectUrl || null,
    successMessage: input.successMessage || "Submission received.",
    enableHoneypot: input.enableHoneypot !== false,
    enableCaptcha: input.enableCaptcha === true,
    spamSettings: input.spamSettings,
    consentSettings: input.consentSettings,
    moderationMode: input.moderationMode || "manual",
    contactShare: input.contactShare,
    collectionTarget: input.collectionTarget,
    settings: input.settings || {},
    createdBy: input.createdBy || "admin",
    updatedBy: input.updatedBy || "admin",
    createdAt: now,
    updatedAt: now,
  };

  FORM_LIBRARY.unshift(form);
  persistAdminContent();
  recordAdminAuditLog({
    siteId: site.id,
    actorId: input.createdBy || "admin",
    entity: "form",
    entityId: form.id,
    action: "form.created",
    after: clone(form) as unknown as BackyJsonObject,
    metadata: {
      name: form.name,
      fieldCount: form.fields.length,
      source: form.pageId || form.postId ? "content-bound" : "standalone",
    },
  });

  return clone(form);
}

export function updateAdminForm(
  siteId: string,
  formId: string,
  input: BackyFormUpdateInput,
): FormDefinition | null {
  ensurePersistedAdminContentLoaded();
  const site = getSiteByIdOrSlug(siteId);
  if (!site) {
    return null;
  }

  const index = FORM_LIBRARY.findIndex(
    (form) =>
      form.siteId === site.id &&
      normalizeIdentifier(form.id) === normalizeIdentifier(formId),
  );
  if (index === -1) {
    return null;
  }

  const before = FORM_LIBRARY[index];
  assertFormDefinitionExpectation(before, input);
  if (input.beforeUpdateFormDesignRevision) assertFormDesignOnlyUpdate(before, input);
  const inputSettings = isObjectRecord(input.settings)
    ? input.settings
    : undefined;
  const beforeSettings = isObjectRecord(before.settings) ? before.settings : {};
  const nextSettings = input.beforeUpdateFormDesignRevision && inputSettings ? inputSettings : inputSettings
    ? {
        ...beforeSettings,
        ...inputSettings,
        ...(isObjectRecord(inputSettings.spam)
          ? {
              spam: {
                ...(isObjectRecord(beforeSettings.spam)
                  ? beforeSettings.spam
                  : {}),
                ...inputSettings.spam,
              },
            }
          : {}),
        ...(isObjectRecord(inputSettings.consent)
          ? {
              consent: {
                ...(isObjectRecord(beforeSettings.consent)
                  ? beforeSettings.consent
                  : {}),
                ...inputSettings.consent,
              },
            }
          : {}),
      }
    : before.settings;
  const updated: FormDefinition = {
    ...before,
    pageId: input.pageId !== undefined ? input.pageId : before.pageId,
    postId: input.postId !== undefined ? input.postId : before.postId,
    name: input.name !== undefined ? input.name.trim() : before.name,
    title:
      input.title !== undefined ? input.title?.trim() || null : before.title,
    description:
      input.description !== undefined
        ? input.description?.trim() || null
        : before.description,
    audience: input.audience !== undefined ? input.audience : before.audience,
    isActive: input.isActive !== undefined ? input.isActive : before.isActive,
    fields: input.fields !== undefined ? input.fields : before.fields,
    notificationEmail:
      input.notificationEmail !== undefined
        ? input.notificationEmail || null
        : before.notificationEmail,
    notificationWebhook:
      input.notificationWebhook !== undefined
        ? input.notificationWebhook || null
        : before.notificationWebhook,
    successRedirectUrl:
      input.successRedirectUrl !== undefined
        ? input.successRedirectUrl || null
        : before.successRedirectUrl,
    successMessage:
      input.successMessage !== undefined
        ? input.successMessage || null
        : before.successMessage,
    enableHoneypot:
      input.enableHoneypot !== undefined
        ? input.enableHoneypot
        : before.enableHoneypot,
    enableCaptcha:
      input.enableCaptcha !== undefined
        ? input.enableCaptcha
        : before.enableCaptcha,
    spamSettings:
      input.spamSettings !== undefined
        ? input.spamSettings
        : before.spamSettings,
    consentSettings:
      input.consentSettings !== undefined
        ? input.consentSettings
        : before.consentSettings,
    moderationMode:
      input.moderationMode !== undefined
        ? input.moderationMode
        : before.moderationMode,
    contactShare:
      input.contactShare !== undefined
        ? input.contactShare
        : before.contactShare,
    collectionTarget:
      input.collectionTarget !== undefined
        ? input.collectionTarget
        : before.collectionTarget,
    settings: nextSettings,
    updatedBy: input.updatedBy || "admin",
    updatedAt: new Date(Math.max(Date.now(), Date.parse(before.updatedAt) + 1)).toISOString(),
  };

  const details = input.beforeUpdateFormDesignRevision;
  const revision: BackyFormDesignRevision | null = details ? { id: randomUUID(), siteId: site.id, formId: before.id, snapshot: snapshotFormTemplateDesign(before), ...details, templateId: details.templateId || null, targetRevisionId: details.targetRevisionId || null, actorId: details.actorId || null, createdAt: new Date().toISOString() } : null;
  if (revision) FORM_DESIGN_REVISIONS.push(revision);
  FORM_LIBRARY[index] = updated;
  try { persistAdminContent(true); }
  catch (error) { FORM_LIBRARY[index] = before; if (revision) FORM_DESIGN_REVISIONS.splice(FORM_DESIGN_REVISIONS.indexOf(revision), 1); throw error; }
  recordAdminAuditLog({
    siteId: site.id,
    actorId: input.updatedBy || "admin",
    entity: "form",
    entityId: updated.id,
    action: "form.updated",
    before: clone(before) as unknown as BackyJsonObject,
    after: clone(updated) as unknown as BackyJsonObject,
    metadata: {
      name: updated.name,
      fieldCount: updated.fields.length,
      source: updated.pageId || updated.postId ? "content-bound" : "standalone",
    },
  });

  return clone(updated);
}

export function deleteAdminForm(
  siteId: string,
  formId: string,
): FormDefinition | null {
  ensurePersistedAdminContentLoaded();
  const site = getSiteByIdOrSlug(siteId);
  if (!site) {
    return null;
  }

  const index = FORM_LIBRARY.findIndex(
    (form) =>
      form.siteId === site.id &&
      normalizeIdentifier(form.id) === normalizeIdentifier(formId),
  );
  if (index === -1) {
    return null;
  }

  const [removed] = FORM_LIBRARY.splice(index, 1);
  for (let i = FORM_DESIGN_REVISIONS.length - 1; i >= 0; i--) if (FORM_DESIGN_REVISIONS[i].siteId === site.id && FORM_DESIGN_REVISIONS[i].formId === removed.id) FORM_DESIGN_REVISIONS.splice(i, 1);
  refreshPersistedInteractionStore();
  setFormSubmissions(
    formSubmissions.filter((submission) => submission.formId !== removed.id),
  );
  setContactStore(
    contactStore.filter((contact) => contact.formId !== removed.id),
  );
  persistAdminContent();
  persistInteractionStore({ mergePersisted: false });
  recordAdminAuditLog({
    siteId: site.id,
    actorId: "admin",
    entity: "form",
    entityId: removed.id,
    action: "form.deleted",
    before: clone(removed) as unknown as BackyJsonObject,
    metadata: {
      name: removed.name,
      fieldCount: removed.fields.length,
    },
  });

  return clone(removed);
}

export function validateAndClassifyFormSubmission(
  form: FormDefinition,
  values: Record<string, unknown>,
  body: {
    honeypot?: string;
    ipHash?: string | null;
    requestId?: string | null;
    rateLimitBypass?: boolean;
    startedAt?: string | number | null;
  } = {},
): {
  ok: boolean;
  status: FormSubmission["status"];
  validation: SubmissionValidationDetail[];
  spamFlags: string[];
  spamMessage?: string;
} {
  const validation = validateSubmissionValues(form, values);

  if (validation.length > 0) {
    return {
      ok: false,
      status: "rejected",
      validation,
      spamFlags: ["validation"],
      spamMessage: "Validation failed",
    };
  }

  if (body.rateLimitBypass) {
    return {
      ok: true,
      status: form.moderationMode === "auto-approve" ? "approved" : "pending",
      validation,
      spamFlags: [],
    };
  }

  const spamCheck = checkSubmissionSpamSignals(form, body, values);
  return {
    ok: spamCheck.status !== "spam",
    status: spamCheck.status,
    validation,
    spamFlags: spamCheck.flags,
    spamMessage: spamCheck.errors,
  };
}

export function validateAndClassifyComment(params: {
  siteId: string;
  targetType: CommentTargetType;
  targetId: string;
  content: string;
  moderationMode: "manual" | "auto-approve";
  authorEmail?: string;
  honeypot?: string;
  ipHash?: string | null;
  requestId?: string;
  startedAt?: string | number | null;
  rateLimitBypass?: boolean;
  blockedTerms?: string[];
  /** Trusted server option; never copied from a public request body. */
  checkBlockedIdentity?: boolean;
}): {
  ok: boolean;
  status: Comment["status"];
  spamFlags: string[];
  spamMessage?: string;
} {
  refreshPersistedInteractionStore();

  const spamCheck = checkCommentSpamSignals({
    siteId: params.siteId,
    targetType: params.targetType,
    targetId: params.targetId,
    authorEmail: params.authorEmail,
    content: params.content,
    honeypot: params.honeypot,
    ipHash: params.ipHash,
    startedAt: params.startedAt,
    rateLimitBypass: params.rateLimitBypass,
    blockedTerms: params.blockedTerms,
    checkBlockedIdentity: params.checkBlockedIdentity,
  });

  return {
    ok: spamCheck.ok,
    status: spamCheck.ok
      ? params.moderationMode === "auto-approve"
        ? "approved"
        : "pending"
      : spamCheck.status,
    spamFlags: spamCheck.flags,
    spamMessage: spamCheck.errors,
  };
}

export function buildContactShareFromSubmission(
  siteId: string,
  formId: string,
  values: Record<string, unknown>,
  submissionMeta: {
    status: FormSubmission["status"];
    pageId?: string | null;
    postId?: string | null;
    ipHash?: string | null;
    sourceSubmissionId?: string;
    requestId?: string;
  },
  contactShareOverride?: ContactShareOverride,
): Contact | null {
  refreshPersistedInteractionStore();

  const form = getFormById(siteId, formId);
  if (!form) {
    return null;
  }

  const formShareEnabled = form.contactShare?.enabled === true;
  const resolvedShare: ContactShareOverride = {
    enabled: formShareEnabled && contactShareOverride?.enabled !== false,
    nameField: contactShareOverride?.nameField || form.contactShare?.nameField,
    emailField:
      contactShareOverride?.emailField || form.contactShare?.emailField,
    phoneField:
      contactShareOverride?.phoneField || form.contactShare?.phoneField,
    notesField:
      contactShareOverride?.notesField || form.contactShare?.notesField,
    dedupeByEmail:
      contactShareOverride?.dedupeByEmail ?? form.contactShare?.dedupeByEmail,
  };

  if (!resolvedShare.enabled) {
    return null;
  }

  const name = parseShareValue(values, resolvedShare.nameField);
  const email = parseShareValue(values, resolvedShare.emailField);
  const phone = parseShareValue(values, resolvedShare.phoneField);
  const notes = parseShareValue(values, resolvedShare.notesField);

  if (!email && !name && !phone) {
    return null;
  }

  const hasContactIdentity = name || email || phone;
  if (!hasContactIdentity) {
    return null;
  }

  const dedupeByEmail = resolvedShare.dedupeByEmail !== false;
  const normalizedEmail = email ? normalizeIdentifier(email) : null;
  const existingByEmail =
    dedupeByEmail && normalizedEmail
      ? contactStore.find(
          (contact) =>
            contact.siteId === siteId &&
            contact.formId === formId &&
            normalizeIdentifier(contact.email || "") === normalizedEmail,
        )
      : null;

  const payload: Contact = {
    id: existingByEmail
      ? existingByEmail.id
      : `contact-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    siteId,
    formId,
    pageId: submissionMeta.pageId ?? null,
    postId: submissionMeta.postId ?? null,
    name: name ?? existingByEmail?.name ?? null,
    email: email ?? existingByEmail?.email ?? null,
    phone: phone ?? existingByEmail?.phone ?? null,
    notes: [existingByEmail?.notes, notes]
      .filter((value) => value)
      .join(existingByEmail?.notes ? "\n" : ""),
    sourceValues: values,
    status: "new",
    sourceSubmissionId: submissionMeta.sourceSubmissionId,
    requestId: submissionMeta.requestId,
    sourceIpHash: submissionMeta.ipHash || null,
    createdAt: existingByEmail
      ? existingByEmail.createdAt
      : new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  if (existingByEmail) {
    const merged = {
      ...existingByEmail,
      ...payload,
      notes: [existingByEmail.notes, notes]
        .filter((value) => value)
        .join(existingByEmail.notes ? "\n" : ""),
      status: submissionMeta.status === "spam" ? existingByEmail.status : "new",
      updatedAt: new Date().toISOString(),
    };

    setContactStore(
      contactStore.map((item) =>
        item.id === existingByEmail.id ? merged : item,
      ),
    );
    persistInteractionStore();
    return clone(merged);
  }

  if (submissionMeta.status === "spam") {
    return null;
  }

  setContactStore([payload, ...contactStore]);
  persistInteractionStore();
  return clone(payload);
}

export function trackWebhookEvent(event: {
  kind: WebhookEventKind;
  siteId?: string;
  formId?: string;
  commentId?: string;
  contactId?: string;
  submissionId?: string;
  target: string;
  status: AuditEventStatus;
  statusCode?: number;
  requestId?: string;
  reason?: string;
  actor?: string;
  metadata?: Record<string, unknown>;
  error?: string;
}) {
  const entry: AuditEvent = {
    id: `event-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    kind: event.kind,
    siteId: event.siteId || "site-demo",
    formId: event.formId || null,
    commentId: event.commentId || null,
    contactId: event.contactId || null,
    submissionId: event.submissionId || null,
    target: event.target,
    status: event.status,
    reason: event.reason,
    actor: event.actor,
    metadata: event.metadata || {},
    statusCode: event.statusCode,
    requestId: event.requestId,
    error: event.error,
    createdAt: new Date().toISOString(),
  };
  auditEvents.unshift(entry);
  persistInteractionStore();
}

/** Authoritative scoped notification admission; never fall back to cached interaction state. */
export function getPersistedCommentDeliverySource(siteId:string,commentId:string,eventId?:string): {comment:Comment|null;event:AuditEvent|null} {
  try {
    recoverDemoSiteBackupCommit();
    if(!existsSync(INTERACTION_STORE_PATH))return {comment:null,event:null};
    if(statSync(INTERACTION_STORE_PATH).size>50_000_000)throw Error('Inventory limit');
    const snapshot=JSON.parse(readFileSync(INTERACTION_STORE_PATH,'utf8'));
    if(!snapshot||!Array.isArray(snapshot.comments)||!Array.isArray(snapshot.auditEvents))throw Error('Invalid delivery source inventory');
    for(const values of [snapshot.comments,snapshot.auditEvents]){const ids=new Set<string>();for(const row of values){if(!row||typeof row.id!=='string'||typeof row.siteId!=='string'||ids.has(row.id))throw Error('Invalid delivery source identity');ids.add(row.id);}}
    const comment=snapshot.comments.find((row:Comment)=>row.siteId===siteId&&row.id===commentId)||null;
    const event=eventId?snapshot.auditEvents.find((row:AuditEvent)=>row.siteId===siteId&&row.commentId===commentId&&row.id===eventId)||null:null;
    return {comment:clone(comment),event:clone(event)};
  }catch{throw new BackyCommentDeliveryError('DELIVERY_JOURNAL_UNAVAILABLE',503,'The persisted delivery source cannot be verified. No provider request was made.');}
}

/** Scoped persisted form submission and legacy notification source, independent of audit paging. */
export function getPersistedFormDeliverySource(siteId:string,formId:string,submissionId:string,eventId?:string): {submission:FormSubmission|null;event:AuditEvent|null} {
 try {
  recoverDemoSiteBackupCommit();
  if(!existsSync(INTERACTION_STORE_PATH))return {submission:null,event:null};
  if(statSync(INTERACTION_STORE_PATH).size>50_000_000)throw Error('Inventory limit');
  const snapshot=JSON.parse(readFileSync(INTERACTION_STORE_PATH,'utf8'));
  if(!snapshot||!Array.isArray(snapshot.formSubmissions)||!Array.isArray(snapshot.auditEvents))throw Error('Invalid source inventory');
  for(const values of [snapshot.formSubmissions,snapshot.auditEvents]){const ids=new Set<string>();for(const row of values){if(!row||typeof row.id!=='string'||typeof row.siteId!=='string'||ids.has(row.id))throw Error('Invalid source identity');ids.add(row.id);}}
  return {submission:clone(snapshot.formSubmissions.find((row:FormSubmission)=>row.siteId===siteId&&row.formId===formId&&row.id===submissionId)||null),event:clone(eventId?snapshot.auditEvents.find((row:AuditEvent)=>row.siteId===siteId&&row.formId===formId&&row.submissionId===submissionId&&row.id===eventId)||null:null)};
 }catch{throw new BackyFormDeliveryError('DELIVERY_JOURNAL_UNAVAILABLE',503,'Persisted form delivery source cannot be verified. No provider request was made.');}
}

export function listAuditEvents(
  siteId: string,
  params: {
    kind?: WebhookEventKind | "all";
    requestId?: string;
    formId?: string;
    commentId?: string;
    contactId?: string;
    limit?: number;
    offset?: number;
  } = {},
): { events: AuditEvent[]; count: number; pagination: Pagination } {
  refreshPersistedInteractionStore();

  const {
    kind,
    requestId,
    formId,
    commentId,
    contactId,
    limit = 100,
    offset = 0,
  } = params;

  let filtered = auditEvents.filter((event) => event.siteId === siteId);

  if (kind && kind !== "all") {
    filtered = filtered.filter((event) => event.kind === kind);
  }

  if (requestId) {
    filtered = filtered.filter((event) => event.requestId === requestId);
  }

  if (formId) {
    filtered = filtered.filter((event) => event.formId === formId);
  }

  if (commentId) {
    filtered = filtered.filter((event) => event.commentId === commentId);
  }

  if (contactId) {
    filtered = filtered.filter((event) => event.contactId === contactId);
  }

  const paginated = filtered.slice(offset, offset + limit);

  return {
    events: clone(paginated),
    count: filtered.length,
    pagination: getPagination(filtered.length, limit, offset),
  };
}

/** One durable replacement for comment/identity moderation. Single-process admission only. */
function commitCommentModerationSnapshot<T>(siteId: string, mutate: (snapshot: InteractionStoreSnapshot) => T): T {
  let snapshot: InteractionStoreSnapshot;
  try {
    snapshot = existsSync(INTERACTION_STORE_PATH) ? JSON.parse(readFileSync(INTERACTION_STORE_PATH, 'utf8')) : {
      comments: clone(commentStore), formSubmissions: clone(formSubmissions), contacts: clone(contactStore), auditEvents: clone(auditEvents), commentBlocklist: clone(Array.from(COMMENT_REPORT_BLOCKLIST.values())),
    };
    if (!snapshot || !Array.isArray(snapshot.comments) || !Array.isArray(snapshot.commentBlocklist || [])) throw Error('Invalid snapshot');
    for (const values of [snapshot.comments, snapshot.commentBlocklist || []]) {
      const ids = new Set<string>();
      for (const value of values) { if (!value || !value.id || typeof value.siteId !== 'string' || ids.has(value.id)) throw Error('Invalid inventory'); ids.add(value.id); }
    }
    if (snapshot.comments.filter(comment => comment.siteId === siteId).length > BACKY_COMMENT_INVENTORY_LIMIT) throw Error('Inventory limit');
  } catch { throw new BackyCommentLifecycleError('COMMENT_INVENTORY_INCOMPLETE', 'The persisted moderation inventory could not be verified.'); }
  if (getSiteByIdOrSlug(siteId)?.id !== siteId) throw new BackyCommentLifecycleError('COMMENT_MODERATION_CONFLICT', 'The selected site no longer exists.');
  const result = mutate(snapshot), serialized = JSON.stringify(snapshot, null, 2), temporary = `${INTERACTION_STORE_PATH}.${randomUUID()}.tmp`;
  try {
    mkdirSync(dirname(INTERACTION_STORE_PATH), { recursive: true }); writeFileSync(temporary, serialized, { flag: 'wx', mode: 0o600 });
    const descriptor = openSync(temporary, 'r'); try { fsyncSync(descriptor); } finally { closeSync(descriptor); }
    if (readFileSync(temporary, 'utf8') !== serialized) throw Error('Readback failed'); renameSync(temporary, INTERACTION_STORE_PATH);
  } catch { try { unlinkSync(temporary); } catch {} throw new BackyCommentLifecycleError('COMMENT_MODERATION_UNAVAILABLE', 'The moderation could not be persisted. No moderation was committed.'); }
  setCommentStore(snapshot.comments || []); setCommentBlocklist(snapshot.commentBlocklist || []);
  auditEvents.splice(0, auditEvents.length, ...(snapshot.auditEvents || []));
  return result === undefined ? result : clone(result);
}

function addSnapshotIdentityBlocks(snapshot: InteractionStoreSnapshot, params: { siteId: string; reason: string; actor?: string | null; requestId?: string; email?: string | null; ipHash?: string | null }) {
  const values = new Map((snapshot.commentBlocklist || []).map(entry => [entry.id, entry]));
  for (const [type, value] of [['email', params.email], ['ip', params.ipHash]] as const) {
    if (!value) continue;
    const id = getCommentBlockKey(params.siteId, type, value);
    const existing = values.get(id); if (existing && existing.siteId !== params.siteId) throw new BackyCommentLifecycleError('COMMENT_MODERATION_CONFLICT', 'The identity scope changed.');
    values.set(id, { id, siteId: params.siteId, type, value: normalizeIdentifier(value), reason: params.reason, actor: params.actor || undefined, requestId: params.requestId, createdAt: new Date().toISOString() });
  }
  snapshot.commentBlocklist = Array.from(values.values());
}

function moderateDemoComments(params: { siteId: string; commentIds: string[]; status?: Comment['status']; reviewedBy?: string | null; actor?: string | null; rejectionReason?: string | null; blockReason?: string | null; requestId?: string; clearReports?: boolean }): { updated: Comment[]; missingIds: string[] } {
  const ids = Array.from(new Set(params.commentIds.map(id => id.trim()).filter(Boolean)));
  if (ids.length > BACKY_COMMENT_INVENTORY_LIMIT) throw new BackyCommentLifecycleError('COMMENT_INVENTORY_INCOMPLETE', 'The selected moderation inventory exceeds the supported limit.');
  return commitCommentModerationSnapshot(params.siteId, snapshot => {
    const current = new Map((snapshot.comments || []).filter(comment => comment.siteId === params.siteId).map(comment => [comment.id, comment]));
    const updated: Comment[] = [], missingIds: string[] = [], reviewer = params.actor || params.reviewedBy || 'admin';
    for (const id of ids) {
      const comment = current.get(id); if (!comment) { missingIds.push(id); continue; }
      comment.reviewedBy = reviewer; comment.reviewedAt = new Date().toISOString(); comment.updatedAt = comment.reviewedAt;
      const requestId = params.requestId || comment.requestId || undefined; if (params.requestId) comment.requestId = params.requestId;
      if (params.clearReports) { comment.reportCount = 0; comment.reportReasons = []; }
      if (params.status) {
        comment.status = params.status; comment.rejectionReason = params.rejectionReason ?? null;
        if (params.status === 'blocked') {
          comment.blockReason = params.blockReason || 'manual-block'; comment.blockedBy = reviewer; comment.blockedAt = comment.reviewedAt;
          addSnapshotIdentityBlocks(snapshot, { siteId: params.siteId, reason: comment.blockReason, actor: reviewer, requestId, email: comment.authorEmail, ipHash: comment.ipHash });
        } else if (params.status !== 'rejected' && params.status !== 'spam') { comment.blockReason = null; comment.blockedBy = null; comment.blockedAt = null; comment.rejectionReason = null; }
      }
      updated.push(comment);
      snapshot.auditEvents = [{ id: `event-${randomUUID()}`, kind: 'comment-status', siteId: params.siteId, commentId: id, formId: null, contactId: null, submissionId: null, target: `comment:${id}`, status: 'succeeded', requestId, reason: params.status || 'reports-cleared', actor: reviewer, metadata: { targetType: comment.targetType, targetId: comment.targetId, status: comment.status, reportsCleared: params.clearReports === true }, createdAt: new Date().toISOString() }, ...(snapshot.auditEvents || [])];
    }
    return { updated, missingIds };
  });
}

export function blockCommentIdentity(params: {
  siteId: string;
  reason: string;
  actor?: string;
  requestId?: string;
  email?: string | null;
  ipHash?: string | null;
}) {
  commitCommentModerationSnapshot(params.siteId, snapshot => addSnapshotIdentityBlocks(snapshot, params));
}

export function listCommentBlocklist(
  siteId: string,
  options: {
    type?: "email" | "ip" | "all";
    q?: string;
    limit?: number;
    offset?: number;
  } = {},
): {
  blocklist: CommentBlocklistEntry[];
  count: number;
  pagination: Pagination;
} {
  refreshPersistedInteractionStore();

  const type =
    options.type === "email" || options.type === "ip" ? options.type : "all";
  const q = sanitizeString(options.q || "").toLowerCase();
  const limit = Number.isFinite(options.limit)
    ? Math.max(1, Math.min(100, Number(options.limit)))
    : 50;
  const offset = Number.isFinite(options.offset)
    ? Math.max(0, Number(options.offset))
    : 0;
  let entries = Array.from(COMMENT_REPORT_BLOCKLIST.values()).filter(
    (entry) => entry.siteId === siteId,
  );

  if (type !== "all") {
    entries = entries.filter((entry) => entry.type === type);
  }

  if (q) {
    entries = entries.filter(
      (entry) =>
        entry.value.toLowerCase().includes(q) ||
        entry.reason.toLowerCase().includes(q) ||
        (entry.actor || "").toLowerCase().includes(q),
    );
  }

  entries = entries.sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );
  const paginated = entries.slice(offset, offset + limit);

  return {
    blocklist: clone(paginated),
    count: entries.length,
    pagination: getPagination(entries.length, limit, offset),
  };
}

export function deleteCommentBlocklistEntries(params: {
  siteId: string;
  ids: string[];
}): { deleted: CommentBlocklistEntry[]; missingIds: string[] } {
  const ids = Array.from(new Set(params.ids.map(id => sanitizeString(id)).filter(Boolean)));
  if (ids.length > BACKY_COMMENT_INVENTORY_LIMIT) throw new BackyCommentLifecycleError('COMMENT_INVENTORY_INCOMPLETE', 'The selected blocklist inventory exceeds the supported limit.');
  return commitCommentModerationSnapshot(params.siteId, snapshot => {
    const byId = new Map((snapshot.commentBlocklist || []).filter(entry => entry.siteId === params.siteId).map(entry => [entry.id, entry]));
    const deleted = ids.filter(id => byId.has(id)).map(id => byId.get(id)!);
    const removed = new Set(deleted.map(entry => entry.id)); snapshot.commentBlocklist = (snapshot.commentBlocklist || []).filter(entry => entry.siteId !== params.siteId || !removed.has(entry.id));
    return { deleted, missingIds: ids.filter(id => !byId.has(id)) };
  });
}

export function getCommentReportReasons(): CommentReportReason[] {
  return [...COMMENT_REPORT_REASONS];
}

function normalizeCommentSearch(value: string | null | undefined): string {
  return (value || "").trim().toLowerCase();
}

export function reportComment(params: {
  commentId: string;
  siteId: string;
  reason?: string | null;
  actor?: string;
  details?: string;
  requestId?: string;
}): Comment | undefined {
  refreshPersistedInteractionStore();

  const comment = commentStore.find(
    (item) => item.id === params.commentId && item.siteId === params.siteId,
  );

  const site = getSiteByIdOrSlug(params.siteId);
  const target = comment?.targetType === "page" ? getAdminPageById(params.siteId, comment.targetId)
    : comment ? getAdminBlogPostById(params.siteId, comment.targetId) : undefined;
  if (!comment || comment.status !== "approved" || !site?.isPublished || !isContentPublished(target) || site.settings?.commentPolicy?.enableReports === false) {
    throw new BackyCommentLifecycleError("COMMENT_REPORT_CONFLICT", "The comment is no longer reportable. Reload the thread.");
  }

  const normalizedReason = normalizeReportReason(params.reason || null);
  const reportCount = (comment.reportCount || 0) + 1;
  const reportReasons = new Set<CommentReportReason>(
    comment.reportReasons || [],
  );
  if (normalizedReason) {
    reportReasons.add(normalizedReason);
  }

  comment.reportCount = reportCount;
  comment.reportReasons = Array.from(reportReasons);
  comment.updatedAt = new Date().toISOString();
  if (params.requestId !== undefined) comment.requestId = params.requestId;

  if (reportCount >= 3 && comment.status === "approved") {
    comment.status = "spam";
  }

  setCommentStore(
    commentStore.map((item) => (item.id === comment.id ? comment : item)),
  );
  persistInteractionStore();

  trackWebhookEvent({
    kind: "comment-reported",
    siteId: params.siteId,
    commentId: comment.id,
    target: `comment:${comment.id}`,
    status: "succeeded",
    requestId: params.requestId,
    reason: normalizedReason || "other",
    actor: params.actor,
    metadata: {
      authorName: comment.authorName,
      targetType: comment.targetType,
      targetId: comment.targetId,
      reportCount: comment.reportCount,
      reportReasons: comment.reportReasons,
      ...(params.details ? { details: params.details } : {}),
    },
  });

  return clone(comment);
}

export function bulkUpdateCommentStatus(params: { siteId: string; commentIds: string[]; status: Comment['status']; reviewedBy?: string | null; rejectionReason?: string | null; blockReason?: string | null; actor?: string | null; requestId?: string; clearReports?: boolean }): { updated: Comment[]; missingIds: string[] } {
  return moderateDemoComments(params);
}

export function bulkClearCommentReports(params: { siteId: string; commentIds: string[]; reviewedBy?: string | null; actor?: string | null; requestId?: string }): { updated: Comment[]; missingIds: string[] } {
  return moderateDemoComments({ ...params, clearReports: true });
}

export function createFormSubmission(record: {
  siteId: string;
  formId: string;
  values: Record<string, unknown>;
  pageId?: string | null;
  postId?: string | null;
  ipHash?: string | null;
  userAgent?: string | null;
  requestId?: string;
  status?: FormSubmission["status"];
  reviewedBy?: string | null;
  adminNotes?: string | null;
}): FormSubmission {
  refreshPersistedInteractionStore();

  const submission: FormSubmission = {
    id: `submission-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    siteId: record.siteId,
    formId: record.formId,
    pageId: record.pageId ?? null,
    postId: record.postId ?? null,
    values: record.values,
    ipHash: record.ipHash,
    userAgent: record.userAgent,
    requestId: record.requestId,
    status: record.status || "pending",
    reviewedBy: record.reviewedBy || null,
    reviewedAt:
      record.status && record.status !== "pending"
        ? new Date().toISOString()
        : null,
    adminNotes: record.adminNotes || null,
    collectionRecord: null,
    collectionRecordErrors: [],
    submittedAt: new Date().toISOString(),
  };

  setFormSubmissions([submission, ...formSubmissions]);
  persistInteractionStore();
  return clone(submission);
}

export function createCollectionRecordFromFormSubmission(
  siteId: string,
  form: FormDefinition,
  values: Record<string, unknown>,
  submission: FormSubmission,
): {
  skipped: boolean;
  record: StoreCollectionRecord | null;
  errors: SubmissionValidationDetail[];
  reason?: string;
} {
  const target = form.collectionTarget;
  if (!target?.enabled) {
    return { skipped: true, record: null, errors: [] };
  }

  const collectionId = sanitizeString(target.collectionId);
  if (!collectionId) {
    return {
      skipped: true,
      record: null,
      errors: [],
      reason: "missing-collection-target",
    };
  }

  const collection = getCollectionByIdOrSlug(siteId, collectionId, {
    includeUnpublished: true,
  });
  if (!collection || collection.status !== "published") {
    return {
      skipped: false,
      record: null,
      errors: [
        {
          field: "collectionId",
          code: "collection_unavailable",
          message: "Target collection is not published or does not exist.",
        },
      ],
    };
  }

  if (!collection.permissions.publicCreate) {
    return {
      skipped: false,
      record: null,
      errors: [
        {
          field: "collectionId",
          code: "public_create_disabled",
          message: "Target collection does not allow public creation.",
        },
      ],
    };
  }

  const fieldKeys = new Set(collection.fields.map((field) => field.key));
  const fieldMap = target.fieldMap || {};
  const mappedValues = Object.entries(values).reduce<Record<string, unknown>>(
    (acc, [sourceKey, value]) => {
      const mappedKey = sanitizeString(fieldMap[sourceKey] || sourceKey);
      if (mappedKey && fieldKeys.has(mappedKey)) {
        acc[mappedKey] = value;
      }
      return acc;
    },
    {},
  );

  const sourceSubmissionFieldKey = [
    "sourceSubmissionId",
    "source_submission_id",
    "sourcesubmissionid",
  ].find((key) => fieldKeys.has(key));
  if (sourceSubmissionFieldKey) {
    mappedValues[sourceSubmissionFieldKey] = submission.id;
  }

  const validationErrors = validateCollectionRecordValues(
    collection,
    mappedValues,
  );
  if (validationErrors.length > 0) {
    return { skipped: false, record: null, errors: validationErrors };
  }

  const slugSource = target.slugField
    ? (values[target.slugField] ?? mappedValues[target.slugField])
    : mappedValues.slug || mappedValues.title || mappedValues.name;
  const baseSlug = normalizeSlugInput(
    slugSource || `${form.id}-${submission.id}`,
    "submission",
  );
  let slug = baseSlug;
  let suffix = 2;
  while (
    getCollectionRecordByIdOrSlug(siteId, collection.id, slug, {
      includeUnpublished: true,
    })
  ) {
    slug = `${baseSlug}-${suffix}`;
    suffix += 1;
  }

  const record = createAdminCollectionRecord(siteId, collection.id, {
    slug,
    status: "draft",
    values: mappedValues,
  });

  return {
    skipped: false,
    record: record || null,
    errors: record
      ? []
      : [
          {
            field: "collectionId",
            code: "record_create_failed",
            message: "Unable to create collection record.",
          },
        ],
  };
}

export function attachCollectionRecordToSubmission(
  submissionId: string,
  input: {
    record: StoreCollectionRecord | null;
    errors: SubmissionValidationDetail[];
  },
): FormSubmission | undefined {
  refreshPersistedInteractionStore();

  const submission = formSubmissions.find((item) => item.id === submissionId);
  if (!submission) return undefined;

  const record = input.record;
  if (record) {
    const collection = getCollectionByIdOrSlug(
      record.siteId,
      record.collectionId,
      { includeUnpublished: true },
    );
    submission.collectionRecord = {
      siteId: record.siteId,
      collectionId: record.collectionId,
      collectionSlug: collection?.slug || record.collectionId,
      recordId: record.id,
      recordSlug: record.slug,
      status: record.status,
      createdAt: record.createdAt,
    };
  } else {
    submission.collectionRecord = null;
  }

  submission.collectionRecordErrors = input.errors;
  setFormSubmissions(
    formSubmissions.map((item) =>
      item.id === submission.id ? submission : item,
    ),
  );
  persistInteractionStore();
  return clone(submission);
}

// Omitted legacy scope is safe only when exactly one site owns this form.
function resolveFormInteractionSite(formId: string, siteId?: string): string | undefined {
  if (siteId) return siteId;
  const owners = getSites({ includeUnpublished: true }).filter(site => Boolean(getFormById(site.id, formId)));
  return owners.length === 1 ? owners[0].id : undefined;
}

export function listFormSubmissions(
  formId: string,
  params: {
    siteId?: string;
    status?: FormSubmission["status"];
    requestId?: string;
    limit?: number;
    offset?: number;
  } = {},
): { data: FormSubmission[]; pagination: Pagination } {
  refreshPersistedInteractionStore();
  const siteId = resolveFormInteractionSite(formId, params.siteId);

  const { status, requestId, limit = 20, offset = 0 } = params;

  const records = formSubmissions
    .filter((submission) => submission.formId === formId && submission.siteId === siteId)
    .filter((submission) => (status ? submission.status === status : true))
    .filter((submission) =>
      requestId ? submission.requestId === requestId : true,
    );

  const paginated = records.slice(offset, offset + limit);

  return {
    data: clone(paginated),
    pagination: getPagination(records.length, limit, offset),
  };
}

export function listFormContacts(
  formId: string,
  params: {
    siteId?: string;
    status?: Contact["status"];
    newsletterSubscriptionStatus?: NonNullable<Contact["newsletterSubscriptionStatus"]> | "all";
    newsletterOnly?: boolean;
    requestId?: string;
    limit?: number;
    offset?: number;
  } = {},
): { contacts: Contact[]; count: number; pagination: Pagination } {
  refreshPersistedInteractionStore();
  const siteId = resolveFormInteractionSite(formId, params.siteId);

  const {
    status,
    newsletterSubscriptionStatus,
    newsletterOnly,
    requestId,
    limit = 20,
    offset = 0,
  } = params;
  const records = contactStore
    .filter((contact) => contact.formId === formId && contact.siteId === siteId)
    .filter((contact) => (status ? contact.status === status : true))
    .filter((contact) => (newsletterOnly ? Boolean(contact.newsletterSubscriptionStatus) : true))
    .filter((contact) => (
      newsletterSubscriptionStatus && newsletterSubscriptionStatus !== "all"
        ? contact.newsletterSubscriptionStatus === newsletterSubscriptionStatus
        : true
    ))
    .filter((contact) => (requestId ? contact.requestId === requestId : true));

  const paginated = records.slice(offset, offset + limit);

  return {
    contacts: clone(paginated),
    count: records.length,
    pagination: getPagination(records.length, limit, offset),
  };
}

export function getContactById(contactId: string): Contact | undefined {
  refreshPersistedInteractionStore();

  const contact = contactStore.find((item) => item.id === contactId);
  return contact ? clone(contact) : undefined;
}

export function createContactRecord(
  input: Omit<Contact, "id" | "createdAt" | "updatedAt">,
  options: { upsertByEmail?: boolean } = {},
): { contact: Contact; existing: boolean } {
  refreshPersistedInteractionStore();

  const normalizedEmail = input.email ? normalizeIdentifier(input.email) : null;
  const existing =
    options.upsertByEmail && normalizedEmail
      ? contactStore.find(
          (contact) =>
            contact.siteId === input.siteId &&
            contact.formId === input.formId &&
            normalizeIdentifier(contact.email || "") === normalizedEmail,
        )
      : undefined;

  if (existing) {
    const updated: Contact = {
      ...existing,
      pageId: input.pageId ?? existing.pageId ?? null,
      postId: input.postId ?? existing.postId ?? null,
      name: input.name ?? existing.name ?? null,
      email: input.email ?? existing.email ?? null,
      phone: input.phone ?? existing.phone ?? null,
      notes: input.notes ?? existing.notes ?? null,
      sourceValues: input.sourceValues || existing.sourceValues || {},
      newsletterSubscriptionStatus:
        input.newsletterSubscriptionStatus ?? existing.newsletterSubscriptionStatus ?? null,
      newsletterSubscribedAt:
        input.newsletterSubscribedAt ?? existing.newsletterSubscribedAt ?? null,
      newsletterUnsubscribedAt:
        input.newsletterUnsubscribedAt ?? existing.newsletterUnsubscribedAt ?? null,
      newsletterTopics: input.newsletterTopics ?? existing.newsletterTopics ?? null,
      newsletterSource: input.newsletterSource ?? existing.newsletterSource ?? null,
      newsletterConsent: input.newsletterConsent ?? existing.newsletterConsent ?? null,
      newsletterConsentText:
        input.newsletterConsentText ?? existing.newsletterConsentText ?? null,
      status: input.status || existing.status,
      sourceSubmissionId:
        input.sourceSubmissionId || existing.sourceSubmissionId,
      requestId: input.requestId ?? existing.requestId ?? null,
      sourceIpHash: input.sourceIpHash ?? existing.sourceIpHash ?? null,
      updatedAt: new Date().toISOString(),
    };

    setContactStore(
      contactStore.map((contact) =>
        contact.id === existing.id ? updated : contact,
      ),
    );
    persistInteractionStore();
    return { contact: clone(updated), existing: true };
  }

  const contact: Contact = {
    ...input,
    id: `contact-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    pageId: input.pageId ?? null,
    postId: input.postId ?? null,
    name: input.name ?? null,
    email: input.email ?? null,
    phone: input.phone ?? null,
    notes: input.notes ?? null,
    sourceValues: input.sourceValues || {},
    sourceIpHash: input.sourceIpHash ?? null,
    requestId: input.requestId ?? null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  setContactStore([contact, ...contactStore]);
  persistInteractionStore();
  return { contact: clone(contact), existing: false };
}

export function getSubmissionById(
  submissionId: string,
): FormSubmission | undefined {
  refreshPersistedInteractionStore();

  const submission = formSubmissions.find((item) => item.id === submissionId);
  return submission ? clone(submission) : undefined;
}

export function updateFormSubmissionStatus(
  submissionId: string,
  updates: {
    status: FormSubmission["status"];
    reviewedBy?: string | null;
    adminNotes?: string | null;
  },
): FormSubmission | undefined {
  refreshPersistedInteractionStore();

  const submission = formSubmissions.find((item) => item.id === submissionId);
  if (!submission) return undefined;

  submission.status = updates.status;
  submission.reviewedBy = updates.reviewedBy ?? null;
  submission.adminNotes = updates.adminNotes ?? null;
  submission.reviewedAt = new Date().toISOString();

  setFormSubmissions(
    formSubmissions.map((item) =>
      item.id === submission.id ? submission : item,
    ),
  );
  persistInteractionStore();
  return clone(submission);
}

export function anonymizeFormSubmissionConsentEvidence(
  formId: string,
  submissionId: string,
  consentFieldKeys: string[],
  actor = "admin",
  siteId?: string,
): FormSubmission | undefined {
  refreshPersistedInteractionStore();
  const scopedSiteId = resolveFormInteractionSite(formId, siteId);

  const submission = formSubmissions.find(
    (item) => item.id === submissionId && item.formId === formId && item.siteId === scopedSiteId,
  );
  if (!submission) return undefined;

  const consentKeys = new Set(consentFieldKeys);
  const nextValues = Object.fromEntries(
    Object.entries(submission.values || {}).map(([key, value]) =>
      consentKeys.has(key) ? [key, null] : [key, value],
    ),
  );
  const marker = `Consent evidence anonymized by ${actor} at ${new Date().toISOString()}.`;

  submission.values = nextValues;
  submission.ipHash = null;
  submission.userAgent = null;
  submission.adminNotes = [submission.adminNotes, marker]
    .filter(Boolean)
    .join("\n");
  submission.updatedAt = new Date().toISOString();

  setFormSubmissions(
    formSubmissions.map((item) =>
      item.id === submission.id ? submission : item,
    ),
  );
  persistInteractionStore();
  return clone(submission);
}

export function updateContactStatus(
  contactId: string,
  updates: {
    status?: Contact["status"];
    name?: string | null;
    email?: string | null;
    phone?: string | null;
    notes?: string | null;
    pageId?: string | null;
    postId?: string | null;
    sourceValues?: Record<string, unknown>;
    newsletterSubscriptionStatus?: Contact["newsletterSubscriptionStatus"];
    newsletterSubscribedAt?: string | null;
    newsletterUnsubscribedAt?: string | null;
    newsletterTopics?: string | null;
    newsletterSource?: string | null;
    newsletterConsent?: boolean | null;
    newsletterConsentText?: string | null;
    sourceSubmissionId?: string;
    requestId?: string | null;
    sourceIpHash?: string | null;
  },
): Contact | undefined {
  refreshPersistedInteractionStore();

  const contact = contactStore.find((item) => item.id === contactId);
  if (!contact) return undefined;

  if (updates.status !== undefined) {
    contact.status = updates.status;
  }
  if (updates.name !== undefined) {
    contact.name = updates.name;
  }
  if (updates.email !== undefined) {
    contact.email = updates.email;
  }
  if (updates.phone !== undefined) {
    contact.phone = updates.phone;
  }
  if (updates.notes !== undefined) {
    contact.notes = updates.notes;
  }
  if (updates.pageId !== undefined) {
    contact.pageId = updates.pageId;
  }
  if (updates.postId !== undefined) {
    contact.postId = updates.postId;
  }
  if (updates.sourceValues !== undefined) {
    contact.sourceValues = updates.sourceValues;
  }
  if (updates.newsletterSubscriptionStatus !== undefined) {
    contact.newsletterSubscriptionStatus = updates.newsletterSubscriptionStatus;
  }
  if (updates.newsletterSubscribedAt !== undefined) {
    contact.newsletterSubscribedAt = updates.newsletterSubscribedAt;
  }
  if (updates.newsletterUnsubscribedAt !== undefined) {
    contact.newsletterUnsubscribedAt = updates.newsletterUnsubscribedAt;
  }
  if (updates.newsletterTopics !== undefined) {
    contact.newsletterTopics = updates.newsletterTopics;
  }
  if (updates.newsletterSource !== undefined) {
    contact.newsletterSource = updates.newsletterSource;
  }
  if (updates.newsletterConsent !== undefined) {
    contact.newsletterConsent = updates.newsletterConsent;
  }
  if (updates.newsletterConsentText !== undefined) {
    contact.newsletterConsentText = updates.newsletterConsentText;
  }
  if (updates.sourceSubmissionId !== undefined) {
    contact.sourceSubmissionId = updates.sourceSubmissionId;
  }
  if (updates.requestId !== undefined) {
    contact.requestId = updates.requestId;
  }
  if (updates.sourceIpHash !== undefined) {
    contact.sourceIpHash = updates.sourceIpHash;
  }
  contact.updatedAt = new Date().toISOString();

  setContactStore(
    contactStore.map((item) => (item.id === contact.id ? contact : item)),
  );
  persistInteractionStore();
  return clone(contact);
}

export function deleteContactRecord(contactId: string): Contact | undefined {
  refreshPersistedInteractionStore();

  const contact = contactStore.find((item) => item.id === contactId);
  if (!contact) return undefined;

  setContactStore(contactStore.filter((item) => item.id !== contactId));
  persistInteractionStore({ mergePersisted: false });
  return clone(contact);
}

export function anonymizeFormContactConsentEvidence(
  formId: string,
  contactId: string,
  consentFieldKeys: string[],
  actor = "admin",
  siteId?: string,
): Contact | undefined {
  refreshPersistedInteractionStore();
  const scopedSiteId = resolveFormInteractionSite(formId, siteId);

  const contact = contactStore.find(
    (item) => item.id === contactId && item.formId === formId && item.siteId === scopedSiteId,
  );
  if (!contact) return undefined;

  const consentKeys = new Set(consentFieldKeys);
  const nextSourceValues = Object.fromEntries(
    Object.entries(contact.sourceValues || {}).map(([key, value]) =>
      consentKeys.has(key) ? [key, null] : [key, value],
    ),
  );
  const marker = `Contact consent evidence anonymized by ${actor} at ${new Date().toISOString()}.`;

  contact.sourceValues = nextSourceValues;
  contact.sourceIpHash = null;
  contact.notes = [contact.notes, marker].filter(Boolean).join("\n");
  contact.updatedAt = new Date().toISOString();

  setContactStore(
    contactStore.map((item) => (item.id === contact.id ? contact : item)),
  );
  persistInteractionStore();
  return clone(contact);
}

function normalizeCommentStatus(
  status?: string,
): "pending" | "approved" | "rejected" | "spam" | "blocked" | "all" {
  if (
    status === "pending" ||
    status === "approved" ||
    status === "rejected" ||
    status === "spam" ||
    status === "blocked" ||
    status === "all"
  ) {
    return status;
  }

  return "all";
}

export function listComments(
  siteId: string,
  params: {
    publicOnly?: boolean;
    targetType?: CommentTargetType | "all";
    targetId?: string;
    status?: "pending" | "approved" | "rejected" | "spam" | "blocked" | "all";
    requestId?: string;
    q?: string;
    parentOnly?: boolean;
    parentId?: string | null;
    commentThreadId?: string;
    sort?: "newest" | "oldest";
    limit?: number;
    offset?: number;
  } = {},
): { comments: Comment[]; count: number; pagination: Pagination } {
  refreshPersistedInteractionStore();

  const {
    publicOnly = false,
    targetType,
    targetId,
    status: rawStatus,
    requestId,
    q,
    parentOnly = false,
    parentId,
    commentThreadId,
    sort = "newest",
    limit = 20,
    offset = 0,
  } = params;

  const status = normalizeCommentStatus(rawStatus);
  const normalizedRequestId = requestId ? requestId.trim() : "";
  const normalizedQuery = normalizeCommentSearch(q || "");
  const normalizedParentId =
    typeof parentId === "string" && parentId.length > 0 ? parentId : null;

  let filtered = commentStore.filter((comment) => comment.siteId === siteId);

  if (publicOnly) {
    const site = getSiteByIdOrSlug(siteId);
    filtered = filtered.filter((comment) => {
      const target = comment.targetType === "page"
        ? getAdminPageById(siteId, comment.targetId) : getAdminBlogPostById(siteId, comment.targetId);
      return Boolean(site?.isPublished && comment.status === "approved" && isContentPublished(target));
    });
  }

  if (targetType && targetType !== "all") {
    filtered = filtered.filter((comment) => comment.targetType === targetType);
  }

  if (targetId) {
    filtered = filtered.filter((comment) => comment.targetId === targetId);
  }

  if (normalizedRequestId && !publicOnly) {
    filtered = filtered.filter(
      (comment) => comment.requestId === normalizedRequestId,
    );
  }

  if (commentThreadId) {
    filtered = filtered.filter(
      (comment) => comment.commentThreadId === commentThreadId,
    );
  }

  if (normalizedQuery) {
    filtered = filtered.filter((comment) => {
      const haystack = [
        comment.content,
        comment.authorName,
        publicOnly ? undefined : comment.authorEmail,
        comment.authorWebsite,
      ]
        .filter(Boolean)
        .map((value) => (value || "").toLowerCase())
        .join(" ");
      return haystack.includes(normalizedQuery);
    });
  }

  if (status !== "all") {
    filtered = filtered.filter((comment) => comment.status === status);
  }

  if (parentOnly) {
    filtered = filtered.filter((comment) =>
      normalizedParentId
        ? comment.parentId === normalizedParentId
        : comment.parentId == null,
    );
  }

  const sorted = [...filtered].sort((a, b) =>
    sort === "oldest"
      ? new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
      : new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );

  const paginated = sorted.slice(offset, offset + limit);

  return {
    comments: clone(paginated),
    count: filtered.length,
    pagination: getPagination(filtered.length, limit, offset),
  };
}

export function getCommentsByTarget(
  siteId: string,
  params: {
    targetType: CommentTargetType;
    targetId: string;
    commentThreadId?: string;
    status?: "pending" | "approved" | "rejected" | "spam" | "blocked" | "all";
    limit?: number;
    offset?: number;
  },
): { comments: Comment[]; count: number; pagination: Pagination } {
  return listComments(siteId, {
    ...params,
    status: params.status || "approved",
    sort: "newest",
  });
}

export function getCommentById(commentId: string): Comment | undefined {
  refreshPersistedInteractionStore();

  const comment = commentStore.find((item) => item.id === commentId);
  return comment ? clone(comment) : undefined;
}

export function updateCommentStatus(commentId: string, updates: { status: Comment['status']; reviewedBy?: string | null; rejectionReason?: string | null; blockReason?: string | null; actor?: string | null; requestId?: string; clearReports?: boolean }, trustedSiteId?: string): Comment | undefined {
  refreshPersistedInteractionStore(); const comment = commentStore.find(item => item.id === commentId && (!trustedSiteId || item.siteId === trustedSiteId)); if (!comment) return undefined;
  return moderateDemoComments({ ...updates, siteId: comment.siteId, commentIds: [commentId] }).updated[0];
}

export function updateCommentThread(
  commentId: string,
  updates: {
    parentId: string | null;
    commentThreadId?: string | null;
    actor?: string | null;
    requestId?: string;
  },
): Comment | undefined {
  refreshPersistedInteractionStore();

  const comment = commentStore.find((item) => item.id === commentId);
  if (!comment) return undefined;

  const parent = updates.parentId ? commentStore.find(item => item.id === updates.parentId && item.siteId === comment.siteId) || null : null;
  assertBackyCommentParent({ ...comment, commentThreadId: updates.commentThreadId || undefined }, parent, updates.parentId);
  const visited = new Set<string>([comment.id]); let ancestor = parent;
  while (ancestor) {
    if (visited.has(ancestor.id) || visited.size > BACKY_COMMENT_INVENTORY_LIMIT) throw new BackyCommentLifecycleError('COMMENT_TREE_INVALID', 'A reply cannot be moved into its own subtree.');
    visited.add(ancestor.id); ancestor = ancestor.parentId ? commentStore.find(item => item.id === ancestor!.parentId && item.siteId === comment.siteId) || null : null;
  }

  const previousParentId = comment.parentId;
  const previousThreadId = comment.commentThreadId || null;
  const reviewedAt = new Date().toISOString();
  const resolvedRequestId = updates.requestId || comment.requestId || undefined;

  comment.parentId = updates.parentId;
  comment.commentThreadId = updates.commentThreadId || parent?.commentThreadId || undefined;
  comment.reviewedBy = updates.actor || comment.reviewedBy || "admin";
  comment.reviewedAt = reviewedAt;
  comment.updatedAt = reviewedAt;

  setCommentStore(
    commentStore.map((item) => (item.id === comment.id ? comment : item)),
  );
  persistInteractionStore();

  trackWebhookEvent({
    kind: "comment-status",
    siteId: comment.siteId,
    commentId: comment.id,
    target: `comment:${comment.id}`,
    status: "succeeded",
    requestId: resolvedRequestId,
    reason: "thread-updated",
    actor: comment.reviewedBy || undefined,
    metadata: {
      targetType: comment.targetType,
      targetId: comment.targetId,
      previousParentId,
      parentId: comment.parentId,
      previousThreadId,
      commentThreadId: comment.commentThreadId || null,
    },
  });

  return clone(comment);
}

/** One synchronous atomic file replacement. Admission is local to this process. */
export function deleteCommentSubtree(siteId: string, commentId: string): Comment[] {
  let snapshot: InteractionStoreSnapshot;
  try {
    snapshot = existsSync(INTERACTION_STORE_PATH) ? JSON.parse(readFileSync(INTERACTION_STORE_PATH, 'utf8')) as InteractionStoreSnapshot : {
      comments: clone(commentStore), formSubmissions: clone(formSubmissions), contacts: clone(contactStore), auditEvents: clone(auditEvents), commentBlocklist: clone(Array.from(COMMENT_REPORT_BLOCKLIST.values())),
    };
    if (!snapshot || !Array.isArray(snapshot.comments) || snapshot.comments.some(comment => !comment || typeof comment.siteId !== 'string' || typeof comment.id !== 'string')) throw Error('Invalid interaction snapshot');
  } catch { throw new BackyCommentLifecycleError('COMMENT_INVENTORY_INCOMPLETE', 'The complete persisted comment inventory could not be verified.'); }
  const all = snapshot.comments!;
  const selected = collectBackyCommentSubtree(siteId, commentId, all.filter(comment => comment.siteId === siteId));
  if (!selected.length) return [];
  const ids = new Set(selected.map(comment => comment.id));
  const next = all.filter(comment => comment.siteId !== siteId || !ids.has(comment.id));
  const serialized = JSON.stringify({ ...snapshot, comments: next }, null, 2);
  const temporary = `${INTERACTION_STORE_PATH}.${randomUUID()}.tmp`;
  try {
    mkdirSync(dirname(INTERACTION_STORE_PATH), { recursive: true });
    writeFileSync(temporary, serialized, { flag: 'wx', mode: 0o600 });
    const descriptor = openSync(temporary, 'r'); try { fsyncSync(descriptor); } finally { closeSync(descriptor); }
    if (readFileSync(temporary, 'utf8') !== serialized) throw Error('Snapshot readback failed');
    renameSync(temporary, INTERACTION_STORE_PATH);
  } catch {
    try { unlinkSync(temporary); } catch { /* No persisted mutation completed. */ }
    throw new BackyCommentLifecycleError('COMMENT_LIFECYCLE_UNAVAILABLE', 'The comment subtree could not be persisted. No comments were removed.');
  }
  setCommentStore(next);
  return clone(selected);
}

export function deleteCommentRecord(commentId: string): Comment | undefined {
  refreshPersistedInteractionStore();

  const comment = commentStore.find((item) => item.id === commentId);
  if (!comment) return undefined;

  setCommentStore(commentStore.filter((item) => item.id !== commentId));
  persistInteractionStore({ mergePersisted: false });
  return clone(comment);
}

export function listCommentReplies(
  siteId: string,
  params: {
    targetType: CommentTargetType;
    targetId: string;
    parentId: string;
  },
): Comment[] {
  refreshPersistedInteractionStore();

  const replies = commentStore.filter(
    (comment) =>
      comment.siteId === siteId &&
      comment.targetType === params.targetType &&
      comment.targetId === params.targetId &&
      comment.parentId === params.parentId,
  );
  return clone(replies);
}

export function createComment(params: {
  siteId: string;
  targetType: CommentTargetType;
  targetId: string;
  commentThreadId?: string;
  content: string;
  authorName?: string;
  authorEmail?: string;
  authorWebsite?: string;
  userId?: string | null;
  status?: Comment["status"];
  parentId?: string | null;
  requestId?: string;
  ipHash?: string | null;
  /** Internal management routes handle activity after commit with outcome warnings. */
  skipActivity?: boolean;
}): Comment {
  refreshPersistedInteractionStore();

  assertBackyCommentParent({ id: '', siteId: params.siteId, targetType: params.targetType, targetId: params.targetId, commentThreadId: params.commentThreadId }, params.parentId ? commentStore.find(comment => comment.id === params.parentId && comment.siteId === params.siteId) || null : null, params.parentId);

  const comment: Comment = {
    id: `comment-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    siteId: params.siteId,
    targetType: params.targetType,
    targetId: params.targetId,
    commentThreadId: params.commentThreadId || (params.parentId ? commentStore.find(item => item.id === params.parentId && item.siteId === params.siteId)?.commentThreadId : undefined),
    authorName: params.authorName || null,
    authorEmail: params.authorEmail || null,
    authorWebsite: params.authorWebsite || null,
    userId: params.userId || null,
    content: params.content,
    status: params.status || "pending",
    parentId: params.parentId ?? null,
    reviewedBy: null,
    reviewedAt: null,
    rejectionReason: null,
    blockReason: null,
    blockedBy: null,
    blockedAt: null,
    reportCount: 0,
    reportReasons: [],
    requestId: params.requestId || null,
    ipHash: params.ipHash || null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  if (params.skipActivity) {
    // Moderator creation commits independently of followup activity. Use the
    // existing durable single-process admission, including a fresh parent and
    // identity read, before exposing success to the management route.
    return commitCommentModerationSnapshot(params.siteId, snapshot => {
      assertBackyCommentParent(comment, params.parentId ? snapshot.comments!.find(item => item.id === params.parentId && item.siteId === params.siteId) || null : null, params.parentId);
      const blocked = (snapshot.commentBlocklist || []).some(entry => entry.siteId === params.siteId && (
        entry.type === 'email' && Boolean(params.authorEmail) && entry.value.trim().toLowerCase() === params.authorEmail!.trim().toLowerCase()
        || entry.type === 'ip' && Boolean(params.ipHash) && entry.value.trim().toLowerCase() === params.ipHash!.trim().toLowerCase()
      ));
      if (blocked) throw new BackyCommentLifecycleError('COMMENT_IDENTITY_BLOCKED', 'The current identity cannot create a reply.');
      snapshot.comments = [comment, ...snapshot.comments!];
      return comment;
    });
  }

  setCommentStore([comment, ...commentStore]);
  if (!params.skipActivity) trackWebhookEvent({
    kind: "comment-submitted",
    siteId: comment.siteId,
    commentId: comment.id,
    target: `comment:${comment.id}`,
    status: "succeeded",
    requestId: comment.requestId || undefined,
    reason: comment.status,
    metadata: {
      targetType: comment.targetType,
      targetId: comment.targetId,
      status: comment.status,
      parentId: comment.parentId,
      hasAuthorEmail: Boolean(comment.authorEmail),
      hasAuthorWebsite: Boolean(comment.authorWebsite),
    },
  });

  return clone(comment);
}

export function getCanonicalPathForPage(
  page: Pick<StorePage, "isHomepage" | "slug"> | null,
): string {
  if (!page) {
    return "/";
  }

  if (page.isHomepage || page.slug === "index") {
    return "/";
  }

  return `/${page.slug}`;
}

export function getMediaById(
  siteId: string,
  id: string,
): MediaItem | undefined {
  ensurePersistedMediaLoaded();
  const item = MEDIA_LIBRARY.find(
    (media) => media.siteId === siteId && media.id === id,
  );
  return item ? clone(item) : undefined;
}

export {
  type ContentRevision,
  type Pagination,
  type SiteNavigationItem,
  type StoreBlogPost,
  type StoreCollection,
  type StoreCollectionRecord,
  type StorePage,
  type StoreSettings,
  type StoreSite,
  type StoreUser,
  type StoreUserPermissionOverride,
};

export function listProductDesignRevisions(siteId: string, collectionId: string, recordId: string, options: {offset?: number;limit?: number} = {}) {
 ensurePersistedAdminContentLoaded();
 const items = PRODUCT_DESIGN_REVISIONS.filter(item => item.siteId === siteId && item.collectionId === collectionId && item.recordId === recordId).sort((a,b) => b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id));
 const offset = Math.max(0, options.offset || 0), limit = Math.min(100, Math.max(1, options.limit || 100));
 return clone(items.slice(offset,offset+limit+1));
}
export function getProductDesignRevision(siteId: string, collectionId: string, recordId: string, revisionId: string) {
 ensurePersistedAdminContentLoaded(); return clone(PRODUCT_DESIGN_REVISIONS.find(item => item.siteId === siteId && item.collectionId === collectionId && item.recordId === recordId && item.id === revisionId) || null);
}

export function listFormDesignRevisions(siteId: string, formId: string, options: { offset?: number; limit?: number } = {}) {
 ensurePersistedAdminContentLoaded();
 const items = FORM_DESIGN_REVISIONS.filter(item => item.siteId === siteId && item.formId === formId).sort((a,b) => b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id));
 const offset = Math.max(0, options.offset || 0), limit = Math.min(100, Math.max(1, options.limit || 100));
 return clone(items.slice(offset, offset + limit + 1));
}
export function getFormDesignRevision(siteId: string, formId: string, revisionId: string) {
 ensurePersistedAdminContentLoaded();
 const revision = FORM_DESIGN_REVISIONS.find(item => item.siteId === siteId && item.formId === formId && item.id === revisionId);
 return revision ? clone(revision) : null;
}

export function listCollectionDesignRevisions(siteId:string,collectionId:string,options:{offset?:number;limit?:number}={}) {
 ensurePersistedAdminContentLoaded(true);const offset=Math.max(0,options.offset||0),limit=Math.min(100,Math.max(1,options.limit||100));return clone(COLLECTION_DESIGN_REVISIONS.filter(row=>row.siteId===siteId&&row.collectionId===collectionId).sort((a,b)=>b.createdAt.localeCompare(a.createdAt)||b.id.localeCompare(a.id)).slice(offset,offset+limit+1));
}
export function getCollectionDesignRevision(siteId:string,collectionId:string,revisionId:string) {
 ensurePersistedAdminContentLoaded(true);return clone(COLLECTION_DESIGN_REVISIONS.find(row=>row.siteId===siteId&&row.collectionId===collectionId&&row.id===revisionId)||null);
}
