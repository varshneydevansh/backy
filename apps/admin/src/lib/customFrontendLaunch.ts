import type { SiteFrontendDesignContract } from '@backy-cms/core';

export type DashboardCustomFrontendControlStatus = 'ready' | 'review' | 'manual';
export type DashboardCustomFrontendTemplateType =
  | 'page'
  | 'blogPost'
  | 'section'
  | 'form'
  | 'product'
  | 'collection';

export interface DashboardCustomFrontendControlCheck {
  id: string;
  label: string;
  status: DashboardCustomFrontendControlStatus;
  owner: 'backy' | 'operator';
  detail: string;
}

export interface DashboardCustomFrontendNextAction {
  schemaVersion: 'backy.dashboard-custom-frontend-next-action.v1';
  id: string;
  label: string;
  detail: string;
  owner: 'backy' | 'operator';
  readinessStatus: DashboardCustomFrontendControlStatus;
  target: string;
}

export interface DashboardCustomFrontendLaunch {
  schemaVersion: 'backy.dashboard-custom-frontend-launch.v1';
  domainOwner: 'custom-frontend-vercel-project';
  projectBoundaries: {
    admin: string;
    publicApi: string;
    website: string;
  };
  site: {
    id: string;
    name: string;
    publicHost: string;
  };
  publicApiBase: string;
  endpoints: {
    agentHandoff: string;
    manifest: string;
    openApi: string;
    renderWithHost: string;
  };
  browserSafeEnv: Record<string, string>;
  serverSideEnv: Record<string, string>;
  forbiddenEnv: string[];
}

export interface DashboardCustomFrontendControlReadiness {
  schemaVersion: 'backy.dashboard-custom-frontend-control-readiness.v1';
  status: 'needs-review' | 'backy-ready-manual-externals' | 'ready';
  expectedProbe: '/api/backy-connection';
  readyCount: number;
  reviewCount: number;
  manualCount: number;
  total: number;
  backyReadyCount: number;
  backyTotal: number;
  nextAction: DashboardCustomFrontendNextAction;
  verifierRoute: string;
  checks: DashboardCustomFrontendControlCheck[];
}

export interface DashboardCustomFrontendAgentBrief {
  schemaVersion: 'backy.dashboard-custom-frontend-agent-brief.v1';
  source: 'backy-dashboard';
  site: DashboardCustomFrontendLaunch['site'];
  readOrder: string[];
  env: {
    browserSafe: DashboardCustomFrontendLaunch['browserSafeEnv'];
    serverLoader: DashboardCustomFrontendLaunch['serverSideEnv'];
    forbidden: string[];
  };
  commands: {
    scaffold: string;
    verifyDeployed: string;
  };
  readiness: {
    status: DashboardCustomFrontendControlReadiness['status'];
    backyReady: string;
    manualGates: string[];
    nextAction: DashboardCustomFrontendNextAction;
  };
  rules: string[];
}

export const DASHBOARD_CUSTOM_FRONTEND_TEMPLATE_TYPES: DashboardCustomFrontendTemplateType[] = [
  'page',
  'blogPost',
  'section',
  'form',
  'product',
  'collection',
];

const buildRecommendedRepoName = (publicHost: string, siteId: string) => (
  `${publicHost || siteId}-frontend`
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-') || 'backy-custom-frontend'
);

export const buildDashboardCustomFrontendLaunch = ({
  activeSiteId,
  activeSiteName,
  customFrontendPublicHost,
  publicBaseUrl,
}: {
  activeSiteId: string;
  activeSiteName: string;
  customFrontendPublicHost: string;
  publicBaseUrl: string;
}): DashboardCustomFrontendLaunch => {
  const publicApiBase = `${publicBaseUrl}/api`;
  const encodedSiteId = encodeURIComponent(activeSiteId);

  return {
    schemaVersion: 'backy.dashboard-custom-frontend-launch.v1',
    domainOwner: 'custom-frontend-vercel-project',
    projectBoundaries: {
      admin: 'backy-admin stays protected and never owns the public website domain.',
      publicApi: 'backy-public serves public read/render APIs and protected admin API routes.',
      website: 'The separate custom website frontend project owns the production domain.',
    },
    site: {
      id: activeSiteId,
      name: activeSiteName,
      publicHost: customFrontendPublicHost,
    },
    publicApiBase,
    endpoints: {
      agentHandoff: `${publicApiBase}/sites/${encodedSiteId}/agent-handoff`,
      manifest: `${publicApiBase}/sites/${encodedSiteId}/manifest`,
      openApi: `${publicApiBase}/sites/${encodedSiteId}/openapi`,
      renderWithHost: `${publicApiBase}/sites/${encodedSiteId}/render?path=/&domain=${encodeURIComponent(customFrontendPublicHost)}`,
    },
    browserSafeEnv: {
      NEXT_PUBLIC_BACKY_API_BASE_URL: publicApiBase,
      NEXT_PUBLIC_BACKY_SITE_ID: activeSiteId,
      NEXT_PUBLIC_BACKY_SITE_PUBLIC_HOST: customFrontendPublicHost,
    },
    serverSideEnv: {
      BACKY_PUBLIC_API_BASE_URL: publicApiBase,
      BACKY_SITE_ID: activeSiteId,
      BACKY_SITE_PUBLIC_HOST: customFrontendPublicHost,
    },
    forbiddenEnv: [
      'DATABASE_URL',
      'POSTGRES_URL',
      'SUPABASE_SERVICE_ROLE_KEY',
      'BACKY_ADMIN_BOOTSTRAP_TOKEN',
      'BACKY_CRON_SECRET',
      'provider API keys',
      'admin session cookies',
    ],
  };
};

export const buildDashboardCustomFrontendControlReadiness = ({
  activeSiteId,
  frontendDesign,
  publicApiBase,
}: {
  activeSiteId: string;
  frontendDesign?: SiteFrontendDesignContract | null;
  publicApiBase: string;
}): DashboardCustomFrontendControlReadiness => {
  const hasDesignContract = Boolean(frontendDesign && frontendDesign.status !== 'unconfigured');
  const hasCustomFrontendSource = Boolean(
    frontendDesign?.source?.type === 'custom-frontend' &&
    frontendDesign.source.url,
  );
  const templateTypes = new Set((frontendDesign?.templates || []).map((template) => template.type));
  const missingTemplateTypes = DASHBOARD_CUSTOM_FRONTEND_TEMPLATE_TYPES.filter((type) => !templateTypes.has(type));
  const activeTemplates = (frontendDesign?.templates || []).filter((template) => (
    template.status !== 'archived' && template.status !== 'deprecated'
  ));
  const versionedTemplates = activeTemplates.filter((template) => (
    template.version !== undefined &&
    template.version !== null &&
    Boolean(template.updatedAt)
  ));
  const templatesReady =
    missingTemplateTypes.length === 0 &&
    (frontendDesign?.templates.length || 0) > 0 &&
    versionedTemplates.length === activeTemplates.length;
  const verifierRoute = `/sites/${encodeURIComponent(activeSiteId)}#site-custom-frontend-verifier`;
  const checks: DashboardCustomFrontendControlCheck[] = [
    {
      id: 'public-api-contract',
      label: 'Backy public API',
      status: 'ready',
      owner: 'backy',
      detail: `Agent handoff, manifest, OpenAPI, and render endpoints start at ${publicApiBase}.`,
    },
    {
      id: 'frontend-design-source',
      label: 'Frontend design source',
      status: hasCustomFrontendSource ? 'ready' : 'review',
      owner: 'backy',
      detail: hasCustomFrontendSource
        ? `${frontendDesign?.source.url} is synced as this site's custom frontend design source.`
        : hasDesignContract
          ? 'A design contract exists, but it is not synced to a verified custom frontend source URL yet.'
          : 'Open Site Detail to capture defaults or sync a verified custom frontend before generating custom-designed content.',
    },
    {
      id: 'template-registry',
      label: 'Template registry',
      status: templatesReady ? 'ready' : 'review',
      owner: 'backy',
      detail: templatesReady
        ? `${frontendDesign?.templates.length || 0} versioned templates cover page, blog, section, form, product, and collection creation.`
        : missingTemplateTypes.length > 0
          ? `Missing template types: ${missingTemplateTypes.join(', ')}.`
          : 'Prepare template version metadata before frontend-template cloning is considered launch-ready.',
    },
    {
      id: 'deployed-frontend-verifier',
      label: 'Deployed frontend verifier',
      status: 'review',
      owner: 'backy',
      detail:
        'Run the Site Detail verifier against the deployed website so /api/backy-connection and data-backy-* DOM control attributes are proven before DNS moves.',
    },
    {
      id: 'public-domain-owner',
      label: 'Public domain owner',
      status: 'manual',
      owner: 'operator',
      detail:
        'Attach the production website domain to the separate custom frontend Vercel project, not to backy-admin or backy-public.',
    },
    {
      id: 'vercel-git-previews',
      label: 'Vercel Git previews',
      status: 'manual',
      owner: 'operator',
      detail:
        'Production can run from manual deploys; branch Preview env waits for Vercel GitHub App access to the private frontend repo.',
    },
  ];
  const backyChecks = checks.filter((check) => check.owner === 'backy');
  const readyCount = checks.filter((check) => check.status === 'ready').length;
  const reviewCount = checks.filter((check) => check.status === 'review').length;
  const manualCount = checks.filter((check) => check.status === 'manual').length;
  const backyReadyCount = backyChecks.filter((check) => check.status === 'ready').length;
  const firstReview = backyChecks.find((check) => check.status === 'review');
  const firstManual = checks.find((check) => check.owner === 'operator' && check.status === 'manual');
  const nextAction: DashboardCustomFrontendNextAction = firstReview
    ? {
      schemaVersion: 'backy.dashboard-custom-frontend-next-action.v1',
      id: `review-${firstReview.id}`,
      label: firstReview.label,
      detail: firstReview.detail,
      owner: firstReview.owner,
      readinessStatus: firstReview.status,
      target: verifierRoute,
    }
    : firstManual
      ? {
        schemaVersion: 'backy.dashboard-custom-frontend-next-action.v1',
        id: `operator-${firstManual.id}`,
        label: firstManual.label,
        detail: firstManual.detail,
        owner: firstManual.owner,
        readinessStatus: firstManual.status,
        target: firstManual.id === 'public-domain-owner'
          ? 'custom-frontend-vercel-project-domains'
          : 'custom-frontend-vercel-project-git-settings',
      }
      : {
        schemaVersion: 'backy.dashboard-custom-frontend-next-action.v1',
        id: 'custom-frontend-dashboard-ready',
        label: 'Custom frontend control ready',
        detail: 'Backy dashboard-visible custom frontend checks are ready.',
        owner: 'backy',
        readinessStatus: 'ready',
        target: verifierRoute,
      };

  return {
    schemaVersion: 'backy.dashboard-custom-frontend-control-readiness.v1',
    status:
      reviewCount > 0
        ? 'needs-review'
        : manualCount > 0
          ? 'backy-ready-manual-externals'
          : 'ready',
    expectedProbe: '/api/backy-connection',
    readyCount,
    reviewCount,
    manualCount,
    total: checks.length,
    backyReadyCount,
    backyTotal: backyChecks.length,
    nextAction,
    verifierRoute,
    checks,
  };
};

export const buildDashboardCustomFrontendAgentBrief = ({
  launch,
  readiness,
}: {
  launch: DashboardCustomFrontendLaunch;
  readiness: DashboardCustomFrontendControlReadiness;
}): DashboardCustomFrontendAgentBrief => {
  const recommendedRepoName = buildRecommendedRepoName(launch.site.publicHost, launch.site.id);
  const manualGates = readiness.checks
    .filter((check) => check.owner === 'operator')
    .map((check) => `${check.label}: ${check.detail}`);

  return {
    schemaVersion: 'backy.dashboard-custom-frontend-agent-brief.v1',
    source: 'backy-dashboard',
    site: launch.site,
    readOrder: [
      launch.endpoints.agentHandoff,
      launch.endpoints.manifest,
      launch.endpoints.openApi,
      launch.endpoints.renderWithHost,
    ],
    env: {
      browserSafe: launch.browserSafeEnv,
      serverLoader: launch.serverSideEnv,
      forbidden: launch.forbiddenEnv,
    },
    commands: {
      scaffold: [
        'npm run custom-frontend:scaffold --',
        `--site-id ${launch.site.id}`,
        `--public-host ${launch.site.publicHost}`,
        `--api-base ${launch.publicApiBase}`,
        `--out ../${recommendedRepoName}`,
      ].join(' '),
      verifyDeployed: [
        `BACKY_CUSTOM_FRONTEND_API_BASE_URL=${launch.publicApiBase}`,
        `BACKY_CUSTOM_FRONTEND_SITE_ID=${launch.site.id}`,
        `BACKY_CUSTOM_FRONTEND_SITE_PUBLIC_HOST=${launch.site.publicHost}`,
        'BACKY_CUSTOM_FRONTEND_URL=https://<frontend-domain>',
        'BACKY_CUSTOM_FRONTEND_REQUIRE_LIVE=1',
        'BACKY_CUSTOM_FRONTEND_REQUIRE_FRONTEND=1',
        'BACKY_CUSTOM_FRONTEND_REQUIRE_PROBE=1',
        'npm run test:custom-frontend-connection --silent',
      ].join(' '),
    },
    readiness: {
      status: readiness.status,
      backyReady: `${readiness.backyReadyCount}/${readiness.backyTotal}`,
      manualGates,
      nextAction: readiness.nextAction,
    },
    rules: [
      'Start from agent-handoff, manifest, OpenAPI, and render payloads before writing frontend routes.',
      'Preserve data-backy-* element ids, component contract pointers, editable-map pointers, and responsive CSS metadata.',
      'Put only NEXT_PUBLIC_BACKY_* in browser bundles; keep database, Supabase service-role, provider, admin, cron, SMTP, and session secrets out of the custom frontend.',
      'Attach the public website domain to the separate custom frontend Vercel project after the Backy verifier is Ready.',
    ],
  };
};
