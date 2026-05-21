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
  options?: string[];
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

export function patchBackyContentElement<TContent extends BackyEditableContent>(
  content: TContent | undefined | null,
  patch: BackyContentElementPatch,
): TContent | null {
  return patchBackyContentElements(content, [patch]);
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

export interface BackyFormDefinition {
  id: string;
  title?: string;
  active?: boolean;
  isActive?: boolean;
  fields?: Array<Record<string, unknown>>;
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

export interface BackyFormSubmissionValidationDetail {
  field: string;
  code: string;
  message: string;
  label?: string;
}

export interface BackyCommentInput {
  content?: string;
  body?: string;
  authorName: string;
  authorEmail?: string;
  authorWebsite?: string;
  requestId?: string;
  parentId?: string;
  threadId?: string;
  commentThreadId?: string;
  moderationMode?: "manual" | "auto-approve";
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

export interface BackyInteractiveRuntimeEventInput {
  type?: "ready" | "init" | "resize" | "error" | "fallback" | "blocked";
  componentKey: string;
  version?: string;
  elementId?: string;
  pageId?: string;
  postId?: string;
  message: string;
  requestId?: string;
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
    input: BackyInteractiveRuntimeEventInput,
    siteId = this.requireSiteId(),
  ): Promise<
    BackyEnvelope<{
      recorded: boolean;
      siteId: string;
      componentKey: string;
      version?: string | null;
    }>
  > {
    return this.request(
      `/api/sites/${encodeURIComponent(siteId)}/interactive-components/runtime-events`,
      {
        method: "POST",
        body: input,
        requestId: input.requestId,
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

  formSubmissions(
    formId: string,
    options: BackyListOptions & { status?: string } = {},
  ): Promise<
    BackyEnvelope<{
      form: BackyFormDefinition;
      submissions: { data?: BackyFormSubmission[]; [key: string]: unknown };
      pagination?: BackyPagination;
    }>
  > {
    const { requestId, ...query } = options;
    return this.request(
      `/api/admin/sites/${encodeURIComponent(this.requireSiteId())}/forms/${encodeURIComponent(formId)}/submissions`,
      {
        query,
        requestId,
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
  ): Promise<BackyEnvelope<{ submission: BackyFormSubmission }>> {
    return this.request(
      `/api/admin/sites/${encodeURIComponent(this.requireSiteId())}/forms/${encodeURIComponent(formId)}/submissions/${encodeURIComponent(submissionId)}`,
    );
  }

  updateFormSubmission(
    formId: string,
    submissionId: string,
    updates: Record<string, unknown>,
  ): Promise<BackyEnvelope<{ submission: BackyFormSubmission }>> {
    return this.request(
      `/api/admin/sites/${encodeURIComponent(this.requireSiteId())}/forms/${encodeURIComponent(formId)}/submissions/${encodeURIComponent(submissionId)}`,
      {
        method: "PATCH",
        body: updates,
      },
    );
  }

  formContacts(
    formId: string,
    options: BackyListOptions & { status?: string } = {},
  ): Promise<
    BackyEnvelope<{
      form: BackyFormDefinition;
      contacts: BackyContact[];
      pagination?: BackyPagination;
    }>
  > {
    const { requestId, ...query } = options;
    return this.request(
      `/api/admin/sites/${encodeURIComponent(this.requireSiteId())}/forms/${encodeURIComponent(formId)}/contacts`,
      {
        query,
        requestId,
      },
    );
  }

  updateFormContact(
    formId: string,
    contactId: string,
    updates: Record<string, unknown>,
  ): Promise<BackyEnvelope<{ contact: BackyContact }>> {
    return this.request(
      `/api/admin/sites/${encodeURIComponent(this.requireSiteId())}/forms/${encodeURIComponent(formId)}/contacts/${encodeURIComponent(contactId)}`,
      {
        method: "PATCH",
        body: updates,
      },
    );
  }

  deleteFormContact(
    formId: string,
    contactId: string,
  ): Promise<BackyEnvelope<{ deleted: true; contact: BackyContact }>> {
    return this.request(
      `/api/admin/sites/${encodeURIComponent(this.requireSiteId())}/forms/${encodeURIComponent(formId)}/contacts/${encodeURIComponent(contactId)}`,
      {
        method: "DELETE",
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
    input: {
      reason: string;
      details?: string;
      reporterEmail?: string;
      requestId?: string;
    },
  ): Promise<
    BackyEnvelope<{ comment: BackyComment; report?: Record<string, unknown> }>
  > {
    return this.request(
      `/api/sites/${encodeURIComponent(this.requireSiteId())}/comments/${encodeURIComponent(commentId)}/report`,
      {
        method: "POST",
        body: input,
        requestId: input.requestId,
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
    if (options.body !== undefined && !headers.has("content-type")) {
      headers.set("content-type", "application/json");
    }
    const credentials = options.credentials ?? this.defaultCredentials;

    const response = await this.fetchImpl(url, {
      method: options.method ?? (options.body === undefined ? "GET" : "POST"),
      headers,
      ...(credentials ? { credentials } : {}),
      body:
        options.body === undefined ? undefined : JSON.stringify(options.body),
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
    if (options.body !== undefined && !headers.has("content-type")) {
      headers.set("content-type", "application/json");
    }
    const credentials = options.credentials ?? this.defaultCredentials;

    const response = await this.fetchImpl(url, {
      method: options.method ?? (options.body === undefined ? "GET" : "POST"),
      headers,
      ...(credentials ? { credentials } : {}),
      body:
        options.body === undefined ? undefined : JSON.stringify(options.body),
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
  const { body, content, ...rest } = input;
  return {
    ...rest,
    content: content ?? body ?? "",
  };
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
