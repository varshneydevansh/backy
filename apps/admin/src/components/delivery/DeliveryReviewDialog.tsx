import { useEffect, useId, useRef, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { createWorkspaceLoadAuthority } from '@/lib/workspaceLoadAuthority';
import type { CommentDeliveryEvent, FormDeliveryEvent, DeliveryReviewEvidence, DeliveryReviewOutcome, DeliveryReviewRequest } from '@/lib/adminContentApi';

type DeliveryEvent = CommentDeliveryEvent | FormDeliveryEvent;
const evidenceLabels: Record<DeliveryReviewEvidence, string> = {
  'provider-console-reviewed': 'Provider console reviewed',
  'recipient-report-reviewed': 'Recipient report reviewed',
  'outcome-unavailable': 'Outcome unavailable',
};

export function isDeliveryReviewable(event: DeliveryEvent): boolean {
  return (event.status === 'pending' || event.status === 'uncertain')
    && typeof event.updatedAt === 'string' && Number.isFinite(Date.parse(event.updatedAt))
    && Number.isSafeInteger(event.reconciliationVersion ?? 0)
    && (event.reconciliationVersion ?? 0) >= 0;
}

export function DeliveryReviewBadge({ event }: { event: DeliveryEvent }) {
  const latest = event.reconciliations?.at(-1);
  if (!latest) return null;
  return <div className="mt-2 text-xs text-muted-foreground" data-testid="delivery-owner-review-badge">
    <span className="rounded border border-primary/30 bg-primary/5 px-2 py-1 font-semibold text-primary">Owner reviewed</span>
    <span className="ml-2">{latest.actorId} · {new Date(latest.createdAt).toLocaleString()} · Review {latest.version}</span>
    <p className="mt-2">Provider completion remains unverified. No resend was requested.</p>
  </div>;
}

/** A review records investigation only; the provider state and send policy stay unchanged. */
export function DeliveryReviewDialog<T extends DeliveryEvent>({ event, contextKey, canReview, onSave, onSaved, onClose }: {
  event: T;
  contextKey: string;
  canReview: boolean;
  onSave: (body: DeliveryReviewRequest) => Promise<DeliveryReviewOutcome<T>>;
  onSaved: (outcome: DeliveryReviewOutcome<T>) => void;
  onClose: () => void;
}) {
  const titleId = useId();
  const descriptionId = useId();
  const panel = useRef<HTMLDivElement>(null);
  const authority = useRef(createWorkspaceLoadAuthority());
  authority.current.setContext(JSON.stringify([contextKey, canReview, event.id, event.updatedAt, event.reconciliationVersion ?? 0]));
  const [evidence, setEvidence] = useState<DeliveryReviewEvidence>('outcome-unavailable');
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState<DeliveryReviewOutcome<T>>();
  const displayEvent = saved?.attempt || event;
  useEffect(() => {
    const previouslyFocused = document.activeElement as HTMLElement | null;
    panel.current?.focus();
    return () => { authority.current.invalidate(); previouslyFocused?.isConnected && previouslyFocused.focus(); };
  }, []);
  const save = async () => {
    if (busy || saved || !confirmed || !canReview || !isDeliveryReviewable(event)) return;
    setBusy(true); setError('');
    await authority.current.run(() => onSave({
      expectedUpdatedAt: event.updatedAt!, expectedState: event.status as 'pending' | 'uncertain',
      expectedReviewVersion: event.reconciliationVersion ?? 0, evidence, disposition: 'retain-without-resend',
    }), {
      success: outcome => { setSaved(outcome); setConfirmed(false); onSaved(outcome); },
      error: cause => { setError(cause instanceof Error ? cause.message : 'Review could not be recorded. Reload history before retrying.'); setConfirmed(false); },
      finish: () => setBusy(false),
    });
  };
  return <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 p-4">
    <div ref={panel} role="dialog" aria-modal="true" aria-labelledby={titleId} aria-describedby={descriptionId} tabIndex={-1}
      className="max-h-[90dvh] w-full max-w-2xl overflow-y-auto rounded-lg border border-border bg-background p-5 shadow-xl"
      data-testid="delivery-review-dialog" onKeyDown={key => {
        if (key.key === 'Escape' && !busy) { key.preventDefault(); onClose(); }
        if (key.key === 'Tab') {
          const controls = panel.current?.querySelectorAll<HTMLElement>('button:not(:disabled), select:not(:disabled), input:not(:disabled), [tabindex="0"]');
          if (!controls?.length) { key.preventDefault(); return; }
          const first = controls[0], last = controls[controls.length - 1];
          if (key.shiftKey && (document.activeElement === first || document.activeElement === panel.current)) { key.preventDefault(); last.focus(); }
          else if (!key.shiftKey && (document.activeElement === last || document.activeElement === panel.current)) { key.preventDefault(); first.focus(); }
        }
      }}>
      <h2 id={titleId} className="text-base font-semibold">Review delivery without resending</h2>
      <p id={descriptionId} className="mt-2 text-sm text-muted-foreground">Record an owner investigation. Provider completion remains unverified; the original status and evidence are retained. This action sends no notification.</p>
      <dl className="mt-4 grid gap-2 text-sm sm:grid-cols-2">
        <div><dt className="text-muted-foreground">Original attempt</dt><dd className="break-all font-mono text-xs">{event.id}</dd></div>
        <div><dt className="text-muted-foreground">Provider status</dt><dd data-testid="delivery-review-provider-status" className="font-semibold text-warning">{displayEvent.status}</dd></div>
        <div><dt className="text-muted-foreground">Original revision</dt><dd className="break-all font-mono text-xs">{event.updatedAt}</dd></div>
        <div><dt className="text-muted-foreground">Review version</dt><dd>{displayEvent.reconciliationVersion ?? 0}</dd></div>
      </dl>
      <div className="mt-4 border-y border-border py-3 text-sm">
        <h3 className="font-semibold">Retained provider evidence</h3>
        {displayEvent.providerEvidence ? <dl className="mt-2 grid gap-2 text-xs sm:grid-cols-2">
          <div><dt className="text-muted-foreground">Provider</dt><dd>{displayEvent.providerEvidence.provider}</dd></div>
          <div><dt className="text-muted-foreground">Observed at</dt><dd>{displayEvent.providerEvidence.observedAt}</dd></div>
          {typeof displayEvent.providerEvidence.statusCode === 'number' && <div><dt className="text-muted-foreground">Provider response status</dt><dd>{displayEvent.providerEvidence.statusCode}</dd></div>}
          {displayEvent.providerEvidence.providerMessageId && <div><dt className="text-muted-foreground">Provider message ID</dt><dd className="break-all font-mono">{displayEvent.providerEvidence.providerMessageId}</dd></div>}
          {displayEvent.providerEvidence.outboxOnly && <p>Local outbox only; recipient delivery is unverified.</p>}
        </dl> : <p className="mt-2 text-xs text-muted-foreground">No provider acknowledgement was retained.</p>}
      </div>
      {displayEvent.reconciliations?.length ? <div className="mt-4">
        <h3 className="text-sm font-semibold">Retained owner reviews</h3>
        <ol className="mt-2 space-y-2 text-xs" data-testid="delivery-review-history">{displayEvent.reconciliations.map(review => <li key={review.id} className="border-l-2 border-primary/30 pl-3">
          <div>Review {review.version} · {review.actorId} · {new Date(review.createdAt).toLocaleString()}</div>
          <div>{evidenceLabels[review.evidence]} · Retained without resend</div>
        </li>)}</ol>
      </div> : null}
      {!saved && <div className="mt-4">
        <label className="text-sm font-medium">Investigation evidence<select className="mt-2 min-h-11 w-full rounded border border-border bg-background px-3" value={evidence} disabled={busy || !canReview}
          onChange={change => { setEvidence(change.target.value as DeliveryReviewEvidence); setConfirmed(false); }} data-testid="delivery-review-evidence">
          {Object.entries(evidenceLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select></label>
        <label className="mt-3 flex min-h-11 items-center gap-3 text-sm"><input type="checkbox" checked={confirmed} disabled={busy || !canReview} onChange={change => setConfirmed(change.target.checked)} data-testid="delivery-review-confirm" />Retain this attempt without resending. Completion remains unverified.</label>
      </div>}
      {error && <p role="alert" className="mt-3 rounded bg-destructive/10 p-3 text-sm text-destructive">{error}</p>}
      {saved && <p role="status" className="mt-3 rounded bg-primary/5 p-3 text-sm">Owner review recorded. Provider completion remains unverified. No notification was sent.{saved.completionWarnings.length ? ' Follow-up recording needs attention; reload history.' : ''}</p>}
      <div className="mt-4 flex flex-wrap justify-end gap-3">
        <Button variant="outline" disabled={busy} onClick={onClose}>Close</Button>
        {!saved && <Button disabled={busy || !confirmed || !canReview || !isDeliveryReviewable(event)} onClick={() => void save()} data-testid="delivery-review-save">{busy ? 'Recording review…' : 'Record owner review'}</Button>}
      </div>
    </div>
  </div>;
}
