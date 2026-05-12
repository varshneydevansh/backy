# Backy CMS - Page Editor Complete Specification
Complete feature inventory, current status, and implementation plan for a Wix/Canva-style page builder

## Table of Contents
1. Current Features Inventory
2. Feature-by-Feature Analysis
3. Missing Features List
4. Priority Order

## Current Features Inventory
✅ = Working | ⚠️ = Partially Working | ❌ = Not Working/Missing

| # | Feature | Status | Description |
|---|---|---|---|
| 1 | Component Library (Left Panel) | ✅ | Search, filter, preview, favorite, and drag elements to canvas |
| 2 | Canvas | ✅ | Drop zone for elements |
| 3 | Element Drag | ✅ | Move elements on canvas |
| 4 | Element Resize | ✅ | Resize via corner handles |
| 5 | Property Panel (Right Panel) | ⚠️ | Animation controls, typography controls, and applied-change feedback are wired; still missing full Canva-level workflow parity |
| 6 | Element Selection | ✅ | Click to select |
| 7 | Preview Mode | ✅ | Toggle to preview |
| 8 | Breakpoint Toggle | ⚠️ | Desktop/Tablet/Mobile - UI only |
| 9 | Undo/Redo Buttons | ✅ | Toolbar and shortcut undo/redo restore distinct canvas states |
| 10 | Save Button | ✅ | Manual save and Ctrl/Cmd+S persist canvas JSON with status metadata and reload hydration coverage |
| 11 | Page Settings | ✅ | Modal edits title, slug, status/schedule, SEO, JSON-LD, keywords, and social image with persistence coverage |
| 12 | Z-Index Control | ✅ | PropertyPanel input plus toolbar bring/send forward/back controls with undo/redo coverage |
| 13 | Delete Element | ✅ | Toolbar and Delete/Backspace remove unlocked selections with undo/redo and persistence coverage |
| 14 | Duplicate Element | ✅ | Toolbar and Ctrl+D duplicate selected sibling elements with offset |
| 15 | Rich Text Editing | ⚠️ | List/selected-text flow improved with list toggle/indent/button-reorder/drag-reorder tools, bounded list indent depth, markdown shortcut updates, persisted selected-range leaf marks including cross-node split marks, blockquote/table panel controls, row/column table growth/duplication/removal/reorder, table header row/column/cell toggles, table-cell text alignment, whole-table removal, and text-mark rendering fixes; full parity still pending for deeper table/list editing |
| 16 | Font Selection | ✅ | Font family and size now apply from shared style props on canvas render |
| 17 | Animation Controls | ✅ | Animation panel is connected in PropertyPanel and persisted on element payloads; animation contract now uses `fadeIn/slideIn/scaleIn/rotate/bounce/custom` to match renderer payload |
| 18 | Emoji Picker | ✅ | Icon elements expose a tested emoji picker with common quick picks and full picker modal |
| 19 | Grid/Snap | ✅ | Configurable grid size, grid visibility, and snap toggle with focused smoke coverage |
| 20 | Layers Panel | ✅ | Hierarchical rows support select/multi-select, drag reorder, visibility, lock, duplicate/delete, nesting/outdent, save persistence |
| 21 | Copy/Paste | ✅ | Copy, cut, paste, duplicate, undo, and redo are covered by editor smoke |
| 22 | Keyboard Shortcuts | ✅ | Core canvas shortcuts for save, selection, clipboard, duplicate, delete, nudge, undo/redo, grouping, and guarded focus are covered by focused smoke |
| 23 | Markdown Shortcuts | ✅ | `#`, `-`, `*`, `+`, `1.`/`1)` block conversions and inline `**bold**`, `_italic_`, `~~strike~~`, `` `code` `` mark shortcuts implemented in shared editor |

## Canvas Element Parity Matrix (Current)

| Element | Property Controls | Canvas Render | Public Render | Current Gaps | Status |
|---|---|---|---|---|---|
| text | ✅ Content, color, typography, spacing | ✅ | ✅ | Inline markdown, selected-range panel formatting including cross-node mark splits, multi-block blockquote, selected-list item indentation/button-reorder/drag-reorder, basic table insertion/removal, table row/column growth/duplication/removal/reorder, table-cell alignment, and header row/column/cell toggles are covered; deeper table/list editing remains | ⚠️ |
| heading | ✅ Similar to text | ✅ | ✅ | Inline markdown, selected-range mark/clear flows including cross-node mark splits, bounded selected-list indentation/button-reorder/drag-reorder, multi-block blockquote, basic table insertion/removal, table row/column growth/duplication/removal/reorder, table-cell alignment, and header row/column/cell toggles are covered; deeper table/list editing remains | ⚠️ |
| paragraph | ✅ | ✅ | ✅ | Same deeper rich-text table/list editing gaps as heading | ⚠️ |
| quote | ✅ | ✅ | ✅ | Public renderer now carries quote appearance, typography, citation, and border styles | ✅ |
| image | ✅ source/fit/alt/upload picker | ✅ | ✅ | Broader transform/version-management UX still pending in media route | ✅ |
| video | ✅ source/controls | ✅ | ✅ | autoplay/loop/muted/playsInline public output is now covered; broader media-version UX remains in media route | ✅ |
| button | ✅ label/link-like styling + action presets | ✅ | ✅ | Action presets now normalize page/section/email/phone/download/custom href behavior with smoke coverage | ✅ |
| link | ✅ href/content/underline/target/rel | ✅ | ✅ | `_blank` target now enforces `noopener noreferrer` in property controls, editor preview, persistence, and public rendering | ✅ |
| divider | ✅ style controls | ✅ | ✅ | Public renderer now matches editor border-only line geometry and margin spacing | ✅ |
| spacer | ✅ layout-only | ✅ | ✅ | no visual handle difference in preview | ✅ |
| icon | ✅ symbol/size/color | ✅ | ✅ | Public renderer now preserves icon/symbol fallback, size, color, title, and aria label | ✅ |
| box/container | ✅ style/appearance + nested child contract | ✅ | ✅ | Editor and public renderers now preserve parent-relative nested child geometry with focused smoke coverage | ✅ |
| columns | ✅ column count/gap | ✅ | ✅ | Public renderer now emits real column slots and places children by column index | ✅ |
| map | ✅ address/url/zoom/marker controls | ✅ (iframe support added) | ✅ (iframe support added) | Marker label/coordinates now persist, render as metadata, and drive coordinate fallback when no custom URL is set | ✅ |
| embed | ✅ URL/source/allowlist/security controls | ✅ (iframe support added) | ✅ (iframe support added) | Embed URLs now require safe protocols plus default/custom host allowlists, with blocked-source fallback coverage | ✅ |
| list | ✅ list type + items + indent clamp | ✅ | ✅ | Empty rows are preserved and list indentation clamps to non-negative values in editor/public renderers | ✅ |
| form | ✅ title/action metadata + schema JSON + structured field builder + captcha provider/site-key controls | ✅ schema fields + submit UI + nested children + captcha preview | ✅ schema fields submit through public form runtime with captcha widget/token wiring | Captcha verification remains server-configured by environment; editor exposes provider/site-key for the public widget | ✅ |
| input | ✅ placeholder/type/validation/form owner wiring | ✅ (public) | ✅ (public) | standalone fields can target public forms through native `form` owner attributes | ✅ |

## Canvas-to-Backend/Frontend Contract

- `media` currently uses shared in-memory store state inside admin for both:
  - media library modal (`components/editor/MediaLibraryModal.tsx`)
  - media management route (`routes/media.tsx`)
- `embed/map` now support:
  - normalized embed source parsing (YouTube/Vimeo/watch/watch URLs + iframe snippets)
  - address-based map conversion to Google Maps embed URL when non-URL text is provided
- Remaining design contract decision:
  - Confirm whether media assets must be global-only or scoped by `siteId/pageId`
  - Add explicit API endpoints for global + page/blog scope after backend API migration.

## Feature-by-Feature Analysis

### 1. Component Library (Left Panel)
**File:** `ComponentLibrary.tsx`
**Current State:** ✅ Working
- Core and saved element types available
- Organized by categories (favorites, basic, media, layout, form, saved, advanced)
- Search/filter components work across categories
- Favorites section persists locally and supports favorites-only filtering
- Hover/focus preview shows component metadata and preview artwork
- Drag-and-drop to canvas works
- **Issues:** None
- **Improvements Needed:** None currently tracked for this panel

### 2. Canvas
**File:** `Canvas.tsx`
**Current State:** ✅ Working
- Renders all element types
- Handle drop events
- Grid background in edit mode
- Zoom out, zoom in, and fit-to-canvas controls are wired to the scaled editor surface and covered by focused smoke.
- Smart alignment guides render during drag, snap selected elements to peer/canvas edges, and clear after release.
- Rulers render along the canvas edge with major/minor ticks.
- Pan navigation works through the hand toggle and temporary Space-hold mode.
- **Issues:** None major
- **Improvements Needed:**
    - None currently tracked for this panel

### 3. Element Drag
**File:** `Canvas.tsx` (handleMouseDown, handleMouseMove, handleMouseUp)
**Current State:** ✅ Working
- Click and drag to move
- Snaps to configurable grid when snap is enabled
- Shift/Cmd/Ctrl-click multi-select is wired and smoke-covered
- Arrow-key nudge supports 1px movement and 10px with Shift
- **Issues:** None
- **Improvements Needed:** None currently tracked for this interaction

### 4. Element Resize
**File:** `Canvas.tsx` (ResizeHandle, handleResizeStart)
**Current State:** ✅ Working
- Corner handles (nw, ne, sw, se)
- Edge handles (n, s, e, w) for single-axis resize
- Minimum size 50x30
- Shift preserves aspect ratio during resize
- Alt resizes from center
- **Issues:** None
- **Improvements Needed:** None currently tracked for this interaction

### 5. Property Panel (Right Panel)
**File:** `PropertyPanel.tsx`
**Current State:** ⚠️ Partially Working
- Shows properties for selected element
- Has Content, Layout, Style, Appearance sections
- **Issues:**
    - Advanced rich text table editing still needs Canva-level controls beyond insertion/removal, row/column add/remove, and header-row toggles
    - Full nested list edge-case parity is not complete
- **Improvements landed:**
    - Shared element style resolver now maps `fontFamily`, `lineHeight`, `textDecoration`, `fontStyle`, `padding`, `margin`, `border`, and shadow-related props consistently.
    - List controls now round-trip stable item arrays and support empty lines in property panel editing.
    - Added richer appearance controls (border style/width/color, box shadow, spacing).
    - Added applied-change feedback in both standalone and embedded inspector layouts.

### 6. Element Selection
**File:** `Canvas.tsx` (handleSelect), `pages.$pageId.edit.tsx`
**Current State:** ✅ Working
- Click to select
- Click canvas to deselect
- Selected element shows ring highlight
- Shift/Cmd/Ctrl-click on the canvas toggles multi-selection.
- Tab and Shift+Tab cycle single selection through visible canvas elements in render order.
- Multi-selection supports group/ungroup, drag, resize, alignment/distribution controls, and selected sibling operations.
- Locked layers remain selectable but are skipped by destructive/transform actions.
- Focused smoke coverage: `BACKY_EDITOR_MULTI_SELECT_SMOKE=1 npm run test:editor-drag --workspace @backy-cms/admin`.
- **Issues:** None
- **Improvements Needed:** None currently tracked for this interaction

### 7. Preview Mode
**File:** `pages.$pageId.edit.tsx` (isPreviewMode state)
**Current State:** ✅ Working
- Toggle button in toolbar
- Hides resize handles, grid
- Makes interactive elements work
- **Issues:** None

### 8. Breakpoint Toggle (Desktop/Tablet/Mobile)
**File:** `pages.$pageId.edit.tsx`
**Current State:** ✅ Partial working
- Buttons change canvas size and active authoring breakpoint
- Desktop edits update the base element model
- Tablet/mobile layout, content, prop, and style edits persist into `element.responsive` overrides
- Tablet/mobile layer hide/show and lock/unlock edits persist into `element.responsive` overrides
- Active breakpoint override groups show which element areas inherit desktop, and layout/layer/content/style groups can be reset independently
- Public rendering applies responsive overrides from the rendered container width
- `test:editor-drag` verifies mobile and tablet layout plus layer visibility/lock override persistence, group-level reset/inheritance controls, desktop layout preservation, breakpoint switching, and reload hydration
- Responsive smoke verifies mobile/tablet CSS and canvas-relative visual geometry with thresholds, hit-testing, clipped snapshots, and reload hydration
- **Remaining Improvements Needed:**
    - Broaden pixel-level screenshot comparison across more templates and component types
- **Implemented Contract:**
    ```typescript
    interface CanvasElement {
      // ... existing props
      responsive?: {
        tablet?: { x?: number; y?: number; width?: number; height?: number; props?: Record<string, unknown>; styles?: Record<string, unknown> };
        mobile?: { x?: number; y?: number; width?: number; height?: number; props?: Record<string, unknown>; styles?: Record<string, unknown> };
      };
    }
    ```

### 9. Undo/Redo
**File:** `pages.$pageId.edit.tsx`
**Current State:** ✅ Working
- Toolbar Undo/Redo buttons restore prior and later canvas states.
- Ctrl/Cmd+Z and Ctrl/Cmd+Shift+Z are wired through the editor shortcut handler.
- History tracks selection snapshots alongside canvas elements and skips representation-only rich-text normalization churn.
- `BACKY_EDITOR_CLIPBOARD_SMOKE=1 npm run test:editor-drag --workspace @backy-cms/admin` covers paste undo/redo as a focused regression.

### 10. Save Button
**File:** `pages.$pageId.edit.tsx`
**Current State:** ✅ Working
- Toolbar Save calls the page editor save path and persists the current canvas element tree plus page settings.
- Ctrl/Cmd+S invokes the same save path in edit and preview modes.
- Save status exposes dirty/saving/autosaving/saved/error states, pending-change count, last saved timestamp, save mode, and error detail.
- Manual saves store canvas JSON through the admin page API and reload into the editor with the saved element layout.
- `BACKY_EDITOR_SAVE_SMOKE=1 npm run test:editor-drag --workspace @backy-cms/admin` covers toolbar save, Ctrl/Cmd+S, persisted page payload, and reload hydration.

### 11. Page Settings Button
**File:** `pages.$pageId.edit.tsx`
**Current State:** ✅ Working
- Settings icon opens `PageSettingsModal`.
- General tab edits page title, slug, status, and scheduled publish time.
- SEO tab edits meta title, meta description, keywords, and JSON-LD with JSON validation.
- Social tab edits/removes OG image URL and can select an image from the media library.
- Save validates route/title/scheduled status, persists through the page editor `onSave` path, closes the dialog, and updates editor save metadata.
- `BACKY_EDITOR_PAGE_SETTINGS_SMOKE=1 npm run test:editor-drag --workspace @backy-cms/admin` covers scheduled-date validation, settings save status, and persisted title/slug/status/meta/keywords/JSON-LD/OG image.

### 12. Z-Index Control (Bring to Front/Back)
**File:** `PropertyPanel.tsx` (Layout section)
**Current State:** ✅ Working
- Z-Index number input exists in the Layout section.
- Toolbar quick controls support Send to back, Send backward, Bring forward, and Bring to front.
- Z-order changes operate within the selected sibling scope, preserve multi-selection ordering, skip locked selections, update normalized sibling `zIndex` values, and flow through editor history.
- `BACKY_EDITOR_Z_ORDER_SMOKE=1 npm run test:editor-drag --workspace @backy-cms/admin` covers the quick controls plus undo/redo as a focused regression.

### 13. Delete Element
**Current State:** ✅ Working
- Toolbar delete removes the selected unlocked element or unlocked sibling multi-selection.
- Keyboard Delete and Backspace use the same deletion path, while editor shortcut guards prevent deletes from leaking out of active form controls.
- Locked selections are skipped, preserving locked layers even when the toolbar button or keyboard shortcut is invoked.
- Delete operations flow through editor history, so undo/redo restores and reapplies the removal.
- Manual save persists the deleted element tree; `BACKY_EDITOR_DELETE_SMOKE=1 npm run test:editor-drag --workspace @backy-cms/admin` covers toolbar delete, keyboard delete, locked-layer protection, undo/redo, and persisted page payload.

### 14. Duplicate Element
**Current State:** ✅ Working
- Duplicate toolbar action and Ctrl/Cmd+D duplicate selected unlocked sibling elements.
- Duplicates receive fresh ids, are offset by 20px, and become the active selection.
- Clipboard smoke covers duplicate after copy/paste/redo sequencing.

### 15. Rich Text Editing
**File:** `BackyEditor` + `RichTextFormatting.tsx` + `ActiveEditorContext.tsx`
**Current State:** ⚠️ Better than previous baseline, not complete parity
- **Implemented in this pass:**
  - Markdown shortcuts now support `+` and both `1.`/`1)` list triggers.
  - Inline markdown shortcuts now convert wrapper syntax into Slate marks for bold, italic, strike, and code.
  - Right-panel selected-text controls now preserve active Slate selections when focus moves into the panel, with focused smoke coverage for applying and clearing a mark on only the selected range.
  - Right-panel list indent/outdent controls clamp active list item indentation between depth 0 and 8 while preserving unselected sibling item depth.
  - Right-panel list move controls can move the active list item up/down while preserving item metadata such as indentation.
  - Rich-text editor list items can be drag-reordered within the same list while preserving item metadata such as indentation.
  - Rich-text leaf rendering now merges multiple text-decoration marks (underline + strike) instead of overwrite behavior.
  - Right-panel rich-text controls can toggle blockquote across multiple selected blocks.
  - Right-panel rich-text controls can insert a basic 2x2 table with semantic editor rendering and persisted Slate table nodes.
  - Right-panel rich-text controls can add a row and column to the active table selection, with persisted Slate table structure.
  - Right-panel rich-text controls can duplicate the active table row and column while preserving copied cell content.
  - Right-panel rich-text controls can remove the active table row and column while preserving remaining cell content.
  - Right-panel rich-text controls can move the active table row up/down and active table column left/right while preserving cell content.
  - Right-panel rich-text controls can toggle the active table row between body cells and semantic header cells with persisted `th` Slate nodes.
  - Right-panel rich-text controls can toggle the active table column between body cells and semantic header cells.
  - Right-panel rich-text controls can toggle the active table cell between body and semantic header cell without changing sibling cells.
  - Right-panel rich-text alignment controls render and persist paragraph alignment inside selected table cells.
  - Right-panel rich-text controls can remove the active table while preserving surrounding rich-text blocks.
  - Selected-range mark controls split multi-node selections at text boundaries, persist marks only on selected fragments, and leave neighboring text unmarked.
  - Shared editor block markdown shortcuts now support `>` for blockquote.
  - Editor context list actions now expose:
    - Toggle same-list off by unwrapping existing list wrappers.
    - Convert selected block content into list items for list toggles.
    - Indent and outdent list entries from the right-panel formatting toolbar.
    - Move the active list item up/down from the right-panel formatting toolbar.
- **Remaining:**
  - Full fidelity for deeper table editing controls and remaining edge-case selections beyond selected-range mark splits.
      key={element.id}  // Forces remount on element change
      content={element.props.content || ''}
      onChange={(content) => onChange({ content })}
    />
    ```

### 16. Font Selection
**File:** `PropertyPanel.tsx` (StyleProperties)
**Current State:** ✅ Working
- Font family/size/style props now resolve through shared renderer style layer and are applied on save-preview and initial render.

### 17. Emoji Picker
**Current State:** ✅ Working for icon elements
- Icon elements expose a symbol input plus a `Pick` button in `PropertyPanel`.
- The picker uses `emoji-picker-react` and includes a deterministic common-emoji strip for fast selection and stable smoke coverage.
- Selecting an emoji updates the icon preview, closes the picker, and persists through the page canvas payload.
- Focused component smoke: `BACKY_EDITOR_COMPONENT_SMOKE=icon npm run test:editor-drag --workspace @backy-cms/admin`.

### 17a. Media Upload Modal
**File:** `components/editor/MediaLibraryModal.tsx`
**Current State:** ✅ Working for editor image uploads
- Image elements expose Select and Upload media actions from the property panel.
- Upload opens the modal directly on the upload tab with image-only filtering and `image/*` file acceptance.
- Upload defaults include visibility, folder, tags, and the active page/post/global scope context.
- Uploaded page-scoped images return to the library tab, can be selected, update the image source/preview, and persist `src`, `mediaId`, `mediaScope`, and `mediaScopeTargetId` into the page canvas payload.
- Focused smoke coverage: `BACKY_EDITOR_MEDIA_UPLOAD_SMOKE=1 npm run test:editor-drag --workspace @backy-cms/admin`.
- Remaining: broaden equivalent upload/select coverage for video/embed/font consumers and route-level media management workflows.

### 18. Grid/Snap
**Current State:** ✅ Working
- Configurable grid size defaults to 10px and updates the visible canvas grid.
- The visual grid can be shown/hidden independently from snap behavior.
- Snap can be toggled on/off from the bottom canvas controls.
- Drag/drop/resize paths share the active grid size, and disabling snap allows freeform sub-grid movement.
- Smart alignment guides appear during drag when element edges/centers approach sibling or canvas targets.
- Guide-assisted snapping aligns dragged elements to peer/canvas edges and clears the guide overlay after release.
- Focused smoke coverage: `BACKY_EDITOR_GRID_SNAP_SMOKE=1 npm run test:editor-drag --workspace @backy-cms/admin`.
- Focused smoke coverage: `BACKY_EDITOR_ALIGNMENT_GUIDES_SMOKE=1 npm run test:editor-drag --workspace @backy-cms/admin`.
- **Improvements Needed:** None currently known for grid/snap controls.

### 19. Layers Panel
**Current State:** ✅ Working
- Right inspector Layers tab renders a hierarchical tree with nested layer depth.
- Layer rows support click selection and Ctrl/Cmd multi-select.
- Dragging layer rows reorders sibling layers and updates sibling z-index ordering.
- Row actions support move up/down, outdent, nest selected layers into container-like parents, hide/show, lock/unlock, duplicate, and delete.
- Hidden and locked layer state saves into the page canvas payload.
- `BACKY_EDITOR_LAYERS_SMOKE=1 npm run test:editor-drag --workspace @backy-cms/admin` covers panel opening, nested depth, multi-select, drag reorder, hide, lock, duplicate, delete, manual save, and persisted layer state.

### 20. Copy/Paste
**Current State:** ✅ Working
- Ctrl/Cmd+C copies selected unlocked sibling element trees into editor clipboard state.
- Ctrl/Cmd+X cuts selected unlocked sibling element trees and keeps them available for paste.
- Ctrl/Cmd+V pastes with fresh ids, 20px offset, nesting support for compatible selected parents, and history integration.
- Focused clipboard smoke verifies copy, paste, undo, redo, duplicate, cut, paste, and manual save.

### 21. Keyboard Shortcuts
**Current State:** ✅ Core editor shortcuts implemented and covered
**Working Shortcuts:**
| Shortcut | Action |
|---|---|
| Delete / Backspace | Delete selected unlocked elements |
| Ctrl/Cmd+D | Duplicate selected unlocked sibling elements |
| Ctrl/Cmd+C | Copy selected unlocked sibling element trees |
| Ctrl/Cmd+X | Cut selected unlocked sibling element trees |
| Ctrl/Cmd+V | Paste with fresh ids, offset, compatible nesting, and history integration |
| Ctrl/Cmd+Z | Undo canvas mutations |
| Ctrl/Cmd+Shift+Z | Redo canvas mutations |
| Ctrl/Cmd+S | Manual save with persisted canvas verification |
| Arrow keys | Nudge selected elements 1px |
| Shift+Arrow | Nudge selected elements 10px |
| Escape | Deselect canvas elements |
| Tab / Shift+Tab | Cycle single selection forward/backward through visible canvas elements |
| Ctrl/Cmd+A | Select all unlocked siblings in the active canvas scope |
| Ctrl/Cmd+G | Group selected sibling elements |
| Ctrl/Cmd+Shift+G | Ungroup selected group |

- Shortcut handling is guarded so focused form controls and dialogs do not trigger canvas nudge, delete, grouping, selection cycling, or save actions.
- Focused smoke coverage: `BACKY_EDITOR_SHORTCUTS_SMOKE=1 npm run test:editor-drag --workspace @backy-cms/admin`.

### 22. Markdown-like Text Shortcuts
**File:** `packages/editor/src/index.tsx`
**Current State:** ✅ Partially complete
- `#`, `##`, `###` + space converts current block to heading.
- `-` + space converts current block to unordered list.
- `*` + space converts current block to unordered list.
- `1.` + space converts current block to ordered list.
- Canvas editor list content now renders through the same RichText surface as text blocks, so list-specific formatting and toolbar operations are shared with text content.
- Remaining in this path: list depth/indent behavior and full multi-column responsive canvas parity.

## Pass Log - What is done vs remaining
**Last Updated:** 2026-05-12

**Current development stance:** This document is now the canonical execution contract for canvas parity work. Any change must be recorded here before moving to the next implementation pass.

### ✅ Completed in this pass
- Replaced public columns placeholder behavior with real column slots, child placement, and renderer smoke coverage.
- Added button action presets in the property panel with normalized href generation, download flag persistence, editor smoke coverage, and public/editor download attribute rendering.
- Tightened link target/rel semantics so `_blank` links cannot drop `noopener noreferrer`, public links preserve underline-off styling, and focused link/public renderer smoke covers the contract.
- Aligned divider public rendering with editor preview by using border-only line geometry, matching vertical margin behavior, and adding public renderer smoke coverage.
- Added map marker label/latitude/longitude controls, coordinate-first embed fallback, persisted marker metadata, editor smoke coverage, and public renderer metadata coverage.
- Added default/custom embed host allowlist enforcement, blocked unsafe/unlisted embed fallback behavior, allowlist metadata, and focused editor/public renderer smoke coverage.
- Tightened box/container nesting parity by rendering a full-size relative child surface publicly and covering parent-relative nested child geometry in editor/public smoke.
- Tightened list parity by preserving empty list rows, clamping negative indentation to zero, and covering the behavior in focused editor/public renderer smoke.
- Brought public quote rendering into parity for appearance, typography, border, and citation styles with renderer smoke coverage.
- Tightened public renderer parity for video boolean playback attributes and icon symbol/size/color/accessibility output via `npm run test:page-renderer --workspace @backy/public`.
- Added form container field schema JSON authoring, editor canvas schema rendering, public renderer schema fields/submit UI, backend form definition generation from stored schema, and focused smoke coverage in the existing form component smoke.
- Added focused editor media upload coverage for image upload modal open state, real file upload, library selection, image preview/source update, manual save, and persisted page-scoped media metadata via `BACKY_EDITOR_MEDIA_UPLOAD_SMOKE=1 npm run test:editor-drag --workspace @backy-cms/admin`.
- Added focused alignment guide coverage for visible vertical/horizontal guides during drag, smart snap to peer edges, and guide cleanup after release via `BACKY_EDITOR_ALIGNMENT_GUIDES_SMOKE=1 npm run test:editor-drag --workspace @backy-cms/admin`.
- Added zoom control test hooks plus focused coverage for zoom out, zoom in, fit-to-canvas, auto-fit state, and visual canvas scale via `BACKY_EDITOR_ZOOM_SMOKE=1 npm run test:editor-drag --workspace @backy-cms/admin`.
- Added canvas navigation coverage for ruler rendering, hand-toggle panning, drag-to-pan viewport scrolling, and temporary Space-hold pan mode through the zoom smoke path.
- Added configurable grid size plus grid visibility and snap on/off controls, with focused browser coverage proving grid visibility plus snapped and unsnapped drag behavior via `BACKY_EDITOR_GRID_SNAP_SMOKE=1 npm run test:editor-drag --workspace @backy-cms/admin`.
- Added component library favorites and hover/focus previews with local persistence, favorites-only filtering, search/category filtering, preview update/clear coverage, and empty-state coverage via `BACKY_EDITOR_LIBRARY_SMOKE=1 npm run test:editor-drag --workspace @backy-cms/admin`.
- Added full resize handle coverage for eight handles, single-axis edge resizing, Shift aspect-ratio resize, and Alt center resize via `BACKY_EDITOR_RESIZE_SMOKE=1 npm run test:editor-drag --workspace @backy-cms/admin`.
- Added Property Panel applied-change feedback with focused coverage in the heading component smoke via `BACKY_EDITOR_COMPONENT_SMOKE=heading npm run test:editor-drag --workspace @backy-cms/admin`.
- Added Property Panel rich-text blockquote and table controls with semantic editor table rendering, persisted table nodes, and focused browser coverage via `BACKY_EDITOR_RICH_TEXT_SMOKE=1 npm run test:editor-drag --workspace @backy-cms/admin`.
- Added Property Panel table row/column growth controls for active rich-text table selections, with browser smoke coverage proving 2x2 tables expand to persisted 3x3 Slate structures.
- Added Property Panel table row/column duplication controls, with browser smoke coverage proving active rows and columns copy cell content and can be removed back to the original table.
- Added Property Panel table row/column removal controls, with browser smoke coverage proving 3x3 tables shrink back to persisted 2x2 structures without losing original cell content.
- Added Property Panel table row/column move controls, with browser smoke coverage proving active table rows and columns can reorder and restore without losing cell content.
- Added Property Panel table header-row toggle controls, with browser smoke coverage proving selected rows render and persist as semantic `th` cells.
- Added Property Panel table header-column toggle controls, with browser smoke coverage proving selected columns render as semantic `th` cells and can be restored to body cells.
- Added Property Panel table header-cell toggle controls, with browser smoke coverage proving one selected cell can render as semantic `th` and be restored without affecting sibling cells.
- Added Property Panel table-cell alignment coverage, proving selected cell paragraphs render centered and persist `align: "center"` in Slate content.
- Added Property Panel whole-table removal controls, with browser smoke coverage proving the active table can be removed without deleting surrounding blockquote content.
- Added Tab and Shift+Tab canvas selection cycling through visible elements, with keyboard shortcut smoke coverage and focused-control guard coverage.
- Added right-panel rich-text list indent max-depth clamping with browser persistence coverage for selected list items.
- Added right-panel rich-text list item move up/down controls with browser coverage proving selected items reorder and preserve indentation metadata.
- Added rich-text list item drag reorder with browser coverage proving dragged items reorder within the same list and preserve indentation metadata.
- Added shared markdown-like block conversions in `BackyEditor`.
- Added inline markdown mark shortcuts in `BackyEditor` with direct editor coverage and focused browser smoke coverage.
- Added selected-range rich-text panel smoke coverage for mark application and clear-formatting, including a local-only active-editor selection bridge for deterministic browser verification.
- Added explicit keydown passthrough so editor consumers can layer additional shortcuts.
- Unified canvas `list` rendering with `RichTextBlock` so list editing follows rich-text behavior.
- Synced list textarea/list-type controls with rich-text list content so old and new list models stay compatible.
- Added richer style coverage in `PropertyPanel` and style props propagation in `Canvas`.
- Preserved list row/blank-item behavior in list conversion utilities.
- Added list indentation control in `PropertyPanel` (`listIndent`) and carried it through canvas/public renderers (`marginLeft`/`padding` baseline behavior).
- Fixed `RichTextFormatting.tsx` syntax corruption and stabilized it as a compile-safe editing control.
- Fixed a Vite/parser regression in `Canvas.tsx` (`||` + `??` precedence issue).
- Added list un-toggle/restore and list-item indent controls plumbing in `ActiveEditorContext` (`toggleList`, `indentList`, `outdentList`) with safer block-type restoration.
- Fixed style panel zero-value handling for opacity (`opacity` now uses nullish-safe `??` defaults instead of `||` fallback).
- Added text-style-aware panel behavior in `PropertyPanel`:
  - `StyleProperties` now supports text-style sections only for text-capable elements (`text`, `heading`, `paragraph`, `quote`, `button`, `link`, `list`, `icon`).
  - Non-text element panels no longer show irrelevant typography controls.
- Added paragraph to text-capable content editing in property panel so paragraph elements open rich-text controls.
- Expanded rich text inline styling controls in `RichTextFormatting`:
  - selection font family and font size controls
  - clear-selection formatting action
  - explicit mark clearing helper for font family/size/ color / background / decoration.

### ⚠️ Remaining
- No known editor-completion blockers remain in this spec slice.

### ✅ Admin table status resilience
- Shared admin status badges now normalize empty, whitespace, literal `null`/`undefined`, and unknown status strings to stable labels/types instead of rendering blank or misleading labels.
- Media library visibility and safety status labels now use the shared status badge path, matching the user and blog tables.
- Covered by `npm run test:status-badge --workspace @backy-cms/admin`.

### ✅ Selected rich-text style controls
- Selected text range controls now preserve Slate selection across inspector focus changes for italic, clear formatting, font size, font family, and text color.
- Selected range font size, font family, underline, strikethrough, and text color now persist as Slate leaf marks through the canvas history/save path instead of being collapsed to plain text.
- Native input/select/color controls avoid stale whole-element content fallback while an active rich-text editor is targeted.
- Covered by `BACKY_EDITOR_RICH_TEXT_SMOKE=1 npm run test:editor-drag --workspace @backy-cms/admin`, including backend page API assertions for persisted selected-range marks.

### ✅ Rich-text list property parity
- Extracted list content transforms into shared pure helpers so property-panel fallbacks preserve empty list rows and nested list item structure during list type changes.
- Active editor list indent/outdent and package-level keyboard list shortcuts now remove `indent` at zero instead of persisting `indent: 0`, keeping indentation clamped and structurally stable.
- Covered by `npm run test:rich-text-lists --workspace @backy-cms/admin`, `npm run typecheck --workspace @backy-cms/admin`, and `npm run test:inline-markdown --workspace @backy-cms/editor`.

### ✅ Media scope model and API contract
- Finalized the media scope model as `global|page|post`, with `blogId` remaining a public API alias for `postId`.
- Public/admin media filters return global assets plus assets explicitly scoped or bound to the requested page/post, while `global=true` isolates reusable global assets.
- Page/post scoped uploads now require `scopeTargetId`, and admin media updates write the same scope, target, `pageIds`, and `postIds` metadata through both demo-store and DB-backed runtimes.
- Covered by `npm run test:media-scope --workspace @backy/public` and `npm run typecheck --workspace @backy/public`.

### ✅ Blog post editor flow
- The dedicated blog edit route now exposes template provenance for frontend-design-backed posts, including template id/name, route pattern, binding count, canvas badge, and editor handoff JSON.
- Template-backed blog posts render through the same `CanvasEditor` workspace, post-scoped media context, readiness/publish/taxonomy/comment/revision panels, and focus canvas mode as normal posts.
- Covered by `npm run test:blog-editor --workspace @backy-cms/admin` and `npm run typecheck --workspace @backy-cms/admin`.

## Backend/API + Frontend topology (FOSS consumption)
- Canonical deployment model:
  - `backy-admin` on Vercel: admin UI + CMS APIs, auth, schema migrations, media catalog, form/comment endpoints.
  - `backy-frontend` on Vercel: public site rendering, consuming only read APIs (plus form/comment submission).
- Keep admin routes and public read APIs separated by middleware and JWT policy; avoid exposing internal mutate routes in frontend runtime.
- API shape examples for custom frontend:
  - `GET /api/pages/:slug`
  - `GET /api/sites/:siteId/pages/:slug/blocks`
  - `POST /api/forms/:formId/submit`
  - `POST /api/comments/:postId`
  - `GET /api/media` + scoped filters `pageId` / `blogId` / `global=true`
  - `GET /api/settings/:siteSlug` (branding + theme + fonts)

## Missing Features List
**Critical (Must Have)**
- ✅ Delete element
- ✅ Save page to database
- ✅ Load existing page on edit
- ✅ Undo/Redo functionality
- ✅ RichTextEditor selected-range reset/persistence
- ✅ Finalize selected-text style persistence (font family/decoration on partially selected ranges)

**Important (Should Have)**
- ✅ Page Settings modal
- ✅ Duplicate element
- ✅ Z-Index quick controls (bring/send forward/back)
- ✅ Keyboard shortcuts
- ✅ Emoji picker for icons
- ✅ Layers panel

**Nice to Have**
- ✅ Multi-select elements
- ✅ Copy/Paste
- ✅ Alignment guides
- ✅ Zoom controls
- ⚠️ Responsive breakpoint editing
  - Desktop/tablet/mobile layout/content/style and layer visibility/lock overrides now persist and render publicly.
  - Group-level breakpoint reset controls now make desktop inheritance explicit for layout, layer, content, and style.
  - Mobile and tablet persistence plus thresholded editor visual geometry are covered by responsive smoke; still needs broader pixel-level comparison across templates/components.
- ✅ Media upload modal
- ✅ Element locking
- ⚠️ Page templates
  - Static composed library presets now exist for hero, feature-grid, and lead-capture form sections.
  - Backend reusable-section APIs now persist saved canvas section patterns, the editor library can load active saved sections, save the selected element tree, insert saved sections as synced canvas instances, refresh a selected synced instance from its saved source, detach an instance into an independent editable copy, and expose active sections through public APIs, manifest/OpenAPI, and the SDK.
  - Site frontend design contracts now persist page/blog template registries, and admin page/blog create APIs can seed editable content plus design provenance from `frontendDesignTemplateId`.
  - Reusable-section updates now expose optimistic conflict guards (`expectedVersion`/`expectedUpdatedAt`) and bounded version history through the admin versions endpoint.
  - Reusable-section export/import now supports JSON portability across sites, duplicate-slug protection, and upsert imports that increment version history.
  - Reusable-section restore now lets admins restore an older saved-section version with slug conflict checks and restore provenance.
  - Reusable-section instance registry/propagation now discovers synced page/blog instances, reports stale source timestamps, and bulk-refreshes synced instances while preserving root placement.
  - Page-create smoke now creates and reopens every built-in starter page template, including the about template, and verifies seeded editable elements, chrome, canvas sizing, form/data-binding metadata, and editor rendering.
  - Reusable-section create/update/delete/restore/import/instance-propagation now emits queryable admin audit logs with request-id correlation.
  - Section management operations now enforce content permissions; broader non-section admin RBAC remains a platform-wide gap.
- ✅ Conflict-safe page saves
  - Page editor saves send `expectedUpdatedAt` through `PATCH /api/admin/sites/:siteId/pages/:pageId`.
  - Stale editor saves now return `PAGE_VERSION_CONFLICT` instead of overwriting a newer backend copy.
  - The page editor renders a save-conflict banner with editor/backend timestamps and a reload-latest action.
  - Focused coverage: `BACKY_EDITOR_CONFLICT_SMOKE=1 npm run test:editor-drag --workspace @backy-cms/admin` verifies the stale save is blocked, newer backend data is preserved, and reload clears the conflict state.

## Priority Order
**Phase 1: Critical Fixes (Immediate)**
- Fix RichTextEditor reset issue ✅
- Finalize selected-text style persistence in rich text ✅
- Add delete element functionality
- Implement undo/redo

**Phase 2: Core Functionality**
- Save page to database ✅
- Load existing page ✅
- Duplicate element ✅

**Phase 3: Usability**
- Keyboard shortcuts ✅
- Emoji picker ✅
- Layers panel ✅
- Multi-select ✅

**Phase 4: Polish**
- Copy/Paste
- Zoom controls ✅
- Alignment guides ✅
- Responsive breakpoints
- Media upload ✅

## Phase 5: Plate.js Editor Migration (CRITICAL PRIORITY)
**Goal:** Replace Tiptap with Plate.js (headless, fully customizable, MIT license).
**Reason:** User requested Plate.js features (Math, Media, Custom Fonts) and "Notion-like" experience.
**Location:** `packages/editor` (New Shared Package).

### 1. Project Structure
Create `packages/editor` workspace.
- **Dependencies:** `@udecode/plate-common`, `@udecode/plate-core`, `@udecode/plate-slate`, `slate`, `slate-react`, `slate-history`.
- **UI Components:** `@udecode/plate-ui` (or custom Shadcn/Tailwind implementation).

### 2. Core Features (Plugins)
- **Markdown:** `@udecode/plate-markdown` (Shortcuts for auto-formatting).
- **Basic Marks:** Bold, Italic, Underline, Code, Strikethrough.
- **Blocks:** Heading, Paragraph, Blockquote, List, Link.
- **Media:** Image, Video (with resize/caption support).
- **Advanced:**
    - Math/Equation (`@udecode/plate-math`? or customized katex).
    - Font Family (Custom plugin to inject style).
    - Drag & Drop (Plate DnD plugin).

### 3. Integration
- **Component:** Export `<BackyEditor />` from `packages/editor`.
- **State:** Controlled component behavior (`value`, `onChange`).
- **Toolbar:** Floating Toolbar + Fixed Toolbar options.
