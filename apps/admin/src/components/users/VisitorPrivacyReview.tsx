import { useEffect, useRef, useState } from 'react';
import { Shield } from 'lucide-react';
import type { BackyVisitorPrivacyImpact } from '@backy-cms/core';
import { Button } from '@/components/ui/Button';
import { Notice } from '@/components/ui/Notice';
import { createWorkspaceLoadAuthority } from '@/lib/workspaceLoadAuthority';
import { loadVisitorPrivacyImpact, VisitorPrivacyReviewDenied } from '@/lib/visitorPrivacyReviewClient';

export interface VisitorPrivacyReviewProps {
  siteId: string;
  memberId: string;
  memberStatus: 'active' | 'suspended' | 'removed';
  canReview: boolean;
  /** Nonsecret actor/session/permission/list context. Never a credential. */
  contextKey: string;
}
export function VisitorPrivacyReview(props: VisitorPrivacyReviewProps) {
  if (!props.siteId || !props.memberId || !props.canReview) return <Button type="button" variant="outline" disabled title="An owner session with users.view access is required.">Privacy review</Button>;
  return <ReviewSession key={JSON.stringify([props.siteId, props.memberId, props.memberStatus, props.contextKey])} {...props} />;
}
function ReviewSession({ siteId, memberId }: VisitorPrivacyReviewProps) {
  const authority = useRef(createWorkspaceLoadAuthority()).current;
  const controller = useRef<AbortController | null>(null);
  const busy = useRef(false);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState('');
  const [snapshot, setSnapshot] = useState<BackyVisitorPrivacyImpact | null>(null);
  useEffect(() => () => { authority.invalidate(); controller.current?.abort(); busy.current = false; }, [authority]);
  const close = () => { authority.invalidate(); controller.current?.abort(); busy.current = false; setOpen(false); setLoading(false); setSnapshot(null); setError(''); };
  const review = () => {
    if (busy.current) return;
    busy.current = true; controller.current?.abort(); const next = new AbortController(); controller.current = next;
    setOpen(true); setLoading(true); setError(''); setSnapshot(null);
    void authority.run(() => loadVisitorPrivacyImpact(siteId, memberId, next.signal), {
      success: value => setSnapshot(value),
      error: cause => { setSnapshot(null); setError(cause instanceof VisitorPrivacyReviewDenied ? cause.message : 'Privacy review could not load. Review again to request a fresh snapshot.'); },
      finish: () => { busy.current = false; setLoading(false); },
    });
  };
  const rows = snapshot ? [
    ['Comments', snapshot.counts.comments], ['Form submissions', snapshot.counts.formSubmissions], ['Source-linked contacts · ownership ambiguous', snapshot.counts.linkedContacts],
  ] as const : [];
  return <div className="w-full min-w-0" data-testid="visitor-privacy-review">
    <div className="flex flex-wrap justify-end gap-2"><Button type="button" variant="outline" iconStart={<Shield className="size-4" />} disabled={loading} onClick={review}>{loading ? 'Reviewing…' : open ? 'Review again' : 'Privacy review'}</Button>
      {open && <Button type="button" variant="ghost" onClick={close}>Close review</Button>}</div>
    {open && <section className="mt-3 border-l-2 border-primary bg-muted/30 p-4" aria-label="Privacy review results" aria-live="polite">
      <h3 className="text-base font-semibold">Privacy review</h3>
      <p className="mt-1 text-sm text-muted-foreground">Counts of verified links for this website membership. This review does not erase data, change access or contact a provider.</p>
      {loading && <p className="mt-4 text-sm" role="status">Loading a private point-in-time snapshot…</p>}
      {error && <Notice className="mt-4" tone="error" title="Review unavailable" role="alert">{error}</Notice>}
      {snapshot && <div data-testid="visitor-privacy-snapshot">
        <p className="my-4 text-sm text-muted-foreground">Observed <time dateTime={snapshot.observedAt}>{new Date(snapshot.observedAt).toLocaleString()}</time> · Membership {snapshot.memberStatus === 'removed' ? 'access removed' : snapshot.memberStatus}. Counts may change after this observation.</p>
        <dl className="divide-y border-y">{rows.map(([label, value]) => <div key={label} className="flex items-start justify-between gap-4 py-2.5"><dt className="text-sm">{label}</dt><dd className="font-mono text-base tabular-nums" data-count={label}>{value.toLocaleString()}</dd></div>)}</dl>
        <div className="mt-4 overflow-x-auto"><table className="w-full text-left text-sm"><caption className="mb-2 text-left font-medium">Durable delivery journal</caption><thead><tr className="border-b text-muted-foreground"><th scope="col" className="py-2 pr-3 font-medium">Source</th><th scope="col" className="py-2 pr-3 font-medium">Total</th><th scope="col" className="py-2 pr-3 font-medium">Pending</th><th scope="col" className="py-2 font-medium">Unknown outcome</th></tr></thead><tbody>{(['commentDeliveryAttempts', 'formDeliveryAttempts'] as const).map(key => <tr key={key} className="border-b"><th scope="row" className="py-2 pr-3 font-normal">{key === 'commentDeliveryAttempts' ? 'Comments' : 'Submissions'}</th>{(['total', 'pending', 'unknownOutcome'] as const).map(field => <td key={field} className="py-2 pr-3 font-mono tabular-nums">{snapshot.counts[key][field].toLocaleString()}</td>)}</tr>)}</tbody></table></div>
        <Notice className="mt-4" tone="warning" title="Retention and coverage limits"><p>Membership identity, comments and moderation, submission values/files/admin metadata, source-linked contact copies and delivery evidence remain retained.</p><p className="mt-2">Contact links do not prove exclusive ownership. Downstream copies have unknown provenance; legacy deliveries, local outboxes and provider-held copies are not inventoried. No content or file values were inspected, and matching email addresses were not used to infer ownership. Unknown outcome is the stored uncertain journal state; it does not establish delivery or provider completion.</p></Notice>
      </div>}
    </section>}
  </div>;
}
