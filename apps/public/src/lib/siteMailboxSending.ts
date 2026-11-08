/** Owner-only outgoing messages and header-linked inventory. No background retries or provider provisioning. */
import { createHash } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { BackyMailboxSendError, type BackyMailboxSendAttempt } from '@backy-cms/core';
import { adminAccessError, isOwnerAdminSession, requireAdminAccess } from './adminAccess';
import { getSiteByIdOrSlug } from './backyStore';
import { getRequiredDatabaseRepositories, shouldUseDemoStoreFallback } from './repositoryRuntime';
import { getSiteMailboxBindings } from './siteMailboxes';
import { demoMailboxSendJournal } from './demoMailboxSendJournal';
import { getHostingerMailConfig, HostingerMailError, listHostingerMailThread, normalizeHostingerMailOutgoingMessage, sendHostingerMailMessage, type HostingerMailOutgoingMessage } from './hostingerMail';
const invalid = (message = 'Use only supported mailbox send or thread fields.'): never => { throw new BackyMailboxSendError('MAILBOX_REQUEST_INVALID', 400, message); };
const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
const folderValue = (value: unknown): string => typeof value === 'string' && Boolean(value) && value.length <= 1024 && !/[\p{Cc}\p{Cs}]/u.test(value) && !['.', '..'].includes(value) ? value : invalid();
const positive = (value: string | null, fallback: number, maximum = Number.MAX_SAFE_INTEGER): number => value === null ? fallback : /^[1-9]\d*$/.test(value) && Number.isSafeInteger(Number(value)) && Number(value) <= maximum ? Number(value) : invalid();
const projectAttempt = ({ id, state, statusCode, createdAt, updatedAt, idempotencyKey }: BackyMailboxSendAttempt) => ({ id, state, statusCode, createdAt, updatedAt, idempotencyKey });
/** Reject duplicate JSON members, including escaped names, at every object level. */
function uniqueJson(raw: string): unknown {
  let index = 0;
  const ws = () => { while (/\s/u.test(raw[index] || '') && index < raw.length) index++; };
  const string = (): string => { const start = index++; while (index < raw.length) { if (raw[index++] === '"') return JSON.parse(raw.slice(start, index)); if (raw[index - 1] === '\\') index++; } return invalid(); };
  const value = (): void => {
    ws(); if (raw[index] === '"') { string(); return; }
    if (raw[index] === '{') {
      index++; ws(); const keys = new Set<string>(); if (raw[index] === '}') { index++; return; }
      while (true) { ws(); if (raw[index] !== '"') return invalid(); const key = string(); if (keys.has(key)) return invalid('Duplicate mailbox request fields are not allowed.'); keys.add(key); ws(); if (raw[index++] !== ':') return invalid(); value(); ws(); if (raw[index] === '}') { index++; return; } if (raw[index++] !== ',') return invalid(); }
    }
    if (raw[index] === '[') { index++; ws(); if (raw[index] === ']') { index++; return; } while (true) { value(); ws(); if (raw[index] === ']') { index++; return; } if (raw[index++] !== ',') return invalid(); } }
    const match = /^(?:true|false|null|-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?)/.exec(raw.slice(index)); if (!match) return invalid(); index += match[0].length;
  };
  value(); ws(); if (index !== raw.length) return invalid(); return JSON.parse(raw);
}
async function sendBody(request: NextRequest): Promise<{ key: string; message: Omit<HostingerMailOutgoingMessage, 'from'> }> {
  const maximum = 4_400_000, length = request.headers.get('content-length');
  if (!request.body || request.headers.get('content-type')?.split(';')[0].trim().toLowerCase() !== 'application/json'
    || length !== null && (!/^\d+$/.test(length) || Number(length) > maximum)) return invalid('Send requires bounded UTF-8 JSON.');
  const reader = request.body.getReader(), chunks: Uint8Array[] = []; let bytes = 0, timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([(async () => { while (true) { const { done, value } = await reader.read(); if (done) break; bytes += value.byteLength; if (bytes > maximum) return invalid('Mailbox send exceeds the 4.4 MB request bound.'); chunks.push(value); } })(), new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new BackyMailboxSendError('MAILBOX_REQUEST_INVALID', 400, 'Mailbox send request timed out.')), 10_000); })]);
    let input: unknown; try { input = uniqueJson(new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks))); } catch (error) { if (error instanceof BackyMailboxSendError) throw error; return invalid('Send requires valid UTF-8 JSON.'); }
    if (!object(input) || Object.keys(input).some(key => !['idempotencyKey', 'to', 'cc', 'bcc', 'subject', 'text', 'attachments', 'inReplyTo'].includes(key))
      || typeof input.idempotencyKey !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9_-]{15,127}$/.test(input.idempotencyKey)
      || !Array.isArray(input.to) || input.cc !== undefined && !Array.isArray(input.cc) || input.bcc !== undefined && !Array.isArray(input.bcc)
      || input.inReplyTo !== undefined && (!object(input.inReplyTo) || Object.keys(input.inReplyTo).length !== 2 || !Object.hasOwn(input.inReplyTo, 'uid') || !Object.hasOwn(input.inReplyTo, 'folder'))) return invalid();
    if (input.inReplyTo) folderValue((input.inReplyTo as Record<string, unknown>).folder);
    const { idempotencyKey, ...message } = input;
    normalizeHostingerMailOutgoingMessage({ ...message, from: 'validated@example.test' } as unknown as HostingerMailOutgoingMessage);
    return { key: idempotencyKey, message: message as unknown as Omit<HostingerMailOutgoingMessage, 'from'> };
  } finally { clearTimeout(timer); void reader.cancel().catch(() => {}); }
}
export type MailboxSendingParams = { siteId: string; bindingId: string; uid?: string };
export async function siteMailboxSendingRoute(request: NextRequest, context: { params: Promise<MailboxSendingParams> }, operation: 'send' | 'thread' | 'send-attempts') {
  const requestId = `mail_action_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  const respond = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' } });
  const error = (status: number, code: string, message: string) => respond({ success: false, requestId, error: { code, message } }, status);
  try {
    if (['authorization', 'x-backy-admin-session', 'x-backy-admin-key', 'x-api-key'].some(header => request.headers.has(header))) return adminAccessError(403, 'OWNER_SESSION_REQUIRED', 'Mailbox access requires an owner cookie session without explicit credential headers.', requestId);
    if (!request.cookies.get('backy_admin_session')?.value?.trim()) return adminAccessError(401, 'UNAUTHORIZED', 'A current owner cookie session is required for mailbox access.', requestId);
    const access = await requireAdminAccess(request, requestId, { permissions: operation === 'send' ? ['sites.view', 'settings.view', 'settings.configure'] : ['sites.view', 'settings.view'], recordUsage: false });
    if (access instanceof NextResponse) return access;
    if (!isOwnerAdminSession(access)) return adminAccessError(403, 'OWNER_SESSION_REQUIRED', 'Mailbox access requires an active owner admin session.', requestId);
    if (request.method !== (operation === 'send' ? 'POST' : 'GET')) return error(405, 'MAILBOX_METHOD_NOT_ALLOWED', 'Use the explicit mailbox operation method.');
    const query = new URL(request.url).searchParams, allowed = operation === 'send' ? [] : operation === 'thread' ? ['folder', 'page', 'perPage'] : ['page', 'perPage'];
    if ([...query.keys()].some(key => !allowed.includes(key) || query.getAll(key).length !== 1)) return invalid();
    const params = await context.params;
    const repositories = shouldUseDemoStoreFallback() ? null : await getRequiredDatabaseRepositories();
    const site = repositories ? await repositories.sites.getById(params.siteId) || await repositories.sites.getBySlug(params.siteId) : getSiteByIdOrSlug(params.siteId);
    if (!site) return error(404, 'SITE_NOT_FOUND', 'Site not found.');
    const binding = getSiteMailboxBindings().find(row => row.siteId === site.id && row.id === params.bindingId);
    if (!binding) return error(404, 'MAILBOX_BINDING_NOT_FOUND', 'Mailbox binding not found for this site.');
    const scope = { siteId: site.id, bindingId: binding.id }, page = positive(query.get('page'), 1), perPage = positive(query.get('perPage'), 20, 100);
    const journal = repositories ? repositories.mailboxSends : demoMailboxSendJournal;
    if (operation === 'send-attempts') {
      if (!journal) throw new BackyMailboxSendError('MAILBOX_SEND_JOURNAL_UNAVAILABLE', 503, 'Durable mailbox send history is unavailable.');
      const result = await journal.list({ ...scope, limit: perPage, offset: (page - 1) * perPage });
      return respond({ success: true, requestId, data: { schema: 'backy.mailbox-send-attempts.v1', ...scope, attempts: result.items.map(projectAttempt), pagination: { page, perPage, total: result.total, totalPages: Math.ceil(result.total / perPage) } } });
    }
    const provider = getHostingerMailConfig(); if (!provider.apiToken) return error(503, 'MAILBOX_PROVIDER_NOT_CONFIGURED', 'Configure the server Hostinger Mail API token before using this mailbox.');
    const config = { apiToken: provider.apiToken, from: binding.address, mailboxId: binding.mailboxId };
    if (operation === 'thread') {
      const folder = folderValue(query.get('folder')), uid = positive(params.uid ?? '', 0);
      const result = await listHostingerMailThread(config, { folder, uid, page, perPage });
      return respond({ success: true, requestId, data: { schema: 'backy.mailbox-thread.v1', ...scope, folder, uid, source: result.source, messages: result.data, searchPagination: result.pagination, relationship: result.relationship, sourceHasThreadHeaders: result.sourceHasThreadHeaders, folderScope: 'selected-folder', textMarksSeen: false } });
    }
    const input = await sendBody(request), message = { ...input.message, from: binding.address };
    const outgoing = normalizeHostingerMailOutgoingMessage(message);
    if (!journal) throw new BackyMailboxSendError('MAILBOX_SEND_JOURNAL_UNAVAILABLE', 503, 'Durable mailbox send admission is unavailable. No provider request was made.');
    const fingerprint = createHash('sha256').update(JSON.stringify({ mailboxId: binding.mailboxId, from: binding.address, ...outgoing })).digest('hex');
    const admission = await journal.admit({ ...scope, idempotencyKey: input.key, fingerprint });
    let attempt = admission.attempt, outcomePersisted = true;
    if (admission.admitted) {
      let state: 'accepted' | 'rejected' | 'uncertain' = 'uncertain', statusCode: number | undefined;
      try { const result = await sendHostingerMailMessage(config, message); state = 'accepted'; statusCode = result.statusCode; }
      catch (failure) { if (failure instanceof HostingerMailError) { statusCode = failure.statusCode; if (statusCode && [400, 401, 403, 404, 422, 429].includes(statusCode)) state = 'rejected'; } }
      try { attempt = await journal.settle(site.id, binding.id, attempt.id, { state, statusCode }); } catch { outcomePersisted = false; }
    }
    return respond({ success: true, requestId, data: { schema: 'backy.mailbox-send.v1', ...scope, attempt: projectAttempt(attempt), replayed: !admission.admitted, outcomePersisted, providerAccepted: outcomePersisted && attempt.state === 'accepted', deliveryVerified: false, automaticRetry: false } });
  } catch (failure) {
    if (failure instanceof BackyMailboxSendError) return error(failure.status, failure.code, failure.message);
    if (failure instanceof HostingerMailError) return error(failure.reason === 'rate-limited' ? 429 : failure.reason === 'invalid-request' ? 400 : 502, 'HOSTINGER_MAIL_PROVIDER_FAILED', failure.message);
    return error(503, 'MAILBOX_WORKSPACE_UNAVAILABLE', 'The mailbox operation is unavailable. Check server configuration and refresh the workspace.');
  }
}
