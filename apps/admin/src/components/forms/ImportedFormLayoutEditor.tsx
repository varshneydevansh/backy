import { useEffect, useMemo, useRef, useState } from "react";
import type { FormDefinition } from "@/lib/adminContentApi";
import { updateForm } from "@/lib/adminContentApi";
import { CanvasEditor } from "@/components/editor/CanvasEditor";
import {
  normalizeSavedCanvasContent,
  serializeCanvasContent,
} from "@/components/editor/editorCatalog";
export function ImportedFormLayoutEditor({
  siteId,
  form,
  canEdit,
  onSaved,
  onUnsavedChangesChange,
  onSaveBusyChange,
  scopeKey,
}: {
  siteId: string;
  form: FormDefinition;
  canEdit: boolean;
  onSaved: () => Promise<void>;
  onUnsavedChangesChange?: (dirty: boolean) => void;
  onSaveBusyChange?: (busy: boolean) => void;
  scopeKey?: string;
}) {
  const settings = form.settings || {};
  const scope = scopeKey || `${siteId}:${form.id}`;
  const saveAuthority = useRef({ scope, epoch: 0 });
  if (saveAuthority.current.scope !== scope) { saveAuthority.current.scope = scope; saveAuthority.current.epoch++; }
  useEffect(() => () => { saveAuthority.current.epoch++; onSaveBusyChange?.(false); }, [scope, onSaveBusyChange]);
  const initial = useMemo(
    () =>
      normalizeSavedCanvasContent(
        JSON.stringify({
          contentDocument: settings.frontendDesignContentDocument,
          elements: settings.frontendDesignElements,
          canvasSize: settings.frontendDesignCanvasSize,
        }),
      ),
    [form.id, form.updatedAt, form.version],
  );
  const [layoutDirty, setLayoutDirty] = useState(false);
  const [open, setOpen] = useState(false),
    [notice, setNotice] = useState(""),
    [error, setError] = useState("");
  useEffect(() => () => onUnsavedChangesChange?.(false), [siteId, form.id, onUnsavedChangesChange]);
  if (
    (!settings.frontendDesignContentDocument &&
      !settings.frontendDesignElements)
  )
    return null;
  return (
    <section
      className="mb-5 rounded-lg border border-border p-4"
      aria-label="Imported form layout"
    >
      <button
        type="button"
        className="min-h-11 text-sm font-semibold"
        aria-expanded={open}
        disabled={layoutDirty}
        title={layoutDirty ? "Save the captured layout before closing." : undefined}
        onClick={() => setOpen(!open)}
      >
        {open ? "Close" : "Edit"} captured form layout
      </button>
      <p className="text-sm text-muted-foreground">
        This standalone layout is stored with the form. Changes preserve its
        imported settings, source provenance and unknown JSON extensions.
      </p>
      {open && (
        <div className="mt-3 h-[min(780px,85vh)] min-h-[480px] overflow-hidden rounded border border-border">
          <CanvasEditor
            key={`${siteId}:${form.id}:${form.version || form.updatedAt}`}
            mode="section"
            initialElements={initial.elements}
            initialSize={initial.canvasSize}
            initialSettings={{
              title: form.title || form.name,
              slug: form.name,
              status: "draft",
              meta: {},
            }}
            hideNavigation
            hideSettings
            savePersistence="editor"
            saveOwnerLabel="form layout"
            mediaContext={{ siteId }}
            canEdit={canEdit}
            onUnsavedChangesChange={dirty => { setLayoutDirty(dirty); onUnsavedChangesChange?.(dirty); }}
            canPublish={false}
            onSave={async (elements, _page, size) => {
              if (!canEdit) throw Error("Save current form fields before editing the captured layout.");
              const saveEpoch = saveAuthority.current.epoch;
              const saveIsCurrent = () => saveAuthority.current.epoch === saveEpoch;
              onSaveBusyChange?.(true);
              setError("");
              setNotice("");
              try {
                const payload = JSON.parse(
                  serializeCanvasContent(
                    elements,
                    size || initial.canvasSize,
                    typeof settings.frontendDesignCustomCss === "string"
                      ? settings.frontendDesignCustomCss
                      : initial.customCSS,
                    {
                      documentId: form.id,
                      kind: "page",
                      title: form.title || form.name,
                      slug: form.name,
                      status: "draft",
                      locale: initial.contentDocument?.locale,
                      version:
                        typeof initial.contentDocument?.version === "string"
                          ? initial.contentDocument.version
                          : undefined,
                      customJS:
                        typeof settings.frontendDesignCustomJs === "string"
                          ? settings.frontendDesignCustomJs
                          : initial.customJS,
                      assets:
                        (settings.frontendDesignAssets as any) ??
                        initial.assets,
                      themeTokenRefs:
                        (settings.frontendDesignThemeTokenRefs as any) ??
                        initial.themeTokenRefs,
                      interactions:
                        (settings.frontendDesignInteractions as any) ??
                        initial.interactions,
                      dataBindings:
                        (settings.frontendDesignDataBindings as any) ??
                        initial.dataBindings,
                      editableMap:
                        (settings.frontendDesignEditableMap as any) ??
                        initial.editableMap,
                      seo: (settings.frontendDesignSeo as any) ?? initial.seo,
                      metadata: initial.contentDocument?.metadata,
                    },
                  ),
                );
                await updateForm(siteId, form.id, {
                  expectedVersion: form.version,
                  settings: {
                    ...settings,
                    frontendDesignElements: payload.elements,
                    frontendDesignContentDocument: {
                      ...initial.contentDocument,
                      ...payload.contentDocument,
                      version:
                        initial.contentDocument?.version ??
                        payload.contentDocument.version,
                    },
                    frontendDesignCanvasSize: payload.canvasSize,
                  },
                });
                if (!saveIsCurrent()) return;
                setNotice("Captured form layout saved.");
                await onSaved();
              } catch (e) {
                if (saveIsCurrent()) setError((e as Error).message);
                throw e;
              } finally {
                if (saveIsCurrent()) onSaveBusyChange?.(false);
              }
            }}
          />
        </div>
      )}
      {notice && (
        <p role="status" className="mt-2 text-sm">
          {notice}
        </p>
      )}
      {error && (
        <p role="alert" className="mt-2 text-sm text-destructive">
          {error}
        </p>
      )}
    </section>
  );
}
