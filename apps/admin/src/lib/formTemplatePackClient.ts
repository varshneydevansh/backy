import type {
  FormTemplatePackImportRequest,
  FormTemplatePackReview,
  FormTemplatePackApplied,
} from "@backy-cms/core";
import { adminFetch, getAdminApiBase } from "./adminContentApi";
export async function requestFormTemplatePackImport(
  siteId: string,
  body: FormTemplatePackImportRequest,
  signal: AbortSignal,
  request: typeof fetch = adminFetch,
): Promise<FormTemplatePackReview | FormTemplatePackApplied> {
  const response = await request(
    `${getAdminApiBase()}/sites/${encodeURIComponent(siteId)}/forms/template-pack/import`,
    {
      method: "POST",
      credentials: "include",
      signal,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    },
  );
  const payload = await response.json();
  signal.throwIfAborted();
  if (
    !response.ok ||
    payload?.success !== true ||
    payload.data?.siteId !== siteId
  )
    throw Object.assign(
      new Error(
        payload?.error?.message || "Import request failed. Review again.",
      ),
      { code: payload?.error?.code },
    );
  const expected =
    body.action === "review"
      ? "backy.form-template-pack-review.v1"
      : "backy.form-template-pack-applied.v1";
  if (
    payload.data.schemaVersion !== expected ||
    !/^form-pack-v1:[a-f0-9]{64}$/.test(payload.data.reviewVersion)
  )
    throw new Error("Invalid import response. Review again.");
  return payload.data;
}
