/** Execute the actual Sites callsite admission and render the actual Users capability copy. */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import ts from 'typescript';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { adminPermissionRule } from '../src/lib/adminPermissionUi';
const require = createRequire(import.meta.url);
const source = readFileSync(new URL('../src/routes/sites.$siteId.tsx', import.meta.url), 'utf8');
const ast = ts.createSourceFile('site.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
let element: ts.JsxSelfClosingElement | undefined;
const visit = (node: ts.Node) => { if (ts.isJsxSelfClosingElement(node) && node.tagName.getText(ast) === 'VisitorMembersPanel') element = node; ts.forEachChild(node, visit); }; visit(ast);
assert.ok(element);
const compiled = ts.transpileModule('exports.view=()=>(' + element.getText(ast) + ');', { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 } }).outputText;
let checks = 0;
const check = (condition: unknown, label: string) => { assert.ok(condition, label); checks++; };
const matrix = { userId: 'owner', role: 'owner', status: 'active', groups: [{ permissions: [{ key: 'users.view', allowed: true }] }] };
function admission(patch: Record<string, any> = {}) {
  const exports: any = {}, captured: any[] = [];
  vm.runInNewContext(compiled, { exports, require, Date, JSON, Boolean, adminPermissionRule, VisitorMembersPanel: (props: any) => { captured.push(props); return React.createElement('span', null, 'Actual visitor rows'); }, siteApiId: 'site-fixture', canConfigureSite: true,
    visitorReviewSession: { issuedAt: '2026-10-11T00:00:00Z', expiresAt: new Date(Date.now() + 60_000).toISOString() }, isPermissionsLoading: false, permissionError: null, currentAdmin: { id: 'owner', role: 'owner' }, permissionMatrix: matrix, ...patch });
  renderToStaticMarkup(exports.view()); return captured[0];
}
check(admission().canReviewPrivacy === true, 'Current active Owner with exact admitted users.view has a review action');
for (const [label, patch] of [
  ['missing session', { visitorReviewSession: null }], ['expired session', { visitorReviewSession: { expiresAt: '2020-01-01T00:00:00Z' } }], ['loading permissions', { isPermissionsLoading: true }], ['permission failure', { permissionError: 'Unable to restore' }],
  ['nonowner', { currentAdmin: { id: 'owner', role: 'admin' } }], ['foreign actor matrix', { permissionMatrix: { ...matrix, userId: 'other' } }], ['nonowner matrix', { permissionMatrix: { ...matrix, role: 'admin' } }], ['suspended owner', { permissionMatrix: { ...matrix, status: 'suspended' } }],
  ['missing matrix', { permissionMatrix: null }], ['denied override', { permissionMatrix: { ...matrix, groups: [{ permissions: [{ key: 'users.view', allowed: false }] }] } }],
] as const) check(admission(patch).canReviewPrivacy === false, `Actual callsite fails closed for ${label}`);
check(admission({ siteApiId: 'other-site' }).siteId === 'other-site', 'Exact canonical selected site is passed to rows');
check(admission({ canConfigureSite: false }).canConfigure === false, 'Existing inventory sites.configure boundary preserved');
check(admission({ currentAdmin: { id: 'other', role: 'owner' }, permissionMatrix: { ...matrix, userId: 'other' } }).privacyContextKey !== admission().privacyContextKey, 'Actor replacement invalidates review context');
check(admission({ permissionMatrix: { ...matrix, groups: [{ permissions: [{ key: 'users.view', allowed: true, reason: 'changed override' }] }] } }).privacyContextKey !== admission().privacyContextKey, 'Permission override changes invalidate context');
const users = readFileSync(new URL('../src/routes/users.tsx', import.meta.url), 'utf8'), tree = ts.createSourceFile('users.tsx', users, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
let paragraph: ts.JsxElement | undefined;
const scan = (node: ts.Node) => { if (ts.isJsxElement(node) && node.openingElement.tagName.getText(tree) === 'p' && node.getText(tree).includes('Visitor register, login')) paragraph = node; ts.forEachChild(node, scan); }; scan(tree); assert.ok(paragraph);
const exports: any = {}; vm.runInNewContext(ts.transpileModule('exports.view=()=>(' + paragraph.getText(tree) + ');', { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText, { exports, require });
const html = renderToStaticMarkup(exports.view()); check(html.includes('request-email-change') && html.includes('confirm-email-change'), 'Actual rendered Users account boundary names both email-change operations');
const systems = tree.statements.find(n => ts.isVariableStatement(n) && n.declarationList.declarations.some(d => d.name.getText(tree) === 'MEMBERSHIP_FLOW_SYSTEMS'))!;
const systemsExport: any = {}; vm.runInNewContext(ts.transpileModule(systems.getText(tree) + '\nexports.value=MEMBERSHIP_FLOW_SYSTEMS;', { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, { exports: systemsExport });
const detail = systemsExport.value.find((v: any) => v.key === 'supabase-auth').detail;
check(renderToStaticMarkup(React.createElement('p', null, detail)).includes('request-email-change') && detail.includes('confirm-email-change'), 'Actual visible Users system detail names both operations');
console.log(JSON.stringify({ ok: true, checks, boundary: 'Actual callsite expression and Users copy rendering; no network or deployment proof.' }));
