import assert from 'node:assert/strict';
import type { BackyInteractiveComponentNode, BackyInteractiveRegistryEntry } from '@backy-cms/editor';
import { blogInteractiveInitPayload, blogInteractiveSandboxUrl, loadBlogInteractiveComponents, registeredBlogComponent } from './blogAuthoringInteractive';
import { cloneBlogRichTextValue, preserveBlogRichTextIdentities } from './blogAuthoringSync';

async function main() {
const entry: BackyInteractiveRegistryEntry = { componentKey: 'fixture/signed.widget', version: '1.0.0+review', type: 'codeComponent', status: 'active', renderMode: 'sandbox-iframe', defaultProps: { title: 'Diagram' }, propsSchema: { properties: { title: { type: 'string' } } }, runtime: { sandboxUrl: 'https://attacker.test/execute', iframeSandbox: ['allow-same-origin', 'allow-top-navigation'] } };
const controller = new AbortController();
let calls = 0;
const entries = await loadBlogInteractiveComponents('https://backy.example/api/', 'site /one', controller.signal, async (url, init) => {
 calls++; assert.equal(url, 'https://backy.example/api/sites/site%20%2Fone/interactive-components'); assert.equal(init.credentials, 'omit'); assert.equal(init.method, 'GET'); assert.equal(init.signal, controller.signal); assert.deepEqual(init.headers, { accept: 'application/json' });
 return Response.json({ success: true, data: { siteId: 'site /one', components: [entry, { ...entry, componentKey: 'revoked', status: 'revoked' }, { ...entry, componentKey: 'missing', version: '' }, { ...entry, componentKey: 'unsafe-mode', renderMode: 'raw-jsx' }] } });
});
const disabledEntries = await loadBlogInteractiveComponents('/api', 'site-a', controller.signal, async () => Response.json({ success: true, data: { siteId: 'site-a', contract: { sandbox: { enabled: false } }, components: [entry] } }));
assert.equal(disabledEntries[0].runtimeAvailable, false); assert(String(disabledEntries[0].runtimeUnavailableReason).includes('disabled for this site'));
assert.equal(calls, 1); assert.deepEqual(entries, [entry]); assert.deepEqual(entries[0].propsSchema, entry.propsSchema);
await assert.rejects(loadBlogInteractiveComponents('/api', 'site-a', controller.signal, async () => Response.json({ success: true, data: { siteId: 'site-b', components: [entry] } })), /invalid response/);
await assert.rejects(loadBlogInteractiveComponents('/api', 'site-a', controller.signal, async () => Response.json({ success: true, data: { siteId: 'site-a', components: {} } })), /invalid response/);
await assert.rejects(loadBlogInteractiveComponents('/api', 'site-a', controller.signal, async () => new Response('Forbidden', { status: 403 })), /could not load/);
const aborted = new AbortController(); aborted.abort();
await assert.rejects(loadBlogInteractiveComponents('/api', 'site-a', aborted.signal, async () => { throw new Error('Should never fetch'); }), { name: 'AbortError' });
const inFlight = new AbortController();
await assert.rejects(loadBlogInteractiveComponents('/api', 'site-a', inFlight.signal, async () => { inFlight.abort(); return Response.json({ success: true, data: { siteId: 'site-a', components: [entry] } }); }), { name: 'AbortError' });

const node: BackyInteractiveComponentNode = { type: 'interactive_component', componentKey: entry.componentKey, version: entry.version, elementType: entry.type, props: { title: 'Authored title', unknownExtension: { retain: true } }, controls: [{ key: 'title', value: 'Authored title', extra: 'retain' }], fallback: { title: 'Fallback', html: '<script>never execute</script>' }, renderCapabilities: { hydrationMode: 'sandbox-iframe' }, dataBindings: [{ collectionId: 'published', targetPath: 'props.rows', extension: { retained: true } }], runtime: { sandboxUrl: 'https://saved-attacker.test/arbitrary' }, customExtension: { retained: true }, id: 'node-id', _id: 'saved-node-id', children: [{ text: '' }] };
assert.equal(registeredBlogComponent(node, entries), entries[0]);
assert.equal(registeredBlogComponent({ ...node, version: 'old' }, entries), undefined);
assert.equal(registeredBlogComponent({ ...node, elementType: 'interactiveFigure' }, entries), undefined);
assert.equal(registeredBlogComponent(node, [{ ...entry, status: 'revoked' }]), undefined);
const trustedUrl = 'https://backy.example/api/sites/site%20%2Fone/interactive-components/fixture%2Fsigned.widget/1.0.0%2Breview/sandbox';
assert.equal(blogInteractiveSandboxUrl('https://backy.example/api', 'site /one', entry, 'https://admin.example'), trustedUrl);
assert.equal(blogInteractiveSandboxUrl('/api', 'site /one', entry, 'https://admin.example'), trustedUrl.replace('https://backy.example', 'https://admin.example'));
for (const base of ['javascript:alert(1)', 'https://user:pass@backy.example/api', 'https://backy.example/api?token=secret', 'https://backy.example/api#saved', 'https://backy.example/arbitrary', 'https://[invalid']) assert.equal(blogInteractiveSandboxUrl(base, 'site-a', entry, 'https://admin.example'), '');
for (const invalidEntry of [{ ...entry, runtimeAvailable: false }, { ...entry, status: 'revoked' }, { ...entry, type: 'interactiveFigure' as const }, { ...entry, renderMode: 'trusted-component' as const }]) assert.equal(blogInteractiveSandboxUrl('/api', 'site-a', invalidEntry, 'https://admin.example'), '');
const payload = blogInteractiveInitPayload(node);
assert.deepEqual(payload.dataBindings, node.dataBindings); assert.deepEqual(payload.props, node.props); assert.deepEqual(payload.controls, node.controls); assert.equal(payload.componentKey, entry.componentKey); assert.equal(payload.version, entry.version);
assert(!JSON.stringify(payload).includes('attacker.test'), 'Saved runtime URLs are never forwarded to the sandbox.');
const serialized = JSON.stringify(node);
const reopened = cloneBlogRichTextValue([node]);
const edited = [{ ...reopened[0], props: { ...reopened[0].props, title: 'Edited' }, id: 'generated-id', _id: 'generated-private-id' }];
const stored = preserveBlogRichTextIdentities([node], edited)[0];
assert.equal(stored.id, node.id); assert.equal(stored._id, node._id); assert.equal(stored.version, node.version); assert.deepEqual(stored.customExtension, node.customExtension); assert.deepEqual(stored.dataBindings, node.dataBindings); assert.deepEqual(stored.props.unknownExtension, node.props.unknownExtension); assert.equal(JSON.stringify(node), serialized);
console.log('Blog interactive authoring tests passed: public registry scope/cancellation, registered identity, safe sandbox path, bindings and save/reopen metadata.');
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
