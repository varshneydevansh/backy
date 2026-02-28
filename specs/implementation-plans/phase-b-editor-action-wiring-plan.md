# Plan: Phase B — Editor Action Wiring and Stable Content Workflow

**Generated**: 2026-02-26  
**Estimated Complexity**: High

## Overview
Ship a robust editor interaction model that supports production authoring: selection, transformations, undo/redo, copy/duplicate/delete, and deterministic save/publish/reload backed by versioned content. This is the core for a Wix/Canva-like authoring experience.

## Prerequisites
- Phase A adapter boundaries in place.
- Shared element contracts from `packages/core`.
- Stable canvas rendering paths for text/link/button/image/video/map/list blocks.

## Sprint 1: Core action graph completion
**Goal**: Make editor operations deterministic and recoverable.

### Task 1.1: Selection and pointer/focus contract
- **Location**: `apps/admin/src/components/editor/Canvas.tsx`, `apps/admin/src/components/editor/CanvasEditor.tsx`, `apps/admin/src/components/editor/RichTextBlock.tsx`
- **Description**:
  - Fix selection precedence for nested elements.
  - Ensure text edit and block dragging are mutually safe under pointer capture.
  - Preserve toolbar target stability during selection churn.
- **Complexity**: 8
- **Dependencies**: Phase A read/write boundaries
- **Acceptance Criteria**:
  - Single click selects and focuses expected text block.
  - Drag handles and keyboard shortcuts do not steal focus.
- **Validation**:
  - 20-action interaction matrix (click/edit/drag/resize/undo).

### Task 1.2: Command history engine
- **Location**: `apps/admin/src/components/editor/CanvasEditor.tsx`, `apps/admin/src/components/editor/ActiveEditorContext.tsx`
- **Description**:
  - Introduce bounded command stack with inverse transforms.
  - Ignore no-op selection-only updates.
- **Complexity**: 9
- **Dependencies**: Task 1.1
- **Acceptance Criteria**:
  - Undo/redo restores visual and payload state exactly.
- **Validation**:
  - Add/remove/repeat pattern with 10+ undos remains stable.

### Task 1.3: Copy/duplicate/delete actions
- **Location**: `apps/admin/src/components/editor/Canvas.tsx`, `apps/admin/src/components/editor/CanvasEditor.tsx`, `apps/admin/src/types/editor.ts`
- **Description**:
  - Implement deep-duplicate preserving children and responsive style overrides.
  - Implement multi-select delete semantics with deterministic ordering.
- **Complexity**: 8
- **Dependencies**: Task 1.2
- **Acceptance Criteria**:
  - IDs never collide after duplicate.
  - Deleting a selected group removes descendants safely.
- **Validation**:
  - Duplicate + undo + delete + redo scenario on grouped elements.

### Task 1.4: Save/publish/reload contract
- **Location**: `apps/admin/src/routes/pages.$pageId.edit.tsx`, `apps/admin/src/routes/sites.$siteId.tsx`, `packages/core/src/types/index.ts`
- **Description**:
  - Persist page content and metadata changes as atomic save.
  - Implement publish/unpublish/archive actions and status indicators.
- **Complexity**: 8
- **Dependencies**: Task 1.3
- **Acceptance Criteria**:
  - Save writes revision marker and status metadata.
  - Reload restores latest revision from backend.
- **Validation**:
  - Save then browser reload returns exact content + status.

### Task 1.5: Recovery and validation around concurrency
- **Location**: `apps/admin/src/routes/pages.$pageId.edit.tsx`, `apps/admin/src/components/editor/CanvasEditor.tsx`
- **Description**:
  - Detect stale editor payload against backend revision.
  - Present reload/overwrite option with diff summary.
- **Complexity**: 7
- **Dependencies**: Task 1.4
- **Acceptance Criteria**:
  - Concurrent edit warning appears on stale submit attempt.
- **Validation**:
  - Two-tab concurrent edit simulation.

## Testing Strategy
- Manual flowbook:
  - select → transform → duplicate → delete → undo/redo → save → publish → reload.

## Potential Risks & Mitigations
- Editor stack growth and memory: enforce max history depth.
- Broken rich-text selection from event bubbling: separate text-edit capture region.

## Rollback
- If regressions appear, temporarily disable undo/redo integration and fallback to direct state updates in `CanvasEditor.tsx` while preserving save/publish path.
