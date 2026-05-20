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
| 5 | Property Panel (Right Panel) | ✅ | Content, layout, style, appearance, animation, typography, rich-text, table/list, and applied-change feedback controls are wired for the current editor scope |
| 6 | Element Selection | ✅ | Click to select |
| 7 | Preview Mode | ✅ | Toggle to preview |
| 8 | Breakpoint Toggle | ✅ | Desktop/tablet/mobile authoring persists responsive overrides, resets inheritance groups, hydrates on reload, and renders publicly |
| 9 | Undo/Redo Buttons | ✅ | Toolbar and shortcut undo/redo restore distinct canvas states |
| 10 | Save Button | ✅ | Manual save and Ctrl/Cmd+S persist canvas JSON with status metadata and reload hydration coverage |
| 11 | Page Settings | ✅ | Modal edits title, slug, status/schedule, SEO, JSON-LD, keywords, and social image with persistence coverage |
| 12 | Z-Index Control | ✅ | PropertyPanel input plus toolbar bring/send forward/back controls with undo/redo coverage |
| 13 | Delete Element | ✅ | Toolbar and Delete/Backspace remove unlocked selections with undo/redo and persistence coverage |
| 14 | Duplicate Element | ✅ | Toolbar and Ctrl+D duplicate selected sibling elements with offset |
| 15 | Rich Text Editing | ✅ | List/selected-text flow, imported-depth normalization, list toggle/indent/button-reorder/drag-reorder tools, nested child list targeting guards, bounded list indent edits, markdown shortcuts, persisted selected-range leaf marks including cross-node split marks, blockquote/table panel controls, row/column table growth/duplication/removal/reorder, table header row/column/cell toggles, table-cell merge/split, table-cell alignment/fill/border/vertical alignment including selected multi-cell style ranges, table captions, whole-table removal, and text-mark rendering are covered |
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
| text | ✅ Content, color, typography, spacing | ✅ | ✅ | Inline markdown, selected-range panel formatting including cross-node mark splits, multi-block blockquote, selected-list item indentation/button-reorder/drag-reorder, imported-depth normalization, nested child list targeting, basic table insertion/removal, table row/column growth/duplication/removal/reorder, table-cell merge/split/alignment/fill/border/vertical alignment, selected multi-cell table fill/border/vertical style ranges, table captions, color clearing, and header row/column/cell toggles are covered | ✅ |
| heading | ✅ Similar to text | ✅ | ✅ | Inline markdown, selected-range mark/clear flows including cross-node mark splits, bounded selected-list indentation/button-reorder/drag-reorder, imported-depth normalization, nested child list targeting, multi-block blockquote, basic table insertion/removal, table row/column growth/duplication/removal/reorder, table-cell merge/split/alignment/fill/border/vertical alignment, selected multi-cell table fill/border/vertical style ranges, table captions, color clearing, and header row/column/cell toggles are covered | ✅ |
| paragraph | ✅ | ✅ | ✅ | Same covered rich-text table/list behavior as heading | ✅ |
| quote | ✅ | ✅ | ✅ | Public renderer now carries quote appearance, typography, citation, and border styles | ✅ |
| image | ✅ source/fit/alt/upload picker | ✅ | ✅ | Transform/version-management UX lives in the central media route and is covered by media smoke tests | ✅ |
| video | ✅ source/controls | ✅ | ✅ | autoplay/loop/muted/playsInline public output is now covered; version-management UX lives in the central media route | ✅ |
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

- `media` now uses the site-scoped admin media API contract for both:
  - media library modal (`components/editor/MediaLibraryModal.tsx`), through `listMediaLibrary`, `uploadMedia`, `replaceMedia`, and scoped `pageId`/`postId` filters.
  - media management route (`routes/media.tsx`), through `/api/admin/sites/:siteId/media`, folders, versions, transforms, signed URLs, provider analytics, and storage/runtime settings.
- The finalized media scope model is `global|page|post`; `blogId` remains an API alias for `postId`. Page/post uploads send `scopeTargetId`, and returned selections persist `mediaId`, `mediaScope`, and `mediaScopeTargetId` into canvas payloads.
- `embed/map` now support:
  - normalized embed source parsing (YouTube/Vimeo/watch/watch URLs + iframe snippets)
  - address-based map conversion to Google Maps embed URL when non-URL text is provided
- Coverage: `BACKY_EDITOR_MEDIA_UPLOAD_SMOKE=1 npm run test:editor-drag --workspace @backy-cms/admin`, `npm run test:media --workspace @backy-cms/admin`, and `npm run test:media-scope --workspace @backy/public`.

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
**Current State:** ✅ Working
- Shows properties for selected element
- Has Content, Layout, Style, Appearance sections
- **Issues:** None currently tracked for this panel
- **Improvements landed:**
    - Shared element style resolver now maps `fontFamily`, `lineHeight`, `textDecoration`, `fontStyle`, `padding`, `margin`, `border`, and shadow-related props consistently.
    - List controls now round-trip stable item arrays and support empty lines in property panel editing.
    - Nested Slate list content is normalized into Backy's flat list item + `indent` model before active editing, so selecting and indenting a nested child item no longer retargets the parent item.
    - Rich-text list helper coverage now guards nested child list targeting, so type conversion/reordering for selected child items does not retarget the parent item that contains descendant text.
    - Selected nested list indent/outdent now targets the active list item's own text before falling back to range offsets, so parent and sibling list item indentation is preserved when changing a child item's depth.
    - Rich-text tables support authored captions that render above the table, remain outside the editable Slate cell flow, sync to table metadata, and persist through save/reload smoke coverage.
    - Selected rich-text table cells can merge with the right sibling or cell below, then split spanned cells back into sibling cells using persisted `colSpan`/`rowSpan` metadata.
    - Selected table cells can receive an independent fill color from the rich-text toolbar, render on the cell, and persist without leaking to adjacent cells.
    - Selected table cells can receive an independent border color from the rich-text toolbar, render on the cell border, and persist without leaking to adjacent cells.
    - Table cell fill and border color controls can clear previously applied selected-cell colors and persist the removed metadata.
    - Selected table cells can receive independent vertical alignment from the rich-text toolbar, render on the cell, and persist without leaking to adjacent cells.
    - Selected multi-cell table ranges can receive persisted fill color, border color, and vertical alignment metadata across the selected rectangle without leaking into unselected cells.
    - Selected table ranges now resolve through a span-aware visual grid, so ranges that cross `rowSpan`/`colSpan` cells include visually covered sibling cells instead of relying only on raw Slate child indexes.
    - Editor smoke coverage now guards the rich-text table range-selection source path plus the merged/multi-cell browser smoke assertions so table fill, border, and vertical alignment remain applied across the selected rectangle only.
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
**Current State:** ✅ Working
- Buttons change canvas size and active authoring breakpoint
- Desktop edits update the base element model
- Tablet/mobile layout, content, prop, and style edits persist into `element.responsive` overrides
- Tablet/mobile layer hide/show and lock/unlock edits persist into `element.responsive` overrides
- Active breakpoint override groups show which element areas inherit desktop, and layout/layer/content/style groups can be reset independently
- Public rendering applies responsive overrides from the rendered container width
- `test:editor-drag` verifies mobile and tablet layout plus layer visibility/lock override persistence, group-level reset/inheritance controls, desktop layout preservation, breakpoint switching, and reload hydration across text, image, video, icon, box/nested-container, columns, navigation, form, comment, repeater, embed, map, interactive component, code component, nested button, nested box, grandchild button, and select/checkbox/radio choice input elements.
- Responsive smoke verifies mobile/tablet CSS and canvas-relative visual geometry with thresholds, hit-testing, clipped snapshots, editor reload hydration, and public preview rendering for text, media, utility, box/nested-container, columns, navigation, form, comment, repeater, embed/map, interactive/code component, one-level and multi-level nested children, and select/checkbox/radio choice input components.
- `test:page-create` now verifies each built-in starter page template, frontend-design template-backed page, and collection dataset list/detail pages in mobile and tablet hosted previews with breakpoint/scale assertions, required element presence, overflow checks, and pixel-threshold screenshots.
- `test:reusable-sections` now verifies saved reusable section canvas content in mobile and tablet hosted previews with breakpoint/scale assertions, required element presence, overflow checks, and pixel-threshold screenshots.
- Public rendering applies tablet/mobile overrides inside the matching breakpoint canvas dimensions instead of scaling a desktop-width canvas around mobile-authored coordinates.
- **Remaining Improvements Needed:**
    - Optional expansion: broaden pixel-level screenshot comparison across cross-browser responsive combinations and additional composed-template permutations.
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
- Keyboard shortcuts support Ctrl/Cmd+[ and Ctrl/Cmd+] for one-step layer ordering, with Shift sending to back/front.
- Z-order changes operate within the selected sibling scope, preserve multi-selection ordering, skip locked selections, update normalized sibling `zIndex` values, and flow through editor history.
- `BACKY_EDITOR_Z_ORDER_SMOKE=1 npm run test:editor-drag --workspace @backy-cms/admin` covers the quick controls, keyboard shortcuts, plus undo/redo as a focused regression.

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
- Duplicating a custom-named layer appends a unique `Copy`/`Copy 2` suffix to the duplicated root name so the layer tree stays distinguishable.
- Clipboard smoke covers duplicate after copy/paste/redo sequencing.

### 15. Rich Text Editing
**File:** `BackyEditor` + `RichTextFormatting.tsx` + `ActiveEditorContext.tsx`
**Current State:** ⚠️ Better than previous baseline, not complete parity
- **Implemented in this pass:**
  - Markdown shortcuts now support `+` and both `1.`/`1)` list triggers.
  - Inline markdown shortcuts now convert wrapper syntax into Slate marks for bold, italic, strike, and code.
  - Right-panel selected-text controls now preserve active Slate selections when focus moves into the panel, with focused smoke coverage for applying and clearing a mark on only the selected range.
  - Right-panel clear formatting now removes selected-range font size, font family, underline, strikethrough, text color, and highlight marks before later selected-range persistence checks run.
  - Right-panel list indent/outdent controls clamp active list item indentation between depth 0 and 8 while preserving unselected sibling item depth.
  - Right-panel list move controls can move the active list item up/down while preserving item metadata such as indentation.
  - Rich-text editor list items can be drag-reordered within the same list while preserving item metadata such as indentation.
  - Deep nested Slate lists normalize into flat list-item metadata in order while clamping rendered indentation at depth 8.
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
  - Right-panel rich-text controls can merge the active table cell with its right sibling or the cell below, then split spanned cells back into sibling cells with rendered and persisted `colSpan`/`rowSpan` metadata.
  - Right-panel rich-text alignment controls render and persist paragraph alignment inside selected table cells.
  - Right-panel rich-text controls can set and clear selected table cell fill and border colors without leaking metadata to adjacent cells.
  - Right-panel rich-text controls can set selected table cell vertical alignment without leaking metadata to adjacent cells.
  - Right-panel rich-text controls can apply and persist fill, border, and vertical alignment to a selected multi-cell table range without leaking metadata into unselected cells.
  - Selected table ranges use a span-aware visual grid so row/column-spanned cells and their visually intersecting siblings receive range styling together.
  - Right-panel rich-text controls can set table captions that render outside the editable cell flow and persist on the Slate table node.
  - Right-panel rich-text controls can remove the active table while preserving surrounding rich-text blocks.
  - Selected-range mark controls split multi-node selections at text boundaries, persist marks only on selected fragments, and leave neighboring text unmarked.
  - Nested Slate lists normalize into flat list item metadata before editing, preserving parent/child/sibling targeting for right-panel indent controls.
  - Right-panel list indent/outdent for selected nested list items now preserves parent and sibling indentation while clamping the selected item's depth.
  - Shared editor block markdown shortcuts now support `>` for blockquote.
  - Editor context list actions now expose:
    - Toggle same-list off by unwrapping existing list wrappers.
    - Convert selected block content into list items for list toggles.
    - Indent and outdent list entries from the right-panel formatting toolbar.
    - Move the active list item up/down from the right-panel formatting toolbar.
- **Remaining:**
  - No known rich-text table/list editing blockers remain in this spec slice; imported-depth normalization, selected nested list targeting, selected-range marks, and span-aware table-range styling are covered by focused smokes.

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
**Current State:** ✅ Working for editor image, video, embed, and font uploads
- Image, video, embed, and font style consumers expose Select/Upload media actions from their property controls.
- Upload opens the modal directly on the upload tab with consumer-appropriate filtering and file acceptance (`image/*`, `video/*`, unrestricted embed assets, and font extensions).
- Upload defaults include visibility, folder, tags, and the active page/post/global scope context.
- Uploaded page-scoped images, videos, and embed assets return to the library tab, can be selected, update the source/preview, and persist `src`, `mediaId`, `mediaScope`, and `mediaScopeTargetId` into the page canvas payload.
- Uploaded fonts can be selected from the font media picker and persist the chosen `fontFamily` into styled text elements.
- Focused smoke coverage: `BACKY_EDITOR_MEDIA_UPLOAD_SMOKE=1 npm run test:editor-drag --workspace @backy-cms/admin`.
- Route-level media management coverage: `npm run test:media --workspace @backy-cms/admin` drives the `/media` route in Chrome and verifies folder create/rename/move/delete, storage settings/check/provisioning UI, upload intake layout, detail metadata edits, image presentation metadata, replacement/version compare/restore/delete, transform preparation, quarantine/release, signed URL generation, provider analytics, activity panels/filters, and UI deletion with cleanup.
- Remaining: no known media upload/route workflow gaps in this spec slice.

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
- Layer rows support click selection, Ctrl/Cmd multi-select, and Shift range-select across the rendered layer-tree order.
- Layer rows expose tree/treeitem semantics and support roving-focus Enter/Space keyboard selection plus Arrow/Home/End navigation with selected/level/expanded state.
- Nested layer rows can be collapsed or expanded from the layer tree disclosure control, and ArrowLeft/ArrowRight collapse or expand the focused nested row.
- Bulk layer tree controls can expand or collapse every row that contains child layers.
- Layer search filters rows by custom name, element type, or id, preserves ancestor context for nested matches, and temporarily reveals matching descendants inside collapsed parents.
- Layer rows can be renamed inline from the layer action menu; custom names persist on the canvas element `name` field without overwriting content/form props.
- The inspector selection card displays and edits custom layer names while retaining element type and id detail.
- Selected layer rows keep their action buttons visible without requiring hover, while unselected rows reveal actions on hover and keep hidden actions out of pointer/keyboard interaction.
- Dragging layer rows reorders sibling layers and updates sibling z-index ordering.
- Row actions support move up/down, outdent, nest selected layers into container-like parents, hide/show, lock/unlock, duplicate, and delete; duplicate/delete apply to the selected unlocked sibling set when invoked from a selected row in a multi-selection.
- Duplicating a custom-named layer from the layer tree gives the copied root a unique `Copy`/`Copy 2` name in the sibling scope.
- Hidden and locked layer state saves into the page canvas payload.
- `BACKY_EDITOR_LAYERS_SMOKE=1 npm run test:editor-drag --workspace @backy-cms/admin` covers panel opening, nested depth, click/keyboard/bulk collapse-expand, nested layer search/filter behavior, inline rename persistence and inspector edit/display, Ctrl/Cmd multi-select, Shift range-select, roving-focus keyboard row selection/navigation tree semantics, selected-row action visibility, hidden row action interactivity guards, drag reorder, hide with layer visibility undo/redo, lock, single and multi duplicate/delete, manual save, and persisted layer state.

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
| Ctrl/Cmd+[ / Ctrl/Cmd+] | Send backward / bring forward |
| Shift+Ctrl/Cmd+[ / Shift+Ctrl/Cmd+] | Send to back / bring to front |

- Shortcut handling is guarded so focused form controls and dialogs do not trigger canvas nudge, delete, grouping, selection cycling, or save actions.
- Grouping shortcut coverage now verifies Ctrl/Cmd+G preserves child geometry, Ctrl/Cmd+Z restores the sibling multi-selection, Ctrl/Cmd+Shift+Z restores the grouped selection, and Ctrl/Cmd+Shift+G expands children back into the original sibling geometry.
- Ungrouping now converts tablet/mobile child layout overrides from group-relative coordinates back into absolute canvas coordinates, so breakpoint-authored grouped layouts do not jump when expanded.
- Focused smoke coverage: `BACKY_EDITOR_SHORTCUTS_SMOKE=1 npm run test:editor-drag --workspace @backy-cms/admin`.

### 22. Markdown-like Text Shortcuts
**File:** `packages/editor/src/index.tsx`
**Current State:** ✅ Working
- `#`, `##`, `###` + space converts current block to heading.
- `-` + space converts current block to unordered list.
- `*` + space converts current block to unordered list.
- `1.` + space converts current block to ordered list.
- Canvas editor list content now renders through the same RichText surface as text blocks, so list-specific formatting and toolbar operations are shared with text content.
- Imported/raw list depth is normalized before render and before indent/outdent edits in both the admin rich-text controls and the shared editor package.
- Multi-column responsive canvas parity is covered by editor responsive smoke for mobile/tablet authoring, reload hydration, and public columns geometry.

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
- Added focused editor media upload coverage for image, video, embed, and font upload modal open state, real file upload, library selection, preview/source/font update, manual save, and persisted page-scoped media metadata or font family via `BACKY_EDITOR_MEDIA_UPLOAD_SMOKE=1 npm run test:editor-drag --workspace @backy-cms/admin`.
- Verified route-level media management coverage for folders, storage configuration, upload intake, metadata, replacements/versioning, transforms, quarantine/release, signed URLs, analytics, activity, and deletion via `npm run test:media --workspace @backy-cms/admin`.
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
- Added Property Panel table-cell merge-right/merge-down and split-cell controls, with browser smoke coverage proving selected cells render `colspan="2"`/`rowspan="2"` after merge and return to sibling cells after split.
- Added Property Panel table-cell alignment coverage, proving selected cell paragraphs render centered and persist `align: "center"` in Slate content.
- Added Property Panel table caption, selected-cell fill, selected-cell border color, vertical alignment, and color-clearing coverage, proving the controls render and persist only on the intended table/cell metadata.
- Added Property Panel whole-table removal controls, with browser smoke coverage proving the active table can be removed without deleting surrounding blockquote content.
- Added Tab and Shift+Tab canvas selection cycling through visible elements, with keyboard shortcut smoke coverage and focused-control guard coverage.
- Added right-panel rich-text list indent max-depth clamping with browser persistence coverage for selected list items.
- Added right-panel rich-text list item move up/down controls with browser coverage proving selected items reorder and preserve indentation metadata.
- Added rich-text list item drag reorder with browser coverage proving dragged items reorder within the same list and preserve indentation metadata.
- Added nested child list targeting guards in `test:rich-text-lists`, covering selected child-item type conversion/reorder without retargeting a parent item that contains nested descendant text.
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
- Imported or object-backed list item indentation now clamps to the editor's depth-8 contract before canvas/public rendering, preventing external content from creating runaway list offsets.
- The shared editor package now exports and smokes the same list-indent normalizer, so package-level rendering uses the bounded depth contract instead of raw imported metadata.
- Admin rich-text list controls and shared editor keyboard shortcuts now normalize imported/raw list indent values before calculating indent/outdent edits, so an imported `indent: "99"` item steps down from the bounded depth-8 contract instead of reusing raw metadata.
- Fixed style panel zero-value handling for opacity (`opacity` now uses nullish-safe `??` defaults instead of `||` fallback).
- Added text-style-aware panel behavior in `PropertyPanel`:
  - `StyleProperties` now supports text-style sections only for text-capable elements (`text`, `heading`, `paragraph`, `quote`, `button`, `link`, `list`, `icon`).
  - Non-text element panels no longer show irrelevant typography controls.
- Added paragraph to text-capable content editing in property panel so paragraph elements open rich-text controls.
- Expanded rich text inline styling controls in `RichTextFormatting`:
  - selection font family and font size controls

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
- List type-change and move helpers now normalize imported/raw list item indentation before re-persisting cloned nodes, so toolbar actions cannot restore out-of-contract depths after the render clamp.
- Active editor list indent/outdent and package-level keyboard list shortcuts now remove `indent` at zero instead of persisting `indent: 0`, keeping indentation clamped and structurally stable.
- Canvas preview and public rendering now preserve nested/indented Slate list items instead of flattening them to plain strings, including nested child items and object-backed item metadata.
- Covered by `npm run test:rich-text-lists --workspace @backy-cms/admin`, `npm run typecheck --workspace @backy-cms/admin`, and `npm run test:inline-markdown --workspace @backy-cms/editor`.

### ✅ Media scope model and API contract
- Finalized the media scope model as `global|page|post`, with `blogId` remaining a public API alias for `postId`.
- Public/admin media filters return global assets plus assets explicitly scoped or bound to the requested page/post, while `global=true` isolates reusable global assets.
- Page/post scoped uploads now require `scopeTargetId`, and admin media updates write the same scope, target, `pageIds`, and `postIds` metadata through both demo-store and DB-backed runtimes.
- Covered by `npm run test:media-scope --workspace @backy/public` and `npm run typecheck --workspace @backy/public`.

### ✅ Blog post editor flow
- The dedicated blog edit route now exposes template provenance for frontend-design-backed posts, including template id/name, route pattern, binding count, canvas badge, and editor handoff JSON.
- Template-backed blog posts render through the same `CanvasEditor` workspace, post-scoped media context, readiness/publish/taxonomy/comment/revision panels, and focus canvas mode as normal posts.
- Blog create now accepts `designTemplate`, `frontendDesignTemplateId`, and `frontendTemplate` query aliases for captured frontend-design blog templates. Template canvas application waits for blog-create edit readiness, so deep-linked custom frontend templates insert their wrapper/content into the canvas instead of only selecting the panel card.
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
  - Mobile and tablet persistence plus thresholded editor/public visual geometry are covered for heading, image, video, icon, box/nested-container, columns, navigation, form, comment, repeater, embed, map, interactive component, code component, one-level and multi-level nested children, select/checkbox/radio choice inputs, built-in starter page templates, frontend-design template-backed pages, collection dataset list/detail pages, and saved reusable section canvas content; still needs broader pixel-level comparison across cross-browser responsive combinations and additional composed-template permutations.
- Responsive smoke now also covers mobile/tablet columns, navigation, form, comment, repeater, embed/map, interactive/code, nested button, nested box, grandchild button, and choice-input layout overrides, reload hydration, and public preview CSS/visual geometry with clipped screenshots and hit-testing.
- Long-session stress smoke now covers repeated keyboard edits across multiple elements, undo/redo recovery, a midpoint mobile responsive override edit, save/reload persistence, and runtime health sampling via `npm run test:editor-stress --workspace @backy-cms/admin`.
- Public `PageRenderer` now uses the active breakpoint canvas size for tablet/mobile scaling so responsive overrides are positioned in the same coordinate system authored in the editor.
- Editor smoke login now supports seeded admin MFA through `BACKY_EDITOR_SMOKE_MFA_CODE`, `BACKY_ADMIN_MFA_CODE`, or `BACKY_ADMIN_2FA_CODE` and seeds the httpOnly admin session cookie for browser-driven editor routes, matching the other admin smoke suites.
- ✅ Media upload modal
- ✅ Element locking
- ⚠️ Page templates
  - Static composed library presets now exist for hero, feature-grid, lead-capture form, blog post card, latest posts, category list, and related content sections; latest posts, category list, and related content sections now seed collection-ready repeaters for dynamic archive/taxonomy/related-content widgets.
  - Component-library presets can now carry root and child tablet/mobile responsive overrides, and the blog/content presets seed narrower-canvas geometry instead of relying on desktop-only placement after insertion.
  - Blog/content presets now carry root and child binding-slot metadata for post title, excerpt, featured image, meta/category, link, taxonomy, and collection-record targets; the Data panel exposes those slots and can apply matching selected-collection fields as real `dataBindings` or repeater field props.
  - Selecting a composed card/section can now apply matching child binding slots across descendants in one editor history step, including named root slots that target child repeaters, repeater collection/field props, and virtual record slug/URL targets for link slots.
  - The Data panel now includes a one-click composed-preset binding action that applies matching root, named-descendant, and child binding slots together for the selected collection.
  - Public repeaters can now render authored child templates once per hydrated record and resolve child collection `dataBindings` from the active record, while retaining the generic card fallback for non-designed repeaters.
  - Binding-slot metadata is preserved in the shared content contract and public render payload schema so custom frontend handoff can inspect intended field targets without scraping admin-only preset definitions.
  - Backend reusable-section APIs now persist saved canvas section patterns, the editor library can load active saved sections, save the selected element tree, insert saved sections as synced canvas instances, refresh a selected synced instance from its saved source, detach an instance into an independent editable copy, and expose active sections through public APIs, manifest/OpenAPI, and the SDK.
  - Site frontend design contracts now persist page/blog template registries, and admin page/blog create APIs can seed editable content plus design provenance from `frontendDesignTemplateId`.
  - Blog-create smoke now exercises `frontendDesignTemplateId` handoff for captured frontend blog templates and verifies the selected template wrapper, autosave/recovery state, mobile override authoring, and persisted post metadata.
  - Reusable-section updates now expose optimistic conflict guards (`expectedVersion`/`expectedUpdatedAt`) and bounded version history through the admin versions endpoint.
  - Reusable-section export/import now supports JSON portability across sites, duplicate-slug protection, and upsert imports that increment version history.
  - Reusable-section restore now lets admins restore an older saved-section version with slug conflict checks and restore provenance.
  - Reusable-section instance registry/propagation now discovers synced page/blog instances, reports stale source timestamps, and bulk-refreshes synced instances while preserving root placement.
  - Reusable-section smoke now verifies saved section canvas content in mobile/tablet hosted previews with breakpoint/scale assertions, required frontend-derived elements, overflow checks, and pixel-threshold screenshots.
  - Page-create smoke now creates and reopens every built-in starter page template, including about, team, careers, testimonials, product-detail, pricing, services, booking, portfolio, gallery, events, privacy, terms, cookie-policy, accessibility-statement, refund-policy, shipping-policy, cart, checkout, order-confirmation, help-center, FAQ, blog-post, newsletter, survey, member-login, and member-account templates, and verifies seeded editable elements, chrome, canvas sizing, form/data-binding metadata, editor rendering, and mobile/tablet hosted-preview rendering with pixel-threshold screenshots.
  - Page-create smoke now also verifies frontend-design template-backed pages in mobile/tablet hosted previews, including the captured template wrapper, heading, editable-region binding surface, breakpoint/scale metadata, overflow checks, and pixel-threshold screenshots.
  - Page-create smoke now also covers collection dataset list and detail page seeds, including repeater/list metadata, single-record bindings, canvas sizing, content-document hydration, and mobile/tablet hosted-preview rendering.
  - Shared starter page chrome now clones responsive overrides, shifts root responsive `y` values by the injected header offset, computes footer placement per breakpoint, and gives header/footer brand, navigation, and action blocks tablet/mobile geometry so page content and chrome stay aligned across breakpoints.
  - Landing starter pages now seed explicit tablet/mobile responsive overrides for the hero, copy, CTA, media placeholder, feature section, and stacked/tight feature cards instead of relying only on scaled desktop geometry.
  - Storefront starter pages now seed explicit tablet/mobile responsive overrides for the commerce hero, featured product card, product media/price, catalog heading, and stacked/tight catalog cards instead of relying only on scaled desktop geometry.
  - Product-detail starter pages now seed explicit tablet/mobile responsive overrides for the commerce hero, media block, purchase controls, stock label, and related-product cards instead of relying only on scaled desktop geometry; `BACKY_PAGE_CREATE_SOURCE_ONLY=1 npm run test:page-create --workspace @backy-cms/admin` guards the authored breakpoint data.
  - Pricing starter pages now seed explicit tablet/mobile responsive overrides for the pricing hero, billing toggle, stacked plan cards, comparison table, and FAQ card so commerce pricing layouts carry authored breakpoint behavior into generated pages.
  - Services starter pages now seed explicit tablet/mobile responsive overrides for service filters, stacked service cards, process steps, and the inquiry CTA so booking/service layouts are authored for narrower canvases instead of scaled from desktop.
  - Booking starter pages now seed explicit tablet/mobile responsive overrides for availability summaries, appointment cards, location filters, intake form fields, and provider handoff cards so booking flows remain editable and usable across breakpoints.
  - Portfolio starter pages now seed explicit tablet/mobile responsive overrides for featured project cards, category filters, project media cards, and inquiry CTAs so project galleries stack predictably on narrower canvases.
  - Gallery starter pages now seed explicit tablet/mobile responsive overrides for featured media, folder/type filters, upload handoff controls, asset cards, thumbnails, and lightbox/download CTAs so central media-library pages remain usable across breakpoints.
  - Events starter pages now seed explicit tablet/mobile responsive overrides for event format filters, stacked event cards, agenda steps, and RSVP CTAs so event registration pages are authored for narrower canvases instead of scaled from desktop.
  - Privacy starter pages now seed explicit tablet/mobile responsive overrides for legal metadata cards, policy sections, visitor-rights lists, and privacy request CTAs so legal pages remain readable and actionable across breakpoints.
  - Terms starter pages now seed explicit tablet/mobile responsive overrides for legal metadata cards, terms overview sections, commerce/service acceptance lists, and support contact CTAs so terms pages remain readable and actionable across breakpoints.
  - Cookie-policy starter pages now seed explicit tablet/mobile responsive overrides for consent metadata cards, cookie category sections, retention/processor lists, and preferences CTAs so consent pages remain readable and actionable across breakpoints.
  - Accessibility-statement starter pages now seed explicit tablet/mobile responsive overrides for standards metadata, support feature cards, review/remediation lists, and feedback CTAs so accessibility pages remain readable and actionable across breakpoints.
  - Refund-policy starter pages now seed explicit tablet/mobile responsive overrides for return-window metadata, refund rule cards, eligibility checklists, and return request CTAs so commerce policy pages remain readable and actionable across breakpoints.
  - Shipping-policy starter pages now seed explicit tablet/mobile responsive overrides for delivery timeline metadata, shipping method cards, tracking support lists, and order tracking CTAs so commerce delivery policy pages remain readable and actionable across breakpoints.
  - Cart starter pages now seed explicit tablet/mobile responsive overrides for cart status metadata, stacked cart item rows, quantity/remove controls, summary totals, and checkout actions so cart review flows remain usable across breakpoints.
  - Checkout starter pages now seed explicit tablet/mobile responsive overrides for provider handoff notes, customer/shipping fields, order summaries, payment actions, and raw-card-data safety notes so checkout flows remain usable and provider-safe across breakpoints.
  - Order-confirmation starter pages now seed explicit tablet/mobile responsive overrides for order status metadata, receipt totals, fulfillment cards, and post-purchase action cards so receipt flows remain readable and actionable across breakpoints.
  - Help-center starter pages now seed explicit tablet/mobile responsive overrides for support search, topic cards, FAQ rows/toggles, and escalation CTAs so support discovery flows remain readable and tappable across breakpoints.
  - FAQ starter pages now seed explicit tablet/mobile responsive overrides for FAQ search, category filters, question rows/toggles, answers, and support/contact cards so self-service answer flows remain readable and tappable across breakpoints.
  - Testimonials starter pages now seed explicit tablet/mobile responsive overrides for rating metadata, review source filters, stacked review cards, logo-wall proof, and inquiry CTAs so social-proof sections remain readable and actionable across breakpoints.
  - Blog-index starter pages now seed explicit tablet/mobile responsive overrides for publication hero content, featured post cards, latest article rows, and reading-time metadata so blog listing pages remain readable across breakpoints.
  - Blog-post starter pages now seed explicit tablet/mobile responsive overrides for article hero metadata, featured media, rich body/callout blocks, author/taxonomy sidebars, tags, and related post cards so long-form posts remain readable across breakpoints.
  - Team starter pages now seed explicit tablet/mobile responsive overrides for role filters, stacked profile cards, profile links, culture/value cards, and hiring CTAs so people pages remain readable and actionable across breakpoints.
  - Careers starter pages now seed explicit tablet/mobile responsive overrides for role filters, stacked job cards, apply buttons, benefits/process cards, and talent-pool application CTAs so recruiting pages remain readable and actionable across breakpoints.
  - About starter pages now seed explicit tablet/mobile responsive overrides for story headings, intro copy, stacked value cards, and value statements so brand story pages remain readable across breakpoints.
  - Contact starter pages now seed explicit tablet/mobile responsive overrides for intro copy, generated contact form cards, required fields, message textareas, and submit buttons so public lead-capture forms remain readable and tappable across breakpoints.
  - Newsletter starter pages now seed explicit tablet/mobile responsive overrides for publication hero content, proof cards, signup forms, consent fields, confirmation cards, and preference CTAs so opt-in flows remain readable and tappable across breakpoints.
  - Survey starter pages now seed explicit tablet/mobile responsive overrides for survey hero content, insight cards, rating/topic selectors, feedback textareas, consent fields, routing cards, and results CTAs so response flows remain readable and tappable across breakpoints.
  - Registration starter pages now seed explicit tablet/mobile responsive overrides for registration intro content, next-step notes, contact fields, member-type selectors, consent fields, and create-account CTAs so signup flows remain readable and tappable across breakpoints.
  - Member-login starter pages now seed explicit tablet/mobile responsive overrides for access hero content, registration prompts, access-link forms, email/reason fields, and request CTAs so passwordless member flows remain readable and tappable across breakpoints.
  - Member-account starter pages now seed explicit tablet/mobile responsive overrides for authenticated profile cards, preferences forms, update selectors, save CTAs, and protected resource cards so member dashboards remain readable and tappable across breakpoints.
  - Blank starter pages now seed explicit tablet/mobile responsive overrides for the default heading and intro copy so ad hoc pages begin with readable starter text across breakpoints.
  - Reusable-section create/update/delete/restore/import/instance-propagation now emits queryable admin audit logs with request-id correlation.
  - Section management operations now enforce content permissions, ownership transfer now uses the owner-only `settings.billing` permission, and `test:admin-rbac-coverage` now guards every non-auth admin API route for `requireAdminAccess` plus explicit permission-scoped access checks, with only documented self-permission/dynamic-handler exceptions.
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
