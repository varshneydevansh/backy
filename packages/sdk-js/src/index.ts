import type {
  BackyContentDocument as CoreBackyContentDocument,
  BackyContentElement,
} from "@backy-cms/core/content-contract";
import type {
  GeneratedBackyOpenApiAdminSettings,
  GeneratedBackyOpenApiAdminSettingsActionEnvelope,
  GeneratedBackyOpenApiAdminSettingsActionRequest,
  GeneratedBackyOpenApiAdminSettingsEnvelope,
  GeneratedBackyOpenApiAdminSettingsMediaStorageHandoff,
  GeneratedBackyOpenApiAdminSettingsThemeDesignImpact,
  GeneratedBackyOpenApiAdminSettingsProviderCertification,
  GeneratedBackyOpenApiAdminSettingsProviderCertificationEvidence,
  GeneratedBackyOpenApiAdminSettingsProviderCertificationEvidencePacket,
  GeneratedBackyOpenApiAdminSettingsUpdateRequest,
  GeneratedBackyOpenApiAdminSiteSettingsPatchRequest,
  GeneratedBackyOpenApiAdminSiteSettingsScope,
  GeneratedBackyOpenApiAdminBlogPostRollbackRequest,
  GeneratedBackyOpenApiAdminPageRollbackRequest,
  GeneratedBackyOpenApiBlogPostUpdateRequest,
  GeneratedBackyOpenApiCommerceOrderAnalytics,
  GeneratedBackyOpenApiCommerceOrderAnalyticsProviderCertification,
  GeneratedBackyOpenApiCommerceOrderFulfillment,
  GeneratedBackyOpenApiCommerceOrderProviderCertificationEvidence,
  GeneratedBackyOpenApiCommerceOrderProviderCertificationEvidencePacket,
  GeneratedBackyOpenApiCommerceOrderProviderRefund,
  GeneratedBackyOpenApiCommerceOrderQuote,
  GeneratedBackyOpenApiCommerceOrderShippingLabel,
  GeneratedBackyOpenApiCommerceOrderStatusAccess,
  GeneratedBackyOpenApiCommerceOrderStatusHandoff,
  GeneratedBackyOpenApiCommerceOrderTracking,
  GeneratedBackyOpenApiCommerceProductProviderSync,
  GeneratedBackyOpenApiCommerceProductSubscriptionAction,
  GeneratedBackyOpenApiCommerceProductSubscriptionLifecycle,
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
  GeneratedBackyFrontendManifestCompletionStatus,
  GeneratedBackyFrontendManifestCommerceProviderCertification,
  GeneratedBackyFrontendManifestDatabaseCertification,
  GeneratedBackyFrontendManifestEnvelope,
  GeneratedBackyFrontendManifestLaunchReadiness,
  GeneratedBackyFrontendManifestNavigationItem,
  GeneratedBackyInteractiveControl,
  GeneratedBackyInteractiveFallback,
  GeneratedBackyInteractiveRenderCapabilities,
  GeneratedBackyOpenApiBackyContentDocument,
  GeneratedBackyOpenApiBackyCompletionStatus,
  GeneratedBackyOpenApiBackyContentAssetRef,
  GeneratedBackyOpenApiBackyContentElement,
  GeneratedBackyOpenApiBackyContentElementAccessibility,
  GeneratedBackyOpenApiBackyDataBinding,
  GeneratedBackyOpenApiBackyDataBindingSource,
  GeneratedBackyOpenApiBackyEditableMapEntry,
  GeneratedBackyOpenApiBackyElementAction,
  GeneratedBackyOpenApiBackyReusableSectionContent,
  GeneratedBackyOpenApiAdminSettings,
  GeneratedBackyOpenApiAdminSettingsActionEnvelope,
  GeneratedBackyOpenApiAdminSettingsActionRequest,
  GeneratedBackyOpenApiAdminSettingsEnvelope,
  GeneratedBackyOpenApiAdminSettingsMediaStorageHandoff,
  GeneratedBackyOpenApiAdminSettingsThemeDesignImpact,
  GeneratedBackyOpenApiAdminSettingsProviderCertification,
  GeneratedBackyOpenApiAdminSettingsProviderCertificationEvidence,
  GeneratedBackyOpenApiAdminSettingsProviderCertificationEvidencePacket,
  GeneratedBackyOpenApiAdminSettingsUpdateRequest,
  GeneratedBackyOpenApiAdminBlogPostRollbackRequest,
  GeneratedBackyOpenApiAdminBlogPostRevision,
  GeneratedBackyOpenApiAdminBlogPostRevisionsEnvelope,
  GeneratedBackyOpenApiAdminPageRollbackRequest,
  GeneratedBackyOpenApiAdminPageRevision,
  GeneratedBackyOpenApiAdminPageRevisionsEnvelope,
  GeneratedBackyOpenApiAdminSiteSettingsEnvelope,
  GeneratedBackyOpenApiAdminSiteSettingsPatchRequest,
  GeneratedBackyOpenApiAdminSiteSettingsScope,
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
  GeneratedBackyOpenApiCommentAnalytics,
  GeneratedBackyOpenApiCommentAnalyticsEnvelope,
  GeneratedBackyOpenApiCommentAnalyticsStatusCounts,
  GeneratedBackyOpenApiCommentAnalyticsTarget,
  GeneratedBackyOpenApiCommentAnalyticsThread,
  GeneratedBackyOpenApiCommentDeliveryRetryAttempt,
  GeneratedBackyOpenApiCommentDeliveryRetryEnvelope,
  GeneratedBackyOpenApiCommentDeliveryRetryRequest,
  GeneratedBackyOpenApiCommentEnvelope,
  GeneratedBackyOpenApiCommentReportEnvelope,
  GeneratedBackyOpenApiCommentReportReasonsEnvelope,
  GeneratedBackyOpenApiCommentSubmitRequest,
  GeneratedBackyOpenApiCommentUpdateRequest,
  GeneratedBackyOpenApiCommentsEnvelope,
  GeneratedBackyOpenApiCommerceCatalogEnvelope,
  GeneratedBackyOpenApiCommerceOrderAnalytics,
  GeneratedBackyOpenApiCommerceOrderAnalyticsEnvelope,
  GeneratedBackyOpenApiCommerceOrderAnalyticsProviderCertification,
  GeneratedBackyOpenApiCommerceOrderContractEnvelope,
  GeneratedBackyOpenApiCommerceOrderCreateRequest,
  GeneratedBackyOpenApiCommerceOrderEnvelope,
  GeneratedBackyOpenApiCommerceOrderFulfillment,
  GeneratedBackyOpenApiCommerceOrderFulfillmentEnvelope,
  GeneratedBackyOpenApiCommerceOrderProviderCertificationEvidence,
  GeneratedBackyOpenApiCommerceOrderProviderCertificationEvidencePacket,
  GeneratedBackyOpenApiCommerceOrderProviderRefund,
  GeneratedBackyOpenApiCommerceOrderProviderRefundEnvelope,
  GeneratedBackyOpenApiCommerceOrderQuote,
  GeneratedBackyOpenApiCommerceOrderQuoteEnvelope,
  GeneratedBackyOpenApiCommerceOrderShippingLabel,
  GeneratedBackyOpenApiCommerceOrderShippingLabelEnvelope,
  GeneratedBackyOpenApiCommerceOrderStatusAccess,
  GeneratedBackyOpenApiCommerceOrderStatusHandoffEnvelope,
  GeneratedBackyOpenApiCommerceOrderStatusHandoff,
  GeneratedBackyOpenApiCommerceProduct,
  GeneratedBackyOpenApiCommerceProductDesign,
  GeneratedBackyOpenApiCommerceProductDesignReadiness,
  GeneratedBackyOpenApiCommerceProductProviderCertification,
  GeneratedBackyOpenApiCommerceProductProviderCertificationEvidencePacket,
  GeneratedBackyOpenApiCommerceManagementPolicy,
  GeneratedBackyOpenApiCommerceProviderCertification,
  GeneratedBackyOpenApiCommerceProviderCertificationOperatorNextAction,
  GeneratedBackyOpenApiCommerceOrderTracking,
  GeneratedBackyOpenApiCommerceOrderTrackingEnvelope,
  GeneratedBackyOpenApiCommerceStorefrontContract,
  GeneratedBackyOpenApiCommerceWebhookEnvelope,
  GeneratedBackyOpenApiCommerceWebhookRequest,
  GeneratedBackyOpenApiCommerceProductProviderSync,
  GeneratedBackyOpenApiCommerceProductProviderSyncEnvelope,
  GeneratedBackyOpenApiCommerceProductSubscriptionAction,
  GeneratedBackyOpenApiCommerceProductSubscriptionActionEnvelope,
  GeneratedBackyOpenApiCommerceProductSubscriptionLifecycle,
  GeneratedBackyOpenApiCommerceProductSubscriptionsEnvelope,
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
  GeneratedBackyOpenApiContentRevisionBranchMetadata,
  GeneratedBackyOpenApiDynamicItemRoute,
  GeneratedBackyOpenApiDynamicItemRouteResource,
  GeneratedBackyOpenApiDynamicListRoute,
  GeneratedBackyOpenApiDynamicListRouteResource,
  GeneratedBackyOpenApiErrorEnvelope,
  GeneratedBackyOpenApiEventsEnvelope,
  GeneratedBackyOpenApiFontManifestEnvelope,
  GeneratedBackyOpenApiFontVariant,
  GeneratedBackyOpenApiFrontendDatabaseCertificationHandoff,
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
  GeneratedBackyOpenApiFormsManagementPolicy,
  GeneratedBackyOpenApiFrontendDesignContract,
  GeneratedBackyOpenApiFrontendDesignEnvelope,
  GeneratedBackyOpenApiFrontendDesignTemplate,
  GeneratedBackyOpenApiFrontendEditableMapEntry,
  GeneratedBackyOpenApiGoneRoute,
  GeneratedBackyOpenApiGoneRouteResolveEnvelope,
  GeneratedBackyOpenApiInteractiveComponentControl,
  GeneratedBackyOpenApiInteractiveComponentControlOption,
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
  GeneratedBackyPublicRenderPayloadFontVariant,
  GeneratedBackyPublicRenderPayloadProductDesignReadiness,
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
  location?: string;
  contentType?: string;
  contentLength?: string;
  contentDisposition?: string;
  mediaId?: string;
  mediaDeliveryPolicy?: string;
  transformWidth?: string;
  transformQuality?: string;
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

export type BackyDesignArrayOrRecord = unknown[] | Record<string, unknown>;

export interface BackyFrontendDesignTemplateContent {
  elements?: unknown[];
  canvasSize?: {
    width?: number;
    height?: number;
    [key: string]: unknown;
  };
  customCSS?: string;
  customCss?: string;
  customJS?: string;
  customJs?: string;
  contentDocument?: Record<string, unknown>;
  themeTokenRefs?: Record<string, unknown>;
  assets?: BackyDesignArrayOrRecord;
  animations?: BackyDesignArrayOrRecord;
  interactions?: BackyDesignArrayOrRecord;
  dataBindings?: Record<string, unknown>;
  editableMap?: Record<string, unknown>;
  seo?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
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
  content?: BackyFrontendDesignTemplateContent;
  bindingHints?: Array<Record<string, unknown>>;
  [key: string]: unknown;
}

export interface BackyFrontendEditableMapEntry {
  selector?: string;
  elementId?: string;
  role?: string;
  binding?: string;
  fields?: string[];
  field?: string;
  targetPath?: string;
  token?: string;
  editable?: boolean;
  permission?: string;
  label?: string;
  valueType?:
    | "string"
    | "richText"
    | "number"
    | "boolean"
    | "color"
    | "image"
    | "video"
    | "audio"
    | "file"
    | "url"
    | "json"
    | string;
  scope?:
    | "site"
    | "page"
    | "post"
    | "template"
    | "element"
    | "collectionRecord"
    | string;
  collectionId?: string;
  recordId?: string;
  sourceField?: string;
  [key: string]: unknown;
}

export interface BackyFrontendDesignContract {
  schemaVersion: "backy.frontend-design.v1" | string;
  status: "unconfigured" | "captured" | "synced" | "stale" | string;
  source: BackyFrontendDesignSource;
  tokens?: BackyThemeTokens & {
    customCss?: string;
    customCSS?: string;
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

export type BackyTemplateRegistryType =
  | "page"
  | "blogPost"
  | "form"
  | "product"
  | "collection"
  | "section";

export interface BackyTemplateVersionReadiness {
  schemaVersion: "backy.template-version.v1" | string;
  ready: boolean;
  status: string;
  version?: string | number | null;
  createdAt?: string | null;
  updatedAt?: string | null;
  issues: string[];
  recommendation?: string;
  [key: string]: unknown;
}

export interface BackyTemplateRegistryEntry {
  id: string;
  type: BackyTemplateRegistryType | string;
  name: string;
  description?: string | null;
  routePattern?: string | null;
  status?: string;
  source?: string;
  version?: string | number | null;
  createdAt?: string | null;
  updatedAt?: string | null;
  versioning: BackyTemplateVersionReadiness;
  contentSummary: {
    hasContent: boolean;
    elementCount: number;
    fieldCount: number;
    bindingHintCount: number;
    hasCanvas: boolean;
    canvasSize?: Record<string, unknown> | null;
    [key: string]: unknown;
  };
  clone: {
    method: "POST" | string;
    endpoint: string;
    body: Record<string, unknown>;
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

export interface BackyTemplateRegistryVersionSummary {
  schemaVersion: "backy.template-version-readiness.v1" | string;
  ready: boolean;
  readyCount: number;
  templateCount: number;
  missingVersionCount: number;
  missingUpdatedAtCount: number;
  inactiveCount: number;
  latestUpdatedAt?: string | null;
  [key: string]: unknown;
}

export interface BackyTemplateRegistryActionPlan {
  schemaVersion: "backy.template-registry-action-plan.v1" | string;
  status: "empty" | "ready" | "needs-version-metadata" | string;
  recommendedNextAction: string;
  steps: string[];
  [key: string]: unknown;
}

export interface BackyTemplateRegistrySummary {
  schemaVersion: "backy.template-registry.v1" | string;
  status: string;
  templateCount: number;
  supportedTypes: string[];
  cloneField: "frontendDesignTemplateId" | string;
  cloneTargets: Record<string, string>;
  versionSummary: BackyTemplateRegistryVersionSummary;
  actionPlan: BackyTemplateRegistryActionPlan;
  [key: string]: unknown;
}

export interface BackyTemplateRegistry extends BackyTemplateRegistrySummary {
  source?: BackyFrontendDesignSource;
  totalTemplateCount: number;
  templates: BackyTemplateRegistryEntry[];
  byType: Record<string, BackyTemplateRegistryEntry[]>;
}

export type BackyAdminFrontendDesignResponse = BackyEnvelope<
  {
    site: {
      id: string;
      slug: string;
      name: string;
      customDomain?: string | null;
      [key: string]: unknown;
    };
    frontendDesign: BackyFrontendDesignContract;
    endpoints: {
      admin: string;
      templates: string;
      publicManifest: string;
      [key: string]: string;
    };
    templateRegistry: BackyTemplateRegistrySummary;
    nextSteps: string[];
    cacheInvalidation?: Record<string, unknown>;
    [key: string]: unknown;
  }
>;

export interface BackyAdminTemplateRegistryOptions
  extends BackyLiveManagementRequestOptions {
  type?: BackyTemplateRegistryType | string;
  search?: string;
}

export type BackyAdminTemplateRegistryResponse = BackyEnvelope<
  {
    site: {
      id: string;
      slug: string;
      name: string;
      [key: string]: unknown;
    };
    registry: BackyTemplateRegistry;
    templates: BackyTemplateRegistryEntry[];
    byType: Record<string, BackyTemplateRegistryEntry[]>;
    endpoints: {
      frontendDesign: string;
      templates: string;
      [key: string]: string;
    };
    [key: string]: unknown;
  }
>;

export interface BackyAdminCollectionBindingPreset {
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
  sortDirection?: "asc" | "desc" | string;
  limit?: string;
  offset?: string;
  createdAt?: string;
  updatedAt?: string;
  createdBy?: string | null;
  updatedBy?: string | null;
  [key: string]: unknown;
}

export interface BackyAdminCollectionBindingPresetInput
  extends Partial<BackyAdminCollectionBindingPreset> {
  collectionId: string;
  fieldKey: string;
}

export type BackyAdminCollectionBindingPresetsResponse = BackyEnvelope<
  {
    site: {
      id: string;
      slug: string;
      name: string;
      [key: string]: unknown;
    };
    presets: BackyAdminCollectionBindingPreset[];
  } & Record<string, unknown>
>;

export interface BackyAdminCollectionBindingPresetsUpdateInput {
  presets: BackyAdminCollectionBindingPresetInput[];
  requestId?: string;
  [key: string]: unknown;
}

export type BackyAdminFrontendDesignUpdateInput = {
  requestId?: string;
  frontendDesign?: BackyFrontendDesignContract | Record<string, unknown>;
  [key: string]: unknown;
};

export type BackyAdminFrontendDesignImportInput = {
  requestId?: string;
  frontendDesign?: BackyFrontendDesignContract | Record<string, unknown>;
  contract?: BackyFrontendDesignContract | Record<string, unknown>;
  design?: BackyFrontendDesignContract | Record<string, unknown>;
  manifest?: Record<string, unknown>;
  [key: string]: unknown;
};

export type BackyAdminFrontendDesignTemplateCaptureResourceType =
  | "page"
  | "pages"
  | "blogPost"
  | "post"
  | "blog"
  | "form"
  | "forms"
  | "product"
  | "products"
  | "collection"
  | "collections"
  | "section"
  | "reusableSection"
  | "reusable-section";

export type BackyAdminFrontendDesignTemplateCaptureInput = {
  resourceType: BackyAdminFrontendDesignTemplateCaptureResourceType;
  resourceId: string;
  collectionId?: string;
  templateId?: string;
  templateName?: string;
  routePattern?: string;
  requestId?: string;
  [key: string]: unknown;
};

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

export type BackyInteractiveControlType =
  | "range"
  | "select"
  | "radio"
  | "text"
  | "textarea"
  | "code"
  | "number"
  | "boolean"
  | "checkbox"
  | "toggle"
  | "color"
  | "json"
  | string;

export type BackyInteractiveControlOption =
  | string
  | number
  | boolean
  | {
      label?: string;
      name?: string;
      value?: string | number | boolean;
      id?: string | number | boolean;
      key?: string | number | boolean;
      [key: string]: unknown;
    };

export interface BackyInteractiveControl {
  key: string;
  label?: string;
  type: BackyInteractiveControlType;
  value?: unknown;
  defaultValue?: unknown;
  options?: BackyInteractiveControlOption[];
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

export type BackyRenderContent = BackyContentDocument & {
  customCSS?: string;
  customJS?: string;
  contentDocument?: BackyContentDocument | Record<string, unknown>;
  themeTokenRefs?: Record<string, string>;
  assets?: BackyDesignArrayOrRecord;
  animations?: BackyDesignArrayOrRecord;
  interactions?: BackyDesignArrayOrRecord;
  dataBindings?: Record<string, unknown>;
  editableMap?: Record<string, unknown>;
  seo?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
};

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
  organization?: {
    schemaVersion: "backy.media.organization.v1" | string;
    folderId: string | null;
    folderName: string;
    folderPath: string;
    folderSegments: string[];
    folderAncestors?: Array<{
      id: string;
      name: string;
      parentId: string | null;
      sortOrder: number;
    }>;
    folderDepth: number;
    folderSortOrder: number | null;
    root: boolean;
    missingFolder: boolean;
  };
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
    collectionRecordIds?: string[];
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
    collectionRecords?: Array<{
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
    collectionRecordCount?: number;
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

export interface BackyAdminCollectionsBackupOptions
  extends BackyLiveManagementRequestOptions {
  collectionIds?: string[];
  includeRecords?: boolean;
}

export interface BackyAdminCollectionBackupRecord<
  TValues extends Record<string, unknown> = Record<string, unknown>,
> {
  sourceRecordId?: string;
  slug: string;
  status: BackyAdminCollectionStatus | "scheduled" | string;
  values: TValues;
  publishedAt?: string | null;
  scheduledAt?: string | null;
  [key: string]: unknown;
}

export interface BackyAdminCollectionBackupCollection<
  TValues extends Record<string, unknown> = Record<string, unknown>,
> {
  sourceCollectionId?: string;
  name: string;
  slug: string;
  description?: string | null;
  status: BackyAdminCollectionStatus;
  routePattern?: string | null;
  listRoutePattern?: string | null;
  fields: BackyFieldSchema[];
  permissions?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
  records: Array<BackyAdminCollectionBackupRecord<TValues>>;
  [key: string]: unknown;
}

export interface BackyAdminCollectionsBackup<
  TValues extends Record<string, unknown> = Record<string, unknown>,
> {
  backup: {
    schemaVersion: "backy.collections.backup.v1";
    exportedAt: string;
    siteId: string;
    siteSlug?: string;
    collectionCount: number;
    recordCount: number;
    [key: string]: unknown;
  };
  collections: Array<BackyAdminCollectionBackupCollection<TValues>>;
  [key: string]: unknown;
}

export type BackyAdminCollectionsBackupResponse<
  TValues extends Record<string, unknown> = Record<string, unknown>,
> = BackyEnvelope<BackyAdminCollectionsBackup<TValues>>;

export interface BackyAdminCollectionsBackupImportOptions
  extends BackyLiveManagementRequestOptions {
  upsert?: boolean;
}

export interface BackyAdminCollectionsBackupImportSummary {
  createdCollections: number;
  updatedCollections: number;
  createdRecords: number;
  updatedRecords: number;
  totalCollections: number;
  totalRecords: number;
  [key: string]: unknown;
}

export type BackyAdminCollectionsBackupImportResponse<
  TValues extends Record<string, unknown> = Record<string, unknown>,
> = BackyEnvelope<
  {
    import: BackyAdminCollectionsBackupImportSummary;
    collections: BackyCollectionSchema[];
    records: Array<BackyCollectionRecord<TValues>>;
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

export interface BackyAdminCollectionRecordsCsvOptions
  extends BackyAdminCollectionRecordListOptions {}

export interface BackyAdminCollectionRecordImportError {
  row: number;
  slug?: string;
  message: string;
  details?: unknown;
  [key: string]: unknown;
}

export interface BackyAdminCollectionRecordImportOptions
  extends BackyLiveManagementRequestOptions {
  upsert?: boolean;
}

export interface BackyAdminCollectionRecordImportSummary {
  created: number;
  updated: number;
  skipped: number;
  errors: BackyAdminCollectionRecordImportError[];
  [key: string]: unknown;
}

export type BackyAdminCollectionRecordImportResponse<
  TValues extends Record<string, unknown> = Record<string, unknown>,
> = BackyEnvelope<
  {
    collection: BackyCollectionSchema;
    records: Array<BackyCollectionRecord<TValues>>;
    import: BackyAdminCollectionRecordImportSummary;
    cacheInvalidation?: Record<string, unknown>;
  } & Record<string, unknown>
>;

export interface BackyAdminCollectionRecordBulkInput {
  action: "delete" | "updateStatus";
  recordIds: string[];
  status?: BackyAdminCollectionStatus;
  requestId?: string;
  [key: string]: unknown;
}

export type BackyAdminCollectionRecordBulkResponse<
  TValues extends Record<string, unknown> = Record<string, unknown>,
> = BackyEnvelope<
  {
    action: "delete" | "updateStatus" | string;
    deleted: number;
    updated: number;
    skipped: number;
    records: Array<BackyCollectionRecord<TValues>>;
    cacheInvalidation?: Record<string, unknown>;
  } & Record<string, unknown>
>;

export const BACKY_COMMERCE_PRODUCTS_COLLECTION = "products";
export const BACKY_COMMERCE_ORDERS_COLLECTION = "orders";

export interface BackyAdminCommerceRecordRequestOptions
  extends BackyLiveManagementRequestOptions {
  collectionId?: string;
}

export interface BackyAdminCommerceRecordListOptions
  extends BackyAdminCollectionRecordListOptions {
  collectionId?: string;
}

export type BackyAdminCommerceProductValues = Record<string, unknown>;
export type BackyAdminCommerceOrderValues = Record<string, unknown>;

export type BackyAdminCommerceProductListOptions =
  BackyAdminCommerceRecordListOptions;
export type BackyAdminCommerceOrderListOptions =
  BackyAdminCommerceRecordListOptions;
export type BackyAdminCommerceProductRequestOptions =
  BackyAdminCommerceRecordRequestOptions;
export type BackyAdminCommerceOrderRequestOptions =
  BackyAdminCommerceRecordRequestOptions;
export type BackyAdminCommerceProductImportOptions =
  BackyAdminCommerceRecordRequestOptions & { upsert?: boolean };
export type BackyAdminCommerceOrderImportOptions =
  BackyAdminCommerceRecordRequestOptions & { upsert?: boolean };

export type BackyAdminCommerceProductCreateInput<
  TValues extends Record<string, unknown> = BackyAdminCommerceProductValues,
> = BackyAdminCollectionRecordCreateInput<TValues>;

export type BackyAdminCommerceProductUpdateInput<
  TValues extends Record<string, unknown> = BackyAdminCommerceProductValues,
> = BackyAdminCollectionRecordUpdateInput<TValues>;

export type BackyAdminCommerceOrderCreateInput<
  TValues extends Record<string, unknown> = BackyAdminCommerceOrderValues,
> = BackyAdminCollectionRecordCreateInput<TValues>;

export type BackyAdminCommerceOrderUpdateInput<
  TValues extends Record<string, unknown> = BackyAdminCommerceOrderValues,
> = BackyAdminCollectionRecordUpdateInput<TValues>;
export type BackyAdminCommerceProductBulkInput =
  BackyAdminCollectionRecordBulkInput;
export type BackyAdminCommerceOrderBulkInput =
  BackyAdminCollectionRecordBulkInput;

export type BackyAdminCommerceProductsResponse<
  TValues extends Record<string, unknown> = BackyAdminCommerceProductValues,
> = BackyAdminCollectionRecordsResponse<TValues>;

export type BackyAdminCommerceProductResponse<
  TValues extends Record<string, unknown> = BackyAdminCommerceProductValues,
> = BackyAdminCollectionRecordResponse<TValues>;

export type BackyAdminCommerceProductDeleteResponse =
  BackyAdminCollectionRecordDeleteResponse;
export type BackyAdminCommerceProductImportResponse<
  TValues extends Record<string, unknown> = BackyAdminCommerceProductValues,
> = BackyAdminCollectionRecordImportResponse<TValues>;
export type BackyAdminCommerceProductBulkResponse<
  TValues extends Record<string, unknown> = BackyAdminCommerceProductValues,
> = BackyAdminCollectionRecordBulkResponse<TValues>;

export type BackyAdminCommerceOrdersResponse<
  TValues extends Record<string, unknown> = BackyAdminCommerceOrderValues,
> = BackyAdminCollectionRecordsResponse<TValues>;

export type BackyAdminCommerceOrderResponse<
  TValues extends Record<string, unknown> = BackyAdminCommerceOrderValues,
> = BackyAdminCollectionRecordResponse<TValues>;

export type BackyAdminCommerceOrderDeleteResponse =
  BackyAdminCollectionRecordDeleteResponse;
export type BackyAdminCommerceOrderImportResponse<
  TValues extends Record<string, unknown> = BackyAdminCommerceOrderValues,
> = BackyAdminCollectionRecordImportResponse<TValues>;
export type BackyAdminCommerceOrderBulkResponse<
  TValues extends Record<string, unknown> = BackyAdminCommerceOrderValues,
> = BackyAdminCollectionRecordBulkResponse<TValues>;

export interface BackyCommerceProductDesign {
  templateId?: string;
  templateName?: string;
  routePattern?: string;
  source?: Record<string, unknown>;
  chrome?: Record<string, unknown>;
  tokens?: Record<string, unknown>;
  customCss?: string;
  customJs?: string;
  contentDocument?: Record<string, unknown>;
  elements?: unknown[];
  canvasSize?: Record<string, unknown>;
  themeTokenRefs?: Record<string, unknown>;
  assets?: BackyDesignArrayOrRecord;
  animations?: BackyDesignArrayOrRecord;
  interactions?: BackyDesignArrayOrRecord;
  dataBindings?: Record<string, unknown>;
  editableMap?: Record<string, unknown>;
  seo?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
  bindingHints?: Array<Record<string, unknown>>;
  frontendDesignTemplateId?: string;
  frontendDesignTemplateName?: string;
  frontendDesignRoutePattern?: string;
  frontendDesignSource?: Record<string, unknown>;
  frontendDesignChrome?: Record<string, unknown>;
  frontendDesignTokens?: Record<string, unknown>;
  frontendDesignCustomCss?: string;
  frontendDesignCustomJs?: string;
  frontendDesignContentDocument?: Record<string, unknown>;
  frontendDesignElements?: unknown[];
  frontendDesignCanvasSize?: Record<string, unknown>;
  frontendDesignThemeTokenRefs?: Record<string, unknown>;
  frontendDesignAssets?: BackyDesignArrayOrRecord;
  frontendDesignAnimations?: BackyDesignArrayOrRecord;
  frontendDesignInteractions?: BackyDesignArrayOrRecord;
  frontendDesignDataBindings?: Record<string, unknown>;
  frontendDesignEditableMap?: Record<string, unknown>;
  frontendDesignSeo?: Record<string, unknown>;
  frontendDesignMetadata?: Record<string, unknown>;
  frontendDesignBindingHints?: Array<Record<string, unknown>>;
  [key: string]: unknown;
}

export interface BackyCommerceProductDesignReadiness {
  schemaVersion: "backy.product-design-readiness.v1" | string;
  status: "ready" | "attention" | "blocked" | string;
  templateId: string | null;
  hasDesign: boolean;
  hasContentDocument: boolean;
  hasEditableMap: boolean;
  hasDataBindings: boolean;
  counts: {
    elements: number;
    animations: number;
    assets: number;
    bindingHints: number;
    [key: string]: unknown;
  };
  missing: string[];
  detail: string;
  nextAction: string;
  evidence: string[];
  secretHandling: string;
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
  designReadiness?: BackyCommerceProductDesignReadiness;
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
  status: "requires_action" | "provider_ready" | "provider_created";
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

export interface BackyProviderCertificationEvidencePacket {
  schemaVersion:
    | "backy.commerce-provider-certification-evidence-packet.v1"
    | "backy.order-provider-certification-evidence-packet.v1"
    | "backy.settings-provider-certification-evidence-packet.v1"
    | string;
  generatedAt: string;
  selectedSiteId?: string;
  selectedProductId?: string;
  status:
    | "no-family-selected"
    | "needs-credentials"
    | "needs-runtime-inputs"
    | "needs-scenario-evidence"
    | "evidence-complete"
    | string;
  operatorNextAction?: {
    status?: string;
    label?: string;
    detail?: string;
    command?: string;
    missingFamilies?: string[];
    missingScenarios?: string[];
    artifactEnv?: string;
    artifactPath?: string;
    [key: string]: unknown;
  };
  selectedFamilies: string[];
  selectedProviderAliases?: Record<string, string>;
  runtimeReadiness?: {
    loaded?: boolean;
    configuredFamilies?: string[];
    missingSelectedFamilies?: string[];
    missingInputAliases?: string[];
    localRuntimeInputsConfigured?: boolean;
    [key: string]: unknown;
  };
  operatorArtifacts: Array<{
    key: string;
    family: string;
    providerAlias: string;
    status: "ready-to-run" | "needs-credentials" | "needs-runtime-inputs" | string;
    requiredInputs: string[];
    expectedArtifacts: string[];
    captureSource: string;
    redaction: string;
    [key: string]: unknown;
  }>;
  scenarioAttachments: Array<{
    key: string;
    label: string;
    status: "covered" | "missing" | string;
    evidenceCount: number;
    expectedEvidence: string[];
    nextAction?: string;
    [key: string]: unknown;
  }>;
  commandPreview?: {
    command?: string;
    envTemplate?: string;
    requiredInputs?: string[];
    requiredAliases?: string[];
    targetInputs?: string[];
    [key: string]: unknown;
  };
  target?: {
    siteId?: string;
    productId?: string;
    siteSelectorEnv?: string;
    settingsSiteSelectorEnv?: string;
    commerceSiteSelectorEnv?: string;
    [key: string]: unknown;
  };
  redactionPolicy?: Record<string, unknown>;
  secretHandling: string;
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
    operatorEvidencePacket?: BackyProviderCertificationEvidencePacket;
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

export type BackyCommerceOrderProviderCertificationEvidence =
  GeneratedBackyOpenApiCommerceOrderProviderCertificationEvidence &
    Record<string, unknown>;

export type BackyCommerceOrderProviderCertificationEvidencePacket =
  GeneratedBackyOpenApiCommerceOrderProviderCertificationEvidencePacket &
    Record<string, unknown>;

export type BackyCommerceOrderAnalyticsProviderCertification =
  GeneratedBackyOpenApiCommerceOrderAnalyticsProviderCertification &
    BackyCommerceProviderCertification &
    Record<string, unknown>;

export type BackyCommerceOrderAnalytics =
  GeneratedBackyOpenApiCommerceOrderAnalytics & Record<string, unknown>;

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
    providerCertification?: BackyCommerceOrderAnalyticsProviderCertification;
  } & Record<string, unknown>
>;

export type BackyCommerceOrderStatusHandoff =
  GeneratedBackyOpenApiCommerceOrderStatusHandoff & Record<string, unknown>;

export type BackyCommerceOrderStatusAccess =
  GeneratedBackyOpenApiCommerceOrderStatusAccess & Record<string, unknown>;

export type BackyCommerceOrderStatusHandoffResponse = BackyEnvelope<
  {
    site?: { id: string; slug?: string; name?: string; [key: string]: unknown };
    collection?: {
      id: string;
      slug?: string;
      name?: string;
      [key: string]: unknown;
    };
    statusHandoff: BackyCommerceOrderStatusHandoff;
    statusAccess?: BackyCommerceOrderStatusAccess;
  } & Record<string, unknown>
>;

export interface BackyCommerceOrderPublicStatusOptions {
  siteId?: string;
  requestId?: string;
  lookupBy?: "orderId" | "orderSlug" | "orderNumber";
}

export interface BackyCommerceProductStorefrontHandoff {
  schemaVersion: "backy.product-storefront-handoff.v1" | string;
  generatedAt: string;
  source?: "admin-product-provider-sync-api" | string;
  selectedSiteId?: string;
  selectedProductId?: string;
  product?: Record<string, unknown> | null;
  endpoints?: Record<string, unknown>;
  pricing?: Record<string, unknown> | null;
  inventory?: Record<string, unknown> | null;
  media?: Record<string, unknown> | null;
  merchandising?: Record<string, unknown> | null;
  design?: BackyCommerceProductDesign | null;
  designReadiness?: BackyCommerceProductDesignReadiness;
  delivery?: Record<string, unknown> | null;
  subscription?: Record<string, unknown> | null;
  checkout?: {
    orderIntakeReady?: boolean;
    directCheckoutUrlConfigured?: boolean;
    mode?: "backy-order-intake" | "direct-checkout-url" | "missing" | string;
    [key: string]: unknown;
  };
  providerSync?: {
    provider?: string;
    status?: string;
    executionMode?: string;
    syncedAt?: string | null;
    hasProviderProductReference?: boolean;
    hasProviderPriceReference?: boolean;
    hasError?: boolean;
    [key: string]: unknown;
  };
  launchReadiness?: {
    schemaVersion?: "backy.product-launch-readiness.v1" | string;
    status?: "ready" | "attention" | "blocked" | string;
    score?: number;
    readyCount?: number;
    totalChecks?: number;
    blockerCount?: number;
    attentionCount?: number;
    checks?: Array<Record<string, unknown>>;
    nextSteps?: Array<Record<string, unknown>>;
    [key: string]: unknown;
  };
  privacy?: {
    customerSafeFieldsOnly?: boolean;
    includesProviderSecrets?: boolean;
    includesProviderResponses?: boolean;
    includesPrivateOrders?: boolean;
    includesCustomerPayloads?: boolean;
    includesDigitalDeliveryUrl?: boolean;
    includesRawCheckoutSessions?: boolean;
    excludedFields?: string[];
    [key: string]: unknown;
  };
  secretHandling?: string;
  [key: string]: unknown;
}

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
    sync: GeneratedBackyOpenApiCommerceProductProviderSync | null;
    product: BackyCollectionRecord;
    cacheInvalidation?: Record<string, unknown>;
    providerCertification?: BackyCommerceProviderCertification;
    storefrontHandoff?: BackyCommerceProductStorefrontHandoff;
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

export type BackyCommerceOrderQuote =
  GeneratedBackyOpenApiCommerceOrderQuote & Record<string, unknown>;

export type BackyCommerceOrderTracking =
  GeneratedBackyOpenApiCommerceOrderTracking & Record<string, unknown>;

export type BackyCommerceOrderProviderRefund =
  GeneratedBackyOpenApiCommerceOrderProviderRefund & Record<string, unknown>;

export type BackyCommerceOrderFulfillment =
  GeneratedBackyOpenApiCommerceOrderFulfillment & Record<string, unknown>;

export type BackyCommerceOrderShippingLabel =
  GeneratedBackyOpenApiCommerceOrderShippingLabel & Record<string, unknown>;

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

export type BackyCommerceProductSubscriptionsLifecycle =
  GeneratedBackyOpenApiCommerceProductSubscriptionLifecycle &
    Record<string, unknown>;

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

export type BackyCommerceProductSubscriptionAction =
  GeneratedBackyOpenApiCommerceProductSubscriptionAction &
    Record<string, unknown>;

export type BackyCommerceProductSubscriptionActionResponse = BackyEnvelope<
  {
    action: BackyCommerceProductSubscriptionAction;
    record: BackyCollectionRecord;
    order: BackyCollectionRecord;
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

export interface BackyCommercePlatformReconciliationOptions
  extends BackyLiveManagementRequestOptions {
  dryRun?: boolean;
  limit?: number;
  siteId?: string;
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

export interface BackyCommerceCronReadiness {
  schemaVersion: "backy.commerce-cron-readiness.v1";
  ready: boolean;
  entrypoint: string;
  schedule: string;
  authorizationMode: "vercel-cron-bearer-admin-key" | string;
  vercelCronConfigured: boolean;
  cronSecretConfigured: boolean;
  environmentAdminKeyConfigured: boolean;
  cronSecretMatchesAdminKey: boolean;
  missing: string[];
  checkedAt: string;
  [key: string]: unknown;
}

export type BackyCommerceReconciliationReadinessResponse = BackyEnvelope<
  {
    cronReadiness: BackyCommerceCronReadiness;
    [key: string]: unknown;
  }
>;

export type BackyCommerceReconciliationBatchResponse = BackyEnvelope<
  {
    schemaVersion: "backy.commerce-reconciliation-batch.v1";
    runMode: "scheduled" | string;
    dryRun: boolean;
    limit: number;
    processedAt: string;
    siteCount: number;
    reconciledSiteCount: number;
    skippedSiteCount: number;
    errorCount: number;
    eventCount: number;
    eligibleUpdateCount: number;
    updatedCount: number;
    unmatchedCount: number;
    cronReadiness: BackyCommerceCronReadiness;
    results: Array<Record<string, unknown>>;
    skipped: Array<Record<string, unknown>>;
    errors: Array<Record<string, unknown>>;
    [key: string]: unknown;
  }
>;

export interface BackyManifestCommerceManagementPolicy {
  schemaVersion: "backy.commerce-management.v1";
  endpoints: {
    products: string;
    product: string;
    productsCsv: string;
    importProducts: string;
    bulkProducts: string;
    orders: string;
    order: string;
    ordersCsv: string;
    importOrders: string;
    bulkOrders: string;
    orderAnalytics: string;
    orderStatusHandoff: string;
    orderQuote: string;
    orderTracking: string;
    orderFulfillment: string;
    orderShippingLabel: string;
    orderProviderRefund: string;
    productProviderSync: string;
    productSubscriptions: string;
    productSubscriptionAction: string;
    siteReconciliation: string;
    platformReconciliation: string;
    reconciliationReadiness: string;
    orderEvents: string;
    productEvents: string;
    [key: string]: unknown;
  };
  methods: {
    listProducts: "GET";
    createProduct: "POST";
    readProduct: "GET";
    updateProduct: "PATCH";
    deleteProduct: "DELETE";
    exportProductsCsv: "GET";
    importProductsCsv: "POST";
    bulkProducts: "POST";
    listOrders: "GET";
    createOrderRecord: "POST";
    readOrder: "GET";
    updateOrder: "PATCH";
    deleteOrder: "DELETE";
    exportOrdersCsv: "GET";
    importOrdersCsv: "POST";
    bulkOrders: "POST";
    orderAnalytics: "GET";
    orderStatusHandoff: "GET";
    orderQuote: "GET";
    refreshOrderQuote: "POST";
    orderTracking: "GET";
    refreshOrderTracking: "POST";
    orderFulfillment: "GET";
    dispatchOrderFulfillment: "POST";
    orderShippingLabel: "GET";
    createOrderShippingLabel: "POST";
    voidOrderShippingLabel: "DELETE";
    orderProviderRefund: "GET";
    createOrderProviderRefund: "POST";
    refreshOrderProviderRefund: "PATCH";
    productProviderSync: "GET";
    syncProductProvider: "POST";
    productSubscriptions: "GET";
    productSubscriptionAction: "POST";
    scheduledSiteReconciliation: "GET";
    runSiteReconciliation: "POST";
    platformReconciliation: "GET";
    reconciliationReadiness: "GET";
    orderEvents: "GET";
    productEvents: "GET";
    [key: string]: unknown;
  };
  auth: {
    modes: Array<"session" | "api-key">;
    headers: string[];
    requiredPermissions: {
      read: "commerce.view";
      write: "commerce.edit";
      configure: "commerce.configure";
      delete: "commerce.delete";
      collectionRead: "collections.view";
      collectionWrite: "collections.edit";
      collectionExport: "collections.export";
      collectionDelete: "collections.delete";
      pageTemplates: "pages.edit";
      mediaRead: "media.view";
      mediaCreate: "media.create";
      activity: "activity.export";
      [key: string]: unknown;
    };
    siteScope: true;
    platformEndpoints: string[];
    [key: string]: unknown;
  };
  sdkHelpers: Record<string, string>;
  responseContracts: {
    orderAnalytics: "backy.order-analytics.v1";
    orderStatusHandoff: "backy.order-status-handoff.v1";
    orderQuote: "backy.order-quote.v1";
    orderTracking: "backy.tracking.v1";
    orderFulfillment: "backy.fulfillment-dispatch.v1";
    orderShippingLabel: "backy.shipping-label.v1";
    orderProviderRefund: "backy.provider-refund.v1";
    productProviderSync: "backy.commerce-product-sync.v1";
    productStorefrontHandoff: "backy.product-storefront-handoff.v1";
    providerCertification: "backy.commerce-provider-certification-handoff.v1";
    [key: string]: string;
  };
  privacy: {
    productCatalogCanBePublic: true;
    ordersRemainPrivate: true;
    orderStatusHandoffMasksCustomerContact: true;
    productStorefrontHandoffExcludesPrivateData: true;
    providerOperationPayloadsMayContainCustomerData: true;
    providerSecretsNeverReturned: true;
    rawProviderResponsesStayPrivate: true;
    [key: string]: unknown;
  };
  secretHandling: string;
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
    authenticatedManagement: boolean;
    productAdmin: boolean;
    orderAdmin: boolean;
    providerOperations: boolean;
    fulfillmentOperations: boolean;
    reconciliation: boolean;
    customerStatusHandoff: boolean;
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
  managementPolicy: BackyManifestCommerceManagementPolicy;
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

export type BackyAdminInteractiveComponentStatus =
  | "active"
  | "disabled"
  | "archived"
  | "all";

export type BackyAdminInteractiveComponentReviewStatus =
  | "draft"
  | "in_review"
  | "approved"
  | "rejected"
  | "all";

export type BackyAdminInteractiveComponentType =
  | "interactiveFigure"
  | "codeComponent"
  | "all";

export interface BackyAdminInteractiveComponent
  extends BackyInteractiveComponentRegistryEntry {
  id: string;
  siteId?: string;
  reviewStatus:
    | "draft"
    | "in_review"
    | "approved"
    | "rejected"
    | string;
  ownerId?: string | null;
  dependencyMetadata?: Record<string, unknown>;
  changelog?: string | null;
  rollbackFromVersion?: string | null;
  createdBy?: string | null;
  updatedBy?: string | null;
  reviewedBy?: string | null;
  reviewedAt?: string | null;
  createdAt?: string;
  updatedAt?: string;
}

export interface BackyAdminInteractiveComponentListOptions
  extends BackyLiveManagementRequestOptions {
  status?: BackyAdminInteractiveComponentStatus | string;
  reviewStatus?: BackyAdminInteractiveComponentReviewStatus | string;
  type?: BackyAdminInteractiveComponentType | string;
  search?: string;
}

export type BackyAdminInteractiveComponentsResponse = BackyEnvelope<
  {
    components: BackyAdminInteractiveComponent[];
    pagination: BackyPagination;
    [key: string]: unknown;
  }
>;

export type BackyAdminInteractiveComponentResponse = BackyEnvelope<
  {
    component: BackyAdminInteractiveComponent;
    [key: string]: unknown;
  }
>;

export interface BackyAdminInteractiveComponentInput {
  componentKey?: string;
  version?: string;
  displayName?: string;
  type?: "interactiveFigure" | "codeComponent" | string;
  status?: "active" | "disabled" | "archived" | string;
  reviewStatus?:
    | "draft"
    | "in_review"
    | "approved"
    | "rejected"
    | string;
  renderMode?:
    | "trusted-component"
    | "sandbox-iframe"
    | "static-fallback"
    | string;
  source?: "registry" | "custom" | string;
  description?: string;
  allowedDataScopes?: string[];
  requiredFields?: string[];
  controls?: Array<Record<string, unknown>>;
  fallback?: Record<string, unknown>;
  security?: Record<string, unknown>;
  integrity?: Record<string, unknown>;
  runtime?: Record<string, unknown>;
  ownerId?: string | null;
  dependencyMetadata?: Record<string, unknown>;
  dependencyPolicy?: Record<string, unknown>;
  compatibility?: Record<string, unknown>;
  dataBindingPresets?: Array<Record<string, unknown>>;
  exportPackage?: Record<string, unknown>;
  changelog?: string | null;
  rollbackFromVersion?: string | null;
  createdBy?: string | null;
  updatedBy?: string | null;
  reviewedBy?: string | null;
  reviewedAt?: string | null;
  requestId?: string;
  [key: string]: unknown;
}

export type BackyAdminInteractiveComponentUpdateInput =
  Omit<BackyAdminInteractiveComponentInput, "componentKey" | "version"> & {
    componentKey?: never;
    version?: never;
  };

export type BackyAdminInteractiveComponentDeleteResponse = BackyEnvelope<
  {
    deleted: boolean;
    componentId: string;
    [key: string]: unknown;
  }
>;

export interface BackyAdminInteractiveComponentUsageRecord {
  targetType: "page" | "post" | string;
  targetId: string;
  title: string;
  slug: string;
  status: string;
  elementId: string | null;
  elementType: string | null;
  elementPath: string;
  version: string | null;
  renderMode: string | null;
  fallbackConfigured: boolean;
  updatedAt: string | null;
  [key: string]: unknown;
}

export type BackyAdminInteractiveComponentUsageResponse = BackyEnvelope<
  {
    componentKey: string;
    version: string | null;
    usage: BackyAdminInteractiveComponentUsageRecord[];
    summary: {
      total: number;
      pages: number;
      posts: number;
      scanned: {
        pages: number;
        posts: number;
        [key: string]: unknown;
      };
      [key: string]: unknown;
    };
    [key: string]: unknown;
  }
>;

export interface BackyAdminInteractiveComponentExportPackage {
  schemaVersion: "backy.interactive-component-export.v1" | string;
  component?: BackyAdminInteractiveComponent | Record<string, unknown>;
  importTarget?: Record<string, unknown>;
  conflictPolicy?: Record<string, unknown>;
  usageInventoryEndpoint?: string;
  [key: string]: unknown;
}

export type BackyAdminInteractiveComponentExportResponse = BackyEnvelope<
  {
    component: BackyAdminInteractiveComponent;
    exportPackage: BackyAdminInteractiveComponentExportPackage;
    [key: string]: unknown;
  }
>;

export type BackyAdminInteractiveComponentReviewAction =
  | "submit"
  | "approve"
  | "reject";

export interface BackyAdminInteractiveComponentReviewInput {
  action: BackyAdminInteractiveComponentReviewAction;
  reviewedBy?: string;
  updatedBy?: string;
  runtime?: Record<string, unknown>;
  integrity?: Record<string, unknown>;
  dependencyMetadata?: Record<string, unknown>;
  notes?: string;
  reviewNotes?: string;
  checklist?: Record<string, unknown>;
  changelog?: string;
  requestId?: string;
  [key: string]: unknown;
}

export type BackyAdminInteractiveComponentReviewResponse = BackyEnvelope<
  {
    action: BackyAdminInteractiveComponentReviewAction;
    component: BackyAdminInteractiveComponent;
    [key: string]: unknown;
  }
>;

export interface BackyAdminInteractiveComponentBundleInput {
  contentBase64: string;
  filename?: string;
  contentType?: string;
  signature?: string;
  signedBy?: string;
  updatedBy?: string;
  changelog?: string | null;
  requestId?: string;
  [key: string]: unknown;
}

export interface BackyAdminInteractiveComponentBundleMetadata {
  schemaVersion: "backy.interactive-component-bundle.v1" | string;
  filename: string;
  contentType: string;
  sizeBytes: number;
  storageProvider: string;
  storagePath: string;
  bundleUrl: string;
  sha256: string;
  signed: boolean;
  signedBy: string;
  signedAt: string;
  [key: string]: unknown;
}

export type BackyAdminInteractiveComponentBundleResponse = BackyEnvelope<
  {
    component: BackyAdminInteractiveComponent;
    bundle: BackyAdminInteractiveComponentBundleMetadata;
    [key: string]: unknown;
  }
>;

export interface BackyAdminInteractiveComponentMigrationInput {
  targetComponentKey?: string;
  componentKey?: string;
  targetVersion?: string;
  version?: string;
  dryRun?: boolean;
  updatedBy?: string;
  requestId?: string;
  [key: string]: unknown;
}

export interface BackyAdminInteractiveComponentMigrationTarget {
  targetType: "page" | "post" | string;
  targetId: string;
  title: string;
  slug: string;
  status: string;
  updatedAt?: string | null;
  migrated: number;
  elementPaths: string[];
  [key: string]: unknown;
}

export type BackyAdminInteractiveComponentMigrationResponse = BackyEnvelope<
  {
    dryRun: boolean;
    source: {
      componentKey: string;
      version: string;
      [key: string]: unknown;
    };
    target: {
      componentKey: string;
      version: string;
      [key: string]: unknown;
    };
    migratedTargets: BackyAdminInteractiveComponentMigrationTarget[];
    summary: {
      targets: number;
      elements: number;
      scanned: {
        pages: number;
        posts: number;
        [key: string]: unknown;
      };
      [key: string]: unknown;
    };
    [key: string]: unknown;
  }
>;

export interface BackyAdminInteractiveComponentRollbackInput {
  rollbackBy?: string;
  updatedBy?: string;
  changelog?: string | null;
  requestId?: string;
  [key: string]: unknown;
}

export type BackyAdminInteractiveComponentRollbackResponse = BackyEnvelope<
  {
    rolledBack: boolean;
    restoredFromVersion: string | null;
    component: BackyAdminInteractiveComponent;
    disabledVersions: BackyAdminInteractiveComponent[];
    [key: string]: unknown;
  }
>;

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
  customJs?: string;
  contentDocument?: Record<string, unknown>;
  elements?: unknown[];
  canvasSize?: Record<string, unknown>;
  themeTokenRefs?: Record<string, unknown>;
  assets?: BackyDesignArrayOrRecord;
  animations?: BackyDesignArrayOrRecord;
  frontendDesignAnimations?: BackyDesignArrayOrRecord;
  interactions?: BackyDesignArrayOrRecord;
  dataBindings?: Record<string, unknown>;
  editableMap?: Record<string, unknown>;
  seo?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
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

export interface BackyAdminPageRollbackInput
  extends GeneratedBackyOpenApiAdminPageRollbackRequest {
  requestId?: string;
  [key: string]: unknown;
}

export interface BackyAdminPageRevisionListOptions
  extends BackyLiveManagementRequestOptions {
  limit?: number;
  offset?: number;
}

export interface BackyContentRevisionBranchMetadata {
  schemaVersion: "backy.content-revision-branch-metadata.v1";
  source: "admin-page-revisions-api" | "admin-blog-revisions-api" | string;
  targetType: "page" | "post";
  position: number;
  total: number;
  order: "newest-first" | string;
  branchId: string;
  branchLabel: string;
  branchLane: number;
  branchRole: "trunk" | "restore-checkpoint" | "restore-branch" | string;
  chronologicalParentId: string | null;
  chronologicalChildId: string | null;
  restoreTargetRevisionId: string | null;
  restoreTargetPosition: number | null;
  restoreTargetInWindow: boolean;
  restoreEdgeId: string | null;
  branchPointRevisionId?: string | null;
  inference: {
    source: "revision-note-and-order" | string;
    lineageSource?: "persisted-revision-lineage" | "revision-note-and-order" | string;
    rollbackNotePattern: string;
    confidence: "explicit-api-metadata" | string;
    persistedFields: string[];
    limitation: string;
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

export interface BackyAdminContentRevision<
  TTargetType extends "page" | "post",
  TSnapshot extends Record<string, unknown>,
> {
  id: string;
  siteId: string;
  targetType: TTargetType;
  targetId: string;
  snapshot: TSnapshot;
  note: string | null;
  parentRevisionId: string | null;
  operation: string | null;
  restoreTargetRevisionId: string | null;
  metadata: Record<string, unknown>;
  createdBy: string | null;
  createdAt: string;
  branchMetadata: BackyContentRevisionBranchMetadata;
  [key: string]: unknown;
}

export type BackyAdminPageRevision = BackyAdminContentRevision<
  "page",
  BackyAdminPageResource
>;

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
    revisions: BackyAdminPageRevision[];
    pagination?: BackyPagination;
  } & Record<string, unknown>
>;

export interface BackyAdminBlogCategoryResource extends BackyBlogCategory {
  createdAt?: string;
  updatedAt?: string;
}

export interface BackyAdminBlogCategoryInput {
  name: string;
  slug?: string;
  description?: string | null;
  color?: string | null;
  sortOrder?: number;
  requestId?: string;
  [key: string]: unknown;
}

export interface BackyAdminBlogCategoryUpdateInput
  extends Partial<Omit<BackyAdminBlogCategoryInput, "name">> {
  name?: string;
}

export interface BackyAdminBlogTagResource extends BackyBlogTag {
  createdAt?: string;
  updatedAt?: string;
}

export interface BackyAdminBlogTagInput {
  name: string;
  slug?: string;
  description?: string | null;
  requestId?: string;
  [key: string]: unknown;
}

export interface BackyAdminBlogTagUpdateInput
  extends Partial<Omit<BackyAdminBlogTagInput, "name">> {
  name?: string;
}

export interface BackyAdminBlogAuthorResource extends BackyBlogAuthor {
  createdAt?: string;
  updatedAt?: string;
}

export type BackyAdminBlogCategoriesResponse = BackyEnvelope<
  {
    categories: BackyAdminBlogCategoryResource[];
  } & Record<string, unknown>
>;

export type BackyAdminBlogCategoryResponse = BackyEnvelope<
  {
    category: BackyAdminBlogCategoryResource;
    cacheInvalidation?: Record<string, unknown>;
  } & Record<string, unknown>
>;

export type BackyAdminBlogCategoryDeleteResponse = BackyEnvelope<
  {
    deleted: boolean;
    categoryId: string;
    cacheInvalidation?: Record<string, unknown>;
  } & Record<string, unknown>
>;

export type BackyAdminBlogTagsResponse = BackyEnvelope<
  {
    tags: BackyAdminBlogTagResource[];
  } & Record<string, unknown>
>;

export type BackyAdminBlogTagResponse = BackyEnvelope<
  {
    tag: BackyAdminBlogTagResource;
    cacheInvalidation?: Record<string, unknown>;
  } & Record<string, unknown>
>;

export type BackyAdminBlogTagDeleteResponse = BackyEnvelope<
  {
    deleted: boolean;
    tagId: string;
    cacheInvalidation?: Record<string, unknown>;
  } & Record<string, unknown>
>;

export type BackyAdminBlogAuthorsResponse = BackyEnvelope<
  {
    authors: BackyAdminBlogAuthorResource[];
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

export interface BackyAdminBlogPostRollbackInput
  extends GeneratedBackyOpenApiAdminBlogPostRollbackRequest {
  requestId?: string;
  [key: string]: unknown;
}

export interface BackyAdminBlogPostRevisionListOptions
  extends BackyLiveManagementRequestOptions {
  limit?: number;
  offset?: number;
}

export type BackyAdminBlogPostRevision = BackyAdminContentRevision<
  "post",
  BackyAdminBlogPostResource
>;

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
    revisions: BackyAdminBlogPostRevision[];
    pagination?: BackyPagination;
  } & Record<string, unknown>
>;

export type BackyEditableContent =
  | BackyContentDocument
  | (Record<string, unknown> & {
      elements?: BackyElement[];
      contentDocument?: BackyContentDocument | Record<string, unknown>;
    });

export interface BackyContentDesignStateInput extends Record<string, unknown> {
  content?: BackyEditableContent | Record<string, unknown> | unknown[];
  templateId?: string | null;
  templateName?: string | null;
  frontendDesignTemplateId?: string | null;
  frontendDesignTemplateName?: string | null;
  routePattern?: string | null;
  customCSS?: string | null;
  customCss?: string | null;
  customJS?: string | null;
  customJs?: string | null;
  contentDocument?: BackyContentDocument | Record<string, unknown>;
  elements?: unknown[];
  canvasSize?: Record<string, unknown>;
  themeTokenRefs?: Record<string, unknown>;
  assets?: unknown[] | Record<string, unknown>;
  animations?: unknown[] | Record<string, unknown>;
  interactions?: unknown[] | Record<string, unknown>;
  dataBindings?: Record<string, unknown>;
  editableMap?: Record<string, unknown>;
  seo?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
  bindingHints?: unknown[];
}

export interface BackyContentDesignPayload extends Record<string, unknown> {
  elements?: unknown[];
  canvasSize?: Record<string, unknown>;
  customCSS?: string;
  customJS?: string;
  contentDocument?: BackyContentDocument | Record<string, unknown>;
  themeTokenRefs?: Record<string, unknown>;
  assets?: unknown[] | Record<string, unknown>;
  animations?: unknown[] | Record<string, unknown>;
  interactions?: unknown[] | Record<string, unknown>;
  dataBindings?: Record<string, unknown>;
  editableMap?: Record<string, unknown>;
  seo?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
}

export interface BackyAdminPageCreateFromDesignInput
  extends Omit<BackyAdminPageCreateInput, "content"> {
  design?: BackyContentDesignStateInput | null;
  content?: BackyContentDesignStateInput | BackyEditableContent | Record<string, unknown> | unknown[];
}

export interface BackyAdminPageUpdateFromDesignInput
  extends Omit<BackyAdminPageUpdateInput, "content"> {
  design?: BackyContentDesignStateInput | null;
  content?: BackyContentDesignStateInput | BackyEditableContent | Record<string, unknown> | unknown[];
}

export interface BackyAdminBlogPostCreateFromDesignInput
  extends Omit<BackyAdminBlogPostCreateInput, "content"> {
  design?: BackyContentDesignStateInput | null;
  content?: BackyContentDesignStateInput | BackyEditableContent | Record<string, unknown> | unknown[];
}

export interface BackyAdminBlogPostUpdateFromDesignInput
  extends Omit<BackyAdminBlogPostUpdateInput, "content"> {
  design?: BackyContentDesignStateInput | null;
  content?: BackyContentDesignStateInput | BackyEditableContent | Record<string, unknown> | unknown[];
}

export interface BackyAdminReusableSectionCreateFromDesignInput
  extends Omit<BackyAdminReusableSectionCreateInput, "content"> {
  design?: BackyContentDesignStateInput | null;
  content?: BackyContentDesignStateInput | BackyEditableContent | Record<string, unknown> | unknown[];
}

export interface BackyAdminReusableSectionUpdateFromDesignInput
  extends Omit<BackyAdminReusableSectionUpdateInput, "content"> {
  design?: BackyContentDesignStateInput | null;
  content?: BackyContentDesignStateInput | BackyEditableContent | Record<string, unknown> | unknown[];
}

export type BackyCollectionRecordDesignInput =
  | BackyContentDesignStateInput
  | BackyCommerceProductDesign
  | BackyEditableContent
  | Record<string, unknown>
  | unknown[];

export interface BackyAdminCollectionRecordCreateFromDesignInput<
  TValues extends Record<string, unknown> = Record<string, unknown>,
> extends Omit<BackyAdminCollectionRecordCreateInput<TValues>, "values"> {
  values?: TValues;
  design?: BackyCollectionRecordDesignInput | null;
  content?: BackyCollectionRecordDesignInput | null;
}

export interface BackyAdminCollectionRecordUpdateFromDesignInput<
  TValues extends Record<string, unknown> = Record<string, unknown>,
> extends Omit<BackyAdminCollectionRecordUpdateInput<TValues>, "values"> {
  values?: Partial<TValues>;
  design?: BackyCollectionRecordDesignInput | null;
  content?: BackyCollectionRecordDesignInput | null;
}

export type BackyAdminCommerceProductCreateFromDesignInput<
  TValues extends Record<string, unknown> = BackyAdminCommerceProductValues,
> = BackyAdminCollectionRecordCreateFromDesignInput<TValues>;

export type BackyAdminCommerceProductUpdateFromDesignInput<
  TValues extends Record<string, unknown> = BackyAdminCommerceProductValues,
> = BackyAdminCollectionRecordUpdateFromDesignInput<TValues>;

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
  | "tokenRefs"
  | "animation"
  | "interactions"
  | "assets"
  | "responsive"
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
    | "asset"
    | "assetList"
    | "font"
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

export type BackyEditorCommandEvaluationStateValue =
  | "ready"
  | "disabled"
  | "hidden";

export interface BackyEditorCommandEvaluationInput {
  content?: BackyEditableContent | null;
  descriptors?: BackyContentElementDescriptor[];
  selectedIds?: string[];
  clipboardCount?: number;
  canEdit?: boolean;
  canPublish?: boolean;
  publishBlocked?: boolean;
  isSaving?: boolean;
  isPreview?: boolean;
  hideSave?: boolean;
  hideSettings?: boolean;
  editorMode?: "page" | "blog" | "section" | string;
  historyIndex?: number;
  historyLength?: number;
}

export interface BackyEditorCommandEvaluation {
  id: string;
  label: string;
  category: BackyManifestEditorCommandRegistryCommand["category"];
  targetScope: BackyManifestEditorCommandRegistryCommand["targetScope"];
  testId: string;
  shortcut?: string;
  ariaKeyshortcuts?: string;
  sdkHelper?: string;
  apiHelper?: string;
  enabled: boolean;
  state: BackyEditorCommandEvaluationStateValue;
  reason: string;
  command: BackyManifestEditorCommandRegistryCommand;
}

export interface BackyEditorCommandRegistryEvaluation {
  schemaVersion: "backy.editor-command-registry-evaluation.v1";
  registrySchemaVersion: BackyManifestEditorCommandRegistry["schemaVersion"];
  selectedIds: string[];
  summary: {
    totalCommandCount: number;
    readyCommandCount: number;
    disabledCommandCount: number;
    hiddenCommandCount: number;
    selectedLayerCount: number;
  };
  commands: BackyEditorCommandEvaluation[];
}

export interface BackyContentGroupOptions {
  groupId?: string;
  name?: string;
  type?: string;
  allowLocked?: boolean;
  props?: Record<string, unknown>;
  styles?: Record<string, unknown>;
  fields?: Record<string, unknown>;
}

export interface BackyContentGroupResult<
  TContent extends BackyEditableContent = BackyEditableContent,
> {
  content: TContent;
  groupId: string;
  groupedIds: string[];
  parentId?: string;
  childCount: number;
}

export interface BackyContentUngroupOptions {
  allowLocked?: boolean;
  requireEditorGroup?: boolean;
}

export interface BackyContentUngroupResult<
  TContent extends BackyEditableContent = BackyEditableContent,
> {
  content: TContent;
  ungroupedIds: string[];
  expandedIds: string[];
  parentId?: string;
  childCount: number;
}

export interface BackyContentAddElementOptions {
  parentId?: string;
  index?: number;
  allowLockedParent?: boolean;
}

export interface BackyContentAddElementResult<
  TContent extends BackyEditableContent = BackyEditableContent,
> {
  content: TContent;
  elementId: string;
  parentId?: string;
  index: number;
}

export interface BackyContentDuplicateElementOptions {
  duplicateId?: string;
  idSuffix?: string;
  index?: number;
  offsetX?: number;
  offsetY?: number;
  allowLocked?: boolean;
}

export interface BackyContentDuplicateElementResult<
  TContent extends BackyEditableContent = BackyEditableContent,
> {
  content: TContent;
  sourceId: string;
  duplicateId: string;
  duplicatedIds: string[];
  parentId?: string;
  index: number;
}

export interface BackyContentDeleteElementsOptions {
  allowLocked?: boolean;
}

export interface BackyContentDeleteElementsResult<
  TContent extends BackyEditableContent = BackyEditableContent,
> {
  content: TContent;
  deletedIds: string[];
}

export type BackyContentTransformBreakpoint = "desktop" | "tablet" | "mobile" | string;

export interface BackyContentElementTransform {
  elementId: string;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  zIndex?: number;
  rotation?: number;
  deltaX?: number;
  deltaY?: number;
  deltaWidth?: number;
  deltaHeight?: number;
  breakpoint?: BackyContentTransformBreakpoint;
}

export interface BackyContentTransformElementsOptions {
  allowLocked?: boolean;
  minWidth?: number;
  minHeight?: number;
}

export interface BackyContentTransformElementsResult<
  TContent extends BackyEditableContent = BackyEditableContent,
> {
  content: TContent;
  transformedIds: string[];
  breakpoints: BackyContentTransformBreakpoint[];
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
const BACKY_RESPONSIVE_BREAKPOINTS = ["tablet", "mobile"] as const;
const BACKY_RESPONSIVE_GEOMETRY_FIELDS = [
  "x",
  "y",
  "width",
  "height",
  "zIndex",
  "rotation",
] as const;
const BACKY_RESPONSIVE_LAYER_FIELDS = ["visible", "locked"] as const;
const BACKY_COMMON_PROP_EDITABLE_TARGETS = [
  "backgroundColor",
  "borderColor",
  "borderRadius",
  "borderWidth",
  "borderStyle",
  "padding",
  "margin",
  "opacity",
  "boxShadow",
] as const;
const BACKY_TEXT_PROP_EDITABLE_TARGETS = [
  "content",
  "color",
  "fontFamily",
  "fontSize",
  "fontWeight",
  "lineHeight",
  "textAlign",
  "textTransform",
  "letterSpacing",
  "wordSpacing",
  "textIndent",
  "textShadow",
  "textDecoration",
  "fontStyle",
] as const;
const BACKY_LINK_PROP_EDITABLE_TARGETS = [
  "href",
  "target",
  "rel",
  "ariaLabel",
  "title",
  "download",
  "underline",
] as const;
const BACKY_BUTTON_PROP_EDITABLE_TARGETS = [
  "label",
  "href",
  "target",
  "rel",
  "ariaLabel",
  "title",
  "type",
  "actionPreset",
  "actionValue",
  "download",
] as const;
const BACKY_FORM_PROP_EDITABLE_TARGETS = [
  "formId",
  "formTitle",
  "submitLabel",
  "action",
  "actionUrl",
  "method",
  "successMessage",
  "successRedirectUrl",
  "formActive",
  "labelColor",
  "helpTextColor",
  "fieldBackgroundColor",
  "fieldBorderColor",
  "fieldBorderRadius",
  "submitBackgroundColor",
  "submitColor",
  "submitBorderRadius",
] as const;
const BACKY_FIELD_PROP_EDITABLE_TARGETS = [
  "label",
  "name",
  "placeholder",
  "helpText",
  "defaultValue",
  "value",
  "required",
  "disabled",
] as const;
const BACKY_MEDIA_PROP_EDITABLE_TARGETS = [
  "src",
  "alt",
  "title",
  "mediaId",
  "mediaIds",
  "objectFit",
  "objectPosition",
  "imageFocalPoint",
] as const;
const BACKY_DOWNLOAD_FILE_PROP_EDITABLE_TARGETS = [
  "fileId",
  "fileIds",
  "fileMediaId",
  "fileMediaIds",
  "downloadMediaId",
  "downloadMediaIds",
  "fileMediaUrl",
  "fileUrl",
  "fileMediaName",
  "fileMediaType",
  "fileMediaVisibility",
  "fileDownloadDisposition",
  "fileSignedUrlRequired",
  "fileSignedUrlEndpoint",
  "fileName",
] as const;
const BACKY_STYLE_EDITABLE_TARGETS = [
  "color",
  "backgroundColor",
  "borderColor",
  "fontFamily",
  "fontSize",
  "lineHeight",
  "fontWeight",
  "padding",
  "margin",
  "borderRadius",
  "boxShadow",
] as const;
const BACKY_TOKEN_REF_EDITABLE_TARGETS = [
  "styles.color",
  "styles.backgroundColor",
  "styles.borderColor",
  "styles.fontFamily",
  "styles.fontSize",
  "styles.lineHeight",
  "styles.fontWeight",
  "styles.padding",
  "styles.margin",
  "styles.borderRadius",
  "styles.boxShadow",
] as const;
const BACKY_ANIMATION_EDITABLE_TARGETS = [
  "animation.type",
  "animation.duration",
  "animation.delay",
  "animation.easing",
  "animation.direction",
  "animation.trigger",
  "animation.scrollTrigger",
  "animation.scrollTrigger.start",
  "animation.scrollTrigger.end",
  "animation.scrollTrigger.scrub",
  "animation.from",
  "animation.to",
  "animation.tokenRefs.duration",
  "animation.tokenRefs.easing",
] as const;
const BACKY_INTERACTION_EDITABLE_TARGETS = [
  "actions",
  "dataBindings",
  "bindingSlots",
] as const;
const BACKY_NUMERIC_EDITABLE_LEAVES = new Set([
  "x",
  "y",
  "width",
  "height",
  "zindex",
  "rotation",
  "borderradius",
  "fieldborderradius",
  "submitborderradius",
  "borderwidth",
  "padding",
  "margin",
  "opacity",
  "fontsize",
  "lineheight",
  "letterspacing",
  "wordspacing",
  "textindent",
  "rows",
  "duration",
  "delay",
]);
const BACKY_BOOLEAN_EDITABLE_LEAVES = new Set([
  "download",
  "required",
  "disabled",
  "underline",
  "formactive",
  "visible",
  "locked",
  "controls",
  "autoplay",
  "muted",
  "loop",
  "filesignedurlrequired",
  "scrub",
]);
const BACKY_STRING_EDITABLE_LEAVES = new Set([
  "fontweight",
  "fontstyle",
  "fontdisplay",
  "fontfallback",
  "method",
  "textalign",
  "texttransform",
  "textdecoration",
  "borderstyle",
  "actionpreset",
  "actionvalue",
  "target",
  "rel",
  "type",
  "inputtype",
  "objectfit",
  "objectposition",
  "boxshadow",
  "filedownloaddisposition",
  "filemedianame",
  "filemediatype",
  "filemediavisibility",
  "filename",
  "easing",
  "direction",
  "trigger",
  "start",
  "end",
]);
const BACKY_ASSET_REFERENCE_KEYS = new Set([
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

function isBackyRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasNonEmptyBackyArray(value: unknown): boolean {
  return Array.isArray(value) && value.length > 0;
}

function hasNonEmptyBackyRecord(value: unknown): value is Record<string, unknown> {
  return isBackyRecord(value) && Object.keys(value).length > 0;
}

function isInteractiveBackyElementRecord(element: Record<string, unknown>): boolean {
  return element.type === "interactiveFigure" ||
    element.type === "codeComponent" ||
    (typeof element.componentKey === "string" && element.componentKey.trim().length > 0) ||
    hasNonEmptyBackyArray(element.controls) ||
    isBackyRecord(element.renderCapabilities);
}

const BACKY_ACTION_PROP_KEYS = [
  "href",
  "url",
  "action",
  "actionUrl",
  "formId",
  "successRedirectUrl",
  "redirectUrl",
] as const;

function hasBackyElementActionWiring(
  element: Record<string, unknown>,
  props: Record<string, unknown>,
): boolean {
  return hasNonEmptyBackyArray(element.actions) ||
    BACKY_ACTION_PROP_KEYS.some((key) => (
      typeof props[key] === "string" && props[key].trim().length > 0
    ));
}

function cloneBackyContent<TContent extends BackyEditableContent>(
  content: TContent,
): TContent {
  if (typeof structuredClone === "function") {
    return structuredClone(content);
  }

  return JSON.parse(JSON.stringify(content)) as TContent;
}

function cloneBackyRecord<TRecord extends Record<string, unknown>>(
  record: TRecord,
): TRecord {
  if (typeof structuredClone === "function") {
    return structuredClone(record);
  }

  return JSON.parse(JSON.stringify(record)) as TRecord;
}

function cloneBackyValue<TValue>(value: TValue): TValue {
  if (value === undefined || value === null || typeof value !== "object") {
    return value;
  }
  if (typeof structuredClone === "function") {
    return structuredClone(value);
  }

  return JSON.parse(JSON.stringify(value)) as TValue;
}

function backyDesignSource(value: unknown): Record<string, unknown> {
  if (Array.isArray(value)) {
    return { elements: value };
  }
  return isBackyRecord(value) ? value : {};
}

function backyDesignContentSource(value: unknown): Record<string, unknown> {
  const source = backyDesignSource(value);
  return backyDesignSource(source.content);
}

function backyDesignValue(
  source: Record<string, unknown>,
  contentSource: Record<string, unknown>,
  keys: readonly string[],
): unknown {
  for (const key of keys) {
    if (source[key] !== undefined) return source[key];
  }
  for (const key of keys) {
    if (contentSource[key] !== undefined) return contentSource[key];
  }
  const metadataSources = [
    isBackyRecord(source.metadata) ? source.metadata : undefined,
    isBackyRecord(contentSource.metadata) ? contentSource.metadata : undefined,
    isBackyRecord(source.contentDocument) && isBackyRecord(source.contentDocument.metadata)
      ? source.contentDocument.metadata
      : undefined,
    isBackyRecord(contentSource.contentDocument) && isBackyRecord(contentSource.contentDocument.metadata)
      ? contentSource.contentDocument.metadata
      : undefined,
  ];
  for (const metadata of metadataSources) {
    if (!metadata) continue;
    for (const key of keys) {
      if (metadata[key] !== undefined) return metadata[key];
    }
  }
  return undefined;
}

function backyDesignString(
  source: Record<string, unknown>,
  contentSource: Record<string, unknown>,
  keys: readonly string[],
): string | undefined {
  const value = backyDesignValue(source, contentSource, keys);
  return typeof value === "string" ? value : undefined;
}

function backyTemplateIdSegment(value: unknown): string | undefined {
  const text = typeof value === "string" ? value.trim() : "";
  if (!text) return undefined;

  const segment = text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 96);

  return segment || undefined;
}

function fallbackBackyTemplateId(prefix: string, values: unknown[]): string {
  const segment = values.map(backyTemplateIdSegment).find(Boolean);
  return segment ? `${prefix}-${segment}` : `${prefix}-direct-design`;
}

function backyDesignTemplateId(
  design: unknown,
  prefix: string,
  fallbackCandidates: unknown[] = [],
): string | undefined {
  if (design === undefined || design === null) return undefined;

  const source = backyDesignSource(design);
  const contentSource = backyDesignContentSource(design);
  const contentDocument = backyDesignRecord(source, contentSource, ["contentDocument"]) || {};
  const metadata =
    backyDesignRecord(source, contentSource, ["metadata"]) ||
    backyDesignRecord(contentDocument, {}, ["metadata"]) ||
    {};
  return backyDesignString(source, contentSource, [
    "frontendDesignTemplateId",
    "templateId",
    "designTemplateId",
  ]) || fallbackBackyTemplateId(prefix, [
    source.id,
    source.name,
    source.label,
    contentSource.id,
    contentSource.name,
    contentSource.label,
    contentDocument.id,
    contentDocument.title,
    metadata.frontendDesignTemplateId,
    metadata.templateId,
    metadata.title,
    ...fallbackCandidates,
  ]);
}

function backyDesignRecord(
  source: Record<string, unknown>,
  contentSource: Record<string, unknown>,
  keys: readonly string[],
): Record<string, unknown> | undefined {
  const value = backyDesignValue(source, contentSource, keys);
  return isBackyRecord(value) ? cloneBackyRecord(value) : undefined;
}

function backyDesignArray(
  source: Record<string, unknown>,
  contentSource: Record<string, unknown>,
  keys: readonly string[],
): unknown[] | undefined {
  const value = backyDesignValue(source, contentSource, keys);
  return Array.isArray(value) ? cloneBackyValue(value) : undefined;
}

function backyEditableString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value : undefined;
}

function backyEditableStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const strings = value
    .filter((item): item is string => typeof item === "string" && item.trim().length > 0);
  return strings.length > 0 ? strings : undefined;
}

function backyEditableBoolean(value: unknown): boolean | undefined {
  if (typeof value === "boolean") return value;
  if (typeof value === "number" && Number.isFinite(value)) return value !== 0;
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (["true", "1", "yes", "on"].includes(normalized)) return true;
    if (["false", "0", "no", "off"].includes(normalized)) return false;
  }
  return undefined;
}

function inferBackyFrontendEditableValueType(
  path: string,
  value: unknown,
): NonNullable<BackyFrontendEditableMapEntry["valueType"]> {
  const normalizedPath = path.toLowerCase();
  const leaf = normalizedPath.split(".").pop() || normalizedPath;

  if (normalizedPath.startsWith("tokenrefs.") || normalizedPath.includes(".tokenrefs.")) return "string";
  if (typeof value === "boolean" || BACKY_BOOLEAN_EDITABLE_LEAVES.has(leaf)) return "boolean";
  if (typeof value === "number" || BACKY_NUMERIC_EDITABLE_LEAVES.has(leaf)) return "number";
  if (normalizedPath.includes("color") || (typeof value === "string" && /^#(?:[0-9a-f]{3}){1,2}$/i.test(value))) return "color";
  if (normalizedPath.includes("href") || normalizedPath.includes("url") || normalizedPath.includes("src")) return "url";
  if (normalizedPath.includes("video")) return "video";
  if (normalizedPath.includes("audio")) return "audio";
  if (
    normalizedPath.includes("file") ||
    normalizedPath.includes("download") ||
    normalizedPath.includes("document") ||
    normalizedPath.includes("fontmedia")
  ) {
    return "file";
  }
  if (
    normalizedPath.includes("image") ||
    normalizedPath.includes("poster") ||
    normalizedPath.includes("backgroundmedia") ||
    normalizedPath.includes("mediaid")
  ) {
    return "image";
  }
  if (
    normalizedPath === "actions" ||
    normalizedPath === "databindings" ||
    normalizedPath === "bindingslots" ||
    normalizedPath === "animation.from" ||
    normalizedPath === "animation.to" ||
    normalizedPath === "animation.scrolltrigger" ||
    Array.isArray(value) ||
    hasNonEmptyBackyRecord(value)
  ) {
    return "json";
  }
  if (normalizedPath.includes("content") && Array.isArray(value)) return "richText";
  if (BACKY_STRING_EDITABLE_LEAVES.has(leaf)) return "string";
  if (typeof value === "string") return "string";
  return "json";
}

function backyFrontendEditableTargetValue(
  element: Record<string, unknown>,
  path: string,
): unknown {
  if (path.startsWith("layout.")) {
    return element[path.replace(/^layout\./, "")];
  }

  if (path === "visibility.hidden") {
    return isBackyElementHidden(element);
  }

  if (path === "visibility.locked") {
    return isBackyElementLocked(element);
  }

  const segments = path.split(".").filter(Boolean);
  let current: unknown = element;
  for (const segment of segments) {
    if (!isBackyRecord(current)) return undefined;
    current = current[segment];
  }
  return current;
}

function backyFrontendEditableLabel(
  elementType: string | undefined,
  path: string,
): string {
  const readablePath = path
    .replace(/^layout\./, "")
    .replace(/^props\./, "")
    .replace(/^styles\./, "style ")
    .replace(/^tokenRefs\./, "token ")
    .replace(/^responsive\./, "responsive ")
    .replace(/^animation\./, "animation ")
    .replace(/\./g, " ")
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .trim();
  const label = readablePath.charAt(0).toUpperCase() + readablePath.slice(1);
  return elementType ? `${elementType} ${label}` : label;
}

function normalizeBackyFrontendEditableMapEntry(
  entry: Record<string, unknown>,
): BackyFrontendEditableMapEntry {
  const normalized = cloneBackyRecord(entry);

  const applyString = (key: string) => {
    const value = backyEditableString(entry[key]);
    if (value) {
      normalized[key] = value;
    } else {
      delete normalized[key];
    }
  };

  [
    "selector",
    "elementId",
    "role",
    "binding",
    "field",
    "targetPath",
    "token",
    "permission",
    "label",
    "valueType",
    "scope",
    "collectionId",
    "recordId",
    "sourceField",
  ].forEach(applyString);

  const fields = backyEditableStringArray(entry.fields);
  if (fields) {
    normalized.fields = fields;
  } else {
    delete normalized.fields;
  }

  const editable = backyEditableBoolean(entry.editable);
  if (editable !== undefined) {
    normalized.editable = editable;
  } else {
    delete normalized.editable;
  }

  return normalized as BackyFrontendEditableMapEntry;
}

function pushBackyFrontendEditableMapEntry(
  entries: BackyFrontendEditableMapEntry[],
  input: {
    elementId?: string;
    elementType?: string;
    targetPath: string;
    value?: unknown;
    binding?: string;
    fields?: string[];
    sourceField?: string;
  },
): void {
  if (!input.elementId || !input.targetPath) return;

  entries.push(normalizeBackyFrontendEditableMapEntry({
    elementId: input.elementId,
    role: input.elementType || "element",
    binding: input.binding,
    fields: input.fields,
    field: input.targetPath,
    targetPath: input.targetPath,
    sourceField: input.sourceField,
    editable: true,
    valueType: inferBackyFrontendEditableValueType(input.targetPath, input.value),
    scope: "element",
    label: backyFrontendEditableLabel(input.elementType, input.targetPath),
  }));
}

function backyFrontendEditableMapEntriesFromRecord(
  editableMap: unknown,
): BackyFrontendEditableMapEntry[] {
  if (!isBackyRecord(editableMap)) return [];

  return Object.entries(editableMap)
    .filter((entry): entry is [string, Record<string, unknown>] => isBackyRecord(entry[1]))
    .map(([key, entry]) => {
      const targetPath =
        backyEditableString(entry.targetPath) ||
        backyEditableString(entry.path) ||
        backyEditableString(entry.field) ||
        key;
      return normalizeBackyFrontendEditableMapEntry({
        ...entry,
        field: backyEditableString(entry.field) || key,
        targetPath,
        editable: backyEditableBoolean(entry.editable) ?? true,
        valueType:
          backyEditableString(entry.valueType) ||
          inferBackyFrontendEditableValueType(targetPath, entry.value),
      });
    });
}

function backyFrontendEditableMapRecordKey(
  entry: BackyFrontendEditableMapEntry,
): string | undefined {
  const elementId = backyEditableString(entry.elementId);
  const field = backyEditableString(entry.field);
  const targetPath = backyEditableString(entry.targetPath);
  const binding = backyEditableString(entry.binding);
  const sourceField = backyEditableString(entry.sourceField);
  const explicitFieldAlias = field && field !== targetPath && !field.includes(".");

  if (explicitFieldAlias) return field;
  if (sourceField && elementId) return `${elementId}.${sourceField}`;
  if (binding && elementId && binding !== "element.animation") return `${elementId}.${binding}`;
  if (field && field !== targetPath && !field.startsWith("props.") && !field.startsWith("styles.")) return field;
  if (elementId && targetPath) return `${elementId}.${targetPath}`;
  if (elementId && field) return `${elementId}.${field}`;
  return targetPath || field || binding || backyEditableString(entry.role);
}

function backyFrontendEditableMapRecordFromEntries(
  entries: BackyFrontendEditableMapEntry[],
): Record<string, unknown> | undefined {
  const record: Record<string, unknown> = {};

  for (const entry of entries) {
    const baseKey = backyFrontendEditableMapRecordKey(entry);
    if (!baseKey) continue;

    let key = baseKey;
    let suffix = 2;
    while (Object.prototype.hasOwnProperty.call(record, key)) {
      key = `${baseKey}.${suffix}`;
      suffix += 1;
    }
    record[key] = entry;
  }

  return Object.keys(record).length > 0 ? record : undefined;
}

function dedupeBackyFrontendEditableMap(
  entries: BackyFrontendEditableMapEntry[],
): BackyFrontendEditableMapEntry[] {
  const seen = new Set<string>();
  return entries.filter((entry) => {
    const key = [
      entry.selector || "",
      entry.elementId || "",
      entry.role || "",
      entry.binding || "",
      entry.field || "",
      entry.targetPath || "",
      entry.sourceField || "",
    ].join("|");
    if (seen.has(key)) return false;
    seen.add(key);
    return Boolean(entry.selector || entry.elementId || entry.binding || entry.role || entry.field || entry.targetPath);
  });
}

function inferBackyFrontendEditableMapFromElements(
  elements: unknown[],
  entries: BackyFrontendEditableMapEntry[] = [],
): BackyFrontendEditableMapEntry[] {
  for (const element of elements) {
    if (!isBackyRecord(element)) continue;

    const elementId = backyEditableString(element.id);
    const elementType = backyEditableString(element.type);
    const props = isBackyRecord(element.props) ? element.props : {};
    const binding = backyEditableString(props.binding);
    if (binding) {
      const bindingParts = binding.split(".").filter(Boolean);
      entries.push(normalizeBackyFrontendEditableMapEntry({
        elementId,
        role: elementType,
        binding,
        fields: bindingParts.length > 0 ? [bindingParts[bindingParts.length - 1]] : undefined,
        field: binding,
        targetPath: "props.content",
        editable: true,
        valueType: "string",
        scope: "element",
        label: backyFrontendEditableLabel(elementType, "props.content"),
      }));
    }

    [
      { path: "name", source: "field" as const },
      { path: "visibility.hidden", source: "visibility" as const },
      { path: "visibility.locked", source: "visibility" as const },
      ...defaultBackyEditableTargetPathsForElement(element),
    ].forEach((target) => {
      pushBackyFrontendEditableMapEntry(entries, {
        elementId,
        elementType,
        targetPath: target.path,
        value: backyFrontendEditableTargetValue(element, target.path),
      });
    });

    if (Array.isArray(element.dataBindings)) {
      for (const bindingEntry of element.dataBindings) {
        if (!isBackyRecord(bindingEntry)) continue;
        const sourceRecord = isBackyRecord(bindingEntry.source) ? bindingEntry.source : {};
        const source =
          backyEditableString(bindingEntry.source) ||
          backyEditableString(sourceRecord.field) ||
          backyEditableString(sourceRecord.kind);
        const targetPath = backyEditableString(bindingEntry.targetPath) || "props.content";
        const fields =
          backyEditableStringArray(bindingEntry.fields) ||
          [backyEditableString(sourceRecord.field), backyEditableString(bindingEntry.field)]
            .filter((field): field is string => Boolean(field));
        pushBackyFrontendEditableMapEntry(entries, {
          elementId,
          elementType,
          targetPath,
          value: backyFrontendEditableTargetValue(element, targetPath),
          binding: source,
          fields,
          sourceField: backyEditableString(sourceRecord.field) || backyEditableString(bindingEntry.field),
        });
      }
    }

    const metadata = isBackyRecord(element.metadata) ? element.metadata : {};
    const animation = isBackyRecord(element.animation)
      ? element.animation
      : isBackyRecord(metadata.animation)
        ? metadata.animation
        : undefined;
    if (animation && Object.keys(animation).length > 0) {
      Object.keys(animation).forEach((field) => {
        const targetPath = `animation.${field}`;
        pushBackyFrontendEditableMapEntry(entries, {
          elementId,
          elementType: `${elementType || "element"}.animation`,
          targetPath,
          value: backyFrontendEditableTargetValue(element, targetPath),
          binding: "element.animation",
          fields: [field],
          sourceField: field,
        });
      });
    }

    if (Array.isArray(element.children)) {
      inferBackyFrontendEditableMapFromElements(element.children, entries);
    }
  }

  return entries;
}

function buildBackyFrontendEditableMapRecord(
  elements: unknown[] | undefined,
  editableMap: unknown,
): Record<string, unknown> | undefined {
  const explicitEditableMap = backyFrontendEditableMapEntriesFromRecord(editableMap);
  const inferredEditableMap = Array.isArray(elements)
    ? inferBackyFrontendEditableMapFromElements(elements)
    : [];
  return backyFrontendEditableMapRecordFromEntries(
    dedupeBackyFrontendEditableMap([
      ...explicitEditableMap,
      ...inferredEditableMap,
    ]),
  );
}

function buildBackyFrontendDesignMeta(
  design: unknown,
  existingMeta: unknown,
  fallbackTemplateIdValue?: string,
): Record<string, unknown> | undefined {
  const source = backyDesignSource(design);
  const contentSource = backyDesignContentSource(design);
  const meta = isBackyRecord(existingMeta) ? cloneBackyRecord(existingMeta) : {};
  const templateId =
    backyDesignString(source, contentSource, [
      "frontendDesignTemplateId",
      "templateId",
      "designTemplateId",
    ]) || fallbackTemplateIdValue;
  const templateName = backyDesignString(source, contentSource, [
    "frontendDesignTemplateName",
    "templateName",
  ]);
  const routePattern = backyDesignString(source, contentSource, ["routePattern"]);
  const customCss = backyDesignString(source, contentSource, ["customCSS", "customCss"]);
  const customJs = backyDesignString(source, contentSource, ["customJS", "customJs"]);
  const contentDocument = backyDesignRecord(source, contentSource, ["contentDocument"]);
  const elements =
    backyDesignArray(source, contentSource, ["elements"]) ||
    (Array.isArray(contentDocument?.elements)
      ? cloneBackyValue(contentDocument.elements)
      : undefined);
  const canvasSize = backyDesignRecord(source, contentSource, ["canvasSize"]);
  const themeTokenRefs = backyDesignRecord(source, contentSource, ["themeTokenRefs"]);
  const assets =
    backyDesignArray(source, contentSource, ["assets"]) ||
    backyDesignRecord(source, contentSource, ["assets"]);
  const animations =
    backyDesignArray(source, contentSource, ["animations", "frontendDesignAnimations"]) ||
    backyDesignRecord(source, contentSource, ["animations", "frontendDesignAnimations"]);
  const interactions =
    backyDesignArray(source, contentSource, ["interactions"]) ||
    backyDesignRecord(source, contentSource, ["interactions"]);
  const dataBindings = backyDesignRecord(source, contentSource, ["dataBindings"]);
  const editableMap = buildBackyFrontendEditableMapRecord(
    elements,
    backyDesignRecord(source, contentSource, ["frontendDesignEditableMap", "editableMap"]),
  );
  const seo = backyDesignRecord(source, contentSource, ["seo"]);
  const metadata = backyDesignRecord(source, contentSource, ["metadata"]);
  const bindingHints = backyDesignArray(source, contentSource, ["bindingHints"]);

  if (templateId && meta.frontendDesignTemplateId === undefined) {
    meta.frontendDesignTemplateId = templateId;
  }
  if (templateName && meta.frontendDesignTemplateName === undefined) {
    meta.frontendDesignTemplateName = templateName;
  }
  if (routePattern && meta.frontendDesignRoutePattern === undefined) {
    meta.frontendDesignRoutePattern = routePattern;
  }
  if (customCss !== undefined && meta.frontendDesignCustomCss === undefined) {
    meta.frontendDesignCustomCss = customCss;
  }
  if (customJs !== undefined && meta.frontendDesignCustomJs === undefined) {
    meta.frontendDesignCustomJs = customJs;
  }
  if (contentDocument && meta.frontendDesignContentDocument === undefined) {
    meta.frontendDesignContentDocument = contentDocument;
  }
  if (elements && meta.frontendDesignElements === undefined) {
    meta.frontendDesignElements = elements;
  }
  if (canvasSize && meta.frontendDesignCanvasSize === undefined) {
    meta.frontendDesignCanvasSize = canvasSize;
  }
  if (themeTokenRefs && meta.frontendDesignThemeTokenRefs === undefined) {
    meta.frontendDesignThemeTokenRefs = themeTokenRefs;
  }
  if (assets && meta.frontendDesignAssets === undefined) {
    meta.frontendDesignAssets = assets;
  }
  if (animations && meta.frontendDesignAnimations === undefined) {
    meta.frontendDesignAnimations = animations;
  }
  if (interactions && meta.frontendDesignInteractions === undefined) {
    meta.frontendDesignInteractions = interactions;
  }
  if (dataBindings && meta.frontendDesignDataBindings === undefined) {
    meta.frontendDesignDataBindings = dataBindings;
  }
  if (editableMap && meta.frontendDesignEditableMap === undefined) {
    meta.frontendDesignEditableMap = editableMap;
  }
  if (seo && meta.frontendDesignSeo === undefined) {
    meta.frontendDesignSeo = seo;
  }
  if (metadata && meta.frontendDesignMetadata === undefined) {
    meta.frontendDesignMetadata = metadata;
  }
  if (bindingHints && meta.frontendDesignBindingHints === undefined) {
    meta.frontendDesignBindingHints = bindingHints;
  }

  return Object.keys(meta).length > 0 ? meta : undefined;
}

export function buildBackyContentDesignPayload(
  design: BackyContentDesignStateInput | BackyEditableContent | Record<string, unknown> | unknown[] | null | undefined,
): BackyContentDesignPayload {
  const source = backyDesignSource(design);
  const contentSource = backyDesignContentSource(design);
  const payload: BackyContentDesignPayload = {};
  const contentDocument = backyDesignRecord(source, contentSource, ["contentDocument"]);
  const elements =
    backyDesignArray(source, contentSource, ["elements"]) ||
    (Array.isArray(contentDocument?.elements)
      ? cloneBackyValue(contentDocument.elements)
      : undefined);
  const canvasSize =
    backyDesignRecord(source, contentSource, ["canvasSize"]) ||
    backyDesignRecord(contentDocument || {}, {}, ["canvasSize"]);
  const customCss = backyDesignString(source, contentSource, ["customCSS", "customCss"]);
  const customJs = backyDesignString(source, contentSource, ["customJS", "customJs"]);
  const metadata =
    backyDesignRecord(source, contentSource, ["metadata"]) ||
    backyDesignRecord(contentDocument || {}, {}, ["metadata"]);

  if (elements) payload.elements = elements;
  if (canvasSize) payload.canvasSize = canvasSize;
  if (customCss !== undefined) payload.customCSS = customCss;
  if (customJs !== undefined) payload.customJS = customJs;
  if (contentDocument) payload.contentDocument = contentDocument;

  const themeTokenRefs = backyDesignRecord(source, contentSource, ["themeTokenRefs"]);
  const assets =
    backyDesignArray(source, contentSource, ["assets"]) ||
    backyDesignRecord(source, contentSource, ["assets"]);
  const animations =
    backyDesignArray(source, contentSource, ["animations", "frontendDesignAnimations"]) ||
    backyDesignRecord(source, contentSource, ["animations", "frontendDesignAnimations"]);
  const interactions =
    backyDesignArray(source, contentSource, ["interactions"]) ||
    backyDesignRecord(source, contentSource, ["interactions"]);
  const dataBindings = backyDesignRecord(source, contentSource, ["dataBindings"]);
  const editableMap = buildBackyFrontendEditableMapRecord(
    elements,
    backyDesignRecord(source, contentSource, ["frontendDesignEditableMap", "editableMap"]),
  );
  const seo = backyDesignRecord(source, contentSource, ["seo"]);

  if (themeTokenRefs) payload.themeTokenRefs = themeTokenRefs;
  if (assets) payload.assets = assets;
  if (animations) payload.animations = animations;
  if (interactions) payload.interactions = interactions;
  if (dataBindings) payload.dataBindings = dataBindings;
  if (editableMap) payload.editableMap = editableMap;
  if (seo) payload.seo = seo;
  if (metadata) payload.metadata = metadata;

  return refreshBackyEditorCompositionMetadata(
    payload as BackyEditableContent,
  ) as BackyContentDesignPayload;
}

export function buildBackyAdminPageCreateInput(
  input: BackyAdminPageCreateFromDesignInput,
): BackyAdminPageCreateInput {
  const { title, design, content, meta, frontendDesignTemplateId, ...rest } = input;
  const contentSource = content ?? design;
  const templateSource = contentSource ?? design;
  const body: BackyAdminPageCreateInput = {
    ...rest,
    title: typeof title === "string" ? title : String(title ?? ""),
  };
  const templateId =
    (typeof frontendDesignTemplateId === "string" ? frontendDesignTemplateId : undefined) ||
    backyDesignTemplateId(templateSource, "content", [title, rest.slug, rest.path]);
  const nextMeta = buildBackyFrontendDesignMeta(contentSource ?? design, meta, templateId);

  if (contentSource !== undefined && contentSource !== null) {
    body.content = buildBackyContentDesignPayload(contentSource);
  }
  if (meta !== undefined || nextMeta) {
    body.meta = nextMeta || (isBackyRecord(meta) ? cloneBackyRecord(meta) : {});
  }
  if (templateId) {
    body.frontendDesignTemplateId = templateId;
    body.meta = {
      ...(isBackyRecord(body.meta) ? body.meta : {}),
      frontendDesignTemplateId:
        isBackyRecord(body.meta) && typeof body.meta.frontendDesignTemplateId === "string"
          ? body.meta.frontendDesignTemplateId
          : templateId,
    };
  }

  return body;
}

export function buildBackyAdminPageUpdateInput(
  input: BackyAdminPageUpdateFromDesignInput,
): BackyAdminPageUpdateInput {
  const { design, content, meta, frontendDesignTemplateId, ...rest } = input;
  const contentSource = content ?? design;
  const templateSource = contentSource ?? design;
  const body: BackyAdminPageUpdateInput = {
    ...rest,
  };
  const templateId =
    (typeof frontendDesignTemplateId === "string" ? frontendDesignTemplateId : undefined) ||
    backyDesignTemplateId(templateSource, "content", [rest.slug, rest.path, rest.title]);
  const nextMeta = buildBackyFrontendDesignMeta(contentSource ?? design, meta, templateId);

  if (contentSource !== undefined && contentSource !== null) {
    body.content = buildBackyContentDesignPayload(contentSource);
  }
  if (meta !== undefined || nextMeta) {
    body.meta = nextMeta || (isBackyRecord(meta) ? cloneBackyRecord(meta) : {});
  }
  if (templateId) {
    body.frontendDesignTemplateId = templateId;
    body.meta = {
      ...(isBackyRecord(body.meta) ? body.meta : {}),
      frontendDesignTemplateId:
        isBackyRecord(body.meta) && typeof body.meta.frontendDesignTemplateId === "string"
          ? body.meta.frontendDesignTemplateId
          : templateId,
    };
  }

  return body;
}

export function buildBackyAdminBlogPostCreateInput(
  input: BackyAdminBlogPostCreateFromDesignInput,
): BackyAdminBlogPostCreateInput {
  const { title, design, content, meta, frontendDesignTemplateId, ...rest } = input;
  const contentSource = content ?? design;
  const templateSource = contentSource ?? design;
  const body: BackyAdminBlogPostCreateInput = {
    ...rest,
    title: typeof title === "string" ? title : String(title ?? ""),
  };
  const templateId =
    (typeof frontendDesignTemplateId === "string" ? frontendDesignTemplateId : undefined) ||
    backyDesignTemplateId(templateSource, "content", [title, rest.slug, rest.path]);
  const nextMeta = buildBackyFrontendDesignMeta(contentSource ?? design, meta, templateId);

  if (contentSource !== undefined && contentSource !== null) {
    body.content = buildBackyContentDesignPayload(contentSource);
  }
  if (meta !== undefined || nextMeta) {
    body.meta = nextMeta || (isBackyRecord(meta) ? cloneBackyRecord(meta) : {});
  }
  if (templateId) {
    body.frontendDesignTemplateId = templateId;
    body.meta = {
      ...(isBackyRecord(body.meta) ? body.meta : {}),
      frontendDesignTemplateId:
        isBackyRecord(body.meta) && typeof body.meta.frontendDesignTemplateId === "string"
          ? body.meta.frontendDesignTemplateId
          : templateId,
    };
  }

  return body;
}

export function buildBackyAdminBlogPostUpdateInput(
  input: BackyAdminBlogPostUpdateFromDesignInput,
): BackyAdminBlogPostUpdateInput {
  const { design, content, meta, frontendDesignTemplateId, ...rest } = input;
  const contentSource = content ?? design;
  const templateSource = contentSource ?? design;
  const body: BackyAdminBlogPostUpdateInput = {
    ...rest,
  };
  const templateId =
    (typeof frontendDesignTemplateId === "string" ? frontendDesignTemplateId : undefined) ||
    backyDesignTemplateId(templateSource, "content", [rest.slug, rest.path, rest.title]);
  const nextMeta = buildBackyFrontendDesignMeta(contentSource ?? design, meta, templateId);

  if (contentSource !== undefined && contentSource !== null) {
    body.content = buildBackyContentDesignPayload(contentSource);
  }
  if (meta !== undefined || nextMeta) {
    body.meta = nextMeta || (isBackyRecord(meta) ? cloneBackyRecord(meta) : {});
  }
  if (templateId) {
    body.frontendDesignTemplateId = templateId;
    body.meta = {
      ...(isBackyRecord(body.meta) ? body.meta : {}),
      frontendDesignTemplateId:
        isBackyRecord(body.meta) && typeof body.meta.frontendDesignTemplateId === "string"
          ? body.meta.frontendDesignTemplateId
          : templateId,
    };
  }

  return body;
}

function buildBackyReusableSectionDesignContent(
  design: BackyContentDesignStateInput | BackyEditableContent | Record<string, unknown> | unknown[] | null | undefined,
): BackyReusableSection["content"] {
  const designContent = buildBackyContentDesignPayload(design);
  return {
    ...designContent,
    elements: Array.isArray(designContent.elements)
      ? (designContent.elements as BackyElement[])
      : [],
  } as BackyReusableSection["content"];
}

export function buildBackyAdminReusableSectionCreateInput(
  input: BackyAdminReusableSectionCreateFromDesignInput,
): BackyAdminReusableSectionCreateInput {
  const { name, design, content, metadata, frontendDesignTemplateId, ...rest } = input;
  const contentSource = content ?? design;
  const templateSource = contentSource ?? design;
  const body: BackyAdminReusableSectionCreateInput = {
    ...rest,
    name: typeof name === "string" ? name : String(name ?? ""),
    content: buildBackyReusableSectionDesignContent(contentSource),
  };
  const templateId =
    (typeof frontendDesignTemplateId === "string" ? frontendDesignTemplateId : undefined) ||
    backyDesignTemplateId(templateSource, "section", [name, rest.slug]);
  const nextMetadata = buildBackyFrontendDesignMeta(contentSource ?? design, metadata, templateId);

  if (metadata !== undefined || nextMetadata) {
    body.metadata = nextMetadata || (isBackyRecord(metadata) ? cloneBackyRecord(metadata) : {});
  }
  if (templateId) {
    body.frontendDesignTemplateId = templateId;
    body.metadata = {
      ...(isBackyRecord(body.metadata) ? body.metadata : {}),
      frontendDesignTemplateId:
        isBackyRecord(body.metadata) && typeof body.metadata.frontendDesignTemplateId === "string"
          ? body.metadata.frontendDesignTemplateId
          : templateId,
    };
  }

  return body;
}

export function buildBackyAdminReusableSectionUpdateInput(
  input: BackyAdminReusableSectionUpdateFromDesignInput,
): BackyAdminReusableSectionUpdateInput {
  const { design, content, metadata, frontendDesignTemplateId, ...rest } = input;
  const contentSource = content ?? design;
  const templateSource = contentSource ?? design;
  const body: BackyAdminReusableSectionUpdateInput = {
    ...rest,
  };
  const templateId =
    (typeof frontendDesignTemplateId === "string" ? frontendDesignTemplateId : undefined) ||
    backyDesignTemplateId(templateSource, "section", [rest.slug, rest.name]);
  const nextMetadata = buildBackyFrontendDesignMeta(contentSource ?? design, metadata, templateId);

  if (contentSource !== undefined && contentSource !== null) {
    body.content = buildBackyReusableSectionDesignContent(contentSource);
  }
  if (metadata !== undefined || nextMetadata) {
    body.metadata = nextMetadata || (isBackyRecord(metadata) ? cloneBackyRecord(metadata) : {});
  }
  if (templateId) {
    body.frontendDesignTemplateId = templateId;
    body.metadata = {
      ...(isBackyRecord(body.metadata) ? body.metadata : {}),
      frontendDesignTemplateId:
        isBackyRecord(body.metadata) && typeof body.metadata.frontendDesignTemplateId === "string"
          ? body.metadata.frontendDesignTemplateId
          : templateId,
    };
  }

  return body;
}

function applyBackyCollectionRecordDesignField(
  values: Record<string, unknown>,
  design: Record<string, unknown>,
  key: string,
  frontendKey: string,
  value: unknown,
) {
  if (value === undefined) return;
  design[key] = cloneBackyValue(value);
  design[frontendKey] = cloneBackyValue(value);
  values[frontendKey] = cloneBackyValue(value);
}

function backyDesignArrayOrRecord(
  source: Record<string, unknown>,
  contentSource: Record<string, unknown>,
  keys: readonly string[],
): unknown[] | Record<string, unknown> | undefined {
  return backyDesignArray(source, contentSource, keys) ||
    backyDesignRecord(source, contentSource, keys);
}

function buildBackyCollectionRecordDesignValues(
  values: unknown,
  designInput: BackyCollectionRecordDesignInput | null | undefined,
): Record<string, unknown> {
  const nextValues = isBackyRecord(values) ? cloneBackyRecord(values) : {};
  if (designInput === undefined || designInput === null) {
    return nextValues;
  }

  const source = backyDesignSource(designInput);
  const content = buildBackyContentDesignPayload(designInput);
  const design: Record<string, unknown> = {
    ...(isBackyRecord(nextValues.design) ? cloneBackyRecord(nextValues.design) : {}),
    ...cloneBackyRecord(source),
  };

  applyBackyCollectionRecordDesignField(
    nextValues,
    design,
    "templateId",
    "frontendDesignTemplateId",
    backyDesignString(source, content, ["frontendDesignTemplateId", "templateId"]),
  );
  applyBackyCollectionRecordDesignField(
    nextValues,
    design,
    "templateName",
    "frontendDesignTemplateName",
    backyDesignString(source, content, ["frontendDesignTemplateName", "templateName"]),
  );
  applyBackyCollectionRecordDesignField(
    nextValues,
    design,
    "routePattern",
    "frontendDesignRoutePattern",
    backyDesignString(source, content, ["frontendDesignRoutePattern", "routePattern"]),
  );
  applyBackyCollectionRecordDesignField(
    nextValues,
    design,
    "source",
    "frontendDesignSource",
    backyDesignRecord(source, content, ["frontendDesignSource", "source"]),
  );
  applyBackyCollectionRecordDesignField(
    nextValues,
    design,
    "tokens",
    "frontendDesignTokens",
    backyDesignRecord(source, content, ["frontendDesignTokens", "tokens"]),
  );
  applyBackyCollectionRecordDesignField(
    nextValues,
    design,
    "chrome",
    "frontendDesignChrome",
    backyDesignRecord(source, content, ["frontendDesignChrome", "chrome"]),
  );
  applyBackyCollectionRecordDesignField(
    nextValues,
    design,
    "customCss",
    "frontendDesignCustomCss",
    backyDesignString(source, content, ["frontendDesignCustomCss", "customCSS", "customCss"]),
  );
  applyBackyCollectionRecordDesignField(
    nextValues,
    design,
    "customJs",
    "frontendDesignCustomJs",
    backyDesignString(source, content, ["frontendDesignCustomJs", "customJS", "customJs"]),
  );
  applyBackyCollectionRecordDesignField(
    nextValues,
    design,
    "contentDocument",
    "frontendDesignContentDocument",
    backyDesignRecord(source, content, ["frontendDesignContentDocument", "contentDocument"]),
  );
  applyBackyCollectionRecordDesignField(
    nextValues,
    design,
    "elements",
    "frontendDesignElements",
    backyDesignArray(source, content, ["frontendDesignElements", "elements"]),
  );
  applyBackyCollectionRecordDesignField(
    nextValues,
    design,
    "canvasSize",
    "frontendDesignCanvasSize",
    backyDesignRecord(source, content, ["frontendDesignCanvasSize", "canvasSize"]),
  );
  applyBackyCollectionRecordDesignField(
    nextValues,
    design,
    "themeTokenRefs",
    "frontendDesignThemeTokenRefs",
    backyDesignRecord(source, content, ["frontendDesignThemeTokenRefs", "themeTokenRefs"]),
  );
  applyBackyCollectionRecordDesignField(
    nextValues,
    design,
    "assets",
    "frontendDesignAssets",
    backyDesignArrayOrRecord(source, content, ["frontendDesignAssets", "assets"]),
  );
  applyBackyCollectionRecordDesignField(
    nextValues,
    design,
    "animations",
    "frontendDesignAnimations",
    backyDesignArrayOrRecord(source, content, ["frontendDesignAnimations", "animations"]),
  );
  applyBackyCollectionRecordDesignField(
    nextValues,
    design,
    "interactions",
    "frontendDesignInteractions",
    backyDesignArrayOrRecord(source, content, ["frontendDesignInteractions", "interactions"]),
  );
  applyBackyCollectionRecordDesignField(
    nextValues,
    design,
    "dataBindings",
    "frontendDesignDataBindings",
    backyDesignRecord(source, content, ["frontendDesignDataBindings", "dataBindings"]),
  );
  applyBackyCollectionRecordDesignField(
    nextValues,
    design,
    "editableMap",
    "frontendDesignEditableMap",
    backyDesignRecord(content, source, ["frontendDesignEditableMap", "editableMap"]),
  );
  applyBackyCollectionRecordDesignField(
    nextValues,
    design,
    "seo",
    "frontendDesignSeo",
    backyDesignRecord(source, content, ["frontendDesignSeo", "seo"]),
  );
  applyBackyCollectionRecordDesignField(
    nextValues,
    design,
    "metadata",
    "frontendDesignMetadata",
    backyDesignRecord(source, content, ["frontendDesignMetadata", "metadata"]),
  );
  applyBackyCollectionRecordDesignField(
    nextValues,
    design,
    "bindingHints",
    "frontendDesignBindingHints",
    backyDesignArray(source, content, ["frontendDesignBindingHints", "bindingHints"]),
  );

  if (Object.keys(design).length > 0) {
    nextValues.design = design;
  }

  return nextValues;
}

function backyCollectionRecordDesignTemplateId(
  designInput: BackyCollectionRecordDesignInput | null | undefined,
  values?: unknown,
): string | undefined {
  if (designInput === undefined || designInput === null) return undefined;
  const valueRecord = isBackyRecord(values) ? values : {};
  return backyDesignTemplateId(designInput, "record", [
    valueRecord.slug,
    valueRecord.title,
    valueRecord.name,
    valueRecord.sku,
    valueRecord.id,
  ]);
}

function applyBackyCollectionRecordTemplateId(
  values: Record<string, unknown>,
  templateId: string | undefined,
) {
  if (!templateId || !isBackyRecord(values.design)) return;
  if (values.frontendDesignTemplateId === undefined) {
    values.frontendDesignTemplateId = templateId;
  }
  values.design = {
    ...values.design,
    templateId:
      typeof values.design.templateId === "string"
        ? values.design.templateId
        : templateId,
    frontendDesignTemplateId:
      typeof values.design.frontendDesignTemplateId === "string"
        ? values.design.frontendDesignTemplateId
        : templateId,
  };
}

export function buildBackyAdminCollectionRecordCreateInput<
  TValues extends Record<string, unknown> = Record<string, unknown>,
>(
  input: BackyAdminCollectionRecordCreateFromDesignInput<TValues>,
): BackyAdminCollectionRecordCreateInput<TValues> {
  const { values, design, content, frontendDesignTemplateId, ...rest } = input;
  const designSource = content ?? design;
  const bodyValues = buildBackyCollectionRecordDesignValues(values, designSource);
  const templateId =
    (typeof frontendDesignTemplateId === "string" ? frontendDesignTemplateId : undefined) ||
    backyCollectionRecordDesignTemplateId(designSource, values);
  applyBackyCollectionRecordTemplateId(bodyValues, templateId);

  return {
    ...rest,
    values: bodyValues as TValues,
    ...(templateId ? { frontendDesignTemplateId: templateId } : {}),
  };
}

export function buildBackyAdminCollectionRecordUpdateInput<
  TValues extends Record<string, unknown> = Record<string, unknown>,
>(
  input: BackyAdminCollectionRecordUpdateFromDesignInput<TValues>,
): BackyAdminCollectionRecordUpdateInput<TValues> {
  const { values, design, content, frontendDesignTemplateId, ...rest } = input;
  const designSource = content ?? design;
  const body: BackyAdminCollectionRecordUpdateInput<TValues> = {
    ...rest,
  };
  const templateId =
    (typeof frontendDesignTemplateId === "string" ? frontendDesignTemplateId : undefined) ||
    backyCollectionRecordDesignTemplateId(designSource, values);

  if (values !== undefined || (designSource !== undefined && designSource !== null)) {
    const bodyValues = buildBackyCollectionRecordDesignValues(values, designSource);
    applyBackyCollectionRecordTemplateId(bodyValues, templateId);
    body.values = bodyValues as Partial<TValues>;
  }
  if (templateId) {
    body.frontendDesignTemplateId = templateId;
  }

  return body;
}

export function buildBackyAdminCommerceProductCreateInput<
  TValues extends Record<string, unknown> = BackyAdminCommerceProductValues,
>(
  input: BackyAdminCommerceProductCreateFromDesignInput<TValues>,
): BackyAdminCommerceProductCreateInput<TValues> {
  return buildBackyAdminCollectionRecordCreateInput<TValues>(input);
}

export function buildBackyAdminCommerceProductUpdateInput<
  TValues extends Record<string, unknown> = BackyAdminCommerceProductValues,
>(
  input: BackyAdminCommerceProductUpdateFromDesignInput<TValues>,
): BackyAdminCommerceProductUpdateInput<TValues> {
  return buildBackyAdminCollectionRecordUpdateInput<TValues>(input);
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

function buildBackyEditorCompositionSummaryFromElements(
  elements: unknown[],
): Record<string, unknown> {
  const typeCounts: Record<string, number> = {};
  const groupIds: string[] = [];
  const nestedElementIds: string[] = [];
  const containerIds: string[] = [];
  const animatedElementIds: string[] = [];
  const actionElementIds: string[] = [];
  const dataBoundElementIds: string[] = [];
  const tokenRefElementIds: string[] = [];
  const assetBoundElementIds: string[] = [];
  const interactiveElementIds: string[] = [];
  const metrics = {
    totalLayers: 0,
    rootLayers: elements.length,
    groupLayers: 0,
    nestedLayers: 0,
    childContainerLayers: 0,
    responsiveOverrideLayers: 0,
    animatedLayers: 0,
    actionLayers: 0,
    dataBoundLayers: 0,
    tokenRefLayers: 0,
    assetBoundLayers: 0,
    interactiveLayers: 0,
    hiddenLayers: 0,
    lockedLayers: 0,
    maxDepth: 0,
  };

  const walk = (items: unknown[], depth: number) => {
    metrics.maxDepth = Math.max(metrics.maxDepth, depth);
    items.filter(isBackyRecord).forEach((item) => {
      const id = backyElementId(item);
      const type = typeof item.type === "string" && item.type ? item.type : "unknown";
      const props = isBackyRecord(item.props) ? item.props : {};
      const children = Array.isArray(item.children) ? item.children : [];

      metrics.totalLayers += 1;
      typeCounts[type] = (typeCounts[type] || 0) + 1;

      if (depth > 0 && id) {
        metrics.nestedLayers += 1;
        nestedElementIds.push(id);
      } else if (depth > 0) {
        metrics.nestedLayers += 1;
      }
      if (props.editorGroup === true) {
        metrics.groupLayers += 1;
        if (id) groupIds.push(id);
      }
      if (children.length > 0) {
        metrics.childContainerLayers += 1;
        if (id) containerIds.push(id);
      }
      if (isBackyRecord(item.responsive) && Object.keys(item.responsive).length > 0) {
        metrics.responsiveOverrideLayers += 1;
      }
      if (hasNonEmptyBackyRecord(item.animation)) {
        metrics.animatedLayers += 1;
        if (id) animatedElementIds.push(id);
      }
      if (hasBackyElementActionWiring(item, props)) {
        metrics.actionLayers += 1;
        if (id) actionElementIds.push(id);
      }
      if (hasNonEmptyBackyArray(item.dataBindings) || hasNonEmptyBackyArray(item.bindingSlots)) {
        metrics.dataBoundLayers += 1;
        if (id) dataBoundElementIds.push(id);
      }
      const animation = isBackyRecord(item.animation) ? item.animation : {};
      if (hasNonEmptyBackyRecord(item.tokenRefs) || hasNonEmptyBackyRecord(animation.tokenRefs)) {
        metrics.tokenRefLayers += 1;
        if (id) tokenRefElementIds.push(id);
      }
      if (hasNonEmptyBackyArray(item.assetIds)) {
        metrics.assetBoundLayers += 1;
        if (id) assetBoundElementIds.push(id);
      }
      if (isInteractiveBackyElementRecord(item)) {
        metrics.interactiveLayers += 1;
        if (id) interactiveElementIds.push(id);
      }
      if (isBackyElementHidden(item)) {
        metrics.hiddenLayers += 1;
      }
      if (isBackyElementLocked(item)) {
        metrics.lockedLayers += 1;
      }

      if (children.length > 0) {
        walk(children, depth + 1);
      }
    });
  };

  walk(elements, 0);
  const topTypes = Object.entries(typeCounts)
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
    .slice(0, 8)
    .map(([type, count]) => ({ type, count }));

  return {
    schemaVersion: "backy.editor-composition-summary.v1",
    ready: metrics.totalLayers > 0,
    hasGroups: metrics.groupLayers > 0,
    hasNestedLayers: metrics.nestedLayers > 0,
    hasAnimations: metrics.animatedLayers > 0,
    hasActions: metrics.actionLayers > 0,
    hasDataBindings: metrics.dataBoundLayers > 0,
    hasTokenRefs: metrics.tokenRefLayers > 0,
    hasAssetRefs: metrics.assetBoundLayers > 0,
    hasInteractiveComponents: metrics.interactiveLayers > 0,
    metrics: {
      ...metrics,
      topTypes,
    },
    groupIds,
    nestedElementIds,
    containerIds,
    animatedElementIds,
    actionElementIds,
    dataBoundElementIds,
    tokenRefElementIds,
    assetBoundElementIds,
    interactiveElementIds,
    shortcuts: {
      group: "Cmd/Ctrl+G",
      ungroup: "Shift+Cmd/Ctrl+G",
      selectSiblings: "Cmd/Ctrl+A",
      selectChildren: "Shift+Cmd/Ctrl+A",
      selectChild: "Enter",
      selectParent: "Shift+Enter",
    },
    invariants: {
      sameParentRequired: true,
      lockedLayersBlocked: true,
      editorGroupMarker: "props.editorGroup",
      childrenPersistedInline: true,
      parentIdsStoredAsElementMetadata: true,
      responsiveBreakpoints: ["tablet", "mobile"],
    },
  };
}

function refreshBackyEditorCompositionMetadata<TContent extends BackyEditableContent>(
  content: TContent,
): TContent {
  const refreshTarget = (target: Record<string, unknown>) => {
    if (!Array.isArray(target.elements)) {
      return;
    }

    target.metadata = {
      ...(isBackyRecord(target.metadata) ? target.metadata : {}),
      editorComposition: buildBackyEditorCompositionSummaryFromElements(target.elements),
    };
  };

  if (isBackyRecord(content)) {
    refreshTarget(content);
    if (isBackyRecord(content.contentDocument)) {
      refreshTarget(content.contentDocument);
    }
  }

  return content;
}

function backyElementId(element: unknown): string | null {
  return isBackyRecord(element) && typeof element.id === "string"
    ? element.id
    : null;
}

function backyNumberField(
  element: Record<string, unknown>,
  field: string,
  fallback: number,
): number {
  const value = element[field];
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function normalizeBackyInsertIndex(index: number | undefined, length: number): number {
  if (typeof index !== "number" || !Number.isFinite(index)) {
    return length;
  }

  return Math.max(0, Math.min(Math.trunc(index), length));
}

function collectBackyElementIds(element: Record<string, unknown>): string[] {
  const ids: string[] = [];
  const visit = (item: Record<string, unknown>) => {
    const id = backyElementId(item);
    if (id) ids.push(id);
    if (Array.isArray(item.children)) {
      item.children.filter(isBackyRecord).forEach(visit);
    }
  };
  visit(element);
  return ids;
}

function nextBackyContentElementId(baseId: string, suffix: string): string {
  return `${baseId || "backy-element"}-${suffix}`;
}

function backyBooleanField(
  element: Record<string, unknown>,
  field: string,
  fallback: boolean,
): boolean {
  return parseBackyBoolean(element[field], fallback);
}

function parseBackyBoolean(value: unknown, fallback: boolean): boolean {
  if (typeof value === "boolean") {
    return value;
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    return value !== 0;
  }

  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (normalized === "true" || normalized === "1" || normalized === "on" || normalized === "yes") {
      return true;
    }
    if (normalized === "false" || normalized === "0" || normalized === "off" || normalized === "no") {
      return false;
    }
  }

  return fallback;
}

function isBackyElementHidden(element: Record<string, unknown>): boolean {
  return backyBooleanField(element, "visible", true) === false;
}

function isBackyElementLocked(element: Record<string, unknown>): boolean {
  return backyBooleanField(element, "locked", false);
}

function backyResponsiveOverride(
  element: Record<string, unknown>,
  breakpoint: typeof BACKY_RESPONSIVE_BREAKPOINTS[number],
): Record<string, unknown> | undefined {
  return isBackyRecord(element.responsive) &&
    isBackyRecord(element.responsive[breakpoint])
    ? (element.responsive[breakpoint] as Record<string, unknown>)
    : undefined;
}

function backyResponsiveGeometry(
  element: Record<string, unknown>,
  breakpoint: typeof BACKY_RESPONSIVE_BREAKPOINTS[number],
) {
  const override = backyResponsiveOverride(element, breakpoint);
  return {
    x: backyNumberField(override || {}, "x", backyNumberField(element, "x", 0)),
    y: backyNumberField(override || {}, "y", backyNumberField(element, "y", 0)),
    width: Math.max(1, backyNumberField(override || {}, "width", backyNumberField(element, "width", 1))),
    height: Math.max(1, backyNumberField(override || {}, "height", backyNumberField(element, "height", 1))),
    zIndex: backyNumberField(override || {}, "zIndex", backyNumberField(element, "zIndex", 1)),
  };
}

function hasBackyResponsiveLayoutOverride(
  override: Record<string, unknown> | undefined,
  baseElement?: Record<string, unknown>,
): boolean {
  if (!override) return false;
  return BACKY_RESPONSIVE_GEOMETRY_FIELDS.some((field) => (
    override[field] !== undefined &&
    (!baseElement || override[field] !== baseElement[field])
  ));
}

function pruneBackyResponsive(
  responsive: Record<string, unknown> | undefined,
): Record<string, unknown> | undefined {
  if (!responsive) return undefined;
  const pruned = Object.entries(responsive).reduce<Record<string, unknown>>((acc, [breakpoint, override]) => {
    if (isBackyRecord(override) && Object.keys(override).length > 0) {
      acc[breakpoint] = override;
    }
    return acc;
  }, {});
  return Object.keys(pruned).length > 0 ? pruned : undefined;
}

function setBackyResponsiveOverride(
  responsive: Record<string, unknown> | undefined,
  breakpoint: typeof BACKY_RESPONSIVE_BREAKPOINTS[number],
  override: Record<string, unknown>,
): Record<string, unknown> | undefined {
  return pruneBackyResponsive({
    ...(responsive || {}),
    [breakpoint]: override,
  });
}

function buildBackyGroupResponsiveChildren(
  selectedSiblings: Record<string, unknown>[],
  groupId: string,
  groupBase: { x: number; y: number; width: number; height: number; zIndex: number },
): { children: Record<string, unknown>[]; responsive?: Record<string, unknown> } {
  const breakpointBounds = BACKY_RESPONSIVE_BREAKPOINTS.reduce<Record<string, {
    x: number;
    y: number;
    width: number;
    height: number;
    zIndex: number;
    hasGroupGeometryOverride: boolean;
    hasAnyChildGeometryOverride: boolean;
  }>>((acc, breakpoint) => {
    const hasAnyChildGeometryOverride = selectedSiblings.some((item) => (
      hasBackyResponsiveLayoutOverride(backyResponsiveOverride(item, breakpoint), item)
    ));
    if (!hasAnyChildGeometryOverride) return acc;

    const geometries = selectedSiblings.map((item) => backyResponsiveGeometry(item, breakpoint));
    const minX = Math.min(...geometries.map((item) => item.x));
    const minY = Math.min(...geometries.map((item) => item.y));
    const maxX = Math.max(...geometries.map((item) => item.x + item.width));
    const maxY = Math.max(...geometries.map((item) => item.y + item.height));
    const width = Math.max(1, maxX - minX);
    const height = Math.max(1, maxY - minY);
    const zIndex = Math.max(...geometries.map((item) => item.zIndex));

    acc[breakpoint] = {
      x: minX,
      y: minY,
      width,
      height,
      zIndex,
      hasGroupGeometryOverride:
        minX !== groupBase.x ||
        minY !== groupBase.y ||
        width !== groupBase.width ||
        height !== groupBase.height ||
        zIndex !== groupBase.zIndex,
      hasAnyChildGeometryOverride,
    };
    return acc;
  }, {});

  const responsive = BACKY_RESPONSIVE_BREAKPOINTS.reduce<Record<string, unknown> | undefined>((acc, breakpoint) => {
    const bounds = breakpointBounds[breakpoint];
    if (!bounds?.hasGroupGeometryOverride) return acc;

    const override: Record<string, unknown> = {};
    if (bounds.x !== groupBase.x) override.x = bounds.x;
    if (bounds.y !== groupBase.y) override.y = bounds.y;
    if (bounds.width !== groupBase.width) override.width = bounds.width;
    if (bounds.height !== groupBase.height) override.height = bounds.height;
    if (bounds.zIndex !== groupBase.zIndex) override.zIndex = bounds.zIndex;
    return setBackyResponsiveOverride(acc, breakpoint, override);
  }, undefined);

  return {
    children: selectedSiblings.map((item, index) => {
      const nextChild: Record<string, unknown> = {
        ...item,
        parentId: groupId,
        x: backyNumberField(item, "x", 0) - groupBase.x,
        y: backyNumberField(item, "y", 0) - groupBase.y,
        zIndex: index + 1,
      };
      const nextResponsive = BACKY_RESPONSIVE_BREAKPOINTS.reduce<Record<string, unknown> | undefined>((acc, breakpoint) => {
        const bounds = breakpointBounds[breakpoint];
        const existing = backyResponsiveOverride(item, breakpoint);
        if (!bounds?.hasAnyChildGeometryOverride && !existing) return acc;

        const geometry = backyResponsiveGeometry(item, breakpoint);
        const override: Record<string, unknown> = { ...(existing || {}) };
        if (bounds?.hasGroupGeometryOverride || existing?.x !== undefined) {
          override.x = geometry.x - (bounds?.x ?? groupBase.x);
        }
        if (bounds?.hasGroupGeometryOverride || existing?.y !== undefined) {
          override.y = geometry.y - (bounds?.y ?? groupBase.y);
        }
        if (existing?.width !== undefined || geometry.width !== backyNumberField(item, "width", 1)) {
          override.width = geometry.width;
        }
        if (existing?.height !== undefined || geometry.height !== backyNumberField(item, "height", 1)) {
          override.height = geometry.height;
        }
        if (existing?.zIndex !== undefined) override.zIndex = existing.zIndex;
        if (existing?.rotation !== undefined) override.rotation = existing.rotation;
        return setBackyResponsiveOverride(acc, breakpoint, override);
      }, undefined);

      if (nextResponsive) {
        nextChild.responsive = nextResponsive;
      } else {
        delete nextChild.responsive;
      }
      return nextChild;
    }),
    responsive,
  };
}

function restoreBackyUngroupedChildResponsive(
  group: Record<string, unknown>,
  child: Record<string, unknown>,
  ungroupedChild: Record<string, unknown>,
): Record<string, unknown> | undefined {
  return BACKY_RESPONSIVE_BREAKPOINTS.reduce<Record<string, unknown> | undefined>((acc, breakpoint) => {
    const groupOverride = backyResponsiveOverride(group, breakpoint);
    const childOverride = backyResponsiveOverride(child, breakpoint);
    if (!groupOverride && !childOverride) return acc;

    const groupGeometry = backyResponsiveGeometry(group, breakpoint);
    const childGeometry = backyResponsiveGeometry(child, breakpoint);
    const override: Record<string, unknown> = { ...(childOverride || {}) };
    const absoluteX = groupGeometry.x + childGeometry.x;
    const absoluteY = groupGeometry.y + childGeometry.y;
    const absoluteZIndex = groupGeometry.zIndex + Math.max(0, childGeometry.zIndex - 1);
    const groupHasLayoutOverride = hasBackyResponsiveLayoutOverride(groupOverride, group);

    if (groupHasLayoutOverride || childOverride?.x !== undefined || absoluteX !== backyNumberField(ungroupedChild, "x", 0)) {
      override.x = absoluteX;
    } else {
      delete override.x;
    }
    if (groupHasLayoutOverride || childOverride?.y !== undefined || absoluteY !== backyNumberField(ungroupedChild, "y", 0)) {
      override.y = absoluteY;
    } else {
      delete override.y;
    }
    if (childOverride?.width !== undefined || childGeometry.width !== backyNumberField(ungroupedChild, "width", 1)) {
      override.width = childGeometry.width;
    } else {
      delete override.width;
    }
    if (childOverride?.height !== undefined || childGeometry.height !== backyNumberField(ungroupedChild, "height", 1)) {
      override.height = childGeometry.height;
    } else {
      delete override.height;
    }
    if (groupOverride?.zIndex !== undefined || childOverride?.zIndex !== undefined || absoluteZIndex !== backyNumberField(ungroupedChild, "zIndex", 1)) {
      override.zIndex = absoluteZIndex;
    } else {
      delete override.zIndex;
    }
    BACKY_RESPONSIVE_LAYER_FIELDS.forEach((field) => {
      if (groupOverride?.[field] !== undefined && childOverride?.[field] === undefined) {
        override[field] = field === "visible"
          ? backyBooleanField(groupOverride, field, true)
          : backyBooleanField(groupOverride, field, false);
      }
    });
    return setBackyResponsiveOverride(acc, breakpoint, override);
  }, undefined);
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

function backyAssetId(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function collectBackyAssetReferences(
  value: unknown,
  ids: Set<string>,
  options: { key?: string; includeExplicitAssetIds?: boolean } = {},
): void {
  const { key, includeExplicitAssetIds = false } = options;

  if (key === "assetIds") {
    if (includeExplicitAssetIds && Array.isArray(value)) {
      value.map(backyAssetId).filter(Boolean).forEach((id) => ids.add(id as string));
    }
    return;
  }

  if (key && BACKY_ASSET_REFERENCE_KEYS.has(key)) {
    if (Array.isArray(value)) {
      value.map(backyAssetId).filter(Boolean).forEach((id) => ids.add(id as string));
    } else {
      const id = backyAssetId(value);
      if (id) ids.add(id);
    }
    return;
  }

  if (Array.isArray(value)) {
    value.forEach((item) => collectBackyAssetReferences(item, ids, { includeExplicitAssetIds }));
    return;
  }

  if (!isBackyRecord(value)) {
    return;
  }

  Object.entries(value).forEach(([entryKey, entryValue]) => {
    collectBackyAssetReferences(entryValue, ids, {
      key: entryKey,
      includeExplicitAssetIds,
    });
  });
}

function collectBackyElementAssetReferences(
  element: Record<string, unknown>,
  includeExplicitAssetIds = false,
): Set<string> {
  const ids = new Set<string>();
  collectBackyAssetReferences(element, ids, { includeExplicitAssetIds });
  return ids;
}

function normalizeBackyElementAssetIds(element: Record<string, unknown>): void {
  const ids = collectBackyElementAssetReferences(element, true);
  if (ids.size > 0) {
    element.assetIds = Array.from(ids);
  } else {
    delete element.assetIds;
  }
}

function syncBackyElementAssetIdsAfterPatch(
  element: Record<string, unknown>,
  previousReferenceIds: Set<string>,
): void {
  const explicitAssetIds = Array.isArray(element.assetIds)
    ? element.assetIds.map(backyAssetId).filter(Boolean) as string[]
    : [];
  const nextReferenceIds = collectBackyElementAssetReferences(element, false);
  const nextAssetIds = [
    ...explicitAssetIds.filter((id) => !previousReferenceIds.has(id)),
    ...nextReferenceIds,
  ];
  const unique = Array.from(new Set(nextAssetIds));

  if (unique.length > 0) {
    element.assetIds = unique;
  } else {
    delete element.assetIds;
  }
}

function patchTouchesAssetIds(patch: BackyContentElementPatch): boolean {
  return Object.prototype.hasOwnProperty.call(patch.fields || {}, "assetIds") ||
    Object.keys(patch.changes || {}).some((path) => path === "assetIds" || path.startsWith("assetIds.")) ||
    (patch.remove || []).some((path) => path === "assetIds" || path.startsWith("assetIds."));
}

function inferBackyEditableValueType(
  path: string,
  value: unknown,
): BackyContentEditableTarget["valueType"] {
  const normalizedPath = path.toLowerCase();
  const leaf = normalizedPath.split(".").pop() || normalizedPath;
  const assetTargetPath = normalizedPath === "assetids" ||
    normalizedPath.includes("assetid") ||
    normalizedPath.includes("mediaid") ||
    normalizedPath.includes("fileid") ||
    normalizedPath.includes("fontmediaid");
  const assetListTargetPath = assetTargetPath && leaf.endsWith("ids");
  const jsonTargetPath = normalizedPath === "actions" ||
    normalizedPath === "databindings" ||
    normalizedPath === "bindingslots" ||
    normalizedPath === "animation.from" ||
    normalizedPath === "animation.to" ||
    normalizedPath === "animation.scrolltrigger";
  const tokenRefTargetPath = normalizedPath.startsWith("tokenrefs.") ||
    normalizedPath.includes(".tokenrefs.");
  if (tokenRefTargetPath) return "string";
  if (typeof value === "boolean") return "boolean";
  if (typeof value === "number") return "number";
  if (BACKY_BOOLEAN_EDITABLE_LEAVES.has(leaf)) return "boolean";
  if (BACKY_NUMERIC_EDITABLE_LEAVES.has(leaf)) return "number";
  if (BACKY_STRING_EDITABLE_LEAVES.has(leaf)) return "string";
  if (jsonTargetPath) return "json";
  if (assetTargetPath && (Array.isArray(value) || assetListTargetPath)) return "assetList";
  if (assetTargetPath) return "asset";
  if (Array.isArray(value)) return "richText";
  if (normalizedPath.includes("font")) {
    return "font";
  }
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
  if (
    normalizedPath.includes("content") ||
    normalizedPath.includes("label") ||
    normalizedPath.includes("placeholder") ||
    normalizedPath.includes("name") ||
    normalizedPath.includes("title") ||
    normalizedPath.includes("align") ||
    normalizedPath.includes("transform") ||
    normalizedPath.includes("decoration") ||
    normalizedPath.includes("style") ||
    normalizedPath.includes("preset") ||
    normalizedPath.includes("target") ||
    normalizedPath.includes("rel") ||
    normalizedPath.includes("type")
  ) {
    return "string";
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

function backyEditableTargetValue(
  element: Record<string, unknown>,
  path: string,
): unknown {
  const segments = path.split(".").filter(Boolean);
  let current: unknown = element;
  for (const segment of segments) {
    if (!isBackyRecord(current)) {
      return undefined;
    }
    current = current[segment];
  }
  return current;
}

function pushBackyEditableTargetIfMissing(
  targets: BackyContentEditableTarget[],
  element: Record<string, unknown>,
  path: string,
  source: BackyContentEditableTargetSource,
): void {
  if (targets.some((target) => target.path === path)) {
    return;
  }
  pushBackyEditableTarget(targets, path, source, backyEditableTargetValue(element, path));
}

function elementTypeMatchesBackyType(
  elementType: string,
  types: readonly string[],
): boolean {
  return types.includes(elementType);
}

function defaultBackyPropTargetPathsForElement(
  element: Record<string, unknown>,
): string[] {
  const elementType = typeof element.type === "string" ? element.type : "";
  const targets = new Set<string>(BACKY_COMMON_PROP_EDITABLE_TARGETS.map((target) => `props.${target}`));

  if (elementTypeMatchesBackyType(elementType, ["text", "heading", "paragraph", "quote", "button", "link"])) {
    BACKY_TEXT_PROP_EDITABLE_TARGETS.forEach((target) => targets.add(`props.${target}`));
  }

  if (elementType === "button") {
    BACKY_BUTTON_PROP_EDITABLE_TARGETS.forEach((target) => targets.add(`props.${target}`));
    BACKY_DOWNLOAD_FILE_PROP_EDITABLE_TARGETS.forEach((target) => targets.add(`props.${target}`));
  }

  if (elementType === "link") {
    BACKY_LINK_PROP_EDITABLE_TARGETS.forEach((target) => targets.add(`props.${target}`));
    BACKY_DOWNLOAD_FILE_PROP_EDITABLE_TARGETS.forEach((target) => targets.add(`props.${target}`));
  }

  if (elementType === "form") {
    BACKY_FORM_PROP_EDITABLE_TARGETS.forEach((target) => targets.add(`props.${target}`));
  }

  if (elementTypeMatchesBackyType(elementType, ["input", "textarea", "select", "checkbox", "radio"])) {
    BACKY_FIELD_PROP_EDITABLE_TARGETS.forEach((target) => targets.add(`props.${target}`));
    targets.add("props.formId");
    if (elementType === "input") {
      targets.add("props.inputType");
    }
    if (elementType === "textarea") {
      targets.add("props.rows");
    }
    if (elementTypeMatchesBackyType(elementType, ["select", "checkbox", "radio"])) {
      targets.add("props.options");
    }
  }

  if (elementTypeMatchesBackyType(elementType, ["image", "video"])) {
    BACKY_MEDIA_PROP_EDITABLE_TARGETS.forEach((target) => targets.add(`props.${target}`));
    if (elementType === "video") {
      targets.add("props.posterMediaId");
      targets.add("props.posterMediaIds");
      targets.add("props.controls");
      targets.add("props.autoplay");
      targets.add("props.muted");
      targets.add("props.loop");
    }
  }

  return [...targets];
}

function defaultBackyEditableTargetPathsForElement(
  element: Record<string, unknown>,
): Array<{ path: string; source: BackyContentEditableTargetSource }> {
  const layoutPaths = BACKY_LAYER_LAYOUT_TARGETS.map((field) => `layout.${field}`);
  const responsiveLayoutPaths = BACKY_RESPONSIVE_BREAKPOINTS.flatMap((breakpoint) => (
    [...BACKY_RESPONSIVE_GEOMETRY_FIELDS, ...BACKY_RESPONSIVE_LAYER_FIELDS].map((field) => ({
      path: `responsive.${breakpoint}.${field}`,
      source: "responsive" as const,
    }))
  ));
  const propPaths = defaultBackyPropTargetPathsForElement(element);
  const stylePaths = BACKY_STYLE_EDITABLE_TARGETS.map((target) => `styles.${target}`);
  const tokenRefPaths = BACKY_TOKEN_REF_EDITABLE_TARGETS.map((target) => `tokenRefs.${target}`);
  const responsivePropPaths = BACKY_RESPONSIVE_BREAKPOINTS.flatMap((breakpoint) => (
    propPaths.map((path) => ({
      path: `responsive.${breakpoint}.${path}`,
      source: "responsive" as const,
    }))
  ));
  const responsiveStylePaths = BACKY_RESPONSIVE_BREAKPOINTS.flatMap((breakpoint) => (
    stylePaths.map((path) => ({
      path: `responsive.${breakpoint}.${path}`,
      source: "responsive" as const,
    }))
  ));
  const responsiveTokenRefPaths = BACKY_RESPONSIVE_BREAKPOINTS.flatMap((breakpoint) => (
    tokenRefPaths.map((path) => ({
      path: `responsive.${breakpoint}.${path}`,
      source: "responsive" as const,
    }))
  ));

  return [
    ...layoutPaths.map((path) => ({ path, source: "layout" as const })),
    ...responsiveLayoutPaths,
    ...propPaths.map((path) => ({ path, source: "props" as const })),
    ...stylePaths.map((path) => ({ path, source: "styles" as const })),
    ...tokenRefPaths.map((path) => ({ path, source: "tokenRefs" as const })),
    ...responsivePropPaths,
    ...responsiveStylePaths,
    ...responsiveTokenRefPaths,
    ...BACKY_ANIMATION_EDITABLE_TARGETS.map((path) => ({ path, source: "animation" as const })),
    ...BACKY_INTERACTION_EDITABLE_TARGETS.map((path) => ({ path, source: "interactions" as const })),
  ];
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
    isBackyElementHidden(element),
  );
  pushBackyEditableTarget(
    targets,
    "visibility.locked",
    "visibility",
    isBackyElementLocked(element),
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
  if (isBackyRecord(element.tokenRefs)) {
    Object.entries(element.tokenRefs).forEach(([key, value]) => {
      pushBackyEditableTarget(targets, `tokenRefs.${key}`, "tokenRefs", value);
    });
  }
  if (Array.isArray(element.assetIds)) {
    pushBackyEditableTarget(targets, "assetIds", "assets", element.assetIds);
  }
  BACKY_INTERACTION_EDITABLE_TARGETS.forEach((path) => {
    if (Array.isArray(element[path])) {
      pushBackyEditableTarget(targets, path, "interactions", element[path]);
    }
  });
  if (isBackyRecord(element.responsive)) {
    Object.entries(element.responsive).forEach(([breakpoint, override]) => {
      if (!isBackyRecord(override)) return;
      [...BACKY_RESPONSIVE_GEOMETRY_FIELDS, ...BACKY_RESPONSIVE_LAYER_FIELDS].forEach((field) => {
        if (override[field] !== undefined) {
          pushBackyEditableTarget(targets, `responsive.${breakpoint}.${field}`, "responsive", override[field]);
        }
      });
      if (isBackyRecord(override.props)) {
        Object.entries(override.props).forEach(([key, value]) => {
          pushBackyEditableTarget(targets, `responsive.${breakpoint}.props.${key}`, "responsive", value);
        });
      }
      if (isBackyRecord(override.styles)) {
        Object.entries(override.styles).forEach(([key, value]) => {
          pushBackyEditableTarget(targets, `responsive.${breakpoint}.styles.${key}`, "responsive", value);
        });
      }
      if (isBackyRecord(override.tokenRefs)) {
        Object.entries(override.tokenRefs).forEach(([key, value]) => {
          pushBackyEditableTarget(targets, `responsive.${breakpoint}.tokenRefs.${key}`, "responsive", value);
        });
      }
    });
  }
  if (isBackyRecord(element.animation)) {
    Object.entries(element.animation).forEach(([key, value]) => {
      pushBackyEditableTarget(targets, `animation.${key}`, "animation", value);
    });
    if (isBackyRecord(element.animation.tokenRefs)) {
      Object.entries(element.animation.tokenRefs).forEach(([key, value]) => {
        pushBackyEditableTarget(targets, `animation.tokenRefs.${key}`, "animation", value);
      });
    }
  }
  defaultBackyEditableTargetPathsForElement(element).forEach((target) => {
    pushBackyEditableTargetIfMissing(targets, element, target.path, target.source);
  });
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

function setBackyTokenRefValue(
  root: Record<string, unknown>,
  tokenKey: string,
  value: unknown,
): void {
  const normalizedTokenKey = tokenKey.trim();
  if (!normalizedTokenKey) return;

  if (!isBackyRecord(root.tokenRefs)) {
    if (value === undefined) return;
    root.tokenRefs = {};
  }

  const tokenRefs = root.tokenRefs as Record<string, unknown>;
  if (value === undefined) {
    delete tokenRefs[normalizedTokenKey];
    if (Object.keys(tokenRefs).length === 0) {
      delete root.tokenRefs;
    }
    return;
  }

  tokenRefs[normalizedTokenKey] = value;
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

  if (path.startsWith("tokenRefs.")) {
    setBackyTokenRefValue(element, path.slice("tokenRefs.".length), value);
    return;
  }

  const responsiveTokenRefMatch = path.match(/^responsive\.([^.]+)\.tokenRefs\.(.+)$/);
  if (responsiveTokenRefMatch) {
    const [, breakpoint, tokenKey] = responsiveTokenRefMatch;
    if (!isBackyRecord(element.responsive)) {
      if (value === undefined) return;
      element.responsive = {};
    }
    const responsive = element.responsive as Record<string, unknown>;
    if (!isBackyRecord(responsive[breakpoint])) {
      if (value === undefined) return;
      responsive[breakpoint] = {};
    }
    setBackyTokenRefValue(
      responsive[breakpoint] as Record<string, unknown>,
      tokenKey,
      value,
    );
    if (value === undefined) {
      const prunedResponsive = pruneBackyResponsive(responsive);
      if (prunedResponsive) {
        element.responsive = prunedResponsive;
      } else {
        delete element.responsive;
      }
    }
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
      element.visible = !parseBackyBoolean(value, false);
    }
    return;
  }

  if (path === "visibility.locked") {
    if (value === undefined) {
      delete element.locked;
    } else {
      element.locked = parseBackyBoolean(value, false);
    }
    return;
  }

  setNestedEditableValue(element, path, value);
}

function applyBackyContentElementPatch(
  element: Record<string, unknown>,
  patch: BackyContentElementPatch,
): void {
  const previousReferenceIds = collectBackyElementAssetReferences(element, false);
  const touchedAssetIds = patchTouchesAssetIds(patch);

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

  if (touchedAssetIds) {
    normalizeBackyElementAssetIds(element);
  } else {
    syncBackyElementAssetIdsAfterPatch(element, previousReferenceIds);
  }
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

function isBackyDescriptorUnlocked(descriptor: BackyContentElementDescriptor): boolean {
  return !isBackyElementLocked(descriptor.element);
}

function isBackyDescriptorVisible(descriptor: BackyContentElementDescriptor): boolean {
  return !isBackyElementHidden(descriptor.element);
}

function isBackyDescriptorEditorGroup(descriptor: BackyContentElementDescriptor): boolean {
  return isBackyRecord(descriptor.element.props) &&
    descriptor.element.props.editorGroup === true &&
    descriptor.childCount > 0;
}

function backyCommandEvaluation(
  command: BackyManifestEditorCommandRegistryCommand,
  enabled: boolean,
  visible: boolean,
  readyReason: string,
  disabledReason: string,
  hiddenReason = "Command is hidden in the current editor state.",
): BackyEditorCommandEvaluation {
  const state: BackyEditorCommandEvaluationStateValue = visible
    ? enabled ? "ready" : "disabled"
    : "hidden";

  return {
    id: command.id,
    label: command.label,
    category: command.category,
    targetScope: command.targetScope,
    testId: command.testId,
    ...(command.shortcut ? { shortcut: command.shortcut } : {}),
    ...(command.ariaKeyshortcuts ? { ariaKeyshortcuts: command.ariaKeyshortcuts } : {}),
    ...(command.sdkHelper ? { sdkHelper: command.sdkHelper } : {}),
    ...(command.apiHelper ? { apiHelper: command.apiHelper } : {}),
    enabled: visible && enabled,
    state,
    reason: state === "ready"
      ? readyReason
      : state === "hidden"
        ? hiddenReason
        : disabledReason,
    command,
  };
}

export function evaluateBackyEditorCommandRegistry(
  registry: BackyManifestEditorCommandRegistry,
  state: BackyEditorCommandEvaluationInput = {},
): BackyEditorCommandRegistryEvaluation {
  const selectedIds = [...new Set(state.selectedIds || [])];
  const descriptors = state.descriptors || listBackyContentElements(state.content);
  const descriptorById = new Map(descriptors.map((descriptor) => [descriptor.id, descriptor]));
  const selectedDescriptors = selectedIds
    .map((id) => descriptorById.get(id))
    .filter((descriptor): descriptor is BackyContentElementDescriptor => Boolean(descriptor));
  const selectedLayerCount = selectedDescriptors.length || selectedIds.length;
  const selectedParentId = selectedDescriptors[0]?.parentId;
  const selectedEntriesShareParent = selectedDescriptors.length > 0 &&
    selectedDescriptors.every((descriptor) => descriptor.parentId === selectedParentId);
  const selectedUnlocked = selectedDescriptors.length > 0 &&
    selectedDescriptors.every(isBackyDescriptorUnlocked);
  const selectedVisible = selectedDescriptors.length > 0 &&
    selectedDescriptors.every(isBackyDescriptorVisible);
  const selectedEditorGroups = selectedDescriptors.length > 0 &&
    selectedDescriptors.every(isBackyDescriptorEditorGroup);
  const siblingLayerCount = selectedDescriptors.length > 0
    ? descriptors.filter((descriptor) => descriptor.parentId === selectedParentId).length
    : 0;
  const firstSelectedDescriptor = selectedDescriptors[0];
  const selectedChildDescriptors = firstSelectedDescriptor
    ? descriptors.filter((descriptor) => descriptor.parentId === firstSelectedDescriptor.id)
    : [];
  const selectableChildLayerCount = selectedChildDescriptors
    .filter((descriptor) => isBackyDescriptorUnlocked(descriptor) && isBackyDescriptorVisible(descriptor))
    .length;
  const canMutateCanvas = state.canEdit !== false && state.isSaving !== true && state.isPreview !== true;
  const clipboardCount = Math.max(0, Math.trunc(state.clipboardCount || 0));
  const historyIndex = Math.max(0, Math.trunc(state.historyIndex || 0));
  const historyLength = Math.max(0, Math.trunc(state.historyLength || 0));
  const editorMode = state.editorMode || "page";

  const selectionReason = selectedLayerCount === 1
    ? "1 selected layer."
    : `${selectedLayerCount} selected layers.`;
  const mutationDisabledReason = state.canEdit === false
    ? "Editing is disabled."
    : state.isSaving
      ? "The editor is saving."
      : state.isPreview
        ? "Preview mode is active."
        : "Command requirements are not met.";

  const evaluations = registry.commands.map((command) => {
    switch (command.id) {
      case "undo":
        return backyCommandEvaluation(
          command,
          canMutateCanvas && historyIndex > 0,
          true,
          "An earlier history state is available.",
          canMutateCanvas ? "No earlier history state is available." : mutationDisabledReason,
        );
      case "redo":
        return backyCommandEvaluation(
          command,
          canMutateCanvas && historyLength > 0 && historyIndex < historyLength - 1,
          true,
          "A later history state is available.",
          canMutateCanvas ? "No later history state is available." : mutationDisabledReason,
        );
      case "copy-selection":
        return backyCommandEvaluation(
          command,
          canMutateCanvas && selectedLayerCount > 0 && selectedEntriesShareParent,
          true,
          `Copy can target the active sibling scope. ${selectionReason}`,
          canMutateCanvas ? "Select one or more layers in the same parent scope." : mutationDisabledReason,
        );
      case "cut-selection":
      case "duplicate-selection":
      case "delete-selection":
        return backyCommandEvaluation(
          command,
          canMutateCanvas && selectedLayerCount > 0 && selectedEntriesShareParent && selectedUnlocked,
          true,
          `${command.label} is ready for unlocked sibling layers. ${selectionReason}`,
          canMutateCanvas ? "Select unlocked layers in the same parent scope." : mutationDisabledReason,
        );
      case "paste-selection":
        return backyCommandEvaluation(
          command,
          canMutateCanvas && clipboardCount > 0,
          true,
          `Paste is ready with ${clipboardCount} clipboard layer${clipboardCount === 1 ? "" : "s"}.`,
          canMutateCanvas ? "Copy or cut at least one layer before pasting." : mutationDisabledReason,
        );
      case "select-sibling-layers":
        return backyCommandEvaluation(
          command,
          canMutateCanvas && selectedLayerCount > 0 && siblingLayerCount >= 2,
          true,
          `${siblingLayerCount} sibling layers are available in the active scope.`,
          canMutateCanvas ? "Select a layer with at least one sibling." : mutationDisabledReason,
        );
      case "select-child-layers":
      case "select-child-layer":
        return backyCommandEvaluation(
          command,
          canMutateCanvas && selectableChildLayerCount > 0,
          true,
          `${selectableChildLayerCount} visible unlocked child layer${selectableChildLayerCount === 1 ? "" : "s"} are available.`,
          canMutateCanvas ? "Select a container or group with visible unlocked children." : mutationDisabledReason,
        );
      case "select-parent-layer":
        return backyCommandEvaluation(
          command,
          canMutateCanvas && selectedLayerCount > 0 && typeof selectedParentId === "string",
          true,
          `Parent layer ${selectedParentId} is available.`,
          canMutateCanvas ? "The current selection has no parent layer." : mutationDisabledReason,
        );
      case "group-selection":
        return backyCommandEvaluation(
          command,
          canMutateCanvas && selectedLayerCount >= 2 && selectedEntriesShareParent && selectedUnlocked,
          true,
          `${selectedLayerCount} unlocked sibling layers can be grouped.`,
          canMutateCanvas ? "Select at least two unlocked layers in the same parent scope." : mutationDisabledReason,
        );
      case "ungroup-selection":
        return backyCommandEvaluation(
          command,
          canMutateCanvas && selectedLayerCount > 0 && selectedEntriesShareParent && selectedUnlocked && selectedEditorGroups,
          true,
          `${selectedLayerCount} selected editor group${selectedLayerCount === 1 ? "" : "s"} can be ungrouped.`,
          canMutateCanvas ? "Select unlocked editor groups in the same parent scope." : mutationDisabledReason,
        );
      case "toggle-selection-visibility":
        return backyCommandEvaluation(
          command,
          canMutateCanvas && selectedLayerCount > 0 && selectedUnlocked,
          true,
          "Selected unlocked layers can toggle visibility.",
          canMutateCanvas ? "Select unlocked layers before toggling visibility." : mutationDisabledReason,
        );
      case "toggle-selection-lock":
        return backyCommandEvaluation(
          command,
          canMutateCanvas && selectedLayerCount > 0,
          true,
          "Selected layers can toggle lock state.",
          canMutateCanvas ? "Select at least one layer before toggling lock state." : mutationDisabledReason,
        );
      case "send-to-back":
      case "send-backward":
      case "bring-forward":
      case "bring-to-front":
        return backyCommandEvaluation(
          command,
          canMutateCanvas && selectedLayerCount > 0 && selectedEntriesShareParent && selectedUnlocked && siblingLayerCount > selectedLayerCount,
          true,
          "Selected sibling layers can change layer order.",
          canMutateCanvas ? "Select unlocked layers with neighboring siblings before changing order." : mutationDisabledReason,
        );
      case "align-left":
      case "align-center":
      case "align-right":
      case "align-top":
      case "align-middle":
      case "align-bottom":
        return backyCommandEvaluation(
          command,
          canMutateCanvas && selectedLayerCount > 0 && selectedEntriesShareParent && selectedUnlocked && selectedVisible,
          true,
          "Selected visible unlocked sibling layers can be aligned.",
          canMutateCanvas ? "Select visible unlocked layers in the same parent scope before aligning." : mutationDisabledReason,
        );
      case "distribute-horizontal":
      case "distribute-vertical":
        return backyCommandEvaluation(
          command,
          canMutateCanvas && selectedLayerCount >= 3 && selectedEntriesShareParent && selectedUnlocked && selectedVisible,
          true,
          `${selectedLayerCount} visible unlocked sibling layers can be distributed.`,
          canMutateCanvas ? "Select at least three visible unlocked sibling layers before distributing." : mutationDisabledReason,
        );
      case "toggle-grid":
      case "toggle-snap":
      case "toggle-pan":
      case "zoom-out":
      case "zoom-in":
      case "zoom-fit":
        return backyCommandEvaluation(
          command,
          state.isPreview !== true,
          state.isPreview !== true,
          `${command.label} is ready outside preview mode.`,
          "Viewport controls are disabled in preview mode.",
          "Viewport controls are hidden in preview mode.",
        );
      case "toggle-preview":
        return backyCommandEvaluation(
          command,
          state.isSaving !== true,
          true,
          "Preview can be toggled.",
          "Wait for the current save before toggling preview.",
        );
      case "open-page-settings":
        return backyCommandEvaluation(
          command,
          state.isSaving !== true,
          state.hideSettings !== true,
          "Settings can be opened.",
          "Wait for the current save before opening settings.",
          "Settings controls are hidden for this editor.",
        );
      case "reload-page":
        return backyCommandEvaluation(
          command,
          state.isSaving !== true,
          true,
          "Content can be reloaded from the last saved state.",
          "Wait for the current save before reloading.",
        );
      case "publish-page":
        return backyCommandEvaluation(
          command,
          state.isSaving !== true &&
            state.canEdit !== false &&
            state.canPublish !== false &&
            state.publishBlocked !== true,
          state.hideSave !== true && editorMode === "page",
          "Page publication command is ready.",
          state.canPublish === false
            ? "Publishing is disabled for this user."
            : state.publishBlocked
              ? "Resolve page readiness issues before publishing."
              : mutationDisabledReason,
          "Publish is only visible in page editor mode with save controls.",
        );
      case "save-page":
        return backyCommandEvaluation(
          command,
          state.isSaving !== true && state.canEdit !== false,
          state.hideSave !== true,
          "Content can be saved.",
          state.canEdit === false ? "Editing is disabled." : "Wait for the current save before saving.",
          "Save controls are hidden for this editor.",
        );
      default:
        if (command.category === "shell") {
          return backyCommandEvaluation(
            command,
            true,
            true,
            `${command.label} shell command is available.`,
            "Shell command is unavailable.",
          );
        }

        return backyCommandEvaluation(
          command,
          true,
          true,
          command.stateRule,
          command.stateRule,
        );
    }
  });

  return {
    schemaVersion: "backy.editor-command-registry-evaluation.v1",
    registrySchemaVersion: registry.schemaVersion,
    selectedIds,
    summary: {
      totalCommandCount: evaluations.length,
      readyCommandCount: evaluations.filter((command) => command.state === "ready").length,
      disabledCommandCount: evaluations.filter((command) => command.state === "disabled").length,
      hiddenCommandCount: evaluations.filter((command) => command.state === "hidden").length,
      selectedLayerCount,
    },
    commands: evaluations,
  };
}

export function addBackyContentElement<TContent extends BackyEditableContent>(
  content: TContent | undefined | null,
  element: BackyElement | Record<string, unknown>,
  options: BackyContentAddElementOptions = {},
): BackyContentAddElementResult<TContent> | null {
  if (!content || !isBackyRecord(element) || typeof element.id !== "string") {
    return null;
  }

  const elementId = element.id;
  const nextContent = cloneBackyContent(content);
  const nextElement = cloneBackyRecord(element);
  const parentId = options.parentId;
  let insertedIndex = -1;
  let inserted = false;

  if (parentId) {
    visitBackyContentElements(contentElementRoots(nextContent), (candidate) => {
      if (inserted || candidate.id !== parentId) return;
      if (!options.allowLockedParent && isBackyElementLocked(candidate)) return;
      if (!Array.isArray(candidate.children)) {
        candidate.children = [];
      }
      const children = candidate.children as unknown[];
      nextElement.parentId = parentId;
      insertedIndex = normalizeBackyInsertIndex(options.index, children.length);
      children.splice(insertedIndex, 0, nextElement);
      inserted = true;
    });
  } else {
    const root = contentElementRoots(nextContent)[0];
    if (root) {
      delete nextElement.parentId;
      insertedIndex = normalizeBackyInsertIndex(options.index, root.length);
      root.splice(insertedIndex, 0, nextElement);
      inserted = true;
    }
  }

  if (!inserted) {
    return null;
  }

  return {
    content: refreshBackyEditorCompositionMetadata(nextContent),
    elementId,
    ...(parentId ? { parentId } : {}),
    index: insertedIndex,
  };
}

export function duplicateBackyContentElement<TContent extends BackyEditableContent>(
  content: TContent | undefined | null,
  elementId: string,
  options: BackyContentDuplicateElementOptions = {},
): BackyContentDuplicateElementResult<TContent> | null {
  if (!content || !elementId) {
    return null;
  }

  const nextContent = cloneBackyContent(content);
  const idSuffix = options.idSuffix || `copy-${Date.now().toString(36)}`;
  const offsetX = typeof options.offsetX === "number" ? options.offsetX : 16;
  const offsetY = typeof options.offsetY === "number" ? options.offsetY : 16;
  let result: BackyContentDuplicateElementResult<TContent> | null = null;

  const cloneForDuplicate = (
    source: Record<string, unknown>,
    parentId: string | undefined,
    isRoot: boolean,
  ): Record<string, unknown> => {
    const clone = cloneBackyRecord(source);
    const sourceId = backyElementId(source) || "element";
    const duplicateId = isRoot && options.duplicateId
      ? options.duplicateId
      : nextBackyContentElementId(sourceId, idSuffix);
    clone.id = duplicateId;
    if (parentId) {
      clone.parentId = parentId;
    } else {
      delete clone.parentId;
    }
    if (isRoot) {
      clone.x = backyNumberField(clone, "x", 0) + offsetX;
      clone.y = backyNumberField(clone, "y", 0) + offsetY;
    }
    if (Array.isArray(clone.children)) {
      clone.children = clone.children
        .filter(isBackyRecord)
        .map((child) => cloneForDuplicate(child, duplicateId, false));
    }
    return clone;
  };

  const duplicateInSiblings = (siblings: unknown[], parentId?: string): boolean => {
    const sourceIndex = siblings.findIndex((item) => backyElementId(item) === elementId);
    if (sourceIndex >= 0) {
      const source = siblings[sourceIndex];
      if (!isBackyRecord(source)) return false;
      if (!options.allowLocked && isBackyElementLocked(source)) return false;

      const duplicate = cloneForDuplicate(source, parentId, true);
      const insertIndex = normalizeBackyInsertIndex(options.index, siblings.length);
      siblings.splice(options.index === undefined ? sourceIndex + 1 : insertIndex, 0, duplicate);
      result = {
        content: nextContent,
        sourceId: elementId,
        duplicateId: String(duplicate.id),
        duplicatedIds: collectBackyElementIds(duplicate),
        ...(parentId ? { parentId } : {}),
        index: options.index === undefined ? sourceIndex + 1 : insertIndex,
      };
      return true;
    }

    return siblings.some((item) => (
      isBackyRecord(item) &&
      Array.isArray(item.children) &&
      duplicateInSiblings(item.children, backyElementId(item) || undefined)
    ));
  };

  for (const root of contentElementRoots(nextContent)) {
    if (duplicateInSiblings(root)) break;
  }

  const finalResult = result as BackyContentDuplicateElementResult<TContent> | null;
  return finalResult
    ? { ...finalResult, content: refreshBackyEditorCompositionMetadata(nextContent) }
    : null;
}

export function deleteBackyContentElements<TContent extends BackyEditableContent>(
  content: TContent | undefined | null,
  elementIds: readonly string[],
  options: BackyContentDeleteElementsOptions = {},
): BackyContentDeleteElementsResult<TContent> | null {
  const selectedIds = Array.from(new Set(elementIds.filter(Boolean)));
  if (!content || selectedIds.length === 0) {
    return null;
  }

  const selectedSet = new Set(selectedIds);
  let lockedSelected = false;
  let foundSelected = false;
  visitBackyContentElements(contentElementRoots(content), (element) => {
    const id = backyElementId(element);
    if (!id || !selectedSet.has(id)) return;
    foundSelected = true;
    if (!options.allowLocked && isBackyElementLocked(element)) {
      lockedSelected = true;
    }
  });

  if (!foundSelected || lockedSelected) {
    return null;
  }

  const nextContent = cloneBackyContent(content);
  const deletedIds: string[] = [];
  const deleteFromSiblings = (siblings: unknown[]): void => {
    const kept: unknown[] = [];
    siblings.forEach((item) => {
      const id = backyElementId(item);
      if (id && selectedSet.has(id) && isBackyRecord(item)) {
        deletedIds.push(...collectBackyElementIds(item));
        return;
      }
      if (isBackyRecord(item) && Array.isArray(item.children)) {
        deleteFromSiblings(item.children);
      }
      kept.push(item);
    });
    siblings.splice(0, siblings.length, ...kept);
  };

  contentElementRoots(nextContent).forEach(deleteFromSiblings);
  return deletedIds.length > 0
    ? {
        content: refreshBackyEditorCompositionMetadata(nextContent),
        deletedIds: Array.from(new Set(deletedIds)),
      }
    : null;
}

export function transformBackyContentElements<TContent extends BackyEditableContent>(
  content: TContent | undefined | null,
  transforms: readonly BackyContentElementTransform[],
  options: BackyContentTransformElementsOptions = {},
): BackyContentTransformElementsResult<TContent> | null {
  const validTransforms = transforms.filter((transform) => transform.elementId);
  if (!content || validTransforms.length === 0) {
    return null;
  }

  const transformById = new Map(validTransforms.map((transform) => [transform.elementId, transform]));
  let lockedSelected = false;
  let foundSelected = false;
  visitBackyContentElements(contentElementRoots(content), (element) => {
    const id = backyElementId(element);
    if (!id || !transformById.has(id)) return;
    foundSelected = true;
    if (!options.allowLocked && isBackyElementLocked(element)) {
      lockedSelected = true;
    }
  });

  if (!foundSelected || lockedSelected) {
    return null;
  }

  const minWidth = typeof options.minWidth === "number" ? options.minWidth : 1;
  const minHeight = typeof options.minHeight === "number" ? options.minHeight : 1;
  const nextContent = cloneBackyContent(content);
  const transformedIds = new Set<string>();
  const breakpoints = new Set<BackyContentTransformBreakpoint>();

  const applyTransform = (target: Record<string, unknown>, transform: BackyContentElementTransform) => {
    const breakpoint = transform.breakpoint || "desktop";
    const updateTarget = breakpoint === "desktop"
      ? target
      : (() => {
          const responsive = isBackyRecord(target.responsive)
            ? { ...target.responsive }
            : {};
          const currentOverride = isBackyRecord(responsive[breakpoint])
            ? { ...(responsive[breakpoint] as Record<string, unknown>) }
            : {};
          responsive[breakpoint] = currentOverride;
          target.responsive = responsive;
          return currentOverride;
        })();

    const currentNumber = (field: string, fallback: number) => (
      backyNumberField(updateTarget, field, backyNumberField(target, field, fallback))
    );
    const setNumber = (field: string, value: number | undefined) => {
      if (typeof value === "number" && Number.isFinite(value)) {
        updateTarget[field] = value;
      }
    };

    setNumber("x", transform.x ?? (transform.deltaX !== undefined ? currentNumber("x", 0) + transform.deltaX : undefined));
    setNumber("y", transform.y ?? (transform.deltaY !== undefined ? currentNumber("y", 0) + transform.deltaY : undefined));
    setNumber("width", transform.width !== undefined
      ? Math.max(minWidth, transform.width)
      : transform.deltaWidth !== undefined
        ? Math.max(minWidth, currentNumber("width", minWidth) + transform.deltaWidth)
        : undefined);
    setNumber("height", transform.height !== undefined
      ? Math.max(minHeight, transform.height)
      : transform.deltaHeight !== undefined
        ? Math.max(minHeight, currentNumber("height", minHeight) + transform.deltaHeight)
        : undefined);
    setNumber("zIndex", transform.zIndex);
    setNumber("rotation", transform.rotation);
    transformedIds.add(transform.elementId);
    breakpoints.add(breakpoint);
  };

  visitBackyContentElements(contentElementRoots(nextContent), (element) => {
    const id = backyElementId(element);
    if (!id) return;
    const transform = transformById.get(id);
    if (transform) {
      applyTransform(element, transform);
    }
  });

  return transformedIds.size > 0
    ? {
        content: refreshBackyEditorCompositionMetadata(nextContent),
        transformedIds: Array.from(transformedIds),
        breakpoints: Array.from(breakpoints),
      }
    : null;
}

export function groupBackyContentElements<TContent extends BackyEditableContent>(
  content: TContent | undefined | null,
  elementIds: readonly string[],
  options: BackyContentGroupOptions = {},
): BackyContentGroupResult<TContent> | null {
  const selectedIds = Array.from(new Set(elementIds.filter(Boolean)));
  if (!content || selectedIds.length < 2) {
    return null;
  }

  const selectedSet = new Set(selectedIds);
  const nextContent = cloneBackyContent(content);
  const groupId = options.groupId || `backy-group-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  const groupType = options.type || "box";
  let result: BackyContentGroupResult<TContent> | null = null;

  const groupInSiblings = (siblings: unknown[], parentId?: string): boolean => {
    const selectedIndexes: number[] = [];
    const selectedSiblings: Record<string, unknown>[] = [];

    siblings.forEach((item, index) => {
      const id = backyElementId(item);
      if (id && selectedSet.has(id) && isBackyRecord(item)) {
        selectedIndexes.push(index);
        selectedSiblings.push(item);
      }
    });

    if (selectedSiblings.length === selectedIds.length) {
      if (!options.allowLocked && selectedSiblings.some(isBackyElementLocked)) {
        return false;
      }

      const minX = Math.min(...selectedSiblings.map((item) => backyNumberField(item, "x", 0)));
      const minY = Math.min(...selectedSiblings.map((item) => backyNumberField(item, "y", 0)));
      const maxX = Math.max(...selectedSiblings.map((item) => (
        backyNumberField(item, "x", 0) + Math.max(1, backyNumberField(item, "width", 1))
      )));
      const maxY = Math.max(...selectedSiblings.map((item) => (
        backyNumberField(item, "y", 0) + Math.max(1, backyNumberField(item, "height", 1))
      )));
      const groupBase = {
        x: minX,
        y: minY,
        width: Math.max(1, maxX - minX),
        height: Math.max(1, maxY - minY),
        zIndex: Math.max(...selectedSiblings.map((item) => backyNumberField(item, "zIndex", 1))),
      };
      const responsiveGroup = buildBackyGroupResponsiveChildren(selectedSiblings, groupId, groupBase);
      const group: Record<string, unknown> = {
        id: groupId,
        type: groupType,
        name: options.name || "Group",
        ...groupBase,
        visible: true,
        props: {
          backgroundColor: "transparent",
          borderRadius: 0,
          borderWidth: 0,
          editorGroup: true,
          padding: 0,
          ...(options.props || {}),
        },
        children: responsiveGroup.children,
        ...(options.styles ? { styles: options.styles } : {}),
        ...(responsiveGroup.responsive ? { responsive: responsiveGroup.responsive } : {}),
        ...(options.fields || {}),
      };
      if (parentId) {
        group.parentId = parentId;
      } else {
        delete group.parentId;
      }

      const firstSelectedIndex = Math.min(...selectedIndexes);
      const nextSiblings = siblings.filter((item) => {
        const id = backyElementId(item);
        return !id || !selectedSet.has(id);
      });
      nextSiblings.splice(firstSelectedIndex, 0, group);
      siblings.splice(0, siblings.length, ...nextSiblings);

      result = {
        content: nextContent,
        groupId,
        groupedIds: selectedIds,
        ...(parentId ? { parentId } : {}),
        childCount: selectedIds.length,
      };
      return true;
    }

    return siblings.some((item) => (
      isBackyRecord(item) &&
      Array.isArray(item.children) &&
      groupInSiblings(item.children, backyElementId(item) || undefined)
    ));
  };

  for (const root of contentElementRoots(nextContent)) {
    groupInSiblings(root);
  }

  const finalResult = result as BackyContentGroupResult<TContent> | null;
  return finalResult
    ? { ...finalResult, content: refreshBackyEditorCompositionMetadata(nextContent) }
    : null;
}

export function ungroupBackyContentElements<TContent extends BackyEditableContent>(
  content: TContent | undefined | null,
  groupIds: readonly string[],
  options: BackyContentUngroupOptions = {},
): BackyContentUngroupResult<TContent> | null {
  const selectedIds = Array.from(new Set(groupIds.filter(Boolean)));
  if (!content || selectedIds.length === 0) {
    return null;
  }

  const selectedSet = new Set(selectedIds);
  const requireEditorGroup = options.requireEditorGroup !== false;
  const nextContent = cloneBackyContent(content);
  let result: BackyContentUngroupResult<TContent> | null = null;

  const ungroupInSiblings = (siblings: unknown[], parentId?: string): boolean => {
    const selectedGroups = siblings.filter((item): item is Record<string, unknown> => {
      const id = backyElementId(item);
      if (!id || !selectedSet.has(id) || !isBackyRecord(item)) return false;
      if (!options.allowLocked && isBackyElementLocked(item)) return false;
      if (!Array.isArray(item.children) || item.children.length === 0) return false;
      if (requireEditorGroup && !(isBackyRecord(item.props) && item.props.editorGroup === true)) {
        return false;
      }
      return true;
    });

    if (selectedGroups.length === selectedIds.length) {
      const expandedIds: string[] = [];
      const nextSiblings = siblings.flatMap((item) => {
        const id = backyElementId(item);
        if (!id || !selectedSet.has(id) || !isBackyRecord(item)) {
          return [item];
        }

        return (Array.isArray(item.children) ? item.children : [])
          .filter(isBackyRecord)
          .map((child, index) => {
            const nextChild: Record<string, unknown> = {
              ...child,
              x: backyNumberField(item, "x", 0) + backyNumberField(child, "x", 0),
              y: backyNumberField(item, "y", 0) + backyNumberField(child, "y", 0),
              zIndex: backyNumberField(item, "zIndex", 1) + Math.max(0, backyNumberField(child, "zIndex", index + 1) - 1),
            };
            if (parentId) {
              nextChild.parentId = parentId;
            } else {
              delete nextChild.parentId;
            }

            const nextResponsive = restoreBackyUngroupedChildResponsive(item, child, nextChild);
            if (nextResponsive) {
              nextChild.responsive = nextResponsive;
            } else {
              delete nextChild.responsive;
            }

            const childId = backyElementId(nextChild);
            if (childId) {
              expandedIds.push(childId);
            }
            return nextChild;
          });
      });
      siblings.splice(0, siblings.length, ...nextSiblings);

      result = {
        content: nextContent,
        ungroupedIds: selectedIds,
        expandedIds,
        ...(parentId ? { parentId } : {}),
        childCount: expandedIds.length,
      };
      return true;
    }

    return siblings.some((item) => (
      isBackyRecord(item) &&
      Array.isArray(item.children) &&
      ungroupInSiblings(item.children, backyElementId(item) || undefined)
    ));
  };

  for (const root of contentElementRoots(nextContent)) {
    ungroupInSiblings(root);
  }

  const finalResult = result as BackyContentUngroupResult<TContent> | null;
  return finalResult
    ? { ...finalResult, content: refreshBackyEditorCompositionMetadata(nextContent) }
    : null;
}

export function patchBackyContentElement<TContent extends BackyEditableContent>(
  content: TContent | undefined | null,
  patch: BackyContentElementPatch,
): TContent | null {
  return patchBackyContentElements(content, [patch]);
}

export function patchBackyContentElementDownloadFile<
  TContent extends BackyEditableContent,
>(
  content: TContent | undefined | null,
  elementId: string,
  siteId: string,
  mediaId: string,
  options: BackyContentDownloadFilePatchOptions = {},
): TContent | null {
  return patchBackyContentElement(
    content,
    buildBackyContentDownloadFilePatch(elementId, siteId, mediaId, options),
  );
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

  return changed ? refreshBackyEditorCompositionMetadata(nextContent) : null;
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
  if (typeof value === "string") return value;
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
    contentDocument?: BackyContentDocument | Record<string, unknown>;
    themeTokenRefs?: Record<string, string>;
    assets?: unknown[] | Record<string, unknown>;
    animations?: BackyDesignArrayOrRecord;
    interactions?: unknown[] | Record<string, unknown>;
    dataBindings?: Record<string, unknown>;
    editableMap?: Record<string, unknown>;
    seo?: Record<string, unknown>;
    metadata?: Record<string, unknown>;
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

export interface BackyAdminReusableSectionExportOptions
  extends BackyLiveManagementRequestOptions {
  status?: "active" | "archived" | "all" | string;
  category?: string;
  tag?: string;
  search?: string;
  sectionIds?: string[];
}

export interface BackyAdminReusableSectionExportSummary {
  schemaVersion: "backy.reusable-sections.export.v1" | string;
  exportedAt: string;
  siteId: string;
  siteSlug?: string;
  sectionCount: number;
  [key: string]: unknown;
}

export interface BackyAdminReusableSectionExportEntry {
  sourceSectionId?: string;
  name: string;
  slug: string;
  description?: string | null;
  category?: string;
  status?: BackyReusableSection["status"];
  tags?: string[];
  content: BackyReusableSection["content"];
  metadata?: Record<string, unknown>;
  sourceElementId?: string | null;
  [key: string]: unknown;
}

export type BackyAdminReusableSectionExportResponse = BackyEnvelope<
  {
    export: BackyAdminReusableSectionExportSummary;
    sections: BackyAdminReusableSectionExportEntry[];
  } & Record<string, unknown>
>;

export interface BackyAdminReusableSectionImportInput {
  sections: BackyAdminReusableSectionExportEntry[];
  importedBy?: string;
  requestId?: string;
  [key: string]: unknown;
}

export interface BackyAdminReusableSectionImportOptions
  extends BackyLiveManagementRequestOptions {
  upsert?: boolean;
}

export interface BackyAdminReusableSectionImportSummary {
  created: number;
  updated: number;
  total: number;
  [key: string]: unknown;
}

export type BackyAdminReusableSectionImportResponse = BackyEnvelope<
  {
    import: BackyAdminReusableSectionImportSummary;
    sections: BackyReusableSection[];
    cacheInvalidation?: Record<string, unknown>;
  } & Record<string, unknown>
>;

export interface BackyAdminReusableSectionInstance {
  elementId: string;
  elementType: string;
  path: string;
  mode: string;
  sourceUpdatedAt?: string;
  stale: boolean;
  [key: string]: unknown;
}

export interface BackyAdminReusableSectionInstanceTarget {
  type: "page" | "post" | string;
  id: string;
  title: string;
  slug: string;
  status?: string;
  updatedAt?: string;
  instances: BackyAdminReusableSectionInstance[];
  [key: string]: unknown;
}

export interface BackyAdminReusableSectionInstancesOptions
  extends BackyLiveManagementRequestOptions {
  targetType?: "page" | "post" | "all" | string;
  targetId?: string;
}

export type BackyAdminReusableSectionInstancesResponse = BackyEnvelope<
  {
    sectionId: string;
    sourceUpdatedAt?: string;
    targets: BackyAdminReusableSectionInstanceTarget[];
    totals: {
      targets: number;
      instances: number;
      stale: number;
      [key: string]: unknown;
    };
  } & Record<string, unknown>
>;

export interface BackyAdminReusableSectionInstancesRefreshInput {
  targetType?: "page" | "post" | "all" | string;
  targetId?: string;
  dryRun?: boolean;
  updatedBy?: string;
  requestId?: string;
  [key: string]: unknown;
}

export type BackyAdminReusableSectionInstancesRefreshResponse = BackyEnvelope<
  {
    dryRun: boolean;
    sectionId: string;
    sourceUpdatedAt?: string;
    refreshedTargets: Array<{
      type: "page" | "post" | string;
      id: string;
      title: string;
      slug: string;
      refreshed: number;
      [key: string]: unknown;
    }>;
    totals: {
      targets: number;
      instances: number;
      [key: string]: unknown;
    };
    cacheInvalidation?: Record<string, unknown> | null;
  } & Record<string, unknown>
>;

export interface BackyAdminReusableSectionLibraryMetadata {
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

export type BackyAdminReusableSectionMetadataResponse = BackyEnvelope<
  {
    sectionId: string;
    metadata: Record<string, unknown>;
    library: BackyAdminReusableSectionLibraryMetadata;
    version: number;
  } & Record<string, unknown>
>;

export interface BackyAdminReusableSectionMetadataUpdateInput {
  expectedVersion?: number;
  expectedUpdatedAt?: string;
  updatedBy?: string;
  requestId?: string;
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
  [key: string]: unknown;
}

export type BackyAdminReusableSectionMetadataUpdateResponse = BackyEnvelope<
  {
    section: BackyReusableSection;
    metadata: Record<string, unknown>;
    library: BackyAdminReusableSectionLibraryMetadata;
    version: number;
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

export type BackyAdminFormCloneInput = {
  name?: string;
  title?: string;
  isActive?: boolean;
  requestId?: string;
  [key: string]: unknown;
};

export type BackyAdminFormCloneResponse = BackyEnvelope<
  {
    form: BackyFormDefinition;
    sourceFormId?: string;
  } & Record<string, unknown>
>;

export type BackyAdminFormEmbedBlockInput = {
  name?: string;
  slug?: string;
  actor?: string;
  publicBaseUrl?: string;
  requestId?: string;
  [key: string]: unknown;
};

export type BackyAdminFormEmbedBlockResponse = BackyEnvelope<
  {
    section: BackyReusableSection;
    embed?: {
      definitionUrl?: string;
      submitUrl?: string;
      [key: string]: unknown;
    };
    cacheInvalidation?: Record<string, unknown>;
  } & Record<string, unknown>
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

export type BackyAdminFormSubmissionStatus =
  | "pending"
  | "approved"
  | "rejected"
  | "spam"
  | string;

export interface BackyAdminFormSubmissionReviewInput {
  status: BackyAdminFormSubmissionStatus;
  reviewedBy?: string | null;
  adminNotes?: string | null;
  contactShareOverride?: {
    enabled?: boolean;
    nameField?: string;
    emailField?: string;
    phoneField?: string;
    notesField?: string;
    dedupeByEmail?: boolean;
    [key: string]: unknown;
  };
  requestId?: string;
  [key: string]: unknown;
}

export interface BackyAdminFormDeliveryRetryInput {
  requestId?: string;
  [key: string]: unknown;
}

export interface BackyAdminFormDeliveryRetryResult {
  attempted: boolean;
  target?: string;
  status: "queued" | "succeeded" | "failed" | string;
  statusCode?: number;
  provider?: string;
  metadata?: Record<string, unknown>;
  error?: string;
  [key: string]: unknown;
}

export type BackyAdminFormDeliveryRetryResponse = BackyEnvelope<
  {
    delivery: BackyAdminFormDeliveryRetryResult;
    submission: BackyFormSubmission;
  } & Record<string, unknown>
>;

export interface BackyAdminFormConsentRetentionInput {
  dryRun?: boolean;
  now?: string;
  actor?: string;
  requestId?: string;
  [key: string]: unknown;
}

export interface BackyAdminFormConsentRetentionResult {
  formId: string;
  formName?: string;
  dryRun?: boolean;
  policy: {
    deleteAfterDays?: number;
    now?: string;
    [key: string]: unknown;
  };
  consentFieldKeys: string[];
  scanned: number;
  due: number;
  anonymized: number;
  submissions: BackyFormSubmission[];
  [key: string]: unknown;
}

export type BackyAdminFormConsentRetentionResponse = BackyEnvelope<
  BackyAdminFormConsentRetentionResult
>;

export type BackyAdminFormsConsentRetentionResponse = BackyEnvelope<
  {
    dryRun: boolean;
    policy: {
      now: string;
      [key: string]: unknown;
    };
    scannedForms: number;
    formsWithConsent: number;
    scannedSubmissions: number;
    due: number;
    anonymized: number;
    results: BackyAdminFormConsentRetentionResult[];
  } & Record<string, unknown>
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

export interface BackyAdminFormContactInput {
  name?: string | null;
  email?: string | null;
  phone?: string | null;
  notes?: string | null;
  status?: "new" | "contacted" | "qualified" | "archived" | string;
  pageId?: string | null;
  postId?: string | null;
  requestId?: string | null;
  sourceValues?: Record<string, unknown>;
  upsertByEmail?: boolean;
  sourceSubmissionId?: string | null;
  sourceIpHash?: string | null;
  [key: string]: unknown;
}

export interface BackyAdminFormContactImportOptions
  extends BackyLiveManagementRequestOptions {
  upsertByEmail?: boolean;
  upsert?: boolean;
}

export interface BackyAdminFormContactImportError {
  row: number;
  email?: string;
  code?: string;
  message: string;
  details?: unknown;
  [key: string]: unknown;
}

export interface BackyAdminFormContactImportSummary {
  created: number;
  updated: number;
  skipped: number;
  errors: BackyAdminFormContactImportError[];
  [key: string]: unknown;
}

export type BackyAdminFormContactImportResponse = BackyEnvelope<
  {
    formId: string;
    contacts: BackyContact[];
    import: BackyAdminFormContactImportSummary;
  } & Record<string, unknown>
>;

export interface BackyAdminFormContactUserPromotionInput {
  role?: "viewer" | "editor" | string;
  status?: "invited" | "active" | string;
  createInvite?: boolean;
  expiresInMinutes?: number;
  requestId?: string;
  [key: string]: unknown;
}

export type BackyAdminFormContactUserPromotionResponse = BackyEnvelope<
  {
    contact: BackyContact;
    user: BackyAdminUser;
    existingUser: boolean;
    invite?: BackyAdminInviteToken | null;
  } & Record<string, unknown>
>;

export interface BackyAdminFormContactCustomerPromotionInput {
  customerStatus?: "lead" | "customer" | "vip" | "inactive" | string;
  notes?: string;
  requestId?: string;
  [key: string]: unknown;
}

export type BackyAdminFormContactCustomerPromotionResponse<
  TValues extends Record<string, unknown> = Record<string, unknown>,
> = BackyEnvelope<
  {
    contact: BackyContact;
    collection: BackyCollectionSchema;
    record: BackyCollectionRecord<TValues>;
    existingRecord: boolean;
    createdCollection?: boolean;
  } & Record<string, unknown>
>;

export interface BackyAdminFormContactSyncInput {
  contactIds: string[];
  targetUrl: string;
  includeSourceValues?: boolean;
  reason?: string | null;
  requestId?: string;
  [key: string]: unknown;
}

export interface BackyAdminFormContactSyncDelivery {
  target: string;
  status: "queued" | "succeeded" | "failed" | string;
  statusCode?: number | null;
  error?: string | null;
  count: number;
  contactIds: string[];
  [key: string]: unknown;
}

export type BackyAdminFormContactSyncResponse = BackyEnvelope<
  {
    formId: string;
    delivery: BackyAdminFormContactSyncDelivery;
  } & Record<string, unknown>
>;

export interface BackyAdminFormContactConsentRetentionInput {
  contactIds?: string[];
  dryRun?: boolean;
  retentionDays?: number;
  now?: string;
  actor?: string;
  requestId?: string;
  [key: string]: unknown;
}

export interface BackyAdminFormContactConsentEvidence {
  id: string;
  formId: string;
  pageId?: string | null;
  postId?: string | null;
  status: string;
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
  [key: string]: unknown;
}

export type BackyAdminFormContactConsentRetentionResponse = BackyEnvelope<
  {
    formId: string;
    dryRun: boolean;
    policy: {
      deleteAfterDays: number;
      now: string;
      [key: string]: unknown;
    };
    consentFieldKeys: string[];
    scanned: number;
    due: number;
    anonymized: number;
    contacts: BackyAdminFormContactConsentEvidence[];
  } & Record<string, unknown>
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
  authorName?: string | null;
  authorEmail?: string | null;
  authorWebsite?: string | null;
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

export interface BackyCommentDeliveryRetryInput {
  eventId: string;
  requestId?: string;
  [key: string]: unknown;
}

export interface BackyCommentDeliveryRetryAttempt {
  attempted: boolean;
  channel?: "webhook" | "email" | string;
  target?: string;
  status: "queued" | "succeeded" | "failed" | string;
  statusCode?: number;
  provider?: string;
  metadata?: Record<string, unknown>;
  error?: string;
  [key: string]: unknown;
}

export type BackyCommentDeliveryRetryResponse = BackyEnvelope<
  {
    delivery: BackyCommentDeliveryRetryAttempt;
    retryOf: string;
    comment: BackyComment;
  } & Record<string, unknown>
>;

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

export interface BackyAdminMediaVersion {
  id?: string;
  filename?: string;
  originalName?: string;
  mimeType?: string;
  sizeBytes?: number;
  type?: BackyMediaAsset["type"] | string;
  url?: string;
  thumbnailUrl?: string | null;
  storagePath?: string | null;
  storageProvider?: string | null;
  createdAt?: string;
  replacedAt?: string;
  replacedBy?: string | null;
  reason?: string | null;
  metadata?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface BackyAdminMediaVersionsOptions
  extends BackyLiveManagementRequestOptions,
    BackyListOptions {}

export type BackyAdminMediaVersionsResponse = BackyEnvelope<
  {
    mediaId: string;
    source: "database" | "metadata" | string;
    versions: BackyAdminMediaVersion[];
    pagination: BackyPagination;
    [key: string]: unknown;
  }
>;

export interface BackyAdminMediaVersionRestoreInput {
  restoredBy?: string;
  reason?: string;
  requestId?: string;
  [key: string]: unknown;
}

export type BackyAdminMediaVersionRestoreResponse = BackyEnvelope<
  {
    restored: boolean;
    mediaId: string;
    versionId: string;
    source: "database" | "metadata" | string;
    media: BackyMediaAsset;
    restoredVersion: BackyAdminMediaVersion;
    retainedVersion?: BackyAdminMediaVersion;
    cacheInvalidation?: Record<string, unknown>;
    [key: string]: unknown;
  }
>;

export type BackyAdminMediaVersionDeleteResponse = BackyEnvelope<
  {
    deleted: boolean;
    mediaId: string;
    versionId: string;
    source: "database" | "metadata" | string;
    version: BackyAdminMediaVersion;
    media: BackyMediaAsset;
    cacheInvalidation?: Record<string, unknown>;
    [key: string]: unknown;
  }
>;

export interface BackyAdminMediaTransformInput {
  widths?: number[];
  quality?: number;
  sizes?: string;
  preparedBy?: string;
  requestId?: string;
  [key: string]: unknown;
}

export type BackyAdminMediaTransformsResponse = BackyEnvelope<
  {
    media: BackyMediaAsset;
    responsive: Record<string, unknown>;
    quota?: BackyMediaQuota;
    cacheInvalidation?: Record<string, unknown>;
    [key: string]: unknown;
  }
>;

export interface BackyAdminMediaProviderAnalyticsEntry {
  mediaId?: string;
  storagePath?: string;
  url?: string;
  totalRequests?: number;
  requests?: number;
  bytesServed?: number;
  bytes?: number;
  conversions?: number;
  conversionCount?: number;
  conversionValue?: number;
  revenue?: number;
  value?: number;
  source?: string;
  reportingWindow?: string;
  currency?: string;
  attributionWindow?: string;
  lastDeliveredAt?: string;
  [key: string]: unknown;
}

export interface BackyAdminMediaProviderAnalyticsInput {
  source?: string;
  reportingWindow?: string;
  mergeMode?: "replace" | "increment";
  currency?: string;
  attributionWindow?: string;
  entries: BackyAdminMediaProviderAnalyticsEntry[];
  requestId?: string;
  [key: string]: unknown;
}

export interface BackyAdminMediaProviderAnalyticsMatch {
  mediaId: string;
  matchedBy: string;
  totalRequests: number;
  bytesServed: number;
  conversions: number;
  conversionValue: number;
  [key: string]: unknown;
}

export type BackyAdminMediaProviderAnalyticsResponse = BackyEnvelope<
  {
    source: string;
    reportingWindow: string;
    mergeMode: "replace" | "increment" | string;
    matchedCount: number;
    unmatchedCount: number;
    matched: BackyAdminMediaProviderAnalyticsMatch[];
    unmatched: BackyAdminMediaProviderAnalyticsEntry[];
    cacheInvalidation?: Record<string, unknown>;
    [key: string]: unknown;
  }
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
  expiresIn?: number | string;
  ttlSeconds?: number | string;
  ttl?: number | string;
  maxAge?: number | string;
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

export type BackyMediaFileDisposition = BackyMediaSignedUrlDisposition;

export interface BackyMediaFileUrlAccess {
  siteId?: string;
  token?: string;
  expiresAt?: number | string;
  disposition?: BackyMediaFileDisposition | string;
}

export interface BackyMediaFileUrlOptions extends BackyMediaFileUrlAccess {
  baseUrl?: string;
}

export interface BackyMediaFileCachedOptions
  extends BackyMediaFileUrlAccess,
    BackyConditionalRequestOptions {}

export type BackyMediaFileCachedResult = BackyConditionalResult<ArrayBuffer>;

export interface BackyMediaTransformUrlOptions {
  siteId?: string;
  baseUrl?: string;
  width: number;
  quality?: number;
}

export interface BackyMediaTransformCachedOptions
  extends BackyConditionalRequestOptions {
  width: number;
  quality?: number;
}

export type BackyMediaTransformCachedResult = BackyConditionalResult<null>;

export interface BackyMediaDownloadLinkPropsOptions extends BackyMediaFileUrlOptions {
  href?: string;
  url?: string;
  fileMediaName?: string;
  mediaName?: string;
  fileName?: string;
  filename?: string;
  name?: string;
  fileMediaType?: string;
  mediaType?: string;
  fileMediaVisibility?: string;
  visibility?: string;
  fileSignedUrlRequired?: boolean;
  signedUrlRequired?: boolean;
  targetBlank?: boolean;
  signedUrlEndpoint?: string;
}

export interface BackyMediaDownloadLinkProps {
  href: string;
  target: "_blank" | "_self";
  rel: "noopener noreferrer" | "";
  download: true;
  fileId: string;
  fileIds: string[];
  fileMediaId: string;
  fileMediaIds: string[];
  downloadMediaId: string;
  downloadMediaIds: string[];
  fileMediaUrl: string;
  fileUrl: string;
  fileMediaName?: string;
  fileMediaType?: string;
  fileMediaVisibility?: string;
  fileDownloadDisposition: "attachment";
  fileSignedUrlRequired?: boolean;
  fileSignedUrlEndpoint: string;
  fileName?: string;
  [key: string]: unknown;
}

export type BackyContentDownloadFilePatchOptions =
  BackyMediaDownloadLinkPropsOptions;

const BACKY_DOWNLOAD_FILE_PROP_PATCH_KEYS = [
  "href",
  "target",
  "rel",
  "download",
  "fileId",
  "fileIds",
  "fileMediaId",
  "fileMediaIds",
  "downloadMediaId",
  "downloadMediaIds",
  "fileMediaUrl",
  "fileUrl",
  "fileMediaName",
  "fileMediaType",
  "fileMediaVisibility",
  "fileDownloadDisposition",
  "fileSignedUrlRequired",
  "fileSignedUrlEndpoint",
  "fileName",
] as const;

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
      options.expiresIn ??
      options.ttlSeconds ??
      options.ttl ??
      options.maxAge ??
      body.expiresInSeconds ??
      body.expiresIn ??
      body.ttlSeconds ??
      body.ttl ??
      body.maxAge ??
      access.expiresInSeconds ??
      access.expiresIn ??
      access.ttlSeconds ??
      access.ttl ??
      access.maxAge ??
      delivery.expiresInSeconds ??
      delivery.expiresIn ??
      delivery.ttlSeconds ??
      delivery.ttl ??
      delivery.maxAge,
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

const normalizeBackyMediaFileExpiresAt = (value: unknown): number | undefined => {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.trunc(value);
  }
  const text = backyMediaBindingText(value);
  if (!text) return undefined;
  const parsed = Number(text);
  return Number.isFinite(parsed) ? Math.trunc(parsed) : undefined;
};

export function buildBackyMediaFilePath(
  siteId: string,
  mediaId: string,
  access: BackyMediaFileUrlAccess = {},
): string {
  const searchParams = new URLSearchParams();
  const token = backyMediaBindingText(access.token);
  const expiresAt = normalizeBackyMediaFileExpiresAt(access.expiresAt);
  const disposition = normalizeBackyMediaSignedUrlDisposition(access.disposition);
  if (token) searchParams.set("token", token);
  if (expiresAt !== undefined) searchParams.set("expiresAt", String(expiresAt));
  if (disposition) searchParams.set("disposition", disposition);
  const query = searchParams.toString();
  return `/api/sites/${encodeURIComponent(siteId)}/media/${encodeURIComponent(mediaId)}/file${query ? `?${query}` : ""}`;
}

export function buildBackyMediaFileUrl(
  baseUrl: string,
  siteId: string,
  mediaId: string,
  access: BackyMediaFileUrlAccess = {},
): string {
  const normalizedBaseUrl = baseUrl.replace(/\/$/, "");
  return `${normalizedBaseUrl}${buildBackyMediaFilePath(siteId, mediaId, access)}`;
}

export function buildBackyMediaTransformPath(
  siteId: string,
  mediaId: string,
  options: Pick<BackyMediaTransformUrlOptions, "width" | "quality">,
): string {
  const searchParams = new URLSearchParams({
    width: String(options.width),
  });
  if (options.quality !== undefined) {
    searchParams.set("quality", String(options.quality));
  }
  return `/api/sites/${encodeURIComponent(siteId)}/media/${encodeURIComponent(mediaId)}/transform?${searchParams.toString()}`;
}

export function buildBackyMediaTransformUrl(
  baseUrl: string,
  siteId: string,
  mediaId: string,
  options: Pick<BackyMediaTransformUrlOptions, "width" | "quality">,
): string {
  const normalizedBaseUrl = baseUrl.replace(/\/$/, "");
  return `${normalizedBaseUrl}${buildBackyMediaTransformPath(siteId, mediaId, options)}`;
}

export function buildBackyMediaDownloadLinkProps(
  siteId: string,
  mediaId: string,
  options: BackyMediaDownloadLinkPropsOptions = {},
): BackyMediaDownloadLinkProps {
  const explicitHref = backyMediaBindingText(options.href, options.url);
  const href = explicitHref || (options.baseUrl
    ? buildBackyMediaFileUrl(options.baseUrl, siteId, mediaId, {
      ...options,
      disposition: "attachment",
    })
    : buildBackyMediaFilePath(siteId, mediaId, {
      ...options,
      disposition: "attachment",
    }));
  const fileName = backyMediaBindingText(
    options.fileName,
    options.fileMediaName,
    options.mediaName,
    options.filename,
    options.name,
  );
  const fileMediaType = backyMediaBindingText(options.fileMediaType, options.mediaType);
  const fileMediaVisibility = backyMediaBindingText(options.fileMediaVisibility, options.visibility);
  const fileSignedUrlRequired = options.fileSignedUrlRequired === true ||
    options.signedUrlRequired === true ||
    fileMediaVisibility === "private";
  const signedUrlEndpoint = backyMediaBindingText(options.signedUrlEndpoint) ||
    `/api/admin/sites/${encodeURIComponent(siteId)}/media/${encodeURIComponent(mediaId)}/signed-url`;
  const target = options.targetBlank ? "_blank" : "_self";

  return {
    href,
    target,
    rel: target === "_blank" ? "noopener noreferrer" : "",
    download: true,
    fileId: mediaId,
    fileIds: [mediaId],
    fileMediaId: mediaId,
    fileMediaIds: [mediaId],
    downloadMediaId: mediaId,
    downloadMediaIds: [mediaId],
    fileMediaUrl: href,
    fileUrl: href,
    ...(fileName ? { fileMediaName: fileName } : {}),
    ...(fileMediaType ? { fileMediaType } : {}),
    ...(fileMediaVisibility ? { fileMediaVisibility } : {}),
    fileDownloadDisposition: "attachment",
    ...(fileSignedUrlRequired ? { fileSignedUrlRequired: true } : {}),
    fileSignedUrlEndpoint: signedUrlEndpoint,
    ...(fileName ? { fileName } : {}),
  };
}

export function buildBackyContentDownloadFilePatch(
  elementId: string,
  siteId: string,
  mediaId: string,
  options: BackyContentDownloadFilePatchOptions = {},
): BackyContentElementPatch {
  const props = buildBackyMediaDownloadLinkProps(siteId, mediaId, options);
  const changes = BACKY_DOWNLOAD_FILE_PROP_PATCH_KEYS.reduce<Record<string, unknown>>((acc, key) => {
    acc[`props.${key}`] = props[key];
    return acc;
  }, {});

  return {
    elementId,
    changes,
  };
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
  captchaToken?: string;
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
  "captcha",
  "captchaToken",
  "turnstileToken",
  "hcaptchaToken",
  "recaptchaToken",
  "g-recaptcha-response",
  "cf-turnstile-response",
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

  if (requestId) input.requestId = requestId;
  if (pageId) input.pageId = pageId;
  if (postId) input.postId = postId;
  if (honeypot) input.honeypot = honeypot;
  if (typeof startedAt === "string" || typeof startedAt === "number") {
    input.startedAt = startedAt;
  }
  if (captchaToken) {
    input.captchaToken = captchaToken;
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

export type BackySiteCommentsResponse = BackyEnvelope<{
  comments: BackyComment[];
  count: number;
  pagination?: BackyPagination;
}>;

export type BackyCommentBulkUpdateResponse = BackyEnvelope<{
  siteId?: string;
  updated: BackyComment[];
  updatedCount?: number;
  missingIds?: string[];
}>;

export type BackyCommentBlocklistResponse = BackyEnvelope<{
  siteId?: string;
  blocklist: BackyCommentBlocklistEntry[];
  count: number;
  pagination?: BackyPagination;
}>;

export type BackyCommentBlocklistDeleteResponse = BackyEnvelope<{
  siteId?: string;
  deleted: BackyCommentBlocklistEntry[];
  deletedCount?: number;
  missingIds?: string[];
}>;

export type BackySiteCommentResponse = BackyEnvelope<{
  comment: BackyComment;
}>;

export type BackyCommentDeleteResponse = BackyEnvelope<{
  deleted: BackyComment[];
  deletedCount: number;
}>;

export interface BackyCommentAnalyticsOptions
  extends BackyLiveManagementRequestOptions {
  days?: number;
  targetType?: "page" | "post" | "all";
  targetId?: string;
}

export interface BackyCommentAnalyticsStatusCounts {
  pending: number;
  approved: number;
  rejected: number;
  spam: number;
  blocked: number;
  [key: string]: unknown;
}

export interface BackyCommentAnalyticsTarget {
  targetType: "page" | "post" | string;
  targetId: string;
  total: number;
  pending: number;
  reported: number;
  replies: number;
  [key: string]: unknown;
}

export interface BackyCommentAnalyticsThread
  extends BackyCommentAnalyticsTarget {
  id: string;
  latestAt: string;
}

export interface BackyCommentAnalytics {
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
    [key: string]: unknown;
  };
  byStatus: BackyCommentAnalyticsStatusCounts;
  reports: {
    comments: number;
    reasons: Array<{ reason: string; count: number; [key: string]: unknown }>;
    [key: string]: unknown;
  };
  threads: {
    total: number;
    withReplies: number;
    reported: number;
    pendingReplies: number;
    top: BackyCommentAnalyticsThread[];
    [key: string]: unknown;
  };
  targets: BackyCommentAnalyticsTarget[];
  daily: Array<{
    date: string;
    submitted: number;
    reviewed: number;
    reported: number;
    [key: string]: unknown;
  }>;
  [key: string]: unknown;
}

export type BackyCommentAnalyticsResponse = BackyEnvelope<
  {
    analytics: BackyCommentAnalytics;
  } & Record<string, unknown>
>;

export interface BackyEventListOptions extends BackyListOptions {
  kind?: string;
  siteId?: string;
  formId?: string;
  commentId?: string;
  contactId?: string;
  eventRequestId?: string;
}

export type BackyAdminSiteEventKind =
  | "form-submission"
  | "contact-shared"
  | "contact-sync"
  | "contact-status"
  | "commerce-order"
  | "commerce-product"
  | "commerce-webhook"
  | "comment-submitted"
  | "comment-status"
  | "comment-reported"
  | "interactive-runtime"
  | "all"
  | string;

export interface BackyAdminSiteEventListOptions
  extends BackyLiveManagementRequestOptions {
  kind?: BackyAdminSiteEventKind;
  formId?: string;
  commentId?: string;
  contactId?: string;
  eventRequestId?: string;
  limit?: number;
  offset?: number;
}

export type BackyAdminSiteEventsResponse = BackyEnvelope<
  {
    siteId: string;
    events: BackyInteractionEvent[];
    count: number;
    pagination?: BackyPagination;
  } & Record<string, unknown>
>;

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
    designReadiness?: BackyCommerceProductDesignReadiness;
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

export type BackyRenderRoute = Record<string, unknown> & {
  type:
    | "page"
    | "post"
    | "dynamicList"
    | "dynamicItem"
    | "redirect"
    | "notFound"
    | "gone"
    | string;
  path?: string;
  status?: string;
  canonical?: string;
  params?: Record<string, string>;
  dataset?: Record<string, unknown> | null;
  resource?: Record<string, unknown> & {
    frontendDesign?: BackyFrontendDesignProvenance;
    collectionFrontendDesign?: BackyFrontendDesignProvenance;
    designReadiness?: BackyCommerceProductDesignReadiness;
  };
};

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
    authenticatedManagement: boolean;
    pageCreation: boolean;
    templateCloning: boolean;
    readinessChecks: boolean;
    publishArchive: boolean;
    revisionHistory: boolean;
    conditionalRequests: boolean;
    cacheablePages: boolean;
    [key: string]: unknown;
  };
  managementPolicy: BackyManifestContentManagementPolicy;
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
    authenticatedManagement: boolean;
    postCreation: boolean;
    templateCloning: boolean;
    readinessChecks: boolean;
    publishArchive: boolean;
    revisionHistory: boolean;
    conditionalRequests: boolean;
    cacheablePosts: boolean;
    [key: string]: unknown;
  };
  managementPolicy: BackyManifestContentManagementPolicy;
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

export interface BackyManifestFormsManagementPolicy {
  schemaVersion: "backy.forms-management.v1";
  endpoints: {
    adminList: string;
    create: string;
    detail: string;
    clone: string;
    embedBlock: string;
    analytics: string;
    contactSegments: string;
    contactLists: string;
    consentRetention: string;
    submissions: string;
    submission: string;
    reviewSubmission: string;
    retryWebhook: string;
    retryEmail: string;
    formConsentRetention: string;
    contacts: string;
    contact: string;
    importContacts: string;
    syncContacts: string;
    promoteContactUser: string;
    promoteContactCustomer: string;
    contactConsentRetention: string;
    [key: string]: unknown;
  };
  methods: {
    list: "GET";
    create: "POST";
    update: "PATCH";
    delete: "DELETE";
    clone: "POST";
    embedBlock: "POST";
    analytics: "GET";
    contactSegments: "GET";
    contactLists: "GET";
    saveContactList: "POST";
    deleteContactList: "DELETE";
    consentRetention: "POST";
    submissions: "GET";
    submission: "GET";
    updateSubmission: "PATCH";
    reviewSubmission: "POST";
    retryWebhook: "POST";
    retryEmail: "POST";
    formConsentRetention: "POST";
    contacts: "GET";
    createContact: "POST";
    updateContact: "PATCH";
    deleteContact: "DELETE";
    importContacts: "POST";
    syncContacts: "POST";
    promoteContactUser: "POST";
    promoteContactCustomer: "POST";
    contactConsentRetention: "POST";
    [key: string]: unknown;
  };
  auth: {
    modes: Array<"session" | "api-key">;
    headers: string[];
    requiredPermissions: {
      read: "forms.view";
      create: "forms.create";
      update: "forms.edit";
      manage: "forms.manage";
      export: "forms.export";
      delete: "forms.delete";
      activity: "activity.export";
      [key: string]: unknown;
    };
    siteScope: true;
    [key: string]: unknown;
  };
  sdkHelpers: {
    list: "adminForms";
    create: "createAdminForm";
    detail: "adminForm";
    update: "updateAdminForm";
    delete: "deleteAdminForm";
    clone: "cloneAdminForm";
    embedBlock: "createAdminFormEmbedBlock";
    analytics: "formsAnalytics";
    contactSegments: "formContactSegments";
    contactLists: "formContactLists";
    saveContactList: "saveFormContactList";
    deleteContactList: "deleteFormContactList";
    submissions: "formSubmissions";
    submission: "formSubmission";
    updateSubmission: "updateFormSubmission";
    reviewSubmission: "reviewFormSubmission";
    retryWebhook: "retryFormSubmissionWebhook";
    retryEmail: "retryFormSubmissionEmail";
    formConsentRetention: "applyAdminFormConsentRetention";
    formsConsentRetention: "applyAdminFormsConsentRetention";
    contacts: "formContacts";
    createContact: "createFormContact";
    updateContact: "updateFormContact";
    importContacts: "importFormContactsCsv";
    syncContacts: "syncFormContacts";
    promoteContactUser: "promoteFormContactToUser";
    promoteContactCustomer: "promoteFormContactToCustomer";
    contactConsentRetention: "applyFormContactConsentRetention";
    [key: string]: unknown;
  };
  responseContracts: {
    list: "backy.admin-forms.v1";
    item: "backy.admin-form.v1";
    persistenceCertification: "backy.forms-persistence-certification.v1";
    scenarioEvidence: "backy.forms-persistence-scenario-evidence.v1";
    embedBlock: "backy.form-embed-block.v1";
    submissions: "backy.form-submissions.v1";
    submission: "backy.form-submission.v1";
    deliveryRetry: "backy.form-delivery-retry.v1";
    contacts: "backy.form-contacts.v1";
    contact: "backy.form-contact.v1";
    contactSegments: "backy.form-contact-segments.v1";
    contactLists: "backy.form-contact-lists.v1";
    consentRetention: "backy.form-consent-retention.v1";
    [key: string]: unknown;
  };
  privacy: {
    publicDefinitionsExcludeSubmissions: true;
    submissionsArePrivate: true;
    contactsArePrivate: true;
    deliveryRetriesMayContainVisitorPayloads: true;
    databaseCredentialsNeverReturned: true;
    [key: string]: unknown;
  };
  secretHandling: string;
  [key: string]: unknown;
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
    authenticatedManagement: boolean;
    formBuilderManagement: boolean;
    submissionModeration: boolean;
    contactCrm: boolean;
    deliveryRetries: boolean;
    consentRetention: boolean;
    persistenceCertification: boolean;
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
  managementPolicy: BackyManifestFormsManagementPolicy;
  schemas: {
    definition: "backy.form-definition.v1";
    validationError: "FORM_VALIDATION_ERROR";
    collectionRecordLink: "backy.form-collection-record-link.v1";
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

export interface BackyManifestMediaManagementPolicy {
  schemaVersion: "backy.media-management.v1";
  endpoints: {
    adminList: string;
    upload: string;
    detail: string;
    folders: string;
    folderDetail: string;
    versions: string;
    version: string;
    signedUrl: string;
    bind: string;
    transforms: string;
    providerAnalytics: string;
    [key: string]: unknown;
  };
  methods: {
    list: "GET";
    upload: "POST";
    update: "PATCH";
    replace: "POST";
    delete: "DELETE";
    folders: "GET";
    createFolder: "POST";
    updateFolder: "PATCH";
    deleteFolder: "DELETE";
    versions: "GET";
    restoreVersion: "POST";
    deleteVersion: "DELETE";
    signedUrl: "POST";
    bind: "POST";
    transforms: "POST";
    providerAnalytics: "POST";
    [key: string]: unknown;
  };
  auth: {
    modes: Array<"session" | "api-key">;
    headers: string[];
    requiredPermissions: {
      read: "media.view";
      create: "media.create";
      update: "media.edit";
      delete: "media.delete";
      privateDelivery: "media.view";
      [key: string]: unknown;
    };
    siteScope: true;
    [key: string]: unknown;
  };
  uploadFields: string[];
  filters: {
    types: Array<"image" | "video" | "audio" | "document" | "file" | "font" | "other" | "all">;
    typeAliases: {
      file: Array<"document" | "other">;
      [key: string]: unknown;
    };
    visibility: Array<"public" | "private" | "all">;
    scopes: Array<"global" | "page" | "post" | "all">;
    queryParams: string[];
    maxLimit: 100;
    aliases: {
      blogId: "postId";
      fileType: "file";
      [key: string]: unknown;
    };
    [key: string]: unknown;
  };
  sdkHelpers: {
    list: "adminMedia";
    upload: "uploadMedia";
    update: "updateAdminMedia";
    replace: "replaceMedia";
    delete: "deleteAdminMedia";
    folders: "adminMediaFolders";
    createFolder: "createMediaFolder";
    updateFolder: "updateMediaFolder";
    deleteFolder: "deleteMediaFolder";
    versions: "adminMediaVersions";
    restoreVersion: "restoreMediaVersion";
    deleteVersion: "deleteMediaVersion";
    signedUrl: "createMediaSignedUrl";
    bind: "bindMedia";
    transforms: "prepareMediaTransforms";
    providerAnalytics: "ingestMediaProviderAnalytics";
    [key: string]: unknown;
  };
  responseContracts: {
    list: "backy.admin-media-list.v1";
    item: "backy.admin-media.v1";
    folders: "backy.media-folders.v1";
    versions: "backy.media-versions.v1";
    signedUrl: "backy.media-signed-url.v1";
    binding: "backy.media-binding.v1";
    transforms: "backy.media-transforms.v1";
    [key: string]: unknown;
  };
  auditing: {
    create: "media.created";
    update: "media.updated";
    replace: "media.replaced";
    delete: "media.deleted";
    bind: "media.bound";
    unbind: "media.unbound";
    [key: string]: unknown;
  };
  secretHandling: string;
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
    authenticatedUpload: boolean;
    folderManagement: boolean;
    retainedVersions: boolean;
    responsiveTransformPreparation: boolean;
    bindingMetadata: boolean;
    providerAnalyticsIngestion: boolean;
    [key: string]: unknown;
  };
  filters: {
    types: string[];
    typeAliases: {
      file: Array<"document" | "other">;
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
      fileType: "file";
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
  managementPolicy: BackyManifestMediaManagementPolicy;
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
  tokenReferences: Record<string, string>;
  styleSheet: string;
  selectors: {
    root: string;
    scoped: string;
    [key: string]: unknown;
  };
  inheritance: {
    elementTokenRefPath: "tokenRefs";
    documentTokenRefPath?: "themeTokenRefs";
    legacyElementTokenRefPath?: "themeTokenRefs";
    fallbackOrder: string[];
    supportedElementPaths: string[];
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
    styleSheet: boolean;
    tokenReferences: boolean;
    perBlockTokenRefs: boolean;
    animationTokenRefs: boolean;
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

export interface BackyManifestEditorCompositionCommand {
  id: "add" | "duplicate" | "delete" | "move" | "resize" | "group" | "ungroup";
  label: string;
  shortcut: string;
  sdkHelper:
    | "addBackyContentElement"
    | "duplicateBackyContentElement"
    | "deleteBackyContentElements"
    | "transformBackyContentElements"
    | "groupBackyContentElements"
    | "ungroupBackyContentElements";
  minSelected: number;
  sameParentRequired: boolean;
  unlockedRequired: boolean;
  mutates?: string[];
  createsEditorGroup?: boolean;
  editorGroupRequired?: boolean;
  preservesResponsiveGeometry: boolean;
  [key: string]: unknown;
}

export interface BackyManifestEditorCommandRegistryCommand {
  id: string;
  label: string;
  category:
    | "history"
    | "selection"
    | "clipboard"
    | "composition"
    | "layer-state"
    | "layer-order"
    | "layout"
    | "view"
    | "shell"
    | "workflow";
  targetScope:
    | "canvas"
    | "selected-layer"
    | "selected-layers"
    | "selected-sibling-scope"
    | "selected-child-scope"
    | "selected-container"
    | "viewport"
    | "shell"
    | "document";
  testId: string;
  shortcut?: string;
  ariaKeyshortcuts?: string;
  minSelected?: number;
  sameParentRequired?: boolean;
  unlockedRequired?: boolean;
  editorGroupRequired?: boolean;
  sdkHelper?: string;
  apiHelper?: string;
  mutates?: string[];
  targetPaths?: string[];
  stateRule: string;
  [key: string]: unknown;
}

export interface BackyManifestEditorCommandRegistry {
  schemaVersion: "backy.editor-command-registry.v1";
  source: "live-management-discovery";
  generatedFrom: "page-editor";
  stateModel: {
    runtimeState: "computed-by-editor-client";
    stateValues: Array<"ready" | "disabled" | "hidden">;
    reasonField: "reason";
    selectionFields: string[];
    clipboardFields: string[];
    documentFields: string[];
    [key: string]: unknown;
  };
  categories: Array<{
    id: string;
    label: string;
    commandIds: string[];
    [key: string]: unknown;
  }>;
  commands: BackyManifestEditorCommandRegistryCommand[];
  privacy: {
    includesSecretValues: false;
    includesAdminSessionValues: false;
    endpointTemplatesOnly: true;
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

export interface BackyManifestEditorComposition {
  schemaVersion: "backy.editor-composition-commands.v1";
  sdkHelpers: {
    listElements: "listBackyContentElements";
    findElement: "findBackyContentElement";
    addElement: "addBackyContentElement";
    duplicateElement: "duplicateBackyContentElement";
    deleteElements: "deleteBackyContentElements";
    transformElements: "transformBackyContentElements";
    group: "groupBackyContentElements";
    ungroup: "ungroupBackyContentElements";
    patchElement: "patchBackyContentElement";
    patchElements: "patchBackyContentElements";
    buildPageUpdate: "buildBackyLiveManagedPageEditableMapUpdate";
    buildBlogPostUpdate: "buildBackyLiveManagedBlogPostEditableMapUpdate";
    [key: string]: unknown;
  };
  commands: BackyManifestEditorCompositionCommand[];
  commandRegistry: BackyManifestEditorCommandRegistry;
  constraints: {
    sameParentRequired: true;
    lockedLayersBlocked: true;
    editorGroupMarker: "props.editorGroup";
    responsiveBreakpoints: Array<"tablet" | "mobile">;
    updateTarget: "content";
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

export interface BackyManifestContentLifecycleCommands {
  schemaVersion: "backy.content-lifecycle-commands.v1";
  cloneField: "frontendDesignTemplateId";
  permissions: {
    read: "pages.view";
    create: "pages.edit";
    update: "pages.edit";
    delete: "pages.delete";
    publish: "pages.publish";
    [key: string]: unknown;
  };
  sdkHelpers: {
    listPages: "adminPages";
    createPage: "createAdminPage";
    readPage: "adminPage";
    updatePage: "updateAdminPage";
    deletePage: "deleteAdminPage";
    pageReadiness: "adminPageReadiness";
    publishPage: "publishAdminPage";
    archivePage: "archiveAdminPage";
    createPagePreview: "createAdminPagePreviewToken";
    pageRevisions: "adminPageRevisions";
    rollbackPage: "rollbackAdminPage";
    listPosts: "adminBlogPosts";
    createPost: "createAdminBlogPost";
    readPost: "adminBlogPost";
    updatePost: "updateAdminBlogPost";
    deletePost: "deleteAdminBlogPost";
    postReadiness: "adminBlogPostReadiness";
    publishPost: "publishAdminBlogPost";
    archivePost: "archiveAdminBlogPost";
    createPostPreview: "createAdminBlogPostPreviewToken";
    postRevisions: "adminBlogPostRevisions";
    rollbackPost: "rollbackAdminBlogPost";
    [key: string]: unknown;
  };
  requestBodies: Record<string, Record<string, string>>;
  responseContracts: {
    pageRevisions: "backy.admin-page-revisions.v1" | string;
    postRevisions: "backy.admin-blog-post-revisions.v1" | string;
    revisionBranchMetadata: "backy.content-revision-branch-metadata.v1" | string;
    branchMetadataField: "revision.branchMetadata" | string;
    pageRollbackRequest: "backy.admin-page-rollback-request.v1" | string;
    postRollbackRequest: "backy.admin-blog-post-rollback-request.v1" | string;
    [key: string]: string;
  };
  [key: string]: unknown;
}

export interface BackyManifestContentManagementPolicy {
  schemaVersion: "backy.pages-management.v1" | "backy.blog-management.v1" | string;
  cloneField: "frontendDesignTemplateId";
  endpoints: {
    list: string;
    create: string;
    detail: string;
    readiness: string;
    publish: string;
    archive: string;
    preview: string;
    revisions: string;
    rollback: string;
    templateRegistry: string;
    [key: string]: unknown;
  };
  methods: {
    list: "GET";
    create: "POST";
    read: "GET";
    update: "PATCH";
    delete: "DELETE";
    readiness: "GET";
    publish: "POST";
    archive: "POST";
    preview: "POST";
    revisions: "GET";
    rollback: "POST";
    [key: string]: unknown;
  };
  auth: {
    modes: Array<"session" | "api-key">;
    headers: string[];
    requiredPermissions: {
      read: "pages.view";
      create: "pages.edit";
      update: "pages.edit";
      delete: "pages.delete";
      publish: "pages.publish";
      [key: string]: unknown;
    };
    siteScope: true;
    [key: string]: unknown;
  };
  sdkHelpers: Record<string, string>;
  responseContracts: Record<string, string>;
  designState: {
    acceptsContentDocument: boolean;
    acceptsCanvasElements: boolean;
    acceptsFrontendDesignTemplateId: boolean;
    preservesCustomCssJs: boolean;
    preservesAssetsAnimationsInteractions: boolean;
    preservesEditableMapAndDataBindings: boolean;
    [key: string]: unknown;
  };
  privacy: {
    routesRequireAuthenticatedAdmin: boolean;
    publicManifestExposesEndpointTemplatesOnly: boolean;
    adminSessionsAndApiKeysNeverReturned: boolean;
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
    editorComposition: boolean;
    editorGrouping: boolean;
    [key: string]: unknown;
  };
  editableTargets: string[];
  lifecycle: BackyManifestContentLifecycleCommands;
  editorComposition: BackyManifestEditorComposition;
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

export type BackySettingsProviderCertificationEvidence =
  GeneratedBackyOpenApiAdminSettingsProviderCertificationEvidence &
    Record<string, unknown>;

export type BackySettingsProviderCertificationEvidencePacket =
  GeneratedBackyOpenApiAdminSettingsProviderCertificationEvidencePacket &
    Record<string, unknown>;

export type BackySettingsProviderCertification =
  GeneratedBackyOpenApiAdminSettingsProviderCertification &
    Record<string, unknown>;

export type BackySettingsMediaStorageHandoff =
  GeneratedBackyOpenApiAdminSettingsMediaStorageHandoff &
    Record<string, unknown>;

export type BackySettingsThemeDesignImpact =
  GeneratedBackyOpenApiAdminSettingsThemeDesignImpact &
    Record<string, unknown>;

export type BackyAdminSettings = GeneratedBackyOpenApiAdminSettings &
  Record<string, unknown>;

export type BackySiteSettingsScope =
  GeneratedBackyOpenApiAdminSiteSettingsScope & Record<string, unknown>;

export type BackyAdminSettingsResponse =
  GeneratedBackyOpenApiAdminSettingsEnvelope &
    BackyEnvelope<{
      settings: BackyAdminSettings;
    }>;

export type BackyAdminSettingsActionResponse =
  GeneratedBackyOpenApiAdminSettingsActionEnvelope &
    BackyEnvelope<{
      settings: BackyAdminSettings;
      [key: string]: unknown;
    }>;

export interface BackyAdminIssuedApiKey {
  id: string;
  label: string;
  adminApiKey: string;
  keyFingerprint?: string | null;
  keyPrefix?: string | null;
  [key: string]: unknown;
}

export type BackyAdminSettingsIssueApiKeyResponse = BackyEnvelope<{
  settings: BackyAdminSettings;
  issuedKey: BackyAdminIssuedApiKey;
  [key: string]: unknown;
}>;

export interface BackyAdminSettingsRegenerateApiKeysInput {
  scope?: "all" | "public" | "admin";
  requestId?: string;
  [key: string]: unknown;
}

export interface BackyAdminSettingsIssueApiKeyInput {
  label: string;
  requestId?: string;
  [key: string]: unknown;
}

export interface BackyAdminSettingsRevokeApiKeyInput {
  keyId: string;
  requestId?: string;
  [key: string]: unknown;
}

export interface BackyAdminSettingsInfrastructureInput {
  deliveryMode?: "managed-hosting" | "custom-frontend" | string;
  integrations?: Record<string, unknown>;
  recordHistory?: boolean;
  requestId?: string;
  [key: string]: unknown;
}

export interface BackyAdminSettingsInfrastructureDiagnostic {
  area:
    | "database"
    | "storage"
    | "supabase"
    | "mediaScanner"
    | "vercel"
    | "notifications"
    | "commerce"
    | "interactiveComponents"
    | string;
  label: string;
  status: "ready" | "warning" | "blocked" | string;
  summary: string;
  missing: string[];
  checks?: Array<Record<string, unknown>>;
  [key: string]: unknown;
}

export type BackyAdminSettingsInfrastructureResponse = BackyEnvelope<{
  diagnostics: BackyAdminSettingsInfrastructureDiagnostic[];
  generatedAt: string;
  historyEntry?: Record<string, unknown>;
  [key: string]: unknown;
}>;

export type BackyAdminSettingsStorageProvisioningResponse = BackyEnvelope<
  Record<string, unknown> & {
    provider: string;
    status: "ready" | "blocked" | string;
    summary: string;
    checks?: Array<Record<string, unknown>>;
    generatedAt?: string;
  }
>;

export type BackyAdminSettingsStorageCredentialRotationResponse =
  BackyEnvelope<
    Record<string, unknown> & {
      provider: string;
      status: "ready" | "blocked" | string;
      summary: string;
      probePath: string;
      fields?: Array<Record<string, unknown>>;
      checks?: Array<Record<string, unknown>>;
      nextSteps?: string[];
      generatedAt: string;
    }
  >;

export interface BackyAdminSettingsStorageSecretManagerInput {
  mode?: "plan" | "promote" | "revoke-replacement";
  dryRun?: boolean;
  targetEnvironments?: string[];
  requestId?: string;
  [key: string]: unknown;
}

export type BackyAdminSettingsStorageSecretManagerResponse = BackyEnvelope<
  Record<string, unknown> & {
    provider: string;
    secretManager: "vercel-env" | string;
    mode: "plan" | "promote" | "revoke-replacement" | string;
    dryRun: boolean;
    status: "ready" | "blocked" | string;
    executed: boolean;
    operations: Array<Record<string, unknown>>;
    nextSteps?: string[];
    generatedAt: string;
  }
>;

export interface BackyAdminSettingsNotificationWebhookInput {
  webhookUrl?: string;
  retryOf?: string | null;
  requestId?: string;
  [key: string]: unknown;
}

export interface BackyAdminSettingsNotificationWebhookDelivery {
  attempted: boolean;
  target: string;
  targetSummary?: string;
  status: "succeeded" | "failed" | string;
  statusCode?: number;
  error?: string;
  requestId: string;
  retry: boolean;
  retryOf?: string | null;
  generatedAt: string;
  [key: string]: unknown;
}

export type BackyAdminSettingsNotificationWebhookResponse = BackyEnvelope<{
  settings: BackyAdminSettings;
  delivery: BackyAdminSettingsNotificationWebhookDelivery;
  [key: string]: unknown;
}>;

export type BackySiteSettingsResponse = BackyEnvelope<{
  settings: BackySiteSettingsScope;
}>;

export type BackyAdminSettingsUpdateInput =
  GeneratedBackyOpenApiAdminSettingsUpdateRequest & {
    requestId?: string;
    [key: string]: unknown;
  };

export type BackyAdminSettingsActionInput =
  GeneratedBackyOpenApiAdminSettingsActionRequest & {
    requestId?: string;
    [key: string]: unknown;
  };

export type BackySiteSettingsUpdateInput =
  GeneratedBackyOpenApiAdminSiteSettingsPatchRequest & {
    requestId?: string;
    [key: string]: unknown;
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

export type BackyAdminUserRole = "owner" | "admin" | "editor" | "viewer";
export type BackyAdminUserStatus =
  | "active"
  | "inactive"
  | "invited"
  | "suspended";

export interface BackyAdminUser {
  id: string;
  fullName: string;
  email: string;
  role: BackyAdminUserRole;
  status: BackyAdminUserStatus;
  avatarUrl?: string | null;
  createdAt?: string;
  updatedAt?: string;
  lastActiveAt?: string | null;
  invitedAt?: string | null;
  [key: string]: unknown;
}

export interface BackyAdminUserDeliveryResult {
  attempted?: boolean;
  provider?: "local-outbox" | "http-endpoint" | "resend" | "smtp" | string;
  status?: "queued" | "failed" | string;
  deliveryConfigured?: boolean;
  statusCode?: number;
  error?: string;
  metadata?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface BackyAdminInviteToken {
  id: string;
  token: string;
  userId?: string;
  email?: string;
  createdAt?: string;
  expiresAt: string;
  requestedById?: string | null;
  deliveryConfigured?: boolean;
  inviteUrl: string;
  delivery?: BackyAdminUserDeliveryResult | null;
  [key: string]: unknown;
}

export interface BackyAdminPasswordResetToken {
  id: string;
  token: string;
  userId: string;
  email: string;
  createdAt: string;
  expiresAt: string;
  requestedById?: string | null;
  deliveryConfigured?: boolean;
  resetUrl: string;
  delivery?: BackyAdminUserDeliveryResult | null;
  [key: string]: unknown;
}

export type BackyAdminUsersResponse = BackyEnvelope<
  {
    users: BackyAdminUser[];
    pagination?: BackyPagination;
    [key: string]: unknown;
  }
>;

export type BackyAdminUserResponse = BackyEnvelope<
  {
    user: BackyAdminUser;
    invite?: BackyAdminInviteToken | null;
    inviteDelivery?: BackyAdminUserDeliveryResult | null;
    [key: string]: unknown;
  }
>;

export type BackyAdminUserDeleteResponse = BackyEnvelope<
  {
    deleted: boolean;
    userId: string;
    [key: string]: unknown;
  }
>;

export type BackyAdminUserCreateInput = {
  fullName: string;
  email: string;
  role: BackyAdminUserRole;
  status?: BackyAdminUserStatus;
  createInvite?: boolean;
  requestId?: string;
  [key: string]: unknown;
};

export type BackyAdminUserUpdateInput = {
  fullName?: string;
  email?: string;
  role?: BackyAdminUserRole;
  status?: BackyAdminUserStatus;
  avatarUrl?: string | null;
  requestId?: string;
  [key: string]: unknown;
};

export type BackyAdminUserSortBy =
  | "fullName"
  | "email"
  | "role"
  | "status"
  | "createdAt"
  | "updatedAt";

export interface BackyAdminUserListOptions
  extends BackyLiveManagementRequestOptions,
    BackyListOptions {
  search?: string;
  role?: BackyAdminUserRole;
  status?: BackyAdminUserStatus;
  sortBy?: BackyAdminUserSortBy;
  sort?: BackyAdminUserSortBy;
  sortDirection?: "asc" | "desc";
  direction?: "asc" | "desc";
}

export type BackyAdminUserBulkInput =
  | {
      action: "updateStatus";
      userIds: string[];
      status: BackyAdminUserStatus;
      requestId?: string;
    }
  | {
      action: "delete";
      userIds: string[];
      requestId?: string;
    };

export type BackyAdminUserBulkResponse = BackyEnvelope<
  {
    action: "delete" | "updateStatus";
    updated: number;
    deleted: number;
    userIds: string[];
    users: BackyAdminUser[];
    [key: string]: unknown;
  }
>;

export type BackyAdminPermissionCapability =
  | "view"
  | "create"
  | "edit"
  | "publish"
  | "delete"
  | "manage"
  | "export"
  | "configure";

export type BackyAdminPermissionOverrideValue = "allow" | "deny";

export interface BackyAdminPermissionRule {
  key: string;
  label: string;
  capability: BackyAdminPermissionCapability | string;
  allowed: boolean;
  source: "role" | "status" | "override" | string;
  override: BackyAdminPermissionOverrideValue | null;
  reason: string;
  [key: string]: unknown;
}

export interface BackyAdminPermissionGroup {
  key: string;
  label: string;
  description: string;
  permissions: BackyAdminPermissionRule[];
  [key: string]: unknown;
}

export interface BackyAdminUserPermissionMatrix {
  userId: string;
  role: BackyAdminUserRole;
  status: BackyAdminUserStatus;
  canSignIn: boolean;
  summary: {
    allowed: number;
    total: number;
    blockedByStatus: boolean;
    [key: string]: unknown;
  };
  groups: BackyAdminPermissionGroup[];
  [key: string]: unknown;
}

export type BackyAdminUserPermissionsResponse = BackyEnvelope<
  {
    user?: Pick<
      BackyAdminUser,
      "id" | "fullName" | "email" | "role" | "status"
    >;
    permissions: BackyAdminUserPermissionMatrix;
    [key: string]: unknown;
  }
>;

export type BackyAdminUserPermissionsUpdateInput = {
  requestId?: string;
  overrides: Record<string, BackyAdminPermissionOverrideValue | null>;
};

export interface BackyAdminUserMfaEnrollment {
  enabled: boolean;
  userId?: string;
  email?: string;
  recoveryCodesRemaining?: number;
  updatedAt?: string | null;
  [key: string]: unknown;
}

export type BackyAdminUserMfaResponse = BackyEnvelope<
  {
    user: Pick<BackyAdminUser, "id" | "fullName" | "email" | "role" | "status">;
    mfa: BackyAdminUserMfaEnrollment;
    recoveryCodes?: string[];
    [key: string]: unknown;
  }
>;

export type BackyAdminUserMfaUpdateInput = {
  enabled?: boolean;
  generateRecoveryCodes?: boolean;
  requestId?: string;
};

export type BackyAdminUserInviteResponse = BackyEnvelope<
  {
    invite: BackyAdminInviteToken;
    inviteDelivery?: BackyAdminUserDeliveryResult | null;
    [key: string]: unknown;
  }
>;

export type BackyAdminUserPasswordResetResponse = BackyEnvelope<
  {
    reset: BackyAdminPasswordResetToken;
    resetDelivery?: BackyAdminUserDeliveryResult | null;
    [key: string]: unknown;
  }
>;

export type BackyAdminUserTokenInput = {
  expiresInMinutes?: number;
  requestId?: string;
};

export type BackyAdminUserOwnershipTransferResponse = BackyEnvelope<
  {
    transfer: {
      previousOwner: BackyAdminUser;
      newOwner: BackyAdminUser;
      [key: string]: unknown;
    };
    users?: BackyAdminUser[];
    [key: string]: unknown;
  }
>;

export interface BackyAdminAuthSessionSummary {
  id: string;
  user: BackyAdminUser;
  issuedAt: string;
  expiresAt: string;
  lastSeenAt: string;
  authMode: "local-demo" | "supabase" | string;
  current: boolean;
  [key: string]: unknown;
}

export interface BackyAdminAuthSessionListOptions
  extends BackyLiveManagementRequestOptions {
  userId?: string;
  email?: string;
}

export type BackyAdminAuthSessionsResponse = BackyEnvelope<
  {
    sessions: BackyAdminAuthSessionSummary[];
    [key: string]: unknown;
  }
>;

export type BackyAdminAuthSessionRevokeResponse = BackyEnvelope<
  {
    revoked: boolean;
    [key: string]: unknown;
  }
>;

export interface BackyAdminUserImportError {
  row: number;
  email?: string;
  message: string;
  [key: string]: unknown;
}

export interface BackyAdminUserImportResult {
  mode?: "create" | "upsert";
  dryRun?: boolean;
  created: number;
  updated: number;
  skipped: number;
  errors: BackyAdminUserImportError[];
  rollbackAvailable?: boolean;
  rollbackRequestId?: string | null;
  [key: string]: unknown;
}

export interface BackyAdminUserImportOptions
  extends BackyLiveManagementRequestOptions {
  mode?: "create" | "upsert";
  dryRun?: boolean;
}

export type BackyAdminUserImportResponse = BackyEnvelope<
  {
    users: BackyAdminUser[];
    import: BackyAdminUserImportResult;
    [key: string]: unknown;
  }
>;

export interface BackyAdminUserImportRollbackResult {
  importRequestId?: string | null;
  importAction?: string;
  deleted: number;
  restored: number;
  skipped: Array<{
    userId: string;
    email: string;
    reason: string;
    [key: string]: unknown;
  }>;
  deletedUserIds: string[];
  restoredUserIds: string[];
  [key: string]: unknown;
}

export type BackyAdminUserImportRollbackResponse = BackyEnvelope<
  {
    rollback: BackyAdminUserImportRollbackResult;
    [key: string]: unknown;
  }
>;

export interface BackyAdminTeamMember {
  id: string;
  teamId: string;
  userId: string;
  email: string;
  name: string;
  avatarUrl?: string | null;
  role: BackyAdminUserRole;
  joinedAt: string;
  [key: string]: unknown;
}

export interface BackyAdminTeamWorkspaceSite {
  id: string;
  name: string;
  slug: string;
  customDomain?: string | null;
  status: "draft" | "published" | "archived" | string;
  updatedAt?: string | null;
  [key: string]: unknown;
}

export interface BackyAdminTeamWorkspaceSummary {
  siteCount: number;
  publishedSiteCount: number;
  draftSiteCount: number;
  archivedSiteCount: number;
  sites: BackyAdminTeamWorkspaceSite[];
  [key: string]: unknown;
}

export interface BackyAdminTeam {
  id: string;
  name: string;
  slug: string;
  ownerId?: string | null;
  avatarUrl?: string | null;
  createdAt: string;
  members: BackyAdminTeamMember[];
  plan?: "free" | "pro" | "enterprise" | string;
  settings?: Record<string, unknown>;
  workspace?: BackyAdminTeamWorkspaceSummary;
  [key: string]: unknown;
}

export interface BackyAdminTeamListOptions
  extends BackyLiveManagementRequestOptions {
  search?: string;
  ownerId?: string;
}

export type BackyAdminTeamsResponse = BackyEnvelope<
  {
    teams: BackyAdminTeam[];
    pagination?: BackyPagination;
    [key: string]: unknown;
  }
>;

export type BackyAdminTeamResponse = BackyEnvelope<
  {
    team: BackyAdminTeam;
    [key: string]: unknown;
  }
>;

export type BackyAdminTeamCreateInput = {
  name: string;
  slug?: string;
  ownerId?: string | null;
  settings?: Record<string, unknown>;
  requestId?: string;
};

export type BackyAdminTeamUpdateInput = {
  name?: string;
  slug?: string;
  ownerId?: string | null;
  settings?: Record<string, unknown>;
  requestId?: string;
};

export type BackyAdminTeamDeleteResponse = BackyEnvelope<
  {
    deleted: boolean;
    [key: string]: unknown;
  }
>;

export type BackyAdminTeamMembersResponse = BackyEnvelope<
  {
    members: BackyAdminTeamMember[];
    pagination?: BackyPagination;
    [key: string]: unknown;
  }
>;

export type BackyAdminTeamMemberResponse = BackyEnvelope<
  {
    member: BackyAdminTeamMember;
    user?: BackyAdminUser;
    invite?: BackyAdminInviteToken | null;
    inviteDelivery?: BackyAdminUserDeliveryResult | null;
    [key: string]: unknown;
  }
>;

export type BackyAdminTeamMemberInviteInput = {
  userId?: string;
  email?: string;
  fullName?: string;
  role?: BackyAdminUserRole;
  requestId?: string;
};

export type BackyAdminTeamMemberUpdateInput = {
  role: BackyAdminUserRole;
  requestId?: string;
};

export type BackyAdminTeamMemberRemoveResponse = BackyEnvelope<
  {
    removed: boolean;
    [key: string]: unknown;
  }
>;

export type BackyAdminAuditEntity =
  | "site"
  | "page"
  | "post"
  | "blogCategory"
  | "blogTag"
  | "collection"
  | "collectionRecord"
  | "media"
  | "mediaFolder"
  | "form"
  | "formSubmission"
  | "reusableSection"
  | "interactiveComponent"
  | "contact"
  | "comment"
  | "team"
  | "teamMember"
  | "user"
  | "settings"
  | "auditLog"
  | "cacheInvalidation";

export interface BackyAdminAuditLog {
  id: string;
  siteId?: string | null;
  teamId?: string | null;
  actorId?: string | null;
  entity: BackyAdminAuditEntity;
  entityId: string;
  action: string;
  before?: Record<string, unknown>;
  after?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
  requestId?: string;
  createdAt: string;
  [key: string]: unknown;
}

export interface BackyAdminAuditLogListOptions
  extends BackyLiveManagementRequestOptions,
    BackyListOptions {
  siteId?: string;
  teamId?: string;
  actorId?: string;
  entity?: BackyAdminAuditEntity;
  entityId?: string;
  action?: string;
  auditRequestId?: string;
}

export type BackyAdminAuditLogsResponse = BackyEnvelope<
  {
    logs: BackyAdminAuditLog[];
    count: number;
    pagination?: BackyPagination;
    [key: string]: unknown;
  }
>;

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
    fonts?: number;
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

export interface BackyCompletionEvidenceArtifact {
  key: "settings-provider-certification-json" | "commerce-provider-certification-json";
  label: string;
  workflow: string;
  alternateWorkflows?: string[];
  artifactName: "backy-settings-provider-certification-evidence" | "backy-commerce-provider-certification-evidence";
  path: "artifacts/backy-settings-provider-certification.json" | "artifacts/backy-commerce-provider-certification.json";
  schemaVersion:
    | "backy.settings-provider-certification-artifact.v1"
    | "backy.commerce-provider-certification-artifact.v1";
  producerEnv: "BACKY_SETTINGS_CERTIFICATION_OUTPUT" | "BACKY_COMMERCE_CERTIFICATION_OUTPUT";
  requiredForReady: true;
  includesSecretValues: false;
  [key: string]: unknown;
}

export interface BackyCompletionArtifactVerifier {
  command: "npm run doctor:release-certification";
  requiredEnv: string;
  pathEnv: string;
  schemaVersion:
    | "backy.settings-provider-certification-artifact.v1"
    | "backy.commerce-provider-certification-artifact.v1";
  validates: string[];
  includesSecretValues: false;
  [key: string]: unknown;
}

export interface BackyCompletionStatus {
  schemaVersion: "backy.completion-status.v1";
  status: "certification-ready" | "external-gates-required";
  summary?: string;
  audit: {
    source: string;
    ready: 41;
    partial: 4;
    prototype: 0;
    missing: 0;
    total: 45;
    readyPercent: 91;
    [key: string]: unknown;
  };
  surfaces: Array<{
    key: string;
    label: string;
    status: "partial";
    blocker: string;
    gate: string;
    [key: string]: unknown;
  }>;
  surfaceRunbooks: Array<{
    key: "settings" | "settings-admin-apis" | "products" | "orders";
    label: string;
    gate: "settings-provider-certification" | "commerce-provider-certification";
    command: string;
    preflight: string;
    workflow: string;
    targetInputs: string[];
    evidencePacketSchema:
      | "backy.settings-provider-certification-evidence-packet.v1"
      | "backy.commerce-provider-certification-evidence-packet.v1"
      | "backy.order-provider-certification-evidence-packet.v1";
    evidenceApi: string;
    evidenceUiPanel: string;
    sourceOnlyGuard: string;
    proofSources: string[];
	    expectedArtifacts: string[];
	    evidenceArtifacts: BackyCompletionEvidenceArtifact[];
	    artifactVerifier: BackyCompletionArtifactVerifier;
	    runtime: Record<string, unknown>;
    secretBoundary: {
      includesSecretValues: false;
      excludes: string[];
      [key: string]: unknown;
    };
    nextAction: string;
    [key: string]: unknown;
  }>;
  gates: Array<{
    key: "settings-provider-certification" | "commerce-provider-certification";
    label: string;
    status: "ready-to-run" | "blocked-missing-inputs";
    command: string;
    preflight?: string;
    disposableGuard?: string;
    workflow: string;
    affectedSurfaces: string[];
    requiredEnvAliases: string[];
    runtime: Record<string, unknown>;
    [key: string]: unknown;
  }>;
  certifiedGates?: Array<{
    key: "forms-postgres" | "sdk-postgres";
    label: string;
    status: "certified";
    command: string;
    workflow: string;
    affectedSurfaces: string[];
    certifiedAt: string;
    evidence: string;
    [key: string]: unknown;
  }>;
  nextAction: string;
  recommendedCommands: string[];
  localPreflight: "npm run test:partial-gate-preflights";
  privacy: {
    includesSecretValues: false;
    exposesOnlyAliasPresence: true;
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
  completionStatus: BackyCompletionStatus;
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
  route: BackyRenderRoute;
  content: BackyRenderContent;
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

  regenerateAdminSettingsApiKeys(
    input: BackyAdminSettingsRegenerateApiKeysInput = {},
    options: BackyLiveManagementRequestOptions = {},
  ): Promise<BackyAdminSettingsActionResponse> {
    const { requestId, scope = "all", ...body } = input;
    return this.request("/api/admin/settings", {
      method: "POST",
      body: {
        scope,
        ...body,
        action: "regenerate-api-keys",
      },
      requestId: options.requestId ?? requestId,
      headers: liveManagementHeaders(options),
      credentials: options.credentials,
    });
  }

  issueAdminSettingsApiKey(
    input: BackyAdminSettingsIssueApiKeyInput,
    options: BackyLiveManagementRequestOptions = {},
  ): Promise<BackyAdminSettingsIssueApiKeyResponse> {
    const { requestId, ...body } = input;
    return this.request("/api/admin/settings", {
      method: "POST",
      body: {
        ...body,
        action: "issue-admin-api-key",
      },
      requestId: options.requestId ?? requestId,
      headers: liveManagementHeaders(options),
      credentials: options.credentials,
    });
  }

  revokeAdminSettingsApiKey(
    input: BackyAdminSettingsRevokeApiKeyInput,
    options: BackyLiveManagementRequestOptions = {},
  ): Promise<BackyAdminSettingsActionResponse> {
    const { requestId, ...body } = input;
    return this.request("/api/admin/settings", {
      method: "POST",
      body: {
        ...body,
        action: "revoke-admin-api-key",
      },
      requestId: options.requestId ?? requestId,
      headers: liveManagementHeaders(options),
      credentials: options.credentials,
    });
  }

  validateAdminSettingsInfrastructure(
    input: BackyAdminSettingsInfrastructureInput = {},
    options: BackyLiveManagementRequestOptions = {},
  ): Promise<BackyAdminSettingsInfrastructureResponse> {
    const { requestId, ...body } = input;
    return this.request("/api/admin/settings", {
      method: "POST",
      body: {
        ...body,
        action: "validate-infrastructure",
      },
      requestId: options.requestId ?? requestId,
      headers: liveManagementHeaders(options),
      credentials: options.credentials,
    });
  }

  runAdminSettingsStorageProvisioningProbe(
    input: { siteId?: string; requestId?: string } = {},
    options: BackyLiveManagementRequestOptions = {},
  ): Promise<BackyAdminSettingsStorageProvisioningResponse> {
    const { requestId, ...body } = input;
    return this.request("/api/admin/settings", {
      method: "POST",
      body: {
        ...body,
        action: "media-storage-provisioning-probe",
      },
      requestId: options.requestId ?? requestId,
      headers: liveManagementHeaders(options),
      credentials: options.credentials,
    });
  }

  runAdminSettingsStorageCredentialRotationProbe(
    options: BackyLiveManagementRequestOptions = {},
  ): Promise<BackyAdminSettingsStorageCredentialRotationResponse> {
    return this.request("/api/admin/settings", {
      method: "POST",
      body: {
        action: "media-storage-credential-rotation-probe",
      },
      requestId: options.requestId,
      headers: liveManagementHeaders(options),
      credentials: options.credentials,
    });
  }

  runAdminSettingsStorageSecretManager(
    input: BackyAdminSettingsStorageSecretManagerInput = {},
    options: BackyLiveManagementRequestOptions = {},
  ): Promise<BackyAdminSettingsStorageSecretManagerResponse> {
    const { requestId, mode = "plan", dryRun = true, ...body } = input;
    return this.request("/api/admin/settings", {
      method: "POST",
      body: {
        mode,
        dryRun,
        ...body,
        action: "media-storage-secret-manager",
      },
      requestId: options.requestId ?? requestId,
      headers: liveManagementHeaders(options),
      credentials: options.credentials,
    });
  }

  testAdminSettingsNotificationWebhook(
    input: BackyAdminSettingsNotificationWebhookInput = {},
    options: BackyLiveManagementRequestOptions = {},
  ): Promise<BackyAdminSettingsNotificationWebhookResponse> {
    const { requestId, ...body } = input;
    return this.request("/api/admin/settings", {
      method: "POST",
      body: {
        ...body,
        action: "test-notification-webhook",
      },
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

  adminFrontendDesign(
    options: BackyLiveManagementRequestOptions = {},
  ): Promise<BackyAdminFrontendDesignResponse> {
    return this.request(
      `/api/admin/sites/${encodeURIComponent(options.siteId ?? this.requireSiteId())}/frontend-design`,
      {
        requestId: options.requestId,
        headers: liveManagementHeaders(options),
        credentials: options.credentials,
      },
    );
  }

  updateAdminFrontendDesign(
    input: BackyAdminFrontendDesignUpdateInput,
    options: BackyLiveManagementRequestOptions = {},
  ): Promise<BackyAdminFrontendDesignResponse> {
    const { requestId, ...body } = input;
    return this.request(
      `/api/admin/sites/${encodeURIComponent(options.siteId ?? this.requireSiteId())}/frontend-design`,
      {
        method: "PATCH",
        body,
        requestId: options.requestId ?? requestId,
        headers: liveManagementHeaders(options),
        credentials: options.credentials,
      },
    );
  }

  importAdminFrontendDesign(
    input: BackyAdminFrontendDesignImportInput,
    options: BackyLiveManagementRequestOptions = {},
  ): Promise<BackyAdminFrontendDesignResponse> {
    const { requestId, ...body } = input;
    return this.request(
      `/api/admin/sites/${encodeURIComponent(options.siteId ?? this.requireSiteId())}/frontend-design`,
      {
        method: "POST",
        body: {
          ...body,
          action: "import-frontend-contract",
        },
        requestId: options.requestId ?? requestId,
        headers: liveManagementHeaders(options),
        credentials: options.credentials,
      },
    );
  }

  captureAdminSiteDefaults(
    options: BackyLiveManagementRequestOptions = {},
  ): Promise<BackyAdminFrontendDesignResponse> {
    return this.request(
      `/api/admin/sites/${encodeURIComponent(options.siteId ?? this.requireSiteId())}/frontend-design`,
      {
        method: "POST",
        body: {
          action: "capture-site-defaults",
        },
        requestId: options.requestId,
        headers: liveManagementHeaders(options),
        credentials: options.credentials,
      },
    );
  }

  captureAdminContentTemplate(
    input: BackyAdminFrontendDesignTemplateCaptureInput,
    options: BackyLiveManagementRequestOptions = {},
  ): Promise<BackyAdminFrontendDesignResponse> {
    const { requestId, ...body } = input;
    return this.request(
      `/api/admin/sites/${encodeURIComponent(options.siteId ?? this.requireSiteId())}/frontend-design`,
      {
        method: "POST",
        body: {
          ...body,
          action: "capture-content-template",
        },
        requestId: options.requestId ?? requestId,
        headers: liveManagementHeaders(options),
        credentials: options.credentials,
      },
    );
  }

  adminTemplates(
    options: BackyAdminTemplateRegistryOptions = {},
  ): Promise<BackyAdminTemplateRegistryResponse> {
    const { requestId, siteId, headers, credentials, rest } =
      splitLiveManagementRequestOptions(options);
    return this.request(
      `/api/admin/sites/${encodeURIComponent(siteId ?? this.requireSiteId())}/templates`,
      {
        query: {
          type: rest.type,
          search: rest.search,
        },
        requestId,
        headers,
        credentials,
      },
    );
  }

  adminCollectionBindingPresets(
    options: BackyLiveManagementRequestOptions = {},
  ): Promise<BackyAdminCollectionBindingPresetsResponse> {
    return this.request(
      `/api/admin/sites/${encodeURIComponent(options.siteId ?? this.requireSiteId())}/editor/collection-binding-presets`,
      {
        requestId: options.requestId,
        headers: liveManagementHeaders(options),
        credentials: options.credentials,
      },
    );
  }

  updateAdminCollectionBindingPresets(
    input: BackyAdminCollectionBindingPresetsUpdateInput,
    options: BackyLiveManagementRequestOptions = {},
  ): Promise<BackyAdminCollectionBindingPresetsResponse> {
    const { requestId, ...body } = input;
    return this.request(
      `/api/admin/sites/${encodeURIComponent(options.siteId ?? this.requireSiteId())}/editor/collection-binding-presets`,
      {
        method: "PATCH",
        body,
        requestId: options.requestId ?? requestId,
        headers: liveManagementHeaders(options),
        credentials: options.credentials,
      },
    );
  }

  adminInteractiveComponents(
    options: BackyAdminInteractiveComponentListOptions = {},
  ): Promise<BackyAdminInteractiveComponentsResponse> {
    const { requestId, siteId, headers, credentials, rest } =
      splitLiveManagementRequestOptions(options);
    return this.request(
      `/api/admin/sites/${encodeURIComponent(siteId ?? this.requireSiteId())}/interactive-components`,
      {
        query: {
          status: rest.status,
          reviewStatus: rest.reviewStatus,
          type: rest.type,
          search: rest.search,
        },
        requestId,
        headers,
        credentials,
      },
    );
  }

  createAdminInteractiveComponent(
    input: BackyAdminInteractiveComponentInput,
    options: BackyLiveManagementRequestOptions = {},
  ): Promise<BackyAdminInteractiveComponentResponse> {
    const { requestId, ...body } = input;
    return this.request(
      `/api/admin/sites/${encodeURIComponent(options.siteId ?? this.requireSiteId())}/interactive-components`,
      {
        method: "POST",
        body,
        requestId: options.requestId ?? requestId,
        headers: liveManagementHeaders(options),
        credentials: options.credentials,
      },
    );
  }

  adminInteractiveComponent(
    componentKey: string,
    version: string,
    options: BackyLiveManagementRequestOptions = {},
  ): Promise<BackyAdminInteractiveComponentResponse> {
    return this.request(
      `/api/admin/sites/${encodeURIComponent(options.siteId ?? this.requireSiteId())}/interactive-components/${encodeURIComponent(componentKey)}/${encodeURIComponent(version)}`,
      {
        requestId: options.requestId,
        headers: liveManagementHeaders(options),
        credentials: options.credentials,
      },
    );
  }

  updateAdminInteractiveComponent(
    componentKey: string,
    version: string,
    input: BackyAdminInteractiveComponentUpdateInput,
    options: BackyLiveManagementRequestOptions = {},
  ): Promise<BackyAdminInteractiveComponentResponse> {
    const { requestId, ...body } = input;
    const inputRequestId = typeof requestId === "string" ? requestId : undefined;
    return this.request(
      `/api/admin/sites/${encodeURIComponent(options.siteId ?? this.requireSiteId())}/interactive-components/${encodeURIComponent(componentKey)}/${encodeURIComponent(version)}`,
      {
        method: "PATCH",
        body,
        requestId: options.requestId ?? inputRequestId,
        headers: liveManagementHeaders(options),
        credentials: options.credentials,
      },
    );
  }

  deleteAdminInteractiveComponent(
    componentKey: string,
    version: string,
    options: BackyLiveManagementRequestOptions = {},
  ): Promise<BackyAdminInteractiveComponentDeleteResponse> {
    return this.request(
      `/api/admin/sites/${encodeURIComponent(options.siteId ?? this.requireSiteId())}/interactive-components/${encodeURIComponent(componentKey)}/${encodeURIComponent(version)}`,
      {
        method: "DELETE",
        requestId: options.requestId,
        headers: liveManagementHeaders(options),
        credentials: options.credentials,
      },
    );
  }

  adminInteractiveComponentUsage(
    componentKey: string,
    version: string,
    options: BackyLiveManagementRequestOptions = {},
  ): Promise<BackyAdminInteractiveComponentUsageResponse> {
    return this.request(
      `/api/admin/sites/${encodeURIComponent(options.siteId ?? this.requireSiteId())}/interactive-components/${encodeURIComponent(componentKey)}/${encodeURIComponent(version)}/usage`,
      {
        requestId: options.requestId,
        headers: liveManagementHeaders(options),
        credentials: options.credentials,
      },
    );
  }

  exportAdminInteractiveComponent(
    componentKey: string,
    version: string,
    options: BackyLiveManagementRequestOptions = {},
  ): Promise<BackyAdminInteractiveComponentExportResponse> {
    return this.request(
      `/api/admin/sites/${encodeURIComponent(options.siteId ?? this.requireSiteId())}/interactive-components/${encodeURIComponent(componentKey)}/${encodeURIComponent(version)}/export`,
      {
        requestId: options.requestId,
        headers: liveManagementHeaders(options),
        credentials: options.credentials,
      },
    );
  }

  reviewAdminInteractiveComponent(
    componentKey: string,
    version: string,
    input: BackyAdminInteractiveComponentReviewInput,
    options: BackyLiveManagementRequestOptions = {},
  ): Promise<BackyAdminInteractiveComponentReviewResponse> {
    const { requestId, ...body } = input;
    return this.request(
      `/api/admin/sites/${encodeURIComponent(options.siteId ?? this.requireSiteId())}/interactive-components/${encodeURIComponent(componentKey)}/${encodeURIComponent(version)}/review`,
      {
        method: "POST",
        body,
        requestId: options.requestId ?? requestId,
        headers: liveManagementHeaders(options),
        credentials: options.credentials,
      },
    );
  }

  uploadAdminInteractiveComponentBundle(
    componentKey: string,
    version: string,
    input: BackyAdminInteractiveComponentBundleInput,
    options: BackyLiveManagementRequestOptions = {},
  ): Promise<BackyAdminInteractiveComponentBundleResponse> {
    const { requestId, ...body } = input;
    return this.request(
      `/api/admin/sites/${encodeURIComponent(options.siteId ?? this.requireSiteId())}/interactive-components/${encodeURIComponent(componentKey)}/${encodeURIComponent(version)}/bundle`,
      {
        method: "POST",
        body,
        requestId: options.requestId ?? requestId,
        headers: liveManagementHeaders(options),
        credentials: options.credentials,
      },
    );
  }

  migrateAdminInteractiveComponentVersion(
    componentKey: string,
    version: string,
    input: BackyAdminInteractiveComponentMigrationInput,
    options: BackyLiveManagementRequestOptions = {},
  ): Promise<BackyAdminInteractiveComponentMigrationResponse> {
    const { requestId, ...body } = input;
    return this.request(
      `/api/admin/sites/${encodeURIComponent(options.siteId ?? this.requireSiteId())}/interactive-components/${encodeURIComponent(componentKey)}/${encodeURIComponent(version)}/migrate`,
      {
        method: "POST",
        body,
        requestId: options.requestId ?? requestId,
        headers: liveManagementHeaders(options),
        credentials: options.credentials,
      },
    );
  }

  rollbackAdminInteractiveComponentVersion(
    componentKey: string,
    version: string,
    input: BackyAdminInteractiveComponentRollbackInput = {},
    options: BackyLiveManagementRequestOptions = {},
  ): Promise<BackyAdminInteractiveComponentRollbackResponse> {
    const { requestId, ...body } = input;
    return this.request(
      `/api/admin/sites/${encodeURIComponent(options.siteId ?? this.requireSiteId())}/interactive-components/${encodeURIComponent(componentKey)}/${encodeURIComponent(version)}/rollback`,
      {
        method: "POST",
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

  adminUsers(
    options: BackyAdminUserListOptions = {},
  ): Promise<BackyAdminUsersResponse> {
    const { requestId, headers, credentials, rest } =
      splitLiveManagementRequestOptions(options);
    return this.request("/api/admin/users", {
      query: normalizeListQuery<BackyAdminUserListOptions>({
        search: rest.search,
        role: rest.role,
        status: rest.status,
        sortBy: rest.sortBy,
        sort: rest.sort,
        sortDirection: rest.sortDirection,
        direction: rest.direction,
        limit: rest.limit,
        offset: rest.offset,
      }),
      requestId,
      headers,
      credentials,
    });
  }

  createAdminUser(
    input: BackyAdminUserCreateInput,
    options: BackyLiveManagementRequestOptions = {},
  ): Promise<BackyAdminUserResponse> {
    const { requestId, ...body } = input;
    return this.request("/api/admin/users", {
      method: "POST",
      body,
      requestId: options.requestId ?? requestId,
      headers: liveManagementHeaders(options),
      credentials: options.credentials,
    });
  }

  adminUser(
    userId: string,
    options: BackyLiveManagementRequestOptions = {},
  ): Promise<BackyAdminUserResponse> {
    return this.request(`/api/admin/users/${encodeURIComponent(userId)}`, {
      requestId: options.requestId,
      headers: liveManagementHeaders(options),
      credentials: options.credentials,
    });
  }

  updateAdminUser(
    userId: string,
    input: BackyAdminUserUpdateInput,
    options: BackyLiveManagementRequestOptions = {},
  ): Promise<BackyAdminUserResponse> {
    const { requestId, ...body } = input;
    return this.request(`/api/admin/users/${encodeURIComponent(userId)}`, {
      method: "PATCH",
      body,
      requestId: options.requestId ?? requestId,
      headers: liveManagementHeaders(options),
      credentials: options.credentials,
    });
  }

  deleteAdminUser(
    userId: string,
    options: BackyLiveManagementRequestOptions = {},
  ): Promise<BackyAdminUserDeleteResponse> {
    return this.request(`/api/admin/users/${encodeURIComponent(userId)}`, {
      method: "DELETE",
      requestId: options.requestId,
      headers: liveManagementHeaders(options),
      credentials: options.credentials,
    });
  }

  bulkAdminUsers(
    input: BackyAdminUserBulkInput,
    options: BackyLiveManagementRequestOptions = {},
  ): Promise<BackyAdminUserBulkResponse> {
    const { requestId, ...body } = input;
    return this.request("/api/admin/users/bulk", {
      method: "POST",
      body,
      requestId: options.requestId ?? requestId,
      headers: liveManagementHeaders(options),
      credentials: options.credentials,
    });
  }

  adminUserPermissions(
    userId: string,
    options: BackyLiveManagementRequestOptions = {},
  ): Promise<BackyAdminUserPermissionsResponse> {
    return this.request(
      `/api/admin/users/${encodeURIComponent(userId)}/permissions`,
      {
        requestId: options.requestId,
        headers: liveManagementHeaders(options),
        credentials: options.credentials,
      },
    );
  }

  updateAdminUserPermissions(
    userId: string,
    input: BackyAdminUserPermissionsUpdateInput,
    options: BackyLiveManagementRequestOptions = {},
  ): Promise<BackyAdminUserPermissionsResponse> {
    const { requestId, ...body } = input;
    return this.request(
      `/api/admin/users/${encodeURIComponent(userId)}/permissions`,
      {
        method: "PATCH",
        body,
        requestId: options.requestId ?? requestId,
        headers: liveManagementHeaders(options),
        credentials: options.credentials,
      },
    );
  }

  adminUserMfa(
    userId: string,
    options: BackyLiveManagementRequestOptions = {},
  ): Promise<BackyAdminUserMfaResponse> {
    return this.request(`/api/admin/users/${encodeURIComponent(userId)}/mfa`, {
      requestId: options.requestId,
      headers: liveManagementHeaders(options),
      credentials: options.credentials,
    });
  }

  updateAdminUserMfa(
    userId: string,
    input: BackyAdminUserMfaUpdateInput,
    options: BackyLiveManagementRequestOptions = {},
  ): Promise<BackyAdminUserMfaResponse> {
    const { requestId, ...body } = input;
    return this.request(`/api/admin/users/${encodeURIComponent(userId)}/mfa`, {
      method: "PATCH",
      body,
      requestId: options.requestId ?? requestId,
      headers: liveManagementHeaders(options),
      credentials: options.credentials,
    });
  }

  createAdminUserInvite(
    userId: string,
    input: BackyAdminUserTokenInput = {},
    options: BackyLiveManagementRequestOptions = {},
  ): Promise<BackyAdminUserInviteResponse> {
    const { requestId, ...body } = input;
    return this.request(
      `/api/admin/users/${encodeURIComponent(userId)}/invite-link`,
      {
        method: "POST",
        body,
        requestId: options.requestId ?? requestId,
        headers: liveManagementHeaders(options),
        credentials: options.credentials,
      },
    );
  }

  createAdminUserPasswordReset(
    userId: string,
    input: BackyAdminUserTokenInput = {},
    options: BackyLiveManagementRequestOptions = {},
  ): Promise<BackyAdminUserPasswordResetResponse> {
    const { requestId, ...body } = input;
    return this.request(
      `/api/admin/users/${encodeURIComponent(userId)}/password-reset`,
      {
        method: "POST",
        body,
        requestId: options.requestId ?? requestId,
        headers: liveManagementHeaders(options),
        credentials: options.credentials,
      },
    );
  }

  transferAdminUserOwnership(
    userId: string,
    options: BackyLiveManagementRequestOptions = {},
  ): Promise<BackyAdminUserOwnershipTransferResponse> {
    return this.request(
      `/api/admin/users/${encodeURIComponent(userId)}/transfer-ownership`,
      {
        method: "POST",
        requestId: options.requestId,
        headers: liveManagementHeaders(options),
        credentials: options.credentials,
      },
    );
  }

  adminAuthSessions(
    options: BackyAdminAuthSessionListOptions = {},
  ): Promise<BackyAdminAuthSessionsResponse> {
    const { requestId, headers, credentials, rest } =
      splitLiveManagementRequestOptions(options);
    return this.request("/api/admin/auth/sessions", {
      query: {
        userId: rest.userId,
        email: rest.email,
      },
      requestId,
      headers,
      credentials,
    });
  }

  revokeAdminAuthSession(
    sessionId: string,
    options: BackyLiveManagementRequestOptions = {},
  ): Promise<BackyAdminAuthSessionRevokeResponse> {
    return this.request("/api/admin/auth/sessions", {
      method: "DELETE",
      body: { sessionId },
      requestId: options.requestId,
      headers: liveManagementHeaders(options),
      credentials: options.credentials,
    });
  }

  importAdminUsersCsv(
    csv: string,
    options: BackyAdminUserImportOptions = {},
  ): Promise<BackyAdminUserImportResponse> {
    const { requestId, headers, credentials, rest } =
      splitLiveManagementRequestOptions(options);
    const requestHeaders = new Headers(headers);
    if (!requestHeaders.has("content-type")) {
      requestHeaders.set("content-type", "text/csv; charset=utf-8");
    }
    return this.request("/api/admin/users/import", {
      method: "POST",
      query: {
        mode: rest.mode,
        dryRun: rest.dryRun,
      },
      body: csv,
      requestId,
      headers: requestHeaders,
      credentials,
    });
  }

  rollbackAdminUsersImport(
    importRequestId?: string | null,
    options: BackyLiveManagementRequestOptions = {},
  ): Promise<BackyAdminUserImportRollbackResponse> {
    return this.request("/api/admin/users/import/rollback", {
      method: "POST",
      body: importRequestId ? { requestId: importRequestId } : {},
      requestId: options.requestId,
      headers: liveManagementHeaders(options),
      credentials: options.credentials,
    });
  }

  adminTeams(
    options: BackyAdminTeamListOptions = {},
  ): Promise<BackyAdminTeamsResponse> {
    const { requestId, headers, credentials, rest } =
      splitLiveManagementRequestOptions(options);
    return this.request("/api/admin/teams", {
      query: {
        search: rest.search,
        ownerId: rest.ownerId,
      },
      requestId,
      headers,
      credentials,
    });
  }

  createAdminTeam(
    input: BackyAdminTeamCreateInput,
    options: BackyLiveManagementRequestOptions = {},
  ): Promise<BackyAdminTeamResponse> {
    const { requestId, ...body } = input;
    return this.request("/api/admin/teams", {
      method: "POST",
      body,
      requestId: options.requestId ?? requestId,
      headers: liveManagementHeaders(options),
      credentials: options.credentials,
    });
  }

  adminTeam(
    teamId: string,
    options: BackyLiveManagementRequestOptions = {},
  ): Promise<BackyAdminTeamResponse> {
    return this.request(`/api/admin/teams/${encodeURIComponent(teamId)}`, {
      requestId: options.requestId,
      headers: liveManagementHeaders(options),
      credentials: options.credentials,
    });
  }

  updateAdminTeam(
    teamId: string,
    input: BackyAdminTeamUpdateInput,
    options: BackyLiveManagementRequestOptions = {},
  ): Promise<BackyAdminTeamResponse> {
    const { requestId, ...body } = input;
    return this.request(`/api/admin/teams/${encodeURIComponent(teamId)}`, {
      method: "PATCH",
      body,
      requestId: options.requestId ?? requestId,
      headers: liveManagementHeaders(options),
      credentials: options.credentials,
    });
  }

  deleteAdminTeam(
    teamId: string,
    options: BackyLiveManagementRequestOptions = {},
  ): Promise<BackyAdminTeamDeleteResponse> {
    return this.request(`/api/admin/teams/${encodeURIComponent(teamId)}`, {
      method: "DELETE",
      requestId: options.requestId,
      headers: liveManagementHeaders(options),
      credentials: options.credentials,
    });
  }

  adminTeamMembers(
    teamId: string,
    options: BackyLiveManagementRequestOptions = {},
  ): Promise<BackyAdminTeamMembersResponse> {
    return this.request(
      `/api/admin/teams/${encodeURIComponent(teamId)}/members`,
      {
        requestId: options.requestId,
        headers: liveManagementHeaders(options),
        credentials: options.credentials,
      },
    );
  }

  inviteAdminTeamMember(
    teamId: string,
    input: BackyAdminTeamMemberInviteInput,
    options: BackyLiveManagementRequestOptions = {},
  ): Promise<BackyAdminTeamMemberResponse> {
    const { requestId, ...body } = input;
    return this.request(
      `/api/admin/teams/${encodeURIComponent(teamId)}/members`,
      {
        method: "POST",
        body,
        requestId: options.requestId ?? requestId,
        headers: liveManagementHeaders(options),
        credentials: options.credentials,
      },
    );
  }

  updateAdminTeamMember(
    teamId: string,
    memberId: string,
    input: BackyAdminTeamMemberUpdateInput,
    options: BackyLiveManagementRequestOptions = {},
  ): Promise<BackyAdminTeamMemberResponse> {
    const { requestId, ...body } = input;
    return this.request(
      `/api/admin/teams/${encodeURIComponent(teamId)}/members/${encodeURIComponent(memberId)}`,
      {
        method: "PATCH",
        body,
        requestId: options.requestId ?? requestId,
        headers: liveManagementHeaders(options),
        credentials: options.credentials,
      },
    );
  }

  removeAdminTeamMember(
    teamId: string,
    memberId: string,
    options: BackyLiveManagementRequestOptions = {},
  ): Promise<BackyAdminTeamMemberRemoveResponse> {
    return this.request(
      `/api/admin/teams/${encodeURIComponent(teamId)}/members/${encodeURIComponent(memberId)}`,
      {
        method: "DELETE",
        requestId: options.requestId,
        headers: liveManagementHeaders(options),
        credentials: options.credentials,
      },
    );
  }

  adminAuditLogs(
    options: BackyAdminAuditLogListOptions = {},
  ): Promise<BackyAdminAuditLogsResponse> {
    const { requestId, siteId, headers, credentials, rest } =
      splitLiveManagementRequestOptions(options);
    return this.request("/api/admin/audit-logs", {
      query: {
        siteId,
        teamId: rest.teamId,
        actorId: rest.actorId,
        entity: rest.entity,
        entityId: rest.entityId,
        action: rest.action,
        requestId: rest.auditRequestId,
        limit: normalizeListLimit(rest.limit),
        offset: normalizeListOffset(rest.offset),
      },
      requestId,
      headers,
      credentials,
    });
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

  adminBlogCategories(
    options: BackyLiveManagementRequestOptions = {},
  ): Promise<BackyAdminBlogCategoriesResponse> {
    return this.request(
      `/api/admin/sites/${encodeURIComponent(options.siteId ?? this.requireSiteId())}/blog/categories`,
      {
        requestId: options.requestId,
        headers: liveManagementHeaders(options),
        credentials: options.credentials,
      },
    );
  }

  createAdminBlogCategory(
    input: BackyAdminBlogCategoryInput,
    options: BackyLiveManagementRequestOptions = {},
  ): Promise<BackyAdminBlogCategoryResponse> {
    const { requestId, ...body } = input;
    return this.request(
      `/api/admin/sites/${encodeURIComponent(options.siteId ?? this.requireSiteId())}/blog/categories`,
      {
        method: "POST",
        body,
        requestId: options.requestId ?? requestId,
        headers: liveManagementHeaders(options),
        credentials: options.credentials,
      },
    );
  }

  adminBlogCategory(
    categoryId: string,
    options: BackyLiveManagementRequestOptions = {},
  ): Promise<BackyAdminBlogCategoryResponse> {
    return this.request(
      `/api/admin/sites/${encodeURIComponent(options.siteId ?? this.requireSiteId())}/blog/categories/${encodeURIComponent(categoryId)}`,
      {
        requestId: options.requestId,
        headers: liveManagementHeaders(options),
        credentials: options.credentials,
      },
    );
  }

  updateAdminBlogCategory(
    categoryId: string,
    input: BackyAdminBlogCategoryUpdateInput,
    options: BackyLiveManagementRequestOptions = {},
  ): Promise<BackyAdminBlogCategoryResponse> {
    const { requestId: inputRequestId, ...body } = input;
    const requestId =
      typeof inputRequestId === "string" ? inputRequestId : undefined;
    return this.request(
      `/api/admin/sites/${encodeURIComponent(options.siteId ?? this.requireSiteId())}/blog/categories/${encodeURIComponent(categoryId)}`,
      {
        method: "PATCH",
        body,
        requestId: options.requestId ?? requestId,
        headers: liveManagementHeaders(options),
        credentials: options.credentials,
      },
    );
  }

  deleteAdminBlogCategory(
    categoryId: string,
    options: BackyLiveManagementRequestOptions = {},
  ): Promise<BackyAdminBlogCategoryDeleteResponse> {
    return this.request(
      `/api/admin/sites/${encodeURIComponent(options.siteId ?? this.requireSiteId())}/blog/categories/${encodeURIComponent(categoryId)}`,
      {
        method: "DELETE",
        requestId: options.requestId,
        headers: liveManagementHeaders(options),
        credentials: options.credentials,
      },
    );
  }

  adminBlogTags(
    options: BackyLiveManagementRequestOptions = {},
  ): Promise<BackyAdminBlogTagsResponse> {
    return this.request(
      `/api/admin/sites/${encodeURIComponent(options.siteId ?? this.requireSiteId())}/blog/tags`,
      {
        requestId: options.requestId,
        headers: liveManagementHeaders(options),
        credentials: options.credentials,
      },
    );
  }

  createAdminBlogTag(
    input: BackyAdminBlogTagInput,
    options: BackyLiveManagementRequestOptions = {},
  ): Promise<BackyAdminBlogTagResponse> {
    const { requestId, ...body } = input;
    return this.request(
      `/api/admin/sites/${encodeURIComponent(options.siteId ?? this.requireSiteId())}/blog/tags`,
      {
        method: "POST",
        body,
        requestId: options.requestId ?? requestId,
        headers: liveManagementHeaders(options),
        credentials: options.credentials,
      },
    );
  }

  adminBlogTag(
    tagId: string,
    options: BackyLiveManagementRequestOptions = {},
  ): Promise<BackyAdminBlogTagResponse> {
    return this.request(
      `/api/admin/sites/${encodeURIComponent(options.siteId ?? this.requireSiteId())}/blog/tags/${encodeURIComponent(tagId)}`,
      {
        requestId: options.requestId,
        headers: liveManagementHeaders(options),
        credentials: options.credentials,
      },
    );
  }

  updateAdminBlogTag(
    tagId: string,
    input: BackyAdminBlogTagUpdateInput,
    options: BackyLiveManagementRequestOptions = {},
  ): Promise<BackyAdminBlogTagResponse> {
    const { requestId: inputRequestId, ...body } = input;
    const requestId =
      typeof inputRequestId === "string" ? inputRequestId : undefined;
    return this.request(
      `/api/admin/sites/${encodeURIComponent(options.siteId ?? this.requireSiteId())}/blog/tags/${encodeURIComponent(tagId)}`,
      {
        method: "PATCH",
        body,
        requestId: options.requestId ?? requestId,
        headers: liveManagementHeaders(options),
        credentials: options.credentials,
      },
    );
  }

  deleteAdminBlogTag(
    tagId: string,
    options: BackyLiveManagementRequestOptions = {},
  ): Promise<BackyAdminBlogTagDeleteResponse> {
    return this.request(
      `/api/admin/sites/${encodeURIComponent(options.siteId ?? this.requireSiteId())}/blog/tags/${encodeURIComponent(tagId)}`,
      {
        method: "DELETE",
        requestId: options.requestId,
        headers: liveManagementHeaders(options),
        credentials: options.credentials,
      },
    );
  }

  adminBlogAuthors(
    options: BackyLiveManagementRequestOptions = {},
  ): Promise<BackyAdminBlogAuthorsResponse> {
    return this.request(
      `/api/admin/sites/${encodeURIComponent(options.siteId ?? this.requireSiteId())}/blog/authors`,
      {
        requestId: options.requestId,
        headers: liveManagementHeaders(options),
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

  adminMediaVersions(
    mediaId: string,
    options: BackyAdminMediaVersionsOptions = {},
  ): Promise<BackyAdminMediaVersionsResponse> {
    const { requestId, siteId, headers, credentials, rest } =
      splitLiveManagementRequestOptions(options);
    const query = normalizeListQuery({
      limit: rest.limit,
      offset: rest.offset,
    });
    return this.request(
      `/api/admin/sites/${encodeURIComponent(siteId ?? this.requireSiteId())}/media/${encodeURIComponent(mediaId)}/versions`,
      {
        query,
        requestId,
        headers,
        credentials,
      },
    );
  }

  restoreMediaVersion(
    mediaId: string,
    versionId: string,
    input: BackyAdminMediaVersionRestoreInput = {},
    options: BackyLiveManagementRequestOptions = {},
  ): Promise<BackyAdminMediaVersionRestoreResponse> {
    const { requestId, ...body } = input;
    return this.request(
      `/api/admin/sites/${encodeURIComponent(options.siteId ?? this.requireSiteId())}/media/${encodeURIComponent(mediaId)}/versions/${encodeURIComponent(versionId)}`,
      {
        method: "POST",
        body,
        requestId: options.requestId ?? requestId,
        headers: liveManagementHeaders(options),
        credentials: options.credentials,
      },
    );
  }

  deleteMediaVersion(
    mediaId: string,
    versionId: string,
    options: BackyLiveManagementRequestOptions = {},
  ): Promise<BackyAdminMediaVersionDeleteResponse> {
    return this.request(
      `/api/admin/sites/${encodeURIComponent(options.siteId ?? this.requireSiteId())}/media/${encodeURIComponent(mediaId)}/versions/${encodeURIComponent(versionId)}`,
      {
        method: "DELETE",
        requestId: options.requestId,
        headers: liveManagementHeaders(options),
        credentials: options.credentials,
      },
    );
  }

  prepareMediaTransforms(
    mediaId: string,
    input: BackyAdminMediaTransformInput = {},
    options: BackyLiveManagementRequestOptions = {},
  ): Promise<BackyAdminMediaTransformsResponse> {
    const { requestId, ...body } = input;
    return this.request(
      `/api/admin/sites/${encodeURIComponent(options.siteId ?? this.requireSiteId())}/media/${encodeURIComponent(mediaId)}/transforms`,
      {
        method: "POST",
        body,
        requestId: options.requestId ?? requestId,
        headers: liveManagementHeaders(options),
        credentials: options.credentials,
      },
    );
  }

  ingestMediaProviderAnalytics(
    input: BackyAdminMediaProviderAnalyticsInput,
    options: BackyLiveManagementRequestOptions = {},
  ): Promise<BackyAdminMediaProviderAnalyticsResponse> {
    const { requestId, ...body } = input;
    return this.request(
      `/api/admin/sites/${encodeURIComponent(options.siteId ?? this.requireSiteId())}/media/provider-analytics`,
      {
        method: "POST",
        body,
        requestId: options.requestId ?? requestId,
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
    access: BackyMediaFileUrlAccess = {},
  ): string {
    return buildBackyMediaFileUrl(
      this.baseUrl,
      access.siteId ?? this.requireSiteId(),
      mediaId,
      access,
    );
  }

  mediaFileCached(
    mediaId: string,
    options: BackyMediaFileCachedOptions = {},
  ): Promise<BackyMediaFileCachedResult> {
    return this.requestConditionalArrayBuffer(
      buildBackyMediaFilePath(options.siteId ?? this.requireSiteId(), mediaId, options),
      {
        ifNoneMatch: options.etag,
        requestId: options.requestId,
        credentials: options.credentials,
      },
    );
  }

  mediaDownloadLinkProps(
    mediaId: string,
    options: BackyMediaDownloadLinkPropsOptions = {},
  ): BackyMediaDownloadLinkProps {
    return buildBackyMediaDownloadLinkProps(
      options.siteId ?? this.requireSiteId(),
      mediaId,
      {
        baseUrl: this.baseUrl,
        ...options,
      },
    );
  }

  mediaTransformUrl(
    mediaId: string,
    options: BackyMediaTransformUrlOptions,
  ): string {
    return buildBackyMediaTransformUrl(
      this.baseUrl,
      options.siteId ?? this.requireSiteId(),
      mediaId,
      options,
    );
  }

  mediaTransformCached(
    mediaId: string,
    options: BackyMediaTransformCachedOptions,
  ): Promise<BackyMediaTransformCachedResult> {
    return this.requestConditionalRedirect(
      buildBackyMediaTransformPath(options.siteId ?? this.requireSiteId(), mediaId, options),
      {
        ifNoneMatch: options.etag,
        requestId: options.requestId,
        credentials: options.credentials,
      },
    );
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

  exportAdminCollectionsBackup<
    TValues extends Record<string, unknown> = Record<string, unknown>,
  >(
    options: BackyAdminCollectionsBackupOptions = {},
  ): Promise<BackyAdminCollectionsBackupResponse<TValues>> {
    const { requestId, siteId, headers, credentials, rest } =
      splitLiveManagementRequestOptions(options);
    return this.request(
      `/api/admin/sites/${encodeURIComponent(siteId ?? this.requireSiteId())}/collections/export`,
      {
        query: {
          ids: rest.collectionIds?.join(","),
          records:
            rest.includeRecords === undefined ? undefined : rest.includeRecords,
        },
        requestId,
        headers,
        credentials,
      },
    );
  }

  importAdminCollectionsBackup<
    TValues extends Record<string, unknown> = Record<string, unknown>,
  >(
    backup: BackyAdminCollectionsBackup<TValues> | { collections?: unknown[] },
    options: BackyAdminCollectionsBackupImportOptions = {},
  ): Promise<BackyAdminCollectionsBackupImportResponse<TValues>> {
    const { requestId, siteId, headers, credentials, rest } =
      splitLiveManagementRequestOptions(options);
    return this.request(
      `/api/admin/sites/${encodeURIComponent(siteId ?? this.requireSiteId())}/collections/import`,
      {
        method: "POST",
        query: {
          upsert: rest.upsert,
        },
        body: backup,
        requestId,
        headers,
        credentials,
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

  adminCollectionRecordsCsv(
    collectionId: string,
    options: BackyAdminCollectionRecordsCsvOptions = {},
  ): Promise<string> {
    const { requestId, siteId, headers, credentials, rest } =
      splitLiveManagementRequestOptions(options);
    return this.requestText(
      `/api/admin/sites/${encodeURIComponent(siteId ?? this.requireSiteId())}/collections/${encodeURIComponent(collectionId)}/records`,
      {
        query: {
          format: "csv",
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
        },
        requestId,
        headers,
        credentials,
      },
    );
  }

  importAdminCollectionRecordsCsv<
    TValues extends Record<string, unknown> = Record<string, unknown>,
  >(
    collectionId: string,
    csv: string,
    options: BackyAdminCollectionRecordImportOptions = {},
  ): Promise<BackyAdminCollectionRecordImportResponse<TValues>> {
    const { requestId, siteId, headers, credentials, rest } =
      splitLiveManagementRequestOptions(options);
    const requestHeaders = new Headers(headers);
    if (!requestHeaders.has("content-type")) {
      requestHeaders.set("content-type", "text/csv; charset=utf-8");
    }
    return this.request(
      `/api/admin/sites/${encodeURIComponent(siteId ?? this.requireSiteId())}/collections/${encodeURIComponent(collectionId)}/records/import`,
      {
        method: "POST",
        query: {
          upsert: rest.upsert,
        },
        body: csv,
        requestId,
        headers: requestHeaders,
        credentials,
      },
    );
  }

  bulkAdminCollectionRecords<
    TValues extends Record<string, unknown> = Record<string, unknown>,
  >(
    collectionId: string,
    input: BackyAdminCollectionRecordBulkInput,
    options: BackyLiveManagementRequestOptions = {},
  ): Promise<BackyAdminCollectionRecordBulkResponse<TValues>> {
    const { requestId, ...body } = input;
    return this.request(
      `/api/admin/sites/${encodeURIComponent(options.siteId ?? this.requireSiteId())}/collections/${encodeURIComponent(collectionId)}/records/bulk`,
      {
        method: "POST",
        body,
        requestId: options.requestId ?? requestId,
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

  exportAdminReusableSections(
    options: BackyAdminReusableSectionExportOptions = {},
  ): Promise<BackyAdminReusableSectionExportResponse> {
    const { requestId, siteId, headers, credentials, rest } =
      splitLiveManagementRequestOptions(options);
    return this.request(
      `/api/admin/sites/${encodeURIComponent(siteId ?? this.requireSiteId())}/reusable-sections/export`,
      {
        query: {
          status: rest.status,
          category: rest.category,
          tag: rest.tag,
          search: rest.search,
          sectionIds: rest.sectionIds?.join(","),
        },
        requestId,
        headers,
        credentials,
      },
    );
  }

  importAdminReusableSections(
    input: BackyAdminReusableSectionImportInput,
    options: BackyAdminReusableSectionImportOptions = {},
  ): Promise<BackyAdminReusableSectionImportResponse> {
    const { requestId: inputRequestId, ...body } = input;
    const { requestId, siteId, headers, credentials, rest } =
      splitLiveManagementRequestOptions(options);
    return this.request(
      `/api/admin/sites/${encodeURIComponent(siteId ?? this.requireSiteId())}/reusable-sections/import`,
      {
        method: "POST",
        query: {
          upsert: rest.upsert,
        },
        body,
        requestId: requestId ?? inputRequestId,
        headers,
        credentials,
      },
    );
  }

  adminReusableSectionInstances(
    sectionId: string,
    options: BackyAdminReusableSectionInstancesOptions = {},
  ): Promise<BackyAdminReusableSectionInstancesResponse> {
    const { requestId, siteId, headers, credentials, rest } =
      splitLiveManagementRequestOptions(options);
    return this.request(
      `/api/admin/sites/${encodeURIComponent(siteId ?? this.requireSiteId())}/reusable-sections/${encodeURIComponent(sectionId)}/instances`,
      {
        query: {
          targetType: rest.targetType,
          targetId: rest.targetId,
        },
        requestId,
        headers,
        credentials,
      },
    );
  }

  refreshAdminReusableSectionInstances(
    sectionId: string,
    input: BackyAdminReusableSectionInstancesRefreshInput = {},
    options: BackyLiveManagementRequestOptions = {},
  ): Promise<BackyAdminReusableSectionInstancesRefreshResponse> {
    const { requestId, ...body } = input;
    return this.request(
      `/api/admin/sites/${encodeURIComponent(options.siteId ?? this.requireSiteId())}/reusable-sections/${encodeURIComponent(sectionId)}/instances`,
      {
        method: "POST",
        body,
        requestId: options.requestId ?? requestId,
        headers: liveManagementHeaders(options),
        credentials: options.credentials,
      },
    );
  }

  adminReusableSectionMetadata(
    sectionId: string,
    options: BackyLiveManagementRequestOptions = {},
  ): Promise<BackyAdminReusableSectionMetadataResponse> {
    return this.request(
      `/api/admin/sites/${encodeURIComponent(options.siteId ?? this.requireSiteId())}/reusable-sections/${encodeURIComponent(sectionId)}/metadata`,
      {
        requestId: options.requestId,
        headers: liveManagementHeaders(options),
        credentials: options.credentials,
      },
    );
  }

  updateAdminReusableSectionMetadata(
    sectionId: string,
    input: BackyAdminReusableSectionMetadataUpdateInput,
    options: BackyLiveManagementRequestOptions = {},
  ): Promise<BackyAdminReusableSectionMetadataUpdateResponse> {
    const { requestId, ...body } = input;
    return this.request(
      `/api/admin/sites/${encodeURIComponent(options.siteId ?? this.requireSiteId())}/reusable-sections/${encodeURIComponent(sectionId)}/metadata`,
      {
        method: "PATCH",
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

  adminCommerceProducts<
    TValues extends Record<string, unknown> = BackyAdminCommerceProductValues,
  >(
    options: BackyAdminCommerceProductListOptions = {},
  ): Promise<BackyAdminCommerceProductsResponse<TValues>> {
    const {
      collectionId = BACKY_COMMERCE_PRODUCTS_COLLECTION,
      ...recordOptions
    } = options;
    return this.adminCollectionRecords<TValues>(collectionId, recordOptions);
  }

  createAdminCommerceProduct<
    TValues extends Record<string, unknown> = BackyAdminCommerceProductValues,
  >(
    input: BackyAdminCommerceProductCreateInput<TValues>,
    options: BackyAdminCommerceProductRequestOptions = {},
  ): Promise<BackyAdminCommerceProductResponse<TValues>> {
    const {
      collectionId = BACKY_COMMERCE_PRODUCTS_COLLECTION,
      ...requestOptions
    } = options;
    return this.createAdminCollectionRecord<TValues>(
      collectionId,
      input,
      requestOptions,
    );
  }

  adminCommerceProduct<
    TValues extends Record<string, unknown> = BackyAdminCommerceProductValues,
  >(
    productId: string,
    options: BackyAdminCommerceProductRequestOptions = {},
  ): Promise<BackyAdminCommerceProductResponse<TValues>> {
    const {
      collectionId = BACKY_COMMERCE_PRODUCTS_COLLECTION,
      ...requestOptions
    } = options;
    return this.adminCollectionRecord<TValues>(
      collectionId,
      productId,
      requestOptions,
    );
  }

  updateAdminCommerceProduct<
    TValues extends Record<string, unknown> = BackyAdminCommerceProductValues,
  >(
    productId: string,
    input: BackyAdminCommerceProductUpdateInput<TValues>,
    options: BackyAdminCommerceProductRequestOptions = {},
  ): Promise<BackyAdminCommerceProductResponse<TValues>> {
    const {
      collectionId = BACKY_COMMERCE_PRODUCTS_COLLECTION,
      ...requestOptions
    } = options;
    return this.updateAdminCollectionRecord<TValues>(
      collectionId,
      productId,
      input,
      requestOptions,
    );
  }

  deleteAdminCommerceProduct(
    productId: string,
    options: BackyAdminCommerceProductRequestOptions = {},
  ): Promise<BackyAdminCommerceProductDeleteResponse> {
    const {
      collectionId = BACKY_COMMERCE_PRODUCTS_COLLECTION,
      ...requestOptions
    } = options;
    return this.deleteAdminCollectionRecord(
      collectionId,
      productId,
      requestOptions,
    );
  }

  adminCommerceProductsCsv(
    options: BackyAdminCommerceProductListOptions = {},
  ): Promise<string> {
    const {
      collectionId = BACKY_COMMERCE_PRODUCTS_COLLECTION,
      ...requestOptions
    } = options;
    return this.adminCollectionRecordsCsv(collectionId, requestOptions);
  }

  importAdminCommerceProductsCsv<
    TValues extends Record<string, unknown> = BackyAdminCommerceProductValues,
  >(
    csv: string,
    options: BackyAdminCommerceProductImportOptions = {},
  ): Promise<BackyAdminCommerceProductImportResponse<TValues>> {
    const {
      collectionId = BACKY_COMMERCE_PRODUCTS_COLLECTION,
      ...requestOptions
    } = options;
    return this.importAdminCollectionRecordsCsv<TValues>(
      collectionId,
      csv,
      requestOptions,
    );
  }

  bulkAdminCommerceProducts<
    TValues extends Record<string, unknown> = BackyAdminCommerceProductValues,
  >(
    input: BackyAdminCommerceProductBulkInput,
    options: BackyAdminCommerceProductRequestOptions = {},
  ): Promise<BackyAdminCommerceProductBulkResponse<TValues>> {
    const {
      collectionId = BACKY_COMMERCE_PRODUCTS_COLLECTION,
      ...requestOptions
    } = options;
    return this.bulkAdminCollectionRecords<TValues>(
      collectionId,
      input,
      requestOptions,
    );
  }

  adminCommerceOrders<
    TValues extends Record<string, unknown> = BackyAdminCommerceOrderValues,
  >(
    options: BackyAdminCommerceOrderListOptions = {},
  ): Promise<BackyAdminCommerceOrdersResponse<TValues>> {
    const {
      collectionId = BACKY_COMMERCE_ORDERS_COLLECTION,
      ...recordOptions
    } = options;
    return this.adminCollectionRecords<TValues>(collectionId, recordOptions);
  }

  createAdminCommerceOrder<
    TValues extends Record<string, unknown> = BackyAdminCommerceOrderValues,
  >(
    input: BackyAdminCommerceOrderCreateInput<TValues>,
    options: BackyAdminCommerceOrderRequestOptions = {},
  ): Promise<BackyAdminCommerceOrderResponse<TValues>> {
    const {
      collectionId = BACKY_COMMERCE_ORDERS_COLLECTION,
      ...requestOptions
    } = options;
    return this.createAdminCollectionRecord<TValues>(
      collectionId,
      input,
      requestOptions,
    );
  }

  adminCommerceOrder<
    TValues extends Record<string, unknown> = BackyAdminCommerceOrderValues,
  >(
    orderId: string,
    options: BackyAdminCommerceOrderRequestOptions = {},
  ): Promise<BackyAdminCommerceOrderResponse<TValues>> {
    const {
      collectionId = BACKY_COMMERCE_ORDERS_COLLECTION,
      ...requestOptions
    } = options;
    return this.adminCollectionRecord<TValues>(
      collectionId,
      orderId,
      requestOptions,
    );
  }

  updateAdminCommerceOrder<
    TValues extends Record<string, unknown> = BackyAdminCommerceOrderValues,
  >(
    orderId: string,
    input: BackyAdminCommerceOrderUpdateInput<TValues>,
    options: BackyAdminCommerceOrderRequestOptions = {},
  ): Promise<BackyAdminCommerceOrderResponse<TValues>> {
    const {
      collectionId = BACKY_COMMERCE_ORDERS_COLLECTION,
      ...requestOptions
    } = options;
    return this.updateAdminCollectionRecord<TValues>(
      collectionId,
      orderId,
      input,
      requestOptions,
    );
  }

  deleteAdminCommerceOrder(
    orderId: string,
    options: BackyAdminCommerceOrderRequestOptions = {},
  ): Promise<BackyAdminCommerceOrderDeleteResponse> {
    const {
      collectionId = BACKY_COMMERCE_ORDERS_COLLECTION,
      ...requestOptions
    } = options;
    return this.deleteAdminCollectionRecord(
      collectionId,
      orderId,
      requestOptions,
    );
  }

  adminCommerceOrdersCsv(
    options: BackyAdminCommerceOrderListOptions = {},
  ): Promise<string> {
    const {
      collectionId = BACKY_COMMERCE_ORDERS_COLLECTION,
      ...requestOptions
    } = options;
    return this.adminCollectionRecordsCsv(collectionId, requestOptions);
  }

  importAdminCommerceOrdersCsv<
    TValues extends Record<string, unknown> = BackyAdminCommerceOrderValues,
  >(
    csv: string,
    options: BackyAdminCommerceOrderImportOptions = {},
  ): Promise<BackyAdminCommerceOrderImportResponse<TValues>> {
    const {
      collectionId = BACKY_COMMERCE_ORDERS_COLLECTION,
      ...requestOptions
    } = options;
    return this.importAdminCollectionRecordsCsv<TValues>(
      collectionId,
      csv,
      requestOptions,
    );
  }

  bulkAdminCommerceOrders<
    TValues extends Record<string, unknown> = BackyAdminCommerceOrderValues,
  >(
    input: BackyAdminCommerceOrderBulkInput,
    options: BackyAdminCommerceOrderRequestOptions = {},
  ): Promise<BackyAdminCommerceOrderBulkResponse<TValues>> {
    const {
      collectionId = BACKY_COMMERCE_ORDERS_COLLECTION,
      ...requestOptions
    } = options;
    return this.bulkAdminCollectionRecords<TValues>(
      collectionId,
      input,
      requestOptions,
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

  commerceOrderStatusHandoff(
    orderId: string,
    options: BackyLiveManagementRequestOptions = {},
  ): Promise<BackyCommerceOrderStatusHandoffResponse> {
    return this.request(
      `/api/admin/sites/${encodeURIComponent(options.siteId ?? this.requireSiteId())}/commerce/orders/${encodeURIComponent(orderId)}/status-handoff`,
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

  commerceReconciliationReadiness(
    options: BackyLiveManagementRequestOptions = {},
  ): Promise<BackyCommerceReconciliationReadinessResponse> {
    return this.request("/api/admin/commerce/reconcile/readiness", {
      requestId: options.requestId,
      headers: liveManagementHeaders(options),
      credentials: options.credentials,
    });
  }

  scheduledPlatformCommerceReconciliation(
    options: BackyCommercePlatformReconciliationOptions = {},
  ): Promise<BackyCommerceReconciliationBatchResponse> {
    return this.request("/api/admin/commerce/reconcile", {
      query: {
        dryRun: options.dryRun,
        limit: options.limit,
        siteId: options.siteId,
      },
      requestId: options.requestId,
      headers: liveManagementHeaders(options),
      credentials: options.credentials,
    });
  }

  commerceOrderPublicStatusHandoff(
    orderIdOrSlug: string,
    statusToken: string,
    options: BackyCommerceOrderPublicStatusOptions = {},
  ): Promise<BackyCommerceOrderStatusHandoffResponse> {
    const lookupBy = options.lookupBy ?? "orderId";
    return this.request(
      `/api/sites/${encodeURIComponent(options.siteId ?? this.requireSiteId())}/commerce/orders`,
      {
        query: {
          [lookupBy]: orderIdOrSlug,
          statusToken,
        },
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
      quote: Record<string, unknown>;
      lineItems: Array<Record<string, unknown>>;
      statusHandoff: BackyCommerceOrderStatusHandoff;
      statusAccess: BackyCommerceOrderStatusAccess;
      risk?: Record<string, unknown>;
      deliveries?: Array<Record<string, unknown>>;
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

  cloneAdminForm(
    formId: string,
    input: BackyAdminFormCloneInput = {},
    options: BackyLiveManagementRequestOptions = {},
  ): Promise<BackyAdminFormCloneResponse> {
    const { requestId, ...body } = input;
    return this.request(
      `/api/admin/sites/${encodeURIComponent(options.siteId ?? this.requireSiteId())}/forms/${encodeURIComponent(formId)}/clone`,
      {
        method: "POST",
        body,
        requestId: options.requestId ?? requestId,
        headers: liveManagementHeaders(options),
        credentials: options.credentials,
      },
    );
  }

  createAdminFormEmbedBlock(
    formId: string,
    input: BackyAdminFormEmbedBlockInput = {},
    options: BackyLiveManagementRequestOptions = {},
  ): Promise<BackyAdminFormEmbedBlockResponse> {
    const { requestId, ...body } = input;
    return this.request(
      `/api/admin/sites/${encodeURIComponent(options.siteId ?? this.requireSiteId())}/forms/${encodeURIComponent(formId)}/embed-block`,
      {
        method: "POST",
        body,
        requestId: options.requestId ?? requestId,
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

  reviewFormSubmission(
    formId: string,
    submissionId: string,
    input: BackyAdminFormSubmissionReviewInput,
    options: BackyLiveManagementRequestOptions = {},
  ): Promise<BackyAdminFormSubmissionResponse> {
    const { requestId, ...body } = input;
    return this.request(
      `/api/admin/sites/${encodeURIComponent(options.siteId ?? this.requireSiteId())}/forms/${encodeURIComponent(formId)}/submissions/${encodeURIComponent(submissionId)}/review`,
      {
        method: "POST",
        body,
        requestId: options.requestId ?? requestId,
        headers: liveManagementHeaders(options),
        credentials: options.credentials,
      },
    );
  }

  retryFormSubmissionWebhook(
    formId: string,
    submissionId: string,
    input: BackyAdminFormDeliveryRetryInput = {},
    options: BackyLiveManagementRequestOptions = {},
  ): Promise<BackyAdminFormDeliveryRetryResponse> {
    const { requestId, ...body } = input;
    return this.request(
      `/api/admin/sites/${encodeURIComponent(options.siteId ?? this.requireSiteId())}/forms/${encodeURIComponent(formId)}/submissions/${encodeURIComponent(submissionId)}/webhook-retry`,
      {
        method: "POST",
        body,
        requestId: options.requestId ?? requestId,
        headers: liveManagementHeaders(options),
        credentials: options.credentials,
      },
    );
  }

  retryFormSubmissionEmail(
    formId: string,
    submissionId: string,
    input: BackyAdminFormDeliveryRetryInput = {},
    options: BackyLiveManagementRequestOptions = {},
  ): Promise<BackyAdminFormDeliveryRetryResponse> {
    const { requestId, ...body } = input;
    return this.request(
      `/api/admin/sites/${encodeURIComponent(options.siteId ?? this.requireSiteId())}/forms/${encodeURIComponent(formId)}/submissions/${encodeURIComponent(submissionId)}/email-retry`,
      {
        method: "POST",
        body,
        requestId: options.requestId ?? requestId,
        headers: liveManagementHeaders(options),
        credentials: options.credentials,
      },
    );
  }

  applyAdminFormConsentRetention(
    formId: string,
    input: BackyAdminFormConsentRetentionInput = {},
    options: BackyLiveManagementRequestOptions = {},
  ): Promise<BackyAdminFormConsentRetentionResponse> {
    const { requestId, ...body } = input;
    return this.request(
      `/api/admin/sites/${encodeURIComponent(options.siteId ?? this.requireSiteId())}/forms/${encodeURIComponent(formId)}/consent-retention`,
      {
        method: "POST",
        body,
        requestId: options.requestId ?? requestId,
        headers: liveManagementHeaders(options),
        credentials: options.credentials,
      },
    );
  }

  applyAdminFormsConsentRetention(
    input: BackyAdminFormConsentRetentionInput = {},
    options: BackyLiveManagementRequestOptions = {},
  ): Promise<BackyAdminFormsConsentRetentionResponse> {
    const { requestId, ...body } = input;
    return this.request(
      `/api/admin/sites/${encodeURIComponent(options.siteId ?? this.requireSiteId())}/forms/consent-retention`,
      {
        method: "POST",
        body,
        requestId: options.requestId ?? requestId,
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

  createFormContact(
    formId: string,
    input: BackyAdminFormContactInput,
    options: BackyLiveManagementRequestOptions = {},
  ): Promise<BackyAdminFormContactResponse> {
    const { requestId, ...body } = input;
    return this.request(
      `/api/admin/sites/${encodeURIComponent(options.siteId ?? this.requireSiteId())}/forms/${encodeURIComponent(formId)}/contacts`,
      {
        method: "POST",
        body,
        requestId:
          options.requestId ??
          (typeof requestId === "string" ? requestId : undefined),
        headers: liveManagementHeaders(options),
        credentials: options.credentials,
      },
    );
  }

  importFormContactsCsv(
    formId: string,
    csv: string,
    options: BackyAdminFormContactImportOptions = {},
  ): Promise<BackyAdminFormContactImportResponse> {
    const { requestId, siteId, headers, credentials, rest } =
      splitLiveManagementRequestOptions(options);
    const requestHeaders = new Headers(headers);
    if (!requestHeaders.has("content-type")) {
      requestHeaders.set("content-type", "text/csv; charset=utf-8");
    }
    return this.request(
      `/api/admin/sites/${encodeURIComponent(siteId ?? this.requireSiteId())}/forms/${encodeURIComponent(formId)}/contacts/import`,
      {
        method: "POST",
        query: {
          upsertByEmail: rest.upsertByEmail ?? rest.upsert,
        },
        body: csv,
        requestId,
        headers: requestHeaders,
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

  promoteFormContactToUser(
    formId: string,
    contactId: string,
    input: BackyAdminFormContactUserPromotionInput = {},
    options: BackyLiveManagementRequestOptions = {},
  ): Promise<BackyAdminFormContactUserPromotionResponse> {
    const { requestId, ...body } = input;
    return this.request(
      `/api/admin/sites/${encodeURIComponent(options.siteId ?? this.requireSiteId())}/forms/${encodeURIComponent(formId)}/contacts/${encodeURIComponent(contactId)}/promote`,
      {
        method: "POST",
        body,
        requestId: options.requestId ?? requestId,
        headers: liveManagementHeaders(options),
        credentials: options.credentials,
      },
    );
  }

  promoteFormContactToCustomer<
    TValues extends Record<string, unknown> = Record<string, unknown>,
  >(
    formId: string,
    contactId: string,
    input: BackyAdminFormContactCustomerPromotionInput = {},
    options: BackyLiveManagementRequestOptions = {},
  ): Promise<BackyAdminFormContactCustomerPromotionResponse<TValues>> {
    const { requestId, ...body } = input;
    return this.request(
      `/api/admin/sites/${encodeURIComponent(options.siteId ?? this.requireSiteId())}/forms/${encodeURIComponent(formId)}/contacts/${encodeURIComponent(contactId)}/promote-customer`,
      {
        method: "POST",
        body,
        requestId: options.requestId ?? requestId,
        headers: liveManagementHeaders(options),
        credentials: options.credentials,
      },
    );
  }

  syncFormContacts(
    formId: string,
    input: BackyAdminFormContactSyncInput,
    options: BackyLiveManagementRequestOptions = {},
  ): Promise<BackyAdminFormContactSyncResponse> {
    const { requestId, ...body } = input;
    return this.request(
      `/api/admin/sites/${encodeURIComponent(options.siteId ?? this.requireSiteId())}/forms/${encodeURIComponent(formId)}/contacts/sync`,
      {
        method: "POST",
        body,
        requestId: options.requestId ?? requestId,
        headers: liveManagementHeaders(options),
        credentials: options.credentials,
      },
    );
  }

  applyFormContactConsentRetention(
    formId: string,
    input: BackyAdminFormContactConsentRetentionInput = {},
    options: BackyLiveManagementRequestOptions = {},
  ): Promise<BackyAdminFormContactConsentRetentionResponse> {
    const { requestId, ...body } = input;
    return this.request(
      `/api/admin/sites/${encodeURIComponent(options.siteId ?? this.requireSiteId())}/forms/${encodeURIComponent(formId)}/contacts/consent-retention`,
      {
        method: "POST",
        body,
        requestId: options.requestId ?? requestId,
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
  ): Promise<BackySiteCommentsResponse> {
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
  ): Promise<BackyCommentBulkUpdateResponse> {
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
  ): Promise<BackyCommentBulkUpdateResponse> {
    return this.updateComments({
      ...input,
      commentIds,
      action: "clearReports",
    });
  }

  commentBlocklist(
    options: BackyCommentBlocklistOptions = {},
  ): Promise<BackyCommentBlocklistResponse> {
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
  ): Promise<BackyCommentBlocklistDeleteResponse> {
    return this.request(
      `/api/sites/${encodeURIComponent(this.requireSiteId())}/comments/blocklist`,
      {
        method: "DELETE",
        body: { ids },
        requestId: input.requestId,
      },
    );
  }

  commentAnalytics(
    options: BackyCommentAnalyticsOptions = {},
  ): Promise<BackyCommentAnalyticsResponse> {
    const { requestId, siteId, headers, credentials, rest } =
      splitLiveManagementRequestOptions(options);
    const query = normalizeListQuery(
      rest as Record<string, string | number | boolean | undefined>,
    );
    return this.request(
      `/api/sites/${encodeURIComponent(siteId ?? this.requireSiteId())}/comments/analytics`,
      {
        query,
        requestId,
        headers,
        credentials,
      },
    );
  }

  comment(commentId: string): Promise<BackySiteCommentResponse> {
    return this.request(
      `/api/sites/${encodeURIComponent(this.requireSiteId())}/comments/${encodeURIComponent(commentId)}`,
    );
  }

  updateComment(
    commentId: string,
    updates: Record<string, unknown>,
  ): Promise<BackySiteCommentResponse> {
    return this.request(
      `/api/sites/${encodeURIComponent(this.requireSiteId())}/comments/${encodeURIComponent(commentId)}`,
      {
        method: "PATCH",
        body: updates,
      },
    );
  }

  deleteComment(commentId: string): Promise<BackyCommentDeleteResponse> {
    return this.request(
      `/api/sites/${encodeURIComponent(this.requireSiteId())}/comments/${encodeURIComponent(commentId)}`,
      {
        method: "DELETE",
      },
    );
  }

  retryCommentDelivery(
    commentId: string,
    input: BackyCommentDeliveryRetryInput,
    options: BackyLiveManagementRequestOptions = {},
  ): Promise<BackyCommentDeliveryRetryResponse> {
    const { requestId, ...body } = input;
    return this.request(
      `/api/sites/${encodeURIComponent(options.siteId ?? this.requireSiteId())}/comments/${encodeURIComponent(commentId)}/delivery-retry`,
      {
        method: "POST",
        body,
        requestId: options.requestId ?? requestId,
        headers: liveManagementHeaders(options),
        credentials: options.credentials,
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
    const { requestId, siteId, eventRequestId, ...queryOptions } = options;
    const query = normalizeListQuery(queryOptions);
    if (eventRequestId) {
      query.requestId = eventRequestId;
    }
    return this.request(
      `/api/sites/${encodeURIComponent(siteId ?? this.requireSiteId())}/events`,
      {
        query,
        requestId,
      },
    );
  }

  adminSiteEvents(
    options: BackyAdminSiteEventListOptions = {},
  ): Promise<BackyAdminSiteEventsResponse> {
    const { requestId, siteId, headers, credentials, rest } =
      splitLiveManagementRequestOptions(options);
    const { eventRequestId, ...queryOptions } = rest;
    const query = normalizeListQuery(
      queryOptions as BackyListOptions &
        Record<string, string | number | boolean | undefined>,
    );
    if (eventRequestId) {
      query.requestId = eventRequestId;
    }

    return this.request(
      `/api/sites/${encodeURIComponent(siteId ?? this.requireSiteId())}/events`,
      {
        query,
        requestId,
        headers,
        credentials,
      },
    );
  }

  formDeliveryEvents(
    formId: string,
    options: Omit<BackyAdminSiteEventListOptions, "kind" | "formId"> = {},
  ): Promise<BackyAdminSiteEventsResponse> {
    return this.adminSiteEvents({
      ...options,
      kind: "form-submission",
      formId,
    });
  }

  orderDeliveryEvents(
    options: Omit<BackyAdminSiteEventListOptions, "kind"> = {},
  ): Promise<BackyAdminSiteEventsResponse> {
    return this.adminSiteEvents({
      ...options,
      kind: "commerce-order",
    });
  }

  productNotificationEvents(
    options: Omit<BackyAdminSiteEventListOptions, "kind"> = {},
  ): Promise<BackyAdminSiteEventsResponse> {
    return this.adminSiteEvents({
      ...options,
      kind: "commerce-product",
    });
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

  private async requestConditionalArrayBuffer(
    path: string,
    options: {
      requestId?: string;
      ifNoneMatch?: string;
      headers?: HeadersInit;
      credentials?: RequestCredentials;
    } = {},
  ): Promise<BackyConditionalResult<ArrayBuffer>> {
    const response = await this.fetchRaw(path, options);
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
      await throwBackyResponseError(response, responsePath);
    }

    return {
      notModified: false,
      status: response.status,
      body: await response.arrayBuffer(),
      meta,
    };
  }

  private async requestConditionalRedirect(
    path: string,
    options: {
      requestId?: string;
      ifNoneMatch?: string;
      headers?: HeadersInit;
      credentials?: RequestCredentials;
    } = {},
  ): Promise<BackyConditionalResult<null>> {
    const response = await this.fetchRaw(path, {
      ...options,
      redirect: "manual",
    });
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

    if (response.status >= 300 && response.status < 400) {
      return {
        notModified: false,
        status: response.status,
        body: null,
        meta,
      };
    }

    if (!response.ok) {
      await throwBackyResponseError(response, responsePath);
    }

    return {
      notModified: false,
      status: response.status,
      body: null,
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

  private async fetchRaw(
    path: string,
    options: {
      requestId?: string;
      ifNoneMatch?: string;
      headers?: HeadersInit;
      credentials?: RequestCredentials;
      redirect?: RequestRedirect;
    } = {},
  ): Promise<Response> {
    const url = new URL(
      path.startsWith("http") ? path : `${this.baseUrl}${path}`,
    );

    const headers = new Headers(this.defaultHeaders);
    new Headers(options.headers).forEach((value, key) => {
      headers.set(key, value);
    });
    headers.set("x-request-id", options.requestId ?? this.requestIdFactory());
    if (options.ifNoneMatch) {
      headers.set("if-none-match", options.ifNoneMatch);
    }
    const credentials = options.credentials ?? this.defaultCredentials;

    return this.fetchImpl(url, {
      method: "GET",
      headers,
      ...(credentials ? { credentials } : {}),
      ...(options.redirect ? { redirect: options.redirect } : {}),
    });
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

async function throwBackyResponseError(
  response: Response,
  responsePath: string,
): Promise<never> {
  const json = await response.clone().json().catch(() => null);
  if (isBackyErrorEnvelope(json)) {
    throw new BackyApiError(response.status, json);
  }
  throw new Error(
    `Backy API request failed with HTTP ${response.status} for ${responsePath}.`,
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
    location: response.headers.get("location") || undefined,
    contentType: response.headers.get("content-type") || undefined,
    contentLength: response.headers.get("content-length") || undefined,
    contentDisposition: response.headers.get("content-disposition") || undefined,
    mediaId: response.headers.get("x-backy-media-id") || undefined,
    mediaDeliveryPolicy:
      response.headers.get("x-backy-media-delivery-policy") || undefined,
    transformWidth: response.headers.get("x-backy-transform-width") || undefined,
    transformQuality:
      response.headers.get("x-backy-transform-quality") || undefined,
  };
}
