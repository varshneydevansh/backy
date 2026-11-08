import { getAdminApiBase } from './adminContentApi';

export const MAILBOX_ATTACHMENT_MAX_BYTES = 3 * 1024 * 1024;
const ATTACHMENT_INVENTORY_MAX_BYTES = 256 * 1024;
export interface MailboxAttachment { id: string; filename: string | null; contentType: string; sizeBytes: number; inline: boolean }
export interface MailboxAttachmentScope { siteId: string; bindingId: string; folder: string; uid: number }
export class SiteMailboxAccessDenied extends Error {
  constructor() { super('Mailbox access denied. Refresh after restoring your session and permissions.'); }
}
const object = (value: unknown): value is Record<string, any> => !!value && typeof value === 'object' && !Array.isArray(value);
const bytes = (value: string) => new TextEncoder().encode(value).byteLength;
const validId = (value: unknown): value is string => typeof value === 'string' && !!value.trim() && bytes(value) <= 512 && !/[\p{Cc}\p{Cs}]/u.test(value) && !['.', '..'].includes(value);
const validFilename = (value: unknown): value is string | null => value === null || typeof value === 'string' && !!value && bytes(value) <= 180 && !/[\/\\\p{Cc}\p{Cs}\u202A-\u202E\u2066-\u2069]/u.test(value) && !['.', '..'].includes(value);
const validAttachment = (value: unknown): value is MailboxAttachment => object(value) && validId(value.id) && validFilename(value.filename)
  && typeof value.contentType === 'string' && value.contentType.length <= 255 && /^[A-Za-z0-9!#$&^_.+-]+\/[A-Za-z0-9!#$&^_.+-]+$/.test(value.contentType)
  && Number.isSafeInteger(value.sizeBytes) && value.sizeBytes >= 0 && typeof value.inline === 'boolean';
const base = ({ siteId, bindingId, uid }: MailboxAttachmentScope) => `${getAdminApiBase()}/sites/${encodeURIComponent(siteId)}/settings/mailboxes/${encodeURIComponent(bindingId)}/messages/${uid}/attachments`;
const failed = () => Error('Attachment request failed. Load attachments again or check the mailbox connection.');
/** A hostile mocked/streaming source may ignore cancellation; the deadline still settles. */
function untilAborted<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  signal.throwIfAborted();
  return new Promise((resolve, reject) => {
    const abort = () => reject(signal.reason || failed());
    signal.addEventListener('abort', abort, { once: true });
    promise.then(value => {
      if (signal.aborted && value instanceof Response) void value.body?.cancel().catch(() => {});
      signal.removeEventListener('abort', abort); signal.aborted ? abort() : resolve(value);
    }, error => { signal.removeEventListener('abort', abort); reject(error); });
  });
}
async function request(url: string, signal: AbortSignal, body?: { folder: string }) {
  signal.throwIfAborted();
  const headers = new Headers(); if (body) headers.set('content-type', 'application/json');
  const response = await untilAborted(globalThis.fetch(url, { method: body ? 'POST' : 'GET', ...(body ? { body: JSON.stringify(body) } : {}), headers,
    credentials: 'include', cache: 'no-store', redirect: 'error', signal }), signal);
  signal.throwIfAborted();
  if (response.status === 401 || response.status === 403) throw new SiteMailboxAccessDenied();
  if (!response.ok) throw failed();
  return response;
}
async function readBytes(response: Response, signal: AbortSignal, maximum: number, exactLength = false): Promise<Uint8Array[]> {
  const length = response.headers.get('content-length');
  if (length !== null && (!/^\d+$/.test(length) || !Number.isSafeInteger(Number(length)) || Number(length) > maximum) || exactLength && length === null || !response.body) {
    void response.body?.cancel().catch(() => {}); throw failed();
  }
  const reader = response.body.getReader(), chunks: Uint8Array[] = []; let size = 0;
  const abort = () => { void reader.cancel().catch(() => {}); };
  signal.addEventListener('abort', abort, { once: true });
  try {
    while (true) {
      signal.throwIfAborted(); const next = await untilAborted(reader.read(), signal); signal.throwIfAborted();
      if (next.done) break;
      size += next.value.byteLength; if (size > maximum) throw failed(); chunks.push(next.value);
    }
    if (length !== null && size !== Number(length)) throw failed();
    return chunks;
  } finally { signal.removeEventListener('abort', abort); void reader.cancel().catch(() => {}); }
}
export async function listMailboxAttachments(scope: MailboxAttachmentScope, signal: AbortSignal): Promise<MailboxAttachment[]> {
  const boundedSignal = AbortSignal.any([signal, AbortSignal.timeout(25_000)]);
  const response = await request(`${base(scope)}?${new URLSearchParams({ folder: scope.folder })}`, boundedSignal);
  if (response.headers.get('content-type')?.split(';')[0].trim().toLowerCase() !== 'application/json') { void response.body?.cancel().catch(() => {}); throw failed(); }
  const chunks = await readBytes(response, boundedSignal, ATTACHMENT_INVENTORY_MAX_BYTES);
  const decoder = new TextDecoder('utf-8', { fatal: true });
  const text = chunks.map(chunk => decoder.decode(chunk, { stream: true })).join('') + decoder.decode();
  const payload: unknown = JSON.parse(text); boundedSignal.throwIfAborted();
  if (!object(payload) || payload.success !== true || !object(payload.data)) throw failed();
  const value = payload.data;
  if (value.schema !== 'backy.mailbox-attachments.v1' || value.siteId !== scope.siteId || value.bindingId !== scope.bindingId || value.folder !== scope.folder || value.uid !== scope.uid
    || !Array.isArray(value.attachments) || value.attachments.length > 100 || !value.attachments.every(validAttachment) || new Set(value.attachments.map((row: MailboxAttachment) => row.id)).size !== value.attachments.length) {
    throw Error('Attachment inventory is incompatible. Load attachments again before downloading.');
  }
  return value.attachments.map((row: MailboxAttachment) => ({ id: row.id, filename: row.filename, contentType: row.contentType, sizeBytes: row.sizeBytes, inline: row.inline }));
}
function downloadFilename(disposition: string): string {
  if (!/^attachment(?:\s*;|$)/i.test(disposition)) throw failed();
  const encoded = disposition.match(/(?:^|;)\s*filename\*=UTF-8''([^;]+)/i);
  const quoted = disposition.match(/(?:^|;)\s*filename="([^"\r\n]*)"/i);
  let filename: string;
  try { filename = encoded ? decodeURIComponent(encoded[1].trim()) : quoted?.[1] || 'attachment.bin'; } catch { throw failed(); }
  if (!validFilename(filename)) throw failed();
  return filename;
}
/** Bounded private octets only. Browser delivery is a separate current-context action. */
export async function downloadMailboxAttachment(scope: MailboxAttachmentScope, attachment: MailboxAttachment, signal: AbortSignal): Promise<{ blob: Blob; filename: string }> {
  if (!validAttachment(attachment) || attachment.sizeBytes > MAILBOX_ATTACHMENT_MAX_BYTES) throw Error('This attachment exceeds the 3 MiB download limit.');
  const boundedSignal = AbortSignal.any([signal, AbortSignal.timeout(25_000)]);
  const response = await request(`${base(scope)}/${encodeURIComponent(attachment.id)}/download`, boundedSignal, { folder: scope.folder });
  const length = response.headers.get('content-length');
  if (response.headers.get('content-type')?.split(';')[0].trim().toLowerCase() !== 'application/octet-stream' || response.headers.get('x-content-type-options') !== 'nosniff'
    || !length || !/^\d+$/.test(length) || !Number.isSafeInteger(Number(length)) || Number(length) > MAILBOX_ATTACHMENT_MAX_BYTES || !response.body) {
    void response.body?.cancel().catch(() => {}); throw failed();
  }
  const filename = downloadFilename(response.headers.get('content-disposition') || '');
  const chunks = await readBytes(response, boundedSignal, MAILBOX_ATTACHMENT_MAX_BYTES, true);
  return { blob: new Blob(chunks as BlobPart[], { type: 'application/octet-stream' }), filename };
}
