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
- `GET /api/sites/:identifier` (default public route in this repo)
- `GET /api/public/sites/:identifier` (optional external contract alias)
  - Resolve by `subdomain`, `siteId`, or `customDomain`.
  - Returns minimal site metadata and theme defaults.
  - Current implementation also supports `GET /api/sites?identifier=:identifier`.
  - Response uses `{ success, requestId, data: { site } }`; legacy top-level `site` remains for compatibility.
  - Draft/unpublished sites are hidden from public bootstrap.

- `GET /api/sites/:siteId/pages?path=/about`
- `GET /api/public/sites/:siteId/pages?path=/about` (optional alias)
  - Path-based page fetch for public rendering.
  - Must return only published content.
  - Draft access requires `previewToken` created by the admin preview endpoint for that exact page.

- `GET /api/sites/:siteId/render?path=/about`
- `GET /api/sites/:siteId/render?path=/blog/:slug`
- `GET /api/sites/:siteId/render?path=/:collectionSlug/:recordSlug`
- `GET /api/public/sites/:siteId/render?path=/about` (future stable alias)
  - Returns the external page/post/dynamic item render payload described by `specs/ai-frontend-contract/content-payload.schema.json`.
  - Includes site bootstrap, route, canonical content document, assets, forms/comments/actions, SEO, data bindings, and editable map.
  - Current data bindings include normalized collection dataset manifests, resolved public collection fields/records, and element binding metadata when canvas elements declare collection `dataBindings`.
  - Collection dynamic item paths currently resolve after normal pages and blog posts using `/:collectionSlug/:recordSlug`, and return a generated `dynamicItem` content document backed by the selected public record.
  - Current implementation is backed by the public seed adapter; production implementation must use the durable service layer.
  - Draft render access requires `previewToken` created by the admin preview endpoint for that exact page or post.

- `GET /api/sites/:siteId/resolve?path=/about`
- `GET /api/public/sites/:siteId/resolve?path=/about` (future stable alias)
  - Resolves a public path to a page, blog post, or collection dynamic item without requiring the frontend to know Backy's route internals.
  - Returns `{ success, requestId, data: { site, route, navigation } }` when resolved.
  - Page routes include `resource.kind: "page"` plus page API and render URLs.
  - Blog post routes under `/blog/:slug` include `resource.kind: "post"` plus post API and hosted path.
  - Collection dynamic item routes under `/:collectionSlug/:recordSlug` include `resource.kind: "dynamicItem"`, collection metadata, record id/slug, public records API URL, render URL, and hosted path.
  - Draft and future scheduled content stays hidden unless the exact preview token is supplied.
  - Unresolved paths return `404` with `ROUTE_NOT_FOUND`.

- `GET /api/sites/:siteId/blog/posts?status=published&limit=&cursor=`
- `GET /api/public/sites/:siteId/blog/posts?status=published&limit=&cursor=` (optional alias)
  - Published posts list with canonical URLs.

- `GET /api/sites/:siteId/blog/posts/:slug`
- `GET /api/public/sites/:siteId/blog/posts/:slug` (optional alias)
  - Published post detail by slug.
  - Draft post detail access requires `previewToken` created by the admin preview endpoint for that exact post.

- `GET /api/sites/:siteId/media`
  - Public media catalog for custom frontends.
  - Current implementation only returns `visibility=public` catalog items, even if a caller asks for private media.
  - Supports `type`, `scope`, `pageId`, `postId`, `q`/`search`, `tag`, `folderId`, `limit`, and `offset` filters.

- `GET /api/sites/:siteId/navigation`
  - Public navigation contract for external frontends.
  - Returns `{ success, requestId, data: { site, navigation: { primary } } }`.
  - Navigation items include page id, label/title, slug, canonical path, status, homepage flag, and child arrays.
  - Current implementation derives primary navigation from publishable pages in the runtime content adapter. Production completion still needs editable menus, nested page hierarchy, redirects, locale-aware paths, and custom/external links.

- `GET /api/sites/:siteId/collections`
- `GET /api/sites/:siteId/collections/:collectionId`
- `GET /api/sites/:siteId/collections/:collectionId/records?slug=:slug&limit=&offset=`
- `GET /api/sites/:siteId/collections/:collectionId/records?q=&fieldKey=&fieldValue=&sortBy=&sortDirection=asc|desc&limit=&offset=`
  - Public CMS collection contract for custom frontends and future dataset bindings.
  - Returns only collections with `status: "published"` and `permissions.publicRead: true`.
  - Returns only published records or scheduled records whose `scheduledAt` has passed.
  - Supports basic record search, field-value filtering, sorting, limit, and offset in both public and admin record list endpoints. `/render` dataset hydration accepts the same query fields.
  - Admin record lists also support `GET /api/admin/sites/:siteId/collections/:collectionId/records?format=csv` with the same filters for backend-backed CSV export.
  - Admin collection records support `POST /api/admin/sites/:siteId/collections/:collectionId/records/import?upsert=true` for backend-validated CSV import.
  - Current implementation is backed by the same runtime JSON adapter as admin content. `/render` now surfaces dataset, binding, field, and record manifests for collection-bound elements and generated dynamic item pages, but production completion still needs DB-backed indexes, custom dynamic route templates, and authenticated visitor-write policies.

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
  - Body: form values map + optional hidden metadata.
  - Response: submission id, status, optional message, or detailed validation errors.

- `POST /api/sites/:siteId/pages/:pageId/comments`
- `POST /api/public/sites/:siteId/pages/:pageId/comments` (optional alias)
  - Body: comment + optional parentId + optional identity fields.

- `GET /api/sites/:siteId/pages/:pageId/comments?status=approved&limit=&cursor=`
- `GET /api/public/sites/:siteId/pages/:pageId/comments` (optional alias)
  - Returns approved comments and count metadata.

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

- `PATCH /api/admin/sites/:siteId`
  - Body supports partial site settings updates: `name`, `slug`, `description`, `customDomain`, `status`, `isPublished`, `theme`.

- `DELETE /api/admin/sites/:siteId`
  - Deletes the site and cascades local page/post records in the current runtime adapter.

### 3.2 Pages
- `GET /api/admin/sites/:siteId/pages?includeUnpublished=true`
  - Current implementation returns page summaries without content.

- `POST /api/admin/sites/:siteId/pages`
  - Body: `{ title, slug?, description?, status?, isHomepage?, content?, meta?, forms?, scheduledAt? }`
  - Validates required title, slug format, and per-site slug conflicts.

- `GET /api/admin/sites/:siteId/pages/:pageId`
  - Returns full editable page payload including canvas content.

- `PATCH /api/admin/sites/:siteId/pages/:pageId`
  - Body supports partial updates for title, slug, description, status, homepage flag, canvas content, SEO meta, forms, and schedule.

- `DELETE /api/admin/sites/:siteId/pages/:pageId`
  - Deletes the page from the runtime adapter.

Current sites/pages admin endpoints are intentionally local file-backed. Production completion still requires authenticated database persistence, RBAC, preview tokens, cache invalidation, workflow audit events, and contract tests.

### 3.3 Media
- `POST /api/admin/sites/:siteId/media`
  - multipart upload
  - query/body flags: `scope` (`global|page|post`), `scopeTargetId`, `visibility`
  - current implementation accepts `file`, `altText`, `caption`, `tags`, `uploadedBy`, plus `fontFamily`, `fontWeight`, and `fontStyle` for font uploads
  - validates image/video/audio/document/font MIME categories and writes local assets under `/public/uploads/sites/:siteId/...`
  - returns `{ success, requestId, data: { media } }`

- `GET /api/admin/sites/:siteId/media`
  - filters: `scope`, `visibility`, `search`, `type`, `tag`, `page`, `perPage`
  - current implementation supports `scope`, `visibility`, `type`, `search`, `tag`, `folderId`, `pageId`, `postId`, `limit`, `offset`

- `GET /api/admin/sites/:siteId/media/folders`
  - Current implementation lists local runtime media folders.

- `POST /api/admin/sites/:siteId/media/folders`
  - Body: `{ name, parentId?, sortOrder? }`
  - Creates a local runtime media folder.

- `PATCH /api/admin/sites/:siteId/media/folders/:folderId`
  - Updates local runtime folder name, parent, and sort order.

- `DELETE /api/admin/sites/:siteId/media/folders/:folderId`
  - Deletes a local runtime folder and moves contained media back to root.

- `PATCH /api/admin/sites/:siteId/media/:mediaId`
  - Current implementation updates original name, folder, tags, alt text, caption, scope, scope target, visibility, page/post references, and metadata in the local runtime catalog.
  - Font media metadata can register `fontFamily`, `fontWeight`, and `fontStyle`; `/render` exposes public font media in `assets.fonts`, and hosted page/post rendering injects matching `@font-face` rules.

- `DELETE /api/admin/sites/:siteId/media/:mediaId`
  - Current implementation deletes the catalog record and removes local uploaded files under `/public/uploads/sites/:siteId/...` when present.

- `POST /api/admin/sites/:siteId/media/:mediaId/bind`
  - bind/unbind to page/post contexts.
  - Current implementation does not expose this dedicated route yet; page/post create, update, rollback, and delete paths now sync `pageIds`/`postIds` from saved content `mediaId`/`assetId` references and featured media.

### 3.4 Forms
- `POST /api/admin/sites/:siteId/forms`
- `GET /api/admin/sites/:siteId/forms`
- `GET /api/admin/sites/:siteId/forms/:formId`
- `PATCH /api/admin/sites/:siteId/forms/:formId`
- `POST /api/admin/sites/:siteId/forms/:formId/clone`
- `GET /api/admin/sites/:siteId/forms/:formId/submissions`
- `POST /api/admin/sites/:siteId/forms/:formId/submissions/:submissionId/review`
  - status transitions `pending|approved|rejected|spam`

### 3.5 Comments
- `GET /api/admin/sites/:siteId/comments?targetType=page|post&status=`
- `PATCH /api/admin/sites/:siteId/comments/:commentId`
- `POST /api/admin/sites/:siteId/comments/:commentId/block-user`

### 3.6 Blog
- `GET /api/admin/sites/:siteId/blog?status=&limit=&offset=`
  - Current implementation returns `{ success, requestId, data: { posts, pagination } }` and includes unpublished posts for admin use.

- `POST /api/admin/sites/:siteId/blog`
  - Body: `{ title, slug?, excerpt?, status?, content?, meta?, featuredImageId?, authorId?, categoryIds?, tagIds?, scheduledAt? }`
  - Validates required title, slug format, and per-site slug conflicts.

- `GET /api/admin/sites/:siteId/blog/:postId`
  - Returns full editable post payload.

- `PATCH /api/admin/sites/:siteId/blog/:postId`
  - Body supports partial updates for title, slug, excerpt, status, content, SEO meta, featured image, author, categories, tags, and schedule.

- `DELETE /api/admin/sites/:siteId/blog/:postId`
  - Deletes the post from the runtime adapter.

Current blog admin endpoints are local file-backed through `data/backy/admin-content.json`. Production completion still requires authenticated database persistence, RBAC, author/category/tag APIs, preview tokens, cache invalidation, workflow audit events, and contract tests.

### 3.7 Publish and revisions
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
  - Current local runtime stores preview tokens in `data/backy/admin-content.json`; production should bind tokens to authenticated actors, audit creation, and invalidate on policy changes.

- `GET /api/admin/sites/:siteId/blog/:postId/revisions`
  - Returns local revision history for the post with pagination metadata.

- `POST /api/admin/sites/:siteId/blog/:postId/publish`
  - Publishes the post, clears scheduled state, sets `publishedAt`, and stores a rollback snapshot.

- `POST /api/admin/sites/:siteId/blog/:postId/archive`
  - Archives the post, clears scheduled state, marks it `noIndex`, and stores a rollback snapshot.

- `POST /api/admin/sites/:siteId/blog/:postId/rollback`
  - Body: `{ revisionId }`
  - Restores a previous post snapshot and stores a rollback snapshot of the current state.

- `POST /api/admin/sites/:siteId/blog/:postId/preview`
  - Body: `{ ttlSeconds? }`
  - Creates a bounded preview token and returns draft-capable `hostedUrl` and `postApiUrl`.

- `POST /api/admin/sites/:siteId/pages/:pageId/resolve-conflict`
  - Future workflow endpoint for merge/conflict resolution once collaborative editing is implemented.

---

## 4) Canonical contracts and bindings
- `MediaItem.scope` = `global|page|post`
- `MediaItem.scopeTargetId` = pageId/postId for scoped assets
- `MediaItem.visibility` = `public|private`
- Public media APIs must expose only `visibility=public` items. Private media requires authenticated/signed delivery before it can be considered complete.
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
  1. Resolve site: `GET /api/sites/:identifier`.
  2. Resolve path on route changes: `GET /api/sites/:siteId/resolve?path=/...`.
  3. Fetch page, blog post, or collection dynamic item render payloads: `GET /api/sites/:siteId/render?path=/...`.
  4. If route resolves to a blog post and a custom archive UI is needed, call blog listing/detail APIs.
  5. If elements bind to structured content, inspect `dataBindings.datasets` from the render payload. Record-bound, slug-bound, searched, filtered, and sorted datasets include resolved public records; fetch additional records through `GET /api/sites/:siteId/collections/:collectionId/records` when the frontend needs more than the payload provided.
  6. Render from `content` + `theme` + `meta` only; ignore admin-only flags.
  7. Submit interactive blocks using:
     - `POST /api/sites/:siteId/forms/:formId/submissions`
     - `POST /api/sites/:siteId/pages/:pageId/comments`
- CORS policy for custom frontends:
  - allow exact frontend origin(s),
  - send `requestId` for debug parity.

---

## 7) Migration-safe policy
- Additive schema changes first (new optional fields, new endpoints with fallbacks).
- Backward compatibility window: 2 minor versions.
- No frontend breakage from internal admin fields being added.
