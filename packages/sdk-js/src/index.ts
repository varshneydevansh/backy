import type {
  BackyContentDocument as CoreBackyContentDocument,
  BackyContentElement,
} from '@backy-cms/core/content-contract';

export interface BackyClientOptions {
  baseUrl: string;
  siteId?: string;
  fetch?: typeof fetch;
  requestIdFactory?: () => string;
  defaultHeaders?: HeadersInit;
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
}

export type BackyConditionalOptions = BackyConditionalRequestOptions;

export interface BackyListOptions {
  limit?: number;
  offset?: number;
  requestId?: string;
}

export interface BackyPagination {
  total?: number;
  limit?: number;
  offset?: number;
  hasMore?: boolean;
  [key: string]: unknown;
}

export interface BackyThemeTokens {
  colors?: Record<string, string>;
  fonts?: Record<string, string>;
  spacing?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface BackyFrontendDesignSource {
  type: 'managed-site' | 'custom-frontend' | 'manual' | string;
  label?: string;
  url?: string;
  repository?: string;
  branch?: string;
  capturedAt?: string;
  [key: string]: unknown;
}

export interface BackyFrontendDesignTemplate {
  id: string;
  type: 'page' | 'blogPost' | 'form' | 'product' | 'collection' | 'section' | string;
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
  schemaVersion: 'backy.frontend-design.v1' | string;
  status: 'unconfigured' | 'captured' | 'synced' | 'stale' | string;
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
  schemaVersion: 'backy.frontend-design-response.v1' | string;
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
  type?: 'page' | 'route' | 'url' | string;
  pageId?: string;
  label?: string;
  title?: string;
  path?: string;
  href?: string;
  target?: '_self' | '_blank' | string;
  children?: BackyNavigationItem[];
  [key: string]: unknown;
}

export type BackyElement = BackyContentElement & Record<string, unknown>;
export type BackyContentDocument = CoreBackyContentDocument & Record<string, unknown>;

export interface BackyMediaAsset {
  id: string;
  type: 'image' | 'video' | 'audio' | 'document' | 'font' | string;
  url?: string;
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
  metadata?: Record<string, unknown>;
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
  schemaVersion: 'backy.font-manifest.v1';
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

export interface BackyCollectionRecord<TValues extends Record<string, unknown> = Record<string, unknown>> {
  id: string;
  slug: string;
  status?: string;
  values: TValues;
  frontendDesign?: BackyFrontendDesignProvenance;
  createdAt?: string;
  updatedAt?: string;
  [key: string]: unknown;
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
  productType?: 'physical' | 'digital' | 'service' | string;
  inventory?: Record<string, unknown>;
  delivery?: Record<string, unknown>;
  checkout?: Record<string, unknown>;
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
  productType?: 'physical' | 'digital' | 'service' | string;
  featured?: boolean;
  sortBy?: string;
  sortDirection?: 'asc' | 'desc';
  siteId?: string;
}

export interface BackyCommerceLineItemInput {
  productId?: string;
  slug?: string;
  quantity?: number;
}

export interface BackyCommerceOrderInput {
  customer: {
    name: string;
    email: string;
    phone?: string;
  };
  items: BackyCommerceLineItemInput[];
  shippingAddress?: string;
  billingAddress?: string;
  notes?: string;
  paymentProvider?: string;
  paymentReference?: string;
  checkoutSessionId?: string;
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

export interface BackyCommerceStorefrontContract {
  schemaVersion: 'backy.commerce-settings.v1';
  mode: 'catalog-only' | 'manual-orders' | 'checkout-provider';
  currency: string;
  paymentProvider: 'none' | 'stripe' | 'manual';
  providerAccountId?: string | null;
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
    [key: string]: unknown;
  };
  inventory: {
    reservations: boolean;
    reservationMinutes: number;
    [key: string]: unknown;
  };
  webhooks?: {
    eventsEnabled: boolean;
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

export interface BackyCommerceCatalog {
  schemaVersion: 'backy.commerce-catalog.v1';
  collection?: BackyCollectionSchema;
  products: BackyCommerceProduct[];
  commerce?: BackyCommerceStorefrontContract;
  facets?: Record<string, unknown>;
  filters?: Record<string, unknown>;
  readiness?: Record<string, unknown>;
  pagination: BackyPagination;
}

export interface BackyCommerceOrderContract {
  schemaVersion: 'backy.commerce-orders.v1';
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

export interface BackyPageResource {
  id: string;
  siteId?: string;
  title: string;
  slug: string;
  description?: string | null;
  status?: string;
  path?: string;
  meta?: Record<string, unknown>;
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

export interface BackyReusableSection {
  id: string;
  siteId?: string;
  name: string;
  slug: string;
  description?: string | null;
  category?: string;
  status?: 'active' | 'archived' | string;
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
  targetType?: 'page' | 'post';
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
  type?: 'image' | 'video' | 'audio' | 'document' | 'font';
  q?: string;
  tag?: string;
  folderId?: string;
  scope?: string;
  pageId?: string;
  postId?: string;
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
  sortDirection?: 'asc' | 'desc';
}

export interface BackyFormSubmissionInput {
  values: Record<string, unknown>;
  requestId?: string;
  pageId?: string;
  postId?: string;
  honeypot?: string;
  startedAt?: string | number;
  rateLimitBypass?: boolean;
  contactShareOverride?: unknown;
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
  moderationMode?: 'manual' | 'auto-approve';
  rateLimitBypass?: boolean;
}

export interface BackyCommentListOptions extends BackyListOptions {
  targetType?: 'page' | 'post';
  targetId?: string;
  status?: 'pending' | 'approved' | 'rejected' | 'spam' | 'blocked' | 'all';
  parentId?: string;
  parentOnly?: boolean;
  commentThreadId?: string;
  requestId?: string;
  q?: string;
  sort?: 'newest' | 'oldest';
}

export interface BackyCommentBulkUpdateInput {
  commentIds?: string[];
  ids?: string[];
  status?: 'pending' | 'approved' | 'rejected' | 'spam' | 'blocked';
  action?: 'clearReports';
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
  type: 'email' | 'ip';
  value: string;
  reason: string;
  actor?: string;
  requestId?: string;
  createdAt?: string;
  [key: string]: unknown;
}

export interface BackyCommentBlocklistOptions extends BackyListOptions {
  type?: 'email' | 'ip' | 'all';
  q?: string;
  requestId?: string;
}

export interface BackyEventListOptions extends BackyListOptions {
  kind?: string;
}

export type BackyResolvedRouteType = 'page' | 'post' | 'dynamicList' | 'dynamicItem' | 'redirect' | 'gone' | 'notFound';

export interface BackyResolvedRouteBase<TRouteType extends BackyResolvedRouteType = BackyResolvedRouteType> {
  type: TRouteType;
  path: string;
  status?: string;
  canonical?: string;
  params?: Record<string, string>;
  resource?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface BackyDynamicListRoute extends BackyResolvedRouteBase<'dynamicList'> {
  resource?: Record<string, unknown> & {
    collectionId?: string;
    collectionSlug?: string;
    collectionName?: string;
    recordsUrl?: string;
    renderUrl?: string;
    frontendDesign?: BackyFrontendDesignProvenance;
  };
}

export interface BackyDynamicItemRoute extends BackyResolvedRouteBase<'dynamicItem'> {
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
  | BackyResolvedRouteBase<'page' | 'post' | 'notFound'>
  | BackyDynamicListRoute
  | BackyDynamicItemRoute;

export interface BackyRedirectRoute extends BackyResolvedRouteBase<'redirect'> {
  type: 'redirect';
  status: 'published';
  canonical: string;
  resource: {
    id: string;
    kind: 'redirect';
    from: string;
    to: string;
    statusCode: 301 | 302 | 307 | 308;
    [key: string]: unknown;
  };
}

export interface BackyGoneRoute extends BackyResolvedRouteBase<'gone'> {
  type: 'gone';
  status: 'archived';
  resource: {
    id: string;
    kind: 'gone';
    from: string;
    statusCode: 410;
    [key: string]: unknown;
  };
}

export type BackyResolvedRoute = BackyRenderableRoute | BackyRedirectRoute | BackyGoneRoute;

export interface BackyRouteResolve {
  site: BackySiteSummary;
  route: BackyResolvedRoute;
  navigation?: { primary?: BackyNavigationItem[]; footer?: BackyNavigationItem[]; [key: string]: unknown };
}

export type BackyRouteResolveResult =
  | BackyEnvelope<BackyRouteResolve>
  | (BackyErrorEnvelope & {
      success: false;
      data: BackyRouteResolve & { route: BackyGoneRoute };
    });

export interface BackySeoRoute {
  type: 'page' | 'post' | 'dynamicList' | 'dynamicItem' | string;
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

export interface BackyFrontendManifest {
  schemaVersion: string;
  site: BackySiteSummary;
  contract: Record<string, unknown>;
  capabilities: Record<string, boolean>;
  endpoints: Record<string, string>;
  routePatterns: Array<Record<string, unknown>>;
  modules: {
    routing?: {
      supportedRouteTypes?: BackyResolvedRouteType[];
      redirectRules?: {
        count?: number;
        items?: Array<{
          id?: string;
          type: 'redirect' | 'gone';
          from: string;
          to?: string | null;
          statusCode: 301 | 302 | 307 | 308 | 410;
          resolveUrl?: string;
          [key: string]: unknown;
        }>;
        [key: string]: unknown;
      };
      [key: string]: unknown;
    };
    pages?: { count: number; items: BackyPageResource[] };
    blog?: Record<string, unknown> & { count?: number; items?: BackyPostResource[] };
    collections?: BackyCollectionSchema[];
    reusableSections?: {
      count?: number;
      listUrl?: string;
      categories?: string[];
      tags?: string[];
      items?: Array<Record<string, unknown>>;
      [key: string]: unknown;
    };
    forms?: BackyFormDefinition[];
    media?: Record<string, unknown>;
    commerce?: BackyCommerceStorefrontContract;
    [key: string]: unknown;
  };
  navigation: { primary?: BackyNavigationItem[]; [key: string]: unknown };
}

export interface BackyRenderPayload {
  site: BackySiteSummary;
  navigation: { primary: BackyNavigationItem[]; footer?: BackyNavigationItem[]; [key: string]: unknown };
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

  constructor(status: number, envelope: BackyErrorEnvelope) {
    super(envelope.error.message);
    this.name = 'BackyApiError';
    this.status = status;
    this.requestId = envelope.requestId;
    this.code = envelope.error.code;
    this.details = envelope.error.details;
  }
}

export class BackyClient {
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;
  private readonly requestIdFactory: () => string;
  private readonly defaultHeaders?: HeadersInit;
  private siteId?: string;

  constructor(options: BackyClientOptions) {
    if (!options.baseUrl) {
      throw new Error('BackyClient requires a baseUrl.');
    }

    this.baseUrl = options.baseUrl.replace(/\/$/, '');
    this.siteId = options.siteId;
    this.fetchImpl = options.fetch ?? globalThis.fetch;
    this.requestIdFactory = options.requestIdFactory ?? (() => `sdk_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`);
    this.defaultHeaders = options.defaultHeaders;

    if (!this.fetchImpl) {
      throw new Error('BackyClient requires a fetch implementation.');
    }
  }

  setSiteId(siteId: string): void {
    this.siteId = siteId;
  }

  getSiteId(): string | undefined {
    return this.siteId;
  }

  sites(): Promise<BackyEnvelope<{ sites: BackySiteSummary[]; pagination?: BackyPagination }>> {
    return this.request('/api/sites');
  }

  async discoverSite(identifier: string): Promise<BackyEnvelope<{ site: BackySiteSummary }>> {
    const envelope = await this.request<{ site: BackySiteSummary }>('/api/sites', {
      query: { identifier },
    });
    const discoveredSiteId = typeof envelope.data.site.id === 'string' ? envelope.data.site.id : undefined;
    if (discoveredSiteId) {
      this.siteId = discoveredSiteId;
    }
    return envelope;
  }

  manifest(siteId = this.requireSiteId()): Promise<BackyEnvelope<BackyFrontendManifest>> {
    return this.request(`/api/sites/${encodeURIComponent(siteId)}/manifest`);
  }

  frontendDesign(siteId = this.requireSiteId()): Promise<BackyEnvelope<BackyFrontendDesignResponse>> {
    return this.request(`/api/sites/${encodeURIComponent(siteId)}/frontend-design`);
  }

  frontendDesignCached(options: BackyConditionalOptions = {}): Promise<BackyConditionalResult<BackyEnvelope<BackyFrontendDesignResponse>>> {
    return this.requestConditionalJson(`/api/sites/${encodeURIComponent(options.siteId ?? this.requireSiteId())}/frontend-design`, {
      ifNoneMatch: options.etag,
      requestId: options.requestId,
    });
  }

  manifestCached(options: BackyConditionalOptions = {}): Promise<BackyConditionalResult<BackyEnvelope<BackyFrontendManifest>>> {
    return this.requestConditionalJson(`/api/sites/${encodeURIComponent(options.siteId ?? this.requireSiteId())}/manifest`, {
      ifNoneMatch: options.etag,
      requestId: options.requestId,
    });
  }

  openapi(siteId = this.requireSiteId()): Promise<Record<string, unknown>> {
    return this.requestRawJson(`/api/sites/${encodeURIComponent(siteId)}/openapi`);
  }

  openapiCached(options: BackyConditionalOptions = {}): Promise<BackyConditionalResult<Record<string, unknown>>> {
    return this.requestConditionalJson(`/api/sites/${encodeURIComponent(options.siteId ?? this.requireSiteId())}/openapi`, {
      ifNoneMatch: options.etag,
      requestId: options.requestId,
    });
  }

  resolve(path: string, options: { previewToken?: string; siteId?: string } = {}): Promise<BackyRouteResolveResult> {
    return this.requestRouteResolve(`/api/sites/${encodeURIComponent(options.siteId ?? this.requireSiteId())}/resolve`, {
      query: { path, previewToken: options.previewToken },
    });
  }

  render<TPayload = BackyRenderPayload>(path: string, options: { previewToken?: string; siteId?: string } = {}): Promise<BackyEnvelope<TPayload>> {
    return this.request(`/api/sites/${encodeURIComponent(options.siteId ?? this.requireSiteId())}/render`, {
      query: { path, previewToken: options.previewToken },
    });
  }

  renderCached<TPayload = BackyRenderPayload>(
    path: string,
    options: BackyConditionalOptions & { previewToken?: string } = {},
  ): Promise<BackyConditionalResult<BackyEnvelope<TPayload>>> {
    return this.requestConditionalJson(`/api/sites/${encodeURIComponent(options.siteId ?? this.requireSiteId())}/render`, {
      query: { path, previewToken: options.previewToken },
      ifNoneMatch: options.etag,
      requestId: options.requestId,
    });
  }

  navigation(siteId = this.requireSiteId()): Promise<BackyEnvelope<{ site?: BackySiteSummary; navigation: { primary: BackyNavigationItem[]; footer?: BackyNavigationItem[]; [key: string]: unknown } }>> {
    return this.request(`/api/sites/${encodeURIComponent(siteId)}/navigation`);
  }

  navigationCached(options: BackyConditionalOptions = {}): Promise<BackyConditionalResult<BackyEnvelope<{ site?: BackySiteSummary; navigation: { primary: BackyNavigationItem[]; footer?: BackyNavigationItem[]; [key: string]: unknown } }>>> {
    return this.requestConditionalJson(`/api/sites/${encodeURIComponent(options.siteId ?? this.requireSiteId())}/navigation`, {
      ifNoneMatch: options.etag,
      requestId: options.requestId,
    });
  }

  seo(siteId = this.requireSiteId()): Promise<BackyEnvelope<BackySeoDiscovery>> {
    return this.request(`/api/sites/${encodeURIComponent(siteId)}/seo`);
  }

  seoCached(options: BackyConditionalOptions = {}): Promise<BackyConditionalResult<BackyEnvelope<BackySeoDiscovery>>> {
    return this.requestConditionalJson(`/api/sites/${encodeURIComponent(options.siteId ?? this.requireSiteId())}/seo`, {
      ifNoneMatch: options.etag,
      requestId: options.requestId,
    });
  }

  pages(options: BackyPageListOptions = {}): Promise<BackyEnvelope<{ page?: BackyPageResource; pages?: BackyPageResource[]; pagination?: BackyPagination } & Record<string, unknown>>> {
    const { requestId, siteId, ...query } = options;
    return this.request(`/api/sites/${encodeURIComponent(siteId ?? this.requireSiteId())}/pages`, {
      query,
      requestId,
    });
  }

  pagesCached(options: BackyPageListOptions & BackyConditionalOptions = {}): Promise<BackyConditionalResult<BackyEnvelope<{ page?: BackyPageResource; pages?: BackyPageResource[]; pagination?: BackyPagination } & Record<string, unknown>>>> {
    const { requestId, etag, siteId, ...query } = options;
    return this.requestConditionalJson(`/api/sites/${encodeURIComponent(siteId ?? this.requireSiteId())}/pages`, {
      query,
      ifNoneMatch: etag,
      requestId,
    });
  }

  blog(options: Record<string, string | number | boolean | undefined> = {}): Promise<BackyEnvelope<{ post?: BackyPostResource; posts?: BackyPostResource[]; pagination?: BackyPagination } & Record<string, unknown>>> {
    const siteId = typeof options.siteId === 'string' ? options.siteId : this.requireSiteId();
    const { siteId: _siteId, ...query } = options;
    void _siteId;
    return this.request(`/api/sites/${encodeURIComponent(siteId)}/blog`, { query });
  }

  blogCached(options: Record<string, string | number | boolean | undefined> & BackyConditionalOptions = {}): Promise<BackyConditionalResult<BackyEnvelope<{ post?: BackyPostResource; posts?: BackyPostResource[]; pagination?: BackyPagination } & Record<string, unknown>>>> {
    const siteId = typeof options.siteId === 'string' ? options.siteId : this.requireSiteId();
    const { requestId, etag, siteId: _siteId, ...query } = options;
    void _siteId;
    return this.requestConditionalJson(`/api/sites/${encodeURIComponent(siteId)}/blog`, {
      query,
      ifNoneMatch: etag,
      requestId,
    });
  }

  blogCategories(siteId = this.requireSiteId()): Promise<BackyEnvelope<{ categories: BackyBlogCategory[] } & Record<string, unknown>>> {
    return this.request(`/api/sites/${encodeURIComponent(siteId)}/blog/categories`);
  }

  blogCategoriesCached(options: BackyConditionalOptions = {}): Promise<BackyConditionalResult<BackyEnvelope<{ categories: BackyBlogCategory[] } & Record<string, unknown>>>> {
    return this.requestConditionalJson(`/api/sites/${encodeURIComponent(options.siteId ?? this.requireSiteId())}/blog/categories`, {
      ifNoneMatch: options.etag,
      requestId: options.requestId,
    });
  }

  blogTags(siteId = this.requireSiteId()): Promise<BackyEnvelope<{ tags: BackyBlogTag[] } & Record<string, unknown>>> {
    return this.request(`/api/sites/${encodeURIComponent(siteId)}/blog/tags`);
  }

  blogTagsCached(options: BackyConditionalOptions = {}): Promise<BackyConditionalResult<BackyEnvelope<{ tags: BackyBlogTag[] } & Record<string, unknown>>>> {
    return this.requestConditionalJson(`/api/sites/${encodeURIComponent(options.siteId ?? this.requireSiteId())}/blog/tags`, {
      ifNoneMatch: options.etag,
      requestId: options.requestId,
    });
  }

  blogAuthors(siteId = this.requireSiteId()): Promise<BackyEnvelope<{ authors: BackyBlogAuthor[] } & Record<string, unknown>>> {
    return this.request(`/api/sites/${encodeURIComponent(siteId)}/blog/authors`);
  }

  blogAuthorsCached(options: BackyConditionalOptions = {}): Promise<BackyConditionalResult<BackyEnvelope<{ authors: BackyBlogAuthor[] } & Record<string, unknown>>>> {
    return this.requestConditionalJson(`/api/sites/${encodeURIComponent(options.siteId ?? this.requireSiteId())}/blog/authors`, {
      ifNoneMatch: options.etag,
      requestId: options.requestId,
    });
  }

  media(options: BackyMediaListOptions = {}): Promise<BackyEnvelope<{ media: BackyMediaAsset[]; pagination: BackyPagination }>> {
    const { requestId, ...query } = options;
    return this.request(`/api/sites/${encodeURIComponent(this.requireSiteId())}/media`, {
      query,
      requestId,
    });
  }

  mediaCached(options: BackyMediaListOptions & BackyConditionalOptions = {}): Promise<BackyConditionalResult<BackyEnvelope<{ media: BackyMediaAsset[]; pagination: BackyPagination }>>> {
    const { requestId, etag, siteId, ...query } = options;
    return this.requestConditionalJson(`/api/sites/${encodeURIComponent(siteId ?? this.requireSiteId())}/media`, {
      query,
      ifNoneMatch: etag,
      requestId,
    });
  }

  mediaAsset(mediaId: string): Promise<BackyEnvelope<{ media: BackyMediaAsset }>> {
    return this.request(`/api/sites/${encodeURIComponent(this.requireSiteId())}/media/${encodeURIComponent(mediaId)}`);
  }

  mediaAssetCached(mediaId: string, options: BackyConditionalOptions = {}): Promise<BackyConditionalResult<BackyEnvelope<{ media: BackyMediaAsset }>>> {
    return this.requestConditionalJson(`/api/sites/${encodeURIComponent(options.siteId ?? this.requireSiteId())}/media/${encodeURIComponent(mediaId)}`, {
      ifNoneMatch: options.etag,
      requestId: options.requestId,
    });
  }

  mediaFonts(siteId = this.requireSiteId()): Promise<BackyEnvelope<BackyFontManifest>> {
    return this.request(`/api/sites/${encodeURIComponent(siteId)}/media/fonts`);
  }

  mediaFontsCached(options: BackyConditionalOptions = {}): Promise<BackyConditionalResult<BackyEnvelope<BackyFontManifest>>> {
    return this.requestConditionalJson(`/api/sites/${encodeURIComponent(options.siteId ?? this.requireSiteId())}/media/fonts`, {
      ifNoneMatch: options.etag,
      requestId: options.requestId,
    });
  }

  mediaFileUrl(
    mediaId: string,
    access: { token?: string; expiresAt?: number; disposition?: 'inline' | 'attachment' } = {},
  ): string {
    const searchParams = new URLSearchParams();
    if (access.token) searchParams.set('token', access.token);
    if (access.expiresAt) searchParams.set('expiresAt', String(access.expiresAt));
    if (access.disposition) searchParams.set('disposition', access.disposition);
    const query = searchParams.toString();
    return `${this.baseUrl}/api/sites/${encodeURIComponent(this.requireSiteId())}/media/${encodeURIComponent(mediaId)}/file${query ? `?${query}` : ''}`;
  }

  mediaTransformUrl(mediaId: string, options: { width: number; quality?: number }): string {
    const searchParams = new URLSearchParams({
      width: String(options.width),
    });
    if (options.quality !== undefined) {
      searchParams.set('quality', String(options.quality));
    }
    return `${this.baseUrl}/api/sites/${encodeURIComponent(this.requireSiteId())}/media/${encodeURIComponent(mediaId)}/transform?${searchParams.toString()}`;
  }

  collections(siteId = this.requireSiteId()): Promise<BackyEnvelope<{ collections: BackyCollectionSchema[] }>> {
    return this.request(`/api/sites/${encodeURIComponent(siteId)}/collections`);
  }

  collectionsCached(options: BackyConditionalOptions = {}): Promise<BackyConditionalResult<BackyEnvelope<{ collections: BackyCollectionSchema[] }>>> {
    return this.requestConditionalJson(`/api/sites/${encodeURIComponent(options.siteId ?? this.requireSiteId())}/collections`, {
      ifNoneMatch: options.etag,
      requestId: options.requestId,
    });
  }

  collection(collectionId: string): Promise<BackyEnvelope<{ collection: BackyCollectionSchema }>> {
    return this.request(`/api/sites/${encodeURIComponent(this.requireSiteId())}/collections/${encodeURIComponent(collectionId)}`);
  }

  collectionCached(collectionId: string, options: BackyConditionalOptions = {}): Promise<BackyConditionalResult<BackyEnvelope<{ collection: BackyCollectionSchema }>>> {
    return this.requestConditionalJson(`/api/sites/${encodeURIComponent(options.siteId ?? this.requireSiteId())}/collections/${encodeURIComponent(collectionId)}`, {
      ifNoneMatch: options.etag,
      requestId: options.requestId,
    });
  }

  reusableSections(options: { category?: string; tag?: string; search?: string; siteId?: string } = {}): Promise<BackyEnvelope<{ sections: BackyReusableSection[]; pagination: BackyPagination }>> {
    const { siteId, ...query } = options;
    return this.request(`/api/sites/${encodeURIComponent(siteId ?? this.requireSiteId())}/reusable-sections`, {
      query,
    });
  }

  reusableSectionsCached(
    options: { category?: string; tag?: string; search?: string } & BackyConditionalOptions = {},
  ): Promise<BackyConditionalResult<BackyEnvelope<{ sections: BackyReusableSection[]; pagination: BackyPagination }>>> {
    const { requestId, etag, siteId, ...query } = options;
    return this.requestConditionalJson(`/api/sites/${encodeURIComponent(siteId ?? this.requireSiteId())}/reusable-sections`, {
      query,
      ifNoneMatch: etag,
      requestId,
    });
  }

  reusableSection(sectionId: string, siteId = this.requireSiteId()): Promise<BackyEnvelope<{ section: BackyReusableSection }>> {
    return this.request(`/api/sites/${encodeURIComponent(siteId)}/reusable-sections/${encodeURIComponent(sectionId)}`);
  }

  reusableSectionCached(sectionId: string, options: BackyConditionalOptions = {}): Promise<BackyConditionalResult<BackyEnvelope<{ section: BackyReusableSection }>>> {
    return this.requestConditionalJson(`/api/sites/${encodeURIComponent(options.siteId ?? this.requireSiteId())}/reusable-sections/${encodeURIComponent(sectionId)}`, {
      ifNoneMatch: options.etag,
      requestId: options.requestId,
    });
  }

  records<TValues extends Record<string, unknown> = Record<string, unknown>>(
    collectionId: string,
    options: BackyCollectionRecordListOptions = {},
  ): Promise<BackyEnvelope<{ collection: BackyCollectionSchema; records: Array<BackyCollectionRecord<TValues>>; pagination: BackyPagination }>> {
    const { requestId, ...query } = options;
    return this.request(`/api/sites/${encodeURIComponent(this.requireSiteId())}/collections/${encodeURIComponent(collectionId)}/records`, {
      query,
      requestId,
    });
  }

  recordsCached<TValues extends Record<string, unknown> = Record<string, unknown>>(
    collectionId: string,
    options: BackyCollectionRecordListOptions & BackyConditionalOptions = {},
  ): Promise<BackyConditionalResult<BackyEnvelope<{ collection: BackyCollectionSchema; records: Array<BackyCollectionRecord<TValues>>; pagination: BackyPagination }>>> {
    const { requestId, etag, siteId, ...query } = options;
    return this.requestConditionalJson(`/api/sites/${encodeURIComponent(siteId ?? this.requireSiteId())}/collections/${encodeURIComponent(collectionId)}/records`, {
      query,
      ifNoneMatch: etag,
      requestId,
    });
  }

  commerceCatalog(options: BackyCommerceCatalogOptions = {}): Promise<BackyEnvelope<BackyCommerceCatalog>> {
    const { requestId, siteId, ...query } = options;
    return this.request(`/api/sites/${encodeURIComponent(siteId ?? this.requireSiteId())}/commerce/catalog`, {
      query,
      requestId,
    });
  }

  commerceCatalogCached(options: BackyCommerceCatalogOptions & BackyConditionalOptions = {}): Promise<BackyConditionalResult<BackyEnvelope<BackyCommerceCatalog>>> {
    const { requestId, etag, siteId, ...query } = options;
    return this.requestConditionalJson(`/api/sites/${encodeURIComponent(siteId ?? this.requireSiteId())}/commerce/catalog`, {
      query,
      ifNoneMatch: etag,
      requestId,
    });
  }

  commerceOrderContract(siteId = this.requireSiteId()): Promise<BackyEnvelope<BackyCommerceOrderContract>> {
    return this.request(`/api/sites/${encodeURIComponent(siteId)}/commerce/orders`);
  }

  commerceOrderContractCached(options: BackyConditionalOptions = {}): Promise<BackyConditionalResult<BackyEnvelope<BackyCommerceOrderContract>>> {
    return this.requestConditionalJson(`/api/sites/${encodeURIComponent(options.siteId ?? this.requireSiteId())}/commerce/orders`, {
      ifNoneMatch: options.etag,
      requestId: options.requestId,
    });
  }

  createCommerceOrder(input: BackyCommerceOrderInput, siteId = this.requireSiteId()): Promise<BackyEnvelope<{
    schemaVersion: 'backy.commerce-orders.v1';
    order: BackyCommerceOrderSummary;
    lineItems: Array<Record<string, unknown>>;
  }>> {
    return this.request(`/api/sites/${encodeURIComponent(siteId)}/commerce/orders`, {
      method: 'POST',
      body: input,
      requestId: input.requestId,
    });
  }

  createRecord<TValues extends Record<string, unknown> = Record<string, unknown>>(
    collectionId: string,
    values: TValues,
    slug?: string,
  ): Promise<BackyEnvelope<{ record: BackyCollectionRecord<TValues> }>> {
    return this.request(`/api/sites/${encodeURIComponent(this.requireSiteId())}/collections/${encodeURIComponent(collectionId)}/records`, {
      method: 'POST',
      body: { values, slug },
    });
  }

  forms(options: BackyFormListOptions = {}): Promise<BackyEnvelope<{ forms: BackyFormDefinition[]; total?: number; pagination?: BackyPagination }>> {
    const { requestId, siteId, ...query } = options;
    return this.request(`/api/sites/${encodeURIComponent(siteId ?? this.requireSiteId())}/forms`, {
      query,
      requestId,
    });
  }

  formsCached(options: BackyFormListOptions & BackyConditionalOptions = {}): Promise<BackyConditionalResult<BackyEnvelope<{ forms: BackyFormDefinition[]; total?: number; pagination?: BackyPagination }>>> {
    const { requestId, etag, siteId, ...query } = options;
    return this.requestConditionalJson(`/api/sites/${encodeURIComponent(siteId ?? this.requireSiteId())}/forms`, {
      query,
      ifNoneMatch: etag,
      requestId,
    });
  }

  form(formId: string): Promise<BackyEnvelope<{ form: BackyFormDefinition; endpoints: BackyFormEndpoints }>> {
    return this.request(`/api/sites/${encodeURIComponent(this.requireSiteId())}/forms/${encodeURIComponent(formId)}`);
  }

  formDefinition(formId: string): Promise<BackyEnvelope<{ schemaVersion: 'backy.form-definition.v1'; form: BackyFormDefinition; submitUrl: string }>> {
    return this.request(`/api/sites/${encodeURIComponent(this.requireSiteId())}/forms/${encodeURIComponent(formId)}/definition`);
  }

  formDefinitionCached(
    formId: string,
    options: BackyConditionalOptions = {},
  ): Promise<BackyConditionalResult<BackyEnvelope<{ schemaVersion: 'backy.form-definition.v1'; form: BackyFormDefinition; submitUrl: string }>>> {
    return this.requestConditionalJson(`/api/sites/${encodeURIComponent(options.siteId ?? this.requireSiteId())}/forms/${encodeURIComponent(formId)}/definition`, {
      ifNoneMatch: options.etag,
      requestId: options.requestId,
    });
  }

  formSubmissions(formId: string, options: BackyListOptions & { status?: string } = {}): Promise<BackyEnvelope<{ form: BackyFormDefinition; submissions: { data?: BackyFormSubmission[]; [key: string]: unknown }; pagination?: BackyPagination }>> {
    const { requestId, ...query } = options;
    return this.request(`/api/admin/sites/${encodeURIComponent(this.requireSiteId())}/forms/${encodeURIComponent(formId)}/submissions`, {
      query,
      requestId,
    });
  }

  submitForm(formId: string, input: BackyFormSubmissionInput): Promise<BackyEnvelope<{ submission: BackyFormSubmission; contact?: BackyContact; collectionRecord?: BackyCollectionRecord | null; collectionRecordErrors?: Array<Record<string, unknown>> }>> {
    return this.request(`/api/sites/${encodeURIComponent(this.requireSiteId())}/forms/${encodeURIComponent(formId)}/submissions`, {
      method: 'POST',
      body: input,
      requestId: input.requestId,
    });
  }

  formSubmission(formId: string, submissionId: string): Promise<BackyEnvelope<{ submission: BackyFormSubmission }>> {
    return this.request(`/api/admin/sites/${encodeURIComponent(this.requireSiteId())}/forms/${encodeURIComponent(formId)}/submissions/${encodeURIComponent(submissionId)}`);
  }

  updateFormSubmission(formId: string, submissionId: string, updates: Record<string, unknown>): Promise<BackyEnvelope<{ submission: BackyFormSubmission }>> {
    return this.request(`/api/admin/sites/${encodeURIComponent(this.requireSiteId())}/forms/${encodeURIComponent(formId)}/submissions/${encodeURIComponent(submissionId)}`, {
      method: 'PATCH',
      body: updates,
    });
  }

  formContacts(formId: string, options: BackyListOptions & { status?: string } = {}): Promise<BackyEnvelope<{ form: BackyFormDefinition; contacts: BackyContact[]; pagination?: BackyPagination }>> {
    const { requestId, ...query } = options;
    return this.request(`/api/admin/sites/${encodeURIComponent(this.requireSiteId())}/forms/${encodeURIComponent(formId)}/contacts`, {
      query,
      requestId,
    });
  }

  updateFormContact(formId: string, contactId: string, updates: Record<string, unknown>): Promise<BackyEnvelope<{ contact: BackyContact }>> {
    return this.request(`/api/admin/sites/${encodeURIComponent(this.requireSiteId())}/forms/${encodeURIComponent(formId)}/contacts/${encodeURIComponent(contactId)}`, {
      method: 'PATCH',
      body: updates,
    });
  }

  pageComments(pageId: string, options: BackyCommentListOptions = {}): Promise<BackyEnvelope<{ comments: BackyComment[]; count: number; pagination?: BackyPagination }>> {
    const { requestId, ...query } = options;
    return this.request(`/api/sites/${encodeURIComponent(this.requireSiteId())}/pages/${encodeURIComponent(pageId)}/comments`, {
      query,
      requestId,
    });
  }

  submitPageComment(pageId: string, input: BackyCommentInput): Promise<BackyEnvelope<{ comment: BackyComment }>> {
    return this.request(`/api/sites/${encodeURIComponent(this.requireSiteId())}/pages/${encodeURIComponent(pageId)}/comments`, {
      method: 'POST',
      body: normalizeCommentInput(input),
      requestId: input.requestId,
    });
  }

  pageComment(pageId: string, commentId: string): Promise<BackyEnvelope<{ comment: BackyComment }>> {
    return this.request(`/api/sites/${encodeURIComponent(this.requireSiteId())}/pages/${encodeURIComponent(pageId)}/comments/${encodeURIComponent(commentId)}`);
  }

  updatePageComment(pageId: string, commentId: string, updates: Record<string, unknown>): Promise<BackyEnvelope<{ comment: BackyComment }>> {
    return this.request(`/api/sites/${encodeURIComponent(this.requireSiteId())}/pages/${encodeURIComponent(pageId)}/comments/${encodeURIComponent(commentId)}`, {
      method: 'PATCH',
      body: updates,
    });
  }

  blogComments(postId: string, options: BackyCommentListOptions = {}): Promise<BackyEnvelope<{ comments: BackyComment[]; count: number; pagination?: BackyPagination }>> {
    const { requestId, ...query } = options;
    return this.request(`/api/sites/${encodeURIComponent(this.requireSiteId())}/blog/${encodeURIComponent(postId)}/comments`, {
      query,
      requestId,
    });
  }

  submitBlogComment(postId: string, input: BackyCommentInput): Promise<BackyEnvelope<{ comment: BackyComment }>> {
    return this.request(`/api/sites/${encodeURIComponent(this.requireSiteId())}/blog/${encodeURIComponent(postId)}/comments`, {
      method: 'POST',
      body: normalizeCommentInput(input),
      requestId: input.requestId,
    });
  }

  blogComment(postId: string, commentId: string): Promise<BackyEnvelope<{ comment: BackyComment }>> {
    return this.request(`/api/sites/${encodeURIComponent(this.requireSiteId())}/blog/${encodeURIComponent(postId)}/comments/${encodeURIComponent(commentId)}`);
  }

  updateBlogComment(postId: string, commentId: string, updates: Record<string, unknown>): Promise<BackyEnvelope<{ comment: BackyComment }>> {
    return this.request(`/api/sites/${encodeURIComponent(this.requireSiteId())}/blog/${encodeURIComponent(postId)}/comments/${encodeURIComponent(commentId)}`, {
      method: 'PATCH',
      body: updates,
    });
  }

  siteComments(options: BackyCommentListOptions = {}): Promise<BackyEnvelope<{ comments: BackyComment[]; count: number; pagination?: BackyPagination }>> {
    const { requestId, ...query } = options;
    return this.request(`/api/sites/${encodeURIComponent(this.requireSiteId())}/comments`, {
      query,
      requestId,
    });
  }

  updateComments(input: BackyCommentBulkUpdateInput): Promise<BackyEnvelope<{ siteId?: string; updated: BackyComment[]; updatedCount?: number; missingIds?: string[] }>> {
    return this.request(`/api/sites/${encodeURIComponent(this.requireSiteId())}/comments`, {
      method: 'PATCH',
      body: input,
      requestId: input.requestId,
    });
  }

  clearCommentReports(commentIds: string[], input: Omit<BackyCommentBulkUpdateInput, 'commentIds' | 'ids' | 'action' | 'clearReports' | 'status'> = {}): Promise<BackyEnvelope<{ siteId?: string; updated: BackyComment[]; updatedCount?: number; missingIds?: string[] }>> {
    return this.updateComments({
      ...input,
      commentIds,
      action: 'clearReports',
    });
  }

  commentBlocklist(options: BackyCommentBlocklistOptions = {}): Promise<BackyEnvelope<{ siteId?: string; blocklist: BackyCommentBlocklistEntry[]; count: number; pagination?: BackyPagination }>> {
    const { requestId, ...query } = options;
    return this.request(`/api/sites/${encodeURIComponent(this.requireSiteId())}/comments/blocklist`, {
      query,
      requestId,
    });
  }

  deleteCommentBlocklistEntries(ids: string[], input: { requestId?: string } = {}): Promise<BackyEnvelope<{ siteId?: string; deleted: BackyCommentBlocklistEntry[]; deletedCount?: number; missingIds?: string[] }>> {
    return this.request(`/api/sites/${encodeURIComponent(this.requireSiteId())}/comments/blocklist`, {
      method: 'DELETE',
      body: { ids },
      requestId: input.requestId,
    });
  }

  comment(commentId: string): Promise<BackyEnvelope<{ comment: BackyComment }>> {
    return this.request(`/api/sites/${encodeURIComponent(this.requireSiteId())}/comments/${encodeURIComponent(commentId)}`);
  }

  updateComment(commentId: string, updates: Record<string, unknown>): Promise<BackyEnvelope<{ comment: BackyComment }>> {
    return this.request(`/api/sites/${encodeURIComponent(this.requireSiteId())}/comments/${encodeURIComponent(commentId)}`, {
      method: 'PATCH',
      body: updates,
    });
  }

  reportReasons(): Promise<BackyEnvelope<{ reasons: string[] }>> {
    return this.request(`/api/sites/${encodeURIComponent(this.requireSiteId())}/comments/report-reasons`);
  }

  reportReasonsCached(options: BackyConditionalOptions = {}): Promise<BackyConditionalResult<BackyEnvelope<{ reasons: string[] }>>> {
    return this.requestConditionalJson(`/api/sites/${encodeURIComponent(options.siteId ?? this.requireSiteId())}/comments/report-reasons`, {
      ifNoneMatch: options.etag,
      requestId: options.requestId,
    });
  }

  reportComment(commentId: string, input: { reason: string; details?: string; reporterEmail?: string; requestId?: string }): Promise<BackyEnvelope<{ comment: BackyComment; report?: Record<string, unknown> }>> {
    return this.request(`/api/sites/${encodeURIComponent(this.requireSiteId())}/comments/${encodeURIComponent(commentId)}/report`, {
      method: 'POST',
      body: input,
      requestId: input.requestId,
    });
  }

  events(options: BackyEventListOptions = {}): Promise<BackyEnvelope<{ siteId: string; events: BackyInteractionEvent[]; count: number; pagination?: BackyPagination }>> {
    const { requestId, ...query } = options;
    return this.request(`/api/sites/${encodeURIComponent(this.requireSiteId())}/events`, {
      query,
      requestId,
    });
  }

  private requireSiteId(): string {
    if (!this.siteId) {
      throw new Error('BackyClient requires a siteId. Pass siteId to the constructor or call discoverSite().');
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
      throw new Error(`Backy API request failed with HTTP ${response.status} for ${responsePath}.`);
    }

    if (!isBackyEnvelope<BackyRouteResolve>(json)) {
      throw new Error(`Backy API returned an invalid route envelope for ${responsePath}.`);
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
    } = {},
  ): Promise<Record<string, unknown>> {
    const { response, json } = await this.fetchJson(path, options);
    const responsePath = response.url ? new URL(response.url).pathname : path;

    if (!response.ok) {
      if (isBackyErrorEnvelope(json)) {
        throw new BackyApiError(response.status, json);
      }
      throw new Error(`Backy API request failed with HTTP ${response.status} for ${responsePath}.`);
    }

    if (!json || typeof json !== 'object') {
      throw new Error(`Backy API returned non-JSON response for ${responsePath}.`);
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
      throw new Error(`Backy API request failed with HTTP ${response.status} for ${responsePath}.`);
    }

    if (!json || typeof json !== 'object') {
      throw new Error(`Backy API returned non-JSON response for ${responsePath}.`);
    }

    return {
      notModified: false,
      status: response.status,
      body: json as TBody,
      meta,
    };
  }

  private async fetchJson(
    path: string,
    options: {
      method?: string;
      query?: Record<string, string | number | boolean | undefined>;
      body?: unknown;
      requestId?: string;
      ifNoneMatch?: string;
    } = {},
  ): Promise<{ response: Response; json: unknown }> {
    const url = new URL(path.startsWith('http') ? path : `${this.baseUrl}${path}`);
    for (const [key, value] of Object.entries(options.query || {})) {
      if (value !== undefined) {
        url.searchParams.set(key, String(value));
      }
    }

    const headers = new Headers(this.defaultHeaders);
    const requestId = options.requestId ?? this.requestIdFactory();
    headers.set('x-request-id', requestId);
    if (options.ifNoneMatch) {
      headers.set('if-none-match', options.ifNoneMatch);
    }
    if (options.body !== undefined && !headers.has('content-type')) {
      headers.set('content-type', 'application/json');
    }

    const response = await this.fetchImpl(url, {
      method: options.method ?? (options.body === undefined ? 'GET' : 'POST'),
      headers,
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
    });

    if (response.status === 304) {
      return { response, json: null };
    }

    return {
      response,
      json: await response.json().catch(() => null) as unknown,
    };
  }
}

export const createBackyClient = (options: BackyClientOptions) => new BackyClient(options);

function isBackyEnvelope<TData>(value: unknown): value is BackyEnvelope<TData> {
  return Boolean(
    value &&
    typeof value === 'object' &&
    (value as { success?: unknown }).success === true &&
    typeof (value as { requestId?: unknown }).requestId === 'string' &&
    'data' in value,
  );
}

function isBackyErrorEnvelope(value: unknown): value is BackyErrorEnvelope {
  return Boolean(
    value &&
    typeof value === 'object' &&
    (value as { success?: unknown }).success === false &&
    typeof (value as { error?: { code?: unknown; message?: unknown } }).error?.code === 'string' &&
    typeof (value as { error?: { code?: unknown; message?: unknown } }).error?.message === 'string',
  );
}

function isBackyGoneRouteResolveEnvelope(value: unknown): value is BackyRouteResolveResult {
  if (!isBackyErrorEnvelope(value)) {
    return false;
  }

  const data = value.data as { route?: { type?: unknown; resource?: { statusCode?: unknown } } } | undefined;
  return data?.route?.type === 'gone' && data.route.resource?.statusCode === 410;
}

function normalizeCommentInput(input: BackyCommentInput): Record<string, unknown> {
  const { body, content, ...rest } = input;
  return {
    ...rest,
    content: content ?? body ?? '',
  };
}

function extractResponseMeta(response: Response): BackyResponseMeta {
  return {
    status: response.status,
    etag: response.headers.get('etag') || undefined,
    cacheControl: response.headers.get('cache-control') || undefined,
    cacheScope: response.headers.get('x-backy-cache-scope') || undefined,
    cacheRevision: response.headers.get('x-backy-cache-revision') || undefined,
    contractVersion: response.headers.get('x-backy-contract-version') || undefined,
    schemaVersion: response.headers.get('x-backy-schema-version') || undefined,
    requestId: response.headers.get('x-backy-request-id') || undefined,
    siteId: response.headers.get('x-backy-site-id') || undefined,
  };
}
