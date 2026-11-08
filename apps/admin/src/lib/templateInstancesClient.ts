import type { BackyTemplateInstanceOutcome } from "@backy-cms/core";
import { adminFetch, getAdminApiBase } from "./adminContentApi";
const object = (value: unknown): value is Record<string, any> =>
  !!value && typeof value === "object" && !Array.isArray(value);
export type TemplateInstanceSelection = Array<{
  type: "page" | "post" | "section" | "product" | "form" | "collection";
  id: string;
  collectionId?: string;
}>;
export async function reviewOrUpgradeTemplateInstances(
  siteId: string,
  templateId: string,
  body: {
    action: "review" | "apply";
    targetType?: "product" | "form" | "collection";
    targetRevisionId: string;
    selection: TemplateInstanceSelection;
    reviewVersion?: string;
  },
  signal: AbortSignal,
  request: typeof fetch = adminFetch,
): Promise<BackyTemplateInstanceOutcome> {
  signal.throwIfAborted();
  const reviewPattern = body.targetType === "collection" ? /^template-collection-instances-v1:[a-f0-9]{64}$/ : body.targetType === "form" ? /^template-form-instances-v1:[a-f0-9]{64}$/ : /^template-instances-v1:[a-f0-9]{64}$/;
  if (
    body.action === "apply" &&
    !reviewPattern.test(body.reviewVersion || "")
  )
    throw Error("Review this selection before upgrading.");
  const response = await request(
    `${getAdminApiBase()}/sites/${encodeURIComponent(siteId)}/templates/${encodeURIComponent(templateId)}/instances`,
    {
      method: "POST",
      credentials: "include",
      headers: { "content-type": "application/json" },
      signal,
      body: JSON.stringify(body),
    },
  );
  const payload: unknown = await response.json();
  signal.throwIfAborted();
  if (
    !response.ok ||
    !object(payload) ||
    payload.success !== true ||
    !object(payload.data)
  )
    throw Error(
      object(payload) &&
        object(payload.error) &&
        typeof payload.error.message === "string"
        ? payload.error.message
        : "Template instance request failed. Review again before retrying.",
    );
  const data = payload.data;
  if (
    data.siteId !== siteId ||
    data.templateId !== templateId ||
    data.targetRevisionId !== body.targetRevisionId ||
    data.action !== body.action ||
    !/^[a-f0-9]{64}$/.test(data.targetFingerprint) ||
    !reviewPattern.test(data.reviewVersion) ||
    (body.action === "apply" && data.reviewVersion !== body.reviewVersion) ||
    !Array.isArray(data.targets) ||
    data.targets.length > 2000 ||
    typeof data.canApply !== "boolean" ||
    !Array.isArray(data.appliedTargets) ||
    !Array.isArray(data.failedTargets) ||
    !Array.isArray(data.completionWarnings) ||
    data.completionWarnings.some(
      (warning: unknown) => typeof warning !== "string",
    ) ||
    !["complete", "partial"].includes(data.outcome) ||
    !["database-per-document-row-lock", "demo-single-process"].includes(
      data.concurrencyBoundary,
    ) ||
    !object(data.scanned) ||
    !Number.isSafeInteger(data.scanned.pages) ||
    !Number.isSafeInteger(data.scanned.posts) ||
    (body.targetType === "product" && (!Number.isSafeInteger(data.scanned.products) || data.scanned.products < 0)) ||
    (body.targetType === "collection" && (!Number.isSafeInteger(data.scanned.collections) || data.scanned.collections < 0)) ||
    (data.scanned.collections !== undefined && (!Number.isSafeInteger(data.scanned.collections) || data.scanned.collections < 0)) ||
    (body.targetType === "form" && (!Number.isSafeInteger(data.scanned.forms) || data.scanned.forms < 0)) ||
    (data.scanned.forms !== undefined && (!Number.isSafeInteger(data.scanned.forms) || data.scanned.forms < 0)) ||
    (data.scanned.sections !== undefined &&
      (!Number.isSafeInteger(data.scanned.sections) || data.scanned.sections < 0)) ||
    (data.scanned.products !== undefined &&
      (!Number.isSafeInteger(data.scanned.products) || data.scanned.products < 0))
  )
    throw Error(
      "Template instance response is incompatible. Reload before upgrading.",
    );
  const ids = new Set<string>();
  for (const row of data.targets) {
    if (
      !object(row) ||
      !["page", "post", "section", "product", "form", "collection"].includes(row.type) ||
      typeof row.id !== "string" ||
      !row.id ||
      ids.has(row.type + ":" + row.id) ||
      typeof row.title !== "string" ||
      typeof row.status !== "string" ||
      (body.targetType === "product" && (row.type !== "product" || typeof row.collectionId !== "string" || !row.collectionId)) ||
      (body.targetType !== "product" && row.type === "product") ||
      (body.targetType === "collection" && row.type !== "collection") ||
      (body.targetType !== "collection" && row.type === "collection") ||
      (body.targetType === "form" && row.type !== "form") ||
      (body.targetType !== "form" && row.type === "form") ||
      !["ready", "current", "blocked"].includes(row.state) ||
      !/^[a-f0-9]{64}$/.test(row.contentFingerprint) ||
      (row.pinnedFingerprint !== null &&
        !/^[a-f0-9]{64}$/.test(row.pinnedFingerprint)) ||
      !Array.isArray(row.changedPaths) ||
      row.changedPaths.some(
        (path: unknown) => typeof path !== "string" || path.length > 500,
      ) ||
      !Array.isArray(row.conflicts) ||
      row.conflicts.some(
        (issue: unknown) =>
          !object(issue) ||
          typeof issue.path !== "string" ||
          issue.path.length > 500 ||
          ![
            "VALUE_CONFLICT",
            "ELEMENT_CONFLICT",
            "ORDER_CONFLICT",
            "UNPINNED_INSTANCE",
            "INVALID_PROVENANCE",
            "SCHEMA_INCOMPATIBLE",
          ].includes(issue.code),
      )
    )
      throw Error(
        "Template instance response contains invalid documents. Reload before upgrading.",
      );
    ids.add(row.type + ":" + row.id);
  }
  const selected = new Set(
      body.selection.map((row) => row.type + ":" + row.id),
    ),
    outcomes = new Set<string>();
  if ([...selected].some((id) => !ids.has(id)))
    throw Error(
      "Template instance response omits selected documents. Reload before upgrading.",
    );
  if (body.targetType === "product" && body.selection.some(item =>
    !item.collectionId || !data.targets.some((row: any) => row.type === item.type && row.id === item.id && row.collectionId === item.collectionId)))
    throw Error("Product design response changed the selected collection. Reload before upgrading.");
  const ready =
    body.selection.length > 0 &&
    data.targets
      .filter((row: any) => selected.has(row.type + ":" + row.id))
      .every(
        (row: any) => row.state !== "blocked" && row.conflicts.length === 0,
      );
  if (body.action === "review" && data.canApply !== ready)
    throw Error(
      "Template instance response misstates selected conflicts. Reload before upgrading.",
    );
  for (const [failed, rows] of [
    [false, data.appliedTargets],
    [true, data.failedTargets],
  ] as const)
    for (const row of rows) {
      if (
        !object(row) ||
        !selected.has(row.type + ":" + row.id) ||
        !ids.has(row.type + ":" + row.id) ||
        outcomes.has(row.type + ":" + row.id) ||
        (body.targetType === "product" && !body.selection.some(item => item.type === row.type && item.id === row.id && item.collectionId === row.collectionId)) ||
        (failed &&
          !["CONTENT_CONFLICT", "WRITE_UNAVAILABLE", "WRITE_FAILED"].includes(
            row.code,
          ))
      )
        throw Error(
          "Template upgrade outcome contains unreviewed documents. Reload before retrying.",
        );
      outcomes.add(row.type + ":" + row.id);
    }
  if (
    (body.action === "review" &&
      (outcomes.size || data.completionWarnings.length)) ||
    (body.action === "apply" && data.canApply)
  )
    throw Error(
      "Template instance response misstates its review/apply outcome.",
    );
  return data as BackyTemplateInstanceOutcome;
}
