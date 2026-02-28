# Plan: Phase E — Core CMS Composition Blocks and Templates

**Generated**: 2026-02-26  
**Estimated Complexity**: High

## Overview
Build composable page primitives (section/container/layout/nav/header/footer) and reusable content templates for blog/card/feed/category/list scenarios so admins can design quickly and external frontends can render consistently from shared contracts.

## Prerequisites
- Stable editor action semantics from Phase B.
- Stable public renderer with shared element contract.

## Sprint 1: Primitive catalog expansion
**Goal**: Add reusable blocks in admin catalog and renderer with shared property schema.

### Task 1.1: Block registry expansion
- **Location**: `apps/admin/src/components/editor/editorCatalog.ts`, `apps/public/src/components/PageRenderer.tsx`
- **Description**:
  - Add catalog entries and renderer implementations for section/container/layout, nav, header, footer.
  - Define canonical prop contracts for each.
- **Complexity**: 8
- **Dependencies**: Phase B, contract sync
- **Acceptance Criteria**:
  - Every block appears in block palette and renders in both admin/public.
- **Validation**:
  - Visual smoke on create-render-persist-rerender for each block.

### Task 1.2: Blog/content template blocks
- **Location**: `apps/admin/src/components/editor/editorCatalog.ts`, `apps/admin/src/components/editor/PropertyPanel.tsx`
- **Description**:
  - Add latest-posts, post-card, related-posts, category-list templates with data binding props.
- **Complexity**: 8
- **Dependencies**: Task 1.1
- **Acceptance Criteria**:
  - Templates accept post query-like props and render placeholder when no data.
- **Validation**:
  - Insert templates and validate fallback behavior.

### Task 1.3: Container/layout and responsive overrides
- **Location**: `apps/admin/src/components/editor/Canvas.tsx`, `apps/admin/src/components/editor/PropertyPanel.tsx`, `apps/public/src/components/PageRenderer.tsx`
- **Description**:
  - Add responsive spacing/stacking controls for layout container blocks.
  - Ensure editor/public contract parity for spacing/width/alignment props.
- **Complexity**: 7
- **Dependencies**: Task 1.1
- **Acceptance Criteria**:
  - Responsive behavior differs by viewport without corrupting desktop base layout.
- **Validation**:
  - Desktop/tablet/mobile canvas preview.

### Task 1.4: Reusable section presets
- **Location**: `apps/admin/src/components/editor/ComponentLibrary.tsx`, `apps/admin/src/components/editor/CanvasEditor.tsx`
- **Description**:
  - Add preset templates and insertion workflows for common section patterns.
- **Complexity**: 6
- **Dependencies**: Task 1.3
- **Acceptance Criteria**:
  - One-click preset insertion produces valid block tree.
- **Validation**:
  - Insert 3 presets and persist/re-open them.

## Testing Strategy
- For each block/template, verify:
  - added in admin palette
  - persisted in editor store
  - rendered in public route with responsive checks

## Risks & Gotchas
- Preset drift between admin and public contract.
- **Mitigation**: block-level snapshots per phase and contract lock.

## Rollback
- Keep new blocks feature-flagged by catalog entry for easy disablement.
