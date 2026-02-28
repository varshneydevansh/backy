# Plan: Phase G — Publishing, Versioning, and Deployment Safety

**Generated**: 2026-02-26  
**Estimated Complexity**: High

## Overview
Introduce full publication lifecycle with revision history, rollback, scheduling, and deploy-safe defaults so custom frontend consumers can safely integrate with mutable content pipelines.

## Prerequisites
- Phases A–F in progress with persisted entities and API contracts.

## Sprint 1: Publish workflow
**Goal**: Implement status/state transitions and revision persistence.

### Task 1.1: Version model and revision store
- **Location**: `packages/database/src/queries`, `apps/public/src/lib/backyStore.ts`, `apps/admin/src/routes/pages.$pageId.edit.tsx`
- **Description**:
  - Persist page/blog post revisions with actor, timestamp, and diff metadata.
  - Keep active published reference and previous states.
- **Complexity**: 9
- **Dependencies**: Phase A/B
- **Acceptance Criteria**:
  - Each save creates revision record.
- **Validation**:
  - Restore from previous revision and compare content hash.

### Task 1.2: Status machine and schedule
- **Location**: `apps/admin/src/routes/pages.$pageId.edit.tsx`, `apps/admin/src/routes/blog.$postId.tsx`, `apps/admin/src/routes/pages.tsx`, `apps/public/src/app/sites/[subdomain]/[[...path]]/page.tsx`
- **Description**:
  - Add `draft|scheduled|published|archived` transitions and scheduler flags.
- **Complexity**: 8
- **Dependencies**: Task 1.1
- **Acceptance Criteria**:
  - Scheduled publish updates are reflected after simulated trigger boundary.
- **Validation**:
  - State transition matrix with invalid transition guard checks.

### Task 1.3: Rollback and conflict handling
- **Location**: `apps/admin/src/routes/pages.$pageId.edit.tsx`, `apps/admin/src/routes/blog.$postId.tsx`
- **Description**:
  - Add rollback action to prior revision and publish from revision selection.
- **Complexity**: 8
- **Dependencies**: Task 1.2
- **Acceptance Criteria**:
  - Rollback creates new revision, does not mutate original history.
- **Validation**:
  - Rollback then publish simulation.

### Task 1.4: Deployment safety checklist and ops docs
- **Location**: `specs`, `README.md`, `apps/admin/src/routes/index.tsx`, `apps/public/src/app/page.tsx`
- **Description**:
  - Document two-app topology, env matrix, migration flags, seed/reset behavior.
- **Complexity**: 5
- **Dependencies**: Task 1.1
- **Acceptance Criteria**:
  - New onboarding doc for local + hosted deployment.
- **Validation**:
  - Dry-run setup by one engineer using docs only.

## Testing Strategy
- End-to-end with save -> publish -> unpublish -> rollback cycles on page and blog post.

## Risks & Gotchas
- Data growth from revision history.
- **Mitigation**: archive policy and compaction tooling.

## Rollback
- Revision/rollback feature toggle + ability to disable scheduler and revert to manual publishing.
