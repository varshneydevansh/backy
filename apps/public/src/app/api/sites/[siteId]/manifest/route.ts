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
  settings?: Pick<SiteSettings, 'domainVerification'> | null;
};

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
    defaultLocale: 'en',
    localeStrategy: 'none',
    locales: [
      {
        code: 'en',
        label: 'English',
        default: true,
        direction: 'ltr',
        pathPrefix: '',
      },
    ],
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
        themeTokens: input.site.theme,
        frontendDesign: input.site.settings?.frontendDesign || null,
        commentPolicy: normalizeSiteCommentPolicy(input.site.settings?.commentPolicy),
      },
      contract: {
        version: 'backy.ai-frontend.v1',
        docs: '/specs/ai-frontend-contract/README.md',
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
        media: `/api/sites/${input.site.id}/media`,
        mediaFonts: `/api/sites/${input.site.id}/media/fonts`,
        mediaDetail: `/api/sites/${input.site.id}/media/{mediaId}`,
        mediaFile: `/api/sites/${input.site.id}/media/{mediaId}/file`,
        mediaTransform: `/api/sites/${input.site.id}/media/{mediaId}/transform?width={width}`,
        pages: `/api/sites/${input.site.id}/pages`,
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
      routePatterns: [
        {
          type: 'page',
          pattern: '/:pageSlug',
          resolveUrl: `/api/sites/${input.site.id}/resolve?path=/:pageSlug`,
          renderUrl: `/api/sites/${input.site.id}/render?path=/:pageSlug`,
        },
        {
          type: 'blogPost',
          pattern: '/blog/:postSlug',
          resolveUrl: `/api/sites/${input.site.id}/resolve?path=/blog/:postSlug`,
          renderUrl: `/api/sites/${input.site.id}/render?path=/blog/:postSlug`,
        },
        ...dynamicCollectionRoutePatterns(input.site.id, publicCollections),
      ],
      modules: {
        routing: {
          supportedRouteTypes: ['page', 'post', 'dynamicList', 'dynamicItem', 'redirect', 'gone'],
          redirectRules: {
            count: redirectRules.length,
            items: redirectRules,
          },
        },
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
        media: {
          count: input.media.length,
          publicCount: input.media.length,
          fontCount: fonts.length,
          types: Array.from(new Set(input.media.map((item) => item.type))).sort(),
          listUrl: `/api/sites/${input.site.id}/media`,
        },
        commerce,
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
        delivery: buildDeliveryDiscovery(origin, site),
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
    const admin = await buildAdminDiscovery(request, site.id, {
      configuredAdminKey: getAdminSettings().apiKeys?.adminApiKey,
    });
    const origin = new URL(request.url).origin;

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
          themeTokens: site.theme,
          frontendDesign: site.settings?.frontendDesign || null,
          commentPolicy: normalizeSiteCommentPolicy(site.settings?.commentPolicy),
        },
        contract: {
          version: 'backy.ai-frontend.v1',
          docs: '/specs/ai-frontend-contract/README.md',
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
          media: `/api/sites/${site.id}/media`,
          mediaFonts: `/api/sites/${site.id}/media/fonts`,
          mediaDetail: `/api/sites/${site.id}/media/{mediaId}`,
          mediaFile: `/api/sites/${site.id}/media/{mediaId}/file`,
          mediaTransform: `/api/sites/${site.id}/media/{mediaId}/transform?width={width}`,
          pages: `/api/sites/${site.id}/pages`,
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
        routePatterns: [
          {
            type: 'page',
            pattern: '/:pageSlug',
            resolveUrl: `/api/sites/${site.id}/resolve?path=/:pageSlug`,
            renderUrl: `/api/sites/${site.id}/render?path=/:pageSlug`,
          },
          {
            type: 'blogPost',
            pattern: '/blog/:postSlug',
            resolveUrl: `/api/sites/${site.id}/resolve?path=/blog/:postSlug`,
            renderUrl: `/api/sites/${site.id}/render?path=/blog/:postSlug`,
          },
          ...dynamicCollectionRoutePatterns(site.id, collections),
        ],
        modules: {
          routing: {
            supportedRouteTypes: ['page', 'post', 'dynamicList', 'dynamicItem', 'redirect', 'gone'],
            redirectRules: {
              count: redirectRules.length,
              items: redirectRules,
            },
          },
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
          media: {
            count: media.pagination.total,
            publicCount: media.pagination.total,
            fontCount: fonts.length,
            types: Array.from(new Set(media.media.map((item) => item.type))).sort(),
            listUrl: `/api/sites/${site.id}/media`,
          },
          commerce,
        },
        admin,
        delivery: buildDeliveryDiscovery(origin, site),
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
