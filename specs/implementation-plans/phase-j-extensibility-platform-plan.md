# Plan: Phase J — Developer Platform, Plugins, and Custom-Frontend Enablement

**Generated**: 2026-02-26  
**Estimated Complexity**: Medium to High

## Overview
Enable `backy` to be consumed as a headless CMS core by any frontend while preserving admin-first authoring. This phase focuses on docs, SDKs, extension hooks, and deployment patterns.

## Prerequisites
- Public API contract normalization and versioned endpoints from Phase F.
- Stable schema contracts and auth boundary from Phases A/F.

## Sprint 1: External consumption package
**Goal**: Reduce custom frontend onboarding friction.

### Task 1.1: API contract publication
- **Location**: `specs/backy-api-contracts.md`, `README.md`
- **Description**:
  - Publish endpoint matrix with request/response samples for every public route.
  - Add changelog/deprecation policy for contract changes.
- **Complexity**: 6
- **Dependencies**: Phase F
- **Acceptance Criteria**:
  - Third-party engineer can implement client calls from docs.
- **Validation**:
  - Documentation smoke by implementing quick integration notes.

### Task 1.2: Example headless clients
- **Location**: `README.md`, sample frontend directory (create if missing)
- **Description**:
  - Add reference examples (React + vanilla JS) for page fetch + form submit + comments.
- **Complexity**: 8
- **Dependencies**: Task 1.1
- **Acceptance Criteria**:
  - Example runs against local `backy-public`.
- **Validation**:
  - End-to-end render and submit flow demonstration.

### Task 1.3: Extension hooks and integration points
- **Location**: `apps/public/src/app/api/sites/[siteId]/forms/[formId]/submissions/route.ts`, `packages/core/src/types/index.ts`
- **Description**:
  - Add configurable webhook hooks and pluggable form/comment processors with signature contract.
- **Complexity**: 8
- **Dependencies**: Phase C/D
- **Acceptance Criteria**:
  - Webhook processor receives normalized payload and returns explicit status.
- **Validation**:
  - Trigger mocked webhook and inspect outbound payload.

### Task 1.4: Partner SDK and quick-start
- **Location**: `package.json`, `apps/public/package.json`, `README.md`
- **Description**:
  - Add typed client snippets and installable package guidance.
- **Complexity**: 5
- **Dependencies**: Task 1.2
- **Acceptance Criteria**:
  - A published helper package path exists in docs.
- **Validation**:
  - SDK snippet compiles against sample TS project.

## Sprint 2: Ecosystem hardening
**Goal**: Make platform migration and extension easy for teams.

### Task 2.1: Plugin architecture baseline
- **Location**: `packages/core/src/types/index.ts`, `apps/admin/src/routes/settings.tsx`
- **Description**:
  - Add registration model for plugin processors and custom field widgets.
- **Complexity**: 8
- **Dependencies**: Task 1.3
- **Acceptance Criteria**:
  - Third-party plugin can register without touching core source.
- **Validation**:
  - Sample plugin receives expected events.

### Task 2.2: Release and upgrade path
- **Location**: `README.md`, `CHANGELOG.md`, repo scripts
- **Description**:
  - Versioning strategy and migration guides for breaking API changes.
- **Complexity**: 5
- **Dependencies**: Task 2.1
- **Acceptance Criteria**:
  - Clear major/minor deprecation cadence documented.
- **Validation**:
  - One migration recipe tested from local previous commit.

## Testing Strategy
- External frontend smoke from docs.
- plugin registration + webhook + SDK path validation.

## Risks & Gotchas
- API surface bloating if extension points are too generic.
- **Mitigation**: versioned plugin contracts.

## Rollback
- Keep extension hooks additive and behind config; disable specific plugins without core rollback.
