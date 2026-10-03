import assert from 'node:assert/strict';
import { canvasElementsToBackyContentDocument } from '@backy-cms/core';
import { productCanvasDesign, readProductCanvas, writeProductCanvas } from '../src/lib/productCanvasDesign';
import type { CanvasElement } from '../src/types/editor';
import type { PageSettings } from '../src/components/editor/PageSettingsModal';

const element: CanvasElement = {
  id: 'product-figure', type: 'interactiveFigure', x: 60, y: 80, width: 500, height: 260,
  props: { componentKey: 'fixture.figure', version: '2.0.0', sampleCount: 18 },
  styles: { fontFamily: 'Georgia', fontSize: 22 },
  responsive: { mobile: { width: 280, props: { sampleCount: 6 } } },
};
const settings: PageSettings = { title: 'Edited catalog title', slug: 'registered-product', status: 'draft', meta: {} };
const values = {
  price: 19, sku: 'SKU', providerSync: { productId: 'fixture-provider' },
  frontendDesignTemplateId: 'registered-product', frontendDesignElements: [element],
  frontendDesignCanvasSize: { width: 900, height: 600 },
  frontendDesignTokens: { fonts: { body: 'Georgia', heading: 'Inter' } },
  frontendDesignChrome: { header: { templateId: 'shared-header' } },
  frontendDesignCustomCss: '.poster { color: #123; }', frontendDesignCustomJs: '/* retained */',
  frontendDesignAssets: [{ id: 'poster', mediaId: 'fixture-image' }],
  frontendDesignAnimations: [{ id: 'slow', duration: 12 }],
  frontendDesignInteractions: { hover: { opacity: 0.9 } },
  frontendDesignDataBindings: { price: { field: 'price' } },
  frontendDesignEditableMap: { figure: { elementId: 'product-figure' } },
  frontendDesignMetadata: { poster: 'retained', responsive: { mobile: { width: 360 } } },
  frontendDesignResponsive: { tablet: { width: 768 } },
  frontendDesignExtension: { custom: ['preserve'] },
};
const before = JSON.stringify(values);
const initial = readProductCanvas(values);
const aliasesOnlyEnvelope = readProductCanvas({ design: { frontendDesignElements: [element], frontendDesignCanvasSize: { width: 900, height: 600 } } });
assert.equal(aliasesOnlyEnvelope.elements[0].id, element.id, 'Envelope-only aliases reopen in the canvas');
assert.equal(aliasesOnlyEnvelope.canvasSize.width, 900);
assert.equal(initial.elements[0].type, 'interactiveFigure');
assert.equal(initial.elements[0].props.sampleCount, 18);
assert.deepEqual(initial.elements[0].responsive, element.responsive);
assert.equal(initial.customCSS, values.frontendDesignCustomCss);
const edited = initial.elements.map(node => ({ ...node, props: { ...node.props, sampleCount: 24 } }));
const patch = writeProductCanvas(values, 'product-record', settings, edited, { width: 1000, height: 700 });
assert.equal(JSON.stringify(values), before, 'A draft must not mutate the persisted record');
assert(!('price' in patch) && !('sku' in patch) && !('providerSync' in patch), 'Design draft must not overwrite unsaved catalog values');
const reopened = readProductCanvas({ ...values, ...patch });
assert.equal(reopened.elements[0].props.sampleCount, 24);
assert.equal(reopened.canvasSize.width, 1000);
assert.equal(reopened.canvasSize.height, 700);
assert.equal(reopened.contentDocument?.id, 'product-record');
assert.equal(reopened.contentDocument?.kind, 'dynamicItem');
assert.equal(reopened.contentDocument?.title, settings.title);
assert.equal(reopened.contentDocument?.elements[0].props.sampleCount, 24);
for (const key of ['frontendDesignTokens', 'frontendDesignChrome', 'frontendDesignAssets', 'frontendDesignAnimations', 'frontendDesignInteractions', 'frontendDesignDataBindings', 'frontendDesignEditableMap', 'frontendDesignResponsive', 'frontendDesignExtension']) {
  assert.deepEqual(patch[key], values[key as keyof typeof values], `Retain ${key}`);
}
const design = productCanvasDesign(patch);
assert.deepEqual(design.elements, design.frontendDesignElements);
assert.deepEqual(design.contentDocument, design.frontendDesignContentDocument);
assert.equal((design.metadata as Record<string, unknown>).poster, 'retained');

const document = canvasElementsToBackyContentDocument({ id: 'existing', kind: 'dynamicItem', elements: [element], canvasSize: { width: 700, height: 500 }, title: 'Existing' });
const version = { id: 'v2', createdAt: '2026-01-01T00:00:00Z' };
const envelope = { design: { contentDocument: { ...document, version, extension: { keep: true } }, tokens: { fonts: { body: 'Georgia' } }, extension: { layout: 'editorial' } }, frontendDesignElements: [] };
const documentInitial = readProductCanvas(envelope);
assert.equal(documentInitial.elements[0].id, element.id, 'Document-only designs reopen in the canvas');
const envelopePatch = writeProductCanvas(envelope, 'existing', settings, documentInitial.elements, documentInitial.canvasSize);
const envelopeDesign = productCanvasDesign(envelopePatch);
assert.deepEqual((envelopeDesign.contentDocument as Record<string, unknown>).version, version);
assert.deepEqual((envelopeDesign.contentDocument as Record<string, unknown>).extension, { keep: true });
assert.deepEqual(envelopeDesign.extension, { layout: 'editorial' });
assert.deepEqual(envelopeDesign.tokens, envelope.design.tokens);
const emptyPatch = writeProductCanvas({ ...values, ...patch }, 'product-record', settings, [], reopened.canvasSize);
assert.equal(readProductCanvas(emptyPatch).elements.length, 0, 'Deleting every layer must persist an empty canvas');
console.log('Product canvas design smoke passed: aliases, canonical document, catalog isolation, responsive/asset/token preservation, immutability, version/extensions, and empty canvas');
