/** Actual parent-editor preview receivers, isolated from browser/editor engines. */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import ts from 'typescript';
import React from 'react';

const require = createRequire(import.meta.url);
const protocol = 'backy.interactive-component.v1';
const componentKey = 'fixture.recovery';
const version = '1.0.0';
let checks = 0;

function declarations(relative, names) {
  const source = readFileSync(new URL(relative, import.meta.url), 'utf8');
  const ast = ts.createSourceFile(relative, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const found = ast.statements.filter(node =>
    (ts.isFunctionDeclaration(node) && names.includes(node.name?.text)) ||
    (ts.isVariableStatement(node) && node.declarationList.declarations.some(item => names.includes(item.name.getText(ast)))));
  assert.equal(found.length, names.length, 'Every receiver/helper must come from the actual source');
  return found.map(node => node.getText(ast)).join('\n');
}

function preview(kind) {
  const hooks = [], listeners = new Set(), sent = [], timers = new Map();
  let cursor = 0, effects = [], nextTimer = 0;
  const frame = { postMessage(payload) { sent.push(payload); } };
  const same = (left, right) => left && right && left.length === right.length && left.every((value, index) => Object.is(value, right[index]));
  const react = {
    ...React,
    useState(initial) {
      const index = cursor++;
      hooks[index] ??= { value: typeof initial === 'function' ? initial() : initial };
      return [hooks[index].value, next => { hooks[index].value = typeof next === 'function' ? next(hooks[index].value) : next; }];
    },
    useRef(initial) {
      const index = cursor++;
      hooks[index] ??= { value: { current: initial === null ? { contentWindow: frame } : initial } };
      return hooks[index].value;
    },
    useMemo(callback, deps) {
      const index = cursor++;
      if (!same(hooks[index]?.deps, deps)) hooks[index] = { deps, value: callback() };
      return hooks[index].value;
    },
    useEffect(callback, deps) {
      const index = cursor++;
      if (!same(hooks[index]?.deps, deps)) {
        hooks[index]?.cleanup?.();
        hooks[index] = { deps };
        effects.push(() => { hooks[index].cleanup = callback(); });
      }
    },
  };
  react.useCallback = (callback, deps) => react.useMemo(() => callback, deps);
  const window = {
    location: { origin: 'http://fixture.invalid' },
    setTimeout(callback, delay) { const id = ++nextTimer; timers.set(id, { callback, delay }); return id; },
    clearTimeout(id) { timers.delete(id); },
    addEventListener(type, callback) { if (type === 'message') listeners.add(callback); },
    removeEventListener(type, callback) { if (type === 'message') listeners.delete(callback); },
  };
  const name = kind === 'canvas' ? 'AdminInteractiveSandboxPreview' : 'SandboxPreview';
  const actual = kind === 'canvas'
    ? declarations('../src/components/editor/Canvas.tsx', [
      'sanitizeText', 'isRecord', 'INTERACTIVE_IFRAME_SANDBOX_TOKENS', 'IFRAME_LOADING_VALUES',
      'normalizeInteractiveIframeSandbox', 'normalizeInteractiveIframeAllow', 'interactiveIframeUsesOpaqueOrigin',
      'normalizeIframeLoading', 'buildAdminInteractiveSandboxPayload', name,
    ])
    : declarations('../src/lib/blogAuthoringInteractive.ts', ['blogInteractiveInitPayload']) + '\n' + declarations('../src/lib/BlogInteractivePreview.tsx', [name]);
  const source = `import React, {useState,useRef,useCallback,useEffect,useMemo} from 'react';\n${actual}\nexport {${name}};`;
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText;
  const exports = {};
  vm.runInNewContext(compiled, { exports, module: { exports }, window, URL, console, require: id => id === 'react' ? react : require(id) });
  const element = { id: 'preview', type: 'codeComponent', componentKey, version, props: { count: 0 }, fallback: { title: 'Authored fallback', text: 'Failure explanation' } };
  const props = kind === 'canvas' ? { element, componentKey, version, src: '/fixture/sandbox', fallback: element.fallback, renderCapabilities: {} } : { node: element, src: '/fixture/sandbox' };
  const render = () => {
    cursor = 0; effects = [];
    const result = exports[name](props);
    for (const effect of effects) effect();
    for (const [id, timer] of timers) if (timer.delay === 0) { timers.delete(id); timer.callback(); }
    return result;
  };
  const dispatch = (type, patch = {}, source = frame) => {
    for (const listener of [...listeners]) listener({ source, data: { protocol, componentKey, version, type, ...patch } });
    return render();
  };
  const update = () => {
    if (kind === 'canvas') props.element = { ...props.element, props: { count: 9 } };
    else props.node = { ...props.node, props: { count: 9 } };
    return render();
  };
  return { render, dispatch, update, sent, frame };
}

const visibleText = node => (Array.isArray(node) ? node.map(visibleText).join(' ') : typeof node === 'string' ? node : node?.props ? visibleText(node.props.children) : '').trim();
const failures = [];
for (const kind of ['canvas', 'blog']) {
  try {
    const fixture = preview(kind);
    fixture.render(); fixture.dispatch('backy.interactive-component.ready');
    const failed = fixture.dispatch('backy.interactive-component.error', { message: 'Synthetic update failure' });
    const failureText = visibleText(failed);
    assert.match(failureText, kind === 'canvas' ? /Synthetic update failure/ : /registered component could not start/); checks++;
    let output = fixture.update();
    assert.equal(visibleText(output), failureText, 'Editing props cannot itself declare successful recovery'); checks++;
    assert.equal(fixture.sent.at(-1).props.count, 9, 'Actual receiver sends updated props without replacing its iframe'); checks++;
    output = fixture.dispatch('backy.interactive-component.resize', { height: 600 });
    assert.equal(visibleText(output), failureText, 'Resize during failure cannot clear the diagnostic'); checks++;
    for (const [patch, source] of [[{ componentKey: '' }, fixture.frame], [{ version: '' }, fixture.frame], [{ version: '2.0.0' }, fixture.frame], [{ protocol: 'foreign' }, fixture.frame], [{}, {}]]) {
      output = fixture.dispatch('backy.interactive-component.rendered', patch, source);
      assert.equal(visibleText(output), failureText, 'Completion requires the current frame and exact protocol/key/version'); checks++;
    }
    const before = fixture.sent.length;
    output = fixture.dispatch('backy.interactive-component.rendered');
    assert.equal(visibleText(output), kind === 'canvas' ? 'Sandbox preview ready.' : '', `${kind}: successful same-frame update must remove the preceding visible error`); checks++;
    assert.equal(fixture.sent.length, before, 'Completion must not replay init or start an update loop'); checks++;
    output = fixture.dispatch('backy.interactive-component.error', { message: 'Second update failure' });
    const secondFailure = visibleText(output);
    assert.match(secondFailure, kind === 'canvas' ? /Second update failure/ : /registered component could not start/); checks++;
    output = fixture.dispatch('backy.interactive-component.ready');
    assert.equal(visibleText(output), secondFailure, 'Import readiness does not prove recovery from a failed update'); checks++;
  } catch (error) { failures.push(error); console.error(`${kind} receiver regression: ${error.message}`); }
}
assert.equal(failures.length, 0, `${failures.length} parent-editor receiver regressions failed`);
console.log(`Actual canvas/blog sandbox preview receivers passed ${checks} assertions: props-update recovery, retained failure until completion, exact identity/window scope, no init replay, and later failure retention. Source harness only; controlled writer remount and browser acceptance are separate.`);
