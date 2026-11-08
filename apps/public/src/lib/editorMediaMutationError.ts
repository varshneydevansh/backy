import { NextResponse } from "next/server";

/** Translate known document/media admission failures without exposing SQL or provider errors. */
export function editorMediaMutationErrorResponse(error: unknown, requestId: string): NextResponse | null {
  if (!error || typeof error !== "object") return null;
  const cause = error as Record<string, unknown>;
  const code = cause.code;
  if (code === "INVALID_EDITOR_MEDIA_REFERENCE") {
    const details = cause.details && typeof cause.details === "object"
      ? cause.details as Record<string, unknown> : cause;
    const mediaId = typeof details.mediaId === "string" ? details.mediaId : undefined;
    const path = typeof details.path === "string" ? details.path : undefined;
    return NextResponse.json({ success: false, requestId, error: {
      code, message: "The managed media ID is unavailable in this site. Select or upload a same-site asset.",
      ...(mediaId && path ? { details: { mediaId, path } } : {}),
    } }, { status: 400, headers: { "Cache-Control": "no-store" } });
  }
  if (code !== "MEDIA_STORAGE_MUTATION_BUSY" && code !== "MEDIA_STORAGE_LOCK_UNAVAILABLE") return null;
  return NextResponse.json({ success: false, requestId, error: {
    code,
    message: code === "MEDIA_STORAGE_MUTATION_BUSY"
      ? "Another file or content operation is in progress. Your changes were not saved. Try saving again."
      : "Content and file linking is temporarily unavailable. Your changes were not saved.",
  } }, { status: 503, headers: { "Cache-Control": "no-store", ...(code === "MEDIA_STORAGE_MUTATION_BUSY" ? { "Retry-After": "1" } : {}) } });
}
