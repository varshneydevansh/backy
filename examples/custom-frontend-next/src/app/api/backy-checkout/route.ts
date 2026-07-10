import { NextResponse } from "next/server";

import { backy } from "../../../lib/backy";
import { BackyApiError, type BackyCommerceOrderInput } from "../../../lib/backy-client";

const asRecord = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};

const text = (value: unknown): string =>
  typeof value === "string" ? value.trim() : "";

const forbiddenPaymentKeys = new Set([
  "card",
  "cardnumber",
  "cvc",
  "cvv",
  "expiry",
  "expiration",
  "pan",
]);

const containsRawPaymentData = (value: unknown): boolean => {
  if (Array.isArray(value)) return value.some(containsRawPaymentData);
  if (!value || typeof value !== "object") return false;
  return Object.entries(value as Record<string, unknown>).some(([key, nested]) =>
    forbiddenPaymentKeys.has(key.replace(/[^a-z]/gi, "").toLowerCase()) || containsRawPaymentData(nested),
  );
};

const errorResponse = (error: unknown) => {
  if (error instanceof BackyApiError) {
    return NextResponse.json(
      {
        success: false,
        requestId: error.requestId,
        error: { code: error.code, message: error.message },
      },
      { status: error.status },
    );
  }
  throw error;
};

export async function GET() {
  try {
    return NextResponse.json(await backy.commerceOrderContract());
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  const payload = asRecord(await request.json().catch(() => ({})));
  if (containsRawPaymentData(payload)) {
    return NextResponse.json(
      {
        success: false,
        error: {
          code: "raw_payment_data_not_allowed",
          message: "Send customer and cart data only. Card details must go directly to the configured checkout provider.",
        },
      },
      { status: 400 },
    );
  }

  const customer = asRecord(payload.customer);
  const items = Array.isArray(payload.items) ? payload.items.map(asRecord) : [];
  const normalizedItems = items
    .map((item) => ({
      productId: text(item.productId),
      slug: text(item.slug),
      variantId: text(item.variantId),
      sku: text(item.sku),
      quantity: Number(item.quantity || 1),
    }))
    .filter((item) => item.productId || item.slug || item.sku);

  const invalidQuantity = normalizedItems.some(
    (item) => !Number.isInteger(item.quantity) || item.quantity < 1 || item.quantity > 999,
  );

  if (!text(customer.name) || !text(customer.email) || normalizedItems.length === 0 || invalidQuantity) {
    return NextResponse.json(
      {
        success: false,
        error: {
          code: "invalid_checkout",
          message: "Customer name, customer email, and at least one product with a quantity from 1 to 999 are required.",
        },
      },
      { status: 400 },
    );
  }

  const order: BackyCommerceOrderInput = {
    customer: {
      name: text(customer.name),
      email: text(customer.email),
      phone: text(customer.phone) || undefined,
    },
    items: normalizedItems,
    shippingAddress: text(payload.shippingAddress) || undefined,
    billingAddress: text(payload.billingAddress) || undefined,
    notes: text(payload.notes) || undefined,
    discountCode: text(payload.discountCode) || undefined,
    requestId: text(payload.requestId) || undefined,
  };

  try {
    return NextResponse.json(await backy.createCommerceOrder(order));
  } catch (error) {
    return errorResponse(error);
  }
}
