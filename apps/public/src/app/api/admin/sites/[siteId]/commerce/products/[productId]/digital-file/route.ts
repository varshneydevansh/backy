import { withMediaStorageMutation } from "@/lib/mediaStorageMutation";
import { mediaStorageUsageWithPending } from "@/lib/mediaStorageRecovery";
import {
  resolveMediaUploadPolicy,
  readMediaBillingLimit,
  isUploadAllowedByFileType,
} from "@/lib/mediaUploadPolicy";
import {
  recoverCommercePrivateFile,
  privateFileUploadInput,
} from "@/lib/commercePrivateFileLifecycle";
import { requireAdminAccess } from "@/lib/adminAccess";
import { createHash, randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { CommerceEntitlementError } from "@backy-cms/core";
import {
  buyerAdminAdmission,
  buyerRequestId,
  buyerError,
  buyerJson,
  boundedBuyerBody,
} from "@/lib/commerceEntitlementRoutes";
import { getCommercePrivateStorageContext } from "@/lib/commercePrivateStorage";
import { scanMediaUploadWithProviders } from "@/lib/mediaSafety";
export const runtime = "nodejs";
type Params = { params: Promise<{ siteId: string; productId: string }> };
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
      schemaVersion: "backy.digital-file.v1",
      file: await a.repository.currentFile(a.siteId, p.productId),
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
    const filename = decodeURIComponent(
        request.headers.get("x-backy-file-name") || "",
      ),
      expiresDays = Number(
        request.nextUrl.searchParams.get("expiresDays") || 30,
      ),
      maxDownloads = Number(
        request.nextUrl.searchParams.get("maxDownloads") || 5,
      );
    if (
      !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(
        p.productId,
      ) ||
      !filename ||
      filename.length > 180 ||
      /[\/\\\p{Cc}]/u.test(filename) ||
      !Number.isInteger(expiresDays) ||
      expiresDays < 1 ||
      expiresDays > 365 ||
      !Number.isInteger(maxDownloads) ||
      maxDownloads < 1 ||
      maxDownloads > 100
    )
      throw new CommerceEntitlementError(
        "DIGITAL_FILE_INVALID",
        400,
        "Use a saved digital product, a filename, expiry of1–365 days and download limit of1–100.",
      );
    const products = await a.repositories.collections.getBySlug(
        a.siteId,
        "products",
      ),
      product = products
        ? await a.repositories.collections.getRecordById(
            a.siteId,
            products.id,
            p.productId,
          )
        : null;
    if (!product || product.values?.producttype !== "digital")
      throw new CommerceEntitlementError(
        "DIGITAL_PRODUCT_NOT_FOUND",
        404,
        "Save a digital product in this site first.",
      );
    const bytes = await boundedBuyerBody(request, 3145728);
    if (!bytes.length)
      throw new CommerceEntitlementError(
        "DIGITAL_FILE_INVALID",
        400,
        "Empty files are unavailable.",
      );
    return await withMediaStorageMutation(
      a.repositories.media,
      a.siteId,
      id,
      async () => {
        const settings = await a.repositories.settings.get(),
          policy = resolveMediaUploadPolicy(settings),
          usage = await mediaStorageUsageWithPending(a.siteId, a.repositories),
          next = usage + bytes.length;
        if (
          bytes.length > policy.maxUploadBytes ||
          !isUploadAllowedByFileType(policy, {
            filename,
            mimeType:
              request.headers.get("content-type") || "application/octet-stream",
          })
        )
          throw new CommerceEntitlementError(
            "DIGITAL_FILE_POLICY_DENIED",
            413,
            "Private file exceeds the configured size or file type policy.",
          );
        if (readMediaBillingLimit(a.site.settings, settings, next).blocked)
          throw new CommerceEntitlementError(
            "BILLING_MEDIA_LIMIT",
            402,
            "Private file would exceed the website billing storage limit.",
          );
        if (next > policy.quotaBytes)
          throw new CommerceEntitlementError(
            "SITE_MEDIA_QUOTA_EXCEEDED",
            413,
            "Private file would exceed the shared website storage quota.",
          );
        await scanMediaUploadWithProviders(
          {
            buffer: bytes,
            originalName: filename,
            mimeType:
              request.headers.get("content-type") || "application/octet-stream",
            mediaType: "other",
          },
          { access: a.access, siteId: a.siteId },
        );
        const context = await getCommercePrivateStorageContext(),
          fileId = randomUUID(),
          path = `sites/${a.siteId}/products/${p.productId}/${fileId}`;
        const job = await a.repository.beginFileUpload(
          a.siteId,
          p.productId,
          {
            id: fileId,
            filename,
            sizeBytes: bytes.length,
            storagePath: path,
            binaryFingerprint: createHash("sha256").update(bytes).digest("hex"),
            storageIdentity: context.storageIdentity,
            storageProvider: context.storageProvider,
            expiresDays,
            maxDownloads,
          },
          a.actorId,
        );
        try {
          const uploaded = await context.storage.upload(bytes, {
            path,
            filename,
            mimeType: "application/octet-stream",
            cacheControl: "private, no-store",
            contentDisposition: "attachment",
          });
          if (uploaded.path !== path || uploaded.size !== bytes.length)
            throw new CommerceEntitlementError(
              "DIGITAL_STORAGE_UNVERIFIED",
              503,
              "Private storage did not confirm the planned file. Its recovery evidence and bytes remain reserved.",
            );
          const stat = await context.storage.stat(path),
            stored =
              stat && stat.size === bytes.length
                ? await context.storage.read(path)
                : null;
          if (
            !stored ||
            stored.length !== bytes.length ||
            createHash("sha256").update(stored).digest("hex") !==
              job.binaryFingerprint
          )
            throw new CommerceEntitlementError(
              "DIGITAL_STORAGE_UNVERIFIED",
              503,
              "Private storage did not confirm the planned file bytes. Its evidence and quota remain reserved.",
            );
          const file = await a.repository.registerFile(
            a.siteId,
            p.productId,
            privateFileUploadInput(job),
            a.actorId,
          );
          return buyerJson(
            id,
            { schemaVersion: "backy.digital-file.v1", file },
            201,
          );
        } catch (error) {
          // Resolve a possibly committed metadata result before any physical deletion.
          const outcome = await a.repository
            .privateFileJob(a.siteId, fileId)
            .catch(() => null);
          if (outcome?.state === "registered") {
            const file = await a.repository.currentFile(a.siteId, p.productId);
            if (file?.id === fileId)
              return buyerJson(
                id,
                {
                  schemaVersion: "backy.digital-file.v1",
                  file,
                  completionWarning:
                    "COMMERCE_PRIVATE_REGISTRATION_RESPONSE_RECOVERED",
                },
                201,
              );
          }
          if (outcome && outcome.state !== "registered")
            await recoverCommercePrivateFile(
              a.siteId,
              fileId,
              false,
              a.actorId,
              a.repositories,
            ).catch(() => {});
          throw error;
        }
      },
    );
  } catch (e) {
    return buyerError(id, e);
  }
}
