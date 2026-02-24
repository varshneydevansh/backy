# Editor V2 Specification: Hybrid Architecture & Feature Audit

## 1. The Hybrid Model: "Canvas Shell, Tiptap Core"

We are retaining the **Canvas** for Layout/Animation (Wix-like) while upgrading the **Content Internals** to Tiptap (Notion-like).

| Layer | Component | Responsibility | Technology |
|-------|-----------|----------------|------------|
| **Outer Shell** | `CanvasElement` | Position (`x,y`), Size (`w,h`), Rotation, Z-Index, **GSAP Animations** | React Draggable / Custom |
| **Inner Core** | `TiptapRenderer` | Rich Text, Markdown, Inline Images, Code Blocks, Emojis | **Tiptap** (Headless) |

---

## 2. Feature Audit & Migration Matrix

This list covers **ALL** existing features and defines their V2 implementation.

### A. Layout & Interaction (Canvas Layer)
| Feature | Current Status | V2 Strategy | Status |
|---------|----------------|-------------|--------|
| **Drag & Drop** | ✅ Working | Keep as is. Only active in "Select Mode". | ✅ Ready |
| **Resizing** | ✅ Working | Keep as is. Updates `width/height` style. | ✅ Ready |
| **Rotation** | ✅ Working | Keep as is. Updates `rotate` transform. | ✅ Ready |
| **Grid Snap** | ✅ Working | Keep as is (10px grid). | ✅ Ready |
| **Z-Index** | ✅ Working | Keep as is (Layers). | ✅ Ready |
| **Delete** | ✅ Working | Backspace/Delete key in "Select Mode". | ✅ Ready |
| **Undo/Redo** | ✅ Working | Must integrate Tiptap History with Canvas History. **(Complex)** | ⚠️ ToDo |
| **Copy/Paste** | ✅ Working | "Select Mode": Clones Element. "Edit Mode": Clones Text. | ⚠️ ToDo |

### B. Element Types (Migration Plan)

| Element Type | Current Implementation | V2 Implementation | Missing / ToDo |
|--------------|------------------------|-------------------|----------------|
| **Text / Paragraph** | `div` + `dangerouslySetInnerHTML` | **Tiptap Node**: `paragraph` | Migration Script |
| **Heading** | `h1-h6` + `dangerouslySetInnerHTML` | **Tiptap Node**: `heading` | Migration Script |
| **Image** | `img` tag | **Hybrid**: Can be a Canvas Element (Absolute) OR Tiptap Node (Inline). | **Media Picker** |
| **Video** | `video` tag | **Hybrid**: Canvas Element or Tiptap Node. | **Media Picker** |
| **Button** | `button` tag | **Canvas Element**: Independent component. | Settings Panel |
| **Icon** | Lucide Icon Wrapper | **Canvas Element**: Independent component. | **Emoji Picker** |
| **Embed/Map** | Iframe wrapper | **Canvas Element**: Independent component. | Embed Code Support |
| **List** | `ul/li` HTML string | **Tiptap Node**: `bulletList`, `orderedList`. | Markdown Shortcuts |
| **Code Block** | Raw HTML | **Tiptap Node**: `codeBlock` (with Syntax Highlighting). | PrismJS Integration |

### C. Visual Settings (Property Panel)
| Setting | Current Status | V2 Strategy |
|---------|----------------|-------------|
| **Font Family** | ✅ 15 Google Fonts | Map to Tiptap `fontFamily` extension. |
| **Colors** | ✅ Hex Codes | Map to Tiptap `textStyle` color. |
| **Alignment** | ✅ Left/Center/Right | Map to Tiptap `textAlign`. |
| **Borders/Radius** | ✅ Canvas Layer | Apply to **Shell Container**. |
| **Opacity** | ✅ Canvas Layer | Apply to **Shell Container**. |

---

## 3. Missing Essential Features (The Gap List)

These are features we **do not have** yet but are required for a "Complete" experience.

### 1. 🖼️ Media Library System
**Current**: We only have URL inputs.
**Requirement**: A global Modal to upload/select images.
**Implementation**:
-   `MediaLibraryModal.tsx`: Grid view of uploaded files. Drag & drop upload.
-   **Integration**:
    -   **Canvas**: "Replace Image" button opens this modal.
    -   **Tiptap**: `/image` command opens this modal.

### 2. 😃 Emoji Picker
**Current**: We manually type emoji chars or use OS picker.
**Requirement**: Notion-like picker (`:` to search).
**Implementation**:
-   Use `emoji-picker-react`.
-   **Integration**:
    -   **Canvas**: "Change Icon" button opens picker.
    -   **Tiptap**: `:` shortcut opens popup.

### 3. 🎬 GSAP Animation Controls
**Current**: Data structure exists, but UI is missing.
**Requirement**: "Animations" tab in Property Panel.
**Implementation**:
-   **Effects**: Fade In, Slide Up, Scale In, Bounce.
-   **Controls**: Duration slider, Delay slider, Easing dropdown.
-   **Preview**: "Play" button to trigger animation on the selected element.

---

## 4. Implementation Checklist (The Roadmap)

### Phase 1: The Core Switch (Tiptap)
- [ ] Install `@tiptap/react`, `@tiptap/starter-kit`.
- [ ] Create `components/editor/blocks/RichTextBlock.tsx`.
- [ ] Update `Canvas.tsx` to handle `Select` vs `Edit` modes.
- [ ] **Verify**: Dragging works. Double-click enters text mode. Typing works. Saving preserves JSON.

### Phase 2: The Missing UI Components
- [ ] Build `MediaLibraryModal` (Mock upload for now).
- [ ] Build `EmojiPicker` popover.
- [ ] Integrate both into `PropertyPanel`.

### Phase 3: Property Panel Upgrade
- [ ] Refactor `PropertyPanel` to read/write Tiptap Attributes (Bold/Italic/Fonts).
- [ ] Add **Animations Tab** (GSAP controls).

### Phase 4: Data Migration & Safety
- [ ] Write `migrateContent(oldHtml)` function to safe-guard existing posts.
- [ ] Ensure full backward compatibility with the Hybrid Blog routes.
