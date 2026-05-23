# Backy Phase A–J Completion Spec

**Date:** 2026-02-27  
**Goal:** Wix/Canva/WordPress-like headless CMS where `backy-admin` is the authoring control plane and any frontend can consume `backy-public` contracts.

## 1) Phase completion matrix (today)

## Objective
- Deliver a headless Wix/Canva/WordPress-class CMS platform where `backy-admin` is the authoring control plane and **any UI/UX can be used** as frontend consumer by relying only on stable `backy-public` contracts.
- Note: this is alphabetic slicing; for numeric roadmap conversion see `backy-alpha-vs-numeric-phase-progress-2026-02-27.md`.

Current audit baseline: `specs/page-completion-audit/backy-page-surface-audit.md` tracks **41 Ready / 4 Partial / 0 Prototype / 0 Missing**. Remaining Partial work is external certification: live Settings/Commerce provider execution and live provider-managed webhook/billing certification. Forms/SDK Supabase/Postgres service-data smokes passed against a migrated disposable Postgres target on 2026-05-21. Local editor parity is guarded for rich-text table/list depth, imported list-indent edits, responsive breakpoints, grouping, and long-session stress through focused smoke coverage. The release certification doctor now also verifies saved redacted Settings/Commerce provider artifact JSON through `BACKY_SETTINGS_CERTIFICATION_ARTIFACT_PATH` and `BACKY_COMMERCE_CERTIFICATION_ARTIFACT_PATH`, and completion-status `surfaceRunbooks[].artifactVerifier` exposes the same verifier command/path/schema/no-secret checks to custom admin clients before workflow outputs are treated as closure evidence.

### Phase A — Contracts, persistence boundary, auth

- status: ready baseline with database/provider certification gates
- done: core type contracts, backend-backed auth routes, httpOnly admin session cookies, Supabase Auth support, MFA, server-side RBAC/site/team scoping, repository-backed admin writes for primary content/settings flows, route-level ownership checks, and source/smoke coverage for auth/RBAC/site-scope contracts
- remaining: certify live Settings and Commerce provider families; continue restricting demo fixtures to explicit local fallback paths

### Phase B — Editor action wiring

- status: ready baseline with focused regression guards
- done: drag/resize, selection, multi-select, grouping/ungrouping with Cmd/Ctrl+G, nested-group safeguards, undo/redo, copy/cut/paste/duplicate/delete, layer ordering, responsive overrides, long-session stress smoke, save/reload, revision-aware conflict guardrails, rich-text selected range marks, imported list-indent edit normalization, list indentation/reordering, table row/column operations, spans, captions, and selected multi-cell table styling
- remaining: no known local editor-completion blocker remains in this spec slice; keep regression guards in `test:editor-workflows` as new editor controls are added

### Phase C — Forms and comments production module

- status: ready baseline with database-service certification gate
- done: form/comment payload compatibility, moderation queue, bulk moderation, blocklist CRUD, reports, analytics, CSV/JSON export, anti-abuse policy controls and validation, contact-share flows, delivery retry, consent retention/export controls, RBAC/billing enforcement, and repository persistence smoke coverage
- remaining: continue operator-depth improvements after certification; the configured Forms Supabase/Postgres service-data smoke passed on 2026-05-21

### Phase C — forms/comments operator hardening outcome
- status: ready for current local scope
- done: production-compatible moderation actions, policy tuning, export/analytics/report endpoints, anti-abuse telemetry surfaces, retention controls, and delivery retry evidence.
- remaining: external SOC telemetry joins and high-volume operational tuning after live service certification.

### Phase A → B → C run-order for this sprint

- Immediate: run live Settings and Commerce provider certification against configured external services.
- Then: keep the Forms/SDK Supabase/Postgres certification smokes in release regression paths so the certified database gates stay guarded.
- Next: keep editor regression guards current as new controls are added; do not treat optional cross-browser visual-regression expansion as a blocker for the current local editor slice.
- Final in this phase: update page-surface audit rows only when the corresponding live gate or focused smoke evidence exists.

### Phase D — Core CMS composition primitives

- status: ready baseline with reusable-section regression guards
- done: reusable-section APIs, synced instances, instance refresh/detach, export/import/restore, frontend-design template registries, built-in starter page templates, collection list/detail templates, page/blog template seeding, and mobile/tablet hosted-preview coverage
- remaining: keep reusable-section, page-create, renderer, and SDK contract smokes current as new block types and composed templates ship

### Phase E — Public API-first hardening

- status: ready baseline with SDK/Postgres certification gate
- done: public render, manifest, OpenAPI, generated SDK, media, forms, comments, commerce catalog/order, reusable-section, interactive component, preview, cache/header, and route-resolution contracts are locally guarded
- remaining: keep `BACKY_DATABASE_DISPOSABLE_CONFIRMED=true npm run ci:sdk-postgres-smoke` in release regression paths; the public manifest/OpenAPI/SDK database-mode gate moved to Ready after passing on 2026-05-21

### Phase F — Versioning and publish workflow

- status: ready baseline with provider/database certification gates
- done: page/blog save, publish, preview, archive, rollback panels, revision summaries, scheduled publish validation, conflict detection, reload-latest recovery, public visibility guards, and cache invalidation evidence are implemented for the current local scope
- remaining: keep publish/rollback behavior tied to release certification and external deployment/database gates

### Phase G — Media and SEO foundation

- status: ready baseline with provider/deployment certification gates
- done: central media upload/listing, folders, metadata, replacement/versioning, safety scanning, signed/private delivery, quotas, responsive transforms, font registration, provider diagnostics, SEO defaults, JSON-LD, sitemap/robots, redirects/gone routes, canonical handling, and cache revisions are implemented for the current local scope
- remaining: certify live storage/Supabase/Vercel/provider accounts, custom-domain delivery, secret rotation execution, and cross-channel attribution beyond provider feeds

### Phase H — Analytics, audit, and governance

- status: ready baseline with external telemetry/provider hardening
- done: admin audit activity, moderation analytics/export, form/contact consent and retention controls, provider evidence handoffs, cache invalidation events, workflow webhooks, and release certification summaries are implemented for the current local scope
- remaining: expand external SOC/telemetry joins and high-volume operational tuning after live service certification

### Phase I — External frontend enablement

- status: ready baseline with SDK/Postgres certification gate
- done: AI frontend contract schemas/examples, frontend manifest, OpenAPI, generated SDK, render payloads, editable maps, media/forms/comments/commerce/reusable-section contracts, and custom frontend onboarding evidence are locally guarded
- remaining: keep new endpoints covered by manifest/OpenAPI/SDK smokes after the SDK Postgres gate passed against a migrated disposable database on 2026-05-21

### Phase J — Extensibility and operations

- status: ready baseline with live-provider operations gates
- done: interactive component registry/runtime, sandboxed custom code components, bundle governance, migration/rollback tooling, site webhooks, release certification workflow, non-secret readiness doctor with provider artifact verification, provider preflight contracts, and setup runbooks are implemented for the current local scope
- remaining: execute live Settings/Commerce provider certification and keep plugin/provider runbooks current as new integrations ship

## 2) Execution order for “asap to usable” delivery

1. Run live Settings and Commerce provider certification for Supabase, Vercel, storage, notifications, billing/payment, catalog, tax, shipping, subscription, and provider-managed webhook paths.
2. Keep the certified Forms and SDK database smokes in release regression paths.
3. Keep focused editor regression guards current for rich-text table/list depth, imported list-indent edits, responsive breakpoints, grouping, and long-session stress.
4. Keep public contract and custom frontend onboarding evidence tied to manifest/OpenAPI/SDK smokes.
5. Defer broad new feature expansion until the remaining Partial certification rows are closed.

## 3) Acceptance criteria by phase

### A

- unauthorized writes are blocked.
- all critical admin mutations use a route-aware permission matrix.
- public read paths never use write-bound stores.

### B

- action stack handles add/edit/move/duplicate/delete/undo/redo for single and multi-select.
- save/publish/reload works after consecutive edits without stale data.
- no data-loss under reload or conflict recoveries.

### C

- queue, analytics, export, and report API counts stay in lockstep for the same filters.
- bulk moderation always returns applied vs target counts and skip counts where state changed.
- anti-abuse auto-block telemetry is observable through UI and export.

### D

- section/nav/header/footer/blog blocks are insertable, editable, and render identically in admin/public.
- templates survive save/reload and remain style-consistent.

### E

- public endpoints use consistent `data / error / pagination / meta` style envelopes.
- third-party frontend can render pages and post comments/forms from only `backy-public` endpoints.

### F

- revision IDs exist for pages/posts with rollback by id.
- publish state is deterministic and visible in both admin and public routes.

### G

- media upload, fetch, and link rendering works without admin internals.
- SEO tags and canonical behavior are deterministic for primary paths.

### H

- moderation/event/audit exports include reason and request scope filters.
- retention and purge commands are explicit and auditable.

### I

- docs and sample apps for custom frontend integration are provided.
- no admin-only assumptions are required to consume comments/forms.

### J

- extension points support one custom moderation processor.
- one-time setup runbook exists for plugin integration.

## 4) File-level priority for this pass

1. `.github/workflows/forms-postgres-contract.yml`, `.github/workflows/sdk-postgres-smoke.yml`, and release certification wiring for database service gates.
2. Settings and Commerce provider certification runners/workflows for live external provider evidence.
3. `apps/admin/src/components/editor/ActiveEditorContext.tsx`, `RichTextFormatting.tsx`, and `apps/admin/scripts/editor-drag-smoke.mjs` for focused rich-text table/list and responsive editor hardening.
4. `apps/public/src/components/PageRenderer.tsx` and hosted responsive smoke coverage for public render parity.
5. `specs/page-completion-audit/backy-page-surface-audit.md` for evidence-only status changes after gates pass.

## 5) Why this stays open-source friendly

- `backy-admin` owns mutation and publish control.
- `backy-public` owns contracts for any frontend.
- all phase planning assumes a clean split between control plane and delivery plane from day one.
