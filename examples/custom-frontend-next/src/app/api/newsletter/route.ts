import { NextResponse } from "next/server";

import { backy } from "../../../lib/backy";

const asRecord = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};

export async function POST(request: Request) {
  const payload = asRecord(await request.json().catch(() => ({})));
  const email = typeof payload.email === "string" ? payload.email.trim() : "";
  const consent = payload.consent === true || payload.consent === "true";

  if (!email || !consent) {
    return NextResponse.json(
      { success: false, error: { code: "invalid_newsletter_signup", message: "Email and consent are required." } },
      { status: 400 },
    );
  }

  const response = await backy.subscribeNewsletter({
    values: {
      email,
      consent,
      name: typeof payload.name === "string" ? payload.name : undefined,
      topics: typeof payload.topics === "string" ? payload.topics : undefined,
      source: "custom-frontend-next-starter",
      consentText: "Visitor consented to receive newsletter email.",
    },
  });

  return NextResponse.json(response);
}
