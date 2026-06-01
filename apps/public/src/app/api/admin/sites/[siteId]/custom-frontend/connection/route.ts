/**
 * Protected custom frontend connection verifier.
 *
 * POST /api/admin/sites/[siteId]/custom-frontend/connection
 *
 * Checks a deployed website frontend for Backy control without exposing secrets:
 * - public /api/backy-connection probe
 * - required data-backy-* DOM control attributes
 * - expected public Backy API base and site identifier
 */

import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { NextRequest, NextResponse } from "next/server";
import { requireAdminAccess } from "@/lib/adminAccess";
import { getSiteByIdOrSlug } from "@/lib/backyStore";
import {
  getRequiredDatabaseRepositories,
  shouldUseDemoStoreFallback,
} from "@/lib/repositoryRuntime";

export const runtime = "nodejs";

interface RouteParams {
  params: Promise<{
    siteId: string;
  }>;
}

type CheckStatus = "pass" | "warning" | "fail";

type ConnectionCheck = {
  id: string;
  label: string;
  status: CheckStatus;
  detail: string;
};

const REQUIRED_DOM_ATTRIBUTES = [
  "data-backy-site-id",
  "data-backy-route",
  "data-backy-element-id",
  "data-backy-element-type",
  "data-backy-component-contract-pointer",
  "data-backy-editable-map-pointer",
] as const;

const FORBIDDEN_PRIVATE_ENV = [
  "POSTGRES_URL",
  "POSTGRES_PRISMA_URL",
  "POSTGRES_URL_NON_POOLING",
  "BACKY_DATABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
  "SUPABASE_SECRET_KEY",
  "BACKY_ADMIN_API_KEY",
  "BACKY_ADMIN_SECRET_KEY",
  "BACKY_BOOTSTRAP_TOKEN",
  "CRON_SECRET",
  "SMTP_PASSWORD",
  "STRIPE_SECRET_KEY",
] as const;

const makeRequestId = () =>
  `req_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const text = (value: unknown): string =>
  typeof value === "string" ? value.trim() : "";

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
      error: { code, message },
    },
    { status },
  );

const parseJsonBody = async (
  request: NextRequest,
): Promise<Record<string, unknown>> => {
  try {
    const body = await request.json();
    return isRecord(body) ? body : {};
  } catch {
    return {};
  }
};

const normalizeApiBaseUrl = (value: unknown, fallback: string): string => {
  const input = text(value) || fallback;
  const url = new URL(input);
  const pathname = url.pathname.replace(/\/+$/u, "");
  url.pathname = pathname.endsWith("/api")
    ? pathname
    : `${pathname}/api`.replace(/\/{2,}/gu, "/");
  url.search = "";
  url.hash = "";
  return url.toString().replace(/\/$/u, "");
};

const normalizeHost = (value: unknown): string =>
  text(value)
    .toLowerCase()
    .replace(/^https?:\/\//u, "")
    .replace(/\/.*$/u, "")
    .replace(/\.$/u, "");

const ipv4Parts = (value: string): number[] | null => {
  const parts = value.split(".");
  if (parts.length !== 4) return null;
  const numbers = parts.map((part) => Number(part));
  return numbers.every((part) => Number.isInteger(part) && part >= 0 && part <= 255)
    ? numbers
    : null;
};

const isPrivateAddress = (address: string): boolean => {
  const mappedIpv4 = address.toLowerCase().match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/u)?.[1];
  const ipv4 = ipv4Parts(mappedIpv4 || address);
  if (ipv4) {
    const [a, b, c] = ipv4;
    return (
      a === 0 ||
      a === 10 ||
      a === 127 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 0) ||
      (a === 192 && b === 168) ||
      (a === 198 && (b === 18 || b === 19)) ||
      (a === 198 && b === 51 && c === 100) ||
      (a === 203 && b === 0 && c === 113) ||
      a >= 224
    );
  }

  const normalized = address.toLowerCase();
  return (
    normalized === "::1" ||
    normalized === "::" ||
    normalized.startsWith("fc") ||
    normalized.startsWith("fd") ||
    normalized.startsWith("fe80:")
  );
};

const assertPublicFrontendUrl = async (input: unknown): Promise<URL> => {
  const url = new URL(text(input));
  if (!["http:", "https:"].includes(url.protocol)) {
    throw new Error("Use an http or https frontend URL.");
  }
  if (url.username || url.password) {
    throw new Error("Frontend URL must not contain credentials.");
  }
  if (!url.hostname) {
    throw new Error("Frontend URL must include a host.");
  }

  const host = url.hostname.toLowerCase();
  if (
    host === "localhost" ||
    host.endsWith(".localhost") ||
    host.endsWith(".local") ||
    host === "metadata.google.internal"
  ) {
    throw new Error("Frontend URL must be a public deployment host, not a local/internal host.");
  }

  if (isIP(host)) {
    if (isPrivateAddress(host)) {
      throw new Error("Frontend URL resolves to a private or reserved IP address.");
    }
    return url;
  }

  const records = await Promise.race([
    lookup(host, { all: true, verbatim: true }),
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error("DNS lookup timed out.")), 5000),
    ),
  ]);
  if (records.length === 0) {
    throw new Error("Frontend URL host has no DNS records.");
  }
  const privateRecord = records.find((record) => isPrivateAddress(record.address));
  if (privateRecord) {
    throw new Error("Frontend URL host resolves to a private or reserved IP address.");
  }

  return url;
};

const fetchText = async (url: URL, accept: string) => {
  const response = await fetch(url, {
    redirect: "manual",
    signal: AbortSignal.timeout(15000),
    headers: { accept },
  });
  const body = await response.text();
  return {
    response,
    body,
    contentType: response.headers.get("content-type") || "",
  };
};

const safeJson = (body: string): Record<string, unknown> | null => {
  try {
    const parsed = JSON.parse(body);
    return isRecord(parsed) ? parsed : null;
  } catch {
    return null;
  }
};

const nestedRecord = (
  value: Record<string, unknown> | null,
  key: string,
): Record<string, unknown> => {
  const child = value?.[key];
  return isRecord(child) ? child : {};
};

const nestedStringArray = (
  value: Record<string, unknown>,
  key: string,
): string[] => {
  const child = value[key];
  return Array.isArray(child)
    ? child.filter((entry): entry is string => typeof entry === "string")
    : [];
};

const addCheck = (
  checks: ConnectionCheck[],
  status: CheckStatus,
  id: string,
  label: string,
  detail: string,
) => {
  checks.push({ id, label, status, detail });
};

const summarize = (checks: ConnectionCheck[]) => {
  const failed = checks.filter((check) => check.status === "fail").length;
  const warnings = checks.filter((check) => check.status === "warning").length;
  return {
    status: failed > 0 ? "failed" : warnings > 0 ? "warning" : "ready",
    passed: checks.filter((check) => check.status === "pass").length,
    warnings,
    failed,
    total: checks.length,
  };
};

const getSite = async (siteId: string) => {
  if (!shouldUseDemoStoreFallback()) {
    const repositories = await getRequiredDatabaseRepositories();
    return (await repositories.sites.getById(siteId)) || (await repositories.sites.getBySlug(siteId));
  }

  return getSiteByIdOrSlug(siteId);
};

export async function POST(request: NextRequest, { params }: RouteParams) {
  const requestId = request.headers.get("x-request-id") || makeRequestId();
  const access = await requireAdminAccess(request, requestId, {
    permission: "sites.view",
  });
  if (access instanceof NextResponse) {
    return access;
  }

  try {
    const { siteId } = await params;
    const site = await getSite(siteId);
    if (!site) {
      return errorResponse(404, "SITE_NOT_FOUND", "Site not found", requestId);
    }

    const body = await parseJsonBody(request);
    const checks: ConnectionCheck[] = [];
    const frontendUrl = await assertPublicFrontendUrl(body.frontendUrl);
    frontendUrl.hash = "";
    const frontendUrlText = frontendUrl.toString();
    const probeUrl = new URL("/api/backy-connection", frontendUrl);
    const publicApiBase = normalizeApiBaseUrl(
      body.expectedApiBaseUrl,
      `${new URL(request.url).origin}/api`,
    );
    const expectedSiteIdentifiers = Array.from(
      new Set([site.id, site.slug, siteId].filter(Boolean)),
    );
    const expectedPublicHosts = Array.from(
      new Set([
        normalizeHost(body.expectedSitePublicHost),
        normalizeHost(site.customDomain),
        normalizeHost(site.settings?.domainVerification?.domain),
        ...(Array.isArray(site.settings?.domainAliases)
          ? site.settings.domainAliases.map((alias) => normalizeHost(alias.host))
          : []),
        normalizeHost(frontendUrl.hostname),
      ].filter(Boolean)),
    );

    let probe: Record<string, unknown> | null = null;
    const probeFetch = await fetchText(probeUrl, "application/json");
    if (probeFetch.response.status !== 200) {
      addCheck(
        checks,
        "fail",
        "probe.status",
        "Connection probe reachable",
        `/api/backy-connection returned ${probeFetch.response.status}.`,
      );
    } else if (!probeFetch.contentType.includes("application/json")) {
      addCheck(
        checks,
        "fail",
        "probe.contentType",
        "Connection probe returns JSON",
        `Probe returned ${probeFetch.contentType || "no content type"}.`,
      );
    } else {
      probe = safeJson(probeFetch.body);
      addCheck(
        checks,
        probe ? "pass" : "fail",
        "probe.json",
        "Connection probe returns parseable JSON",
        probe
          ? "Probe JSON parsed successfully."
          : "Probe response was not valid JSON.",
      );
    }

    const configured = nestedRecord(probe, "configured");
    const backy = nestedRecord(probe, "backy");
    const boundaries = nestedRecord(probe, "boundaries");
    const domContract = nestedRecord(probe, "domContract");
    const requiredAttributes = nestedStringArray(domContract, "requiredAttributes");
    const forbiddenEnvPresent = nestedStringArray(boundaries, "forbiddenEnvPresent");

    if (probe) {
      addCheck(
        checks,
        probe.success === true ? "pass" : "fail",
        "probe.success",
        "Probe reports success",
        probe.success === true
          ? "The custom frontend reports a healthy connection probe."
          : "The custom frontend probe reports success=false.",
      );
      addCheck(
        checks,
        probe.schemaVersion === "backy.custom-frontend-connection.v1"
          ? "pass"
          : "fail",
        "probe.schema",
        "Probe schema is current",
        `Schema: ${text(probe.schemaVersion) || "missing"}.`,
      );
      addCheck(
        checks,
        text(configured.apiBaseUrl).replace(/\/+$/u, "") === publicApiBase
          ? "pass"
          : "fail",
        "probe.apiBase",
        "Probe uses the expected Backy public API",
        `Expected ${publicApiBase}; probe reports ${text(configured.apiBaseUrl) || "missing"}.`,
      );
      const reportedSiteId = text(configured.siteId);
      addCheck(
        checks,
        expectedSiteIdentifiers.includes(reportedSiteId) ? "pass" : "fail",
        "probe.siteId",
        "Probe uses this Backy site",
        `Expected one of ${expectedSiteIdentifiers.join(", ")}; probe reports ${reportedSiteId || "missing"}.`,
      );
      const reportedPublicHost = normalizeHost(configured.sitePublicHost);
      addCheck(
        checks,
        !reportedPublicHost || expectedPublicHosts.includes(reportedPublicHost)
          ? "pass"
          : "warning",
        "probe.publicHost",
        "Probe public host matches this site",
        reportedPublicHost
          ? `Probe reports ${reportedPublicHost}.`
          : "Probe does not report a public host; host-aware routing can still work if the frontend passes domain context.",
      );
      addCheck(
        checks,
        backy.manifestReachable === true ? "pass" : "fail",
        "probe.manifest",
        "Probe can reach Backy manifest",
        backy.manifestReachable === true
          ? "Manifest is reachable from the custom frontend runtime."
          : "The custom frontend cannot reach the Backy manifest.",
      );
      addCheck(
        checks,
        backy.hasCustomFrontendHandoff === true ? "pass" : "fail",
        "probe.handoff",
        "Probe sees custom frontend handoff",
        backy.hasCustomFrontendHandoff === true
          ? "The manifest includes Backy's custom frontend handoff."
          : "The manifest did not expose the custom frontend handoff.",
      );
      addCheck(
        checks,
        boundaries.includesSecretValues === false ? "pass" : "fail",
        "probe.noSecrets",
        "Probe does not expose secret values",
        boundaries.includesSecretValues === false
          ? "Probe explicitly declares includesSecretValues=false."
          : "Probe did not prove that secret values are excluded.",
      );
      addCheck(
        checks,
        forbiddenEnvPresent.length === 0 ? "pass" : "fail",
        "probe.forbiddenEnv",
        "No forbidden private env in frontend",
        forbiddenEnvPresent.length === 0
          ? "Probe reports no forbidden private env names."
          : `Probe reports forbidden private env names: ${forbiddenEnvPresent.join(", ")}.`,
      );
      const missingProbeAttributes = REQUIRED_DOM_ATTRIBUTES.filter(
        (attribute) => !requiredAttributes.includes(attribute),
      );
      addCheck(
        checks,
        missingProbeAttributes.length === 0 ? "pass" : "fail",
        "probe.domContract",
        "Probe documents Backy DOM control attributes",
        missingProbeAttributes.length === 0
          ? "Probe documents all required DOM control attributes."
          : `Probe is missing ${missingProbeAttributes.join(", ")}.`,
      );
    }

    const pageFetch = await fetchText(frontendUrl, "text/html");
    if (pageFetch.response.status !== 200) {
      addCheck(
        checks,
        "fail",
        "page.status",
        "Frontend page renders",
        `Frontend URL returned ${pageFetch.response.status}.`,
      );
    } else if (!pageFetch.contentType.includes("text/html")) {
      addCheck(
        checks,
        "fail",
        "page.contentType",
        "Frontend page returns HTML",
        `Frontend URL returned ${pageFetch.contentType || "no content type"}.`,
      );
    } else {
      addCheck(
        checks,
        "pass",
        "page.html",
        "Frontend page returns HTML",
        "The frontend root returned HTML.",
      );
      const missingPageAttributes = REQUIRED_DOM_ATTRIBUTES.filter(
        (attribute) => !pageFetch.body.includes(attribute),
      );
      addCheck(
        checks,
        missingPageAttributes.length === 0 ? "pass" : "fail",
        "page.domAttributes",
        "Rendered page keeps Backy control attributes",
        missingPageAttributes.length === 0
          ? "The rendered HTML includes all required data-backy-* control attributes."
          : `Rendered HTML is missing ${missingPageAttributes.join(", ")}.`,
      );
    }

    const summary = summarize(checks);

    return NextResponse.json({
      success: true,
      requestId,
      data: {
        schemaVersion: "backy.admin-custom-frontend-connection-check.v1",
        checkedAt: new Date().toISOString(),
        frontendUrl: frontendUrlText,
        probeUrl: probeUrl.toString(),
        status: summary.status,
        summary,
        expected: {
          apiBaseUrl: publicApiBase,
          siteIdentifiers: expectedSiteIdentifiers,
          publicHosts: expectedPublicHosts,
          requiredDomAttributes: [...REQUIRED_DOM_ATTRIBUTES],
          forbiddenPrivateEnv: [...FORBIDDEN_PRIVATE_ENV],
        },
        checks,
        probe: probe
          ? {
              schemaVersion: text(probe.schemaVersion) || null,
              runtime: text(probe.runtime) || null,
              configured: {
                apiBaseUrl: text(configured.apiBaseUrl) || null,
                siteId: text(configured.siteId) || null,
                sitePublicHost: text(configured.sitePublicHost) || null,
              },
              backy: {
                manifestReachable: backy.manifestReachable === true,
                manifestSchema: text(backy.manifestSchema) || null,
                hasCustomFrontendHandoff: backy.hasCustomFrontendHandoff === true,
                hasComponentApiContract: backy.hasComponentApiContract === true,
              },
              boundaries: {
                includesSecretValues: boundaries.includesSecretValues === false
                  ? false
                  : null,
                forbiddenEnvPresent,
              },
              domContract: {
                requiredAttributes,
              },
            }
          : null,
        smokeCommand:
          "BACKY_CUSTOM_FRONTEND_REQUIRE_FRONTEND=1 BACKY_CUSTOM_FRONTEND_REQUIRE_PROBE=1 npm run test:custom-frontend-connection",
      },
    });
  } catch (error) {
    return errorResponse(
      400,
      "CUSTOM_FRONTEND_CONNECTION_CHECK_FAILED",
      error instanceof Error ? error.message : "Unable to verify custom frontend connection.",
      requestId,
    );
  }
}
