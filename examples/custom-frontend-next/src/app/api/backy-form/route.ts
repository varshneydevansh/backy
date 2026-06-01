import { NextResponse } from "next/server";

import { buildBackyFormSubmissionInput } from "@backy/sdk-js";

import { backy } from "../../../lib/backy";

const asRecord = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};

export async function POST(request: Request) {
  const contentType = request.headers.get("content-type") || "";
  const payload = contentType.includes("application/json")
    ? asRecord(await request.json().catch(() => ({})))
    : Object.fromEntries((await request.formData()).entries());
  const formId = typeof payload.formId === "string" ? payload.formId.trim() : "";

  if (!formId) {
    return NextResponse.json(
      { success: false, error: { code: "missing_form_id", message: "A Backy form id is required." } },
      { status: 400 },
    );
  }

  const definition = await backy.formDefinition(formId);
  const submission = buildBackyFormSubmissionInput(definition.data.form, payload, {
    includeUnmappedValues: false,
    startedAt: Date.now(),
  });
  const response = await backy.submitForm(formId, submission);

  return NextResponse.json(response);
}
