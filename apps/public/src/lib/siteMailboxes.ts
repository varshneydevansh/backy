/** Private owner workspace. Outbound sender policy never grants mailbox read access. */
import { NextRequest, NextResponse } from 'next/server';
import { adminAccessError, isOwnerAdminSession, requireAdminAccess } from './adminAccess';
import { getSiteByIdOrSlug } from './backyStore';
import { getRequiredDatabaseRepositories, shouldUseDemoStoreFallback } from './repositoryRuntime';
import { isCanonicalEmailSiteId, isPlainEmailSenderAddress } from './emailSenderPolicy';
import { getHostingerMailConfig, HostingerMailError, listHostingerMailFolders, listHostingerMailMessages, readHostingerMailMessageText, type HostingerMailConfig, type HostingerMailPagination } from './hostingerMail';

const BINDINGS_ENV = 'BACKY_HOSTINGER_MAILBOX_BINDINGS';
const bindingIdValid = (value: unknown): value is string => typeof value === 'string' && /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/.test(value);
export interface SiteMailboxBinding { id: string; siteId: string; mailboxId: string; address: string }
export const siteMailboxCapabilities = {
  folders: true, messageInventory: true, messageText: true, readMarksSeen: true,
  compose: true, reply: true, attachments: true, outgoingAttachments: true, threadInventory: true, sendHistory: true, provisioning: false,
} as const;
class MailboxRequestError extends Error {
  constructor(public readonly status: number, public readonly code: string, message: string) { super(message); }
}
const invalidBindings = (): never => { throw new MailboxRequestError(503, 'MAILBOX_CONFIGURATION_INVALID', 'Server mailbox bindings are invalid. Repair the explicit mailbox inventory before reading mail.'); };
export function getSiteMailboxBindings(env: Record<string, string | undefined> = process.env): SiteMailboxBinding[] {
  const raw = env[BINDINGS_ENV]?.trim();
  if (!raw) return [];
  if (Buffer.byteLength(raw, 'utf8') > 65536) return invalidBindings();
  let value: unknown;
  try { value = JSON.parse(raw); } catch { return invalidBindings(); }
  if (!Array.isArray(value) || value.length > 200) return invalidBindings();
  const ids = new Set<string>(), mailboxes = new Set<string>(), addresses = new Set<string>();
  return value.map((item: unknown) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return invalidBindings();
    const binding = item as Record<string, unknown>;
    if (!bindingIdValid(binding.id) || typeof binding.siteId !== 'string' || !isCanonicalEmailSiteId(binding.siteId)
      || typeof binding.mailboxId !== 'string' || !binding.mailboxId || binding.mailboxId.length > 200 || /[\u0000-\u0020\u007f]/.test(binding.mailboxId) || ['.', '..'].includes(binding.mailboxId)
      || !isPlainEmailSenderAddress(binding.address)) return invalidBindings();
    const address = binding.address.toLowerCase();
    // A provider mailbox cannot be silently shared across site bindings.
    if (ids.has(binding.id) || mailboxes.has(binding.mailboxId) || addresses.has(address)) return invalidBindings();
    ids.add(binding.id); mailboxes.add(binding.mailboxId); addresses.add(address);
    return { id: binding.id, siteId: binding.siteId, mailboxId: binding.mailboxId, address: binding.address };
  });
}

type MailboxOperation = 'bindings' | 'folders' | 'messages' | 'read';
export type SiteMailboxParams = { siteId: string; bindingId?: string; uid?: string };
const respond = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { 'Cache-Control': 'private, no-store' } });
const invalidRequest = (message = 'Use supported mailbox parameters and positive page/message identifiers.'): never => { throw new MailboxRequestError(400, 'MAILBOX_REQUEST_INVALID', message); };
function folderValue(value: unknown): string {
  if (typeof value !== 'string' || !value || value.length > 1024 || /[\r\n\0]/.test(value) || ['.', '..'].includes(value)) return invalidRequest('A valid mailbox folder path is required.');
  return value;
}
function positiveInteger(value: string | null, fallback: number, maximum = Number.MAX_SAFE_INTEGER): number {
  if (value === null) return fallback;
  if (!/^[1-9]\d*$/.test(value)) return invalidRequest();
  const result = Number(value);
  if (!Number.isSafeInteger(result) || result > maximum) return invalidRequest();
  return result;
}
function queryOptions(request: NextRequest, operation: MailboxOperation) {
  const query = new URL(request.url).searchParams;
  const allowed = operation === 'bindings' || operation === 'read' ? [] : operation === 'messages' ? ['folder', 'page', 'perPage'] : ['page', 'perPage'];
  for (const key of query.keys()) if (!allowed.includes(key) || query.getAll(key).length !== 1) return invalidRequest('Only folder and bounded pagination may be selected; mailbox identity is server-owned.');
  return { page: positiveInteger(query.get('page'), 1), perPage: positiveInteger(query.get('perPage'), 20, 100), ...(operation === 'messages' ? { folder: folderValue(query.get('folder')) } : {}) };
}
function assertInventoryScope(pagination: HostingerMailPagination, count: number, options: { page: number; perPage: number }) {
  if (pagination.page !== options.page || pagination.perPage !== options.perPage || count > options.perPage || count > pagination.total) {
    throw new HostingerMailError('Hostinger Mail returned inconsistent mailbox pagination.', 'invalid-response');
  }
}
async function readBody(request: NextRequest) {
  if (request.headers.get('content-type')?.split(';')[0].trim().toLowerCase() !== 'application/json') return invalidRequest('The read action requires a JSON folder selection.');
  // Read incrementally: a declared or streaming oversized body must not be buffered unboundedly.
  if (!request.body) return invalidRequest('The read action requires a JSON folder selection.');
  const reader = request.body.getReader(), chunks: Uint8Array[] = [];
  let bytes = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > 8192) return invalidRequest('The mailbox read request exceeds the supported size.');
      chunks.push(value);
    }
  } finally { void reader.cancel().catch(() => {}); }
  let body: unknown;
  try {
    const raw = new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks));
    // This action accepts exactly one string member. Do not normalize duplicate
    // folder keys (including escaped spellings) through JSON.parse's last value.
    if (!/^\s*\{\s*"(?:[^"\\]|\\.)*"\s*:\s*"(?:[^"\\]|\\.)*"\s*\}\s*$/u.test(raw)) return invalidRequest('The read action accepts exactly one folder selection.');
    body = JSON.parse(raw);
  } catch { return invalidRequest('The read action requires valid UTF-8 JSON.'); }
  if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).some(key => key !== 'folder')) return invalidRequest('The read action accepts only a folder selection.');
  return folderValue((body as Record<string, unknown>).folder);
}

/** All provider execution follows current owner, permission, canonical site and exact binding admission. */
export async function siteMailboxRoute(request: NextRequest, context: { params: Promise<SiteMailboxParams> }, operation: MailboxOperation) {
  const requestId = request.headers.get('x-request-id') || `mail_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  const error = (status: number, code: string, message: string) => respond({ success: false, requestId, error: { code, message } }, status);
  try {
    // The mail workspace deliberately accepts only ambient owner cookies. An
    // explicit credential must not bypass Origin checks, even beside a cookie.
    if (['authorization', 'x-backy-admin-session', 'x-backy-admin-key', 'x-api-key'].some(header => request.headers.has(header))) {
      return adminAccessError(403, 'OWNER_SESSION_REQUIRED', 'Mailbox access requires an owner cookie session without explicit credential headers.', requestId);
    }
    if (!request.cookies.get('backy_admin_session')?.value?.trim()) return adminAccessError(401, 'UNAUTHORIZED', 'A current owner cookie session is required for mailbox access.', requestId);
    const access = await requireAdminAccess(request, requestId, { permissions: ['sites.view', 'settings.view'], recordUsage: false });
    if (access instanceof NextResponse) return access;
    if (!isOwnerAdminSession(access)) return adminAccessError(403, 'OWNER_SESSION_REQUIRED', 'Mailbox access requires an active owner admin session.', requestId);
    if (request.method !== (operation === 'read' ? 'POST' : 'GET')) return error(405, 'MAILBOX_METHOD_NOT_ALLOWED', 'Opening message text requires an explicit POST read action.');
    const params = await context.params;
    const repositories = shouldUseDemoStoreFallback() ? null : await getRequiredDatabaseRepositories();
    const site = repositories ? await repositories.sites.getById(params.siteId) || await repositories.sites.getBySlug(params.siteId) : getSiteByIdOrSlug(params.siteId);
    if (!site) return error(404, 'SITE_NOT_FOUND', 'Site not found.');
    const options = queryOptions(request, operation);
    const bindings = getSiteMailboxBindings().filter(binding => binding.siteId === site.id);
    const provider = getHostingerMailConfig();
    if (operation === 'bindings') return respond({ success: true, requestId, data: {
      schema: 'backy.site-mailboxes.v1', siteId: site.id, provider: 'hostinger', configured: Boolean(provider.apiToken && bindings.length),
      mailboxes: bindings.map(({ id, address }) => ({ id, address })), capabilities: siteMailboxCapabilities,
    } });
    const binding = bindingIdValid(params.bindingId) ? bindings.find(binding => binding.id === params.bindingId) : undefined;
    if (!binding) return error(404, 'MAILBOX_BINDING_NOT_FOUND', 'Mailbox binding not found for this site.');
    if (!provider.apiToken) return error(503, 'MAILBOX_PROVIDER_NOT_CONFIGURED', 'Configure the server Hostinger Mail API token before reading this mailbox.');
    const config: HostingerMailConfig = { apiToken: provider.apiToken, from: binding.address, mailboxId: binding.mailboxId };
    const scope = { siteId: site.id, bindingId: binding.id };
    if (operation === 'folders') {
      const result = await listHostingerMailFolders(config, options);
      assertInventoryScope(result.pagination, result.data.length, options);
      return respond({ success: true, requestId, data: { schema: 'backy.mailbox-folders.v1', ...scope, folders: result.data, pagination: result.pagination } });
    }
    if (operation === 'messages') {
      const folder = options.folder!;
      const result = await listHostingerMailMessages(config, { ...options, folder });
      assertInventoryScope(result.pagination, result.data.length, options);
      if (result.data.some(message => message.path !== folder)) throw new HostingerMailError('Hostinger Mail returned a message outside the requested folder.', 'invalid-response');
      return respond({ success: true, requestId, data: { schema: 'backy.mailbox-messages.v1', ...scope, folder, messages: result.data, pagination: result.pagination } });
    }
    const uid = positiveInteger(params.uid ?? '', 0);
    const folder = await readBody(request);
    const result = await readHostingerMailMessageText(config, { folder, uid });
    return respond({ success: true, requestId, data: { schema: 'backy.mailbox-read.v1', ...scope, folder, uid, text: result.data.text, readMarksSeen: true } });
  } catch (failure) {
    if (failure instanceof MailboxRequestError) return error(failure.status, failure.code, failure.message);
    if (failure instanceof HostingerMailError) return error(failure.reason === 'not-configured' ? 503 : failure.reason === 'rate-limited' ? 429 : failure.reason === 'invalid-request' ? 400 : 502, 'HOSTINGER_MAIL_PROVIDER_FAILED', failure.message);
    return error(503, 'MAILBOX_WORKSPACE_UNAVAILABLE', 'The mailbox workspace is unavailable. Reload or check the server configuration.');
  }
}
