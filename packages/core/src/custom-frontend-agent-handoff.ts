export const CUSTOM_FRONTEND_AGENT_HANDOFF_SCHEMA = 'backy.custom-frontend-agent-handoff.v1';

export const CUSTOM_FRONTEND_COMPONENT_API_CONTRACT_SCHEMA = 'backy.canvas-component-api-contract.v1';

export const CUSTOM_FRONTEND_ROUTING_HANDOFF_SCHEMA = 'backy.custom-frontend-routing-handoff.v1';

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

export const CUSTOM_FRONTEND_COMPONENT_API_FIELD_PATHS = [
  'element.id',
  'element.type',
  'element.name',
  'element.x',
  'element.y',
  'element.width',
  'element.height',
  'element.rotation',
  'element.zIndex',
  'element.visible',
  'element.locked',
  'element.props',
  'element.styles',
  'element.responsive',
  'element.tokenRefs',
  'element.assetIds',
  'element.animation',
  'element.dataBindings',
  'element.bindingSlots',
  'element.accessibility',
  'element.metadata',
  'element.children[]',
  'content.contentDocument.nodes',
  'content.editableMap',
  'meta.frontendDesignEditableMap',
] as const;

export const CUSTOM_FRONTEND_COMPONENT_API_FAMILIES = [
  'layout',
  'typography',
  'media',
  'forms',
  'commerce',
  'collections',
  'navigation',
  'comments',
  'embeds',
  'interactive-components',
  'custom-code',
] as const;

export interface CustomFrontendAgentSiteContext {
  slug?: string | null;
  customDomain?: string | null;
  domainVerificationDomain?: string | null;
}

const normalizeHandoffDomain = (value: string | null | undefined): string | null => {
  if (typeof value !== 'string') return null;
  const host = value
    .trim()
    .replace(/^https?:\/\//i, '')
    .split('/')[0]
    ?.replace(/\/+$/, '')
    .toLowerCase();
  return host || null;
};

const normalizeHandoffSlug = (value: string | null | undefined, fallback: string): string => {
  if (typeof value !== 'string') return fallback;
  const slug = value.trim().replace(/^\/+|\/+$/g, '');
  return slug || fallback;
};

export const buildCustomFrontendAgentAdminEntryPoints = (siteId: string) => ({
  pageBackyCanvas: `/pages/new?siteId=${siteId}&templateSource=backy-canvas&focus=canvas`,
  pageCustomFrontend: `/pages/new?siteId=${siteId}&templateSource=custom-frontend&frontendDesignTemplateId=:templateId&focus=canvas`,
  blogBackyCanvas: `/blog/new?siteId=${siteId}&templateSource=backy-canvas&focus=canvas`,
  blogCustomFrontend: `/blog/new?siteId=${siteId}&templateSource=custom-frontend&frontendDesignTemplateId=:templateId&focus=canvas`,
  productBackyCanvas: `/products?siteId=${siteId}&quickCreate=product`,
  productCustomFrontend: `/products?siteId=${siteId}&frontendTemplate=:templateId`,
  formBackyCanvas: `/forms?siteId=${siteId}&quickCreate=blank`,
  formCustomFrontend: `/forms?siteId=${siteId}&frontendTemplate=:templateId`,
  newsletterWorkspace: `/newsletter?siteId=${siteId}`,
  newsletterPageBackyCanvas: `/pages/new?siteId=${siteId}&template=newsletter&templateSource=backy-canvas&focus=canvas`,
  newsletterBlogBackyCanvas: `/blog/new?siteId=${siteId}&templateSource=backy-canvas&focus=canvas`,
  collectionBackyCanvas: `/collections?siteId=${siteId}&draft=new`,
  collectionCustomFrontend: `/collections?siteId=${siteId}&frontendTemplate=:templateId`,
  reusableSectionBackyCanvas: `/reusable-sections?siteId=${siteId}`,
  reusableSectionCustomFrontend: `/reusable-sections?siteId=${siteId}&frontendTemplate=:templateId`,
});

export const buildCustomFrontendRoutingHandoff = (
  siteId: string,
  site: CustomFrontendAgentSiteContext = {},
) => {
  const slug = normalizeHandoffSlug(site.slug, siteId);
  const customDomain = normalizeHandoffDomain(site.customDomain);
  const verificationDomain = normalizeHandoffDomain(site.domainVerificationDomain);

  return {
    schemaVersion: CUSTOM_FRONTEND_ROUTING_HANDOFF_SCHEMA,
    siteId,
    identifiers: {
      siteId,
      slug,
      customDomain,
      verificationDomain,
      acceptedPublicIdentifiers: ['siteId', 'slug', 'customDomain', 'domain query parameter', 'Host header'],
    },
    publicResolution: {
      siteDiscovery: `/api/sites?identifier=${customDomain || slug}`,
      managedPath: `/sites/${slug}`,
      resolveBySiteId: `/api/sites/${siteId}/resolve?path=/`,
      renderBySiteId: `/api/sites/${siteId}/render?path=/...`,
      resolveWithHost: `/api/sites/${siteId}/resolve?path=/&domain={host}`,
      renderWithHost: `/api/sites/${siteId}/render?path=/...&domain={host}`,
      hostHeaderSupported: true,
      domainQueryParamSupported: true,
    },
    customDomainManagement: {
      adminSiteRoute: `/sites/${siteId}`,
      adminSiteApi: `/api/admin/sites/${siteId}`,
      adminSettingsApi: `/api/admin/sites/${siteId}/settings`,
      customDomainField: 'site.customDomain',
      verificationField: 'site.settings.domainVerification.domain',
      verificationStatusField: 'site.settings.domainVerification.status',
      dnsRecordEvidenceField: 'site.settings.domainVerification.records',
    },
    subdomainRouting: {
      supported: true,
      model: 'Treat every public host such as blog.example.com, docs.example.com, shop.example.com, or a root apex as a site custom domain/verification host, then resolve Backy content by site id plus Host/domain context.',
      examples: ['blog.example.com', 'docs.example.com', 'shop.example.com'],
      recommendation: 'Use one Backy site per independent public subdomain when content, navigation, SEO, or design tokens differ; reuse the same frontend design template when the subdomains should look related.',
    },
    customFrontendDeployment: {
      publicApiOriginEnv: 'BACKY_PUBLIC_API_BASE_URL',
      siteIdentifierEnv: 'BACKY_SITE_ID',
      hostContextEnv: 'BACKY_SITE_PUBLIC_HOST',
      frontendHostPolicy: 'A Vercel/Next/custom frontend may run on any verified host, but it must read Backy manifest/OpenAPI/render data instead of copying site JSON locally.',
      corsSetting: 'BACKY_CORS_ALLOWED_ORIGINS',
    },
    agentRules: [
      'Start with agent-handoff, manifest, and OpenAPI before choosing routes.',
      'For custom domains or subdomains, pass the browser host as domain={host} or rely on the Host/forwarded-host header when resolving/rendering localized routes.',
      'Keep site id/slug/custom domain as routing inputs; do not fork content or design state into the frontend repository.',
      'Manage domain verification in Backy Sites/Settings and keep DNS/provider credentials outside public payloads.',
    ],
  };
};

export const buildCustomFrontendComponentApiContract = (siteId: string) => ({
  schemaVersion: CUSTOM_FRONTEND_COMPONENT_API_CONTRACT_SCHEMA,
  everyComponentApiAddressable: true,
  everyElementApiAddressable: true,
  source: 'Backy canvas render payload and content document',
  scope: 'Every root, child, reusable-section, blog, page, product, form, collection, and custom-code canvas element keeps a stable API shape.',
  readPointers: {
    renderElements: `/api/sites/${siteId}/render?path=/...#data.content.elements`,
    renderContentDocument: `/api/sites/${siteId}/render?path=/...#data.content.contentDocument`,
    manifestElementActions: `/api/sites/${siteId}/manifest#data.contract.schemas.elementActions`,
    manifestEditableMap: `/api/sites/${siteId}/manifest#data.site.frontendDesign.editableMap`,
    openApiCanvasElement: `/api/sites/${siteId}/openapi#/components/schemas/BackyContentElement`,
    openApiContentPayload: `/api/sites/${siteId}/openapi#/components/schemas/PageResource`,
    editorCompositionHandoff: 'editorCompositionReadiness.agentHandoff',
  },
  writePointers: {
    adminPages: `/api/admin/sites/${siteId}/pages`,
    adminBlog: `/api/admin/sites/${siteId}/blog`,
    adminForms: `/api/admin/sites/${siteId}/forms`,
    adminCollections: `/api/admin/sites/${siteId}/collections`,
    adminProducts: `/api/admin/sites/${siteId}/collections/products/records`,
    adminReusableSections: `/api/admin/sites/${siteId}/reusable-sections`,
    adminFrontendDesign: `/api/admin/sites/${siteId}/frontend-design`,
  },
  elementAddressing: {
    stableIdField: 'id',
    typeField: 'type',
    propsField: 'props',
    styleFieldAliases: ['styles', 'style'],
    responsiveField: 'responsive',
    nestedChildrenField: 'children',
    contentDocumentNodeMap: 'content.contentDocument.nodes',
    editableMapSources: ['content.editableMap', 'meta.frontendDesignEditableMap', 'manifest.data.site.frontendDesign.editableMap'],
  },
  readableFieldPaths: CUSTOM_FRONTEND_COMPONENT_API_FIELD_PATHS,
  writableFieldPaths: CUSTOM_FRONTEND_COMPONENT_API_FIELD_PATHS,
  componentFamilies: CUSTOM_FRONTEND_COMPONENT_API_FAMILIES,
  requiredAgentBehavior: [
    'Treat every canvas element as structured data keyed by id and type, not as a static screenshot.',
    'Preserve unknown props, styles, responsive overrides, data bindings, asset ids, and metadata during edits.',
    'Use editableMap and bindingSlots to connect custom frontend selectors or generated components back to Backy fields.',
    'Create or update content through authenticated admin APIs when a user expects Backy to reopen the result in the canvas editor.',
  ],
  guarantees: [
    'Element props and styles are API-readable from render/content payloads.',
    'Nested children and reusable section composition are preserved as structured JSON.',
    'Responsive overrides and frontend design tokens survive page, post, product, form, collection, and reusable-section creation.',
    'Custom frontends can inspect the handoff before generating UI and can keep Backy as the source of truth.',
  ],
  secretHandling: 'No provider keys, admin sessions, database URLs, private submission values, or private file tokens are exposed in public component API handoff fields.',
});

export const buildCustomFrontendAgentHandoff = (
  siteId: string,
  site: CustomFrontendAgentSiteContext = {},
) => ({
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
    agentHandoff: `/api/sites/${siteId}/agent-handoff`,
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
    newsletterSubscribers: `/api/admin/sites/${siteId}/newsletter/subscribers`,
    newsletterContactSync: `/api/admin/sites/${siteId}/forms/{formId}/contacts/sync`,
    newsletterManagement: `/newsletter?siteId=${siteId}`,
    collections: `/api/admin/sites/${siteId}/collections`,
    products: `/api/admin/sites/${siteId}/collections/products/records`,
    reusableSections: `/api/admin/sites/${siteId}/reusable-sections`,
  },
  readOrder: [
    {
      step: 'agent-handoff',
      endpointKey: 'agentHandoff',
      purpose: 'Start here when another AI/frontend agent needs the complete Backy API, canvas-first creation, and design-state preservation rules in one small response.',
    },
    {
      step: 'manifest',
      endpointKey: 'manifest',
      purpose: 'Bootstrap site identity, routes, modules, media/font delivery, frontendDesign, template registry, launch readiness, and this agent handoff.',
    },
    {
      step: 'openapi',
      endpointKey: 'openapi',
      purpose: 'Generate typed API clients and use operation/component names instead of guessing URL or payload shapes.',
    },
    {
      step: 'frontend-design',
      endpointKey: 'frontendDesignManagement',
      purpose: 'Read or update the authenticated site design contract: tokens, fonts, colors, chrome, templates, editable maps, and binding hints.',
    },
    {
      step: 'templates',
      endpointKey: 'templates',
      purpose: 'List clone-ready page, blog, form, product, collection, and reusable-section templates before creating new content.',
    },
    {
      step: 'newsletter',
      endpointKey: 'newsletterManagement',
      purpose: 'Use the Newsletter workspace and subscriber APIs for reader signup, consent evidence, issue handoff, and provider sync without exposing mail-provider secrets.',
    },
    {
      step: 'render',
      endpointKey: 'render',
      purpose: 'Verify the public renderer payload for live website routes after content/design changes.',
    },
  ],
  sdk: {
    package: 'packages/sdk-js',
    generatedTypes: 'packages/sdk-js/src/generated-contract-types.ts',
    helpers: [
      'customFrontendAgentHandoff',
      'customFrontendAgentHandoffCached',
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
      'subscribeNewsletter',
      'unsubscribeNewsletter',
      'newsletterSubscribers',
      'upsertNewsletterSubscriber',
      'syncFormContacts',
      'createAdminCollectionRecord',
      'createAdminReusableSection',
    ],
  },
  contentCreation: {
    templateCloneFields: ['frontendDesignTemplateId', 'designTemplateId'],
    backyCanvasTemplateField: 'templateId',
    customFrontendTemplateField: 'frontendDesignTemplateId',
    adminEntryPoints: buildCustomFrontendAgentAdminEntryPoints(siteId),
    newsletter: {
      workspace: `/newsletter?siteId=${siteId}`,
      signupPageCanvas: `/pages/new?siteId=${siteId}&template=newsletter&templateSource=backy-canvas&focus=canvas`,
      writingCanvas: `/blog/new?siteId=${siteId}&templateSource=backy-canvas&focus=canvas`,
      publicSubscribers: `/api/sites/${siteId}/newsletter/subscribers`,
      adminSubscribers: `/api/admin/sites/${siteId}/newsletter/subscribers`,
      contactSync: `/api/admin/sites/${siteId}/forms/{formId}/contacts/sync`,
      syncBoundarySchema: 'backy.newsletter-sync-boundary.v1',
      providerBoundary: 'Backy owns subscriber records, topics, consent, CSV/export, and sync handoff; mailbox delivery, bounces, complaints, unsubscribe links in sent email, SPF/DKIM/DMARC, and reputation remain provider-side.',
    },
    canvasFirst: {
      editor: 'Backy canvas editor',
      pageAndBlogModeField: 'templateSource',
      backyCanvasValue: 'backy-canvas',
      customFrontendValue: 'custom-frontend',
      customFrontendRouteFieldAliases: ['frontendDesignTemplateId', 'frontendTemplate'],
      routeRevealGuarantee: 'Admin entry points with frontendDesignTemplateId or frontendTemplate reveal the selected captured template and focus the create action.',
      editorOutcome: 'Every created page, post, product, form, collection, or reusable section must reopen in the Backy canvas editor with site fonts, colors, chrome, element geometry, bindings, and editable metadata intact.',
    },
    rule: 'Create page, blog, newsletter signup, product, form, collection, and section content through Backy APIs so every result can reopen in the canvas editor.',
  },
  apiAlignment: {
    schemaVersion: 'backy.custom-frontend-api-alignment.v1',
    readStart: {
      endpointKey: 'agentHandoff',
      method: 'GET',
      endpoint: `/api/sites/${siteId}/agent-handoff`,
      manifestMirror: 'data.contract.customFrontendAgentHandoff',
      openApiMirror: 'x-backy-custom-frontend-agent-handoff',
    },
    publicDiscovery: {
      manifestEndpointKey: 'manifest',
      openApiEndpointKey: 'openapi',
      routeResolveEndpointKey: 'resolve',
      renderEndpointKey: 'render',
      styleSource: 'manifest.data.site.frontendDesign',
    },
    typedClients: {
      sdkPackage: 'packages/sdk-js',
      generatedTypes: 'packages/sdk-js/src/generated-contract-types.ts',
      preferredHelpers: [
        'customFrontendAgentHandoff',
        'manifest',
        'openapi',
        'render',
        'buildBackyContentDesignPayload',
        'subscribeNewsletter',
        'newsletterSubscribers',
        'syncFormContacts',
      ],
    },
    writeBoundary: {
      adminWritesRequireAuth: true,
      publicDiscoveryOnly: true,
      writeEndpointFamily: '/api/admin/sites/:siteId/*',
      noFrontendLocalJsonForks: true,
    },
    creationRoutes: buildCustomFrontendAgentAdminEntryPoints(siteId),
    preserveFields: CUSTOM_FRONTEND_AGENT_ROUND_TRIP_FIELDS,
    verification: {
      renderEndpoint: `/api/sites/${siteId}/render?path=/...`,
      resolveEndpoint: `/api/sites/${siteId}/resolve?path=/`,
      expectation: 'After creating or editing custom frontend content, verify the public route through Backy resolve/render payloads and keep the same design envelope writable through admin/live-management APIs.',
    },
  },
  componentApiContract: buildCustomFrontendComponentApiContract(siteId),
  routing: buildCustomFrontendRoutingHandoff(siteId, site),
  designState: {
    roundTripFields: CUSTOM_FRONTEND_AGENT_ROUND_TRIP_FIELDS,
    siteStyleSources: [
      'manifest.data.site.frontendDesign',
      'frontendDesign.tokens.colors',
      'frontendDesign.tokens.fonts',
      'frontendDesign.tokens.spacing',
      'frontendDesign.tokens.motion',
      'frontendDesign.tokens.customCss',
      'frontendDesign.chrome',
      'frontendDesign.templates',
      'frontendDesign.editableMap',
    ],
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
    secretHandling: 'This handoff exposes endpoint templates and field names only; provider keys, mail-provider credentials, database URLs, admin sessions, order payloads, and submission values stay out of public manifest/OpenAPI responses.',
  },
});
