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

### 3.1 Media
- `POST /api/admin/sites/:siteId/media`
  - multipart upload
  - query/body flags: `scope` (`global|page|post`), `scopeTargetId`, `visibility`

- `GET /api/admin/sites/:siteId/media`
  - filters: `scope`, `visibility`, `search`, `type`, `tag`, `page`, `perPage`

- `PATCH /api/admin/sites/:siteId/media/:mediaId`
  - Update metadata (alt, caption, tags, visibility)

- `POST /api/admin/sites/:siteId/media/:mediaId/bind`
  - bind/unbind to page/post contexts.

### 3.2 Forms
- `POST /api/admin/sites/:siteId/forms`
- `GET /api/admin/sites/:siteId/forms`
- `GET /api/admin/sites/:siteId/forms/:formId`
- `PATCH /api/admin/sites/:siteId/forms/:formId`
- `POST /api/admin/sites/:siteId/forms/:formId/clone`
- `GET /api/admin/sites/:siteId/forms/:formId/submissions`
- `POST /api/admin/sites/:siteId/forms/:formId/submissions/:submissionId/review`
  - status transitions `pending|approved|rejected|spam`

### 3.3 Comments
- `GET /api/admin/sites/:siteId/comments?targetType=page|post&status=`
- `PATCH /api/admin/sites/:siteId/comments/:commentId`
- `POST /api/admin/sites/:siteId/comments/:commentId/block-user`

### 3.4 Pages and blog
- `GET /api/admin/sites/:siteId/pages`
- `GET /api/admin/sites/:siteId/pages/:pageId`
- `POST /api/admin/sites/:siteId/pages`
- `PATCH /api/admin/sites/:siteId/pages/:pageId`
- `POST /api/admin/sites/:siteId/pages/:pageId/publish`
- `POST /api/admin/sites/:siteId/pages/:pageId/archive`
- `POST /api/admin/sites/:siteId/pages/:pageId/rollback`
- `POST /api/admin/sites/:siteId/pages/:pageId/resolve-conflict`

- Blog equivalents: `/blogs`, `/blogs/:postId`, `/blogs/:postId/publish`, `/blogs/:postId/archive`, `/blogs/:postId/rollback`

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
