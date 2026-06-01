/**
 * Site-scoped admin settings endpoint.
 *
 * GET   /api/admin/sites/[siteId]/settings
 * PATCH /api/admin/sites/[siteId]/settings
 */

import { NextRequest, NextResponse } from "next/server";
import { DEFAULT_SITE_SETTINGS, type SiteSettings } from "@backy-cms/core";
import { requireAdminAccess } from "@/lib/adminAccess";
import { recordAdminAudit } from "@/lib/adminAudit";
import {
  getAdminSettings,
  getSiteByIdOrSlug,
  updateAdminSite,
} from "@/lib/backyStore";
import { getMediaStorageConfigSummary } from "@/lib/mediaStorage";
import { normalizeFrontendDesignContract } from "@/lib/frontendDesignContract";
import { normalizeNavigationConfig } from "@/lib/navigation";
import { publicContractJson } from "@/lib/publicContractResponse";
import { normalizeRedirectRules } from "@/lib/redirectRules";
import {
  getRequiredDatabaseRepositories,
  resolvePublicRepositoryRuntimeConfig,
  shouldUseDemoStoreFallback,
} from "@/lib/repositoryRuntime";
import { normalizeSiteLocalization } from "@/lib/siteLocalization";
import { deliverSiteWebhooks } from "@/lib/siteWebhookDelivery";

export const runtime = "nodejs";

interface RouteParams {
  params: Promise<{
    siteId: string;
  }>;
}

const SITE_SETTINGS_SCOPE_SCHEMA = "backy.site-settings-scope.v1";

type FrontendDatabaseCertificationEnvAlias = "BACKY_DATABASE_URL" | "DATABASE_URL";

type FrontendDatabaseCertificationCommandOptions = {
  databaseEnvAlias: FrontendDatabaseCertificationEnvAlias;
  disposableConfirmed: boolean;
  expectedHost: string;
  expectedDatabase: string;
  includeReleaseDoctor: boolean;
};

const FRONTEND_DATABASE_CERTIFICATION_ENV_ALIASES: FrontendDatabaseCertificationEnvAlias[] = [
  "BACKY_DATABASE_URL",
  "DATABASE_URL",
];

const DEFAULT_FRONTEND_DATABASE_CERTIFICATION_COMMAND_OPTIONS = {
  databaseEnvAlias: "BACKY_DATABASE_URL",
  disposableConfirmed: true,
  expectedHost: "",
  expectedDatabase: "",
  includeReleaseDoctor: true,
} satisfies FrontendDatabaseCertificationCommandOptions;

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

type SiteSettingsScopedSite = {
  id: string;
  slug: string;
  teamId?: string | null;
  settings?: SiteSettings;
};

const makeRequestId = () =>
  `req_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;

const quoteShellValue = (value: string): string =>
  `'${value.replace(/'/g, "'\\''")}'`;

const quoteEnvTemplateValue = (value: string): string =>
  /^[A-Za-z0-9_./:@-]+$/.test(value) ? value : quoteShellValue(value);

const envValue = (keys: string[]): string => {
  for (const key of keys) {
    const value = process.env[key]?.trim();
    if (value) {
      return value;
    }
  }
  return "";
};

const stringField = (source: unknown, key: string): string => {
  if (!source || typeof source !== "object" || Array.isArray(source)) {
    return "";
  }
  const value = (source as Record<string, unknown>)[key];
  return typeof value === "string" ? value.trim() : "";
};

const booleanEnvEnabled = (key: string): boolean => {
  const value = process.env[key]?.trim().toLowerCase();
  return value === "1" || value === "true" || value === "yes" || value === "on";
};

const normalizeCorsOrigin = (origin: string) => {
  const trimmed = origin.trim();
  if (!trimmed || trimmed === "*") {
    return null;
  }

  try {
    return new URL(trimmed).origin;
  } catch {
    return null;
  }
};

const buildFrontendDatabaseCertificationEnvEntries = (
  options: FrontendDatabaseCertificationCommandOptions,
): Array<[string, string]> => {
  const envEntries: Array<[string, string]> = [
    ["BACKY_DATA_MODE", "database"],
    ["BACKY_SDK_REQUIRE_DATABASE", "1"],
    [
      "BACKY_DATABASE_DISPOSABLE_CONFIRMED",
      options.disposableConfirmed ? "true" : "<confirm-disposable-db-first>",
    ],
  ];

  if (options.includeReleaseDoctor) {
    envEntries.unshift(
      ["BACKY_RELEASE_CERTIFY_DATABASE", "1"],
      ["BACKY_RELEASE_CERTIFICATION_DOCTOR_REQUIRED", "1"],
    );
  }

  const expectedHost = options.expectedHost.trim();
  const expectedDatabase = options.expectedDatabase.trim();
  if (expectedHost) {
    envEntries.push(["BACKY_DATABASE_CERTIFICATION_EXPECTED_HOST", expectedHost]);
  }
  if (expectedDatabase) {
    envEntries.push(["BACKY_DATABASE_CERTIFICATION_EXPECTED_DATABASE", expectedDatabase]);
  }

  return envEntries;
};

const buildFrontendDatabaseCertificationCommand = (
  options: FrontendDatabaseCertificationCommandOptions,
): string => {
  const envEntries = buildFrontendDatabaseCertificationEnvEntries(options);

  return [
    `# Store the disposable database URL in ${options.databaseEnvAlias} as a CI secret or local shell env.`,
    `# export ${options.databaseEnvAlias}='<postgres-url>'`,
    ...envEntries.map(([key, value]) => `export ${key}=${quoteShellValue(value)}`),
    "",
    ...(options.includeReleaseDoctor ? ["npm run doctor:release-certification"] : []),
    "npm run ci:sdk-postgres-smoke",
  ].join("\n");
};

const buildFrontendDatabaseCertificationEnvTemplate = (
  options: FrontendDatabaseCertificationCommandOptions,
): string => {
  const envEntries = buildFrontendDatabaseCertificationEnvEntries(options);

  return [
    "# Backy frontend SDK database certification environment",
    "# Keep the disposable database URL in CI secrets or local shell variables.",
    `${options.databaseEnvAlias}=<disposable-postgres-url>`,
    ...envEntries.map(([key, value]) => `${key}=${quoteEnvTemplateValue(value)}`),
  ].join("\n");
};

const buildFrontendDatabaseCertificationRequiredInputs = (
  options: FrontendDatabaseCertificationCommandOptions,
): string[] => [
  `${options.databaseEnvAlias}=<disposable-postgres-url>`,
  "BACKY_DATA_MODE=database",
  "BACKY_SDK_REQUIRE_DATABASE=1",
  "BACKY_DATABASE_DISPOSABLE_CONFIRMED=true",
  "disposable migrated Supabase/Postgres database",
  "public manifest/OpenAPI/render/media/forms/interactive-component migrations with RLS policies",
  ...(options.expectedHost.trim() ? ["BACKY_DATABASE_CERTIFICATION_EXPECTED_HOST"] : []),
  ...(options.expectedDatabase.trim() ? ["BACKY_DATABASE_CERTIFICATION_EXPECTED_DATABASE"] : []),
  ...(options.includeReleaseDoctor
    ? ["BACKY_RELEASE_CERTIFY_DATABASE=1", "BACKY_RELEASE_CERTIFICATION_DOCTOR_REQUIRED=1"]
    : []),
];

const FRONTEND_DATABASE_CERTIFICATION_OPERATOR_COMMAND_TEMPLATE = {
  command: buildFrontendDatabaseCertificationCommand(
    DEFAULT_FRONTEND_DATABASE_CERTIFICATION_COMMAND_OPTIONS,
  ),
  envTemplate: buildFrontendDatabaseCertificationEnvTemplate(
    DEFAULT_FRONTEND_DATABASE_CERTIFICATION_COMMAND_OPTIONS,
  ),
  envTemplateSchemaVersion: "backy.frontend-database-certification-env-template.v1",
  databaseUrlAliases: FRONTEND_DATABASE_CERTIFICATION_ENV_ALIASES,
  requiredInputs: buildFrontendDatabaseCertificationRequiredInputs(
    DEFAULT_FRONTEND_DATABASE_CERTIFICATION_COMMAND_OPTIONS,
  ),
  targetGuards: [
    "BACKY_DATABASE_CERTIFICATION_EXPECTED_HOST",
    "BACKY_DATABASE_CERTIFICATION_EXPECTED_DATABASE",
  ],
  secretHandling:
    "Disposable database URLs stay in CI secrets or local shell environment variables; this template only emits non-secret aliases and placeholders.",
};

const getPublicApiRuntimeSummary = () => {
  const rawAllowedOrigins = envValue(["BACKY_CORS_ALLOWED_ORIGINS"]);
  const allowedOrigins = rawAllowedOrigins
    .split(",")
    .map(normalizeCorsOrigin)
    .filter((origin): origin is string => Boolean(origin));

  return {
    corsAllowedOriginsConfigured: allowedOrigins.length > 0,
    corsAllowedOriginCount: allowedOrigins.length,
    allowedOrigins,
    exactOriginPolicy: true,
    wildcardAllowed: false,
    exposedContractHeaders: [
      "ETag",
      "x-backy-request-id",
      "x-backy-contract-version",
      "x-backy-schema-version",
      "x-backy-supported-schema-versions",
      "x-backy-cache-scope",
      "x-backy-cache-revision",
      "x-backy-site-id",
    ],
    missing: allowedOrigins.length > 0 ? [] : ["BACKY_CORS_ALLOWED_ORIGINS"],
  };
};

const getDatabaseRuntimeSummary = () => {
  if (shouldUseDemoStoreFallback()) {
    return {
      mode: "demo",
      provider: "local-json",
      configured: true,
      missing: [] as string[],
      note: "Backy is using local JSON persistence in this environment.",
    };
  }

  try {
    const config = resolvePublicRepositoryRuntimeConfig();
    const database = config.database;
    const url = database?.url;
    const host = url ? new URL(url).host : undefined;

    return {
      mode: config.mode,
      provider: database?.type || "unknown",
      configured: config.mode === "database" && Boolean(database?.path || database?.url),
      host,
      database: database?.name,
      path: database?.type === "sqlite" ? database.path : undefined,
      logging: Boolean(database?.logging),
      missing:
        config.mode === "database" && !database?.path && !database?.url
          ? ["BACKY_DATABASE_URL or DATABASE_URL"]
          : ([] as string[]),
    };
  } catch (error) {
    return {
      mode: "database",
      provider: "unknown",
      configured: false,
      missing: ["BACKY_DATABASE_TYPE", "BACKY_DATABASE_URL or DATABASE_URL"],
      error:
        error instanceof Error
          ? error.message
          : "Unable to resolve database runtime.",
    };
  }
};

const getSupabaseRuntimeSummary = () => {
  const url = envValue([
    "BACKY_SUPABASE_URL",
    "SUPABASE_URL",
    "NEXT_PUBLIC_SUPABASE_URL",
  ]);
  const anonKey = envValue([
    "BACKY_SUPABASE_ANON_KEY",
    "SUPABASE_ANON_KEY",
    "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  ]);
  const serviceKey = envValue([
    "BACKY_SUPABASE_SERVICE_ROLE_KEY",
    "SUPABASE_SERVICE_ROLE_KEY",
  ]);
  const bucket = envValue(["BACKY_SUPABASE_STORAGE_BUCKET", "BACKY_STORAGE_BUCKET"]);
  const databaseUrl = envValue(["BACKY_DATABASE_URL", "DATABASE_URL"]);
  const missing = [
    !url ? "BACKY_SUPABASE_URL or SUPABASE_URL" : "",
    !anonKey && !serviceKey ? "Supabase API key" : "",
  ].filter(Boolean);

  return {
    configured: missing.length === 0,
    projectUrl: url,
    anonKeyConfigured: Boolean(anonKey),
    serviceRoleConfigured: Boolean(serviceKey),
    databaseUrlConfigured: Boolean(databaseUrl),
    storageBucket: bucket,
    missing,
  };
};

const getFrontendDatabaseCertificationRuntime = (
  database: ReturnType<typeof getDatabaseRuntimeSummary>,
  publicApi: ReturnType<typeof getPublicApiRuntimeSummary>,
) => {
  const databaseUrlAlias =
    FRONTEND_DATABASE_CERTIFICATION_ENV_ALIASES.find((key) =>
      Boolean(process.env[key]?.trim()),
    ) || null;
  const expectedHostConfigured = Boolean(
    process.env.BACKY_DATABASE_CERTIFICATION_EXPECTED_HOST?.trim(),
  );
  const expectedDatabaseConfigured = Boolean(
    process.env.BACKY_DATABASE_CERTIFICATION_EXPECTED_DATABASE?.trim(),
  );
  const disposableConfirmed = booleanEnvEnabled("BACKY_DATABASE_DISPOSABLE_CONFIRMED");
  const dataMode = stringField(process.env, "BACKY_DATA_MODE") || database.mode;
  const databaseUrlConfigured = Boolean(databaseUrlAlias);
  const missing = [
    ...(dataMode === "demo" ? ["BACKY_DATA_MODE=database"] : []),
    ...(!databaseUrlConfigured ? ["BACKY_DATABASE_URL or DATABASE_URL"] : []),
    ...(!disposableConfirmed ? ["BACKY_DATABASE_DISPOSABLE_CONFIRMED=true"] : []),
  ];

  return {
    dataMode,
    databaseProvider: database.provider,
    databaseHostConfigured: Boolean(database.host),
    databaseNameConfigured: Boolean(database.database),
    databaseUrlConfigured,
    databaseUrlAlias,
    disposableConfirmed,
    expectedHostConfigured,
    expectedDatabaseConfigured,
    publicApiReady: publicApi.missing.length === 0,
    readyForCertification:
      dataMode !== "demo" && databaseUrlConfigured && disposableConfirmed,
    missing,
    secretHandling:
      "Database URLs and service credentials stay in CI/runtime environment variables; site Settings admin API returns only alias names, booleans, and target guard presence.",
  };
};

const buildFrontendDatabaseCertificationScenarioEvidence = (
  runtime: ReturnType<typeof getFrontendDatabaseCertificationRuntime>,
) => {
  const countEvidence = (...values: boolean[]) =>
    values.filter(Boolean).length;
  const coverageSet = new Set<string>(FRONTEND_DATABASE_CERTIFICATION_COVERAGE);
  const evidenceCounts: Record<string, number> = {
    "manifest-openapi-discovery": countEvidence(
      coverageSet.has("manifest"),
      coverageSet.has("openapi"),
      runtime.publicApiReady,
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
      status: evidenceCount > 0 ? ("covered" as const) : ("missing" as const),
    };
  });
  const covered = scenarios.filter((scenario) => scenario.status === "covered")
    .length;

  return {
    schemaVersion: "backy.frontend-database-certification-evidence.v1",
    status: covered === scenarios.length ? ("ready" as const) : ("attention" as const),
    requiredGate: "BACKY_DATABASE_DISPOSABLE_CONFIRMED=true npm run ci:sdk-postgres-smoke",
    coverage: {
      covered,
      total: scenarios.length,
      missing: scenarios
        .filter((scenario) => scenario.status === "missing")
        .map((scenario) => scenario.key),
    },
    scenarios,
    secretHandling:
      "Frontend database certification evidence reports scenario names, counts, gates, and non-secret contract families only; database URLs, service credentials, private orders, submissions, and contact payloads stay private.",
  };
};

const frontendDatabaseCertificationContract = (
  runtime: ReturnType<typeof getFrontendDatabaseCertificationRuntime>,
  scenarioEvidence: ReturnType<
    typeof buildFrontendDatabaseCertificationScenarioEvidence
  >,
) => ({
  generatedAt: new Date().toISOString(),
  schemaVersion: "backy.frontend-database-certification.v1",
  status: "external-database-gate",
  requiredFor: "production-custom-frontends",
  source: "admin-site-settings-api",
  gate: {
    command: "npm run ci:sdk-postgres-smoke",
    workflow: ".github/workflows/sdk-postgres-smoke.yml",
    localPreflight: "npm run test:sdk-postgres-preflight-contract",
    disposableGuard: "npm run test:sdk-postgres-disposable-guard",
    typeContract: "npm run test:frontend-contract-types",
  },
  environment: {
    dataMode: "database",
    secretAliases: [...FRONTEND_DATABASE_CERTIFICATION_ENV_ALIASES],
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
  runtime,
  scenarioEvidence,
  operatorCommandTemplate: FRONTEND_DATABASE_CERTIFICATION_OPERATOR_COMMAND_TEMPLATE,
  operatorEnvTemplate: {
    schemaVersion: "backy.frontend-database-certification-env-template.v1",
    format: "shell-env",
    fileName: ".env.backy-frontend-database-certification",
    body: FRONTEND_DATABASE_CERTIFICATION_OPERATOR_COMMAND_TEMPLATE.envTemplate,
    secretHandling:
      "Generated template values are non-secret aliases and placeholders; replace the database URL placeholder with a disposable migrated Supabase/Postgres secret before execution.",
  },
  secretHandling:
    "Database URLs and service credentials stay in CI/runtime environment; site Settings admin responses expose only non-secret gate names, aliases, runtime booleans, and scenario evidence.",
});

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
    {
      status,
      requestId,
      cache: "private",
      schemaVersion: SITE_SETTINGS_SCOPE_SCHEMA,
    },
  );

const siteSettingsContractJson = (
  siteId: string,
  requestId: string,
  settings: ReturnType<typeof siteSettingsEnvelope>,
) =>
  publicContractJson(
    {
      success: true,
      requestId,
      data: {
        settings,
      },
    },
    {
      requestId,
      cache: "private",
      schemaVersion: SITE_SETTINGS_SCOPE_SCHEMA,
      siteId,
    },
  );

const parseJsonBody = async (
  request: NextRequest,
): Promise<Record<string, unknown>> => {
  try {
    const body = await request.json();
    return body && typeof body === "object" && !Array.isArray(body)
      ? (body as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const settingsPatchFromBody = (body: Record<string, unknown>) => {
  if (isRecord(body.settings)) {
    return body.settings;
  }

  return body;
};

const siteSettingsPatchKeys = [
  "seo",
  "analytics",
  "social",
  "commentPolicy",
  "redirectRules",
  "navigation",
  "localization",
  "domainVerification",
  "domainAliases",
  "vercelDeployment",
  "billingQuota",
  "webhooks",
  "frontendDesign",
];

const sanitizeStringRecord = (value: unknown): Record<string, string> => {
  if (!isRecord(value)) {
    return {};
  }

  return Object.entries(value).reduce<Record<string, string>>(
    (acc, [key, entry]) => {
      if (typeof entry === "string") {
        acc[key] = entry;
      }
      return acc;
    },
    {},
  );
};

const normalizeDomainAliasHost = (value: unknown): string => (
  typeof value === "string"
    ? value
        .trim()
        .toLowerCase()
        .replace(/^https?:\/\//, "")
        .split("/")[0]
        ?.replace(/\/+$/, "") || ""
    : ""
);

const normalizeDomainAliasesPatch = (
  value: unknown,
  current?: SiteSettings["domainAliases"],
): NonNullable<SiteSettings["domainAliases"]> => {
  type DomainAliasSettings = NonNullable<SiteSettings["domainAliases"]>[number];
  const currentByHost = new Map(
    (Array.isArray(current) ? current : [])
      .map((alias) => [normalizeDomainAliasHost(alias.host), alias] as const)
      .filter(([host]) => Boolean(host)),
  );
  const seen = new Set<string>();

  return (Array.isArray(value) ? value : [])
    .flatMap((entry): DomainAliasSettings[] => {
      if (!isRecord(entry)) return [];
      const host = normalizeDomainAliasHost(entry.host);
      if (!host || seen.has(host)) return [];
      seen.add(host);
      const existing = currentByHost.get(host);
      const status = ["not_started", "pending", "verified", "failed"].includes(String(entry.status))
        ? (entry.status as NonNullable<SiteSettings["domainAliases"]>[number]["status"])
        : existing?.status || "pending";

      return [{
        id: typeof entry.id === "string" && entry.id.trim()
          ? entry.id.trim()
          : existing?.id || `domain-alias-${host.replace(/[^a-z0-9]+/g, "-")}`,
        host,
        kind:
          entry.kind === "subdomain" ||
          entry.kind === "root" ||
          entry.kind === "locale" ||
          entry.kind === "redirect"
            ? entry.kind
            : existing?.kind || "alias",
        status,
        requestedAt:
          typeof entry.requestedAt === "string"
            ? entry.requestedAt
            : existing?.requestedAt || null,
        verifiedAt:
          status === "verified"
            ? typeof entry.verifiedAt === "string"
              ? entry.verifiedAt
              : existing?.verifiedAt || null
            : null,
        lastError:
          entry.lastError === null
            ? null
            : typeof entry.lastError === "string"
              ? entry.lastError
              : existing?.lastError || null,
      }];
    })
    .slice(0, 100);
};

const filteredSiteSettingsPatch = (value: Record<string, unknown>) =>
  siteSettingsPatchKeys.reduce<Record<string, unknown>>((acc, key) => {
    if (value[key] !== undefined) {
      acc[key] = value[key];
    }
    return acc;
  }, {});

const unsupportedSiteSettingsKeys = (value: Record<string, unknown>) =>
  Object.keys(value).filter((key) => !siteSettingsPatchKeys.includes(key));

const mergeSiteSettings = (
  current: SiteSettings | undefined,
  input: Record<string, unknown>,
): SiteSettings => {
  const base = {
    ...DEFAULT_SITE_SETTINGS,
    ...(current || {}),
  } as SiteSettings;
  const patch = filteredSiteSettingsPatch(input);
  const commentPolicyInput = isRecord(patch.commentPolicy)
    ? patch.commentPolicy
    : null;
  const updatedAt = new Date().toISOString();

  return {
    ...base,
    ...patch,
    seo:
      patch.seo === undefined
        ? base.seo
        : {
            ...(base.seo || {}),
            ...(isRecord(patch.seo) ? patch.seo : {}),
          },
    analytics:
      patch.analytics === undefined
        ? base.analytics
        : {
            ...(base.analytics || {}),
            ...(isRecord(patch.analytics) ? patch.analytics : {}),
          },
    social:
      patch.social === undefined
        ? base.social
        : {
            ...(base.social || {}),
            ...sanitizeStringRecord(patch.social),
          },
    commentPolicy:
      patch.commentPolicy === undefined
        ? base.commentPolicy
        : {
            ...(base.commentPolicy || {}),
            ...(commentPolicyInput || {}),
            blockedTerms: Array.isArray(commentPolicyInput?.blockedTerms)
              ? commentPolicyInput.blockedTerms.filter(
                  (term): term is string => typeof term === "string",
                )
              : base.commentPolicy?.blockedTerms || [],
          },
    redirectRules:
      patch.redirectRules === undefined
        ? base.redirectRules
        : normalizeRedirectRules(patch.redirectRules),
    navigation:
      patch.navigation === undefined
        ? base.navigation
        : normalizeNavigationConfig(patch.navigation, base.navigation),
    localization:
      patch.localization === undefined
        ? base.localization
        : normalizeSiteLocalization({
            localization: isRecord(patch.localization)
              ? (patch.localization as SiteSettings["localization"])
              : base.localization,
          }),
    domainVerification:
      patch.domainVerification === undefined
        ? base.domainVerification
        : ({
            ...(base.domainVerification || {}),
            ...(isRecord(patch.domainVerification)
              ? patch.domainVerification
              : {}),
          } as SiteSettings["domainVerification"]),
    domainAliases:
      patch.domainAliases === undefined
        ? base.domainAliases || []
        : normalizeDomainAliasesPatch(patch.domainAliases, base.domainAliases),
    vercelDeployment:
      patch.vercelDeployment === undefined
        ? base.vercelDeployment
        : ({
            ...(base.vercelDeployment || {}),
            ...(isRecord(patch.vercelDeployment) ? patch.vercelDeployment : {}),
          } as SiteSettings["vercelDeployment"]),
    billingQuota:
      patch.billingQuota === undefined
        ? base.billingQuota
        : ({
            ...(base.billingQuota || {}),
            ...(isRecord(patch.billingQuota) ? patch.billingQuota : {}),
            limits: {
              ...(base.billingQuota?.limits || {}),
              ...(isRecord(
                (patch.billingQuota as Record<string, unknown>)?.limits,
              )
                ? (patch.billingQuota as { limits: Record<string, unknown> })
                    .limits
                : {}),
            },
            usage: {
              ...(base.billingQuota?.usage || {}),
              ...(isRecord(
                (patch.billingQuota as Record<string, unknown>)?.usage,
              )
                ? (patch.billingQuota as { usage: Record<string, unknown> })
                    .usage
                : {}),
            },
          } as SiteSettings["billingQuota"]),
    webhooks:
      patch.webhooks === undefined
        ? base.webhooks
        : ({
            ...(base.webhooks || {}),
            ...(isRecord(patch.webhooks) ? patch.webhooks : {}),
          } as SiteSettings["webhooks"]),
    frontendDesign:
      patch.frontendDesign === undefined
        ? base.frontendDesign
        : normalizeFrontendDesignContract(patch.frontendDesign, {
            fallback: base.frontendDesign,
            updatedAt,
            mergeFallback: true,
          }),
  };
};

const workspaceSettingsSummary = (settings: {
  deliveryMode?: unknown;
  integrations?: unknown;
  auth?: unknown;
}) => {
  const integrations = isRecord(settings.integrations)
    ? settings.integrations
    : {};
  return {
    deliveryMode:
      settings.deliveryMode === "custom-frontend"
        ? "custom-frontend"
        : "managed-hosting",
    integrations: {
      appearance: isRecord(integrations.appearance)
        ? integrations.appearance
        : {},
      seo: isRecord(integrations.seo) ? integrations.seo : {},
      storage: isRecord(integrations.storage) ? integrations.storage : {},
      supabase: isRecord(integrations.supabase) ? integrations.supabase : {},
      vercel: isRecord(integrations.vercel) ? integrations.vercel : {},
      commerce: isRecord(integrations.commerce) ? integrations.commerce : {},
      notifications: isRecord(integrations.notifications)
        ? integrations.notifications
        : {},
    },
    authPolicy: isRecord(settings.auth)
      ? {
          requireTwoFactor: settings.auth.requireTwoFactor === true,
          inviteOnly: settings.auth.inviteOnly === true,
          minPasswordLength:
            typeof settings.auth.minPasswordLength === "number"
              ? settings.auth.minPasswordLength
              : undefined,
          sessionTimeoutMinutes:
            typeof settings.auth.sessionTimeoutMinutes === "number"
              ? settings.auth.sessionTimeoutMinutes
              : undefined,
          allowedEmailDomains:
            typeof settings.auth.allowedEmailDomains === "string"
              ? settings.auth.allowedEmailDomains
              : "",
        }
      : {},
  };
};

const missingInputsFromRuntime = (summary: unknown): string[] => {
  if (!summary || typeof summary !== "object" || Array.isArray(summary)) {
    return [];
  }

  const missing = (summary as { missing?: unknown }).missing;
  return Array.isArray(missing)
    ? missing.filter((value): value is string => typeof value === "string" && value.trim().length > 0)
    : [];
};

const booleanFlag = (source: unknown, key: string): boolean =>
  isRecord(source) && source[key] === true;

const siteMediaStorageHandoffContract = ({
  site,
  workspaceSettings,
  runtimeStorage,
  runtimeSupabase,
}: {
  site: SiteSettingsScopedSite;
  workspaceSettings: Parameters<typeof workspaceSettingsSummary>[0];
  runtimeStorage: ReturnType<typeof getMediaStorageConfigSummary>;
  runtimeSupabase: ReturnType<typeof getSupabaseRuntimeSummary>;
}) => {
  const integrations = isRecord(workspaceSettings.integrations)
    ? workspaceSettings.integrations
    : {};
  const storage = isRecord(integrations.storage) ? integrations.storage : {};
  const provider =
    stringField(storage, "provider") || stringField(runtimeStorage, "provider") || "local";
  const bucket =
    stringField(storage, "bucket") ||
    stringField(runtimeStorage, "bucket") ||
    stringField(runtimeSupabase, "storageBucket");
  const publicBaseUrl =
    stringField(storage, "publicBaseUrl") || stringField(runtimeStorage, "publicUrl");
  const pathPrefix =
    stringField(storage, "pathPrefix") || stringField(runtimeStorage, "basePath") || "sites/{siteId}";
  const configured = Boolean(
    booleanFlag(runtimeStorage, "configured") ||
      stringField(storage, "provider") ||
      stringField(storage, "bucket") ||
      stringField(storage, "publicBaseUrl"),
  );
  const siteId = encodeURIComponent(site.id);

  return {
    generatedAt: new Date().toISOString(),
    schemaVersion: "backy.media-storage-handoff.v1",
    status: configured ? "ready" : "needs-runtime-env",
    source: "admin-site-settings-api",
    selectedSiteId: site.id,
    provider: {
      selected: provider,
      bucket,
      publicBaseUrl,
      pathPrefix,
      resolvedPathPrefix: pathPrefix.replace(/\{siteId\}/g, site.id),
      runtime: runtimeStorage,
      supabase: runtimeSupabase,
    },
    policies: {
      privateFilesEnabled: booleanFlag(storage, "privateFilesEnabled"),
      imageTransformsEnabled: storage.imageTransformsEnabled !== false,
      maxFileSizeMb: storage.maxFileSizeMb ?? null,
      workspaceStorageLimitGb: storage.workspaceStorageLimitGb ?? null,
      warningThresholdPercent: storage.warningThresholdPercent ?? null,
      allowedFileTypes: stringField(storage, "allowedFileTypes") || "image/*,font/*,document/*,file/*",
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
    siteEndpoints: {
      adminMediaList: `/api/admin/sites/${siteId}/media`,
      adminMediaUpload: `/api/admin/sites/${siteId}/media`,
      adminSignedUrl: `/api/admin/sites/${siteId}/media/{mediaId}/signed-url`,
      publicMediaList: `/api/sites/${siteId}/media`,
      publicMediaFolders: `/api/sites/${siteId}/media/folders`,
      publicFontManifest: `/api/sites/${siteId}/media/fonts`,
      publicMediaDetail: `/api/sites/${siteId}/media/{mediaId}`,
      publicMediaFile: `/api/sites/${siteId}/media/{mediaId}/file`,
      publicMediaTransform: `/api/sites/${siteId}/media/{mediaId}/transform`,
    },
    contracts: {
      organization: "backy.media.organization.v1",
      references: "backy.media.references.v1",
      editableMetadata: "backy.media.editable-metadata.v1",
      deliveryPolicy: "MediaDeliveryPolicy",
      fileCategories: "backy.media-file-categories.v1",
    },
    designStateUsage: {
      preservedFields: [
        "frontendDesignAssets",
        "frontendDesignContentDocument.assets",
        "content.assets.media[]",
        "content.assets.fonts[]",
        "element.props.mediaId",
        "element.props.imageMediaId",
        "element.props.fileMediaId",
        "element.props.fontMediaId",
        "element.props.mediaOrganization",
      ],
      editableSurfaces: ["pages", "blog", "reusable sections", "products", "collections", "editor media picker"],
      customFrontendUses: ["image picker", "font picker", "file download picker", "product media gallery", "private signed delivery", "responsive transforms"],
    },
    runtimeGate: {
      certificationCommand: "npm run ci:settings-provider-certification",
      sourceOnlyGuard: "BACKY_SETTINGS_SOURCE_ONLY=1 npm run test:settings --workspace @backy-cms/admin",
      missingRuntimeAliases: missingInputsFromRuntime(runtimeStorage),
    },
    privacy: {
      includesSecretValues: false,
      exposesSecretReferencesOnly: true,
      secretReferences: {
        supabaseServiceRole: stringField(storage, "supabaseKeySecretRef") || "env:BACKY_SUPABASE_SERVICE_ROLE_KEY",
        s3AccessKeyId: stringField(storage, "accessKeyIdSecretRef") || "env:BACKY_S3_ACCESS_KEY_ID",
        s3SecretAccessKey: stringField(storage, "secretAccessKeySecretRef") || "env:BACKY_S3_SECRET_ACCESS_KEY",
      },
      excludes: ["raw provider credentials", "service-role key values", "signed URL tokens", "private file bytes"],
    },
  };
};

const siteSettingsEnvelope = (
  site: SiteSettingsScopedSite,
  workspaceSettings: Parameters<typeof workspaceSettingsSummary>[0],
) => {
  const runtimeDatabase = getDatabaseRuntimeSummary();
  const runtimePublicApi = getPublicApiRuntimeSummary();
  const runtimeStorage = getMediaStorageConfigSummary();
  const runtimeSupabase = getSupabaseRuntimeSummary();
  const frontendDatabaseCertificationRuntime =
    getFrontendDatabaseCertificationRuntime(runtimeDatabase, runtimePublicApi);
  const frontendDatabaseCertificationScenarioEvidence =
    buildFrontendDatabaseCertificationScenarioEvidence(
      frontendDatabaseCertificationRuntime,
    );
  const siteSettings = {
    ...DEFAULT_SITE_SETTINGS,
    ...(site.settings || {}),
  };
  const summarizedWorkspaceSettings = workspaceSettingsSummary(workspaceSettings);

  return {
    schemaVersion: SITE_SETTINGS_SCOPE_SCHEMA,
    scope: {
      level: "site",
      siteId: site.id,
      siteSlug: site.slug,
      teamId: site.teamId || null,
      workspaceSettingsScope: "global",
      siteSettingsScope: "site",
    },
    siteSettings,
    workspaceSettings: summarizedWorkspaceSettings,
    effectiveSettings: {
      workspace: summarizedWorkspaceSettings,
      site: {
        ...DEFAULT_SITE_SETTINGS,
        ...(site.settings || {}),
      },
    },
    frontendDatabaseCertification: frontendDatabaseCertificationContract(
      frontendDatabaseCertificationRuntime,
      frontendDatabaseCertificationScenarioEvidence,
    ),
    mediaStorageHandoff: siteMediaStorageHandoffContract({
      site,
      workspaceSettings,
      runtimeStorage,
      runtimeSupabase,
    }),
    endpoints: {
      workspaceSettings: "/api/admin/settings",
      siteSettings: `/api/admin/sites/${encodeURIComponent(site.id)}/settings`,
      siteDetail: `/api/admin/sites/${encodeURIComponent(site.id)}`,
    },
  };
};

export async function GET(request: NextRequest, { params }: RouteParams) {
  const requestId = request.headers.get("x-request-id") || makeRequestId();
  const access = await requireAdminAccess(request, requestId, {
    permission: "sites.view",
  });
  if (access instanceof NextResponse) {
    return access;
  }

  try {
    const { siteId } = await params;
    if (!shouldUseDemoStoreFallback()) {
      const repositories = await getRequiredDatabaseRepositories();
      const site =
        (await repositories.sites.getById(siteId)) ||
        (await repositories.sites.getBySlug(siteId));
      if (!site) {
        return errorResponse(
          404,
          "SITE_NOT_FOUND",
          "Site not found",
          requestId,
        );
      }

      const workspaceSettings = await repositories.settings.get();
      return siteSettingsContractJson(
        site.id,
        requestId,
        siteSettingsEnvelope(site, workspaceSettings),
      );
    }

    const site = getSiteByIdOrSlug(siteId);
    if (!site) {
      return errorResponse(404, "SITE_NOT_FOUND", "Site not found", requestId);
    }

    return siteSettingsContractJson(
      site.id,
      requestId,
      siteSettingsEnvelope(site, getAdminSettings()),
    );
  } catch (error) {
    console.error("Admin site settings API error:", error);
    return errorResponse(
      500,
      "INTERNAL_SERVER_ERROR",
      "Internal server error",
      requestId,
    );
  }
}

export async function PATCH(request: NextRequest, { params }: RouteParams) {
  const requestId = request.headers.get("x-request-id") || makeRequestId();
  const access = await requireAdminAccess(request, requestId, {
    permission: "sites.configure",
  });
  if (access instanceof NextResponse) {
    return access;
  }
  const body = await parseJsonBody(request);
  const settingsPatch = settingsPatchFromBody(body);
  const filteredPatch = filteredSiteSettingsPatch(settingsPatch);
  const changedKeys = Object.keys(filteredPatch);
  if (changedKeys.length === 0) {
    return errorResponse(
      400,
      "NO_SITE_SETTINGS_CHANGES",
      "Provide at least one supported site settings section to update.",
      requestId,
    );
  }
  const unsupportedKeys = unsupportedSiteSettingsKeys(settingsPatch);
  if (unsupportedKeys.length > 0) {
    return errorResponse(
      400,
      "UNSUPPORTED_SITE_SETTINGS_KEYS",
      `Unsupported site settings section(s): ${unsupportedKeys.join(", ")}. Use /api/admin/settings for workspace-level settings.`,
      requestId,
    );
  }

  try {
    const { siteId } = await params;
    if (!shouldUseDemoStoreFallback()) {
      const repositories = await getRequiredDatabaseRepositories();
      const site =
        (await repositories.sites.getById(siteId)) ||
        (await repositories.sites.getBySlug(siteId));
      if (!site) {
        return errorResponse(
          404,
          "SITE_NOT_FOUND",
          "Site not found",
          requestId,
        );
      }

      const nextSettings = mergeSiteSettings(site.settings, filteredPatch);
      const updated = await repositories.sites.update(site.id, {
        settings: nextSettings,
      });
      await recordAdminAudit({
        repositories,
        siteId: site.id,
        teamId: site.teamId,
        actorId: access.session?.user.id,
        entity: "site",
        entityId: site.id,
        action: "site.settings.updated",
        before: site.settings || {},
        after: updated.item.settings || {},
        metadata: {
          changedKeys,
          source: "admin-site-settings-api",
        },
        requestId,
      });
      await deliverSiteWebhooks({
        repositories,
        site: updated.item,
        kind: "site-updated",
        requestId,
        actor: access.session?.user.id,
        reason: "site.settings.updated",
        data: {
          before: site.settings || {},
          after: updated.item.settings || {},
        },
        metadata: {
          action: "site.settings.updated",
          changedKeys,
          source: "admin-site-settings-api",
        },
      });
      const workspaceSettings = await repositories.settings.get();
      return siteSettingsContractJson(
        updated.item.id,
        requestId,
        siteSettingsEnvelope(updated.item, workspaceSettings),
      );
    }

    const site = getSiteByIdOrSlug(siteId);
    if (!site) {
      return errorResponse(404, "SITE_NOT_FOUND", "Site not found", requestId);
    }

    const nextSettings = mergeSiteSettings(site.settings, filteredPatch);
    const updated = updateAdminSite(site.id, { settings: nextSettings });
    if (!updated) {
      return errorResponse(404, "SITE_NOT_FOUND", "Site not found", requestId);
    }

    await recordAdminAudit({
      siteId: site.id,
      actorId: access.session?.user.id,
      entity: "site",
      entityId: site.id,
      action: "site.settings.updated",
      before: site.settings || {},
      after: updated.settings || {},
      metadata: {
        changedKeys,
        source: "admin-site-settings-api",
      },
      requestId,
    });
    await deliverSiteWebhooks({
      site: updated,
      kind: "site-updated",
      requestId,
      actor: access.session?.user.id,
      reason: "site.settings.updated",
      data: {
        before: site.settings || {},
        after: updated.settings || {},
      },
      metadata: {
        action: "site.settings.updated",
        changedKeys,
        source: "admin-site-settings-api",
      },
    });

    return siteSettingsContractJson(
      updated.id,
      requestId,
      siteSettingsEnvelope(updated, getAdminSettings()),
    );
  } catch (error) {
    console.error("Admin site settings update API error:", error);
    return errorResponse(
      500,
      "INTERNAL_SERVER_ERROR",
      "Internal server error",
      requestId,
    );
  }
}
