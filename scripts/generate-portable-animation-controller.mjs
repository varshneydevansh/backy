#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import ts from 'typescript';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const input = path.join(root, 'apps/public/src/lib/animationHydration.ts');
const output = path.join(root, 'examples/custom-frontend-next/src/lib/portable-animation.js');
const result = await build({
 absWorkingDir: root, entryPoints: [input], bundle: true, write: false,
 format: 'esm', platform: 'browser', target: 'es2022', metafile: true,
 banner: { js: '// Generated from the hosted animation controller. Run scripts/generate-portable-animation-controller.mjs.' },
});
if (Object.values(result.metafile.outputs).some(output => output.imports.some(item => item.external))) throw new Error('Portable animation controller must not depend on unpublished packages.');
const options = { declaration: true, emitDeclarationOnly: true, noEmitOnError: true, target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext, moduleResolution: ts.ModuleResolutionKind.Bundler, esModuleInterop: true, skipLibCheck: true, strict: true, types: [] };
const host = ts.createCompilerHost(options);
let declarations, sequenceDeclarations;
host.writeFile = (file, source) => { if (file.endsWith('/animationHydration.d.ts')) declarations = source; if (file.endsWith('/animation-sequence.d.ts')) sequenceDeclarations = source; };
const program = ts.createProgram([input], options, host);
const emission = program.emit();
const errors = [...ts.getPreEmitDiagnostics(program), ...emission.diagnostics].filter(item => item.category === ts.DiagnosticCategory.Error);
if (errors.length || !declarations) throw new Error(ts.formatDiagnosticsWithColorAndContext(errors, { getCanonicalFileName: name => name, getCurrentDirectory: () => root, getNewLine: () => '\n' }) || 'Missing animation declarations.');
if (!sequenceDeclarations) throw new Error('Missing sequence declarations.');
const sequenceAst = ts.createSourceFile('animation-sequence.d.ts', sequenceDeclarations, ts.ScriptTarget.Latest, true);
const sequenceTypes = sequenceAst.statements.filter(node => ts.isInterfaceDeclaration(node) || ts.isTypeAliasDeclaration(node)).map(node => ts.createPrinter().printNode(ts.EmitHint.Unspecified, node, sequenceAst)).join('\n');
declarations = declarations.replace(/^import .*animation-sequence.*;\n/m, '') + '\n' + sequenceTypes + '\n';
const files = [[output, result.outputFiles[0].text], [output.replace(/\.js$/, '.d.ts'), '// Generated declarations from the hosted animation controller.\n' + declarations]];
for (const [file, source] of files) {
 if (process.argv.includes('--check')) {
  if (await fs.readFile(file, 'utf8') !== source) throw new Error('Portable animation controller is stale; regenerate it.');
 } else await fs.writeFile(file, source);
}
console.log(process.argv.includes('--check') ? 'Portable animation controller and declarations match the hosted source.' : 'Generated portable animation controller and declarations; no unpublished runtime dependency.');
