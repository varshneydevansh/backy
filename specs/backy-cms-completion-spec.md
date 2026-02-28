# Backy Completion Specification (Master Spec)

**Project**: `backy`
**Date**: 2026-02-24
**Scope**: Complete, non-fragmented CMS backend + editor + public consumption stack (Wix/WordPress-style)

## 1) Purpose
Backy should be a production-oriented, open-source backend that enables:
- Full website construction through drag-and-drop page editor.
- API-first CMS APIs for any external frontend.
- Multi-page, multi-slug sites with published/unpublished states.
- Media, theme, SEO, users, roles, and deployment-safe public rendering.

## 1.1 Canonical parity roadmap
The working implementation roadmap is maintained in:
- [specs/backy-wix-canva-cms-v1-roadmap.md](specs/backy-wix-canva-cms-v1-roadmap.md)

**Authoritative phase status and roadmap:**
- [specs/phase-docs/backy-headless-cms-platform-phase-roadmap-v1.md](specs/phase-docs/backy-headless-cms-platform-phase-roadmap-v1.md)
- [specs/phase-docs/backy-headless-cms-platform-phase-roadmap-v2.md](specs/phase-docs/backy-headless-cms-platform-phase-roadmap-v2.md)
- [specs/backy-full-parity-roadmap-spec.md](specs/backy-full-parity-roadmap-spec.md)
- [specs/phase-docs/backy-phase-a-j-completion-spec.md](specs/phase-docs/backy-phase-a-j-completion-spec.md)
- [specs/phase-docs/backy-alpha-vs-numeric-phase-progress-2026-02-27.md](specs/phase-docs/backy-alpha-vs-numeric-phase-progress-2026-02-27.md)

## 1.2 Phase A/B/C status snapshot (2026-02-27)
- **Phase A:** partial completion.
  - Done: contracts hardened for form/comment payloads, comment anti-abuse policy shape added, public auth bridge.
  - Open: admin/public store boundary hardening, and route-level RBAC migration.
  - Update: route/session guard now uses selector-backed auth capability gates (`canEdit`, `canAdminister`) and admin-only navigation items are hidden from non-admin roles.
- **Phase B:** in-progress completion.
  - Done: selection and interaction improvements, render stability, property panel upgrades.
  - Done: undo/redo completion, copy/duplicate/delete determinism, save/publish/reload persistence flow hardening, and read-only editor action gating.
  - Latest close-out: duplicate placement is now deterministic sibling insertion; page save fallback uses editor canvas size instead of stale initial.
  - Open: nested multi-select command stack cases and full revision graph integration.
  - In this pass: move/resize history commits now occur on interaction end for deterministic undo/redo while keeping live drags responsive.
  - Latest pass: read-only editor gating now blocks mutation actions in non-editor roles.
- **Phase C:** complete for parity-grade comment moderation.
  - Done: form/comment compatibility, moderation status updates, comment blocklist CRUD, report reason APIs, analytics/report/export parity, and strict anti-abuse policy validation.
  - In progress: finalize operator-only anti-abuse preset ergonomics and large-scope moderation safety UX.
  - Progress in this pass: status/thread/request/parent filtering is aligned across list/export/analytics/block views; JSX parser errors in moderation view have been resolved; route-level admin write gates were added for non-edit roles; and policy validation errors now flow to admin UI.
- **Custom frontend target:** `backy-public` is the contract boundary for replacement UI surfaces; custom frontends should never require admin internals.

The goal is parity with “Wix-like editor + WordPress-like content model” for self-hosted or Vercel-hosted backends.

---

## 2) Source-of-Truth (Non-duplicated architecture)

### 2.1 Canonical data contracts
- **Create one shared editor/content contract** in `packages/core/src/types/index.ts` and use it from both admin and public.
- Remove duplicate element typing by consolidating in one `ElementSchema` + `SiteConfigSchema`.
- Shared renderer contract must be consumed by:
  - `apps/admin/src/components/editor/*`
  - `apps/public/src/components/PageRenderer.tsx`

### 2.2 Shared packages used by both apps
- Use package boundaries consistently:
  - `@backy-cms/core` → types + validation + contracts + pure helpers
  - `@backy-cms/database` → query layer for sites/pages/media/users/settings
  - `@backy-cms/auth` → auth/session/jwt/middleware/roles

### 2.3 Avoid repeated logic principle
- One page/slug service function.
- One media service (upload, list, signed URLs, transform metadata).
- One publishing/versioning service.
- One route-matching function for `subdomain + path -> page`.
- One theme/style compiler pipeline (fonts/colors/spacing tokens -> css vars).

---

## 3) Current completeness matrix (Admin + Public)

Legend:
- ✅ done/working
- ⚠️ partial/broken or placeholder
- ❌ missing/not implemented

### 3.1 Admin routes (T3A)

#### `/` (`apps/admin/src/routes/index.tsx`)
- ✅ Dashboard scaffold present
- ✅ Top-level layout shell and navigation
- ⚠️ Stats and quick actions are UI-only or static in places
- ❌ No real site activity metrics from backend (views, publish counts, edits)
- ❌ No onboarding/quick-start checklist

#### `/login` (`apps/admin/src/routes/login.tsx`)
- ✅ login UI
- ⚠️ local role handling in store exists
- ❌ No session-backed authentication middleware for protected routes
- ❌ No login/logout error state coverage or token refresh flow

#### `/sites` (`sites.tsx`)
- ✅ list/create site UI surface
- ⚠️ list and create actions work with local store only
- ❌ Site creation/publish domain/plan limits/slug uniqueness not persisted
- ❌ No multi-tenant site ownership and role checks

#### `/sites.new` (`sites.new.tsx`)
- ✅ form UI for site creation
- ⚠️ draft creation flow only
- ❌ API-backed validation and rollback handling

#### `/sites/$siteId` (`sites.$siteId.tsx`)
- ✅ details view shell and links to pages/media
- ⚠️ route exists but reads mock data model
- ❌ real page/site association, status controls, domain settings, theme assignments missing

#### `/pages` (`pages.tsx`)
- ✅ table/list scaffold and “New page” navigation
- ⚠️ filtering/search UX minimal
- ❌ backend pagination, statuses, last modified, page template assignment, slug validation missing

#### `/pages.new` (`pages.new.tsx`)
- ✅ create page form shell
- ⚠️ limited validation
- ❌ publish workflow, template cloning, per-page settings defaults

#### `/pages/$pageId/edit` (`pages.$pageId.edit.tsx`)
- ✅ drag/drop editor shell
- ✅ layer selection/resizing/move/history controls exist in code path
- ⚠️ save/versioning persistence mostly absent
- ⚠️ responsive preview is not coupled to true breakpoint styles
- ⚠️ not fully integrated with global media/theme/font registries
- ❌ publish action, autosave, conflict handling (draft edit lock), audit trail missing

#### `/blog` (`blog.tsx`)
- ✅ blog index/editor entry point
- ⚠️ list UI partial
- ❌ slug generation policy, status/state machine, SEO fields, author metadata incomplete

#### `/blog.new` (`blog.new.tsx`)
- ✅ rich form/editor scaffold
- ⚠️ fields stored in editor-local model only
- ❌ no publication pipeline and no category/tag relations

#### `/blog.$postId` (`blog.$postId.tsx`)
- ✅ editor+canvas for article-like content
- ⚠️ no revision graph and relation-based publish flow
- ❌ scheduled publish + author/team attribution + comment options

#### Editor interaction parity (active sprint)
- ✅ media picker now passes page/post context into the property panel and media uploads
- ✅ form property panel now supports submit URL, HTTP method, success message/redirect, and honeypot toggle
- ✅ rich text inline toolbar is enabled during edit and portal container is mounted in property panel
- ✅ list markdown shortcuts for `-`, `*`, `+`, `1.` and list-specific Enter/Tab handling are now wired in editor key handling
- ✅ active text editor registration now persists only for editable blocks, preventing toolbar target flicker from read-only fields
- ✅ rich-text quick actions (format/alignment/list/emoji) now consistently target the active editable text block
- ⚠️ Right-side text property pane still misses full parity for selected text ranges (e.g., mixed font family/size/color updates, inline link targets, and emoji insertion context)
- ✅ selection boundary hit-testing improved for canvas elements by using pointer-capture selection and resize-handle exclusion (keeps dragging/selection reliable while preserving edit targets)
- ✅ non-preview interaction safety pass added: button/link/input/video/embed/map now pass pointer events to wrapper so element selection/dragging is not blocked by child widgets
- ✅ list editing now supports marker-level control (`disc`, `circle`, `square`, `decimal`, alpha, roman) from list content panel and renderer
- ⚠️ remaining parity targets: table/map embed behavior, comment blocks, shared status/action UX, and advanced list nesting behavior (indent/outdent stability at deep levels)

#### `/media` (`media.tsx`)
- ✅ media browser cards/list UI
- ⚠️ upload input is present but not connected end-to-end to stable storage contract
- ❌ file upload, MIME checks, per-site quota, CDN pathing, transform variants missing

#### `/users` (`users.tsx`)
- ✅ list users UI
- ⚠️ static/partial role UI
- ❌ RBAC persistence and invite/invite expiring tokens absent

#### `/users.new` (`users.new.tsx`)
- ✅ create user form
- ⚠️ no invite token or password policy checks
- ❌ real provisioning workflow missing

#### `/users.$userId` (`users.$userId.tsx`)
- ✅ edit-profile shell
- ⚠️ role and permissions editing only partial
- ❌ audit activity/last-login/devices and team role scope mapping absent

#### `/settings` (`settings.tsx`)
- ✅ base admin config shell
- ⚠️ few controls are placeholders
- ❌ site-level global defaults (theme, defaults, security headers, SMTP, analytics IDs) missing

### 3.2 Public routes

#### `/` (`apps/public/src/app/page.tsx`)
- ✅ basic landing shell
- ⚠️ mostly static guidance UI and placeholders
- ❌ no dynamic discovery of public sites from DB/API

#### `/sites/[subdomain]/[[...path]]` (`apps/public/src/app/sites/[subdomain]/[[...path]]/page.tsx`)
- ⚠️ dynamic route exists but uses TODO stubs (`getSite/getPage`)
- ❌ no real slug resolution, 404/301 behavior, or unpublished content guard
- ⚠️ no canonical URL behavior for trailing slash/empty path
- ❌ no full-page caching strategy

#### `/api/sites` (`apps/public/src/app/api/sites/route.ts`)
- ⚠️ returns demo/static response
- ❌ should return paged list for public/site bootstrap

#### `/api/sites/[siteId]/pages` (`.../pages/route.ts`)
- ⚠️ returns placeholder data
- ❌ must serve pages by status + path + slug + published constraints

#### `/api/sites/[siteId]/media` (`.../media/route.ts`)
- ⚠️ placeholder response
- ❌ must return media metadata and access-safe URLs

#### `apps/public/src/components/PageRenderer.tsx`
- ⚠️ supports wider element set than admin catalog
- ⚠️ style and property handling differs from admin
- ❌ element contract drift means inconsistent rendering

#### `apps/public/src/components/PageRenderer.tsx` (form handling)
- ✅ configurable form method/action/redirect metadata now read from element props
- ⚠️ comments + captcha providers and server-side form audit trail still missing

---

## 4) Must-have platform modules (all pages and APIs)

### 4.1 Auth + RBAC
- Mandatory route protection for admin routes.
- Roles: `owner`, `admin`, `editor`, `viewer`.
- Scoped permissions for sites/pages/media/user settings.
- Token/session storage and secure refresh.

### 4.2 Site & page domain
- `Site`: slug, display name, timezone, default language, status, custom domain, theme, plan
- `Page`: slug, parent path, status (`draft|scheduled|published|archived`), seo fields, template, revisions
- `RouteResolver`: subdomain + path -> (site + page)

### 4.3 Builder/Editor model
- Canonical canvas schema with:
  - layout props (x/y/w/h/rotation/zindex/hidden/opacity)
  - style tokens (colors/typography/spacing)
  - content payload
  - animation props
  - responsive overrides per breakpoint
- Editor must support:
  - drag/resizing/multiselect/snap/keyboard editing
  - copy-paste/duplicate/delete/undo-redo
  - alignment tools and lock/aspect constraints
  - breakpoint-specific overrides

### 4.4 Media subsystem
- Upload endpoint + validation.
- Storage abstraction for local/S3/R2-compatible.
- Asset metadata indexing (mimetype, dimensions, size, owner, alt, checksum).
- URL generation with optional signed URL strategy.
- Transform pipeline hooks (image width/height/webp) as optional.

### 4.5 Theme + typography
- Font upload and Google/system font selector.
- Site-level theme tokens (color palette, type scale, spacing scale, radius, shadow, radius).
- Export/preview CSS variables for both editor and public renderer.
- Support brand presets and clone from template.

### 4.6 SEO + content metadata
- Per-page: title, description, og:image, slug history, canonical URL.
- OpenGraph/Twitter tag generator in public head output.
- JSON-LD support optional in pages.

### 4.7 Publishing + versioning
- Save drafts, publish, unpublish, archive.
- Version IDs with last editor and timestamp.
- Diff support (schema-level and content-level).
- Rollback and restore publish state.
- Optional scheduled publish.

### 4.8 Analytics/events (minimal starter)
- page views and editor activity logs.
- optional webhook events (`page.published`, `page.updated`, `media.uploaded`).

### 4.9 Extensibility for custom frontends
- Stable public API contract documented in OpenAPI.
- Client SDK examples (JS and TypeScript).
- Public endpoints that avoid admin internals leakage.

### 4.10 Security and governance
- SSO/social logins (Google, GitHub, Microsoft) plus local password auth.
- MFA/2FA support before exposing admin edit/publish scopes.
- Device/session lifecycle control with forced logout and token expiry rotation.
- Password policy (length, rotation, lockout, reset workflow).
- Immutable action audit logs (`entity`, `entityId`, `action`, `actor`, `before`, `after`, `requestId`).
- Exportable activity history for compliance.

### 4.11 Deployment and infrastructure model
- Recommended production topology: **two Vercel projects**.
- `backy-admin`:
  - Admin UI + mutation/admin APIs.
  - Route protections and privileged keys.
  - Can remain the same Next.js app or a separate app in monorepo.
- `backy-public`:
  - Public page renderer and read-only APIs.
  - Strictly no mutation endpoints.
- Shared data plane: one external DB + one object store used by both projects.
- Shared auth session strategy:
  - Either shared custom JWT issuer (preferred for clear boundary), or
  - short-lived admin session cookie with explicit cross-project trust settings.
- Env hardening:
  - Keep write secrets in admin project only.
  - Public project should receive only read-scope service credentials.

### 4.12 Data/ORM stack decision record
- Option A: Supabase-first
  - Supabase Auth + Postgres + Storage.
  - fastest to ship login/invite/media basics.
- Option B: Prisma + Postgres
  - explicit migration model + stronger ORM portability.
  - external auth (NextAuth/custom).
- Option C (recommended): Prisma + Postgres + Supabase Auth/Storage
  - keep type-safe repositories and avoid auth vendor lock-in.
  - fastest enterprise-grade compromise.
- Decision requirement: lock one option before Phase 1 to prevent route-level refactors later.

### 4.13 Admin UI/UX stack
- Pick one design system and keep it for the entire admin shell.
- Material UI is acceptable if used consistently (dialogs, tables, forms, feedback, spacing tokens).
- Avoid mixing baseline frameworks in same shell to prevent visual drift.

### 4.14 FOSS deployment and API boundary policy (critical for separation)
- For production-grade Open Source usage, recommend two deployable surfaces by default:
  - `backy-admin`: authenticated CMS editor, media uploads, user management, publish actions, all write APIs.
  - `backy-public`: page renderer and public read APIs, comments/forms submission if explicitly enabled.
- Recommended reason:
  - admin secrets and write permissions never sit on public runtime;
  - custom frontends can consume `backy-public` from any host (domain/project) without admin risk;
  - clear incident blast radius when a write token leaks.
- Shared data plane pattern:
  - One Postgres-compatible database.
  - One media bucket.
  - Optional Redis/cache for render payload and route lookups.
- Tenant usage model for custom frontends:
  - `backy-public` exposes public contracts and CORS headers for your frontend origin.
  - Your frontend resolves site by `slug`/`custom domain` and pulls:
    - `GET /api/sites/:identifier` (site bootstrap),
    - `GET /api/sites/:siteId/pages?path=...`,
    - `GET /api/sites/:siteId/media` (public assets),
    - `GET /api/sites/:siteId/blog...` (public blog read),
    - `POST /api/sites/:siteId/forms/:formId/submissions`,
    - `POST /api/sites/:siteId/pages/:pageId/comments`.
- A single-Vercel-project setup is acceptable for local dev and quickstart only.
  - it must still keep write routes behind strict auth middleware and token scoping.

--- 

## 5) Page-level engineering backlog (what each page should contain)

### Admin
- `sites`: table filters, ownership, domain settings, status badges, quick publish, delete safeguards.
- `pages`: page tree, slug editor inline, template chooser, publish state, reorder, duplicate.
- `blog`: category/tag, status, featured image, author, SEO blocks, schedule.
- `media`: upload (drag/drop), rename/move, delete, alt text, dimensions preview.
- `users`: invites, roles, team/project scoping.
- `settings`: global defaults, SMTP, API tokens, security headers, integration keys.
- `page editor`: element editor parity + responsive mode + history + autosave + version dialog.

### Public
- Runtime site resolver + fallback pages.
- 404/410/410 handling based on publish state.
- SSR-safe rendering with deterministic hydration.
- Head metadata generation from backend fields.

---

## 6) Chronological implementation plan (minimum viable sequence)

## Phase 0 — Foundation (1 week)
1. Freeze canonical contracts in `packages/core` (page/site/media/user/auth/editor element schema).
2. Add migration-safe validators for contracts.
3. Build shared route resolver utility and wire one import path.
4. Introduce API client adapters for admin/public to remove duplicate mock assumptions.

Acceptance: admin and public compile against shared types; no duplicate element interfaces.

## Phase 1 — Auth + RBAC + persistence baseline (1–2 weeks)
1. Protect all admin routes with middleware.
2. Wire real store/service for sites, pages, media, users in DB.
3. Add CRUD API routes for these entities.
4. Replace mockStore reads/writes in routes with API calls.

Acceptance: can create/read/update/delete site/page/media/user from admin and verify persistence by reload.

## Phase 2 — Editor backend integration (2 weeks)
1. Complete page save/load/reload through `/api/sites/:id/pages/:pageId`.
2. Implement draft+publish save operations.
3. Add autosave with debounce and conflict-safe version tokens.
4. Connect media/font/theme tokens with editor property controls.
5. Add full breakpoints handling in canvas + preview.

Acceptance: open an existing page after refresh, keep edits, and render same result in public endpoint.

## Phase 3 — Rendering parity + public API (2 weeks)
1. Unify editor catalog and public renderer prop contract.
2. Add robust slug/path resolver and status filtering for public.
3. Implement SEO fields in page render head output.
4. Add media URL API with ownership and public/private handling.

Acceptance: editor output and public output are identical for all supported elements for a random seed set.

## Phase 4 — CMS completeness (1–2 weeks)
1. Blog model completion (categories/tags/revisions/author/featured image/scheduling).
2. user/team invitations + role scoped access.
3. settings and integrations page with environment-safe secrets.
4. audit logs and basic analytics/event hooks.

Acceptance: multi-user workflows function; a non-admin cannot access admin-only or sensitive endpoints.

## Phase 5 — Production hardening (1 week)
1. Validation/error envelopes and input sanitization.
2. Rate limit + request tracing.
3. deployment env docs, migration scripts, seed scripts, local/dev parity.
4. complete README and contributor guide.

Acceptance: stable deploy on Vercel with seeded demo and API contract docs.

---

## 7) Critical known blockers (do now)
- Public rendering mismatch between admin catalog and renderer component types.
- TODO stubs in public site/page fetch logic.
- API routes currently return demo/static payloads.
- Admin routes not consistently gated by authentication/authorization.
- Missing persistent storage integration in editor actions.
- No real media upload/storage abstraction.
- No canonical source for breakpoints and responsive behavior.
- No published deployment model for admin/public separation and secret boundaries.
- No finalized auth stack choice (SSO/MFA/audit/security baseline).

---

## 8) Delivery format for tracking (for future cycles)
Each task item should be tracked with:
- Page/Endpoint impacted
- Type (`backend`, `frontend`, `contract`, `ux`, `docs`)
- Status (`todo`, `in-progress`, `done`)
- Owner
- Acceptance test (manual or automated)
- Risk/rollback note

Use this file as the persistent baseline before any implementation pass.

## 9) Unresolved UX/UI parity gaps (must be fixed)

### 9.1 Canvas editor experience
- Missing/WIP at launch:
  - Multi-select (shift-click + drag select).
  - Alignment tools (left/center/right, vertical align, distribute, nudge arrows).
  - Layer reorder UX (bring front/back, move up/down, lock, hide/show).
  - Keyboard shortcuts standardization (undo/redo/copy/paste/delete/duplicate/save).
  - Resize handles completeness (edge + corner; shift-constrain, alt-origin).
  - Responsive preview with per-breakpoint style inheritance and hiding rules.
  - Undo/redo history correctness across all operations.
  - Canvas zoom, panning, rulers, snap-to-guides.
  - Component rename/labels and searchable component library.
  - Empty-state guidance and contextual first-run hints.
  - Visual quality issues to fix:
    - Inconsistent controls density and spacing around toolbar sections.
    - Property panel state reset and selection sync reliability.
    - Preview/edit mode transitions with visible state indicators.
    - Font/color updates not always reflected across all related components in real-time.
    - Right-pane rich text formatting must preserve selected text range while applying toolbar actions:
      - Keep active text selection in canvas context when focus moves into the property panel.
      - Apply font family/size and color operations to current range only, not whole block.
      - Keep toolbar actions functional when opening media/link/emoji sub-actions without dropping selection.
      - Preserve selection when toggling between properties and when opening action drawers in the right pane.

### 9.2 Media/asset UX gaps
- Missing drag/upload UX quality:
  - upload progress and failure states
  - batch upload and folder/bucket organization
  - replace media flow in existing elements
  - keyboard accessible media chooser + filtering by type
- Accessibility and discoverability:
  - all media actions need labels, focus rings, and destructive confirmation.

### 9.3 Settings/admin dashboard UX gaps
- Consistent status vocabulary and badges across pages.
- Empty-state / error-state placeholders for every admin list.
- Better validation copy + inline field errors.
- Confirm-delete patterns and action recovery paths.
- Role-based UI filtering (hide unavailable actions instead of disabled-only).

## 10) Blog editor and template strategy

### 10.1 Current state issue
- Blog editor currently reuses general page editor path and is not enough for article workflows.
- Missing dedicated blog content model and reusable editorial template flow.

### 10.2 Required approach
- Add a dedicated blog post compose page:
  - `apps/admin/src/routes/sites.$siteId.blog.$postId.edit.tsx` (or equivalent dedicated route)
  - keeps authoring defaults specific to posts.
- Introduce blog post template system:
  - `Template` entity (title/body/sidebar blocks/reusable component tree).
  - Template selector in `blog.new` and blog editor.
  - Template versioning and per-site template assignment.
- Blog-specific fields:
  - featured image, excerpt, category(s), tag(s), author, reading time, publish schedule.
  - SEO block, canonical URL, social image, slug suggestion from title.
- Public output:
  - feed-like rendering rules for list/detail pages must be deterministic from same underlying data model.

### 10.3 Acceptance
- New post can be created from a template and saves as a valid page object.
- Blog list and detail rendering consumes same public contract as regular pages.
- Template changes do not break existing published posts without migration guard.

## 11) Bug ledger (hard blockers before phase-close)

### 11.1 Top-priority
- Admin/public contracts mismatch on renderer element types and style fields.
- Blog editor and page editor state drift.
- Unsaved/dirty-state handling during concurrent edits.
- Missing endpoint contracts for page save/publish and route resolution.

### 11.2 High
- Undo/redo inconsistencies across drag, delete, property edits, and multi-select.
- Breakpoint switching not persisting per-breakpoint overrides.
- Media insertion not updating canvas metadata atomically (alt/text/style mismatch).
- Page slug conflicts with reserved paths and locale-path edge cases.

### 11.3 Medium
- Slower interactions due to rerenders on each canvas move.
- Non-deterministic element IDs when duplicating/copy-paste.
- Missing empty/404/403 UX states in admin and public pages.

## 12) Final quality bar before release
- No critical bug in editor state sync.
- No duplicated data contracts between admin/public.
- Blog authoring supports templates and reusable building blocks.
- Custom frontend can consume public API without importing admin internals.
- One click from deploy to:
  - login admin
- create site
- create page/blog
- publish page/blog
- render on public frontend through API.
- Non-admin users cannot reach admin mutation endpoints under any condition.

## 13) Frontend interaction model (what Backy exposes and expects)

Backy must work for two frontend modes:
- Official admin/editor frontend (internal).
- Any custom external frontend (React/Vue/Svelte/Next/Any SSR).

### 13.1 Media model (global + page/blog scoped)

Three asset scopes must exist in the domain model:
- Global site assets
  - Reusable across any page/blog in the site.
- Page assets
  - Bound directly to a page object and rendered in that page context.
- Blog assets
  - Bound to blog posts and blog-specific components (featured image, inline blocks, gallery).

Rules:
- `global` assets can be inserted into page and blog canvases.
- Page/blog scoped assets must be visible in that context and still resolvable in public render.
- All scopes store metadata: owner site, MIME, size, dimensions, checksum, alt text, caption, owner user, visibility.
- Optional `scope=public` flag on media for publicly cacheable URL and `scope=private` for permissioned API access.

Minimal API behavior (admin/public split):
- `POST /api/admin/sites/:siteId/media`
  - multipart upload with validation + dedupe + returns asset metadata + CDN/public URL.
- `GET /api/admin/sites/:siteId/media`
  - list/global assets with filters by type/tag/owner/usage.
- `POST /api/admin/sites/:siteId/pages/:pageId/media`
  - bind existing asset to page scope.
- `POST /api/admin/sites/:siteId/blog/:postId/media`
  - bind existing asset to blog scope.
- `GET /api/public/sites/:siteId/media/:assetId` (safe subset fields)
  - returns file URL + render-safe metadata for public usage.

### 13.2 Form blocks and user submissions

The editor must support a form component with structured fields.

Form block should send:
- field key/type/required/label/options/help/validation.
- submission endpoint binding in block config.

Contract:
- `POST /api/public/sites/:siteId/forms/:formId/submissions`
  - accepts structured payload keyed by field keys.
  - includes spam fields: optional honeypot + request fingerprint + captcha token.
- `GET /api/admin/sites/:siteId/forms`
  - list forms + publish/active state.
- `GET /api/admin/sites/:siteId/forms/:formId/submissions`
  - list submissions with pagination.
- `PUT /api/admin/sites/:siteId/forms/:formId/submissions/:submissionId`
  - update status (`new`/`reviewed`/`closed`).

Frontend expectation:
- On submit success, return `submissionId` and optional confirmation message.
- On validation error, return field-level errors in machine-readable format.

### 13.3 Comments system (page/blog)

Support comments for both blog and static pages:
- Anonymous comments (if enabled).
- Authenticated comments (if enabled by project).

Contract:
- `POST /api/public/sites/:siteId/pages/:pageId/comments` (or `/blogs/:postId/comments`)
- `GET /api/public/sites/:siteId/pages/:pageId/comments?status=approved`
- `POST /api/admin/sites/:siteId/moderate/comments/:commentId` (approve/reject/spam/block user)

Rules:
- default moderation = `pending`.
- spam guard and rate-limit by IP/device.
- threaded replies optional in phase 2.
- public comment count API should be cache-safe.

Execution status (2026-02-24):
- Anti-bot fields (`requestId`, `startedAt`, `honeypot`) are now sent from the comment renderer and checked in both page/post comment submit routes.
- Shared store now includes comment classification with validation, timing, honeypot, duplicate and rate-limit checks.
- Parent-thread integrity is now validated in API routes before comment creation.
- Remaining for parity: public comment export/report pipeline, block-level spam tuning, and bulk moderation actions.

### 13.4 What frontend should expect from page/blog render APIs

Core public read contract:
- `GET /api/public/sites/:siteId/pages?path=/...`
- `GET /api/public/sites/:siteId/blog/posts?status=published&limit=&cursor=`
- `GET /api/public/sites/:siteId/blog/posts/:slug`

Expected response shape:
- `content` uses shared Backy element schema.
- `themeTokens` map.
- `meta` with canonical url, seo title/description, open graph fields.
- `assets` with URLs + metadata for every referenced asset.
- `forms` definitions and `commentPolicy` for rendering interactive sections.

Frontend behavior expectations:
- Render from `content` without importing editor internals.
- Build its own UI around Backy contract and theme tokens.
- For protected pages, expect `404/401/403` per contract and not rely on admin-only flags.

### 13.5 Share and social interactions
- Sharing endpoints should be first-class in front-end contracts:
  - canonical URL generation.
  - optional `utm`/query metadata for share actions.
  - OpenGraph image from page meta.
- Frontend should expect `canonicalUrl` in page payload and use it directly for social buttons.

### 13.6 Error handling contract (custom frontend compatibility)
- All API errors should be normalized to:
  - `code`, `message`, `details`, `requestId`.
- Frontend must handle:
  - `AUTH_REQUIRED`
  - `FORBIDDEN`
  - `NOT_FOUND`
  - `CONFLICT` (editor version conflict)
  - `VALIDATION_ERROR`
  - `RATE_LIMITED`
- Public routes must never leak stack traces or internal admin object structures.

## 14) Contract-first no-regression guard

Source docs for shared contracts:
- `/packages/core/src/types/index.ts`
- `/specs/backy-api-contracts.md`

Rule:
- Every implementation task must define/verify payload compatibility before touching runtime logic.
- Existing keys must stay stable unless explicit deprecation has been documented.
- New nested fields should be additive and optional by default.

Release guardrails:
- No API behavior changes without endpoint-level acceptance checks.
- Feature flags for risky changes (comments/forms/media policy) before global rollout.
- Breaking changes require migration path and fallback for older frontends.
