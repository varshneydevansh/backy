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
import { normalizeNavigationConfig } from "@/lib/navigation";
import { publicContractJson } from "@/lib/publicContractResponse";
import { normalizeRedirectRules } from "@/lib/redirectRules";
import {
  getRequiredDatabaseRepositories,
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

type SiteSettingsScopedSite = {
  id: string;
  slug: string;
  teamId?: string | null;
  settings?: SiteSettings;
};

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

const siteSettingsEnvelope = (
  site: SiteSettingsScopedSite,
  workspaceSettings: Parameters<typeof workspaceSettingsSummary>[0],
) => ({
  schemaVersion: SITE_SETTINGS_SCOPE_SCHEMA,
  scope: {
    level: "site",
    siteId: site.id,
    siteSlug: site.slug,
    teamId: site.teamId || null,
    workspaceSettingsScope: "global",
    siteSettingsScope: "site",
  },
  siteSettings: {
    ...DEFAULT_SITE_SETTINGS,
    ...(site.settings || {}),
  },
  workspaceSettings: workspaceSettingsSummary(workspaceSettings),
  effectiveSettings: {
    workspace: workspaceSettingsSummary(workspaceSettings),
    site: {
      ...DEFAULT_SITE_SETTINGS,
      ...(site.settings || {}),
    },
  },
  endpoints: {
    workspaceSettings: "/api/admin/settings",
    siteSettings: `/api/admin/sites/${encodeURIComponent(site.id)}/settings`,
    siteDetail: `/api/admin/sites/${encodeURIComponent(site.id)}`,
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
