import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Notice } from '@/components/ui/Notice';
import { SiteMailboxAccessDenied } from '@/lib/mailboxAttachmentsClient';
type ReplySource = { uid: number; folder: string; subject: string; to: string };
type Attachment = { filename: string; contentType: string; content: string; size: number };
type Attempt = { id: string; idempotencyKey: string; state: 'pending' | 'accepted' | 'rejected' | 'uncertain'; statusCode: number | null; createdAt: string; updatedAt: string };
const maximum = 2 * 1024 * 1024;
const field = 'min-h-11 w-full min-w-0 rounded-lg border border-border bg-background px-3 text-sm';
const object = (value: unknown): value is Record<string, any> => !!value && typeof value === 'object' && !Array.isArray(value);
const validAttempt = (value: unknown): value is Attempt => object(value) && typeof value.id === 'string' && typeof value.idempotencyKey === 'string' && ['pending', 'accepted', 'rejected', 'uncertain'].includes(value.state) && typeof value.createdAt === 'string' && typeof value.updatedAt === 'string' && (value.statusCode === null || Number.isInteger(value.statusCode));
const outcome = (state: Attempt['state']) => state === 'accepted' ? 'Hostinger accepted the message and saved a sent copy. Recipient delivery remains unverified.' : state === 'rejected' ? 'Hostinger rejected this attempt. Review the message and connection before creating a new message.' : 'Send completion is unknown. Check the sent folder and provider before creating another message; this attempt will not be retried.';
async function request(url: string, signal: AbortSignal, payload?: unknown) {
  signal = AbortSignal.any([signal, AbortSignal.timeout(45_000)]);
  const response = await fetch(url, { method: payload ? 'POST' : 'GET', ...(payload ? { body: JSON.stringify(payload), headers: { 'content-type': 'application/json' } } : {}), credentials: 'include', redirect: 'error', cache: 'no-store', signal });
  signal.throwIfAborted(); if ([401, 403].includes(response.status)) throw new SiteMailboxAccessDenied();
  const value: unknown = await response.json(); signal.throwIfAborted();
  if (!response.ok || !object(value) || value.success !== true || !object(value.data)) throw Error('Mailbox action failed. Check the connection and send history.'); return value.data;
}
export function MailboxComposer({ base, siteId, bindingId, address, reply, outgoingAttachments, onAccessDenied }: { base: string; siteId: string; bindingId: string; address: string; reply?: ReplySource; outgoingAttachments: boolean; onAccessDenied: (error: SiteMailboxAccessDenied) => void }) {
  const mounted = useRef(true), active = useRef<AbortController | null>(null), sequence = useRef(0), busyRef = useRef(false);
  const [draftId, setDraftId] = useState(() => crypto.randomUUID());
  const [visible, setVisible] = useState(Boolean(reply));
  const [to, setTo] = useState(reply?.to || ''), [cc, setCc] = useState(''), [bcc, setBcc] = useState('');
  const [subject, setSubject] = useState(reply ? /^re:/i.test(reply.subject) ? reply.subject : `Re: ${reply.subject}` : ''), [text, setText] = useState('');
  const [attachments, setAttachments] = useState<Attachment[]>([]), [busy, setBusy] = useState(false), [fileBusy, setFileBusy] = useState(false), [locked, setLocked] = useState(false);
  const [error, setError] = useState(''), [notice, setNotice] = useState(''), [history, setHistory] = useState<Attempt[] | null>(null);
  useEffect(() => () => { mounted.current = false; sequence.current++; active.current?.abort(); }, []);
  const fresh = () => { if (busyRef.current || fileBusy) return; sequence.current++; setDraftId(crypto.randomUUID()); setTo(reply?.to || ''); setCc(''); setBcc(''); setSubject(reply ? /^re:/i.test(reply.subject) ? reply.subject : `Re: ${reply.subject}` : ''); setText(''); setAttachments([]); setLocked(false); setError(''); setNotice(''); setVisible(true); };
  const chooseFiles = async (files: File[]) => {
    if (busyRef.current || locked || fileBusy || !files.length) return;
    const token = ++sequence.current; setFileBusy(true); setError('');
    try {
      if (files.length + attachments.length > 10 || files.reduce((total, file) => total + file.size, attachments.reduce((total, file) => total + file.size, 0)) > maximum) throw Error('Choose at most 10 files totaling 2 MiB.');
      const additions: Attachment[] = [];
      for (const file of files) {
        let filename = file.name.replace(/[/\\\p{Cc}\p{Cs}\u061c\u200e\u200f\u202a-\u202e\u2066-\u2069]/gu, '_').trim();
        while (new TextEncoder().encode(filename).byteLength > 180) filename = filename.slice(0, -1);
        if (!filename || filename === '.' || filename === '..') filename = 'attachment.bin';
        const bytes = new Uint8Array(await file.arrayBuffer()); if (bytes.byteLength !== file.size) throw Error('A selected file changed while reading. Choose the files again.');
        let binary = ''; for (let index = 0; index < bytes.length; index += 8192) binary += String.fromCharCode(...bytes.subarray(index, index + 8192));
        additions.push({ filename, contentType: /^[A-Za-z0-9!#$&^_.+-]+\/[A-Za-z0-9!#$&^_.+-]+$/.test(file.type) ? file.type.toLowerCase() : 'application/octet-stream', content: btoa(binary), size: file.size });
      }
      if (mounted.current && token === sequence.current) setAttachments(current => [...current, ...additions]);
    } catch (failure) { if (mounted.current && token === sequence.current) setError(failure instanceof Error ? failure.message : 'File selection failed.'); }
    finally { if (mounted.current && token === sequence.current) setFileBusy(false); }
  };
  const send = async () => {
    if (busyRef.current || locked || fileBusy) return;
    const recipients = (value: string) => value.split(/[;,]/).map(item => item.trim()).filter(Boolean);
    const payload = { idempotencyKey: draftId, to: recipients(to), cc: recipients(cc), bcc: recipients(bcc), subject, text, attachments: attachments.map(({ filename, content, contentType }) => ({ filename, content, contentType })), ...(reply ? { inReplyTo: { folder: reply.folder, uid: reply.uid } } : {}) };
    const all = [...payload.to, ...payload.cc, ...payload.bcc];
    if (!all.length || all.length > 50 || all.some(value => !/^[^\s@<>,;]+@[^\s@<>,;]+\.[^\s@<>,;]+$/.test(value)) || new Set(all.map(value => value.toLowerCase())).size !== all.length || /[\p{Cc}\p{Cs}]/u.test(subject) || new TextEncoder().encode(subject).byteLength > 998 || new TextEncoder().encode(text).byteLength > 262144) { setError('Use up to 50 distinct email recipients, a single-line subject and a body up to 256 KiB.'); return; }
    const controller = new AbortController(); active.current = controller; busyRef.current = true; setBusy(true); setLocked(true); setError(''); setNotice('');
    try {
      const value = await request(`${base}/${encodeURIComponent(bindingId)}/send`, controller.signal, payload);
      if (value.schema !== 'backy.mailbox-send.v1' || value.siteId !== siteId || value.bindingId !== bindingId || !validAttempt(value.attempt) || value.attempt.idempotencyKey !== draftId || value.deliveryVerified !== false || value.automaticRetry !== false || typeof value.outcomePersisted !== 'boolean' || typeof value.providerAccepted !== 'boolean') throw Error('Send response could not be verified. Check send history and the sent folder before another message.');
      if (mounted.current) { setNotice(value.outcomePersisted ? outcome(value.attempt.state) : 'The durable outcome is pending. Check send history and the sent folder before creating another message.'); setAttachments([]); }
    } catch (failure) {
      if (!mounted.current) return;
      if (failure instanceof SiteMailboxAccessDenied) onAccessDenied(failure);
      else setError('Send completion could not be verified. Check send history and the sent folder before creating another message. This draft will not be retried automatically.');
    } finally { busyRef.current = false; if (mounted.current) setBusy(false); }
  };
  const loadHistory = async () => {
    if (busyRef.current || fileBusy) return;
    const controller = new AbortController(); active.current = controller; busyRef.current = true; setBusy(true); setError('');
    try {
      const value = await request(`${base}/${encodeURIComponent(bindingId)}/send-attempts?perPage=20&page=1`, controller.signal);
      if (value.schema !== 'backy.mailbox-send-attempts.v1' || value.siteId !== siteId || value.bindingId !== bindingId || !Array.isArray(value.attempts) || value.attempts.length > 20 || !value.attempts.every(validAttempt)) throw Error('Send history is incompatible. Refresh the workspace.');
      if (mounted.current) { setHistory(value.attempts); const matching = value.attempts.find((attempt: Attempt) => attempt.idempotencyKey === draftId); if (matching) setNotice(outcome(matching.state)); }
    } catch (failure) { if (mounted.current) { if (failure instanceof SiteMailboxAccessDenied) onAccessDenied(failure); else setError('Send history could not load. Check the connection and sent folder.'); } }
    finally { busyRef.current = false; if (mounted.current) setBusy(false); }
  };
  return <section aria-label={reply ? 'Reply to message' : 'Compose mail'} className="mt-4 min-w-0 border-t border-border pt-4">
    <div className="flex flex-wrap items-center gap-2"><Button disabled={busy || fileBusy} onClick={() => { if (!visible) setVisible(true); else if (locked) fresh(); else setVisible(false); }}>{visible ? locked ? reply ? 'Create another reply' : 'Create another message' : 'Close draft' : 'Compose message'}</Button><Button disabled={busy || fileBusy} onClick={() => void loadHistory()}>Check send history</Button></div>
    {visible && <div className="mt-3 grid min-w-0 gap-3">
      <p className="break-words text-sm text-muted-foreground">From {address}{reply ? ` · Reply to message ${reply.uid} in ${reply.folder}` : ''}</p>
      <label className="grid gap-1 text-sm font-medium">To<input aria-label="Mail recipients" className={field} value={to} disabled={busy || locked} onChange={event => setTo(event.target.value)} placeholder="Addresses separated by commas" /></label>
      <div className="grid min-w-0 gap-3 sm:grid-cols-2"><label className="grid min-w-0 gap-1 text-sm font-medium">Cc<input aria-label="Mail cc" className={field} value={cc} disabled={busy || locked} onChange={event => setCc(event.target.value)} /></label><label className="grid min-w-0 gap-1 text-sm font-medium">Bcc<input aria-label="Mail bcc" className={field} value={bcc} disabled={busy || locked} onChange={event => setBcc(event.target.value)} /></label></div>
      <label className="grid gap-1 text-sm font-medium">Subject<input aria-label="Mail subject" className={field} value={subject} disabled={busy || locked} onChange={event => setSubject(event.target.value)} /></label>
      <label className="grid gap-1 text-sm font-medium">Message<textarea aria-label="Mail body" className={`${field} min-h-40 py-3`} value={text} disabled={busy || locked} onChange={event => setText(event.target.value)} /></label>
      {outgoingAttachments && <div><label className="grid gap-1 text-sm font-medium">Attach files<input aria-label="Outgoing mail attachments" type="file" multiple disabled={busy || locked || fileBusy} className="min-h-11 min-w-0 max-w-full text-sm" onChange={event => { const files = Array.from(event.target.files || []); event.target.value = ''; void chooseFiles(files); }} /></label><p className="mt-1 text-sm text-muted-foreground">Up to 10 files totaling 2 MiB. Files remain in this draft until Send.</p><ul className="mt-2 divide-y divide-border">{attachments.map((attachment, index) => <li key={index} className="flex min-w-0 flex-wrap items-center gap-2 py-2"><span className="min-w-0 flex-1 break-words text-sm">{attachment.filename} · {attachment.size.toLocaleString()} bytes</span><Button disabled={busy || locked || fileBusy} onClick={() => setAttachments(current => current.filter((_, row) => row !== index))}>Remove file</Button></li>)}</ul></div>}
      <Button disabled={busy || locked || fileBusy} onClick={() => void send()}>{busy ? 'Working…' : reply ? 'Send reply' : 'Send message'}</Button>
    </div>}
    {error && <Notice className="mt-3" tone="error" role="alert">{error}</Notice>}{notice && <p className="mt-3 text-sm leading-6" role="status">{notice}</p>}
    {history && <div className="mt-3"><p className="text-sm text-muted-foreground">Latest 20 send attempts. Pending and uncertain attempts must be investigated before composing another copy.</p><ul aria-label="Send history" className="mt-2 divide-y divide-border">{history.map(attempt => <li key={attempt.id} className="py-2 text-sm"><p>{attempt.createdAt} · {attempt.state}</p><p className="break-all font-mono text-xs text-muted-foreground">{attempt.id}</p></li>)}</ul>{history.length === 0 && <p className="mt-2 text-sm text-muted-foreground">No recorded send attempts.</p>}</div>}
  </section>;
}
