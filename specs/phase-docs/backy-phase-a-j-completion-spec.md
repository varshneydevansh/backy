# Backy Phase A–J Completion Spec

**Date:** 2026-02-27  
**Goal:** Wix/Canva/WordPress-like headless CMS where `backy-admin` is the authoring control plane and any frontend can consume `backy-public` contracts.

## 1) Phase completion matrix (today)

## Objective
- Deliver a headless Wix/Canva/WordPress-class CMS platform where `backy-admin` is the authoring control plane and **any UI/UX can be used** as frontend consumer by relying only on stable `backy-public` contracts.
- Note: this is alphabetic slicing; for numeric roadmap conversion see `backy-alpha-vs-numeric-phase-progress-2026-02-27.md`.

Current audit baseline: `specs/page-completion-audit/backy-page-surface-audit.md` tracks **39 Ready / 6 Partial / 0 Prototype / 0 Missing**. Remaining Partial work is external certification: configured Forms/SDK Supabase/Postgres service-data smokes, live Settings/Commerce provider execution, and live provider-managed webhook/billing certification. Local editor follow-up is now depth hardening around remaining rich-text table/list edge cases and broader responsive pixel QA, not basic drag/drop/grouping/persistence.

### Phase A — Contracts, persistence boundary, auth

- status: ready baseline with database/provider certification gates
- done: core type contracts, backend-backed auth routes, httpOnly admin session cookies, Supabase Auth support, MFA, server-side RBAC/site/team scoping, repository-backed admin writes for primary content/settings flows, route-level ownership checks, and source/smoke coverage for auth/RBAC/site-scope contracts
- remaining: run configured Forms and SDK Supabase/Postgres service-data gates against a migrated disposable database; continue restricting demo fixtures to explicit local fallback paths

### Phase B — Editor action wiring

- status: ready baseline with deeper parity hardening
- done: drag/resize, selection, multi-select, grouping/ungrouping with Cmd/Ctrl+G, nested-group safeguards, undo/redo, copy/cut/paste/duplicate/delete, layer ordering, responsive overrides, save/reload, revision-aware conflict guardrails, rich-text selected range marks, list indentation/reordering, table row/column operations, spans, captions, and selected multi-cell table styling
- remaining: expand the last rich-text table/list edge-case coverage and broader responsive pixel-level QA across full page templates

### Phase C — Forms and comments production module

- status: ready baseline with database-service certification gate
- done: form/comment payload compatibility, moderation queue, bulk moderation, blocklist CRUD, reports, analytics, CSV/JSON export, anti-abuse policy controls and validation, contact-share flows, delivery retry, consent retention/export controls, RBAC/billing enforcement, and repository persistence smoke coverage
- remaining: run the configured Forms Supabase/Postgres service-data smoke against a migrated disposable database; continue operator-depth improvements after certification

### Phase C — forms/comments operator hardening outcome
- status: ready for current local scope
- done: production-compatible moderation actions, policy tuning, export/analytics/report endpoints, anti-abuse telemetry surfaces, retention controls, and delivery retry evidence.
- remaining: external SOC telemetry joins and high-volume operational tuning after live service certification.

### Phase A → B → C run-order for this sprint

- Immediate: run or unblock the configured Forms/SDK Supabase/Postgres service-data gates with a disposable migrated database.
- Then: run live Settings and Commerce provider certification against configured external services.
- Next: keep tightening editor depth where local work remains, especially rich-text table/list edge cases and full-template responsive pixel QA.
- Final in this phase: update page-surface audit rows only when the corresponding live gate or focused smoke evidence exists.

### Phase D — Core CMS composition primitives

- status: partial
- done: form/comment-related block additions and renderer coverage
- in-progress: section/container/nav/header/footer/blog/content templates, preset libraries, reusable theme-aware block systems

### Phase E — Public API-first hardening

- status: partial
- done: comment/export/report endpoints and anti-abuse endpoints in `backy-public`
- in-progress: consistent envelope standards across all public endpoints, canonical resolver behavior, stricter pagination/query error contracts

### Phase F — Versioning and publish workflow

- status: partial
- done: save/reload and status toggles exist in key editor flows
- in-progress: revision history, rollback, conflict detection, scheduled publish, archive lifecycle

### Phase G — Media and SEO foundation

- status: partial
- done: media browser and block render plumbing
- in-progress: upload pipeline, MIME validation, transformations, SEO metadata + canonical/head output reliability

### Phase H — Analytics, audit, and governance

- status: partial
- done: events and moderation analytics with comment-specific counters and export path
- in-progress: immutable audit model, retention policies, compliance exports, operational dashboards

### Phase I — External frontend enablement

- status: partial
- done: public contracts stable enough for preview and comment/form consumption
- in-progress: full contract docs, frontend bootstrap examples, typed SDK surface, webhook/extensibility docs

### Phase J — Extensibility and operations

- status: pending
- done: roadmaps and implementation tracks are in place
- in-progress: plugin hooks, processor hooks, deployment/runbook automation

## 2) Execution order for “asap to usable” delivery

1. Run the database certification gates for Forms and SDK manifests against a disposable migrated Supabase/Postgres service.
2. Run live Settings and Commerce provider certification for Supabase, Vercel, storage, notifications, billing/payment, catalog, tax, shipping, subscription, and provider-managed webhook paths.
3. Continue focused editor hardening on rich-text table/list edge cases and responsive pixel QA.
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
