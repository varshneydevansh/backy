# Backy AI Frontend Contract

Date: 2026-05-07
Status: starter contract area with machine-readable schemas

This folder is the canonical place an AI or external developer should read before building a frontend that consumes Backy.

The rule is simple: a custom frontend can look completely different from the Backy admin UI, but every rendered page, post, asset, form, comment, token, and interaction must map back to Backy public contracts.

## Allowed assumptions

- Do not import from `apps/admin`.
- Do not depend on admin localStorage, admin mock stores, or editor-only components.
- Consume public APIs, public SDKs, or generated JSON payloads only.
- Treat `/api/admin/*` as a protected mutation surface. When admin key enforcement is enabled, admin clients must send `X-Backy-Admin-Key` or `Authorization: Bearer <key>`; public/custom frontends should not call admin mutation APIs.
- `npm run test:admin-auth --workspace @backy/public` verifies admin API key enforcement against a server that was started with `BACKY_REQUIRE_ADMIN_API_KEY=true BACKY_ADMIN_API_KEY=<key>`. The broader `test:admin-contract` smoke can target the same key-enforced server and will send the configured key on `/api/admin/*` requests.
- Treat Backy as the source of truth for content, assets, SEO, theme tokens, and interaction endpoints.
- Render design however the frontend wants, as long as Backy-managed fields remain addressable.

## Public bootstrap flow

1. Resolve the site.
   - `GET /api/sites?identifier=:identifier`
   - `GET /api/sites/:siteId/manifest`
   - Future stable form: `GET /api/public/sites/:identifier`
   - The manifest endpoint is the current WordPress-style discovery surface for generated/custom frontends. It returns the site theme, schema references, capability flags, route patterns, localized route-pattern variants, endpoint URLs, navigation, page/blog/collection/form/media module summaries, and public collection/form write metadata in one envelope.
   - Public site discovery now emits Backy contract/cache headers, ETags, conditional 304 responses, and site metadata headers for identifier lookups.

2. Resolve a route.
   - `GET /api/sites/:siteId/resolve?path=/about`
   - `GET /api/sites/:siteId/pages?slug=:path`
   - `GET /api/sites/:siteId/render?path=/about`
   - Future stable form: `GET /api/public/sites/:siteId/resolve?path=/about`
   - Public route resolution returns published content and scheduled content only after `scheduledAt` has passed. Drafts and future scheduled content require a valid preview token. Public route/page/blog GET responses now carry Backy contract/cache headers, ETags, conditional 304 responses, and database-mode cache revisions for published reads; preview-token reads are private/no-store. Site-level redirect rules resolve as `route.type: "redirect"` with the configured redirect status code and target. Retired routes resolve as `route.type: "gone"` with HTTP 410 so custom frontends can render an explicit removed-page state instead of treating it like an ordinary 404.
   - Admin clients can manage route rules through `GET/PATCH /api/admin/sites/:siteId/redirects` and can run a non-persistent conflict preview with `POST /api/admin/sites/:siteId/redirects`. The endpoint validates missing destinations, duplicate enabled source paths, and same-route redirect loops before saving rules consumed by public route resolution, hosted pages, manifest/OpenAPI metadata, and the SDK. Preview/read/save responses include warning diagnostics when a redirect source shadows an existing page/post/dynamic route or an internal destination does not currently resolve. In database mode, successful redirect saves record a scoped routing cache invalidation event.

3. Fetch supporting data.
   - media: `GET /api/sites/:siteId/media`
   - media detail: `GET /api/sites/:siteId/media/:mediaId`
   - navigation: `GET /api/sites/:siteId/navigation`
   - blog: `GET /api/sites/:siteId/blog`
   - blog categories: `GET /api/sites/:siteId/blog/categories`
   - blog tags: `GET /api/sites/:siteId/blog/tags`
   - blog authors: `GET /api/sites/:siteId/blog/authors`
   - collections: `GET /api/sites/:siteId/collections`
   - collection records: `GET /api/sites/:siteId/collections/:collectionId/records`
   - reusable sections: `GET /api/sites/:siteId/reusable-sections`
   - SEO discovery: `GET /api/sites/:siteId/seo`
   - comments: `GET /api/sites/:siteId/pages/:pageId/comments?status=approved`
   - comment report reasons: `GET /api/sites/:siteId/comments/report-reasons`

Public blog category, tag, and author feeds emit Backy contract/cache headers, ETags, conditional 304 responses, and database-mode `content` cache revisions. Database-mode category/tag mutations record scoped invalidation events so custom frontends can revalidate taxonomy archives and filters.

Comment report-reason discovery emits Backy contract/cache headers, ETags, conditional 304 responses, and a public cache revision so generated/custom frontends can reuse moderation UI metadata without hardcoding the reason list. Comment list/detail/moderation/report submission and interaction-event endpoints also emit Backy contract headers, but they remain `private`/`no-store` because current payloads can include visitor identity, actor, and moderation data.

Site settings can now define a primary and footer navigation tree using `page`, `route`, and `url` items. Public navigation responses and render payloads preserve nested children, external URL targets, and page references while filtering out unpublished page targets. Public navigation reads emit Backy contract/cache headers, ETags, conditional 304 responses, and database-mode site-level cache revisions. If no custom primary menu exists, Backy falls back to a publishable-page navigation list.

Admin clients can manage that menu directly through `GET/PATCH /api/admin/sites/:siteId/navigation`. The endpoint validates page references before saving and returns both the stored navigation settings and the resolved public navigation tree. In database mode, successful navigation saves record a scoped cache invalidation event.

4. Submit interactions.
   - forms: `POST /api/sites/:siteId/forms/:formId/submissions`
   - page comments: `POST /api/sites/:siteId/pages/:pageId/comments`
   - blog comments: `POST /api/sites/:siteId/blog/:postId/comments`

Canvas-authored forms can now declare a collection write target in their form props. Public form list reads and `GET /api/sites/:siteId/forms/:formId/definition` emit Backy contract/cache headers, ETags, conditional 304 responses, and database-mode `content` cache revisions. The definition route returns `backy.form-definition.v1` form schema plus `submitUrl` without submission/contact data, so custom frontends can cache form rendering safely. The older form detail route is still wrapped in contract headers but remains `private`/`no-store` because its current payload includes submission data; submission list/detail/create/review and contact list/update routes also use private/no-store contract headers because payloads carry visitor identity and moderation data. When `collectionTarget.enabled` is true and the target collection is published with `permissions.publicCreate`, accepted public submissions validate against the collection schema and create draft collection records for moderation. The submission response includes `collectionRecord` when the write succeeds and `collectionRecordErrors` when the submission was stored but the collection write could not be completed. Submission list payloads retain a lightweight collection-record link so admin tools can deep-link from a form submission to the generated draft record.

## Current render payload endpoint

The first implementation-backed endpoint is:

- `GET /api/sites/:siteId/render?path=/about`
- `GET /api/sites/:siteId/render?path=/about&schemaVersion=backy.content-payload.v1`
- `GET /api/sites/:siteId/render?path=/blog/example-post`
- `GET /api/sites/:siteId/render?path=/team/ada-lovelace`

It returns the `content-payload.schema.json` shape for pages, blog posts, and collection dynamic item routes from the current public data adapter. This is not yet the final durable database-backed service, but it gives external frontends and AI-generated frontends a stable payload target while Backy replaces seeded/mock persistence.

`npm run test:admin-contract --workspace @backy/public` validates the page, blog post, collection-bound page, and collection dynamic item render responses against `content-payload.schema.json` so contract drift is caught during the public API smoke pass. The same smoke verifies that `/render` exposes the dataset manifest, resolved collection fields/records, normalized element binding, collection-record editable map entry, and uploaded public font asset manifests.

Published render responses now include short public cache headers, ETags with `If-None-Match` 304 support, plus `x-backy-contract-version`, `x-backy-schema-version`, `x-backy-supported-schema-versions`, `x-backy-request-id`, and `x-backy-site-id` so custom frontends can safely key caches and diagnostics. Clients can request the render payload schema with `schemaVersion=backy.content-payload.v1` or `x-backy-accept-schema-version`; unsupported schema requests return `406 UNSUPPORTED_RENDER_SCHEMA_VERSION` with the supported versions in the response details. In database mode, published render responses use the latest site invalidation revision for `x-backy-cache-revision`, so page, blog, collection, media, navigation, SEO, settings, and frontend-design mutations can invalidate custom frontend render caches through one stable header. Preview-token render responses and error envelopes are `no-store`.

## Current frontend manifest endpoint

Backy exposes a site-level discovery endpoint:

- `GET /api/sites/:siteId/manifest`

It returns `frontend-manifest.schema.json` and gives custom frontends a single bootstrap document for site identity, theme tokens, public endpoint URLs, route patterns, localized route-pattern variants, module capabilities, configured navigation, routing/redirect metadata, page/blog/collection/reusable-section/form/media summaries, collection field schemas, form submit URLs, and form-to-collection targets. This mirrors the role of REST discovery in a WordPress-like frontend integration while keeping Backy's render payload as the page/post/item-specific contract.

`data.delivery` is backed by site-scoped settings and exposes `defaultLocale`, `localeStrategy` (`none`, `path-prefix`, or `domain`), locale path prefixes, optional locale domains, canonical/custom/managed domains, and SEO file URLs. `data.modules.routing.localizedRoutePatterns` expands page, blog, and dynamic collection routes per configured locale so generated/custom frontends can build locale-aware routers without hardcoding URL rules. The OpenAPI export repeats the same information in `x-backy.delivery` and `x-backy.localeRouting`.

The manifest also exposes `modules.interactiveComponents` for rich page/blog animations, diagrams, calculators, simulations, and fully custom code components. `endpoints.interactiveComponents` points to `GET /api/sites/:siteId/interactive-components`, a public registry discovery endpoint that lists available component keys such as `backy.figure.rounds`, supported control/data-binding shapes, fallback requirements, sandbox mode, runtime URLs, and security guarantees. `endpoints.interactiveRuntimeEvents` points to `POST /api/sites/:siteId/interactive-components/runtime-events` for bounded sandbox failure telemetry. Frontends should treat `interactiveFigure` and `codeComponent` elements as registry-backed blocks with `componentKey`, `version`, `props`, `controls`, `dataBindings`, `fallback`, accessibility, and render-capability metadata. Trusted blocks can hydrate directly from the registered component bundle; custom user code must mount through the advertised `runtime.sandboxUrl` iframe/CSP contract and communicate with the host by the `backy.interactive-component.v1` `postMessage` protocol. If a component is unknown, disabled, blocked by CSP, or unsupported by the client, render the static fallback from the content payload rather than executing inline scripts.

`content-payload.schema.json` now accepts those same interactive fields on every element. Backy renderers must preserve them. The default hosted renderer hydrates the built-in `backy.figure.rounds` figure, mounts saved `codeComponent` blocks only through constrained same-origin/relative sandbox iframe URLs, and falls back to sanitized static fallback when a runtime is missing or unsupported.

The manifest advertises a site-scoped OpenAPI export at `GET /api/sites/:siteId/openapi`. That document describes the current public discovery, route resolution, render, navigation, media, collection, reusable-section, form, comment, report, contact, interactive-component registry/sandbox/telemetry, and interaction-event operations for the selected site and includes Backy-specific vendor metadata for available collection, reusable-section, form ids, and redirect rules. Manifest `endpoints` also include template URLs for media detail, reusable section detail, form detail/submissions/contacts, page/blog comments, comment reports, and interaction events so generated frontends do not have to hardcode Backy route shapes. `data.modules.comments` now provides a structured comments discovery module with the resolved comment policy, public approved-list status, moderation statuses, report reasons, report URL templates, blocklist URL, and spam-protection field names for generated discussion and moderation UIs. Route resolution OpenAPI schemas now name page, post, dynamic-list, and dynamic-item resource payloads so custom frontends can type-check IDs, slugs, titles, collection metadata, record URLs, render URLs, hosted paths, and frontend-design provenance. Media OpenAPI schemas now name asset, list/detail envelope, reference target, usage-reference, editable-metadata, responsive image, and font-manifest payloads so custom frontends can type-check central media-library usage, editable asset metadata, responsive image variants, and exact asset lookup. Collection OpenAPI schemas now name field definitions, field options, validation metadata, and public permission flags so custom frontends can type-check collection form/filter controls from the generated contract. Form OpenAPI schemas now name form field definitions, validation rules, submission records, collection-record links/errors, and contact records so custom frontends can type-check public form controls, validation messages, accepted submissions, moderation status, and lead/contact payloads before rendering or submitting. Comment OpenAPI schemas now name submission, list/detail, moderation update, bulk update, report, report-reason, and blocklist payloads so custom frontends can type-check page/blog/site discussion and moderation workflows. Page, blog, and reusable-section OpenAPI resources now reuse named Backy content document, content element, action, binding, editable-map, and reusable-section content schemas so custom frontends can type-check authored canvas content instead of treating it as an opaque blob. Interactive registry OpenAPI schemas are named and generated separately for registry envelopes, manifest contracts, component entries, controls, fallback, security, integrity, runtime, pagination, and runtime telemetry requests, so custom frontends can type-check sandbox metadata and the `postMessage`-only security boundary. The SDK `mediaAsset(mediaId)` helper exposes exact public media lookup for generated/custom frontends that need to resolve a stored image, video, font, document, or file by stable Backy asset ID.

Published manifest and OpenAPI responses include short public discovery cache headers, ETags with `If-None-Match` 304 support, `x-backy-cache-revision`, plus the same Backy contract/request/site headers. Draft/hidden discovery responses are `no-store`.

## Current SEO discovery endpoint

Backy exposes route-level SEO metadata for custom and default frontends:

- `GET /api/sites/:siteId/seo`
- `GET /api/sites/:siteId/seo?format=sitemap`
- `GET /api/sites/:siteId/seo?format=robots`

The JSON response lists publishable page, blog post, dynamic collection list, and dynamic collection item routes with canonical paths, absolute `canonicalUrl` values, title, description, robots flags, Open Graph basics, route-specific JSON-LD objects, keywords, sitemap priority, change frequency, and update timestamps. Dynamic collection list routes expose normalized collection `frontendDesign` provenance, and dynamic item routes expose record-level `frontendDesign` plus `collectionFrontendDesign`, so generated/custom frontends can preserve captured template details while building head tags. If a site has a custom domain, Backy emits `https://custom-domain/...` canonical URLs plus custom-domain sitemap/robots public URLs while preserving path-based `canonical` fields for API consumers. `defaults.jsonLd` carries site-level structured data objects for custom/default frontend head rendering. `format=sitemap` emits sitemap XML from the same route index, and `format=robots` emits a minimal robots text response that points at the sitemap mode. SEO JSON/sitemap/robots responses now carry `x-backy-cache-revision`, and SEO JSON supports ETag/`If-None-Match` revalidation from the same DB-backed revision seed. The database repository layer now has a durable cache invalidation event contract for recording scoped revisions that future mutation services and CDN purge workers can consume. Hosted Backy sites also expose crawlable `/sites/:siteSlug/sitemap.xml` and `/sites/:siteSlug/robots.txt` routes using the same route index, with success and 404 text responses carrying public contract/cache headers. The manifest advertises `capabilities.seoDiscovery`, `endpoints.seo`, `endpoints.sitemap`, and `endpoints.robots`; the OpenAPI export includes the SEO operation and explicit route schema.

Admin clients can manage site SEO defaults through `GET/PATCH /api/admin/sites/:siteId/seo`. Those defaults include title templates, fallback descriptions, default Open Graph images, favicon URLs, site-level JSON-LD objects, sitemap enablement/default frequency/default priority/dynamic-route inclusion, and robots index/follow/custom directive settings. Public SEO discovery applies the defaults to page, post, and dynamic collection routes when route-specific metadata is absent, and the sitemap/robots response modes use the stored sitemap and robots controls. In database mode, successful SEO saves also record a scoped cache invalidation event and return its revision metadata for admin diagnostics.

Admin SEO read/save responses also include a `preview` object with supported title variables and sample dynamic collection list/item routes. The preview applies the current title template/default description to real collection names and sample record values, so editors can inspect generated dynamic SEO titles before relying on them in hosted pages or custom frontend metadata.

## JavaScript SDK starter

`packages/sdk-js` provides the current TypeScript client for custom frontends. It uses only public Backy APIs and exposes helpers for site discovery, manifest/OpenAPI bootstrap, interactive component registry discovery, interactive runtime event reporting, frontend-design contract reads, route resolution, page/blog reads, blog taxonomy, render payloads, SEO discovery, navigation, media, media file URL construction, collections/records, reusable sections, commerce catalog/order intake, forms/submissions/contacts, comments/reports, and interaction events. Its exported types now cover the main public contract objects (`BackyFrontendDesignContract`, `BackyInteractiveComponentRegistry`, `BackyManifestCommentsModule`, `BackyRenderPayload`, typed route results including redirect/gone routes, content documents/elements, page/post resources, blog category/tag/author resources, SEO routes, media/font assets and manifests, collection schemas/records, commerce catalog/products/orders, reusable sections, form submissions/contacts, comments, events, response metadata, and conditional 304 results) so frontends can consume Backy with stronger compile-time guarantees. The SDK now also generates stricter `GeneratedBacky*` public contract types from `specs/ai-frontend-contract/*.schema.json` before build/typecheck, including generated manifest, render payload, theme token, content element, action, data-binding, editable-map, and OpenAPI document shapes; the same generator evaluates the live public OpenAPI route component schema object and exports `GeneratedBackyOpenApiOperationId`, `GeneratedBackyOpenApiComponentName`, per-component `GeneratedBackyOpenApi*` schema shapes, dedicated route resource and route-resolution shapes, navigation/SEO/page/blog/font/frontend-design schema shapes, media asset/reference/editable-metadata schema shapes, collection field/permission/record schema shapes, form list/detail/definition/submission/validation/contact schema shapes, comment/moderation/report/blocklist schema shapes, structured manifest comments discovery shapes, interaction-event/runtime-record envelope shapes, commerce catalog/order/webhook schema shapes, reusable-section content/document shapes, generated render-payload media/font/form/comment/navigation/frontend-design subtypes, generated content action/data-binding/editable-map subtypes, and dedicated interactive registry/runtime request shapes for the advertised operation/component inventory. `npm run test:generated-types --workspace @backy/sdk-js` compiles representative schema-shaped payloads and negative contract cases through the public SDK entrypoint, including route resource and route-resolution envelopes, navigation, SEO, page/blog/taxonomy, font manifest, frontend-design, render-payload media/font/form/comment/navigation/frontend-design subtypes, media asset/reference/editable metadata, collection field/permission/record, form list/detail/definition/submission/validation/contact, comment/moderation/report/blocklist, structured manifest comments discovery, interaction-event/runtime-record envelope, commerce catalog/order/webhook, reusable-section content/document, content action/data-binding/editable-map, interactive registry, and runtime telemetry cases. `manifestCached`, `interactiveComponentsCached`, `frontendDesignCached`, `openapiCached`, `renderCached`, `pagesCached`, `blogCached`, `blogCategoriesCached`, `blogTagsCached`, `blogAuthorsCached`, `formsCached`, `formDefinitionCached`, `reportReasonsCached`, `navigationCached`, `seoCached`, `mediaCached`, `mediaAssetCached`, `mediaFontsCached`, `collectionsCached`, `collectionCached`, `reusableSectionsCached`, `reusableSectionCached`, `recordsCached`, `commerceCatalogCached`, and `commerceOrderContractCached` expose cache/contract headers, including `x-backy-cache-revision`, and send `If-None-Match` when an ETag is provided, letting custom frontends reuse cached discovery/frontend-design/render/page/blog/taxonomy/form/comment-metadata/navigation/SEO/media/font/collection-schema/reusable-section/dynamic-data/product-catalog/checkout-contract payloads without dropping to raw `fetch`. The SDK `resolve()` helper returns a normal route envelope for pages/posts/dynamic routes/redirects and returns a non-throwing gone envelope for HTTP 410 routes; ordinary 404 and other errors still throw `BackyApiError`. The smoke command `npm run test:smoke --workspace @backy/sdk-js` validates read flows, SDK ETag/304 helpers, interactive component registry discovery/runtime telemetry, frontend-design contract reads, page/blog/taxonomy/form/comment-metadata reads, SEO discovery, reusable-section reads, collection schema reads, redirect/gone route handling, media file URL construction, optional commerce catalog/checkout contract reads where commerce exists, and SDK public writes for collection records, form submissions, form contacts, page comments, comment moderation, comment reports, and interaction events against a temporary site, building confidence that a frontend can consume Backy with stronger compile-time guarantees without importing admin/editor code.

## Current reusable section endpoints

Backy now exposes active saved editor sections as public frontend templates:

- `GET /api/sites/:siteId/reusable-sections`
- `GET /api/sites/:siteId/reusable-sections/:sectionId`
- `GET /api/admin/sites/:siteId/reusable-sections`
- `POST /api/admin/sites/:siteId/reusable-sections`
- `GET/PATCH/DELETE /api/admin/sites/:siteId/reusable-sections/:sectionId`

Public reusable-section reads only return active sections for published sites and now emit Backy public contract headers, discovery cache headers, ETags, conditional 304 responses, and database-mode `content` cache revisions. Database-mode reusable-section create/update/delete mutations also record scoped content invalidation events. Each section keeps its normal canvas `content.elements` and `canvasSize`, so a custom frontend, generated frontend, or default Backy frontend can treat saved sections as reusable page-building templates without importing admin code. The manifest exposes `capabilities.reusableSections`, `endpoints.reusableSections`, `endpoints.reusableSectionDetail`, and `modules.reusableSections` with count/category/tag/item summaries. The OpenAPI export includes list/detail operations and `x-backy.reusableSectionIds`.

## Current font asset contract

Uploaded font files are stored as media with `type: "font"`. Admin media upload/update accepts font metadata keys `fontFamily`, `fontWeight`, `fontStyle`, `fontFallback`, and `fontDisplay`; the media page groups uploaded font files by family/variant and exposes fallback/display controls in the font registration form. The editor property panel can open the media picker directly from text styling controls to upload/select font assets for an element. Public media hides private fonts, while `/render` includes public registered fonts in `assets.fonts` with `weights`, `styles`, `fallbackStack`, `display`, and `cssFamily`. Backy's hosted page and blog renderers inject matching `@font-face` rules so element-level font choices render without custom frontend code.

Private media can now be delivered through a Backy-signed file URL. Admin integrations call `POST /api/admin/sites/:siteId/media/:mediaId/signed-url` to receive a temporary `/api/sites/:siteId/media/:mediaId/file?...` URL. The public file route serves private bytes only when the HMAC token, expiry, and disposition match; unsigned private file requests return `MEDIA_SIGNATURE_INVALID`. Public file URLs remain directly readable through the same route.

Admin media detail can replace the stored file for an existing media item with `POST /api/admin/sites/:siteId/media/:mediaId` while keeping the media id stable for custom frontends. Replacements retain prior file metadata under `metadata.replacementVersions`, count retained versions against quota usage, and emit `media.replace` audit events. Retained versions can be restored with `POST /api/admin/sites/:siteId/media/:mediaId/versions/:versionId`, which promotes the retained file back to current while retaining the displaced current file and emitting `media.version.restore`. Retained versions can be removed with `DELETE /api/admin/sites/:siteId/media/:mediaId/versions/:versionId`, which deletes the stored prior file when a storage path is recorded and emits `media.version.delete`.

Public image media can also be routed through `GET /api/sites/:siteId/media/:mediaId/transform?width=:width&quality=:quality`. Backy validates site ownership, public visibility, image type, and bounded width/quality parameters, then redirects to the Next image optimizer. Public media list/detail responses include a `responsive` manifest for public image assets with `src`, `srcSet`, `sizes`, and transform `variants`, so generated/custom frontends can render responsive images without hardcoding Backy width presets. Admin clients can persist prepared variant manifests with `POST /api/admin/sites/:siteId/media/:mediaId/transforms`; public media responses prefer those prepared widths/quality/sizes and include preparation metadata. Manifest/OpenAPI advertise the route, and the SDK exposes `mediaTransformUrl(...)` plus `BackyMediaAsset.responsive` typing.

Public media list/detail responses also normalize usage metadata for custom frontend workflows. Each asset now includes `references` with `backy.media.references.v1` page/post target lists, binding usage types, and binding records derived from admin media binding metadata, plus `referenceSummary` for quick counts. `editableMetadata` exposes the asset title/alt/caption/tags/folder/scope/visibility and original metadata under `backy.media.editable-metadata.v1`, so frontend builders can inspect the same fields they would present for editing while preserving the legacy top-level media fields.

## Current collection endpoints

Backy now exposes the first implementation-backed CMS collection surface:

- `GET /api/sites/:siteId/collections`
- `GET /api/sites/:siteId/collections/:collectionId`
- `GET /api/sites/:siteId/collections/:collectionId/records?slug=example`
- `GET /api/sites/:siteId/collections/:collectionId/records?q=term&fieldKey=title&fieldValue=example&sortBy=rank&sortDirection=desc`
- `POST /api/sites/:siteId/collections/:collectionId/records`
- `GET/POST/PATCH/DELETE /api/admin/sites/:siteId/collections`
- `GET/POST/PATCH/DELETE /api/admin/sites/:siteId/collections/:collectionId/records`
- `POST /api/admin/sites/:siteId/collections/:collectionId/records/bulk`
- `GET /api/admin/sites/:siteId/collections/:collectionId/records?format=csv`
- `POST /api/admin/sites/:siteId/collections/:collectionId/records/import?upsert=true`

These endpoints make collection schemas and records addressable by custom frontends. Public reads hide draft/private collections and unpublished records, and the public collection list/detail/record GET endpoints now emit Backy public contract headers, discovery cache headers, ETags, conditional 304 responses, and database-mode `content` cache revisions from collection/page/blog invalidation events. Field schemas include option metadata for `select` and `tags` fields, plus reference targets for `reference` and `multiReference` fields, so custom frontends can render precise controls instead of guessing. Record list endpoints support basic search, field-value filtering, sorting, limit, offset, and pagination metadata, and `/render` dataset hydration accepts the same query shape. Public record creation is guarded by each collection's `permissions.publicCreate`, validates submitted values against the collection schema, stores visitor-created records as `draft` for moderation before public reads can see them, and returns private/no-store contract responses. The admin record list endpoint can also export the filtered result set as CSV, the bulk endpoint can update selected record statuses or delete selected records, and the import endpoint validates CSV rows against the collection schema before creating or upserting records, including select/tag option validation. The admin `/collections` route now gives editors a backend-backed schema and record builder for these APIs, including public read/create permission controls, custom collection list and item route patterns, metadata-backed generated list/item template presets, field option/reference controls, record search/filter/sort/pagination/bulk controls, and CSV import/export, and the editor property panel can attach collection field bindings to selected canvas elements plus configure collection-backed repeaters with dataset, query, field mapping, and grid layout props. Collection dynamic list URLs resolve and render through each collection's `listRoutePattern`/`dynamicListRoutePattern`, while item URLs use `routePattern`/`dynamicRoutePattern`, after normal page and blog routes. Defaults are `/:collectionSlug` for lists and `/:collectionSlug/:recordSlug` for items. Generated list render payloads use `dynamicList` content documents and include a hydrated collection dataset for custom frontends and hosted rendering; generated item payloads remain `dynamicItem`. When no captured frontend-design collection template is attached, generated list/item renderers consume collection `metadata.dynamicTemplates` for list variant, item variant, field role selection, list limit, and detail-field selection. Page render payloads also support a `repeater` element contract: `props.collectionId`, `datasetId`, `limit`, `offset`, `sortBy`, `sortDirection`, and title/description/image field hints hydrate `props.records` plus a matching `dataBindings.datasets` entry, so custom/default frontends can render collection-backed lists without admin internals.

## Required payload shape

Backy should expose one public render payload:

```json
{
  "success": true,
  "requestId": "req_123",
  "data": {
    "site": {
      "id": "site_123",
      "slug": "demo",
      "name": "Demo Site",
      "locale": "en",
      "themeTokens": {}
    },
    "navigation": {
      "primary": [
        {
          "id": "nav_page_123",
          "type": "page",
          "pageId": "page_123",
          "label": "About",
          "title": "About",
          "slug": "about",
          "path": "/about",
          "status": "published",
          "isHomepage": false,
          "children": []
        }
      ]
    },
    "route": {
      "type": "page",
      "path": "/about",
      "status": "published",
      "canonical": "/about"
    },
    "content": {
      "schemaVersion": "backy.content.v1",
      "id": "page_123",
      "kind": "page",
      "elements": []
    },
    "assets": {
      "media": [],
      "fonts": []
    },
    "interactions": {
      "forms": [],
      "comments": []
    },
    "seo": {
      "title": "About",
      "description": "",
      "robots": {
        "index": true,
        "follow": true
      }
    },
    "editableMap": {}
  }
}
```

## Element control requirements

Every element in the content document should expose:

- stable `id`;
- `type`;
- optional `name`;
- `children`;
- layout values;
- responsive overrides;
- style token references and raw fallback styles;
- content fields with field IDs;
- asset references by ID, not only raw URLs;
- action definitions for links, forms, media controls, and custom events;
- accessibility fields such as labels, alt text, roles, and aria metadata;
- data bindings for dynamic collections;
- edit permissions for what Backy can modify.

## Editable map

The frontend should be able to tell Backy what a visible thing maps to. Example:

```json
{
  "headline.hero": {
    "elementId": "el_hero_title",
    "field": "props.content",
    "editable": true
  },
  "image.hero": {
    "elementId": "el_hero_image",
    "field": "props.assetId",
    "editable": true
  },
  "button.primary.color": {
    "elementId": "el_cta",
    "field": "styles.backgroundColor",
    "token": "color.primary",
    "editable": true
  }
}
```

This is how Backy can let an AI generate any frontend design while still controlling a single character, image, video, sound, button, theme color, font, spacing value, or interaction from the CMS.

## Machine-readable contract files

- `content-payload.schema.json`: public render payload envelope for any custom frontend.
- `frontend-manifest.schema.json`: site-level discovery/bootstrap document for generated/custom frontends.
- `theme-tokens.schema.json`: colors, typography, spacing, radii, shadows, motion, and breakpoints.
- `element-actions.schema.json`: route/link/form/media/custom actions attached to elements.
- `data-bindings.schema.json`: dataset queries and element field bindings for dynamic pages.
- `editable-map.schema.json`: maps visible frontend controls back to Backy-managed fields.
- `examples/page.json`: static page render payload.
- `examples/blog-post.json`: blog post payload with comments and featured media.
- `examples/dynamic-item-page.json`: collection-backed dynamic route payload.
- `examples/form-page.json`: form-enabled page payload.

These schemas are the current external target. Implementation can remain incremental, but custom frontends should not depend on fields outside this folder unless a newer contract version explicitly adds them.
