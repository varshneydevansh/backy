import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createBackyDataFigureSample } from '@backy-cms/core';
import { CANVAS_COMPONENT_LIBRARY, createCanvasElement, createCanvasElementFromLibraryItem, normalizeSavedCanvasContent, serializeCanvasContent } from '../src/components/editor/editorCatalog';
import * as registryModule from '../../public/src/lib/interactiveComponentRegistry';
import * as rendererModule from '../../public/src/components/PageRenderer';

const registry = ((registryModule as any).buildPublicInteractiveComponentRegistry || (registryModule as any).default.buildPublicInteractiveComponentRegistry)('discovery-fixture');
const PageRenderer = (rendererModule as any).PageRenderer || (rendererModule as any).default.PageRenderer;
for (const key of ['backy.chart.line', 'backy.chart.bar', 'backy.table.data'] as const) {
  const entry = registry.components.find((component: any) => component.componentKey === key);
  assert(entry, `Native registry entry missing: ${key}`);
  assert.equal(entry.renderMode, 'trusted-component');
  assert.deepEqual(entry.requiredFields, ['componentKey', 'props']);
  assert.equal(entry.fallback.required, false);
  assert(!entry.controls.some((control: any) => control.required && control.type === 'select' && !control.options?.length));
  assert(entry.description.includes('published public-read collection') && entry.description.includes('5,000'));
  assert(entry.description.includes('props.source') && entry.description.includes('props.records'));
  assert.deepEqual(entry.defaultProps.records, createBackyDataFigureSample(key).records);
  const item = CANVAS_COMPONENT_LIBRARY.find((item) => item.defaultProps.componentKey === key);
  assert(item, `Native component-library starter missing: ${key}`);
  assert.deepEqual(item.defaultProps.source, { type: 'inline' });
  assert(Array.isArray(item.defaultProps.records) && item.defaultProps.records.length);
  assert.equal(item.defaultProps.series, undefined, 'Native starters must not use the old empty series placeholder');
  const element = createCanvasElementFromLibraryItem(item, 0, 0, { props: { customNativeMetadata: { keep: true } } });
  assert.equal(element.props.controls, undefined, 'Native figures must not inherit rounds/speed controls from another component');
  assert.equal(element.props.fallback, undefined, 'Native figures must not inherit another component fallback');
  assert.equal(element.props.ariaLabel, item.defaultProps.ariaLabel, 'Accessible description belongs to the selected figure');
  const before = JSON.stringify(element);
  const saved = serializeCanvasContent([element], { width: 1200, height: 900 });
  const reopened = normalizeSavedCanvasContent(saved).elements[0];
  assert.deepEqual(reopened.props, element.props, 'Native data configuration and unknown metadata survive save/reopen');
  const markup = renderToStaticMarkup(<PageRenderer content={{ elements: [element], canvasSize: { width: 1200, height: 900 } } as any} />);
  assert(markup.includes(`data-backy-data-figure="${key}"`), 'The library starter must dispatch the actual native figure');
  for (const label of ['Visitors', 'Subscribers', 'Sample data']) assert(markup.includes(label));
  assert(markup.includes(key === 'backy.table.data' ? 'Search table' : 'Chart series'));
  assert(!markup.includes('static fallback summary') && !markup.includes('Bind collection data from the Data panel'));
  assert.equal(JSON.stringify(element), before, 'Rendering does not mutate authored rows');
}
const external = createCanvasElement('interactiveFigure', 0, 0, {
  props: { componentKey: 'custom.diagram', version: '2.0.0', controls: { amount: 7 }, fallback: { text: 'My diagram' } },
});
assert.deepEqual(external.props.controls, { amount: 7 }, 'Unknown registered figures keep their own controls exclusively');
assert.deepEqual(external.props.fallback, { text: 'My diagram' }, 'Unknown registered figures keep their authored fallback exclusively');
console.log('Native data figure discovery: line/bar/table registry and library entries, actionable configuration, nonempty sample rows, save/reopen metadata and real public SSR passed.');
