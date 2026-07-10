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
      { status: error.status, headers: { "cache-control": "no-store" } },
    );
  }
  throw error;
};

const privateJson = (body: unknown, status = 200) =>
  NextResponse.json(body, { status, headers: { "cache-control": "no-store" } });

const statusCookieName = "backy_order_status";

const statusCookie = (request: Request): { orderId: string; token: string } | null => {
  const raw = (request.headers.get("cookie") || "")
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${statusCookieName}=`))
    ?.slice(statusCookieName.length + 1);
  if (!raw) return null;
  const [orderId, token] = decodeURIComponent(raw).split(".", 2);
  return orderId && token ? { orderId, token } : null;
};

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const orderId = text(url.searchParams.get("orderId"));
    const latest = url.searchParams.get("status") === "latest";
    if (url.searchParams.has("statusToken")) {
      return privateJson({ success: false, error: { code: "status_token_in_url_not_allowed", message: "Order status tokens must use the protected checkout session cookie." } }, 400);
    }
    if (orderId || latest) {
      const access = statusCookie(request);
      if (!access) {
        return privateJson({ success: false, error: { code: "order_status_session_missing", message: "The protected order status session is unavailable." } }, 401);
      }
      if (orderId && orderId !== access.orderId) {
        return privateJson({ success: false, error: { code: "order_status_session_mismatch", message: "The protected order status session does not match this order." } }, 403);
      }
      return privateJson(await backy.commerceOrderStatus(access.orderId, access.token));
    }
    return privateJson(await backy.commerceOrderContract());
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  const payload = asRecord(await request.json().catch(() => ({})));
  if (containsRawPaymentData(payload)) {
    return privateJson(
      {
        success: false,
        error: {
          code: "raw_payment_data_not_allowed",
          message: "Send customer and cart data only. Card details must go directly to the configured checkout provider.",
        },
      },
      400,
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
    return privateJson(
      {
        success: false,
        error: {
          code: "invalid_checkout",
          message: "Customer name, customer email, and at least one product with a quantity from 1 to 999 are required.",
        },
      },
      400,
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
    checkoutOrigin: new URL(request.url).origin,
    idempotencyKey: text(payload.idempotencyKey),
  };

  try {
    const result = await backy.createCommerceOrder(order);
    const data = asRecord(result.data);
    const statusAccess = asRecord(data.statusAccess);
    const orderId = text(statusAccess.orderId) || text(asRecord(data.order).id);
    const statusToken = text(statusAccess.statusToken);
    const safeStatusAccess = { ...statusAccess };
    delete safeStatusAccess.statusToken;
    const response = privateJson({
      ...result,
      data: {
        ...data,
        statusAccess: {
          ...safeStatusAccess,
          tokenReturnedOnce: false,
          tokenStoredInHttpOnlyCookie: Boolean(orderId && statusToken),
        },
      },
    }, 201);
    if (orderId && statusToken) {
      response.cookies.set(statusCookieName, `${orderId}.${statusToken}`, {
        httpOnly: true,
        secure: new URL(request.url).protocol === "https:",
        sameSite: "lax",
        path: "/api/backy-checkout",
        maxAge: 90 * 24 * 60 * 60,
      });
    }
    return response;
  } catch (error) {
    return errorResponse(error);
  }
}
