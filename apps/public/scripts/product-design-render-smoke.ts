import assert from 'node:assert/strict';
import { canvasElementsToBackyContentDocument } from '@backy-cms/core';
import { getSiteByIdOrSlug, getCollectionByIdOrSlug, type StoreCollectionRecord } from '../src/lib/backyStore';
import { buildCollectionRecordContent, buildPublicCollectionItemRenderPayload } from '../src/lib/renderPayload';

const site = getSiteByIdOrSlug('site-demo');
const base = getCollectionByIdOrSlug('site-demo', 'products');
assert(site && base, 'Demo site and products collection must be available');
const elements = [{ id: 'saved-product-figure', type: 'interactiveFigure', x: 42, y: 64, width: 720, height: 360,
  props: { componentKey: 'fixture.product.figure', version: '1.0.0', sampleCount: 28, fallback: { title: 'Saved product figure', text: 'Product-specific canvas' } },
  responsive: { mobile: { width: 335 } }, styles: { fontFamily: 'Georgia, serif' }, children: [] }];
const canvasSize = { width: 1000, height: 800 };
const contentDocument = canvasElementsToBackyContentDocument({ id: 'product-fixture', kind: 'dynamicItem', title: 'Product fixture', elements, canvasSize });
const record: StoreCollectionRecord = {
  id: 'product-fixture', siteId: site.id, collectionId: base.id, slug: 'product-fixture', status: 'published',
  createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-02T00:00:00.000Z',
  publishedAt: '2026-01-02T00:00:00.000Z', scheduledAt: null,
  values: { title: 'Product fixture', price: 25, frontendDesignElements: elements, frontendDesignCanvasSize: canvasSize,
    frontendDesignContentDocument: contentDocument, frontendDesignCustomCss: '.product-fixture { color: #222; }',
    frontendDesignThemeTokenRefs: { background: 'colors.background' }, frontendDesignAssets: { fonts: [{ id: 'fixture-font' }] },
    frontendDesignAnimations: [{ id: 'fixture-motion' }], frontendDesignInteractions: { timeline: [] },
    frontendDesignEditableMap: { fields: [{ elementId: 'saved-product-figure', targetPath: 'props.sampleCount' }] } },
};
const collection = { ...base, metadata: { ...base.metadata, dynamicTemplates: { item: { authoredCanvas: {
  elements: [{ id: 'collection-default', type: 'heading', props: { content: 'Collection default' } }], canvasSize,
} } } } };
const render = (item = record) => buildPublicCollectionItemRenderPayload(site, collection, item, { requestId: 'product-render-smoke', path: '/products/product-fixture' }).data;
const before = JSON.stringify(record);
const payload = render();
assert.equal(payload.content.elements[0]?.id, 'saved-product-figure', 'Published product detail must render the saved product canvas before collection defaults');
assert.equal(payload.content.elements[0]?.props.sampleCount, 28);
assert.deepEqual(payload.content.canvasSize, canvasSize);
assert.deepEqual(payload.content.elements[0]?.responsive, elements[0].responsive);
assert.equal(payload.content.customCSS, record.values.frontendDesignCustomCss);
assert.deepEqual(payload.content.assets, record.values.frontendDesignAssets);
assert.deepEqual(payload.content.animations, record.values.frontendDesignAnimations);
assert.deepEqual(payload.content.themeTokenRefs, record.values.frontendDesignThemeTokenRefs);
assert.equal(JSON.stringify(record), before, 'Rendering must not mutate the saved design');
assert.equal(buildCollectionRecordContent(site, collection, record).elements[0]?.id, 'saved-product-figure', 'Hosted product content uses the saved layout too');
const bound = render({ ...record, values: { title: 'Live product title', design: {
  elements: [{ id: 'bound-title', type: 'heading', props: { content: 'Template placeholder', binding: 'product.title' } }], canvasSize,
} } });
assert.equal(bound.content.elements[0]?.props.content, 'Live product title', 'Saved product layouts still resolve current catalog field bindings');
const nonProduct = buildCollectionRecordContent(site, { ...collection, slug: 'articles' }, record);
assert.equal(nonProduct.elements[0]?.id, 'collection-default', 'Other collections retain their existing layout selection');
const withoutDesign = render({ ...record, values: { title: 'Product fixture', price: 25 } });
assert.equal(withoutDesign.content.elements[0]?.id, 'collection-default', 'Products without a saved canvas still inherit the collection layout');
const canonicalOnly = render({ ...record, values: { title: 'Canonical product', frontendDesignElements: [{ id: 'stale-alias', type: 'text' }], design: {
  contentDocument, customCss: '.canonical-product { color: #111; }', tokens: { fonts: { body: { family: 'Georgia' } } },
} } });
assert.equal(canonicalOnly.content.elements[0]?.id, 'saved-product-figure', 'Canonical envelope document must win over stale aliases just as it does in the editor');
assert.deepEqual(canonicalOnly.content.canvasSize, canvasSize);
assert.equal(canonicalOnly.content.customCSS, '.canonical-product { color: #111; }');
assert.deepEqual(canonicalOnly.frontendDesign.content?.tokens, { fonts: { body: { family: 'Georgia' } } }, 'Envelope font tokens remain available to the custom frontend');
assert.deepEqual(canonicalOnly.frontendDesign.content?.elements, contentDocument.elements, 'Design metadata must agree with the canonical canvas instead of exposing stale aliases');
assert.deepEqual(canonicalOnly.frontendDesign.content?.canvasSize, canvasSize);
const empty = render({ ...record, values: { title: 'Empty product canvas', design: { elements: [], canvasSize } } });
assert.deepEqual(empty.content.elements, [], 'An intentionally empty product canvas must not be replaced with the collection layout');
console.log('Product design public rendering passed: saved canvas precedence, hosted content, controls, geometry, responsive state, CSS, catalog bindings, immutable input, collection fallback');
