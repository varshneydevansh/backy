# Backy Headless CMS Platform Roadmap (Wix/Canva/Figma-equivalent) — v2

**Date:** 2026-02-26  
**Goal:** build `backy` into a backend-first CMS platform that ships a first-class admin editor (`backy-admin`) and a contract-complete, custom-frontend-friendly public API (`backy-public`).

## 0) What “done” means for this roadmap

Backy is complete when an external team can:

- Use `backy-admin` to author content, moderate comments/forms, configure blocks, and publish safely.
- Use a non-Backy frontend that only consumes `backy-public` contracts to read pages/media/forms/comments/submissions.
- Run a 1–2 day admin session and a 1–2 day external frontend integration session without patching internals.

## 1) Current execution status snapshot (2026-02-26)

| Phase | Status | In this repo |
| --- | --- | --- |
| A: Contracts + persistence + auth | Partial | contract hardening in place; route/session/RBAC still open |
| B: Editor action wiring | Partial | selection and rendering stability improved; undo/redo/copy/duplicate/delete and save/reload persistence still pending |
| C: Forms/comments production module | Near-complete | moderation + anti-abuse + block/report/export mostly present; queue ergonomics + anti-abuse telemetry UX now in final hardening pass |
| D: Core moderation engine | Partial | anti-abuse counters and reporting exist; thread-first workflows and advanced moderation actions need parity finishing |
| E: CMS composition primitives | Partial | core blocks started (form/comment); reusable section/container/nav/header/footer/blog templates still pending |
| F: Public API hardening | Partial | endpoint parsing/enforcement for forms/comments improved; envelope + resolver consistency still pending |
| G: Publishing/versioning/deploy | Partial | not production safe yet |
| H: Media/SEO/localization | Partial/minimal | upload/meta/SEO/compiler/internationalization partial |
| I: Analytics/audit/governance | Partial | counters/events exist in-memory; immutable audit/export and retention controls open |
| J: Extensibility platform | Minimal | SDK/hooks/plugin examples and integration patterns pending |

## 2) Phase A — Contracts + persistence boundaries + auth

### Objective
Stop mixed mock/mock-like flows, introduce robust auth/session boundaries, and make `backy-admin` and `backy-public` consume same immutable contracts.

### Scope
- `@backy-cms/core`: canonical contract finalization for pages/form/comments/comment-policy.
- `apps/admin`: route-level session guards + role checks; permission matrix owner/admin/editor/viewer.
- `apps/public`: DB-facing read adapters; no admin-store writes.

### Acceptance criteria
- Unauthorized admin route action returns `401/403` and never mutates records.
- Same site and content identity resolves by slug/id consistently across admin/public entry points.
- `backy-public` routes reject internal admin-only fields.
- No write-critical admin path depends directly on `mockStore` for persistence truth.

### Recommended 2-day work block
- Day 1: route/session guard + RBAC matrix.
- Day 2: store boundary migration for high-volume mutation reads/writes and permissioned audit.

## 3) Phase B — Editor action wiring and deterministic content workflow

### Objective
Make the authoring UI production-safe for repeated operations and deterministic persistence cycles.

### Scope
- Deterministic selection/move/resize/multi-select action graph.
- Undo/redo stack with no-op dedupe.
- copy/duplicate/delete for single and multi-selection; preserve IDs and hierarchy.
- Save → publish → reload roundtrip with revision persistence and no data-loss.

### Acceptance criteria
- Undo/redo restores geometry/style/selection across 20+ operations.
- Duplicate keeps parent-child structure and yields non-colliding element IDs.
- Delete removes descendants and does not orphan references.
- Reload after save/publish shows latest persisted payload and status.

### Recommended 2-day work block
- Day 1: history contract and clipboard/selection command stability.
- Day 2: save/publish/reload and migration-safe hydration.

## 4) Phase C — Forms and comments production module (priority block)

### Objective
Complete production parity for moderation, queue operations, anti-abuse, and export behavior.

### Scope
- Form definition field validation parity with strict response payload.
- Comment queue filters and bulk transitions.
- Export/report endpoint parity across filtered scopes.
- Anti-abuse policy tuning + telemetry surfaces in admin and route outputs.

### Acceptance criteria
- `POST` form endpoints return structured field errors and deterministic moderation status.
- `GET /comments` and `/comments/export` support same filters and parent/thread/request scopes.
- Bulk moderation (selected + matched scope) supports idempotent transitions.
- `comments/analytics` and export reports reflect the active filters used by admin UI.

### Current in-repo completion status
- ✅ strict filter propagation for parent/thread/request in admin + exports and analytics endpoints.
- ✅ blocklist CRUD + include-expired visibility.
- ✅ anti-abuse policy + telemetry fields in analytics payload.
- ⚠️ admin queue ergonomics and anti-abuse operational presets still to harden in final UX pass.

## 5) Phase D — Moderation engine parity

### Objective
Thread-aware moderation and report workflows with resilient actions.

### Scope
- `approve/reject/spam/blocked` in both individual and scope-based queues.
- report reason taxonomy and normalized reasons on report path.
- queue-level drill-down for request IDs/user/request anomalies.

### Acceptance criteria
- non-moderated comments are hidden by default in public reads unless requested.
- admin queue actions expose deterministic request-level/target-level filtering.

## 6) Phase E — Core CMS composition and templates

### Objective
Move from one-off blocks to reusable CMS block/template primitives.

### Scope
- sections/containers/layout/nav/header/footer/article/card/list templates.
- reusable blog content blocks.
- cross-app contract for catalog + renderer parity.

### Acceptance criteria
- same block contracts render identically in editor canvas and external renderer.
- templates are insertable/persistable/editable in admin.

## 7) Phase F — Public API-first hardening

### Objective
Stabilize external integration contracts and eliminate admin leakage.

### Scope
- canonical response envelope (`success/data/error/pagination`).
- canonical path + publish/visibility guards in public route resolver.
- CORS/auth policy docs + example for external frontends.

### Acceptance criteria
- 4xx/5xx response shape consistent across all public endpoints.
- external frontend can load pages/forms/comments without admin dependencies.

## 8) Phase G — Publishing, versioning, and release safety

### Objective
Give backy a safe production publish workflow.

### Scope
- revision graph and rollback.
- scheduled publish.
- conflict-safe save/reload.

### Acceptance criteria
- rollback and scheduled publish are deterministic and auditable.

## 9) Phase H — Media, SEO, localization, and visual system

### Objective
Deliver production-site quality for real deployments.

### Scope
- upload + validation + metadata indexing.
- SEO/head output + canonical/sitemap/basic i18n defaults.

### Acceptance criteria
- media lifecycle and SEO metadata are contract-safe and deterministic.

## 10) Phase I — Analytics, audit, governance

### Objective
Add governance confidence for teams.

### Scope
- immutable event stream, export snapshots, retention controls.
- moderation/form pipelines and abuse counters exported for audit.

### Acceptance criteria
- operational snapshots reproducible by date range and filters.

## 11) Phase J — Extensibility and ecosystem

### Objective
Enable teams to build custom frontends from the same contracts.

### Scope
- developer onboarding docs, API versioning, plugin extension points.
- example custom frontend adapters + hooks for form/comment hooks.

### Acceptance criteria
- 1 external frontend can be bootstrapped from docs with comment/form/page API only.

## 12) 4-day aggressive execution cadence (A/B/C closure track)

### Day 1 — A (Foundation lock)
- Lock auth/session middleware and RBAC first.
- Freeze contract shapes in `packages/core`.
- Remove remaining admin read/write mock leaks in critical comment/form moderation paths.

### Day 2 — B (Editor safety baseline)
- Finalize undo/redo and deterministic duplicate/delete.
- Make save/publish/reload idempotent with status refresh.

### Day 3 — C (Moderation queue parity)
- Close queue ergonomics in admin moderation view.
- Finish analytics/report/export parent/thread/request parity.
- Harden anti-abuse tuning and telemetry.

### Day 4 — F/QA/Docs
- Stabilize public API envelopes and route filters.
- Complete handoff docs and commit-by-commit checkpoints.
- Add extension notes for custom frontend consumption.
