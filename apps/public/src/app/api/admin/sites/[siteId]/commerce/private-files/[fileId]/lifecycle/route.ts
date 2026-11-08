import { NextRequest, NextResponse } from "next/server";
import { CommerceEntitlementError } from "@backy-cms/core";
import { requireAdminAccess } from "@/lib/adminAccess";
import {
  buyerAdminAdmission,
  buyerError,
  buyerJson,
  buyerRequestId,
  boundedBuyerBody,
} from "@/lib/commerceEntitlementRoutes";
import { withMediaStorageMutation } from "@/lib/mediaStorageMutation";
import { recoverCommercePrivateFile } from "@/lib/commercePrivateFileLifecycle";
export const runtime = "nodejs";
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ siteId: string; fileId: string }> },
) {
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
        (await boundedBuyerBody(request, 1024)).toString("utf8"),
      );
    } catch {
      throw new CommerceEntitlementError(
        "COMMERCE_PRIVATE_ACTION_INVALID",
        400,
        "Use a JSON recovery or retirement action.",
      );
    }
    if (!["recover", "retire"].includes(body.action))
      throw new CommerceEntitlementError(
        "COMMERCE_PRIVATE_ACTION_INVALID",
        400,
        "Use recover or retire.",
      );
    return await withMediaStorageMutation(
      a.repositories.media,
      a.siteId,
      id,
      async () =>
        buyerJson(id, {
          schemaVersion: "backy.private-file-recovery.v1",
          ...(await recoverCommercePrivateFile(
            a.siteId,
            p.fileId,
            body.action === "retire",
            a.actorId,
            a.repositories,
          )),
        }),
    );
  } catch (e) {
    return buyerError(id, e);
  }
}
