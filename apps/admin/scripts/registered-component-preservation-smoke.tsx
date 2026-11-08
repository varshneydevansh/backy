import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import assert from 'node:assert/strict';
import { registeredComponentProps, registeredComponentControls } from '../src/components/editor/registeredComponentModel';
import { createRequire } from 'node:module';
const { createCanvasElementFromLibraryItem, serializeCanvasContent, normalizeSavedCanvasContent } = createRequire(import.meta.url)('../src/components/editor/editorCatalog');
import { loadInteractiveRegistryPages } from '../src/lib/interactiveRegistryLoading';
import { authoringInteractiveEntries } from '../src/lib/blogAuthoringInteractive';
import type { InteractiveComponentRegistryEntry } from '../src/lib/adminContentApi';

async function main() {
const entry: InteractiveComponentRegistryEntry = { componentKey: 'fixture.precise', version: '1.0.204', type: 'codeComponent', displayName: 'Diagram', status: 'active', source: 'custom', renderMode: 'sandbox-iframe',
 defaultProps: { config: { palette: ['teal'], phases: [{ label: 'Initial', value: 2 }] }, density: 3, savedExtension: { retain: true } },
 propsSchema: { type: 'object', properties: { config: { type: 'object', title: 'Configuration' }, density: { type: 'integer', minimum: 1, maximum: 12, default: 3 }, playing: { type: 'boolean', default: false }, mode: { type: 'string', enum: ['one', 'two'] } } },
 controls: [{ key: 'density', type: 'range', defaultValue: 3, extension: { retain: true } }],
 fallback: { required: true, supported: ['title', 'html', 'imageUrl', 'alt'], title: 'Fallback diagram', html: '<strong>Static diagram</strong>', imageUrl: '/diagram.png', alt: 'Two phases', extension: { preserve: true } },
 dataBindings: [{ id: 'series-binding', source: { collectionId: 'data' }, targetPath: 'props.series', extension: { retain: true } }],
 renderCapabilities: { unknown: { retain: true }, hydrationMode: 'untrusted-saved-mode' },
 runtime: { sandboxUrl: '/api/sites/site-draft/interactive-components/fixture.precise/1.0.204/sandbox' }, integrity: { signatureRequiredForCustomCode: true } };
const require = createRequire(import.meta.url);
const previousCss = require.extensions['.css'];
require.extensions['.css'] = () => {};
const { PropertyPanel } = require('../src/components/editor/PropertyPanel');
const { ActiveEditorProvider } = require('../src/components/editor/ActiveEditorContext');
const { createRegisteredComponentLibraryItems } = require('../src/components/editor/ComponentLibrary');
if (previousCss) require.extensions['.css'] = previousCss; else delete require.extensions['.css'];
const original = JSON.stringify(entry);
const libraryItem = createRegisteredComponentLibraryItems([entry])[0];
const props = libraryItem.defaultProps;
assert.deepEqual(props, registeredComponentProps(entry));
assert.deepEqual(props.config, entry.defaultProps!.config); assert.deepEqual(props.propsSchema, entry.propsSchema); assert.deepEqual(props.dataBindings, entry.dataBindings);
assert.equal((props.fallback as any).title, 'Fallback diagram'); assert.deepEqual(props.fallback, { ariaLabel: 'Diagram', text: '', ...entry.fallback });
assert.equal((props.renderCapabilities as any).hydrationMode, 'sandbox-iframe'); assert.equal((props.renderCapabilities as any).unknown.retain, true);
const element = createCanvasElementFromLibraryItem({ id: 'registered-fixture', type: 'codeComponent', name: 'Diagram', icon: 'Code', defaultSize: { width: 640, height: 360 }, defaultProps: props }, 10, 20);
const inspector = renderToStaticMarkup(<ActiveEditorProvider><PropertyPanel element={element} interactiveComponents={[entry]} onChange={() => {}} embedded /></ActiveEditorProvider>);
for (const key of ['config', 'density', 'playing', 'mode']) assert(inspector.includes(`editor-interactive-control-input-${key}`), `Rendered inspector omits schema field ${key}`);
assert(inspector.includes('data-control-type="json"') && inspector.includes('data-control-type="boolean"'));
assert(inspector.includes('Initial') && inspector.includes('teal'), 'Nested authored JSON defaults are visible in the actual inspector');
const reopened = normalizeSavedCanvasContent(serializeCanvasContent([element], { width: 1200, height: 900 })).elements[0];
assert.deepEqual(reopened.dataBindings, entry.dataBindings, 'Registered bindings are canonical top-level Canvas bindings too');
assert.equal(reopened.props.version, '1.0.204'); assert.deepEqual(reopened.props.config, props.config); assert.deepEqual(reopened.props.propsSchema, props.propsSchema); assert.deepEqual(reopened.props.dataBindings, entry.dataBindings); assert.deepEqual(reopened.props.fallback, props.fallback);
reopened.props.config.palette[0] = 'amber'; reopened.props.dataBindings[0].extension.retain = false;
assert.equal(JSON.stringify(entry), original, 'Canvas insertion/save/reopen must not mutate catalog metadata');
const reselected = registeredComponentProps(entry, { ...element.props, config: { palette: ['authored'] }, controls: [{ key: 'density', value: 8 }], propsSchema: { ...element.props.propsSchema, customSchemaExtension: { retain: true } } });
assert.deepEqual(reselected.config, { palette: ['authored'] }); assert.equal((reselected.controls as any)[0].value, 8); assert.deepEqual((reselected.propsSchema as any).customSchemaExtension, { retain: true });
const switched = registeredComponentProps({ ...entry, version: '2.0.0', defaultProps: { config: { palette: ['graphite'] } }, renderMode: 'trusted-component' }, { ...element.props, customAuthorExtension: { preserve: true } });
assert.equal(switched.version, '2.0.0'); assert.deepEqual(switched.config, { palette: ['graphite'] }); assert.deepEqual(switched.customAuthorExtension, { preserve: true }); assert.equal(switched.sandboxUrl, undefined);
const fields = registeredComponentControls(props.controls, props.propsSchema);
assert.equal(fields.find(field => field.key === 'config')?.type, 'json'); assert.equal(fields.find(field => field.key === 'playing')?.type, 'boolean');
assert.deepEqual(fields.find(field => field.key === 'mode')?.options, ['one', 'two']); assert.equal(fields.find(field => field.key === 'density')?.type, 'range'); assert.equal(fields.find(field => field.key === 'density')?.max, 12);
assert.equal(registeredComponentControls([], { properties: JSON.parse('{"__proto__":{},"constructor":{},"prototype":{},"safe":{"type":"number"}}') }).length, 1);
const versions = Array.from({ length: 205 }, (_, index) => ({ ...entry, version: `1.0.${index}` }));
const offsets: number[] = [];
const catalog = await loadInteractiveRegistryPages('/api/admin/sites/site-draft/interactive-components/discovery', 'site-draft', new AbortController().signal, async (url, init) => {
 assert(url.startsWith('/api/admin/')); assert.equal(init.credentials, 'include');
 const offset = Number(new URL(url, 'http://localhost').searchParams.get('offset') || 0); offsets.push(offset);
 return Response.json({ success: true, data: { siteId: 'site-draft', components: versions.slice(offset, offset + 100), pagination: { total: 205, offset, limit: 100, hasMore: offset + 100 < 205 } } });
}, 'include');
assert.deepEqual(offsets, [0, 100, 200]); assert.equal(catalog.components.length, 205); assert.equal(catalog.components[204].version, '1.0.204');
assert.equal(authoringInteractiveEntries(catalog).length, 205);
for (const failure of ['http', 'changed', 'duplicate', 'empty', 'wrong-site']) {
 await assert.rejects(loadInteractiveRegistryPages('/api/catalog', 'site-draft', new AbortController().signal, async (url) => {
   if (!url.includes('?')) return Response.json({ success: true, data: { siteId: 'site-draft', components: versions.slice(0, 100), pagination: { total: 205, offset: 0, hasMore: true } } });
   if (failure === 'http') return new Response('Failed', { status: 500 });
   return Response.json({ success: true, data: { siteId: failure === 'wrong-site' ? 'other' : 'site-draft', components: failure === 'empty' ? [] : failure === 'duplicate' ? versions.slice(0, 100) : versions.slice(100, 200), pagination: { total: failure === 'changed' ? 206 : 205, offset: 100, hasMore: true } } });
 }), /could not load|changed|invalid/, failure);
}
const cancellation = new AbortController();
await assert.rejects(loadInteractiveRegistryPages('/api/catalog', 'site-draft', cancellation.signal, async () => { cancellation.abort(); return Response.json({ success: true, data: catalog }); }), { name: 'AbortError' });
console.log('Canvas registered metadata passed: nested defaults/schema/fullfallback/bindings, typed controls, exact205versions, paginated errors/cancellation and save/reopen preservation.');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
