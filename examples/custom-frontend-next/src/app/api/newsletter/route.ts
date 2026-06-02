import { NextResponse } from "next/server";

import { backy } from "../../../lib/backy";
import { BackyApiError } from "../../../lib/backy-client";

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

export async function DELETE(request: Request) {
  const payload = asRecord(await request.json().catch(() => ({})));
  const values = asRecord(payload.values);
  const input = Object.keys(values).length > 0 ? values : payload;
  const email = typeof input.email === "string" ? input.email.trim() : "";

  if (!email) {
    return NextResponse.json(
      {
        success: false,
        error: { code: "invalid_newsletter_unsubscribe", message: "Email is required." },
      },
      { status: 400 },
    );
  }

  try {
    const response = await backy.unsubscribeNewsletter({
      values: {
        email,
        formId: typeof input.formId === "string" ? input.formId : undefined,
        source:
          typeof input.source === "string"
            ? input.source
            : "custom-frontend-next-starter",
        signup_source:
          typeof input.signup_source === "string"
            ? input.signup_source
            : undefined,
      },
    });

    return NextResponse.json(response);
  } catch (error) {
    if (error instanceof BackyApiError && error.code === "NEWSLETTER_SUBSCRIBER_NOT_FOUND") {
      return NextResponse.json({
        success: true,
        data: {
          status: "unsubscribed",
          email,
          idempotent: true,
        },
      });
    }

    if (error instanceof BackyApiError) {
      return NextResponse.json(
        {
          success: false,
          requestId: error.requestId,
          error: {
            code: error.code,
            message: error.message,
          },
        },
        { status: error.status },
      );
    }

    throw error;
  }
}
