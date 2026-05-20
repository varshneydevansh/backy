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
import {
  frontendDesignProvenanceFromMetadata,
  frontendFormFieldKeyMapFromMetadata,
} from '@/lib/frontendDesignContract';
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

type ManifestCommerceCollectionDiscoverySource = {
  id: string;
  slug: string;
  name?: string;
  status?: string;
  permissions: {
    publicRead?: boolean;
    publicCreate?: boolean;
    publicUpdate?: boolean;
    publicDelete?: boolean;
  };
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

const envValue = (keys: string[]): { key: string; value: string } | null => {
  for (const key of keys) {
    const value = process.env[key]?.trim();
    if (value) return { key, value };
  }

  return null;
};

const booleanEnvEnabled = (key: string): boolean => {
  const value = process.env[key]?.trim().toLowerCase();
  return value === '1' || value === 'true' || value === 'yes' || value === 'on';
};

type FrontendDatabaseCertificationEnvAlias = 'BACKY_DATABASE_URL' | 'DATABASE_URL';

type FrontendDatabaseCertificationCommandOptions = {
  databaseEnvAlias: FrontendDatabaseCertificationEnvAlias;
  disposableConfirmed: boolean;
  expectedHost: string;
  expectedDatabase: string;
  includeReleaseDoctor: boolean;
};

const FRONTEND_DATABASE_CERTIFICATION_ENV_ALIASES: FrontendDatabaseCertificationEnvAlias[] = ['BACKY_DATABASE_URL', 'DATABASE_URL'];

const DEFAULT_FRONTEND_DATABASE_CERTIFICATION_COMMAND_OPTIONS = {
  databaseEnvAlias: 'BACKY_DATABASE_URL',
  disposableConfirmed: true,
  expectedHost: '',
  expectedDatabase: '',
  includeReleaseDoctor: true,
} satisfies FrontendDatabaseCertificationCommandOptions;

const quoteCertificationShellValue = (value: string): string => `'${value.replace(/'/g, "'\\''")}'`;

const buildFrontendDatabaseCertificationCommand = (options: FrontendDatabaseCertificationCommandOptions): string => {
  const envEntries: Array<[string, string]> = [
    ['BACKY_DATA_MODE', 'database'],
    ['BACKY_SDK_REQUIRE_DATABASE', '1'],
    ['BACKY_DATABASE_DISPOSABLE_CONFIRMED', options.disposableConfirmed ? 'true' : '<confirm-disposable-db-first>'],
  ];

  if (options.includeReleaseDoctor) {
    envEntries.unshift(
      ['BACKY_RELEASE_CERTIFY_DATABASE', '1'],
      ['BACKY_RELEASE_CERTIFICATION_DOCTOR_REQUIRED', '1'],
    );
  }

  const expectedHost = options.expectedHost.trim();
  const expectedDatabase = options.expectedDatabase.trim();
  if (expectedHost) envEntries.push(['BACKY_DATABASE_CERTIFICATION_EXPECTED_HOST', expectedHost]);
  if (expectedDatabase) envEntries.push(['BACKY_DATABASE_CERTIFICATION_EXPECTED_DATABASE', expectedDatabase]);

  return [
    `# Store the disposable database URL in ${options.databaseEnvAlias} as a CI secret or local shell env.`,
    `# export ${options.databaseEnvAlias}='<postgres-url>'`,
    ...envEntries.map(([key, value]) => `export ${key}=${quoteCertificationShellValue(value)}`),
    '',
    ...(options.includeReleaseDoctor ? ['npm run doctor:release-certification'] : []),
    'npm run ci:sdk-postgres-smoke',
  ].join('\n');
};

const FRONTEND_DATABASE_CERTIFICATION_OPERATOR_COMMAND_TEMPLATE = {
  command: buildFrontendDatabaseCertificationCommand(DEFAULT_FRONTEND_DATABASE_CERTIFICATION_COMMAND_OPTIONS),
  databaseUrlAliases: FRONTEND_DATABASE_CERTIFICATION_ENV_ALIASES,
  requiredInputs: [
    'BACKY_DATABASE_URL or DATABASE_URL',
    'BACKY_DATA_MODE=database',
    'BACKY_SDK_REQUIRE_DATABASE=1',
    'BACKY_DATABASE_DISPOSABLE_CONFIRMED=true',
    'BACKY_DATABASE_CERTIFICATION_EXPECTED_HOST',
    'BACKY_DATABASE_CERTIFICATION_EXPECTED_DATABASE',
    'disposable migrated Supabase/Postgres database',
  ],
  targetGuards: [
    'BACKY_DATABASE_CERTIFICATION_EXPECTED_HOST',
    'BACKY_DATABASE_CERTIFICATION_EXPECTED_DATABASE',
  ],
} as const;
const FRONTEND_DATABASE_CERTIFICATION_COVERAGE = [
  'manifest',
  'openapi',
  'render',
  'media',
  'collections',
  'reusable-sections',
  'forms',
  'comments',
  'events',
  'commerce',
  'interactive-components',
  'generated-sdk',
] as const;
const FRONTEND_DATABASE_CERTIFICATION_SCENARIOS = [
  {
    key: 'manifest-openapi-discovery',
    label: 'Manifest and OpenAPI discovery',
    expectedEvidence: ['public manifest response', 'site-scoped OpenAPI response', 'Backy contract headers'],
    nextAction: 'Run the SDK Postgres smoke and attach manifest/OpenAPI response evidence from the disposable database target.',
  },
  {
    key: 'render-route-resolution',
    label: 'Render and route resolution',
    expectedEvidence: ['route resolve response', 'render payload', 'redirect/gone route case'],
    nextAction: 'Verify resolve, redirect/gone, and render payload reads against database-backed pages and posts.',
  },
  {
    key: 'media-font-delivery',
    label: 'Media and font delivery',
    expectedEvidence: ['media list response', 'font manifest response', 'cache/ETag evidence'],
    nextAction: 'Run media/font SDK reads against migrated database media records and public cache headers.',
  },
  {
    key: 'cms-reusable-content',
    label: 'CMS and reusable content',
    expectedEvidence: ['collection schema', 'collection records', 'reusable sections'],
    nextAction: 'Verify collection schemas/records and reusable sections from the disposable database service data.',
  },
  {
    key: 'forms-comments-events',
    label: 'Forms, comments, and events',
    expectedEvidence: ['form definition', 'comment moderation contract', 'interaction event feed'],
    nextAction: 'Exercise public forms, comments, moderation/reporting, and event reads in the SDK Postgres smoke.',
  },
  {
    key: 'commerce-contracts',
    label: 'Commerce contracts',
    expectedEvidence: ['commerce catalog', 'order contract', 'provider certification handoff'],
    nextAction: 'Verify catalog/order contract discovery against database-backed products and private order queues.',
  },
  {
    key: 'interactive-runtime',
    label: 'Interactive runtime',
    expectedEvidence: ['component registry', 'sandbox metadata', 'runtime telemetry endpoint'],
    nextAction: 'Verify interactive registry, sandbox response headers, and telemetry contract reads in database mode.',
  },
  {
    key: 'generated-sdk-cache',
    label: 'Generated SDK and cache',
    expectedEvidence: ['generated TypeScript contract', 'SDK smoke', '304 cache revalidation'],
    nextAction: 'Run generated type checks and SDK cached manifest/OpenAPI/render helpers against the disposable target.',
  },
  {
    key: 'database-runtime-guard',
    label: 'Database runtime guard',
    expectedEvidence: ['database URL alias configured', 'disposable confirmation', 'target host/database guard'],
    nextAction: 'Set the database URL alias, disposable confirmation, and optional expected host/name guards before the DB smoke.',
  },
] as const;

const getFrontendDatabaseCertificationRuntime = () => {
  const databaseUrl = envValue(['BACKY_DATABASE_URL', 'DATABASE_URL']);
  const dataMode = process.env.BACKY_DATA_MODE?.trim() || 'database';
  const databaseType = process.env.BACKY_DATABASE_TYPE?.trim() || (
    databaseUrl?.value.startsWith('mysql') ? 'mysql' : 'postgres'
  );
  const disposableConfirmed = booleanEnvEnabled('BACKY_DATABASE_DISPOSABLE_CONFIRMED');
  const expectedHostConfigured = Boolean(process.env.BACKY_DATABASE_CERTIFICATION_EXPECTED_HOST?.trim());
  const expectedDatabaseConfigured = Boolean(process.env.BACKY_DATABASE_CERTIFICATION_EXPECTED_DATABASE?.trim());
  const missing = [
    ...(dataMode !== 'demo' && !databaseUrl ? ['BACKY_DATABASE_URL or DATABASE_URL'] : []),
    ...(!disposableConfirmed ? ['BACKY_DATABASE_DISPOSABLE_CONFIRMED=true'] : []),
  ];

  return {
    dataMode,
    databaseType,
    databaseUrlConfigured: Boolean(databaseUrl),
    databaseUrlAlias: databaseUrl?.key || null,
    disposableConfirmed,
    expectedHostConfigured,
    expectedDatabaseConfigured,
    readyForCertification: dataMode !== 'demo' && Boolean(databaseUrl) && disposableConfirmed,
    missing,
    secretHandling: 'Database URLs and service credentials are never returned; this runtime summary exposes alias/configuration state only.',
  };
};

const buildFrontendDatabaseCertificationEvidence = (
  runtime: ReturnType<typeof getFrontendDatabaseCertificationRuntime>,
) => {
  const countEvidence = (...values: boolean[]) => values.filter(Boolean).length;
  const coverageSet = new Set<string>(FRONTEND_DATABASE_CERTIFICATION_COVERAGE);
  const evidenceCounts: Record<string, number> = {
    'manifest-openapi-discovery': countEvidence(
      coverageSet.has('manifest'),
      coverageSet.has('openapi'),
      Boolean(FRONTEND_DATABASE_CERTIFICATION_OPERATOR_COMMAND_TEMPLATE.command),
    ),
    'render-route-resolution': countEvidence(coverageSet.has('render')),
    'media-font-delivery': countEvidence(coverageSet.has('media')),
    'cms-reusable-content': countEvidence(
      coverageSet.has('collections'),
      coverageSet.has('reusable-sections'),
    ),
    'forms-comments-events': countEvidence(
      coverageSet.has('forms'),
      coverageSet.has('comments'),
      coverageSet.has('events'),
    ),
    'commerce-contracts': countEvidence(coverageSet.has('commerce')),
    'interactive-runtime': countEvidence(coverageSet.has('interactive-components')),
    'generated-sdk-cache': countEvidence(coverageSet.has('generated-sdk')),
    'database-runtime-guard': countEvidence(
      runtime.databaseUrlConfigured,
      runtime.disposableConfirmed,
      runtime.expectedHostConfigured || runtime.expectedDatabaseConfigured,
      runtime.readyForCertification,
    ),
  };
  const scenarios = FRONTEND_DATABASE_CERTIFICATION_SCENARIOS.map((scenario) => {
    const evidenceCount = evidenceCounts[scenario.key] || 0;
    return {
      ...scenario,
      evidenceCount,
      status: evidenceCount > 0 ? 'covered' as const : 'missing' as const,
    };
  });
  const covered = scenarios.filter((scenario) => scenario.status === 'covered').length;

  return {
    schemaVersion: 'backy.frontend-database-certification-evidence.v1',
    status: covered === scenarios.length ? 'ready' as const : 'attention' as const,
    requiredGate: 'BACKY_DATABASE_DISPOSABLE_CONFIRMED=true npm run ci:sdk-postgres-smoke',
    coverage: {
      covered,
      total: scenarios.length,
      missing: scenarios.filter((scenario) => scenario.status === 'missing').map((scenario) => scenario.key),
    },
    scenarios,
    secretHandling: 'Frontend database certification evidence reports scenario names, counts, gates, and non-secret contract families only; database URLs, service credentials, private orders, submissions, and contact payloads stay private.',
  };
};

const frontendDatabaseCertificationRuntime = getFrontendDatabaseCertificationRuntime();

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
  coverage: [...FRONTEND_DATABASE_CERTIFICATION_COVERAGE],
  scenarioEvidence: buildFrontendDatabaseCertificationEvidence(frontendDatabaseCertificationRuntime),
  runtime: frontendDatabaseCertificationRuntime,
  operatorCommandTemplate: FRONTEND_DATABASE_CERTIFICATION_OPERATOR_COMMAND_TEMPLATE,
  secretHandling: 'Database URLs and service credentials stay in CI/runtime environment; the manifest exposes only non-secret gate names and requirements.',
} as const;

type FrontendLaunchReadinessStatus = 'ready' | 'attention' | 'blocked';

type FrontendLaunchReadinessCheck = {
  key: string;
  label: string;
  status: FrontendLaunchReadinessStatus;
  detail: string;
  nextAction: string;
  gate?: string;
};

const frontendLaunchStatus = (checks: FrontendLaunchReadinessCheck[]): FrontendLaunchReadinessStatus => {
  if (checks.some((check) => check.status === 'blocked')) return 'blocked';
  if (checks.some((check) => check.status === 'attention')) return 'attention';
  return 'ready';
};

const buildFrontendLaunchReadiness = ({
  siteId,
  capabilities,
  endpoints,
  endpointCount,
  routePatternCount,
  moduleCounts,
  databaseCertification,
  commerceProviderCertification,
}: {
  siteId: string;
  capabilities: Record<string, boolean | undefined>;
  endpoints?: Record<string, string>;
  endpointCount?: number;
  routePatternCount: number;
  moduleCounts: {
    pages: number;
    blogPosts: number;
    collections: number;
    reusableSections: number;
    forms: number;
    media: number;
  };
  databaseCertification: typeof frontendDatabaseCertification;
  commerceProviderCertification?: unknown;
}) => {
  const resolvedEndpointCount = endpoints ? Object.keys(endpoints).length : endpointCount || 0;
  const databaseReady = databaseCertification.runtime.readyForCertification;
  const hasCommerceCertification = Boolean(commerceProviderCertification);
  const checks: FrontendLaunchReadinessCheck[] = [
    {
      key: 'routing-render-contracts',
      label: 'Routing, rendering, and OpenAPI',
      status: capabilities.routeResolve && capabilities.renderPayload && capabilities.openApi ? 'ready' : 'blocked',
      detail: `${routePatternCount} route pattern${routePatternCount === 1 ? '' : 's'} and ${resolvedEndpointCount} endpoint contract${resolvedEndpointCount === 1 ? '' : 's'} are advertised for this site.`,
      nextAction: 'Wire custom frontend routing through manifest, resolve, render, and OpenAPI before building page-specific clients.',
    },
    {
      key: 'content-design-modules',
      label: 'CMS, design, and reusable content',
      status: capabilities.collectionSchemas && capabilities.collectionRecords && capabilities.reusableSections ? 'ready' : 'attention',
      detail: `${moduleCounts.pages} page${moduleCounts.pages === 1 ? '' : 's'}, ${moduleCounts.blogPosts} blog post${moduleCounts.blogPosts === 1 ? '' : 's'}, ${moduleCounts.collections} public collection${moduleCounts.collections === 1 ? '' : 's'}, and ${moduleCounts.reusableSections} reusable section${moduleCounts.reusableSections === 1 ? '' : 's'} are discoverable.`,
      nextAction: 'Publish representative pages, collection records, and reusable sections so custom frontends can render realistic site shapes.',
    },
    {
      key: 'media-font-delivery',
      label: 'Media, files, and fonts',
      status: capabilities.mediaLibrary ? 'ready' : 'blocked',
      detail: `${moduleCounts.media} public media asset${moduleCounts.media === 1 ? '' : 's'} are visible; font discovery is ${capabilities.uploadedFonts ? 'available' : 'empty for this site'}.`,
      nextAction: 'Use the media and font endpoints for frontend assets; keep private file delivery behind signed URLs.',
    },
    {
      key: 'visitor-interactions',
      label: 'Forms, comments, and events',
      status: capabilities.forms || capabilities.comments ? 'ready' : 'attention',
      detail: `${moduleCounts.forms} active form${moduleCounts.forms === 1 ? '' : 's'} are exposed; comments and events contracts remain available through public interaction endpoints.`,
      nextAction: 'Bind frontend forms/comments to Backy public endpoints and keep submissions, contacts, and moderation queues private.',
    },
    {
      key: 'commerce-handoff',
      label: 'Commerce and provider handoff',
      status: capabilities.commerceCatalog && capabilities.commerceOrderIntake ? 'ready' : capabilities.commerceCatalog ? 'attention' : 'attention',
      detail: capabilities.commerceCatalog
        ? `Commerce catalog is exposed and order intake is ${capabilities.commerceOrderIntake ? 'available' : 'waiting on a private orders queue'}.`
        : 'No public product catalog is exposed for this site yet.',
      nextAction: 'Publish the product catalog and keep orders private before connecting storefront checkout flows.',
      gate: hasCommerceCertification ? 'npm run ci:commerce-provider-certification' : undefined,
    },
    {
      key: 'live-management',
      label: 'Preview and live management',
      status: capabilities.previewTokens && Boolean(endpoints?.liveManagePage || endpoints?.liveManagePost) ? 'ready' : 'attention',
      detail: 'Preview-token reads and live page/blog management endpoint templates let authenticated custom frontends edit without admin UI scraping.',
      nextAction: 'Use manifest live-management endpoint templates with authenticated sessions for frontend editing overlays.',
    },
    {
      key: 'database-certification',
      label: 'Database certification',
      status: databaseReady ? 'ready' : 'blocked',
      detail: databaseReady
        ? 'Disposable database confirmation and database URL alias are present for SDK certification.'
        : `SDK Postgres certification still needs ${databaseCertification.runtime.missing.join(', ') || 'a disposable migrated database target'}.`,
      nextAction: 'Run the disposable SDK Postgres smoke before treating manifest/OpenAPI/SDK service data as production certified.',
      gate: databaseCertification.gate.command,
    },
  ];
  const score = Math.round((checks.filter((check) => check.status === 'ready').length / checks.length) * 100);
  const blockingChecks = checks.filter((check) => check.status === 'blocked');
  const attentionChecks = checks.filter((check) => check.status === 'attention');

  return {
    generatedAt: new Date().toISOString(),
    schemaVersion: 'backy.frontend-launch-readiness.v1',
    status: frontendLaunchStatus(checks),
    score,
    siteId,
    endpointCount: resolvedEndpointCount,
    routePatternCount,
    moduleCounts,
    checks,
    actionPlan: {
      schemaVersion: 'backy.frontend-launch-action-plan.v1',
      nextAction: [...blockingChecks, ...attentionChecks][0]?.nextAction || 'Custom frontend contract is ready; keep SDK/database certification evidence attached to releases.',
      blockingChecks: blockingChecks.map((check) => check.key),
      attentionChecks: attentionChecks.map((check) => check.key),
      recommendedCommands: Array.from(new Set([...blockingChecks, ...attentionChecks].map((check) => check.gate).filter((gate): gate is string => Boolean(gate)))),
    },
    privacy: {
      includesSecretValues: false,
      publicManifestExcludesPrivateQueues: true,
      adminEndpointsRequireAuth: true,
      submissionAndOrderPayloadsPrivate: true,
      secretHandling: 'Launch readiness exposes endpoint templates, booleans, counts, schema names, and certification gates only; database URLs, provider keys, order records, and submission values are never returned.',
    },
  };
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
  liveManagePost: `/api/sites/${siteId}/manage/blog/{postId}`,
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
      folders: `/api/sites/${siteId}/media/folders`,
      fonts: `/api/sites/${siteId}/media/fonts`,
      detail: `/api/sites/${siteId}/media/{mediaId}`,
      file: `/api/sites/${siteId}/media/{mediaId}/file`,
      transform: `/api/sites/${siteId}/media/{mediaId}/transform?width={width}`,
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
      types,
      typeAliases: {
        file: 'document',
      },
      visibility: ['public', 'private'],
      scopes: ['global', 'page', 'post'],
      queryParams: [
        'type',
        'q',
        'search',
        'tag',
        'folder',
        'folderId',
        'scope',
        'pageId',
        'postId',
        'blogId',
        'global',
        'limit',
        'offset',
      ],
      maxLimit: 100,
      aliases: {
        q: 'search',
        folder: 'folderId',
        blogId: 'postId',
        fileType: 'document',
      },
    },
    methods: {
      list: 'GET',
      folders: 'GET',
      fonts: 'GET',
      detail: 'GET',
      file: 'GET',
      transform: 'GET',
    },
    cache: {
      list: 'public-discovery',
      folders: 'public-discovery',
      fonts: 'public-discovery',
      detail: 'public-discovery',
      file: 'public-or-signed',
      transform: 'public-redirect',
    },
    schemas: {
      list: 'backy.media-discovery.v1',
      folders: 'backy.media-folders.v1',
      fonts: 'backy.font-manifest.v1',
      references: 'backy.media.references.v1',
      editableMetadata: 'backy.media.editable-metadata.v1',
      notFound: 'MEDIA_NOT_FOUND',
    },
  };
};

const buildManifestLiveManagementDiscovery = (siteId: string) => ({
  schemaVersion: 'backy.live-management.v1',
  enabled: true,
  endpoints: {
    page: `/api/sites/${siteId}/manage/pages/{pageId}`,
    post: `/api/sites/${siteId}/manage/blog/{postId}`,
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
    postMetadata: true,
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
    expectedUpdatedAt: 'Use the current page or post updatedAt value for optimistic conflict protection.',
    content: 'Send the full Backy content document or canvas content object after applying editable-map changes.',
  },
  errors: {
    conflict: 'PAGE_VERSION_CONFLICT',
    postConflict: 'BLOG_VERSION_CONFLICT',
    forbidden: 'FORBIDDEN_LIVE_MANAGE_SITE_SCOPE',
    postForbidden: 'FORBIDDEN_LIVE_MANAGE_BLOG_SCOPE',
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
    liveManage: `/api/sites/${siteId}/manage/blog/{postId}`,
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
    liveManageRead: 'GET',
    liveManageUpdate: 'PATCH',
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
    liveManagement: true,
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

const buildManifestCommerceDiscovery = (
  siteId: string,
  commerce: ReturnType<typeof buildCommerceStorefrontContract>,
  productCollection: ManifestCommerceCollectionDiscoverySource | undefined,
  ordersCollection: ManifestCommerceCollectionDiscoverySource | undefined,
) => ({
  schemaVersion: 'backy.commerce-discovery.v1',
  enabled: commerce.capabilities.catalog,
  mode: commerce.mode,
  currency: commerce.currency,
  paymentProvider: commerce.paymentProvider,
  catalogCollection: productCollection
    ? {
        id: productCollection.id,
        slug: productCollection.slug,
        name: productCollection.name || productCollection.slug,
        status: productCollection.status || 'published',
        publicRead: productCollection.permissions.publicRead === true,
      }
    : null,
  ordersCollection: ordersCollection
    ? {
        id: ordersCollection.id,
        slug: ordersCollection.slug,
        name: ordersCollection.name || ordersCollection.slug,
        status: ordersCollection.status || 'published',
        publicRead: ordersCollection.permissions.publicRead === true,
      }
    : null,
  endpoints: {
    catalog: `/api/sites/${siteId}/commerce/catalog`,
    productDetail: `/api/sites/${siteId}/commerce/catalog?slug={slug}`,
    orderContract: `/api/sites/${siteId}/commerce/orders`,
    createOrder: `/api/sites/${siteId}/commerce/orders`,
    providerWebhook: `/api/sites/${siteId}/commerce/webhook`,
    productCollectionRecords: `/api/sites/${siteId}/collections/${PRODUCT_COLLECTION_SLUG}/records`,
  },
  methods: {
    catalog: 'GET',
    productDetail: 'GET',
    orderContract: 'GET',
    createOrder: 'POST',
    providerWebhook: 'POST',
  },
  capabilities: {
    catalog: commerce.capabilities.catalog,
    orderIntake: commerce.capabilities.orderIntake,
    providerCheckout: commerce.capabilities.providerCheckout,
    productFilters: true,
    productFacets: true,
    inventoryReservations: commerce.inventory.reservations,
    pricingRules: true,
    guestCheckout: commerce.checkout.guestCheckout,
    providerWebhooks: commerce.webhooks.eventsEnabled,
    providerCertification: true,
    conditionalRequests: true,
    cacheableCatalog: true,
  },
  orderRequest: {
    schemaVersion: 'backy.commerce-order-request.v1',
    contentType: 'application/json',
    itemArrays: ['items', 'lineItems', 'cartItems', 'cart.items'],
    itemFields: {
      productId: ['productId', 'product_id'],
      slug: ['slug', 'productSlug', 'product_slug'],
      variantId: ['variantId', 'variant_id'],
      variantSku: ['variantSku', 'variant_sku', 'sku'],
      quantity: ['quantity', 'qty'],
    },
    customer: [
      'customer.name/customer.email/customer.phone',
      'customerName/customerEmail/customerPhone',
      'name/email/phone',
    ],
    discountCode: ['discountCode', 'couponCode', 'promoCode'],
    payment: [
      'paymentProvider/paymentReference',
      'payment.provider/payment.reference',
    ],
    checkoutSessionId: [
      'checkoutSessionId',
      'checkoutSession',
      'checkoutSession.id',
    ],
    quantity: {
      default: 1,
      minimum: 1,
      maximum: 999,
    },
    required: [
      'customer.name',
      'customer.email',
      'items[].productId or items[].slug',
    ],
    checkoutSessionStatuses: [
      'requires_action',
      'provider_ready',
      'provider_created',
    ],
  },
  cache: {
    catalog: 'public-discovery',
    productDetail: 'public-discovery',
    orderContract: 'public-discovery',
    createOrder: 'private-no-store',
    providerWebhook: 'private-no-store',
  },
  privacy: {
    publicCatalogExcludesPrivateOrderQueue: true,
    ordersCollectionMustRemainPrivate: true,
    publicOrderPayloadContainsCustomerData: true,
    providerSecretsNeverReturned: true,
  },
  filters: {
    queryParams: ['slug', 'limit', 'offset', 'sortBy', 'sortDirection', 'q', 'search', 'category', 'tag', 'vendor', 'productType', 'featured'],
    maxLimit: 100,
    sortDirections: ['asc', 'desc'],
    productTypes: ['physical', 'digital', 'service'],
  },
  schemas: {
    catalog: 'backy.commerce-catalog.v1',
    settings: 'backy.commerce-settings.v1',
    orderContract: 'backy.commerce-orders.v1',
    product: 'backy.commerce-product.v1',
    providerCertification: 'backy.commerce-provider-certification-handoff.v1',
    productCatalogNotFound: 'PRODUCT_CATALOG_NOT_FOUND',
    productNotFound: 'PRODUCT_NOT_FOUND',
    orderQueueNotFound: 'ORDER_QUEUE_NOT_FOUND',
    orderQueueNotPrivate: 'ORDER_QUEUE_NOT_PRIVATE',
    validationError: 'VALIDATION_ERROR',
    productOutOfStock: 'PRODUCT_OUT_OF_STOCK',
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
  const productCollection = publicCollections.find((collection) => collection.slug === PRODUCT_COLLECTION_SLUG);
  const ordersCollection = input.collections.find((collection) => collection.slug === 'orders');
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

  const manifest = {
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
        frontendLaunchReadiness: null as ReturnType<typeof buildFrontendLaunchReadiness> | null,
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
        mediaFolders: `/api/sites/${input.site.id}/media/folders`,
        mediaFonts: `/api/sites/${input.site.id}/media/fonts`,
        mediaDetail: `/api/sites/${input.site.id}/media/{mediaId}`,
        mediaFile: `/api/sites/${input.site.id}/media/{mediaId}/file`,
        mediaTransform: `/api/sites/${input.site.id}/media/{mediaId}/transform?width={width}`,
        pages: `/api/sites/${input.site.id}/pages`,
        liveManagePage: `/api/sites/${input.site.id}/manage/pages/{pageId}`,
        liveManagePost: `/api/sites/${input.site.id}/manage/blog/{postId}`,
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
            liveManageUrl: `/api/sites/${input.site.id}/manage/blog/${post.id}`,
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
          frontendFieldKeyMap: frontendFormFieldKeyMapFromMetadata(form.settings),
        })),
        formsRuntime: buildManifestFormsDiscovery(input.site.id, input.forms),
        comments: buildManifestCommentDiscovery(input.site.id, input.site.settings),
        media: buildManifestMediaDiscovery(input.site.id, input.media, input.media.length, input.media.length),
        commerce,
        commerceRuntime: buildManifestCommerceDiscovery(input.site.id, commerce, productCollection, ordersCollection),
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

  manifest.data.contract.frontendLaunchReadiness = buildFrontendLaunchReadiness({
    siteId: input.site.id,
    capabilities: manifest.data.capabilities,
    endpoints: manifest.data.endpoints,
    routePatternCount: routePatterns.length,
    moduleCounts: {
      pages: input.pages.length,
      blogPosts: input.posts.length,
      collections: publicCollections.length,
      reusableSections: input.reusableSections.length,
      forms: input.forms.length,
      media: input.media.length,
    },
    databaseCertification: frontendDatabaseCertification,
    commerceProviderCertification: commerce.providerCertification,
  });

  return manifest;
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
    const productCollection = collections.find((collection) => collection.slug === PRODUCT_COLLECTION_SLUG && collection.permissions.publicRead);
    const ordersCollection = collections.find((collection) => collection.slug === 'orders');
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
          frontendLaunchReadiness: null as ReturnType<typeof buildFrontendLaunchReadiness> | null,
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
          mediaFolders: `/api/sites/${site.id}/media/folders`,
          mediaFonts: `/api/sites/${site.id}/media/fonts`,
          mediaDetail: `/api/sites/${site.id}/media/{mediaId}`,
          mediaFile: `/api/sites/${site.id}/media/{mediaId}/file`,
          mediaTransform: `/api/sites/${site.id}/media/{mediaId}/transform?width={width}`,
          pages: `/api/sites/${site.id}/pages`,
          liveManagePage: `/api/sites/${site.id}/manage/pages/{pageId}`,
          liveManagePost: `/api/sites/${site.id}/manage/blog/{postId}`,
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
              liveManageUrl: `/api/sites/${site.id}/manage/blog/${post.id}`,
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
          commerceRuntime: buildManifestCommerceDiscovery(site.id, commerce, productCollection, ordersCollection),
          interactiveComponents,
        },
        admin,
        delivery,
        navigation: getSiteNavigation(site.id),
      },
    };

    manifest.data.contract.frontendLaunchReadiness = buildFrontendLaunchReadiness({
      siteId: site.id,
      capabilities: manifest.data.capabilities,
      endpoints: manifest.data.endpoints,
      routePatternCount: routePatterns.length,
      moduleCounts: {
        pages: pages.length,
        blogPosts: posts.length,
        collections: collections.length,
        reusableSections: reusableSections.length,
        forms: forms.length,
        media: media.pagination.total,
      },
      databaseCertification: frontendDatabaseCertification,
      commerceProviderCertification: commerce.providerCertification,
    });

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
