import type {
  BackyLocaleStrategy,
  BackyInteractiveComponentsContract,
  BackyMediaAsset,
  BackyMediaFolder,
  BackyMediaFolderList,
  BackyMediaListOptions,
  BackyManifestBlogAuthor,
  BackyManifestBlogCategory,
  BackyManifestBlogModule,
  BackyManifestBlogRuntimeModule,
  BackyManifestBlogTag,
  BackyManifestCommerceRuntimeModule,
  BackyManifestCollectionSchema,
  BackyManifestCollectionsRuntimeModule,
  BackyManifestLocalizedRoutePatternGroup,
  BackyManifestPageResource,
  BackyManifestPagesRuntimeModule,
  BackyManifestPostResource,
  BackyManifestRedirectRule,
  BackyManifestReusableSection,
  BackyManifestReusableSectionsModule,
  BackyManifestReusableSectionsRuntimeModule,
  BackyManifestRoutingModule,
  BackyManifestRouteFrontendDesign,
  BackyManifestRoutePattern,
  BackyManifestDeliveryDiscovery,
  BackyFrontendDatabaseCertification,
  BackyFrontendLaunchReadiness,
  BackyClient,
  BackyContentElementDescriptor,
  BackyContentElementPatch,
  BackyEditableContent,
  BackyLiveManagedBlogPostResponse,
  BackyLiveManagedBlogPostUpdateInput,
  BackyLiveManagedPageResponse,
  BackyLiveManagedPageUpdateInput,
  BackyLiveManagementRequestOptions,
  BackyManifestFormDefinition,
  BackyManifestFormsRuntimeModule,
  BackyManifestLiveManagementModule,
  BackyManifestMediaModule,
  BackyManifestThemeModule,
  GeneratedBackyContentStatus,
  GeneratedBackyContentElement,
  GeneratedBackyDataBinding,
  GeneratedBackyDataBindingDataset,
  GeneratedBackyDataBindings,
  GeneratedBackyEditableMap,
  GeneratedBackyElementAction,
  GeneratedBackyElementActions,
  GeneratedBackyPublicRenderPayloadBindingSlot,
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
  GeneratedBackyOpenApiBackyContentAssetRef,
  GeneratedBackyOpenApiBackyContentDocument,
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
  GeneratedBackyOpenApiMediaDetailEnvelope,
  GeneratedBackyOpenApiMediaEditableMetadata,
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
  GeneratedBackyPublicRenderPayloadEnvelope,
  GeneratedBackyThemeTokens,
} from "../src/index";
import {
  findBackyContentElement,
  generatedBackyContractTypeSources,
  listBackyContentElements,
  patchBackyContentElement,
  patchBackyContentElements,
} from "../src/index";

type Equal<Left, Right> =
  (<Value>() => Value extends Left ? 1 : 2) extends <
    Value,
  >() => Value extends Right ? 1 : 2
    ? true
    : false;
type Assert<Condition extends true> = Condition;
type AwaitedReturn<T> = T extends (...args: any[]) => infer Return
  ? Awaited<Return>
  : never;

type ManifestEnvelopeDataIsManifest = Assert<
  Equal<
    GeneratedBackyFrontendManifestEnvelope["data"],
    GeneratedBackyFrontendManifest
  >
>;
type RenderEnvelopeDataIsPayload = Assert<
  Equal<
    GeneratedBackyPublicRenderPayloadEnvelope["data"],
    GeneratedBackyPublicRenderPayload
  >
>;
type LiveManagedPageMethodReturnsContract = Assert<
  Equal<
    AwaitedReturn<BackyClient["liveManagedPage"]>,
    BackyLiveManagedPageResponse
  >
>;
type LiveManagedPageUpdateMethodReturnsContract = Assert<
  Equal<
    AwaitedReturn<BackyClient["updateLiveManagedPage"]>,
    BackyLiveManagedPageResponse
  >
>;
type LiveManagedBlogPostMethodReturnsContract = Assert<
  Equal<
    AwaitedReturn<BackyClient["liveManagedBlogPost"]>,
    BackyLiveManagedBlogPostResponse
  >
>;
type LiveManagedBlogPostUpdateMethodReturnsContract = Assert<
  Equal<
    AwaitedReturn<BackyClient["updateLiveManagedBlogPost"]>,
    BackyLiveManagedBlogPostResponse
  >
>;
type LiveManagedPageUpdateExtendsOpenApiRequest = Assert<
  BackyLiveManagedPageUpdateInput extends GeneratedBackyOpenApiPageUpdateRequest
    ? true
    : false
>;
type LiveManagedBlogPostUpdateExtendsOpenApiRequest = Assert<
  BackyLiveManagedBlogPostUpdateInput extends GeneratedBackyOpenApiBlogPostUpdateRequest
    ? true
    : false
>;
type EditableMapEntry = GeneratedBackyEditableMap[string];

const liveManagementRequestOptions = {
  adminKey: "admin-secret",
  apiKey: "site-secret",
  adminSession: "session-token",
  bearerToken: "bearer-token",
  actor: "custom-frontend-editor",
  credentials: "include",
  headers: {
    "x-custom-editor": "sdk-type-smoke",
  },
} satisfies BackyLiveManagementRequestOptions;

void liveManagementRequestOptions;

const theme = {
  schemaVersion: "backy.theme.v1",
  colors: {
    primary: "#111111",
    text: "#f8f8f8",
  },
  typography: {
    families: {
      heading: "Inter",
      body: "Inter",
    },
  },
  spacing: {
    md: "16px",
  },
  radii: {
    sm: "4px",
  },
  shadows: {
    card: "0 4px 16px rgb(0 0 0 / 12%)",
  },
  breakpoints: {
    mobile: 375,
    tablet: 768,
    desktop: 1024,
  },
} satisfies GeneratedBackyThemeTokens;

const action = {
  id: "hero-link",
  type: "link",
  href: "/pricing",
  label: "Pricing",
} satisfies GeneratedBackyElementAction;

const actions = {
  schemaVersion: "backy.actions.v1",
  actions: [action],
} satisfies GeneratedBackyElementActions;

const binding = {
  id: "title-binding",
  elementId: "hero-title",
  targetPath: "props.text",
  source: {
    kind: "collection",
    collectionId: "articles",
    field: "title",
  },
  mode: "text",
} satisfies GeneratedBackyDataBinding;

const contentStatus = "published" satisfies GeneratedBackyContentStatus;

const dataBindingDataset = {
  id: "articles",
  collectionId: "articles",
  fields: [
    {
      key: "title",
      label: "Title",
      type: "text",
      required: true,
      unique: false,
    },
  ],
  pagination: {
    limit: 10,
    offset: 0,
  },
  records: [
    {
      id: "article_1",
      slug: "hello",
      status: contentStatus,
      values: {
        title: "Hello",
      },
      updatedAt: "2026-05-16T00:00:00.000Z",
    },
  ],
} satisfies GeneratedBackyDataBindingDataset;

const bindings = {
  schemaVersion: "backy.bindings.v1",
  datasets: [dataBindingDataset],
  bindings: [binding],
} satisfies GeneratedBackyDataBindings;

const editableMap = {
  "hero-title.text": {
    elementId: "hero-title",
    field: "props.text",
    editable: true,
    valueType: "string",
    scope: "element",
  },
} satisfies GeneratedBackyEditableMap;

const frontendDatabaseCertificationEnvTemplate = [
  "# Backy frontend SDK database certification environment",
  "# Keep the disposable database URL in CI secrets or local shell variables.",
  "BACKY_DATABASE_URL=<disposable-postgres-url>",
  "BACKY_RELEASE_CERTIFY_DATABASE=1",
  "BACKY_RELEASE_CERTIFICATION_DOCTOR_REQUIRED=1",
  "BACKY_DATA_MODE=database",
  "BACKY_SDK_REQUIRE_DATABASE=1",
  "BACKY_DATABASE_DISPOSABLE_CONFIRMED=true",
].join("\n");

const frontendDatabaseCertification = {
  schemaVersion: "backy.frontend-database-certification.v1",
  status: "external-database-gate",
  requiredFor: "production-custom-frontends",
  gate: {
    command: "npm run ci:sdk-postgres-smoke",
    workflow: ".github/workflows/sdk-postgres-smoke.yml",
    localPreflight: "npm run test:sdk-postgres-preflight-contract",
    typeContract: "npm run test:frontend-contract-types",
  },
  environment: {
    dataMode: "database",
    secretAliases: ["BACKY_DATABASE_URL", "DATABASE_URL"],
    requiredConfirmationEnv: "BACKY_DATABASE_DISPOSABLE_CONFIRMED=true",
    targetGuards: [
      "BACKY_DATABASE_CERTIFICATION_EXPECTED_HOST",
      "BACKY_DATABASE_CERTIFICATION_EXPECTED_DATABASE",
    ],
  },
  requires: [
    "disposable migrated Supabase/Postgres database",
    "disposable_database_confirmed=true",
    "public schema, RLS policies, indexes, and constraints migrated",
  ],
  coverage: ["manifest", "openapi", "render", "collections", "forms", "commerce", "generated-sdk"],
  scenarioEvidence: {
    schemaVersion: "backy.frontend-database-certification-evidence.v1",
    status: "attention",
    requiredGate: "BACKY_DATABASE_DISPOSABLE_CONFIRMED=true npm run ci:sdk-postgres-smoke",
    coverage: {
      covered: 8,
      total: 9,
      missing: ["database-runtime-guard"],
    },
    scenarios: [
      {
        key: "manifest-openapi-discovery",
        label: "Manifest and OpenAPI discovery",
        status: "covered",
        evidenceCount: 3,
        expectedEvidence: ["public manifest response", "site-scoped OpenAPI response"],
        nextAction: "Attach manifest and OpenAPI response evidence.",
      },
      {
        key: "generated-sdk-cache",
        label: "Generated SDK and cache",
        status: "covered",
        evidenceCount: 1,
        expectedEvidence: ["generated TypeScript contract", "SDK smoke", "304 cache revalidation"],
        nextAction: "Run generated type checks and SDK cached helpers.",
      },
      {
        key: "database-runtime-guard",
        label: "Database runtime guard",
        status: "missing",
        evidenceCount: 0,
        expectedEvidence: ["database URL alias configured", "disposable confirmation"],
        nextAction: "Set the disposable database target and run the DB smoke.",
      },
    ],
    secretHandling:
      "Frontend database certification evidence reports scenario names, counts, gates, and non-secret contract families only; database URLs, service credentials, private orders, submissions, and contact payloads stay private.",
  },
  operatorCommandTemplate: {
    command: [
      "# Store the disposable database URL in BACKY_DATABASE_URL as a CI secret or local shell env.",
      "# export BACKY_DATABASE_URL='<postgres-url>'",
      "export BACKY_RELEASE_CERTIFY_DATABASE='1'",
      "export BACKY_RELEASE_CERTIFICATION_DOCTOR_REQUIRED='1'",
      "export BACKY_DATA_MODE='database'",
      "export BACKY_SDK_REQUIRE_DATABASE='1'",
      "export BACKY_DATABASE_DISPOSABLE_CONFIRMED='true'",
      "",
      "npm run doctor:release-certification",
      "npm run ci:sdk-postgres-smoke",
    ].join("\n"),
    envTemplate: frontendDatabaseCertificationEnvTemplate,
    envTemplateSchemaVersion: "backy.frontend-database-certification-env-template.v1",
    databaseUrlAliases: ["BACKY_DATABASE_URL", "DATABASE_URL"],
    requiredInputs: [
      "BACKY_DATABASE_URL or DATABASE_URL",
      "BACKY_DATA_MODE=database",
      "BACKY_SDK_REQUIRE_DATABASE=1",
      "BACKY_DATABASE_DISPOSABLE_CONFIRMED=true",
      "BACKY_DATABASE_CERTIFICATION_EXPECTED_HOST",
      "BACKY_DATABASE_CERTIFICATION_EXPECTED_DATABASE",
      "disposable migrated Supabase/Postgres database",
    ],
    targetGuards: [
      "BACKY_DATABASE_CERTIFICATION_EXPECTED_HOST",
      "BACKY_DATABASE_CERTIFICATION_EXPECTED_DATABASE",
    ],
    secretHandling:
      "Disposable database URLs stay in CI secrets or local shell environment variables; this template only emits non-secret aliases and placeholders.",
  },
  operatorEnvTemplate: {
    schemaVersion: "backy.frontend-database-certification-env-template.v1",
    format: "shell-env",
    fileName: ".env.backy-frontend-database-certification",
    body: frontendDatabaseCertificationEnvTemplate,
    secretHandling:
      "Generated template values are non-secret aliases and placeholders; replace the database URL placeholder with a disposable migrated Supabase/Postgres secret before execution.",
  },
  runtime: {
    dataMode: "database",
    databaseType: "postgres",
    databaseUrlConfigured: false,
    databaseUrlAlias: null,
    disposableConfirmed: false,
    expectedHostConfigured: false,
    expectedDatabaseConfigured: false,
    readyForCertification: false,
    missing: ["BACKY_DATABASE_URL or DATABASE_URL", "BACKY_DATABASE_DISPOSABLE_CONFIRMED=true"],
    secretHandling:
      "Database URLs and service credentials are never returned; this runtime summary exposes alias/configuration state only.",
  },
  secretHandling:
    "Database URLs and service credentials stay in CI/runtime environment.",
} satisfies GeneratedBackyFrontendManifestDatabaseCertification;

const convenienceFrontendDatabaseCertification = frontendDatabaseCertification satisfies BackyFrontendDatabaseCertification;

const frontendLaunchReadiness = {
  generatedAt: "2026-05-21T00:00:00.000Z",
  schemaVersion: "backy.frontend-launch-readiness.v1",
  status: "blocked",
  score: 57,
  siteId: "site-demo",
  endpointCount: 38,
  routePatternCount: 6,
  moduleCounts: {
    pages: 2,
    blogPosts: 1,
    collections: 1,
    reusableSections: 1,
    forms: 1,
    media: 4,
  },
  checks: [
    {
      key: "routing-render-contracts",
      label: "Routing, rendering, and OpenAPI",
      status: "ready",
      detail: "Route and endpoint contracts are advertised.",
      nextAction: "Use manifest, resolve, render, and OpenAPI contracts before hardcoding routes.",
    },
    {
      key: "database-certification",
      label: "Database certification",
      status: "blocked",
      detail: "SDK Postgres certification still needs a disposable database target.",
      nextAction: "Run the disposable SDK Postgres smoke.",
      gate: "npm run ci:sdk-postgres-smoke",
    },
  ],
  actionPlan: {
    schemaVersion: "backy.frontend-launch-action-plan.v1",
    nextAction: "Run the disposable SDK Postgres smoke.",
    blockingChecks: ["database-certification"],
    attentionChecks: [],
    recommendedCommands: ["npm run ci:sdk-postgres-smoke"],
  },
  privacy: {
    includesSecretValues: false,
    publicManifestExcludesPrivateQueues: true,
    adminEndpointsRequireAuth: true,
    submissionAndOrderPayloadsPrivate: true,
    secretHandling:
      "Launch readiness exposes endpoint templates, booleans, counts, schema names, and certification gates only.",
  },
} satisfies GeneratedBackyFrontendManifestLaunchReadiness;

const convenienceFrontendLaunchReadiness = frontendLaunchReadiness satisfies BackyFrontendLaunchReadiness;

const interactiveControl = {
  key: "rounds",
  label: "Rounds",
  type: "range",
  value: 4,
  min: 1,
  max: 8,
  step: 1,
  required: true,
} satisfies GeneratedBackyInteractiveControl;

const interactiveFallback = {
  title: "Self-correction rounds",
  text: "Static summary of the interactive figure.",
  ariaLabel: "Self-correction rounds diagram",
} satisfies GeneratedBackyInteractiveFallback;

const interactiveRenderCapabilities = {
  hydrationMode: "trusted-component",
  requiresSandbox: false,
  requiresSignedBundle: true,
  fallbackRequired: true,
  allowedPermissions: [],
  allowedConnectSrc: ["self"],
  postMessageProtocol: "backy.interactive-component.v1",
} satisfies GeneratedBackyInteractiveRenderCapabilities;

const bindingSlot = {
  id: "slot_post_title",
  label: "Post title",
  sourceKind: "blog",
  fieldKey: "title",
  targetPath: "props.content",
  mode: "text",
  required: true,
  description: "Connect this heading to the selected post title.",
} satisfies GeneratedBackyPublicRenderPayloadBindingSlot;

const element = {
  id: "interactive-rounds",
  type: "interactiveFigure",
  componentKey: "backy.figure.rounds",
  version: "1.0.0",
  children: [],
  props: {
    rounds: 4,
  },
  controls: [interactiveControl],
  fallback: interactiveFallback,
  actions: [action],
  dataBindings: [binding],
  bindingSlots: [bindingSlot],
  renderCapabilities: interactiveRenderCapabilities,
} satisfies GeneratedBackyContentElement;

const editableContentForHelpers = {
  elements: [element],
  contentDocument: {
    schemaVersion: "backy.content.v1",
    id: "editable-helper-document",
    kind: "page",
    version: "draft",
    elements: [
      {
        id: "editable-helper-nested-message",
        type: "text",
        children: [],
        props: { content: "Nested message" },
      },
    ],
    editableMap: {},
  },
  canvasSize: { width: 1200, height: 760 },
} satisfies BackyEditableContent;

const editableElementPatch = {
  elementId: "interactive-rounds",
  changes: {
    "props.rounds": 5,
    "styles.color": "#111827",
    "layout.x": 48,
    "visibility.locked": true,
  },
  props: {
    label: "Live editable rounds",
  },
  fields: {
    name: "Interactive rounds",
  },
  remove: ["props.legacyValue"],
} satisfies BackyContentElementPatch;

const patchedEditableContent = patchBackyContentElement(
  editableContentForHelpers,
  editableElementPatch,
);
const foundEditableElement = findBackyContentElement(
  editableContentForHelpers,
  "interactive-rounds",
);
const bulkPatchedEditableContent = patchBackyContentElements(
  editableContentForHelpers,
  [
    editableElementPatch,
    {
      elementId: "editable-helper-nested-message",
      changes: {
        "props.content": "Nested message edited from a custom frontend",
        "layout.y": 120,
      },
    },
  ],
);
const editableElementDescriptors = listBackyContentElements(
  editableContentForHelpers,
) satisfies BackyContentElementDescriptor[];

void patchedEditableContent;
void foundEditableElement;
void bulkPatchedEditableContent;
void editableElementDescriptors;

const renderMediaAsset = {
  id: "media_hero",
  siteId: "site_demo",
  type: "image",
  mimeType: "image/webp",
  filename: "hero.webp",
  originalName: "hero.webp",
  url: "/media/hero.webp",
  thumbnailUrl: "/media/hero-thumb.webp",
  altText: "Hero image",
  caption: "Homepage hero.",
  scope: "page",
  scopeTargetId: "page_home",
  visibility: "public",
  metadata: {
    dominantColor: "#111111",
  },
} satisfies GeneratedBackyRenderMediaAsset;

const renderFontAsset = {
  id: "font_inter",
  family: "Inter",
  source: "uploaded",
  url: "/media/fonts/inter.woff2",
  weights: ["400"],
  styles: ["normal"],
  fallbackStack: "system-ui, sans-serif",
  display: "swap",
  cssFamily: '"Inter", system-ui, sans-serif',
} satisfies GeneratedBackyRenderFontAsset;

const renderForm = {
  id: "form_contact",
  endpoint: "/api/sites/site_demo/forms/form_contact/submissions",
  method: "POST",
  fields: [
    {
      key: "email",
      label: "Email",
      type: "email",
      required: true,
    },
  ],
} satisfies GeneratedBackyRenderForm;

const renderCommentThread = {
  id: "thread_page_home",
  targetType: "page",
  targetId: "page_home",
  endpoint: "/api/sites/site_demo/pages/page_home/comments",
  moderationMode: "manual",
  count: 2,
} satisfies GeneratedBackyRenderCommentThread;

const renderNavigationItem = {
  id: "nav_home",
  type: "page",
  pageId: "page_home",
  label: "Home",
  title: "Home",
  slug: "index",
  path: "/",
  href: "/",
  target: "_self",
  status: contentStatus,
  isHomepage: true,
  children: [],
} satisfies GeneratedBackyRenderNavigationItem;

const renderNavigationLayout = {
  header: {
    variant: "default",
    position: "sticky",
    width: "contained",
    showBrand: true,
    showSearch: true,
    showAccount: false,
    showCart: false,
    ctaLabel: "Start",
    ctaHref: "/start",
  },
  footer: {
    variant: "default",
    width: "contained",
    showSocial: true,
    showNewsletter: false,
    note: "Demo footer",
  },
} satisfies GeneratedBackyRenderNavigationLayout;

const renderFrontendDesignContract = {
  schemaVersion: "backy.frontend-design.v1",
  status: "synced",
  source: {
    type: "custom-frontend",
    label: "Demo frontend",
    url: "https://example.com",
    repository: "example/backy-demo",
    branch: "main",
    capturedAt: "2026-05-16T00:00:00.000Z",
  },
  tokens: {
    colorPrimary: "#111111",
  },
  chrome: {
    header: true,
  },
  templates: [
    {
      id: "template_home",
      type: "page",
      name: "Home template",
      routePattern: "/",
      description: "Homepage template.",
    },
  ],
  editableMap: [
    {
      selector: '[data-backy-id="hero-title"]',
      fields: ["text"],
    },
  ],
  notes: "Synced from generated type fixture.",
  updatedAt: "2026-05-16T00:00:00.000Z",
} satisfies GeneratedBackyFrontendDesignContract;

const frontendDesignProvenance = {
  templateId: "template_home",
  templateName: "Home template",
  routePattern: "/",
  source: {
    type: "custom-frontend",
  },
  customCss: ".hero { display: grid; }",
  bindingHints: [
    {
      field: "title",
    },
  ],
} satisfies GeneratedBackyFrontendDesignProvenance;

const renderFrontendDesign = {
  site: renderFrontendDesignContract,
  content: frontendDesignProvenance,
} satisfies GeneratedBackyRenderFrontendDesign;

const renderPayload = {
  site: {
    id: "site_demo",
    slug: "demo",
    name: "Demo",
    locale: "en",
    status: contentStatus,
    themeTokens: theme,
  },
  navigation: {
    primary: [renderNavigationItem],
    layout: renderNavigationLayout,
  },
  frontendDesign: renderFrontendDesign,
  route: {
    type: "page",
    path: "/",
    status: "published",
    canonical: "/",
  },
  content: {
    schemaVersion: "backy.content.v1",
    id: "page_home",
    kind: "page",
    elements: [element],
  },
  assets: {
    media: [renderMediaAsset],
    fonts: [renderFontAsset],
  },
  interactions: {
    forms: [renderForm],
    comments: [renderCommentThread],
    actions,
  },
  seo: {
    title: "Demo",
    description: "Demo site",
    robots: {
      index: true,
      follow: true,
    },
  },
  dataBindings: bindings,
  editableMap,
} satisfies GeneratedBackyPublicRenderPayload;

const renderEnvelope = {
  success: true,
  requestId: "req_generated_types",
  data: renderPayload,
} satisfies GeneratedBackyPublicRenderPayloadEnvelope;

const manifestNavigationItem = {
  id: "nav_home",
  type: "page",
  label: "Home",
  pageId: "page_home",
  slug: "index",
  path: "/",
  target: "_self",
  children: [
    {
      id: "nav_blog",
      type: "route",
      label: "Blog",
      path: "/blog",
      href: "/blog",
      target: "_self",
      children: [],
    },
  ],
} satisfies GeneratedBackyFrontendManifestNavigationItem;

const commerceProviderCertificationEnvTemplate = [
  "# Backy commerce provider certification environment",
  "# Keep real provider credential values in CI secrets or local shell variables.",
  "BACKY_RELEASE_CERTIFICATION_DOCTOR_REQUIRED=1",
  "BACKY_COMMERCE_PROVIDER_CERTIFICATION_REQUIRED=1",
  "BACKY_COMMERCE_CERTIFY_PAYMENT=1",
  "BACKY_COMMERCE_CERTIFY_PAYMENT_PROVIDER=auto",
  "BACKY_COMMERCE_CERTIFY_TAX=1",
  "BACKY_COMMERCE_CERTIFY_TAX_PROVIDER=auto",
  "BACKY_COMMERCE_CERTIFY_SHIPPING=1",
  "BACKY_COMMERCE_CERTIFY_SHIPPING_PROVIDER=auto",
  "BACKY_COMMERCE_CERTIFY_DISCOUNT=1",
  "BACKY_COMMERCE_CERTIFY_DISCOUNT_PROVIDER=auto",
  "BACKY_COMMERCE_CERTIFY_CATALOG=1",
  "BACKY_COMMERCE_CERTIFY_CATALOG_PROVIDER=auto",
  "BACKY_COMMERCE_CERTIFY_SUBSCRIPTIONS=1",
  "BACKY_COMMERCE_CERTIFY_SUBSCRIPTION_PROVIDER=auto",
  "BACKY_COMMERCE_CERTIFY_WEBHOOKS=1",
  "BACKY_COMMERCE_CERTIFY_WEBHOOK_PROVIDER=auto",
].join("\n");

const commerceProviderCertification = {
  schemaVersion: "backy.commerce-provider-certification-handoff.v1",
  status: "external-live-provider-gate",
  localMockGate: "ci:commerce-provider-smoke",
  liveCertificationGate: "ci:commerce-provider-certification",
  requiredFor: "live-commerce-provider-launch",
  secretHandling: "Provider credentials stay in server env.",
  operatorCommandTemplate: {
    command: [
      "export BACKY_RELEASE_CERTIFICATION_DOCTOR_REQUIRED='1'",
      "export BACKY_COMMERCE_PROVIDER_CERTIFICATION_REQUIRED='1'",
      "export BACKY_COMMERCE_CERTIFY_PAYMENT_PROVIDER='auto'",
      "export BACKY_COMMERCE_CERTIFY_DISCOUNT_PROVIDER='auto'",
      "",
      "npm run doctor:release-certification",
      "npm run ci:commerce-provider-certification",
    ].join("\n"),
    envTemplate: commerceProviderCertificationEnvTemplate,
    envTemplateSchemaVersion: "backy.commerce-provider-certification-env-template.v1",
    providerChoices: {
      payment: ["auto", "stripe", "paypal", "paddle", "square", "adyen", "mollie", "razorpay"],
      tax: ["auto", "stripe", "taxjar", "avalara", "http"],
      shipping: ["auto", "easypost", "shippo", "http"],
      discount: ["auto", "stripe", "http"],
      catalog: ["auto", "shopify", "bigcommerce", "woocommerce", "etsy", "magento", "http"],
      subscription: ["auto", "stripe", "paypal", "paddle", "square", "adyen", "mollie", "razorpay", "http"],
      webhook: ["auto", "stripe", "paypal", "paddle", "square", "adyen", "mollie", "razorpay", "generic"],
    },
    requiredInputs: [
      "BACKY_COMMERCE_PROVIDER_CERTIFICATION_REQUIRED=1",
      "BACKY_COMMERCE_CERTIFY_PAYMENT_PROVIDER",
      "BACKY_COMMERCE_CERTIFY_TAX_PROVIDER",
      "BACKY_COMMERCE_CERTIFY_SHIPPING_PROVIDER",
      "BACKY_COMMERCE_CERTIFY_DISCOUNT_PROVIDER",
      "BACKY_COMMERCE_CERTIFY_CATALOG_PROVIDER",
      "BACKY_COMMERCE_CERTIFY_SUBSCRIPTION_PROVIDER",
      "BACKY_COMMERCE_CERTIFY_WEBHOOK_PROVIDER",
      "BACKY_STRIPE_SECRET_KEY or STRIPE_SECRET_KEY",
      "BACKY_TAXJAR_API_KEY or TAXJAR_API_KEY",
      "BACKY_EASYPOST_API_KEY or EASYPOST_API_KEY",
      "BACKY_COMMERCE_DISCOUNT_PROVIDER_URL or COMMERCE_DISCOUNT_PROVIDER_URL",
      "BACKY_COMMERCE_PRODUCT_SYNC_URL or COMMERCE_PRODUCT_SYNC_URL",
      "BACKY_COMMERCE_SUBSCRIPTION_ACTION_URL or COMMERCE_SUBSCRIPTION_ACTION_URL",
      "BACKY_COMMERCE_WEBHOOK_SECRET or COMMERCE_WEBHOOK_SECRET",
      "BACKY_RELEASE_CERTIFICATION_DOCTOR_REQUIRED=1",
    ],
    targetInputs: [
      "BACKY_COMMERCE_CERTIFICATION_BASE_URL",
      "BACKY_ADMIN_API_KEY or BACKY_COMMERCE_CERTIFICATION_ADMIN_KEY",
    ],
    secretHandling: "Provider credential values stay in CI secrets or local shell environment variables.",
  },
  operatorEnvTemplate: {
    schemaVersion: "backy.commerce-provider-certification-env-template.v1",
    format: "shell-env",
    fileName: ".env.backy-commerce-provider-certification",
    body: commerceProviderCertificationEnvTemplate,
    secretHandling:
      "Generated template values are non-secret aliases and placeholders; keep real commerce provider credentials in CI secrets or local shell variables before execution.",
  },
  runtime: {
    paymentConfigured: false,
    taxConfigured: false,
    shippingConfigured: false,
    discountConfigured: false,
    catalogSyncConfigured: false,
    subscriptionConfigured: false,
    webhookSecretConfigured: false,
    configuredFamilies: [],
    missingFamilies: ["payment", "tax", "shipping", "discount", "catalog-sync", "subscription", "webhooks"],
    secretHandling: "Provider secret values are never returned; this runtime summary exposes provider-family readiness booleans only.",
  },
  groups: [
    {
      family: "Tax quote providers",
      providers: ["TaxJar", "Avalara"],
      gate: "ci:commerce-provider-certification",
      requiredInputs: [
        "BACKY_TAXJAR_API_KEY or TAXJAR_API_KEY",
        "BACKY_AVALARA_ACCOUNT_ID/AVALARA_ACCOUNT_ID plus license and company code",
      ],
      evidence: "Live tax account credentials.",
    },
    {
      family: "Mock provider regression",
      providers: ["Local provider mocks"],
      gate: "ci:commerce-provider-smoke",
      requiredInputs: ["No live provider credentials required"],
      evidence: "Repeatable local provider coverage.",
    },
  ],
} satisfies GeneratedBackyFrontendManifestCommerceProviderCertification & GeneratedBackyOpenApiCommerceProviderCertification;

const manifest = {
  schemaVersion: "backy.frontend-manifest.v1",
  site: {
    id: "site_demo",
    slug: "demo",
    name: "Demo",
    description: "Demo site",
    customDomain: "demo.example.com",
    status: "published",
    themeTokens: theme,
    commentPolicy: {
      enabled: true,
      moderationMode: "manual",
      allowGuests: true,
      requireName: true,
      requireEmail: false,
      allowReplies: true,
      enableReports: true,
      enableCaptcha: false,
      captchaProvider: "mock",
      captchaSiteKey: "",
      blockedTerms: [],
      closedMessage: "Comments are closed for this site.",
      sort: "newest",
    },
  },
  contract: {
    version: "backy.ai-frontend.v1",
    docs: "/specs/ai-frontend-contract/README.md",
    databaseCertification: frontendDatabaseCertification,
    frontendLaunchReadiness,
    schemas: {
      manifest: "frontend-manifest.schema.json",
      renderPayload: "content-payload.schema.json",
      themeTokens: "theme-tokens.schema.json",
      elementActions: "element-actions.schema.json",
      dataBindings: "data-bindings.schema.json",
      editableMap: "editable-map.schema.json",
    },
  },
  capabilities: {
    routeResolve: true,
    renderPayload: true,
    openApi: true,
    seoDiscovery: true,
    hostedRendering: true,
    navigation: true,
    mediaLibrary: true,
    uploadedFonts: true,
    blog: true,
    comments: true,
    forms: true,
    collectionSchemas: true,
    collectionRecords: true,
    commerceCatalog: true,
    commerceOrderIntake: true,
    commerceProviderCheckout: true,
    publicCollectionCreate: false,
    collectionWriteForms: true,
    reusableSections: true,
    dynamicListRoutes: true,
    dynamicItemRoutes: true,
    redirectRoutes: true,
    frontendDesignContract: true,
    interactiveComponents: true,
    sandboxedCodeComponents: true,
    previewTokens: true,
  },
  endpoints: {
    site: "/api/sites?identifier=demo",
    manifest: "/api/sites/site_demo/manifest",
    openapi: "/api/sites/site_demo/openapi",
    resolve: "/api/sites/site_demo/resolve?path=/",
    render: "/api/sites/site_demo/render?path=/",
    seo: "/api/sites/site_demo/seo",
    sitemap: "/api/sites/site_demo/seo?format=sitemap",
    robots: "/api/sites/site_demo/seo?format=robots",
    navigation: "/api/sites/site_demo/navigation",
    frontendDesign: "/api/sites/site_demo/frontend-design",
    frontendDesignInManifest:
      "/api/sites/site_demo/manifest#data.site.frontendDesign",
    interactiveComponents: "/api/sites/site_demo/interactive-components",
    interactiveRuntimeEvents:
      "/api/sites/site_demo/interactive-components/runtime-events",
    interactiveComponentsInManifest:
      "/api/sites/site_demo/manifest#data.modules.interactiveComponents",
    media: "/api/sites/site_demo/media",
    mediaFolders: "/api/sites/site_demo/media/folders",
    mediaFonts: "/api/sites/site_demo/media/fonts",
    mediaDetail: "/api/sites/site_demo/media/{mediaId}",
    mediaFile: "/api/sites/site_demo/media/{mediaId}/file",
    mediaTransform:
      "/api/sites/site_demo/media/{mediaId}/transform?width={width}",
    pages: "/api/sites/site_demo/pages",
    liveManagePage: "/api/sites/site_demo/manage/pages/{pageId}",
    liveManagePost: "/api/sites/site_demo/manage/blog/{postId}",
    blog: "/api/sites/site_demo/blog",
    blogRss: "/api/sites/site_demo/blog/rss",
    blogCategories: "/api/sites/site_demo/blog/categories",
    blogTags: "/api/sites/site_demo/blog/tags",
    blogAuthors: "/api/sites/site_demo/blog/authors",
    commerceCatalog: "/api/sites/site_demo/commerce/catalog",
    commerceOrders: "/api/sites/site_demo/commerce/orders",
    collections: "/api/sites/site_demo/collections",
    reusableSections: "/api/sites/site_demo/reusable-sections",
    reusableSectionDetail: "/api/sites/site_demo/reusable-sections/{sectionId}",
    forms: "/api/sites/site_demo/forms",
    formDetail: "/api/sites/site_demo/forms/{formId}",
    formDefinition: "/api/sites/site_demo/forms/{formId}/definition",
    formSubmissions: "/api/sites/site_demo/forms/{formId}/submissions",
    formContacts: "/api/sites/site_demo/forms/{formId}/contacts",
    comments: "/api/sites/site_demo/comments",
    pageComments: "/api/sites/site_demo/pages/{pageId}/comments",
    pageComment: "/api/sites/site_demo/pages/{pageId}/comments/{commentId}",
    blogComments: "/api/sites/site_demo/blog/{postId}/comments",
    blogComment: "/api/sites/site_demo/blog/{postId}/comments/{commentId}",
    commentReportReasons: "/api/sites/site_demo/comments/report-reasons",
    commentReport: "/api/sites/site_demo/comments/{commentId}/report",
    events: "/api/sites/site_demo/events",
  },
  routePatterns: [
    {
      type: "page",
      pattern: "/",
      resolveUrl: "/api/sites/site_demo/resolve?path=/",
      renderUrl: "/api/sites/site_demo/render?path=/",
    },
  ],
  modules: {
    routing: {
      supportedRouteTypes: ["page"],
      localizedRoutePatterns: [
        {
          locale: "fr",
          default: false,
          pathPrefix: "/fr",
          domain: "fr.demo.example.com",
          patterns: [
            {
              type: "page",
              locale: "fr",
              basePattern: "/",
              pattern: "/fr",
              resolveUrl: "/api/sites/site_demo/resolve?path=%2Ffr",
              renderUrl: "/api/sites/site_demo/render?path=%2Ffr",
            },
          ],
        },
      ],
      redirectRules: {
        count: 0,
        items: [],
      },
    },
    theme: {
      schemaVersion: "backy.theme-discovery.v1",
      tokenSchemaVersion: "backy.theme.v1",
      tokens: theme,
      cssVariables: {
        "--backy-color-primary": "#111111",
        "--backy-font-heading": "Inter",
        "--backy-spacing-md": "16px",
      },
      selectors: {
        root: ":root",
        scoped: "[data-backy-theme]",
      },
      editableFields: ["colors.primary", "fonts.heading", "spacing.unit", "customCSS"],
      capabilities: {
        cssVariables: true,
        customCss: true,
        typographyFamilies: true,
        spacingScale: true,
        liveEditable: true,
        frontendDesignOverrides: true,
      },
    },
    liveManagement: {
      schemaVersion: "backy.live-management.v1",
      enabled: true,
      endpoints: {
        page: "/api/sites/site_demo/manage/pages/{pageId}",
        post: "/api/sites/site_demo/manage/blog/{postId}",
        render: "/api/sites/site_demo/render?path={path}",
        editableMapSchema:
          "https://backy.dev/schemas/ai-frontend-contract/editable-map.schema.json",
      },
      methods: {
        read: "GET",
        update: "PATCH",
      },
      auth: {
        modes: ["session", "api-key"],
        headers: ["Authorization", "x-backy-admin-session", "x-backy-admin-key", "x-api-key"],
        requiredPermissions: {
          read: "pages.view",
          update: "pages.edit",
        },
        siteScope: true,
      },
      capabilities: {
        pageMetadata: true,
        postMetadata: true,
        contentDocument: true,
        canvasElements: true,
        editableMap: true,
        optimisticConcurrency: true,
        cacheInvalidation: true,
        auditTrail: true,
        webhookDelivery: true,
      },
      editableTargets: ["props.content", "props.href", "props.formId", "props.label", "props.options", "styles.color"],
      updateBody: {
        expectedUpdatedAt: "Use the current page updatedAt value.",
        content: "Send the full Backy content document or canvas content object.",
      },
      errors: {
        conflict: "PAGE_VERSION_CONFLICT",
        postConflict: "BLOG_VERSION_CONFLICT",
        forbidden: "FORBIDDEN_LIVE_MANAGE_SITE_SCOPE",
        postForbidden: "FORBIDDEN_LIVE_MANAGE_BLOG_SCOPE",
        validation: "VALIDATION_ERROR",
      },
    },
    pages: {
      count: 1,
      items: [],
    },
    pagesRuntime: {
      schemaVersion: "backy.pages-discovery.v1",
      count: 1,
      publishedCount: 1,
      scheduledCount: 0,
      homepagePath: "/",
      paths: ["/"],
      endpoints: {
        list: "/api/sites/site_demo/pages",
        detail: "/api/sites/site_demo/pages?path={path}",
        resolve: "/api/sites/site_demo/resolve?path={path}",
        render: "/api/sites/site_demo/render?path={path}",
        liveManage: "/api/sites/site_demo/manage/pages/{pageId}",
      },
      methods: {
        list: "GET",
        detail: "GET",
        resolve: "GET",
        render: "GET",
        liveManageRead: "GET",
        liveManageUpdate: "PATCH",
      },
      capabilities: {
        publicList: true,
        publicDetail: true,
        renderPayload: true,
        routeResolve: true,
        seoMetadata: true,
        frontendDesignProvenance: false,
        previewTokens: true,
        liveManagement: true,
        conditionalRequests: true,
        cacheablePages: true,
      },
      cache: {
        list: "public-discovery",
        detail: "public-discovery",
        previewDetail: "private-no-store",
        render: "public-discovery",
      },
      privacy: {
        publicReadsOnlyIncludePublishedOrPastScheduledPages: true,
        draftPreviewRequiresToken: true,
        previewTokenIsNeverReturned: true,
      },
      filters: {
        queryParams: ["slug", "path", "previewToken", "limit", "offset"],
        maxLimit: 100,
      },
      schemas: {
        page: "backy.page.v1",
        renderPayload: "backy.render-payload.v1",
        seo: "backy.seo-route.v1",
        notFound: "PAGE_NOT_FOUND",
        invalidLimit: "INVALID_PAGE_LIMIT",
        invalidOffset: "INVALID_PAGE_OFFSET",
      },
    },
    blog: {
      count: 0,
      categories: [
        {
          id: "category_guides",
          name: "Guides",
          slug: "guides",
          postCount: 2,
        },
      ],
      tags: [
        {
          id: "tag_research",
          name: "Research",
          slug: "research",
          postCount: 1,
        },
      ],
      authors: [
        {
          id: "author_ada",
          name: "Ada Lovelace",
          slug: "ada-lovelace",
          role: "Editor",
          status: "active",
          postCount: 3,
        },
      ],
    },
    blogRuntime: {
      schemaVersion: "backy.blog-discovery.v1",
      count: 1,
      publishedCount: 1,
      scheduledCount: 0,
      categoryCount: 1,
      tagCount: 1,
      authorCount: 1,
      feedCount: 1,
      paths: ["/blog/welcome"],
      endpoints: {
        list: "/api/sites/site_demo/blog",
        detail: "/api/sites/site_demo/blog?slug={slug}",
        liveManage: "/api/sites/site_demo/manage/blog/{postId}",
        rss: "/api/sites/site_demo/blog/rss",
        categories: "/api/sites/site_demo/blog/categories",
        tags: "/api/sites/site_demo/blog/tags",
        authors: "/api/sites/site_demo/blog/authors",
        resolve: "/api/sites/site_demo/resolve?path={path}",
        render: "/api/sites/site_demo/render?path={path}",
      },
      methods: {
        list: "GET",
        detail: "GET",
        liveManageRead: "GET",
        liveManageUpdate: "PATCH",
        rss: "GET",
        categories: "GET",
        tags: "GET",
        authors: "GET",
        resolve: "GET",
        render: "GET",
      },
      capabilities: {
        publicList: true,
        publicDetail: true,
        taxonomyFilters: true,
        archiveFilters: true,
        searchFilters: true,
        rssFeed: true,
        renderPayload: true,
        routeResolve: true,
        frontendDesignProvenance: true,
        previewTokens: true,
        liveManagement: true,
        conditionalRequests: true,
        cacheablePosts: true,
      },
      cache: {
        list: "public-discovery",
        detail: "public-discovery",
        previewDetail: "private-no-store",
        taxonomy: "public-discovery",
        rss: "public-discovery",
        render: "public-discovery",
      },
      privacy: {
        publicReadsOnlyIncludePublishedOrPastScheduledPosts: true,
        draftPreviewRequiresToken: true,
        previewTokenIsNeverReturned: true,
      },
      filters: {
        queryParams: ["slug", "previewToken", "limit", "offset", "categorySlug", "tagSlug", "authorSlug"],
        maxLimit: 100,
        statuses: ["published", "draft", "scheduled", "archived"],
      },
      schemas: {
        post: "backy.blog-post.v1",
        feed: "backy.blog-feed.v1",
        renderPayload: "backy.render-payload.v1",
        notFound: "POST_NOT_FOUND",
        invalidLimit: "INVALID_BLOG_LIMIT",
        invalidOffset: "INVALID_BLOG_OFFSET",
        invalidStatus: "INVALID_BLOG_STATUS",
        invalidArchiveYear: "INVALID_BLOG_ARCHIVE_YEAR",
        invalidArchiveMonth: "INVALID_BLOG_ARCHIVE_MONTH",
      },
    },
    collections: [
      {
        id: "collection_articles",
        slug: "articles",
        name: "Articles",
        status: "published",
        permissions: {
          publicRead: true,
          publicCreate: false,
          publicUpdate: false,
          publicDelete: false,
        },
        fields: [
          {
            key: "title",
            label: "Title",
            type: "text",
            required: true,
            unique: false,
          },
        ],
        recordsUrl:
          "/api/sites/site_demo/collections/collection_articles/records",
        dynamicListRoutePattern: "/articles",
        dynamicRoutePattern: "/articles/:slug",
      },
    ],
    collectionsRuntime: {
      schemaVersion: "backy.collections-discovery.v1",
      count: 1,
      publishedCount: 1,
      publicReadCount: 1,
      publicCreateCount: 0,
      publicUpdateCount: 0,
      publicDeleteCount: 0,
      fieldTypes: ["text"],
      endpoints: {
        list: "/api/sites/site_demo/collections",
        detail: "/api/sites/site_demo/collections/{collectionId}",
        records: "/api/sites/site_demo/collections/{collectionId}/records",
        record: "/api/sites/site_demo/collections/{collectionId}/records/{recordId}",
        resolveList: "/api/sites/site_demo/resolve?path={listPath}",
        renderList: "/api/sites/site_demo/render?path={listPath}",
        resolveItem: "/api/sites/site_demo/resolve?path={itemPath}",
        renderItem: "/api/sites/site_demo/render?path={itemPath}",
      },
      methods: {
        list: "GET",
        detail: "GET",
        records: "GET",
        createRecord: "POST",
        updateRecord: "PATCH",
        deleteRecord: "DELETE",
      },
      capabilities: {
        publicSchemas: true,
        publicRecords: true,
        publicCreate: false,
        publicUpdate: false,
        publicDelete: false,
        dynamicListRoutes: true,
        dynamicItemRoutes: true,
        fieldValidation: true,
        relationshipFields: false,
        frontendDesignTemplates: false,
        conditionalRequests: true,
        cacheableRecords: true,
      },
      cache: {
        list: "public-discovery",
        detail: "public-discovery",
        records: "public-discovery",
        mutations: "private-no-store",
      },
      privacy: {
        publicRecordListsOnlyIncludePublishedRecords: true,
        visitorWritesRequirePublicPermission: true,
        publicUpdateAndDeleteMayRequireWriteToken: true,
      },
      writePolicy: {
        createStatus: "draft",
        createRequiresPublicCreate: true,
        updateRequiresPublicUpdate: true,
        deleteRequiresPublicDelete: true,
        updateDeleteToken: "publicWriteToken",
        fieldPolicyMetadata: "metadata.visitorWritePolicy",
      },
      schemas: {
        collection: "backy.collection.v1",
        record: "backy.collection-record.v1",
        validationError: "VALIDATION_ERROR",
        slugConflict: "SLUG_CONFLICT",
      },
    },
    forms: [
      {
        id: "form_contact",
        title: "Contact",
        active: true,
        moderationMode: "manual",
        pageId: "page_home",
        postId: null,
        fields: [
          {
            key: "email",
            label: "Email",
            type: "email",
            required: true,
          },
        ],
        submitUrl: "/api/sites/site_demo/forms/form_contact/submissions",
        detailUrl: "/api/sites/site_demo/forms/form_contact",
        definitionUrl: "/api/sites/site_demo/forms/form_contact/definition",
        submissionsUrl: "/api/sites/site_demo/forms/form_contact/submissions",
        contactsUrl: "/api/sites/site_demo/forms/form_contact/contacts",
        collectionTarget: {
          collectionId: "collection_articles",
          mode: "draft-record",
        },
        frontendDesign: {
          templateId: "template_contact",
          templateName: "Contact template",
          routePattern: "/contact",
        },
      },
    ],
    formsRuntime: {
      schemaVersion: "backy.forms-discovery.v1",
      count: 1,
      activeCount: 1,
      collectionTargetCount: 1,
      moderationModes: ["manual"],
      endpoints: {
        list: "/api/sites/site_demo/forms",
        detail: "/api/sites/site_demo/forms/{formId}",
        definition: "/api/sites/site_demo/forms/{formId}/definition",
        submit: "/api/sites/site_demo/forms/{formId}/submissions",
        submissions: "/api/sites/site_demo/forms/{formId}/submissions",
        contacts: "/api/sites/site_demo/forms/{formId}/contacts",
      },
      methods: {
        list: "GET",
        detail: "GET",
        definition: "GET",
        submit: "POST",
        reviewSubmission: "PATCH",
        updateContact: "PATCH",
      },
      capabilities: {
        publicDefinitions: true,
        publicSubmissions: true,
        fieldValidation: true,
        collectionWriteTargets: true,
        moderation: true,
        contactShare: true,
        conditionalRequests: true,
        cacheableDefinitions: true,
        privateSubmissionData: true,
      },
      cache: {
        list: "public-discovery",
        definition: "public-discovery",
        detail: "private-no-store",
        submissions: "private-no-store",
        contacts: "private-no-store",
      },
      privacy: {
        submissionPayloadsContainVisitorData: true,
        publicDefinitionExcludesSubmissions: true,
        contactPayloadsArePrivate: true,
      },
      schemas: {
        definition: "backy.form-definition.v1",
        validationError: "FORM_VALIDATION_ERROR",
        collectionRecordLink: "backy.form-collection-record-link.v1",
      },
    },
    comments: {
      schemaVersion: "backy.comments-discovery.v1",
      enabled: true,
      moderationMode: "manual",
      allowGuests: true,
      allowReplies: true,
      defaultSort: "newest",
      statuses: ["pending", "approved", "rejected", "spam", "blocked"],
      publicListStatus: "approved",
      reportReasons: ["spam", "harassment", "abuse", "other"],
      endpoints: {
        list: "/api/sites/site_demo/comments",
        pageComments: "/api/sites/site_demo/pages/{pageId}/comments",
        pageComment: "/api/sites/site_demo/pages/{pageId}/comments/{commentId}",
        blogComments: "/api/sites/site_demo/blog/{postId}/comments",
        blogComment: "/api/sites/site_demo/blog/{postId}/comments/{commentId}",
        reportReasons: "/api/sites/site_demo/comments/report-reasons",
        report: "/api/sites/site_demo/comments/{commentId}/report",
        blocklist: "/api/sites/site_demo/comments/blocklist",
      },
      reporting: {
        enabled: true,
        reasons: ["spam", "harassment", "abuse", "other"],
        reportUrlTemplate: "/api/sites/site_demo/comments/{commentId}/report",
      },
      spamProtection: {
        captchaEnabled: false,
        captchaProvider: "mock",
        blockedTermCount: 0,
        honeypotField: "website",
        timingField: "startedAt",
      },
    },
    reusableSections: {
      count: 1,
      listUrl: "/api/sites/site_demo/reusable-sections",
      categories: ["marketing"],
      tags: ["hero"],
      items: [
        {
          id: "section_hero",
          slug: "hero",
          name: "Hero",
          description: "Reusable hero section",
          category: "marketing",
          tags: ["hero", "landing"],
          detailUrl: "/api/sites/site_demo/reusable-sections/section_hero",
          canvasSize: {
            width: 1440,
            height: 640,
          },
          elementCount: 3,
        },
      ],
    },
    reusableSectionsRuntime: {
      schemaVersion: "backy.reusable-sections-discovery.v1",
      count: 1,
      activeCount: 1,
      categories: ["marketing"],
      tags: ["hero"],
      elementCount: 3,
      endpoints: {
        list: "/api/sites/site_demo/reusable-sections",
        detail: "/api/sites/site_demo/reusable-sections/{sectionId}",
      },
      methods: {
        list: "GET",
        detail: "GET",
      },
      capabilities: {
        publicSections: true,
        activeOnlyPublicReads: true,
        categoryFilters: true,
        tagFilters: true,
        searchFilters: true,
        canvasContent: true,
        frontendDesignTemplates: false,
        conditionalRequests: true,
        cacheableSections: true,
      },
      cache: {
        list: "public-discovery",
        detail: "public-discovery",
      },
      privacy: {
        publicReadsOnlyIncludeActiveSections: true,
        sectionContentIsPublicTemplateData: true,
        adminMetadataIsNotRequiredForRendering: true,
      },
      filters: {
        queryParams: ["category", "tag", "search"],
        categories: ["marketing"],
        tags: ["hero"],
      },
      schemas: {
        section: "backy.reusable-section.v1",
        content: "backy.content.v1",
        notFound: "REUSABLE_SECTION_NOT_FOUND",
      },
    },
    media: {
      schemaVersion: "backy.media-discovery.v1",
      count: 2,
      publicCount: 1,
      fontCount: 1,
      types: ["image", "font"],
      fileCategories: [
        {
          type: "image",
          label: "Images",
          accepts: ["image/*"],
          pickerUse: "visual-media",
          delivery: "public-or-signed-file",
          transformEligible: true,
          responsiveEligible: true,
          fontManifestEligible: false,
        },
        {
          type: "document",
          label: "Documents",
          accepts: ["application/pdf"],
          aliases: ["file"],
          pickerUse: "downloadable-document",
          delivery: "public-or-signed-file",
          transformEligible: false,
          responsiveEligible: false,
          fontManifestEligible: false,
        },
        {
          type: "font",
          label: "Fonts",
          accepts: ["font/*", ".woff2"],
          pickerUse: "typography",
          delivery: "font-manifest-or-file",
          transformEligible: false,
          responsiveEligible: false,
          fontManifestEligible: true,
        },
      ],
      listUrl: "/api/sites/site_demo/media",
      endpoints: {
        list: "/api/sites/site_demo/media",
        folders: "/api/sites/site_demo/media/folders",
        fonts: "/api/sites/site_demo/media/fonts",
        detail: "/api/sites/site_demo/media/{mediaId}",
        file: "/api/sites/site_demo/media/{mediaId}/file",
        transform: "/api/sites/site_demo/media/{mediaId}/transform?width={width}",
      },
      capabilities: {
        publicAssets: true,
        publicFolderDiscovery: true,
        signedPrivateFiles: true,
        responsiveImages: true,
        imageTransforms: true,
        fontManifest: true,
        references: true,
        editableMetadata: true,
      },
      filters: {
        types: ["image", "font"],
        typeAliases: {
          file: "document",
        },
        visibility: ["public", "private"],
        scopes: ["global", "page", "post"],
        queryParams: ["type", "q", "search", "tag", "folder", "folderId", "scope", "pageId", "postId", "blogId", "global", "limit", "offset"],
        maxLimit: 100,
        aliases: {
          q: "search",
          folder: "folderId",
          blogId: "postId",
          fileType: "document",
        },
      },
      methods: {
        list: "GET",
        folders: "GET",
        fonts: "GET",
        detail: "GET",
        file: "GET",
        transform: "GET",
      },
      cache: {
        list: "public-discovery",
        folders: "public-discovery",
        fonts: "public-discovery",
        detail: "public-discovery",
        file: "public-or-signed",
        transform: "public-redirect",
      },
      deliveryPolicy: {
        publicFiles: "direct-file-url",
        privateFiles: "signed-url-required",
        signedUrlEndpoint: "/api/admin/sites/site_demo/media/{mediaId}/signed-url",
        signedUrlMethod: "POST",
        signedUrlPermission: "media.view",
        acceptedDispositions: ["inline", "attachment"],
        defaultDisposition: "inline",
        maxSignedUrlSeconds: 3600,
        transformableTypes: ["image"],
        responsiveTypes: ["image"],
        fontManifestTypes: ["font"],
        downloadableTypes: ["document", "other", "audio", "video"],
        secretHandling: "Private file bytes require short-lived signed URLs minted through authenticated admin media APIs.",
      },
      schemas: {
        list: "backy.media-discovery.v1",
        fileCategories: "backy.media-file-categories.v1",
        folders: "backy.media-folders.v1",
        fonts: "backy.font-manifest.v1",
        references: "backy.media.references.v1",
        editableMetadata: "backy.media.editable-metadata.v1",
        notFound: "MEDIA_NOT_FOUND",
      },
    },
    commerce: {
      schemaVersion: "backy.commerce-settings.v1",
      mode: "checkout-provider",
      currency: "USD",
      paymentProvider: "stripe",
      providerAccountId: "acct_demo",
      provider: {
        mode: "test",
        accountId: "acct_demo",
        webhookConfigured: true,
        webhookEndpointUrl: "/api/sites/site_demo/commerce/webhook",
      },
      capabilities: {
        catalog: true,
        orderIntake: true,
        providerCheckout: true,
      },
      checkout: {
        catalogUrl: "/api/sites/site_demo/commerce/catalog",
        orderIntakeUrl: "/api/sites/site_demo/commerce/orders",
        successPath: "/checkout/success",
        cancelPath: "/checkout/cancel",
        guestCheckout: true,
      },
      pricing: {
        taxes: true,
        shipping: true,
        discounts: true,
        rules: {
          taxRatePercent: 8.25,
          digitalTaxRatePercent: 6,
          shippingBaseAmount: 8,
          shippingWeightRate: 1.25,
          discountPercent: 10,
        },
      },
      inventory: {
        reservations: true,
        reservationMinutes: 15,
      },
      webhooks: {
        eventsEnabled: true,
        endpointConfigured: true,
        eventAllowlist: ["checkout.session.completed"],
      },
      reconciliation: {
        mode: "webhook",
        windowHours: 24,
        requiresManualReview: false,
      },
      providerCertification: commerceProviderCertification,
    },
    commerceRuntime: {
      schemaVersion: "backy.commerce-discovery.v1",
      enabled: true,
      mode: "checkout-provider",
      currency: "USD",
      paymentProvider: "stripe",
      catalogCollection: {
        id: "collection_products",
        slug: "products",
        name: "Products",
        status: "published",
        publicRead: true,
      },
      ordersCollection: {
        id: "collection_orders",
        slug: "orders",
        name: "Orders",
        status: "published",
        publicRead: false,
      },
      endpoints: {
        catalog: "/api/sites/site_demo/commerce/catalog",
        productDetail: "/api/sites/site_demo/commerce/catalog?slug={slug}",
        orderContract: "/api/sites/site_demo/commerce/orders",
        createOrder: "/api/sites/site_demo/commerce/orders",
        providerWebhook: "/api/sites/site_demo/commerce/webhook",
        productCollectionRecords: "/api/sites/site_demo/collections/products/records",
      },
      methods: {
        catalog: "GET",
        productDetail: "GET",
        orderContract: "GET",
        createOrder: "POST",
        providerWebhook: "POST",
      },
      capabilities: {
        catalog: true,
        orderIntake: true,
        providerCheckout: true,
        productFilters: true,
        productFacets: true,
        inventoryReservations: true,
        pricingRules: true,
        guestCheckout: true,
        providerWebhooks: true,
        providerCertification: true,
        conditionalRequests: true,
        cacheableCatalog: true,
      },
      orderRequest: {
        schemaVersion: "backy.commerce-order-request.v1",
        contentType: "application/json",
        itemArrays: ["items", "lineItems", "cartItems", "cart.items"],
        itemFields: {
          productId: ["productId", "product_id"],
          slug: ["slug", "productSlug", "product_slug"],
          variantId: ["variantId", "variant_id"],
          variantSku: ["variantSku", "variant_sku", "sku"],
          quantity: ["quantity", "qty"],
        },
        customer: [
          "customer.name/customer.email/customer.phone",
          "customerName/customerEmail/customerPhone",
          "name/email/phone",
        ],
        discountCode: ["discountCode", "couponCode", "promoCode"],
        payment: [
          "paymentProvider/paymentReference",
          "payment.provider/payment.reference",
        ],
        checkoutSessionId: [
          "checkoutSessionId",
          "checkoutSession",
          "checkoutSession.id",
        ],
        quantity: {
          default: 1,
          minimum: 1,
          maximum: 999,
        },
        required: ["customer.name", "customer.email", "items[].productId or items[].slug"],
        checkoutSessionStatuses: ["requires_action", "provider_ready", "provider_created"],
      },
      cache: {
        catalog: "public-discovery",
        productDetail: "public-discovery",
        orderContract: "public-discovery",
        createOrder: "private-no-store",
        providerWebhook: "private-no-store",
      },
      privacy: {
        publicCatalogExcludesPrivateOrderQueue: true,
        ordersCollectionMustRemainPrivate: true,
        publicOrderPayloadContainsCustomerData: true,
        providerSecretsNeverReturned: true,
      },
      filters: {
        queryParams: ["slug", "limit", "offset", "sortBy", "sortDirection", "q", "search", "category", "tag", "vendor", "productType", "featured"],
        maxLimit: 100,
        sortDirections: ["asc", "desc"],
        productTypes: ["physical", "digital", "service"],
      },
      schemas: {
        catalog: "backy.commerce-catalog.v1",
        settings: "backy.commerce-settings.v1",
        orderContract: "backy.commerce-orders.v1",
        product: "backy.commerce-product.v1",
        providerCertification: "backy.commerce-provider-certification-handoff.v1",
        productCatalogNotFound: "PRODUCT_CATALOG_NOT_FOUND",
        productNotFound: "PRODUCT_NOT_FOUND",
        orderQueueNotFound: "ORDER_QUEUE_NOT_FOUND",
        orderQueueNotPrivate: "ORDER_QUEUE_NOT_PRIVATE",
        validationError: "VALIDATION_ERROR",
        productOutOfStock: "PRODUCT_OUT_OF_STOCK",
      },
    },
    interactiveComponents: {
      schemaVersion: "backy.interactive-components.v1",
      elementTypes: ["interactiveFigure", "codeComponent"],
      capabilities: {
        trustedRegistry: true,
        customCodeSandbox: true,
        signedBundles: true,
        staticFallbacks: true,
        versionedBundles: true,
        dataBindings: true,
      },
      registry: {
        provider: "local",
        configured: true,
        endpoint: null,
        bundleBaseUrl: null,
        signedBundles: true,
        reviewRequired: true,
      },
      sandbox: {
        enabled: true,
        origin: null,
        cspConfigured: true,
        iframeSandbox: "allow-scripts allow-forms",
        allowedConnectSrc: "'self'",
        requiresDedicatedOrigin: true,
        responseHeaders: {
          contentSecurityPolicy: [
            "default-src 'none'",
            "script-src 'unsafe-inline'",
            "style-src 'unsafe-inline'",
            "img-src data: https: http:",
            "media-src data: blob:",
            "connect-src 'self'",
            "font-src 'none'",
            "object-src 'none'",
            "frame-src 'none'",
            "worker-src 'none'",
            "manifest-src 'none'",
            "frame-ancestors 'self'",
            "base-uri 'none'",
            "form-action 'none'",
          ],
          permissionsPolicy: [
            "camera=()",
            "microphone=()",
            "geolocation=()",
            "payment=()",
            "usb=()",
            "serial=()",
          ],
          referrerPolicy: "no-referrer",
          contentTypeOptions: "nosniff",
        },
      },
      renderContract: {
        fields: [
          "componentKey",
          "version",
          "props",
          "controls",
          "dataBindings",
          "fallback",
        ],
        hydrationModes: [
          "trusted-component",
          "sandbox-iframe",
          "static-fallback",
        ],
        postMessageProtocol: "backy.interactive-component.v1",
        fallbackRequired: true,
        unknownComponentBehavior: "render-static-fallback",
      },
      dataBindingScopes: [
        "collections",
        "media",
        "forms",
        "commerce",
        "page",
        "blog",
      ],
      security: {
        parentDomAccess: false,
        parentCookieAccess: false,
        adminApiAccess: false,
        secretsInPayload: false,
        communication: "postMessage-only",
      },
    },
  },
  admin: {
    auth: {
      authenticated: false,
      mode: "anonymous",
    },
    summary: {
      allowed: 0,
      total: 0,
      blockedByStatus: false,
    },
    capabilities: {},
    permissions: {},
    endpoints: {},
  },
  delivery: {
    canonicalBaseUrl: "https://demo.example.com",
    managedBaseUrl: "https://backy.example.com/sites/demo",
    primaryDomain: "demo.example.com",
    defaultLocale: "en",
    localeStrategy: "path-prefix",
    locales: [
      {
        code: "en",
        default: true,
        direction: "ltr",
        pathPrefix: "",
        domain: null,
      },
      {
        code: "fr",
        label: "French",
        default: false,
        direction: "ltr",
        pathPrefix: "/fr",
        domain: "fr.demo.example.com",
      },
    ],
    domains: [],
    urls: {},
  },
  navigation: {
    primary: [
      {
        id: "nav_home",
        type: "page",
        pageId: "page_home",
        label: "Home",
        title: "Home",
        slug: "index",
        path: "/",
        target: "_self",
        status: "published",
        isHomepage: true,
        children: [],
      },
      {
        id: "nav_blog",
        type: "route",
        label: "Blog",
        path: "/blog",
        href: "/blog",
        target: "_self",
        children: [],
      },
    ],
    footer: [
      {
        id: "footer_contact",
        type: "url",
        label: "Contact",
        href: "https://demo.example.com/contact",
        target: "_blank",
        children: [],
      },
    ],
    layout: {
      header: {
        variant: "minimal",
        position: "sticky",
        width: "contained",
        showBrand: true,
        showSearch: true,
        showAccount: false,
        showCart: false,
        ctaLabel: "Start",
        ctaHref: "/start",
      },
      footer: {
        variant: "columns",
        width: "contained",
        showSocial: true,
        showNewsletter: false,
        note: "Demo footer",
      },
    },
  },
} satisfies GeneratedBackyFrontendManifest;

const commerceStorefrontContract = manifest.modules.commerce satisfies GeneratedBackyOpenApiCommerceStorefrontContract;
const generatedManifestCommerceProviderCertification =
  manifest.modules.commerce.providerCertification satisfies GeneratedBackyFrontendManifestCommerceProviderCertification;
const paddleCommerceStorefrontContract = {
  ...commerceStorefrontContract,
  paymentProvider: "paddle",
} satisfies GeneratedBackyOpenApiCommerceStorefrontContract;

const sdkDeliveryDiscovery = {
  canonicalBaseUrl: "https://demo.example.com",
  managedBaseUrl: "https://backy.example.com/sites/demo",
  primaryDomain: "demo.example.com",
  defaultLocale: "en",
  localeStrategy: "domain",
  locales: [
    {
      code: "en",
      default: true,
      direction: "ltr",
      pathPrefix: "",
      domain: "demo.example.com",
    },
    {
      code: "fr",
      label: "French",
      default: false,
      direction: "ltr",
      pathPrefix: "/fr",
      domain: "fr.demo.example.com",
    },
  ],
  domains: [],
  urls: {},
} satisfies BackyManifestDeliveryDiscovery;

const sdkLocaleStrategy = "path-prefix" satisfies BackyLocaleStrategy;

const sdkRouteFrontendDesign = {
  templateId: "template_product_grid",
  templateName: "Product grid",
  routePattern: "/shop",
  source: { kind: "captured-template" },
  chrome: { header: "transparent" },
  tokens: { accent: "#111111" },
  customCss: ".shop-grid { display: grid; }",
  bindingHints: [{ collection: "products" }],
} satisfies BackyManifestRouteFrontendDesign;

const sdkRoutePattern = {
  type: "page",
  pattern: "/",
  resolveUrl: "/api/sites/site_demo/resolve?path=%2F",
  renderUrl: "/api/sites/site_demo/render?path=%2F",
  frontendDesign: sdkRouteFrontendDesign,
} satisfies BackyManifestRoutePattern;

const sdkManifestPage = {
  id: "page_home",
  title: "Home",
  slug: "home",
  path: "/",
  status: "published",
  renderUrl: "/api/sites/site_demo/render?path=%2F",
  frontendDesign: sdkRouteFrontendDesign,
} satisfies BackyManifestPageResource;

const sdkManifestPagesRuntime = {
  schemaVersion: "backy.pages-discovery.v1",
  count: 1,
  publishedCount: 1,
  scheduledCount: 0,
  homepagePath: "/",
  paths: ["/"],
  endpoints: {
    list: "/api/sites/site_demo/pages",
    detail: "/api/sites/site_demo/pages?path={path}",
    resolve: "/api/sites/site_demo/resolve?path={path}",
    render: "/api/sites/site_demo/render?path={path}",
    liveManage: "/api/sites/site_demo/manage/pages/{pageId}",
  },
  methods: {
    list: "GET",
    detail: "GET",
    resolve: "GET",
    render: "GET",
    liveManageRead: "GET",
    liveManageUpdate: "PATCH",
  },
  capabilities: {
    publicList: true,
    publicDetail: true,
    renderPayload: true,
    routeResolve: true,
    seoMetadata: true,
    frontendDesignProvenance: true,
    previewTokens: true,
    liveManagement: true,
    conditionalRequests: true,
    cacheablePages: true,
  },
  cache: {
    list: "public-discovery",
    detail: "public-discovery",
    previewDetail: "private-no-store",
    render: "public-discovery",
  },
  privacy: {
    publicReadsOnlyIncludePublishedOrPastScheduledPages: true,
    draftPreviewRequiresToken: true,
    previewTokenIsNeverReturned: true,
  },
  filters: {
    queryParams: ["slug", "path", "previewToken", "limit", "offset"],
    maxLimit: 100,
  },
  schemas: {
    page: "backy.page.v1",
    renderPayload: "backy.render-payload.v1",
    seo: "backy.seo-route.v1",
    notFound: "PAGE_NOT_FOUND",
    invalidLimit: "INVALID_PAGE_LIMIT",
    invalidOffset: "INVALID_PAGE_OFFSET",
  },
} satisfies BackyManifestPagesRuntimeModule;

const sdkManifestPost = {
  id: "post_hello",
  title: "Hello",
  slug: "hello",
  path: "/blog/hello",
  status: "published",
  renderUrl: "/api/sites/site_demo/render?path=%2Fblog%2Fhello",
  frontendDesign: sdkRouteFrontendDesign,
} satisfies BackyManifestPostResource;

const sdkManifestBlogCategory = {
  id: "category_guides",
  name: "Guides",
  slug: "guides",
  postCount: 2,
} satisfies BackyManifestBlogCategory;

const sdkManifestBlogTag = {
  id: "tag_research",
  name: "Research",
  slug: "research",
  postCount: 1,
} satisfies BackyManifestBlogTag;

const sdkManifestBlogAuthor = {
  id: "author_ada",
  name: "Ada Lovelace",
  slug: "ada-lovelace",
  role: "Editor",
  status: "active",
  postCount: 3,
} satisfies BackyManifestBlogAuthor;

const sdkManifestBlog = {
  count: 1,
  rssUrl: "/api/sites/site_demo/blog/rss",
  hostedRssPath: "/blog/rss.xml",
  items: [sdkManifestPost],
  feeds: [],
  categories: [sdkManifestBlogCategory],
  tags: [sdkManifestBlogTag],
  authors: [sdkManifestBlogAuthor],
} satisfies BackyManifestBlogModule;

const sdkManifestBlogRuntime = {
  schemaVersion: "backy.blog-discovery.v1",
  count: 1,
  publishedCount: 1,
  scheduledCount: 0,
  categoryCount: 1,
  tagCount: 1,
  authorCount: 1,
  feedCount: 1,
  paths: ["/blog/welcome"],
  endpoints: {
    list: "/api/sites/site_demo/blog",
    detail: "/api/sites/site_demo/blog?slug={slug}",
    liveManage: "/api/sites/site_demo/manage/blog/{postId}",
    rss: "/api/sites/site_demo/blog/rss",
    categories: "/api/sites/site_demo/blog/categories",
    tags: "/api/sites/site_demo/blog/tags",
    authors: "/api/sites/site_demo/blog/authors",
    resolve: "/api/sites/site_demo/resolve?path={path}",
    render: "/api/sites/site_demo/render?path={path}",
  },
  methods: {
    list: "GET",
    detail: "GET",
    liveManageRead: "GET",
    liveManageUpdate: "PATCH",
    rss: "GET",
    categories: "GET",
    tags: "GET",
    authors: "GET",
    resolve: "GET",
    render: "GET",
  },
  capabilities: {
    publicList: true,
    publicDetail: true,
    taxonomyFilters: true,
    archiveFilters: true,
    searchFilters: true,
    rssFeed: true,
    renderPayload: true,
    routeResolve: true,
    frontendDesignProvenance: true,
    previewTokens: true,
    liveManagement: true,
    conditionalRequests: true,
    cacheablePosts: true,
  },
  cache: {
    list: "public-discovery",
    detail: "public-discovery",
    previewDetail: "private-no-store",
    taxonomy: "public-discovery",
    rss: "public-discovery",
    render: "public-discovery",
  },
  privacy: {
    publicReadsOnlyIncludePublishedOrPastScheduledPosts: true,
    draftPreviewRequiresToken: true,
    previewTokenIsNeverReturned: true,
  },
  filters: {
    queryParams: ["slug", "previewToken", "limit", "offset", "categorySlug", "tagSlug", "authorSlug"],
    maxLimit: 100,
    statuses: ["published", "draft", "scheduled", "archived"],
  },
  schemas: {
    post: "backy.blog-post.v1",
    feed: "backy.blog-feed.v1",
    renderPayload: "backy.render-payload.v1",
    notFound: "POST_NOT_FOUND",
    invalidLimit: "INVALID_BLOG_LIMIT",
    invalidOffset: "INVALID_BLOG_OFFSET",
    invalidStatus: "INVALID_BLOG_STATUS",
    invalidArchiveYear: "INVALID_BLOG_ARCHIVE_YEAR",
    invalidArchiveMonth: "INVALID_BLOG_ARCHIVE_MONTH",
  },
} satisfies BackyManifestBlogRuntimeModule;

const sdkManifestReusableSection = {
  id: "section_hero",
  slug: "hero",
  name: "Hero",
  description: "Reusable hero section",
  category: "marketing",
  tags: ["hero", "landing"],
  detailUrl: "/api/sites/site_demo/reusable-sections/section_hero",
  canvasSize: { width: 1440, height: 640 },
  elementCount: 3,
  frontendDesign: sdkRouteFrontendDesign,
} satisfies BackyManifestReusableSection;

const sdkManifestReusableSections = {
  count: 1,
  listUrl: "/api/sites/site_demo/reusable-sections",
  categories: ["marketing"],
  tags: ["hero", "landing"],
  items: [sdkManifestReusableSection],
} satisfies BackyManifestReusableSectionsModule;

const sdkManifestReusableSectionsRuntime = {
  schemaVersion: "backy.reusable-sections-discovery.v1",
  count: 1,
  activeCount: 1,
  categories: ["marketing"],
  tags: ["hero", "landing"],
  elementCount: 3,
  endpoints: {
    list: "/api/sites/site_demo/reusable-sections",
    detail: "/api/sites/site_demo/reusable-sections/{sectionId}",
  },
  methods: {
    list: "GET",
    detail: "GET",
  },
  capabilities: {
    publicSections: true,
    activeOnlyPublicReads: true,
    categoryFilters: true,
    tagFilters: true,
    searchFilters: true,
    canvasContent: true,
    frontendDesignTemplates: true,
    conditionalRequests: true,
    cacheableSections: true,
  },
  cache: {
    list: "public-discovery",
    detail: "public-discovery",
  },
  privacy: {
    publicReadsOnlyIncludeActiveSections: true,
    sectionContentIsPublicTemplateData: true,
    adminMetadataIsNotRequiredForRendering: true,
  },
  filters: {
    queryParams: ["category", "tag", "search"],
    categories: ["marketing"],
    tags: ["hero", "landing"],
  },
  schemas: {
    section: "backy.reusable-section.v1",
    content: "backy.content.v1",
    notFound: "REUSABLE_SECTION_NOT_FOUND",
  },
} satisfies BackyManifestReusableSectionsRuntimeModule;

const sdkManifestForm = {
  id: "form_contact",
  title: "Contact",
  active: true,
  fields: [{ key: "email", label: "Email", type: "email", required: true }],
  submitUrl: "/api/sites/site_demo/forms/form_contact/submissions",
  detailUrl: "/api/sites/site_demo/forms/form_contact",
  definitionUrl: "/api/sites/site_demo/forms/form_contact/definition",
  submissionsUrl: "/api/sites/site_demo/forms/form_contact/submissions",
  contactsUrl: "/api/sites/site_demo/forms/form_contact/contacts",
  collectionTarget: null,
  frontendDesign: sdkRouteFrontendDesign,
} satisfies BackyManifestFormDefinition;

const sdkManifestFormsRuntime = {
  schemaVersion: "backy.forms-discovery.v1",
  count: 1,
  activeCount: 1,
  collectionTargetCount: 1,
  moderationModes: ["manual"],
  endpoints: {
    list: "/api/sites/site_demo/forms",
    detail: "/api/sites/site_demo/forms/{formId}",
    definition: "/api/sites/site_demo/forms/{formId}/definition",
    submit: "/api/sites/site_demo/forms/{formId}/submissions",
    submissions: "/api/sites/site_demo/forms/{formId}/submissions",
    contacts: "/api/sites/site_demo/forms/{formId}/contacts",
  },
  methods: {
    list: "GET",
    detail: "GET",
    definition: "GET",
    submit: "POST",
    reviewSubmission: "PATCH",
    updateContact: "PATCH",
  },
  capabilities: {
    publicDefinitions: true,
    publicSubmissions: true,
    fieldValidation: true,
    collectionWriteTargets: true,
    moderation: true,
    contactShare: true,
    conditionalRequests: true,
    cacheableDefinitions: true,
    privateSubmissionData: true,
  },
  cache: {
    list: "public-discovery",
    definition: "public-discovery",
    detail: "private-no-store",
    submissions: "private-no-store",
    contacts: "private-no-store",
  },
  privacy: {
    submissionPayloadsContainVisitorData: true,
    publicDefinitionExcludesSubmissions: true,
    contactPayloadsArePrivate: true,
  },
  schemas: {
    definition: "backy.form-definition.v1",
    validationError: "FORM_VALIDATION_ERROR",
    collectionRecordLink: "backy.form-collection-record-link.v1",
  },
} satisfies BackyManifestFormsRuntimeModule;

const sdkManifestMedia = {
  schemaVersion: "backy.media-discovery.v1",
  count: 4,
  publicCount: 3,
  fontCount: 1,
  types: ["font", "image"],
  fileCategories: [
    {
      type: "image",
      label: "Images",
      accepts: ["image/*"],
      pickerUse: "visual-media",
      delivery: "public-or-signed-file",
      transformEligible: true,
      responsiveEligible: true,
      fontManifestEligible: false,
    },
    {
      type: "document",
      label: "Documents",
      accepts: ["application/pdf"],
      aliases: ["file"],
      pickerUse: "downloadable-document",
      delivery: "public-or-signed-file",
      transformEligible: false,
      responsiveEligible: false,
      fontManifestEligible: false,
    },
    {
      type: "font",
      label: "Fonts",
      accepts: ["font/*", ".woff2"],
      pickerUse: "typography",
      delivery: "font-manifest-or-file",
      transformEligible: false,
      responsiveEligible: false,
      fontManifestEligible: true,
    },
  ],
  listUrl: "/api/sites/site_demo/media",
  endpoints: {
    list: "/api/sites/site_demo/media",
    folders: "/api/sites/site_demo/media/folders",
    fonts: "/api/sites/site_demo/media/fonts",
    detail: "/api/sites/site_demo/media/{mediaId}",
    file: "/api/sites/site_demo/media/{mediaId}/file",
    transform: "/api/sites/site_demo/media/{mediaId}/transform?width={width}",
  },
  capabilities: {
    publicAssets: true,
    publicFolderDiscovery: true,
    signedPrivateFiles: true,
    responsiveImages: true,
    imageTransforms: true,
    fontManifest: true,
    references: true,
    editableMetadata: true,
  },
  filters: {
    types: ["font", "image"],
    typeAliases: {
      file: "document",
    },
    visibility: ["public", "private"],
    scopes: ["global", "page", "post"],
    queryParams: ["type", "q", "search", "tag", "folder", "folderId", "scope", "pageId", "postId", "blogId", "global", "limit", "offset"],
    maxLimit: 100,
    aliases: {
      q: "search",
      folder: "folderId",
      blogId: "postId",
      fileType: "document",
    },
  },
  methods: {
    list: "GET",
    folders: "GET",
    fonts: "GET",
    detail: "GET",
    file: "GET",
    transform: "GET",
  },
  cache: {
    list: "public-discovery",
    folders: "public-discovery",
    fonts: "public-discovery",
    detail: "public-discovery",
    file: "public-or-signed",
    transform: "public-redirect",
  },
  deliveryPolicy: {
    publicFiles: "direct-file-url",
    privateFiles: "signed-url-required",
    signedUrlEndpoint: "/api/admin/sites/site_demo/media/{mediaId}/signed-url",
    signedUrlMethod: "POST",
    signedUrlPermission: "media.view",
    acceptedDispositions: ["inline", "attachment"],
    defaultDisposition: "inline",
    maxSignedUrlSeconds: 3600,
    transformableTypes: ["image"],
    responsiveTypes: ["image"],
    fontManifestTypes: ["font"],
    downloadableTypes: ["document", "other", "audio", "video"],
    secretHandling: "Private file bytes require short-lived signed URLs minted through authenticated admin media APIs.",
  },
  schemas: {
    list: "backy.media-discovery.v1",
    fileCategories: "backy.media-file-categories.v1",
    folders: "backy.media-folders.v1",
    fonts: "backy.font-manifest.v1",
    references: "backy.media.references.v1",
    editableMetadata: "backy.media.editable-metadata.v1",
    notFound: "MEDIA_NOT_FOUND",
  },
} satisfies BackyManifestMediaModule;

const openApiMediaFileCategories = {
  schemaVersion: "backy.media-file-categories.v1",
  fileCategories: sdkManifestMedia.fileCategories,
  deliveryPolicy: sdkManifestMedia.deliveryPolicy,
} satisfies GeneratedBackyOpenApiMediaFileCategoryDiscovery;

const sdkManifestCommerceRuntime = {
  schemaVersion: "backy.commerce-discovery.v1",
  enabled: true,
  mode: "checkout-provider",
  currency: "USD",
  paymentProvider: "stripe",
  catalogCollection: {
    id: "collection_products",
    slug: "products",
    name: "Products",
    status: "published",
    publicRead: true,
  },
  ordersCollection: {
    id: "collection_orders",
    slug: "orders",
    name: "Orders",
    status: "published",
    publicRead: false,
  },
  endpoints: {
    catalog: "/api/sites/site_demo/commerce/catalog",
    productDetail: "/api/sites/site_demo/commerce/catalog?slug={slug}",
    orderContract: "/api/sites/site_demo/commerce/orders",
    createOrder: "/api/sites/site_demo/commerce/orders",
    providerWebhook: "/api/sites/site_demo/commerce/webhook",
    productCollectionRecords: "/api/sites/site_demo/collections/products/records",
  },
  methods: {
    catalog: "GET",
    productDetail: "GET",
    orderContract: "GET",
    createOrder: "POST",
    providerWebhook: "POST",
  },
  capabilities: {
    catalog: true,
    orderIntake: true,
    providerCheckout: true,
    productFilters: true,
    productFacets: true,
    inventoryReservations: true,
    pricingRules: true,
    guestCheckout: true,
    providerWebhooks: true,
    providerCertification: true,
    conditionalRequests: true,
    cacheableCatalog: true,
  },
  orderRequest: {
    schemaVersion: "backy.commerce-order-request.v1",
    contentType: "application/json",
    itemArrays: ["items", "lineItems", "cartItems", "cart.items"],
    itemFields: {
      productId: ["productId", "product_id"],
      slug: ["slug", "productSlug", "product_slug"],
      variantId: ["variantId", "variant_id"],
      variantSku: ["variantSku", "variant_sku", "sku"],
      quantity: ["quantity", "qty"],
    },
    customer: [
      "customer.name/customer.email/customer.phone",
      "customerName/customerEmail/customerPhone",
      "name/email/phone",
    ],
    discountCode: ["discountCode", "couponCode", "promoCode"],
    payment: [
      "paymentProvider/paymentReference",
      "payment.provider/payment.reference",
    ],
    checkoutSessionId: [
      "checkoutSessionId",
      "checkoutSession",
      "checkoutSession.id",
    ],
    quantity: {
      default: 1,
      minimum: 1,
      maximum: 999,
    },
    required: ["customer.name", "customer.email", "items[].productId or items[].slug"],
    checkoutSessionStatuses: ["requires_action", "provider_ready", "provider_created"],
  },
  cache: {
    catalog: "public-discovery",
    productDetail: "public-discovery",
    orderContract: "public-discovery",
    createOrder: "private-no-store",
    providerWebhook: "private-no-store",
  },
  privacy: {
    publicCatalogExcludesPrivateOrderQueue: true,
    ordersCollectionMustRemainPrivate: true,
    publicOrderPayloadContainsCustomerData: true,
    providerSecretsNeverReturned: true,
  },
  filters: {
    queryParams: ["slug", "limit", "offset", "sortBy", "sortDirection", "q", "search", "category", "tag", "vendor", "productType", "featured"],
    maxLimit: 100,
    sortDirections: ["asc", "desc"],
    productTypes: ["physical", "digital", "service"],
  },
  schemas: {
    catalog: "backy.commerce-catalog.v1",
    settings: "backy.commerce-settings.v1",
    orderContract: "backy.commerce-orders.v1",
    product: "backy.commerce-product.v1",
    providerCertification: "backy.commerce-provider-certification-handoff.v1",
    productCatalogNotFound: "PRODUCT_CATALOG_NOT_FOUND",
    productNotFound: "PRODUCT_NOT_FOUND",
    orderQueueNotFound: "ORDER_QUEUE_NOT_FOUND",
    orderQueueNotPrivate: "ORDER_QUEUE_NOT_PRIVATE",
    validationError: "VALIDATION_ERROR",
    productOutOfStock: "PRODUCT_OUT_OF_STOCK",
  },
} satisfies BackyManifestCommerceRuntimeModule;

const sdkManifestTheme = {
  schemaVersion: "backy.theme-discovery.v1",
  tokenSchemaVersion: "backy.theme.v1",
  tokens: theme,
  cssVariables: {
    "--backy-color-primary": "#111111",
    "--backy-font-heading": "Inter",
  },
  selectors: {
    root: ":root",
    scoped: "[data-backy-theme]",
  },
  editableFields: ["colors.primary", "fonts.heading", "spacing.unit", "customCSS"],
  capabilities: {
    cssVariables: true,
    customCss: true,
    typographyFamilies: true,
    spacingScale: true,
    liveEditable: true,
    frontendDesignOverrides: true,
  },
} satisfies BackyManifestThemeModule;

const sdkManifestLiveManagement = {
  schemaVersion: "backy.live-management.v1",
  enabled: true,
  endpoints: {
    page: "/api/sites/site_demo/manage/pages/{pageId}",
    post: "/api/sites/site_demo/manage/blog/{postId}",
    render: "/api/sites/site_demo/render?path={path}",
    editableMapSchema:
      "https://backy.dev/schemas/ai-frontend-contract/editable-map.schema.json",
  },
  methods: {
    read: "GET",
    update: "PATCH",
  },
  auth: {
    modes: ["session", "api-key"],
    headers: ["Authorization", "x-backy-admin-session", "x-backy-admin-key", "x-api-key"],
    requiredPermissions: {
      read: "pages.view",
      update: "pages.edit",
    },
    siteScope: true,
  },
  capabilities: {
    pageMetadata: true,
    postMetadata: true,
    contentDocument: true,
    canvasElements: true,
    editableMap: true,
    optimisticConcurrency: true,
    cacheInvalidation: true,
    auditTrail: true,
    webhookDelivery: true,
  },
  editableTargets: ["props.content", "props.href", "props.formId", "props.label", "props.options", "styles.color"],
  updateBody: {
    expectedUpdatedAt: "Use the current page updatedAt value.",
    content: "Send the full Backy content document or canvas content object.",
  },
  errors: {
    conflict: "PAGE_VERSION_CONFLICT",
    postConflict: "BLOG_VERSION_CONFLICT",
    forbidden: "FORBIDDEN_LIVE_MANAGE_SITE_SCOPE",
    postForbidden: "FORBIDDEN_LIVE_MANAGE_BLOG_SCOPE",
    validation: "VALIDATION_ERROR",
  },
} satisfies BackyManifestLiveManagementModule;

const openApiLiveManagement = {
  ...sdkManifestLiveManagement,
  capabilities: {
    ...sdkManifestLiveManagement.capabilities,
    inlineFormControls: true,
  },
  inlineElementTypes: {
    text: ["text", "heading", "paragraph", "quote", "button", "link"],
    link: ["button", "link"],
    image: ["image"],
    media: ["video", "embed", "map"],
    formControls: ["form", "input", "textarea", "select", "checkbox", "radio"],
  },
} satisfies GeneratedBackyOpenApiLiveManagementDiscovery;

const sdkManifestCollection = {
  id: "collection_products",
  slug: "products",
  name: "Products",
  status: "published",
  permissions: { publicRead: true },
  fields: [{ key: "title", label: "Title", type: "text", required: true }],
  recordsUrl: "/api/sites/site_demo/collections/collection_products/records",
  listRoutePattern: "/products",
  dynamicListRoutePattern: "/products",
  dynamicListRouteResolveUrl: "/api/sites/site_demo/resolve?path=%2Fproducts",
  dynamicListRouteRenderUrl: "/api/sites/site_demo/render?path=%2Fproducts",
  routePattern: "/products/:recordSlug",
  dynamicRoutePattern: "/products/:recordSlug",
  dynamicRouteResolveUrl:
    "/api/sites/site_demo/resolve?path=%2Fproducts%2F%3ArecordSlug",
  dynamicRouteRenderUrl:
    "/api/sites/site_demo/render?path=%2Fproducts%2F%3ArecordSlug",
  frontendDesign: sdkRouteFrontendDesign,
} satisfies BackyManifestCollectionSchema;

const sdkManifestCollectionsRuntime = {
  schemaVersion: "backy.collections-discovery.v1",
  count: 1,
  publishedCount: 1,
  publicReadCount: 1,
  publicCreateCount: 1,
  publicUpdateCount: 0,
  publicDeleteCount: 0,
  fieldTypes: ["text"],
  endpoints: {
    list: "/api/sites/site_demo/collections",
    detail: "/api/sites/site_demo/collections/{collectionId}",
    records: "/api/sites/site_demo/collections/{collectionId}/records",
    record: "/api/sites/site_demo/collections/{collectionId}/records/{recordId}",
    resolveList: "/api/sites/site_demo/resolve?path={listPath}",
    renderList: "/api/sites/site_demo/render?path={listPath}",
    resolveItem: "/api/sites/site_demo/resolve?path={itemPath}",
    renderItem: "/api/sites/site_demo/render?path={itemPath}",
  },
  methods: {
    list: "GET",
    detail: "GET",
    records: "GET",
    createRecord: "POST",
    updateRecord: "PATCH",
    deleteRecord: "DELETE",
  },
  capabilities: {
    publicSchemas: true,
    publicRecords: true,
    publicCreate: true,
    publicUpdate: false,
    publicDelete: false,
    dynamicListRoutes: true,
    dynamicItemRoutes: true,
    fieldValidation: true,
    relationshipFields: false,
    frontendDesignTemplates: true,
    conditionalRequests: true,
    cacheableRecords: true,
  },
  cache: {
    list: "public-discovery",
    detail: "public-discovery",
    records: "public-discovery",
    mutations: "private-no-store",
  },
  privacy: {
    publicRecordListsOnlyIncludePublishedRecords: true,
    visitorWritesRequirePublicPermission: true,
    publicUpdateAndDeleteMayRequireWriteToken: true,
  },
  writePolicy: {
    createStatus: "draft",
    createRequiresPublicCreate: true,
    updateRequiresPublicUpdate: true,
    deleteRequiresPublicDelete: true,
    updateDeleteToken: "publicWriteToken",
    fieldPolicyMetadata: "metadata.visitorWritePolicy",
  },
  schemas: {
    collection: "backy.collection.v1",
    record: "backy.collection-record.v1",
    validationError: "VALIDATION_ERROR",
    slugConflict: "SLUG_CONFLICT",
  },
} satisfies BackyManifestCollectionsRuntimeModule;

const sdkLocalizedRoutePatternGroup = {
  locale: "fr",
  default: false,
  pathPrefix: "/fr",
  domain: "fr.demo.example.com",
  patterns: [
    {
      type: "page",
      locale: "fr",
      basePattern: "/",
      pattern: "/fr",
      resolveUrl: "/api/sites/site_demo/resolve?path=%2Ffr",
      renderUrl: "/api/sites/site_demo/render?path=%2Ffr",
    },
  ],
} satisfies BackyManifestLocalizedRoutePatternGroup;

const sdkRedirectRule = {
  id: "redirect_demo",
  type: "redirect",
  from: "/old",
  to: "/new",
  statusCode: 301,
  resolveUrl: "/api/sites/site_demo/resolve?path=%2Fold",
} satisfies BackyManifestRedirectRule;

const sdkRoutingModule = {
  supportedRouteTypes: [
    "page",
    "post",
    "dynamicList",
    "dynamicItem",
    "redirect",
    "gone",
  ],
  redirectRules: {
    count: 1,
    items: [sdkRedirectRule],
  },
  localizedRoutePatterns: [sdkLocalizedRoutePatternGroup],
} satisfies BackyManifestRoutingModule;

const manifestEnvelope = {
  success: true,
  requestId: "req_manifest_types",
  data: manifest,
} satisfies GeneratedBackyFrontendManifestEnvelope;

const siteSummary = {
  id: "site_demo",
  slug: "demo",
  name: "Demo Site",
  description: "Typed public discovery site",
  customDomain: null,
  status: "published",
  isPublished: true,
  theme: {},
} satisfies GeneratedBackyOpenApiSiteSummary;

const siteEnvelope = {
  success: true,
  requestId: "req_site",
  data: {
    site: siteSummary,
  },
} satisfies GeneratedBackyOpenApiSiteEnvelope;

const siteListEnvelope = {
  success: true,
  requestId: "req_sites",
  data: {
    sites: [siteSummary],
    pagination: {
      total: 1,
      limit: 100,
      offset: 0,
      hasMore: false,
    },
  },
} satisfies GeneratedBackyOpenApiSiteListEnvelope;

const openApi = {
  openapi: "3.1.0",
  "x-backy-database-certification": frontendDatabaseCertification,
  "x-backy-media-file-categories": openApiMediaFileCategories,
  "x-backy-live-management": openApiLiveManagement,
  info: {
    title: "Demo Backy Public API",
    version: "backy-public.v1",
  },
  paths: {
    "/api/sites": {
      get: {
        operationId: "discoverBackySite",
        responses: {},
      },
    },
    "/api/sites/site_demo/manifest": {
      get: {
        operationId: "getBackyFrontendManifest",
        responses: {},
      },
    },
  },
  components: {
    schemas: {
      ErrorEnvelope: {
        success: false,
        requestId: "req_error",
        error: {
          code: "NOT_FOUND",
          message: "Missing",
        },
      },
      SiteSummary: siteSummary,
      MediaFileCategoryDiscovery: openApiMediaFileCategories,
      LiveManagementDiscovery: openApiLiveManagement,
      SiteEnvelope: siteEnvelope,
      SiteListEnvelope: siteListEnvelope,
      RouteResolveEnvelope: {
        success: true,
        requestId: "req_route",
        data: {
          site: {},
          route: {
            type: "page",
            path: "/",
            status: "published",
            canonical: "/",
            params: {},
            resource: {
              id: "page_home",
              kind: "page",
              title: "Home",
              slug: "index",
              apiUrl: "/api/sites/site_demo/pages?path=%2F",
              renderUrl: "/api/sites/site_demo/render?path=%2F",
            },
          },
        },
      },
    },
  },
} satisfies GeneratedBackyOpenApiDocument;

const openApiOperationId =
  "getBackyFrontendManifest" satisfies GeneratedBackyOpenApiOperationId;
const openApiComponentName =
  "ErrorEnvelope" satisfies GeneratedBackyOpenApiComponentName;
const openApiComponents = {
  MediaFileCategoryDiscovery: openApiMediaFileCategories,
  LiveManagementDiscovery: openApiLiveManagement,
  ErrorEnvelope: {
    success: false,
    requestId: "req_error",
    error: {
      code: "NOT_FOUND",
      message: "Missing",
    },
  },
  FormSubmissionValidationErrorEnvelope: {
    success: false,
    requestId: "req_validation",
    error: {
      code: "VALIDATION_ERROR",
      message: "Invalid submission",
    },
    validation: [
      {
        field: "email",
        code: "invalid_email",
        message: "Enter a valid email.",
      },
    ],
  },
} satisfies GeneratedBackyOpenApiComponents;
const openApiOperation = {
  operationId: openApiOperationId,
  responses: {},
} satisfies GeneratedBackyOpenApiOperation;

const pageRouteResource = {
  id: "page_home",
  kind: "page",
  title: "Home",
  slug: "index",
  apiUrl: "/api/sites/site_demo/pages?path=%2F",
  renderUrl: "/api/sites/site_demo/render?path=%2F",
} satisfies GeneratedBackyOpenApiPageRouteResource;

const postRouteResource = {
  id: "post_intro",
  kind: "post",
  title: "Intro",
  slug: "intro",
  apiUrl: "/api/sites/site_demo/blog?slug=intro",
  hostedPath: "/blog/intro",
} satisfies GeneratedBackyOpenApiPostRouteResource;

const dynamicListRouteResource = {
  id: "collection_docs",
  kind: "dynamicList",
  title: "Docs",
  slug: "docs",
  collectionId: "collection_docs",
  collectionSlug: "docs",
  collectionName: "Docs",
  recordsUrl: "/api/sites/site_demo/collections/collection_docs/records",
  renderUrl: "/api/sites/site_demo/render?path=%2Fdocs",
  hostedPath: "/docs",
  recordCount: 3,
} satisfies GeneratedBackyOpenApiDynamicListRouteResource;

const dynamicItemRouteResource = {
  id: "record_getting_started",
  kind: "dynamicItem",
  title: "Getting Started",
  slug: "getting-started",
  collectionId: "collection_docs",
  collectionSlug: "docs",
  collectionName: "Docs",
  apiUrl:
    "/api/sites/site_demo/collections/collection_docs/records?slug=getting-started",
  renderUrl: "/api/sites/site_demo/render?path=%2Fdocs%2Fgetting-started",
  hostedPath: "/docs/getting-started",
} satisfies GeneratedBackyOpenApiDynamicItemRouteResource;

const pageRoute = {
  type: "page",
  path: "/",
  status: "published",
  canonical: "/",
  params: {},
  resource: pageRouteResource,
} satisfies GeneratedBackyOpenApiPageRoute;

const postRoute = {
  type: "post",
  path: "/blog/intro",
  status: "published",
  canonical: "/blog/intro",
  params: {
    slug: "intro",
  },
  resource: postRouteResource,
} satisfies GeneratedBackyOpenApiPostRoute;

const dynamicListRoute = {
  type: "dynamicList",
  path: "/docs",
  status: "published",
  canonical: "/docs",
  params: {},
  resource: dynamicListRouteResource,
} satisfies GeneratedBackyOpenApiDynamicListRoute;

const dynamicItemRoute = {
  type: "dynamicItem",
  path: "/docs/getting-started",
  status: "published",
  canonical: "/docs/getting-started",
  params: {
    slug: "getting-started",
  },
  resource: dynamicItemRouteResource,
} satisfies GeneratedBackyOpenApiDynamicItemRoute;

const redirectRoute = {
  type: "redirect",
  path: "/old-docs",
  status: "published",
  canonical: "/docs",
  params: {},
  resource: {
    id: "redirect_old_docs",
    kind: "redirect",
    from: "/old-docs",
    to: "/docs",
    statusCode: 301,
  },
} satisfies GeneratedBackyOpenApiRedirectRoute;

const goneRoute = {
  type: "gone",
  path: "/retired",
  status: "archived",
  canonical: "/retired",
  params: {},
  resource: {
    id: "gone_retired",
    kind: "gone",
    from: "/retired",
    statusCode: 410,
  },
} satisfies GeneratedBackyOpenApiGoneRoute;

const resolvedRoute =
  dynamicItemRoute satisfies GeneratedBackyOpenApiResolvedRoute;

const routeResolveEnvelope = {
  success: true,
  requestId: "req_resolve",
  data: {
    site: {
      id: "site_demo",
      slug: "demo",
    },
    route: resolvedRoute,
    navigation: {
      primary: [],
    },
  },
} satisfies GeneratedBackyOpenApiRouteResolveEnvelope;

const goneRouteResolveEnvelope = {
  success: false,
  requestId: "req_gone",
  error: {
    code: "ROUTE_GONE",
    message: "This route has been retired.",
  },
  data: {
    site: {
      id: "site_demo",
      slug: "demo",
    },
    route: goneRoute,
  },
} satisfies GeneratedBackyOpenApiGoneRouteResolveEnvelope;

const collectionFieldOption = {
  value: "published",
  label: "Published",
  color: "#16a34a",
  description: "Visible in public collection feeds.",
} satisfies GeneratedBackyOpenApiCollectionFieldOption;

const collectionFieldValidation = {
  minLength: 3,
  maxLength: 120,
  pattern: "^[a-z0-9-]+$",
} satisfies GeneratedBackyOpenApiCollectionFieldValidation;

const collectionField = {
  id: "field_slug",
  key: "slug",
  label: "Slug",
  type: "slug",
  required: true,
  unique: true,
  sortOrder: 20,
  helpText: "Used in the public record URL.",
  defaultValue: null,
  validation: collectionFieldValidation,
} satisfies GeneratedBackyOpenApiCollectionFieldSchema;

const selectCollectionField = {
  id: "field_status",
  key: "status",
  label: "Status",
  type: "select",
  required: true,
  unique: false,
  options: [collectionFieldOption],
} satisfies GeneratedBackyOpenApiCollectionFieldSchema;

const collectionPermissions = {
  publicRead: true,
  publicCreate: false,
  publicUpdate: false,
  publicDelete: false,
} satisfies GeneratedBackyOpenApiCollectionPermissions;

const collectionSchema = {
  id: "collection_docs",
  siteId: "site_demo",
  name: "Docs",
  slug: "docs",
  status: "published",
  fields: [collectionField, selectCollectionField],
  permissions: collectionPermissions,
  recordsUrl: "/api/sites/site_demo/collections/collection_docs/records",
  listRoutePattern: "/docs",
  routePattern: "/docs/:slug",
} satisfies GeneratedBackyOpenApiCollectionSchema;

const collectionListEnvelope = {
  success: true,
  requestId: "req_collections",
  data: {
    collections: [collectionSchema],
    pagination: {
      total: 1,
      limit: 20,
      offset: 0,
      hasMore: false,
    },
  },
} satisfies GeneratedBackyOpenApiCollectionListEnvelope;

const collectionEnvelope = {
  success: true,
  requestId: "req_collection",
  data: {
    collection: collectionSchema,
  },
} satisfies GeneratedBackyOpenApiCollectionEnvelope;

const collectionRecord = {
  id: "record_getting_started",
  siteId: "site_demo",
  collectionId: "collection_docs",
  slug: "getting-started",
  status: "published",
  values: {
    title: "Getting Started",
    slug: "getting-started",
  },
  frontendDesign: {
    templateId: "template_docs_detail",
    templateName: "Docs detail",
    routePattern: "/docs/:slug",
  },
} satisfies GeneratedBackyOpenApiCollectionRecord;

const collectionRecordListEnvelope = {
  success: true,
  requestId: "req_collection_records",
  data: {
    collection: collectionSchema,
    records: [collectionRecord],
    pagination: {
      total: 1,
      limit: 20,
      offset: 0,
      hasMore: false,
    },
  },
} satisfies GeneratedBackyOpenApiCollectionRecordListEnvelope;

const collectionRecordEnvelope = {
  success: true,
  requestId: "req_collection_record",
  data: {
    record: collectionRecord,
    visitorWritePolicy: {
      allowedCreateFields: ["title", "slug"],
      ignoredFields: ["status"],
    },
  },
} satisfies GeneratedBackyOpenApiCollectionRecordEnvelope;

const publicDeleteEnvelope = {
  success: true,
  requestId: "req_collection_record_delete",
  data: {
    deleted: true,
    recordId: "record_getting_started",
    slug: "getting-started",
  },
} satisfies GeneratedBackyOpenApiPublicDeleteEnvelope;

const formValidationRule = {
  type: "pattern",
  value: "^[^@]+@[^@]+$",
  message: "Enter a valid email address.",
} satisfies GeneratedBackyOpenApiFormValidationRule;

const formField = {
  key: "email",
  label: "Email",
  type: "email",
  placeholder: "you@example.com",
  helpText: "Used for reply notifications.",
  validation: [formValidationRule],
  required: true,
} satisfies GeneratedBackyOpenApiFormFieldDefinition;

const formDefinition = {
  id: "form_contact",
  siteId: "site_demo",
  name: "Contact",
  title: "Contact us",
  description: "Send the team a message.",
  audience: "public",
  isActive: true,
  fields: [formField],
  notificationEmail: "team@example.com",
  successMessage: "Thanks, we will reply soon.",
  enableHoneypot: true,
  enableCaptcha: false,
} satisfies GeneratedBackyOpenApiFormDefinition;

const formListEnvelope = {
  success: true,
  requestId: "req_forms",
  data: {
    forms: [formDefinition],
    total: 1,
    pagination: {
      total: 1,
      limit: 20,
      offset: 0,
      hasMore: false,
    },
  },
} satisfies GeneratedBackyOpenApiFormListEnvelope;

const formEnvelope = {
  success: true,
  requestId: "req_form",
  data: {
    form: formDefinition,
    endpoints: {
      definition: "/api/sites/site_demo/forms/form_contact/definition",
      submissions: "/api/sites/site_demo/forms/form_contact/submissions",
      contacts: "/api/sites/site_demo/forms/form_contact/contacts",
    },
  },
} satisfies GeneratedBackyOpenApiFormEnvelope;

const formDefinitionEnvelope = {
  success: true,
  requestId: "req_form_definition",
  data: {
    schemaVersion: "backy.form-definition.v1",
    form: formDefinition,
    submitUrl: "/api/sites/site_demo/forms/form_contact/submissions",
  },
} satisfies GeneratedBackyOpenApiFormDefinitionEnvelope;

const formCollectionRecordLink = {
  siteId: "site_demo",
  collectionId: "collection_leads",
  collectionSlug: "leads",
  recordId: "record_lead_1",
  recordSlug: "lead-1",
  status: "published",
  createdAt: "2026-05-16T00:00:00.000Z",
} satisfies GeneratedBackyOpenApiFormCollectionRecordLink;

const formCollectionRecordError = {
  field: "email",
  message: "A lead with this email already exists.",
} satisfies GeneratedBackyOpenApiFormCollectionRecordError;

const formSubmission = {
  id: "submission_1",
  formId: "form_contact",
  siteId: "site_demo",
  pageId: "page_contact",
  postId: null,
  values: {
    email: "reader@example.com",
    message: "Please send the product brief.",
  },
  ipHash: "ip_hash_1",
  userAgent: "Mozilla/5.0",
  requestId: "req_submission",
  status: "pending",
  reviewedBy: null,
  reviewedAt: null,
  adminNotes: null,
  updatedAt: "2026-05-16T00:01:00.000Z",
  collectionRecord: formCollectionRecordLink,
  collectionRecordErrors: [formCollectionRecordError],
  submittedAt: "2026-05-16T00:00:00.000Z",
} satisfies GeneratedBackyOpenApiFormSubmission;

const formSubmissionRequest = {
  values: {
    email: "reader@example.com",
  },
  requestId: "req_submit",
  pageId: "page_contact",
  honeypot: "",
  captcha: {
    token: "captcha-token",
  },
} satisfies GeneratedBackyOpenApiFormSubmissionRequest;

const formSubmissionValidationDetail = {
  field: "email",
  code: "invalid_email",
  message: "Enter a valid email address.",
  label: "Email",
} satisfies GeneratedBackyOpenApiFormSubmissionValidationDetail;

const formSubmissionValidationErrorEnvelope = {
  success: false,
  requestId: "req_validation",
  error: {
    code: "VALIDATION_ERROR",
    message: "Invalid submission",
  },
  status: "pending",
  validation: [formSubmissionValidationDetail],
  spamFlags: [],
  message: "Invalid submission",
} satisfies GeneratedBackyOpenApiFormSubmissionValidationErrorEnvelope;

const formSubmissionEnvelope = {
  success: true,
  requestId: "req_submission",
  data: {
    submission: formSubmission,
    collectionRecord: formCollectionRecordLink,
    collectionRecordErrors: [formCollectionRecordError],
  },
} satisfies GeneratedBackyOpenApiFormSubmissionEnvelope;

const formSubmissionsEnvelope = {
  success: true,
  requestId: "req_submissions",
  data: {
    form: formDefinition,
    submissions: [formSubmission],
    pagination: {
      total: 1,
      limit: 20,
      offset: 0,
      hasMore: false,
    },
  },
} satisfies GeneratedBackyOpenApiFormSubmissionsEnvelope;

const formContact = {
  id: "contact_1",
  siteId: "site_demo",
  formId: "form_contact",
  pageId: "page_contact",
  postId: null,
  name: "Reader",
  email: "reader@example.com",
  phone: null,
  notes: "Asked for the product brief.",
  sourceValues: formSubmission.values,
  status: "new",
  sourceSubmissionId: "submission_1",
  requestId: "req_submission",
  sourceIpHash: "ip_hash_1",
  createdAt: "2026-05-16T00:00:00.000Z",
  updatedAt: "2026-05-16T00:01:00.000Z",
} satisfies GeneratedBackyOpenApiFormContact;

const formContactEnvelope = {
  success: true,
  requestId: "req_contact",
  data: {
    contact: formContact,
  },
} satisfies GeneratedBackyOpenApiFormContactEnvelope;

const formContactsEnvelope = {
  success: true,
  requestId: "req_contacts",
  data: {
    form: formDefinition,
    contacts: [formContact],
    pagination: {
      total: 1,
      limit: 20,
      offset: 0,
      hasMore: false,
    },
  },
} satisfies GeneratedBackyOpenApiFormContactsEnvelope;

const mediaReferenceTarget = {
  id: "page_home",
  usageTypes: ["hero-image"],
  bindings: [
    {
      id: "binding_hero_image",
      mediaId: "media_hero",
      scope: "page",
      targetId: "page_home",
      usageType: "hero-image",
      attachedBy: "admin@example.com",
      createdAt: "2026-05-16T00:00:00.000Z",
      updatedAt: "2026-05-16T00:01:00.000Z",
    },
  ],
} satisfies GeneratedBackyOpenApiMediaReferenceTarget;

const mediaReferences = {
  schemaVersion: "backy.media.references.v1",
  global: false,
  scoped: true,
  scopes: ["page"],
  pageIds: ["page_home"],
  postIds: [],
  pages: [mediaReferenceTarget],
  posts: [],
  usageTypes: ["hero-image"],
  totalBindings: 1,
} satisfies GeneratedBackyOpenApiMediaReferences;

const mediaEditableMetadata = {
  schemaVersion: "backy.media.editable-metadata.v1",
  title: "Homepage hero",
  altText: "Abstract product dashboard hero image",
  caption: "Used on the homepage hero.",
  tags: ["homepage", "hero"],
  folderId: "folder_brand",
  scope: "page",
  scopeTargetId: "page_home",
  visibility: "public",
  metadata: {
    dominantColor: "#3366ff",
  },
} satisfies GeneratedBackyOpenApiMediaEditableMetadata;

const mediaAsset = {
  id: "media_hero",
  type: "image",
  url: "/media/hero.webp",
  visibility: "public",
  references: mediaReferences,
  referenceSummary: {
    pageCount: 1,
    postCount: 0,
    usageTypes: ["hero-image"],
    global: false,
    scoped: true,
  },
  editableMetadata: mediaEditableMetadata,
  responsive: {
    src: "/media/hero-1200.webp",
    srcSet: "/media/hero-640.webp 640w, /media/hero-1200.webp 1200w",
    sizes: "(min-width: 768px) 50vw, 100vw",
    variants: [
      {
        width: 1200,
        quality: 80,
        url: "/media/hero-1200.webp",
        bytes: 82000,
        format: "webp",
        mimeType: "image/webp",
        generatedAt: "2026-05-16T00:00:00.000Z",
      },
    ],
    format: "webp",
    generatedBytes: 82000,
    storageProvider: "supabase",
    preparedAt: "2026-05-16T00:00:00.000Z",
    preparedBy: "admin@example.com",
  },
} satisfies GeneratedBackyOpenApiMediaAsset;

const genericFileMediaAsset = {
  id: "media_export_zip",
  type: "other",
  url: "/media/export.zip",
  visibility: "public",
} satisfies GeneratedBackyOpenApiMediaAsset;

const sdkGenericFileMediaAsset = {
  id: "media_export_zip",
  type: "other",
  url: "/media/export.zip",
} satisfies BackyMediaAsset;

const sdkGenericFileMediaListOptions = {
  type: "file",
  search: "brand system",
  tag: "brand",
  folderId: "folder_brand",
  scope: "global",
  global: true,
  siteId: "site_demo",
  limit: 20,
} satisfies BackyMediaListOptions;

const mediaFolder = {
  id: "folder_brand",
  siteId: "site_demo",
  parentId: null,
  name: "Brand",
  sortOrder: 10,
  createdAt: "2026-05-16T00:00:00.000Z",
  path: "Brand",
  depth: 0,
  childIds: [],
  directAssetCount: 1,
  assetCount: 1,
} satisfies GeneratedBackyOpenApiMediaFolder;

const mediaFolderRoot = {
  id: null,
  name: "Root",
  path: "Root",
  depth: -1,
  childIds: ["folder_brand"],
  directAssetCount: 0,
  assetCount: 1,
} satisfies GeneratedBackyOpenApiMediaFolderRoot;

const mediaFolderListEnvelope = {
  success: true,
  requestId: "req_media_folders",
  data: {
    schemaVersion: "backy.media-folders.v1",
    folders: [mediaFolder],
    root: mediaFolderRoot,
    count: 1,
    publicAssetCount: 1,
  },
} satisfies GeneratedBackyOpenApiMediaFolderListEnvelope;

const sdkMediaFolder = {
  id: "folder_brand",
  siteId: "site_demo",
  parentId: null,
  name: "Brand",
  sortOrder: 10,
  createdAt: "2026-05-16T00:00:00.000Z",
  path: "Brand",
  depth: 0,
  childIds: [],
  directAssetCount: 1,
  assetCount: 1,
} satisfies BackyMediaFolder;

const sdkMediaFolderList = {
  schemaVersion: "backy.media-folders.v1",
  folders: [sdkMediaFolder],
  root: mediaFolderRoot,
  count: 1,
  publicAssetCount: 1,
} satisfies BackyMediaFolderList;

const mediaList = {
  success: true,
  requestId: "req_media",
  data: {
    media: [mediaAsset],
    pagination: {
      total: 1,
      limit: 20,
      offset: 0,
      hasMore: false,
    },
  },
} satisfies GeneratedBackyOpenApiMediaList;

const mediaDetailEnvelope = {
  success: true,
  requestId: "req_media_detail",
  data: {
    media: mediaAsset,
  },
} satisfies GeneratedBackyOpenApiMediaDetailEnvelope;

const fontVariant = {
  id: "font_inter_regular",
  mediaId: "media_font_inter",
  family: "Inter",
  weight: "400",
  style: "normal",
  display: "swap",
  fallbackStack: "system-ui, sans-serif",
  cssFamily: '"Inter", system-ui, sans-serif',
  url: "/media/fonts/inter.woff2",
  mimeType: "font/woff2",
  sizeBytes: 42000,
  originalName: "Inter-Regular.woff2",
  folderId: "folder_brand",
  tags: ["brand-font"],
} satisfies GeneratedBackyOpenApiFontVariant;

const fontManifestEnvelope = {
  success: true,
  requestId: "req_fonts",
  data: {
    schemaVersion: "backy.font-manifest.v1",
    siteId: "site_demo",
    families: [
      {
        family: "Inter",
        fallbackStack: "system-ui, sans-serif",
        display: "swap",
        cssFamily: '"Inter", system-ui, sans-serif',
        variants: [fontVariant],
        assetIds: ["media_font_inter"],
      },
    ],
    fonts: [fontVariant],
    css: '@font-face { font-family: "Inter"; src: url("/media/fonts/inter.woff2"); }',
    counts: {
      families: 1,
      variants: 1,
    },
  },
} satisfies GeneratedBackyOpenApiFontManifestEnvelope;

const comment = {
  id: "comment_1",
  siteId: "site_demo",
  targetType: "page",
  targetId: "page_home",
  commentThreadId: "thread_home",
  authorName: "Reader",
  authorEmail: "reader@example.com",
  authorWebsite: null,
  userId: null,
  content: "This page helped me understand the product.",
  status: "approved",
  parentId: null,
  reviewedBy: "admin@example.com",
  reviewedAt: "2026-05-16T00:01:00.000Z",
  rejectionReason: null,
  blockReason: null,
  blockedBy: null,
  blockedAt: null,
  reportCount: 0,
  reportReasons: [],
  requestId: "req_comment",
  createdAt: "2026-05-16T00:00:00.000Z",
  updatedAt: "2026-05-16T00:01:00.000Z",
} satisfies GeneratedBackyOpenApiComment;

const commentSubmitRequest = {
  content: "This page helped me understand the product.",
  authorName: "Reader",
  authorEmail: "reader@example.com",
  parentId: "comment_parent",
  commentThreadId: "thread_home",
  requestId: "req_comment",
  moderationMode: "manual",
} satisfies GeneratedBackyOpenApiCommentSubmitRequest;

const commentUpdateRequest = {
  status: "approved",
  moderationNote: "Looks useful.",
  requestId: "req_comment_review",
} satisfies GeneratedBackyOpenApiCommentUpdateRequest;

const commentBulkUpdateRequest = {
  commentIds: ["comment_1"],
  status: "approved",
  reviewedBy: "admin@example.com",
  requestId: "req_comment_bulk",
} satisfies GeneratedBackyOpenApiCommentBulkUpdateRequest;

const commentBlocklistEntry = {
  id: "block_1",
  siteId: "site_demo",
  type: "email",
  value: "spam@example.com",
  reason: "Repeated spam submissions.",
  actor: "admin@example.com",
  requestId: "req_block",
  createdAt: "2026-05-16T00:00:00.000Z",
} satisfies GeneratedBackyOpenApiCommentBlocklistEntry;

const commentsEnvelope = {
  success: true,
  requestId: "req_comments",
  data: {
    comments: [comment],
    count: 1,
    pagination: {
      total: 1,
      limit: 20,
      offset: 0,
      hasMore: false,
    },
  },
} satisfies GeneratedBackyOpenApiCommentsEnvelope;

const commentEnvelope = {
  success: true,
  requestId: "req_comment",
  data: {
    comment,
  },
} satisfies GeneratedBackyOpenApiCommentEnvelope;

const commentBulkUpdateEnvelope = {
  success: true,
  requestId: "req_comment_bulk",
  data: {
    updated: [comment],
  },
} satisfies GeneratedBackyOpenApiCommentBulkUpdateEnvelope;

const commentBlocklistEnvelope = {
  success: true,
  requestId: "req_blocklist",
  data: {
    siteId: "site_demo",
    blocklist: [commentBlocklistEntry],
    count: 1,
    pagination: {
      total: 1,
      limit: 20,
      offset: 0,
      hasMore: false,
    },
  },
} satisfies GeneratedBackyOpenApiCommentBlocklistEnvelope;

const commentBlocklistDeleteRequest = {
  ids: ["block_1"],
  blocklistIds: ["block_1"],
} satisfies GeneratedBackyOpenApiCommentBlocklistDeleteRequest;

const commentBlocklistDeleteEnvelope = {
  success: true,
  requestId: "req_blocklist_delete",
  data: {
    siteId: "site_demo",
    deleted: [commentBlocklistEntry],
    deletedCount: 1,
    missingIds: [],
  },
} satisfies GeneratedBackyOpenApiCommentBlocklistDeleteEnvelope;

const commentReportReasonsEnvelope = {
  success: true,
  requestId: "req_comment_reasons",
  data: {
    reasons: ["spam", "harassment"],
  },
} satisfies GeneratedBackyOpenApiCommentReportReasonsEnvelope;

const commentReportEnvelope = {
  success: true,
  requestId: "req_comment_report",
  data: {
    comment,
    report: {
      reason: "spam",
      reporterEmail: "reader@example.com",
    },
  },
} satisfies GeneratedBackyOpenApiCommentReportEnvelope;

const eventsEnvelope = {
  success: true,
  requestId: "req_events",
  data: {
    siteId: "site_demo",
    events: [
      {
        id: "event_1",
        kind: "interactive-runtime",
        requestId: "req_interactive_runtime",
        componentKey: "backy.custom.sandboxed",
        message: "Sandbox runtime failed to initialize.",
        createdAt: "2026-05-16T00:00:00.000Z",
      },
    ],
    count: 1,
    pagination: {
      total: 1,
      limit: 20,
      offset: 0,
      hasMore: false,
    },
  },
} satisfies GeneratedBackyOpenApiEventsEnvelope;

const runtimeEventRecordEnvelope = {
  success: true,
  requestId: "req_runtime_event_record",
  data: {
    recorded: true,
    siteId: "site_demo",
    componentKey: "backy.custom.sandboxed",
    version: "1.0.0",
  },
} satisfies GeneratedBackyOpenApiRuntimeEventRecordEnvelope;

const commerceProductDesign = {
  templateId: "template_product_detail",
  templateName: "Product detail",
  routePattern: "/products/:slug",
  source: {
    type: "frontend-design-template",
  },
  chrome: {},
  tokens: {},
  customCss: ".product-hero { display: grid; }",
  bindingHints: [
    {
      field: "title",
      target: "hero.title",
    },
  ],
} satisfies GeneratedBackyOpenApiCommerceProductDesign;

const commerceProduct = {
  id: "product_starter",
  slug: "starter-template",
  status: "published",
  title: "Starter template",
  sku: "STARTER-001",
  description: "A launch-ready starter template.",
  seoTitle: "Starter template",
  price: 4900,
  compareAtPrice: null,
  currency: "USD",
  imageUrl: "/media/product.webp",
  galleryImages: ["/media/product-gallery.webp"],
  variants: [
    {
      id: "variant_standard",
      title: "Standard",
      sku: "STARTER-001-STANDARD",
      option: "Standard",
      price: 4900,
      inventory: 20,
      inStock: true,
    },
  ],
  category: "Templates",
  tags: ["starter", "template"],
  vendor: "Backy",
  featured: true,
  productType: "digital",
  inventory: {
    tracked: true,
    quantity: 20,
  },
  delivery: {
    type: "download",
  },
  checkout: {
    enabled: true,
  },
  subscription: {
    enabled: false,
    interval: "monthly",
    trialDays: 0,
  },
  links: {
    product: "/products/starter-template",
  },
  design: commerceProductDesign,
  updatedAt: "2026-05-16T00:00:00.000Z",
  publishedAt: "2026-05-16T00:00:00.000Z",
} satisfies GeneratedBackyOpenApiCommerceProduct;

const commerceCatalogEnvelope = {
  success: true,
  requestId: "req_catalog",
  data: {
    schemaVersion: "backy.commerce-catalog.v1",
    collection: {
      id: "collection_products",
      slug: "products",
    },
    products: [commerceProduct],
    commerce: commerceStorefrontContract,
    facets: {
      categories: ["Templates"],
    },
    filters: {
      featured: true,
    },
    readiness: {
      checkout: true,
    },
    pagination: {
      total: 1,
      limit: 20,
      offset: 0,
      hasMore: false,
    },
  },
} satisfies GeneratedBackyOpenApiCommerceCatalogEnvelope;

const commerceOrderCreateRequest = {
  customerName: "Jane Customer",
  customerEmail: "jane@example.com",
  customerPhone: "+15555550100",
  lineItems: [
    {
      productSlug: "starter-template",
      variant_sku: "STARTER-001-STANDARD",
      qty: 1,
    },
  ],
  promoCode: "LAUNCH",
  payment: {
    provider: "stripe",
    reference: "stripe:cs_demo",
  },
  checkoutSession: {
    id: "cs_demo",
  },
} satisfies GeneratedBackyOpenApiCommerceOrderCreateRequest;

const commerceOrderContractEnvelope = {
  success: true,
  requestId: "req_order_contract",
  data: {
    schemaVersion: "backy.commerce-orders.v1",
    accepts: {
      customer: true,
      items: true,
    },
    creates: {
      order: true,
      privateCustomer: true,
    },
    inventoryReservation: {
      enabled: true,
    },
    pricing: {
      tax: true,
      shipping: true,
      discounts: true,
    },
    relatedEndpoints: {
      catalog: "/api/sites/site_demo/commerce/catalog",
    },
    commerce: commerceStorefrontContract,
  },
} satisfies GeneratedBackyOpenApiCommerceOrderContractEnvelope;

const commerceOrderEnvelope = {
  success: true,
  requestId: "req_order",
  data: {
    schemaVersion: "backy.commerce-orders.v1",
    order: {
      id: "order_1",
      orderNumber: "BCK-1001",
      paymentStatus: "pending",
    },
    checkoutSession: {
      id: "checkout_1",
      provider: "stripe",
      providerMode: "test",
      accountId: null,
      status: "provider_created",
      handoffMode: "provider",
      url: "https://checkout.stripe.test/session",
      successUrl: "https://example.com/success",
      cancelUrl: "https://example.com/cancel",
      expiresAt: "2026-05-17T00:00:00.000Z",
      reference: "order_1",
      amountTotal: 4900,
      currency: "USD",
      metadata: {
        siteId: "site_demo",
      },
      providerPayload: null,
    },
    quote: {
      subtotal: 4900,
      total: 4900,
      currency: "USD",
    },
    lineItems: [
      {
        productId: "product_starter",
        quantity: 1,
      },
    ],
  },
} satisfies GeneratedBackyOpenApiCommerceOrderEnvelope;

const commerceWebhookRequest = {
  id: "evt_checkout_completed",
  type: "checkout.session.completed",
  data: {
    object: {
      id: "checkout_1",
      metadata: {
        orderId: "order_1",
      },
    },
  },
  metadata: {
    provider: "stripe",
  },
} satisfies GeneratedBackyOpenApiCommerceWebhookRequest;

const commerceWebhookEnvelope = {
  success: true,
  requestId: "req_webhook",
  data: {
    schemaVersion: "backy.commerce-webhook.v1",
    event: {
      id: "evt_checkout_completed",
      type: "checkout.session.completed",
    },
    order: {
      id: "order_1",
      paymentStatus: "paid",
    },
  },
} satisfies GeneratedBackyOpenApiCommerceWebhookEnvelope;

const siteWebhookPayload = {
  schemaVersion: "backy.site-webhook.v1",
  kind: "site-updated",
  siteId: "site_demo",
  site: {
    id: "site_demo",
    name: "Demo Site",
    slug: "demo",
    status: "published",
    customDomain: null,
  },
  requestId: "req_site_webhook",
  reason: "page.published",
  actor: "user_admin",
  data: {
    resourceType: "page",
    before: {
      id: "page_home",
      status: "draft",
    },
    after: {
      id: "page_home",
      status: "published",
    },
  },
} satisfies GeneratedBackyOpenApiSiteWebhookPayload;

const openApiContentAssetRef = {
  id: "media_hero",
  type: "image",
  url: "/media/hero.webp",
  alt: "Hero image",
  title: "Homepage hero",
  visibility: "public",
  metadata: {
    source: "media-library",
  },
} satisfies GeneratedBackyOpenApiBackyContentAssetRef;

const openApiElementAction = {
  id: "section-link",
  type: "link",
  label: "Read docs",
  href: "/docs",
  method: "GET",
  openIn: "self",
  requiresAuth: false,
} satisfies GeneratedBackyOpenApiBackyElementAction;

const openApiDataBindingSource = {
  kind: "collection",
  collectionId: "collection_docs",
  field: "title",
  recordId: "record_getting_started",
} satisfies GeneratedBackyOpenApiBackyDataBindingSource;

const openApiDataBinding = {
  id: "section-title-binding",
  elementId: "section-title",
  targetPath: "props.text",
  source: openApiDataBindingSource,
  mode: "text",
  fallback: "Docs",
} satisfies GeneratedBackyOpenApiBackyDataBinding;

const openApiEditableMapEntry = {
  elementId: "section-title",
  field: "props.text",
  editable: true,
  permission: "content.edit",
  label: "Heading",
  valueType: "string",
  scope: "element",
} satisfies GeneratedBackyOpenApiBackyEditableMapEntry;

const openApiContentElementAccessibility = {
  label: "Documentation heading",
  role: "heading",
  aria: {
    level: 1,
  },
} satisfies GeneratedBackyOpenApiBackyContentElementAccessibility;

const openApiContentElement = {
  id: "section-title",
  type: "heading",
  children: [],
  props: {
    text: "Docs",
  },
  actions: [openApiElementAction],
  dataBindings: [openApiDataBinding],
  accessibility: openApiContentElementAccessibility,
  assetIds: [openApiContentAssetRef.id],
} satisfies GeneratedBackyOpenApiBackyContentElement;

const openApiContentDocument = {
  schemaVersion: "backy.content.v1",
  id: "section_docs_header",
  kind: "template",
  title: "Docs Header",
  version: "1.0.0",
  elements: [openApiContentElement],
  assets: {
    media: [openApiContentAssetRef],
  },
  editableMap: {
    "section-title.text": openApiEditableMapEntry,
  },
} satisfies GeneratedBackyOpenApiBackyContentDocument;

const reusableSectionContent = {
  elements: [openApiContentElement],
  canvasSize: {
    width: 1200,
    height: 480,
  },
  customCSS: ".docs-header { color: var(--backy-color-text); }",
  contentDocument: openApiContentDocument,
} satisfies GeneratedBackyOpenApiBackyReusableSectionContent;

const reusableSection = {
  id: "section_docs_header",
  siteId: "site_demo",
  name: "Docs header",
  slug: "docs-header",
  category: "hero",
  status: "active",
  tags: ["docs"],
  content: reusableSectionContent,
} satisfies GeneratedBackyOpenApiReusableSection;

const pageResource = {
  id: "page_docs",
  siteId: "site_demo",
  title: "Docs",
  slug: "docs",
  status: "published",
  frontendDesign: {
    templateId: "template_docs_page",
    templateName: "Docs page",
    routePattern: "/docs",
  },
  content: openApiContentDocument,
} satisfies GeneratedBackyOpenApiPageResource;

const pageSeoMetadata = {
  title: "Docs",
  description: "Backy documentation.",
  path: "/docs",
  canonical: "/docs",
  canonicalUrl: "https://example.com/docs",
  robots: {
    index: true,
    follow: true,
  },
  openGraph: {
    title: "Docs",
    description: "Backy documentation.",
    image: "/media/hero.webp",
  },
  keywords: ["backy", "docs"],
  jsonLd: [
    {
      "@type": "WebPage",
      name: "Docs",
    },
  ],
} satisfies GeneratedBackyOpenApiPageSeoMetadata;

const pageListEnvelope = {
  success: true,
  requestId: "req_pages",
  data: {
    pages: [{ ...pageResource, seo: pageSeoMetadata }],
    pagination: {
      total: 1,
      limit: 20,
      offset: 0,
      hasMore: false,
    },
  },
} satisfies GeneratedBackyOpenApiPageListEnvelope;

const pageEnvelope = {
  success: true,
  requestId: "req_page",
  data: {
    page: { ...pageResource, seo: pageSeoMetadata },
  },
} satisfies GeneratedBackyOpenApiPageEnvelope;

const navigationEnvelope = {
  success: true,
  requestId: "req_navigation",
  data: {
    site: {
      id: "site_demo",
      slug: "demo",
    },
    navigation: {
      primary: [
        {
          label: "Docs",
          href: "/docs",
        },
      ],
    },
  },
} satisfies GeneratedBackyOpenApiNavigationEnvelope;

const seoRoute = {
  type: "page",
  id: "page_docs",
  title: "Docs",
  description: "Backy documentation.",
  path: "/docs",
  canonical: "/docs",
  canonicalUrl: "https://example.com/docs",
  status: "published",
  updatedAt: "2026-05-16T00:00:00.000Z",
  priority: 0.8,
  changeFrequency: "weekly",
  robots: {
    index: true,
    follow: true,
  },
  openGraph: {
    title: "Docs",
    description: "Backy documentation.",
    image: "/media/hero.webp",
  },
  keywords: ["backy", "docs"],
  jsonLd: [],
  frontendDesign: pageResource.frontendDesign,
} satisfies GeneratedBackyOpenApiSeoRoute;

const seoDiscoveryEnvelope = {
  success: true,
  requestId: "req_seo",
  data: {
    site: {
      id: "site_demo",
      slug: "demo",
    },
    defaults: {
      title: "Demo",
      description: "Demo site",
      robots: {
        index: true,
        follow: true,
      },
    },
    routes: [seoRoute],
    sitemap: {
      endpoint: "/sitemap.xml",
    },
    robots: {
      endpoint: "/robots.txt",
    },
  },
} satisfies GeneratedBackyOpenApiSeoDiscoveryEnvelope;

const blogPostResource = {
  id: "post_intro",
  siteId: "site_demo",
  title: "Intro",
  slug: "intro",
  excerpt: "Welcome to Backy.",
  status: "published",
  authorId: "author_admin",
  categoryIds: ["category_updates"],
  tagIds: ["tag_launch"],
  content: openApiContentDocument,
  publishedAt: "2026-05-16T00:00:00.000Z",
} satisfies GeneratedBackyOpenApiBlogPostResource;

const blogFeedDiscovery = {
  id: "main",
  title: "Demo feed",
  format: "rss",
  version: "2.0",
  contentType: "application/rss+xml",
  endpoint: "/api/sites/site_demo/blog/feed.xml",
  hostedPath: "/blog/feed.xml",
  schemaVersion: "backy.blog-feed.v1",
  scope: "site",
  visibility: "public",
  cache: {
    scope: "site",
    etag: true,
    revisionHeader: "x-backy-cache-revision",
  },
  limits: {
    queryParam: "limit",
    default: 20,
    min: 1,
    max: 100,
  },
} satisfies GeneratedBackyOpenApiBlogFeedDiscovery;

const blogPostListEnvelope = {
  success: true,
  requestId: "req_blog_posts",
  data: {
    posts: [blogPostResource],
    pagination: {
      total: 1,
      limit: 20,
      offset: 0,
      hasMore: false,
    },
  },
} satisfies GeneratedBackyOpenApiBlogPostListEnvelope;

const blogPostEnvelope = {
  success: true,
  requestId: "req_blog_post",
  data: {
    post: blogPostResource,
  },
} satisfies GeneratedBackyOpenApiBlogPostEnvelope;

const blogCategoryResource = {
  id: "category_updates",
  siteId: "site_demo",
  name: "Updates",
  slug: "updates",
  description: "Product updates.",
  color: "#2563eb",
  sortOrder: 10,
  postCount: 1,
} satisfies GeneratedBackyOpenApiBlogCategoryResource;

const blogCategoryListEnvelope = {
  success: true,
  requestId: "req_blog_categories",
  data: {
    categories: [blogCategoryResource],
  },
} satisfies GeneratedBackyOpenApiBlogCategoryListEnvelope;

const blogTagResource = {
  id: "tag_launch",
  siteId: "site_demo",
  name: "Launch",
  slug: "launch",
  description: "Launch posts.",
  postCount: 1,
} satisfies GeneratedBackyOpenApiBlogTagResource;

const blogTagListEnvelope = {
  success: true,
  requestId: "req_blog_tags",
  data: {
    tags: [blogTagResource],
  },
} satisfies GeneratedBackyOpenApiBlogTagListEnvelope;

const blogAuthorResource = {
  id: "author_admin",
  siteId: "site_demo",
  name: "Admin",
  slug: "admin",
  role: "owner",
  status: "active",
  avatarUrl: "/media/avatar.webp",
  postCount: 1,
} satisfies GeneratedBackyOpenApiBlogAuthorResource;

const blogAuthorListEnvelope = {
  success: true,
  requestId: "req_blog_authors",
  data: {
    authors: [blogAuthorResource],
  },
} satisfies GeneratedBackyOpenApiBlogAuthorListEnvelope;

const frontendDesignTemplate = {
  id: "template_docs_page",
  type: "page",
  name: "Docs page",
  routePattern: "/docs",
  description: "Documentation landing page.",
  canvasSize: {
    width: 1440,
    height: 1200,
  },
  content: {
    documentId: "page_docs",
  },
  bindingHints: [
    {
      collectionId: "collection_docs",
      field: "title",
    },
  ],
} satisfies GeneratedBackyOpenApiFrontendDesignTemplate;

const frontendEditableMapEntry = {
  selector: '[data-backy-id="section-title"]',
  elementId: "section-title",
  role: "heading",
  binding: "props.text",
  fields: ["text", "color"],
} satisfies GeneratedBackyOpenApiFrontendEditableMapEntry;

const frontendDesignContract = {
  schemaVersion: "backy.frontend-design.v1",
  status: "synced",
  source: {
    type: "captured",
  },
  tokens: {
    colorPrimary: "#2563eb",
  },
  chrome: {
    header: true,
  },
  templates: [frontendDesignTemplate],
  editableMap: [frontendEditableMapEntry],
  notes: "Generated contract fixture.",
  updatedAt: "2026-05-16T00:00:00.000Z",
} satisfies GeneratedBackyOpenApiFrontendDesignContract;

const frontendDesignEnvelope = {
  success: true,
  requestId: "req_frontend_design",
  data: {
    schemaVersion: "backy.frontend-design-response.v1",
    site: {
      id: "site_demo",
    },
    frontendDesign: frontendDesignContract,
    capabilities: {
      hasContract: true,
      templateCount: 1,
      editableBindingCount: 1,
      chrome: true,
      tokens: true,
    },
    endpoints: {
      manifest: "/api/sites/site_demo/manifest",
    },
  },
} satisfies GeneratedBackyOpenApiFrontendDesignEnvelope;

const interactiveRegistryEntry = {
  componentKey: "backy.custom.sandboxed",
  displayName: "Sandboxed custom component",
  type: "codeComponent",
  status: "active",
  version: "1.0.0",
  renderMode: "sandbox-iframe",
  source: "custom",
  description:
    "Versioned custom component bundle mounted in a constrained iframe.",
  allowedDataScopes: ["collections", "page"],
  requiredFields: ["componentKey", "version", "fallback", "runtime.sandboxUrl"],
  controls: [
    {
      key: "speed",
      label: "Speed",
      type: "select",
      options: ["slow", "normal", "fast"],
      defaultValue: "normal",
    },
  ],
  fallback: {
    required: true,
    supported: ["title", "text", "html", "imageUrl", "alt", "ariaLabel"],
  },
  security: {
    adminApiAccess: false,
    parentDomAccess: false,
    parentCookieAccess: false,
    secretsInPayload: false,
    communication: "postMessage-only",
  },
  integrity: {
    signed: true,
    signatureRequiredForCustomCode: true,
  },
  runtime: {
    sandboxUrl:
      "/api/sites/site_demo/interactive-components/backy.custom.sandboxed/1.0.0/sandbox",
    bundleUrl: null,
    iframeSandbox: "allow-scripts allow-forms",
    allowedPermissions: [],
    postMessageProtocol: "backy.interactive-component.v1",
  },
  dependencyPolicy: {
    preset: "signed-sandbox",
    allowedPackagePatterns: ["@backy/*", "three", "d3-*"],
    blockedBuiltins: ["fs", "process", "child_process"],
    lifecycleScripts: false,
    remoteRuntimeUrls: false,
  },
  compatibility: {
    backyRuntime: ">=1.0.0",
    renderTargets: ["sandbox-iframe", "static-fallback"],
    animationLibraries: ["canvas", "three", "d3"],
    browserSupport: ["modern evergreen browsers with iframe sandbox support"],
    reducedMotion: "required",
  },
  dataBindingPresets: [
    {
      id: "custom-records",
      label: "Collection payload",
      scope: "collections",
      targetPath: "props.data",
      mode: "list",
    },
  ],
} satisfies GeneratedBackyOpenApiInteractiveComponentRegistryEntry;

const interactiveRegistryEnvelope = {
  success: true,
  requestId: "req_interactive_registry",
  data: {
    schemaVersion: "backy.interactive-component-registry.v1",
    siteId: "site_demo",
    generatedAt: new Date().toISOString(),
    contract: {
      schemaVersion: "backy.interactive-components.v1",
      elementTypes: ["interactiveFigure", "codeComponent"],
      capabilities: {
        trustedRegistry: true,
        customCodeSandbox: true,
        signedBundles: true,
        staticFallbacks: true,
        versionedBundles: true,
        dataBindings: true,
      },
      registry: {
        provider: "local",
        configured: true,
        endpoint: null,
        bundleBaseUrl: null,
        signedBundles: true,
        reviewRequired: true,
      },
      sandbox: {
        enabled: true,
        origin: null,
        cspConfigured: true,
        iframeSandbox: "allow-scripts allow-forms",
        allowedConnectSrc: "'self'",
        requiresDedicatedOrigin: true,
        responseHeaders: {
          contentSecurityPolicy: [
            "default-src 'none'",
            "script-src 'unsafe-inline'",
            "style-src 'unsafe-inline'",
            "img-src data: https: http:",
            "media-src data: blob:",
            "connect-src 'self'",
            "font-src 'none'",
            "object-src 'none'",
            "frame-src 'none'",
            "worker-src 'none'",
            "manifest-src 'none'",
            "frame-ancestors 'self'",
            "base-uri 'none'",
            "form-action 'none'",
          ],
          permissionsPolicy: [
            "camera=()",
            "microphone=()",
            "geolocation=()",
            "payment=()",
            "usb=()",
            "serial=()",
          ],
          referrerPolicy: "no-referrer",
          contentTypeOptions: "nosniff",
        },
      },
      renderContract: {
        fields: ["componentKey", "version", "props", "fallback"],
        hydrationModes: [
          "trusted-component",
          "sandbox-iframe",
          "static-fallback",
        ],
        postMessageProtocol: "backy.interactive-component.v1",
        fallbackRequired: true,
        unknownComponentBehavior: "render-static-fallback",
      },
      dataBindingScopes: [
        "collections",
        "media",
        "forms",
        "commerce",
        "page",
        "blog",
      ],
      security: interactiveRegistryEntry.security,
    },
    components: [interactiveRegistryEntry],
    pagination: {
      total: 1,
      limit: 1,
      offset: 0,
      hasMore: false,
    },
  },
} satisfies GeneratedBackyOpenApiInteractiveComponentRegistryEnvelope;

const interactiveRuntimeEvent = {
  type: "error",
  componentKey: "backy.custom.sandboxed",
  version: "1.0.0",
  elementId: "hero-animation",
  message: "Sandbox runtime failed to initialize.",
} satisfies GeneratedBackyOpenApiInteractiveRuntimeEventRequest;

// @ts-expect-error schemaVersion is required by generated theme-token types.
const invalidTheme = { colors: {}, typography: {}, spacing: {}, radii: {}, shadows: {}, breakpoints: {}, } satisfies GeneratedBackyThemeTokens;

// @ts-expect-error generated action types only allow documented action names.
const invalidAction = { id: "bad-action", type: "evalScript", } satisfies GeneratedBackyElementAction;

// @ts-expect-error generated render payloads require the Backy content schema version.
const invalidRenderPayload = { ...renderPayload, content: { id: "page_home", kind: "page", elements: [] }, } satisfies GeneratedBackyPublicRenderPayload;

// @ts-expect-error generated content statuses are limited to public lifecycle states.
const invalidContentStatus = "deleted" satisfies GeneratedBackyContentStatus;

// @ts-expect-error generated data-binding datasets require a collection id.
const invalidDataBindingDataset = { ...dataBindingDataset, collectionId: undefined, } satisfies GeneratedBackyDataBindingDataset;

// @ts-expect-error generated binding slots require a target path.
const invalidBindingSlot = { ...bindingSlot, targetPath: undefined, } satisfies GeneratedBackyPublicRenderPayloadBindingSlot;

// @ts-expect-error render media assets only expose documented media types.
const invalidRenderMediaAssetType = { ...renderMediaAsset, type: "spreadsheet", } satisfies GeneratedBackyRenderMediaAsset;

// @ts-expect-error generated OpenAPI media assets only expose documented media types.
const invalidOpenApiMediaAssetType = { ...mediaAsset, type: "spreadsheet", } satisfies GeneratedBackyOpenApiMediaAsset;

// @ts-expect-error SDK media list filters only expose documented media types.
const invalidSdkMediaListOptionType = { type: "spreadsheet", } satisfies BackyMediaListOptions;

// @ts-expect-error render navigation item targets are limited to same-tab or new-tab.
const invalidRenderNavigationTarget = { ...renderNavigationItem, target: "_parent", } satisfies GeneratedBackyRenderNavigationItem;

// @ts-expect-error frontend design contracts use the versioned schema marker.
const invalidGeneratedFrontendDesignContract = { ...renderFrontendDesignContract, schemaVersion: "backy.frontend-design.v0", } satisfies GeneratedBackyFrontendDesignContract;

// @ts-expect-error generated manifest locale strategy is limited to documented routing modes.
const invalidManifestLocaleStrategy = { ...manifest, delivery: { ...manifest.delivery, localeStrategy: "query-param" }, } satisfies GeneratedBackyFrontendManifest;

// @ts-expect-error generated manifest comment moderation modes are documented public values.
const invalidGeneratedManifestCommentPolicy = { ...manifest, site: { ...manifest.site, commentPolicy: { ...manifest.site.commentPolicy, moderationMode: "ai-review", }, }, } satisfies GeneratedBackyFrontendManifest;

// @ts-expect-error generated manifest comment discovery uses a versioned schema marker.
const invalidGeneratedManifestCommentsDiscovery = { ...manifest, modules: { ...manifest.modules, comments: { ...manifest.modules.comments, schemaVersion: "backy.comments-discovery.v0", }, }, } satisfies GeneratedBackyFrontendManifest;

const invalidGeneratedManifestSchemas = {
  ...manifest,
  contract: {
    ...manifest.contract,
    schemas: {
      ...manifest.contract.schemas,
      // @ts-expect-error generated manifest schema references are URL/string references.
      manifest: 123,
    },
  },
} satisfies GeneratedBackyFrontendManifest;

const invalidGeneratedManifestDatabaseCertification = {
  ...manifest,
  contract: {
    ...manifest.contract,
    databaseCertification: {
      ...manifest.contract.databaseCertification,
      gate: {
        ...manifest.contract.databaseCertification.gate,
        // @ts-expect-error generated manifest database certification points at the SDK Postgres smoke gate.
        command: "npm run ci:local-only-sdk-smoke",
      },
    },
  },
} satisfies GeneratedBackyFrontendManifest;

const invalidGeneratedManifestCapability = {
  ...manifest,
  capabilities: {
    ...manifest.capabilities,
    // @ts-expect-error generated manifest capabilities are boolean feature flags.
    commerceCatalog: "yes",
  },
} satisfies GeneratedBackyFrontendManifest;

const invalidGeneratedManifestEndpoint = {
  ...manifest,
  endpoints: {
    ...manifest.endpoints,
    // @ts-expect-error generated manifest endpoints are non-empty strings.
    mediaFonts: 123,
  },
} satisfies GeneratedBackyFrontendManifest;

const invalidGeneratedManifestNavigationItem = {
  ...manifest.navigation.primary[0],
  // @ts-expect-error generated manifest navigation targets are limited to same-tab or new-tab.
  target: "_parent",
} satisfies GeneratedBackyFrontendManifest["navigation"]["primary"][number];

const invalidGeneratedManifestNavigationLayout = {
  ...manifest.navigation,
  layout: {
    ...manifest.navigation.layout,
    header: {
      ...manifest.navigation.layout.header,
      // @ts-expect-error generated manifest header variants are limited to documented layouts.
      variant: "overlay",
    },
  },
} satisfies GeneratedBackyFrontendManifest["navigation"];

// @ts-expect-error SDK manifest delivery convenience types use the same documented routing modes.
const invalidSdkLocaleStrategy = "query-param" satisfies BackyLocaleStrategy;

// @ts-expect-error SDK route patterns require render URLs for frontend hydration.
const invalidSdkRoutePattern = { ...sdkRoutePattern, renderUrl: undefined, } satisfies BackyManifestRoutePattern;

// @ts-expect-error manifest route frontend-design metadata requires a template id.
const invalidSdkRouteFrontendDesign = { ...sdkRouteFrontendDesign, templateId: undefined, } satisfies BackyManifestRouteFrontendDesign;

// @ts-expect-error manifest page entries require a hosted/render path for frontend routing.
const invalidSdkManifestPage = { ...sdkManifestPage, path: undefined, } satisfies BackyManifestPageResource;

// @ts-expect-error manifest pages runtime modules require preview privacy metadata.
const invalidSdkManifestPagesRuntime = { ...sdkManifestPagesRuntime, privacy: undefined, } satisfies BackyManifestPagesRuntimeModule;

const invalidGeneratedManifestPagesRuntimeDiscovery = {
  ...manifest.modules.pagesRuntime,
  // @ts-expect-error generated manifest pages discovery uses a versioned schema marker.
  schemaVersion: "backy.pages-discovery.v0",
} satisfies GeneratedBackyFrontendManifest["modules"]["pagesRuntime"];

// @ts-expect-error manifest blog entries require a render URL for frontend hydration.
const invalidSdkManifestPost = { ...sdkManifestPost, renderUrl: undefined, } satisfies BackyManifestPostResource;

// @ts-expect-error generated manifest category summaries require post counts for archive UIs.
const invalidGeneratedManifestBlogCategory = { ...manifest.modules.blog.categories[0], postCount: undefined, } satisfies GeneratedBackyFrontendManifest["modules"]["blog"]["categories"][number];

// @ts-expect-error SDK manifest category summaries require post counts for archive UIs.
const invalidSdkManifestBlogCategory = { ...sdkManifestBlogCategory, postCount: undefined, } satisfies BackyManifestBlogCategory;

// @ts-expect-error SDK manifest tag summaries require post counts for archive UIs.
const invalidSdkManifestBlogTag = { ...sdkManifestBlogTag, postCount: undefined, } satisfies BackyManifestBlogTag;

// @ts-expect-error manifest blog modules include concrete category arrays.
const invalidSdkManifestBlog = { ...sdkManifestBlog, categories: undefined, } satisfies BackyManifestBlogModule;

const invalidGeneratedManifestBlogRuntimeDiscovery = {
  ...manifest.modules.blogRuntime,
  // @ts-expect-error generated manifest blog discovery uses a versioned schema marker.
  schemaVersion: "backy.blog-discovery.v0",
} satisfies GeneratedBackyFrontendManifest["modules"]["blogRuntime"];

// @ts-expect-error manifest blog runtime modules require preview privacy metadata.
const invalidSdkManifestBlogRuntime = { ...sdkManifestBlogRuntime, privacy: undefined, } satisfies BackyManifestBlogRuntimeModule;

// @ts-expect-error manifest reusable-section entries require detail URLs for lazy loading section content.
const invalidSdkManifestReusableSection = { ...sdkManifestReusableSection, detailUrl: undefined, } satisfies BackyManifestReusableSection;

// @ts-expect-error manifest reusable-section modules include a concrete item array.
const invalidSdkManifestReusableSections = { ...sdkManifestReusableSections, items: undefined, } satisfies BackyManifestReusableSectionsModule;

// @ts-expect-error manifest reusable-section runtime modules require cache policy metadata.
const invalidSdkManifestReusableSectionsRuntime = { ...sdkManifestReusableSectionsRuntime, cache: undefined, } satisfies BackyManifestReusableSectionsRuntimeModule;

// @ts-expect-error generated manifest reusable-section categories are string filter labels.
const invalidGeneratedReusableSectionCategory = { ...manifest.modules.reusableSections, categories: [123], } satisfies GeneratedBackyFrontendManifest["modules"]["reusableSections"];

const invalidGeneratedReusableSectionItem = {
  ...manifest.modules.reusableSections.items[0],
  // @ts-expect-error generated manifest reusable-section item tags are string labels.
  tags: [123],
} satisfies GeneratedBackyFrontendManifest["modules"]["reusableSections"]["items"][number];

const invalidGeneratedReusableSectionsRuntimeDiscovery = {
  ...manifest.modules.reusableSectionsRuntime,
  // @ts-expect-error generated manifest reusable-sections discovery uses a versioned schema marker.
  schemaVersion: "backy.reusable-sections-discovery.v0",
} satisfies GeneratedBackyFrontendManifest["modules"]["reusableSectionsRuntime"];

// @ts-expect-error generated manifest media types are string type labels.
const invalidGeneratedManifestMediaTypes = { ...manifest.modules.media, types: [123], } satisfies GeneratedBackyFrontendManifest["modules"]["media"];

// @ts-expect-error generated manifest media discovery uses a versioned schema marker.
const invalidGeneratedManifestMediaDiscovery = { ...manifest.modules.media, schemaVersion: "backy.media-discovery.v0", } satisfies GeneratedBackyFrontendManifest["modules"]["media"];

// @ts-expect-error generated manifest theme discovery uses a versioned schema marker.
const invalidGeneratedManifestThemeDiscovery = { ...manifest.modules.theme, schemaVersion: "backy.theme-discovery.v0", } satisfies GeneratedBackyFrontendManifest["modules"]["theme"];

// @ts-expect-error generated manifest live-management discovery uses a versioned schema marker.
const invalidGeneratedManifestLiveManagementDiscovery = { ...manifest.modules.liveManagement, schemaVersion: "backy.live-management.v0", } satisfies GeneratedBackyFrontendManifest["modules"]["liveManagement"];

// @ts-expect-error generated manifest forms discovery uses a versioned schema marker.
const invalidGeneratedManifestFormsRuntimeDiscovery = { ...manifest.modules.formsRuntime, schemaVersion: "backy.forms-discovery.v0", } satisfies GeneratedBackyFrontendManifest["modules"]["formsRuntime"];

// @ts-expect-error generated manifest commerce modes are limited to documented storefront modes.
const invalidGeneratedManifestCommerceMode = { ...manifest.modules.commerce, mode: "marketplace", } satisfies NonNullable<GeneratedBackyFrontendManifest["modules"]["commerce"]>;

const invalidGeneratedManifestCommerceCapabilities = {
  ...manifest.modules.commerce,
  capabilities: {
    ...manifest.modules.commerce.capabilities,
    // @ts-expect-error generated manifest commerce capability flags are booleans.
    providerCheckout: "yes",
  },
} satisfies NonNullable<GeneratedBackyFrontendManifest["modules"]["commerce"]>;

const invalidGeneratedManifestCommerceProviderCertification = {
  ...manifest.modules.commerce,
  // @ts-expect-error generated manifest commerce modules require a typed provider certification handoff for custom storefronts.
  providerCertification: undefined,
} satisfies NonNullable<GeneratedBackyFrontendManifest["modules"]["commerce"]>;

const invalidGeneratedManifestCommerceRuntimeDiscovery = {
  ...manifest.modules.commerceRuntime,
  // @ts-expect-error generated manifest commerce discovery uses a versioned schema marker.
  schemaVersion: "backy.commerce-discovery.v0",
} satisfies GeneratedBackyFrontendManifest["modules"]["commerceRuntime"];

// @ts-expect-error manifest commerce runtime modules require order privacy metadata.
const invalidSdkManifestCommerceRuntime = { ...sdkManifestCommerceRuntime, privacy: undefined, } satisfies BackyManifestCommerceRuntimeModule;

const invalidGeneratedInteractiveRegistry = {
  ...manifest.modules.interactiveComponents,
  registry: {
    ...manifest.modules.interactiveComponents.registry,
    // @ts-expect-error generated manifest interactive registry configured flag is boolean.
    configured: "yes",
  },
} satisfies NonNullable<
  GeneratedBackyFrontendManifest["modules"]["interactiveComponents"]
>;

const invalidGeneratedInteractiveSecurity = {
  ...manifest.modules.interactiveComponents,
  security: {
    ...manifest.modules.interactiveComponents.security,
    // @ts-expect-error generated manifest interactive security parent DOM access is a boolean boundary.
    parentDomAccess: "blocked",
  },
} satisfies NonNullable<
  GeneratedBackyFrontendManifest["modules"]["interactiveComponents"]
>;

const sdkInteractiveComponentsContract = manifest.modules
  .interactiveComponents satisfies BackyInteractiveComponentsContract;

const invalidSdkInteractiveSandboxHeaders = {
  ...sdkInteractiveComponentsContract,
  sandbox: {
    ...sdkInteractiveComponentsContract.sandbox,
    // @ts-expect-error SDK interactive contracts require sandbox response-header guarantees.
    responseHeaders: undefined,
  },
} satisfies BackyInteractiveComponentsContract;

const invalidGeneratedManifestCollectionField = {
  ...manifest.modules.collections[0],
  // @ts-expect-error generated manifest collection fields require stable field keys.
  fields: [{ ...manifest.modules.collections[0].fields[0], key: undefined }],
} satisfies GeneratedBackyFrontendManifest["modules"]["collections"][number];

const invalidGeneratedManifestCollectionPermissions = {
  ...manifest.modules.collections[0],
  permissions: {
    ...manifest.modules.collections[0].permissions,
    // @ts-expect-error generated manifest collection permissions are boolean capability flags.
    publicCreate: "yes",
  },
} satisfies GeneratedBackyFrontendManifest["modules"]["collections"][number];

const invalidGeneratedManifestCollectionsRuntimeDiscovery = {
  ...manifest.modules.collectionsRuntime,
  // @ts-expect-error generated manifest collections discovery uses a versioned schema marker.
  schemaVersion: "backy.collections-discovery.v0",
} satisfies GeneratedBackyFrontendManifest["modules"]["collectionsRuntime"];

const invalidGeneratedManifestFormField = {
  ...manifest.modules.forms[0],
  // @ts-expect-error generated manifest form fields require stable field keys.
  fields: [{ ...manifest.modules.forms[0].fields[0], key: undefined }],
} satisfies GeneratedBackyFrontendManifest["modules"]["forms"][number];

// @ts-expect-error generated manifest form endpoints remain URL strings.
const invalidGeneratedManifestFormDetailUrl = { ...manifest.modules.forms[0], detailUrl: null, } satisfies GeneratedBackyFrontendManifest["modules"]["forms"][number];

// @ts-expect-error manifest form entries require public submission URLs.
const invalidSdkManifestForm = { ...sdkManifestForm, submitUrl: undefined, } satisfies BackyManifestFormDefinition;

// @ts-expect-error manifest forms runtime modules require cache policy metadata.
const invalidSdkManifestFormsRuntime = { ...sdkManifestFormsRuntime, cache: undefined, } satisfies BackyManifestFormsRuntimeModule;

// @ts-expect-error manifest media modules require a media list URL for asset discovery.
const invalidSdkManifestMedia = { ...sdkManifestMedia, listUrl: undefined, } satisfies BackyManifestMediaModule;

// @ts-expect-error manifest theme modules require compiled CSS variable output.
const invalidSdkManifestTheme = { ...sdkManifestTheme, cssVariables: undefined, } satisfies BackyManifestThemeModule;

// @ts-expect-error manifest live-management modules require optimistic conflict guidance.
const invalidSdkManifestLiveManagement = { ...sdkManifestLiveManagement, updateBody: undefined, } satisfies BackyManifestLiveManagementModule;

// @ts-expect-error manifest collection entries require record URLs for custom frontend data loading.
const invalidSdkManifestCollection = { ...sdkManifestCollection, recordsUrl: undefined, } satisfies BackyManifestCollectionSchema;

// @ts-expect-error manifest collections runtime modules require public write-policy metadata.
const invalidSdkManifestCollectionsRuntime = { ...sdkManifestCollectionsRuntime, writePolicy: undefined, } satisfies BackyManifestCollectionsRuntimeModule;

const invalidSdkLocalizedRoutePatternGroup = {
  ...sdkLocalizedRoutePatternGroup,
  patterns: [
    // @ts-expect-error localized route variants require basePattern for reverse mapping to Backy route patterns.
    { ...sdkLocalizedRoutePatternGroup.patterns[0], basePattern: undefined },
  ],
} satisfies BackyManifestLocalizedRoutePatternGroup;

// @ts-expect-error redirect manifest rules use HTTP redirect statuses or Backy's 410 gone marker.
const invalidSdkRedirectRule = { ...sdkRedirectRule, statusCode: 303, } satisfies BackyManifestRedirectRule;

// @ts-expect-error routing modules only advertise known Backy route types.
const invalidSdkRoutingModule = { ...sdkRoutingModule, supportedRouteTypes: ["page", "asset"], } satisfies BackyManifestRoutingModule;

// @ts-expect-error generated OpenAPI operation ids are extracted from the live route source.
const invalidOpenApiOperationId = "runBackyAdminMutation" satisfies GeneratedBackyOpenApiOperationId;

// @ts-expect-error generated OpenAPI component names are extracted from the live route source.
const invalidOpenApiComponentName = "AdminOnlySecretEnvelope" satisfies GeneratedBackyOpenApiComponentName;

// @ts-expect-error generated OpenAPI component schemas require their documented fields.
const invalidOpenApiComponents = { ErrorEnvelope: {}, } satisfies GeneratedBackyOpenApiComponents;

// @ts-expect-error generated route resources require enough fields for custom frontend routers.
const invalidPageRouteResource = { id: "page_home", kind: "page", title: "Home", } satisfies GeneratedBackyOpenApiPageRouteResource;

// @ts-expect-error dynamic collection list routes must expose the records URL for data fetches.
const invalidDynamicListRouteResource = { ...dynamicListRouteResource, recordsUrl: undefined, } satisfies GeneratedBackyOpenApiDynamicListRouteResource;

// @ts-expect-error route resolve envelopes require a resolved route payload.
const invalidRouteResolveEnvelope = { ...routeResolveEnvelope, data: { site: routeResolveEnvelope.data.site }, } satisfies GeneratedBackyOpenApiRouteResolveEnvelope;

// @ts-expect-error gone route resolve envelopes must use the ROUTE_GONE error code.
const invalidGoneRouteResolveEnvelope = { ...goneRouteResolveEnvelope, error: { code: "NOT_FOUND", message: "Missing." }, } satisfies GeneratedBackyOpenApiGoneRouteResolveEnvelope;

// @ts-expect-error redirect routes only allow documented HTTP redirect status codes.
const invalidRedirectRouteStatusCode = { ...redirectRoute, resource: { ...redirectRoute.resource, statusCode: 410 }, } satisfies GeneratedBackyOpenApiRedirectRoute;

// @ts-expect-error navigation discovery envelopes must include the rendered navigation payload.
const invalidNavigationEnvelope = { ...navigationEnvelope, data: { site: navigationEnvelope.data.site }, } satisfies GeneratedBackyOpenApiNavigationEnvelope;

// @ts-expect-error page SEO metadata requires robots directives for generated frontend crawlers.
const invalidPageSeoMetadata = { ...pageSeoMetadata, robots: undefined, } satisfies GeneratedBackyOpenApiPageSeoMetadata;

// @ts-expect-error page list envelopes require pagination for public page browsers.
const invalidPageListEnvelope = { ...pageListEnvelope, data: { pages: [pageResource] }, } satisfies GeneratedBackyOpenApiPageListEnvelope;

// @ts-expect-error SEO route change frequency is limited to documented sitemap values.
const invalidSeoRouteFrequency = { ...seoRoute, changeFrequency: "hourly", } satisfies GeneratedBackyOpenApiSeoRoute;

// @ts-expect-error blog feed discovery only advertises RSS feeds today.
const invalidBlogFeedFormat = { ...blogFeedDiscovery, format: "json", } satisfies GeneratedBackyOpenApiBlogFeedDiscovery;

// @ts-expect-error blog category resources require stable public slugs.
const invalidBlogCategorySlug = { ...blogCategoryResource, slug: undefined, } satisfies GeneratedBackyOpenApiBlogCategoryResource;

// @ts-expect-error collection fields must use documented field types.
const invalidCollectionFieldType = { ...collectionField, type: "markdown", } satisfies GeneratedBackyOpenApiCollectionFieldSchema;

// @ts-expect-error collection schemas require typed public permissions.
const invalidCollectionPermissions = { ...collectionSchema, permissions: { publicRead: true }, } satisfies GeneratedBackyOpenApiCollectionSchema;

// @ts-expect-error collection records require values for generated data binding.
const invalidCollectionRecordValues = { ...collectionRecord, values: undefined, } satisfies GeneratedBackyOpenApiCollectionRecord;

// @ts-expect-error public delete envelopes must confirm deletion and the deleted record id.
const invalidPublicDeleteEnvelope = { ...publicDeleteEnvelope, data: { recordId: "record_getting_started" }, } satisfies GeneratedBackyOpenApiPublicDeleteEnvelope;

// @ts-expect-error font manifests require the versioned font schema marker.
const invalidFontManifestSchemaVersion = { ...fontManifestEnvelope, data: { ...fontManifestEnvelope.data, schemaVersion: "backy.font-manifest.v0", }, } satisfies GeneratedBackyOpenApiFontManifestEnvelope;

// @ts-expect-error frontend design contract statuses are bounded by the published contract lifecycle.
const invalidFrontendDesignStatus = { ...frontendDesignContract, status: "draft", } satisfies GeneratedBackyOpenApiFrontendDesignContract;

// @ts-expect-error public form list envelopes require the total count.
const invalidFormListEnvelope = { ...formListEnvelope, data: { forms: [formDefinition], pagination: {} }, } satisfies GeneratedBackyOpenApiFormListEnvelope;

// @ts-expect-error public form definition envelopes require the versioned form schema marker.
const invalidFormDefinitionEnvelope = { ...formDefinitionEnvelope, data: { ...formDefinitionEnvelope.data, schemaVersion: "backy.form-definition.v0", }, } satisfies GeneratedBackyOpenApiFormDefinitionEnvelope;

// @ts-expect-error form fields must use documented public control types.
const invalidFormFieldType = { ...formField, type: "signature", } satisfies GeneratedBackyOpenApiFormFieldDefinition;

// @ts-expect-error public form definitions require the active flag and field list.
const invalidFormDefinition = { id: "form_contact", name: "Contact", } satisfies GeneratedBackyOpenApiFormDefinition;

// @ts-expect-error form submissions require typed submitted values.
const invalidFormSubmissionValues = { ...formSubmission, values: undefined, } satisfies GeneratedBackyOpenApiFormSubmission;

// @ts-expect-error validation details only allow documented validation codes.
const invalidFormSubmissionValidationDetail = { ...formSubmissionValidationDetail, code: "server_error", } satisfies GeneratedBackyOpenApiFormSubmissionValidationDetail;

// @ts-expect-error form submission review status is limited to the documented moderation states.
const invalidFormSubmissionStatus = { ...formSubmission, status: "escalated", } satisfies GeneratedBackyOpenApiFormSubmission;

// @ts-expect-error form contacts require typed lifecycle statuses for CRM-style views.
const invalidFormContactStatus = { ...formContact, status: "vip", } satisfies GeneratedBackyOpenApiFormContact;

// @ts-expect-error form contacts expose update timestamps for sync and cache invalidation.
const invalidFormContactUpdatedAt = { ...formContact, updatedAt: undefined, } satisfies GeneratedBackyOpenApiFormContact;

// @ts-expect-error media reference manifests require their schema version for generated frontend cache keys.
const invalidMediaReferences = { ...mediaReferences, schemaVersion: undefined, } satisfies GeneratedBackyOpenApiMediaReferences;

// @ts-expect-error editable media metadata scope is limited to documented ownership scopes.
const invalidMediaEditableMetadataScope = { ...mediaEditableMetadata, scope: "site", } satisfies GeneratedBackyOpenApiMediaEditableMetadata;

// @ts-expect-error media list envelopes require pagination for library browsing.
const invalidMediaList = { ...mediaList, data: { media: [mediaAsset] }, } satisfies GeneratedBackyOpenApiMediaList;

// @ts-expect-error media folder discovery envelopes require the public folder schema marker.
const invalidMediaFolderListSchema = { success: true, requestId: "req_media_folders_invalid", data: { schemaVersion: "backy.media-folders.v0", folders: [mediaFolder], root: mediaFolderRoot, count: 1, publicAssetCount: 1 }, } satisfies GeneratedBackyOpenApiMediaFolderListEnvelope;

// @ts-expect-error SDK media folder lists require a root folder summary for picker navigation.
const invalidSdkMediaFolderList = { ...sdkMediaFolderList, root: undefined, } satisfies BackyMediaFolderList;

// @ts-expect-error comment target types are limited to page and post discussions.
const invalidCommentTargetType = { ...comment, targetType: "product", } satisfies GeneratedBackyOpenApiComment;

// @ts-expect-error comment moderation states are bounded by the public moderation contract.
const invalidCommentStatus = { ...comment, status: "featured", } satisfies GeneratedBackyOpenApiComment;

// @ts-expect-error comment update requests require an explicit moderation status.
const invalidCommentUpdateRequest = { moderationNote: "No status.", } satisfies GeneratedBackyOpenApiCommentUpdateRequest;

// @ts-expect-error comment blocklist entries only support documented block types.
const invalidCommentBlocklistEntry = { ...commentBlocklistEntry, type: "domain", } satisfies GeneratedBackyOpenApiCommentBlocklistEntry;

// @ts-expect-error comment list envelopes require pagination for custom moderation UIs.
const invalidCommentsEnvelope = { ...commentsEnvelope, data: { comments: [comment], count: 1 }, } satisfies GeneratedBackyOpenApiCommentsEnvelope;

// @ts-expect-error event envelopes require a site id for multi-site activity feeds.
const invalidEventsEnvelopeSiteId = { ...eventsEnvelope, data: { ...eventsEnvelope.data, siteId: undefined }, } satisfies GeneratedBackyOpenApiEventsEnvelope;

// @ts-expect-error event envelopes require pagination for activity streams.
const invalidEventsEnvelopePagination = { ...eventsEnvelope, data: { ...eventsEnvelope.data, pagination: undefined }, } satisfies GeneratedBackyOpenApiEventsEnvelope;

// @ts-expect-error runtime event record envelopes must report whether the event was recorded.
const invalidRuntimeEventRecordEnvelope = { ...runtimeEventRecordEnvelope, data: { componentKey: "backy.custom.sandboxed" }, } satisfies GeneratedBackyOpenApiRuntimeEventRecordEnvelope;

// @ts-expect-error commerce products require storefront inventory metadata.
const invalidCommerceProductInventory = { ...commerceProduct, inventory: undefined, } satisfies GeneratedBackyOpenApiCommerceProduct;

// @ts-expect-error commerce product status is limited to the public publish states.
const invalidCommerceProductStatus = { ...commerceProduct, status: "hidden", } satisfies GeneratedBackyOpenApiCommerceProduct;

// @ts-expect-error commerce catalog envelopes require the versioned catalog schema marker.
const invalidCommerceCatalogSchemaVersion = { ...commerceCatalogEnvelope, data: { ...commerceCatalogEnvelope.data, schemaVersion: "backy.catalog.v0" }, } satisfies GeneratedBackyOpenApiCommerceCatalogEnvelope;

// @ts-expect-error commerce catalog envelopes expose storefront provider certification through the commerce contract.
const invalidCommerceCatalogCertification = { ...commerceCatalogEnvelope, data: { ...commerceCatalogEnvelope.data, commerce: { ...commerceCatalogEnvelope.data.commerce, providerCertification: undefined, }, }, } satisfies GeneratedBackyOpenApiCommerceCatalogEnvelope;

// @ts-expect-error commerce storefront contracts preserve the documented payment-provider handoff enum.
const invalidCommerceStorefrontPaymentProvider = { ...commerceStorefrontContract, paymentProvider: "braintree", } satisfies GeneratedBackyOpenApiCommerceStorefrontContract;

// @ts-expect-error commerce checkout quantities must be numeric in typed requests.
const invalidCommerceOrderCreateRequest = { lineItems: [{ slug: "starter-template", quantity: "2" }], } satisfies GeneratedBackyOpenApiCommerceOrderCreateRequest;

// @ts-expect-error commerce order contracts expose storefront provider certification through the commerce contract.
const invalidCommerceOrderContractCertification = { ...commerceOrderContractEnvelope, data: { ...commerceOrderContractEnvelope.data, commerce: { ...commerceOrderContractEnvelope.data.commerce, providerCertification: undefined, }, }, } satisfies GeneratedBackyOpenApiCommerceOrderContractEnvelope;

// @ts-expect-error checkout sessions only expose documented frontend handoff providers.
const invalidCommerceCheckoutProvider = { ...commerceOrderEnvelope, data: { ...commerceOrderEnvelope.data, checkoutSession: { ...commerceOrderEnvelope.data.checkoutSession, provider: "paypal", }, }, } satisfies GeneratedBackyOpenApiCommerceOrderEnvelope;

// @ts-expect-error commerce webhooks require an event type.
const invalidCommerceWebhookRequest = { id: "evt_missing_type", } satisfies GeneratedBackyOpenApiCommerceWebhookRequest;

// @ts-expect-error public site discovery status is limited to documented content states.
const invalidSiteSummaryStatus = { ...siteSummary, status: "hidden", } satisfies GeneratedBackyOpenApiSiteSummary;

// @ts-expect-error public site discovery detail envelopes require a site object.
const invalidSiteEnvelope = { success: true, requestId: "req_site_invalid", data: {}, } satisfies GeneratedBackyOpenApiSiteEnvelope;

// @ts-expect-error public site discovery list envelopes require pagination metadata.
const invalidSiteListEnvelope = { success: true, requestId: "req_sites_invalid", data: { sites: [siteSummary] }, } satisfies GeneratedBackyOpenApiSiteListEnvelope;

// @ts-expect-error site webhook payloads must advertise the stable site-webhook schema version.
const invalidSiteWebhookSchemaVersion = { ...siteWebhookPayload, schemaVersion: "backy.site-webhook.v0", } satisfies GeneratedBackyOpenApiSiteWebhookPayload;

// @ts-expect-error site webhook payloads only allow documented Backy webhook event kinds.
const invalidSiteWebhookKind = { ...siteWebhookPayload, kind: "content-updated", } satisfies GeneratedBackyOpenApiSiteWebhookPayload;

// @ts-expect-error OpenAPI content actions only allow documented renderer action types.
const invalidOpenApiElementAction = { ...openApiElementAction, type: "evalScript", } satisfies GeneratedBackyOpenApiBackyElementAction;

// @ts-expect-error OpenAPI data bindings only allow documented binding modes.
const invalidOpenApiDataBinding = { ...openApiDataBinding, mode: "script", } satisfies GeneratedBackyOpenApiBackyDataBinding;

// @ts-expect-error OpenAPI content elements require stable children and props for renderer traversal.
const invalidOpenApiContentElement = { id: "section-title", type: "heading", } satisfies GeneratedBackyOpenApiBackyContentElement;

// @ts-expect-error OpenAPI content documents require editable maps for custom frontend editing.
const invalidOpenApiContentDocument = { ...openApiContentDocument, editableMap: undefined, } satisfies GeneratedBackyOpenApiBackyContentDocument;

// @ts-expect-error interactive component security must preserve the postMessage-only boundary.
const invalidInteractiveSecurity = { ...interactiveRegistryEntry, security: { ...interactiveRegistryEntry.security, communication: "direct-window-access", }, } satisfies GeneratedBackyOpenApiInteractiveComponentRegistryEntry;

const invalidInteractiveSandboxResponseHeaders = {
  ...interactiveRegistryEnvelope.data.contract,
  sandbox: {
    ...interactiveRegistryEnvelope.data.contract.sandbox,
    // @ts-expect-error interactive sandbox contracts require response-header guarantees for custom frontend iframes.
    responseHeaders: undefined,
  },
} satisfies GeneratedBackyOpenApiInteractiveComponentManifestContract;

// @ts-expect-error runtime telemetry requires a bounded component key and message.
const invalidInteractiveRuntimeEvent = { componentKey: "backy.custom.sandboxed", } satisfies GeneratedBackyOpenApiInteractiveRuntimeEventRequest;

void renderEnvelope;
void contentStatus;
void dataBindingDataset;
void interactiveControl;
void interactiveFallback;
void interactiveRenderCapabilities;
void renderMediaAsset;
void renderFontAsset;
void renderForm;
void renderCommentThread;
void renderNavigationItem;
void renderNavigationLayout;
void renderFrontendDesignContract;
void frontendDesignProvenance;
void renderFrontendDesign;
void convenienceFrontendDatabaseCertification;
void convenienceFrontendLaunchReadiness;
void manifestNavigationItem;
void manifestEnvelope;
void openApi;
void openApiComponentName;
void openApiComponents;
void openApiOperation;
void pageRouteResource;
void postRouteResource;
void dynamicListRouteResource;
void dynamicItemRouteResource;
void pageRoute;
void postRoute;
void dynamicListRoute;
void dynamicItemRoute;
void redirectRoute;
void goneRoute;
void resolvedRoute;
void routeResolveEnvelope;
void goneRouteResolveEnvelope;
void navigationEnvelope;
void seoRoute;
void seoDiscoveryEnvelope;
void collectionFieldOption;
void collectionFieldValidation;
void collectionField;
void selectCollectionField;
void collectionPermissions;
void collectionSchema;
void collectionListEnvelope;
void collectionEnvelope;
void collectionRecord;
void collectionRecordListEnvelope;
void collectionRecordEnvelope;
void publicDeleteEnvelope;
void formValidationRule;
void formField;
void formDefinition;
void formListEnvelope;
void formEnvelope;
void formDefinitionEnvelope;
void formCollectionRecordLink;
void formCollectionRecordError;
void formSubmission;
void formSubmissionRequest;
void formSubmissionValidationDetail;
void formSubmissionValidationErrorEnvelope;
void formSubmissionEnvelope;
void formSubmissionsEnvelope;
void formContact;
void formContactEnvelope;
void formContactsEnvelope;
void mediaReferenceTarget;
void mediaReferences;
void mediaEditableMetadata;
void mediaAsset;
void genericFileMediaAsset;
void sdkGenericFileMediaAsset;
void sdkGenericFileMediaListOptions;
void mediaFolder;
void mediaFolderRoot;
void mediaFolderListEnvelope;
void sdkMediaFolder;
void sdkMediaFolderList;
void mediaList;
void mediaDetailEnvelope;
void fontVariant;
void fontManifestEnvelope;
void comment;
void commentSubmitRequest;
void commentUpdateRequest;
void commentBulkUpdateRequest;
void commentBlocklistEntry;
void commentsEnvelope;
void commentEnvelope;
void commentBulkUpdateEnvelope;
void commentBlocklistEnvelope;
void commentBlocklistDeleteRequest;
void commentBlocklistDeleteEnvelope;
void commentReportReasonsEnvelope;
void commentReportEnvelope;
void eventsEnvelope;
void runtimeEventRecordEnvelope;
void commerceProductDesign;
void commerceProduct;
void commerceCatalogEnvelope;
void commerceOrderCreateRequest;
void commerceOrderContractEnvelope;
void commerceOrderEnvelope;
void commerceWebhookRequest;
void commerceWebhookEnvelope;
void siteWebhookPayload;
void openApiContentAssetRef;
void openApiElementAction;
void openApiDataBindingSource;
void openApiDataBinding;
void openApiEditableMapEntry;
void openApiContentElementAccessibility;
void openApiContentElement;
void openApiContentDocument;
void reusableSectionContent;
void reusableSection;
void pageResource;
void pageSeoMetadata;
void pageListEnvelope;
void pageEnvelope;
void blogPostResource;
void blogFeedDiscovery;
void blogPostListEnvelope;
void blogPostEnvelope;
void blogCategoryResource;
void blogCategoryListEnvelope;
void blogTagResource;
void blogTagListEnvelope;
void blogAuthorResource;
void blogAuthorListEnvelope;
void frontendDesignTemplate;
void frontendEditableMapEntry;
void frontendDesignContract;
void frontendDesignEnvelope;
void sdkDeliveryDiscovery;
void sdkLocaleStrategy;
void sdkRouteFrontendDesign;
void sdkRoutePattern;
void sdkManifestPage;
void sdkManifestPagesRuntime;
void sdkManifestPost;
void sdkManifestBlogCategory;
void sdkManifestBlogTag;
void sdkManifestBlogAuthor;
void sdkManifestBlog;
void sdkManifestBlogRuntime;
void sdkManifestReusableSection;
void sdkManifestReusableSections;
void sdkManifestReusableSectionsRuntime;
void sdkManifestForm;
void sdkManifestFormsRuntime;
void sdkManifestCollectionsRuntime;
void sdkManifestMedia;
void sdkManifestCommerceRuntime;
void sdkManifestTheme;
void sdkManifestLiveManagement;
void sdkManifestCollection;
void sdkLocalizedRoutePatternGroup;
void sdkRedirectRule;
void sdkRoutingModule;
void interactiveRegistryEnvelope;
void interactiveRuntimeEvent;
void invalidTheme;
void invalidAction;
void invalidRenderPayload;
void invalidContentStatus;
void invalidDataBindingDataset;
void invalidBindingSlot;
void invalidRenderMediaAssetType;
void invalidOpenApiMediaAssetType;
void invalidSdkMediaListOptionType;
void invalidRenderNavigationTarget;
void invalidGeneratedFrontendDesignContract;
void invalidManifestLocaleStrategy;
void invalidGeneratedManifestCommentPolicy;
void invalidGeneratedManifestCommentsDiscovery;
void invalidGeneratedManifestSchemas;
void invalidGeneratedManifestCapability;
void invalidGeneratedManifestEndpoint;
void invalidGeneratedManifestNavigationItem;
void invalidGeneratedManifestNavigationLayout;
void invalidSdkLocaleStrategy;
void invalidSdkRoutePattern;
void invalidSdkRouteFrontendDesign;
void invalidSdkManifestPage;
void invalidSdkManifestPagesRuntime;
void invalidGeneratedManifestPagesRuntimeDiscovery;
void invalidSdkManifestPost;
void invalidGeneratedManifestBlogCategory;
void invalidSdkManifestBlogCategory;
void invalidSdkManifestBlogTag;
void invalidSdkManifestBlog;
void invalidGeneratedManifestBlogRuntimeDiscovery;
void invalidSdkManifestBlogRuntime;
void invalidSdkManifestReusableSection;
void invalidSdkManifestReusableSections;
void invalidSdkManifestReusableSectionsRuntime;
void invalidGeneratedReusableSectionCategory;
void invalidGeneratedReusableSectionItem;
void invalidGeneratedReusableSectionsRuntimeDiscovery;
void invalidGeneratedManifestMediaTypes;
void invalidGeneratedManifestMediaDiscovery;
void invalidGeneratedManifestThemeDiscovery;
void invalidGeneratedManifestLiveManagementDiscovery;
void invalidGeneratedManifestFormsRuntimeDiscovery;
void invalidGeneratedManifestCommerceMode;
void invalidGeneratedManifestCommerceCapabilities;
void invalidGeneratedManifestCommerceProviderCertification;
void invalidGeneratedManifestCommerceRuntimeDiscovery;
void invalidSdkManifestCommerceRuntime;
void generatedManifestCommerceProviderCertification;
void invalidGeneratedInteractiveRegistry;
void invalidGeneratedInteractiveSecurity;
void sdkInteractiveComponentsContract;
void invalidSdkInteractiveSandboxHeaders;
void invalidGeneratedManifestCollectionField;
void invalidGeneratedManifestCollectionPermissions;
void invalidGeneratedManifestCollectionsRuntimeDiscovery;
void invalidGeneratedManifestFormField;
void invalidGeneratedManifestFormDetailUrl;
void invalidSdkManifestForm;
void invalidSdkManifestFormsRuntime;
void invalidSdkManifestMedia;
void invalidSdkManifestTheme;
void invalidSdkManifestLiveManagement;
void invalidSdkManifestCollection;
void invalidSdkManifestCollectionsRuntime;
void invalidSdkLocalizedRoutePatternGroup;
void invalidSdkRedirectRule;
void invalidSdkRoutingModule;
void invalidOpenApiOperationId;
void invalidOpenApiComponentName;
void invalidOpenApiComponents;
void invalidPageRouteResource;
void invalidDynamicListRouteResource;
void invalidRouteResolveEnvelope;
void invalidGoneRouteResolveEnvelope;
void invalidRedirectRouteStatusCode;
void invalidNavigationEnvelope;
void invalidPageSeoMetadata;
void invalidPageListEnvelope;
void invalidSeoRouteFrequency;
void invalidBlogFeedFormat;
void invalidBlogCategorySlug;
void invalidCollectionFieldType;
void invalidCollectionPermissions;
void invalidCollectionRecordValues;
void invalidPublicDeleteEnvelope;
void invalidFontManifestSchemaVersion;
void invalidFrontendDesignStatus;
void invalidFormListEnvelope;
void invalidFormDefinitionEnvelope;
void invalidFormFieldType;
void invalidFormDefinition;
void invalidFormSubmissionValues;
void invalidFormSubmissionValidationDetail;
void invalidFormSubmissionStatus;
void invalidFormContactStatus;
void invalidFormContactUpdatedAt;
void invalidMediaReferences;
void invalidMediaEditableMetadataScope;
void invalidMediaList;
void invalidMediaFolderListSchema;
void invalidSdkMediaFolderList;
void invalidCommentTargetType;
void invalidCommentStatus;
void invalidCommentUpdateRequest;
void invalidCommentBlocklistEntry;
void invalidCommentsEnvelope;
void invalidEventsEnvelopeSiteId;
void invalidEventsEnvelopePagination;
void invalidRuntimeEventRecordEnvelope;
void invalidCommerceProductInventory;
void invalidCommerceProductStatus;
void invalidCommerceCatalogSchemaVersion;
void invalidCommerceOrderCreateRequest;
void invalidCommerceCheckoutProvider;
void invalidCommerceWebhookRequest;
void invalidSiteWebhookSchemaVersion;
void invalidSiteWebhookKind;
void invalidOpenApiElementAction;
void invalidOpenApiDataBinding;
void invalidOpenApiContentElement;
void invalidOpenApiContentDocument;
void invalidInteractiveSecurity;
void invalidInteractiveSandboxResponseHeaders;
void invalidInteractiveRuntimeEvent;
void (null as unknown as ManifestEnvelopeDataIsManifest);
void (null as unknown as RenderEnvelopeDataIsPayload);
void (null as unknown as EditableMapEntry);
void generatedBackyContractTypeSources;
