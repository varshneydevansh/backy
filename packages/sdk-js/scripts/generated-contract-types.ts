import type {
  BackyLocaleStrategy,
  BackyInteractiveComponentsContract,
  BackyMediaAsset,
  BackyMediaFolder,
  BackyMediaFolderList,
  BackyMediaListOptions,
  BackyAdminAuditLog,
  BackyAdminAuditLogsResponse,
  BackyAdminCollectionBindingPresetsResponse,
  BackyAdminFrontendDesignResponse,
  BackyAdminInteractiveComponent,
  BackyAdminInteractiveComponentBundleResponse,
  BackyAdminInteractiveComponentDeleteResponse,
  BackyAdminInteractiveComponentExportResponse,
  BackyAdminInteractiveComponentMigrationResponse,
  BackyAdminInteractiveComponentResponse,
  BackyAdminInteractiveComponentReviewResponse,
  BackyAdminInteractiveComponentRollbackResponse,
  BackyAdminInteractiveComponentUsageResponse,
  BackyAdminInteractiveComponentsResponse,
  BackyManifestBlogAuthor,
  BackyManifestBlogCategory,
  BackyManifestBlogModule,
  BackyManifestBlogRuntimeModule,
  BackyManifestBlogTag,
  BackyManifestCommerceRuntimeModule,
  BackyManifestContentLifecycleCommands,
  BackyManifestContentManagementPolicy,
  BackyManifestCollectionSchema,
  BackyManifestCollectionsRuntimeModule,
  BackyAdminSettings,
  BackyAdminSettingsActionResponse,
  BackyAdminSettingsInfrastructureResponse,
  BackyAdminSettingsIssueApiKeyResponse,
  BackyAdminSettingsNotificationWebhookResponse,
  BackyAdminSettingsResponse,
  BackyAdminSettingsStorageCredentialRotationResponse,
  BackyAdminSettingsStorageProvisioningResponse,
  BackyAdminSettingsStorageSecretManagerResponse,
  BackyAdminNavigationResponse,
  BackyAdminAuthSessionRevokeResponse,
  BackyAdminAuthSessionsResponse,
  BackyAdminSiteEventsResponse,
  BackyAdminRedirectsResponse,
  BackyAdminSeoResponse,
  BackyAdminSiteDeleteResponse,
  BackyAdminSiteDuplicateResponse,
  BackyAdminSiteReadinessResponse,
  BackyAdminSiteResponse,
  BackyAdminSitesResponse,
  BackyAdminTemplateRegistryResponse,
  BackyAdminTeam,
  BackyAdminTeamDeleteResponse,
  BackyAdminTeamMember,
  BackyAdminTeamMemberRemoveResponse,
  BackyAdminTeamMemberResponse,
  BackyAdminTeamMembersResponse,
  BackyAdminTeamResponse,
  BackyAdminTeamsResponse,
  BackyAdminUser,
  BackyAdminUserBulkResponse,
  BackyAdminUserDeleteResponse,
  BackyAdminUserImportResponse,
  BackyAdminUserImportRollbackResponse,
  BackyAdminUserInviteResponse,
  BackyAdminUserMfaResponse,
  BackyAdminUserOwnershipTransferResponse,
  BackyAdminUserPasswordResetResponse,
  BackyAdminUserPermissionsResponse,
  BackyAdminUserResponse,
  BackyAdminUsersResponse,
  BackyAdminBlogAuthorsResponse,
  BackyAdminBlogCategoriesResponse,
  BackyAdminBlogCategoryDeleteResponse,
  BackyAdminBlogCategoryResponse,
  BackyAdminBlogPostDeleteResponse,
  BackyAdminBlogPostPreviewResponse,
  BackyAdminBlogPostRollbackInput,
  BackyAdminBlogPostRevision,
  BackyAdminBlogPostReadinessResponse,
  BackyAdminBlogPostResponse,
  BackyAdminBlogPostRevisionsResponse,
  BackyAdminBlogPostsResponse,
  BackyAdminBlogTagDeleteResponse,
  BackyAdminBlogTagResponse,
  BackyAdminBlogTagsResponse,
  BackyAdminCollectionsBackup,
  BackyAdminCollectionsBackupImportResponse,
  BackyAdminCollectionsBackupResponse,
  BackyAdminCollectionDeleteResponse,
  BackyAdminCollectionRecordBulkResponse,
  BackyAdminCollectionRecordDeleteResponse,
  BackyAdminCollectionRecordImportResponse,
  BackyAdminCollectionRecordResponse,
  BackyAdminCollectionRecordsResponse,
  BackyAdminCollectionResponse,
  BackyAdminCollectionsResponse,
  BackyAdminCommerceOrderBulkResponse,
  BackyAdminCommerceOrderDeleteResponse,
  BackyAdminCommerceOrderImportResponse,
  BackyAdminCommerceOrderResponse,
  BackyAdminCommerceOrdersResponse,
  BackyAdminCommerceProductBulkResponse,
  BackyAdminCommerceProductDeleteResponse,
  BackyAdminCommerceProductImportResponse,
  BackyAdminCommerceProductResponse,
  BackyAdminCommerceProductsResponse,
  BackyAdminReusableSectionDeleteResponse,
  BackyAdminReusableSectionExportResponse,
  BackyAdminReusableSectionImportResponse,
  BackyAdminReusableSectionInstancesRefreshResponse,
  BackyAdminReusableSectionInstancesResponse,
  BackyAdminReusableSectionMetadataResponse,
  BackyAdminReusableSectionMetadataUpdateResponse,
  BackyAdminReusableSectionResponse,
  BackyAdminReusableSectionRestoreResponse,
  BackyAdminReusableSectionVersionsResponse,
  BackyAdminReusableSectionsResponse,
  BackySiteSettingsScope,
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
  BackyAdminMediaDeleteResponse,
  BackyAdminMediaFolderDeleteResponse,
  BackyAdminMediaFolderResponse,
  BackyAdminMediaFoldersResponse,
  BackyAdminMediaListResponse,
  BackyAdminMediaProviderAnalyticsResponse,
  BackyAdminMediaResponse,
  BackyAdminMediaTransformsResponse,
  BackyAdminMediaUploadInput,
  BackyAdminMediaUpdateInput,
  BackyAdminMediaVersion,
  BackyAdminMediaVersionDeleteResponse,
  BackyAdminMediaVersionRestoreResponse,
  BackyAdminMediaVersionsResponse,
  BackyAdminPageDeleteResponse,
  BackyAdminPagePreviewResponse,
  BackyAdminPageRollbackInput,
  BackyAdminPageRevision,
  BackyAdminPageReadinessResponse,
  BackyAdminPageResponse,
  BackyAdminPageRevisionsResponse,
  BackyAdminPagesResponse,
  BackyMediaBindingInput,
  BackyMediaBindingResponse,
  BackyMediaSignedUrlInput,
  BackyMediaSignedUrlResponse,
    BackySiteSettingsResponse,
    BackyManifestDeliveryDiscovery,
    BackyCompletionArtifactVerifier,
    BackyCompletionEvidenceArtifact,
    BackyCompletionStatus,
    BackyFrontendDatabaseCertification,
  BackyFrontendLaunchReadiness,
  BackyClient,
  BackyCommentBlocklistDeleteResponse,
  BackyCommentBlocklistResponse,
  BackyCommentBulkUpdateResponse,
  BackyCommentAnalyticsResponse,
  BackyCommentDeleteResponse,
  BackyCommentDeliveryRetryResponse,
  BackyCommentInput,
  BackyCommentReportInput,
  BackySiteCommentResponse,
  BackySiteCommentsResponse,
  BackyCommerceOrderInput,
  BackyCommerceOrderAnalyticsResponse,
  BackyCommerceOrderStatusAccess,
  BackyCommerceOrderStatusHandoffResponse,
  BackyCommerceOrderFulfillmentResponse,
  BackyCommerceOrderProviderRefundResponse,
  BackyCommerceOrderQuoteResponse,
  BackyCommerceOrderShippingLabelResponse,
  BackyCommerceOrderTrackingResponse,
  BackyCommerceProviderCertification,
  BackyCommerceProductProviderSyncResponse,
  BackyCommerceProductSubscriptionActionResponse,
  BackyCommerceProductSubscriptionsResponse,
  BackyCommerceReconciliationBatchResponse,
  BackyCommerceReconciliationReadinessResponse,
  BackyCommerceReconciliationResponse,
  BackyCollectionRecordWriteInput,
  BackyAdminFormCloneResponse,
  BackyAdminFormConsentRetentionResponse,
  BackyAdminFormContactConsentRetentionResponse,
  BackyAdminFormContactCustomerPromotionResponse,
  BackyAdminFormContactDeleteResponse,
  BackyAdminFormContactImportResponse,
  BackyAdminFormContactListMutationResponse,
  BackyAdminFormContactListsResponse,
  BackyAdminFormContactResponse,
  BackyAdminFormContactsResponse,
  BackyAdminFormContactSyncResponse,
  BackyAdminFormContactUserPromotionResponse,
  BackyAdminFormDeleteResponse,
  BackyAdminFormDeliveryRetryResponse,
  BackyAdminFormEmbedBlockResponse,
  BackyAdminFormResponse,
  BackyAdminFormsAnalyticsResponse,
  BackyAdminFormsConsentRetentionResponse,
  BackyAdminFormsResponse,
  BackyAdminFormContactSegmentsResponse,
  BackyAdminFormSubmissionResponse,
  BackyAdminFormSubmissionsResponse,
  BackyFormSubmissionInput,
  BackyInteractiveRuntimeEventInput,
  BackyContentAddElementResult,
  BackyContentRevisionBranchMetadata,
  BackyContentDeleteElementsResult,
  BackyContentDuplicateElementResult,
  BackyContentElementDescriptor,
  BackyContentEditableFieldPatch,
  BackyContentEditableMapPatch,
  BackyContentElementPatch,
  BackyContentGroupResult,
  BackyContentTransformElementsResult,
  BackyContentUngroupResult,
  BackyEditableContent,
  BackyLiveManagedBlogPostResponse,
  BackyLiveManagedBlogPostUpdateInput,
  BackyLiveManagedPageResponse,
  BackyLiveManagedPageUpdateInput,
  BackyLiveManagementRequestOptions,
  BackyManifestEditorCommandRegistry,
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
  GeneratedBackyPublicRenderPayloadProductDesignReadiness,
  GeneratedBackyFrontendDesignContract,
    GeneratedBackyFrontendDesignProvenance,
    GeneratedBackyFrontendManifest,
    GeneratedBackyFrontendManifestCompletionStatus,
    GeneratedBackyFrontendManifestCommerceProviderCertification,
  GeneratedBackyFrontendManifestCustomFrontendAgentHandoff,
  GeneratedBackyFrontendManifestDatabaseCertification,
  GeneratedBackyFrontendManifestEnvelope,
  GeneratedBackyFrontendManifestLaunchReadiness,
  GeneratedBackyFrontendManifestNavigationItem,
  GeneratedBackyInteractiveControl,
  GeneratedBackyInteractiveFallback,
  GeneratedBackyInteractiveRenderCapabilities,
    GeneratedBackyOpenApiBackyContentAssetRef,
    GeneratedBackyOpenApiBackyCompletionStatus,
  GeneratedBackyOpenApiBackyContentDocument,
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
  GeneratedBackyOpenApiCommentDeliveryRetryEnvelope,
  GeneratedBackyOpenApiCommentDeliveryRetryRequest,
  GeneratedBackyOpenApiCommentEnvelope,
  GeneratedBackyOpenApiCommentReportEnvelope,
  GeneratedBackyOpenApiCommentReportReasonsEnvelope,
  GeneratedBackyOpenApiCommentSubmitRequest,
  GeneratedBackyOpenApiCommentUpdateRequest,
  GeneratedBackyOpenApiCommentsEnvelope,
  GeneratedBackyOpenApiCommerceCatalogEnvelope,
  GeneratedBackyOpenApiCommerceOrderAnalyticsEnvelope,
  GeneratedBackyOpenApiCommerceOrderAnalyticsProviderCertification,
  GeneratedBackyOpenApiCommerceOrderContractEnvelope,
  GeneratedBackyOpenApiCommerceOrderCreateRequest,
  GeneratedBackyOpenApiCommerceOrderEnvelope,
  GeneratedBackyOpenApiCommerceOrderProviderCertificationEvidence,
  GeneratedBackyOpenApiCommerceOrderProviderCertificationEvidencePacket,
  GeneratedBackyOpenApiCommerceOrderStatusAccess,
  GeneratedBackyOpenApiCommerceOrderStatusHandoffEnvelope,
  GeneratedBackyOpenApiCommerceProduct,
  GeneratedBackyOpenApiCommerceProductDesign,
  GeneratedBackyOpenApiCommerceProductDesignReadiness,
  GeneratedBackyOpenApiCommerceProductProviderCertificationEvidencePacket,
  GeneratedBackyOpenApiCommerceProductProviderSyncEnvelope,
  GeneratedBackyOpenApiCommerceProductSubscriptionActionEnvelope,
  GeneratedBackyOpenApiCommerceProductSubscriptionsEnvelope,
  GeneratedBackyOpenApiCommerceManagementPolicy,
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
  GeneratedBackyPublicRenderPayloadFontVariant,
  GeneratedBackyThemeTokens,
} from "../src/index";
import {
  addBackyContentElement,
  buildBackyCommentInput,
  buildBackyCommentReportInput,
  buildBackyCollectionRecordWriteInput,
  buildBackyCommerceOrderInput,
  buildBackyFormSubmissionInput,
  buildBackyInteractiveRuntimeEventInput,
  buildBackyMediaBindingInput,
  buildBackyMediaSignedUrlInput,
  buildBackyLiveManagedBlogPostEditableMapUpdate,
  buildBackyLiveManagedPageEditableMapUpdate,
  deleteBackyContentElements,
  duplicateBackyContentElement,
  findBackyContentElement,
  generatedBackyContractTypeSources,
  groupBackyContentElements,
  listBackyContentElements,
  patchBackyContentEditableField,
  patchBackyContentEditableFields,
  patchBackyContentEditableMapEntry,
  patchBackyContentEditableMapEntries,
  patchBackyContentEditableMapValues,
  patchBackyContentElement,
  patchBackyContentElements,
  transformBackyContentElements,
  ungroupBackyContentElements,
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
type AdminSitesMethodReturnsContract = Assert<
  Equal<AwaitedReturn<BackyClient["adminSites"]>, BackyAdminSitesResponse>
>;
type CreateAdminSiteMethodReturnsContract = Assert<
  Equal<AwaitedReturn<BackyClient["createAdminSite"]>, BackyAdminSiteResponse>
>;
type AdminSiteMethodReturnsContract = Assert<
  Equal<AwaitedReturn<BackyClient["adminSite"]>, BackyAdminSiteResponse>
>;
type UpdateAdminSiteMethodReturnsContract = Assert<
  Equal<AwaitedReturn<BackyClient["updateAdminSite"]>, BackyAdminSiteResponse>
>;
type DeleteAdminSiteMethodReturnsContract = Assert<
  Equal<
    AwaitedReturn<BackyClient["deleteAdminSite"]>,
    BackyAdminSiteDeleteResponse
  >
>;
type AdminSiteReadinessMethodReturnsContract = Assert<
  Equal<
    AwaitedReturn<BackyClient["adminSiteReadiness"]>,
    BackyAdminSiteReadinessResponse
  >
>;
type DuplicateAdminSiteMethodReturnsContract = Assert<
  Equal<
    AwaitedReturn<BackyClient["duplicateAdminSite"]>,
    BackyAdminSiteDuplicateResponse
  >
>;
type AdminSettingsMethodReturnsContract = Assert<
  Equal<AwaitedReturn<BackyClient["adminSettings"]>, BackyAdminSettingsResponse>
>;
type AdminSettingsUpdateMethodReturnsContract = Assert<
  Equal<
    AwaitedReturn<BackyClient["updateAdminSettings"]>,
    BackyAdminSettingsResponse
  >
>;
type RegenerateAdminSettingsApiKeysMethodReturnsContract = Assert<
  Equal<
    AwaitedReturn<BackyClient["regenerateAdminSettingsApiKeys"]>,
    BackyAdminSettingsActionResponse
  >
>;
type IssueAdminSettingsApiKeyMethodReturnsContract = Assert<
  Equal<
    AwaitedReturn<BackyClient["issueAdminSettingsApiKey"]>,
    BackyAdminSettingsIssueApiKeyResponse
  >
>;
type RevokeAdminSettingsApiKeyMethodReturnsContract = Assert<
  Equal<
    AwaitedReturn<BackyClient["revokeAdminSettingsApiKey"]>,
    BackyAdminSettingsActionResponse
  >
>;
type ValidateAdminSettingsInfrastructureMethodReturnsContract = Assert<
  Equal<
    AwaitedReturn<BackyClient["validateAdminSettingsInfrastructure"]>,
    BackyAdminSettingsInfrastructureResponse
  >
>;
type RunAdminSettingsStorageProvisioningProbeMethodReturnsContract = Assert<
  Equal<
    AwaitedReturn<BackyClient["runAdminSettingsStorageProvisioningProbe"]>,
    BackyAdminSettingsStorageProvisioningResponse
  >
>;
type RunAdminSettingsStorageCredentialRotationProbeMethodReturnsContract =
  Assert<
    Equal<
      AwaitedReturn<
        BackyClient["runAdminSettingsStorageCredentialRotationProbe"]
      >,
      BackyAdminSettingsStorageCredentialRotationResponse
    >
  >;
type RunAdminSettingsStorageSecretManagerMethodReturnsContract = Assert<
  Equal<
    AwaitedReturn<BackyClient["runAdminSettingsStorageSecretManager"]>,
    BackyAdminSettingsStorageSecretManagerResponse
  >
>;
type TestAdminSettingsNotificationWebhookMethodReturnsContract = Assert<
  Equal<
    AwaitedReturn<BackyClient["testAdminSettingsNotificationWebhook"]>,
    BackyAdminSettingsNotificationWebhookResponse
  >
>;
type AdminSiteSettingsMethodReturnsContract = Assert<
  Equal<
    AwaitedReturn<BackyClient["adminSiteSettings"]>,
    BackySiteSettingsResponse
  >
>;
type AdminSiteSettingsUpdateMethodReturnsContract = Assert<
  Equal<
    AwaitedReturn<BackyClient["updateAdminSiteSettings"]>,
    BackySiteSettingsResponse
  >
>;
type AdminFrontendDesignMethodReturnsContract = Assert<
  Equal<
    AwaitedReturn<BackyClient["adminFrontendDesign"]>,
    BackyAdminFrontendDesignResponse
  >
>;
type UpdateAdminFrontendDesignMethodReturnsContract = Assert<
  Equal<
    AwaitedReturn<BackyClient["updateAdminFrontendDesign"]>,
    BackyAdminFrontendDesignResponse
  >
>;
type ImportAdminFrontendDesignMethodReturnsContract = Assert<
  Equal<
    AwaitedReturn<BackyClient["importAdminFrontendDesign"]>,
    BackyAdminFrontendDesignResponse
  >
>;
type CaptureAdminSiteDefaultsMethodReturnsContract = Assert<
  Equal<
    AwaitedReturn<BackyClient["captureAdminSiteDefaults"]>,
    BackyAdminFrontendDesignResponse
  >
>;
type CaptureAdminContentTemplateMethodReturnsContract = Assert<
  Equal<
    AwaitedReturn<BackyClient["captureAdminContentTemplate"]>,
    BackyAdminFrontendDesignResponse
  >
>;
type AdminTemplatesMethodReturnsContract = Assert<
  Equal<
    AwaitedReturn<BackyClient["adminTemplates"]>,
    BackyAdminTemplateRegistryResponse
  >
>;
type AdminCollectionBindingPresetsMethodReturnsContract = Assert<
  Equal<
    AwaitedReturn<BackyClient["adminCollectionBindingPresets"]>,
    BackyAdminCollectionBindingPresetsResponse
  >
>;
type UpdateAdminCollectionBindingPresetsMethodReturnsContract = Assert<
  Equal<
    AwaitedReturn<BackyClient["updateAdminCollectionBindingPresets"]>,
    BackyAdminCollectionBindingPresetsResponse
  >
>;
type AdminInteractiveComponentsMethodReturnsContract = Assert<
  Equal<
    AwaitedReturn<BackyClient["adminInteractiveComponents"]>,
    BackyAdminInteractiveComponentsResponse
  >
>;
type CreateAdminInteractiveComponentMethodReturnsContract = Assert<
  Equal<
    AwaitedReturn<BackyClient["createAdminInteractiveComponent"]>,
    BackyAdminInteractiveComponentResponse
  >
>;
type AdminInteractiveComponentMethodReturnsContract = Assert<
  Equal<
    AwaitedReturn<BackyClient["adminInteractiveComponent"]>,
    BackyAdminInteractiveComponentResponse
  >
>;
type UpdateAdminInteractiveComponentMethodReturnsContract = Assert<
  Equal<
    AwaitedReturn<BackyClient["updateAdminInteractiveComponent"]>,
    BackyAdminInteractiveComponentResponse
  >
>;
type DeleteAdminInteractiveComponentMethodReturnsContract = Assert<
  Equal<
    AwaitedReturn<BackyClient["deleteAdminInteractiveComponent"]>,
    BackyAdminInteractiveComponentDeleteResponse
  >
>;
type AdminInteractiveComponentUsageMethodReturnsContract = Assert<
  Equal<
    AwaitedReturn<BackyClient["adminInteractiveComponentUsage"]>,
    BackyAdminInteractiveComponentUsageResponse
  >
>;
type ExportAdminInteractiveComponentMethodReturnsContract = Assert<
  Equal<
    AwaitedReturn<BackyClient["exportAdminInteractiveComponent"]>,
    BackyAdminInteractiveComponentExportResponse
  >
>;
type ReviewAdminInteractiveComponentMethodReturnsContract = Assert<
  Equal<
    AwaitedReturn<BackyClient["reviewAdminInteractiveComponent"]>,
    BackyAdminInteractiveComponentReviewResponse
  >
>;
type UploadAdminInteractiveComponentBundleMethodReturnsContract = Assert<
  Equal<
    AwaitedReturn<BackyClient["uploadAdminInteractiveComponentBundle"]>,
    BackyAdminInteractiveComponentBundleResponse
  >
>;
type MigrateAdminInteractiveComponentVersionMethodReturnsContract = Assert<
  Equal<
    AwaitedReturn<BackyClient["migrateAdminInteractiveComponentVersion"]>,
    BackyAdminInteractiveComponentMigrationResponse
  >
>;
type RollbackAdminInteractiveComponentVersionMethodReturnsContract = Assert<
  Equal<
    AwaitedReturn<BackyClient["rollbackAdminInteractiveComponentVersion"]>,
    BackyAdminInteractiveComponentRollbackResponse
  >
>;
type AdminNavigationMethodReturnsContract = Assert<
  Equal<
    AwaitedReturn<BackyClient["adminNavigation"]>,
    BackyAdminNavigationResponse
  >
>;
type AdminNavigationUpdateMethodReturnsContract = Assert<
  Equal<
    AwaitedReturn<BackyClient["updateAdminNavigation"]>,
    BackyAdminNavigationResponse
  >
>;
type AdminSeoMethodReturnsContract = Assert<
  Equal<AwaitedReturn<BackyClient["adminSeo"]>, BackyAdminSeoResponse>
>;
type AdminSeoUpdateMethodReturnsContract = Assert<
  Equal<AwaitedReturn<BackyClient["updateAdminSeo"]>, BackyAdminSeoResponse>
>;
type AdminRedirectsMethodReturnsContract = Assert<
  Equal<
    AwaitedReturn<BackyClient["adminRedirects"]>,
    BackyAdminRedirectsResponse
  >
>;
type AdminRedirectsPreviewMethodReturnsContract = Assert<
  Equal<
    AwaitedReturn<BackyClient["previewAdminRedirects"]>,
    BackyAdminRedirectsResponse
  >
>;
type AdminRedirectsUpdateMethodReturnsContract = Assert<
  Equal<
    AwaitedReturn<BackyClient["updateAdminRedirects"]>,
    BackyAdminRedirectsResponse
  >
>;
type AdminUsersMethodReturnsContract = Assert<
  Equal<AwaitedReturn<BackyClient["adminUsers"]>, BackyAdminUsersResponse>
>;
type CreateAdminUserMethodReturnsContract = Assert<
  Equal<AwaitedReturn<BackyClient["createAdminUser"]>, BackyAdminUserResponse>
>;
type AdminUserMethodReturnsContract = Assert<
  Equal<AwaitedReturn<BackyClient["adminUser"]>, BackyAdminUserResponse>
>;
type UpdateAdminUserMethodReturnsContract = Assert<
  Equal<AwaitedReturn<BackyClient["updateAdminUser"]>, BackyAdminUserResponse>
>;
type DeleteAdminUserMethodReturnsContract = Assert<
  Equal<
    AwaitedReturn<BackyClient["deleteAdminUser"]>,
    BackyAdminUserDeleteResponse
  >
>;
type BulkAdminUsersMethodReturnsContract = Assert<
  Equal<
    AwaitedReturn<BackyClient["bulkAdminUsers"]>,
    BackyAdminUserBulkResponse
  >
>;
type AdminUserPermissionsMethodReturnsContract = Assert<
  Equal<
    AwaitedReturn<BackyClient["adminUserPermissions"]>,
    BackyAdminUserPermissionsResponse
  >
>;
type UpdateAdminUserPermissionsMethodReturnsContract = Assert<
  Equal<
    AwaitedReturn<BackyClient["updateAdminUserPermissions"]>,
    BackyAdminUserPermissionsResponse
  >
>;
type AdminUserMfaMethodReturnsContract = Assert<
  Equal<AwaitedReturn<BackyClient["adminUserMfa"]>, BackyAdminUserMfaResponse>
>;
type UpdateAdminUserMfaMethodReturnsContract = Assert<
  Equal<
    AwaitedReturn<BackyClient["updateAdminUserMfa"]>,
    BackyAdminUserMfaResponse
  >
>;
type CreateAdminUserInviteMethodReturnsContract = Assert<
  Equal<
    AwaitedReturn<BackyClient["createAdminUserInvite"]>,
    BackyAdminUserInviteResponse
  >
>;
type CreateAdminUserPasswordResetMethodReturnsContract = Assert<
  Equal<
    AwaitedReturn<BackyClient["createAdminUserPasswordReset"]>,
    BackyAdminUserPasswordResetResponse
  >
>;
type TransferAdminUserOwnershipMethodReturnsContract = Assert<
  Equal<
    AwaitedReturn<BackyClient["transferAdminUserOwnership"]>,
    BackyAdminUserOwnershipTransferResponse
  >
>;
type AdminAuthSessionsMethodReturnsContract = Assert<
  Equal<
    AwaitedReturn<BackyClient["adminAuthSessions"]>,
    BackyAdminAuthSessionsResponse
  >
>;
type RevokeAdminAuthSessionMethodReturnsContract = Assert<
  Equal<
    AwaitedReturn<BackyClient["revokeAdminAuthSession"]>,
    BackyAdminAuthSessionRevokeResponse
  >
>;
type ImportAdminUsersCsvMethodReturnsContract = Assert<
  Equal<
    AwaitedReturn<BackyClient["importAdminUsersCsv"]>,
    BackyAdminUserImportResponse
  >
>;
type RollbackAdminUsersImportMethodReturnsContract = Assert<
  Equal<
    AwaitedReturn<BackyClient["rollbackAdminUsersImport"]>,
    BackyAdminUserImportRollbackResponse
  >
>;
type AdminTeamsMethodReturnsContract = Assert<
  Equal<AwaitedReturn<BackyClient["adminTeams"]>, BackyAdminTeamsResponse>
>;
type CreateAdminTeamMethodReturnsContract = Assert<
  Equal<AwaitedReturn<BackyClient["createAdminTeam"]>, BackyAdminTeamResponse>
>;
type AdminTeamMethodReturnsContract = Assert<
  Equal<AwaitedReturn<BackyClient["adminTeam"]>, BackyAdminTeamResponse>
>;
type UpdateAdminTeamMethodReturnsContract = Assert<
  Equal<AwaitedReturn<BackyClient["updateAdminTeam"]>, BackyAdminTeamResponse>
>;
type DeleteAdminTeamMethodReturnsContract = Assert<
  Equal<
    AwaitedReturn<BackyClient["deleteAdminTeam"]>,
    BackyAdminTeamDeleteResponse
  >
>;
type AdminTeamMembersMethodReturnsContract = Assert<
  Equal<
    AwaitedReturn<BackyClient["adminTeamMembers"]>,
    BackyAdminTeamMembersResponse
  >
>;
type InviteAdminTeamMemberMethodReturnsContract = Assert<
  Equal<
    AwaitedReturn<BackyClient["inviteAdminTeamMember"]>,
    BackyAdminTeamMemberResponse
  >
>;
type UpdateAdminTeamMemberMethodReturnsContract = Assert<
  Equal<
    AwaitedReturn<BackyClient["updateAdminTeamMember"]>,
    BackyAdminTeamMemberResponse
  >
>;
type RemoveAdminTeamMemberMethodReturnsContract = Assert<
  Equal<
    AwaitedReturn<BackyClient["removeAdminTeamMember"]>,
    BackyAdminTeamMemberRemoveResponse
  >
>;
type AdminAuditLogsMethodReturnsContract = Assert<
  Equal<
    AwaitedReturn<BackyClient["adminAuditLogs"]>,
    BackyAdminAuditLogsResponse
  >
>;
type AdminSiteEventsMethodReturnsContract = Assert<
  Equal<
    AwaitedReturn<BackyClient["adminSiteEvents"]>,
    BackyAdminSiteEventsResponse
  >
>;
type FormDeliveryEventsMethodReturnsContract = Assert<
  Equal<
    AwaitedReturn<BackyClient["formDeliveryEvents"]>,
    BackyAdminSiteEventsResponse
  >
>;
type OrderDeliveryEventsMethodReturnsContract = Assert<
  Equal<
    AwaitedReturn<BackyClient["orderDeliveryEvents"]>,
    BackyAdminSiteEventsResponse
  >
>;
type ProductNotificationEventsMethodReturnsContract = Assert<
  Equal<
    AwaitedReturn<BackyClient["productNotificationEvents"]>,
    BackyAdminSiteEventsResponse
  >
>;
type CommentAnalyticsMethodReturnsContract = Assert<
  Equal<
    AwaitedReturn<BackyClient["commentAnalytics"]>,
    BackyCommentAnalyticsResponse
  >
>;
type RetryCommentDeliveryMethodReturnsContract = Assert<
  Equal<
    AwaitedReturn<BackyClient["retryCommentDelivery"]>,
    BackyCommentDeliveryRetryResponse
  >
>;
type SiteCommentsMethodReturnsContract = Assert<
  Equal<AwaitedReturn<BackyClient["siteComments"]>, BackySiteCommentsResponse>
>;
type UpdateCommentsMethodReturnsContract = Assert<
  Equal<
    AwaitedReturn<BackyClient["updateComments"]>,
    BackyCommentBulkUpdateResponse
  >
>;
type ClearCommentReportsMethodReturnsContract = Assert<
  Equal<
    AwaitedReturn<BackyClient["clearCommentReports"]>,
    BackyCommentBulkUpdateResponse
  >
>;
type CommentBlocklistMethodReturnsContract = Assert<
  Equal<
    AwaitedReturn<BackyClient["commentBlocklist"]>,
    BackyCommentBlocklistResponse
  >
>;
type DeleteCommentBlocklistEntriesMethodReturnsContract = Assert<
  Equal<
    AwaitedReturn<BackyClient["deleteCommentBlocklistEntries"]>,
    BackyCommentBlocklistDeleteResponse
  >
>;
type CommentMethodReturnsContract = Assert<
  Equal<AwaitedReturn<BackyClient["comment"]>, BackySiteCommentResponse>
>;
type UpdateCommentMethodReturnsContract = Assert<
  Equal<AwaitedReturn<BackyClient["updateComment"]>, BackySiteCommentResponse>
>;
type DeleteCommentMethodReturnsContract = Assert<
  Equal<
    AwaitedReturn<BackyClient["deleteComment"]>,
    BackyCommentDeleteResponse
  >
>;
type AdminPagesMethodReturnsContract = Assert<
  Equal<AwaitedReturn<BackyClient["adminPages"]>, BackyAdminPagesResponse>
>;
type CreateAdminPageMethodReturnsContract = Assert<
  Equal<AwaitedReturn<BackyClient["createAdminPage"]>, BackyAdminPageResponse>
>;
type AdminPageMethodReturnsContract = Assert<
  Equal<AwaitedReturn<BackyClient["adminPage"]>, BackyAdminPageResponse>
>;
type UpdateAdminPageMethodReturnsContract = Assert<
  Equal<AwaitedReturn<BackyClient["updateAdminPage"]>, BackyAdminPageResponse>
>;
type DeleteAdminPageMethodReturnsContract = Assert<
  Equal<
    AwaitedReturn<BackyClient["deleteAdminPage"]>,
    BackyAdminPageDeleteResponse
  >
>;
type AdminPageReadinessMethodReturnsContract = Assert<
  Equal<
    AwaitedReturn<BackyClient["adminPageReadiness"]>,
    BackyAdminPageReadinessResponse
  >
>;
type PublishAdminPageMethodReturnsContract = Assert<
  Equal<AwaitedReturn<BackyClient["publishAdminPage"]>, BackyAdminPageResponse>
>;
type ArchiveAdminPageMethodReturnsContract = Assert<
  Equal<AwaitedReturn<BackyClient["archiveAdminPage"]>, BackyAdminPageResponse>
>;
type AdminPagePreviewMethodReturnsContract = Assert<
  Equal<
    AwaitedReturn<BackyClient["createAdminPagePreviewToken"]>,
    BackyAdminPagePreviewResponse
  >
>;
type AdminPageRevisionsMethodReturnsContract = Assert<
  Equal<
    AwaitedReturn<BackyClient["adminPageRevisions"]>,
    BackyAdminPageRevisionsResponse
  >
>;
type AdminPageRevisionBranchMetadataContract = Assert<
  Equal<
    BackyAdminPageRevision["branchMetadata"]["schemaVersion"],
    "backy.content-revision-branch-metadata.v1"
  >
>;
type RollbackAdminPageMethodReturnsContract = Assert<
  Equal<AwaitedReturn<BackyClient["rollbackAdminPage"]>, BackyAdminPageResponse>
>;
type AdminPageRollbackInputContract = Assert<
  BackyAdminPageRollbackInput extends GeneratedBackyOpenApiAdminPageRollbackRequest
    ? true
    : false
>;
type AdminBlogCategoriesMethodReturnsContract = Assert<
  Equal<
    AwaitedReturn<BackyClient["adminBlogCategories"]>,
    BackyAdminBlogCategoriesResponse
  >
>;
type CreateAdminBlogCategoryMethodReturnsContract = Assert<
  Equal<
    AwaitedReturn<BackyClient["createAdminBlogCategory"]>,
    BackyAdminBlogCategoryResponse
  >
>;
type AdminBlogCategoryMethodReturnsContract = Assert<
  Equal<
    AwaitedReturn<BackyClient["adminBlogCategory"]>,
    BackyAdminBlogCategoryResponse
  >
>;
type UpdateAdminBlogCategoryMethodReturnsContract = Assert<
  Equal<
    AwaitedReturn<BackyClient["updateAdminBlogCategory"]>,
    BackyAdminBlogCategoryResponse
  >
>;
type DeleteAdminBlogCategoryMethodReturnsContract = Assert<
  Equal<
    AwaitedReturn<BackyClient["deleteAdminBlogCategory"]>,
    BackyAdminBlogCategoryDeleteResponse
  >
>;
type AdminBlogTagsMethodReturnsContract = Assert<
  Equal<AwaitedReturn<BackyClient["adminBlogTags"]>, BackyAdminBlogTagsResponse>
>;
type CreateAdminBlogTagMethodReturnsContract = Assert<
  Equal<
    AwaitedReturn<BackyClient["createAdminBlogTag"]>,
    BackyAdminBlogTagResponse
  >
>;
type AdminBlogTagMethodReturnsContract = Assert<
  Equal<AwaitedReturn<BackyClient["adminBlogTag"]>, BackyAdminBlogTagResponse>
>;
type UpdateAdminBlogTagMethodReturnsContract = Assert<
  Equal<
    AwaitedReturn<BackyClient["updateAdminBlogTag"]>,
    BackyAdminBlogTagResponse
  >
>;
type DeleteAdminBlogTagMethodReturnsContract = Assert<
  Equal<
    AwaitedReturn<BackyClient["deleteAdminBlogTag"]>,
    BackyAdminBlogTagDeleteResponse
  >
>;
type AdminBlogAuthorsMethodReturnsContract = Assert<
  Equal<
    AwaitedReturn<BackyClient["adminBlogAuthors"]>,
    BackyAdminBlogAuthorsResponse
  >
>;
type AdminBlogPostsMethodReturnsContract = Assert<
  Equal<AwaitedReturn<BackyClient["adminBlogPosts"]>, BackyAdminBlogPostsResponse>
>;
type CreateAdminBlogPostMethodReturnsContract = Assert<
  Equal<
    AwaitedReturn<BackyClient["createAdminBlogPost"]>,
    BackyAdminBlogPostResponse
  >
>;
type AdminBlogPostMethodReturnsContract = Assert<
  Equal<AwaitedReturn<BackyClient["adminBlogPost"]>, BackyAdminBlogPostResponse>
>;
type UpdateAdminBlogPostMethodReturnsContract = Assert<
  Equal<
    AwaitedReturn<BackyClient["updateAdminBlogPost"]>,
    BackyAdminBlogPostResponse
  >
>;
type DeleteAdminBlogPostMethodReturnsContract = Assert<
  Equal<
    AwaitedReturn<BackyClient["deleteAdminBlogPost"]>,
    BackyAdminBlogPostDeleteResponse
  >
>;
type AdminBlogPostReadinessMethodReturnsContract = Assert<
  Equal<
    AwaitedReturn<BackyClient["adminBlogPostReadiness"]>,
    BackyAdminBlogPostReadinessResponse
  >
>;
type PublishAdminBlogPostMethodReturnsContract = Assert<
  Equal<
    AwaitedReturn<BackyClient["publishAdminBlogPost"]>,
    BackyAdminBlogPostResponse
  >
>;
type ArchiveAdminBlogPostMethodReturnsContract = Assert<
  Equal<
    AwaitedReturn<BackyClient["archiveAdminBlogPost"]>,
    BackyAdminBlogPostResponse
  >
>;
type AdminBlogPostPreviewMethodReturnsContract = Assert<
  Equal<
    AwaitedReturn<BackyClient["createAdminBlogPostPreviewToken"]>,
    BackyAdminBlogPostPreviewResponse
  >
>;
type AdminBlogPostRevisionsMethodReturnsContract = Assert<
  Equal<
    AwaitedReturn<BackyClient["adminBlogPostRevisions"]>,
    BackyAdminBlogPostRevisionsResponse
  >
>;
type AdminBlogPostRevisionBranchMetadataContract = Assert<
  Equal<
    BackyAdminBlogPostRevision["branchMetadata"]["schemaVersion"],
    "backy.content-revision-branch-metadata.v1"
  >
>;
type RollbackAdminBlogPostMethodReturnsContract = Assert<
  Equal<
    AwaitedReturn<BackyClient["rollbackAdminBlogPost"]>,
    BackyAdminBlogPostResponse
  >
>;
type AdminBlogPostRollbackInputContract = Assert<
  BackyAdminBlogPostRollbackInput extends GeneratedBackyOpenApiAdminBlogPostRollbackRequest
    ? true
    : false
>;
type AdminCollectionsMethodReturnsContract = Assert<
  Equal<
    AwaitedReturn<BackyClient["adminCollections"]>,
    BackyAdminCollectionsResponse
  >
>;
type CreateAdminCollectionMethodReturnsContract = Assert<
  Equal<
    AwaitedReturn<BackyClient["createAdminCollection"]>,
    BackyAdminCollectionResponse
  >
>;
type AdminCollectionMethodReturnsContract = Assert<
  Equal<
    AwaitedReturn<BackyClient["adminCollection"]>,
    BackyAdminCollectionResponse
  >
>;
type UpdateAdminCollectionMethodReturnsContract = Assert<
  Equal<
    AwaitedReturn<BackyClient["updateAdminCollection"]>,
    BackyAdminCollectionResponse
  >
>;
type DeleteAdminCollectionMethodReturnsContract = Assert<
  Equal<
    AwaitedReturn<BackyClient["deleteAdminCollection"]>,
    BackyAdminCollectionDeleteResponse
  >
>;
type ExportAdminCollectionsBackupMethodReturnsContract = Assert<
  Equal<
    AwaitedReturn<BackyClient["exportAdminCollectionsBackup"]>,
    BackyAdminCollectionsBackupResponse
  >
>;
type ImportAdminCollectionsBackupMethodReturnsContract = Assert<
  Equal<
    AwaitedReturn<BackyClient["importAdminCollectionsBackup"]>,
    BackyAdminCollectionsBackupImportResponse
  >
>;
type AdminCollectionRecordsMethodReturnsContract = Assert<
  Equal<
    AwaitedReturn<BackyClient["adminCollectionRecords"]>,
    BackyAdminCollectionRecordsResponse
  >
>;
type CreateAdminCollectionRecordMethodReturnsContract = Assert<
  Equal<
    AwaitedReturn<BackyClient["createAdminCollectionRecord"]>,
    BackyAdminCollectionRecordResponse
  >
>;
type AdminCollectionRecordMethodReturnsContract = Assert<
  Equal<
    AwaitedReturn<BackyClient["adminCollectionRecord"]>,
    BackyAdminCollectionRecordResponse
  >
>;
type UpdateAdminCollectionRecordMethodReturnsContract = Assert<
  Equal<
    AwaitedReturn<BackyClient["updateAdminCollectionRecord"]>,
    BackyAdminCollectionRecordResponse
  >
>;
type DeleteAdminCollectionRecordMethodReturnsContract = Assert<
  Equal<
    AwaitedReturn<BackyClient["deleteAdminCollectionRecord"]>,
    BackyAdminCollectionRecordDeleteResponse
  >
>;
type AdminCollectionRecordsCsvMethodReturnsContract = Assert<
  Equal<AwaitedReturn<BackyClient["adminCollectionRecordsCsv"]>, string>
>;
type ImportAdminCollectionRecordsCsvMethodReturnsContract = Assert<
  Equal<
    AwaitedReturn<BackyClient["importAdminCollectionRecordsCsv"]>,
    BackyAdminCollectionRecordImportResponse
  >
>;
type BulkAdminCollectionRecordsMethodReturnsContract = Assert<
  Equal<
    AwaitedReturn<BackyClient["bulkAdminCollectionRecords"]>,
    BackyAdminCollectionRecordBulkResponse
  >
>;
type AdminCommerceProductsMethodReturnsContract = Assert<
  Equal<
    AwaitedReturn<BackyClient["adminCommerceProducts"]>,
    BackyAdminCommerceProductsResponse
  >
>;
type CreateAdminCommerceProductMethodReturnsContract = Assert<
  Equal<
    AwaitedReturn<BackyClient["createAdminCommerceProduct"]>,
    BackyAdminCommerceProductResponse
  >
>;
type AdminCommerceProductMethodReturnsContract = Assert<
  Equal<
    AwaitedReturn<BackyClient["adminCommerceProduct"]>,
    BackyAdminCommerceProductResponse
  >
>;
type UpdateAdminCommerceProductMethodReturnsContract = Assert<
  Equal<
    AwaitedReturn<BackyClient["updateAdminCommerceProduct"]>,
    BackyAdminCommerceProductResponse
  >
>;
type DeleteAdminCommerceProductMethodReturnsContract = Assert<
  Equal<
    AwaitedReturn<BackyClient["deleteAdminCommerceProduct"]>,
    BackyAdminCommerceProductDeleteResponse
  >
>;
type AdminCommerceProductsCsvMethodReturnsContract = Assert<
  Equal<AwaitedReturn<BackyClient["adminCommerceProductsCsv"]>, string>
>;
type ImportAdminCommerceProductsCsvMethodReturnsContract = Assert<
  Equal<
    AwaitedReturn<BackyClient["importAdminCommerceProductsCsv"]>,
    BackyAdminCommerceProductImportResponse
  >
>;
type BulkAdminCommerceProductsMethodReturnsContract = Assert<
  Equal<
    AwaitedReturn<BackyClient["bulkAdminCommerceProducts"]>,
    BackyAdminCommerceProductBulkResponse
  >
>;
type AdminCommerceOrdersMethodReturnsContract = Assert<
  Equal<
    AwaitedReturn<BackyClient["adminCommerceOrders"]>,
    BackyAdminCommerceOrdersResponse
  >
>;
type CreateAdminCommerceOrderMethodReturnsContract = Assert<
  Equal<
    AwaitedReturn<BackyClient["createAdminCommerceOrder"]>,
    BackyAdminCommerceOrderResponse
  >
>;
type AdminCommerceOrderMethodReturnsContract = Assert<
  Equal<
    AwaitedReturn<BackyClient["adminCommerceOrder"]>,
    BackyAdminCommerceOrderResponse
  >
>;
type UpdateAdminCommerceOrderMethodReturnsContract = Assert<
  Equal<
    AwaitedReturn<BackyClient["updateAdminCommerceOrder"]>,
    BackyAdminCommerceOrderResponse
  >
>;
type DeleteAdminCommerceOrderMethodReturnsContract = Assert<
  Equal<
    AwaitedReturn<BackyClient["deleteAdminCommerceOrder"]>,
    BackyAdminCommerceOrderDeleteResponse
  >
>;
type AdminCommerceOrdersCsvMethodReturnsContract = Assert<
  Equal<AwaitedReturn<BackyClient["adminCommerceOrdersCsv"]>, string>
>;
type ImportAdminCommerceOrdersCsvMethodReturnsContract = Assert<
  Equal<
    AwaitedReturn<BackyClient["importAdminCommerceOrdersCsv"]>,
    BackyAdminCommerceOrderImportResponse
  >
>;
type BulkAdminCommerceOrdersMethodReturnsContract = Assert<
  Equal<
    AwaitedReturn<BackyClient["bulkAdminCommerceOrders"]>,
    BackyAdminCommerceOrderBulkResponse
  >
>;
type AdminReusableSectionsMethodReturnsContract = Assert<
  Equal<
    AwaitedReturn<BackyClient["adminReusableSections"]>,
    BackyAdminReusableSectionsResponse
  >
>;
type CreateAdminReusableSectionMethodReturnsContract = Assert<
  Equal<
    AwaitedReturn<BackyClient["createAdminReusableSection"]>,
    BackyAdminReusableSectionResponse
  >
>;
type AdminReusableSectionMethodReturnsContract = Assert<
  Equal<
    AwaitedReturn<BackyClient["adminReusableSection"]>,
    BackyAdminReusableSectionResponse
  >
>;
type UpdateAdminReusableSectionMethodReturnsContract = Assert<
  Equal<
    AwaitedReturn<BackyClient["updateAdminReusableSection"]>,
    BackyAdminReusableSectionResponse
  >
>;
type DeleteAdminReusableSectionMethodReturnsContract = Assert<
  Equal<
    AwaitedReturn<BackyClient["deleteAdminReusableSection"]>,
    BackyAdminReusableSectionDeleteResponse
  >
>;
type AdminReusableSectionVersionsMethodReturnsContract = Assert<
  Equal<
    AwaitedReturn<BackyClient["adminReusableSectionVersions"]>,
    BackyAdminReusableSectionVersionsResponse
  >
>;
type RestoreAdminReusableSectionVersionMethodReturnsContract = Assert<
  Equal<
    AwaitedReturn<BackyClient["restoreAdminReusableSectionVersion"]>,
    BackyAdminReusableSectionRestoreResponse
  >
>;
type ExportAdminReusableSectionsMethodReturnsContract = Assert<
  Equal<
    AwaitedReturn<BackyClient["exportAdminReusableSections"]>,
    BackyAdminReusableSectionExportResponse
  >
>;
type ImportAdminReusableSectionsMethodReturnsContract = Assert<
  Equal<
    AwaitedReturn<BackyClient["importAdminReusableSections"]>,
    BackyAdminReusableSectionImportResponse
  >
>;
type AdminReusableSectionInstancesMethodReturnsContract = Assert<
  Equal<
    AwaitedReturn<BackyClient["adminReusableSectionInstances"]>,
    BackyAdminReusableSectionInstancesResponse
  >
>;
type RefreshAdminReusableSectionInstancesMethodReturnsContract = Assert<
  Equal<
    AwaitedReturn<BackyClient["refreshAdminReusableSectionInstances"]>,
    BackyAdminReusableSectionInstancesRefreshResponse
  >
>;
type AdminReusableSectionMetadataMethodReturnsContract = Assert<
  Equal<
    AwaitedReturn<BackyClient["adminReusableSectionMetadata"]>,
    BackyAdminReusableSectionMetadataResponse
  >
>;
type UpdateAdminReusableSectionMetadataMethodReturnsContract = Assert<
  Equal<
    AwaitedReturn<BackyClient["updateAdminReusableSectionMetadata"]>,
    BackyAdminReusableSectionMetadataUpdateResponse
  >
>;
type AdminFormsMethodReturnsContract = Assert<
  Equal<AwaitedReturn<BackyClient["adminForms"]>, BackyAdminFormsResponse>
>;
type CreateAdminFormMethodReturnsContract = Assert<
  Equal<AwaitedReturn<BackyClient["createAdminForm"]>, BackyAdminFormResponse>
>;
type AdminFormMethodReturnsContract = Assert<
  Equal<AwaitedReturn<BackyClient["adminForm"]>, BackyAdminFormResponse>
>;
type UpdateAdminFormMethodReturnsContract = Assert<
  Equal<AwaitedReturn<BackyClient["updateAdminForm"]>, BackyAdminFormResponse>
>;
type DeleteAdminFormMethodReturnsContract = Assert<
  Equal<
    AwaitedReturn<BackyClient["deleteAdminForm"]>,
    BackyAdminFormDeleteResponse
  >
>;
type CloneAdminFormMethodReturnsContract = Assert<
  Equal<AwaitedReturn<BackyClient["cloneAdminForm"]>, BackyAdminFormCloneResponse>
>;
type CreateAdminFormEmbedBlockMethodReturnsContract = Assert<
  Equal<
    AwaitedReturn<BackyClient["createAdminFormEmbedBlock"]>,
    BackyAdminFormEmbedBlockResponse
  >
>;
type FormsAnalyticsMethodReturnsContract = Assert<
  Equal<
    AwaitedReturn<BackyClient["formsAnalytics"]>,
    BackyAdminFormsAnalyticsResponse
  >
>;
type FormContactSegmentsMethodReturnsContract = Assert<
  Equal<
    AwaitedReturn<BackyClient["formContactSegments"]>,
    BackyAdminFormContactSegmentsResponse
  >
>;
type FormContactListsMethodReturnsContract = Assert<
  Equal<
    AwaitedReturn<BackyClient["formContactLists"]>,
    BackyAdminFormContactListsResponse
  >
>;
type SaveFormContactListMethodReturnsContract = Assert<
  Equal<
    AwaitedReturn<BackyClient["saveFormContactList"]>,
    BackyAdminFormContactListMutationResponse
  >
>;
type DeleteFormContactListMethodReturnsContract = Assert<
  Equal<
    AwaitedReturn<BackyClient["deleteFormContactList"]>,
    BackyAdminFormContactListMutationResponse
  >
>;
type FormSubmissionsMethodReturnsContract = Assert<
  Equal<
    AwaitedReturn<BackyClient["formSubmissions"]>,
    BackyAdminFormSubmissionsResponse
  >
>;
type FormSubmissionMethodReturnsContract = Assert<
  Equal<
    AwaitedReturn<BackyClient["formSubmission"]>,
    BackyAdminFormSubmissionResponse
  >
>;
type UpdateFormSubmissionMethodReturnsContract = Assert<
  Equal<
    AwaitedReturn<BackyClient["updateFormSubmission"]>,
    BackyAdminFormSubmissionResponse
  >
>;
type ReviewFormSubmissionMethodReturnsContract = Assert<
  Equal<
    AwaitedReturn<BackyClient["reviewFormSubmission"]>,
    BackyAdminFormSubmissionResponse
  >
>;
type RetryFormSubmissionWebhookMethodReturnsContract = Assert<
  Equal<
    AwaitedReturn<BackyClient["retryFormSubmissionWebhook"]>,
    BackyAdminFormDeliveryRetryResponse
  >
>;
type RetryFormSubmissionEmailMethodReturnsContract = Assert<
  Equal<
    AwaitedReturn<BackyClient["retryFormSubmissionEmail"]>,
    BackyAdminFormDeliveryRetryResponse
  >
>;
type ApplyAdminFormConsentRetentionMethodReturnsContract = Assert<
  Equal<
    AwaitedReturn<BackyClient["applyAdminFormConsentRetention"]>,
    BackyAdminFormConsentRetentionResponse
  >
>;
type ApplyAdminFormsConsentRetentionMethodReturnsContract = Assert<
  Equal<
    AwaitedReturn<BackyClient["applyAdminFormsConsentRetention"]>,
    BackyAdminFormsConsentRetentionResponse
  >
>;
type FormContactsMethodReturnsContract = Assert<
  Equal<AwaitedReturn<BackyClient["formContacts"]>, BackyAdminFormContactsResponse>
>;
type CreateFormContactMethodReturnsContract = Assert<
  Equal<
    AwaitedReturn<BackyClient["createFormContact"]>,
    BackyAdminFormContactResponse
  >
>;
type ImportFormContactsCsvMethodReturnsContract = Assert<
  Equal<
    AwaitedReturn<BackyClient["importFormContactsCsv"]>,
    BackyAdminFormContactImportResponse
  >
>;
type UpdateFormContactMethodReturnsContract = Assert<
  Equal<
    AwaitedReturn<BackyClient["updateFormContact"]>,
    BackyAdminFormContactResponse
  >
>;
type PromoteFormContactToUserMethodReturnsContract = Assert<
  Equal<
    AwaitedReturn<BackyClient["promoteFormContactToUser"]>,
    BackyAdminFormContactUserPromotionResponse
  >
>;
type PromoteFormContactToCustomerMethodReturnsContract = Assert<
  Equal<
    AwaitedReturn<BackyClient["promoteFormContactToCustomer"]>,
    BackyAdminFormContactCustomerPromotionResponse
  >
>;
type SyncFormContactsMethodReturnsContract = Assert<
  Equal<
    AwaitedReturn<BackyClient["syncFormContacts"]>,
    BackyAdminFormContactSyncResponse
  >
>;
type ApplyFormContactConsentRetentionMethodReturnsContract = Assert<
  Equal<
    AwaitedReturn<BackyClient["applyFormContactConsentRetention"]>,
    BackyAdminFormContactConsentRetentionResponse
  >
>;
type DeleteFormContactMethodReturnsContract = Assert<
  Equal<
    AwaitedReturn<BackyClient["deleteFormContact"]>,
    BackyAdminFormContactDeleteResponse
  >
>;
type CommerceOrderAnalyticsMethodReturnsContract = Assert<
  Equal<
    AwaitedReturn<BackyClient["commerceOrderAnalytics"]>,
    BackyCommerceOrderAnalyticsResponse
  >
>;
type CommerceOrderStatusHandoffMethodReturnsContract = Assert<
  Equal<
    AwaitedReturn<BackyClient["commerceOrderStatusHandoff"]>,
    BackyCommerceOrderStatusHandoffResponse
  >
>;
type CommerceOrderPublicStatusHandoffMethodReturnsContract = Assert<
  Equal<
    AwaitedReturn<BackyClient["commerceOrderPublicStatusHandoff"]>,
    BackyCommerceOrderStatusHandoffResponse
  >
>;
type CommerceOrderStatusAccessGeneratedContract = Assert<
  Equal<
    BackyCommerceOrderStatusAccess,
    GeneratedBackyOpenApiCommerceOrderStatusAccess & Record<string, unknown>
  >
>;
type CommerceProductProviderSyncMethodReturnsContract = Assert<
  Equal<
    AwaitedReturn<BackyClient["commerceProductProviderSync"]>,
    BackyCommerceProductProviderSyncResponse
  >
>;
type SyncCommerceProductProviderMethodReturnsContract = Assert<
  Equal<
    AwaitedReturn<BackyClient["syncCommerceProductProvider"]>,
    BackyCommerceProductProviderSyncResponse
  >
>;
type CommerceOrderQuoteMethodReturnsContract = Assert<
  Equal<
    AwaitedReturn<BackyClient["commerceOrderQuote"]>,
    BackyCommerceOrderQuoteResponse
  >
>;
type RefreshCommerceOrderQuoteMethodReturnsContract = Assert<
  Equal<
    AwaitedReturn<BackyClient["refreshCommerceOrderQuote"]>,
    BackyCommerceOrderQuoteResponse
  >
>;
type CommerceOrderTrackingMethodReturnsContract = Assert<
  Equal<
    AwaitedReturn<BackyClient["commerceOrderTracking"]>,
    BackyCommerceOrderTrackingResponse
  >
>;
type RefreshCommerceOrderTrackingMethodReturnsContract = Assert<
  Equal<
    AwaitedReturn<BackyClient["refreshCommerceOrderTracking"]>,
    BackyCommerceOrderTrackingResponse
  >
>;
type CommerceOrderProviderRefundMethodReturnsContract = Assert<
  Equal<
    AwaitedReturn<BackyClient["commerceOrderProviderRefund"]>,
    BackyCommerceOrderProviderRefundResponse
  >
>;
type CreateCommerceOrderProviderRefundMethodReturnsContract = Assert<
  Equal<
    AwaitedReturn<BackyClient["createCommerceOrderProviderRefund"]>,
    BackyCommerceOrderProviderRefundResponse
  >
>;
type RefreshCommerceOrderProviderRefundMethodReturnsContract = Assert<
  Equal<
    AwaitedReturn<BackyClient["refreshCommerceOrderProviderRefund"]>,
    BackyCommerceOrderProviderRefundResponse
  >
>;
type CommerceOrderFulfillmentMethodReturnsContract = Assert<
  Equal<
    AwaitedReturn<BackyClient["commerceOrderFulfillment"]>,
    BackyCommerceOrderFulfillmentResponse
  >
>;
type DispatchCommerceOrderFulfillmentMethodReturnsContract = Assert<
  Equal<
    AwaitedReturn<BackyClient["dispatchCommerceOrderFulfillment"]>,
    BackyCommerceOrderFulfillmentResponse
  >
>;
type CommerceOrderShippingLabelMethodReturnsContract = Assert<
  Equal<
    AwaitedReturn<BackyClient["commerceOrderShippingLabel"]>,
    BackyCommerceOrderShippingLabelResponse
  >
>;
type CreateCommerceOrderShippingLabelMethodReturnsContract = Assert<
  Equal<
    AwaitedReturn<BackyClient["createCommerceOrderShippingLabel"]>,
    BackyCommerceOrderShippingLabelResponse
  >
>;
type VoidCommerceOrderShippingLabelMethodReturnsContract = Assert<
  Equal<
    AwaitedReturn<BackyClient["voidCommerceOrderShippingLabel"]>,
    BackyCommerceOrderShippingLabelResponse
  >
>;
type CommerceProductSubscriptionsMethodReturnsContract = Assert<
  Equal<
    AwaitedReturn<BackyClient["commerceProductSubscriptions"]>,
    BackyCommerceProductSubscriptionsResponse
  >
>;
type RunCommerceProductSubscriptionActionMethodReturnsContract = Assert<
  Equal<
    AwaitedReturn<BackyClient["runCommerceProductSubscriptionAction"]>,
    BackyCommerceProductSubscriptionActionResponse
  >
>;
type RunCommerceReconciliationMethodReturnsContract = Assert<
  Equal<
    AwaitedReturn<BackyClient["runCommerceReconciliation"]>,
    BackyCommerceReconciliationResponse
  >
>;
type ScheduledCommerceReconciliationMethodReturnsContract = Assert<
  Equal<
    AwaitedReturn<BackyClient["scheduledCommerceReconciliation"]>,
    BackyCommerceReconciliationResponse
  >
>;
type CommerceReconciliationReadinessMethodReturnsContract = Assert<
  Equal<
    AwaitedReturn<BackyClient["commerceReconciliationReadiness"]>,
    BackyCommerceReconciliationReadinessResponse
  >
>;
type ScheduledPlatformCommerceReconciliationMethodReturnsContract = Assert<
  Equal<
    AwaitedReturn<BackyClient["scheduledPlatformCommerceReconciliation"]>,
    BackyCommerceReconciliationBatchResponse
  >
>;
type LiveManagedPageUpdateMethodReturnsContract = Assert<
  Equal<
    AwaitedReturn<BackyClient["updateLiveManagedPage"]>,
    BackyLiveManagedPageResponse
  >
>;
type CommerceOrderInputBuilderReturnsContract = Assert<
  Equal<ReturnType<typeof buildBackyCommerceOrderInput>, BackyCommerceOrderInput>
>;
type CollectionRecordWriteInputBuilderReturnsContract = Assert<
  Equal<
    ReturnType<typeof buildBackyCollectionRecordWriteInput>,
    BackyCollectionRecordWriteInput
  >
>;
type FormSubmissionInputBuilderReturnsContract = Assert<
  Equal<ReturnType<typeof buildBackyFormSubmissionInput>, BackyFormSubmissionInput>
>;
type CommentInputBuilderReturnsContract = Assert<
  Equal<ReturnType<typeof buildBackyCommentInput>, BackyCommentInput>
>;
type CommentReportInputBuilderReturnsContract = Assert<
  Equal<ReturnType<typeof buildBackyCommentReportInput>, BackyCommentReportInput>
>;
type MediaBindingInputBuilderReturnsContract = Assert<
  Equal<ReturnType<typeof buildBackyMediaBindingInput>, BackyMediaBindingInput>
>;
type MediaBindingMethodReturnsContract = Assert<
  Equal<AwaitedReturn<BackyClient["bindMedia"]>, BackyMediaBindingResponse>
>;
type MediaSignedUrlInputBuilderReturnsContract = Assert<
  Equal<
    ReturnType<typeof buildBackyMediaSignedUrlInput>,
    BackyMediaSignedUrlInput
  >
>;
type MediaSignedUrlMethodReturnsContract = Assert<
  Equal<
    AwaitedReturn<BackyClient["createMediaSignedUrl"]>,
    BackyMediaSignedUrlResponse
  >
>;
type AdminMediaMethodReturnsContract = Assert<
  Equal<AwaitedReturn<BackyClient["adminMedia"]>, BackyAdminMediaListResponse>
>;
type UploadMediaMethodReturnsContract = Assert<
  Equal<AwaitedReturn<BackyClient["uploadMedia"]>, BackyAdminMediaResponse>
>;
type UpdateAdminMediaMethodReturnsContract = Assert<
  Equal<AwaitedReturn<BackyClient["updateAdminMedia"]>, BackyAdminMediaResponse>
>;
type ReplaceMediaMethodReturnsContract = Assert<
  Equal<AwaitedReturn<BackyClient["replaceMedia"]>, BackyAdminMediaResponse>
>;
type DeleteAdminMediaMethodReturnsContract = Assert<
  Equal<
    AwaitedReturn<BackyClient["deleteAdminMedia"]>,
    BackyAdminMediaDeleteResponse
  >
>;
type AdminMediaFoldersMethodReturnsContract = Assert<
  Equal<
    AwaitedReturn<BackyClient["adminMediaFolders"]>,
    BackyAdminMediaFoldersResponse
  >
>;
type CreateMediaFolderMethodReturnsContract = Assert<
  Equal<
    AwaitedReturn<BackyClient["createMediaFolder"]>,
    BackyAdminMediaFolderResponse
  >
>;
type UpdateMediaFolderMethodReturnsContract = Assert<
  Equal<
    AwaitedReturn<BackyClient["updateMediaFolder"]>,
    BackyAdminMediaFolderResponse
  >
>;
type DeleteMediaFolderMethodReturnsContract = Assert<
  Equal<
    AwaitedReturn<BackyClient["deleteMediaFolder"]>,
    BackyAdminMediaFolderDeleteResponse
  >
>;
type AdminMediaVersionsMethodReturnsContract = Assert<
  Equal<
    AwaitedReturn<BackyClient["adminMediaVersions"]>,
    BackyAdminMediaVersionsResponse
  >
>;
type RestoreMediaVersionMethodReturnsContract = Assert<
  Equal<
    AwaitedReturn<BackyClient["restoreMediaVersion"]>,
    BackyAdminMediaVersionRestoreResponse
  >
>;
type DeleteMediaVersionMethodReturnsContract = Assert<
  Equal<
    AwaitedReturn<BackyClient["deleteMediaVersion"]>,
    BackyAdminMediaVersionDeleteResponse
  >
>;
type PrepareMediaTransformsMethodReturnsContract = Assert<
  Equal<
    AwaitedReturn<BackyClient["prepareMediaTransforms"]>,
    BackyAdminMediaTransformsResponse
  >
>;
type IngestMediaProviderAnalyticsMethodReturnsContract = Assert<
  Equal<
    AwaitedReturn<BackyClient["ingestMediaProviderAnalytics"]>,
    BackyAdminMediaProviderAnalyticsResponse
  >
>;
type InteractiveRuntimeEventInputBuilderReturnsContract = Assert<
  Equal<
    ReturnType<typeof buildBackyInteractiveRuntimeEventInput>,
    BackyInteractiveRuntimeEventInput
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

const componentTypeCreationHints = (
  type: string,
  label: string,
  propsTemplate: Record<string, unknown>,
) => ({
  defaultSize: { width: 320, height: 160 },
  defaultProps: propsTemplate,
  propsTemplate,
  minimalElement: {
    id: `${type}-element`,
    type,
    name: label,
    x: 0,
    y: 0,
    width: 320,
    height: 160,
    props: propsTemplate,
    styles: {},
    responsive: {},
  },
  requiredFields: ["id", "type", "x", "y", "width", "height", "props", "styles", "responsive"],
  writeRule: "Create with minimalElement and mutate advertised paths only.",
});

const componentTypeContractFixture = (
  type: string,
  family: string,
  label: string,
  propPaths: string[],
  propsTemplate: Record<string, unknown>,
  options: {
    supportsChildren?: boolean;
    supportsMediaAssets?: boolean;
    supportsCustomCode?: boolean;
    flowParticipation?: "absolute-layer" | "root-section-flow";
    sharedSiteChrome?: boolean;
    sharedChromeBindings?: string[];
  } = {},
) => ({
  type,
  family,
  label,
  apiReadable: true as const,
  apiWritable: true as const,
  propPaths,
  stylePaths: ["styles.*"],
  responsivePaths: ["responsive.mobile"],
  bindingPaths: ["bindingSlots[]"],
  creationHints: componentTypeCreationHints(type, label, propsTemplate),
  supportsChildren: Boolean(options.supportsChildren),
  supportsMediaAssets: Boolean(options.supportsMediaAssets),
  supportsCustomCode: Boolean(options.supportsCustomCode),
  flowParticipation: options.flowParticipation || "absolute-layer",
  sharedSiteChrome: Boolean(options.sharedSiteChrome),
  sharedChromeBindings: options.sharedChromeBindings || [],
});

const componentTypeContracts = [
  componentTypeContractFixture("heading", "typography", "Heading", ["props.content", "props.level", "props.fontSize", "props.fontWeight", "props.color", "props.lineHeight"], { content: "Heading", level: 2, fontSize: 56, fontWeight: 700, color: "#111827", lineHeight: 1.1 }),
  componentTypeContractFixture("text", "typography", "Text", ["props.content", "props.fontSize", "props.fontWeight", "props.color", "props.lineHeight", "props.textAlign"], { content: "Text", fontSize: 18, fontWeight: 400, color: "#334155", lineHeight: 1.55, textAlign: "left" }),
  componentTypeContractFixture("paragraph", "typography", "Paragraph", ["props.content", "props.fontSize", "props.color", "props.lineHeight", "props.textAlign"], { content: "Paragraph text", fontSize: 18, color: "#334155", lineHeight: 1.65, textAlign: "left" }),
  componentTypeContractFixture("quote", "typography", "Quote", ["props.content", "props.cite", "props.fontSize", "props.color", "props.lineHeight", "props.fontStyle"], { content: "Quote text", cite: "", fontSize: 24, color: "#111827", lineHeight: 1.45, fontStyle: "italic" }),
  componentTypeContractFixture("list", "typography", "List", ["props.items", "props.content", "props.listType", "props.fontSize", "props.color", "props.gap"], { items: ["List item"], content: "", listType: "unordered", fontSize: 18, color: "#334155", gap: 8 }),
  componentTypeContractFixture("button", "typography", "Button", ["props.content", "props.label", "props.href", "props.target", "props.rel", "props.variant", "props.action", "props.fileMediaId", "props.backgroundColor", "props.color", "props.borderRadius", "props.fontSize", "props.fontWeight"], { content: "Button", label: "Button", href: "/", target: "_self", rel: "", variant: "primary", action: "navigate", fileMediaId: "", backgroundColor: "#111827", color: "#ffffff", borderRadius: 8, fontSize: 16, fontWeight: 700 }),
  componentTypeContractFixture("link", "typography", "Link", ["props.content", "props.href", "props.target", "props.rel", "props.download", "props.fileMediaId", "props.color", "props.fontSize", "props.underline"], { content: "Link", href: "/", target: "_self", rel: "", download: false, fileMediaId: "", color: "#2563eb", fontSize: 16, underline: true }),
  componentTypeContractFixture("image", "media", "Image", ["props.src", "props.mediaId", "props.alt", "props.objectFit", "props.focalPoint", "props.caption"], { src: "", mediaId: "", alt: "", objectFit: "cover", focalPoint: { x: 0.5, y: 0.5 }, caption: "" }, { supportsMediaAssets: true }),
  componentTypeContractFixture("video", "media", "Video", ["props.src", "props.mediaId", "props.poster", "props.posterMediaId", "props.controls", "props.autoplay", "props.loop", "props.objectFit"], { src: "", mediaId: "", poster: "", posterMediaId: "", controls: true, autoplay: false, loop: false, objectFit: "cover" }, { supportsMediaAssets: true }),
  componentTypeContractFixture("icon", "media", "Icon", ["props.icon", "props.name", "props.color", "props.size", "props.strokeWidth"], { icon: "sparkles", name: "Icon", color: "#111827", size: 32, strokeWidth: 2 }),
  componentTypeContractFixture("map", "media", "Map", ["props.address", "props.src", "props.zoom", "props.markerLabel", "props.latitude", "props.longitude"], { address: "", src: "", zoom: 12, markerLabel: "", latitude: null, longitude: null }),
  componentTypeContractFixture("container", "layout", "Container", ["props.layout", "props.gap", "props.padding", "props.backgroundColor"], { layout: "vertical", gap: 24, padding: 32, backgroundColor: "transparent" }, { supportsChildren: true }),
  componentTypeContractFixture("section", "layout", "Section", ["props.contentRole", "props.layout", "props.backgroundColor", "props.borderRadius", "props.padding", "props.anchorId"], { contentRole: "section", layout: "vertical", backgroundColor: "#ffffff", borderRadius: 0, padding: 64, anchorId: "" }, { supportsChildren: true, flowParticipation: "root-section-flow" }),
  componentTypeContractFixture("header", "layout", "Header", ["props.chromeRole", "props.position", "props.width", "props.showBrand", "props.navigationBinding", "props.backgroundColor", "props.borderColor", "props.padding"], { chromeRole: "site-header", position: "top", width: "full", showBrand: true, navigationBinding: "site.navigation.primary", backgroundColor: "#ffffff", borderColor: "#e5e7eb", padding: 16 }, { supportsChildren: true, flowParticipation: "root-section-flow", sharedSiteChrome: true, sharedChromeBindings: ["props.chromeRole", "props.navigationBinding", "site.navigation.primary"] }),
  componentTypeContractFixture("footer", "layout", "Footer", ["props.chromeRole", "props.width", "props.showSocial", "props.newsletterBinding", "props.backgroundColor", "props.color", "props.padding"], { chromeRole: "site-footer", width: "full", showSocial: true, newsletterBinding: "site.newsletter", backgroundColor: "#111827", color: "#ffffff", padding: 24 }, { supportsChildren: true, flowParticipation: "root-section-flow", sharedSiteChrome: true, sharedChromeBindings: ["props.chromeRole", "props.newsletterBinding", "site.footer", "site.newsletter"] }),
  componentTypeContractFixture("box", "layout", "Box", ["props.backgroundColor", "props.borderRadius", "props.borderColor", "props.borderStyle", "props.borderWidth", "props.shadow", "props.boxShadow", "props.contentRole"], { backgroundColor: "#ffffff", borderRadius: 8, borderColor: "#d9e2ec", borderStyle: "solid", borderWidth: 1, shadow: "none", boxShadow: "none", contentRole: "box" }, { supportsChildren: true }),
  componentTypeContractFixture("columns", "layout", "Columns", ["props.columns", "props.gap", "props.stackOnMobile", "props.columnWidths"], { columns: 2, gap: 32, stackOnMobile: true, columnWidths: ["1fr", "1fr"] }, { supportsChildren: true }),
  componentTypeContractFixture("spacer", "layout", "Spacer", ["props.size", "props.axis"], { size: 64, axis: "vertical" }),
  componentTypeContractFixture("divider", "layout", "Divider", ["props.orientation", "props.color", "props.borderColor", "props.thickness", "props.style", "props.margin"], { orientation: "horizontal", color: "#d9e2ec", borderColor: "#d9e2ec", thickness: 1, style: "solid", margin: "16px" }),
  componentTypeContractFixture("nav", "navigation", "Navigation", ["props.items", "props.navItems", "props.navigationSource", "props.navigationBinding", "props.chromeRole", "props.backgroundColor", "props.color", "props.padding", "props.direction", "props.gap", "props.ariaLabel"], { items: [{ label: "Home", href: "/" }], navItems: ["Home"], navigationSource: "site", navigationBinding: "site.navigation.primary", chromeRole: "site.header.navigation", backgroundColor: "transparent", color: "#111827", padding: 16, direction: "horizontal", gap: 24, ariaLabel: "Primary navigation" }, { flowParticipation: "root-section-flow", sharedSiteChrome: true, sharedChromeBindings: ["props.items", "props.navItems", "props.navigationSource", "props.navigationBinding", "props.chromeRole", "site.navigation.primary", "site.navigation.footer"] }),
  componentTypeContractFixture("form", "forms", "Form", ["props.formId", "props.formTitle", "props.formName", "props.formDescription", "props.formActive", "props.formAudience", "props.actionUrl", "props.schema", "props.fields", "props.submitLabel", "props.successMessage", "props.newsletterTopicIds", "props.moderationMode", "props.enableHoneypot", "props.enableCaptcha", "props.contactShareEnabled", "props.contactShareNameField", "props.contactShareEmailField", "props.contactSharePhoneField", "props.contactShareNotesField", "props.backgroundColor", "props.borderColor", "props.borderRadius", "props.padding"], { formId: "", formTitle: "Contact form", formName: "contact-form", formDescription: "", formActive: true, formAudience: "public", actionUrl: "", schema: {}, fields: [], submitLabel: "Submit", successMessage: "Thanks, your submission was received.", newsletterTopicIds: [], moderationMode: "manual", enableHoneypot: true, enableCaptcha: false, contactShareEnabled: false, contactShareNameField: "", contactShareEmailField: "email", contactSharePhoneField: "", contactShareNotesField: "", backgroundColor: "#ffffff", borderColor: "#e5e7eb", borderRadius: 8, padding: 18 }, { supportsChildren: true }),
  componentTypeContractFixture("input", "forms", "Input field", ["props.name", "props.label", "props.type", "props.inputType", "props.placeholder", "props.required", "props.value", "props.borderColor", "props.borderRadius"], { name: "field", label: "Field", type: "text", inputType: "text", placeholder: "", required: false, value: "", borderColor: "#d1d5db", borderRadius: 4 }),
  componentTypeContractFixture("textarea", "forms", "Textarea field", ["props.name", "props.label", "props.placeholder", "props.required", "props.rows", "props.value", "props.borderColor", "props.borderRadius"], { name: "message", label: "Message", placeholder: "", required: false, rows: 4, value: "", borderColor: "#d1d5db", borderRadius: 4 }),
  componentTypeContractFixture("select", "forms", "Select field", ["props.name", "props.label", "props.options", "props.placeholder", "props.required", "props.value", "props.borderColor", "props.borderRadius"], { name: "option", label: "Option", options: ["Option 1"], placeholder: "Choose an option", required: false, value: "", borderColor: "#d1d5db", borderRadius: 4 }),
  componentTypeContractFixture("checkbox", "forms", "Checkbox field", ["props.name", "props.label", "props.options", "props.required", "props.value"], { name: "choices", label: "Choices", options: ["Option 1"], required: false, value: [] }),
  componentTypeContractFixture("radio", "forms", "Radio field", ["props.name", "props.label", "props.options", "props.required", "props.value"], { name: "choice", label: "Choice", options: ["Option 1"], required: false, value: "" }),
  componentTypeContractFixture("repeater", "collections", "Repeater", ["props.collectionId", "props.datasetId", "props.limit", "props.columns", "props.gap", "props.titleField", "props.imageField", "props.descriptionField", "props.emptyMessage"], { collectionId: "", datasetId: "", limit: 6, columns: 3, gap: 16, titleField: "title", imageField: "image", descriptionField: "description", emptyMessage: "No records yet." }, { supportsChildren: true }),
  componentTypeContractFixture("comment", "comments", "Comment block", ["props.resourceType", "props.resourceId", "props.moderationMode", "props.allowReplies", "props.requireName", "props.requireEmail", "props.commentTitle", "props.commentAllowGuests", "props.commentRequireName", "props.commentRequireEmail", "props.commentAllowReplies", "props.commentModerationMode", "props.commentSortOrder"], { resourceType: "page", resourceId: "", moderationMode: "review", allowReplies: true, requireName: true, requireEmail: true, commentTitle: "Comments", commentAllowGuests: true, commentRequireName: true, commentRequireEmail: false, commentAllowReplies: true, commentModerationMode: "manual", commentSortOrder: "newest" }),
  componentTypeContractFixture("embed", "embeds", "Embed", ["props.src", "props.html", "props.allowedHosts", "props.allow", "props.sandbox", "props.loading", "props.borderRadius"], { src: "", html: "", allowedHosts: [], allow: "", sandbox: "allow-scripts allow-same-origin", loading: "lazy", borderRadius: 8 }),
  componentTypeContractFixture("html", "custom-code", "HTML block", ["props.html", "props.title", "props.sandbox", "props.allowedHosts", "props.backgroundColor", "props.borderRadius"], { html: "<div>Custom HTML</div>", title: "Custom HTML preview", sandbox: "allow-scripts", allowedHosts: [], backgroundColor: "#ffffff", borderRadius: 8 }, { supportsCustomCode: true }),
  componentTypeContractFixture("table", "custom-code", "Table", ["props.html", "props.title", "props.rows", "props.columns", "props.caption", "props.backgroundColor", "props.borderRadius"], { html: "", title: "Table preview", rows: [["Header", "Value"]], columns: ["Header", "Value"], caption: "", backgroundColor: "#ffffff", borderRadius: 8 }),
  componentTypeContractFixture("interactiveFigure", "interactive-components", "Interactive figure", ["props.registryId", "props.runtimeUrl", "props.config", "props.datasetId", "props.sandbox", "props.componentKey", "props.version", "props.title", "props.fallbackText", "props.fallback", "props.controls", "props.renderCapabilities", "props.series", "props.steps"], { registryId: "", runtimeUrl: "", config: {}, datasetId: "", sandbox: "allow-scripts allow-same-origin", componentKey: "backy.figure.custom", version: "1.0.0", title: "Interactive figure", fallbackText: "Static fallback for this interactive figure.", fallback: {}, controls: [], renderCapabilities: {}, series: [], steps: [] }, { supportsCustomCode: true }),
  componentTypeContractFixture("codeBlock", "custom-code", "Code snippet", ["props.code", "props.language", "props.filename", "props.caption", "props.showLineNumbers", "props.wrapLines", "props.copyEnabled", "props.highlightTheme", "props.backgroundColor", "props.color"], { code: "", language: "text", filename: "", caption: "", showLineNumbers: true, wrapLines: false, copyEnabled: true, highlightTheme: "dark", backgroundColor: "#0f172a", color: "#e2e8f0" }),
  componentTypeContractFixture("codeComponent", "custom-code", "Code component", ["props.code", "props.html", "props.css", "props.js", "props.sandbox", "props.allowedHosts", "props.config", "props.componentKey", "props.version", "props.title", "props.sandboxUrl", "props.fallbackText", "props.fallback", "props.controls", "props.renderCapabilities"], { code: "", html: "", css: "", js: "", sandbox: "allow-scripts", allowedHosts: [], config: {}, componentKey: "backy.custom.sandboxed", version: "1.0.0", title: "Sandboxed component", sandboxUrl: "", fallbackText: "This custom component needs a configured sandbox runtime to hydrate.", fallback: {}, controls: [], renderCapabilities: {} }, { supportsCustomCode: true }),
];

const componentApiFieldPaths = [
  "element.id",
  "element.type",
  "element.name",
  "element.parentId",
  "element.x",
  "element.y",
  "element.width",
  "element.height",
  "element.rotation",
  "element.zIndex",
  "element.visible",
  "element.locked",
  "element.props",
  "element.componentKey",
  "element.version",
  "element.controls",
  "element.fallback",
  "element.renderCapabilities",
  "element.styles",
  "element.responsive",
  "element.tokenRefs",
  "element.assetIds",
  "element.animation",
  "element.actions",
  "element.dataBindings",
  "element.bindingSlots",
  "element.accessibility",
  "element.permissions",
  "element.metadata",
  "element.children[]",
  "content.contentDocument.nodes",
  "content.editableMap",
  "meta.frontendDesignEditableMap",
];

const componentApiFamilies = [
  "layout",
  "typography",
  "media",
  "forms",
  "commerce",
  "collections",
  "navigation",
  "comments",
  "embeds",
  "interactive-components",
  "custom-code",
];

const componentApiAbsoluteLayerTypes = componentTypeContracts
  .map((contract) => contract.type)
  .filter((type) => !["section", "header", "footer", "nav"].includes(type));

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

const sdkSiteFrontendDatabaseCertification = {
  ...frontendDatabaseCertification,
  generatedAt: "2026-05-22T00:00:00.000Z",
  source: "admin-site-settings-api",
} satisfies GeneratedBackyOpenApiFrontendDatabaseCertificationHandoff;

const sdkAdminFrontendDatabaseCertification = {
  ...frontendDatabaseCertification,
  generatedAt: "2026-05-22T00:00:00.000Z",
  source: "admin-settings-api",
} satisfies GeneratedBackyOpenApiFrontendDatabaseCertificationHandoff;

const sdkAdminSite = {
  id: "site_demo",
  slug: "demo",
  name: "Demo Site",
  description: "A Backy-powered site",
  customDomain: "demo.example.test",
  status: "draft",
  isPublished: false,
  teamId: "team_demo",
  settings: {
    localization: {
      defaultLocale: "en",
    },
  },
  theme: {
    colors: {
      primary: "#2563eb",
    },
  },
  updatedAt: "2026-05-21T00:00:00.000Z",
};

const sdkAdminSitesEnvelope = {
  success: true,
  requestId: "req_admin_sites",
  data: {
    sites: [sdkAdminSite],
    pagination: {
      total: 1,
      limit: 1,
      offset: 0,
      hasMore: false,
    },
  },
} satisfies BackyAdminSitesResponse;

const sdkAdminSiteEnvelope = {
  success: true,
  requestId: "req_admin_site",
  data: {
    site: sdkAdminSite,
    cacheInvalidation: {
      scope: "discovery",
    },
  },
} satisfies BackyAdminSiteResponse;

const sdkAdminSiteDeleteEnvelope = {
  success: true,
  requestId: "req_admin_site_delete",
  data: {
    deleted: true,
    siteId: "site_demo",
  },
} satisfies BackyAdminSiteDeleteResponse;

const sdkAdminSiteReadinessEnvelope = {
  success: true,
  requestId: "req_admin_site_readiness",
  data: {
    readiness: {
      id: "site_demo",
      status: "attention",
      checks: [],
    },
  },
} satisfies BackyAdminSiteReadinessResponse;

const sdkAdminSiteDuplicateEnvelope = {
  success: true,
  requestId: "req_admin_site_duplicate",
  data: {
    site: {
      ...sdkAdminSite,
      id: "site_demo_copy",
      slug: "demo-copy",
      name: "Demo Site Copy",
    },
    pagesCopied: 3,
  },
} satisfies BackyAdminSiteDuplicateResponse;

const sdkAdminFrontendDesign = {
  schemaVersion: "backy.frontend-design.v1",
  status: "captured",
  source: {
    type: "custom-frontend",
    label: "Marketing frontend",
    capturedAt: "2026-05-21T00:00:00.000Z",
  },
  tokens: {
    colors: {
      primary: "#2563eb",
    },
  },
  chrome: {
    header: {
      variant: "centered",
    },
  },
  templates: [
    {
      id: "template_home",
      type: "page",
      name: "Homepage",
      routePattern: "/",
      version: "1.0.0",
      status: "active",
      updatedAt: "2026-05-21T00:00:00.000Z",
      content: {
        elements: [
          {
            id: "hero_title",
            type: "heading",
            props: {
              content: "Launch",
            },
          },
        ],
      },
      bindingHints: [
        {
          role: "hero.title",
          binding: "page.title",
        },
      ],
    },
  ],
  editableMap: [
    {
      elementId: "hero_title",
      role: "hero.title",
      binding: "page.title",
      fields: ["props.content"],
    },
  ],
  updatedAt: "2026-05-21T00:00:00.000Z",
};

const sdkTemplateRegistryEntry = {
  id: "template_home",
  type: "page",
  name: "Homepage",
  description: null,
  routePattern: "/",
  status: "active",
  source: "frontend-design",
  version: "1.0.0",
  createdAt: null,
  updatedAt: "2026-05-21T00:00:00.000Z",
  versioning: {
    schemaVersion: "backy.template-version.v1",
    ready: true,
    status: "active",
    version: "1.0.0",
    createdAt: null,
    updatedAt: "2026-05-21T00:00:00.000Z",
    issues: [],
    recommendation:
      "Template is ready for version-aware cloning and custom frontend handoff.",
  },
  contentSummary: {
    hasContent: true,
    elementCount: 1,
    fieldCount: 0,
    bindingHintCount: 1,
    hasCanvas: false,
    canvasSize: null,
  },
  clone: {
    method: "POST",
    endpoint: "/api/admin/sites/site_demo/pages",
    body: {
      frontendDesignTemplateId: "template_home",
      title: "Homepage",
    },
  },
};

const sdkTemplateRegistrySummary = {
  schemaVersion: "backy.template-registry.v1",
  status: "captured",
  templateCount: 1,
  supportedTypes: ["page", "blogPost", "form", "product", "collection", "section"],
  cloneField: "frontendDesignTemplateId",
  cloneTargets: {
    page: "/api/admin/sites/site_demo/pages",
    blogPost: "/api/admin/sites/site_demo/blog",
    form: "/api/admin/sites/site_demo/forms",
    section: "/api/admin/sites/site_demo/reusable-sections",
    collection: "/api/admin/sites/site_demo/collections",
    product: "/api/admin/sites/site_demo/collections/products/records",
  },
  versionSummary: {
    schemaVersion: "backy.template-version-readiness.v1",
    ready: true,
    readyCount: 1,
    templateCount: 1,
    missingVersionCount: 0,
    missingUpdatedAtCount: 0,
    inactiveCount: 0,
    latestUpdatedAt: "2026-05-21T00:00:00.000Z",
  },
  actionPlan: {
    schemaVersion: "backy.template-registry-action-plan.v1",
    status: "ready",
    recommendedNextAction:
      "Use clone targets to create version-aware pages, posts, forms, products, collections, and sections.",
    steps: [
      "Use frontendDesignTemplateId in clone bodies so custom frontends can preserve template provenance.",
    ],
  },
};

const sdkAdminFrontendDesignEnvelope = {
  success: true,
  requestId: "req_admin_frontend_design",
  data: {
    site: {
      id: "site_demo",
      slug: "demo",
      name: "Demo Site",
      customDomain: null,
    },
    frontendDesign: sdkAdminFrontendDesign,
    endpoints: {
      admin: "/api/admin/sites/site_demo/frontend-design",
      templates: "/api/admin/sites/site_demo/templates",
      publicManifest: "/api/sites/site_demo/manifest",
    },
    templateRegistry: sdkTemplateRegistrySummary,
    nextSteps: [
      "Use the templates endpoint to list clone-ready page, blog, form, product, collection, and section templates.",
    ],
  },
} satisfies BackyAdminFrontendDesignResponse;

const sdkAdminTemplateRegistryEnvelope = {
  success: true,
  requestId: "req_admin_templates",
  data: {
    site: {
      id: "site_demo",
      slug: "demo",
      name: "Demo Site",
    },
    registry: {
      ...sdkTemplateRegistrySummary,
      source: sdkAdminFrontendDesign.source,
      totalTemplateCount: 1,
      templates: [sdkTemplateRegistryEntry],
      byType: {
        page: [sdkTemplateRegistryEntry],
        blogPost: [],
        form: [],
        product: [],
        collection: [],
        section: [],
      },
    },
    templates: [sdkTemplateRegistryEntry],
    byType: {
      page: [sdkTemplateRegistryEntry],
      blogPost: [],
      form: [],
      product: [],
      collection: [],
      section: [],
    },
    endpoints: {
      frontendDesign: "/api/admin/sites/site_demo/frontend-design",
      templates: "/api/admin/sites/site_demo/templates",
    },
  },
} satisfies BackyAdminTemplateRegistryResponse;

const sdkAdminCollectionBindingPresetsEnvelope = {
  success: true,
  requestId: "req_admin_collection_binding_presets",
  data: {
    site: {
      id: "site_demo",
      slug: "demo",
      name: "Demo Site",
    },
    presets: [
      {
        id: "binding-preset-title",
        name: "Article title",
        collectionId: "collection_articles",
        fieldKey: "title",
        targetPath: "props.content",
        sourcePath: "title",
        search: "launch",
        filterField: "status",
        filterValue: "published",
        sortBy: "publishedAt",
        sortDirection: "desc",
        limit: "10",
        offset: "0",
        createdAt: "2026-05-21T00:00:00.000Z",
        updatedAt: "2026-05-21T00:00:00.000Z",
        createdBy: "user-admin",
        updatedBy: "user-admin",
      },
    ],
  },
} satisfies BackyAdminCollectionBindingPresetsResponse;

const sdkAdminInteractiveComponent = {
  id: "component_rounds",
  siteId: "site_demo",
  componentKey: "backy.figure.rounds",
  displayName: "Communication Rounds",
  type: "interactiveFigure",
  status: "active",
  reviewStatus: "approved",
  version: "1.0.0",
  renderMode: "trusted-component",
  source: "registry",
  description: "Step-through communication round diagram.",
  allowedDataScopes: ["content"],
  requiredFields: ["rounds"],
  controls: [
    {
      key: "rounds",
      label: "Rounds",
      type: "number",
    },
  ],
  fallback: {
    required: true,
    supported: ["image", "text"],
  },
  security: {
    adminApiAccess: false,
    parentDomAccess: false,
    parentCookieAccess: false,
    secretsInPayload: false,
  },
  integrity: {
    signed: true,
    signatureRequiredForCustomCode: true,
  },
  runtime: {
    postMessageProtocol: "backy.interactive-component.v1",
  },
  dependencyMetadata: {
    policy: "trusted-registry",
  },
  ownerId: null,
  createdAt: "2026-05-21T00:00:00.000Z",
  updatedAt: "2026-05-21T00:00:00.000Z",
} satisfies BackyAdminInteractiveComponent;

const sdkAdminInteractiveComponentsEnvelope = {
  success: true,
  requestId: "req_admin_interactive_components",
  data: {
    components: [sdkAdminInteractiveComponent],
    pagination: {
      total: 1,
      limit: 100,
      offset: 0,
      hasMore: false,
    },
  },
} satisfies BackyAdminInteractiveComponentsResponse;

const sdkAdminInteractiveComponentEnvelope = {
  success: true,
  requestId: "req_admin_interactive_component",
  data: {
    component: sdkAdminInteractiveComponent,
  },
} satisfies BackyAdminInteractiveComponentResponse;

const sdkAdminInteractiveComponentDeleteEnvelope = {
  success: true,
  requestId: "req_admin_interactive_component_delete",
  data: {
    deleted: true,
    componentId: sdkAdminInteractiveComponent.id,
  },
} satisfies BackyAdminInteractiveComponentDeleteResponse;

const sdkAdminInteractiveComponentUsageEnvelope = {
  success: true,
  requestId: "req_admin_interactive_component_usage",
  data: {
    componentKey: sdkAdminInteractiveComponent.componentKey,
    version: sdkAdminInteractiveComponent.version,
    usage: [
      {
        targetType: "page",
        targetId: "page_home",
        title: "Home",
        slug: "home",
        status: "published",
        elementId: "figure_rounds",
        elementType: "interactiveFigure",
        elementPath: "elements[0]",
        version: "1.0.0",
        renderMode: "trusted-component",
        fallbackConfigured: true,
        updatedAt: "2026-05-21T00:00:00.000Z",
      },
    ],
    summary: {
      total: 1,
      pages: 1,
      posts: 0,
      scanned: {
        pages: 3,
        posts: 2,
      },
    },
  },
} satisfies BackyAdminInteractiveComponentUsageResponse;

const sdkAdminInteractiveComponentExportEnvelope = {
  success: true,
  requestId: "req_admin_interactive_component_export",
  data: {
    component: sdkAdminInteractiveComponent,
    exportPackage: {
      schemaVersion: "backy.interactive-component-export.v1",
      component: sdkAdminInteractiveComponent,
      usageInventoryEndpoint:
        "/api/admin/sites/site_demo/interactive-components/backy.figure.rounds/1.0.0/usage",
    },
  },
} satisfies BackyAdminInteractiveComponentExportResponse;

const sdkAdminInteractiveComponentReviewEnvelope = {
  success: true,
  requestId: "req_admin_interactive_component_review",
  data: {
    action: "approve",
    component: sdkAdminInteractiveComponent,
  },
} satisfies BackyAdminInteractiveComponentReviewResponse;

const sdkAdminInteractiveComponentBundleEnvelope = {
  success: true,
  requestId: "req_admin_interactive_component_bundle",
  data: {
    component: sdkAdminInteractiveComponent,
    bundle: {
      schemaVersion: "backy.interactive-component-bundle.v1",
      filename: "index.js",
      contentType: "application/javascript",
      sizeBytes: 512,
      storageProvider: "local",
      storagePath:
        "sites/site_demo/interactive-components/backy.figure.rounds/1.0.0/index.js",
      bundleUrl:
        "/media/sites/site_demo/interactive-components/backy.figure.rounds/1.0.0/index.js",
      sha256:
        "7f83b1657ff1fc53b92dc18148a1d65dfc2d4b1fa3d677284addd200126d9069",
      signed: true,
      signedBy: "user-admin",
      signedAt: "2026-05-21T00:00:00.000Z",
    },
  },
} satisfies BackyAdminInteractiveComponentBundleResponse;

const sdkAdminInteractiveComponentMigrationEnvelope = {
  success: true,
  requestId: "req_admin_interactive_component_migration",
  data: {
    dryRun: true,
    source: {
      componentKey: "backy.figure.rounds",
      version: "1.0.0",
    },
    target: {
      componentKey: "backy.figure.rounds",
      version: "1.1.0",
    },
    migratedTargets: [
      {
        targetType: "page",
        targetId: "page_home",
        title: "Home",
        slug: "home",
        status: "published",
        updatedAt: "2026-05-21T00:00:00.000Z",
        migrated: 1,
        elementPaths: ["elements[0]"],
      },
    ],
    summary: {
      targets: 1,
      elements: 1,
      scanned: {
        pages: 3,
        posts: 2,
      },
    },
  },
} satisfies BackyAdminInteractiveComponentMigrationResponse;

const sdkAdminInteractiveComponentRollbackEnvelope = {
  success: true,
  requestId: "req_admin_interactive_component_rollback",
  data: {
    rolledBack: true,
    restoredFromVersion: "1.0.0",
    component: {
      ...sdkAdminInteractiveComponent,
      version: "1.1.0",
      rollbackFromVersion: "1.0.0",
    },
    disabledVersions: [sdkAdminInteractiveComponent],
  },
} satisfies BackyAdminInteractiveComponentRollbackResponse;

const sdkAdminSettingsProviderCertificationEvidence = {
  schemaVersion: "backy.settings-provider-certification-evidence.v1",
  status: "attention",
  requiredGate:
    "BACKY_SETTINGS_PROVIDER_CERTIFICATION_REQUIRED=1 npm run ci:settings-provider-certification",
  coverage: {
    covered: 4,
    total: 8,
    missing: ["storage-media"],
  },
  scenarios: [
    {
      key: "storage-media",
      label: "Storage and media delivery",
      status: "missing",
      evidenceCount: 0,
      expectedEvidence: ["storage provisioning probe"],
      nextAction: "Run provider certification.",
    },
  ],
  secretHandling:
    "Settings provider certification evidence reports scenario names and counts only; provider credentials and database URLs stay private.",
} satisfies GeneratedBackyOpenApiAdminSettingsProviderCertificationEvidence;

const sdkAdminSettingsProviderCertificationEvidencePacket = {
  schemaVersion: "backy.settings-provider-certification-evidence-packet.v1",
  generatedAt: "2026-05-21T00:00:00.000Z",
  status: "needs-runtime-inputs",
  selectedFamilies: ["storage-media"],
  selectedProviderAliases: {
    storage: "supabase-storage",
  },
  runtimeReadiness: {
    localRuntimeInputsConfigured: false,
    missingInputAliases: ["BACKY_STORAGE_PROVIDER"],
    missingSelectedFamilies: ["storage-media"],
  },
  operatorArtifacts: [
    {
      key: "storage-media",
      family: "Storage and media delivery",
      providerAlias: "Supabase storage",
      status: "needs-runtime-inputs",
      requiredInputs: ["BACKY_STORAGE_PROVIDER"],
      expectedArtifacts: ["storage probe"],
      captureSource: "storage provisioning probe",
      redaction: "No provider secrets.",
    },
  ],
  scenarioAttachments: [
    {
      key: "storage-media",
      label: "Storage and media delivery",
      status: "missing",
      evidenceCount: 0,
      expectedEvidence: ["storage probe"],
      nextAction: "Run provider certification.",
    },
  ],
  commandPreview: {
    command: "npm run ci:settings-provider-certification",
    envTemplate: "BACKY_SETTINGS_PROVIDER_CERTIFICATION_REQUIRED=1\nBACKY_STORAGE_PROVIDER=<provider>",
    requiredAliases: ["BACKY_STORAGE_PROVIDER"],
    targetInputs: [
      "BACKY_SETTINGS_CERTIFICATION_BASE_URL",
      "BACKY_SETTINGS_CERTIFY_SITE_ID",
      "BACKY_COMMERCE_CERTIFY_SITE_ID",
    ],
  },
  target: {
    siteId: "site-demo",
    settingsAdminApi: "/api/admin/settings?certificationSiteId={siteId}",
    siteScopedSettingsApi: "/api/admin/sites/{siteId}/settings",
    settingsApi: "/api/admin/sites/{siteId}/settings",
    settingsSiteSelectorEnv: "BACKY_SETTINGS_CERTIFY_SITE_ID",
    commerceSiteSelectorEnv: "BACKY_COMMERCE_CERTIFY_SITE_ID",
    externalBaseUrl: null,
    publicApiOrigin: null,
  },
  redactionPolicy: {
    includesProviderSecrets: false,
    includesDatabaseUrls: false,
    includesServiceRoleKeys: false,
    includesVercelTokens: false,
    includesNotificationSecrets: false,
    includesCommerceSecrets: false,
    includesCustomerOrOrderPayloads: false,
    allowedEvidence: ["scenario labels", "status counts", "non-secret provider aliases"],
  },
  secretHandling: "Redacted operator attachment manifest only.",
} satisfies GeneratedBackyOpenApiAdminSettingsProviderCertificationEvidencePacket;

const sdkAdminSettingsProviderCertification = {
  generatedAt: "2026-05-21T00:00:00.000Z",
  schemaVersion: "backy.settings-provider-certification-handoff.v1",
  status: "external-live-provider-gate",
  settingsGate: "npm run ci:settings-provider-certification",
  commerceGate: "npm run ci:commerce-provider-certification",
  localPreflight: "npm run test:settings-provider-certification-preflight-contract",
  releasePreflight: "npm run test:release-certification-preflight-contract",
  runtimeEvidence: {
    liveProviderGateRequired: true,
    localRuntimeInputsConfigured: false,
    missingInputAliases: ["BACKY_STORAGE_PROVIDER"],
  },
  scenarioEvidence: sdkAdminSettingsProviderCertificationEvidence,
  operatorEvidencePacket: sdkAdminSettingsProviderCertificationEvidencePacket,
  operatorCommandTemplate: {
    command: "npm run ci:settings-provider-certification",
    envTemplate: "BACKY_SETTINGS_PROVIDER_CERTIFICATION_REQUIRED=1\nBACKY_STORAGE_PROVIDER=<provider>",
    requiredInputAliases: ["BACKY_STORAGE_PROVIDER"],
    targetInputs: ["BACKY_SETTINGS_CERTIFICATION_BASE_URL"],
  },
  operatorEnvTemplate: {
    schemaVersion: "backy.settings-provider-certification-env-template.v1",
    format: "shell-env",
    fileName: ".env.backy-settings-provider-certification",
    body: "BACKY_SETTINGS_PROVIDER_CERTIFICATION_REQUIRED=1\nBACKY_STORAGE_PROVIDER=<provider>",
    secretHandling:
      "Generated template values are non-secret aliases and placeholders.",
  },
  groups: [
    {
      family: "storage-media",
      providers: ["supabase-storage", "s3", "r2"],
      gate: "npm run ci:settings-provider-certification",
      requiredInputs: ["BACKY_STORAGE_PROVIDER"],
      evidence: "storage provisioning and delivery probe",
    },
  ],
  secretHandling:
    "Provider credentials, database URLs, service-role keys, Vercel tokens, notification secrets, commerce secrets, and customer/order payloads are never returned.",
} satisfies GeneratedBackyOpenApiAdminSettingsProviderCertification;

const sdkAdminSettingsUpdateRequest = {
  deliveryMode: "custom-frontend",
  storage: {
    provider: "supabase-storage",
  },
} satisfies GeneratedBackyOpenApiAdminSettingsUpdateRequest;

const sdkAdminSettingsActionRequest = {
  action: "media-storage-secret-manager",
  mode: "plan",
  dryRun: true,
  targetEnvironments: ["preview"],
} satisfies GeneratedBackyOpenApiAdminSettingsActionRequest;

const sdkAdminCompletionStatus = {
  schemaVersion: "backy.completion-status.v1",
  status: "external-gates-required",
  audit: {
    source: "specs/page-completion-audit/backy-page-surface-audit.md",
    ready: 41,
    partial: 4,
    prototype: 0,
    missing: 0,
    total: 45,
    readyPercent: 91,
  },
  surfaces: [],
  surfaceRunbooks: [],
  gates: [],
  nextAction: "Run the Settings provider gate and attach the redacted evidence packet.",
  recommendedCommands: ["npm run ci:settings-provider-certification"],
  localPreflight: "npm run test:partial-gate-preflights",
  privacy: {
    includesSecretValues: false,
    exposesOnlyAliasPresence: true,
    secretHandling:
      "Completion status exposes only alias-presence booleans, provider-family names, workflow paths, and evidence schema names; never raw secrets, database URLs, provider tokens, service-role keys, or customer/order payloads.",
  },
} satisfies GeneratedBackyOpenApiBackyCompletionStatus;

const sdkAdminSettings = {
  schemaVersion: "backy.admin-settings.v1",
  scope: {
    workspaceSettingsScope: "global",
    siteSettingsScope: "site",
    siteSettingsEndpointTemplate: "/api/admin/sites/:siteId/settings",
  },
  endpoints: {
    workspaceSettings: "/api/admin/settings",
    siteSettings: "/api/admin/sites/:siteId/settings",
  },
  deliveryMode: sdkAdminSettingsUpdateRequest.deliveryMode,
  apiKeys: {
    publicApiKey: "pk_demo",
    adminApiKey: "",
  },
  storage: sdkAdminSettingsUpdateRequest.storage,
  auth: {
    providers: ["password"],
  },
  integrations: {
    vercel: false,
  },
  runtimeStorage: {
    provider: "supabase-storage",
    configured: false,
  },
  runtimeDatabase: {
    mode: "database",
    provider: "postgres",
  },
  runtimeSupabase: {
    configured: false,
  },
  runtimeMediaScanner: {
    configured: false,
  },
  runtimeVercel: {
    configured: false,
  },
  runtimeNotifications: {
    configured: false,
  },
  runtimeCommerce: {
    configured: false,
  },
  runtimeInteractiveComponents: {
    configured: true,
  },
  runtimePublicApi: {
    corsConfigured: false,
  },
  completionStatus: sdkAdminCompletionStatus,
  mediaStorageHandoff: {
    generatedAt: "2026-05-22T00:00:00.000Z",
    schemaVersion: "backy.media-storage-handoff.v1",
    status: "needs-runtime-env",
    provider: {
      selected: "supabase",
      bucket: "media",
      publicBaseUrl: "https://project.supabase.co/storage/v1/object/public/media",
      pathPrefix: "sites/{siteId}",
      runtime: {
        provider: "supabase",
        configured: false,
      },
      supabase: {
        configured: false,
      },
    },
    policies: {
      privateFilesEnabled: true,
      imageTransformsEnabled: true,
      maxFileSizeMb: 128,
      workspaceStorageLimitGb: 512,
      warningThresholdPercent: 85,
      allowedFileTypes: "image/*,font/*,application/pdf",
    },
    endpointTemplates: {
      adminMediaList: "/api/admin/sites/{siteId}/media",
      adminMediaUpload: "/api/admin/sites/{siteId}/media",
      adminSignedUrl: "/api/admin/sites/{siteId}/media/{mediaId}/signed-url",
      publicMediaList: "/api/sites/{siteId}/media",
      publicMediaFolders: "/api/sites/{siteId}/media/folders",
      publicFontManifest: "/api/sites/{siteId}/media/fonts",
      publicMediaDetail: "/api/sites/{siteId}/media/{mediaId}",
      publicMediaFile: "/api/sites/{siteId}/media/{mediaId}/file",
      publicMediaTransform: "/api/sites/{siteId}/media/{mediaId}/transform",
    },
    contracts: {
      organization: "backy.media.organization.v1",
      references: "backy.media.references.v1",
      editableMetadata: "backy.media.editable-metadata.v1",
      deliveryPolicy: "MediaDeliveryPolicy",
      fileCategories: "backy.media-file-categories.v1",
    },
    designStateUsage: {
      preservedFields: ["frontendDesignAssets", "element.props.mediaOrganization"],
      editableSurfaces: ["pages", "blog", "products"],
      customFrontendUses: ["image picker", "private signed delivery"],
    },
    runtimeGate: {
      certificationCommand: "npm run ci:settings-provider-certification",
      sourceOnlyGuard: "BACKY_SETTINGS_SOURCE_ONLY=1 npm run test:settings --workspace @backy-cms/admin",
      missingRuntimeAliases: ["BACKY_STORAGE_PROVIDER or BACKY_MEDIA_STORAGE_PROVIDER"],
    },
    privacy: {
      includesSecretValues: false,
      exposesSecretReferencesOnly: true,
      secretReferences: {
        supabaseServiceRole: "env:BACKY_SUPABASE_SERVICE_ROLE_KEY",
      },
      excludes: ["raw provider credentials", "signed URL tokens"],
    },
  } satisfies GeneratedBackyOpenApiAdminSettingsMediaStorageHandoff,
  themeDesignImpact: {
    generatedAt: "2026-05-22T00:00:00.000Z",
    schemaVersion: "backy.settings-theme-design-impact.v1",
    status: "ready",
    source: "admin-settings-api",
    themeContract: {
      schemaVersion: "backy.theme.v1",
      colors: {
        primary: "#0f766e",
        secondary: "#2563eb",
        background: "#ffffff",
        surface: "#f8fafc",
        text: "#0f172a",
        mutedText: "#64748b",
      },
      typography: {
        heading: "inter",
        body: "inter",
        mono: "jetbrains-mono",
        baseFontSize: 16,
      },
      layout: {
        radius: 8,
        spacingUnit: 4,
      },
      motion: {
        preset: "subtle",
      },
      cssVariables: {
        "--backy-color-primary": "#0f766e",
        "--backy-motion-preset": "subtle",
      },
    },
    impact: {
      colorTokenCount: 6,
      typographyTokenCount: 4,
      cssVariableCount: 12,
      invalidControlCount: 0,
      invalidControls: [],
    },
    motion: {
      preset: "subtle",
      bindingPaths: [
        "content.themeTokenRefs.motion",
        "element.animation.tokenRefs.duration",
        "element.animation.tokenRefs.easing",
      ],
      animationStateFields: [
        "content.animations[]",
        "element.animation",
        "element.animation.scrollTrigger",
      ],
    },
    designStatePersistence: {
      tokenSchemaVersion: "backy.theme.v1",
      tokenRefPaths: [
        "content.themeTokenRefs",
        "content.contentDocument.themeTokenRefs",
        "element.tokenRefs",
        "document.themeTokenRefs",
      ],
      editableSurfaces: ["pages", "blog", "reusable sections", "products"],
      preservedDesignFields: [
        "content.elements",
        "content.contentDocument",
        "content.animations",
        "content.themeTokenRefs",
      ],
    },
    frontendBindings: {
      publicManifestThemeModule: "/api/sites/{siteId}/manifest#data.modules.theme",
      publicOpenApiThemeSchema: "/api/sites/{siteId}/openapi#/components/schemas/BackyThemeTokens",
      adminSettingsApi: "/api/admin/settings#data.settings.themeDesignImpact",
      settingsHandoffPath: "settingsHandoff.themeDesignImpact",
      cssVariableSelector: ":root, [data-backy-theme]",
    },
    privacy: {
      includesSecretValues: false,
      includesAdminApiKeys: false,
      includesProviderCredentials: false,
      includesPrivateContent: false,
      note: "Theme design impact only exports non-secret design tokens, token reference paths, and editable design-state field names.",
    },
  } satisfies GeneratedBackyOpenApiAdminSettingsThemeDesignImpact,
  providerCertification: sdkAdminSettingsProviderCertification,
  frontendDatabaseCertification: sdkAdminFrontendDatabaseCertification,
} satisfies BackyAdminSettings & GeneratedBackyOpenApiAdminSettings;

const sdkAdminSettingsEnvelope = {
  success: true,
  requestId: "req_admin_settings",
  data: {
    settings: sdkAdminSettings,
  },
} satisfies BackyAdminSettingsResponse & GeneratedBackyOpenApiAdminSettingsEnvelope;

const sdkAdminSettingsActionEnvelope = {
  success: true,
  requestId: "req_admin_settings_action",
  data: {
    settings: sdkAdminSettings,
    requestedAction: sdkAdminSettingsActionRequest.action,
    status: "ready",
    summary: "Settings action is typed by the generated OpenAPI contract.",
    operations: [],
    generatedAt: "2026-05-22T00:00:00.000Z",
  },
} satisfies BackyAdminSettingsActionResponse &
  GeneratedBackyOpenApiAdminSettingsActionEnvelope;

const sdkSiteSettings = {
  schemaVersion: "backy.site-settings-scope.v1",
  scope: {
    level: "site",
    siteId: "site_demo",
    siteSlug: "demo",
    teamId: "team_demo",
    workspaceSettingsScope: "global",
    siteSettingsScope: "site",
  },
  siteSettings: {
    localization: {
      defaultLocale: "en",
    },
  },
  workspaceSettings: {
    deliveryMode: "custom-frontend",
  },
  effectiveSettings: {
    workspace: {
      deliveryMode: "custom-frontend",
    },
    site: {
      localization: {
        defaultLocale: "en",
      },
    },
  },
  frontendDatabaseCertification: sdkSiteFrontendDatabaseCertification,
  mediaStorageHandoff: {
    ...sdkAdminSettings.mediaStorageHandoff,
    source: "admin-site-settings-api",
    selectedSiteId: "site_demo",
    siteEndpoints: {
      adminMediaList: "/api/admin/sites/site_demo/media",
      adminMediaUpload: "/api/admin/sites/site_demo/media",
      adminSignedUrl: "/api/admin/sites/site_demo/media/{mediaId}/signed-url",
      publicMediaList: "/api/sites/site_demo/media",
      publicMediaFolders: "/api/sites/site_demo/media/folders",
      publicFontManifest: "/api/sites/site_demo/media/fonts",
      publicMediaDetail: "/api/sites/site_demo/media/{mediaId}",
      publicMediaFile: "/api/sites/site_demo/media/{mediaId}/file",
      publicMediaTransform: "/api/sites/site_demo/media/{mediaId}/transform",
    },
  },
  endpoints: {
    workspaceSettings: "/api/admin/settings",
    siteSettings: "/api/admin/sites/site_demo/settings",
    siteDetail: "/api/admin/sites/site_demo",
  },
} satisfies BackySiteSettingsScope;

const sdkSiteSettingsEnvelope = {
  success: true,
  requestId: "req_site_settings",
  data: {
    settings: sdkSiteSettings,
  },
} satisfies BackySiteSettingsResponse &
  GeneratedBackyOpenApiAdminSiteSettingsEnvelope;

const sdkAdminNavigationEnvelope = {
  success: true,
  requestId: "req_admin_navigation",
  data: {
    site: {
      id: "site_demo",
      slug: "demo",
      name: "Demo Site",
    },
    navigation: {
      settings: {
        primary: [
          {
            id: "nav_docs",
            type: "page",
            pageId: "page_docs",
            label: "Docs",
            children: [
              {
                id: "nav_docs_child",
                type: "route",
                label: "API",
                path: "/docs/api",
              },
            ],
          },
        ],
        footer: [
          {
            id: "nav_terms",
            type: "route",
            label: "Terms",
            path: "/terms",
          },
        ],
        layout: {
          header: "centered",
          footer: "columns",
        },
      },
      resolved: {
        primary: [
          {
            id: "nav_docs",
            type: "page",
            pageId: "page_docs",
            label: "Docs",
            title: "Docs",
            path: "/docs",
            href: "/docs",
            children: [],
          },
        ],
        footer: [],
      },
    },
  },
} satisfies BackyAdminNavigationResponse;

const sdkAdminSeoEnvelope = {
  success: true,
  requestId: "req_admin_seo",
  data: {
    site: {
      id: "site_demo",
      slug: "demo",
      name: "Demo Site",
    },
    seo: {
      titleTemplate: "%s | Demo",
      defaultDescription: "Demo site",
      defaultOgImage: "/media/og.webp",
      favicon: "/favicon.ico",
      jsonLd: [
        {
          "@type": "WebSite",
          name: "Demo Site",
        },
      ],
      sitemap: {
        enabled: true,
        defaultChangeFrequency: "weekly",
        defaultPriority: 0.7,
        includeDynamicRoutes: true,
      },
      robots: {
        index: true,
        follow: true,
        extraRules: "Sitemap: /sitemap.xml",
      },
      routeOverrides: [
        {
          id: "override_docs",
          match: "/docs",
          title: "Docs",
          description: "Backy documentation",
          canonical: "/docs",
          ogImage: "/media/docs.webp",
          keywords: ["docs"],
          jsonLd: [],
          priority: 0.8,
          changeFrequency: "weekly",
          robots: {
            index: true,
            follow: true,
          },
          enabled: true,
        },
      ],
    },
    preview: {
      supportedVariables: ["%s", "{title}", "{siteName}"],
      routes: [
        {
          type: "dynamicList",
          title: "Docs | Demo",
          description: "Demo site",
          canonical: "/docs",
          sourceTitle: "Docs",
          sourceDescription: "",
          variables: {
            title: "Docs",
            siteName: "Demo Site",
          },
        },
      ],
    },
  },
} satisfies BackyAdminSeoResponse;

const sdkAdminRedirectsEnvelope = {
  success: true,
  requestId: "req_admin_redirects",
  data: {
    site: {
      id: "site_demo",
      slug: "demo",
      name: "Demo Site",
    },
    redirects: {
      rules: [
        {
          id: "redirect_old_docs",
          from: "/old-docs",
          to: "/docs",
          statusCode: 301,
          enabled: true,
        },
        {
          id: "gone_retired",
          from: "/retired",
          statusCode: 410,
          enabled: true,
        },
      ],
      conflicts: [
        {
          index: 0,
          ruleId: "redirect_old_docs",
          from: "/old-docs",
          to: "/docs",
          kind: "target-route-missing",
          severity: "warning",
          message: "/old-docs points to /docs, but that route is not indexed yet.",
        },
      ],
      persisted: true,
    },
  },
} satisfies BackyAdminRedirectsResponse;

const sdkAdminUser = {
  id: "user_editor",
  fullName: "Editor User",
  email: "editor@example.com",
  role: "editor",
  status: "active",
  avatarUrl: null,
  createdAt: "2026-05-16T00:00:00.000Z",
  updatedAt: "2026-05-16T00:00:00.000Z",
} satisfies BackyAdminUser;

const sdkAdminUsersEnvelope = {
  success: true,
  requestId: "req_admin_users",
  data: {
    users: [sdkAdminUser],
    pagination: {
      total: 1,
      limit: 20,
      offset: 0,
      hasMore: false,
    },
  },
} satisfies BackyAdminUsersResponse;

const sdkAdminUserEnvelope = {
  success: true,
  requestId: "req_admin_user",
  data: {
    user: sdkAdminUser,
    invite: null,
    inviteDelivery: null,
  },
} satisfies BackyAdminUserResponse;

const sdkAdminUserDeleteEnvelope = {
  success: true,
  requestId: "req_admin_user_delete",
  data: {
    deleted: true,
    userId: sdkAdminUser.id,
  },
} satisfies BackyAdminUserDeleteResponse;

const sdkAdminUserBulkEnvelope = {
  success: true,
  requestId: "req_admin_user_bulk",
  data: {
    action: "updateStatus",
    updated: 1,
    deleted: 0,
    userIds: [sdkAdminUser.id],
    users: [sdkAdminUser],
  },
} satisfies BackyAdminUserBulkResponse;

const sdkAdminUserPermissionsEnvelope = {
  success: true,
  requestId: "req_admin_user_permissions",
  data: {
    user: {
      id: sdkAdminUser.id,
      fullName: sdkAdminUser.fullName,
      email: sdkAdminUser.email,
      role: sdkAdminUser.role,
      status: sdkAdminUser.status,
    },
    permissions: {
      userId: sdkAdminUser.id,
      role: sdkAdminUser.role,
      status: sdkAdminUser.status,
      canSignIn: true,
      summary: {
        allowed: 2,
        total: 3,
        blockedByStatus: false,
      },
      groups: [
        {
          key: "content",
          label: "Content",
          description: "Content permissions",
          permissions: [
            {
              key: "pages.view",
              label: "View pages",
              capability: "view",
              allowed: true,
              source: "role",
              override: null,
              reason: "Allowed by role.",
            },
          ],
        },
      ],
    },
  },
} satisfies BackyAdminUserPermissionsResponse;

const sdkAdminUserMfaEnvelope = {
  success: true,
  requestId: "req_admin_user_mfa",
  data: {
    user: {
      id: sdkAdminUser.id,
      fullName: sdkAdminUser.fullName,
      email: sdkAdminUser.email,
      role: sdkAdminUser.role,
      status: sdkAdminUser.status,
    },
    mfa: {
      enabled: true,
      userId: sdkAdminUser.id,
      email: sdkAdminUser.email,
      recoveryCodesRemaining: 8,
      updatedAt: "2026-05-16T00:00:00.000Z",
    },
    recoveryCodes: ["ABCD-EFGH"],
  },
} satisfies BackyAdminUserMfaResponse;

const sdkAdminUserInviteEnvelope = {
  success: true,
  requestId: "req_admin_user_invite",
  data: {
    invite: {
      id: "invite_editor",
      token: "invite-token",
      userId: sdkAdminUser.id,
      email: sdkAdminUser.email,
      createdAt: "2026-05-16T00:00:00.000Z",
      expiresAt: "2026-05-23T00:00:00.000Z",
      requestedById: "user_owner",
      deliveryConfigured: true,
      inviteUrl: "https://example.com/accept-invite?token=invite-token",
    },
    inviteDelivery: {
      attempted: true,
      provider: "local-outbox",
      status: "queued",
      deliveryConfigured: true,
    },
  },
} satisfies BackyAdminUserInviteResponse;

const sdkAdminUserPasswordResetEnvelope = {
  success: true,
  requestId: "req_admin_user_reset",
  data: {
    reset: {
      id: "reset_editor",
      token: "reset-token",
      userId: sdkAdminUser.id,
      email: sdkAdminUser.email,
      createdAt: "2026-05-16T00:00:00.000Z",
      expiresAt: "2026-05-16T01:00:00.000Z",
      requestedById: "user_owner",
      deliveryConfigured: true,
      resetUrl: "https://example.com/reset-password?token=reset-token",
    },
    resetDelivery: {
      attempted: true,
      provider: "local-outbox",
      status: "queued",
      deliveryConfigured: true,
    },
  },
} satisfies BackyAdminUserPasswordResetResponse;

const sdkAdminUserOwnershipTransferEnvelope = {
  success: true,
  requestId: "req_admin_user_transfer",
  data: {
    transfer: {
      previousOwner: {
        ...sdkAdminUser,
        id: "user_owner",
        email: "owner@example.com",
        role: "admin",
      },
      newOwner: {
        ...sdkAdminUser,
        role: "owner",
      },
    },
    users: [sdkAdminUser],
  },
} satisfies BackyAdminUserOwnershipTransferResponse;

const sdkAdminAuthSessionsEnvelope = {
  success: true,
  requestId: "req_admin_auth_sessions",
  data: {
    sessions: [
      {
        id: "session_editor",
        user: sdkAdminUser,
        issuedAt: "2026-05-16T00:00:00.000Z",
        expiresAt: "2026-05-17T00:00:00.000Z",
        lastSeenAt: "2026-05-16T00:10:00.000Z",
        authMode: "local-demo",
        current: false,
      },
    ],
  },
} satisfies BackyAdminAuthSessionsResponse;

const sdkAdminAuthSessionRevokeEnvelope = {
  success: true,
  requestId: "req_admin_auth_session_revoke",
  data: {
    revoked: true,
  },
} satisfies BackyAdminAuthSessionRevokeResponse;

const sdkAdminUserImportEnvelope = {
  success: true,
  requestId: "req_admin_user_import",
  data: {
    users: [sdkAdminUser],
    import: {
      mode: "create",
      dryRun: true,
      created: 1,
      updated: 0,
      skipped: 0,
      errors: [],
      rollbackAvailable: false,
      rollbackRequestId: null,
    },
  },
} satisfies BackyAdminUserImportResponse;

const sdkAdminUserImportRollbackEnvelope = {
  success: true,
  requestId: "req_admin_user_import_rollback",
  data: {
    rollback: {
      importRequestId: "req_admin_user_import",
      importAction: "user.import",
      deleted: 1,
      restored: 0,
      skipped: [],
      deletedUserIds: [sdkAdminUser.id],
      restoredUserIds: [],
    },
  },
} satisfies BackyAdminUserImportRollbackResponse;

const sdkAdminTeamMember = {
  id: "member_editor",
  teamId: "team_demo",
  userId: sdkAdminUser.id,
  email: sdkAdminUser.email,
  name: sdkAdminUser.fullName,
  avatarUrl: null,
  role: "editor",
  joinedAt: "2026-05-16T00:00:00.000Z",
} satisfies BackyAdminTeamMember;

const sdkAdminTeam = {
  id: "team_demo",
  name: "Demo Team",
  slug: "demo-team",
  ownerId: "user_owner",
  avatarUrl: null,
  createdAt: "2026-05-16T00:00:00.000Z",
  members: [sdkAdminTeamMember],
  plan: "free",
  settings: {
    plan: "free",
  },
  workspace: {
    siteCount: 1,
    publishedSiteCount: 1,
    draftSiteCount: 0,
    archivedSiteCount: 0,
    sites: [
      {
        id: "site_demo",
        name: "Demo Site",
        slug: "demo",
        customDomain: null,
        status: "published",
        updatedAt: "2026-05-16T00:00:00.000Z",
      },
    ],
  },
} satisfies BackyAdminTeam;

const sdkAdminTeamsEnvelope = {
  success: true,
  requestId: "req_admin_teams",
  data: {
    teams: [sdkAdminTeam],
    pagination: {
      total: 1,
      limit: 1,
      offset: 0,
      hasMore: false,
    },
  },
} satisfies BackyAdminTeamsResponse;

const sdkAdminTeamEnvelope = {
  success: true,
  requestId: "req_admin_team",
  data: {
    team: sdkAdminTeam,
  },
} satisfies BackyAdminTeamResponse;

const sdkAdminTeamDeleteEnvelope = {
  success: true,
  requestId: "req_admin_team_delete",
  data: {
    deleted: true,
  },
} satisfies BackyAdminTeamDeleteResponse;

const sdkAdminTeamMembersEnvelope = {
  success: true,
  requestId: "req_admin_team_members",
  data: {
    members: [sdkAdminTeamMember],
    pagination: {
      total: 1,
      limit: 1,
      offset: 0,
      hasMore: false,
    },
  },
} satisfies BackyAdminTeamMembersResponse;

const sdkAdminTeamMemberEnvelope = {
  success: true,
  requestId: "req_admin_team_member",
  data: {
    member: sdkAdminTeamMember,
    user: sdkAdminUser,
    invite: null,
    inviteDelivery: null,
  },
} satisfies BackyAdminTeamMemberResponse;

const sdkAdminTeamMemberRemoveEnvelope = {
  success: true,
  requestId: "req_admin_team_member_remove",
  data: {
    removed: true,
  },
} satisfies BackyAdminTeamMemberRemoveResponse;

const sdkAdminAuditLog = {
  id: "audit_team_create",
  siteId: null,
  teamId: sdkAdminTeam.id,
  actorId: "user_owner",
  entity: "team",
  entityId: sdkAdminTeam.id,
  action: "create",
  after: {
    team: sdkAdminTeam.name,
  },
  metadata: {
    requestSource: "sdk-contract",
  },
  requestId: "req_admin_team",
  createdAt: "2026-05-16T00:00:00.000Z",
} satisfies BackyAdminAuditLog;

const sdkAdminAuditLogsEnvelope = {
  success: true,
  requestId: "req_admin_audit_logs",
  data: {
    logs: [sdkAdminAuditLog],
    count: 1,
    pagination: {
      total: 1,
      limit: 20,
      offset: 0,
      hasMore: false,
    },
  },
} satisfies BackyAdminAuditLogsResponse;

const sdkAdminSiteEventsEnvelope = {
  success: true,
  requestId: "req_admin_site_events",
  data: {
    siteId: "site_demo",
    events: [
      {
        id: "event_form_delivery",
        siteId: "site_demo",
        kind: "form-submission",
        formId: "form_contact",
        requestId: "req_submission",
        status: "succeeded",
        metadata: {
          channel: "email",
        },
        createdAt: "2026-05-16T00:02:00.000Z",
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
} satisfies BackyAdminSiteEventsResponse;

const sdkAdminPage = {
  id: "page_home",
  siteId: "site_demo",
  title: "Home",
  slug: "index",
  status: "draft",
  description: "Home page",
  isHomepage: true,
  content: {
    elements: [
      {
        id: "hero-title",
        type: "heading",
        props: {
          text: "Build with Backy",
        },
        x: 64,
        y: 80,
        width: 480,
        height: 72,
      },
    ],
    canvasSize: {
      width: 1200,
      height: 900,
    },
  },
  meta: {
    title: "Home",
  },
  updatedAt: "2026-05-21T00:00:00.000Z",
};

const sdkAdminPagesEnvelope = {
  success: true,
  requestId: "req_admin_pages",
  data: {
    pages: [sdkAdminPage],
    pagination: {
      total: 1,
      limit: 100,
      offset: 0,
      hasMore: false,
    },
  },
} satisfies BackyAdminPagesResponse;

const sdkAdminPageEnvelope = {
  success: true,
  requestId: "req_admin_page",
  data: {
    page: sdkAdminPage,
    cacheInvalidation: {
      scope: "content",
    },
  },
} satisfies BackyAdminPageResponse;

const sdkAdminPageDeleteEnvelope = {
  success: true,
  requestId: "req_admin_page_delete",
  data: {
    deleted: true,
    pageId: "page_home",
  },
} satisfies BackyAdminPageDeleteResponse;

const sdkAdminPageReadinessEnvelope = {
  success: true,
  requestId: "req_admin_page_readiness",
  data: {
    readiness: {
      id: "page_home",
      status: "ready",
      checks: [],
    },
  },
} satisfies BackyAdminPageReadinessResponse;

const sdkAdminPagePreviewEnvelope = {
  success: true,
  requestId: "req_admin_page_preview",
  data: {
    previewToken: "preview_123",
    expiresAt: "2026-05-21T01:00:00.000Z",
    targetType: "page",
    targetId: "page_home",
    hostedUrl: "https://demo.example.test/sites/demo?previewToken=preview_123",
    renderUrl:
      "https://demo.example.test/api/sites/demo/render?path=/&previewToken=preview_123",
    pageApiUrl:
      "https://demo.example.test/api/sites/demo/pages?slug=index&previewToken=preview_123",
  },
} satisfies BackyAdminPagePreviewResponse;

const sdkAdminPageRevisionBranchMetadata = {
  schemaVersion: "backy.content-revision-branch-metadata.v1",
  source: "admin-page-revisions-api",
  targetType: "page",
  position: 1,
  total: 2,
  order: "newest-first",
  branchId: "trunk",
  branchLabel: "Main timeline",
  branchLane: 0,
  branchRole: "trunk",
  chronologicalParentId: "rev_home_0",
  chronologicalChildId: null,
  restoreTargetRevisionId: null,
  restoreTargetPosition: null,
  restoreTargetInWindow: false,
  restoreEdgeId: null,
  branchPointRevisionId: null,
	  inference: {
	    source: "revision-note-and-order",
	    lineageSource: "persisted-revision-lineage",
	    rollbackNotePattern: "\\b(?:rollback|restore)\\s+to\\s+([a-zA-Z0-9_-]+)",
	    confidence: "explicit-api-metadata",
	    persistedFields: ["id", "targetType", "targetId", "snapshot", "note", "parentRevisionId", "operation", "restoreTargetRevisionId", "metadata", "createdAt", "createdBy"],
	    limitation: "Branch metadata is normalized from persisted parent revision, operation, and restore target fields, with revision order used only for child links and legacy rows.",
	  },
} satisfies GeneratedBackyOpenApiContentRevisionBranchMetadata;

const sdkAdminPageRevisionBranchMetadataForSdk = sdkAdminPageRevisionBranchMetadata satisfies BackyContentRevisionBranchMetadata;
void sdkAdminPageRevisionBranchMetadataForSdk;

const sdkAdminPageRevisionsEnvelope = {
  success: true,
  requestId: "req_admin_page_revisions",
  data: {
    revisions: [
      {
        id: "rev_home_1",
        siteId: "site_demo",
        targetType: "page",
        targetId: "page_home",
        snapshot: {
          id: "page_home",
          siteId: "site_demo",
          title: "Home",
          slug: "home",
          status: "draft",
	        },
	        note: "Before publish",
	        parentRevisionId: "rev_home_0",
	        operation: "publish",
	        restoreTargetRevisionId: null,
	        metadata: {
	          schemaVersion: "backy.content-revision-metadata.v1",
	          operation: "publish",
	          parentRevisionId: "rev_home_0",
	          restoreTargetRevisionId: null,
	        },
	        createdBy: "admin",
        createdAt: "2026-05-21T00:00:00.000Z",
        branchMetadata: sdkAdminPageRevisionBranchMetadata,
      },
    ],
    pagination: {
      total: 1,
      limit: 25,
      offset: 0,
      hasMore: false,
    },
  },
} satisfies BackyAdminPageRevisionsResponse;

const sdkAdminPageRollbackInput = {
  revisionId: "rev_home_1",
  requestId: "req_admin_page_rollback",
} satisfies BackyAdminPageRollbackInput;
const sdkOpenApiAdminPageRollbackRequest = sdkAdminPageRollbackInput satisfies GeneratedBackyOpenApiAdminPageRollbackRequest;
void sdkOpenApiAdminPageRollbackRequest;

const sdkOpenApiAdminPageRevisionBranchMetadata = sdkAdminPageRevisionBranchMetadata satisfies GeneratedBackyOpenApiContentRevisionBranchMetadata;
const sdkOpenApiAdminPageRevision = sdkAdminPageRevisionsEnvelope.data.revisions[0] satisfies GeneratedBackyOpenApiAdminPageRevision;
const sdkOpenApiAdminPageRevisionsEnvelope = sdkAdminPageRevisionsEnvelope satisfies GeneratedBackyOpenApiAdminPageRevisionsEnvelope;
void sdkOpenApiAdminPageRevisionBranchMetadata;
void sdkOpenApiAdminPageRevision;
void sdkOpenApiAdminPageRevisionsEnvelope;

const sdkAdminBlogCategory = {
  id: "category_updates",
  siteId: "site_demo",
  name: "Updates",
  slug: "updates",
  description: "Product updates",
  color: "#0f766e",
  sortOrder: 10,
  postCount: 3,
  createdAt: "2026-05-21T00:00:00.000Z",
  updatedAt: "2026-05-21T00:00:00.000Z",
};

const sdkAdminBlogCategoriesEnvelope = {
  success: true,
  requestId: "req_admin_blog_categories",
  data: {
    categories: [sdkAdminBlogCategory],
  },
} satisfies BackyAdminBlogCategoriesResponse;

const sdkAdminBlogCategoryEnvelope = {
  success: true,
  requestId: "req_admin_blog_category",
  data: {
    category: sdkAdminBlogCategory,
    cacheInvalidation: {
      scope: "content",
    },
  },
} satisfies BackyAdminBlogCategoryResponse;

const sdkAdminBlogCategoryDeleteEnvelope = {
  success: true,
  requestId: "req_admin_blog_category_delete",
  data: {
    deleted: true,
    categoryId: "category_updates",
  },
} satisfies BackyAdminBlogCategoryDeleteResponse;

const sdkAdminBlogTag = {
  id: "tag_launch",
  siteId: "site_demo",
  name: "Launch",
  slug: "launch",
  description: "Launch notes",
  postCount: 2,
  createdAt: "2026-05-21T00:00:00.000Z",
  updatedAt: "2026-05-21T00:00:00.000Z",
};

const sdkAdminBlogTagsEnvelope = {
  success: true,
  requestId: "req_admin_blog_tags",
  data: {
    tags: [sdkAdminBlogTag],
  },
} satisfies BackyAdminBlogTagsResponse;

const sdkAdminBlogTagEnvelope = {
  success: true,
  requestId: "req_admin_blog_tag",
  data: {
    tag: sdkAdminBlogTag,
    cacheInvalidation: {
      scope: "content",
    },
  },
} satisfies BackyAdminBlogTagResponse;

const sdkAdminBlogTagDeleteEnvelope = {
  success: true,
  requestId: "req_admin_blog_tag_delete",
  data: {
    deleted: true,
    tagId: "tag_launch",
  },
} satisfies BackyAdminBlogTagDeleteResponse;

const sdkAdminBlogAuthor = {
  id: "author_demo",
  siteId: "site_demo",
  name: "Demo Editor",
  slug: "demo-editor",
  role: "editor",
  status: "active",
  avatarUrl: null,
  postCount: 4,
};

const sdkAdminBlogAuthorsEnvelope = {
  success: true,
  requestId: "req_admin_blog_authors",
  data: {
    authors: [sdkAdminBlogAuthor],
  },
} satisfies BackyAdminBlogAuthorsResponse;

const sdkAdminBlogPost = {
  id: "post_launch",
  siteId: "site_demo",
  title: "Launch Notes",
  slug: "launch-notes",
  excerpt: "A Backy launch update",
  status: "draft",
  authorId: "author_demo",
  categoryIds: ["category_updates"],
  tagIds: ["tag_launch"],
  featuredImageId: "media_launch",
  content: {
    elements: [
      {
        id: "post-title",
        type: "heading",
        props: {
          text: "Launch Notes",
        },
        x: 48,
        y: 64,
        width: 640,
        height: 72,
      },
    ],
    canvasSize: {
      width: 960,
      height: 1200,
    },
  },
  meta: {
    title: "Launch Notes",
  },
  updatedAt: "2026-05-21T00:00:00.000Z",
};

const sdkAdminBlogPostsEnvelope = {
  success: true,
  requestId: "req_admin_blog_posts",
  data: {
    posts: [sdkAdminBlogPost],
    pagination: {
      total: 1,
      limit: 25,
      offset: 0,
      hasMore: false,
    },
  },
} satisfies BackyAdminBlogPostsResponse;

const sdkAdminBlogPostEnvelope = {
  success: true,
  requestId: "req_admin_blog_post",
  data: {
    post: sdkAdminBlogPost,
    cacheInvalidation: {
      scope: "content",
    },
  },
} satisfies BackyAdminBlogPostResponse;

const sdkAdminBlogPostDeleteEnvelope = {
  success: true,
  requestId: "req_admin_blog_post_delete",
  data: {
    deleted: true,
    postId: "post_launch",
  },
} satisfies BackyAdminBlogPostDeleteResponse;

const sdkAdminBlogPostReadinessEnvelope = {
  success: true,
  requestId: "req_admin_blog_post_readiness",
  data: {
    readiness: {
      id: "post_launch",
      status: "ready",
      checks: [],
    },
  },
} satisfies BackyAdminBlogPostReadinessResponse;

const sdkAdminBlogPostPreviewEnvelope = {
  success: true,
  requestId: "req_admin_blog_post_preview",
  data: {
    previewToken: "preview_post_123",
    expiresAt: "2026-05-21T01:00:00.000Z",
    targetType: "post",
    targetId: "post_launch",
    hostedUrl:
      "https://demo.example.test/sites/demo/blog/launch-notes?previewToken=preview_post_123",
    postApiUrl:
      "https://demo.example.test/api/sites/demo/blog?slug=launch-notes&previewToken=preview_post_123",
  },
} satisfies BackyAdminBlogPostPreviewResponse;

const sdkAdminBlogPostRevisionBranchMetadata = {
  schemaVersion: "backy.content-revision-branch-metadata.v1",
  source: "admin-blog-revisions-api",
  targetType: "post",
  position: 1,
  total: 2,
  order: "newest-first",
  branchId: "trunk",
  branchLabel: "Main timeline",
  branchLane: 0,
  branchRole: "trunk",
  chronologicalParentId: "rev_post_0",
  chronologicalChildId: null,
  restoreTargetRevisionId: null,
  restoreTargetPosition: null,
  restoreTargetInWindow: false,
  restoreEdgeId: null,
  branchPointRevisionId: null,
	  inference: {
	    source: "revision-note-and-order",
	    lineageSource: "persisted-revision-lineage",
	    rollbackNotePattern: "\\b(?:rollback|restore)\\s+to\\s+([a-zA-Z0-9_-]+)",
	    confidence: "explicit-api-metadata",
	    persistedFields: ["id", "targetType", "targetId", "snapshot", "note", "parentRevisionId", "operation", "restoreTargetRevisionId", "metadata", "createdAt", "createdBy"],
	    limitation: "Branch metadata is normalized from persisted parent revision, operation, and restore target fields, with revision order used only for child links and legacy rows.",
	  },
} satisfies GeneratedBackyOpenApiContentRevisionBranchMetadata;

const sdkAdminBlogPostRevisionBranchMetadataForSdk = sdkAdminBlogPostRevisionBranchMetadata satisfies BackyContentRevisionBranchMetadata;
void sdkAdminBlogPostRevisionBranchMetadataForSdk;

const sdkAdminBlogPostRevisionsEnvelope = {
  success: true,
  requestId: "req_admin_blog_post_revisions",
  data: {
    revisions: [
      {
        id: "rev_post_1",
        siteId: "site_demo",
        targetType: "post",
        targetId: "post_launch",
        snapshot: {
          id: "post_launch",
          siteId: "site_demo",
          title: "Launch notes",
          slug: "launch-notes",
          status: "draft",
	        },
	        note: "Before publish",
	        parentRevisionId: "rev_post_0",
	        operation: "publish",
	        restoreTargetRevisionId: null,
	        metadata: {
	          schemaVersion: "backy.content-revision-metadata.v1",
	          operation: "publish",
	          parentRevisionId: "rev_post_0",
	          restoreTargetRevisionId: null,
	        },
	        createdBy: "admin",
        createdAt: "2026-05-21T00:00:00.000Z",
        branchMetadata: sdkAdminBlogPostRevisionBranchMetadata,
      },
    ],
    pagination: {
      total: 1,
      limit: 25,
      offset: 0,
      hasMore: false,
    },
  },
} satisfies BackyAdminBlogPostRevisionsResponse;

const sdkAdminBlogPostRollbackInput = {
  revisionId: "rev_post_1",
  requestId: "req_admin_blog_post_rollback",
} satisfies BackyAdminBlogPostRollbackInput;
const sdkOpenApiAdminBlogPostRollbackRequest = sdkAdminBlogPostRollbackInput satisfies GeneratedBackyOpenApiAdminBlogPostRollbackRequest;
void sdkOpenApiAdminBlogPostRollbackRequest;

const sdkOpenApiAdminBlogPostRevisionBranchMetadata = sdkAdminBlogPostRevisionBranchMetadata satisfies GeneratedBackyOpenApiContentRevisionBranchMetadata;
const sdkOpenApiAdminBlogPostRevision = sdkAdminBlogPostRevisionsEnvelope.data.revisions[0] satisfies GeneratedBackyOpenApiAdminBlogPostRevision;
const sdkOpenApiAdminBlogPostRevisionsEnvelope = sdkAdminBlogPostRevisionsEnvelope satisfies GeneratedBackyOpenApiAdminBlogPostRevisionsEnvelope;
void sdkOpenApiAdminBlogPostRevisionBranchMetadata;
void sdkOpenApiAdminBlogPostRevision;
void sdkOpenApiAdminBlogPostRevisionsEnvelope;

const sdkAdminCollection = {
  id: "collection_projects",
  siteId: "site_demo",
  slug: "projects",
  name: "Projects",
  status: "published",
  permissions: {
    publicRead: true,
    publicCreate: false,
  },
  fields: [
    {
      key: "title",
      label: "Title",
      type: "text",
      required: true,
    },
    {
      key: "slug",
      label: "Slug",
      type: "slug",
      unique: true,
    },
  ],
  routePattern: "/projects/:recordSlug",
  listRoutePattern: "/projects",
  updatedAt: "2026-05-21T00:00:00.000Z",
};

const sdkAdminCollectionsEnvelope = {
  success: true,
  requestId: "req_admin_collections",
  data: {
    collections: [sdkAdminCollection],
    pagination: {
      total: 1,
      limit: 25,
      offset: 0,
      hasMore: false,
    },
  },
} satisfies BackyAdminCollectionsResponse;

const sdkAdminCollectionEnvelope = {
  success: true,
  requestId: "req_admin_collection",
  data: {
    collection: sdkAdminCollection,
    cacheInvalidation: {
      scope: "content",
    },
  },
} satisfies BackyAdminCollectionResponse;

const sdkAdminCollectionDeleteEnvelope = {
  success: true,
  requestId: "req_admin_collection_delete",
  data: {
    deleted: true,
    collectionId: "collection_projects",
  },
} satisfies BackyAdminCollectionDeleteResponse;

const sdkAdminCollectionRecord = {
  id: "record_project_1",
  slug: "launch-site",
  status: "published",
  values: {
    title: "Launch Site",
    slug: "launch-site",
  },
  updatedAt: "2026-05-21T00:00:00.000Z",
};

const sdkAdminCollectionsBackup = {
  backup: {
    schemaVersion: "backy.collections.backup.v1",
    exportedAt: "2026-05-21T00:00:00.000Z",
    siteId: "site_demo",
    siteSlug: "demo",
    collectionCount: 1,
    recordCount: 1,
  },
  collections: [
    {
      sourceCollectionId: sdkAdminCollection.id,
      name: sdkAdminCollection.name,
      slug: sdkAdminCollection.slug,
      description: "Project records",
      status: "published",
      routePattern: sdkAdminCollection.routePattern,
      listRoutePattern: sdkAdminCollection.listRoutePattern,
      fields: sdkAdminCollection.fields,
      permissions: sdkAdminCollection.permissions,
      metadata: {
        source: "sdk-fixture",
      },
      records: [
        {
          sourceRecordId: sdkAdminCollectionRecord.id,
          slug: sdkAdminCollectionRecord.slug,
          status: sdkAdminCollectionRecord.status,
          values: sdkAdminCollectionRecord.values,
          publishedAt: "2026-05-21T00:00:00.000Z",
          scheduledAt: null,
        },
      ],
    },
  ],
} satisfies BackyAdminCollectionsBackup;

const sdkAdminCollectionsBackupEnvelope = {
  success: true,
  requestId: "req_admin_collections_backup",
  data: sdkAdminCollectionsBackup,
} satisfies BackyAdminCollectionsBackupResponse;

const sdkAdminCollectionsBackupImportEnvelope = {
  success: true,
  requestId: "req_admin_collections_backup_import",
  data: {
    import: {
      createdCollections: 1,
      updatedCollections: 0,
      createdRecords: 1,
      updatedRecords: 0,
      totalCollections: 1,
      totalRecords: 1,
    },
    collections: [sdkAdminCollection],
    records: [sdkAdminCollectionRecord],
    cacheInvalidation: {
      scope: "content",
    },
  },
} satisfies BackyAdminCollectionsBackupImportResponse;

const sdkAdminCollectionRecordsEnvelope = {
  success: true,
  requestId: "req_admin_collection_records",
  data: {
    collection: sdkAdminCollection,
    records: [sdkAdminCollectionRecord],
    pagination: {
      total: 1,
      limit: 25,
      offset: 0,
      hasMore: false,
    },
  },
} satisfies BackyAdminCollectionRecordsResponse;

const sdkAdminCollectionRecordEnvelope = {
  success: true,
  requestId: "req_admin_collection_record",
  data: {
    collection: sdkAdminCollection,
    record: sdkAdminCollectionRecord,
    cacheInvalidation: {
      scope: "content",
    },
  },
} satisfies BackyAdminCollectionRecordResponse;

const sdkAdminCollectionRecordDeleteEnvelope = {
  success: true,
  requestId: "req_admin_collection_record_delete",
  data: {
    deleted: true,
    recordId: "record_project_1",
  },
} satisfies BackyAdminCollectionRecordDeleteResponse;

const sdkAdminCollectionRecordImportEnvelope = {
  success: true,
  requestId: "req_admin_collection_record_import",
  data: {
    collection: sdkAdminCollection,
    records: [sdkAdminCollectionRecord],
    import: {
      created: 1,
      updated: 0,
      skipped: 0,
      errors: [],
    },
    cacheInvalidation: {
      scope: "content",
    },
  },
} satisfies BackyAdminCollectionRecordImportResponse;

const sdkAdminCollectionRecordBulkEnvelope = {
  success: true,
  requestId: "req_admin_collection_record_bulk",
  data: {
    action: "updateStatus",
    deleted: 0,
    updated: 1,
    skipped: 0,
    records: [sdkAdminCollectionRecord],
    cacheInvalidation: {
      scope: "content",
    },
  },
} satisfies BackyAdminCollectionRecordBulkResponse;

const sdkAdminCommerceProductCollection = {
  ...sdkAdminCollection,
  id: "products",
  slug: "products",
  name: "Products",
};

const sdkAdminCommerceProductRecord = {
  id: "product_starter",
  slug: "starter-template",
  status: "published",
  values: {
    title: "Starter Template",
    price: 4900,
    currency: "USD",
    productType: "digital",
  },
  updatedAt: "2026-05-21T00:00:00.000Z",
};

const sdkAdminCommerceProductsEnvelope = {
  success: true,
  requestId: "req_admin_commerce_products",
  data: {
    collection: sdkAdminCommerceProductCollection,
    records: [sdkAdminCommerceProductRecord],
    pagination: {
      total: 1,
      limit: 25,
      offset: 0,
      hasMore: false,
    },
  },
} satisfies BackyAdminCommerceProductsResponse;

const sdkAdminCommerceProductEnvelope = {
  success: true,
  requestId: "req_admin_commerce_product",
  data: {
    collection: sdkAdminCommerceProductCollection,
    record: sdkAdminCommerceProductRecord,
    cacheInvalidation: {
      scope: "collections",
    },
  },
} satisfies BackyAdminCommerceProductResponse;

const sdkAdminCommerceProductDeleteEnvelope = {
  success: true,
  requestId: "req_admin_commerce_product_delete",
  data: {
    deleted: true,
    recordId: "product_starter",
  },
} satisfies BackyAdminCommerceProductDeleteResponse;

const sdkAdminCommerceProductImportEnvelope = {
  success: true,
  requestId: "req_admin_commerce_product_import",
  data: {
    collection: sdkAdminCommerceProductCollection,
    records: [sdkAdminCommerceProductRecord],
    import: {
      created: 1,
      updated: 0,
      skipped: 0,
      errors: [],
    },
  },
} satisfies BackyAdminCommerceProductImportResponse;

const sdkAdminCommerceProductBulkEnvelope = {
  success: true,
  requestId: "req_admin_commerce_product_bulk",
  data: {
    action: "updateStatus",
    deleted: 0,
    updated: 1,
    skipped: 0,
    records: [sdkAdminCommerceProductRecord],
  },
} satisfies BackyAdminCommerceProductBulkResponse;

const sdkAdminCommerceOrderCollection = {
  ...sdkAdminCollection,
  id: "orders",
  slug: "orders",
  name: "Orders",
  permissions: {
    publicRead: false,
    publicCreate: true,
    publicUpdate: false,
    publicDelete: false,
  },
};

const sdkAdminCommerceOrderRecord = {
  id: "order_1001",
  slug: "order-1001",
  status: "draft",
  values: {
    orderNumber: "1001",
    paymentStatus: "pending",
    fulfillmentStatus: "unfulfilled",
    total: 10250,
    currency: "USD",
  },
  updatedAt: "2026-05-21T00:00:00.000Z",
};

const sdkAdminCommerceOrdersEnvelope = {
  success: true,
  requestId: "req_admin_commerce_orders",
  data: {
    collection: sdkAdminCommerceOrderCollection,
    records: [sdkAdminCommerceOrderRecord],
    pagination: {
      total: 1,
      limit: 25,
      offset: 0,
      hasMore: false,
    },
  },
} satisfies BackyAdminCommerceOrdersResponse;

const sdkAdminCommerceOrderEnvelope = {
  success: true,
  requestId: "req_admin_commerce_order",
  data: {
    collection: sdkAdminCommerceOrderCollection,
    record: sdkAdminCommerceOrderRecord,
    cacheInvalidation: {
      scope: "collections",
    },
  },
} satisfies BackyAdminCommerceOrderResponse;

const sdkAdminCommerceOrderDeleteEnvelope = {
  success: true,
  requestId: "req_admin_commerce_order_delete",
  data: {
    deleted: true,
    recordId: "order_1001",
  },
} satisfies BackyAdminCommerceOrderDeleteResponse;

const sdkAdminCommerceOrderImportEnvelope = {
  success: true,
  requestId: "req_admin_commerce_order_import",
  data: {
    collection: sdkAdminCommerceOrderCollection,
    records: [sdkAdminCommerceOrderRecord],
    import: {
      created: 0,
      updated: 1,
      skipped: 0,
      errors: [],
    },
  },
} satisfies BackyAdminCommerceOrderImportResponse;

const sdkAdminCommerceOrderBulkEnvelope = {
  success: true,
  requestId: "req_admin_commerce_order_bulk",
  data: {
    action: "delete",
    deleted: 1,
    updated: 0,
    skipped: 0,
    records: [],
  },
} satisfies BackyAdminCommerceOrderBulkResponse;

const sdkAdminReusableSection = {
  id: "section_hero",
  siteId: "site_demo",
  name: "Hero Block",
  slug: "hero-block",
  description: "Reusable homepage hero",
  category: "marketing",
  status: "active",
  tags: ["hero", "homepage"],
  content: {
    elements: [
      {
        id: "hero-heading",
        type: "heading",
        children: [],
        props: {
          text: "Reusable Hero",
        },
        x: 64,
        y: 72,
        width: 720,
        height: 80,
      },
    ],
    canvasSize: {
      width: 1200,
      height: 420,
    },
    contentDocument: {
      schemaVersion: "backy.content.v1",
      id: "section_hero_document",
      kind: "template",
      version: "1",
      elements: [],
      editableMap: {},
    },
    themeTokenRefs: {
      "hero-heading.color": "colors.text",
    },
    assets: [{ id: "hero-bg", mediaId: "media_hero", role: "section.background" }],
    animations: [{ id: "hero-enter", timeline: "hero-enter" }],
    interactions: [{ id: "hero-hover", trigger: "hover" }],
    dataBindings: { heading: { source: "section.heading" } },
    editableMap: { heading: { elementId: "hero-heading" } },
    seo: { title: "Reusable Hero" },
    metadata: { templateKind: "reusable-section" },
  },
  metadata: {
    reusableSection: {
      version: 2,
    },
  },
  updatedAt: "2026-05-21T00:00:00.000Z",
};

const sdkAdminReusableSectionsEnvelope = {
  success: true,
  requestId: "req_admin_reusable_sections",
  data: {
    sections: [sdkAdminReusableSection],
    pagination: {
      total: 1,
      limit: 25,
      offset: 0,
      hasMore: false,
    },
  },
} satisfies BackyAdminReusableSectionsResponse;

const sdkAdminReusableSectionEnvelope = {
  success: true,
  requestId: "req_admin_reusable_section",
  data: {
    section: sdkAdminReusableSection,
    version: 2,
    cacheInvalidation: {
      scope: "content",
    },
  },
} satisfies BackyAdminReusableSectionResponse;

const sdkAdminReusableSectionDeleteEnvelope = {
  success: true,
  requestId: "req_admin_reusable_section_delete",
  data: {
    deleted: true,
    sectionId: "section_hero",
  },
} satisfies BackyAdminReusableSectionDeleteResponse;

const sdkAdminReusableSectionVersionsEnvelope = {
  success: true,
  requestId: "req_admin_reusable_section_versions",
  data: {
    sectionId: "section_hero",
    currentVersion: 2,
    versions: [
      {
        version: 2,
        name: "Hero Block",
        slug: "hero-block",
        updatedAt: "2026-05-21T00:00:00.000Z",
      },
    ],
  },
} satisfies BackyAdminReusableSectionVersionsResponse;

const sdkAdminReusableSectionRestoreEnvelope = {
  success: true,
  requestId: "req_admin_reusable_section_restore",
  data: {
    restored: true,
    restoredFromVersion: 1,
    version: 3,
    section: sdkAdminReusableSection,
    cacheInvalidation: {
      scope: "content",
    },
  },
} satisfies BackyAdminReusableSectionRestoreResponse;

const sdkAdminReusableSectionExportEnvelope = {
  success: true,
  requestId: "req_admin_reusable_section_export",
  data: {
    export: {
      schemaVersion: "backy.reusable-sections.export.v1",
      exportedAt: "2026-05-21T00:00:00.000Z",
      siteId: "site_demo",
      siteSlug: "demo",
      sectionCount: 1,
    },
    sections: [
      {
        sourceSectionId: "section_hero",
        name: "Hero Block",
        slug: "hero-block",
        description: "Reusable homepage hero",
        category: "marketing",
        status: "active",
        tags: ["hero", "homepage"],
        content: sdkAdminReusableSection.content,
        metadata: sdkAdminReusableSection.metadata,
        sourceElementId: null,
      },
    ],
  },
} satisfies BackyAdminReusableSectionExportResponse;

const sdkAdminReusableSectionImportEnvelope = {
  success: true,
  requestId: "req_admin_reusable_section_import",
  data: {
    import: {
      created: 1,
      updated: 0,
      total: 1,
    },
    sections: [sdkAdminReusableSection],
    cacheInvalidation: {
      scope: "content",
    },
  },
} satisfies BackyAdminReusableSectionImportResponse;

const sdkAdminReusableSectionInstancesEnvelope = {
  success: true,
  requestId: "req_admin_reusable_section_instances",
  data: {
    sectionId: "section_hero",
    sourceUpdatedAt: "2026-05-21T00:00:00.000Z",
    targets: [
      {
        type: "page",
        id: "page_home",
        title: "Home",
        slug: "home",
        status: "published",
        updatedAt: "2026-05-21T00:00:00.000Z",
        instances: [
          {
            elementId: "hero-instance",
            elementType: "section",
            path: "elements.0",
            mode: "synced",
            sourceUpdatedAt: "2026-05-21T00:00:00.000Z",
            stale: false,
          },
        ],
      },
    ],
    totals: {
      targets: 1,
      instances: 1,
      stale: 0,
    },
  },
} satisfies BackyAdminReusableSectionInstancesResponse;

const sdkAdminReusableSectionInstancesRefreshEnvelope = {
  success: true,
  requestId: "req_admin_reusable_section_instances_refresh",
  data: {
    dryRun: true,
    sectionId: "section_hero",
    sourceUpdatedAt: "2026-05-21T00:00:00.000Z",
    refreshedTargets: [
      {
        type: "page",
        id: "page_home",
        title: "Home",
        slug: "home",
        refreshed: 1,
      },
    ],
    totals: {
      targets: 1,
      instances: 1,
    },
    cacheInvalidation: null,
  },
} satisfies BackyAdminReusableSectionInstancesRefreshResponse;

const sdkAdminReusableSectionMetadataEnvelope = {
  success: true,
  requestId: "req_admin_reusable_section_metadata",
  data: {
    sectionId: "section_hero",
    metadata: sdkAdminReusableSection.metadata,
    library: {
      displayName: "Homepage Hero",
      summary: "Primary marketing hero",
      labels: ["hero", "homepage"],
      previewPath: "/",
    },
    version: 2,
  },
} satisfies BackyAdminReusableSectionMetadataResponse;

const sdkAdminReusableSectionMetadataUpdateEnvelope = {
  success: true,
  requestId: "req_admin_reusable_section_metadata_update",
  data: {
    section: sdkAdminReusableSection,
    metadata: sdkAdminReusableSection.metadata,
    library: {
      displayName: "Homepage Hero",
      summary: "Primary marketing hero",
      labels: ["hero", "homepage"],
    },
    version: 3,
    cacheInvalidation: {
      scope: "content",
    },
  },
} satisfies BackyAdminReusableSectionMetadataUpdateResponse;

const sdkCommerceProviderCertification = {
  schemaVersion: "backy.commerce-provider-certification-handoff.v1",
  status: "external-live-provider-gate",
  localMockGate: "ci:commerce-provider-smoke",
  liveCertificationGate: "ci:commerce-provider-certification",
  requiredFor: "live-commerce-provider-launch",
  secretHandling:
    "Provider secrets stay in server-side environment variables.",
  operatorCommandTemplate: {
    command: "npm run ci:commerce-provider-certification",
    envTemplate: "BACKY_COMMERCE_PROVIDER_CERTIFICATION_REQUIRED=1",
    envTemplateSchemaVersion:
      "backy.commerce-provider-certification-env-template.v1",
    providerChoices: {
      payment: ["stripe", "manual"],
      tax: ["auto", "stripe", "http"],
      shipping: ["auto", "easypost", "shippo", "http"],
      discount: ["auto", "stripe", "http"],
      catalog: ["auto", "stripe", "http"],
      subscription: ["auto", "stripe", "http"],
      webhook: ["auto", "stripe", "http"],
    },
    requiredInputs: ["BACKY_COMMERCE_PROVIDER_CERTIFICATION_REQUIRED=1"],
    targetInputs: ["BACKY_COMMERCE_CERTIFICATION_BASE_URL"],
    secretHandling:
      "Generated commands name provider selector aliases only; credentials stay in CI secrets.",
  },
  operatorEnvTemplate: {
    schemaVersion: "backy.commerce-provider-certification-env-template.v1",
    format: "shell-env",
    fileName: ".env.backy-commerce-provider-certification",
    body: "BACKY_COMMERCE_PROVIDER_CERTIFICATION_REQUIRED=1",
    secretHandling:
      "Replace placeholders with CI/local shell secrets before execution.",
  },
  operatorEvidencePacket: {
    schemaVersion: "backy.commerce-provider-certification-evidence-packet.v1",
    generatedAt: "2026-05-21T00:00:00.000Z",
    selectedSiteId: "site_demo",
    status: "needs-credentials",
    operatorNextAction: {
      status: "needs-credentials",
      label: "Configure live provider credentials",
      detail: "Populate runtime aliases for selected families: payment-checkout, catalog-sync.",
      command: "npm run doctor:release-certification && npm run ci:commerce-provider-certification",
      missingFamilies: ["payment-checkout", "catalog-sync"],
      missingScenarios: ["provider-catalog-sync"],
      artifactEnv: "BACKY_COMMERCE_CERTIFICATION_OUTPUT",
      artifactPath: "artifacts/backy-commerce-provider-certification.json",
    },
    selectedFamilies: ["payment-checkout", "catalog-sync"],
    runtimeReadiness: {
      loaded: true,
      configuredFamilies: [],
      missingSelectedFamilies: ["payment-checkout"],
    },
    operatorArtifacts: [
      {
        key: "payment-checkout",
        family: "Payment checkout",
        providerAlias: "Auto payment provider",
        status: "needs-credentials",
        requiredInputs: ["BACKY_STRIPE_SECRET_KEY"],
        expectedArtifacts: ["checkout settlement"],
        captureSource: "public checkout intake",
        redaction: "No provider secrets.",
      },
    ],
    scenarioAttachments: [
      {
        key: "checkout-settlement",
        label: "Checkout settlement",
        status: "missing",
        evidenceCount: 0,
        expectedEvidence: ["paid checkout"],
        nextAction: "Run provider certification.",
      },
    ],
    commandPreview: {
      command: "npm run ci:commerce-provider-certification",
      requiredInputs: ["BACKY_COMMERCE_PROVIDER_CERTIFICATION_REQUIRED=1"],
      targetInputs: ["BACKY_COMMERCE_CERTIFICATION_BASE_URL"],
    },
    redactionPolicy: {
      includesProviderSecrets: false,
      includesCustomerPayloads: false,
    },
    secretHandling: "Redacted operator attachment manifest only.",
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
    missingFamilies: ["payment", "webhook"],
    secretHandling: "Runtime readiness exposes booleans only.",
  },
  groups: [
    {
      family: "payment",
      providers: ["stripe", "paypal", "manual"],
      gate: "ci:commerce-provider-certification",
      requiredInputs: ["BACKY_STRIPE_SECRET_KEY"],
      evidence: "checkout settlement",
    },
  ],
} satisfies BackyCommerceProviderCertification;

const sdkCommerceOrderProviderCertificationEvidence = {
  schemaVersion: "backy.order-provider-certification-evidence.v1",
  status: "attention",
  requiredGate:
    "BACKY_COMMERCE_PROVIDER_CERTIFICATION_REQUIRED=1 npm run ci:commerce-provider-certification",
  coverage: {
    covered: 1,
    total: 7,
    missing: ["provider-refund", "webhook-reconciliation"],
  },
  scenarios: [
    {
      key: "checkout-settlement",
      label: "Checkout settlement",
      expectedEvidence: ["paid checkout order", "payment provider reference"],
      nextAction: "Run a live checkout and verify paid provider evidence.",
      evidenceCount: 1,
      status: "covered",
    },
    {
      key: "provider-refund",
      label: "Provider refund",
      expectedEvidence: ["provider refund id", "refund status refresh"],
      nextAction: "Execute and refresh a live provider refund.",
      evidenceCount: 0,
      status: "missing",
    },
  ],
  secretHandling:
    "Order certification evidence reports scenario names and counts only.",
} satisfies GeneratedBackyOpenApiCommerceOrderProviderCertificationEvidence;

const sdkCommerceOrderProviderCertificationEvidencePacket = {
  schemaVersion: "backy.order-provider-certification-evidence-packet.v1",
  generatedAt: "2026-05-21T00:00:00.000Z",
  selectedSiteId: "site_demo",
  status: "needs-credentials",
  selectedFamilies: ["payment-refunds", "shipping-labels"],
  selectedProviderAliases: {
    "payment-refunds": "Auto payment/refund provider",
    "shipping-labels": "Auto shipping provider",
  },
  operatorNextAction: {
    status: "needs-credentials",
    label: "Configure order provider credentials",
    detail: "Populate runtime aliases for selected order families: shipping-labels.",
    command: "npm run doctor:release-certification && npm run ci:commerce-provider-certification",
    missingFamilies: ["shipping-labels"],
    missingScenarios: ["provider-refund"],
    artifactEnv: "BACKY_COMMERCE_CERTIFICATION_OUTPUT",
    artifactPath: "artifacts/backy-commerce-provider-certification.json",
  },
  runtimeReadiness: {
    loaded: true,
    configuredFamilies: ["payment"],
    missingSelectedFamilies: ["shipping-labels"],
  },
  operatorArtifacts: [
    {
      key: "payment-refunds",
      family: "Payment settlement and refunds",
      providerAlias: "Auto payment/refund provider",
      status: "ready-to-run",
      requiredInputs: ["BACKY_STRIPE_SECRET_KEY"],
      expectedArtifacts: ["paid checkout order", "provider refund id"],
      captureSource:
        "public checkout intake, private order record, and provider-refund endpoint",
      redaction:
        "Attach ids, timestamps, totals, and status codes only; remove provider secrets and customer payloads.",
    },
  ],
  scenarioAttachments: [
    {
      key: "checkout-settlement",
      label: "Checkout settlement",
      status: "covered",
      evidenceCount: 1,
      expectedEvidence: ["paid checkout order", "payment provider reference"],
      nextAction: "Run provider certification.",
    },
  ],
  commandPreview: {
    command: "npm run ci:commerce-provider-certification",
    requiredInputs: ["BACKY_COMMERCE_PROVIDER_CERTIFICATION_REQUIRED=1"],
    targetInputs: ["BACKY_COMMERCE_CERTIFICATION_BASE_URL"],
  },
  redactionPolicy: {
    includesProviderSecrets: false,
    includesCustomerPayloads: false,
    includesRawOrderPayloads: false,
    includesPaymentReferences: false,
    includesAddresses: false,
    includesWebhookBodies: false,
    allowedEvidence: [
      "provider ids and aliases",
      "timestamped CI/preflight logs",
      "quote totals and adjustment names",
    ],
  },
  secretHandling:
    "Redacted operator attachment manifest only; provider credentials and order payloads stay out of API JSON.",
} satisfies GeneratedBackyOpenApiCommerceOrderProviderCertificationEvidencePacket;

const sdkCommerceOrderAnalyticsProviderCertification = {
  ...sdkCommerceProviderCertification,
  generatedAt: "2026-05-21T00:00:00.000Z",
  selectedSiteId: "site_demo",
  site: {
    id: "site_demo",
    slug: "demo",
    name: "Demo",
    status: "published",
  },
  source: "admin-order-analytics-api",
  operatorGate:
    "BACKY_COMMERCE_PROVIDER_CERTIFICATION_REQUIRED=1 npm run ci:commerce-provider-certification",
  analyticsSchemaVersion: "backy.order-analytics.v1",
  endpointEvidence: {
    analytics: "/api/admin/sites/site_demo/commerce/orders/analytics",
    quote: "/api/admin/sites/site_demo/commerce/orders/{orderId}/quote",
    shippingLabel:
      "/api/admin/sites/site_demo/commerce/orders/{orderId}/shipping-label",
    fulfillment:
      "/api/admin/sites/site_demo/commerce/orders/{orderId}/fulfillment",
    tracking: "/api/admin/sites/site_demo/commerce/orders/{orderId}/tracking",
    providerRefund:
      "/api/admin/sites/site_demo/commerce/orders/{orderId}/provider-refund",
    commerceWebhook: "/api/sites/site_demo/commerce/webhook",
    siteReconciliation: "/api/admin/sites/site_demo/commerce/reconcile",
    platformReconciliation: "/api/admin/commerce/reconcile",
    reconciliationReadiness: "/api/admin/commerce/reconcile/readiness",
    checkoutIntake: "/api/sites/site_demo/commerce/orders",
  },
  providerAnalytics: {
    paymentProviders: [],
    refundProviders: [],
    fulfillmentProviders: [],
    shippingLabelProviders: [],
    attention: {},
  },
  certificationEvidence: sdkCommerceOrderProviderCertificationEvidence,
  operatorEvidencePacket: sdkCommerceOrderProviderCertificationEvidencePacket,
  secretHandling:
    "Provider credentials stay in server environment/configuration; order analytics exposes only non-secret readiness.",
} satisfies GeneratedBackyOpenApiCommerceOrderAnalyticsProviderCertification;

const sdkCommerceOrderAnalyticsEnvelope = {
  success: true,
  requestId: "req_order_analytics",
  data: {
    site: {
      id: "site_demo",
      slug: "demo",
      name: "Demo",
    },
    collection: {
      id: "orders",
      slug: "orders",
      name: "Orders",
    },
    analytics: {
      schemaVersion: "backy.order-analytics.v1",
      generatedAt: "2026-05-21T00:00:00.000Z",
      recordLimit: 1000,
      orderCount: 12,
      revenue: {
        grossTotal: 12345,
        paidTotal: 10000,
        pendingTotal: 1200,
        failedTotal: 0,
        refundedTotal: 1145,
        refundAmountTotal: 250,
        taxTotal: 720,
        shippingTotal: 180,
        discountTotal: 100,
        averageOrderValue: 1028.75,
        paidAverageOrderValue: 1000,
      },
      payment: {
        pending: { count: 2, total: 1200 },
        paid: { count: 10, total: 10000 },
        failed: { count: 0, total: 0 },
        refunded: { count: 1, total: 1145 },
      },
      fulfillment: {
        unfulfilled: { count: 4, total: 3200 },
        processing: { count: 3, total: 2800 },
        fulfilled: { count: 5, total: 6345 },
        cancelled: { count: 0, total: 0 },
      },
      operations: {
        fulfillmentBacklogCount: 2,
        paymentAttentionCount: 2,
        refundCount: 1,
      },
      providerOperations: {
        paymentProviders: [
          {
            provider: "stripe",
            count: 10,
            total: 10000,
            statuses: { paid: 10 },
          },
        ],
        refundProviders: [],
        fulfillmentProviders: [],
        shippingLabelProviders: [],
        attention: {
          providerRefundPendingCount: 0,
          providerRefundFailureCount: 0,
        },
      },
      sources: [{ source: "web", count: 10, total: 10000 }],
      currencies: [{ currency: "USD", count: 12, total: 12345 }],
      trend: [
        {
          date: "2026-05-21",
          orders: 3,
          paid: 2,
          grossTotal: 3000,
          paidTotal: 2000,
        },
      ],
      recentOrders: [
        {
          id: "order_1",
          slug: "order-1",
          status: "published",
          orderNumber: "ORD-1",
          customerName: "Test Customer",
          total: 100,
          currency: "USD",
          paymentStatus: "paid",
          fulfillmentStatus: "processing",
          orderSource: "web",
          subscriptionReference: "",
          updatedAt: "2026-05-21T00:00:00.000Z",
        },
      ],
    },
    providerCertification: sdkCommerceOrderAnalyticsProviderCertification,
  },
} satisfies BackyCommerceOrderAnalyticsResponse &
  GeneratedBackyOpenApiCommerceOrderAnalyticsEnvelope;

const sdkCommerceProductProviderCertificationEvidencePacket = {
  schemaVersion: "backy.commerce-provider-certification-evidence-packet.v1",
  generatedAt: "2026-05-21T00:00:00.000Z",
  selectedSiteId: "site_demo",
  selectedProductId: "product_starter",
  status: "needs-credentials",
  operatorNextAction: {
    status: "needs-credentials",
    label: "Configure live provider credentials",
    detail: "Populate runtime aliases for selected families: payment-checkout, catalog-sync.",
    command: "npm run doctor:release-certification && npm run ci:commerce-provider-certification",
    missingFamilies: ["payment-checkout", "catalog-sync"],
    missingScenarios: ["provider-catalog-sync"],
    artifactEnv: "BACKY_COMMERCE_CERTIFICATION_OUTPUT",
    artifactPath: "artifacts/backy-commerce-provider-certification.json",
  },
  selectedFamilies: ["payment-checkout", "catalog-sync"],
  selectedProviderAliases: {
    "payment-checkout": "Auto payment provider",
    "catalog-sync": "Auto catalog provider",
  },
  runtimeReadiness: {
    loaded: true,
    configuredFamilies: [],
    missingSelectedFamilies: ["payment-checkout", "catalog-sync"],
  },
  operatorArtifacts: [
    {
      key: "payment-checkout",
      family: "Payment checkout",
      providerAlias: "Auto payment provider",
      status: "needs-credentials",
      requiredInputs: ["BACKY_STRIPE_SECRET_KEY"],
      expectedArtifacts: ["paid checkout order", "payment provider reference"],
      captureSource:
        "public checkout intake response, private order record, and signed provider webhook readback",
      redaction:
        "Attach ids, timestamps, event names, totals, and status codes only; remove provider secrets and raw customer payloads.",
    },
    {
      key: "catalog-sync",
      family: "Catalog sync",
      providerAlias: "Auto catalog provider",
      status: "needs-credentials",
      requiredInputs: ["BACKY_COMMERCE_PRODUCT_SYNC_URL"],
      expectedArtifacts: ["provider product id", "provider price id", "sync status"],
      captureSource: "admin provider-sync response and stored provider-sync metadata",
      redaction:
        "Attach ids, timestamps, event names, totals, and status codes only; remove provider secrets and raw customer payloads.",
    },
  ],
  scenarioAttachments: [
    {
      key: "provider-catalog-sync",
      label: "Provider catalog sync",
      status: "missing",
      evidenceCount: 0,
      expectedEvidence: ["provider product id", "provider price id", "sync status"],
      nextAction:
        "Run provider catalog sync for a selected product and attach the non-secret sync result.",
    },
  ],
  commandPreview: {
    command: "npm run ci:commerce-provider-certification",
    requiredInputs: ["BACKY_COMMERCE_PROVIDER_CERTIFICATION_REQUIRED=1"],
    targetInputs: [
      "BACKY_COMMERCE_CERTIFICATION_BASE_URL",
      "BACKY_COMMERCE_CERTIFY_SITE_ID",
    ],
  },
  target: {
    siteId: "site_demo",
    productId: "product_starter",
    siteSelectorEnv: "BACKY_COMMERCE_CERTIFY_SITE_ID",
    productProviderSyncApi:
      "/api/admin/sites/site_demo/commerce/products/product_starter/provider-sync",
    orderAnalyticsApi: "/api/admin/sites/site_demo/commerce/orders/analytics",
    publicCatalogApi: "/api/sites/site_demo/commerce/catalog",
  },
  redactionPolicy: {
    includesProviderSecrets: false,
    includesCustomerPayloads: false,
    includesPrivateOrderPayloads: false,
    includesWebhookBodies: false,
    allowedEvidence: [
      "provider ids and references",
      "timestamped CI/preflight logs",
      "quote totals and adjustment names",
    ],
  },
  secretHandling:
    "Redacted operator attachment manifest only; provider credentials, raw customer data, raw private orders, and webhook bodies stay out of API JSON.",
} satisfies GeneratedBackyOpenApiCommerceProductProviderCertificationEvidencePacket;

const sdkCommerceProductProviderSyncEnvelope = {
  success: true,
  requestId: "req_product_provider_sync",
  data: {
    sync: {
      provider: "stripe",
      status: "handoff",
      executionMode: "manual-handoff",
      syncedAt: "2026-05-21T00:00:00.000Z",
      requestId: "req_product_provider_sync",
      reason: "Provider credentials are not configured.",
      product: {
        id: null,
        name: "Starter Template",
        active: true,
      },
      price: {
        id: null,
        currency: "usd",
        unitAmount: 2900,
        recurring: null,
      },
    },
    product: {
      id: "product_starter",
      slug: "starter-template",
      status: "published",
      values: {
        title: "Starter Template",
      },
    },
    providerCertification: {
      ...sdkCommerceProviderCertification,
      generatedAt: "2026-05-21T00:00:00.000Z",
      selectedSiteId: "site_demo",
      selectedProductId: "product_starter",
      source: "admin-product-provider-sync-api",
      operatorGate:
        "BACKY_COMMERCE_PROVIDER_CERTIFICATION_REQUIRED=1 npm run ci:commerce-provider-certification",
      syncSchemaVersion: "backy.commerce-product-provider-sync.v1",
      site: {
        id: "site_demo",
        slug: "demo",
        name: "Demo",
        status: "published",
      },
      catalogEvidence: {
        hasCatalog: true,
        hasOrderIntake: true,
        productStatus: "published",
        productTitleConfigured: true,
        priceConfigured: true,
      },
      endpointEvidence: {
        providerSync:
          "/api/admin/sites/site_demo/commerce/products/product_starter/provider-sync",
        productSubscriptions:
          "/api/admin/sites/site_demo/commerce/products/product_starter/subscriptions",
        commerceCatalog: "/api/sites/site_demo/commerce/catalog",
        commerceOrderCreate: "/api/sites/site_demo/commerce/orders",
      },
      providerSync: null,
      certificationEvidence: {
        schemaVersion: "backy.product-provider-certification-evidence.v1",
        status: "attention",
        coverage: {
          covered: 4,
          total: 8,
          missing: ["catalog-sync"],
        },
        scenarios: [],
      },
      operatorEvidencePacket: sdkCommerceProductProviderCertificationEvidencePacket,
      secretHandling:
        "Provider credentials stay in server environment/configuration; product provider-sync responses expose only non-secret readiness, scenario counts, endpoint names, and provider-family metadata.",
    },
    storefrontHandoff: {
      schemaVersion: "backy.product-storefront-handoff.v1",
      generatedAt: "2026-05-21T00:00:00.000Z",
      source: "admin-product-provider-sync-api",
      selectedSiteId: "site_demo",
      selectedProductId: "product_starter",
      product: {
        id: "product_starter",
        slug: "starter-template",
        status: "published",
        title: "Starter Template",
        sku: "STARTER",
        productType: "digital",
      },
      endpoints: {
        catalog: "/api/sites/site_demo/commerce/catalog",
        product: "/api/sites/site_demo/commerce/catalog?slug=starter-template",
        orderIntake: "/api/sites/site_demo/commerce/orders",
        events: "/api/sites/site_demo/events?kind=commerce-product",
        providerSync:
          "/api/admin/sites/site_demo/commerce/products/product_starter/provider-sync",
      },
      pricing: {
        price: 29,
        compareAtPrice: null,
        currency: "USD",
      },
      inventory: {},
      media: {},
      merchandising: {},
      design: null,
      designReadiness: {
        schemaVersion: "backy.product-design-readiness.v1",
        status: "attention",
        templateId: null,
        hasDesign: false,
        hasContentDocument: false,
        hasEditableMap: false,
        hasDataBindings: false,
        counts: {
          elements: 0,
          animations: 0,
          assets: 0,
          bindingHints: 0,
        },
        missing: [
          "templateId",
          "contentDocumentOrElements",
          "editableMapOrDataBindings",
        ],
        detail:
          "Product has no custom frontend design envelope; custom frontends can render catalog data but cannot reopen the product page as an editable design.",
        nextAction:
          "Attach a product frontend template or save contentDocument/elements plus editableMap/dataBindings so external builders can edit the product page design.",
        evidence: [
          "template=missing",
          "elements=0",
          "animations=0",
          "assets=0",
          "contentDocument=missing",
          "editableMap=missing",
          "dataBindings=missing",
          "bindingHints=0",
        ],
        secretHandling:
          "Design readiness reports counts, booleans, and editable design-state presence only.",
      },
      delivery: {},
      subscription: {},
      checkout: {
        orderIntakeReady: true,
        directCheckoutUrlConfigured: false,
        mode: "backy-order-intake",
      },
      providerSync: {
        provider: "stripe",
        status: "handoff",
        executionMode: "manual-handoff",
        syncedAt: "2026-05-21T00:00:00.000Z",
        hasProviderProductReference: false,
        hasProviderPriceReference: false,
        hasError: false,
      },
      launchReadiness: {
        schemaVersion: "backy.product-launch-readiness.v1",
        status: "attention",
        score: 75,
        readyCount: 6,
        totalChecks: 8,
        blockerCount: 0,
        attentionCount: 2,
        checks: [
          {
            key: "frontend-design",
            label: "Custom frontend design",
            status: "attention",
            detail: "No editable product design envelope is attached.",
            action: "Attach a product frontend template.",
            evidence: ["template=missing"],
          },
        ],
        nextSteps: [],
      },
      privacy: {
        customerSafeFieldsOnly: true,
        includesProviderSecrets: false,
        includesProviderResponses: false,
        includesPrivateOrders: false,
        includesCustomerPayloads: false,
        includesDigitalDeliveryUrl: false,
        includesRawCheckoutSessions: false,
        excludedFields: ["providerPayload", "privateOrders"],
      },
      secretHandling:
        "Provider credentials and private order payloads stay server-side.",
    },
  },
} satisfies BackyCommerceProductProviderSyncResponse &
  GeneratedBackyOpenApiCommerceProductProviderSyncEnvelope;

const sdkCommerceOrderQuoteEnvelope = {
  success: true,
  requestId: "req_order_quote",
  data: {
    record: {
      id: "order_1001",
      slug: "order-1001",
      status: "draft",
      values: {},
    },
    order: {
      id: "order_1001",
      slug: "order-1001",
      status: "draft",
      values: {},
    },
    quote: {
      schemaVersion: "backy.order-quote.v1",
      subtotal: 100,
      discountAmount: 10,
      taxAmount: 7.5,
      shippingAmount: 5,
      total: 102.5,
      currency: "USD",
      discountCode: "WELCOME10",
      discountRate: 0.1,
      taxLines: [],
      shippingLines: [],
      discountLines: [],
      providerAdjustments: [],
      pricing: {
        taxes: true,
        shipping: true,
        discounts: true,
      },
      calculatedAt: "2026-05-21T00:00:00.000Z",
    },
  },
} satisfies BackyCommerceOrderQuoteResponse;

const sdkCommerceOrderTrackingEnvelope = {
  success: true,
  requestId: "req_order_tracking",
  data: {
    record: {
      id: "order_1001",
      slug: "order-1001",
      status: "draft",
      values: {},
    },
    tracking: {
      status: "in_transit",
      provider: "easypost",
      trackingNumber: "EZ1000000001",
      trackingUrl: "https://track.example.test/EZ1000000001",
      checkedAt: "2026-05-21T00:00:00.000Z",
    },
  },
} satisfies BackyCommerceOrderTrackingResponse;

const sdkCommerceOrderProviderRefundEnvelope = {
  success: true,
  requestId: "req_order_refund",
  data: {
    record: {
      id: "order_1001",
      slug: "order-1001",
      status: "draft",
      values: {},
    },
    refund: {
      id: "rfnd_1001",
      status: "requested",
      provider: "stripe",
      reference: "pi_1001",
      amount: 25,
      currency: "USD",
      reason: "customer_request",
      requestedAt: "2026-05-21T00:00:00.000Z",
      completedAt: null,
      providerPayload: {
        schemaVersion: "backy.provider-refund.v1",
        executionMode: "stripe-api",
      },
    },
  },
} satisfies BackyCommerceOrderProviderRefundResponse;

const sdkCommerceOrderFulfillmentEnvelope = {
  success: true,
  requestId: "req_order_fulfillment",
  data: {
    record: {
      id: "order_1001",
      slug: "order-1001",
      status: "draft",
      values: {},
    },
    fulfillment: {
      id: "ful_1001",
      status: "requested",
      provider: "http",
      orderNumber: "1001",
      requestedAt: "2026-05-21T00:00:00.000Z",
      completedAt: null,
      providerPayload: {
        schemaVersion: "backy.fulfillment-dispatch.v1",
        executionMode: "handoff",
      },
    },
  },
} satisfies BackyCommerceOrderFulfillmentResponse;

const sdkCommerceOrderShippingLabelEnvelope = {
  success: true,
  requestId: "req_order_label",
  data: {
    record: {
      id: "order_1001",
      slug: "order-1001",
      status: "draft",
      values: {},
    },
    label: {
      id: "lbl_1001",
      status: "draft",
      provider: "shippo",
      serviceLevel: "ground",
      url: "https://labels.example.test/lbl_1001.pdf",
      cost: 8.75,
      createdAt: "2026-05-21T00:00:00.000Z",
      providerPayload: {
        schemaVersion: "backy.shipping-label.v1",
        executionMode: "handoff",
      },
    },
  },
} satisfies BackyCommerceOrderShippingLabelResponse;

const sdkCommerceProductSubscriptionsEnvelope = {
  success: true,
  requestId: "req_product_subscriptions",
  data: {
    collection: {
      id: "orders",
      slug: "orders",
      name: "Orders",
    },
    lifecycle: {
      schemaVersion: "backy.product-subscription-lifecycle.v1",
      generatedAt: "2026-05-21T00:00:00.000Z",
      product: {
        id: "product_starter",
        slug: "starter-template",
        title: "Starter template",
        sku: "STARTER",
        subscription: {
          enabled: true,
          interval: "month",
        },
      },
      summary: {
        total: 5,
        active: 4,
        renewals: 0,
        dunning: 1,
        paused: 0,
        trialEnding: 0,
        cancelled: 0,
        pending: 0,
        revenue: 129,
        units: 5,
      },
      actionPlan: {
        schemaVersion: "backy.product-subscription-action-plan-summary.v1",
        attentionRequired: 1,
        executableNow: 0,
        handoffRequired: 1,
        retryRecommended: 0,
      },
      subscriptions: [
        {
          id: "order_1001",
          slug: "order-1001",
          orderNumber: "1001",
          customerName: "Ada Lovelace",
          customerEmail: "ada@example.test",
          paymentProvider: "stripe",
          paymentStatus: "paid",
          fulfillmentStatus: "unfulfilled",
          lifecycleStatus: "active",
          subscriptionReference: "sub_1001",
          actionExecutionMode: "handoff",
          actionExecutionModes: {
            pause: "handoff",
            resume: "handoff",
            cancel: "handoff",
          },
          actionPlan: {
            schemaVersion: "backy.product-subscription-action-plan.v1",
          },
          actionHistory: [],
          lastAction: null,
          checkoutSessionId: "cs_1001",
          total: 29,
          currency: "USD",
          productUnits: 1,
          productRevenue: 29,
          updatedAt: "2026-05-21T00:00:00.000Z",
          matchedItems: [],
        },
      ],
      execution: {
        schemaVersion: "backy.product-subscription-execution-readiness.v1",
        actionEndpoint:
          "/api/admin/sites/:siteId/commerce/products/:productId/subscriptions/:orderId/action",
        supportedActions: ["pause", "resume", "cancel"],
        providers: [
          {
            provider: "stripe",
            executionMode: "stripe-api",
            configured: false,
            referencePattern: "sub_*",
            executableSubscriptions: 0,
            blocker: "Configure Stripe credentials for direct actions.",
          },
        ],
        summary: {
          executableSubscriptions: 0,
          handoffSubscriptions: 1,
        },
      },
      certification: {
        schemaVersion: "backy.product-subscription-certification.v1",
        status: "attention",
        requiredGate: "npm run ci:commerce-provider-certification",
        coverage: {
          covered: 1,
          total: 7,
          missing: ["renewal"],
        },
        scenarios: [
          {
            key: "renewal",
            label: "Renewal",
            evidenceCount: 0,
            expectedEvidence: ["invoice.payment_succeeded"],
            nextAction: "Run provider certification.",
            status: "missing",
          },
        ],
        providerFamilies: ["stripe", "http", "manual-handoff"],
        secretHandling:
          "Provider secrets, customer payloads, and raw order values stay private.",
      },
      contract: {
        ordersApi: "/api/admin/sites/:siteId/commerce/orders",
        webhookApi: "/api/sites/:siteId/commerce/webhook",
        reconciliationApi: "/api/admin/sites/:siteId/commerce/reconcile",
        supportedLifecycleEvents: ["customer.subscription.deleted"],
      },
    },
  },
} satisfies BackyCommerceProductSubscriptionsResponse &
  GeneratedBackyOpenApiCommerceProductSubscriptionsEnvelope;

const sdkCommerceProductSubscriptionActionEnvelope = {
  success: true,
  requestId: "req_product_subscription_action",
  data: {
    action: {
      id: "sub_action_1001",
      schemaVersion: "backy.product-subscription-action.v1",
      action: "pause",
      status: "requested",
      provider: "stripe",
      executionMode: "handoff",
      productId: "product_starter",
      productSlug: "starter-template",
      orderId: "order_1001",
      orderSlug: "order-1001",
      subscriptionReference: "sub_1001",
      reason: "customer_request",
      requestedAt: "2026-05-21T00:00:00.000Z",
      completedAt: null,
      providerPayload: {},
    },
    record: {
      id: "order_1001",
      slug: "order-1001",
      status: "draft",
      values: {},
    },
    order: {
      id: "order_1001",
      slug: "order-1001",
      status: "draft",
      values: {},
    },
  },
} satisfies BackyCommerceProductSubscriptionActionResponse &
  GeneratedBackyOpenApiCommerceProductSubscriptionActionEnvelope;

const sdkCommerceReconciliationEnvelope = {
  success: true,
  requestId: "req_commerce_reconcile",
  data: {
    schemaVersion: "backy.commerce-reconciliation.v1",
    runMode: "manual",
    dryRun: true,
    processedAt: "2026-05-21T00:00:00.000Z",
    limit: 100,
    eventCount: 2,
    eligibleUpdateCount: 1,
    updatedCount: 0,
    unmatchedCount: 1,
    updates: [],
    unmatchedEvents: [],
  },
} satisfies BackyCommerceReconciliationResponse;

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
    fonts: 2,
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
      key: "content-design-modules",
      label: "CMS, design, and reusable content",
      status: "ready",
      detail: "Pages, blog posts, collections, and reusable sections are discoverable.",
      nextAction: "Publish representative content modules for custom frontend rendering.",
    },
    {
      key: "media-font-delivery",
      label: "Media, files, and fonts",
      status: "ready",
      detail: "Public media and font assets are discoverable.",
      nextAction: "Use the media and font endpoints for custom frontend assets.",
    },
    {
      key: "visitor-interactions",
      label: "Forms, comments, and events",
      status: "ready",
      detail: "Interaction endpoints are advertised without exposing private submissions.",
      nextAction: "Bind frontend forms/comments to Backy public endpoints.",
    },
    {
      key: "commerce-handoff",
      label: "Commerce and provider handoff",
      status: "attention",
      detail: "Commerce storefront contracts are documented while provider certification remains separate.",
      nextAction: "Attach commerce provider certification before marking storefront checkout complete.",
      gate: "npm run ci:commerce-provider-certification",
    },
    {
      key: "live-management",
      label: "Preview and live management",
      status: "ready",
      detail: "Preview and live-management endpoint templates are available to authenticated editors.",
      nextAction: "Use live-management endpoint templates for frontend editing overlays.",
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

const settingsCompletionEvidenceArtifacts = [
  {
    key: "settings-provider-certification-json",
    label: "Settings provider certification evidence",
    workflow: ".github/workflows/settings-provider-certification.yml",
    alternateWorkflows: [".github/workflows/backy-release-certification.yml"],
    artifactName: "backy-settings-provider-certification-evidence",
    path: "artifacts/backy-settings-provider-certification.json",
    schemaVersion: "backy.settings-provider-certification-artifact.v1",
    producerEnv: "BACKY_SETTINGS_CERTIFICATION_OUTPUT",
    requiredForReady: true,
    includesSecretValues: false,
  },
] satisfies BackyCompletionEvidenceArtifact[];

const commerceCompletionEvidenceArtifacts = [
  {
    key: "commerce-provider-certification-json",
    label: "Commerce provider certification evidence",
    workflow: ".github/workflows/commerce-provider-certification.yml",
    alternateWorkflows: [".github/workflows/settings-provider-certification.yml", ".github/workflows/backy-release-certification.yml"],
    artifactName: "backy-commerce-provider-certification-evidence",
    path: "artifacts/backy-commerce-provider-certification.json",
    schemaVersion: "backy.commerce-provider-certification-artifact.v1",
    producerEnv: "BACKY_COMMERCE_CERTIFICATION_OUTPUT",
    requiredForReady: true,
    includesSecretValues: false,
  },
] satisfies BackyCompletionEvidenceArtifact[];

const settingsCompletionArtifactVerifier = {
  command: "npm run doctor:release-certification",
  requiredEnv: "BACKY_SETTINGS_CERTIFICATION_ARTIFACT_REQUIRED=1 or BACKY_PROVIDER_CERTIFICATION_ARTIFACTS_REQUIRED=1",
  pathEnv: "BACKY_SETTINGS_CERTIFICATION_ARTIFACT_PATH or BACKY_SETTINGS_CERTIFICATION_ARTIFACT",
  schemaVersion: "backy.settings-provider-certification-artifact.v1",
  validates: ["file exists", "valid JSON", "ok: true", "artifact schema version", "certifiedAtReady", "artifactFreshReady", "artifactAgeHours", "artifactMaxAgeHours", "artifactFutureSkewMinutes", "no-secret boundary", "no raw secret-like values", "apiHandoffs.settingsAdminApi present", "apiHandoffs.siteScopedSettingsApi present", "settingsApiHandoffSchemaReady", "settingsApiHandoffSiteTargetReady", "settingsApiHandoffTargetSiteId", "settingsApiHandoffSettingsSiteSelectorEnv", "settingsApiHandoffCommerceSiteSelectorEnv", "settingsApiHandoffReady", "siteSettingsApiHandoffReady", "settingsScenarioEvidenceReady", "settingsEvidencePacketReady", "settingsCompletionStatusReady"],
  freshnessWindow: {
    maxAgeHoursEnv: "BACKY_PROVIDER_CERTIFICATION_ARTIFACT_MAX_AGE_HOURS",
    defaultMaxAgeHours: 168,
    futureSkewMinutesEnv: "BACKY_PROVIDER_CERTIFICATION_ARTIFACT_FUTURE_SKEW_MINUTES",
    defaultFutureSkewMinutes: 15,
  },
  includesSecretValues: false,
} as const satisfies BackyCompletionArtifactVerifier;

const commerceCompletionArtifactVerifier = {
  command: "npm run doctor:release-certification",
  requiredEnv: "BACKY_COMMERCE_CERTIFICATION_ARTIFACT_REQUIRED=1 or BACKY_PROVIDER_CERTIFICATION_ARTIFACTS_REQUIRED=1",
  pathEnv: "BACKY_COMMERCE_CERTIFICATION_ARTIFACT_PATH or BACKY_COMMERCE_CERTIFICATION_ARTIFACT",
  schemaVersion: "backy.commerce-provider-certification-artifact.v1",
  validates: ["file exists", "valid JSON", "ok: true", "artifact schema version", "certifiedAtReady", "artifactFreshReady", "artifactAgeHours", "artifactMaxAgeHours", "artifactFutureSkewMinutes", "no-secret boundary", "no raw secret-like values", "apiHandoffs present", "apiHandoffs.publicApis present", "apiHandoffReady", "publicCommerceApiHandoffReady", "productApiHandoffSchemaReady", "productApiHandoffSiteTargetReady", "productApiHandoffTargetSiteId", "productApiHandoffReady", "orderApiHandoffSchemaReady", "orderApiHandoffSiteTargetReady", "orderApiHandoffTargetSiteId", "orderApiHandoffReady", "commerceApiHandoffSiteSelectorEnv"],
  freshnessWindow: {
    maxAgeHoursEnv: "BACKY_PROVIDER_CERTIFICATION_ARTIFACT_MAX_AGE_HOURS",
    defaultMaxAgeHours: 168,
    futureSkewMinutesEnv: "BACKY_PROVIDER_CERTIFICATION_ARTIFACT_FUTURE_SKEW_MINUTES",
    defaultFutureSkewMinutes: 15,
  },
  includesSecretValues: false,
} as const satisfies BackyCompletionArtifactVerifier;

const partialClosureReadiness = {
  schemaVersion: "backy.partial-closure-readiness.v1",
  source: "completion-status-handoff",
  status: "external-artifacts-required",
  ready: false,
  readyCount: 0,
  partialCount: 4,
  prototypeCount: 0,
  missingCount: 0,
  total: 4,
  aggregatePreflight: "npm run test:partial-gate-preflights",
  doctorCommand: "npm run doctor:release-certification",
  artifactAdmissionCommand: "npm run ci:provider-artifact-admission",
  artifactAdmissionModes: {
    all: {
      key: "all",
      command: "npm run ci:provider-artifact-admission",
      requiredArtifactKeys: ["settings", "commerce"],
      requiredEnv: "BACKY_PROVIDER_CERTIFICATION_ARTIFACTS_REQUIRED=1",
    },
    settings: {
      key: "settings",
      command: "BACKY_PROVIDER_ARTIFACT_ADMISSION_MODE=settings npm run ci:provider-artifact-admission",
      requiredArtifactKeys: ["settings"],
      requiredEnv: "BACKY_SETTINGS_CERTIFICATION_ARTIFACT_REQUIRED=1",
    },
    commerce: {
      key: "commerce",
      command: "BACKY_PROVIDER_ARTIFACT_ADMISSION_MODE=commerce npm run ci:provider-artifact-admission",
      requiredArtifactKeys: ["commerce"],
      requiredEnv: "BACKY_COMMERCE_CERTIFICATION_ARTIFACT_REQUIRED=1",
    },
  },
  artifactRequiredEnv: "BACKY_PROVIDER_CERTIFICATION_ARTIFACTS_REQUIRED=1",
  artifactBackedDoctorCommand:
    "BACKY_PROVIDER_CERTIFICATION_ARTIFACTS_REQUIRED=1 BACKY_SETTINGS_CERTIFICATION_ARTIFACT_PATH=artifacts/backy-settings-provider-certification.json BACKY_COMMERCE_CERTIFICATION_ARTIFACT_PATH=artifacts/backy-commerce-provider-certification.json npm run doctor:release-certification",
  defaultNoArtifactMode: {
    ready: false,
    readyCount: 0,
    partialCount: 4,
    status: "partial",
  },
  artifactAcceptedMode: {
    ready: true,
    readyCount: 4,
    partialCount: 0,
    status: "ready",
  },
  rows: [
    {
      key: "settings",
      row: "/settings",
      gate: "settings-provider-certification",
      artifactKey: "settings",
      artifactPath: "artifacts/backy-settings-provider-certification.json",
      artifactPathEnv: "BACKY_SETTINGS_CERTIFICATION_ARTIFACT_PATH or BACKY_SETTINGS_CERTIFICATION_ARTIFACT",
      artifactSchemaVersion: "backy.settings-provider-certification-artifact.v1",
      requiredEnv: "BACKY_SETTINGS_CERTIFICATION_ARTIFACT_REQUIRED=1 or BACKY_PROVIDER_CERTIFICATION_ARTIFACTS_REQUIRED=1",
      sourceOnlyGuard: "BACKY_SETTINGS_SOURCE_ONLY=1 npm run test:settings --workspace @backy-cms/admin",
      artifactAdmissionCommand: "BACKY_PROVIDER_ARTIFACT_ADMISSION_MODE=settings npm run ci:provider-artifact-admission",
      status: "partial",
      ready: false,
      artifactAcceptedStatus: "ready",
      nextAction: "Run Settings provider certification, then verify the saved redacted Settings artifact with the release doctor.",
    },
    {
      key: "settings-admin-apis",
      row: "Settings admin APIs",
      gate: "settings-provider-certification",
      artifactKey: "settings",
      artifactPath: "artifacts/backy-settings-provider-certification.json",
      artifactPathEnv: "BACKY_SETTINGS_CERTIFICATION_ARTIFACT_PATH or BACKY_SETTINGS_CERTIFICATION_ARTIFACT",
      artifactSchemaVersion: "backy.settings-provider-certification-artifact.v1",
      requiredEnv: "BACKY_SETTINGS_CERTIFICATION_ARTIFACT_REQUIRED=1 or BACKY_PROVIDER_CERTIFICATION_ARTIFACTS_REQUIRED=1",
      sourceOnlyGuard: "BACKY_SETTINGS_SOURCE_ONLY=1 npm run test:settings --workspace @backy-cms/admin",
      artifactAdmissionCommand: "BACKY_PROVIDER_ARTIFACT_ADMISSION_MODE=settings npm run ci:provider-artifact-admission",
      status: "partial",
      ready: false,
      artifactAcceptedStatus: "ready",
      nextAction: "Archive the typed Settings admin API completion/evidence packet after the Settings artifact passes the release doctor.",
    },
    {
      key: "products",
      row: "/products",
      gate: "commerce-provider-certification",
      artifactKey: "commerce",
      artifactPath: "artifacts/backy-commerce-provider-certification.json",
      artifactPathEnv: "BACKY_COMMERCE_CERTIFICATION_ARTIFACT_PATH or BACKY_COMMERCE_CERTIFICATION_ARTIFACT",
      artifactSchemaVersion: "backy.commerce-provider-certification-artifact.v1",
      requiredEnv: "BACKY_COMMERCE_CERTIFICATION_ARTIFACT_REQUIRED=1 or BACKY_PROVIDER_CERTIFICATION_ARTIFACTS_REQUIRED=1",
      sourceOnlyGuard: "BACKY_COMMERCE_SOURCE_ONLY=1 npm run test:commerce --workspace @backy-cms/admin",
      artifactAdmissionCommand: "BACKY_PROVIDER_ARTIFACT_ADMISSION_MODE=commerce npm run ci:provider-artifact-admission",
      status: "partial",
      ready: false,
      artifactAcceptedStatus: "ready",
      nextAction: "Run Commerce provider certification, then verify the saved redacted Commerce artifact with the release doctor.",
    },
    {
      key: "orders",
      row: "/orders",
      gate: "commerce-provider-certification",
      artifactKey: "commerce",
      artifactPath: "artifacts/backy-commerce-provider-certification.json",
      artifactPathEnv: "BACKY_COMMERCE_CERTIFICATION_ARTIFACT_PATH or BACKY_COMMERCE_CERTIFICATION_ARTIFACT",
      artifactSchemaVersion: "backy.commerce-provider-certification-artifact.v1",
      requiredEnv: "BACKY_COMMERCE_CERTIFICATION_ARTIFACT_REQUIRED=1 or BACKY_PROVIDER_CERTIFICATION_ARTIFACTS_REQUIRED=1",
      sourceOnlyGuard: "BACKY_ORDERS_SOURCE_ONLY=1 npm run test:orders --workspace @backy-cms/admin",
      artifactAdmissionCommand: "BACKY_PROVIDER_ARTIFACT_ADMISSION_MODE=commerce npm run ci:provider-artifact-admission",
      status: "partial",
      ready: false,
      artifactAcceptedStatus: "ready",
      nextAction: "Archive the Orders analytics provider evidence packet after the Commerce artifact passes the release doctor.",
    },
  ],
  privacy: {
    includesSecretValues: false,
    exposesOnlyArtifactPathsAndBooleans: true,
    secretHandling:
      "Partial closure readiness exposes commands, artifact paths, schema names, row mapping, and expected counts only; artifact contents, provider credentials, admin keys, database URLs, customer payloads, and raw provider responses are never returned.",
  },
} as const satisfies NonNullable<BackyCompletionStatus["partialClosureReadiness"]>;

const completionStatus = {
  schemaVersion: "backy.completion-status.v1",
  generatedAt: "2026-05-21T00:00:00.000Z",
  status: "external-gates-required",
  summary:
    "Backy core backend/editor/API parity is implemented for the audited local scope; Forms and SDK database gates are certified, and the remaining Partial rows require live provider certification evidence.",
  audit: {
    source: "specs/page-completion-audit/backy-page-surface-audit.md",
    ready: 41,
    partial: 4,
    prototype: 0,
    missing: 0,
    total: 45,
    readyPercent: 91,
  },
  surfaces: [
    {
      key: "products",
      label: "/products",
      status: "partial",
      blocker: "commerce-provider-certification",
      gate: "npm run ci:commerce-provider-certification",
    },
    {
      key: "orders",
      label: "/orders",
      status: "partial",
      blocker: "commerce-provider-certification",
      gate: "npm run ci:commerce-provider-certification",
    },
    {
      key: "settings",
      label: "/settings",
      status: "partial",
      blocker: "settings-provider-certification",
      gate: "npm run ci:settings-provider-certification",
    },
    {
      key: "settings-admin-apis",
      label: "Settings admin APIs",
      status: "partial",
      blocker: "settings-provider-certification",
      gate: "npm run ci:settings-provider-certification",
    },
  ],
  partialClosureReadiness,
  surfaceRunbooks: [
    {
      key: "settings",
      label: "/settings",
      gate: "settings-provider-certification",
      command: "npm run ci:settings-provider-certification",
      preflight: "npm run test:settings-provider-certification-preflight-contract",
      workflow: ".github/workflows/settings-provider-certification.yml",
      targetInputs: [
        "BACKY_SETTINGS_CERTIFICATION_BASE_URL",
        "BACKY_SETTINGS_CERTIFY_SITE_ID",
        "BACKY_COMMERCE_CERTIFICATION_BASE_URL",
        "BACKY_COMMERCE_CERTIFY_SITE_ID",
        "BACKY_ADMIN_API_KEY or BACKY_SETTINGS_CERTIFICATION_ADMIN_KEY",
      ],
      evidencePacketSchema: "backy.settings-provider-certification-evidence-packet.v1",
      evidenceApi: "/api/admin/settings data.settings.providerCertification.operatorEvidencePacket",
      evidenceUiPanel: "settings-provider-certification-evidence-packet",
      sourceOnlyGuard: "BACKY_SETTINGS_SOURCE_ONLY=1 npm run test:settings --workspace @backy-cms/admin",
      proofSources: [
        "GET /api/admin/settings",
        "apps/admin/src/routes/settings.tsx",
        "scripts/settings-provider-certification-preflight-contract-smoke.mjs",
      ],
      expectedArtifacts: [
        "provider runtime alias summary",
        "operator evidence packet",
        "artifacts/backy-settings-provider-certification.json",
        "backy-settings-provider-certification-evidence",
        "Settings provider workflow summary",
        "release doctor summary",
	      ],
	      evidenceArtifacts: settingsCompletionEvidenceArtifacts,
	      artifactVerifier: settingsCompletionArtifactVerifier,
	      runtime: {
        configuredFamilies: [],
        missingFamilies: ["database", "supabase", "storage", "vercel", "notifications", "commerce"],
      },
      secretBoundary: {
        includesSecretValues: false,
        excludes: ["database URLs", "provider credentials", "service-role keys", "Vercel tokens", "notification secrets", "commerce secrets"],
      },
      nextAction: "Configure database, supabase, storage, vercel, notifications, commerce provider aliases, then run npm run ci:settings-provider-certification.",
    },
    {
      key: "settings-admin-apis",
      label: "Settings admin APIs",
      gate: "settings-provider-certification",
      command: "npm run ci:settings-provider-certification",
      preflight: "npm run test:settings-provider-certification-preflight-contract",
      workflow: ".github/workflows/settings-provider-certification.yml",
      targetInputs: [
        "BACKY_SETTINGS_CERTIFICATION_BASE_URL",
        "BACKY_SETTINGS_CERTIFY_SITE_ID",
        "BACKY_COMMERCE_CERTIFY_SITE_ID",
        "BACKY_ADMIN_API_KEY or BACKY_SETTINGS_CERTIFICATION_ADMIN_KEY",
      ],
      evidencePacketSchema: "backy.settings-provider-certification-evidence-packet.v1",
      evidenceApi: "/api/admin/settings providerCertification plus site OpenAPI AdminSettingsProviderCertification",
      evidenceUiPanel: "settings-provider-certification-evidence-packet",
      sourceOnlyGuard: "BACKY_SETTINGS_SOURCE_ONLY=1 npm run test:settings --workspace @backy-cms/admin",
      proofSources: [
        "GET /api/admin/settings",
        "/api/sites/{siteId}/openapi AdminSettingsProviderCertification",
        "packages/sdk-js/src/generated-contract-types.ts",
      ],
      expectedArtifacts: [
        "typed AdminSettings providerCertification response",
        "operator evidence packet",
        "artifacts/backy-settings-provider-certification.json",
        "backy-settings-provider-certification-evidence",
        "Settings API no-secret response headers",
	      ],
	      evidenceArtifacts: settingsCompletionEvidenceArtifacts,
	      artifactVerifier: settingsCompletionArtifactVerifier,
	      runtime: {
        configuredFamilies: [],
        missingFamilies: ["database", "supabase", "storage", "vercel", "notifications", "commerce"],
      },
      secretBoundary: {
        includesSecretValues: false,
        excludes: ["admin key values", "database URLs", "provider credentials", "service-role keys"],
      },
      nextAction: "Configure database, supabase, storage, vercel, notifications, commerce provider aliases, then re-run the Settings admin API provider gate.",
    },
    {
      key: "products",
      label: "/products",
      gate: "commerce-provider-certification",
      command: "npm run ci:commerce-provider-certification",
      preflight: "npm run test:commerce-provider-certification-preflight-contract",
      workflow: ".github/workflows/commerce-provider-certification.yml",
      targetInputs: [
        "BACKY_COMMERCE_CERTIFICATION_BASE_URL",
        "BACKY_COMMERCE_CERTIFY_SITE_ID",
        "BACKY_ADMIN_API_KEY or BACKY_COMMERCE_CERTIFICATION_ADMIN_KEY",
      ],
      evidencePacketSchema: "backy.commerce-provider-certification-evidence-packet.v1",
      evidenceApi: "/api/admin/sites/{siteId}/commerce/products/{productId}/provider-sync data.providerCertification.operatorEvidencePacket",
      evidenceUiPanel: "products-provider-certification-evidence-packet",
      sourceOnlyGuard: "BACKY_COMMERCE_SOURCE_ONLY=1 npm run test:commerce --workspace @backy-cms/admin",
      proofSources: [
        "apps/admin/src/routes/products.tsx",
        "GET/POST /api/admin/sites/{siteId}/commerce/products/{productId}/provider-sync",
        "scripts/commerce-provider-certification-preflight-contract-smoke.mjs",
      ],
      expectedArtifacts: [
        "product provider-sync evidence",
        "artifacts/backy-commerce-provider-certification.json",
        "backy-commerce-provider-certification-evidence",
        "product storefront handoff",
        "provider catalog sync proof",
        "subscription lifecycle proof when selected",
	      ],
	      evidenceArtifacts: commerceCompletionEvidenceArtifacts,
	      artifactVerifier: commerceCompletionArtifactVerifier,
	      runtime: {
        configuredFamilies: [],
        missingFamilies: ["payment", "tax", "shipping", "discount", "catalog", "subscription", "webhook"],
      },
      secretBoundary: {
        includesSecretValues: false,
        excludes: ["provider secrets", "raw provider responses", "private orders", "customer payloads", "digital delivery URLs"],
      },
      nextAction: "Configure payment, tax, shipping, discount, catalog, subscription, webhook commerce provider aliases, then run npm run ci:commerce-provider-certification.",
    },
    {
      key: "orders",
      label: "/orders",
      gate: "commerce-provider-certification",
      command: "npm run ci:commerce-provider-certification",
      preflight: "npm run test:commerce-provider-certification-preflight-contract",
      workflow: ".github/workflows/commerce-provider-certification.yml",
      targetInputs: [
        "BACKY_COMMERCE_CERTIFICATION_BASE_URL",
        "BACKY_COMMERCE_CERTIFY_SITE_ID",
        "BACKY_ADMIN_API_KEY or BACKY_COMMERCE_CERTIFICATION_ADMIN_KEY",
      ],
      evidencePacketSchema: "backy.order-provider-certification-evidence-packet.v1",
      evidenceApi: "/api/admin/sites/{siteId}/commerce/orders/analytics data.providerCertification.operatorEvidencePacket",
      evidenceUiPanel: "orders-provider-certification-evidence-packet",
      sourceOnlyGuard: "BACKY_ORDERS_SOURCE_ONLY=1 npm run test:orders --workspace @backy-cms/admin",
      proofSources: [
        "apps/admin/src/routes/orders.tsx",
        "GET /api/admin/sites/{siteId}/commerce/orders/analytics",
        "scripts/commerce-provider-certification-preflight-contract-smoke.mjs",
      ],
      expectedArtifacts: [
        "order analytics provider evidence",
        "artifacts/backy-commerce-provider-certification.json",
        "backy-commerce-provider-certification-evidence",
        "status handoff evidence",
        "quote/tracking/fulfillment/refund proof",
        "webhook/reconciliation proof",
	      ],
	      evidenceArtifacts: commerceCompletionEvidenceArtifacts,
	      artifactVerifier: commerceCompletionArtifactVerifier,
	      runtime: {
        configuredFamilies: [],
        missingFamilies: ["payment", "tax", "shipping", "discount", "catalog", "subscription", "webhook"],
      },
      secretBoundary: {
        includesSecretValues: false,
        excludes: ["provider secrets", "customer payloads", "raw order payloads", "payment references", "addresses", "webhook bodies"],
      },
      nextAction: "Configure payment, tax, shipping, discount, catalog, subscription, webhook commerce provider aliases, then run npm run ci:commerce-provider-certification.",
    },
  ],
  certifiedGates: [
    {
      key: "forms-postgres",
      label: "Forms Supabase/Postgres persistence",
      status: "certified",
      command: "npm run ci:forms-postgres",
      workflow: ".github/workflows/forms-postgres-contract.yml",
      affectedSurfaces: ["/forms"],
      certifiedAt: "2026-05-21",
      evidence:
        "Passed against a migrated disposable local Postgres target with form definition, submission, contact, spam/consent, moderation, promotion, and cleanup coverage.",
      runtime: {
        databaseUrlConfigured: false,
        disposableDatabaseConfirmed: false,
        missing: ["BACKY_DATABASE_URL or DATABASE_URL", "BACKY_DATABASE_DISPOSABLE_CONFIRMED=true"],
      },
    },
    {
      key: "sdk-postgres",
      label: "Frontend manifest/OpenAPI/SDK Supabase/Postgres smoke",
      status: "certified",
      command: "npm run ci:sdk-postgres-smoke",
      workflow: ".github/workflows/sdk-postgres-smoke.yml",
      affectedSurfaces: ["Frontend manifest/OpenAPI/SDK APIs"],
      certifiedAt: "2026-05-21",
      evidence:
        "Passed against a migrated disposable local Postgres target with database-mode discovery, manifest, OpenAPI, render, media, CMS, forms, comments, events, commerce, and SDK write-flow coverage.",
      runtime: {
        databaseUrlConfigured: false,
        disposableDatabaseConfirmed: false,
        missing: ["BACKY_DATABASE_URL or DATABASE_URL", "BACKY_DATABASE_DISPOSABLE_CONFIRMED=true"],
      },
    },
  ],
  gates: [
    {
      key: "settings-provider-certification",
      label: "Settings live provider certification",
      status: "blocked-missing-inputs",
      command: "npm run ci:settings-provider-certification",
      preflight: "npm run test:settings-provider-certification-preflight-contract",
      workflow: ".github/workflows/settings-provider-certification.yml",
      affectedSurfaces: ["/settings", "Settings admin APIs"],
      requiredEnvAliases: [
        "BACKY_DATABASE_URL or DATABASE_URL",
        "BACKY_SUPABASE_URL or SUPABASE_URL",
        "BACKY_SUPABASE_SERVICE_ROLE_KEY or SUPABASE_SERVICE_ROLE_KEY",
        "BACKY_VERCEL_TOKEN or VERCEL_TOKEN",
        "notification provider aliases",
        "commerce provider aliases",
      ],
      runtime: {
        configuredFamilies: [],
        missingFamilies: ["database", "supabase", "storage", "vercel", "notifications", "commerce"],
      },
    },
    {
      key: "commerce-provider-certification",
      label: "Commerce live provider certification",
      status: "blocked-missing-inputs",
      command: "npm run ci:commerce-provider-certification",
      preflight: "npm run test:commerce-provider-certification-preflight-contract",
      workflow: ".github/workflows/commerce-provider-certification.yml",
      affectedSurfaces: ["/products", "/orders"],
      requiredEnvAliases: [
        "payment provider aliases",
        "tax provider aliases",
        "shipping provider aliases",
        "discount provider aliases",
        "catalog provider aliases",
        "subscription provider aliases",
        "BACKY_COMMERCE_WEBHOOK_SECRET or COMMERCE_WEBHOOK_SECRET",
      ],
      runtime: {
        configuredFamilies: [],
        missingFamilies: ["payment", "tax", "shipping", "discount", "catalog", "subscription", "webhook"],
      },
    },
  ],
  nextAction:
    "Configure the missing provider families and run npm run ci:settings-provider-certification.",
  recommendedCommands: [
    "npm run ci:settings-provider-certification",
    "npm run ci:commerce-provider-certification",
  ],
  localPreflight: "npm run test:partial-gate-preflights",
  privacy: {
    includesSecretValues: false,
    exposesOnlyAliasPresence: true,
    secretHandling:
      "Completion status exposes audited counts, gate names, workflow paths, env alias presence, and missing provider families only; database URLs, provider keys, admin keys, and customer/order/submission payloads are never returned.",
  },
} satisfies BackyCompletionStatus & GeneratedBackyFrontendManifestCompletionStatus & GeneratedBackyOpenApiBackyCompletionStatus;

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
    mediaId: "media_hero",
    fontMediaId: "media_font_inter",
    imageFocalPoint: { x: 50, y: 42 },
  },
  assetIds: ["media_hero", "media_font_inter"],
  tokenRefs: {
    "styles.color": "colors.primary",
  },
  responsive: {
    mobile: {
      x: 24,
      width: 320,
      props: {
        content: "Mobile rounds",
      },
      styles: {
        color: "#111827",
      },
      tokenRefs: {
        "styles.color": "colors.primary",
      },
    },
  },
  animation: {
    type: "fadeIn",
    duration: 0.2,
    easing: "cubic-bezier(0.2, 0, 0, 1)",
    trigger: "load",
    tokenRefs: {
      duration: "motion.duration.normal",
      easing: "motion.easing.standard",
    },
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

const editableGroupingContentForHelpers: BackyEditableContent = {
  elements: [
    {
      id: "helper-card-title",
      type: "heading",
      x: 24,
      y: 32,
      width: 280,
      height: 48,
      zIndex: 1,
      children: [],
      props: { content: "Card title" },
      responsive: {
        tablet: { x: 16, width: 240 },
      },
    },
    {
      id: "helper-card-button",
      type: "button",
      x: 24,
      y: 104,
      width: 180,
      height: 44,
      zIndex: 2,
      children: [],
      props: { label: "Start" },
      styles: { backgroundColor: "#111827", color: "#ffffff" },
      responsive: {
        tablet: { x: 16, y: 92, width: 160 },
      },
    },
  ],
  canvasSize: { width: 1200, height: 760 },
};

const groupedEditableContent: BackyContentGroupResult | null = groupBackyContentElements(
  editableGroupingContentForHelpers,
  ["helper-card-title", "helper-card-button"],
  { groupId: "helper-card-group", name: "Helper card group" },
);
const ungroupedEditableContent: BackyContentUngroupResult | null = groupedEditableContent
  ? ungroupBackyContentElements(
    groupedEditableContent.content,
    ["helper-card-group"],
  )
  : null;

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
const mediaPatchedEditableContent = patchBackyContentElement(
  editableContentForHelpers,
  {
    elementId: "interactive-rounds",
    changes: {
      "props.mediaId": "media_alt",
      "props.mediaIds": ["media_gallery_alt"],
      "props.backgroundMediaIds": ["media_background_alt"],
      "props.posterMediaIds": ["media_poster_alt"],
      "props.fontMediaId": "media_font_alt",
      "props.fontMediaIds": ["media_font_gallery_alt"],
    },
  },
);
const mediaPatchedEditableElement = mediaPatchedEditableContent
  ? findBackyContentElement(mediaPatchedEditableContent, "interactive-rounds")
  : null;
const mediaPatchedEditableAssetIds = Array.isArray(mediaPatchedEditableElement?.assetIds)
  ? mediaPatchedEditableElement.assetIds
  : [];
const responsivePatchedEditableContent = patchBackyContentEditableFields(
  editableContentForHelpers,
  [
    {
      elementId: "interactive-rounds",
      field: "responsive.mobile.styles.color",
      value: "#0f172a",
    },
    {
      elementId: "interactive-rounds",
      field: "tokenRefs.styles.color",
      value: "colors.text",
    },
    {
      elementId: "interactive-rounds",
      field: "responsive.mobile.props.content",
      value: "Mobile rounds edited from a custom frontend",
    },
    {
      elementId: "interactive-rounds",
      field: "responsive.mobile.props.mediaId",
      value: "media_mobile_hero",
    },
    {
      elementId: "interactive-rounds",
      field: "responsive.mobile.props.mediaIds",
      value: ["media_mobile_gallery"],
    },
    {
      elementId: "interactive-rounds",
      field: "responsive.mobile.props.posterMediaIds",
      value: ["media_mobile_poster"],
    },
    {
      elementId: "interactive-rounds",
      field: "responsive.tablet.width",
      value: 520,
    },
  ],
);
const responsiveEditableMapForContentHelpers = {
  "interactive.mobile.color": {
    elementId: "interactive-rounds",
    targetPath: "responsive.mobile.styles.color",
    editable: true,
  },
  "interactive.mobile.token-color": {
    elementId: "interactive-rounds",
    targetPath: "responsive.mobile.tokenRefs.styles.color",
    editable: true,
  },
};
const responsiveEditableMapPatchedContent = patchBackyContentEditableMapValues(
  editableContentForHelpers,
  responsiveEditableMapForContentHelpers,
  {
    "interactive.mobile.color": "#111827",
    "interactive.mobile.token-color": "colors.primary",
  },
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
const addedEditableElement: BackyContentAddElementResult | null = addBackyContentElement(
  editableContentForHelpers,
  {
    id: "helper-added-button",
    type: "button",
    x: 32,
    y: 172,
    width: 180,
    height: 44,
    props: { label: "Added" },
  },
  { parentId: "helper-card", index: 2 },
);
const duplicatedEditableElement: BackyContentDuplicateElementResult | null = addedEditableElement
  ? duplicateBackyContentElement(
    addedEditableElement.content,
    "helper-added-button",
    { duplicateId: "helper-added-button-copy", idSuffix: "helper-copy" },
  )
  : null;
const transformedEditableElement: BackyContentTransformElementsResult | null = duplicatedEditableElement
  ? transformBackyContentElements(
    duplicatedEditableElement.content,
    [
      { elementId: "helper-added-button-copy", deltaX: 16, width: 220 },
      { elementId: "helper-card-title", y: 24, breakpoint: "mobile" },
    ],
  )
  : null;
const deletedEditableElement: BackyContentDeleteElementsResult | null = transformedEditableElement
  ? deleteBackyContentElements(
    transformedEditableElement.content,
    ["helper-added-button-copy"],
  )
  : null;
const editableMapFieldPatch = {
  elementId: "interactive-rounds",
  field: "props.rounds",
  value: 6,
} satisfies BackyContentEditableFieldPatch;
const editableMapPatchedContent = patchBackyContentEditableField(
  editableContentForHelpers,
  editableMapFieldPatch,
);
const editableMapBulkPatchedContent = patchBackyContentEditableFields(
  editableContentForHelpers,
  [
    editableMapFieldPatch,
    {
      elementId: "editable-helper-nested-message",
      field: "props.content",
      value: "Nested editable-map field update",
    },
  ],
);
const editableMapForContentHelpers = {
  "interactive.rounds": {
    elementId: "interactive-rounds",
    field: "props.rounds",
    editable: true,
    valueType: "number",
  },
  "nested.message": {
    elementId: "editable-helper-nested-message",
    field: "props.content",
    editable: true,
    valueType: "string",
  },
} satisfies GeneratedBackyEditableMap;
const keyedEditableMapPatchedContent = patchBackyContentEditableMapEntry(
  editableContentForHelpers,
  editableMapForContentHelpers,
  {
    key: "interactive.rounds",
    value: 7,
  } satisfies BackyContentEditableMapPatch,
);
const keyedEditableMapBulkPatchedContent = patchBackyContentEditableMapEntries(
  editableContentForHelpers,
  editableMapForContentHelpers,
  [
    { key: "interactive.rounds", value: 8 },
    { key: "nested.message", value: "Nested keyed editable-map update" },
  ],
);
const keyedEditableMapValuesPatchedContent = patchBackyContentEditableMapValues(
  editableContentForHelpers,
  editableMapForContentHelpers,
  {
    "interactive.rounds": 9,
    "nested.message": "Nested keyed editable-map values update",
  },
);
const liveManagedPageUpdateFromEditableMap =
  buildBackyLiveManagedPageEditableMapUpdate(
    {
      id: "page-editable-map",
      title: "Editable map page",
      slug: "editable-map-page",
      updatedAt: "2026-05-21T00:00:00.000Z",
      content: editableContentForHelpers,
    },
    editableMapForContentHelpers,
    {
      "interactive.rounds": 10,
    },
    { requestId: "sdk-editable-map-page-update" },
  );
const liveManagedPostUpdateFromEditableMap =
  buildBackyLiveManagedBlogPostEditableMapUpdate(
    {
      id: "post-editable-map",
      title: "Editable map post",
      slug: "editable-map-post",
      updatedAt: "2026-05-21T00:00:00.000Z",
      content: editableContentForHelpers,
    },
    editableMapForContentHelpers,
    {
      "nested.message": "Blog post editable-map values update",
    },
    { requestId: "sdk-editable-map-post-update" },
  );

void patchedEditableContent;
void mediaPatchedEditableContent;
void mediaPatchedEditableElement;
void mediaPatchedEditableAssetIds;
void responsivePatchedEditableContent;
void responsiveEditableMapPatchedContent;
void foundEditableElement;
void bulkPatchedEditableContent;
void editableElementDescriptors;
void editableMapPatchedContent;
void editableMapBulkPatchedContent;
void keyedEditableMapPatchedContent;
void keyedEditableMapBulkPatchedContent;
void keyedEditableMapValuesPatchedContent;
void liveManagedPageUpdateFromEditableMap;
void liveManagedPostUpdateFromEditableMap;

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
  mediaId: "media_font_inter_regular",
  family: "Inter",
  source: "uploaded",
  url: "/media/fonts/inter.woff2",
  weights: ["400", "700"],
  styles: ["normal", "italic"],
  fallbackStack: "system-ui, sans-serif",
  display: "swap",
  cssFamily: '"Inter", system-ui, sans-serif',
  assetIds: ["media_font_inter_regular", "media_font_inter_italic"],
  variants: [
    {
      id: "media_font_inter_regular:400:normal",
      mediaId: "media_font_inter_regular",
      family: "Inter",
      weight: "400",
      style: "normal",
      display: "swap",
      fallbackStack: "system-ui, sans-serif",
      cssFamily: '"Inter", system-ui, sans-serif',
      url: "/media/fonts/inter.woff2",
      mimeType: "font/woff2",
      originalName: "inter-regular.woff2",
      folderId: "folder_fonts",
      tags: ["brand-font"],
    },
    {
      id: "media_font_inter_italic:700:italic",
      mediaId: "media_font_inter_italic",
      family: "Inter",
      weight: "700",
      style: "italic",
      display: "optional",
      fallbackStack: "system-ui, sans-serif",
      cssFamily: '"Inter", system-ui, sans-serif',
      url: "/media/fonts/inter-700-italic.woff2",
      mimeType: "font/woff2",
      originalName: "inter-700-italic.woff2",
      folderId: "folder_fonts",
      tags: ["brand-font", "italic"],
    } satisfies GeneratedBackyPublicRenderPayloadFontVariant,
  ],
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

const renderProductDesignReadiness = {
  schemaVersion: "backy.product-design-readiness.v1",
  status: "ready",
  templateId: "product-template",
  hasDesign: true,
  hasContentDocument: true,
  hasEditableMap: true,
  hasDataBindings: true,
  counts: {
    elements: 2,
    animations: 1,
    assets: 1,
    bindingHints: 1,
  },
  missing: [],
  detail: "Product carries editable custom frontend design state.",
  nextAction: "Keep the product template and editable map attached.",
  evidence: ["template=product-template", "animations=1"],
  secretHandling: "Design readiness excludes provider secrets and private order data.",
} satisfies GeneratedBackyPublicRenderPayloadProductDesignReadiness;

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
    title: "Home",
    version: "2026-05-22T00:00:00.000Z",
    elements: [element],
    customCSS: ".hero{color:#111827}",
    customJS: "window.backyHeroReady=true;",
    contentDocument: {
      schemaVersion: "backy.content.v1",
      id: "page_home",
      kind: "page",
      title: "Home",
      version: "2026-05-22T00:00:00.000Z",
      elements: [element],
      themeTokenRefs: {
        color: "colors.primary",
      },
      assets: {
        media: [
          {
            id: "media_hero",
            type: "image",
            url: "/api/sites/site_demo/media/media_hero/file",
          },
        ],
      },
      interactions: {
        actions: {
          schemaVersion: "backy.actions.v1",
          actions: [],
        },
      },
      seo: {
        title: "Home",
      },
      dataBindings: {
        datasets: [],
        bindings: [],
      },
      editableMap,
      metadata: {
        customCSS: ".hero{color:#111827}",
      },
    },
    themeTokenRefs: {
      color: "colors.primary",
    },
    assets: {
      media: [
        {
          id: "media_hero",
          type: "image",
          url: "/api/sites/site_demo/media/media_hero/file",
        },
      ],
    },
    animations: [
      {
        id: "hero-intro",
        targetId: "hero",
        type: "fadeIn",
      },
    ],
    interactions: {
      actions: {
        schemaVersion: "backy.actions.v1",
        actions: [],
      },
    },
    dataBindings: {
      datasets: [],
      bindings: [],
    },
    editableMap,
    seo: {
      title: "Home",
    },
    metadata: {
      editor: "custom-frontend",
    },
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

const dynamicProductRenderPayload = {
  ...renderPayload,
  route: {
    type: "dynamicItem",
    path: "/products/sdk-product",
    status: "published",
    canonical: "/products/sdk-product",
    params: {
      collectionSlug: "products",
      recordSlug: "sdk-product",
    },
    resource: {
      id: "product_sdk",
      kind: "dynamicItem",
      collectionSlug: "products",
      designReadiness: renderProductDesignReadiness,
    },
  },
  content: {
    ...renderPayload.content,
    id: "product_sdk",
    kind: "dynamicItem",
  },
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

const sdkManifestFormsManagementPolicy = {
  schemaVersion: "backy.forms-management.v1",
  endpoints: {
    adminList: "/api/admin/sites/site_demo/forms",
    create: "/api/admin/sites/site_demo/forms",
    detail: "/api/admin/sites/site_demo/forms/{formId}",
    clone: "/api/admin/sites/site_demo/forms/{formId}/clone",
    embedBlock: "/api/admin/sites/site_demo/forms/{formId}/embed-block",
    analytics: "/api/admin/sites/site_demo/forms/analytics",
    contactSegments: "/api/admin/sites/site_demo/forms/contact-segments",
    contactLists: "/api/admin/sites/site_demo/forms/contact-lists",
    consentRetention: "/api/admin/sites/site_demo/forms/consent-retention",
    submissions: "/api/admin/sites/site_demo/forms/{formId}/submissions",
    submission: "/api/admin/sites/site_demo/forms/{formId}/submissions/{submissionId}",
    reviewSubmission: "/api/admin/sites/site_demo/forms/{formId}/submissions/{submissionId}/review",
    retryWebhook: "/api/admin/sites/site_demo/forms/{formId}/submissions/{submissionId}/webhook-retry",
    retryEmail: "/api/admin/sites/site_demo/forms/{formId}/submissions/{submissionId}/email-retry",
    formConsentRetention: "/api/admin/sites/site_demo/forms/{formId}/consent-retention",
    contacts: "/api/admin/sites/site_demo/forms/{formId}/contacts",
    contact: "/api/admin/sites/site_demo/forms/{formId}/contacts/{contactId}",
    importContacts: "/api/admin/sites/site_demo/forms/{formId}/contacts/import",
    syncContacts: "/api/admin/sites/site_demo/forms/{formId}/contacts/sync",
    promoteContactUser: "/api/admin/sites/site_demo/forms/{formId}/contacts/{contactId}/promote",
    promoteContactCustomer: "/api/admin/sites/site_demo/forms/{formId}/contacts/{contactId}/promote-customer",
    contactConsentRetention: "/api/admin/sites/site_demo/forms/{formId}/contacts/consent-retention",
  },
  methods: {
    list: "GET",
    create: "POST",
    update: "PATCH",
    delete: "DELETE",
    clone: "POST",
    embedBlock: "POST",
    analytics: "GET",
    contactSegments: "GET",
    contactLists: "GET",
    saveContactList: "POST",
    deleteContactList: "DELETE",
    consentRetention: "POST",
    submissions: "GET",
    submission: "GET",
    updateSubmission: "PATCH",
    reviewSubmission: "POST",
    retryWebhook: "POST",
    retryEmail: "POST",
    formConsentRetention: "POST",
    contacts: "GET",
    createContact: "POST",
    updateContact: "PATCH",
    deleteContact: "DELETE",
    importContacts: "POST",
    syncContacts: "POST",
    promoteContactUser: "POST",
    promoteContactCustomer: "POST",
    contactConsentRetention: "POST",
  },
  auth: {
    modes: ["session", "api-key"],
    headers: ["Authorization", "x-backy-admin-session", "x-backy-admin-key", "x-api-key"],
    requiredPermissions: {
      read: "forms.view",
      create: "forms.create",
      update: "forms.edit",
      manage: "forms.manage",
      export: "forms.export",
      delete: "forms.delete",
      activity: "activity.export",
    },
    siteScope: true,
  },
  sdkHelpers: {
    list: "adminForms",
    create: "createAdminForm",
    detail: "adminForm",
    update: "updateAdminForm",
    delete: "deleteAdminForm",
    clone: "cloneAdminForm",
    embedBlock: "createAdminFormEmbedBlock",
    analytics: "formsAnalytics",
    contactSegments: "formContactSegments",
    contactLists: "formContactLists",
    saveContactList: "saveFormContactList",
    deleteContactList: "deleteFormContactList",
    submissions: "formSubmissions",
    submission: "formSubmission",
    updateSubmission: "updateFormSubmission",
    reviewSubmission: "reviewFormSubmission",
    retryWebhook: "retryFormSubmissionWebhook",
    retryEmail: "retryFormSubmissionEmail",
    formConsentRetention: "applyAdminFormConsentRetention",
    formsConsentRetention: "applyAdminFormsConsentRetention",
    contacts: "formContacts",
    createContact: "createFormContact",
    updateContact: "updateFormContact",
    importContacts: "importFormContactsCsv",
    syncContacts: "syncFormContacts",
    promoteContactUser: "promoteFormContactToUser",
    promoteContactCustomer: "promoteFormContactToCustomer",
    contactConsentRetention: "applyFormContactConsentRetention",
  },
  responseContracts: {
    list: "backy.admin-forms.v1",
    item: "backy.admin-form.v1",
    persistenceCertification: "backy.forms-persistence-certification.v1",
    scenarioEvidence: "backy.forms-persistence-scenario-evidence.v1",
    embedBlock: "backy.form-embed-block.v1",
    submissions: "backy.form-submissions.v1",
    submission: "backy.form-submission.v1",
    deliveryRetry: "backy.form-delivery-retry.v1",
    contacts: "backy.form-contacts.v1",
    contact: "backy.form-contact.v1",
    contactSegments: "backy.form-contact-segments.v1",
    contactLists: "backy.form-contact-lists.v1",
    consentRetention: "backy.form-consent-retention.v1",
  },
  privacy: {
    publicDefinitionsExcludeSubmissions: true,
    submissionsArePrivate: true,
    contactsArePrivate: true,
    deliveryRetriesMayContainVisitorPayloads: true,
    databaseCredentialsNeverReturned: true,
  },
  secretHandling:
    "Forms management routes require authenticated admin requests; discovery exposes only route templates, permission names, SDK helper names, and non-secret persistence certification gates.",
} satisfies BackyManifestFormsRuntimeModule["managementPolicy"] & GeneratedBackyOpenApiFormsManagementPolicy;

const sdkManifestMediaManagementPolicy = {
  schemaVersion: "backy.media-management.v1",
  endpoints: {
    adminList: "/api/admin/sites/site_demo/media",
    upload: "/api/admin/sites/site_demo/media",
    detail: "/api/admin/sites/site_demo/media/{mediaId}",
    folders: "/api/admin/sites/site_demo/media/folders",
    folderDetail: "/api/admin/sites/site_demo/media/folders/{folderId}",
    versions: "/api/admin/sites/site_demo/media/{mediaId}/versions",
    version: "/api/admin/sites/site_demo/media/{mediaId}/versions/{versionId}",
    signedUrl: "/api/admin/sites/site_demo/media/{mediaId}/signed-url",
    bind: "/api/admin/sites/site_demo/media/{mediaId}/bind",
    transforms: "/api/admin/sites/site_demo/media/{mediaId}/transforms",
    providerAnalytics: "/api/admin/sites/site_demo/media/provider-analytics",
  },
  methods: {
    list: "GET",
    upload: "POST",
    update: "PATCH",
    replace: "POST",
    delete: "DELETE",
    folders: "GET",
    createFolder: "POST",
    updateFolder: "PATCH",
    deleteFolder: "DELETE",
    versions: "GET",
    restoreVersion: "POST",
    deleteVersion: "DELETE",
    signedUrl: "POST",
    bind: "POST",
    transforms: "POST",
    providerAnalytics: "POST",
  },
  auth: {
    modes: ["session", "api-key"],
    headers: ["Authorization", "x-backy-admin-session", "x-backy-admin-key", "x-api-key"],
    requiredPermissions: {
      read: "media.view",
      create: "media.create",
      update: "media.edit",
      delete: "media.delete",
      privateDelivery: "media.view",
    },
    siteScope: true,
  },
  uploadFields: [
    "file",
    "filename",
    "folderId",
    "scope",
    "scopeTargetId",
    "visibility",
    "tags",
    "metadata",
    "altText",
    "caption",
    "fontFamily",
    "fontWeight",
    "fontStyle",
    "fontFallback",
    "fontDisplay",
    "uploadedBy",
  ],
  filters: {
    types: ["image", "video", "audio", "document", "file", "font", "other", "all"],
    typeAliases: {
      file: ["document", "other"],
    },
    visibility: ["public", "private", "all"],
    scopes: ["global", "page", "post", "all"],
    queryParams: [
      "type",
      "visibility",
      "scope",
      "global",
      "search",
      "tag",
      "folderId",
      "pageId",
      "postId",
      "blogId",
      "limit",
      "offset",
    ],
    maxLimit: 100,
    aliases: {
      blogId: "postId",
      fileType: "file",
    },
  },
  sdkHelpers: {
    list: "adminMedia",
    upload: "uploadMedia",
    update: "updateAdminMedia",
    replace: "replaceMedia",
    delete: "deleteAdminMedia",
    folders: "adminMediaFolders",
    createFolder: "createMediaFolder",
    updateFolder: "updateMediaFolder",
    deleteFolder: "deleteMediaFolder",
    versions: "adminMediaVersions",
    restoreVersion: "restoreMediaVersion",
    deleteVersion: "deleteMediaVersion",
    signedUrl: "createMediaSignedUrl",
    bind: "bindMedia",
    transforms: "prepareMediaTransforms",
    providerAnalytics: "ingestMediaProviderAnalytics",
  },
  responseContracts: {
    list: "backy.admin-media-list.v1",
    item: "backy.admin-media.v1",
    folders: "backy.media-folders.v1",
    versions: "backy.media-versions.v1",
    signedUrl: "backy.media-signed-url.v1",
    binding: "backy.media-binding.v1",
    transforms: "backy.media-transforms.v1",
  },
  auditing: {
    create: "media.created",
    update: "media.updated",
    replace: "media.replaced",
    delete: "media.deleted",
    bind: "media.bound",
    unbind: "media.unbound",
  },
  secretHandling:
    "Upload requests are authenticated admin multipart requests; private delivery uses short-lived signed URLs and never publishes private file tokens in manifest responses.",
} satisfies BackyManifestMediaModule["managementPolicy"];

const sdkManifestContentLifecycle = {
  schemaVersion: "backy.content-lifecycle-commands.v1",
  cloneField: "frontendDesignTemplateId",
  permissions: {
    read: "pages.view",
    create: "pages.edit",
    update: "pages.edit",
    delete: "pages.delete",
    publish: "pages.publish",
  },
  sdkHelpers: {
    listPages: "adminPages",
    createPage: "createAdminPage",
    readPage: "adminPage",
    updatePage: "updateAdminPage",
    deletePage: "deleteAdminPage",
    pageReadiness: "adminPageReadiness",
    publishPage: "publishAdminPage",
    archivePage: "archiveAdminPage",
    createPagePreview: "createAdminPagePreviewToken",
    pageRevisions: "adminPageRevisions",
    rollbackPage: "rollbackAdminPage",
    listPosts: "adminBlogPosts",
    createPost: "createAdminBlogPost",
    readPost: "adminBlogPost",
    updatePost: "updateAdminBlogPost",
    deletePost: "deleteAdminBlogPost",
    postReadiness: "adminBlogPostReadiness",
    publishPost: "publishAdminBlogPost",
    archivePost: "archiveAdminBlogPost",
    createPostPreview: "createAdminBlogPostPreviewToken",
    postRevisions: "adminBlogPostRevisions",
    rollbackPost: "rollbackAdminBlogPost",
  },
  requestBodies: {
    createPage: {
      templateClone: "{ title, slug?, status?, frontendDesignTemplateId?, content?, meta? }",
      designState: "content may carry elements, contentDocument, customCSS, customJS, themeTokenRefs, assets, animations, interactions, dataBindings, editableMap, seo, and metadata.",
    },
    createPost: {
      templateClone: "{ title, slug?, status?, frontendDesignTemplateId?, content?, meta?, excerpt?, authorId?, categoryIds?, tagIds? }",
      designState: "content may carry elements, contentDocument, customCSS, customJS, themeTokenRefs, assets, animations, interactions, dataBindings, editableMap, seo, and metadata.",
    },
  },
  responseContracts: {
    pageRevisions: "backy.admin-page-revisions.v1",
    postRevisions: "backy.admin-blog-post-revisions.v1",
    revisionBranchMetadata: "backy.content-revision-branch-metadata.v1",
    branchMetadataField: "revision.branchMetadata",
    pageRollbackRequest: "backy.admin-page-rollback-request.v1",
    postRollbackRequest: "backy.admin-blog-post-rollback-request.v1",
  } as const,
} satisfies BackyManifestContentLifecycleCommands;

const sdkManifestEditorCommandRegistry = {
  schemaVersion: "backy.editor-command-registry.v1",
  source: "live-management-discovery",
  generatedFrom: "page-editor",
  stateModel: {
    runtimeState: "computed-by-editor-client",
    stateValues: ["ready", "disabled", "hidden"],
    reasonField: "reason",
    selectionFields: ["selectedIds", "selectedEntriesShareParent"],
    clipboardFields: ["clipboardElements", "pasteTargetMode"],
    documentFields: ["canEdit", "canPublish", "isSaving", "isPreview"],
  },
  categories: [
    {
      id: "composition",
      label: "Composition",
      commandIds: ["group-selection", "ungroup-selection"],
    },
    {
      id: "layer-state",
      label: "Layer state",
      commandIds: ["toggle-selection-visibility"],
    },
    {
      id: "view",
      label: "View",
      commandIds: ["toggle-grid"],
    },
    {
      id: "workflow",
      label: "Workflow",
      commandIds: ["save-page"],
    },
  ],
  commands: [
    {
      id: "group-selection",
      label: "Group selected sibling layers",
      category: "composition",
      targetScope: "selected-sibling-scope",
      shortcut: "Cmd/Ctrl+G",
      ariaKeyshortcuts: "Control+G Meta+G",
      testId: "editor-group-selection",
      minSelected: 2,
      sameParentRequired: true,
      unlockedRequired: true,
      sdkHelper: "groupBackyContentElements",
      stateRule: "ready when at least two selected layers are unlocked siblings",
    },
    {
      id: "toggle-selection-visibility",
      label: "Toggle selected layer visibility",
      category: "layer-state",
      targetScope: "selected-layers",
      testId: "editor-toggle-selection-visibility",
      minSelected: 1,
      unlockedRequired: true,
      sdkHelper: "patchBackyContentElements",
      targetPaths: ["visible"],
      stateRule: "ready when selected layers are not locked",
    },
    {
      id: "toggle-grid",
      label: "Toggle grid visibility",
      category: "view",
      targetScope: "viewport",
      shortcut: "G",
      ariaKeyshortcuts: "G",
      testId: "editor-grid-visibility-toggle",
      stateRule: "ready outside preview mode",
    },
    {
      id: "save-page",
      label: "Save page, post, or section",
      category: "workflow",
      targetScope: "document",
      shortcut: "Ctrl+S",
      testId: "editor-save-page",
      apiHelper: "updateAdminPage or updateAdminBlogPost",
      stateRule: "ready when save controls are visible, the editor is not saving, and canEdit is true",
    },
  ],
  privacy: {
    includesSecretValues: false,
    includesAdminSessionValues: false,
    endpointTemplatesOnly: true,
  },
} satisfies BackyManifestEditorCommandRegistry;

const sdkManifestPagesManagementPolicy = {
  schemaVersion: "backy.pages-management.v1" as "backy.pages-management.v1",
  cloneField: "frontendDesignTemplateId",
  endpoints: {
    list: "/api/admin/sites/site_demo/pages",
    create: "/api/admin/sites/site_demo/pages",
    detail: "/api/admin/sites/site_demo/pages/{pageId}",
    readiness: "/api/admin/sites/site_demo/pages/{pageId}/readiness",
    publish: "/api/admin/sites/site_demo/pages/{pageId}/publish",
    archive: "/api/admin/sites/site_demo/pages/{pageId}/archive",
    preview: "/api/admin/sites/site_demo/pages/{pageId}/preview",
    revisions: "/api/admin/sites/site_demo/pages/{pageId}/revisions",
    rollback: "/api/admin/sites/site_demo/pages/{pageId}/rollback",
    templateRegistry: "/api/admin/sites/site_demo/templates?type=page",
  },
  methods: {
    list: "GET",
    create: "POST",
    read: "GET",
    update: "PATCH",
    delete: "DELETE",
    readiness: "GET",
    publish: "POST",
    archive: "POST",
    preview: "POST",
    revisions: "GET",
    rollback: "POST",
  },
  auth: {
    modes: ["session", "api-key"],
    headers: ["Authorization", "x-backy-admin-session", "x-backy-admin-key", "x-api-key"],
    requiredPermissions: {
      read: "pages.view",
      create: "pages.edit",
      update: "pages.edit",
      delete: "pages.delete",
      publish: "pages.publish",
    },
    siteScope: true,
  },
  sdkHelpers: {
    list: "adminPages",
    create: "createAdminPage" as "createAdminPage",
    read: "adminPage",
    update: "updateAdminPage",
    delete: "deleteAdminPage",
    readiness: "adminPageReadiness",
    publish: "publishAdminPage",
    archive: "archiveAdminPage",
    preview: "createAdminPagePreviewToken" as "createAdminPagePreviewToken",
    revisions: "adminPageRevisions",
    rollback: "rollbackAdminPage",
  } as const,
  responseContracts: {
    list: "backy.admin-pages.v1",
    detail: "backy.admin-page.v1",
    readiness: "backy.page-readiness.v1",
    preview: "backy.preview-token.v1",
    revisions: "backy.admin-page-revisions.v1",
    revisionBranchMetadata: "backy.content-revision-branch-metadata.v1",
  },
  designState: {
    acceptsContentDocument: true,
    acceptsCanvasElements: true,
    acceptsFrontendDesignTemplateId: true,
    preservesCustomCssJs: true,
    preservesAssetsAnimationsInteractions: true,
    preservesEditableMapAndDataBindings: true,
  },
  privacy: {
    routesRequireAuthenticatedAdmin: true,
    publicManifestExposesEndpointTemplatesOnly: true,
    adminSessionsAndApiKeysNeverReturned: true,
  },
} satisfies BackyManifestContentManagementPolicy;

const sdkManifestBlogManagementPolicy = {
  schemaVersion: "backy.blog-management.v1" as "backy.blog-management.v1",
  cloneField: "frontendDesignTemplateId",
  endpoints: {
    list: "/api/admin/sites/site_demo/blog",
    create: "/api/admin/sites/site_demo/blog",
    detail: "/api/admin/sites/site_demo/blog/{postId}",
    readiness: "/api/admin/sites/site_demo/blog/{postId}/readiness",
    publish: "/api/admin/sites/site_demo/blog/{postId}/publish",
    archive: "/api/admin/sites/site_demo/blog/{postId}/archive",
    preview: "/api/admin/sites/site_demo/blog/{postId}/preview",
    revisions: "/api/admin/sites/site_demo/blog/{postId}/revisions",
    rollback: "/api/admin/sites/site_demo/blog/{postId}/rollback",
    templateRegistry: "/api/admin/sites/site_demo/templates?type=blogPost",
  },
  methods: {
    list: "GET",
    create: "POST",
    read: "GET",
    update: "PATCH",
    delete: "DELETE",
    readiness: "GET",
    publish: "POST",
    archive: "POST",
    preview: "POST",
    revisions: "GET",
    rollback: "POST",
  },
  auth: {
    modes: ["session", "api-key"],
    headers: ["Authorization", "x-backy-admin-session", "x-backy-admin-key", "x-api-key"],
    requiredPermissions: {
      read: "pages.view",
      create: "pages.edit",
      update: "pages.edit",
      delete: "pages.delete",
      publish: "pages.publish",
    },
    siteScope: true,
  },
  sdkHelpers: {
    list: "adminBlogPosts",
    create: "createAdminBlogPost" as "createAdminBlogPost",
    read: "adminBlogPost",
    update: "updateAdminBlogPost",
    delete: "deleteAdminBlogPost",
    readiness: "adminBlogPostReadiness",
    publish: "publishAdminBlogPost",
    archive: "archiveAdminBlogPost",
    preview: "createAdminBlogPostPreviewToken" as "createAdminBlogPostPreviewToken",
    revisions: "adminBlogPostRevisions",
    rollback: "rollbackAdminBlogPost",
  } as const,
  responseContracts: {
    list: "backy.admin-blog-posts.v1",
    detail: "backy.admin-blog-post.v1",
    readiness: "backy.blog-post-readiness.v1",
    preview: "backy.preview-token.v1",
    revisions: "backy.admin-blog-post-revisions.v1",
    revisionBranchMetadata: "backy.content-revision-branch-metadata.v1",
  },
  designState: {
    acceptsContentDocument: true,
    acceptsCanvasElements: true,
    acceptsFrontendDesignTemplateId: true,
    preservesCustomCssJs: true,
    preservesAssetsAnimationsInteractions: true,
    preservesEditableMapAndDataBindings: true,
  },
  privacy: {
    routesRequireAuthenticatedAdmin: true,
    publicManifestExposesEndpointTemplatesOnly: true,
    adminSessionsAndApiKeysNeverReturned: true,
  },
} satisfies BackyManifestContentManagementPolicy;

const customFrontendAgentHandoff = {
  schemaVersion: "backy.custom-frontend-agent-handoff.v1",
  source: "public-manifest-openapi-contract",
  agentBrief: {
    schemaVersion: "backy.custom-frontend-agent-brief.v1",
    title: "Copy this brief into any AI or custom frontend builder before it writes UI.",
    copyPrompt: [
      "You are building a frontend for Backy site site_demo. Start by fetching GET /api/sites/site_demo/agent-handoff.",
      "Read manifest, OpenAPI, render, and frontend-design before writing UI.",
      "Every Backy canvas element is API-addressable with props, styles, responsive overrides, bindings, assets, animation, metadata, and children[].",
      "Use componentApiContract.componentTypeContracts as the per-element property map and preserve the full Backy design envelope.",
    ].join("\n"),
    requiredReads: [
      "/api/sites/site_demo/agent-handoff",
      "/api/sites/site_demo/manifest",
      "/api/sites/site_demo/openapi",
      "/api/sites/site_demo/render?path=/...",
      "/api/sites/site_demo/frontend-design",
    ],
    adminWriteBoundary: {
      requiresAuth: true,
      endpointFamily: "/api/admin/sites/site_demo/*",
      frontendDesign: "/api/admin/sites/site_demo/frontend-design",
      contentEntryPoints: {
        pageBackyCanvas: "/pages/new?siteId=site_demo&templateSource=backy-canvas&focus=canvas",
        blogBackyCanvas: "/blog/new?siteId=site_demo&templateSource=backy-canvas&focus=canvas",
      },
    },
    componentGuarantee: {
      everyComponentApiAddressable: true,
      everyElementApiAddressable: true,
      sourcePointer: "componentApiContract",
      typeContractPointer: "componentApiContract.componentTypeContracts",
      readableWritableFields: componentApiFieldPaths,
      families: componentApiFamilies,
    },
    designStateGuarantee: {
      sourcePointer: "designState",
      preserveFields: ["content.contentDocument", "content.elements", "content.canvas", "content.editableMap", "meta.frontendDesign*"],
      styleSources: ["manifest.data.site.frontendDesign", "frontendDesign.tokens.*"],
    },
    verification: {
      resolve: "/api/sites/site_demo/resolve?path=/",
      render: "/api/sites/site_demo/render?path=/...",
      expectation: "Verify Backy resolve/render payloads expose the same element ids, props, styles, responsive overrides, bindings, and design envelope.",
    },
    noSecretBoundary: "Public handoff fields contain endpoint templates and field names only.",
  },
  docs: [
    { label: "Custom frontend agent handoff", path: "specs/custom-frontend-agent-handoff.md" },
    { label: "API contracts", path: "specs/backy-api-contracts.md" },
    { label: "Editor contract", path: "specs/editor_complete_spec.md" },
  ],
  endpoints: {
    agentHandoff: "/api/sites/site_demo/agent-handoff",
    manifest: "/api/sites/site_demo/manifest",
    openapi: "/api/sites/site_demo/openapi",
    resolve: "/api/sites/site_demo/resolve?path=/",
    render: "/api/sites/site_demo/render?path=/...",
    frontendDesign: "/api/sites/site_demo/frontend-design",
    frontendDesignManagement: "/api/admin/sites/site_demo/frontend-design",
    templates: "/api/admin/sites/site_demo/templates",
    pages: "/api/admin/sites/site_demo/pages",
    blog: "/api/admin/sites/site_demo/blog",
    forms: "/api/admin/sites/site_demo/forms",
    newsletterSubscribers: "/api/admin/sites/site_demo/newsletter/subscribers",
    newsletterContactSync: "/api/admin/sites/site_demo/forms/{formId}/contacts/sync",
    newsletterManagement: "/newsletter?siteId=site_demo",
    collections: "/api/admin/sites/site_demo/collections",
    products: "/api/admin/sites/site_demo/collections/products/records",
    reusableSections: "/api/admin/sites/site_demo/reusable-sections",
  },
  readOrder: [
    {
      step: "agent-handoff",
      endpointKey: "agentHandoff",
      purpose: "Start here before reading the full manifest.",
    },
    {
      step: "manifest",
      endpointKey: "manifest",
      purpose: "Bootstrap site identity, routes, modules, media/font delivery, frontendDesign, template registry, launch readiness, and this agent handoff.",
    },
    {
      step: "frontend-design",
      endpointKey: "frontendDesignManagement",
      purpose: "Read or update the authenticated site design contract.",
    },
    {
      step: "newsletter",
      endpointKey: "newsletterManagement",
      purpose: "Use subscriber APIs and provider-safe sync handoff for newsletters.",
    },
  ],
  sdk: {
    package: "packages/sdk-js",
    generatedTypes: "packages/sdk-js/src/generated-contract-types.ts",
    helpers: [
      "customFrontendAgentHandoff",
      "customFrontendAgentHandoffCached",
      "manifest",
      "openapi",
      "render",
      "buildBackyContentDesignPayload",
      "subscribeNewsletter",
      "newsletterSubscribers",
      "syncFormContacts",
    ],
  },
  contentCreation: {
    templateCloneFields: ["frontendDesignTemplateId", "designTemplateId"],
    backyCanvasTemplateField: "templateId",
    customFrontendTemplateField: "frontendDesignTemplateId",
    adminEntryPoints: {
      pageBackyCanvas: "/pages/new?siteId=site_demo&templateSource=backy-canvas&focus=canvas",
      pageCustomFrontend: "/pages/new?siteId=site_demo&templateSource=custom-frontend&frontendDesignTemplateId=:templateId&focus=canvas",
      blogBackyCanvas: "/blog/new?siteId=site_demo&templateSource=backy-canvas&focus=canvas",
      blogCustomFrontend: "/blog/new?siteId=site_demo&templateSource=custom-frontend&frontendDesignTemplateId=:templateId&focus=canvas",
      productBackyCanvas: "/products?siteId=site_demo&quickCreate=product",
      productCustomFrontend: "/products?siteId=site_demo&frontendTemplate=:templateId",
      formBackyCanvas: "/forms?siteId=site_demo&quickCreate=blank",
      formCustomFrontend: "/forms?siteId=site_demo&frontendTemplate=:templateId",
      newsletterWorkspace: "/newsletter?siteId=site_demo",
      newsletterPageBackyCanvas: "/pages/new?siteId=site_demo&template=newsletter&templateSource=backy-canvas&focus=canvas",
      newsletterBlogBackyCanvas: "/blog/new?siteId=site_demo&templateSource=backy-canvas&focus=canvas",
      collectionBackyCanvas: "/collections?siteId=site_demo&draft=new",
      collectionCustomFrontend: "/collections?siteId=site_demo&frontendTemplate=:templateId",
      reusableSectionBackyCanvas: "/reusable-sections?siteId=site_demo",
      reusableSectionCustomFrontend: "/reusable-sections?siteId=site_demo&frontendTemplate=:templateId",
    },
    canvasFirst: {
      editor: "Backy canvas editor",
      pageAndBlogModeField: "templateSource",
      backyCanvasValue: "backy-canvas",
      customFrontendValue: "custom-frontend",
      customFrontendRouteFieldAliases: ["frontendDesignTemplateId", "frontendTemplate"],
      routeRevealGuarantee: "Admin entry points reveal the selected captured template and focus the create action.",
      editorOutcome: "Every created page, post, product, form, collection, or reusable section must reopen in the Backy canvas editor.",
    },
    newsletter: {
      workspace: "/newsletter?siteId=site_demo",
      signupPageCanvas: "/pages/new?siteId=site_demo&template=newsletter&templateSource=backy-canvas&focus=canvas",
      writingCanvas: "/blog/new?siteId=site_demo&templateSource=backy-canvas&focus=canvas",
      publicSubscribers: "/api/sites/site_demo/newsletter/subscribers",
      adminSubscribers: "/api/admin/sites/site_demo/newsletter/subscribers",
      contactSync: "/api/admin/sites/site_demo/forms/{formId}/contacts/sync",
      syncBoundarySchema: "backy.newsletter-sync-boundary.v1",
      providerBoundary: "Backy owns subscriber records and sync handoff; mailbox delivery remains provider-side.",
    },
    rule: "Create newsletter signup and content through Backy APIs so every result can reopen in the canvas editor.",
  },
  apiAlignment: {
    schemaVersion: "backy.custom-frontend-api-alignment.v1",
    readStart: {
      endpointKey: "agentHandoff",
      method: "GET",
      endpoint: "/api/sites/site_demo/agent-handoff",
      manifestMirror: "data.contract.customFrontendAgentHandoff",
      openApiMirror: "x-backy-custom-frontend-agent-handoff",
    },
    publicDiscovery: {
      manifestEndpointKey: "manifest",
      openApiEndpointKey: "openapi",
      routeResolveEndpointKey: "resolve",
      renderEndpointKey: "render",
      styleSource: "manifest.data.site.frontendDesign",
    },
    typedClients: {
      sdkPackage: "packages/sdk-js",
      generatedTypes: "packages/sdk-js/src/generated-contract-types.ts",
      preferredHelpers: [
        "customFrontendAgentHandoff",
        "manifest",
      "openapi",
      "render",
      "buildBackyContentDesignPayload",
      "subscribeNewsletter",
      "newsletterSubscribers",
      "syncFormContacts",
    ],
    },
    writeBoundary: {
      adminWritesRequireAuth: true,
      publicDiscoveryOnly: true,
      writeEndpointFamily: "/api/admin/sites/:siteId/*",
      noFrontendLocalJsonForks: true,
    },
    creationRoutes: {
      pageBackyCanvas: "/pages/new?siteId=site_demo&templateSource=backy-canvas&focus=canvas",
      pageCustomFrontend: "/pages/new?siteId=site_demo&templateSource=custom-frontend&frontendDesignTemplateId=:templateId&focus=canvas",
      blogBackyCanvas: "/blog/new?siteId=site_demo&templateSource=backy-canvas&focus=canvas",
      blogCustomFrontend: "/blog/new?siteId=site_demo&templateSource=custom-frontend&frontendDesignTemplateId=:templateId&focus=canvas",
      productBackyCanvas: "/products?siteId=site_demo&quickCreate=product",
      productCustomFrontend: "/products?siteId=site_demo&frontendTemplate=:templateId",
      formBackyCanvas: "/forms?siteId=site_demo&quickCreate=blank",
      formCustomFrontend: "/forms?siteId=site_demo&frontendTemplate=:templateId",
      newsletterWorkspace: "/newsletter?siteId=site_demo",
      newsletterPageBackyCanvas: "/pages/new?siteId=site_demo&template=newsletter&templateSource=backy-canvas&focus=canvas",
      newsletterBlogBackyCanvas: "/blog/new?siteId=site_demo&templateSource=backy-canvas&focus=canvas",
      collectionBackyCanvas: "/collections?siteId=site_demo&draft=new",
      collectionCustomFrontend: "/collections?siteId=site_demo&frontendTemplate=:templateId",
      reusableSectionBackyCanvas: "/reusable-sections?siteId=site_demo",
      reusableSectionCustomFrontend: "/reusable-sections?siteId=site_demo&frontendTemplate=:templateId",
    },
    preserveFields: ["content.contentDocument", "content.elements", "content.canvas", "content.editableMap", "meta.frontendDesign*"],
    verification: {
      renderEndpoint: "/api/sites/site_demo/render?path=/...",
      resolveEndpoint: "/api/sites/site_demo/resolve?path=/",
      expectation: "Verify created content through Backy resolve/render payloads.",
    },
  },
  componentApiContract: {
    schemaVersion: "backy.canvas-component-api-contract.v1",
    everyComponentApiAddressable: true,
    everyElementApiAddressable: true,
    source: "Backy canvas render payload and content document",
    scope: "Every canvas element keeps a stable API shape.",
    readPointers: {
      renderElements: "/api/sites/site_demo/render?path=/...#data.content.elements",
      renderContentDocument: "/api/sites/site_demo/render?path=/...#data.content.contentDocument",
      manifestElementActions: "/api/sites/site_demo/manifest#data.contract.schemas.elementActions",
      manifestEditableMap: "/api/sites/site_demo/manifest#data.site.frontendDesign.editableMap",
      openApiCanvasElement: "/api/sites/site_demo/openapi#/components/schemas/BackyContentElement",
      openApiContentPayload: "/api/sites/site_demo/openapi#/components/schemas/PageResource",
      editorCompositionHandoff: "editorCompositionReadiness.agentHandoff",
    },
    writePointers: {
      adminPages: "/api/admin/sites/site_demo/pages",
      adminBlog: "/api/admin/sites/site_demo/blog",
      adminForms: "/api/admin/sites/site_demo/forms",
      adminCollections: "/api/admin/sites/site_demo/collections",
      adminProducts: "/api/admin/sites/site_demo/collections/products/records",
      adminReusableSections: "/api/admin/sites/site_demo/reusable-sections",
      adminFrontendDesign: "/api/admin/sites/site_demo/frontend-design",
    },
    elementAddressing: {
      stableIdField: "id",
      typeField: "type",
      propsField: "props",
      styleFieldAliases: ["styles", "style"],
      responsiveField: "responsive",
      nestedChildrenField: "children",
      contentDocumentNodeMap: "content.contentDocument.nodes",
      editableMapSources: ["content.editableMap", "meta.frontendDesignEditableMap", "manifest.data.site.frontendDesign.editableMap"],
    },
    readableFieldPaths: componentApiFieldPaths,
    writableFieldPaths: componentApiFieldPaths,
    componentFamilies: componentApiFamilies,
    componentTypeContracts,
    requiredAgentBehavior: ["Preserve unknown props, styles, responsive overrides, bindings, assets, and metadata."],
    guarantees: ["Element props and styles are API-readable from render/content payloads."],
    layoutBehavior: {
      schemaVersion: "backy.canvas-layout-behavior.v1",
      rootFlowElementTypes: ["section", "header", "footer", "nav"],
      absoluteLayerElementTypes: componentApiAbsoluteLayerTypes,
      resizeReflowPolicy: "Root flow sections move later root elements by the resized element bottom-edge delta.",
      sharedSiteChromeElementTypes: ["header", "footer", "nav"],
      sharedSiteChromeBindings: [
        {
          type: "header",
          fields: ["props.chromeRole", "props.navigationBinding", "site.navigation.primary"],
          policy: "Use for shared site header/navigation.",
        },
        {
          type: "footer",
          fields: ["props.chromeRole", "props.newsletterBinding", "site.footer", "site.newsletter"],
          policy: "Use for shared footer/newsletter chrome.",
        },
        {
          type: "nav",
          fields: ["props.items", "props.navigationBinding", "site.navigation.primary"],
          policy: "Use for shared site navigation menus.",
        },
      ],
      agentWriteRule: "Use advertised navigation/chrome bindings for shared site UI.",
    },
    secretHandling: "No provider keys, admin sessions, database URLs, or private file tokens are exposed.",
  },
  routing: {
    schemaVersion: "backy.custom-frontend-routing-handoff.v1",
    siteId: "site_demo",
    identifiers: {
      siteId: "site_demo",
      slug: "demo",
      customDomain: "demo.example.com",
      verificationDomain: "demo.example.com",
      acceptedPublicIdentifiers: ["siteId", "slug", "customDomain", "domain query parameter", "Host header"],
    },
    publicResolution: {
      siteDiscovery: "/api/sites?identifier=demo.example.com",
      managedPath: "/sites/demo",
      resolveBySiteId: "/api/sites/site_demo/resolve?path=/",
      renderBySiteId: "/api/sites/site_demo/render?path=/...",
      resolveWithHost: "/api/sites/site_demo/resolve?path=/&domain={host}",
      renderWithHost: "/api/sites/site_demo/render?path=/...&domain={host}",
      hostHeaderSupported: true,
      domainQueryParamSupported: true,
    },
    customDomainManagement: {
      adminSiteRoute: "/sites/site_demo",
      adminSiteApi: "/api/admin/sites/site_demo",
      adminSettingsApi: "/api/admin/sites/site_demo/settings",
      customDomainField: "site.customDomain",
      verificationField: "site.settings.domainVerification.domain",
      verificationStatusField: "site.settings.domainVerification.status",
      dnsRecordEvidenceField: "site.settings.domainVerification.records",
    },
    subdomainRouting: {
      supported: true,
      model: "Treat every public host as a Backy custom domain/verification host.",
      examples: ["blog.example.com", "docs.example.com", "shop.example.com"],
      recommendation: "Use one Backy site per independent subdomain when content, navigation, SEO, or design tokens differ.",
    },
    customFrontendDeployment: {
      publicApiOriginEnv: "BACKY_PUBLIC_API_BASE_URL",
      siteIdentifierEnv: "BACKY_SITE_ID",
      hostContextEnv: "BACKY_SITE_PUBLIC_HOST",
      frontendHostPolicy: "Read Backy manifest/OpenAPI/render data instead of copying site JSON locally.",
      corsSetting: "BACKY_CORS_ALLOWED_ORIGINS",
    },
    agentRules: [
      "Start with agent-handoff, manifest, and OpenAPI before choosing routes.",
      "For custom domains or subdomains, pass the browser host as domain={host} or rely on Host/forwarded-host.",
      "Keep DNS/provider credentials outside public payloads.",
    ],
  },
  deploymentTopology: {
    schemaVersion: "backy.deployment-topology.v1",
    model: "protected-admin-public-api-separated-frontends",
    siteId: "site_demo",
    projects: {
      backyAdmin: {
        project: "backy-admin",
        rootDirectory: "apps/admin",
        framework: "Vite",
        publicStatus: "protected",
        purpose: "Admin/editor shell for authenticated operators.",
        requiredEnv: ["VITE_BACKY_PUBLIC_API_BASE_URL", "VITE_BACKY_ADMIN_API_BASE_URL"],
        forbiddenEnv: ["BACKY_DATABASE_URL", "DATABASE_URL", "CRON_SECRET", "BACKY_ADMIN_API_KEY", "BACKY_ADMIN_SECRET_KEY"],
        protection: "Use Vercel Deployment Protection.",
      },
      backyPublic: {
        project: "backy-public",
        rootDirectory: "apps/public",
        framework: "Next.js",
        publicStatus: "public",
        purpose: "Public rendering, discovery, visitor interactions, and protected admin API routes.",
        requiredEnv: ["BACKY_DATA_MODE=database", "BACKY_DATABASE_URL", "BACKY_ADMIN_API_KEY", "BACKY_ADMIN_SECRET_KEY", "CRON_SECRET", "NEXT_PUBLIC_BACKY_ADMIN_APP_URL", "BACKY_CORS_ALLOWED_ORIGINS"],
        serves: ["manifest", "OpenAPI", "agent-handoff", "resolve/render", "forms/comments/newsletter signup", "authenticated admin APIs"],
      },
      customFrontend: {
        publicStatus: "public",
        projectPolicy: "Use a separate frontend project per independent website.",
        requiredEnv: ["BACKY_PUBLIC_API_BASE_URL", "BACKY_SITE_ID"],
        optionalEnv: ["BACKY_SITE_PUBLIC_HOST"],
        forbiddenEnv: ["Backy admin URLs", "admin/session secrets", "provider secrets", "database URLs"],
      },
    },
    domainPolicy: {
      verificationRequired: true,
      verificationStatusField: "site.settings.domainVerification.status",
      examples: ["www.example.com", "blog.example.com", "docs.example.com", "akriti.devanshvarshney.com"],
    },
    verification: {
      releaseConfigSmoke: "npm run test:vercel-release-config",
      previewReadinessSmoke: "npm run test:vercel-preview-readiness",
      frontendContractSmoke: "npm run test:frontend-contract-types",
      releaseDoctor: "npm run doctor:release-certification",
      providerArtifactAdmission: "npm run ci:provider-artifact-admission",
    },
    secretHandling: "This topology exposes env names, project roles, and verification commands only.",
  },
  designState: {
    roundTripFields: ["content.contentDocument", "content.elements", "content.canvas", "content.editableMap", "meta.frontendDesign*"],
    siteStyleSources: ["manifest.data.site.frontendDesign", "frontendDesign.tokens.fonts", "frontendDesign.tokens.colors"],
    preserves: ["layer geometry", "responsive overrides", "theme token references", "media and font asset identities"],
  },
  rules: [
    "Read manifest and OpenAPI before guessing API shapes.",
    "Preserve the full Backy design envelope when creating or updating editable content.",
    "Use authenticated admin endpoints for writes and public endpoints for read/render discovery.",
  ],
  privacy: {
    includesSecretValues: false,
    publicDiscoveryOnly: true,
    adminWritesRequireAuth: true,
    secretHandling: "This handoff exposes endpoint templates and field names only.",
  },
} satisfies GeneratedBackyFrontendManifestCustomFrontendAgentHandoff;

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
      completionStatus,
      customFrontendAgentHandoff,
      schemas: {
      manifest: "frontend-manifest.schema.json",
      renderPayload: "content-payload.schema.json",
      themeTokens: "theme-tokens.schema.json",
      elementActions: "element-actions.schema.json",
      dataBindings: "data-bindings.schema.json",
      editableMap: "editable-map.schema.json",
      customFrontendAgentHandoff: "frontend-manifest.schema.json#/$defs/customFrontendAgentHandoff",
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
    agentHandoff: "/api/sites/site_demo/agent-handoff",
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
    customFrontendAgentHandoff:
      "/api/sites/site_demo/manifest#data.contract.customFrontendAgentHandoff",
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
      tokenReferences: {
        "colors.primary": "var(--backy-color-primary)",
        "typography.families.heading": "var(--backy-font-heading)",
      },
      styleSheet: ":root,\n[data-backy-theme] {\n  --backy-color-primary: #111111;\n}",
      selectors: {
        root: ":root",
        scoped: "[data-backy-theme]",
      },
      inheritance: {
        elementTokenRefPath: "tokenRefs",
        documentTokenRefPath: "themeTokenRefs",
        legacyElementTokenRefPath: "themeTokenRefs",
        fallbackOrder: ["element.tokenRefs", "element.styles", "element.props", "document.themeTokenRefs", "site.theme"],
        supportedElementPaths: ["styles.color", "styles.backgroundColor", "styles.fontFamily"],
      },
      editableFields: ["colors.primary", "fonts.heading", "spacing.unit", "customCSS"],
      capabilities: {
        cssVariables: true,
        customCss: true,
        typographyFamilies: true,
        spacingScale: true,
        liveEditable: true,
        frontendDesignOverrides: true,
        styleSheet: true,
        tokenReferences: true,
        perBlockTokenRefs: true,
        animationTokenRefs: true,
      },
    },
    liveManagement: {
      schemaVersion: "backy.live-management.v1",
      enabled: true,
      endpoints: {
        pages: "/api/admin/sites/site_demo/pages",
        pageCreate: "/api/admin/sites/site_demo/pages",
        pageDetail: "/api/admin/sites/site_demo/pages/{pageId}",
        pageReadiness: "/api/admin/sites/site_demo/pages/{pageId}/readiness",
        pagePublish: "/api/admin/sites/site_demo/pages/{pageId}/publish",
        pageArchive: "/api/admin/sites/site_demo/pages/{pageId}/archive",
        pagePreview: "/api/admin/sites/site_demo/pages/{pageId}/preview",
        pageRevisions: "/api/admin/sites/site_demo/pages/{pageId}/revisions",
        pageRollback: "/api/admin/sites/site_demo/pages/{pageId}/rollback",
        page: "/api/sites/site_demo/manage/pages/{pageId}",
        posts: "/api/admin/sites/site_demo/blog",
        postCreate: "/api/admin/sites/site_demo/blog",
        postDetail: "/api/admin/sites/site_demo/blog/{postId}",
        postReadiness: "/api/admin/sites/site_demo/blog/{postId}/readiness",
        postPublish: "/api/admin/sites/site_demo/blog/{postId}/publish",
        postArchive: "/api/admin/sites/site_demo/blog/{postId}/archive",
        postPreview: "/api/admin/sites/site_demo/blog/{postId}/preview",
        postRevisions: "/api/admin/sites/site_demo/blog/{postId}/revisions",
        postRollback: "/api/admin/sites/site_demo/blog/{postId}/rollback",
        post: "/api/sites/site_demo/manage/blog/{postId}",
        render: "/api/sites/site_demo/render?path={path}",
        editableMapSchema:
          "https://backy.dev/schemas/ai-frontend-contract/editable-map.schema.json",
      },
      methods: {
        list: "GET",
        read: "GET",
        create: "POST",
        update: "PATCH",
        delete: "DELETE",
        publish: "POST",
        archive: "POST",
        preview: "POST",
        revisions: "GET",
        rollback: "POST",
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
        authenticatedContentLifecycle: true,
        pageLifecycle: true,
        postLifecycle: true,
        templateCloning: true,
        previewTokenCreation: true,
        revisionHistory: true,
        editorComposition: true,
        editorGrouping: true,
        mediaAssetRefs: true,
        fontAssetRefs: true,
        elementAssetIds: true,
        tokenRefs: true,
        animation: true,
        animationTokenRefs: true,
      },
      editableTargets: [
        "props.content",
        "props.href",
        "props.target",
        "props.download",
        "props.src",
        "props.fileId",
        "props.fileIds",
        "props.fileMediaId",
        "props.fileMediaIds",
        "props.downloadMediaId",
        "props.downloadMediaIds",
        "props.fileMediaUrl",
        "props.fileUrl",
        "props.fileMediaName",
        "props.fileMediaType",
        "props.fileMediaVisibility",
        "props.fileDownloadDisposition",
        "props.fileSignedUrlRequired",
        "props.fileSignedUrlEndpoint",
        "props.fileName",
        "props.mediaId",
        "props.mediaIds",
        "props.backgroundMediaIds",
        "props.posterMediaIds",
        "props.fontMediaId",
        "props.fontMediaIds",
        "props.imageFocalPoint",
        "props.fontRegistration",
        "props.formId",
        "props.fieldBackgroundColor",
        "props.submitBackgroundColor",
        "props.label",
        "props.options",
        "props.backgroundColor",
        "props.borderWidth",
        "props.textAlign",
        "props.actionPreset",
        "props.underline",
        "styles.color",
        "styles.boxShadow",
        "tokenRefs.styles.color",
        "tokenRefs.styles.boxShadow",
        "animation.type",
        "animation.duration",
        "animation.scrollTrigger.start",
        "animation.scrollTrigger.scrub",
        "animation.from",
        "animation.to",
        "animation.tokenRefs.duration",
        "actions",
        "dataBindings",
        "bindingSlots",
        "assetIds",
        "responsive.mobile.props.fileId",
        "responsive.mobile.props.fileIds",
        "responsive.mobile.props.fileMediaId",
        "responsive.mobile.props.fileMediaIds",
        "responsive.mobile.props.downloadMediaId",
        "responsive.mobile.props.downloadMediaIds",
        "responsive.mobile.props.fileMediaUrl",
        "responsive.mobile.props.fileUrl",
        "responsive.mobile.props.fileMediaName",
        "responsive.mobile.props.fileMediaType",
        "responsive.mobile.props.fileMediaVisibility",
        "responsive.mobile.props.fileDownloadDisposition",
        "responsive.mobile.props.fileSignedUrlRequired",
        "responsive.mobile.props.fileSignedUrlEndpoint",
        "responsive.mobile.props.fileName",
        "responsive.mobile.props.backgroundColor",
        "responsive.mobile.styles.boxShadow",
        "responsive.mobile.props.mediaIds",
        "responsive.mobile.props.posterMediaIds",
        "responsive.tablet.props.fileId",
        "responsive.tablet.props.fileIds",
        "responsive.tablet.props.fileMediaId",
        "responsive.tablet.props.fileMediaIds",
        "responsive.tablet.props.downloadMediaId",
        "responsive.tablet.props.downloadMediaIds",
        "responsive.tablet.props.fileMediaUrl",
        "responsive.tablet.props.fileUrl",
        "responsive.tablet.props.fileMediaName",
        "responsive.tablet.props.fileMediaType",
        "responsive.tablet.props.fileMediaVisibility",
        "responsive.tablet.props.fileDownloadDisposition",
        "responsive.tablet.props.fileSignedUrlRequired",
        "responsive.tablet.props.fileSignedUrlEndpoint",
        "responsive.tablet.props.fileName",
        "responsive.tablet.props.borderWidth",
        "responsive.tablet.tokenRefs.styles.boxShadow",
        "responsive.mobile.x",
        "responsive.tablet.width",
      ],
      lifecycle: sdkManifestContentLifecycle,
      editorComposition: {
        schemaVersion: "backy.editor-composition-commands.v1",
        sdkHelpers: {
          listElements: "listBackyContentElements",
          findElement: "findBackyContentElement",
          addElement: "addBackyContentElement",
          duplicateElement: "duplicateBackyContentElement",
          deleteElements: "deleteBackyContentElements",
          transformElements: "transformBackyContentElements",
          group: "groupBackyContentElements",
          ungroup: "ungroupBackyContentElements",
          patchElement: "patchBackyContentElement",
          patchElements: "patchBackyContentElements",
          buildPageUpdate: "buildBackyLiveManagedPageEditableMapUpdate",
          buildBlogPostUpdate: "buildBackyLiveManagedBlogPostEditableMapUpdate",
        },
        commands: [
          {
            id: "add",
            label: "Add an element to the canvas or selected parent layer",
            shortcut: "Insert",
            sdkHelper: "addBackyContentElement",
            minSelected: 0,
            sameParentRequired: false,
            unlockedRequired: true,
            mutates: ["children", "parentId", "zIndex"],
            preservesResponsiveGeometry: true,
          },
          {
            id: "duplicate",
            label: "Duplicate the selected element tree",
            shortcut: "Cmd/Ctrl+D",
            sdkHelper: "duplicateBackyContentElement",
            minSelected: 1,
            sameParentRequired: false,
            unlockedRequired: true,
            mutates: ["id", "parentId", "children", "layout"],
            preservesResponsiveGeometry: true,
          },
          {
            id: "delete",
            label: "Delete selected unlocked element trees",
            shortcut: "Delete/Backspace",
            sdkHelper: "deleteBackyContentElements",
            minSelected: 1,
            sameParentRequired: false,
            unlockedRequired: true,
            mutates: ["children"],
            preservesResponsiveGeometry: true,
          },
          {
            id: "move",
            label: "Move selected elements on desktop or responsive breakpoints",
            shortcut: "Arrow keys / drag",
            sdkHelper: "transformBackyContentElements",
            minSelected: 1,
            sameParentRequired: false,
            unlockedRequired: true,
            mutates: ["layout.x", "layout.y", "responsive.tablet", "responsive.mobile"],
            preservesResponsiveGeometry: true,
          },
          {
            id: "resize",
            label: "Resize selected elements on desktop or responsive breakpoints",
            shortcut: "Drag handles",
            sdkHelper: "transformBackyContentElements",
            minSelected: 1,
            sameParentRequired: false,
            unlockedRequired: true,
            mutates: ["layout.width", "layout.height", "responsive.tablet", "responsive.mobile"],
            preservesResponsiveGeometry: true,
          },
          {
            id: "group",
            label: "Group selected sibling layers",
            shortcut: "Cmd/Ctrl+G",
            sdkHelper: "groupBackyContentElements",
            minSelected: 2,
            sameParentRequired: true,
            unlockedRequired: true,
            createsEditorGroup: true,
            preservesResponsiveGeometry: true,
          },
          {
            id: "ungroup",
            label: "Ungroup selected editor groups",
            shortcut: "Shift+Cmd/Ctrl+G",
            sdkHelper: "ungroupBackyContentElements",
            minSelected: 1,
            sameParentRequired: true,
            unlockedRequired: true,
            editorGroupRequired: true,
            preservesResponsiveGeometry: true,
          },
	        ],
	        commandRegistry: sdkManifestEditorCommandRegistry,
	        constraints: {
          sameParentRequired: true,
          lockedLayersBlocked: true,
          editorGroupMarker: "props.editorGroup",
          responsiveBreakpoints: ["tablet", "mobile"],
          updateTarget: "content",
        },
      },
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
        adminList: "/api/admin/sites/site_demo/pages",
        adminCreate: "/api/admin/sites/site_demo/pages",
        adminDetail: "/api/admin/sites/site_demo/pages/{pageId}",
        adminReadiness: "/api/admin/sites/site_demo/pages/{pageId}/readiness",
        adminPublish: "/api/admin/sites/site_demo/pages/{pageId}/publish",
        adminArchive: "/api/admin/sites/site_demo/pages/{pageId}/archive",
        adminPreview: "/api/admin/sites/site_demo/pages/{pageId}/preview",
        adminRevisions: "/api/admin/sites/site_demo/pages/{pageId}/revisions",
        adminRollback: "/api/admin/sites/site_demo/pages/{pageId}/rollback",
      },
      methods: {
        list: "GET",
        detail: "GET",
        resolve: "GET",
        render: "GET",
        liveManageRead: "GET",
        liveManageUpdate: "PATCH",
        adminList: "GET",
        adminCreate: "POST",
        adminRead: "GET",
        adminUpdate: "PATCH",
        adminDelete: "DELETE",
        adminPublish: "POST",
        adminArchive: "POST",
        adminPreview: "POST",
        adminRevisions: "GET",
        adminRollback: "POST",
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
        authenticatedManagement: true,
        pageCreation: true,
        templateCloning: true,
        readinessChecks: true,
        publishArchive: true,
        revisionHistory: true,
        conditionalRequests: true,
        cacheablePages: true,
      },
      managementPolicy: sdkManifestPagesManagementPolicy,
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
        adminList: "/api/admin/sites/site_demo/blog",
        adminCreate: "/api/admin/sites/site_demo/blog",
        adminDetail: "/api/admin/sites/site_demo/blog/{postId}",
        adminReadiness: "/api/admin/sites/site_demo/blog/{postId}/readiness",
        adminPublish: "/api/admin/sites/site_demo/blog/{postId}/publish",
        adminArchive: "/api/admin/sites/site_demo/blog/{postId}/archive",
        adminPreview: "/api/admin/sites/site_demo/blog/{postId}/preview",
        adminRevisions: "/api/admin/sites/site_demo/blog/{postId}/revisions",
        adminRollback: "/api/admin/sites/site_demo/blog/{postId}/rollback",
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
        adminList: "GET",
        adminCreate: "POST",
        adminRead: "GET",
        adminUpdate: "PATCH",
        adminDelete: "DELETE",
        adminPublish: "POST",
        adminArchive: "POST",
        adminPreview: "POST",
        adminRevisions: "GET",
        adminRollback: "POST",
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
        authenticatedManagement: true,
        postCreation: true,
        templateCloning: true,
        readinessChecks: true,
        publishArchive: true,
        revisionHistory: true,
        conditionalRequests: true,
        cacheablePosts: true,
      },
      managementPolicy: sdkManifestBlogManagementPolicy,
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
        authenticatedManagement: true,
        formBuilderManagement: true,
        submissionModeration: true,
        contactCrm: true,
        deliveryRetries: true,
        consentRetention: true,
        persistenceCertification: true,
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
      managementPolicy: sdkManifestFormsManagementPolicy,
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
        authenticatedUpload: true,
        folderManagement: true,
        retainedVersions: true,
        responsiveTransformPreparation: true,
        bindingMetadata: true,
        providerAnalyticsIngestion: true,
      },
      filters: {
        types: ["image", "font"],
        typeAliases: {
          file: ["document", "other"],
        },
        visibility: ["public", "private"],
        scopes: ["global", "page", "post"],
        queryParams: ["type", "q", "search", "tag", "folder", "folderId", "scope", "pageId", "postId", "blogId", "global", "limit", "offset"],
        maxLimit: 100,
        aliases: {
          q: "search",
          folder: "folderId",
          blogId: "postId",
          fileType: "file",
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
      managementPolicy: sdkManifestMediaManagementPolicy,
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
        authenticatedManagement: true,
        productAdmin: true,
        orderAdmin: true,
        providerOperations: true,
        fulfillmentOperations: true,
        reconciliation: true,
        customerStatusHandoff: true,
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
      managementPolicy: createSdkManifestCommerceManagementPolicy(),
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
          schemaVersion: "backy.interactive-component-sandbox.v1",
          contractVersionHeader: "x-backy-contract-version",
          schemaVersionHeader: "x-backy-schema-version",
          cacheScopeHeader: "x-backy-cache-scope",
          cacheRevisionHeader: "x-backy-cache-revision",
          etagHeader: "etag",
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
    adminList: "/api/admin/sites/site_demo/pages",
    adminCreate: "/api/admin/sites/site_demo/pages",
    adminDetail: "/api/admin/sites/site_demo/pages/{pageId}",
    adminReadiness: "/api/admin/sites/site_demo/pages/{pageId}/readiness",
    adminPublish: "/api/admin/sites/site_demo/pages/{pageId}/publish",
    adminArchive: "/api/admin/sites/site_demo/pages/{pageId}/archive",
    adminPreview: "/api/admin/sites/site_demo/pages/{pageId}/preview",
    adminRevisions: "/api/admin/sites/site_demo/pages/{pageId}/revisions",
    adminRollback: "/api/admin/sites/site_demo/pages/{pageId}/rollback",
  },
  methods: {
    list: "GET",
    detail: "GET",
    resolve: "GET",
    render: "GET",
    liveManageRead: "GET",
    liveManageUpdate: "PATCH",
    adminList: "GET",
    adminCreate: "POST",
    adminRead: "GET",
    adminUpdate: "PATCH",
    adminDelete: "DELETE",
    adminPublish: "POST",
    adminArchive: "POST",
    adminPreview: "POST",
    adminRevisions: "GET",
    adminRollback: "POST",
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
    authenticatedManagement: true,
    pageCreation: true,
    templateCloning: true,
    readinessChecks: true,
    publishArchive: true,
    revisionHistory: true,
    conditionalRequests: true,
    cacheablePages: true,
  },
  managementPolicy: sdkManifestPagesManagementPolicy,
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
    adminList: "/api/admin/sites/site_demo/blog",
    adminCreate: "/api/admin/sites/site_demo/blog",
    adminDetail: "/api/admin/sites/site_demo/blog/{postId}",
    adminReadiness: "/api/admin/sites/site_demo/blog/{postId}/readiness",
    adminPublish: "/api/admin/sites/site_demo/blog/{postId}/publish",
    adminArchive: "/api/admin/sites/site_demo/blog/{postId}/archive",
    adminPreview: "/api/admin/sites/site_demo/blog/{postId}/preview",
    adminRevisions: "/api/admin/sites/site_demo/blog/{postId}/revisions",
    adminRollback: "/api/admin/sites/site_demo/blog/{postId}/rollback",
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
    adminList: "GET",
    adminCreate: "POST",
    adminRead: "GET",
    adminUpdate: "PATCH",
    adminDelete: "DELETE",
    adminPublish: "POST",
    adminArchive: "POST",
    adminPreview: "POST",
    adminRevisions: "GET",
    adminRollback: "POST",
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
    authenticatedManagement: true,
    postCreation: true,
    templateCloning: true,
    readinessChecks: true,
    publishArchive: true,
    revisionHistory: true,
    conditionalRequests: true,
    cacheablePosts: true,
  },
  managementPolicy: sdkManifestBlogManagementPolicy,
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
    authenticatedManagement: true,
    formBuilderManagement: true,
    submissionModeration: true,
    contactCrm: true,
    deliveryRetries: true,
    consentRetention: true,
    persistenceCertification: true,
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
  managementPolicy: sdkManifestFormsManagementPolicy,
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
    authenticatedUpload: true,
    folderManagement: true,
    retainedVersions: true,
    responsiveTransformPreparation: true,
    bindingMetadata: true,
    providerAnalyticsIngestion: true,
  },
  filters: {
    types: ["font", "image"],
    typeAliases: {
      file: ["document", "other"],
    },
    visibility: ["public", "private"],
    scopes: ["global", "page", "post"],
    queryParams: ["type", "q", "search", "tag", "folder", "folderId", "scope", "pageId", "postId", "blogId", "global", "limit", "offset"],
    maxLimit: 100,
    aliases: {
      q: "search",
      folder: "folderId",
      blogId: "postId",
      fileType: "file",
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
  managementPolicy: sdkManifestMediaManagementPolicy,
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
  managementPolicy: sdkManifestMedia.managementPolicy,
} satisfies GeneratedBackyOpenApiMediaFileCategoryDiscovery;

function createSdkManifestCommerceManagementPolicy() {
  return {
  schemaVersion: "backy.commerce-management.v1",
  endpoints: {
    products: "/api/admin/sites/site_demo/collections/products/records",
    product: "/api/admin/sites/site_demo/collections/products/records/{productId}",
    productsCsv: "/api/admin/sites/site_demo/collections/products/records?format=csv",
    importProducts: "/api/admin/sites/site_demo/collections/products/records/import",
    bulkProducts: "/api/admin/sites/site_demo/collections/products/records/bulk",
    orders: "/api/admin/sites/site_demo/collections/orders/records",
    order: "/api/admin/sites/site_demo/collections/orders/records/{orderId}",
    ordersCsv: "/api/admin/sites/site_demo/collections/orders/records?format=csv",
    importOrders: "/api/admin/sites/site_demo/collections/orders/records/import",
    bulkOrders: "/api/admin/sites/site_demo/collections/orders/records/bulk",
    orderAnalytics: "/api/admin/sites/site_demo/commerce/orders/analytics",
    orderStatusHandoff: "/api/admin/sites/site_demo/commerce/orders/{orderId}/status-handoff",
    orderQuote: "/api/admin/sites/site_demo/commerce/orders/{orderId}/quote",
    orderTracking: "/api/admin/sites/site_demo/commerce/orders/{orderId}/tracking",
    orderFulfillment: "/api/admin/sites/site_demo/commerce/orders/{orderId}/fulfillment",
    orderShippingLabel: "/api/admin/sites/site_demo/commerce/orders/{orderId}/shipping-label",
    orderProviderRefund: "/api/admin/sites/site_demo/commerce/orders/{orderId}/provider-refund",
    productProviderSync: "/api/admin/sites/site_demo/commerce/products/{productId}/provider-sync",
    productSubscriptions: "/api/admin/sites/site_demo/commerce/products/{productId}/subscriptions",
    productSubscriptionAction: "/api/admin/sites/site_demo/commerce/products/{productId}/subscriptions/{orderId}/action",
    siteReconciliation: "/api/admin/sites/site_demo/commerce/reconcile",
    platformReconciliation: "/api/admin/commerce/reconcile",
    reconciliationReadiness: "/api/admin/commerce/reconcile/readiness",
    orderEvents: "/api/sites/site_demo/events?kind=commerce-order",
    productEvents: "/api/sites/site_demo/events?kind=commerce-product",
  },
  methods: {
    listProducts: "GET",
    createProduct: "POST",
    readProduct: "GET",
    updateProduct: "PATCH",
    deleteProduct: "DELETE",
    exportProductsCsv: "GET",
    importProductsCsv: "POST",
    bulkProducts: "POST",
    listOrders: "GET",
    createOrderRecord: "POST",
    readOrder: "GET",
    updateOrder: "PATCH",
    deleteOrder: "DELETE",
    exportOrdersCsv: "GET",
    importOrdersCsv: "POST",
    bulkOrders: "POST",
    orderAnalytics: "GET",
    orderStatusHandoff: "GET",
    orderQuote: "GET",
    refreshOrderQuote: "POST",
    orderTracking: "GET",
    refreshOrderTracking: "POST",
    orderFulfillment: "GET",
    dispatchOrderFulfillment: "POST",
    orderShippingLabel: "GET",
    createOrderShippingLabel: "POST",
    voidOrderShippingLabel: "DELETE",
    orderProviderRefund: "GET",
    createOrderProviderRefund: "POST",
    refreshOrderProviderRefund: "PATCH",
    productProviderSync: "GET",
    syncProductProvider: "POST",
    productSubscriptions: "GET",
    productSubscriptionAction: "POST",
    scheduledSiteReconciliation: "GET",
    runSiteReconciliation: "POST",
    platformReconciliation: "GET",
    reconciliationReadiness: "GET",
    orderEvents: "GET",
    productEvents: "GET",
  },
  auth: {
    modes: ["session", "api-key"],
    headers: ["Authorization", "x-backy-admin-session", "x-backy-admin-key", "x-api-key"],
    requiredPermissions: {
      read: "commerce.view",
      write: "commerce.edit",
      configure: "commerce.configure",
      delete: "commerce.delete",
      collectionRead: "collections.view",
      collectionWrite: "collections.edit",
      collectionExport: "collections.export",
      collectionDelete: "collections.delete",
      pageTemplates: "pages.edit",
      mediaRead: "media.view",
      mediaCreate: "media.create",
      activity: "activity.export",
    },
    siteScope: true,
    platformEndpoints: ["platformReconciliation", "reconciliationReadiness"],
  },
  sdkHelpers: {
    listProducts: "adminCommerceProducts",
    createProduct: "createAdminCommerceProduct",
    readProduct: "adminCommerceProduct",
    updateProduct: "updateAdminCommerceProduct",
    deleteProduct: "deleteAdminCommerceProduct",
    exportProductsCsv: "adminCommerceProductsCsv",
    importProductsCsv: "importAdminCommerceProductsCsv",
    bulkProducts: "bulkAdminCommerceProducts",
    listOrders: "adminCommerceOrders",
    createOrderRecord: "createAdminCommerceOrder",
    readOrder: "adminCommerceOrder",
    updateOrder: "updateAdminCommerceOrder",
    deleteOrder: "deleteAdminCommerceOrder",
    exportOrdersCsv: "adminCommerceOrdersCsv",
    importOrdersCsv: "importAdminCommerceOrdersCsv",
    bulkOrders: "bulkAdminCommerceOrders",
    orderAnalytics: "commerceOrderAnalytics",
    orderStatusHandoff: "commerceOrderStatusHandoff",
    orderQuote: "commerceOrderQuote",
    refreshOrderQuote: "refreshCommerceOrderQuote",
    orderTracking: "commerceOrderTracking",
    refreshOrderTracking: "refreshCommerceOrderTracking",
    orderFulfillment: "commerceOrderFulfillment",
    dispatchOrderFulfillment: "dispatchCommerceOrderFulfillment",
    orderShippingLabel: "commerceOrderShippingLabel",
    createOrderShippingLabel: "createCommerceOrderShippingLabel",
    voidOrderShippingLabel: "voidCommerceOrderShippingLabel",
    orderProviderRefund: "commerceOrderProviderRefund",
    createOrderProviderRefund: "createCommerceOrderProviderRefund",
    refreshOrderProviderRefund: "refreshCommerceOrderProviderRefund",
    productProviderSync: "commerceProductProviderSync",
    syncProductProvider: "syncCommerceProductProvider",
    productSubscriptions: "commerceProductSubscriptions",
    productSubscriptionAction: "runCommerceProductSubscriptionAction",
    siteReconciliation: "runCommerceReconciliation",
    scheduledSiteReconciliation: "scheduledCommerceReconciliation",
    platformReconciliation: "scheduledPlatformCommerceReconciliation",
    reconciliationReadiness: "commerceReconciliationReadiness",
    orderEvents: "orderDeliveryEvents",
    productEvents: "productNotificationEvents",
  },
  responseContracts: {
    productRecords: "backy.collection-records.v1",
    productRecord: "backy.collection-record.v1",
    orderRecords: "backy.collection-records.v1",
    orderRecord: "backy.collection-record.v1",
    orderAnalytics: "backy.order-analytics.v1",
    orderStatusHandoff: "backy.order-status-handoff.v1",
    orderQuote: "backy.order-quote.v1",
    orderTracking: "backy.tracking.v1",
    orderFulfillment: "backy.fulfillment-dispatch.v1",
    orderShippingLabel: "backy.shipping-label.v1",
    orderProviderRefund: "backy.provider-refund.v1",
    productProviderSync: "backy.commerce-product-sync.v1",
    productStorefrontHandoff: "backy.product-storefront-handoff.v1",
    productSubscriptions: "backy.product-subscription-lifecycle.v1",
    productSubscriptionAction: "backy.product-subscription-action.v1",
    siteReconciliation: "backy.commerce-reconciliation.v1",
    platformReconciliation: "backy.commerce-reconciliation-batch.v1",
    reconciliationReadiness: "backy.commerce-reconciliation-readiness.v1",
    providerCertification: "backy.commerce-provider-certification-handoff.v1",
  },
  privacy: {
    productCatalogCanBePublic: true,
    ordersRemainPrivate: true,
    orderStatusHandoffMasksCustomerContact: true,
    productStorefrontHandoffExcludesPrivateData: true,
    providerOperationPayloadsMayContainCustomerData: true,
    providerSecretsNeverReturned: true,
    rawProviderResponsesStayPrivate: true,
  },
  secretHandling:
    "Commerce management routes require authenticated admin requests; discovery exposes route templates, permission names, SDK helper names, and non-secret provider-certification gates while keeping provider secrets, raw order records, and customer payloads private.",
  } satisfies BackyManifestCommerceRuntimeModule["managementPolicy"] & GeneratedBackyOpenApiCommerceManagementPolicy;
}

const sdkManifestCommerceManagementPolicy = createSdkManifestCommerceManagementPolicy();

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
    authenticatedManagement: true,
    productAdmin: true,
    orderAdmin: true,
    providerOperations: true,
    fulfillmentOperations: true,
    reconciliation: true,
    customerStatusHandoff: true,
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
  managementPolicy: sdkManifestCommerceManagementPolicy,
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
  tokenReferences: {
    "colors.primary": "var(--backy-color-primary)",
    "typography.families.heading": "var(--backy-font-heading)",
  },
  styleSheet: ":root,\n[data-backy-theme] {\n  --backy-color-primary: #111111;\n}",
  selectors: {
    root: ":root",
    scoped: "[data-backy-theme]",
  },
  inheritance: {
    elementTokenRefPath: "tokenRefs",
    documentTokenRefPath: "themeTokenRefs",
    legacyElementTokenRefPath: "themeTokenRefs",
    fallbackOrder: ["element.tokenRefs", "element.styles", "element.props", "document.themeTokenRefs", "site.theme"],
    supportedElementPaths: ["styles.color", "styles.backgroundColor", "styles.fontFamily"],
  },
  editableFields: ["colors.primary", "fonts.heading", "spacing.unit", "customCSS"],
  capabilities: {
    cssVariables: true,
    customCss: true,
    typographyFamilies: true,
    spacingScale: true,
    liveEditable: true,
    frontendDesignOverrides: true,
    styleSheet: true,
    tokenReferences: true,
    perBlockTokenRefs: true,
    animationTokenRefs: true,
  },
} satisfies BackyManifestThemeModule;

const sdkManifestLiveManagement = {
  schemaVersion: "backy.live-management.v1",
  enabled: true,
  endpoints: {
    pages: "/api/admin/sites/site_demo/pages",
    pageCreate: "/api/admin/sites/site_demo/pages",
    pageDetail: "/api/admin/sites/site_demo/pages/{pageId}",
    pageReadiness: "/api/admin/sites/site_demo/pages/{pageId}/readiness",
    pagePublish: "/api/admin/sites/site_demo/pages/{pageId}/publish",
    pageArchive: "/api/admin/sites/site_demo/pages/{pageId}/archive",
    pagePreview: "/api/admin/sites/site_demo/pages/{pageId}/preview",
    pageRevisions: "/api/admin/sites/site_demo/pages/{pageId}/revisions",
    pageRollback: "/api/admin/sites/site_demo/pages/{pageId}/rollback",
    page: "/api/sites/site_demo/manage/pages/{pageId}",
    posts: "/api/admin/sites/site_demo/blog",
    postCreate: "/api/admin/sites/site_demo/blog",
    postDetail: "/api/admin/sites/site_demo/blog/{postId}",
    postReadiness: "/api/admin/sites/site_demo/blog/{postId}/readiness",
    postPublish: "/api/admin/sites/site_demo/blog/{postId}/publish",
    postArchive: "/api/admin/sites/site_demo/blog/{postId}/archive",
    postPreview: "/api/admin/sites/site_demo/blog/{postId}/preview",
    postRevisions: "/api/admin/sites/site_demo/blog/{postId}/revisions",
    postRollback: "/api/admin/sites/site_demo/blog/{postId}/rollback",
    post: "/api/sites/site_demo/manage/blog/{postId}",
    render: "/api/sites/site_demo/render?path={path}",
    editableMapSchema:
      "https://backy.dev/schemas/ai-frontend-contract/editable-map.schema.json",
  },
  methods: {
    list: "GET",
    read: "GET",
    create: "POST",
    update: "PATCH",
    delete: "DELETE",
    publish: "POST",
    archive: "POST",
    preview: "POST",
    revisions: "GET",
    rollback: "POST",
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
    authenticatedContentLifecycle: true,
    pageLifecycle: true,
    postLifecycle: true,
    templateCloning: true,
    previewTokenCreation: true,
    revisionHistory: true,
    editorComposition: true,
    editorGrouping: true,
    mediaAssetRefs: true,
    fontAssetRefs: true,
    elementAssetIds: true,
    tokenRefs: true,
    animation: true,
    animationTokenRefs: true,
  },
  editableTargets: [
    "props.content",
    "props.href",
    "props.target",
    "props.download",
    "props.src",
    "props.fileId",
    "props.fileIds",
    "props.fileMediaId",
    "props.fileMediaIds",
    "props.downloadMediaId",
    "props.downloadMediaIds",
    "props.fileMediaUrl",
    "props.fileUrl",
    "props.fileMediaName",
    "props.fileMediaType",
    "props.fileMediaVisibility",
    "props.fileDownloadDisposition",
    "props.fileSignedUrlRequired",
    "props.fileSignedUrlEndpoint",
    "props.fileName",
    "props.mediaId",
    "props.mediaIds",
    "props.backgroundMediaIds",
    "props.posterMediaIds",
    "props.fontMediaId",
    "props.fontMediaIds",
    "props.imageFocalPoint",
    "props.fontRegistration",
    "props.formId",
    "props.fieldBackgroundColor",
    "props.submitBackgroundColor",
    "props.label",
    "props.options",
    "props.backgroundColor",
    "props.borderWidth",
    "props.textAlign",
    "props.actionPreset",
    "props.underline",
    "styles.color",
    "styles.boxShadow",
    "tokenRefs.styles.color",
    "tokenRefs.styles.boxShadow",
    "animation.type",
    "animation.duration",
    "animation.scrollTrigger.start",
    "animation.scrollTrigger.scrub",
    "animation.from",
    "animation.to",
    "animation.tokenRefs.duration",
    "actions",
    "dataBindings",
    "bindingSlots",
    "assetIds",
    "responsive.mobile.props.fileId",
    "responsive.mobile.props.fileIds",
    "responsive.mobile.props.fileMediaId",
    "responsive.mobile.props.fileMediaIds",
    "responsive.mobile.props.downloadMediaId",
    "responsive.mobile.props.downloadMediaIds",
    "responsive.mobile.props.fileMediaUrl",
    "responsive.mobile.props.fileUrl",
    "responsive.mobile.props.fileMediaName",
    "responsive.mobile.props.fileMediaType",
    "responsive.mobile.props.fileMediaVisibility",
    "responsive.mobile.props.fileDownloadDisposition",
    "responsive.mobile.props.fileSignedUrlRequired",
    "responsive.mobile.props.fileSignedUrlEndpoint",
    "responsive.mobile.props.fileName",
    "responsive.mobile.props.backgroundColor",
    "responsive.mobile.styles.boxShadow",
    "responsive.mobile.props.mediaIds",
    "responsive.mobile.props.posterMediaIds",
    "responsive.tablet.props.fileId",
    "responsive.tablet.props.fileIds",
    "responsive.tablet.props.fileMediaId",
    "responsive.tablet.props.fileMediaIds",
    "responsive.tablet.props.downloadMediaId",
    "responsive.tablet.props.downloadMediaIds",
    "responsive.tablet.props.fileMediaUrl",
    "responsive.tablet.props.fileUrl",
    "responsive.tablet.props.fileMediaName",
    "responsive.tablet.props.fileMediaType",
    "responsive.tablet.props.fileMediaVisibility",
    "responsive.tablet.props.fileDownloadDisposition",
    "responsive.tablet.props.fileSignedUrlRequired",
    "responsive.tablet.props.fileSignedUrlEndpoint",
    "responsive.tablet.props.fileName",
    "responsive.tablet.props.borderWidth",
    "responsive.tablet.tokenRefs.styles.boxShadow",
    "responsive.mobile.x",
    "responsive.tablet.width",
  ],
  lifecycle: sdkManifestContentLifecycle,
  editorComposition: {
    schemaVersion: "backy.editor-composition-commands.v1",
    sdkHelpers: {
      listElements: "listBackyContentElements",
      findElement: "findBackyContentElement",
      addElement: "addBackyContentElement",
      duplicateElement: "duplicateBackyContentElement",
      deleteElements: "deleteBackyContentElements",
      transformElements: "transformBackyContentElements",
      group: "groupBackyContentElements",
      ungroup: "ungroupBackyContentElements",
      patchElement: "patchBackyContentElement",
      patchElements: "patchBackyContentElements",
      buildPageUpdate: "buildBackyLiveManagedPageEditableMapUpdate",
      buildBlogPostUpdate: "buildBackyLiveManagedBlogPostEditableMapUpdate",
    },
    commands: [
      {
        id: "add",
        label: "Add an element to the canvas or selected parent layer",
        shortcut: "Insert",
        sdkHelper: "addBackyContentElement",
        minSelected: 0,
        sameParentRequired: false,
        unlockedRequired: true,
        mutates: ["children", "parentId", "zIndex"],
        preservesResponsiveGeometry: true,
      },
      {
        id: "duplicate",
        label: "Duplicate the selected element tree",
        shortcut: "Cmd/Ctrl+D",
        sdkHelper: "duplicateBackyContentElement",
        minSelected: 1,
        sameParentRequired: false,
        unlockedRequired: true,
        mutates: ["id", "parentId", "children", "layout"],
        preservesResponsiveGeometry: true,
      },
      {
        id: "delete",
        label: "Delete selected unlocked element trees",
        shortcut: "Delete/Backspace",
        sdkHelper: "deleteBackyContentElements",
        minSelected: 1,
        sameParentRequired: false,
        unlockedRequired: true,
        mutates: ["children"],
        preservesResponsiveGeometry: true,
      },
      {
        id: "move",
        label: "Move selected elements on desktop or responsive breakpoints",
        shortcut: "Arrow keys / drag",
        sdkHelper: "transformBackyContentElements",
        minSelected: 1,
        sameParentRequired: false,
        unlockedRequired: true,
        mutates: ["layout.x", "layout.y", "responsive.tablet", "responsive.mobile"],
        preservesResponsiveGeometry: true,
      },
      {
        id: "resize",
        label: "Resize selected elements on desktop or responsive breakpoints",
        shortcut: "Drag handles",
        sdkHelper: "transformBackyContentElements",
        minSelected: 1,
        sameParentRequired: false,
        unlockedRequired: true,
        mutates: ["layout.width", "layout.height", "responsive.tablet", "responsive.mobile"],
        preservesResponsiveGeometry: true,
      },
      {
        id: "group",
        label: "Group selected sibling layers",
        shortcut: "Cmd/Ctrl+G",
        sdkHelper: "groupBackyContentElements",
        minSelected: 2,
        sameParentRequired: true,
        unlockedRequired: true,
        createsEditorGroup: true,
        preservesResponsiveGeometry: true,
      },
      {
        id: "ungroup",
        label: "Ungroup selected editor groups",
        shortcut: "Shift+Cmd/Ctrl+G",
        sdkHelper: "ungroupBackyContentElements",
        minSelected: 1,
        sameParentRequired: true,
        unlockedRequired: true,
        editorGroupRequired: true,
        preservesResponsiveGeometry: true,
      },
	    ],
	    commandRegistry: sdkManifestEditorCommandRegistry,
	    constraints: {
      sameParentRequired: true,
      lockedLayersBlocked: true,
      editorGroupMarker: "props.editorGroup",
      responsiveBreakpoints: ["tablet", "mobile"],
      updateTarget: "content",
    },
  },
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
  "x-backy-custom-frontend-agent-handoff": customFrontendAgentHandoff,
  "x-backy-completion-status": completionStatus,
  "x-backy-media-file-categories": openApiMediaFileCategories,
  "x-backy-forms-management": sdkManifestFormsManagementPolicy,
  "x-backy-commerce-management": sdkManifestCommerceManagementPolicy,
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
    "/api/sites/site_demo/agent-handoff": {
      get: {
        operationId: "getBackyCustomFrontendAgentHandoff",
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
      BackyCompletionStatus: completionStatus,
      MediaFileCategoryDiscovery: openApiMediaFileCategories,
      FormsManagementPolicy: sdkManifestFormsManagementPolicy,
      CommerceManagementPolicy: sdkManifestCommerceManagementPolicy,
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
const openApiAgentHandoffOperationId =
  "getBackyCustomFrontendAgentHandoff" satisfies GeneratedBackyOpenApiOperationId;
const openApiComponentName =
  "ErrorEnvelope" satisfies GeneratedBackyOpenApiComponentName;
const openApiAgentHandoffComponentName =
  "CustomFrontendAgentHandoffEnvelope" satisfies GeneratedBackyOpenApiComponentName;
const openApiComponents = {
  BackyCompletionStatus: completionStatus,
  MediaFileCategoryDiscovery: openApiMediaFileCategories,
  FormsManagementPolicy: sdkManifestFormsManagementPolicy,
  CommerceManagementPolicy: sdkManifestCommerceManagementPolicy,
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

const openApiProductDesignReadiness = {
  schemaVersion: "backy.product-design-readiness.v1",
  status: "ready",
  templateId: "product-template",
  hasDesign: true,
  hasContentDocument: true,
  hasEditableMap: true,
  hasDataBindings: true,
  counts: {
    elements: 2,
    animations: 1,
    assets: 1,
    bindingHints: 1,
  },
  missing: [],
  detail: "Product carries editable custom frontend design state.",
  nextAction: "Keep the product template and editable map attached.",
  evidence: ["template=product-template", "animations=1"],
  secretHandling: "Design readiness excludes provider secrets and private order data.",
} satisfies GeneratedBackyOpenApiCommerceProductDesignReadiness;

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
  designReadiness: openApiProductDesignReadiness,
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

const sdkCollectionRecordCreateInput =
  buildBackyCollectionRecordWriteInput(
    {
      ...collectionSchema,
      metadata: {
        visitorWritePolicy: {
          createFieldMode: "selected",
          allowedCreateFields: ["title", "slug"],
          updateFieldMode: "selected",
          allowedUpdateFields: ["title"],
        },
      },
    },
    {
      fields: {
        Title: "Generated collection record",
        Slug: "generated-collection-record",
        Status: "draft",
      },
      requestId: "sdk-collection-create",
    },
    { mode: "create" },
  );
const sdkCollectionRecordCreateInputContract =
  sdkCollectionRecordCreateInput satisfies BackyCollectionRecordWriteInput;

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

const formMessageField = {
  key: "message",
  label: "Message",
  type: "textarea",
  placeholder: "How can we help?",
  required: false,
} satisfies GeneratedBackyOpenApiFormFieldDefinition;

const formDefinition = {
  id: "form_contact",
  siteId: "site_demo",
  name: "Contact",
  title: "Contact us",
  description: "Send the team a message.",
  audience: "public",
  isActive: true,
  fields: [formField, formMessageField],
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

const sdkFormSubmissionInput = buildBackyFormSubmissionInput(
  {
    ...formDefinition,
    frontendFieldKeyMap: {
      "Your email": "email",
      your_message: "message",
    },
  },
  {
    fields: {
      "Your email": "reader@example.com",
      "Your message": "Please send the product brief.",
      ignoredTransportValue: "not part of the field map",
    },
    pageId: "page_contact",
    requestId: "sdk-form-submit",
    captcha: {
      token: "captcha-token",
    },
  },
);
const sdkFormSubmissionInputContract =
  sdkFormSubmissionInput satisfies BackyFormSubmissionInput;

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

const sdkAdminFormsEnvelope = {
  success: true,
  requestId: "req_admin_forms",
  data: {
    forms: [formDefinition],
    total: 1,
    pagination: {
      total: 1,
      limit: 100,
      offset: 0,
      hasMore: false,
    },
    persistenceCertification: {
      schemaVersion: "backy.forms-persistence-certification.v1",
      status: "external-database-gate",
    },
  },
} satisfies BackyAdminFormsResponse;

const sdkAdminFormEnvelope = {
  success: true,
  requestId: "req_admin_form",
  data: {
    form: formDefinition,
  },
} satisfies BackyAdminFormResponse;

const sdkAdminFormDeleteEnvelope = {
  success: true,
  requestId: "req_admin_form_delete",
  data: {
    deleted: true,
  },
} satisfies BackyAdminFormDeleteResponse;

const sdkAdminFormCloneEnvelope = {
  success: true,
  requestId: "req_admin_form_clone",
  data: {
    form: formDefinition,
    sourceFormId: "form_source",
  },
} satisfies BackyAdminFormCloneResponse;

const sdkAdminFormEmbedBlockEnvelope = {
  success: true,
  requestId: "req_admin_form_embed_block",
  data: {
    section: sdkAdminReusableSection,
    embed: {
      definitionUrl: "/api/sites/site_demo/forms/form_contact/definition",
      submitUrl: "/api/sites/site_demo/forms/form_contact/submissions",
    },
    cacheInvalidation: {
      scope: "content",
    },
  },
} satisfies BackyAdminFormEmbedBlockResponse;

const sdkAdminFormsAnalyticsEnvelope = {
  success: true,
  requestId: "req_forms_analytics",
  data: {
    site: {
      id: "site_demo",
      slug: "demo",
      name: "Demo",
    },
    analytics: {
      schemaVersion: "backy.forms-analytics.v1",
      totals: {
        forms: 1,
        submissions: 1,
        contacts: 1,
      },
    },
    generatedAt: "2026-05-21T00:00:00.000Z",
  },
} satisfies BackyAdminFormsAnalyticsResponse;

const sdkAdminFormContactSegmentsEnvelope = {
  success: true,
  requestId: "req_form_contact_segments",
  data: {
    site: {
      id: "site_demo",
      slug: "demo",
      name: "Demo",
    },
    formId: "form_contact",
    analytics: {
      schemaVersion: "backy.form-contact-segments.v1",
      summary: {
        contacts: 1,
      },
      segments: [],
    },
    generatedAt: "2026-05-21T00:00:00.000Z",
  },
} satisfies BackyAdminFormContactSegmentsResponse;

const sdkAdminFormContactListsEnvelope = {
  success: true,
  requestId: "req_form_contact_lists",
  data: {
    lists: [
      {
        id: "newsletter",
        name: "Newsletter",
        count: 1,
        filters: {
          status: "qualified",
        },
      },
    ],
    count: 1,
  },
} satisfies BackyAdminFormContactListsResponse;

const sdkAdminFormContactListMutationEnvelope = {
  success: true,
  requestId: "req_form_contact_list_save",
  data: {
    list: {
      id: "newsletter",
      name: "Newsletter",
      filters: {
        status: "qualified",
      },
    },
    lists: [
      {
        id: "newsletter",
        name: "Newsletter",
      },
    ],
    created: true,
  },
} satisfies BackyAdminFormContactListMutationResponse;

const sdkAdminFormSubmissionsEnvelope = {
  success: true,
  requestId: "req_admin_submissions",
  data: {
    form: formDefinition,
    submissions: {
      data: [formSubmission],
      pagination: {
        total: 1,
        limit: 20,
        offset: 0,
        hasMore: false,
      },
    },
  },
} satisfies BackyAdminFormSubmissionsResponse;

const sdkAdminFormSubmissionEnvelope = {
  success: true,
  requestId: "req_admin_submission",
  data: {
    submission: formSubmission,
  },
} satisfies BackyAdminFormSubmissionResponse;

const sdkAdminFormDeliveryRetryEnvelope = {
  success: true,
  requestId: "req_admin_form_delivery_retry",
  data: {
    delivery: {
      attempted: true,
      target: "https://example.com/form-webhook",
      status: "succeeded",
      statusCode: 200,
      provider: "webhook",
      metadata: {
        retry: true,
      },
    },
    submission: formSubmission,
  },
} satisfies BackyAdminFormDeliveryRetryResponse;

const sdkAdminFormConsentRetentionEnvelope = {
  success: true,
  requestId: "req_admin_form_consent_retention",
  data: {
    formId: formDefinition.id,
    formName: formDefinition.name,
    dryRun: true,
    policy: {
      deleteAfterDays: 730,
      now: "2026-05-21T00:00:00.000Z",
    },
    consentFieldKeys: ["privacyConsent"],
    scanned: 1,
    due: 1,
    anonymized: 0,
    submissions: [formSubmission],
  },
} satisfies BackyAdminFormConsentRetentionResponse;

const sdkAdminFormsConsentRetentionEnvelope = {
  success: true,
  requestId: "req_admin_forms_consent_retention",
  data: {
    dryRun: true,
    policy: {
      now: "2026-05-21T00:00:00.000Z",
    },
    scannedForms: 1,
    formsWithConsent: 1,
    scannedSubmissions: 1,
    due: 1,
    anonymized: 0,
    results: [sdkAdminFormConsentRetentionEnvelope.data],
  },
} satisfies BackyAdminFormsConsentRetentionResponse;

const sdkAdminFormContactsEnvelope = {
  success: true,
  requestId: "req_admin_contacts",
  data: {
    formId: "form_contact",
    contacts: [formContact],
    count: 1,
    pagination: {
      total: 1,
      limit: 20,
      offset: 0,
      hasMore: false,
    },
  },
} satisfies BackyAdminFormContactsResponse;

const sdkAdminFormContactEnvelope = {
  success: true,
  requestId: "req_admin_contact",
  data: {
    contact: formContact,
  },
} satisfies BackyAdminFormContactResponse;

const sdkAdminFormContactImportEnvelope = {
  success: true,
  requestId: "req_admin_contact_import",
  data: {
    formId: "form_contact",
    contacts: [formContact],
    import: {
      created: 1,
      updated: 0,
      skipped: 0,
      errors: [],
    },
  },
} satisfies BackyAdminFormContactImportResponse;

const sdkAdminFormContactUserPromotionEnvelope = {
  success: true,
  requestId: "req_admin_contact_user_promotion",
  data: {
    contact: {
      ...formContact,
      status: "qualified",
    },
    user: sdkAdminUser,
    existingUser: false,
    invite: {
      id: "invite_contact",
      token: "token_contact",
      userId: sdkAdminUser.id,
      email: sdkAdminUser.email,
      inviteUrl: "https://demo.example/admin/accept-invite?token=token_contact",
      expiresAt: "2026-05-28T00:00:00.000Z",
    },
  },
} satisfies BackyAdminFormContactUserPromotionResponse;

const sdkAdminFormContactCustomerPromotionEnvelope = {
  success: true,
  requestId: "req_admin_contact_customer_promotion",
  data: {
    contact: {
      ...formContact,
      status: "qualified",
    },
    collection: sdkAdminCollection,
    record: sdkAdminCollectionRecord,
    existingRecord: false,
    createdCollection: true,
  },
} satisfies BackyAdminFormContactCustomerPromotionResponse;

const sdkAdminFormContactSyncEnvelope = {
  success: true,
  requestId: "req_admin_contact_sync",
  data: {
    formId: "form_contact",
    delivery: {
      target: "https://example.com/contact-sync",
      status: "succeeded",
      statusCode: 200,
      error: null,
      count: 1,
      contactIds: [formContact.id],
    },
  },
} satisfies BackyAdminFormContactSyncResponse;

const sdkAdminFormContactConsentRetentionEnvelope = {
  success: true,
  requestId: "req_admin_contact_consent_retention",
  data: {
    formId: "form_contact",
    dryRun: true,
    policy: {
      deleteAfterDays: 730,
      now: "2026-05-21T00:00:00.000Z",
    },
    consentFieldKeys: ["privacyConsent"],
    scanned: 1,
    due: 1,
    anonymized: 0,
    contacts: [
      {
        id: formContact.id,
        formId: "form_contact",
        pageId: "page_contact",
        postId: null,
        status: "qualified",
        name: formContact.name,
        email: formContact.email,
        phone: null,
        requestId: "req_submission",
        sourceSubmissionId: "submission_1",
        sourceIpHash: "ip_hash_1",
        consentValues: {
          privacyConsent: true,
        },
        dueAt: "2026-05-21T00:00:00.000Z",
        due: true,
        createdAt: "2026-05-16T00:00:00.000Z",
        updatedAt: "2026-05-16T00:01:00.000Z",
      },
    ],
  },
} satisfies BackyAdminFormContactConsentRetentionResponse;

const sdkAdminFormContactDeleteEnvelope = {
  success: true,
  requestId: "req_admin_contact_delete",
  data: {
    deleted: true,
    contact: formContact,
  },
} satisfies BackyAdminFormContactDeleteResponse;

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
  collectionRecordIds: [],
  pages: [mediaReferenceTarget],
  posts: [],
  collectionRecords: [],
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

const mediaOrganization = {
  schemaVersion: "backy.media.organization.v1",
  folderId: "folder_brand",
  folderName: "Brand",
  folderPath: "Assets/Brand",
  folderSegments: ["Assets", "Brand"],
  folderAncestors: [
    { id: "folder_assets", name: "Assets", parentId: null, sortOrder: 0 },
    { id: "folder_brand", name: "Brand", parentId: "folder_assets", sortOrder: 10 },
  ],
  folderDepth: 1,
  folderSortOrder: 10,
  root: false,
  missingFolder: false,
} satisfies NonNullable<GeneratedBackyOpenApiMediaAsset["organization"]>;

const mediaAsset = {
  id: "media_hero",
  type: "image",
  url: "/media/hero.webp",
  visibility: "public",
  organization: mediaOrganization,
  references: mediaReferences,
  referenceSummary: {
    pageCount: 1,
    postCount: 0,
    collectionRecordCount: 0,
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
  organization: {
    schemaVersion: "backy.media.organization.v1",
    folderId: null,
    folderName: "Root",
    folderPath: "Root",
    folderSegments: [],
    folderAncestors: [],
    folderDepth: -1,
    folderSortOrder: null,
    root: true,
    missingFolder: false,
  },
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

const sdkAdminMediaUploadInput = {
  file: new Blob(["brand guide"], { type: "text/plain" }),
  filename: "brand-guide.txt",
  scope: "global",
  visibility: "private",
  folderId: "folder_brand",
  tags: ["brand", "guide"],
  metadata: {
    source: "sdk-fixture",
  },
  requestId: "sdk-media-upload",
} satisfies BackyAdminMediaUploadInput;

const sdkAdminMediaUpdateInput = {
  originalName: "Brand guide",
  altText: null,
  caption: "Internal launch asset.",
  tags: ["brand", "launch"],
  folderId: "folder_brand",
  visibility: "private",
  requestId: "sdk-media-update",
} satisfies BackyAdminMediaUpdateInput;

const sdkAdminMediaListEnvelope = {
  success: true,
  requestId: "req_admin_media",
  data: {
    media: [mediaAsset],
    quota: {
      limitBytes: 1_000_000,
      usedBytes: 82_000,
      remainingBytes: 918_000,
    },
    pagination: {
      total: 1,
      limit: 20,
      offset: 0,
      hasMore: false,
    },
  },
} satisfies BackyAdminMediaListResponse;

const sdkAdminMediaEnvelope = {
  success: true,
  requestId: "req_admin_media_detail",
  data: {
    media: mediaAsset,
    quota: {
      limitBytes: 1_000_000,
      usedBytes: 82_000,
      remainingBytes: 918_000,
    },
    cacheInvalidation: {
      scope: "media",
      entityId: "media_hero",
    },
  },
} satisfies BackyAdminMediaResponse;

const sdkAdminMediaDeleteEnvelope = {
  success: true,
  requestId: "req_admin_media_delete",
  data: {
    deleted: true,
    mediaId: "media_hero",
  },
} satisfies BackyAdminMediaDeleteResponse;

const sdkAdminMediaFoldersEnvelope = {
  success: true,
  requestId: "req_admin_media_folders",
  data: {
    folders: [
      {
        id: "folder_brand",
        siteId: "site_demo",
        parentId: null,
        name: "Brand",
        sortOrder: 10,
        createdAt: "2026-05-21T00:00:00.000Z",
      },
    ],
  },
} satisfies BackyAdminMediaFoldersResponse;

const sdkAdminMediaFolderEnvelope = {
  success: true,
  requestId: "req_admin_media_folder",
  data: {
    folder: {
      id: "folder_brand",
      siteId: "site_demo",
      parentId: null,
      name: "Brand",
      sortOrder: 10,
      createdAt: "2026-05-21T00:00:00.000Z",
    },
    cacheInvalidation: {
      scope: "media",
      entityId: "folder_brand",
    },
  },
} satisfies BackyAdminMediaFolderResponse;

const sdkAdminMediaFolderDeleteEnvelope = {
  success: true,
  requestId: "req_admin_media_folder_delete",
  data: {
    deleted: true,
    folderId: "folder_brand",
  },
} satisfies BackyAdminMediaFolderDeleteResponse;

const sdkAdminMediaVersion = {
  id: "version_hero_original",
  filename: "hero-original.webp",
  originalName: "Hero original",
  mimeType: "image/webp",
  sizeBytes: 120000,
  type: "image",
  url: "/media/hero-original.webp",
  thumbnailUrl: "/media/hero-original-thumb.webp",
  storagePath: "sites/site_demo/media/hero-original.webp",
  storageProvider: "supabase",
  replacedAt: "2026-05-20T00:00:00.000Z",
  replacedBy: "designer@example.com",
  reason: "Updated hero crop",
} satisfies BackyAdminMediaVersion;

const sdkAdminMediaVersionsEnvelope = {
  success: true,
  requestId: "req_admin_media_versions",
  data: {
    mediaId: "media_hero",
    source: "database",
    versions: [sdkAdminMediaVersion],
    pagination: {
      total: 1,
      limit: 20,
      offset: 0,
      hasMore: false,
    },
  },
} satisfies BackyAdminMediaVersionsResponse;

const sdkAdminMediaVersionRestoreEnvelope = {
  success: true,
  requestId: "req_admin_media_version_restore",
  data: {
    restored: true,
    mediaId: "media_hero",
    versionId: "version_hero_original",
    source: "database",
    media: mediaAsset,
    restoredVersion: sdkAdminMediaVersion,
    retainedVersion: {
      ...sdkAdminMediaVersion,
      id: "version_hero_retained",
    },
    cacheInvalidation: {
      scope: "media",
      entityId: "media_hero",
    },
  },
} satisfies BackyAdminMediaVersionRestoreResponse;

const sdkAdminMediaVersionDeleteEnvelope = {
  success: true,
  requestId: "req_admin_media_version_delete",
  data: {
    deleted: true,
    mediaId: "media_hero",
    versionId: "version_hero_original",
    source: "database",
    version: sdkAdminMediaVersion,
    media: mediaAsset,
    cacheInvalidation: {
      scope: "media",
      entityId: "media_hero",
    },
  },
} satisfies BackyAdminMediaVersionDeleteResponse;

const sdkAdminMediaTransformsEnvelope = {
  success: true,
  requestId: "req_admin_media_transforms",
  data: {
    media: mediaAsset,
    responsive: mediaAsset.responsive,
    quota: {
      limitBytes: 1_000_000,
      usedBytes: 164_000,
      remainingBytes: 836_000,
    },
    cacheInvalidation: {
      scope: "media",
      entityId: "media_hero",
    },
  },
} satisfies BackyAdminMediaTransformsResponse;

const sdkAdminMediaProviderAnalyticsEnvelope = {
  success: true,
  requestId: "req_admin_media_provider_analytics",
  data: {
    source: "cloudfront",
    reportingWindow: "2026-05",
    mergeMode: "replace",
    matchedCount: 1,
    unmatchedCount: 0,
    matched: [
      {
        mediaId: "media_hero",
        matchedBy: "mediaId",
        totalRequests: 1200,
        bytesServed: 98400000,
        conversions: 8,
        conversionValue: 499,
      },
    ],
    unmatched: [],
    cacheInvalidation: {
      scope: "media",
    },
  },
} satisfies BackyAdminMediaProviderAnalyticsResponse;

const sdkMediaBindingInput = buildBackyMediaBindingInput({
  target: {
    type: "page",
    id: "page_home",
  },
  usage: "hero-image",
  editor: "designer@example.com",
  requestId: "sdk-media-bind",
});
const sdkMediaBindingInputContract =
  sdkMediaBindingInput satisfies BackyMediaBindingInput;

const sdkMediaSignedUrlInput = buildBackyMediaSignedUrlInput({
  access: {
    disposition: "download",
    ttl: "900",
  },
  requestId: "sdk-media-signed-url",
});
const sdkMediaSignedUrlInputContract =
  sdkMediaSignedUrlInput satisfies BackyMediaSignedUrlInput;

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

const sdkCommentInput = buildBackyCommentInput({
  message: "This page helped me understand the product.",
  name: "Reader",
  email: "READER@EXAMPLE.COM",
  website: "https://example.com",
  replyToId: "comment_parent",
  threadId: "thread_home",
  requestId: "sdk-comment-submit",
  startedAt: "2026-05-16T00:00:00.000Z",
  honeypot: "",
  captcha: {
    token: "captcha-token",
  },
});
const sdkCommentInputContract =
  sdkCommentInput satisfies BackyCommentInput;

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
      actor: "reader@example.com",
      details: "This reply looks automated.",
    },
  },
} satisfies GeneratedBackyOpenApiCommentReportEnvelope;

const commentAnalytics = {
  siteId: "site_demo",
  generatedAt: "2026-05-21T00:00:00.000Z",
  windowDays: 30,
  totals: {
    comments: 1,
    allTimeComments: 2,
    pending: 0,
    approved: 1,
    rejected: 0,
    spam: 0,
    blocked: 0,
    reported: 1,
    reviewed: 1,
    unreviewed: 0,
    replies: 0,
  },
  byStatus: {
    pending: 0,
    approved: 1,
    rejected: 0,
    spam: 0,
    blocked: 0,
  },
  reports: {
    comments: 1,
    reasons: [{ reason: "spam", count: 1 }],
  },
  threads: {
    total: 1,
    withReplies: 0,
    reported: 1,
    pendingReplies: 0,
    top: [
      {
        id: "thread_home",
        targetType: "page",
        targetId: "page_home",
        total: 1,
        replies: 0,
        pending: 0,
        reported: 1,
        latestAt: "2026-05-16T00:01:00.000Z",
      },
    ],
  },
  targets: [
    {
      targetType: "page",
      targetId: "page_home",
      total: 1,
      pending: 0,
      reported: 1,
      replies: 0,
    },
  ],
  daily: [
    {
      date: "2026-05-16",
      submitted: 1,
      reviewed: 1,
      reported: 1,
    },
  ],
} satisfies GeneratedBackyOpenApiCommentAnalytics;

const commentAnalyticsEnvelope = {
  success: true,
  requestId: "req_comment_analytics",
  data: {
    analytics: commentAnalytics,
  },
} satisfies GeneratedBackyOpenApiCommentAnalyticsEnvelope;

const sdkCommentAnalyticsEnvelope = {
  success: true,
  requestId: "req_comment_analytics",
  data: {
    analytics: commentAnalytics,
  },
} satisfies BackyCommentAnalyticsResponse;

const commentDeliveryRetryRequest = {
  eventId: "event_comment_delivery_failed",
  requestId: "req_comment_delivery_retry",
} satisfies GeneratedBackyOpenApiCommentDeliveryRetryRequest;

const commentDeliveryRetryEnvelope = {
  success: true,
  requestId: "req_comment_delivery_retry",
  data: {
    delivery: {
      attempted: true,
      channel: "webhook",
      target: "https://example.com/comment-webhook",
      status: "succeeded",
      statusCode: 200,
      provider: "webhook",
      metadata: {
        retry: true,
      },
    },
    retryOf: "event_comment_delivery_failed",
    comment,
  },
} satisfies GeneratedBackyOpenApiCommentDeliveryRetryEnvelope;

const sdkCommentDeliveryRetryEnvelope = {
  success: true,
  requestId: "req_comment_delivery_retry",
  data: {
    delivery: {
      attempted: true,
      channel: "email",
      target: "mailto:moderator@example.com",
      status: "queued",
      provider: "email",
    },
    retryOf: "event_comment_email_failed",
    comment,
  },
} satisfies BackyCommentDeliveryRetryResponse;

const sdkCommentReportInput = buildBackyCommentReportInput({
  report: {
    category: "spam",
    reporterEmail: "READER@EXAMPLE.COM",
    message: "This reply looks automated.",
  },
  requestId: "sdk-comment-report",
});
const sdkCommentReportInputContract =
  sdkCommentReportInput satisfies BackyCommentReportInput;

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

const sdkInteractiveRuntimeEventInput =
  buildBackyInteractiveRuntimeEventInput({
    type: "backy.interactive-component.error",
    component: {
      key: "backy.custom.sandboxed",
      version: "1.0.0",
    },
    data: {
      elementId: "hero-code-component",
      pageId: "page_home",
    },
    error: {
      message: "Sandbox runtime failed to initialize.",
    },
    requestId: "sdk-runtime-event",
  });
const sdkInteractiveRuntimeEventInputContract =
  sdkInteractiveRuntimeEventInput satisfies BackyInteractiveRuntimeEventInput;

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
  customJs: "window.__backyProductReady = true;",
  contentDocument: {
    schemaVersion: "backy.content.v1",
    elements: [
      {
        id: "product-hero",
        type: "section",
        animation: {
          preset: "fade-up",
        },
      },
    ],
    canvasSize: { width: 1440, height: 900 },
    editableMap: {},
    metadata: {
      templateKind: "product-detail",
    },
  },
  elements: [
    {
      id: "product-hero",
      type: "section",
      animation: {
        preset: "fade-up",
      },
    },
  ],
  canvasSize: { width: 1440, height: 900 },
  themeTokenRefs: {
    cta: "colors.primary",
  },
  assets: [
    {
      id: "product-hero-image",
      kind: "image",
    },
  ],
  interactions: [
    {
      trigger: "hover",
      target: "product-card",
    },
  ],
  dataBindings: {
    title: {
      source: "product.title",
    },
  },
  editableMap: {
    "product.title": {
      elementId: "product-title",
      targetPath: "props.content",
    },
  },
  seo: {
    title: "Starter template",
  },
  metadata: {
    templateKind: "product-detail",
  },
  bindingHints: [
    {
      field: "title",
      target: "hero.title",
    },
  ],
  frontendDesignCustomJs: "window.__backyProductReady = true;",
  frontendDesignContentDocument: {
    schemaVersion: "backy.content.v1",
    elements: [],
  },
  frontendDesignElements: [
    {
      id: "product-title",
      type: "heading",
    },
  ],
  frontendDesignCanvasSize: { width: 1440, height: 900 },
  frontendDesignThemeTokenRefs: {
    cta: "colors.primary",
  },
  frontendDesignAssets: [
    {
      id: "product-hero-image",
      kind: "image",
    },
  ],
  frontendDesignAnimations: [
    {
      id: "product-hero-intro",
      trigger: "load",
      target: "product-title",
    },
  ],
  frontendDesignInteractions: [
    {
      trigger: "hover",
      target: "product-card",
    },
  ],
  frontendDesignDataBindings: {
    title: {
      source: "product.title",
    },
  },
  frontendDesignEditableMap: {
    "product.title": {
      elementId: "product-title",
      targetPath: "props.content",
    },
  },
  frontendDesignSeo: {
    title: "Starter template",
  },
  frontendDesignMetadata: {
    templateKind: "product-detail",
  },
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

const sdkCommerceOrderInput = buildBackyCommerceOrderInput(
  {
    customerName: "Jane Customer",
    customerEmail: "JANE@EXAMPLE.COM",
    customerPhone: "+15555550100",
    cart: {
      items: [
        {
          productSlug: "starter-template",
          variant_sku: "STARTER-001-STANDARD",
          qty: "2",
        },
      ],
    },
    couponCode: "launch",
    payment: {
      provider: "manual",
      reference: "manual:demo",
    },
    checkoutSession: {
      id: "cs_demo",
    },
  },
  { requestId: "sdk-commerce-order-builder" },
);
const sdkCommerceOrderInputContract =
  sdkCommerceOrderInput satisfies BackyCommerceOrderInput;

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
    statusHandoff: {
      schemaVersion: "backy.order-status-handoff.v1",
      generatedAt: "2026-05-17T00:00:00.000Z",
      source: "public-commerce-order-intake-api",
      status: "attention",
      score: 86,
      selectedSiteId: "site_demo",
      order: {
        id: "order_1",
        slug: "ord-1001",
        orderNumber: "BCK-1001",
        recordStatus: "published",
        total: 4900,
        currency: "USD",
        itemCount: 1,
        orderStatus: "open",
        paymentStatus: "pending",
        fulfillmentStatus: "unfulfilled",
        createdAt: "2026-05-17T00:00:00.000Z",
        updatedAt: "2026-05-17T00:00:00.000Z",
      },
      customer: {
        displayName: "SDK Customer",
        maskedEmail: "sd***@example.com",
        maskedPhone: "***-0100",
        customerProfileLinked: true,
        customerProfileSlug: "",
        customerProfileStatus: "customer",
      },
      tracking: {
        carrier: "",
        trackingNumber: "",
        trackingUrl: "",
        trackingStatus: "",
        trackingLastCheckedAt: "",
        fulfilledAt: "",
        shippingLabelStatus: "none",
        shippingLabelProvider: "",
        shippingLabelReferencePresent: false,
      },
      refund: {
        refundAmount: 0,
        refundReasonPresent: false,
        providerRefundStatus: "none",
        providerRefundProvider: "",
        providerRefundReferencePresent: false,
        providerRefundRequestedAt: "",
        providerRefundCompletedAt: "",
      },
      digitalDelivery: {
        schemaVersion: "backy.order-digital-delivery-handoff.v1",
        itemCount: 0,
        configuredItemCount: 0,
        pendingItemCount: 0,
        status: "not-applicable",
        customerAction: "No digital delivery items were detected for this order.",
        customerSafeFieldsOnly: true,
        includesDownloadUrls: false,
        includesDownloadMediaIds: false,
      },
      endpoints: {
        checkoutIntake: "https://example.com/api/sites/site_demo/commerce/orders",
        publicStatusHandoff:
          "https://example.com/api/sites/site_demo/commerce/orders?orderId=order_1",
        adminStatusHandoff:
          "https://example.com/api/admin/sites/site_demo/commerce/orders/order_1/status-handoff",
        adminOrderDetail:
          "https://example.com/api/admin/sites/site_demo/collections/orders/records/order_1",
        adminTracking:
          "https://example.com/api/admin/sites/site_demo/commerce/orders/order_1/tracking",
        adminProviderRefund:
          "https://example.com/api/admin/sites/site_demo/commerce/orders/order_1/provider-refund",
      },
      frontendBindings: {
        schemaVersion: "backy.order-status-frontend-bindings.v1",
        targetViews: ["order-confirmation", "order-tracking"],
        dataset: {
          key: "orderStatusHandoff",
          source: "public-commerce-order-intake-api",
          endpoint: "https://example.com/api/sites/site_demo/commerce/orders",
          selectedOrderId: "order_1",
          selectedOrderSlug: "ord-1001",
          auth: "post-checkout-response",
          refreshMethod: "POST-response",
        },
        safeBindingPaths: [
          "order.orderNumber",
          "order.paymentStatus",
          "digitalDelivery.status",
        ],
        maskedBindingPaths: ["customer.maskedEmail", "customer.maskedPhone"],
        editableRegions: [
          {
            key: "confirmation-summary",
            targetViews: ["order-confirmation"],
          },
        ],
        actionBindings: [
          {
            key: "use-checkout-status-handoff",
            method: "POST-response",
          },
        ],
      },
      privacy: {
        publicCollectionReadBlocked: true,
        customerSafeFieldsOnly: true,
        includesRawCustomerContact: false,
        includesProviderExecutionIds: false,
        includesPaymentReferences: false,
        includesAddresses: false,
        includesInternalNotes: false,
        includesDigitalDeliveryUrls: false,
        includesDownloadMediaIds: false,
        excludedFields: ["email", "paymentreference", "downloadurl"],
      },
      actionPlan: {
        recommendedAction: "confirm-payment",
      },
      checks: [
        {
          key: "payment-status",
          status: "attention",
        },
      ],
      nextSteps: ["Payment is still pending."],
    },
    statusAccess: {
      schemaVersion: "backy.order-status-access.v1",
      auth: "status-token",
      tokenReturnedOnce: true,
      statusToken: "status_token_demo",
      tokenStorage:
        "store-in-customer-session-or-email-link; Backy stores only statusaccesstokenhash",
      tokenExpiresAt: "2026-08-15T00:00:00.000Z",
      orderId: "order_1",
      orderSlug: "ord-1001",
      endpoint:
        "https://example.com/api/sites/site_demo/commerce/orders?orderId=order_1",
      endpointTemplate:
        "https://example.com/api/sites/site_demo/commerce/orders?orderId=order_1&statusToken={statusToken}",
      refreshMethod: "GET",
      responseContract: "backy.order-status-handoff.v1",
      privacy: {
        rawTokenStoredByBacky: false,
        tokenHashField: "statusaccesstokenhash",
        includesRawOrder: false,
        customerSafeFieldsOnly: true,
      },
    },
  },
} satisfies GeneratedBackyOpenApiCommerceOrderEnvelope;

const commerceOrderStatusHandoffEnvelope = {
  success: true,
  requestId: "req_order_status_handoff",
  data: {
    schemaVersion: "backy.order-status-handoff.v1",
    statusHandoff: commerceOrderEnvelope.data.statusHandoff,
    statusAccess: commerceOrderEnvelope.data.statusAccess,
  },
} satisfies GeneratedBackyOpenApiCommerceOrderStatusHandoffEnvelope;

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
  animation: {
    type: "slideIn",
    duration: 0.32,
    direction: "up",
    trigger: "scroll",
    scrollTrigger: {
      start: "top 85%",
      scrub: false,
    },
    tokenRefs: {
      duration: "motion.duration.slow",
      easing: "motion.easing.standard",
    },
  },
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

const pageDesignStateUpdate = {
  expectedUpdatedAt: "2026-05-21T12:00:00.000Z",
  content: {
    elements: [openApiContentElement],
    canvasSize: {
      width: 1200,
      height: 900,
    },
    customCSS: ".hero { min-height: 70vh; }",
    customJS: "window.__backyHeroReady = true;",
    themeTokenRefs: {
      primary: "colors.primary",
    },
    assets: {
      media: [openApiContentAssetRef],
    },
    animations: [
      {
        id: "hero-enter",
        target: "hero-title",
        timeline: ["hero-intro"],
      },
    ],
    interactions: {
      actions: {
        schemaVersion: "backy.actions.v1",
        actions: [openApiElementAction],
      },
    },
    seo: {
      title: "Designed page",
    },
    dataBindings: {
      datasets: [{ id: "dataset_docs", collectionId: "docs" }],
      bindings: [openApiDataBinding],
    },
    editableMap: {
      "section-title.text": openApiEditableMapEntry,
    },
    metadata: {
      editorState: {
        selectedBreakpoint: "desktop",
        animationTimeline: "hero-intro",
      },
    },
    contentDocument: openApiContentDocument,
  },
} satisfies GeneratedBackyOpenApiPageUpdateRequest;

const blogDesignStateUpdate = {
  content: pageDesignStateUpdate.content,
} satisfies GeneratedBackyOpenApiBlogPostUpdateRequest;

const reusableSectionContent = {
  elements: [openApiContentElement],
  canvasSize: {
    width: 1200,
    height: 480,
  },
  customCSS: ".docs-header { color: var(--backy-color-text); }",
  contentDocument: openApiContentDocument,
  themeTokenRefs: {
    "docs-header.color": "colors.text",
  },
  assets: [
    {
      id: "docs-header-bg",
      mediaId: "media_docs_header",
      role: "section.background",
    },
  ],
  animations: [
    {
      id: "docs-header-intro",
      timeline: "docs-header-intro",
    },
  ],
  interactions: [
    {
      id: "docs-header-hover",
      trigger: "hover",
    },
  ],
  dataBindings: {
    heading: {
      source: "section.heading",
      targetPath: "elements.hero-heading.props.text",
    },
  },
  editableMap: {
    heading: {
      elementId: "hero-heading",
      path: "props.text",
    },
  },
  seo: {
    title: "Docs header",
  },
  metadata: {
    templateKind: "reusable-section",
  },
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

void pageDesignStateUpdate;
void blogDesignStateUpdate;

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

const interactiveControlOptions = [
  "slow",
  3,
  true,
  { label: "Automatic", value: "auto" },
] satisfies GeneratedBackyOpenApiInteractiveComponentControlOption[];

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
      options: interactiveControlOptions,
      defaultValue: "normal",
    },
    {
      key: "displayMode",
      label: "Display mode",
      type: "radio",
      options: [
        { label: "Compact", value: "compact" },
        { label: "Detailed", value: "detailed" },
      ],
      defaultValue: "compact",
    },
    {
      key: "caption",
      label: "Caption",
      type: "textarea",
      defaultValue: "Accessible fallback caption.",
    },
    {
      key: "runtimeConfig",
      label: "Runtime config",
      type: "json",
      defaultValue: { reducedMotionFallback: true },
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
          schemaVersion: "backy.interactive-component-sandbox.v1",
          contractVersionHeader: "x-backy-contract-version",
          schemaVersionHeader: "x-backy-schema-version",
          cacheScopeHeader: "x-backy-cache-scope",
          cacheRevisionHeader: "x-backy-cache-revision",
          etagHeader: "etag",
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

const invalidGeneratedManifestCompletionStatus = {
  ...manifest,
  contract: {
    ...manifest.contract,
    completionStatus: {
      ...manifest.contract.completionStatus,
      // @ts-expect-error generated manifest completion status has a stable schema version.
      schemaVersion: "backy.completion-status.v0",
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

const invalidGeneratedManifestMediaManagement = {
  ...manifest.modules.media,
  managementPolicy: {
    ...manifest.modules.media.managementPolicy,
    // @ts-expect-error generated manifest media management policy uses a versioned schema marker.
    schemaVersion: "backy.media-management.v0",
  },
} satisfies GeneratedBackyFrontendManifest["modules"]["media"];

// @ts-expect-error generated manifest theme discovery uses a versioned schema marker.
const invalidGeneratedManifestThemeDiscovery = { ...manifest.modules.theme, schemaVersion: "backy.theme-discovery.v0", } satisfies GeneratedBackyFrontendManifest["modules"]["theme"];

// @ts-expect-error generated manifest live-management discovery uses a versioned schema marker.
const invalidGeneratedManifestLiveManagementDiscovery = { ...manifest.modules.liveManagement, schemaVersion: "backy.live-management.v0", } satisfies GeneratedBackyFrontendManifest["modules"]["liveManagement"];

// @ts-expect-error generated manifest forms discovery uses a versioned schema marker.
const invalidGeneratedManifestFormsRuntimeDiscovery = { ...manifest.modules.formsRuntime, schemaVersion: "backy.forms-discovery.v0", } satisfies GeneratedBackyFrontendManifest["modules"]["formsRuntime"];

const invalidGeneratedManifestFormsManagement = {
  ...manifest.modules.formsRuntime.managementPolicy,
  // @ts-expect-error generated manifest forms management policy uses a versioned schema marker.
  schemaVersion: "backy.forms-management.v0",
} satisfies GeneratedBackyFrontendManifest["modules"]["formsRuntime"]["managementPolicy"];

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

const invalidGeneratedManifestCommerceManagement = {
  ...manifest.modules.commerceRuntime.managementPolicy,
  // @ts-expect-error generated manifest commerce management policy uses a versioned schema marker.
  schemaVersion: "backy.commerce-management.v0",
} satisfies GeneratedBackyFrontendManifest["modules"]["commerceRuntime"]["managementPolicy"];

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
void sdkCollectionRecordCreateInput;
void sdkCollectionRecordCreateInputContract;
void publicDeleteEnvelope;
void formValidationRule;
void formField;
void formMessageField;
void formDefinition;
void formListEnvelope;
void formEnvelope;
void formDefinitionEnvelope;
void formCollectionRecordLink;
void formCollectionRecordError;
void formSubmission;
void formSubmissionRequest;
void sdkFormSubmissionInput;
void sdkFormSubmissionInputContract;
void formSubmissionValidationDetail;
void formSubmissionValidationErrorEnvelope;
void formSubmissionEnvelope;
void formSubmissionsEnvelope;
void formContact;
void formContactEnvelope;
void formContactsEnvelope;
void sdkAdminFormsEnvelope;
void sdkAdminFormEnvelope;
void sdkAdminFormDeleteEnvelope;
void sdkAdminFormCloneEnvelope;
void sdkAdminFormEmbedBlockEnvelope;
void sdkAdminFormsAnalyticsEnvelope;
void sdkAdminFormContactSegmentsEnvelope;
void sdkAdminFormContactListsEnvelope;
void sdkAdminFormContactListMutationEnvelope;
void sdkAdminFormSubmissionsEnvelope;
void sdkAdminFormSubmissionEnvelope;
void sdkAdminFormDeliveryRetryEnvelope;
void sdkAdminFormConsentRetentionEnvelope;
void sdkAdminFormsConsentRetentionEnvelope;
void sdkAdminFormContactsEnvelope;
void sdkAdminFormContactEnvelope;
void sdkAdminFormContactImportEnvelope;
void sdkAdminFormContactUserPromotionEnvelope;
void sdkAdminFormContactCustomerPromotionEnvelope;
void sdkAdminFormContactSyncEnvelope;
void sdkAdminFormContactConsentRetentionEnvelope;
void sdkAdminFormContactDeleteEnvelope;
void mediaReferenceTarget;
void mediaReferences;
void mediaEditableMetadata;
void mediaOrganization;
void mediaAsset;
void genericFileMediaAsset;
void sdkGenericFileMediaAsset;
void sdkGenericFileMediaListOptions;
void sdkAdminMediaUploadInput;
void sdkAdminMediaUpdateInput;
void sdkAdminMediaListEnvelope;
void sdkAdminMediaEnvelope;
void sdkAdminMediaDeleteEnvelope;
void sdkAdminMediaFoldersEnvelope;
void sdkAdminMediaFolderEnvelope;
void sdkAdminMediaFolderDeleteEnvelope;
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
void sdkCommentInput;
void sdkCommentInputContract;
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
void commentAnalytics;
void commentAnalyticsEnvelope;
void sdkCommentAnalyticsEnvelope;
void commentDeliveryRetryRequest;
void commentDeliveryRetryEnvelope;
void sdkCommentDeliveryRetryEnvelope;
void sdkCommentReportInput;
void sdkCommentReportInputContract;
void eventsEnvelope;
void runtimeEventRecordEnvelope;
void sdkInteractiveRuntimeEventInput;
void sdkInteractiveRuntimeEventInputContract;
void commerceProductDesign;
void commerceProduct;
void commerceCatalogEnvelope;
void commerceOrderCreateRequest;
void sdkCommerceOrderInput;
void sdkCommerceOrderInputContract;
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
void invalidGeneratedManifestCompletionStatus;
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
void invalidGeneratedManifestMediaManagement;
void invalidGeneratedManifestThemeDiscovery;
void invalidGeneratedManifestLiveManagementDiscovery;
void invalidGeneratedManifestFormsRuntimeDiscovery;
void invalidGeneratedManifestFormsManagement;
void invalidGeneratedManifestCommerceMode;
void invalidGeneratedManifestCommerceCapabilities;
void invalidGeneratedManifestCommerceProviderCertification;
void invalidGeneratedManifestCommerceRuntimeDiscovery;
void invalidGeneratedManifestCommerceManagement;
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
