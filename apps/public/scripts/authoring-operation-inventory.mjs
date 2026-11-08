#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
import { fileURLToPath } from 'node:url';
import { collectAuthoringOperations } from './authoring-openapi-operations.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../../..');
const base=path.join(root,'apps/public/src/app/api/admin/sites/[siteId]');
const source=ts.createSourceFile('openapi.ts',fs.readFileSync(path.join(root,'apps/public/src/app/api/sites/[siteId]/openapi/route.ts'),'utf8'),ts.ScriptTarget.Latest,true);
const allSiteAdmin=process.argv.includes('--all-site-admin');
const methods=new Set(['GET','POST','PATCH','PUT','DELETE','HEAD','OPTIONS']);
const {documented,modules}=collectAuthoringOperations(source.text,path.join(root,'apps/public/src'),file=>fs.readFileSync(file,'utf8'));
const covered=[],missing=[];
function walk(directory){for(const entry of fs.readdirSync(directory,{withFileTypes:true})){const file=path.join(directory,entry.name);if(entry.isDirectory())walk(file);else if(entry.name==='route.ts'){const relative=file.slice(base.length+1).replace(/(?:^|\/)route.ts$/,'');if(!allSiteAdmin&&!/^(pages|blog|templates|frontend-design|interactive-components|media)(\/|$)/.test(relative))continue;const tree=ts.createSourceFile(file,fs.readFileSync(file,'utf8'),ts.ScriptTarget.Latest,true);const exported=new Set();for(const n of tree.statements){if(ts.isExportDeclaration(n)&&n.exportClause&&ts.isNamedExports(n.exportClause)){for(const e of n.exportClause.elements)if(methods.has(e.name.text))exported.add(e.name.text);}if(!n.modifiers?.some(m=>m.kind===ts.SyntaxKind.ExportKeyword))continue;if(ts.isFunctionDeclaration(n)&&n.name&&methods.has(n.name.text))exported.add(n.name.text);if(ts.isVariableStatement(n))for(const d of n.declarationList.declarations)if(ts.isIdentifier(d.name)&&methods.has(d.name.text))exported.add(d.name.text);}for(const method of exported){const key=method+' /api/admin/sites/{siteId}'+(relative?'/'+relative.replace(/\[([^\]]+)\]/g,'{$1}'):'');(documented.has(key)?covered:missing).push(key);}}}}walk(base);
const report={scope:allSiteAdmin?'all site-scoped admin exported HTTP methods':'site-scoped pages/blog/templates/frontend-design/interactive-components/media exported methods only',evidence:'AST handler exports versus included inline and pure module OpenAPI paths; presence does not certify schema/handler parity, permissions, UI or production',declarationModules:modules,total:covered.length+missing.length,covered:covered.length,missing:missing.sort()};
console.log(JSON.stringify(report,null,2));
if(process.argv.includes('--require-complete')&&missing.length)process.exitCode=1;
