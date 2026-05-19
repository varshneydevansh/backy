# Backy API Contract (Admin + Public + External Frontend)

**Version**: 0.1.0 (baseline)
**Last Updated**: 2026-02-23

This document defines how custom frontends, admin UI, and public renderer interact with Backy data.

---

## 1) Base conventions

- All responses use JSON.
- Envelope for list/detail APIs:
  - `{ success: true, data: ... }`
  - `{ success: false, error: { code, message, details? } }`
- Public interaction envelope should include `requestId` for debugging.
- Validation errors return `code: "VALIDATION_ERROR"` and field-level details where possible.
- Two-tier deployment model:
  - `backy-admin` (authenticated admin + write APIs)
  - `backy-public` (public reader + interaction APIs for external frontends)
- Public contracts must remain consumable by third-party frontends without importing admin internals.

### 1.1 API base paths in this repo

- Current repository example routes are exposed under `public app /api/...`:
  - `/api/sites/...` for public read + form/comment submission.
- `backy-admin` should expose write/API routes under `/api/admin/...` and protect them with auth middleware.
- Optional API facade: route `/api/public/...` can proxy to the same public handlers for clearer separation without changing implementation.

---

## 2) Public API (consumer-facing)

### 2.1 Resolve site and page

- `GET /api/sites?identifier=:identifier`
  - Canonical public bootstrap endpoint for external frontends and SDK clients.
  - Resolves by published site id, slug, or custom domain and returns `{ success, requestId, data: { site } }`; legacy top-level `site` remains for compatibility.
  - Without `identifier`, returns `{ success, requestId, data: { sites, pagination } }` for published-site discovery with `limit` capped to 100.
  - Responses use discovery cache headers, request id headers, and rate-limit headers when public discovery throttling is enabled.
  - Draft/unpublished sites are hidden from public bootstrap.
  - The frontend manifest advertises this endpoint as `data.endpoints.site`; the site-scoped OpenAPI document also includes `/api/sites` as `operationId: discoverBackySite`, and `npm run test:frontend-contract --workspace @backy/public` guards that manifest/OpenAPI/SDK parity.

- `GET /api/sites/:identifier` (legacy/default public route shape in older docs)
- `GET /api/public/sites/:identifier` (optional external contract alias)
  - Resolve by `subdomain`, `siteId`, or `customDomain`.
  - Returns minimal site metadata and theme defaults.
  - Current implementation also supports `GET /api/sites?identifier=:identifier`.
  - Response uses `{ success, requestId, data: { site } }`; legacy top-level `site` remains for compatibility.
  - Draft/unpublished sites are hidden from public bootstrap.

- `GET /api/sites/:siteId/manifest`
  - Site-level frontend discovery/bootstrap document described by `specs/ai-frontend-contract/frontend-manifest.schema.json`.
  - Returns site identity, theme tokens, schema references, capability flags, public endpoint URLs, route patterns, navigation, module summaries, collection field schemas, form submit/detail/submission/contact URLs, page/blog comment URL templates, comment report URLs, interaction event URLs, media/font counts, and form-to-collection target metadata.
  - Exposes `data.site.frontendDesign` as the site-level design contract (`schemaVersion`, `status`, `source`, `tokens`, `chrome`, `templates`, `editableMap`) plus `capabilities.frontendDesignContract` and `endpoints.frontendDesign`, so custom frontends can preserve header/navigation/footer, fonts, colors, template provenance, and editable bindings when Backy creates new content.
  - Exposes `modules.interactiveComponents`, `capabilities.interactiveComponents`, `endpoints.interactiveComponents`, and `endpoints.interactiveComponentsInManifest` so custom frontends can discover registry-backed `interactiveFigure` and `codeComponent` blocks without importing admin/editor code.
  - Published manifest responses include `Cache-Control: public, max-age=60, stale-while-revalidate=300`, `ETag`/`If-None-Match` 304 support, `x-backy-cache-scope: discovery`, `x-backy-contract-version`, `x-backy-schema-version`, `x-backy-request-id`, and `x-backy-site-id`.
  - Draft/unpublished sites are hidden from the public manifest.

- `GET /api/sites/:siteId/interactive-components`
  - Site-scoped public registry discovery for rich blog/page figures, calculators, simulations, and custom code components.
  - Returns `backy.interactive-component-registry.v1` with the shared manifest contract, available component keys, versions, control schemas, allowed data-binding scopes, fallback requirements, sandbox mode, runtime sandbox URLs, and security/integrity flags.
  - Built-in registry entries currently include `backy.figure.rounds` for communication-round/self-correction diagrams, `backy.figure.stepper` for step-through process diagrams, and `backy.chart.line`; custom code is represented by `backy.custom.sandboxed` and is disabled unless the sandbox runtime is configured.
  - Published registry responses use discovery cache headers, ETag/304 revalidation, `x-backy-schema-version: backy.interactive-component-registry.v1`, and never expose admin API access or secrets.
  - Draft/unpublished sites are hidden from the public registry.
- `GET /api/sites/:siteId/interactive-components/:componentKey/:version/sandbox`
  - Site-scoped sandbox bootstrap for registered `codeComponent` entries.
  - Serves a constrained HTML iframe shell with CSP, `no-referrer`, no admin data, and the `backy.interactive-component.v1` `postMessage` ready/init/resize protocol.
  - Only published sites and active sandbox iframe components are served; unknown, disabled, or unpublished components return a static error shell.
- `POST /api/sites/:siteId/interactive-components/runtime-events`
  - Public runtime telemetry endpoint used by the hosted renderer and SDK to record sandbox lifecycle failures.
  - Accepts bounded `componentKey`, `version`, `elementId`, `pageId`, `postId`, `type`, and `message` fields, then stores an `interactive-runtime` event in the existing interaction event/audit stream.
  - The endpoint records diagnostics only; it never accepts executable code, secrets, cookies, or admin credentials.

- `GET/PATCH/POST /api/admin/sites/:siteId/frontend-design`
  - Reads and writes the site-level frontend design contract used to preserve custom frontend chrome, navigation, footer, font/color/spacing tokens, template registries, editable bindings, and content-generation provenance.
  - Admin reads require `sites.view`; saves and captures require `sites.configure`.
  - GET responses include `endpoints.templates` plus a `templateRegistry` summary with schema, supported template types, `frontendDesignTemplateId` clone field, clone targets, and current template count, so admin/custom frontend builders can discover the normalized registry from the design-contract entry point.
  - `PATCH` accepts either the contract directly or `{ frontendDesign }`, normalizes it to `backy.frontend-design.v1`, persists it to site settings, and emits `frontendDesign.update` audit logs with before/after snapshots plus source/template/editable-map counts.
  - `POST` with `{ action: "import-frontend-contract", frontendDesign | contract | design | manifest }` imports a custom frontend design contract, including Backy public manifest payloads shaped as `manifest.data.site.frontendDesign`, normalizes and persists it, emits `frontendDesign.import` audit logs, and lets subsequent create APIs generate pages/content from the imported templates.
  - `POST` with `{ action: "capture-site-defaults" }` snapshots Backy-managed site defaults into a frontend design contract and emits `frontendDesign.capture` audit logs.
  - `POST` with `{ action: "capture-content-template", resourceType: "page" | "blogPost" | "form" | "product" | "collection" | "section", resourceId, collectionId?, templateId?, templateName?, routePattern? }` snapshots an existing page, blog post, form, product collection record, collection schema, or reusable section into a reusable frontend design template, preserves chrome/tokens/custom CSS/binding hints from frontend-design metadata, preserves structured form fields/settings, product values, collection fields/routes, and section canvas content, infers editable bindings from element props/data bindings, and emits `frontendDesign.template.capture` audit logs.
  - Admin create APIs for pages, blog posts, forms, reusable sections, collections, and product records accept `frontendDesignTemplateId` or `designTemplateId`, seed missing content/schema/field/value data from the matching captured template, and store `frontendDesign*` provenance so custom frontends can continue creating content that keeps the connected frontend's chrome, tokens, routes, and editable bindings.
  - Database mode frontend-design mutations record `settings` cache invalidation events so public discovery/manifest consumers can revalidate the changed design contract.

- `GET /api/admin/sites/:siteId/templates`
  - Admin-facing normalized template registry backed by the persisted `site.settings.frontendDesign.templates` contract.
  - Requires `pages.view`.
  - Query filters: `type=page|blogPost|form|product|collection|section`, `search`.
  - Returns `backy.template-registry.v1` with template groups by type, content summaries, binding hint counts, canvas metadata, and exact clone targets for `POST /pages`, `/blog`, `/forms`, `/reusable-sections`, `/collections`, and `/collections/products/records`.
  - Each entry includes a `clone` block with `method`, `endpoint`, and a starter body using `frontendDesignTemplateId`, so admin surfaces and custom frontends can create new pages, blog posts, forms, reusable sections, collections, and products from the same captured template registry without reverse-engineering the full frontend-design payload.
  - `npm run test:template-registry --workspace @backy/public` behavior-tests grouping, filtering, summaries, and clone payloads for page, form, and product templates.
  - The `/sites/:siteId` Frontend design contract panel renders the same registry schema, endpoint, clone field, supported types, and clone target count so operators can discover the registry from the site settings workflow.

- `GET /api/admin/sites/:siteId/interactive-components/:componentKey/:version/usage`
  - Admin-only usage inventory for registry-backed `interactiveFigure` and `codeComponent` versions before delete, rollback, review approval, or migration.
  - Scans draft, scheduled, published, and archived page/blog content for matching `componentKey@version` records, including nested grouped elements.
  - Returns target type/id/title/slug/status, element id/type/path, render mode, fallback presence, updated timestamp, and scanned page/post counts.

- `GET /api/admin/sites/:siteId/interactive-components/:componentKey/:version/export`
  - Admin-only portable export package for moving a reviewed component version between Backy sites or environments.
  - Returns `backy.interactive-component-export.v1` with component definition, runtime/sandbox URLs, bundle/integrity metadata, dependency metadata, import target, conflict behavior, and a usage-inventory endpoint link.
  - `POST /api/admin/sites/:siteId/interactive-components` also accepts `{ exportPackage }` and imports the package as a disabled draft, optionally overriding `componentKey`, `version`, or `displayName`, while preserving source/import metadata under `dependencyMetadata.importExport`.

- `POST /api/admin/sites/:siteId/interactive-components/:componentKey/:version/bundle`
  - Admin-only signed bundle storage for custom interactive component versions.
  - Accepts `{ filename, contentType, contentBase64, signature?, signedBy?, updatedBy?, changelog? }`, restricts stored bundles to `.js`, `.mjs`, or `.json` payloads up to 5 MB, computes server-side SHA-256, and stores bytes through the configured Backy storage adapter.
  - If `signature` is omitted, Backy derives `sha256=<hmac>` from `BACKY_COMPONENT_REGISTRY_SIGNING_KEY` or `BACKY_INTERACTIVE_COMPONENT_SIGNING_KEY`; otherwise the caller-provided signature is stored with the computed hash.
  - Updates the component's `runtime.bundleUrl`, preserves or fills `runtime.sandboxUrl`, stores signed integrity metadata plus `dependencyMetadata.bundle`, and emits `interactiveComponent.bundle.upload` audit/cache invalidation metadata. The route stores bundle bytes only; execution remains constrained to the frontend sandbox/runtime contract.
  - Repository smoke coverage verifies DB-backed registry persistence for approved sandbox runtime metadata, signed bundle integrity fields, Supabase-style storage provider/path metadata, dependency bundle metadata, rollback, and delete.
  - Hostile-bundle browser smoke coverage verifies the public/admin iframe allowlists, server validation guards, and real Chrome sandbox isolation for parent DOM/location/cookie/localStorage access, top-navigation escape, and popup escape attempts.

- `POST /api/admin/sites/:siteId/interactive-components/:componentKey/:version/migrate`
  - Admin-only component version migration tool for page/blog content that references an older `componentKey@version`.
  - Accepts `{ targetComponentKey?, targetVersion, dryRun?, updatedBy? }`; `dryRun` defaults to `true`, and `dryRun: false` applies the migration.
  - Scans draft, scheduled, published, and archived pages/blog posts, including nested grouped elements, then updates matching component elements to the target key/version, refreshes render capability metadata from the target component, preserves fallback content, creates content revisions, and emits `interactiveComponent.migrate` audit/cache invalidation metadata.

- `POST /api/admin/sites/:siteId/interactive-components/:componentKey/:version/review`
  - Admin-only submit/approve/reject workflow for custom interactive component versions.
  - Accepts `{ action: "submit" | "approve" | "reject", reviewedBy?, updatedBy?, runtime?, integrity?, dependencyMetadata?, notes?, checklist?, changelog? }`.
  - Submit keeps the component disabled and moves it to `in_review`; approve moves it to `approved`/`active`; reject moves it to `rejected`/`disabled`.
  - Create/update/review approval validates runtime URLs, iframe sandbox flags, allowed permissions, signed integrity metadata for custom code, dependency names/versions, blocked runtime modules, and lifecycle script fields before a sandbox component can become active.
  - Review actions emit `interactiveComponent.review.*` audit rows and settings cache invalidations.

- `GET /api/sites/:siteId/openapi`
  - Site-scoped OpenAPI 3.1 document for public frontend integrations.
  - Describes site discovery, route resolution, render payload, navigation, media list, collection list/records/create, form detail/submission/contact operations, page/blog/site comment operations, comment reports, report reasons, and interaction events for the selected site.
  - Form schemas include named field definitions, validation rules, submission records, collection-record links/errors, and contact records so generated SDK clients can type-check both render-time form controls and private submission/contact envelopes.
  - Media detail is exposed as `/api/sites/:siteId/media/{mediaId}` for exact asset lookup by generated/custom frontends.
  - Includes `x-backy` vendor metadata for `siteId`, `siteSlug`, contract version, public collection ids, and form ids.
  - Published OpenAPI responses use the same discovery cache, ETag revalidation, and Backy contract headers as the manifest.
  - Draft/unpublished sites are hidden from the public OpenAPI document.

- `GET /api/sites/:siteId/pages?path=/about`
- `GET /api/public/sites/:siteId/pages?path=/about` (optional alias)
  - Path-based page fetch for public rendering.
  - Response uses `{ success, requestId, data: { page } }` for detail and `{ success, requestId, data: { pages, pagination } }` for list; legacy top-level `page`, `pages`, and `pagination` remain for compatibility.
  - Pages created from a connected frontend design template expose raw `meta.frontendDesign*` provenance plus a normalized `frontendDesign` summary (`templateId`, `templateName`, `routePattern`, `source`, `chrome`, `tokens`, `customCss`, `bindingHints`) in public page list/detail responses and manifest page summaries.
  - Invalid public page list pagination filters return explicit `400` errors instead of silently clamping the list: `INVALID_PAGE_LIMIT` or `INVALID_PAGE_OFFSET`.
  - Must return only published content.
  - Draft access requires `previewToken` created by the admin preview endpoint for that exact page.
  - Successful preview-token reads record a tokenless `previewToken.use` audit event with `actorId: "public-preview"`, target, surface, path/slug metadata, and `tokenStored: false`.

- `POST /api/admin/sites/:siteId/pages`
  - Accepts top-level `frontendDesignTemplateId` or `designTemplateId` for connected frontend contracts.
  - When a matching site frontend design template exists and no explicit content is provided, Backy seeds editable canvas content from the captured template, preserves site chrome/tokens/custom CSS/binding hints in `meta.frontendDesign*`, and returns the normal admin page resource.

- `GET /api/sites/:siteId/render?path=/about`
- `GET /api/sites/:siteId/render?path=/about&schemaVersion=backy.content-payload.v1`
- `GET /api/sites/:siteId/render?path=/blog/:slug`
- `GET /api/sites/:siteId/render?path=/:collectionSlug/:recordSlug`
- `GET /api/public/sites/:siteId/render?path=/about` (future stable alias)
  - Returns the external page/post/dynamic item render payload described by `specs/ai-frontend-contract/content-payload.schema.json`.
  - Includes site bootstrap, route, canonical content document, assets, forms/comments/actions, SEO, data bindings, and editable map.
  - Current data bindings include normalized collection dataset manifests, resolved public collection fields/records, and element binding metadata when canvas elements declare collection `dataBindings`.
  - Published render responses include `Cache-Control: public, max-age=30, stale-while-revalidate=120`, `ETag`/`If-None-Match` 304 support, `x-backy-cache-scope: render`, `x-backy-contract-version`, `x-backy-schema-version`, `x-backy-supported-schema-versions`, `x-backy-request-id`, and `x-backy-site-id`.
  - Clients can request the current render schema with `schemaVersion=backy.content-payload.v1` or `x-backy-accept-schema-version`; unsupported render schema requests return `406 UNSUPPORTED_RENDER_SCHEMA_VERSION` with supported versions in `error.details`.
  - Database-mode published render responses emit `x-backy-cache-revision` from the latest site invalidation event, not only the response body hash, so custom frontends can revalidate after content, route, media, navigation, SEO, settings, and frontend-design mutations.
  - Preview-token responses and error envelopes use `Cache-Control: no-store`.
  - Collection dynamic list paths resolve after normal pages and blog posts using `/:collectionSlug` by default and return a generated `dynamicList` content document with a hydrated collection dataset. Collection dynamic item paths use `/:collectionSlug/:recordSlug` by default and return a generated `dynamicItem` content document backed by the selected public record.
  - Current implementation is backed by the public seed adapter; production implementation must use the durable service layer.
  - Draft render access requires `previewToken` created by the admin preview endpoint for that exact page or post.
  - Successful page/post preview-token render reads record tokenless `previewToken.use` audit metadata without storing the raw token.

- `GET /api/sites/:siteId/blog`
  - Blog posts created from a connected frontend design template expose raw `meta.frontendDesign*` provenance plus a normalized `frontendDesign` summary (`templateId`, `templateName`, `routePattern`, `source`, `chrome`, `tokens`, `customCss`, `bindingHints`) in public blog list/detail responses and manifest blog summaries.

- `POST /api/admin/sites/:siteId/blog`
  - Accepts top-level `frontendDesignTemplateId` or `designTemplateId` for connected frontend contracts.
  - When a matching `blogPost` frontend design template exists and no explicit content is provided, Backy seeds editable blog canvas content from the captured template, preserves design provenance in `meta.frontendDesign*`, and returns the normal admin post resource.

- `GET /api/sites/:siteId/resolve?path=/about`
- `GET /api/public/sites/:siteId/resolve?path=/about` (future stable alias)
  - Resolves a public path to a page, blog post, or collection dynamic item without requiring the frontend to know Backy's route internals.
  - Returns `{ success, requestId, data: { site, route, navigation } }` when resolved.
  - Page routes include `resource.kind: "page"` plus page API and render URLs.
  - Blog post routes under `/blog/:slug` include `resource.kind: "post"` plus post API and hosted path.
  - Collection dynamic list routes under `/:collectionSlug` include `resource.kind: "dynamicList"`, collection metadata, public records API URL, render URL, hosted path, and record count. Collection dynamic item routes under `/:collectionSlug/:recordSlug` include `resource.kind: "dynamicItem"`, collection metadata, record id/slug, public records API URL, render URL, and hosted path.
  - Draft and future scheduled content stays hidden unless the exact preview token is supplied.
  - Successful page/post preview-token route resolutions record tokenless `previewToken.use` audit metadata without storing the raw token.
  - Unresolved paths return `404` with `ROUTE_NOT_FOUND`.

- `GET /api/sites/:siteId/blog/posts?status=published&limit=&cursor=`
- `GET /api/public/sites/:siteId/blog/posts?status=published&limit=&cursor=` (optional alias)
  - Published posts list with canonical URLs.
  - Current repository route is `GET /api/sites/:siteId/blog`; response uses `{ success, requestId, data: { posts, pagination } }` while preserving legacy top-level `posts/pagination`.
  - Invalid public blog list filters return explicit `400` errors instead of silently widening or clamping the feed: `INVALID_BLOG_STATUS`, `INVALID_BLOG_LIMIT`, `INVALID_BLOG_OFFSET`, `INVALID_BLOG_ARCHIVE_YEAR`, or `INVALID_BLOG_ARCHIVE_MONTH`.

- `GET /api/sites/:siteId/blog/posts/:slug`
- `GET /api/public/sites/:siteId/blog/posts/:slug` (optional alias)
  - Published post detail by slug.
  - Current repository route is `GET /api/sites/:siteId/blog?slug=:slug`; response uses `{ success, requestId, data: { post } }` while preserving legacy top-level `post`.
  - Draft post detail access requires `previewToken` created by the admin preview endpoint for that exact post.
  - Successful preview-token reads record a tokenless `previewToken.use` audit event with `actorId: "public-preview"`, target, surface, path/slug metadata, and `tokenStored: false`.

- `GET /api/sites/:siteId/blog/categories`
- `GET /api/sites/:siteId/blog/tags`
- `GET /api/sites/:siteId/blog/authors`
  - Public taxonomy/author discovery for blog archive frontends.
  - Responses use `{ success, requestId, data }`; legacy top-level `categories`, `tags`, and `authors` remain for compatibility.

- `GET /api/sites/:siteId/media`
- `GET /api/sites/:siteId/media/:mediaId`
  - Public media catalog for custom frontends.
  - Response uses `{ success, requestId, data: { media, pagination } }`; legacy top-level `media` and `pagination` remain for compatibility.
  - Current implementation only returns `visibility=public` catalog items, even if a caller asks for private media.
  - Supports `type`, `scope`, `pageId`, `postId`, `blogId` (alias for `postId`), `global=true`, `q`/`search`, `tag`, `folderId`, `limit`, and `offset` filters.
  - Invalid public media type filters return `400 INVALID_MEDIA_TYPE` instead of falling back to an unfiltered media catalog. `type=file` remains a compatibility alias for `document`.
  - Invalid public media scope filters return `400 INVALID_MEDIA_SCOPE` instead of falling back to an unscoped media catalog.
  - Invalid public media global filters return `400 INVALID_MEDIA_GLOBAL_FILTER`; accepted boolean spellings are `true/false`, `1/0`, `yes/no`, and `on/off`.
  - Invalid public media pagination filters return `400 INVALID_MEDIA_LIMIT` or `400 INVALID_MEDIA_OFFSET`; accepted `limit` values are integer `1..100`, and accepted `offset` values are integers greater than or equal to `0`.
  - Public media list pagination is calculated after quarantined assets are removed, so hidden assets do not affect `total`, `hasMore`, or page slices in demo or database-backed runtimes.
  - `pageId`/`postId`/`blogId` media filters return globally reusable assets plus assets explicitly scoped or bound to the requested content item. Use `global=true` to return only site-global assets, or combine `scope=page|post` with the content id for only content-scoped assets.
  - Each public asset includes `references: { schemaVersion: "backy.media.references.v1", pageIds, postIds, pages, posts, usageTypes, totalBindings }`, `referenceSummary`, and `editableMetadata: { schemaVersion: "backy.media.editable-metadata.v1", title, altText, caption, tags, folderId, scope, scopeTargetId, visibility, metadata }` so custom frontends can browse asset usage and editable metadata without depending on admin-only internals.
  - Public image media includes `responsive: { src, srcSet, sizes, variants, preparedAt?, preparedBy? }` with transform URLs for generated/custom frontend responsive image rendering.
  - The detail route returns one public asset in `{ success, requestId, data: { media } }`, preserves legacy top-level `media`, and returns `404` for missing or private media.
- `GET /api/sites/:siteId/media/fonts`
  - Public font manifests exclude quarantined font assets before generating families, variants, and `@font-face` CSS.
- `GET /api/sites/:siteId/media/:mediaId/file`
  - Public media files can be fetched directly.
  - Private media files require signed `token`, `expiresAt`, and optional `disposition` query parameters generated by `POST /api/admin/sites/:siteId/media/:mediaId/signed-url`.
  - Invalid media file disposition values return `400 INVALID_MEDIA_DISPOSITION`; accepted values are `inline` and `attachment`.
  - Signed media URL requests also reject invalid `disposition` values before minting tokens, so admin integrations cannot create delivery URLs that later fail the public file contract.
  - Signed media URL requests reject invalid `expiresInSeconds` values with `400 INVALID_MEDIA_EXPIRY`; accepted explicit values are integer seconds from `30` to `3600`, and omitted values use the default expiry.
  - Unsigned, expired, or mismatched private file requests return `{ success: false, error: { code: "MEDIA_SIGNATURE_INVALID" } }`.
  - Quarantined media file requests return `423 MEDIA_QUARANTINED` and do not stream bytes.
  - File bytes are read through the configured runtime storage adapter. New uploads store `metadata.storagePath` and `metadata.storageProvider`, so private delivery and deletion do not depend on reverse-parsing the public URL.
  - Successful file responses increment Backy-served delivery analytics under `media.metadata.mediaDelivery`, including request counts, bytes served, daily buckets, and last delivery metadata.
  - Success and error responses expose public Backy contract headers, including `x-backy-contract-version: backy.ai-frontend.v1`, `x-backy-schema-version: backy.media-file.v1`, `x-backy-request-id`, and `x-backy-cache-scope`; successful file responses also include `x-backy-site-id` and `x-backy-media-id` while preserving immutable public-file caching or short private signed-file caching as appropriate.
- `GET /api/sites/:siteId/media/:mediaId/transform`
  - Query: `width`/`w` from `16..3840`, optional `quality`/`q` from `1..100`.
  - Invalid transform width values return `400 INVALID_TRANSFORM_WIDTH`; invalid quality values return `400 INVALID_TRANSFORM_QUALITY`.
  - Only public image media is accepted.
  - Quarantined media transform requests return `423 MEDIA_QUARANTINED` and do not redirect to the optimizer.
  - Successful requests return a `307` redirect to Backy's image optimizer with `x-backy-transform-width` and `x-backy-transform-quality` headers.
  - Successful transform redirects increment Backy-served transform delivery analytics under `media.metadata.mediaDelivery`.
  - Non-image or private assets return contract error envelopes.
  - Redirect and error responses expose public Backy contract headers, including `x-backy-contract-version: backy.ai-frontend.v1`, `x-backy-schema-version: backy.media-transform.v1`, `x-backy-request-id`, and `x-backy-cache-scope`; successful transform redirects also include `x-backy-site-id`, `x-backy-media-id`, `x-backy-transform-width`, and `x-backy-transform-quality`.

- `POST /api/admin/sites/:siteId/media/:mediaId/transforms`
  - Generates and persists responsive WebP image variants for a public image asset through the active storage adapter.
  - Body supports `widths`, `quality`, `sizes`, and `preparedBy`.
  - Stores the manifest under `media.metadata.generatedTransforms`, including variant URLs, storage paths, byte counts, format, storage provider, and preparation metadata.
  - Generated transform bytes count against the site media quota; replacing or deleting an asset removes stale generated variant files.
  - Emits `media.transforms.prepare` audit logs, and public media list/detail responses prefer the generated manifest while `/transform` remains available as an on-demand optimizer fallback.
- `POST /api/admin/sites/:siteId/media`
  - Enforces a 50 MB per-file limit and a per-site quota configured by `BACKY_SITE_MEDIA_QUOTA_BYTES` with a 500 MB default.
  - Runs static upload safety checks before storage, including MIME/category validation and active-content SVG rejection; clean uploads persist `metadata.safetyScan`.
  - Successful uploads return `data.quota = { limitBytes, usedBytes, remainingBytes }`.
  - Uploads use `BACKY_STORAGE_PROVIDER=local|s3|supabase` and related provider environment variables. The default local provider writes under `public/uploads`.
  - Over-quota uploads return `413 SITE_MEDIA_QUOTA_EXCEEDED` with quota details.

- `GET /api/admin/settings`
  - Success and error responses expose admin/no-store Backy contract headers, including `x-backy-admin-contract-version: backy.admin.v1`, `x-backy-schema-version: backy.admin-settings.v1`, `x-backy-cache-scope: admin`, `cache-control: no-store`, and `x-backy-request-id`.
  - Success payloads include `data.settings.schemaVersion: "backy.admin-settings.v1"`, `data.settings.scope.workspaceSettingsScope: "global"`, `data.settings.scope.siteSettingsScope: "site"`, and endpoint pointers for `/api/admin/settings` plus `/api/admin/sites/:siteId/settings` so custom admin clients can separate workspace-owned Settings from site-owned Settings.
  - Returns `data.settings.runtimeStorage`, a non-secret diagnostic object with `{ provider, configured, missing, publicUrl?, basePath?, bucket?, region?, endpoint? }` for the active media storage runtime.
  - Returns `data.settings.runtimeDatabase`, `runtimeSupabase`, and `runtimeVercel` non-secret runtime diagnostics so the admin can show database/Supabase/Vercel readiness without exposing tokens or service-role keys.
  - Returns `data.settings.providerCertification` with `schemaVersion: "backy.settings-provider-certification-handoff.v1"`, `status: "external-live-provider-gate"`, Settings and Commerce certification commands, local/release preflight commands, provider-family groups, and non-secret required-input alias families for Supabase/Postgres/Auth/Storage, S3/Supabase media storage, Vercel, notifications, and commerce providers. The required-input list mirrors certification workflow/runtime aliases, including `BACKY_DATABASE_URL`/`DATABASE_URL`, `BACKY_SUPABASE_SERVICE_ROLE_KEY`/`SUPABASE_SERVICE_ROLE_KEY`, `BACKY_S3_SECRET_ACCESS_KEY`/`AWS_SECRET_ACCESS_KEY`, `VERCEL_PROJECT_ID`/`BACKY_VERCEL_PROJECT_ID`, `BACKY_EMAIL_DELIVERY_ENDPOINT`/`BACKY_TRANSACTIONAL_EMAIL_WEBHOOK_URL`, `BACKY_RESEND_API_KEY`/`RESEND_API_KEY`, and commerce aliases such as `BACKY_COMMERCE_WEBHOOK_SECRET`/`COMMERCE_WEBHOOK_SECRET`.
  - Returns `data.settings.runtimeCommerce` non-secret provider diagnostics for checkout, catalog sync, refunds, tax/discount/shipping quotes, shipping labels, webhooks, and subscription lifecycle adapters, including Paddle subscription API readiness and the dedicated Adyen PAL Recurring API base URL used by product subscription cancellation separately from the Adyen Checkout API base URL used by refund execution.

- `POST /api/admin/settings`
  - Body action `"issue-admin-api-key"` requires an owner `settings.manageKeys` session, issues a named non-owner admin service key exactly once, stores only hash/fingerprint/prefix/scope metadata, returns sanitized settings without `keyHash`, records `settings.api_keys.issue`, and lets the service key authenticate ordinary admin API reads while owner-only key management remains session-only.
  - Body action `"revoke-admin-api-key"` requires an owner `settings.manageKeys` session, marks a named service key revoked, records `settings.api_keys.revoke`, returns sanitized settings without key hashes, and immediately rejects future requests using the revoked key.
  - Body action `"media-storage-provisioning-probe"` creates or verifies the active local/S3/Supabase storage container, performs upload/read/stat/list/delete probe operations, emits a `settings.media_storage.provisioning_probe` audit event, and returns non-secret credential-rotation, lifecycle-policy, lifecycle-cleanup, and storage secret-reference readiness. When provider-specific `BACKY_*_NEXT_*` replacement storage credential environment variables are present, the response validates that replacement credential against the target bucket/path before it is promoted to active runtime variables. When Media storage lifecycle policy is enabled and the active provider is S3-compatible, the response applies Backy cleanup/retained-version lifecycle rules through the provider API. For local/Supabase-compatible providers without a native lifecycle API, the same probe previews or applies Backy-managed cleanup of expired internal probe files and retained media versions through the active storage adapter.

- `PATCH /api/admin/settings`
  - Body supports partial platform settings updates: `deliveryMode`, `apiKeys`, `storage`, `auth`, and `integrations`.
  - `integrations.supabase` persists non-secret metadata only: `projectUrl`, `projectRef`, `databaseEnabled`, `storageEnabled`, and `authEnabled`.
  - `integrations.storage` persists non-secret provider metadata and optional storage secret references only: `accessKeyIdSecretRef`, `secretAccessKeySecretRef`, and `supabaseKeySecretRef` must be env/secret-store references such as `env:BACKY_SUPABASE_SERVICE_ROLE_KEY`; raw secret-like values are rejected before persistence and are never returned as secret values.
  - `integrations.vercel` persists non-secret metadata only: `projectId`, `teamSlug`, `productionDomain`, `autoDeploy`, and `previewDeployments`.
  - `integrations.commerce.subscriptionActionProvider` and `subscriptionActionProviderUrl` select an optional generic HTTP lifecycle adapter for Products subscription pause/resume/cancel actions; Settings validates the URL and the Products lifecycle endpoints fall back to native provider adapters or manual handoff when it is not configured.
  - Secret values remain environment-owned (`BACKY_DATABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, Vercel env vars, etc.) and must not be returned in admin settings payloads.

- `GET /api/sites/:siteId/navigation`
  - Public navigation contract for external frontends.
  - Returns `{ success, requestId, data: { site, navigation: { primary } } }`.
  - Navigation items include page id, label/title, slug, canonical path, status, homepage flag, and child arrays.
  - Current implementation derives primary navigation from publishable pages in the runtime content adapter. Production completion still needs editable menus, nested page hierarchy, redirects, locale-aware paths, and custom/external links.

- `GET /api/admin/sites/:siteId/redirects`
- `POST /api/admin/sites/:siteId/redirects`
- `PATCH /api/admin/sites/:siteId/redirects`
  - Admin redirect and 410 route management for hosted sites and custom frontends.
  - `GET` returns persisted rules plus route warning diagnostics.
  - `POST` validates a submitted rule list and returns the normalized rules plus conflict diagnostics without persisting them.
  - `PATCH` validates and saves rules, then returns the saved rules plus conflict diagnostics.
  - Conflict diagnostics warn when an enabled source path shadows an existing page, post, dynamic list, or dynamic item route pattern, and when an internal redirect destination does not currently resolve.

- `GET /api/sites/:siteId/seo`
- `GET /api/sites/:siteId/seo?format=sitemap`
- `GET /api/sites/:siteId/seo?format=robots`
  - Hosted Backy sites also expose crawlable `GET /sites/:siteSlug/sitemap.xml` and `GET /sites/:siteSlug/robots.txt` routes. Hosted sitemap/robots success and 404 text responses carry the public contract/cache headers; missing or unpublished sites use `x-backy-cache-scope: error` with `no-store`.
  - Public SEO discovery contract for custom frontends and default generated frontends.
  - JSON response uses `{ success, requestId, data: { site, defaults, routes, sitemap, robots } }`; `defaults.jsonLd` carries site-level structured data objects for frontend head rendering, and legacy top-level `routes` remains for compatibility.
  - Routes include publishable pages, blog posts, dynamic collection lists, and dynamic collection item records with canonical path, title, description, robots flags, Open Graph basics, route-specific JSON-LD objects, keywords, priority, change frequency, and update timestamps.
  - Dynamic collection list routes expose normalized `frontendDesign` provenance from the collection schema; dynamic item routes expose record-level `frontendDesign` plus `collectionFrontendDesign`, so generated/custom frontends can keep SEO head output aligned with the captured frontend template.
  - `format=sitemap` emits XML built from indexable routes.
  - `format=robots` emits a minimal robots text response that points to the sitemap mode; hosted robots points to the hosted sitemap URL.
  - The frontend manifest advertises `capabilities.seoDiscovery`, `endpoints.seo`, `endpoints.sitemap`, and `endpoints.robots`; the site-scoped OpenAPI export includes the SEO operation and an explicit route schema for these provenance fields.

- `GET /api/sites/:siteId/collections`
- `GET /api/sites/:siteId/collections/:collectionId`
- `GET /api/sites/:siteId/collections/:collectionId/records?slug=:slug&limit=&offset=`
- `GET /api/sites/:siteId/collections/:collectionId/records?q=&fieldKey=&fieldValue=&sortBy=&sortDirection=asc|desc&limit=&offset=`
- `POST /api/sites/:siteId/collections/:collectionId/records`
  - Public CMS collection contract for custom frontends and future dataset bindings.
  - Collection list/detail/record read responses use `{ success, requestId, data }`; legacy top-level `collection`, `collections`, `records`, and `pagination` remain for compatibility.
  - Returns only collections with `status: "published"` and `permissions.publicRead: true`.
  - Returns only published records or scheduled records whose `scheduledAt` has passed.
  - Public record creation requires a published collection with `permissions.publicCreate: true`, validates `values` or `fields` against the collection schema, rejects slug conflicts, and stores accepted visitor-created records as `draft` for admin moderation.
  - Collection fields support `text`, `richText`, `number`, `boolean`, `date`, `datetime`, `image`, `video`, `file`, `reference`, `multiReference`, `select`, `tags`, `url`, `email`, `phone`, `slug`, and `json`. Public collection schemas expose `options` for `select`/`tags` fields and `referenceCollectionId` for reference fields.
  - Record validation enforces required fields, unique fields, and allowed option values for `select` and `tags` fields before admin create/update/import writes persist.
  - Collection schemas include optional `listRoutePattern` and `routePattern` values for generated list and item pages. The public resolver, render payload, SEO discovery, and frontend manifest all use those collection route patterns, falling back to `/{collectionSlug}` for lists and `/{collectionSlug}/:recordSlug` for items. Admin page and collection writes reject route conflicts with existing pages, collection list/item patterns, and reserved Backy route prefixes.
  - Supports basic record search, field-value filtering, sorting, limit, offset, and pagination metadata in both public and admin record list endpoints. `/render` dataset hydration accepts the same query fields.
  - Admin collection records support `POST /api/admin/sites/:siteId/collections/:collectionId/records/bulk` for selected-record `updateStatus` and `delete` actions.
  - Admin record lists also support `GET /api/admin/sites/:siteId/collections/:collectionId/records?format=csv` with the same filters for backend-backed CSV export.
  - Admin collection records support `POST /api/admin/sites/:siteId/collections/:collectionId/records/import?upsert=true` for backend-validated CSV import.
  - Admin collection creation can seed fields, permissions, route patterns, and metadata from a captured `collection` frontend design template. Product collection record creation can seed product values and design provenance from a captured `product` frontend design template; public commerce catalog products expose normalized `design.templateId`, `design.routePattern`, `design.source`, `design.tokens`, `design.chrome`, `design.customCss`, and `design.bindingHints` aliases while preserving legacy `frontendDesign*` fields.
  - Current implementation is backed by the same runtime JSON adapter as admin content. `/render` now surfaces dataset, binding, field, field option/reference, route pattern, and record manifests for collection-bound elements and generated dynamic item pages, but production completion still needs DB-backed indexes and authenticated visitor-write policies.

- `GET /api/sites/:siteId/reusable-sections`
- `GET /api/sites/:siteId/reusable-sections/:sectionId`
  - Public reusable section/template contract for custom frontends and default generated frontends.
  - List/detail responses use `{ success, requestId, data }`; legacy top-level `sections`, `section`, and `pagination` remain for compatibility.
  - Public reads require a published site and only expose reusable sections with `status: "active"`.
  - List filters: `category`, `tag`, and `search`.
  - Each section keeps normal canvas `content.elements` and `canvasSize`, so frontends can render or clone saved page sections without importing admin/editor internals.
  - Sections created from a connected frontend design contract expose raw `metadata.frontendDesign*` provenance plus a normalized `frontendDesign` summary (`templateId`, `templateName`, `routePattern`, `source`, `chrome`, `tokens`, `customCss`, `bindingHints`) in public list/detail responses and manifest summaries.
  - The frontend manifest advertises `capabilities.reusableSections`, `endpoints.reusableSections`, `endpoints.reusableSectionDetail`, and `modules.reusableSections`; the site-scoped OpenAPI export includes reusable-section list/detail operations and `x-backy.reusableSectionIds`.

### 2.2 Render payload

Public page payload should include:

- `content` in shared editor schema
- `themeTokens`
- `navigation`
- `meta` (title/description/keywords/og/canonical/noindex/nofollow)
- `assets.media`
- `assets.forms`
- `comments`
- `version`

### 2.3 Page interactions

- `POST /api/sites/:siteId/forms/:formId/submissions`
- `POST /api/public/sites/:siteId/forms/:formId/submissions` (optional alias)
  - `GET /api/sites/:siteId/forms` lists public form definitions with `{ success, requestId, data: { forms, total, pagination } }`; legacy top-level `forms` and `total` remain for compatibility.
  - `GET /api/sites/:siteId/forms/:formId/definition` returns cacheable `{ success, requestId, data: { schemaVersion: "backy.form-definition.v1", form, submitUrl } }` with ETag/304 support and no submission/contact data.
  - `GET /api/sites/:siteId/forms/:formId` and `GET /api/sites/:siteId/forms/:formId/submissions` return `{ success, requestId, data: { form, submissions } }` while preserving legacy top-level `form/submissions`; these remain private/no-store because they can include visitor submission data.
  - `GET /api/sites/:siteId/forms/:formId/submissions/:submissionId` and `PATCH /api/sites/:siteId/forms/:formId/submissions/:submissionId` return `{ success, requestId, data: { submission } }` while preserving legacy top-level `submission`.
  - `GET /api/sites/:siteId/forms/:formId/contacts` and `PATCH /api/sites/:siteId/forms/:formId/contacts/:contactId` return `{ success, requestId, data }` envelopes while preserving legacy contact list/status fields.
  - Body: form values map under `values` plus optional hidden metadata. Custom frontends may also send aliases under `fields`, `data`, or `submission`, or send direct field keys at the top level; transport metadata keys such as `requestId`, `pageId`, `postId`, `honeypot`, `startedAt`, `rateLimitBypass`, and `contactShareOverride` are reserved.
  - Response: `{ success, requestId, data: { submission, contact, collectionRecord, collectionRecordErrors, status, message } }`; legacy top-level `submission/contact/collectionRecord/collectionRecordErrors/status/message` remain for compatibility.
  - Validation/spam rejection returns `422` with `{ success: false, requestId, error: { code: "VALIDATION_ERROR", message }, validation: [{ field, code, message, label? }], spamFlags, status, message }`. Field validation codes include required/min/max length, pattern, email/URL, option, collection-write, and record-create failures.
  - Admin form definitions may persist per-form spam rules under `settings.spam` or `spamSettings`: `minFillMs`, `rateLimitWindowMs`, `rateLimitMax`, `duplicateWindowMs`, and `blockedTerms`. The public submission classifier applies those rules before accepting, storing, or delivering the submission.
  - Admin form definitions may persist consent export/retention policy metadata under `settings.consent` or `consentSettings`: `policyLabel`, `retentionDays`, `deleteAfterDays`, `requestEmail`, and `exportIncludesIp`. The Forms admin consent export uses this metadata to include policy, retention due date, deletion due date, privacy request email, and optionally omit IP/user-agent provenance from exported rows.
  - Admins may run `POST /api/admin/sites/:siteId/forms/:formId/consent-retention` with optional `{ dryRun, now, actor }` to apply `deleteAfterDays` to one form, or `POST /api/admin/sites/:siteId/forms/consent-retention` to run the same retention policy across every form for a site from admin automation or a scheduler. The action scans submissions, finds due consent-like checkbox fields, nulls those consent values, clears `ipHash` and `userAgent`, appends an admin note, and returns scanned/due/anonymized counts plus affected submissions.
  - Canvas-derived form definitions may include `collectionTarget: { enabled, collectionId, fieldMap, slugField }`.
  - When enabled, accepted non-spam submissions also create a `draft` collection record after `permissions.publicCreate` and collection schema validation pass. The response includes `collectionRecord` and `collectionRecordErrors`, and listed submissions retain a lightweight `collectionRecord` link for admin moderation shortcuts.
  - When `notificationEmail` is configured and Settings notifications allow form submissions, accepted non-spam submissions record email delivery events under `GET /api/sites/:siteId/events?kind=form-submission&formId=:formId`. Backy selects provider delivery from environment configuration: `BACKY_EMAIL_PROVIDER=resend` with `BACKY_RESEND_API_KEY` posts to Resend (`BACKY_RESEND_API_URL` can point at a mock or proxy), `BACKY_EMAIL_PROVIDER=smtp` with `BACKY_SMTP_HOST`/`BACKY_SMTP_PORT` sends through SMTP with optional `BACKY_SMTP_USER`/`BACKY_SMTP_PASSWORD`, `BACKY_EMAIL_DELIVERY_ENDPOINT` or `BACKY_TRANSACTIONAL_EMAIL_WEBHOOK_URL` keeps the generic HTTP handoff path, and no provider records a `local-outbox` handoff event with `metadata.channel: "email"` and status code `202`.

- `POST /api/sites/:siteId/pages/:pageId/comments`
- `POST /api/public/sites/:siteId/pages/:pageId/comments` (optional alias)
  - Body: comment + optional parentId + optional identity fields.
  - Response uses `{ success, requestId, data: { comment, message } }`; legacy top-level `comment` and `message` remain for compatibility.

- `GET /api/sites/:siteId/pages/:pageId/comments?status=approved&limit=&cursor=`
- `GET /api/public/sites/:siteId/pages/:pageId/comments` (optional alias)
  - Returns approved comments and count metadata.
  - Response uses `{ success, requestId, data: { comments, count, pagination } }`; legacy top-level `comments/count/pagination` remain for compatibility.
  - Invalid page comment pagination filters return explicit `400` errors instead of silently clamping the thread: `INVALID_PAGE_COMMENT_LIMIT` or `INVALID_PAGE_COMMENT_OFFSET`.
  - Invalid page comment list status/sort filters return explicit `400` errors instead of falling back to approved/newest: `INVALID_PAGE_COMMENT_STATUS` or `INVALID_PAGE_COMMENT_SORT`.

- `POST /api/sites/:siteId/blog/:postId/comments`
- `GET /api/sites/:siteId/blog/:postId/comments?status=approved&limit=&offset=`
  - Blog comment submit/list endpoints follow the same envelope and legacy compatibility behavior as page comments.

- `GET /api/sites/:siteId/comments`
- `PATCH /api/sites/:siteId/comments`
- `GET/PATCH /api/sites/:siteId/comments/:commentId`
- `GET /api/sites/:siteId/comments/report-reasons`
- `GET/POST /api/sites/:siteId/comments/:commentId/report`
  - Site-wide comment moderation/read/report endpoints return `{ success, requestId, data }` while preserving legacy top-level `comments`, `comment`, `updated`, `reasons`, and related count fields.
  - Page comment moderation updates reject invalid status values with `400 INVALID_PAGE_COMMENT_STATUS` instead of collapsing them into generic payload errors.

- `GET /api/sites/:siteId/events`
  - Lists public interaction audit events with `{ success, requestId, data: { siteId, events, count, pagination } }`; legacy top-level `siteId/events/count/pagination` remain for compatibility.

### 2.4 Security behavior

- Return `403` if site/page is in private/unpublished state.
- Return `410` for intentionally removed pages if policy requires.
- Return `404` for unresolved slugs and preserve internal routing details from leaking.

---

## 3) Admin API (authenticated)

### 3.1 Sites

- `GET /api/admin/sites?includeUnpublished=true`
  - Current implementation returns `{ success, requestId, data: { sites, pagination } }`.
  - Includes draft/published sites for admin use when `includeUnpublished=true`.

- `POST /api/admin/sites`
  - Body: `{ name, slug?, description?, customDomain?, status?, isPublished?, theme? }`
  - Validates required name, slug format, and slug conflicts.
  - Current implementation persists to local runtime catalog `data/backy/admin-content.json`.

- `GET /api/admin/sites/:siteId`
  - Resolve by site id or slug.

- `GET /api/admin/sites/:siteId/readiness`
  - Admin readiness audit for Wix/WordPress-style publish checks.
  - Response uses `{ success, requestId, data: { readiness } }`; legacy top-level `readiness` remains for compatibility.
  - Page/post readiness includes publish-blocking SEO errors for duplicate canonical paths across non-archived pages and posts.
  - Validates site identity/status, homepage/navigation, theme tokens, media/library presence, collections, reusable sections, per-page canvas dimensions, post content, element count, bounds, SEO title/description/canonical/indexing state.
  - Returns a site score, status label (`ready`, `needs-attention`, `blocked`), summary counts, site checks, page-level checks, and post-level checks so admin UI can block or warn before publishing.

- `PATCH /api/admin/sites/:siteId`
  - Body supports partial site settings updates: `name`, `slug`, `description`, `customDomain`, `status`, `isPublished`, `theme`.

- `GET/PATCH /api/admin/sites/:siteId/settings`
  - Provides a dedicated site-scoped Settings contract using `backy.site-settings-scope.v1`.
  - Success and error responses expose admin/no-store Backy contract headers, including `x-backy-admin-contract-version: backy.admin.v1`, `x-backy-schema-version: backy.site-settings-scope.v1`, `x-backy-cache-scope: admin`, `cache-control: no-store`, `x-backy-request-id`, and `x-backy-site-id` on success.
  - `GET` requires `sites.view`, enforces the existing nested site/team scope guard, and returns a non-secret envelope that separates global workspace settings from the site's own settings plus effective settings and related endpoint URLs.
  - `PATCH` requires `sites.configure`, enforces the same site/team scope guard, updates only allowlisted site settings sections (`seo`, `analytics`, `social`, `commentPolicy`, `redirectRules`, `navigation`, `localization`, `domainVerification`, `vercelDeployment`, `billingQuota`, `webhooks`, `frontendDesign`), rejects unsupported-only payloads with `NO_SITE_SETTINGS_CHANGES`, rejects mixed site/workspace payloads with `UNSUPPORTED_SITE_SETTINGS_KEYS`, records a `site.settings.updated` audit event for valid changes, and returns the same scoped envelope.
  - `npm run test:admin-contract --workspace @backy/public` covers read/update/readback behavior, admin contract/cache headers, allowlisted site setting persistence, mixed unsupported payload rejection, unsupported-only patch rejection, and request-id-backed audit metadata.

- `DELETE /api/admin/sites/:siteId`
  - Deletes the site and cascades local page/post records in the current runtime adapter.

### 3.2 Pages

- `GET /api/admin/sites/:siteId/pages?includeUnpublished=true`
  - Current implementation returns page summaries without content.
  - Invalid page list pagination filters return explicit `400` errors instead of silently clamping the query: `INVALID_PAGE_LIMIT` or `INVALID_PAGE_OFFSET`.

- `POST /api/admin/sites/:siteId/pages`
  - Body: `{ title, slug?, description?, status?, isHomepage?, content?, meta?, forms?, scheduledAt? }`
  - Validates required title, slug format, and per-site slug conflicts.
  - Invalid explicit editor content payloads return `400` errors instead of being saved as an empty/default canvas: `INVALID_PAGE_CONTENT`, `INVALID_PAGE_CONTENT_ELEMENTS`, or `INVALID_PAGE_CANVAS_SIZE`.
  - Invalid explicit page workflow payloads return `400` errors instead of falling back to draft/no schedule: `INVALID_PAGE_STATUS` or `SCHEDULED_AT_INVALID`.

- `GET /api/admin/sites/:siteId/pages/:pageId`
  - Returns full editable page payload including canvas content.

- `GET /api/admin/sites/:siteId/pages/:pageId/readiness`
  - Admin page readiness audit for page editor publish workflow.
  - Response uses `{ success, requestId, data: { readiness } }`; legacy top-level `readiness` remains for compatibility.
  - Validates canvas dimensions, element count, element bounds, slug/title, SEO title/description/canonical, and indexability before page publish.

- `POST /api/admin/sites/:siteId/pages/:pageId/publish`
  - Publishes a page only when page readiness has no `severity: "error"` checks.
  - Returns `400 READINESS_BLOCKED` with readiness details when canvas dimensions, element bounds, title, or slug checks fail.

- `PATCH /api/admin/sites/:siteId/pages/:pageId`
  - Body supports partial updates for title, slug, description, status, homepage flag, canvas content, SEO meta, forms, and schedule.
  - Invalid explicit editor content payloads return `400` errors instead of being saved as an empty/default canvas: `INVALID_PAGE_CONTENT`, `INVALID_PAGE_CONTENT_ELEMENTS`, or `INVALID_PAGE_CANVAS_SIZE`.
  - Invalid explicit page workflow payloads return `400` errors instead of preserving the previous workflow state: `INVALID_PAGE_STATUS` or `SCHEDULED_AT_INVALID`.

- `DELETE /api/admin/sites/:siteId/pages/:pageId`
  - Deletes the page from the runtime adapter.

Current sites/pages admin endpoints are intentionally local file-backed. Production completion still requires authenticated database persistence, RBAC, preview tokens, cache invalidation, workflow audit events, and contract tests.

### 3.3 Media

- `POST /api/admin/sites/:siteId/media`
  - multipart upload
  - query/body flags: `scope` (`global|page|post`), `scopeTargetId`, `visibility`
  - current implementation accepts `file`, `altText`, `caption`, `tags`, `uploadedBy`, arbitrary JSON `metadata`, plus `fontFamily`, `fontWeight`, and `fontStyle` for font uploads
  - validates image/video/audio/document/font/other MIME categories, classifies unknown safe files as `other`, runs static upload safety checks before storage, optionally enforces HTTP scanner or ClamAV `clamd` clean verdicts through `BACKY_MEDIA_SCAN_*`, rejects active-content SVG or provider-rejected payloads with `MEDIA_SAFETY_SCAN_FAILED`, and writes assets through the active `@backy/storage` adapter
  - invalid explicit upload policy fields return `400` before storage work begins: `INVALID_MEDIA_SCOPE`, `INVALID_MEDIA_VISIBILITY`, `INVALID_MEDIA_SCOPE_TARGET`, or `INVALID_MEDIA_FOLDER`
  - invalid upload metadata JSON returns `400 INVALID_MEDIA_METADATA` instead of silently dropping the metadata
  - stores extension metadata automatically and preserves custom upload metadata through later metadata edits
  - stores clean scan evidence under `metadata.safetyScan`, including provider scan evidence when an HTTP scanner or ClamAV adapter is configured
  - returns `{ success, requestId, data: { media } }`

- `GET /api/admin/sites/:siteId/media`
  - filters: `scope`, `visibility`, `search`, `type`, `tag`, `page`, `perPage`
  - current implementation supports `scope`, `visibility`, `type`, `search`, `tag`, `folderId`, `pageId`, `postId`, `blogId`, `global=true`, `limit`, `offset`
  - invalid admin media list filters return explicit `400` errors instead of silently widening or clamping the library query: `INVALID_MEDIA_TYPE`, `INVALID_MEDIA_VISIBILITY`, `INVALID_MEDIA_SCOPE`, `INVALID_MEDIA_GLOBAL_FILTER`, `INVALID_MEDIA_LIMIT`, or `INVALID_MEDIA_OFFSET`

- `GET /api/admin/sites/:siteId/media/folders`
  - Current implementation lists local runtime media folders.
  - Folder lists are ordered deterministically by `sortOrder` and then folder name in both demo and database-backed runtimes.

- `POST /api/admin/sites/:siteId/media/folders`
  - Body: `{ name, parentId?, sortOrder? }`
  - Invalid folder `parentId` payloads return `400 INVALID_MEDIA_FOLDER_PARENT`; accepted explicit parent values are a folder id string or `null`.
  - Invalid folder `sortOrder` values return `400 INVALID_MEDIA_FOLDER_SORT_ORDER`; accepted explicit values are integers greater than or equal to `0`.
  - Creates a local runtime media folder.
  - Emits a `mediaFolder.create` admin audit log.

- `PATCH /api/admin/sites/:siteId/media/folders/:folderId`
  - Updates local runtime folder name, parent, and sort order.
  - Explicit empty or non-string `name` updates return `400 VALIDATION_ERROR`; invalid folder `parentId` payloads return `400 INVALID_MEDIA_FOLDER_PARENT`.
  - Invalid folder `sortOrder` values return `400 INVALID_MEDIA_FOLDER_SORT_ORDER`; accepted explicit values are integers greater than or equal to `0`.
  - Emits a `mediaFolder.update` admin audit log with before/after snapshots.

- `DELETE /api/admin/sites/:siteId/media/folders/:folderId`
  - Deletes a local runtime folder and moves contained media back to root.
  - Emits a `mediaFolder.delete` admin audit log with the deleted folder snapshot.

- `PATCH /api/admin/sites/:siteId/media/:mediaId`
  - Current implementation updates original name, folder, tags, alt text, caption, scope, scope target, visibility, page/post references, and metadata in the local runtime catalog.
  - Invalid explicit media update payloads return `400` errors instead of silently keeping previous metadata: `INVALID_MEDIA_VISIBILITY`, `INVALID_MEDIA_SCOPE`, `INVALID_MEDIA_SCOPE_TARGET`, `INVALID_MEDIA_FOLDER`, `INVALID_MEDIA_METADATA`, or `INVALID_MEDIA_TAGS`.
  - Font media metadata can register `fontFamily`, `fontWeight`, `fontStyle`, `fontFallback`, and `fontDisplay`; `/render` exposes public font media in `assets.fonts` with `weights`, `styles`, `fallbackStack`, `display`, and `cssFamily`, and hosted page/post rendering injects matching `@font-face` rules.

- `POST /api/admin/sites/:siteId/media/:mediaId`
  - Replaces the stored file for an existing media item while keeping the media id stable for pages, posts, products, and custom frontend API references.
  - Accepts multipart `file`, optional `replacedBy`, and optional `reason`.
  - Requires the replacement to keep the same media type, passes the same static upload safety checks as new uploads, writes the new file through the active `@backy/storage` adapter, stores the prior file under `metadata.replacementVersions`, returns updated quota metadata, and emits a `media.replace` admin audit log.

- `DELETE /api/admin/sites/:siteId/media/:mediaId`
  - Current implementation deletes the catalog record and removes local uploaded files through the storage adapter when present.

- `POST /api/admin/sites/:siteId/media/:mediaId/bind`
  - Body: `{ targetType: "page"|"post", targetId, action?: "bind"|"unbind", usageType?, attachedBy? }`
  - Binds or unbinds media to page/post contexts, updates `pageIds`/`postIds`, and stores lightweight binding metadata under `media.metadata.bindings`.
  - Page/post create, update, rollback, and delete paths also sync `pageIds`/`postIds` from saved content `mediaId`/`assetId` references and featured media.
  - Media create/update/delete/replace writes emit admin audit logs with entity `media`, request id correlation, before/after snapshots where applicable, and non-secret storage metadata for traceability.

### 3.4 Reusable sections/templates

- `GET /api/admin/sites/:siteId/reusable-sections`
  - Lists saved reusable canvas sections for a site.
  - Filters: `status=active|archived|all`, `category`, `tag`, `search`.
  - Default status filter is `active`.
  - Returns `{ success, requestId, data: { sections } }`.

- `POST /api/admin/sites/:siteId/reusable-sections`
  - Body: `{ name, slug?, description?, category?, status?, tags?, content, sourceElementId?, frontendDesignTemplateId?, designTemplateId?, createdBy?, updatedBy? }`.
  - Validates site existence, required name, required non-empty `content.elements`, and per-site slug conflicts.
  - When `frontendDesignTemplateId` or `designTemplateId` points to a captured `section` template and content is omitted, Backy seeds the reusable section canvas and stores design provenance in `metadata.frontendDesign*`.
  - Stores normal canvas `content.elements` plus `canvasSize`, so saved sections can be inserted back into the same editor/rendering model.
  - Emits `reusableSection.create` admin audit logs with request-id correlation and the created section snapshot.
  - Returns `{ success, requestId, data: { section } }`.

- `GET /api/admin/sites/:siteId/reusable-sections/:sectionId`
  - Fetches a section by ID or slug.

- `PATCH /api/admin/sites/:siteId/reusable-sections/:sectionId`
  - Updates name, slug, description, category, status, tags, source element, and content.
  - Validates duplicate slugs against other sections in the same site.
  - Supports optimistic conflict guards with `expectedVersion` or `expectedUpdatedAt`; stale clients receive `409 REUSABLE_SECTION_VERSION_CONFLICT` with the current section in `error.details.section`.
  - Every successful update increments `data.version` and stores the previous reusable section snapshot in `section.metadata.reusableSection.history` for bounded version history.
  - Emits `reusableSection.update` admin audit logs with before/after snapshots, changed keys, and the resulting version.

- `GET /api/admin/sites/:siteId/reusable-sections/:sectionId/metadata`
  - Returns structured library metadata stored under `section.metadata.reusableSection.library` plus the current reusable-section version.
  - Returns `{ success, requestId, data: { sectionId, metadata, library, version } }`.

- `PATCH /api/admin/sites/:siteId/reusable-sections/:sectionId/metadata`
  - Body accepts top-level fields or `{ metadata }`/`{ metadata: { reusableSection: { library } } }`.
  - Supports `displayName`, `summary`, `usageNotes`, `thumbnailMediaId`, `previewPath`, `labels`, `frontendDesignTemplateId`, `designSystem`, and `owner`.
  - Normalizes duplicate labels, validates preview paths, supports optimistic conflict guards, preserves existing version history, and increments the reusable-section version for every successful metadata edit.
  - Emits `reusableSection.metadata.update` admin audit logs with changed keys and resulting version.

- `DELETE /api/admin/sites/:siteId/reusable-sections/:sectionId`
  - Deletes the saved section from the current runtime adapter.
  - Emits `reusableSection.delete` admin audit logs with the deleted section snapshot.

- `GET /api/admin/sites/:siteId/reusable-sections/:sectionId/versions`
  - Lists the current reusable section version plus bounded historical snapshots from `metadata.reusableSection.history`.
  - Returns `{ success, requestId, data: { sectionId, currentVersion, versions } }`; the current entry has `current: true`.

- `POST /api/admin/sites/:siteId/reusable-sections/:sectionId/versions/:version/restore`
  - Restores a saved reusable-section version through the normal update path, preserving the pre-restore section as the next history entry.
  - Supports `expectedVersion` / `expectedUpdatedAt` conflict guards and returns `409 REUSABLE_SECTION_VERSION_CONFLICT` for stale clients.
  - Validates restored slugs against other sections and returns `409 SLUG_CONFLICT` if the historical slug is no longer available.
  - Emits `reusableSection.restore` admin audit logs with before/after snapshots and restored-version metadata.
  - Returns `{ success, requestId, data: { restored, restoredFromVersion, version, section } }` and records restore provenance in `section.metadata.reusableSection.restoredFromVersion`.

- `GET /api/admin/sites/:siteId/reusable-sections/:sectionId/instances`
  - Lists synced reusable-section instances across pages and blog posts, ignoring detached copies.
  - Supports `targetType=page|post` and `targetId` filters.
  - Returns `{ success, requestId, data: { sectionId, sourceUpdatedAt, targets, totals } }`; `totals.stale` counts instances whose `sourceUpdatedAt` does not match the saved section.

- `POST /api/admin/sites/:siteId/reusable-sections/:sectionId/instances`
  - Bulk-refreshes synced reusable-section instances from the saved section source.
  - Body supports `{ targetType?, targetId?, dryRun?, updatedBy? }`.
  - Preserves instance root IDs/position/z-index, replaces the nested section tree from the saved source, stamps `props.reusableSection.sourceUpdatedAt`, and writes page/post revisions through normal update paths.
  - Emits `reusableSection.instances.refresh` admin audit logs for non-dry-run propagation with refreshed target/instance counts.
  - Returns `{ success, requestId, data: { dryRun, sectionId, sourceUpdatedAt, refreshedTargets, totals } }`.

- `GET /api/admin/sites/:siteId/reusable-sections/export`
  - Exports reusable sections as JSON with `{ data: { export, sections } }`.
  - Supports `ids`/`sectionIds`, `status`, `category`, `tag`, and `search`; default `status=all`.
  - Exported sections preserve slug, metadata, source element, and normal canvas `content`.

- `POST /api/admin/sites/:siteId/reusable-sections/import?upsert=true`
  - Imports exported reusable section JSON from `{ sections }`, `{ data: { sections } }`, or `{ section }`.
  - Without `upsert=true`, duplicate slugs return `409 SLUG_CONFLICT`.
  - With `upsert=true`, matching slugs update existing reusable sections, increment version metadata, and preserve prior snapshots.
  - Emits `reusableSection.import` admin audit logs with created/updated counts, slugs, section IDs, and upsert metadata.
  - Returns `{ success, requestId, data: { import: { created, updated, total }, sections } }`.

Current reusable-section endpoints persist to `data/backy/admin-content.json` in demo mode and to the configured repository adapter otherwise. The editor library can load active sections, save the selected element tree, rename/delete saved entries, insert saved sections as synced canvas instances with source metadata, refresh selected instances from the saved source, detach instances into independent editable copies, and keep storing concrete canvas trees for public rendering. Backend instance registry/propagation can now discover and refresh synced section copies across pages and blog posts. Active sections are also exposed through the public reusable-section endpoints, manifest, OpenAPI document, and SDK for custom frontends. Admin reusable-section routes now enforce the existing content permission matrix (`pages.view`, `pages.edit`, `pages.delete`); production completion still requires broader RBAC enforcement across other admin resources.

### 3.5 Forms

- `POST /api/admin/sites/:siteId/forms`
- `GET /api/admin/sites/:siteId/forms`
  - Returns `{ success, requestId, data: { forms, total, pagination, persistenceCertification } }` with legacy top-level `forms`, `total`, and `persistenceCertification` for compatibility. `data.persistenceCertification` uses `schemaVersion: "backy.forms-persistence-certification.v1"` and exposes only non-secret gate metadata for `npm run test:forms-postgres --workspace @backy/db`, `npm run ci:forms-postgres`, `.github/workflows/forms-postgres-contract.yml`, `BACKY_DATABASE_URL`/`DATABASE_URL`, `BACKY_DATABASE_DISPOSABLE_CONFIRMED=true`, target guard env vars, and the disposable migrated Supabase/Postgres requirement.
- `GET /api/admin/sites/:siteId/forms/:formId`
- `PATCH /api/admin/sites/:siteId/forms/:formId`
- `POST /api/admin/sites/:siteId/forms/:formId/clone`
- `GET /api/admin/sites/:siteId/forms/:formId/submissions`
- `POST /api/admin/sites/:siteId/forms/:formId/submissions/:submissionId/review`
- `POST /api/admin/sites/:siteId/forms/:formId/submissions/:submissionId/webhook-retry`
- `POST /api/admin/sites/:siteId/forms/:formId/submissions/:submissionId/email-retry`
- `POST /api/admin/sites/:siteId/forms/consent-retention`
- `POST /api/admin/sites/:siteId/forms/:formId/consent-retention`
  - status transitions `pending|approved|rejected|spam`
  - Webhook retry replays the configured form submission webhook for non-spam/non-rejected submissions, returns `{ success, requestId, data: { delivery, submission } }`, and records retry queued/succeeded/failed interaction events with `x-backy-webhook-retry`.
  - Email retry replays the configured form notification email for non-spam/non-rejected submissions, returns `{ success, requestId, data: { delivery, submission } }`, and records retry queued/succeeded/failed interaction events with `metadata.channel: "email"` and `metadata.retry: true`.
  - Form notification email events use the same interaction-event feed with `metadata.channel: "email"` and are displayed in the Forms delivery panel.
  - Form definitions persist `settings.spam` / `spamSettings` and `settings.consent` / `consentSettings` through create/update APIs. Consent exports include policy label, retention/delete due timestamps, request email, and respect `exportIncludesIp` for IP hash/user-agent provenance.
  - Consent retention applies `deleteAfterDays` across due submissions in both demo and repository modes, scrubbing consent field values plus IP/user-agent provenance while preserving non-consent submitted values. The site-wide endpoint returns aggregate `scannedForms`, `formsWithConsent`, `scannedSubmissions`, `due`, `anonymized`, and per-form results so scheduled jobs can record what happened.
  - Form creation accepts `frontendDesignTemplateId` or `designTemplateId`; when it points to a captured `form` template, Backy seeds fields/settings and stores design provenance in `settings.frontendDesign*`.

### 3.6 Comments

- `GET /api/admin/sites/:siteId/comments?targetType=page|post&status=`
- `PATCH /api/admin/sites/:siteId/comments/:commentId`
- `POST /api/admin/sites/:siteId/comments/:commentId/block-user`

### 3.7 Blog

- `GET /api/admin/sites/:siteId/blog?status=&limit=&offset=`
  - Current implementation returns `{ success, requestId, data: { posts, pagination } }` and includes unpublished posts for admin use.
  - Admin blog list/detail/readiness/revision/author/taxonomy reads require `pages.view`; post/category/tag create and update plus archive/rollback require `pages.edit`; publish and preview-token creation require `pages.publish`; deletes require `pages.delete`.
  - Invalid admin blog list filters return explicit `400` errors instead of silently widening or clamping the query: `INVALID_BLOG_STATUS`, `INVALID_BLOG_LIMIT`, or `INVALID_BLOG_OFFSET`.

- `POST /api/admin/sites/:siteId/blog`
  - Body: `{ title, slug?, excerpt?, status?, content?, meta?, featuredImageId?, authorId?, categoryIds?, tagIds?, scheduledAt? }`
  - Validates required title, slug format, and per-site slug conflicts.
  - Invalid explicit editor content payloads return `400` errors instead of being saved as an empty/default canvas: `INVALID_BLOG_CONTENT`, `INVALID_BLOG_CONTENT_ELEMENTS`, or `INVALID_BLOG_CANVAS_SIZE`.
  - Invalid explicit blog workflow payloads return `400` errors instead of falling back to draft/no schedule: `INVALID_BLOG_STATUS` or `SCHEDULED_AT_INVALID`.

- `GET /api/admin/sites/:siteId/blog/:postId`
  - Returns full editable post payload.

- `GET /api/admin/sites/:siteId/blog/:postId/readiness`
  - Admin post readiness audit for blog editor publish workflow.
  - Response uses `{ success, requestId, data: { readiness } }`; legacy top-level `readiness` remains for compatibility.
  - Validates title/slug, legacy or canvas-authored content, canvas dimensions when elements exist, element bounds, overflow, SEO title/description/canonical, and indexability before post publish.

- `PATCH /api/admin/sites/:siteId/blog/:postId`
  - Body supports partial updates for title, slug, excerpt, status, content, SEO meta, featured image, author, categories, tags, and schedule.
  - Invalid explicit editor content payloads return `400` errors instead of being saved as an empty/default canvas: `INVALID_BLOG_CONTENT`, `INVALID_BLOG_CONTENT_ELEMENTS`, or `INVALID_BLOG_CANVAS_SIZE`.
  - Invalid explicit blog workflow payloads return `400` errors instead of preserving the previous workflow state: `INVALID_BLOG_STATUS` or `SCHEDULED_AT_INVALID`.

- `DELETE /api/admin/sites/:siteId/blog/:postId`
  - Deletes the post from the runtime adapter.

Current blog admin endpoints are local file-backed through `data/backy/admin-content.json` in demo mode and enforce the existing content permission matrix. Production completion still requires authenticated database persistence, audit-event UI, and broader contract tests.

### 3.8 Publish and revisions

- `GET /api/admin/sites/:siteId/pages/:pageId/revisions`
  - Returns local revision history for the page with pagination metadata.

- `POST /api/admin/sites/:siteId/pages/:pageId/publish`
  - Publishes the page, clears scheduled state, sets `publishedAt`, and stores a rollback snapshot.

- `POST /api/admin/sites/:siteId/pages/:pageId/archive`
  - Archives the page, clears scheduled state, marks it `noIndex`, and stores a rollback snapshot.

- `POST /api/admin/sites/:siteId/pages/:pageId/rollback`
  - Body: `{ revisionId }`
  - Restores a previous page snapshot and stores a rollback snapshot of the current state.

- `POST /api/admin/sites/:siteId/pages/:pageId/preview`
  - Body: `{ ttlSeconds? }`
  - Creates a bounded preview token and returns draft-capable `hostedUrl`, `renderUrl`, and `pageApiUrl`.
  - Preview-token creation is gated by `pages.publish`, binds the token record to the resolved admin session or service-key actor, records a tokenless `previewToken.create` audit event with target, TTL, expiry, public paths, and redaction metadata, and keeps the raw token out of audit storage.

- `GET /api/admin/sites/:siteId/blog/:postId/revisions`
  - Returns local revision history for the post with pagination metadata.

- `POST /api/admin/sites/:siteId/blog/:postId/publish`
  - Publishes the post only when post readiness has no `severity: "error"` checks.
  - Returns `400 READINESS_BLOCKED` with readiness details when canvas dimensions, element bounds, title, or slug checks fail.
  - On success, clears scheduled state, sets `publishedAt`, and stores a rollback snapshot.

- `POST /api/admin/sites/:siteId/blog/:postId/archive`
  - Archives the post, clears scheduled state, marks it `noIndex`, and stores a rollback snapshot.

- `POST /api/admin/sites/:siteId/blog/:postId/rollback`
  - Body: `{ revisionId }`
  - Restores a previous post snapshot and stores a rollback snapshot of the current state.

- `POST /api/admin/sites/:siteId/blog/:postId/preview`
  - Body: `{ ttlSeconds? }`
  - Creates a bounded preview token and returns draft-capable `hostedUrl` and `postApiUrl`.
  - Preview-token creation is gated by `pages.publish`, binds the token record to the resolved admin session or service-key actor, records a tokenless `previewToken.create` audit event with target, TTL, expiry, public paths, and redaction metadata, and keeps the raw token out of audit storage.

- `POST /api/admin/sites/:siteId/pages/:pageId/resolve-conflict`
  - Future workflow endpoint for merge/conflict resolution once collaborative editing is implemented.

### 3.9 Audit logs and governance

- `GET /api/admin/audit-logs`
  - Filters: `siteId`, `teamId`, `actorId`, `entity`, `entityId`, `action`, `requestId`, `limit`, and `offset`.
  - Returns `{ success, requestId, data: { logs, count, pagination } }`; legacy top-level `logs/count/pagination` remain for compatibility.
  - Supported entity filters include site, page, post, blogCategory, blogTag, collection, collectionRecord, media, mediaFolder, form, formSubmission, reusableSection, contact, comment, user, settings, auditLog, and cacheInvalidation.
  - Current local runtime persists audit logs in `data/backy/admin-content.json` with a bounded recent-log history; database mode uses the shared `auditLogs` repository backed by the activity log table.
  - Settings delivery/API-key changes emit `settings.update` and `settings.api_keys.regenerate` audit events with redacted key snapshots. Media create/update/delete emits `create`, `update`, and `delete` audit events for uploaded assets. Reusable-section create/update/delete/restore/import/instance-propagation emits `reusableSection.*` audit events with request-id correlation.

---

## 4) Canonical contracts and bindings

- `MediaItem.scope` = `global|page|post`
- `MediaItem.scopeTargetId` = pageId/postId for scoped assets
- `MediaItem.visibility` = `public|private`
- Public media catalog APIs must expose only `visibility=public` items. Private media file bytes require a temporary signed delivery URL minted by an admin integration.
- `FormDefinition.pageId|postId` associates form to specific content node
- `Comment.targetType|targetId` links comment thread to page/post
- `PublicContentPayload` extends read payload used by custom frontends

---

## 5) What a frontend should send and what it can expect

### Frontend sends

- Content save payloads:
  - page/blog `content` in shared schema
  - optional `themeTokens` updates
  - comment/form settings via dedicated APIs
- Form submission payload:
  - `{ fields: Record<string, unknown>, honeypot?: string }`

### Frontend expects

- Editor payloads and public payloads keep stable keys (`content`, `meta`, `themeTokens`).
- Comment lists sorted by `createdAt` descending by default.
- Submission endpoints return machine-readable `submissionId` and moderation status.

## 6) Custom frontend integration checklist

- Public frontend bootstrap flow:
  1. Resolve site: `GET /api/sites?identifier=:identifier`.
  2. Fetch `GET /api/sites/:siteId/manifest` once to discover schema refs, capabilities, endpoints, route patterns, collections, forms, media/font support, navigation, and the site-scoped OpenAPI URL.
  3. Use `manifest.data.delivery` and `manifest.data.modules.routing.localizedRoutePatterns` to choose the locale strategy, path prefixes, locale domains, and generated page/blog/dynamic route variants before building the frontend router.
  4. Fetch `GET /api/sites/:siteId/interactive-components` when `capabilities.interactiveComponents` is true and cache it with ETag revalidation.
  5. Resolve path on route changes: `GET /api/sites/:siteId/resolve?path=/...`.
  6. Fetch page, blog post, or collection dynamic item render payloads: `GET /api/sites/:siteId/render?path=/...`.
  7. If route resolves to a blog post and a custom archive UI is needed, call blog listing/detail APIs.
  8. If elements bind to structured content, inspect `dataBindings.datasets` from the render payload. Record-bound, slug-bound, searched, filtered, and sorted datasets include resolved public records; fetch additional records through `GET /api/sites/:siteId/collections/:collectionId/records` when the frontend needs more than the payload provided.
  9. Render from `content` + `theme` + `meta` only; ignore admin-only flags.
  10. Submit interactive blocks using:
  - `POST /api/sites/:siteId/forms/:formId/submissions`
  - `POST /api/sites/:siteId/pages/:pageId/comments`
  11. Render advanced interactive blocks from a safe registry contract, not arbitrary inline scripts:
  - trusted blocks use `type: "interactiveFigure"` or `type: "codeComponent"` with `componentKey`, `version`, `props`, `controls`, `dataBindings`, and `fallback` metadata.
  - custom user code runs only through a signed/versioned component bundle or sandboxed iframe URL selected from Backy's component registry.
  - sandbox runtime failures can be reported to `POST /api/sites/:siteId/interactive-components/runtime-events` and inspected through the existing interaction event stream with `kind=interactive-runtime`.
  - public payloads expose CSP requirements, sandbox flags, allowed permissions, allowed data-binding scopes, integrity/version metadata, and static fallback content for crawlers, unsupported clients, or blocked scripts.
  - registry/sandbox execution is frontend-side; Backy owns authoring, validation, version history, publishing, audit logs, data access, and API compatibility.
- `packages/sdk-js` wraps this public flow for JavaScript/TypeScript frontends. It intentionally calls the same public endpoints documented above, so consumers can use the SDK or raw HTTP interchangeably without depending on admin/editor internals.
  - SDK build/typecheck now runs `packages/sdk-js/scripts/generate-contract-types.mjs`, which reads `specs/ai-frontend-contract/*.schema.json` and emits exported `GeneratedBacky*` TypeScript shapes for the public manifest, render payload, theme tokens, content elements, element actions, data bindings, editable maps, and OpenAPI document metadata. The same generator evaluates the public OpenAPI route's component schema object from `apps/public/src/app/api/sites/[siteId]/openapi/route.ts` and emits `GeneratedBackyOpenApiOperationId`, `GeneratedBackyOpenApiComponentName`, per-component `GeneratedBackyOpenApi*` schema shapes, dedicated route resource and route-resolution types, navigation/SEO/page/blog/font/frontend-design schema types, media asset/reference/editable-metadata schema types, collection field/permission/record schema types, form list/detail/definition/submission/validation/contact schema types, comment/moderation/report/blocklist schema types, interaction-event/runtime-record envelope types, commerce catalog/order/webhook schema types, reusable-section content/document schema types, generated render-payload media/font/form/comment/navigation/frontend-design subtypes, generated content action/data-binding/editable-map subtypes, and dedicated interactive registry/runtime request types. `npm run test:generated-types --workspace @backy/sdk-js` verifies those generated exports with representative positive and negative compile-time contract cases, including route resource and route-resolution requirements, navigation payload requirements, page SEO and paginated page-list requirements, SEO route sitemap enums, blog feed/category requirements, font manifest versioning, frontend-design lifecycle states, render-payload media/font/form/comment/navigation/frontend-design subtype constraints, media reference/editable metadata requirements, collection field enums/permissions/record values/delete envelopes, form list/detail/schema/submission/validation states, comment target/status/blocklist constraints, event site/pagination/runtime-record requirements, commerce product/order/webhook constraints, reusable-section content/editable-map requirements, generated content action/data-binding constraints, and the interactive registry security boundary.
- Site webhook deliveries use the stable `backy.site-webhook.v1` payload contract. The site-scoped OpenAPI document exposes this as the `SiteWebhookPayload` component, and the JavaScript SDK exports it as `GeneratedBackyOpenApiSiteWebhookPayload` for typed webhook receivers.
  - Delivery headers include `x-backy-site-id`, `x-backy-site-webhook-event`, `x-backy-request-id`, and `x-backy-webhook-endpoint-id`.
  - `kind` currently covers `site-created`, `site-updated`, `site-deleted`, `form-submission`, `contact-shared`, `contact-sync`, `contact-status`, `commerce-order`, `commerce-product`, `commerce-webhook`, `comment-submitted`, `comment-status`, `comment-reported`, `interactive-runtime`, and related site-owned extension events as they are added.
  - Payloads include `{ schemaVersion, kind, siteId, site, requestId, reason, actor, data }`. The `data` object is event-specific; site-owned admin mutations include compact before/after snapshots and route-specific metadata when those values are available.
- CORS policy for custom frontends:
  - allow exact frontend origin(s),
  - allow `Authorization`, `X-Backy-Admin-Key`, `X-API-Key`, and `X-Request-Id` headers for configured admin clients,
  - send `x-backy-request-id` for debug parity.
  - Admin API key enforcement is opt-in with `BACKY_REQUIRE_ADMIN_API_KEY=true` plus `BACKY_ADMIN_API_KEY` or `BACKY_ADMIN_SECRET_KEY`. Admin clients can send the key with `X-Backy-Admin-Key` or `Authorization: Bearer ...`; the Vite admin app reads `VITE_BACKY_ADMIN_API_KEY` or `VITE_ADMIN_API_KEY` and attaches the header to admin API requests.
  - Forms/Contacts database-mode verification is available through `npm run ci:forms-postgres`, which runs the configured Postgres/Supabase smoke against `BACKY_DATABASE_URL`/`DATABASE_URL` only after `BACKY_DATABASE_DISPOSABLE_CONFIRMED=true`, and verifies final Forms/Contacts RLS policy readiness, temporary site/page/form/submission/contact create, read, update, filter, merge, and cleanup behavior. `.github/workflows/forms-postgres-contract.yml` exposes the same gate as a manual GitHub Actions workflow using the `BACKY_DATABASE_URL` or `DATABASE_URL` repository secret alias for a disposable migrated Supabase/Postgres database.
  - SDK database-mode verification is available through `npm run ci:sdk-postgres-smoke`, which runs the configured Postgres/Supabase smoke against `BACKY_DATABASE_URL`/`DATABASE_URL` only after `BACKY_DATABASE_DISPOSABLE_CONFIRMED=true`, preflights the configured Postgres/Supabase schema, starts the public app in database mode, and runs the generated/custom frontend SDK smoke against public manifest, OpenAPI, render, media, CMS collections, reusable sections, forms, comments, events, and interactive component registry endpoints. The public manifest exposes this as `data.contract.databaseCertification`, the site-scoped OpenAPI document mirrors it as `x-backy-database-certification`, and the generated SDK exports `GeneratedBackyFrontendManifestDatabaseCertification` so custom frontend consumers can discover the non-secret gate, workflow, env alias family, target guards, and disposable-database confirmation requirement without reading release notes. `.github/workflows/sdk-postgres-smoke.yml` exposes the same gate as a manual GitHub Actions workflow using the `BACKY_DATABASE_URL` or `DATABASE_URL` repository secret alias for a disposable migrated Supabase/Postgres database.
  - Commerce provider mock verification is available through `npm run ci:commerce-provider-smoke`, which starts the public and admin apps, sets the existing commerce/order smoke tests to their local mock provider bases, and runs provider catalog sync for Stripe, PayPal, Paddle, Square, Shopify, BigCommerce, WooCommerce, Etsy, Magento, and HTTP, public checkout/subscription actions, public checkout and admin-order TaxJar/Avalara tax quotes, EasyPost/Shippo shipping rates and label/tracking flows, Stripe Tax and Stripe promotion-code discount quotes, Stripe/PayPal/Paddle/Square/Adyen/Mollie/Razorpay refunds, webhook settlement, and reconciliation paths. `.github/workflows/commerce-provider-smoke.yml` runs the same gate on pull requests and main-branch pushes without live provider credentials.
  - Public commerce clients can discover live-provider certification requirements without admin credentials. `GET /api/sites/:siteId/manifest` exposes the Settings-derived commerce module at `data.modules.commerce.providerCertification`, and both `GET /api/sites/:siteId/commerce/catalog` and `GET /api/sites/:siteId/commerce/orders` return the same non-secret storefront contract at `data.commerce.providerCertification`. The contract preserves the Settings payment-provider handoff enum (`none`, `stripe`, `paypal`, `paddle`, `square`, `adyen`, `mollie`, `razorpay`, `manual`) so generated frontends can show the selected provider family without collapsing non-Stripe providers to `none`; direct checkout execution still depends on the configured adapter and server-side credentials. The handoff uses `backy.commerce-provider-certification-handoff.v1`, separates repeatable `ci:commerce-provider-smoke` coverage from the credentialed `ci:commerce-provider-certification` gate, names payment, tax, shipping, discount, catalog sync, subscription lifecycle, and mock-provider families, exposes each group's non-secret `requiredInputs` aliases such as `BACKY_STRIPE_SECRET_KEY`/`STRIPE_SECRET_KEY`, `BACKY_TAXJAR_API_KEY`/`TAXJAR_API_KEY`, `BACKY_EASYPOST_API_KEY`/`EASYPOST_API_KEY`, `BACKY_COMMERCE_PRODUCT_SYNC_URL`/`COMMERCE_PRODUCT_SYNC_URL`, `BACKY_COMMERCE_SUBSCRIPTION_ACTION_URL`/`COMMERCE_SUBSCRIPTION_ACTION_URL`, and `BACKY_COMMERCE_WEBHOOK_SECRET`/`COMMERCE_WEBHOOK_SECRET`, and keeps provider secrets server-side. The site-scoped OpenAPI document exposes `CommerceProviderCertification` and `CommerceStorefrontContract`, and the SDK exports `GeneratedBackyOpenApiCommerceProviderCertification` plus `GeneratedBackyOpenApiCommerceStorefrontContract` for generated storefronts.
  - Scheduled commerce reconciliation is wired through root `vercel.json` to call `GET /api/admin/commerce/reconcile?limit=100` daily. Set `CRON_SECRET` to the same server-only value as `BACKY_ADMIN_API_KEY` or `BACKY_ADMIN_SECRET_KEY` so Vercel's bearer cron request authenticates as an admin-key request. `GET /api/admin/commerce/reconcile/readiness` returns non-secret cron readiness booleans for the Vercel cron entry, `CRON_SECRET`, environment admin key presence, and secret/key match status. Site and platform reconciliation responses carry private/no-store Backy contract headers with `backy.commerce-reconciliation.v1`, `backy.commerce-reconciliation-batch.v1`, or `backy.commerce-reconciliation-readiness.v1` schema metadata.
  - Private order analytics are available to admin clients through `GET /api/admin/sites/:siteId/commerce/orders/analytics`. The response uses `backy.order-analytics.v1`, carries Backy contract headers with `x-backy-schema-version`, `x-backy-site-id`, `x-backy-cache-scope: private`, and `cache-control: no-store`, and aggregates private order records into revenue totals, payment/fulfillment buckets, source/currency breakdowns, operations counts, 14-day trend points, recent order summaries, and provider execution analytics for payment providers, provider refunds, fulfillment dispatches, and shipping-label providers without exposing raw order collections publicly.
  - Public checkout order intake can execute configured commerce order notification email and workflow webhook handoffs. Accepted orders include `data.deliveries`, and delivery activity is available at `GET /api/sites/:siteId/events?kind=commerce-order&requestId=:requestId`.
  - Public checkout order intake returns `data.risk` and persists private `riskscore`, `risklevel`, `riskreasons`, and `riskreviewstatus` fields so admins can hold, approve, or clear risky orders before fulfillment.
  - Commerce provider webhook settlement uses the `backy.commerce-webhook.v1` response schema with private/no-store Backy contract headers. The route verifies the configured webhook signing secret reference, enforces the Settings event allowlist, updates matched private orders and provider-refund metadata, records commerce-webhook activity, and keeps duplicate provider events idempotent.
  - The `/products` and `/orders` admin handoff manifests expose the same non-secret `providerCertification` handoff used by public commerce contracts. It uses `backy.commerce-provider-certification-handoff.v1`, `status: external-live-provider-gate`, `requiredFor: live-commerce-provider-launch`, `ci:commerce-provider-smoke` for repeatable local/mock coverage, `ci:commerce-provider-certification` for credentialed live-provider proof, per-family `requiredInputs` aliases, and server/CI-only secret-handling guidance so custom admin clients can render the remaining live-provider blocker without scraping release notes.
  - The `/orders` admin handoff manifest includes an `apiContracts` block for custom admin frontends. It maps order analytics, quote, shipping-label, fulfillment, tracking, provider-refund, commerce webhook settlement, site reconciliation, platform reconciliation, and cron-readiness endpoints to their supported methods, `backy.*.v1` schema versions, private cache scope, and Backy response headers.
  - Paddle provider-refund refresh uses Paddle's filtered Adjustments list response shape and extracts the first `data[]` adjustment before mapping status, so `PATCH /api/admin/sites/:siteId/commerce/orders/:orderId/provider-refund` can reconcile approved/refunded Paddle adjustments from the list endpoint while preserving the server-only `BACKY_PADDLE_API_KEY`/`PADDLE_API_KEY` credential boundary.
  - Admin order operators can recalculate persisted pricing totals through `POST /api/admin/sites/:siteId/commerce/orders/:orderId/quote`; the endpoint reads saved line items, applies current Settings commerce tax/shipping/discount toggles and rules, persists `subtotal`, `discountamount`, `taxamount`, `shippingamount`, `total`, `currency`, and a private note, emits audit/cache invalidation metadata, and exposes the current quote with `GET` on the same URL using the `backy.order-quote.v1` payload and private/no-store Backy contract headers. In repository/Supabase mode, quote reads and refreshes build the storefront pricing contract and provider settings from persisted Settings before calling HTTP, Stripe Tax, TaxJar, Avalara AvaTax, EasyPost rate, Shippo rate, or Stripe promotion-code discount quote providers. TaxJar execution is selected with `taxProvider: "taxjar"` and uses `BACKY_TAXJAR_API_KEY`/`TAXJAR_API_KEY` plus optional `BACKY_TAXJAR_API_BASE_URL`/`TAXJAR_API_BASE_URL`. Avalara execution is selected with `taxProvider: "avalara"` and uses `BACKY_AVALARA_ACCOUNT_ID`/`AVALARA_ACCOUNT_ID`, `BACKY_AVALARA_LICENSE_KEY`/`AVALARA_LICENSE_KEY`, `BACKY_AVALARA_COMPANY_CODE`/`AVALARA_COMPANY_CODE`, plus optional `BACKY_AVALARA_API_BASE_URL`/`AVALARA_API_BASE_URL`. EasyPost and Shippo shipping quote execution are selected with `shippingProvider: "easypost" | "shippo"`, use the existing label/tracking credentials, and require structured `fromAddress`, `toAddress`, and `parcel` data from the request, order shipping address, or Settings commerce defaults; quote refresh only selects a rate and never purchases a label. Stripe promotion-code discount execution is selected with `discountProvider: "stripe"`, uses `BACKY_STRIPE_SECRET_KEY`/`STRIPE_SECRET_KEY` plus optional `BACKY_STRIPE_DISCOUNT_API_BASE_URL`/`BACKY_STRIPE_API_BASE_URL`/`STRIPE_API_BASE_URL`, and Stripe Tax/discount quote calls can send optional `BACKY_STRIPE_API_VERSION`/`STRIPE_API_VERSION`; the adapter validates the saved/requested discount code against active Stripe promotion codes, applies supported `percent_off` or matching-currency `amount_off` coupons, and keeps unsupported or missing codes as skipped/failed provider adjustments rather than inventing a discount.
  - Admin order operators can prepare shipment-label handoff metadata through `POST /api/admin/sites/:siteId/commerce/orders/:orderId/shipping-label`; the endpoint persists label status/provider/id/url/service/cost/created-at fields on the private order and exposes the current label with `GET` on the same URL using the `backy.shipping-label.v1` payload and private/no-store Backy contract headers. When `executionProvider`/`labelProvider`/`provider` is `easypost`, `BACKY_EASYPOST_API_KEY` or `EASYPOST_API_KEY` is configured, and the request includes structured `fromAddress`, `toAddress`, and `parcel` payloads, the endpoint creates an EasyPost shipment, buys a matching or lowest available rate, and stores the purchased label URL/cost/carrier/service. When the execution provider is `shippo`, `BACKY_SHIPPO_API_KEY` or `SHIPPO_API_KEY` is configured, and the request includes structured shipment payloads, the endpoint creates a Shippo shipment, purchases the selected transaction/rate, and stores the purchased label URL/cost/carrier/service. Without credentials or shipment data it keeps the existing draft handoff behavior. Admin operators can also void an attached label through `DELETE` on the same URL with the same private contract headers; EasyPost purchased shipment ids (`shp_...`) use the EasyPost shipment refund endpoint when credentials are present, Shippo purchased transaction ids use Shippo refund requests, while manual/draft labels are marked voided locally and processing orders move back to unfulfilled.
  - Admin order operators can prepare fulfillment dispatch metadata through `POST /api/admin/sites/:siteId/commerce/orders/:orderId/fulfillment`; the endpoint requires a paid, non-closed order, persists dispatch status/provider/id/requested-at/completed-at/payload fields on the private order, moves the order into processing for handoff, emits audit/cache invalidation metadata, and exposes the current `backy.fulfillment-dispatch.v1` payload through `GET` on the same URL for warehouse, 3PL, or custom fulfillment adapters with private/no-store Backy contract headers. In repository/Supabase mode, HTTP fulfillment execution reads the persisted Settings commerce contract before dispatching, so database-backed sites use their configured warehouse/3PL adapter instead of demo-store settings.
  - Admin order operators can refresh shipment tracking through `POST /api/admin/sites/:siteId/commerce/orders/:orderId/tracking`; the endpoint persists `trackingstatus` and `trackinglastcheckedat` alongside the existing carrier/number/link fields and exposes the current tracking summary with `GET` on the same URL using the `backy.tracking.v1` payload and private/no-store Backy contract headers. When `executionProvider`/`trackingProvider`/`provider` resolves to `easypost` from the request, order fields, or persisted Settings commerce label provider and `BACKY_EASYPOST_API_KEY` or `EASYPOST_API_KEY` is configured, the endpoint creates/reads an EasyPost tracker for the order tracking number and stores the sanitized provider status/link. When the resolved execution provider is `shippo` and `BACKY_SHIPPO_API_KEY` or `SHIPPO_API_KEY` is configured, the endpoint reads Shippo tracking status through `GET /tracks/:carrier/:trackingNumber` and stores sanitized status/history metadata; without credentials or a selected executable carrier provider it records a manual refresh status and audit trail without calling a carrier.
  - Admin order operators can prepare provider-refund metadata through `POST /api/admin/sites/:siteId/commerce/orders/:orderId/provider-refund`; the endpoint persists refund status/provider/id/reference/amount/reason/requested-at/completed-at/payload fields on the private order and exposes the current refund with `GET` on the same URL using the `backy.provider-refund.v1` payload and private/no-store Backy contract headers. Refund creation resolves provider from the request, then the order payment provider, then persisted Settings commerce payment provider before falling back to manual. For `paymentprovider=stripe`, a Stripe `pi_` or `ch_` payment reference, and `BACKY_STRIPE_SECRET_KEY` or `STRIPE_SECRET_KEY`, the endpoint calls Stripe refunds directly with a Backy idempotency key and records a sanitized provider result. It can also execute PayPal capture refunds with `BACKY_PAYPAL_ACCESS_TOKEN` or `PAYPAL_ACCESS_TOKEN`, Paddle full transaction refund adjustments with `BACKY_PADDLE_API_KEY` or `PADDLE_API_KEY`, Square payment refunds with `BACKY_SQUARE_ACCESS_TOKEN` or `SQUARE_ACCESS_TOKEN`, Adyen payment refunds with `BACKY_ADYEN_API_KEY`/`ADYEN_API_KEY` plus merchant account, Mollie payment refunds with `BACKY_MOLLIE_API_KEY` or `MOLLIE_API_KEY`, and Razorpay payment refunds with `BACKY_RAZORPAY_KEY_ID`/`BACKY_RAZORPAY_KEY_SECRET` or the matching Razorpay aliases. `PATCH` refreshes pending Stripe, PayPal, Paddle, Square, Mollie, and Razorpay refund statuses through provider APIs and returns the same private contract headers; Paddle refresh uses the Adjustments list API filtered by the stored adjustment id. Adyen refresh returns webhook-pending guidance because refund outcomes settle through asynchronous Adyen notifications. Without matching credentials/reference data it falls back to handoff metadata.
  - Admin product operators can sync catalog metadata through `POST /api/admin/sites/:siteId/commerce/products/:productId/provider-sync`. `provider: "stripe"` creates Stripe Product/Price metadata when Stripe server credentials are configured and otherwise stores handoff metadata. `provider: "paypal"` creates PayPal catalog product metadata and subscription billing plans when PayPal credentials are configured and otherwise stores handoff metadata. `provider: "paddle"` creates Paddle Product/Price metadata when Paddle server credentials are configured and otherwise stores handoff metadata. `provider: "square"` upserts a Square Catalog Item with an Item Variation when Square server credentials are configured and otherwise stores handoff metadata. `provider: "shopify"` creates Shopify Admin API products/variants with Backy metafields when Shopify Admin credentials and a store domain or API base URL are configured and otherwise stores handoff metadata. `provider: "bigcommerce"` creates BigCommerce Catalog API products/variants with Backy custom fields when a BigCommerce token and store hash or API base URL are configured and otherwise stores handoff metadata. `provider: "woocommerce"` creates WooCommerce REST API products and product variations when WooCommerce consumer credentials and a store URL or API base URL are configured and otherwise stores handoff metadata. `provider: "etsy"` creates Etsy draft listings when Etsy access token, API key, and shop id credentials are configured and otherwise stores handoff metadata. `provider: "magento"` creates Magento/Adobe Commerce REST API products when a Magento access token plus store URL or API base URL are configured and otherwise stores handoff metadata. `provider: "http"`, `"generic-http"`, or auto-selected Settings commerce catalog sync config posts a safe `backy.commerce-product-sync.v1` payload to the configured HTTP endpoint and stores sanitized provider product/price/response metadata. `provider: "auto"` chooses the configured catalog-sync provider or Stripe fallback. Responses use the `backy.commerce-product-sync.v1` schema with private/no-store Backy contract headers for custom admin clients.
  - Admin product operators can inspect product-scoped subscription lifecycle state through `GET /api/admin/sites/:siteId/commerce/products/:productId/subscriptions`. The `backy.product-subscription-lifecycle.v1` response summarizes matching private subscription orders by active, renewal, dunning, paused, trial-ending, cancelled, and pending states, exposes recent order/customer/product-revenue rows plus bounded structured action history/last-action summaries, includes non-secret `backy.product-subscription-execution-readiness.v1` provider readiness for Stripe, PayPal, Paddle, Square, Adyen, Mollie, Razorpay, generic HTTP, and manual handoff actions, documents the related orders, webhook, and reconciliation API contracts, and returns private/no-store Backy contract headers.
  - Admin product operators can run subscription lifecycle actions through `POST /api/admin/sites/:siteId/commerce/products/:productId/subscriptions/:orderId/action` with `action: "pause" | "resume" | "cancel"`. The endpoint requires `commerce.edit`, verifies the private subscription order belongs to the product, executes Stripe subscription pause/resume/cancel when server Stripe credentials and a `sub_...` payment reference are available, executes PayPal subscription suspend/activate/cancel when server PayPal credentials are available, executes Paddle subscription pause/resume/cancel when `BACKY_PADDLE_API_KEY`/`PADDLE_API_KEY` is configured and the provider is `paddle`, executes Square subscription pause/resume/cancel when `BACKY_SQUARE_ACCESS_TOKEN`/`SQUARE_ACCESS_TOKEN` is configured and the provider is `square`, executes Adyen recurring disable cancellation when `BACKY_ADYEN_API_KEY`/`ADYEN_API_KEY` plus merchant account are configured and the provider reference includes a shopper reference, using `BACKY_ADYEN_RECURRING_API_BASE_URL`/`ADYEN_RECURRING_API_BASE_URL` when supplied or the Adyen PAL Recurring API base by default, executes Mollie subscription cancellation when `BACKY_MOLLIE_API_KEY`/`MOLLIE_API_KEY` is configured and the reference includes a customer/subscription id pair, executes Razorpay subscription pause/resume/cancel with Basic auth when `BACKY_RAZORPAY_KEY_ID`/`BACKY_RAZORPAY_KEY_SECRET` or matching aliases are configured and the provider is `razorpay`, executes a generic HTTP subscription-action adapter when `BACKY_COMMERCE_SUBSCRIPTION_ACTION_URL`/`COMMERCE_SUBSCRIPTION_ACTION_URL` or Settings commerce `subscriptionActionProviderUrl` is configured and the provider is `http`/`generic-http`/`custom-http`, otherwise records a structured manual handoff, persists an order note/local lifecycle state, emits audit/cache invalidation metadata, and returns `backy.product-subscription-action.v1` with private/no-store Backy contract headers. Provider-native pause/resume is not invented for Adyen or Mollie; those unsupported actions remain structured handoffs unless a generic HTTP lifecycle adapter is configured.

---

## 7) Migration-safe policy

- Additive schema changes first (new optional fields, new endpoints with fallbacks).
- Backward compatibility window: 2 minor versions.
- No frontend breakage from internal admin fields being added.
