import path from 'node:path';
import vm from 'node:vm';
import ts from 'typescript';

const methods = new Set(['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'HEAD', 'OPTIONS']);

// Inspect only declarations actually included in paths, never unrelated imports.
// Pure declaration modules run without process, require, filesystem or network APIs.
export function collectAuthoringOperations(routeText, sourceRoot, readModule) {
  const source = ts.createSourceFile('openapi.ts', routeText, ts.ScriptTarget.Latest, true);
  const imports = new Map();
  for (const node of source.statements) {
    if (!ts.isImportDeclaration(node) || !node.importClause?.namedBindings ||
        !ts.isNamedImports(node.importClause.namedBindings)) continue;
    for (const binding of node.importClause.namedBindings.elements) {
      imports.set(binding.name.text, {
        module: node.moduleSpecifier.text,
        exported: (binding.propertyName || binding.name).text,
      });
    }
  }
  const documented = new Set();
  const modules = [];
  const add = (url, operations) => {
    if (!url.startsWith('/api/admin/sites/{siteId}')) return;
    for (const method of Object.keys(operations)) {
      if (methods.has(method.toUpperCase())) documented.add(`${method.toUpperCase()} ${url}`);
    }
  };
  function inspectPaths(node) {
    for (const property of node.properties) {
      if (ts.isPropertyAssignment(property) && ts.isComputedPropertyName(property.name) &&
          ts.isObjectLiteralExpression(property.initializer)) {
        const expression = property.name.expression.getText(source);
        if (expression.startsWith('`/api/admin/sites/${site.id}')) {
          const url = expression.slice(1, -1).replace('${site.id}', '{siteId}');
          const operations = {};
          for (const operation of property.initializer.properties) {
            if (ts.isPropertyAssignment(operation)) operations[operation.name.getText(source).replace(/["']/g, '')] = true;
          }
          add(url, operations);
        }
      } else if (ts.isSpreadAssignment(property)) {
        const call = property.expression;
        if (!ts.isCallExpression(call) || !ts.isIdentifier(call.expression) ||
            call.arguments.length !== 1 || call.arguments[0].getText(source) !== 'site.id') {
          throw new Error(`Unsupported OpenAPI paths spread: ${property.getText(source)}`);
        }
        const imported = imports.get(call.expression.text);
        if (!imported?.module.startsWith('@/')) throw new Error(`Unresolved paths module: ${call.expression.text}`);
        const filename = path.resolve(sourceRoot, `${imported.module.slice(2)}.ts`);
        const moduleText = readModule(filename);
        const code = ts.transpileModule(moduleText, { compilerOptions: {
          module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022,
        }}).outputText;
        const context = vm.createContext({ exports: {} });
        vm.runInContext(code, context, { filename, timeout: 1000 });
        context.pathFactoryName = imported.exported;
        const paths = vm.runInContext('exports[pathFactoryName]("{siteId}")', context, { timeout: 1000 });
        for (const [url, operations] of Object.entries(paths)) add(url, operations);
        modules.push(imported.module);
      }
    }
  }
  function scan(node) {
    if (ts.isPropertyAssignment(node) && node.name.getText(source) === 'paths' &&
        ts.isObjectLiteralExpression(node.initializer)) inspectPaths(node.initializer);
    ts.forEachChild(node, scan);
  }
  scan(source);
  return { documented, modules };
}
