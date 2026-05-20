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

**Authoritative current status and roadmap:**
- [specs/page-completion-audit/backy-page-surface-audit.md](specs/page-completion-audit/backy-page-surface-audit.md)
- [specs/backy-full-parity-roadmap-spec.md](specs/backy-full-parity-roadmap-spec.md)
- [specs/phase-docs/backy-phase-a-j-completion-spec.md](specs/phase-docs/backy-phase-a-j-completion-spec.md)

**Historical phase notes, superseded by the current audit above:**
- [specs/phase-docs/backy-headless-cms-platform-phase-roadmap-v1.md](specs/phase-docs/backy-headless-cms-platform-phase-roadmap-v1.md)
- [specs/phase-docs/backy-headless-cms-platform-phase-roadmap-v2.md](specs/phase-docs/backy-headless-cms-platform-phase-roadmap-v2.md)
- [specs/phase-docs/backy-alpha-vs-numeric-phase-progress-2026-02-27.md](specs/phase-docs/backy-alpha-vs-numeric-phase-progress-2026-02-27.md)

Current audit baseline: **39 Ready / 6 Partial / 0 Prototype / 0 Missing**. The remaining Partial gates are external certification: configured Forms and SDK Supabase/Postgres service-data smokes plus live Settings and Commerce provider execution.

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
- ✅ done/working for the current local repo scope
- ⚠️ externally gated or still needs broader provider/database certification
- ❌ missing/not implemented in the current local repo scope

### 3.1 Admin routes (T3A)

#### `/` (`apps/admin/src/routes/index.tsx`)
- ✅ Dashboard scaffold present
- ✅ Top-level layout shell and navigation
- ✅ Admin routes use the backend-backed session/client surface instead of browser-only mock auth.
- ⚠️ Deeper production analytics and provider-backed activity data remain tied to the broader external certification gates.

#### `/login` (`apps/admin/src/routes/login.tsx`)
- ✅ API-backed login UI with seeded local-demo accounts, Supabase Auth exchange support, MFA challenge handling, and httpOnly `backy_admin_session` cookies.
- ✅ Session validation, rotation, logout/revocation, invite acceptance, password recovery/reset, and auth audit coverage are implemented.
- ⚠️ Broader production auth-provider rollout remains an external certification/runtime gate.

#### `/sites` (`sites.tsx`)
- ✅ List/create site UI surface is API-backed for the current audit scope.
- ✅ Team-scoped ownership and route access checks are covered by admin site-scope tests.
- ⚠️ Domain/Vercel/provider provisioning still depends on live provider certification.

#### `/sites.new` (`sites.new.tsx`)
- ✅ Form UI and API-backed site creation flow exist for the current audit scope.
- ✅ Site creation permission failures now expose alert semantics, retryable permission loading, and a user-access handoff before creating a workspace.
- ⚠️ Provider-side domain/project provisioning still depends on external certification.

#### `/sites/$siteId` (`sites.$siteId.tsx`)
- ✅ Details view links to pages/media and reads the backend-backed site model for the current audit scope.
- ✅ Page/site association, status, settings, and nested route access are covered by admin site-scope tests.
- ✅ Site-level comments moderation now has loaded-comment select-all, selected loaded/stale summaries, and bulk approve/reject/spam/block actions scoped to loaded selected comments.
- ⚠️ Live domain/provider verification remains externally gated.

#### `/pages` (`pages.tsx`)
- ✅ table/list scaffold and “New page” navigation
- ✅ backend-backed pagination intake, status/last-modified columns, route diagnostics, and page template provenance are surfaced in the table, CSV export, and handoff manifest.
- ⚠️ continue hardening filter ergonomics and broader slug-validation/provider certification coverage.

#### `/pages.new` (`pages.new.tsx`)
- ✅ create page form shell with template, navigation, SEO, dataset, autosave, and future-date scheduled publish validation.
- ✅ Page creation permission failures now expose alert semantics, retryable permission loading, and a user-access handoff before the user starts a new editor document.
- ⚠️ continue hardening publish workflow and per-page settings defaults beyond current starter/template clone coverage.

#### `/pages/$pageId/edit` (`pages.$pageId.edit.tsx`)
- ✅ Drag/drop editor shell, layer selection, resize/move/history, save/publish/reload, conflict handling, responsive breakpoint state, and media/theme/font registry integration are locally guarded.
- ⚠️ Continue hardening nested block confidence, shared renderer parity, and new-control smoke coverage as editor controls are added.

#### `/blog` (`blog.tsx`)
- ✅ blog index/editor entry point with backend list, taxonomy, author filters, SEO/comment controls, revisions, bulk workflow, CSV/handoff exports, and scheduled-post health state.
- ⚠️ continue hardening filter ergonomics, audit-event UI polish, and live DB service smoke.

#### `/blog.new` (`blog.new.tsx`)
- ✅ rich form/editor scaffold with backend create, category/tag/author assignment, SEO, frontend-template seeding, autosave, future-date scheduled publish validation, and retryable permission recovery.
- ⚠️ continue hardening relation-based publish flow and broader external-provider certification.

#### `/blog.$postId` (`blog.$postId.tsx`)
- ✅ editor+canvas for article-like content with revision snapshots, author/taxonomy assignment, comments sidebar, guarded publish/archive workflow, future-date scheduled save validation, and retryable permission recovery.
- ⚠️ continue hardening relation-based publish flow, team attribution depth, and revision graph ergonomics.

#### Editor interaction parity
- ✅ media picker now passes page/post context into the property panel and media uploads
- ✅ form property panel now supports submit URL, HTTP method, success message/redirect, and honeypot toggle
- ✅ rich text inline toolbar is enabled during edit and portal container is mounted in property panel
- ✅ list markdown shortcuts for `-`, `*`, `+`, `1.` and list-specific Enter/Tab handling are now wired in editor key handling
- ✅ active text editor registration now persists only for editable blocks, preventing toolbar target flicker from read-only fields
- ✅ rich-text quick actions (format/alignment/list/emoji) now consistently target the active editable text block
- ✅ Right-side rich-text paths are locally guarded for table/list depth, imported list-indent edits, and selected-list indent state.
- ✅ selection boundary hit-testing improved for canvas elements by using pointer-capture selection and resize-handle exclusion (keeps dragging/selection reliable while preserving edit targets)
- ✅ non-preview interaction safety pass added: button/link/input/video/embed/map now pass pointer events to wrapper so element selection/dragging is not blocked by child widgets
- ✅ canvas drop/drag reliability pass added: component drops use canvas-relative coordinates, pasteboard drops are ignored, nested child drag ids are preserved, and selected elements show clearer bounding-box metrics.
- ✅ layers panel wiring added for editor parity: right-side layer view can select, root-reorder, hide/show, lock/unlock, duplicate, and delete persisted canvas elements; public renderer skips hidden elements.
- ✅ users admin API baseline added: team users now persist through `GET/POST/PATCH/DELETE /api/admin/users` and the admin users screens use backend-first flows with local fallback.
- ✅ settings admin API baseline added: delivery mode and API keys now persist through `GET/PATCH/POST /api/admin/settings`, and the settings page uses backend-first load/save/regenerate flows with local fallback.
- ✅ list editing now supports marker-level control (`disc`, `circle`, `square`, `decimal`, alpha, roman) from list content panel and renderer
- ⚠️ Remaining editor work should be treated as regression hardening and new-control coverage, not as a currently counted Partial gate.

#### `/media` (`media.tsx`)
- ✅ Central media browser, upload/listing, folders, metadata, replacement/version flows, safety scanning, signed/private delivery, quotas, provider diagnostics, retryable permission recovery, and binding-aware previews are implemented.
- ⚠️ Provider-account automation, secret rotation execution, and cross-channel attribution beyond provider feeds remain external/provider hardening work.

#### `/users` (`users.tsx`)
- ✅ User list and user API flows cover role/status editing, invite/reset/session lifecycle, team-scoped access, permission previews, actionable bulk status/delete selection summaries, and audit activity.
- ⚠️ Broader external auth-provider rollout remains globally tracked outside this page.

#### `/users.new` (`users.new.tsx`)
- ✅ User creation/invite flow is backend-backed with invite token, password policy coverage, and retryable permission recovery.
- ⚠️ External auth-provider rollout remains a certification gate.

#### `/users.$userId` (`users.$userId.tsx`)
- ✅ User detail supports role/status editing, permission preview, retryable permission recovery, active sessions, reset-password, session revocation, MFA/recovery-code management, and audit activity.
- ⚠️ Broader external auth-provider rollout remains globally tracked outside this page.

#### `/settings` (`settings.tsx`)
- ✅ Backend-backed delivery mode, API/service keys, security policy, storage/Supabase/Vercel/notification/commerce metadata, provider diagnostics, audit history, and site-scoped settings are implemented.
- ⚠️ Live Supabase, Vercel, storage, notification, and commerce provider certification remains required before production certification.

#### `/products` (`products.tsx`)
- ✅ Product catalog workspace covers schema setup, product records, pricing, inventory, media, variants, SEO, provider handoff, CSV import/export, fixed filtered-card bulk selection, and future-date scheduled product validation.
- ⚠️ Live commerce provider certification remains required before production certification.

#### `/orders` (`orders.tsx`)
- ✅ Orders workspace bulk workflow applies paid/processing/fulfilled/cancelled actions to every selected loaded order, including selections outside the active filtered view.
- ✅ Orders live-provider handoff now exposes the required-mode Commerce certification operator gate, preflight/doctor commands, provider-family selectors, and evidence expectations in the UI and export manifest.
- ⚠️ Live payment, refund, shipping, fulfillment, tracking, and reconciliation provider certification still remains required before production certification.

#### `/contacts` (`contacts.tsx`)
- ✅ Contacts workspace covers lead filtering, lifecycle, import/export, duplicate merge, promotion, sync, consent/retention, segmentation, analytics, retryable permission recovery, and visible/outside-view bulk selection summaries.
- ⚠️ Broader configured Supabase/Postgres service smoke remains required before production certification.

### 3.2 Public routes

#### `/` (`apps/public/src/app/page.tsx`)
- ✅ Public app is the headless/rendering boundary for seeded and DB-backed site data.
- ⚠️ Production service-data readiness depends on the configured SDK Postgres gate.

#### `/sites/[subdomain]/[[...path]]` (`apps/public/src/app/sites/[subdomain]/[[...path]]/page.tsx`)
- ✅ Site/page resolution covers seeded and DB-backed site settings, slug/path lookup, redirects, gone routes, dynamic list/detail routes, preview, and unpublished guards.
- ⚠️ Domain and locale routing variants plus broader cache-invalidation hardening remain open follow-up work.

#### `/api/sites` (`apps/public/src/app/api/sites/route.ts`)
- ✅ Public/admin site discovery is API-backed for the current audit scope, with demo mode retained for local seeded data.

#### `/api/sites/[siteId]/pages` (`.../pages/route.ts`)
- ✅ Page read/render contracts are covered through public manifest/OpenAPI/SDK and renderer smokes, with published/preview behavior guarded in public routes.

#### `/api/sites/[siteId]/media` (`.../media/route.ts`)
- ✅ Media APIs expose metadata, folders, bindings, versions, safety state, signed/private delivery, and provider diagnostics under permission gates.

#### `apps/public/src/components/PageRenderer.tsx`
- ✅ Renderer coverage includes the current public contract, hidden-element behavior, forms/comments, rich text, commerce, media, reusable sections, interactive components, and generated frontend handoffs.
- ⚠️ Keep admin/public/editor schema convergence guarded as new block types ship.

#### `apps/public/src/components/PageRenderer.tsx` (form handling)
- ✅ configurable form method/action/redirect metadata now read from element props
- ✅ Forms/comments include backend-backed moderation, selected-submission bulk review, delivery, analytics, retryable permission recovery, RBAC, repository coverage, and public/admin API contracts.
- ⚠️ Remaining Forms risk is executing the configured Supabase/Postgres smoke against a migrated disposable database.

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
- Run `BACKY_DATABASE_DISPOSABLE_CONFIRMED=true npm run ci:forms-postgres` against a migrated disposable Supabase/Postgres database; this chained operator gate runs the Forms Postgres preflight, disposable-target guard, and DB-backed Forms smoke.
- Run `BACKY_DATABASE_DISPOSABLE_CONFIRMED=true npm run ci:sdk-postgres-smoke` against a migrated disposable Supabase/Postgres database.
- Run live Settings provider certification for Supabase, Vercel, storage, notification, commerce metadata, provider diagnostics, and secret rotation handoffs.
- Run live Commerce provider certification for payment, catalog, tax, shipping, discount, subscription lifecycle, and provider-managed webhook paths.
- Keep editor, renderer, generated SDK, and OpenAPI schema convergence guarded as new block types and page controls are added.

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
- Current local editor parity is guarded by focused smoke paths for drag/drop, copy/cut/paste/duplicate/delete/grouping, responsive breakpoint state, rich-text table/list depth, imported list-indent edits, and long-session stress.
- Remaining editor work should be treated as regression hardening and new-control coverage, not as a currently counted Partial gate.
- Undo and redo controls now expose stable ids and shortcut metadata for Cmd/Ctrl+Z, Cmd/Ctrl+Y, and Shift+Cmd/Ctrl+Z, keeping the history command surface source-guarded alongside mutation controls.
- Group/ungroup toolbar and inspector controls now expose stable action ids plus `aria-keyshortcuts` for Cmd/Ctrl+G and Shift+Cmd/Ctrl+G, with source-only editor smoke coverage for shortcut discoverability.
- Nested component authoring now includes direct child-layer scope selection through the toolbar, inspector, and Shift+Cmd/Ctrl+A shortcut so container/group children can be selected for grouping, alignment, duplication, and delete flows without repeated single-child drilling.
- Sibling-scope selection is available from the toolbar plus single and multi-layer inspector cards with Cmd/Ctrl+A shortcut metadata, keeping same-parent grouping and alignment setup local to the current properties workflow.
- Multi-selected unlocked groups in the same layer scope can now be ungrouped together from the toolbar, inspector, or Shift+Cmd/Ctrl+G command, preserving child geometry and selecting the expanded children afterward.
- Inspector parent/child navigation controls now expose shortcut metadata for Enter, Shift+Enter, and Shift+Cmd/Ctrl+A, so nested authoring can drill into children, select child scopes, and move from selected children back to the containing group without clearing selection state manually.
- Clipboard and delete controls now expose shortcut metadata for copy, cut, paste, duplicate, and delete, and the paste control advertises whether the current paste will target the selected container/group or the canvas root.
- Multi-selection clipboard actions now derive availability from the active sibling scope, label single versus multi-layer actions correctly, and expose copy/duplicate/cut/paste/delete controls directly in the inspector.
- Single selected layers now expose copy, duplicate, cut, paste, and delete directly in the inspector with the same shortcut and paste-target metadata as the toolbar, so nested component editing does not require leaving the properties panel for common layer operations.
- Single and multi-layer inspectors now expose local hide/show and lock/unlock controls backed by the same selected-layer handlers as the toolbar, keeping common layer state changes available while editing properties.
- Layer-order controls now expose bracket shortcut metadata in the toolbar and are available from both single and multi-layer inspector cards for send-to-back, send-backward, bring-forward, and bring-to-front workflows.
- Keep right-pane rich-text selection, media/link sub-actions, and nested block confidence covered whenever related controls are changed.

### 9.2 Media/asset UX gaps
- Current media coverage includes centralized upload/listing, folders, metadata, replacement/version flows, safety scanning, signed/private delivery, quotas, provider diagnostics, retryable permission recovery, and binding-aware previews.
- The Media workspace now exposes copyable public list, filtered public list, font manifest, file delivery, transform, upload, folder, and provider analytics URLs in its frontend handoff manifest so custom frontends can mirror the current library view without reverse-engineering admin filters.
- Remaining media work is provider-account automation, secret rotation execution, and cross-channel attribution beyond provider feeds.
- Accessibility and discoverability:
  - destructive asset, bulk asset, and folder delete flows now expose labelled modal dialogs, explicit confirm/cancel action labels, visible focus rings, and source guards in `apps/admin/scripts/media-smoke.mjs`.
  - keep labels, focus rings, and destructive confirmation guarded as new media actions are added.

### 9.3 Settings/admin dashboard UX gaps
- Consistent status vocabulary and badges across pages.
- Empty-state / error-state placeholders for every admin list.
  - `/sites` now has source-guarded backend and permission error states with alert semantics, retry/filter recovery, and permission retry actions.
  - `/sites/new` now has source-guarded permission error states with alert semantics, permission retry actions, and a user-access handoff link.
  - `/pages` now has source-guarded backend and permission error states with alert semantics, retry/filter recovery, permission retry actions, and a user-access handoff link.
  - `/blog` now has source-guarded backend and permission error states with alert semantics, retry/filter recovery, permission retry actions, and a user-access handoff link.
  - `/media` now has source-guarded permission error states with alert semantics, permission retry actions, and a user-access handoff link.
  - `/users/new` now has source-guarded permission error states with alert semantics, permission retry actions, and a user-access handoff link.
  - `/users/$userId` now has source-guarded permission error states with alert semantics, permission retry actions, and a user-access handoff link.
  - `/contacts` now has source-guarded permission error states with alert semantics, permission retry actions, and a user-access handoff link.
  - `/comments` now has source-guarded permission error states with alert semantics, permission retry actions, and a user-access handoff link.
  - `/collections` now has source-guarded backend and permission error states with alert semantics, retry/filter recovery, user-access handoff, permission-contract retry actions, and filtered full-result record bulk selection summaries.
  - `/forms` now has source-guarded backend and permission error states with alert semantics, retry/filter recovery, user-access handoff, and permission retry actions.
  - `/products` now has source-guarded backend and permission error states with alert semantics, retry/filter recovery, user-access handoff, and permission retry actions.
  - `/orders` now has source-guarded backend and permission error states with alert semantics, retry/filter recovery, user-access handoff, and permission retry actions.
  - `/settings` now has source-guarded permission error states with alert semantics and user-access handoff actions.
- Better validation copy + inline field errors.
- Confirm-delete patterns and action recovery paths.
- Role-based UI filtering (hide unavailable actions instead of disabled-only).

## 10) Blog editor and template strategy

### 10.1 Current implemented scope
- Blog authoring is implemented through the dedicated admin blog surfaces:
  - `apps/admin/src/routes/blog.tsx` for list, taxonomy, authors, SEO/comment row controls, revisions, bulk workflows, CSV export, and handoff JSON.
  - `apps/admin/src/routes/blog.new.tsx` for post creation with article-specific fields, featured media, taxonomy/author assignment, SEO/social metadata, scheduling validation, autosave, retryable permission recovery, and frontend-design template seeding.
  - `apps/admin/src/routes/blog.$postId.tsx` for post editing with `CanvasEditor`, focus mode, featured/taxonomy/readiness/publish/comments/handoff/revision panels, optimistic save guards, preview, publish, archive, rollback, retryable permission recovery, and read-only fallback behavior when backend loading fails.
- Blog templates are represented by frontend design templates with `templateType: "blogPost"` and persisted provenance (`frontendDesignTemplateId`, source/chrome/tokens/binding hints) on created posts instead of a separate legacy `Template` entity.
- Public blog output is served from the same content contract family as pages: public list/detail APIs, render/resolve payloads, preview-token reads, RSS/feed discovery, taxonomy/author filters, scheduled visibility rules, and frontend-design metadata are contract-tested for custom frontends.

### 10.2 Current coverage
- `apps/admin/scripts/blog-list-smoke.mjs` covers backend list workflows, taxonomy CRUD, author filters, revision summaries, row SEO/comment controls, scheduled-state health, error/permission states, filtered full-result bulk selection, bulk publish readiness preflight, CSV/handoff export, and public taxonomy feed visibility.
- `apps/admin/scripts/blog-create-smoke.mjs` covers frontend blog template selection, template canvas seeding, autosave/recovery, featured media picker, article metadata, future-date scheduling validation, retryable permission recovery, backend create, and persisted frontend-design provenance.
- `apps/admin/scripts/blog-editor-smoke.mjs` covers editor fallback read-only mode, scheduled save validation, unsaved workflow guards, optimistic publish/save requests, retryable permission recovery, comments and revision empty states, and guarded publish workflow behavior.

### 10.3 Remaining work
- Keep blog authoring aligned with the shared page/editor content contract as new CanvasEditor controls ship.
- Continue improving relation-based publish ergonomics, team attribution depth, revision graph UX, and live Supabase/Postgres service-data certification.
- Treat any future standalone blog-template entity as an enhancement only if it removes real duplication beyond the existing frontend-design template contract.

## 11) Bug ledger (hard blockers before phase-close)

### 11.1 Top-priority
- Execute the configured Forms and SDK Postgres gates against a migrated disposable database.
- Execute live Settings and Commerce provider certification with real provider credentials.
- Keep admin/public/editor contract convergence guarded as new renderer fields ship.

### 11.2 High
- Provider-managed tax/shipping/discount/subscription/webhook certification depth.
- Domain, locale, and cache invalidation hardening for public routing.
- Continued editor regression coverage for nested blocks and rich text selection flows.

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
- Asset scope is `global`, `page`, or `post`; file visibility is `public` or `private`.
- Public files are cacheable through the public file endpoint; private files require signed access.

Minimal API behavior (admin/public split):
- `POST /api/admin/sites/:siteId/media`
  - multipart upload with validation + dedupe + returns asset metadata + CDN/public URL.
- `GET /api/admin/sites/:siteId/media`
  - list/global assets with filters by type/tag/owner/usage.
- `POST /api/admin/sites/:siteId/media/:mediaId/bind`
  - bind/unbind an existing asset to a page or blog-post target with `targetType=page|post`, preserving `pageIds`, `postIds`, and binding metadata.
- `GET /api/sites/:siteId/media?scope=global|page|post&pageId=&postId=`
  - returns public, non-quarantined media metadata filtered by scope and usage.
- `GET /api/sites/:siteId/media/:mediaId`
  - returns render-safe metadata for a public, non-quarantined asset.
- `GET /api/sites/:siteId/media/:mediaId/file`
  - delivers the binary file with Backy contract/cache headers; private assets require a signed URL.
- `GET /api/sites/:siteId/media/:mediaId/transform`
  - returns prepared responsive transform metadata for renderers.

### 13.2 Form blocks and user submissions

The editor must support a form component with structured fields.

Form block should send:
- field key/type/required/label/options/help/validation.
- submission endpoint binding in block config.

Contract:
- `GET /api/sites/:siteId/forms`
  - list active public form definitions without private submission data.
- `GET /api/sites/:siteId/forms/:formId` and `GET /api/sites/:siteId/forms/:formId/definition`
  - return cacheable form definition/front-end design metadata for custom form UIs.
- `POST /api/sites/:siteId/forms/:formId/submissions`
  - accepts structured payload keyed by field keys.
  - includes spam fields: optional honeypot, `startedAt`, request id/fingerprint, and captcha token aliases.
  - returns submission status, field-level validation errors, optional collection-record/contact handoff, and delivery metadata.
- `GET /api/admin/sites/:siteId/forms`
  - list forms + publish/active state.
- `GET /api/admin/sites/:siteId/forms/:formId/submissions`
  - list submissions with pagination.
- `PATCH /api/admin/sites/:siteId/forms/:formId/submissions/:submissionId`
  - update moderation status (`pending`/`approved`/`rejected`/`spam`), review metadata, admin notes, contact sharing, and collection-record linking.
- `POST /api/admin/sites/:siteId/forms/:formId/submissions/:submissionId/email-retry`
  - retry failed notification email delivery.
- `POST /api/admin/sites/:siteId/forms/:formId/submissions/:submissionId/webhook-retry`
  - retry failed integration webhook delivery.

Frontend expectation:
- On submit success, return `submissionId` and optional confirmation message.
- On validation error, return field-level errors in machine-readable format.

### 13.3 Comments system (page/blog)

Support comments for both blog and static pages:
- Anonymous comments (if enabled).
- Authenticated comments (if enabled by project).

Rules:
- default moderation = `pending`.
- spam guard and rate-limit by IP/device.
- threaded replies optional in phase 2.
- public comment count API should be cache-safe.

Current contract:
- `POST /api/sites/:siteId/pages/:pageId/comments`
- `GET /api/sites/:siteId/pages/:pageId/comments?status=approved&parentId=&parentOnly=`
- `POST /api/sites/:siteId/blog/:postId/comments`
- `GET /api/sites/:siteId/blog/:postId/comments?status=approved&parentId=&parentOnly=`
- `GET /api/sites/:siteId/comments?targetType=page|post&targetId=&status=approved`
- `PATCH /api/sites/:siteId/comments/:commentId`
  - admin moderation and reply-thread updates.
- `PATCH /api/sites/:siteId/comments`
  - bulk moderation and report clearing.
- `DELETE /api/sites/:siteId/comments/:commentId`
  - admin deletion with reply handling.
- `GET|POST /api/sites/:siteId/comments/:commentId/report`
  - report reason discovery and visitor report submission.
- `GET /api/sites/:siteId/comments/report-reasons`
  - cache-safe report reason discovery.
- `GET|POST|DELETE /api/sites/:siteId/comments/blocklist`
  - admin blocklist management.

Execution status (2026-02-24):
- Anti-bot fields (`requestId`, `startedAt`, `honeypot`) are now sent from the comment renderer and checked in both page/post comment submit routes.
- Shared store now includes comment classification with validation, timing, honeypot, duplicate and rate-limit checks.
- Parent-thread integrity is now validated in API routes before comment creation.
- Report routes, report-reason discovery, site-level comment lists, blocklist management, single-comment moderation, deletion, selected-comment bulk approve/reject/spam/block controls, and bulk report clearing are implemented.
- Remaining for parity: export/report analytics depth, block-level spam tuning, and live database certification of the full moderation workflow.

### 13.4 What frontend should expect from page/blog render APIs

Core public read contract:
- `GET /api/sites/:siteId/render?path=/...`
- `GET /api/sites/:siteId/pages?path=/...` or `GET /api/sites/:siteId/pages?slug=...`
- `GET /api/sites/:siteId/blog?status=published&limit=&offset=&category=&tag=&author=`
- `GET /api/sites/:siteId/blog?slug=...`
- `GET /api/sites/:siteId/blog/rss`
- `GET /api/sites/:siteId/blog/categories`, `/tags`, and `/authors`

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
