/**
 * Admin site detail endpoint.
 *
 * GET    /api/admin/sites/[siteId]
 * PATCH  /api/admin/sites/[siteId]
 * DELETE /api/admin/sites/[siteId]
 */

import { NextRequest, NextResponse } from "next/server";
import {
  DEFAULT_SITE_SETTINGS,
  type Site,
  type SiteSettings,
  type SiteWebhookEventKind,
  type ThemeConfig,
} from "@backy-cms/core";
import {
  requireAdminAccess,
  requireAdminTeamScopeAccess,
} from "@/lib/adminAccess";
import { recordAdminAudit } from "@/lib/adminAudit";
import { recordSiteCacheInvalidation } from "@/lib/cacheInvalidation";
import {
  deleteAdminSite,
  getAdminSettings,
  getSiteByIdOrSlug,
  updateAdminSite,
} from "@/lib/backyStore";
import {
  getRequiredDatabaseRepositories,
  shouldUseDemoStoreFallback,
} from "@/lib/repositoryRuntime";
import { normalizeNavigationConfig } from "@/lib/navigation";
import { normalizeRedirectRules } from "@/lib/redirectRules";
import {
  emptyFrontendDesignContract,
  normalizeFrontendDesignContract,
} from "@/lib/frontendDesignContract";
import { deliverSiteWebhooks } from "@/lib/siteWebhookDelivery";

export const runtime = "nodejs";

type SiteVercelDeploymentRun = NonNullable<
  NonNullable<SiteSettings["vercelDeployment"]>["history"]
>[number];
type SiteBillingQuotaEvent = NonNullable<
  NonNullable<SiteSettings["billingQuota"]>["history"]
>[number];

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
  NextResponse.json(
    {
      success: false,
      requestId,
      error: {
        code,
        message,
      },
    },
    { status },
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

const normalizeSiteStatus = (
  value: unknown,
): "draft" | "published" | "archived" | undefined =>
  value === "published" || value === "draft" || value === "archived"
    ? value
    : undefined;

const persistedSiteStatus = (
  site: Site,
): "draft" | "published" | "archived" => {
  const settingsStatus = normalizeSiteStatus(
    (site.settings as SiteSettings & { siteStatus?: unknown }).siteStatus,
  );
  if (settingsStatus) return settingsStatus;
  return site.isPublished ? "published" : "draft";
};

const adminSiteFromRepositorySite = (site: Site | null) => {
  if (!site) return null;
  return {
    ...site,
    status: persistedSiteStatus(site),
  };
};

const statusForRepositorySite = (site: Site) => persistedSiteStatus(site);

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const toStringRecord = (value: unknown): Record<string, string> => {
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

const sanitizeString = (value: unknown): string =>
  typeof value === "string" ? value.trim() : "";

const normalizeCustomDomain = (value: unknown): string => {
  if (typeof value !== "string") {
    return "";
  }

  return value
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/\/.*$/, "")
    .replace(/\.$/, "");
};

const normalizeDomainAliases = (
  value: unknown,
  current?: SiteSettings["domainAliases"],
): NonNullable<SiteSettings["domainAliases"]> => {
  type DomainAliasSettings = NonNullable<SiteSettings["domainAliases"]>[number];
  const currentByHost = new Map(
    (Array.isArray(current) ? current : [])
      .map((alias) => [normalizeCustomDomain(alias.host), alias] as const)
      .filter(([host]) => Boolean(host)),
  );
  const seen = new Set<string>();

  return (Array.isArray(value) ? value : [])
    .flatMap((entry): DomainAliasSettings[] => {
      if (!isRecord(entry)) return [];
      const host = normalizeCustomDomain(entry.host);
      if (!host || seen.has(host)) return [];
      seen.add(host);
      const existing = currentByHost.get(host);
      const status = ["not_started", "pending", "verified", "failed"].includes(
        String(entry.status),
      )
        ? (entry.status as NonNullable<SiteSettings["domainAliases"]>[number]["status"])
        : existing?.status || "pending";

      return [{
        id:
          sanitizeString(entry.id) ||
          existing?.id ||
          `domain-alias-${host.replace(/[^a-z0-9]+/g, "-")}`,
        host,
        kind:
          entry.kind === "subdomain" ||
          entry.kind === "root" ||
          entry.kind === "locale" ||
          entry.kind === "redirect"
            ? entry.kind
            : existing?.kind || "alias",
        status,
        requestedAt: sanitizeString(entry.requestedAt) || existing?.requestedAt || null,
        verifiedAt:
          status === "verified"
            ? sanitizeString(entry.verifiedAt) || existing?.verifiedAt || null
            : null,
        lastError:
          entry.lastError === null
            ? null
            : sanitizeString(entry.lastError) || existing?.lastError || null,
      }];
    })
    .slice(0, 100);
};

const numberValue = (value: unknown, fallback: number): number =>
  typeof value === "number" && Number.isFinite(value)
    ? Math.max(0, value)
    : fallback;

const readCustomDomainBillingPolicy = (
  siteSettings: unknown,
  workspaceSettings: unknown,
) => {
  const siteRoot = isRecord(siteSettings) ? siteSettings : {};
  const workspaceRoot = isRecord(workspaceSettings) ? workspaceSettings : {};
  const integrations = isRecord(workspaceRoot.integrations)
    ? workspaceRoot.integrations
    : {};
  const commerce = isRecord(integrations.commerce) ? integrations.commerce : {};
  const billingQuota = isRecord(siteRoot.billingQuota)
    ? siteRoot.billingQuota
    : {};
  const limits = isRecord(billingQuota.limits) ? billingQuota.limits : {};
  const limit = Number(limits.customDomains);

  return {
    overageMode:
      typeof commerce.overageMode === "string" ? commerce.overageMode : "warn",
    customDomainLimit:
      Number.isFinite(limit) && limit >= 0
        ? Math.round(limit)
        : DEFAULT_SITE_SETTINGS.billingQuota.limits.customDomains,
    billingPlan:
      typeof billingQuota.plan === "string"
        ? billingQuota.plan
        : DEFAULT_SITE_SETTINGS.billingQuota.plan,
  };
};

const countConfiguredCustomDomains = (
  site: { customDomain?: string | null },
  siteSettings: unknown,
): number => {
  const settingsRoot = isRecord(siteSettings) ? siteSettings : {};
  const domainVerification = isRecord(settingsRoot.domainVerification)
    ? settingsRoot.domainVerification
    : {};
  const vercelDeployment = isRecord(settingsRoot.vercelDeployment)
    ? settingsRoot.vercelDeployment
    : {};
  const domains = new Set(
    [
      normalizeCustomDomain(site.customDomain),
      normalizeCustomDomain(domainVerification.domain),
      normalizeCustomDomain(vercelDeployment.productionDomain),
    ].filter(Boolean),
  );

  return domains.size;
};

const isCustomDomainBillingPatch = (body: Record<string, unknown>): boolean => {
  const settings = body.settings;
  return (
    body.customDomain !== undefined ||
    (isRecord(settings) &&
      (isRecord(settings.domainVerification) ||
        isRecord(settings.vercelDeployment)))
  );
};

const enforceCustomDomainBillingLimit = (
  site: { customDomain?: string | null },
  siteSettings: unknown,
  workspaceSettings: unknown,
  requestId: string,
) => {
  const policy = readCustomDomainBillingPolicy(siteSettings, workspaceSettings);
  const configuredDomains = countConfiguredCustomDomains(site, siteSettings);

  if (
    policy.overageMode === "block" &&
    configuredDomains > policy.customDomainLimit
  ) {
    return errorResponse(
      402,
      "BILLING_CUSTOM_DOMAIN_LIMIT",
      `The ${policy.billingPlan} site plan allows ${policy.customDomainLimit} custom domain${policy.customDomainLimit === 1 ? "" : "s"}. Update the site billing quota before adding another custom domain.`,
      requestId,
    );
  }

  return null;
};

const siteWebhookEventKinds: SiteWebhookEventKind[] = [
  "site-updated",
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
];

const normalizeSiteWebhookEventKinds = (
  value: unknown,
  fallback: SiteWebhookEventKind[] = [],
): SiteWebhookEventKind[] => {
  if (!Array.isArray(value)) {
    return [...fallback];
  }

  const allowed = new Set(siteWebhookEventKinds);
  return Array.from(
    new Set(
      value.filter(
        (item): item is SiteWebhookEventKind =>
          typeof item === "string" && allowed.has(item as SiteWebhookEventKind),
      ),
    ),
  );
};

const normalizeSiteWebhooksInput = (
  input: unknown,
  current?: SiteSettings["webhooks"],
): NonNullable<SiteSettings["webhooks"]> => {
  const webhookInput = isRecord(input) ? input : {};
  const currentWebhooks: NonNullable<SiteSettings["webhooks"]> = {
    enabled: current?.enabled === true,
    endpoints: [...(current?.endpoints || [])],
  };
  const endpointInputs =
    webhookInput.endpoints === undefined
      ? currentWebhooks.endpoints
      : Array.isArray(webhookInput.endpoints)
        ? webhookInput.endpoints
        : [];

  return {
    enabled:
      webhookInput.enabled === undefined
        ? currentWebhooks.enabled
        : webhookInput.enabled === true,
    endpoints: endpointInputs
      .filter((endpoint): endpoint is Record<string, unknown> =>
        isRecord(endpoint),
      )
      .map((endpoint) => {
        const headers = toStringRecord(endpoint.headers);
        return {
          id:
            sanitizeString(endpoint.id) ||
            `webhook_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
          name: sanitizeString(endpoint.name) || "Site webhook",
          url: sanitizeString(endpoint.url),
          enabled:
            endpoint.enabled === undefined ? true : endpoint.enabled === true,
          eventKinds: normalizeSiteWebhookEventKinds(endpoint.eventKinds, []),
          secretId: sanitizeString(endpoint.secretId),
          headers: Object.keys(headers).length > 0 ? headers : undefined,
        };
      })
      .filter((endpoint) => endpoint.url)
      .slice(0, 20),
  };
};

const mergeSiteSettings = (
  current: SiteSettings,
  input: unknown,
): SiteSettings | undefined => {
  if (!isRecord(input)) {
    return undefined;
  }
  const domainVerificationInput = isRecord(input.domainVerification)
    ? input.domainVerification
    : null;
  const currentDomainVerification =
    current.domainVerification ||
    ({
      status: "not_started",
      method: "dns-txt",
      domain: null,
      token: "",
      txtHost: "",
      txtValue: "",
      cnameTarget: "",
      requestedAt: null,
      checkedAt: null,
      verifiedAt: null,
      lastError: null,
    } satisfies NonNullable<SiteSettings["domainVerification"]>);
  const domainVerificationStatus =
    domainVerificationInput &&
    ["not_started", "pending", "verified", "failed"].includes(
      String(domainVerificationInput.status),
    )
      ? (domainVerificationInput.status as NonNullable<
          SiteSettings["domainVerification"]
        >["status"])
      : currentDomainVerification.status;
  const vercelDeploymentInput = isRecord(input.vercelDeployment)
    ? input.vercelDeployment
    : null;
  const currentVercelDeployment =
    current.vercelDeployment ||
    ({
      status: "not_started",
      projectId: "",
      teamSlug: "",
      productionDomain: "",
      previewUrl: "",
      productionUrl: "",
      deploymentId: "",
      environment: "preview",
      lastAction: null,
      requestedAt: null,
      completedAt: null,
      promotedAt: null,
      rolledBackAt: null,
      command: "",
      missing: [],
      history: [],
    } satisfies NonNullable<SiteSettings["vercelDeployment"]>);
  const vercelDeploymentStatus =
    vercelDeploymentInput &&
    [
      "not_started",
      "preview_queued",
      "preview_ready",
      "production_ready",
      "rolled_back",
      "blocked",
    ].includes(String(vercelDeploymentInput.status))
      ? (vercelDeploymentInput.status as NonNullable<
          SiteSettings["vercelDeployment"]
        >["status"])
      : currentVercelDeployment.status;
  const vercelDeploymentAction =
    vercelDeploymentInput &&
    [
      "prepare-preview",
      "record-preview",
      "promote-production",
      "rollback-production",
    ].includes(String(vercelDeploymentInput.lastAction))
      ? (vercelDeploymentInput.lastAction as NonNullable<
          SiteSettings["vercelDeployment"]
        >["lastAction"])
      : currentVercelDeployment.lastAction || null;
  const billingQuotaInput = isRecord(input.billingQuota)
    ? input.billingQuota
    : null;
  const currentBillingQuota =
    current.billingQuota ||
    ({
      plan: "free",
      status: "active",
      billingOwnerId: null,
      billingEmail: "",
      renewalAt: null,
      limits: {
        pages: 10,
        mediaGb: 1,
        bandwidthGb: 10,
        forms: 3,
        products: 25,
        collections: 3,
        teamMembers: 2,
        customDomains: 1,
      },
      usage: {
        pages: 0,
        mediaGb: 0,
        bandwidthGb: 0,
        forms: 0,
        products: 0,
        collections: 0,
        teamMembers: 1,
        customDomains: 0,
        updatedAt: "",
      },
      lastAction: null,
      notes: "",
      history: [],
    } satisfies NonNullable<SiteSettings["billingQuota"]>);
  const billingQuotaLimitsInput =
    billingQuotaInput && isRecord(billingQuotaInput.limits)
      ? billingQuotaInput.limits
      : {};
  const billingQuotaUsageInput =
    billingQuotaInput && isRecord(billingQuotaInput.usage)
      ? billingQuotaInput.usage
      : {};
  const billingQuotaPlan =
    billingQuotaInput &&
    ["free", "pro", "business", "enterprise"].includes(
      String(billingQuotaInput.plan),
    )
      ? (billingQuotaInput.plan as NonNullable<
          SiteSettings["billingQuota"]
        >["plan"])
      : currentBillingQuota.plan;
  const billingQuotaStatus =
    billingQuotaInput &&
    ["active", "trialing", "past_due", "paused", "comped"].includes(
      String(billingQuotaInput.status),
    )
      ? (billingQuotaInput.status as NonNullable<
          SiteSettings["billingQuota"]
        >["status"])
      : currentBillingQuota.status;
  const billingQuotaAction =
    billingQuotaInput &&
    [
      "set-free",
      "set-pro",
      "set-business",
      "set-enterprise",
      "refresh-usage",
    ].includes(String(billingQuotaInput.lastAction))
      ? (billingQuotaInput.lastAction as NonNullable<
          SiteSettings["billingQuota"]
        >["lastAction"])
      : currentBillingQuota.lastAction || null;

  return {
    ...current,
    ...input,
    seo: {
      ...current.seo,
      ...(isRecord(input.seo) ? input.seo : {}),
    },
    analytics: {
      ...current.analytics,
      ...(isRecord(input.analytics) ? input.analytics : {}),
    },
    social: {
      ...current.social,
      ...toStringRecord(input.social),
    },
    commentPolicy:
      input.commentPolicy === undefined
        ? current.commentPolicy
        : {
            ...(current.commentPolicy || {}),
            ...(isRecord(input.commentPolicy) ? input.commentPolicy : {}),
            blockedTerms: Array.isArray(
              (input.commentPolicy as { blockedTerms?: unknown } | undefined)
                ?.blockedTerms,
            )
              ? (
                  input.commentPolicy as { blockedTerms: unknown[] }
                ).blockedTerms.filter(
                  (term): term is string => typeof term === "string",
                )
              : current.commentPolicy?.blockedTerms || [],
          },
    redirectRules:
      input.redirectRules === undefined
        ? current.redirectRules
        : normalizeRedirectRules(input.redirectRules),
    navigation:
      input.navigation === undefined
        ? current.navigation
        : normalizeNavigationConfig(input.navigation, current.navigation),
    domainVerification:
      input.domainVerification === undefined || !domainVerificationInput
        ? currentDomainVerification
        : {
            ...currentDomainVerification,
            ...domainVerificationInput,
            status: domainVerificationStatus,
            method: "dns-txt",
            domain:
              domainVerificationInput.domain === null
                ? null
                : sanitizeString(domainVerificationInput.domain) ||
                  currentDomainVerification.domain ||
                  null,
            token:
              sanitizeString(domainVerificationInput.token) ||
              currentDomainVerification.token ||
              "",
            txtHost:
              sanitizeString(domainVerificationInput.txtHost) ||
              currentDomainVerification.txtHost ||
              "",
            txtValue:
              sanitizeString(domainVerificationInput.txtValue) ||
              currentDomainVerification.txtValue ||
              "",
            cnameTarget:
              sanitizeString(domainVerificationInput.cnameTarget) ||
              currentDomainVerification.cnameTarget ||
              "",
            requestedAt:
              sanitizeString(domainVerificationInput.requestedAt) || null,
            checkedAt:
              sanitizeString(domainVerificationInput.checkedAt) || null,
            verifiedAt:
              sanitizeString(domainVerificationInput.verifiedAt) || null,
            lastError:
              domainVerificationInput.lastError === null
                ? null
                : sanitizeString(domainVerificationInput.lastError) || null,
          },
    domainAliases:
      input.domainAliases === undefined
        ? current.domainAliases || []
        : normalizeDomainAliases(input.domainAliases, current.domainAliases),
    webhooks:
      input.webhooks === undefined
        ? normalizeSiteWebhooksInput(current.webhooks, current.webhooks)
        : normalizeSiteWebhooksInput(input.webhooks, current.webhooks),
    vercelDeployment:
      input.vercelDeployment === undefined || !vercelDeploymentInput
        ? currentVercelDeployment
        : {
            ...currentVercelDeployment,
            ...vercelDeploymentInput,
            status: vercelDeploymentStatus,
            projectId: sanitizeString(vercelDeploymentInput.projectId),
            teamSlug: sanitizeString(vercelDeploymentInput.teamSlug),
            productionDomain: sanitizeString(
              vercelDeploymentInput.productionDomain,
            ),
            previewUrl: sanitizeString(vercelDeploymentInput.previewUrl),
            productionUrl: sanitizeString(vercelDeploymentInput.productionUrl),
            deploymentId: sanitizeString(vercelDeploymentInput.deploymentId),
            environment:
              vercelDeploymentInput.environment === "production"
                ? "production"
                : "preview",
            lastAction: vercelDeploymentAction,
            requestedAt:
              sanitizeString(vercelDeploymentInput.requestedAt) || null,
            completedAt:
              sanitizeString(vercelDeploymentInput.completedAt) || null,
            promotedAt:
              sanitizeString(vercelDeploymentInput.promotedAt) || null,
            rolledBackAt:
              sanitizeString(vercelDeploymentInput.rolledBackAt) || null,
            command: sanitizeString(vercelDeploymentInput.command),
            missing: Array.isArray(vercelDeploymentInput.missing)
              ? vercelDeploymentInput.missing.filter(
                  (item): item is string => typeof item === "string",
                )
              : [],
            history: Array.isArray(vercelDeploymentInput.history)
              ? vercelDeploymentInput.history
                  .filter(
                    (item): item is SiteVercelDeploymentRun =>
                      isRecord(item) &&
                      typeof item.id === "string" &&
                      typeof item.action === "string",
                  )
                  .slice(0, 10)
              : [],
          },
    billingQuota:
      input.billingQuota === undefined || !billingQuotaInput
        ? currentBillingQuota
        : {
            ...currentBillingQuota,
            ...billingQuotaInput,
            plan: billingQuotaPlan,
            status: billingQuotaStatus,
            billingOwnerId:
              billingQuotaInput.billingOwnerId === null
                ? null
                : sanitizeString(billingQuotaInput.billingOwnerId) ||
                  currentBillingQuota.billingOwnerId ||
                  null,
            billingEmail: sanitizeString(billingQuotaInput.billingEmail),
            renewalAt: sanitizeString(billingQuotaInput.renewalAt) || null,
            limits: {
              pages: numberValue(
                billingQuotaLimitsInput.pages,
                currentBillingQuota.limits.pages,
              ),
              mediaGb: numberValue(
                billingQuotaLimitsInput.mediaGb,
                currentBillingQuota.limits.mediaGb,
              ),
              bandwidthGb: numberValue(
                billingQuotaLimitsInput.bandwidthGb,
                currentBillingQuota.limits.bandwidthGb,
              ),
              forms: numberValue(
                billingQuotaLimitsInput.forms,
                currentBillingQuota.limits.forms,
              ),
              products: numberValue(
                billingQuotaLimitsInput.products,
                currentBillingQuota.limits.products,
              ),
              collections: numberValue(
                billingQuotaLimitsInput.collections,
                currentBillingQuota.limits.collections,
              ),
              teamMembers: numberValue(
                billingQuotaLimitsInput.teamMembers,
                currentBillingQuota.limits.teamMembers,
              ),
              customDomains: numberValue(
                billingQuotaLimitsInput.customDomains,
                currentBillingQuota.limits.customDomains,
              ),
            },
            usage: {
              pages: numberValue(
                billingQuotaUsageInput.pages,
                currentBillingQuota.usage.pages,
              ),
              mediaGb: numberValue(
                billingQuotaUsageInput.mediaGb,
                currentBillingQuota.usage.mediaGb,
              ),
              bandwidthGb: numberValue(
                billingQuotaUsageInput.bandwidthGb,
                currentBillingQuota.usage.bandwidthGb,
              ),
              forms: numberValue(
                billingQuotaUsageInput.forms,
                currentBillingQuota.usage.forms,
              ),
              products: numberValue(
                billingQuotaUsageInput.products,
                currentBillingQuota.usage.products,
              ),
              collections: numberValue(
                billingQuotaUsageInput.collections,
                currentBillingQuota.usage.collections,
              ),
              teamMembers: numberValue(
                billingQuotaUsageInput.teamMembers,
                currentBillingQuota.usage.teamMembers,
              ),
              customDomains: numberValue(
                billingQuotaUsageInput.customDomains,
                currentBillingQuota.usage.customDomains,
              ),
              updatedAt: sanitizeString(billingQuotaUsageInput.updatedAt),
            },
            lastAction: billingQuotaAction,
            notes: sanitizeString(billingQuotaInput.notes),
            history: Array.isArray(billingQuotaInput.history)
              ? billingQuotaInput.history
                  .filter(
                    (item): item is SiteBillingQuotaEvent =>
                      isRecord(item) &&
                      typeof item.id === "string" &&
                      typeof item.action === "string",
                  )
                  .slice(0, 10)
              : [],
          },
    frontendDesign:
      input.frontendDesign === undefined
        ? current.frontendDesign || emptyFrontendDesignContract()
        : normalizeFrontendDesignContract(input.frontendDesign, {
            fallback: current.frontendDesign,
            updatedAt: new Date().toISOString(),
          }),
  };
};

const isCommentPolicyOnlyPatch = (body: Record<string, unknown>): boolean => {
  const bodyKeys = Object.keys(body);
  if (bodyKeys.length !== 1 || !bodyKeys.includes("settings")) {
    return false;
  }

  const settings = body.settings;
  if (!isRecord(settings)) {
    return false;
  }

  const settingsKeys = Object.keys(settings);
  return settingsKeys.length === 1 && settingsKeys[0] === "commentPolicy";
};

const isDomainVerificationPatch = (body: Record<string, unknown>): boolean => {
  const settings = body.settings;
  return isRecord(settings) && isRecord(settings.domainVerification);
};

const isWebhooksPatch = (body: Record<string, unknown>): boolean => {
  const settings = body.settings;
  return isRecord(settings) && isRecord(settings.webhooks);
};

const isThemePublishPatch = (body: Record<string, unknown>): boolean =>
  isRecord(body.theme);

const auditActionForSitePatch = (
  domainVerificationPatch: boolean,
  webhooksPatch: boolean,
  themePublishPatch: boolean,
): string => {
  if (domainVerificationPatch) return "site.domainVerification.updated";
  if (webhooksPatch) return "site.webhooks.updated";
  if (themePublishPatch) return "site.themePublish.updated";
  return "site.updated";
};

const siteWebhookPatchMetadata = (
  action: string,
  domainVerificationPatch: boolean,
  webhooksPatch: boolean,
  themePublishPatch: boolean,
) => ({
  action,
  changedSections: {
    domainVerification: domainVerificationPatch,
    webhooks: webhooksPatch,
    themePublish: themePublishPatch,
  },
});

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
      const scopeError = await requireAdminTeamScopeAccess(
        access,
        requestId,
        site,
        { action: "view" },
      );
      if (scopeError) {
        return scopeError;
      }

      return NextResponse.json({
        success: true,
        requestId,
        data: {
          site: adminSiteFromRepositorySite(site),
        },
      });
    }

    const site = getSiteByIdOrSlug(siteId);

    if (!site) {
      return errorResponse(404, "SITE_NOT_FOUND", "Site not found", requestId);
    }
    const scopeError = await requireAdminTeamScopeAccess(
      access,
      requestId,
      site,
      { action: "view" },
    );
    if (scopeError) {
      return scopeError;
    }

    return NextResponse.json({
      success: true,
      requestId,
      data: {
        site,
      },
    });
  } catch (error) {
    console.error("Admin site detail API error:", error);
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
  const body = await parseJsonBody(request);
  const commentPolicyOnlyPatch = isCommentPolicyOnlyPatch(body);
  const domainVerificationPatch = isDomainVerificationPatch(body);
  const webhooksPatch = isWebhooksPatch(body);
  const themePublishPatch = isThemePublishPatch(body);
  const customDomainBillingPatch = isCustomDomainBillingPatch(body);
  const access = await requireAdminAccess(request, requestId, {
    permission: commentPolicyOnlyPatch
      ? "comments.configure"
      : "sites.configure",
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
      const scopeError = await requireAdminTeamScopeAccess(
        access,
        requestId,
        site,
        { action: "manage" },
      );
      if (scopeError) {
        return scopeError;
      }

      const settings = mergeSiteSettings(site.settings, body.settings);
      const nextStatus = normalizeSiteStatus(body.status);
      const themeInput = isRecord(body.theme)
        ? (body.theme as Partial<ThemeConfig>)
        : undefined;
      const nextSettings = nextStatus
        ? ({ ...settings, siteStatus: nextStatus } as SiteSettings)
        : settings;
      if (customDomainBillingPatch) {
        const workspaceSettings = await repositories.settings.get();
        const nextSiteForBilling = {
          ...site,
          customDomain:
            body.customDomain === undefined
              ? site.customDomain
              : sanitizeString(body.customDomain) || null,
        };
        const domainLimitError = enforceCustomDomainBillingLimit(
          nextSiteForBilling,
          nextSettings || site.settings,
          workspaceSettings,
          requestId,
        );
        if (domainLimitError) {
          return domainLimitError;
        }
      }
      const updated = await repositories.sites.update(site.id, {
        name: typeof body.name === "string" ? body.name : undefined,
        slug: typeof body.slug === "string" ? body.slug : undefined,
        description:
          typeof body.description === "string" || body.description === null
            ? body.description
            : undefined,
        customDomain:
          typeof body.customDomain === "string" || body.customDomain === null
            ? body.customDomain
            : undefined,
        theme: themeInput,
        status:
          nextStatus === "published"
            ? "published"
            : nextStatus === "draft" || nextStatus === "archived"
              ? "draft"
              : undefined,
        isPublished:
          typeof body.isPublished === "boolean" ? body.isPublished : undefined,
        settings: nextSettings,
      });
      let cacheInvalidation: Awaited<
        ReturnType<typeof recordSiteCacheInvalidation>
      > | null = null;
      if (commentPolicyOnlyPatch) {
        await recordAdminAudit({
          repositories,
          siteId: site.id,
          actorId: access.session?.user.id,
          entity: "site",
          entityId: site.id,
          action: "commentPolicy.update",
          before: site.settings?.commentPolicy || {},
          after: updated.item.settings?.commentPolicy || {},
          metadata: {
            permission: "comments.configure",
          },
          requestId,
        });
        cacheInvalidation = await recordSiteCacheInvalidation(repositories, {
          siteId: site.id,
          scope: "discovery",
          entity: "site",
          entityId: site.id,
          reason: "site-updated",
          requestId,
        });
      } else {
        const auditAction = auditActionForSitePatch(
          domainVerificationPatch,
          webhooksPatch,
          themePublishPatch,
        );
        const domainVerification = updated.item.settings?.domainVerification;
        const webhooks = updated.item.settings?.webhooks;
        const webhookEndpoints = webhooks?.endpoints || [];
        await recordAdminAudit({
          repositories,
          siteId: site.id,
          teamId: site.teamId,
          actorId: access.session?.user.id,
          entity: "site",
          entityId: site.id,
          action: auditAction,
          before: adminSiteFromRepositorySite(site) || {},
          after: adminSiteFromRepositorySite(updated.item) || {},
          metadata: {
            slug: updated.item.slug,
            status: statusForRepositorySite(updated.item),
            source: "admin-site-update",
            ...(domainVerificationPatch
              ? {
                  domainVerificationStatus:
                    domainVerification?.status || "not_started",
                  domainVerificationDomain:
                    domainVerification?.domain ||
                    updated.item.customDomain ||
                    null,
                }
              : {}),
            ...(themePublishPatch
              ? {
                  themeColors: Object.keys(updated.item.theme?.colors || {})
                    .length,
                  themeFonts: Object.keys(updated.item.theme?.fonts || {})
                    .length,
                  isPublished: updated.item.isPublished,
                }
              : {}),
            ...(webhooksPatch
              ? {
                  webhooksEnabled: webhooks?.enabled === true,
                  webhookEndpointCount: webhookEndpoints.length,
                  webhookEventKinds: Array.from(
                    new Set(
                      webhookEndpoints.flatMap(
                        (endpoint) => endpoint.eventKinds || [],
                      ),
                    ),
                  ),
                }
              : {}),
          },
          requestId,
        });
        cacheInvalidation = await recordSiteCacheInvalidation(repositories, {
          siteId: site.id,
          scope: "discovery",
          entity: "site",
          entityId: site.id,
          reason: "site-updated",
          requestId,
        });
        await deliverSiteWebhooks({
          repositories,
          site: adminSiteFromRepositorySite(updated.item) || updated.item,
          kind: "site-updated",
          requestId,
          actor: access.session?.user.id,
          reason: auditAction,
          data: {
            before: adminSiteFromRepositorySite(site),
            after: adminSiteFromRepositorySite(updated.item),
          },
          metadata: siteWebhookPatchMetadata(
            auditAction,
            domainVerificationPatch,
            webhooksPatch,
            themePublishPatch,
          ),
        });
      }

      return NextResponse.json({
        success: true,
        requestId,
        data: {
          site: adminSiteFromRepositorySite(updated.item),
          cacheInvalidation,
        },
      });
    }

    const site = getSiteByIdOrSlug(siteId);

    if (!site) {
      return errorResponse(404, "SITE_NOT_FOUND", "Site not found", requestId);
    }
    const scopeError = await requireAdminTeamScopeAccess(
      access,
      requestId,
      site,
      { action: "manage" },
    );
    if (scopeError) {
      return scopeError;
    }

    if (customDomainBillingPatch) {
      const nextSiteSettings = site.settings
        ? mergeSiteSettings(site.settings, body.settings) || site.settings
        : DEFAULT_SITE_SETTINGS;
      const nextSiteForBilling = {
        ...site,
        customDomain:
          body.customDomain === undefined
            ? site.customDomain
            : sanitizeString(body.customDomain) || null,
      };
      const domainLimitError = enforceCustomDomainBillingLimit(
        nextSiteForBilling,
        nextSiteSettings,
        getAdminSettings(),
        requestId,
      );
      if (domainLimitError) {
        return domainLimitError;
      }
    }

    const updated = updateAdminSite(site.id, body);

    if (!updated) {
      return errorResponse(404, "SITE_NOT_FOUND", "Site not found", requestId);
    }
    if (commentPolicyOnlyPatch) {
      await recordAdminAudit({
        siteId: site.id,
        actorId: access.session?.user.id,
        entity: "site",
        entityId: site.id,
        action: "commentPolicy.update",
        before: site.settings?.commentPolicy || {},
        after: updated.settings?.commentPolicy || {},
        metadata: {
          permission: "comments.configure",
        },
        requestId,
      });
    } else {
      const auditAction = auditActionForSitePatch(
        domainVerificationPatch,
        webhooksPatch,
        themePublishPatch,
      );
      const domainVerification = updated.settings?.domainVerification;
      const webhooks = updated.settings?.webhooks;
      const webhookEndpoints = webhooks?.endpoints || [];
      await recordAdminAudit({
        siteId: site.id,
        actorId: access.session?.user.id,
        entity: "site",
        entityId: site.id,
        action: auditAction,
        before: site,
        after: updated,
        metadata: {
          slug: updated.slug,
          status: updated.status,
          source: "admin-site-update",
          ...(domainVerificationPatch
            ? {
                domainVerificationStatus:
                  domainVerification?.status || "not_started",
                domainVerificationDomain:
                  domainVerification?.domain || updated.customDomain || null,
              }
            : {}),
          ...(themePublishPatch
            ? {
                themeColors: Object.keys(updated.theme?.colors || {}).length,
                themeFonts: Object.keys(updated.theme?.fonts || {}).length,
                isPublished: updated.isPublished,
              }
            : {}),
          ...(webhooksPatch
            ? {
                webhooksEnabled: webhooks?.enabled === true,
                webhookEndpointCount: webhookEndpoints.length,
                webhookEventKinds: Array.from(
                  new Set(
                    webhookEndpoints.flatMap(
                      (endpoint) => endpoint.eventKinds || [],
                    ),
                  ),
                ),
              }
            : {}),
        },
        requestId,
      });
      await deliverSiteWebhooks({
        site: updated,
        kind: "site-updated",
        requestId,
        actor: access.session?.user.id,
        reason: auditAction,
        data: {
          before: site,
          after: updated,
        },
        metadata: siteWebhookPatchMetadata(
          auditAction,
          domainVerificationPatch,
          webhooksPatch,
          themePublishPatch,
        ),
      });
    }

    return NextResponse.json({
      success: true,
      requestId,
      data: {
        site: updated,
      },
    });
  } catch (error) {
    console.error("Admin site update API error:", error);
    return errorResponse(
      500,
      "INTERNAL_SERVER_ERROR",
      "Internal server error",
      requestId,
    );
  }
}

export async function DELETE(request: NextRequest, { params }: RouteParams) {
  const requestId = request.headers.get("x-request-id") || makeRequestId();
  const access = await requireAdminAccess(request, requestId, {
    permission: "sites.delete",
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
      const scopeError = await requireAdminTeamScopeAccess(
        access,
        requestId,
        site,
        { action: "manage" },
      );
      if (scopeError) {
        return scopeError;
      }

      await recordAdminAudit({
        repositories,
        siteId: site.id,
        teamId: site.teamId,
        actorId: access.session?.user.id,
        entity: "site",
        entityId: site.id,
        action: "site.deleted",
        before: adminSiteFromRepositorySite(site) || {},
        metadata: {
          slug: site.slug,
          status: statusForRepositorySite(site),
          source: "admin-site-delete",
        },
        requestId,
      });
      await deliverSiteWebhooks({
        repositories,
        site: adminSiteFromRepositorySite(site) || site,
        kind: "site-deleted",
        requestId,
        actor: access.session?.user.id,
        reason: "site.deleted",
        data: {
          before: adminSiteFromRepositorySite(site),
        },
        metadata: {
          action: "site.deleted",
          source: "admin-site-delete",
          lifecycle: "deleted",
        },
      });
      await repositories.sites.delete(site.id);

      return NextResponse.json({
        success: true,
        requestId,
        data: {
          deleted: true,
          siteId: site.id,
        },
      });
    }

    const site = getSiteByIdOrSlug(siteId);

    if (!site) {
      return errorResponse(404, "SITE_NOT_FOUND", "Site not found", requestId);
    }
    const scopeError = await requireAdminTeamScopeAccess(
      access,
      requestId,
      site,
      { action: "manage" },
    );
    if (scopeError) {
      return scopeError;
    }

    await recordAdminAudit({
      siteId: site.id,
      actorId: access.session?.user.id,
      entity: "site",
      entityId: site.id,
      action: "site.deleted",
      before: site,
      metadata: {
        slug: site.slug,
        status: site.status,
        source: "admin-site-delete",
      },
      requestId,
    });
    await deliverSiteWebhooks({
      site,
      kind: "site-deleted",
      requestId,
      actor: access.session?.user.id,
      reason: "site.deleted",
      data: {
        before: site,
      },
      metadata: {
        action: "site.deleted",
        source: "admin-site-delete",
        lifecycle: "deleted",
      },
    });
    deleteAdminSite(site.id);

    return NextResponse.json({
      success: true,
      requestId,
      data: {
        deleted: true,
        siteId: site.id,
      },
    });
  } catch (error) {
    console.error("Admin site delete API error:", error);
    return errorResponse(
      500,
      "INTERNAL_SERVER_ERROR",
      "Internal server error",
      requestId,
    );
  }
}
