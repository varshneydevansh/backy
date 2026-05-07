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

- `GET /api/sites/:siteId/pages?path=/about`
- `GET /api/public/sites/:siteId/pages?path=/about` (optional alias)
  - Path-based page fetch for public rendering.
  - Must return only published content.

- `GET /api/sites/:siteId/render?path=/about`
- `GET /api/public/sites/:siteId/render?path=/about` (future stable alias)
  - Returns the external render payload described by `specs/ai-frontend-contract/content-payload.schema.json`.
  - Includes site bootstrap, route, canonical content document, assets, forms/comments/actions, SEO, data bindings, and editable map.
  - Current implementation is backed by the public seed adapter; production implementation must use the durable service layer.

- `GET /api/sites/:siteId/blog/posts?status=published&limit=&cursor=`
- `GET /api/public/sites/:siteId/blog/posts?status=published&limit=&cursor=` (optional alias)
  - Published posts list with canonical URLs.

- `GET /api/sites/:siteId/blog/posts/:slug`
- `GET /api/public/sites/:siteId/blog/posts/:slug` (optional alias)
  - Published post detail by slug.

### 2.2 Render payload
Public page payload should include:
- `content` in shared editor schema
- `themeTokens`
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
  - current implementation accepts `file`, `altText`, `caption`, `tags`, `uploadedBy`
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

- `GET /api/admin/sites/:siteId/blog/:postId/revisions`
  - Returns local revision history for the post with pagination metadata.

- `POST /api/admin/sites/:siteId/blog/:postId/publish`
  - Publishes the post, clears scheduled state, sets `publishedAt`, and stores a rollback snapshot.

- `POST /api/admin/sites/:siteId/blog/:postId/archive`
  - Archives the post, clears scheduled state, marks it `noIndex`, and stores a rollback snapshot.

- `POST /api/admin/sites/:siteId/blog/:postId/rollback`
  - Body: `{ revisionId }`
  - Restores a previous post snapshot and stores a rollback snapshot of the current state.

- `POST /api/admin/sites/:siteId/pages/:pageId/resolve-conflict`
  - Future workflow endpoint for merge/conflict resolution once collaborative editing is implemented.

---

## 4) Canonical contracts and bindings
- `MediaItem.scope` = `global|page|post`
- `MediaItem.scopeTargetId` = pageId/postId for scoped assets
- `MediaItem.visibility` = `public|private`
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
  2. Fetch page on route changes: `GET /api/sites/:siteId/pages?path=/...`.
  3. If route matches blog path, call blog listing/detail APIs.
  4. Render from `content` + `theme` + `meta` only; ignore admin-only flags.
  5. Submit interactive blocks using:
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
