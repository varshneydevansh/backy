import { CommerceEntitlementError } from "@backy-cms/core";
import { NextRequest, NextResponse } from "next/server";
import { requireAdminAccess } from "@/lib/adminAccess";
import {
  buyerAdminAdmission,
  buyerError,
  buyerJson,
  buyerRequestId,
} from "@/lib/commerceEntitlementRoutes";
export const runtime = "nodejs";
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ siteId: string }> },
) {
  const id = buyerRequestId();
  try {
    const access = await requireAdminAccess(request, id, {
      permission: "commerce.view",
    });
    if (access instanceof NextResponse) return access;
    const p = await params,
      a = await buyerAdminAdmission(access, p.siteId),
      limit = Number(request.nextUrl.searchParams.get("limit") || 25),
      offset = Number(request.nextUrl.searchParams.get("offset") || 0);
    if (
      !Number.isInteger(limit) ||
      limit < 1 ||
      limit > 100 ||
      !Number.isInteger(offset) ||
      offset < 0
    )
      throw new CommerceEntitlementError(
        "COMMERCE_PRIVATE_PAGINATION_INVALID",
        400,
        "Use limit1–100 and a nonnegative integer offset.",
      );
    const page = await a.repository.privateFileVersions(
      a.siteId,
      limit,
      offset,
    );
    return buyerJson(id, {
      schemaVersion: "backy.private-file-storage.v1",
      files: page.items,
      pagination: {
        total: page.total,
        limit,
        offset,
        hasMore: offset + page.items.length < page.total,
      },
      reservedAndRetainedBytes: await a.repository.fileStorageUsage(a.siteId),
      maxUploadBytes: 3145728,
      retention:
        "All checkout snapshots and entitlements protect immutable versions, including pending orders. Unknown storage outcomes retain quota until exact destination and byte removal are verified.",
    });
  } catch (e) {
    return buyerError(id, e);
  }
}
