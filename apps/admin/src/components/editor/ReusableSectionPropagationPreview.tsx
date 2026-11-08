import type { ReusableSectionInstancesRefreshResult } from '../../lib/adminContentApi';

export function canApplyReusableSectionPropagation(preview: ReusableSectionInstancesRefreshResult | null, siteId: string | undefined, sectionId: string | undefined): boolean {
  return Boolean(preview?.dryRun && preview.reviewedPreview.siteId === siteId && preview.reviewedPreview.sectionId === sectionId);
}

export function ReusableSectionPropagationPreview({ preview }: { preview: ReusableSectionInstancesRefreshResult }) {
  return <div className="mt-3 rounded-md border border-border bg-background p-3 text-xs" data-testid="reusable-section-propagation-preview">
    <div className="font-semibold">Reviewed refresh preview</div>
    <p className="mt-1 text-muted-foreground">{preview.totals.instances} instances across {preview.totals.targets} targets. Apply checks the source and complete selected inventory again and commits every content change together. Changed content requires a new preview.</p>
    <p className="mt-1 text-muted-foreground">{preview.concurrencyBoundary === 'demo-single-process' ? 'Demo protection applies within one process. Use PostgreSQL for durable concurrent authoring.' : 'PostgreSQL applies the complete selected scope in one serializable transaction.'}</p>
    <ul className="mt-2 space-y-1">{preview.refreshedTargets.map(target => <li key={`${target.type}:${target.id}`}>{target.type}: {target.title} — {target.refreshed} instance{target.refreshed === 1 ? '' : 's'}</li>)}</ul>
  </div>;
}
