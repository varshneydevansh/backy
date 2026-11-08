import { useEffect, useRef, useState } from "react";
import type {
  FormTemplatePack,
  FormTemplatePackReview,
  FormTemplatePackApplied,
  FormTemplatePackImportRequest,
} from "@backy-cms/core";
import { Button } from "@/components/ui/Button";
import { requestFormTemplatePackImport } from "@/lib/formTemplatePackClient";
export function FormTemplatePackImportPanel({
  siteId,
  canImport,
  onApplied,
}: {
  siteId: string;
  canImport: boolean;
  onApplied: (data: FormTemplatePackApplied) => Promise<void>;
}) {
  const [pack, setPack] = useState<FormTemplatePack | null>(null),
    [fileName, setFileName] = useState(""),
    [selection, setSelection] = useState<string[]>([]),
    [names, setNames] = useState<Record<string, string>>({}),
    [mapping, setMapping] = useState("{}"),
    [ack, setAck] = useState(false),
    [review, setReview] = useState<FormTemplatePackReview | null>(null),
    [confirmed, setConfirmed] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  const controller = useRef<AbortController | null>(null),
    generation = useRef(0),
    fileInput = useRef<HTMLInputElement | null>(null);
  const invalidate = () => {
    controller.current?.abort();
    generation.current++;
    setReview(null);
    setConfirmed(false);
    setError("");
    setNotice("");
  };
  useEffect(() => {
    invalidate();
    setPack(null);
    setFileName("");
    setSelection([]);
    setNames({});
    setMapping("{}");
    setAck(false);
    setBusy(false);
    if (fileInput.current) fileInput.current.value = "";
    return () => controller.current?.abort();
  }, [siteId]);
  async function fileChanged(file?: File) {
    invalidate();
    setPack(null);
    setSelection([]);
    setNames({});
    setMapping("{}");
    setAck(false);
    setFileName(file?.name || "");
    if (!file) return;
    const sequence = generation.current;
    try {
      if (file.size > 2097152)
        throw new Error("Choose a JSON file of at most 2 MiB.");
      const parsed = JSON.parse(await file.text());
      if (sequence !== generation.current) return;
      if (parsed?.schemaVersion !== "backy.form-template-pack.v1")
        throw new Error("Choose a version 1 Backy form template pack.");
      const candidates = [
        ...(Array.isArray(parsed.builtInTemplates)
          ? parsed.builtInTemplates
          : []
        ).map((x: any) => ({ id: `builtin:${x.id}`, name: x.id })),
        ...(Array.isArray(parsed.frontendTemplates)
          ? parsed.frontendTemplates
          : []
        ).map((x: any) => ({
          id: `frontend:${x.template?.id}`,
          name: x.form?.id,
        })),
      ];
      if (candidates.length > 64 || !candidates.length)
        throw new Error("Choose a pack containing 1–64 form templates.");
      setPack(parsed);
      setSelection(candidates.map((x) => x.id));
      setNames(
        Object.fromEntries(
          candidates.map((x) => [
            x.id,
            String(x.name || "form")
              .toLowerCase()
              .replace(/[^a-z0-9_-]/g, "-"),
          ]),
        ),
      );
    } catch (e) {
      if (sequence === generation.current) setError((e as Error).message);
    }
  }
  async function send(action: "review" | "apply") {
    if (!pack) return;
    controller.current?.abort();
    const active = new AbortController();
    controller.current = active;
    const sequence = ++generation.current;
    setBusy(true);
    setError("");
    try {
      let references: FormTemplatePackImportRequest["references"];
      try {
        references = JSON.parse(mapping);
      } catch {
        throw new Error("Reference mappings must be valid JSON.");
      }
      const body: FormTemplatePackImportRequest = {
        action,
        pack,
        selection,
        names,
        references,
        acknowledgeUnverified: ack,
        ...(action === "apply" ? { reviewVersion: review?.reviewVersion } : {}),
      };
      const data = await requestFormTemplatePackImport(
        siteId,
        body,
        active.signal,
      );
      if (sequence !== generation.current) return;
      if (action === "review") {
        setReview(data as FormTemplatePackReview);
        setConfirmed(false);
      } else {
        const result = data as FormTemplatePackApplied;
        setReview(null);
        setConfirmed(false);
        setNotice(
          `${result.forms.length} inactive standalone form${result.forms.length === 1 ? "" : "s"} imported.${result.completionWarnings.length ? " Audit recording needs follow-up." : ""}`,
        );
        await onApplied(result);
      }
    } catch (e) {
      if (sequence === generation.current && !active.signal.aborted) {
        setError((e as Error).message);
        if (action === "apply") setReview(null);
        setConfirmed(false);
      }
    } finally {
      if (sequence === generation.current) setBusy(false);
    }
  }
  const candidates = pack
    ? [
        ...(pack.builtInTemplates || []).map((x: any) => ({
          id: `builtin:${x.id}`,
          title: x.title || x.id,
        })),
        ...(pack.frontendTemplates || []).map((x: any) => ({
          id: `frontend:${x.template.id}`,
          title: x.form.title || x.template.name || x.template.id,
        })),
      ]
    : [];
  return (
    <section
      aria-label="Import form template pack"
      className="mb-5 rounded-lg border border-border bg-background p-4"
    >
      <h3 className="text-sm font-semibold">Import form template pack</h3>
      <p className="mt-1 text-sm text-muted-foreground">
        Review a downloaded JSON pack, map destination references, then create
        inactive standalone forms. Captured layout and editable settings are
        copied with each form.
      </p>
      <label className="mt-3 block text-sm font-medium">
        Template pack JSON
        <input
          ref={fileInput}
          type="file"
          accept=".json,application/json"
          disabled={busy || !canImport}
          onChange={(e) => void fileChanged(e.target.files?.[0])}
          className="mt-1 block min-h-11 w-full max-w-full text-sm"
        />
      </label>
      {!canImport && (
        <p className="text-sm text-muted-foreground">
          Form creation permission is required to import.
        </p>
      )}
      {fileName && (
        <p className="mt-2 break-all text-xs text-muted-foreground">
          Selected file: {fileName}
        </p>
      )}
      {pack && (
        <div className="mt-4 space-y-3">
          {candidates.map((c) => (
            <div key={c.id} className="grid gap-2 sm:grid-cols-2">
              <label className="flex min-h-11 items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={selection.includes(c.id)}
                  disabled={busy}
                  onChange={(e) => {
                    invalidate();
                    setSelection(
                      e.target.checked
                        ? [...selection, c.id]
                        : selection.filter((x) => x !== c.id),
                    );
                  }}
                />
                {c.title}
              </label>
              <label className="text-sm">
                Destination name
                <input
                  aria-label={`Destination name for ${c.title}`}
                  className="mt-1 min-h-11 w-full rounded border border-border bg-background px-3"
                  value={names[c.id] || ""}
                  disabled={busy}
                  onChange={(e) => {
                    invalidate();
                    setNames({ ...names, [c.id]: e.target.value });
                  }}
                />
              </label>
            </div>
          ))}
          <details>
            <summary className="min-h-11 cursor-pointer text-sm font-medium">
              Destination reference mappings
            </summary>
            <p className="my-2 text-xs text-muted-foreground">
              Use canonical destination IDs. Keys: collections, pages, posts,
              media, components. Map each source ID or managed media URL to its
              destination ID; component keys use key@version. Source site
              metadata is provenance only.
            </p>
            <label className="text-sm">
              Reference mapping JSON
              <textarea
                rows={5}
                value={mapping}
                disabled={busy}
                onChange={(e) => {
                  invalidate();
                  setMapping(e.target.value);
                }}
                className="mt-1 w-full rounded border border-border bg-background p-3 font-mono text-xs"
                placeholder={'{"collections":{"source-id":"destination-id"}}'}
              />
            </label>
          </details>
          <label className="flex min-h-11 items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={ack}
              disabled={busy}
              onChange={(e) => {
                invalidate();
                setAck(e.target.checked);
              }}
            />
            I will test preserved custom styling, code and component behavior
            before activating these forms.
          </label>
          <Button
            variant="outline"
            disabled={busy || !selection.length}
            onClick={() => void send("review")}
          >
            {busy ? "Working…" : "Review import"}
          </Button>
        </div>
      )}
      {review && (
        <div className="mt-4 space-y-3" aria-label="Reviewed form import">
          <p className="text-sm font-medium">
            {review.targets.filter((t) => t.selected).length} selected form(s) ·
            inactive standalone ·{" "}
            {review.concurrencyBoundary === "demo-single-process"
              ? "single-process demo commit"
              : "database transaction"}
          </p>
          {review.targets
            .filter((t) => t.selected)
            .map((t) => (
              <details key={t.id} className="rounded border border-border p-3">
                <summary className="min-h-11 cursor-pointer text-sm">
                  {t.name} · {t.fieldCount} fields ·{" "}
                  {t.hasCapturedLayout
                    ? "captured layout copied"
                    : "field builder"}
                </summary>
                <pre className="max-h-64 overflow-auto whitespace-pre-wrap break-all text-xs">
                  {JSON.stringify(
                    { fields: t.form.fields, settings: t.form.settings },
                    null,
                    2,
                  )}
                </pre>
              </details>
            ))}
          {review.issues
            .filter((i) => !i.targetId || selection.includes(i.targetId))
            .map((i, n) => (
              <p
                key={n}
                className={`break-words text-sm ${i.severity === "blocking" ? "text-destructive" : "text-muted-foreground"}`}
              >
                <strong>
                  {i.severity === "blocking"
                    ? "Blocked"
                    : "Needs frontend testing"}
                  :
                </strong>{" "}
                {i.message}{" "}
                <code className="text-xs">
                  {i.targetId} {i.path}
                </code>
              </p>
            ))}
          <label className="flex min-h-11 items-start gap-2 text-sm">
            <input
              type="checkbox"
              checked={confirmed}
              disabled={!review.canApply || busy}
              onChange={(e) => setConfirmed(e.target.checked)}
              className="mt-1"
            />
            Create exactly these{" "}
            {review.targets
              .filter((t) => t.selected)
              .map((t) => t.name)
              .join(", ")}{" "}
            form(s), inactive and unattached. Existing forms will remain.
          </label>
          <Button
            variant="primary"
            disabled={!canImport || busy || !review.canApply || !confirmed}
            onClick={() => void send("apply")}
          >
            Import reviewed forms
          </Button>
        </div>
      )}
      {error && (
        <p role="alert" className="mt-3 text-sm text-destructive">
          {error}
        </p>
      )}
      {notice && (
        <p role="status" className="mt-3 text-sm">
          {notice}
        </p>
      )}
    </section>
  );
}
