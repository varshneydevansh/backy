import { getSiteByIdOrSlug } from './backyStore';
import { randomUUID } from 'node:crypto';
import { closeSync, existsSync, fsyncSync, mkdirSync, openSync, readFileSync, renameSync, statSync, unlinkSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { assertMailboxSendAdmission, BackyMailboxSendError, type BackyMailboxSendAttempt, type BackyMailboxSendRepository } from '@backy-cms/core';
const path = () => join(process.cwd(), 'data/backy/private-mailbox-sends/attempts.json');
const unavailable = () => new BackyMailboxSendError('MAILBOX_SEND_JOURNAL_UNAVAILABLE', 503, 'Durable mailbox send admission is unavailable.');
function read(): BackyMailboxSendAttempt[] {
  try {
    if (!existsSync(path())) return [];
    if (statSync(path()).size > 10_000_000) throw unavailable();
    const rows = JSON.parse(readFileSync(path(), 'utf8')); if (!Array.isArray(rows)) throw unavailable();
    const keys = new Set<string>();
    for (const row of rows) {
      assertMailboxSendAdmission(row);
      const key = JSON.stringify([row.siteId, row.bindingId, row.idempotencyKey]);
      if (keys.has(key) || !/^[a-f0-9-]{36}$/.test(row.id) || !['pending', 'accepted', 'rejected', 'uncertain'].includes(row.state)
        || !Number.isFinite(Date.parse(row.createdAt)) || !Number.isFinite(Date.parse(row.updatedAt)) || !(row.statusCode === null || Number.isInteger(row.statusCode) && row.statusCode >= 100 && row.statusCode <= 599)) throw unavailable();
      keys.add(key);
    }
    return rows;
  } catch { throw unavailable(); }
}
function mutate<T>(operation: (rows: BackyMailboxSendAttempt[]) => T): T {
  const file = path(), directory = dirname(file), lock = file + '.lock', temp = file + '.' + randomUUID() + '.tmp';
  mkdirSync(directory, { recursive: true, mode: 0o700 }); let fd: number;
  try { fd = openSync(lock, 'wx', 0o600); } catch { throw unavailable(); }
  try {
    const rows = read(), result = operation(rows), data = JSON.stringify(rows);
    if (Buffer.byteLength(data) > 10_000_000) throw unavailable();
    const output = openSync(temp, 'wx', 0o600); try { writeFileSync(output, data); fsyncSync(output); } finally { closeSync(output); }
    renameSync(temp, file); const parent = openSync(directory, 'r'); try { fsyncSync(parent); } finally { closeSync(parent); }
    return structuredClone(result);
  } finally { closeSync(fd); unlinkSync(lock); try { unlinkSync(temp); } catch {} }
}
export const demoMailboxSendJournal: BackyMailboxSendRepository = {
  async admit(input) {
    assertMailboxSendAdmission(input);
    return mutate(rows => {
      const site = getSiteByIdOrSlug(input.siteId);
      if (!site || site.id !== input.siteId) throw new BackyMailboxSendError('SITE_NOT_FOUND', 404, 'Site not found before durable mailbox admission.');
      const existing = rows.find(row => row.siteId === input.siteId && row.bindingId === input.bindingId && row.idempotencyKey === input.idempotencyKey);
      if (existing) {
        if (existing.fingerprint !== input.fingerprint) throw new BackyMailboxSendError('MAILBOX_SEND_IDEMPOTENCY_CONFLICT', 409, 'This send identity already belongs to a different message.');
        return { attempt: existing, admitted: false };
      }
      const now = new Date().toISOString(), attempt: BackyMailboxSendAttempt = { ...input, id: randomUUID(), state: 'pending', statusCode: null, createdAt: now, updatedAt: now };
      rows.push(attempt); return { attempt, admitted: true };
    });
  },
  async settle(siteId, bindingId, id, input) {
    return mutate(rows => {
      const row = rows.find(row => row.siteId === siteId && row.bindingId === bindingId && row.id === id);
      if (!row || row.state !== 'pending' || !['accepted', 'rejected', 'uncertain'].includes(input.state)) throw unavailable();
      Object.assign(row, { state: input.state, statusCode: input.statusCode ?? null, updatedAt: new Date().toISOString() }); return row;
    });
  },
  async list(input) {
    const rows = read().filter(row => row.siteId === input.siteId && (!input.bindingId || row.bindingId === input.bindingId)).sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id));
    const limit = Math.max(1, Math.min(100, Math.floor(input.limit))), offset = Math.max(0, Math.floor(input.offset));
    return { items: structuredClone(rows.slice(offset, offset + limit)), total: rows.length };
  },
};
/** Preserve durable duplicate evidence when deleting a site. */
export function assertNoDemoMailboxSendEvidence(siteId: string): void {
  if (read().some(row => row.siteId === siteId)) throw new BackyMailboxSendError('SITE_MAILBOX_SEND_EVIDENCE_REMAINS', 409, 'This site retains mailbox send attempts. Deletion is unavailable while duplicate-protection evidence remains.');
}
