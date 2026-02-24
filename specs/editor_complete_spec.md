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
| 1 | Component Library (Left Panel) | ✅ | Drag elements to canvas |
| 2 | Canvas | ✅ | Drop zone for elements |
| 3 | Element Drag | ✅ | Move elements on canvas |
| 4 | Element Resize | ✅ | Resize via corner handles |
| 5 | Property Panel (Right Panel) | ⚠️ | Animation controls are wired, typography panel includes text transform/spacing/shadow controls; still missing full Canva-level workflow parity |
| 6 | Element Selection | ✅ | Click to select |
| 7 | Preview Mode | ✅ | Toggle to preview |
| 8 | Breakpoint Toggle | ⚠️ | Desktop/Tablet/Mobile - UI only |
| 9 | Undo/Redo Buttons | ❌ | UI exists, not functional |
| 10 | Save Button | ❌ | UI exists, not functional |
| 11 | Page Settings | ❌ | Button exists, not functional |
| 12 | Z-Index Control | ⚠️ | In PropertyPanel but no bring front/back |
| 13 | Delete Element | ❌ | No way to delete |
| 14 | Duplicate Element | ❌ | Not implemented |
| 15 | Rich Text Editing | ⚠️ | List/selected-text flow improved with list toggle/indent tools, markdown shortcut updates, and text-mark rendering fixes; full parity still pending (multi-line selection transforms, table/blockquote parity) |
| 16 | Font Selection | ✅ | Font family and size now apply from shared style props on canvas render |
| 17 | Animation Controls | ✅ | Animation panel is connected in PropertyPanel and persisted on element payloads; animation contract now uses `fadeIn/slideIn/scaleIn/rotate/bounce/custom` to match renderer payload |
| 18 | Emoji Picker | ❌ | Not implemented |
| 19 | Grid/Snap | ✅ | 10px grid snap |
| 20 | Layers Panel | ❌ | Not implemented |
| 21 | Copy/Paste | ❌ | Not implemented |
| 22 | Keyboard Shortcuts | ❌ | Not implemented |
| 23 | Markdown Shortcuts | ✅ | `#`, `-`, `*`, `1.` conversions implemented in shared editor |

## Canvas Element Parity Matrix (Current)

| Element | Property Controls | Canvas Render | Public Render | Current Gaps | Status |
|---|---|---|---|---|---|
| text | ✅ Content, color, typography, spacing | ✅ | ✅ | Inline markdown selection styling still partial; mixed selection transforms | ⚠️ |
| heading | ✅ Similar to text | ✅ | ✅ | Selection edge cases for marks | ⚠️ |
| paragraph | ✅ | ✅ | ✅ | Same text parity issues as heading | ⚠️ |
| quote | ✅ | ✅ | ⚠️ | Public and editor quote styles can diverge under custom styles | ⚠️ |
| image | ✅ source/fit/alt | ✅ | ✅ | Upload picker not always aligned with media modal when page-scoped usage is enabled | ⚠️ |
| video | ✅ source/controls | ✅ | ✅ | autoplay/loop persistence still inconsistent in public render options | ⚠️ |
| button | ✅ label/link-like styling | ✅ | ✅ | Link action config still needs action presets in property panel | ⚠️ |
| link | ✅ href/content/underline | ✅ | ✅ | Keyboard interaction semantics for target/rel | ⚠️ |
| divider | ✅ style controls | ✅ | ✅ | minor spacing parity | ⚠️ |
| spacer | ✅ layout-only | ✅ | ✅ | no visual handle difference in preview | ✅ |
| icon | ✅ symbol/size/color | ✅ | ⚠️ placeholder in public | ⚠️ |
| box/container | ✅ style/appearance | ✅ | ✅ | Not yet true child nesting | ⚠️ |
| columns | ✅ column count/gap | ✅ | ⚠️ placeholder columns | ⚠️ |
| map | ✅ address/url/zoom controls | ✅ (iframe support added) | ✅ (iframe support added) | Zoom/marker state not persisted; no geocode fallback | ⚠️ |
| embed | ✅ URL/source | ✅ (iframe support added) | ✅ (iframe support added) | Sanitization and allowlist policy not finished | ⚠️ |
| list | ✅ list type + items | ✅ | ✅ | Type resolution now prioritizes stored `listType` when present; mixed content/edge empty-item cases still need nested-depth parity | ⚠️ |
| form | ✅ title/action metadata | ⚠️ container placeholder | ⚠️ container-only placeholder | field-level schema, validation, submission UI | ❌ |
| input | ✅ placeholder/type | ✅ (public) | ✅ (public) | action wiring to form submit path | ⚠️ |

## Canvas-to-Backend/Frontend Contract

- `media` currently uses shared in-memory store state inside admin for both:
  - media library modal (`MediaLibraryModal.tsx`)
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
- 18 element types available
- Organized by categories (basic, layout, form, advanced)
- Drag-and-drop to canvas works
- **Issues:** None
- **Improvements Needed:**
    - Search/filter components
    - Favorites section
    - Component preview on hover

### 2. Canvas
**File:** `Canvas.tsx`
**Current State:** ✅ Working
- Renders all element types
- Handle drop events
- Grid background in edit mode
- **Issues:** None major
- **Improvements Needed:**
    - Zoom in/out
    - Pan/scroll navigation
    - Rulers
    - Guidelines/smart guides

### 3. Element Drag
**File:** `Canvas.tsx` (handleMouseDown, handleMouseMove, handleMouseUp)
**Current State:** ✅ Working
- Click and drag to move
- Snaps to 10px grid
- **Issues:** None
- **Improvements Needed:**
    - Multi-select (Shift-click)
    - Arrow keys nudge (1px, 10px with Shift)

### 4. Element Resize
**File:** `Canvas.tsx` (ResizeHandle, handleResizeStart)
**Current State:** ✅ Working
- Corner handles (nw, ne, sw, se)
- Minimum size 50x30
- **Issues:** None
- **Improvements Needed:**
    - Edge handles (n, s, e, w) for single-axis resize
    - Shift to maintain aspect ratio
    - Alt to resize from center

### 5. Property Panel (Right Panel)
**File:** `PropertyPanel.tsx`
**Current State:** ⚠️ Partially Working
- Shows properties for selected element
- Has Content, Layout, Style, Appearance sections
- **Issues:**
    - Rich text list/selected-text behavior still needs parity cleanup
    - No visual feedback when changes apply
    - Full list indent/empty-line parity is not complete
- **Improvements landed:**
    - Shared element style resolver now maps `fontFamily`, `lineHeight`, `textDecoration`, `fontStyle`, `padding`, `margin`, `border`, and shadow-related props consistently.
    - List controls now round-trip stable item arrays and support empty lines in property panel editing.
    - Added richer appearance controls (border style/width/color, box shadow, spacing).

### 6. Element Selection
**File:** `Canvas.tsx` (handleSelect), `pages.$pageId.edit.tsx`
**Current State:** ✅ Working
- Click to select
- Click canvas to deselect
- Selected element shows ring highlight
- **Issues:** None
- **Improvements Needed:**
    - Multi-select with Shift+click
    - Select all (Ctrl+A)
    - Tab to cycle through elements

### 7. Preview Mode
**File:** `pages.$pageId.edit.tsx` (isPreviewMode state)
**Current State:** ✅ Working
- Toggle button in toolbar
- Hides resize handles, grid
- Makes interactive elements work
- **Issues:** None

### 8. Breakpoint Toggle (Desktop/Tablet/Mobile)
**File:** `pages.$pageId.edit.tsx`
**Current State:** ⚠️ UI Only
- Buttons exist, change canvas size
- Does NOT store separate layouts per breakpoint
- **What It Should Do:**
    - Store separate element positions for each breakpoint
    - Allow hiding elements on specific breakpoints
    - Default to inheriting from larger breakpoint
- **Required Implementation:**
    ```typescript
    interface CanvasElement {
      // ... existing props
      breakpointOverrides?: {
        tablet?: { x?: number; y?: number; width?: number; height?: number; hidden?: boolean };
        mobile?: { x?: number; y?: number; width?: number; height?: number; hidden?: boolean };
      };
    }
    ```

### 9. Undo/Redo
**File:** `pages.$pageId.edit.tsx`
**Current State:** ❌ Not Functional
- Buttons exist in toolbar
- State tracking exists (historyIndex)
- No actual undo/redo logic
- **Required Implementation:**
    ```typescript
    const [history, setHistory] = useState<CanvasElement[][]>([[]]);
    const [historyIndex, setHistoryIndex] = useState(0);
    const pushHistory = (newElements: CanvasElement[]) => {
      const newHistory = history.slice(0, historyIndex + 1);
      newHistory.push(newElements);
      setHistory(newHistory);
      setHistoryIndex(newHistory.length - 1);
    };
    const undo = () => {
      if (historyIndex > 0) {
        setHistoryIndex(historyIndex - 1);
        setElements(history[historyIndex - 1]);
      }
    };
    const redo = () => {
      if (historyIndex < history.length - 1) {
        setHistoryIndex(historyIndex + 1);
        setElements(history[historyIndex + 1]);
      }
    };
    ```

### 10. Save Button
**File:** `pages.$pageId.edit.tsx`
**Current State:** ❌ Not Functional
- Button exists
- No save logic
- **Required Implementation:**
    - API call to save page
    - Convert elements to JSON
    - Store in database
    - Show success/error toast

### 11. Page Settings Button
**File:** `pages.$pageId.edit.tsx`
**Current State:** ❌ Not Functional
- Settings icon in toolbar
- No modal/dialog
- **Required Implementation:**
    - Page title editor
    - Page slug editor
    - SEO meta: title, description, keywords
    - Social sharing image
    - Canvas size configuration
    - Page status (draft/published)

### 12. Z-Index Control (Bring to Front/Back)
**File:** `PropertyPanel.tsx` (Layout section)
**Current State:** ⚠️ Partial
- Z-Index number input exists
- No quick "Bring to Front" / "Send to Back" buttons
- **Required Implementation:** Add to PropertyPanel Layout section:
    ```tsx
    <div className="flex gap-2">
      <button onClick={() => bringToFront(element.id)}>Bring to Front</button>
      <button onClick={() => sendToBack(element.id)}>Send to Back</button>
      <button onClick={() => moveUp(element.id)}>Move Up</button>
      <button onClick={() => moveDown(element.id)}>Move Down</button>
    </div>
    ```

### 13. Delete Element
**Current State:** ❌ Not Implemented
- **Required Implementation:**
    - Delete button in PropertyPanel
    - Keyboard: Delete or Backspace
    - Confirmation for complex elements
    ```typescript
    // In Canvas.tsx
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedId) {
        deleteElement(selectedId);
      }
    };
    // Delete function
    const deleteElement = (id: string) => {
      setElements(prev => prev.filter(el => el.id !== id));
      setSelectedId(null);
    };
    ```

### 14. Duplicate Element
**Current State:** ❌ Not Implemented
- **Required Implementation:**
    - Duplicate button in PropertyPanel
    - Keyboard: Ctrl+D
    - Offset duplicate by 20px
    ```typescript
    const duplicateElement = (id: string) => {
      const element = elements.find(el => el.id === id);
      if (element) {
        const duplicate = {
          ...element,
          id: generateId(),
          x: element.x + 20,
          y: element.y + 20,
        };
        setElements([...elements, duplicate]);
        setSelectedId(duplicate.id);
      }
    };
    ```

### 15. Rich Text Editing
**File:** `BackyEditor` + `RichTextFormatting.tsx` + `ActiveEditorContext.tsx`
**Current State:** ⚠️ Better than previous baseline, not complete parity
- **Implemented in this pass:**
  - Markdown shortcuts now support `+` and both `1.`/`1)` list triggers.
  - Rich-text leaf rendering now merges multiple text-decoration marks (underline + strike) instead of overwrite behavior.
  - Editor context list actions now expose:
    - Toggle same-list off by unwrapping existing list wrappers.
    - Convert selected block content into list items for list toggles.
    - Indent and outdent list entries from the right-panel formatting toolbar.
- **Remaining:**
  - Full fidelity for nested list indentation constraints and edge-case selections
    (multi-node split transforms, drag-based list reorder).
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
**Current State:** ❌ Not Implemented
- For Icon element, need an emoji picker dropdown.
- **Required Implementation:**
    - Use emoji-picker-react npm package
    - Or create simple grid of common emojis
    - Add to PropertyPanel for icon element type

### 18. Grid/Snap
**Current State:** ✅ Working
- 10px grid
- Elements snap when dragging
- **Improvements Needed:**
    - Toggle snap on/off
    - Configurable grid size
    - Show alignment guides

### 19. Layers Panel
**Current State:** ❌ Not Implemented
- **Required Implementation:**
    - New panel (collapsible) showing all elements as list
    - Drag to reorder z-index
    - Eye icon to hide/show
    - Lock icon to prevent editing
    - Click to select element

### 20. Copy/Paste
**Current State:** ❌ Not Implemented
- **Required Implementation:**
    - Ctrl+C to copy selected element(s)
    - Ctrl+V to paste
    - Ctrl+X to cut
    - Store in clipboard state

### 21. Keyboard Shortcuts
**Current State:** ⚠️ Partially implemented
**Required Shortcuts:**
| Shortcut | Action |
|---|---|
| Delete / Backspace | Delete selected |
| Ctrl+D | Duplicate |
| Ctrl+C | Copy |
| Ctrl+V | Paste |
| Ctrl+Z | Undo |
| Ctrl+Shift+Z | Redo |
| Ctrl+S | Save |
| Arrow keys | Nudge 1px |
| Shift+Arrow | Nudge 10px |
| Escape | Deselect |
| Ctrl+A | Select all |

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
**Last Updated:** 2026-02-23

**Current development stance:** This document is now the canonical execution contract for canvas parity work. Any change must be recorded here before moving to the next implementation pass.

### ✅ Completed in this pass
- Added shared markdown-like block conversions in `BackyEditor`.
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
- Verify custom font and inline-style application in selected-text flows for text blocks (especially legacy list/content transitions).
- Improve status label resilience when status values are empty/null on media/user/blog tables.
- Finalize media scope model and API contract (global vs page/blog-scoped assets).
- Finish blog post editor flow via dedicated template-backed page.
- Ensure list property parity for box/container section:
  - list items with empty lines preserve structure after transforms
  - mixed selections do not reset list type unexpectedly
  - indentation stays stable and clamps at non-negative levels

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
- ❌ Delete element
- ❌ Save page to database
- ❌ Load existing page on edit
- ❌ Undo/Redo functionality
- ⚠️ Fix RichTextEditor reset
- ⚠️ Finalize selected-text style persistence (font family/decoration on partially selected ranges)

**Important (Should Have)**
- ❌ Page Settings modal
- ❌ Duplicate element
- ❌ Z-Index quick controls (bring front/back)
- ❌ Keyboard shortcuts
- ❌ Emoji picker for icons
- ❌ Layers panel

**Nice to Have**
- ❌ Multi-select elements
- ❌ Copy/Paste
- ❌ Alignment guides
- ❌ Zoom controls
- ❌ Responsive breakpoint editing
- ❌ Media upload modal
- ❌ Element locking
- ❌ Page templates

## Priority Order
**Phase 1: Critical Fixes (Immediate)**
- Fix RichTextEditor reset issue
- Finalize selected-text style persistence in rich text
- Add delete element functionality
- Implement undo/redo

**Phase 2: Core Functionality**
- Save page to database
- Load existing page
- Page Settings modal
- Z-Index quick controls
- Duplicate element

**Phase 3: Usability**
- Keyboard shortcuts
- Emoji picker
- Layers panel
- Multi-select

**Phase 4: Polish**
- Copy/Paste
- Alignment guides
- Responsive breakpoints
- Media upload

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
