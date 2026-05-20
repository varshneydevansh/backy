# Backy Full CMS Parity Specification

**Date:** 2026-02-27  
**Target:** Open-source Wix/Canva/Figma-like CMS backend (editor-agnostic) with secure `backy-admin` + public-ready APIs for any frontend

## 0) Vision and success criteria

`backy` should be a production-grade, self-hostable CMS platform core where:
- Editors are first-class in `backy-admin`, but not coupled to any specific frontend.
- Public consumers use `backy-public` API contracts only.
- Content, form, comment, and media workflows are complete, auditable, and versioned.
- External teams can swap the Admin UI with custom frontends while reusing the same API contracts.

### Success criteria (release readiness)
- 90%+ of core editor actions persist to DB with revision metadata.
- API contract parity across admin/public for all mutating and read flows.
- Public pages render only approved/published content with stable routing semantics.
- End-to-end anti-spam and moderation pipelines for forms/comments.
- Deployment checklist exists for `backy-admin`, `backy-public`, and shared DB package.
- External frontend can render pages, submit forms, read comments, and consume public read APIs without admin internals.

## 1) Phase completion status (current snapshot)

The canonical page-surface audit now tracks the platform at **39 Ready / 6 Partial / 0 Prototype / 0 Missing**. The remaining Partial gates are configured Forms and SDK Supabase/Postgres service-data gates plus live Settings and Commerce provider certification. Local editor parity for rich-text table/list depth, imported list-indent edits, responsive breakpoints, grouping, and long-session stress is covered by focused smoke paths and is no longer counted as a Partial gate.

### Phase 0/1 (Contracts + persistence + auth) — **Ready baseline with external certification gates**
**Done**
- Shared contract upgrades for form/comment types in `packages/core/src/types/index.ts`.
- Public auth bridge added (`apps/public/src/lib/backyAuthBridge.ts`, `apps/public/src/hooks/useBackyAuthBridge.ts`).
- Public routes moved significantly toward contract compatibility and robust parsing.
- Master roadmap for execution is now tracked in `specs/phase-docs/backy-headless-cms-platform-phase-roadmap-v1.md`, with current A–J completion status in `specs/phase-docs/backy-phase-a-j-completion-spec.md`.
- The backend auth/session/RBAC baseline is now implemented through `apps/public` auth routes, the httpOnly `backy_admin_session` cookie, Supabase Auth support, MFA, route guards, and server-side site/team scoping coverage.
- Admin page/content save paths now use authenticated admin APIs and repository-backed persistence paths instead of treating local mock state as the source of truth.
- Release, database, Forms Postgres, SDK Postgres, Settings provider, Commerce provider, RBAC, site-scope, and auth preflight/smoke gates document the current backend-backed baseline.

**Remaining certification**
- Run the configured Forms and SDK Supabase/Postgres service-data gates against a migrated disposable database.
- Certify live Settings provider connections, live Commerce provider flows, and external provider-managed webhooks.
- Continue shrinking any demo fixtures to non-authoritative local development paths.

### Phase 2 (Editor action wiring) — **Ready baseline with focused regression guards**
**Done**
- Multiple editor UX improvements landed (selection edge handling, rich text control alignment, rich list editing, interaction safety, property panel additions).
- Comment and block settings carry anti-abuse policy context through public comment payload parsing.
- Undo/redo, copy/cut/paste/duplicate/delete/grouping, multi-select, layer hierarchy preservation, save conflict handling, reload/recover paths, responsive breakpoint overrides, span-aware rich-text table ranges, selected nested-list edits, imported list-indent normalization, and long-session stress are covered by editor smoke and audit evidence.

**Remaining certification**
- Keep publish/rollback provider-backed certification tied to the release certification workflow.
- Optional expansion remains available for additional cross-browser visual-regression breadth, but no known editor-completion blocker remains in this spec slice.

### Forms/comments module — **Ready baseline with database-service certification gate**
**Done**
- Form schema expansion, settings fields, submission endpoint compatibility, reusable embed blocks, advanced validation rules, anti-spam signals, consent/retention controls, delivery retry, analytics, and contact-share status tracking are implemented for the local product scope.
- Comment moderation settings, queue/status transitions, threaded replies, reparenting, bulk actions, reporting, blocklists, notification/webhook delivery retry, analytics, export, and admin UI workflows are implemented for the local product scope.
- Analytics endpoint added (`apps/public/src/app/api/sites/[siteId]/comments/analytics/route.ts`).
- Block/report/export endpoints and identities exist:
  - `apps/public/src/app/api/sites/[siteId]/comments/blocks`
  - `apps/public/src/app/api/sites/[siteId]/comments/report-reasons`
  - `apps/public/src/app/api/sites/[siteId]/comments/export`
  - `apps/public/src/app/api/sites/[siteId]/comments/[commentId]/report`
- Export/report parity for status+request/thread/parent filters now aligned with admin and analytics calls.
- Anti-abuse policy write path now enforces strict server-side value bounds and returns actionable validation errors.
- `test:forms`, `test:contacts`, `test:comments`, repository coverage, and the Forms Postgres preflight guard the local implementation.

**Remaining certification**
- Execute `BACKY_DATABASE_DISPOSABLE_CONFIRMED=true npm run ci:forms-postgres` against a migrated disposable Supabase/Postgres service before the Forms/Contacts service-data gate can move from Partial to Ready.

### Core composition / CMS blocks — **Ready baseline with reusable-section regression guards**
**Done**
- Form/comment-related blocks and renderer coverage introduced.
- Reusable-section APIs persist saved canvas section patterns, expose active sections publicly, support version history, optimistic conflict guards, export/import, restore, instance discovery, stale-source reporting, and bulk refresh of synced instances.
- Page/blog creation can seed editable content from frontend-design template registries and preserve design provenance.
- Built-in starter page templates, frontend-design template-backed pages, collection dataset list/detail pages, and saved reusable-section canvas content are covered in mobile/tablet hosted previews.

**Remaining certification**
- No known local composition blocker remains in this spec slice; keep reusable-section, page-create, renderer, and SDK contract smokes in the release preflight path as new block types ship.

### Public API hardening — **Ready baseline with SDK/Postgres certification gate**
**Done**
- Public render, manifest, OpenAPI, generated SDK, media, forms, comments, commerce catalog/order, interactive component, and frontend handoff contracts are locally guarded.
- Public routes expose stable Backy contract/cache headers, published/preview behavior, route resolution, moderation-aware forms/comments, scoped media, reusable sections, and external-frontend-safe payloads without requiring admin internals.
- `test:frontend-contract-types`, `test:page-renderer`, `test:public-security`, `test:sdk-postgres-preflight-contract`, and the generated SDK smoke guard the local public API surface.

**Remaining certification**
- Execute `BACKY_DATABASE_DISPOSABLE_CONFIRMED=true npm run ci:sdk-postgres-smoke` against a migrated disposable Supabase/Postgres service before the public manifest/OpenAPI/SDK database-mode gate can move from Partial to Ready.

## 2) Phase map (now + future)

## Phase A: Foundation and source-of-truth
- Objective: single contract, dual persistence boundary, secure baseline.
- Outcomes:
  - `packages/core` owns canonical editor/content/API contracts.
  - Admin and public use explicit boundary services (no direct cross-reads).
  - Route/session guards and RBAC baseline in admin.
  - Supabase-backed persistence (or adapter) for sites/pages/forms/comments/media.

### Key work
1. Contract schema normalization:
   - `packages/core/src/types/index.ts` for element, page, form, comment, media contracts.
2. Boundary adapters:
   - Keep `apps/admin/src/stores` demo fixtures constrained to local development and non-authoritative preview flows.
   - `apps/public/src/lib/backyStore.ts` becomes adapter facade with DB-backed implementations.
3. Auth baseline:
   - `packages/auth` route middleware wired in `apps/admin/src/routes/__root.tsx`.
   - Role matrix for owner/admin/editor/viewer and scoped entities.

### Exit criteria
- Mutation-critical paths in admin/public use backend-backed sources of truth, with mock/demo fixtures limited to explicit local fallback paths.
- 401/403 behavior for protected routes.
- Canonical site/page lookup works from DB in both apps.

## Phase B: Editor action graph & deterministic content operations
- Objective: editor actions are safe, undoable, and persisted.
- Outcomes:
  - Full interaction model for layer/selection/history.
  - Copy/duplicate/delete workflows preserve hierarchy and IDs.
  - Save/publish/reload/recover from latest revision.

### Key work
1. Selection and edit stability:
   - Fix pointer and focus boundaries across text/containers.
2. Action graph:
   - Add command patterns for element CRUD + transform operations.
3. State reconciliation:
   - Save produces immutable payload + revision reference.
4. Publish workflow:
   - Draft -> published -> archived transitions with guardrails.

### Exit criteria
- Undo/redo works for the action set: add/edit/move/resize/duplicate/delete.
- Reload after save shows latest persisted payload.
- Publish state immediately reflected in public route resolution.

## Phase C: Forms, contact-share and anti-spam
- Objective: production-ready submission behavior with moderation.
- Outcomes:
  - Field-level schema validation.
  - Queue/status transitions with audit trail.
  - Contact-share dedupe and webhook/email hooks.

### Key work
1. Canonical schema enforcement:
   - strict field validation + alias compatibility layer.
2. Submission moderation:
   - status lifecycle and admin review workflows.
3. Anti-abuse:
   - rate limit + honeypot + timing + duplicate fingerprinting.
4. Admin operations:
   - queue filters and bulk updates.

### Exit criteria
- Public form endpoints return field-level structured errors.
- `pending/approved/rejected/spam` status machine implemented consistently.
- Contact share dedupe + reportable metadata and webhook events.

## Phase D: Comments and social moderation engine
- Objective: comment threading, reporting, moderation actions and abuse governance.
- Outcomes:
  - Public default read hides non-approved content.
- Threaded replies and report reasons tracked.
- Queue metrics and export.

### Key work
1. Default-read policy:
   - comments endpoint returns approved by default.
2. Moderation workflows:
  - bulk operations and queue views by status/requestId/target.
3. Abuse control:
   - escalate repeated offenders, temporary blocks, optional reason taxonomy.
4. Analytics:
   - reason trends, throughput, blocked/approved ratios.

### Exit criteria
- public pages render approved threads only unless explicitly requested.
- admin can process bulk queue actions with deterministic side effects.

## Phase E: Core CMS composition and template system
- Objective: shift from one-off elements to reusable section/page templates.
- Outcomes:
  - Section/container/nav/header/footer primitives in catalog + renderer.
  - Reusable blog/content templates and content presets.

### Key work
1. Block library:
   - add reusable composition blocks in editor catalog and renderer.
2. Template primitives:
   - base page templates and reusable post-card/list templates.
3. Style inheritance:
   - token-driven defaults and template-level overrides.

### Exit criteria
- Templates can be inserted, edited, persisted, and rendered consistently.
- Header/nav/footer behave predictably across breakpoints.

## Phase F: Public contract-first API and external frontend enablement
- Objective: external consumer can build with zero admin assumptions.
- Outcomes:
  - stable API envelope and versioned docs.
  - page/media/form/comment/read endpoints consistent.

### Key work
1. Contract-first response:
   - common `error/data/pagination/meta` conventions.
2. Read API hardening:
   - canonical paths, unpublished filtering, canonical redirects.
3. CORS/auth policy:
   - explicit public API key/Origin controls for external clients.

### Exit criteria
- Contract snapshots run against representative endpoints with no admin-only fields.
- External frontend can retrieve site pages, post feeds, media, and submit interactions.

## Phase G: Publishing, versioning, and rollout safety
- Objective: production workflow and rollback confidence.
- Outcomes:
  - scheduled publish, revisions, diffing, rollback, audit.

### Key work
1. Version model:
   - page/blog revision records with actor/timestamp.
2. Diff tooling:
   - field-level and content payload diffs for admin.
   - Page and blog editor revision cards now expose first-pass current-vs-snapshot field rows for title, route, status, SEO, taxonomy/media where applicable, canvas layer count deltas, canvas element/property change rows with expandable property drill-downs for added/removed/updated elements, and side-by-side snapshot/current visual canvas maps, plus copyable `backy.page-revision-compare.v1` and `backy.blog-revision-compare.v1` briefs for AI/custom frontend handoff. Page and blog editors also expose first-pass `backy.page-revision-graph.v1` / `backy.blog-revision-graph.v1` timeline metadata with newest/oldest node navigation; remaining work is richer branching revision graph views and higher-fidelity visual diff previews.
3. Rollback:
   - restore to prior revision and re-publish guard.
4. Safety:
   - publish lock/conflict handling for concurrent editors.

### Exit criteria
- One-click rollback exists for pages and blog posts.
- Revision history includes author/action metadata.

## Phase H: Media, SEO, localization, and visual system
- Objective: production-site quality baseline for real sites.
- Outcomes:
  - upload pipeline, media variants, site theme tokens.
  - SEO metadata and JSON-LD output.
  - locale/timezone basics and URL strategy.

### Key work
1. Media service:
   - upload/metadata validation/signed URLs/transform metadata.
2. Theme/compiler:
  - token pipeline to CSS variables in renderer.
3. SEO module:
   - canonical/og/twitter/json-ld generation and sitemap.
4. Internationalization:
  - locale/timezone + date formatting primitives.

### Exit criteria
- media and SEO APIs return contract-safe metadata.
- theme changes in admin affect public rendering.

## Phase I: Analytics, audit, governance, and operations
- Objective: observability + safety for teams.
- Outcomes:
  - editor activity logs, moderation logs, webhook/event ledger.
  - action audit export and moderation/legal retention toggles.

### Key work
1. Audit/event ledger:
   - persisted events for writes, status changes, auth events.
2. Monitoring hooks:
   - lightweight counters for views/forms/comments/report abuse.
3. Data retention policies:
   - configurable retention for logs/events/storage metadata.

### Exit criteria
- audit trails visible and exportable from admin.
- suspicious behavior metrics surfaced from API+editor logs.

## Phase J: Developer/partner experience and platform depth
- Objective: make `backy` easy to consume by custom frontends and ecosystem contributors.
- Outcomes:
  - OpenAPI-like contract docs and SDK examples.
  - plugin hooks and integration adapters.

### Key work
1. Documentation:
   - API schema docs + migration notes + frontend examples.
2. SDK generation:
   - typed client for public endpoints.
3. Extension hooks:
   - form processors, moderation hooks, content webhooks.

### Exit criteria
- A third-party frontend demo built from only public contracts.
- clear plugin API for auth/webhook processors.

## 3) Suggested execution order

1. Finalize Phase A completion.
2. Complete Phase B to remove editor instability.
3. Finish Phase C and D together for content interaction completeness.
4. Deliver Phase E for composition scalability.
5. Lock Phase F for external frontend confidence.
6. Complete G/H/F in parallel with guardrails.
7. Finish I/J after core flows are stable.

## 4) Risks and sequencing notes
- Keep anti-regression windows small: avoid multi-file refactors without adapter layers.
- Editor work and API work should not run in parallel when touching shared contracts.
- DB migration risk is high; add adapter compatibility wrappers first (read-through, write-through) before switching hard.
- Contract drift risk grows if admin and renderer diverge; enforce shared types in CI-like checks.

## 5) Deliverable list
- `specs/backy-full-parity-roadmap-spec.md` (this document)
- `specs/phase-c-completion-plan.md` (detailed execution of current phase)
- Future phase plans now live under:
  - `specs/implementation-plans/phase-a-contract-persistence-auth-plan.md`
  - `specs/implementation-plans/phase-b-editor-action-wiring-plan.md`
  - `specs/implementation-plans/phase-c-form-engine-plan.md`
  - `specs/implementation-plans/phase-d-comment-moderation-plan.md`
  - `specs/implementation-plans/phase-e-core-cms-composition-plan.md`
  - `specs/implementation-plans/phase-f-public-api-first-plan.md`
- `specs/implementation-plans/phase-g-versioning-deploy-plan.md`
  - `specs/implementation-plans/phase-h-media-seo-localization-plan.md`
  - `specs/implementation-plans/phase-i-analytics-audit-governance-plan.md`
  - `specs/implementation-plans/phase-j-extensibility-platform-plan.md`
- `specs/implementation-plans/four-day-fast-track-execution-plan.md` (compressed execution schedule)

## 6) Current recommendation
- Accept this as the canonical roadmap before next implementation pass.
- Keep the next work split into atomic, testable tasks per phase to avoid destabilizing editor and API simultaneously.
- Use the implementation-plans folder as the default execution source for next-phase work.
