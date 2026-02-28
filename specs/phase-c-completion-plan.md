# Plan: Backy Phase C continuation toward CMS parity

**Generated**: 2026-02-26  
**Estimated Complexity**: High

## Overview
Continue the current pass from the active diff and complete the remaining Wix/Canva/WordPress parity gaps in the order:

- stabilize contracts + persistence + auth boundaries
- complete editor action wiring (selection, undo/redo, copy/duplicate/delete, save/publish/reload)
- finalize forms/comments production behavior
- complete reusable CMS composition blocks
- harden public API and canonical response contracts

This plan is part of the full set under:
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

## Prerequisites
- `apps/admin` and `apps/public` must read/write site/page/blog/form/comment payloads through DB services from `packages/database` where possible.
- `packages/core` contract types in `packages/core/src/types/index.ts` are treated as source of truth for form/comment/editor payload fields.
- Supabase configuration and auth/service-role credentials are available in environment for protected operations.

## Sprint 1: Persisted editor action baseline

**Goal**: Make editor interactions real and safe before adding deeper composition modules.

### Task 1.1: Centralize selection + drag/edit hit-testing contract
- **Location**: `apps/admin/src/components/editor/Canvas.tsx`, `apps/admin/src/components/editor/CanvasEditor.tsx`, `apps/admin/src/components/editor/RichTextBlock.tsx`
- **Description**: Fix selection logic so clicks never steal text-edit focus, pointer-capture excludes toolbar handles, and nested text blocks stay editable while parents are movable.
- **Complexity**: 8
- **Dependencies**: None
- **Acceptance Criteria**:
  - Text element can be selected with single click and edited in place.
  - Empty click does not switch selected element unexpectedly.
  - Drag-resize still works for all non-editing modes.
- **Validation**:
  - Manual scenario checklist for desktop and tablet view.
  - Reproduce: click, edit, drag, undo via shortcuts, keyboard typing.

### Task 1.2: Wire selection history (undo/redo)
- **Location**: `apps/admin/src/components/editor/CanvasEditor.tsx`, `apps/admin/src/components/editor/ActiveEditorContext.tsx`
- **Description**: Add command boundaries around selection/move/resize/content edits and expose bounded undo/redo stacks with disabled state.
- **Complexity**: 9
- **Dependencies**: Task 1.1
- **Acceptance Criteria**:
  - Undo reverts last change without breaking canvas serialization.
  - Redo re-applies only the last undone action.
  - History excludes no-op selections.
- **Validation**:
  - 10+ edit operations with chained undo/redo in-page.
  - Validate no object reference mutation leaks (reselect stable ids).

### Task 1.3: Implement duplicate/copy/delete actions
- **Location**: `apps/admin/src/components/editor/Canvas.tsx`, `apps/admin/src/components/editor/CanvasEditor.tsx`, `apps/admin/src/types/editor.ts`
- **Description**: Implement safe copy/duplicate and delete for single and multi-select while preserving responsive overrides and style props.
- **Complexity**: 8
- **Dependencies**: Task 1.2
- **Acceptance Criteria**:
  - Duplicate preserves id uniqueness and parent-child structure.
  - Delete removes selection and selected descendants deterministically.
  - Clipboard-like flow handles at least one element selection.
- **Validation**:
  - Scripted UI runbook with copy, paste/duplicate, undo, and delete cycles.

### Task 1.4: Stabilize save/publish/reload action wiring in editor
- **Location**: `apps/admin/src/routes/pages.$pageId.edit.tsx`, `apps/admin/src/routes/sites.$siteId.tsx`, `apps/admin/src/stores/mockStore.ts`
- **Description**: Bind toolbar actions to actual persistence operations and route to status transitions, including explicit draft/publication mode controls.
- **Complexity**: 8
- **Dependencies**: Task 1.3
- **Acceptance Criteria**:
  - Save stores content and status metadata.
  - Publish/unpublish toggles page state predictably.
  - Reload rehydrates latest persisted page content (including revisions).
- **Validation**:
  - Save then reopen in fresh edit session returns latest content.
  - Publish status reflected in public route resolution.

## Sprint 2: Phase 0/1 hardening continuation (contracts + persistence + auth)

**Goal**: Remove mock-store behavior from core user flows and enforce boundaries between admin/public surfaces.

### Task 2.1: Split public read store and admin write operations
- **Location**: `apps/public/src/lib/backyStore.ts`, `packages/database/src/queries/*`, `packages/database/src/client.ts`
- **Description**: Convert in-memory `backyStore` reads used by public routes/page rendering into DB-backed query adapters, preserving current response shape during migration.
- **Complexity**: 10
- **Dependencies**: Sprint 1 completed
- **Acceptance Criteria**:
  - Route `/sites/[subdomain]/[[...path]]` no longer depends on seeded memory data.
- **Validation**:
  - Spot-check existing page/slugs render same before/after migration.
  - Confirm unpublished-only protection for public rendering.

### Task 2.2: Replace admin list/edit mock writes
- **Location**: `apps/admin/src/routes/sites.$siteId.tsx`, `apps/admin/src/stores/authStore.ts`, `apps/admin/src/routes/__root.tsx`, `packages/auth/src/index.ts`
- **Description**: Move create/update/list flows for sites/pages/forms/comments/submissions away from mock store usage and into API-backed services.
- **Complexity**: 9
- **Dependencies**: Task 2.1
- **Acceptance Criteria**:
  - Admin moderation actions produce server-side persisted updates.
  - No `apps/admin/src/stores/mockStore.ts` writes from page-level editor routes.
- **Validation**:
  - End-to-end runbook for update + refresh across two browser tabs.

### Task 2.3: Enforce RBAC + session checks on admin routes
- **Location**: `apps/admin/src/routes/__root.tsx`, `apps/admin/src/types/editor.ts`, `packages/auth/src`
- **Description**: Add route middleware/protectors and action-level role checks for owner/admin/editor permissions.
- **Complexity**: 7
- **Dependencies**: Task 2.2
- **Acceptance Criteria**:
  - Unauthenticated access blocked with 401/redirect.
- **Validation**:
  - Matrix of roles against list/update/delete actions.

## Sprint 3: Form engine production closure

**Goal**: Make form submissions production-grade with strict parity with submit endpoints and admin moderation UX.

### Task 3.1: Canonicalize form schema and validation pipeline
- **Location**: `packages/core/src/types/index.ts`, `apps/public/src/app/api/sites/[siteId]/forms/[formId]/submissions/route.ts`, `apps/admin/src/components/editor/editorCatalog.ts`, `apps/admin/src/components/editor/PropertyPanel.tsx`
- **Description**: Finalize `FormFieldDefinition` and `FormDefinition` contracts, enforce field-level required/type validation, and return structured field errors.
- **Complexity**: 8
- **Dependencies**: Task 2.x complete
- **Acceptance Criteria**:
- Shared submit parser accepts alias payload formats while returning strict internal validation errors.
- Field-level errors surface in public form responses and admin displays.
- **Validation**:
  - Validation matrix for text/email/url/file/checkbox/radio/select with invalid input cases.

### Task 3.2: Production submission moderation workflow
- **Location**: `apps/admin/src/routes/sites.$siteId.tsx`, `apps/public/src/app/api/sites/[siteId]/forms/[formId]/submissions/route.ts`, `apps/public/src/lib/backyStore.ts`
- **Description**: Add review queue states, status transitions, and audit trail for submission and contact-share records.
- **Complexity**: 7
- **Dependencies**: Task 3.1
- **Acceptance Criteria**:
  - Admin can set `pending`, `approved`, `rejected`, `spam`.
  - Contact-share dedupe path is documented and deterministic.
- **Validation**:
  - API calls + admin UI action flow for status update and notes.

### Task 3.3: Form export + filtering
- **Location**: `apps/admin/src/routes/sites.$siteId.tsx`, `apps/public/src/app/api/sites/[siteId]/forms/[formId]/submissions/route.ts`
- **Description**: Ensure paginated export and filtering by status/requestId/field exists for both API and admin.
- **Complexity**: 6
- **Dependencies**: Task 3.2
- **Acceptance Criteria**:
  - Admin export list includes all required moderation fields.
- **Validation**:
  - Export of >1 page payload with deterministic ordering.

## Sprint 4: Comment moderation parity

**Goal**: Reach consistent public/private moderation flows with report and anti-abuse controls.

### Task 4.1: Complete moderation actions + queue ergonomics
- **Location**: `apps/admin/src/routes/sites.$siteId.tsx`, `apps/public/src/app/api/sites/[siteId]/comments/route.ts`, `apps/public/src/app/api/sites/[siteId]/pages/[pageId]/comments/route.ts`
- **Description**: Add queue-level filters, bulk actions, and fast path actions for pending/spam/blocked/approved transitions.
- **Complexity**: 8
- **Dependencies**: Sprint 3
- **Acceptance Criteria**:
  - Bulk transition endpoint supports mixed selections.
  - Queue has requestId + target filters.
- **Validation**:
  - Admin can process 20 mixed comments in one operation and verify status change.

### Task 4.2: Public moderation-by-default behavior
- **Location**: `apps/public/src/components/PageRenderer.tsx`, `apps/public/src/app/api/sites/[siteId]/comments/route.ts`, `apps/public/src/app/api/sites/[siteId]/blog/[postId]/comments/route.ts`
- **Description**: Ensure read endpoints expose approved comments by default and pending states remain hidden unless explicitly requested.
- **Complexity**: 6
- **Dependencies**: Task 4.1
- **Acceptance Criteria**:
  - `/comments` returns approved only by default.
- **Validation**:
  - Public page renders with thread hierarchy consistent to moderation state.

### Task 4.3: Extend abuse controls and reporting
- **Location**: `apps/public/src/lib/backyStore.ts`, `apps/public/src/app/api/sites/[siteId]/comments/analytics/route.ts`, `apps/admin/src/routes/sites.$siteId.tsx`
- **Description**: Finalize anti-abuse classification flags, report reason taxonomy, and analytics-driven moderation insights.
- **Complexity**: 7
- **Dependencies**: Task 4.2
- **Acceptance Criteria**:
  - Repeated spam/double-submit is consistently flagged.
- **Validation**:
  - Analytics endpoint reflects report reasons, block actions, and throughput signals.

## Sprint 5: Core CMS composition and reuse blocks

**Goal**: Add reusable section/container/nav/header/footer/blog blocks without changing editor/public rendering contract.

### Task 5.1: Define composable block primitives
- **Location**: `apps/admin/src/components/editor/editorCatalog.ts`, `apps/public/src/components/PageRenderer.tsx`, `packages/core/src/types/index.ts`
- **Description**: Add block IDs/settings for section, container, nav, header, footer, latest-posts, post-card, category-list, and related-content templates.
- **Complexity**: 9
- **Dependencies**: Stable editor action stack (Sprint 1) and shared contracts.
- **Acceptance Criteria**:
  - All blocks render in admin catalog and public renderer.
- **Validation**:
  - Add page with each block type and verify style + content parity.

### Task 5.2: Preset and style inheritance
- **Location**: `apps/admin/src/components/editor/PropertyPanel.tsx`, `apps/public/src/components/PageRenderer.tsx`
- **Description**: Add preset-aware defaults and block-level style inheritance from theme tokens.
- **Complexity**: 7
- **Dependencies**: Task 5.1
- **Acceptance Criteria**:
  - Presets apply consistent spacing/typography without inline one-off overrides.
- **Validation**:
  - Compare 3 preset renderings in desktop + mobile preview.

## Sprint 6: Public API hardening for external frontends

**Goal**: Finalize contract-first public surface so external consumers can run without admin internals.

### Task 6.1: Unify site/page/blog/form/comment contract payloads
- **Location**: `apps/public/src/app/api/sites/[siteId]/route.ts`, `apps/public/src/app/api/sites/[siteId]/pages/route.ts`, `apps/public/src/app/api/sites/[siteId]/forms/[formId]/submissions/route.ts`, `apps/public/src/app/api/sites/[siteId]/comments/route.ts`, `apps/public/src/app/api/sites/[siteId]/comments/analytics/route.ts`
- **Description**: Normalize envelope keys (`status`, `data`, `error`, `pagination`) and error semantics for external clients.
- **Complexity**: 8
- **Dependencies**: Sprint 2,4
- **Acceptance Criteria**:
  - 4xx/5xx payload shape is consistent across all public endpoints.
- **Validation**:
  - Contract fixtures for each endpoint and 1 manual frontend smoke path.

### Task 6.2: Route resolver correctness and caching
- **Location**: `apps/public/src/app/sites/[subdomain]/[[...path]]/page.tsx`, `apps/public/src/lib/backyStore.ts`
- **Description**: Implement canonical 404/301 behavior for path variants, trailing slash normalization, and publish guards.
- **Complexity**: 7
- **Dependencies**: Task 6.1
- **Acceptance Criteria**:
  - Unpublished content never served by public route.
  - Trailing slash behavior is deterministic.
- **Validation**:
  - Path matrix across `/`, `/index`, `/index/`, and `/foo/`.

## Testing Strategy
- Per sprint, complete a 10-step manual verification script for admin and public.
- For each modified API route, add a fixture-driven curl checklist for happy-path, unauthorized, and validation failure.
- For each editor sprint, use fixed action-order checks: select, type, undo, redo, duplicate, delete, save, publish, reload.

## Potential Risks & Gotchas
- Migration from `backyStore` to DB can introduce schema mismatch; protect with adapter boundary and snapshot fixtures.
- Editor history stacks can grow without cap and degrade memory; enforce bounded stack length.
- Mixed action permissions can create unauthorized writes unless admin route and public bridge identity are consistently enforced.
- Form field aliases accepted by legacy submit payloads may conflict with strict new validation; keep migration compatibility mode.
- Route canonicalization changes can break existing links; keep old aliases redirecting to canonical paths in phase 1 then drop later.

## Rollback Plan
- Keep each task as separate commits and release behind non-functional feature flags.
- If route payload contract breaks external clients, revert only API payload layer files first:
  - `apps/public/src/app/api/sites/[siteId]/comments/route.ts`
  - `apps/public/src/app/api/sites/[siteId]/forms/[formId]/submissions/route.ts`
  - `apps/public/src/lib/backyStore.ts`
- If editor action regressions appear, revert only `Canvas*` and `pages.$pageId.edit.tsx` action wiring and fall back to no-op actions while preserving schema updates.
