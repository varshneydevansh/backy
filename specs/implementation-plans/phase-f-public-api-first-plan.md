# Plan: Phase F — Public API Hardening for External Frontends

**Generated**: 2026-02-26  
**Estimated Complexity**: Medium to High

## Overview
Make `backy-public` a true public-contract platform where external UIs can build pages, templates, and interactions without admin internals. APIs become stable, versioned, and predictable.

## Prerequisites
- Phase A stable persistence.
- Route resolver and status guards in place.

## Sprint 1: Contract-first API normalization
**Goal**: Standardize response envelopes and request contracts across all public endpoints.

### Task 1.1: Unify response envelope
- **Location**: `apps/public/src/app/api/sites/[siteId]/route.ts`, `apps/public/src/app/api/sites/[siteId]/pages/route.ts`, `apps/public/src/app/api/sites/[siteId]/media/route.ts`, `apps/public/src/app/api/sites/[siteId]/forms/[formId]/submissions/route.ts`, `apps/public/src/app/api/sites/[siteId]/comments/route.ts`
- **Description**:
  - Introduce a shared `{ success, data, error, pagination, requestId }` style envelope.
  - Normalize 4xx/5xx payloads and metadata.
- **Complexity**: 8
- **Dependencies**: Phase A
- **Acceptance Criteria**:
  - Same error shape for all public routes.
- **Validation**:
  - Fixture calls for 200/400/403/500.

### Task 1.2: Site/page resolution and canonical behavior
- **Location**: `apps/public/src/app/sites/[subdomain]/[[...path]]/page.tsx`, `apps/public/src/app/api/sites/[siteId]/pages/route.ts`
- **Description**:
  - Implement canonical 301/404/410 semantics for trailing slash/index/home variants.
- **Complexity**: 8
- **Dependencies**: Task 1.1
- **Acceptance Criteria**:
  - Deterministic canonical URL handling for empty, `/index`, `/index/`.
- **Validation**:
  - Route matrix test with 20 path variants.

### Task 1.3: External frontend auth and rate metadata
- **Location**: `apps/public/src/lib/backyAuthBridge.ts`, `apps/public/src/hooks/useBackyAuthBridge.ts`, `apps/public/src/app/api/sites/[siteId]/comments/route.ts`
- **Description**:
  - Keep signed-in context bootstrap for external frontends via headers/query/storage.
- **Complexity**: 6
- **Dependencies**: Task 1.1
- **Acceptance Criteria**:
  - Public APIs accept identity metadata without requiring admin session.
- **Validation**:
  - API request from pseudo external frontend with mocked headers/query.

### Task 1.4: Public SDK and contract docs
- **Location**: `specs/backy-api-contracts.md`, `README.md`, `package.json`
- **Description**:
  - Publish contract docs with request/response examples and typed examples.
- **Complexity**: 7
- **Dependencies**: Task 1.1
- **Acceptance Criteria**:
  - Third-party frontend path can implement fetch + render flow from docs only.
- **Validation**:
  - Documentation-driven smoke from sample frontend script.

## Testing Strategy
- Contract smoke suite with curl/Postman-like checklist.
- Confirm no route exposes internal data shapes.

## Risks & Gotchas
- Contract versioning breakages for existing consumers.
- **Mitigation**: add `x-api-version` support and deprecation window.

## Rollback
- Backward compatibility shim mode for envelope response at route layer.
