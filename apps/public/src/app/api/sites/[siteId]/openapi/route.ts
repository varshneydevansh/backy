/**
 * Site-scoped public OpenAPI document for custom/generated frontends.
 *
 * GET /api/sites/[siteId]/openapi
 */

import { NextRequest } from "next/server";
import type { SiteSettings } from "@backy-cms/core";
import {
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
  coverage: [
    "manifest",
    "openapi",
    "render",
    "media",
    "collections",
    "reusable-sections",
    "forms",
    "comments",
    "events",
    "interactive-components",
  ],
  secretHandling:
    "Database URLs and service credentials stay in CI/runtime environment; OpenAPI exposes only non-secret gate names and requirements.",
} as const;

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
    const delivery = deliveryDiscovery(origin, site);

    return publicContractJson(
      {
        openapi: "3.1.0",
        "x-backy-database-certification": frontendDatabaseCertification,
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
                      "font",
                      "other",
                    ],
                  },
                },
                { name: "q", in: "query", schema: { type: "string" } },
                { name: "tag", in: "query", schema: { type: "string" } },
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
                  description: "Invalid media type, scope, or global filter",
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
                "403": {
                  description: "Private media requires a valid signed URL",
                  headers: mediaFileErrorResponseHeaders,
                },
                "404": {
                  description: "Media file not found",
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
                "400": {
                  description:
                    "Invalid transform width/quality or unsupported media type",
                  headers: mediaTransformErrorResponseHeaders,
                },
                "404": {
                  description: "Media not found or private",
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
              summary: "Fetch the public checkout order intake contract",
              operationId: "getBackyCommerceOrderContract",
              responses: {
                "200": {
                  description: "Commerce order intake contract",
                  content: {
                    "application/json": {
                      schema: {
                        $ref: "#/components/schemas/CommerceOrderContractEnvelope",
                      },
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
              summary: "Submit a Backy form",
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
                        details: { type: "string" },
                        reporterEmail: { type: "string" },
                        requestId: { type: "string" },
                      },
                      required: ["reason"],
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
                    "text",
                    "number",
                    "boolean",
                    "color",
                    "json",
                  ],
                },
                min: { type: "number" },
                max: { type: "number" },
                step: { type: "number" },
                options: {
                  type: "array",
                  items: { type: ["string", "number", "boolean"] },
                },
                defaultValue: {},
                required: { type: "boolean" },
              },
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
                content: { type: "object", additionalProperties: true },
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
                references: { $ref: "#/components/schemas/MediaReferences" },
                referenceSummary: {
                  type: "object",
                  additionalProperties: false,
                  properties: {
                    pageCount: { type: "integer" },
                    postCount: { type: "integer" },
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
                      scope: { type: "string", enum: ["page", "post"] },
                      targetId: { type: "string" },
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
                "pages",
                "posts",
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
                  items: { type: "string", enum: ["global", "page", "post"] },
                },
                pageIds: { type: "array", items: { type: "string" } },
                postIds: { type: "array", items: { type: "string" } },
                pages: {
                  type: "array",
                  items: { $ref: "#/components/schemas/MediaReferenceTarget" },
                },
                posts: {
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
                "Submit form field values under values, fields, data, or submission. Simple frontends may also send field keys at the top level; requestId, pageId, postId, honeypot, startedAt, and captcha token fields are reserved transport metadata keys.",
              properties: {
                values: {
                  type: "object",
                  additionalProperties: true,
                  description: "Preferred field value map.",
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
                frontendDesignBindingHints: {
                  type: "array",
                  items: { type: "object", additionalProperties: true },
                },
              },
            },
            CommerceProviderCertification: {
              type: "object",
              required: [
                "schemaVersion",
                "status",
                "localMockGate",
                "liveCertificationGate",
                "requiredFor",
                "secretHandling",
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
              required: ["customer", "items"],
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
                      slug: { type: "string" },
                      variantId: { type: "string" },
                      variantSku: { type: "string" },
                      quantity: {
                        type: "integer",
                        minimum: 1,
                        maximum: 999,
                        default: 1,
                      },
                    },
                  },
                },
                shippingAddress: { type: "string" },
                billingAddress: { type: "string" },
                notes: { type: "string" },
                discountCode: { type: "string" },
                paymentProvider: { type: "string" },
                paymentReference: { type: "string" },
                checkoutSessionId: { type: "string" },
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
                      enum: ["requires_action", "provider_ready"],
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
