# Backy Phase A–J Completion Spec

**Date:** 2026-02-27  
**Goal:** Wix/Canva/WordPress-like headless CMS where `backy-admin` is the authoring control plane and any frontend can consume `backy-public` contracts.

## 1) Phase completion matrix (today)

## Objective
- Deliver a headless Wix/Canva/WordPress-class CMS platform where `backy-admin` is the authoring control plane and **any UI/UX can be used** as frontend consumer by relying only on stable `backy-public` contracts.
- Note: this is alphabetic slicing; for numeric roadmap conversion see `backy-alpha-vs-numeric-phase-progress-2026-02-27.md`.


### Phase A — Contracts, persistence boundary, auth

- status: partial
- done: core type contracts, comment anti-abuse policy, auth bridge, `canEdit`-gated moderation actions, owner role in session selector
- in-progress: DB-backed writes, server-side RBAC/session middleware, route-level ownership checks, real adapter-backed admin writes

### Phase B — Editor action wiring

- status: done
- done: selection, undo/redo surface, copy/duplicate/delete plumbing, save/reload hooks, read-only role gating, revision-aware save conflict guardrails in page edit flow
- done this pass: persistence-safe interaction boundaries for move/resize history commits, deterministic sibling insertion for duplicate, and save/reload persistence alignment on size/content mutations.
- in-progress: multi-select command stack and grouped-action semantics are deferred to Phase B+ follow-up.

### Phase C — Forms and comments production module

- status: complete-for-ops
- done: form/comment payload compatibility, moderation queue, bulk moderation, blocklist CRUD, reports, analytics, CSV/JSON export, anti-abuse policy controls and validation
- in-progress: queue ergonomics at very large scope, suspicious identity workflows, anti-abuse retention/tuning dashboards

### Phase C — forms/comments operator hardening outcome
- status: immediate-usable
- done: production-compatible moderation actions, policy tuning, export/analytics/report endpoints, anti-abuse telemetry surfaces.
- in-progress: scale-focused operator ergonomics and external SOC telemetry joins.

### Phase A → B → C run-order for this sprint

- Immediate: stabilize admin session guards + root redirect determinism (route-level auth/session loop prevention)
- Then: complete remaining Phase A DB/session boundary work and route RBAC
- Next: finish Phase B+ multi-select and grouped action command-stack expansion
- Final in this phase: finalize remaining Phase C anti-abuse and bulk queue operator ergonomics

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

1. Stabilize Phase C hardening items that affect moderation operators and anti-abuse controls.
2. Continue Phase A blocker completion for secure multi-user admin operation.
3. Close Phase B+ follow-up for multi-select command stack and grouped nested transforms.
4. Then finish Phase E envelope normalization and custom frontend contract onboarding.
5. Move through D, F, G, H, I, J only after the above are stable.

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

1. `apps/public/src/app/api/sites/[siteId]/comments/route.ts` and related moderation/report endpoints.
2. `apps/public/src/lib/backyStore.ts` anti-abuse analytics and blocklist behavior.
3. `apps/admin/src/routes/sites.$siteId.tsx` queue ergonomics, bulk actions, and action guard hardening.
4. `apps/admin/src/stores/authStore.ts` and `apps/admin/src/routes/__root.tsx` for session/role hardening.
5. `apps/admin/src/components/editor/CanvasEditor.tsx` and `apps/admin/src/routes/pages.$pageId.edit.tsx` for save/publish/reload determinism.
6. `apps/public/src/components/PageRenderer.tsx` and `apps/admin/src/components/editor/editorCatalog.tsx` for template composition rollout.

## 5) Why this stays open-source friendly

- `backy-admin` owns mutation and publish control.
- `backy-public` owns contracts for any frontend.
- all phase planning assumes a clean split between control plane and delivery plane from day one.
