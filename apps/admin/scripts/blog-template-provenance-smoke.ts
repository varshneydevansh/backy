import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { normalizeSavedCanvasContent } from '../src/components/editor/editorCatalog';
import { resolveFrontendTemplateProvenance } from '../src/lib/frontendTemplateProvenance';

const source = readFileSync(new URL('../src/routes/blog.$postId.tsx', import.meta.url), 'utf8');
const ast = ts.createSourceFile('blog.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
let calculation: ts.VariableDeclaration | undefined;
let handoff: ts.Expression | undefined;
const dependencies: string[] = [];
const visit = (node: ts.Node) => {
  if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name)) {
    if (node.name.text === 'frontendDesignTemplate') calculation = node;
    if (['getMetaString', 'getMetaRecord', 'getMetaArray', 'isRecord'].includes(node.name.text)) {
      dependencies.push(`const ${node.getText(ast)};`);
    }
  }
  if (ts.isPropertyAssignment(node) && node.name.getText(ast) === 'template'
    && ts.isConditionalExpression(node.initializer)
    && node.initializer.condition.getText(ast) === 'hasFrontendDesignTemplate'
    && node.initializer.getText(ast).includes('frontendDesignTemplate.chrome')) handoff = node.initializer;
  ts.forEachChild(node, visit);
};
visit(ast);
assert(calculation?.initializer && handoff, 'Execute the real blog template calculation and handoff branch');
const executable = ts.transpileModule(`${dependencies.join('\n')}
const frontendDesignTemplate = ${calculation.initializer.getText(ast)};
const hasFrontendDesignTemplate = frontendDesignTemplate.id.length > 0;
return { template: frontendDesignTemplate, handoff: ${handoff.getText(ast)} };`, {
  compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.None },
}).outputText;
const run = new Function('post', 'savedDesignMetadata', 'savedContentDocument', 'publicPath', 'resolveFrontendTemplateProvenance', executable);
const provenance = {
  templateSource: 'custom-frontend',
  frontendDesignTemplateId: 'registered-blogPost', frontendDesignTemplateName: 'Registered blogPost',
  frontendDesignRoutePattern: '/blog/{slug}', frontendDesignSource: { type: 'manual', extension: [false, 0, null] },
  frontendDesignChrome: { header: 'retained' }, frontendDesignTokens: { colors: { primary: '#123456' } },
  frontendDesignCustomCss: '.authored { color: var(--primary) }',
  frontendDesignBindingHints: [{ path: 'heading.title', extension: { editable: true } }],
};
let checks = 0;
function checkPost(post: { meta?: Record<string, unknown>; content: string }, expectedId = provenance.frontendDesignTemplateId) {
  const before = JSON.stringify(post);
  const saved = normalizeSavedCanvasContent(post.content);
  const result = run(post, saved.metadata, saved.contentDocument, '/blog/article', resolveFrontendTemplateProvenance);
  assert.equal(result.template.id, expectedId);
  assert.equal(result.handoff.id, expectedId);
  assert.equal(result.template.name, provenance.frontendDesignTemplateName);
  assert.deepEqual(result.handoff.bindingHints, provenance.frontendDesignBindingHints);
  assert.deepEqual(result.handoff.chrome, provenance.frontendDesignChrome);
  assert.deepEqual(result.handoff.tokens, provenance.frontendDesignTokens);
  assert.equal(result.handoff.customCss, provenance.frontendDesignCustomCss);
  assert.deepEqual(result.handoff.source, provenance.frontendDesignSource);
  assert.equal(JSON.stringify(post), before, 'Reading provenance never rewrites content/meta/unknown author fields');
  checks += 9;
}
checkPost({ meta: provenance, content: JSON.stringify({ elements: [], canvasSize: { width: 1200, height: 800 } }) });
checkPost({ meta: { title: 'SEO only' }, content: JSON.stringify({ elements: [], metadata: provenance }) });
const document = { schemaVersion: 'backy.content.v1', id: 'article', kind: 'blogPost', elements: [], editableMap: {}, metadata: provenance };
checkPost({ meta: { title: 'SEO only' }, content: JSON.stringify({ contentDocument: document, metadata: { ownerExtension: [false, 0] } }) });
checkPost({ meta: { ...provenance, frontendDesignTemplateId: 'explicit-meta' }, content: JSON.stringify({ contentDocument: document, metadata: { ...provenance, frontendDesignTemplateId: 'wrapper-conflict' } }) }, 'explicit-meta');
const noTemplate = run({meta:{title:'SEO only'},content:'Legacy article'}, undefined, undefined, '/blog/article', resolveFrontendTemplateProvenance);
assert.equal(noTemplate.template.id, '');
assert.equal(noTemplate.handoff.id, 'backy-blog-editor');
const explicitEmpty = resolveFrontendTemplateProvenance({ frontendDesignTemplateId: '', frontendDesignBindingHints: [] }, provenance, provenance);
assert.equal(explicitEmpty.id, '', 'Explicit empty meta remains authoritative');
assert.deepEqual(explicitEmpty.bindingHints, []);
assert.equal(resolveFrontendTemplateProvenance({frontendDesignTemplateId:123}, provenance).id, provenance.frontendDesignTemplateId);
checks += 5;
console.log(`Blog template provenance PASS ${checks} actual-route calculation/handoff assertions; meta priority, SEO-only root/document metadata, unknown values and legacy fallback retained. No browser/API mutation.`);
