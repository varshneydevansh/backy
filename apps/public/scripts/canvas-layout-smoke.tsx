import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import * as backyCore from '@backy-cms/core';
import { adaptBackyFluidCanvasElements, resolveBackyCanvasViewport } from '@backy-cms/core';
import { applyResponsiveOverrides, PageRenderer, type CanvasElement, type PageContent } from '../src/components/PageRenderer';

const roots = [
  { id: 'header', type: 'header', x: 0, y: 0, width: 1200, height: 88, locked: true,
    props: { backgroundColor: '#f0f0f0', unknown: { keep: true } }, responsive: { mobile: { width: 375, height: 144 } }, children: [
      { id: 'brand', type: 'heading', x: 72, y: 24, width: 360, height: 40, props: { content: 'Brand', fontSize: 28 }, responsive: { mobile: { x: 24, width: 240 } } },
    ] },
  { id: 'article', type: 'section', x: 200, y: 120, width: 800, height: 640, props: {}, children: [
    { id: 'body', type: 'paragraph', x: 0, y: 0, width: 720, height: 600, props: { content: 'Authored article', fontSize: 18 } },
  ] },
  { id: 'footer', type: 'footer', x: 0, y: 800, width: 1200, height: 120, props: {}, children: [] },
] as unknown as CanvasElement[];
const original = JSON.stringify(roots);
const wide = resolveBackyCanvasViewport({ width: 1200, layout: 'fluid' }, 1970);
assert.deepEqual(wide, { layout: 'fluid', gutter: 0, authoredWidth: 1200, width: 1970, scale: 1 });
const adapted = adaptBackyFluidCanvasElements(roots, wide.authoredWidth, wide.width);
assert.equal(adapted[0].width, 1970);
assert.equal(adapted[0].x, 0);
assert.equal(adapted[0].children![0].x, 457);
assert.equal(adapted[0].children![0].width, 360);
assert.equal(adapted[0].children![0].props.fontSize, 28, 'Fluid width cannot enlarge text');
assert.equal(adapted[1].x, 585);
assert.equal(adapted[1].width, 800, 'Reading columns retain authored width');
assert.equal(adapted[1].children![0].x, 0, 'Moving a reading column must not move its children again');
assert.equal(adapted[1].children![0].props.fontSize, 18);
assert.equal(adapted[2].width, 1970);
assert.equal(adapted[0].locked, true);
assert.deepEqual(adapted[0].props.unknown, { keep: true });
assert.equal(JSON.stringify(roots), original, 'Viewport adaptation never changes saved trees');
assert.equal(resolveBackyCanvasViewport({ width: 1200 }, 1970).width, 1200, 'Existing unspecified designs stay fixed');
assert.equal(resolveBackyCanvasViewport({ width: 1200, layout: 'fixed' }, 1970).scale, 1);
const narrow = resolveBackyCanvasViewport({ width: 375, layout: 'fluid' }, 320);
assert.equal(narrow.width, 375);
assert.equal(narrow.scale, 320 / 375);
assert.equal(narrow.gutter, 0);
assert.equal(adaptBackyFluidCanvasElements(roots, 375, narrow.width), roots, 'Narrow screens keep existing downscale geometry');
assert.equal(resolveBackyCanvasViewport({ width: 375 }, 280).scale, 256 / 375, 'Small viewports must not be forced up to 320 and clipped');
const mobile = applyResponsiveOverrides(roots, 'mobile');
const mobileAdapted = adaptBackyFluidCanvasElements(mobile, 375, 414);
assert.equal(mobileAdapted[0].height, 144);
assert.equal(mobileAdapted[0].width, 414);
assert.equal(mobileAdapted[0].children![0].x, 43.5);
assert.equal(mobileAdapted[0].children![0].width, 240, 'Breakpoint overrides are resolved before fluid positioning');
const render = (content: PageContent) => renderToStaticMarkup(<PageRenderer content={content} />);
const fluidHtml = render({ elements: roots, canvasSize: { width: 1200, height: 1000, layout: 'fluid' } });
assert(fluidHtml.includes('data-backy-canvas-layout="fluid"'));
assert(fluidHtml.includes('padding:0'));
assert(fluidHtml.includes('data-backy-render-scale="1.000"'));
assert(fluidHtml.includes('font-size:28px'));
assert.equal(JSON.stringify(roots), original, 'SSR also preserves caller-owned data');
const fixedHtml = render({ elements: roots, canvasSize: { width: 1200, height: 1000 } });
assert(fixedHtml.includes('data-backy-canvas-layout="fixed"'));
assert(fixedHtml.includes('padding:12px'));
const canonicalHtml = render({ elements: [], contentDocument: { schemaVersion: 'backy.content-document.v1', elements: roots,
  metadata: { canvasSize: { width: 1200, height: 1000, layout: 'fluid' } } } } as unknown as PageContent);
assert(canonicalHtml.includes('data-backy-canvas-layout="fluid"'), 'Canonical metadata supplies the same hosted mode contract');

// Exercise the actual private hosted projections without mounting Next routes or
// contacting a site. Only binding resolution is inert; geometry code is unchanged.
function hostedProjection(path: string, name: string) {
  const filename = fileURLToPath(new URL(path, import.meta.url));
  const source = ts.createSourceFile(filename, readFileSync(filename, 'utf8'), ts.ScriptTarget.Latest, true, filename.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const statement = source.statements.find((statement) => ts.isFunctionDeclaration(statement) && statement.name?.text === name
    || ts.isVariableStatement(statement) && statement.declarationList.declarations.some((declaration) => ts.isIdentifier(declaration.name) && declaration.name.text === name));
  assert(statement, `Missing hosted projection ${name}`);
  const code = ts.transpileModule(`${statement.getFullText(source)}\nexport { ${name} };`, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const module = { exports: {} as Record<string, (...args: any[]) => any> };
  new Function('module', 'exports', 'resolveElementDataBindings', 'isRecord', 'asString', 'clone', code)(module, module.exports,
    (_site: string, elements: unknown[]) => elements, (value: unknown) => !!value && typeof value === 'object' && !Array.isArray(value),
    (value: unknown) => typeof value === 'string' ? value : '', (value: unknown) => JSON.parse(JSON.stringify(value)));
  return module.exports[name];
}
const hostedSize = { width: 1200, height: 1000, layout: 'fluid', extension: { keep: true } };
for (const [path, name, record] of [
  ['../src/app/sites/[subdomain]/[[...path]]/page.tsx', 'repositoryPageContentWithContext', { siteId: 'fixture', content: { elements: roots, metadata: { canvasSize: hostedSize } } }],
  ['../src/app/sites/[subdomain]/blog/[slug]/page.tsx', 'normalizeRepositoryPostContentWithContext', { siteId: 'fixture', content: { elements: roots, metadata: { canvasSize: hostedSize } } }],
] as const) {
  const projected = hostedProjection(path, name)(record);
  assert.deepEqual(projected.canvasSize, hostedSize);
  assert(render(projected).includes('data-backy-canvas-layout="fluid"'), `${name} must deliver the same hosted width mode`);
}
const demoPost = hostedProjection('../src/app/sites/[subdomain]/blog/[slug]/page.tsx', 'normalizePostContent')('fixture', { content: { elements: roots, canvasSize: hostedSize } });
assert.deepEqual(demoPost.canvasSize, hostedSize);
assert(render(demoPost).includes('data-backy-canvas-layout="fluid"'));
const archive = hostedProjection('../src/lib/blogArchiveTemplate.ts', 'canvasFromContent')({ elements: roots, canvasSize: hostedSize });
assert.deepEqual(archive.canvasSize, hostedSize);
assert(render(archive).includes('data-backy-canvas-layout="fluid"'));
// The documented render and manifest shape accepts the explicit mode and keeps
// additional geometry fields; imported unspecified mode is still valid.
const contractSchema = JSON.parse(readFileSync(resolve(fileURLToPath(new URL('../../../specs/ai-frontend-contract/content-payload.schema.json', import.meta.url))), 'utf8'));
const findLayout = (value: unknown): unknown => {
  if (!value || typeof value !== 'object') return;
  const object = value as Record<string, any>;
  if (object.canvasSize?.properties?.layout) return object.canvasSize.properties.layout;
  for (const child of Object.values(object)) { const result = findLayout(child); if (result) return result; }
};
assert.deepEqual((findLayout(contractSchema) as any).enum, ['fixed', 'fluid']);

// Run the real Backy starter through catalog defaults and site chrome. Generated
// ids are inert here; no geometry/default/responsive implementation is mocked.
function authoringGeometryModule(path: string, imports: Record<string, unknown>) {
  const filename = fileURLToPath(new URL(path, import.meta.url));
  const code = ts.transpileModule(readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const module = { exports: {} as Record<string, any> };
  new Function('require', 'module', 'exports', code)((name: string) => {
    assert(Object.prototype.hasOwnProperty.call(imports, name), `Unexpected authoring dependency ${name}`);
    return imports[name];
  }, module, module.exports);
  return module.exports;
}
let fixtureId = 0;
const catalog = authoringGeometryModule('../../admin/src/components/editor/editorCatalog.ts', {
  '@/lib/utils': { generateId: () => `fixture-${++fixtureId}` }, '@backy-cms/core': backyCore,
});
const chrome = authoringGeometryModule('../../admin/src/lib/editorTemplateChrome.ts', {
  '@/components/editor/editorCatalog': catalog,
});
const starterFilename = fileURLToPath(new URL('../../admin/src/routes/blog.new.tsx', import.meta.url));
const starterSource = ts.createSourceFile(starterFilename, readFileSync(starterFilename, 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const starterDeclaration = starterSource.statements.find((statement) => ts.isVariableStatement(statement)
  && statement.declarationList.declarations.some((declaration) => ts.isIdentifier(declaration.name) && declaration.name.text === 'createInitialBlogElements'));
assert(starterDeclaration, 'The real Backy article starter must be available for responsive verification');
const starterCode = ts.transpileModule(`${starterDeclaration.getFullText(starterSource)}\nexport { createInitialBlogElements };`, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const starterModule = { exports: {} as Record<string, () => CanvasElement[]> };
new Function('module', 'exports', 'createCanvasElement', 'DEFAULT_CANVAS_SIZE', 'withPageChrome', starterCode)(
  starterModule, starterModule.exports, catalog.createCanvasElement, catalog.DEFAULT_CANVAS_SIZE, chrome.withPageChrome,
);
const starter = starterModule.exports.createInitialBlogElements();
const starterSnapshot = JSON.stringify(starter);
const findBounds = (elements: CanvasElement[], id: string, parentX = 0): { x: number; width: number } | undefined => {
  for (const element of elements) {
    const x = parentX + element.x;
    if (element.id === id) return { x, width: element.width };
    const nested = element.children && findBounds(element.children, id, x);
    if (nested) return nested;
  }
};
const articleIds = ['blog-article-kicker', 'blog-article-heading', 'blog-article-excerpt', 'blog-article-cover', 'blog-article-lede', 'blog-article-quote'];
for (const [breakpoint, authoredWidth, viewportWidth] of [['mobile', 375, 320], ['tablet', 768, 768]] as const) {
  const viewport = resolveBackyCanvasViewport({ width: authoredWidth, layout: 'fluid' }, viewportWidth);
  const resolved = adaptBackyFluidCanvasElements(applyResponsiveOverrides(starter, breakpoint), authoredWidth, viewport.width);
  for (const id of articleIds) {
    const bounds = findBounds(resolved, id);
    assert(bounds, `Missing ${id} in the actual starter`);
    assert(bounds.x * viewport.scale >= 0 && (bounds.x + bounds.width) * viewport.scale <= viewportWidth,
      `${id} must fit the ${viewportWidth}px viewport after nested positioning and canvas scale; got x=${bounds.x}, width=${bounds.width}, scale=${viewport.scale}`);
  }
  const body = findBounds(resolved, 'blog-article-lede')!;
  assert.equal(body.x, breakpoint === 'mobile' ? 20 : 48, 'Body placement must be explicit rather than inherit desktop x=220');
  assert.equal(body.width, breakpoint === 'mobile' ? 335 : 672, 'Rich text and figures use the same fitted article width');
  const hero = resolved.find((element) => element.id === 'blog-article-hero')!;
  const bodySection = resolved.find((element) => element.id === 'blog-article-body')!;
  assert(bodySection.y >= hero.y + hero.height, 'The article body must follow the responsive hero');
  const cover = hero.children!.find((element) => element.id === 'blog-article-cover')!;
  assert(cover.y + cover.height <= hero.height, 'The cover must fit inside the responsive hero');
  if (breakpoint === 'mobile') {
    const excerpt = hero.children!.find((element) => element.id === 'blog-article-excerpt')!;
    assert(cover.y >= excerpt.y + excerpt.height, 'The mobile cover must follow the excerpt without overlapping it');
  }
}
const wideStarter = adaptBackyFluidCanvasElements(starter, 1200, 1600);
assert.deepEqual(findBounds(wideStarter, 'blog-article-lede'), { x: 420, width: 760 }, 'Wide fluid article keeps its centered 760px reading width');
assert.deepEqual(findBounds(wideStarter, 'blog-article-quote'), { x: 460, width: 680 }, 'Wide quote keeps its authored reading width');
assert.equal(JSON.stringify(starter), starterSnapshot, 'Responsive verification must not rewrite saved or custom geometry');
console.log('Canvas layout: fixed compatibility, wide fluid backgrounds/reading widths/fonts, narrow viewport fit, breakpoint-first adaptation, immutable geometry and actual PageRenderer SSR contract passed.');
