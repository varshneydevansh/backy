# Plan: Phase H — Media, SEO, Localization, and Visual System

**Generated**: 2026-02-26  
**Estimated Complexity**: High

## Overview
Deliver production-grade media, theming, and search/discovery quality so output sites look and perform like hosted CMS products.

## Prerequisites
- Stable page/content persistence and renderer contract.

## Sprint 1: Asset and branding system
**Goal**: Make media and theme a real service, not only UI placeholders.

### Task 1.1: Media upload and metadata pipeline
- **Location**: `apps/public/src/components` (read APIs), `apps/public/src/app/api/sites/[siteId]/media/route.ts`, `packages/storage`, `apps/admin/src/components/editor/MediaLibraryModal.tsx`
- **Description**:
  - Implement upload API with MIME/size validation and metadata capture.
  - Associate media with site and optional scope.
- **Complexity**: 9
- **Dependencies**: Phase A
- **Acceptance Criteria**:
  - Uploaded item has URL, mimetype, dimensions, and owner metadata.
- **Validation**:
  - Upload/replace/delete round-trip.

### Task 1.2: Theme token compiler
- **Location**: `apps/admin/src/routes/settings.tsx`, `apps/admin/src/routes/sites.$siteId.tsx`, `apps/public/src/components/PageRenderer.tsx`
- **Description**:
  - Create token pipeline for colors, typography scale, spacing.
  - Export CSS variables for public and admin preview parity.
- **Complexity**: 8
- **Dependencies**: Task 1.1
- **Acceptance Criteria**:
  - Theme updates reflected in both admin preview and public render.
- **Validation**:
  - Theme swap across site and verify color/spacing updates.

### Task 1.3: SEO and metadata generation
- **Location**: `apps/public/src/app/sites/[subdomain]/[[...path]]/page.tsx`, `apps/public/src/app/api/sites/[siteId]/pages/route.ts`, `apps/public/src/components/PageRenderer.tsx`
- **Description**:
  - Generate canonical URL/OG/Twitter/meta/title/description tags and optional JSON-LD.
- **Complexity**: 7
- **Dependencies**: Task 1.2
- **Acceptance Criteria**:
  - Public pages always emit canonical links.
- **Validation**:
  - Validate metadata for draft/published route variants.

### Task 1.4: Localization and timezone basics
- **Location**: `packages/core/src/types/index.ts`, `apps/public/src/lib/backyStore.ts`, `apps/public/src/components/PageRenderer.tsx`
- **Description**:
  - Add locale/timezone/site display settings with formatting helpers.
- **Complexity**: 6
- **Dependencies**: Task 1.3
- **Acceptance Criteria**:
  - Page metadata and timestamps render according to site locale.
- **Validation**:
  - Cross-locale sample for at least 2 locales.

## Testing Strategy
- Upload + render + metadata verification in one pass.

## Risks & Gotchas
- Signed URL and public CDN mismatch.
- **Mitigation**: explicit URL strategy in media service contract.

## Rollback
- Disable media advanced fields behind feature flag; keep upload/read/list minimal.
