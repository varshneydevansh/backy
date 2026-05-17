import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const packagePath = path.resolve(__dirname, '../package.json');
const smokePath = path.resolve(__dirname, 'editor-drag-smoke.mjs');
const activeEditorContextPath = path.resolve(__dirname, '../src/components/editor/ActiveEditorContext.tsx');

const packageJson = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
const smokeSource = fs.readFileSync(smokePath, 'utf8');
const activeEditorContextSource = fs.readFileSync(activeEditorContextPath, 'utf8');
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
  "await waitForEditorElements(reloadClient, ['smoke-heading', 'smoke-image', 'smoke-box', 'smoke-columns']);",
  'reloadedResponsiveEditing.columnsMobile.breakpointAfter.x === responsiveEditing.columnsMobile.breakpointAfter.x',
  'reloadedResponsiveEditing.columnsTablet.breakpointAfter.width === responsiveEditing.columnsTablet.breakpointAfter.width',
  "key: 'columnsMobile'",
  "label: 'Public mobile columns responsive geometry'",
  "key: 'columnsTablet'",
  "label: 'Public tablet columns responsive geometry'",
]);
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

if (
  missingEnvScripts.length ||
  missingWorkflowScripts.length ||
  missingComponentScripts.length ||
  missingTableRangeSourceSnippets.length ||
  missingTableRangeSmokeSnippets.length ||
  missingResponsiveSmokeSnippets.length ||
  missingEditorMfaLoginSnippets.length ||
  missingTableStyleSetterGuards.length
) {
  console.error(JSON.stringify({
    ok: false,
    missingEnvScripts,
    missingWorkflowScripts,
    missingComponentScripts,
    missingTableRangeSourceSnippets,
    missingTableRangeSmokeSnippets,
    missingResponsiveSmokeSnippets,
    missingEditorMfaLoginSnippets,
    missingTableStyleSetterGuards,
  }, null, 2));
  process.exit(1);
}

console.log(JSON.stringify({
  ok: true,
  editorSmokeEnvCount: envNames.length,
  editorComponentSmokeCount: componentHandlerNames.length,
  editorWorkflowScriptCount: editorScripts.length - workflowExclusions.size,
  tableRangeSourceSnippets: 14,
  tableRangeSmokeSnippets: 10,
  responsiveSmokeSnippets: 14,
  editorMfaLoginSnippets: 9,
}, null, 2));
