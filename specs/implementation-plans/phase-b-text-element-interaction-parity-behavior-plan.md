# Plan: Phase B Text Interaction Parity (text/heading/paragraph/list/quote) Behavior Contract

**Generated**: 2026-02-28
**Scope**: deterministic text interaction in canvas + right-panel formatting + undo/redo persistence for text-format edits.
**Priority**: complete before other editor wiring follow-ups.

## Objective

Align text interaction in Backy editor with expected Wix/Canva/Word-like behavior:
- Single tap = deterministic element selection + toolbar binding.
- Double tap = enter/edit text mode.
- Formatting actions apply to the correct target scope (selection first, fallback to full block).
- Undo/redo/selection history stays stable and does not churn on clicks.
- The same behavior works for all text-capable blocks:
  - `text`
  - `heading`
  - `paragraph`
  - `quote`
  - `list`

## Interaction state model (single source of truth)

The system should reason with explicit states:

1. `Idle/Other`
   - No text block selected.
2. `Selected-NotEditing`
   - Text block is selected (`selectedId`) but editing is not active (`editingId !== selectedId`).
3. `Selected-Editing-CaretOnly`
   - Editing is active on a text block and there is no non-collapsed selection (collapsed caret).
4. `Selected-Editing-Range`
   - Editing is active and there is a non-collapsed text range.
5. `Selected-Editing-WholeBlock`
   - Editing is active and all text in block is selected (or selection covers all logical block nodes).

## Core click/tap semantics

### Single click / single tap
- Target is a text-capable block (`text`, `heading`, `paragraph`, `quote`, `list`):
  - Set `selectedId` to element.
  - Keep block in `Selected-NotEditing`.
  - Do **not** auto-enter edit mode.
  - Do **not** clear active formatting state.
- Target is non-text block:
  - Existing behavior (select + drag/resize semantics).

### Double click / double tap
- Target is text-capable block:
  - Enter text edit mode for the clicked block (`editingId` = element id).
  - Focus editable surface.
  - `Selected-Editing-*` state follows caret/selection.

### Click outside active text selection
- If clicked outside any text editor, do not mutate history.
- If clicked on text selection surface, do not force deselect unless canvas-root intent says so.
- Escape key should exit edit mode and return to `Selected-NotEditing`.

## Text property scope rules

For every action, evaluate scope in this order:
1) if there is an active range in current editor (`rangeSelection`) → apply to selected range only.
2) else if caret-only in edit mode → apply to full block payload (`apply to all text nodes`).
3) else if not in edit mode but selected text block → apply to full block payload.

### Mark toggles (`bold`, `italic`, `underline`, `strikethrough`, `code`)
- Toggle behavior:
  - Same state twice should remove when active (on same scope).
  - Different from selection should apply only if scope is selection/range.
- State visibility:
  - Icon active iff current scope has uniform true mark.
  - Mixed scope should render neutral (non-assertive) state.
- Undo:
  - Every successful toggle must create one content history commit.

### Text color, highlight, font family, font size, other leaf attrs
- Same scope rules as marks.
- Palette/number input value displayed must always reflect current active scope.
- Clearing/empty value should remove leaf attr from applied scope.

### Alignment (`align-left`, `align-center`, `align-right`)
- Non-list text blocks:
  - apply to block container (`align`).
- List:
  - apply list block/list-item alignment consistently.
- Scope:
  - use active editor selection when available; otherwise full block fallback.
- No selection-change history noise: only content mutation should push undo.

### List actions (`ul`, `ol`, `indent`, `outdent`)
- On `ul`/`ol`:
  - Non-list + full block scope → wrap/convert all eligible nodes in selected block.
  - List block + same type action → unwrap/list->paragraph fallback while preserving list marker preference.
  - List block + range selection → apply to selected list items only.
- `indent/outdent`:
  - Apply to selected list items when range exists.
  - Apply to all list items in block when no range.
- No-op if block is not list-capable.

### Structural/text inserts (`emoji`, `link`, `image`)
- Applies to current caret/range when editing and selection exists.
- If no valid editing selection, fallback to caret at end (internal deterministic anchor) and then insert.
- `insert-link` and `insert-image` actions must never clear/replace block selection state unexpectedly.

### Clear formatting
- Remove supported text marks on current scope.
- If no scope (non-text target) no-op.

## Element-type behavior matrix (all follow same state machine)

### 1) `text`
- Default root node type for fallback rendering: `p`.
- Single tap: select only.
- Double tap: edit mode.
- All rules above apply.

### 2) `heading`
- Default root node type from `props.level` (`h1`–`h6`).
- Single tap/edit semantics identical to `text`.
- Scope actions still on content; formatting applies to heading content nodes (not level changes).

### 3) `paragraph`
- Default root node type: `p`.
- Same interaction/formatting contract as `text`.
- No extra differences unless paragraph-level style controls from sidebar.

### 4) `quote`
- Default root node type: `blockquote`.
- Formatting parity same as other text blocks.
- In toolbar, mark state should reflect quote content node marks just like paragraph.

### 5) `list`
- Default root node type: `ul` unless stored props say ordered.
- Editing fallback should normalize list shape before formatting operations.
- List-specific actions:
  - `ul`/`ol`: convert whole block or selected list items depending scope.
  - `indent/outdent`: list-item aware.
- Paragraph-style marks still apply to text in list items.

## Critical edge-case matrix (must pass)

### Edge A: single tap → apply mark → property button shows active immediately
- Expected:
  - In `Selected-NotEditing`, clicking bold should mark full block.
  - Bold icon becomes active right after content mutation.
  - Re-clicking bold removes from the same target.

### Edge B: single tap → double tap → apply mark in range/word
- Expected:
  - In `Selected-Editing-Range`, bold applies only range.
  - In `Selected-Editing-CaretOnly`, bold applies full block (or deterministic fallback behavior that users can still see reflected).

### Edge C: paragraph → list/quote/heading conversion not available from these buttons
- Keep formatting independent from block-type conversion.
- Block type changes are separate controls only.

### Edge D: selection churn
- Single click on toolbar should never unselect current text element.
- Undo/redo navigation should not unset `selectedId` unless target missing.

### Edge E: undo/redo on text formatting
- After formatting changes on text blocks, Undo should restore previous style/content.
- Redo should re-apply.
- Format changes across at least one paragraph + one heading + one list should each be individually revertible.

## Work tasks for implementation hardening (Phase B focus)

### Task B1 — Normalize interaction target resolution across all text element types
- **Location**:
  - `apps/admin/src/components/editor/Canvas.tsx`
  - `apps/admin/src/components/editor/CanvasElement` render switch
- **Output**:
  - Single-tap/double-tap behavior is shared across `text/heading/paragraph/quote/list`.
  - Selection mode transition is explicit and stable.

### Task B2 — Source-of-truth scope selection in formatting actions
- **Location**:
  - `apps/admin/src/components/editor/RichTextFormatting.tsx`
  - `apps/admin/src/components/editor/ActiveEditorContext.tsx`
- **Output**:
  - A deterministic `selectionScope()` helper used by every toolbar action.
  - Scope state machine: range > caret/full-block fallback.

### Task B3 — Immediate UI reflection + no reset
- **Location**:
  - `apps/admin/src/components/editor/RichTextFormatting.tsx`
- **Output**:
  - Mark buttons reflect applied state across text elements.
  - Re-clicking same action toggles correctly.
  - No accidental local fallback state resets when active scope changes.

### Task B4 — Undo/redo content-payload contract for text
- **Location**:
  - `apps/admin/src/components/editor/CanvasEditor.tsx`
  - `apps/admin/src/routes/pages.$pageId.edit.tsx`
- **Output**:
  - Styling mutations and content mutations from text editor actions are always pushable history entries.
  - Selection mode changes are not pushable.

### Task B5 — Regression matrix verification
- **Validation**:
  - Manual matrix check over:
    - text block types: `text`, `heading`, `paragraph`, `quote`, `list`.
    - states: selected-not-editing, editing-caret-only, editing-range.
    - actions: bold/italic/underline/strikethrough/code, align left/center/right, ul/ol/indent/outdent, color/highlight.
  - Confirm no JS errors:
    - cannot access active editor functions before init.
    - no `Cannot resolve Slate range from DOM range`.
  - Confirm runtime no selection-flash on toolbar click.

## Risks / gotchas

- Plate editor selection can desync when focus jumps during property clicks.
  - Mitigation: always restore/verify selection before each command; fallback to normalized whole-block mutation.
- DOM-driven focus from `requestAnimationFrame` can produce transient selection mismatches.
  - Mitigation: single helper for request/edit mode transitions and explicit scope fallback.
- Undo stack explosion if every keystroke is treated as unrelated full-content commit.
  - Mitigation: dedupe and skip commit when content snapshot is identical; keep commit boundaries for real mutations.

## Acceptance criteria

- Single tap selects text block and keeps it selected while styling can be applied without entering edit mode.
- Double tap enters edit mode.
- Mark buttons show correct state after each action and stay consistent across re-selection.
- List/heading/paragraph/quote/text all follow identical interaction + scope semantics.
- Undo/redo reverts/reapplies text formatting and content changes consistently.
- No selection-mode action appears in history.

