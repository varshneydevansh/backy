export const CUSTOM_FRONTEND_AGENT_HANDOFF_SCHEMA = 'backy.custom-frontend-agent-handoff.v1';

export const CUSTOM_FRONTEND_AGENT_HANDOFF_DOC = 'specs/custom-frontend-agent-handoff.md';

export const CUSTOM_FRONTEND_AGENT_ROUND_TRIP_FIELDS = [
  'content.contentDocument',
  'content.elements',
  'content.canvas',
  'content.customCSS',
  'content.customJS',
  'content.themeTokenRefs',
  'content.assets',
  'content.animations',
  'content.interactions',
  'content.dataBindings',
  'content.editableMap',
  'content.seo',
  'content.metadata',
  'meta.frontendDesign*',
] as const;

export const buildCustomFrontendAgentAdminEntryPoints = (siteId: string) => ({
  pageBackyCanvas: `/pages/new?siteId=${siteId}&templateSource=backy-canvas`,
  pageCustomFrontend: `/pages/new?siteId=${siteId}&templateSource=custom-frontend&frontendDesignTemplateId=:templateId`,
  blogBackyCanvas: `/blog/new?siteId=${siteId}&templateSource=backy-canvas`,
  blogCustomFrontend: `/blog/new?siteId=${siteId}&templateSource=custom-frontend&frontendDesignTemplateId=:templateId`,
  productBackyCanvas: `/products?siteId=${siteId}&quickCreate=product`,
  productCustomFrontend: `/products?siteId=${siteId}&frontendTemplate=:templateId`,
  formBackyCanvas: `/forms?siteId=${siteId}&quickCreate=blank`,
  formCustomFrontend: `/forms?siteId=${siteId}&frontendTemplate=:templateId`,
  collectionBackyCanvas: `/collections?siteId=${siteId}&draft=new`,
  collectionCustomFrontend: `/collections?siteId=${siteId}&frontendTemplate=:templateId`,
  reusableSectionBackyCanvas: `/reusable-sections?siteId=${siteId}`,
  reusableSectionCustomFrontend: `/reusable-sections?siteId=${siteId}&frontendTemplate=:templateId`,
});

export const buildCustomFrontendAgentHandoff = (siteId: string) => ({
  schemaVersion: CUSTOM_FRONTEND_AGENT_HANDOFF_SCHEMA,
  source: 'public-manifest-openapi-contract',
  docs: [
    {
      label: 'Custom frontend agent handoff',
      path: CUSTOM_FRONTEND_AGENT_HANDOFF_DOC,
    },
    {
      label: 'API contracts',
      path: 'specs/backy-api-contracts.md',
    },
    {
      label: 'Editor contract',
      path: 'specs/editor_complete_spec.md',
    },
  ],
  endpoints: {
    manifest: `/api/sites/${siteId}/manifest`,
    openapi: `/api/sites/${siteId}/openapi`,
    resolve: `/api/sites/${siteId}/resolve?path=/`,
    render: `/api/sites/${siteId}/render?path=/...`,
    frontendDesign: `/api/sites/${siteId}/frontend-design`,
    frontendDesignManagement: `/api/admin/sites/${siteId}/frontend-design`,
    templates: `/api/admin/sites/${siteId}/templates`,
    pages: `/api/admin/sites/${siteId}/pages`,
    blog: `/api/admin/sites/${siteId}/blog`,
    forms: `/api/admin/sites/${siteId}/forms`,
    collections: `/api/admin/sites/${siteId}/collections`,
    products: `/api/admin/sites/${siteId}/collections/products/records`,
    reusableSections: `/api/admin/sites/${siteId}/reusable-sections`,
  },
  sdk: {
    package: 'packages/sdk-js',
    generatedTypes: 'packages/sdk-js/src/generated-contract-types.ts',
    helpers: [
      'manifest',
      'openapi',
      'render',
      'adminFrontendDesign',
      'updateAdminFrontendDesign',
      'importAdminFrontendDesign',
      'captureAdminContentTemplate',
      'adminTemplates',
      'buildBackyContentDesignPayload',
      'createAdminPage',
      'createAdminBlogPost',
      'createAdminCommerceProduct',
      'createAdminForm',
      'createAdminCollectionRecord',
      'createAdminReusableSection',
    ],
  },
  contentCreation: {
    templateCloneFields: ['frontendDesignTemplateId', 'designTemplateId'],
    backyCanvasTemplateField: 'templateId',
    customFrontendTemplateField: 'frontendDesignTemplateId',
    adminEntryPoints: buildCustomFrontendAgentAdminEntryPoints(siteId),
    rule: 'Create page, blog, product, form, collection, and section content through Backy APIs so every result can reopen in the canvas editor.',
  },
  designState: {
    roundTripFields: CUSTOM_FRONTEND_AGENT_ROUND_TRIP_FIELDS,
    preserves: [
      'layer geometry',
      'responsive overrides',
      'theme token references',
      'media and font asset identities',
      'animations',
      'interactions',
      'data bindings',
      'editable maps',
      'SEO metadata',
    ],
  },
  rules: [
    'Read manifest and OpenAPI before guessing routes, media, forms, commerce, live-management, or admin-management shapes.',
    'Preserve the full Backy design envelope when creating or updating editable content.',
    'Use frontendDesignTemplateId or designTemplateId for captured custom-frontend templates.',
    'Do not flatten editable canvas content to plain HTML/text unless the target is a throwaway static export.',
    'Use authenticated admin endpoints for writes and public endpoints for read/render discovery.',
  ],
  privacy: {
    includesSecretValues: false,
    publicDiscoveryOnly: true,
    adminWritesRequireAuth: true,
    secretHandling: 'This handoff exposes endpoint templates and field names only; provider keys, database URLs, admin sessions, order payloads, and submission values stay out of public manifest/OpenAPI responses.',
  },
});
