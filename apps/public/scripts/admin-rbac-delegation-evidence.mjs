import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';

const methods = new Set(['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'HEAD', 'OPTIONS']);
const parse = (file, source) => ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
const children = (node, predicate) => {
  const found = [];
  const visit = current => { if (predicate(current)) found.push(current); ts.forEachChild(current, visit); };
  visit(node);
  return found;
};
const unwrap = node => node && (ts.isAwaitExpression(node) || ts.isParenthesizedExpression(node) || ts.isAsExpression(node) || ts.isNonNullExpression(node)) ? unwrap(node.expression) : node;
const exported = node => node.modifiers?.some(modifier => modifier.kind === ts.SyntaxKind.ExportKeyword);
const nameOf = node => node && (ts.isIdentifier(node) || ts.isStringLiteral(node)) ? node.text : undefined;
const functionMap = tree => new Map(tree.statements.flatMap(node => {
  if (ts.isFunctionDeclaration(node) && node.name && node.body) return [[node.name.text, node]];
  if (ts.isVariableStatement(node)) return node.declarationList.declarations.flatMap(declaration => {
    const value = unwrap(declaration.initializer);
    return ts.isIdentifier(declaration.name) && value && (ts.isArrowFunction(value) || ts.isFunctionExpression(value)) && ts.isBlock(value.body) ? [[declaration.name.text, value]] : [];
  });
  return [];
}));
function imports(tree, file, appRoot) {
  return new Map(tree.statements.flatMap(node => {
    if (!ts.isImportDeclaration(node) || !ts.isStringLiteral(node.moduleSpecifier) || !node.importClause?.namedBindings || !ts.isNamedImports(node.importClause.namedBindings)) return [];
    const specifier = node.moduleSpecifier.text;
    const base = specifier.startsWith('@/') ? path.join(appRoot, 'src', specifier.slice(2)) : specifier.startsWith('.') ? path.resolve(path.dirname(file), specifier) : null;
    return node.importClause.namedBindings.elements.map(binding => [binding.name.text, { name: binding.propertyName?.text || binding.name.text, file: base ? `${base}.ts` : null, specifier }]);
  }));
}
function ownNodes(body, predicate) {
  const found = [];
  const visit = node => {
    // A dormant nested function is not admission for its enclosing HTTP method.
    if (node !== body && (ts.isFunctionDeclaration(node) || ts.isFunctionExpression(node) || ts.isArrowFunction(node))) return;
    if (predicate(node)) found.push(node);
    ts.forEachChild(node, visit);
  };
  visit(body);
  return found;
}
const ownCalls = body => ownNodes(body, ts.isCallExpression);
function directOrLocalGuard(fn, funcs, bindings, appRoot, seen = new Set()) {
  if (seen.has(fn)) return false;
  seen.add(fn);
  return ownCalls(fn.body).some(call => {
    if (!ts.isIdentifier(call.expression)) return false;
    const binding = bindings.get(call.expression.text);
    if (binding?.name === 'requireAdminAccess' && binding.file === path.join(appRoot, 'src/lib/adminAccess.ts')) return true;
    const local = funcs.get(call.expression.text);
    return local ? directOrLocalGuard(local, funcs, bindings, appRoot, seen) : false;
  });
}
const constDeclarations = body => new Map(children(body, ts.isVariableDeclaration).filter(node => ts.isIdentifier(node.name) && node.parent.flags & ts.NodeFlags.Const).map(node => [node.name.text, node.initializer]));
function capabilityBranches(node, declarations, seen = new Set()) {
  node = unwrap(node);
  if (!node) return null;
  if (ts.isStringLiteral(node)) return /^[a-zA-Z]+\.[a-zA-Z]+$/.test(node.text) ? [[node.text]] : null;
  if (ts.isIdentifier(node) && !seen.has(node.text)) {
    const next = new Set(seen); next.add(node.text);
    return capabilityBranches(declarations.get(node.text), declarations, next);
  }
  if (ts.isConditionalExpression(node)) {
    const yes = capabilityBranches(node.whenTrue, declarations, seen), no = capabilityBranches(node.whenFalse, declarations, seen);
    return yes && no ? [...yes, ...no] : null;
  }
  if (ts.isArrayLiteralExpression(node)) {
    let branches = [[]];
    for (const element of node.elements) {
      const next = capabilityBranches(ts.isSpreadElement(element) ? element.expression : element, declarations, seen);
      if (!next || branches.length * next.length > 64) return null;
      branches = branches.flatMap(branch => next.map(values => [...branch, ...values]));
    }
    return branches;
  }
  return null;
}
function capabilities(node, declarations) {
  const branches = capabilityBranches(node, declarations);
  // Every possible admission branch must demand a capability; an empty alternate
  // cannot be hidden by flattening the nonempty branch's permission strings.
  return branches?.length && branches.every(branch => branch.length > 0) ? branches.flat() : null;
}
function credentialPredicate(node, requestName, headerName) {
  node = unwrap(node);
  if (!node) return false;
  if (ts.isPrefixUnaryExpression(node) && node.operator === ts.SyntaxKind.ExclamationToken) return credentialPredicate(node.operand, requestName, headerName);
  if (ts.isPropertyAccessExpression(node) && node.name.text === 'value') {
    const call = unwrap(node.expression);
    return call && ts.isCallExpression(call) && credentialPredicate(call, requestName, headerName);
  }
  if (!ts.isCallExpression(node) || !ts.isPropertyAccessExpression(node.expression)) return false;
  const callee = node.expression, receiver = unwrap(callee.expression);
  const requestCollection = receiver && ts.isPropertyAccessExpression(receiver) && nameOf(receiver.expression) === requestName;
  if (requestCollection && ['headers', 'cookies'].includes(receiver.name.text) && ['has', 'get'].includes(callee.name.text)) {
    return node.arguments.length === 1 && (ts.isStringLiteral(node.arguments[0]) || receiver.name.text === 'headers' && typeof headerName === 'string' && ts.isIdentifier(node.arguments[0]) && nameOf(node.arguments[0]) === headerName);
  }
  if (callee.name.text === 'trim' && node.arguments.length === 0 && receiver && ts.isPropertyAccessExpression(receiver) && receiver.name.text === 'value') return credentialPredicate(receiver, requestName, headerName);
  if (callee.name.text !== 'some' || !receiver || !ts.isArrayLiteralExpression(receiver) || !receiver.elements.length || !receiver.elements.every(ts.isStringLiteral) || node.arguments.length !== 1) return false;
  const predicate = node.arguments[0];
  const parameter = ts.isArrowFunction(predicate) && predicate.parameters.length === 1 && nameOf(predicate.parameters[0].name);
  return parameter && parameter !== requestName && !ts.isBlock(predicate.body) && credentialPredicate(predicate.body, requestName, parameter);
}
// A local const decorator may only add literal headers and return its exact
// response argument. It cannot call providers, replace a denial or admit a key.
function responseValue(node, tree, locals) {
  node = unwrap(node);
  if (!node || !ts.isCallExpression(node) || !ts.isIdentifier(node.expression) || node.arguments.length !== 1 || locals?.has(node.expression.text)) return node;
  const declaration = tree.statements.filter(ts.isVariableStatement).flatMap(statement => statement.declarationList.flags & ts.NodeFlags.Const ? [...statement.declarationList.declarations] : []).find(declaration => nameOf(declaration.name) === node.expression.text);
  const decorator = unwrap(declaration?.initializer);
  if (!decorator || !ts.isArrowFunction(decorator) || !ts.isBlock(decorator.body) || decorator.modifiers?.some(modifier => modifier.kind === ts.SyntaxKind.AsyncKeyword) || decorator.parameters.length !== 1 || !ts.isIdentifier(decorator.parameters[0].name) || decorator.parameters[0].initializer || decorator.parameters[0].dotDotDotToken) return node;
  const parameter = decorator.parameters[0].name.text;
  const statements = [...decorator.body.statements], returned = statements.pop();
  if (!returned || !ts.isReturnStatement(returned) || nameOf(unwrap(returned.expression)) !== parameter || !statements.length || !statements.every(statement => {
    const call = ts.isExpressionStatement(statement) && unwrap(statement.expression), callee = call && ts.isCallExpression(call) && call.expression;
    return callee && ts.isPropertyAccessExpression(callee) && callee.name.text === 'set' && ts.isPropertyAccessExpression(callee.expression) && callee.expression.name.text === 'headers' && nameOf(callee.expression.expression) === parameter && call.arguments.length === 2 && call.arguments.every(ts.isStringLiteral);
  })) return node;
  return unwrap(node.arguments[0]);
}
function failClosedCredentialCheck(statement, fn, bindings, appRoot, tree) {
  if (!ts.isIfStatement(statement) || statement.elseStatement || !credentialPredicate(statement.expression, nameOf(fn.parameters[0]?.name))) return false;
  const body = ts.isBlock(statement.thenStatement) ? [...statement.thenStatement.statements] : [statement.thenStatement];
  if (body.length !== 1 || !ts.isReturnStatement(body[0])) return false;
  const call = responseValue(body[0].expression, tree, new Set([...constDeclarations(fn.body).keys(), ...fn.parameters.map(parameter => nameOf(parameter.name))]));
  if (!call || !ts.isCallExpression(call) || !ts.isIdentifier(call.expression)) return false;
  const binding = bindings.get(call.expression.text);
  // These checks can only deny, through the real auth error response; they
  // cannot execute a provider/repository call or become a substitute gate.
  return binding?.name === 'adminAccessError' && binding.file === path.join(appRoot, 'src/lib/adminAccess.ts')
    && call.arguments.length === 4 && ts.isNumericLiteral(call.arguments[0]) && ['401', '403'].includes(call.arguments[0].text)
    && ts.isStringLiteral(call.arguments[1]) && ts.isStringLiteral(call.arguments[2]) && nameOf(call.arguments[3]) === 'requestId';
}
function guardedHelper(fn, bindings, appRoot, tree) {
  const declarations = constDeclarations(fn.body);
  const responseLocals = new Set([...declarations.keys(), ...fn.parameters.map(parameter => nameOf(parameter.name))]);
  let statements = [...fn.body.statements];
  // Several handlers wrap admission in their top-level failure boundary.
  const trial = statements.findIndex(ts.isTryStatement);
  if (trial >= 0) statements = [...statements.slice(0, trial), ...statements[trial].tryBlock.statements];
  for (let index = 0; index < statements.length; index++) {
    const statement = statements[index];
    if (!ts.isVariableStatement(statement)) continue;
    for (const declaration of statement.declarationList.declarations) {
      const call = unwrap(declaration.initializer);
      if (!call || !ts.isCallExpression(call) || !ts.isIdentifier(call.expression) || !ts.isIdentifier(declaration.name)) continue;
      const binding = bindings.get(call.expression.text);
      if (binding?.name !== 'requireAdminAccess' || binding.file !== path.join(appRoot, 'src/lib/adminAccess.ts')
        || nameOf(call.arguments[0]) !== nameOf(fn.parameters[0]?.name)) continue;
      const options = unwrap(call.arguments[2]);
      if (!options || !ts.isObjectLiteralExpression(options)) continue;
      const scope = options.properties.find(property => ['permission', 'permissions'].includes(nameOf(property.name)));
      const values = scope && capabilities(ts.isShorthandPropertyAssignment(scope) ? scope.name : scope.initializer, declarations);
      if (!values?.length) continue;
      const denial = statements[index + 1];
      const condition = denial && ts.isIfStatement(denial) ? unwrap(denial.expression) : null;
      if (!condition || !ts.isBinaryExpression(condition) || condition.operatorToken.kind !== ts.SyntaxKind.InstanceOfKeyword
        || nameOf(condition.left) !== declaration.name.text || nameOf(condition.right) !== 'NextResponse'
        || bindings.get('NextResponse')?.specifier !== 'next/server') continue;
      const denialStatements = ts.isBlock(denial.thenStatement) ? [...denial.thenStatement.statements] : [denial.thenStatement];
      const returned = denialStatements.at(-1);
      const responseDecorations = denialStatements.slice(0, -1).every(item => {
        if (ts.isForOfStatement(item) && !item.awaitModifier && ts.isVariableDeclarationList(item.initializer) && item.initializer.flags & ts.NodeFlags.Const && item.initializer.declarations.length === 1) {
          const names = item.initializer.declarations[0].name;
          const entries = unwrap(item.expression);
          if (!ts.isArrayBindingPattern(names) || names.elements.length !== 2 || !names.elements.every(element => ts.isBindingElement(element) && ts.isIdentifier(element.name) && !element.dotDotDotToken && !element.initializer)
            || !entries || !ts.isCallExpression(entries) || !ts.isPropertyAccessExpression(entries.expression) || entries.expression.name.text !== 'entries' || nameOf(entries.expression.expression) !== 'Object' || bindings.has('Object') || declarations.has('Object') || tree.statements.some(statement => nameOf(statement.name) === 'Object' || ts.isVariableStatement(statement) && statement.declarationList.declarations.some(declaration => nameOf(declaration.name) === 'Object') || ts.isImportDeclaration(statement) && nameOf(statement.importClause?.name) === 'Object') || entries.arguments.length !== 1) return false;
          const headerName = nameOf(entries.arguments[0]);
          if (!headerName || declarations.has(headerName)) return false;
          const headerDeclaration = tree.statements.filter(ts.isVariableStatement).flatMap(statement => statement.declarationList.flags & ts.NodeFlags.Const ? [...statement.declarationList.declarations] : []).find(declaration => nameOf(declaration.name) === headerName);
          const literal = unwrap(headerDeclaration?.initializer);
          if (!literal || !ts.isObjectLiteralExpression(literal) || !literal.properties.length || !literal.properties.every(property => ts.isPropertyAssignment(property) && nameOf(property.name) && ts.isStringLiteral(property.initializer))) return false;
          const body = ts.isBlock(item.statement) ? [...item.statement.statements] : [item.statement];
          if (body.length !== 1 || !ts.isExpressionStatement(body[0])) return false;
          const set = unwrap(body[0].expression), callee = set && ts.isCallExpression(set) && set.expression;
          return callee && ts.isPropertyAccessExpression(callee) && callee.name.text === 'set' && ts.isPropertyAccessExpression(callee.expression) && callee.expression.name.text === 'headers' && nameOf(callee.expression.expression) === declaration.name.text && set.arguments.length === 2 && set.arguments.every((argument, i) => nameOf(argument) === names.elements[i].name.text);
        }
        const decoration = ts.isExpressionStatement(item) && unwrap(item.expression);
        const callee = decoration && ts.isCallExpression(decoration) && decoration.expression;
        return callee && ts.isPropertyAccessExpression(callee) && callee.name.text === 'set'
          && ts.isPropertyAccessExpression(callee.expression) && callee.expression.name.text === 'headers' && nameOf(callee.expression.expression) === declaration.name.text
          && decoration.arguments.length === 2 && decoration.arguments.every(ts.isStringLiteral);
      });
      if (denial.elseStatement || !responseDecorations || !returned || !ts.isReturnStatement(returned) || nameOf(responseValue(returned.expression, tree, responseLocals)) !== declaration.name.text) continue;
      // Before admission permit only request-ID preparation, bounded capability
      // literals and structurally fail-closed header/cookie checks.
      const prefix = statements.slice(0, index);
      if (!prefix.every(statement => ts.isVariableStatement(statement) || failClosedCredentialCheck(statement, fn, bindings, appRoot, tree))) continue;
      const prefixCalls = prefix.filter(ts.isVariableStatement).flatMap(ownCalls);
      const safeCall = candidate => {
        const callee = candidate.expression;
        if (ts.isIdentifier(callee)) return callee.text === 'randomUUID' && bindings.get(callee.text)?.specifier === 'node:crypto';
        if (!ts.isPropertyAccessExpression(callee)) return false;
        const receiver = callee.expression;
        if (callee.name.text === 'get' && ts.isPropertyAccessExpression(receiver) && receiver.name.text === 'headers' && nameOf(receiver.expression) === nameOf(fn.parameters[0]?.name)) return true;
        if (candidate.arguments.length === 0 && (callee.name.text === 'now' && nameOf(receiver) === 'Date' || callee.name.text === 'random' && nameOf(receiver) === 'Math')) return true;
        if (callee.name.text === 'toString' && candidate.arguments.every(ts.isNumericLiteral) && ts.isCallExpression(receiver) && ts.isPropertyAccessExpression(receiver.expression)) {
          return receiver.expression.name.text === 'now' && nameOf(receiver.expression.expression) === 'Date' || receiver.expression.name.text === 'random' && nameOf(receiver.expression.expression) === 'Math';
        }
        return callee.name.text === 'slice' && candidate.arguments.every(ts.isNumericLiteral) && ts.isCallExpression(receiver) && ts.isPropertyAccessExpression(receiver.expression) && receiver.expression.name.text === 'toString' && safeCall(receiver);
      };
      if (!prefixCalls.every(safeCall)) continue;
      // A fail-closed precheck that explicitly claims Owner-only credentials
      // must be backed by the real active Owner predicate after shared admission.
      const immediateOwnerDenial = statements[index + 2];
      const ownerErrorClaim = immediateOwnerDenial && ts.isIfStatement(immediateOwnerDenial) && ownCalls(immediateOwnerDenial.thenStatement).some(candidate => ts.isIdentifier(candidate.expression) && bindings.get(candidate.expression.text)?.name === 'adminAccessError' && ts.isStringLiteral(candidate.arguments[1]) && candidate.arguments[1].text === 'OWNER_SESSION_REQUIRED');
      const ownerCredentialBoundary = ownerErrorClaim || prefix.some(item => ts.isIfStatement(item) && ownCalls(item.thenStatement).some(candidate => ts.isIdentifier(candidate.expression) && bindings.get(candidate.expression.text)?.name === 'adminAccessError' && ts.isStringLiteral(candidate.arguments[1]) && candidate.arguments[1].text === 'OWNER_SESSION_REQUIRED'));
      if (ownerCredentialBoundary) {
        const requestName = nameOf(fn.parameters[0]?.name);
        const requiredHeaders = ['authorization', 'x-api-key', 'x-backy-admin-key', 'x-backy-admin-session'];
        const headerRefusal = prefix.some(item => {
          if (!ts.isIfStatement(item)) return false;
          const predicate = unwrap(item.expression);
          if (!predicate || !ts.isCallExpression(predicate) || !ts.isPropertyAccessExpression(predicate.expression) || predicate.expression.name.text !== 'some' || !ts.isArrayLiteralExpression(predicate.expression.expression)) return false;
          const names = predicate.expression.expression.elements;
          if (!names.every(ts.isStringLiteral) || JSON.stringify(names.map(name => name.text).sort()) !== JSON.stringify(requiredHeaders) || predicate.arguments.length !== 1) return false;
          const callback = predicate.arguments[0], body = ts.isArrowFunction(callback) && unwrap(callback.body);
          return callback.parameters?.length === 1 && body && ts.isCallExpression(body) && ts.isPropertyAccessExpression(body.expression) && body.expression.name.text === 'has' && ts.isPropertyAccessExpression(body.expression.expression) && body.expression.expression.name.text === 'headers' && nameOf(body.expression.expression.expression) === requestName && body.arguments.length === 1 && nameOf(body.arguments[0]) === nameOf(callback.parameters[0].name);
        });
        const cookieRefusal = prefix.some(item => {
          if (!ts.isIfStatement(item)) return false;
          const predicate = unwrap(item.expression);
          if (!predicate || !ts.isPrefixUnaryExpression(predicate) || predicate.operator !== ts.SyntaxKind.ExclamationToken) return false;
          const trim = unwrap(predicate.operand), value = trim && ts.isCallExpression(trim) && ts.isPropertyAccessExpression(trim.expression) && trim.expression.name.text === 'trim' && trim.arguments.length === 0 && unwrap(trim.expression.expression);
          const get = value && ts.isPropertyAccessExpression(value) && value.name.text === 'value' && unwrap(value.expression);
          return get && ts.isCallExpression(get) && ts.isPropertyAccessExpression(get.expression) && get.expression.name.text === 'get' && ts.isPropertyAccessExpression(get.expression.expression) && get.expression.expression.name.text === 'cookies' && nameOf(get.expression.expression.expression) === requestName && get.arguments.length === 1 && ts.isStringLiteral(get.arguments[0]) && get.arguments[0].text === 'backy_admin_session';
        });
        if (!headerRefusal || !cookieRefusal) continue;
        const usage = options.properties.find(property => nameOf(property.name) === 'recordUsage');
        const ownerDenial = statements[index + 2];
        const predicate = ownerDenial && ts.isIfStatement(ownerDenial) && unwrap(ownerDenial.expression);
        const ownerCall = predicate && ts.isPrefixUnaryExpression(predicate) && predicate.operator === ts.SyntaxKind.ExclamationToken && unwrap(predicate.operand);
        if (!usage || !ts.isPropertyAssignment(usage) || usage.initializer.kind !== ts.SyntaxKind.FalseKeyword || !ownerCall || !ts.isCallExpression(ownerCall) || !ts.isIdentifier(ownerCall.expression) || bindings.get(ownerCall.expression.text)?.name !== 'isOwnerAdminSession' || bindings.get(ownerCall.expression.text)?.file !== path.join(appRoot, 'src/lib/adminAccess.ts') || ownerCall.arguments.length !== 1 || nameOf(ownerCall.arguments[0]) !== declaration.name.text || ownerDenial.elseStatement) continue;
        const ownerBody = ts.isBlock(ownerDenial.thenStatement) ? [...ownerDenial.thenStatement.statements] : [ownerDenial.thenStatement];
        const ownerReturn = ownerBody.length === 1 && ts.isReturnStatement(ownerBody[0]) && responseValue(ownerBody[0].expression, tree, responseLocals);
        if (!ownerReturn || !ts.isCallExpression(ownerReturn) || !ts.isIdentifier(ownerReturn.expression) || bindings.get(ownerReturn.expression.text)?.name !== 'adminAccessError' || bindings.get(ownerReturn.expression.text)?.file !== path.join(appRoot, 'src/lib/adminAccess.ts') || ownerReturn.arguments.length !== 4 || !ts.isNumericLiteral(ownerReturn.arguments[0]) || ownerReturn.arguments[0].text !== '403' || !ts.isStringLiteral(ownerReturn.arguments[1]) || ownerReturn.arguments[1].text !== 'OWNER_SESSION_REQUIRED' || !ts.isStringLiteral(ownerReturn.arguments[2]) || nameOf(ownerReturn.arguments[3]) !== 'requestId') continue;
      }
      return [...new Set(values)];
    }
  }
  return null;
}
function siteArgumentForwarded(fn, call, helper, parameterName = 'siteId') {
  const context = fn.parameters[1]?.name;
  const paramsSources = new Set(context && ts.isObjectBindingPattern(context) ? context.elements.filter(element => (nameOf(element.propertyName) || nameOf(element.name)) === 'params').map(element => nameOf(element.name)) : []);
  const isParams = node => {
    node = unwrap(node);
    return node && (ts.isIdentifier(node) && paramsSources.has(node.text) || ts.isPropertyAccessExpression(node) && node.name.text === 'params' && nameOf(node.expression) === nameOf(context));
  };
  const siteNames = new Set();
  for (const declaration of ownNodes(fn.body, ts.isVariableDeclaration)) {
    if (!isParams(declaration.initializer)) continue;
    if (ts.isIdentifier(declaration.name)) paramsSources.add(declaration.name.text);
    if (ts.isObjectBindingPattern(declaration.name)) for (const element of declaration.name.elements) if ((nameOf(element.propertyName) || nameOf(element.name)) === parameterName) siteNames.add(nameOf(element.name));
  }
  return call.arguments.slice(1).some((argument, index) => {
    const node = unwrap(argument);
    // A pure wrapper may forward its original context unchanged. Require the
    // receiving helper to actually consume that argument's params.siteId.
    if (ts.isIdentifier(context) && nameOf(node) === context.text && helper) {
      const helperContext = nameOf(helper.parameters[index + 1]?.name);
      if (!helperContext) return false;
      const helperParams = new Set(ownNodes(helper.body, ts.isVariableDeclaration).filter(declaration => {
        const value = unwrap(declaration.initializer);
        return value && ts.isPropertyAccessExpression(value) && value.name.text === 'params' && nameOf(value.expression) === helperContext;
      }).map(declaration => nameOf(declaration.name)).filter(Boolean));
      if (ownNodes(helper.body, ts.isPropertyAccessExpression).some(value => value.name.text === parameterName && helperParams.has(nameOf(value.expression)))) return true;
    }
    if ((parameterName !== 'siteId' || helper?.parameters.some(parameter => nameOf(parameter.name) === parameterName)) && nameOf(helper?.parameters[index + 1]?.name) !== parameterName) return false;
    if (isParams(node)) return true;
    if (ts.isIdentifier(node) && siteNames.has(node.text)) return true;
    if (ts.isPropertyAccessExpression(node) && node.name.text === parameterName && isParams(node.expression)) return true;
    return ts.isObjectLiteralExpression(node) && node.properties.some(property => ts.isSpreadAssignment(property) && isParams(property.expression));
  });
}

// Analyze each actual exported method. Delegates are resolved from imports, not route-name exceptions.
export function inspectAdminRoute({ file, source, appRoot, readSource = target => fs.readFileSync(target, 'utf8') }) {
  const tree = parse(file, source), funcs = functionMap(tree), bindings = imports(tree, file, appRoot);
  const routeMethods = tree.statements.filter(exported).flatMap(node => {
    if (ts.isFunctionDeclaration(node) && methods.has(node.name?.text)) return [{ method: node.name.text, fn: node }];
    if (ts.isVariableStatement(node)) return node.declarationList.declarations.filter(declaration => methods.has(nameOf(declaration.name))).map(declaration => {
      const value = unwrap(declaration.initializer);
      return { method: nameOf(declaration.name), fn: value && (ts.isArrowFunction(value) || ts.isFunctionExpression(value)) ? value : null };
    });
    return [];
  });
  return routeMethods.map(({method, fn}) => {
    if (!fn?.body || !ts.isBlock(fn.body)) return { method, guarded: false };
    if (directOrLocalGuard(fn, funcs, bindings, appRoot)) return { method, guarded: true, kind: 'direct-or-local' };
    const statements = [...fn.body.statements], returned = statements.at(-1);
    const call = returned && ts.isReturnStatement(returned) ? unwrap(returned.expression) : null;
    if (!call || !ts.isCallExpression(call) || !ts.isIdentifier(call.expression) || nameOf(call.arguments[0]) !== nameOf(fn.parameters[0]?.name)) return { method, guarded: false };
    // Wrappers may extract route params, but must not perform extra work or hide an unguarded branch.
    if (!statements.slice(0, -1).every(statement => ts.isVariableStatement(statement) && ownCalls(statement).length === 0) || ownCalls(fn.body).length !== 1) return { method, guarded: false };
    const binding = bindings.get(call.expression.text);
    if (!binding?.file || !binding.file.startsWith(path.join(appRoot, 'src/lib') + path.sep)) return { method, guarded: false };
    try {
      const helperTree = parse(binding.file, readSource(binding.file));
      const helper = functionMap(helperTree).get(binding.name);
      if (file.includes('[siteId]') && !siteArgumentForwarded(fn, call, helper)) return { method, guarded: false };
      const resourceParameters = [...file.matchAll(/\[([A-Za-z][A-Za-z0-9_]*)\]/g)].map(match => match[1]).filter(name => name !== 'siteId');
      // Canonically named positional resource arguments must stay aligned.
      // Generic definition/context delegates retain their existing site proof.
      const helperBindings=imports(helperTree,binding.file,appRoot);
      const ownerResource=helper && ownCalls(helper.body).some(candidate=>ts.isIdentifier(candidate.expression)&&helperBindings.get(candidate.expression.text)?.name==='isOwnerAdminSession'&&helperBindings.get(candidate.expression.text)?.file===path.join(appRoot,'src/lib/adminAccess.ts'));
      const requiredResources=resourceParameters.filter(name=>helper?.parameters.some(parameter=>nameOf(parameter.name)===name) || ownerResource && call.arguments.slice(1).some(argument=>ts.isIdentifier(argument)&&argument.text===name));
      if (requiredResources.some(name => !siteArgumentForwarded(fn, call, helper, name))) return { method, guarded: false };
      const values = helper && exported(helper) && guardedHelper(helper, imports(helperTree, binding.file, appRoot), appRoot, helperTree);
      return values ? { method, guarded: true, kind: 'delegated', helper: path.relative(appRoot, binding.file), function: binding.name, capabilities: values } : { method, guarded: false };
    } catch { return { method, guarded: false }; }
  });
}

export function scopedAccessCallEvidence(file, source) {
  const tree = parse(file, source);
  return children(tree, ts.isCallExpression).filter(call => nameOf(call.expression) === 'requireAdminAccess').flatMap(call => {
    const options = unwrap(call.arguments[2]);
    if (!options || !ts.isObjectLiteralExpression(options)) return [];
    const scope = options.properties.find(property => ['permission', 'permissions'].includes(nameOf(property.name)));
    let parent = call.parent;
    while (parent && !ts.isFunctionDeclaration(parent) && !ts.isArrowFunction(parent) && !ts.isFunctionExpression(parent)) parent = parent.parent;
    const values = scope && capabilities(ts.isShorthandPropertyAssignment(scope) ? scope.name : scope.initializer, constDeclarations(parent?.body || tree));
    return values?.length ? [{ index: call.getStart(tree), capabilities: [...new Set(values)] }] : [];
  });
}
