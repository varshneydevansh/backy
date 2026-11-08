/** Actual mounted workspace/client/browser-delivery callbacks, controlled private transport only. */
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { SiteMailboxWorkspace, type SiteMailboxWorkspaceProps } from '../src/components/settings/SiteMailboxWorkspace';
type Pending = { url: URL; init: RequestInit; done: boolean; finish: (body: BodyInit, status: number, headers: HeadersInit) => void; fail: () => void };
const page = { page: 1, perPage: 20, total: 1, totalPages: 1 };
const capabilities = { folders: true, messageInventory: true, messageText: true, readMarksSeen: true, attachments: true, compose: false, reply: false, provisioning: false };
const attachmentRows = [
  { id: 'opaque/part one', filename: 'report.html', contentType: 'text/html', sizeBytes: 3, inline: false },
  { id: 'image-two', filename: 'photo.png', contentType: 'image/png', sizeBytes: 3, inline: true },
  { id: 'too-large', filename: 'large.zip', contentType: 'application/zip', sizeBytes: 3 * 1024 * 1024 + 1, inline: false },
];
export async function runSiteMailboxAttachmentMountedTests(container: HTMLElement) {
  const realFetch = globalThis.fetch, realCreate = URL.createObjectURL, realRevoke = URL.revokeObjectURL, realClick = HTMLAnchorElement.prototype.click, realTimeout = AbortSignal.timeout;
  const deadlines: AbortController[] = [];
  AbortSignal.timeout = () => { const controller = new AbortController(); deadlines.push(controller); return controller.signal; };
  const requests: Pending[] = [], deliveries: { filename: string; href: string }[] = [], blobs: Blob[] = [], revoked: string[] = [], checks: { name: string; passed: boolean }[] = [];
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  URL.createObjectURL = blob => { blobs.push(blob as Blob); return `blob:attachment-fixture-${blobs.length}`; };
  URL.revokeObjectURL = url => { revoked.push(url); };
  HTMLAnchorElement.prototype.click = function () { deliveries.push({ filename: this.download, href: this.href }); };
  globalThis.fetch = (async (input: RequestInfo | URL, init: RequestInit = {}) => new Promise<Response>((resolve, reject) => {
    const row: Pending = { url: new URL(String(input), location.origin), init, done: false,
      finish(body, status, headers) { row.done = true; resolve(new Response(body, { status, headers })); }, fail() { row.done = true; reject(Error('PRIVATE_UPSTREAM_DETAILS')); } };
    requests.push(row); // Do not honor abort here: UI/loader must suppress stale results itself.
  })) as typeof fetch;
  const root = createRoot(container); let unmounted = false;
  let props: SiteMailboxWorkspaceProps = { siteId: 'site-a', canView: true, contextKey: 'owner-one' }, binding = 'binding-one', folder = 'INBOX', uid = 7;
  const check = (name: string, passed: boolean) => { checks.push({ name, passed }); if (!passed) throw Error(name); };
  const render = async (patch: Partial<SiteMailboxWorkspaceProps> = {}) => { props = { ...props, ...patch }; await act(async () => root.render(<SiteMailboxWorkspace {...props} />)); };
  const pending = (suffix: string) => { const row = requests.findLast(r => !r.done && r.url.pathname.endsWith(suffix)); if (!row) throw Error('Missing request ' + suffix); return row; };
  const json = async (row: Pending, data: unknown, status = 200) => { await act(async () => { row.finish(JSON.stringify({ success: status === 200, requestId: 'fixture-request', ...(status === 200 ? { data } : { error: { message: 'PRIVATE_UPSTREAM_DETAILS' } }) }), status, { 'content-type': 'application/json' }); for(let i=0;i<12;i++) await Promise.resolve(); }); };
  const binary = async (row: Pending, headers: HeadersInit = {}, status = 200) => { await act(async () => { row.finish(new Uint8Array([1, 2, 3]), status, { 'content-type': 'application/octet-stream', 'content-length': '3', 'content-disposition': "attachment; filename*=UTF-8''report.html", 'x-content-type-options': 'nosniff', ...headers }); for(let i=0;i<12;i++) await Promise.resolve(); }); };
  const click = async (label: string, twice = false) => { const button = Array.from(container.querySelectorAll<HTMLButtonElement>('button')).find(b => b.textContent === label || b.getAttribute('aria-label') === label); if (!button) throw Error('Missing button ' + label); await act(async () => { button.click(); if (twice) button.click(); }); };
  const pick = async (label: string, value: string) => { const node = container.querySelector<HTMLSelectElement>(`select[aria-label="${label}"]`)!; await act(async () => { node.value = value; node.dispatchEvent(new Event('change', { bubbles: true })); }); };
  const messages = () => ({ schema: 'backy.mailbox-messages.v1', siteId: props.siteId, bindingId: binding, folder, pagination: { ...page, total: 2 }, messages: [7, 8].map(id => ({ uid: id, path: folder, date: '2026-10-11T12:00:00Z', flags: [], unseen: true, size: 3, subject: `Private subject ${id}`, from: null, to: [] })) });
  const readBody = () => ({ schema: 'backy.mailbox-read.v1', siteId: props.siteId, bindingId: binding, folder, uid, text: 'Private body', readMarksSeen: true });
  const attachmentBody = () => ({ schema: 'backy.mailbox-attachments.v1', siteId: props.siteId, bindingId: binding, folder, uid, attachments: attachmentRows });
  const load = async () => {
    await json(pending('/mailboxes'), { schema: 'backy.site-mailboxes.v1', siteId: props.siteId, provider: 'hostinger', configured: true, mailboxes: [{ id: 'binding-one', address: 'one@example.test' }, { id: 'binding-two', address: 'two@example.test' }], capabilities });
    await pick('Mailbox', binding); await json(pending(`/${binding}/folders`), { schema: 'backy.mailbox-folders.v1', siteId: props.siteId, bindingId: binding, folders: [{ path: 'INBOX', name: 'Inbox', delimiter: '/', specialUse: null, messageCount: 2, unreadCount: 2 }, { path: 'Archive', name: 'Archive', delimiter: '/', specialUse: null, messageCount: 2, unreadCount: 2 }], pagination: { ...page, total: 2 } });
    await json(pending(`/${binding}/messages`), messages());
  };
  const open = async () => { await click(`Open and mark read: Private subject ${uid}`); await json(pending(`/${binding}/messages/${uid}/read`), readBody()); };
  const list = async () => { await click('Load attachments', true); await json(pending('/attachments'), attachmentBody()); };
  const setup = async () => { await load(); await open(); await list(); };
  const download = () => click('Download attachment: report.html', true);
  const denied = (label: string) => check(label, container.textContent?.includes('Mailbox access denied') === true && !container.textContent?.includes('Private subject') && !container.textContent?.includes('Private body') && !container.textContent?.includes('report.html') && container.querySelectorAll('option').length === 1 && !container.querySelector('[aria-label="Message attachments"]'));
  try {
    await render(); await load(); check('Inbox inventory does not request attachment metadata or bytes', !requests.some(r => r.url.pathname.includes('/attachments')));
    await open(); check('Explicit read remains text only; no automatic attachment load', !requests.some(r => r.url.pathname.includes('/attachments')));
    await click('Load attachments', true); check('Double metadata action admits one exact folder/UID GET', requests.filter(r => r.url.pathname.endsWith('/attachments')).length === 1 && pending('/attachments').url.search === '?folder=INBOX');
    await json(pending('/attachments'), attachmentBody()); check('Multiple attachments are task rows; no active preview or download before click', container.querySelectorAll('[aria-label^="Download attachment:"]').length === 3 && !container.querySelector('img,iframe,object,embed,a') && deliveries.length === 0);
    check('Oversized file is visible with precise disabled limit', container.querySelector<HTMLButtonElement>('[aria-label="Download attachment: large.zip"]')?.disabled === true && container.textContent?.includes('Exceeds the 3 MiB') === true);
    await download(); const first = pending('/download'); check('Double download admits one scoped POST with folder only and encoded opaque ID', requests.filter(r => r.url.pathname.endsWith('/download')).length === 1 && first.url.pathname.includes('/opaque%2Fpart%20one/download') && first.init.method === 'POST' && first.init.body === JSON.stringify({ folder: 'INBOX' }));
    check('Download busy guard disables other attachment actions', Array.from(container.querySelectorAll<HTMLButtonElement>('[aria-label^="Download attachment:"]')).every(b => b.disabled));
    await binary(first); check('Successful bytes dispatch one forced safe-named octet download, never HTML preview', deliveries.length === 1 && deliveries[0].filename === 'report.html' && blobs[0].type === 'application/octet-stream' && !container.querySelector('img,iframe,object,embed,a') && container.textContent?.includes('Check its downloads') === true);
    const beforeSwitch = deliveries.length; await download(); const siteHeld = pending('/download'); await render({ siteId: 'site-b' }); await binary(siteHeld); check('Late download after site switch never saves bytes and removes attachment metadata', deliveries.length === beforeSwitch && !container.textContent?.includes('report.html') && revoked.length > 0);
    await setup(); await download(); const bindingHeld = pending('/download'); await pick('Mailbox', 'binding-two'); await binary(bindingHeld); check('Late download after mailbox switch cannot save or show an error', deliveries.length === beforeSwitch && !container.textContent?.includes('download failed'));
    await render({ contextKey: 'owner-two' }); binding = 'binding-one'; await setup(); await download(); const folderHeld = pending('/download'); await pick('Folder', 'Archive'); folder = 'Archive'; await binary(folderHeld); check('Late previous-folder download is discarded', deliveries.length === beforeSwitch && !container.textContent?.includes('report.html'));
    await json(pending('/binding-one/messages'), messages()); await open(); await list(); await download(); const messageHeld = pending('/download'); uid = 8; await open(); await binary(messageHeld); check('Opening another message cancels old attachment bytes with same inventory key', deliveries.length === beforeSwitch && !container.textContent?.includes('report.html'));
    await list(); await download(); const permissionHeld = pending('/download'); await render({ canView: false }); await binary(permissionHeld); check('Permission loss suppresses held download and removes all private content', deliveries.length === beforeSwitch && !container.textContent?.includes('Private body') && !container.querySelector('select'));
    await render({ canView: true, contextKey: 'owner-three' }); folder = 'INBOX'; uid = 7; await setup(); await download(); const actorHeld = pending('/download'); await render({ contextKey: 'owner-four' }); await binary(actorHeld, {}, 403); check('Late old-actor denial cannot poison current owner context', deliveries.length === beforeSwitch && !container.textContent?.includes('Mailbox access denied'));
    await setup(); await download(); const awayHeld = pending('/download'); await render({ siteId: 'site-a' }); await render({ siteId: 'site-b' }); await binary(awayHeld); check('Away-and-back site scope rejects prior download', deliveries.length === beforeSwitch);
    for (const status of [401, 403]) { await setup(); await download(); await binary(pending('/download'), {}, status); denied(`Current download ${status} clears all cached mail and attachment controls with unchanged UI authority`); const n = requests.length; await act(async () => { await Promise.resolve(); }); check(`Download ${status} never retries automatically`, requests.length === n); await click('Refresh mailboxes'); }
    await load(); await open(); await click('Load attachments'); await json(pending('/attachments'), {}, 403); denied('Current attachment metadata denial clears all cached mail'); await click('Refresh mailboxes');
    await load(); await open(); await click('Load attachments'); const lateMetadata = pending('/attachments'); await render({ siteId: 'site-a' }); await json(lateMetadata, attachmentBody()); check('Late metadata after site switch cannot show filenames', !container.textContent?.includes('report.html'));
    await load(); await open();
    await click('Load attachments'); const stalledMetadata = pending('/attachments'); let streamCancelled = false;
    await act(async () => { stalledMetadata.finish(new ReadableStream({ start(controller) { controller.enqueue(new TextEncoder().encode('{')); }, cancel() { streamCancelled = true; } }), 200, { 'content-type': 'application/json' }); for (let i = 0; i < 12; i++) await Promise.resolve(); });
    await act(async () => { deadlines.at(-1)!.abort(new DOMException('Timed out', 'TimeoutError')); for (let i = 0; i < 12; i++) await Promise.resolve(); });
    check('Stalled metadata stream reaches independent deadline, cancels reader and permits explicit retry', streamCancelled && container.textContent?.includes('could not load') === true && container.querySelector<HTMLButtonElement>('button') !== null && !container.querySelector('[aria-label^="Download attachment:"]'));
    await click('Load attachments'); const largeMetadata = pending('/attachments');
    await act(async () => { largeMetadata.finish(new ReadableStream({ start(controller) { controller.enqueue(new Uint8Array(256 * 1024 + 1)); controller.close(); } }), 200, { 'content-type': 'application/json' }); for (let i = 0; i < 12; i++) await Promise.resolve(); });
    check('Oversized streamed JSON inventory rejected before parsing or rendering rows', container.textContent?.includes('could not load') === true && !container.querySelector('[aria-label^="Download attachment:"]'));
    await click('Load attachments'); const invalidUtf8 = pending('/attachments'); await act(async () => { invalidUtf8.finish(new Uint8Array([0xff]), 200, { 'content-type': 'application/json' }); for (let i = 0; i < 12; i++) await Promise.resolve(); });
    check('Invalid UTF8 inventory rejected with fixed nonleaking error', container.textContent?.includes('could not load') === true && !container.textContent?.includes('PRIVATE_UPSTREAM_DETAILS'));
    await click('Load attachments'); const stalledFetch = pending('/attachments'); await act(async () => { deadlines.at(-1)!.abort(new DOMException('Timed out', 'TimeoutError')); for (let i = 0; i < 12; i++) await Promise.resolve(); });
    check('Ignored network abort still settles metadata deadline without automatic retry', container.textContent?.includes('could not load') === true && !container.querySelector('[aria-label^="Download attachment:"]'));
    await json(stalledFetch, attachmentBody()); check('Late timed-out metadata response cannot publish a stale attachment list', !container.querySelector('[aria-label^="Download attachment:"]'));
    for (const [name, patch] of [['site', { siteId: 'foreign' }], ['binding', { bindingId: 'foreign' }], ['folder', { folder: 'Foreign' }], ['message', { uid: 999 }], ['duplicate IDs', { attachments: [attachmentRows[0], attachmentRows[0]] }], ['unsafe filename', { attachments: [{ ...attachmentRows[0], filename: '../unsafe.html' }] }]] as const) {
      await click('Load attachments'); await json(pending('/attachments'), { ...attachmentBody(), ...patch }); check(`Incompatible ${name} metadata fails closed without download actions`, !container.querySelector('[aria-label^="Download attachment:"]') && container.textContent?.includes('could not load') === true);
    }
    await list(); await download(); await binary(pending('/download'), { 'content-type': 'text/html' }); check('Active-content binary response refused without browser delivery', deliveries.length === beforeSwitch && container.textContent?.includes('download failed') === true);
    await download(); await binary(pending('/download'), { 'content-length': '4' }); check('Truncated binary refused without delivery', deliveries.length === beforeSwitch);
    await download(); await binary(pending('/download'), { 'content-disposition': 'inline; filename="unsafe.html"' }); check('Inline disposition refused without preview/download', deliveries.length === beforeSwitch);
    await download(); const stalledBytes = pending('/download'); let binaryCancelled = false;
    await act(async () => { stalledBytes.finish(new ReadableStream({ start(controller) { controller.enqueue(new Uint8Array([1])); }, cancel() { binaryCancelled = true; } }), 200, { 'content-type': 'application/octet-stream', 'content-length': '3', 'content-disposition': 'attachment; filename="safe.bin"', 'x-content-type-options': 'nosniff' }); for (let i = 0; i < 12; i++) await Promise.resolve(); });
    await act(async () => { deadlines.at(-1)!.abort(new DOMException('Timed out', 'TimeoutError')); for (let i = 0; i < 12; i++) await Promise.resolve(); });
    check('Stalled binary reader reaches independent deadline/cancellation without browser delivery', binaryCancelled && deliveries.length === beforeSwitch && container.textContent?.includes('download failed') === true);
    await download(); await binary(pending('/download'), { 'content-length': String(3 * 1024 * 1024 + 1) }); check('Over-limit advertised binary rejected before reading/saving', deliveries.length === beforeSwitch);
    await download(); await act(async () => pending('/download').fail()); check('Network download failure is safe, explicit and not a success claim', deliveries.length === beforeSwitch && !container.textContent?.includes('PRIVATE_UPSTREAM_DETAILS') && container.textContent?.includes('will not retry automatically') === true);
    await download(); const unmountHeld = pending('/download'); await act(async () => root.unmount()); unmounted = true; await binary(unmountHeld); check('Unmount cancels held private bytes without browser save', deliveries.length === beforeSwitch);
    check('Every attachment request is cookie-only/no-store/no redirects with fresh headers', requests.filter(r => r.url.pathname.includes('/attachments')).every(r => r.init.credentials === 'include' && r.init.cache === 'no-store' && r.init.redirect === 'error' && !['authorization', 'x-api-key', 'x-backy-admin-key', 'x-backy-admin-session'].some(key => new Headers(r.init.headers).has(key))));
    return { ok: true, boundary: 'Actual mounted workspace/client + intercepted forced-browser delivery; synthetic transport and bytes only, no provider/live-save certification.', checks, requests: requests.length, deliveries };
  } catch (error) { return { ok: false, checks, dom:container.innerHTML, error: error instanceof Error ? error.message : String(error) }; }
  finally { if (!unmounted) await act(async () => root.unmount()); globalThis.fetch = realFetch; URL.createObjectURL = realCreate; URL.revokeObjectURL = realRevoke; HTMLAnchorElement.prototype.click = realClick; AbortSignal.timeout = realTimeout; (globalThis as any).IS_REACT_ACT_ENVIRONMENT = false; }
}
