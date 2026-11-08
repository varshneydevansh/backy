import { useEffect, useRef, useState } from "react";
import type {
  BackyTemplateInstanceOutcome,
  BackyTemplateRevision,
} from "@backy-cms/core";
import { Button } from "@/components/ui/Button";
import {
  reviewOrUpgradeTemplateInstances,
  type TemplateInstanceSelection,
} from "@/lib/templateInstancesClient";
const key = (row: { type: string; id: string }) => row.type + ":" + row.id;
export function templateInstanceEditorHref(siteId: string, row: { type: "page" | "post" | "section" | "product" | "form" | "collection"; id: string }): string {
  const site = encodeURIComponent(siteId), id = encodeURIComponent(row.id);
  if (row.type === "collection") return `/collections?siteId=${site}&collectionId=${id}#collections-schema`;
  if (row.type === "form") return `/forms?siteId=${site}&formId=${id}#forms-builder`;
  if (row.type === "section") return `/reusable-sections?siteId=${site}&sectionId=${id}#reusable-sections-editor`;
  if (row.type === "product") return `/products?siteId=${site}&productId=${id}#products-design`;
  return row.type === "page"
    ? `/pages/${id}/edit?siteId=${site}&focus=canvas`
    : `/blog/${id}?siteId=${site}&focus=canvas`;
}
export function TemplateInstancesPanel({
  siteId,
  revision,
  canEdit,
  canView = true,
}: {
  siteId: string;
  revision: BackyTemplateRevision;
  canEdit: boolean;
  canView?: boolean;
}) {
  const [data, setData] = useState<BackyTemplateInstanceOutcome>(),
    [review, setReview] = useState<BackyTemplateInstanceOutcome>();
  const [selection, setSelection] = useState<TemplateInstanceSelection>([]),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [confirmed, setConfirmed] = useState(false),
    [page, setPage] = useState(0);
  const controller = useRef<AbortController>();
  useEffect(() => {
    controller.current?.abort();
    setData(undefined);
    setReview(undefined);
    setSelection([]);
    setConfirmed(false);
    setError("");
    setBusy(false);
    setPage(0);
    return () => controller.current?.abort();
  }, [siteId, revision.id, canView, canEdit]);
  const run = async (action: "review" | "apply") => {
    if (!canView || (action === "apply" && (!review?.canApply || !confirmed || !canEdit)))
      return;
    controller.current?.abort();
    const request = new AbortController();
    controller.current = request;
    setBusy(true);
    setError("");
    setConfirmed(false);
    const snapshot = review;
    setReview(undefined);
    try {
      const outcome = await reviewOrUpgradeTemplateInstances(
        siteId,
        revision.templateId,
        {
          action,
          ...(["product", "form", "collection"].includes(revision.snapshot.type) ? { targetType: revision.snapshot.type as "product" | "form" | "collection" } : {}),
          targetRevisionId: revision.id,
          selection,
          ...(action === "apply"
            ? { reviewVersion: snapshot?.reviewVersion }
            : {}),
        },
        request.signal,
      );
      if (request.signal.aborted) return;
      setData(outcome);
      if (action === "review") setReview(outcome);
    } catch (cause) {
      if (!request.signal.aborted)
        setError(
          cause instanceof Error
            ? cause.message
            : "Template instances could not load.",
        );
    } finally {
      if (!request.signal.aborted) setBusy(false);
    }
  };
  if (!["page", "blogPost", "section", "product", "form", "collection"].includes(revision.snapshot.type)) return null;
  return (
    <div
      className="mt-5 border-t pt-4"
      data-testid="template-instance-upgrades"
    >
      <h4 className="text-sm font-semibold">Review existing instances</h4>
      <p className="mt-1 max-w-3xl text-xs text-muted-foreground">
        Template-only changes can upgrade selected pages, posts, reusable sections, product designs, form presentation or collection layouts. Author edits
        and unknown fields stay intact; overlapping edits block that document.
        Older instances without a recorded baseline need manual review in their
        editor. Restoring a template never upgrades instances automatically.
      </p>
      {revision.snapshot.type === "section" && (
        <p className="mt-2 text-xs text-muted-foreground">
          This upgrades the section definition. Review propagation separately to update linked pages, posts or products.
        </p>
      )}
      {revision.snapshot.type === "collection" && (<p className="mt-2 text-xs text-muted-foreground">Collection upgrades change compatible design and field presentation. Field types, validation, routes, access rules and entries stay intact. Schema changes block upgrades.</p>)}
      {revision.snapshot.type === "form" && (
        <p className="mt-2 text-xs text-muted-foreground">Form upgrades change presentation and compatible design. Field semantics, audience, submission targets, notifications, consent and retained submissions stay intact.</p>
      )}
      {revision.snapshot.type === "product" && (
        <p className="mt-2 text-xs text-muted-foreground">
          Product upgrades change the design. Price, inventory, status and other catalog values stay intact.
        </p>
      )}
      <Button
        type="button"
        variant="outline"
        className="mt-3"
        disabled={busy || !canView}
        onClick={() => void run("review")}
      >
        {busy
          ? "Checking…"
          : selection.length
            ? "Review selected upgrades"
            : "Inspect template impact"}
      </Button>
      {error && (
        <p role="alert" className="mt-3 text-sm text-destructive">
          {error}
        </p>
      )}
      {data && (
        <div className="mt-3" aria-live="polite">
          <p className="text-xs text-muted-foreground">
            {data.scanned.collections !== undefined
              ? `Scanned ${data.scanned.collections} collections. `
              : data.scanned.forms !== undefined
              ? `Scanned ${data.scanned.forms} forms. `
              : data.scanned.products !== undefined
              ? `Scanned ${data.scanned.products} products. `
              : data.scanned.sections !== undefined
              ? `Scanned ${data.scanned.sections} reusable sections. `
              : `Scanned ${data.scanned.pages} pages and ${data.scanned.posts} posts. `}
            Target v{String(revision.snapshot.version ?? "unversioned")} ·{" "}
            {data.targets.length} matching instances.
          </p>
          {!data.targets.length && (
            <p className="mt-2 text-sm">
              No editable instances reference this template.
            </p>
          )}
          <ul className="mt-2 divide-y">
            {data.targets.slice(page * 25, (page + 1) * 25).map((row) => (
              <li className="py-3 text-sm" key={key(row)}>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <label className="flex min-h-11 items-center gap-2">
                    <input
                      type="checkbox"
                      aria-label={`Select ${row.title}`}
                      disabled={busy || !canEdit || row.state !== "ready"}
                      checked={selection.some((item) => key(item) === key(row))}
                      onChange={(event) => {
                        setSelection((current) =>
                          event.target.checked
                            ? [...current, { type: row.type, id: row.id, ...(row.type === "product" ? { collectionId: row.collectionId } : {}) }]
                            : current.filter((item) => key(item) !== key(row)),
                        );
                        setReview(undefined);
                        setConfirmed(false);
                      }}
                    />
                    <span>
                      {row.title}{" "}
                      <span className="text-xs text-muted-foreground">
                        · {row.type} · {row.status} · {row.state}
                      </span>
                    </span>
                  </label>
                  <a
                    className="inline-flex min-h-11 items-center underline"
                    href={
                      templateInstanceEditorHref(siteId, row)
                    }
                  >
                    Open editor
                  </a>
                </div>
                <p className="break-all font-mono text-xs text-muted-foreground">
                  {row.id} ·{" "}
                  {row.pinnedFingerprint
                    ? `Pinned ${row.pinnedFingerprint.slice(0, 12)}`
                    : "Unpinned legacy instance"}
                </p>
                {!!row.changedPaths.length && (
                  <details className="mt-2">
                    <summary className="cursor-pointer text-xs">
                      {row.changedPaths.length} template change locations
                    </summary>
                    <ul className="mt-1 break-all font-mono text-xs">
                      {row.changedPaths.map((path) => (
                        <li key={path}>{path || "/"}</li>
                      ))}
                    </ul>
                  </details>
                )}
                {!!row.conflicts.length && (
                  <ul className="mt-2 break-all font-mono text-xs text-destructive">
                    {row.conflicts.map((issue, index) => (
                      <li key={index}>
                        {issue.code} · {issue.path || "/"}
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            ))}
          </ul>
          {data.targets.length > 25 && (
            <div className="mt-3 flex items-center gap-3">
              <Button
                type="button"
                variant="outline"
                disabled={page === 0 || busy}
                onClick={() => setPage((value) => value - 1)}
              >
                Previous instances
              </Button>
              <span className="text-xs">
                {page * 25 + 1}–{Math.min((page + 1) * 25, data.targets.length)}{" "}
                of {data.targets.length}
              </span>
              <Button
                type="button"
                variant="outline"
                disabled={(page + 1) * 25 >= data.targets.length || busy}
                onClick={() => setPage((value) => value + 1)}
              >
                Next instances
              </Button>
            </div>
          )}
          {data.action === "apply" && (
            <div className="mt-3 border-l-2 border-primary pl-3">
              <p className="text-sm">
                {data.outcome === "partial"
                  ? "Partial outcome"
                  : "Upgrade complete"}{" "}
                · {data.appliedTargets.length} confirmed ·{" "}
                {data.failedTargets.length} failed
              </p>
              {data.failedTargets.map((row) => (
                <p className="mt-1 break-all font-mono text-xs" key={key(row)}>
                  {key(row)} · {row.code}
                </p>
              ))}
              {data.completionWarnings.map((warning) => (
                <p className="mt-1 text-xs" key={warning}>
                  {warning}
                </p>
              ))}
              <p className="mt-2 text-xs text-muted-foreground">
                Confirmed document commits are retained. Inspect current impact
                again before retrying.
              </p>
            </div>
          )}
        </div>
      )}
      {!canEdit && (
        <p className="mt-2 text-xs text-muted-foreground">
          {revision.snapshot.type === "product"
            ? "Collections edit and commerce edit permissions are required to upgrade product designs."
            : revision.snapshot.type === "collection" ? "Collections edit permission is required to upgrade collection design; products and orders also require commerce configure." : revision.snapshot.type === "form" ? "Forms edit permission is required to upgrade form presentation." : "Page edit permission is required to upgrade instances."}
        </p>
      )}
      {!canView && <p className="mt-2 text-xs text-muted-foreground">{revision.snapshot.type === "collection" ? "Collections view permission is required to inspect collection design; products and orders also require commerce view." : revision.snapshot.type === "form" ? "Forms view permission is required to inspect form presentation." : "Collections view and commerce view permissions are required to inspect product designs."}</p>}
      {review?.canApply && canEdit && (
        <div className="mt-4 border-l-2 border-primary pl-3">
          <label className="flex min-h-11 items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={confirmed}
              onChange={(event) => setConfirmed(event.target.checked)}
              disabled={busy}
            />
            Confirm upgrade of these {selection.length} reviewed documents.
            {["page", "blogPost"].includes(revision.snapshot.type) && " Published or scheduled pages and posts also require publish permission."}
          </label>
          <Button
            type="button"
            disabled={busy || !confirmed}
            onClick={() => void run("apply")}
          >
            Upgrade reviewed instances
          </Button>
          <p className="mt-2 text-xs text-muted-foreground">
            Each document has its own guarded write and baseline revision. No
            automatic retry.
          </p>
        </div>
      )}
    </div>
  );
}
