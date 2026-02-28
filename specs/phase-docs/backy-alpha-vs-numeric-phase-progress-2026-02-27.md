# Backy Phase Progress Matrix (Numeric ↔ Alpha + Wix parity target)

**Date:** 2026-02-27  
**Scope:** Canonical progress map for a headless Wix/Canva/WordPress-like CMS where `backy-admin` is the control plane and any frontend can consume `backy-public`.

## 1) Are alpha and numeric phases independent?

**Yes, independent naming systems.**

- `backy-wix-canva-cms-v1-roadmap.md` and `backy-full-parity-roadmap-spec.md` use compact numeric-style milestones.
- `specs/phase-docs/backy-phase-a-j-completion-spec.md` and linked implementation plans use expanded A–J phases.
- They describe the same broad program, but alpha has finer-grained operational slices.

## 2) Practical overlap mapping (non-strict)

1. Numeric `0/1` ↔ Alpha `A` (contracts, persistence boundaries, auth/RBAC foundation).
2. Numeric `2` ↔ Alpha `B` (editor action determinism and workflow persistence).
3. Numeric `3` ↔ Alpha `C` + `D` + partial `F` (forms/comments, moderation, public read/write API stability).
4. Numeric `4` ↔ Alpha `D` + `E` (CMS composition and broader API behavior quality).
5. Numeric `5` ↔ Alpha `F` + `G` + `H` + `I` + `J` (publish/versioning, media/SEO, operations, governance, extensibility).

## 3) Canonical phase ownership for Wix-parity backend

1. `Alpha A`: make backend safe and swappable: contracts, DB/store boundaries, auth/session/RBAC.
2. `Alpha B`: make authoring reliable: deterministic editor actions and persistence cycles.
3. `Alpha C`: production interaction surface: forms/comments and moderation APIs.
4. `Alpha D`: composition depth: reusable CMS primitives and templates.
5. `Alpha E`: public contract hardening so external UIs can replace admin rendering/UI.
6. `Alpha F`: publish/version graph with rollback safety.
7. `Alpha G`: media + SEO + localization foundations.
8. `Alpha H`: analytics/audit/governance.
9. `Alpha I`: explicit external frontend onboarding + SDK path.
10. `Alpha J`: extensibility/operations (hooks, plugins, runbooks).

## 4) Verified status by phase (today)

1. **Phase A — partial**
   - **Done:** canonical type contracts, public auth bridge, comment anti-abuse policy, `canEdit` gating for moderation writes, role-aware nav filtering.
   - **In-progress:** route-level RBAC middleware, DB-backed admin/public store separation, server-side ownership checks.
   - **Pass-level completion note:** additional admin list-route mutation actions now include explicit `canEdit`/`canAdminister` handler guards in `sites.tsx`, `pages.tsx`, `blog.tsx`, `users.tsx`, and `media.tsx`.

2. **Phase B — done (single-select editor actions)**
 - **Done:** selection/re-render safety, undo/redo surface, copy/duplicate/delete plumbing, save/reload hooks, read-only role mutation blocking.
 - **Complete (this slice):** undo/redo/copy/duplicate/delete/action stack stability improved with drag/resize commit boundaries and deterministic duplicate placement; publish/reload state tracking remains tied to versioned save points.
 - **Follow-up:** nested multi-select action-stack expansion and grouped checkpoint/rollback semantics.

3. **Phase C — complete-for-ops (small operator hardening left)**
   - **Done:** form/comment payload compatibility, moderation queue, bulk transitions, analytics/export/report parity, strict anti-abuse validation.
   - **In-progress:** high-volume queue ergonomics and operator anti-abuse retention/telemetry UX.

4. **Phase D — partial**
   - **Done:** form/comment-related block additions.
   - **In-progress:** section/container/nav/header/footer/article/blog templates and reusable preset system.

5. **Phase E — partial**
   - **Done:** comments/forms-compatible route coverage and report/export operations in public API.
   - **In-progress:** response-envelope normalization, canonical resolver and pagination/query consistency across all public endpoints.

6. **Phase F — partial**
   - **Done:** save/reload and status toggles in editor pathways.
   - **In-progress:** revision history, rollback, conflict-safe publish transitions, scheduled publish/archive lifecycle.

7. **Phase G — partial**
   - **Done:** media browser and initial block renderer plumbing.
   - **In-progress:** upload/validation/transforms and SEO canonical/meta reliability.

8. **Phase H — partial**
   - **Done:** moderation counters/events baseline + export path.
   - **In-progress:** immutable audit trail, retention policies, compliance exports.

9. **Phase I — partial**
   - **Done:** preview/comment/form consumption works from public contracts.
   - **In-progress:** full external-frontend docs, SDK examples, and integration bootstrap.

10. **Phase J — early / pending**
    - **Done:** roadmap and implementation tracks exist.
    - **In-progress:** plugin/processor hooks, deployment/runbook automation.

## 5) Next closeout order

1. Finish Alpha A blockers (RBAC + adapter-backed reads/writes + ownership enforcement).
2. Close B+ follow-up for multi-select command-stack expansion (grouped transforms, selection cohorts), then proceed to C operator hardening at scale.
3. Finish C operator hardening at scale (queue ergonomics, abuse retention/alerts).
4. Lock E envelope consistency before pushing broad custom-frontend onboarding.
5. Then execute D/F/G/H/I/J in order as stability allows.

## 6) Open-source UI principle under this plan

- `backy-admin`: authoritative CMS control plane.
- `backy-public`: public contract API and render layer contract boundary.
- Any custom frontend should only depend on `backy-public` contracts and not admin internals.
