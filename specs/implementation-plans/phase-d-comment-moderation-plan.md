# Plan: Phase D — Comment Engine and Moderation Parity

**Generated**: 2026-02-26  
**Estimated Complexity**: High

## Overview
Deliver a production comment system with threaded discussions, anti-abuse controls, queue workflows, and report analytics suitable for a CMS backend consumed by any frontend.

## Prerequisites
- Phase A boundaries + Phase C anti-spam primitives in place.
- Comment contracts complete in `packages/core`.

## Sprint 1: Moderation and thread model
**Goal**: Ensure public reads and admin controls follow a strict, auditable status model.

### Task 1.1: Default moderation visibility policy
- **Location**: `apps/public/src/app/api/sites/[siteId]/comments/route.ts`, `apps/public/src/app/api/sites/[siteId]/pages/[pageId]/comments/route.ts`, `apps/public/src/app/api/sites/[siteId]/blog/[postId]/comments/route.ts`
- **Description**:
  - Return approved comments by default.
  - Explicitly support status filters via query when admin or test contexts request.
- **Complexity**: 7
- **Dependencies**: Phase C
- **Acceptance Criteria**:
  - Non-admin public reads never include pending/spam/blocked by default.
- **Validation**:
  - Public endpoint smoke for default + explicit filter modes.

### Task 1.2: Threaded comments and report flow
- **Location**: `apps/public/src/components/PageRenderer.tsx`, `apps/public/src/lib/backyStore.ts`, `apps/public/src/app/api/sites/[siteId]/comments/analytics/route.ts`
- **Description**:
  - Enforce parent/child relationship, threadId propagation, and report reason capture.
- **Complexity**: 8
- **Dependencies**: Task 1.1
- **Acceptance Criteria**:
  - Nested replies render in thread order.
  - Report reasons are recorded with counts.
- **Validation**:
  - Thread creation + report + readback path.

### Task 1.3: Bulk moderation and queue operations
- **Location**: `apps/admin/src/routes/sites.$siteId.tsx`
- **Description**:
  - Add bulk approve/reject/spam/block actions and queue filters.
- **Complexity**: 7
- **Dependencies**: Task 1.2
- **Acceptance Criteria**:
  - Mixed selection bulk updates atomically.
- **Validation**:
  - Update at least 20 items in one queue batch.

### Task 1.4: Anti-abuse controls and identity signals
- **Location**: `apps/public/src/lib/backyStore.ts`, `apps/admin/src/routes/sites.$siteId.tsx`
- **Description**:
  - Expand duplicate, timing, and report-threshold gates.
  - Expose blocked/abusive identity telemetry.
- **Complexity**: 6
- **Dependencies**: Task 1.3
- **Acceptance Criteria**:
  - Duplicate/thread-spam patterns are throttled deterministically.
- **Validation**:
  - Replay test for high-frequency submissions.

### Task 1.5: Moderation analytics and export
- **Location**: `apps/public/src/app/api/sites/[siteId]/comments/analytics/route.ts`, `apps/admin/src/routes/sites.$siteId.tsx`
- **Description**:
  - Add top report reasons, queue trend, and throughput metrics in admin view.
- **Complexity**: 6
- **Dependencies**: Task 1.4
- **Acceptance Criteria**:
  - Analytics endpoint returns stable schema with total + by-status + reason counts.
- **Validation**:
  - Exported analytics JSON matches live query totals.

## Testing Strategy
- Compare endpoint output between public and admin moderation actions before and after each update.

## Risks & Mitigations
- Report false positives harming good users.
- **Mitigation**: graduated actions and reversible moderation state.

## Rollback
- Keep moderation rules configurable; disable strict spam mode quickly via config.
