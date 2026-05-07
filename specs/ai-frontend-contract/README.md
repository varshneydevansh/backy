# Backy AI Frontend Contract

Date: 2026-05-07
Status: starter contract area with machine-readable schemas

This folder is the canonical place an AI or external developer should read before building a frontend that consumes Backy.

The rule is simple: a custom frontend can look completely different from the Backy admin UI, but every rendered page, post, asset, form, comment, token, and interaction must map back to Backy public contracts.

## Allowed assumptions

- Do not import from `apps/admin`.
- Do not depend on admin localStorage, admin mock stores, or editor-only components.
- Consume public APIs, public SDKs, or generated JSON payloads only.
- Treat Backy as the source of truth for content, assets, SEO, theme tokens, and interaction endpoints.
- Render design however the frontend wants, as long as Backy-managed fields remain addressable.

## Public bootstrap flow

1. Resolve the site.
   - `GET /api/sites?identifier=:identifier`
   - `GET /api/sites/:siteId/manifest`
   - Future stable form: `GET /api/public/sites/:identifier`
   - The manifest endpoint is the current WordPress-style discovery surface for generated/custom frontends. It returns the site theme, schema references, capability flags, route patterns, endpoint URLs, navigation, page/blog/collection/form/media module summaries, and public collection/form write metadata in one envelope.

2. Resolve a route.
   - `GET /api/sites/:siteId/resolve?path=/about`
   - `GET /api/sites/:siteId/pages?slug=:path`
   - `GET /api/sites/:siteId/render?path=/about`
   - Future stable form: `GET /api/public/sites/:siteId/resolve?path=/about`
   - Public route resolution returns published content and scheduled content only after `scheduledAt` has passed. Drafts and future scheduled content require a valid preview token.

3. Fetch supporting data.
   - media: `GET /api/sites/:siteId/media`
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

4. Submit interactions.
   - forms: `POST /api/sites/:siteId/forms/:formId/submissions`
   - page comments: `POST /api/sites/:siteId/pages/:pageId/comments`
   - blog comments: `POST /api/sites/:siteId/blog/:postId/comments`

Canvas-authored forms can now declare a collection write target in their form props. When `collectionTarget.enabled` is true and the target collection is published with `permissions.publicCreate`, accepted public submissions validate against the collection schema and create draft collection records for moderation. The submission response includes `collectionRecord` when the write succeeds and `collectionRecordErrors` when the submission was stored but the collection write could not be completed. Submission list payloads retain a lightweight collection-record link so admin tools can deep-link from a form submission to the generated draft record.

## Current render payload endpoint

The first implementation-backed endpoint is:

- `GET /api/sites/:siteId/render?path=/about`
- `GET /api/sites/:siteId/render?path=/blog/example-post`
- `GET /api/sites/:siteId/render?path=/team/ada-lovelace`

It returns the `content-payload.schema.json` shape for pages, blog posts, and collection dynamic item routes from the current public data adapter. This is not yet the final durable database-backed service, but it gives external frontends and AI-generated frontends a stable payload target while Backy replaces seeded/mock persistence.

`npm run test:admin-contract --workspace @backy/public` validates the page, blog post, collection-bound page, and collection dynamic item render responses against `content-payload.schema.json` so contract drift is caught during the public API smoke pass. The same smoke verifies that `/render` exposes the dataset manifest, resolved collection fields/records, normalized element binding, collection-record editable map entry, and uploaded public font asset manifests.

Published render responses now include short public cache headers, ETags with `If-None-Match` 304 support, plus `x-backy-contract-version`, `x-backy-schema-version`, `x-backy-request-id`, and `x-backy-site-id` so custom frontends can safely key caches and diagnostics. Preview-token render responses and error envelopes are `no-store`.

## Current frontend manifest endpoint

Backy exposes a site-level discovery endpoint:

- `GET /api/sites/:siteId/manifest`

It returns `frontend-manifest.schema.json` and gives custom frontends a single bootstrap document for site identity, theme tokens, public endpoint URLs, route patterns, module capabilities, navigation, page/blog/collection/reusable-section/form/media summaries, collection field schemas, form submit URLs, and form-to-collection targets. This mirrors the role of REST discovery in a WordPress-like frontend integration while keeping Backy's render payload as the page/post/item-specific contract.

The manifest advertises a site-scoped OpenAPI export at `GET /api/sites/:siteId/openapi`. That document describes the current public discovery, route resolution, render, navigation, media, collection, reusable-section, form, comment, report, contact, and interaction-event operations for the selected site and includes Backy-specific vendor metadata for available collection, reusable-section, and form ids. Manifest `endpoints` also include template URLs for reusable section detail, form detail/submissions/contacts, page/blog comments, comment reports, and interaction events so generated frontends do not have to hardcode Backy route shapes.

Published manifest and OpenAPI responses include short public discovery cache headers, ETags with `If-None-Match` 304 support, plus the same Backy contract/request/site headers. Draft/hidden discovery responses are `no-store`.

## Current SEO discovery endpoint

Backy exposes route-level SEO metadata for custom and default frontends:

- `GET /api/sites/:siteId/seo`
- `GET /api/sites/:siteId/seo?format=sitemap`
- `GET /api/sites/:siteId/seo?format=robots`

The JSON response lists publishable page, blog post, and dynamic collection item routes with canonical paths, title, description, robots flags, Open Graph basics, keywords, sitemap priority, change frequency, and update timestamps. `format=sitemap` emits sitemap XML from the same route index, and `format=robots` emits a minimal robots text response that points at the sitemap mode. Hosted Backy sites also expose crawlable `/sites/:siteSlug/sitemap.xml` and `/sites/:siteSlug/robots.txt` routes using the same route index. The manifest advertises `capabilities.seoDiscovery`, `endpoints.seo`, `endpoints.sitemap`, and `endpoints.robots`; the OpenAPI export includes the SEO operation.

## JavaScript SDK starter

`packages/sdk-js` provides the current TypeScript client for custom frontends. It uses only public Backy APIs and exposes helpers for site discovery, manifest/OpenAPI bootstrap, route resolution, render payloads, SEO discovery, navigation, media, collections/records, reusable sections, forms/submissions/contacts, comments/reports, and interaction events. Its exported types now cover the main public contract objects (`BackyRenderPayload`, content documents/elements, SEO routes, media/font assets, collection schemas/records, reusable sections, form submissions/contacts, comments, events, response metadata, and conditional 304 results) so frontends can consume Backy with stronger compile-time guarantees. `manifestCached`, `openapiCached`, and `renderCached` expose cache/contract headers and send `If-None-Match` when an ETag is provided, letting custom frontends reuse cached discovery/render payloads without dropping to raw `fetch`. The smoke command `npm run test:smoke --workspace @backy/sdk-js` validates read flows, SDK ETag/304 helpers, SEO discovery, reusable-section reads, and SDK public writes for collection records, form submissions, form contacts, page comments, comment moderation, comment reports, and interaction events against a temporary site, building confidence that a frontend can consume the public API surface without importing admin/editor code.

## Current reusable section endpoints

Backy now exposes active saved editor sections as public frontend templates:

- `GET /api/sites/:siteId/reusable-sections`
- `GET /api/sites/:siteId/reusable-sections/:sectionId`
- `GET /api/admin/sites/:siteId/reusable-sections`
- `POST /api/admin/sites/:siteId/reusable-sections`
- `GET/PATCH/DELETE /api/admin/sites/:siteId/reusable-sections/:sectionId`

Public reusable-section reads only return active sections for published sites. Each section keeps its normal canvas `content.elements` and `canvasSize`, so a custom frontend, generated frontend, or default Backy frontend can treat saved sections as reusable page-building templates without importing admin code. The manifest exposes `capabilities.reusableSections`, `endpoints.reusableSections`, `endpoints.reusableSectionDetail`, and `modules.reusableSections` with count/category/tag/item summaries. The OpenAPI export includes list/detail operations and `x-backy.reusableSectionIds`.

## Current font asset contract

Uploaded font files are stored as media with `type: "font"`. Admin media upload/update accepts font metadata keys `fontFamily`, `fontWeight`, and `fontStyle`; public media hides private fonts, while `/render` includes public registered fonts in `assets.fonts`. Backy's hosted page and blog renderers inject matching `@font-face` rules so element-level font choices render without custom frontend code.

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

These endpoints make collection schemas and records addressable by custom frontends. Public reads hide draft/private collections and unpublished records. Field schemas include option metadata for `select` and `tags` fields, plus reference targets for `reference` and `multiReference` fields, so custom frontends can render precise controls instead of guessing. Record list endpoints support basic search, field-value filtering, sorting, limit, offset, and pagination metadata, and `/render` dataset hydration accepts the same query shape. Public record creation is guarded by each collection's `permissions.publicCreate`, validates submitted values against the collection schema, and stores visitor-created records as `draft` for moderation before public reads can see them. The admin record list endpoint can also export the filtered result set as CSV, the bulk endpoint can update selected record statuses or delete selected records, and the import endpoint validates CSV rows against the collection schema before creating or upserting records, including select/tag option validation. The admin `/collections` route now gives editors a backend-backed schema and record builder for these APIs, including public read/create permission controls, field option/reference controls, record search/filter/sort/pagination/bulk controls, and CSV import/export, and the editor property panel can attach basic collection field bindings to selected canvas elements. Collection dynamic item URLs now resolve and render at `/:collectionSlug/:recordSlug` after normal page and blog routes. When page, post, or generated dynamic item elements declare collection `dataBindings`, `/render` exposes normalized dataset manifests, collection field schemas with option/reference metadata, resolved public records, binding metadata, and server-resolved element prop values for custom frontends and Backy's hosted renderer. Dynamic list templates, custom item URL rules, and richer dataset repeater UI still need to be completed.

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
