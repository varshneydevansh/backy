/** Mounted compose/reply/thread controls with deferred transport. No real mail sends. */
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { MailboxComposer } from '../src/components/settings/MailboxComposer';
import { SiteMailboxWorkspace } from '../src/components/settings/SiteMailboxWorkspace';
import { MailboxThread } from '../src/components/settings/MailboxThread';
export async function runSiteMailboxSendingMountedTests(container: HTMLElement) {
  const realFetch = globalThis.fetch, requests: any[] = [], checks: { name: string; passed: boolean }[] = [];
  let denied = 0, opened = 0;
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  globalThis.fetch = (async (url: any, init: RequestInit = {}) => new Promise<Response>(resolve => requests.push({ url: new URL(String(url), location.origin), init, complete: (data: unknown, status = 200) => resolve(Response.json({ success: status === 200, requestId: 'synthetic', ...(status === 200 ? { data } : { error: { message: 'Synthetic failure' } }) }, { status })) }))) as typeof fetch;
  const root = createRoot(container), props = { base: '/api/admin/sites/site-a/settings/mailboxes', siteId: 'site-a', bindingId: 'primary', address: 'from@example.test', outgoingAttachments: true, onAccessDenied: () => { denied++; } };
  const check = (name: string, passed: boolean) => { checks.push({ name, passed }); if (!passed) throw Error(name); };
  const button = (text: string) => { const result = Array.from(container.querySelectorAll<HTMLButtonElement>('button')).find(row => row.textContent === text); if (!result) throw Error('Missing ' + text); return result; };
  const click = async (text: string) => { await act(async () => button(text).click()); };
  const edit = async (label: string, value: string) => { const element = container.querySelector<HTMLInputElement | HTMLTextAreaElement>(`[aria-label="${label}"]`)!; const setter = Object.getOwnPropertyDescriptor(element instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype, 'value')!.set!; await act(async () => { setter.call(element, value); element.dispatchEvent(new Event('input', { bubbles: true })); }); };
  const complete = async (data: unknown, status = 200) => { await act(async () => requests.at(-1).complete(data, status)); };
  const attempt = (key: string, state = 'accepted') => ({ id: 'synthetic-attempt', idempotencyKey: key, state, statusCode: state === 'accepted' ? 204 : null, createdAt: '2026-10-13T00:00:00Z', updatedAt: '2026-10-13T00:00:00Z' });
  const envelope = (key: string, state = 'accepted', bindingId = 'primary') => ({ schema: 'backy.mailbox-send.v1', siteId: 'site-a', bindingId, attempt: attempt(key, state), outcomePersisted: true, providerAccepted: state === 'accepted', automaticRetry: false, deliveryVerified: false, replayed: false });
  try {
    await act(async () => root.render(<MailboxComposer {...props} />)); check('Opening compose never sends or loads private history automatically', requests.length === 0);
    await click('Compose message'); await edit('Mail recipients', 'to@example.test'); await edit('Mail subject', 'Authored subject'); await edit('Mail body', 'Authored text');
    const input = container.querySelector<HTMLInputElement>('[aria-label="Outgoing mail attachments"]')!, file = new File(['bytes'], 'report.txt', { type: 'text/plain' });
    await act(async () => { Object.defineProperty(input, 'files', { configurable: true, value: [file] }); input.dispatchEvent(new Event('change', { bubbles: true })); await new Promise(resolve => setTimeout(resolve, 30)); });
    check('Selected bytes are retained locally until explicit Send', requests.length === 0 && container.textContent?.includes('report.txt') === true);
    await act(async () => { const sendButton = button('Send message'); sendButton.click(); sendButton.click(); });
    const sent = requests.at(-1), payload = JSON.parse(sent.init.body as string);
    check('Double-click dispatches exactly one Owner-cookie send', requests.length === 1 && sent.init.credentials === 'include' && sent.init.redirect === 'error' && sent.init.cache === 'no-store');
    check('Send carries authored fields and canonical base64 attachment without a sender override', payload.to[0] === 'to@example.test' && payload.subject === 'Authored subject' && payload.text === 'Authored text' && payload.attachments[0].filename === 'report.txt' && payload.attachments[0].content === btoa('bytes') && !('from' in payload));
    await complete(envelope(payload.idempotencyKey)); check('Acceptance is explicit and delivery remains unverified', container.textContent?.includes('Recipient delivery remains unverified') === true && button('Send message').disabled && !container.textContent?.includes('report.txt'));
    await click('Check send history'); check('Send history is a read request', requests.at(-1).init.method !== 'POST'); await complete({ schema: 'backy.mailbox-send-attempts.v1', siteId: 'site-a', bindingId: 'primary', attempts: [attempt(payload.idempotencyKey)], pagination: { page: 1, perPage: 20, total: 1, totalPages: 1 } }); check('History shows durable result without message bytes', container.textContent?.includes('synthetic-attempt') === true);
    await click('Create another message'); await edit('Mail recipients', 'to@example.test'); await edit('Mail body', 'Uncertain draft'); await click('Send message'); const uncertain = JSON.parse(requests.at(-1).init.body as string); await complete(envelope(uncertain.idempotencyKey, 'uncertain')); const before = requests.length; await act(async () => { await Promise.resolve(); button('Send message').click(); }); check('Uncertain send locks draft and never retries automatically', requests.length === before && container.textContent?.includes('Send completion is unknown') === true);
    await act(async () => root.render(<MailboxComposer key="reply" {...props} reply={{ uid: 8, folder: 'INBOX', subject: 'Original', to: 'sender@example.test' }} />)); check('Reply starts with source sender and subject', container.querySelector<HTMLInputElement>('[aria-label="Mail recipients"]')?.value === 'sender@example.test' && container.querySelector<HTMLInputElement>('[aria-label="Mail subject"]')?.value === 'Re: Original');
    await edit('Mail body', 'Reply body'); await click('Send reply'); const reply = JSON.parse(requests.at(-1).init.body as string); check('Reply sends the exact folder and source UID', reply.inReplyTo.folder === 'INBOX' && reply.inReplyTo.uid === 8); const late = requests.at(-1);
    await act(async () => root.render(<MailboxComposer key="other-context" {...props} bindingId="other" />)); await act(async () => late.complete(envelope(reply.idempotencyKey))); check('Context switch erases private draft and discards delayed send outcome', !container.textContent?.includes('Reply body') && !container.textContent?.includes('Hostinger accepted'));
    await click('Compose message'); await edit('Mail recipients', 'to@example.test'); await click('Send message'); await complete({}, 403); check('Current send denial invokes workspace access clearing', denied === 1);
    await act(async () => root.render(<MailboxThread {...props} folder="INBOX" uid={8} onOpen={() => { opened++; }} />)); check('Thread text is unavailable until explicit action', !container.querySelector('pre'));
    await click('Load related messages'); const row = { uid: 8, path: 'INBOX', date: '2026-10-13', flags: [], unseen: true, size: 1, subject: 'Related subject', from: null, to: [] };
    await complete({ schema: 'backy.mailbox-thread.v1', siteId: 'site-a', bindingId: 'primary', folder: 'INBOX', uid: 8, source: row, messages: [row], relationship: 'direct-header-links', folderScope: 'selected-folder', textMarksSeen: false, sourceHasThreadHeaders: true, searchPagination: { page: 1, perPage: 20, total: 1, totalPages: 1 } });
    check('Thread metadata loads by GET and reports bounded folder coverage', requests.at(-1).init.method !== 'POST' && container.textContent?.includes('Other folders and deeper reply branches') === true); await click('Open and mark read'); check('Opening related message is a separate explicit read action', opened === 1);
    for (const status of [401, 403]) for (const operation of ['send', 'history', 'thread']) {
      await act(async () => root.render(<SiteMailboxWorkspace key={`scope-${status}-${operation}`} siteId="site-a" canView={true} contextKey={`${status}-${operation}`} />));
      await complete({ schema: 'backy.site-mailboxes.v1', siteId: 'site-a', provider: 'hostinger', configured: true, mailboxes: [{ id: 'primary', address: 'from@example.test' }], capabilities: { folders: true, messageInventory: true, messageText: true, readMarksSeen: true, compose: true, reply: true, attachments: true, outgoingAttachments: true, threadInventory: true, sendHistory: true, provisioning: false } });
      await complete({ schema: 'backy.mailbox-folders.v1', siteId: 'site-a', bindingId: 'primary', folders: [{ path: 'INBOX', name: 'Inbox', delimiter: '/', specialUse: null, messageCount: 1, unreadCount: 1 }], pagination: { page: 1, perPage: 20, total: 1, totalPages: 1 } });
      await complete({ schema: 'backy.mailbox-messages.v1', siteId: 'site-a', bindingId: 'primary', folder: 'INBOX', messages: [{ ...row, subject: 'Private cached subject', from: { name: 'Sender', address: 'sender@example.test' } }], pagination: { page: 1, perPage: 20, total: 1, totalPages: 1 } });
      await click('Open and mark read'); await complete({ schema: 'backy.mailbox-read.v1', siteId: 'site-a', bindingId: 'primary', folder: 'INBOX', uid: 8, text: 'Private cached body', readMarksSeen: true });
      if (operation === 'history') await click('Check send history');
      else if (operation === 'thread') await click('Load related messages');
      else { await click('Compose message'); await edit('Mail recipients', 'reader@example.test'); await edit('Mail body', 'Private composed draft'); await click('Send message'); }
      await complete({}, status);
      check(`Current ${operation} ${status} clears workspace private content, drafts and action controls`, container.textContent?.includes('Mailbox access denied') === true && !container.textContent?.includes('Private cached') && !container.textContent?.includes('Private composed') && container.querySelector('textarea') === null && container.querySelector('[aria-label="Message thread"]') === null && container.querySelector('[aria-label="Send history"]') === null);
      const after = requests.length; await act(async () => { await Promise.resolve(); }); check(`Current ${operation} ${status} never retries after denial`, requests.length === after);
    }
    return { ok: true, checks, boundary: 'Actual mounted compose/reply/thread components and synthetic deferred HTTP only; no provider proof.' };
  } catch (error) { return { ok: false, checks, error: error instanceof Error ? error.message : String(error) }; }
  finally { await act(async () => root.unmount()); globalThis.fetch = realFetch; (globalThis as any).IS_REACT_ACT_ENVIRONMENT = false; }
}
