import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import core from '@backy-cms/core';
const { inheritRegisteredFrontendChrome, selectDefaultFrontendDesignTemplate } = core;
import contractModule from '../src/lib/frontendDesignContract';
const { normalizeFrontendDesignContract, seedInputFromFrontendDesignTemplate, seedCollectionRecordInputFromFrontendDesignTemplate } = contractModule;

// The demo store persists relative to cwd. Keep every fixture in disposable local storage.
const cwd = process.cwd();
const fixtureDirectory = mkdtempSync(join(tmpdir(), 'backy-template-inheritance-'));
process.chdir(fixtureDirectory);
try {
  const storeModule = await import('../src/lib/backyStore');
  const store = storeModule.default || storeModule;
  const renderModule = await import('../src/lib/renderPayload');
  const { buildPublicRenderPayload, buildPublicBlogPostRenderPayload, buildPublicCollectionItemRenderPayload } = renderModule.default || renderModule;
  const body = [{ id: 'article-layout', type: 'section', x: 0, y: 0, width: 1200, height: 600,
    responsive: { mobile: { y: 0, width: 375, height: 760 } }, children: [
      { id: 'title', type: 'heading', x: 30, y: 30, width: 900, height: 80, props: { content: 'Placeholder', binding: 'post.title' } },
      { id: 'fixed-heading', type: 'heading', x: 30, y: 110, width: 900, height: 40, props: { content: 'Evidence and context' } },
      { id: 'faq', type: 'accordion', x: 30, y: 160, width: 900, height: 120,
        props: { items: [{ title: 'How it works', content: 'Registered JSON controls the frontend renderer.' }], customProp: 'preserve' } },
      { id: 'figure', type: 'codeComponent', x: 30, y: 290, width: 500, height: 100,
        componentKey: 'fixture.chart', props: { componentKey: 'fixture.chart', count: 12, fallback: { text: 'Static chart' } },
        controls: [{ key: 'count', type: 'number', min: 1, max: 20 }] },
      { id: 'audio', type: 'audio', x: 30, y: 410, width: 500, height: 100, props: { src: 'https://example.com/report.mp3', caption: 'Report audio' } },
    ], props: {} }];
  const chrome = {
    header: { id: 'registered-header', type: 'header', x: 0, y: 0, width: 1200, height: 100,
      responsive: { mobile: { y: 0, width: 375, height: 140 } }, props: { chromeRole: 'site.header' },
      children: [{ id: 'brand', type: 'heading', props: { content: 'Fixture brand' } }] },
    footer: { id: 'registered-footer', type: 'footer', x: 0, y: 0, width: 1200, height: 80,
      responsive: { mobile: { y: 0, width: 375, height: 100 } }, props: { chromeRole: 'site.footer' } },
  };
  const design = normalizeFrontendDesignContract({ schemaVersion: 'backy.frontend-design.v1', status: 'synced', source: { type: 'custom-frontend' },
    tokens: { fonts: { body: 'Fixture Serif', mono: 'Fixture Mono' }, motion: { duration: { normal: '220ms' } } }, chrome,
    templates: [
      { id: 'article', type: 'blogPost', name: 'Article', isDefault: true, status: 'active', content: { elements: body, canvasSize: { width: 1200, height: 600, layout: 'fluid', geometryExtra: 'kept' }, animations: { enter: 'fade' }, assets: { fonts: [{ id: 'fixture-font' }] } } },
      { id: 'page', type: 'page', name: 'Page', isDefault: true, canvasSize: { width: 1200, height: 600, layout: 'fluid', geometryExtra: 'kept' }, content: { elements: body } },
      { id: 'product', type: 'product', name: 'Product', isDefault: true, content: { elements: body, canvasSize: { width: 1200, height: 600 } } },
    ], editableMap: [] });
  assert.equal(design.templates[0].isDefault, true, 'Registration preserves explicit default marker');
  const site = store.createAdminSite({ id: 'inheritance-site-a', slug: 'inheritance-site-a', name: 'Fixture A', settings: { frontendDesign: design } });
  const otherSite = store.createAdminSite({ id: 'inheritance-site-b', slug: 'inheritance-site-b', name: 'Fixture B' });
  const seed = (kind: 'page' | 'post', overrides = {}, target = site) => seedInputFromFrontendDesignTemplate({ siteSettings: target.settings,
    body: { title: 'New article', slug: 'new-article', status: 'published', ...overrides }, templateType: kind === 'post' ? 'blogPost' : 'page', kind, title: 'New article' });
  const seeded = seed('post');
  assert(seeded.ok && seeded.template?.id === 'article');
  const post = store.createAdminBlogPost(site.id, seeded.body);
  const reopened = store.getAdminBlogPostById(site.id, post.id);
  assert(reopened);
  assert.deepEqual(reopened.content.elements.map((e: any) => e.id), ['registered-header', 'article-layout', 'registered-footer']);
  const roots = reopened.content.elements as any[];
  assert.equal(roots[1].y, 100);
  assert.equal(roots[1].responsive.mobile.y, 140);
  assert.equal(roots[2].y, 700);
  assert.equal(roots[2].responsive.mobile.y, 900);
  assert.equal((reopened.content.canvasSize as any).height, 780);
  assert.equal(reopened.content.canvasSize.layout, 'fluid', 'Template width behavior survives post creation/reopen');
  assert.equal(reopened.content.canvasSize.geometryExtra, 'kept');
  assert.equal((reopened.meta.frontendDesignTokens as any).fonts.body, 'Fixture Serif');
  const rendered = buildPublicBlogPostRenderPayload(site, reopened, { requestId: 'fixture', path: '/blog/new-article' }).data;
  const renderedBody = rendered.content.elements[1];
  assert.equal(rendered.content.canvasSize.layout, 'fluid');
  assert.equal(renderedBody.children[0].props.content, 'New article');
  assert.equal(renderedBody.children[1].props.content, 'Evidence and context');
  assert.equal(renderedBody.children[2].props.customProp, 'preserve');
  assert.equal(renderedBody.children[3].props.count, 12);
  assert.equal(renderedBody.children[4].props.src, 'https://example.com/report.mp3');
  store.updateAdminBlogPost(site.id, post.id, { title: 'Revised article' });
  const revised = store.getAdminBlogPostById(site.id, post.id)!;
  assert.deepEqual(revised.content.elements, reopened.content.elements, 'Title edits preserve the saved tree');
  assert.equal(buildPublicBlogPostRenderPayload(site, revised, { requestId: 'fixture', path: '/blog/new-article' }).data.content.elements[1].children[0].props.content, 'Revised article');
  site.settings!.frontendDesign!.templates.find(t => t.type === 'page')!.content!.elements = JSON.parse(JSON.stringify(body).replace('post.title', 'page.title'));
  const seededPage = seed('page'); assert(seededPage.ok);
  const page = store.createAdminPage(site.id, seededPage.body);
  assert(store.getAdminPageById(site.id, page.id));
  assert.equal(store.getAdminPageById(site.id, page.id)!.content.canvasSize.layout, 'fluid');
  assert.equal(buildPublicRenderPayload(site, page, { requestId: 'fixture', path: '/new-article' }).data.content.canvasSize.geometryExtra, 'kept');
  store.updateAdminPage(site.id, page.id, { title: 'Retitled page' });
  assert.equal(store.getAdminPageById(site.id, page.id)!.content.canvasSize.layout, 'fluid', 'Metadata-only saves preserve hosted width behavior');
  store.updateAdminPage(site.id, page.id, { content: { canvasSize: { width: 1100, height: 1800 } } });
  const geometryOnlySave = store.getAdminPageById(site.id, page.id)!;
  assert.equal(geometryOnlySave.content.canvasSize.layout, 'fluid', 'Dimension-only saves retain the chosen layout');
  assert.equal((geometryOnlySave.content.contentDocument as any).metadata.canvasSize.layout, 'fluid');
  assert.equal((geometryOnlySave.content.contentDocument as any).metadata.canvasSize.geometryExtra, 'kept');
  assert.equal(geometryOnlySave.content.canvasSize.width, 1100);
  assert.deepEqual(geometryOnlySave.content.elements, page.content.elements, 'Width mode changes never rebuild authored elements');
  assert.equal(buildPublicRenderPayload(site, page, { requestId: 'fixture', path: '/new-article' }).data.content.elements[0].id, 'registered-header');
  assert.equal(buildPublicRenderPayload(site, page, { requestId: 'fixture', path: '/new-article' }).data.content.elements[1].children[0].props.content, 'New article');

  const product = seedCollectionRecordInputFromFrontendDesignTemplate({ siteSettings: site.settings, body: { values: { title: 'New product', price: 20 } } });
  assert(product.ok && product.template?.id === 'product');
  assert.equal((product.body.values as any).design.elements[0].id, 'registered-header');
  assert.deepEqual((product.body.values as any).frontendDesignElements, (product.body.values as any).design.elements, 'Product aliases agree with hydrated authoritative design');
  const collection = store.createAdminCollection(site.id, { name: 'Products', slug: 'products', status: 'published', fields: [{ key: 'title', label: 'Title', type: 'text' }, { key: 'price', label: 'Price', type: 'number' }] });
  const productRecord = store.createAdminCollectionRecord(site.id, collection.id, { ...product.body, status: 'published' });
  assert(productRecord);
  const productReopened = store.getCollectionRecordByIdOrSlug(site.id, collection.id, productRecord.id);
  assert(productReopened);
  const productRendered = buildPublicCollectionItemRenderPayload(site, collection, productReopened, { requestId: 'fixture', path: '/products/new-product' }).data;
  assert.equal(productRendered.content.elements[0].id, 'registered-header');
  assert.equal(productRendered.content.elements[2].id, 'registered-footer');

  const canonicalOnlyDesign = { contentDocument: { schemaVersion: 'backy.content-document.v1',
    elements: [{ id: 'canonical-product-body', type: 'section', x: 0, y: 0, width: 980, height: 200, props: { custom: 'kept' } }],
    metadata: { canvasSize: { width: 980, height: 2000, layout: 'fluid', geometryExtra: 'kept' }, customMetadata: 'kept' } } };
  const canonicalContract = normalizeFrontendDesignContract({ ...design, templates: [{ id: 'canonical-product', type: 'product',
    name: 'Canonical product', isDefault: true, status: 'active', content: { values: { design: canonicalOnlyDesign } } }] });
  const canonicalSite = store.createAdminSite({ id: 'inheritance-canonical-product', slug: 'inheritance-canonical-product',
    name: 'Canonical product fixture', settings: { frontendDesign: canonicalContract } });
  const canonicalProduct = seedCollectionRecordInputFromFrontendDesignTemplate({ siteSettings: canonicalSite.settings,
    body: { values: { title: 'Canonical product' } } });
  assert(canonicalProduct.ok && canonicalProduct.template?.id === 'canonical-product', 'Canonical-only concrete product is usable as the default');
  const canonicalCollection = store.createAdminCollection(canonicalSite.id, { name: 'Canonical products', slug: 'products', status: 'published',
    fields: [{ key: 'title', label: 'Title', type: 'text' }] });
  const canonicalRecord = store.createAdminCollectionRecord(canonicalSite.id, canonicalCollection.id, { ...canonicalProduct.body, status: 'published' });
  const canonicalReopened = store.getCollectionRecordByIdOrSlug(canonicalSite.id, canonicalCollection.id, canonicalRecord.id)!;
  const reopenedDesign = canonicalReopened.values.design as typeof canonicalOnlyDesign & { canvasSize: Record<string, unknown> };
  assert.deepEqual(reopenedDesign.canvasSize, { width: 980, height: 2000, layout: 'fluid', geometryExtra: 'kept' });
  assert.deepEqual(reopenedDesign.contentDocument.metadata.canvasSize, reopenedDesign.canvasSize);
  assert.equal(reopenedDesign.contentDocument.metadata.customMetadata, 'kept');
  assert.equal(reopenedDesign.contentDocument.elements[1].props.custom, 'kept');
  const canonicalRendered = buildPublicCollectionItemRenderPayload(canonicalSite, canonicalCollection, canonicalReopened,
    { requestId: 'fixture', path: '/products/canonical-product' }).data;
  assert.equal(canonicalRendered.content.canvasSize.width, 980);
  assert.equal(canonicalRendered.content.canvasSize.height, 2000);
  assert.equal(canonicalRendered.content.canvasSize.layout, 'fluid', 'Product render API retains canonical fluid width behavior');
  assert.equal(canonicalRendered.content.canvasSize.geometryExtra, 'kept');
  assert.deepEqual(canonicalRendered.content.elements.map((e: any) => e.id), ['registered-header', 'canonical-product-body', 'registered-footer']);
  const explicitGeometry = inheritRegisteredFrontendChrome({ ...canonicalOnlyDesign, canvasSize: { width: 1111 },
    metadata: { canvasSize: { width: 700, height: 900, outerExtra: 'kept' } } }, chrome);
  assert.deepEqual(explicitGeometry.canvasSize, { width: 1111, height: 2000, layout: 'fluid', outerExtra: 'kept', geometryExtra: 'kept' },
    'Explicit outer geometry takes precedence per field while canonical and metadata extension fields survive');
  assert.deepEqual(canonicalOnlyDesign.contentDocument.metadata.canvasSize, { width: 980, height: 2000, layout: 'fluid', geometryExtra: 'kept' }, 'Hydration does not mutate registered template geometry');

  const other = seed('post', {}, otherSite); assert(other.ok && !other.template);
  assert.equal(store.getAdminBlogPostById(otherSite.id, post.id), undefined, 'Sites cannot reopen another site record');
  const authored = { elements: [{ id: 'my-own-layout', type: 'section', props: {} }] };
  const manual = seed('post', { content: authored }); assert(manual.ok && !manual.template);
  assert.deepEqual(manual.body.content, authored);
  const explicitStarter = seed('post', { templateSource: 'backy-canvas' }); assert(explicitStarter.ok && !explicitStarter.template);
  const duplicateDefault = { ...design, templates: [...design.templates, { ...design.templates[0], id: 'second-article' }] };
  assert.equal(selectDefaultFrontendDesignTemplate(duplicateDefault, 'blogPost'), undefined, 'Conflicting defaults cannot select arbitrarily');
  const descriptive = normalizeFrontendDesignContract({ ...design, templates: [{ id: 'shell', type: 'page', name: 'Descriptor only', isDefault: true, content: { editableMap: {} } }] });
  assert.equal(selectDefaultFrontendDesignTemplate(descriptive, 'page'), undefined);
  const withExistingHeader = { elements: [chrome.header, ...body] };
  assert.equal((inheritRegisteredFrontendChrome(withExistingHeader, chrome).elements as any[]).filter(e => e.type === 'header').length, 1);
  const widthOnly = inheritRegisteredFrontendChrome({ elements: [
    { id: 'width-only-body', type: 'section', y: 0, height: 300, responsive: { mobile: { width: 320 } }, props: { arbitrary: 'kept' } },
  ], canvasSize: { width: 1200, height: 600 }, contentDocument: { elements: [], metadata: { canvasSize: { width: 1200, height: 600 }, custom: 'kept' } } }, {
    header: { id: 'height-changing-header', type: 'header', y: 0, height: 88, locked: true, props: { chromeRole: 'site.header', custom: 'kept' }, responsive: { mobile: { height: 144 } } },
    footer: { id: 'no-mobile-y-footer', type: 'footer', y: 0, height: 90, props: { chromeRole: 'site.footer' } },
  });
  const widthOnlyRoots = widthOnly.elements as any[];
  assert.equal(widthOnlyRoots[1].y, 88);
  assert.equal(widthOnlyRoots[1].responsive.mobile.y, 144, 'Width-only mobile overrides need the mobile header offset');
  assert.equal(widthOnlyRoots[2].y, 388);
  assert.equal(widthOnlyRoots[2].responsive.mobile.y, 444, 'Footer without a mobile override follows the actual mobile content bottom');
  assert.equal(widthOnlyRoots[0].locked, true);
  assert.equal(widthOnlyRoots[0].props.custom, 'kept');
  assert.equal(widthOnlyRoots[1].props.arbitrary, 'kept');
  assert.equal((widthOnly.contentDocument as any).metadata.custom, 'kept');
  assert.equal((widthOnly.contentDocument as any).metadata.canvasSize.height, 600, 'Reserved registered canvas geometry is retained');
  assert.deepEqual((widthOnly.contentDocument as any).elements, widthOnlyRoots);
  console.log('Frontend template inheritance passed: local create/reopen/render, page/blog/product defaults, header/footer desktop/mobile bounds, custom controls/media/fonts/motion preservation, bound title updates, fixed text, explicit starters, authored documents, ambiguous defaults, and independent site scope.');
} finally {
  process.chdir(cwd);
  rmSync(fixtureDirectory, { recursive: true, force: true });
}
