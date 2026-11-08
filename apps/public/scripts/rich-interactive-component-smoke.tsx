import assert from 'node:assert/strict';
import React from 'react';
import { renderToString } from 'react-dom/server';
import { canvasElementsToBackyContentDocument, canvasContentPayloadToBackyContentDocument } from '@backy-cms/core';
import { RichTextContent } from '../src/components/RichTextContent';
import { InteractiveComponentElement, buildInteractiveSandboxPayload } from '../src/components/InteractiveComponentContent';
import { loadRichInteractiveRegistryEntry, resolveRichInteractiveRegistryEntry, richInteractiveRuntimeElement } from '../src/components/RegisteredRichInteractiveComponent';
import { sanitizePublicInteractiveComponentMetadata } from '../src/lib/publicInteractiveComponentMetadata';
import { resolveRichInteractiveComponentBindings } from '../src/lib/renderPayload';

async function main() {
  const siteId = 'article-widget-site';
  const node: any = { type: 'interactive_component', id: 'authored-widget', componentKey: 'fixture.reviewed-widget', version: '1.2.3', elementType: 'codeComponent',
    props: { count: 7, title: 'Reviewed widget', label: 'Authored placeholder', sandboxUrl: 'https://evil.invalid/frame', sandbox: 'allow-scripts allow-same-origin', jsx: '<script>unexecuted author data</script>', password: 'never forward', extra: { preserve: true } },
    controls: [{ key: 'count', type: 'number', value: 7 }], propsSchema: { type: 'object', properties: { count: { type: 'number' } } },
    fallback: { title: 'Readable widget fallback', html: '<strong>Fallback evidence</strong><script>evil()</script><svg/onload="evil()"><a href="jav&#x61;script:evil()">Unsafe link</a></svg>', imageUrl: 'javascript:evil()' },
    renderCapabilities: { hydrationMode: 'sandbox-iframe', runtimeUrl: 'https://evil.invalid/runtime' },
    dataBindings: [{ id: 'binding-live-label', elementId: 'authored-widget', targetPath: 'props.label', mode: 'text', source: { kind: 'collection', collectionId: 'labels', field: 'label', recordId: 'label-record' } }],
    customMetadata: { unknown: ['preserved'] }, children: [{ text: '' }] };
  const before = JSON.stringify(node);
  const element = { id: 'article-body', type: 'paragraph', props: { content: [node] }, children: [] };
  const document = canvasElementsToBackyContentDocument({ id: 'article-doc', kind: 'post', title: 'Article', elements: [element] });
  const reopened = canvasContentPayloadToBackyContentDocument({ id: 'article-doc', kind: 'post', title: 'Article', rawContent: JSON.parse(JSON.stringify({ contentDocument: document, elements: document.elements })) });
  assert.deepEqual((reopened.elements[0].props.content as any)[0], node, 'Canonical save/reopen retains controls, schemas, bindings and all unknown node fields');
  const ssr = renderToString(<RichTextContent value={[node]} siteId={siteId} />);
  assert.equal(ssr, renderToString(<RichTextContent value={[node]} siteId={siteId} />), 'SSR fallback is deterministic before client registry hydration');
  assert(ssr.includes('Fallback evidence') && ssr.includes('data-backy-rich-interactive-status="pending"'));
  for (const unsafe of ['<iframe', '<script', '<svg', 'onload=', 'javascript:', 'https://evil.invalid']) assert(!ssr.includes(unsafe), `SSR fallback leaked ${unsafe}`);
  const entry: any = { componentKey: node.componentKey, version: node.version, type: 'codeComponent', status: 'active', reviewStatus: 'approved', source: 'registry', renderMode: 'sandbox-iframe', integrity: { signed: true, signatureRequiredForCustomCode: true }, defaultProps: { optional: 42 } };
  const payload = { success: true, data: { siteId, components: [entry], contract: { sandbox: { enabled: true } } } };
  assert.equal(resolveRichInteractiveRegistryEntry(siteId, node, payload), entry);
  const { reviewStatus: _review, ...publicEntry } = entry;
  assert.equal(resolveRichInteractiveRegistryEntry(siteId, node, { ...payload, data: { ...payload.data, components: [publicEntry] } }), publicEntry, 'Public discovery DTO admits already server-reviewed entries without exposing review workflow fields');
  let requested = '';
  const fetched = await loadRichInteractiveRegistryEntry(siteId, node, new AbortController().signal, async (url, options) => { requested = String(url); assert.equal(options?.credentials, 'omit'); assert.equal(options?.cache, 'no-store', 'Exact-version admission must recheck current review state on every mount'); return new Response(JSON.stringify(payload)); });
  assert.deepEqual(fetched, entry); assert.equal(requested, `/api/sites/${siteId}/interactive-components/${node.componentKey}/${node.version}`);
  await assert.rejects(() => loadRichInteractiveRegistryEntry(siteId, node, new AbortController().signal, async (_url, options) => { assert.equal(options?.cache, 'no-store'); return new Response(JSON.stringify({ success: false }), { status: 404 }); }), /unavailable/, 'Revoked exact version must fail admission rather than reuse the previously approved registry payload');
  for (const invalid of [
    { ...payload, data: { ...payload.data, siteId: 'other-site' } },
    ...[{ ...entry, version: '9.9.9' }, { ...entry, status: 'disabled' }, { ...entry, reviewStatus: 'draft' }, { ...entry, type: 'interactiveFigure' }, { ...entry, siteId: 'other-site' }, { ...entry, integrity: { signed: false } }].map((entry) => ({ ...payload, data: { ...payload.data, components: [entry] } })),
    { ...payload, data: { ...payload.data, contract: { sandbox: { enabled: false } } } },
  ]) assert.throws(() => resolveRichInteractiveRegistryEntry(siteId, node, invalid), /unavailable/);
  assert.throws(() => resolveRichInteractiveRegistryEntry(siteId, { ...node, siteId: 'other-site' }, payload), /unavailable/);
  const runtime = richInteractiveRuntimeElement(siteId, node, entry);
  assert.equal(runtime.props.sandboxUrl, `/api/sites/${siteId}/interactive-components/${node.componentKey}/${node.version}/sandbox`);
  assert.equal(runtime.props.sandbox, undefined); assert.equal(runtime.props.optional, 42);
  const mounted = renderToString(<InteractiveComponentElement element={runtime} siteId={siteId} />);
  assert(mounted.includes('<iframe') && mounted.includes('sandbox="allow-scripts allow-forms"'));
  assert(!mounted.includes('https://evil.invalid') && !mounted.includes('allow-same-origin'));
  const init = buildInteractiveSandboxPayload(runtime, node.componentKey, node.version, node.fallback, siteId);
  assert.deepEqual(init.dataBindings, node.dataBindings); assert.deepEqual(init.controls, node.controls); assert.deepEqual(init.propsSchema, node.propsSchema);
  assert.equal(init.siteId, siteId); assert.equal(init.readOnly, true); assert.equal((init.props as any).password, undefined); assert.equal((init.props as any).sandboxUrl, undefined);
  assert.equal((init.fallback as any).imageUrl, '');
  for (const unsafe of ['<script', '<svg', 'onload=', 'javascript:']) assert(!String((init.fallback as any).html).includes(unsafe), `Sandbox fallback payload leaked ${unsafe}`);
  const privateMetadata = { title: 'Public', nested: { count: 2, tokenCount: 3, tokenIndex: 1, attentionTokens: ['one', 'two'], sessionCount: 4, password: 'remove', accessToken: 'remove', refresh_token: 'remove', sessionId: 'remove', admin: { email: 'remove' }, provider: { config: 'remove' }, providerConfig: { key: 'remove' }, adminEnvelope: { key: 'remove' }, innocuous: '  bEaReR credential', alias: '  POSTGRES://private-db' }, apiKey: 'remove', propsSchema: { properties: { count: { type: 'number' }, tokenCount: { type: 'number' }, password: { default: 'remove' } }, required: ['count', 'tokenCount', 'password'] } };
  const originalMetadata = JSON.stringify(privateMetadata);
  const safe: any = sanitizePublicInteractiveComponentMetadata(privateMetadata);
  assert.deepEqual(safe.nested, { count: 2, tokenCount: 3, tokenIndex: 1, attentionTokens: ['one', 'two'], sessionCount: 4 }); assert.deepEqual(safe.propsSchema.required, ['count', 'tokenCount']); assert(!JSON.stringify(safe).includes('remove'));
  assert.equal(JSON.stringify(privateMetadata), originalMetadata, 'Discovery scrubbing leaves authored metadata untouched');
  assert.equal(sanitizePublicInteractiveComponentMetadata({ oversized: Array(2001).fill(1) }), undefined, 'Resource limits never forward a silently truncated dataset');
  const collection: any = { id: 'labels', siteId, status: 'published', permissions: { publicRead: true }, fields: [{ key: 'label', type: 'text' }] };
  const record: any = { id: 'label-record', siteId, collectionId: 'labels', status: 'published', values: { label: 'Current published label' } };
  const dataSource = { getCollectionByIdOrSlug: () => collection, getCollectionRecordByIdOrSlug: () => record };
  const bound: any = resolveRichInteractiveComponentBindings(siteId, [node], { dataSource });
  assert.equal(bound[0].props.label, 'Current published label'); assert.deepEqual(bound[0].dataBindings, node.dataBindings); assert.deepEqual(bound[0].customMetadata, node.customMetadata);
  const boundInit = buildInteractiveSandboxPayload(richInteractiveRuntimeElement(siteId, bound[0], entry), node.componentKey, node.version, node.fallback, siteId);
  assert.equal((boundInit.props as any).label, 'Current published label'); assert.deepEqual(boundInit.dataBindings, node.dataBindings);
  for (const unavailable of [{ ...collection, permissions: { publicRead: false } }, { ...collection, siteId: 'other-site' }, { ...collection, status: 'draft' }]) {
    const denied: any = resolveRichInteractiveComponentBindings(siteId, [node], { dataSource: { ...dataSource, getCollectionByIdOrSlug: () => unavailable } });
    assert.equal(denied[0].props.label, 'Authored placeholder');
  }
  for (const unavailable of [undefined, { ...record, status: 'draft', values: { label: 'PRIVATE RECORD' } }, { ...record, siteId: 'other-site', values: { label: 'PRIVATE RECORD' } }, { ...record, collectionId: 'private-labels', values: { label: 'PRIVATE RECORD' } }]) {
    const denied: any = resolveRichInteractiveComponentBindings(siteId, [node], { dataSource: { ...dataSource, getCollectionRecordByIdOrSlug: () => unavailable } });
    assert.equal(denied[0].props.label, 'Authored placeholder'); assert(!JSON.stringify(denied).includes('PRIVATE RECORD'));
  }
  for (const fields of [[], [{ key: 'label', type: 'text' }, { key: 'label', type: 'text' }]]) {
    const denied: any = resolveRichInteractiveComponentBindings(siteId, [node], { dataSource: { ...dataSource, getCollectionByIdOrSlug: () => ({ ...collection, fields }) } });
    assert.equal(denied[0].props.label, 'Authored placeholder', 'Undeclared or ambiguous fields never bind');
  }
  let recordReads = 0;
  const checkedOnce: any = resolveRichInteractiveComponentBindings(siteId, [node], { dataSource: { ...dataSource, getCollectionRecordByIdOrSlug: () => ++recordReads === 1 ? record : { ...record, status: 'draft', values: { label: 'PRIVATE RECORD' } } } });
  assert.equal(recordReads, 1); assert.equal(checkedOnce[0].props.label, 'Current published label');
  for (const binding of [
    { ...node.dataBindings[0], source: { ...node.dataBindings[0].source, path: 'label.privateReference' } },
    { ...node.dataBindings[0], query: { fieldKey: 'reference.privateField' } },
    { ...node.dataBindings[0], query: { sortBy: 'undeclaredPrivateField' } },
  ]) {
    const denied: any = resolveRichInteractiveComponentBindings(siteId, [{ ...node, dataBindings: [binding] }], { dataSource: { ...dataSource, getCollectionRecordByIdOrSlug: () => { throw new Error('Rejected reference/undeclared query must never read a record'); } } });
    assert.equal(denied[0].props.label, 'Authored placeholder');
  }
  assert.equal(JSON.stringify(node), before, 'SSR, runtime adaptation and binding projection leave the authored node intact');
  console.log('Registered article widgets: canonical reopen, deterministic safe SSR fallback, site/key/version/type/review/signature boundary, identity-only iframe, public metadata scrubbing, read-only controls/schema/binding init and current public binding projection passed.');
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
