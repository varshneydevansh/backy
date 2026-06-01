import { NextResponse } from "next/server";

import { backy, backyConfig } from "../../../lib/backy";
import { BACKY_CUSTOM_FRONTEND_FORBIDDEN_ENV } from "../../../lib/backy-client";

export const dynamic = "force-dynamic";

const REQUIRED_DOM_ATTRIBUTES = [
  "data-backy-site-id",
  "data-backy-route",
  "data-backy-element-id",
  "data-backy-element-type",
  "data-backy-component-contract-pointer",
  "data-backy-editable-map-pointer",
] as const;

const configuredForbiddenEnv = () =>
  BACKY_CUSTOM_FRONTEND_FORBIDDEN_ENV.filter((name) => Boolean(process.env[name]));

const connectionBody = (overrides: Record<string, unknown> = {}) => ({
  success: true,
  schemaVersion: "backy.custom-frontend-connection.v1",
  runtime: "backy-custom-frontend-next-starter",
  configured: {
    apiBaseUrl: backyConfig.apiBaseUrl,
    siteId: backyConfig.siteId,
    sitePublicHost: backyConfig.sitePublicHost || "",
  },
  boundaries: {
    includesSecretValues: false,
    browserSafeEnv: backyConfig.browserSafeEnv,
    serverSideEnv: backyConfig.serverSideEnv,
    forbiddenEnv: [...BACKY_CUSTOM_FRONTEND_FORBIDDEN_ENV],
    forbiddenEnvPresent: configuredForbiddenEnv(),
  },
  domContract: {
    requiredAttributes: [...REQUIRED_DOM_ATTRIBUTES],
    editableMapPointer: "render.data.editableMap",
    componentContractPointer: "agent-handoff.componentApiContract",
  },
  verification: {
    connectionSmoke: "npm run test:custom-frontend-connection",
    requireFrontendEnv: "BACKY_CUSTOM_FRONTEND_REQUIRE_FRONTEND=1",
    requireProbeEnv: "BACKY_CUSTOM_FRONTEND_REQUIRE_PROBE=1",
  },
  ...overrides,
});

export async function GET() {
  try {
    const manifest = await backy.manifest();
    const handoff = manifest.data.contract?.customFrontendAgentHandoff as
      | Record<string, unknown>
      | undefined;

    return NextResponse.json(
      connectionBody({
        backy: {
          manifestReachable: true,
          manifestSchema: manifest.data.schemaVersion,
          manifestSiteId: manifest.data.site.id,
          manifestSiteName: manifest.data.site.name || "",
          hasCustomFrontendHandoff: Boolean(handoff),
          hasComponentApiContract: Boolean(
            handoff && typeof handoff === "object" && "componentApiContract" in handoff,
          ),
        },
      }),
      { status: 200 },
    );
  } catch (error) {
    return NextResponse.json(
      connectionBody({
        success: false,
        backy: {
          manifestReachable: false,
          error: error instanceof Error ? error.message : "Backy manifest could not be reached.",
        },
      }),
      { status: 502 },
    );
  }
}
