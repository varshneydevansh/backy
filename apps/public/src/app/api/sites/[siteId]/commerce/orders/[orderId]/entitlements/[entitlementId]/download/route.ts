import { createHash } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { CommerceEntitlementError } from "@backy-cms/core";
import {
  buyerAdmission,
  buyerRequestId,
  buyerError,
  buyerProofHash,
} from "@/lib/commerceEntitlementRoutes";
import { getCommercePrivateStorageContext } from "@/lib/commercePrivateStorage";
export const runtime = "nodejs";
export async function POST(
  request: NextRequest,
  {
    params,
  }: {
    params: Promise<{ siteId: string; orderId: string; entitlementId: string }>;
  },
) {
  const id = buyerRequestId();
  try {
    const p = await params,
      a = await buyerAdmission(p.siteId),
      hash = buyerProofHash(request, a.siteId);
    const result = await a.repository.download(
      a.siteId,
      p.orderId,
      p.entitlementId,
      hash,
      async (f) => {
        let timer: ReturnType<typeof setTimeout> | undefined;
        try {
          return await Promise.race([
            (async () => {
              const context = await getCommercePrivateStorageContext(),
                storage = context.storage;
              if (
                context.storageIdentity !== f.storageIdentity ||
                context.storageProvider !== f.storageProvider
              )
                throw new CommerceEntitlementError(
                  "COMMERCE_PRIVATE_DESTINATION_CHANGED",
                  409,
                  "Restore the matching private storage destination before downloading this version.",
                );
              if (
                !f.storagePath.startsWith(`sites/${a.siteId}/products/`) ||
                f.sizeBytes > 3145728
              )
                throw new CommerceEntitlementError(
                  "BUYER_FILE_INVALID",
                  409,
                  "Private file unavailable.",
                );
              const stat = await storage.stat(f.storagePath);
              if (!stat || stat.size !== f.sizeBytes)
                throw new CommerceEntitlementError(
                  "BUYER_FILE_INVALID",
                  409,
                  "Private file unavailable.",
                );
              const bytes = await storage.read(f.storagePath);
              if (
                bytes.length !== f.sizeBytes ||
                createHash("sha256").update(bytes).digest("hex") !==
                  f.binaryFingerprint
              )
                throw new CommerceEntitlementError(
                  "BUYER_FILE_INVALID",
                  409,
                  "Private file unavailable.",
                );
              return { bytes, filename: f.filename };
            })(),
            new Promise<never>((_, reject) => {
              timer = setTimeout(
                () =>
                  reject(
                    new CommerceEntitlementError(
                      "BUYER_STORAGE_TIMEOUT",
                      503,
                      "Private storage timed out.",
                    ),
                  ),
                15000,
              );
            }),
          ]);
        } finally {
          if (timer) clearTimeout(timer);
        }
      },
    );
    return new NextResponse(new Uint8Array(result.bytes), {
      headers: {
        "Cache-Control": "private, no-store",
        "Content-Type": "application/octet-stream",
        "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(result.filename)}`,
        "Content-Length": String(result.bytes.length),
        "X-Content-Type-Options": "nosniff",
        "Content-Security-Policy": "sandbox; default-src 'none'",
        Vary: "Authorization, X-Backy-Order-Status-Token",
        "X-Request-Id": id,
      },
    });
  } catch (e) {
    return buyerError(id, e);
  }
}
