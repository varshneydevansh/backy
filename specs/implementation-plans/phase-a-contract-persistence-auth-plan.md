# Plan: Phase A — Contracts, Persistence Boundary, and Auth Foundation

**Generated**: 2026-02-26  
**Estimated Complexity**: High

## Overview
Finish the contract-first foundation so `backy-admin` and `backy-public` stop reading from mock/implicit stores and use explicit, role-aware DB-backed services. This phase enables safe multi-tenant CMS operations and enforces hard auth boundaries so external UIs can consume contracts without relying on admin internals.

## Prerequisites
- Supabase or DB adapter environment variables available for both apps.
- `packages/core/src/types/index.ts` accepted as canonical schema source.
- Current in-memory stores available as compatibility fallback during migration only.

## Sprint 1: Contract-first boundary migration
**Goal**: Make DB/query boundaries explicit and testable before major feature work.

### Task 1.1: Define cross-app contract facade types
- **Location**: `packages/core/src/types/index.ts`, `packages/core/src/index.ts`, `apps/admin/src/lib`, `apps/public/src/lib`
- **Description**:
  - Add typed service-result envelopes (`BackyResult`, `BackyListResult`, common error enum).
  - Introduce a shared public payload contract for pages/forms/comments/media.
  - Export shared helpers for status enums and canonical error codes.
- **Complexity**: 7
- **Dependencies**: None
- **Acceptance Criteria**:
  - Admin and public imports can resolve a single shared contract type for each entity.
  - Type aliases removed from component-local ad hoc declarations where possible.
- **Validation**:
  - `tsc` compile for touched package boundaries.

### Task 1.2: Introduce repository/service adapters
- **Location**: `packages/database/src/queries`, `apps/admin/src/lib`, `apps/public/src/lib/backyStore.ts`
- **Description**:
  - Add adapter methods for Site/Page/Blog/Media/Form/Comment/Submission.
  - Move mock list/get/create/update/delete operations behind adapter interfaces.
- **Complexity**: 9
- **Dependencies**: Task 1.1
- **Acceptance Criteria**:
  - `backyStore` exposes DB-backed read/write methods with consistent return shapes.
  - In-memory writes in admin/public flows are removed for main entity CRUD.
- **Validation**:
  - Manual fetch/save checks for one site, page, post, and form across both apps.

### Task 1.3: Replace in-place mock writes in admin admin-facing routes
- **Location**: `apps/admin/src/routes/sites.$siteId.tsx`, `apps/admin/src/routes/pages.$pageId.edit.tsx`, `apps/admin/src/routes/pages.tsx`, `apps/admin/src/routes/blog.*.tsx`, `apps/admin/src/stores/mockStore.ts`
- **Description**:
  - Route actions that mutate state should call DB adapter/service methods.
- **Complexity**: 9
- **Dependencies**: Task 1.2
- **Acceptance Criteria**:
  - Page/form/comment/site mutations persist and survive app reload.
- **Validation**:
  - Persist-modify-refresh test for each route class.

### Task 1.4: Create auth/session protection and role checks on admin routes
- **Location**: `apps/admin/src/routes/__root.tsx`, `packages/auth/src/index.ts`, `apps/admin/src/routes/login.tsx`, `apps/admin/src/stores/authStore.ts`
- **Description**:
  - Implement route middleware for auth/session validation and role scope checks.
  - Enforce `owner`, `admin`, `editor`, `viewer` matrix at action level.
- **Complexity**: 8
- **Dependencies**: Task 1.3
- **Acceptance Criteria**:
  - Unauthenticated access is blocked.
  - Unauthorized role actions fail with 403 and no state mutation.
- **Validation**:
  - Role matrix matrix test across create/update/delete/publish endpoints.

### Task 1.5: Public boundary hardening for site/page/media lookup
- **Location**: `apps/public/src/app/sites/[subdomain]/[[...path]]/page.tsx`, `apps/public/src/app/api/sites/[siteId]/pages/route.ts`, `apps/public/src/lib/backyStore.ts`
- **Description**:
  - Public app reads from canonical resolver and rejects unpublished content by default.
  - Keep include-unpublished only on explicit admin-provided contexts.
- **Complexity**: 8
- **Dependencies**: Task 1.2, Task 1.4
- **Acceptance Criteria**:
  - 404 for unpublished pages.
- **Validation**:
  - Public render smoke for published and unpublished sample pages.

## Testing Strategy
- Route-level smoke: one create, one mutate, one read each entity.
- Role checks for 401/403/200 outcomes.
- DB write/reload verification across admin and public.

## Potential Risks & Mitigations
- Adapter shape mismatch between old mock payloads and DB schemas.
- **Mitigation**: versioned migration adapter and contract test fixtures.
- Session propagation differences across edge/server.
- **Mitigation**: central token validation utility with deterministic failure responses.

## Rollback
- Disable adapter in one phase by route:
  - revert `apps/admin/src/stores/mockStore.ts` writes only, keep read path adapter for safety.
