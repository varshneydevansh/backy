import { requireAdminAccess } from "@/lib/adminAccess";
import { NextRequest, NextResponse } from "next/server";
import { CommerceEntitlementError } from "@backy-cms/core";
import {
  buyerAdminAdmission,
  buyerRequestId,
  buyerError,
  buyerJson,
  boundedBuyerBody,
} from "@/lib/commerceEntitlementRoutes";
export const runtime = "nodejs";
type Params = { params: Promise<{ siteId: string; orderId: string }> };
export async function GET(request: NextRequest, { params }: Params) {
  const id = buyerRequestId();
  try {
    const access = await requireAdminAccess(request, id, {
      permission: "commerce.view",
    });
    if (access instanceof NextResponse) return access;
    const p = await params,
      a = await buyerAdminAdmission(access, p.siteId);
    return buyerJson(id, {
      schemaVersion: "backy.buyer-order.v1",
      ...(await a.repository.order(a.siteId, p.orderId, null)),
    });
  } catch (e) {
    return buyerError(id, e);
  }
}
export async function POST(request: NextRequest, { params }: Params) {
  const id = buyerRequestId();
  try {
    const access = await requireAdminAccess(request, id, {
      permission: "commerce.edit",
    });
    if (access instanceof NextResponse) return access;
    const p = await params,
      a = await buyerAdminAdmission(access, p.siteId);
    let body: any;
    try {
      body = JSON.parse(
        (await boundedBuyerBody(request, 2048)).toString("utf8"),
      );
    } catch (e) {
      if (e instanceof CommerceEntitlementError) throw e;
      throw new CommerceEntitlementError(
        "BUYER_BODY_INVALID",
        400,
        "Valid JSON required.",
      );
    }
    if (body.action !== "revoke" || typeof body.entitlementId !== "string")
      throw new CommerceEntitlementError(
        "BUYER_ACTION_INVALID",
        400,
        "Use revoke with an entitlement ID.",
      );
    return buyerJson(id, {
      schemaVersion: "backy.buyer-order.v1",
      ...(await a.repository.revoke(
        a.siteId,
        p.orderId,
        body.entitlementId,
        a.actorId,
      )),
    });
  } catch (e) {
    return buyerError(id, e);
  }
}
