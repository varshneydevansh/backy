import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup, renderToString } from 'react-dom/server';
import { createEditor, Editor, Node, Transforms } from 'slate';
import { createSlateEditor } from '@udecode/plate';
import { createDataFigureLoadSession, resolveDataFigureView } from '../src/dataFigureLoading';
import type { DataFigureLoadState } from '../src/dataFigureLoading';
import { handleBackyFigureControlKeyDown, shouldHandleBackyDocumentInput } from '../src/inputEvents';
import { createRequire } from 'node:module';
import { DataFigure } from '../src/data-figure';
import { resolveBackyDataPlotLayout, watchBackyDataPlotWidth } from '../src/DataFigure';
import { buildBackyDataChart, createBackyDataFigureSample, inspectBackyDataRecords, queryBackyDataTable, resolveBackyDataColumns, getBackyDataFigureError, getBackyDataFigureRequestedFields } from '../../core/src/data-figures';
import { insertRichDataFigure } from '../src/ui/richBlockTransforms';

async function main() {
const sample = createBackyDataFigureSample('backy.chart.line');
const original = JSON.stringify(sample);
const line = renderToStaticMarkup(<DataFigure config={sample} />);
for (const expected of ['<svg', '<path', '<circle', 'role="img"', 'Chart series', 'aria-pressed="true"', 'Horizontal axis: Month', 'January', 'Subscribers', '120']) assert(line.includes(expected), `Line chart SSR missing ${expected}`);
const bar = renderToStaticMarkup(<DataFigure config={{ ...sample, componentKey: 'backy.chart.bar' }} />);
assert(bar.includes('<rect') && bar.includes('Bar chart.'));
// At 250 content pixels, the former 720-unit SVG made 12px text only 4.17px.
// The measured viewBox removes that extra scale while keeping every data point.
assert(12 * 250 / 720 < 5, 'The regression fixture must reproduce unreadable legacy axes');
const mobilePlot = resolveBackyDataPlotLayout(250, 100);
assert.equal(mobilePlot.fontSize * 250 / mobilePlot.width, 12, 'Mobile SVG labels retain their local pixel size');
assert.deepEqual(mobilePlot.tickIndices, [0, 99], 'A narrow chart labels both endpoints without crowded intermediate ticks');
assert(mobilePlot.labelCharacters * 7 * mobilePlot.tickIndices.length <= mobilePlot.plottingWidth, 'Long horizontal labels fit the narrow plot');
const mobileBars = resolveBackyDataPlotLayout(250, 4, true);
assert(mobileBars.labelCharacters * 7 * mobileBars.tickIndices.length <= mobileBars.plottingWidth * 3 / 4,
  'Bar labels account for endpoint centers inset inside the plot');
assert(resolveBackyDataPlotLayout(720, 100).tickIndices.length > mobilePlot.tickIndices.length, 'Wider charts can show more labels');
for (const width of [1, 240, 250, 720, 1600, 100_000, Number.NaN, Number.POSITIVE_INFINITY]) {
  const plot = resolveBackyDataPlotLayout(width, 100);
  assert(plot.width >= 240 && plot.width <= 4096 && plot.plottingWidth > 0);
  assert(plot.tickIndices.every((index) => index >= 0 && index < 100));
}
const observerDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'ResizeObserver');
let notifyResize!: (width: number) => void;
let observed: Element | undefined;
let disconnected = false;
Object.defineProperty(globalThis, 'ResizeObserver', { configurable: true, value: class {
  constructor(callback: ResizeObserverCallback) { notifyResize = (width) => callback([{ contentRect: { width } } as ResizeObserverEntry], this as unknown as ResizeObserver); }
  observe(element: Element) { observed = element; }
  disconnect() { disconnected = true; }
} });
try {
  const hydration = renderToString(<DataFigure config={sample} />);
  assert(hydration.includes('viewBox="0 0 720 304"') && observed === undefined, 'SSR/initial hydration geometry is deterministic and does not measure a DOM node');
  assert.equal(renderToString(<DataFigure config={sample} />), hydration, 'Initial rendering cannot depend on a previous viewport measurement');
  const measured: number[] = [];
  const element = { clientWidth: 250 } as SVGSVGElement;
  const stop = watchBackyDataPlotWidth(element, (width) => measured.push(width));
  assert.equal(observed, element);
  assert.deepEqual(measured, [250], 'Mount measures content width immediately');
  notifyResize(320); notifyResize(0); notifyResize(Number.NaN);
  assert.deepEqual(measured, [250, 320], 'Responsive resize changes the plot without accepting hidden/invalid sizes');
  stop(); notifyResize(640);
  assert(disconnected && measured.length === 2, 'Unmount disconnects width observation and ignores late resize callbacks');
} finally {
  if (observerDescriptor) Object.defineProperty(globalThis, 'ResizeObserver', observerDescriptor);
  else Reflect.deleteProperty(globalThis, 'ResizeObserver');
}
const denseConfig = { ...sample, records: Array.from({ length: 100 }, (_, index) => ({ Month: `Long reporting period ${index}`, Visitors: index, Subscribers: -index })) };
const denseSnapshot = JSON.stringify(denseConfig);
for (const componentKey of ['backy.chart.line', 'backy.chart.bar'] as const) {
  const markup = renderToStaticMarkup(<DataFigure config={{ ...denseConfig, componentKey }} />);
  assert.equal([...markup.matchAll(/tabindex="0" aria-label=/g)].length, 200, 'Responsive label limits cannot sample records, points or series');
  assert(markup.includes('Visitors, Long reporting period 99: 99') && markup.includes('Subscribers, Long reporting period 99: -99'), 'Accessible values retain full labels and values');
}
assert.equal(JSON.stringify(denseConfig), denseSnapshot, 'Responsive geometry never changes saved figure configuration or rows');
// SVG title/desc are parsed as one text node by the browser. SSR must not emit
// separators for separate React children, which otherwise breaks hydration.
for (const componentKey of ['backy.chart.line', 'backy.chart.bar'] as const) {
  const hydrationMarkup = renderToString(<DataFigure config={{ ...sample, componentKey }} />);
  const svgTitles = [...hydrationMarkup.matchAll(/<title>(.*?)<\/title>/g)].map((match) => match[1]);
  assert.equal(svgTitles.length, 8);
  assert.equal(svgTitles[0], 'Visitors: January · 120');
  assert.equal(svgTitles[4], 'Subscribers: January · 18');
  assert(svgTitles.every((title) => !title.includes('<!--')), 'SVG point titles have one uninterrupted text child during SSR.');
  const description = hydrationMarkup.match(/<desc[^>]*>(.*?)<\/desc>/)?.[1];
  assert.equal(description, `${componentKey === 'backy.chart.line' ? 'Line chart' : 'Bar chart'}. Horizontal axis: Month. Series: Visitors, Subscribers. Focus a data point to read its value.`);
}

const tableConfig = { ...sample, componentKey: 'backy.table.data' as const };
const table = renderToStaticMarkup(<DataFigure config={tableConfig} pageSize={2} />);
for (const expected of ['<table', '<thead', 'scope="col"', 'aria-sort="none"', 'Sort by Visitors', 'Search table', '4 rows', 'Page 1 of 2', 'Previous', 'Next', 'February']) assert(table.includes(expected), `Data table SSR missing ${expected}`);
assert(!table.includes('<td style="padding:12px;border-bottom:1px solid #e2e8f0;vertical-align:top;overflow-wrap:anywhere;max-width:280px">March</td>'), 'Actual table SSR shows only the requested page.');
assert.equal(JSON.stringify(sample), original, 'Runtime rendering must preserve serialized source rows/config.');

const records = [{ category: 'Zulu', amount: 20 }, { category: 'Alpha', amount: 2 }, { category: 'Alpha 2', amount: 10 }];
const columns = [{ key: 'category', label: 'Category' }, { key: 'amount', label: 'Amount' }];
assert.deepEqual(queryBackyDataTable(records, columns, { query: 'ALPHA', sortKey: 'amount', sortDirection: 'desc', pageSize: 1 }).rows, [records[2]]);
const second = queryBackyDataTable(records, columns, { query: 'Alpha', sortKey: 'amount', sortDirection: 'asc', page: 1, pageSize: 1 });
assert.equal(second.total, 2); assert.equal(second.pageCount, 2); assert.deepEqual(second.rows, [records[2]]);
const noMatches = queryBackyDataTable(records, columns, { query: 'absent', page: 99, pageSize: 0 });
assert.equal(noMatches.total, 0); assert.equal(noMatches.page, 0); assert.equal(noMatches.pageSize, 1);
assert.deepEqual(records.map((row) => row.amount), [20, 2, 10], 'Search/sort must not mutate the source array.');
const stable = queryBackyDataTable([{ amount: 2, id: 'first' }, { amount: 2, id: 'second' }], columns, { sortKey: 'amount', sortDirection: 'desc' });
assert.deepEqual(stable.rows.map((row) => row.id), ['first', 'second']);

const malformedRows = [{ Month: 'One', Visitors: 0, Subscribers: -8 }, null, 'invalid row', { Month: 'Two', Visitors: '12', Subscribers: 'Infinity' }, { Month: 'Three', Visitors: null, Subscribers: Number.NaN }];
const inspected = inspectBackyDataRecords(malformedRows);
assert.equal(inspected.invalidRows, 2); assert.equal(inspected.rows.length, 3);
const chart = buildBackyDataChart(inspected.rows, sample);
assert.deepEqual(chart.series[0].values, [0, 12, null]);
assert.deepEqual(chart.series[1].values, [-8, null, null]);
assert.equal(chart.invalidValues, 3); assert.equal(chart.minimum, -8); assert.equal(chart.maximum, 12);
const invalid = renderToStaticMarkup(<DataFigure config={{ ...sample, records: malformedRows }} />);
assert(invalid.includes('2 invalid rows') && invalid.includes('3 missing or invalid numeric values'));
assert(!invalid.includes('NaN') && !invalid.includes('Infinity'));
const huge = renderToStaticMarkup(<DataFigure config={{ ...sample, records: [{ Month: 'Low', Visitors: -1e308, Subscribers: 1e308 }, { Month: 'High', Visitors: 1e308, Subscribers: -1e308 }] }} />);
assert(!huge.includes('NaN') && !huge.includes('Infinity'), `Extreme finite numbers must not overflow SVG geometry: ${huge.match(/.{0,60}(?:NaN|Infinity).{0,60}/g)}`);
assert(renderToStaticMarkup(<DataFigure config={{ ...sample, records: [] }} />).includes('No data yet'));
assert(renderToStaticMarkup(<DataFigure config={{ ...sample, records: { invalid: true } }} />).includes('Data must be an array of rows.'));
const largest = renderToStaticMarkup(<DataFigure config={{ ...sample, records: [{ Month: 'Largest', Visitors: Number.MAX_VALUE, Subscribers: -Number.MAX_VALUE }] }} />);
assert(!largest.includes('NaN') && !largest.includes('Infinity'), 'Largest finite values must have finite geometry and tick labels.');
const escaped = renderToStaticMarkup(<DataFigure config={{ ...tableConfig, title: '<script>unsafe title</script>', records: [{ Month: '<img src=x onerror=evil()>', Visitors: 1, Subscribers: 2 }] }} />);
assert(!escaped.includes('<script>') && !escaped.includes('<img src=x') && escaped.includes('&lt;script&gt;'));

const collection = { ...sample, source: { type: 'collection' as const, collectionId: 'public-records' }, dataStatus: 'ready' as const };
assert(renderToStaticMarkup(<DataFigure config={collection} />).includes('<svg'), 'Ready public hydration renders during SSR without a client credential.');
const blocked = renderToStaticMarkup(<DataFigure config={{ ...collection, dataStatus: 'error', dataError: 'This collection is private.' }} />);
assert(blocked.includes('This collection is private.') && !blocked.includes('<svg') && !blocked.includes('January'), 'Resolution errors never display stale saved rows.');
const unavailable = renderToStaticMarkup(<DataFigure config={{ ...collection, dataStatus: undefined }} />);
assert(unavailable.includes('This data source is unavailable here.') && !unavailable.includes('<svg'));
const unconfigured = { ...collection, columns: undefined, xField: undefined, yFields: undefined };
assert.deepEqual(resolveBackyDataColumns(unconfigured, records), []);
assert.equal(buildBackyDataChart(records, unconfigured).hasValues, false, 'Collection figures must explicitly select their displayed fields.');
const loader = async () => [{ Month: 'Fresh', Visitors: 900 }];
const hydratedMarkup = renderToStaticMarkup(<DataFigure config={collection} loadRecords={loader} />);
assert(hydratedMarkup.includes('January') && hydratedMarkup.includes('Refresh data') && !hydratedMarkup.includes('Loading data…'), 'SSR hydration has precedence before explicit refresh.');
const failedMarkup = renderToStaticMarkup(<DataFigure config={{ ...collection, dataStatus: 'error', dataError: 'This figure supports collections with at most 5,000 published records. Choose a smaller collection.' }} loadRecords={loader} />);
assert(failedMarkup.includes('Retry data') && failedMarkup.includes('Choose a smaller collection.') && !failedMarkup.includes('<svg'));
for (const badConfig of [null, [], { ...sample, componentKey: 'unknown' }]) {
  const markup = renderToStaticMarkup(<DataFigure config={badConfig as any} />);
  assert(markup.includes('Choose a valid figure display') && !markup.includes('<svg'));
}
assert(renderToStaticMarkup(<DataFigure config={{ ...sample, source: { type: 'arbitrary-url', url: 'https://example.test' } as any }} />).includes('Choose a valid data source'));
const missing = renderToStaticMarkup(<DataFigure config={{ ...sample, xField: 'missing', yFields: ['Visitors', 'unknown'] }} />);
assert(missing.includes('Selected fields are missing from this data: missing, unknown.') && missing.includes('missing horizontal labels') && missing.includes('missing or invalid numeric values'));
assert.deepEqual(queryBackyDataTable(records, columns, { page: Number.NaN, pageSize: Number.NaN }).rows, records);
assert.equal(getBackyDataFigureError(new Error('server token=do-not-render')), 'Could not load this data. Check the source and try again.');
assert.equal(getBackyDataFigureError('A selected field is undeclared or unavailable for public figures.'), 'A selected field is undeclared or unavailable for public figures.');

// Exercise the actual async controller used by DataFigure, including loaders ignoring abort.
const session = createDataFigureLoadSession();
const states: DataFigureLoadState[] = [];
const firstIdentity = {}, nextIdentity = {};
let resolveSlow!: (rows: unknown[]) => void;
let slowSignal!: AbortSignal;
const slow = session.start(firstIdentity, 0, 'old', (_id, { signal }) => {
  slowSignal = signal;
  return new Promise((resolve) => { resolveSlow = resolve; });
}, (state) => states.push(state));
const fresh = session.start(nextIdentity, 0, 'new', loader, (state) => states.push(state));
assert(slowSignal.aborted, 'Replacing a collection load aborts the old request.');
await fresh;
resolveSlow([{ Month: 'Late stale' }]); await slow;
assert.deepEqual(states.map((state) => [state.identity === nextIdentity, state.status]), [[false, 'loading'], [true, 'loading'], [true, 'ready']], 'A late response never overwrites a newer collection.');
const serverView = resolveDataFigureView(collection, false, loader, firstIdentity, 0, states.at(-1)!);
assert.equal(serverView.records, collection.records, 'A changed hydration identity supersedes a previous client dataset.');
assert.equal(resolveDataFigureView(collection, true, loader, firstIdentity, 0, null).status, 'loading', 'Authoring never trusts a saved fetched snapshot.');
assert.equal(resolveDataFigureView(collection, false, loader, firstIdentity, 1, null).status, 'loading', 'Refresh leaves hydrated records behind immediately.');
const rowBudget = 'This figure supports collections with at most 5,000 published records. Choose a smaller collection.';
await session.start(firstIdentity, 1, 'old', async () => { throw new Error(rowBudget); }, (state) => states.push(state));
const failedView = resolveDataFigureView(collection, false, loader, firstIdentity, 1, states.at(-1)!);
assert.equal(failedView.status, 'error'); assert.equal(failedView.error, rowBudget); assert.deepEqual(failedView.records, []);
await session.start(firstIdentity, 2, 'old', loader, (state) => states.push(state));
const retried = resolveDataFigureView(collection, false, loader, firstIdentity, 2, states.at(-1)!);
assert.equal(retried.status, 'ready'); assert.deepEqual(retried.records, [{ Month: 'Fresh', Visitors: 900 }]);
await session.start(firstIdentity, 3, 'old', async () => ({ malformed: true }) as any, (state) => states.push(state));
assert.equal(states.at(-1)!.error, 'Data must be an array of rows.');
let resolveUnmounted!: (rows: unknown[]) => void;
const unmounted = session.start(firstIdentity, 4, 'old', () => new Promise((resolve) => { resolveUnmounted = resolve; }), (state) => states.push(state));
const countBeforeCancel = states.length; session.cancel(); resolveUnmounted([]); await unmounted;
assert.equal(states.length, countBeforeCancel, 'Unmounting never publishes a late completion.');
let rejectOld!: (error: Error) => void;
const oldFailure = session.start(firstIdentity, 5, 'old', () => new Promise((_resolve, reject) => { rejectOld = reject; }), (state) => states.push(state));
await session.start(nextIdentity, 0, 'new', loader, (state) => states.push(state));
const countBeforeOldFailure = states.length; rejectOld(new Error(rowBudget)); await oldFailure;
assert.equal(states.length, countBeforeOldFailure, 'An old rejected load cannot erase the replacement dataset.');
session.cancel();
assert.deepEqual(getBackyDataFigureRequestedFields(collection), ['Month', 'Visitors', 'Subscribers']);
assert.equal(getBackyDataFigureRequestedFields({ ...collection, yFields: [] }), null);
assert.equal(getBackyDataFigureRequestedFields({ ...tableConfig, columns: [{ key: '__proto__', label: 'Bad' }] }), null);
assert.equal(resolveDataFigureView(unconfigured, false, loader, firstIdentity, 0, null).error, 'Choose explicit fields for this collection figure.');
assert.equal(resolveDataFigureView(unconfigured, true, loader, firstIdentity, 0, null).status, 'loading', 'Authoring fetches scalar field choices before fields have been selected.');
await session.start(firstIdentity, 6, 'old', async (_id, options) => {
  assert.deepEqual(options.requestedFields, ['Month', 'Visitors']);
  return [{ Month: 'Selected', Visitors: 12, Unselected: { secret: 'omit' } }];
}, (state) => states.push(state), ['Month', 'Visitors']);
assert.deepEqual(states.at(-1)!.records, [{ Month: 'Selected', Visitors: 12 }], 'Public refresh retains only explicit displayed fields.');
for (const badValue of [{ nested: 'not scalar' }, Number.NaN, Number.POSITIVE_INFINITY]) {
  await session.start(firstIdentity, 7, 'old', async () => [{ Month: 'Invalid', Visitors: badValue }], (state) => states.push(state), ['Month', 'Visitors']);
  assert.equal(states.at(-1)!.status, 'error'); assert.deepEqual(states.at(-1)!.records, []);
  assert.equal(states.at(-1)!.error, 'A selected field is undeclared or unavailable for public figures.');
}
session.cancel();

// Native controls keep their browser behavior and never reach article key transforms.
for (const [tagName, key, isComposing, keyCode, prevent] of [['INPUT', 'Enter', false, 13, true], ['INPUT', 'Enter', true, 13, false], ['INPUT', 'Enter', false, 229, false], ['TEXTAREA', 'Enter', false, 13, false], ['BUTTON', 'Enter', false, 13, false], ['SELECT', 'ArrowDown', false, 40, false], ['INPUT', '*', false, 0, false]] as const) {
  let prevented = false, stopped = false;
  const target = { nodeType: 1, tagName, closest: () => ({ tagName }) } as unknown as EventTarget;
  handleBackyFigureControlKeyDown({ key, target, nativeEvent: { isComposing, keyCode }, preventDefault: () => { prevented = true; }, stopPropagation: () => { stopped = true; } });
  assert.equal(prevented, prevent); assert(stopped);
  assert(!shouldHandleBackyDocumentInput({ target, nativeEvent: { isComposing } }));
}
const edited = renderToStaticMarkup(<DataFigure config={tableConfig} editable onChange={() => {}} />);
for (const expected of ['Figure settings', 'Figure title', 'Figure display', 'Figure data source', 'Figure rows', 'Apply rows', 'Column label for Visitors']) assert(edited.includes(expected));
assert(!edited.includes('<form'), 'Figure controls never submit or nest the article form.');

const require = createRequire(import.meta.url);
const cssLoader = require.extensions['.css']; require.extensions['.css'] = () => {};
const { BackyEditor, BackyDataFigurePlugin } = await import('../src/index');
if (cssLoader) require.extensions['.css'] = cssLoader; else delete require.extensions['.css'];
const editor = createEditor();
editor.children = [{ type: 'code_block', id: 'keep-code', children: [{ type: 'code_line', children: [{ text: 'const retained = true;' }] }] }] as any;
Transforms.select(editor, { path: [0, 0, 0], offset: 5 });
insertRichDataFigure(editor, 'backy.chart.bar');
assert.equal((editor.children[0] as any).id, 'keep-code');
const inserted = editor.children[1] as any;
assert.equal(inserted.type, 'data_figure'); assert.equal(inserted.componentKey, 'backy.chart.bar'); assert.equal(inserted.children[0].text, '');
assert.equal(inserted.records.length, 4); assert(inserted.title.includes('Sample data'));
assert(editor.selection && Node.get(editor, editor.selection.anchor.path), 'Inserted figure retains a valid Slate selection.');
// Use the production Plate plugin, so void traversal and edits match the editor.
const pluginEditor = createSlateEditor({ plugins: [BackyDataFigurePlugin], value: [
  { ...inserted, id: 'figure-id', _id: 'figure-node-id', custom: { retain: true }, source: { type: 'inline', provenance: 'retain-source' }, columns: [{ key: 'Month', label: 'Month', customColumn: 'retain-column' }] },
  { type: 'p', id: 'retain-following', children: [{ text: 'Following article', _id: 'retain-leaf' }] },
] });
assert(pluginEditor.isVoid(pluginEditor.children[0] as any), 'The production data figure plugin is a Slate void element.');
const originalFigure = JSON.stringify(pluginEditor.children[0]);
Transforms.select(pluginEditor as any, { path: [1, 0], offset: 9 });
const selectedArticle = JSON.stringify(pluginEditor.selection);
Transforms.setNodes(pluginEditor as any, { title: 'Updated title', columns: [{ ...(pluginEditor.children[0] as any).columns[0], label: 'Reporting month' }] } as any, { at: [0], voids: true });
const patched = pluginEditor.children[0] as any;
assert.equal(patched.id, 'figure-id'); assert.equal(patched._id, 'figure-node-id'); assert(patched.custom.retain);
assert.equal(patched.source.provenance, 'retain-source'); assert.equal(patched.columns[0].customColumn, 'retain-column');
assert.equal(JSON.stringify(pluginEditor.selection), selectedArticle, 'Changing figure properties preserves the retained article caret.');
assert.equal((pluginEditor.children[1] as any).children[0]._id, 'retain-leaf');
assert.notEqual(JSON.stringify(patched), originalFigure);
assert.equal(Editor.string(pluginEditor as any, [0]), '', 'Void figure data is not Slate editable text.');
const rich = renderToStaticMarkup(<BackyEditor readOnly value={[{ ...inserted, id: 'figure-id', _id: 'figure-node-id', custom: { retain: true } }]} />);
assert(rich.includes('data-backy-rich-data-figure="true"') && rich.includes('<svg') && rich.includes('data-slate-node="element"'));
assert(!rich.includes('Figure settings'));
console.log('Data figures: native line/bar/table SSR, accessible controls, search/sort/pagination, malformed/extreme/escaped values, SSR hydration, cancellable refresh/retry without stale fallback, native form/IME keys and production Slate void/property preservation passed.');
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
