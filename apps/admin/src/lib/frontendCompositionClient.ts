import type {
  FrontendCompositionImportRequest,
  FrontendCompositionReview,
  FrontendCompositionApplyResult,
} from "@backy-cms/core";
import { adminFetch, getAdminApiBase } from "./adminContentApi";
export async function requestCompositionImport(
  siteId: string,
  body: FrontendCompositionImportRequest,
  signal: AbortSignal,
  request: typeof fetch = adminFetch,
): Promise<FrontendCompositionReview | FrontendCompositionApplyResult> {
  const response = await request(
    `${getAdminApiBase()}/sites/${encodeURIComponent(siteId)}/frontend-design/composition-import`,
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
    throw new Error(
      payload?.error?.message ||
        "Composition request failed. Review again and retry.",
    );
  const expected =
    body.action === "review"
      ? "backy.frontend-composition-review.v1"
      : "backy.frontend-composition-applied.v1";
  if (
    payload.data.schemaVersion !== expected ||
    typeof payload.data.reviewVersion !== "string" ||
    !/^composition-v1:[a-f0-9]{64}$/.test(payload.data.reviewVersion)
  )
    throw new Error("Composition response is invalid. Review again.");
  return payload.data;
}
