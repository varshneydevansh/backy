# Advanced Plate Editor & Font Features Spec

## 1. Advanced Plugins

We will upgrade `@backy-cms/editor` to include the following plugins:

-   **Table**: Create, resize, merge cells.
-   **Alignment**: Left, Center, Right, Justify.
-   **Line Height**: Adjustable line height.
-   **Indent**: Increase/Decrease indentation.
-   **Font Features**:
    -   **Font Family**: Dropdown with defaults + Custom input.
    -   **Font Size**: Dropdown/Input (px).
    -   **Font Color**: Text color picker.
    -   **Highlight Color**: Background color picker.
-   **Media**: Image, Video (Already mostly there, but improve UI).
-   **Dnd**: Drag and drop blocks (if possible).
-   **Autoformat**: Markdown support.

## 2. Toolbar Overhaul

The Toolbar will be reorganized into groups:
-   **History**: Undo, Redo.
-   **Format**: Bold, Italic, Underline, Strikethrough, Code, Sub/Sup.
-   **Font**: Family, Size, Color, Highlight.
-   **Block**: Align, List (Bulleted, Numbered, Todo), Indent/Outdent.
-   **Insert**: Link, Image, Video, Table, Emoji.

## 3. Font Management

### "Where do we upload fonts?"
Fonts are typically web resources (Google Fonts). We rarely "upload" font files (ttf/otf) to a media library for dynamic usage in a CMS without more complex CSS handling (`@font-face` generation).

**Strategy:**
1.  **Google Fonts**: Allow users to type *any* Google Font name. The editor attempts to load it via the Google Fonts API dynamically.
2.  **Custom Uploads (Future)**: If totally necessary, we would upload to storage, get a URL, and user adds that URL. For now, we stick to Google Fonts for simplicity and speed.

### Font Dropdown Implementation
-   Standard list: Inter, Roboto, Open Sans, etc.
-   **"Add Custom..."**: Opens a prompt (or input) to type a font name.
-   Once added, it injects a `<link>` tag into the head dynamically to load the font.

## 4. Code Structure

### `packages/editor`
-   `src/plugins/`:
    -   `createMyPlugins.ts`: Aggregated plugin factory.
-   `src/ui/`:
    -   `Toolbar/`:
        -   `FontToolbarButton.tsx`
        -   `ColorPickerToolbarButton.tsx`
        -   `TableToolbarButton.tsx`

### `apps/admin`
-   Updates `Canvas` to ensure the `RichTextBlock` (which uses `BackyEditor`) correctly propagates these styles.
