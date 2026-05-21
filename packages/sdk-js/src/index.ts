import type {
  BackyContentDocument as CoreBackyContentDocument,
  BackyContentElement,
} from "@backy-cms/core/content-contract";
import type {
  GeneratedBackyOpenApiBlogPostUpdateRequest,
  GeneratedBackyOpenApiPageUpdateRequest,
} from "./generated-contract-types";

export type {
  GeneratedBackyContentStatus,
  GeneratedBackyContentElement,
  GeneratedBackyDataBinding,
  GeneratedBackyDataBindingDataset,
  GeneratedBackyDataBindings,
  GeneratedBackyEditableMap,
  GeneratedBackyEditableMapEntry,
  GeneratedBackyElementAction,
  GeneratedBackyElementActions,
  GeneratedBackyFrontendDesignContract,
  GeneratedBackyFrontendDesignProvenance,
  GeneratedBackyFrontendManifest,
  GeneratedBackyFrontendManifestCommerceProviderCertification,
  GeneratedBackyFrontendManifestDatabaseCertification,
  GeneratedBackyFrontendManifestEnvelope,
  GeneratedBackyFrontendManifestLaunchReadiness,
  GeneratedBackyFrontendManifestNavigationItem,
  GeneratedBackyInteractiveControl,
  GeneratedBackyInteractiveFallback,
  GeneratedBackyInteractiveRenderCapabilities,
  GeneratedBackyOpenApiBackyContentDocument,
  GeneratedBackyOpenApiBackyContentAssetRef,
  GeneratedBackyOpenApiBackyContentElement,
  GeneratedBackyOpenApiBackyContentElementAccessibility,
  GeneratedBackyOpenApiBackyDataBinding,
  GeneratedBackyOpenApiBackyDataBindingSource,
  GeneratedBackyOpenApiBackyEditableMapEntry,
  GeneratedBackyOpenApiBackyElementAction,
  GeneratedBackyOpenApiBackyReusableSectionContent,
  GeneratedBackyOpenApiBlogAuthorListEnvelope,
  GeneratedBackyOpenApiBlogAuthorResource,
  GeneratedBackyOpenApiBlogCategoryListEnvelope,
  GeneratedBackyOpenApiBlogCategoryResource,
  GeneratedBackyOpenApiBlogFeedDiscovery,
  GeneratedBackyOpenApiBlogPostEnvelope,
  GeneratedBackyOpenApiBlogPostListEnvelope,
  GeneratedBackyOpenApiBlogPostResource,
  GeneratedBackyOpenApiBlogPostUpdateRequest,
  GeneratedBackyOpenApiBlogTagListEnvelope,
  GeneratedBackyOpenApiBlogTagResource,
  GeneratedBackyOpenApiComment,
  GeneratedBackyOpenApiCommentBlocklistDeleteEnvelope,
  GeneratedBackyOpenApiCommentBlocklistDeleteRequest,
  GeneratedBackyOpenApiCommentBlocklistEntry,
  GeneratedBackyOpenApiCommentBlocklistEnvelope,
  GeneratedBackyOpenApiCommentBulkUpdateEnvelope,
  GeneratedBackyOpenApiCommentBulkUpdateRequest,
  GeneratedBackyOpenApiCommentEnvelope,
  GeneratedBackyOpenApiCommentReportEnvelope,
  GeneratedBackyOpenApiCommentReportReasonsEnvelope,
  GeneratedBackyOpenApiCommentSubmitRequest,
  GeneratedBackyOpenApiCommentUpdateRequest,
  GeneratedBackyOpenApiCommentsEnvelope,
  GeneratedBackyOpenApiCommerceCatalogEnvelope,
  GeneratedBackyOpenApiCommerceOrderContractEnvelope,
  GeneratedBackyOpenApiCommerceOrderCreateRequest,
  GeneratedBackyOpenApiCommerceOrderEnvelope,
  GeneratedBackyOpenApiCommerceProduct,
  GeneratedBackyOpenApiCommerceProductDesign,
  GeneratedBackyOpenApiCommerceProviderCertification,
  GeneratedBackyOpenApiCommerceStorefrontContract,
  GeneratedBackyOpenApiCommerceWebhookEnvelope,
  GeneratedBackyOpenApiCommerceWebhookRequest,
  GeneratedBackyOpenApiCollectionFieldOption,
  GeneratedBackyOpenApiCollectionFieldSchema,
  GeneratedBackyOpenApiCollectionFieldValidation,
  GeneratedBackyOpenApiCollectionPermissions,
  GeneratedBackyOpenApiCollectionEnvelope,
  GeneratedBackyOpenApiCollectionListEnvelope,
  GeneratedBackyOpenApiCollectionRecord,
  GeneratedBackyOpenApiCollectionRecordEnvelope,
  GeneratedBackyOpenApiCollectionRecordListEnvelope,
  GeneratedBackyOpenApiCollectionSchema,
  GeneratedBackyOpenApiComponentName,
  GeneratedBackyOpenApiComponents,
  GeneratedBackyOpenApiDynamicItemRoute,
  GeneratedBackyOpenApiDynamicItemRouteResource,
  GeneratedBackyOpenApiDynamicListRoute,
  GeneratedBackyOpenApiDynamicListRouteResource,
  GeneratedBackyOpenApiErrorEnvelope,
  GeneratedBackyOpenApiEventsEnvelope,
  GeneratedBackyOpenApiFontManifestEnvelope,
  GeneratedBackyOpenApiFontVariant,
  GeneratedBackyOpenApiFormCollectionRecordError,
  GeneratedBackyOpenApiFormCollectionRecordLink,
  GeneratedBackyOpenApiFormContact,
  GeneratedBackyOpenApiFormContactEnvelope,
  GeneratedBackyOpenApiFormContactsEnvelope,
  GeneratedBackyOpenApiFormDefinition,
  GeneratedBackyOpenApiFormDefinitionEnvelope,
  GeneratedBackyOpenApiFormEnvelope,
  GeneratedBackyOpenApiFormFieldDefinition,
  GeneratedBackyOpenApiFormListEnvelope,
  GeneratedBackyOpenApiFormSubmission,
  GeneratedBackyOpenApiFormSubmissionEnvelope,
  GeneratedBackyOpenApiFormSubmissionRequest,
  GeneratedBackyOpenApiFormSubmissionValidationDetail,
  GeneratedBackyOpenApiFormSubmissionValidationErrorEnvelope,
  GeneratedBackyOpenApiFormSubmissionsEnvelope,
  GeneratedBackyOpenApiFormValidationRule,
  GeneratedBackyOpenApiFrontendDesignContract,
  GeneratedBackyOpenApiFrontendDesignEnvelope,
  GeneratedBackyOpenApiFrontendDesignTemplate,
  GeneratedBackyOpenApiFrontendEditableMapEntry,
  GeneratedBackyOpenApiGoneRoute,
  GeneratedBackyOpenApiGoneRouteResolveEnvelope,
  GeneratedBackyOpenApiInteractiveComponentControl,
  GeneratedBackyOpenApiInteractiveComponentFallback,
  GeneratedBackyOpenApiInteractiveComponentIntegrity,
  GeneratedBackyOpenApiInteractiveComponentManifestContract,
  GeneratedBackyOpenApiInteractiveComponentRegistry,
  GeneratedBackyOpenApiInteractiveComponentRegistryEnvelope,
  GeneratedBackyOpenApiInteractiveComponentRegistryEntry,
  GeneratedBackyOpenApiInteractiveComponentRegistryPagination,
  GeneratedBackyOpenApiInteractiveComponentRuntime,
  GeneratedBackyOpenApiInteractiveComponentSecurity,
  GeneratedBackyOpenApiInteractiveRuntimeEventRequest,
  GeneratedBackyOpenApiLiveManagementDiscovery,
  GeneratedBackyOpenApiMediaAsset,
  GeneratedBackyOpenApiMediaDeliveryPolicy,
  GeneratedBackyOpenApiMediaDetailEnvelope,
  GeneratedBackyOpenApiMediaEditableMetadata,
  GeneratedBackyOpenApiMediaFileCategory,
  GeneratedBackyOpenApiMediaFileCategoryDiscovery,
  GeneratedBackyOpenApiMediaFolder,
  GeneratedBackyOpenApiMediaFolderListEnvelope,
  GeneratedBackyOpenApiMediaFolderRoot,
  GeneratedBackyOpenApiMediaList,
  GeneratedBackyOpenApiMediaReferenceTarget,
  GeneratedBackyOpenApiMediaReferences,
  GeneratedBackyOpenApiNavigationEnvelope,
  GeneratedBackyOpenApiDocument,
  GeneratedBackyOpenApiOperation,
  GeneratedBackyOpenApiOperationId,
  GeneratedBackyOpenApiPageEnvelope,
  GeneratedBackyOpenApiPageListEnvelope,
  GeneratedBackyOpenApiPageRoute,
  GeneratedBackyOpenApiPageResource,
  GeneratedBackyOpenApiPageRouteResource,
  GeneratedBackyOpenApiPageSeoMetadata,
  GeneratedBackyOpenApiPageUpdateRequest,
  GeneratedBackyOpenApiPostRoute,
  GeneratedBackyOpenApiPostRouteResource,
  GeneratedBackyOpenApiPublicDeleteEnvelope,
  GeneratedBackyOpenApiRedirectRoute,
  GeneratedBackyOpenApiResolvedRoute,
  GeneratedBackyOpenApiRouteResolveEnvelope,
  GeneratedBackyOpenApiRuntimeEventRecordEnvelope,
  GeneratedBackyOpenApiReusableSection,
  GeneratedBackyOpenApiReusableSectionEnvelope,
  GeneratedBackyOpenApiReusableSectionFrontendDesign,
  GeneratedBackyOpenApiReusableSectionListEnvelope,
  GeneratedBackyOpenApiSeoDiscoveryEnvelope,
  GeneratedBackyOpenApiSeoRoute,
  GeneratedBackyOpenApiSiteEnvelope,
  GeneratedBackyOpenApiSiteListEnvelope,
  GeneratedBackyOpenApiSiteSummary,
  GeneratedBackyOpenApiSiteWebhookPayload,
  GeneratedBackyRenderCommentThread,
  GeneratedBackyRenderFontAsset,
  GeneratedBackyRenderForm,
  GeneratedBackyRenderFrontendDesign,
  GeneratedBackyRenderMediaAsset,
  GeneratedBackyRenderNavigationItem,
  GeneratedBackyRenderNavigationLayout,
  GeneratedBackyPublicRenderPayload,
  GeneratedBackyPublicRenderPayloadBindingSlot,
  GeneratedBackyPublicRenderPayloadEnvelope,
  GeneratedBackyThemeTokenContract,
  GeneratedBackyThemeTokens,
} from "./generated-contract-types";
export { generatedBackyContractTypeSources } from "./generated-contract-types";

export interface BackyClientOptions {
  baseUrl: string;
  siteId?: string;
  fetch?: typeof fetch;
  requestIdFactory?: () => string;
  defaultHeaders?: HeadersInit;
  credentials?: RequestCredentials;
}

export interface BackyEnvelope<TData> {
  success: true;
  requestId: string;
  data: TData;
  [legacyKey: string]: unknown;
}

export interface BackyErrorEnvelope {
  success: false;
  requestId?: string;
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
  data?: unknown;
  validation?: BackyFormSubmissionValidationDetail[];
  spamFlags?: string[];
  status?: string;
  message?: string;
}

export interface BackyResponseMeta {
  status: number;
  etag?: string;
  cacheControl?: string;
  cacheScope?: string;
  cacheRevision?: string;
  contractVersion?: string;
  schemaVersion?: string;
  requestId?: string;
  siteId?: string;
}

export type BackyConditionalResult<TBody> =
  | {
      notModified: false;
      status: number;
      body: TBody;
      meta: BackyResponseMeta;
    }
  | {
      notModified: true;
      status: 304;
      body: null;
      meta: BackyResponseMeta;
    };

export interface BackyConditionalRequestOptions {
  etag?: string;
  requestId?: string;
  siteId?: string;
  credentials?: RequestCredentials;
}

export type BackyConditionalOptions = BackyConditionalRequestOptions;

export interface BackyRenderRequestOptions {
  previewToken?: string;
  siteId?: string;
  schemaVersion?: string;
}

export type BackyRenderConditionalOptions = BackyConditionalOptions & {
  previewToken?: string;
  schemaVersion?: string;
};

export interface BackyListOptions {
  /**
   * Public list endpoints cap limits at 100. Finite SDK inputs are clamped to 1..100.
   */
  limit?: number;
  /**
   * Public list endpoints treat negative offsets as 0. Finite SDK inputs are clamped to 0+.
   */
  offset?: number;
  requestId?: string;
}

export const BACKY_MAX_LIST_LIMIT = 100;

type BackyQueryValue = string | number | boolean | undefined;

function normalizeListNumber(
  value: string | number | undefined,
): number | undefined {
  if (typeof value === "string" && value.trim() !== "") {
    return Number(value);
  }
  return typeof value === "number" ? value : undefined;
}

function normalizeListLimit(
  limit: string | number | undefined,
): number | undefined {
  const normalizedLimit = normalizeListNumber(limit);
  if (normalizedLimit === undefined || !Number.isFinite(normalizedLimit)) {
    return undefined;
  }
  return Math.min(
    BACKY_MAX_LIST_LIMIT,
    Math.max(1, Math.trunc(normalizedLimit)),
  );
}

function normalizeListOffset(
  offset: string | number | undefined,
): number | undefined {
  const normalizedOffset = normalizeListNumber(offset);
  if (normalizedOffset === undefined || !Number.isFinite(normalizedOffset)) {
    return undefined;
  }
  return Math.max(0, Math.trunc(normalizedOffset));
}

function normalizeListQuery<TOptions extends BackyListOptions>(
  options: Omit<TOptions, "requestId">,
): Record<string, BackyQueryValue> {
  return {
    ...options,
    limit: normalizeListLimit(options.limit),
    offset: normalizeListOffset(options.offset),
  } as Record<string, BackyQueryValue>;
}

export interface BackyPagination {
  total?: number;
  limit?: number;
  offset?: number;
  hasMore?: boolean;
  [key: string]: unknown;
}

export interface BackyThemeTokens {
  schemaVersion?: "backy.theme.v1" | string;
  colors?: Record<string, string>;
  fonts?: Record<string, string>;
  typography?: {
    families?: Record<string, string>;
    scale?: Record<string, string>;
    lineHeights?: Record<string, number | string>;
    weights?: Record<string, number | string>;
    [key: string]: unknown;
  };
  spacing?: Record<string, unknown>;
  radii?: Record<string, string>;
  shadows?: Record<string, string>;
  motion?: {
    duration?: Record<string, string>;
    easing?: Record<string, string>;
    [key: string]: unknown;
  };
  breakpoints?: Record<string, number>;
  customCss?: string;
  [key: string]: unknown;
}

export interface BackyFrontendDesignSource {
  type: "managed-site" | "custom-frontend" | "manual" | string;
  label?: string;
  url?: string;
  repository?: string;
  branch?: string;
  capturedAt?: string;
  [key: string]: unknown;
}

export interface BackyFrontendDesignTemplate {
  id: string;
  type:
    | "page"
    | "blogPost"
    | "form"
    | "product"
    | "collection"
    | "section"
    | string;
  name: string;
  routePattern?: string;
  description?: string;
  canvasSize?: {
    width?: number;
    height?: number;
    [key: string]: unknown;
  };
  content?: Record<string, unknown>;
  bindingHints?: Array<Record<string, unknown>>;
  [key: string]: unknown;
}

export interface BackyFrontendEditableMapEntry {
  selector?: string;
  elementId?: string;
  role?: string;
  binding?: string;
  fields?: string[];
  [key: string]: unknown;
}

export interface BackyFrontendDesignContract {
  schemaVersion: "backy.frontend-design.v1" | string;
  status: "unconfigured" | "captured" | "synced" | "stale" | string;
  source: BackyFrontendDesignSource;
  tokens?: BackyThemeTokens & {
    customCss?: string;
    radii?: Record<string, unknown>;
    shadows?: Record<string, unknown>;
  };
  chrome?: {
    header?: Record<string, unknown>;
    navigation?: Record<string, unknown>;
    footer?: Record<string, unknown>;
    [key: string]: unknown;
  };
  templates: BackyFrontendDesignTemplate[];
  editableMap: BackyFrontendEditableMapEntry[];
  notes?: string;
  updatedAt?: string;
  [key: string]: unknown;
}

export interface BackySiteSummary {
  id: string;
  slug: string;
  name: string;
  description?: string | null;
  customDomain?: string | null;
  status?: string;
  isPublished?: boolean;
  theme?: BackyThemeTokens;
  themeTokens?: BackyThemeTokens;
  frontendDesign?: BackyFrontendDesignContract | null;
  [key: string]: unknown;
}

export type BackyAdminSiteStatus =
  | "draft"
  | "published"
  | "archived"
  | string;

export interface BackyAdminSiteResource extends BackySiteSummary {
  teamId?: string | null;
  settings?: Record<string, unknown>;
  pages?: BackyPageResource[];
  pageCount?: number;
  createdAt?: string;
  updatedAt?: string;
}

export interface BackyAdminSiteListOptions
  extends BackyLiveManagementRequestOptions {
  includeUnpublished?: boolean;
}

export interface BackyAdminSiteCreateInput {
  name: string;
  slug?: string;
  description?: string | null;
  customDomain?: string | null;
  status?: BackyAdminSiteStatus;
  teamId?: string | null;
  isPublished?: boolean;
  theme?: BackyThemeTokens | Record<string, unknown>;
  settings?: Record<string, unknown>;
  frontendDesignTemplateId?: string;
  requestId?: string;
  [key: string]: unknown;
}

export interface BackyAdminSiteUpdateInput
  extends Partial<Omit<BackyAdminSiteCreateInput, "name">> {
  name?: string;
}

export interface BackyAdminSiteDuplicateInput {
  name?: string;
  slug?: string;
  requestId?: string;
  [key: string]: unknown;
}

export type BackyAdminSitesResponse = BackyEnvelope<
  {
    sites: BackyAdminSiteResource[];
    pagination?: BackyPagination;
  } & Record<string, unknown>
>;

export type BackyAdminSiteResponse = BackyEnvelope<
  {
    site: BackyAdminSiteResource;
    cacheInvalidation?: Record<string, unknown>;
  } & Record<string, unknown>
>;

export type BackyAdminSiteDeleteResponse = BackyEnvelope<
  {
    deleted: boolean;
    siteId: string;
    cacheInvalidation?: Record<string, unknown>;
  } & Record<string, unknown>
>;

export type BackyAdminSiteReadinessResponse = BackyEnvelope<
  {
    readiness: Record<string, unknown>;
  } & Record<string, unknown>
>;

export type BackyAdminSiteDuplicateResponse = BackyEnvelope<
  {
    site: BackyAdminSiteResource;
    pagesCopied: number;
    cacheInvalidation?: Record<string, unknown>;
  } & Record<string, unknown>
>;

export interface BackyFrontendDesignResponse {
  schemaVersion: "backy.frontend-design-response.v1" | string;
  site: BackySiteSummary;
  frontendDesign: BackyFrontendDesignContract;
  capabilities: {
    hasContract: boolean;
    templateCount: number;
    editableBindingCount: number;
    chrome?: boolean;
    tokens?: boolean;
    [key: string]: unknown;
  };
  endpoints?: Record<string, string>;
  [key: string]: unknown;
}

export interface BackyNavigationItem {
  id?: string;
  type?: "page" | "route" | "url" | string;
  pageId?: string;
  label?: string;
  title?: string;
  path?: string;
  href?: string;
  target?: "_self" | "_blank" | string;
  children?: BackyNavigationItem[];
  [key: string]: unknown;
}

export interface BackyInteractiveControl {
  key: string;
  label?: string;
  type: string;
  value?: unknown;
  defaultValue?: unknown;
  options?: unknown[];
  min?: number;
  max?: number;
  step?: number;
  required?: boolean;
  [key: string]: unknown;
}

export interface BackyInteractiveFallback {
  title?: string;
  text?: string;
  html?: string;
  imageUrl?: string;
  alt?: string;
  ariaLabel?: string;
  [key: string]: unknown;
}

export interface BackyInteractiveRenderCapabilities {
  hydrationMode:
    | "trusted-component"
    | "sandbox-iframe"
    | "static-fallback"
    | string;
  requiresSandbox?: boolean;
  requiresSignedBundle?: boolean;
  fallbackRequired?: boolean;
  allowedPermissions?: string[];
  allowedConnectSrc?: string[];
  postMessageProtocol?: string;
  [key: string]: unknown;
}

export type BackyElement = BackyContentElement & {
  componentKey?: string;
  version?: string;
  controls?: BackyInteractiveControl[];
  fallback?: string | BackyInteractiveFallback;
  renderCapabilities?: BackyInteractiveRenderCapabilities;
} & Record<string, unknown>;
export type BackyContentDocument = CoreBackyContentDocument &
  Record<string, unknown>;

export interface BackyMediaAsset {
  id: string;
  type: "image" | "video" | "audio" | "document" | "font" | "other" | string;
  url?: string;
  deliveryUrl?: string;
  downloadUrl?: string;
  src?: string;
  alt?: string;
  title?: string;
  visibility?: string;
  responsive?: {
    src: string;
    srcSet: string;
    sizes: string;
    variants: Array<{
      width: number;
      quality: number;
      url: string;
      bytes?: number;
      format?: string;
      mimeType?: string;
      generatedAt?: string;
    }>;
    preparedAt?: string;
    preparedBy?: string;
    format?: string;
    generatedBytes?: number;
    storageProvider?: string;
  };
  references?: {
    schemaVersion: "backy.media.references.v1" | string;
    global: boolean;
    scoped: boolean;
    scopes: string[];
    pageIds: string[];
    postIds: string[];
    pages: Array<{
      id: string;
      usageTypes: string[];
      bindings: Array<Record<string, unknown>>;
    }>;
    posts: Array<{
      id: string;
      usageTypes: string[];
      bindings: Array<Record<string, unknown>>;
    }>;
    usageTypes: string[];
    totalBindings: number;
  };
  referenceSummary?: {
    pageCount: number;
    postCount: number;
    usageTypes: string[];
    global: boolean;
    scoped: boolean;
  };
  editableMetadata?: {
    schemaVersion: "backy.media.editable-metadata.v1" | string;
    title: string | null;
    altText: string | null;
    caption: string | null;
    tags: string[];
    folderId: string | null;
    scope: string;
    scopeTargetId: string | null;
    visibility: string;
    metadata: Record<string, unknown>;
  };
  metadata?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface BackyMediaFolder {
  id: string;
  siteId?: string;
  parentId: string | null;
  name: string;
  sortOrder: number;
  createdAt?: string;
  path: string;
  depth: number;
  childIds: string[];
  directAssetCount: number;
  assetCount: number;
  [key: string]: unknown;
}

export interface BackyMediaFolderRoot {
  id: null;
  name: "Root";
  path: "Root";
  depth: -1;
  childIds: string[];
  directAssetCount: number;
  assetCount: number;
}

export interface BackyMediaFolderList {
  schemaVersion: "backy.media-folders.v1";
  folders: BackyMediaFolder[];
  root: BackyMediaFolderRoot;
  count: number;
  publicAssetCount: number;
  [key: string]: unknown;
}

export interface BackyFontAsset extends BackyMediaAsset {
  family?: string;
  weight?: string | number;
  style?: string;
  weights?: Array<string | number>;
  styles?: string[];
  fallbackStack?: string;
  display?: string;
  cssFamily?: string;
}

export interface BackyFontVariant {
  id: string;
  mediaId: string;
  family: string;
  weight: string;
  style: string;
  display: string;
  fallbackStack: string;
  cssFamily: string;
  url: string;
  mimeType?: string;
  sizeBytes?: number;
  originalName?: string;
  folderId?: string | null;
  tags?: string[];
  [key: string]: unknown;
}

export interface BackyFontFamily {
  family: string;
  fallbackStack: string;
  display: string;
  cssFamily: string;
  variants: BackyFontVariant[];
  assetIds: string[];
  [key: string]: unknown;
}

export interface BackyFontManifest {
  schemaVersion: "backy.font-manifest.v1";
  generatedAt?: string;
  siteId: string;
  families: BackyFontFamily[];
  fonts: BackyFontVariant[];
  css: string;
  counts: {
    families: number;
    variants: number;
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

export interface BackyFieldSchema {
  key: string;
  label?: string;
  type: string;
  required?: boolean;
  unique?: boolean;
  options?: Array<string | Record<string, unknown>>;
  referenceCollectionId?: string;
  [key: string]: unknown;
}

export interface BackyCollectionSchema {
  id: string;
  slug: string;
  name: string;
  status?: string;
  permissions?: Record<string, boolean>;
  fields: BackyFieldSchema[];
  recordsUrl?: string;
  listRoutePattern?: string;
  dynamicListRoutePattern?: string;
  dynamicListRouteResolveUrl?: string;
  dynamicListRouteRenderUrl?: string;
  routePattern?: string;
  dynamicRoutePattern?: string;
  dynamicRouteResolveUrl?: string;
  dynamicRouteRenderUrl?: string;
  frontendDesign?: BackyFrontendDesignProvenance;
  [key: string]: unknown;
}

export interface BackyCollectionRecord<
  TValues extends Record<string, unknown> = Record<string, unknown>,
> {
  id: string;
  slug: string;
  status?: string;
  values: TValues;
  frontendDesign?: BackyFrontendDesignProvenance;
  createdAt?: string;
  updatedAt?: string;
  [key: string]: unknown;
}

export interface BackyCollectionRecordWritePolicy {
  createFieldMode?: "all" | "selected" | string;
  allowedCreateFields?: string[];
  updateFieldMode?: "all" | "selected" | string;
  allowedUpdateFields?: string[];
  ignoredFields?: string[];
  [key: string]: unknown;
}

export interface BackyCollectionRecordWriteOptions {
  siteId?: string;
  requestId?: string;
  publicWriteToken?: string;
}

export interface BackyCollectionRecordCreateOptions extends BackyCollectionRecordWriteOptions {
  slug?: string;
}

export type BackyCollectionRecordWriteMode = "create" | "update";

export interface BackyCollectionRecordWriteInputOptions
  extends BackyCollectionRecordCreateOptions {
  mode?: BackyCollectionRecordWriteMode;
  includeUnmappedValues?: boolean;
}

export interface BackyCollectionRecordWriteInput<
  TValues extends Record<string, unknown> = Record<string, unknown>,
> {
  mode: BackyCollectionRecordWriteMode;
  values: TValues;
  options: BackyCollectionRecordCreateOptions;
  ignoredFields: string[];
  allowedFields: string[];
}

export interface BackyCollectionRecordMutationResult<
  TValues extends Record<string, unknown> = Record<string, unknown>,
> {
  record: BackyCollectionRecord<TValues>;
  visitorWritePolicy?: BackyCollectionRecordWritePolicy;
}

export interface BackyCollectionRecordDeleteResult {
  deleted: boolean;
  recordId: string;
  slug?: string;
}

export type BackyAdminCollectionStatus =
  | "draft"
  | "published"
  | "archived"
  | string;

export interface BackyAdminCollectionListOptions
  extends BackyLiveManagementRequestOptions {
  limit?: number;
  offset?: number;
}

export interface BackyAdminCollectionCreateInput {
  name: string;
  slug?: string;
  status?: BackyAdminCollectionStatus;
  fields?: BackyFieldSchema[];
  permissions?: Record<string, boolean>;
  routePattern?: string;
  listRoutePattern?: string;
  frontendDesignTemplateId?: string;
  requestId?: string;
  [key: string]: unknown;
}

export interface BackyAdminCollectionUpdateInput
  extends Partial<Omit<BackyAdminCollectionCreateInput, "name">> {
  name?: string;
}

export type BackyAdminCollectionsResponse = BackyEnvelope<
  {
    collections: BackyCollectionSchema[];
    pagination?: BackyPagination;
  } & Record<string, unknown>
>;

export type BackyAdminCollectionResponse = BackyEnvelope<
  {
    collection: BackyCollectionSchema;
    cacheInvalidation?: Record<string, unknown>;
  } & Record<string, unknown>
>;

export type BackyAdminCollectionDeleteResponse = BackyEnvelope<
  {
    deleted: boolean;
    collectionId: string;
    cacheInvalidation?: Record<string, unknown>;
  } & Record<string, unknown>
>;

export interface BackyAdminCollectionRecordListOptions
  extends BackyLiveManagementRequestOptions {
  status?: string;
  slug?: string;
  q?: string;
  search?: string;
  fieldKey?: string;
  fieldValue?: string;
  sortBy?: string;
  sortDirection?: "asc" | "desc";
  limit?: number;
  offset?: number;
}

export interface BackyAdminCollectionRecordCreateInput<
  TValues extends Record<string, unknown> = Record<string, unknown>,
> {
  values: TValues;
  slug?: string;
  status?: BackyAdminCollectionStatus;
  frontendDesignTemplateId?: string;
  requestId?: string;
  [key: string]: unknown;
}

export interface BackyAdminCollectionRecordUpdateInput<
  TValues extends Record<string, unknown> = Record<string, unknown>,
> extends Partial<Omit<BackyAdminCollectionRecordCreateInput<TValues>, "values">> {
  values?: Partial<TValues>;
}

export type BackyAdminCollectionRecordsResponse<
  TValues extends Record<string, unknown> = Record<string, unknown>,
> = BackyEnvelope<
  {
    collection: BackyCollectionSchema;
    records: Array<BackyCollectionRecord<TValues>>;
    pagination?: BackyPagination;
  } & Record<string, unknown>
>;

export type BackyAdminCollectionRecordResponse<
  TValues extends Record<string, unknown> = Record<string, unknown>,
> = BackyEnvelope<
  {
    collection?: BackyCollectionSchema;
    record: BackyCollectionRecord<TValues>;
    cacheInvalidation?: Record<string, unknown>;
  } & Record<string, unknown>
>;

export type BackyAdminCollectionRecordDeleteResponse = BackyEnvelope<
  {
    deleted: boolean;
    recordId: string;
    cacheInvalidation?: Record<string, unknown>;
  } & Record<string, unknown>
>;

export interface BackyCommerceProductDesign {
  templateId?: string;
  templateName?: string;
  routePattern?: string;
  source?: Record<string, unknown>;
  chrome?: Record<string, unknown>;
  tokens?: Record<string, unknown>;
  customCss?: string;
  bindingHints?: Array<Record<string, unknown>>;
  frontendDesignTemplateId?: string;
  frontendDesignTemplateName?: string;
  frontendDesignRoutePattern?: string;
  frontendDesignSource?: Record<string, unknown>;
  frontendDesignChrome?: Record<string, unknown>;
  frontendDesignTokens?: Record<string, unknown>;
  frontendDesignCustomCss?: string;
  frontendDesignBindingHints?: Array<Record<string, unknown>>;
  [key: string]: unknown;
}

export interface BackyManifestCollectionSchema extends BackyCollectionSchema {
  id: string;
  slug: string;
  name: string;
  fields: BackyFieldSchema[];
  recordsUrl: string;
  listRoutePattern?: string;
  dynamicListRoutePattern: string;
  dynamicListRouteResolveUrl?: string;
  dynamicListRouteRenderUrl?: string;
  routePattern?: string;
  dynamicRoutePattern: string;
  dynamicRouteResolveUrl?: string;
  dynamicRouteRenderUrl?: string;
  frontendDesign?: BackyManifestRouteFrontendDesign;
}

export interface BackyManifestCollectionsRuntimeModule {
  schemaVersion: "backy.collections-discovery.v1";
  count: number;
  publishedCount: number;
  publicReadCount: number;
  publicCreateCount: number;
  publicUpdateCount: number;
  publicDeleteCount: number;
  fieldTypes: string[];
  endpoints: {
    list: string;
    detail: string;
    records: string;
    record: string;
    resolveList: string;
    renderList: string;
    resolveItem: string;
    renderItem: string;
    [key: string]: unknown;
  };
  methods: {
    list: "GET";
    detail: "GET";
    records: "GET";
    createRecord: "POST";
    updateRecord: "PATCH";
    deleteRecord: "DELETE";
    [key: string]: unknown;
  };
  capabilities: {
    publicSchemas: boolean;
    publicRecords: boolean;
    publicCreate: boolean;
    publicUpdate: boolean;
    publicDelete: boolean;
    dynamicListRoutes: boolean;
    dynamicItemRoutes: boolean;
    fieldValidation: boolean;
    relationshipFields: boolean;
    frontendDesignTemplates: boolean;
    conditionalRequests: boolean;
    cacheableRecords: boolean;
    [key: string]: unknown;
  };
  cache: {
    list: string;
    detail: string;
    records: string;
    mutations: string;
    [key: string]: unknown;
  };
  privacy: {
    publicRecordListsOnlyIncludePublishedRecords: boolean;
    visitorWritesRequirePublicPermission: boolean;
    publicUpdateAndDeleteMayRequireWriteToken: boolean;
    [key: string]: unknown;
  };
  writePolicy: {
    createStatus: "draft";
    createRequiresPublicCreate: boolean;
    updateRequiresPublicUpdate: boolean;
    deleteRequiresPublicDelete: boolean;
    updateDeleteToken: "publicWriteToken";
    fieldPolicyMetadata: "metadata.visitorWritePolicy";
    [key: string]: unknown;
  };
  schemas: {
    collection: "backy.collection.v1";
    record: "backy.collection-record.v1";
    validationError: "VALIDATION_ERROR";
    slugConflict: "SLUG_CONFLICT";
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

const BACKY_COLLECTION_RECORD_TRANSPORT_KEYS = new Set([
  "values",
  "fields",
  "slug",
  "requestId",
  "publicWriteToken",
]);

const backyCollectionRecordRecord = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};

const firstBackyCollectionRecordRecord = (
  ...values: unknown[]
): Record<string, unknown> | null => {
  for (const value of values) {
    if (value && typeof value === "object" && !Array.isArray(value)) {
      return value as Record<string, unknown>;
    }
  }
  return null;
};

const backyCollectionRecordText = (...values: unknown[]): string => {
  for (const value of values) {
    if (typeof value === "string") {
      const text = value.trim();
      if (text) return text;
    }
  }
  return "";
};

const normalizeBackyCollectionRecordAliasKey = (value: string): string =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9_ -]/g, "")
    .replace(/[\s-]+/g, "_")
    .replace(/^_+|_+$/g, "");

const backyCollectionFieldKeySet = (
  collection: BackyCollectionSchema | undefined | null,
): Set<string> =>
  new Set(
    (collection?.fields || [])
      .map((field) => field.key)
      .filter((key): key is string => typeof key === "string" && key.length > 0),
  );

const backyCollectionFieldAliasMap = (
  collection: BackyCollectionSchema | undefined | null,
): Record<string, string> => {
  const aliases: Record<string, string> = {};
  for (const field of collection?.fields || []) {
    if (typeof field.key !== "string" || !field.key) continue;
    aliases[field.key] = field.key;
    aliases[normalizeBackyCollectionRecordAliasKey(field.key)] = field.key;
    if (typeof field.label === "string" && field.label.trim()) {
      aliases[field.label] = field.key;
      aliases[normalizeBackyCollectionRecordAliasKey(field.label)] = field.key;
    }
    const name = field.name;
    if (typeof name === "string" && name.trim()) {
      aliases[name] = field.key;
      aliases[normalizeBackyCollectionRecordAliasKey(name)] = field.key;
    }
  }
  return aliases;
};

const backyCollectionRecordStringList = (value: unknown): string[] =>
  Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string" && item.length > 0)
    : [];

const backyCollectionVisitorWritePolicy = (
  collection: BackyCollectionSchema | undefined | null,
): BackyCollectionRecordWritePolicy => {
  const metadata = backyCollectionRecordRecord(collection?.metadata);
  return backyCollectionRecordRecord(
    metadata.visitorWritePolicy,
  ) as BackyCollectionRecordWritePolicy;
};

const resolveBackyCollectionRecordFieldKey = (
  rawKey: string,
  fieldKeys: Set<string>,
  fieldAliasMap: Record<string, string>,
): string | undefined => {
  if (fieldKeys.size === 0 || fieldKeys.has(rawKey)) {
    return rawKey;
  }
  const mapped =
    fieldAliasMap[rawKey] ||
    fieldAliasMap[normalizeBackyCollectionRecordAliasKey(rawKey)];
  return mapped && fieldKeys.has(mapped) ? mapped : undefined;
};

const normalizeBackyCollectionRecordValues = (
  collection: BackyCollectionSchema | undefined | null,
  values: Record<string, unknown>,
  options: BackyCollectionRecordWriteInputOptions,
): {
  values: Record<string, unknown>;
  ignoredFields: string[];
  allowedFields: string[];
} => {
  const mode = options.mode || "create";
  const fieldKeys = backyCollectionFieldKeySet(collection);
  const fieldAliasMap = backyCollectionFieldAliasMap(collection);
  const policy = backyCollectionVisitorWritePolicy(collection);
  const selectedAllowedFields =
    mode === "update"
      ? backyCollectionRecordStringList(policy.allowedUpdateFields)
      : backyCollectionRecordStringList(policy.allowedCreateFields);
  const fieldMode =
    mode === "update" ? policy.updateFieldMode : policy.createFieldMode;
  const allowedSet =
    fieldMode === "selected" ? new Set(selectedAllowedFields) : null;
  const normalized: Record<string, unknown> = {};
  const ignoredFields: string[] = [];

  for (const [rawKey, value] of Object.entries(values)) {
    const resolved = resolveBackyCollectionRecordFieldKey(
      rawKey,
      fieldKeys,
      fieldAliasMap,
    );
    if (!resolved) {
      if (options.includeUnmappedValues === true && fieldKeys.size === 0) {
        normalized[rawKey] = value;
      } else {
        ignoredFields.push(rawKey);
      }
      continue;
    }
    if (allowedSet && !allowedSet.has(resolved)) {
      ignoredFields.push(resolved);
      continue;
    }
    normalized[resolved] = value;
  }

  return {
    values: normalized,
    ignoredFields,
    allowedFields: allowedSet
      ? Array.from(allowedSet)
      : Array.from(fieldKeys),
  };
};

export function buildBackyCollectionRecordWriteInput<
  TValues extends Record<string, unknown> = Record<string, unknown>,
>(
  collection: BackyCollectionSchema | undefined | null,
  source: Record<string, unknown> | undefined | null,
  options: BackyCollectionRecordWriteInputOptions = {},
): BackyCollectionRecordWriteInput<TValues> {
  const body = backyCollectionRecordRecord(source);
  const valuesCandidate = firstBackyCollectionRecordRecord(
    body.values,
    body.fields,
  );
  const rawValues =
    valuesCandidate ||
    Object.entries(body).reduce<Record<string, unknown>>(
      (values, [key, value]) => {
        if (!BACKY_COLLECTION_RECORD_TRANSPORT_KEYS.has(key)) {
          values[key] = value;
        }
        return values;
      },
      {},
    );
  const mode = options.mode || "create";
  const normalized = normalizeBackyCollectionRecordValues(
    collection,
    rawValues,
    options,
  );
  const slug = backyCollectionRecordText(options.slug, body.slug);
  const requestId = backyCollectionRecordText(options.requestId, body.requestId);
  const publicWriteToken = backyCollectionRecordText(
    options.publicWriteToken,
    body.publicWriteToken,
  );

  return {
    mode,
    values: normalized.values as TValues,
    options: {
      ...(options.siteId ? { siteId: options.siteId } : {}),
      ...(requestId ? { requestId } : {}),
      ...(publicWriteToken ? { publicWriteToken } : {}),
      ...(slug ? { slug } : {}),
    },
    ignoredFields: normalized.ignoredFields,
    allowedFields: normalized.allowedFields,
  };
}

export interface BackyCommerceProduct {
  id: string;
  slug: string;
  title: string;
  sku?: string;
  description?: string;
  price: number;
  compareAtPrice?: number | null;
  currency: string;
  imageUrl?: string;
  galleryImages?: string[];
  variants?: Array<Record<string, unknown>>;
  category?: string;
  tags?: string[];
  vendor?: string;
  featured?: boolean;
  productType?: "physical" | "digital" | "service" | string;
  inventory?: Record<string, unknown>;
  delivery?: Record<string, unknown>;
  checkout?: Record<string, unknown>;
  subscription?: {
    enabled: boolean;
    interval: "weekly" | "monthly" | "quarterly" | "yearly" | string;
    trialDays: number;
    [key: string]: unknown;
  };
  links?: Record<string, unknown>;
  design?: BackyCommerceProductDesign;
  [key: string]: unknown;
}

export interface BackyCommerceCatalogOptions extends BackyListOptions {
  slug?: string;
  q?: string;
  search?: string;
  category?: string;
  tag?: string;
  vendor?: string;
  productType?: "physical" | "digital" | "service" | string;
  featured?: boolean;
  sortBy?: string;
  sortDirection?: "asc" | "desc";
  siteId?: string;
}

export interface BackyCommerceLineItemInput {
  productId?: string;
  product_id?: string;
  slug?: string;
  productSlug?: string;
  product_slug?: string;
  variantId?: string;
  variant_id?: string;
  variantSku?: string;
  variant_sku?: string;
  sku?: string;
  /** Optional whole checkout quantity from 1 to 999; omitted values default to 1. */
  quantity?: number | string;
  qty?: number | string;
}

export const BACKY_DEFAULT_COMMERCE_ORDER_QUANTITY = 1;
export const BACKY_MAX_COMMERCE_ORDER_QUANTITY = 999;

export type BackyCommerceOrderInput = {
  customer?: {
    name: string;
    email: string;
    phone?: string;
  };
  items?: BackyCommerceLineItemInput[];
  lineItems?: BackyCommerceLineItemInput[];
  cartItems?: BackyCommerceLineItemInput[];
  cart?: {
    items?: BackyCommerceLineItemInput[];
    [key: string]: unknown;
  };
  customerName?: string;
  customerEmail?: string;
  customerPhone?: string;
  name?: string;
  email?: string;
  phone?: string;
  shippingAddress?: string;
  billingAddress?: string;
  notes?: string;
  discountCode?: string;
  couponCode?: string;
  promoCode?: string;
  paymentProvider?: string;
  paymentReference?: string;
  payment?: {
    provider?: string;
    reference?: string;
    [key: string]: unknown;
  };
  checkoutSessionId?: string;
  checkoutSession?: string | { id?: string; [key: string]: unknown };
  requestId?: string;
};

export type BackyCommerceOrderInputSource = Omit<
  Partial<BackyCommerceOrderInput>,
  "cart" | "customer" | "items" | "lineItems" | "cartItems"
> & {
  customer?: Partial<NonNullable<BackyCommerceOrderInput["customer"]>> &
    Record<string, unknown>;
  cart?: {
    items?: Array<BackyCommerceLineItemInput | Record<string, unknown>>;
    [key: string]: unknown;
  };
  items?: Array<BackyCommerceLineItemInput | Record<string, unknown>>;
  lineItems?: Array<BackyCommerceLineItemInput | Record<string, unknown>>;
  cartItems?: Array<BackyCommerceLineItemInput | Record<string, unknown>>;
  shipping?: {
    address?: string;
    line1?: string;
    [key: string]: unknown;
  };
  billing?: {
    address?: string;
    line1?: string;
    [key: string]: unknown;
  };
  [key: string]: unknown;
};

export interface BackyCommerceOrderInputBuildOptions {
  defaultQuantity?: number | string;
  requestId?: string;
}

export interface BackyCommerceOrderSummary {
  id: string;
  slug: string;
  orderNumber: string;
  status: string;
  paymentStatus: string;
  fulfillmentStatus: string;
  total: number;
  currency: string;
  itemCount: number;
  createdAt?: string;
  [key: string]: unknown;
}

export interface BackyCommerceWebhookInput {
  id?: string;
  type: string;
  data?: {
    object?: Record<string, unknown>;
    [key: string]: unknown;
  };
  metadata?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface BackyCommerceWebhookResult {
  schemaVersion: "backy.commerce-webhook.v1";
  event: {
    id: string;
    type: string;
    status: string;
    [key: string]: unknown;
  };
  order: {
    id: string;
    slug: string;
    orderNumber?: string;
    orderStatus?: string;
    paymentStatus?: string;
    paymentReference?: string;
    [key: string]: unknown;
  };
}

export interface BackyCommerceCheckoutSession {
  id: string;
  provider: "manual" | "stripe";
  providerMode: "test" | "live";
  accountId?: string | null;
  status: "requires_action" | "provider_ready";
  handoffMode: "manual" | "provider";
  url?: string | null;
  successUrl: string;
  cancelUrl: string;
  expiresAt: string;
  reference: string;
  amountTotal: number;
  currency: string;
  metadata?: Record<string, string>;
  providerPayload?: Record<string, unknown> | null;
  [key: string]: unknown;
}

export interface BackyCommerceStorefrontContract {
  schemaVersion: "backy.commerce-settings.v1";
  mode: "catalog-only" | "manual-orders" | "checkout-provider";
  currency: string;
  paymentProvider: "none" | "stripe" | "paypal" | "paddle" | "square" | "adyen" | "mollie" | "razorpay" | "manual";
  providerAccountId?: string | null;
  provider?: {
    mode: "test" | "live";
    accountId?: string | null;
    webhookConfigured: boolean;
    webhookEndpointUrl?: string | null;
    [key: string]: unknown;
  };
  capabilities: {
    catalog: boolean;
    orderIntake: boolean;
    providerCheckout: boolean;
    [key: string]: unknown;
  };
  checkout: {
    catalogUrl: string;
    orderIntakeUrl: string;
    successPath: string;
    cancelPath: string;
    guestCheckout: boolean;
    [key: string]: unknown;
  };
  pricing: {
    taxes: boolean;
    shipping: boolean;
    discounts: boolean;
    rules?: {
      taxRatePercent?: number;
      digitalTaxRatePercent?: number;
      shippingBaseAmount?: number;
      shippingWeightRate?: number;
      discountPercent?: number;
      [key: string]: unknown;
    };
    [key: string]: unknown;
  };
  inventory: {
    reservations: boolean;
    reservationMinutes: number;
    [key: string]: unknown;
  };
  webhooks?: {
    eventsEnabled: boolean;
    endpointConfigured?: boolean;
    eventAllowlist?: string[];
    [key: string]: unknown;
  };
  reconciliation?: {
    mode: "manual" | "webhook" | "scheduled";
    windowHours: number;
    requiresManualReview: boolean;
    [key: string]: unknown;
  };
  providerCertification?: {
    schemaVersion: "backy.commerce-provider-certification-handoff.v1";
    status: "external-live-provider-gate";
    localMockGate: "ci:commerce-provider-smoke";
    liveCertificationGate: "ci:commerce-provider-certification";
    requiredFor: "live-commerce-provider-launch";
    secretHandling: string;
    operatorCommandTemplate: {
      command: string;
      envTemplate: string;
      envTemplateSchemaVersion: "backy.commerce-provider-certification-env-template.v1";
      providerChoices: {
        payment: string[];
        tax: string[];
        shipping: string[];
        discount: string[];
        catalog: string[];
        subscription: string[];
        webhook: string[];
        [key: string]: unknown;
      };
      requiredInputs: string[];
      targetInputs: string[];
      secretHandling: string;
      [key: string]: unknown;
    };
    operatorEnvTemplate: {
      schemaVersion: "backy.commerce-provider-certification-env-template.v1";
      format: "shell-env";
      fileName: ".env.backy-commerce-provider-certification";
      body: string;
      secretHandling: string;
      [key: string]: unknown;
    };
    runtime?: {
      paymentConfigured: boolean;
      taxConfigured: boolean;
      shippingConfigured: boolean;
      discountConfigured: boolean;
      catalogSyncConfigured: boolean;
      subscriptionConfigured: boolean;
      webhookSecretConfigured: boolean;
      configuredFamilies: string[];
      missingFamilies: string[];
      secretHandling: string;
      [key: string]: unknown;
    };
    groups: Array<{
      family: string;
      providers: string[];
      gate: "ci:commerce-provider-certification" | "ci:commerce-provider-smoke";
      requiredInputs: string[];
      evidence: string;
      [key: string]: unknown;
    }>;
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

export type BackyCommerceProviderCertification = NonNullable<
  BackyCommerceStorefrontContract["providerCertification"]
> &
  Record<string, unknown>;

export interface BackyCommerceOrderAnalytics {
  schemaVersion?: "backy.order-analytics.v1" | string;
  totals?: Record<string, unknown>;
  revenue?: Record<string, unknown>;
  payment?: Record<string, unknown>;
  fulfillment?: Record<string, unknown>;
  operations?: Record<string, unknown>;
  trends?: Array<Record<string, unknown>>;
  recentOrders?: Array<Record<string, unknown>>;
  providerExecution?: Record<string, unknown>;
  [key: string]: unknown;
}

export type BackyCommerceOrderAnalyticsResponse = BackyEnvelope<
  {
    site?: { id: string; slug?: string; name?: string; [key: string]: unknown };
    collection?: {
      id: string;
      slug?: string;
      name?: string;
      [key: string]: unknown;
    };
    analytics: BackyCommerceOrderAnalytics;
    providerCertification?: BackyCommerceProviderCertification;
  } & Record<string, unknown>
>;

export interface BackyCommerceProductProviderSyncInput {
  provider?:
    | "auto"
    | "stripe"
    | "paypal"
    | "paddle"
    | "square"
    | "shopify"
    | "bigcommerce"
    | "woocommerce"
    | "etsy"
    | "magento"
    | "http"
    | "generic-http"
    | "custom-http"
    | string;
  requestId?: string;
  [key: string]: unknown;
}

export type BackyCommerceProductProviderSyncResponse = BackyEnvelope<
  {
    sync: Record<string, unknown>;
    product: BackyCollectionRecord;
    cacheInvalidation?: Record<string, unknown>;
    providerCertification?: BackyCommerceProviderCertification;
  } & Record<string, unknown>
>;

export interface BackyCommerceOrderOperationInput {
  requestId?: string;
  [key: string]: unknown;
}

export type BackyCommerceOrderQuoteInput = BackyCommerceOrderOperationInput;
export type BackyCommerceOrderTrackingInput = BackyCommerceOrderOperationInput;
export type BackyCommerceOrderProviderRefundInput =
  BackyCommerceOrderOperationInput;
export type BackyCommerceOrderFulfillmentInput =
  BackyCommerceOrderOperationInput;
export type BackyCommerceOrderShippingLabelInput =
  BackyCommerceOrderOperationInput;

export interface BackyCommerceOrderQuote {
  schemaVersion: "backy.order-quote.v1";
  subtotal: number;
  discountAmount: number;
  taxAmount: number;
  shippingAmount: number;
  total: number;
  currency: string;
  providerAdjustments?: Array<Record<string, unknown>>;
  calculatedAt?: string;
  [key: string]: unknown;
}

export interface BackyCommerceOrderTracking {
  status: string;
  provider: string;
  trackingNumber: string;
  trackingUrl: string;
  checkedAt: string;
  providerPayload?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface BackyCommerceOrderProviderRefund {
  id: string;
  status: "requested" | "succeeded" | "failed" | "requires_action" | string;
  provider: string;
  reference: string;
  amount: number;
  currency: string;
  reason: string;
  requestedAt: string;
  completedAt: string | null;
  providerPayload?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface BackyCommerceOrderFulfillment {
  id: string;
  status: "requested" | "succeeded" | "failed" | "requires_action" | string;
  provider: string;
  orderNumber: string;
  requestedAt: string;
  completedAt: string | null;
  providerPayload?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface BackyCommerceOrderShippingLabel {
  id: string;
  status: "draft" | "purchased" | "voided" | string;
  provider: string;
  serviceLevel: string;
  url: string;
  cost: number;
  createdAt: string;
  providerPayload?: Record<string, unknown>;
  [key: string]: unknown;
}

export type BackyCommerceOrderQuoteResponse = BackyEnvelope<
  {
    record: BackyCollectionRecord;
    order?: BackyCollectionRecord;
    quote: BackyCommerceOrderQuote;
    cacheInvalidation?: Record<string, unknown>;
  } & Record<string, unknown>
>;

export type BackyCommerceOrderTrackingResponse = BackyEnvelope<
  {
    record: BackyCollectionRecord;
    order?: BackyCollectionRecord;
    tracking: BackyCommerceOrderTracking | null;
    cacheInvalidation?: Record<string, unknown>;
  } & Record<string, unknown>
>;

export type BackyCommerceOrderProviderRefundResponse = BackyEnvelope<
  {
    record: BackyCollectionRecord;
    order?: BackyCollectionRecord;
    refund: BackyCommerceOrderProviderRefund | null;
    cacheInvalidation?: Record<string, unknown>;
  } & Record<string, unknown>
>;

export type BackyCommerceOrderFulfillmentResponse = BackyEnvelope<
  {
    record: BackyCollectionRecord;
    order?: BackyCollectionRecord;
    fulfillment: BackyCommerceOrderFulfillment | null;
    cacheInvalidation?: Record<string, unknown>;
  } & Record<string, unknown>
>;

export type BackyCommerceOrderShippingLabelResponse = BackyEnvelope<
  {
    record: BackyCollectionRecord;
    order?: BackyCollectionRecord;
    label: BackyCommerceOrderShippingLabel | null;
    cacheInvalidation?: Record<string, unknown>;
  } & Record<string, unknown>
>;

export interface BackyCommerceProductSubscriptionsLifecycle {
  schemaVersion: "backy.product-subscription-lifecycle.v1";
  product: Record<string, unknown>;
  summary: Record<string, unknown>;
  actionPlan?: Record<string, unknown>;
  subscriptions: Array<Record<string, unknown>>;
  execution?: Record<string, unknown>;
  certification?: Record<string, unknown>;
  contract?: Record<string, unknown>;
  [key: string]: unknown;
}

export type BackyCommerceProductSubscriptionsResponse = BackyEnvelope<
  {
    lifecycle: BackyCommerceProductSubscriptionsLifecycle;
    collection?: {
      id: string;
      slug?: string;
      name?: string;
      [key: string]: unknown;
    };
  } & Record<string, unknown>
>;

export interface BackyCommerceProductSubscriptionActionInput {
  action: "pause" | "resume" | "cancel";
  reason?: string;
  provider?: string;
  requestId?: string;
  [key: string]: unknown;
}

export interface BackyCommerceProductSubscriptionAction {
  id: string;
  schemaVersion: "backy.product-subscription-action.v1";
  action: "pause" | "resume" | "cancel";
  status: "requested" | "succeeded" | "failed" | "requires_action" | string;
  provider: string;
  executionMode: string;
  productId: string;
  productSlug: string;
  orderId: string;
  orderSlug: string;
  subscriptionReference: string;
  reason: string;
  requestedAt: string;
  completedAt: string | null;
  providerPayload?: Record<string, unknown>;
  [key: string]: unknown;
}

export type BackyCommerceProductSubscriptionActionResponse = BackyEnvelope<
  {
    action: BackyCommerceProductSubscriptionAction;
    record: BackyCollectionRecord;
    order?: BackyCollectionRecord;
    cacheInvalidation?: Record<string, unknown>;
  } & Record<string, unknown>
>;

export interface BackyCommerceReconciliationInput {
  dryRun?: boolean;
  limit?: number;
  runMode?: "manual" | "scheduled";
  actor?: string;
  requestId?: string;
  [key: string]: unknown;
}

export interface BackyCommerceScheduledReconciliationOptions
  extends BackyLiveManagementRequestOptions {
  dryRun?: boolean;
  limit?: number;
}

export type BackyCommerceReconciliationResponse = BackyEnvelope<
  {
    schemaVersion: "backy.commerce-reconciliation.v1";
    runMode: "manual" | "scheduled" | string;
    dryRun: boolean;
    processedAt: string;
    limit: number;
    eventCount: number;
    eligibleUpdateCount: number;
    updatedCount: number;
    unmatchedCount: number;
    updates: Array<Record<string, unknown>>;
    unmatchedEvents: Array<Record<string, unknown>>;
    [key: string]: unknown;
  }
>;

export interface BackyManifestCommerceRuntimeModule {
  schemaVersion: "backy.commerce-discovery.v1";
  enabled: boolean;
  mode: "catalog-only" | "manual-orders" | "checkout-provider";
  currency: string;
  paymentProvider: "none" | "stripe" | "paypal" | "paddle" | "square" | "adyen" | "mollie" | "razorpay" | "manual";
  catalogCollection: {
    id: string;
    slug: string;
    name: string;
    status: string;
    publicRead: boolean;
    [key: string]: unknown;
  } | null;
  ordersCollection: {
    id: string;
    slug: string;
    name: string;
    status: string;
    publicRead: boolean;
    [key: string]: unknown;
  } | null;
  endpoints: {
    catalog: string;
    productDetail: string;
    orderContract: string;
    createOrder: string;
    providerWebhook: string;
    productCollectionRecords: string;
    [key: string]: unknown;
  };
  methods: {
    catalog: "GET";
    productDetail: "GET";
    orderContract: "GET";
    createOrder: "POST";
    providerWebhook: "POST";
    [key: string]: unknown;
  };
  capabilities: {
    catalog: boolean;
    orderIntake: boolean;
    providerCheckout: boolean;
    productFilters: boolean;
    productFacets: boolean;
    inventoryReservations: boolean;
    pricingRules: boolean;
    guestCheckout: boolean;
    providerWebhooks: boolean;
    providerCertification: boolean;
    conditionalRequests: boolean;
    cacheableCatalog: boolean;
    [key: string]: unknown;
  };
  orderRequest: {
    schemaVersion: "backy.commerce-order-request.v1";
    contentType: "application/json";
    itemArrays: string[];
    itemFields: {
      productId: string[];
      slug: string[];
      variantId: string[];
      variantSku: string[];
      quantity: string[];
      [key: string]: unknown;
    };
    customer: string[];
    discountCode: string[];
    payment: string[];
    checkoutSessionId: string[];
    quantity: {
      default: 1;
      minimum: 1;
      maximum: 999;
      [key: string]: unknown;
    };
    required: string[];
    checkoutSessionStatuses: Array<
      "requires_action" | "provider_ready" | "provider_created" | string
    >;
    [key: string]: unknown;
  };
  cache: {
    catalog: string;
    productDetail: string;
    orderContract: string;
    createOrder: string;
    providerWebhook: string;
    [key: string]: unknown;
  };
  privacy: {
    publicCatalogExcludesPrivateOrderQueue: boolean;
    ordersCollectionMustRemainPrivate: boolean;
    publicOrderPayloadContainsCustomerData: boolean;
    providerSecretsNeverReturned: boolean;
    [key: string]: unknown;
  };
  filters: {
    queryParams: string[];
    maxLimit: number;
    sortDirections: Array<"asc" | "desc" | string>;
    productTypes: Array<"physical" | "digital" | "service" | string>;
    [key: string]: unknown;
  };
  schemas: {
    catalog: "backy.commerce-catalog.v1";
    settings: "backy.commerce-settings.v1";
    orderContract: "backy.commerce-orders.v1";
    product: "backy.commerce-product.v1";
    providerCertification: "backy.commerce-provider-certification-handoff.v1";
    productCatalogNotFound: "PRODUCT_CATALOG_NOT_FOUND";
    productNotFound: "PRODUCT_NOT_FOUND";
    orderQueueNotFound: "ORDER_QUEUE_NOT_FOUND";
    orderQueueNotPrivate: "ORDER_QUEUE_NOT_PRIVATE";
    validationError: "VALIDATION_ERROR";
    productOutOfStock: "PRODUCT_OUT_OF_STOCK";
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

export interface BackyCommerceCatalog {
  schemaVersion: "backy.commerce-catalog.v1";
  collection?: BackyCollectionSchema;
  products: BackyCommerceProduct[];
  commerce?: BackyCommerceStorefrontContract;
  facets?: Record<string, unknown>;
  filters?: Record<string, unknown>;
  readiness?: Record<string, unknown>;
  pagination: BackyPagination;
}

export interface BackyInteractiveComponentsContract {
  schemaVersion: "backy.interactive-components.v1";
  elementTypes: Array<"interactiveFigure" | "codeComponent" | string>;
  capabilities: {
    trustedRegistry: boolean;
    customCodeSandbox: boolean;
    signedBundles: boolean;
    staticFallbacks: boolean;
    versionedBundles: boolean;
    dataBindings: boolean;
    [key: string]: unknown;
  };
  registry: {
    provider: string;
    configured: boolean;
    endpoint?: string | null;
    bundleBaseUrl?: string | null;
    signedBundles: boolean;
    reviewRequired: boolean;
    [key: string]: unknown;
  };
  sandbox: {
    enabled: boolean;
    origin?: string | null;
    cspConfigured: boolean;
    iframeSandbox: string;
    allowedConnectSrc: string;
    requiresDedicatedOrigin: boolean;
    responseHeaders: {
      contentSecurityPolicy: string[];
      permissionsPolicy: string[];
      referrerPolicy: "no-referrer" | string;
      contentTypeOptions: "nosniff" | string;
      [key: string]: unknown;
    };
    [key: string]: unknown;
  };
  renderContract: {
    fields: string[];
    hydrationModes: string[];
    postMessageProtocol: string;
    fallbackRequired: boolean;
    unknownComponentBehavior: string;
    [key: string]: unknown;
  };
  dataBindingScopes: string[];
  security: {
    parentDomAccess: boolean;
    parentCookieAccess: boolean;
    adminApiAccess: boolean;
    secretsInPayload: boolean;
    communication: string;
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

export interface BackyInteractiveComponentRegistryEntry {
  componentKey: string;
  displayName: string;
  type: "interactiveFigure" | "codeComponent" | string;
  status: "active" | "disabled" | string;
  version: string;
  renderMode:
    | "trusted-component"
    | "sandbox-iframe"
    | "static-fallback"
    | string;
  source: "built-in" | "registry" | "custom" | string;
  description?: string;
  allowedDataScopes: string[];
  requiredFields: string[];
  controls: BackyInteractiveControl[];
  fallback: {
    required: boolean;
    supported: string[];
    [key: string]: unknown;
  };
  security: {
    adminApiAccess: boolean;
    parentDomAccess: boolean;
    parentCookieAccess: boolean;
    secretsInPayload: boolean;
    communication?: string;
    [key: string]: unknown;
  };
  integrity: {
    signed: boolean;
    signatureRequiredForCustomCode: boolean;
    [key: string]: unknown;
  };
  runtime?: {
    sandboxUrl?: string | null;
    bundleUrl?: string | null;
    iframeSandbox?: string;
    allowedPermissions?: string[];
    postMessageProtocol?: string;
    [key: string]: unknown;
  };
  dependencyPolicy?: {
    preset?: string;
    allowedPackagePatterns?: string[];
    blockedBuiltins?: string[];
    lifecycleScripts?: boolean;
    remoteRuntimeUrls?: boolean;
    [key: string]: unknown;
  };
  compatibility?: {
    backyRuntime?: string;
    renderTargets?: string[];
    animationLibraries?: string[];
    browserSupport?: string[];
    reducedMotion?: string;
    [key: string]: unknown;
  };
  dataBindingPresets?: Array<{
    id?: string;
    label?: string;
    scope?: string;
    targetPath?: string;
    mode?: string;
    [key: string]: unknown;
  }>;
  [key: string]: unknown;
}

export interface BackyInteractiveComponentRegistry {
  schemaVersion: "backy.interactive-component-registry.v1" | string;
  siteId: string;
  generatedAt?: string;
  contract: BackyInteractiveComponentsContract;
  components: BackyInteractiveComponentRegistryEntry[];
  pagination: BackyPagination;
  [key: string]: unknown;
}

export interface BackyCommerceOrderContract {
  schemaVersion: "backy.commerce-orders.v1";
  accepts: Record<string, unknown>;
  creates: Record<string, unknown>;
  inventoryReservation?: Record<string, unknown>;
  relatedEndpoints: Record<string, string>;
}

const backyCommerceRecord = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};

const backyCommerceText = (...values: unknown[]): string => {
  for (const value of values) {
    if (typeof value === "string") {
      const text = value.trim();
      if (text) return text;
    }
  }
  return "";
};

const backyCommerceItemArray = (
  ...values: unknown[]
): Array<Record<string, unknown>> => {
  const arrays = values.filter(Array.isArray) as Array<
    Array<Record<string, unknown>>
  >;
  return arrays.find((items) => items.length > 0) || arrays[0] || [];
};

const normalizeBackyCommerceOrderQuantity = (
  value: unknown,
  defaultQuantity: number,
): number => {
  const parsed =
    typeof value === "number"
      ? value
      : typeof value === "string" && value.trim() !== ""
        ? Number(value)
        : defaultQuantity;
  const finite = Number.isFinite(parsed) ? parsed : defaultQuantity;
  return Math.min(
    BACKY_MAX_COMMERCE_ORDER_QUANTITY,
    Math.max(1, Math.trunc(finite)),
  );
};

const setBackyCommerceTextField = <TKey extends keyof BackyCommerceOrderInput>(
  input: BackyCommerceOrderInput,
  key: TKey,
  value: string,
) => {
  if (value) {
    input[key] = value as BackyCommerceOrderInput[TKey];
  }
};

export function buildBackyCommerceOrderInput(
  source: BackyCommerceOrderInputSource | undefined | null,
  options: BackyCommerceOrderInputBuildOptions = {},
): BackyCommerceOrderInput {
  const body = backyCommerceRecord(source);
  const cart = backyCommerceRecord(body.cart);
  const customer = backyCommerceRecord(body.customer);
  const shipping = backyCommerceRecord(body.shipping);
  const billing = backyCommerceRecord(body.billing);
  const payment = backyCommerceRecord(body.payment);
  const checkoutSession = backyCommerceRecord(body.checkoutSession);
  const defaultQuantity = normalizeBackyCommerceOrderQuantity(
    options.defaultQuantity,
    BACKY_DEFAULT_COMMERCE_ORDER_QUANTITY,
  );
  const rawItems = backyCommerceItemArray(
    body.items,
    body.lineItems,
    body.cartItems,
    cart.items,
  );

  const input: BackyCommerceOrderInput = {
    items: rawItems.map((item) => {
      const record = backyCommerceRecord(item);
      const normalized: BackyCommerceLineItemInput = {
        quantity: normalizeBackyCommerceOrderQuantity(
          record.quantity ?? record.qty,
          defaultQuantity,
        ),
      };
      const productId = backyCommerceText(record.productId, record.product_id);
      const slug = backyCommerceText(
        record.slug,
        record.productSlug,
        record.product_slug,
      );
      const variantId = backyCommerceText(record.variantId, record.variant_id);
      const variantSku = backyCommerceText(
        record.variantSku,
        record.variant_sku,
        record.sku,
      );
      if (productId) normalized.productId = productId;
      if (slug) normalized.slug = slug;
      if (variantId) normalized.variantId = variantId;
      if (variantSku) normalized.variantSku = variantSku;
      return normalized;
    }),
  };

  const customerName = backyCommerceText(
    customer.name,
    body.customerName,
    body.name,
  );
  const customerEmail = backyCommerceText(
    customer.email,
    body.customerEmail,
    body.email,
  ).toLowerCase();
  const customerPhone = backyCommerceText(
    customer.phone,
    body.customerPhone,
    body.phone,
  );
  if (customerName || customerEmail || customerPhone) {
    input.customer = {
      name: customerName,
      email: customerEmail,
      ...(customerPhone ? { phone: customerPhone } : {}),
    };
  }

  setBackyCommerceTextField(
    input,
    "shippingAddress",
    backyCommerceText(body.shippingAddress, shipping.address, shipping.line1),
  );
  setBackyCommerceTextField(
    input,
    "billingAddress",
    backyCommerceText(body.billingAddress, billing.address, billing.line1),
  );
  setBackyCommerceTextField(input, "notes", backyCommerceText(body.notes));
  setBackyCommerceTextField(
    input,
    "discountCode",
    backyCommerceText(body.discountCode, body.couponCode, body.promoCode).toUpperCase(),
  );
  setBackyCommerceTextField(
    input,
    "paymentProvider",
    backyCommerceText(body.paymentProvider, payment.provider),
  );
  setBackyCommerceTextField(
    input,
    "paymentReference",
    backyCommerceText(body.paymentReference, payment.reference),
  );
  setBackyCommerceTextField(
    input,
    "checkoutSessionId",
    backyCommerceText(
      body.checkoutSessionId,
      checkoutSession.id,
      body.checkoutSession,
    ),
  );
  setBackyCommerceTextField(
    input,
    "requestId",
    backyCommerceText(options.requestId, body.requestId),
  );

  return input;
}

export interface BackyFrontendDesignProvenance {
  templateId: string;
  templateName?: string;
  routePattern?: string;
  source?: Record<string, unknown>;
  chrome?: Record<string, unknown>;
  tokens?: Record<string, unknown>;
  customCss?: string;
  bindingHints?: Array<Record<string, unknown>>;
  [key: string]: unknown;
}

export interface BackyReusableSectionFrontendDesign extends BackyFrontendDesignProvenance {}

export interface BackyPageSeoMetadata {
  title: string;
  description: string;
  path: string;
  canonical: string;
  canonicalUrl?: string;
  robots: {
    index: boolean;
    follow: boolean;
  };
  openGraph: {
    title: string;
    description: string;
    image?: string;
    [key: string]: unknown;
  };
  keywords: string[];
  jsonLd: Array<Record<string, unknown>>;
  [key: string]: unknown;
}

export interface BackyPageResource {
  id: string;
  siteId?: string;
  title: string;
  slug: string;
  description?: string | null;
  status?: string;
  path?: string;
  meta?: Record<string, unknown>;
  seo?: BackyPageSeoMetadata;
  content?: Record<string, unknown>;
  frontendDesign?: BackyFrontendDesignProvenance;
  [key: string]: unknown;
}

export interface BackyPostResource {
  id: string;
  siteId?: string;
  title: string;
  slug: string;
  excerpt?: string | null;
  status?: string;
  meta?: Record<string, unknown>;
  content?: Record<string, unknown>;
  frontendDesign?: BackyFrontendDesignProvenance;
  [key: string]: unknown;
}

export interface BackyBlogCategory {
  id: string;
  siteId?: string;
  name: string;
  slug: string;
  description?: string | null;
  color?: string | null;
  sortOrder?: number;
  postCount?: number;
  createdAt?: string;
  updatedAt?: string;
  [key: string]: unknown;
}

export interface BackyBlogTag {
  id: string;
  siteId?: string;
  name: string;
  slug: string;
  description?: string | null;
  postCount?: number;
  createdAt?: string;
  updatedAt?: string;
  [key: string]: unknown;
}

export interface BackyBlogAuthor {
  id: string;
  siteId?: string;
  name: string;
  slug: string;
  role?: string;
  status?: string;
  avatarUrl?: string | null;
  postCount?: number;
  [key: string]: unknown;
}

export interface BackyBlogListOptions extends BackyListOptions {
  siteId?: string;
  slug?: string;
  categoryId?: string;
  categorySlug?: string;
  tagId?: string;
  tagSlug?: string;
  authorId?: string;
  authorSlug?: string;
  q?: string;
  search?: string;
  year?: string | number;
  month?: string | number;
  previewToken?: string;
}

export type BackyBlogResponse = BackyEnvelope<
  {
    post?: BackyPostResource;
    posts?: BackyPostResource[];
    pagination?: BackyPagination;
  } & Record<string, unknown>
>;

export type BackyBlogConditionalResult =
  BackyConditionalResult<BackyBlogResponse>;

export interface BackyLiveManagementRequestOptions {
  requestId?: string;
  siteId?: string;
  adminKey?: string;
  apiKey?: string;
  adminSession?: string;
  authorization?: string;
  bearerToken?: string;
  actor?: string;
  headers?: HeadersInit;
  credentials?: RequestCredentials;
}

export type BackyLiveManagedPageUpdateInput =
  GeneratedBackyOpenApiPageUpdateRequest & {
    requestId?: string;
  };

export type BackyLiveManagedBlogPostUpdateInput =
  GeneratedBackyOpenApiBlogPostUpdateRequest & {
    requestId?: string;
  };

export type BackyLiveManagedPageResponse = BackyEnvelope<
  {
    page: BackyPageResource;
    cacheInvalidation?: Record<string, unknown>;
  } & Record<string, unknown>
>;

export type BackyLiveManagedBlogPostResponse = BackyEnvelope<
  {
    post: BackyPostResource;
    cacheInvalidation?: Record<string, unknown>;
  } & Record<string, unknown>
>;

export type BackyAdminPageStatus =
  | "draft"
  | "published"
  | "scheduled"
  | "archived"
  | string;

export interface BackyAdminPageResource extends BackyPageResource {
  content?: Record<string, unknown>;
  isHomepage?: boolean;
  parentId?: string | null;
  sortOrder?: number;
  scheduledAt?: string | null;
  publishedAt?: string | null;
  createdAt?: string;
  updatedAt?: string;
}

export interface BackyAdminPageListOptions
  extends BackyLiveManagementRequestOptions {
  includeUnpublished?: boolean;
  limit?: number;
  offset?: number;
}

export interface BackyAdminPageCreateInput {
  title: string;
  slug?: string;
  description?: string | null;
  status?: BackyAdminPageStatus;
  isHomepage?: boolean;
  parentId?: string | null;
  sortOrder?: number;
  scheduledAt?: string | null;
  content?: BackyEditableContent | Record<string, unknown> | unknown[];
  meta?: Record<string, unknown>;
  frontendDesignTemplateId?: string;
  requestId?: string;
  [key: string]: unknown;
}

export interface BackyAdminPageUpdateInput
  extends Partial<Omit<BackyAdminPageCreateInput, "title">> {
  title?: string;
  expectedUpdatedAt?: string;
  revisionNote?: string;
}

export interface BackyAdminPageVersionInput {
  expectedUpdatedAt?: string;
  requestId?: string;
  [key: string]: unknown;
}

export interface BackyAdminPagePreviewInput {
  ttlSeconds?: number;
  requestId?: string;
  [key: string]: unknown;
}

export interface BackyAdminPageRollbackInput {
  revisionId: string;
  requestId?: string;
  [key: string]: unknown;
}

export interface BackyAdminPageRevisionListOptions
  extends BackyLiveManagementRequestOptions {
  limit?: number;
  offset?: number;
}

export type BackyAdminPagesResponse = BackyEnvelope<
  {
    pages: BackyAdminPageResource[];
    pagination?: BackyPagination;
  } & Record<string, unknown>
>;

export type BackyAdminPageResponse = BackyEnvelope<
  {
    page: BackyAdminPageResource;
    cacheInvalidation?: Record<string, unknown>;
  } & Record<string, unknown>
>;

export type BackyAdminPageDeleteResponse = BackyEnvelope<
  {
    deleted: boolean;
    pageId: string;
    cacheInvalidation?: Record<string, unknown>;
  } & Record<string, unknown>
>;

export type BackyAdminPageReadinessResponse = BackyEnvelope<
  {
    readiness: Record<string, unknown>;
  } & Record<string, unknown>
>;

export type BackyAdminPagePreviewResponse = BackyEnvelope<
  {
    previewToken: string;
    expiresAt: string;
    targetType: "page" | string;
    targetId: string;
    hostedUrl: string;
    renderUrl: string;
    pageApiUrl: string;
    [key: string]: unknown;
  }
>;

export type BackyAdminPageRevisionsResponse = BackyEnvelope<
  {
    revisions: Array<Record<string, unknown>>;
    pagination?: BackyPagination;
  } & Record<string, unknown>
>;

export type BackyAdminBlogPostStatus =
  | "draft"
  | "published"
  | "scheduled"
  | "archived"
  | string;

export interface BackyAdminBlogPostResource extends BackyPostResource {
  authorId?: string | null;
  categoryIds?: string[];
  tagIds?: string[];
  featuredImageId?: string | null;
  scheduledAt?: string | null;
  publishedAt?: string | null;
  createdAt?: string;
  updatedAt?: string;
}

export interface BackyAdminBlogPostListOptions
  extends BackyLiveManagementRequestOptions {
  status?: BackyAdminBlogPostStatus | "all";
  categoryId?: string;
  categorySlug?: string;
  tagId?: string;
  tagSlug?: string;
  authorId?: string;
  authorSlug?: string;
  limit?: number;
  offset?: number;
}

export interface BackyAdminBlogPostCreateInput {
  title: string;
  slug?: string;
  excerpt?: string | null;
  status?: BackyAdminBlogPostStatus;
  content?: BackyEditableContent | Record<string, unknown> | unknown[];
  meta?: Record<string, unknown>;
  featuredImageId?: string | null;
  authorId?: string | null;
  categoryIds?: string[];
  tagIds?: string[];
  scheduledAt?: string | null;
  frontendDesignTemplateId?: string;
  requestId?: string;
  [key: string]: unknown;
}

export interface BackyAdminBlogPostUpdateInput
  extends Partial<Omit<BackyAdminBlogPostCreateInput, "title">> {
  title?: string;
  expectedUpdatedAt?: string;
  revisionNote?: string;
}

export interface BackyAdminBlogPostVersionInput {
  expectedUpdatedAt?: string;
  requestId?: string;
  [key: string]: unknown;
}

export interface BackyAdminBlogPostPreviewInput {
  ttlSeconds?: number;
  requestId?: string;
  [key: string]: unknown;
}

export interface BackyAdminBlogPostRollbackInput {
  revisionId: string;
  requestId?: string;
  [key: string]: unknown;
}

export interface BackyAdminBlogPostRevisionListOptions
  extends BackyLiveManagementRequestOptions {
  limit?: number;
  offset?: number;
}

export type BackyAdminBlogPostsResponse = BackyEnvelope<
  {
    posts: BackyAdminBlogPostResource[];
    pagination?: BackyPagination;
  } & Record<string, unknown>
>;

export type BackyAdminBlogPostResponse = BackyEnvelope<
  {
    post: BackyAdminBlogPostResource;
    cacheInvalidation?: Record<string, unknown>;
  } & Record<string, unknown>
>;

export type BackyAdminBlogPostDeleteResponse = BackyEnvelope<
  {
    deleted: boolean;
    postId: string;
    cacheInvalidation?: Record<string, unknown>;
  } & Record<string, unknown>
>;

export type BackyAdminBlogPostReadinessResponse = BackyEnvelope<
  {
    readiness: Record<string, unknown>;
  } & Record<string, unknown>
>;

export type BackyAdminBlogPostPreviewResponse = BackyEnvelope<
  {
    previewToken: string;
    expiresAt: string;
    targetType: "post" | string;
    targetId: string;
    hostedUrl: string;
    postApiUrl: string;
    [key: string]: unknown;
  }
>;

export type BackyAdminBlogPostRevisionsResponse = BackyEnvelope<
  {
    revisions: Array<Record<string, unknown>>;
    pagination?: BackyPagination;
  } & Record<string, unknown>
>;

export type BackyEditableContent =
  | BackyContentDocument
  | (Record<string, unknown> & {
      elements?: BackyElement[];
      contentDocument?: BackyContentDocument | Record<string, unknown>;
    });

export interface BackyContentElementPatch {
  elementId: string;
  changes?: Record<string, unknown>;
  props?: Record<string, unknown>;
  styles?: Record<string, unknown>;
  fields?: Record<string, unknown>;
  remove?: string[];
}

export type BackyContentEditableTargetSource =
  | "field"
  | "layout"
  | "props"
  | "styles"
  | "visibility";

export interface BackyContentEditableTarget {
  path: string;
  source: BackyContentEditableTargetSource;
  value?: unknown;
  valueType:
    | "string"
    | "richText"
    | "number"
    | "boolean"
    | "color"
    | "image"
    | "video"
    | "url"
    | "json"
    | string;
}

export interface BackyContentElementDescriptor {
  id: string;
  type: string;
  name?: string;
  parentId?: string;
  depth: number;
  index: number;
  path: string;
  childCount: number;
  editableTargetPaths: string[];
  editableTargets: BackyContentEditableTarget[];
  element: BackyElement;
}

export interface BackyContentEditableFieldPatch {
  elementId: string;
  field?: string;
  path?: string;
  targetPath?: string;
  value?: unknown;
  remove?: boolean;
  editable?: boolean;
}

export interface BackyContentEditableMapEntry {
  elementId?: string;
  field?: string;
  targetPath?: string;
  editable?: boolean;
  [key: string]: unknown;
}

export type BackyContentEditableMap = Record<
  string,
  BackyContentEditableMapEntry
>;

export interface BackyContentEditableMapPatch {
  key: string;
  value?: unknown;
  remove?: boolean;
}

export interface BackyContentEditableMapValuesOptions {
  removeUndefined?: boolean;
}

export interface BackyLiveManagedEditableMapUpdateOptions {
  requestId?: string;
  valuesOptions?: BackyContentEditableMapValuesOptions;
}

const BACKY_LAYOUT_TARGET_ALIASES: Record<string, string> = {
  x: "x",
  y: "y",
  width: "width",
  height: "height",
  zIndex: "zIndex",
  rotation: "rotation",
  visible: "visible",
  locked: "locked",
  name: "name",
};

const BACKY_LAYER_LAYOUT_TARGETS = [
  "x",
  "y",
  "width",
  "height",
  "zIndex",
  "rotation",
] as const;

function isBackyRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function cloneBackyContent<TContent extends BackyEditableContent>(
  content: TContent,
): TContent {
  if (typeof structuredClone === "function") {
    return structuredClone(content);
  }

  return JSON.parse(JSON.stringify(content)) as TContent;
}

function contentElementRoots(content: unknown): unknown[][] {
  if (!isBackyRecord(content)) {
    return [];
  }

  const roots: unknown[][] = [];
  if (Array.isArray(content.elements)) {
    roots.push(content.elements);
  }
  if (
    isBackyRecord(content.contentDocument) &&
    Array.isArray(content.contentDocument.elements)
  ) {
    roots.push(content.contentDocument.elements);
  }
  return roots;
}

function visitBackyContentElements(
  roots: unknown[][],
  visitor: (element: Record<string, unknown>) => void,
): void {
  const visit = (items: unknown[]) => {
    items.forEach((item) => {
      if (!isBackyRecord(item)) return;
      visitor(item);
      if (Array.isArray(item.children)) {
        visit(item.children);
      }
    });
  };

  roots.forEach(visit);
}

function inferBackyEditableValueType(
  path: string,
  value: unknown,
): BackyContentEditableTarget["valueType"] {
  const normalizedPath = path.toLowerCase();
  if (typeof value === "boolean") return "boolean";
  if (typeof value === "number") return "number";
  if (Array.isArray(value)) return "richText";
  if (
    normalizedPath.includes("color") ||
    (typeof value === "string" && /^#(?:[0-9a-f]{3}){1,2}$/i.test(value))
  ) {
    return "color";
  }
  if (normalizedPath.includes("image") || normalizedPath.includes("poster")) {
    return "image";
  }
  if (normalizedPath.includes("video")) {
    return "video";
  }
  if (
    normalizedPath.includes("href") ||
    normalizedPath.includes("url") ||
    normalizedPath.includes("src")
  ) {
    return "url";
  }
  if (typeof value === "string") return "string";
  return "json";
}

function pushBackyEditableTarget(
  targets: BackyContentEditableTarget[],
  path: string,
  source: BackyContentEditableTargetSource,
  value: unknown,
): void {
  targets.push({
    path,
    source,
    value,
    valueType: inferBackyEditableValueType(path, value),
  });
}

function editableTargetsForBackyElement(
  element: Record<string, unknown>,
): BackyContentEditableTarget[] {
  const targets: BackyContentEditableTarget[] = [];
  if (typeof element.name === "string") {
    pushBackyEditableTarget(targets, "name", "field", element.name);
  }
  BACKY_LAYER_LAYOUT_TARGETS.forEach((field) => {
    if (element[field] !== undefined) {
      pushBackyEditableTarget(
        targets,
        `layout.${field}`,
        "layout",
        element[field],
      );
    }
  });
  pushBackyEditableTarget(
    targets,
    "visibility.hidden",
    "visibility",
    element.visible === false,
  );
  pushBackyEditableTarget(
    targets,
    "visibility.locked",
    "visibility",
    Boolean(element.locked),
  );
  if (isBackyRecord(element.props)) {
    Object.entries(element.props).forEach(([key, value]) => {
      pushBackyEditableTarget(targets, `props.${key}`, "props", value);
    });
  }
  if (isBackyRecord(element.styles)) {
    Object.entries(element.styles).forEach(([key, value]) => {
      pushBackyEditableTarget(targets, `styles.${key}`, "styles", value);
    });
  }
  return targets;
}

function mergeElementRecord(
  element: Record<string, unknown>,
  key: string,
  patch: Record<string, unknown>,
): void {
  element[key] = {
    ...(isBackyRecord(element[key]) ? element[key] : {}),
    ...patch,
  };
}

function setNestedEditableValue(
  root: Record<string, unknown>,
  path: string,
  value: unknown,
): void {
  const segments = path.split(".").filter(Boolean);
  if (segments.length === 0) return;

  let current = root;
  segments.slice(0, -1).forEach((segment) => {
    if (!isBackyRecord(current[segment])) {
      current[segment] = {};
    }
    current = current[segment] as Record<string, unknown>;
  });

  const leaf = segments[segments.length - 1];
  if (value === undefined) {
    delete current[leaf];
  } else {
    current[leaf] = value;
  }
}

function applyEditablePath(
  element: Record<string, unknown>,
  path: string,
  value: unknown,
): void {
  if (path.startsWith("props.")) {
    if (!isBackyRecord(element.props)) {
      element.props = {};
    }
    setNestedEditableValue(
      element.props as Record<string, unknown>,
      path.slice("props.".length),
      value,
    );
    return;
  }

  if (path.startsWith("styles.")) {
    if (!isBackyRecord(element.styles)) {
      element.styles = {};
    }
    setNestedEditableValue(
      element.styles as Record<string, unknown>,
      path.slice("styles.".length),
      value,
    );
    return;
  }

  if (path.startsWith("layout.")) {
    const field = BACKY_LAYOUT_TARGET_ALIASES[path.slice("layout.".length)];
    if (field) {
      if (value === undefined) {
        delete element[field];
      } else {
        element[field] = value;
      }
    }
    return;
  }

  if (path === "visibility.hidden") {
    if (value === undefined) {
      delete element.visible;
    } else {
      element.visible = !Boolean(value);
    }
    return;
  }

  if (path === "visibility.locked") {
    if (value === undefined) {
      delete element.locked;
    } else {
      element.locked = Boolean(value);
    }
    return;
  }

  setNestedEditableValue(element, path, value);
}

function applyBackyContentElementPatch(
  element: Record<string, unknown>,
  patch: BackyContentElementPatch,
): void {
  if (patch.props) {
    mergeElementRecord(element, "props", patch.props);
  }
  if (patch.styles) {
    mergeElementRecord(element, "styles", patch.styles);
  }
  if (patch.fields) {
    Object.entries(patch.fields).forEach(([key, value]) => {
      if (value === undefined) {
        delete element[key];
      } else {
        element[key] = value;
      }
    });
  }
  Object.entries(patch.changes || {}).forEach(([path, value]) => {
    applyEditablePath(element, path, value);
  });
  (patch.remove || []).forEach((path) => {
    applyEditablePath(element, path, undefined);
  });
}

function editableFieldPatchToElementPatch(
  patch: BackyContentEditableFieldPatch,
): BackyContentElementPatch | null {
  const path = patch.path || patch.field || patch.targetPath;
  if (!patch.elementId || !path || patch.editable === false) {
    return null;
  }

  if (patch.remove) {
    return {
      elementId: patch.elementId,
      remove: [path],
    };
  }

  return {
    elementId: patch.elementId,
    changes: {
      [path]: patch.value,
    },
  };
}

function editableMapPatchToFieldPatch(
  editableMap: BackyContentEditableMap | Record<string, unknown>,
  patch: BackyContentEditableMapPatch,
): BackyContentEditableFieldPatch | null {
  if (!patch.key) {
    return null;
  }

  const entry = editableMap[patch.key];
  if (!isBackyRecord(entry)) {
    return null;
  }

  const elementId =
    typeof entry.elementId === "string" ? entry.elementId : "";
  const field =
    typeof entry.field === "string"
      ? entry.field
      : typeof entry.targetPath === "string"
        ? entry.targetPath
        : "";

  if (!elementId || !field || entry.editable === false) {
    return null;
  }

  return {
    elementId,
    field,
    value: patch.value,
    remove: patch.remove,
    editable:
      typeof entry.editable === "boolean" ? entry.editable : undefined,
  };
}

function liveManagedResourceUpdatedAt(
  resource: Record<string, unknown>,
): string | undefined {
  return typeof resource.updatedAt === "string" ? resource.updatedAt : undefined;
}

export function findBackyContentElement(
  content: BackyEditableContent | undefined | null,
  elementId: string,
): BackyElement | null {
  if (!content || !elementId) {
    return null;
  }

  let found: Record<string, unknown> | null = null;
  visitBackyContentElements(contentElementRoots(content), (element) => {
    if (!found && element.id === elementId) {
      found = element;
    }
  });

  return found as BackyElement | null;
}

export function listBackyContentElements(
  content: BackyEditableContent | undefined | null,
): BackyContentElementDescriptor[] {
  if (!content) {
    return [];
  }

  const descriptors: BackyContentElementDescriptor[] = [];
  const walk = (
    items: unknown[],
    rootPath: string,
    parentId: string | undefined,
    depth: number,
  ) => {
    items.forEach((item, index) => {
      if (!isBackyRecord(item) || typeof item.id !== "string") return;
      const path = `${rootPath}.${index}`;
      const editableTargets = editableTargetsForBackyElement(item);
      descriptors.push({
        id: item.id,
        type: typeof item.type === "string" ? item.type : "unknown",
        ...(typeof item.name === "string" ? { name: item.name } : {}),
        ...(parentId ? { parentId } : {}),
        depth,
        index,
        path,
        childCount: Array.isArray(item.children) ? item.children.length : 0,
        editableTargetPaths: editableTargets.map((target) => target.path),
        editableTargets,
        element: item as BackyElement,
      });
      if (Array.isArray(item.children)) {
        walk(item.children, `${path}.children`, item.id, depth + 1);
      }
    });
  };

  if (isBackyRecord(content) && Array.isArray(content.elements)) {
    walk(content.elements, "elements", undefined, 0);
  }
  if (
    isBackyRecord(content) &&
    isBackyRecord(content.contentDocument) &&
    Array.isArray(content.contentDocument.elements)
  ) {
    walk(content.contentDocument.elements, "contentDocument.elements", undefined, 0);
  }

  return descriptors;
}

export function patchBackyContentElement<TContent extends BackyEditableContent>(
  content: TContent | undefined | null,
  patch: BackyContentElementPatch,
): TContent | null {
  return patchBackyContentElements(content, [patch]);
}

export function patchBackyContentEditableField<
  TContent extends BackyEditableContent,
>(
  content: TContent | undefined | null,
  patch: BackyContentEditableFieldPatch,
): TContent | null {
  return patchBackyContentEditableFields(content, [patch]);
}

export function patchBackyContentEditableMapEntry<
  TContent extends BackyEditableContent,
>(
  content: TContent | undefined | null,
  editableMap: BackyContentEditableMap | Record<string, unknown> | undefined | null,
  patch: BackyContentEditableMapPatch,
): TContent | null {
  return patchBackyContentEditableMapEntries(content, editableMap, [patch]);
}

export function patchBackyContentEditableMapEntries<
  TContent extends BackyEditableContent,
>(
  content: TContent | undefined | null,
  editableMap: BackyContentEditableMap | Record<string, unknown> | undefined | null,
  patches: readonly BackyContentEditableMapPatch[],
): TContent | null {
  if (!editableMap) {
    return null;
  }

  const fieldPatches = patches
    .map((patch) => editableMapPatchToFieldPatch(editableMap, patch))
    .filter((patch): patch is BackyContentEditableFieldPatch =>
      Boolean(patch),
    );

  return patchBackyContentEditableFields(content, fieldPatches);
}

export function patchBackyContentEditableMapValues<
  TContent extends BackyEditableContent,
>(
  content: TContent | undefined | null,
  editableMap: BackyContentEditableMap | Record<string, unknown> | undefined | null,
  values: Record<string, unknown>,
  options: BackyContentEditableMapValuesOptions = {},
): TContent | null {
  const patches = Object.entries(values).map(([key, value]) => ({
    key,
    value,
    remove: options.removeUndefined === true && value === undefined,
  }));

  return patchBackyContentEditableMapEntries(content, editableMap, patches);
}

export function buildBackyLiveManagedPageEditableMapUpdate(
  page: BackyPageResource | undefined | null,
  editableMap: BackyContentEditableMap | Record<string, unknown> | undefined | null,
  values: Record<string, unknown>,
  options: BackyLiveManagedEditableMapUpdateOptions = {},
): BackyLiveManagedPageUpdateInput | null {
  if (!page?.content) {
    return null;
  }

  const content = patchBackyContentEditableMapValues(
    page.content,
    editableMap,
    values,
    options.valuesOptions,
  );
  if (!content) {
    return null;
  }

  const expectedUpdatedAt = liveManagedResourceUpdatedAt(page);
  return {
    title: page.title,
    content: content as BackyLiveManagedPageUpdateInput["content"],
    ...(expectedUpdatedAt ? { expectedUpdatedAt } : {}),
    ...(options.requestId ? { requestId: options.requestId } : {}),
  };
}

export function buildBackyLiveManagedBlogPostEditableMapUpdate(
  post: BackyPostResource | undefined | null,
  editableMap: BackyContentEditableMap | Record<string, unknown> | undefined | null,
  values: Record<string, unknown>,
  options: BackyLiveManagedEditableMapUpdateOptions = {},
): BackyLiveManagedBlogPostUpdateInput | null {
  if (!post?.content) {
    return null;
  }

  const content = patchBackyContentEditableMapValues(
    post.content,
    editableMap,
    values,
    options.valuesOptions,
  );
  if (!content) {
    return null;
  }

  const expectedUpdatedAt = liveManagedResourceUpdatedAt(post);
  return {
    title: post.title,
    content: content as BackyLiveManagedBlogPostUpdateInput["content"],
    ...(expectedUpdatedAt ? { expectedUpdatedAt } : {}),
    ...(options.requestId ? { requestId: options.requestId } : {}),
  };
}

export function patchBackyContentEditableFields<
  TContent extends BackyEditableContent,
>(
  content: TContent | undefined | null,
  patches: readonly BackyContentEditableFieldPatch[],
): TContent | null {
  const elementPatches = patches
    .map((patch) => editableFieldPatchToElementPatch(patch))
    .filter((patch): patch is BackyContentElementPatch => Boolean(patch));

  return patchBackyContentElements(content, elementPatches);
}

export function patchBackyContentElements<TContent extends BackyEditableContent>(
  content: TContent | undefined | null,
  patches: readonly BackyContentElementPatch[],
): TContent | null {
  if (!content || patches.length === 0) {
    return null;
  }

  const patchesByElementId = new Map<string, BackyContentElementPatch[]>();
  patches.forEach((patch) => {
    if (!patch.elementId) return;
    const existing = patchesByElementId.get(patch.elementId) || [];
    existing.push(patch);
    patchesByElementId.set(patch.elementId, existing);
  });

  if (patchesByElementId.size === 0) {
    return null;
  }

  const nextContent = cloneBackyContent(content);
  let changed = false;
  visitBackyContentElements(contentElementRoots(nextContent), (element) => {
    if (typeof element.id !== "string") return;
    const elementPatches = patchesByElementId.get(element.id);
    if (!elementPatches) return;

    elementPatches.forEach((patch) => applyBackyContentElementPatch(element, patch));
    changed = true;
  });

  return changed ? nextContent : null;
}

function liveManagementHeaders(
  options: BackyLiveManagementRequestOptions,
): HeadersInit | undefined {
  const headers = new Headers(options.headers);
  if (options.authorization) {
    headers.set("authorization", options.authorization);
  }
  if (options.bearerToken) {
    headers.set("authorization", `Bearer ${options.bearerToken}`);
  }
  if (options.adminSession) {
    headers.set("x-backy-admin-session", options.adminSession);
  }
  if (options.adminKey) {
    headers.set("x-backy-admin-key", options.adminKey);
  }
  if (options.apiKey) {
    headers.set("x-api-key", options.apiKey);
  }
  if (options.actor) {
    headers.set("x-backy-actor", options.actor);
  }
  let hasHeaders = false;
  headers.forEach(() => {
    hasHeaders = true;
  });
  return hasHeaders ? headers : undefined;
}

function splitLiveManagementRequestOptions<
  TOptions extends BackyLiveManagementRequestOptions,
>(options: TOptions) {
  const {
    requestId,
    siteId,
    adminKey,
    apiKey,
    adminSession,
    authorization,
    bearerToken,
    actor,
    headers,
    credentials,
    ...rest
  } = options;

  void adminKey;
  void apiKey;
  void adminSession;
  void authorization;
  void bearerToken;
  void actor;
  void headers;

  return {
    requestId,
    siteId,
    headers: liveManagementHeaders(options),
    credentials,
    rest,
  };
}

function isBackyFormData(value: unknown): value is FormData {
  return typeof FormData !== "undefined" && value instanceof FormData;
}

function appendBackyFormDataValue(
  formData: FormData,
  key: string,
  value: unknown,
) {
  if (value === undefined) return;
  if (value === null) {
    formData.set(key, "");
    return;
  }
  if (Array.isArray(value)) {
    formData.set(key, value.map((item) => String(item)).join(","));
    return;
  }
  if (typeof value === "object") {
    formData.set(key, JSON.stringify(value));
    return;
  }
  formData.set(key, String(value));
}

function buildBackyMediaUploadFormData(
  input: BackyAdminMediaUploadInput | BackyAdminMediaReplaceInput,
): FormData {
  const formData = new FormData();
  if (input.filename) {
    formData.set("file", input.file, input.filename);
  } else {
    formData.set("file", input.file);
  }

  Object.entries(input).forEach(([key, value]) => {
    if (key === "file" || key === "filename" || key === "requestId") return;
    appendBackyFormDataValue(formData, key, value);
  });

  return formData;
}

function backyRequestBody(value: unknown): BodyInit | undefined {
  if (value === undefined) return undefined;
  if (isBackyFormData(value)) return value;
  return JSON.stringify(value);
}

export type BackyBlogCategoriesResponse = BackyEnvelope<
  {
    categories: BackyBlogCategory[];
  } & Record<string, unknown>
>;

export type BackyBlogTagsResponse = BackyEnvelope<
  {
    tags: BackyBlogTag[];
  } & Record<string, unknown>
>;

export type BackyBlogAuthorsResponse = BackyEnvelope<
  {
    authors: BackyBlogAuthor[];
  } & Record<string, unknown>
>;

export interface BackyBlogFeedDiscovery {
  id: string;
  title?: string;
  format: "rss" | string;
  version?: string;
  rel?: string;
  contentType: string;
  endpoint: string;
  hostedPath?: string;
  schemaVersion?: string;
  scope?: string;
  visibility?: string;
  cache?: {
    scope?: string;
    etag?: boolean;
    revisionHeader?: string;
    [key: string]: unknown;
  };
  limits?: {
    queryParam?: string;
    default?: number;
    min?: number;
    max?: number;
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

export interface BackyReusableSection {
  id: string;
  siteId?: string;
  name: string;
  slug: string;
  description?: string | null;
  category?: string;
  status?: "active" | "archived" | string;
  tags?: string[];
  content: {
    elements: BackyElement[];
    canvasSize?: Record<string, unknown>;
    customCSS?: string;
    customJS?: string;
    [key: string]: unknown;
  };
  metadata?: Record<string, unknown>;
  frontendDesign?: BackyReusableSectionFrontendDesign;
  sourceElementId?: string | null;
  createdAt?: string;
  updatedAt?: string;
  [key: string]: unknown;
}

export interface BackyAdminReusableSectionListOptions
  extends BackyLiveManagementRequestOptions {
  status?: "active" | "archived" | "all" | string;
  category?: string;
  tag?: string;
  search?: string;
  limit?: number;
  offset?: number;
}

export interface BackyAdminReusableSectionCreateInput {
  name: string;
  slug?: string;
  description?: string | null;
  category?: string;
  status?: "active" | "archived" | string;
  tags?: string[];
  content: BackyReusableSection["content"] | BackyEditableContent;
  metadata?: Record<string, unknown>;
  sourceElementId?: string | null;
  frontendDesignTemplateId?: string;
  createdBy?: string;
  updatedBy?: string;
  requestId?: string;
  [key: string]: unknown;
}

export interface BackyAdminReusableSectionUpdateInput
  extends Partial<Omit<BackyAdminReusableSectionCreateInput, "name" | "content">> {
  name?: string;
  content?: BackyReusableSection["content"] | BackyEditableContent;
  expectedUpdatedAt?: string;
  expectedVersion?: number;
}

export interface BackyAdminReusableSectionRestoreInput {
  expectedUpdatedAt?: string;
  expectedVersion?: number;
  restoredBy?: string;
  updatedBy?: string;
  requestId?: string;
  [key: string]: unknown;
}

export type BackyAdminReusableSectionsResponse = BackyEnvelope<
  {
    sections: BackyReusableSection[];
    pagination?: BackyPagination;
  } & Record<string, unknown>
>;

export type BackyAdminReusableSectionResponse = BackyEnvelope<
  {
    section: BackyReusableSection;
    version?: number;
    cacheInvalidation?: Record<string, unknown>;
  } & Record<string, unknown>
>;

export type BackyAdminReusableSectionDeleteResponse = BackyEnvelope<
  {
    deleted: boolean;
    sectionId: string;
    cacheInvalidation?: Record<string, unknown>;
  } & Record<string, unknown>
>;

export type BackyAdminReusableSectionVersionsResponse = BackyEnvelope<
  {
    sectionId: string;
    versions: Array<Record<string, unknown>>;
    currentVersion?: number;
    [key: string]: unknown;
  }
>;

export type BackyAdminReusableSectionRestoreResponse = BackyEnvelope<
  {
    restored: boolean;
    restoredFromVersion: number;
    version?: number;
    section: BackyReusableSection;
    cacheInvalidation?: Record<string, unknown>;
  } & Record<string, unknown>
>;

export interface BackyFormDefinition {
  id: string;
  title?: string;
  active?: boolean;
  isActive?: boolean;
  fields?: Array<Record<string, unknown>>;
  frontendFieldKeyMap?: Record<string, string>;
  submitUrl?: string;
  detailUrl?: string;
  definitionUrl?: string;
  submissionsUrl?: string;
  contactsUrl?: string;
  collectionTarget?: Record<string, unknown> | null;
  frontendDesign?: BackyFrontendDesignProvenance;
  [key: string]: unknown;
}

export interface BackyFormEndpoints {
  definition: string;
  submissions: string;
  [key: string]: string;
}

export interface BackyFormSubmission {
  id: string;
  status?: string;
  values?: Record<string, unknown>;
  collectionRecord?: Record<string, unknown> | null;
  collectionRecordErrors?: Array<Record<string, unknown>>;
  [key: string]: unknown;
}

export interface BackyRenderFrontendDesign {
  site: BackyFrontendDesignContract | null;
  content: BackyFrontendDesignProvenance | null;
}

export interface BackyContact {
  id: string;
  status?: string;
  name?: string;
  email?: string;
  notes?: string;
  [key: string]: unknown;
}

export interface BackyAdminFormListOptions
  extends BackyListOptions,
    BackyLiveManagementRequestOptions {
  pageId?: string;
  postId?: string;
}

export interface BackyAdminFormSubmissionListOptions
  extends BackyListOptions,
    BackyLiveManagementRequestOptions {
  status?: "pending" | "approved" | "rejected" | "spam" | "all" | string;
  submissionRequestId?: string;
}

export interface BackyAdminFormContactListOptions
  extends BackyListOptions,
    BackyLiveManagementRequestOptions {
  status?: "new" | "contacted" | "qualified" | "archived" | "all" | string;
  contactRequestId?: string;
}

export interface BackyAdminFormsAnalyticsOptions
  extends BackyLiveManagementRequestOptions {
  days?: number | string;
}

export interface BackyAdminFormContactSegmentsOptions
  extends BackyLiveManagementRequestOptions {
  formId?: string;
}

export interface BackyAdminFormContactListInput {
  id?: string;
  listId?: string;
  name?: string;
  description?: string | null;
  filters?: Record<string, unknown>;
  requestId?: string;
  [key: string]: unknown;
}

export type BackyAdminFormMutationInput = Partial<BackyFormDefinition> & {
  requestId?: string;
  [key: string]: unknown;
};

export type BackyAdminFormsResponse = BackyEnvelope<
  {
    forms: BackyFormDefinition[];
    total?: number;
    pagination?: BackyPagination;
    persistenceCertification?: Record<string, unknown>;
  } & Record<string, unknown>
>;

export type BackyAdminFormResponse = BackyEnvelope<
  { form: BackyFormDefinition } & Record<string, unknown>
>;

export type BackyAdminFormDeleteResponse = BackyEnvelope<
  { deleted: boolean } & Record<string, unknown>
>;

export type BackyAdminFormSubmissionsResponse = BackyEnvelope<
  {
    form?: BackyFormDefinition;
    submissions: { data?: BackyFormSubmission[]; [key: string]: unknown };
    pagination?: BackyPagination;
  } & Record<string, unknown>
>;

export type BackyAdminFormSubmissionResponse = BackyEnvelope<
  { submission: BackyFormSubmission } & Record<string, unknown>
>;

export type BackyAdminFormContactsResponse = BackyEnvelope<
  {
    form?: BackyFormDefinition;
    formId?: string;
    contacts: BackyContact[];
    count?: number;
    pagination?: BackyPagination;
  } & Record<string, unknown>
>;

export type BackyAdminFormContactResponse = BackyEnvelope<
  { contact: BackyContact } & Record<string, unknown>
>;

export type BackyAdminFormContactDeleteResponse = BackyEnvelope<
  { deleted: boolean; contact?: BackyContact } & Record<string, unknown>
>;

export type BackyAdminFormsAnalyticsResponse = BackyEnvelope<
  {
    site?: { id: string; slug?: string; name?: string; [key: string]: unknown };
    analytics: Record<string, unknown>;
    generatedAt?: string;
  } & Record<string, unknown>
>;

export type BackyAdminFormContactSegmentsResponse = BackyEnvelope<
  {
    site?: { id: string; slug?: string; name?: string; [key: string]: unknown };
    formId?: string | null;
    analytics: Record<string, unknown>;
    generatedAt?: string;
  } & Record<string, unknown>
>;

export type BackyAdminFormContactListsResponse = BackyEnvelope<
  {
    lists: Array<Record<string, unknown>>;
    count?: number;
  } & Record<string, unknown>
>;

export type BackyAdminFormContactListMutationResponse = BackyEnvelope<
  {
    list?: Record<string, unknown>;
    lists?: Array<Record<string, unknown>>;
    created?: boolean;
    updated?: boolean;
    deleted?: boolean;
    listId?: string;
  } & Record<string, unknown>
>;

export interface BackyComment {
  id: string;
  targetType?: "page" | "post";
  targetId?: string;
  siteId?: string;
  commentThreadId?: string;
  status?: string;
  content?: string;
  authorName?: string;
  authorEmail?: string;
  authorWebsite?: string;
  userId?: string | null;
  parentId?: string | null;
  reviewedBy?: string | null;
  reviewedAt?: string | null;
  rejectionReason?: string | null;
  blockReason?: string | null;
  blockedBy?: string | null;
  blockedAt?: string | null;
  reportCount?: number;
  reportReasons?: string[];
  requestId?: string | null;
  createdAt?: string;
  updatedAt?: string;
  [key: string]: unknown;
}

export interface BackyInteractionEvent {
  id?: string;
  kind?: string;
  requestId?: string;
  commentId?: string;
  formId?: string;
  createdAt?: string;
  [key: string]: unknown;
}

export interface BackyMediaListOptions extends BackyListOptions {
  type?: "image" | "video" | "audio" | "document" | "file" | "font" | "other";
  q?: string;
  search?: string;
  tag?: string;
  folder?: string;
  folderId?: string;
  scope?: string;
  pageId?: string;
  postId?: string;
  blogId?: string;
  global?: boolean;
  siteId?: string;
}

export interface BackyAdminMediaListOptions
  extends BackyMediaListOptions,
    BackyLiveManagementRequestOptions {
  visibility?: "public" | "private" | "all" | string;
}

export interface BackyMediaQuota {
  limitBytes?: number;
  usedBytes?: number;
  remainingBytes?: number;
  maxUploadBytes?: number;
  [key: string]: unknown;
}

export type BackyAdminMediaListResponse = BackyEnvelope<
  {
    media: BackyMediaAsset[];
    quota?: BackyMediaQuota;
    pagination?: BackyPagination;
  } & Record<string, unknown>
>;

export type BackyAdminMediaResponse = BackyEnvelope<
  {
    media: BackyMediaAsset;
    quota?: BackyMediaQuota;
    cacheInvalidation?: Record<string, unknown>;
    replacement?: Record<string, unknown>;
  } & Record<string, unknown>
>;

export type BackyAdminMediaDeleteResponse = BackyEnvelope<
  {
    deleted: boolean;
    mediaId?: string;
    cacheInvalidation?: Record<string, unknown>;
  } & Record<string, unknown>
>;

export interface BackyAdminMediaUploadInput {
  file: Blob;
  filename?: string;
  scope?: "global" | "page" | "post" | string;
  scopeTargetId?: string | null;
  folderId?: string | null;
  visibility?: "public" | "private" | string;
  tags?: string[];
  metadata?: Record<string, unknown>;
  fontFamily?: string;
  fontWeight?: string;
  fontStyle?: "normal" | "italic" | "oblique" | string;
  fontFallback?: string;
  fontDisplay?: "auto" | "block" | "swap" | "fallback" | "optional" | string;
  altText?: string;
  caption?: string;
  uploadedBy?: string;
  requestId?: string;
  [key: string]: unknown;
}

export interface BackyAdminMediaReplaceInput {
  file: Blob;
  filename?: string;
  reason?: string;
  replacedBy?: string;
  fontFamily?: string;
  fontWeight?: string;
  fontStyle?: "normal" | "italic" | "oblique" | string;
  fontFallback?: string;
  fontDisplay?: "auto" | "block" | "swap" | "fallback" | "optional" | string;
  requestId?: string;
  [key: string]: unknown;
}

export interface BackyAdminMediaUpdateInput {
  originalName?: string;
  altText?: string | null;
  caption?: string | null;
  tags?: string[];
  metadata?: Record<string, unknown>;
  folderId?: string | null;
  scope?: "global" | "page" | "post" | string;
  scopeTargetId?: string | null;
  visibility?: "public" | "private" | string;
  requestId?: string;
  [key: string]: unknown;
}

export interface BackyAdminMediaFolder {
  id: string;
  siteId?: string;
  parentId: string | null;
  name: string;
  sortOrder?: number;
  createdAt?: string;
  updatedAt?: string;
  [key: string]: unknown;
}

export interface BackyAdminMediaFolderInput {
  name?: string;
  parentId?: string | null;
  sortOrder?: number;
  requestId?: string;
  [key: string]: unknown;
}

export type BackyAdminMediaFoldersResponse = BackyEnvelope<
  { folders: BackyAdminMediaFolder[] } & Record<string, unknown>
>;

export type BackyAdminMediaFolderResponse = BackyEnvelope<
  {
    folder: BackyAdminMediaFolder;
    cacheInvalidation?: Record<string, unknown>;
  } & Record<string, unknown>
>;

export type BackyAdminMediaFolderDeleteResponse = BackyEnvelope<
  {
    deleted: boolean;
    folderId?: string;
    cacheInvalidation?: Record<string, unknown>;
  } & Record<string, unknown>
>;

export type BackyMediaBindingTargetType = "page" | "post";
export type BackyMediaBindingAction = "bind" | "unbind";

export interface BackyMediaBindingRecord {
  id: string;
  mediaId: string;
  scope: BackyMediaBindingTargetType;
  targetId: string;
  usageType: string;
  attachedBy: string | null;
  createdAt?: string;
  updatedAt?: string;
  [key: string]: unknown;
}

export interface BackyMediaBindingInput {
  targetType: BackyMediaBindingTargetType;
  targetId: string;
  action?: BackyMediaBindingAction;
  usageType?: string;
  attachedBy?: string;
  requestId?: string;
  [key: string]: unknown;
}

export type BackyMediaBindingInputSource = Partial<BackyMediaBindingInput> &
  Record<string, unknown>;

export interface BackyMediaBindingInputBuildOptions {
  targetType?: BackyMediaBindingTargetType | string;
  targetId?: string;
  pageId?: string;
  postId?: string;
  blogId?: string;
  blogPostId?: string;
  action?: BackyMediaBindingAction | string;
  usageType?: string;
  attachedBy?: string;
  requestId?: string;
}

export type BackyMediaBindingRequestOptions = BackyLiveManagementRequestOptions;

export type BackyMediaBindingResponse = BackyEnvelope<{
  media: BackyMediaAsset;
  cacheInvalidation?: Record<string, unknown>;
  binding: BackyMediaBindingRecord | null;
  target: {
    type: BackyMediaBindingTargetType;
    id: string;
    bound: boolean;
    referenceKey: "pageIds" | "postIds" | string;
    [key: string]: unknown;
  };
}>;

export type BackyMediaSignedUrlDisposition = "inline" | "attachment";

export interface BackyMediaSignedUrlInput {
  disposition?: BackyMediaSignedUrlDisposition;
  expiresInSeconds?: number;
  requestId?: string;
  [key: string]: unknown;
}

export type BackyMediaSignedUrlInputSource =
  Partial<BackyMediaSignedUrlInput> & Record<string, unknown>;

export interface BackyMediaSignedUrlInputBuildOptions {
  disposition?: BackyMediaSignedUrlDisposition | string;
  expiresInSeconds?: number | string;
  requestId?: string;
}

export type BackyMediaSignedUrlRequestOptions = BackyLiveManagementRequestOptions;

export type BackyMediaSignedUrlResponse = BackyEnvelope<{
  media: {
    id: string;
    siteId?: string;
    filename?: string;
    originalName?: string;
    mimeType?: string;
    visibility?: string;
    [key: string]: unknown;
  };
  signedUrl: string;
  path: string;
  expiresAt: number;
  disposition: BackyMediaSignedUrlDisposition;
}>;

const backyMediaBindingRecord = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};

const backyMediaBindingText = (...values: unknown[]): string => {
  for (const value of values) {
    if (typeof value === "string") {
      const text = value.trim();
      if (text) return text;
    }
  }
  return "";
};

const normalizeBackyMediaBindingAction = (
  value: unknown,
): BackyMediaBindingAction | undefined => {
  const text = backyMediaBindingText(value).toLowerCase();
  if (["unbind", "remove", "detach", "disconnect", "unlink"].includes(text)) {
    return "unbind";
  }
  if (["bind", "add", "attach", "connect", "link"].includes(text)) {
    return "bind";
  }
  return undefined;
};

const normalizeBackyMediaBindingTargetType = (
  value: unknown,
): BackyMediaBindingTargetType | undefined => {
  const text = backyMediaBindingText(value).toLowerCase();
  if (text === "page" || text === "pages") return "page";
  if (
    text === "post" ||
    text === "posts" ||
    text === "blog" ||
    text === "blogpost" ||
    text === "blog-post" ||
    text === "article"
  ) {
    return "post";
  }
  return undefined;
};

export function buildBackyMediaBindingInput(
  source: BackyMediaBindingInputSource | undefined | null,
  options: BackyMediaBindingInputBuildOptions = {},
): BackyMediaBindingInput {
  const body = backyMediaBindingRecord(source);
  const target = backyMediaBindingRecord(body.target);
  const resource = backyMediaBindingRecord(body.resource);
  const pageId = backyMediaBindingText(
    options.pageId,
    body.pageId,
    target.pageId,
    resource.pageId,
  );
  const postId = backyMediaBindingText(
    options.postId,
    options.blogId,
    options.blogPostId,
    body.postId,
    body.blogId,
    body.blogPostId,
    target.postId,
    target.blogId,
    target.blogPostId,
    resource.postId,
    resource.blogId,
    resource.blogPostId,
  );
  const targetType =
    normalizeBackyMediaBindingTargetType(options.targetType) ??
    normalizeBackyMediaBindingTargetType(body.targetType) ??
    normalizeBackyMediaBindingTargetType(body.scope) ??
    normalizeBackyMediaBindingTargetType(body.resourceType) ??
    normalizeBackyMediaBindingTargetType(target.type) ??
    normalizeBackyMediaBindingTargetType(target.targetType) ??
    normalizeBackyMediaBindingTargetType(target.resourceType) ??
    normalizeBackyMediaBindingTargetType(resource.type) ??
    normalizeBackyMediaBindingTargetType(resource.targetType) ??
    normalizeBackyMediaBindingTargetType(resource.resourceType) ??
    (pageId ? "page" : postId ? "post" : "page");
  const targetId = backyMediaBindingText(
    options.targetId,
    body.targetId,
    target.id,
    target.targetId,
    target.resourceId,
    resource.targetId,
    resource.resourceId,
    targetType === "page" ? pageId : postId,
  );
  const action =
    normalizeBackyMediaBindingAction(options.action) ??
    normalizeBackyMediaBindingAction(body.action) ??
    normalizeBackyMediaBindingAction(body.operation) ??
    normalizeBackyMediaBindingAction(body.mode) ??
    (body.unbind === true ||
    body.detach === true ||
    body.remove === true ||
    body.bound === false
      ? "unbind"
      : "bind");
  const usageType = backyMediaBindingText(
    options.usageType,
    body.usageType,
    body.usage,
    body.context,
    body.slot,
    target.usageType,
    target.usage,
  );
  const attachedBy = backyMediaBindingText(
    options.attachedBy,
    body.attachedBy,
    body.actor,
    body.editor,
    body.userId,
    target.attachedBy,
  );
  const requestId = backyMediaBindingText(
    options.requestId,
    body.requestId,
    target.requestId,
  );

  const input: BackyMediaBindingInput = {
    targetType,
    targetId,
    action,
    usageType: usageType || "content",
  };
  if (attachedBy) input.attachedBy = attachedBy;
  if (requestId) input.requestId = requestId;
  return input;
}

const normalizeBackyMediaSignedUrlDisposition = (
  value: unknown,
): BackyMediaSignedUrlDisposition | undefined => {
  const text = backyMediaBindingText(value).toLowerCase();
  if (text === "inline" || text === "preview" || text === "view") {
    return "inline";
  }
  if (text === "attachment" || text === "download") {
    return "attachment";
  }
  return undefined;
};

const normalizeBackyMediaSignedUrlExpiresIn = (
  value: unknown,
): number | undefined => {
  if (typeof value === "number" && Number.isInteger(value)) {
    return value;
  }
  const text = backyMediaBindingText(value);
  if (!text) return undefined;
  const parsed = Number(text);
  return Number.isInteger(parsed) ? parsed : undefined;
};

export function buildBackyMediaSignedUrlInput(
  source: BackyMediaSignedUrlInputSource | undefined | null,
  options: BackyMediaSignedUrlInputBuildOptions = {},
): BackyMediaSignedUrlInput {
  const body = backyMediaBindingRecord(source);
  const access = backyMediaBindingRecord(body.access);
  const delivery = backyMediaBindingRecord(body.delivery);
  const disposition =
    normalizeBackyMediaSignedUrlDisposition(options.disposition) ??
    normalizeBackyMediaSignedUrlDisposition(body.disposition) ??
    normalizeBackyMediaSignedUrlDisposition(body.contentDisposition) ??
    normalizeBackyMediaSignedUrlDisposition(body.deliveryMode) ??
    normalizeBackyMediaSignedUrlDisposition(access.disposition) ??
    normalizeBackyMediaSignedUrlDisposition(delivery.disposition) ??
    (body.download === true || access.download === true
      ? "attachment"
      : body.inline === true || access.inline === true
        ? "inline"
        : undefined);
  const expiresInSeconds = normalizeBackyMediaSignedUrlExpiresIn(
    options.expiresInSeconds ??
      body.expiresInSeconds ??
      body.expiresIn ??
      body.ttlSeconds ??
      body.ttl ??
      body.maxAge ??
      access.expiresInSeconds ??
      access.expiresIn ??
      delivery.expiresInSeconds,
  );
  const requestId = backyMediaBindingText(
    options.requestId,
    body.requestId,
    access.requestId,
    delivery.requestId,
  );

  const input: BackyMediaSignedUrlInput = {};
  if (disposition) input.disposition = disposition;
  if (expiresInSeconds !== undefined) {
    input.expiresInSeconds = expiresInSeconds;
  }
  if (requestId) input.requestId = requestId;
  return input;
}

export interface BackyPageListOptions extends BackyListOptions {
  path?: string;
  slug?: string;
  previewToken?: string;
  siteId?: string;
}

export interface BackyFormListOptions {
  pageId?: string;
  postId?: string;
  active?: boolean;
  requestId?: string;
  siteId?: string;
}

export interface BackyCollectionRecordListOptions extends BackyListOptions {
  slug?: string;
  q?: string;
  fieldKey?: string;
  fieldValue?: string;
  sortBy?: string;
  sortDirection?: "asc" | "desc";
}

export interface BackyFormSubmissionInput {
  values?: Record<string, unknown>;
  fields?: Record<string, unknown>;
  data?: Record<string, unknown>;
  submission?: Record<string, unknown>;
  requestId?: string;
  pageId?: string;
  postId?: string;
  honeypot?: string;
  startedAt?: string | number;
  contactShareOverride?: unknown;
  [fieldKey: string]: unknown;
}

export type BackyFormSubmissionInputSource = Partial<
  BackyFormSubmissionInput
> &
  Record<string, unknown>;

export interface BackyFormSubmissionInputBuildOptions {
  requestId?: string;
  pageId?: string;
  postId?: string;
  honeypot?: string;
  startedAt?: string | number;
  contactShareOverride?: unknown;
  captchaToken?: string;
  rateLimitBypass?: boolean;
  includeUnmappedValues?: boolean;
}

const BACKY_FORM_SUBMISSION_TRANSPORT_KEYS = new Set([
  "values",
  "fields",
  "data",
  "submission",
  "requestId",
  "pageId",
  "postId",
  "honeypot",
  "startedAt",
  "contactShareOverride",
  "captcha",
  "captchaToken",
  "turnstileToken",
  "hcaptchaToken",
  "recaptchaToken",
  "g-recaptcha-response",
  "cf-turnstile-response",
  "rateLimitBypass",
]);

const backyFormRecord = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};

const firstBackyFormRecord = (
  ...values: unknown[]
): Record<string, unknown> | null => {
  for (const value of values) {
    if (value && typeof value === "object" && !Array.isArray(value)) {
      return value as Record<string, unknown>;
    }
  }
  return null;
};

const backyFormText = (...values: unknown[]): string => {
  for (const value of values) {
    if (typeof value === "string") {
      const text = value.trim();
      if (text) return text;
    }
  }
  return "";
};

const normalizeBackyFormAliasKey = (value: string): string =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9_ -]/g, "")
    .replace(/[\s-]+/g, "_")
    .replace(/^_+|_+$/g, "");

const backyFormFieldKeySet = (
  form: BackyFormDefinition | undefined | null,
): Set<string> =>
  new Set(
    (form?.fields || [])
      .map((field) => field.key)
      .filter((key): key is string => typeof key === "string" && key.length > 0),
  );

const backyFormFrontendFieldKeyMap = (
  form: BackyFormDefinition | undefined | null,
): Record<string, string> => {
  const direct =
    form?.frontendFieldKeyMap &&
    typeof form.frontendFieldKeyMap === "object" &&
    !Array.isArray(form.frontendFieldKeyMap)
      ? form.frontendFieldKeyMap
      : {};
  const settings = backyFormRecord(form?.settings);
  const settingsMap = backyFormRecord(settings.frontendFieldKeyMap);
  return {
    ...settingsMap,
    ...direct,
  } as Record<string, string>;
};

const resolveBackyFormFieldKey = (
  rawKey: string,
  fieldKeys: Set<string>,
  frontendFieldKeyMap: Record<string, string>,
): string | undefined => {
  if (fieldKeys.size === 0 || fieldKeys.has(rawKey)) {
    return rawKey;
  }
  const mapped =
    frontendFieldKeyMap[rawKey] ||
    frontendFieldKeyMap[normalizeBackyFormAliasKey(rawKey)];
  return mapped && fieldKeys.has(mapped) ? mapped : undefined;
};

const normalizeBackyFormValues = (
  form: BackyFormDefinition | undefined | null,
  values: Record<string, unknown>,
  includeUnmappedValues: boolean,
): Record<string, unknown> => {
  const fieldKeys = backyFormFieldKeySet(form);
  const frontendFieldKeyMap = backyFormFrontendFieldKeyMap(form);
  return Object.entries(values).reduce<Record<string, unknown>>(
    (normalized, [rawKey, value]) => {
      const key = resolveBackyFormFieldKey(
        rawKey,
        fieldKeys,
        frontendFieldKeyMap,
      );
      if (key) {
        normalized[key] = value;
      } else if (includeUnmappedValues) {
        normalized[rawKey] = value;
      }
      return normalized;
    },
    {},
  );
};

const normalizeBackyFormContactShareOverride = (
  form: BackyFormDefinition | undefined | null,
  value: unknown,
): unknown => {
  const raw = backyFormRecord(value);
  if (Object.keys(raw).length === 0) {
    return undefined;
  }
  const fieldKeys = backyFormFieldKeySet(form);
  const frontendFieldKeyMap = backyFormFrontendFieldKeyMap(form);
  const normalized: Record<string, unknown> = {};
  if (typeof raw.enabled === "boolean") {
    normalized.enabled = raw.enabled;
  }
  if (typeof raw.dedupeByEmail === "boolean") {
    normalized.dedupeByEmail = raw.dedupeByEmail;
  }
  for (const key of ["nameField", "emailField", "phoneField", "notesField"]) {
    const rawField = raw[key];
    if (typeof rawField !== "string") continue;
    const resolved = resolveBackyFormFieldKey(
      rawField,
      fieldKeys,
      frontendFieldKeyMap,
    );
    if (resolved) {
      normalized[key] = resolved;
    }
  }
  return Object.keys(normalized).length > 0 ? normalized : undefined;
};

const backyFormCaptchaToken = (
  source: Record<string, unknown>,
  options: BackyFormSubmissionInputBuildOptions,
): string => {
  const captcha = backyFormRecord(source.captcha);
  return backyFormText(
    options.captchaToken,
    source.captchaToken,
    source.turnstileToken,
    source.hcaptchaToken,
    source.recaptchaToken,
    source["g-recaptcha-response"],
    source["cf-turnstile-response"],
    captcha.token,
    captcha.response,
  );
};

export function buildBackyFormSubmissionInput(
  form: BackyFormDefinition | undefined | null,
  source: BackyFormSubmissionInputSource | undefined | null,
  options: BackyFormSubmissionInputBuildOptions = {},
): BackyFormSubmissionInput {
  const body = backyFormRecord(source);
  const valuesCandidate = firstBackyFormRecord(
    body.values,
    body.fields,
    body.data,
    body.submission,
  );
  const directValues =
    valuesCandidate
      ? valuesCandidate
      : Object.entries(body).reduce<Record<string, unknown>>(
          (values, [key, value]) => {
            if (!BACKY_FORM_SUBMISSION_TRANSPORT_KEYS.has(key)) {
              values[key] = value;
            }
            return values;
          },
          {},
        );
  const input: BackyFormSubmissionInput = {
    values: normalizeBackyFormValues(
      form,
      directValues,
      options.includeUnmappedValues === true,
    ),
  };
  const requestId = backyFormText(options.requestId, body.requestId);
  const pageId = backyFormText(options.pageId, body.pageId);
  const postId = backyFormText(options.postId, body.postId);
  const honeypot = backyFormText(options.honeypot, body.honeypot);
  const captchaToken = backyFormCaptchaToken(body, options);
  const startedAt = options.startedAt ?? body.startedAt;
  const contactShareOverride = normalizeBackyFormContactShareOverride(
    form,
    options.contactShareOverride ?? body.contactShareOverride,
  );
  const rateLimitBypass =
    typeof options.rateLimitBypass === "boolean"
      ? options.rateLimitBypass
      : typeof body.rateLimitBypass === "boolean"
        ? body.rateLimitBypass
        : undefined;

  if (requestId) input.requestId = requestId;
  if (pageId) input.pageId = pageId;
  if (postId) input.postId = postId;
  if (honeypot) input.honeypot = honeypot;
  if (typeof startedAt === "string" || typeof startedAt === "number") {
    input.startedAt = startedAt;
  }
  if (contactShareOverride) {
    input.contactShareOverride = contactShareOverride;
  }
  if (captchaToken) {
    input.captchaToken = captchaToken;
  }
  if (typeof rateLimitBypass === "boolean") {
    input.rateLimitBypass = rateLimitBypass;
  }

  return input;
}

export interface BackyFormSubmissionValidationDetail {
  field: string;
  code: string;
  message: string;
  label?: string;
}

export interface BackyCommentInput {
  content?: string;
  body?: string;
  comment?: string;
  message?: string;
  text?: string;
  authorName?: string;
  name?: string;
  authorEmail?: string;
  email?: string;
  authorWebsite?: string;
  website?: string;
  url?: string;
  requestId?: string;
  parentId?: string;
  replyToId?: string;
  threadId?: string;
  commentThreadId?: string;
  userId?: string;
  commentUserId?: string;
  honeypot?: string;
  startedAt?: string | number;
  captchaToken?: string;
  captchaResponse?: string;
  turnstileToken?: string;
  hcaptchaToken?: string;
  recaptchaToken?: string;
  moderationMode?: "manual" | "auto-approve";
  rateLimitBypass?: boolean;
  [key: string]: unknown;
}

export type BackyCommentInputSource = Partial<BackyCommentInput> &
  Record<string, unknown>;

export interface BackyCommentInputBuildOptions {
  requestId?: string;
  parentId?: string;
  commentThreadId?: string;
  userId?: string;
  honeypot?: string;
  startedAt?: string | number;
  captchaToken?: string;
  moderationMode?: "manual" | "auto-approve";
  rateLimitBypass?: boolean;
}

const backyCommentRecord = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};

const backyCommentText = (...values: unknown[]): string => {
  for (const value of values) {
    if (typeof value === "string") {
      const text = value.trim();
      if (text) return text;
    }
  }
  return "";
};

const normalizeBackyCommentModerationMode = (
  value: unknown,
): BackyCommentInput["moderationMode"] =>
  value === "manual" || value === "auto-approve" ? value : undefined;

export function buildBackyCommentInput(
  source: BackyCommentInputSource | undefined | null,
  options: BackyCommentInputBuildOptions = {},
): BackyCommentInput {
  const body = backyCommentRecord(source);
  const author = backyCommentRecord(body.author);
  const user = backyCommentRecord(body.user);
  const captcha = backyCommentRecord(body.captcha);
  const content = backyCommentText(
    body.content,
    body.body,
    body.comment,
    body.message,
    body.text,
  );
  const authorName = backyCommentText(
    body.authorName,
    body.name,
    author.name,
    user.name,
  );
  const authorEmail = backyCommentText(
    body.authorEmail,
    body.email,
    author.email,
    user.email,
  ).toLowerCase();
  const authorWebsite = backyCommentText(
    body.authorWebsite,
    body.website,
    body.url,
    author.website,
    author.url,
  );
  const requestId = backyCommentText(options.requestId, body.requestId);
  const parentId = backyCommentText(
    options.parentId,
    body.parentId,
    body.replyToId,
  );
  const commentThreadId = backyCommentText(
    options.commentThreadId,
    body.commentThreadId,
    body.threadId,
  );
  const userId = backyCommentText(
    options.userId,
    body.userId,
    body.commentUserId,
    user.id,
  );
  const honeypot = backyCommentText(options.honeypot, body.honeypot);
  const startedAt = options.startedAt ?? body.startedAt;
  const captchaToken = backyCommentText(
    options.captchaToken,
    body.captchaToken,
    body.captchaResponse,
    body.turnstileToken,
    body["cf-turnstile-response"],
    body.hcaptchaToken,
    body["h-captcha-response"],
    body.recaptchaToken,
    body["g-recaptcha-response"],
    captcha.token,
    captcha.response,
  );
  const moderationMode =
    options.moderationMode ??
    normalizeBackyCommentModerationMode(body.moderationMode);
  const rateLimitBypass =
    typeof options.rateLimitBypass === "boolean"
      ? options.rateLimitBypass
      : typeof body.rateLimitBypass === "boolean"
        ? body.rateLimitBypass
        : undefined;

  const input: BackyCommentInput = { content };
  if (authorName) input.authorName = authorName;
  if (authorEmail) input.authorEmail = authorEmail;
  if (authorWebsite) input.authorWebsite = authorWebsite;
  if (requestId) input.requestId = requestId;
  if (parentId) input.parentId = parentId;
  if (commentThreadId) input.commentThreadId = commentThreadId;
  if (userId) input.userId = userId;
  if (honeypot) input.honeypot = honeypot;
  if (typeof startedAt === "string" || typeof startedAt === "number") {
    input.startedAt = startedAt;
  }
  if (captchaToken) input.captchaToken = captchaToken;
  if (moderationMode) input.moderationMode = moderationMode;
  if (typeof rateLimitBypass === "boolean") {
    input.rateLimitBypass = rateLimitBypass;
  }
  return input;
}

export interface BackyCommentReportInput {
  reason: string;
  reportReason?: string;
  category?: string;
  actor?: string;
  reporter?: string;
  reporterEmail?: string;
  email?: string;
  details?: string;
  message?: string;
  note?: string;
  requestId?: string;
  [key: string]: unknown;
}

export type BackyCommentReportInputSource = Partial<BackyCommentReportInput> &
  Record<string, unknown>;

export interface BackyCommentReportInputBuildOptions {
  reason?: string;
  actor?: string;
  details?: string;
  requestId?: string;
}

export function buildBackyCommentReportInput(
  source: BackyCommentReportInputSource | undefined | null,
  options: BackyCommentReportInputBuildOptions = {},
): BackyCommentReportInput {
  const body = backyCommentRecord(source);
  const report = backyCommentRecord(body.report);
  const reason = backyCommentText(
    options.reason,
    body.reason,
    body.reportReason,
    body.category,
    report.reason,
    report.reportReason,
    report.category,
  );
  const actor = backyCommentText(
    options.actor,
    body.actor,
    body.reporter,
    body.reporterEmail,
    body.email,
    report.actor,
    report.reporter,
    report.reporterEmail,
    report.email,
  );
  const details = backyCommentText(
    options.details,
    body.details,
    body.message,
    body.note,
    report.details,
    report.message,
    report.note,
  );
  const requestId = backyCommentText(
    options.requestId,
    body.requestId,
    report.requestId,
  );

  const input: BackyCommentReportInput = { reason };
  if (actor) input.actor = actor;
  if (details) input.details = details;
  if (requestId) input.requestId = requestId;
  return input;
}

export interface BackyCommentListOptions extends BackyListOptions {
  targetType?: "page" | "post";
  targetId?: string;
  status?: "pending" | "approved" | "rejected" | "spam" | "blocked" | "all";
  parentId?: string;
  parentOnly?: boolean;
  commentThreadId?: string;
  requestId?: string;
  q?: string;
  sort?: "newest" | "oldest";
}

export interface BackyCommentBulkUpdateInput {
  commentIds?: string[];
  ids?: string[];
  status?: "pending" | "approved" | "rejected" | "spam" | "blocked";
  action?: "clearReports";
  clearReports?: boolean;
  reviewedBy?: string;
  actor?: string;
  rejectionReason?: string;
  blockReason?: string;
  requestId?: string;
}

export interface BackyCommentBlocklistEntry {
  id: string;
  siteId?: string;
  type: "email" | "ip";
  value: string;
  reason: string;
  actor?: string;
  requestId?: string;
  createdAt?: string;
  [key: string]: unknown;
}

export interface BackyCommentBlocklistOptions extends BackyListOptions {
  type?: "email" | "ip" | "all";
  q?: string;
  requestId?: string;
}

export interface BackyEventListOptions extends BackyListOptions {
  kind?: string;
}

export type BackyInteractiveRuntimeEventType =
  | "ready"
  | "init"
  | "resize"
  | "error"
  | "fallback"
  | "blocked";

export type BackyInteractiveRuntimeEventWireType =
  | BackyInteractiveRuntimeEventType
  | `backy.interactive-component.${BackyInteractiveRuntimeEventType}`;

export interface BackyInteractiveRuntimeEventInput {
  type?: BackyInteractiveRuntimeEventWireType;
  componentKey: string;
  version?: string;
  elementId?: string;
  pageId?: string;
  postId?: string;
  message: string;
  requestId?: string;
  [key: string]: unknown;
}

export type BackyInteractiveRuntimeEventInputSource = Partial<
  BackyInteractiveRuntimeEventInput
> &
  Record<string, unknown>;

export interface BackyInteractiveRuntimeEventInputBuildOptions {
  type?: BackyInteractiveRuntimeEventWireType;
  componentKey?: string;
  version?: string;
  elementId?: string;
  pageId?: string;
  postId?: string;
  message?: string;
  requestId?: string;
}

const BACKY_INTERACTIVE_RUNTIME_EVENT_TYPES = new Set<BackyInteractiveRuntimeEventType>([
  "ready",
  "init",
  "resize",
  "error",
  "fallback",
  "blocked",
]);

const BACKY_INTERACTIVE_RUNTIME_EVENT_PREFIX =
  "backy.interactive-component.";

const backyInteractiveRuntimeRecord = (
  value: unknown,
): Record<string, unknown> =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};

const backyInteractiveRuntimeText = (...values: unknown[]): string => {
  for (const value of values) {
    if (typeof value === "string") {
      const text = value.trim();
      if (text) return text;
    }
  }
  return "";
};

const normalizeBackyInteractiveRuntimeEventType = (
  value: unknown,
): BackyInteractiveRuntimeEventType | undefined => {
  const text = backyInteractiveRuntimeText(value);
  const raw = text.startsWith(BACKY_INTERACTIVE_RUNTIME_EVENT_PREFIX)
    ? text.slice(BACKY_INTERACTIVE_RUNTIME_EVENT_PREFIX.length)
    : text;
  return BACKY_INTERACTIVE_RUNTIME_EVENT_TYPES.has(
    raw as BackyInteractiveRuntimeEventType,
  )
    ? (raw as BackyInteractiveRuntimeEventType)
    : undefined;
};

export function buildBackyInteractiveRuntimeEventInput(
  source: BackyInteractiveRuntimeEventInputSource | undefined | null,
  options: BackyInteractiveRuntimeEventInputBuildOptions = {},
): BackyInteractiveRuntimeEventInput {
  const body = backyInteractiveRuntimeRecord(source);
  const data = backyInteractiveRuntimeRecord(body.data);
  const component = backyInteractiveRuntimeRecord(body.component);
  const dataComponent = backyInteractiveRuntimeRecord(data.component);
  const error = backyInteractiveRuntimeRecord(body.error);
  const dataError = backyInteractiveRuntimeRecord(data.error);
  const type =
    normalizeBackyInteractiveRuntimeEventType(options.type) ??
    normalizeBackyInteractiveRuntimeEventType(body.type) ??
    normalizeBackyInteractiveRuntimeEventType(data.type);
  const componentKey = backyInteractiveRuntimeText(
    options.componentKey,
    body.componentKey,
    body.key,
    component.componentKey,
    component.key,
    data.componentKey,
    data.key,
    dataComponent.componentKey,
    dataComponent.key,
  );
  const version = backyInteractiveRuntimeText(
    options.version,
    body.version,
    body.componentVersion,
    component.version,
    data.version,
    data.componentVersion,
    dataComponent.version,
  );
  const elementId = backyInteractiveRuntimeText(
    options.elementId,
    body.elementId,
    body.elementID,
    data.elementId,
    data.elementID,
  );
  const pageId = backyInteractiveRuntimeText(
    options.pageId,
    body.pageId,
    data.pageId,
  );
  const postId = backyInteractiveRuntimeText(
    options.postId,
    body.postId,
    body.blogPostId,
    data.postId,
    data.blogPostId,
  );
  const requestId = backyInteractiveRuntimeText(
    options.requestId,
    body.requestId,
    data.requestId,
  );
  const message = backyInteractiveRuntimeText(
    options.message,
    body.message,
    data.message,
    body.reason,
    data.reason,
    body.detail,
    data.detail,
    body.error,
    data.error,
    error.message,
    dataError.message,
  );

  const input: BackyInteractiveRuntimeEventInput = {
    componentKey,
    message,
  };
  if (type) input.type = type;
  if (version) input.version = version;
  if (elementId) input.elementId = elementId;
  if (pageId) input.pageId = pageId;
  if (postId) input.postId = postId;
  if (requestId) input.requestId = requestId;
  return input;
}

export type BackyResolvedRouteType =
  | "page"
  | "post"
  | "dynamicList"
  | "dynamicItem"
  | "redirect"
  | "gone"
  | "notFound";

export interface BackyResolvedRouteBase<
  TRouteType extends BackyResolvedRouteType = BackyResolvedRouteType,
> {
  type: TRouteType;
  path: string;
  status?: string;
  canonical?: string;
  params?: Record<string, string>;
  resource?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface BackyDynamicListRoute extends BackyResolvedRouteBase<"dynamicList"> {
  resource?: Record<string, unknown> & {
    collectionId?: string;
    collectionSlug?: string;
    collectionName?: string;
    recordsUrl?: string;
    renderUrl?: string;
    frontendDesign?: BackyFrontendDesignProvenance;
  };
}

export interface BackyDynamicItemRoute extends BackyResolvedRouteBase<"dynamicItem"> {
  resource?: Record<string, unknown> & {
    collectionId?: string;
    collectionSlug?: string;
    collectionName?: string;
    apiUrl?: string;
    renderUrl?: string;
    frontendDesign?: BackyFrontendDesignProvenance;
    collectionFrontendDesign?: BackyFrontendDesignProvenance;
  };
}

export type BackyRenderableRoute =
  | BackyResolvedRouteBase<"page" | "post" | "notFound">
  | BackyDynamicListRoute
  | BackyDynamicItemRoute;

export interface BackyRedirectRoute extends BackyResolvedRouteBase<"redirect"> {
  type: "redirect";
  status: "published";
  canonical: string;
  resource: {
    id: string;
    kind: "redirect";
    from: string;
    to: string;
    statusCode: 301 | 302 | 307 | 308;
    [key: string]: unknown;
  };
}

export interface BackyGoneRoute extends BackyResolvedRouteBase<"gone"> {
  type: "gone";
  status: "archived";
  resource: {
    id: string;
    kind: "gone";
    from: string;
    statusCode: 410;
    [key: string]: unknown;
  };
}

export type BackyResolvedRoute =
  | BackyRenderableRoute
  | BackyRedirectRoute
  | BackyGoneRoute;

export interface BackyRouteResolve {
  site: BackySiteSummary;
  route: BackyResolvedRoute;
  navigation?: {
    primary?: BackyNavigationItem[];
    footer?: BackyNavigationItem[];
    [key: string]: unknown;
  };
}

export type BackyRouteResolveResult =
  | BackyEnvelope<BackyRouteResolve>
  | (BackyErrorEnvelope & {
      success: false;
      data: BackyRouteResolve & { route: BackyGoneRoute };
    });

export interface BackySeoRoute {
  type: "page" | "post" | "dynamicList" | "dynamicItem" | string;
  id: string;
  title: string;
  description?: string;
  path: string;
  canonical: string;
  canonicalUrl?: string;
  status?: string;
  updatedAt?: string;
  priority?: number;
  changeFrequency?: string;
  robots?: {
    index?: boolean;
    follow?: boolean;
  };
  openGraph?: Record<string, unknown>;
  keywords?: string[];
  jsonLd?: Array<Record<string, unknown>>;
  frontendDesign?: BackyFrontendDesignProvenance;
  collectionFrontendDesign?: BackyFrontendDesignProvenance;
  [key: string]: unknown;
}

export interface BackySeoDiscovery {
  site: BackySiteSummary;
  defaults: {
    title?: string;
    description?: string;
    jsonLd?: Array<Record<string, unknown>>;
    robots?: {
      index?: boolean;
      follow?: boolean;
    };
    [key: string]: unknown;
  };
  routes: BackySeoRoute[];
  sitemap: {
    url: string;
    publicUrl?: string;
    count?: number;
    enabled?: boolean;
    includeDynamicRoutes?: boolean;
    [key: string]: unknown;
  };
  robots: {
    url: string;
    publicUrl?: string;
    index?: boolean;
    follow?: boolean;
    extraRules?: string;
    [key: string]: unknown;
  };
}

export interface BackyManifestAdminDiscovery {
  auth: {
    authenticated: boolean;
    mode: "anonymous" | "session" | "api-key";
    user?: {
      id: string;
      role: string;
      status: string;
      [key: string]: unknown;
    };
    [key: string]: unknown;
  };
  summary: {
    allowed: number;
    total: number;
    blockedByStatus: boolean;
    [key: string]: unknown;
  };
  capabilities: Record<string, boolean>;
  permissions: Record<string, boolean>;
  endpoints: Record<string, string>;
  [key: string]: unknown;
}

export type BackyLocaleStrategy = "none" | "path-prefix" | "domain";

export interface BackyManifestDeliveryDiscovery {
  canonicalBaseUrl: string;
  managedBaseUrl: string;
  primaryDomain: string;
  customDomain?: string | null;
  defaultLocale: string;
  localeStrategy: BackyLocaleStrategy;
  locales: Array<{
    code: string;
    label?: string;
    default: boolean;
    direction: "ltr" | "rtl";
    pathPrefix: string;
    domain?: string | null;
    [key: string]: unknown;
  }>;
  domains: Array<{
    type: string;
    host: string;
    baseUrl: string;
    primary: boolean;
    verified: boolean;
    verificationStatus?: string;
    source?: string;
    [key: string]: unknown;
  }>;
  urls: {
    home?: string;
    sitemap?: string;
    robots?: string;
    [key: string]: string | undefined;
  };
  [key: string]: unknown;
}

export interface BackyManifestRouteFrontendDesign extends BackyFrontendDesignProvenance {}

export interface BackyManifestRoutePattern {
  type: string;
  pattern: string;
  resolveUrl: string;
  renderUrl: string;
  frontendDesign?: BackyManifestRouteFrontendDesign;
  [key: string]: unknown;
}

export interface BackyManifestLocalizedRoutePattern extends BackyManifestRoutePattern {
  locale: string;
  basePattern: string;
}

export interface BackyManifestLocalizedRoutePatternGroup {
  locale: string;
  default: boolean;
  pathPrefix: string;
  domain?: string | null;
  patterns: BackyManifestLocalizedRoutePattern[];
  [key: string]: unknown;
}

export interface BackyManifestRedirectRule {
  id?: string;
  type: "redirect" | "gone";
  from: string;
  to?: string | null;
  statusCode: 301 | 302 | 307 | 308 | 410;
  resolveUrl: string;
  [key: string]: unknown;
}

export interface BackyManifestRedirectRules {
  count: number;
  items: BackyManifestRedirectRule[];
  [key: string]: unknown;
}

export interface BackyManifestRoutingModule {
  supportedRouteTypes?: BackyResolvedRouteType[];
  redirectRules?: BackyManifestRedirectRules;
  localizedRoutePatterns?: BackyManifestLocalizedRoutePatternGroup[];
  [key: string]: unknown;
}

export interface BackyManifestPageResource extends BackyPageResource {
  slug: string;
  path: string;
  renderUrl: string;
  frontendDesign?: BackyManifestRouteFrontendDesign;
}

export interface BackyManifestPagesRuntimeModule {
  schemaVersion: "backy.pages-discovery.v1";
  count: number;
  publishedCount: number;
  scheduledCount: number;
  homepagePath: string | null;
  paths: string[];
  endpoints: {
    list: string;
    detail: string;
    resolve: string;
    render: string;
    liveManage: string;
    [key: string]: unknown;
  };
  methods: {
    list: "GET";
    detail: "GET";
    resolve: "GET";
    render: "GET";
    liveManageRead: "GET";
    liveManageUpdate: "PATCH";
    [key: string]: unknown;
  };
  capabilities: {
    publicList: boolean;
    publicDetail: boolean;
    renderPayload: boolean;
    routeResolve: boolean;
    seoMetadata: boolean;
    frontendDesignProvenance: boolean;
    previewTokens: boolean;
    liveManagement: boolean;
    conditionalRequests: boolean;
    cacheablePages: boolean;
    [key: string]: unknown;
  };
  cache: {
    list: string;
    detail: string;
    previewDetail: string;
    render: string;
    [key: string]: unknown;
  };
  privacy: {
    publicReadsOnlyIncludePublishedOrPastScheduledPages: boolean;
    draftPreviewRequiresToken: boolean;
    previewTokenIsNeverReturned: boolean;
    [key: string]: unknown;
  };
  filters: {
    queryParams: string[];
    maxLimit: number;
    [key: string]: unknown;
  };
  schemas: {
    page: "backy.page.v1";
    renderPayload: "backy.render-payload.v1";
    seo: "backy.seo-route.v1";
    notFound: "PAGE_NOT_FOUND";
    invalidLimit: "INVALID_PAGE_LIMIT";
    invalidOffset: "INVALID_PAGE_OFFSET";
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

export interface BackyManifestPostResource extends BackyPostResource {
  slug: string;
  path: string;
  renderUrl: string;
  frontendDesign?: BackyManifestRouteFrontendDesign;
}

export interface BackyManifestBlogTaxonomy {
  id: string;
  name: string;
  slug: string;
  postCount: number;
  [key: string]: unknown;
}

export interface BackyManifestBlogCategory extends BackyBlogCategory {
  id: string;
  name: string;
  slug: string;
  postCount: number;
}

export interface BackyManifestBlogTag extends BackyBlogTag {
  id: string;
  name: string;
  slug: string;
  postCount: number;
}

export interface BackyManifestBlogAuthor extends BackyBlogAuthor {
  id: string;
  name: string;
  slug: string;
  role?: string;
  status?: string;
  postCount: number;
  [key: string]: unknown;
}

export interface BackyManifestBlogModule {
  count: number;
  rssUrl?: string;
  hostedRssPath?: string;
  items?: BackyManifestPostResource[];
  feeds?: BackyBlogFeedDiscovery[];
  categories: BackyManifestBlogCategory[];
  tags: BackyManifestBlogTag[];
  authors: BackyManifestBlogAuthor[];
  [key: string]: unknown;
}

export interface BackyManifestBlogRuntimeModule {
  schemaVersion: "backy.blog-discovery.v1";
  count: number;
  publishedCount: number;
  scheduledCount: number;
  categoryCount: number;
  tagCount: number;
  authorCount: number;
  feedCount: number;
  paths: string[];
  endpoints: {
    list: string;
    detail: string;
    liveManage: string;
    rss: string;
    categories: string;
    tags: string;
    authors: string;
    resolve: string;
    render: string;
    [key: string]: unknown;
  };
  methods: {
    list: "GET";
    detail: "GET";
    liveManageRead: "GET";
    liveManageUpdate: "PATCH";
    rss: "GET";
    categories: "GET";
    tags: "GET";
    authors: "GET";
    resolve: "GET";
    render: "GET";
    [key: string]: unknown;
  };
  capabilities: {
    publicList: boolean;
    publicDetail: boolean;
    taxonomyFilters: boolean;
    archiveFilters: boolean;
    searchFilters: boolean;
    rssFeed: boolean;
    renderPayload: boolean;
    routeResolve: boolean;
    frontendDesignProvenance: boolean;
    previewTokens: boolean;
    liveManagement: boolean;
    conditionalRequests: boolean;
    cacheablePosts: boolean;
    [key: string]: unknown;
  };
  cache: {
    list: string;
    detail: string;
    previewDetail: string;
    taxonomy: string;
    rss: string;
    render: string;
    [key: string]: unknown;
  };
  privacy: {
    publicReadsOnlyIncludePublishedOrPastScheduledPosts: boolean;
    draftPreviewRequiresToken: boolean;
    previewTokenIsNeverReturned: boolean;
    [key: string]: unknown;
  };
  filters: {
    queryParams: string[];
    maxLimit: number;
    statuses: string[];
    [key: string]: unknown;
  };
  schemas: {
    post: "backy.blog-post.v1";
    feed: "backy.blog-feed.v1";
    renderPayload: "backy.render-payload.v1";
    notFound: "POST_NOT_FOUND";
    invalidLimit: "INVALID_BLOG_LIMIT";
    invalidOffset: "INVALID_BLOG_OFFSET";
    invalidStatus: "INVALID_BLOG_STATUS";
    invalidArchiveYear: "INVALID_BLOG_ARCHIVE_YEAR";
    invalidArchiveMonth: "INVALID_BLOG_ARCHIVE_MONTH";
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

export interface BackyManifestReusableSection {
  id: string;
  slug: string;
  name: string;
  description?: string | null;
  category?: string;
  tags?: string[];
  detailUrl: string;
  canvasSize?: Record<string, unknown>;
  elementCount: number;
  frontendDesign?: BackyManifestRouteFrontendDesign;
  [key: string]: unknown;
}

export interface BackyManifestReusableSectionsModule {
  count: number;
  listUrl: string;
  categories: string[];
  tags: string[];
  items: BackyManifestReusableSection[];
  [key: string]: unknown;
}

export interface BackyManifestReusableSectionsRuntimeModule {
  schemaVersion: "backy.reusable-sections-discovery.v1";
  count: number;
  activeCount: number;
  categories: string[];
  tags: string[];
  elementCount: number;
  endpoints: {
    list: string;
    detail: string;
    [key: string]: unknown;
  };
  methods: {
    list: "GET";
    detail: "GET";
    [key: string]: unknown;
  };
  capabilities: {
    publicSections: boolean;
    activeOnlyPublicReads: boolean;
    categoryFilters: boolean;
    tagFilters: boolean;
    searchFilters: boolean;
    canvasContent: boolean;
    frontendDesignTemplates: boolean;
    conditionalRequests: boolean;
    cacheableSections: boolean;
    [key: string]: unknown;
  };
  cache: {
    list: string;
    detail: string;
    [key: string]: unknown;
  };
  privacy: {
    publicReadsOnlyIncludeActiveSections: boolean;
    sectionContentIsPublicTemplateData: boolean;
    adminMetadataIsNotRequiredForRendering: boolean;
    [key: string]: unknown;
  };
  filters: {
    queryParams: string[];
    categories: string[];
    tags: string[];
    [key: string]: unknown;
  };
  schemas: {
    section: "backy.reusable-section.v1";
    content: "backy.content.v1";
    notFound: "REUSABLE_SECTION_NOT_FOUND";
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

export interface BackyManifestFormDefinition extends BackyFormDefinition {
  id: string;
  active: boolean;
  fields: Array<Record<string, unknown>>;
  submitUrl: string;
  detailUrl?: string;
  definitionUrl?: string;
  submissionsUrl?: string;
  contactsUrl?: string;
  frontendDesign?: BackyManifestRouteFrontendDesign;
}

export interface BackyManifestFormsRuntimeModule {
  schemaVersion: "backy.forms-discovery.v1";
  count: number;
  activeCount: number;
  collectionTargetCount: number;
  moderationModes: string[];
  endpoints: {
    list: string;
    detail: string;
    definition: string;
    submit: string;
    submissions: string;
    contacts: string;
    [key: string]: unknown;
  };
  methods: {
    list: "GET";
    detail: "GET";
    definition: "GET";
    submit: "POST";
    reviewSubmission: "PATCH";
    updateContact: "PATCH";
    [key: string]: unknown;
  };
  capabilities: {
    publicDefinitions: boolean;
    publicSubmissions: boolean;
    fieldValidation: boolean;
    collectionWriteTargets: boolean;
    moderation: boolean;
    contactShare: boolean;
    conditionalRequests: boolean;
    cacheableDefinitions: boolean;
    privateSubmissionData: boolean;
    [key: string]: unknown;
  };
  cache: {
    list: string;
    definition: string;
    detail: string;
    submissions: string;
    contacts: string;
    [key: string]: unknown;
  };
  privacy: {
    submissionPayloadsContainVisitorData: boolean;
    publicDefinitionExcludesSubmissions: boolean;
    contactPayloadsArePrivate: boolean;
    [key: string]: unknown;
  };
  schemas: {
    definition: "backy.form-definition.v1";
    validationError: "FORM_VALIDATION_ERROR";
    collectionRecordLink: "backy.form-collection-record-link.v1";
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

export interface BackyManifestMediaModule {
  schemaVersion: "backy.media-discovery.v1";
  count: number;
  publicCount: number;
  fontCount: number;
  types: string[];
  fileCategories: Array<{
    type: "image" | "video" | "audio" | "document" | "font" | "other";
    label: string;
    accepts: string[];
    aliases?: string[];
    pickerUse: "visual-media" | "embedded-media" | "downloadable-document" | "downloadable-file" | "typography";
    delivery: "public-or-signed-file" | "font-manifest-or-file";
    transformEligible: boolean;
    responsiveEligible: boolean;
    fontManifestEligible: boolean;
    [key: string]: unknown;
  }>;
  listUrl: string;
  endpoints: {
    list: string;
    folders: string;
    fonts: string;
    detail: string;
    file: string;
    transform: string;
    [key: string]: unknown;
  };
  capabilities: {
    publicAssets: boolean;
    publicFolderDiscovery: boolean;
    signedPrivateFiles: boolean;
    responsiveImages: boolean;
    imageTransforms: boolean;
    fontManifest: boolean;
    references: boolean;
    editableMetadata: boolean;
    [key: string]: unknown;
  };
  filters: {
    types: string[];
    typeAliases: {
      file: "document";
      [key: string]: unknown;
    };
    visibility: Array<"public" | "private">;
    scopes: Array<"global" | "page" | "post">;
    queryParams: string[];
    maxLimit: 100;
    aliases: {
      q: "search";
      folder: "folderId";
      blogId: "postId";
      fileType: "document";
      [key: string]: unknown;
    };
    [key: string]: unknown;
  };
  methods: {
    list: "GET";
    folders: "GET";
    fonts: "GET";
    detail: "GET";
    file: "GET";
    transform: "GET";
    [key: string]: unknown;
  };
  cache: {
    list: "public-discovery";
    folders: "public-discovery";
    fonts: "public-discovery";
    detail: "public-discovery";
    file: "public-or-signed";
    transform: "public-redirect";
    [key: string]: unknown;
  };
  deliveryPolicy: {
    publicFiles: "direct-file-url";
    privateFiles: "signed-url-required";
    signedUrlEndpoint: string;
    signedUrlMethod: "POST";
    signedUrlPermission: "media.view";
    acceptedDispositions: Array<"inline" | "attachment">;
    defaultDisposition: "inline";
    maxSignedUrlSeconds: 3600;
    transformableTypes: Array<"image">;
    responsiveTypes: Array<"image">;
    fontManifestTypes: Array<"font">;
    downloadableTypes: Array<"document" | "other" | "audio" | "video">;
    secretHandling: string;
    [key: string]: unknown;
  };
  schemas: {
    list: "backy.media-discovery.v1";
    fileCategories: "backy.media-file-categories.v1";
    folders: "backy.media-folders.v1";
    fonts: "backy.font-manifest.v1";
    references: "backy.media.references.v1";
    editableMetadata: "backy.media.editable-metadata.v1";
    notFound: "MEDIA_NOT_FOUND";
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

export interface BackyManifestThemeModule {
  schemaVersion: "backy.theme-discovery.v1";
  tokenSchemaVersion: "backy.theme.v1";
  tokens: BackyThemeTokens & { schemaVersion: "backy.theme.v1" };
  cssVariables: Record<string, string>;
  selectors: {
    root: string;
    scoped: string;
    [key: string]: unknown;
  };
  editableFields: string[];
  capabilities: {
    cssVariables: boolean;
    customCss: boolean;
    typographyFamilies: boolean;
    spacingScale: boolean;
    liveEditable: boolean;
    frontendDesignOverrides: boolean;
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

export interface BackyManifestLiveManagementModule {
  schemaVersion: "backy.live-management.v1";
  enabled: boolean;
  endpoints: {
    page: string;
    post: string;
    render: string;
    editableMapSchema: string;
    [key: string]: unknown;
  };
  methods: {
    read: "GET";
    update: "PATCH";
    [key: string]: unknown;
  };
  auth: {
    modes: Array<"session" | "api-key">;
    headers: string[];
    requiredPermissions: {
      read: "pages.view";
      update: "pages.edit";
      [key: string]: unknown;
    };
    siteScope: boolean;
    [key: string]: unknown;
  };
  capabilities: {
    pageMetadata: boolean;
    postMetadata: boolean;
    contentDocument: boolean;
    canvasElements: boolean;
    editableMap: boolean;
    optimisticConcurrency: boolean;
    cacheInvalidation: boolean;
    auditTrail: boolean;
    webhookDelivery: boolean;
    [key: string]: unknown;
  };
  editableTargets: string[];
  updateBody: {
    expectedUpdatedAt: string;
    content: string;
    [key: string]: unknown;
  };
  errors: {
    conflict: "PAGE_VERSION_CONFLICT";
    postConflict: "BLOG_VERSION_CONFLICT";
    forbidden: "FORBIDDEN_LIVE_MANAGE_SITE_SCOPE";
    postForbidden: "FORBIDDEN_LIVE_MANAGE_BLOG_SCOPE";
    validation: "VALIDATION_ERROR";
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

export interface BackyManifestCommentsModule {
  schemaVersion: "backy.comments-discovery.v1";
  enabled: boolean;
  moderationMode: "manual" | "auto-approve";
  allowGuests: boolean;
  allowReplies: boolean;
  defaultSort: "newest" | "oldest";
  statuses: Array<"pending" | "approved" | "rejected" | "spam" | "blocked">;
  publicListStatus: "approved";
  reportReasons: string[];
  endpoints: {
    list: string;
    pageComments: string;
    pageComment: string;
    blogComments: string;
    blogComment: string;
    reportReasons: string;
    report: string;
    blocklist: string;
    [key: string]: unknown;
  };
  reporting: {
    enabled: boolean;
    reasons: string[];
    reportUrlTemplate: string;
    [key: string]: unknown;
  };
  spamProtection: {
    captchaEnabled: boolean;
    captchaProvider: "turnstile" | "hcaptcha" | "recaptcha" | "mock";
    blockedTermCount: number;
    honeypotField: string;
    timingField: string;
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

export interface BackyFrontendDatabaseCertification {
  schemaVersion: "backy.frontend-database-certification.v1";
  status: "external-database-gate";
  requiredFor: "production-custom-frontends";
  gate: {
    command: "npm run ci:sdk-postgres-smoke";
    workflow: ".github/workflows/sdk-postgres-smoke.yml";
    localPreflight: "npm run test:sdk-postgres-preflight-contract";
    typeContract: "npm run test:frontend-contract-types";
    [key: string]: unknown;
  };
  environment: {
    dataMode: "database";
    secretAliases: Array<"BACKY_DATABASE_URL" | "DATABASE_URL" | string>;
    requiredConfirmationEnv: "BACKY_DATABASE_DISPOSABLE_CONFIRMED=true";
    targetGuards: string[];
    [key: string]: unknown;
  };
  requires: string[];
  coverage: string[];
  scenarioEvidence: {
    schemaVersion: "backy.frontend-database-certification-evidence.v1";
    status: "ready" | "attention";
    requiredGate: "BACKY_DATABASE_DISPOSABLE_CONFIRMED=true npm run ci:sdk-postgres-smoke";
    coverage: {
      covered: number;
      total: number;
      missing: string[];
      [key: string]: unknown;
    };
    scenarios: Array<{
      key: string;
      label: string;
      status: "covered" | "missing";
      evidenceCount: number;
      expectedEvidence: string[];
      nextAction: string;
      [key: string]: unknown;
    }>;
    secretHandling: string;
    [key: string]: unknown;
  };
  operatorCommandTemplate: {
    command: string;
    envTemplate: string;
    envTemplateSchemaVersion: "backy.frontend-database-certification-env-template.v1";
    databaseUrlAliases: Array<"BACKY_DATABASE_URL" | "DATABASE_URL" | string>;
    requiredInputs: string[];
    targetGuards: string[];
    secretHandling: string;
    [key: string]: unknown;
  };
  operatorEnvTemplate: {
    schemaVersion: "backy.frontend-database-certification-env-template.v1";
    format: "shell-env";
    fileName: ".env.backy-frontend-database-certification";
    body: string;
    secretHandling: string;
    [key: string]: unknown;
  };
  runtime: {
    dataMode: string;
    databaseType: string;
    databaseUrlConfigured: boolean;
    databaseUrlAlias: "BACKY_DATABASE_URL" | "DATABASE_URL" | null | string;
    disposableConfirmed: boolean;
    expectedHostConfigured: boolean;
    expectedDatabaseConfigured: boolean;
    readyForCertification: boolean;
    missing: string[];
    secretHandling: string;
    [key: string]: unknown;
  };
  secretHandling: string;
  [key: string]: unknown;
}

export interface BackySettingsProviderCertification {
  schemaVersion: "backy.settings-provider-certification-handoff.v1";
  status: "external-live-provider-gate" | string;
  settingsGate?: string;
  commerceGate?: string;
  localPreflight?: string;
  releasePreflight?: string;
  secretHandling?: string;
  runtimeEvidence?: Record<string, unknown>;
  scenarioEvidence?: {
    schemaVersion: "backy.settings-provider-certification-evidence.v1" | string;
    status?: "ready" | "attention" | "blocked" | string;
    requiredGate?: string;
    coverage?: {
      covered?: number;
      total?: number;
      missing?: string[];
      [key: string]: unknown;
    };
    scenarios?: Array<Record<string, unknown>>;
    [key: string]: unknown;
  };
  operatorCommandTemplate?: Record<string, unknown>;
  operatorEnvTemplate?: {
    schemaVersion: "backy.settings-provider-certification-env-template.v1" | string;
    format?: "shell-env" | string;
    fileName?: string;
    body?: string;
    secretHandling?: string;
    [key: string]: unknown;
  };
  groups?: Array<Record<string, unknown>>;
  [key: string]: unknown;
}

export interface BackyAdminSettings {
  schemaVersion: "backy.admin-settings.v1" | string;
  scope?: {
    workspaceSettingsScope?: "global" | string;
    siteSettingsScope?: "site" | string;
    siteSettingsEndpointTemplate?: string;
    [key: string]: unknown;
  };
  endpoints?: {
    workspaceSettings?: string;
    siteSettings?: string;
    [key: string]: unknown;
  };
  deliveryMode?: "managed-hosting" | "custom-frontend" | string;
  apiKeys?: {
    publicApiKey?: string;
    adminApiKey?: string;
    [key: string]: unknown;
  };
  storage?: Record<string, unknown>;
  auth?: Record<string, unknown>;
  integrations?: Record<string, unknown>;
  runtimeStorage?: Record<string, unknown>;
  runtimeDatabase?: Record<string, unknown>;
  runtimeSupabase?: Record<string, unknown>;
  runtimeMediaScanner?: Record<string, unknown>;
  runtimeVercel?: Record<string, unknown>;
  runtimeNotifications?: Record<string, unknown>;
  runtimeCommerce?: Record<string, unknown>;
  runtimeInteractiveComponents?: Record<string, unknown>;
  runtimePublicApi?: Record<string, unknown>;
  providerCertification?: BackySettingsProviderCertification;
  frontendDatabaseCertification?: BackyFrontendDatabaseCertification;
  updatedAt?: string;
  [key: string]: unknown;
}

export interface BackySiteSettingsScope {
  schemaVersion: "backy.site-settings-scope.v1" | string;
  scope: {
    level: "site" | string;
    siteId: string;
    siteSlug?: string;
    teamId?: string | null;
    workspaceSettingsScope?: "global" | string;
    siteSettingsScope?: "site" | string;
    [key: string]: unknown;
  };
  siteSettings: Record<string, unknown>;
  workspaceSettings: Record<string, unknown>;
  effectiveSettings: {
    workspace?: Record<string, unknown>;
    site?: Record<string, unknown>;
    [key: string]: unknown;
  };
  frontendDatabaseCertification?: BackyFrontendDatabaseCertification;
  endpoints?: {
    workspaceSettings?: string;
    siteSettings?: string;
    siteDetail?: string;
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

export type BackyAdminSettingsResponse = BackyEnvelope<{
  settings: BackyAdminSettings;
}>;

export type BackySiteSettingsResponse = BackyEnvelope<{
  settings: BackySiteSettingsScope;
}>;

export type BackyAdminSettingsUpdateInput = Record<string, unknown> & {
  requestId?: string;
};

export type BackySiteSettingsUpdateInput = Record<string, unknown> & {
  requestId?: string;
};

export interface BackySiteNavigationConfig {
  primary: BackyNavigationItem[];
  footer?: BackyNavigationItem[];
  layout?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface BackyAdminNavigationResponseData {
  site: BackySiteSummary;
  navigation: {
    settings: BackySiteNavigationConfig;
    resolved: BackySiteNavigationConfig;
    [key: string]: unknown;
  };
  cacheInvalidation?: Record<string, unknown>;
  [key: string]: unknown;
}

export type BackyAdminNavigationResponse =
  BackyEnvelope<BackyAdminNavigationResponseData>;

export type BackyAdminNavigationUpdateInput = Record<string, unknown> & {
  requestId?: string;
  navigation?: Partial<BackySiteNavigationConfig>;
  primary?: BackyNavigationItem[];
  footer?: BackyNavigationItem[];
  layout?: Record<string, unknown>;
};

export type BackyAdminSeoChangeFrequency = "daily" | "weekly" | "monthly";

export interface BackyAdminSeoRouteOverride {
  id: string;
  label?: string;
  match: string;
  title?: string;
  description?: string;
  canonical?: string;
  ogImage?: string;
  keywords?: string[];
  jsonLd?: Array<Record<string, unknown>>;
  priority?: number;
  changeFrequency?: BackyAdminSeoChangeFrequency;
  robots?: {
    index?: boolean;
    follow?: boolean;
    [key: string]: unknown;
  };
  enabled?: boolean;
  [key: string]: unknown;
}

export interface BackyAdminSeoSettings {
  titleTemplate?: string;
  defaultDescription?: string;
  defaultOgImage?: string;
  favicon?: string;
  jsonLd?: Array<Record<string, unknown>>;
  sitemap?: {
    enabled?: boolean;
    defaultChangeFrequency?: BackyAdminSeoChangeFrequency;
    defaultPriority?: number;
    includeDynamicRoutes?: boolean;
    [key: string]: unknown;
  };
  robots?: {
    index?: boolean;
    follow?: boolean;
    extraRules?: string;
    [key: string]: unknown;
  };
  routeOverrides?: BackyAdminSeoRouteOverride[];
  [key: string]: unknown;
}

export interface BackyAdminSeoPreviewRoute {
  type: "dynamicList" | "dynamicItem" | string;
  title: string;
  description: string;
  canonical: string;
  sourceTitle: string;
  sourceDescription: string;
  variables: Record<string, string>;
  [key: string]: unknown;
}

export interface BackyAdminSeoPreview {
  supportedVariables: string[];
  routes: BackyAdminSeoPreviewRoute[];
  [key: string]: unknown;
}

export type BackyAdminSeoResponse = BackyEnvelope<
  {
    site: BackySiteSummary;
    seo: BackyAdminSeoSettings;
    preview: BackyAdminSeoPreview;
    cacheInvalidation?: Record<string, unknown>;
    [key: string]: unknown;
  }
>;

export type BackyAdminSeoUpdateInput = Partial<BackyAdminSeoSettings> & {
  requestId?: string;
  seo?: Partial<BackyAdminSeoSettings>;
};

export type BackyAdminRedirectStatusCode = 301 | 302 | 307 | 308 | 410;

export interface BackyAdminRedirectRule {
  id?: string;
  from: string;
  to?: string | null;
  destination?: string;
  statusCode?: BackyAdminRedirectStatusCode;
  permanent?: boolean;
  enabled?: boolean;
  [key: string]: unknown;
}

export interface BackyAdminRedirectConflict {
  index: number;
  ruleId?: string;
  from: string;
  to?: string;
  kind: "source-route-conflict" | "target-route-missing" | string;
  severity: "warning" | string;
  message: string;
  route?: {
    type: "page" | "post" | "dynamicList" | "dynamicItem" | string;
    id: string;
    path: string;
    title: string;
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

export type BackyAdminRedirectsResponse = BackyEnvelope<
  {
    site: BackySiteSummary;
    redirects: {
      rules: BackyAdminRedirectRule[];
      conflicts: BackyAdminRedirectConflict[];
      persisted: boolean;
      [key: string]: unknown;
    };
    cacheInvalidation?: Record<string, unknown>;
    [key: string]: unknown;
  }
>;

export type BackyAdminRedirectsUpdateInput =
  | BackyAdminRedirectRule[]
  | (Record<string, unknown> & {
      requestId?: string;
      redirectRules?: BackyAdminRedirectRule[];
      rules?: BackyAdminRedirectRule[];
      redirects?: {
        rules?: BackyAdminRedirectRule[];
        [key: string]: unknown;
      };
    });

export interface BackyFrontendLaunchReadiness {
  schemaVersion: "backy.frontend-launch-readiness.v1";
  status: "ready" | "attention" | "blocked";
  score: number;
  siteId: string;
  endpointCount: number;
  routePatternCount: number;
  moduleCounts: {
    pages?: number;
    blogPosts?: number;
    collections?: number;
    reusableSections?: number;
    forms?: number;
    media?: number;
    [key: string]: unknown;
  };
  checks: Array<{
    key: string;
    label: string;
    status: "ready" | "attention" | "blocked";
    detail: string;
    nextAction: string;
    gate?: string;
    [key: string]: unknown;
  }>;
  actionPlan: {
    schemaVersion: "backy.frontend-launch-action-plan.v1";
    nextAction: string;
    blockingChecks: string[];
    attentionChecks: string[];
    recommendedCommands: string[];
    [key: string]: unknown;
  };
  privacy: {
    includesSecretValues: false;
    publicManifestExcludesPrivateQueues: boolean;
    adminEndpointsRequireAuth: boolean;
    submissionAndOrderPayloadsPrivate: boolean;
    secretHandling: string;
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

export interface BackyFrontendManifestContract {
  version?: string;
  schemas?: Record<string, string>;
  databaseCertification: BackyFrontendDatabaseCertification;
  frontendLaunchReadiness: BackyFrontendLaunchReadiness;
  [key: string]: unknown;
}

export interface BackyFrontendManifest {
  schemaVersion: string;
  site: BackySiteSummary;
  contract: BackyFrontendManifestContract;
  capabilities: Record<string, boolean>;
  endpoints: Record<string, string>;
  routePatterns: BackyManifestRoutePattern[];
  modules: {
    routing?: BackyManifestRoutingModule;
    pages?: { count: number; items: BackyManifestPageResource[] };
    pagesRuntime?: BackyManifestPagesRuntimeModule;
    blog?: BackyManifestBlogModule;
    blogRuntime?: BackyManifestBlogRuntimeModule;
    collections?: BackyManifestCollectionSchema[];
    collectionsRuntime?: BackyManifestCollectionsRuntimeModule;
    reusableSections?: BackyManifestReusableSectionsModule;
    reusableSectionsRuntime?: BackyManifestReusableSectionsRuntimeModule;
    forms?: BackyManifestFormDefinition[];
    formsRuntime?: BackyManifestFormsRuntimeModule;
    comments?: BackyManifestCommentsModule;
    theme?: BackyManifestThemeModule;
    liveManagement?: BackyManifestLiveManagementModule;
    media?: BackyManifestMediaModule;
    commerce?: BackyCommerceStorefrontContract;
    commerceRuntime?: BackyManifestCommerceRuntimeModule;
    interactiveComponents?: BackyInteractiveComponentsContract;
    [key: string]: unknown;
  };
  admin: BackyManifestAdminDiscovery;
  delivery: BackyManifestDeliveryDiscovery;
  navigation: { primary?: BackyNavigationItem[]; [key: string]: unknown };
}

export interface BackyRenderPayload {
  site: BackySiteSummary;
  navigation: {
    primary: BackyNavigationItem[];
    footer?: BackyNavigationItem[];
    [key: string]: unknown;
  };
  frontendDesign?: BackyRenderFrontendDesign;
  route: Record<string, unknown>;
  content: BackyContentDocument;
  assets: {
    media: BackyMediaAsset[];
    fonts: BackyFontAsset[];
    [key: string]: unknown;
  };
  interactions: {
    forms: BackyFormDefinition[];
    comments: Array<Record<string, unknown>>;
    actions: Record<string, unknown>;
    [key: string]: unknown;
  };
  seo: Record<string, unknown>;
  dataBindings: Record<string, unknown>;
  editableMap: Record<string, unknown>;
}

export class BackyApiError extends Error {
  readonly status: number;
  readonly requestId?: string;
  readonly code: string;
  readonly details?: unknown;
  readonly validation?: BackyFormSubmissionValidationDetail[];
  readonly spamFlags?: string[];
  readonly submissionStatus?: string;

  constructor(status: number, envelope: BackyErrorEnvelope) {
    super(envelope.error.message);
    this.name = "BackyApiError";
    this.status = status;
    this.requestId = envelope.requestId;
    this.code = envelope.error.code;
    this.details = envelope.error.details;
    this.validation = envelope.validation;
    this.spamFlags = envelope.spamFlags;
    this.submissionStatus = envelope.status;
  }
}

export class BackyClient {
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;
  private readonly requestIdFactory: () => string;
  private readonly defaultHeaders?: HeadersInit;
  private readonly defaultCredentials?: RequestCredentials;
  private siteId?: string;

  constructor(options: BackyClientOptions) {
    if (!options.baseUrl) {
      throw new Error("BackyClient requires a baseUrl.");
    }

    this.baseUrl = options.baseUrl.replace(/\/$/, "");
    this.siteId = options.siteId;
    this.fetchImpl = options.fetch ?? globalThis.fetch;
    this.requestIdFactory =
      options.requestIdFactory ??
      (() =>
        `sdk_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`);
    this.defaultHeaders = options.defaultHeaders;
    this.defaultCredentials = options.credentials;

    if (!this.fetchImpl) {
      throw new Error("BackyClient requires a fetch implementation.");
    }
  }

  setSiteId(siteId: string): void {
    this.siteId = siteId;
  }

  getSiteId(): string | undefined {
    return this.siteId;
  }

  adminSites(
    options: BackyAdminSiteListOptions = {},
  ): Promise<BackyAdminSitesResponse> {
    const { requestId, headers, credentials, rest } =
      splitLiveManagementRequestOptions(options);
    return this.request("/api/admin/sites", {
      query: {
        includeUnpublished: rest.includeUnpublished,
      },
      requestId,
      headers,
      credentials,
    });
  }

  createAdminSite(
    input: BackyAdminSiteCreateInput,
    options: BackyLiveManagementRequestOptions = {},
  ): Promise<BackyAdminSiteResponse> {
    const { requestId, ...body } = input;
    return this.request("/api/admin/sites", {
      method: "POST",
      body,
      requestId: options.requestId ?? requestId,
      headers: liveManagementHeaders(options),
      credentials: options.credentials,
    });
  }

  adminSite(
    siteId = this.requireSiteId(),
    options: BackyLiveManagementRequestOptions = {},
  ): Promise<BackyAdminSiteResponse> {
    return this.request(`/api/admin/sites/${encodeURIComponent(siteId)}`, {
      requestId: options.requestId,
      headers: liveManagementHeaders(options),
      credentials: options.credentials,
    });
  }

  updateAdminSite(
    siteId: string,
    input: BackyAdminSiteUpdateInput,
    options: BackyLiveManagementRequestOptions = {},
  ): Promise<BackyAdminSiteResponse> {
    const { requestId: inputRequestId, ...body } = input;
    const requestId =
      typeof inputRequestId === "string" ? inputRequestId : undefined;
    return this.request(`/api/admin/sites/${encodeURIComponent(siteId)}`, {
      method: "PATCH",
      body,
      requestId: options.requestId ?? requestId,
      headers: liveManagementHeaders(options),
      credentials: options.credentials,
    });
  }

  deleteAdminSite(
    siteId = this.requireSiteId(),
    options: BackyLiveManagementRequestOptions = {},
  ): Promise<BackyAdminSiteDeleteResponse> {
    return this.request(`/api/admin/sites/${encodeURIComponent(siteId)}`, {
      method: "DELETE",
      requestId: options.requestId,
      headers: liveManagementHeaders(options),
      credentials: options.credentials,
    });
  }

  adminSiteReadiness(
    siteId = this.requireSiteId(),
    options: BackyLiveManagementRequestOptions = {},
  ): Promise<BackyAdminSiteReadinessResponse> {
    return this.request(
      `/api/admin/sites/${encodeURIComponent(siteId)}/readiness`,
      {
        requestId: options.requestId,
        headers: liveManagementHeaders(options),
        credentials: options.credentials,
      },
    );
  }

  duplicateAdminSite(
    siteId: string,
    input: BackyAdminSiteDuplicateInput = {},
    options: BackyLiveManagementRequestOptions = {},
  ): Promise<BackyAdminSiteDuplicateResponse> {
    const { requestId, ...body } = input;
    return this.request(
      `/api/admin/sites/${encodeURIComponent(siteId)}/duplicate`,
      {
        method: "POST",
        body,
        requestId: options.requestId ?? requestId,
        headers: liveManagementHeaders(options),
        credentials: options.credentials,
      },
    );
  }

  adminSettings(
    options: BackyLiveManagementRequestOptions = {},
  ): Promise<BackyAdminSettingsResponse> {
    return this.request("/api/admin/settings", {
      requestId: options.requestId,
      headers: liveManagementHeaders(options),
      credentials: options.credentials,
    });
  }

  updateAdminSettings(
    input: BackyAdminSettingsUpdateInput,
    options: BackyLiveManagementRequestOptions = {},
  ): Promise<BackyAdminSettingsResponse> {
    const { requestId, ...body } = input;
    return this.request("/api/admin/settings", {
      method: "PATCH",
      body,
      requestId: options.requestId ?? requestId,
      headers: liveManagementHeaders(options),
      credentials: options.credentials,
    });
  }

  adminSiteSettings(
    options: BackyLiveManagementRequestOptions = {},
  ): Promise<BackySiteSettingsResponse> {
    return this.request(
      `/api/admin/sites/${encodeURIComponent(options.siteId ?? this.requireSiteId())}/settings`,
      {
        requestId: options.requestId,
        headers: liveManagementHeaders(options),
        credentials: options.credentials,
      },
    );
  }

  updateAdminSiteSettings(
    input: BackySiteSettingsUpdateInput,
    options: BackyLiveManagementRequestOptions = {},
  ): Promise<BackySiteSettingsResponse> {
    const { requestId, ...body } = input;
    return this.request(
      `/api/admin/sites/${encodeURIComponent(options.siteId ?? this.requireSiteId())}/settings`,
      {
        method: "PATCH",
        body,
        requestId: options.requestId ?? requestId,
        headers: liveManagementHeaders(options),
        credentials: options.credentials,
      },
    );
  }

  adminNavigation(
    options: BackyLiveManagementRequestOptions = {},
  ): Promise<BackyAdminNavigationResponse> {
    return this.request(
      `/api/admin/sites/${encodeURIComponent(options.siteId ?? this.requireSiteId())}/navigation`,
      {
        requestId: options.requestId,
        headers: liveManagementHeaders(options),
        credentials: options.credentials,
      },
    );
  }

  updateAdminNavigation(
    input: BackyAdminNavigationUpdateInput,
    options: BackyLiveManagementRequestOptions = {},
  ): Promise<BackyAdminNavigationResponse> {
    const { requestId, ...body } = input;
    return this.request(
      `/api/admin/sites/${encodeURIComponent(options.siteId ?? this.requireSiteId())}/navigation`,
      {
        method: "PATCH",
        body,
        requestId: options.requestId ?? requestId,
        headers: liveManagementHeaders(options),
        credentials: options.credentials,
      },
    );
  }

  adminSeo(
    options: BackyLiveManagementRequestOptions = {},
  ): Promise<BackyAdminSeoResponse> {
    return this.request(
      `/api/admin/sites/${encodeURIComponent(options.siteId ?? this.requireSiteId())}/seo`,
      {
        requestId: options.requestId,
        headers: liveManagementHeaders(options),
        credentials: options.credentials,
      },
    );
  }

  updateAdminSeo(
    input: BackyAdminSeoUpdateInput,
    options: BackyLiveManagementRequestOptions = {},
  ): Promise<BackyAdminSeoResponse> {
    const { requestId, ...body } = input;
    return this.request(
      `/api/admin/sites/${encodeURIComponent(options.siteId ?? this.requireSiteId())}/seo`,
      {
        method: "PATCH",
        body,
        requestId: options.requestId ?? requestId,
        headers: liveManagementHeaders(options),
        credentials: options.credentials,
      },
    );
  }

  adminRedirects(
    options: BackyLiveManagementRequestOptions = {},
  ): Promise<BackyAdminRedirectsResponse> {
    return this.request(
      `/api/admin/sites/${encodeURIComponent(options.siteId ?? this.requireSiteId())}/redirects`,
      {
        requestId: options.requestId,
        headers: liveManagementHeaders(options),
        credentials: options.credentials,
      },
    );
  }

  previewAdminRedirects(
    input: BackyAdminRedirectsUpdateInput,
    options: BackyLiveManagementRequestOptions = {},
  ): Promise<BackyAdminRedirectsResponse> {
    const requestId = Array.isArray(input) ? undefined : input.requestId;
    const body = Array.isArray(input)
      ? { redirectRules: input }
      : (({ requestId: _requestId, ...rest }) => rest)(input);
    return this.request(
      `/api/admin/sites/${encodeURIComponent(options.siteId ?? this.requireSiteId())}/redirects`,
      {
        method: "POST",
        body,
        requestId: options.requestId ?? requestId,
        headers: liveManagementHeaders(options),
        credentials: options.credentials,
      },
    );
  }

  updateAdminRedirects(
    input: BackyAdminRedirectsUpdateInput,
    options: BackyLiveManagementRequestOptions = {},
  ): Promise<BackyAdminRedirectsResponse> {
    const requestId = Array.isArray(input) ? undefined : input.requestId;
    const body = Array.isArray(input)
      ? { redirectRules: input }
      : (({ requestId: _requestId, ...rest }) => rest)(input);
    return this.request(
      `/api/admin/sites/${encodeURIComponent(options.siteId ?? this.requireSiteId())}/redirects`,
      {
        method: "PATCH",
        body,
        requestId: options.requestId ?? requestId,
        headers: liveManagementHeaders(options),
        credentials: options.credentials,
      },
    );
  }

  sites(): Promise<
    BackyEnvelope<{ sites: BackySiteSummary[]; pagination?: BackyPagination }>
  > {
    return this.request("/api/sites");
  }

  async discoverSite(
    identifier: string,
  ): Promise<BackyEnvelope<{ site: BackySiteSummary }>> {
    const envelope = await this.request<{ site: BackySiteSummary }>(
      "/api/sites",
      {
        query: { identifier },
      },
    );
    const discoveredSiteId =
      typeof envelope.data.site.id === "string"
        ? envelope.data.site.id
        : undefined;
    if (discoveredSiteId) {
      this.siteId = discoveredSiteId;
    }
    return envelope;
  }

  manifest(
    siteId = this.requireSiteId(),
  ): Promise<BackyEnvelope<BackyFrontendManifest>> {
    return this.request(`/api/sites/${encodeURIComponent(siteId)}/manifest`);
  }

  interactiveComponents(
    siteId = this.requireSiteId(),
  ): Promise<BackyEnvelope<BackyInteractiveComponentRegistry>> {
    return this.request(
      `/api/sites/${encodeURIComponent(siteId)}/interactive-components`,
    );
  }

  interactiveComponentsCached(
    options: BackyConditionalOptions = {},
  ): Promise<
    BackyConditionalResult<BackyEnvelope<BackyInteractiveComponentRegistry>>
  > {
    return this.requestConditionalJson(
      `/api/sites/${encodeURIComponent(options.siteId ?? this.requireSiteId())}/interactive-components`,
      {
        ifNoneMatch: options.etag,
        requestId: options.requestId,
      },
    );
  }

  recordInteractiveRuntimeEvent(
    input: BackyInteractiveRuntimeEventInputSource,
    siteId = this.requireSiteId(),
  ): Promise<
    BackyEnvelope<{
      recorded: boolean;
      siteId: string;
      componentKey: string;
      version?: string | null;
    }>
  > {
    const body = buildBackyInteractiveRuntimeEventInput(input);
    return this.request(
      `/api/sites/${encodeURIComponent(siteId)}/interactive-components/runtime-events`,
      {
        method: "POST",
        body,
        requestId: body.requestId,
      },
    );
  }

  frontendDesign(
    siteId = this.requireSiteId(),
  ): Promise<BackyEnvelope<BackyFrontendDesignResponse>> {
    return this.request(
      `/api/sites/${encodeURIComponent(siteId)}/frontend-design`,
    );
  }

  frontendDesignCached(
    options: BackyConditionalOptions = {},
  ): Promise<
    BackyConditionalResult<BackyEnvelope<BackyFrontendDesignResponse>>
  > {
    return this.requestConditionalJson(
      `/api/sites/${encodeURIComponent(options.siteId ?? this.requireSiteId())}/frontend-design`,
      {
        ifNoneMatch: options.etag,
        requestId: options.requestId,
      },
    );
  }

  manifestCached(
    options: BackyConditionalOptions = {},
  ): Promise<BackyConditionalResult<BackyEnvelope<BackyFrontendManifest>>> {
    return this.requestConditionalJson(
      `/api/sites/${encodeURIComponent(options.siteId ?? this.requireSiteId())}/manifest`,
      {
        ifNoneMatch: options.etag,
        requestId: options.requestId,
      },
    );
  }

  openapi(siteId = this.requireSiteId()): Promise<Record<string, unknown>> {
    return this.requestRawJson(
      `/api/sites/${encodeURIComponent(siteId)}/openapi`,
    );
  }

  openapiCached(
    options: BackyConditionalOptions = {},
  ): Promise<BackyConditionalResult<Record<string, unknown>>> {
    return this.requestConditionalJson(
      `/api/sites/${encodeURIComponent(options.siteId ?? this.requireSiteId())}/openapi`,
      {
        ifNoneMatch: options.etag,
        requestId: options.requestId,
      },
    );
  }

  resolve(
    path: string,
    options: { previewToken?: string; siteId?: string } = {},
  ): Promise<BackyRouteResolveResult> {
    return this.requestRouteResolve(
      `/api/sites/${encodeURIComponent(options.siteId ?? this.requireSiteId())}/resolve`,
      {
        query: { path, previewToken: options.previewToken },
      },
    );
  }

  render<TPayload = BackyRenderPayload>(
    path: string,
    options: BackyRenderRequestOptions = {},
  ): Promise<BackyEnvelope<TPayload>> {
    return this.request(
      `/api/sites/${encodeURIComponent(options.siteId ?? this.requireSiteId())}/render`,
      {
        query: {
          path,
          previewToken: options.previewToken,
          schemaVersion: options.schemaVersion,
        },
      },
    );
  }

  renderCached<TPayload = BackyRenderPayload>(
    path: string,
    options: BackyRenderConditionalOptions = {},
  ): Promise<BackyConditionalResult<BackyEnvelope<TPayload>>> {
    return this.requestConditionalJson(
      `/api/sites/${encodeURIComponent(options.siteId ?? this.requireSiteId())}/render`,
      {
        query: {
          path,
          previewToken: options.previewToken,
          schemaVersion: options.schemaVersion,
        },
        ifNoneMatch: options.etag,
        requestId: options.requestId,
      },
    );
  }

  navigation(
    siteId = this.requireSiteId(),
  ): Promise<
    BackyEnvelope<{
      site?: BackySiteSummary;
      navigation: {
        primary: BackyNavigationItem[];
        footer?: BackyNavigationItem[];
        [key: string]: unknown;
      };
    }>
  > {
    return this.request(`/api/sites/${encodeURIComponent(siteId)}/navigation`);
  }

  navigationCached(
    options: BackyConditionalOptions = {},
  ): Promise<
    BackyConditionalResult<
      BackyEnvelope<{
        site?: BackySiteSummary;
        navigation: {
          primary: BackyNavigationItem[];
          footer?: BackyNavigationItem[];
          [key: string]: unknown;
        };
      }>
    >
  > {
    return this.requestConditionalJson(
      `/api/sites/${encodeURIComponent(options.siteId ?? this.requireSiteId())}/navigation`,
      {
        ifNoneMatch: options.etag,
        requestId: options.requestId,
      },
    );
  }

  seo(
    siteId = this.requireSiteId(),
  ): Promise<BackyEnvelope<BackySeoDiscovery>> {
    return this.request(`/api/sites/${encodeURIComponent(siteId)}/seo`);
  }

  seoCached(
    options: BackyConditionalOptions = {},
  ): Promise<BackyConditionalResult<BackyEnvelope<BackySeoDiscovery>>> {
    return this.requestConditionalJson(
      `/api/sites/${encodeURIComponent(options.siteId ?? this.requireSiteId())}/seo`,
      {
        ifNoneMatch: options.etag,
        requestId: options.requestId,
      },
    );
  }

  pages(
    options: BackyPageListOptions = {},
  ): Promise<
    BackyEnvelope<
      {
        page?: BackyPageResource;
        pages?: BackyPageResource[];
        pagination?: BackyPagination;
      } & Record<string, unknown>
    >
  > {
    const { requestId, siteId, ...queryOptions } = options;
    const query = normalizeListQuery(queryOptions);
    return this.request(
      `/api/sites/${encodeURIComponent(siteId ?? this.requireSiteId())}/pages`,
      {
        query,
        requestId,
      },
    );
  }

  pagesCached(
    options: BackyPageListOptions & BackyConditionalOptions = {},
  ): Promise<
    BackyConditionalResult<
      BackyEnvelope<
        {
          page?: BackyPageResource;
          pages?: BackyPageResource[];
          pagination?: BackyPagination;
        } & Record<string, unknown>
      >
    >
  > {
    const { requestId, etag, siteId, ...queryOptions } = options;
    const query = normalizeListQuery(queryOptions);
    return this.requestConditionalJson(
      `/api/sites/${encodeURIComponent(siteId ?? this.requireSiteId())}/pages`,
      {
        query,
        ifNoneMatch: etag,
        requestId,
      },
    );
  }

  adminPages(
    options: BackyAdminPageListOptions = {},
  ): Promise<BackyAdminPagesResponse> {
    const { requestId, siteId, headers, credentials, rest } =
      splitLiveManagementRequestOptions(options);
    const query = {
      includeUnpublished: rest.includeUnpublished,
      limit: rest.limit,
      offset: rest.offset,
    };
    return this.request(
      `/api/admin/sites/${encodeURIComponent(siteId ?? this.requireSiteId())}/pages`,
      {
        query,
        requestId,
        headers,
        credentials,
      },
    );
  }

  createAdminPage(
    input: BackyAdminPageCreateInput,
    options: BackyLiveManagementRequestOptions = {},
  ): Promise<BackyAdminPageResponse> {
    const { requestId, ...body } = input;
    return this.request(
      `/api/admin/sites/${encodeURIComponent(options.siteId ?? this.requireSiteId())}/pages`,
      {
        method: "POST",
        body,
        requestId: options.requestId ?? requestId,
        headers: liveManagementHeaders(options),
        credentials: options.credentials,
      },
    );
  }

  adminPage(
    pageId: string,
    options: BackyLiveManagementRequestOptions = {},
  ): Promise<BackyAdminPageResponse> {
    return this.request(
      `/api/admin/sites/${encodeURIComponent(options.siteId ?? this.requireSiteId())}/pages/${encodeURIComponent(pageId)}`,
      {
        requestId: options.requestId,
        headers: liveManagementHeaders(options),
        credentials: options.credentials,
      },
    );
  }

  updateAdminPage(
    pageId: string,
    input: BackyAdminPageUpdateInput,
    options: BackyLiveManagementRequestOptions = {},
  ): Promise<BackyAdminPageResponse> {
    const { requestId: inputRequestId, ...body } = input;
    const requestId =
      typeof inputRequestId === "string" ? inputRequestId : undefined;
    return this.request(
      `/api/admin/sites/${encodeURIComponent(options.siteId ?? this.requireSiteId())}/pages/${encodeURIComponent(pageId)}`,
      {
        method: "PATCH",
        body,
        requestId: options.requestId ?? requestId,
        headers: liveManagementHeaders(options),
        credentials: options.credentials,
      },
    );
  }

  deleteAdminPage(
    pageId: string,
    options: BackyLiveManagementRequestOptions = {},
  ): Promise<BackyAdminPageDeleteResponse> {
    return this.request(
      `/api/admin/sites/${encodeURIComponent(options.siteId ?? this.requireSiteId())}/pages/${encodeURIComponent(pageId)}`,
      {
        method: "DELETE",
        requestId: options.requestId,
        headers: liveManagementHeaders(options),
        credentials: options.credentials,
      },
    );
  }

  adminPageReadiness(
    pageId: string,
    options: BackyLiveManagementRequestOptions = {},
  ): Promise<BackyAdminPageReadinessResponse> {
    return this.request(
      `/api/admin/sites/${encodeURIComponent(options.siteId ?? this.requireSiteId())}/pages/${encodeURIComponent(pageId)}/readiness`,
      {
        requestId: options.requestId,
        headers: liveManagementHeaders(options),
        credentials: options.credentials,
      },
    );
  }

  publishAdminPage(
    pageId: string,
    input: BackyAdminPageVersionInput = {},
    options: BackyLiveManagementRequestOptions = {},
  ): Promise<BackyAdminPageResponse> {
    const { requestId, ...body } = input;
    return this.request(
      `/api/admin/sites/${encodeURIComponent(options.siteId ?? this.requireSiteId())}/pages/${encodeURIComponent(pageId)}/publish`,
      {
        method: "POST",
        body,
        requestId: options.requestId ?? requestId,
        headers: liveManagementHeaders(options),
        credentials: options.credentials,
      },
    );
  }

  archiveAdminPage(
    pageId: string,
    input: BackyAdminPageVersionInput = {},
    options: BackyLiveManagementRequestOptions = {},
  ): Promise<BackyAdminPageResponse> {
    const { requestId, ...body } = input;
    return this.request(
      `/api/admin/sites/${encodeURIComponent(options.siteId ?? this.requireSiteId())}/pages/${encodeURIComponent(pageId)}/archive`,
      {
        method: "POST",
        body,
        requestId: options.requestId ?? requestId,
        headers: liveManagementHeaders(options),
        credentials: options.credentials,
      },
    );
  }

  createAdminPagePreviewToken(
    pageId: string,
    input: BackyAdminPagePreviewInput = {},
    options: BackyLiveManagementRequestOptions = {},
  ): Promise<BackyAdminPagePreviewResponse> {
    const { requestId, ...body } = input;
    return this.request(
      `/api/admin/sites/${encodeURIComponent(options.siteId ?? this.requireSiteId())}/pages/${encodeURIComponent(pageId)}/preview`,
      {
        method: "POST",
        body,
        requestId: options.requestId ?? requestId,
        headers: liveManagementHeaders(options),
        credentials: options.credentials,
      },
    );
  }

  adminPageRevisions(
    pageId: string,
    options: BackyAdminPageRevisionListOptions = {},
  ): Promise<BackyAdminPageRevisionsResponse> {
    const { requestId, siteId, headers, credentials, rest } =
      splitLiveManagementRequestOptions(options);
    const query = normalizeListQuery({
      limit: rest.limit,
      offset: rest.offset,
    });
    return this.request(
      `/api/admin/sites/${encodeURIComponent(siteId ?? this.requireSiteId())}/pages/${encodeURIComponent(pageId)}/revisions`,
      {
        query,
        requestId,
        headers,
        credentials,
      },
    );
  }

  rollbackAdminPage(
    pageId: string,
    input: BackyAdminPageRollbackInput,
    options: BackyLiveManagementRequestOptions = {},
  ): Promise<BackyAdminPageResponse> {
    const { requestId, ...body } = input;
    return this.request(
      `/api/admin/sites/${encodeURIComponent(options.siteId ?? this.requireSiteId())}/pages/${encodeURIComponent(pageId)}/rollback`,
      {
        method: "POST",
        body,
        requestId: options.requestId ?? requestId,
        headers: liveManagementHeaders(options),
        credentials: options.credentials,
      },
    );
  }

  blog(options: BackyBlogListOptions = {}): Promise<BackyBlogResponse> {
    const siteId =
      typeof options.siteId === "string"
        ? options.siteId
        : this.requireSiteId();
    const { requestId, siteId: _siteId, ...queryOptions } = options;
    const query = normalizeListQuery(
      queryOptions as BackyListOptions & Record<string, BackyQueryValue>,
    );
    void _siteId;
    return this.request(`/api/sites/${encodeURIComponent(siteId)}/blog`, {
      query,
      requestId,
    });
  }

  blogCached(
    options: BackyBlogListOptions & BackyConditionalOptions = {},
  ): Promise<BackyBlogConditionalResult> {
    const siteId =
      typeof options.siteId === "string"
        ? options.siteId
        : this.requireSiteId();
    const { requestId, etag, siteId: _siteId, ...queryOptions } = options;
    const query = normalizeListQuery(
      queryOptions as BackyListOptions & Record<string, BackyQueryValue>,
    );
    void _siteId;
    return this.requestConditionalJson(
      `/api/sites/${encodeURIComponent(siteId)}/blog`,
      {
        query,
        ifNoneMatch: etag,
        requestId,
      },
    );
  }

  blogRssUrl(options: { siteId?: string; limit?: number } = {}): string {
    const siteId = options.siteId ?? this.requireSiteId();
    const limit = normalizeListLimit(options.limit);
    const query =
      limit !== undefined ? `?limit=${encodeURIComponent(String(limit))}` : "";
    return `${this.baseUrl}/api/sites/${encodeURIComponent(siteId)}/blog/rss${query}`;
  }

  async blogRss(
    options: { siteId?: string; limit?: number; requestId?: string } = {},
  ): Promise<string> {
    return this.requestText(
      `/api/sites/${encodeURIComponent(options.siteId ?? this.requireSiteId())}/blog/rss`,
      {
        query: { limit: normalizeListLimit(options.limit) },
        requestId: options.requestId,
      },
    );
  }

  async blogFeeds(
    options: { siteId?: string } = {},
  ): Promise<BackyBlogFeedDiscovery[]> {
    const manifest = await this.manifest(
      options.siteId ?? this.requireSiteId(),
    );
    return Array.isArray(manifest.data.modules?.blog?.feeds)
      ? manifest.data.modules.blog.feeds
      : [];
  }

  blogCategories(
    siteId = this.requireSiteId(),
  ): Promise<BackyBlogCategoriesResponse> {
    return this.request(
      `/api/sites/${encodeURIComponent(siteId)}/blog/categories`,
    );
  }

  blogCategoriesCached(
    options: BackyConditionalOptions = {},
  ): Promise<BackyConditionalResult<BackyBlogCategoriesResponse>> {
    return this.requestConditionalJson(
      `/api/sites/${encodeURIComponent(options.siteId ?? this.requireSiteId())}/blog/categories`,
      {
        ifNoneMatch: options.etag,
        requestId: options.requestId,
      },
    );
  }

  blogTags(siteId = this.requireSiteId()): Promise<BackyBlogTagsResponse> {
    return this.request(`/api/sites/${encodeURIComponent(siteId)}/blog/tags`);
  }

  blogTagsCached(
    options: BackyConditionalOptions = {},
  ): Promise<BackyConditionalResult<BackyBlogTagsResponse>> {
    return this.requestConditionalJson(
      `/api/sites/${encodeURIComponent(options.siteId ?? this.requireSiteId())}/blog/tags`,
      {
        ifNoneMatch: options.etag,
        requestId: options.requestId,
      },
    );
  }

  blogAuthors(
    siteId = this.requireSiteId(),
  ): Promise<BackyBlogAuthorsResponse> {
    return this.request(
      `/api/sites/${encodeURIComponent(siteId)}/blog/authors`,
    );
  }

  blogAuthorsCached(
    options: BackyConditionalOptions = {},
  ): Promise<BackyConditionalResult<BackyBlogAuthorsResponse>> {
    return this.requestConditionalJson(
      `/api/sites/${encodeURIComponent(options.siteId ?? this.requireSiteId())}/blog/authors`,
      {
        ifNoneMatch: options.etag,
        requestId: options.requestId,
        credentials: options.credentials,
      },
    );
  }

  adminBlogPosts(
    options: BackyAdminBlogPostListOptions = {},
  ): Promise<BackyAdminBlogPostsResponse> {
    const { requestId, siteId, headers, credentials, rest } =
      splitLiveManagementRequestOptions(options);
    const query = {
      status: rest.status,
      categoryId: rest.categoryId,
      categorySlug: rest.categorySlug,
      tagId: rest.tagId,
      tagSlug: rest.tagSlug,
      authorId: rest.authorId,
      authorSlug: rest.authorSlug,
      limit: rest.limit,
      offset: rest.offset,
    };
    return this.request(
      `/api/admin/sites/${encodeURIComponent(siteId ?? this.requireSiteId())}/blog`,
      {
        query,
        requestId,
        headers,
        credentials,
      },
    );
  }

  createAdminBlogPost(
    input: BackyAdminBlogPostCreateInput,
    options: BackyLiveManagementRequestOptions = {},
  ): Promise<BackyAdminBlogPostResponse> {
    const { requestId, ...body } = input;
    return this.request(
      `/api/admin/sites/${encodeURIComponent(options.siteId ?? this.requireSiteId())}/blog`,
      {
        method: "POST",
        body,
        requestId: options.requestId ?? requestId,
        headers: liveManagementHeaders(options),
        credentials: options.credentials,
      },
    );
  }

  adminBlogPost(
    postId: string,
    options: BackyLiveManagementRequestOptions = {},
  ): Promise<BackyAdminBlogPostResponse> {
    return this.request(
      `/api/admin/sites/${encodeURIComponent(options.siteId ?? this.requireSiteId())}/blog/${encodeURIComponent(postId)}`,
      {
        requestId: options.requestId,
        headers: liveManagementHeaders(options),
        credentials: options.credentials,
      },
    );
  }

  updateAdminBlogPost(
    postId: string,
    input: BackyAdminBlogPostUpdateInput,
    options: BackyLiveManagementRequestOptions = {},
  ): Promise<BackyAdminBlogPostResponse> {
    const { requestId: inputRequestId, ...body } = input;
    const requestId =
      typeof inputRequestId === "string" ? inputRequestId : undefined;
    return this.request(
      `/api/admin/sites/${encodeURIComponent(options.siteId ?? this.requireSiteId())}/blog/${encodeURIComponent(postId)}`,
      {
        method: "PATCH",
        body,
        requestId: options.requestId ?? requestId,
        headers: liveManagementHeaders(options),
        credentials: options.credentials,
      },
    );
  }

  deleteAdminBlogPost(
    postId: string,
    options: BackyLiveManagementRequestOptions = {},
  ): Promise<BackyAdminBlogPostDeleteResponse> {
    return this.request(
      `/api/admin/sites/${encodeURIComponent(options.siteId ?? this.requireSiteId())}/blog/${encodeURIComponent(postId)}`,
      {
        method: "DELETE",
        requestId: options.requestId,
        headers: liveManagementHeaders(options),
        credentials: options.credentials,
      },
    );
  }

  adminBlogPostReadiness(
    postId: string,
    options: BackyLiveManagementRequestOptions = {},
  ): Promise<BackyAdminBlogPostReadinessResponse> {
    return this.request(
      `/api/admin/sites/${encodeURIComponent(options.siteId ?? this.requireSiteId())}/blog/${encodeURIComponent(postId)}/readiness`,
      {
        requestId: options.requestId,
        headers: liveManagementHeaders(options),
        credentials: options.credentials,
      },
    );
  }

  publishAdminBlogPost(
    postId: string,
    input: BackyAdminBlogPostVersionInput = {},
    options: BackyLiveManagementRequestOptions = {},
  ): Promise<BackyAdminBlogPostResponse> {
    const { requestId, ...body } = input;
    return this.request(
      `/api/admin/sites/${encodeURIComponent(options.siteId ?? this.requireSiteId())}/blog/${encodeURIComponent(postId)}/publish`,
      {
        method: "POST",
        body,
        requestId: options.requestId ?? requestId,
        headers: liveManagementHeaders(options),
        credentials: options.credentials,
      },
    );
  }

  archiveAdminBlogPost(
    postId: string,
    input: BackyAdminBlogPostVersionInput = {},
    options: BackyLiveManagementRequestOptions = {},
  ): Promise<BackyAdminBlogPostResponse> {
    const { requestId, ...body } = input;
    return this.request(
      `/api/admin/sites/${encodeURIComponent(options.siteId ?? this.requireSiteId())}/blog/${encodeURIComponent(postId)}/archive`,
      {
        method: "POST",
        body,
        requestId: options.requestId ?? requestId,
        headers: liveManagementHeaders(options),
        credentials: options.credentials,
      },
    );
  }

  createAdminBlogPostPreviewToken(
    postId: string,
    input: BackyAdminBlogPostPreviewInput = {},
    options: BackyLiveManagementRequestOptions = {},
  ): Promise<BackyAdminBlogPostPreviewResponse> {
    const { requestId, ...body } = input;
    return this.request(
      `/api/admin/sites/${encodeURIComponent(options.siteId ?? this.requireSiteId())}/blog/${encodeURIComponent(postId)}/preview`,
      {
        method: "POST",
        body,
        requestId: options.requestId ?? requestId,
        headers: liveManagementHeaders(options),
        credentials: options.credentials,
      },
    );
  }

  adminBlogPostRevisions(
    postId: string,
    options: BackyAdminBlogPostRevisionListOptions = {},
  ): Promise<BackyAdminBlogPostRevisionsResponse> {
    const { requestId, siteId, headers, credentials, rest } =
      splitLiveManagementRequestOptions(options);
    const query = normalizeListQuery({
      limit: rest.limit,
      offset: rest.offset,
    });
    return this.request(
      `/api/admin/sites/${encodeURIComponent(siteId ?? this.requireSiteId())}/blog/${encodeURIComponent(postId)}/revisions`,
      {
        query,
        requestId,
        headers,
        credentials,
      },
    );
  }

  rollbackAdminBlogPost(
    postId: string,
    input: BackyAdminBlogPostRollbackInput,
    options: BackyLiveManagementRequestOptions = {},
  ): Promise<BackyAdminBlogPostResponse> {
    const { requestId, ...body } = input;
    return this.request(
      `/api/admin/sites/${encodeURIComponent(options.siteId ?? this.requireSiteId())}/blog/${encodeURIComponent(postId)}/rollback`,
      {
        method: "POST",
        body,
        requestId: options.requestId ?? requestId,
        headers: liveManagementHeaders(options),
        credentials: options.credentials,
      },
    );
  }

  liveManagedPage(
    pageId: string,
    options: BackyLiveManagementRequestOptions = {},
  ): Promise<BackyLiveManagedPageResponse> {
    return this.request(
      `/api/sites/${encodeURIComponent(options.siteId ?? this.requireSiteId())}/manage/pages/${encodeURIComponent(pageId)}`,
      {
        requestId: options.requestId,
        headers: liveManagementHeaders(options),
        credentials: options.credentials,
      },
    );
  }

  updateLiveManagedPage(
    pageId: string,
    input: BackyLiveManagedPageUpdateInput,
    options: BackyLiveManagementRequestOptions = {},
  ): Promise<BackyLiveManagedPageResponse> {
    const { requestId, ...body } = input;
    return this.request(
      `/api/sites/${encodeURIComponent(options.siteId ?? this.requireSiteId())}/manage/pages/${encodeURIComponent(pageId)}`,
      {
        method: "PATCH",
        body,
        requestId: options.requestId ?? requestId,
        headers: liveManagementHeaders(options),
        credentials: options.credentials,
      },
    );
  }

  liveManagedBlogPost(
    postId: string,
    options: BackyLiveManagementRequestOptions = {},
  ): Promise<BackyLiveManagedBlogPostResponse> {
    return this.request(
      `/api/sites/${encodeURIComponent(options.siteId ?? this.requireSiteId())}/manage/blog/${encodeURIComponent(postId)}`,
      {
        requestId: options.requestId,
        headers: liveManagementHeaders(options),
        credentials: options.credentials,
      },
    );
  }

  updateLiveManagedBlogPost(
    postId: string,
    input: BackyLiveManagedBlogPostUpdateInput,
    options: BackyLiveManagementRequestOptions = {},
  ): Promise<BackyLiveManagedBlogPostResponse> {
    const { requestId, ...body } = input;
    return this.request(
      `/api/sites/${encodeURIComponent(options.siteId ?? this.requireSiteId())}/manage/blog/${encodeURIComponent(postId)}`,
      {
        method: "PATCH",
        body,
        requestId: options.requestId ?? requestId,
        headers: liveManagementHeaders(options),
        credentials: options.credentials,
      },
    );
  }

  media(
    options: BackyMediaListOptions = {},
  ): Promise<
    BackyEnvelope<{ media: BackyMediaAsset[]; pagination: BackyPagination }>
  > {
    const { requestId, siteId, ...queryOptions } = options;
    const query = normalizeListQuery(queryOptions);
    return this.request(
      `/api/sites/${encodeURIComponent(siteId ?? this.requireSiteId())}/media`,
      {
        query,
        requestId,
      },
    );
  }

  mediaCached(
    options: BackyMediaListOptions & BackyConditionalOptions = {},
  ): Promise<
    BackyConditionalResult<
      BackyEnvelope<{ media: BackyMediaAsset[]; pagination: BackyPagination }>
    >
  > {
    const { requestId, etag, siteId, ...queryOptions } = options;
    const query = normalizeListQuery(queryOptions);
    return this.requestConditionalJson(
      `/api/sites/${encodeURIComponent(siteId ?? this.requireSiteId())}/media`,
      {
        query,
        ifNoneMatch: etag,
        requestId,
      },
    );
  }

  adminMedia(
    options: BackyAdminMediaListOptions = {},
  ): Promise<BackyAdminMediaListResponse> {
    const { requestId, siteId, headers, credentials, rest } =
      splitLiveManagementRequestOptions(options);
    const { q, ...queryOptions } = rest;
    const query = normalizeListQuery({
      ...queryOptions,
      search: queryOptions.search ?? q,
    } as BackyMediaListOptions & { visibility?: string });
    return this.request(
      `/api/admin/sites/${encodeURIComponent(siteId ?? this.requireSiteId())}/media`,
      {
        query,
        requestId,
        headers,
        credentials,
      },
    );
  }

  uploadMedia(
    input: BackyAdminMediaUploadInput,
    options: BackyLiveManagementRequestOptions = {},
  ): Promise<BackyAdminMediaResponse> {
    return this.request(
      `/api/admin/sites/${encodeURIComponent(options.siteId ?? this.requireSiteId())}/media`,
      {
        method: "POST",
        body: buildBackyMediaUploadFormData(input),
        requestId: options.requestId ?? input.requestId,
        headers: liveManagementHeaders(options),
        credentials: options.credentials,
      },
    );
  }

  updateAdminMedia(
    mediaId: string,
    input: BackyAdminMediaUpdateInput,
    options: BackyLiveManagementRequestOptions = {},
  ): Promise<BackyAdminMediaResponse> {
    const { requestId, ...body } = input;
    return this.request(
      `/api/admin/sites/${encodeURIComponent(options.siteId ?? this.requireSiteId())}/media/${encodeURIComponent(mediaId)}`,
      {
        method: "PATCH",
        body,
        requestId: options.requestId ?? requestId,
        headers: liveManagementHeaders(options),
        credentials: options.credentials,
      },
    );
  }

  replaceMedia(
    mediaId: string,
    input: BackyAdminMediaReplaceInput,
    options: BackyLiveManagementRequestOptions = {},
  ): Promise<BackyAdminMediaResponse> {
    return this.request(
      `/api/admin/sites/${encodeURIComponent(options.siteId ?? this.requireSiteId())}/media/${encodeURIComponent(mediaId)}`,
      {
        method: "POST",
        body: buildBackyMediaUploadFormData(input),
        requestId: options.requestId ?? input.requestId,
        headers: liveManagementHeaders(options),
        credentials: options.credentials,
      },
    );
  }

  deleteAdminMedia(
    mediaId: string,
    options: BackyLiveManagementRequestOptions = {},
  ): Promise<BackyAdminMediaDeleteResponse> {
    return this.request(
      `/api/admin/sites/${encodeURIComponent(options.siteId ?? this.requireSiteId())}/media/${encodeURIComponent(mediaId)}`,
      {
        method: "DELETE",
        requestId: options.requestId,
        headers: liveManagementHeaders(options),
        credentials: options.credentials,
      },
    );
  }

  adminMediaFolders(
    options: BackyLiveManagementRequestOptions = {},
  ): Promise<BackyAdminMediaFoldersResponse> {
    return this.request(
      `/api/admin/sites/${encodeURIComponent(options.siteId ?? this.requireSiteId())}/media/folders`,
      {
        requestId: options.requestId,
        headers: liveManagementHeaders(options),
        credentials: options.credentials,
      },
    );
  }

  createMediaFolder(
    input: BackyAdminMediaFolderInput,
    options: BackyLiveManagementRequestOptions = {},
  ): Promise<BackyAdminMediaFolderResponse> {
    const { requestId, ...body } = input;
    return this.request(
      `/api/admin/sites/${encodeURIComponent(options.siteId ?? this.requireSiteId())}/media/folders`,
      {
        method: "POST",
        body,
        requestId: options.requestId ?? requestId,
        headers: liveManagementHeaders(options),
        credentials: options.credentials,
      },
    );
  }

  updateMediaFolder(
    folderId: string,
    input: BackyAdminMediaFolderInput,
    options: BackyLiveManagementRequestOptions = {},
  ): Promise<BackyAdminMediaFolderResponse> {
    const { requestId, ...body } = input;
    return this.request(
      `/api/admin/sites/${encodeURIComponent(options.siteId ?? this.requireSiteId())}/media/folders/${encodeURIComponent(folderId)}`,
      {
        method: "PATCH",
        body,
        requestId: options.requestId ?? requestId,
        headers: liveManagementHeaders(options),
        credentials: options.credentials,
      },
    );
  }

  deleteMediaFolder(
    folderId: string,
    options: BackyLiveManagementRequestOptions = {},
  ): Promise<BackyAdminMediaFolderDeleteResponse> {
    return this.request(
      `/api/admin/sites/${encodeURIComponent(options.siteId ?? this.requireSiteId())}/media/folders/${encodeURIComponent(folderId)}`,
      {
        method: "DELETE",
        requestId: options.requestId,
        headers: liveManagementHeaders(options),
        credentials: options.credentials,
      },
    );
  }

  mediaFolders(
    siteId = this.requireSiteId(),
  ): Promise<BackyEnvelope<BackyMediaFolderList>> {
    return this.request(
      `/api/sites/${encodeURIComponent(siteId)}/media/folders`,
    );
  }

  mediaFoldersCached(
    options: BackyConditionalOptions = {},
  ): Promise<BackyConditionalResult<BackyEnvelope<BackyMediaFolderList>>> {
    return this.requestConditionalJson(
      `/api/sites/${encodeURIComponent(options.siteId ?? this.requireSiteId())}/media/folders`,
      {
        ifNoneMatch: options.etag,
        requestId: options.requestId,
      },
    );
  }

  mediaAsset(
    mediaId: string,
  ): Promise<BackyEnvelope<{ media: BackyMediaAsset }>> {
    return this.request(
      `/api/sites/${encodeURIComponent(this.requireSiteId())}/media/${encodeURIComponent(mediaId)}`,
    );
  }

  mediaAssetCached(
    mediaId: string,
    options: BackyConditionalOptions = {},
  ): Promise<
    BackyConditionalResult<BackyEnvelope<{ media: BackyMediaAsset }>>
  > {
    return this.requestConditionalJson(
      `/api/sites/${encodeURIComponent(options.siteId ?? this.requireSiteId())}/media/${encodeURIComponent(mediaId)}`,
      {
        ifNoneMatch: options.etag,
        requestId: options.requestId,
      },
    );
  }

  bindMedia(
    mediaId: string,
    input: BackyMediaBindingInputSource,
    options: BackyMediaBindingRequestOptions = {},
  ): Promise<BackyMediaBindingResponse> {
    const body = buildBackyMediaBindingInput(input);
    return this.request(
      `/api/admin/sites/${encodeURIComponent(options.siteId ?? this.requireSiteId())}/media/${encodeURIComponent(mediaId)}/bind`,
      {
        method: "POST",
        body,
        requestId: options.requestId ?? body.requestId,
        headers: liveManagementHeaders(options),
        credentials: options.credentials,
      },
    );
  }

  createMediaSignedUrl(
    mediaId: string,
    input: BackyMediaSignedUrlInputSource = {},
    options: BackyMediaSignedUrlRequestOptions = {},
  ): Promise<BackyMediaSignedUrlResponse> {
    const body = buildBackyMediaSignedUrlInput(input);
    return this.request(
      `/api/admin/sites/${encodeURIComponent(options.siteId ?? this.requireSiteId())}/media/${encodeURIComponent(mediaId)}/signed-url`,
      {
        method: "POST",
        body,
        requestId: options.requestId ?? body.requestId,
        headers: liveManagementHeaders(options),
        credentials: options.credentials,
      },
    );
  }

  mediaFonts(
    siteId = this.requireSiteId(),
  ): Promise<BackyEnvelope<BackyFontManifest>> {
    return this.request(`/api/sites/${encodeURIComponent(siteId)}/media/fonts`);
  }

  mediaFontsCached(
    options: BackyConditionalOptions = {},
  ): Promise<BackyConditionalResult<BackyEnvelope<BackyFontManifest>>> {
    return this.requestConditionalJson(
      `/api/sites/${encodeURIComponent(options.siteId ?? this.requireSiteId())}/media/fonts`,
      {
        ifNoneMatch: options.etag,
        requestId: options.requestId,
      },
    );
  }

  mediaFileUrl(
    mediaId: string,
    access: {
      token?: string;
      expiresAt?: number;
      disposition?: "inline" | "attachment";
    } = {},
  ): string {
    const searchParams = new URLSearchParams();
    if (access.token) searchParams.set("token", access.token);
    if (access.expiresAt)
      searchParams.set("expiresAt", String(access.expiresAt));
    if (access.disposition) searchParams.set("disposition", access.disposition);
    const query = searchParams.toString();
    return `${this.baseUrl}/api/sites/${encodeURIComponent(this.requireSiteId())}/media/${encodeURIComponent(mediaId)}/file${query ? `?${query}` : ""}`;
  }

  mediaTransformUrl(
    mediaId: string,
    options: { width: number; quality?: number },
  ): string {
    const searchParams = new URLSearchParams({
      width: String(options.width),
    });
    if (options.quality !== undefined) {
      searchParams.set("quality", String(options.quality));
    }
    return `${this.baseUrl}/api/sites/${encodeURIComponent(this.requireSiteId())}/media/${encodeURIComponent(mediaId)}/transform?${searchParams.toString()}`;
  }

  collections(
    siteId = this.requireSiteId(),
  ): Promise<BackyEnvelope<{ collections: BackyCollectionSchema[] }>> {
    return this.request(`/api/sites/${encodeURIComponent(siteId)}/collections`);
  }

  collectionsCached(
    options: BackyConditionalOptions = {},
  ): Promise<
    BackyConditionalResult<
      BackyEnvelope<{ collections: BackyCollectionSchema[] }>
    >
  > {
    return this.requestConditionalJson(
      `/api/sites/${encodeURIComponent(options.siteId ?? this.requireSiteId())}/collections`,
      {
        ifNoneMatch: options.etag,
        requestId: options.requestId,
      },
    );
  }

  collection(
    collectionId: string,
  ): Promise<BackyEnvelope<{ collection: BackyCollectionSchema }>> {
    return this.request(
      `/api/sites/${encodeURIComponent(this.requireSiteId())}/collections/${encodeURIComponent(collectionId)}`,
    );
  }

  collectionCached(
    collectionId: string,
    options: BackyConditionalOptions = {},
  ): Promise<
    BackyConditionalResult<BackyEnvelope<{ collection: BackyCollectionSchema }>>
  > {
    return this.requestConditionalJson(
      `/api/sites/${encodeURIComponent(options.siteId ?? this.requireSiteId())}/collections/${encodeURIComponent(collectionId)}`,
      {
        ifNoneMatch: options.etag,
        requestId: options.requestId,
      },
    );
  }

  adminCollections(
    options: BackyAdminCollectionListOptions = {},
  ): Promise<BackyAdminCollectionsResponse> {
    const { requestId, siteId, headers, credentials, rest } =
      splitLiveManagementRequestOptions(options);
    const query = normalizeListQuery({
      limit: rest.limit,
      offset: rest.offset,
    });
    return this.request(
      `/api/admin/sites/${encodeURIComponent(siteId ?? this.requireSiteId())}/collections`,
      {
        query,
        requestId,
        headers,
        credentials,
      },
    );
  }

  createAdminCollection(
    input: BackyAdminCollectionCreateInput,
    options: BackyLiveManagementRequestOptions = {},
  ): Promise<BackyAdminCollectionResponse> {
    const { requestId, ...body } = input;
    return this.request(
      `/api/admin/sites/${encodeURIComponent(options.siteId ?? this.requireSiteId())}/collections`,
      {
        method: "POST",
        body,
        requestId: options.requestId ?? requestId,
        headers: liveManagementHeaders(options),
        credentials: options.credentials,
      },
    );
  }

  adminCollection(
    collectionId: string,
    options: BackyLiveManagementRequestOptions = {},
  ): Promise<BackyAdminCollectionResponse> {
    return this.request(
      `/api/admin/sites/${encodeURIComponent(options.siteId ?? this.requireSiteId())}/collections/${encodeURIComponent(collectionId)}`,
      {
        requestId: options.requestId,
        headers: liveManagementHeaders(options),
        credentials: options.credentials,
      },
    );
  }

  updateAdminCollection(
    collectionId: string,
    input: BackyAdminCollectionUpdateInput,
    options: BackyLiveManagementRequestOptions = {},
  ): Promise<BackyAdminCollectionResponse> {
    const { requestId: inputRequestId, ...body } = input;
    const requestId =
      typeof inputRequestId === "string" ? inputRequestId : undefined;
    return this.request(
      `/api/admin/sites/${encodeURIComponent(options.siteId ?? this.requireSiteId())}/collections/${encodeURIComponent(collectionId)}`,
      {
        method: "PATCH",
        body,
        requestId: options.requestId ?? requestId,
        headers: liveManagementHeaders(options),
        credentials: options.credentials,
      },
    );
  }

  deleteAdminCollection(
    collectionId: string,
    options: BackyLiveManagementRequestOptions = {},
  ): Promise<BackyAdminCollectionDeleteResponse> {
    return this.request(
      `/api/admin/sites/${encodeURIComponent(options.siteId ?? this.requireSiteId())}/collections/${encodeURIComponent(collectionId)}`,
      {
        method: "DELETE",
        requestId: options.requestId,
        headers: liveManagementHeaders(options),
        credentials: options.credentials,
      },
    );
  }

  adminCollectionRecords<
    TValues extends Record<string, unknown> = Record<string, unknown>,
  >(
    collectionId: string,
    options: BackyAdminCollectionRecordListOptions = {},
  ): Promise<BackyAdminCollectionRecordsResponse<TValues>> {
    const { requestId, siteId, headers, credentials, rest } =
      splitLiveManagementRequestOptions(options);
    const query = {
      status: rest.status,
      slug: rest.slug,
      q: rest.q,
      search: rest.search,
      fieldKey: rest.fieldKey,
      fieldValue: rest.fieldValue,
      sortBy: rest.sortBy,
      sortDirection: rest.sortDirection,
      limit: rest.limit,
      offset: rest.offset,
    };
    return this.request(
      `/api/admin/sites/${encodeURIComponent(siteId ?? this.requireSiteId())}/collections/${encodeURIComponent(collectionId)}/records`,
      {
        query,
        requestId,
        headers,
        credentials,
      },
    );
  }

  createAdminCollectionRecord<
    TValues extends Record<string, unknown> = Record<string, unknown>,
  >(
    collectionId: string,
    input: BackyAdminCollectionRecordCreateInput<TValues>,
    options: BackyLiveManagementRequestOptions = {},
  ): Promise<BackyAdminCollectionRecordResponse<TValues>> {
    const { requestId, ...body } = input;
    return this.request(
      `/api/admin/sites/${encodeURIComponent(options.siteId ?? this.requireSiteId())}/collections/${encodeURIComponent(collectionId)}/records`,
      {
        method: "POST",
        body,
        requestId: options.requestId ?? requestId,
        headers: liveManagementHeaders(options),
        credentials: options.credentials,
      },
    );
  }

  adminCollectionRecord<
    TValues extends Record<string, unknown> = Record<string, unknown>,
  >(
    collectionId: string,
    recordId: string,
    options: BackyLiveManagementRequestOptions = {},
  ): Promise<BackyAdminCollectionRecordResponse<TValues>> {
    return this.request(
      `/api/admin/sites/${encodeURIComponent(options.siteId ?? this.requireSiteId())}/collections/${encodeURIComponent(collectionId)}/records/${encodeURIComponent(recordId)}`,
      {
        requestId: options.requestId,
        headers: liveManagementHeaders(options),
        credentials: options.credentials,
      },
    );
  }

  updateAdminCollectionRecord<
    TValues extends Record<string, unknown> = Record<string, unknown>,
  >(
    collectionId: string,
    recordId: string,
    input: BackyAdminCollectionRecordUpdateInput<TValues>,
    options: BackyLiveManagementRequestOptions = {},
  ): Promise<BackyAdminCollectionRecordResponse<TValues>> {
    const { requestId: inputRequestId, ...body } = input;
    const requestId =
      typeof inputRequestId === "string" ? inputRequestId : undefined;
    return this.request(
      `/api/admin/sites/${encodeURIComponent(options.siteId ?? this.requireSiteId())}/collections/${encodeURIComponent(collectionId)}/records/${encodeURIComponent(recordId)}`,
      {
        method: "PATCH",
        body,
        requestId: options.requestId ?? requestId,
        headers: liveManagementHeaders(options),
        credentials: options.credentials,
      },
    );
  }

  deleteAdminCollectionRecord(
    collectionId: string,
    recordId: string,
    options: BackyLiveManagementRequestOptions = {},
  ): Promise<BackyAdminCollectionRecordDeleteResponse> {
    return this.request(
      `/api/admin/sites/${encodeURIComponent(options.siteId ?? this.requireSiteId())}/collections/${encodeURIComponent(collectionId)}/records/${encodeURIComponent(recordId)}`,
      {
        method: "DELETE",
        requestId: options.requestId,
        headers: liveManagementHeaders(options),
        credentials: options.credentials,
      },
    );
  }

  reusableSections(
    options: {
      category?: string;
      tag?: string;
      search?: string;
      siteId?: string;
    } = {},
  ): Promise<
    BackyEnvelope<{
      sections: BackyReusableSection[];
      pagination: BackyPagination;
    }>
  > {
    const { siteId, ...query } = options;
    return this.request(
      `/api/sites/${encodeURIComponent(siteId ?? this.requireSiteId())}/reusable-sections`,
      {
        query,
      },
    );
  }

  reusableSectionsCached(
    options: {
      category?: string;
      tag?: string;
      search?: string;
    } & BackyConditionalOptions = {},
  ): Promise<
    BackyConditionalResult<
      BackyEnvelope<{
        sections: BackyReusableSection[];
        pagination: BackyPagination;
      }>
    >
  > {
    const { requestId, etag, siteId, ...query } = options;
    return this.requestConditionalJson(
      `/api/sites/${encodeURIComponent(siteId ?? this.requireSiteId())}/reusable-sections`,
      {
        query,
        ifNoneMatch: etag,
        requestId,
      },
    );
  }

  reusableSection(
    sectionId: string,
    siteId = this.requireSiteId(),
  ): Promise<BackyEnvelope<{ section: BackyReusableSection }>> {
    return this.request(
      `/api/sites/${encodeURIComponent(siteId)}/reusable-sections/${encodeURIComponent(sectionId)}`,
    );
  }

  reusableSectionCached(
    sectionId: string,
    options: BackyConditionalOptions = {},
  ): Promise<
    BackyConditionalResult<BackyEnvelope<{ section: BackyReusableSection }>>
  > {
    return this.requestConditionalJson(
      `/api/sites/${encodeURIComponent(options.siteId ?? this.requireSiteId())}/reusable-sections/${encodeURIComponent(sectionId)}`,
      {
        ifNoneMatch: options.etag,
        requestId: options.requestId,
      },
    );
  }

  adminReusableSections(
    options: BackyAdminReusableSectionListOptions = {},
  ): Promise<BackyAdminReusableSectionsResponse> {
    const { requestId, siteId, headers, credentials, rest } =
      splitLiveManagementRequestOptions(options);
    const query = {
      status: rest.status,
      category: rest.category,
      tag: rest.tag,
      search: rest.search,
      limit: rest.limit,
      offset: rest.offset,
    };
    return this.request(
      `/api/admin/sites/${encodeURIComponent(siteId ?? this.requireSiteId())}/reusable-sections`,
      {
        query,
        requestId,
        headers,
        credentials,
      },
    );
  }

  createAdminReusableSection(
    input: BackyAdminReusableSectionCreateInput,
    options: BackyLiveManagementRequestOptions = {},
  ): Promise<BackyAdminReusableSectionResponse> {
    const { requestId, ...body } = input;
    return this.request(
      `/api/admin/sites/${encodeURIComponent(options.siteId ?? this.requireSiteId())}/reusable-sections`,
      {
        method: "POST",
        body,
        requestId: options.requestId ?? requestId,
        headers: liveManagementHeaders(options),
        credentials: options.credentials,
      },
    );
  }

  adminReusableSection(
    sectionId: string,
    options: BackyLiveManagementRequestOptions = {},
  ): Promise<BackyAdminReusableSectionResponse> {
    return this.request(
      `/api/admin/sites/${encodeURIComponent(options.siteId ?? this.requireSiteId())}/reusable-sections/${encodeURIComponent(sectionId)}`,
      {
        requestId: options.requestId,
        headers: liveManagementHeaders(options),
        credentials: options.credentials,
      },
    );
  }

  updateAdminReusableSection(
    sectionId: string,
    input: BackyAdminReusableSectionUpdateInput,
    options: BackyLiveManagementRequestOptions = {},
  ): Promise<BackyAdminReusableSectionResponse> {
    const { requestId: inputRequestId, ...body } = input;
    const requestId =
      typeof inputRequestId === "string" ? inputRequestId : undefined;
    return this.request(
      `/api/admin/sites/${encodeURIComponent(options.siteId ?? this.requireSiteId())}/reusable-sections/${encodeURIComponent(sectionId)}`,
      {
        method: "PATCH",
        body,
        requestId: options.requestId ?? requestId,
        headers: liveManagementHeaders(options),
        credentials: options.credentials,
      },
    );
  }

  deleteAdminReusableSection(
    sectionId: string,
    options: BackyLiveManagementRequestOptions = {},
  ): Promise<BackyAdminReusableSectionDeleteResponse> {
    return this.request(
      `/api/admin/sites/${encodeURIComponent(options.siteId ?? this.requireSiteId())}/reusable-sections/${encodeURIComponent(sectionId)}`,
      {
        method: "DELETE",
        requestId: options.requestId,
        headers: liveManagementHeaders(options),
        credentials: options.credentials,
      },
    );
  }

  adminReusableSectionVersions(
    sectionId: string,
    options: BackyLiveManagementRequestOptions = {},
  ): Promise<BackyAdminReusableSectionVersionsResponse> {
    return this.request(
      `/api/admin/sites/${encodeURIComponent(options.siteId ?? this.requireSiteId())}/reusable-sections/${encodeURIComponent(sectionId)}/versions`,
      {
        requestId: options.requestId,
        headers: liveManagementHeaders(options),
        credentials: options.credentials,
      },
    );
  }

  restoreAdminReusableSectionVersion(
    sectionId: string,
    version: number | string,
    input: BackyAdminReusableSectionRestoreInput = {},
    options: BackyLiveManagementRequestOptions = {},
  ): Promise<BackyAdminReusableSectionRestoreResponse> {
    const { requestId, ...body } = input;
    return this.request(
      `/api/admin/sites/${encodeURIComponent(options.siteId ?? this.requireSiteId())}/reusable-sections/${encodeURIComponent(sectionId)}/versions/${encodeURIComponent(String(version))}/restore`,
      {
        method: "POST",
        body,
        requestId: options.requestId ?? requestId,
        headers: liveManagementHeaders(options),
        credentials: options.credentials,
      },
    );
  }

  records<TValues extends Record<string, unknown> = Record<string, unknown>>(
    collectionId: string,
    options: BackyCollectionRecordListOptions = {},
  ): Promise<
    BackyEnvelope<{
      collection: BackyCollectionSchema;
      records: Array<BackyCollectionRecord<TValues>>;
      pagination: BackyPagination;
    }>
  > {
    const { requestId, ...queryOptions } = options;
    const query = normalizeListQuery(queryOptions);
    return this.request(
      `/api/sites/${encodeURIComponent(this.requireSiteId())}/collections/${encodeURIComponent(collectionId)}/records`,
      {
        query,
        requestId,
      },
    );
  }

  recordsCached<
    TValues extends Record<string, unknown> = Record<string, unknown>,
  >(
    collectionId: string,
    options: BackyCollectionRecordListOptions & BackyConditionalOptions = {},
  ): Promise<
    BackyConditionalResult<
      BackyEnvelope<{
        collection: BackyCollectionSchema;
        records: Array<BackyCollectionRecord<TValues>>;
        pagination: BackyPagination;
      }>
    >
  > {
    const { requestId, etag, siteId, ...queryOptions } = options;
    const query = normalizeListQuery(queryOptions);
    return this.requestConditionalJson(
      `/api/sites/${encodeURIComponent(siteId ?? this.requireSiteId())}/collections/${encodeURIComponent(collectionId)}/records`,
      {
        query,
        ifNoneMatch: etag,
        requestId,
      },
    );
  }

  commerceCatalog(
    options: BackyCommerceCatalogOptions = {},
  ): Promise<BackyEnvelope<BackyCommerceCatalog>> {
    const { requestId, siteId, ...queryOptions } = options;
    const query = normalizeListQuery(queryOptions);
    return this.request(
      `/api/sites/${encodeURIComponent(siteId ?? this.requireSiteId())}/commerce/catalog`,
      {
        query,
        requestId,
      },
    );
  }

  commerceCatalogCached(
    options: BackyCommerceCatalogOptions & BackyConditionalOptions = {},
  ): Promise<BackyConditionalResult<BackyEnvelope<BackyCommerceCatalog>>> {
    const { requestId, etag, siteId, ...queryOptions } = options;
    const query = normalizeListQuery(queryOptions);
    return this.requestConditionalJson(
      `/api/sites/${encodeURIComponent(siteId ?? this.requireSiteId())}/commerce/catalog`,
      {
        query,
        ifNoneMatch: etag,
        requestId,
      },
    );
  }

  commerceOrderContract(
    siteId = this.requireSiteId(),
  ): Promise<BackyEnvelope<BackyCommerceOrderContract>> {
    return this.request(
      `/api/sites/${encodeURIComponent(siteId)}/commerce/orders`,
    );
  }

  commerceOrderContractCached(
    options: BackyConditionalOptions = {},
  ): Promise<
    BackyConditionalResult<BackyEnvelope<BackyCommerceOrderContract>>
  > {
    return this.requestConditionalJson(
      `/api/sites/${encodeURIComponent(options.siteId ?? this.requireSiteId())}/commerce/orders`,
      {
        ifNoneMatch: options.etag,
        requestId: options.requestId,
      },
    );
  }

  commerceOrderAnalytics(
    options: BackyLiveManagementRequestOptions = {},
  ): Promise<BackyCommerceOrderAnalyticsResponse> {
    return this.request(
      `/api/admin/sites/${encodeURIComponent(options.siteId ?? this.requireSiteId())}/commerce/orders/analytics`,
      {
        requestId: options.requestId,
        headers: liveManagementHeaders(options),
        credentials: options.credentials,
      },
    );
  }

  commerceProductProviderSync(
    productId: string,
    options: BackyLiveManagementRequestOptions = {},
  ): Promise<BackyCommerceProductProviderSyncResponse> {
    return this.request(
      `/api/admin/sites/${encodeURIComponent(options.siteId ?? this.requireSiteId())}/commerce/products/${encodeURIComponent(productId)}/provider-sync`,
      {
        requestId: options.requestId,
        headers: liveManagementHeaders(options),
        credentials: options.credentials,
      },
    );
  }

  syncCommerceProductProvider(
    productId: string,
    input: BackyCommerceProductProviderSyncInput = {},
    options: BackyLiveManagementRequestOptions = {},
  ): Promise<BackyCommerceProductProviderSyncResponse> {
    const { requestId, ...body } = input;
    return this.request(
      `/api/admin/sites/${encodeURIComponent(options.siteId ?? this.requireSiteId())}/commerce/products/${encodeURIComponent(productId)}/provider-sync`,
      {
        method: "POST",
        body,
        requestId: options.requestId ?? requestId,
        headers: liveManagementHeaders(options),
        credentials: options.credentials,
      },
    );
  }

  commerceOrderQuote(
    orderId: string,
    options: BackyLiveManagementRequestOptions = {},
  ): Promise<BackyCommerceOrderQuoteResponse> {
    return this.request(
      `/api/admin/sites/${encodeURIComponent(options.siteId ?? this.requireSiteId())}/commerce/orders/${encodeURIComponent(orderId)}/quote`,
      {
        requestId: options.requestId,
        headers: liveManagementHeaders(options),
        credentials: options.credentials,
      },
    );
  }

  refreshCommerceOrderQuote(
    orderId: string,
    input: BackyCommerceOrderQuoteInput = {},
    options: BackyLiveManagementRequestOptions = {},
  ): Promise<BackyCommerceOrderQuoteResponse> {
    const { requestId, ...body } = input;
    return this.request(
      `/api/admin/sites/${encodeURIComponent(options.siteId ?? this.requireSiteId())}/commerce/orders/${encodeURIComponent(orderId)}/quote`,
      {
        method: "POST",
        body,
        requestId: options.requestId ?? requestId,
        headers: liveManagementHeaders(options),
        credentials: options.credentials,
      },
    );
  }

  commerceOrderTracking(
    orderId: string,
    options: BackyLiveManagementRequestOptions = {},
  ): Promise<BackyCommerceOrderTrackingResponse> {
    return this.request(
      `/api/admin/sites/${encodeURIComponent(options.siteId ?? this.requireSiteId())}/commerce/orders/${encodeURIComponent(orderId)}/tracking`,
      {
        requestId: options.requestId,
        headers: liveManagementHeaders(options),
        credentials: options.credentials,
      },
    );
  }

  refreshCommerceOrderTracking(
    orderId: string,
    input: BackyCommerceOrderTrackingInput = {},
    options: BackyLiveManagementRequestOptions = {},
  ): Promise<BackyCommerceOrderTrackingResponse> {
    const { requestId, ...body } = input;
    return this.request(
      `/api/admin/sites/${encodeURIComponent(options.siteId ?? this.requireSiteId())}/commerce/orders/${encodeURIComponent(orderId)}/tracking`,
      {
        method: "POST",
        body,
        requestId: options.requestId ?? requestId,
        headers: liveManagementHeaders(options),
        credentials: options.credentials,
      },
    );
  }

  commerceOrderProviderRefund(
    orderId: string,
    options: BackyLiveManagementRequestOptions = {},
  ): Promise<BackyCommerceOrderProviderRefundResponse> {
    return this.request(
      `/api/admin/sites/${encodeURIComponent(options.siteId ?? this.requireSiteId())}/commerce/orders/${encodeURIComponent(orderId)}/provider-refund`,
      {
        requestId: options.requestId,
        headers: liveManagementHeaders(options),
        credentials: options.credentials,
      },
    );
  }

  createCommerceOrderProviderRefund(
    orderId: string,
    input: BackyCommerceOrderProviderRefundInput = {},
    options: BackyLiveManagementRequestOptions = {},
  ): Promise<BackyCommerceOrderProviderRefundResponse> {
    const { requestId, ...body } = input;
    return this.request(
      `/api/admin/sites/${encodeURIComponent(options.siteId ?? this.requireSiteId())}/commerce/orders/${encodeURIComponent(orderId)}/provider-refund`,
      {
        method: "POST",
        body,
        requestId: options.requestId ?? requestId,
        headers: liveManagementHeaders(options),
        credentials: options.credentials,
      },
    );
  }

  refreshCommerceOrderProviderRefund(
    orderId: string,
    options: BackyLiveManagementRequestOptions = {},
  ): Promise<BackyCommerceOrderProviderRefundResponse> {
    return this.request(
      `/api/admin/sites/${encodeURIComponent(options.siteId ?? this.requireSiteId())}/commerce/orders/${encodeURIComponent(orderId)}/provider-refund`,
      {
        method: "PATCH",
        requestId: options.requestId,
        headers: liveManagementHeaders(options),
        credentials: options.credentials,
      },
    );
  }

  commerceOrderFulfillment(
    orderId: string,
    options: BackyLiveManagementRequestOptions = {},
  ): Promise<BackyCommerceOrderFulfillmentResponse> {
    return this.request(
      `/api/admin/sites/${encodeURIComponent(options.siteId ?? this.requireSiteId())}/commerce/orders/${encodeURIComponent(orderId)}/fulfillment`,
      {
        requestId: options.requestId,
        headers: liveManagementHeaders(options),
        credentials: options.credentials,
      },
    );
  }

  dispatchCommerceOrderFulfillment(
    orderId: string,
    input: BackyCommerceOrderFulfillmentInput = {},
    options: BackyLiveManagementRequestOptions = {},
  ): Promise<BackyCommerceOrderFulfillmentResponse> {
    const { requestId, ...body } = input;
    return this.request(
      `/api/admin/sites/${encodeURIComponent(options.siteId ?? this.requireSiteId())}/commerce/orders/${encodeURIComponent(orderId)}/fulfillment`,
      {
        method: "POST",
        body,
        requestId: options.requestId ?? requestId,
        headers: liveManagementHeaders(options),
        credentials: options.credentials,
      },
    );
  }

  commerceOrderShippingLabel(
    orderId: string,
    options: BackyLiveManagementRequestOptions = {},
  ): Promise<BackyCommerceOrderShippingLabelResponse> {
    return this.request(
      `/api/admin/sites/${encodeURIComponent(options.siteId ?? this.requireSiteId())}/commerce/orders/${encodeURIComponent(orderId)}/shipping-label`,
      {
        requestId: options.requestId,
        headers: liveManagementHeaders(options),
        credentials: options.credentials,
      },
    );
  }

  createCommerceOrderShippingLabel(
    orderId: string,
    input: BackyCommerceOrderShippingLabelInput = {},
    options: BackyLiveManagementRequestOptions = {},
  ): Promise<BackyCommerceOrderShippingLabelResponse> {
    const { requestId, ...body } = input;
    return this.request(
      `/api/admin/sites/${encodeURIComponent(options.siteId ?? this.requireSiteId())}/commerce/orders/${encodeURIComponent(orderId)}/shipping-label`,
      {
        method: "POST",
        body,
        requestId: options.requestId ?? requestId,
        headers: liveManagementHeaders(options),
        credentials: options.credentials,
      },
    );
  }

  voidCommerceOrderShippingLabel(
    orderId: string,
    input: BackyCommerceOrderShippingLabelInput = {},
    options: BackyLiveManagementRequestOptions = {},
  ): Promise<BackyCommerceOrderShippingLabelResponse> {
    const { requestId, ...body } = input;
    return this.request(
      `/api/admin/sites/${encodeURIComponent(options.siteId ?? this.requireSiteId())}/commerce/orders/${encodeURIComponent(orderId)}/shipping-label`,
      {
        method: "DELETE",
        body,
        requestId: options.requestId ?? requestId,
        headers: liveManagementHeaders(options),
        credentials: options.credentials,
      },
    );
  }

  commerceProductSubscriptions(
    productId: string,
    options: BackyLiveManagementRequestOptions = {},
  ): Promise<BackyCommerceProductSubscriptionsResponse> {
    return this.request(
      `/api/admin/sites/${encodeURIComponent(options.siteId ?? this.requireSiteId())}/commerce/products/${encodeURIComponent(productId)}/subscriptions`,
      {
        requestId: options.requestId,
        headers: liveManagementHeaders(options),
        credentials: options.credentials,
      },
    );
  }

  runCommerceProductSubscriptionAction(
    productId: string,
    orderId: string,
    input: BackyCommerceProductSubscriptionActionInput,
    options: BackyLiveManagementRequestOptions = {},
  ): Promise<BackyCommerceProductSubscriptionActionResponse> {
    const { requestId, ...body } = input;
    return this.request(
      `/api/admin/sites/${encodeURIComponent(options.siteId ?? this.requireSiteId())}/commerce/products/${encodeURIComponent(productId)}/subscriptions/${encodeURIComponent(orderId)}/action`,
      {
        method: "POST",
        body,
        requestId: options.requestId ?? requestId,
        headers: liveManagementHeaders(options),
        credentials: options.credentials,
      },
    );
  }

  runCommerceReconciliation(
    input: BackyCommerceReconciliationInput = {},
    options: BackyLiveManagementRequestOptions = {},
  ): Promise<BackyCommerceReconciliationResponse> {
    const { requestId, limit, ...body } = input;
    return this.request(
      `/api/admin/sites/${encodeURIComponent(options.siteId ?? this.requireSiteId())}/commerce/reconcile`,
      {
        method: "POST",
        query: { limit },
        body,
        requestId: options.requestId ?? requestId,
        headers: liveManagementHeaders(options),
        credentials: options.credentials,
      },
    );
  }

  scheduledCommerceReconciliation(
    options: BackyCommerceScheduledReconciliationOptions = {},
  ): Promise<BackyCommerceReconciliationResponse> {
    return this.request(
      `/api/admin/sites/${encodeURIComponent(options.siteId ?? this.requireSiteId())}/commerce/reconcile`,
      {
        query: {
          dryRun: options.dryRun,
          limit: options.limit,
        },
        requestId: options.requestId,
        headers: liveManagementHeaders(options),
        credentials: options.credentials,
      },
    );
  }

  createCommerceOrder(
    input: BackyCommerceOrderInput,
    siteId = this.requireSiteId(),
  ): Promise<
    BackyEnvelope<{
      schemaVersion: "backy.commerce-orders.v1";
      order: BackyCommerceOrderSummary;
      checkoutSession?: BackyCommerceCheckoutSession;
      lineItems: Array<Record<string, unknown>>;
    }>
  > {
    return this.request(
      `/api/sites/${encodeURIComponent(siteId)}/commerce/orders`,
      {
        method: "POST",
        body: input,
        requestId: input.requestId,
      },
    );
  }

  receiveCommerceWebhook(
    input: BackyCommerceWebhookInput,
    siteId = this.requireSiteId(),
    requestId?: string,
  ): Promise<BackyEnvelope<BackyCommerceWebhookResult>> {
    return this.request(
      `/api/sites/${encodeURIComponent(siteId)}/commerce/webhook`,
      {
        method: "POST",
        body: input,
        requestId,
      },
    );
  }

  createRecord<
    TValues extends Record<string, unknown> = Record<string, unknown>,
  >(
    collectionId: string,
    values: TValues,
    slugOrOptions?: string | BackyCollectionRecordCreateOptions,
    options: BackyCollectionRecordWriteOptions = {},
  ): Promise<BackyEnvelope<BackyCollectionRecordMutationResult<TValues>>> {
    const writeOptions =
      typeof slugOrOptions === "string"
        ? { ...options, slug: slugOrOptions }
        : (slugOrOptions ?? {});
    const { siteId, requestId, publicWriteToken, slug } = writeOptions;

    return this.request(
      `/api/sites/${encodeURIComponent(siteId ?? this.requireSiteId())}/collections/${encodeURIComponent(collectionId)}/records`,
      {
        method: "POST",
        body: { values, slug, publicWriteToken },
        requestId,
      },
    );
  }

  updateRecord<
    TValues extends Record<string, unknown> = Record<string, unknown>,
  >(
    collectionId: string,
    recordId: string,
    values: Partial<TValues>,
    options: BackyCollectionRecordWriteOptions = {},
  ): Promise<BackyEnvelope<BackyCollectionRecordMutationResult<TValues>>> {
    const { siteId, requestId, publicWriteToken } = options;

    return this.request(
      `/api/sites/${encodeURIComponent(siteId ?? this.requireSiteId())}/collections/${encodeURIComponent(collectionId)}/records/${encodeURIComponent(recordId)}`,
      {
        method: "PATCH",
        body: { values, publicWriteToken },
        requestId,
      },
    );
  }

  deleteRecord(
    collectionId: string,
    recordId: string,
    options: BackyCollectionRecordWriteOptions = {},
  ): Promise<BackyEnvelope<BackyCollectionRecordDeleteResult>> {
    const { siteId, requestId, publicWriteToken } = options;

    return this.request(
      `/api/sites/${encodeURIComponent(siteId ?? this.requireSiteId())}/collections/${encodeURIComponent(collectionId)}/records/${encodeURIComponent(recordId)}`,
      {
        method: "DELETE",
        body: { publicWriteToken },
        requestId,
      },
    );
  }

  forms(
    options: BackyFormListOptions = {},
  ): Promise<
    BackyEnvelope<{
      forms: BackyFormDefinition[];
      total?: number;
      pagination?: BackyPagination;
    }>
  > {
    const { requestId, siteId, ...query } = options;
    return this.request(
      `/api/sites/${encodeURIComponent(siteId ?? this.requireSiteId())}/forms`,
      {
        query,
        requestId,
      },
    );
  }

  formsCached(
    options: BackyFormListOptions & BackyConditionalOptions = {},
  ): Promise<
    BackyConditionalResult<
      BackyEnvelope<{
        forms: BackyFormDefinition[];
        total?: number;
        pagination?: BackyPagination;
      }>
    >
  > {
    const { requestId, etag, siteId, ...query } = options;
    return this.requestConditionalJson(
      `/api/sites/${encodeURIComponent(siteId ?? this.requireSiteId())}/forms`,
      {
        query,
        ifNoneMatch: etag,
        requestId,
      },
    );
  }

  form(
    formId: string,
  ): Promise<
    BackyEnvelope<{ form: BackyFormDefinition; endpoints: BackyFormEndpoints }>
  > {
    return this.request(
      `/api/sites/${encodeURIComponent(this.requireSiteId())}/forms/${encodeURIComponent(formId)}`,
    );
  }

  formDefinition(
    formId: string,
  ): Promise<
    BackyEnvelope<{
      schemaVersion: "backy.form-definition.v1";
      form: BackyFormDefinition;
      submitUrl: string;
    }>
  > {
    return this.request(
      `/api/sites/${encodeURIComponent(this.requireSiteId())}/forms/${encodeURIComponent(formId)}/definition`,
    );
  }

  formDefinitionCached(
    formId: string,
    options: BackyConditionalOptions = {},
  ): Promise<
    BackyConditionalResult<
      BackyEnvelope<{
        schemaVersion: "backy.form-definition.v1";
        form: BackyFormDefinition;
        submitUrl: string;
      }>
    >
  > {
    return this.requestConditionalJson(
      `/api/sites/${encodeURIComponent(options.siteId ?? this.requireSiteId())}/forms/${encodeURIComponent(formId)}/definition`,
      {
        ifNoneMatch: options.etag,
        requestId: options.requestId,
      },
    );
  }

  adminForms(
    options: BackyAdminFormListOptions = {},
  ): Promise<BackyAdminFormsResponse> {
    const { requestId, siteId, headers, credentials, rest } =
      splitLiveManagementRequestOptions(options);
    const query = normalizeListQuery(rest as BackyAdminFormListOptions);
    return this.request(
      `/api/admin/sites/${encodeURIComponent(siteId ?? this.requireSiteId())}/forms`,
      {
        query,
        requestId,
        headers,
        credentials,
      },
    );
  }

  createAdminForm(
    input: BackyAdminFormMutationInput,
    options: BackyLiveManagementRequestOptions = {},
  ): Promise<BackyAdminFormResponse> {
    const { requestId, ...body } = input;
    return this.request(
      `/api/admin/sites/${encodeURIComponent(options.siteId ?? this.requireSiteId())}/forms`,
      {
        method: "POST",
        body,
        requestId: options.requestId ?? requestId,
        headers: liveManagementHeaders(options),
        credentials: options.credentials,
      },
    );
  }

  adminForm(
    formId: string,
    options: BackyLiveManagementRequestOptions = {},
  ): Promise<BackyAdminFormResponse> {
    return this.request(
      `/api/admin/sites/${encodeURIComponent(options.siteId ?? this.requireSiteId())}/forms/${encodeURIComponent(formId)}`,
      {
        requestId: options.requestId,
        headers: liveManagementHeaders(options),
        credentials: options.credentials,
      },
    );
  }

  updateAdminForm(
    formId: string,
    input: BackyAdminFormMutationInput,
    options: BackyLiveManagementRequestOptions = {},
  ): Promise<BackyAdminFormResponse> {
    const { requestId, ...body } = input;
    return this.request(
      `/api/admin/sites/${encodeURIComponent(options.siteId ?? this.requireSiteId())}/forms/${encodeURIComponent(formId)}`,
      {
        method: "PATCH",
        body,
        requestId: options.requestId ?? requestId,
        headers: liveManagementHeaders(options),
        credentials: options.credentials,
      },
    );
  }

  deleteAdminForm(
    formId: string,
    options: BackyLiveManagementRequestOptions = {},
  ): Promise<BackyAdminFormDeleteResponse> {
    return this.request(
      `/api/admin/sites/${encodeURIComponent(options.siteId ?? this.requireSiteId())}/forms/${encodeURIComponent(formId)}`,
      {
        method: "DELETE",
        requestId: options.requestId,
        headers: liveManagementHeaders(options),
        credentials: options.credentials,
      },
    );
  }

  formsAnalytics(
    options: BackyAdminFormsAnalyticsOptions = {},
  ): Promise<BackyAdminFormsAnalyticsResponse> {
    const { requestId, siteId, headers, credentials, rest } =
      splitLiveManagementRequestOptions(options);
    return this.request(
      `/api/admin/sites/${encodeURIComponent(siteId ?? this.requireSiteId())}/forms/analytics`,
      {
        query: rest as Record<string, string | number | boolean | undefined>,
        requestId,
        headers,
        credentials,
      },
    );
  }

  formContactSegments(
    options: BackyAdminFormContactSegmentsOptions = {},
  ): Promise<BackyAdminFormContactSegmentsResponse> {
    const { requestId, siteId, headers, credentials, rest } =
      splitLiveManagementRequestOptions(options);
    return this.request(
      `/api/admin/sites/${encodeURIComponent(siteId ?? this.requireSiteId())}/forms/contact-segments`,
      {
        query: rest as Record<string, string | number | boolean | undefined>,
        requestId,
        headers,
        credentials,
      },
    );
  }

  formContactLists(
    options: BackyLiveManagementRequestOptions = {},
  ): Promise<BackyAdminFormContactListsResponse> {
    return this.request(
      `/api/admin/sites/${encodeURIComponent(options.siteId ?? this.requireSiteId())}/forms/contact-lists`,
      {
        requestId: options.requestId,
        headers: liveManagementHeaders(options),
        credentials: options.credentials,
      },
    );
  }

  saveFormContactList(
    input: BackyAdminFormContactListInput,
    options: BackyLiveManagementRequestOptions = {},
  ): Promise<BackyAdminFormContactListMutationResponse> {
    const { requestId, ...body } = input;
    return this.request(
      `/api/admin/sites/${encodeURIComponent(options.siteId ?? this.requireSiteId())}/forms/contact-lists`,
      {
        method: "POST",
        body,
        requestId: options.requestId ?? requestId,
        headers: liveManagementHeaders(options),
        credentials: options.credentials,
      },
    );
  }

  deleteFormContactList(
    input: Pick<BackyAdminFormContactListInput, "id" | "listId" | "requestId">,
    options: BackyLiveManagementRequestOptions = {},
  ): Promise<BackyAdminFormContactListMutationResponse> {
    const { requestId, ...body } = input;
    return this.request(
      `/api/admin/sites/${encodeURIComponent(options.siteId ?? this.requireSiteId())}/forms/contact-lists`,
      {
        method: "DELETE",
        body,
        requestId: options.requestId ?? requestId,
        headers: liveManagementHeaders(options),
        credentials: options.credentials,
      },
    );
  }

  formSubmissions(
    formId: string,
    options: BackyAdminFormSubmissionListOptions = {},
  ): Promise<BackyAdminFormSubmissionsResponse> {
    const { requestId, siteId, headers, credentials, rest } =
      splitLiveManagementRequestOptions(options);
    const { submissionRequestId, ...queryOptions } = rest;
    const query = normalizeListQuery({
      ...queryOptions,
      requestId: submissionRequestId,
    } as BackyListOptions & { status?: string; requestId?: string });
    return this.request(
      `/api/admin/sites/${encodeURIComponent(siteId ?? this.requireSiteId())}/forms/${encodeURIComponent(formId)}/submissions`,
      {
        query,
        requestId,
        headers,
        credentials,
      },
    );
  }

  submitForm(
    formId: string,
    input: BackyFormSubmissionInput,
  ): Promise<
    BackyEnvelope<{
      submission: BackyFormSubmission;
      contact?: BackyContact;
      collectionRecord?: BackyCollectionRecord | null;
      collectionRecordErrors?: Array<Record<string, unknown>>;
    }>
  > {
    return this.request(
      `/api/sites/${encodeURIComponent(this.requireSiteId())}/forms/${encodeURIComponent(formId)}/submissions`,
      {
        method: "POST",
        body: input,
        requestId: input.requestId,
      },
    );
  }

  formSubmission(
    formId: string,
    submissionId: string,
    options: BackyLiveManagementRequestOptions = {},
  ): Promise<BackyAdminFormSubmissionResponse> {
    return this.request(
      `/api/admin/sites/${encodeURIComponent(options.siteId ?? this.requireSiteId())}/forms/${encodeURIComponent(formId)}/submissions/${encodeURIComponent(submissionId)}`,
      {
        requestId: options.requestId,
        headers: liveManagementHeaders(options),
        credentials: options.credentials,
      },
    );
  }

  updateFormSubmission(
    formId: string,
    submissionId: string,
    updates: Record<string, unknown>,
    options: BackyLiveManagementRequestOptions = {},
  ): Promise<BackyAdminFormSubmissionResponse> {
    const { requestId, ...body } = updates;
    return this.request(
      `/api/admin/sites/${encodeURIComponent(options.siteId ?? this.requireSiteId())}/forms/${encodeURIComponent(formId)}/submissions/${encodeURIComponent(submissionId)}`,
      {
        method: "PATCH",
        body,
        requestId: options.requestId ?? (requestId as string | undefined),
        headers: liveManagementHeaders(options),
        credentials: options.credentials,
      },
    );
  }

  formContacts(
    formId: string,
    options: BackyAdminFormContactListOptions = {},
  ): Promise<BackyAdminFormContactsResponse> {
    const { requestId, siteId, headers, credentials, rest } =
      splitLiveManagementRequestOptions(options);
    const { contactRequestId, ...queryOptions } = rest;
    const query = normalizeListQuery({
      ...queryOptions,
      requestId: contactRequestId,
    } as BackyListOptions & { status?: string; requestId?: string });
    return this.request(
      `/api/admin/sites/${encodeURIComponent(siteId ?? this.requireSiteId())}/forms/${encodeURIComponent(formId)}/contacts`,
      {
        query,
        requestId,
        headers,
        credentials,
      },
    );
  }

  updateFormContact(
    formId: string,
    contactId: string,
    updates: Record<string, unknown>,
    options: BackyLiveManagementRequestOptions = {},
  ): Promise<BackyAdminFormContactResponse> {
    const { requestId, ...body } = updates;
    return this.request(
      `/api/admin/sites/${encodeURIComponent(options.siteId ?? this.requireSiteId())}/forms/${encodeURIComponent(formId)}/contacts/${encodeURIComponent(contactId)}`,
      {
        method: "PATCH",
        body,
        requestId: options.requestId ?? (requestId as string | undefined),
        headers: liveManagementHeaders(options),
        credentials: options.credentials,
      },
    );
  }

  deleteFormContact(
    formId: string,
    contactId: string,
    options: BackyLiveManagementRequestOptions = {},
  ): Promise<BackyAdminFormContactDeleteResponse> {
    return this.request(
      `/api/admin/sites/${encodeURIComponent(options.siteId ?? this.requireSiteId())}/forms/${encodeURIComponent(formId)}/contacts/${encodeURIComponent(contactId)}`,
      {
        method: "DELETE",
        requestId: options.requestId,
        headers: liveManagementHeaders(options),
        credentials: options.credentials,
      },
    );
  }

  pageComments(
    pageId: string,
    options: BackyCommentListOptions = {},
  ): Promise<
    BackyEnvelope<{
      comments: BackyComment[];
      count: number;
      pagination?: BackyPagination;
    }>
  > {
    const { requestId, ...queryOptions } = options;
    const query = normalizeListQuery(queryOptions);
    return this.request(
      `/api/sites/${encodeURIComponent(this.requireSiteId())}/pages/${encodeURIComponent(pageId)}/comments`,
      {
        query,
        requestId,
      },
    );
  }

  submitPageComment(
    pageId: string,
    input: BackyCommentInput,
  ): Promise<BackyEnvelope<{ comment: BackyComment }>> {
    return this.request(
      `/api/sites/${encodeURIComponent(this.requireSiteId())}/pages/${encodeURIComponent(pageId)}/comments`,
      {
        method: "POST",
        body: normalizeCommentInput(input),
        requestId: input.requestId,
      },
    );
  }

  pageComment(
    pageId: string,
    commentId: string,
  ): Promise<BackyEnvelope<{ comment: BackyComment }>> {
    return this.request(
      `/api/sites/${encodeURIComponent(this.requireSiteId())}/pages/${encodeURIComponent(pageId)}/comments/${encodeURIComponent(commentId)}`,
    );
  }

  updatePageComment(
    pageId: string,
    commentId: string,
    updates: Record<string, unknown>,
  ): Promise<BackyEnvelope<{ comment: BackyComment }>> {
    return this.request(
      `/api/sites/${encodeURIComponent(this.requireSiteId())}/pages/${encodeURIComponent(pageId)}/comments/${encodeURIComponent(commentId)}`,
      {
        method: "PATCH",
        body: updates,
      },
    );
  }

  blogComments(
    postId: string,
    options: BackyCommentListOptions = {},
  ): Promise<
    BackyEnvelope<{
      comments: BackyComment[];
      count: number;
      pagination?: BackyPagination;
    }>
  > {
    const { requestId, ...queryOptions } = options;
    const query = normalizeListQuery(queryOptions);
    return this.request(
      `/api/sites/${encodeURIComponent(this.requireSiteId())}/blog/${encodeURIComponent(postId)}/comments`,
      {
        query,
        requestId,
      },
    );
  }

  submitBlogComment(
    postId: string,
    input: BackyCommentInput,
  ): Promise<BackyEnvelope<{ comment: BackyComment }>> {
    return this.request(
      `/api/sites/${encodeURIComponent(this.requireSiteId())}/blog/${encodeURIComponent(postId)}/comments`,
      {
        method: "POST",
        body: normalizeCommentInput(input),
        requestId: input.requestId,
      },
    );
  }

  blogComment(
    postId: string,
    commentId: string,
  ): Promise<BackyEnvelope<{ comment: BackyComment }>> {
    return this.request(
      `/api/sites/${encodeURIComponent(this.requireSiteId())}/blog/${encodeURIComponent(postId)}/comments/${encodeURIComponent(commentId)}`,
    );
  }

  updateBlogComment(
    postId: string,
    commentId: string,
    updates: Record<string, unknown>,
  ): Promise<BackyEnvelope<{ comment: BackyComment }>> {
    return this.request(
      `/api/sites/${encodeURIComponent(this.requireSiteId())}/blog/${encodeURIComponent(postId)}/comments/${encodeURIComponent(commentId)}`,
      {
        method: "PATCH",
        body: updates,
      },
    );
  }

  siteComments(
    options: BackyCommentListOptions = {},
  ): Promise<
    BackyEnvelope<{
      comments: BackyComment[];
      count: number;
      pagination?: BackyPagination;
    }>
  > {
    const { requestId, ...queryOptions } = options;
    const query = normalizeListQuery(queryOptions);
    return this.request(
      `/api/sites/${encodeURIComponent(this.requireSiteId())}/comments`,
      {
        query,
        requestId,
      },
    );
  }

  updateComments(
    input: BackyCommentBulkUpdateInput,
  ): Promise<
    BackyEnvelope<{
      siteId?: string;
      updated: BackyComment[];
      updatedCount?: number;
      missingIds?: string[];
    }>
  > {
    return this.request(
      `/api/sites/${encodeURIComponent(this.requireSiteId())}/comments`,
      {
        method: "PATCH",
        body: input,
        requestId: input.requestId,
      },
    );
  }

  clearCommentReports(
    commentIds: string[],
    input: Omit<
      BackyCommentBulkUpdateInput,
      "commentIds" | "ids" | "action" | "clearReports" | "status"
    > = {},
  ): Promise<
    BackyEnvelope<{
      siteId?: string;
      updated: BackyComment[];
      updatedCount?: number;
      missingIds?: string[];
    }>
  > {
    return this.updateComments({
      ...input,
      commentIds,
      action: "clearReports",
    });
  }

  commentBlocklist(
    options: BackyCommentBlocklistOptions = {},
  ): Promise<
    BackyEnvelope<{
      siteId?: string;
      blocklist: BackyCommentBlocklistEntry[];
      count: number;
      pagination?: BackyPagination;
    }>
  > {
    const { requestId, ...queryOptions } = options;
    const query = normalizeListQuery(queryOptions);
    return this.request(
      `/api/sites/${encodeURIComponent(this.requireSiteId())}/comments/blocklist`,
      {
        query,
        requestId,
      },
    );
  }

  deleteCommentBlocklistEntries(
    ids: string[],
    input: { requestId?: string } = {},
  ): Promise<
    BackyEnvelope<{
      siteId?: string;
      deleted: BackyCommentBlocklistEntry[];
      deletedCount?: number;
      missingIds?: string[];
    }>
  > {
    return this.request(
      `/api/sites/${encodeURIComponent(this.requireSiteId())}/comments/blocklist`,
      {
        method: "DELETE",
        body: { ids },
        requestId: input.requestId,
      },
    );
  }

  comment(
    commentId: string,
  ): Promise<BackyEnvelope<{ comment: BackyComment }>> {
    return this.request(
      `/api/sites/${encodeURIComponent(this.requireSiteId())}/comments/${encodeURIComponent(commentId)}`,
    );
  }

  updateComment(
    commentId: string,
    updates: Record<string, unknown>,
  ): Promise<BackyEnvelope<{ comment: BackyComment }>> {
    return this.request(
      `/api/sites/${encodeURIComponent(this.requireSiteId())}/comments/${encodeURIComponent(commentId)}`,
      {
        method: "PATCH",
        body: updates,
      },
    );
  }

  deleteComment(
    commentId: string,
  ): Promise<BackyEnvelope<{ deleted: BackyComment[]; deletedCount: number }>> {
    return this.request(
      `/api/sites/${encodeURIComponent(this.requireSiteId())}/comments/${encodeURIComponent(commentId)}`,
      {
        method: "DELETE",
      },
    );
  }

  reportReasons(): Promise<BackyEnvelope<{ reasons: string[] }>> {
    return this.request(
      `/api/sites/${encodeURIComponent(this.requireSiteId())}/comments/report-reasons`,
    );
  }

  reportReasonsCached(
    options: BackyConditionalOptions = {},
  ): Promise<BackyConditionalResult<BackyEnvelope<{ reasons: string[] }>>> {
    return this.requestConditionalJson(
      `/api/sites/${encodeURIComponent(options.siteId ?? this.requireSiteId())}/comments/report-reasons`,
      {
        ifNoneMatch: options.etag,
        requestId: options.requestId,
      },
    );
  }

  reportComment(
    commentId: string,
    input: BackyCommentReportInputSource,
  ): Promise<
    BackyEnvelope<{ comment: BackyComment; report: Record<string, unknown> }>
  > {
    const body = buildBackyCommentReportInput(input);
    return this.request(
      `/api/sites/${encodeURIComponent(this.requireSiteId())}/comments/${encodeURIComponent(commentId)}/report`,
      {
        method: "POST",
        body,
        requestId: body.requestId,
      },
    );
  }

  events(
    options: BackyEventListOptions = {},
  ): Promise<
    BackyEnvelope<{
      siteId: string;
      events: BackyInteractionEvent[];
      count: number;
      pagination?: BackyPagination;
    }>
  > {
    const { requestId, ...queryOptions } = options;
    const query = normalizeListQuery(queryOptions);
    return this.request(
      `/api/sites/${encodeURIComponent(this.requireSiteId())}/events`,
      {
        query,
        requestId,
      },
    );
  }

  private requireSiteId(): string {
    if (!this.siteId) {
      throw new Error(
        "BackyClient requires a siteId. Pass siteId to the constructor or call discoverSite().",
      );
    }
    return this.siteId;
  }

  private async request<TData>(
    path: string,
    options: {
      method?: string;
      query?: Record<string, string | number | boolean | undefined>;
      body?: unknown;
      requestId?: string;
      headers?: HeadersInit;
      credentials?: RequestCredentials;
    } = {},
  ): Promise<BackyEnvelope<TData>> {
    const json = await this.requestRawJson(path, options);
    if (isBackyErrorEnvelope(json)) {
      throw new BackyApiError(200, json);
    }
    if (!isBackyEnvelope<TData>(json)) {
      throw new Error(`Backy API returned an invalid envelope for ${path}.`);
    }
    return json;
  }

  private async requestRouteResolve(
    path: string,
    options: {
      query?: Record<string, string | number | boolean | undefined>;
      requestId?: string;
    } = {},
  ): Promise<BackyRouteResolveResult> {
    const { response, json } = await this.fetchJson(path, options);
    const responsePath = response.url ? new URL(response.url).pathname : path;

    if (response.status === 410 && isBackyGoneRouteResolveEnvelope(json)) {
      return json;
    }

    if (!response.ok) {
      if (isBackyErrorEnvelope(json)) {
        throw new BackyApiError(response.status, json);
      }
      throw new Error(
        `Backy API request failed with HTTP ${response.status} for ${responsePath}.`,
      );
    }

    if (!isBackyEnvelope<BackyRouteResolve>(json)) {
      throw new Error(
        `Backy API returned an invalid route envelope for ${responsePath}.`,
      );
    }

    return json;
  }

  private async requestRawJson(
    path: string,
    options: {
      method?: string;
      query?: Record<string, string | number | boolean | undefined>;
      body?: unknown;
      requestId?: string;
      headers?: HeadersInit;
      credentials?: RequestCredentials;
    } = {},
  ): Promise<Record<string, unknown>> {
    const { response, json } = await this.fetchJson(path, options);
    const responsePath = response.url ? new URL(response.url).pathname : path;

    if (!response.ok) {
      if (isBackyErrorEnvelope(json)) {
        throw new BackyApiError(response.status, json);
      }
      throw new Error(
        `Backy API request failed with HTTP ${response.status} for ${responsePath}.`,
      );
    }

    if (!json || typeof json !== "object") {
      throw new Error(
        `Backy API returned non-JSON response for ${responsePath}.`,
      );
    }

    return json as Record<string, unknown>;
  }

  private async requestConditionalJson<TBody>(
    path: string,
    options: {
      method?: string;
      query?: Record<string, string | number | boolean | undefined>;
      body?: unknown;
      requestId?: string;
      ifNoneMatch?: string;
      headers?: HeadersInit;
      credentials?: RequestCredentials;
    } = {},
  ): Promise<BackyConditionalResult<TBody>> {
    const { response, json } = await this.fetchJson(path, options);
    const meta = extractResponseMeta(response);
    const responsePath = response.url ? new URL(response.url).pathname : path;

    if (response.status === 304) {
      return {
        notModified: true,
        status: 304,
        body: null,
        meta,
      };
    }

    if (!response.ok) {
      if (isBackyErrorEnvelope(json)) {
        throw new BackyApiError(response.status, json);
      }
      throw new Error(
        `Backy API request failed with HTTP ${response.status} for ${responsePath}.`,
      );
    }

    if (!json || typeof json !== "object") {
      throw new Error(
        `Backy API returned non-JSON response for ${responsePath}.`,
      );
    }

    return {
      notModified: false,
      status: response.status,
      body: json as TBody,
      meta,
    };
  }

  private async requestText(
    path: string,
    options: {
      method?: string;
      query?: Record<string, string | number | boolean | undefined>;
      body?: unknown;
      requestId?: string;
      headers?: HeadersInit;
      credentials?: RequestCredentials;
    } = {},
  ): Promise<string> {
    const url = new URL(
      path.startsWith("http") ? path : `${this.baseUrl}${path}`,
    );
    for (const [key, value] of Object.entries(options.query || {})) {
      if (value !== undefined) {
        url.searchParams.set(key, String(value));
      }
    }

    const headers = new Headers(this.defaultHeaders);
    new Headers(options.headers).forEach((value, key) => {
      headers.set(key, value);
    });
    headers.set("x-request-id", options.requestId ?? this.requestIdFactory());
    const isFormDataBody = isBackyFormData(options.body);
    if (
      options.body !== undefined &&
      !isFormDataBody &&
      !headers.has("content-type")
    ) {
      headers.set("content-type", "application/json");
    }
    const credentials = options.credentials ?? this.defaultCredentials;

    const response = await this.fetchImpl(url, {
      method: options.method ?? (options.body === undefined ? "GET" : "POST"),
      headers,
      ...(credentials ? { credentials } : {}),
      body: backyRequestBody(options.body),
    });

    if (!response.ok) {
      throw new Error(
        `Backy API request failed with HTTP ${response.status} for ${response.url || path}.`,
      );
    }

    return response.text();
  }

  private async fetchJson(
    path: string,
    options: {
      method?: string;
      query?: Record<string, string | number | boolean | undefined>;
      body?: unknown;
      requestId?: string;
      ifNoneMatch?: string;
      headers?: HeadersInit;
      credentials?: RequestCredentials;
    } = {},
  ): Promise<{ response: Response; json: unknown }> {
    const url = new URL(
      path.startsWith("http") ? path : `${this.baseUrl}${path}`,
    );
    for (const [key, value] of Object.entries(options.query || {})) {
      if (value !== undefined) {
        url.searchParams.set(key, String(value));
      }
    }

    const headers = new Headers(this.defaultHeaders);
    new Headers(options.headers).forEach((value, key) => {
      headers.set(key, value);
    });
    const requestId = options.requestId ?? this.requestIdFactory();
    headers.set("x-request-id", requestId);
    if (options.ifNoneMatch) {
      headers.set("if-none-match", options.ifNoneMatch);
    }
    const isFormDataBody = isBackyFormData(options.body);
    if (
      options.body !== undefined &&
      !isFormDataBody &&
      !headers.has("content-type")
    ) {
      headers.set("content-type", "application/json");
    }
    const credentials = options.credentials ?? this.defaultCredentials;

    const response = await this.fetchImpl(url, {
      method: options.method ?? (options.body === undefined ? "GET" : "POST"),
      headers,
      ...(credentials ? { credentials } : {}),
      body: backyRequestBody(options.body),
    });

    if (response.status === 304) {
      return { response, json: null };
    }

    return {
      response,
      json: (await response.json().catch(() => null)) as unknown,
    };
  }
}

export const createBackyClient = (options: BackyClientOptions) =>
  new BackyClient(options);

function isBackyEnvelope<TData>(value: unknown): value is BackyEnvelope<TData> {
  return Boolean(
    value &&
    typeof value === "object" &&
    (value as { success?: unknown }).success === true &&
    typeof (value as { requestId?: unknown }).requestId === "string" &&
    "data" in value,
  );
}

function isBackyErrorEnvelope(value: unknown): value is BackyErrorEnvelope {
  return Boolean(
    value &&
    typeof value === "object" &&
    (value as { success?: unknown }).success === false &&
    typeof (value as { error?: { code?: unknown; message?: unknown } }).error
      ?.code === "string" &&
    typeof (value as { error?: { code?: unknown; message?: unknown } }).error
      ?.message === "string",
  );
}

function isBackyGoneRouteResolveEnvelope(
  value: unknown,
): value is BackyRouteResolveResult {
  if (!isBackyErrorEnvelope(value)) {
    return false;
  }

  const data = value.data as
    | { route?: { type?: unknown; resource?: { statusCode?: unknown } } }
    | undefined;
  return (
    data?.route?.type === "gone" && data.route.resource?.statusCode === 410
  );
}

function normalizeCommentInput(
  input: BackyCommentInput,
): Record<string, unknown> {
  return buildBackyCommentInput(input);
}

function extractResponseMeta(response: Response): BackyResponseMeta {
  return {
    status: response.status,
    etag: response.headers.get("etag") || undefined,
    cacheControl: response.headers.get("cache-control") || undefined,
    cacheScope: response.headers.get("x-backy-cache-scope") || undefined,
    cacheRevision: response.headers.get("x-backy-cache-revision") || undefined,
    contractVersion:
      response.headers.get("x-backy-contract-version") || undefined,
    schemaVersion: response.headers.get("x-backy-schema-version") || undefined,
    requestId: response.headers.get("x-backy-request-id") || undefined,
    siteId: response.headers.get("x-backy-site-id") || undefined,
  };
}
