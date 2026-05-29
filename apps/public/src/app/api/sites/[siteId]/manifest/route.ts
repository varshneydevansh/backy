/**
 * Public site manifest for custom/generated frontends.
 *
 * GET /api/sites/[siteId]/manifest
 */

import { NextRequest } from 'next/server';
import {
  buildBackyThemeDiscovery,
  buildBackyThemeTokens,
  type BackyBlogAuthor,
  type BackyBlogCategory,
  type BackyBlogTag,
  type BackyCollection,
  type BackyPage,
  type BackyPost,
  type BackyReusableSection,
  type FormDefinition,
  type MediaItem,
  type Site,
  type SiteSettings,
} from '@backy-cms/core';
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
import { NEWSLETTER_SUBSCRIBERS_SCHEMA_VERSION, isNewsletterForm } from '@/lib/newsletterSubscribers';
import { normalizeRedirectRules } from '@/lib/redirectRules';
import { getAdminSessionWithPersistence, listAdminSessionPermissionOverrides } from '@/lib/admin-auth/sessionStore';
import { buildUserPermissionMatrix, isOwnerOnlyAdminPermission, type AdminUserPermissionMatrix } from '@/lib/adminPermissions';
import { getHostedRouteUrl, getSiteCanonicalBaseUrl } from '@/lib/seoDiscovery';
import { buildInteractiveComponentManifestContract } from '@/lib/interactiveComponentRegistry';
import { localizedRoutePatternVariants, normalizeSiteLocalization, type PublicRoutePattern } from '@/lib/siteLocalization';
import { liveManagementEditorCommandRegistry } from '@/lib/liveManagementEditorCommandRegistry';
import { buildBackyPartialClosureReadiness } from '@/lib/completionStatusClosure';
import { buildCustomFrontendAgentHandoff } from '@/lib/customFrontendAgentHandoff';

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
const quoteCertificationEnvTemplateValue = (value: string): string => (
  /^[A-Za-z0-9_./:@-]+$/.test(value) ? value : quoteCertificationShellValue(value)
);

const buildFrontendDatabaseCertificationEnvEntries = (
  options: FrontendDatabaseCertificationCommandOptions,
): Array<[string, string]> => {
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

  return envEntries;
};

const buildFrontendDatabaseCertificationCommand = (options: FrontendDatabaseCertificationCommandOptions): string => {
  const envEntries = buildFrontendDatabaseCertificationEnvEntries(options);

  return [
    `# Store the disposable database URL in ${options.databaseEnvAlias} as a CI secret or local shell env.`,
    `# export ${options.databaseEnvAlias}='<postgres-url>'`,
    ...envEntries.map(([key, value]) => `export ${key}=${quoteCertificationShellValue(value)}`),
    '',
    ...(options.includeReleaseDoctor ? ['npm run doctor:release-certification'] : []),
    'npm run ci:sdk-postgres-smoke',
  ].join('\n');
};

const buildFrontendDatabaseCertificationEnvTemplate = (options: FrontendDatabaseCertificationCommandOptions): string => {
  const envEntries = buildFrontendDatabaseCertificationEnvEntries(options);

  return [
    '# Backy frontend SDK database certification environment',
    '# Keep the disposable database URL in CI secrets or local shell variables.',
    `${options.databaseEnvAlias}=<disposable-postgres-url>`,
    ...envEntries.map(([key, value]) => `${key}=${quoteCertificationEnvTemplateValue(value)}`),
  ].join('\n');
};

const FRONTEND_DATABASE_CERTIFICATION_OPERATOR_COMMAND_TEMPLATE = {
  command: buildFrontendDatabaseCertificationCommand(DEFAULT_FRONTEND_DATABASE_CERTIFICATION_COMMAND_OPTIONS),
  envTemplate: buildFrontendDatabaseCertificationEnvTemplate(DEFAULT_FRONTEND_DATABASE_CERTIFICATION_COMMAND_OPTIONS),
  envTemplateSchemaVersion: 'backy.frontend-database-certification-env-template.v1',
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
  secretHandling: 'Disposable database URLs stay in CI secrets or local shell environment variables; this template only emits non-secret aliases and placeholders.',
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
  operatorEnvTemplate: {
    schemaVersion: 'backy.frontend-database-certification-env-template.v1',
    format: 'shell-env',
    fileName: '.env.backy-frontend-database-certification',
    body: FRONTEND_DATABASE_CERTIFICATION_OPERATOR_COMMAND_TEMPLATE.envTemplate,
    secretHandling: 'Generated template values are non-secret aliases and placeholders; replace the database URL placeholder with a disposable migrated Supabase/Postgres secret before execution.',
  },
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
    fonts: number;
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
      detail: `${moduleCounts.media} public media asset${moduleCounts.media === 1 ? '' : 's'} and ${moduleCounts.fonts} font asset${moduleCounts.fonts === 1 ? '' : 's'} are visible; font discovery is ${capabilities.uploadedFonts ? 'available' : 'empty for this site'}.`,
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
      recommendedCommands: Array.from(new Set(checks.map((check) => check.gate).filter((gate): gate is string => Boolean(gate)))),
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

const buildBackyCompletionStatus = () => {
  const databaseUrlConfigured = Boolean(envValue(['BACKY_DATABASE_URL', 'DATABASE_URL']));
  const settingsProviderFamilies = {
    database: databaseUrlConfigured,
    supabase: Boolean(envValue(['BACKY_SUPABASE_URL', 'SUPABASE_URL'])) && Boolean(envValue(['BACKY_SUPABASE_SERVICE_ROLE_KEY', 'SUPABASE_SERVICE_ROLE_KEY'])),
    storage: Boolean(envValue(['BACKY_MEDIA_STORAGE_PROVIDER', 'BACKY_STORAGE_PROVIDER', 'AWS_ACCESS_KEY_ID', 'SUPABASE_SERVICE_ROLE_KEY'])),
    vercel: Boolean(envValue(['BACKY_VERCEL_TOKEN', 'VERCEL_TOKEN'])),
    notifications: Boolean(envValue(['BACKY_EMAIL_DELIVERY_ENDPOINT', 'BACKY_TRANSACTIONAL_EMAIL_WEBHOOK_URL', 'BACKY_RESEND_API_KEY', 'RESEND_API_KEY', 'SMTP_HOST'])),
    commerce: Boolean(envValue(['BACKY_STRIPE_SECRET_KEY', 'STRIPE_SECRET_KEY', 'BACKY_PAYPAL_ACCESS_TOKEN', 'PAYPAL_ACCESS_TOKEN', 'BACKY_COMMERCE_WEBHOOK_SECRET', 'COMMERCE_WEBHOOK_SECRET'])),
  };
  const commerceProviderFamilies = {
    payment: Boolean(envValue(['BACKY_STRIPE_SECRET_KEY', 'STRIPE_SECRET_KEY', 'BACKY_PAYPAL_ACCESS_TOKEN', 'PAYPAL_ACCESS_TOKEN', 'BACKY_PADDLE_API_KEY', 'PADDLE_API_KEY', 'BACKY_SQUARE_ACCESS_TOKEN', 'SQUARE_ACCESS_TOKEN', 'BACKY_ADYEN_API_KEY', 'ADYEN_API_KEY', 'BACKY_MOLLIE_API_KEY', 'MOLLIE_API_KEY', 'BACKY_RAZORPAY_KEY_ID', 'RAZORPAY_KEY_ID'])),
    tax: Boolean(envValue(['BACKY_TAXJAR_API_KEY', 'TAXJAR_API_KEY', 'BACKY_AVALARA_ACCOUNT_ID', 'AVALARA_ACCOUNT_ID', 'BACKY_STRIPE_SECRET_KEY', 'STRIPE_SECRET_KEY'])),
    shipping: Boolean(envValue(['BACKY_EASYPOST_API_KEY', 'EASYPOST_API_KEY', 'BACKY_SHIPPO_API_KEY', 'SHIPPO_API_KEY'])),
    discount: Boolean(envValue(['BACKY_COMMERCE_DISCOUNT_PROVIDER_URL', 'COMMERCE_DISCOUNT_PROVIDER_URL', 'BACKY_STRIPE_SECRET_KEY', 'STRIPE_SECRET_KEY'])),
    catalog: Boolean(envValue(['BACKY_COMMERCE_PRODUCT_SYNC_URL', 'COMMERCE_PRODUCT_SYNC_URL', 'BACKY_SHOPIFY_ADMIN_ACCESS_TOKEN', 'SHOPIFY_ADMIN_ACCESS_TOKEN', 'BACKY_BIGCOMMERCE_ACCESS_TOKEN', 'BIGCOMMERCE_ACCESS_TOKEN', 'BACKY_WOOCOMMERCE_CONSUMER_KEY', 'WOOCOMMERCE_CONSUMER_KEY', 'BACKY_ETSY_ACCESS_TOKEN', 'ETSY_ACCESS_TOKEN'])),
    subscription: Boolean(envValue(['BACKY_COMMERCE_SUBSCRIPTION_ACTION_URL', 'COMMERCE_SUBSCRIPTION_ACTION_URL', 'BACKY_STRIPE_SECRET_KEY', 'STRIPE_SECRET_KEY', 'BACKY_PAYPAL_ACCESS_TOKEN', 'PAYPAL_ACCESS_TOKEN', 'BACKY_PADDLE_API_KEY', 'PADDLE_API_KEY'])),
    webhook: Boolean(envValue(['BACKY_COMMERCE_WEBHOOK_SECRET', 'COMMERCE_WEBHOOK_SECRET'])),
  };
  const configuredSettingsFamilies = Object.entries(settingsProviderFamilies)
    .filter(([, configured]) => configured)
    .map(([family]) => family);
  const missingSettingsFamilies = Object.entries(settingsProviderFamilies)
    .filter(([, configured]) => !configured)
    .map(([family]) => family);
  const configuredCommerceFamilies = Object.entries(commerceProviderFamilies)
    .filter(([, configured]) => configured)
    .map(([family]) => family);
  const missingCommerceFamilies = Object.entries(commerceProviderFamilies)
    .filter(([, configured]) => !configured)
    .map(([family]) => family);
  const certifiedDatabaseGates = [
    {
      key: 'forms-postgres',
      label: 'Forms Supabase/Postgres persistence',
      status: 'certified',
      command: 'npm run ci:forms-postgres',
      workflow: '.github/workflows/forms-postgres-contract.yml',
      affectedSurfaces: ['/forms'],
      certifiedAt: '2026-05-21',
      evidence: 'Passed against a migrated disposable local Postgres target with form definition, submission, contact, spam/consent, moderation, promotion, and cleanup coverage.',
    },
    {
      key: 'sdk-postgres',
      label: 'Frontend manifest/OpenAPI/SDK Supabase/Postgres smoke',
      status: 'certified',
      command: 'npm run ci:sdk-postgres-smoke',
      workflow: '.github/workflows/sdk-postgres-smoke.yml',
      affectedSurfaces: ['Frontend manifest/OpenAPI/SDK APIs'],
      certifiedAt: '2026-05-21',
      evidence: 'Passed against a migrated disposable local Postgres target with database-mode discovery, manifest, OpenAPI, render, media, CMS, forms, comments, events, commerce, and SDK write-flow coverage.',
    },
  ] as const;

  const gates = [
    {
      key: 'settings-provider-certification',
      label: 'Settings live provider certification',
      status: missingSettingsFamilies.length === 0 ? 'ready-to-run' : 'blocked-missing-inputs',
      command: 'npm run ci:settings-provider-certification',
      preflight: 'npm run test:settings-provider-certification-preflight-contract',
      workflow: '.github/workflows/settings-provider-certification.yml',
      affectedSurfaces: ['/settings', 'Settings admin APIs'],
      requiredEnvAliases: [
        'BACKY_DATABASE_URL or DATABASE_URL',
        'BACKY_SUPABASE_URL or SUPABASE_URL',
        'BACKY_SUPABASE_SERVICE_ROLE_KEY or SUPABASE_SERVICE_ROLE_KEY',
        'BACKY_VERCEL_TOKEN or VERCEL_TOKEN',
        'notification provider aliases',
        'commerce provider aliases',
      ],
      runtime: {
        configuredFamilies: configuredSettingsFamilies,
        missingFamilies: missingSettingsFamilies,
      },
    },
    {
      key: 'commerce-provider-certification',
      label: 'Commerce live provider certification',
      status: missingCommerceFamilies.length === 0 ? 'ready-to-run' : 'blocked-missing-inputs',
      command: 'npm run ci:commerce-provider-certification',
      preflight: 'npm run test:commerce-provider-certification-preflight-contract',
      workflow: '.github/workflows/commerce-provider-certification.yml',
      affectedSurfaces: ['/products', '/orders'],
      requiredEnvAliases: [
        'payment provider aliases',
        'tax provider aliases',
        'shipping provider aliases',
        'discount provider aliases',
        'catalog provider aliases',
        'subscription provider aliases',
        'BACKY_COMMERCE_WEBHOOK_SECRET or COMMERCE_WEBHOOK_SECRET',
      ],
      runtime: {
        configuredFamilies: configuredCommerceFamilies,
        missingFamilies: missingCommerceFamilies,
      },
    },
  ] as const;
  const settingsCertificationEvidenceArtifacts = [
    {
      key: 'settings-provider-certification-json',
      label: 'Settings provider certification evidence',
      workflow: '.github/workflows/settings-provider-certification.yml',
      alternateWorkflows: ['.github/workflows/backy-release-certification.yml'],
      artifactName: 'backy-settings-provider-certification-evidence',
      path: 'artifacts/backy-settings-provider-certification.json',
      schemaVersion: 'backy.settings-provider-certification-artifact.v1',
      producerEnv: 'BACKY_SETTINGS_CERTIFICATION_OUTPUT',
      requiredForReady: true,
      includesSecretValues: false,
    },
  ] as const;
  const commerceCertificationEvidenceArtifacts = [
    {
      key: 'commerce-provider-certification-json',
      label: 'Commerce provider certification evidence',
      workflow: '.github/workflows/commerce-provider-certification.yml',
      alternateWorkflows: ['.github/workflows/settings-provider-certification.yml', '.github/workflows/backy-release-certification.yml'],
      artifactName: 'backy-commerce-provider-certification-evidence',
      path: 'artifacts/backy-commerce-provider-certification.json',
      schemaVersion: 'backy.commerce-provider-certification-artifact.v1',
      producerEnv: 'BACKY_COMMERCE_CERTIFICATION_OUTPUT',
      requiredForReady: true,
      includesSecretValues: false,
    },
  ] as const;
  const settingsCertificationArtifactVerifier = {
    command: 'npm run doctor:release-certification',
    requiredEnv: 'BACKY_SETTINGS_CERTIFICATION_ARTIFACT_REQUIRED=1 or BACKY_PROVIDER_CERTIFICATION_ARTIFACTS_REQUIRED=1',
    pathEnv: 'BACKY_SETTINGS_CERTIFICATION_ARTIFACT_PATH or BACKY_SETTINGS_CERTIFICATION_ARTIFACT',
    schemaVersion: 'backy.settings-provider-certification-artifact.v1',
    validates: ['file exists', 'valid JSON', 'ok: true', 'artifact schema version', 'certifiedAtReady', 'artifactFreshReady', 'artifactAgeHours', 'artifactMaxAgeHours', 'artifactFutureSkewMinutes', 'no-secret boundary', 'no raw secret-like values', 'no forbidden artifact field names or credential URLs', 'apiHandoffs.settingsAdminApi present', 'apiHandoffs.siteScopedSettingsApi present', 'settingsApiHandoffSchemaReady', 'settingsApiHandoffSiteTargetReady', 'settingsApiHandoffTargetSiteId', 'settingsApiHandoffSettingsSiteSelectorEnv', 'settingsApiHandoffCommerceSiteSelectorEnv', 'settingsApiHandoffReady', 'siteSettingsApiHandoffReady', 'settingsScenarioEvidenceReady', 'settingsEvidencePacketReady', 'settingsCompletionStatusReady'],
    freshnessWindow: {
      maxAgeHoursEnv: 'BACKY_PROVIDER_CERTIFICATION_ARTIFACT_MAX_AGE_HOURS',
      defaultMaxAgeHours: 168,
      futureSkewMinutesEnv: 'BACKY_PROVIDER_CERTIFICATION_ARTIFACT_FUTURE_SKEW_MINUTES',
      defaultFutureSkewMinutes: 15,
    },
    includesSecretValues: false,
  } as const;
  const commerceCertificationArtifactVerifier = {
    command: 'npm run doctor:release-certification',
    requiredEnv: 'BACKY_COMMERCE_CERTIFICATION_ARTIFACT_REQUIRED=1 or BACKY_PROVIDER_CERTIFICATION_ARTIFACTS_REQUIRED=1',
    pathEnv: 'BACKY_COMMERCE_CERTIFICATION_ARTIFACT_PATH or BACKY_COMMERCE_CERTIFICATION_ARTIFACT',
    schemaVersion: 'backy.commerce-provider-certification-artifact.v1',
    validates: ['file exists', 'valid JSON', 'ok: true', 'artifact schema version', 'certifiedAtReady', 'artifactFreshReady', 'artifactAgeHours', 'artifactMaxAgeHours', 'artifactFutureSkewMinutes', 'no-secret boundary', 'no raw secret-like values', 'no forbidden artifact field names or credential URLs', 'apiHandoffs present', 'apiHandoffs.publicApis present', 'commerceArtifactSiteTargetReady', 'commerceArtifactTargetSiteId', 'commerceArtifactSiteSelectorEnvReady', 'commerceArtifactSiteSelectorEnv', 'apiHandoffReady', 'publicCommerceApiHandoffReady', 'productApiHandoffSchemaReady', 'productApiHandoffSiteTargetReady', 'productApiHandoffTargetSiteId', 'productApiHandoffReady', 'orderApiHandoffSchemaReady', 'orderApiHandoffSiteTargetReady', 'orderApiHandoffTargetSiteId', 'orderApiHandoffReady', 'commerceApiHandoffSiteSelectorEnv'],
    freshnessWindow: {
      maxAgeHoursEnv: 'BACKY_PROVIDER_CERTIFICATION_ARTIFACT_MAX_AGE_HOURS',
      defaultMaxAgeHours: 168,
      futureSkewMinutesEnv: 'BACKY_PROVIDER_CERTIFICATION_ARTIFACT_FUTURE_SKEW_MINUTES',
      defaultFutureSkewMinutes: 15,
    },
    includesSecretValues: false,
  } as const;
  const surfaceRunbooks = [
    {
      key: 'settings',
      label: '/settings',
      gate: 'settings-provider-certification',
      command: 'npm run ci:settings-provider-certification',
      preflight: 'npm run test:settings-provider-certification-preflight-contract',
      workflow: '.github/workflows/settings-provider-certification.yml',
      targetInputs: [
        'BACKY_SETTINGS_CERTIFICATION_BASE_URL',
        'BACKY_SETTINGS_CERTIFY_SITE_ID',
        'BACKY_COMMERCE_CERTIFICATION_BASE_URL',
        'BACKY_COMMERCE_CERTIFY_SITE_ID',
        'BACKY_ADMIN_API_KEY or BACKY_SETTINGS_CERTIFICATION_ADMIN_KEY',
      ],
      evidencePacketSchema: 'backy.settings-provider-certification-evidence-packet.v1',
      evidenceApi: '/api/admin/settings data.settings.providerCertification.operatorEvidencePacket',
      evidenceUiPanel: 'settings-provider-certification-evidence-packet',
      sourceOnlyGuard: 'BACKY_SETTINGS_SOURCE_ONLY=1 npm run test:settings --workspace @backy-cms/admin',
      proofSources: [
        'GET /api/admin/settings',
        'apps/admin/src/routes/settings.tsx',
        'scripts/settings-provider-certification-preflight-contract-smoke.mjs',
      ],
      expectedArtifacts: [
        'provider runtime alias summary',
        'operator evidence packet',
        'artifacts/backy-settings-provider-certification.json',
        'backy-settings-provider-certification-evidence',
        'Settings provider workflow summary',
        'release doctor summary',
      ],
      evidenceArtifacts: settingsCertificationEvidenceArtifacts,
      artifactVerifier: settingsCertificationArtifactVerifier,
      runtime: {
        configuredFamilies: configuredSettingsFamilies,
        missingFamilies: missingSettingsFamilies,
      },
      secretBoundary: {
        includesSecretValues: false,
        excludes: ['database URLs', 'provider credentials', 'service-role keys', 'Vercel tokens', 'notification secrets', 'commerce secrets'],
      },
      nextAction: missingSettingsFamilies.length > 0
        ? `Configure ${missingSettingsFamilies.join(', ')} provider aliases, then run npm run ci:settings-provider-certification.`
        : 'Run npm run ci:settings-provider-certification and attach the redacted evidence packet.',
    },
    {
      key: 'settings-admin-apis',
      label: 'Settings admin APIs',
      gate: 'settings-provider-certification',
      command: 'npm run ci:settings-provider-certification',
      preflight: 'npm run test:settings-provider-certification-preflight-contract',
      workflow: '.github/workflows/settings-provider-certification.yml',
      targetInputs: [
        'BACKY_SETTINGS_CERTIFICATION_BASE_URL',
        'BACKY_SETTINGS_CERTIFY_SITE_ID',
        'BACKY_COMMERCE_CERTIFY_SITE_ID',
        'BACKY_ADMIN_API_KEY or BACKY_SETTINGS_CERTIFICATION_ADMIN_KEY',
      ],
      evidencePacketSchema: 'backy.settings-provider-certification-evidence-packet.v1',
      evidenceApi: '/api/admin/settings providerCertification plus site OpenAPI AdminSettingsProviderCertification',
      evidenceUiPanel: 'settings-provider-certification-evidence-packet',
      sourceOnlyGuard: 'BACKY_SETTINGS_SOURCE_ONLY=1 npm run test:settings --workspace @backy-cms/admin',
      proofSources: [
        'GET /api/admin/settings',
        '/api/sites/{siteId}/openapi AdminSettingsProviderCertification',
        'packages/sdk-js/src/generated-contract-types.ts',
      ],
      expectedArtifacts: [
        'typed AdminSettings providerCertification response',
        'operator evidence packet',
        'artifacts/backy-settings-provider-certification.json',
        'backy-settings-provider-certification-evidence',
        'Settings API no-secret response headers',
      ],
      evidenceArtifacts: settingsCertificationEvidenceArtifacts,
      artifactVerifier: settingsCertificationArtifactVerifier,
      runtime: {
        configuredFamilies: configuredSettingsFamilies,
        missingFamilies: missingSettingsFamilies,
      },
      secretBoundary: {
        includesSecretValues: false,
        excludes: ['admin key values', 'database URLs', 'provider credentials', 'service-role keys'],
      },
      nextAction: missingSettingsFamilies.length > 0
        ? `Configure ${missingSettingsFamilies.join(', ')} provider aliases, then re-run the Settings admin API provider gate.`
        : 'Run the Settings provider gate and archive the typed admin API evidence packet.',
    },
    {
      key: 'products',
      label: '/products',
      gate: 'commerce-provider-certification',
      command: 'npm run ci:commerce-provider-certification',
      preflight: 'npm run test:commerce-provider-certification-preflight-contract',
      workflow: '.github/workflows/commerce-provider-certification.yml',
      targetInputs: [
        'BACKY_COMMERCE_CERTIFICATION_BASE_URL',
        'BACKY_COMMERCE_CERTIFY_SITE_ID',
        'BACKY_ADMIN_API_KEY or BACKY_COMMERCE_CERTIFICATION_ADMIN_KEY',
      ],
      evidencePacketSchema: 'backy.commerce-provider-certification-evidence-packet.v1',
      evidenceApi: '/api/admin/sites/{siteId}/commerce/products/{productId}/provider-sync data.providerCertification.operatorEvidencePacket plus /api/sites/{siteId}/manifest and /api/sites/{siteId}/commerce/catalog data.commerce.providerCertification',
      evidenceUiPanel: 'products-provider-certification-evidence-packet',
      sourceOnlyGuard: 'BACKY_COMMERCE_SOURCE_ONLY=1 npm run test:commerce --workspace @backy-cms/admin',
      proofSources: [
        'apps/admin/src/routes/products.tsx',
        'GET/POST /api/admin/sites/{siteId}/commerce/products/{productId}/provider-sync',
        'GET /api/sites/{siteId}/manifest',
        'GET /api/sites/{siteId}/commerce/catalog',
        'scripts/commerce-provider-certification-preflight-contract-smoke.mjs',
      ],
      expectedArtifacts: [
        'product provider-sync evidence',
        'public manifest/catalog commerce provider handoff',
        'artifacts/backy-commerce-provider-certification.json',
        'backy-commerce-provider-certification-evidence',
        'product storefront handoff',
        'provider catalog sync proof',
        'subscription lifecycle proof when selected',
      ],
      evidenceArtifacts: commerceCertificationEvidenceArtifacts,
      artifactVerifier: commerceCertificationArtifactVerifier,
      runtime: {
        configuredFamilies: configuredCommerceFamilies,
        missingFamilies: missingCommerceFamilies,
      },
      secretBoundary: {
        includesSecretValues: false,
        excludes: ['provider secrets', 'raw provider responses', 'private orders', 'customer payloads', 'digital delivery URLs'],
      },
      nextAction: missingCommerceFamilies.length > 0
        ? `Configure ${missingCommerceFamilies.join(', ')} commerce provider aliases, then run npm run ci:commerce-provider-certification.`
        : 'Run commerce provider certification and attach the products provider-sync evidence packet.',
    },
    {
      key: 'orders',
      label: '/orders',
      gate: 'commerce-provider-certification',
      command: 'npm run ci:commerce-provider-certification',
      preflight: 'npm run test:commerce-provider-certification-preflight-contract',
      workflow: '.github/workflows/commerce-provider-certification.yml',
      targetInputs: [
        'BACKY_COMMERCE_CERTIFICATION_BASE_URL',
        'BACKY_COMMERCE_CERTIFY_SITE_ID',
        'BACKY_ADMIN_API_KEY or BACKY_COMMERCE_CERTIFICATION_ADMIN_KEY',
      ],
      evidencePacketSchema: 'backy.order-provider-certification-evidence-packet.v1',
      evidenceApi: '/api/admin/sites/{siteId}/commerce/orders/analytics data.providerCertification.operatorEvidencePacket plus /api/sites/{siteId}/commerce/orders data.commerce.providerCertification',
      evidenceUiPanel: 'orders-provider-certification-evidence-packet',
      sourceOnlyGuard: 'BACKY_ORDERS_SOURCE_ONLY=1 npm run test:orders --workspace @backy-cms/admin',
      proofSources: [
        'apps/admin/src/routes/orders.tsx',
        'GET /api/admin/sites/{siteId}/commerce/orders/analytics',
        'GET /api/sites/{siteId}/commerce/orders',
        'scripts/commerce-provider-certification-preflight-contract-smoke.mjs',
      ],
      expectedArtifacts: [
        'order analytics provider evidence',
        'public order contract provider handoff',
        'artifacts/backy-commerce-provider-certification.json',
        'backy-commerce-provider-certification-evidence',
        'status handoff evidence',
        'quote/tracking/fulfillment/refund proof',
        'webhook/reconciliation proof',
      ],
      evidenceArtifacts: commerceCertificationEvidenceArtifacts,
      artifactVerifier: commerceCertificationArtifactVerifier,
      runtime: {
        configuredFamilies: configuredCommerceFamilies,
        missingFamilies: missingCommerceFamilies,
      },
      secretBoundary: {
        includesSecretValues: false,
        excludes: ['provider secrets', 'customer payloads', 'raw order payloads', 'payment references', 'addresses', 'webhook bodies'],
      },
      nextAction: missingCommerceFamilies.length > 0
        ? `Configure ${missingCommerceFamilies.join(', ')} commerce provider aliases, then run npm run ci:commerce-provider-certification.`
        : 'Run commerce provider certification and attach the orders analytics evidence packet.',
    },
  ] as const;
  const blockedGates = gates.filter((gate) => gate.status !== 'ready-to-run');
  const firstBlockedGate = blockedGates[0];
  const missingInputs = firstBlockedGate?.runtime && 'missing' in firstBlockedGate.runtime && Array.isArray(firstBlockedGate.runtime.missing)
    ? firstBlockedGate.runtime.missing
    : [];

  return {
    schemaVersion: 'backy.completion-status.v1',
    generatedAt: new Date().toISOString(),
    status: blockedGates.length === 0 ? 'certification-ready' : 'external-gates-required',
    summary: 'Backy core backend/editor/API parity is implemented for the audited local scope; Forms and SDK database gates are certified, and the remaining Partial rows require live provider certification evidence.',
    audit: {
      source: 'specs/page-completion-audit/backy-page-surface-audit.md',
      ready: 41,
      partial: 4,
      prototype: 0,
      missing: 0,
      total: 45,
      readyPercent: 91,
    },
    surfaces: [
      { key: 'products', label: '/products', status: 'partial', blocker: 'commerce-provider-certification', gate: 'npm run ci:commerce-provider-certification' },
      { key: 'orders', label: '/orders', status: 'partial', blocker: 'commerce-provider-certification', gate: 'npm run ci:commerce-provider-certification' },
      { key: 'settings', label: '/settings', status: 'partial', blocker: 'settings-provider-certification', gate: 'npm run ci:settings-provider-certification' },
      { key: 'settings-admin-apis', label: 'Settings admin APIs', status: 'partial', blocker: 'settings-provider-certification', gate: 'npm run ci:settings-provider-certification' },
    ],
    partialClosureReadiness: buildBackyPartialClosureReadiness(),
    surfaceRunbooks,
    certifiedGates: certifiedDatabaseGates,
    gates,
    nextAction: missingInputs.length > 0
      ? `Configure ${missingInputs.join(', ')} and run ${firstBlockedGate?.command}.`
      : `Configure the missing provider families and run ${firstBlockedGate?.command || 'npm run test:partial-gate-preflights'}.`,
    recommendedCommands: gates.map((gate) => gate.command),
    localPreflight: 'npm run test:partial-gate-preflights',
    privacy: {
      includesSecretValues: false,
      exposesOnlyAliasPresence: true,
      secretHandling: 'Completion status exposes audited counts, gate names, workflow paths, env alias presence, and missing provider families only; database URLs, provider keys, admin keys, and customer/order/submission payloads are never returned.',
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

const reusableSectionFrontendDesign = (section: { metadata?: unknown }) => (
  frontendDesignProvenanceFromMetadata(section.metadata)
);

const contentFrontendDesign = (item: { meta?: unknown }) => (
  frontendDesignProvenanceFromMetadata(item.meta)
);

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
  const fileCategories = [
    {
      type: 'image',
      label: 'Images',
      accepts: ['image/*'],
      pickerUse: 'visual-media',
      delivery: 'public-or-signed-file',
      transformEligible: true,
      responsiveEligible: true,
      fontManifestEligible: false,
    },
    {
      type: 'video',
      label: 'Videos',
      accepts: ['video/*'],
      pickerUse: 'embedded-media',
      delivery: 'public-or-signed-file',
      transformEligible: false,
      responsiveEligible: false,
      fontManifestEligible: false,
    },
    {
      type: 'audio',
      label: 'Audio',
      accepts: ['audio/*'],
      pickerUse: 'embedded-media',
      delivery: 'public-or-signed-file',
      transformEligible: false,
      responsiveEligible: false,
      fontManifestEligible: false,
    },
    {
      type: 'document',
      label: 'Documents',
      accepts: [
        'application/pdf',
        'text/plain',
        'text/csv',
        'application/msword',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'application/vnd.ms-excel',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'application/vnd.ms-powerpoint',
        'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      ],
      aliases: ['file'],
      pickerUse: 'downloadable-document',
      delivery: 'public-or-signed-file',
      transformEligible: false,
      responsiveEligible: false,
      fontManifestEligible: false,
    },
    {
      type: 'font',
      label: 'Fonts',
      accepts: ['font/*', '.woff', '.woff2', '.ttf', '.otf', '.eot'],
      pickerUse: 'typography',
      delivery: 'font-manifest-or-file',
      transformEligible: false,
      responsiveEligible: false,
      fontManifestEligible: true,
    },
    {
      type: 'other',
      label: 'Other files',
      accepts: ['application/octet-stream'],
      pickerUse: 'downloadable-file',
      delivery: 'public-or-signed-file',
      transformEligible: false,
      responsiveEligible: false,
      fontManifestEligible: false,
    },
  ] as const;

  return {
    schemaVersion: 'backy.media-discovery.v1',
    count: totalCount,
    publicCount,
    fontCount,
    types,
    fileCategories,
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
      authenticatedUpload: true,
      folderManagement: true,
      retainedVersions: true,
      responsiveTransformPreparation: true,
      bindingMetadata: true,
      providerAnalyticsIngestion: true,
    },
    filters: {
      types,
      typeAliases: {
        file: ['document', 'other'],
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
        fileType: 'file',
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
    deliveryPolicy: {
      publicFiles: 'direct-file-url',
      privateFiles: 'signed-url-required',
      signedUrlEndpoint: `/api/admin/sites/${siteId}/media/{mediaId}/signed-url`,
      signedUrlMethod: 'POST',
      signedUrlPermission: 'media.view',
      acceptedDispositions: ['inline', 'attachment'],
      defaultDisposition: 'inline',
      maxSignedUrlSeconds: 3600,
      transformableTypes: ['image'],
      responsiveTypes: ['image'],
      fontManifestTypes: ['font'],
      downloadableTypes: ['document', 'other', 'audio', 'video'],
      secretHandling: 'Private file bytes require short-lived signed URLs minted through authenticated admin media APIs; public manifests never include private file tokens.',
    },
    managementPolicy: {
      schemaVersion: 'backy.media-management.v1',
      endpoints: {
        adminList: `/api/admin/sites/${siteId}/media`,
        upload: `/api/admin/sites/${siteId}/media`,
        detail: `/api/admin/sites/${siteId}/media/{mediaId}`,
        folders: `/api/admin/sites/${siteId}/media/folders`,
        folderDetail: `/api/admin/sites/${siteId}/media/folders/{folderId}`,
        versions: `/api/admin/sites/${siteId}/media/{mediaId}/versions`,
        version: `/api/admin/sites/${siteId}/media/{mediaId}/versions/{versionId}`,
        signedUrl: `/api/admin/sites/${siteId}/media/{mediaId}/signed-url`,
        bind: `/api/admin/sites/${siteId}/media/{mediaId}/bind`,
        transforms: `/api/admin/sites/${siteId}/media/{mediaId}/transforms`,
        providerAnalytics: `/api/admin/sites/${siteId}/media/provider-analytics`,
      },
      methods: {
        list: 'GET',
        upload: 'POST',
        update: 'PATCH',
        replace: 'POST',
        delete: 'DELETE',
        folders: 'GET',
        createFolder: 'POST',
        updateFolder: 'PATCH',
        deleteFolder: 'DELETE',
        versions: 'GET',
        restoreVersion: 'POST',
        deleteVersion: 'DELETE',
        signedUrl: 'POST',
        bind: 'POST',
        transforms: 'POST',
        providerAnalytics: 'POST',
      },
      auth: {
        modes: ['session', 'api-key'],
        headers: ['Authorization', 'x-backy-admin-session', 'x-backy-admin-key', 'x-api-key'],
        requiredPermissions: {
          read: 'media.view',
          create: 'media.create',
          update: 'media.edit',
          delete: 'media.delete',
          privateDelivery: 'media.view',
        },
        siteScope: true,
      },
      uploadFields: [
        'file',
        'filename',
        'folderId',
        'scope',
        'scopeTargetId',
        'visibility',
        'tags',
        'metadata',
        'altText',
        'caption',
        'fontFamily',
        'fontWeight',
        'fontStyle',
        'fontFallback',
        'fontDisplay',
        'uploadedBy',
      ],
      filters: {
        types: ['image', 'video', 'audio', 'document', 'file', 'font', 'other', 'all'],
        typeAliases: {
          file: ['document', 'other'],
        },
        visibility: ['public', 'private', 'all'],
        scopes: ['global', 'page', 'post', 'all'],
        queryParams: [
          'type',
          'visibility',
          'scope',
          'global',
          'search',
          'tag',
          'folderId',
          'pageId',
          'postId',
          'blogId',
          'limit',
          'offset',
        ],
        maxLimit: 100,
        aliases: {
          blogId: 'postId',
          fileType: 'file',
        },
      },
      sdkHelpers: {
        list: 'adminMedia',
        upload: 'uploadMedia',
        update: 'updateAdminMedia',
        replace: 'replaceMedia',
        delete: 'deleteAdminMedia',
        folders: 'adminMediaFolders',
        createFolder: 'createMediaFolder',
        updateFolder: 'updateMediaFolder',
        deleteFolder: 'deleteMediaFolder',
        versions: 'adminMediaVersions',
        restoreVersion: 'restoreMediaVersion',
        deleteVersion: 'deleteMediaVersion',
        signedUrl: 'createMediaSignedUrl',
        bind: 'bindMedia',
        transforms: 'prepareMediaTransforms',
        providerAnalytics: 'ingestMediaProviderAnalytics',
      },
      responseContracts: {
        list: 'backy.admin-media-list.v1',
        item: 'backy.admin-media.v1',
        folders: 'backy.media-folders.v1',
        versions: 'backy.media-versions.v1',
        signedUrl: 'backy.media-signed-url.v1',
        binding: 'backy.media-binding.v1',
        transforms: 'backy.media-transforms.v1',
      },
      auditing: {
        create: 'media.created',
        update: 'media.updated',
        replace: 'media.replaced',
        delete: 'media.deleted',
        bind: 'media.bound',
        unbind: 'media.unbound',
      },
      secretHandling: 'Upload requests are authenticated admin multipart requests; private delivery uses short-lived signed URLs and never publishes private file tokens in manifest responses.',
    },
    schemas: {
      list: 'backy.media-discovery.v1',
      fileCategories: 'backy.media-file-categories.v1',
      folders: 'backy.media-folders.v1',
      fonts: 'backy.font-manifest.v1',
      references: 'backy.media.references.v1',
      editableMetadata: 'backy.media.editable-metadata.v1',
      notFound: 'MEDIA_NOT_FOUND',
    },
  };
};

const LIVE_MANAGEMENT_EDITABLE_TARGETS = [
  'props.content',
  'props.href',
  'props.target',
  'props.download',
  'props.src',
  'props.alt',
  'props.title',
  'props.assetId',
  'props.fileId',
  'props.fileIds',
  'props.fileMediaId',
  'props.fileMediaIds',
  'props.downloadMediaId',
  'props.downloadMediaIds',
  'props.fileMediaUrl',
  'props.fileUrl',
  'props.fileMediaName',
  'props.fileMediaType',
  'props.fileMediaVisibility',
  'props.fileDownloadDisposition',
  'props.fileSignedUrlRequired',
  'props.fileSignedUrlEndpoint',
  'props.fileName',
  'props.imageId',
  'props.imageIds',
  'props.videoId',
  'props.videoIds',
  'props.audioId',
  'props.audioIds',
  'props.documentId',
  'props.documentIds',
  'props.iconId',
  'props.iconIds',
  'props.mediaId',
  'props.mediaIds',
  'props.mediaName',
  'props.mediaType',
  'props.mediaFolderId',
  'props.mediaScope',
  'props.mediaScopeTargetId',
  'props.mediaVisibility',
  'props.mediaInsertPreset',
  'props.objectFit',
  'props.objectPosition',
  'props.imageFocalPoint',
  'props.imageInsertPreset',
  'props.fallbackImageMediaId',
  'props.fallbackImageMediaIds',
  'props.backgroundMediaId',
  'props.backgroundMediaIds',
  'props.posterMediaId',
  'props.posterMediaIds',
  'props.fallback',
  'props.fontFamily',
  'props.fontMediaId',
  'props.fontMediaIds',
  'props.fontMediaName',
  'props.fontMediaFolderId',
  'props.fontMediaVisibility',
  'props.fontFileUrl',
  'props.fontSource',
  'props.fontFallback',
  'props.fontDisplay',
  'props.fontRegistration',
  'props.formId',
  'props.formTitle',
  'props.submitLabel',
  'props.action',
  'props.actionUrl',
  'props.method',
  'props.successMessage',
  'props.formActive',
  'props.labelColor',
  'props.helpTextColor',
  'props.fieldBackgroundColor',
  'props.fieldBorderColor',
  'props.fieldBorderRadius',
  'props.submitBackgroundColor',
  'props.submitColor',
  'props.submitBorderRadius',
  'props.label',
  'props.name',
  'props.placeholder',
  'props.helpText',
  'props.defaultValue',
  'props.value',
  'props.options',
  'props.inputType',
  'props.rows',
  'props.required',
  'props.disabled',
  'props.actionPreset',
  'props.actionValue',
  'props.rel',
  'props.ariaLabel',
  'props.underline',
  'props.type',
  'props.color',
  'props.backgroundColor',
  'props.borderColor',
  'props.borderRadius',
  'props.borderWidth',
  'props.borderStyle',
  'props.padding',
  'props.margin',
  'props.opacity',
  'props.boxShadow',
  'props.fontSize',
  'props.fontWeight',
  'props.lineHeight',
  'props.textAlign',
  'props.textTransform',
  'props.letterSpacing',
  'props.wordSpacing',
  'props.textIndent',
  'props.textShadow',
  'props.textDecoration',
  'props.fontStyle',
  'styles.color',
  'styles.backgroundColor',
  'styles.borderColor',
  'styles.fontFamily',
  'styles.fontSize',
  'styles.lineHeight',
  'styles.fontWeight',
  'styles.borderRadius',
  'styles.padding',
  'styles.margin',
  'styles.opacity',
  'styles.boxShadow',
  'tokenRefs.styles.color',
  'tokenRefs.styles.backgroundColor',
  'tokenRefs.styles.borderColor',
  'tokenRefs.styles.fontFamily',
  'tokenRefs.styles.fontSize',
  'tokenRefs.styles.lineHeight',
  'tokenRefs.styles.fontWeight',
  'tokenRefs.styles.padding',
  'tokenRefs.styles.margin',
  'tokenRefs.styles.borderRadius',
  'tokenRefs.styles.boxShadow',
  'animation.type',
  'animation.duration',
  'animation.delay',
  'animation.easing',
  'animation.direction',
  'animation.trigger',
  'animation.scrollTrigger',
  'animation.scrollTrigger.start',
  'animation.scrollTrigger.end',
  'animation.scrollTrigger.scrub',
  'animation.from',
  'animation.to',
  'animation.tokenRefs.duration',
  'animation.tokenRefs.easing',
  'actions',
  'dataBindings',
  'bindingSlots',
  'assetIds',
  'responsive.tablet.x',
  'responsive.tablet.y',
  'responsive.tablet.width',
  'responsive.tablet.height',
  'responsive.tablet.visible',
  'responsive.tablet.locked',
  'responsive.tablet.props.content',
  'responsive.tablet.props.href',
  'responsive.tablet.props.target',
  'responsive.tablet.props.download',
  'responsive.tablet.props.src',
  'responsive.tablet.props.fileId',
  'responsive.tablet.props.fileIds',
  'responsive.tablet.props.fileMediaId',
  'responsive.tablet.props.fileMediaIds',
  'responsive.tablet.props.downloadMediaId',
  'responsive.tablet.props.downloadMediaIds',
  'responsive.tablet.props.fileMediaUrl',
  'responsive.tablet.props.fileUrl',
  'responsive.tablet.props.fileMediaName',
  'responsive.tablet.props.fileMediaType',
  'responsive.tablet.props.fileMediaVisibility',
  'responsive.tablet.props.fileDownloadDisposition',
  'responsive.tablet.props.fileSignedUrlRequired',
  'responsive.tablet.props.fileSignedUrlEndpoint',
  'responsive.tablet.props.fileName',
  'responsive.tablet.props.imageIds',
  'responsive.tablet.props.videoIds',
  'responsive.tablet.props.audioIds',
  'responsive.tablet.props.documentIds',
  'responsive.tablet.props.iconIds',
  'responsive.tablet.props.mediaId',
  'responsive.tablet.props.mediaIds',
  'responsive.tablet.props.fallbackImageMediaIds',
  'responsive.tablet.props.backgroundMediaIds',
  'responsive.tablet.props.posterMediaIds',
  'responsive.tablet.props.fontMediaId',
  'responsive.tablet.props.fontMediaIds',
  'responsive.tablet.props.color',
  'responsive.tablet.props.backgroundColor',
  'responsive.tablet.props.borderColor',
  'responsive.tablet.props.borderRadius',
  'responsive.tablet.props.borderWidth',
  'responsive.tablet.props.borderStyle',
  'responsive.tablet.props.padding',
  'responsive.tablet.props.margin',
  'responsive.tablet.props.opacity',
  'responsive.tablet.props.boxShadow',
  'responsive.tablet.props.fontFamily',
  'responsive.tablet.props.fontSize',
  'responsive.tablet.props.fontWeight',
  'responsive.tablet.props.lineHeight',
  'responsive.tablet.props.textAlign',
  'responsive.tablet.props.textTransform',
  'responsive.tablet.props.letterSpacing',
  'responsive.tablet.props.wordSpacing',
  'responsive.tablet.props.textIndent',
  'responsive.tablet.props.textShadow',
  'responsive.tablet.props.textDecoration',
  'responsive.tablet.props.fontStyle',
  'responsive.tablet.styles.color',
  'responsive.tablet.styles.backgroundColor',
  'responsive.tablet.styles.borderColor',
  'responsive.tablet.styles.fontFamily',
  'responsive.tablet.styles.fontSize',
  'responsive.tablet.styles.lineHeight',
  'responsive.tablet.styles.fontWeight',
  'responsive.tablet.styles.padding',
  'responsive.tablet.styles.margin',
  'responsive.tablet.styles.borderRadius',
  'responsive.tablet.styles.boxShadow',
  'responsive.tablet.styles.backgroundMediaIds',
  'responsive.tablet.tokenRefs.styles.color',
  'responsive.tablet.tokenRefs.styles.backgroundColor',
  'responsive.tablet.tokenRefs.styles.borderColor',
  'responsive.tablet.tokenRefs.styles.fontFamily',
  'responsive.tablet.tokenRefs.styles.fontSize',
  'responsive.tablet.tokenRefs.styles.lineHeight',
  'responsive.tablet.tokenRefs.styles.fontWeight',
  'responsive.tablet.tokenRefs.styles.padding',
  'responsive.tablet.tokenRefs.styles.margin',
  'responsive.tablet.tokenRefs.styles.borderRadius',
  'responsive.tablet.tokenRefs.styles.boxShadow',
  'responsive.mobile.x',
  'responsive.mobile.y',
  'responsive.mobile.width',
  'responsive.mobile.height',
  'responsive.mobile.visible',
  'responsive.mobile.locked',
  'responsive.mobile.props.content',
  'responsive.mobile.props.href',
  'responsive.mobile.props.target',
  'responsive.mobile.props.download',
  'responsive.mobile.props.src',
  'responsive.mobile.props.fileId',
  'responsive.mobile.props.fileIds',
  'responsive.mobile.props.fileMediaId',
  'responsive.mobile.props.fileMediaIds',
  'responsive.mobile.props.downloadMediaId',
  'responsive.mobile.props.downloadMediaIds',
  'responsive.mobile.props.fileMediaUrl',
  'responsive.mobile.props.fileUrl',
  'responsive.mobile.props.fileMediaName',
  'responsive.mobile.props.fileMediaType',
  'responsive.mobile.props.fileMediaVisibility',
  'responsive.mobile.props.fileDownloadDisposition',
  'responsive.mobile.props.fileSignedUrlRequired',
  'responsive.mobile.props.fileSignedUrlEndpoint',
  'responsive.mobile.props.fileName',
  'responsive.mobile.props.imageIds',
  'responsive.mobile.props.videoIds',
  'responsive.mobile.props.audioIds',
  'responsive.mobile.props.documentIds',
  'responsive.mobile.props.iconIds',
  'responsive.mobile.props.mediaId',
  'responsive.mobile.props.mediaIds',
  'responsive.mobile.props.fallbackImageMediaIds',
  'responsive.mobile.props.backgroundMediaIds',
  'responsive.mobile.props.posterMediaIds',
  'responsive.mobile.props.fontMediaId',
  'responsive.mobile.props.fontMediaIds',
  'responsive.mobile.props.color',
  'responsive.mobile.props.backgroundColor',
  'responsive.mobile.props.borderColor',
  'responsive.mobile.props.borderRadius',
  'responsive.mobile.props.borderWidth',
  'responsive.mobile.props.borderStyle',
  'responsive.mobile.props.padding',
  'responsive.mobile.props.margin',
  'responsive.mobile.props.opacity',
  'responsive.mobile.props.boxShadow',
  'responsive.mobile.props.fontFamily',
  'responsive.mobile.props.fontSize',
  'responsive.mobile.props.fontWeight',
  'responsive.mobile.props.lineHeight',
  'responsive.mobile.props.textAlign',
  'responsive.mobile.props.textTransform',
  'responsive.mobile.props.letterSpacing',
  'responsive.mobile.props.wordSpacing',
  'responsive.mobile.props.textIndent',
  'responsive.mobile.props.textShadow',
  'responsive.mobile.props.textDecoration',
  'responsive.mobile.props.fontStyle',
  'responsive.mobile.styles.color',
  'responsive.mobile.styles.backgroundColor',
  'responsive.mobile.styles.borderColor',
  'responsive.mobile.styles.fontFamily',
  'responsive.mobile.styles.fontSize',
  'responsive.mobile.styles.lineHeight',
  'responsive.mobile.styles.fontWeight',
  'responsive.mobile.styles.padding',
  'responsive.mobile.styles.margin',
  'responsive.mobile.styles.borderRadius',
  'responsive.mobile.styles.boxShadow',
  'responsive.mobile.styles.backgroundMediaIds',
  'responsive.mobile.tokenRefs.styles.color',
  'responsive.mobile.tokenRefs.styles.backgroundColor',
  'responsive.mobile.tokenRefs.styles.borderColor',
  'responsive.mobile.tokenRefs.styles.fontFamily',
  'responsive.mobile.tokenRefs.styles.fontSize',
  'responsive.mobile.tokenRefs.styles.lineHeight',
  'responsive.mobile.tokenRefs.styles.fontWeight',
  'responsive.mobile.tokenRefs.styles.padding',
  'responsive.mobile.tokenRefs.styles.margin',
  'responsive.mobile.tokenRefs.styles.borderRadius',
  'responsive.mobile.tokenRefs.styles.boxShadow',
  'layout.x',
  'layout.y',
  'layout.width',
  'layout.height',
  'visibility.hidden',
  'visibility.locked',
] as const;

const buildManifestLiveManagementDiscovery = (siteId: string) => ({
  schemaVersion: 'backy.live-management.v1',
  enabled: true,
  endpoints: {
    pages: `/api/admin/sites/${siteId}/pages`,
    pageCreate: `/api/admin/sites/${siteId}/pages`,
    pageDetail: `/api/admin/sites/${siteId}/pages/{pageId}`,
    pageReadiness: `/api/admin/sites/${siteId}/pages/{pageId}/readiness`,
    pagePublish: `/api/admin/sites/${siteId}/pages/{pageId}/publish`,
    pageArchive: `/api/admin/sites/${siteId}/pages/{pageId}/archive`,
    pagePreview: `/api/admin/sites/${siteId}/pages/{pageId}/preview`,
    pageRevisions: `/api/admin/sites/${siteId}/pages/{pageId}/revisions`,
    pageRollback: `/api/admin/sites/${siteId}/pages/{pageId}/rollback`,
    page: `/api/sites/${siteId}/manage/pages/{pageId}`,
    posts: `/api/admin/sites/${siteId}/blog`,
    postCreate: `/api/admin/sites/${siteId}/blog`,
    postDetail: `/api/admin/sites/${siteId}/blog/{postId}`,
    postReadiness: `/api/admin/sites/${siteId}/blog/{postId}/readiness`,
    postPublish: `/api/admin/sites/${siteId}/blog/{postId}/publish`,
    postArchive: `/api/admin/sites/${siteId}/blog/{postId}/archive`,
    postPreview: `/api/admin/sites/${siteId}/blog/{postId}/preview`,
    postRevisions: `/api/admin/sites/${siteId}/blog/{postId}/revisions`,
    postRollback: `/api/admin/sites/${siteId}/blog/{postId}/rollback`,
    post: `/api/sites/${siteId}/manage/blog/{postId}`,
    render: `/api/sites/${siteId}/render?path={path}`,
    editableMapSchema: 'https://backy.dev/schemas/ai-frontend-contract/editable-map.schema.json',
  },
  methods: {
    list: 'GET',
    read: 'GET',
    create: 'POST',
    update: 'PATCH',
    delete: 'DELETE',
    publish: 'POST',
    archive: 'POST',
    preview: 'POST',
    revisions: 'GET',
    rollback: 'POST',
  },
  responseHeaders: {
    page: {
      contractVersion: 'x-backy-contract-version',
      schemaVersion: 'backy.live-management-page.v1',
      cacheScope: 'private',
      cacheHeader: 'cache-control',
      siteIdHeader: 'x-backy-site-id',
      requestIdHeader: 'x-backy-request-id',
      resourceHeader: 'x-backy-live-management-resource',
      resource: 'page',
    },
    post: {
      contractVersion: 'x-backy-contract-version',
      schemaVersion: 'backy.live-management-blog-post.v1',
      cacheScope: 'private',
      cacheHeader: 'cache-control',
      siteIdHeader: 'x-backy-site-id',
      requestIdHeader: 'x-backy-request-id',
      resourceHeader: 'x-backy-live-management-resource',
      resource: 'blog-post',
    },
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
    authenticatedContentLifecycle: true,
    pageLifecycle: true,
    postLifecycle: true,
    templateCloning: true,
    previewTokenCreation: true,
    revisionHistory: true,
    editorComposition: true,
    editorGrouping: true,
    inlineMedia: true,
    mediaAssetRefs: true,
    fontAssetRefs: true,
    elementAssetIds: true,
    tokenRefs: true,
    animation: true,
    animationTokenRefs: true,
  },
  editableTargets: [...LIVE_MANAGEMENT_EDITABLE_TARGETS],
  lifecycle: {
    schemaVersion: 'backy.content-lifecycle-commands.v1',
    cloneField: 'frontendDesignTemplateId',
    permissions: {
      read: 'pages.view',
      create: 'pages.edit',
      update: 'pages.edit',
      delete: 'pages.delete',
      publish: 'pages.publish',
    },
    sdkHelpers: {
      listPages: 'adminPages',
      createPage: 'createAdminPage',
      readPage: 'adminPage',
      updatePage: 'updateAdminPage',
      deletePage: 'deleteAdminPage',
      pageReadiness: 'adminPageReadiness',
      publishPage: 'publishAdminPage',
      archivePage: 'archiveAdminPage',
      createPagePreview: 'createAdminPagePreviewToken',
      pageRevisions: 'adminPageRevisions',
      rollbackPage: 'rollbackAdminPage',
      listPosts: 'adminBlogPosts',
      createPost: 'createAdminBlogPost',
      readPost: 'adminBlogPost',
      updatePost: 'updateAdminBlogPost',
      deletePost: 'deleteAdminBlogPost',
      postReadiness: 'adminBlogPostReadiness',
      publishPost: 'publishAdminBlogPost',
      archivePost: 'archiveAdminBlogPost',
      createPostPreview: 'createAdminBlogPostPreviewToken',
      postRevisions: 'adminBlogPostRevisions',
      rollbackPost: 'rollbackAdminBlogPost',
    },
    requestBodies: {
      createPage: {
        templateClone: '{ title, slug?, status?, frontendDesignTemplateId?, content?, meta? }',
        designState: 'content may carry elements, contentDocument, customCSS, customJS, themeTokenRefs, assets, animations, interactions, dataBindings, editableMap, seo, and metadata.',
      },
      createPost: {
        templateClone: '{ title, slug?, status?, frontendDesignTemplateId?, content?, meta?, excerpt?, authorId?, categoryIds?, tagIds? }',
        designState: 'content may carry elements, contentDocument, customCSS, customJS, themeTokenRefs, assets, animations, interactions, dataBindings, editableMap, seo, and metadata.',
      },
    },
    responseContracts: {
      pageRevisions: 'backy.admin-page-revisions.v1',
      postRevisions: 'backy.admin-blog-post-revisions.v1',
      revisionBranchMetadata: 'backy.content-revision-branch-metadata.v1',
      branchMetadataField: 'revision.branchMetadata',
      pageRollbackRequest: 'backy.admin-page-rollback-request.v1',
      postRollbackRequest: 'backy.admin-blog-post-rollback-request.v1',
    },
  },
  editorComposition: {
    schemaVersion: 'backy.editor-composition-commands.v1',
    sdkHelpers: {
      listElements: 'listBackyContentElements',
      findElement: 'findBackyContentElement',
      addElement: 'addBackyContentElement',
      duplicateElement: 'duplicateBackyContentElement',
      deleteElements: 'deleteBackyContentElements',
      transformElements: 'transformBackyContentElements',
      group: 'groupBackyContentElements',
      ungroup: 'ungroupBackyContentElements',
      patchElement: 'patchBackyContentElement',
      patchElements: 'patchBackyContentElements',
      buildPageUpdate: 'buildBackyLiveManagedPageEditableMapUpdate',
      buildBlogPostUpdate: 'buildBackyLiveManagedBlogPostEditableMapUpdate',
    },
	    commands: [
      {
        id: 'add',
        label: 'Add an element to the canvas or selected parent layer',
        shortcut: 'Insert',
        sdkHelper: 'addBackyContentElement',
        minSelected: 0,
        sameParentRequired: false,
        unlockedRequired: true,
        mutates: ['children', 'parentId', 'zIndex'],
        preservesResponsiveGeometry: true,
      },
      {
        id: 'duplicate',
        label: 'Duplicate the selected element tree',
        shortcut: 'Cmd/Ctrl+D',
        sdkHelper: 'duplicateBackyContentElement',
        minSelected: 1,
        sameParentRequired: false,
        unlockedRequired: true,
        mutates: ['id', 'parentId', 'children', 'layout'],
        preservesResponsiveGeometry: true,
      },
      {
        id: 'delete',
        label: 'Delete selected unlocked element trees',
        shortcut: 'Delete/Backspace',
        sdkHelper: 'deleteBackyContentElements',
        minSelected: 1,
        sameParentRequired: false,
        unlockedRequired: true,
        mutates: ['children'],
        preservesResponsiveGeometry: true,
      },
      {
        id: 'move',
        label: 'Move selected elements on desktop or responsive breakpoints',
        shortcut: 'Arrow keys / drag',
        sdkHelper: 'transformBackyContentElements',
        minSelected: 1,
        sameParentRequired: false,
        unlockedRequired: true,
        mutates: ['layout.x', 'layout.y', 'responsive.tablet', 'responsive.mobile'],
        preservesResponsiveGeometry: true,
      },
      {
        id: 'resize',
        label: 'Resize selected elements on desktop or responsive breakpoints',
        shortcut: 'Drag handles',
        sdkHelper: 'transformBackyContentElements',
        minSelected: 1,
        sameParentRequired: false,
        unlockedRequired: true,
        mutates: ['layout.width', 'layout.height', 'responsive.tablet', 'responsive.mobile'],
        preservesResponsiveGeometry: true,
      },
      {
        id: 'group',
        label: 'Group selected sibling layers',
        shortcut: 'Cmd/Ctrl+G',
        sdkHelper: 'groupBackyContentElements',
        minSelected: 2,
        sameParentRequired: true,
        unlockedRequired: true,
        createsEditorGroup: true,
        preservesResponsiveGeometry: true,
      },
      {
        id: 'ungroup',
        label: 'Ungroup selected editor groups',
        shortcut: 'Shift+Cmd/Ctrl+G',
        sdkHelper: 'ungroupBackyContentElements',
        minSelected: 1,
        sameParentRequired: true,
        unlockedRequired: true,
        editorGroupRequired: true,
        preservesResponsiveGeometry: true,
      },
	    ],
	    commandRegistry: liveManagementEditorCommandRegistry,
	    constraints: {
      sameParentRequired: true,
      lockedLayersBlocked: true,
      editorGroupMarker: 'props.editorGroup',
      responsiveBreakpoints: ['tablet', 'mobile'],
      updateTarget: 'content',
    },
  },
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
    adminList: `/api/admin/sites/${siteId}/pages`,
    adminCreate: `/api/admin/sites/${siteId}/pages`,
    adminDetail: `/api/admin/sites/${siteId}/pages/{pageId}`,
    adminReadiness: `/api/admin/sites/${siteId}/pages/{pageId}/readiness`,
    adminPublish: `/api/admin/sites/${siteId}/pages/{pageId}/publish`,
    adminArchive: `/api/admin/sites/${siteId}/pages/{pageId}/archive`,
    adminPreview: `/api/admin/sites/${siteId}/pages/{pageId}/preview`,
    adminRevisions: `/api/admin/sites/${siteId}/pages/{pageId}/revisions`,
    adminRollback: `/api/admin/sites/${siteId}/pages/{pageId}/rollback`,
  },
  methods: {
    list: 'GET',
    detail: 'GET',
    resolve: 'GET',
    render: 'GET',
    liveManageRead: 'GET',
    liveManageUpdate: 'PATCH',
    adminList: 'GET',
    adminCreate: 'POST',
    adminRead: 'GET',
    adminUpdate: 'PATCH',
    adminDelete: 'DELETE',
    adminPublish: 'POST',
    adminArchive: 'POST',
    adminPreview: 'POST',
    adminRevisions: 'GET',
    adminRollback: 'POST',
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
    authenticatedManagement: true,
    pageCreation: true,
    templateCloning: true,
    readinessChecks: true,
    publishArchive: true,
    revisionHistory: true,
    conditionalRequests: true,
    cacheablePages: true,
  },
  managementPolicy: {
    schemaVersion: 'backy.pages-management.v1',
    cloneField: 'frontendDesignTemplateId',
    endpoints: {
      list: `/api/admin/sites/${siteId}/pages`,
      create: `/api/admin/sites/${siteId}/pages`,
      detail: `/api/admin/sites/${siteId}/pages/{pageId}`,
      readiness: `/api/admin/sites/${siteId}/pages/{pageId}/readiness`,
      publish: `/api/admin/sites/${siteId}/pages/{pageId}/publish`,
      archive: `/api/admin/sites/${siteId}/pages/{pageId}/archive`,
      preview: `/api/admin/sites/${siteId}/pages/{pageId}/preview`,
      revisions: `/api/admin/sites/${siteId}/pages/{pageId}/revisions`,
      rollback: `/api/admin/sites/${siteId}/pages/{pageId}/rollback`,
      templateRegistry: `/api/admin/sites/${siteId}/templates?type=page`,
    },
    methods: {
      list: 'GET',
      create: 'POST',
      read: 'GET',
      update: 'PATCH',
      delete: 'DELETE',
      readiness: 'GET',
      publish: 'POST',
      archive: 'POST',
      preview: 'POST',
      revisions: 'GET',
      rollback: 'POST',
    },
    auth: {
      modes: ['session', 'api-key'],
      headers: ['Authorization', 'x-backy-admin-session', 'x-backy-admin-key', 'x-api-key'],
      requiredPermissions: {
        read: 'pages.view',
        create: 'pages.edit',
        update: 'pages.edit',
        delete: 'pages.delete',
        publish: 'pages.publish',
      },
      siteScope: true,
    },
    sdkHelpers: {
      list: 'adminPages',
      create: 'createAdminPage',
      read: 'adminPage',
      update: 'updateAdminPage',
      delete: 'deleteAdminPage',
      readiness: 'adminPageReadiness',
      publish: 'publishAdminPage',
      archive: 'archiveAdminPage',
      preview: 'createAdminPagePreviewToken',
      revisions: 'adminPageRevisions',
      rollback: 'rollbackAdminPage',
    },
    responseContracts: {
      list: 'backy.admin-pages.v1',
      detail: 'backy.admin-page.v1',
      readiness: 'backy.page-readiness.v1',
      preview: 'backy.preview-token.v1',
      revisions: 'backy.admin-page-revisions.v1',
      revisionBranchMetadata: 'backy.content-revision-branch-metadata.v1',
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
    adminList: `/api/admin/sites/${siteId}/blog`,
    adminCreate: `/api/admin/sites/${siteId}/blog`,
    adminDetail: `/api/admin/sites/${siteId}/blog/{postId}`,
    adminReadiness: `/api/admin/sites/${siteId}/blog/{postId}/readiness`,
    adminPublish: `/api/admin/sites/${siteId}/blog/{postId}/publish`,
    adminArchive: `/api/admin/sites/${siteId}/blog/{postId}/archive`,
    adminPreview: `/api/admin/sites/${siteId}/blog/{postId}/preview`,
    adminRevisions: `/api/admin/sites/${siteId}/blog/{postId}/revisions`,
    adminRollback: `/api/admin/sites/${siteId}/blog/{postId}/rollback`,
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
    adminList: 'GET',
    adminCreate: 'POST',
    adminRead: 'GET',
    adminUpdate: 'PATCH',
    adminDelete: 'DELETE',
    adminPublish: 'POST',
    adminArchive: 'POST',
    adminPreview: 'POST',
    adminRevisions: 'GET',
    adminRollback: 'POST',
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
    authenticatedManagement: true,
    postCreation: true,
    templateCloning: true,
    readinessChecks: true,
    publishArchive: true,
    revisionHistory: true,
    conditionalRequests: true,
    cacheablePosts: true,
  },
  managementPolicy: {
    schemaVersion: 'backy.blog-management.v1',
    cloneField: 'frontendDesignTemplateId',
    endpoints: {
      list: `/api/admin/sites/${siteId}/blog`,
      create: `/api/admin/sites/${siteId}/blog`,
      detail: `/api/admin/sites/${siteId}/blog/{postId}`,
      readiness: `/api/admin/sites/${siteId}/blog/{postId}/readiness`,
      publish: `/api/admin/sites/${siteId}/blog/{postId}/publish`,
      archive: `/api/admin/sites/${siteId}/blog/{postId}/archive`,
      preview: `/api/admin/sites/${siteId}/blog/{postId}/preview`,
      revisions: `/api/admin/sites/${siteId}/blog/{postId}/revisions`,
      rollback: `/api/admin/sites/${siteId}/blog/{postId}/rollback`,
      templateRegistry: `/api/admin/sites/${siteId}/templates?type=blogPost`,
    },
    methods: {
      list: 'GET',
      create: 'POST',
      read: 'GET',
      update: 'PATCH',
      delete: 'DELETE',
      readiness: 'GET',
      publish: 'POST',
      archive: 'POST',
      preview: 'POST',
      revisions: 'GET',
      rollback: 'POST',
    },
    auth: {
      modes: ['session', 'api-key'],
      headers: ['Authorization', 'x-backy-admin-session', 'x-backy-admin-key', 'x-api-key'],
      requiredPermissions: {
        read: 'pages.view',
        create: 'pages.edit',
        update: 'pages.edit',
        delete: 'pages.delete',
        publish: 'pages.publish',
      },
      siteScope: true,
    },
    sdkHelpers: {
      list: 'adminBlogPosts',
      create: 'createAdminBlogPost',
      read: 'adminBlogPost',
      update: 'updateAdminBlogPost',
      delete: 'deleteAdminBlogPost',
      readiness: 'adminBlogPostReadiness',
      publish: 'publishAdminBlogPost',
      archive: 'archiveAdminBlogPost',
      preview: 'createAdminBlogPostPreviewToken',
      revisions: 'adminBlogPostRevisions',
      rollback: 'rollbackAdminBlogPost',
    },
    responseContracts: {
      list: 'backy.admin-blog-posts.v1',
      detail: 'backy.admin-blog-post.v1',
      readiness: 'backy.blog-post-readiness.v1',
      preview: 'backy.preview-token.v1',
      revisions: 'backy.admin-blog-post-revisions.v1',
      revisionBranchMetadata: 'backy.content-revision-branch-metadata.v1',
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
    publicOrderStatus: `/api/sites/${siteId}/commerce/orders?orderId={orderId}&statusToken={statusToken}`,
    providerWebhook: `/api/sites/${siteId}/commerce/webhook`,
    productCollectionRecords: `/api/sites/${siteId}/collections/${PRODUCT_COLLECTION_SLUG}/records`,
  },
  methods: {
    catalog: 'GET',
    productDetail: 'GET',
    orderContract: 'GET',
    createOrder: 'POST',
    publicOrderStatus: 'GET',
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
    authenticatedManagement: true,
    productAdmin: true,
    orderAdmin: true,
    providerOperations: true,
    fulfillmentOperations: true,
    reconciliation: true,
    customerStatusHandoff: true,
    publicOrderStatusRefresh: true,
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
    publicOrderStatus: 'private-no-store',
    providerWebhook: 'private-no-store',
  },
  privacy: {
    publicCatalogExcludesPrivateOrderQueue: true,
    ordersCollectionMustRemainPrivate: true,
    publicOrderPayloadContainsCustomerData: true,
    publicOrderStatusUsesOneTimeReturnedToken: true,
    publicOrderStatusTokenStoredAsHashOnly: true,
    providerSecretsNeverReturned: true,
  },
  managementPolicy: {
    schemaVersion: 'backy.commerce-management.v1',
    endpoints: {
      products: `/api/admin/sites/${siteId}/collections/${PRODUCT_COLLECTION_SLUG}/records`,
      product: `/api/admin/sites/${siteId}/collections/${PRODUCT_COLLECTION_SLUG}/records/{productId}`,
      productsCsv: `/api/admin/sites/${siteId}/collections/${PRODUCT_COLLECTION_SLUG}/records?format=csv`,
      importProducts: `/api/admin/sites/${siteId}/collections/${PRODUCT_COLLECTION_SLUG}/records/import`,
      bulkProducts: `/api/admin/sites/${siteId}/collections/${PRODUCT_COLLECTION_SLUG}/records/bulk`,
      orders: `/api/admin/sites/${siteId}/collections/orders/records`,
      order: `/api/admin/sites/${siteId}/collections/orders/records/{orderId}`,
      ordersCsv: `/api/admin/sites/${siteId}/collections/orders/records?format=csv`,
      importOrders: `/api/admin/sites/${siteId}/collections/orders/records/import`,
      bulkOrders: `/api/admin/sites/${siteId}/collections/orders/records/bulk`,
      orderAnalytics: `/api/admin/sites/${siteId}/commerce/orders/analytics`,
      orderStatusHandoff: `/api/admin/sites/${siteId}/commerce/orders/{orderId}/status-handoff`,
      orderQuote: `/api/admin/sites/${siteId}/commerce/orders/{orderId}/quote`,
      orderTracking: `/api/admin/sites/${siteId}/commerce/orders/{orderId}/tracking`,
      orderFulfillment: `/api/admin/sites/${siteId}/commerce/orders/{orderId}/fulfillment`,
      orderShippingLabel: `/api/admin/sites/${siteId}/commerce/orders/{orderId}/shipping-label`,
      orderProviderRefund: `/api/admin/sites/${siteId}/commerce/orders/{orderId}/provider-refund`,
      productProviderSync: `/api/admin/sites/${siteId}/commerce/products/{productId}/provider-sync`,
      productSubscriptions: `/api/admin/sites/${siteId}/commerce/products/{productId}/subscriptions`,
      productSubscriptionAction: `/api/admin/sites/${siteId}/commerce/products/{productId}/subscriptions/{orderId}/action`,
      siteReconciliation: `/api/admin/sites/${siteId}/commerce/reconcile`,
      platformReconciliation: '/api/admin/commerce/reconcile',
      reconciliationReadiness: '/api/admin/commerce/reconcile/readiness',
      orderEvents: `/api/sites/${siteId}/events?kind=commerce-order`,
      productEvents: `/api/sites/${siteId}/events?kind=commerce-product`,
    },
    methods: {
      listProducts: 'GET',
      createProduct: 'POST',
      readProduct: 'GET',
      updateProduct: 'PATCH',
      deleteProduct: 'DELETE',
      exportProductsCsv: 'GET',
      importProductsCsv: 'POST',
      bulkProducts: 'POST',
      listOrders: 'GET',
      createOrderRecord: 'POST',
      readOrder: 'GET',
      updateOrder: 'PATCH',
      deleteOrder: 'DELETE',
      exportOrdersCsv: 'GET',
      importOrdersCsv: 'POST',
      bulkOrders: 'POST',
      orderAnalytics: 'GET',
      orderStatusHandoff: 'GET',
      orderQuote: 'GET',
      refreshOrderQuote: 'POST',
      orderTracking: 'GET',
      refreshOrderTracking: 'POST',
      orderFulfillment: 'GET',
      dispatchOrderFulfillment: 'POST',
      orderShippingLabel: 'GET',
      createOrderShippingLabel: 'POST',
      voidOrderShippingLabel: 'DELETE',
      orderProviderRefund: 'GET',
      createOrderProviderRefund: 'POST',
      refreshOrderProviderRefund: 'PATCH',
      productProviderSync: 'GET',
      syncProductProvider: 'POST',
      productSubscriptions: 'GET',
      productSubscriptionAction: 'POST',
      scheduledSiteReconciliation: 'GET',
      runSiteReconciliation: 'POST',
      platformReconciliation: 'GET',
      reconciliationReadiness: 'GET',
      orderEvents: 'GET',
      productEvents: 'GET',
    },
    auth: {
      modes: ['session', 'api-key'],
      headers: ['Authorization', 'x-backy-admin-session', 'x-backy-admin-key', 'x-api-key'],
      requiredPermissions: {
        read: 'commerce.view',
        write: 'commerce.edit',
        configure: 'commerce.configure',
        delete: 'commerce.delete',
        collectionRead: 'collections.view',
        collectionWrite: 'collections.edit',
        collectionExport: 'collections.export',
        collectionDelete: 'collections.delete',
        pageTemplates: 'pages.edit',
        mediaRead: 'media.view',
        mediaCreate: 'media.create',
        activity: 'activity.export',
      },
      siteScope: true,
      platformEndpoints: ['platformReconciliation', 'reconciliationReadiness'],
    },
    sdkHelpers: {
      listProducts: 'adminCommerceProducts',
      createProduct: 'createAdminCommerceProduct',
      readProduct: 'adminCommerceProduct',
      updateProduct: 'updateAdminCommerceProduct',
      deleteProduct: 'deleteAdminCommerceProduct',
      exportProductsCsv: 'adminCommerceProductsCsv',
      importProductsCsv: 'importAdminCommerceProductsCsv',
      bulkProducts: 'bulkAdminCommerceProducts',
      listOrders: 'adminCommerceOrders',
      createOrderRecord: 'createAdminCommerceOrder',
      readOrder: 'adminCommerceOrder',
      updateOrder: 'updateAdminCommerceOrder',
      deleteOrder: 'deleteAdminCommerceOrder',
      exportOrdersCsv: 'adminCommerceOrdersCsv',
      importOrdersCsv: 'importAdminCommerceOrdersCsv',
      bulkOrders: 'bulkAdminCommerceOrders',
      orderAnalytics: 'commerceOrderAnalytics',
      orderStatusHandoff: 'commerceOrderStatusHandoff',
      orderQuote: 'commerceOrderQuote',
      refreshOrderQuote: 'refreshCommerceOrderQuote',
      orderTracking: 'commerceOrderTracking',
      refreshOrderTracking: 'refreshCommerceOrderTracking',
      orderFulfillment: 'commerceOrderFulfillment',
      dispatchOrderFulfillment: 'dispatchCommerceOrderFulfillment',
      orderShippingLabel: 'commerceOrderShippingLabel',
      createOrderShippingLabel: 'createCommerceOrderShippingLabel',
      voidOrderShippingLabel: 'voidCommerceOrderShippingLabel',
      orderProviderRefund: 'commerceOrderProviderRefund',
      createOrderProviderRefund: 'createCommerceOrderProviderRefund',
      refreshOrderProviderRefund: 'refreshCommerceOrderProviderRefund',
      productProviderSync: 'commerceProductProviderSync',
      syncProductProvider: 'syncCommerceProductProvider',
      productSubscriptions: 'commerceProductSubscriptions',
      productSubscriptionAction: 'runCommerceProductSubscriptionAction',
      siteReconciliation: 'runCommerceReconciliation',
      scheduledSiteReconciliation: 'scheduledCommerceReconciliation',
      platformReconciliation: 'scheduledPlatformCommerceReconciliation',
      reconciliationReadiness: 'commerceReconciliationReadiness',
      orderEvents: 'orderDeliveryEvents',
      productEvents: 'productNotificationEvents',
    },
    responseContracts: {
      productRecords: 'backy.collection-records.v1',
      productRecord: 'backy.collection-record.v1',
      orderRecords: 'backy.collection-records.v1',
      orderRecord: 'backy.collection-record.v1',
      orderAnalytics: 'backy.order-analytics.v1',
      orderStatusHandoff: 'backy.order-status-handoff.v1',
      orderQuote: 'backy.order-quote.v1',
      orderTracking: 'backy.tracking.v1',
      orderFulfillment: 'backy.fulfillment-dispatch.v1',
      orderShippingLabel: 'backy.shipping-label.v1',
      orderProviderRefund: 'backy.provider-refund.v1',
      productProviderSync: 'backy.commerce-product-sync.v1',
      productStorefrontHandoff: 'backy.product-storefront-handoff.v1',
      productSubscriptions: 'backy.product-subscription-lifecycle.v1',
      productSubscriptionAction: 'backy.product-subscription-action.v1',
      siteReconciliation: 'backy.commerce-reconciliation.v1',
      platformReconciliation: 'backy.commerce-reconciliation-batch.v1',
      reconciliationReadiness: 'backy.commerce-reconciliation-readiness.v1',
      providerCertification: 'backy.commerce-provider-certification-handoff.v1',
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
    secretHandling: 'Commerce management routes require authenticated admin requests; discovery exposes route templates, permission names, SDK helper names, and non-secret provider-certification gates while keeping provider secrets, raw order records, and customer payloads private.',
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
    orderStatusHandoff: 'backy.order-status-handoff.v1',
    orderStatusAccess: 'backy.order-status-access.v1',
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
      authenticatedManagement: true,
      formBuilderManagement: true,
      submissionModeration: true,
      contactCrm: true,
      deliveryRetries: true,
      consentRetention: true,
      persistenceCertification: true,
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
    managementPolicy: {
      schemaVersion: 'backy.forms-management.v1',
      endpoints: {
        adminList: `/api/admin/sites/${siteId}/forms`,
        create: `/api/admin/sites/${siteId}/forms`,
        detail: `/api/admin/sites/${siteId}/forms/{formId}`,
        clone: `/api/admin/sites/${siteId}/forms/{formId}/clone`,
        embedBlock: `/api/admin/sites/${siteId}/forms/{formId}/embed-block`,
        analytics: `/api/admin/sites/${siteId}/forms/analytics`,
        contactSegments: `/api/admin/sites/${siteId}/forms/contact-segments`,
        contactLists: `/api/admin/sites/${siteId}/forms/contact-lists`,
        consentRetention: `/api/admin/sites/${siteId}/forms/consent-retention`,
        submissions: `/api/admin/sites/${siteId}/forms/{formId}/submissions`,
        submission: `/api/admin/sites/${siteId}/forms/{formId}/submissions/{submissionId}`,
        reviewSubmission: `/api/admin/sites/${siteId}/forms/{formId}/submissions/{submissionId}/review`,
        retryWebhook: `/api/admin/sites/${siteId}/forms/{formId}/submissions/{submissionId}/webhook-retry`,
        retryEmail: `/api/admin/sites/${siteId}/forms/{formId}/submissions/{submissionId}/email-retry`,
        formConsentRetention: `/api/admin/sites/${siteId}/forms/{formId}/consent-retention`,
        contacts: `/api/admin/sites/${siteId}/forms/{formId}/contacts`,
        contact: `/api/admin/sites/${siteId}/forms/{formId}/contacts/{contactId}`,
        importContacts: `/api/admin/sites/${siteId}/forms/{formId}/contacts/import`,
        syncContacts: `/api/admin/sites/${siteId}/forms/{formId}/contacts/sync`,
        promoteContactUser: `/api/admin/sites/${siteId}/forms/{formId}/contacts/{contactId}/promote`,
        promoteContactCustomer: `/api/admin/sites/${siteId}/forms/{formId}/contacts/{contactId}/promote-customer`,
        contactConsentRetention: `/api/admin/sites/${siteId}/forms/{formId}/contacts/consent-retention`,
      },
      methods: {
        list: 'GET',
        create: 'POST',
        update: 'PATCH',
        delete: 'DELETE',
        clone: 'POST',
        embedBlock: 'POST',
        analytics: 'GET',
        contactSegments: 'GET',
        contactLists: 'GET',
        saveContactList: 'POST',
        deleteContactList: 'DELETE',
        consentRetention: 'POST',
        submissions: 'GET',
        submission: 'GET',
        updateSubmission: 'PATCH',
        reviewSubmission: 'POST',
        retryWebhook: 'POST',
        retryEmail: 'POST',
        formConsentRetention: 'POST',
        contacts: 'GET',
        createContact: 'POST',
        updateContact: 'PATCH',
        deleteContact: 'DELETE',
        importContacts: 'POST',
        syncContacts: 'POST',
        promoteContactUser: 'POST',
        promoteContactCustomer: 'POST',
        contactConsentRetention: 'POST',
      },
      auth: {
        modes: ['session', 'api-key'],
        headers: ['Authorization', 'x-backy-admin-session', 'x-backy-admin-key', 'x-api-key'],
        requiredPermissions: {
          read: 'forms.view',
          create: 'forms.create',
          update: 'forms.edit',
          manage: 'forms.manage',
          export: 'forms.export',
          delete: 'forms.delete',
          activity: 'activity.export',
        },
        siteScope: true,
      },
      sdkHelpers: {
        list: 'adminForms',
        create: 'createAdminForm',
        detail: 'adminForm',
        update: 'updateAdminForm',
        delete: 'deleteAdminForm',
        clone: 'cloneAdminForm',
        embedBlock: 'createAdminFormEmbedBlock',
        analytics: 'formsAnalytics',
        contactSegments: 'formContactSegments',
        contactLists: 'formContactLists',
        saveContactList: 'saveFormContactList',
        deleteContactList: 'deleteFormContactList',
        submissions: 'formSubmissions',
        submission: 'formSubmission',
        updateSubmission: 'updateFormSubmission',
        reviewSubmission: 'reviewFormSubmission',
        retryWebhook: 'retryFormSubmissionWebhook',
        retryEmail: 'retryFormSubmissionEmail',
        formConsentRetention: 'applyAdminFormConsentRetention',
        formsConsentRetention: 'applyAdminFormsConsentRetention',
        contacts: 'formContacts',
        createContact: 'createFormContact',
        updateContact: 'updateFormContact',
        importContacts: 'importFormContactsCsv',
        syncContacts: 'syncFormContacts',
        promoteContactUser: 'promoteFormContactToUser',
        promoteContactCustomer: 'promoteFormContactToCustomer',
        contactConsentRetention: 'applyFormContactConsentRetention',
      },
      responseContracts: {
        list: 'backy.admin-forms.v1',
        item: 'backy.admin-form.v1',
        persistenceCertification: 'backy.forms-persistence-certification.v1',
        scenarioEvidence: 'backy.forms-persistence-scenario-evidence.v1',
        embedBlock: 'backy.form-embed-block.v1',
        submissions: 'backy.form-submissions.v1',
        submission: 'backy.form-submission.v1',
        deliveryRetry: 'backy.form-delivery-retry.v1',
        contacts: 'backy.form-contacts.v1',
        contact: 'backy.form-contact.v1',
        contactSegments: 'backy.form-contact-segments.v1',
        contactLists: 'backy.form-contact-lists.v1',
        consentRetention: 'backy.form-consent-retention.v1',
      },
      privacy: {
        publicDefinitionsExcludeSubmissions: true,
        submissionsArePrivate: true,
        contactsArePrivate: true,
        deliveryRetriesMayContainVisitorPayloads: true,
        databaseCredentialsNeverReturned: true,
      },
      secretHandling: 'Forms management routes require authenticated admin requests; discovery exposes only route templates, permission names, SDK helper names, and non-secret persistence certification gates.',
    },
    schemas: {
      definition: 'backy.form-definition.v1',
      validationError: 'FORM_VALIDATION_ERROR',
      collectionRecordLink: 'backy.form-collection-record-link.v1',
    },
  };
};

const buildManifestNewsletterDiscovery = (
  siteId: string,
  forms: FormDefinition[],
) => {
  const newsletterForms = forms.filter(isNewsletterForm);

  return {
    schemaVersion: NEWSLETTER_SUBSCRIBERS_SCHEMA_VERSION,
    count: newsletterForms.length,
    activeCount: newsletterForms.filter((form) => form.isActive).length,
    endpoints: {
      publicSubscribers: `/api/sites/${siteId}/newsletter/subscribers`,
      adminSubscribers: `/api/admin/sites/${siteId}/newsletter/subscribers`,
      forms: `/api/sites/${siteId}/forms`,
      contactSegments: `/api/admin/sites/${siteId}/forms/contact-segments`,
      contactLists: `/api/admin/sites/${siteId}/forms/contact-lists`,
      syncContacts: `/api/admin/sites/${siteId}/forms/{formId}/contacts/sync`,
      adminWorkspace: `/newsletter?siteId=${siteId}`,
    },
    methods: {
      subscribe: 'POST',
      unsubscribe: 'DELETE',
      adminList: 'GET',
      adminUpsert: 'POST',
      syncContacts: 'POST',
    },
    sdkHelpers: {
      subscribe: 'subscribeNewsletter',
      unsubscribe: 'unsubscribeNewsletter',
      adminList: 'newsletterSubscribers',
      adminUpsert: 'upsertNewsletterSubscriber',
      syncContacts: 'syncFormContacts',
    },
    forms: newsletterForms.map((form) => ({
      id: form.id,
      name: form.name,
      title: form.title || null,
      active: form.isActive,
      fields: form.fields.map((field) => ({
        key: field.key,
        label: field.label,
        type: field.type,
        required: Boolean(field.required),
      })),
      definitionUrl: `/api/sites/${siteId}/forms/${form.id}/definition`,
      submitUrl: `/api/sites/${siteId}/forms/${form.id}/submissions`,
    })),
    sampleSubscribePayload: {
      email: 'reader@example.com',
      name: 'Reader',
      topics: 'Investigations',
      consent: true,
      source: 'custom frontend newsletter form',
    },
    syncPolicy: {
      schemaVersion: 'backy.newsletter-sync-boundary.v1',
      routeTemplate: `/api/admin/sites/${siteId}/forms/{formId}/contacts/sync`,
      payloadKind: 'contact-sync',
      targetBody: {
        targetUrl: 'https://newsletter-provider-worker.example.com/sync',
        reason: 'newsletter-provider-sync',
        includeSourceValues: false,
      },
      adminOnly: true,
      useCase: 'Send selected Backy contact/subscriber records to an external delivery provider worker without exposing provider credentials to public pages or frontend repositories.',
    },
    canvasRoutes: {
      newsletterPage: `/pages/new?siteId=${siteId}&template=newsletter&templateSource=backy-canvas&focus=canvas`,
      blogPost: `/blog/new?siteId=${siteId}&templateSource=backy-canvas&focus=canvas`,
    },
    providerBoundary: {
      nativeBackyScope: ['subscriber records', 'consent evidence', 'topic/source metadata', 'CSV export', 'private subscriber API', 'public signup API'],
      deliveryProviderScope: ['mailbox delivery', 'unsubscribe links in delivered email', 'bounce handling', 'SPF/DKIM/DMARC', 'abuse monitoring', 'IP/domain reputation'],
      secretPolicy: 'Provider API keys stay server-side in Settings/environment variables; public manifests expose only subscriber API contracts and route templates.',
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
        completionStatus: buildBackyCompletionStatus(),
        customFrontendAgentHandoff: buildCustomFrontendAgentHandoff(input.site.id, {
          slug: input.site.slug,
          customDomain: input.site.customDomain,
          domainVerificationDomain: input.site.settings?.domainVerification?.domain,
        }),
        schemas: {
          manifest: 'https://backy.dev/schemas/ai-frontend-contract/frontend-manifest.schema.json',
          renderPayload: 'https://backy.dev/schemas/ai-frontend-contract/content-payload.schema.json',
          themeTokens: 'https://backy.dev/schemas/ai-frontend-contract/theme-tokens.schema.json',
          elementActions: 'https://backy.dev/schemas/ai-frontend-contract/element-actions.schema.json',
          dataBindings: 'https://backy.dev/schemas/ai-frontend-contract/data-bindings.schema.json',
          editableMap: 'https://backy.dev/schemas/ai-frontend-contract/editable-map.schema.json',
          customFrontendAgentHandoff: 'https://backy.dev/schemas/ai-frontend-contract/frontend-manifest.schema.json#/$defs/customFrontendAgentHandoff',
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
        agentHandoff: `/api/sites/${input.site.id}/agent-handoff`,
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
        customFrontendAgentHandoff: `/api/sites/${input.site.id}/manifest#data.contract.customFrontendAgentHandoff`,
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
        newsletterRuntime: buildManifestNewsletterDiscovery(input.site.id, input.forms),
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
      fonts: input.media.filter((item) => item.type === 'font').length,
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
          completionStatus: buildBackyCompletionStatus(),
          customFrontendAgentHandoff: buildCustomFrontendAgentHandoff(site.id, {
            slug: site.slug,
            customDomain: site.customDomain,
            domainVerificationDomain: site.settings?.domainVerification?.domain,
          }),
          schemas: {
            manifest: 'https://backy.dev/schemas/ai-frontend-contract/frontend-manifest.schema.json',
            renderPayload: 'https://backy.dev/schemas/ai-frontend-contract/content-payload.schema.json',
            themeTokens: 'https://backy.dev/schemas/ai-frontend-contract/theme-tokens.schema.json',
            elementActions: 'https://backy.dev/schemas/ai-frontend-contract/element-actions.schema.json',
            dataBindings: 'https://backy.dev/schemas/ai-frontend-contract/data-bindings.schema.json',
            editableMap: 'https://backy.dev/schemas/ai-frontend-contract/editable-map.schema.json',
            customFrontendAgentHandoff: 'https://backy.dev/schemas/ai-frontend-contract/frontend-manifest.schema.json#/$defs/customFrontendAgentHandoff',
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
          agentHandoff: `/api/sites/${site.id}/agent-handoff`,
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
          customFrontendAgentHandoff: `/api/sites/${site.id}/manifest#data.contract.customFrontendAgentHandoff`,
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
          newsletterRuntime: buildManifestNewsletterDiscovery(site.id, forms),
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
        fonts: fonts.length,
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
