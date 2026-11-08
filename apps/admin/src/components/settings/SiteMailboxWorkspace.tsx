import { SiteMailboxManagement } from './SiteMailboxManagement';
import { MailboxComposer } from './MailboxComposer';
import { MailboxThread } from './MailboxThread';
import { useEffect, useRef, useState } from 'react';
import { Download, Mail, Paperclip, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Notice } from '@/components/ui/Notice';
import { Panel, PanelContent, PanelHeader } from '@/components/ui/Panel';
import { getAdminApiBase } from '@/lib/adminContentApi';
import { createWorkspaceLoadAuthority } from '@/lib/workspaceLoadAuthority';
import { SiteMailboxAccessDenied as MailboxAccessDenied, listMailboxAttachments, downloadMailboxAttachment, MAILBOX_ATTACHMENT_MAX_BYTES, type MailboxAttachment } from '@/lib/mailboxAttachmentsClient';

type Binding = { id: string; address: string };
type Pagination = { page: number; perPage: number; total: number; totalPages: number };
type Folder = { path: string; name: string; delimiter: string; specialUse: string | null; messageCount: number; unreadCount: number };
type Address = { name: string; address: string };
type Message = { uid: number; path: string; date: string; flags: string[]; unseen: boolean; size: number; subject: string | null; from: Address | null; to: Address[] };
type Snapshot<T> = { key: string; value: T };
export interface SiteMailboxWorkspaceProps {
  siteId: string;
  canView: boolean;
  /** User/session/permission context; never a credential or provider identifier. */
  contextKey: string;
  disabledReason?: string;
}
const object = (value: unknown): value is Record<string, any> => !!value && typeof value === 'object' && !Array.isArray(value);
const count = (value: unknown): value is number => Number.isSafeInteger(value) && Number(value) >= 0;
const address = (value: unknown): value is Address => object(value) && typeof value.name === 'string' && typeof value.address === 'string';
const perPage = 20;
function pagination(value: unknown, page: number, length: number): Pagination {
  if (!object(value) || value.page !== page || value.perPage !== perPage || !count(value.total) || !count(value.totalPages)
    || value.totalPages !== Math.ceil(value.total / perPage) || length > perPage || length > value.total
    || (value.totalPages > 0 && page > value.totalPages)) throw Error('Mailbox pagination is incompatible. Refresh the mailbox.');
  return value as Pagination;
}
async function data(url: string, signal: AbortSignal, init: RequestInit = {}): Promise<Record<string, any>> {
  // This workspace admits Owner httpOnly cookies only; never inherit bearer/API-key headers.
  const headers = new Headers();
  if (init.method === 'POST') headers.set('content-type', 'application/json');
  const response = await globalThis.fetch(url, { method: init.method || 'GET', ...(init.body ? { body: init.body } : {}), headers,
    credentials: 'include', cache: 'no-store', redirect: 'error', signal });
  signal.throwIfAborted();
  if (response.status === 401 || response.status === 403) throw new MailboxAccessDenied();
  const payload: unknown = await response.json();
  signal.throwIfAborted();
  if (!response.ok || !object(payload) || payload.success !== true || !object(payload.data)) {
    throw Error('Mailbox request failed. Refresh the mailbox and try again.');
  }
  return payload.data;
}
const failureMessage = (error: unknown) => error instanceof Error ? error.message : 'Mailbox request failed. Try again.';

/** Remount across authority changes so old private mail is absent in the first new render. */
export function SiteMailboxWorkspace(props: SiteMailboxWorkspaceProps) {
  return <Panel className="mt-5" data-testid="site-mailbox-workspace">
    <PanelHeader title="Site mailbox" icon={<Mail className="size-4" />} description="Browse the mailboxes connected to this site. Opening a message also marks it as read." />
    <PanelContent>
      {!props.canView || !props.siteId
        ? <Notice title="Mailbox access unavailable">{props.disabledReason || 'Select a site and sign in as an owner with sites.view and settings.view access.'}</Notice>
        : <MailboxSession key={JSON.stringify([props.siteId, props.contextKey])} {...props} />}
    </PanelContent>
  </Panel>;
}
function MailboxSession({ siteId }: SiteMailboxWorkspaceProps) {
  const base = `${getAdminApiBase()}/sites/${encodeURIComponent(siteId)}/settings/mailboxes`;
  const inventoryAuthority = useRef(createWorkspaceLoadAuthority()).current;
  const folderAuthority = useRef(createWorkspaceLoadAuthority()).current;
  const messageAuthority = useRef(createWorkspaceLoadAuthority()).current;
  const readAuthority = useRef(createWorkspaceLoadAuthority()).current;
  const attachmentAuthority = useRef(createWorkspaceLoadAuthority()).current;
  const downloadAuthority = useRef(createWorkspaceLoadAuthority()).current;
  const attachmentController = useRef<AbortController | null>(null);
  const downloadController = useRef<AbortController | null>(null);
  const downloadBusy = useRef(false);
  const attachmentBusy = useRef(false);
  const readSequence = useRef(0);
  const deliveredUrls = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const mounted = useRef(true);
  const readController = useRef<AbortController | null>(null);
  const readBusy = useRef(false);
  const controllers = useRef(new Set<AbortController>());
  const accessBlocked = useRef(false);
  const [accessDenied, setAccessDenied] = useState(false);
  const [inventory, setInventory] = useState<{ configured: boolean; mailboxes: Binding[]; attachments: boolean; compose: boolean; reply: boolean; outgoingAttachments: boolean; threadInventory: boolean } | null>(null);
  const [inventoryLoading, setInventoryLoading] = useState(true);
  const [inventoryError, setInventoryError] = useState('');
  const [reload, setReload] = useState(0);
  const [bindingId, setBindingId] = useState('');
  const [folderPage, setFolderPage] = useState(1);
  const [folders, setFolders] = useState<Snapshot<{ rows: Folder[]; pagination: Pagination }> | null>(null);
  const [folderLoading, setFolderLoading] = useState(false);
  const [folderError, setFolderError] = useState('');
  const [folder, setFolder] = useState('');
  const [messagePage, setMessagePage] = useState(1);
  const [messages, setMessages] = useState<Snapshot<{ rows: Message[]; pagination: Pagination }> | null>(null);
  const [messageLoading, setMessageLoading] = useState(false);
  const [messageError, setMessageError] = useState('');
  const [opened, setOpened] = useState<Snapshot<{ uid: number; subject: string; text: string; to: string }> | null>(null);
  const [opening, setOpening] = useState(false);
  const [readError, setReadError] = useState('');
  const [attachments, setAttachments] = useState<Snapshot<MailboxAttachment[]> | null>(null);
  const [attachmentLoading, setAttachmentLoading] = useState(false);
  const [attachmentError, setAttachmentError] = useState('');
  const [downloadingId, setDownloadingId] = useState('');
  const [downloadError, setDownloadError] = useState('');
  const [downloadNotice, setDownloadNotice] = useState('');
  const folderKey = JSON.stringify([siteId, bindingId, folderPage, reload]);
  const messageKey = JSON.stringify([folderKey, folder, messagePage]);
  const currentKey = useRef(messageKey);
  currentKey.current = messageKey;
  inventoryAuthority.setContext(siteId);
  folderAuthority.setContext(folderKey);
  messageAuthority.setContext(messageKey);
  readAuthority.setContext(messageKey);
  const visibleFolders = folders?.key === folderKey ? folders.value : null;
  const visibleMessages = messages?.key === messageKey ? messages.value : null;
  const visibleBody = opened?.key === messageKey ? opened.value : null;
  const attachmentKey = JSON.stringify([messageKey, visibleBody?.uid, readSequence.current]);
  const currentAttachmentKey = useRef(attachmentKey); currentAttachmentKey.current = attachmentKey;
  attachmentAuthority.setContext(attachmentKey); downloadAuthority.setContext(attachmentKey);
  const visibleAttachments = attachments?.key === attachmentKey ? attachments.value : null;
  const clearDownloads = () => {
    for (const [url, timer] of deliveredUrls.current) { clearTimeout(timer); URL.revokeObjectURL(url); }
    deliveredUrls.current.clear();
  };
  const clearAttachments = () => {
    attachmentAuthority.invalidate(); downloadAuthority.invalidate(); attachmentController.current?.abort(); downloadController.current?.abort();
    downloadBusy.current = false; attachmentBusy.current = false; setAttachments(null); setAttachmentLoading(false); setAttachmentError(''); setDownloadingId(''); setDownloadError(''); setDownloadNotice(''); clearDownloads();
  };
  const clearRead = () => {
    readSequence.current++; clearAttachments();
    readAuthority.invalidate(); readController.current?.abort(); readBusy.current = false;
    setOpened(null); setReadError(''); setOpening(false);
  };
  const clearMessages = () => { messageAuthority.invalidate(); setMessages(null); setMessageError(''); clearRead(); };
  const controllerForRequest = () => { const controller = new AbortController(); controllers.current.add(controller); return controller; };
  const rejectAccess = (error: unknown): boolean => {
    if (!(error instanceof MailboxAccessDenied)) return false;
    accessBlocked.current = true; setAccessDenied(true); clearAttachments();
    inventoryAuthority.invalidate(); folderAuthority.invalidate(); messageAuthority.invalidate(); readAuthority.invalidate();
    for (const controller of controllers.current) controller.abort(); controllers.current.clear();
    readBusy.current = false; readController.current = null;
    setInventory(null); setInventoryLoading(false); setInventoryError(''); setBindingId('');
    setFolders(null); setFolderLoading(false); setFolderError(''); setFolder(''); setFolderPage(1);
    setMessages(null); setMessageLoading(false); setMessageError(''); setMessagePage(1);
    setOpened(null); setOpening(false); setReadError('');
    return true;
  };
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false; attachmentAuthority.invalidate(); downloadAuthority.invalidate(); clearDownloads(); inventoryAuthority.invalidate(); folderAuthority.invalidate(); messageAuthority.invalidate(); readAuthority.invalidate(); for (const controller of controllers.current) controller.abort(); controllers.current.clear();
    };
  }, [inventoryAuthority, folderAuthority, messageAuthority, readAuthority, attachmentAuthority, downloadAuthority]);
  useEffect(() => {
    if (accessBlocked.current) return;
    const controller = controllerForRequest();
    setInventory(null); setInventoryLoading(true); setInventoryError('');
    void inventoryAuthority.run(async () => {
      const value = await data(base, controller.signal);
      if (value.schema !== 'backy.site-mailboxes.v1' || value.siteId !== siteId || value.provider !== 'hostinger' || typeof value.configured !== 'boolean'
        || !Array.isArray(value.mailboxes) || value.mailboxes.some((row: unknown) => !object(row) || typeof row.id !== 'string' || !row.id || typeof row.address !== 'string' || !row.address)
        || new Set(value.mailboxes.map((row: Binding) => row.id)).size !== value.mailboxes.length
        || !object(value.capabilities) || ['folders', 'messageInventory', 'messageText', 'readMarksSeen'].some(key => value.capabilities[key] !== true)
        || ['attachments', 'compose', 'reply'].some(key => typeof value.capabilities[key] !== 'boolean') || value.capabilities.provisioning !== false) throw Error('Mailbox inventory is incompatible. Refresh site settings.');
      return { configured: value.configured, mailboxes: value.mailboxes as Binding[], attachments: value.capabilities.attachments as boolean, compose: value.capabilities.compose === true, reply: value.capabilities.reply === true, outgoingAttachments: value.capabilities.outgoingAttachments === true, threadInventory: value.capabilities.threadInventory === true };
    }, { success: value => { setInventory(value); setBindingId(value.mailboxes.length === 1 ? value.mailboxes[0].id : ''); }, error: error => { if (!rejectAccess(error)) setInventoryError(failureMessage(error)); }, finish: () => setInventoryLoading(false) });
    return () => { controller.abort(); controllers.current.delete(controller); inventoryAuthority.invalidate(); };
  }, [base, siteId, reload, inventoryAuthority]);
  useEffect(() => {
    if (!bindingId || !inventory?.configured) { setFolders(null); setFolderLoading(false); return; }
    const controller = controllerForRequest();
    setFolderLoading(true); setFolderError('');
    void folderAuthority.run(async () => {
      const value = await data(`${base}/${encodeURIComponent(bindingId)}/folders?${new URLSearchParams({ page: String(folderPage), perPage: String(perPage) })}`, controller.signal);
      if (value.schema !== 'backy.mailbox-folders.v1' || value.siteId !== siteId || value.bindingId !== bindingId || !Array.isArray(value.folders)
        || value.folders.some((row: unknown) => !object(row) || typeof row.path !== 'string' || !row.path || typeof row.name !== 'string' || typeof row.delimiter !== 'string'
          || !(row.specialUse === null || typeof row.specialUse === 'string') || !count(row.messageCount) || !count(row.unreadCount))
        || new Set(value.folders.map((row: Folder) => row.path)).size !== value.folders.length) throw Error('Folder inventory is incompatible. Refresh the mailbox.');
      return { rows: value.folders as Folder[], pagination: pagination(value.pagination, folderPage, value.folders.length) };
    }, { success: value => { setFolders({ key: folderKey, value }); if (!folder) setFolder(value.rows.find(row => row.path === 'INBOX')?.path || value.rows[0]?.path || ''); }, error: error => { if (!rejectAccess(error)) setFolderError(failureMessage(error)); }, finish: () => setFolderLoading(false) });
    return () => { controller.abort(); controllers.current.delete(controller); folderAuthority.invalidate(); };
  }, [base, siteId, bindingId, folderPage, folderKey, inventory, folderAuthority]);
  useEffect(() => {
    if (!bindingId || !folder || !inventory?.configured) { setMessages(null); setMessageLoading(false); return; }
    const controller = controllerForRequest();
    setMessageLoading(true); setMessageError('');
    void messageAuthority.run(async () => {
      const value = await data(`${base}/${encodeURIComponent(bindingId)}/messages?${new URLSearchParams({ folder, page: String(messagePage), perPage: String(perPage) })}`, controller.signal);
      if (value.schema !== 'backy.mailbox-messages.v1' || value.siteId !== siteId || value.bindingId !== bindingId || value.folder !== folder || !Array.isArray(value.messages)
        || value.messages.some((row: unknown) => !object(row) || !count(row.uid) || row.uid < 1 || row.path !== folder || typeof row.date !== 'string'
          || !Array.isArray(row.flags) || row.flags.some((flag: unknown) => typeof flag !== 'string') || typeof row.unseen !== 'boolean' || !count(row.size)
          || !(row.subject === null || typeof row.subject === 'string') || !(row.from === null || address(row.from)) || !Array.isArray(row.to) || !row.to.every(address))
        || new Set(value.messages.map((row: Message) => row.uid)).size !== value.messages.length) throw Error('Message inventory is incompatible. Refresh the mailbox.');
      return { rows: value.messages as Message[], pagination: pagination(value.pagination, messagePage, value.messages.length) };
    }, { success: value => setMessages({ key: messageKey, value }), error: error => { if (!rejectAccess(error)) setMessageError(failureMessage(error)); }, finish: () => setMessageLoading(false) });
    return () => { controller.abort(); controllers.current.delete(controller); messageAuthority.invalidate(); };
  }, [base, siteId, bindingId, folder, messagePage, messageKey, inventory, messageAuthority]);
  const open = async (message: Message, related = false) => {
    if (!mounted.current || accessBlocked.current || readBusy.current || !related && !visibleMessages?.rows.some(row => row.uid === message.uid)) return;
    readSequence.current++; clearAttachments();
    const key = messageKey, controller = controllerForRequest();
    readBusy.current = true; readController.current = controller; setOpening(true); setOpened(null); setReadError('');
    await readAuthority.run(async () => {
      const value = await data(`${base}/${encodeURIComponent(bindingId)}/messages/${message.uid}/read`, controller.signal, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ folder }) });
      if (value.schema !== 'backy.mailbox-read.v1' || value.siteId !== siteId || value.bindingId !== bindingId || value.folder !== folder || value.uid !== message.uid
        || typeof value.text !== 'string' || value.readMarksSeen !== true) throw Error('Message response is incompatible. Refresh the mailbox before opening it again.');
      return value.text;
    }, { success: text => {
      if (!mounted.current || currentKey.current !== key) return;
      setOpened({ key, value: { uid: message.uid, subject: message.subject || '(No subject)', text, to: message.from?.address || '' } });
      setMessages(current => current?.key === key ? { ...current, value: { ...current.value, rows: current.value.rows.map(row => row.uid === message.uid ? { ...row, unseen: false } : row) } } : current);
    }, error: error => { if (mounted.current && currentKey.current === key && !rejectAccess(error)) setReadError(failureMessage(error)); }, finish: () => { if (mounted.current && currentKey.current === key) { readBusy.current = false; setOpening(false); } } });
    controllers.current.delete(controller);
  };
  const loadAttachments = async () => {
    if (!mounted.current || accessBlocked.current || !visibleBody || !inventory?.attachments || attachmentBusy.current || downloadBusy.current) return;
    const key = attachmentKey, controller = controllerForRequest(); attachmentController.current = controller;
    attachmentBusy.current = true; downloadAuthority.invalidate(); setAttachments(null); setAttachmentLoading(true); setAttachmentError(''); setDownloadError(''); setDownloadNotice('');
    await attachmentAuthority.run(() => listMailboxAttachments({ siteId, bindingId, folder, uid: visibleBody.uid }, controller.signal), {
      success: rows => { if (mounted.current && currentAttachmentKey.current === key) setAttachments({ key, value: rows }); },
      error: error => { if (mounted.current && currentAttachmentKey.current === key && !rejectAccess(error)) setAttachmentError('Attachment list could not load. Load attachments again to request current metadata.'); },
      finish: () => { if (mounted.current && currentAttachmentKey.current === key) { attachmentBusy.current = false; setAttachmentLoading(false); } },
    }); controllers.current.delete(controller);
  };
  const download = async (attachment: MailboxAttachment) => {
    if (!mounted.current || accessBlocked.current || downloadBusy.current || !visibleBody || !visibleAttachments?.some(row => row.id === attachment.id) || attachment.sizeBytes > MAILBOX_ATTACHMENT_MAX_BYTES) return;
    const key = attachmentKey, controller = controllerForRequest(); downloadController.current = controller;
    downloadBusy.current = true; setDownloadingId(attachment.id); setDownloadError(''); setDownloadNotice('');
    await downloadAuthority.run(() => downloadMailboxAttachment({ siteId, bindingId, folder, uid: visibleBody.uid }, attachment, controller.signal), {
      success: result => {
        if (!mounted.current || accessBlocked.current || currentAttachmentKey.current !== key || controller.signal.aborted) return;
        const url = URL.createObjectURL(result.blob), link = document.createElement('a');
        try { link.href = url; link.download = result.filename; link.style.display = 'none'; document.body.appendChild(link); link.click(); }
        finally { link.remove(); const timer = setTimeout(() => { URL.revokeObjectURL(url); deliveredUrls.current.delete(url); }, 1000); deliveredUrls.current.set(url, timer); }
        setDownloadNotice('Download handed to your browser. Check its downloads to confirm the file was saved.');
      },
      error: error => { if (mounted.current && currentAttachmentKey.current === key && !rejectAccess(error)) setDownloadError(error instanceof MailboxAccessDenied ? error.message : 'Attachment download failed. Try an explicit download again; it will not retry automatically.'); },
      finish: () => { if (mounted.current && currentAttachmentKey.current === key) { downloadBusy.current = false; setDownloadingId(''); } },
    }); controllers.current.delete(controller);
  };
  const changeBinding = (id: string) => { folderAuthority.invalidate(); setBindingId(id); setFolders(null); setFolderError(''); setFolder(''); setFolderPage(1); setMessagePage(1); clearMessages(); };
  const changeFolder = (path: string) => { setFolder(path); setMessagePage(1); clearMessages(); };
  const refresh = () => { accessBlocked.current = false; setAccessDenied(false); changeBinding(''); setInventory(null); setReload(value => value + 1); };
  return <div className="min-w-0" data-testid="site-mailbox-session">
    <div className="flex flex-wrap items-end gap-3 border-b border-border pb-4">
      <label className="grid min-w-0 flex-1 gap-1 text-sm font-medium">Mailbox
        <select aria-label="Mailbox" className="min-h-11 w-full rounded-lg border border-border bg-background px-3 text-sm" value={bindingId} disabled={!inventory?.configured || !inventory.mailboxes.length} onChange={event => changeBinding(event.target.value)}>
          <option value="">Choose a mailbox</option>{inventory?.mailboxes.map(row => <option key={row.id} value={row.id}>{row.address}</option>)}
        </select>
      </label>
      <Button onClick={refresh} disabled={inventoryLoading} iconStart={<RefreshCw className="size-4" />}>Refresh mailboxes</Button>
    </div>
    <div className="mt-3" role="status" aria-live="polite">
      {accessDenied && <Notice tone="error" title="Mailbox access denied">Cached mail has been cleared. Restore your session and permissions, then refresh mailboxes. Opening may already have marked a message as read; it will not be retried automatically.</Notice>}
      {inventoryLoading && <p className="text-sm text-muted-foreground">Loading site mailboxes…</p>}
      {inventoryError && <Notice tone="error">{inventoryError}</Notice>}
      {inventory && !inventory.configured && <Notice title="No mailbox connection">This site’s mailbox provider is not configured. An owner can complete the server connection before opening messages.</Notice>}
      {inventory?.configured && !inventory.mailboxes.length && <p className="text-sm text-muted-foreground">No mailbox bindings are available for this site.</p>}
    </div>
    {inventory?.configured && bindingId && inventory.compose && <MailboxComposer key={`compose:${bindingId}`} base={base} siteId={siteId} bindingId={bindingId} address={inventory.mailboxes.find(row => row.id === bindingId)?.address || ''} outgoingAttachments={inventory.outgoingAttachments} onAccessDenied={rejectAccess} />}
    {inventory?.configured && bindingId && <div className="mt-4 grid min-w-0 gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <div className="min-w-0">
        <label className="grid gap-1 text-sm font-medium">Folder
          <select aria-label="Folder" className="min-h-11 w-full rounded-lg border border-border bg-background px-3 text-sm" value={folder} disabled={!visibleFolders?.rows.length} onChange={event => changeFolder(event.target.value)}>
            {!visibleFolders?.rows.some(row => row.path === folder) && <option value={folder}>{folder || 'Choose a folder'}</option>}
            {visibleFolders?.rows.map(row => <option key={row.path} value={row.path}>{row.name} · {row.unreadCount} unread</option>)}
          </select>
        </label>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <Button disabled={folderLoading || folderPage <= 1} onClick={() => { clearMessages(); setFolderPage(value => value - 1); }}>Previous folders</Button>
          <Button disabled={folderLoading || !visibleFolders || folderPage >= visibleFolders.pagination.totalPages} onClick={() => { clearMessages(); setFolderPage(value => value + 1); }}>Next folders</Button>
          {visibleFolders && <span className="text-sm text-muted-foreground">Folder page {folderPage} of {Math.max(1, visibleFolders.pagination.totalPages)}</span>}
        </div>
        <div role="status" aria-live="polite" className="mt-3 text-sm">
          {folderLoading && <p>Loading folders…</p>}{folderError && <Notice tone="error">{folderError}</Notice>}
          {!folderLoading && visibleFolders?.rows.length === 0 && <p>No folders are available.</p>}
          {messageLoading && <p>Loading message inventory…</p>}{messageError && <Notice tone="error">{messageError}</Notice>}
        </div>
        <ul aria-label="Messages" className="mt-3 divide-y divide-border border-y border-border">
          {visibleMessages?.rows.map(message => <li key={message.uid} className="flex min-w-0 flex-wrap items-center gap-3 py-3">
            <div className="min-w-0 flex-1"><p className={message.unseen ? 'break-words text-sm font-semibold' : 'break-words text-sm'}>{message.subject || '(No subject)'}</p><p className="mt-1 break-words text-sm text-muted-foreground">{message.from?.name || message.from?.address || 'Unknown sender'} · {message.date}</p><p className="text-sm text-muted-foreground">{message.unseen ? 'Unread' : 'Read'}</p></div>
            <Button disabled={opening} onClick={() => void open(message)} aria-label={`Open and mark read: ${message.subject || 'No subject'}`}>Open and mark read</Button>
          </li>)}
        </ul>
        {!messageLoading && visibleMessages?.rows.length === 0 && <p className="py-4 text-sm text-muted-foreground">No messages in this folder.</p>}
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Button disabled={messageLoading || messagePage <= 1} onClick={() => { clearMessages(); setMessagePage(value => value - 1); }}>Previous messages</Button>
          <Button disabled={messageLoading || !visibleMessages || messagePage >= visibleMessages.pagination.totalPages} onClick={() => { clearMessages(); setMessagePage(value => value + 1); }}>Next messages</Button>
          {visibleMessages && <span className="text-sm text-muted-foreground">Page {messagePage} of {Math.max(1, visibleMessages.pagination.totalPages)} · {visibleMessages.pagination.total} messages</span>}
        </div>
      </div>
      <div className="min-w-0 border-t border-border pt-4 lg:border-l lg:border-t-0 lg:pl-5 lg:pt-0" role="region" aria-label="Message text">
        {opening && <p className="text-sm text-muted-foreground" role="status">Opening message and marking it as read…</p>}
        {readError && <Notice tone="error">{readError}</Notice>}
        {visibleBody ? <><h3 className="break-words text-base font-semibold">{visibleBody.subject}</h3><pre className="mt-3 whitespace-pre-wrap break-words font-sans text-sm leading-6 [overflow-wrap:anywhere]" data-testid="mailbox-message-text">{visibleBody.text}</pre>
          {inventory?.threadInventory && <MailboxThread key={attachmentKey} base={base} siteId={siteId} bindingId={bindingId} folder={folder} uid={visibleBody.uid} onOpen={message => void open(message, true)} onAccessDenied={rejectAccess} />}
          {inventory?.reply && <MailboxComposer key={`reply:${attachmentKey}`} base={base} siteId={siteId} bindingId={bindingId} address={inventory.mailboxes.find(row => row.id === bindingId)?.address || ''} reply={{ folder, uid: visibleBody.uid, subject: visibleBody.subject, to: visibleBody.to }} outgoingAttachments={inventory.outgoingAttachments} onAccessDenied={rejectAccess} />}
          {inventory?.attachments && <section className="mt-5 border-t border-border pt-4" aria-label="Message attachments">
            <div className="flex flex-wrap items-center justify-between gap-3"><h4 className="flex items-center gap-2 text-sm font-semibold"><Paperclip className="size-4" />Attachments</h4><Button disabled={attachmentLoading || Boolean(downloadingId)} onClick={() => void loadAttachments()}>{attachmentLoading ? 'Loading attachments…' : visibleAttachments ? 'Reload attachments' : 'Load attachments'}</Button></div>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">Files download only when you choose Download. Up to 3 MiB per file; contents are never previewed here.</p>
            {attachmentError && <Notice className="mt-3" tone="error">{attachmentError}</Notice>}
            {visibleAttachments && <ul className="mt-3 divide-y border-y border-border" aria-label="Attachments">{visibleAttachments.map(attachment => <li key={attachment.id} className="flex min-w-0 flex-wrap items-center justify-between gap-3 py-3"><div className="min-w-0 flex-1"><p className="break-words text-sm font-medium [overflow-wrap:anywhere]">{attachment.filename || 'attachment.bin'}</p><p className="mt-1 break-words text-sm text-muted-foreground">{attachment.sizeBytes === 0 ? '0 bytes' : `${Math.ceil(attachment.sizeBytes / 1024).toLocaleString()} KB`} · {attachment.contentType}{attachment.inline ? ' · Inline attachment' : ''}</p>{attachment.sizeBytes > MAILBOX_ATTACHMENT_MAX_BYTES && <p className="mt-1 text-sm text-muted-foreground">Exceeds the 3 MiB download limit.</p>}</div><Button disabled={Boolean(downloadingId) || attachment.sizeBytes > MAILBOX_ATTACHMENT_MAX_BYTES} iconStart={<Download className="size-4" />} aria-label={`Download attachment: ${attachment.filename || 'attachment.bin'}`} onClick={() => void download(attachment)}>{downloadingId === attachment.id ? 'Downloading…' : 'Download'}</Button></li>)}</ul>}
            {visibleAttachments?.length === 0 && <p className="mt-3 text-sm text-muted-foreground">No attachments in this message.</p>}
            {downloadError && <Notice className="mt-3" tone="error" role="alert">{downloadError}</Notice>}{downloadNotice && <p className="mt-3 text-sm text-muted-foreground" role="status">{downloadNotice}</p>}
          </section>}</> : !opening && <p className="text-sm leading-6 text-muted-foreground">Choose “Open and mark read” to view a message as plain text. Images and remote HTML are not loaded. Attachment lists and downloads require separate explicit actions.</p>}
      </div>
    </div>}
    {!accessDenied && <SiteMailboxManagement key={`management:${siteId}:${reload}`} siteId={siteId} onAccessDenied={rejectAccess} />}
    <p className="mt-4 text-sm leading-6 text-muted-foreground">{inventory?.attachments ? 'Mailbox inventory, plain-text reading and explicit attachment downloads.' : inventory ? 'Mailbox inventory and plain-text reading. This server does not support attachment downloads.' : 'Mailbox inventory and plain-text reading.'} {inventory?.compose ? 'Compose and reply use explicit sends with durable outcome history. Mailbox and alias setup uses separate account authority and existing-plan capacity.' : inventory ? 'This server does not support compose or reply. Mailbox and alias setup uses separate account authority and existing-plan capacity.' : 'Compose and reply controls require current Owner access and loaded mailbox capabilities.'}</p>
  </div>;
}
