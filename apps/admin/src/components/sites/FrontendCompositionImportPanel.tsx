import { useEffect, useRef, useState } from "react";
import type {
  FrontendCompositionImport,
  FrontendCompositionReview,
  FrontendCompositionApplyResult,
} from "@backy-cms/core";
import { FRONTEND_COMPOSITION_IMPORT_MAX_BYTES } from "@backy-cms/core";
import { CompositionLayoutPreview } from "./CompositionLayoutPreview";
import { Button } from "@/components/ui/Button";
import { requestCompositionImport } from "@/lib/frontendCompositionClient";
interface Props {
  siteId: string;
  canConfigure: boolean;
  onUpdated: () => void;
}
/** A data-only review. Imported HTML, CSS, URLs and component bundles never execute in this panel. */
export function FrontendCompositionImportPanel({
  siteId,
  canConfigure,
  onUpdated,
}: Props) {
  const [text, setText] = useState(""),
    [selection, setSelection] = useState<string[]>([]),
    [ack, setAck] = useState(false),
    [review, setReview] = useState<FrontendCompositionReview>(),
    [result, setResult] = useState<FrontendCompositionApplyResult>();
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [inspectId, setInspectId] = useState("");
  const generation = useRef(0),
    controller = useRef<AbortController>();
  const invalidate = () => {
    generation.current++;
    controller.current?.abort();
    setBusy(false);
    setReview(undefined);
    setResult(undefined);
    setError("");
  };
  useEffect(() => {
    invalidate();
    setText("");
    setSelection([]);
    setAck(false);
    setInspectId("");
    return () => {
      generation.current++;
      controller.current?.abort();
    };
  }, [siteId]);
  let composition: FrontendCompositionImport | undefined,
    parseError = "";
  try {
    if (text.trim()) {
      if (
        new TextEncoder().encode(text).byteLength >
        FRONTEND_COMPOSITION_IMPORT_MAX_BYTES
      )
        throw new Error("File exceeds 2 MiB. Split the package.");
      composition = JSON.parse(text);
      if (
        !composition ||
        !Array.isArray(composition.routes) ||
        composition.routes.some(
          (route) =>
            !route ||
            typeof route.id !== "string" ||
            typeof route.path !== "string" ||
            typeof route.title !== "string",
        ) ||
        (composition.frontendDesign &&
          (!Array.isArray(composition.frontendDesign.templates) ||
            composition.frontendDesign.templates.some(
              (template) => !template || typeof template.id !== "string",
            )))
      )
        throw new Error("Use a composition package with a routes array.");
    }
  } catch (cause) {
    parseError = cause instanceof Error ? cause.message : "Invalid JSON.";
    composition = undefined;
  }
  const candidates = composition
    ? [
        ...composition.routes.map((route) => ({
          id: `route:${route.id}`,
          label: `${route.title} · ${route.path}`,
        })),
        ...(composition.frontendDesign
          ? [
              {
                id: "design",
                label: "Site tokens, chrome and design declarations",
              },
              ...composition.frontendDesign.templates.map((template) => ({
                id: `template:${template.id}`,
                label: `${template.name} · template`,
              })),
            ]
          : []),
      ]
    : [];
  const execute = async (action: "review" | "apply") => {
    if (
      !composition ||
      busy ||
      (action === "apply" && (!review?.canApply || !canConfigure))
    )
      return;
    const sequence = ++generation.current,
      abort = new AbortController();
    controller.current?.abort();
    controller.current = abort;
    setBusy(true);
    setError("");
    try {
      const response = await requestCompositionImport(
        siteId,
        {
          action,
          composition,
          selection,
          acknowledgeUnverified: ack,
          ...(action === "apply"
            ? { reviewVersion: review!.reviewVersion }
            : {}),
        },
        abort.signal,
      );
      if (sequence !== generation.current || abort.signal.aborted) return;
      if (response.schemaVersion === "backy.frontend-composition-review.v1") {
        setReview(response);
        setInspectId(
          response.targets.find((target) => target.selected)?.id ||
            response.targets[0]?.id ||
            "",
        );
      } else {
        setResult(response);
        setReview(undefined);
        onUpdated();
      }
    } catch (cause) {
      if (sequence === generation.current && !abort.signal.aborted) {
        setError(
          cause instanceof Error
            ? cause.message
            : "Request failed. Retry review.",
        );
        if (action === "apply") setReview(undefined);
      }
    } finally {
      if (sequence === generation.current) setBusy(false);
    }
  };
  const target = review?.targets.find((item) => item.id === inspectId);
  return (
    <section
      className="mt-6 border-t pt-6"
      data-testid="frontend-composition-import"
      aria-labelledby="composition-import-title"
    >
      <h3 id="composition-import-title" className="text-base font-semibold">
        Import frontend composition
      </h3>
      <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
        Review concrete page trees, template fields, assets and registered
        component versions. Accept selected targets as authored drafts. Existing
        pages and templates keep their owned identities.
      </p>
      <label className="mt-4 block text-sm font-medium">
        JSON package
        <input
          className="mt-2 block w-full text-sm"
          type="file"
          accept="application/json,.json"
          disabled={busy}
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (!file) return;
            invalidate();
            setText("");
            setSelection([]);
            setAck(false);
            setInspectId("");
            const sequence = generation.current;
            if (file.size > FRONTEND_COMPOSITION_IMPORT_MAX_BYTES) {
              setError("File exceeds 2 MiB. Split the package.");
              return;
            }
            void file
              .text()
              .then((value) => {
                if (sequence !== generation.current) return;
                setText(value);
                setSelection([]);
                setAck(false);
              })
              .catch(() => {
                if (sequence === generation.current)
                  setError("File could not be read. Paste the JSON instead.");
              });
          }}
        />
      </label>
      <label className="mt-3 block text-sm">
        Or paste JSON
        <textarea
          className="mt-1 block min-h-36 w-full rounded-md border bg-background p-3 font-mono text-xs"
          spellCheck={false}
          value={text}
          onChange={(event) => {
            invalidate();
            setText(event.target.value);
            setSelection([]);
            setAck(false);
          }}
          aria-describedby="composition-import-boundary"
        />
      </label>
      <p
        id="composition-import-boundary"
        className="mt-2 text-xs text-muted-foreground"
      >
        Data review only: no source fetching or imported code execution. Dynamic
        route declarations remain templates; concrete selected routes become
        unpublished drafts.
      </p>
      {parseError && (
        <p className="mt-2 text-sm text-destructive" role="alert">
          {parseError}
        </p>
      )}
      {candidates.length > 0 && (
        <fieldset className="mt-4 rounded-md border p-3">
          <legend className="px-1 text-sm font-medium">
            Targets to accept
          </legend>
          <div className="grid gap-2 md:grid-cols-2">
            {candidates.map((candidate) => (
              <label
                key={candidate.id}
                className="flex min-h-10 items-center gap-2 text-sm"
              >
                <input
                  type="checkbox"
                  checked={selection.includes(candidate.id)}
                  disabled={busy}
                  onChange={(event) => {
                    invalidate();
                    setSelection((values) =>
                      event.target.checked
                        ? [...values, candidate.id]
                        : values.filter((id) => id !== candidate.id),
                    );
                  }}
                />
                {candidate.label}
              </label>
            ))}
          </div>
        </fieldset>
      )}
      <label className="mt-3 flex items-start gap-2 text-sm">
        <input
          type="checkbox"
          className="mt-1"
          checked={ack}
          disabled={busy}
          onChange={(event) => {
            invalidate();
            setAck(event.target.checked);
          }}
        />
        I accept retained, unverified renderer, motion and interaction
        declarations and will verify them in the connected frontend.
      </label>
      <div className="mt-4 flex flex-wrap gap-2">
        <Button
          type="button"
          variant="outline"
          disabled={busy || !composition || !selection.length}
          onClick={() => void execute("review")}
        >
          {busy ? "Checking…" : "Review selected targets"}
        </Button>
        <Button
          type="button"
          disabled={busy || !review?.canApply || !canConfigure}
          onClick={() => void execute("apply")}
        >
          Create selected drafts and templates
        </Button>
      </div>
      {!canConfigure && (
        <p className="mt-2 text-xs text-muted-foreground">
          Site configuration and content editing permissions are required to
          create imported drafts.
        </p>
      )}
      {error && (
        <p className="mt-3 text-sm text-destructive" role="alert">
          {error}
        </p>
      )}
      {review && (
        <div className="mt-4 grid gap-4 rounded-md border p-3 md:grid-cols-[minmax(180px,1fr)_minmax(0,2fr)]">
          <div>
            <h4 className="text-sm font-semibold">Reviewed inventory</h4>
            <div className="mt-2 space-y-1">
              {review.targets.map((item) => (
                <button
                  type="button"
                  key={item.id}
                  className={`block w-full rounded-md px-3 py-2 text-left text-sm ${inspectId === item.id ? "bg-muted" : "hover:bg-muted/60"}`}
                  onClick={() => setInspectId(item.id)}
                >
                  <span className="block font-medium">{item.title}</span>
                  <span className="block break-all text-xs text-muted-foreground">
                    {item.path} · {item.elementCount} stable elements ·{" "}
                    {item.selected ? "selected" : "excluded"}
                  </span>
                </button>
              ))}
            </div>
          </div>
          <div className="min-w-0">
            <h4 className="text-sm font-semibold">
              {target?.title} · nested fields and references
            </h4>
            {target && <CompositionLayoutPreview content={target.content} />}
            <pre
              className="mt-2 max-h-96 overflow-auto rounded-md bg-muted p-3 text-xs"
              data-testid="composition-tree-review"
            >
              {JSON.stringify(target?.content, null, 2)}
            </pre>
            <p className="mt-2 text-xs text-muted-foreground">
              This tree is the retained editable data, rather than a
              certification of its frontend rendering.
            </p>
          </div>
          <div className="md:col-span-2">
            <h4 className="text-sm font-semibold">Review findings</h4>
            {review.issues.length ? (
              review.issues.map((issue, index) => (
                <p
                  key={index}
                  className={`mt-2 text-sm ${issue.severity === "blocking" ? "text-destructive" : "text-muted-foreground"}`}
                >
                  <strong>{issue.severity}</strong> · {issue.message}
                  <span className="block break-all font-mono text-xs">
                    {issue.path}
                    {issue.targetId && !selection.includes(issue.targetId)
                      ? " · excluded target"
                      : ""}
                  </span>
                </p>
              ))
            ) : (
              <p className="mt-2 text-sm">
                Selected concrete targets have no unresolved references.
              </p>
            )}
            <details className="mt-3">
              <summary className="cursor-pointer text-sm">
                Copy review report for an agent
              </summary>
              <textarea
                readOnly
                className="mt-2 min-h-32 w-full rounded-md border p-2 font-mono text-xs"
                value={JSON.stringify(review, null, 2)}
              />
            </details>
          </div>
        </div>
      )}
      {result && (
        <div className="mt-4 rounded-md border p-3" role="status">
          <p className="text-sm font-semibold">
            Imported as drafts · {result.drafts.length} routes ·{" "}
            {result.templateIds.length} templates
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            Open each draft to edit, preview and check readiness before
            publishing. Template registration alone creates no live routes.
          </p>
          <div className="mt-2 flex flex-wrap gap-3">
            {result.drafts.map((draft) => (
              <a
                key={draft.id}
                className="text-sm text-primary underline"
                href={draft.editUrl}
              >
                Open {draft.path}
              </a>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
