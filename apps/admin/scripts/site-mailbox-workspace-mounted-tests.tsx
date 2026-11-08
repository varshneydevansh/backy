/** Actual mounted component/React DOM. Transport is deliberately controlled; no mailbox/provider access. */
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { SiteMailboxWorkspace, type SiteMailboxWorkspaceProps } from '../src/components/settings/SiteMailboxWorkspace';

type Request = { url: URL; method: string; init: RequestInit; complete: (data: unknown, status?: number) => void; completed: boolean };
const capabilities = { folders: true, messageInventory: true, messageText: true, readMarksSeen: true, compose: false, reply: false, attachments: false, provisioning: false };
const bindings = (siteId: string) => ({ schema: 'backy.site-mailboxes.v1', siteId, provider: 'hostinger', configured: true, mailboxes: [{ id: 'binding-one', address: 'one@example.test' }, { id: 'binding-two', address: 'two@example.test' }], capabilities });
const folderRows = [{ path: 'INBOX', name: 'Inbox', delimiter: '/', specialUse: '\\Inbox', messageCount: 1, unreadCount: 1 }, { path: 'Archive', name: 'Archive', delimiter: '/', specialUse: null, messageCount: 1, unreadCount: 0 }];
const folders = (siteId: string, bindingId: string) => ({ schema: 'backy.mailbox-folders.v1', siteId, bindingId, folders: folderRows, pagination: { page: 1, perPage: 20, total: 2, totalPages: 1 } });
const messages = (siteId: string, bindingId: string, folder = 'INBOX', subject = 'Private subject') => ({ schema: 'backy.mailbox-messages.v1', siteId, bindingId, folder, messages: [{ uid: 7, path: folder, date: '2026-10-11T00:00:00Z', flags: [], unseen: true, size: 48, subject, from: { name: 'Fixture sender', address: 'sender@example.test' }, to: [] }], pagination: { page: 1, perPage: 20, total: 1, totalPages: 1 } });
const read = (siteId: string, bindingId: string, folder = 'INBOX', text = 'Private text') => ({ schema: 'backy.mailbox-read.v1', siteId, bindingId, folder, uid: 7, text, readMarksSeen: true });
export async function runSiteMailboxMountedTests(container: HTMLElement) {
  const realFetch = globalThis.fetch, requests: Request[] = [], checks: { name: string; passed: boolean }[] = [];
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  globalThis.fetch = (async (input: RequestInfo | URL, init: RequestInit = {}) => new Promise<Response>(resolve => {
    const entry: Request = { url: new URL(String(input), location.origin), method: init.method || 'GET', init, completed: false,
      complete(data, status = 200) { entry.completed = true; resolve(new Response(JSON.stringify({ success: status === 200, requestId: 'fixture-request', ...(status === 200 ? { data } : { error: { message: 'Forbidden fixture' } }) }), { status, headers: { 'content-type': 'application/json' } })); } };
    requests.push(entry);
  })) as typeof fetch;
  const root = createRoot(container);
  let props: SiteMailboxWorkspaceProps = { siteId: 'site-a', canView: false, contextKey: 'owner-1', disabledReason: 'Owner permission required' };
  const check = (name: string, condition: boolean) => { checks.push({ name, passed: condition }); if (!condition) throw Error(name); };
  const render = async (patch: Partial<SiteMailboxWorkspaceProps> = {}) => { props = { ...props, ...patch }; await act(async () => { root.render(<SiteMailboxWorkspace {...props} />); }); };
  const pick = async (label: string, value: string) => { const element = container.querySelector<HTMLSelectElement>(`select[aria-label="${label}"]`); if (!element) throw Error(`Missing ${label}`); await act(async () => { element.value = value; element.dispatchEvent(new Event('change', { bubbles: true })); }); };
  const pending = (part: string, method = 'GET') => { const request = requests.findLast(row => !row.completed && row.method === method && row.url.pathname.endsWith(part)); if (!request) throw Error(`Missing request ${method} ${part}`); return request; };
  const complete = async (request: Request, value: unknown, status = 200) => { await act(async () => { request.complete(value, status); }); };
  const clickRead = async () => { const button = container.querySelector<HTMLButtonElement>('button[aria-label^="Open and mark read:"]'); if (!button) throw Error('Missing read button'); await act(async () => { button.click(); button.click(); }); };
  const load = async (siteId: string, bindingId = 'binding-one', subject = 'Private subject') => {
    await complete(pending('/mailboxes'), bindings(siteId)); await pick('Mailbox', bindingId); await complete(pending(`/${bindingId}/folders`), folders(siteId, bindingId)); await complete(pending(`/${bindingId}/messages`), messages(siteId, bindingId, 'INBOX', subject));
  };
  try {
    await render(); check('Denied scope issues no request or cached mailbox content', requests.length === 0 && container.textContent?.includes('Owner permission required') === true);
    await render({ canView: true }); await complete(pending('/mailboxes'), { ...bindings('site-a'), configured: false });
    check('Known bindings without provider token are valid, visible and disabled', container.textContent?.includes('provider is not configured') === true && container.querySelector<HTMLSelectElement>('select[aria-label="Mailbox"]')?.disabled === true && container.querySelectorAll('option').length === 3 && requests.length === 1);
    await act(async () => Array.from(container.querySelectorAll('button')).find(button => button.textContent === 'Refresh mailboxes')!.click()); await complete(pending('/mailboxes'), bindings('site-a'));
    check('Multi-mailbox chooser does not guess binding or mark read', container.querySelector<HTMLSelectElement>('select[aria-label="Mailbox"]')?.value === '' && requests.filter(r => r.method === 'POST').length === 0);
    await pick('Mailbox', 'binding-one'); const oldFolders = pending('/binding-one/folders');
    await pick('Mailbox', 'binding-two'); await complete(oldFolders, folders('site-a', 'binding-one')); check('Delayed foreign binding folders cannot publish state', !container.textContent?.includes('Folder page 1 of 1'));
    await complete(pending('/binding-two/folders'), folders('site-a', 'binding-two')); await complete(pending('/binding-two/messages'), messages('site-a', 'binding-two', 'INBOX', 'Site A private subject'));
    check('Metadata load never performs read POST', requests.filter(r => r.method === 'POST').length === 0);
    await clickRead(); check('Double click issues exactly one explicit read POST', requests.filter(r => r.method === 'POST').length === 1);
    const firstRead = pending('/binding-two/messages/7/read', 'POST'); check('Read request captures explicit folder only', firstRead.init.body === JSON.stringify({ folder: 'INBOX' }));
    await complete(firstRead, read('site-a', 'binding-two', 'INBOX', '<img src="https://remote.invalid/tracker">\nPrivate A body'));
    check('Plain text is escaped and remote media/HTML never mounted', container.querySelector('[data-testid="mailbox-message-text"]')?.textContent?.includes('<img src=') === true && container.querySelector('img,iframe,a') === null);
    await render({ siteId: 'site-b' }); check('Site switch immediately removes old subject and body', !container.textContent?.includes('Site A private subject') && !container.textContent?.includes('Private A body'));
    await load('site-b', 'binding-one', 'Site B subject'); await clickRead(); const readB = pending('/binding-one/messages/7/read', 'POST');
    await pick('Folder', 'Archive'); check('Folder change clears cached subject/body before completion', !container.textContent?.includes('Site B subject') && container.querySelector('[data-testid="mailbox-message-text"]') === null);
    await complete(readB, read('site-b', 'binding-one', 'INBOX', 'Stale folder text')); check('Delayed previous-folder read is ignored', !container.textContent?.includes('Stale folder text'));
    await complete(pending('/binding-one/messages'), messages('site-b', 'binding-one', 'Archive', 'Archive subject')); await clickRead(); const readArchive = pending('/binding-one/messages/7/read', 'POST');
    await pick('Mailbox', 'binding-two'); await complete(readArchive, read('site-b', 'binding-one', 'Archive', 'Stale binding text')); check('Binding change hides all subjects/body and ignores late read', !container.textContent?.includes('Archive subject') && !container.textContent?.includes('Stale binding text'));
    await complete(pending('/binding-two/folders'), folders('site-b', 'binding-two')); const oldMessages = pending('/binding-two/messages');
    await render({ contextKey: 'owner-2' }); await complete(oldMessages, messages('site-b', 'binding-two', 'INBOX', 'Stale session subject')); check('Session/permission epoch replacement ignores old message inventory', !container.textContent?.includes('Stale session subject'));
    await load('site-b', 'binding-one', 'Current session subject'); await clickRead(); const heldRead = pending('/binding-one/messages/7/read', 'POST');
    await render({ canView: false }); check('Permission loss synchronously removes private data and controls', !container.textContent?.includes('Current session subject') && container.querySelector('select') === null);
    await complete(heldRead, read('site-b', 'binding-one', 'INBOX', 'Permission revoked text')); check('Late read after permission loss cannot show body or error', !container.textContent?.includes('Permission revoked text') && !container.textContent?.includes('request failed'));
    const countAfterRevoke = requests.length; await render({ contextKey: 'denied-operator' }); check('Denied role/context makes no further API requests', requests.length === countAfterRevoke);
    await render({ canView: true, contextKey: 'owner-3', siteId: 'site-a' }); const heldInventory = pending('/mailboxes'); await render({ siteId: 'site-b' }); await render({ siteId: 'site-a' });
    await complete(heldInventory, bindings('site-a')); check('Away-and-back site context ignores old inventory', container.querySelectorAll('option').length === 1);
    await complete(pending('/mailboxes'), { ...bindings('site-a'), siteId: 'foreign-site' }); check('Foreign response site fails closed without displaying addresses', container.textContent?.includes('inventory is incompatible') === true && !container.textContent?.includes('one@example.test'));
    const refresh = Array.from(container.querySelectorAll('button')).find(button => button.textContent === 'Refresh mailboxes')!; await act(async () => refresh.click()); await load('site-a');
    await clickRead(); await complete(pending('/binding-one/messages/7/read', 'POST'), { ...read('site-a', 'binding-one'), bindingId: 'foreign-binding' }); check('Foreign read binding is rejected with no body', container.textContent?.includes('response is incompatible') === true && container.querySelector('[data-testid="mailbox-message-text"]') === null);
    await clickRead(); const lateFailure = pending('/binding-one/messages/7/read', 'POST'); await render({ siteId: 'site-b' }); await complete(lateFailure, {}, 403); check('Old-context read denial does not poison new context', !container.textContent?.includes('Mailbox access denied'));
    await complete(pending('/mailboxes'), {}, 403); check('Current denied scope shows clear error without stale mail', container.textContent?.includes('Mailbox access denied') === true && container.querySelector('[data-testid="mailbox-message-text"]') === null);
    const refreshMailbox = async () => { await act(async () => Array.from(container.querySelectorAll('button')).find(button => button.textContent === 'Refresh mailboxes')!.click()); };
    const deniedCache = (name: string) => check(name, container.textContent?.includes('Mailbox access denied') === true && !container.textContent?.includes('Secret cached') && !container.textContent?.includes('Secret body') && container.querySelector('[data-testid="mailbox-message-text"]') === null && container.querySelector('button[aria-label^="Open and mark read:"]') === null && container.querySelector<HTMLSelectElement>('select[aria-label="Mailbox"]')?.disabled === true && container.querySelectorAll('option').length === 1);
    for (const status of [401, 403]) {
      await refreshMailbox(); await load('site-b', 'binding-one', 'Secret cached subject'); await clickRead(); await complete(pending('/binding-one/messages/7/read', 'POST'), read('site-b', 'binding-one', 'INBOX', 'Secret body'));
      await clickRead(); await complete(pending('/binding-one/messages/7/read', 'POST'), {}, status);
      deniedCache(`Current read ${status} erases all cached mail/bindings and blocks reading with unchanged UI authority`);
      const afterDenial = requests.length; await act(async () => { await Promise.resolve(); }); check(`Current read ${status} never automatically retries`, requests.length === afterDenial);
    }
    await refreshMailbox(); await complete(pending('/mailboxes'), bindings('site-b')); await pick('Mailbox', 'binding-one');
    await complete(pending('/binding-one/folders'), { ...folders('site-b', 'binding-one'), pagination: { page: 1, perPage: 20, total: 21, totalPages: 2 } });
    await complete(pending('/binding-one/messages'), messages('site-b', 'binding-one', 'INBOX', 'Secret cached subject')); await clickRead(); await complete(pending('/binding-one/messages/7/read', 'POST'), read('site-b', 'binding-one', 'INBOX', 'Secret body'));
    await act(async () => Array.from(container.querySelectorAll('button')).find(button => button.textContent === 'Next folders')!.click()); const concurrentMessages = pending('/binding-one/messages');
    await complete(pending('/binding-one/folders'), {}, 403); deniedCache('Current paginated folder denial clears all mail and blocks actions');
    check('Folder denial aborts concurrent inventory controller', concurrentMessages.init.signal?.aborted === true); await complete(concurrentMessages, messages('site-b', 'binding-one', 'INBOX', 'Secret cached late subject')); deniedCache('Concurrent success after denial cannot restore private mail');
    const afterFolderDenial = requests.length; await act(async () => { await Promise.resolve(); }); check('Folder denial never automatically reloads inventories', requests.length === afterFolderDenial);
    await refreshMailbox(); await complete(pending('/mailboxes'), bindings('site-b')); await pick('Mailbox', 'binding-one'); await complete(pending('/binding-one/folders'), folders('site-b', 'binding-one'));
    await complete(pending('/binding-one/messages'), { ...messages('site-b', 'binding-one', 'INBOX', 'Secret cached subject'), pagination: { page: 1, perPage: 20, total: 21, totalPages: 2 } }); await clickRead(); await complete(pending('/binding-one/messages/7/read', 'POST'), read('site-b', 'binding-one', 'INBOX', 'Secret body'));
    await act(async () => Array.from(container.querySelectorAll('button')).find(button => button.textContent === 'Next messages')!.click()); await complete(pending('/binding-one/messages'), {}, 401); deniedCache('Current paginated message denial clears all mail and blocks actions');
    const afterMessageDenial = requests.length; await act(async () => { await Promise.resolve(); }); check('Message denial never automatically reloads inventories', requests.length === afterMessageDenial);
    await refreshMailbox(); await load('site-b', 'binding-one', 'Fresh allowed subject'); check('Explicit refresh performs fresh admission and allows metadata without opening message', container.textContent?.includes('Fresh allowed subject') === true && container.querySelector('[data-testid="mailbox-message-text"]') === null);
    check('All reads are explicit POST and no provider addresses/IDs used in routes', requests.filter(r => r.method === 'POST').every(r => /\/messages\/7\/read$/.test(r.url.pathname)) && requests.every(r => !r.url.href.includes('example.test')));
    check('Cookie-only transport cannot inject bearer/session/API-key headers or follow redirects', requests.every(r => r.init.credentials === 'include' && r.init.cache === 'no-store' && r.init.redirect === 'error'
      && !['authorization', 'x-backy-admin-session', 'x-backy-admin-key', 'x-api-key'].some(key => new Headers(r.init.headers).has(key))));
    return { ok: true, boundary: 'Actual mounted SiteMailboxWorkspace/React DOM and dedicated cookie-only transport; synthetic controlled HTTP responses only. No live provider or deployment proof.', checks, requests: requests.map(r => ({ path: r.url.pathname + r.url.search, method: r.method, completed: r.completed })) };
  } catch (error) { return { ok: false, boundary: 'Mounted synthetic transport only', checks, error: error instanceof Error ? error.message : String(error) }; }
  finally { await act(async () => root.unmount()); globalThis.fetch = realFetch; (globalThis as any).IS_REACT_ACT_ENVIRONMENT = false; }
}
