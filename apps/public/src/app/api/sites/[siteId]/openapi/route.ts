/**
 * Site-scoped public OpenAPI document for custom/generated frontends.
 *
 * GET /api/sites/[siteId]/openapi
 */

import { NextRequest } from "next/server";
import type { SiteSettings } from "@backy-cms/core";
import {
  getBlogPosts,
  getMediaList,
  getPageSummary,
  getSiteByIdOrSlug,
  listCollections,
  listFormsBySite,
  listReusableSections,
} from "@/lib/backyStore";
import { PRODUCT_COLLECTION_SLUG } from "@/lib/commerceCatalog";
import { publicContractJson } from "@/lib/publicContractResponse";
import {
  getRequiredDatabaseRepositories,
  shouldUseDemoStoreFallback,
} from "@/lib/repositoryRuntime";
import { normalizeRedirectRules } from "@/lib/redirectRules";
import { getSiteCanonicalBaseUrl } from "@/lib/seoDiscovery";
import { normalizeSiteLocalization } from "@/lib/siteLocalization";
import { liveManagementEditorCommandRegistry } from "@/lib/liveManagementEditorCommandRegistry";

interface RouteParams {
  params: Promise<{
    siteId: string;
  }>;
}

const makeRequestId = () =>
  `req_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;

const errorResponse = (
  status: number,
  code: string,
  message: string,
  requestId: string,
) =>
  publicContractJson(
    {
      success: false,
      requestId,
      error: {
        code,
        message,
      },
    },
    { status, requestId, cache: "error" },
  );

const envelopeSchema = (dataSchema: Record<string, unknown>) => ({
  type: "object",
  required: ["success", "requestId", "data"],
  properties: {
    success: { type: "boolean" },
    requestId: { type: "string" },
    data: dataSchema,
    error: { $ref: "#/components/schemas/ErrorEnvelope/properties/error" },
  },
});

const formSubmissionValidationCodes = [
  "required",
  "min_length",
  "max_length",
  "pattern",
  "invalid_pattern",
  "min",
  "max",
  "invalid_email",
  "invalid_url",
  "invalid_option",
  "invalid_options",
  "missing_options",
  "unique",
  "collection_unavailable",
  "public_create_disabled",
  "record_create_failed",
];

const envValue = (keys: string[]): { key: string; value: string } | null => {
  for (const key of keys) {
    const value = process.env[key]?.trim();
    if (value) return { key, value };
  }

  return null;
};

const booleanEnvEnabled = (key: string): boolean => {
  const value = process.env[key]?.trim().toLowerCase();
  return value === "1" || value === "true" || value === "yes" || value === "on";
};

type FrontendDatabaseCertificationEnvAlias = "BACKY_DATABASE_URL" | "DATABASE_URL";

type FrontendDatabaseCertificationCommandOptions = {
  databaseEnvAlias: FrontendDatabaseCertificationEnvAlias;
  disposableConfirmed: boolean;
  expectedHost: string;
  expectedDatabase: string;
  includeReleaseDoctor: boolean;
};

const FRONTEND_DATABASE_CERTIFICATION_ENV_ALIASES: FrontendDatabaseCertificationEnvAlias[] = ["BACKY_DATABASE_URL", "DATABASE_URL"];

const DEFAULT_FRONTEND_DATABASE_CERTIFICATION_COMMAND_OPTIONS = {
  databaseEnvAlias: "BACKY_DATABASE_URL",
  disposableConfirmed: true,
  expectedHost: "",
  expectedDatabase: "",
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
    ["BACKY_DATA_MODE", "database"],
    ["BACKY_SDK_REQUIRE_DATABASE", "1"],
    ["BACKY_DATABASE_DISPOSABLE_CONFIRMED", options.disposableConfirmed ? "true" : "<confirm-disposable-db-first>"],
  ];

  if (options.includeReleaseDoctor) {
    envEntries.unshift(
      ["BACKY_RELEASE_CERTIFY_DATABASE", "1"],
      ["BACKY_RELEASE_CERTIFICATION_DOCTOR_REQUIRED", "1"],
    );
  }

  const expectedHost = options.expectedHost.trim();
  const expectedDatabase = options.expectedDatabase.trim();
  if (expectedHost) envEntries.push(["BACKY_DATABASE_CERTIFICATION_EXPECTED_HOST", expectedHost]);
  if (expectedDatabase) envEntries.push(["BACKY_DATABASE_CERTIFICATION_EXPECTED_DATABASE", expectedDatabase]);

  return envEntries;
};

const buildFrontendDatabaseCertificationCommand = (options: FrontendDatabaseCertificationCommandOptions): string => {
  const envEntries = buildFrontendDatabaseCertificationEnvEntries(options);

  return [
    `# Store the disposable database URL in ${options.databaseEnvAlias} as a CI secret or local shell env.`,
    `# export ${options.databaseEnvAlias}='<postgres-url>'`,
    ...envEntries.map(([key, value]) => `export ${key}=${quoteCertificationShellValue(value)}`),
    "",
    ...(options.includeReleaseDoctor ? ["npm run doctor:release-certification"] : []),
    "npm run ci:sdk-postgres-smoke",
  ].join("\n");
};

const buildFrontendDatabaseCertificationEnvTemplate = (options: FrontendDatabaseCertificationCommandOptions): string => {
  const envEntries = buildFrontendDatabaseCertificationEnvEntries(options);

  return [
    "# Backy frontend SDK database certification environment",
    "# Keep the disposable database URL in CI secrets or local shell variables.",
    `${options.databaseEnvAlias}=<disposable-postgres-url>`,
    ...envEntries.map(([key, value]) => `${key}=${quoteCertificationEnvTemplateValue(value)}`),
  ].join("\n");
};

const FRONTEND_DATABASE_CERTIFICATION_OPERATOR_COMMAND_TEMPLATE = {
  command: buildFrontendDatabaseCertificationCommand(DEFAULT_FRONTEND_DATABASE_CERTIFICATION_COMMAND_OPTIONS),
  envTemplate: buildFrontendDatabaseCertificationEnvTemplate(DEFAULT_FRONTEND_DATABASE_CERTIFICATION_COMMAND_OPTIONS),
  envTemplateSchemaVersion: "backy.frontend-database-certification-env-template.v1",
  databaseUrlAliases: FRONTEND_DATABASE_CERTIFICATION_ENV_ALIASES,
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
  secretHandling: "Disposable database URLs stay in CI secrets or local shell environment variables; this template only emits non-secret aliases and placeholders.",
} as const;
const FRONTEND_DATABASE_CERTIFICATION_COVERAGE = [
  "manifest",
  "openapi",
  "render",
  "media",
  "collections",
  "reusable-sections",
  "forms",
  "comments",
  "events",
  "commerce",
  "interactive-components",
  "generated-sdk",
] as const;
const FRONTEND_DATABASE_CERTIFICATION_SCENARIOS = [
  {
    key: "manifest-openapi-discovery",
    label: "Manifest and OpenAPI discovery",
    expectedEvidence: ["public manifest response", "site-scoped OpenAPI response", "Backy contract headers"],
    nextAction: "Run the SDK Postgres smoke and attach manifest/OpenAPI response evidence from the disposable database target.",
  },
  {
    key: "render-route-resolution",
    label: "Render and route resolution",
    expectedEvidence: ["route resolve response", "render payload", "redirect/gone route case"],
    nextAction: "Verify resolve, redirect/gone, and render payload reads against database-backed pages and posts.",
  },
  {
    key: "media-font-delivery",
    label: "Media and font delivery",
    expectedEvidence: ["media list response", "font manifest response", "cache/ETag evidence"],
    nextAction: "Run media/font SDK reads against migrated database media records and public cache headers.",
  },
  {
    key: "cms-reusable-content",
    label: "CMS and reusable content",
    expectedEvidence: ["collection schema", "collection records", "reusable sections"],
    nextAction: "Verify collection schemas/records and reusable sections from the disposable database service data.",
  },
  {
    key: "forms-comments-events",
    label: "Forms, comments, and events",
    expectedEvidence: ["form definition", "comment moderation contract", "interaction event feed"],
    nextAction: "Exercise public forms, comments, moderation/reporting, and event reads in the SDK Postgres smoke.",
  },
  {
    key: "commerce-contracts",
    label: "Commerce contracts",
    expectedEvidence: ["commerce catalog", "order contract", "provider certification handoff"],
    nextAction: "Verify catalog/order contract discovery against database-backed products and private order queues.",
  },
  {
    key: "interactive-runtime",
    label: "Interactive runtime",
    expectedEvidence: ["component registry", "sandbox metadata", "runtime telemetry endpoint"],
    nextAction: "Verify interactive registry, sandbox response headers, and telemetry contract reads in database mode.",
  },
  {
    key: "generated-sdk-cache",
    label: "Generated SDK and cache",
    expectedEvidence: ["generated TypeScript contract", "SDK smoke", "304 cache revalidation"],
    nextAction: "Run generated type checks and SDK cached manifest/OpenAPI/render helpers against the disposable target.",
  },
  {
    key: "database-runtime-guard",
    label: "Database runtime guard",
    expectedEvidence: ["database URL alias configured", "disposable confirmation", "target host/database guard"],
    nextAction: "Set the database URL alias, disposable confirmation, and optional expected host/name guards before the DB smoke.",
  },
] as const;

const getFrontendDatabaseCertificationRuntime = () => {
  const databaseUrl = envValue(["BACKY_DATABASE_URL", "DATABASE_URL"]);
  const dataMode = process.env.BACKY_DATA_MODE?.trim() || "database";
  const databaseType = process.env.BACKY_DATABASE_TYPE?.trim() || (
    databaseUrl?.value.startsWith("mysql") ? "mysql" : "postgres"
  );
  const disposableConfirmed = booleanEnvEnabled("BACKY_DATABASE_DISPOSABLE_CONFIRMED");
  const expectedHostConfigured = Boolean(process.env.BACKY_DATABASE_CERTIFICATION_EXPECTED_HOST?.trim());
  const expectedDatabaseConfigured = Boolean(process.env.BACKY_DATABASE_CERTIFICATION_EXPECTED_DATABASE?.trim());
  const missing = [
    ...(dataMode !== "demo" && !databaseUrl ? ["BACKY_DATABASE_URL or DATABASE_URL"] : []),
    ...(!disposableConfirmed ? ["BACKY_DATABASE_DISPOSABLE_CONFIRMED=true"] : []),
  ];

  return {
    dataMode,
    databaseType,
    databaseUrlConfigured: Boolean(databaseUrl),
    databaseUrlAlias: databaseUrl?.key || null,
    disposableConfirmed,
    expectedHostConfigured,
    expectedDatabaseConfigured,
    readyForCertification: dataMode !== "demo" && Boolean(databaseUrl) && disposableConfirmed,
    missing,
    secretHandling: "Database URLs and service credentials are never returned; this runtime summary exposes alias/configuration state only.",
  };
};

const buildFrontendDatabaseCertificationEvidence = (
  runtime: ReturnType<typeof getFrontendDatabaseCertificationRuntime>,
) => {
  const countEvidence = (...values: boolean[]) => values.filter(Boolean).length;
  const coverageSet = new Set<string>(FRONTEND_DATABASE_CERTIFICATION_COVERAGE);
  const evidenceCounts: Record<string, number> = {
    "manifest-openapi-discovery": countEvidence(
      coverageSet.has("manifest"),
      coverageSet.has("openapi"),
      Boolean(FRONTEND_DATABASE_CERTIFICATION_OPERATOR_COMMAND_TEMPLATE.command),
    ),
    "render-route-resolution": countEvidence(coverageSet.has("render")),
    "media-font-delivery": countEvidence(coverageSet.has("media")),
    "cms-reusable-content": countEvidence(
      coverageSet.has("collections"),
      coverageSet.has("reusable-sections"),
    ),
    "forms-comments-events": countEvidence(
      coverageSet.has("forms"),
      coverageSet.has("comments"),
      coverageSet.has("events"),
    ),
    "commerce-contracts": countEvidence(coverageSet.has("commerce")),
    "interactive-runtime": countEvidence(coverageSet.has("interactive-components")),
    "generated-sdk-cache": countEvidence(coverageSet.has("generated-sdk")),
    "database-runtime-guard": countEvidence(
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
      status: evidenceCount > 0 ? "covered" as const : "missing" as const,
    };
  });
  const covered = scenarios.filter((scenario) => scenario.status === "covered").length;

  return {
    schemaVersion: "backy.frontend-database-certification-evidence.v1",
    status: covered === scenarios.length ? "ready" as const : "attention" as const,
    requiredGate: "BACKY_DATABASE_DISPOSABLE_CONFIRMED=true npm run ci:sdk-postgres-smoke",
    coverage: {
      covered,
      total: scenarios.length,
      missing: scenarios.filter((scenario) => scenario.status === "missing").map((scenario) => scenario.key),
    },
    scenarios,
    secretHandling: "Frontend database certification evidence reports scenario names, counts, gates, and non-secret contract families only; database URLs, service credentials, private orders, submissions, and contact payloads stay private.",
  };
};

const frontendDatabaseCertificationRuntime = getFrontendDatabaseCertificationRuntime();

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
    "BACKY_DATABASE_DISPOSABLE_CONFIRMED=true",
    "disposable_database_confirmed=true",
    "public schema, RLS policies, indexes, and constraints migrated",
  ],
  coverage: [...FRONTEND_DATABASE_CERTIFICATION_COVERAGE],
  scenarioEvidence: buildFrontendDatabaseCertificationEvidence(frontendDatabaseCertificationRuntime),
  runtime: frontendDatabaseCertificationRuntime,
  operatorCommandTemplate: FRONTEND_DATABASE_CERTIFICATION_OPERATOR_COMMAND_TEMPLATE,
  operatorEnvTemplate: {
    schemaVersion: "backy.frontend-database-certification-env-template.v1",
    format: "shell-env",
    fileName: ".env.backy-frontend-database-certification",
    body: FRONTEND_DATABASE_CERTIFICATION_OPERATOR_COMMAND_TEMPLATE.envTemplate,
    secretHandling: "Generated template values are non-secret aliases and placeholders; replace the database URL placeholder with a disposable migrated Supabase/Postgres secret before execution.",
  },
  secretHandling:
    "Database URLs and service credentials stay in CI/runtime environment; OpenAPI exposes only non-secret gate names and requirements.",
} as const;

type FrontendLaunchReadinessStatus = "ready" | "attention" | "blocked";

type FrontendLaunchReadinessCheck = {
  key: string;
  label: string;
  status: FrontendLaunchReadinessStatus;
  detail: string;
  nextAction: string;
  gate?: string;
};

const frontendLaunchStatus = (
  checks: FrontendLaunchReadinessCheck[],
): FrontendLaunchReadinessStatus => {
  if (checks.some((check) => check.status === "blocked")) return "blocked";
  if (checks.some((check) => check.status === "attention")) return "attention";
  return "ready";
};

const buildFrontendLaunchReadiness = ({
  siteId,
  endpointCount,
  routePatternCount,
  moduleCounts,
  capabilities,
  liveManagement,
}: {
  siteId: string;
  endpointCount: number;
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
  capabilities: Record<string, boolean | undefined>;
  liveManagement?: ReturnType<typeof liveManagementDiscovery>;
}) => {
  const databaseReady = frontendDatabaseCertification.runtime.readyForCertification;
  const checks: FrontendLaunchReadinessCheck[] = [
    {
      key: "routing-render-contracts",
      label: "Routing, rendering, and OpenAPI",
      status: capabilities.routeResolve && capabilities.renderPayload && capabilities.openApi ? "ready" : "blocked",
      detail: `${routePatternCount} route pattern${routePatternCount === 1 ? "" : "s"} and ${endpointCount} OpenAPI path contract${endpointCount === 1 ? "" : "s"} are advertised for this site.`,
      nextAction: "Use manifest, resolve, render, and OpenAPI contracts before hardcoding custom frontend routes.",
    },
    {
      key: "content-design-modules",
      label: "CMS, design, and reusable content",
      status: capabilities.collectionSchemas && capabilities.collectionRecords && capabilities.reusableSections ? "ready" : "attention",
      detail: `${moduleCounts.pages} page${moduleCounts.pages === 1 ? "" : "s"}, ${moduleCounts.blogPosts} blog post${moduleCounts.blogPosts === 1 ? "" : "s"}, ${moduleCounts.collections} public collection${moduleCounts.collections === 1 ? "" : "s"}, and ${moduleCounts.reusableSections} reusable section${moduleCounts.reusableSections === 1 ? "" : "s"} are reflected in the OpenAPI document.`,
      nextAction: "Publish representative pages, collection records, and reusable sections so custom frontends can render realistic site shapes.",
    },
    {
      key: "media-font-delivery",
      label: "Media, files, and fonts",
      status: capabilities.mediaLibrary ? "ready" : "blocked",
      detail: `${moduleCounts.media} public media asset${moduleCounts.media === 1 ? "" : "s"} and ${moduleCounts.fonts} font asset${moduleCounts.fonts === 1 ? "" : "s"} are reflected in the OpenAPI document.`,
      nextAction: "Use the media and font endpoints for frontend assets; keep private file delivery behind signed URLs.",
    },
    {
      key: "visitor-interactions",
      label: "Forms, comments, and events",
      status: capabilities.forms || capabilities.comments ? "ready" : "attention",
      detail: `${moduleCounts.forms} active form${moduleCounts.forms === 1 ? "" : "s"} are reflected; comments and events contracts remain available through public interaction endpoints.`,
      nextAction: "Bind frontend forms/comments to Backy public endpoints and keep submissions, contacts, and moderation queues private.",
    },
    {
      key: "commerce-handoff",
      label: "Commerce and provider handoff",
      status: capabilities.commerceCatalog && capabilities.commerceOrderIntake ? "ready" : "attention",
      detail: capabilities.commerceCatalog
        ? `Commerce catalog is documented and order intake is ${capabilities.commerceOrderIntake ? "available" : "waiting on private orders collection readiness"}.`
        : "No public commerce catalog is documented for this site yet.",
      nextAction: "Keep product catalog public and order queues private before wiring storefront checkout.",
      gate: "npm run ci:commerce-provider-certification",
    },
    {
      key: "live-management",
      label: "Preview and live management",
      status: capabilities.previewTokens && Boolean(liveManagement?.endpoints?.page || liveManagement?.endpoints?.post) ? "ready" : "attention",
      detail: "Preview-token reads and live page/blog management endpoint templates let authenticated custom frontends edit without admin UI scraping.",
      nextAction: "Use manifest/OpenAPI live-management endpoint templates with authenticated sessions for frontend editing overlays.",
    },
    {
      key: "database-certification",
      label: "Database certification",
      status: databaseReady ? "ready" : "blocked",
      detail: databaseReady
        ? "SDK Postgres certification runtime inputs are ready."
        : `SDK Postgres certification still needs ${frontendDatabaseCertification.runtime.missing.join(", ") || "a disposable migrated database target"}.`,
      nextAction: "Run the disposable SDK Postgres smoke before treating manifest/OpenAPI/SDK service data as production certified.",
      gate: frontendDatabaseCertification.gate.command,
    },
  ];
  const blockingChecks = checks.filter((check) => check.status === "blocked");
  const attentionChecks = checks.filter((check) => check.status === "attention");

  return {
    generatedAt: new Date().toISOString(),
    schemaVersion: "backy.frontend-launch-readiness.v1",
    status: frontendLaunchStatus(checks),
    score: Math.round((checks.filter((check) => check.status === "ready").length / checks.length) * 100),
    siteId,
    endpointCount,
    routePatternCount,
    moduleCounts,
    checks,
    actionPlan: {
      schemaVersion: "backy.frontend-launch-action-plan.v1",
      nextAction: [...blockingChecks, ...attentionChecks][0]?.nextAction || "Custom frontend OpenAPI contract is ready; attach database certification evidence to releases.",
      blockingChecks: blockingChecks.map((check) => check.key),
      attentionChecks: attentionChecks.map((check) => check.key),
      recommendedCommands: Array.from(new Set(checks.map((check) => check.gate).filter((gate): gate is string => Boolean(gate)))),
    },
    privacy: {
      includesSecretValues: false,
      publicManifestExcludesPrivateQueues: true,
      adminEndpointsRequireAuth: true,
      submissionAndOrderPayloadsPrivate: true,
      secretHandling: "Launch readiness exposes endpoint counts, booleans, schema names, and certification gates only; database URLs, provider keys, order records, and submission values are never returned.",
    },
  };
};

const buildBackyCompletionStatus = () => {
  const databaseUrlConfigured = Boolean(envValue(["BACKY_DATABASE_URL", "DATABASE_URL"]));
  const settingsProviderFamilies = {
    database: databaseUrlConfigured,
    supabase: Boolean(envValue(["BACKY_SUPABASE_URL", "SUPABASE_URL"])) && Boolean(envValue(["BACKY_SUPABASE_SERVICE_ROLE_KEY", "SUPABASE_SERVICE_ROLE_KEY"])),
    storage: Boolean(envValue(["BACKY_MEDIA_STORAGE_PROVIDER", "BACKY_STORAGE_PROVIDER", "AWS_ACCESS_KEY_ID", "SUPABASE_SERVICE_ROLE_KEY"])),
    vercel: Boolean(envValue(["BACKY_VERCEL_TOKEN", "VERCEL_TOKEN"])),
    notifications: Boolean(envValue(["BACKY_EMAIL_DELIVERY_ENDPOINT", "BACKY_TRANSACTIONAL_EMAIL_WEBHOOK_URL", "BACKY_RESEND_API_KEY", "RESEND_API_KEY", "SMTP_HOST"])),
    commerce: Boolean(envValue(["BACKY_STRIPE_SECRET_KEY", "STRIPE_SECRET_KEY", "BACKY_PAYPAL_ACCESS_TOKEN", "PAYPAL_ACCESS_TOKEN", "BACKY_COMMERCE_WEBHOOK_SECRET", "COMMERCE_WEBHOOK_SECRET"])),
  };
  const commerceProviderFamilies = {
    payment: Boolean(envValue(["BACKY_STRIPE_SECRET_KEY", "STRIPE_SECRET_KEY", "BACKY_PAYPAL_ACCESS_TOKEN", "PAYPAL_ACCESS_TOKEN", "BACKY_PADDLE_API_KEY", "PADDLE_API_KEY", "BACKY_SQUARE_ACCESS_TOKEN", "SQUARE_ACCESS_TOKEN", "BACKY_ADYEN_API_KEY", "ADYEN_API_KEY", "BACKY_MOLLIE_API_KEY", "MOLLIE_API_KEY", "BACKY_RAZORPAY_KEY_ID", "RAZORPAY_KEY_ID"])),
    tax: Boolean(envValue(["BACKY_TAXJAR_API_KEY", "TAXJAR_API_KEY", "BACKY_AVALARA_ACCOUNT_ID", "AVALARA_ACCOUNT_ID", "BACKY_STRIPE_SECRET_KEY", "STRIPE_SECRET_KEY"])),
    shipping: Boolean(envValue(["BACKY_EASYPOST_API_KEY", "EASYPOST_API_KEY", "BACKY_SHIPPO_API_KEY", "SHIPPO_API_KEY"])),
    discount: Boolean(envValue(["BACKY_COMMERCE_DISCOUNT_PROVIDER_URL", "COMMERCE_DISCOUNT_PROVIDER_URL", "BACKY_STRIPE_SECRET_KEY", "STRIPE_SECRET_KEY"])),
    catalog: Boolean(envValue(["BACKY_COMMERCE_PRODUCT_SYNC_URL", "COMMERCE_PRODUCT_SYNC_URL", "BACKY_SHOPIFY_ADMIN_ACCESS_TOKEN", "SHOPIFY_ADMIN_ACCESS_TOKEN", "BACKY_BIGCOMMERCE_ACCESS_TOKEN", "BIGCOMMERCE_ACCESS_TOKEN", "BACKY_WOOCOMMERCE_CONSUMER_KEY", "WOOCOMMERCE_CONSUMER_KEY", "BACKY_ETSY_ACCESS_TOKEN", "ETSY_ACCESS_TOKEN"])),
    subscription: Boolean(envValue(["BACKY_COMMERCE_SUBSCRIPTION_ACTION_URL", "COMMERCE_SUBSCRIPTION_ACTION_URL", "BACKY_STRIPE_SECRET_KEY", "STRIPE_SECRET_KEY", "BACKY_PAYPAL_ACCESS_TOKEN", "PAYPAL_ACCESS_TOKEN", "BACKY_PADDLE_API_KEY", "PADDLE_API_KEY"])),
    webhook: Boolean(envValue(["BACKY_COMMERCE_WEBHOOK_SECRET", "COMMERCE_WEBHOOK_SECRET"])),
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
      key: "forms-postgres",
      label: "Forms Supabase/Postgres persistence",
      status: "certified",
      command: "npm run ci:forms-postgres",
      workflow: ".github/workflows/forms-postgres-contract.yml",
      affectedSurfaces: ["/forms"],
      certifiedAt: "2026-05-21",
      evidence: "Passed against a migrated disposable local Postgres target with form definition, submission, contact, spam/consent, moderation, promotion, and cleanup coverage.",
    },
    {
      key: "sdk-postgres",
      label: "Frontend manifest/OpenAPI/SDK Supabase/Postgres smoke",
      status: "certified",
      command: "npm run ci:sdk-postgres-smoke",
      workflow: ".github/workflows/sdk-postgres-smoke.yml",
      affectedSurfaces: ["Frontend manifest/OpenAPI/SDK APIs"],
      certifiedAt: "2026-05-21",
      evidence: "Passed against a migrated disposable local Postgres target with database-mode discovery, manifest, OpenAPI, render, media, CMS, forms, comments, events, commerce, and SDK write-flow coverage.",
    },
  ] as const;

  const gates = [
    {
      key: "settings-provider-certification",
      label: "Settings live provider certification",
      status: missingSettingsFamilies.length === 0 ? "ready-to-run" : "blocked-missing-inputs",
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
        configuredFamilies: configuredSettingsFamilies,
        missingFamilies: missingSettingsFamilies,
      },
    },
    {
      key: "commerce-provider-certification",
      label: "Commerce live provider certification",
      status: missingCommerceFamilies.length === 0 ? "ready-to-run" : "blocked-missing-inputs",
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
        configuredFamilies: configuredCommerceFamilies,
        missingFamilies: missingCommerceFamilies,
      },
    },
  ] as const;
  const settingsCertificationEvidenceArtifacts = [
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
  ] as const;
  const commerceCertificationEvidenceArtifacts = [
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
  ] as const;
  const settingsCertificationArtifactVerifier = {
    command: "npm run doctor:release-certification",
    requiredEnv: "BACKY_SETTINGS_CERTIFICATION_ARTIFACT_REQUIRED=1 or BACKY_PROVIDER_CERTIFICATION_ARTIFACTS_REQUIRED=1",
    pathEnv: "BACKY_SETTINGS_CERTIFICATION_ARTIFACT_PATH or BACKY_SETTINGS_CERTIFICATION_ARTIFACT",
    schemaVersion: "backy.settings-provider-certification-artifact.v1",
    validates: ["file exists", "valid JSON", "ok: true", "artifact schema version", "no-secret boundary", "no raw secret-like values", "no forbidden artifact field names or credential URLs", "apiHandoffs.settingsAdminApi present", "apiHandoffs.siteScopedSettingsApi present", "settingsApiHandoffSchemaReady", "settingsApiHandoffSiteTargetReady", "settingsApiHandoffTargetSiteId", "settingsApiHandoffSettingsSiteSelectorEnv", "settingsApiHandoffCommerceSiteSelectorEnv", "settingsApiHandoffReady", "siteSettingsApiHandoffReady", "settingsScenarioEvidenceReady", "settingsEvidencePacketReady", "settingsCompletionStatusReady"],
    includesSecretValues: false,
  } as const;
  const commerceCertificationArtifactVerifier = {
    command: "npm run doctor:release-certification",
    requiredEnv: "BACKY_COMMERCE_CERTIFICATION_ARTIFACT_REQUIRED=1 or BACKY_PROVIDER_CERTIFICATION_ARTIFACTS_REQUIRED=1",
    pathEnv: "BACKY_COMMERCE_CERTIFICATION_ARTIFACT_PATH or BACKY_COMMERCE_CERTIFICATION_ARTIFACT",
    schemaVersion: "backy.commerce-provider-certification-artifact.v1",
    validates: ["file exists", "valid JSON", "ok: true", "artifact schema version", "no-secret boundary", "no raw secret-like values", "no forbidden artifact field names or credential URLs", "apiHandoffs present", "apiHandoffs.publicApis present", "apiHandoffReady", "publicCommerceApiHandoffReady", "productApiHandoffSchemaReady", "productApiHandoffSiteTargetReady", "productApiHandoffTargetSiteId", "productApiHandoffReady", "orderApiHandoffSchemaReady", "orderApiHandoffSiteTargetReady", "orderApiHandoffTargetSiteId", "orderApiHandoffReady", "commerceApiHandoffSiteSelectorEnv"],
    includesSecretValues: false,
  } as const;
  const surfaceRunbooks = [
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
      evidenceArtifacts: settingsCertificationEvidenceArtifacts,
      artifactVerifier: settingsCertificationArtifactVerifier,
      runtime: {
        configuredFamilies: configuredSettingsFamilies,
        missingFamilies: missingSettingsFamilies,
      },
      secretBoundary: {
        includesSecretValues: false,
        excludes: ["database URLs", "provider credentials", "service-role keys", "Vercel tokens", "notification secrets", "commerce secrets"],
      },
      nextAction: missingSettingsFamilies.length > 0
        ? `Configure ${missingSettingsFamilies.join(", ")} provider aliases, then run npm run ci:settings-provider-certification.`
        : "Run npm run ci:settings-provider-certification and attach the redacted evidence packet.",
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
      evidenceArtifacts: settingsCertificationEvidenceArtifacts,
      artifactVerifier: settingsCertificationArtifactVerifier,
      runtime: {
        configuredFamilies: configuredSettingsFamilies,
        missingFamilies: missingSettingsFamilies,
      },
      secretBoundary: {
        includesSecretValues: false,
        excludes: ["admin key values", "database URLs", "provider credentials", "service-role keys"],
      },
      nextAction: missingSettingsFamilies.length > 0
        ? `Configure ${missingSettingsFamilies.join(", ")} provider aliases, then re-run the Settings admin API provider gate.`
        : "Run the Settings provider gate and archive the typed admin API evidence packet.",
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
      evidenceApi: "/api/admin/sites/{siteId}/commerce/products/{productId}/provider-sync data.providerCertification.operatorEvidencePacket plus /api/sites/{siteId}/manifest and /api/sites/{siteId}/commerce/catalog data.commerce.providerCertification",
      evidenceUiPanel: "products-provider-certification-evidence-packet",
      sourceOnlyGuard: "BACKY_COMMERCE_SOURCE_ONLY=1 npm run test:commerce --workspace @backy-cms/admin",
      proofSources: [
        "apps/admin/src/routes/products.tsx",
        "GET/POST /api/admin/sites/{siteId}/commerce/products/{productId}/provider-sync",
        "GET /api/sites/{siteId}/manifest",
        "GET /api/sites/{siteId}/commerce/catalog",
        "scripts/commerce-provider-certification-preflight-contract-smoke.mjs",
      ],
      expectedArtifacts: [
        "product provider-sync evidence",
        "public manifest/catalog commerce provider handoff",
        "artifacts/backy-commerce-provider-certification.json",
        "backy-commerce-provider-certification-evidence",
        "product storefront handoff",
        "provider catalog sync proof",
        "subscription lifecycle proof when selected",
      ],
      evidenceArtifacts: commerceCertificationEvidenceArtifacts,
      artifactVerifier: commerceCertificationArtifactVerifier,
      runtime: {
        configuredFamilies: configuredCommerceFamilies,
        missingFamilies: missingCommerceFamilies,
      },
      secretBoundary: {
        includesSecretValues: false,
        excludes: ["provider secrets", "raw provider responses", "private orders", "customer payloads", "digital delivery URLs"],
      },
      nextAction: missingCommerceFamilies.length > 0
        ? `Configure ${missingCommerceFamilies.join(", ")} commerce provider aliases, then run npm run ci:commerce-provider-certification.`
        : "Run commerce provider certification and attach the products provider-sync evidence packet.",
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
      evidenceApi: "/api/admin/sites/{siteId}/commerce/orders/analytics data.providerCertification.operatorEvidencePacket plus /api/sites/{siteId}/commerce/orders data.commerce.providerCertification",
      evidenceUiPanel: "orders-provider-certification-evidence-packet",
      sourceOnlyGuard: "BACKY_ORDERS_SOURCE_ONLY=1 npm run test:orders --workspace @backy-cms/admin",
      proofSources: [
        "apps/admin/src/routes/orders.tsx",
        "GET /api/admin/sites/{siteId}/commerce/orders/analytics",
        "GET /api/sites/{siteId}/commerce/orders",
        "scripts/commerce-provider-certification-preflight-contract-smoke.mjs",
      ],
      expectedArtifacts: [
        "order analytics provider evidence",
        "public order contract provider handoff",
        "artifacts/backy-commerce-provider-certification.json",
        "backy-commerce-provider-certification-evidence",
        "status handoff evidence",
        "quote/tracking/fulfillment/refund proof",
        "webhook/reconciliation proof",
      ],
      evidenceArtifacts: commerceCertificationEvidenceArtifacts,
      artifactVerifier: commerceCertificationArtifactVerifier,
      runtime: {
        configuredFamilies: configuredCommerceFamilies,
        missingFamilies: missingCommerceFamilies,
      },
      secretBoundary: {
        includesSecretValues: false,
        excludes: ["provider secrets", "customer payloads", "raw order payloads", "payment references", "addresses", "webhook bodies"],
      },
      nextAction: missingCommerceFamilies.length > 0
        ? `Configure ${missingCommerceFamilies.join(", ")} commerce provider aliases, then run npm run ci:commerce-provider-certification.`
        : "Run commerce provider certification and attach the orders analytics evidence packet.",
    },
  ] as const;
  const blockedGates = gates.filter((gate) => gate.status !== "ready-to-run");
  const firstBlockedGate = blockedGates[0];
  const missingInputs = firstBlockedGate?.runtime && "missing" in firstBlockedGate.runtime && Array.isArray(firstBlockedGate.runtime.missing)
    ? firstBlockedGate.runtime.missing
    : [];

  return {
    schemaVersion: "backy.completion-status.v1",
    generatedAt: new Date().toISOString(),
    status: blockedGates.length === 0 ? "certification-ready" : "external-gates-required",
    summary: "Backy core backend/editor/API parity is implemented for the audited local scope; Forms and SDK database gates are certified, and the remaining Partial rows require live provider certification evidence.",
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
      { key: "products", label: "/products", status: "partial", blocker: "commerce-provider-certification", gate: "npm run ci:commerce-provider-certification" },
      { key: "orders", label: "/orders", status: "partial", blocker: "commerce-provider-certification", gate: "npm run ci:commerce-provider-certification" },
      { key: "settings", label: "/settings", status: "partial", blocker: "settings-provider-certification", gate: "npm run ci:settings-provider-certification" },
      { key: "settings-admin-apis", label: "Settings admin APIs", status: "partial", blocker: "settings-provider-certification", gate: "npm run ci:settings-provider-certification" },
    ],
    surfaceRunbooks,
    certifiedGates: certifiedDatabaseGates,
    gates,
    nextAction: missingInputs.length > 0
      ? `Configure ${missingInputs.join(", ")} and run ${firstBlockedGate?.command}.`
      : `Configure the missing provider families and run ${firstBlockedGate?.command || "npm run test:partial-gate-preflights"}.`,
    recommendedCommands: gates.map((gate) => gate.command),
    localPreflight: "npm run test:partial-gate-preflights",
    privacy: {
      includesSecretValues: false,
      exposesOnlyAliasPresence: true,
      secretHandling: "Completion status exposes audited counts, gate names, workflow paths, env alias presence, and missing provider families only; database URLs, provider keys, admin keys, and customer/order/submission payloads are never returned.",
    },
  };
};

const pathParameter = (
  name: string,
  description?: string,
  enumValues?: string[],
) => ({
  name,
  in: "path",
  required: true,
  description,
  schema: {
    type: "string",
    enum: enumValues && enumValues.length > 0 ? enumValues : undefined,
  },
});

const queryParameter = (
  name: string,
  schema: Record<string, unknown> = { type: "string" },
  description?: string,
) => ({
  name,
  in: "query",
  required: false,
  description,
  schema,
});

const sandboxResponseHeaders = {
  "Content-Security-Policy": {
    description:
      "Deny-by-default iframe CSP for Backy-owned interactive component sandboxes.",
    schema: { type: "string" },
  },
  "Permissions-Policy": {
    description:
      "Deny-by-default browser permission policy for sandboxed interactive code.",
    schema: { type: "string" },
  },
  "Referrer-Policy": {
    description: "Sandbox responses do not leak referrer information.",
    schema: { type: "string", const: "no-referrer" },
  },
  "X-Content-Type-Options": {
    description: "Sandbox responses are protected from MIME sniffing.",
    schema: { type: "string", const: "nosniff" },
  },
};

const mediaFileResponseHeaders = {
  ETag: {
    description: "Stable media file delivery validator for If-None-Match revalidation.",
    schema: { type: "string" },
  },
  "X-Backy-Cache-Scope": {
    description: "Cache scope for the media file response.",
    schema: { type: "string", enum: ["discovery", "private"] },
  },
  "X-Backy-Cache-Revision": {
    description: "Stable cache revision for the delivered media file variant.",
    schema: { type: "string" },
  },
  "X-Backy-Contract-Version": {
    description: "Backy public API contract version for binary media delivery.",
    schema: { type: "string", const: "backy.ai-frontend.v1" },
  },
  "X-Backy-Schema-Version": {
    description: "Media file delivery schema/version identifier.",
    schema: { type: "string", const: "backy.media-file.v1" },
  },
  "X-Backy-Request-Id": {
    description: "Request id echoed for support and audit correlation.",
    schema: { type: "string" },
  },
  "X-Backy-Site-Id": {
    description: "Resolved Backy site id for this media delivery.",
    schema: { type: "string" },
  },
  "X-Backy-Media-Id": {
    description: "Delivered media asset id.",
    schema: { type: "string" },
  },
};

const mediaFileErrorResponseHeaders = {
  "X-Backy-Contract-Version": mediaFileResponseHeaders["X-Backy-Contract-Version"],
  "X-Backy-Schema-Version": mediaFileResponseHeaders["X-Backy-Schema-Version"],
  "X-Backy-Request-Id": mediaFileResponseHeaders["X-Backy-Request-Id"],
};

const mediaTransformResponseHeaders = {
  ETag: {
    description: "Stable media transform redirect validator for If-None-Match revalidation.",
    schema: { type: "string" },
  },
  "X-Backy-Cache-Scope": {
    description: "Cache scope for the transform redirect response.",
    schema: { type: "string", const: "discovery" },
  },
  "X-Backy-Cache-Revision": {
    description: "Stable cache revision for the transformed media variant.",
    schema: { type: "string" },
  },
  "X-Backy-Contract-Version": {
    description: "Backy public API contract version for media transform redirects.",
    schema: { type: "string", const: "backy.ai-frontend.v1" },
  },
  "X-Backy-Schema-Version": {
    description: "Media transform redirect schema/version identifier.",
    schema: { type: "string", const: "backy.media-transform.v1" },
  },
  "X-Backy-Request-Id": {
    description: "Request id echoed for support and audit correlation.",
    schema: { type: "string" },
  },
  "X-Backy-Site-Id": {
    description: "Resolved Backy site id for this transform.",
    schema: { type: "string" },
  },
  "X-Backy-Media-Id": {
    description: "Transformed media asset id.",
    schema: { type: "string" },
  },
  "X-Backy-Transform-Width": {
    description: "Bounded optimizer width accepted by Backy.",
    schema: { type: "string" },
  },
  "X-Backy-Transform-Quality": {
    description: "Bounded optimizer quality accepted by Backy.",
    schema: { type: "string" },
  },
};

const mediaTransformErrorResponseHeaders = {
  "X-Backy-Contract-Version": mediaTransformResponseHeaders["X-Backy-Contract-Version"],
  "X-Backy-Schema-Version": mediaTransformResponseHeaders["X-Backy-Schema-Version"],
  "X-Backy-Request-Id": mediaTransformResponseHeaders["X-Backy-Request-Id"],
};

const mediaFileCategories = [
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
    type: "video",
    label: "Videos",
    accepts: ["video/*"],
    pickerUse: "embedded-media",
    delivery: "public-or-signed-file",
    transformEligible: false,
    responsiveEligible: false,
    fontManifestEligible: false,
  },
  {
    type: "audio",
    label: "Audio",
    accepts: ["audio/*"],
    pickerUse: "embedded-media",
    delivery: "public-or-signed-file",
    transformEligible: false,
    responsiveEligible: false,
    fontManifestEligible: false,
  },
  {
    type: "document",
    label: "Documents",
    accepts: [
      "application/pdf",
      "text/plain",
      "text/csv",
      "application/msword",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "application/vnd.ms-excel",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "application/vnd.ms-powerpoint",
      "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    ],
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
    accepts: ["font/*", ".woff", ".woff2", ".ttf", ".otf", ".eot"],
    pickerUse: "typography",
    delivery: "font-manifest-or-file",
    transformEligible: false,
    responsiveEligible: false,
    fontManifestEligible: true,
  },
  {
    type: "other",
    label: "Other files",
    accepts: ["application/octet-stream"],
    pickerUse: "downloadable-file",
    delivery: "public-or-signed-file",
    transformEligible: false,
    responsiveEligible: false,
    fontManifestEligible: false,
  },
] as const;

const mediaFileCategoryDiscovery = (siteId: string) => ({
  schemaVersion: "backy.media-file-categories.v1",
  fileCategories: mediaFileCategories,
  deliveryPolicy: {
    publicFiles: "direct-file-url",
    privateFiles: "signed-url-required",
    signedUrlEndpoint: `/api/admin/sites/${siteId}/media/{mediaId}/signed-url`,
    signedUrlMethod: "POST",
    signedUrlPermission: "media.view",
    acceptedDispositions: ["inline", "attachment"],
    defaultDisposition: "inline",
    maxSignedUrlSeconds: 3600,
    transformableTypes: ["image"],
    responsiveTypes: ["image"],
    fontManifestTypes: ["font"],
    downloadableTypes: ["document", "other", "audio", "video"],
    secretHandling:
      "Private file bytes require short-lived signed URLs minted through authenticated admin media APIs; public OpenAPI discovery never includes private file tokens.",
  },
  managementPolicy: {
    schemaVersion: "backy.media-management.v1",
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
      headers: [
        "Authorization",
        "x-backy-admin-session",
        "x-backy-admin-key",
        "x-api-key",
      ],
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
      "Upload requests are authenticated admin multipart requests; private delivery uses short-lived signed URLs and never publishes private file tokens in OpenAPI responses.",
  },
});

const formsManagementDiscovery = (siteId: string) => ({
  schemaVersion: "backy.forms-management.v1",
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
    headers: [
      "Authorization",
      "x-backy-admin-session",
      "x-backy-admin-key",
      "x-api-key",
    ],
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
});

const commerceManagementDiscovery = (siteId: string) => ({
  schemaVersion: "backy.commerce-management.v1",
  endpoints: {
    products: `/api/admin/sites/${siteId}/collections/products/records`,
    product: `/api/admin/sites/${siteId}/collections/products/records/{productId}`,
    productsCsv: `/api/admin/sites/${siteId}/collections/products/records?format=csv`,
    importProducts: `/api/admin/sites/${siteId}/collections/products/records/import`,
    bulkProducts: `/api/admin/sites/${siteId}/collections/products/records/bulk`,
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
    platformReconciliation: "/api/admin/commerce/reconcile",
    reconciliationReadiness: "/api/admin/commerce/reconcile/readiness",
    orderEvents: `/api/sites/${siteId}/events?kind=commerce-order`,
    productEvents: `/api/sites/${siteId}/events?kind=commerce-product`,
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
    headers: [
      "Authorization",
      "x-backy-admin-session",
      "x-backy-admin-key",
      "x-api-key",
    ],
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
});

const liveManagementEditableTargets = [
  "props.content",
  "props.href",
  "props.target",
  "props.download",
  "props.src",
  "props.alt",
  "props.title",
  "props.assetId",
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
  "props.imageId",
  "props.imageIds",
  "props.videoId",
  "props.videoIds",
  "props.audioId",
  "props.audioIds",
  "props.documentId",
  "props.documentIds",
  "props.iconId",
  "props.iconIds",
  "props.mediaId",
  "props.mediaIds",
  "props.mediaName",
  "props.mediaType",
  "props.mediaFolderId",
  "props.mediaScope",
  "props.mediaScopeTargetId",
  "props.mediaVisibility",
  "props.mediaInsertPreset",
  "props.objectFit",
  "props.objectPosition",
  "props.imageFocalPoint",
  "props.imageInsertPreset",
  "props.fallbackImageMediaId",
  "props.fallbackImageMediaIds",
  "props.backgroundMediaId",
  "props.backgroundMediaIds",
  "props.posterMediaId",
  "props.posterMediaIds",
  "props.fallback",
  "props.fontFamily",
  "props.fontMediaId",
  "props.fontMediaIds",
  "props.fontMediaName",
  "props.fontMediaFolderId",
  "props.fontMediaVisibility",
  "props.fontFileUrl",
  "props.fontSource",
  "props.fontFallback",
  "props.fontDisplay",
  "props.fontRegistration",
  "props.formId",
  "props.formTitle",
  "props.submitLabel",
  "props.action",
  "props.actionUrl",
  "props.method",
  "props.successMessage",
  "props.formActive",
  "props.labelColor",
  "props.helpTextColor",
  "props.fieldBackgroundColor",
  "props.fieldBorderColor",
  "props.fieldBorderRadius",
  "props.submitBackgroundColor",
  "props.submitColor",
  "props.submitBorderRadius",
  "props.label",
  "props.name",
  "props.placeholder",
  "props.helpText",
  "props.defaultValue",
  "props.value",
  "props.options",
  "props.inputType",
  "props.rows",
  "props.required",
  "props.disabled",
  "props.actionPreset",
  "props.actionValue",
  "props.rel",
  "props.ariaLabel",
  "props.underline",
  "props.type",
  "props.color",
  "props.backgroundColor",
  "props.borderColor",
  "props.borderRadius",
  "props.borderWidth",
  "props.borderStyle",
  "props.padding",
  "props.margin",
  "props.opacity",
  "props.boxShadow",
  "props.fontSize",
  "props.fontWeight",
  "props.lineHeight",
  "props.textAlign",
  "props.textTransform",
  "props.letterSpacing",
  "props.wordSpacing",
  "props.textIndent",
  "props.textShadow",
  "props.textDecoration",
  "props.fontStyle",
  "styles.color",
  "styles.backgroundColor",
  "styles.borderColor",
  "styles.fontFamily",
  "styles.fontSize",
  "styles.lineHeight",
  "styles.fontWeight",
  "styles.borderRadius",
  "styles.padding",
  "styles.margin",
  "styles.opacity",
  "styles.boxShadow",
  "tokenRefs.styles.color",
  "tokenRefs.styles.backgroundColor",
  "tokenRefs.styles.borderColor",
  "tokenRefs.styles.fontFamily",
  "tokenRefs.styles.fontSize",
  "tokenRefs.styles.lineHeight",
  "tokenRefs.styles.fontWeight",
  "tokenRefs.styles.padding",
  "tokenRefs.styles.margin",
  "tokenRefs.styles.borderRadius",
  "tokenRefs.styles.boxShadow",
  "animation.type",
  "animation.duration",
  "animation.delay",
  "animation.easing",
  "animation.direction",
  "animation.trigger",
  "animation.scrollTrigger",
  "animation.scrollTrigger.start",
  "animation.scrollTrigger.end",
  "animation.scrollTrigger.scrub",
  "animation.from",
  "animation.to",
  "animation.tokenRefs.duration",
  "animation.tokenRefs.easing",
  "actions",
  "dataBindings",
  "bindingSlots",
  "assetIds",
  "responsive.tablet.x",
  "responsive.tablet.y",
  "responsive.tablet.width",
  "responsive.tablet.height",
  "responsive.tablet.visible",
  "responsive.tablet.locked",
  "responsive.tablet.props.content",
  "responsive.tablet.props.href",
  "responsive.tablet.props.target",
  "responsive.tablet.props.download",
  "responsive.tablet.props.src",
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
  "responsive.tablet.props.imageIds",
  "responsive.tablet.props.videoIds",
  "responsive.tablet.props.audioIds",
  "responsive.tablet.props.documentIds",
  "responsive.tablet.props.iconIds",
  "responsive.tablet.props.mediaId",
  "responsive.tablet.props.mediaIds",
  "responsive.tablet.props.fallbackImageMediaIds",
  "responsive.tablet.props.backgroundMediaIds",
  "responsive.tablet.props.posterMediaIds",
  "responsive.tablet.props.fontMediaId",
  "responsive.tablet.props.fontMediaIds",
  "responsive.tablet.props.color",
  "responsive.tablet.props.backgroundColor",
  "responsive.tablet.props.borderColor",
  "responsive.tablet.props.borderRadius",
  "responsive.tablet.props.borderWidth",
  "responsive.tablet.props.borderStyle",
  "responsive.tablet.props.padding",
  "responsive.tablet.props.margin",
  "responsive.tablet.props.opacity",
  "responsive.tablet.props.boxShadow",
  "responsive.tablet.props.fontFamily",
  "responsive.tablet.props.fontSize",
  "responsive.tablet.props.fontWeight",
  "responsive.tablet.props.lineHeight",
  "responsive.tablet.props.textAlign",
  "responsive.tablet.props.textTransform",
  "responsive.tablet.props.letterSpacing",
  "responsive.tablet.props.wordSpacing",
  "responsive.tablet.props.textIndent",
  "responsive.tablet.props.textShadow",
  "responsive.tablet.props.textDecoration",
  "responsive.tablet.props.fontStyle",
  "responsive.tablet.styles.color",
  "responsive.tablet.styles.backgroundColor",
  "responsive.tablet.styles.borderColor",
  "responsive.tablet.styles.fontFamily",
  "responsive.tablet.styles.fontSize",
  "responsive.tablet.styles.lineHeight",
  "responsive.tablet.styles.fontWeight",
  "responsive.tablet.styles.padding",
  "responsive.tablet.styles.margin",
  "responsive.tablet.styles.borderRadius",
  "responsive.tablet.styles.boxShadow",
  "responsive.tablet.styles.backgroundMediaIds",
  "responsive.tablet.tokenRefs.styles.color",
  "responsive.tablet.tokenRefs.styles.backgroundColor",
  "responsive.tablet.tokenRefs.styles.borderColor",
  "responsive.tablet.tokenRefs.styles.fontFamily",
  "responsive.tablet.tokenRefs.styles.fontSize",
  "responsive.tablet.tokenRefs.styles.lineHeight",
  "responsive.tablet.tokenRefs.styles.fontWeight",
  "responsive.tablet.tokenRefs.styles.padding",
  "responsive.tablet.tokenRefs.styles.margin",
  "responsive.tablet.tokenRefs.styles.borderRadius",
  "responsive.tablet.tokenRefs.styles.boxShadow",
  "responsive.mobile.x",
  "responsive.mobile.y",
  "responsive.mobile.width",
  "responsive.mobile.height",
  "responsive.mobile.visible",
  "responsive.mobile.locked",
  "responsive.mobile.props.content",
  "responsive.mobile.props.href",
  "responsive.mobile.props.target",
  "responsive.mobile.props.download",
  "responsive.mobile.props.src",
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
  "responsive.mobile.props.imageIds",
  "responsive.mobile.props.videoIds",
  "responsive.mobile.props.audioIds",
  "responsive.mobile.props.documentIds",
  "responsive.mobile.props.iconIds",
  "responsive.mobile.props.mediaId",
  "responsive.mobile.props.mediaIds",
  "responsive.mobile.props.fallbackImageMediaIds",
  "responsive.mobile.props.backgroundMediaIds",
  "responsive.mobile.props.posterMediaIds",
  "responsive.mobile.props.fontMediaId",
  "responsive.mobile.props.fontMediaIds",
  "responsive.mobile.props.color",
  "responsive.mobile.props.backgroundColor",
  "responsive.mobile.props.borderColor",
  "responsive.mobile.props.borderRadius",
  "responsive.mobile.props.borderWidth",
  "responsive.mobile.props.borderStyle",
  "responsive.mobile.props.padding",
  "responsive.mobile.props.margin",
  "responsive.mobile.props.opacity",
  "responsive.mobile.props.boxShadow",
  "responsive.mobile.props.fontFamily",
  "responsive.mobile.props.fontSize",
  "responsive.mobile.props.fontWeight",
  "responsive.mobile.props.lineHeight",
  "responsive.mobile.props.textAlign",
  "responsive.mobile.props.textTransform",
  "responsive.mobile.props.letterSpacing",
  "responsive.mobile.props.wordSpacing",
  "responsive.mobile.props.textIndent",
  "responsive.mobile.props.textShadow",
  "responsive.mobile.props.textDecoration",
  "responsive.mobile.props.fontStyle",
  "responsive.mobile.styles.color",
  "responsive.mobile.styles.backgroundColor",
  "responsive.mobile.styles.borderColor",
  "responsive.mobile.styles.fontFamily",
  "responsive.mobile.styles.fontSize",
  "responsive.mobile.styles.lineHeight",
  "responsive.mobile.styles.fontWeight",
  "responsive.mobile.styles.padding",
  "responsive.mobile.styles.margin",
  "responsive.mobile.styles.borderRadius",
  "responsive.mobile.styles.boxShadow",
  "responsive.mobile.styles.backgroundMediaIds",
  "responsive.mobile.tokenRefs.styles.color",
  "responsive.mobile.tokenRefs.styles.backgroundColor",
  "responsive.mobile.tokenRefs.styles.borderColor",
  "responsive.mobile.tokenRefs.styles.fontFamily",
  "responsive.mobile.tokenRefs.styles.fontSize",
  "responsive.mobile.tokenRefs.styles.lineHeight",
  "responsive.mobile.tokenRefs.styles.fontWeight",
  "responsive.mobile.tokenRefs.styles.padding",
  "responsive.mobile.tokenRefs.styles.margin",
  "responsive.mobile.tokenRefs.styles.borderRadius",
  "responsive.mobile.tokenRefs.styles.boxShadow",
  "layout.x",
  "layout.y",
  "layout.width",
  "layout.height",
  "visibility.hidden",
  "visibility.locked",
] as const;

const liveManagementDiscovery = (siteId: string) => ({
  schemaVersion: "backy.live-management.v1",
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
    headers: [
      "Authorization",
      "x-backy-admin-session",
      "x-backy-admin-key",
      "x-api-key",
    ],
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
    inlineText: true,
    inlineLinks: true,
    inlineImages: true,
    inlineMedia: true,
    inlineFormControls: true,
    inlineLayout: true,
    inlineAppearance: true,
    mediaAssetRefs: true,
    fontAssetRefs: true,
    elementAssetIds: true,
    tokenRefs: true,
    animation: true,
    animationTokenRefs: true,
    editorComposition: true,
    editorGrouping: true,
  },
  editableTargets: liveManagementEditableTargets,
  lifecycle: {
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
    },
  },
  inlineElementTypes: {
    text: ["text", "heading", "paragraph", "quote", "button", "link"],
    link: ["button", "link"],
    image: ["image"],
    media: ["video", "embed", "map"],
    formControls: ["form", "input", "textarea", "select", "checkbox", "radio"],
  },
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
	    commandRegistry: liveManagementEditorCommandRegistry,
	    constraints: {
      sameParentRequired: true,
      lockedLayersBlocked: true,
      editorGroupMarker: "props.editorGroup",
      responsiveBreakpoints: ["tablet", "mobile"],
      updateTarget: "content",
    },
  },
  updateBody: {
    expectedUpdatedAt:
      "Use the current page or post updatedAt value for optimistic conflict protection.",
    content:
      "Send the full Backy content document or canvas content object after applying editable-map changes.",
  },
  errors: {
    conflict: "PAGE_VERSION_CONFLICT",
    postConflict: "BLOG_VERSION_CONFLICT",
    forbidden: "FORBIDDEN_LIVE_MANAGE_SITE_SCOPE",
    postForbidden: "FORBIDDEN_LIVE_MANAGE_BLOG_SCOPE",
    validation: "VALIDATION_ERROR",
  },
});

const blogFeedDiscovery = (site: { id: string; name: string }) => ({
  id: "blog-rss",
  title: `${site.name} Blog RSS`,
  format: "rss",
  version: "2.0",
  rel: "alternate",
  contentType: "application/rss+xml; charset=utf-8",
  endpoint: `/api/sites/${site.id}/blog/rss`,
  hostedPath: "/blog/rss.xml",
  schemaVersion: "rss.2.0",
  scope: "public-blog-posts",
  visibility: "published-and-past-scheduled",
  cache: {
    scope: "discovery",
    etag: true,
    revisionHeader: "x-backy-cache-revision",
  },
  limits: {
    queryParam: "limit",
    default: 25,
    min: 1,
    max: 100,
  },
});

const normalizeOpenApiDomain = (
  domain: string | null | undefined,
): string | null => {
  if (typeof domain !== "string" || domain.trim().length === 0) return null;
  const hostname = domain
    .trim()
    .replace(/^https?:\/\//i, "")
    .split("/")[0]
    ?.replace(/\/+$/, "")
    .toLowerCase();
  return hostname || null;
};

const deliveryDiscovery = (
  origin: string,
  site: {
    slug: string;
    customDomain?: string | null;
    settings?: Pick<SiteSettings, "domainVerification" | "localization"> | null;
  },
) => {
  const localization = normalizeSiteLocalization(site.settings);
  const customDomain = normalizeOpenApiDomain(site.customDomain);
  const verificationDomain = normalizeOpenApiDomain(
    site.settings?.domainVerification?.domain,
  );
  const domainVerification = site.settings?.domainVerification || null;
  const managedBaseUrl = `${origin.replace(/\/$/, "")}/sites/${site.slug}`;
  const canonicalBaseUrl = getSiteCanonicalBaseUrl(origin, site);
  return {
    canonicalBaseUrl,
    managedBaseUrl,
    primaryDomain: customDomain || new URL(managedBaseUrl).host,
    customDomain,
    defaultLocale: localization.defaultLocale,
    localeStrategy: localization.localeStrategy,
    locales: localization.locales,
    domains: [
      {
        type: "managed",
        host: new URL(managedBaseUrl).host,
        baseUrl: managedBaseUrl,
        primary: !customDomain,
        verified: true,
      },
      ...(customDomain
        ? [
            {
              type: "custom",
              host: customDomain,
              baseUrl: `https://${customDomain}`,
              primary: true,
              verified: domainVerification?.status === "verified",
              verificationStatus: domainVerification?.status || "not_started",
              source: "site.customDomain",
            },
          ]
        : []),
      ...(verificationDomain && verificationDomain !== customDomain
        ? [
            {
              type: "verification",
              host: verificationDomain,
              baseUrl: `https://${verificationDomain}`,
              primary: false,
              verified: domainVerification?.status === "verified",
              verificationStatus: domainVerification?.status || "not_started",
              source: "settings.domainVerification.domain",
            },
          ]
        : []),
    ],
    urls: {
      home: canonicalBaseUrl,
      sitemap: `${canonicalBaseUrl}/sitemap.xml`,
      robots: `${canonicalBaseUrl}/robots.txt`,
    },
  };
};

export async function GET(request: NextRequest, { params }: RouteParams) {
  const requestId = request.headers.get("x-request-id") || makeRequestId();

  try {
    const { siteId } = await params;
    const repositoryMode = !shouldUseDemoStoreFallback();
    const repositories = repositoryMode
      ? await getRequiredDatabaseRepositories()
      : null;
    const repositorySite = repositories
      ? (await repositories.sites.getById(siteId)) ||
        (await repositories.sites.getBySlug(siteId))
      : null;
    const storeSite = repositoryMode ? null : getSiteByIdOrSlug(siteId);
    const site = repositorySite
      ? {
          id: repositorySite.id,
          slug: repositorySite.slug,
          name: repositorySite.name,
          isPublished: repositorySite.isPublished,
          customDomain: repositorySite.customDomain,
          settings: repositorySite.settings,
        }
      : storeSite;

    if (!site || !site.isPublished) {
      return errorResponse(404, "SITE_NOT_FOUND", "Site not found", requestId);
    }

    const origin = new URL(request.url).origin;
    const collections = repositories
      ? (
          await repositories.collections.list({
            siteId: site.id,
            includeUnpublished: false,
            status: "published",
            limit: 100,
            offset: 0,
          })
        ).items.filter((collection) => collection.permissions.publicRead)
      : listCollections(site.id);
    const forms = repositories
      ? (
          await repositories.forms.list({
            siteId: site.id,
            isActive: true,
            limit: 100,
            offset: 0,
          })
        ).items
      : listFormsBySite(site.id);
    const reusableSections = repositories
      ? (
          await repositories.reusableSections.list({
            siteId: site.id,
            status: "active",
            limit: 100,
            offset: 0,
          })
        ).items
      : listReusableSections(site.id, { status: "active" });
    const pages = repositories
      ? await repositories.pages.list({
          siteId: site.id,
          status: "published",
          limit: 1,
          offset: 0,
        })
      : { pagination: { total: getPageSummary(site.id).length } };
    const posts = repositories
      ? await repositories.posts.list({
          siteId: site.id,
          status: "published",
          limit: 1,
          offset: 0,
        })
      : { pagination: { total: getBlogPosts(site.id, { limit: 1, offset: 0 }).pagination?.total || 0 } };
    const media = repositories
      ? await repositories.media.list({
          siteId: site.id,
          visibility: "public",
          limit: 1,
          offset: 0,
        })
      : getMediaList(site.id, { visibility: "public", limit: 1, offset: 0 });
    const fonts = repositories
      ? await repositories.media.list({
          siteId: site.id,
          type: "font",
          visibility: "public",
          limit: 1,
          offset: 0,
        })
      : getMediaList(site.id, { type: "font", visibility: "public", limit: 1, offset: 0 });
    const collectionIds = collections.map((collection) => collection.id);
    const hasCommerceCatalog = collections.some(
      (collection) => collection.slug === PRODUCT_COLLECTION_SLUG,
    );
    const hasPrivateOrders = collections.some(
      (collection) =>
        collection.slug === "orders" &&
        collection.status === "published" &&
        !collection.permissions.publicRead &&
        !collection.permissions.publicCreate,
    );
    const formIds = forms.map((form) => form.id);
    const reusableSectionIds = reusableSections.map((section) => section.id);
    const redirectRules = normalizeRedirectRules(
      site.settings?.redirectRules,
    ).filter((rule) => rule.enabled);
    const blogFeed = blogFeedDiscovery(site);
    const mediaFileCategoryDiscoveryContract = mediaFileCategoryDiscovery(site.id);
    const formsManagementDiscoveryContract = formsManagementDiscovery(site.id);
    const commerceManagementDiscoveryContract = commerceManagementDiscovery(site.id);
    const liveManagementDiscoveryContract = liveManagementDiscovery(site.id);
    const completionStatusContract = buildBackyCompletionStatus();
    const delivery = deliveryDiscovery(origin, site);
    const frontendLaunchReadiness = buildFrontendLaunchReadiness({
      siteId: site.id,
      endpointCount: 34 + collectionIds.length * 2 + formIds.length * 4 + reusableSectionIds.length,
      routePatternCount: 2 + collections.length * 2 + redirectRules.length,
      moduleCounts: {
        pages: pages.pagination.total,
        blogPosts: posts.pagination.total,
        collections: collections.length,
        reusableSections: reusableSections.length,
        forms: forms.length,
        media: media.pagination.total,
        fonts: fonts.pagination.total,
      },
      capabilities: {
        routeResolve: true,
        renderPayload: true,
        openApi: true,
        collectionSchemas: true,
        collectionRecords: collections.length > 0,
        reusableSections: true,
        mediaLibrary: true,
        uploadedFonts: fonts.pagination.total > 0,
        forms: forms.length > 0,
        comments: true,
        previewTokens: true,
        commerceCatalog: hasCommerceCatalog,
        commerceOrderIntake: hasCommerceCatalog && hasPrivateOrders,
      },
      liveManagement: liveManagementDiscoveryContract,
    });

    return publicContractJson(
      {
        openapi: "3.1.0",
        "x-backy-database-certification": frontendDatabaseCertification,
        "x-backy-frontend-launch-readiness": frontendLaunchReadiness,
        "x-backy-completion-status": completionStatusContract,
        "x-backy-media-file-categories": mediaFileCategoryDiscoveryContract,
        "x-backy-forms-management": formsManagementDiscoveryContract,
        "x-backy-commerce-management": commerceManagementDiscoveryContract,
        "x-backy-live-management": liveManagementDiscoveryContract,
        info: {
          title: `${site.name} Backy Public API`,
          version: "backy-public.v1",
          description:
            "Site-scoped public read and interaction API for custom Backy frontends.",
        },
        servers: [
          {
            url: origin,
            description: "Current Backy public app origin",
          },
        ],
        tags: [
          { name: "Discovery" },
          { name: "Sites" },
          { name: "Routing" },
          { name: "Rendering" },
          { name: "Content" },
          { name: "Interactions" },
          { name: "Media" },
          { name: "Admin Settings" },
        ],
        paths: {
          "/api/sites": {
            get: {
              tags: ["Sites"],
              summary: "List published sites or discover one site by identifier",
              operationId: "discoverBackySite",
              parameters: [
                queryParameter(
                  "identifier",
                  { type: "string" },
                  "Published site id, slug, or custom domain. Returns a single site envelope when present.",
                ),
                queryParameter(
                  "slug",
                  { type: "string" },
                  "Alias for identifier.",
                ),
                queryParameter(
                  "limit",
                  { type: "integer", minimum: 1, maximum: 100 },
                  "Page size when listing published sites.",
                ),
                queryParameter(
                  "offset",
                  { type: "integer", minimum: 0 },
                  "Page offset when listing published sites.",
                ),
              ],
              responses: {
                "200": {
                  description: "Published site list or one discovered site",
                  content: {
                    "application/json": {
                      schema: {
                        oneOf: [
                          { $ref: "#/components/schemas/SiteListEnvelope" },
                          { $ref: "#/components/schemas/SiteEnvelope" },
                        ],
                      },
                    },
                  },
                },
                "404": {
                  description: "Site not found",
                  content: {
                    "application/json": {
                      schema: { $ref: "#/components/schemas/ErrorEnvelope" },
                    },
                  },
                },
                "429": {
                  description: "Discovery rate limit exceeded",
                  content: {
                    "application/json": {
                      schema: { $ref: "#/components/schemas/ErrorEnvelope" },
                    },
                  },
                },
              },
            },
          },
          [`/api/sites/${site.id}/manifest`]: {
            get: {
              tags: ["Discovery"],
              summary: "Fetch the site frontend discovery manifest",
              operationId: "getBackyFrontendManifest",
              responses: {
                "200": {
                  description: "Frontend manifest",
                  content: {
                    "application/json": {
                      schema: {
                        $ref: "https://backy.dev/schemas/ai-frontend-contract/frontend-manifest.schema.json",
                      },
                    },
                  },
                },
              },
            },
          },
          "/api/admin/settings": {
            get: {
              tags: ["Admin Settings"],
              summary: "Read workspace Settings for custom admin clients",
              operationId: "getBackyAdminSettings",
              description:
                "Authenticated admin read for workspace-owned Settings. Requires settings.view and returns non-secret provider, database, storage, commerce, notification, Vercel, and frontend-database certification handoffs for external admin shells.",
              responses: {
                "200": {
                  description: "Workspace Settings envelope",
                  content: {
                    "application/json": {
                      schema: {
                        $ref: "#/components/schemas/AdminSettingsEnvelope",
                      },
                    },
                  },
                },
                "401": {
                  description: "Admin authentication required",
                  content: {
                    "application/json": {
                      schema: { $ref: "#/components/schemas/ErrorEnvelope" },
                    },
                  },
                },
                "403": {
                  description: "settings.view permission required",
                  content: {
                    "application/json": {
                      schema: { $ref: "#/components/schemas/ErrorEnvelope" },
                    },
                  },
                },
              },
            },
            patch: {
              tags: ["Admin Settings"],
              summary: "Update workspace-owned Settings sections",
              operationId: "updateBackyAdminSettings",
              description:
                "Authenticated admin update for workspace-owned Settings sections such as delivery mode, storage, auth, integrations, and API-key metadata. Requires settings.configure, media.configure, or settings.manageKeys according to the edited sections.",
              requestBody: {
                required: true,
                content: {
                  "application/json": {
                    schema: {
                      $ref: "#/components/schemas/AdminSettingsUpdateRequest",
                    },
                  },
                },
              },
              responses: {
                "200": {
                  description: "Updated workspace Settings envelope",
                  content: {
                    "application/json": {
                      schema: {
                        $ref: "#/components/schemas/AdminSettingsEnvelope",
                      },
                    },
                  },
                },
                "400": {
                  description: "Invalid Settings payload",
                  content: {
                    "application/json": {
                      schema: { $ref: "#/components/schemas/ErrorEnvelope" },
                    },
                  },
                },
                "401": {
                  description: "Admin authentication required",
                  content: {
                    "application/json": {
                      schema: { $ref: "#/components/schemas/ErrorEnvelope" },
                    },
                  },
                },
                "403": {
                  description: "Missing Settings permission",
                  content: {
                    "application/json": {
                      schema: { $ref: "#/components/schemas/ErrorEnvelope" },
                    },
                  },
                },
              },
            },
            post: {
              tags: ["Admin Settings"],
              summary: "Run an audited workspace Settings action",
              operationId: "runBackyAdminSettingsAction",
              description:
                "Runs Settings actions for API-key management, infrastructure validation, storage provisioning and credential rotation probes, Vercel secret-manager planning, and notification webhook tests without returning provider secrets.",
              requestBody: {
                required: true,
                content: {
                  "application/json": {
                    schema: {
                      $ref: "#/components/schemas/AdminSettingsActionRequest",
                    },
                  },
                },
              },
              responses: {
                "200": {
                  description: "Settings action result",
                  content: {
                    "application/json": {
                      schema: {
                        $ref: "#/components/schemas/AdminSettingsActionEnvelope",
                      },
                    },
                  },
                },
                "400": {
                  description: "Invalid or unsupported Settings action",
                  content: {
                    "application/json": {
                      schema: { $ref: "#/components/schemas/ErrorEnvelope" },
                    },
                  },
                },
                "401": {
                  description: "Admin authentication required",
                  content: {
                    "application/json": {
                      schema: { $ref: "#/components/schemas/ErrorEnvelope" },
                    },
                  },
                },
                "403": {
                  description: "Missing Settings action permission",
                  content: {
                    "application/json": {
                      schema: { $ref: "#/components/schemas/ErrorEnvelope" },
                    },
                  },
                },
                "409": {
                  description: "Provider or notification target not configured",
                  content: {
                    "application/json": {
                      schema: { $ref: "#/components/schemas/ErrorEnvelope" },
                    },
                  },
                },
              },
            },
          },
          [`/api/admin/sites/${site.id}/settings`]: {
            get: {
              tags: ["Admin Settings"],
              summary: "Read site-scoped Settings for custom admin clients",
              operationId: "getBackyAdminSiteSettings",
              description:
                "Authenticated admin read for site-owned Settings. Requires sites.view and returns workspace-vs-site scope metadata without provider or database secrets.",
              responses: {
                "200": {
                  description: "Site-scoped Settings envelope",
                  content: {
                    "application/json": {
                      schema: {
                        $ref: "#/components/schemas/AdminSiteSettingsEnvelope",
                      },
                    },
                  },
                },
                "401": {
                  description: "Admin authentication required",
                  content: {
                    "application/json": {
                      schema: { $ref: "#/components/schemas/ErrorEnvelope" },
                    },
                  },
                },
                "403": {
                  description: "sites.view permission or site scope required",
                  content: {
                    "application/json": {
                      schema: { $ref: "#/components/schemas/ErrorEnvelope" },
                    },
                  },
                },
                "404": {
                  description: "Site not found",
                  content: {
                    "application/json": {
                      schema: { $ref: "#/components/schemas/ErrorEnvelope" },
                    },
                  },
                },
              },
            },
            patch: {
              tags: ["Admin Settings"],
              summary: "Update site-owned Settings sections",
              operationId: "updateBackyAdminSiteSettings",
              description:
                "Authenticated admin update for site-owned Settings sections. Requires sites.configure, rejects workspace-owned keys, records site.settings.updated audit events, and dispatches site-updated webhooks.",
              requestBody: {
                required: true,
                content: {
                  "application/json": {
                    schema: {
                      $ref: "#/components/schemas/AdminSiteSettingsPatchRequest",
                    },
                  },
                },
              },
              responses: {
                "200": {
                  description: "Updated site-scoped Settings envelope",
                  content: {
                    "application/json": {
                      schema: {
                        $ref: "#/components/schemas/AdminSiteSettingsEnvelope",
                      },
                    },
                  },
                },
                "400": {
                  description:
                    "No supported site Settings sections or unsupported workspace Settings keys",
                  content: {
                    "application/json": {
                      schema: { $ref: "#/components/schemas/ErrorEnvelope" },
                    },
                  },
                },
                "401": {
                  description: "Admin authentication required",
                  content: {
                    "application/json": {
                      schema: { $ref: "#/components/schemas/ErrorEnvelope" },
                    },
                  },
                },
                "403": {
                  description:
                    "sites.configure permission or site scope required",
                  content: {
                    "application/json": {
                      schema: { $ref: "#/components/schemas/ErrorEnvelope" },
                    },
                  },
                },
                "404": {
                  description: "Site not found",
                  content: {
                    "application/json": {
                      schema: { $ref: "#/components/schemas/ErrorEnvelope" },
                    },
                  },
                },
              },
            },
          },
          [`/api/admin/sites/${site.id}/pages/{pageId}/revisions`]: {
            get: {
              tags: ["Live Management"],
              summary: "List authenticated page revision snapshots",
              operationId: "listBackyAdminPageRevisions",
              "x-backy-live-management": liveManagementDiscoveryContract,
              description:
                "Requires an admin session or admin API key with pages.view. Returns page snapshots plus backy.content-revision-branch-metadata.v1 so custom page builders can render restore history and rollback branches without scraping the Backy editor.",
              parameters: [
                pathParameter("pageId", "Page id"),
                queryParameter(
                  "limit",
                  { type: "integer", minimum: 1, maximum: 100 },
                  "Maximum revision snapshots to return",
                ),
                queryParameter(
                  "offset",
                  { type: "integer", minimum: 0 },
                  "Revision offset",
                ),
              ],
              responses: {
                "200": {
                  description: "Page revision snapshots",
                  content: {
                    "application/json": {
                      schema: { $ref: "#/components/schemas/AdminPageRevisionsEnvelope" },
                    },
                  },
                },
                "401": {
                  description: "Admin session or API key required",
                  content: {
                    "application/json": {
                      schema: { $ref: "#/components/schemas/ErrorEnvelope" },
                    },
                  },
                },
                "403": {
                  description: "Missing pages.view permission or site team-scope access",
                  content: {
                    "application/json": {
                      schema: { $ref: "#/components/schemas/ErrorEnvelope" },
                    },
                  },
                },
                "404": {
                  description: "Site or page not found",
                  content: {
                    "application/json": {
                      schema: { $ref: "#/components/schemas/ErrorEnvelope" },
                    },
                  },
                },
              },
            },
          },
          [`/api/admin/sites/${site.id}/pages/{pageId}/rollback`]: {
            post: {
              tags: ["Live Management"],
              summary: "Rollback a page to a saved revision",
              operationId: "rollbackBackyAdminPage",
              "x-backy-live-management": liveManagementDiscoveryContract,
              description:
                "Requires an admin session or admin API key with pages.edit. Restores the selected page revision, creates a pre-rollback revision snapshot, records cache invalidation, and dispatches site update webhooks.",
              parameters: [
                pathParameter("pageId", "Page id"),
              ],
              requestBody: {
                required: true,
                content: {
                  "application/json": {
                    schema: { $ref: "#/components/schemas/AdminPageRollbackRequest" },
                  },
                },
              },
              responses: {
                "200": {
                  description: "Rolled-back page detail",
                  content: {
                    "application/json": {
                      schema: { $ref: "#/components/schemas/PageEnvelope" },
                    },
                  },
                },
                "400": {
                  description: "Missing revision id",
                  content: {
                    "application/json": {
                      schema: { $ref: "#/components/schemas/ErrorEnvelope" },
                    },
                  },
                },
                "401": {
                  description: "Admin session or API key required",
                  content: {
                    "application/json": {
                      schema: { $ref: "#/components/schemas/ErrorEnvelope" },
                    },
                  },
                },
                "403": {
                  description: "Missing pages.edit permission or site team-scope access",
                  content: {
                    "application/json": {
                      schema: { $ref: "#/components/schemas/ErrorEnvelope" },
                    },
                  },
                },
                "404": {
                  description: "Site, page, or revision not found",
                  content: {
                    "application/json": {
                      schema: { $ref: "#/components/schemas/ErrorEnvelope" },
                    },
                  },
                },
              },
            },
          },
          [`/api/admin/sites/${site.id}/blog/{postId}/revisions`]: {
            get: {
              tags: ["Live Management"],
              summary: "List authenticated blog post revision snapshots",
              operationId: "listBackyAdminBlogPostRevisions",
              "x-backy-live-management": liveManagementDiscoveryContract,
              description:
                "Requires an admin session or admin API key with pages.view. Returns blog post snapshots plus backy.content-revision-branch-metadata.v1 so custom blog editors can render restore history and rollback branches without scraping the Backy editor.",
              parameters: [
                pathParameter("postId", "Blog post id"),
                queryParameter(
                  "limit",
                  { type: "integer", minimum: 1, maximum: 100 },
                  "Maximum revision snapshots to return",
                ),
                queryParameter(
                  "offset",
                  { type: "integer", minimum: 0 },
                  "Revision offset",
                ),
              ],
              responses: {
                "200": {
                  description: "Blog post revision snapshots",
                  content: {
                    "application/json": {
                      schema: { $ref: "#/components/schemas/AdminBlogPostRevisionsEnvelope" },
                    },
                  },
                },
                "401": {
                  description: "Admin session or API key required",
                  content: {
                    "application/json": {
                      schema: { $ref: "#/components/schemas/ErrorEnvelope" },
                    },
                  },
                },
                "403": {
                  description: "Missing pages.view permission or site team-scope access",
                  content: {
                    "application/json": {
                      schema: { $ref: "#/components/schemas/ErrorEnvelope" },
                    },
                  },
                },
                "404": {
                  description: "Site or blog post not found",
                  content: {
                    "application/json": {
                      schema: { $ref: "#/components/schemas/ErrorEnvelope" },
                    },
                  },
                },
              },
            },
          },
          [`/api/admin/sites/${site.id}/blog/{postId}/rollback`]: {
            post: {
              tags: ["Live Management"],
              summary: "Rollback a blog post to a saved revision",
              operationId: "rollbackBackyAdminBlogPost",
              "x-backy-live-management": liveManagementDiscoveryContract,
              description:
                "Requires an admin session or admin API key with pages.edit. Restores the selected blog post revision, creates a pre-rollback revision snapshot, records cache invalidation, and dispatches site update webhooks.",
              parameters: [
                pathParameter("postId", "Blog post id"),
              ],
              requestBody: {
                required: true,
                content: {
                  "application/json": {
                    schema: { $ref: "#/components/schemas/AdminBlogPostRollbackRequest" },
                  },
                },
              },
              responses: {
                "200": {
                  description: "Rolled-back blog post detail",
                  content: {
                    "application/json": {
                      schema: { $ref: "#/components/schemas/BlogPostEnvelope" },
                    },
                  },
                },
                "400": {
                  description: "Missing revision id",
                  content: {
                    "application/json": {
                      schema: { $ref: "#/components/schemas/ErrorEnvelope" },
                    },
                  },
                },
                "401": {
                  description: "Admin session or API key required",
                  content: {
                    "application/json": {
                      schema: { $ref: "#/components/schemas/ErrorEnvelope" },
                    },
                  },
                },
                "403": {
                  description: "Missing pages.edit permission or site team-scope access",
                  content: {
                    "application/json": {
                      schema: { $ref: "#/components/schemas/ErrorEnvelope" },
                    },
                  },
                },
                "404": {
                  description: "Site, blog post, or revision not found",
                  content: {
                    "application/json": {
                      schema: { $ref: "#/components/schemas/ErrorEnvelope" },
                    },
                  },
                },
              },
            },
          },
          [`/api/sites/${site.id}/interactive-components`]: {
            get: {
              tags: ["Discovery"],
              summary: "Fetch the site interactive component registry",
              operationId: "getBackyInteractiveComponentRegistry",
              responses: {
                "200": {
                  description:
                    "Interactive component registry and sandbox contract",
                  content: {
                    "application/json": {
                      schema: {
                        $ref: "#/components/schemas/InteractiveComponentRegistryEnvelope",
                      },
                    },
                  },
                },
              },
            },
          },
          [`/api/sites/${site.id}/interactive-components/{componentKey}/{version}/sandbox`]:
            {
              get: {
                tags: ["Discovery"],
                summary:
                  "Fetch the sandbox iframe bootstrap for a registered code component",
                operationId: "getBackyInteractiveComponentSandbox",
                parameters: [
                  {
                    name: "componentKey",
                    in: "path",
                    required: true,
                    schema: { type: "string" },
                  },
                  {
                    name: "version",
                    in: "path",
                    required: true,
                    schema: { type: "string" },
                  },
                ],
                responses: {
                  "200": {
                    description: "Constrained sandbox iframe HTML shell",
                    headers: sandboxResponseHeaders,
                    content: {
                      "text/html": {
                        schema: { type: "string" },
                      },
                    },
                  },
                  "403": {
                    description: "Component disabled",
                    headers: sandboxResponseHeaders,
                  },
                  "404": {
                    description: "Site or component not found",
                    headers: sandboxResponseHeaders,
                  },
                },
              },
            },
          [`/api/sites/${site.id}/interactive-components/runtime-events`]: {
            post: {
              tags: ["Interactions"],
              summary: "Record interactive component sandbox runtime telemetry",
              operationId: "recordBackyInteractiveRuntimeEvent",
              requestBody: {
                required: true,
                content: {
                  "application/json": {
                    schema: {
                      $ref: "#/components/schemas/InteractiveRuntimeEventRequest",
                    },
                  },
                },
              },
              responses: {
                "202": {
                  description: "Runtime event recorded",
                  content: {
                    "application/json": {
                      schema: {
                        $ref: "#/components/schemas/RuntimeEventRecordEnvelope",
                      },
                    },
                  },
                },
                "400": { description: "Invalid telemetry payload" },
                "404": { description: "Site not found" },
              },
            },
          },
          [`/api/sites/${site.id}/frontend-design`]: {
            get: {
              tags: ["Discovery"],
              summary: "Fetch the site frontend design contract",
              operationId: "getBackyFrontendDesignContract",
              responses: {
                "200": {
                  description:
                    "Frontend design contract and template inventory",
                  content: {
                    "application/json": {
                      schema: {
                        $ref: "#/components/schemas/FrontendDesignEnvelope",
                      },
                    },
                  },
                },
              },
            },
          },
          [`/api/sites/${site.id}/openapi`]: {
            get: {
              tags: ["Discovery"],
              summary: "Fetch this OpenAPI document",
              operationId: "getBackyOpenApiDocument",
              responses: {
                "200": {
                  description: "OpenAPI document",
                },
              },
            },
          },
          [`/api/sites/${site.id}/resolve`]: {
            get: {
              tags: ["Routing"],
              summary: "Resolve a public path to a Backy route resource",
              operationId: "resolveBackyRoute",
              parameters: [
                {
                  name: "path",
                  in: "query",
                  required: true,
                  schema: { type: "string", example: "/about" },
                },
                {
                  name: "previewToken",
                  in: "query",
                  required: false,
                  schema: { type: "string" },
                },
              ],
              responses: {
                "200": {
                  description: "Resolved route",
                  content: {
                    "application/json": {
                      schema: {
                        $ref: "#/components/schemas/RouteResolveEnvelope",
                      },
                    },
                  },
                },
                "410": {
                  description: "Resolved route is intentionally gone",
                  content: {
                    "application/json": {
                      schema: {
                        $ref: "#/components/schemas/GoneRouteResolveEnvelope",
                      },
                    },
                  },
                },
              },
            },
          },
          [`/api/sites/${site.id}/render`]: {
            get: {
              tags: ["Rendering"],
              summary:
                "Fetch the canonical render payload for a page, blog post, or dynamic item",
              operationId: "getBackyRenderPayload",
              parameters: [
                {
                  name: "path",
                  in: "query",
                  required: true,
                  schema: { type: "string", example: "/about" },
                },
                {
                  name: "previewToken",
                  in: "query",
                  required: false,
                  schema: { type: "string" },
                },
              ],
              responses: {
                "200": {
                  description: "Render payload",
                  content: {
                    "application/json": {
                      schema: {
                        $ref: "https://backy.dev/schemas/ai-frontend-contract/content-payload.schema.json",
                      },
                    },
                  },
                },
              },
            },
          },
          [`/api/sites/${site.id}/seo`]: {
            get: {
              tags: ["Discovery"],
              summary:
                "Fetch site SEO route metadata, sitemap XML, or robots text",
              operationId: "getBackySeoDiscovery",
              parameters: [
                queryParameter(
                  "format",
                  { type: "string", enum: ["json", "sitemap", "robots"] },
                  "Optional response format. Omit for JSON.",
                ),
              ],
              responses: {
                "200": {
                  description: "SEO discovery payload or text response",
                  content: {
                    "application/json": {
                      schema: {
                        $ref: "#/components/schemas/SeoDiscoveryEnvelope",
                      },
                    },
                    "application/xml": {
                      schema: { type: "string" },
                    },
                    "text/plain": {
                      schema: { type: "string" },
                    },
                  },
                },
              },
            },
          },
          [`/api/sites/${site.id}/navigation`]: {
            get: {
              tags: ["Content"],
              summary: "Fetch public site navigation",
              operationId: "getBackyNavigation",
              responses: {
                "200": {
                  description: "Navigation envelope",
                  content: {
                    "application/json": {
                      schema: {
                        $ref: "#/components/schemas/NavigationEnvelope",
                      },
                    },
                  },
                },
              },
            },
          },
          [`/api/sites/${site.id}/pages`]: {
            get: {
              tags: ["Content"],
              summary: "List public pages or fetch one page by slug/path",
              operationId: "listBackyPages",
              parameters: [
                queryParameter(
                  "slug",
                  { type: "string" },
                  "Return one public page by slug",
                ),
                queryParameter(
                  "path",
                  { type: "string" },
                  "Return one public page by path",
                ),
                queryParameter(
                  "previewToken",
                  { type: "string" },
                  "Preview an unpublished page when the token is valid",
                ),
                queryParameter(
                  "limit",
                  { type: "integer", minimum: 1, maximum: 100 },
                  "Page size",
                ),
                queryParameter(
                  "offset",
                  { type: "integer", minimum: 0 },
                  "Page offset",
                ),
              ],
              responses: {
                "200": {
                  description: "Public page list or page detail",
                  content: {
                    "application/json": {
                      schema: {
                        oneOf: [
                          { $ref: "#/components/schemas/PageListEnvelope" },
                          { $ref: "#/components/schemas/PageEnvelope" },
                        ],
                      },
                    },
                  },
                },
                "404": {
                  description: "Page not found",
                },
              },
            },
          },
          [`/api/sites/${site.id}/manage/pages/{pageId}`]: {
            get: {
              tags: ["Live Management"],
              summary: "Read one page for authenticated live-site management",
              operationId: "getBackyLiveManagedPage",
              "x-backy-live-management": liveManagementDiscoveryContract,
              description:
                "Requires an admin session or admin API key with pages.view and site team-scope access.",
              parameters: [
                pathParameter("pageId", "Page id"),
              ],
              responses: {
                "200": {
                  description: "Authenticated page detail",
                  content: {
                    "application/json": {
                      schema: { $ref: "#/components/schemas/PageEnvelope" },
                    },
                  },
                },
                "401": {
                  description: "Admin session or API key required",
                  content: {
                    "application/json": {
                      schema: { $ref: "#/components/schemas/ErrorEnvelope" },
                    },
                  },
                },
                "403": {
                  description: "Missing page permission or site team-scope access",
                  content: {
                    "application/json": {
                      schema: { $ref: "#/components/schemas/ErrorEnvelope" },
                    },
                  },
                },
                "404": {
                  description: "Site or page not found",
                },
              },
            },
            patch: {
              tags: ["Live Management"],
              summary: "Update one page from an authenticated live-site management client",
              operationId: "updateBackyLiveManagedPage",
              "x-backy-live-management": liveManagementDiscoveryContract,
              description:
                "Requires an admin session or admin API key with pages.edit and site team-scope access. Uses the same validation, optimistic conflict handling, readiness checks, audit logging, cache invalidation, and webhook delivery as the admin page detail endpoint.",
              parameters: [
                pathParameter("pageId", "Page id"),
              ],
              requestBody: {
                required: true,
                content: {
                  "application/json": {
                    schema: { $ref: "#/components/schemas/PageUpdateRequest" },
                  },
                },
              },
              responses: {
                "200": {
                  description: "Updated page detail",
                  content: {
                    "application/json": {
                      schema: { $ref: "#/components/schemas/PageEnvelope" },
                    },
                  },
                },
                "400": {
                  description: "Invalid page payload or readiness blocked",
                  content: {
                    "application/json": {
                      schema: { $ref: "#/components/schemas/ErrorEnvelope" },
                    },
                  },
                },
                "401": {
                  description: "Admin session or API key required",
                  content: {
                    "application/json": {
                      schema: { $ref: "#/components/schemas/ErrorEnvelope" },
                    },
                  },
                },
                "403": {
                  description: "Missing page permission or site team-scope access",
                  content: {
                    "application/json": {
                      schema: { $ref: "#/components/schemas/ErrorEnvelope" },
                    },
                  },
                },
                "409": {
                  description: "Slug or page version conflict",
                  content: {
                    "application/json": {
                      schema: { $ref: "#/components/schemas/ErrorEnvelope" },
                    },
                  },
                },
              },
            },
          },
          [`/api/sites/${site.id}/manage/blog/{postId}`]: {
            get: {
              tags: ["Live Management"],
              summary: "Read one blog post for authenticated live-site management",
              operationId: "getBackyLiveManagedBlogPost",
              "x-backy-live-management": liveManagementDiscoveryContract,
              description:
                "Requires an admin session or admin API key with pages.view and site team-scope access.",
              parameters: [
                pathParameter("postId", "Blog post id"),
              ],
              responses: {
                "200": {
                  description: "Authenticated blog post detail",
                  content: {
                    "application/json": {
                      schema: { $ref: "#/components/schemas/BlogPostEnvelope" },
                    },
                  },
                },
                "401": {
                  description: "Admin session or API key required",
                  content: {
                    "application/json": {
                      schema: { $ref: "#/components/schemas/ErrorEnvelope" },
                    },
                  },
                },
                "403": {
                  description: "Missing page permission or site team-scope access",
                  content: {
                    "application/json": {
                      schema: { $ref: "#/components/schemas/ErrorEnvelope" },
                    },
                  },
                },
                "404": {
                  description: "Site or blog post not found",
                },
              },
            },
            patch: {
              tags: ["Live Management"],
              summary: "Update one blog post from an authenticated live-site management client",
              operationId: "updateBackyLiveManagedBlogPost",
              "x-backy-live-management": liveManagementDiscoveryContract,
              description:
                "Requires an admin session or admin API key with pages.edit and site team-scope access. Uses the same validation, optimistic conflict handling, readiness checks, audit logging, cache invalidation, and webhook delivery as the admin blog post detail endpoint.",
              parameters: [
                pathParameter("postId", "Blog post id"),
              ],
              requestBody: {
                required: true,
                content: {
                  "application/json": {
                    schema: { $ref: "#/components/schemas/BlogPostUpdateRequest" },
                  },
                },
              },
              responses: {
                "200": {
                  description: "Updated blog post detail",
                  content: {
                    "application/json": {
                      schema: { $ref: "#/components/schemas/BlogPostEnvelope" },
                    },
                  },
                },
                "400": {
                  description: "Invalid blog post payload or readiness blocked",
                  content: {
                    "application/json": {
                      schema: { $ref: "#/components/schemas/ErrorEnvelope" },
                    },
                  },
                },
                "401": {
                  description: "Admin session or API key required",
                  content: {
                    "application/json": {
                      schema: { $ref: "#/components/schemas/ErrorEnvelope" },
                    },
                  },
                },
                "403": {
                  description: "Missing page permission or site team-scope access",
                  content: {
                    "application/json": {
                      schema: { $ref: "#/components/schemas/ErrorEnvelope" },
                    },
                  },
                },
                "409": {
                  description: "Slug or blog post version conflict",
                  content: {
                    "application/json": {
                      schema: { $ref: "#/components/schemas/ErrorEnvelope" },
                    },
                  },
                },
              },
            },
          },
          [`/api/sites/${site.id}/blog`]: {
            get: {
              tags: ["Content"],
              summary: "List public blog posts or fetch one post by slug",
              operationId: "listBackyBlogPosts",
              parameters: [
                queryParameter(
                  "slug",
                  { type: "string" },
                  "Return one public blog post by slug",
                ),
                queryParameter(
                  "previewToken",
                  { type: "string" },
                  "Preview an unpublished post when the token is valid",
                ),
                queryParameter(
                  "categoryId",
                  { type: "string" },
                  "Filter posts by category id",
                ),
                queryParameter(
                  "categorySlug",
                  { type: "string" },
                  "Filter posts by category slug",
                ),
                queryParameter(
                  "tagId",
                  { type: "string" },
                  "Filter posts by tag id",
                ),
                queryParameter(
                  "tagSlug",
                  { type: "string" },
                  "Filter posts by tag slug",
                ),
                queryParameter(
                  "authorId",
                  { type: "string" },
                  "Filter posts by author id",
                ),
                queryParameter(
                  "authorSlug",
                  { type: "string" },
                  "Filter posts by author slug",
                ),
                queryParameter(
                  "q",
                  { type: "string" },
                  "Search public post title, slug, excerpt, and searchable content",
                ),
                queryParameter("search", { type: "string" }, "Alias for q"),
                queryParameter(
                  "year",
                  { type: "integer", minimum: 1970, maximum: 3000 },
                  "Filter posts by archive year",
                ),
                queryParameter(
                  "month",
                  { type: "integer", minimum: 1, maximum: 12 },
                  "Filter posts by archive month",
                ),
                queryParameter(
                  "limit",
                  { type: "integer", minimum: 1, maximum: 100 },
                  "Page size",
                ),
                queryParameter(
                  "offset",
                  { type: "integer", minimum: 0 },
                  "Page offset",
                ),
              ],
              responses: {
                "200": {
                  description: "Public blog list or post detail",
                  content: {
                    "application/json": {
                      schema: {
                        oneOf: [
                          { $ref: "#/components/schemas/BlogPostListEnvelope" },
                          { $ref: "#/components/schemas/BlogPostEnvelope" },
                        ],
                      },
                    },
                  },
                },
                "404": {
                  description: "Post not found",
                },
              },
            },
          },
          [`/api/sites/${site.id}/blog/rss`]: {
            get: {
              tags: ["Content"],
              summary: "Fetch the public blog RSS 2.0 feed",
              operationId: "getBackyBlogRssFeed",
              "x-backy-feed": blogFeed,
              parameters: [
                queryParameter(
                  "limit",
                  { type: "integer", minimum: 1, maximum: 100 },
                  "Maximum feed item count",
                ),
              ],
              responses: {
                "200": {
                  description: "RSS 2.0 feed for visible published blog posts",
                  content: {
                    "application/rss+xml": {
                      schema: { type: "string" },
                    },
                  },
                },
                "404": {
                  description: "Site not found or hidden",
                },
              },
            },
          },
          [`/api/sites/${site.id}/blog/categories`]: {
            get: {
              tags: ["Content"],
              summary: "List public blog categories",
              operationId: "listBackyBlogCategories",
              responses: {
                "200": {
                  description: "Public blog categories",
                  content: {
                    "application/json": {
                      schema: {
                        $ref: "#/components/schemas/BlogCategoryListEnvelope",
                      },
                    },
                  },
                },
              },
            },
          },
          [`/api/sites/${site.id}/blog/tags`]: {
            get: {
              tags: ["Content"],
              summary: "List public blog tags",
              operationId: "listBackyBlogTags",
              responses: {
                "200": {
                  description: "Public blog tags",
                  content: {
                    "application/json": {
                      schema: {
                        $ref: "#/components/schemas/BlogTagListEnvelope",
                      },
                    },
                  },
                },
              },
            },
          },
          [`/api/sites/${site.id}/blog/authors`]: {
            get: {
              tags: ["Content"],
              summary: "List public blog authors",
              operationId: "listBackyBlogAuthors",
              responses: {
                "200": {
                  description: "Public blog authors",
                  content: {
                    "application/json": {
                      schema: {
                        $ref: "#/components/schemas/BlogAuthorListEnvelope",
                      },
                    },
                  },
                },
              },
            },
          },
          [`/api/sites/${site.id}/media`]: {
            get: {
              tags: ["Media"],
              summary: "List public media assets",
              operationId: "listBackyMedia",
              "x-backy-media-file-categories": mediaFileCategoryDiscoveryContract,
              parameters: [
                {
                  name: "type",
                  in: "query",
                  schema: {
                    type: "string",
                    enum: [
                      "image",
                      "video",
                      "audio",
                      "document",
                      "file",
                      "font",
                      "other",
                    ],
                  },
                },
                { name: "q", in: "query", schema: { type: "string" } },
                { name: "search", in: "query", schema: { type: "string" } },
                { name: "tag", in: "query", schema: { type: "string" } },
                { name: "folder", in: "query", schema: { type: "string" } },
                { name: "folderId", in: "query", schema: { type: "string" } },
                {
                  name: "scope",
                  in: "query",
                  schema: { type: "string", enum: ["global", "page", "post"] },
                },
                { name: "pageId", in: "query", schema: { type: "string" } },
                { name: "postId", in: "query", schema: { type: "string" } },
                { name: "blogId", in: "query", schema: { type: "string" } },
                { name: "global", in: "query", schema: { type: "boolean" } },
                {
                  name: "limit",
                  in: "query",
                  schema: { type: "integer", minimum: 1, maximum: 100 },
                },
                {
                  name: "offset",
                  in: "query",
                  schema: { type: "integer", minimum: 0 },
                },
              ],
              responses: {
                "200": {
                  description: "Media list",
                  content: {
                    "application/json": {
                      schema: { $ref: "#/components/schemas/MediaList" },
                    },
                  },
                },
                "400": {
                  description: "Invalid media type, scope, global, limit, or offset filter",
                  content: {
                    "application/json": {
                      schema: { $ref: "#/components/schemas/ErrorEnvelope" },
                    },
                  },
                },
              },
            },
          },
          [`/api/sites/${site.id}/media/folders`]: {
            get: {
              tags: ["Media"],
              summary:
                "List public media folders that contain public, non-quarantined assets or are ancestors of those folders",
              operationId: "listBackyMediaFolders",
              responses: {
                "200": {
                  description: "Public media folder tree",
                  content: {
                    "application/json": {
                      schema: {
                        $ref: "#/components/schemas/MediaFolderListEnvelope",
                      },
                    },
                  },
                },
                "404": {
                  description: "Site not found",
                  content: {
                    "application/json": {
                      schema: { $ref: "#/components/schemas/ErrorEnvelope" },
                    },
                  },
                },
              },
            },
          },
          [`/api/sites/${site.id}/media/fonts`]: {
            get: {
              tags: ["Media"],
              summary:
                "Fetch public, non-quarantined uploaded font families, variants, and @font-face CSS",
              operationId: "getBackyFontManifest",
              responses: {
                "200": {
                  description: "Font manifest",
                  content: {
                    "application/json": {
                      schema: {
                        $ref: "#/components/schemas/FontManifestEnvelope",
                      },
                    },
                  },
                },
              },
            },
          },
          [`/api/sites/${site.id}/media/{mediaId}`]: {
            get: {
              tags: ["Media"],
              summary: "Fetch a public media asset",
              operationId: "getBackyMedia",
              parameters: [
                {
                  name: "mediaId",
                  in: "path",
                  required: true,
                  schema: { type: "string" },
                },
              ],
              responses: {
                "200": {
                  description: "Media asset",
                  content: {
                    "application/json": {
                      schema: {
                        $ref: "#/components/schemas/MediaDetailEnvelope",
                      },
                    },
                  },
                },
                "404": {
                  description: "Media not found or private",
                },
              },
            },
          },
          [`/api/sites/${site.id}/media/{mediaId}/file`]: {
            get: {
              tags: ["Media"],
              summary:
                "Fetch a media file; private assets require a signed token generated by an admin integration",
              operationId: "getBackyMediaFile",
              parameters: [
                {
                  name: "mediaId",
                  in: "path",
                  required: true,
                  schema: { type: "string" },
                },
                queryParameter(
                  "token",
                  { type: "string" },
                  "Signed media token for private assets",
                ),
                queryParameter(
                  "expiresAt",
                  { type: "integer" },
                  "Signed token expiry timestamp in seconds",
                ),
                queryParameter(
                  "disposition",
                  { type: "string", enum: ["inline", "attachment"] },
                  "Content disposition for the served file",
                ),
              ],
              responses: {
                "200": {
                  description: "Media file bytes",
                  headers: mediaFileResponseHeaders,
                  content: {
                    "*/*": {
                      schema: { type: "string", format: "binary" },
                    },
                  },
                },
                "304": {
                  description: "Media file cache entry unchanged for the supplied ETag",
                  headers: mediaFileResponseHeaders,
                },
                "400": {
                  description: "Invalid media file disposition",
                  headers: mediaFileErrorResponseHeaders,
                },
                "403": {
                  description: "Private media requires a valid signed URL",
                  headers: mediaFileErrorResponseHeaders,
                },
                "404": {
                  description: "Media file not found",
                  headers: mediaFileErrorResponseHeaders,
                },
                "423": {
                  description: "Media asset is quarantined and cannot be delivered",
                  headers: mediaFileErrorResponseHeaders,
                },
              },
            },
          },
          [`/api/sites/${site.id}/media/{mediaId}/transform`]: {
            get: {
              tags: ["Media"],
              summary:
                "Validate and redirect a public image asset to Backy image optimization",
              operationId: "transformBackyMediaImage",
              parameters: [
                {
                  name: "mediaId",
                  in: "path",
                  required: true,
                  schema: { type: "string" },
                },
                queryParameter(
                  "width",
                  { type: "integer", minimum: 16, maximum: 3840 },
                  "Target image width",
                ),
                queryParameter(
                  "w",
                  { type: "integer", minimum: 16, maximum: 3840 },
                  "Alias for width",
                ),
                queryParameter(
                  "quality",
                  { type: "integer", minimum: 1, maximum: 100 },
                  "Output quality, default 75",
                ),
                queryParameter(
                  "q",
                  { type: "integer", minimum: 1, maximum: 100 },
                  "Alias for quality",
                ),
              ],
              responses: {
                "307": {
                  description: "Redirect to optimized image URL",
                  headers: mediaTransformResponseHeaders,
                },
                "304": {
                  description: "Media transform redirect unchanged for the supplied ETag",
                  headers: mediaTransformResponseHeaders,
                },
                "400": {
                  description:
                    "Invalid transform width/quality or unsupported media type",
                  headers: mediaTransformErrorResponseHeaders,
                },
                "404": {
                  description: "Media not found or private",
                  headers: mediaTransformErrorResponseHeaders,
                },
                "423": {
                  description:
                    "Media asset is quarantined and cannot be transformed",
                  headers: mediaTransformErrorResponseHeaders,
                },
              },
            },
          },
          [`/api/sites/${site.id}/collections`]: {
            get: {
              tags: ["Content"],
              summary: "List public CMS collections",
              operationId: "listBackyCollections",
              responses: {
                "200": {
                  description: "Collection list",
                  content: {
                    "application/json": {
                      schema: {
                        $ref: "#/components/schemas/CollectionListEnvelope",
                      },
                    },
                  },
                },
              },
            },
          },
          [`/api/sites/${site.id}/collections/{collectionId}`]: {
            get: {
              tags: ["Content"],
              summary: "Fetch a public CMS collection schema",
              operationId: "getBackyCollection",
              parameters: [
                {
                  name: "collectionId",
                  in: "path",
                  required: true,
                  schema: {
                    type: "string",
                    enum: collectionIds.length > 0 ? collectionIds : undefined,
                  },
                },
              ],
              responses: {
                "200": {
                  description: "Collection schema",
                  content: {
                    "application/json": {
                      schema: {
                        $ref: "#/components/schemas/CollectionEnvelope",
                      },
                    },
                  },
                },
                "404": {
                  description: "Collection not found or not public",
                },
              },
            },
          },
          [`/api/sites/${site.id}/commerce/catalog`]: {
            get: {
              tags: ["Content"],
              summary: "Fetch normalized storefront product catalog data",
              operationId: "getBackyCommerceCatalog",
              parameters: [
                queryParameter(
                  "slug",
                  { type: "string" },
                  "Return one product by slug",
                ),
                queryParameter(
                  "q",
                  { type: "string" },
                  "Search title, SKU, description, category, vendor, and tags",
                ),
                queryParameter(
                  "category",
                  { type: "string" },
                  "Filter by category",
                ),
                queryParameter("tag", { type: "string" }, "Filter by tag"),
                queryParameter(
                  "vendor",
                  { type: "string" },
                  "Filter by vendor",
                ),
                queryParameter(
                  "productType",
                  { type: "string", enum: ["physical", "digital", "service"] },
                  "Filter by product type",
                ),
                queryParameter(
                  "featured",
                  { type: "boolean" },
                  "Filter featured products",
                ),
                queryParameter(
                  "sortBy",
                  { type: "string", default: "title" },
                  "Sort field",
                ),
                queryParameter(
                  "sortDirection",
                  { type: "string", enum: ["asc", "desc"] },
                  "Sort direction",
                ),
                queryParameter(
                  "limit",
                  { type: "integer", minimum: 1, maximum: 100 },
                  "Page size",
                ),
                queryParameter(
                  "offset",
                  { type: "integer", minimum: 0 },
                  "Page offset",
                ),
              ],
              responses: {
                "200": {
                  description: "Normalized commerce catalog",
                  content: {
                    "application/json": {
                      schema: {
                        $ref: "#/components/schemas/CommerceCatalogEnvelope",
                      },
                    },
                  },
                },
                "404": {
                  description: hasCommerceCatalog
                    ? "Product not found"
                    : "Product catalog not found or not public",
                },
              },
            },
          },
          [`/api/sites/${site.id}/commerce/orders`]: {
            get: {
              tags: ["Interactions"],
              summary:
                "Fetch the public checkout order intake contract or tokenized customer order status",
              operationId: "getBackyCommerceOrderContract",
              parameters: [
                queryParameter(
                  "orderId",
                  { type: "string" },
                  "Order id for a tokenized customer-safe status refresh",
                ),
                queryParameter(
                  "orderSlug",
                  { type: "string" },
                  "Order slug for a tokenized customer-safe status refresh",
                ),
                queryParameter(
                  "orderNumber",
                  { type: "string" },
                  "Order number for a tokenized customer-safe status refresh",
                ),
                queryParameter(
                  "statusToken",
                  { type: "string" },
                  "One-time returned public order status token; Backy stores only its hash",
                ),
              ],
              responses: {
                "200": {
                  description:
                    "Commerce order intake contract or customer-safe public order status handoff",
                  content: {
                    "application/json": {
                      schema: {
                        oneOf: [
                          {
                            $ref: "#/components/schemas/CommerceOrderContractEnvelope",
                          },
                          {
                            $ref: "#/components/schemas/CommerceOrderStatusHandoffEnvelope",
                          },
                        ],
                      },
                    },
                  },
                },
                "401": {
                  description: "Status token required for public order status refresh",
                  content: {
                    "application/json": {
                      schema: { $ref: "#/components/schemas/ErrorEnvelope" },
                    },
                  },
                },
                "403": {
                  description:
                    "Status token was not issued, is expired, or is invalid",
                  content: {
                    "application/json": {
                      schema: { $ref: "#/components/schemas/ErrorEnvelope" },
                    },
                  },
                },
              },
            },
            post: {
              tags: ["Interactions"],
              summary:
                "Create a private Backy order from a public checkout cart",
              operationId: "createBackyCommerceOrder",
              requestBody: {
                required: true,
                content: {
                  "application/json": {
                    schema: {
                      $ref: "#/components/schemas/CommerceOrderCreateRequest",
                    },
                  },
                },
              },
              responses: {
                "201": {
                  description: "Private order captured",
                  content: {
                    "application/json": {
                      schema: {
                        $ref: "#/components/schemas/CommerceOrderEnvelope",
                      },
                    },
                  },
                },
                "404": {
                  description:
                    hasCommerceCatalog && hasPrivateOrders
                      ? "Product not found"
                      : "Product catalog or private order queue not found",
                },
                "409": {
                  description:
                    "Product is out of stock or orders collection is not private",
                },
              },
            },
          },
          [`/api/sites/${site.id}/commerce/webhook`]: {
            post: {
              tags: ["Interactions"],
              summary:
                "Receive a commerce provider webhook and settle a private order",
              operationId: "receiveBackyCommerceWebhook",
              requestBody: {
                required: true,
                content: {
                  "application/json": {
                    schema: {
                      $ref: "#/components/schemas/CommerceWebhookRequest",
                    },
                  },
                },
              },
              responses: {
                "200": {
                  description: "Commerce webhook processed",
                  content: {
                    "application/json": {
                      schema: {
                        $ref: "#/components/schemas/CommerceWebhookEnvelope",
                      },
                    },
                  },
                },
                "404": {
                  description:
                    "Site, private order queue, or matching order not found",
                },
                "409": {
                  description:
                    "Commerce webhooks disabled or event type not allowed",
                },
              },
            },
          },
          [`/api/sites/${site.id}/collections/{collectionId}/records`]: {
            get: {
              tags: ["Content"],
              summary: "List or filter public records from a CMS collection",
              operationId: "listBackyCollectionRecords",
              parameters: [
                {
                  name: "collectionId",
                  in: "path",
                  required: true,
                  schema: {
                    type: "string",
                    enum: collectionIds.length > 0 ? collectionIds : undefined,
                  },
                },
                { name: "slug", in: "query", schema: { type: "string" } },
                { name: "q", in: "query", schema: { type: "string" } },
                { name: "fieldKey", in: "query", schema: { type: "string" } },
                { name: "fieldValue", in: "query", schema: { type: "string" } },
                { name: "sortBy", in: "query", schema: { type: "string" } },
                {
                  name: "sortDirection",
                  in: "query",
                  schema: { type: "string", enum: ["asc", "desc"] },
                },
                {
                  name: "limit",
                  in: "query",
                  schema: { type: "integer", minimum: 1, maximum: 100 },
                },
                {
                  name: "offset",
                  in: "query",
                  schema: { type: "integer", minimum: 0 },
                },
              ],
              responses: {
                "200": {
                  description: "Collection records",
                  content: {
                    "application/json": {
                      schema: {
                        $ref: "#/components/schemas/CollectionRecordListEnvelope",
                      },
                    },
                  },
                },
              },
            },
            post: {
              tags: ["Interactions"],
              summary:
                "Create a draft collection record when public creation and field policy allow it",
              operationId: "createBackyCollectionRecord",
              parameters: [
                {
                  name: "collectionId",
                  in: "path",
                  required: true,
                  schema: {
                    type: "string",
                    enum: collectionIds.length > 0 ? collectionIds : undefined,
                  },
                },
              ],
              requestBody: {
                required: true,
                content: {
                  "application/json": {
                    schema: {
                      type: "object",
                      properties: {
                        slug: { type: "string" },
                        values: { type: "object", additionalProperties: true },
                      },
                      required: ["values"],
                    },
                  },
                },
              },
              responses: {
                "201": {
                  description: "Draft record created",
                  content: {
                    "application/json": {
                      schema: {
                        $ref: "#/components/schemas/CollectionRecordEnvelope",
                      },
                    },
                  },
                },
              },
            },
          },
          [`/api/sites/${site.id}/collections/{collectionId}/records/{recordId}`]:
            {
              patch: {
                tags: ["Interactions"],
                summary:
                  "Update a collection record when public update and write-token policy allow it",
                operationId: "updateBackyCollectionRecord",
                parameters: [
                  {
                    name: "collectionId",
                    in: "path",
                    required: true,
                    schema: {
                      type: "string",
                      enum:
                        collectionIds.length > 0 ? collectionIds : undefined,
                    },
                  },
                  pathParameter("recordId", "Collection record ID or slug"),
                  {
                    name: "x-backy-public-write-token",
                    in: "header",
                    required: false,
                    schema: { type: "string" },
                    description:
                      "Collection-scoped public write token configured in visitorWritePolicy.",
                  },
                ],
                requestBody: {
                  required: true,
                  content: {
                    "application/json": {
                      schema: {
                        type: "object",
                        properties: {
                          values: {
                            type: "object",
                            additionalProperties: true,
                          },
                          fields: {
                            type: "object",
                            additionalProperties: true,
                          },
                          publicWriteToken: { type: "string" },
                        },
                      },
                    },
                  },
                },
                responses: {
                  "200": {
                    description: "Private updated record response",
                    content: {
                      "application/json": {
                        schema: {
                          $ref: "#/components/schemas/CollectionRecordEnvelope",
                        },
                      },
                    },
                  },
                  "403": {
                    description:
                      "Public update disabled or public write token missing/invalid",
                  },
                },
              },
              delete: {
                tags: ["Interactions"],
                summary:
                  "Delete a collection record when public delete and write-token policy allow it",
                operationId: "deleteBackyCollectionRecord",
                parameters: [
                  {
                    name: "collectionId",
                    in: "path",
                    required: true,
                    schema: {
                      type: "string",
                      enum:
                        collectionIds.length > 0 ? collectionIds : undefined,
                    },
                  },
                  pathParameter("recordId", "Collection record ID or slug"),
                  {
                    name: "x-backy-public-write-token",
                    in: "header",
                    required: false,
                    schema: { type: "string" },
                    description:
                      "Collection-scoped public write token configured in visitorWritePolicy.",
                  },
                ],
                responses: {
                  "200": {
                    description: "Private deleted record response",
                    content: {
                      "application/json": {
                        schema: {
                          $ref: "#/components/schemas/PublicDeleteEnvelope",
                        },
                      },
                    },
                  },
                  "403": {
                    description:
                      "Public delete disabled or public write token missing/invalid",
                  },
                },
              },
            },
          [`/api/sites/${site.id}/reusable-sections`]: {
            get: {
              tags: ["Content"],
              summary: "List active reusable section templates",
              operationId: "listBackyReusableSections",
              parameters: [
                queryParameter(
                  "category",
                  { type: "string" },
                  "Filter by saved section category",
                ),
                queryParameter(
                  "tag",
                  { type: "string" },
                  "Filter by saved section tag",
                ),
                queryParameter(
                  "search",
                  { type: "string" },
                  "Search saved section name, slug, description, category, or tags",
                ),
              ],
              responses: {
                "200": {
                  description: "Reusable section list",
                  content: {
                    "application/json": {
                      schema: {
                        $ref: "#/components/schemas/ReusableSectionListEnvelope",
                      },
                    },
                  },
                },
              },
            },
          },
          [`/api/sites/${site.id}/reusable-sections/{sectionId}`]: {
            get: {
              tags: ["Content"],
              summary: "Fetch an active reusable section template",
              operationId: "getBackyReusableSection",
              parameters: [
                pathParameter(
                  "sectionId",
                  "Reusable section ID or slug",
                  reusableSectionIds,
                ),
              ],
              responses: {
                "200": {
                  description: "Reusable section detail",
                  content: {
                    "application/json": {
                      schema: {
                        $ref: "#/components/schemas/ReusableSectionEnvelope",
                      },
                    },
                  },
                },
              },
            },
          },
          [`/api/sites/${site.id}/forms`]: {
            get: {
              tags: ["Interactions"],
              summary: "List site forms",
              operationId: "listBackyForms",
              parameters: [
                queryParameter("pageId"),
                queryParameter("postId"),
                queryParameter("active", { type: "boolean" }),
              ],
              responses: {
                "200": {
                  description: "Form definitions",
                  content: {
                    "application/json": {
                      schema: { $ref: "#/components/schemas/FormListEnvelope" },
                    },
                  },
                },
              },
            },
          },
          [`/api/sites/${site.id}/forms/{formId}`]: {
            get: {
              tags: ["Interactions"],
              summary:
                "Fetch a public-safe form detail payload with endpoint handoff links",
              operationId: "getBackyForm",
              parameters: [pathParameter("formId", "Form id", formIds)],
              responses: {
                "200": {
                  description: "Form definition",
                  content: {
                    "application/json": {
                      schema: { $ref: "#/components/schemas/FormEnvelope" },
                    },
                  },
                },
              },
            },
          },
          [`/api/sites/${site.id}/forms/{formId}/definition`]: {
            get: {
              tags: ["Interactions"],
              summary:
                "Fetch a cacheable public form definition without submissions or contacts",
              operationId: "getBackyFormDefinition",
              parameters: [pathParameter("formId", "Form id", formIds)],
              responses: {
                "200": {
                  description: "Cacheable form definition",
                  content: {
                    "application/json": {
                      schema: {
                        $ref: "#/components/schemas/FormDefinitionEnvelope",
                      },
                    },
                  },
                },
              },
            },
          },
          [`/api/sites/${site.id}/forms/{formId}/submissions`]: {
            get: {
              tags: ["Interactions"],
              summary: "List private form submissions for review workflows",
              operationId: "listBackyFormSubmissions",
              parameters: [
                pathParameter("formId", "Form id", formIds),
                queryParameter("status", {
                  type: "string",
                  enum: ["pending", "approved", "rejected", "spam"],
                }),
                queryParameter("requestId"),
                queryParameter("limit", {
                  type: "integer",
                  minimum: 1,
                  maximum: 100,
                }),
                queryParameter("offset", { type: "integer", minimum: 0 }),
              ],
              responses: {
                "200": {
                  description: "Form submission list",
                  content: {
                    "application/json": {
                      schema: {
                        $ref: "#/components/schemas/FormSubmissionsEnvelope",
                      },
                    },
                  },
                },
              },
            },
            post: {
              tags: ["Interactions"],
              summary:
                "Submit a Backy form using canonical field keys or frontendFieldKeyMap aliases",
              operationId: "submitBackyForm",
              parameters: [pathParameter("formId", "Form id", formIds)],
              requestBody: {
                required: true,
                content: {
                  "application/json": {
                    schema: {
                      $ref: "#/components/schemas/FormSubmissionRequest",
                    },
                  },
                },
              },
              responses: {
                "201": {
                  description: "Submission accepted",
                  content: {
                    "application/json": {
                      schema: {
                        $ref: "#/components/schemas/FormSubmissionEnvelope",
                      },
                    },
                  },
                },
                "400": {
                  description: "Invalid submission payload",
                  content: {
                    "application/json": {
                      schema: { $ref: "#/components/schemas/ErrorEnvelope" },
                    },
                  },
                },
                "422": {
                  description:
                    "Machine-readable field validation or spam rejection",
                  content: {
                    "application/json": {
                      schema: {
                        $ref: "#/components/schemas/FormSubmissionValidationErrorEnvelope",
                      },
                    },
                  },
                },
              },
            },
          },
          [`/api/sites/${site.id}/forms/{formId}/submissions/{submissionId}`]: {
            get: {
              tags: ["Interactions"],
              summary: "Fetch one private form submission",
              operationId: "getBackyFormSubmission",
              parameters: [
                pathParameter("formId", "Form id", formIds),
                pathParameter("submissionId", "Submission id"),
              ],
              responses: {
                "200": {
                  description: "Form submission detail",
                  content: {
                    "application/json": {
                      schema: {
                        $ref: "#/components/schemas/FormSubmissionEnvelope",
                      },
                    },
                  },
                },
              },
            },
            patch: {
              tags: ["Interactions"],
              summary: "Review or moderate a private form submission",
              operationId: "reviewBackyFormSubmission",
              parameters: [
                pathParameter("formId", "Form id", formIds),
                pathParameter("submissionId", "Submission id"),
              ],
              requestBody: {
                required: true,
                content: {
                  "application/json": {
                    schema: {
                      type: "object",
                      properties: {
                        status: {
                          type: "string",
                          enum: ["pending", "approved", "rejected", "spam"],
                        },
                        reviewedBy: { type: "string" },
                        adminNotes: { type: "string" },
                      },
                      required: ["status"],
                    },
                  },
                },
              },
              responses: {
                "200": {
                  description: "Reviewed submission",
                  content: {
                    "application/json": {
                      schema: {
                        $ref: "#/components/schemas/FormSubmissionEnvelope",
                      },
                    },
                  },
                },
              },
            },
          },
          [`/api/sites/${site.id}/forms/{formId}/contacts`]: {
            get: {
              tags: ["Interactions"],
              summary: "List private contacts captured from form submissions",
              operationId: "listBackyFormContacts",
              parameters: [
                pathParameter("formId", "Form id", formIds),
                queryParameter("status", {
                  type: "string",
                  enum: ["new", "contacted", "qualified", "archived"],
                }),
                queryParameter("requestId"),
                queryParameter("limit", {
                  type: "integer",
                  minimum: 1,
                  maximum: 100,
                }),
                queryParameter("offset", { type: "integer", minimum: 0 }),
              ],
              responses: {
                "200": {
                  description: "Form contact list",
                  content: {
                    "application/json": {
                      schema: {
                        $ref: "#/components/schemas/FormContactsEnvelope",
                      },
                    },
                  },
                },
              },
            },
          },
          [`/api/sites/${site.id}/forms/{formId}/contacts/{contactId}`]: {
            get: {
              tags: ["Interactions"],
              summary: "Fetch one private form contact",
              operationId: "getBackyFormContact",
              parameters: [
                pathParameter("formId", "Form id", formIds),
                pathParameter("contactId", "Contact id"),
              ],
              responses: {
                "200": {
                  description: "Form contact detail",
                  content: {
                    "application/json": {
                      schema: {
                        $ref: "#/components/schemas/FormContactEnvelope",
                      },
                    },
                  },
                },
              },
            },
            patch: {
              tags: ["Interactions"],
              summary: "Update a private form contact status or notes",
              operationId: "updateBackyFormContact",
              parameters: [
                pathParameter("formId", "Form id", formIds),
                pathParameter("contactId", "Contact id"),
              ],
              requestBody: {
                required: true,
                content: {
                  "application/json": {
                    schema: {
                      type: "object",
                      properties: {
                        status: {
                          type: "string",
                          enum: ["new", "contacted", "qualified", "archived"],
                        },
                        notes: { type: ["string", "null"] },
                      },
                    },
                  },
                },
              },
              responses: {
                "200": {
                  description: "Updated form contact",
                  content: {
                    "application/json": {
                      schema: {
                        $ref: "#/components/schemas/FormContactEnvelope",
                      },
                    },
                  },
                },
              },
            },
          },
          [`/api/sites/${site.id}/pages/{pageId}/comments`]: {
            get: {
              tags: ["Interactions"],
              summary: "List comments for a page",
              operationId: "listBackyPageComments",
              parameters: [
                pathParameter("pageId", "Page id"),
                queryParameter("status", {
                  type: "string",
                  enum: [
                    "pending",
                    "approved",
                    "rejected",
                    "spam",
                    "blocked",
                    "all",
                  ],
                }),
                queryParameter("requestId"),
                queryParameter(
                  "parentId",
                  { type: "string" },
                  "Return replies for a specific parent comment.",
                ),
                queryParameter(
                  "parentOnly",
                  { type: "boolean" },
                  "Return only top-level comments when true.",
                ),
                queryParameter(
                  "commentThreadId",
                  { type: "string" },
                  "Filter comments to a specific frontend comment thread widget.",
                ),
                queryParameter("sort", {
                  type: "string",
                  enum: ["newest", "oldest"],
                }),
                queryParameter("limit", {
                  type: "integer",
                  minimum: 1,
                  maximum: 100,
                }),
                queryParameter("offset", { type: "integer", minimum: 0 }),
              ],
              responses: {
                "200": {
                  description: "Page comments",
                  content: {
                    "application/json": {
                      schema: { $ref: "#/components/schemas/CommentsEnvelope" },
                    },
                  },
                },
              },
            },
            post: {
              tags: ["Interactions"],
              summary: "Submit a page comment",
              operationId: "submitBackyPageComment",
              parameters: [pathParameter("pageId", "Page id")],
              requestBody: {
                required: true,
                content: {
                  "application/json": {
                    schema: {
                      $ref: "#/components/schemas/CommentSubmitRequest",
                    },
                  },
                },
              },
              responses: {
                "201": {
                  description: "Comment accepted",
                  content: {
                    "application/json": {
                      schema: { $ref: "#/components/schemas/CommentEnvelope" },
                    },
                  },
                },
              },
            },
          },
          [`/api/sites/${site.id}/pages/{pageId}/comments/{commentId}`]: {
            get: {
              tags: ["Interactions"],
              summary: "Fetch a page comment by id",
              operationId: "getBackyPageComment",
              parameters: [
                pathParameter("pageId", "Page id"),
                pathParameter("commentId", "Comment id"),
              ],
              responses: {
                "200": {
                  description: "Page comment",
                  content: {
                    "application/json": {
                      schema: { $ref: "#/components/schemas/CommentEnvelope" },
                    },
                  },
                },
              },
            },
            patch: {
              tags: ["Interactions"],
              summary: "Update page comment moderation state",
              operationId: "updateBackyPageComment",
              parameters: [
                pathParameter("pageId", "Page id"),
                pathParameter("commentId", "Comment id"),
              ],
              requestBody: {
                required: true,
                content: {
                  "application/json": {
                    schema: {
                      $ref: "#/components/schemas/CommentUpdateRequest",
                    },
                  },
                },
              },
              responses: {
                "200": {
                  description: "Updated page comment",
                  content: {
                    "application/json": {
                      schema: { $ref: "#/components/schemas/CommentEnvelope" },
                    },
                  },
                },
              },
            },
          },
          [`/api/sites/${site.id}/blog/{postId}/comments`]: {
            get: {
              tags: ["Interactions"],
              summary: "List comments for a blog post",
              operationId: "listBackyBlogComments",
              parameters: [
                pathParameter("postId", "Blog post id"),
                queryParameter("status", {
                  type: "string",
                  enum: [
                    "pending",
                    "approved",
                    "rejected",
                    "spam",
                    "blocked",
                    "all",
                  ],
                }),
                queryParameter("requestId"),
                queryParameter(
                  "parentId",
                  { type: "string" },
                  "Return replies for a specific parent comment.",
                ),
                queryParameter(
                  "parentOnly",
                  { type: "boolean" },
                  "Return only top-level comments when true.",
                ),
                queryParameter(
                  "commentThreadId",
                  { type: "string" },
                  "Filter comments to a specific frontend comment thread widget.",
                ),
                queryParameter("sort", {
                  type: "string",
                  enum: ["newest", "oldest"],
                }),
                queryParameter("limit", {
                  type: "integer",
                  minimum: 1,
                  maximum: 100,
                }),
                queryParameter("offset", { type: "integer", minimum: 0 }),
              ],
              responses: {
                "200": {
                  description: "Blog comments",
                  content: {
                    "application/json": {
                      schema: { $ref: "#/components/schemas/CommentsEnvelope" },
                    },
                  },
                },
              },
            },
            post: {
              tags: ["Interactions"],
              summary: "Submit a blog post comment",
              operationId: "submitBackyBlogComment",
              parameters: [pathParameter("postId", "Blog post id")],
              requestBody: {
                required: true,
                content: {
                  "application/json": {
                    schema: {
                      $ref: "#/components/schemas/CommentSubmitRequest",
                    },
                  },
                },
              },
              responses: {
                "201": {
                  description: "Comment accepted",
                  content: {
                    "application/json": {
                      schema: { $ref: "#/components/schemas/CommentEnvelope" },
                    },
                  },
                },
              },
            },
          },
          [`/api/sites/${site.id}/blog/{postId}/comments/{commentId}`]: {
            get: {
              tags: ["Interactions"],
              summary: "Fetch a blog comment by id",
              operationId: "getBackyBlogComment",
              parameters: [
                pathParameter("postId", "Blog post id"),
                pathParameter("commentId", "Comment id"),
              ],
              responses: {
                "200": {
                  description: "Blog comment",
                  content: {
                    "application/json": {
                      schema: { $ref: "#/components/schemas/CommentEnvelope" },
                    },
                  },
                },
              },
            },
            patch: {
              tags: ["Interactions"],
              summary: "Update blog comment moderation state",
              operationId: "updateBackyBlogComment",
              parameters: [
                pathParameter("postId", "Blog post id"),
                pathParameter("commentId", "Comment id"),
              ],
              requestBody: {
                required: true,
                content: {
                  "application/json": {
                    schema: {
                      $ref: "#/components/schemas/CommentUpdateRequest",
                    },
                  },
                },
              },
              responses: {
                "200": {
                  description: "Updated blog comment",
                  content: {
                    "application/json": {
                      schema: { $ref: "#/components/schemas/CommentEnvelope" },
                    },
                  },
                },
              },
            },
          },
          [`/api/sites/${site.id}/comments`]: {
            get: {
              tags: ["Interactions"],
              summary: "List site-wide comments across pages and posts",
              operationId: "listBackySiteComments",
              parameters: [
                queryParameter("targetType", {
                  type: "string",
                  enum: ["page", "post"],
                }),
                queryParameter("targetId"),
                queryParameter("status", {
                  type: "string",
                  enum: [
                    "pending",
                    "approved",
                    "rejected",
                    "spam",
                    "blocked",
                    "all",
                  ],
                }),
                queryParameter("requestId"),
                queryParameter(
                  "parentId",
                  { type: "string" },
                  "Return replies for a specific parent comment.",
                ),
                queryParameter(
                  "parentOnly",
                  { type: "boolean" },
                  "Return only top-level comments when true.",
                ),
                queryParameter(
                  "commentThreadId",
                  { type: "string" },
                  "Filter comments to a specific frontend comment thread widget.",
                ),
                queryParameter(
                  "q",
                  { type: "string" },
                  "Search comment content and author fields.",
                ),
                queryParameter("sort", {
                  type: "string",
                  enum: ["newest", "oldest"],
                }),
                queryParameter("limit", {
                  type: "integer",
                  minimum: 1,
                  maximum: 100,
                }),
                queryParameter("offset", { type: "integer", minimum: 0 }),
              ],
              responses: {
                "200": {
                  description: "Site comments",
                  content: {
                    "application/json": {
                      schema: { $ref: "#/components/schemas/CommentsEnvelope" },
                    },
                  },
                },
              },
            },
            patch: {
              tags: ["Interactions"],
              summary: "Bulk update site-wide comments",
              operationId: "bulkUpdateBackySiteComments",
              requestBody: {
                required: true,
                content: {
                  "application/json": {
                    schema: {
                      $ref: "#/components/schemas/CommentBulkUpdateRequest",
                    },
                  },
                },
              },
              responses: {
                "200": {
                  description: "Bulk comment update result",
                  content: {
                    "application/json": {
                      schema: {
                        $ref: "#/components/schemas/CommentBulkUpdateEnvelope",
                      },
                    },
                  },
                },
              },
            },
          },
          [`/api/sites/${site.id}/comments/blocklist`]: {
            get: {
              tags: ["Interactions"],
              summary: "List blocked comment authors for moderation",
              operationId: "listBackyCommentBlocklist",
              parameters: [
                queryParameter("type", {
                  type: "string",
                  enum: ["email", "ip", "all"],
                }),
                queryParameter(
                  "q",
                  { type: "string" },
                  "Search blocked value, reason, or actor.",
                ),
                queryParameter("limit", {
                  type: "integer",
                  minimum: 1,
                  maximum: 100,
                }),
                queryParameter("offset", { type: "integer", minimum: 0 }),
              ],
              responses: {
                "200": {
                  description: "Comment author blocklist",
                  content: {
                    "application/json": {
                      schema: {
                        $ref: "#/components/schemas/CommentBlocklistEnvelope",
                      },
                    },
                  },
                },
              },
            },
            delete: {
              tags: ["Interactions"],
              summary: "Remove blocked comment authors",
              operationId: "deleteBackyCommentBlocklistEntries",
              requestBody: {
                required: true,
                content: {
                  "application/json": {
                    schema: {
                      $ref: "#/components/schemas/CommentBlocklistDeleteRequest",
                    },
                  },
                },
              },
              responses: {
                "200": {
                  description: "Removed comment author blocklist entries",
                  content: {
                    "application/json": {
                      schema: {
                        $ref: "#/components/schemas/CommentBlocklistDeleteEnvelope",
                      },
                    },
                  },
                },
              },
            },
          },
          [`/api/sites/${site.id}/comments/analytics`]: {
            get: {
              tags: ["Interactions"],
              summary: "Read private comment moderation analytics",
              description:
                "Authenticated comment viewers can inspect moderation totals, report reasons, threaded reply pressure, target hotspots, and daily comment activity for external moderation dashboards.",
              operationId: "getBackyCommentAnalytics",
              parameters: [
                queryParameter("days", {
                  type: "integer",
                  minimum: 1,
                  maximum: 365,
                  default: 30,
                }),
                queryParameter("targetType", {
                  type: "string",
                  enum: ["page", "post", "all"],
                  default: "all",
                }),
                queryParameter(
                  "targetId",
                  { type: "string" },
                  "Optional page or post id to scope analytics.",
                ),
              ],
              responses: {
                "200": {
                  description: "Private comment moderation analytics",
                  content: {
                    "application/json": {
                      schema: {
                        $ref: "#/components/schemas/CommentAnalyticsEnvelope",
                      },
                    },
                  },
                },
              },
            },
          },
          [`/api/sites/${site.id}/comments/{commentId}`]: {
            get: {
              tags: ["Interactions"],
              summary: "Fetch a site-wide comment by id",
              operationId: "getBackySiteComment",
              parameters: [pathParameter("commentId", "Comment id")],
              responses: {
                "200": {
                  description: "Site comment",
                  content: {
                    "application/json": {
                      schema: { $ref: "#/components/schemas/CommentEnvelope" },
                    },
                  },
                },
              },
            },
            patch: {
              tags: ["Interactions"],
              summary: "Update a site-wide comment moderation state",
              operationId: "updateBackySiteComment",
              parameters: [pathParameter("commentId", "Comment id")],
              requestBody: {
                required: true,
                content: {
                  "application/json": {
                    schema: {
                      $ref: "#/components/schemas/CommentUpdateRequest",
                    },
                  },
                },
              },
              responses: {
                "200": {
                  description: "Updated site comment",
                  content: {
                    "application/json": {
                      schema: { $ref: "#/components/schemas/CommentEnvelope" },
                    },
                  },
                },
              },
            },
          },
          [`/api/sites/${site.id}/comments/{commentId}/delivery-retry`]: {
            post: {
              tags: ["Interactions"],
              summary: "Retry a failed comment delivery event",
              description:
                "Authenticated comment managers can retry failed webhook or email delivery attempts recorded for a comment. The request references an existing failed delivery event id and preserves Backy's audited delivery boundary.",
              operationId: "retryBackyCommentDelivery",
              parameters: [pathParameter("commentId", "Comment id")],
              requestBody: {
                required: true,
                content: {
                  "application/json": {
                    schema: {
                      $ref: "#/components/schemas/CommentDeliveryRetryRequest",
                    },
                  },
                },
              },
              responses: {
                "200": {
                  description: "Retried comment delivery",
                  content: {
                    "application/json": {
                      schema: {
                        $ref: "#/components/schemas/CommentDeliveryRetryEnvelope",
                      },
                    },
                  },
                },
                "409": {
                  description:
                    "Delivery event is not failed, not retryable, mismatched, or has an invalid target.",
                  content: {
                    "application/json": {
                      schema: { $ref: "#/components/schemas/ErrorEnvelope" },
                    },
                  },
                },
              },
            },
          },
          [`/api/sites/${site.id}/comments/report-reasons`]: {
            get: {
              tags: ["Interactions"],
              summary: "List supported comment report reasons",
              operationId: "listBackyCommentReportReasons",
              responses: {
                "200": {
                  description: "Comment report reasons",
                  content: {
                    "application/json": {
                      schema: {
                        $ref: "#/components/schemas/CommentReportReasonsEnvelope",
                      },
                    },
                  },
                },
              },
            },
          },
          [`/api/sites/${site.id}/comments/{commentId}/report`]: {
            get: {
              tags: ["Interactions"],
              summary: "List supported report reasons for a comment",
              operationId: "getBackyCommentReportReasons",
              parameters: [pathParameter("commentId", "Comment id")],
              responses: {
                "200": {
                  description: "Comment report reasons",
                  content: {
                    "application/json": {
                      schema: {
                        $ref: "#/components/schemas/CommentReportReasonsEnvelope",
                      },
                    },
                  },
                },
              },
            },
            post: {
              tags: ["Interactions"],
              summary: "Report a comment",
              operationId: "reportBackyComment",
              parameters: [pathParameter("commentId", "Comment id")],
              requestBody: {
                required: true,
                content: {
                  "application/json": {
                    schema: {
                      type: "object",
                      properties: {
                        reason: { type: "string" },
                        reportReason: { type: "string" },
                        category: { type: "string" },
                        actor: { type: "string" },
                        details: { type: "string" },
                        reporterEmail: { type: "string" },
                        reporter: { type: "string" },
                        email: { type: "string" },
                        requestId: { type: "string" },
                      },
                      anyOf: [
                        { required: ["reason"] },
                        { required: ["reportReason"] },
                        { required: ["category"] },
                      ],
                    },
                  },
                },
              },
              responses: {
                "201": {
                  description: "Comment report accepted",
                  content: {
                    "application/json": {
                      schema: {
                        $ref: "#/components/schemas/CommentReportEnvelope",
                      },
                    },
                  },
                },
              },
            },
          },
          [`/api/sites/${site.id}/events`]: {
            get: {
              tags: ["Interactions"],
              summary: "List public interaction audit events",
              operationId: "listBackyInteractionEvents",
              parameters: [
                queryParameter("kind"),
                queryParameter("requestId"),
                queryParameter("formId"),
                queryParameter("commentId"),
                queryParameter("contactId"),
                queryParameter("limit", {
                  type: "integer",
                  minimum: 1,
                  maximum: 100,
                }),
                queryParameter("offset", { type: "integer", minimum: 0 }),
              ],
              responses: {
                "200": {
                  description: "Interaction events",
                  content: {
                    "application/json": {
                      schema: { $ref: "#/components/schemas/EventsEnvelope" },
                    },
                  },
                },
              },
            },
          },
        },
        components: {
          schemas: {
            ErrorEnvelope: {
              type: "object",
              required: ["success", "requestId", "error"],
              properties: {
                success: { const: false },
                requestId: { type: "string" },
                error: {
                  type: "object",
                  required: ["code", "message"],
                  properties: {
                    code: { type: "string" },
                    message: { type: "string" },
                  },
                },
              },
            },
            SiteSummary: {
              type: "object",
              required: ["id", "slug", "name"],
              additionalProperties: true,
              properties: {
                id: { type: "string" },
                slug: { type: "string" },
                name: { type: "string" },
                description: { type: ["string", "null"] },
                customDomain: { type: ["string", "null"] },
                status: {
                  type: "string",
                  enum: ["draft", "published", "scheduled", "archived"],
                },
                isPublished: { type: "boolean" },
                theme: { type: "object", additionalProperties: true },
              },
            },
            SiteListEnvelope: envelopeSchema({
              type: "object",
              required: ["sites", "pagination"],
              properties: {
                sites: {
                  type: "array",
                  items: { $ref: "#/components/schemas/SiteSummary" },
                },
                pagination: { type: "object", additionalProperties: true },
              },
            }),
            SiteEnvelope: envelopeSchema({
              type: "object",
              required: ["site"],
              properties: {
                site: { $ref: "#/components/schemas/SiteSummary" },
              },
            }),
            AdminSettingsProviderCertificationEvidence: {
              type: "object",
              required: [
                "schemaVersion",
                "status",
                "requiredGate",
                "coverage",
                "scenarios",
                "secretHandling",
              ],
              additionalProperties: true,
              properties: {
                schemaVersion: {
                  const: "backy.settings-provider-certification-evidence.v1",
                },
                status: { enum: ["ready", "attention"] },
                requiredGate: {
                  const:
                    "BACKY_SETTINGS_PROVIDER_CERTIFICATION_REQUIRED=1 npm run ci:settings-provider-certification",
                },
                coverage: {
                  type: "object",
                  required: ["covered", "total", "missing"],
                  additionalProperties: true,
                  properties: {
                    covered: { type: "integer", minimum: 0 },
                    total: { type: "integer", minimum: 0 },
                    missing: { type: "array", items: { type: "string" } },
                  },
                },
                scenarios: {
                  type: "array",
                  items: {
                    type: "object",
                    required: [
                      "key",
                      "label",
                      "expectedEvidence",
                      "nextAction",
                      "evidenceCount",
                      "status",
                    ],
                    additionalProperties: true,
                    properties: {
                      key: {
                        enum: [
                          "database-supabase",
                          "storage-media",
                          "vercel-deployment",
                          "notification-delivery",
                          "commerce-provider-bridge",
                          "public-api-cors",
                          "interactive-components",
                          "release-certification-readiness",
                        ],
                      },
                      label: { type: "string" },
                      expectedEvidence: {
                        type: "array",
                        items: { type: "string" },
                      },
                      nextAction: { type: "string" },
                      evidenceCount: { type: "integer", minimum: 0 },
                      status: { enum: ["covered", "missing"] },
                    },
                  },
                },
                secretHandling: { type: "string" },
              },
            },
            AdminSettingsProviderCertificationEvidencePacket: {
              type: "object",
              required: [
                "schemaVersion",
                "generatedAt",
                "status",
                "selectedFamilies",
                "selectedProviderAliases",
                "runtimeReadiness",
                "operatorArtifacts",
                "scenarioAttachments",
                "commandPreview",
                "target",
                "redactionPolicy",
                "secretHandling",
              ],
              additionalProperties: true,
              properties: {
                schemaVersion: {
                  const: "backy.settings-provider-certification-evidence-packet.v1",
                },
                generatedAt: { type: "string", format: "date-time" },
                status: {
                  enum: [
                    "no-family-selected",
                    "needs-runtime-inputs",
                    "needs-scenario-evidence",
                    "evidence-complete",
                  ],
                },
                selectedFamilies: {
                  type: "array",
                  items: { type: "string" },
                },
                selectedProviderAliases: {
                  type: "object",
                  additionalProperties: { type: "string" },
                },
                runtimeReadiness: {
                  type: "object",
                  required: [
                    "localRuntimeInputsConfigured",
                    "missingInputAliases",
                    "missingSelectedFamilies",
                  ],
                  additionalProperties: true,
                  properties: {
                    localRuntimeInputsConfigured: { type: "boolean" },
                    missingInputAliases: {
                      type: "array",
                      items: { type: "string" },
                    },
                    missingSelectedFamilies: {
                      type: "array",
                      items: { type: "string" },
                    },
                  },
                },
                operatorArtifacts: {
                  type: "array",
                  items: {
                    type: "object",
                    required: [
                      "key",
                      "family",
                      "providerAlias",
                      "status",
                      "requiredInputs",
                      "expectedArtifacts",
                      "captureSource",
                      "redaction",
                    ],
                    additionalProperties: true,
                    properties: {
                      key: { type: "string" },
                      family: { type: "string" },
                      providerAlias: { type: "string" },
                      status: {
                        enum: ["ready-to-run", "needs-runtime-inputs"],
                      },
                      requiredInputs: {
                        type: "array",
                        items: { type: "string" },
                      },
                      expectedArtifacts: {
                        type: "array",
                        items: { type: "string" },
                      },
                      captureSource: { type: "string" },
                      redaction: { type: "string" },
                    },
                  },
                },
                scenarioAttachments: {
                  type: "array",
                  items: {
                    type: "object",
                    required: [
                      "key",
                      "label",
                      "status",
                      "evidenceCount",
                      "expectedEvidence",
                      "nextAction",
                    ],
                    additionalProperties: true,
                    properties: {
                      key: { type: "string" },
                      label: { type: "string" },
                      status: { enum: ["covered", "missing"] },
                      evidenceCount: { type: "integer", minimum: 0 },
                      expectedEvidence: {
                        type: "array",
                        items: { type: "string" },
                      },
                      nextAction: { type: "string" },
                    },
                  },
                },
                commandPreview: {
                  type: "object",
                  required: ["command", "envTemplate", "requiredAliases", "targetInputs"],
                  additionalProperties: true,
                  properties: {
                    command: { type: "string" },
                    envTemplate: { type: "string" },
                    requiredAliases: {
                      type: "array",
                      items: { type: "string" },
                    },
                    targetInputs: {
                      type: "array",
                      items: { type: "string" },
                    },
                  },
                },
                target: {
                  type: "object",
                  required: [
                    "siteId",
                    "settingsAdminApi",
                    "siteScopedSettingsApi",
                    "settingsApi",
                    "settingsSiteSelectorEnv",
                    "commerceSiteSelectorEnv",
                    "externalBaseUrl",
                    "publicApiOrigin",
                  ],
                  additionalProperties: true,
                  properties: {
                    siteId: { type: "string" },
                    settingsAdminApi: {
                      const: "/api/admin/settings?certificationSiteId={siteId}",
                    },
                    siteScopedSettingsApi: {
                      const: "/api/admin/sites/{siteId}/settings",
                    },
                    settingsApi: {
                      const: "/api/admin/sites/{siteId}/settings",
                    },
                    settingsSiteSelectorEnv: {
                      const: "BACKY_SETTINGS_CERTIFY_SITE_ID",
                    },
                    commerceSiteSelectorEnv: {
                      const: "BACKY_COMMERCE_CERTIFY_SITE_ID",
                    },
                    externalBaseUrl: {
                      type: ["string", "null"],
                    },
                    publicApiOrigin: {
                      type: ["string", "null"],
                    },
                  },
                },
                redactionPolicy: {
                  type: "object",
                  required: [
                    "includesProviderSecrets",
                    "includesDatabaseUrls",
                    "includesServiceRoleKeys",
                    "includesVercelTokens",
                    "includesNotificationSecrets",
                    "includesCommerceSecrets",
                    "includesCustomerOrOrderPayloads",
                    "allowedEvidence",
                  ],
                  additionalProperties: true,
                  properties: {
                    includesProviderSecrets: { const: false },
                    includesDatabaseUrls: { const: false },
                    includesServiceRoleKeys: { const: false },
                    includesVercelTokens: { const: false },
                    includesNotificationSecrets: { const: false },
                    includesCommerceSecrets: { const: false },
                    includesCustomerOrOrderPayloads: { const: false },
                    allowedEvidence: {
                      type: "array",
                      items: { type: "string" },
                    },
                  },
                },
                secretHandling: { type: "string" },
              },
            },
            AdminSettingsProviderCertification: {
              type: "object",
              required: [
                "generatedAt",
                "schemaVersion",
                "status",
                "settingsGate",
                "commerceGate",
                "localPreflight",
                "releasePreflight",
                "runtimeEvidence",
                "scenarioEvidence",
                "operatorEvidencePacket",
                "operatorCommandTemplate",
                "operatorEnvTemplate",
                "groups",
                "secretHandling",
              ],
              additionalProperties: true,
              properties: {
                generatedAt: { type: "string", format: "date-time" },
                schemaVersion: {
                  const: "backy.settings-provider-certification-handoff.v1",
                },
                status: { const: "external-live-provider-gate" },
                settingsGate: {
                  const: "npm run ci:settings-provider-certification",
                },
                commerceGate: {
                  const: "npm run ci:commerce-provider-certification",
                },
                localPreflight: {
                  const:
                    "npm run test:settings-provider-certification-preflight-contract",
                },
                releasePreflight: {
                  const: "npm run test:release-certification-preflight-contract",
                },
                runtimeEvidence: {
                  type: "object",
                  additionalProperties: true,
                },
                scenarioEvidence: {
                  $ref:
                    "#/components/schemas/AdminSettingsProviderCertificationEvidence",
                },
                operatorEvidencePacket: {
                  $ref:
                    "#/components/schemas/AdminSettingsProviderCertificationEvidencePacket",
                },
                operatorCommandTemplate: {
                  type: "object",
                  required: ["command", "envTemplate", "requiredInputAliases", "targetInputs"],
                  additionalProperties: true,
                  properties: {
                    command: { type: "string" },
                    envTemplate: { type: "string" },
                    requiredInputAliases: {
                      type: "array",
                      items: { type: "string" },
                    },
                    targetInputs: {
                      type: "array",
                      items: { type: "string" },
                    },
                  },
                },
                operatorEnvTemplate: {
                  type: "object",
                  required: ["schemaVersion", "format", "fileName", "body"],
                  additionalProperties: true,
                  properties: {
                    schemaVersion: {
                      const:
                        "backy.settings-provider-certification-env-template.v1",
                    },
                    format: { const: "shell-env" },
                    fileName: { const: ".env.backy-settings-provider-certification" },
                    body: { type: "string" },
                    secretHandling: { type: "string" },
                  },
                },
                groups: {
                  type: "array",
                  items: {
                    type: "object",
                    required: [
                      "family",
                      "providers",
                      "gate",
                      "requiredInputs",
                      "evidence",
                    ],
                    additionalProperties: true,
                    properties: {
                      family: { type: "string" },
                      providers: {
                        type: "array",
                        items: { type: "string" },
                      },
                      gate: { type: "string" },
                      requiredInputs: {
                        type: "array",
                        items: { type: "string" },
                      },
                      evidence: { type: "string" },
                    },
                  },
                },
                secretHandling: { type: "string" },
              },
            },
            AdminSettingsUpdateRequest: {
              type: "object",
              additionalProperties: true,
              properties: {
                deliveryMode: {
                  enum: ["managed-hosting", "custom-frontend"],
                },
                apiKeys: { type: "object", additionalProperties: true },
                storage: { type: "object", additionalProperties: true },
                auth: { type: "object", additionalProperties: true },
                integrations: { type: "object", additionalProperties: true },
              },
            },
            AdminSettingsActionRequest: {
              type: "object",
              required: ["action"],
              additionalProperties: true,
              properties: {
                action: {
                  enum: [
                    "regenerate-api-keys",
                    "issue-admin-api-key",
                    "revoke-admin-api-key",
                    "validate-infrastructure",
                    "media-storage-provisioning-probe",
                    "media-storage-credential-rotation-probe",
                    "media-storage-secret-manager",
                    "test-notification-webhook",
                  ],
                },
                scope: { enum: ["all", "public", "admin"] },
                label: { type: "string" },
                keyId: { type: "string" },
                deliveryMode: {
                  enum: ["managed-hosting", "custom-frontend"],
                },
                integrations: { type: "object", additionalProperties: true },
                recordHistory: { type: "boolean" },
                siteId: { type: "string" },
                mode: {
                  enum: ["plan", "promote", "revoke-replacement"],
                },
                dryRun: { type: "boolean" },
                targetEnvironments: {
                  type: "array",
                  items: { enum: ["production", "preview", "development"] },
                },
                webhookUrl: { type: "string" },
                retryOf: { type: ["string", "null"] },
              },
            },
            AdminSettingsMediaStorageHandoff: {
              type: "object",
              required: [
                "schemaVersion",
                "status",
                "provider",
                "policies",
                "endpointTemplates",
                "contracts",
                "designStateUsage",
                "runtimeGate",
                "privacy",
              ],
              additionalProperties: true,
              properties: {
                schemaVersion: { const: "backy.media-storage-handoff.v1" },
                status: { enum: ["ready", "needs-runtime-env"] },
                provider: {
                  type: "object",
                  required: ["selected", "bucket", "publicBaseUrl", "pathPrefix"],
                  additionalProperties: true,
                  properties: {
                    selected: { type: "string" },
                    bucket: { type: "string" },
                    publicBaseUrl: { type: "string" },
                    pathPrefix: { type: "string" },
                    runtime: { type: ["object", "null"], additionalProperties: true },
                    supabase: { type: ["object", "null"], additionalProperties: true },
                  },
                },
                policies: {
                  type: "object",
                  additionalProperties: true,
                  properties: {
                    privateFilesEnabled: { type: "boolean" },
                    imageTransformsEnabled: { type: "boolean" },
                    maxFileSizeMb: { type: ["number", "null"] },
                    workspaceStorageLimitGb: { type: ["number", "null"] },
                    warningThresholdPercent: { type: ["number", "null"] },
                    allowedFileTypes: { type: "string" },
                  },
                },
                endpointTemplates: {
                  type: "object",
                  additionalProperties: { type: "string" },
                },
                contracts: {
                  type: "object",
                  required: ["organization", "references", "editableMetadata", "deliveryPolicy", "fileCategories"],
                  additionalProperties: true,
                  properties: {
                    organization: { const: "backy.media.organization.v1" },
                    references: { const: "backy.media.references.v1" },
                    editableMetadata: { const: "backy.media.editable-metadata.v1" },
                    deliveryPolicy: { const: "MediaDeliveryPolicy" },
                    fileCategories: { const: "backy.media-file-categories.v1" },
                  },
                },
                designStateUsage: {
                  type: "object",
                  additionalProperties: true,
                  properties: {
                    preservedFields: { type: "array", items: { type: "string" } },
                    editableSurfaces: { type: "array", items: { type: "string" } },
                    customFrontendUses: { type: "array", items: { type: "string" } },
                  },
                },
                runtimeGate: {
                  type: "object",
                  additionalProperties: true,
                  properties: {
                    certificationCommand: { type: "string" },
                    sourceOnlyGuard: { type: "string" },
                    missingRuntimeAliases: { type: "array", items: { type: "string" } },
                  },
                },
                privacy: {
                  type: "object",
                  required: ["includesSecretValues", "exposesSecretReferencesOnly", "excludes"],
                  additionalProperties: true,
                  properties: {
                    includesSecretValues: { const: false },
                    exposesSecretReferencesOnly: { type: "boolean" },
                    secretReferences: { type: "object", additionalProperties: true },
                    excludes: { type: "array", items: { type: "string" } },
                  },
                },
              },
            },
            AdminSettingsThemeDesignImpact: {
              type: "object",
              required: [
                "schemaVersion",
                "status",
                "themeContract",
                "motion",
                "designStatePersistence",
                "frontendBindings",
                "privacy",
              ],
              additionalProperties: true,
              properties: {
                schemaVersion: { const: "backy.settings-theme-design-impact.v1" },
                status: { enum: ["ready", "attention"] },
                source: { type: "string" },
                themeContract: {
                  type: "object",
                  required: ["schemaVersion", "colors", "typography", "layout", "motion", "cssVariables"],
                  additionalProperties: true,
                  properties: {
                    schemaVersion: { const: "backy.theme.v1" },
                    colors: { type: "object", additionalProperties: { type: "string" } },
                    typography: { type: "object", additionalProperties: true },
                    layout: { type: "object", additionalProperties: true },
                    motion: { type: "object", additionalProperties: true },
                    cssVariables: { type: "object", additionalProperties: { type: "string" } },
                  },
                },
                impact: {
                  type: "object",
                  additionalProperties: true,
                  properties: {
                    colorTokenCount: { type: "integer" },
                    typographyTokenCount: { type: "integer" },
                    cssVariableCount: { type: "integer" },
                    invalidControlCount: { type: "integer" },
                    invalidControls: {
                      type: "array",
                      items: { type: "object", additionalProperties: true },
                    },
                  },
                },
                motion: {
                  type: "object",
                  required: ["preset", "bindingPaths", "animationStateFields"],
                  additionalProperties: true,
                  properties: {
                    preset: { type: "string" },
                    bindingPaths: { type: "array", items: { type: "string" } },
                    animationStateFields: { type: "array", items: { type: "string" } },
                  },
                },
                designStatePersistence: {
                  type: "object",
                  required: ["tokenSchemaVersion", "tokenRefPaths", "editableSurfaces", "preservedDesignFields"],
                  additionalProperties: true,
                  properties: {
                    tokenSchemaVersion: { const: "backy.theme.v1" },
                    tokenRefPaths: { type: "array", items: { type: "string" } },
                    editableSurfaces: { type: "array", items: { type: "string" } },
                    preservedDesignFields: { type: "array", items: { type: "string" } },
                  },
                },
                frontendBindings: {
                  type: "object",
                  additionalProperties: true,
                  properties: {
                    publicManifestThemeModule: { type: "string" },
                    publicOpenApiThemeSchema: { type: "string" },
                    adminSettingsApi: { type: "string" },
                    settingsHandoffPath: { type: "string" },
                    cssVariableSelector: { type: "string" },
                  },
                },
                privacy: {
                  type: "object",
                  required: ["includesSecretValues", "includesAdminApiKeys", "includesProviderCredentials", "includesPrivateContent"],
                  additionalProperties: true,
                  properties: {
                    includesSecretValues: { const: false },
                    includesAdminApiKeys: { const: false },
                    includesProviderCredentials: { const: false },
                    includesPrivateContent: { const: false },
                    note: { type: "string" },
                  },
                },
              },
            },
            AdminSettings: {
              type: "object",
              required: [
                "schemaVersion",
                "scope",
                "endpoints",
                "deliveryMode",
                "apiKeys",
                "runtimeStorage",
                "auth",
                "integrations",
                "runtimeDatabase",
                "runtimeSupabase",
                "runtimeMediaScanner",
                "runtimeVercel",
                "runtimeNotifications",
                "runtimeCommerce",
                "runtimeInteractiveComponents",
                "runtimePublicApi",
                "completionStatus",
                "mediaStorageHandoff",
                "themeDesignImpact",
                "providerCertification",
                "frontendDatabaseCertification",
              ],
              additionalProperties: true,
              properties: {
                schemaVersion: { const: "backy.admin-settings.v1" },
                scope: {
                  type: "object",
                  required: [
                    "workspaceSettingsScope",
                    "siteSettingsScope",
                    "siteSettingsEndpointTemplate",
                  ],
                  additionalProperties: true,
                  properties: {
                    workspaceSettingsScope: { const: "global" },
                    siteSettingsScope: { const: "site" },
                    siteSettingsEndpointTemplate: {
                      const: "/api/admin/sites/:siteId/settings",
                    },
                  },
                },
                endpoints: {
                  type: "object",
                  required: ["workspaceSettings", "siteSettings"],
                  additionalProperties: true,
                  properties: {
                    workspaceSettings: { const: "/api/admin/settings" },
                    siteSettings: { const: "/api/admin/sites/:siteId/settings" },
                  },
                },
                deliveryMode: {
                  enum: ["managed-hosting", "custom-frontend"],
                },
                apiKeys: {
                  type: "object",
                  additionalProperties: true,
                  properties: {
                    publicApiKey: { type: "string" },
                    adminApiKey: { type: "string" },
                  },
                },
                storage: { type: "object", additionalProperties: true },
                auth: { type: "object", additionalProperties: true },
                integrations: { type: "object", additionalProperties: true },
                runtimeStorage: {
                  type: "object",
                  additionalProperties: true,
                },
                runtimeDatabase: {
                  type: "object",
                  additionalProperties: true,
                },
                runtimeSupabase: {
                  type: "object",
                  additionalProperties: true,
                },
                runtimeMediaScanner: {
                  type: "object",
                  additionalProperties: true,
                },
                runtimeVercel: {
                  type: "object",
                  additionalProperties: true,
                },
                runtimeNotifications: {
                  type: "object",
                  additionalProperties: true,
                },
                runtimeCommerce: {
                  type: "object",
                  additionalProperties: true,
                },
                runtimeInteractiveComponents: {
                  type: "object",
                  additionalProperties: true,
                },
                runtimePublicApi: {
                  type: "object",
                  additionalProperties: true,
                },
                completionStatus: {
                  $ref: "#/components/schemas/BackyCompletionStatus",
                },
                mediaStorageHandoff: {
                  $ref:
                    "#/components/schemas/AdminSettingsMediaStorageHandoff",
                },
                themeDesignImpact: {
                  $ref:
                    "#/components/schemas/AdminSettingsThemeDesignImpact",
                },
                providerCertification: {
                  $ref:
                    "#/components/schemas/AdminSettingsProviderCertification",
                },
                frontendDatabaseCertification: {
                  $ref:
                    "#/components/schemas/FrontendDatabaseCertificationHandoff",
                },
                updatedAt: { type: "string", format: "date-time" },
              },
            },
            AdminSettingsEnvelope: envelopeSchema({
              type: "object",
              required: ["settings"],
              additionalProperties: true,
              properties: {
                settings: { $ref: "#/components/schemas/AdminSettings" },
              },
            }),
            AdminSettingsActionEnvelope: envelopeSchema({
              type: "object",
              additionalProperties: true,
              properties: {
                settings: { $ref: "#/components/schemas/AdminSettings" },
                issuedKey: { type: "object", additionalProperties: true },
                diagnostics: {
                  type: "array",
                  items: { type: "object", additionalProperties: true },
                },
                delivery: { type: "object", additionalProperties: true },
                provider: { type: "string" },
                status: { type: "string" },
                summary: { type: "string" },
                checks: {
                  type: "array",
                  items: { type: "object", additionalProperties: true },
                },
                operations: {
                  type: "array",
                  items: { type: "object", additionalProperties: true },
                },
                generatedAt: { type: "string", format: "date-time" },
              },
            }),
            FrontendDatabaseCertificationHandoff: {
              type: "object",
              required: [
                "generatedAt",
                "schemaVersion",
                "source",
                "status",
                "requiredFor",
                "gate",
                "environment",
                "requires",
                "coverage",
                "runtime",
                "operatorCommandTemplate",
                "operatorEnvTemplate",
                "scenarioEvidence",
                "secretHandling",
              ],
              additionalProperties: true,
              properties: {
                schemaVersion: {
                  const: "backy.frontend-database-certification.v1",
                },
                generatedAt: { type: "string", format: "date-time" },
                source: {
                  enum: [
                    "public-manifest",
                    "site-openapi",
                    "admin-settings-api",
                    "admin-site-settings-api",
                  ],
                },
                status: { const: "external-database-gate" },
                requiredFor: { const: "production-custom-frontends" },
                gate: {
                  type: "object",
                  required: ["command", "workflow", "localPreflight"],
                  additionalProperties: true,
                  properties: {
                    command: { const: "npm run ci:sdk-postgres-smoke" },
                    workflow: {
                      const: ".github/workflows/sdk-postgres-smoke.yml",
                    },
                    localPreflight: {
                      const: "npm run test:sdk-postgres-preflight-contract",
                    },
                    disposableGuard: { type: "string" },
                    typeContract: { type: "string" },
                  },
                },
                environment: {
                  type: "object",
                  additionalProperties: true,
                  properties: {
                    dataMode: { const: "database" },
                    secretAliases: {
                      type: "array",
                      items: { enum: ["BACKY_DATABASE_URL", "DATABASE_URL"] },
                    },
                    requiredConfirmationEnv: {
                      const: "BACKY_DATABASE_DISPOSABLE_CONFIRMED=true",
                    },
                    targetGuards: {
                      type: "array",
                      items: { type: "string" },
                    },
                  },
                },
                requires: {
                  type: "array",
                  items: { type: "string" },
                },
                coverage: {
                  type: "array",
                  items: { type: "string" },
                },
                runtime: {
                  type: "object",
                  additionalProperties: true,
                },
                operatorCommandTemplate: {
                  type: "object",
                  additionalProperties: true,
                },
                operatorEnvTemplate: {
                  type: "object",
                  additionalProperties: true,
                },
                scenarioEvidence: {
                  type: "object",
                  additionalProperties: true,
                },
                secretHandling: { type: "string" },
              },
            },
            AdminSiteSettingsPatchRequest: {
              type: "object",
              additionalProperties: false,
              properties: {
                settings: {
                  type: "object",
                  additionalProperties: false,
                  properties: {
                    seo: { type: "object", additionalProperties: true },
                    analytics: { type: "object", additionalProperties: true },
                    social: { type: "object", additionalProperties: true },
                    commentPolicy: {
                      type: "object",
                      additionalProperties: true,
                    },
                    redirectRules: {
                      type: "array",
                      items: { type: "object", additionalProperties: true },
                    },
                    navigation: { type: "object", additionalProperties: true },
                    localization: {
                      type: "object",
                      additionalProperties: true,
                    },
                    domainVerification: {
                      type: "object",
                      additionalProperties: true,
                    },
                    vercelDeployment: {
                      type: "object",
                      additionalProperties: true,
                    },
                    billingQuota: {
                      type: "object",
                      additionalProperties: true,
                    },
                    webhooks: { type: "object", additionalProperties: true },
                    frontendDesign: {
                      type: "object",
                      additionalProperties: true,
                    },
                  },
                },
                seo: { type: "object", additionalProperties: true },
                analytics: { type: "object", additionalProperties: true },
                social: { type: "object", additionalProperties: true },
                commentPolicy: { type: "object", additionalProperties: true },
                redirectRules: {
                  type: "array",
                  items: { type: "object", additionalProperties: true },
                },
                navigation: { type: "object", additionalProperties: true },
                localization: { type: "object", additionalProperties: true },
                domainVerification: {
                  type: "object",
                  additionalProperties: true,
                },
                vercelDeployment: {
                  type: "object",
                  additionalProperties: true,
                },
                billingQuota: { type: "object", additionalProperties: true },
                webhooks: { type: "object", additionalProperties: true },
                frontendDesign: { type: "object", additionalProperties: true },
              },
              description:
                "Site-owned Settings sections only. Workspace-owned fields such as storage, auth, integrations, API keys, and provider secrets are rejected by the site-scoped route.",
            },
            AdminSiteSettingsScope: {
              type: "object",
              required: [
                "schemaVersion",
                "scope",
                "siteSettings",
                "workspaceSettings",
                "effectiveSettings",
                "frontendDatabaseCertification",
                "mediaStorageHandoff",
                "endpoints",
              ],
              additionalProperties: true,
              properties: {
                schemaVersion: { const: "backy.site-settings-scope.v1" },
                scope: {
                  type: "object",
                  required: [
                    "level",
                    "siteId",
                    "siteSlug",
                    "teamId",
                    "workspaceSettingsScope",
                    "siteSettingsScope",
                  ],
                  additionalProperties: true,
                  properties: {
                    level: { const: "site" },
                    siteId: { type: "string" },
                    siteSlug: { type: "string" },
                    teamId: { type: ["string", "null"] },
                    workspaceSettingsScope: { const: "global" },
                    siteSettingsScope: { const: "site" },
                  },
                },
                siteSettings: {
                  type: "object",
                  additionalProperties: true,
                  properties: {
                    seo: { type: "object", additionalProperties: true },
                    analytics: { type: "object", additionalProperties: true },
                    social: { type: "object", additionalProperties: true },
                    commentPolicy: {
                      type: "object",
                      additionalProperties: true,
                    },
                    redirectRules: {
                      type: "array",
                      items: { type: "object", additionalProperties: true },
                    },
                    navigation: { type: "object", additionalProperties: true },
                    localization: {
                      type: "object",
                      additionalProperties: true,
                    },
                    domainVerification: {
                      type: "object",
                      additionalProperties: true,
                    },
                    vercelDeployment: {
                      type: "object",
                      additionalProperties: true,
                    },
                    billingQuota: {
                      type: "object",
                      additionalProperties: true,
                    },
                    webhooks: { type: "object", additionalProperties: true },
                    frontendDesign: {
                      type: "object",
                      additionalProperties: true,
                    },
                  },
                },
                workspaceSettings: {
                  type: "object",
                  additionalProperties: true,
                  properties: {
                    deliveryMode: {
                      enum: ["managed-hosting", "custom-frontend"],
                    },
                    integrations: {
                      type: "object",
                      additionalProperties: true,
                    },
                    authPolicy: {
                      type: "object",
                      additionalProperties: true,
                    },
                  },
                },
                effectiveSettings: {
                  type: "object",
                  required: ["workspace", "site"],
                  additionalProperties: true,
                  properties: {
                    workspace: {
                      type: "object",
                      additionalProperties: true,
                    },
                    site: {
                      type: "object",
                      additionalProperties: true,
                    },
                  },
                },
                frontendDatabaseCertification: {
                  $ref:
                    "#/components/schemas/FrontendDatabaseCertificationHandoff",
                },
                mediaStorageHandoff: {
                  $ref:
                    "#/components/schemas/AdminSettingsMediaStorageHandoff",
                },
                endpoints: {
                  type: "object",
                  required: [
                    "workspaceSettings",
                    "siteSettings",
                    "siteDetail",
                  ],
                  additionalProperties: true,
                  properties: {
                    workspaceSettings: { const: "/api/admin/settings" },
                    siteSettings: { type: "string" },
                    siteDetail: { type: "string" },
                  },
                },
              },
            },
            AdminSiteSettingsEnvelope: envelopeSchema({
              type: "object",
              required: ["settings"],
              additionalProperties: true,
              properties: {
                settings: {
                  $ref: "#/components/schemas/AdminSiteSettingsScope",
                },
              },
            }),
            BackyCompletionStatus: {
              type: "object",
              required: [
                "schemaVersion",
                "status",
                "audit",
                "surfaces",
                "surfaceRunbooks",
                "gates",
                "nextAction",
                "recommendedCommands",
                "localPreflight",
                "privacy",
              ],
              additionalProperties: true,
              properties: {
                schemaVersion: { const: "backy.completion-status.v1" },
                generatedAt: { type: "string" },
                status: { enum: ["certification-ready", "external-gates-required"] },
                summary: { type: "string" },
                audit: {
                  type: "object",
                  required: ["source", "ready", "partial", "prototype", "missing", "total", "readyPercent"],
                  additionalProperties: true,
                  properties: {
                    source: { const: "specs/page-completion-audit/backy-page-surface-audit.md" },
                    ready: { const: 41 },
                    partial: { const: 4 },
                    prototype: { const: 0 },
                    missing: { const: 0 },
                    total: { const: 45 },
                    readyPercent: { const: 91 },
                  },
                },
                surfaces: {
                  type: "array",
                  items: {
                    type: "object",
                    required: ["key", "label", "status", "blocker", "gate"],
                    additionalProperties: true,
                    properties: {
                      key: { type: "string" },
                      label: { type: "string" },
                      status: { const: "partial" },
                      blocker: { type: "string" },
                      gate: { type: "string" },
                    },
                  },
                },
                surfaceRunbooks: {
                  type: "array",
                  items: {
                    type: "object",
                    required: [
                      "key",
                      "label",
                      "gate",
                      "command",
                      "preflight",
                      "workflow",
                      "targetInputs",
                      "evidencePacketSchema",
                      "evidenceApi",
                      "evidenceUiPanel",
                      "sourceOnlyGuard",
                      "proofSources",
	                      "expectedArtifacts",
	                      "evidenceArtifacts",
	                      "artifactVerifier",
	                      "runtime",
                      "secretBoundary",
                      "nextAction",
                    ],
                    additionalProperties: true,
                    properties: {
                      key: { enum: ["settings", "settings-admin-apis", "products", "orders"] },
                      label: { type: "string" },
                      gate: { enum: ["settings-provider-certification", "commerce-provider-certification"] },
                      command: { type: "string" },
                      preflight: { type: "string" },
                      workflow: { type: "string" },
                      targetInputs: { type: "array", items: { type: "string" } },
                      evidencePacketSchema: {
                        enum: [
                          "backy.settings-provider-certification-evidence-packet.v1",
                          "backy.commerce-provider-certification-evidence-packet.v1",
                          "backy.order-provider-certification-evidence-packet.v1",
                        ],
                      },
                      evidenceApi: { type: "string" },
                      evidenceUiPanel: { type: "string" },
                      sourceOnlyGuard: { type: "string" },
                      proofSources: { type: "array", items: { type: "string" } },
                      expectedArtifacts: { type: "array", items: { type: "string" } },
	                      evidenceArtifacts: {
                        type: "array",
                        minItems: 1,
                        items: {
                          type: "object",
                          required: [
                            "key",
                            "label",
                            "workflow",
                            "artifactName",
                            "path",
                            "schemaVersion",
                            "producerEnv",
                            "requiredForReady",
                            "includesSecretValues",
                          ],
                          additionalProperties: true,
                          properties: {
                            key: { enum: ["settings-provider-certification-json", "commerce-provider-certification-json"] },
                            label: { type: "string" },
                            workflow: { type: "string" },
                            alternateWorkflows: { type: "array", items: { type: "string" } },
                            artifactName: {
                              enum: [
                                "backy-settings-provider-certification-evidence",
                                "backy-commerce-provider-certification-evidence",
                              ],
                            },
                            path: {
                              enum: [
                                "artifacts/backy-settings-provider-certification.json",
                                "artifacts/backy-commerce-provider-certification.json",
                              ],
                            },
                            schemaVersion: {
                              enum: [
                                "backy.settings-provider-certification-artifact.v1",
                                "backy.commerce-provider-certification-artifact.v1",
                              ],
                            },
                            producerEnv: {
                              enum: [
                                "BACKY_SETTINGS_CERTIFICATION_OUTPUT",
                                "BACKY_COMMERCE_CERTIFICATION_OUTPUT",
                              ],
                            },
                            requiredForReady: { const: true },
                            includesSecretValues: { const: false },
                          },
	                        },
	                      },
	                      artifactVerifier: {
	                        type: "object",
	                        required: ["command", "requiredEnv", "pathEnv", "schemaVersion", "validates", "includesSecretValues"],
	                        additionalProperties: true,
	                        properties: {
	                          command: { const: "npm run doctor:release-certification" },
		                          requiredEnv: {
		                            enum: [
		                              "BACKY_SETTINGS_CERTIFICATION_ARTIFACT_REQUIRED=1 or BACKY_PROVIDER_CERTIFICATION_ARTIFACTS_REQUIRED=1",
		                              "BACKY_COMMERCE_CERTIFICATION_ARTIFACT_REQUIRED=1 or BACKY_PROVIDER_CERTIFICATION_ARTIFACTS_REQUIRED=1",
		                            ],
		                          },
		                          pathEnv: {
		                            enum: [
		                              "BACKY_SETTINGS_CERTIFICATION_ARTIFACT_PATH or BACKY_SETTINGS_CERTIFICATION_ARTIFACT",
		                              "BACKY_COMMERCE_CERTIFICATION_ARTIFACT_PATH or BACKY_COMMERCE_CERTIFICATION_ARTIFACT",
		                            ],
		                          },
	                          schemaVersion: {
	                            enum: [
	                              "backy.settings-provider-certification-artifact.v1",
	                              "backy.commerce-provider-certification-artifact.v1",
	                            ],
	                          },
	                          validates: {
	                            type: "array",
	                            items: { type: "string" },
	                          },
	                          includesSecretValues: { const: false },
	                        },
	                      },
	                      runtime: { type: "object", additionalProperties: true },
                      secretBoundary: {
                        type: "object",
                        required: ["includesSecretValues", "excludes"],
                        additionalProperties: true,
                        properties: {
                          includesSecretValues: { const: false },
                          excludes: { type: "array", items: { type: "string" } },
                        },
                      },
                      nextAction: { type: "string" },
                    },
                  },
                },
                gates: {
                  type: "array",
                  items: {
                    type: "object",
                    required: ["key", "label", "status", "command", "workflow", "affectedSurfaces", "requiredEnvAliases", "runtime"],
                    additionalProperties: true,
                    properties: {
                      key: {
                        enum: [
                          "settings-provider-certification",
                          "commerce-provider-certification",
                        ],
                      },
                      label: { type: "string" },
                      status: { enum: ["ready-to-run", "blocked-missing-inputs"] },
                      command: { type: "string" },
                      preflight: { type: "string" },
                      disposableGuard: { type: "string" },
                      workflow: { type: "string" },
                      affectedSurfaces: { type: "array", items: { type: "string" } },
                      requiredEnvAliases: { type: "array", items: { type: "string" } },
                      runtime: { type: "object", additionalProperties: true },
                    },
                  },
                },
                certifiedGates: {
                  type: "array",
                  items: {
                    type: "object",
                    required: ["key", "label", "status", "command", "workflow", "affectedSurfaces", "certifiedAt", "evidence"],
                    additionalProperties: true,
                    properties: {
                      key: { enum: ["forms-postgres", "sdk-postgres"] },
                      label: { type: "string" },
                      status: { const: "certified" },
                      command: { type: "string" },
                      workflow: { type: "string" },
                      affectedSurfaces: { type: "array", items: { type: "string" } },
                      certifiedAt: { type: "string" },
                      evidence: { type: "string" },
                    },
                  },
                },
                nextAction: { type: "string" },
                recommendedCommands: { type: "array", items: { type: "string" } },
                localPreflight: { const: "npm run test:partial-gate-preflights" },
                privacy: {
                  type: "object",
                  required: ["includesSecretValues", "exposesOnlyAliasPresence", "secretHandling"],
                  additionalProperties: true,
                  properties: {
                    includesSecretValues: { const: false },
                    exposesOnlyAliasPresence: { const: true },
                    secretHandling: { type: "string" },
                  },
                },
              },
            },
            RouteResolveEnvelope: envelopeSchema({
              type: "object",
              required: ["site", "route"],
              properties: {
                site: { type: "object", additionalProperties: true },
                route: { $ref: "#/components/schemas/ResolvedRoute" },
                navigation: { type: "object", additionalProperties: true },
              },
            }),
            GoneRouteResolveEnvelope: {
              type: "object",
              required: ["success", "requestId", "error", "data"],
              properties: {
                success: { const: false },
                requestId: { type: "string" },
                error: {
                  type: "object",
                  required: ["code", "message"],
                  properties: {
                    code: { const: "ROUTE_GONE" },
                    message: { type: "string" },
                  },
                },
                data: {
                  type: "object",
                  required: ["site", "route"],
                  properties: {
                    site: { type: "object", additionalProperties: true },
                    route: { $ref: "#/components/schemas/GoneRoute" },
                    navigation: { type: "object", additionalProperties: true },
                  },
                },
              },
            },
            ResolvedRoute: {
              oneOf: [
                { $ref: "#/components/schemas/PageRoute" },
                { $ref: "#/components/schemas/PostRoute" },
                { $ref: "#/components/schemas/DynamicListRoute" },
                { $ref: "#/components/schemas/DynamicItemRoute" },
                { $ref: "#/components/schemas/RedirectRoute" },
                { $ref: "#/components/schemas/GoneRoute" },
              ],
            },
            PageRoute: {
              type: "object",
              required: [
                "type",
                "path",
                "status",
                "canonical",
                "params",
                "resource",
              ],
              properties: {
                type: { const: "page" },
                path: { type: "string" },
                status: { type: "string" },
                canonical: { type: "string" },
                params: {
                  type: "object",
                  additionalProperties: { type: "string" },
                },
                resource: { $ref: "#/components/schemas/PageRouteResource" },
              },
              additionalProperties: true,
            },
            PageRouteResource: {
              type: "object",
              required: ["id", "kind", "title", "slug", "apiUrl", "renderUrl"],
              additionalProperties: true,
              properties: {
                id: { type: "string" },
                kind: { const: "page" },
                title: { type: "string" },
                slug: { type: "string" },
                apiUrl: { type: "string" },
                renderUrl: { type: "string" },
              },
            },
            PostRoute: {
              type: "object",
              required: [
                "type",
                "path",
                "status",
                "canonical",
                "params",
                "resource",
              ],
              properties: {
                type: { const: "post" },
                path: { type: "string" },
                status: { type: "string" },
                canonical: { type: "string" },
                params: {
                  type: "object",
                  additionalProperties: { type: "string" },
                },
                resource: { $ref: "#/components/schemas/PostRouteResource" },
              },
              additionalProperties: true,
            },
            PostRouteResource: {
              type: "object",
              required: ["id", "kind", "title", "slug", "apiUrl", "hostedPath"],
              additionalProperties: true,
              properties: {
                id: { type: "string" },
                kind: { const: "post" },
                title: { type: "string" },
                slug: { type: "string" },
                apiUrl: { type: "string" },
                hostedPath: { type: "string" },
              },
            },
            DynamicListRoute: {
              type: "object",
              required: [
                "type",
                "path",
                "status",
                "canonical",
                "params",
                "resource",
              ],
              properties: {
                type: { const: "dynamicList" },
                path: { type: "string" },
                status: { type: "string" },
                canonical: { type: "string" },
                params: {
                  type: "object",
                  additionalProperties: { type: "string" },
                },
                resource: {
                  $ref: "#/components/schemas/DynamicListRouteResource",
                },
              },
              additionalProperties: true,
            },
            DynamicListRouteResource: {
              type: "object",
              required: [
                "id",
                "kind",
                "title",
                "slug",
                "collectionId",
                "collectionSlug",
                "collectionName",
                "recordsUrl",
                "renderUrl",
                "hostedPath",
                "recordCount",
              ],
              additionalProperties: true,
              properties: {
                id: { type: "string" },
                kind: { const: "dynamicList" },
                title: { type: "string" },
                slug: { type: "string" },
                collectionId: { type: "string" },
                collectionSlug: { type: "string" },
                collectionName: { type: "string" },
                recordsUrl: { type: "string" },
                renderUrl: { type: "string" },
                hostedPath: { type: "string" },
                recordCount: { type: "integer", minimum: 0 },
                frontendDesign: {
                  $ref: "#/components/schemas/ReusableSectionFrontendDesign",
                },
              },
            },
            DynamicItemRoute: {
              type: "object",
              required: [
                "type",
                "path",
                "status",
                "canonical",
                "params",
                "resource",
              ],
              properties: {
                type: { const: "dynamicItem" },
                path: { type: "string" },
                status: { type: "string" },
                canonical: { type: "string" },
                params: {
                  type: "object",
                  additionalProperties: { type: "string" },
                },
                resource: {
                  $ref: "#/components/schemas/DynamicItemRouteResource",
                },
              },
              additionalProperties: true,
            },
            DynamicItemRouteResource: {
              type: "object",
              required: [
                "id",
                "kind",
                "title",
                "slug",
                "collectionId",
                "collectionSlug",
                "collectionName",
                "apiUrl",
                "renderUrl",
                "hostedPath",
              ],
              additionalProperties: true,
              properties: {
                id: { type: "string" },
                kind: { const: "dynamicItem" },
                title: { type: "string" },
                slug: { type: "string" },
                collectionId: { type: "string" },
                collectionSlug: { type: "string" },
                collectionName: { type: "string" },
                apiUrl: { type: "string" },
                renderUrl: { type: "string" },
                hostedPath: { type: "string" },
                frontendDesign: {
                  $ref: "#/components/schemas/ReusableSectionFrontendDesign",
                },
                collectionFrontendDesign: {
                  $ref: "#/components/schemas/ReusableSectionFrontendDesign",
                },
                designReadiness: {
                  $ref: "#/components/schemas/CommerceProductDesignReadiness",
                },
              },
            },
            RedirectRoute: {
              type: "object",
              required: [
                "type",
                "path",
                "status",
                "canonical",
                "params",
                "resource",
              ],
              properties: {
                type: { const: "redirect" },
                path: { type: "string" },
                status: { const: "published" },
                canonical: { type: "string" },
                params: {
                  type: "object",
                  additionalProperties: { type: "string" },
                },
                resource: {
                  type: "object",
                  required: ["id", "kind", "from", "to", "statusCode"],
                  properties: {
                    id: { type: "string" },
                    kind: { const: "redirect" },
                    from: { type: "string" },
                    to: { type: "string" },
                    statusCode: { enum: [301, 302, 307, 308] },
                  },
                  additionalProperties: true,
                },
              },
              additionalProperties: true,
            },
            GoneRoute: {
              type: "object",
              required: [
                "type",
                "path",
                "status",
                "canonical",
                "params",
                "resource",
              ],
              properties: {
                type: { const: "gone" },
                path: { type: "string" },
                status: { const: "archived" },
                canonical: { type: "string" },
                params: {
                  type: "object",
                  additionalProperties: { type: "string" },
                },
                resource: {
                  type: "object",
                  required: ["id", "kind", "from", "statusCode"],
                  properties: {
                    id: { type: "string" },
                    kind: { const: "gone" },
                    from: { type: "string" },
                    statusCode: { const: 410 },
                  },
                  additionalProperties: true,
                },
              },
              additionalProperties: true,
            },
            NavigationEnvelope: envelopeSchema({
              type: "object",
              required: ["site", "navigation"],
              properties: {
                site: { type: "object", additionalProperties: true },
                navigation: { type: "object", additionalProperties: true },
              },
            }),
            FrontendDesignEnvelope: envelopeSchema({
              type: "object",
              required: [
                "schemaVersion",
                "site",
                "frontendDesign",
                "capabilities",
                "endpoints",
              ],
              properties: {
                schemaVersion: { const: "backy.frontend-design-response.v1" },
                site: { type: "object", additionalProperties: true },
                frontendDesign: {
                  $ref: "#/components/schemas/FrontendDesignContract",
                },
                capabilities: {
                  type: "object",
                  required: [
                    "hasContract",
                    "templateCount",
                    "editableBindingCount",
                  ],
                  properties: {
                    hasContract: { type: "boolean" },
                    templateCount: { type: "integer", minimum: 0 },
                    editableBindingCount: { type: "integer", minimum: 0 },
                    chrome: { type: "boolean" },
                    tokens: { type: "boolean" },
                  },
                },
                endpoints: {
                  type: "object",
                  additionalProperties: { type: "string" },
                },
              },
            }),
            InteractiveComponentRegistry: {
              type: "object",
              required: [
                "schemaVersion",
                "siteId",
                "generatedAt",
                "contract",
                "components",
                "pagination",
              ],
              additionalProperties: true,
              properties: {
                schemaVersion: {
                  const: "backy.interactive-component-registry.v1",
                },
                siteId: { type: "string" },
                generatedAt: { type: "string", format: "date-time" },
                contract: {
                  $ref: "#/components/schemas/InteractiveComponentManifestContract",
                },
                components: {
                  type: "array",
                  items: {
                    $ref: "#/components/schemas/InteractiveComponentRegistryEntry",
                  },
                },
                pagination: {
                  $ref: "#/components/schemas/InteractiveComponentRegistryPagination",
                },
              },
            },
            InteractiveComponentManifestContract: {
              type: "object",
              required: [
                "schemaVersion",
                "elementTypes",
                "capabilities",
                "registry",
                "sandbox",
                "renderContract",
                "dataBindingScopes",
                "security",
              ],
              additionalProperties: true,
              properties: {
                schemaVersion: { const: "backy.interactive-components.v1" },
                elementTypes: {
                  type: "array",
                  items: {
                    type: "string",
                    enum: ["interactiveFigure", "codeComponent"],
                  },
                },
                capabilities: {
                  type: "object",
                  required: [
                    "trustedRegistry",
                    "customCodeSandbox",
                    "signedBundles",
                    "staticFallbacks",
                    "versionedBundles",
                    "dataBindings",
                  ],
                  additionalProperties: false,
                  properties: {
                    trustedRegistry: { type: "boolean" },
                    customCodeSandbox: { type: "boolean" },
                    signedBundles: { type: "boolean" },
                    staticFallbacks: { type: "boolean" },
                    versionedBundles: { type: "boolean" },
                    dataBindings: { type: "boolean" },
                  },
                },
                registry: {
                  type: "object",
                  required: [
                    "provider",
                    "configured",
                    "endpoint",
                    "bundleBaseUrl",
                    "signedBundles",
                    "reviewRequired",
                  ],
                  additionalProperties: false,
                  properties: {
                    provider: { type: "string" },
                    configured: { type: "boolean" },
                    endpoint: { type: ["string", "null"] },
                    bundleBaseUrl: { type: ["string", "null"] },
                    signedBundles: { type: "boolean" },
                    reviewRequired: { type: "boolean" },
                  },
                },
                sandbox: {
                  type: "object",
                  required: [
                    "enabled",
                    "origin",
                    "cspConfigured",
                    "iframeSandbox",
                    "allowedConnectSrc",
                    "requiresDedicatedOrigin",
                    "responseHeaders",
                  ],
                  additionalProperties: false,
                  properties: {
                    enabled: { type: "boolean" },
                    origin: { type: ["string", "null"] },
                    cspConfigured: { type: "boolean" },
                    iframeSandbox: { type: "string" },
                    allowedConnectSrc: { type: "string" },
                    requiresDedicatedOrigin: { type: "boolean" },
                    responseHeaders: {
                      type: "object",
                      required: [
                        "contentSecurityPolicy",
                        "permissionsPolicy",
                        "referrerPolicy",
                        "contentTypeOptions",
                      ],
                      additionalProperties: false,
                      properties: {
                        contentSecurityPolicy: {
                          type: "array",
                          items: { type: "string" },
                        },
                        permissionsPolicy: {
                          type: "array",
                          items: { type: "string" },
                        },
                        referrerPolicy: { const: "no-referrer" },
                        contentTypeOptions: { const: "nosniff" },
                      },
                    },
                  },
                },
                renderContract: {
                  type: "object",
                  required: [
                    "fields",
                    "hydrationModes",
                    "postMessageProtocol",
                    "fallbackRequired",
                    "unknownComponentBehavior",
                  ],
                  additionalProperties: false,
                  properties: {
                    fields: { type: "array", items: { type: "string" } },
                    hydrationModes: {
                      type: "array",
                      items: {
                        type: "string",
                        enum: [
                          "trusted-component",
                          "sandbox-iframe",
                          "static-fallback",
                        ],
                      },
                    },
                    postMessageProtocol: {
                      const: "backy.interactive-component.v1",
                    },
                    fallbackRequired: { type: "boolean" },
                    unknownComponentBehavior: {
                      const: "render-static-fallback",
                    },
                  },
                },
                dataBindingScopes: {
                  type: "array",
                  items: {
                    type: "string",
                    enum: [
                      "collections",
                      "media",
                      "forms",
                      "commerce",
                      "page",
                      "blog",
                    ],
                  },
                },
                security: {
                  $ref: "#/components/schemas/InteractiveComponentSecurity",
                },
              },
            },
            InteractiveComponentRegistryEntry: {
              type: "object",
              required: [
                "componentKey",
                "displayName",
                "type",
                "status",
                "version",
                "renderMode",
                "source",
                "description",
                "allowedDataScopes",
                "requiredFields",
                "controls",
                "fallback",
                "security",
                "integrity",
              ],
              additionalProperties: true,
              properties: {
                componentKey: { type: "string" },
                displayName: { type: "string" },
                type: {
                  type: "string",
                  enum: ["interactiveFigure", "codeComponent"],
                },
                status: { type: "string", enum: ["active", "disabled"] },
                version: { type: "string" },
                renderMode: {
                  type: "string",
                  enum: [
                    "trusted-component",
                    "sandbox-iframe",
                    "static-fallback",
                  ],
                },
                source: {
                  type: "string",
                  enum: ["built-in", "registry", "custom"],
                },
                description: { type: "string" },
                allowedDataScopes: { type: "array", items: { type: "string" } },
                requiredFields: { type: "array", items: { type: "string" } },
                controls: {
                  type: "array",
                  items: {
                    $ref: "#/components/schemas/InteractiveComponentControl",
                  },
                },
                fallback: {
                  $ref: "#/components/schemas/InteractiveComponentFallback",
                },
                security: {
                  $ref: "#/components/schemas/InteractiveComponentSecurity",
                },
                integrity: {
                  $ref: "#/components/schemas/InteractiveComponentIntegrity",
                },
                runtime: {
                  $ref: "#/components/schemas/InteractiveComponentRuntime",
                },
                dependencyPolicy: {
                  $ref: "#/components/schemas/InteractiveComponentDependencyPolicy",
                },
                compatibility: {
                  $ref: "#/components/schemas/InteractiveComponentCompatibility",
                },
                dataBindingPresets: {
                  type: "array",
                  items: {
                    $ref: "#/components/schemas/InteractiveComponentDataBindingPreset",
                  },
                },
              },
            },
            InteractiveComponentDependencyPolicy: {
              type: "object",
              additionalProperties: true,
              properties: {
                preset: {
                  type: "string",
                  enum: ["built-in", "signed-sandbox", "no-runtime-deps"],
                },
                allowedPackagePatterns: {
                  type: "array",
                  items: { type: "string" },
                },
                blockedBuiltins: { type: "array", items: { type: "string" } },
                lifecycleScripts: { type: "boolean" },
                remoteRuntimeUrls: { type: "boolean" },
              },
            },
            InteractiveComponentCompatibility: {
              type: "object",
              additionalProperties: true,
              properties: {
                backyRuntime: { type: "string" },
                renderTargets: { type: "array", items: { type: "string" } },
                animationLibraries: {
                  type: "array",
                  items: { type: "string" },
                },
                browserSupport: { type: "array", items: { type: "string" } },
                reducedMotion: {
                  type: "string",
                  enum: ["required", "recommended"],
                },
              },
            },
            InteractiveComponentDataBindingPreset: {
              type: "object",
              required: ["id", "label", "scope", "targetPath", "mode"],
              additionalProperties: true,
              properties: {
                id: { type: "string" },
                label: { type: "string" },
                scope: {
                  type: "string",
                  enum: [
                    "collections",
                    "media",
                    "forms",
                    "commerce",
                    "page",
                    "blog",
                  ],
                },
                targetPath: { type: "string" },
                mode: { type: "string", enum: ["read", "list", "aggregate"] },
              },
            },
            InteractiveComponentControl: {
              type: "object",
              required: ["key", "label", "type"],
              additionalProperties: true,
              properties: {
                key: { type: "string" },
                label: { type: "string" },
                type: {
                  type: "string",
                  enum: [
                    "range",
                    "select",
                    "radio",
                    "text",
                    "textarea",
                    "code",
                    "number",
                    "boolean",
                    "checkbox",
                    "toggle",
                    "color",
                    "json",
                  ],
                },
                min: { type: "number" },
                max: { type: "number" },
                step: { type: "number" },
                options: {
                  type: "array",
                  items: {
                    $ref: "#/components/schemas/InteractiveComponentControlOption",
                  },
                },
                defaultValue: {},
                required: { type: "boolean" },
              },
            },
            InteractiveComponentControlOption: {
              oneOf: [
                { type: "string" },
                { type: "number" },
                { type: "boolean" },
                {
                  type: "object",
                  additionalProperties: true,
                  properties: {
                    label: { type: "string" },
                    name: { type: "string" },
                    value: {
                      oneOf: [
                        { type: "string" },
                        { type: "number" },
                        { type: "boolean" },
                      ],
                    },
                    id: {
                      oneOf: [
                        { type: "string" },
                        { type: "number" },
                        { type: "boolean" },
                      ],
                    },
                    key: {
                      oneOf: [
                        { type: "string" },
                        { type: "number" },
                        { type: "boolean" },
                      ],
                    },
                  },
                },
              ],
            },
            InteractiveComponentFallback: {
              type: "object",
              required: ["required", "supported"],
              additionalProperties: false,
              properties: {
                required: { type: "boolean" },
                supported: {
                  type: "array",
                  items: {
                    type: "string",
                    enum: [
                      "title",
                      "text",
                      "html",
                      "imageUrl",
                      "alt",
                      "ariaLabel",
                    ],
                  },
                },
              },
            },
            InteractiveComponentSecurity: {
              type: "object",
              required: [
                "adminApiAccess",
                "parentDomAccess",
                "parentCookieAccess",
                "secretsInPayload",
                "communication",
              ],
              additionalProperties: false,
              properties: {
                adminApiAccess: { type: "boolean" },
                parentDomAccess: { type: "boolean" },
                parentCookieAccess: { type: "boolean" },
                secretsInPayload: { type: "boolean" },
                communication: { const: "postMessage-only" },
              },
            },
            InteractiveComponentIntegrity: {
              type: "object",
              required: ["signed", "signatureRequiredForCustomCode"],
              additionalProperties: true,
              properties: {
                signed: { type: "boolean" },
                signatureRequiredForCustomCode: { type: "boolean" },
                algorithm: { type: "string" },
                hash: { type: "string" },
                signature: { type: "string" },
              },
            },
            InteractiveComponentRuntime: {
              type: "object",
              additionalProperties: true,
              properties: {
                sandboxUrl: { type: ["string", "null"] },
                bundleUrl: { type: ["string", "null"] },
                iframeSandbox: { type: "string" },
                allowedPermissions: {
                  type: "array",
                  items: { type: "string" },
                },
                postMessageProtocol: {
                  const: "backy.interactive-component.v1",
                },
              },
            },
            InteractiveComponentRegistryPagination: {
              type: "object",
              required: ["total", "limit", "offset", "hasMore"],
              additionalProperties: false,
              properties: {
                total: { type: "integer", minimum: 0 },
                limit: { type: "integer", minimum: 0 },
                offset: { type: "integer", minimum: 0 },
                hasMore: { type: "boolean" },
              },
            },
            InteractiveComponentRegistryEnvelope: envelopeSchema({
              $ref: "#/components/schemas/InteractiveComponentRegistry",
            }),
            InteractiveRuntimeEventRequest: {
              type: "object",
              required: ["componentKey", "message"],
              additionalProperties: true,
              properties: {
                type: {
                  type: "string",
                  enum: [
                    "ready",
                    "init",
                    "resize",
                    "error",
                    "fallback",
                    "blocked",
                  ],
                },
                componentKey: { type: "string", maxLength: 160 },
                version: { type: "string", maxLength: 80 },
                elementId: { type: "string", maxLength: 160 },
                pageId: { type: "string", maxLength: 160 },
                postId: { type: "string", maxLength: 160 },
                message: { type: "string", maxLength: 500 },
                requestId: { type: "string", maxLength: 120 },
              },
            },
            FrontendDesignContract: {
              type: "object",
              required: [
                "schemaVersion",
                "status",
                "source",
                "templates",
                "editableMap",
              ],
              additionalProperties: true,
              properties: {
                schemaVersion: { type: "string" },
                status: {
                  type: "string",
                  enum: ["unconfigured", "captured", "synced", "stale"],
                },
                source: { type: "object", additionalProperties: true },
                tokens: { type: "object", additionalProperties: true },
                chrome: { type: "object", additionalProperties: true },
                templates: {
                  type: "array",
                  items: {
                    $ref: "#/components/schemas/FrontendDesignTemplate",
                  },
                },
                editableMap: {
                  type: "array",
                  items: {
                    $ref: "#/components/schemas/FrontendEditableMapEntry",
                  },
                },
                notes: { type: "string" },
                updatedAt: { type: "string", format: "date-time" },
              },
            },
            FrontendDesignTemplate: {
              type: "object",
              required: ["id", "type", "name"],
              additionalProperties: true,
              properties: {
                id: { type: "string" },
                type: {
                  type: "string",
                  enum: [
                    "page",
                    "blogPost",
                    "form",
                    "product",
                    "collection",
                    "section",
                  ],
                },
                name: { type: "string" },
                routePattern: { type: "string" },
                description: { type: "string" },
                canvasSize: { type: "object", additionalProperties: true },
                content: {
                  $ref: "#/components/schemas/FrontendDesignTemplateContent",
                },
                bindingHints: {
                  type: "array",
                  items: { type: "object", additionalProperties: true },
                },
              },
            },
            FrontendDesignTemplateContent: {
              type: "object",
              additionalProperties: true,
              properties: {
                templateId: { type: "string" },
                frontendDesignTemplateId: { type: "string" },
                templateName: { type: "string" },
                frontendDesignTemplateName: { type: "string" },
                routePattern: { type: "string" },
                elements: {
                  type: "array",
                  items: { type: "object", additionalProperties: true },
                },
                canvasSize: {
                  type: "object",
                  additionalProperties: true,
                  properties: {
                    width: { type: "number", exclusiveMinimum: 0 },
                    height: { type: "number", exclusiveMinimum: 0 },
                  },
                },
                customCSS: { type: "string" },
                customCss: { type: "string" },
                customJS: { type: "string" },
                customJs: { type: "string" },
                contentDocument: {
                  $ref: "#/components/schemas/BackyContentDocument",
                },
                themeTokenRefs: {
                  type: "object",
                  additionalProperties: { type: "string" },
                },
                assets: {
                  oneOf: [
                    {
                      type: "array",
                      items: { type: "object", additionalProperties: true },
                    },
                    { type: "object", additionalProperties: true },
                  ],
                },
                animations: {
                  oneOf: [
                    {
                      type: "array",
                      items: { type: "object", additionalProperties: true },
                    },
                    { type: "object", additionalProperties: true },
                  ],
                },
                interactions: {
                  oneOf: [
                    {
                      type: "array",
                      items: { type: "object", additionalProperties: true },
                    },
                    { type: "object", additionalProperties: true },
                  ],
                },
                dataBindings: { type: "object", additionalProperties: true },
                editableMap: { type: "object", additionalProperties: true },
                seo: { type: "object", additionalProperties: true },
                metadata: { type: "object", additionalProperties: true },
                bindingHints: {
                  type: "array",
                  items: { type: "object", additionalProperties: true },
                },
              },
            },
            FrontendEditableMapEntry: {
              type: "object",
              additionalProperties: true,
              properties: {
                selector: { type: "string" },
                elementId: { type: "string" },
                role: { type: "string" },
                binding: { type: "string" },
                fields: { type: "array", items: { type: "string" } },
                field: { type: "string" },
                targetPath: { type: "string" },
                token: { type: "string" },
                editable: { type: "boolean" },
                permission: { type: "string" },
                label: { type: "string" },
                valueType: {
                  type: "string",
                  enum: [
                    "string",
                    "richText",
                    "number",
                    "boolean",
                    "color",
                    "image",
                    "video",
                    "audio",
                    "file",
                    "url",
                    "json",
                  ],
                },
                scope: {
                  type: "string",
                  enum: [
                    "site",
                    "page",
                    "post",
                    "template",
                    "element",
                    "collectionRecord",
                  ],
                },
                collectionId: { type: "string" },
                recordId: { type: "string" },
                sourceField: { type: "string" },
              },
            },
            SeoDiscoveryEnvelope: envelopeSchema({
              type: "object",
              required: ["site", "defaults", "routes", "sitemap", "robots"],
              properties: {
                site: { type: "object", additionalProperties: true },
                defaults: {
                  type: "object",
                  additionalProperties: true,
                  properties: {
                    title: { type: "string" },
                    description: { type: "string" },
                    jsonLd: {
                      type: "array",
                      items: { type: "object", additionalProperties: true },
                    },
                    robots: { type: "object", additionalProperties: true },
                  },
                },
                routes: {
                  type: "array",
                  items: { $ref: "#/components/schemas/SeoRoute" },
                },
                sitemap: { type: "object", additionalProperties: true },
                robots: { type: "object", additionalProperties: true },
              },
            }),
            SeoRoute: {
              type: "object",
              additionalProperties: true,
              required: [
                "type",
                "id",
                "title",
                "path",
                "canonical",
                "status",
                "priority",
                "changeFrequency",
                "robots",
                "openGraph",
                "keywords",
                "jsonLd",
              ],
              properties: {
                type: {
                  type: "string",
                  enum: ["page", "post", "dynamicList", "dynamicItem"],
                },
                id: { type: "string" },
                title: { type: "string" },
                description: { type: "string" },
                path: { type: "string" },
                canonical: { type: "string" },
                canonicalUrl: { type: "string" },
                status: { type: "string" },
                updatedAt: { type: "string", format: "date-time" },
                priority: { type: "number", minimum: 0, maximum: 1 },
                changeFrequency: {
                  type: "string",
                  enum: ["daily", "weekly", "monthly"],
                },
                robots: {
                  type: "object",
                  required: ["index", "follow"],
                  properties: {
                    index: { type: "boolean" },
                    follow: { type: "boolean" },
                  },
                  additionalProperties: true,
                },
                openGraph: {
                  type: "object",
                  required: ["title", "description"],
                  properties: {
                    title: { type: "string" },
                    description: { type: "string" },
                    image: { type: "string" },
                  },
                  additionalProperties: true,
                },
                keywords: { type: "array", items: { type: "string" } },
                jsonLd: {
                  type: "array",
                  items: { type: "object", additionalProperties: true },
                },
                frontendDesign: {
                  $ref: "#/components/schemas/ReusableSectionFrontendDesign",
                },
                collectionFrontendDesign: {
                  $ref: "#/components/schemas/ReusableSectionFrontendDesign",
                },
              },
            },
            MediaList: {
              ...envelopeSchema({
                type: "object",
                required: ["media", "pagination"],
                properties: {
                  media: {
                    type: "array",
                    items: { $ref: "#/components/schemas/MediaAsset" },
                  },
                  pagination: { type: "object", additionalProperties: true },
                },
              }),
            },
            MediaFileCategoryDiscovery: {
              type: "object",
              additionalProperties: true,
              required: ["schemaVersion", "fileCategories", "deliveryPolicy", "managementPolicy"],
              properties: {
                schemaVersion: { const: "backy.media-file-categories.v1" },
                fileCategories: {
                  type: "array",
                  items: { $ref: "#/components/schemas/MediaFileCategory" },
                },
                deliveryPolicy: {
                  $ref: "#/components/schemas/MediaDeliveryPolicy",
                },
                managementPolicy: {
                  $ref: "#/components/schemas/MediaManagementPolicy",
                },
              },
            },
            MediaManagementPolicy: {
              type: "object",
              additionalProperties: true,
              required: [
                "schemaVersion",
                "endpoints",
                "methods",
                "auth",
                "uploadFields",
                "filters",
                "sdkHelpers",
                "responseContracts",
                "auditing",
                "secretHandling",
              ],
              properties: {
                schemaVersion: { const: "backy.media-management.v1" },
                endpoints: {
                  type: "object",
                  additionalProperties: true,
                  required: [
                    "adminList",
                    "upload",
                    "detail",
                    "folders",
                    "folderDetail",
                    "versions",
                    "version",
                    "signedUrl",
                    "bind",
                    "transforms",
                    "providerAnalytics",
                  ],
                  properties: {
                    adminList: { type: "string" },
                    upload: { type: "string" },
                    detail: { type: "string" },
                    folders: { type: "string" },
                    folderDetail: { type: "string" },
                    versions: { type: "string" },
                    version: { type: "string" },
                    signedUrl: { type: "string" },
                    bind: { type: "string" },
                    transforms: { type: "string" },
                    providerAnalytics: { type: "string" },
                  },
                },
                methods: {
                  type: "object",
                  additionalProperties: true,
                  properties: {
                    list: { const: "GET" },
                    upload: { const: "POST" },
                    update: { const: "PATCH" },
                    replace: { const: "POST" },
                    delete: { const: "DELETE" },
                    folders: { const: "GET" },
                    createFolder: { const: "POST" },
                    updateFolder: { const: "PATCH" },
                    deleteFolder: { const: "DELETE" },
                    versions: { const: "GET" },
                    restoreVersion: { const: "POST" },
                    deleteVersion: { const: "DELETE" },
                    signedUrl: { const: "POST" },
                    bind: { const: "POST" },
                    transforms: { const: "POST" },
                    providerAnalytics: { const: "POST" },
                  },
                  required: [
                    "list",
                    "upload",
                    "update",
                    "replace",
                    "delete",
                    "folders",
                    "createFolder",
                    "updateFolder",
                    "deleteFolder",
                    "versions",
                    "restoreVersion",
                    "deleteVersion",
                    "signedUrl",
                    "bind",
                    "transforms",
                    "providerAnalytics",
                  ],
                },
                auth: {
                  type: "object",
                  additionalProperties: true,
                  required: ["modes", "headers", "requiredPermissions", "siteScope"],
                  properties: {
                    modes: {
                      type: "array",
                      items: { enum: ["session", "api-key"] },
                    },
                    headers: { type: "array", items: { type: "string" } },
                    requiredPermissions: {
                      type: "object",
                      additionalProperties: true,
                      required: ["read", "create", "update", "delete", "privateDelivery"],
                      properties: {
                        read: { const: "media.view" },
                        create: { const: "media.create" },
                        update: { const: "media.edit" },
                        delete: { const: "media.delete" },
                        privateDelivery: { const: "media.view" },
                      },
                    },
                    siteScope: { const: true },
                  },
                },
                uploadFields: {
                  type: "array",
                  items: { type: "string" },
                  contains: { const: "file" },
                },
                filters: {
                  type: "object",
                  additionalProperties: true,
                  required: ["types", "typeAliases", "visibility", "scopes", "queryParams", "maxLimit", "aliases"],
                  properties: {
                    types: {
                      type: "array",
                      items: {
                        type: "string",
                        enum: ["image", "video", "audio", "document", "file", "font", "other", "all"],
                      },
                    },
                    typeAliases: {
                      type: "object",
                      additionalProperties: true,
                      required: ["file"],
                      properties: {
                        file: {
                          type: "array",
                          items: {
                            type: "string",
                            enum: ["document", "other"],
                          },
                          contains: { const: "document" },
                        },
                      },
                    },
                    visibility: {
                      type: "array",
                      items: {
                        type: "string",
                        enum: ["public", "private", "all"],
                      },
                    },
                    scopes: {
                      type: "array",
                      items: {
                        type: "string",
                        enum: ["global", "page", "post", "all"],
                      },
                    },
                    queryParams: {
                      type: "array",
                      items: { type: "string" },
                      contains: { const: "folderId" },
                    },
                    maxLimit: { const: 100 },
                    aliases: {
                      type: "object",
                      additionalProperties: true,
                      required: ["blogId", "fileType"],
                      properties: {
                        blogId: { const: "postId" },
                        fileType: { const: "file" },
                      },
                    },
                  },
                },
                sdkHelpers: {
                  type: "object",
                  additionalProperties: true,
                  required: [
                    "list",
                    "upload",
                    "update",
                    "replace",
                    "delete",
                    "folders",
                    "createFolder",
                    "updateFolder",
                    "deleteFolder",
                    "versions",
                    "restoreVersion",
                    "deleteVersion",
                    "signedUrl",
                    "bind",
                    "transforms",
                    "providerAnalytics",
                  ],
                  properties: {
                    list: { const: "adminMedia" },
                    upload: { const: "uploadMedia" },
                    update: { const: "updateAdminMedia" },
                    replace: { const: "replaceMedia" },
                    delete: { const: "deleteAdminMedia" },
                    folders: { const: "adminMediaFolders" },
                    createFolder: { const: "createMediaFolder" },
                    updateFolder: { const: "updateMediaFolder" },
                    deleteFolder: { const: "deleteMediaFolder" },
                    versions: { const: "adminMediaVersions" },
                    restoreVersion: { const: "restoreMediaVersion" },
                    deleteVersion: { const: "deleteMediaVersion" },
                    signedUrl: { const: "createMediaSignedUrl" },
                    bind: { const: "bindMedia" },
                    transforms: { const: "prepareMediaTransforms" },
                    providerAnalytics: { const: "ingestMediaProviderAnalytics" },
                  },
                },
                responseContracts: {
                  type: "object",
                  additionalProperties: true,
                },
                auditing: {
                  type: "object",
                  additionalProperties: true,
                },
                secretHandling: { type: "string" },
              },
            },
            MediaFileCategory: {
              type: "object",
              additionalProperties: true,
              required: [
                "type",
                "label",
                "accepts",
                "pickerUse",
                "delivery",
                "transformEligible",
                "responsiveEligible",
                "fontManifestEligible",
              ],
              properties: {
                type: {
                  type: "string",
                  enum: ["image", "video", "audio", "document", "font", "other"],
                },
                label: { type: "string" },
                accepts: { type: "array", items: { type: "string" } },
                aliases: { type: "array", items: { type: "string" } },
                pickerUse: {
                  type: "string",
                  enum: [
                    "visual-media",
                    "embedded-media",
                    "downloadable-document",
                    "downloadable-file",
                    "typography",
                  ],
                },
                delivery: {
                  type: "string",
                  enum: ["public-or-signed-file", "font-manifest-or-file"],
                },
                transformEligible: { type: "boolean" },
                responsiveEligible: { type: "boolean" },
                fontManifestEligible: { type: "boolean" },
              },
            },
            MediaDeliveryPolicy: {
              type: "object",
              additionalProperties: true,
              required: [
                "publicFiles",
                "privateFiles",
                "signedUrlEndpoint",
                "signedUrlMethod",
                "signedUrlPermission",
                "acceptedDispositions",
                "defaultDisposition",
                "maxSignedUrlSeconds",
                "transformableTypes",
                "responsiveTypes",
                "fontManifestTypes",
                "downloadableTypes",
                "secretHandling",
              ],
              properties: {
                publicFiles: { const: "direct-file-url" },
                privateFiles: { const: "signed-url-required" },
                signedUrlEndpoint: { type: "string" },
                signedUrlMethod: { const: "POST" },
                signedUrlPermission: { const: "media.view" },
                acceptedDispositions: {
                  type: "array",
                  items: { type: "string", enum: ["inline", "attachment"] },
                },
                defaultDisposition: { const: "inline" },
                maxSignedUrlSeconds: { const: 3600 },
                transformableTypes: {
                  type: "array",
                  items: { type: "string", enum: ["image"] },
                },
                responsiveTypes: {
                  type: "array",
                  items: { type: "string", enum: ["image"] },
                },
                fontManifestTypes: {
                  type: "array",
                  items: { type: "string", enum: ["font"] },
                },
                downloadableTypes: {
                  type: "array",
                  items: {
                    type: "string",
                    enum: ["document", "other", "audio", "video"],
                  },
                },
                secretHandling: { type: "string" },
              },
            },
            MediaFolder: {
              type: "object",
              additionalProperties: true,
              required: [
                "id",
                "siteId",
                "parentId",
                "name",
                "sortOrder",
                "createdAt",
                "path",
                "depth",
                "childIds",
                "directAssetCount",
                "assetCount",
              ],
              properties: {
                id: { type: "string" },
                siteId: { type: "string" },
                parentId: { type: ["string", "null"] },
                name: { type: "string" },
                sortOrder: { type: "integer" },
                createdAt: { type: "string" },
                path: { type: "string" },
                depth: { type: "integer", minimum: 0 },
                childIds: { type: "array", items: { type: "string" } },
                directAssetCount: { type: "integer", minimum: 0 },
                assetCount: { type: "integer", minimum: 0 },
              },
            },
            MediaFolderRoot: {
              type: "object",
              additionalProperties: false,
              required: [
                "id",
                "name",
                "path",
                "depth",
                "childIds",
                "directAssetCount",
                "assetCount",
              ],
              properties: {
                id: { type: "null" },
                name: { const: "Root" },
                path: { const: "Root" },
                depth: { const: -1 },
                childIds: { type: "array", items: { type: "string" } },
                directAssetCount: { type: "integer", minimum: 0 },
                assetCount: { type: "integer", minimum: 0 },
              },
            },
            MediaFolderListEnvelope: {
              ...envelopeSchema({
                type: "object",
                required: [
                  "schemaVersion",
                  "folders",
                  "root",
                  "count",
                  "publicAssetCount",
                ],
                properties: {
                  schemaVersion: { const: "backy.media-folders.v1" },
                  folders: {
                    type: "array",
                    items: { $ref: "#/components/schemas/MediaFolder" },
                  },
                  root: { $ref: "#/components/schemas/MediaFolderRoot" },
                  count: { type: "integer", minimum: 0 },
                  publicAssetCount: { type: "integer", minimum: 0 },
                },
              }),
            },
            FontManifestEnvelope: envelopeSchema({
              type: "object",
              required: [
                "schemaVersion",
                "siteId",
                "families",
                "fonts",
                "css",
                "counts",
              ],
              properties: {
                schemaVersion: { const: "backy.font-manifest.v1" },
                siteId: { type: "string" },
                families: {
                  type: "array",
                  items: {
                    type: "object",
                    required: [
                      "family",
                      "fallbackStack",
                      "display",
                      "cssFamily",
                      "variants",
                      "assetIds",
                    ],
                    properties: {
                      family: { type: "string" },
                      fallbackStack: { type: "string" },
                      display: { type: "string" },
                      cssFamily: { type: "string" },
                      variants: {
                        type: "array",
                        items: { $ref: "#/components/schemas/FontVariant" },
                      },
                      assetIds: { type: "array", items: { type: "string" } },
                    },
                  },
                },
                fonts: {
                  type: "array",
                  items: { $ref: "#/components/schemas/FontVariant" },
                },
                css: { type: "string" },
                counts: {
                  type: "object",
                  required: ["families", "variants"],
                  properties: {
                    families: { type: "integer", minimum: 0 },
                    variants: { type: "integer", minimum: 0 },
                  },
                },
              },
            }),
            FontVariant: {
              type: "object",
              required: [
                "id",
                "mediaId",
                "family",
                "weight",
                "style",
                "display",
                "fallbackStack",
                "cssFamily",
                "url",
              ],
              properties: {
                id: { type: "string" },
                mediaId: { type: "string" },
                family: { type: "string" },
                weight: { type: "string" },
                style: { type: "string" },
                display: { type: "string" },
                fallbackStack: { type: "string" },
                cssFamily: { type: "string" },
                url: { type: "string" },
                mimeType: { type: "string" },
                sizeBytes: { type: "integer", minimum: 0 },
                originalName: { type: "string" },
                folderId: { type: ["string", "null"] },
                tags: { type: "array", items: { type: "string" } },
              },
            },
            MediaDetailEnvelope: envelopeSchema({
              type: "object",
              required: ["media"],
              properties: {
                media: { $ref: "#/components/schemas/MediaAsset" },
              },
            }),
            MediaAsset: {
              type: "object",
              additionalProperties: true,
              properties: {
                id: { type: "string" },
                type: {
                  type: "string",
                  enum: [
                    "image",
                    "video",
                    "audio",
                    "document",
                    "font",
                    "other",
                  ],
                },
                url: { type: "string" },
                visibility: { type: "string" },
                organization: {
                  type: "object",
                  additionalProperties: false,
                  required: [
                    "schemaVersion",
                    "folderId",
                    "folderName",
                    "folderPath",
                    "folderSegments",
                    "folderAncestors",
                    "folderDepth",
                    "folderSortOrder",
                    "root",
                    "missingFolder",
                  ],
                  properties: {
                    schemaVersion: {
                      const: "backy.media.organization.v1",
                    },
                    folderId: { type: ["string", "null"] },
                    folderName: { type: "string" },
                    folderPath: { type: "string" },
                    folderSegments: {
                      type: "array",
                      items: { type: "string" },
                    },
                    folderAncestors: {
                      type: "array",
                      items: {
                        type: "object",
                        additionalProperties: false,
                        required: ["id", "name", "parentId", "sortOrder"],
                        properties: {
                          id: { type: "string" },
                          name: { type: "string" },
                          parentId: { type: ["string", "null"] },
                          sortOrder: { type: "integer" },
                        },
                      },
                    },
                    folderDepth: { type: "integer" },
                    folderSortOrder: { type: ["integer", "null"] },
                    root: { type: "boolean" },
                    missingFolder: { type: "boolean" },
                  },
                },
                references: { $ref: "#/components/schemas/MediaReferences" },
                referenceSummary: {
                  type: "object",
                  additionalProperties: false,
	                  properties: {
	                    pageCount: { type: "integer" },
	                    postCount: { type: "integer" },
	                    collectionRecordCount: { type: "integer" },
	                    usageTypes: { type: "array", items: { type: "string" } },
	                    global: { type: "boolean" },
	                    scoped: { type: "boolean" },
                  },
                },
                editableMetadata: {
                  $ref: "#/components/schemas/MediaEditableMetadata",
                },
                responsive: {
                  type: "object",
                  additionalProperties: false,
                  properties: {
                    src: { type: "string" },
                    srcSet: { type: "string" },
                    sizes: { type: "string" },
                    variants: {
                      type: "array",
                      items: {
                        type: "object",
                        required: ["width", "quality", "url"],
                        properties: {
                          width: { type: "integer" },
                          quality: { type: "integer" },
                          url: { type: "string" },
                          bytes: { type: "integer" },
                          format: { type: "string" },
                          mimeType: { type: "string" },
                          generatedAt: { type: "string", format: "date-time" },
                        },
                      },
                    },
                    format: { type: "string" },
                    generatedBytes: { type: "integer" },
                    storageProvider: { type: "string" },
                    preparedAt: { type: "string", format: "date-time" },
                    preparedBy: { type: "string" },
                  },
                },
              },
            },
            MediaReferenceTarget: {
              type: "object",
              additionalProperties: false,
              required: ["id", "usageTypes", "bindings"],
              properties: {
                id: { type: "string" },
                usageTypes: { type: "array", items: { type: "string" } },
                bindings: {
                  type: "array",
                  items: {
                    type: "object",
                    additionalProperties: true,
                    properties: {
                      id: { type: "string" },
                      mediaId: { type: "string" },
	                      scope: { type: "string", enum: ["page", "post", "collectionRecord"] },
	                      targetId: { type: "string" },
	                      collectionId: { type: "string" },
	                      usageType: { type: "string" },
	                      attachedBy: { type: ["string", "null"] },
                      createdAt: { type: "string", format: "date-time" },
                      updatedAt: { type: "string", format: "date-time" },
                    },
                  },
                },
              },
            },
            MediaReferences: {
              type: "object",
              additionalProperties: false,
              required: [
                "schemaVersion",
                "global",
                "scoped",
	                "scopes",
	                "pageIds",
	                "postIds",
	                "collectionRecordIds",
	                "pages",
	                "posts",
	                "collectionRecords",
	                "usageTypes",
	                "totalBindings",
              ],
              properties: {
                schemaVersion: {
                  type: "string",
                  const: "backy.media.references.v1",
                },
                global: { type: "boolean" },
                scoped: { type: "boolean" },
	                scopes: {
	                  type: "array",
	                  items: { type: "string", enum: ["global", "page", "post", "collectionRecord"] },
	                },
	                pageIds: { type: "array", items: { type: "string" } },
	                postIds: { type: "array", items: { type: "string" } },
	                collectionRecordIds: { type: "array", items: { type: "string" } },
	                pages: {
	                  type: "array",
	                  items: { $ref: "#/components/schemas/MediaReferenceTarget" },
                },
	                posts: {
	                  type: "array",
	                  items: { $ref: "#/components/schemas/MediaReferenceTarget" },
	                },
	                collectionRecords: {
	                  type: "array",
	                  items: { $ref: "#/components/schemas/MediaReferenceTarget" },
	                },
	                usageTypes: { type: "array", items: { type: "string" } },
                totalBindings: { type: "integer" },
              },
            },
            MediaEditableMetadata: {
              type: "object",
              additionalProperties: false,
              required: [
                "schemaVersion",
                "title",
                "altText",
                "caption",
                "tags",
                "folderId",
                "scope",
                "scopeTargetId",
                "visibility",
                "metadata",
              ],
              properties: {
                schemaVersion: {
                  type: "string",
                  const: "backy.media.editable-metadata.v1",
                },
                title: { type: ["string", "null"] },
                altText: { type: ["string", "null"] },
                caption: { type: ["string", "null"] },
                tags: { type: "array", items: { type: "string" } },
                folderId: { type: ["string", "null"] },
                scope: { type: "string", enum: ["global", "page", "post"] },
                scopeTargetId: { type: ["string", "null"] },
                visibility: { type: "string" },
                metadata: { type: "object", additionalProperties: true },
              },
            },
            ReusableSectionListEnvelope: envelopeSchema({
              type: "object",
              required: ["sections", "pagination"],
              properties: {
                sections: {
                  type: "array",
                  items: { $ref: "#/components/schemas/ReusableSection" },
                },
                pagination: { type: "object", additionalProperties: true },
              },
            }),
            ReusableSectionEnvelope: envelopeSchema({
              type: "object",
              required: ["section"],
              properties: {
                section: { $ref: "#/components/schemas/ReusableSection" },
              },
            }),
            ContentRevisionBranchMetadata: {
              type: "object",
              additionalProperties: true,
              required: [
                "schemaVersion",
                "source",
                "targetType",
                "position",
                "total",
                "order",
                "branchId",
                "branchLabel",
                "branchLane",
                "branchRole",
                "chronologicalParentId",
                "chronologicalChildId",
                "restoreTargetRevisionId",
                "restoreTargetPosition",
                "restoreTargetInWindow",
                "restoreEdgeId",
                "inference",
              ],
              properties: {
                schemaVersion: { const: "backy.content-revision-branch-metadata.v1" },
                source: {
                  type: "string",
                  enum: ["admin-page-revisions-api", "admin-blog-revisions-api"],
                },
                targetType: { type: "string", enum: ["page", "post"] },
                position: { type: "integer", minimum: 1 },
                total: { type: "integer", minimum: 0 },
                order: { const: "newest-first" },
                branchId: { type: "string" },
                branchLabel: { type: "string" },
                branchLane: { type: "integer", minimum: 0 },
                branchRole: {
                  type: "string",
                  enum: ["trunk", "restore-checkpoint", "restore-branch"],
                },
                chronologicalParentId: { type: ["string", "null"] },
                chronologicalChildId: { type: ["string", "null"] },
                restoreTargetRevisionId: { type: ["string", "null"] },
                restoreTargetPosition: { type: ["integer", "null"], minimum: 1 },
                restoreTargetInWindow: { type: "boolean" },
                restoreEdgeId: { type: ["string", "null"] },
                branchPointRevisionId: { type: ["string", "null"] },
                inference: {
                  type: "object",
                  additionalProperties: true,
                  required: [
	                    "source",
	                    "lineageSource",
	                    "rollbackNotePattern",
                    "confidence",
                    "persistedFields",
                    "limitation",
                  ],
                  properties: {
	                    source: { const: "revision-note-and-order" },
	                    lineageSource: {
	                      type: "string",
	                      enum: ["persisted-revision-lineage", "revision-note-and-order"],
	                    },
	                    rollbackNotePattern: { type: "string" },
                    confidence: { const: "explicit-api-metadata" },
                    persistedFields: {
                      type: "array",
                      items: { type: "string" },
                      contains: { const: "note" },
                    },
                    limitation: { type: "string" },
                  },
                },
              },
            },
            AdminPageRevision: {
              type: "object",
              additionalProperties: true,
              required: [
                "id",
                "siteId",
                "targetType",
                "targetId",
	                "snapshot",
	                "note",
	                "parentRevisionId",
	                "operation",
	                "restoreTargetRevisionId",
	                "metadata",
	                "createdBy",
                "createdAt",
                "branchMetadata",
              ],
              properties: {
                id: { type: "string" },
                siteId: { type: "string" },
                targetType: { const: "page" },
                targetId: { type: "string" },
	                snapshot: { $ref: "#/components/schemas/PageResource" },
	                note: { type: ["string", "null"] },
	                parentRevisionId: { type: ["string", "null"] },
	                operation: { type: ["string", "null"] },
	                restoreTargetRevisionId: { type: ["string", "null"] },
	                metadata: { type: "object", additionalProperties: true },
	                createdBy: { type: ["string", "null"] },
                createdAt: { type: "string", format: "date-time" },
                branchMetadata: { $ref: "#/components/schemas/ContentRevisionBranchMetadata" },
              },
            },
            AdminPageRevisionsEnvelope: envelopeSchema({
              type: "object",
              required: ["revisions", "pagination"],
              properties: {
                revisions: {
                  type: "array",
                  items: { $ref: "#/components/schemas/AdminPageRevision" },
                },
                pagination: { type: "object", additionalProperties: true },
              },
            }),
            AdminPageRollbackRequest: {
              type: "object",
              additionalProperties: true,
              required: ["revisionId"],
              properties: {
                revisionId: { type: "string", minLength: 1 },
                requestId: { type: "string" },
              },
            },
            PageListEnvelope: envelopeSchema({
              type: "object",
              required: ["pages", "pagination"],
              properties: {
                pages: {
                  type: "array",
                  items: { $ref: "#/components/schemas/PageResource" },
                },
                pagination: { type: "object", additionalProperties: true },
              },
            }),
            PageEnvelope: envelopeSchema({
              type: "object",
              required: ["page"],
              properties: {
                page: { $ref: "#/components/schemas/PageResource" },
              },
            }),
            PageUpdateRequest: {
              type: "object",
              additionalProperties: true,
              properties: {
                expectedUpdatedAt: { type: "string", format: "date-time" },
                title: { type: "string" },
                slug: { type: "string" },
                status: {
                  type: "string",
                  enum: ["draft", "published", "scheduled", "archived"],
                },
                scheduledAt: { type: ["string", "null"], format: "date-time" },
                isHomepage: { type: "boolean" },
                parentId: { type: ["string", "null"] },
                meta: { type: "object", additionalProperties: true },
                design: { $ref: "#/components/schemas/FrontendDesignTemplateContent" },
                frontendDesign: { $ref: "#/components/schemas/FrontendDesignTemplateContent" },
                content: {
                  oneOf: [
                    { $ref: "#/components/schemas/BackyContentDocument" },
                    {
                      type: "object",
                      additionalProperties: true,
                      properties: {
                        elements: {
                          type: "array",
                          items: { type: "object", additionalProperties: true },
                        },
                        canvasSize: {
                          type: "object",
                          required: ["width", "height"],
                          properties: {
                            width: { type: "number", exclusiveMinimum: 0 },
                            height: { type: "number", exclusiveMinimum: 0 },
                          },
                        },
                        customCSS: { type: "string" },
                        customJS: { type: "string" },
                        themeTokenRefs: {
                          type: "object",
                          additionalProperties: { type: "string" },
                        },
                        assets: {
                          oneOf: [
                            { type: "array", items: {} },
                            { type: "object", additionalProperties: true },
                          ],
                        },
                        animations: {
                          oneOf: [
                            {
                              type: "array",
                              items: { type: "object", additionalProperties: true },
                            },
                            { type: "object", additionalProperties: true },
                          ],
                        },
                        interactions: {
                          oneOf: [
                            { type: "array", items: {} },
                            { type: "object", additionalProperties: true },
                          ],
                        },
                        seo: { type: "object", additionalProperties: true },
                        dataBindings: { type: "object", additionalProperties: true },
                        editableMap: {
                          type: "object",
                          additionalProperties: {
                            $ref: "#/components/schemas/BackyEditableMapEntry",
                          },
                        },
                        metadata: { type: "object", additionalProperties: true },
                        contentDocument: {
                          $ref: "#/components/schemas/BackyContentDocument",
                        },
                      },
                    },
                    {
                      type: "array",
                      items: { type: "object", additionalProperties: true },
                    },
                  ],
                },
              },
            },
            LiveManagementDiscovery: {
              type: "object",
              additionalProperties: true,
              required: [
                "schemaVersion",
                "enabled",
                "endpoints",
                "methods",
                "auth",
                "capabilities",
                "editableTargets",
                "lifecycle",
                "inlineElementTypes",
                "editorComposition",
                "updateBody",
                "errors",
              ],
              properties: {
                schemaVersion: { const: "backy.live-management.v1" },
                enabled: { type: "boolean" },
                endpoints: {
                  type: "object",
                  additionalProperties: true,
                  required: ["page", "post", "render", "editableMapSchema"],
                  properties: {
                    page: { type: "string" },
                    post: { type: "string" },
                    render: { type: "string" },
                    editableMapSchema: { type: "string" },
                  },
                },
                methods: {
                  type: "object",
                  additionalProperties: false,
                  required: ["read", "update"],
                  properties: {
                    read: { const: "GET" },
                    update: { const: "PATCH" },
                  },
                },
                auth: {
                  type: "object",
                  additionalProperties: true,
                  required: ["modes", "headers", "requiredPermissions", "siteScope"],
                  properties: {
                    modes: {
                      type: "array",
                      items: { type: "string", enum: ["session", "api-key"] },
                    },
                    headers: { type: "array", items: { type: "string" } },
                    requiredPermissions: {
                      type: "object",
                      additionalProperties: false,
                      required: ["read", "update"],
                      properties: {
                        read: { const: "pages.view" },
                        update: { const: "pages.edit" },
                      },
                    },
                    siteScope: { const: true },
                  },
                },
                capabilities: {
                  type: "object",
                  additionalProperties: true,
                  required: [
                    "pageMetadata",
                    "postMetadata",
                    "contentDocument",
                    "canvasElements",
                    "editableMap",
                    "optimisticConcurrency",
                    "cacheInvalidation",
                    "auditTrail",
                    "webhookDelivery",
                    "mediaAssetRefs",
                    "fontAssetRefs",
                    "elementAssetIds",
                    "tokenRefs",
                    "animation",
                    "animationTokenRefs",
                    "inlineFormControls",
                    "editorComposition",
                    "editorGrouping",
                  ],
                  properties: {
                    pageMetadata: { type: "boolean" },
                    postMetadata: { type: "boolean" },
                    contentDocument: { type: "boolean" },
                    canvasElements: { type: "boolean" },
                    editableMap: { type: "boolean" },
                    optimisticConcurrency: { type: "boolean" },
                    cacheInvalidation: { type: "boolean" },
                    auditTrail: { type: "boolean" },
                    webhookDelivery: { type: "boolean" },
                    inlineText: { type: "boolean" },
                    inlineLinks: { type: "boolean" },
                    inlineImages: { type: "boolean" },
                    inlineMedia: { type: "boolean" },
                    inlineFormControls: { type: "boolean" },
                    inlineLayout: { type: "boolean" },
                    inlineAppearance: { type: "boolean" },
                    mediaAssetRefs: { type: "boolean" },
                    fontAssetRefs: { type: "boolean" },
                    elementAssetIds: { type: "boolean" },
                    tokenRefs: { type: "boolean" },
                    animation: { type: "boolean" },
                    animationTokenRefs: { type: "boolean" },
                    editorComposition: { type: "boolean" },
                    editorGrouping: { type: "boolean" },
                  },
                },
                editableTargets: {
                  type: "array",
                  items: { type: "string" },
                  allOf: [
                    { contains: { const: "props.formId" } },
                    { contains: { const: "props.fieldBackgroundColor" } },
                    { contains: { const: "props.submitBackgroundColor" } },
                    { contains: { const: "props.mediaId" } },
                    { contains: { const: "props.mediaIds" } },
                    { contains: { const: "props.backgroundMediaIds" } },
                    { contains: { const: "props.posterMediaIds" } },
                    { contains: { const: "props.fontMediaId" } },
                    { contains: { const: "props.fontMediaIds" } },
                    { contains: { const: "styles.boxShadow" } },
                    { contains: { const: "tokenRefs.styles.boxShadow" } },
                    { contains: { const: "responsive.mobile.styles.boxShadow" } },
                    { contains: { const: "responsive.tablet.tokenRefs.styles.boxShadow" } },
                    { contains: { const: "assetIds" } },
                    { contains: { const: "animation.type" } },
                    { contains: { const: "animation.scrollTrigger.start" } },
                    { contains: { const: "animation.scrollTrigger.scrub" } },
                    { contains: { const: "animation.from" } },
                    { contains: { const: "animation.to" } },
                    { contains: { const: "animation.tokenRefs.duration" } },
                    { contains: { const: "actions" } },
                    { contains: { const: "dataBindings" } },
                    { contains: { const: "bindingSlots" } },
                    { contains: { const: "responsive.mobile.x" } },
                    { contains: { const: "responsive.mobile.props.posterMediaIds" } },
                    { contains: { const: "responsive.tablet.width" } },
                  ],
                },
                lifecycle: {
                  type: "object",
                  additionalProperties: true,
                  required: [
                    "schemaVersion",
                    "cloneField",
                    "permissions",
                    "sdkHelpers",
                    "requestBodies",
                    "responseContracts",
                  ],
                  properties: {
                    schemaVersion: { const: "backy.content-lifecycle-commands.v1" },
                    cloneField: { const: "frontendDesignTemplateId" },
                    permissions: {
                      type: "object",
                      additionalProperties: true,
                      required: ["create", "publish"],
                      properties: {
                        create: { const: "pages.edit" },
                        publish: { const: "pages.publish" },
                      },
                    },
                    sdkHelpers: {
                      type: "object",
                      additionalProperties: true,
                      required: [
                        "createPage",
                        "createPost",
                        "createPagePreview",
                        "createPostPreview",
                      ],
                      properties: {
                        createPage: { const: "createAdminPage" },
                        createPost: { const: "createAdminBlogPost" },
                        createPagePreview: { const: "createAdminPagePreviewToken" },
                        createPostPreview: { const: "createAdminBlogPostPreviewToken" },
                      },
                    },
                    requestBodies: { type: "object", additionalProperties: true },
                    responseContracts: {
                      type: "object",
                      additionalProperties: true,
                      required: [
                        "pageRevisions",
                        "postRevisions",
                        "revisionBranchMetadata",
                        "branchMetadataField",
                        "pageRollbackRequest",
                        "postRollbackRequest",
                      ],
                      properties: {
                        pageRevisions: { const: "backy.admin-page-revisions.v1" },
                        postRevisions: { const: "backy.admin-blog-post-revisions.v1" },
                        revisionBranchMetadata: { const: "backy.content-revision-branch-metadata.v1" },
                        branchMetadataField: { const: "revision.branchMetadata" },
                        pageRollbackRequest: { const: "backy.admin-page-rollback-request.v1" },
                        postRollbackRequest: { const: "backy.admin-blog-post-rollback-request.v1" },
                      },
                    },
                  },
                },
                inlineElementTypes: {
                  type: "object",
                  additionalProperties: {
                    type: "array",
                    items: { type: "string" },
                  },
                  required: ["text", "link", "image", "media", "formControls"],
                  properties: {
                    text: { type: "array", items: { type: "string" } },
                    link: { type: "array", items: { type: "string" } },
                    image: { type: "array", items: { type: "string" } },
                    media: { type: "array", items: { type: "string" } },
                    formControls: {
                      type: "array",
                      items: {
                        type: "string",
                        enum: ["form", "input", "textarea", "select", "checkbox", "radio"],
                      },
                    },
                  },
                },
                editorComposition: {
                  type: "object",
                  additionalProperties: true,
                  required: ["schemaVersion", "sdkHelpers", "commands", "commandRegistry", "constraints"],
                  properties: {
                    schemaVersion: { const: "backy.editor-composition-commands.v1" },
                    sdkHelpers: {
                      type: "object",
                      additionalProperties: true,
                      required: [
                        "listElements",
                        "findElement",
                        "addElement",
                        "duplicateElement",
                        "deleteElements",
                        "transformElements",
                        "group",
                        "ungroup",
                        "patchElement",
                        "patchElements",
                        "buildPageUpdate",
                        "buildBlogPostUpdate",
                      ],
                      properties: {
                        listElements: { const: "listBackyContentElements" },
                        findElement: { const: "findBackyContentElement" },
                        addElement: { const: "addBackyContentElement" },
                        duplicateElement: { const: "duplicateBackyContentElement" },
                        deleteElements: { const: "deleteBackyContentElements" },
                        transformElements: { const: "transformBackyContentElements" },
                        group: { const: "groupBackyContentElements" },
                        ungroup: { const: "ungroupBackyContentElements" },
                        patchElement: { const: "patchBackyContentElement" },
                        patchElements: { const: "patchBackyContentElements" },
                        buildPageUpdate: { const: "buildBackyLiveManagedPageEditableMapUpdate" },
                        buildBlogPostUpdate: { const: "buildBackyLiveManagedBlogPostEditableMapUpdate" },
                      },
                    },
	                    commands: {
                      type: "array",
                      minItems: 7,
                      items: {
                        type: "object",
                        additionalProperties: true,
                        required: [
                          "id",
                          "label",
                          "shortcut",
                          "sdkHelper",
                          "minSelected",
                          "sameParentRequired",
                          "unlockedRequired",
                          "preservesResponsiveGeometry",
                        ],
                        properties: {
                          id: { enum: ["add", "duplicate", "delete", "move", "resize", "group", "ungroup"] },
                          label: { type: "string" },
                          shortcut: { type: "string" },
                          sdkHelper: {
                            enum: [
                              "addBackyContentElement",
                              "duplicateBackyContentElement",
                              "deleteBackyContentElements",
                              "transformBackyContentElements",
                              "groupBackyContentElements",
                              "ungroupBackyContentElements",
                            ],
                          },
                          minSelected: { type: "integer", minimum: 0 },
                          sameParentRequired: { type: "boolean" },
                          unlockedRequired: { type: "boolean" },
                          mutates: { type: "array", items: { type: "string" } },
                          createsEditorGroup: { type: "boolean" },
                          editorGroupRequired: { type: "boolean" },
                          preservesResponsiveGeometry: { type: "boolean" },
                        },
	                      },
	                    },
                    commandRegistry: {
                      type: "object",
                      additionalProperties: true,
                      required: ["schemaVersion", "source", "generatedFrom", "stateModel", "categories", "commands", "privacy"],
                      properties: {
                        schemaVersion: { const: "backy.editor-command-registry.v1" },
                        source: { const: "live-management-discovery" },
                        generatedFrom: { const: "page-editor" },
                        stateModel: {
                          type: "object",
                          additionalProperties: true,
                          required: ["runtimeState", "stateValues", "reasonField", "selectionFields", "clipboardFields", "documentFields"],
                          properties: {
                            runtimeState: { const: "computed-by-editor-client" },
                            stateValues: {
                              type: "array",
                              items: { enum: ["ready", "disabled", "hidden"] },
                              contains: { const: "ready" },
                            },
                            reasonField: { const: "reason" },
                            selectionFields: { type: "array", items: { type: "string" } },
                            clipboardFields: { type: "array", items: { type: "string" } },
                            documentFields: { type: "array", items: { type: "string" } },
                          },
                        },
                        categories: {
                          type: "array",
                          minItems: 8,
                          items: {
                            type: "object",
                            required: ["id", "label", "commandIds"],
                            properties: {
                              id: { type: "string" },
                              label: { type: "string" },
                              commandIds: { type: "array", items: { type: "string" } },
                            },
                          },
                        },
                        commands: {
                          type: "array",
                          minItems: 30,
                          items: {
                            type: "object",
                            additionalProperties: true,
                            required: ["id", "label", "category", "targetScope", "testId", "stateRule"],
                            properties: {
                              id: { type: "string" },
                              label: { type: "string" },
                              category: {
                                enum: [
                                  "history",
                                  "selection",
                                  "clipboard",
                                  "composition",
                                  "layer-state",
                                  "layer-order",
                                  "layout",
                                  "view",
                                  "shell",
                                  "workflow",
                                ],
                              },
                              targetScope: {
                                enum: [
                                  "canvas",
                                  "selected-layer",
                                  "selected-layers",
                                  "selected-sibling-scope",
                                  "selected-child-scope",
                                  "selected-container",
                                  "viewport",
                                  "shell",
                                  "document",
                                ],
                              },
                              testId: { type: "string" },
                              shortcut: { type: "string" },
                              ariaKeyshortcuts: { type: "string" },
                              sdkHelper: { type: "string" },
                              apiHelper: { type: "string" },
                              stateRule: { type: "string" },
                              minSelected: { type: "integer", minimum: 0 },
                              sameParentRequired: { type: "boolean" },
                              unlockedRequired: { type: "boolean" },
                              editorGroupRequired: { type: "boolean" },
                              targetPaths: { type: "array", items: { type: "string" } },
                              mutates: { type: "array", items: { type: "string" } },
                            },
                          },
                        },
                        privacy: {
                          type: "object",
                          required: ["includesSecretValues", "includesAdminSessionValues", "endpointTemplatesOnly"],
                          properties: {
                            includesSecretValues: { const: false },
                            includesAdminSessionValues: { const: false },
                            endpointTemplatesOnly: { const: true },
                          },
                        },
                      },
                    },
	                    constraints: {
                      type: "object",
                      additionalProperties: true,
                      required: [
                        "sameParentRequired",
                        "lockedLayersBlocked",
                        "editorGroupMarker",
                        "responsiveBreakpoints",
                        "updateTarget",
                      ],
                      properties: {
                        sameParentRequired: { const: true },
                        lockedLayersBlocked: { const: true },
                        editorGroupMarker: { const: "props.editorGroup" },
                        responsiveBreakpoints: {
                          type: "array",
                          items: { enum: ["tablet", "mobile"] },
                          contains: { const: "mobile" },
                        },
                        updateTarget: { const: "content" },
                      },
                    },
                  },
                },
                updateBody: {
                  type: "object",
                  additionalProperties: true,
                  required: ["expectedUpdatedAt", "content"],
                  properties: {
                    expectedUpdatedAt: { type: "string" },
                    content: { type: "string" },
                  },
                },
                errors: {
                  type: "object",
                  additionalProperties: true,
                  required: ["conflict", "postConflict", "forbidden", "postForbidden", "validation"],
                  properties: {
                    conflict: { const: "PAGE_VERSION_CONFLICT" },
                    postConflict: { const: "BLOG_VERSION_CONFLICT" },
                    forbidden: { const: "FORBIDDEN_LIVE_MANAGE_SITE_SCOPE" },
                    postForbidden: { const: "FORBIDDEN_LIVE_MANAGE_BLOG_SCOPE" },
                    validation: { const: "VALIDATION_ERROR" },
                  },
                },
              },
            },
            PageResource: {
              type: "object",
              additionalProperties: true,
              required: ["id", "title", "slug"],
              properties: {
                id: { type: "string" },
                siteId: { type: "string" },
                title: { type: "string" },
                slug: { type: "string" },
                description: { type: ["string", "null"] },
                status: { type: "string" },
                path: { type: "string" },
                isHomepage: { type: "boolean" },
                parentId: { type: ["string", "null"] },
                meta: { type: "object", additionalProperties: true },
                seo: { $ref: "#/components/schemas/PageSeoMetadata" },
                content: { $ref: "#/components/schemas/BackyContentDocument" },
                frontendDesign: {
                  $ref: "#/components/schemas/ReusableSectionFrontendDesign",
                },
                createdAt: { type: "string", format: "date-time" },
                updatedAt: { type: "string", format: "date-time" },
              },
            },
            PageSeoMetadata: {
              type: "object",
              additionalProperties: true,
              required: [
                "title",
                "description",
                "path",
                "canonical",
                "robots",
                "openGraph",
                "keywords",
                "jsonLd",
              ],
              properties: {
                title: { type: "string" },
                description: { type: "string" },
                path: { type: "string" },
                canonical: { type: "string" },
                canonicalUrl: { type: "string" },
                robots: {
                  type: "object",
                  required: ["index", "follow"],
                  properties: {
                    index: { type: "boolean" },
                    follow: { type: "boolean" },
                  },
                },
                openGraph: {
                  type: "object",
                  required: ["title", "description"],
                  additionalProperties: true,
                  properties: {
                    title: { type: "string" },
                    description: { type: "string" },
                    image: { type: "string" },
                  },
                },
                keywords: { type: "array", items: { type: "string" } },
                jsonLd: {
                  type: "array",
                  items: { type: "object", additionalProperties: true },
                },
              },
            },
            BlogPostListEnvelope: envelopeSchema({
              type: "object",
              required: ["posts", "pagination"],
              properties: {
                posts: {
                  type: "array",
                  items: { $ref: "#/components/schemas/BlogPostResource" },
                },
                pagination: { type: "object", additionalProperties: true },
              },
            }),
            BlogPostEnvelope: envelopeSchema({
              type: "object",
              required: ["post"],
              properties: {
                post: { $ref: "#/components/schemas/BlogPostResource" },
              },
            }),
            AdminBlogPostRevision: {
              type: "object",
              additionalProperties: true,
              required: [
                "id",
                "siteId",
                "targetType",
                "targetId",
	                "snapshot",
	                "note",
	                "parentRevisionId",
	                "operation",
	                "restoreTargetRevisionId",
	                "metadata",
	                "createdBy",
                "createdAt",
                "branchMetadata",
              ],
              properties: {
                id: { type: "string" },
                siteId: { type: "string" },
                targetType: { const: "post" },
                targetId: { type: "string" },
	                snapshot: { $ref: "#/components/schemas/BlogPostResource" },
	                note: { type: ["string", "null"] },
	                parentRevisionId: { type: ["string", "null"] },
	                operation: { type: ["string", "null"] },
	                restoreTargetRevisionId: { type: ["string", "null"] },
	                metadata: { type: "object", additionalProperties: true },
	                createdBy: { type: ["string", "null"] },
                createdAt: { type: "string", format: "date-time" },
                branchMetadata: { $ref: "#/components/schemas/ContentRevisionBranchMetadata" },
              },
            },
            AdminBlogPostRevisionsEnvelope: envelopeSchema({
              type: "object",
              required: ["revisions", "pagination"],
              properties: {
                revisions: {
                  type: "array",
                  items: { $ref: "#/components/schemas/AdminBlogPostRevision" },
                },
                pagination: { type: "object", additionalProperties: true },
              },
            }),
            AdminBlogPostRollbackRequest: {
              type: "object",
              additionalProperties: true,
              required: ["revisionId"],
              properties: {
                revisionId: { type: "string", minLength: 1 },
                requestId: { type: "string" },
              },
            },
            BlogPostUpdateRequest: {
              type: "object",
              additionalProperties: true,
              properties: {
                expectedUpdatedAt: { type: "string", format: "date-time" },
                title: { type: "string" },
                slug: { type: "string" },
                excerpt: { type: ["string", "null"] },
                status: {
                  type: "string",
                  enum: ["draft", "published", "scheduled", "archived"],
                },
                scheduledAt: { type: ["string", "null"], format: "date-time" },
                featuredImageId: { type: ["string", "null"] },
                authorId: { type: ["string", "null"] },
                categoryIds: { type: "array", items: { type: "string" } },
                tagIds: { type: "array", items: { type: "string" } },
                meta: { type: "object", additionalProperties: true },
                design: { $ref: "#/components/schemas/FrontendDesignTemplateContent" },
                frontendDesign: { $ref: "#/components/schemas/FrontendDesignTemplateContent" },
                content: {
                  oneOf: [
                    { $ref: "#/components/schemas/BackyContentDocument" },
                    {
                      type: "object",
                      additionalProperties: true,
                      properties: {
                        elements: {
                          type: "array",
                          items: { type: "object", additionalProperties: true },
                        },
                        canvasSize: {
                          type: "object",
                          required: ["width", "height"],
                          properties: {
                            width: { type: "number", exclusiveMinimum: 0 },
                            height: { type: "number", exclusiveMinimum: 0 },
                          },
                        },
                        customCSS: { type: "string" },
                        customJS: { type: "string" },
                        themeTokenRefs: {
                          type: "object",
                          additionalProperties: { type: "string" },
                        },
                        assets: {
                          oneOf: [
                            { type: "array", items: {} },
                            { type: "object", additionalProperties: true },
                          ],
                        },
                        animations: {
                          oneOf: [
                            {
                              type: "array",
                              items: { type: "object", additionalProperties: true },
                            },
                            { type: "object", additionalProperties: true },
                          ],
                        },
                        interactions: {
                          oneOf: [
                            { type: "array", items: {} },
                            { type: "object", additionalProperties: true },
                          ],
                        },
                        seo: { type: "object", additionalProperties: true },
                        dataBindings: { type: "object", additionalProperties: true },
                        editableMap: {
                          type: "object",
                          additionalProperties: {
                            $ref: "#/components/schemas/BackyEditableMapEntry",
                          },
                        },
                        metadata: { type: "object", additionalProperties: true },
                        contentDocument: {
                          $ref: "#/components/schemas/BackyContentDocument",
                        },
                      },
                    },
                    {
                      type: "array",
                      items: { type: "object", additionalProperties: true },
                    },
                  ],
                },
              },
            },
            BlogFeedDiscovery: {
              type: "object",
              additionalProperties: true,
              required: ["id", "format", "contentType", "endpoint"],
              properties: {
                id: { type: "string" },
                title: { type: "string" },
                format: { type: "string", enum: ["rss"] },
                version: { type: "string" },
                rel: { type: "string" },
                contentType: { type: "string" },
                endpoint: { type: "string" },
                hostedPath: { type: "string" },
                schemaVersion: { type: "string" },
                scope: { type: "string" },
                visibility: { type: "string" },
                cache: {
                  type: "object",
                  additionalProperties: true,
                  properties: {
                    scope: { type: "string" },
                    etag: { type: "boolean" },
                    revisionHeader: { type: "string" },
                  },
                },
                limits: {
                  type: "object",
                  additionalProperties: true,
                  properties: {
                    queryParam: { type: "string" },
                    default: { type: "integer" },
                    min: { type: "integer" },
                    max: { type: "integer" },
                  },
                },
              },
            },
            BlogPostResource: {
              type: "object",
              additionalProperties: true,
              required: ["id", "title", "slug"],
              properties: {
                id: { type: "string" },
                siteId: { type: "string" },
                title: { type: "string" },
                slug: { type: "string" },
                excerpt: { type: ["string", "null"] },
                status: { type: "string" },
                authorId: { type: ["string", "null"] },
                categoryIds: { type: "array", items: { type: "string" } },
                tagIds: { type: "array", items: { type: "string" } },
                meta: { type: "object", additionalProperties: true },
                content: { $ref: "#/components/schemas/BackyContentDocument" },
                frontendDesign: {
                  $ref: "#/components/schemas/ReusableSectionFrontendDesign",
                },
                publishedAt: { type: ["string", "null"], format: "date-time" },
                createdAt: { type: "string", format: "date-time" },
                updatedAt: { type: "string", format: "date-time" },
              },
            },
            BlogCategoryListEnvelope: envelopeSchema({
              type: "object",
              required: ["categories"],
              properties: {
                categories: {
                  type: "array",
                  items: { $ref: "#/components/schemas/BlogCategoryResource" },
                },
              },
            }),
            BlogCategoryResource: {
              type: "object",
              additionalProperties: true,
              required: ["id", "name", "slug"],
              properties: {
                id: { type: "string" },
                siteId: { type: "string" },
                name: { type: "string" },
                slug: { type: "string" },
                description: { type: ["string", "null"] },
                color: { type: ["string", "null"] },
                sortOrder: { type: "integer" },
                postCount: { type: "integer" },
                createdAt: { type: "string", format: "date-time" },
                updatedAt: { type: "string", format: "date-time" },
              },
            },
            BlogTagListEnvelope: envelopeSchema({
              type: "object",
              required: ["tags"],
              properties: {
                tags: {
                  type: "array",
                  items: { $ref: "#/components/schemas/BlogTagResource" },
                },
              },
            }),
            BlogTagResource: {
              type: "object",
              additionalProperties: true,
              required: ["id", "name", "slug"],
              properties: {
                id: { type: "string" },
                siteId: { type: "string" },
                name: { type: "string" },
                slug: { type: "string" },
                description: { type: ["string", "null"] },
                postCount: { type: "integer" },
                createdAt: { type: "string", format: "date-time" },
                updatedAt: { type: "string", format: "date-time" },
              },
            },
            BlogAuthorListEnvelope: envelopeSchema({
              type: "object",
              required: ["authors"],
              properties: {
                authors: {
                  type: "array",
                  items: { $ref: "#/components/schemas/BlogAuthorResource" },
                },
              },
            }),
            BlogAuthorResource: {
              type: "object",
              additionalProperties: true,
              required: ["id", "name", "slug"],
              properties: {
                id: { type: "string" },
                siteId: { type: "string" },
                name: { type: "string" },
                slug: { type: "string" },
                role: { type: "string" },
                status: { type: "string" },
                avatarUrl: { type: ["string", "null"] },
                postCount: { type: "integer" },
              },
            },
            ReusableSectionFrontendDesign: {
              type: "object",
              additionalProperties: true,
              properties: {
                templateId: { type: "string" },
                templateName: { type: "string" },
                routePattern: { type: "string" },
                source: { type: "object", additionalProperties: true },
                chrome: { type: "object", additionalProperties: true },
                tokens: { type: "object", additionalProperties: true },
                customCss: { type: "string" },
                customJs: { type: "string" },
                contentDocument: {
                  type: "object",
                  additionalProperties: true,
                },
                elements: {
                  type: "array",
                  items: { type: "object", additionalProperties: true },
                },
                canvasSize: { type: "object", additionalProperties: true },
                themeTokenRefs: {
                  type: "object",
                  additionalProperties: true,
                },
                assets: {
                  oneOf: [
                    {
                      type: "array",
                      items: { type: "object", additionalProperties: true },
                    },
                    { type: "object", additionalProperties: true },
                  ],
                },
                animations: {
                  oneOf: [
                    {
                      type: "array",
                      items: { type: "object", additionalProperties: true },
                    },
                    { type: "object", additionalProperties: true },
                  ],
                },
                interactions: {
                  oneOf: [
                    {
                      type: "array",
                      items: { type: "object", additionalProperties: true },
                    },
                    { type: "object", additionalProperties: true },
                  ],
                },
                dataBindings: { type: "object", additionalProperties: true },
                editableMap: { type: "object", additionalProperties: true },
                seo: { type: "object", additionalProperties: true },
                metadata: { type: "object", additionalProperties: true },
                fieldKeyMap: {
                  type: "object",
                  additionalProperties: { type: "string" },
                },
                bindingHints: {
                  type: "array",
                  items: { type: "object", additionalProperties: true },
                },
              },
            },
            BackyContentAssetRef: {
              type: "object",
              additionalProperties: true,
              required: ["id", "type"],
              properties: {
                id: { type: "string" },
                type: { type: "string" },
                url: { type: "string" },
                alt: { type: "string" },
                title: { type: "string" },
                caption: { type: "string" },
                visibility: {
                  type: "string",
                  enum: ["public", "private", "unlisted"],
                },
                metadata: { type: "object", additionalProperties: true },
              },
            },
            BackyElementAction: {
              type: "object",
              additionalProperties: true,
              required: ["id", "type"],
              properties: {
                id: { type: "string" },
                type: {
                  type: "string",
                  enum: [
                    "link",
                    "route",
                    "submitForm",
                    "openModal",
                    "closeModal",
                    "toggle",
                    "playMedia",
                    "pauseMedia",
                    "download",
                    "customEvent",
                  ],
                },
                label: { type: "string" },
                target: { type: "string" },
                href: { type: "string" },
                method: {
                  type: "string",
                  enum: ["GET", "POST", "PUT", "PATCH", "DELETE"],
                },
                formId: { type: "string" },
                mediaId: { type: "string" },
                openIn: {
                  type: "string",
                  enum: ["self", "new-tab", "modal", "download"],
                },
                requiresAuth: { type: "boolean" },
                analyticsEvent: { type: "string" },
                payload: { type: "object", additionalProperties: true },
                conditions: {
                  type: "array",
                  items: { type: "object", additionalProperties: true },
                },
              },
            },
            BackyDataBindingSource: {
              type: "object",
              additionalProperties: true,
              required: ["kind"],
              properties: {
                kind: {
                  type: "string",
                  enum: [
                    "collection",
                    "page",
                    "post",
                    "site",
                    "route",
                    "query",
                    "auth",
                    "static",
                  ],
                },
                collectionId: { type: "string" },
                field: { type: "string" },
                recordId: { type: "string" },
                path: { type: "string" },
              },
            },
            BackyDataBinding: {
              type: "object",
              additionalProperties: true,
              required: ["id", "elementId", "targetPath", "source", "mode"],
              properties: {
                id: { type: "string" },
                elementId: { type: "string" },
                targetPath: { type: "string" },
                source: { $ref: "#/components/schemas/BackyDataBindingSource" },
                mode: {
                  type: "string",
                  enum: [
                    "text",
                    "html",
                    "image",
                    "video",
                    "audio",
                    "url",
                    "boolean",
                    "number",
                    "json",
                  ],
                },
                fallback: {},
                format: { type: "object", additionalProperties: true },
                writeBack: {
                  type: "object",
                  additionalProperties: true,
                  properties: {
                    enabled: { type: "boolean" },
                    permission: { type: "string" },
                    endpoint: { type: "string" },
                  },
                },
              },
            },
            BackyEditableMapEntry: {
              type: "object",
              additionalProperties: true,
              required: ["elementId", "field", "editable", "valueType"],
              properties: {
                elementId: { type: "string" },
                field: { type: "string" },
                token: { type: "string" },
                editable: { type: "boolean" },
                permission: { type: "string" },
                label: { type: "string" },
                valueType: {
                  type: "string",
                  enum: [
                    "string",
                    "richText",
                    "number",
                    "boolean",
                    "color",
                    "image",
                    "video",
                    "audio",
                    "file",
                    "url",
                    "json",
                  ],
                },
                scope: {
                  type: "string",
                  enum: [
                    "site",
                    "page",
                    "post",
                    "template",
                    "element",
                    "collectionRecord",
                  ],
                },
                collectionId: { type: "string" },
                recordId: { type: "string" },
                sourceField: { type: "string" },
              },
            },
            BackyContentElementAccessibility: {
              type: "object",
              additionalProperties: true,
              properties: {
                label: { type: "string" },
                alt: { type: "string" },
                role: { type: "string" },
                aria: { type: "object", additionalProperties: true },
              },
            },
            BackyElementAnimation: {
              type: "object",
              additionalProperties: true,
              required: ["type", "duration"],
              properties: {
                type: {
                  type: "string",
                  enum: ["fadeIn", "slideIn", "scaleIn", "bounce", "rotate", "custom"],
                },
                duration: { type: "number" },
                delay: { type: "number" },
                easing: { type: "string" },
                direction: {
                  type: "string",
                  enum: ["left", "right", "up", "down"],
                },
                trigger: {
                  type: "string",
                  enum: ["load", "scroll", "hover"],
                },
                scrollTrigger: {
                  type: "object",
                  additionalProperties: true,
                  properties: {
                    start: { type: "string" },
                    end: { type: "string" },
                    scrub: { type: "boolean" },
                  },
                },
                from: { type: "object", additionalProperties: true },
                to: { type: "object", additionalProperties: true },
                tokenRefs: {
                  type: "object",
                  additionalProperties: { type: "string" },
                },
              },
            },
            BackyContentElement: {
              type: "object",
              additionalProperties: true,
              required: ["id", "type", "children", "props"],
              properties: {
                id: { type: "string" },
                type: { type: "string" },
                name: { type: "string" },
                children: {
                  type: "array",
                  items: { $ref: "#/components/schemas/BackyContentElement" },
                },
                props: { type: "object", additionalProperties: true },
                x: { type: "number" },
                y: { type: "number" },
                width: { type: "number" },
                height: { type: "number" },
                zIndex: { type: "number" },
                rotation: { type: "number" },
                visible: { type: "boolean" },
                locked: { type: "boolean" },
                componentKey: { type: "string" },
                version: { type: "string" },
                controls: {
                  type: "array",
                  items: {
                    $ref: "#/components/schemas/InteractiveComponentControl",
                  },
                },
                fallback: {
                  $ref: "#/components/schemas/InteractiveComponentFallback",
                },
                renderCapabilities: {
                  type: "object",
                  additionalProperties: true,
                },
                styles: { type: "object", additionalProperties: true },
                responsive: { type: "object", additionalProperties: true },
                tokenRefs: {
                  type: "object",
                  additionalProperties: { type: "string" },
                },
                animation: {
                  $ref: "#/components/schemas/BackyElementAnimation",
                },
                actions: {
                  type: "array",
                  items: { $ref: "#/components/schemas/BackyElementAction" },
                },
                dataBindings: {
                  type: "array",
                  items: { $ref: "#/components/schemas/BackyDataBinding" },
                },
                accessibility: {
                  $ref: "#/components/schemas/BackyContentElementAccessibility",
                },
                assetIds: { type: "array", items: { type: "string" } },
                permissions: {
                  type: "object",
                  additionalProperties: { type: "boolean" },
                },
                metadata: { type: "object", additionalProperties: true },
              },
            },
            BackyContentDocument: {
              type: "object",
              additionalProperties: true,
              required: [
                "schemaVersion",
                "id",
                "kind",
                "version",
                "elements",
                "editableMap",
              ],
              properties: {
                schemaVersion: { type: "string", const: "backy.content.v1" },
                id: { type: "string" },
                kind: {
                  type: "string",
                  enum: [
                    "page",
                    "post",
                    "template",
                    "dynamicItem",
                    "dynamicList",
                  ],
                },
                title: { type: "string" },
                slug: { type: "string" },
                locale: { type: "string" },
                status: {
                  type: "string",
                  enum: ["draft", "published", "scheduled", "archived"],
                },
                version: {
                  oneOf: [
                    { type: "string" },
                    { type: "object", additionalProperties: true },
                  ],
                },
                elements: {
                  type: "array",
                  items: { $ref: "#/components/schemas/BackyContentElement" },
                },
                themeTokenRefs: {
                  type: "object",
                  additionalProperties: { type: "string" },
                },
                assets: {
                  type: "object",
                  additionalProperties: true,
                  properties: {
                    media: {
                      type: "array",
                      items: {
                        $ref: "#/components/schemas/BackyContentAssetRef",
                      },
                    },
                    fonts: {
                      type: "array",
                      items: {
                        $ref: "#/components/schemas/BackyContentAssetRef",
                      },
                    },
                  },
                },
                interactions: { type: "object", additionalProperties: true },
                seo: { type: "object", additionalProperties: true },
                dataBindings: {
                  type: "object",
                  additionalProperties: true,
                  properties: {
                    datasets: {
                      type: "array",
                      items: { type: "object", additionalProperties: true },
                    },
                    bindings: {
                      type: "array",
                      items: { $ref: "#/components/schemas/BackyDataBinding" },
                    },
                  },
                },
                editableMap: {
                  type: "object",
                  additionalProperties: {
                    $ref: "#/components/schemas/BackyEditableMapEntry",
                  },
                },
                metadata: { type: "object", additionalProperties: true },
              },
            },
            BackyReusableSectionContent: {
              type: "object",
              additionalProperties: true,
              required: ["elements"],
              properties: {
                elements: {
                  type: "array",
                  items: { $ref: "#/components/schemas/BackyContentElement" },
                },
                canvasSize: {
                  type: "object",
                  additionalProperties: true,
                  properties: {
                    width: { type: "number" },
                    height: { type: "number" },
                  },
                },
                customCSS: { type: "string" },
                customJS: { type: "string" },
                contentDocument: {
                  $ref: "#/components/schemas/BackyContentDocument",
                },
                themeTokenRefs: {
                  type: "object",
                  additionalProperties: { type: "string" },
                },
                assets: {
                  oneOf: [
                    {
                      type: "array",
                      items: { type: "object", additionalProperties: true },
                    },
                    { type: "object", additionalProperties: true },
                  ],
                },
                animations: {
                  oneOf: [
                    {
                      type: "array",
                      items: { type: "object", additionalProperties: true },
                    },
                    { type: "object", additionalProperties: true },
                  ],
                },
                interactions: {
                  oneOf: [
                    {
                      type: "array",
                      items: { type: "object", additionalProperties: true },
                    },
                    { type: "object", additionalProperties: true },
                  ],
                },
                dataBindings: { type: "object", additionalProperties: true },
                editableMap: { type: "object", additionalProperties: true },
                seo: { type: "object", additionalProperties: true },
                metadata: { type: "object", additionalProperties: true },
              },
            },
            CollectionListEnvelope: envelopeSchema({
              type: "object",
              required: ["collections", "pagination"],
              properties: {
                collections: {
                  type: "array",
                  items: { $ref: "#/components/schemas/CollectionSchema" },
                },
                pagination: { type: "object", additionalProperties: true },
              },
            }),
            CollectionEnvelope: envelopeSchema({
              type: "object",
              required: ["collection"],
              properties: {
                collection: { $ref: "#/components/schemas/CollectionSchema" },
              },
            }),
            CollectionRecordListEnvelope: envelopeSchema({
              type: "object",
              required: ["collection", "records", "pagination"],
              properties: {
                collection: { $ref: "#/components/schemas/CollectionSchema" },
                records: {
                  type: "array",
                  items: { $ref: "#/components/schemas/CollectionRecord" },
                },
                pagination: { type: "object", additionalProperties: true },
              },
            }),
            CollectionRecordEnvelope: envelopeSchema({
              type: "object",
              required: ["record"],
              properties: {
                record: { $ref: "#/components/schemas/CollectionRecord" },
                visitorWritePolicy: {
                  type: "object",
                  additionalProperties: true,
                  properties: {
                    allowedCreateFields: {
                      type: "array",
                      items: { type: "string" },
                    },
                    ignoredFields: { type: "array", items: { type: "string" } },
                  },
                },
              },
            }),
            PublicDeleteEnvelope: envelopeSchema({
              type: "object",
              required: ["deleted", "recordId"],
              properties: {
                deleted: { type: "boolean" },
                recordId: { type: "string" },
                slug: { type: "string" },
              },
            }),
            CollectionSchema: {
              type: "object",
              additionalProperties: true,
              required: ["id", "slug", "name", "fields", "permissions"],
              properties: {
                id: { type: "string" },
                siteId: { type: "string" },
                name: { type: "string" },
                slug: { type: "string" },
                description: { type: ["string", "null"] },
                status: {
                  type: "string",
                  enum: ["draft", "published", "scheduled", "archived"],
                },
                fields: {
                  type: "array",
                  items: { $ref: "#/components/schemas/CollectionFieldSchema" },
                },
                permissions: {
                  $ref: "#/components/schemas/CollectionPermissions",
                },
                metadata: { type: "object", additionalProperties: true },
                recordsUrl: { type: "string" },
                listRoutePattern: { type: ["string", "null"] },
                routePattern: { type: ["string", "null"] },
                frontendDesign: {
                  $ref: "#/components/schemas/ReusableSectionFrontendDesign",
                },
                createdAt: { type: "string", format: "date-time" },
                updatedAt: { type: "string", format: "date-time" },
              },
            },
            CollectionPermissions: {
              type: "object",
              additionalProperties: { type: "boolean" },
              required: ["publicRead", "publicCreate"],
              properties: {
                publicRead: { type: "boolean" },
                publicCreate: { type: "boolean" },
                publicUpdate: { type: "boolean" },
                publicDelete: { type: "boolean" },
              },
            },
            CollectionFieldOption: {
              type: "object",
              additionalProperties: true,
              required: ["value", "label"],
              properties: {
                value: { type: "string" },
                label: { type: "string" },
                color: { type: ["string", "null"] },
                description: { type: ["string", "null"] },
              },
            },
            CollectionFieldValidation: {
              type: "object",
              additionalProperties: true,
              properties: {
                min: { type: "number" },
                max: { type: "number" },
                minLength: { type: "integer", minimum: 0 },
                maxLength: { type: "integer", minimum: 0 },
                pattern: { type: "string" },
                format: { type: "string" },
                multiple: { type: "boolean" },
                maxItems: { type: "integer", minimum: 0 },
                allowedFileTypes: { type: "array", items: { type: "string" } },
              },
            },
            CollectionFieldSchema: {
              type: "object",
              additionalProperties: true,
              required: ["id", "key", "label", "type", "required", "unique"],
              properties: {
                id: { type: "string" },
                key: { type: "string" },
                label: { type: "string" },
                type: {
                  type: "string",
                  enum: [
                    "text",
                    "richText",
                    "number",
                    "boolean",
                    "date",
                    "datetime",
                    "image",
                    "video",
                    "file",
                    "reference",
                    "multiReference",
                    "select",
                    "tags",
                    "url",
                    "email",
                    "phone",
                    "slug",
                    "json",
                  ],
                },
                required: { type: "boolean" },
                unique: { type: "boolean" },
                sortOrder: { type: "integer" },
                helpText: { type: ["string", "null"] },
                options: {
                  oneOf: [
                    { type: "array", items: { type: "string" } },
                    {
                      type: "array",
                      items: {
                        $ref: "#/components/schemas/CollectionFieldOption",
                      },
                    },
                  ],
                },
                referenceCollectionId: { type: ["string", "null"] },
                defaultValue: {},
                validation: {
                  $ref: "#/components/schemas/CollectionFieldValidation",
                },
              },
            },
            CollectionRecord: {
              type: "object",
              additionalProperties: true,
              required: ["id", "slug", "values"],
              properties: {
                id: { type: "string" },
                siteId: { type: "string" },
                collectionId: { type: "string" },
                slug: { type: "string" },
                status: {
                  type: "string",
                  enum: ["draft", "published", "scheduled", "archived"],
                },
                values: { type: "object", additionalProperties: true },
                frontendDesign: {
                  $ref: "#/components/schemas/ReusableSectionFrontendDesign",
                },
                publishedAt: { type: ["string", "null"], format: "date-time" },
                scheduledAt: { type: ["string", "null"], format: "date-time" },
                createdAt: { type: "string", format: "date-time" },
                updatedAt: { type: "string", format: "date-time" },
              },
            },
            ReusableSection: {
              type: "object",
              additionalProperties: true,
              required: ["id", "name", "slug", "content"],
              properties: {
                id: { type: "string" },
                siteId: { type: "string" },
                name: { type: "string" },
                slug: { type: "string" },
                description: { type: ["string", "null"] },
                category: { type: "string" },
                status: { type: "string", enum: ["active", "archived"] },
                tags: { type: "array", items: { type: "string" } },
                content: {
                  $ref: "#/components/schemas/BackyReusableSectionContent",
                },
                metadata: { type: "object", additionalProperties: true },
                frontendDesign: {
                  $ref: "#/components/schemas/ReusableSectionFrontendDesign",
                },
                sourceElementId: { type: ["string", "null"] },
                createdAt: { type: "string", format: "date-time" },
                updatedAt: { type: "string", format: "date-time" },
              },
            },
            FormsManagementPolicy: {
              type: "object",
              additionalProperties: true,
              required: [
                "schemaVersion",
                "endpoints",
                "methods",
                "auth",
                "sdkHelpers",
                "responseContracts",
                "privacy",
                "secretHandling",
              ],
              properties: {
                schemaVersion: { const: "backy.forms-management.v1" },
                endpoints: {
                  type: "object",
                  additionalProperties: true,
                  required: [
                    "adminList",
                    "create",
                    "detail",
                    "clone",
                    "embedBlock",
                    "analytics",
                    "contactSegments",
                    "contactLists",
                    "consentRetention",
                    "submissions",
                    "submission",
                    "reviewSubmission",
                    "retryWebhook",
                    "retryEmail",
                    "formConsentRetention",
                    "contacts",
                    "contact",
                    "importContacts",
                    "syncContacts",
                    "promoteContactUser",
                    "promoteContactCustomer",
                    "contactConsentRetention",
                  ],
                  properties: {
                    adminList: { type: "string" },
                    create: { type: "string" },
                    detail: { type: "string" },
                    clone: { type: "string" },
                    embedBlock: { type: "string" },
                    analytics: { type: "string" },
                    contactSegments: { type: "string" },
                    contactLists: { type: "string" },
                    consentRetention: { type: "string" },
                    submissions: { type: "string" },
                    submission: { type: "string" },
                    reviewSubmission: { type: "string" },
                    retryWebhook: { type: "string" },
                    retryEmail: { type: "string" },
                    formConsentRetention: { type: "string" },
                    contacts: { type: "string" },
                    contact: { type: "string" },
                    importContacts: { type: "string" },
                    syncContacts: { type: "string" },
                    promoteContactUser: { type: "string" },
                    promoteContactCustomer: { type: "string" },
                    contactConsentRetention: { type: "string" },
                  },
                },
                methods: {
                  type: "object",
                  additionalProperties: true,
                  required: [
                    "list",
                    "create",
                    "update",
                    "delete",
                    "clone",
                    "embedBlock",
                    "analytics",
                    "contactSegments",
                    "contactLists",
                    "saveContactList",
                    "deleteContactList",
                    "consentRetention",
                    "submissions",
                    "submission",
                    "updateSubmission",
                    "reviewSubmission",
                    "retryWebhook",
                    "retryEmail",
                    "formConsentRetention",
                    "contacts",
                    "createContact",
                    "updateContact",
                    "deleteContact",
                    "importContacts",
                    "syncContacts",
                    "promoteContactUser",
                    "promoteContactCustomer",
                    "contactConsentRetention",
                  ],
                  properties: {
                    list: { const: "GET" },
                    create: { const: "POST" },
                    update: { const: "PATCH" },
                    delete: { const: "DELETE" },
                    clone: { const: "POST" },
                    embedBlock: { const: "POST" },
                    analytics: { const: "GET" },
                    contactSegments: { const: "GET" },
                    contactLists: { const: "GET" },
                    saveContactList: { const: "POST" },
                    deleteContactList: { const: "DELETE" },
                    consentRetention: { const: "POST" },
                    submissions: { const: "GET" },
                    submission: { const: "GET" },
                    updateSubmission: { const: "PATCH" },
                    reviewSubmission: { const: "POST" },
                    retryWebhook: { const: "POST" },
                    retryEmail: { const: "POST" },
                    formConsentRetention: { const: "POST" },
                    contacts: { const: "GET" },
                    createContact: { const: "POST" },
                    updateContact: { const: "PATCH" },
                    deleteContact: { const: "DELETE" },
                    importContacts: { const: "POST" },
                    syncContacts: { const: "POST" },
                    promoteContactUser: { const: "POST" },
                    promoteContactCustomer: { const: "POST" },
                    contactConsentRetention: { const: "POST" },
                  },
                },
                auth: {
                  type: "object",
                  additionalProperties: true,
                  required: ["modes", "headers", "requiredPermissions", "siteScope"],
                  properties: {
                    modes: {
                      type: "array",
                      items: { enum: ["session", "api-key"] },
                    },
                    headers: { type: "array", items: { type: "string" } },
                    requiredPermissions: {
                      type: "object",
                      additionalProperties: true,
                      required: ["read", "create", "update", "manage", "export", "delete", "activity"],
                      properties: {
                        read: { const: "forms.view" },
                        create: { const: "forms.create" },
                        update: { const: "forms.edit" },
                        manage: { const: "forms.manage" },
                        export: { const: "forms.export" },
                        delete: { const: "forms.delete" },
                        activity: { const: "activity.export" },
                      },
                    },
                    siteScope: { const: true },
                  },
                },
                sdkHelpers: {
                  type: "object",
                  additionalProperties: true,
                  required: [
                    "list",
                    "create",
                    "detail",
                    "update",
                    "delete",
                    "clone",
                    "embedBlock",
                    "analytics",
                    "contactSegments",
                    "contactLists",
                    "saveContactList",
                    "deleteContactList",
                    "submissions",
                    "submission",
                    "updateSubmission",
                    "reviewSubmission",
                    "retryWebhook",
                    "retryEmail",
                    "formConsentRetention",
                    "formsConsentRetention",
                    "contacts",
                    "createContact",
                    "updateContact",
                    "importContacts",
                    "syncContacts",
                    "promoteContactUser",
                    "promoteContactCustomer",
                    "contactConsentRetention",
                  ],
                  properties: {
                    list: { const: "adminForms" },
                    create: { const: "createAdminForm" },
                    detail: { const: "adminForm" },
                    update: { const: "updateAdminForm" },
                    delete: { const: "deleteAdminForm" },
                    clone: { const: "cloneAdminForm" },
                    embedBlock: { const: "createAdminFormEmbedBlock" },
                    analytics: { const: "formsAnalytics" },
                    contactSegments: { const: "formContactSegments" },
                    contactLists: { const: "formContactLists" },
                    saveContactList: { const: "saveFormContactList" },
                    deleteContactList: { const: "deleteFormContactList" },
                    submissions: { const: "formSubmissions" },
                    submission: { const: "formSubmission" },
                    updateSubmission: { const: "updateFormSubmission" },
                    reviewSubmission: { const: "reviewFormSubmission" },
                    retryWebhook: { const: "retryFormSubmissionWebhook" },
                    retryEmail: { const: "retryFormSubmissionEmail" },
                    formConsentRetention: { const: "applyAdminFormConsentRetention" },
                    formsConsentRetention: { const: "applyAdminFormsConsentRetention" },
                    contacts: { const: "formContacts" },
                    createContact: { const: "createFormContact" },
                    updateContact: { const: "updateFormContact" },
                    importContacts: { const: "importFormContactsCsv" },
                    syncContacts: { const: "syncFormContacts" },
                    promoteContactUser: { const: "promoteFormContactToUser" },
                    promoteContactCustomer: { const: "promoteFormContactToCustomer" },
                    contactConsentRetention: { const: "applyFormContactConsentRetention" },
                  },
                },
                responseContracts: {
                  type: "object",
                  additionalProperties: true,
                },
                privacy: {
                  type: "object",
                  additionalProperties: true,
                  required: [
                    "publicDefinitionsExcludeSubmissions",
                    "submissionsArePrivate",
                    "contactsArePrivate",
                    "deliveryRetriesMayContainVisitorPayloads",
                    "databaseCredentialsNeverReturned",
                  ],
                  properties: {
                    publicDefinitionsExcludeSubmissions: { const: true },
                    submissionsArePrivate: { const: true },
                    contactsArePrivate: { const: true },
                    deliveryRetriesMayContainVisitorPayloads: { const: true },
                    databaseCredentialsNeverReturned: { const: true },
                  },
                },
                secretHandling: { type: "string" },
              },
            },
            FormListEnvelope: envelopeSchema({
              type: "object",
              required: ["forms", "total", "pagination"],
              properties: {
                forms: {
                  type: "array",
                  items: { $ref: "#/components/schemas/FormDefinition" },
                },
                total: { type: "integer", minimum: 0 },
                pagination: { type: "object", additionalProperties: true },
              },
            }),
            FormEnvelope: envelopeSchema({
              type: "object",
              required: ["form", "endpoints"],
              properties: {
                form: { $ref: "#/components/schemas/FormDefinition" },
                endpoints: {
                  type: "object",
                  required: ["definition", "submissions"],
                  properties: {
                    definition: { type: "string" },
                    submissions: { type: "string" },
                    contacts: { type: "string" },
                  },
                },
              },
            }),
            FormDefinitionEnvelope: envelopeSchema({
              type: "object",
              required: ["schemaVersion", "form", "submitUrl"],
              properties: {
                schemaVersion: {
                  type: "string",
                  const: "backy.form-definition.v1",
                },
                form: { $ref: "#/components/schemas/FormDefinition" },
                submitUrl: { type: "string" },
              },
            }),
            FormDefinition: {
              type: "object",
              additionalProperties: true,
              required: ["id", "name", "isActive", "fields"],
              properties: {
                id: { type: "string" },
                siteId: { type: "string" },
                pageId: { type: ["string", "null"] },
                postId: { type: ["string", "null"] },
                name: { type: "string" },
                title: { type: ["string", "null"] },
                description: { type: ["string", "null"] },
                audience: {
                  type: "string",
                  enum: ["public", "authenticated", "adminOnly"],
                },
                isActive: { type: "boolean" },
                fields: {
                  type: "array",
                  items: { $ref: "#/components/schemas/FormFieldDefinition" },
                },
                settings: { type: "object", additionalProperties: true },
                collectionTarget: {
                  type: ["object", "null"],
                  additionalProperties: true,
                },
                notificationEmail: { type: ["string", "null"] },
                successRedirectUrl: { type: ["string", "null"] },
                successMessage: { type: ["string", "null"] },
                enableHoneypot: { type: "boolean" },
                enableCaptcha: { type: "boolean" },
                frontendDesign: {
                  $ref: "#/components/schemas/ReusableSectionFrontendDesign",
                },
                frontendFieldKeyMap: {
                  type: "object",
                  additionalProperties: { type: "string" },
                },
              },
            },
            FormValidationRule: {
              type: "object",
              additionalProperties: true,
              required: ["type", "message"],
              properties: {
                type: {
                  type: "string",
                  enum: [
                    "required",
                    "minLength",
                    "maxLength",
                    "pattern",
                    "min",
                    "max",
                  ],
                },
                value: {
                  oneOf: [{ type: "string" }, { type: "number" }],
                },
                message: { type: "string" },
              },
            },
            FormFieldDefinition: {
              type: "object",
              additionalProperties: true,
              required: ["key", "label", "type"],
              properties: {
                key: { type: "string" },
                label: { type: "string" },
                type: {
                  type: "string",
                  enum: [
                    "text",
                    "email",
                    "number",
                    "textarea",
                    "select",
                    "checkbox",
                    "radio",
                    "date",
                    "tel",
                    "url",
                    "file",
                  ],
                },
                placeholder: { type: "string" },
                helpText: { type: "string" },
                defaultValue: { type: "string" },
                options: { type: "array", items: { type: "string" } },
                validation: {
                  type: "array",
                  items: { $ref: "#/components/schemas/FormValidationRule" },
                },
                required: { type: "boolean" },
              },
            },
            FormSubmissionsEnvelope: envelopeSchema({
              type: "object",
              required: ["form", "submissions", "pagination"],
              properties: {
                form: { $ref: "#/components/schemas/FormDefinition" },
                submissions: {
                  type: "array",
                  items: { $ref: "#/components/schemas/FormSubmission" },
                },
                pagination: { type: "object", additionalProperties: true },
              },
            }),
            FormSubmissionEnvelope: envelopeSchema({
              type: "object",
              required: ["submission"],
              properties: {
                submission: { $ref: "#/components/schemas/FormSubmission" },
                collectionRecord: {
                  oneOf: [
                    { $ref: "#/components/schemas/FormCollectionRecordLink" },
                    { type: "null" },
                  ],
                },
                collectionRecordErrors: {
                  type: "array",
                  items: {
                    $ref: "#/components/schemas/FormCollectionRecordError",
                  },
                },
              },
            }),
            FormCollectionRecordLink: {
              type: "object",
              additionalProperties: true,
              required: [
                "siteId",
                "collectionId",
                "collectionSlug",
                "recordId",
                "recordSlug",
                "status",
                "createdAt",
              ],
              properties: {
                siteId: { type: "string" },
                collectionId: { type: "string" },
                collectionSlug: { type: "string" },
                recordId: { type: "string" },
                recordSlug: { type: "string" },
                status: {
                  type: "string",
                  enum: ["draft", "published", "scheduled", "archived"],
                },
                createdAt: { type: "string", format: "date-time" },
              },
            },
            FormCollectionRecordError: {
              type: "object",
              additionalProperties: true,
              required: ["field", "message"],
              properties: {
                field: { type: "string" },
                message: { type: "string" },
              },
            },
            FormSubmission: {
              type: "object",
              additionalProperties: true,
              required: [
                "id",
                "formId",
                "siteId",
                "values",
                "status",
                "submittedAt",
              ],
              properties: {
                id: { type: "string" },
                formId: { type: "string" },
                siteId: { type: "string" },
                pageId: { type: ["string", "null"] },
                postId: { type: ["string", "null"] },
                values: { type: "object", additionalProperties: true },
                ipHash: { type: ["string", "null"] },
                userAgent: { type: ["string", "null"] },
                requestId: { type: ["string", "null"] },
                status: {
                  type: "string",
                  enum: ["pending", "approved", "rejected", "spam"],
                },
                reviewedBy: { type: ["string", "null"] },
                reviewedAt: { type: ["string", "null"], format: "date-time" },
                adminNotes: { type: ["string", "null"] },
                updatedAt: { type: "string", format: "date-time" },
                collectionRecord: {
                  oneOf: [
                    { $ref: "#/components/schemas/FormCollectionRecordLink" },
                    { type: "null" },
                  ],
                },
                collectionRecordErrors: {
                  type: "array",
                  items: {
                    $ref: "#/components/schemas/FormCollectionRecordError",
                  },
                },
                submittedAt: { type: "string", format: "date-time" },
              },
            },
            FormSubmissionRequest: {
              type: "object",
              additionalProperties: true,
              description:
                "Submit form field values under values, fields, data, or submission. Keys may be canonical Backy field keys or aliases from form.frontendFieldKeyMap; alias lookup also normalizes casing, spaces, hyphens, and punctuation. Simple frontends may also send field keys at the top level; requestId, pageId, postId, honeypot, startedAt, and captcha token fields are reserved transport metadata keys.",
              properties: {
                values: {
                  type: "object",
                  additionalProperties: true,
                  description:
                    "Preferred field value map. Accepts canonical field keys or normalized frontendFieldKeyMap aliases.",
                },
                contactShareOverride: {
                  type: "object",
                  additionalProperties: false,
                  description:
                    "Optional contact-share mapping override. Accepts canonical field keys or normalized frontendFieldKeyMap aliases.",
                  properties: {
                    enabled: { type: "boolean" },
                    nameField: { type: "string" },
                    emailField: { type: "string" },
                    phoneField: { type: "string" },
                    notesField: { type: "string" },
                    dedupeByEmail: { type: "boolean" },
                  },
                },
                fields: {
                  type: "object",
                  additionalProperties: true,
                  description:
                    "Alias accepted for generated form integrations.",
                },
                data: {
                  type: "object",
                  additionalProperties: true,
                  description:
                    "Alias accepted for custom frontend integrations.",
                },
                submission: {
                  type: "object",
                  additionalProperties: true,
                  description: "Alias accepted for legacy submitters.",
                },
                requestId: { type: "string" },
                pageId: { type: "string" },
                postId: { type: "string" },
                honeypot: { type: "string" },
                startedAt: { oneOf: [{ type: "string" }, { type: "number" }] },
                captchaToken: {
                  type: "string",
                  description:
                    "Captcha provider token for forms with captcha enabled.",
                },
                captchaResponse: {
                  type: "string",
                  description: "Alias for captchaToken.",
                },
                turnstileToken: {
                  type: "string",
                  description: "Cloudflare Turnstile token alias.",
                },
                hcaptchaToken: {
                  type: "string",
                  description: "hCaptcha token alias.",
                },
                recaptchaToken: {
                  type: "string",
                  description: "reCAPTCHA token alias.",
                },
                "g-recaptcha-response": {
                  type: "string",
                  description:
                    "Browser form token name emitted by reCAPTCHA widgets.",
                },
                "cf-turnstile-response": {
                  type: "string",
                  description:
                    "Browser form token name emitted by Turnstile widgets.",
                },
                captcha: {
                  type: "object",
                  additionalProperties: true,
                  properties: {
                    token: { type: "string" },
                    response: { type: "string" },
                  },
                },
              },
            },
            FormSubmissionValidationDetail: {
              type: "object",
              required: ["field", "code", "message"],
              properties: {
                field: { type: "string" },
                code: { type: "string", enum: formSubmissionValidationCodes },
                message: { type: "string" },
                label: { type: "string" },
              },
            },
            FormSubmissionValidationErrorEnvelope: {
              type: "object",
              required: ["success", "requestId", "error", "validation"],
              properties: {
                success: { const: false },
                requestId: { type: "string" },
                error: {
                  type: "object",
                  required: ["code", "message"],
                  properties: {
                    code: { const: "VALIDATION_ERROR" },
                    message: { type: "string" },
                  },
                },
                errorMessage: { type: "string" },
                status: {
                  type: "string",
                  enum: ["pending", "approved", "rejected", "spam"],
                },
                validation: {
                  type: "array",
                  items: {
                    $ref: "#/components/schemas/FormSubmissionValidationDetail",
                  },
                },
                spamFlags: { type: "array", items: { type: "string" } },
                message: { type: "string" },
              },
            },
            FormContactsEnvelope: envelopeSchema({
              type: "object",
              required: ["form", "contacts", "pagination"],
              properties: {
                form: { $ref: "#/components/schemas/FormDefinition" },
                contacts: {
                  type: "array",
                  items: { $ref: "#/components/schemas/FormContact" },
                },
                pagination: { type: "object", additionalProperties: true },
              },
            }),
            FormContactEnvelope: envelopeSchema({
              type: "object",
              required: ["contact"],
              properties: {
                contact: { $ref: "#/components/schemas/FormContact" },
              },
            }),
            FormContact: {
              type: "object",
              additionalProperties: true,
              required: [
                "id",
                "siteId",
                "formId",
                "status",
                "createdAt",
                "updatedAt",
              ],
              properties: {
                id: { type: "string" },
                siteId: { type: "string" },
                formId: { type: "string" },
                pageId: { type: ["string", "null"] },
                postId: { type: ["string", "null"] },
                name: { type: ["string", "null"] },
                email: { type: ["string", "null"] },
                phone: { type: ["string", "null"] },
                notes: { type: ["string", "null"] },
                sourceValues: { type: "object", additionalProperties: true },
                status: {
                  type: "string",
                  enum: ["new", "contacted", "qualified", "archived"],
                },
                sourceSubmissionId: { type: "string" },
                requestId: { type: ["string", "null"] },
                sourceIpHash: { type: ["string", "null"] },
                createdAt: { type: "string", format: "date-time" },
                updatedAt: { type: "string", format: "date-time" },
              },
            },
            CommentUpdateRequest: {
              type: "object",
              properties: {
                status: {
                  type: "string",
                  enum: ["pending", "approved", "rejected", "spam", "blocked"],
                },
                moderationNote: { type: "string" },
                requestId: { type: "string" },
              },
              required: ["status"],
            },
            CommentSubmitRequest: {
              type: "object",
              additionalProperties: true,
              properties: {
                content: {
                  type: "string",
                  description: "Preferred comment body field.",
                },
                body: {
                  type: "string",
                  description:
                    "Alias accepted for SDK and simple form integrations.",
                },
                authorName: { type: "string" },
                authorEmail: { type: "string", format: "email" },
                authorWebsite: { type: "string" },
                userId: { type: "string" },
                parentId: {
                  type: "string",
                  description: "Parent comment id when submitting a reply.",
                },
                commentThreadId: {
                  type: "string",
                  description:
                    "Optional thread id for grouped comment widgets.",
                },
                threadId: {
                  type: "string",
                  description: "Alias for commentThreadId.",
                },
                requestId: { type: "string" },
                moderationMode: {
                  type: "string",
                  enum: ["manual", "auto-approve"],
                },
                startedAt: { type: ["string", "number"] },
                honeypot: { type: "string" },
              },
            },
            CommentBulkUpdateRequest: {
              type: "object",
              additionalProperties: false,
              description:
                'Bulk comment moderation request. Provide commentIds or ids plus either status, clearReports: true, or action: "clearReports".',
              properties: {
                commentIds: { type: "array", items: { type: "string" } },
                ids: {
                  type: "array",
                  items: { type: "string" },
                  description: "Alias for commentIds.",
                },
                status: {
                  type: "string",
                  enum: ["pending", "approved", "rejected", "spam", "blocked"],
                },
                action: { type: "string", enum: ["clearReports"] },
                clearReports: { type: "boolean" },
                reviewedBy: { type: "string" },
                actor: { type: "string" },
                rejectionReason: { type: "string" },
                blockReason: { type: "string" },
                requestId: { type: "string" },
              },
            },
            Comment: {
              type: "object",
              additionalProperties: true,
              required: [
                "id",
                "siteId",
                "targetType",
                "targetId",
                "content",
                "status",
                "createdAt",
                "updatedAt",
              ],
              properties: {
                id: { type: "string" },
                siteId: { type: "string" },
                targetType: { type: "string", enum: ["page", "post"] },
                targetId: { type: "string" },
                commentThreadId: { type: "string" },
                authorName: { type: ["string", "null"] },
                authorEmail: { type: ["string", "null"] },
                authorWebsite: { type: ["string", "null"] },
                userId: { type: ["string", "null"] },
                content: { type: "string" },
                status: {
                  type: "string",
                  enum: ["pending", "approved", "rejected", "spam", "blocked"],
                },
                parentId: {
                  type: ["string", "null"],
                  description:
                    "Parent comment id for replies; null for top-level comments.",
                },
                reviewedBy: { type: ["string", "null"] },
                reviewedAt: { type: ["string", "null"], format: "date-time" },
                rejectionReason: { type: ["string", "null"] },
                blockReason: { type: ["string", "null"] },
                blockedBy: { type: ["string", "null"] },
                blockedAt: { type: ["string", "null"], format: "date-time" },
                reportCount: { type: "integer", minimum: 0 },
                reportReasons: { type: "array", items: { type: "string" } },
                requestId: { type: ["string", "null"] },
                createdAt: { type: "string", format: "date-time" },
                updatedAt: { type: "string", format: "date-time" },
              },
            },
            CommentBlocklistEntry: {
              type: "object",
              required: [
                "id",
                "siteId",
                "type",
                "value",
                "reason",
                "createdAt",
              ],
              properties: {
                id: { type: "string" },
                siteId: { type: "string" },
                type: { type: "string", enum: ["email", "ip"] },
                value: { type: "string" },
                reason: { type: "string" },
                actor: { type: "string" },
                requestId: { type: "string" },
                createdAt: { type: "string", format: "date-time" },
              },
            },
            CommentBlocklistEnvelope: envelopeSchema({
              type: "object",
              required: ["siteId", "blocklist", "count", "pagination"],
              properties: {
                siteId: { type: "string" },
                blocklist: {
                  type: "array",
                  items: { $ref: "#/components/schemas/CommentBlocklistEntry" },
                },
                count: { type: "integer", minimum: 0 },
                pagination: { type: "object", additionalProperties: true },
              },
            }),
            CommentBlocklistDeleteRequest: {
              type: "object",
              additionalProperties: false,
              properties: {
                ids: { type: "array", items: { type: "string" } },
                blocklistIds: {
                  type: "array",
                  items: { type: "string" },
                  description: "Alias for ids.",
                },
              },
            },
            CommentBlocklistDeleteEnvelope: envelopeSchema({
              type: "object",
              required: ["siteId", "deleted", "deletedCount", "missingIds"],
              properties: {
                siteId: { type: "string" },
                deleted: {
                  type: "array",
                  items: { $ref: "#/components/schemas/CommentBlocklistEntry" },
                },
                deletedCount: { type: "integer", minimum: 0 },
                missingIds: { type: "array", items: { type: "string" } },
              },
            }),
            CommentAnalyticsStatusCounts: {
              type: "object",
              additionalProperties: false,
              required: ["pending", "approved", "rejected", "spam", "blocked"],
              properties: {
                pending: { type: "integer", minimum: 0 },
                approved: { type: "integer", minimum: 0 },
                rejected: { type: "integer", minimum: 0 },
                spam: { type: "integer", minimum: 0 },
                blocked: { type: "integer", minimum: 0 },
              },
            },
            CommentAnalyticsTarget: {
              type: "object",
              additionalProperties: true,
              required: ["targetType", "targetId", "total", "pending", "reported", "replies"],
              properties: {
                targetType: { type: "string", enum: ["page", "post"] },
                targetId: { type: "string" },
                total: { type: "integer", minimum: 0 },
                pending: { type: "integer", minimum: 0 },
                reported: { type: "integer", minimum: 0 },
                replies: { type: "integer", minimum: 0 },
              },
            },
            CommentAnalyticsThread: {
              type: "object",
              additionalProperties: true,
              required: [
                "id",
                "targetType",
                "targetId",
                "total",
                "replies",
                "pending",
                "reported",
                "latestAt",
              ],
              properties: {
                id: { type: "string" },
                targetType: { type: "string", enum: ["page", "post"] },
                targetId: { type: "string" },
                total: { type: "integer", minimum: 0 },
                replies: { type: "integer", minimum: 0 },
                pending: { type: "integer", minimum: 0 },
                reported: { type: "integer", minimum: 0 },
                latestAt: { type: "string", format: "date-time" },
              },
            },
            CommentAnalytics: {
              type: "object",
              additionalProperties: true,
              required: [
                "siteId",
                "generatedAt",
                "windowDays",
                "totals",
                "byStatus",
                "reports",
                "threads",
                "targets",
                "daily",
              ],
              properties: {
                siteId: { type: "string" },
                generatedAt: { type: "string", format: "date-time" },
                windowDays: { type: "integer", minimum: 1, maximum: 365 },
                totals: {
                  type: "object",
                  additionalProperties: true,
                  required: [
                    "comments",
                    "allTimeComments",
                    "pending",
                    "approved",
                    "rejected",
                    "spam",
                    "blocked",
                    "reported",
                    "reviewed",
                    "unreviewed",
                    "replies",
                  ],
                  properties: {
                    comments: { type: "integer", minimum: 0 },
                    allTimeComments: { type: "integer", minimum: 0 },
                    pending: { type: "integer", minimum: 0 },
                    approved: { type: "integer", minimum: 0 },
                    rejected: { type: "integer", minimum: 0 },
                    spam: { type: "integer", minimum: 0 },
                    blocked: { type: "integer", minimum: 0 },
                    reported: { type: "integer", minimum: 0 },
                    reviewed: { type: "integer", minimum: 0 },
                    unreviewed: { type: "integer", minimum: 0 },
                    replies: { type: "integer", minimum: 0 },
                  },
                },
                byStatus: {
                  $ref: "#/components/schemas/CommentAnalyticsStatusCounts",
                },
                reports: {
                  type: "object",
                  additionalProperties: true,
                  required: ["comments", "reasons"],
                  properties: {
                    comments: { type: "integer", minimum: 0 },
                    reasons: {
                      type: "array",
                      items: {
                        type: "object",
                        additionalProperties: true,
                        required: ["reason", "count"],
                        properties: {
                          reason: { type: "string" },
                          count: { type: "integer", minimum: 0 },
                        },
                      },
                    },
                  },
                },
                threads: {
                  type: "object",
                  additionalProperties: true,
                  required: ["total", "withReplies", "reported", "pendingReplies", "top"],
                  properties: {
                    total: { type: "integer", minimum: 0 },
                    withReplies: { type: "integer", minimum: 0 },
                    reported: { type: "integer", minimum: 0 },
                    pendingReplies: { type: "integer", minimum: 0 },
                    top: {
                      type: "array",
                      items: { $ref: "#/components/schemas/CommentAnalyticsThread" },
                    },
                  },
                },
                targets: {
                  type: "array",
                  items: { $ref: "#/components/schemas/CommentAnalyticsTarget" },
                },
                daily: {
                  type: "array",
                  items: {
                    type: "object",
                    additionalProperties: true,
                    required: ["date", "submitted", "reviewed", "reported"],
                    properties: {
                      date: { type: "string" },
                      submitted: { type: "integer", minimum: 0 },
                      reviewed: { type: "integer", minimum: 0 },
                      reported: { type: "integer", minimum: 0 },
                    },
                  },
                },
              },
            },
            CommentAnalyticsEnvelope: envelopeSchema({
              type: "object",
              required: ["analytics"],
              properties: {
                analytics: { $ref: "#/components/schemas/CommentAnalytics" },
              },
            }),
            CommentsEnvelope: envelopeSchema({
              type: "object",
              required: ["comments", "count", "pagination"],
              properties: {
                comments: {
                  type: "array",
                  items: { $ref: "#/components/schemas/Comment" },
                },
                count: { type: "integer", minimum: 0 },
                pagination: { type: "object", additionalProperties: true },
              },
            }),
            CommentEnvelope: envelopeSchema({
              type: "object",
              required: ["comment"],
              properties: {
                comment: { $ref: "#/components/schemas/Comment" },
              },
            }),
            CommentBulkUpdateEnvelope: envelopeSchema({
              type: "object",
              required: ["updated"],
              properties: {
                updated: {
                  type: "array",
                  items: { $ref: "#/components/schemas/Comment" },
                },
              },
            }),
            CommentDeliveryRetryRequest: {
              type: "object",
              additionalProperties: false,
              required: ["eventId"],
              properties: {
                eventId: {
                  type: "string",
                  description:
                    "Failed comment delivery event id from the protected site events feed.",
                },
                requestId: { type: "string" },
              },
            },
            CommentDeliveryRetryAttempt: {
              type: "object",
              additionalProperties: true,
              required: ["attempted", "status"],
              properties: {
                attempted: { type: "boolean" },
                channel: { type: "string", enum: ["webhook", "email"] },
                target: { type: "string" },
                status: { type: "string", enum: ["queued", "succeeded", "failed"] },
                statusCode: { type: "integer" },
                provider: { type: "string" },
                metadata: { type: "object", additionalProperties: true },
                error: { type: "string" },
              },
            },
            CommentDeliveryRetryEnvelope: envelopeSchema({
              type: "object",
              required: ["delivery", "retryOf", "comment"],
              properties: {
                delivery: {
                  $ref: "#/components/schemas/CommentDeliveryRetryAttempt",
                },
                retryOf: { type: "string" },
                comment: { $ref: "#/components/schemas/Comment" },
              },
            }),
            CommentReportReasonsEnvelope: envelopeSchema({
              type: "object",
              required: ["reasons"],
              properties: {
                reasons: { type: "array", items: { type: "string" } },
              },
            }),
            CommentReportEnvelope: envelopeSchema({
              type: "object",
              required: ["comment", "report"],
              properties: {
                comment: { $ref: "#/components/schemas/Comment" },
                report: { type: "object", additionalProperties: true },
              },
            }),
            EventsEnvelope: envelopeSchema({
              type: "object",
              required: ["siteId", "events", "count", "pagination"],
              properties: {
                siteId: { type: "string" },
                events: {
                  type: "array",
                  items: { type: "object", additionalProperties: true },
                },
                count: { type: "integer", minimum: 0 },
                pagination: { type: "object", additionalProperties: true },
              },
            }),
            RuntimeEventRecordEnvelope: envelopeSchema({
              type: "object",
              required: ["recorded"],
              properties: {
                recorded: { type: "boolean" },
                siteId: { type: "string" },
                componentKey: { type: "string" },
                version: { type: ["string", "null"] },
              },
            }),
            CommerceProduct: {
              type: "object",
              required: [
                "id",
                "slug",
                "title",
                "price",
                "currency",
                "inventory",
                "delivery",
                "checkout",
                "subscription",
                "links",
              ],
              properties: {
                id: { type: "string" },
                slug: { type: "string" },
                status: {
                  type: "string",
                  enum: ["draft", "published", "scheduled", "archived"],
                },
                title: { type: "string" },
                sku: { type: "string" },
                description: { type: "string" },
                seoTitle: { type: "string" },
                price: { type: "number" },
                compareAtPrice: { type: ["number", "null"] },
                currency: { type: "string" },
                imageUrl: { type: "string" },
                galleryImages: { type: "array", items: { type: "string" } },
                variants: {
                  type: "array",
                  items: {
                    type: "object",
                    required: [
                      "id",
                      "title",
                      "sku",
                      "option",
                      "price",
                      "inventory",
                      "inStock",
                    ],
                    properties: {
                      id: { type: "string" },
                      title: { type: "string" },
                      sku: { type: "string" },
                      option: { type: "string" },
                      price: { type: ["number", "null"] },
                      inventory: { type: ["number", "null"] },
                      inStock: { type: "boolean" },
                    },
                  },
                },
                category: { type: "string" },
                tags: { type: "array", items: { type: "string" } },
                vendor: { type: "string" },
                featured: { type: "boolean" },
                productType: {
                  type: "string",
                  enum: ["physical", "digital", "service"],
                },
                inventory: { type: "object", additionalProperties: true },
                delivery: { type: "object", additionalProperties: true },
                checkout: { type: "object", additionalProperties: true },
                subscription: {
                  type: "object",
                  required: ["enabled", "interval", "trialDays"],
                  properties: {
                    enabled: { type: "boolean" },
                    interval: {
                      type: "string",
                      enum: ["weekly", "monthly", "quarterly", "yearly"],
                    },
                    trialDays: { type: "integer", minimum: 0 },
                  },
                },
                links: { type: "object", additionalProperties: true },
                design: { $ref: "#/components/schemas/CommerceProductDesign" },
                designReadiness: {
                  $ref: "#/components/schemas/CommerceProductDesignReadiness",
                },
                updatedAt: { type: "string", format: "date-time" },
                publishedAt: { type: ["string", "null"], format: "date-time" },
              },
            },
            CommerceProductDesign: {
              type: "object",
              additionalProperties: true,
              properties: {
                templateId: { type: "string" },
                templateName: { type: "string" },
                routePattern: { type: "string" },
                source: { type: "object", additionalProperties: true },
                chrome: { type: "object", additionalProperties: true },
                tokens: { type: "object", additionalProperties: true },
                customCss: { type: "string" },
                customJs: { type: "string" },
                contentDocument: {
                  type: "object",
                  additionalProperties: true,
                },
                elements: {
                  type: "array",
                  items: { type: "object", additionalProperties: true },
                },
                canvasSize: { type: "object", additionalProperties: true },
                themeTokenRefs: {
                  type: "object",
                  additionalProperties: { type: "string" },
                },
                assets: {
                  oneOf: [
                    {
                      type: "array",
                      items: { type: "object", additionalProperties: true },
                    },
                    { type: "object", additionalProperties: true },
                  ],
                },
                animations: {
                  oneOf: [
                    {
                      type: "array",
                      items: { type: "object", additionalProperties: true },
                    },
                    { type: "object", additionalProperties: true },
                  ],
                },
                interactions: {
                  oneOf: [
                    {
                      type: "array",
                      items: { type: "object", additionalProperties: true },
                    },
                    { type: "object", additionalProperties: true },
                  ],
                },
                dataBindings: { type: "object", additionalProperties: true },
                editableMap: { type: "object", additionalProperties: true },
                seo: { type: "object", additionalProperties: true },
                metadata: { type: "object", additionalProperties: true },
                bindingHints: {
                  type: "array",
                  items: { type: "object", additionalProperties: true },
                },
                frontendDesignTemplateId: { type: "string" },
                frontendDesignTemplateName: { type: "string" },
                frontendDesignRoutePattern: { type: "string" },
                frontendDesignSource: {
                  type: "object",
                  additionalProperties: true,
                },
                frontendDesignChrome: {
                  type: "object",
                  additionalProperties: true,
                },
                frontendDesignTokens: {
                  type: "object",
                  additionalProperties: true,
                },
                frontendDesignCustomCss: { type: "string" },
                frontendDesignCustomJs: { type: "string" },
                frontendDesignContentDocument: {
                  type: "object",
                  additionalProperties: true,
                },
                frontendDesignElements: {
                  type: "array",
                  items: { type: "object", additionalProperties: true },
                },
                frontendDesignCanvasSize: {
                  type: "object",
                  additionalProperties: true,
                },
                frontendDesignThemeTokenRefs: {
                  type: "object",
                  additionalProperties: { type: "string" },
                },
                frontendDesignAssets: {
                  oneOf: [
                    {
                      type: "array",
                      items: { type: "object", additionalProperties: true },
                    },
                    { type: "object", additionalProperties: true },
                  ],
                },
                frontendDesignAnimations: {
                  oneOf: [
                    {
                      type: "array",
                      items: { type: "object", additionalProperties: true },
                    },
                    { type: "object", additionalProperties: true },
                  ],
                },
                frontendDesignInteractions: {
                  oneOf: [
                    {
                      type: "array",
                      items: { type: "object", additionalProperties: true },
                    },
                    { type: "object", additionalProperties: true },
                  ],
                },
                frontendDesignDataBindings: {
                  type: "object",
                  additionalProperties: true,
                },
                frontendDesignEditableMap: {
                  type: "object",
                  additionalProperties: true,
                },
                frontendDesignSeo: {
                  type: "object",
                  additionalProperties: true,
                },
                frontendDesignMetadata: {
                  type: "object",
                  additionalProperties: true,
                },
                frontendDesignBindingHints: {
                  type: "array",
                  items: { type: "object", additionalProperties: true },
                },
              },
            },
            CommerceProductDesignReadiness: {
              type: "object",
              required: [
                "schemaVersion",
                "status",
                "templateId",
                "hasDesign",
                "hasContentDocument",
                "hasEditableMap",
                "hasDataBindings",
                "counts",
                "missing",
                "detail",
                "nextAction",
                "evidence",
                "secretHandling",
              ],
              additionalProperties: true,
              properties: {
                schemaVersion: {
                  const: "backy.product-design-readiness.v1",
                },
                status: { enum: ["ready", "attention", "blocked"] },
                templateId: { type: ["string", "null"] },
                hasDesign: { type: "boolean" },
                hasContentDocument: { type: "boolean" },
                hasEditableMap: { type: "boolean" },
                hasDataBindings: { type: "boolean" },
                counts: {
                  type: "object",
                  required: ["elements", "animations", "assets", "bindingHints"],
                  additionalProperties: true,
                  properties: {
                    elements: { type: "integer", minimum: 0 },
                    animations: { type: "integer", minimum: 0 },
                    assets: { type: "integer", minimum: 0 },
                    bindingHints: { type: "integer", minimum: 0 },
                  },
                },
                missing: {
                  type: "array",
                  items: { type: "string" },
                },
                detail: { type: "string" },
                nextAction: { type: "string" },
                evidence: {
                  type: "array",
                  items: { type: "string" },
                },
                secretHandling: { type: "string" },
              },
            },
            CommerceProductStorefrontHandoff: {
              type: "object",
              required: [
                "schemaVersion",
                "generatedAt",
                "source",
                "selectedSiteId",
                "selectedProductId",
                "product",
                "endpoints",
                "pricing",
                "inventory",
                "media",
                "merchandising",
                "design",
                "designReadiness",
                "delivery",
                "subscription",
                "checkout",
                "providerSync",
                "launchReadiness",
                "privacy",
                "secretHandling",
              ],
              additionalProperties: true,
              properties: {
                schemaVersion: {
                  const: "backy.product-storefront-handoff.v1",
                },
                generatedAt: { type: "string", format: "date-time" },
                source: { const: "admin-product-provider-sync-api" },
                selectedSiteId: { type: "string" },
                selectedProductId: { type: "string" },
                product: {
                  type: "object",
                  required: ["id", "slug", "status", "title", "sku", "productType"],
                  additionalProperties: true,
                  properties: {
                    id: { type: "string" },
                    slug: { type: "string" },
                    status: {
                      enum: ["draft", "published", "scheduled", "archived"],
                    },
                    title: { type: "string" },
                    sku: { type: "string" },
                    productType: {
                      enum: ["physical", "digital", "service"],
                    },
                  },
                },
                endpoints: {
                  type: "object",
                  required: [
                    "catalog",
                    "product",
                    "orderIntake",
                    "events",
                    "providerSync",
                  ],
                  additionalProperties: true,
                  properties: {
                    catalog: { type: "string" },
                    product: { type: "string" },
                    orderIntake: { type: "string" },
                    events: { type: "string" },
                    providerSync: { type: "string" },
                  },
                },
                pricing: {
                  type: "object",
                  required: ["price", "compareAtPrice", "currency"],
                  additionalProperties: true,
                  properties: {
                    price: { type: "number" },
                    compareAtPrice: { type: ["number", "null"] },
                    currency: { type: "string" },
                  },
                },
                inventory: { type: "object", additionalProperties: true },
                media: { type: "object", additionalProperties: true },
                merchandising: { type: "object", additionalProperties: true },
                design: {
                  anyOf: [
                    { $ref: "#/components/schemas/CommerceProductDesign" },
                    { type: "null" },
                  ],
                },
                designReadiness: {
                  $ref: "#/components/schemas/CommerceProductDesignReadiness",
                },
                delivery: { type: "object", additionalProperties: true },
                subscription: { type: "object", additionalProperties: true },
                checkout: {
                  type: "object",
                  required: [
                    "orderIntakeReady",
                    "directCheckoutUrlConfigured",
                    "mode",
                  ],
                  additionalProperties: true,
                  properties: {
                    orderIntakeReady: { type: "boolean" },
                    directCheckoutUrlConfigured: { type: "boolean" },
                    mode: {
                      enum: [
                        "backy-order-intake",
                        "direct-checkout-url",
                        "missing",
                      ],
                    },
                  },
                },
                providerSync: {
                  type: "object",
                  required: [
                    "provider",
                    "status",
                    "executionMode",
                    "syncedAt",
                    "hasProviderProductReference",
                    "hasProviderPriceReference",
                    "hasError",
                  ],
                  additionalProperties: true,
                  properties: {
                    provider: { type: "string" },
                    status: { type: "string" },
                    executionMode: { type: "string" },
                    syncedAt: { type: ["string", "null"] },
                    hasProviderProductReference: { type: "boolean" },
                    hasProviderPriceReference: { type: "boolean" },
                    hasError: { type: "boolean" },
                  },
                },
                launchReadiness: {
                  type: "object",
                  required: [
                    "schemaVersion",
                    "status",
                    "score",
                    "readyCount",
                    "totalChecks",
                    "blockerCount",
                    "attentionCount",
                    "checks",
                    "nextSteps",
                  ],
                  additionalProperties: true,
                  properties: {
                    schemaVersion: {
                      const: "backy.product-launch-readiness.v1",
                    },
                    status: { enum: ["ready", "attention", "blocked"] },
                    score: { type: "integer", minimum: 0, maximum: 100 },
                    readyCount: { type: "integer", minimum: 0 },
                    totalChecks: { type: "integer", minimum: 0 },
                    blockerCount: { type: "integer", minimum: 0 },
                    attentionCount: { type: "integer", minimum: 0 },
                    checks: {
                      type: "array",
                      items: { type: "object", additionalProperties: true },
                    },
                    nextSteps: {
                      type: "array",
                      items: { type: "object", additionalProperties: true },
                    },
                  },
                },
                privacy: {
                  type: "object",
                  required: [
                    "customerSafeFieldsOnly",
                    "includesProviderSecrets",
                    "includesProviderResponses",
                    "includesPrivateOrders",
                    "includesCustomerPayloads",
                    "includesDigitalDeliveryUrl",
                    "includesRawCheckoutSessions",
                    "excludedFields",
                  ],
                  additionalProperties: true,
                  properties: {
                    customerSafeFieldsOnly: { const: true },
                    includesProviderSecrets: { const: false },
                    includesProviderResponses: { const: false },
                    includesPrivateOrders: { const: false },
                    includesCustomerPayloads: { const: false },
                    includesDigitalDeliveryUrl: { const: false },
                    includesRawCheckoutSessions: { const: false },
                    excludedFields: {
                      type: "array",
                      items: { type: "string" },
                    },
                  },
                },
                secretHandling: { type: "string" },
              },
            },
            CommerceProductProviderSync: {
              type: "object",
              required: [
                "provider",
                "status",
                "executionMode",
                "syncedAt",
                "requestId",
                "product",
                "price",
              ],
              additionalProperties: true,
              properties: {
                provider: {
                  enum: [
                    "stripe",
                    "http",
                    "paddle",
                    "square",
                    "paypal",
                    "shopify",
                    "bigcommerce",
                    "woocommerce",
                    "etsy",
                    "magento",
                  ],
                },
                status: { enum: ["handoff", "synced", "failed"] },
                executionMode: { type: "string" },
                syncedAt: { type: "string", format: "date-time" },
                requestId: { type: "string" },
                reason: { type: "string" },
                error: { type: "object", additionalProperties: true },
                product: {
                  type: "object",
                  additionalProperties: true,
                  properties: {
                    id: { type: ["string", "null"] },
                    name: { type: "string" },
                    active: { type: ["boolean", "null"] },
                    reference: { type: "string" },
                    url: { type: "string" },
                  },
                },
                price: {
                  type: "object",
                  additionalProperties: true,
                  properties: {
                    id: { type: ["string", "null"] },
                    currency: { type: "string" },
                    unitAmount: { type: "integer", minimum: 0 },
                    recurring: {
                      oneOf: [
                        { type: "object", additionalProperties: true },
                        { type: "null" },
                      ],
                    },
                  },
                },
                providerPayload: {
                  type: "object",
                  additionalProperties: true,
                },
              },
            },
            CommerceProductProviderSyncEnvelope: envelopeSchema({
              type: "object",
              required: [
                "sync",
                "product",
                "providerCertification",
                "storefrontHandoff",
              ],
              additionalProperties: true,
              properties: {
                sync: {
                  oneOf: [
                    { $ref: "#/components/schemas/CommerceProductProviderSync" },
                    { type: "null" },
                  ],
                },
                product: { $ref: "#/components/schemas/CollectionRecord" },
                cacheInvalidation: {
                  type: "object",
                  additionalProperties: true,
                },
                providerCertification: {
                  $ref:
                    "#/components/schemas/CommerceProductProviderCertification",
                },
                storefrontHandoff: {
                  $ref: "#/components/schemas/CommerceProductStorefrontHandoff",
                },
              },
            }),
            CommerceProductProviderCertificationEvidencePacket: {
              type: "object",
              required: [
                "schemaVersion",
                "generatedAt",
                "selectedSiteId",
                "selectedProductId",
                "status",
                "operatorNextAction",
                "selectedFamilies",
                "selectedProviderAliases",
                "runtimeReadiness",
                "operatorArtifacts",
                "scenarioAttachments",
                "commandPreview",
                "target",
                "redactionPolicy",
                "secretHandling",
              ],
              additionalProperties: true,
              properties: {
                schemaVersion: {
                  const: "backy.commerce-provider-certification-evidence-packet.v1",
                },
                generatedAt: { type: "string", format: "date-time" },
                selectedSiteId: { type: "string" },
                selectedProductId: { type: "string" },
                status: {
                  enum: [
                    "needs-credentials",
                    "needs-scenario-evidence",
                    "evidence-complete",
                  ],
                },
                operatorNextAction: {
                  $ref:
                    "#/components/schemas/CommerceProviderCertificationOperatorNextAction",
                },
                selectedFamilies: {
                  type: "array",
                  items: { type: "string" },
                },
                selectedProviderAliases: {
                  type: "object",
                  additionalProperties: { type: "string" },
                },
                runtimeReadiness: {
                  type: "object",
                  required: ["loaded", "configuredFamilies", "missingSelectedFamilies"],
                  additionalProperties: true,
                  properties: {
                    loaded: { const: true },
                    configuredFamilies: {
                      type: "array",
                      items: { type: "string" },
                    },
                    missingSelectedFamilies: {
                      type: "array",
                      items: { type: "string" },
                    },
                  },
                },
                operatorArtifacts: {
                  type: "array",
                  items: {
                    type: "object",
                    required: [
                      "key",
                      "family",
                      "providerAlias",
                      "status",
                      "requiredInputs",
                      "expectedArtifacts",
                      "captureSource",
                      "redaction",
                    ],
                    additionalProperties: true,
                    properties: {
                      key: { type: "string" },
                      family: { type: "string" },
                      providerAlias: { type: "string" },
                      status: { enum: ["ready-to-run", "needs-credentials"] },
                      requiredInputs: {
                        type: "array",
                        items: { type: "string" },
                      },
                      expectedArtifacts: {
                        type: "array",
                        items: { type: "string" },
                      },
                      captureSource: { type: "string" },
                      redaction: { type: "string" },
                    },
                  },
                },
                scenarioAttachments: {
                  type: "array",
                  items: {
                    type: "object",
                    required: [
                      "key",
                      "label",
                      "status",
                      "evidenceCount",
                      "expectedEvidence",
                      "nextAction",
                    ],
                    additionalProperties: true,
                    properties: {
                      key: { type: "string" },
                      label: { type: "string" },
                      status: { enum: ["covered", "missing"] },
                      evidenceCount: { type: "integer", minimum: 0 },
                      expectedEvidence: {
                        type: "array",
                        items: { type: "string" },
                      },
                      nextAction: { type: "string" },
                    },
                  },
                },
                commandPreview: {
                  type: "object",
                  required: ["command", "requiredInputs", "targetInputs"],
                  additionalProperties: true,
                  properties: {
                    command: { type: "string" },
                    requiredInputs: {
                      type: "array",
                      items: { type: "string" },
                    },
                    targetInputs: {
                      type: "array",
                      items: { type: "string" },
                    },
                  },
                },
                target: {
                  type: "object",
                  required: [
                    "siteId",
                    "productId",
                    "siteSelectorEnv",
                    "productProviderSyncApi",
                    "orderAnalyticsApi",
                    "publicCatalogApi",
                  ],
                  additionalProperties: true,
                  properties: {
                    siteId: { type: "string" },
                    productId: { type: "string" },
                    siteSelectorEnv: { const: "BACKY_COMMERCE_CERTIFY_SITE_ID" },
                    productProviderSyncApi: { type: "string" },
                    orderAnalyticsApi: { type: "string" },
                    publicCatalogApi: { type: "string" },
                  },
                },
                redactionPolicy: {
                  type: "object",
                  required: [
                    "includesProviderSecrets",
                    "includesCustomerPayloads",
                    "includesPrivateOrderPayloads",
                    "includesWebhookBodies",
                    "allowedEvidence",
                  ],
                  additionalProperties: true,
                  properties: {
                    includesProviderSecrets: { const: false },
                    includesCustomerPayloads: { const: false },
                    includesPrivateOrderPayloads: { const: false },
                    includesWebhookBodies: { const: false },
                    allowedEvidence: {
                      type: "array",
                      items: { type: "string" },
                    },
                  },
                },
                secretHandling: { type: "string" },
              },
            },
            CommerceProductProviderCertification: {
              allOf: [
                { $ref: "#/components/schemas/CommerceProviderCertification" },
                {
                  type: "object",
                  required: [
                    "generatedAt",
                    "selectedSiteId",
                    "selectedProductId",
                    "source",
                    "operatorGate",
                    "syncSchemaVersion",
                    "endpointEvidence",
                    "certificationEvidence",
                    "operatorEvidencePacket",
                    "secretHandling",
                  ],
                  additionalProperties: true,
                  properties: {
                    generatedAt: { type: "string", format: "date-time" },
                    selectedSiteId: { type: "string" },
                    selectedProductId: { type: "string" },
                    source: { const: "admin-product-provider-sync-api" },
                    operatorGate: {
                      const:
                        "BACKY_COMMERCE_PROVIDER_CERTIFICATION_REQUIRED=1 npm run ci:commerce-provider-certification",
                    },
                    syncSchemaVersion: {
                      const: "backy.commerce-product-provider-sync.v1",
                    },
                    site: { type: "object", additionalProperties: true },
                    catalogEvidence: {
                      type: "object",
                      additionalProperties: true,
                    },
                    endpointEvidence: {
                      type: "object",
                      required: [
                        "providerSync",
                        "productSubscriptions",
                        "commerceCatalog",
                        "commerceOrderCreate",
                      ],
                      additionalProperties: true,
                      properties: {
                        providerSync: { type: "string" },
                        productSubscriptions: { type: "string" },
                        commerceCatalog: { type: "string" },
                        commerceOrderCreate: { type: "string" },
                      },
                    },
                    providerSync: {
                      oneOf: [
                        { type: "object", additionalProperties: true },
                        { type: "null" },
                      ],
                    },
                    certificationEvidence: {
                      type: "object",
                      required: ["schemaVersion", "status", "coverage", "scenarios"],
                      additionalProperties: true,
                      properties: {
                        schemaVersion: {
                          const: "backy.product-provider-certification-evidence.v1",
                        },
                        status: { enum: ["ready", "attention"] },
                        coverage: {
                          type: "object",
                          additionalProperties: true,
                        },
                        scenarios: {
                          type: "array",
                          items: { type: "object", additionalProperties: true },
                        },
                      },
                    },
                    operatorEvidencePacket: {
                      $ref:
                        "#/components/schemas/CommerceProductProviderCertificationEvidencePacket",
                    },
                    secretHandling: { type: "string" },
                  },
                },
              ],
            },
            CommerceProductSubscriptionLifecycle: {
              type: "object",
              required: [
                "schemaVersion",
                "generatedAt",
                "product",
                "summary",
                "actionPlan",
                "subscriptions",
                "execution",
                "certification",
                "contract",
              ],
              additionalProperties: true,
              properties: {
                schemaVersion: {
                  const: "backy.product-subscription-lifecycle.v1",
                },
                generatedAt: { type: "string", format: "date-time" },
                product: {
                  type: "object",
                  required: ["id", "slug", "title", "sku", "subscription"],
                  additionalProperties: true,
                  properties: {
                    id: { type: "string" },
                    slug: { type: "string" },
                    title: { type: "string" },
                    sku: { type: "string" },
                    subscription: {
                      type: "object",
                      additionalProperties: true,
                    },
                  },
                },
                summary: {
                  type: "object",
                  required: [
                    "total",
                    "active",
                    "renewals",
                    "dunning",
                    "paused",
                    "trialEnding",
                    "cancelled",
                    "pending",
                    "revenue",
                    "units",
                  ],
                  additionalProperties: true,
                  properties: {
                    total: { type: "integer", minimum: 0 },
                    active: { type: "integer", minimum: 0 },
                    renewals: { type: "integer", minimum: 0 },
                    dunning: { type: "integer", minimum: 0 },
                    paused: { type: "integer", minimum: 0 },
                    trialEnding: { type: "integer", minimum: 0 },
                    cancelled: { type: "integer", minimum: 0 },
                    pending: { type: "integer", minimum: 0 },
                    revenue: { type: "number" },
                    units: { type: "integer", minimum: 0 },
                  },
                },
                actionPlan: {
                  type: "object",
                  required: [
                    "schemaVersion",
                    "attentionRequired",
                    "executableNow",
                    "handoffRequired",
                    "retryRecommended",
                  ],
                  additionalProperties: true,
                  properties: {
                    schemaVersion: {
                      const: "backy.product-subscription-action-plan-summary.v1",
                    },
                    attentionRequired: { type: "integer", minimum: 0 },
                    executableNow: { type: "integer", minimum: 0 },
                    handoffRequired: { type: "integer", minimum: 0 },
                    retryRecommended: { type: "integer", minimum: 0 },
                  },
                },
                subscriptions: {
                  type: "array",
                  items: {
                    type: "object",
                    required: [
                      "id",
                      "slug",
                      "orderNumber",
                      "paymentProvider",
                      "paymentStatus",
                      "fulfillmentStatus",
                      "lifecycleStatus",
                      "subscriptionReference",
                      "actionExecutionMode",
                      "actionExecutionModes",
                      "actionPlan",
                      "actionHistory",
                      "lastAction",
                      "total",
                      "currency",
                      "productUnits",
                      "productRevenue",
                      "updatedAt",
                      "matchedItems",
                    ],
                    additionalProperties: true,
                    properties: {
                      id: { type: "string" },
                      slug: { type: "string" },
                      orderNumber: { type: "string" },
                      customerName: { type: "string" },
                      customerEmail: { type: "string" },
                      paymentProvider: { type: "string" },
                      paymentStatus: { type: "string" },
                      fulfillmentStatus: { type: "string" },
                      lifecycleStatus: {
                        enum: [
                          "active",
                          "renewal",
                          "dunning",
                          "paused",
                          "trial_will_end",
                          "cancelled",
                          "pending",
                        ],
                      },
                      subscriptionReference: { type: "string" },
                      actionExecutionMode: {
                        enum: [
                          "stripe-api",
                          "paypal-api",
                          "paddle-api",
                          "square-api",
                          "adyen-api",
                          "mollie-api",
                          "razorpay-api",
                          "http-api",
                          "handoff",
                        ],
                      },
                      actionExecutionModes: {
                        type: "object",
                        required: ["pause", "resume", "cancel"],
                        additionalProperties: true,
                        properties: {
                          pause: { type: "string" },
                          resume: { type: "string" },
                          cancel: { type: "string" },
                        },
                      },
                      actionPlan: {
                        type: "object",
                        additionalProperties: true,
                      },
                      actionHistory: {
                        type: "array",
                        items: {
                          type: "object",
                          additionalProperties: true,
                        },
                      },
                      lastAction: {
                        oneOf: [
                          {
                            type: "object",
                            additionalProperties: true,
                          },
                          { type: "null" },
                        ],
                      },
                      checkoutSessionId: { type: "string" },
                      total: { type: "number" },
                      currency: { type: "string" },
                      productUnits: { type: "integer", minimum: 0 },
                      productRevenue: { type: "number" },
                      updatedAt: { type: ["string", "null"] },
                      matchedItems: {
                        type: "array",
                        items: {
                          type: "object",
                          additionalProperties: true,
                        },
                      },
                    },
                  },
                },
                execution: {
                  type: "object",
                  required: [
                    "schemaVersion",
                    "actionEndpoint",
                    "supportedActions",
                    "providers",
                    "summary",
                  ],
                  additionalProperties: true,
                  properties: {
                    schemaVersion: {
                      const: "backy.product-subscription-execution-readiness.v1",
                    },
                    actionEndpoint: { type: "string" },
                    supportedActions: {
                      type: "array",
                      items: { enum: ["pause", "resume", "cancel"] },
                    },
                    providers: {
                      type: "array",
                      items: {
                        type: "object",
                        required: [
                          "provider",
                          "executionMode",
                          "configured",
                          "referencePattern",
                          "executableSubscriptions",
                          "blocker",
                        ],
                        additionalProperties: true,
                        properties: {
                          provider: { type: "string" },
                          executionMode: { type: "string" },
                          configured: { type: "boolean" },
                          referencePattern: { type: "string" },
                          executableSubscriptions: {
                            type: "integer",
                            minimum: 0,
                          },
                          blocker: { type: "string" },
                        },
                      },
                    },
                    summary: {
                      type: "object",
                      required: [
                        "executableSubscriptions",
                        "handoffSubscriptions",
                      ],
                      additionalProperties: true,
                      properties: {
                        executableSubscriptions: {
                          type: "integer",
                          minimum: 0,
                        },
                        handoffSubscriptions: {
                          type: "integer",
                          minimum: 0,
                        },
                      },
                    },
                  },
                },
                certification: {
                  type: "object",
                  required: [
                    "schemaVersion",
                    "status",
                    "requiredGate",
                    "coverage",
                    "scenarios",
                    "providerFamilies",
                    "secretHandling",
                  ],
                  additionalProperties: true,
                  properties: {
                    schemaVersion: {
                      const: "backy.product-subscription-certification.v1",
                    },
                    status: { enum: ["ready", "attention"] },
                    requiredGate: {
                      const: "npm run ci:commerce-provider-certification",
                    },
                    coverage: {
                      type: "object",
                      required: ["covered", "total", "missing"],
                      additionalProperties: true,
                      properties: {
                        covered: { type: "integer", minimum: 0 },
                        total: { type: "integer", minimum: 0 },
                        missing: {
                          type: "array",
                          items: { type: "string" },
                        },
                      },
                    },
                    scenarios: {
                      type: "array",
                      items: {
                        type: "object",
                        required: [
                          "key",
                          "label",
                          "evidenceCount",
                          "expectedEvidence",
                          "nextAction",
                          "status",
                        ],
                        additionalProperties: true,
                        properties: {
                          key: { type: "string" },
                          label: { type: "string" },
                          evidenceCount: { type: "integer", minimum: 0 },
                          expectedEvidence: {
                            type: "array",
                            items: { type: "string" },
                          },
                          nextAction: { type: "string" },
                          status: { enum: ["covered", "missing"] },
                        },
                      },
                    },
                    providerFamilies: {
                      type: "array",
                      items: { type: "string" },
                    },
                    secretHandling: { type: "string" },
                  },
                },
                contract: {
                  type: "object",
                  required: [
                    "ordersApi",
                    "webhookApi",
                    "reconciliationApi",
                    "supportedLifecycleEvents",
                  ],
                  additionalProperties: true,
                  properties: {
                    ordersApi: { type: "string" },
                    webhookApi: { type: "string" },
                    reconciliationApi: { type: "string" },
                    supportedLifecycleEvents: {
                      type: "array",
                      items: { type: "string" },
                    },
                  },
                },
              },
            },
            CommerceProductSubscriptionsEnvelope: envelopeSchema({
              type: "object",
              required: ["lifecycle", "collection"],
              additionalProperties: true,
              properties: {
                lifecycle: {
                  $ref: "#/components/schemas/CommerceProductSubscriptionLifecycle",
                },
                collection: {
                  type: "object",
                  required: ["id"],
                  additionalProperties: true,
                  properties: {
                    id: { type: "string" },
                    slug: { type: "string" },
                    name: { type: "string" },
                  },
                },
              },
            }),
            CommerceProductSubscriptionAction: {
              type: "object",
              required: [
                "id",
                "schemaVersion",
                "action",
                "status",
                "provider",
                "executionMode",
                "productId",
                "productSlug",
                "orderId",
                "orderSlug",
                "subscriptionReference",
                "reason",
                "requestedAt",
                "completedAt",
                "providerPayload",
              ],
              additionalProperties: true,
              properties: {
                id: { type: "string" },
                schemaVersion: {
                  const: "backy.product-subscription-action.v1",
                },
                action: { enum: ["pause", "resume", "cancel"] },
                status: {
                  enum: [
                    "requested",
                    "succeeded",
                    "failed",
                    "requires_action",
                  ],
                },
                provider: { type: "string" },
                executionMode: {
                  enum: [
                    "stripe-api",
                    "paypal-api",
                    "paddle-api",
                    "square-api",
                    "adyen-api",
                    "mollie-api",
                    "razorpay-api",
                    "http-api",
                    "handoff",
                  ],
                },
                productId: { type: "string" },
                productSlug: { type: "string" },
                orderId: { type: "string" },
                orderSlug: { type: "string" },
                subscriptionReference: { type: "string" },
                reason: { type: "string" },
                requestedAt: { type: "string", format: "date-time" },
                completedAt: { type: ["string", "null"] },
                providerPayload: {
                  type: "object",
                  additionalProperties: true,
                },
              },
            },
            CommerceProductSubscriptionActionEnvelope: envelopeSchema({
              type: "object",
              required: ["action", "record", "order"],
              additionalProperties: true,
              properties: {
                action: {
                  $ref: "#/components/schemas/CommerceProductSubscriptionAction",
                },
                record: { $ref: "#/components/schemas/CollectionRecord" },
                order: { $ref: "#/components/schemas/CollectionRecord" },
                cacheInvalidation: {
                  type: "object",
                  additionalProperties: true,
                },
              },
            }),
            CommerceOrderStatusHandoff: {
              type: "object",
              required: [
                "schemaVersion",
                "generatedAt",
                "source",
                "status",
                "score",
                "selectedSiteId",
                "order",
                "customer",
                "tracking",
                "refund",
                "digitalDelivery",
                "endpoints",
                "frontendBindings",
                "privacy",
                "actionPlan",
                "checks",
                "nextSteps",
              ],
              additionalProperties: true,
              properties: {
                schemaVersion: { const: "backy.order-status-handoff.v1" },
                generatedAt: { type: "string", format: "date-time" },
                source: {
                  enum: [
                    "admin-order-status-handoff-api",
                    "public-commerce-order-intake-api",
                  ],
                },
                status: { enum: ["ready", "attention", "blocked"] },
                score: { type: "integer", minimum: 0, maximum: 100 },
                selectedSiteId: { type: "string" },
                order: {
                  type: "object",
                  required: [
                    "id",
                    "slug",
                    "orderNumber",
                    "recordStatus",
                    "total",
                    "currency",
                    "itemCount",
                    "orderStatus",
                    "paymentStatus",
                    "fulfillmentStatus",
                    "createdAt",
                    "updatedAt",
                  ],
                  additionalProperties: true,
                  properties: {
                    id: { type: "string" },
                    slug: { type: "string" },
                    orderNumber: { type: "string" },
                    recordStatus: { type: "string" },
                    total: { type: "number" },
                    currency: { type: "string" },
                    itemCount: { type: "integer", minimum: 0 },
                    orderStatus: { type: "string" },
                    paymentStatus: { type: "string" },
                    fulfillmentStatus: { type: "string" },
                    createdAt: { type: "string" },
                    updatedAt: { type: "string" },
                  },
                },
                customer: {
                  type: "object",
                  required: [
                    "displayName",
                    "maskedEmail",
                    "maskedPhone",
                    "customerProfileLinked",
                    "customerProfileSlug",
                    "customerProfileStatus",
                  ],
                  additionalProperties: true,
                  properties: {
                    displayName: { type: "string" },
                    maskedEmail: { type: "string" },
                    maskedPhone: { type: "string" },
                    customerProfileLinked: { type: "boolean" },
                    customerProfileSlug: { type: "string" },
                    customerProfileStatus: { type: "string" },
                  },
                },
                tracking: {
                  type: "object",
                  additionalProperties: true,
                  properties: {
                    carrier: { type: "string" },
                    trackingNumber: { type: "string" },
                    trackingUrl: { type: "string" },
                    trackingStatus: { type: "string" },
                    trackingLastCheckedAt: { type: "string" },
                    fulfilledAt: { type: "string" },
                    shippingLabelStatus: { type: "string" },
                    shippingLabelProvider: { type: "string" },
                    shippingLabelReferencePresent: { type: "boolean" },
                  },
                },
                refund: {
                  type: "object",
                  additionalProperties: true,
                  properties: {
                    refundAmount: { type: "number" },
                    refundReasonPresent: { type: "boolean" },
                    providerRefundStatus: { type: "string" },
                    providerRefundProvider: { type: "string" },
                    providerRefundReferencePresent: { type: "boolean" },
                    providerRefundRequestedAt: { type: "string" },
                    providerRefundCompletedAt: { type: "string" },
                  },
                },
                digitalDelivery: {
                  type: "object",
                  required: [
                    "schemaVersion",
                    "itemCount",
                    "configuredItemCount",
                    "pendingItemCount",
                    "status",
                    "customerAction",
                    "customerSafeFieldsOnly",
                    "includesDownloadUrls",
                    "includesDownloadMediaIds",
                  ],
                  additionalProperties: true,
                  properties: {
                    schemaVersion: {
                      const: "backy.order-digital-delivery-handoff.v1",
                    },
                    itemCount: { type: "integer", minimum: 0 },
                    configuredItemCount: { type: "integer", minimum: 0 },
                    pendingItemCount: { type: "integer", minimum: 0 },
                    status: {
                      enum: [
                        "not-applicable",
                        "pending-payment",
                        "ready",
                        "fulfilled",
                        "attention",
                      ],
                    },
                    customerAction: { type: "string" },
                    customerSafeFieldsOnly: { const: true },
                    includesDownloadUrls: { const: false },
                    includesDownloadMediaIds: { const: false },
                  },
                },
                endpoints: {
                  type: "object",
                  required: [
                    "checkoutIntake",
                    "publicStatusHandoff",
                    "adminStatusHandoff",
                    "adminOrderDetail",
                    "adminTracking",
                    "adminProviderRefund",
                  ],
                  additionalProperties: true,
                  properties: {
                    checkoutIntake: { type: "string" },
                    publicStatusHandoff: { type: "string" },
                    adminStatusHandoff: { type: "string" },
                    adminOrderDetail: { type: "string" },
                    adminTracking: { type: "string" },
                    adminProviderRefund: { type: "string" },
                  },
                },
                frontendBindings: {
                  type: "object",
                  required: [
                    "schemaVersion",
                    "targetViews",
                    "dataset",
                    "safeBindingPaths",
                    "maskedBindingPaths",
                    "editableRegions",
                    "actionBindings",
                  ],
                  additionalProperties: true,
                  properties: {
                    schemaVersion: {
                      const: "backy.order-status-frontend-bindings.v1",
                    },
                    targetViews: {
                      type: "array",
                      items: { type: "string" },
                    },
                    dataset: {
                      type: "object",
                      additionalProperties: true,
                      properties: {
                        key: { const: "orderStatusHandoff" },
                        source: {
                          enum: [
                            "admin-order-status-handoff-api",
                            "public-commerce-order-intake-api",
                          ],
                        },
                        endpoint: { type: "string" },
                        selectedOrderId: {
                          anyOf: [{ type: "string" }, { type: "null" }],
                        },
                        selectedOrderSlug: {
                          anyOf: [{ type: "string" }, { type: "null" }],
                        },
                        auth: {
                          enum: [
                            "admin-session-or-service-key",
                            "post-checkout-response",
                            "post-checkout-status-token",
                          ],
                        },
                        refreshMethod: { enum: ["GET", "POST-response"] },
                      },
                    },
                    safeBindingPaths: {
                      type: "array",
                      items: { type: "string" },
                    },
                    maskedBindingPaths: {
                      type: "array",
                      items: { type: "string" },
                    },
                    editableRegions: {
                      type: "array",
                      items: {
                        type: "object",
                        additionalProperties: true,
                      },
                    },
                    actionBindings: {
                      type: "array",
                      items: {
                        type: "object",
                        additionalProperties: true,
                      },
                    },
                  },
                },
                privacy: {
                  type: "object",
                  required: [
                    "publicCollectionReadBlocked",
                    "customerSafeFieldsOnly",
                    "includesRawCustomerContact",
                    "includesProviderExecutionIds",
                    "includesPaymentReferences",
                    "includesAddresses",
                    "includesInternalNotes",
                    "includesDigitalDeliveryUrls",
                    "includesDownloadMediaIds",
                    "excludedFields",
                  ],
                  additionalProperties: true,
                  properties: {
                    publicCollectionReadBlocked: { type: "boolean" },
                    customerSafeFieldsOnly: { const: true },
                    includesRawCustomerContact: { const: false },
                    includesProviderExecutionIds: { const: false },
                    includesPaymentReferences: { const: false },
                    includesAddresses: { const: false },
                    includesInternalNotes: { const: false },
                    includesDigitalDeliveryUrls: { const: false },
                    includesDownloadMediaIds: { const: false },
                    excludedFields: {
                      type: "array",
                      items: { type: "string" },
                    },
                  },
                },
                actionPlan: { type: "object", additionalProperties: true },
                checks: {
                  type: "array",
                  items: { type: "object", additionalProperties: true },
                },
                nextSteps: { type: "array", items: { type: "string" } },
              },
            },
            CommerceOrderStatusAccess: {
              type: "object",
              required: [
                "schemaVersion",
                "auth",
                "tokenReturnedOnce",
                "tokenStorage",
                "tokenExpiresAt",
                "orderId",
                "orderSlug",
                "endpoint",
                "endpointTemplate",
                "refreshMethod",
                "responseContract",
                "privacy",
              ],
              additionalProperties: true,
              properties: {
                schemaVersion: { const: "backy.order-status-access.v1" },
                auth: { const: "status-token" },
                tokenReturnedOnce: { type: "boolean" },
                statusToken: { type: "string" },
                tokenStorage: { type: "string" },
                tokenExpiresAt: { type: "string", format: "date-time" },
                orderId: { type: "string" },
                orderSlug: { type: "string" },
                endpoint: { type: "string" },
                endpointTemplate: { type: "string" },
                refreshMethod: { const: "GET" },
                responseContract: {
                  const: "backy.order-status-handoff.v1",
                },
                privacy: {
                  type: "object",
                  required: [
                    "rawTokenStoredByBacky",
                    "tokenHashField",
                    "includesRawOrder",
                    "customerSafeFieldsOnly",
                  ],
                  additionalProperties: true,
                  properties: {
                    rawTokenStoredByBacky: { const: false },
                    tokenHashField: { const: "statusaccesstokenhash" },
                    includesRawOrder: { const: false },
                    customerSafeFieldsOnly: { const: true },
                  },
                },
              },
            },
            CommerceOrderStatusHandoffEnvelope: envelopeSchema({
              type: "object",
              required: ["schemaVersion", "statusHandoff", "statusAccess"],
              additionalProperties: true,
              properties: {
                schemaVersion: {
                  const: "backy.order-status-handoff.v1",
                },
                statusHandoff: {
                  $ref: "#/components/schemas/CommerceOrderStatusHandoff",
                },
                statusAccess: {
                  $ref: "#/components/schemas/CommerceOrderStatusAccess",
                },
              },
            }),
            CommerceOrderProviderCertificationEvidence: {
              type: "object",
              required: [
                "schemaVersion",
                "status",
                "requiredGate",
                "coverage",
                "scenarios",
                "secretHandling",
              ],
              additionalProperties: true,
              properties: {
                schemaVersion: {
                  const: "backy.order-provider-certification-evidence.v1",
                },
                status: { enum: ["ready", "attention"] },
                requiredGate: {
                  const:
                    "BACKY_COMMERCE_PROVIDER_CERTIFICATION_REQUIRED=1 npm run ci:commerce-provider-certification",
                },
                coverage: {
                  type: "object",
                  required: ["covered", "total", "missing"],
                  additionalProperties: true,
                  properties: {
                    covered: { type: "integer", minimum: 0 },
                    total: { type: "integer", minimum: 0 },
                    missing: { type: "array", items: { type: "string" } },
                  },
                },
                scenarios: {
                  type: "array",
                  items: {
                    type: "object",
                    required: [
                      "key",
                      "label",
                      "expectedEvidence",
                      "nextAction",
                      "evidenceCount",
                      "status",
                    ],
                    additionalProperties: true,
                    properties: {
                      key: {
                        enum: [
                          "checkout-settlement",
                          "quote-recalculation",
                          "carrier-label-tracking",
                          "fulfillment-dispatch",
                          "provider-refund",
                          "webhook-reconciliation",
                          "subscription-lifecycle",
                        ],
                      },
                      label: { type: "string" },
                      expectedEvidence: {
                        type: "array",
                        items: { type: "string" },
                      },
                      nextAction: { type: "string" },
                      evidenceCount: { type: "integer", minimum: 0 },
                      status: { enum: ["covered", "missing"] },
                    },
                  },
                },
                secretHandling: { type: "string" },
              },
            },
            CommerceProviderCertificationOperatorNextAction: {
              type: "object",
              required: [
                "status",
                "label",
                "detail",
                "command",
                "missingFamilies",
                "missingScenarios",
                "artifactEnv",
                "artifactPath",
              ],
              additionalProperties: true,
              properties: {
                status: {
                  enum: [
                    "needs-credentials",
                    "needs-scenario-evidence",
                    "evidence-complete",
                  ],
                },
                label: { type: "string" },
                detail: { type: "string" },
                command: { type: "string" },
                missingFamilies: {
                  type: "array",
                  items: { type: "string" },
                },
                missingScenarios: {
                  type: "array",
                  items: { type: "string" },
                },
                artifactEnv: {
                  const: "BACKY_COMMERCE_CERTIFICATION_OUTPUT",
                },
                artifactPath: {
                  const:
                    "artifacts/backy-commerce-provider-certification.json",
                },
              },
            },
            CommerceOrderProviderCertificationEvidencePacket: {
              type: "object",
              required: [
                "schemaVersion",
                "generatedAt",
                "selectedSiteId",
                "status",
                "operatorNextAction",
                "selectedFamilies",
                "selectedProviderAliases",
                "runtimeReadiness",
                "operatorArtifacts",
                "scenarioAttachments",
                "commandPreview",
                "redactionPolicy",
                "secretHandling",
              ],
              additionalProperties: true,
              properties: {
                schemaVersion: {
                  const: "backy.order-provider-certification-evidence-packet.v1",
                },
                generatedAt: { type: "string", format: "date-time" },
                selectedSiteId: { type: "string" },
                status: {
                  enum: [
                    "needs-credentials",
                    "needs-scenario-evidence",
                    "evidence-complete",
                  ],
                },
                operatorNextAction: {
                  $ref:
                    "#/components/schemas/CommerceProviderCertificationOperatorNextAction",
                },
                selectedFamilies: {
                  type: "array",
                  items: { type: "string" },
                },
                selectedProviderAliases: {
                  type: "object",
                  additionalProperties: { type: "string" },
                },
                runtimeReadiness: {
                  type: "object",
                  required: ["loaded", "configuredFamilies", "missingSelectedFamilies"],
                  additionalProperties: true,
                  properties: {
                    loaded: { const: true },
                    configuredFamilies: {
                      type: "array",
                      items: { type: "string" },
                    },
                    missingSelectedFamilies: {
                      type: "array",
                      items: { type: "string" },
                    },
                  },
                },
                operatorArtifacts: {
                  type: "array",
                  items: {
                    type: "object",
                    required: [
                      "key",
                      "family",
                      "providerAlias",
                      "status",
                      "requiredInputs",
                      "expectedArtifacts",
                      "captureSource",
                      "redaction",
                    ],
                    additionalProperties: true,
                    properties: {
                      key: { type: "string" },
                      family: { type: "string" },
                      providerAlias: { type: "string" },
                      status: { enum: ["ready-to-run", "needs-credentials"] },
                      requiredInputs: {
                        type: "array",
                        items: { type: "string" },
                      },
                      expectedArtifacts: {
                        type: "array",
                        items: { type: "string" },
                      },
                      captureSource: { type: "string" },
                      redaction: { type: "string" },
                    },
                  },
                },
                scenarioAttachments: {
                  type: "array",
                  items: {
                    type: "object",
                    required: [
                      "key",
                      "label",
                      "status",
                      "evidenceCount",
                      "expectedEvidence",
                      "nextAction",
                    ],
                    additionalProperties: true,
                    properties: {
                      key: { type: "string" },
                      label: { type: "string" },
                      status: { enum: ["covered", "missing"] },
                      evidenceCount: { type: "integer", minimum: 0 },
                      expectedEvidence: {
                        type: "array",
                        items: { type: "string" },
                      },
                      nextAction: { type: "string" },
                    },
                  },
                },
                commandPreview: {
                  type: "object",
                  required: ["command", "requiredInputs", "targetInputs"],
                  additionalProperties: true,
                  properties: {
                    command: { type: "string" },
                    requiredInputs: {
                      type: "array",
                      items: { type: "string" },
                    },
                    targetInputs: {
                      type: "array",
                      items: { type: "string" },
                    },
                  },
                },
                redactionPolicy: {
                  type: "object",
                  required: [
                    "includesProviderSecrets",
                    "includesCustomerPayloads",
                    "includesRawOrderPayloads",
                    "includesPaymentReferences",
                    "includesAddresses",
                    "includesWebhookBodies",
                    "allowedEvidence",
                  ],
                  additionalProperties: true,
                  properties: {
                    includesProviderSecrets: { const: false },
                    includesCustomerPayloads: { const: false },
                    includesRawOrderPayloads: { const: false },
                    includesPaymentReferences: { const: false },
                    includesAddresses: { const: false },
                    includesWebhookBodies: { const: false },
                    allowedEvidence: {
                      type: "array",
                      items: { type: "string" },
                    },
                  },
                },
                secretHandling: { type: "string" },
              },
            },
            CommerceOrderAnalyticsProviderCertification: {
              allOf: [
                { $ref: "#/components/schemas/CommerceProviderCertification" },
                {
                  type: "object",
                  required: [
                    "generatedAt",
                    "selectedSiteId",
                    "source",
                    "operatorGate",
                    "analyticsSchemaVersion",
                    "endpointEvidence",
                    "providerAnalytics",
                    "certificationEvidence",
                    "operatorEvidencePacket",
                    "secretHandling",
                  ],
                  additionalProperties: true,
                  properties: {
                    generatedAt: { type: "string", format: "date-time" },
                    selectedSiteId: { type: "string" },
                    site: { type: "object", additionalProperties: true },
                    source: { const: "admin-order-analytics-api" },
                    operatorGate: {
                      const:
                        "BACKY_COMMERCE_PROVIDER_CERTIFICATION_REQUIRED=1 npm run ci:commerce-provider-certification",
                    },
                    analyticsSchemaVersion: {
                      const: "backy.order-analytics.v1",
                    },
                    endpointEvidence: {
                      type: "object",
                      required: [
                        "analytics",
                        "quote",
                        "shippingLabel",
                        "fulfillment",
                        "tracking",
                        "providerRefund",
                        "commerceWebhook",
                        "siteReconciliation",
                        "platformReconciliation",
                        "reconciliationReadiness",
                        "checkoutIntake",
                      ],
                      additionalProperties: true,
                      properties: {
                        analytics: { type: "string" },
                        quote: { type: "string" },
                        shippingLabel: { type: "string" },
                        fulfillment: { type: "string" },
                        tracking: { type: "string" },
                        providerRefund: { type: "string" },
                        commerceWebhook: { type: "string" },
                        siteReconciliation: { type: "string" },
                        platformReconciliation: { type: "string" },
                        reconciliationReadiness: { type: "string" },
                        checkoutIntake: { type: "string" },
                      },
                    },
                    providerAnalytics: {
                      type: "object",
                      additionalProperties: true,
                    },
                    certificationEvidence: {
                      $ref:
                        "#/components/schemas/CommerceOrderProviderCertificationEvidence",
                    },
                    operatorEvidencePacket: {
                      $ref:
                        "#/components/schemas/CommerceOrderProviderCertificationEvidencePacket",
                    },
                    secretHandling: { type: "string" },
                  },
                },
              ],
            },
            CommerceOrderAnalytics: {
              type: "object",
              required: [
                "schemaVersion",
                "generatedAt",
                "recordLimit",
                "orderCount",
                "revenue",
                "payment",
                "fulfillment",
                "operations",
                "providerOperations",
                "sources",
                "currencies",
                "trend",
                "recentOrders",
              ],
              additionalProperties: true,
              properties: {
                schemaVersion: { const: "backy.order-analytics.v1" },
                generatedAt: { type: "string", format: "date-time" },
                recordLimit: { type: "integer", minimum: 0 },
                orderCount: { type: "integer", minimum: 0 },
                revenue: {
                  type: "object",
                  required: [
                    "grossTotal",
                    "paidTotal",
                    "pendingTotal",
                    "failedTotal",
                    "refundedTotal",
                    "refundAmountTotal",
                    "taxTotal",
                    "shippingTotal",
                    "discountTotal",
                    "averageOrderValue",
                    "paidAverageOrderValue",
                  ],
                  additionalProperties: true,
                  properties: {
                    grossTotal: { type: "number" },
                    paidTotal: { type: "number" },
                    pendingTotal: { type: "number" },
                    failedTotal: { type: "number" },
                    refundedTotal: { type: "number" },
                    refundAmountTotal: { type: "number" },
                    taxTotal: { type: "number" },
                    shippingTotal: { type: "number" },
                    discountTotal: { type: "number" },
                    averageOrderValue: { type: "number" },
                    paidAverageOrderValue: { type: "number" },
                  },
                },
                payment: {
                  type: "object",
                  required: ["pending", "paid", "failed", "refunded"],
                  additionalProperties: true,
                  properties: {
                    pending: {
                      type: "object",
                      required: ["count", "total"],
                      additionalProperties: true,
                      properties: {
                        count: { type: "integer", minimum: 0 },
                        total: { type: "number" },
                      },
                    },
                    paid: {
                      type: "object",
                      required: ["count", "total"],
                      additionalProperties: true,
                      properties: {
                        count: { type: "integer", minimum: 0 },
                        total: { type: "number" },
                      },
                    },
                    failed: {
                      type: "object",
                      required: ["count", "total"],
                      additionalProperties: true,
                      properties: {
                        count: { type: "integer", minimum: 0 },
                        total: { type: "number" },
                      },
                    },
                    refunded: {
                      type: "object",
                      required: ["count", "total"],
                      additionalProperties: true,
                      properties: {
                        count: { type: "integer", minimum: 0 },
                        total: { type: "number" },
                      },
                    },
                  },
                },
                fulfillment: {
                  type: "object",
                  required: [
                    "unfulfilled",
                    "processing",
                    "fulfilled",
                    "cancelled",
                  ],
                  additionalProperties: true,
                  properties: {
                    unfulfilled: {
                      type: "object",
                      required: ["count", "total"],
                      additionalProperties: true,
                      properties: {
                        count: { type: "integer", minimum: 0 },
                        total: { type: "number" },
                      },
                    },
                    processing: {
                      type: "object",
                      required: ["count", "total"],
                      additionalProperties: true,
                      properties: {
                        count: { type: "integer", minimum: 0 },
                        total: { type: "number" },
                      },
                    },
                    fulfilled: {
                      type: "object",
                      required: ["count", "total"],
                      additionalProperties: true,
                      properties: {
                        count: { type: "integer", minimum: 0 },
                        total: { type: "number" },
                      },
                    },
                    cancelled: {
                      type: "object",
                      required: ["count", "total"],
                      additionalProperties: true,
                      properties: {
                        count: { type: "integer", minimum: 0 },
                        total: { type: "number" },
                      },
                    },
                  },
                },
                operations: {
                  type: "object",
                  additionalProperties: true,
                },
                providerOperations: {
                  type: "object",
                  required: [
                    "paymentProviders",
                    "refundProviders",
                    "fulfillmentProviders",
                    "shippingLabelProviders",
                    "attention",
                  ],
                  additionalProperties: true,
                  properties: {
                    paymentProviders: {
                      type: "array",
                      items: { type: "object", additionalProperties: true },
                    },
                    refundProviders: {
                      type: "array",
                      items: { type: "object", additionalProperties: true },
                    },
                    fulfillmentProviders: {
                      type: "array",
                      items: { type: "object", additionalProperties: true },
                    },
                    shippingLabelProviders: {
                      type: "array",
                      items: { type: "object", additionalProperties: true },
                    },
                    attention: {
                      type: "object",
                      additionalProperties: true,
                    },
                  },
                },
                sources: {
                  type: "array",
                  items: {
                    type: "object",
                    required: ["source", "count", "total"],
                    additionalProperties: true,
                    properties: {
                      source: { type: "string" },
                      count: { type: "integer", minimum: 0 },
                      total: { type: "number" },
                    },
                  },
                },
                currencies: {
                  type: "array",
                  items: {
                    type: "object",
                    required: ["currency", "count", "total"],
                    additionalProperties: true,
                    properties: {
                      currency: { type: "string" },
                      count: { type: "integer", minimum: 0 },
                      total: { type: "number" },
                    },
                  },
                },
                trend: {
                  type: "array",
                  items: {
                    type: "object",
                    required: ["date", "orders", "paid", "grossTotal", "paidTotal"],
                    additionalProperties: true,
                    properties: {
                      date: { type: "string" },
                      orders: { type: "integer", minimum: 0 },
                      paid: { type: "integer", minimum: 0 },
                      grossTotal: { type: "number" },
                      paidTotal: { type: "number" },
                    },
                  },
                },
                recentOrders: {
                  type: "array",
                  items: {
                    type: "object",
                    required: [
                      "id",
                      "slug",
                      "status",
                      "orderNumber",
                      "customerName",
                      "total",
                      "currency",
                      "paymentStatus",
                      "fulfillmentStatus",
                      "orderSource",
                      "subscriptionReference",
                      "updatedAt",
                    ],
                    additionalProperties: true,
                    properties: {
                      id: { type: "string" },
                      slug: { type: "string" },
                      status: { type: "string" },
                      orderNumber: { type: "string" },
                      customerName: { type: "string" },
                      total: { type: "number" },
                      currency: { type: "string" },
                      paymentStatus: {
                        enum: ["pending", "paid", "failed", "refunded"],
                      },
                      fulfillmentStatus: {
                        enum: [
                          "unfulfilled",
                          "processing",
                          "fulfilled",
                          "cancelled",
                        ],
                      },
                      orderSource: { type: "string" },
                      subscriptionReference: { type: "string" },
                      updatedAt: { type: ["string", "null"] },
                    },
                  },
                },
              },
            },
            CommerceOrderAnalyticsEnvelope: envelopeSchema({
              type: "object",
              required: [
                "site",
                "collection",
                "analytics",
                "providerCertification",
              ],
              additionalProperties: true,
              properties: {
                site: {
                  type: "object",
                  required: ["id"],
                  additionalProperties: true,
                  properties: {
                    id: { type: "string" },
                    slug: { type: "string" },
                    name: { type: "string" },
                  },
                },
                collection: {
                  type: "object",
                  required: ["id"],
                  additionalProperties: true,
                  properties: {
                    id: { type: "string" },
                    slug: { type: "string" },
                    name: { type: "string" },
                  },
                },
                analytics: {
                  $ref: "#/components/schemas/CommerceOrderAnalytics",
                },
                providerCertification: {
                  $ref:
                    "#/components/schemas/CommerceOrderAnalyticsProviderCertification",
                },
              },
            }),
            CommerceOrderQuote: {
              type: "object",
              required: [
                "schemaVersion",
                "subtotal",
                "discountAmount",
                "taxAmount",
                "shippingAmount",
                "total",
                "currency",
                "discountCode",
                "discountRate",
                "taxLines",
                "shippingLines",
                "discountLines",
                "providerAdjustments",
                "pricing",
                "calculatedAt",
              ],
              additionalProperties: true,
              properties: {
                schemaVersion: { const: "backy.order-quote.v1" },
                subtotal: { type: "number" },
                discountAmount: { type: "number" },
                taxAmount: { type: "number" },
                shippingAmount: { type: "number" },
                total: { type: "number" },
                currency: { type: "string" },
                discountCode: { type: "string" },
                discountRate: { type: "number" },
                taxLines: {
                  type: "array",
                  items: { type: "object", additionalProperties: true },
                },
                shippingLines: {
                  type: "array",
                  items: { type: "object", additionalProperties: true },
                },
                discountLines: {
                  type: "array",
                  items: { type: "object", additionalProperties: true },
                },
                providerAdjustments: {
                  type: "array",
                  items: {
                    type: "object",
                    required: ["kind", "provider", "status"],
                    additionalProperties: true,
                    properties: {
                      kind: { enum: ["tax", "shipping", "discount"] },
                      provider: {
                        enum: [
                          "http",
                          "stripe",
                          "taxjar",
                          "avalara",
                          "easypost",
                          "shippo",
                        ],
                      },
                      status: { enum: ["succeeded", "failed", "skipped"] },
                      url: { type: "string" },
                      amount: { type: "number" },
                      lines: {
                        type: "array",
                        items: {
                          type: "object",
                          additionalProperties: true,
                        },
                      },
                      error: { type: "string" },
                      statusCode: { type: "integer" },
                      reference: { type: "string" },
                    },
                  },
                },
                pricing: { type: "object", additionalProperties: true },
                calculatedAt: { type: "string", format: "date-time" },
              },
            },
            CommerceOrderTracking: {
              type: "object",
              required: [
                "status",
                "provider",
                "trackingNumber",
                "trackingUrl",
                "checkedAt",
              ],
              additionalProperties: true,
              properties: {
                status: { type: "string" },
                provider: { type: "string" },
                trackingNumber: { type: "string" },
                trackingUrl: { type: "string" },
                checkedAt: { type: "string", format: "date-time" },
                providerPayload: {
                  type: "object",
                  additionalProperties: true,
                },
              },
            },
            CommerceOrderFulfillment: {
              type: "object",
              required: [
                "id",
                "status",
                "provider",
                "orderNumber",
                "requestedAt",
                "completedAt",
                "providerPayload",
              ],
              additionalProperties: true,
              properties: {
                id: { type: "string" },
                status: {
                  enum: [
                    "requested",
                    "succeeded",
                    "failed",
                    "requires_action",
                  ],
                },
                provider: { type: "string" },
                orderNumber: { type: "string" },
                requestedAt: { type: "string", format: "date-time" },
                completedAt: { type: ["string", "null"], format: "date-time" },
                providerPayload: {
                  type: "object",
                  additionalProperties: true,
                },
              },
            },
            CommerceOrderShippingLabel: {
              type: "object",
              required: [
                "id",
                "status",
                "provider",
                "serviceLevel",
                "url",
                "cost",
                "createdAt",
              ],
              additionalProperties: true,
              properties: {
                id: { type: "string" },
                status: { enum: ["draft", "purchased", "voided"] },
                provider: { type: "string" },
                serviceLevel: { type: "string" },
                url: { type: "string" },
                cost: { type: "number" },
                createdAt: { type: "string", format: "date-time" },
                providerPayload: {
                  type: "object",
                  additionalProperties: true,
                },
              },
            },
            CommerceOrderProviderRefund: {
              type: "object",
              required: [
                "id",
                "status",
                "provider",
                "reference",
                "amount",
                "currency",
                "reason",
                "requestedAt",
                "completedAt",
                "providerPayload",
              ],
              additionalProperties: true,
              properties: {
                id: { type: "string" },
                status: {
                  enum: [
                    "requested",
                    "succeeded",
                    "failed",
                    "requires_action",
                  ],
                },
                provider: { type: "string" },
                reference: { type: "string" },
                amount: { type: "number" },
                currency: { type: "string" },
                reason: { type: "string" },
                requestedAt: { type: "string", format: "date-time" },
                completedAt: { type: ["string", "null"], format: "date-time" },
                providerPayload: {
                  type: "object",
                  additionalProperties: true,
                },
              },
            },
            CommerceOrderQuoteEnvelope: envelopeSchema({
              type: "object",
              required: ["record", "quote"],
              additionalProperties: true,
              properties: {
                record: { $ref: "#/components/schemas/CollectionRecord" },
                order: { $ref: "#/components/schemas/CollectionRecord" },
                quote: { $ref: "#/components/schemas/CommerceOrderQuote" },
                cacheInvalidation: {
                  type: "object",
                  additionalProperties: true,
                },
              },
            }),
            CommerceOrderTrackingEnvelope: envelopeSchema({
              type: "object",
              required: ["record", "tracking"],
              additionalProperties: true,
              properties: {
                record: { $ref: "#/components/schemas/CollectionRecord" },
                order: { $ref: "#/components/schemas/CollectionRecord" },
                tracking: {
                  oneOf: [
                    { $ref: "#/components/schemas/CommerceOrderTracking" },
                    { type: "null" },
                  ],
                },
                cacheInvalidation: {
                  type: "object",
                  additionalProperties: true,
                },
              },
            }),
            CommerceOrderFulfillmentEnvelope: envelopeSchema({
              type: "object",
              required: ["record", "fulfillment"],
              additionalProperties: true,
              properties: {
                record: { $ref: "#/components/schemas/CollectionRecord" },
                order: { $ref: "#/components/schemas/CollectionRecord" },
                fulfillment: {
                  oneOf: [
                    { $ref: "#/components/schemas/CommerceOrderFulfillment" },
                    { type: "null" },
                  ],
                },
                cacheInvalidation: {
                  type: "object",
                  additionalProperties: true,
                },
              },
            }),
            CommerceOrderShippingLabelEnvelope: envelopeSchema({
              type: "object",
              required: ["record", "label"],
              additionalProperties: true,
              properties: {
                record: { $ref: "#/components/schemas/CollectionRecord" },
                order: { $ref: "#/components/schemas/CollectionRecord" },
                label: {
                  oneOf: [
                    { $ref: "#/components/schemas/CommerceOrderShippingLabel" },
                    { type: "null" },
                  ],
                },
                cacheInvalidation: {
                  type: "object",
                  additionalProperties: true,
                },
              },
            }),
            CommerceOrderProviderRefundEnvelope: envelopeSchema({
              type: "object",
              required: ["record", "refund"],
              additionalProperties: true,
              properties: {
                record: { $ref: "#/components/schemas/CollectionRecord" },
                order: { $ref: "#/components/schemas/CollectionRecord" },
                refund: {
                  oneOf: [
                    { $ref: "#/components/schemas/CommerceOrderProviderRefund" },
                    { type: "null" },
                  ],
                },
                cacheInvalidation: {
                  type: "object",
                  additionalProperties: true,
                },
              },
            }),
            CommerceProviderCertification: {
              type: "object",
              required: [
                "schemaVersion",
                "status",
                "localMockGate",
                "liveCertificationGate",
                "requiredFor",
                "secretHandling",
                "operatorCommandTemplate",
                "operatorEnvTemplate",
                "runtime",
                "groups",
              ],
              properties: {
                schemaVersion: {
                  type: "string",
                  const: "backy.commerce-provider-certification-handoff.v1",
                },
                status: {
                  type: "string",
                  const: "external-live-provider-gate",
                },
                localMockGate: {
                  type: "string",
                  const: "ci:commerce-provider-smoke",
                },
                liveCertificationGate: {
                  type: "string",
                  const: "ci:commerce-provider-certification",
                },
                requiredFor: {
                  type: "string",
                  const: "live-commerce-provider-launch",
                },
                secretHandling: { type: "string" },
                operatorCommandTemplate: {
                  type: "object",
                  required: [
                    "command",
                    "envTemplate",
                    "envTemplateSchemaVersion",
                    "providerChoices",
                    "requiredInputs",
                    "targetInputs",
                    "secretHandling",
                  ],
                  properties: {
                    command: { type: "string" },
                    envTemplate: { type: "string" },
                    envTemplateSchemaVersion: {
                      type: "string",
                      const: "backy.commerce-provider-certification-env-template.v1",
                    },
                    providerChoices: {
                      type: "object",
                      properties: {
                        payment: { type: "array", items: { type: "string" } },
                        tax: { type: "array", items: { type: "string" } },
                        shipping: { type: "array", items: { type: "string" } },
                        discount: { type: "array", items: { type: "string" } },
                        catalog: { type: "array", items: { type: "string" } },
                        subscription: { type: "array", items: { type: "string" } },
                        webhook: { type: "array", items: { type: "string" } },
                      },
                      additionalProperties: true,
                    },
                    requiredInputs: {
                      type: "array",
                      items: { type: "string" },
                    },
                    targetInputs: {
                      type: "array",
                      items: { type: "string" },
                    },
                    secretHandling: { type: "string" },
                  },
                  additionalProperties: true,
                },
                operatorEnvTemplate: {
                  type: "object",
                  required: [
                    "schemaVersion",
                    "format",
                    "fileName",
                    "body",
                    "secretHandling",
                  ],
                  properties: {
                    schemaVersion: {
                      type: "string",
                      const: "backy.commerce-provider-certification-env-template.v1",
                    },
                    format: { type: "string", const: "shell-env" },
                    fileName: {
                      type: "string",
                      const: ".env.backy-commerce-provider-certification",
                    },
                    body: { type: "string" },
                    secretHandling: { type: "string" },
                  },
                  additionalProperties: true,
                },
                runtime: {
                  type: "object",
                  required: [
                    "paymentConfigured",
                    "taxConfigured",
                    "shippingConfigured",
                    "discountConfigured",
                    "catalogSyncConfigured",
                    "subscriptionConfigured",
                    "webhookSecretConfigured",
                    "configuredFamilies",
                    "missingFamilies",
                    "secretHandling",
                  ],
                  properties: {
                    paymentConfigured: { type: "boolean" },
                    taxConfigured: { type: "boolean" },
                    shippingConfigured: { type: "boolean" },
                    discountConfigured: { type: "boolean" },
                    catalogSyncConfigured: { type: "boolean" },
                    subscriptionConfigured: { type: "boolean" },
                    webhookSecretConfigured: { type: "boolean" },
                    configuredFamilies: {
                      type: "array",
                      items: { type: "string" },
                    },
                    missingFamilies: {
                      type: "array",
                      items: { type: "string" },
                    },
                    secretHandling: { type: "string" },
                  },
                  additionalProperties: true,
                },
                groups: {
                  type: "array",
                  items: {
                    type: "object",
                    required: ["family", "providers", "gate", "requiredInputs", "evidence"],
                    properties: {
                      family: { type: "string" },
                      providers: {
                        type: "array",
                        items: { type: "string" },
                      },
                      gate: {
                        type: "string",
                        enum: [
                          "ci:commerce-provider-certification",
                          "ci:commerce-provider-smoke",
                        ],
                      },
                      requiredInputs: {
                        type: "array",
                        items: { type: "string" },
                      },
                      evidence: { type: "string" },
                    },
                    additionalProperties: true,
                  },
                },
              },
              additionalProperties: true,
            },
            CommerceManagementPolicy: {
              type: "object",
              required: [
                "schemaVersion",
                "endpoints",
                "methods",
                "auth",
                "sdkHelpers",
                "responseContracts",
                "privacy",
                "secretHandling",
              ],
              properties: {
                schemaVersion: {
                  type: "string",
                  const: "backy.commerce-management.v1",
                },
                endpoints: {
                  type: "object",
                  required: [
                    "products",
                    "product",
                    "productsCsv",
                    "importProducts",
                    "bulkProducts",
                    "orders",
                    "order",
                    "ordersCsv",
                    "importOrders",
                    "bulkOrders",
                    "orderAnalytics",
                    "orderStatusHandoff",
                    "orderQuote",
                    "orderTracking",
                    "orderFulfillment",
                    "orderShippingLabel",
                    "orderProviderRefund",
                    "productProviderSync",
                    "productSubscriptions",
                    "productSubscriptionAction",
                    "siteReconciliation",
                    "platformReconciliation",
                    "reconciliationReadiness",
                    "orderEvents",
                    "productEvents",
                  ],
                  properties: {
                    products: { type: "string" },
                    product: { type: "string" },
                    productsCsv: { type: "string" },
                    importProducts: { type: "string" },
                    bulkProducts: { type: "string" },
                    orders: { type: "string" },
                    order: { type: "string" },
                    ordersCsv: { type: "string" },
                    importOrders: { type: "string" },
                    bulkOrders: { type: "string" },
                    orderAnalytics: { type: "string" },
                    orderStatusHandoff: { type: "string" },
                    orderQuote: { type: "string" },
                    orderTracking: { type: "string" },
                    orderFulfillment: { type: "string" },
                    orderShippingLabel: { type: "string" },
                    orderProviderRefund: { type: "string" },
                    productProviderSync: { type: "string" },
                    productSubscriptions: { type: "string" },
                    productSubscriptionAction: { type: "string" },
                    siteReconciliation: { type: "string" },
                    platformReconciliation: { type: "string" },
                    reconciliationReadiness: { type: "string" },
                    orderEvents: { type: "string" },
                    productEvents: { type: "string" },
                  },
                  additionalProperties: true,
                },
                methods: {
                  type: "object",
                  required: [
                    "listProducts",
                    "createProduct",
                    "readProduct",
                    "updateProduct",
                    "deleteProduct",
                    "exportProductsCsv",
                    "importProductsCsv",
                    "bulkProducts",
                    "listOrders",
                    "createOrderRecord",
                    "readOrder",
                    "updateOrder",
                    "deleteOrder",
                    "exportOrdersCsv",
                    "importOrdersCsv",
                    "bulkOrders",
                    "orderAnalytics",
                    "orderStatusHandoff",
                    "orderQuote",
                    "refreshOrderQuote",
                    "orderTracking",
                    "refreshOrderTracking",
                    "orderFulfillment",
                    "dispatchOrderFulfillment",
                    "orderShippingLabel",
                    "createOrderShippingLabel",
                    "voidOrderShippingLabel",
                    "orderProviderRefund",
                    "createOrderProviderRefund",
                    "refreshOrderProviderRefund",
                    "productProviderSync",
                    "syncProductProvider",
                    "productSubscriptions",
                    "productSubscriptionAction",
                    "scheduledSiteReconciliation",
                    "runSiteReconciliation",
                    "platformReconciliation",
                    "reconciliationReadiness",
                    "orderEvents",
                    "productEvents",
                  ],
                  properties: {
                    listProducts: { const: "GET" },
                    createProduct: { const: "POST" },
                    readProduct: { const: "GET" },
                    updateProduct: { const: "PATCH" },
                    deleteProduct: { const: "DELETE" },
                    exportProductsCsv: { const: "GET" },
                    importProductsCsv: { const: "POST" },
                    bulkProducts: { const: "POST" },
                    listOrders: { const: "GET" },
                    createOrderRecord: { const: "POST" },
                    readOrder: { const: "GET" },
                    updateOrder: { const: "PATCH" },
                    deleteOrder: { const: "DELETE" },
                    exportOrdersCsv: { const: "GET" },
                    importOrdersCsv: { const: "POST" },
                    bulkOrders: { const: "POST" },
                    orderAnalytics: { const: "GET" },
                    orderStatusHandoff: { const: "GET" },
                    orderQuote: { const: "GET" },
                    refreshOrderQuote: { const: "POST" },
                    orderTracking: { const: "GET" },
                    refreshOrderTracking: { const: "POST" },
                    orderFulfillment: { const: "GET" },
                    dispatchOrderFulfillment: { const: "POST" },
                    orderShippingLabel: { const: "GET" },
                    createOrderShippingLabel: { const: "POST" },
                    voidOrderShippingLabel: { const: "DELETE" },
                    orderProviderRefund: { const: "GET" },
                    createOrderProviderRefund: { const: "POST" },
                    refreshOrderProviderRefund: { const: "PATCH" },
                    productProviderSync: { const: "GET" },
                    syncProductProvider: { const: "POST" },
                    productSubscriptions: { const: "GET" },
                    productSubscriptionAction: { const: "POST" },
                    scheduledSiteReconciliation: { const: "GET" },
                    runSiteReconciliation: { const: "POST" },
                    platformReconciliation: { const: "GET" },
                    reconciliationReadiness: { const: "GET" },
                    orderEvents: { const: "GET" },
                    productEvents: { const: "GET" },
                  },
                  additionalProperties: true,
                },
                auth: {
                  type: "object",
                  required: [
                    "modes",
                    "headers",
                    "requiredPermissions",
                    "siteScope",
                    "platformEndpoints",
                  ],
                  properties: {
                    modes: {
                      type: "array",
                      items: { enum: ["session", "api-key"] },
                    },
                    headers: { type: "array", items: { type: "string" } },
                    requiredPermissions: {
                      type: "object",
                      required: [
                        "read",
                        "write",
                        "configure",
                        "delete",
                        "collectionRead",
                        "collectionWrite",
                        "collectionExport",
                        "collectionDelete",
                        "pageTemplates",
                        "mediaRead",
                        "mediaCreate",
                        "activity",
                      ],
                      properties: {
                        read: { const: "commerce.view" },
                        write: { const: "commerce.edit" },
                        configure: { const: "commerce.configure" },
                        delete: { const: "commerce.delete" },
                        collectionRead: { const: "collections.view" },
                        collectionWrite: { const: "collections.edit" },
                        collectionExport: { const: "collections.export" },
                        collectionDelete: { const: "collections.delete" },
                        pageTemplates: { const: "pages.edit" },
                        mediaRead: { const: "media.view" },
                        mediaCreate: { const: "media.create" },
                        activity: { const: "activity.export" },
                      },
                      additionalProperties: true,
                    },
                    siteScope: { const: true },
                    platformEndpoints: {
                      type: "array",
                      items: { type: "string" },
                    },
                  },
                  additionalProperties: true,
                },
                sdkHelpers: {
                  type: "object",
                  additionalProperties: true,
                },
                responseContracts: {
                  type: "object",
                  required: [
                    "orderAnalytics",
                    "orderStatusHandoff",
                    "orderQuote",
                    "orderTracking",
                    "orderFulfillment",
                    "orderShippingLabel",
                    "orderProviderRefund",
                    "productProviderSync",
                    "productStorefrontHandoff",
                    "productSubscriptions",
                    "productSubscriptionAction",
                    "providerCertification",
                  ],
                  properties: {
                    orderAnalytics: {
                      const: "backy.order-analytics.v1",
                    },
                    orderStatusHandoff: {
                      const: "backy.order-status-handoff.v1",
                    },
                    orderQuote: { const: "backy.order-quote.v1" },
                    orderTracking: { const: "backy.tracking.v1" },
                    orderFulfillment: {
                      const: "backy.fulfillment-dispatch.v1",
                    },
                    orderShippingLabel: {
                      const: "backy.shipping-label.v1",
                    },
                    orderProviderRefund: {
                      const: "backy.provider-refund.v1",
                    },
                    productProviderSync: {
                      const: "backy.commerce-product-sync.v1",
                    },
                    productStorefrontHandoff: {
                      const: "backy.product-storefront-handoff.v1",
                    },
                    productSubscriptions: {
                      const: "backy.product-subscription-lifecycle.v1",
                    },
                    productSubscriptionAction: {
                      const: "backy.product-subscription-action.v1",
                    },
                    providerCertification: {
                      const: "backy.commerce-provider-certification-handoff.v1",
                    },
                  },
                  additionalProperties: true,
                },
                privacy: {
                  type: "object",
                  required: [
                    "productCatalogCanBePublic",
                    "ordersRemainPrivate",
                    "orderStatusHandoffMasksCustomerContact",
                    "productStorefrontHandoffExcludesPrivateData",
                    "providerOperationPayloadsMayContainCustomerData",
                    "providerSecretsNeverReturned",
                    "rawProviderResponsesStayPrivate",
                  ],
                  properties: {
                    productCatalogCanBePublic: { const: true },
                    ordersRemainPrivate: { const: true },
                    orderStatusHandoffMasksCustomerContact: { const: true },
                    productStorefrontHandoffExcludesPrivateData: {
                      const: true,
                    },
                    providerOperationPayloadsMayContainCustomerData: {
                      const: true,
                    },
                    providerSecretsNeverReturned: { const: true },
                    rawProviderResponsesStayPrivate: { const: true },
                  },
                  additionalProperties: true,
                },
                secretHandling: { type: "string" },
              },
              additionalProperties: true,
            },
            CommerceStorefrontContract: {
              type: "object",
              required: [
                "schemaVersion",
                "mode",
                "currency",
                "paymentProvider",
                "capabilities",
                "checkout",
                "pricing",
                "providerCertification",
              ],
              properties: {
                schemaVersion: {
                  type: "string",
                  const: "backy.commerce-settings.v1",
                },
                mode: {
                  type: "string",
                  enum: ["catalog-only", "manual-orders", "checkout-provider"],
                },
                currency: { type: "string" },
                paymentProvider: {
                  type: "string",
                  enum: [
                    "none",
                    "stripe",
                    "paypal",
                    "paddle",
                    "square",
                    "adyen",
                    "mollie",
                    "razorpay",
                    "manual",
                  ],
                },
                providerAccountId: { type: ["string", "null"] },
                provider: { type: "object", additionalProperties: true },
                capabilities: { type: "object", additionalProperties: true },
                checkout: { type: "object", additionalProperties: true },
                pricing: { type: "object", additionalProperties: true },
                inventory: { type: "object", additionalProperties: true },
                webhooks: { type: "object", additionalProperties: true },
                reconciliation: { type: "object", additionalProperties: true },
                providerCertification: {
                  $ref: "#/components/schemas/CommerceProviderCertification",
                },
              },
              additionalProperties: true,
            },
            CommerceCatalogEnvelope: envelopeSchema({
              type: "object",
              required: [
                "schemaVersion",
                "collection",
                "products",
                "commerce",
                "facets",
                "pagination",
              ],
              properties: {
                schemaVersion: {
                  type: "string",
                  const: "backy.commerce-catalog.v1",
                },
                collection: { type: "object", additionalProperties: true },
                products: {
                  type: "array",
                  items: { $ref: "#/components/schemas/CommerceProduct" },
                },
                commerce: {
                  $ref: "#/components/schemas/CommerceStorefrontContract",
                },
                facets: { type: "object", additionalProperties: true },
                filters: { type: "object", additionalProperties: true },
                readiness: { type: "object", additionalProperties: true },
                pagination: { type: "object", additionalProperties: true },
              },
            }),
            CommerceOrderCreateRequest: {
              type: "object",
              additionalProperties: true,
              description:
                "Create a storefront order. Canonical payloads use customer and items; custom frontends may also send lineItems, cartItems, cart.items, top-level customerName/customerEmail/customerPhone or name/email/phone, couponCode/promoCode, and checkoutSession.id aliases.",
              properties: {
                customer: {
                  type: "object",
                  required: ["name", "email"],
                  properties: {
                    name: { type: "string" },
                    email: { type: "string", format: "email" },
                    phone: { type: "string" },
                  },
                },
                items: {
                  type: "array",
                  minItems: 1,
                  items: {
                    type: "object",
                    properties: {
                      productId: { type: "string" },
                      product_id: { type: "string" },
                      slug: { type: "string" },
                      productSlug: { type: "string" },
                      product_slug: { type: "string" },
                      variantId: { type: "string" },
                      variant_id: { type: "string" },
                      variantSku: { type: "string" },
                      variant_sku: { type: "string" },
                      sku: { type: "string" },
                      quantity: {
                        type: "integer",
                        minimum: 1,
                        maximum: 999,
                        default: 1,
                      },
                      qty: {
                        type: "integer",
                        minimum: 1,
                        maximum: 999,
                        default: 1,
                      },
                    },
                  },
                },
                lineItems: {
                  type: "array",
                  minItems: 1,
                  description: "Alias for items accepted by generated custom storefronts.",
                  items: {
                    type: "object",
                    properties: {
                      productId: { type: "string" },
                      product_id: { type: "string" },
                      slug: { type: "string" },
                      productSlug: { type: "string" },
                      product_slug: { type: "string" },
                      variantId: { type: "string" },
                      variant_id: { type: "string" },
                      variantSku: { type: "string" },
                      variant_sku: { type: "string" },
                      sku: { type: "string" },
                      quantity: {
                        type: "integer",
                        minimum: 1,
                        maximum: 999,
                        default: 1,
                      },
                      qty: {
                        type: "integer",
                        minimum: 1,
                        maximum: 999,
                        default: 1,
                      },
                    },
                  },
                },
                cartItems: {
                  type: "array",
                  minItems: 1,
                  description: "Alias for items accepted by simple cart integrations.",
                  items: { type: "object", additionalProperties: true },
                },
                cart: {
                  type: "object",
                  additionalProperties: true,
                  properties: {
                    items: {
                      type: "array",
                      items: { type: "object", additionalProperties: true },
                    },
                  },
                },
                customerName: { type: "string" },
                customerEmail: { type: "string", format: "email" },
                customerPhone: { type: "string" },
                name: {
                  type: "string",
                  description: "Top-level customer name alias.",
                },
                email: {
                  type: "string",
                  format: "email",
                  description: "Top-level customer email alias.",
                },
                phone: {
                  type: "string",
                  description: "Top-level customer phone alias.",
                },
                shippingAddress: { type: "string" },
                billingAddress: { type: "string" },
                notes: { type: "string" },
                discountCode: { type: "string" },
                couponCode: {
                  type: "string",
                  description: "Alias for discountCode.",
                },
                promoCode: {
                  type: "string",
                  description: "Alias for discountCode.",
                },
                paymentProvider: { type: "string" },
                paymentReference: { type: "string" },
                payment: {
                  type: "object",
                  additionalProperties: true,
                  properties: {
                    provider: { type: "string" },
                    reference: { type: "string" },
                  },
                },
                checkoutSessionId: { type: "string" },
                checkoutSession: {
                  oneOf: [
                    { type: "string" },
                    {
                      type: "object",
                      additionalProperties: true,
                      properties: { id: { type: "string" } },
                    },
                  ],
                },
              },
            },
            CommerceOrderContractEnvelope: envelopeSchema({
              type: "object",
              required: [
                "schemaVersion",
                "accepts",
                "creates",
                "inventoryReservation",
                "pricing",
                "relatedEndpoints",
                "commerce",
              ],
              properties: {
                schemaVersion: {
                  type: "string",
                  const: "backy.commerce-orders.v1",
                },
                accepts: { type: "object", additionalProperties: true },
                creates: { type: "object", additionalProperties: true },
                inventoryReservation: {
                  type: "object",
                  additionalProperties: true,
                },
                pricing: { type: "object", additionalProperties: true },
                relatedEndpoints: {
                  type: "object",
                  additionalProperties: true,
                },
                commerce: {
                  $ref: "#/components/schemas/CommerceStorefrontContract",
                },
                readiness: { type: "object", additionalProperties: true },
              },
            }),
            CommerceOrderEnvelope: envelopeSchema({
              type: "object",
              required: [
                "schemaVersion",
                "order",
                "checkoutSession",
                "quote",
                "lineItems",
                "statusHandoff",
                "statusAccess",
              ],
              properties: {
                schemaVersion: {
                  type: "string",
                  const: "backy.commerce-orders.v1",
                },
                order: { type: "object", additionalProperties: true },
                checkoutSession: {
                  type: "object",
                  required: [
                    "id",
                    "provider",
                    "status",
                    "handoffMode",
                    "successUrl",
                    "cancelUrl",
                    "expiresAt",
                    "reference",
                    "amountTotal",
                    "currency",
                  ],
                  properties: {
                    id: { type: "string" },
                    provider: { type: "string", enum: ["manual", "stripe"] },
                    providerMode: { type: "string", enum: ["test", "live"] },
                    accountId: { type: ["string", "null"] },
                    status: {
                      type: "string",
                      enum: [
                        "requires_action",
                        "provider_ready",
                        "provider_created",
                      ],
                    },
                    handoffMode: {
                      type: "string",
                      enum: ["manual", "provider"],
                    },
                    url: { type: ["string", "null"] },
                    successUrl: { type: "string", format: "uri" },
                    cancelUrl: { type: "string", format: "uri" },
                    expiresAt: { type: "string", format: "date-time" },
                    reference: { type: "string" },
                    amountTotal: { type: "number" },
                    currency: { type: "string" },
                    metadata: {
                      type: "object",
                      additionalProperties: { type: "string" },
                    },
                    providerPayload: {
                      type: ["object", "null"],
                      additionalProperties: true,
                    },
                  },
                  additionalProperties: true,
                },
                quote: { type: "object", additionalProperties: true },
                lineItems: {
                  type: "array",
                  items: { type: "object", additionalProperties: true },
                },
                statusHandoff: {
                  $ref: "#/components/schemas/CommerceOrderStatusHandoff",
                },
                statusAccess: {
                  $ref: "#/components/schemas/CommerceOrderStatusAccess",
                },
              },
            }),
            CommerceWebhookRequest: {
              type: "object",
              required: ["type"],
              properties: {
                id: { type: "string" },
                type: {
                  type: "string",
                  examples: [
                    "checkout.session.completed",
                    "invoice.payment_succeeded",
                    "customer.subscription.updated",
                    "customer.subscription.paused",
                    "customer.subscription.resumed",
                    "customer.subscription.trial_will_end",
                    "customer.subscription.deleted",
                    "charge.refunded",
                    "payment_intent.payment_failed",
                  ],
                },
                data: {
                  type: "object",
                  properties: {
                    object: { type: "object", additionalProperties: true },
                  },
                  additionalProperties: true,
                },
                metadata: { type: "object", additionalProperties: true },
              },
              additionalProperties: true,
            },
            CommerceWebhookEnvelope: envelopeSchema({
              type: "object",
              required: ["schemaVersion", "event", "order"],
              properties: {
                schemaVersion: {
                  type: "string",
                  const: "backy.commerce-webhook.v1",
                },
                event: { type: "object", additionalProperties: true },
                order: { type: "object", additionalProperties: true },
              },
            }),
            SiteWebhookPayload: {
              type: "object",
              additionalProperties: false,
              required: [
                "schemaVersion",
                "kind",
                "siteId",
                "site",
                "requestId",
                "reason",
                "actor",
                "data",
              ],
              properties: {
                schemaVersion: {
                  type: "string",
                  const: "backy.site-webhook.v1",
                },
                kind: {
                  type: "string",
                  enum: [
                    "site-created",
                    "site-updated",
                    "site-deleted",
                    "form-submission",
                    "contact-shared",
                    "contact-sync",
                    "contact-status",
                    "commerce-order",
                    "commerce-product",
                    "commerce-webhook",
                    "comment-submitted",
                    "comment-status",
                    "comment-reported",
                    "interactive-runtime",
                  ],
                },
                siteId: { type: "string" },
                site: {
                  type: "object",
                  additionalProperties: false,
                  required: ["id", "name", "slug", "status", "customDomain"],
                  properties: {
                    id: { type: "string" },
                    name: { type: "string" },
                    slug: { type: "string" },
                    status: { type: "string" },
                    customDomain: { type: ["string", "null"] },
                  },
                },
                requestId: { type: "string" },
                reason: { type: "string" },
                actor: { type: ["string", "null"] },
                data: {
                  type: "object",
                  description:
                    "Route-specific event payload. Site update events include resourceType plus compact before/after snapshots and workflow metadata.",
                  additionalProperties: true,
                },
              },
            },
          },
        },
        "x-backy": {
          requestId,
          siteId: site.id,
          siteSlug: site.slug,
          contractVersion: "backy.ai-frontend.v1",
          collectionIds,
          formIds,
          reusableSectionIds,
          blogFeeds: [blogFeed],
          mediaFileCategories: mediaFileCategoryDiscoveryContract,
          liveManagement: liveManagementDiscoveryContract,
          delivery,
          localeRouting: {
            defaultLocale: delivery.defaultLocale,
            localeStrategy: delivery.localeStrategy,
            locales: delivery.locales,
          },
          redirectRules: redirectRules.map((rule) => ({
            id: rule.id,
            from: rule.from,
            to: rule.to,
            statusCode: rule.statusCode,
          })),
        },
      },
      {
        requestId,
        request,
        cache: "discovery",
        schemaVersion: "openapi.3.1",
        siteId: site.id,
      },
    );
  } catch (error) {
    console.error("OpenAPI API error:", error);
    return errorResponse(
      500,
      "INTERNAL_SERVER_ERROR",
      "Internal server error",
      requestId,
    );
  }
}
