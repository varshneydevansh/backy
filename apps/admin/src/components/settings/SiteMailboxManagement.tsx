import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Notice } from '@/components/ui/Notice';
import { getAdminApiBase } from '@/lib/adminContentApi';
import { SiteMailboxAccessDenied } from '@/lib/mailboxAttachmentsClient';
type Domain = { id: string; domain: string; dashboardUrl: string; nativeConfigured: boolean; aliasTargets: { id: string; address: string }[] };
type Inspection = { domain: string; plan: string; remainingMailboxes: number; remainingAliases: number; aliasTargets: { id: string; address: string; remainingAliases: number }[]; checkedAt: string };
type Attempt = { id: string; address: string; operation: string; state: string };
const object = (value: unknown): value is Record<string, any> => !!value && typeof value === 'object' && !Array.isArray(value);
const field = 'min-h-11 w-full min-w-0 rounded-lg border border-border bg-background px-3 text-sm';
const safeDashboard = (value: unknown): value is string => { if (typeof value !== 'string') return false; try { const url = new URL(value); return url.origin === 'https://hpanel.hostinger.com' && !url.username && !url.password && !url.search && !url.hash && /^\/emails(?:\/|$)/.test(url.pathname); } catch { return false; } };
export function SiteMailboxManagement({ siteId, onAccessDenied }: { siteId: string; onAccessDenied: (error: SiteMailboxAccessDenied) => void }) {
  const base = `${getAdminApiBase()}/sites/${encodeURIComponent(siteId)}/settings/mailbox-management`;
  const mounted = useRef(true), active = useRef<AbortController | null>(null), sequence = useRef(0), busyRef = useRef(false);
  const [domains, setDomains] = useState<Domain[] | null>(null), [bindingId, setBindingId] = useState(''), [inspection, setInspection] = useState<Inspection | null>(null);
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [notice, setNotice] = useState(''), [history, setHistory] = useState<Attempt[] | null>(null);
  const [localPart, setLocalPart] = useState(''), [password, setPassword] = useState(''), [target, setTarget] = useState(''), [key, setKey] = useState(() => crypto.randomUUID()), [locked, setLocked] = useState(false);
  const selected = domains?.find(row => row.id === bindingId);
  useEffect(() => () => { mounted.current = false; sequence.current++; active.current?.abort(); }, []);
  async function request(url: string, body?: unknown) {
    const controller = new AbortController(); active.current = controller;
    const signal = AbortSignal.any([controller.signal, AbortSignal.timeout(60_000)]);
    const response = await fetch(url, { method: body ? 'POST' : 'GET', ...(body ? { headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) } : {}), credentials: 'include', cache: 'no-store', redirect: 'error', signal });
    if ([401, 403].includes(response.status)) throw new SiteMailboxAccessDenied();
    const payload: unknown = await response.json(); signal.throwIfAborted(); if (!response.ok || !object(payload) || payload.success !== true || !object(payload.data)) throw Error('Management action failed. Check the existing-domain hPanel dashboard and server configuration.'); return payload.data;
  }
  async function run(action: () => Promise<void>) {
    if (busyRef.current) return; const current = sequence.current; busyRef.current = true; setBusy(true); setError('');
    try { await action(); } catch (failure) { if (mounted.current && current === sequence.current) { if (failure instanceof SiteMailboxAccessDenied) onAccessDenied(failure); else setError(failure instanceof Error ? failure.message : 'Management failed. Check hPanel.'); } }
    finally { busyRef.current = false; if (mounted.current && current === sequence.current) setBusy(false); }
  }
  const load = () => run(async () => {
    const current = sequence.current, value = await request(base);
    if (value.schema !== 'backy.mailbox-management.v1' || value.siteId !== siteId || value.provider !== 'hostinger' || typeof value.nativeProvisioning !== 'boolean' || !Array.isArray(value.domains) || value.domains.some((row: unknown) => !object(row) || typeof row.id !== 'string' || typeof row.domain !== 'string' || !safeDashboard(row.dashboardUrl) || typeof row.nativeConfigured !== 'boolean' || !Array.isArray(row.aliasTargets))) throw Error('Management handoff is incompatible. Refresh site settings.');
    if (mounted.current && current === sequence.current) { setDomains(value.domains); setBindingId(value.domains.length === 1 ? value.domains[0].id : ''); }
  });
  const inspect = () => run(async () => {
    const current = sequence.current, value = await request(`${base}/${encodeURIComponent(bindingId)}/inspect`, {});
    if (value.schema !== 'backy.mailbox-management-inspect.v1' || value.siteId !== siteId || value.bindingId !== bindingId || value.domain !== selected?.domain || value.plan !== 'hostinger_free' || value.authorityVerified !== true || value.automaticUpgrade !== false || !Number.isSafeInteger(value.remainingMailboxes) || value.remainingMailboxes < 0 || !Number.isSafeInteger(value.remainingAliases) || value.remainingAliases < 0 || !Array.isArray(value.aliasTargets) || value.aliasTargets.some((row: unknown) => !object(row) || typeof row.id !== 'string' || typeof row.address !== 'string' || !Number.isSafeInteger(row.remainingAliases) || row.remainingAliases < 0) || typeof value.checkedAt !== 'string') throw Error('Current plan and authority could not be verified. Use hPanel before creating.');
    if (mounted.current && current === sequence.current) { setInspection(value as Inspection); setTarget(value.aliasTargets[0]?.id || ''); }
  });
  const create = (operation: 'mailboxes' | 'aliases') => {
    if (locked || !inspection) return;
    if (!/^(?=[a-z0-9])(?=.*[a-z0-9]$)[a-z0-9_-]+(?:\.[a-z0-9_-]+)*$/.test(localPart) || localPart.length > 50 || operation === 'mailboxes' && (!/^[\x21-\x7e]{8,50}$/.test(password) || !/[A-Z]/.test(password) || !/[a-z]/.test(password) || !/[0-9]/.test(password) || !/[^A-Za-z0-9]/.test(password)) || operation === 'aliases' && !target) { setError('Use a valid local part. Mailbox passwords need 8–50 non-space Latin characters with upper/lowercase, a number and a symbol.'); return; }
    const body = { idempotencyKey: key, localPart, ...(operation === 'mailboxes' ? { password } : { targetBindingId: target }) };
    void run(async () => {
      const current = sequence.current; setLocked(true); setPassword(''); setNotice('');
      const value = await request(`${base}/${encodeURIComponent(bindingId)}/${operation}`, body);
      if (value.schema !== 'backy.mailbox-management-create.v1' || value.siteId !== siteId || value.bindingId !== bindingId || !object(value.attempt) || value.attempt.idempotencyKey !== key || !['pending', 'accepted', 'rejected', 'uncertain'].includes(value.attempt.state) || value.attempt.address !== `${localPart}@${selected?.domain}` || value.automaticRetry !== false || value.automaticUpgrade !== false || value.inboxBindingCreated !== false) throw Error('Creation completion is unknown. Check hPanel and operation history before another attempt.');
      if (mounted.current && current === sequence.current) setNotice(value.outcomePersisted && value.attempt.state === 'accepted' ? `${value.attempt.address} was created by Hostinger. New mailbox inbox bindings require separate server registration.` : value.attempt.state === 'rejected' ? 'Creation was rejected. Review current plan, capacity and hPanel before a new action.' : 'Creation completion is unknown. Check hPanel and operation history; this operation will not be retried.');
    });
  };
  const loadHistory = () => run(async () => { const current = sequence.current, value = await request(`${base}/${encodeURIComponent(bindingId)}/attempts`); if (value.schema !== 'backy.mailbox-management-attempts.v1' || value.siteId !== siteId || value.bindingId !== bindingId || !Array.isArray(value.attempts) || value.attempts.length > 20 || value.attempts.some((row: unknown) => !object(row) || typeof row.id !== 'string' || typeof row.address !== 'string' || !['mailbox', 'alias'].includes(row.operation) || !['pending', 'accepted', 'rejected', 'uncertain'].includes(row.state))) throw Error('Management history is incompatible.'); if (mounted.current && current === sequence.current) setHistory(value.attempts); });
  const change = (id: string) => { sequence.current++; active.current?.abort(); busyRef.current = false; setBusy(false); setBindingId(id); setInspection(null); setPassword(''); setLocalPart(''); setTarget(''); setKey(crypto.randomUUID()); setLocked(false); setError(''); setNotice(''); setHistory(null); };
  return <section aria-label="Mailbox and alias management" className="mt-4 border-t border-border pt-4">
    <Button disabled={busy} onClick={() => void load()}>Mailbox and alias setup</Button>
    {domains && <div className="mt-3 grid min-w-0 gap-3">
      <p className="text-sm leading-6 text-muted-foreground">Create mailboxes or aliases on the existing free email plan. Current plan and capacity are checked before each creation. This workspace does not buy seats, upgrade plans or change DNS.</p>
      {!domains.length && <Notice title="Domain management is not connected">Configure an explicit server site/domain binding. Use <a href="https://hpanel.hostinger.com" target="_blank" rel="noopener noreferrer" className="underline">Hostinger hPanel</a> to select the existing email domain.</Notice>}
      {!!domains.length && <label className="grid gap-1 text-sm font-medium">Email domain<select aria-label="Management email domain" className={field} value={bindingId} disabled={busy} onChange={event => change(event.target.value)}><option value="">Choose the existing domain</option>{domains.map(row => <option key={row.id} value={row.id}>{row.domain}</option>)}</select></label>}
      {selected && <><a href={selected.dashboardUrl} target="_blank" rel="noopener noreferrer" className="min-h-11 w-fit py-2 text-sm underline">Open this email domain in Hostinger</a>
        {!selected.nativeConfigured ? <Notice title="Native management needs separate account authority">The existing Mail API token reads and sends mail. Server-side mailbox creation needs a separate hPanel account API token and the exact existing mail order/domain binding. The provider dashboard remains available.</Notice> : <>
          <div className="flex flex-wrap gap-2"><Button disabled={busy || locked} onClick={() => void inspect()}>Check current free plan and capacity</Button><Button disabled={busy} onClick={() => void loadHistory()}>Check management history</Button>{locked && <Button disabled={busy} onClick={() => change(bindingId)}>Start a new management action</Button>}</div>
          {inspection && <><p className="text-sm">{inspection.remainingMailboxes} mailbox seats and {inspection.remainingAliases} aliases available · checked {inspection.checkedAt}</p><label className="grid gap-1 text-sm font-medium">New local part<input aria-label="New mailbox or alias local part" className={field} disabled={busy || locked} value={localPart} onChange={event => setLocalPart(event.target.value)} placeholder="name before @" /></label><div className="grid gap-4 sm:grid-cols-2"><div className="grid content-start gap-2"><label className="grid gap-1 text-sm font-medium">New mailbox password<input aria-label="New mailbox password" type="password" autoComplete="new-password" className={field} disabled={busy || locked || inspection.remainingMailboxes < 1} value={password} onChange={event => setPassword(event.target.value)} /></label><Button disabled={busy || locked || inspection.remainingMailboxes < 1} onClick={() => create('mailboxes')}>Create mailbox on existing plan</Button></div><div className="grid content-start gap-2"><label className="grid gap-1 text-sm font-medium">Alias target<select aria-label="Alias target mailbox" className={field} disabled={busy || locked || inspection.remainingAliases < 1} value={target} onChange={event => setTarget(event.target.value)}><option value="">Choose a registered mailbox</option>{inspection.aliasTargets.map(row => <option key={row.id} value={row.id} disabled={row.remainingAliases < 1}>{row.address} · {row.remainingAliases} aliases available</option>)}</select></label><Button disabled={busy || locked || inspection.remainingAliases < 1 || !target} onClick={() => create('aliases')}>Create alias on existing plan</Button></div></div></>}
        </>}
      </>}
    </div>}
    {error && <Notice className="mt-3" tone="error" role="alert">{error}</Notice>}{notice && <p className="mt-3 text-sm" role="status">{notice}</p>}
    {history && <ul aria-label="Management history" className="mt-3 divide-y divide-border">{history.map(row => <li key={row.id} className="py-2 text-sm">{row.address} · {row.operation} · {row.state}</li>)}</ul>}
  </section>;
}
