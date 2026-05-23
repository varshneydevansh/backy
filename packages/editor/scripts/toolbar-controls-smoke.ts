import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const read = (relativePath: string) => fs.readFileSync(
  fileURLToPath(new URL(relativePath, import.meta.url)),
  'utf8',
);

const assert = (condition: unknown, message: string) => {
  if (!condition) {
    throw new Error(message);
  }
};

const advancedToolbar = read('../src/ui/AdvancedToolbar.tsx');
const fixedToolbar = read('../src/ui/FixedToolbar.tsx');
const floatingToolbar = read('../src/ui/FloatingToolbar.tsx');
const portalToolbar = read('../src/ui/PortalToolbar.tsx');
const fontDropdown = read('../src/ui/FontDropdown.tsx');
const toolbarSources = [
  ['AdvancedToolbar', advancedToolbar],
  ['FixedToolbar', fixedToolbar],
  ['FloatingToolbar', floatingToolbar],
  ['PortalToolbar', portalToolbar],
  ['FontDropdown', fontDropdown],
] as const;

assert(
  advancedToolbar.includes("import { ColorPicker } from './ColorPicker';") &&
    fixedToolbar.includes("import { ColorPicker } from './ColorPicker';") &&
    floatingToolbar.includes("import { ColorPicker } from './ColorPicker';") &&
    portalToolbar.includes("import { ColorPicker } from './ColorPicker';") &&
    advancedToolbar.includes('testId="backy-editor-advanced-text-color"') &&
    advancedToolbar.includes('testId="backy-editor-advanced-highlight-color"') &&
    fixedToolbar.includes('testId="backy-editor-fixed-text-color"') &&
    fixedToolbar.includes('testId="backy-editor-fixed-highlight-color"') &&
    floatingToolbar.includes('testId="backy-editor-floating-text-color"') &&
    floatingToolbar.includes('testId="backy-editor-floating-highlight-color"') &&
    portalToolbar.includes('testId="backy-editor-portal-text-color"') &&
    portalToolbar.includes('testId="backy-editor-portal-highlight-color"'),
  'Advanced, fixed, floating, and portal toolbars must use the shared ColorPicker for text and highlight colors.',
);

assert(
  advancedToolbar.includes("Editor.removeMark(editor, format)") &&
    advancedToolbar.includes("Editor.addMark(editor, format, nextValue)") &&
    advancedToolbar.includes("markValue(editor, 'color')") &&
    advancedToolbar.includes("markValue(editor, 'backgroundColor')") &&
    fixedToolbar.includes("Editor.removeMark(editor, format)") &&
    fixedToolbar.includes("Editor.addMark(editor, format, nextValue)") &&
    fixedToolbar.includes("markValue(editor, 'color')") &&
    fixedToolbar.includes("markValue(editor, 'backgroundColor')") &&
    floatingToolbar.includes("Editor.removeMark(editor, format)") &&
    floatingToolbar.includes("Editor.addMark(editor, format, nextValue)") &&
    floatingToolbar.includes("markValue(editor, 'color')") &&
    floatingToolbar.includes("markValue(editor, 'backgroundColor')") &&
    portalToolbar.includes("Editor.removeMark(editor, format)") &&
    portalToolbar.includes("Editor.addMark(editor, format, nextValue)") &&
    portalToolbar.includes("markValue(editor, 'color')") &&
    portalToolbar.includes("markValue(editor, 'backgroundColor')"),
  'Advanced, fixed, floating, and portal toolbar color controls must support persisted set and clear mark behavior.',
);

assert(
  !advancedToolbar.includes("window.prompt('Text color:") &&
    !advancedToolbar.includes("window.prompt('Highlight:"),
  'Advanced toolbar color controls must not use browser prompt dialogs.',
);

for (const [name, source] of toolbarSources) {
  assert(
    !source.includes('window.prompt') && !source.includes('prompt('),
    `${name} must not use browser prompt dialogs for toolbar controls.`,
  );
}

assert(
  !portalToolbar.includes('const ColorPicker = ({') &&
    !portalToolbar.includes('isOpen={showTextColor}') &&
    !portalToolbar.includes('setShowTextColor') &&
    !portalToolbar.includes('setShowHighlight'),
  'Portal toolbar must not keep a separate reduced color picker implementation.',
);

assert(
  advancedToolbar.includes('aria-label={title}') &&
    fixedToolbar.includes('aria-label={tooltip}') &&
    floatingToolbar.includes('aria-label={label}') &&
    portalToolbar.includes('aria-label={title}') &&
    advancedToolbar.includes('aria-haspopup="menu"') &&
    advancedToolbar.includes('aria-expanded={open}'),
  'Rich-text toolbar icon and menu buttons must expose accessible labels/states.',
);

assert(
  advancedToolbar.includes('data-testid={`backy-editor-advanced-${insertMode}-form`}') &&
    fixedToolbar.includes('data-testid={`backy-editor-fixed-${insertMode}-form`}') &&
    floatingToolbar.includes('data-testid="backy-editor-floating-link-form"') &&
    portalToolbar.includes('data-testid={`backy-editor-portal-${insertMode}-form`}'),
  'Shared editor toolbars must expose testable inline URL controls for links and images.',
);

assert(
  advancedToolbar.includes('savedSelectionRef.current = editor.selection ? { ...editor.selection } : null') &&
    fixedToolbar.includes('savedSelectionRef.current = editor.selection ? { ...editor.selection } : null') &&
    floatingToolbar.includes('const captureSelection = () =>') &&
    floatingToolbar.includes('savedSelectionRef.current = editor.selection && Range.isRange(editor.selection) ? { ...editor.selection } : null') &&
    portalToolbar.includes('savedSelectionRef.current = editor?.selection && Range.isRange(editor.selection) ? { ...editor.selection } : null'),
  'Shared editor URL controls must preserve the active Slate selection before focusing URL fields.',
);

const colorPicker = read('../src/ui/ColorPicker.tsx');

assert(
  colorPicker.includes('aria-label={triggerLabel}') &&
    colorPicker.includes('aria-haspopup="dialog"') &&
    colorPicker.includes('aria-expanded={open}') &&
    colorPicker.includes('role="dialog"') &&
    colorPicker.includes('onBeforeOpen?: () => void') &&
    colorPicker.includes('onBeforeOpen?.();') &&
    colorPicker.includes('data-testid={testId ? `${testId}-popover` : undefined}') &&
    colorPicker.includes('data-testid={testId ? `${testId}-custom-text` : undefined}') &&
    colorPicker.includes('data-testid={testId ? `${testId}-clear` : undefined}'),
  'Shared ColorPicker must expose accessible, testable trigger, dialog, custom hex, and clear controls.',
);

assert(
  fontDropdown.includes('data-testid="backy-editor-font-custom-form"') &&
    fontDropdown.includes('data-testid="backy-editor-font-custom-input"') &&
    fontDropdown.includes('data-testid="backy-editor-font-custom-submit"') &&
    fontDropdown.includes('data-testid="backy-editor-font-custom-cancel"'),
  'Font dropdown must expose testable inline controls for custom font entry.',
);

assert(
  fontDropdown.includes('setCustomFontError(`Could not load "${trimmed}". Check the Google Font name.`)') &&
    fontDropdown.includes('setCustomFonts(prev => prev.includes(trimmed) ? prev : [...prev, trimmed])') &&
    !fontDropdown.includes('alert('),
  'Font dropdown custom font entry must use inline error state and avoid duplicate custom font storage.',
);

console.log(JSON.stringify({
  ok: true,
  contract: 'backy.editor.toolbar-controls.v1',
}, null, 2));
