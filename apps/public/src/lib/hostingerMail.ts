/** Server-only Hostinger Mail adapter, based on the official Mail API SDK.
 * https://github.com/hostinger/mail-api-typescript-sdk/blob/main/docs/SendApi.md
 * https://github.com/hostinger/mail-api-typescript-sdk/blob/main/docs/AccountApi.md
 */
export const HOSTINGER_MAIL_API_ORIGIN = 'https://api.mail.hostinger.com';

export interface HostingerMailConfig {
  apiToken: string;
  from: string;
  mailboxId?: string;
}

export type HostingerMailFailure = 'not-configured' | 'invalid-token' | 'scope-denied' |
  'mailbox-unavailable' | 'sender-mismatch' | 'invalid-request' | 'rate-limited' |
  'provider-error' | 'invalid-response' | 'network-error' | 'attachment-not-found' | 'attachment-too-large';

export class HostingerMailError extends Error {
  constructor(message: string, public readonly reason: HostingerMailFailure, public readonly statusCode?: number) {
    super(message);
    this.name = 'HostingerMailError';
  }
}

type Mailbox = { resourceId: string; address: string };
type FetchMail = typeof fetch;
type MailAddress = { address: string; displayName?: string };
const MAX_MAIL_RESPONSE_BYTES = 1024 * 1024;
const MAX_MAIL_TEXT_BYTES = 256 * 1024;

/** Bound account, inventory and content responses before JSON parsing. */
const readBoundedMailJson = async (response: Response): Promise<unknown> => {
  const length = response.headers.get('content-length');
  if ((length && (!/^\d+$/.test(length) || Number(length) > MAX_MAIL_RESPONSE_BYTES)) || !response.body) {
    void response.body?.cancel().catch(() => {});
    throw new HostingerMailError('Hostinger Mail returned an oversized or invalid response.', 'invalid-response');
  }
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      (async () => {
        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          bytes += value.byteLength;
          if (bytes > MAX_MAIL_RESPONSE_BYTES) throw new HostingerMailError('Hostinger Mail returned an oversized response.', 'invalid-response');
          chunks.push(value);
        }
        return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks))) as unknown;
      })(),
      new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new HostingerMailError('Hostinger Mail response timed out.', 'network-error')), 10_000); }),
    ]);
  } catch (error) {
    if (error instanceof HostingerMailError) throw error;
    throw new HostingerMailError('Hostinger Mail returned an invalid response.', 'invalid-response');
  } finally {
    clearTimeout(timer);
    // Do not wait for an untrusted streaming source to acknowledge cancellation.
    void reader.cancel().catch(() => {});
  }
};

export interface HostingerMailPagination {
  page: number;
  perPage: number;
  total: number;
  totalPages: number;
}

export interface HostingerMailFolder {
  path: string;
  name: string;
  delimiter: string;
  specialUse: string | null;
  messageCount: number;
  unreadCount: number;
}

/** Metadata only: message bodies, HTML and attachments are not returned here. */
export interface HostingerMailMessage {
  uid: number;
  path: string;
  date: string;
  flags: string[];
  unseen: boolean;
  size: number;
  subject: string | null;
  from: { name: string; address: string } | null;
  to: Array<{ name: string; address: string }>;
}

const parseMailAddress = (value: string): MailAddress | null => {
  if (!value || /[\r\n]/.test(value)) return null;
  const match = value.trim().match(/^(?:([^<>]*)\s*<([^<>]+)>|([^<>]+))$/);
  if (!match) return null;
  const address = (match[2] || match[3]).trim();
  if (!/^[^\s@<>,;]+@[^\s@<>,;]+\.[^\s@<>,;]+$/.test(address)) return null;
  const displayName = match[1]?.trim().replace(/^"(.*)"$/, '$1');
  return { address, ...(displayName ? { displayName } : {}) };
};

export const getHostingerMailConfig = (env: Record<string, string | undefined> = process.env): HostingerMailConfig => {
  const read = (...keys: string[]) => keys.map((key) => env[key]?.trim()).find(Boolean) || '';
  return {
    apiToken: read('BACKY_HOSTINGER_MAIL_API_TOKEN'),
    from: read('BACKY_EMAIL_FROM', 'BACKY_NOTIFICATION_EMAIL_FROM', 'BACKY_HOSTINGER_MAIL_FROM'),
    mailboxId: read('BACKY_HOSTINGER_MAILBOX_ID') || undefined,
  };
};

export const getHostingerMailConfigurationSummary = (config = getHostingerMailConfig()) => {
  const missing = [
    !config.apiToken ? 'BACKY_HOSTINGER_MAIL_API_TOKEN' : '',
    !parseMailAddress(config.from) ? 'BACKY_EMAIL_FROM or BACKY_HOSTINGER_MAIL_FROM (valid mailbox address)' : '',
  ].filter(Boolean);
  return {
    provider: 'hostinger' as const,
    configured: missing.length === 0,
    apiTokenConfigured: Boolean(config.apiToken),
    mailboxIdConfigured: Boolean(config.mailboxId),
    from: config.from,
    missing,
    apiOrigin: HOSTINGER_MAIL_API_ORIGIN,
    authenticationVerified: false,
    outboundDeliveryVerified: false,
    inboxIntegrated: false,
    mailboxProvisioningIntegrated: false,
  };
};

const assertConfig = (config: HostingerMailConfig) => {
  if (!getHostingerMailConfigurationSummary(config).configured) {
    throw new HostingerMailError('Configure a Hostinger Mail API token and a valid sender mailbox on the server.', 'not-configured');
  }
};

const requestMail = async (config: HostingerMailConfig, path: string, init: RequestInit, fetchMail: FetchMail, accept = 'application/json') => {
  let response: Response;
  try {
    response = await fetchMail(`${HOSTINGER_MAIL_API_ORIGIN}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${config.apiToken}`,
        Accept: accept,
        ...(init.body ? { 'Content-Type': 'application/json' } : {}),
      },
      redirect: 'error',
      cache: 'no-store',
      signal: AbortSignal.timeout(10_000),
    });
  } catch {
    // Provider/fetch errors may contain credentials, URLs or message content.
    throw new HostingerMailError('Hostinger Mail could not be reached within the request deadline.', 'network-error');
  }
  if (!response.ok) {
    const reason: HostingerMailFailure = response.status === 401 ? 'invalid-token'
      : response.status === 403 ? 'scope-denied'
        : response.status === 404 ? 'mailbox-unavailable'
          : response.status === 429 ? 'rate-limited'
            : [400, 422].includes(response.status) ? 'invalid-request' : 'provider-error';
    const detail = reason === 'invalid-token' ? 'The API token is missing, expired or invalid.'
      : reason === 'scope-denied' ? 'The API token cannot manage this mailbox.'
        : reason === 'rate-limited' ? 'Hostinger Mail rate limit reached.'
          : 'Hostinger Mail rejected the request.';
    // Do not reflect provider response bodies into admin responses or outbox logs.
    throw new HostingerMailError(`${detail} (HTTP ${response.status})`, reason, response.status);
  }
  return response;
};

const resolveMailbox = async (config: HostingerMailConfig, fetchMail: FetchMail): Promise<Mailbox> => {
  assertConfig(config);
  const response = await requestMail(config, '/api/v1/me', { method: 'GET' }, fetchMail);
  let payload: unknown;
  try {
    payload = await readBoundedMailJson(response);
  } catch {
    throw new HostingerMailError('Hostinger Mail returned an invalid account response.', 'invalid-response');
  }
  const mailboxes = (payload as { data?: { mailboxes?: unknown } } | null)?.data?.mailboxes;
  if (!Array.isArray(mailboxes) || !mailboxes.every((box) => (
    box && typeof box.resourceId === 'string' && box.resourceId.length > 0 && !['.', '..'].includes(box.resourceId) && typeof box.address === 'string' && parseMailAddress(box.address)
  ))) {
    throw new HostingerMailError('Hostinger Mail returned an invalid mailbox list.', 'invalid-response');
  }
  const sender = parseMailAddress(config.from)!;
  const matches = (mailboxes as Mailbox[]).filter((box) => config.mailboxId
    ? box.resourceId === config.mailboxId
    : box.address.toLowerCase() === sender.address.toLowerCase());
  if (matches.length > 1) throw new HostingerMailError('Hostinger Mail returned an ambiguous mailbox selection.', 'invalid-response');
  const mailbox = matches[0];
  if (!mailbox) {
    throw new HostingerMailError('The configured sender mailbox is not accessible to this API token.', 'mailbox-unavailable');
  }
  if (mailbox.address.toLowerCase() !== sender.address.toLowerCase()) {
    throw new HostingerMailError('The configured sender does not match the selected Hostinger mailbox.', 'sender-mismatch');
  }
  return { resourceId: mailbox.resourceId, address: mailbox.address };
};

/** Read-only authentication/scope check. Does not read inbox contents or send mail. */
export const probeHostingerMailConnection = async (config = getHostingerMailConfig(), fetchMail: FetchMail = fetch) => {
  const configuration = getHostingerMailConfigurationSummary(config);
  if (!configuration.configured) {
    return { ...configuration, status: 'not-configured' as const, selectedMailbox: null };
  }
  try {
    const mailbox = await resolveMailbox(config, fetchMail);
    return { ...configuration, status: 'connected' as const, authenticationVerified: true, selectedMailbox: mailbox };
  } catch (error) {
    const failure = error instanceof HostingerMailError ? error
      : new HostingerMailError('Hostinger Mail connection could not be verified.', 'provider-error');
    return { ...configuration, status: 'failed' as const, selectedMailbox: null, reason: failure.reason, statusCode: failure.statusCode, error: failure.message };
  }
};

export interface HostingerMailOutgoingAttachment { filename: string; content: string; contentType: string }
export interface HostingerMailOutgoingMessage {
  from: string; to: string | string[]; cc?: string[]; bcc?: string[]; subject: string; text: string;
  attachments?: HostingerMailOutgoingAttachment[];
  inReplyTo?: { folder: string; uid: number };
}
export const MAX_HOSTINGER_MAIL_OUTGOING_BYTES = 2 * 1024 * 1024;
/** Validate before any provider lookup. Only explicit plain text and regular base64 attachments. */
export function normalizeHostingerMailOutgoingMessage(message: HostingerMailOutgoingMessage) {
  const invalid = (): never => { throw new HostingerMailError('Use valid recipients, a bounded plain-text message and at most 10 base64 attachments totaling 2 MiB.', 'invalid-request'); };
  const recipients = (input: unknown): string[] => {
    if (!Array.isArray(input) || input.length > 50 || input.some(value => typeof value !== 'string' || !parseMailAddress(value) || parseMailAddress(value)!.displayName)) return invalid();
    return input.map(value => parseMailAddress(value)!.address);
  };
  const to = recipients(typeof message.to === 'string' ? [message.to] : message.to);
  const cc = recipients(message.cc ?? []), bcc = recipients(message.bcc ?? []);
  if (to.length + cc.length + bcc.length < 1 || to.length + cc.length + bcc.length > 50 || new Set([...to, ...cc, ...bcc].map(value => value.toLowerCase())).size !== to.length + cc.length + bcc.length
    || typeof message.subject !== 'string' || /[\p{Cc}\p{Cs}]/u.test(message.subject) || Buffer.byteLength(message.subject, 'utf8') > 998
    || typeof message.text !== 'string' || Buffer.byteLength(message.text, 'utf8') > MAX_MAIL_TEXT_BYTES || /[\p{Cs}]/u.test(message.text)) return invalid();
  if (message.inReplyTo) { folderPath(message.inReplyTo.folder); if (!isCount(message.inReplyTo.uid) || message.inReplyTo.uid < 1) return invalid(); }
  if (message.attachments !== undefined && (!Array.isArray(message.attachments) || message.attachments.length > 10)) return invalid();
  let total = 0;
  const attachments = (message.attachments ?? []).map(attachment => {
    if (!isRecord(attachment) || Object.keys(attachment).some(key => !['filename', 'content', 'contentType'].includes(key))
      || typeof attachment.filename !== 'string' || !attachment.filename.trim() || Buffer.byteLength(attachment.filename, 'utf8') > 180
      || attachment.filename !== safeHostingerMailAttachmentFilename(attachment.filename)
      || typeof attachment.contentType !== 'string' || attachment.contentType.length > 255 || !/^[A-Za-z0-9!#$&^_.+-]+\/[A-Za-z0-9!#$&^_.+-]+$/.test(attachment.contentType)
      || typeof attachment.content !== 'string' || attachment.content.length > Math.ceil(MAX_HOSTINGER_MAIL_OUTGOING_BYTES / 3) * 4
      || attachment.content.length % 4 !== 0 || /[^A-Za-z0-9+/=]/.test(attachment.content)) return invalid();
    const bytes = Buffer.from(attachment.content, 'base64');
    if (bytes.toString('base64') !== attachment.content || (total += bytes.byteLength) > MAX_HOSTINGER_MAIL_OUTGOING_BYTES) return invalid();
    return { filename: attachment.filename, content: attachment.content, contentType: attachment.contentType.toLowerCase(), encoding: 'base64' };
  });
  return { to, ...(cc.length ? { cc } : {}), ...(bcc.length ? { bcc } : {}), subject: message.subject, text: message.text,
    ...(attachments.length ? { attachments } : {}), ...(message.inReplyTo ? { inReplyTo: { folder: message.inReplyTo.folder, uid: message.inReplyTo.uid } } : {}) };
}
export const sendHostingerMailMessage = async (config: HostingerMailConfig, message: HostingerMailOutgoingMessage, fetchMail: FetchMail = fetch) => {
  assertConfig(config);
  const sender = parseMailAddress(message.from), configuredSender = parseMailAddress(config.from)!;
  if (!sender || sender.address.toLowerCase() !== configuredSender.address.toLowerCase()) throw new HostingerMailError('The message sender must match the configured Hostinger mailbox.', 'sender-mismatch');
  const outgoing = normalizeHostingerMailOutgoingMessage(message);
  const mailbox = await resolveMailbox(config, fetchMail);
  if (outgoing.inReplyTo) {
    const source = await readPayload(await requestMail(config, `/api/v1/mailboxes/${encodeURIComponent(mailbox.resourceId)}/folders/${folderPath(outgoing.inReplyTo.folder)}/messages/${outgoing.inReplyTo.uid}`, { method: 'GET' }, fetchMail));
    const metadata = readMessage(source.data);
    if (metadata.uid !== outgoing.inReplyTo.uid || metadata.path !== outgoing.inReplyTo.folder) return invalidResponse();
  }
  const response = await requestMail(config, `/api/v1/mailboxes/${encodeURIComponent(mailbox.resourceId)}/send`, {
    method: 'POST', body: JSON.stringify({ ...outgoing, ...(sender.displayName ? { displayName: sender.displayName } : {}) }),
  }, fetchMail);
  if (response.status !== 204) throw new HostingerMailError('Hostinger Mail returned an unexpected send response; delivery is unverified.', 'invalid-response', response.status);
  return { statusCode: response.status, metadata: { providerAccepted: true, deliveryVerified: false } };
};

const invalidResponse = (): never => {
  throw new HostingerMailError('Hostinger Mail returned an invalid mailbox response.', 'invalid-response');
};
const isRecord = (value: unknown): value is Record<string, unknown> => Boolean(value && typeof value === 'object' && !Array.isArray(value));
const isCount = (value: unknown): value is number => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
const readPayload = async (response: Response): Promise<Record<string, unknown>> => {
  try {
    const payload: unknown = await readBoundedMailJson(response);
    return isRecord(payload) ? payload : invalidResponse();
  } catch {
    return invalidResponse();
  }
};
const readPagination = (value: unknown): HostingerMailPagination => {
  if (!isRecord(value) || !isCount(value.page) || value.page < 1 || !isCount(value.perPage) || value.perPage < 1 || value.perPage > 100 || !isCount(value.total) || !isCount(value.totalPages)) return invalidResponse();
  return { page: value.page, perPage: value.perPage, total: value.total, totalPages: value.totalPages };
};
const paginationQuery = (options: { page?: number; perPage?: number }) => {
  const page = options.page ?? 1;
  const perPage = options.perPage ?? 20;
  if (!isCount(page) || page < 1 || !isCount(perPage) || perPage < 1 || perPage > 100) {
    throw new HostingerMailError('Page must be positive and page size must be between 1 and 100.', 'invalid-request');
  }
  return new URLSearchParams({ page: String(page), perPage: String(perPage) }).toString();
};
const folderPath = (folder: string) => {
  if (!folder || folder.length > 1024 || /[\r\n\0]/.test(folder) || ['.', '..'].includes(folder)) {
    throw new HostingerMailError('A valid mailbox folder path is required.', 'invalid-request');
  }
  return encodeURIComponent(folder);
};
const readAddress = (value: unknown): { name: string; address: string } => {
  if (!isRecord(value) || typeof value.name !== 'string' || typeof value.address !== 'string') return invalidResponse();
  return { name: value.name, address: value.address };
};
const readMessage = (value: unknown): HostingerMailMessage => {
  if (!isRecord(value) || !isCount(value.uid) || value.uid < 1 || typeof value.path !== 'string' || typeof value.date !== 'string' || !Array.isArray(value.flags) || !value.flags.every((flag) => typeof flag === 'string') || typeof value.unseen !== 'boolean' || !isCount(value.size) || (value.subject !== null && typeof value.subject !== 'string') || !Array.isArray(value.to)) return invalidResponse();
  return {
    uid: value.uid, path: value.path, date: value.date, flags: value.flags, unseen: value.unseen,
    size: value.size, subject: value.subject, from: value.from === null ? null : readAddress(value.from), to: value.to.map(readAddress),
  };
};

/** Read-only primitives for an authenticated inbox workspace; callers must enforce admin authorization. */
export const listHostingerMailFolders = async (config: HostingerMailConfig, options: { page?: number; perPage?: number } = {}, fetchMail: FetchMail = fetch) => {
  const query = paginationQuery(options);
  const mailbox = await resolveMailbox(config, fetchMail);
  const payload = await readPayload(await requestMail(config, `/api/v1/mailboxes/${encodeURIComponent(mailbox.resourceId)}/folders?${query}`, { method: 'GET' }, fetchMail));
  if (!Array.isArray(payload.data)) return invalidResponse();
  const data: HostingerMailFolder[] = payload.data.map((folder: unknown) => {
    if (!isRecord(folder) || typeof folder.path !== 'string' || typeof folder.name !== 'string' || typeof folder.delimiter !== 'string' || (folder.specialUse !== null && typeof folder.specialUse !== 'string') || !isCount(folder.messageCount) || !isCount(folder.unreadCount)) return invalidResponse();
    return { path: folder.path, name: folder.name, delimiter: folder.delimiter, specialUse: folder.specialUse, messageCount: folder.messageCount, unreadCount: folder.unreadCount };
  });
  return { data, pagination: readPagination(payload.pagination) };
};

export const listHostingerMailMessages = async (config: HostingerMailConfig, options: { folder: string; page?: number; perPage?: number }, fetchMail: FetchMail = fetch) => {
  const folder = folderPath(options.folder);
  const query = paginationQuery(options);
  const mailbox = await resolveMailbox(config, fetchMail);
  const payload = await readPayload(await requestMail(config, `/api/v1/mailboxes/${encodeURIComponent(mailbox.resourceId)}/folders/${folder}/messages?${query}`, { method: 'GET' }, fetchMail));
  if (!Array.isArray(payload.data)) return invalidResponse();
  return { data: payload.data.map(readMessage), pagination: readPagination(payload.pagination) };
};

export const getHostingerMailMessage = async (config: HostingerMailConfig, options: { folder: string; uid: number }, fetchMail: FetchMail = fetch) => {
  const folder = folderPath(options.folder);
  if (!isCount(options.uid) || options.uid < 1) throw new HostingerMailError('A positive message UID is required.', 'invalid-request');
  const mailbox = await resolveMailbox(config, fetchMail);
  const payload = await readPayload(await requestMail(config, `/api/v1/mailboxes/${encodeURIComponent(mailbox.resourceId)}/folders/${folder}/messages/${options.uid}`, { method: 'GET' }, fetchMail));
  return { data: readMessage(payload.data) };
};

/** Provider GET /text marks the message Seen. Expose only through an explicit authorized POST action. */
export const readHostingerMailMessageText = async (config: HostingerMailConfig, options: { folder: string; uid: number }, fetchMail: FetchMail = fetch) => {
  const folder = folderPath(options.folder);
  if (!isCount(options.uid) || options.uid < 1) throw new HostingerMailError('A positive message UID is required.', 'invalid-request');
  const mailbox = await resolveMailbox(config, fetchMail);
  const payload = await readPayload(await requestMail(config, `/api/v1/mailboxes/${encodeURIComponent(mailbox.resourceId)}/folders/${folder}/messages/${options.uid}/text`, { method: 'GET' }, fetchMail));
  if (!isRecord(payload.data) || typeof payload.data.text !== 'string' || Buffer.byteLength(payload.data.text, 'utf8') > MAX_MAIL_TEXT_BYTES) return invalidResponse();
  // HTML, attachments and provider extension fields never cross the application boundary.
  return { data: { text: payload.data.text } };
};

/** Official decoded attachment endpoint /messages/{uid}/attachments/{attachmentId}.
 * https://github.com/hostinger/mail-api-typescript-sdk/blob/main/docs/MessagesApi.md
 * https://github.com/hostinger/mail-api-typescript-sdk/blob/main/docs/V1FolderMessagesMessageAttachment.md
 */
export const MAX_HOSTINGER_MAIL_ATTACHMENT_BYTES = 3 * 1024 * 1024;
export const HOSTINGER_MAIL_ATTACHMENT_DEADLINE_MS = 15_000;
export interface HostingerMailAttachment { id: string; filename: string | null; contentType: string; sizeBytes: number; inline: boolean }
export const validHostingerMailAttachmentId = (value: unknown): value is string => typeof value === 'string' && Boolean(value.trim()) && Buffer.byteLength(value,'utf8') <= 512 && !/[\p{Cc}\p{Cs}]/u.test(value) && !['.','..'].includes(value);
export const safeHostingerMailAttachmentFilename = (value: string): string => {
  const parts = value.replace(/\\/g,'/').split('/');
  let name = (parts.at(-1) || '').replace(/[\p{Cc}\p{Cs}\u202a-\u202e\u2066-\u2069]/gu,'').trim().replace(/[<>:"|?*]/g,'_');
  if (!name || ['.','..'].includes(name)) return 'attachment.bin';
  const points = Array.from(name);
  while (Buffer.byteLength(points.join(''),'utf8') > 180) points.pop();
  name = points.join('').trim();
  return name && !['.','..'].includes(name) ? name : 'attachment.bin';
};
const attachmentOptions = (options: {folder:string;uid:number;attachmentId?:string}) => {
  if (!options.folder || options.folder.length > 1024 || /[\p{Cc}\p{Cs}]/u.test(options.folder) || ['.','..'].includes(options.folder) || !isCount(options.uid) || options.uid < 1 || (options.attachmentId !== undefined && !validHostingerMailAttachmentId(options.attachmentId))) {
    throw new HostingerMailError('A valid folder, message UID and opaque attachment identifier are required.','invalid-request');
  }
  return folderPath(options.folder);
};
const attachmentOperation = async <T>(action: (fetchWithin: FetchMail, signal: AbortSignal)=>Promise<T>, fetchMail: FetchMail): Promise<T> => {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const fetchWithin: FetchMail = async (input, init) => {
    if(controller.signal.aborted)throw new HostingerMailError('Hostinger Mail attachment request timed out.','network-error');
    const response = await fetchMail(input,{...init,signal:AbortSignal.any([controller.signal,...(init?.signal ? [init.signal] : [])])});
    if (controller.signal.aborted) { void response.body?.cancel().catch(()=>{}); throw new HostingerMailError('Hostinger Mail attachment request timed out.','network-error'); }
    return response;
  };
  try {
    return await Promise.race([action(fetchWithin,controller.signal),new Promise<never>((_,reject)=>{timer=setTimeout(()=>{controller.abort();reject(new HostingerMailError('Hostinger Mail attachment request timed out.','network-error'));},HOSTINGER_MAIL_ATTACHMENT_DEADLINE_MS);})]);
  } catch(error) {
    if(error instanceof HostingerMailError)throw error;
    throw new HostingerMailError('Hostinger Mail attachment could not be retrieved.','network-error');
  } finally { clearTimeout(timer); controller.abort(); }
};
const attachmentMetadata = async (config:HostingerMailConfig, mailbox:Mailbox, options:{folder:string;uid:number}, fetchMail:FetchMail) => {
  const path = `/api/v1/mailboxes/${encodeURIComponent(mailbox.resourceId)}/folders/${attachmentOptions(options)}/messages/${options.uid}`;
  const payload = await readPayload(await requestMail(config,path,{method:'GET'},fetchMail));
  const message = readMessage(payload.data);
  if (message.uid !== options.uid || message.path !== options.folder || !isRecord(payload.data) || !Array.isArray(payload.data.attachments) || payload.data.attachments.length > 100) return invalidResponse();
  const seen = new Set<string>();
  const attachments:HostingerMailAttachment[] = payload.data.attachments.map((item:unknown)=>{
    if (!isRecord(item) || !validHostingerMailAttachmentId(item.id) || seen.has(item.id) || typeof item.contentType !== 'string' || item.contentType.length > 255 || !/^[A-Za-z0-9!#$&^_.+-]+\/[A-Za-z0-9!#$&^_.+-]+$/.test(item.contentType) || !isCount(item.sizeBytes) || typeof item.inline !== 'boolean' || (item.filename !== null && (typeof item.filename !== 'string' || Buffer.byteLength(item.filename,'utf8') > 1024))) return invalidResponse();
    seen.add(item.id);
    return {id:item.id,filename:item.filename === null ? null : safeHostingerMailAttachmentFilename(item.filename),contentType:item.contentType.toLowerCase(),sizeBytes:item.sizeBytes,inline:item.inline};
  });
  return {path,attachments};
};
export const listHostingerMailAttachments = async (config:HostingerMailConfig, options:{folder:string;uid:number}, fetchMail:FetchMail=fetch) => {
  attachmentOptions(options);
  return attachmentOperation(async(fetchWithin)=>{
    const mailbox=await resolveMailbox(config,fetchWithin);
    const {attachments}=await attachmentMetadata(config,mailbox,options,fetchWithin);
    return {data:attachments};
  },fetchMail);
};
export const downloadHostingerMailAttachment = async (config:HostingerMailConfig, options:{folder:string;uid:number;attachmentId:string}, fetchMail:FetchMail=fetch) => {
  attachmentOptions(options);
  return attachmentOperation(async(fetchWithin,signal)=>{
    const mailbox=await resolveMailbox(config,fetchWithin);
    const {path,attachments}=await attachmentMetadata(config,mailbox,options,fetchWithin);
    const attachment=attachments.find(item=>item.id===options.attachmentId);
    if (!attachment) throw new HostingerMailError('Attachment not found for this message.','attachment-not-found');
    if (attachment.sizeBytes > MAX_HOSTINGER_MAIL_ATTACHMENT_BYTES) throw new HostingerMailError('Attachment exceeds the supported download size.','attachment-too-large');
    const response=await requestMail(config,`${path}/attachments/${encodeURIComponent(attachment.id)}`,{method:'GET'},fetchWithin,'application/octet-stream, application/json');
    const length=response.headers.get('content-length');
    if(length!==null&&/^\d+$/.test(length)&&Number(length)>MAX_HOSTINGER_MAIL_ATTACHMENT_BYTES){void response.body?.cancel().catch(()=>{});throw new HostingerMailError('Attachment exceeds the supported download size.','attachment-too-large');}
    if (response.status!==200 || response.headers.get('content-type')?.split(';')[0].trim().toLowerCase()!=='application/octet-stream' || (response.headers.get('content-encoding') && response.headers.get('content-encoding')!=='identity') || (length!==null && (!/^\d+$/.test(length) || Number(length)!==attachment.sizeBytes))) {
      void response.body?.cancel().catch(()=>{}); return invalidResponse();
    }
    if (!response.body) { if(attachment.sizeBytes===0)return{bytes:new Uint8Array(),filename:attachment.filename||'attachment.bin'};return invalidResponse(); }
    const reader=response.body.getReader(),chunks:Uint8Array[]=[];
    let size=0;
    const aborted=new Promise<never>((_,reject)=>{const abort=()=>reject(new HostingerMailError('Hostinger Mail attachment request timed out.','network-error'));if(signal.aborted)abort();else signal.addEventListener('abort',abort,{once:true});});
    try {
      await Promise.race([(async()=>{while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>MAX_HOSTINGER_MAIL_ATTACHMENT_BYTES)throw new HostingerMailError('Attachment exceeds the supported download size.','attachment-too-large');if(size>attachment.sizeBytes)return invalidResponse();chunks.push(value);}})(),aborted]);
      if(size!==attachment.sizeBytes)return invalidResponse();
      return {bytes:new Uint8Array(Buffer.concat(chunks)),filename:attachment.filename||'attachment.bin'};
    } finally { void reader.cancel().catch(()=>{}); }
  },fetchMail);
};

/** Direct header-linked conversation inventory in one exact folder. Does not read text or mark Seen.
 * Provider search is documented in MessagesApi and V1FolderMessagesSearchRequest.
 * No subject heuristics: unrelated subject matches and body substring hits are discarded.
 */
export async function listHostingerMailThread(config: HostingerMailConfig, options: { folder: string; uid: number; page?: number; perPage?: number }, fetchMail: FetchMail = fetch) {
  const folder = folderPath(options.folder), query = paginationQuery(options);
  if (!isCount(options.uid) || options.uid < 1) throw new HostingerMailError('A positive source message UID is required.', 'invalid-request');
  const mailbox = await resolveMailbox(config, fetchMail), root = `/api/v1/mailboxes/${encodeURIComponent(mailbox.resourceId)}/folders/${folder}/messages`;
  const source = await readPayload(await requestMail(config, `${root}/${options.uid}`, { method: 'GET' }, fetchMail));
  const sourceMessage = readMessage(source.data);
  if (sourceMessage.path !== options.folder || sourceMessage.uid !== options.uid || !isRecord(source.data)) return invalidResponse();
  const header = (value: unknown): string | null => value === null || value === undefined || value === '' ? null
    : typeof value === 'string' && Buffer.byteLength(value, 'utf8') <= 998 && !/[\p{Cc}\p{Cs}]/u.test(value) ? value : invalidResponse();
  const messageId = header(source.data.messageId), inReplyTo = header(source.data.inReplyTo), anchor = inReplyTo || messageId;
  if (!anchor) return { data: (options.page ?? 1) === 1 ? [sourceMessage] : [], source: sourceMessage, pagination: { page: options.page ?? 1, perPage: options.perPage ?? 20, total: 1, totalPages: 1 }, relationship: 'direct-header-links' as const, sourceHasThreadHeaders: false };
  const payload = await readPayload(await requestMail(config, `${root}/search?${query}`, { method: 'POST', body: JSON.stringify({ text: anchor }) }, fetchMail));
  if (!Array.isArray(payload.data)) return invalidResponse();
  const pagination = readPagination(payload.pagination);
  if (pagination.page !== (options.page ?? 1) || pagination.perPage !== (options.perPage ?? 20) || payload.data.length > pagination.perPage || payload.data.length > pagination.total || pagination.totalPages !== Math.ceil(pagination.total / pagination.perPage)) return invalidResponse();
  const seen = new Set<number>();
  const data = payload.data.flatMap(value => {
    const message = readMessage(value);
    if (message.path !== options.folder || seen.has(message.uid) || !isRecord(value)) return invalidResponse();
    seen.add(message.uid);
    return message.uid === options.uid || header(value.messageId) === anchor || header(value.inReplyTo) === anchor ? [message] : [];
  });
  return { data, source: sourceMessage, pagination, relationship: 'direct-header-links' as const, sourceHasThreadHeaders: true };
}
