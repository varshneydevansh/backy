# Plan: Phase C — Form Engine Completeness and Submission Pipeline

**Generated**: 2026-02-26  
**Estimated Complexity**: High

## Overview
Make forms production-safe for self-hosted and external-frontend consumers: strict field validation, robust parser compatibility, moderation queues, anti-spam, and reliable admin review operations.

## Prerequisites
- Shared element/contracts in `packages/core` for form field definitions and statuses.
- Phase A persistence boundaries active.

## Sprint 1: Submission correctness
**Goal**: Ensure all inbound form payloads are normalized and validated consistently.

### Task 1.1: Canonical form schema lock
- **Location**: `packages/core/src/types/index.ts`, `apps/public/src/app/api/sites/[siteId]/forms/[formId]/submissions/route.ts`
- **Description**:
  - Finalize `FormFieldDefinition` and validation rule types (type, required, regex, min/max, options, file/allowedTypes).
  - Accept legacy payload aliases while normalizing internal record.
- **Complexity**: 8
- **Dependencies**: Phase A
- **Acceptance Criteria**:
  - Payloads with alias keys normalize to same internal map.
- **Validation**:
  - Matrix tests for `text/email/url/file/select/checkbox/radio/list`.

### Task 1.2: Form pipeline strict validation
- **Location**: `apps/public/src/app/api/sites/[siteId]/forms/[formId]/submissions/route.ts`, `apps/public/src/lib/backyStore.ts`
- **Description**:
  - Implement deterministic field-level validation and typed error output.
  - Include per-field `field`, `code`, `message`.
- **Complexity**: 8
- **Dependencies**: Task 1.1
- **Acceptance Criteria**:
  - Invalid payloads return 400 with machine-readable errors and no persistence mutation.
- **Validation**:
  - API call suite for required fields, pattern validation, and type mismatch.

### Task 1.3: Moderation lifecycle and admin controls
- **Location**: `apps/admin/src/routes/sites.$siteId.tsx`, `apps/public/src/app/api/sites/[siteId]/forms/[formId]/submissions/route.ts`, `apps/public/src/lib/backyStore.ts`
- **Description**:
  - Complete status transitions for `pending`, `approved`, `rejected`, `spam`.
  - Add admin notes and reviewer actor tracking.
- **Complexity**: 7
- **Dependencies**: Task 1.2
- **Acceptance Criteria**:
  - Admin status updates are persisted and auditable.
- **Validation**:
  - Status matrix by role and endpoint.

### Task 1.4: Contact-share interoperability
- **Location**: `apps/public/src/app/api/sites/[siteId]/forms/[formId]/submissions/route.ts`, `apps/public/src/lib/backyStore.ts`
- **Description**:
  - Implement deterministic dedupe and optional webhook/email pipeline metadata.
- **Complexity**: 7
- **Dependencies**: Task 1.3
- **Acceptance Criteria**:
  - Duplicate contact submit honors `dedupeByEmail`.
- **Validation**:
  - Repeat submit same identity with dedupe enabled.

### Task 1.5: Export/filter and analytics hooks
- **Location**: `apps/admin/src/routes/sites.$siteId.tsx`, `apps/public/src/app/api/sites/[siteId]/forms/[formId]/submissions/route.ts`
- **Description**:
  - Add requestId/status export filters and paginated list stability.
- **Complexity**: 6
- **Dependencies**: Task 1.3
- **Acceptance Criteria**:
  - Admin export includes status + actor + timestamps.
- **Validation**:
  - Export two status slices and compare deterministic ordering.

## Testing Strategy
- 4-layer verification:
  - submit API validation
  - moderation UI action
  - store mutation persistence
  - public fetch with filters

## Risks & Gotchas
- Legacy submit shape could bypass strict validation unintentionally.
- **Mitigation**: allow compatibility mode with deprecation log flag.

## Rollback
- Disable strict validation by endpoint flag to permissive legacy mode only.
