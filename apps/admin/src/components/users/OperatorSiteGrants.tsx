import { useCallback, useEffect, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { ADMIN_SITE_SERVICE_PERMISSIONS, getUserSiteGrants, listSites, updateUserSiteGrants, type AdminOperatorSiteAccess, type AdminOperatorSiteScope } from '@/lib/adminContentApi';

export function OperatorSiteGrants({ userId, ownerCanManage, targetIsOwner }: { userId: string; ownerCanManage: boolean; targetIsOwner: boolean }) {
  const [saved, setSaved] = useState<AdminOperatorSiteAccess | null>(null);
  const [sites, setSites] = useState<Array<{ id: string; name: string }>>([]);
  const [mode, setMode] = useState<AdminOperatorSiteScope['mode']>('selected-sites');
  const [grants, setGrants] = useState<AdminOperatorSiteScope['grants']>([]);
  const [expiresAt, setExpiresAt] = useState('');
  const [confirmWorkspace, setConfirmWorkspace] = useState(false);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const apply = (value: AdminOperatorSiteAccess) => {
    setSaved(value); setMode(value.scope?.mode || 'selected-sites'); setGrants(value.scope?.grants || []);
    setExpiresAt(value.scope?.expiresAt || ''); setConfirmWorkspace(false);
  };
  const reload = useCallback(async () => {
    if (!ownerCanManage || targetIsOwner) { setLoading(false); return; }
    setLoading(true); setError(null);
    try {
      const [access, inventory] = await Promise.all([getUserSiteGrants(userId), listSites()]);
      apply(access); setSites(inventory);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Unable to load operator site access.'); }
    finally { setLoading(false); }
  }, [userId, ownerCanManage, targetIsOwner]);
  useEffect(() => { void reload(); }, [reload]);
  const save = async (revoke = false) => {
    if (!saved || busy || loading) return;
    setBusy(true); setError(null); setNotice(null);
    try {
      const expiry = expiresAt.trim() ? new Date(expiresAt).toISOString() : null;
      if (expiry && Date.parse(expiry) <= Date.now()) throw new Error('Expiry must be in the future.');
      const next: AdminOperatorSiteScope = { version: 1, revision: saved.revision + 1, mode: revoke ? 'selected-sites' : mode, grants: revoke || mode === 'workspace' ? [] : grants, expiresAt: revoke ? null : expiry };
      const outcome = await updateUserSiteGrants(userId, next, saved.revision, confirmWorkspace);
      apply(outcome);
      const message = revoke ? 'Site access revoked. Current sessions are restricted on their next request.' : 'Site access saved. Current sessions use this policy on their next request.';
      setNotice(`${message}${outcome.completionWarnings?.length ? ' Saved successfully; audit recording needs attention. Do not repeat the change.' : ''}`);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Unable to save operator site access.'); }
    finally { setBusy(false); }
  };
  return <section id="user-detail-site-access" className="rounded-lg border border-border bg-card p-5 scroll-mt-24" aria-label="Operator site access">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div><h2 className="text-base font-semibold">Operator site access</h2><p className="mt-1 text-sm text-muted-foreground">Owners select sites and module permissions. Existing role and team limits still apply.</p></div>
      {ownerCanManage && !targetIsOwner && <Button type="button" variant="outline" onClick={() => void reload()} disabled={busy || loading}>Reload policy</Button>}
    </div>
    {targetIsOwner ? <p className="mt-4 text-sm">Owners retain workspace access. Operator site restrictions cannot be assigned to an owner.</p>
      : !ownerCanManage ? <p className="mt-4 text-sm text-muted-foreground">An active owner session is required to view or change operator site grants.</p>
      : <>
        <div role="status" aria-live="polite" className="mt-4 text-sm">{loading ? 'Loading site policy…' : saved ? `Saved status: ${saved.status.replace(/-/g, ' ')} · Revision ${saved.revision}` : 'Site policy unavailable'}</div>
        {saved?.status === 'legacy-workspace' && <p className="mt-2 text-sm text-amber-800">No site policy was previously assigned. This operator retains historical workspace access until an owner saves a restriction.</p>}
        {error && <p role="alert" className="mt-3 text-sm text-destructive">{error}</p>}
        {notice && <p role="status" className="mt-3 text-sm text-primary">{notice}</p>}
        <fieldset disabled={busy || loading || !saved} className="mt-4 space-y-4 disabled:opacity-60">
          <label className="block text-sm font-medium">Access scope<select value={mode} onChange={event => { setMode(event.target.value as AdminOperatorSiteScope['mode']); setConfirmWorkspace(false); }} className="mt-2 min-h-11 w-full rounded border border-border bg-background px-3"><option value="selected-sites">Selected sites and module permissions</option><option value="workspace">Workspace access through existing role permissions</option></select></label>
          {mode === 'workspace' ? <label className="flex min-h-11 items-center gap-3 text-sm"><input type="checkbox" checked={confirmWorkspace} onChange={event => setConfirmWorkspace(event.target.checked)} />I deliberately grant workspace access through this operator’s role and overrides.</label>
            : <>
              <label className="block text-sm font-medium">Find a site<input type="search" value={search} onChange={event => setSearch(event.target.value)} className="mt-2 min-h-11 w-full rounded border border-border bg-background px-3" placeholder="Name or canonical site ID" /></label>
              <p className="text-xs text-muted-foreground">Choose permissions separately for each site. Saving no site permissions blocks all site access. Global administration and unclassified routes are blocked for selected-site operators.</p>
              {sites.length === 0 && <p className="text-sm text-muted-foreground">No sites are available. Create a site before assigning access, or save an empty restriction.</p>}
              <div className="max-h-96 overflow-y-auto divide-y divide-border border-y border-border">
                {sites.filter(site => `${site.name} ${site.id}`.toLowerCase().includes(search.toLowerCase())).map(site => {
                  const grant = grants.find(grant => grant.siteId === site.id);
                  return <div key={site.id} className="py-2">
                    <label className="flex min-h-11 items-center gap-3 text-sm"><input type="checkbox" checked={Boolean(grant)} onChange={event => setGrants(previous => event.target.checked ? [...previous, { siteId: site.id, permissions: [] }] : previous.filter(grant => grant.siteId !== site.id))} /><span className="min-w-0"><span className="font-medium">{site.name}</span><span className="block break-all text-xs text-muted-foreground">{site.id}</span></span></label>
                    {grant && <details open className="pl-6"><summary className="min-h-11 cursor-pointer py-3 text-xs font-medium">Module permissions · {grant.permissions.length} selected</summary><div className="grid gap-x-4 sm:grid-cols-2">{ADMIN_SITE_SERVICE_PERMISSIONS.map(permission => <label key={permission} className="flex min-h-11 items-center gap-2 text-xs"><input type="checkbox" checked={grant.permissions.includes(permission)} onChange={event => setGrants(previous => previous.map(item => item.siteId !== site.id ? item : { ...item, permissions: event.target.checked ? [...item.permissions, permission] : item.permissions.filter(key => key !== permission) }))} />{permission.replace('.', ' · ')}</label>)}</div></details>}
                  </div>;
                })}
              </div>
              {grants.filter(grant => !sites.some(site => site.id === grant.siteId)).map(grant => <div key={grant.siteId} className="flex flex-wrap items-center gap-3 text-sm text-amber-800"><span>Unavailable site: {grant.siteId}</span><Button type="button" variant="outline" onClick={() => setGrants(previous => previous.filter(item => item.siteId !== grant.siteId))}>Remove unavailable grant</Button></div>)}
            </>}
          <label className="block text-sm font-medium">Optional expiry (ISO date and time)<input value={expiresAt} onChange={event => setExpiresAt(event.target.value)} placeholder="2026-12-31T23:59:00Z" className="mt-2 min-h-11 w-full rounded border border-border bg-background px-3" /></label>
          <div className="flex flex-wrap gap-2"><Button type="button" onClick={() => void save()} disabled={mode === 'workspace' && !confirmWorkspace}>{busy ? 'Saving…' : 'Save site access'}</Button><Button type="button" variant="outline" onClick={() => void save(true)}>Revoke all site access</Button></div>
        </fieldset>
      </>}
  </section>;
}
