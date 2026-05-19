/**
 * Public site manifest for custom/generated frontends.
 *
 * GET /api/sites/[siteId]/manifest
 */

import { NextRequest } from 'next/server';
import type { BackyBlogAuthor, BackyBlogCategory, BackyBlogTag, BackyCollection, BackyPage, BackyPost, BackyReusableSection, FormDefinition, MediaItem, Site, SiteSettings } from '@backy-cms/core';
import {
  getAdminSettings,
  getBlogPosts,
  getCommentReportReasons,
  getMediaList,
  getPageSummary,
  getSiteByIdOrSlug,
  getSiteNavigation,
  listBlogAuthors,
  listBlogCategories,
  listBlogTags,
  listCollections,
  listFormsBySite,
  listReusableSections,
} from '@/lib/backyStore';
import { publicContractJson } from '@/lib/publicContractResponse';
import { getRequiredDatabaseRepositories, shouldUseDemoStoreFallback } from '@/lib/repositoryRuntime';
import { normalizeCollectionListRoutePattern, normalizeCollectionRoutePattern } from '@/lib/collectionRoutes';
import { PRODUCT_COLLECTION_SLUG, buildCommerceStorefrontContract } from '@/lib/commerceCatalog';
import { normalizeSiteCommentPolicy } from '@/lib/commentPolicy';
import { frontendDesignProvenanceFromMetadata } from '@/lib/frontendDesignContract';
import { buildSiteNavigation } from '@/lib/navigation';
import { normalizeRedirectRules } from '@/lib/redirectRules';
import { getAdminSessionWithPersistence, listAdminSessionPermissionOverrides } from '@/lib/admin-auth/sessionStore';
import { buildUserPermissionMatrix, isOwnerOnlyAdminPermission, type AdminUserPermissionMatrix } from '@/lib/adminPermissions';
import { getHostedRouteUrl, getSiteCanonicalBaseUrl } from '@/lib/seoDiscovery';
import { buildInteractiveComponentManifestContract } from '@/lib/interactiveComponentRegistry';
import { localizedRoutePatternVariants, normalizeSiteLocalization, type PublicRoutePattern } from '@/lib/siteLocalization';
import { buildBackyThemeDiscovery, buildBackyThemeTokens } from '@/lib/themeTokens';

interface RouteParams {
  params: Promise<{
    siteId: string;
  }>;
}

type ManifestCollectionRoute = {
  id: string;
  slug: string;
  name: string;
  routePattern?: string | null;
  listRoutePattern?: string | null;
  metadata?: unknown;
};

type ManifestCollectionDiscoverySource = {
  status?: string;
  permissions: {
    publicRead?: boolean;
    publicCreate?: boolean;
    publicUpdate?: boolean;
    publicDelete?: boolean;
  };
  fields: Array<{
    type: string;
    referenceCollectionId?: string | null;
  }>;
  metadata?: unknown;
};

type ManifestReusableSectionDiscoverySource = {
  status?: string;
  category?: string | null;
  tags?: string[];
  content?: {
    elements?: unknown[];
    canvasSize?: unknown;
  } | null;
  metadata?: Record<string, unknown>;
};

type ManifestPageDiscoverySource = {
  slug: string;
  status: string;
  isHomepage: boolean;
  meta?: unknown;
};

type ManifestBlogPostDiscoverySource = {
  slug: string;
  status: string;
  meta?: unknown;
};

type ManifestAdminDiscovery = {
  auth: {
    authenticated: boolean;
    mode: 'anonymous' | 'session' | 'api-key';
    user?: {
      id: string;
      role: string;
      status: string;
    };
  };
  summary: {
    allowed: number;
    total: number;
    blockedByStatus: boolean;
  };
  capabilities: Record<string, boolean>;
  permissions: Record<string, boolean>;
  endpoints: Record<string, string>;
};

type ManifestAdminUser = {
  id: string;
  email: string;
  fullName: string;
  role: 'owner' | 'admin' | 'editor' | 'viewer';
  status: 'active' | 'inactive' | 'invited' | 'suspended';
};

type ManifestDeliveryDiscovery = ReturnType<typeof buildDeliveryDiscovery>;

type ManifestDeliverySite = {
  slug: string;
  customDomain?: string | null;
  settings?: Pick<SiteSettings, 'domainVerification' | 'localization'> | null;
};

const frontendDatabaseCertification = {
  schemaVersion: 'backy.frontend-database-certification.v1',
  status: 'external-database-gate',
  requiredFor: 'production-custom-frontends',
  gate: {
    command: 'npm run ci:sdk-postgres-smoke',
    workflow: '.github/workflows/sdk-postgres-smoke.yml',
    localPreflight: 'npm run test:sdk-postgres-preflight-contract',
    typeContract: 'npm run test:frontend-contract-types',
  },
  environment: {
    dataMode: 'database',
    secretAliases: ['BACKY_DATABASE_URL', 'DATABASE_URL'],
    requiredConfirmationEnv: 'BACKY_DATABASE_DISPOSABLE_CONFIRMED=true',
    targetGuards: [
      'BACKY_DATABASE_CERTIFICATION_EXPECTED_HOST',
      'BACKY_DATABASE_CERTIFICATION_EXPECTED_DATABASE',
    ],
  },
  requires: [
    'disposable migrated Supabase/Postgres database',
    'BACKY_DATABASE_DISPOSABLE_CONFIRMED=true',
    'disposable_database_confirmed=true',
    'public schema, RLS policies, indexes, and constraints migrated',
  ],
  coverage: [
    'manifest',
    'openapi',
    'render',
    'media',
    'collections',
    'reusable-sections',
    'forms',
    'comments',
    'events',
    'interactive-components',
  ],
  secretHandling: 'Database URLs and service credentials stay in CI/runtime environment; the manifest exposes only non-secret gate names and requirements.',
} as const;

const makeRequestId = () => `req_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;

const hasPublicOrderCollectionAccess = (permissions: {
  publicRead?: boolean;
  publicCreate?: boolean;
  publicUpdate?: boolean;
  publicDelete?: boolean;
}) => (
  permissions.publicRead === true ||
  permissions.publicCreate === true ||
  permissions.publicUpdate === true ||
  permissions.publicDelete === true
);

const normalizeManifestDomain = (domain: string | null | undefined): string | null => {
  if (typeof domain !== 'string' || domain.trim().length === 0) return null;
  const hostname = domain.trim().replace(/^https?:\/\//i, '').split('/')[0]?.replace(/\/+$/, '').toLowerCase();
  return hostname || null;
};

const buildDeliveryDiscovery = (
  origin: string,
  site: ManifestDeliverySite,
) => {
  const canonicalBaseUrl = getSiteCanonicalBaseUrl(origin, site);
  const localization = normalizeSiteLocalization(site.settings);
  const customDomain = normalizeManifestDomain(site.customDomain);
  const verificationDomain = normalizeManifestDomain(site.settings?.domainVerification?.domain);
  const domainVerification = site.settings?.domainVerification || null;
  const managedBaseUrl = `${origin.replace(/\/$/, '')}/sites/${site.slug}`;
  const domains = [
    {
      type: 'managed',
      host: new URL(managedBaseUrl).host,
      baseUrl: managedBaseUrl,
      primary: !customDomain,
      verified: true,
    },
    ...(customDomain ? [{
      type: 'custom',
      host: customDomain,
      baseUrl: `https://${customDomain}`,
      primary: true,
      verified: domainVerification?.status === 'verified',
      verificationStatus: domainVerification?.status || 'not_started',
      source: 'site.customDomain',
    }] : []),
    ...(
      verificationDomain && verificationDomain !== customDomain
        ? [{
            type: 'verification',
            host: verificationDomain,
            baseUrl: `https://${verificationDomain}`,
            primary: false,
            verified: domainVerification?.status === 'verified',
            verificationStatus: domainVerification?.status || 'not_started',
            source: 'settings.domainVerification.domain',
          }]
        : []
    ),
  ];

  return {
    canonicalBaseUrl,
    managedBaseUrl,
    primaryDomain: customDomain || new URL(managedBaseUrl).host,
    customDomain,
    defaultLocale: localization.defaultLocale,
    localeStrategy: localization.localeStrategy,
    locales: localization.locales,
    domains,
    urls: {
      home: getHostedRouteUrl(origin, site.slug, '/', site.customDomain),
      sitemap: `${canonicalBaseUrl}/sitemap.xml`,
      robots: `${canonicalBaseUrl}/robots.txt`,
    },
  };
};

const getBearerToken = (request: NextRequest) => {
  const authorization = request.headers.get('authorization') || '';
  const match = authorization.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() || request.headers.get('x-backy-admin-session')?.trim() || '';
};

const getProvidedAdminKey = (request: NextRequest) => {
  const explicitKey = request.headers.get('x-backy-admin-key') || request.headers.get('x-api-key');
  if (explicitKey?.trim()) return explicitKey.trim();

  const authorization = request.headers.get('authorization') || '';
  const match = authorization.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() || '';
};

const uniqueKeys = (keys: string[]) => keys.filter((key, index, values) => key && values.indexOf(key) === index);

const permissionMap = (matrix: AdminUserPermissionMatrix, transformAllowed: (permissionKey: string, allowed: boolean) => boolean = (_, allowed) => allowed) => (
  Object.fromEntries(matrix.groups.flatMap((group) => group.permissions.map((permission) => [
    permission.key,
    transformAllowed(permission.key, permission.allowed),
  ])))
);

const summarizePermissions = (permissions: Record<string, boolean>) => {
  const values = Object.values(permissions);
  return {
    allowed: values.filter(Boolean).length,
    total: values.length,
    blockedByStatus: values.length > 0 && values.every((allowed) => !allowed),
  };
};

const adminCapabilities = (permissions: Record<string, boolean>) => ({
  authenticated: Object.values(permissions).some(Boolean),
  sitesView: permissions['sites.view'] === true,
  sitesConfigure: permissions['sites.configure'] === true,
  frontendDesignRead: permissions['sites.view'] === true,
  frontendDesignWrite: permissions['sites.configure'] === true,
  pagesEdit: permissions['pages.edit'] === true,
  pagesPublish: permissions['pages.publish'] === true,
  collectionsEdit: permissions['collections.edit'] === true,
  formsManage: permissions['forms.manage'] === true,
  mediaCreate: permissions['media.create'] === true,
  commerceEdit: permissions['commerce.edit'] === true,
  commentsManage: permissions['comments.manage'] === true,
  usersManage: permissions['users.manage'] === true,
  settingsView: permissions['settings.view'] === true,
  settingsConfigure: permissions['settings.configure'] === true,
  activityExport: permissions['activity.export'] === true,
});

const adminEndpoints = (siteId: string) => ({
  site: `/api/admin/sites/${siteId}`,
  pages: `/api/admin/sites/${siteId}/pages`,
  liveManagePage: `/api/sites/${siteId}/manage/pages/{pageId}`,
  blog: `/api/admin/sites/${siteId}/blog`,
  collections: `/api/admin/sites/${siteId}/collections`,
  forms: `/api/admin/sites/${siteId}/forms`,
  media: `/api/admin/sites/${siteId}/media`,
  frontendDesign: `/api/admin/sites/${siteId}/frontend-design`,
  settings: '/api/admin/settings',
  users: '/api/admin/users',
  auditLogs: `/api/admin/audit-logs?siteId=${encodeURIComponent(siteId)}`,
});

const emptyAdminDiscovery = (siteId: string, permissions: Record<string, boolean> = {}): ManifestAdminDiscovery => ({
  auth: {
    authenticated: false,
    mode: 'anonymous',
  },
  summary: summarizePermissions(permissions),
  capabilities: adminCapabilities(permissions),
  permissions,
  endpoints: adminEndpoints(siteId),
});

const buildAdminDiscovery = async (
  request: NextRequest,
  siteId: string,
  options: {
    configuredAdminKey?: string;
    getUserById?: (userId: string) => Promise<ManifestAdminUser | null | undefined>;
  } = {},
): Promise<ManifestAdminDiscovery> => {
  const baseMatrix = buildUserPermissionMatrix({ id: 'anonymous', role: 'viewer', status: 'inactive' });
  const basePermissions = permissionMap(baseMatrix, () => false);
  const providedKey = getProvidedAdminKey(request);
  const validApiKeys = uniqueKeys([
    process.env.BACKY_ADMIN_API_KEY?.trim() || '',
    process.env.BACKY_ADMIN_SECRET_KEY?.trim() || '',
    options.configuredAdminKey?.trim() || '',
  ]);

  if (providedKey && validApiKeys.includes(providedKey)) {
    const apiKeyMatrix = buildUserPermissionMatrix({ id: 'admin-api-key', role: 'owner', status: 'active' });
    const permissions = permissionMap(apiKeyMatrix, (permissionKey, allowed) => (
      allowed && !isOwnerOnlyAdminPermission(permissionKey)
    ));
    return {
      auth: {
        authenticated: true,
        mode: 'api-key',
      },
      summary: summarizePermissions(permissions),
      capabilities: adminCapabilities(permissions),
      permissions,
      endpoints: adminEndpoints(siteId),
    };
  }

  const token = getBearerToken(request);
  const session = await getAdminSessionWithPersistence(token, options.getUserById ? { getUserById: options.getUserById } : {});
  if (!session) return emptyAdminDiscovery(siteId, basePermissions);

  const sessionOverrides = listAdminSessionPermissionOverrides(session.token, session.user.id);
  const permissions = permissionMap(buildUserPermissionMatrix(session.user, sessionOverrides || []));
  return {
    auth: {
      authenticated: true,
      mode: 'session',
      user: {
        id: session.user.id,
        role: session.user.role,
        status: session.user.status,
      },
    },
    summary: summarizePermissions(permissions),
    capabilities: adminCapabilities(permissions),
    permissions,
    endpoints: adminEndpoints(siteId),
  };
};

const errorResponse = (status: number, code: string, message: string, requestId: string) => (
  publicContractJson(
    {
      success: false,
      requestId,
      error: {
        code,
        message,
      },
    },
    { status, requestId, cache: 'error' },
  )
);

const isPubliclyReadable = (item: { status: string; scheduledAt?: string | null }) => (
  item.status === 'published'
  || (
    item.status === 'scheduled'
    && Boolean(item.scheduledAt)
    && Number.isFinite(Date.parse(item.scheduledAt || ''))
    && Date.parse(item.scheduledAt || '') <= Date.now()
  )
);

const pagePath = (page: Pick<BackyPage, 'isHomepage' | 'slug'>) => (
  page.isHomepage || page.slug === 'index' ? '/' : `/${page.slug}`
);

const collectionField = (field: BackyCollection['fields'][number], index: number) => ({
  key: field.key,
  label: field.label,
  type: field.type,
  required: field.required === true,
  unique: field.unique === true,
  sortOrder: index,
  options: field.options,
  referenceCollectionId: field.referenceCollectionId,
});

const collectionRoutePattern = (collection: Pick<ManifestCollectionRoute, 'slug' | 'routePattern'>) => (
  normalizeCollectionRoutePattern(collection.routePattern, collection.slug)
);

const collectionListRoutePattern = (collection: Pick<ManifestCollectionRoute, 'slug' | 'listRoutePattern'>) => (
  normalizeCollectionListRoutePattern(collection.listRoutePattern, collection.slug)
);

const collectionFrontendDesign = (collection: { metadata?: unknown }) => (
  frontendDesignProvenanceFromMetadata(collection.metadata)
);

const reusableSectionFrontendDesign = (section: { metadata?: Record<string, unknown> }) => {
  const metadata = section.metadata;
  if (!metadata || typeof metadata.frontendDesignTemplateId !== 'string') {
    return undefined;
  }

  return {
    templateId: metadata.frontendDesignTemplateId,
    templateName: typeof metadata.frontendDesignTemplateName === 'string' ? metadata.frontendDesignTemplateName : undefined,
    routePattern: typeof metadata.frontendDesignRoutePattern === 'string' ? metadata.frontendDesignRoutePattern : undefined,
    source: metadata.frontendDesignSource,
    chrome: metadata.frontendDesignChrome,
    tokens: metadata.frontendDesignTokens,
    customCss: typeof metadata.frontendDesignCustomCss === 'string' ? metadata.frontendDesignCustomCss : undefined,
    bindingHints: Array.isArray(metadata.frontendDesignBindingHints) ? metadata.frontendDesignBindingHints : [],
  };
};

const contentFrontendDesign = (item: { meta?: unknown }) => {
  const metadata = item.meta && typeof item.meta === 'object' && !Array.isArray(item.meta)
    ? item.meta as Record<string, unknown>
    : {};
  if (typeof metadata.frontendDesignTemplateId !== 'string') {
    return undefined;
  }

  return {
    templateId: metadata.frontendDesignTemplateId,
    templateName: typeof metadata.frontendDesignTemplateName === 'string' ? metadata.frontendDesignTemplateName : undefined,
    routePattern: typeof metadata.frontendDesignRoutePattern === 'string' ? metadata.frontendDesignRoutePattern : undefined,
    source: metadata.frontendDesignSource,
    chrome: metadata.frontendDesignChrome,
    tokens: metadata.frontendDesignTokens,
    customCss: typeof metadata.frontendDesignCustomCss === 'string' ? metadata.frontendDesignCustomCss : undefined,
    bindingHints: Array.isArray(metadata.frontendDesignBindingHints) ? metadata.frontendDesignBindingHints : [],
  };
};

const dynamicCollectionRoutePatterns = (
  siteId: string,
  collections: ManifestCollectionRoute[],
) => collections.flatMap((collection) => {
  const listPattern = collectionListRoutePattern(collection);
  const pattern = collectionRoutePattern(collection);
  return [
    {
      type: 'dynamicCollectionList',
      collectionId: collection.id,
      collectionSlug: collection.slug,
      collectionName: collection.name,
      pattern: listPattern,
      resolveUrl: `/api/sites/${siteId}/resolve?path=${listPattern}`,
      renderUrl: `/api/sites/${siteId}/render?path=${listPattern}`,
      frontendDesign: collectionFrontendDesign(collection),
    },
    {
      type: 'dynamicCollectionItem',
      collectionId: collection.id,
      collectionSlug: collection.slug,
      collectionName: collection.name,
      pattern,
      resolveUrl: `/api/sites/${siteId}/resolve?path=${pattern}`,
      renderUrl: `/api/sites/${siteId}/render?path=${pattern}`,
      frontendDesign: collectionFrontendDesign(collection),
    },
  ];
});

const manifestRoutePatterns = (
  siteId: string,
  collections: ManifestCollectionRoute[],
): PublicRoutePattern[] => [
  {
    type: 'page',
    pattern: '/:pageSlug',
    resolveUrl: `/api/sites/${siteId}/resolve?path=/:pageSlug`,
    renderUrl: `/api/sites/${siteId}/render?path=/:pageSlug`,
  },
  {
    type: 'blogPost',
    pattern: '/blog/:postSlug',
    resolveUrl: `/api/sites/${siteId}/resolve?path=/blog/:postSlug`,
    renderUrl: `/api/sites/${siteId}/render?path=/blog/:postSlug`,
  },
  ...dynamicCollectionRoutePatterns(siteId, collections),
];

const manifestRedirectRules = (
  siteId: string,
  settings: Pick<Site['settings'], 'redirectRules'> | undefined | null,
) => normalizeRedirectRules(settings?.redirectRules)
  .filter((rule) => rule.enabled)
  .map((rule) => ({
    id: rule.id,
    type: rule.statusCode === 410 ? 'gone' : 'redirect',
    from: rule.from,
    to: rule.statusCode === 410 ? null : rule.to,
    statusCode: rule.statusCode,
    resolveUrl: `/api/sites/${siteId}/resolve?path=${encodeURIComponent(rule.from)}`,
  }));

const blogFeedDiscovery = (site: Pick<Site, 'id' | 'name'>) => [
  {
    id: 'blog-rss',
    title: `${site.name} Blog RSS`,
    format: 'rss',
    version: '2.0',
    rel: 'alternate',
    contentType: 'application/rss+xml; charset=utf-8',
    endpoint: `/api/sites/${site.id}/blog/rss`,
    hostedPath: '/blog/rss.xml',
    schemaVersion: 'rss.2.0',
    scope: 'public-blog-posts',
    visibility: 'published-and-past-scheduled',
    cache: {
      scope: 'discovery',
      etag: true,
      revisionHeader: 'x-backy-cache-revision',
    },
    limits: {
      queryParam: 'limit',
      default: 25,
      min: 1,
      max: 100,
    },
  },
];

const buildManifestCommentDiscovery = (
  siteId: string,
  settings: SiteSettings | null | undefined,
) => {
  const policy = normalizeSiteCommentPolicy(settings?.commentPolicy);
  const reportReasons = getCommentReportReasons();

  return {
    schemaVersion: 'backy.comments-discovery.v1',
    enabled: policy.enabled,
    moderationMode: policy.moderationMode,
    allowGuests: policy.allowGuests,
    allowReplies: policy.allowReplies,
    defaultSort: policy.sort,
    statuses: ['pending', 'approved', 'rejected', 'spam', 'blocked'],
    publicListStatus: 'approved',
    reportReasons,
    endpoints: {
      list: `/api/sites/${siteId}/comments`,
      pageComments: `/api/sites/${siteId}/pages/{pageId}/comments`,
      pageComment: `/api/sites/${siteId}/pages/{pageId}/comments/{commentId}`,
      blogComments: `/api/sites/${siteId}/blog/{postId}/comments`,
      blogComment: `/api/sites/${siteId}/blog/{postId}/comments/{commentId}`,
      reportReasons: `/api/sites/${siteId}/comments/report-reasons`,
      report: `/api/sites/${siteId}/comments/{commentId}/report`,
      blocklist: `/api/sites/${siteId}/comments/blocklist`,
    },
    reporting: {
      enabled: policy.enableReports,
      reasons: reportReasons,
      reportUrlTemplate: `/api/sites/${siteId}/comments/{commentId}/report`,
    },
    spamProtection: {
      captchaEnabled: policy.enableCaptcha,
      captchaProvider: policy.captchaProvider,
      blockedTermCount: policy.blockedTerms.length,
      honeypotField: 'website',
      timingField: 'startedAt',
    },
  };
};

const buildManifestMediaDiscovery = (
  siteId: string,
  media: Pick<MediaItem, 'type'>[],
  totalCount: number,
  publicCount: number,
) => {
  const types = Array.from(new Set(media.map((item) => item.type))).sort();
  const fontCount = media.filter((item) => item.type === 'font').length;

  return {
    schemaVersion: 'backy.media-discovery.v1',
    count: totalCount,
    publicCount,
    fontCount,
    types,
    listUrl: `/api/sites/${siteId}/media`,
    endpoints: {
      list: `/api/sites/${siteId}/media`,
      fonts: `/api/sites/${siteId}/media/fonts`,
      detail: `/api/sites/${siteId}/media/{mediaId}`,
      file: `/api/sites/${siteId}/media/{mediaId}/file`,
      transform: `/api/sites/${siteId}/media/{mediaId}/transform?width={width}`,
    },
    capabilities: {
      publicAssets: true,
      signedPrivateFiles: true,
      responsiveImages: true,
      imageTransforms: true,
      fontManifest: true,
      references: true,
      editableMetadata: true,
    },
    filters: {
      types,
      visibility: ['public', 'private'],
      scopes: ['global', 'page', 'post'],
      queryParams: ['type', 'q', 'folder', 'pageId', 'postId', 'global', 'limit', 'offset'],
    },
  };
};

const buildManifestLiveManagementDiscovery = (siteId: string) => ({
  schemaVersion: 'backy.live-management.v1',
  enabled: true,
  endpoints: {
    page: `/api/sites/${siteId}/manage/pages/{pageId}`,
    render: `/api/sites/${siteId}/render?path={path}`,
    editableMapSchema: 'https://backy.dev/schemas/ai-frontend-contract/editable-map.schema.json',
  },
  methods: {
    read: 'GET',
    update: 'PATCH',
  },
  auth: {
    modes: ['session', 'api-key'],
    headers: ['Authorization', 'x-backy-admin-session', 'x-backy-admin-key', 'x-api-key'],
    requiredPermissions: {
      read: 'pages.view',
      update: 'pages.edit',
    },
    siteScope: true,
  },
  capabilities: {
    pageMetadata: true,
    contentDocument: true,
    canvasElements: true,
    editableMap: true,
    optimisticConcurrency: true,
    cacheInvalidation: true,
    auditTrail: true,
    webhookDelivery: true,
  },
  editableTargets: [
    'props.content',
    'props.href',
    'props.src',
    'props.alt',
    'props.title',
    'styles.color',
    'styles.backgroundColor',
    'styles.borderColor',
    'styles.borderRadius',
    'styles.padding',
    'styles.margin',
    'styles.opacity',
    'layout.x',
    'layout.y',
    'layout.width',
    'layout.height',
    'visibility.hidden',
    'visibility.locked',
  ],
  updateBody: {
    expectedUpdatedAt: 'Use the current page updatedAt value for optimistic conflict protection.',
    content: 'Send the full Backy content document or canvas content object after applying editable-map changes.',
  },
  errors: {
    conflict: 'PAGE_VERSION_CONFLICT',
    forbidden: 'FORBIDDEN_LIVE_MANAGE_SITE_SCOPE',
    validation: 'VALIDATION_ERROR',
  },
});

const buildManifestPagesDiscovery = (
  siteId: string,
  pages: ManifestPageDiscoverySource[],
) => ({
  schemaVersion: 'backy.pages-discovery.v1',
  count: pages.length,
  publishedCount: pages.filter((page) => page.status === 'published').length,
  scheduledCount: pages.filter((page) => page.status === 'scheduled').length,
  homepagePath: pages.find((page) => page.isHomepage || page.slug === 'index') ? '/' : null,
  paths: pages.map(pagePath),
  endpoints: {
    list: `/api/sites/${siteId}/pages`,
    detail: `/api/sites/${siteId}/pages?path={path}`,
    resolve: `/api/sites/${siteId}/resolve?path={path}`,
    render: `/api/sites/${siteId}/render?path={path}`,
    liveManage: `/api/sites/${siteId}/manage/pages/{pageId}`,
  },
  methods: {
    list: 'GET',
    detail: 'GET',
    resolve: 'GET',
    render: 'GET',
    liveManageRead: 'GET',
    liveManageUpdate: 'PATCH',
  },
  capabilities: {
    publicList: true,
    publicDetail: true,
    renderPayload: true,
    routeResolve: true,
    seoMetadata: true,
    frontendDesignProvenance: pages.some((page) => Boolean(contentFrontendDesign(page))),
    previewTokens: true,
    liveManagement: true,
    conditionalRequests: true,
    cacheablePages: true,
  },
  cache: {
    list: 'public-discovery',
    detail: 'public-discovery',
    previewDetail: 'private-no-store',
    render: 'public-discovery',
  },
  privacy: {
    publicReadsOnlyIncludePublishedOrPastScheduledPages: true,
    draftPreviewRequiresToken: true,
    previewTokenIsNeverReturned: true,
  },
  filters: {
    queryParams: ['slug', 'path', 'previewToken', 'limit', 'offset'],
    maxLimit: 100,
  },
  schemas: {
    page: 'backy.page.v1',
    renderPayload: 'backy.render-payload.v1',
    seo: 'backy.seo-route.v1',
    notFound: 'PAGE_NOT_FOUND',
    invalidLimit: 'INVALID_PAGE_LIMIT',
    invalidOffset: 'INVALID_PAGE_OFFSET',
  },
});

const buildManifestBlogDiscovery = (
  siteId: string,
  posts: ManifestBlogPostDiscoverySource[],
  categories: Array<{ id: string; slug: string; name: string; postCount?: number }>,
  tags: Array<{ id: string; slug: string; name: string; postCount?: number }>,
  authors: Array<{ id: string; slug: string; name: string; postCount?: number }>,
  feeds: ReturnType<typeof blogFeedDiscovery>,
) => ({
  schemaVersion: 'backy.blog-discovery.v1',
  count: posts.length,
  publishedCount: posts.filter((post) => post.status === 'published').length,
  scheduledCount: posts.filter((post) => post.status === 'scheduled').length,
  categoryCount: categories.length,
  tagCount: tags.length,
  authorCount: authors.length,
  feedCount: feeds.length,
  paths: posts.map((post) => `/blog/${post.slug}`),
  endpoints: {
    list: `/api/sites/${siteId}/blog`,
    detail: `/api/sites/${siteId}/blog?slug={slug}`,
    rss: `/api/sites/${siteId}/blog/rss`,
    categories: `/api/sites/${siteId}/blog/categories`,
    tags: `/api/sites/${siteId}/blog/tags`,
    authors: `/api/sites/${siteId}/blog/authors`,
    resolve: `/api/sites/${siteId}/resolve?path={path}`,
    render: `/api/sites/${siteId}/render?path={path}`,
  },
  methods: {
    list: 'GET',
    detail: 'GET',
    rss: 'GET',
    categories: 'GET',
    tags: 'GET',
    authors: 'GET',
    resolve: 'GET',
    render: 'GET',
  },
  capabilities: {
    publicList: true,
    publicDetail: true,
    taxonomyFilters: true,
    archiveFilters: true,
    searchFilters: true,
    rssFeed: feeds.length > 0,
    renderPayload: true,
    routeResolve: true,
    frontendDesignProvenance: posts.some((post) => Boolean(contentFrontendDesign(post))),
    previewTokens: true,
    conditionalRequests: true,
    cacheablePosts: true,
  },
  cache: {
    list: 'public-discovery',
    detail: 'public-discovery',
    previewDetail: 'private-no-store',
    taxonomy: 'public-discovery',
    rss: 'public-discovery',
    render: 'public-discovery',
  },
  privacy: {
    publicReadsOnlyIncludePublishedOrPastScheduledPosts: true,
    draftPreviewRequiresToken: true,
    previewTokenIsNeverReturned: true,
  },
  filters: {
    queryParams: ['slug', 'previewToken', 'limit', 'offset', 'status', 'q', 'search', 'year', 'month', 'categoryId', 'categorySlug', 'tagId', 'tagSlug', 'authorId', 'authorSlug'],
    maxLimit: 100,
    statuses: ['published', 'draft', 'scheduled', 'archived'],
  },
  schemas: {
    post: 'backy.blog-post.v1',
    feed: 'backy.blog-feed.v1',
    renderPayload: 'backy.render-payload.v1',
    notFound: 'POST_NOT_FOUND',
    invalidLimit: 'INVALID_BLOG_LIMIT',
    invalidOffset: 'INVALID_BLOG_OFFSET',
    invalidStatus: 'INVALID_BLOG_STATUS',
    invalidArchiveYear: 'INVALID_BLOG_ARCHIVE_YEAR',
    invalidArchiveMonth: 'INVALID_BLOG_ARCHIVE_MONTH',
  },
});

const buildManifestFormsDiscovery = (
  siteId: string,
  forms: FormDefinition[],
) => {
  const collectionTargetCount = forms.filter((form) => form.collectionTarget?.enabled).length;

  return {
    schemaVersion: 'backy.forms-discovery.v1',
    count: forms.length,
    activeCount: forms.filter((form) => form.isActive).length,
    collectionTargetCount,
    moderationModes: Array.from(new Set(forms.map((form) => form.moderationMode))).sort(),
    endpoints: {
      list: `/api/sites/${siteId}/forms`,
      detail: `/api/sites/${siteId}/forms/{formId}`,
      definition: `/api/sites/${siteId}/forms/{formId}/definition`,
      submit: `/api/sites/${siteId}/forms/{formId}/submissions`,
      submissions: `/api/sites/${siteId}/forms/{formId}/submissions`,
      contacts: `/api/sites/${siteId}/forms/{formId}/contacts`,
    },
    methods: {
      list: 'GET',
      detail: 'GET',
      definition: 'GET',
      submit: 'POST',
      reviewSubmission: 'PATCH',
      updateContact: 'PATCH',
    },
    capabilities: {
      publicDefinitions: true,
      publicSubmissions: true,
      fieldValidation: true,
      collectionWriteTargets: collectionTargetCount > 0,
      moderation: true,
      contactShare: true,
      conditionalRequests: true,
      cacheableDefinitions: true,
      privateSubmissionData: true,
    },
    cache: {
      list: 'public-discovery',
      definition: 'public-discovery',
      detail: 'private-no-store',
      submissions: 'private-no-store',
      contacts: 'private-no-store',
    },
    privacy: {
      submissionPayloadsContainVisitorData: true,
      publicDefinitionExcludesSubmissions: true,
      contactPayloadsArePrivate: true,
    },
    schemas: {
      definition: 'backy.form-definition.v1',
      validationError: 'FORM_VALIDATION_ERROR',
      collectionRecordLink: 'backy.form-collection-record-link.v1',
    },
  };
};

const buildManifestCollectionsDiscovery = (
  siteId: string,
  collections: ManifestCollectionDiscoverySource[],
) => {
  const fieldTypes = Array.from(new Set(collections.flatMap((collection) => (
    collection.fields.map((field) => field.type)
  )))).sort();
  const hasRelationshipFields = collections.some((collection) => (
    collection.fields.some((field) => Boolean(field.referenceCollectionId))
  ));

  return {
    schemaVersion: 'backy.collections-discovery.v1',
    count: collections.length,
    publishedCount: collections.filter((collection) => collection.status === 'published').length,
    publicReadCount: collections.filter((collection) => collection.permissions.publicRead).length,
    publicCreateCount: collections.filter((collection) => collection.permissions.publicCreate).length,
    publicUpdateCount: collections.filter((collection) => collection.permissions.publicUpdate).length,
    publicDeleteCount: collections.filter((collection) => collection.permissions.publicDelete).length,
    fieldTypes,
    endpoints: {
      list: `/api/sites/${siteId}/collections`,
      detail: `/api/sites/${siteId}/collections/{collectionId}`,
      records: `/api/sites/${siteId}/collections/{collectionId}/records`,
      record: `/api/sites/${siteId}/collections/{collectionId}/records/{recordId}`,
      resolveList: `/api/sites/${siteId}/resolve?path={listPath}`,
      renderList: `/api/sites/${siteId}/render?path={listPath}`,
      resolveItem: `/api/sites/${siteId}/resolve?path={itemPath}`,
      renderItem: `/api/sites/${siteId}/render?path={itemPath}`,
    },
    methods: {
      list: 'GET',
      detail: 'GET',
      records: 'GET',
      createRecord: 'POST',
      updateRecord: 'PATCH',
      deleteRecord: 'DELETE',
    },
    capabilities: {
      publicSchemas: true,
      publicRecords: true,
      publicCreate: collections.some((collection) => collection.permissions.publicCreate),
      publicUpdate: collections.some((collection) => collection.permissions.publicUpdate),
      publicDelete: collections.some((collection) => collection.permissions.publicDelete),
      dynamicListRoutes: collections.length > 0,
      dynamicItemRoutes: collections.length > 0,
      fieldValidation: true,
      relationshipFields: hasRelationshipFields,
      frontendDesignTemplates: collections.some((collection) => Boolean(collectionFrontendDesign(collection))),
      conditionalRequests: true,
      cacheableRecords: true,
    },
    cache: {
      list: 'public-discovery',
      detail: 'public-discovery',
      records: 'public-discovery',
      mutations: 'private-no-store',
    },
    privacy: {
      publicRecordListsOnlyIncludePublishedRecords: true,
      visitorWritesRequirePublicPermission: true,
      publicUpdateAndDeleteMayRequireWriteToken: true,
    },
    writePolicy: {
      createStatus: 'draft',
      createRequiresPublicCreate: true,
      updateRequiresPublicUpdate: true,
      deleteRequiresPublicDelete: true,
      updateDeleteToken: 'publicWriteToken',
      fieldPolicyMetadata: 'metadata.visitorWritePolicy',
    },
    schemas: {
      collection: 'backy.collection.v1',
      record: 'backy.collection-record.v1',
      validationError: 'VALIDATION_ERROR',
      slugConflict: 'SLUG_CONFLICT',
    },
  };
};

const buildManifestReusableSectionsDiscovery = (
  siteId: string,
  sections: ManifestReusableSectionDiscoverySource[],
) => {
  const categories = Array.from(new Set(sections.map((section) => section.category).filter((category): category is string => (
    typeof category === 'string' && category.length > 0
  )))).sort();
  const tags = Array.from(new Set(sections.flatMap((section) => section.tags || []))).sort();
  const elementCount = sections.reduce((total, section) => (
    total + (Array.isArray(section.content?.elements) ? section.content.elements.length : 0)
  ), 0);

  return {
    schemaVersion: 'backy.reusable-sections-discovery.v1',
    count: sections.length,
    activeCount: sections.filter((section) => section.status === 'active').length,
    categories,
    tags,
    elementCount,
    endpoints: {
      list: `/api/sites/${siteId}/reusable-sections`,
      detail: `/api/sites/${siteId}/reusable-sections/{sectionId}`,
    },
    methods: {
      list: 'GET',
      detail: 'GET',
    },
    capabilities: {
      publicSections: true,
      activeOnlyPublicReads: true,
      categoryFilters: true,
      tagFilters: true,
      searchFilters: true,
      canvasContent: true,
      frontendDesignTemplates: sections.some((section) => Boolean(reusableSectionFrontendDesign(section))),
      conditionalRequests: true,
      cacheableSections: true,
    },
    cache: {
      list: 'public-discovery',
      detail: 'public-discovery',
    },
    privacy: {
      publicReadsOnlyIncludeActiveSections: true,
      sectionContentIsPublicTemplateData: true,
      adminMetadataIsNotRequiredForRendering: true,
    },
    filters: {
      queryParams: ['category', 'tag', 'search'],
      categories,
      tags,
    },
    schemas: {
      section: 'backy.reusable-section.v1',
      content: 'backy.content.v1',
      notFound: 'REUSABLE_SECTION_NOT_FOUND',
    },
  };
};

const buildRepositoryManifest = (
  input: {
    requestId: string;
    site: Site;
    pages: BackyPage[];
    posts: BackyPost[];
    categories: BackyBlogCategory[];
    tags: BackyBlogTag[];
    authors: BackyBlogAuthor[];
    collections: BackyCollection[];
    reusableSections: BackyReusableSection[];
    forms: FormDefinition[];
    media: MediaItem[];
    commerceSettings?: unknown;
    admin: ManifestAdminDiscovery;
    delivery: ManifestDeliveryDiscovery;
  },
) => {
  const fonts = input.media.filter((item) => item.type === 'font');
  const publicCollections = input.collections.filter((collection) => collection.permissions.publicRead);
  const hasCommerceCatalog = publicCollections.some((collection) => collection.slug === PRODUCT_COLLECTION_SLUG);
  const hasPrivateOrders = input.collections.some((collection) => (
    collection.slug === 'orders' &&
    collection.status === 'published' &&
    !hasPublicOrderCollectionAccess(collection.permissions)
  ));
  const redirectRules = manifestRedirectRules(input.site.id, input.site.settings);
  const blogFeeds = blogFeedDiscovery(input.site);
  const commerce = buildCommerceStorefrontContract({
    siteId: input.site.id,
    settings: input.commerceSettings,
    hasCatalog: hasCommerceCatalog,
    hasOrderIntake: hasCommerceCatalog && hasPrivateOrders,
  });
  const interactiveComponents = buildInteractiveComponentManifestContract();
  const routePatterns = manifestRoutePatterns(input.site.id, publicCollections);

  return {
    success: true,
    requestId: input.requestId,
    data: {
      schemaVersion: 'backy.frontend-manifest.v1',
      generatedAt: new Date().toISOString(),
      site: {
        id: input.site.id,
        slug: input.site.slug,
        name: input.site.name,
        description: input.site.description || '',
        customDomain: input.site.customDomain,
        status: input.site.isPublished ? 'published' : 'draft',
        themeTokens: buildBackyThemeTokens(input.site.theme),
        frontendDesign: input.site.settings?.frontendDesign || null,
        commentPolicy: normalizeSiteCommentPolicy(input.site.settings?.commentPolicy),
      },
      contract: {
        version: 'backy.ai-frontend.v1',
        docs: '/specs/ai-frontend-contract/README.md',
        databaseCertification: frontendDatabaseCertification,
        schemas: {
          manifest: 'https://backy.dev/schemas/ai-frontend-contract/frontend-manifest.schema.json',
          renderPayload: 'https://backy.dev/schemas/ai-frontend-contract/content-payload.schema.json',
          themeTokens: 'https://backy.dev/schemas/ai-frontend-contract/theme-tokens.schema.json',
          elementActions: 'https://backy.dev/schemas/ai-frontend-contract/element-actions.schema.json',
          dataBindings: 'https://backy.dev/schemas/ai-frontend-contract/data-bindings.schema.json',
          editableMap: 'https://backy.dev/schemas/ai-frontend-contract/editable-map.schema.json',
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
        uploadedFonts: fonts.length > 0,
        blog: true,
        comments: true,
        forms: input.forms.length > 0,
        collectionSchemas: true,
        collectionRecords: true,
        commerceCatalog: hasCommerceCatalog,
        commerceOrderIntake: hasCommerceCatalog && hasPrivateOrders,
        commerceProviderCheckout: commerce.capabilities.providerCheckout,
        publicCollectionCreate: publicCollections.some((collection) => collection.permissions.publicCreate),
        collectionWriteForms: input.forms.some((form) => form.collectionTarget?.enabled),
        dynamicListRoutes: publicCollections.length > 0,
        dynamicItemRoutes: publicCollections.length > 0,
        redirectRoutes: redirectRules.length > 0,
        reusableSections: input.reusableSections.length > 0,
        frontendDesignContract: Boolean(input.site.settings?.frontendDesign && input.site.settings.frontendDesign.status !== 'unconfigured'),
        interactiveComponents: true,
        sandboxedCodeComponents: interactiveComponents.capabilities.customCodeSandbox,
        previewTokens: true,
      },
      endpoints: {
        site: `/api/sites?identifier=${encodeURIComponent(input.site.slug)}`,
        manifest: `/api/sites/${input.site.id}/manifest`,
        openapi: `/api/sites/${input.site.id}/openapi`,
        resolve: `/api/sites/${input.site.id}/resolve?path=/`,
        render: `/api/sites/${input.site.id}/render?path=/`,
        seo: `/api/sites/${input.site.id}/seo`,
        sitemap: `/api/sites/${input.site.id}/seo?format=sitemap`,
        robots: `/api/sites/${input.site.id}/seo?format=robots`,
        navigation: `/api/sites/${input.site.id}/navigation`,
        frontendDesign: `/api/sites/${input.site.id}/frontend-design`,
        frontendDesignInManifest: `/api/sites/${input.site.id}/manifest#data.site.frontendDesign`,
        interactiveComponents: `/api/sites/${input.site.id}/interactive-components`,
        interactiveRuntimeEvents: `/api/sites/${input.site.id}/interactive-components/runtime-events`,
        interactiveComponentsInManifest: `/api/sites/${input.site.id}/manifest#data.modules.interactiveComponents`,
        media: `/api/sites/${input.site.id}/media`,
        mediaFonts: `/api/sites/${input.site.id}/media/fonts`,
        mediaDetail: `/api/sites/${input.site.id}/media/{mediaId}`,
        mediaFile: `/api/sites/${input.site.id}/media/{mediaId}/file`,
        mediaTransform: `/api/sites/${input.site.id}/media/{mediaId}/transform?width={width}`,
        pages: `/api/sites/${input.site.id}/pages`,
        liveManagePage: `/api/sites/${input.site.id}/manage/pages/{pageId}`,
        blog: `/api/sites/${input.site.id}/blog`,
        blogRss: `/api/sites/${input.site.id}/blog/rss`,
        blogCategories: `/api/sites/${input.site.id}/blog/categories`,
        blogTags: `/api/sites/${input.site.id}/blog/tags`,
        blogAuthors: `/api/sites/${input.site.id}/blog/authors`,
        commerceCatalog: `/api/sites/${input.site.id}/commerce/catalog`,
        commerceOrders: `/api/sites/${input.site.id}/commerce/orders`,
        collections: `/api/sites/${input.site.id}/collections`,
        reusableSections: `/api/sites/${input.site.id}/reusable-sections`,
        reusableSectionDetail: `/api/sites/${input.site.id}/reusable-sections/{sectionId}`,
        forms: `/api/sites/${input.site.id}/forms`,
        formDetail: `/api/sites/${input.site.id}/forms/{formId}`,
        formDefinition: `/api/sites/${input.site.id}/forms/{formId}/definition`,
        formSubmissions: `/api/sites/${input.site.id}/forms/{formId}/submissions`,
        formContacts: `/api/sites/${input.site.id}/forms/{formId}/contacts`,
        comments: `/api/sites/${input.site.id}/comments`,
        pageComments: `/api/sites/${input.site.id}/pages/{pageId}/comments`,
        pageComment: `/api/sites/${input.site.id}/pages/{pageId}/comments/{commentId}`,
        blogComments: `/api/sites/${input.site.id}/blog/{postId}/comments`,
        blogComment: `/api/sites/${input.site.id}/blog/{postId}/comments/{commentId}`,
        commentReportReasons: `/api/sites/${input.site.id}/comments/report-reasons`,
        commentReport: `/api/sites/${input.site.id}/comments/{commentId}/report`,
        events: `/api/sites/${input.site.id}/events`,
      },
      routePatterns,
      modules: {
        routing: {
          supportedRouteTypes: ['page', 'post', 'dynamicList', 'dynamicItem', 'redirect', 'gone'],
          localizedRoutePatterns: localizedRoutePatternVariants(routePatterns, input.delivery),
          redirectRules: {
            count: redirectRules.length,
            items: redirectRules,
          },
        },
        theme: buildBackyThemeDiscovery(input.site.theme),
        liveManagement: buildManifestLiveManagementDiscovery(input.site.id),
        pages: {
          count: input.pages.length,
          items: input.pages.map((page) => ({
            id: page.id,
            title: page.title,
            slug: page.slug,
            path: pagePath(page),
            status: page.status,
            renderUrl: `/api/sites/${input.site.id}/render?path=${encodeURIComponent(pagePath(page))}`,
            frontendDesign: contentFrontendDesign(page),
          })),
        },
        pagesRuntime: buildManifestPagesDiscovery(input.site.id, input.pages),
        blog: {
          count: input.posts.length,
          rssUrl: `/api/sites/${input.site.id}/blog/rss`,
          hostedRssPath: '/blog/rss.xml',
          feeds: blogFeeds,
          items: input.posts.map((post) => ({
            id: post.id,
            title: post.title,
            slug: post.slug,
            path: `/blog/${post.slug}`,
            status: post.status,
            renderUrl: `/api/sites/${input.site.id}/render?path=${encodeURIComponent(`/blog/${post.slug}`)}`,
            frontendDesign: contentFrontendDesign(post),
          })),
          categories: input.categories.map((category) => ({
            id: category.id,
            name: category.name,
            slug: category.slug,
            postCount: category.postCount || 0,
          })),
          tags: input.tags.map((tag) => ({
            id: tag.id,
            name: tag.name,
            slug: tag.slug,
            postCount: tag.postCount || 0,
          })),
          authors: input.authors.map((author) => ({
            id: author.id,
            name: author.name,
            slug: author.slug,
            role: author.role,
            status: author.status,
            postCount: author.postCount || 0,
          })),
        },
        blogRuntime: buildManifestBlogDiscovery(input.site.id, input.posts, input.categories, input.tags, input.authors, blogFeeds),
        collections: publicCollections.map((collection) => ({
          id: collection.id,
          slug: collection.slug,
          name: collection.name,
          status: collection.status,
          permissions: collection.permissions,
          fields: collection.fields.map(collectionField),
          recordsUrl: `/api/sites/${input.site.id}/collections/${collection.id}/records`,
          listRoutePattern: collectionListRoutePattern(collection),
          dynamicListRoutePattern: collectionListRoutePattern(collection),
          dynamicListRouteResolveUrl: `/api/sites/${input.site.id}/resolve?path=${collectionListRoutePattern(collection)}`,
          dynamicListRouteRenderUrl: `/api/sites/${input.site.id}/render?path=${collectionListRoutePattern(collection)}`,
          routePattern: collectionRoutePattern(collection),
          dynamicRoutePattern: collectionRoutePattern(collection),
          dynamicRouteResolveUrl: `/api/sites/${input.site.id}/resolve?path=${collectionRoutePattern(collection)}`,
          dynamicRouteRenderUrl: `/api/sites/${input.site.id}/render?path=${collectionRoutePattern(collection)}`,
          frontendDesign: collectionFrontendDesign(collection),
        })),
        collectionsRuntime: buildManifestCollectionsDiscovery(input.site.id, publicCollections),
        reusableSections: {
          count: input.reusableSections.length,
          listUrl: `/api/sites/${input.site.id}/reusable-sections`,
          categories: Array.from(new Set(input.reusableSections.map((section) => section.category))).sort(),
          tags: Array.from(new Set(input.reusableSections.flatMap((section) => section.tags))).sort(),
          items: input.reusableSections.map((section) => ({
            id: section.id,
            slug: section.slug,
            name: section.name,
            description: section.description,
            category: section.category,
            tags: section.tags,
            detailUrl: `/api/sites/${input.site.id}/reusable-sections/${section.id}`,
            canvasSize: section.content.canvasSize,
            elementCount: Array.isArray(section.content.elements) ? section.content.elements.length : 0,
            frontendDesign: reusableSectionFrontendDesign(section),
          })),
        },
        reusableSectionsRuntime: buildManifestReusableSectionsDiscovery(input.site.id, input.reusableSections),
        forms: input.forms.map((form) => ({
          id: form.id,
          title: form.title,
          active: form.isActive,
          moderationMode: form.moderationMode,
          pageId: form.pageId || null,
          postId: form.postId || null,
          fields: form.fields,
          submitUrl: `/api/sites/${input.site.id}/forms/${form.id}/submissions`,
          detailUrl: `/api/sites/${input.site.id}/forms/${form.id}`,
          definitionUrl: `/api/sites/${input.site.id}/forms/${form.id}/definition`,
          submissionsUrl: `/api/sites/${input.site.id}/forms/${form.id}/submissions`,
          contactsUrl: `/api/sites/${input.site.id}/forms/${form.id}/contacts`,
          collectionTarget: form.collectionTarget || null,
          frontendDesign: frontendDesignProvenanceFromMetadata(form.settings),
        })),
        formsRuntime: buildManifestFormsDiscovery(input.site.id, input.forms),
        comments: buildManifestCommentDiscovery(input.site.id, input.site.settings),
        media: buildManifestMediaDiscovery(input.site.id, input.media, input.media.length, input.media.length),
        commerce,
        interactiveComponents,
      },
      admin: input.admin,
      delivery: input.delivery,
      navigation: buildSiteNavigation(input.site.settings, input.pages.filter(isPubliclyReadable).map((page) => ({
        ...page,
        meta: {
          ...page.meta,
          canonical: pagePath(page),
        },
      }))),
    },
  };
};

export async function GET(request: NextRequest, { params }: RouteParams) {
  const requestId = request.headers.get('x-request-id') || makeRequestId();

  try {
    const { siteId } = await params;
    if (!shouldUseDemoStoreFallback()) {
      const repositories = await getRequiredDatabaseRepositories();
      const site = await repositories.sites.getById(siteId) || await repositories.sites.getBySlug(siteId);

      if (!site || !site.isPublished) {
        return errorResponse(404, 'SITE_NOT_FOUND', 'Site not found', requestId);
      }

      const [pages, posts, categories, tags, authors, collections, reusableSections, forms, media, settings] = await Promise.all([
        repositories.pages.list({ siteId: site.id, status: 'published', includeUnpublished: false, limit: 100, offset: 0 }),
        repositories.posts.list({ siteId: site.id, status: 'published', includeUnpublished: false, limit: 100, offset: 0 }),
        repositories.blogTaxonomy.listCategories(site.id),
        repositories.blogTaxonomy.listTags(site.id),
        repositories.blogTaxonomy.listAuthors(site.id),
        repositories.collections.list({ siteId: site.id, status: 'published', includeUnpublished: false, limit: 100, offset: 0 }),
        repositories.reusableSections.list({ siteId: site.id, status: 'active', limit: 100, offset: 0 }),
        repositories.forms.list({ siteId: site.id, isActive: true, limit: 100, offset: 0 }),
        repositories.media.list({ siteId: site.id, visibility: 'public', limit: 10000, offset: 0 }),
        repositories.settings.get(),
      ]);
      const admin = await buildAdminDiscovery(request, site.id, {
        configuredAdminKey: settings.apiKeys?.secretKeyId,
        getUserById: repositories.users.getById,
      });
      const origin = new URL(request.url).origin;
      const delivery = buildDeliveryDiscovery(origin, site);
      const manifest = buildRepositoryManifest({
        requestId,
        site,
        pages: pages.items.filter(isPubliclyReadable),
        posts: posts.items.filter(isPubliclyReadable),
        categories,
        tags,
        authors,
        collections: collections.items.filter((collection) => collection.status === 'published'),
        reusableSections: reusableSections.items,
        forms: forms.items,
        media: media.items,
        commerceSettings: settings.integrations?.commerce,
        admin,
        delivery,
      });

      return publicContractJson(manifest, {
        requestId,
        request,
        cache: 'discovery',
        schemaVersion: 'backy.frontend-manifest.v1',
        siteId: site.id,
      });
    }

    const site = getSiteByIdOrSlug(siteId);

    if (!site || !site.isPublished) {
      return errorResponse(404, 'SITE_NOT_FOUND', 'Site not found', requestId);
    }

    const pages = getPageSummary(site.id);
    const posts = getBlogPosts(site.id, { limit: 100 }).posts;
    const collections = listCollections(site.id);
    const forms = listFormsBySite(site.id);
    const reusableSections = listReusableSections(site.id, { status: 'active' });
    const media = getMediaList(site.id, { visibility: 'public', limit: 10000 });
    const categories = listBlogCategories(site.id);
    const tags = listBlogTags(site.id);
    const authors = listBlogAuthors(site.id);
    const fonts = media.media.filter((item) => item.type === 'font');
    const redirectRules = manifestRedirectRules(site.id, site.settings);
    const blogFeeds = blogFeedDiscovery(site);
    const hasCommerceCatalog = collections.some((collection) => collection.slug === PRODUCT_COLLECTION_SLUG && collection.permissions.publicRead);
    const hasPrivateOrders = collections.some((collection) => (
      collection.slug === 'orders' &&
      collection.status === 'published' &&
      !hasPublicOrderCollectionAccess(collection.permissions)
    ));
    const commerce = buildCommerceStorefrontContract({
      siteId: site.id,
      settings: getAdminSettings().integrations?.commerce,
      hasCatalog: hasCommerceCatalog,
      hasOrderIntake: hasCommerceCatalog && hasPrivateOrders,
    });
    const origin = new URL(request.url).origin;
    const interactiveComponents = buildInteractiveComponentManifestContract();
    const delivery = buildDeliveryDiscovery(origin, site);
    const routePatterns = manifestRoutePatterns(site.id, collections);
    const admin = await buildAdminDiscovery(request, site.id, {
      configuredAdminKey: getAdminSettings().apiKeys?.adminApiKey,
    });

    const manifest = {
      success: true,
      requestId,
      data: {
        schemaVersion: 'backy.frontend-manifest.v1',
        generatedAt: new Date().toISOString(),
        site: {
          id: site.id,
          slug: site.slug,
          name: site.name,
          description: site.description,
          customDomain: site.customDomain,
          status: site.status,
          themeTokens: buildBackyThemeTokens(site.theme),
          frontendDesign: site.settings?.frontendDesign || null,
          commentPolicy: normalizeSiteCommentPolicy(site.settings?.commentPolicy),
        },
        contract: {
          version: 'backy.ai-frontend.v1',
          docs: '/specs/ai-frontend-contract/README.md',
          databaseCertification: frontendDatabaseCertification,
          schemas: {
            manifest: 'https://backy.dev/schemas/ai-frontend-contract/frontend-manifest.schema.json',
            renderPayload: 'https://backy.dev/schemas/ai-frontend-contract/content-payload.schema.json',
            themeTokens: 'https://backy.dev/schemas/ai-frontend-contract/theme-tokens.schema.json',
            elementActions: 'https://backy.dev/schemas/ai-frontend-contract/element-actions.schema.json',
            dataBindings: 'https://backy.dev/schemas/ai-frontend-contract/data-bindings.schema.json',
            editableMap: 'https://backy.dev/schemas/ai-frontend-contract/editable-map.schema.json',
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
          uploadedFonts: fonts.length > 0,
          blog: true,
          comments: true,
          forms: true,
          collectionSchemas: true,
          collectionRecords: true,
          commerceCatalog: hasCommerceCatalog,
          commerceOrderIntake: hasCommerceCatalog && hasPrivateOrders,
          commerceProviderCheckout: commerce.capabilities.providerCheckout,
          publicCollectionCreate: collections.some((collection) => collection.permissions.publicCreate),
          collectionWriteForms: forms.some((form) => form.collectionTarget?.enabled),
          dynamicListRoutes: collections.length > 0,
          dynamicItemRoutes: collections.length > 0,
          redirectRoutes: redirectRules.length > 0,
          reusableSections: reusableSections.length > 0,
          frontendDesignContract: Boolean(site.settings?.frontendDesign && site.settings.frontendDesign.status !== 'unconfigured'),
          interactiveComponents: true,
          sandboxedCodeComponents: interactiveComponents.capabilities.customCodeSandbox,
          previewTokens: true,
        },
        endpoints: {
          site: `/api/sites?identifier=${encodeURIComponent(site.slug)}`,
          manifest: `/api/sites/${site.id}/manifest`,
          openapi: `/api/sites/${site.id}/openapi`,
          resolve: `/api/sites/${site.id}/resolve?path=/`,
          render: `/api/sites/${site.id}/render?path=/`,
          seo: `/api/sites/${site.id}/seo`,
          sitemap: `/api/sites/${site.id}/seo?format=sitemap`,
          robots: `/api/sites/${site.id}/seo?format=robots`,
          navigation: `/api/sites/${site.id}/navigation`,
          frontendDesign: `/api/sites/${site.id}/frontend-design`,
          frontendDesignInManifest: `/api/sites/${site.id}/manifest#data.site.frontendDesign`,
          interactiveComponents: `/api/sites/${site.id}/interactive-components`,
          interactiveRuntimeEvents: `/api/sites/${site.id}/interactive-components/runtime-events`,
          interactiveComponentsInManifest: `/api/sites/${site.id}/manifest#data.modules.interactiveComponents`,
          media: `/api/sites/${site.id}/media`,
          mediaFonts: `/api/sites/${site.id}/media/fonts`,
          mediaDetail: `/api/sites/${site.id}/media/{mediaId}`,
          mediaFile: `/api/sites/${site.id}/media/{mediaId}/file`,
          mediaTransform: `/api/sites/${site.id}/media/{mediaId}/transform?width={width}`,
          pages: `/api/sites/${site.id}/pages`,
          liveManagePage: `/api/sites/${site.id}/manage/pages/{pageId}`,
          blog: `/api/sites/${site.id}/blog`,
          blogRss: `/api/sites/${site.id}/blog/rss`,
          blogCategories: `/api/sites/${site.id}/blog/categories`,
          blogTags: `/api/sites/${site.id}/blog/tags`,
          blogAuthors: `/api/sites/${site.id}/blog/authors`,
          commerceCatalog: `/api/sites/${site.id}/commerce/catalog`,
          commerceOrders: `/api/sites/${site.id}/commerce/orders`,
          collections: `/api/sites/${site.id}/collections`,
          reusableSections: `/api/sites/${site.id}/reusable-sections`,
          reusableSectionDetail: `/api/sites/${site.id}/reusable-sections/{sectionId}`,
          forms: `/api/sites/${site.id}/forms`,
          formDetail: `/api/sites/${site.id}/forms/{formId}`,
          formDefinition: `/api/sites/${site.id}/forms/{formId}/definition`,
          formSubmissions: `/api/sites/${site.id}/forms/{formId}/submissions`,
          formContacts: `/api/sites/${site.id}/forms/{formId}/contacts`,
          comments: `/api/sites/${site.id}/comments`,
          pageComments: `/api/sites/${site.id}/pages/{pageId}/comments`,
          pageComment: `/api/sites/${site.id}/pages/{pageId}/comments/{commentId}`,
          blogComments: `/api/sites/${site.id}/blog/{postId}/comments`,
          blogComment: `/api/sites/${site.id}/blog/{postId}/comments/{commentId}`,
          commentReportReasons: `/api/sites/${site.id}/comments/report-reasons`,
          commentReport: `/api/sites/${site.id}/comments/{commentId}/report`,
          events: `/api/sites/${site.id}/events`,
        },
        routePatterns,
        modules: {
          routing: {
            supportedRouteTypes: ['page', 'post', 'dynamicList', 'dynamicItem', 'redirect', 'gone'],
            localizedRoutePatterns: localizedRoutePatternVariants(routePatterns, delivery),
            redirectRules: {
              count: redirectRules.length,
              items: redirectRules,
            },
          },
          theme: buildBackyThemeDiscovery(site.theme),
          liveManagement: buildManifestLiveManagementDiscovery(site.id),
          pages: {
            count: pages.length,
            items: pages.map((page) => ({
              id: page.id,
              title: page.title,
              slug: page.slug,
              path: page.isHomepage || page.slug === 'index' ? '/' : `/${page.slug}`,
              status: page.status,
              renderUrl: `/api/sites/${site.id}/render?path=${encodeURIComponent(page.isHomepage || page.slug === 'index' ? '/' : `/${page.slug}`)}`,
              frontendDesign: contentFrontendDesign(page),
            })),
          },
          pagesRuntime: buildManifestPagesDiscovery(site.id, pages),
          blog: {
            count: posts.length,
            rssUrl: `/api/sites/${site.id}/blog/rss`,
            hostedRssPath: '/blog/rss.xml',
            feeds: blogFeeds,
            items: posts.map((post) => ({
              id: post.id,
              title: post.title,
              slug: post.slug,
              path: `/blog/${post.slug}`,
              status: post.status,
              renderUrl: `/api/sites/${site.id}/render?path=${encodeURIComponent(`/blog/${post.slug}`)}`,
              frontendDesign: contentFrontendDesign(post),
            })),
            categories: categories.map((category) => ({
              id: category.id,
              slug: category.slug,
              name: category.name,
              postCount: category.postCount,
            })),
            tags: tags.map((tag) => ({
              id: tag.id,
              slug: tag.slug,
              name: tag.name,
              postCount: tag.postCount,
            })),
            authors: authors.map((author) => ({
              id: author.id,
              slug: author.slug,
              name: author.name,
              postCount: author.postCount,
            })),
          },
          blogRuntime: buildManifestBlogDiscovery(site.id, posts, categories, tags, authors, blogFeeds),
          collections: collections.map((collection) => ({
            id: collection.id,
            slug: collection.slug,
            name: collection.name,
            status: collection.status,
            permissions: collection.permissions,
            fields: collection.fields.map((field) => ({
              key: field.key,
              label: field.label,
              type: field.type,
              required: field.required,
              unique: field.unique,
              options: field.options,
              referenceCollectionId: field.referenceCollectionId,
            })),
            recordsUrl: `/api/sites/${site.id}/collections/${collection.id}/records`,
            listRoutePattern: collectionListRoutePattern(collection),
            dynamicListRoutePattern: collectionListRoutePattern(collection),
            dynamicListRouteResolveUrl: `/api/sites/${site.id}/resolve?path=${collectionListRoutePattern(collection)}`,
            dynamicListRouteRenderUrl: `/api/sites/${site.id}/render?path=${collectionListRoutePattern(collection)}`,
            routePattern: collectionRoutePattern(collection),
            dynamicRoutePattern: collectionRoutePattern(collection),
            dynamicRouteResolveUrl: `/api/sites/${site.id}/resolve?path=${collectionRoutePattern(collection)}`,
            dynamicRouteRenderUrl: `/api/sites/${site.id}/render?path=${collectionRoutePattern(collection)}`,
            frontendDesign: collectionFrontendDesign(collection),
          })),
          collectionsRuntime: buildManifestCollectionsDiscovery(site.id, collections),
          reusableSections: {
            count: reusableSections.length,
            listUrl: `/api/sites/${site.id}/reusable-sections`,
            categories: Array.from(new Set(reusableSections.map((section) => section.category))).sort(),
            tags: Array.from(new Set(reusableSections.flatMap((section) => section.tags))).sort(),
            items: reusableSections.map((section) => ({
              id: section.id,
              slug: section.slug,
              name: section.name,
              description: section.description,
              category: section.category,
              tags: section.tags,
              detailUrl: `/api/sites/${site.id}/reusable-sections/${section.id}`,
              canvasSize: section.content.canvasSize,
              elementCount: section.content.elements.length,
              frontendDesign: reusableSectionFrontendDesign(section),
            })),
          },
          reusableSectionsRuntime: buildManifestReusableSectionsDiscovery(site.id, reusableSections),
          forms: forms.map((form) => ({
            id: form.id,
            title: form.title,
            active: form.isActive,
            moderationMode: form.moderationMode,
            pageId: form.pageId || null,
            postId: form.postId || null,
            fields: form.fields,
            submitUrl: `/api/sites/${site.id}/forms/${form.id}/submissions`,
            detailUrl: `/api/sites/${site.id}/forms/${form.id}`,
            definitionUrl: `/api/sites/${site.id}/forms/${form.id}/definition`,
            submissionsUrl: `/api/sites/${site.id}/forms/${form.id}/submissions`,
            contactsUrl: `/api/sites/${site.id}/forms/${form.id}/contacts`,
            collectionTarget: form.collectionTarget || null,
            frontendDesign: frontendDesignProvenanceFromMetadata(form.settings),
          })),
          formsRuntime: buildManifestFormsDiscovery(site.id, forms),
          comments: buildManifestCommentDiscovery(site.id, site.settings),
          media: buildManifestMediaDiscovery(site.id, media.media, media.pagination.total, media.pagination.total),
          commerce,
          interactiveComponents,
        },
        admin,
        delivery,
        navigation: getSiteNavigation(site.id),
      },
    };

    return publicContractJson(manifest, {
      requestId,
      request,
      cache: 'discovery',
      schemaVersion: 'backy.frontend-manifest.v1',
      siteId: site.id,
    });
  } catch (error) {
    console.error('Frontend manifest API error:', error);
    return errorResponse(500, 'INTERNAL_SERVER_ERROR', 'Internal server error', requestId);
  }
}
