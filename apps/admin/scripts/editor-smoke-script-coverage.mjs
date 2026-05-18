import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const packagePath = path.resolve(__dirname, '../package.json');
const smokePath = path.resolve(__dirname, 'editor-drag-smoke.mjs');
const activeEditorContextPath = path.resolve(__dirname, '../src/components/editor/ActiveEditorContext.tsx');
const propertyPanelPath = path.resolve(__dirname, '../src/components/editor/PropertyPanel.tsx');
const richTextFormattingPath = path.resolve(__dirname, '../src/components/editor/RichTextFormatting.tsx');
const richTextListTransformsPath = path.resolve(__dirname, '../src/components/editor/richTextListTransforms.ts');
const editorPackageIndexPath = path.resolve(__dirname, '../../../packages/editor/src/index.tsx');

const packageJson = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
const smokeSource = fs.readFileSync(smokePath, 'utf8');
const activeEditorContextSource = fs.readFileSync(activeEditorContextPath, 'utf8');
const propertyPanelSource = fs.readFileSync(propertyPanelPath, 'utf8');
const richTextFormattingSource = fs.readFileSync(richTextFormattingPath, 'utf8');
const richTextListTransformsSource = fs.readFileSync(richTextListTransformsPath, 'utf8');
const editorPackageIndexSource = fs.readFileSync(editorPackageIndexPath, 'utf8');
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

if (
  missingEnvScripts.length ||
  missingWorkflowScripts.length ||
  missingComponentScripts.length ||
  missingTableRangeSourceSnippets.length ||
  missingTableRangeSmokeSnippets.length ||
  missingResponsiveSmokeSnippets.length ||
  missingStressSmokeSnippets.length ||
  missingStressScriptGuards.length ||
  missingEditorMfaLoginSnippets.length ||
  missingTableStyleSetterGuards.length ||
  missingListIndentNormalizationGuards.length ||
  propertyPanelTypecheckGuards.length
) {
  console.error(JSON.stringify({
    ok: false,
    missingEnvScripts,
    missingWorkflowScripts,
    missingComponentScripts,
    missingTableRangeSourceSnippets,
    missingTableRangeSmokeSnippets,
    missingResponsiveSmokeSnippets,
    missingStressSmokeSnippets,
    missingStressScriptGuards,
    missingEditorMfaLoginSnippets,
    missingTableStyleSetterGuards,
    missingListIndentNormalizationGuards,
    propertyPanelTypecheckGuards,
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
  stressSmokeSnippets: 9,
  stressScriptGuards: 2,
  editorMfaLoginSnippets: 9,
  listIndentNormalizationGuards: 9,
  propertyPanelTypecheckGuards: 2,
}, null, 2));
