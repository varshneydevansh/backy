import { NextRequest } from "next/server";
import {
  buyerAdmission,
  buyerRequestId,
  buyerError,
  buyerJson,
  buyerProofHash,
} from "@/lib/commerceEntitlementRoutes";
export const runtime = "nodejs";
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ siteId: string; orderId: string }> },
) {
  const id = buyerRequestId();
  try {
    const p = await params,
      a = await buyerAdmission(p.siteId);
    return buyerJson(id, {
      schemaVersion: "backy.buyer-order.v1",
      ...(await a.repository.order(
        a.siteId,
        p.orderId,
        buyerProofHash(request, a.siteId),
      )),
      historyScope: "presented-order-proof",
      settlementBoundary:
        "authoritative-persisted-paid-state;provider-certification-separate",
    });
  } catch (e) {
    return buyerError(id, e);
  }
}
