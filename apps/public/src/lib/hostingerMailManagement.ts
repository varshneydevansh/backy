/** Account-level Hostinger mail management. Separate from the mailbox-scoped Mail API. */
export const HOSTINGER_MAIL_MANAGEMENT_ORIGIN = 'https://developers.hostinger.com';
export class HostingerMailManagementError extends Error {
  constructor(public code: string, public status: number, message: string, public providerStatus?: number, public uncertain = false) { super(message); }
}
export interface HostingerMailManagementConfig { apiToken: string; orderId: string; domain: string }
export interface HostingerManagementMailbox { id: string; address: string; status: string }
export interface HostingerManagementSnapshot { plan: string; remainingMailboxes: number; remainingAliases: number; aliasQuotaPerMailbox: number; mailboxes: HostingerManagementMailbox[]; aliases: { address: string; mailboxId: string }[] }
const object = (value: unknown): value is Record<string, any> => !!value && typeof value === 'object' && !Array.isArray(value);
const count = (value: unknown): value is number => Number.isSafeInteger(value) && Number(value) >= 0;
const invalid = (): never => { throw new HostingerMailManagementError('HOSTINGER_MANAGEMENT_RESPONSE_INVALID', 502, 'Hostinger returned an unverifiable management response.'); };
export const validHostingerManagementLocalPart = (value: unknown): value is string => typeof value === 'string' && value.length <= 50 && /^(?=[a-z0-9])(?=.*[a-z0-9]$)[a-z0-9_-]+(?:\.[a-z0-9_-]+)*$/.test(value);
export const validHostingerManagementPassword = (value: unknown): value is string => typeof value === 'string' && value.length >= 8 && value.length <= 50 && /^[\x21-\x7e]+$/.test(value) && /[A-Z]/.test(value) && /[a-z]/.test(value) && /[0-9]/.test(value) && /[^A-Za-z0-9]/.test(value);
async function request(config: HostingerMailManagementConfig, path: string, fetchManagement: typeof fetch, body?: unknown) {
  let response: Response;
  try { response = await fetchManagement(HOSTINGER_MAIL_MANAGEMENT_ORIGIN + path, { method: body ? 'POST' : 'GET', ...(body ? { body: JSON.stringify(body) } : {}), headers: { Authorization: `Bearer ${config.apiToken}`, Accept: 'application/json', 'Content-Type': 'application/json' }, redirect: 'error', cache: 'no-store', signal: AbortSignal.timeout(10_000) }); }
  catch { throw new HostingerMailManagementError('HOSTINGER_MANAGEMENT_UNAVAILABLE', 502, 'Hostinger management completion could not be verified.', undefined, Boolean(body)); }
  if (!response.ok) throw new HostingerMailManagementError('HOSTINGER_MANAGEMENT_REQUEST_REJECTED', response.status === 429 ? 429 : 502, 'Hostinger rejected the management request.', response.status, Boolean(body && response.status >= 500));
  if (response.status !== (body ? 201 : 200)) throw new HostingerMailManagementError('HOSTINGER_MANAGEMENT_RESPONSE_INVALID', 502, 'Hostinger returned an unexpected management status.', response.status, Boolean(body));
  const length = response.headers.get('content-length');
  if (!response.body || length !== null && (!/^\d+$/.test(length) || Number(length) > 1024 * 1024)) { void response.body?.cancel().catch(() => {}); throw new HostingerMailManagementError('HOSTINGER_MANAGEMENT_RESPONSE_INVALID', 502, 'Hostinger returned an oversized management response.', response.status, Boolean(body)); }
  const reader = response.body.getReader(), chunks: Uint8Array[] = []; let bytes = 0, timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([(async () => { while (true) { const { value, done } = await reader.read(); if (done) break; bytes += value.byteLength; if (bytes > 1024 * 1024) throw Error(); chunks.push(value); } })(), new Promise<never>((_, reject) => { timer = setTimeout(() => reject(Error()), 10_000); })]);
    const payload: unknown = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks))); if (!object(payload)) throw Error(); return payload;
  } catch { throw new HostingerMailManagementError('HOSTINGER_MANAGEMENT_RESPONSE_INVALID', 502, 'Hostinger management completion could not be verified.', response.status, Boolean(body)); }
  finally { clearTimeout(timer); void reader.cancel().catch(() => {}); }
}
function collection(payload: Record<string, any>): any[] {
  if (!Array.isArray(payload.data) || !object(payload.meta) || payload.meta.current_page !== 1 || payload.meta.per_page !== 100 || !count(payload.meta.total) || payload.meta.total > 100 || payload.data.length !== payload.meta.total) return invalid(); return payload.data;
}
/** Read all bounded current-order resources before any create; no plan/order purchases exist in this adapter. */
export async function inspectHostingerMailManagement(config: HostingerMailManagementConfig, fetchManagement: typeof fetch = fetch): Promise<HostingerManagementSnapshot> {
  if (!config.apiToken) throw new HostingerMailManagementError('HOSTINGER_MANAGEMENT_NOT_CONFIGURED', 503, 'Configure the separate server hPanel account API token.');
  const orders = collection(await request(config, `/api/mail/v1/orders?${new URLSearchParams({ domain: config.domain, page: '1', per_page: '100' })}`, fetchManagement));
  const matches = orders.filter(row => object(row) && row.id === config.orderId && object(row.domain) && row.domain.name === config.domain);
  if (matches.length !== 1) throw new HostingerMailManagementError('HOSTINGER_MANAGEMENT_SCOPE_DENIED', 502, 'The configured account token cannot verify this exact order and domain.');
  const order = matches[0];
  if (order.status !== 'active' || order.is_trial !== false || order.has_pending_upgrade !== false || !count(order.seats) || !object(order.plan) || order.plan.name !== 'hostinger_free') throw new HostingerMailManagementError('HOSTINGER_MANAGEMENT_PLAN_NOT_ELIGIBLE', 409, 'An active existing Hostinger free plan without a trial or pending upgrade is required. No plan changes were made.');
  const rawPlan = await request(config, `/api/mail/v1/orders/${encodeURIComponent(config.orderId)}/plan`, fetchManagement);
  // The official PlanResource is the top-level response (not a guessed data envelope).
  if (rawPlan.name !== 'hostinger_free' || !object(rawPlan.domain) || !object(rawPlan.mailbox) || !count(rawPlan.domain.mailbox_quota) || !count(rawPlan.domain.alias_quota) || !count(rawPlan.mailbox.alias_quota)) return invalid();
  const rawMailboxes = collection(await request(config, `/api/mail/v1/orders/${encodeURIComponent(config.orderId)}/mailboxes?page=1&per_page=100`, fetchManagement));
  const seen = new Set<string>();
  const mailboxes = rawMailboxes.map(row => {
    if (!object(row) || typeof row.id !== 'string' || !row.id || row.id.length > 200 || typeof row.address !== 'string' || !row.address.endsWith('@' + config.domain) || !validHostingerManagementLocalPart(row.address.slice(0, -(config.domain.length + 1))) || !['active', 'suspended'].includes(row.status) || seen.has(row.id)) return invalid();
    seen.add(row.id); return { id: row.id, address: row.address, status: row.status };
  });
  const rawAliases = collection(await request(config, `/api/mail/v1/orders/${encodeURIComponent(config.orderId)}/aliases?page=1&per_page=100`, fetchManagement));
  const aliases = rawAliases.map(row => {
    if (!object(row) || typeof row.address !== 'string' || !row.address.endsWith('@' + config.domain) || !object(row.mailbox) || typeof row.mailbox.id !== 'string' || !mailboxes.some(box => box.id === row.mailbox.id && box.address === row.mailbox.address)) return invalid();
    return { address: row.address, mailboxId: row.mailbox.id };
  });
  if (new Set([...mailboxes, ...aliases].map(row => row.address)).size !== mailboxes.length + aliases.length) return invalid();
  return { plan: rawPlan.name, remainingMailboxes: Math.max(0, Math.min(order.seats, rawPlan.domain.mailbox_quota) - mailboxes.length), remainingAliases: Math.max(0, rawPlan.domain.alias_quota - aliases.length), aliasQuotaPerMailbox: rawPlan.mailbox.alias_quota, mailboxes, aliases };
}
export async function createHostingerManagedMailbox(config: HostingerMailManagementConfig, input: { localPart: string; password: string }, snapshot: HostingerManagementSnapshot, fetchManagement: typeof fetch = fetch) {
  if (!validHostingerManagementLocalPart(input.localPart) || !validHostingerManagementPassword(input.password)) throw new HostingerMailManagementError('MAILBOX_MANAGEMENT_REQUEST_INVALID', 400, 'Use a documented local part and a valid 8–50 character mailbox password.');
  if (snapshot.remainingMailboxes < 1) throw new HostingerMailManagementError('MAILBOX_MANAGEMENT_CAPACITY_EXHAUSTED', 409, 'The existing free plan has no remaining mailbox seats. No upgrade or purchase was made.');
  const address = `${input.localPart}@${config.domain}`;
  if ([...snapshot.mailboxes, ...snapshot.aliases].some(row => row.address === address)) throw new HostingerMailManagementError('MAILBOX_MANAGEMENT_ADDRESS_EXISTS', 409, 'The requested address already exists.');
  const result = await request(config, `/api/mail/v1/orders/${encodeURIComponent(config.orderId)}/mailboxes`, fetchManagement, { local_part: input.localPart, password: input.password });
  if (typeof result.id !== 'string' || !result.id || result.address !== address || result.status !== 'active') throw new HostingerMailManagementError('HOSTINGER_MANAGEMENT_RESPONSE_INVALID', 502, 'Mailbox creation completion is unverified. Check hPanel before another attempt.', 201, true);
  return { address, resourceId: result.id };
}
export async function createHostingerManagedAlias(config: HostingerMailManagementConfig, input: { localPart: string; mailboxId: string; address: string }, snapshot: HostingerManagementSnapshot, fetchManagement: typeof fetch = fetch) {
  if (!validHostingerManagementLocalPart(input.localPart)) throw new HostingerMailManagementError('MAILBOX_MANAGEMENT_REQUEST_INVALID', 400, 'Use a valid alias local part.');
  const target = snapshot.mailboxes.find(row => row.id === input.mailboxId && row.address === input.address && row.status === 'active');
  if (!target) throw new HostingerMailManagementError('HOSTINGER_MANAGEMENT_SCOPE_DENIED', 502, 'The alias target is not an active mailbox in this exact bound order and domain.');
  if (snapshot.remainingAliases < 1 || snapshot.aliases.filter(row => row.mailboxId === target.id).length >= snapshot.aliasQuotaPerMailbox) throw new HostingerMailManagementError('MAILBOX_MANAGEMENT_CAPACITY_EXHAUSTED', 409, 'The existing plan has no remaining alias capacity. No plan changes were made.');
  const address = `${input.localPart}@${config.domain}`;
  if ([...snapshot.mailboxes, ...snapshot.aliases].some(row => row.address === address)) throw new HostingerMailManagementError('MAILBOX_MANAGEMENT_ADDRESS_EXISTS', 409, 'The requested address already exists.');
  const result = await request(config, `/api/mail/v1/mailboxes/${encodeURIComponent(target.id)}/aliases`, fetchManagement, { local_part: input.localPart });
  if (typeof result.id !== 'string' || !result.id || result.address !== address || !object(result.mailbox) || result.mailbox.id !== target.id || result.mailbox.address !== target.address || result.is_active !== true) throw new HostingerMailManagementError('HOSTINGER_MANAGEMENT_RESPONSE_INVALID', 502, 'Alias creation completion is unverified. Check hPanel before another attempt.', 201, true);
  return { address, resourceId: result.id };
}
