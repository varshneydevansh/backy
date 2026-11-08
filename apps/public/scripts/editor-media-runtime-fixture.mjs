import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import ts from 'typescript';
import { load } from './collection-import-postgres-handlers.mjs';
/** Execute the real decorator, without loading any configured database runtime. */
export function editorMediaRuntimeFixture(repositories) {
 const filename=fileURLToPath(new URL('../src/lib/repositoryRuntime.ts',import.meta.url)), source=readFileSync(filename,'utf8'), ast=ts.createSourceFile(filename,source,ts.ScriptTarget.Latest,true);
 const declaration=ast.statements.flatMap(node=>ts.isVariableStatement(node)?Array.from(node.declarationList.declarations):[]).find(node=>node.name.getText(ast)==='withRepositoryMediaReferenceSync');
 assert(declaration,'The actual media reference decorator must be present');
 const module={exports:{}};
 vm.runInNewContext(ts.transpileModule(`const ${declaration.getText(ast)}; exports.wrap=withRepositoryMediaReferenceSync;`,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{module,exports:module.exports,...load('../src/lib/repositoryMediaReferenceSync.ts',{})},{filename});
 return module.exports.wrap(repositories);
}
