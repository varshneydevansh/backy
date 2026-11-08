import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Notice } from '@/components/ui/Notice';
import { SiteMailboxAccessDenied } from '@/lib/mailboxAttachmentsClient';
type Message = { uid: number; path: string; date: string; flags: string[]; unseen: boolean; size: number; subject: string | null; from: { name: string; address: string } | null; to: { name: string; address: string }[] };
const object = (value: unknown): value is Record<string, any> => !!value && typeof value === 'object' && !Array.isArray(value);
const address = (value: unknown) => object(value) && typeof value.name === 'string' && typeof value.address === 'string';
export function MailboxThread({ base, siteId, bindingId, folder, uid, onOpen, onAccessDenied }: { base: string; siteId: string; bindingId: string; folder: string; uid: number; onOpen: (message: Message) => void; onAccessDenied: (error: SiteMailboxAccessDenied) => void }) {
  const mounted = useRef(true), active = useRef<AbortController | null>(null), busyRef = useRef(false);
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [rows, setRows] = useState<Message[] | null>(null), [page, setPage] = useState(1), [pages, setPages] = useState(1), [headers, setHeaders] = useState(true);
  useEffect(() => () => { mounted.current = false; active.current?.abort(); }, []);
  const load = async (nextPage: number) => {
    if (busyRef.current) return;
    const controller = new AbortController(); active.current = controller; busyRef.current = true; setBusy(true); setError(''); setRows(null);
    try {
      const response = await fetch(`${base}/${encodeURIComponent(bindingId)}/messages/${uid}/thread?${new URLSearchParams({ folder, page: String(nextPage), perPage: '20' })}`, { credentials: 'include', cache: 'no-store', redirect: 'error', signal: AbortSignal.any([controller.signal, AbortSignal.timeout(45_000)]) });
      if ([401, 403].includes(response.status)) throw new SiteMailboxAccessDenied();
      const payload: unknown = await response.json(); controller.signal.throwIfAborted();
      if (!response.ok || !object(payload) || payload.success !== true || !object(payload.data)) throw Error('Thread inventory could not load. Choose Load related messages again.');
      const value = payload.data;
      if (value.schema !== 'backy.mailbox-thread.v1' || value.siteId !== siteId || value.bindingId !== bindingId || value.folder !== folder || value.uid !== uid || value.relationship !== 'direct-header-links' || value.folderScope !== 'selected-folder' || value.textMarksSeen !== false || typeof value.sourceHasThreadHeaders !== 'boolean' || !Array.isArray(value.messages) || value.messages.length > 20 || value.messages.some((row: unknown) => !object(row) || !Number.isSafeInteger(row.uid) || row.uid < 1 || row.path !== folder || typeof row.date !== 'string' || !(row.subject === null || typeof row.subject === 'string') || !Array.isArray(row.flags) || row.flags.some((flag: unknown) => typeof flag !== 'string') || typeof row.unseen !== 'boolean' || !Number.isSafeInteger(row.size) || row.size < 0 || !(row.from === null || address(row.from)) || !Array.isArray(row.to) || !row.to.every(address)) || new Set(value.messages.map((row: Message) => row.uid)).size !== value.messages.length || !object(value.searchPagination) || value.searchPagination.page !== nextPage || value.searchPagination.perPage !== 20 || !Number.isSafeInteger(value.searchPagination.totalPages) || value.searchPagination.totalPages < 0) throw Error('Thread inventory is incompatible. Refresh the mailbox.');
      if (mounted.current) { setRows(value.messages); setPage(nextPage); setPages(value.searchPagination.totalPages); setHeaders(value.sourceHasThreadHeaders); }
    } catch (failure) { if (mounted.current) { if (failure instanceof SiteMailboxAccessDenied) onAccessDenied(failure); else setError(failure instanceof Error ? failure.message : 'Thread inventory failed.'); } }
    finally { busyRef.current = false; if (mounted.current) setBusy(false); }
  };
  return <section aria-label="Message thread" className="mt-4 border-t border-border pt-4">
    <Button disabled={busy} onClick={() => void load(1)}>{busy ? 'Loading related messages…' : 'Load related messages'}</Button>
    <p className="mt-2 text-sm leading-6 text-muted-foreground">Direct Message-ID and In-Reply-To relationships in this folder. Other folders and deeper reply branches may contain additional messages. Loading metadata does not mark messages as read.</p>
    {error && <Notice className="mt-2" tone="error">{error}</Notice>}
    {rows && <><ul aria-label="Related messages" className="mt-2 divide-y divide-border">{rows.map(message => <li key={message.uid} className="flex min-w-0 flex-wrap items-center gap-2 py-2"><span className="min-w-0 flex-1 break-words text-sm">{message.subject || '(No subject)'} · {message.date}</span><Button disabled={busy} onClick={() => onOpen(message)}>Open and mark read</Button></li>)}</ul>{!headers && <p className="mt-2 text-sm text-muted-foreground">This message has no thread headers; only its own metadata is available.</p>}{rows.length === 0 && <p className="mt-2 text-sm text-muted-foreground">No exact related messages on this candidate page.</p>}<div className="mt-2 flex flex-wrap items-center gap-2"><Button disabled={busy || page <= 1} onClick={() => void load(page - 1)}>Previous related page</Button><Button disabled={busy || page >= pages} onClick={() => void load(page + 1)}>Next related page</Button><span className="text-sm text-muted-foreground">Candidate page {page} of {Math.max(1, pages)}</span></div></>}
  </section>;
}
