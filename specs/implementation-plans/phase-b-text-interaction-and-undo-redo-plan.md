# Plan: Phase B — Text Interaction + Undo/Redo Completion (single-tap first)

**Generated**: 2026-02-28  
**Estimated Complexity**: High  
**Scope slice**: remaining Phase B blockers only (do not start A/C changes during this pass)

## Overview

Ship deterministic canvas authoring for text and selection behavior first, then harden command history behavior for all canvas mutations. The rule for this pass: **no feature expansion outside Phase B**.

Current objective:

- single tap = select element + style target
- double tap = edit text content
- toolbar toggles = true toggle/un-toggle on selected scope
- undo/redo = records real canvas mutations only (layout, style, text content), not selection noise

## Prerequisites

- Branch has current checkpoint state from `stash-diff-code.txt`.
- `RichTextBlock`, `Canvas`, `CanvasEditor`, `PropertyPanel`, `RichTextFormatting`, `ActiveEditorContext` are available and compile.
- No concurrent editing pass is running on same files while this pass is executed.

## Sprint 1: Deterministic text interaction contract

### Task 1.1 — Separate selection intent states
- **Location**:
  - `apps/admin/src/components/editor/Canvas.tsx`
  - `apps/admin/src/components/editor/CanvasEditor.tsx`
  - `apps/admin/src/components/editor/blocks/RichTextBlock.tsx`
- **Description**: Introduce explicit intent states (`select`, `text-edit`, `drag`) and make single vs double click behavior deterministic per element.
- **Complexity**: 7
- **Dependencies**: none
- **Acceptance Criteria**:
  - Single click selects text element without dropping selection after property apply.
  - Double click enters text edit mode and sets caret properly.
  - Element can be moved/resized after text edit without forcing unrelated state churn.
- **Validation**:
  - Scenario: click text → apply bold → click bold again → click bold again to re-toggle.
  - Scenario: double tap text → type → undo (text style+content) restores both correctly.

### Task 1.2 — Prevent selection churn on external re-render
- **Location**:
  - `apps/admin/src/components/editor/CanvasEditor.tsx`
  - `apps/admin/src/components/editor/ActiveEditorContext.tsx`
- **Description**: Prevent the active text selection target from being replaced during autosave/history flush cycles.
- **Complexity**: 8
- **Dependencies**: Task 1.1
- **Acceptance Criteria**:
  - Selection remains stable when clicking property controls.
  - `Cannot access ... before initialization` runtime errors not reintroduced by hoist order changes.
- **Validation**:
  - 20 rapid style toggles do not trigger selection clear or stale callbacks.

## Sprint 2: Property toolbar state parity

### Task 2.1 — Source-of-truth for toolbar mark and alignment state
- **Location**:
  - `apps/admin/src/components/editor/RichTextFormatting.tsx`
  - `apps/admin/src/components/editor/PropertyPanel.tsx`
  - `apps/admin/src/components/editor/ActiveEditorContext.tsx`
- **Description**: Ensure toolbar icons are derived from active selection/read state and not stale UI snapshots.
- **Complexity**: 8
- **Dependencies**: Sprint 1
- **Acceptance Criteria**:
  - Bold/italic/underline/button states reflect active text/block selection accurately.
  - Clicking active toggle again cleanly removes formatting.
- **Validation**:
  - Toggle bold then reopen same block should show bold state on mount.

### Task 2.2 — Keep property updates scoped by selection/intent
- **Location**:
  - `apps/admin/src/components/editor/PropertyPanel.tsx`
  - `apps/admin/src/components/editor/RichTextBlock.tsx`
- **Description**: Ensure full-text and range text edits share the same action path and stay deterministic.
- **Complexity**: 8
- **Dependencies**: Task 2.1
- **Acceptance Criteria**:
  - Single-select applies to full text when no range is selected.
  - Editing range via caret selection applies only selected range.
  - Property control never mutates a different element.
- **Validation**:
  - Text element with child links/emphasis should not lose link/format structure unexpectedly.

## Sprint 3: Full-canvas history stack correction

### Task 3.1 — History commit boundaries
- **Location**:
  - `apps/admin/src/components/editor/CanvasEditor.tsx`
  - `apps/admin/src/types/editor.ts`
- **Description**: Make undo/redo push records only when content/layout/style changes.
- **Complexity**: 9
- **Dependencies**: Sprint 2
- **Acceptance Criteria**:
  - Selection-only updates are never pushed as undo units.
  - Every style mutation (text formatting, content change, move/resize) is undoable.
- **Validation**:
  - 10+ mixed operations (select/move/style/double-tap edit/delete/duplicate) support predictable undo/redo.

### Task 3.2 — Save/reload should not flush intent stack
- **Location**:
  - `apps/admin/src/routes/pages.$pageId.edit.tsx`
  - `apps/admin/src/components/editor/CanvasEditor.tsx`
- **Description**: decouple save/reload status signaling from local undo stack reset.
- **Complexity**: 6
- **Dependencies**: Task 3.1
- **Acceptance Criteria**:
  - Autosave updates save metadata only; undo stack depth unchanged after successful autosave.
- **Validation**:
  - After at least one format action + autosave, undo/redo still available.

## Sprint 4: Cross-cut verification and commit finalization

### Task 4.1 — Regression pass
- **Location**: complete editor paths and affected route shell
- **Description**:
  - Confirm no `Cannot access ... before initialization` runtime errors.
  - Confirm no JSX parse/runtime regressions.
  - Confirm keymap (undo/redo, duplicate, delete) remains responsive.
- **Complexity**: 6
- **Dependencies**: Sprint 3
- **Acceptance Criteria**:
  - No hard loop, no runtime fatal in single/two-minute editor interactions.
- **Validation**:
  - Manual acceptance matrix below.

### Task 4.2 — Update handoff and phase artifacts
- **Location**:
  - `BACKY_HANDOFF.md`
  - `NEXT_CHAT_HANDOFF.md`
  - `specs/stash.md`
  - `specs/backy-alpha-vs-numeric-phase-progress-2026-02-27.md`
- **Description**: Record exact completion state for Phase B pass and confirm follow-up order.
- **Complexity**: 4
- **Dependencies**: All previous tasks
- **Acceptance Criteria**:
  - Handoff files map the same status and no contradictory claims exist.

## Validation checklist (smoke)

- Single click selects and keeps text block selected.
- Bold/italic/underline toggles work on one click and visibly reflect active state.
- Double click enters inline text edit mode.
- Undo/redo remains active after at least one text + one structural mutation.
- Duplicate/delete and undo/redo still work after a text styling sequence.
- No runtime `Maximum update depth` or `Cannot access ... before initialization`.

## Potential regressions to monitor

- Runtime selection loops caused by derived state from active text editor object.
- Selection IDs changing during style update due fresh object cloning.
- History stack growth with no prune strategy.
- Toolbar state deriving from stale selection snapshots.

## Rollback plan

- If regressions appear, isolate to minimal commit:
  - revert history boundary commit first,
  - then revert interaction-state commit,
  - preserve public API/comment work untouched.
