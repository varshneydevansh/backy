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
  "data-backy-responsive-css",
  "data-backy-responsive-style-pointer",
] as const;

const CONTROL_READ_ORDER = [
  "agent-handoff",
  "manifest",
  "openapi",
  "resolve",
  "render",
  "component-dom",
  "probe",
] as const;

const CONTROL_PLANE_TEMPLATE_READ_ORDER = [
  "templates",
  "admin-endpoints",
] as const;

const configuredForbiddenEnv = () =>
  BACKY_CUSTOM_FRONTEND_FORBIDDEN_ENV.filter((name) => Boolean(process.env[name]));

const siteEndpoint = (path: string) =>
  `${backyConfig.apiBaseUrl}/sites/${encodeURIComponent(backyConfig.siteId)}${path}`;

const renderEndpoint = (path: string) => {
  const search = new URLSearchParams({ path });
  if (backyConfig.sitePublicHost) search.set("domain", backyConfig.sitePublicHost);
  return `${siteEndpoint("/render")}?${search.toString()}`;
};

const adminSiteEndpoint = (path: string) =>
  `${backyConfig.apiBaseUrl}/${["admin", "sites", encodeURIComponent(backyConfig.siteId)].join("/")}${path}`;

const asRecord = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};

const renderElementCount = (payload: unknown) => {
  const data = asRecord(payload);
  const content = asRecord(data.content);
  const contentDocument = asRecord(content.contentDocument);
  const elements = Array.isArray(content.elements)
    ? content.elements
    : Array.isArray(contentDocument.elements)
      ? contentDocument.elements
      : [];
  return elements.length;
};

const hasEditableMap = (payload: unknown) => {
  const data = asRecord(payload);
  const content = asRecord(data.content);
  const editableMap = data.editableMap ?? content.editableMap;
  if (Array.isArray(editableMap)) return editableMap.length > 0;
  return Boolean(editableMap && typeof editableMap === "object" && Object.keys(editableMap).length > 0);
};

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
    responsiveStylePointer: "render.generatedResponsiveCss",
  },
  controlPlane: {
    schemaVersion: "backy.custom-frontend-control-plane.v1",
    sourceOfTruth: "backy-public",
    readOrder: [...CONTROL_READ_ORDER, ...CONTROL_PLANE_TEMPLATE_READ_ORDER],
    endpoints: {
      agentHandoff: siteEndpoint("/agent-handoff"),
      manifest: siteEndpoint("/manifest"),
      openapi: siteEndpoint("/openapi"),
      resolve: siteEndpoint("/resolve"),
      renderHome: renderEndpoint("/"),
      connectionProbe: "/api/backy-connection",
      templateRegistry: adminSiteEndpoint("/templates"),
      frontendDesignManagement: adminSiteEndpoint("/frontend-design"),
    },
    pointers: {
      componentTypeContracts: "agent-handoff.componentApiContract.componentTypeContracts",
      propertyMap: "agent-handoff.componentApiContract.propertyMap",
      renderElements: "render.data.content.elements[]",
      editableMap: "render.data.editableMap",
      responsiveStyles: "render.generatedResponsiveCss",
      frontendDesign: "manifest.data.site.frontendDesign",
      deploymentTopology: "agent-handoff.deploymentTopology",
      templateRegistry: "agent-handoff.endpoints.templates",
      templateCloneFields: "agent-handoff.contentCreation.templateCloneFields",
      templateAliasField: "agent-handoff.contentCreation.customFrontendTemplateField",
      templateAliasFields: "agent-handoff.contentCreation.customFrontendRouteFieldAliases",
      adminEntryPoints: "agent-handoff.contentCreation.adminEntryPoints",
    },
    templateReuse: {
      endpoint: "agent-handoff.endpoints.templates",
      cloneField: "agent-handoff.contentCreation.customFrontendTemplateField",
      cloneFieldAliases: "agent-handoff.contentCreation.templateCloneFields",
      createRoutes: "agent-handoff.contentCreation.adminEntryPoints",
    },
    preserve: {
      domAttributes: [...REQUIRED_DOM_ATTRIBUTES],
      elementMetadata: [
        "data-backy-prop-keys",
        "data-backy-style-keys",
        "data-backy-responsive-breakpoints",
        "data-backy-responsive-css",
        "data-backy-responsive-style-pointer",
        "data-backy-token-ref-keys",
        "data-backy-asset-ids",
        "data-backy-action-count",
        "data-backy-binding-count",
        "data-backy-animation-type",
      ],
    },
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
    const render = await backy.render("/");
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
          renderReachable: true,
          renderElementCount: renderElementCount(render.data),
          hasEditableMap: hasEditableMap(render.data),
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
