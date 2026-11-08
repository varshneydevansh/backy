/** Actual handler VM, exposing native binary multipart globals for disposable browser proof. */
// Invoked by the owned disposable PostgreSQL runner only; never reads a database URL.
import {File} from 'node:buffer';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import ts from 'typescript';
const require = createRequire(import.meta.url), { NextRequest, NextResponse } = require('next/server');
export function load(relative, mocks, cache = new Map()) {
 const filename = fileURLToPath(new URL(relative, new URL('../../public/scripts/collection-import-postgres-handlers.mjs',import.meta.url)));
 if (cache.has(filename)) return cache.get(filename);
 const module = { exports: {} }; cache.set(filename, module.exports);
 const compiled = ts.transpileModule(readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
 vm.runInNewContext(compiled, { module, exports: module.exports, Request, Response, Headers, URL, URLSearchParams, Buffer, File, FormData, structuredClone, process, console, require: id => id in mocks ? mocks[id] : id.startsWith('@/lib/') ? load('../src/lib/' + id.slice('@/lib/'.length) + '.ts', mocks, cache) : id.startsWith('./') ? load(new URL(id + '.ts', 'file://' + filename).href, mocks, cache) : require(id) }, { filename });
 return module.exports;
}
