# Plan: Phase I — Analytics, Auditability, and Governance

**Generated**: 2026-02-26  
**Estimated Complexity**: Medium

## Overview
Introduce platform-quality observability and governance: audit trails, moderation events, abuse detection telemetry, and retention controls. This phase is critical for production trust and enterprise readiness.

## Prerequisites
- Form/comment/admin mutation flows in place.
- Event helper utilities in `apps/public/src/lib/backyStore.ts` available.

## Sprint 1: Action and moderation observability
**Goal**: Make meaningful events queryable and exportable.

### Task 1.1: Unified event schema and write-through
- **Location**: `apps/public/src/lib/backyStore.ts`, `packages/core/src/types/index.ts`, `apps/admin/src/routes/sites.$siteId.tsx`
- **Description**:
  - Formalize event records for content writes, moderation changes, publish changes, auth actions.
- **Complexity**: 7
- **Dependencies**: Phase A and core flows
- **Acceptance Criteria**:
  - Every critical mutation emits event metadata (actor, entity, before/after).
- **Validation**:
  - Audit view for save/publish/status change.

### Task 1.2: Public analytics endpoints
- **Location**: `apps/public/src/app/api/sites/[siteId]/comments/analytics/route.ts`, `apps/public/src/app/api/sites/[siteId]/pages/route.ts`
- **Description**:
  - Extend comment/form/page activity aggregates and pagination-safe queries.
- **Complexity**: 6
- **Dependencies**: Task 1.1
- **Acceptance Criteria**:
  - Aggregates update in near-real-time for writes.
- **Validation**:
  - Compare counts from event stream and endpoint output.

### Task 1.3: Admin reporting UI
- **Location**: `apps/admin/src/routes/sites.$siteId.tsx`
- **Description**:
  - Add dashboards for moderation throughput, top report reasons, and top changes.
- **Complexity**: 6
- **Dependencies**: Task 1.2
- **Acceptance Criteria**:
  - Exportable report payload available.
- **Validation**:
  - Export and verify schema schema.

### Task 1.4: Retention and governance controls
- **Location**: `apps/admin/src/routes/settings.tsx`, `packages/database` (migration + queries)
- **Description**:
  - Add configurable retention for events and soft-delete workflows.
- **Complexity**: 5
- **Dependencies**: Task 1.3
- **Acceptance Criteria**:
  - Administrator can tune retention window and export before purge.
- **Validation**:
  - Purge simulation on test dataset.

## Testing Strategy
- Event integrity check per mutation class.
- Verify actor attribution and immutable event identity.

## Risks & Gotchas
- Incomplete actor attribution when external UI submits on behalf of service token.
- **Mitigation**: actor id required in all authenticated mutating requests.

## Rollback
- Event writes can be switched to write-only logs while retaining core functionality.
