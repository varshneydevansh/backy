# Backy Headless CMS Platform Roadmap (Wix/Canva/Figma-like)

**Version:** 1.0
**Date:** 2026-02-27
**Goal:** Build `backy-admin` as a production-class editor + `backy-public` as a headless API layer that powers a first-party UI and any third-party/custom frontend.

## 0) Product direction and success model

`backy` is an app-core platform, not a locked interface. The platform should:

- Provide a complete authoring shell in `backy-admin` (editor, moderation, publishing, analytics).
- Expose stable API contracts from `backy-public` for pages, forms, comments, media, and actions.
- Let teams swap the UI while preserving behavior by consuming the same API contract.
- Keep policy and moderation logic in backend services, not UI assumptions.

Release success means any frontend can create or render a production site with:
- persisted content + media + form + comment pipelines,
- deterministic publish semantics,
- role-based moderation,
- auditability and rollback,
- extensibility hooks for custom integrations.

## 1) Current execution status (as-of 2026-02-26)

| Phase | Status | Coverage now | Immediate blockers |
| --- | --- | --- | --- |
| A: contracts + persistence + auth | Partial | shared contracts, public auth bridge, comment/report route hardening in progress | admin/public reads still tied to mock flows in many areas, RBAC not consistently enforced |
| B: editor action wiring | Partial | selection/re-render stability work present; history primitives exist in places | undo/redo, copy/duplicate/delete cohesion, save/publish/reload determinism not complete |
| C: forms/comments production module | Near-complete | form schema/submit pipelines, anti-spam, report reasons, moderation actions, analytics present | queue ergonomics and anti-abuse policy UX still in final hardening pass; strict policy validation now enforced |
| D: moderation engine | In progress | threaded comments + anti-abuse telemetry + block endpoints and admin flows | advanced moderation actions for all paths and richer reason taxonomy still evolving |
| E: composition blocks | Partial | comment/form blocks and renderer bindings present | section/container/layout/nav/header/footer/blog templates still incomplete |
| F: API-first hardening | Partial | form/comment route compatibility and new auth-bridge usage | normalized envelopes + full route parity still pending |
| G: versioning/deploy | Partial | roadmap exists, deploy docs partially updated | full revision graph, scheduled publish, rollback still open |
| H: media + SEO + localization | Minimal in platform | basic media hooks exist | upload pipeline, theme/compiler, SEO, i18n are incomplete |
| I: analytics/audit/governance | Partial | moderation and anti-abuse counters exist in-memory | immutable audit trail, role attribution, retention policies pending |
| J: developer platform | Minimal | API contract docs/spec references exist | stable SDK/plugin API and sample frontends still needed |

## 2) How this roadmap maps to your objective

### For Wix-like authoring parity
- Rich drag/drop canvas actions with full state history, duplication, rollback and publish controls are required in Phase B.
- Shared reusable blocks + templates must exist by the end of Phase E.

### For Canva-like composition parity
- Block/catalog system should support presets, layout inheritance, and reusable section patterns in Phase E.
- Admin and external render paths should render the same element tree from contracts in Phase F.

### For WordPress-like editorial parity
- Versioning, status lifecycles, comments/forms moderation, and taxonomy-oriented structures belong to Phases B, C, D, and G.

## 3) Phase A plan — Contracts, persistence boundaries, auth

**Objective:** eliminate mock/data leakage boundaries and enforce session-aware permissions.

### Done (already in progress or landed)
- Canonical types and comment/form policy shape improvements in `packages/core/src/types/index.ts`.
- Public auth bridge and bridge identity read path in `apps/public/src/lib/backyAuthBridge.ts`.
- Comment moderation/reporting endpoints moved to contract-compatible flows (`apps/public/src/app/api/sites/[siteId]/comments/**`).

### Remaining in Phase A
1. **Store boundaries**
   - Route all admin mutations through repository-style service layer and avoid direct mock-store writes.
   - Keep `public` read path contract-oriented and explicitly reject internal-only shapes.

2. **Auth/session enforcement**
   - Add route-level middleware in `apps/admin/src/routes/__root.tsx`.
   - Implement owner/admin/editor/viewer action matrix.

3. **Persistence correctness**
   - Canonical resolvers for `sites/pages/media/forms/comments` with DB-backed reads.
   - Deterministic status machine for page/blog (`draft`, `scheduled`, `published`, `archived`).

### Acceptance
- A protected admin action with missing permission returns 401/403 and no mutation.
- Same `siteId` resolves identically from slug/id through API and route contexts.
- No route-level read in admin reads from local-only in-memory fallback in production mode.

## 4) Phase B plan — Editor action completion

**Objective:** full edit reliability for canvas operations and stable persistence cycles.

### Workstreams
- Selection + nested hit-testing parity (drag/select/read consistency).
- Command history with bounded undo/redo and no-op filtering.
- Deterministic copy/duplicate/delete for single + multi-selection.
- Save -> publish/unpublish -> reload cycle with revision snapshot + status.

### Completion checklist
- Undo/redo restores coordinates, dimensions, style props, and order exactly.
- Duplicate operation preserves nested structure and generates non-colliding IDs.
- Delete removes selected elements and descendants without orphaned references.
- Save writes revision metadata and status with reload reflecting latest server state.

## 5) Phase C plan — Forms and comments production module (priority block)

**Objective:** production-ready interactions for public submissions and moderation.

### Done (recently landed)
- form submission compatibility, anti-abuse fields, status machine states in core routes.
- comment anti-abuse policy parsing + thresholds + auto-block flows.
- comment analytics and report reason plumbing in public store.
- moderation export path (`comments/export`) and block endpoints for comment identity blocks.

### Must still close
1. **Form moderation hardening**
   - Strict field-level validation per form definition.
   - Consistent error payload (field + code + message).

2. **Comment moderation queue parity**
- Bulk transitions, filter by requestId/target/status, and admin-only action consistency.
- Report export + audit summary in admin.

3. **Anti-abuse governance**
- User/request thresholds and rate controls per block policy.
- Abuse telemetry surfaced in `analytics` and surfaced in admin dashboards.

### Acceptance
- Valid comment/form payload never silently downgrades to ambiguous success.
- Public comment read defaults to approved threads and applies status filters when explicitly requested.
- Moderation queue actions are idempotent and preserve actor/request provenance.

## 6) Phase D — Comment moderation parity

- thread-aware read/write,
- report reasons,
- block/unblock lifecycle,
- moderation analytics export/summaries,
- reversible review/audit traces.

### Must-have outputs
- `POST /comments/{id}/report` with allowed reason taxonomy.
- `GET /comments/blocks` for admin/admin-ops and expiry handling.
- Admin bulk actions for `pending/approved/rejected/spam/blocked`.

## 7) Phase E — Core CMS composition

- Section/container/layout primitives.
- nav/header/footer and reusable article/card/list templates.
- preset + theme inheritance behavior.

## 8) Phase F — Public API-first hardening

- Uniform response envelope (`success`, `data`, `error`, `pagination`, `requestId`).
- canonical path resolution and publish guards.
- CORS/auth/session policy for external frontend clients.

## 9) Phase G — Publishing and deployment

- revision store and immutable publish transitions,
- rollback + diff preview,
- schedule handling,
- two-app deployment doc + bootstrap checklist.

## 10) Phase H — Media, SEO, localization

- upload + metadata indexing,
- signed/derived URLs,
- theme token compiler to CSS variables,
- canonical+open-graph metadata,
- locale/timezone + formatting conventions.

## 11) Phase I — Analytics, audit, governance

- immutable event ledger,
- moderation/form/comment activity metrics,
- anti-abuse counters and retention policies,
- exportable compliance snapshots.

## 12) Phase J — Extensibility and ecosystem

- headless client SDK examples,
- plugin hooks for custom processors,
- API versioning + migration notes.

## 13) Recommended 4-day execution cadence (A/B/C completion in sprint)

### Day 1 (A)
- finish store boundaries for admin/public critical flows,
- add auth/session guard and role checks,
- remove in-place mock writes in comment/form/page mutation routes.

### Day 2 (B)
- complete command history + selection safety,
- implement deterministic copy/duplicate/delete,
- wire save/publish/reload flows to persisted route layer.

### Day 3 (C)
- close form validation + moderation queue parity,
- close comment anti-abuse hardening + request identity controls,
- complete comment blocklist CRUD and moderation export parity checks.

### Day 4 (Quality and docs)
- normalize public API envelopes,
- ensure export/analytics/report reasons and filters are parity-consistent,
- update docs for external frontend onboarding and API examples.

## 14) Engineering constraints

- Keep all changes atomic and commit-sized.
- Preserve backward-compatibility for existing payload shapes where practical.
- Prioritize `apps/public` routes and store contracts as single source for behavior.
