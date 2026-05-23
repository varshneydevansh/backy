import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const packagePath = path.resolve(__dirname, '../package.json');
const smokePath = path.resolve(__dirname, 'editor-drag-smoke.mjs');
const canvasEditorPath = path.resolve(__dirname, '../src/components/editor/CanvasEditor.tsx');
const editorCatalogPath = path.resolve(__dirname, '../src/components/editor/editorCatalog.ts');
const pageEditorRoutePath = path.resolve(__dirname, '../src/routes/pages.$pageId.edit.tsx');
const activeEditorContextPath = path.resolve(__dirname, '../src/components/editor/ActiveEditorContext.tsx');
const propertyPanelPath = path.resolve(__dirname, '../src/components/editor/PropertyPanel.tsx');
const richTextFormattingPath = path.resolve(__dirname, '../src/components/editor/RichTextFormatting.tsx');
const richTextListTransformsPath = path.resolve(__dirname, '../src/components/editor/richTextListTransforms.ts');
const pageSettingsModalPath = path.resolve(__dirname, '../src/components/editor/PageSettingsModal.tsx');
const fontCatalogPath = path.resolve(__dirname, '../src/components/editor/fontCatalog.ts');
const editorPackageIndexPath = path.resolve(__dirname, '../../../packages/editor/src/index.tsx');
const publicInteractiveRegistryPath = path.resolve(__dirname, '../../../apps/public/src/lib/interactiveComponentRegistry.ts');
const pageRendererPath = path.resolve(__dirname, '../../../apps/public/src/components/PageRenderer.tsx');

const packageJson = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
const smokeSource = fs.readFileSync(smokePath, 'utf8');
const canvasEditorSource = fs.readFileSync(canvasEditorPath, 'utf8');
const editorCatalogSource = fs.readFileSync(editorCatalogPath, 'utf8');
const pageEditorRouteSource = fs.readFileSync(pageEditorRoutePath, 'utf8');
const activeEditorContextSource = fs.readFileSync(activeEditorContextPath, 'utf8');
const propertyPanelSource = fs.readFileSync(propertyPanelPath, 'utf8');
const richTextFormattingSource = fs.readFileSync(richTextFormattingPath, 'utf8');
const richTextListTransformsSource = fs.readFileSync(richTextListTransformsPath, 'utf8');
const pageSettingsModalSource = fs.readFileSync(pageSettingsModalPath, 'utf8');
const fontCatalogSource = fs.readFileSync(fontCatalogPath, 'utf8');
const editorPackageIndexSource = fs.readFileSync(editorPackageIndexPath, 'utf8');
const publicInteractiveRegistrySource = fs.readFileSync(publicInteractiveRegistryPath, 'utf8');
const pageRendererSource = fs.readFileSync(pageRendererPath, 'utf8');
const editorScripts = Object.entries(packageJson.scripts ?? {})
  .filter(([name]) => name.startsWith('test:editor'))
  .map(([name, command]) => ({ name, command }));

const ignoredEnvNames = new Set([
  'BACKY_EDITOR_SMOKE_SITE_ID',
  'BACKY_EDITOR_SMOKE_PATH',
]);

const envNames = [...new Set([...smokeSource.matchAll(/process\.env\.(BACKY_EDITOR_[A-Z0-9_]+_SMOKE)/g)]
  .map((match) => match[1]))]
  .filter((name) => !ignoredEnvNames.has(name))
  .sort();

const commandText = editorScripts.map(({ command }) => command).join('\n');
const missingEnvScripts = envNames.filter((name) => !commandText.includes(name));

const componentHandlerBlock = smokeSource.match(/const componentSmokeHandlers = \{([\s\S]*?)\n    \};\n    const componentSmoke =/);
const componentHandlerNames = componentHandlerBlock
  ? [...componentHandlerBlock[1].matchAll(/^\s{6}['"]?([a-z0-9-]+)['"]?: \{/gm)].map((match) => match[1]).sort()
  : [];
const componentScript = packageJson.scripts?.['test:editor-components'] ?? '';
const componentScriptNames = [...componentScript.matchAll(/BACKY_EDITOR_COMPONENT_SMOKE=\$component|for component in ([^;]+);/g)]
  .flatMap((match) => (match[1] ? match[1].trim().split(/\s+/) : []))
  .sort();
const missingComponentScripts = componentHandlerNames.filter((name) => !componentScriptNames.includes(name));

const workflowExclusions = new Set([
  'test:editor-drag',
  'test:editor-save-publish',
  'test:editor-workflows',
]);
const collectReachableScripts = (scriptName, reachable = new Set()) => {
  if (reachable.has(scriptName)) {
    return reachable;
  }

  reachable.add(scriptName);
  const command = packageJson.scripts?.[scriptName] ?? '';
  for (const match of command.matchAll(/npm run (test:editor[-:a-z0-9]+)/g)) {
    collectReachableScripts(match[1], reachable);
  }

  return reachable;
};

const workflowReachableScripts = collectReachableScripts('test:editor-workflows');
const missingWorkflowScripts = editorScripts
  .map(({ name }) => name)
  .filter((name) => !workflowExclusions.has(name))
  .filter((name) => !workflowReachableScripts.has(name));

const collectMissingSnippets = (source, snippets) => snippets.filter((snippet) => !source.includes(snippet));
const countOccurrences = (source, snippet) => source.split(snippet).length - 1;

const missingTableRangeSourceSnippets = collectMissingSnippets(activeEditorContextSource, [
  'const getSelectedTableCellPaths = useCallback',
  'const buildTableCellGrid = useCallback',
  'maxColumnCount',
  'const anchorCellPath = readCellPathAtPoint(selection.anchor) || context.cellPath;',
  'const focusCellPath = readCellPathAtPoint(selection.focus) || context.cellPath;',
  'if (!isSamePath(anchorTablePath, focusTablePath) || !isSamePath(anchorTablePath, context.tablePath)) {',
  'return [context.cellPath];',
  'const minRowIndex = Math.min',
  'const maxRowIndex = Math.max',
  'const minCellIndex = Math.min',
  'const maxCellIndex = Math.max',
  'for (let rowIndex = minRowIndex; rowIndex <= maxRowIndex; rowIndex += 1) {',
  'for (let cellIndex = minCellIndex; cellIndex <= maxCellIndex; cellIndex += 1) {',
  'cellPaths.push([...context.tablePath, rowIndex, cellIndex]);',
  'return cellPaths.length > 0 ? cellPaths : [context.cellPath];',
  'const insertVisualRowIndex = context.rowIndex + 1;',
  'const expandedRowSpanOrigins = new Set<string>();',
  'const coveredColumns = new Set<number>();',
  'const insertVisualColumnIndex = selectedEntry ? selectedEntry.columnEnd + 1 : context.cellIndex + 1;',
  'const duplicateVisualColumnIndex = selectedEntry ? selectedEntry.columnStart : context.cellIndex;',
  'const removeVisualColumnIndex = selectedEntry ? selectedEntry.columnStart : context.cellIndex;',
  'const sourceVisualColumnIndex = selectedEntry ? selectedEntry.columnStart : context.cellIndex;',
  'const targetVisualColumnIndex = sourceVisualColumnIndex + direction;',
  'const expandedSpanOrigins = new Set<string>();',
  'const handledOrigins = new Set<string>();',
  'const adjustedRowSpanOrigins = new Set<string>();',
  'const rowOwnsSpanningCells = tableGrid.entries.some',
  'const tableHasRowSpanningCells = tableGrid.entries.some((entry) => entry.rowSpan > 1);',
  'const tableHasSpanningCells = tableGrid.entries.some((entry) => entry.colSpan > 1 || entry.rowSpan > 1);',
  'const headerVisualColumnIndex = selectedEntry ? selectedEntry.columnStart : context.cellIndex;',
  'const uniqueColumnEntries = columnEntries.filter',
  'entry.columnStart <= headerVisualColumnIndex',
  'const currentEntry = tableGrid.entries.find((entry) => isSamePath(entry.path, context.cellPath));',
  'entry.columnStart === currentEntry.columnEnd + 1',
  'entry.rowStart === currentEntry.rowEnd + 1',
  'const targetRowEntries = tableGrid.entries.filter((entry) => entry.rowStart === targetRowIndex);',
  'const nextEntry = targetRowEntries.find((entry) => entry.columnStart >= currentEntry.columnStart);',
  'Transforms.setNodes(editor as any, { colSpan:',
  'Transforms.setNodes(editor as any, { rowSpan:',
  "Transforms.unsetNodes(editor as any, 'rowSpan'",
  '__backySelectActiveEditorTableCellRange',
]);
const missingTableRangeSmokeSnippets = collectMissingSnippets(smokeSource, [
  '__backySelectActiveEditorTableCellRange',
  'selectedMergedRangeBeforeStyle',
  'mergedRangeStyleState',
  'selectedMultiCellFillRange',
  'tableMultiCellStyleState',
  'multiCellValueOneCell',
  'multiCellValueTwoCell',
  'Persisted multi-cell table fill missing',
  'Persisted multi-cell table border color missing',
  'Persisted multi-cell table vertical alignment missing',
]);
const missingResponsiveSmokeSnippets = collectMissingSnippets(smokeSource, [
  'const waitForEditorBreakpoint = async (client, breakpoint) => {',
  "await waitForEditorBreakpoint(client, 'desktop');",
  'await waitForEditorBreakpoint(client, breakpoint);',
  "await clickButtonByAriaLabel(client, 'Desktop canvas');",
  'await clickButtonByAriaLabel(client, breakpointCanvasLabel);',
  "columnsMobile: await assertResponsiveBreakpointEditing(client, tempPageId, 'smoke-columns'",
  "columnsTablet: await assertResponsiveBreakpointEditing(client, tempPageId, 'smoke-columns'",
  "videoMobile: await assertResponsiveBreakpointEditing(client, tempPageId, 'smoke-video'",
  "iconMobile: await assertResponsiveBreakpointEditing(client, tempPageId, 'smoke-icon'",
  "navMobile: await assertResponsiveBreakpointEditing(client, tempPageId, 'smoke-nav'",
  "formMobile: await assertResponsiveBreakpointEditing(client, tempPageId, 'smoke-form'",
  "commentMobile: await assertResponsiveBreakpointEditing(client, tempPageId, 'smoke-comment'",
  "repeaterMobile: await assertResponsiveBreakpointEditing(client, tempPageId, 'smoke-repeater'",
  "embedMobile: await assertResponsiveBreakpointEditing(client, tempPageId, 'smoke-embed'",
  "mapMobile: await assertResponsiveBreakpointEditing(client, tempPageId, 'smoke-map'",
  "interactiveMobile: await assertResponsiveBreakpointEditing(client, tempPageId, 'smoke-interactive'",
  "codeComponentMobile: await assertResponsiveBreakpointEditing(client, tempPageId, 'smoke-code-component'",
  "childButtonMobile: await assertResponsiveBreakpointEditing(client, tempPageId, 'smoke-child-button'",
  "nestedBoxMobile: await assertResponsiveBreakpointEditing(client, tempPageId, 'smoke-nested-box'",
  "grandchildButtonMobile: await assertResponsiveBreakpointEditing(client, tempPageId, 'smoke-grandchild-button'",
  "checkboxMobile: await assertResponsiveBreakpointEditing(client, tempPageId, 'smoke-checkbox'",
  "selectMobile: await assertResponsiveBreakpointEditing(client, tempPageId, 'smoke-select'",
  "radioMobile: await assertResponsiveBreakpointEditing(client, tempPageId, 'smoke-radio'",
  "'smoke-video',",
  "'smoke-icon',",
  "'smoke-comment',",
  "'smoke-repeater',",
  "'smoke-map',",
  "'smoke-interactive',",
  "'smoke-code-component',",
  "'smoke-child-button',",
  "'smoke-nested-box',",
  "'smoke-grandchild-button',",
  "'smoke-select',",
  "'smoke-checkbox',",
  "'smoke-radio',",
  'reloadedResponsiveEditing.columnsMobile.breakpointAfter.x === responsiveEditing.columnsMobile.breakpointAfter.x',
  'reloadedResponsiveEditing.columnsTablet.breakpointAfter.width === responsiveEditing.columnsTablet.breakpointAfter.width',
  'reloadedResponsiveEditing.videoMobile.breakpointAfter.x === responsiveEditing.videoMobile.breakpointAfter.x',
  'reloadedResponsiveEditing.iconMobile.breakpointAfter.x === responsiveEditing.iconMobile.breakpointAfter.x',
  'reloadedResponsiveEditing.navMobile.breakpointAfter.x === responsiveEditing.navMobile.breakpointAfter.x',
  'reloadedResponsiveEditing.formMobile.breakpointAfter.x === responsiveEditing.formMobile.breakpointAfter.x',
  'reloadedResponsiveEditing.commentMobile.breakpointAfter.x === responsiveEditing.commentMobile.breakpointAfter.x',
  'reloadedResponsiveEditing.repeaterMobile.breakpointAfter.x === responsiveEditing.repeaterMobile.breakpointAfter.x',
  'reloadedResponsiveEditing.embedMobile.breakpointAfter.x === responsiveEditing.embedMobile.breakpointAfter.x',
  'reloadedResponsiveEditing.mapMobile.breakpointAfter.x === responsiveEditing.mapMobile.breakpointAfter.x',
  'reloadedResponsiveEditing.interactiveMobile.breakpointAfter.x === responsiveEditing.interactiveMobile.breakpointAfter.x',
  'reloadedResponsiveEditing.codeComponentMobile.breakpointAfter.x === responsiveEditing.codeComponentMobile.breakpointAfter.x',
  'reloadedResponsiveEditing.childButtonMobile.breakpointAfter.x === responsiveEditing.childButtonMobile.breakpointAfter.x',
  'reloadedResponsiveEditing.nestedBoxMobile.breakpointAfter.x === responsiveEditing.nestedBoxMobile.breakpointAfter.x',
  'reloadedResponsiveEditing.grandchildButtonMobile.breakpointAfter.x === responsiveEditing.grandchildButtonMobile.breakpointAfter.x',
  'reloadedResponsiveEditing.checkboxMobile.breakpointAfter.x === responsiveEditing.checkboxMobile.breakpointAfter.x',
  'reloadedResponsiveEditing.selectMobile.breakpointAfter.x === responsiveEditing.selectMobile.breakpointAfter.x',
  'reloadedResponsiveEditing.radioMobile.breakpointAfter.x === responsiveEditing.radioMobile.breakpointAfter.x',
  "key: 'columnsMobile'",
  "label: 'Public mobile columns responsive geometry'",
  "key: 'columnsTablet'",
  "label: 'Public tablet columns responsive geometry'",
  "key: 'videoMobile'",
  "label: 'Public mobile video responsive geometry'",
  "key: 'iconMobile'",
  "label: 'Public mobile icon responsive geometry'",
  "key: 'navMobile'",
  "label: 'Public mobile nav responsive geometry'",
  "key: 'formMobile'",
  "label: 'Public mobile form responsive geometry'",
  "key: 'commentMobile'",
  "label: 'Public mobile comment responsive geometry'",
  "key: 'repeaterMobile'",
  "label: 'Public mobile repeater responsive geometry'",
  "key: 'embedMobile'",
  "label: 'Public mobile embed responsive geometry'",
  "key: 'mapMobile'",
  "label: 'Public mobile map responsive geometry'",
  "key: 'interactiveMobile'",
  "label: 'Public mobile interactive responsive geometry'",
  "key: 'codeComponentMobile'",
  "label: 'Public mobile code component responsive geometry'",
  "key: 'childButtonMobile'",
  "label: 'Public mobile nested button responsive geometry'",
  "key: 'nestedBoxMobile'",
  "label: 'Public mobile nested box responsive geometry'",
  "key: 'grandchildButtonMobile'",
  "label: 'Public mobile grandchild button responsive geometry'",
  "key: 'checkboxMobile'",
  "label: 'Public mobile checkbox responsive geometry'",
  "key: 'selectMobile'",
  "label: 'Public mobile select responsive geometry'",
  "key: 'radioMobile'",
  "label: 'Public mobile radio responsive geometry'",
]);
const missingResponsiveGroupingSourceSnippets = collectMissingSnippets(canvasEditorSource, [
  "const EDITOR_RESPONSIVE_BREAKPOINTS = ['tablet', 'mobile']",
  'const buildResponsiveGroupChildren = (',
  'responsiveGeometryForElement(item, breakpoint)',
  'override.x = geometry.x - (bounds?.x ?? groupBase.x);',
  '...(responsiveGroup.responsive ? { responsive: responsiveGroup.responsive } : {})',
]);
const missingSavedCanvasParentScopeSnippets = collectMissingSnippets(editorCatalogSource, [
  'function normalizeSavedCanvasElements(input: unknown, parentId?: string): CanvasElement[]',
  'typeof metadata.parentId === \'string\'',
  'const resolvedParentId = parentId || rawParentId;',
  'normalizeSavedCanvasElements(rawElement.children, id)',
  '...(resolvedParentId ? { parentId: resolvedParentId } : {})',
]);
const missingDistributionSourceSnippets = collectMissingSnippets(canvasEditorSource, [
  'const normalizeDistributedPosition = (value: number): number =>',
  'const nextPosition = normalizeDistributedPosition(nextCenter - sizeForAxis / 2);',
]).concat(
  canvasEditorSource.includes('const nextPosition = snapEditorValue(nextCenter - sizeForAxis / 2);')
    ? ['distribution still snaps each layer position to grid']
    : [],
);
const missingEditorCommandRegistrySnippets = collectMissingSnippets(canvasEditorSource, [
  "type EditorCommandRegistryItem",
  "type EditorCommandRegistry =",
  "schemaVersion: 'backy.editor-command-registry.v1'",
  'const editorCommandRegistry = useMemo<EditorCommandRegistry>',
  "id: 'group-selection'",
  "id: 'ungroup-selection'",
  "id: 'paste-selection'",
  "id: 'toggle-grid'",
  "id: 'save-page'",
  "testId: 'editor-group-selection'",
  "testId: 'editor-ungroup-selection'",
  "commandRegistry: editorCommandRegistry",
  "copyEditorCommandRegistry",
  'data-testid="editor-command-registry"',
  'data-testid="editor-copy-command-registry"',
  'data-command-ids={editorCompositionReadiness.commandRegistry.commands.map((command) => command.id).join(\' \')}',
]);
const missingStressSmokeSnippets = collectMissingSnippets(smokeSource, [
  'const STRESS_SMOKE = process.env.BACKY_EDITOR_STRESS_SMOKE === \'1\';',
  'const parsedStressIterations = Number(process.env.BACKY_EDITOR_STRESS_ITERATIONS || 10);',
  'const STRESS_ITERATIONS = Math.max(4, Math.min(Number.isFinite(parsedStressIterations) ? parsedStressIterations : 10, 40));',
  'const readEditorRuntimeHealth = async (client, label = \'editor runtime health\') => {',
  'const testLongSessionEditorStress = async (client, pageId, editorPath) => {',
  'for (let iteration = 0; iteration < STRESS_ITERATIONS; iteration += 1) {',
  'await assertResponsiveBreakpointEditing(client, pageId, \'smoke-box\'',
  'assertElementState(reloadedState, finalState, \'long-session stress reload\');',
  'mode: \'stress\'',
]);
const missingLayerUndoRedoSmokeSnippets = collectMissingSnippets(smokeSource, [
  'const testUndoRedoAfterLayerVisibilityToggle = async (client, elementId) => {',
  'const layerVisibilityUndoRedo = await testUndoRedoAfterLayerVisibilityToggle(client, \'smoke-form\');',
  'layerVisibilityUndoRedo,',
  'layer visibility Ctrl+Z mismatch',
  'layer visibility Ctrl+Shift+Z mismatch',
]);
const stressScript = packageJson.scripts?.['test:editor-stress'] ?? '';
const stressWorkflow = packageJson.scripts?.['test:editor-workflows'] ?? '';
const missingStressScriptGuards = [
  stressScript.includes('BACKY_EDITOR_STRESS_SMOKE=1') ? '' : 'test:editor-stress must set BACKY_EDITOR_STRESS_SMOKE=1',
  stressWorkflow.includes('test:editor-stress') ? '' : 'test:editor-workflows must include test:editor-stress',
].filter(Boolean);
const missingEditorMfaLoginSnippets = collectMissingSnippets(smokeSource, [
  'const login = (twoFactorCode) => fetch',
  'BACKY_EDITOR_SMOKE_MFA_CODE',
  'BACKY_ADMIN_MFA_CODE',
  'BACKY_ADMIN_2FA_CODE',
  "payload.error?.code === 'MFA_REQUIRED'",
  'response = await login(smokeMfaCode);',
  'const seedBrowserSessionCookie = async (client) => {',
  "name: 'backy_admin_session'",
  'await seedBrowserSessionCookie(client);',
]);
const tableCellPathReaderCount = countOccurrences(activeEditorContextSource, 'const cellPaths = getSelectedTableCellPaths(editor);');
const tableCellPathLoopCount = countOccurrences(activeEditorContextSource, 'for (const cellPath of cellPaths) {');
const missingTableStyleSetterGuards = [
  tableCellPathReaderCount < 3 ? `expected at least 3 table style cell-path reader calls, found ${tableCellPathReaderCount}` : '',
  tableCellPathLoopCount < 3 ? `expected at least 3 table style cell-path loops, found ${tableCellPathLoopCount}` : '',
].filter(Boolean);
const missingListIndentNormalizationGuards = [
  ...collectMissingSnippets(richTextListTransformsSource, [
    'export const normalizeRichTextListIndent',
    'const currentIndent = normalizeRichTextListIndent(nextNode) ?? 0;',
  ]).map((snippet) => `richTextListTransforms.ts missing ${snippet}`),
  ...collectMissingSnippets(activeEditorContextSource, [
    'normalizeRichTextListIndent, RICH_TEXT_LIST_MAX_INDENT',
    'const currentIndent = normalizeRichTextListIndent(node) ?? 0;',
  ]).map((snippet) => `ActiveEditorContext.tsx missing ${snippet}`),
  ...collectMissingSnippets(richTextFormattingSource, [
    'normalizeRichTextListIndent,',
    'const currentIndent = normalizeRichTextListIndent(nextNode) ?? 0;',
  ]).map((snippet) => `RichTextFormatting.tsx missing ${snippet}`),
  ...collectMissingSnippets(editorPackageIndexSource, [
    'const currentIndent = normalizeRichTextListIndent(node) ?? 0;',
    'const currentIndent = normalizeRichTextListIndent(selectedListItems[0][0]) ?? 0;',
  ]).map((snippet) => `packages/editor/src/index.tsx missing ${snippet}`),
  ...collectMissingSnippets(smokeSource, [
    'Persisted selected list item indent clamp missing',
  ]).map((snippet) => `editor-drag-smoke.mjs missing ${snippet}`),
].filter(Boolean);
const propertyPanelTypecheckGuards = [
  propertyPanelSource.includes('@ts-nocheck') ? 'PropertyPanel.tsx must stay under TypeScript checking' : '',
  propertyPanelSource.includes('TODO: Fix prop type access') ? 'PropertyPanel.tsx must not carry the old prop typing TODO' : '',
].filter(Boolean);
const missingInteractiveControlNormalizationSnippets = [
  ...collectMissingSnippets(propertyPanelSource, [
    'type InteractiveControlOption',
    'rawValue: unknown',
    'const getInteractiveControlOptionValue = (',
    'const normalizeInteractiveControlValue = (',
    'const normalizedValue = control ? normalizeInteractiveControlValue(control, value) : value;',
    '[controlKey]: normalizedValue',
    "'select', 'radio'",
    "'textarea', 'json', 'code'",
    'formatInteractiveJsonControlValue(rawValue)',
    'normalizeInteractiveJsonControlValue(e.target.value)',
    'data-testid={`editor-interactive-control-radio-${controlKey}`}',
  ]).map((snippet) => `PropertyPanel.tsx missing ${snippet}`),
  ...collectMissingSnippets(editorCatalogSource, [
    "key: 'accentColor'",
    "type: 'color'",
    "key: 'caption'",
    "type: 'textarea'",
    "key: 'runtimeConfig'",
    "type: 'json'",
  ]).map((snippet) => `editorCatalog.ts missing ${snippet}`),
  ...collectMissingSnippets(publicInteractiveRegistrySource, [
    "key: 'accentColor'",
    "type: 'color'",
    "key: 'caption'",
    "type: 'textarea'",
    "key: 'runtimeConfig'",
    "type: 'json'",
  ]).map((snippet) => `interactiveComponentRegistry.ts missing ${snippet}`),
].filter(Boolean);
const missingFormAppearanceControlSnippets = [
  ...collectMissingSnippets(propertyPanelSource, [
    'testId="editor-form-field-background-color"',
    'testId="editor-form-field-border-color"',
    'testId="editor-form-field-border-radius"',
    'testId="editor-form-submit-background-color"',
    'testId="editor-form-submit-color"',
    'testId="editor-form-submit-border-radius"',
    'onChange={(value) => onChange({ fieldBackgroundColor: value })}',
    'onChange={(value) => onChange({ submitBackgroundColor: value })}',
  ]).map((snippet) => `PropertyPanel.tsx missing ${snippet}`),
  ...collectMissingSnippets(pageRendererSource, [
    'props.fieldBackgroundColor',
    'props.fieldBorderColor',
    'props.fieldBorderRadius ?? props.borderRadius',
    'props.submitBackgroundColor',
    'props.submitColor',
    'props.submitBorderRadius || props.borderRadius',
  ]).map((snippet) => `PageRenderer.tsx missing ${snippet}`),
  ...collectMissingSnippets(smokeSource, [
    'const FORM_APPEARANCE_SPEC = {',
    'editor-form-field-background-color',
    'Form appearance preview mismatch',
    'Persisted form appearance mismatch',
  ]).map((snippet) => `editor-drag-smoke.mjs missing ${snippet}`),
].filter(Boolean);
const missingPageSettingsValidationSnippets = [
  ...collectMissingSnippets(pageSettingsModalSource, [
    'const [settingsSubmitted, setSettingsSubmitted] = useState(false);',
    'const [jsonLdInlineError, setJsonLdInlineError] = useState<string | null>(null);',
    'setSettingsSubmitted(true);',
    'aria-invalid={Boolean(titleInlineError)}',
    "aria-describedby={titleInlineError ? 'page-settings-title-error' : undefined}",
    'data-testid="page-settings-title-error"',
    'aria-invalid={Boolean(slugInlineError)}',
    "aria-describedby={slugInlineError ? 'page-settings-slug-error' : undefined}",
    'data-testid="page-settings-slug-error"',
    'data-testid="page-settings-scheduled-at-error"',
    'data-testid="page-settings-json-ld-error"',
    'disabled={isSavingSettings || !canEdit}',
  ]).map((snippet) => `PageSettingsModal.tsx missing ${snippet}`),
  pageSettingsModalSource.includes('disabled={Boolean(settingsValidation) || isSavingSettings || !canEdit}')
    ? 'PageSettingsModal.tsx must not disable Save with settingsValidation'
    : '',
].filter(Boolean);
const missingDesignManifestPersistenceSnippets = [
  ...collectMissingSnippets(editorCatalogSource, [
    "customJS?: string;",
    "themeTokenRefs?: BackyContentDocument['themeTokenRefs'];",
    "assets?: BackyContentDocument['assets'];",
    "interactions?: BackyContentDocument['interactions'];",
    "editableMap?: BackyContentDocument['editableMap'];",
    "metadata?: BackyContentDocument['metadata'];",
    "contentDocument?.metadata?.customJS",
    "options.themeTokenRefs !== undefined ? { themeTokenRefs: options.themeTokenRefs } : {}",
    "interactions: options.interactions",
    "editableMap: options.editableMap",
    "metadata: options.metadata",
    "payload.metadata = payload.contentDocument.metadata;",
  ]).map((snippet) => `editorCatalog.ts missing ${snippet}`),
  ...collectMissingSnippets(pageEditorRouteSource, [
    "customCSS: initialCustomCSS",
    "customJS: initialCustomJS",
    "themeTokenRefs: initialThemeTokenRefs",
    "assets: initialDesignAssets",
    "interactions: initialDesignInteractions",
    "editableMap: initialEditableMap",
    "metadata: initialDesignMetadata",
    "const content = serializeCanvasContent(elements, canvasSize, initialCustomCSS,",
  ]).map((snippet) => `pages.$pageId.edit.tsx missing ${snippet}`),
];
const missingUploadedFontFaceSnippets = collectMissingSnippets(fontCatalogSource, [
  "export interface FontFaceDefinition",
  "display: FontDisplay;",
  "faces?: FontFaceDefinition[];",
  "if (item.type !== 'font')",
  "const customOptionsByKey = new Map<string, FontOption>();",
  "normalizeFontDisplay(getStringMetadata(item, 'fontDisplay') || 'swap')",
  "existing.faces = [...(existing.faces || []), face];",
  "font.faces?.length",
  "font-display: ${display};",
]).map((snippet) => `fontCatalog.ts missing ${snippet}`);
const missingRichTextFontMediaMarkSnippets = collectMissingSnippets(richTextFormattingSource, [
  "const FONT_MEDIA_MARK_KEYS = [",
  "const buildRichTextFontMarkUpdates = (value: string, font?: FontOption): Record<string, unknown> =>",
  "const uniqueFontFaceMediaIds = (font: FontOption): string[] =>",
  "fontMediaIds: mediaIds",
  "fontSource: 'media-library'",
  "const runMarks = useCallback((updates: Record<string, unknown>) =>",
  "applyTextMarksToActiveEditor(updates)",
  "...FONT_MEDIA_MARK_KEYS",
  "data-font-media-id={font.mediaId || ''}",
  "data-font-face-count={font.faces?.length || 0}",
]).map((snippet) => `RichTextFormatting.tsx missing ${snippet}`);

if (
  missingEnvScripts.length ||
  missingWorkflowScripts.length ||
  missingComponentScripts.length ||
  missingTableRangeSourceSnippets.length ||
  missingTableRangeSmokeSnippets.length ||
  missingResponsiveSmokeSnippets.length ||
  missingResponsiveGroupingSourceSnippets.length ||
  missingSavedCanvasParentScopeSnippets.length ||
  missingDistributionSourceSnippets.length ||
  missingEditorCommandRegistrySnippets.length ||
  missingStressSmokeSnippets.length ||
  missingLayerUndoRedoSmokeSnippets.length ||
  missingStressScriptGuards.length ||
  missingEditorMfaLoginSnippets.length ||
	  missingTableStyleSetterGuards.length ||
	  missingListIndentNormalizationGuards.length ||
	  propertyPanelTypecheckGuards.length ||
	  missingInteractiveControlNormalizationSnippets.length ||
	  missingFormAppearanceControlSnippets.length ||
	  missingPageSettingsValidationSnippets.length ||
  missingDesignManifestPersistenceSnippets.length ||
  missingUploadedFontFaceSnippets.length ||
  missingRichTextFontMediaMarkSnippets.length
) {
  console.error(JSON.stringify({
    ok: false,
    missingEnvScripts,
    missingWorkflowScripts,
    missingComponentScripts,
    missingTableRangeSourceSnippets,
    missingTableRangeSmokeSnippets,
    missingResponsiveSmokeSnippets,
    missingResponsiveGroupingSourceSnippets,
    missingSavedCanvasParentScopeSnippets,
    missingDistributionSourceSnippets,
    missingEditorCommandRegistrySnippets,
    missingStressSmokeSnippets,
    missingLayerUndoRedoSmokeSnippets,
    missingStressScriptGuards,
    missingEditorMfaLoginSnippets,
    missingTableStyleSetterGuards,
    missingListIndentNormalizationGuards,
	    propertyPanelTypecheckGuards,
	    missingInteractiveControlNormalizationSnippets,
	    missingFormAppearanceControlSnippets,
	    missingPageSettingsValidationSnippets,
    missingDesignManifestPersistenceSnippets,
    missingUploadedFontFaceSnippets,
    missingRichTextFontMediaMarkSnippets,
  }, null, 2));
  process.exit(1);
}

console.log(JSON.stringify({
  ok: true,
  editorSmokeEnvCount: envNames.length,
  editorComponentSmokeCount: componentHandlerNames.length,
  editorWorkflowScriptCount: editorScripts.length - workflowExclusions.size,
  tableRangeSourceSnippets: 42,
  tableRangeSmokeSnippets: 10,
  responsiveSmokeSnippets: 116,
  responsiveGroupingSourceSnippets: 5,
  savedCanvasParentScopeSnippets: 5,
  distributionSourceSnippets: 2,
  editorCommandRegistrySnippets: 16,
  stressSmokeSnippets: 9,
  layerUndoRedoSmokeSnippets: 5,
  stressScriptGuards: 2,
  editorMfaLoginSnippets: 9,
  listIndentNormalizationGuards: 9,
	  propertyPanelTypecheckGuards: 2,
	  interactiveControlNormalizationSnippets: 23,
	  formAppearanceControlSnippets: 18,
	  pageSettingsValidationSnippets: 12,
  designManifestPersistenceSnippets: 19,
  uploadedFontFaceSnippets: 9,
  richTextFontMediaMarkSnippets: 10,
}, null, 2));
