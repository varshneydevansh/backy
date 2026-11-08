import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

// Compile the actual pure declarations without loading the browser/editor engine.
const loadDeclarations = (path, names, globals = {}) => {
  const source = readFileSync(new URL(path, import.meta.url), 'utf8');
  const ast = ts.createSourceFile(path, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const statements = ast.statements.filter((node) => ts.isVariableStatement(node)
    && node.declarationList.declarations.some((declaration) => names.includes(declaration.name.getText(ast))));
  assert.equal(statements.length, names.length, 'All model declarations must come from production source');
  const compiled = ts.transpileModule(`${statements.map(node => node.getText(ast)).join('\n')}\nexport { ${names.join(', ')} };`,
    { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText;
  const context = { exports: {}, ...globals };
  vm.runInNewContext(compiled, context);
  return context.exports;
};

const { registeredComponentProps, registeredComponentControls } = loadDeclarations('../src/components/editor/registeredComponentModel.ts', ['record', 'clone', 'registeredComponentProps', 'registeredComponentControls']);
const { createRegisteredComponentLibraryItems, itemMatchesSearch } = loadDeclarations('../src/components/editor/ComponentLibrary.tsx', ['createRegisteredComponentLibraryItems', 'childMatchesSearch', 'itemMatchesSearch'], { registeredComponentProps });
const entry = { componentKey: 'kinetic-wave', displayName: 'Kinetic wave', type: 'codeComponent', status: 'active',
  version: '1.2.3', renderMode: 'sandbox-iframe', source: 'custom', description: 'A wave with editable frequency',
  controls: [{ key: 'frequency', label: 'Wave frequency', type: 'range', defaultValue: 4, customMetadata: { keep: true } }],
  runtime: { sandboxUrl: '/api/sites/site-a/interactive-components/kinetic-wave/1.2.3/sandbox' },
  integrity: { signatureRequiredForCustomCode: true } };
const before = JSON.stringify(entry);
const items = createRegisteredComponentLibraryItems([entry, entry, { ...entry, version: '2.0.0' },
  { ...entry, componentKey: 'disabled', status: 'disabled' }, { ...entry, componentKey: 'arbitrary-react', type: 'ReactWidget' },
  { ...entry, componentKey: 'unsupported-runtime', renderMode: 'javascript-import' }]);
assert.equal(items.length, 2, 'Only active supported registry versions become insertable blocks');
assert.equal(items[0].defaultProps.componentKey, entry.componentKey);
assert.equal(items[0].defaultProps.version, entry.version);
assert.equal(items[0].defaultProps.sandboxUrl, entry.runtime.sandboxUrl);
assert.equal(items[0].defaultProps.renderCapabilities.requiresSignedBundle, true);
assert.equal(items[0].defaultProps.fallback.ariaLabel, entry.displayName);
assert.match(items[0].description, /kinetic-wave.*1\.2\.3.*sandbox-iframe/);
assert.equal(itemMatchesSearch(items[0], 'kinetic-wave'), true, 'Registered keys can be discovered by search');
assert.equal(itemMatchesSearch({ type: 'collapsible', name: 'Collapsible section' }, 'accordion'), true, 'Common component vocabulary stays discoverable');
assert.equal(items[0].defaultProps.controls[0].customMetadata.keep, true);
items[0].defaultProps.controls[0].customMetadata.keep = false;
assert.equal(JSON.stringify(entry), before, 'Editing an inserted control must not mutate registry state');
assert.equal(createRegisteredComponentLibraryItems(Array.from({ length: 12 }, (_, i) => ({ ...entry, componentKey: `wave-${i}` }))).length, 12, 'Registered discovery must not cap choices');
const trusted = createRegisteredComponentLibraryItems([{ ...entry, renderMode: 'trusted-component' }])[0];
assert.equal(trusted.defaultProps.sandboxUrl, undefined, 'Trusted frontend mappings must not gain a sandbox URL');
assert.equal(trusted.defaultProps.renderCapabilities.requiresSandbox, false);

const names = ['PROPERTY_SECTION_IDS', 'PROPERTY_SECTION_METADATA', 'normalizePropertySectionQuery', 'contentControlKeywordsForElement', 'matchingPropertySectionsForQuery'];
const { matchingPropertySectionsForQuery } = loadDeclarations('../src/components/editor/PropertyPanel.tsx', names,
  { registeredComponentControls, ...Object.fromEntries(['Type', 'Layout', 'Palette', 'Box', 'Database', 'Sparkles'].map(name => [name, () => null])) });
const element = (type, props = {}) => ({ id: 'selected', type, props });
for (const query of ['accordion', 'collapsible', 'expanded', 'default open', 'summary']) {
  assert.equal(matchingPropertySectionsForQuery(query, element('collapsible')).includes('content'), true, query);
}
for (const query of ['poster', 'YouTube', 'Drive', 'autoplay', 'play inline']) {
  assert.equal(matchingPropertySectionsForQuery(query, element('video')).includes('content'), true, query);
}
assert.equal(matchingPropertySectionsForQuery('Wave frequency', element('codeComponent', { componentKey: entry.componentKey, version: entry.version }), [entry]).includes('content'), true, 'Registry control labels must work on older elements without copied schema');
assert.equal(matchingPropertySectionsForQuery('Wave frequency', element('text'), [entry]).includes('content'), false, 'Unrelated component controls must not appear as matches');
assert.equal(matchingPropertySectionsForQuery('Configuration', element('codeComponent', { componentKey: entry.componentKey, version: entry.version }), [{ ...entry, propsSchema: { properties: { config: { type: 'object', title: 'Configuration' } } } }]).includes('content'), true, 'Schema-only fields are discoverable through inspector search');
assert.equal(matchingPropertySectionsForQuery('font size', element('text')).includes('style'), true, 'Existing style searches stay available');
assert.equal(matchingPropertySectionsForQuery('nonexistent-control', element('collapsible')).length, 0, 'Unknown controls keep honest empty search state');
console.log('Editor discovery model: supported registry insertion, version dedupe, complete choices, schema preservation, runtime boundaries and semantic inspector searches passed.');

const { collectInteractiveReadinessIssues } = loadDeclarations('../src/components/editor/CanvasEditor.tsx',
  ['isPlainRecord', 'INTERACTIVE_ELEMENT_TYPES', 'getNonEmptyString', 'hasInteractiveFallback', 'getInteractiveHydrationMode', 'collectInteractiveReadinessIssues'],
  { isBackyDataFigureKey: key => ['backy.chart.line', 'backy.chart.bar', 'backy.table.data'].includes(key) });
const figure = (key, extra = {}) => ({ id: 'figure', type: 'interactiveFigure', props: {
  componentKey: key, version: '1.0.0', renderCapabilities: { hydrationMode: 'trusted-component' }, ...extra,
} });
for (const key of ['backy.chart.line', 'backy.chart.bar', 'backy.table.data']) {
  assert.equal(collectInteractiveReadinessIssues([figure(key, { records: [] })]).length, 0, 'Native accessible output needs no unrelated fallback');
  assert.equal(collectInteractiveReadinessIssues([figure(key, { source: { type: 'collection', collectionId: 'public-data' } })]).length, 0);
  assert.equal(collectInteractiveReadinessIssues([figure(key)]).length, 1, 'Legacy figures without native configuration retain fallback requirement');
}
assert.equal(collectInteractiveReadinessIssues([figure('custom.diagram', { records: [] })]).length, 1, 'Custom components cannot bypass fallback with arbitrary records');
assert.equal(collectInteractiveReadinessIssues([{ id: 'group', type: 'box', props: {}, children: [figure('custom.diagram')] }]).length, 1, 'Nested interactive readiness is checked');
console.log('Shared publish readiness: native chart/table output, legacy fallback protection and nested custom components passed.');
