import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

// Execute the production normalizer without loading React or opening a browser.
const source = ts.createSourceFile(
  'CanvasEditor.tsx',
  fs.readFileSync(new URL('../src/components/editor/CanvasEditor.tsx', import.meta.url), 'utf8'),
  ts.ScriptTarget.Latest,
  true,
  ts.ScriptKind.TSX,
);
const names = new Set(['KNOWN_CANVAS_ELEMENT_TYPES', 'normalizeTypeToken', 'normalizeElementType']);
const declarations = source.statements.filter((statement) => (
  ts.isVariableStatement(statement)
  && statement.declarationList.declarations.some((declaration) => names.has(declaration.name.getText(source)))
));
assert.equal(declarations.length, names.size, 'Production type normalizer declarations must be present');
const compiled = ts.transpileModule(
  declarations.map((statement) => statement.getText(source)).join('\n'),
  { compilerOptions: { target: ts.ScriptTarget.ES2022 } },
).outputText;
const context = vm.createContext({});
vm.runInContext(`${compiled}\nthis.types = KNOWN_CANVAS_ELEMENT_TYPES; this.normalize = normalizeElementType;`, context);
for (const type of context.types) {
  assert.equal(context.normalize(type), type, `${type} must retain its canonical type when added or reopened`);
  assert.equal(context.normalize(type.toUpperCase()), type, `${type} uppercase input must resolve canonically`);
}
for (const [input, expected] of [
  ['interactive-figure', 'interactiveFigure'],
  ['code_component', 'codeComponent'],
  ['code block', 'codeBlock'],
  ['Text input field', 'input'],
  ['multiline text', 'textarea'],
  ['dropdown selector', 'select'],
  ['radio buttons', 'radio'],
  ['unknown-widget', 'text'],
  ['', 'text'],
]) {
  assert.equal(context.normalize(input), expected, `Unexpected type for ${JSON.stringify(input)}`);
}
console.log(`Editor element type smoke passed: ${context.types.length * 2 + 9} cases`);
