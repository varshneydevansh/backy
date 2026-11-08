import { createHash, randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { CommerceEntitlementError } from "@backy-cms/core";
import type { AdminAccessContext } from "./adminAccess";
import {
  getRequiredDatabaseRepositories,
  shouldUseDemoStoreFallback,
} from "./repositoryRuntime";
export const buyerRequestId = () => "req_" + randomUUID();
export const buyerJson = (requestId: string, data: unknown, status = 200) =>
  NextResponse.json(
    { success: true, requestId, data },
    {
      status,
      headers: {
        "Cache-Control": "private, no-store",
        Vary: "Authorization, X-Backy-Order-Status-Token",
      },
    },
  );
export const buyerError = (requestId: string, error: unknown) => {
  const e =
    error instanceof CommerceEntitlementError
      ? error
      : new CommerceEntitlementError(
          "BUYER_OPERATION_UNAVAILABLE",
          503,
          "Private fulfilment is unavailable. Reload before retrying.",
        );
  return NextResponse.json(
    { success: false, requestId, error: { code: e.code, message: e.message } },
    { status: e.status, headers: { "Cache-Control": "private, no-store" } },
  );
};
export async function buyerAdmission(identifier: string, published = true) {
  if (shouldUseDemoStoreFallback())
    throw new CommerceEntitlementError(
      "BUYER_PERSISTED_RUNTIME_REQUIRED",
      503,
      "Paid downloads require the persisted PostgreSQL runtime.",
    );
  const repositories = await getRequiredDatabaseRepositories(),
    site =
      (await repositories.sites.getById(identifier)) ||
      (await repositories.sites.getBySlug(identifier));
  if (!site || (published && !site.isPublished))
    throw new CommerceEntitlementError(
      "SITE_NOT_FOUND",
      404,
      "Published site unavailable.",
    );
  if (!repositories.commerceEntitlements)
    throw new CommerceEntitlementError(
      "BUYER_ENTITLEMENTS_UNAVAILABLE",
      503,
      "Private fulfilment repository unavailable.",
    );
  return {
    repository: repositories.commerceEntitlements,
    siteId: site.id,
    site,
    repositories,
  };
}
export async function buyerAdminAdmission(
  access: AdminAccessContext,
  identifier: string,
) {
  const admitted = await buyerAdmission(identifier, false);
  return { ...admitted, actorId: access.session?.user.id || null, access };
}
export function buyerProofHash(request: NextRequest, siteId: string) {
  const bearer = request.headers
    .get("authorization")
    ?.match(/^Bearer\s+(.+)$/i)?.[1]
    ?.trim();
  const token =
    request.headers.get("x-backy-order-status-token")?.trim() || bearer || "";
  if (token.length < 20 || token.length > 200)
    throw new CommerceEntitlementError(
      "BUYER_ORDER_UNAVAILABLE",
      403,
      "Buyer order proof unavailable.",
    );
  return createHash("sha256")
    .update(`backy.order-status:${siteId}:${token}`)
    .digest("hex");
}
export async function boundedBuyerBody(
  request: NextRequest,
  maximum: number,
): Promise<Buffer> {
  if (Number(request.headers.get("content-length")) > maximum)
    throw new CommerceEntitlementError(
      "BUYER_BODY_TOO_LARGE",
      413,
      "Request exceeds its size limit.",
    );
  const reader = request.body?.getReader();
  if (!reader)
    throw new CommerceEntitlementError(
      "BUYER_BODY_REQUIRED",
      400,
      "Request body required.",
    );
  let total = 0;
  const chunks: Uint8Array[] = [];
  try {
    while (true) {
      const part = await reader.read();
      if (part.done) break;
      total += part.value.length;
      if (total > maximum) {
        await reader.cancel();
        throw new CommerceEntitlementError(
          "BUYER_BODY_TOO_LARGE",
          413,
          "Request exceeds its size limit.",
        );
      }
      chunks.push(part.value);
    }
  } finally {
    reader.releaseLock();
  }
  return Buffer.concat(chunks);
}
